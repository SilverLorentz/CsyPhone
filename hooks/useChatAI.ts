
import { useState,useRef,useCallback,type Dispatch,type SetStateAction } from 'react';
import { CharacterProfile,UserProfile,Message,Emoji,EmojiCategory,GroupProfile,RealtimeConfig,type PhotoHintTrigger } from '../types';
import { DB } from '../utils/db';
import { ChatPrompts } from '../utils/chatPrompts';
import { ChatParser,BILINGUAL_MARKER } from '../utils/chatParser';
import { safeFetchJson,safeResponseJson } from '../utils/safeApi';
import { haptic,playThemeNotification } from '../utils/haptics';
import { THEME_PLUGINS } from '../components/chat/ThemeRegistry';
import { VectorMemoryExtractor } from '../utils/vectorMemoryExtractor';
import { MindSnapshotExtractor,type AfterglowGenerationOptions,type SecondaryFullContextOptions } from '../utils/mindSnapshotExtractor';
import { loadCharacterGoals, formatGoalListStr } from '../utils/goalService';
import { EventExtractor } from '../utils/eventExtractor';
import { extractThinking, safeThinkingFallbackReply } from '../utils/thinkingExtractor';
import { isDeepSeekMode } from '../utils/deepseekPrompts';
import { DEFAULT_CHAT_TEMPERATURE,getEmbeddingConfig,normalizeChatTemperature,selectSecondaryApiConfig } from '../utils/runtimeConfig';
import {
    ApiRequestDedupedError,
    isApiRequestDedupePending,
    trackedApiRequest,
    type ApiRequestTraceMeta,
} from '../utils/apiRequestLedger';
import { BackendAgentManager, buildContextSnapshot } from '../utils/autonomousAgent';
import {
    generateAgentScheduleRevision,
    TODAY_SCHEDULE_UPDATED_EVENT_NAME,
    type AgentScheduleSignal,
} from '../utils/agentBackendClient';
import type { HandlerContext } from './handlers/types';
import { handleRecall } from './handlers/handleRecall';
import { handleSearch } from './handlers/handleSearch';
import { handleWeiboSearch } from './handlers/handleWeiboSearch';
import { handleDiaryWrite } from './handlers/handleDiaryWrite';
import { handleDiaryRead } from './handlers/handleDiaryRead';
import { handleFeishuDiary } from './handlers/handleFeishuDiary';
import { handleFeishuDiaryRead } from './handlers/handleFeishuDiaryRead';
import { handleCanvaActions } from './handlers/handleCanvaActions';
import { handleXhsActions } from './handlers/handleXhsActions';
import type { SongCardMetadata } from '../types/music';
import { searchSongs } from '../utils/musicService';
import { getCurrentPlayback } from './useAudioPlayer';
import {
    getPlaybackLyricKey,
    getPlayableLyricSnapshot,
    shouldInjectPlaybackLyricSnapshot,
} from '../utils/playbackLyricsRuntime';
import {
    buildPhotoHintFromDecision,
    extractPhotoDecision,
    extractPhotoHint,
    inferExplicitPhotoDecisionFromConversation,
} from '../utils/photoGeneration';
import { shouldInjectPlaybackContextFromState } from '../utils/playbackContextRuntime';
import { showLocalNotification } from '../utils/localNotification';
import { getChatBackgroundNotificationsEnabled } from '../utils/chatBackgroundNotifications';
import { saveChatContextMirror } from '../utils/chatContextMirror';
import { formatNotificationBody } from '../utils/notificationPreview';
import type { StatusCardData } from '../types/statusCard';

interface UseChatAIProps {
    char: CharacterProfile | undefined;
    userProfile: UserProfile;
    apiConfig: any;
    groups: GroupProfile[];
    emojis: Emoji[];
    categories: EmojiCategory[];
    addToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    setMessages: Dispatch<SetStateAction<Message[]>>; // Callback to update UI messages
    realtimeConfig?: RealtimeConfig; // 新增：实时配置
    translationConfig?: { enabled: boolean; sourceLang: string; targetLang: string };
    autoVoice?: boolean; // 开启后向 AI 注入语音消息格式指引
    onVoiceMessageSaved?: (msgId: number, text: string) => void; // 语音消息保存后的回调（用于触发 TTS）
    autoCall?: boolean; // 开启后向 AI 注入主动来电指引
    onIncomingCall?: (mode: string, callReason: string) => void; // AI 触发来电时的回调
    autoShareSong?: boolean; // 开启后向 AI 注入歌曲分享指引
    injectPlaybackContext?: boolean; // 开启后向 AI 注入当前播放歌曲上下文
    autoPhoto?: boolean; // 开启后允许 AI 输出内部 photo_hint
    onPhotoHint?: (payload: PhotoHintTrigger) => void;
    onMoodUpdate?: (charId: string, moodState: any, statusCardData?: any) => void; // MindSnapshot / CreativeCard 完成后回调
}

interface TriggerAIOptions {
    transientUserPrompt?: string;
}

interface AfterglowTriggerOptions {
    sourceMessage?: Message;
    currentMsgs?: Message[];
    afterglowOptions?: AfterglowGenerationOptions;
    userInitiated?: boolean;
    silent?: boolean;
}

class ChatStreamError extends Error {
    partialContent: string;

    constructor(message: string, partialContent = '') {
        super(message);
        this.name = 'ChatStreamError';
        this.partialContent = partialContent;
    }
}

function appendTextToChatContent(content: any, text: string): any {
    if (!text) return content;
    if (typeof content === 'string') return `${content}${text}`;
    if (Array.isArray(content)) return [...content, { type: 'text', text }];
    return `${String(content || '')}${text}`;
}

function cleanTextFromChatContent(content: any, patterns: RegExp[]): any {
    const clean = (value: string) => patterns.reduce((text, pattern) => text.replace(pattern, ''), value);
    if (typeof content === 'string') return clean(content);
    if (Array.isArray(content)) {
        return content.map(part => {
            if (part?.type === 'text' && typeof part.text === 'string') {
                return { ...part, text: clean(part.text) };
            }
            return part;
        });
    }
    return content;
}

function appendTextToLastUserMessage(messages: any[], text: string): boolean {
    const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx < 0) return false;
    messages[lastUserIdx].content = appendTextToChatContent(messages[lastUserIdx].content, text);
    return true;
}

function compareMessagesByTimeline(a: Message, b: Message): number {
    return (a.timestamp || 0) - (b.timestamp || 0) || (a.id || 0) - (b.id || 0);
}

function isSameContextMessage(a: Message, b: Message): boolean {
    return a.id === b.id || (
        a.charId === b.charId
        && a.role === b.role
        && a.type === b.type
        && a.timestamp === b.timestamp
        && a.content === b.content
    );
}

function mergeDbHistoryWithLiveUserMessages(dbHistory: Message[], liveMessages: Message[], limit: number): Message[] {
    if (dbHistory.length === 0) return liveMessages.slice(-limit);

    const latestDbTimestamp = dbHistory.reduce((latest, message) => Math.max(latest, message.timestamp || 0), 0);
    const missingLiveUserMessages = liveMessages.filter(message => (
        message.role === 'user'
        && (message.timestamp || 0) >= latestDbTimestamp
        && !dbHistory.some(dbMessage => isSameContextMessage(dbMessage, message))
    ));

    if (missingLiveUserMessages.length === 0) return dbHistory;
    return [...dbHistory, ...missingLiveUserMessages]
        .sort(compareMessagesByTimeline)
        .slice(-limit);
}

function cloneChatMessageForRetry(message: any): any {
    if (!Array.isArray(message?.content)) return { ...message };
    return {
        ...message,
        content: message.content.map((part: any) => (
            part && typeof part === 'object' ? { ...part } : part
        )),
    };
}

function extractStreamTextDelta(payload: any): string {
    const choice = payload?.choices?.[0];
    const delta = choice?.delta;
    return (
        delta?.content ||
        delta?.text ||
        choice?.text ||
        choice?.message?.content ||
        ''
    );
}

function extractStreamThinkingDelta(payload: any): string {
    const delta = payload?.choices?.[0]?.delta;
    return (
        delta?.reasoning_content ||
        delta?.thinking ||
        delta?.reasoning ||
        ''
    );
}

function buildStreamingPreviewContent(content: string, usePrefill: boolean, thinkTag: string): string {
    const contentForExtraction = usePrefill && !content.includes('<thinking>') && !content.includes('<think>')
        ? `<${thinkTag}>\n${content}`
        : content;
    const extracted = extractThinking(contentForExtraction);
    return ChatParser.sanitize(extracted.content).trim();
}

async function fetchStreamingChatCompletion(
    url: string,
    init: RequestInit,
    onPreview: (content: string) => void,
    trace?: ApiRequestTraceMeta,
): Promise<any> {
    const run = async (): Promise<any> => {
    let content = '';
    let reasoningContent = '';
    let usage: any = null;
    let finishReason: string | null = null;

    try {
        const response = await fetch(url, init);
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new ChatStreamError(`API Error ${response.status}: ${text.slice(0, 200)}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!response.body || contentType.includes('application/json')) {
            return await safeResponseJson(response);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const consumeLine = (line: string): boolean => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) return false;

            const data = trimmed.startsWith('data:')
                ? trimmed.slice(5).trim()
                : trimmed;
            if (!data) return false;
            if (data === '[DONE]') return true;

            try {
                const payload = JSON.parse(data);
                usage = payload.usage || usage;
                finishReason = payload.choices?.[0]?.finish_reason || finishReason;

                const thinkingDelta = extractStreamThinkingDelta(payload);
                if (thinkingDelta) reasoningContent += thinkingDelta;

                const delta = extractStreamTextDelta(payload);
                if (delta) {
                    content += delta;
                    onPreview(content);
                }
            } catch {
                // Some providers send comments or non-JSON keepalive lines in the same stream.
            }
            return false;
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';

            let shouldStop = false;
            for (const line of lines) {
                shouldStop = consumeLine(line) || shouldStop;
            }
            if (shouldStop) break;
        }

        if (buffer.trim()) consumeLine(buffer);

        return {
            choices: [{
                message: {
                    content,
                    reasoning_content: reasoningContent,
                },
                finish_reason: finishReason || 'stop',
            }],
            usage,
        };
    } catch (error: any) {
        if (error instanceof ChatStreamError) {
            error.partialContent = error.partialContent || content;
            throw error;
        }
        throw new ChatStreamError(error?.message || '流式请求失败', content);
    }
    };

    if (trace) return trackedApiRequest({ ...trace, url }, () => run());
    return run();
}

function getPreviousAssistantThinking(messages: Message[], maxLength = 1200): string | undefined {
    for (const message of [...messages].reverse()) {
        if (message.role !== 'assistant') continue;
        const thinking = message.metadata?.thinking;
        if (typeof thinking !== 'string') continue;
        const trimmed = thinking.trim();
        if (trimmed) return trimmed.slice(0, maxLength);
    }
    return undefined;
}

const LEAKED_REPLY_CONTEXT_RE = /(?:引用回复上下文[：:]\s*)?这条消息正在回复[^「」\r\n]{0,60}的消息「([^」\r\n]{1,220})」[。.]?\s*本条消息正文[：:]\s*([\s\S]*)/;

function normalizeLeakedReplyContextForQuote(text: string): string {
    return text.replace(LEAKED_REPLY_CONTEXT_RE, (_match, quotedText: string, body: string) => {
        const quoted = quotedText.trim();
        const content = body.trim();
        return `[[QUOTE: ${quoted}]]${content ? `\n${content}` : ''}`;
    });
}

export const useChatAI = ({
    char,
    userProfile,
    apiConfig,
    groups,
    emojis,
    categories,
    addToast,
    setMessages,
    realtimeConfig,  // 新增
    translationConfig,
    autoVoice,
    onVoiceMessageSaved,
    autoCall,
    onIncomingCall,
    autoShareSong,
    injectPlaybackContext,
    autoPhoto,
    onPhotoHint,
    onMoodUpdate
}: UseChatAIProps) => {

    const [isTyping, setIsTyping] = useState(false);
    const [recallStatus, setRecallStatus] = useState<string>('');
    const [searchStatus, setSearchStatus] = useState<string>('');
    const [diaryStatus, setDiaryStatus] = useState<string>('');
    const [xhsStatus, setXhsStatus] = useState<string>('');
    const [weiboStatus, setWeiboStatus] = useState<string>('');
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);
    const [tokenBreakdown, setTokenBreakdown] = useState<{ prompt: number; completion: number; total: number; msgCount: number; pass: string } | null>(null);
    const isTypingRef = useRef(false);

    // MindSnapshot retry context
    const lastMindSnapshotCtx = useRef<{ char: any; aiContent: string; msgs: Message[]; config: any; goalListStr?: string; contextOptions?: SecondaryFullContextOptions } | null>(null);

    // 跨消息持久化的 noteId→xsecToken 缓存，避免 lastXhsNotes 局部变量每次 triggerAI 都重置
    const xsecTokenCacheRef = useRef<Map<string, string>>(new Map());
    // noteId→title 缓存，用于 detail 失败时重新搜索拿新 token
    const noteTitleCacheRef = useRef<Map<string, string>>(new Map());
    // commentId→userId 缓存，reply_comment 需要 user_id 帮助 MCP 服务端定位评论
    const commentUserIdCacheRef = useRef<Map<string, string>>(new Map());
    // commentId→authorName 缓存，reply 降级为顶级评论时用 @authorName 让回复有上下文
    const commentAuthorNameCacheRef = useRef<Map<string, string>>(new Map());
    // commentId→parentCommentId 缓存，供 reply_comment 传递 parent_comment_id（xiaohongshu-mcp PR#440+）
    const commentParentIdCacheRef = useRef<Map<string, string>>(new Map());
    const lastInjectedPlaybackLyricKeyRef = useRef<string | null>(null);



    const updateTokenUsage = (data: any, msgCount: number, pass: string) => {
        if (data.usage?.total_tokens) {
            setLastTokenUsage(data.usage.total_tokens);
            const breakdown = {
                prompt: data.usage.prompt_tokens || 0,
                completion: data.usage.completion_tokens || 0,
                total: data.usage.total_tokens,
                msgCount,
                pass
            };
            setTokenBreakdown(breakdown);
            console.log(`🔢 [Token Usage] pass=${pass} | prompt=${breakdown.prompt} completion=${breakdown.completion} total=${breakdown.total} | msgs_in_context=${msgCount}`);
        }
    };

    const maybeGenerateScheduleRevision = (
        signal: AgentScheduleSignal,
        reason: string | undefined,
        aiContent: string,
        currentMsgs: Message[],
    ) => {
        if (!char || !apiConfig?.baseUrl || signal === 'none' || signal === 'soft') return;
        const sourceMessageIds = currentMsgs
            .slice(-8)
            .filter(message => message.role === 'user' || message.role === 'assistant')
            .map(message => message.id)
            .filter((id): id is number => typeof id === 'number')
            .map(String);

        setTimeout(() => {
            (async () => {
                try {
                    const freshChar = await DB.getCharacterById(char.id) || char;
                    const contextSnapshot = await buildContextSnapshot(char.id, freshChar);
                    const cleanApiConfig = {
                        baseUrl: apiConfig.baseUrl,
                        apiKey: apiConfig.apiKey || 'sk-none',
                        model: apiConfig.model,
                    };
                    const result = await generateAgentScheduleRevision(char.id, {
                        contextSnapshot,
                        mainApiConfig: cleanApiConfig,
                        scheduleSignal: signal,
                        scheduleReason: reason || '',
                        assistantReply: aiContent.slice(0, 2000),
                        sourceMessageIds,
                    });
                    if (result.rewritten && typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent(TODAY_SCHEDULE_UPDATED_EVENT_NAME, {
                            detail: { charId: char.id, revision: result.revision },
                        }));
                    }
                } catch (error) {
                    console.warn('[TodaySchedule] revision generation skipped:', error instanceof Error ? error.message : error);
                }
            })();
        }, 800);
    };

    const triggerAI = async (currentMsgs: Message[], options: TriggerAIOptions = {}) => {
        if (isTypingRef.current || isTyping || !char) return;
        if (!apiConfig.baseUrl) { alert("请先在设置中配置 API URL"); return; }
        const transientTrigger = Boolean(options.transientUserPrompt?.trim());
        const sourceMessage = currentMsgs
            .slice()
            .reverse()
            .find(message => message.role === 'user' && typeof message.id === 'number' && message.id > 0);
        const sourceMessageId = sourceMessage?.id;
        const mainChatDedupeKey = !transientTrigger && sourceMessageId
            ? `main-chat:${char.id}:${sourceMessageId}`
            : undefined;
        if (isApiRequestDedupePending(mainChatDedupeKey)) {
            console.warn('[ApiLedger] Duplicate main chat request blocked for message:', sourceMessageId);
            return;
        }

        const refreshRecentMessages = async () => {
            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
        };

        isTypingRef.current = true;
        setIsTyping(true);
        setRecallStatus('');

        try {
            const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}` };
            const buildMainChatTrace = (reason: string, retryCount = 0): ApiRequestTraceMeta => ({
                feature: 'chat',
                reason,
                model: apiConfig.model,
                conversationId: char.id,
                messageId: sourceMessageId,
                userInitiated: !transientTrigger,
                dedupeKey: mainChatDedupeKey,
                retryCount,
            });

            // 0. Internal State Layer: senseBefore (和下方 buildSystemPrompt 的 embedding/rerank 并行)
            // Background assistive features must use the secondary API only.
            // Falling back to the primary chat API makes one user message fan out
            // into several primary /chat/completions calls.
            const senseSecondaryConfig = selectSecondaryApiConfig();
            const limit = char.contextLimit || 500;
            let contextMsgs = currentMsgs;
            if (char.id) {
                try {
                    const fullHistory = await DB.getRecentMessagesByCharId(char.id, limit);
                    if (fullHistory.length > 0) {
                        console.log(`📊 [Context] Loaded ${fullHistory.length} msgs from DB (React state had ${currentMsgs.length}, contextLimit=${limit})`);
                        const mergedHistory = mergeDbHistoryWithLiveUserMessages(fullHistory, currentMsgs, limit);
                        if (mergedHistory.length > fullHistory.length) {
                            console.log(`📊 [Context] Merged ${mergedHistory.length - fullHistory.length} live user msg(s) not yet visible in DB history`);
                        }
                        contextMsgs = mergedHistory;
                    }
                } catch (e) {
                    console.error('Failed to load full history from DB, using React state:', e);
                }
            }
            const transientUserPrompt = options.transientUserPrompt?.trim();
            const contextMsgsWithTransient: Message[] = transientUserPrompt
                ? [
                    ...contextMsgs,
                    {
                        id: Date.now(),
                        charId: char.id,
                        role: 'user',
                        type: 'text',
                        content: transientUserPrompt,
                        timestamp: Date.now(),
                        metadata: { source: 'worldline_orb', transient: true },
                    },
                ]
                : contextMsgs;

            const promptContextMsgs = contextMsgsWithTransient.filter(m => {
                const source = m.metadata?.source;
                if (source === 'date' || source === 'theater') {
                    // Only include date/theater messages that are explicit context bridges
                    return !!m.metadata?.isDateContextBridge;
                }
                return true;
            });

            // 0.1 Gamygdala — 加载角色目标（并行，静默降级）
            const goalsPromise = loadCharacterGoals(char.id).catch(e => {
                console.warn('🎯 [Goals] Load failed, degrading gracefully:', e);
                return [] as Awaited<ReturnType<typeof loadCharacterGoals>>;
            });

            // Run senseBefore in parallel with buildSystemPrompt
            const embeddingApiKey = getEmbeddingConfig().apiKey || undefined;
            const playbackContextPromise = injectPlaybackContext
                ? (async () => {
                    const playback = getCurrentPlayback();
                    if (!shouldInjectPlaybackContextFromState(playback)) return null;

                    return {
                        playback,
                        lyricSnapshot: await getPlayableLyricSnapshot(
                            playback.currentSong,
                            playback.currentTime,
                        ),
                    };
                })().catch((error) => {
                    console.error('🎵 [PlaybackContext] Snapshot error:', error);
                    return null;
                })
                : Promise.resolve(null);

            // Await goals before starting parallel sense + prompt build
            const characterGoals = await goalsPromise;
            const goalListStr = formatGoalListStr(characterGoals);
            const previousThinkingForSense = getPreviousAssistantThinking(promptContextMsgs);

            const [senseResult, systemPromptResult, playbackContext] = await Promise.all([
                senseSecondaryConfig?.apiKey
                    ? MindSnapshotExtractor.senseBefore(char, promptContextMsgs, senseSecondaryConfig, goalListStr, characterGoals, {
                        userProfile,
                        contextLimit: limit,
                        allowMirrorLookup: false,
                        previousThinking: previousThinkingForSense,
                    })
                        .catch(e => { console.error('💭 [Sense] Parallel error:', e); return null; })
                    : Promise.resolve(null),
                (async () => {
                    // If senseBefore finishes first and updates char.moodState (via DB persist),
                    // buildCoreContext will pick it up. But since they run in parallel,
                    // we also manually inject body signals after if needed.
                    return ChatPrompts.buildSystemPrompt(char, userProfile, groups, emojis, categories, promptContextMsgs, realtimeConfig, apiConfig, embeddingApiKey, characterGoals, {
                        autoVoice,
                        autoCall,
                        autoShareSong,
                        autoPhoto,
                    });
                })(),
                playbackContextPromise,
            ]);

            let systemPrompt = systemPromptResult;
            const scheduleSignal = (senseResult?.scheduleSignal || 'none') as AgentScheduleSignal;
            const scheduleReason = typeof senseResult?.scheduleReason === 'string'
                ? senseResult.scheduleReason
                : '';

            // If senseBefore returned a new state, update char in memory and notify UI
            if (senseResult && onMoodUpdate) {
                const { scheduleSignal: _scheduleSignal, scheduleReason: _scheduleReason, ...moodForUi } = senseResult as any;
                onMoodUpdate(char.id, moodForUi);
                // Also update the local char ref so subsequent code sees the new state
                char.moodState = moodForUi;
            }

            if (injectPlaybackContext) {
                const playback = playbackContext?.playback;
                if (playback?.currentSong) {
                    const rawLyricSnapshot = playbackContext?.lyricSnapshot ?? null;
                    const lyricSnapshot = rawLyricSnapshot && shouldInjectPlaybackLyricSnapshot(
                        rawLyricSnapshot,
                        lastInjectedPlaybackLyricKeyRef.current,
                    )
                        ? rawLyricSnapshot
                        : null;

                    systemPrompt += ChatPrompts.buildPlaybackContextPrompt(
                        userProfile.name,
                        playback.currentSong,
                        playback.isPlaying,
                        lyricSnapshot,
                    );

                    if (lyricSnapshot) {
                        lastInjectedPlaybackLyricKeyRef.current = getPlaybackLyricKey(lyricSnapshot);
                    }
                }
            }

            // 1.5 Inject bilingual output instruction when translation is enabled
            const bilingualActive = translationConfig?.enabled && translationConfig.sourceLang && translationConfig.targetLang;
            if (bilingualActive) {
                systemPrompt += `\n\n[CRITICAL: 双语输出模式 - 必须严格遵守]
你的每句话都必须用以下XML标签格式输出双语内容：
<翻译>
<原文>${translationConfig.sourceLang}内容</原文>
<译文>${translationConfig.targetLang}内容</译文>
</翻译>

规则：
- 每句话单独包裹一个<翻译>标签
- 多句话就输出多个<翻译>标签，一句一个
- <翻译>标签外不要写任何文字
- 表情包命令 [[SEND_EMOJI: ...]] 放在所有<翻译>标签外面

示例（${translationConfig.sourceLang}→${translationConfig.targetLang}）：
<翻译>
<原文>こんにちは！</原文>
<译文>你好！</译文>
</翻译>
<翻译>
<原文>今日は何する？</原文>
<译文>今天做什么？</译文>
</翻译>`;
            }

            // 2. Build Message History
            // CRITICAL: Load full message history from DB up to contextLimit,
            // not from React state which is capped at 200 for rendering performance
            const { apiMessages, historySlice } = ChatPrompts.buildMessageHistory(promptContextMsgs, limit, char, userProfile, emojis);

            // 2.5 Strip translation content from previous messages to save tokens
            const cleanedApiMessages = apiMessages.map((msg: any) => {
                if (typeof msg.content !== 'string') return msg;
                let c = msg.content;
                // Strip old %%BILINGUAL%% format (both spaced and non-spaced variants)
                const biRe = /%%\s*BILINGUAL\s*%%/i;
                if (biRe.test(c)) {
                    const idx = c.search(biRe);
                    c = c.substring(0, idx).trim();
                }
                // Strip new XML tag format: keep only <原文> content
                if (c.includes('<翻译>')) {
                    c = c.replace(/<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/g, '$1').trim();
                }
                return { ...msg, content: c };
            });

            const contextMirrorMessages = [
                { role: 'system', content: systemPrompt },
                ...cleanedApiMessages.map((msg: any) => ({ ...msg })),
            ];
            const fullMessages = contextMirrorMessages.map((msg: any) => ({ ...msg }));

            // Find the true last user message to attach strict instructions to
            const lastUserIdx = fullMessages.map(m => m.role).lastIndexOf('user');
            
            // 2.55 Inject STT tolerance prompt if last user message is a voice recording
            if (lastUserIdx >= 0) {
                const lastUserMsg = fullMessages[lastUserIdx];
                if (typeof lastUserMsg.content === 'string' && lastUserMsg.content.includes('[🎤用户语音]')) {
                    lastUserMsg.content += '\n\n[系统提示：你刚才听到的语音消息部分文字由设备自动识别，可能存在同音字或漏字，请结合上下文理解原意包容回复]';
                }
            }

            // Debug: Log context composition
            const systemPromptLength = systemPrompt.length;
            const historyMsgCount = cleanedApiMessages.length;
            const historyTotalChars = cleanedApiMessages.reduce((sum: number, m: any) => sum + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
            console.log(`📊 [Context Debug] system_prompt_chars=${systemPromptLength} | history_msgs=${historyMsgCount} | history_chars=${historyTotalChars} | total_msgs_in_array=${fullMessages.length} | contextLimit=${limit}`);

            // 2.6 & 3.0: Attach mandatory format instructions directly to the last user message
            // This prevents "messages must end with user" validation errors on strict proxies
            // when the assistant prefill is disabled or removed during fallback.
            let trailingInstructions = '';
            
            if (bilingualActive) {
                trailingInstructions += `\n\n[Reminder: 每句话必须用 <翻译><原文>...</原文><译文>...</译文></翻译> 标签包裹。一句一个标签。绝对不能省略。]`;
            }

            // 3.0a Prefill injection — force CoT start
            // DeepSeek uses <think>, Gemini/Claude uses <thinking>
            // Controlled via settings to support buggy proxies that block prefill (and eat tokens)
            const usePrefill = !apiConfig.disablePrefill;
            const isDeepSeek = isDeepSeekMode(apiConfig);
            const thinkTag = isDeepSeek ? 'think' : 'thinking';
            if (usePrefill) {
                if (isDeepSeek) {
                    trailingInstructions += `\n\n[思考提示]\n请先在 <think> 内简短思考，闭合 </think> 后输出正文。`;
                } else {
                    trailingInstructions += `\n\n[思考提示]\n请先在 <thinking> 内简短思考，闭合 </thinking> 后输出正文。`;
                }
            }

            if (trailingInstructions) {
                if (!appendTextToLastUserMessage(fullMessages, trailingInstructions)) {
                    fullMessages.push({ role: 'user', content: `[系统执行指令]${trailingInstructions}` });
                }
            }

            if (usePrefill) {
                fullMessages.push({ role: 'assistant', content: `<${thinkTag}>` });
                console.log(`🧩 [Prefill] Injected <${thinkTag}> prefill assistant message`);
            }

            // Claude API 兼容：确保最后一条 assistant 消息无尾部空白
            const sanitizeLast = () => {
                const last = fullMessages[fullMessages.length - 1];
                if (last?.role === 'assistant' && typeof last.content === 'string') {
                    last.content = last.content.trimEnd();
                }
            };
            sanitizeLast();

            const chatTemperature = normalizeChatTemperature(apiConfig.temperature, DEFAULT_CHAT_TEMPERATURE);
            let requestBody: Record<string, any> = {
                model: apiConfig.model,
                messages: fullMessages,
                temperature: chatTemperature,
                stream: false,
            };

            const streamPreviewId = -Math.floor(Date.now() + Math.random() * 1000);
            let streamPreviewVisible = false;
            let lastStreamPreviewAt = 0;
            const clearStreamPreview = () => {
                if (!streamPreviewVisible) return;
                setMessages(prev => prev.filter(message => message.id !== streamPreviewId));
                streamPreviewVisible = false;
            };
            const updateStreamPreview = (rawContent: string, force = false) => {
                const previewContent = buildStreamingPreviewContent(rawContent, usePrefill, thinkTag);
                if (!previewContent) return;
                const now = Date.now();
                if (!force && now - lastStreamPreviewAt < 120) return;
                lastStreamPreviewAt = now;
                streamPreviewVisible = true;

                const previewMessage: Message = {
                    id: streamPreviewId,
                    charId: char.id,
                    role: 'assistant',
                    type: 'text',
                    content: previewContent,
                    timestamp: now,
                    metadata: { streamingPreview: true },
                };

                setMessages(prev => {
                    const existingIndex = prev.findIndex(message => message.id === streamPreviewId);
                    if (existingIndex === -1) return [...prev, previewMessage];
                    return prev.map(message => message.id === streamPreviewId ? previewMessage : message);
                });
            };

            let data: any;
            if (apiConfig.streamChat === true) {
                try {
                    requestBody = { ...requestBody, stream: true };
                    data = await fetchStreamingChatCompletion(
                        `${baseUrl}/chat/completions`,
                        {
                            method: 'POST', headers,
                            body: JSON.stringify(requestBody),
                        },
                        (content) => updateStreamPreview(content),
                        buildMainChatTrace('主聊天回复（流式）'),
                    );
                    updateStreamPreview(data.choices?.[0]?.message?.content || '', true);
                    updateTokenUsage(data, historyMsgCount, 'initial-stream');
                } catch (streamError: any) {
                    clearStreamPreview();
                    if (streamError?.partialContent?.trim()) {
                        throw streamError;
                    }

                    console.warn('[ChatStream] Streaming failed before output, falling back to non-streaming:', streamError?.message || streamError);
                    requestBody = { ...requestBody, stream: false };
                    data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                        method: 'POST', headers,
                        body: JSON.stringify(requestBody)
                    }, 2, buildMainChatTrace('主聊天回复：流式失败后的非流式回退', 1));
                    updateTokenUsage(data, historyMsgCount, 'initial-fallback');
                }
            } else {
                data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                    method: 'POST', headers,
                    body: JSON.stringify(requestBody)
                }, 2, buildMainChatTrace('主聊天回复'));
                updateTokenUsage(data, historyMsgCount, 'initial');
            }

            // 3.5 Check for empty API responses (e.g. content filters, max context limits)
            if (!data.choices || data.choices.length === 0) {
                const errMsg = data.error?.message || data.error || data.msg || JSON.stringify(data);
                throw new Error(`API 返回空结果或拦截: ${errMsg}`);
            }

            // 4. Initial Cleanup
            let aiContent = data.choices[0]?.message?.content || '';
            if (!aiContent.trim()) {
                const finishReason = data.choices[0]?.finish_reason;
                const hint = finishReason ? ` (Finish Reason: ${finishReason})` : '';
                throw new Error(`AI 生成了空白内容。可能是触发了风控拦截，或者超出了该模型的上下文窗口上限${hint}。请尝试清理聊天上下文或更换更大上下文的模型。`);
            }

            // 4.0 Extract thinking chain — try native Gemini thinking field first,
            // then fall back to <thinking>/<think> tag extraction for DeepSeek/Qwen3.
            // Gemini returns thinking in message.reasoning_content or via content_parts.
            const nativeThinking: string = (
                data.choices[0]?.message?.reasoning_content ||
                data.choices[0]?.message?.thinking ||
                ''
            );

            // 4.0a Prefill reconstruction — restore the opening tag
            // ONLY if we used prefill AND the model didn't use the native reasoning channel.
            // (If nativeThinking exists, the text content is pure message, no need to pollute it)
            if (usePrefill && !nativeThinking && !aiContent.includes('<thinking>') && !aiContent.includes('<think>')) {
                aiContent = `<${thinkTag}>\n` + aiContent;
                console.log(`🧩 [Prefill] Reconstructed <${thinkTag}> tag onto response (Fallback mode)`);
            }

            console.log(`🧠 [ThinkingDebug] useGeminiJailbreak=${apiConfig.useGeminiJailbreak} | raw length=${aiContent.length} | nativeThinking length=${nativeThinking.length} | has <thinking>=${aiContent.includes('<thinking>')} | has <think>=${aiContent.includes('<think>')}`);
            console.log(`🧠 [ThinkingDebug] RAW AI OUTPUT (first 500 chars):`, aiContent.substring(0, 500));

            // Extract embedded text thinking if present
            const extracted = extractThinking(aiContent);
            // Prefer native thinking field; fall back to text-embedded tags
            const thinkingContent = nativeThinking.trim() || extracted.thinking || '';
            
            // ALWAYS use the extracted content, which safely strips all thinking tags.
            // This prevents the tag leak when nativeThinking is true, and fixes unclosed tag leaks.
            aiContent = extracted.content;

            // 4.1 FORMAT VALIDATION — Thinking Chain Lock enforcement
            // If we got thinking but NO actual content, the model "dropped" the format.
            // Auto-retry once without prefill to recover.
            if (thinkingContent && !aiContent.trim()) {
                console.warn('🔒 [ChainLock] Format drop detected! Got thinking but no content. Retrying without prefill...');
                try {
                    // Remove the prefill assistant message and thinking chain lock for retry
                    const retryMessages = fullMessages
                        .filter(m =>
                            !(m.role === 'assistant' && typeof m.content === 'string' && (m.content.startsWith('<thinking>') || m.content.startsWith('<think>')))
                        )
                        .map(cloneChatMessageForRetry);
                    
                    // The thinking chain lock was injected into the last user message, we need to remove it
                    const rLastUserIdx = retryMessages.map(m => m.role).lastIndexOf('user');
                    if (rLastUserIdx >= 0) {
                        retryMessages[rLastUserIdx].content = cleanTextFromChatContent(retryMessages[rLastUserIdx].content, [
                            /\[思考提示\][\s\S]*?输出正文。/,
                            /\[思考链格式锁定\][\s\S]*?━━━━━━━━━━━━━━━/,
                            /\[思考链格式锁定\][\s\S]*?思考链闭合后必须紧跟正文内容。/,
                        ]);
                        retryMessages[rLastUserIdx].content = appendTextToChatContent(
                            retryMessages[rLastUserIdx].content,
                            `\n\n[系统: 请直接输出角色的回复正文，不需要 <${thinkTag}> 标签。]`,
                        );
                    } else {
                        retryMessages.push({ role: 'user', content: `[系统: 请直接输出角色的回复正文，不需要 <${thinkTag}> 标签。]` });
                    }
                    
                    const retryBody = { model: apiConfig.model, messages: retryMessages, temperature: chatTemperature, stream: false };
                    const retryData = await safeFetchJson(`${baseUrl}/chat/completions`, {
                        method: 'POST', headers,
                        body: JSON.stringify(retryBody)
                    }, 2, buildMainChatTrace('主聊天回复：格式失败重试', 1));
                    updateTokenUsage(retryData, historyMsgCount, 'chainlock-retry');
                    const retryContent = retryData.choices?.[0]?.message?.content || '';
                    if (retryContent.trim()) {
                        const retryExtracted = extractThinking(retryContent);
                        aiContent = retryExtracted.content.trim()
                            ? retryExtracted.content
                            : safeThinkingFallbackReply(retryExtracted.thinking || thinkingContent);
                        console.log('🔒 [ChainLock] Retry succeeded, recovered content length:', aiContent.length);
                    } else {
                        console.warn('🔒 [ChainLock] Retry also returned empty. Using safe fallback reply.');
                        aiContent = safeThinkingFallbackReply(thinkingContent);
                    }
                } catch (retryErr) {
                    console.error('🔒 [ChainLock] Retry failed:', retryErr);
                    aiContent = safeThinkingFallbackReply(thinkingContent);
                }
            }

            // CLEAN UP prefixes and timestamps LAST, so the regex anchors correctly
            // at the start of the string (now that <thinking> is gone!)
            aiContent = ChatParser.cleanAiSecondPass(aiContent);

            // Execute any parsed actions BEFORE side effect handlers like Search/Recall
            aiContent = await ChatParser.parseAndExecuteActions(aiContent, char.id, char.name, addToast);

            const photoHintExtraction = extractPhotoHint(aiContent);
            aiContent = photoHintExtraction.content;
            const photoDecisionExtraction = extractPhotoDecision(aiContent);
            aiContent = photoDecisionExtraction.content;
            const latestUserText = [...promptContextMsgs]
                .reverse()
                .find(message => message.role === 'user')?.content || '';
            const recentUserPhotoContext = promptContextMsgs
                .filter(message => message.role === 'user')
                .slice(-4)
                .map(message => String(message.content || ''))
                .join('\n');
            const explicitPhotoDecision = autoPhoto
                ? inferExplicitPhotoDecisionFromConversation(String(latestUserText || ''), aiContent, recentUserPhotoContext)
                : false;
            const shouldGeneratePhotoByDecision = photoDecisionExtraction.shouldGeneratePhoto === true || explicitPhotoDecision;
            const decisionHint = autoPhoto && !photoHintExtraction.hint && shouldGeneratePhotoByDecision
                ? buildPhotoHintFromDecision(
                    String(latestUserText || ''),
                    aiContent,
                    explicitPhotoDecision ? '用户明确要求发送或生成一张图片' : '主模型判断本轮应该发送一张图片',
                )
                : null;
            const photoHint = photoHintExtraction.hint || decisionHint;
            if (decisionHint && photoDecisionExtraction.shouldGeneratePhoto !== true) {
                console.warn('[AutoPhoto] Inferred PHOTO_DECISION:true from explicit user request because the main model did not emit one.');
            }

            console.log(`🧠 [ThinkingDebug] final thinkingContent length=${thinkingContent.length}, preview:`, thinkingContent.substring(0, 200));

            const hadSecondPassFallbackTrigger = /\[\[(?:SEARCH|READ_DIARY|FS_READ_DIARY):/.test(aiContent);

            const handlerContext: HandlerContext = {
                char,
                userProfile,
                apiConfig,
                realtimeConfig,
                fullMessages,
                historyMsgCount,
                baseUrl,
                headers,
                setMessages,
                updateTokenUsage,
                addToast,
                setRecallStatus,
                setSearchStatus,
                setDiaryStatus,
                setWeiboStatus,
                setXhsStatus,
                xsecTokenCache: xsecTokenCacheRef.current,
                noteTitleCache: noteTitleCacheRef.current,
                commentUserIdCache: commentUserIdCacheRef.current,
                commentAuthorNameCache: commentAuthorNameCacheRef.current,
                commentParentIdCache: commentParentIdCacheRef.current,
            };

            aiContent = await handleRecall(aiContent, handlerContext);

            aiContent = await handleSearch(aiContent, handlerContext);

            aiContent = await handleWeiboSearch(aiContent, handlerContext);

            aiContent = await handleDiaryWrite(aiContent, handlerContext);

            aiContent = await handleDiaryRead(aiContent, handlerContext);

            aiContent = await handleFeishuDiary(aiContent, handlerContext);

            aiContent = await handleFeishuDiaryRead(aiContent, handlerContext);

            aiContent = await handleCanvaActions(aiContent, handlerContext);

            aiContent = await handleXhsActions(aiContent, handlerContext);

            aiContent = normalizeLeakedReplyContextForQuote(aiContent);

            // 6.5 Detect AI-initiated incoming call [[CALL: mode]]
            const callMatch = aiContent.match(/\[\[CALL:\s*(\w+)\]\]/);
            if (callMatch) {
                const callMode = callMatch[1].trim();
                console.log(`📞 [IncomingCall] AI triggered call with mode: ${callMode}`);
                aiContent = aiContent.replace(/\[\[CALL:\s*\w+\]\]/g, '').trim();

                // 提取最近 3 轮对话作为来电理由（供语音通话 AI 开场白使用）
                const recentMsgs = currentMsgs
                    .filter(m => m.role === 'user' || m.role === 'assistant')
                    .slice(-6); // 最多 6 条（约 3 轮对话）
                const callReason = recentMsgs.map(m => {
                    const sender = m.role === 'user' ? userProfile.name : char.name;
                    return `${sender}: ${m.content.substring(0, 200)}`;
                }).join('\n');
                console.log(`📞 [IncomingCall] callReason (${recentMsgs.length} msgs):\n${callReason.substring(0, 300)}`);

                onIncomingCall?.(callMode, callReason);
            }

            // 7. Handle Quote/Reply Logic (Robust: handles [[QUOTE:...]], [QUOTE:...], typos like QUATE/QOUTE, Chinese 引用, and [回复 "..."] format)
            const QUOTE_RE_DOUBLE = /\[\[(?:QU[OA]TE|引用)[：:]\s*([\s\S]*?)\]\]/;
            const QUOTE_RE_SINGLE = /\[(?:QU[OA]TE|引用)[：:]\s*([^\]]*)\]/;
            // Match [回复 "content"] or [回复 "content"]: (AI mimics history context format)
            const REPLY_RE_CN = /\[回复\s*[""\u201C]([^""\u201D]*?)[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/;
            const QUOTE_CLEAN_DOUBLE = /\[\[(?:QU[OA]TE|引用)[：:][\s\S]*?\]\]/g;
            const QUOTE_CLEAN_SINGLE = /\[(?:QU[OA]TE|引用)[：:][^\]]*\]/g;
            const REPLY_CLEAN_CN = /\[回复\s*[""\u201C][^""\u201D]*?[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/g;
            let aiReplyTarget: { id: number, content: string, name: string } | undefined;
            const firstQuoteMatch = aiContent.match(QUOTE_RE_DOUBLE) || aiContent.match(QUOTE_RE_SINGLE) || aiContent.match(REPLY_RE_CN);
            if (firstQuoteMatch) {
                const quotedText = firstQuoteMatch[1].trim();
                if (quotedText) {
                    // Try exact include first, then fuzzy match (first 10 chars)
                    const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText))
                        || (quotedText.length > 10 ? historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText.slice(0, 10))) : undefined);
                    if (targetMsg) {
                        const truncated = targetMsg.content.length > 10 ? targetMsg.content.slice(0, 10) + '...' : targetMsg.content;
                        aiReplyTarget = { id: targetMsg.id, content: truncated, name: userProfile.name };
                    }
                }
            }
            // Clean all quote tag variants from content
            aiContent = aiContent.replace(QUOTE_CLEAN_DOUBLE, '').replace(QUOTE_CLEAN_SINGLE, '').replace(REPLY_CLEAN_CN, '').trim();

            // 7.5 Bare emoji name rescue — AI sometimes outputs [emojiName] without proper tags
            // If content inside single brackets exactly matches a known emoji, convert to [[SEND_EMOJI:]]
            if (emojis.length > 0) {
                aiContent = aiContent.replace(/\[([^\]\[]{1,30})\]/g, (match: string, name: string) => {
                    const trimmed = name.trim();
                    if (emojis.some(e => e.name === trimmed)) {
                        console.log(`🎨 [EmojiRescue] Bare [${trimmed}] → [[SEND_EMOJI: ${trimmed}]]`);
                        return `[[SEND_EMOJI: ${trimmed}]]`;
                    }
                    return match;
                });
            }

            // 8. Split and Stream (Simulate Typing)
            // Note: SEND_EMOJI tags are preserved through sanitize so splitResponse can interleave them with text

            // Comprehensive AI output sanitization (strips name prefixes, headers, stray backticks, residual tags, etc.)
            aiContent = ChatParser.sanitize(aiContent);

            // Fallback: if second-pass API calls (search/diary) returned empty, provide a minimal response
            if (!aiContent.trim() && hadSecondPassFallbackTrigger) {
                aiContent = '嗯...';
            }

            await saveChatContextMirror({
                charId: char.id,
                contextLimit: limit,
                historyMsgCount,
                model: apiConfig.model,
                messages: contextMirrorMessages,
                assistantReply: aiContent,
                thinking: thinkingContent,
            }).catch(error => {
                console.warn('[ChatContextMirror] save skipped:', error instanceof Error ? error.message : error);
            });

            const secondaryFullContextOptions: SecondaryFullContextOptions = {
                userProfile,
                mirrorMessages: contextMirrorMessages,
                mirrorAssistantReply: aiContent,
                mirrorThinking: thinkingContent,
                contextLimit: limit,
                historyMsgCount,
                model: apiConfig.model,
            };

            let firstSavedMsgId: number | null = null;

            if (aiContent) {

                // Check for <翻译> XML tags (new bilingual format)
                const hasTranslationTags = /<翻译>\s*<原文>[\s\S]*?<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/.test(aiContent);

                let globalMsgIndex = 0;
                let notificationPlayed = false;
                const showBrowserChatNotification = (
                    savedId: number,
                    content: string,
                    fallback?: string,
                ) => {
                    if (!getChatBackgroundNotificationsEnabled()) return;
                    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

                    void showLocalNotification({
                        title: char.name,
                        body: formatNotificationBody(content, { fallback }),
                        icon: char.avatar || '/icons/icon-192.webp',
                        badge: '/icons/icon-96.webp',
                        tag: `chat-${char.id}-${savedId}-${Date.now()}`,
                        data: { charId: char.id, messageId: savedId },
                        silent: false,
                        renotify: true,
                        requireInteraction: false,
                        vibrate: [200, 100, 200],
                    });
                };
                const playFirstNotification = () => {
                    if (notificationPlayed) { haptic.light(); return; }
                    notificationPlayed = true;
                    haptic.medium();
                    const themeId = char.bubbleStyle || 'default';
                    // Only play notification sound if this specific theme has one registered
                    // (do NOT fall back to 'default' — that is WeChat-specific)
                    const themePlugin = THEME_PLUGINS[themeId];
                    if (themePlugin?.notificationSound) playThemeNotification(themePlugin.notificationSound);
                };

                // --- Voice Message Detection — shared helper for both bilingual and normal paths ---
                // Regex moved here so both branches can use them
                // Pattern A: duration-based tag followed by (optionally quoted) content
                // e.g. [语音消息: 8秒] "喏？喏？..." or [语音消息:8s]「内容」
                const VOICE_DURATION_RE = /[【\[]语音(?:消息)?[：:]\s*(\d+)\s*(?:秒|s|sec)?[】\]]\s*["\u201C\u201D「『]?([\s\S]*?)["\u201C\u201D」』]?\s*(?:$|(?=[\n【\[]))/;
                // Pattern B: content fully wrapped in brackets
                // e.g. 【语音消息：喏？喏？...】or [语音消息：内容]
                const VOICE_WRAP_RE = /^([\s\S]*?)[【\[]语音(?:消息)?[：:]\s*([\s\S]+?)\s*[】\]](.*)$/;
                // Pattern C: XML-style voice tags (原版 SillyTavern 兼容)
                // e.g. <语音>你好呀~</语音>
                const VOICE_XML_RE = /^([\s\S]*?)<语音>([\s\S]+?)<\/语音>([\s\S]*)$/;

                /**
                 * Save a text chunk — if it contains a voice tag, split into text + voice message;
                 * otherwise save as plain text. Returns how many messages were saved.
                 */
                const saveTextOrVoiceChunk = async (
                    cleanChunk: string,
                    replyData: { id: number; content: string; name: string } | undefined
                ): Promise<number> => {
                    let saved = 0;
                    const durMatch = cleanChunk.match(VOICE_DURATION_RE);
                    const wrapMatch = !durMatch ? cleanChunk.match(VOICE_WRAP_RE) : null;
                    const xmlMatch = !durMatch && !wrapMatch ? cleanChunk.match(VOICE_XML_RE) : null;

                    if (durMatch) {
                        const tagStart = cleanChunk.search(/[【\[]语音(?:消息)?[：:]\s*\d/);
                        const textBefore = tagStart > 0 ? cleanChunk.slice(0, tagStart).trim() : '';
                        const durationSecs = parseInt(durMatch[1], 10) || 5;
                        const voiceText = durMatch[2].trim();

                        if (textBefore) {
                            const savedId = await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: textBefore, replyTo: replyData });
                            showBrowserChatNotification(savedId, textBefore);
                            await refreshRecentMessages();
                            playFirstNotification();
                            saved++;
                            await new Promise(r => setTimeout(r, 500));
                        }
                        if (voiceText) {
                            const savedVoiceId = await DB.saveMessage({
                                charId: char.id, role: 'assistant', type: 'voice',
                                content: voiceText,
                                metadata: { duration: durationSecs, sourceText: voiceText, hasAudio: false },
                                replyTo: textBefore ? undefined : replyData,
                            });
                            showBrowserChatNotification(savedVoiceId, `语音消息：${voiceText}`);
                            await refreshRecentMessages();
                            playFirstNotification();
                            saved++;
                            onVoiceMessageSaved?.(savedVoiceId, voiceText);
                        }
                    } else if (wrapMatch) {
                        const textBefore = wrapMatch[1].trim();
                        const voiceText = wrapMatch[2].trim();
                        const textAfter = wrapMatch[3].trim();
                        const estimatedDuration = Math.max(2, Math.ceil(voiceText.length / 4));

                        if (textBefore) {
                            const savedId = await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: textBefore, replyTo: replyData });
                            showBrowserChatNotification(savedId, textBefore);
                            await refreshRecentMessages();
                            playFirstNotification();
                            saved++;
                            await new Promise(r => setTimeout(r, 500));
                        }
                        if (voiceText) {
                            const savedVoiceId2 = await DB.saveMessage({
                                charId: char.id, role: 'assistant', type: 'voice',
                                content: voiceText,
                                metadata: { duration: estimatedDuration, sourceText: voiceText, hasAudio: false },
                                replyTo: textBefore ? undefined : replyData,
                            });
                            showBrowserChatNotification(savedVoiceId2, `语音消息：${voiceText}`);
                            await refreshRecentMessages();
                            playFirstNotification();
                            saved++;
                            onVoiceMessageSaved?.(savedVoiceId2, voiceText);
                        }
                        if (textAfter) {
                            await new Promise(r => setTimeout(r, 400));
                            const savedId = await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: textAfter });
                            showBrowserChatNotification(savedId, textAfter);
                            await refreshRecentMessages();
                            saved++;
                        }
                    } else if (xmlMatch) {
                        // XML-style voice tag: <语音>内容</语音> (原版兼容)
                        const textBefore = xmlMatch[1].trim();
                        const voiceText = xmlMatch[2].trim();
                        const textAfter = xmlMatch[3].trim();
                        const estimatedDuration = Math.max(2, Math.ceil(voiceText.length / 4));

                        if (textBefore) {
                            const savedId = await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: textBefore, replyTo: replyData });
                            showBrowserChatNotification(savedId, textBefore);
                            await refreshRecentMessages();
                            playFirstNotification();
                            saved++;
                            await new Promise(r => setTimeout(r, 500));
                        }
                        if (voiceText) {
                            const savedVoiceId3 = await DB.saveMessage({
                                charId: char.id, role: 'assistant', type: 'voice',
                                content: voiceText,
                                metadata: { duration: estimatedDuration, sourceText: voiceText, hasAudio: false },
                                replyTo: textBefore ? undefined : replyData,
                            });
                            showBrowserChatNotification(savedVoiceId3, `语音消息：${voiceText}`);
                            await refreshRecentMessages();
                            playFirstNotification();
                            saved++;
                            onVoiceMessageSaved?.(savedVoiceId3, voiceText);
                        }
                        if (textAfter) {
                            await new Promise(r => setTimeout(r, 400));
                            const savedId = await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: textAfter });
                            showBrowserChatNotification(savedId, textAfter);
                            await refreshRecentMessages();
                            saved++;
                        }
                    } else {
                        // Normal text message
                        const savedId = await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: cleanChunk, replyTo: replyData });
                        if (firstSavedMsgId === null) firstSavedMsgId = savedId;
                        showBrowserChatNotification(savedId, cleanChunk);
                        await refreshRecentMessages();
                        playFirstNotification();
                        saved++;
                    }
                    return saved;
                };

                const saveSongCard = async (
                    songCard: SongCardMetadata,
                    replyData: { id: number; content: string; name: string } | undefined,
                ): Promise<number> => {
                    // Auto-search: backfill real songId when AI outputs 0
                    if (songCard.songId === 0 && songCard.songName) {
                        try {
                            const query = songCard.artist
                                ? `${songCard.songName} ${songCard.artist}`
                                : songCard.songName;
                            const results = await searchSongs(query, 5);
                            if (results.songs && results.songs.length > 0) {
                                const match = results.songs[0];
                                songCard.songId = match.id;
                                songCard.artist = match.artists.map((a) => a.name).join('/');
                                songCard.albumName = match.album.name;
                                songCard.albumCover = match.album.picUrl;
                                songCard.duration = match.duration;
                            }
                        } catch (e) {
                            console.warn('[SongCard] Auto-search failed, keeping songId=0:', e);
                        }
                    }

                    const fallbackText = `分享了一首歌：${songCard.songName} - ${songCard.artist}`;
                    const savedId = await DB.saveMessage({
                        charId: char.id,
                        role: 'assistant',
                        type: 'text',
                        content: fallbackText,
                        metadata: songCard,
                        replyTo: replyData,
                    });
                    if (firstSavedMsgId === null) firstSavedMsgId = savedId;
                    showBrowserChatNotification(savedId, fallbackText);
                    await refreshRecentMessages();
                    playFirstNotification();
                    return 1;
                };

                if (hasTranslationTags) {
                    // ─── New bilingual format: each <翻译> block = one bubble ───
                    // Extract emojis for bilingual path (splitResponse not used here)
                    const bilingualEmojis: string[] = [];
                    const bilingualSongs: SongCardMetadata[] = [];
                    let bEm;
                    const bEmojiPat = /\[\[SEND_EMOJI:\s*(.*?)\]\]/g;
                    while ((bEm = bEmojiPat.exec(aiContent)) !== null) {
                        const name = bEm[1].trim();
                        if (!bilingualEmojis.includes(name)) bilingualEmojis.push(name);
                    }
                    let songMatch: RegExpExecArray | null;
                    const songPattern = /\[\[SHARE_SONG:\s*([\s\S]*?)\]\]/g;
                    while ((songMatch = songPattern.exec(aiContent)) !== null) {
                        const songCard = ChatParser.parseSongShareContent(songMatch[1]);
                        if (songCard) {
                            bilingualSongs.push({ type: 'song_card', ...songCard });
                        }
                    }
                    aiContent = aiContent.replace(/\[\[SEND_EMOJI:\s*.*?\]\]/g, '').trim();
                    aiContent = aiContent.replace(/\[\[SHARE_SONG:\s*[\s\S]*?\]\]/g, '').trim();
                    const tagPattern = /<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>([\s\S]*?)<\/译文>\s*<\/翻译>/g;
                    let lastIndex = 0;
                    let tagMatch;

                    while ((tagMatch = tagPattern.exec(aiContent)) !== null) {
                        // Save any plain text BEFORE this <翻译> block
                        const textBefore = aiContent.slice(lastIndex, tagMatch.index).trim();
                        if (textBefore) {
                            const cleaned = ChatParser.sanitize(textBefore);
                            if (cleaned && ChatParser.hasDisplayContent(cleaned)) {
                                const chunks = ChatParser.chunkText(cleaned);
                                for (const chunk of chunks) {
                                    if (!chunk) continue;
                                    const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                                    await new Promise(r => setTimeout(r, Math.min(Math.max(chunk.length * 50, 500), 2000)));
                                    const saved = await saveTextOrVoiceChunk(chunk, replyData);
                                    globalMsgIndex += saved;
                                }
                            }
                        }

                        // Save the bilingual pair (stored as langA\n%%BILINGUAL%%\nlangB for renderer compatibility)
                        const originalText = ChatParser.sanitize(tagMatch[1].trim());
                        const translatedText = ChatParser.sanitize(tagMatch[2].trim());
                        if (originalText || translatedText) {
                            const biContent = originalText && translatedText
                                ? `${originalText}\n${BILINGUAL_MARKER}\n${translatedText}`
                                : (originalText || translatedText);
                            const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                            await new Promise(r => setTimeout(r, Math.min(Math.max(biContent.length * 30, 400), 2000)));

                            if (onVoiceMessageSaved && originalText) {
                                // Auto-voice ON: save as voice, TTS uses original language only
                                const estimatedDuration = Math.max(2, Math.ceil(originalText.length / 4));
                                const savedVoiceId = await DB.saveMessage({
                                    charId: char.id, role: 'assistant', type: 'voice',
                                    content: originalText,
                                    metadata: { duration: estimatedDuration, sourceText: biContent, hasAudio: false },
                                    replyTo: replyData,
                                });
                                showBrowserChatNotification(savedVoiceId, originalText || translatedText);
                                await refreshRecentMessages();
                                playFirstNotification();
                                globalMsgIndex++;
                                onVoiceMessageSaved(savedVoiceId, originalText);
                            } else {
                                // Auto-voice OFF: save as text with bilingual toggle
                                const savedId = await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: biContent, replyTo: replyData });
                                showBrowserChatNotification(savedId, originalText || translatedText || biContent);
                                await refreshRecentMessages();
                                playFirstNotification();
                                globalMsgIndex++;
                            }
                        }

                        lastIndex = tagMatch.index + tagMatch[0].length;
                    }

                    // Save any remaining text AFTER last <翻译> block
                    const textAfter = aiContent.slice(lastIndex).trim();
                    if (textAfter) {
                        // Strip any stray translation tags
                        const cleaned = ChatParser.sanitize(textAfter.replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '').trim());
                        if (cleaned && ChatParser.hasDisplayContent(cleaned)) {
                            const chunks = ChatParser.chunkText(cleaned);
                            for (const chunk of chunks) {
                                if (!chunk) continue;
                                const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                                await new Promise(r => setTimeout(r, Math.min(Math.max(chunk.length * 50, 500), 2000)));
                                const saved = await saveTextOrVoiceChunk(chunk, replyData);
                                globalMsgIndex += saved;
                            }
                        }
                    }

                    // Send extracted emojis after bilingual text
                    for (const emojiName of bilingualEmojis) {
                        const foundEmoji = emojis.find(e => e.name === emojiName);
                        if (foundEmoji) {
                            await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
                            const savedId = await DB.saveMessage({
                                charId: char.id,
                                role: 'assistant',
                                type: 'emoji',
                                content: foundEmoji.url,
                                metadata: { name: emojiName, categoryId: foundEmoji.categoryId },
                            });
                            showBrowserChatNotification(savedId, `发来一个表情：${emojiName}`);
                            await refreshRecentMessages();
                            playFirstNotification();
                        }
                    }

                    for (const songCard of bilingualSongs) {
                        await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
                        const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                        const saved = await saveSongCard(songCard, replyData);
                        globalMsgIndex += saved;
                    }
                } else {
                    // ─── Normal text (no bilingual tags) ───
                    // Also handles legacy %%BILINGUAL%% format for backwards compatibility
                    const parts = ChatParser.splitResponse(aiContent);
                    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
                        const part = parts[partIndex];

                        if (part.type === 'emoji') {
                            const foundEmoji = emojis.find(e => e.name === part.content);
                            if (foundEmoji) {
                                await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
                                const savedId = await DB.saveMessage({
                                    charId: char.id,
                                    role: 'assistant',
                                    type: 'emoji',
                                    content: foundEmoji.url,
                                    metadata: { name: part.content, categoryId: foundEmoji.categoryId },
                                });
                                showBrowserChatNotification(savedId, `发来一个表情：${part.content}`);
                                await refreshRecentMessages();
                                playFirstNotification();
                            }
                        } else if (part.type === 'song') {
                            await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
                            const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                            const saved = await saveSongCard({ type: 'song_card', ...part.content }, replyData);
                            globalMsgIndex += saved;
                        } else {
                            // Split on --- separators first, then chunkText for fine-grained splitting
                            const rawBlocks = part.content.split(/^\s*---\s*$/m).filter(b => b.trim());
                            const allChunks: string[] = [];
                            for (const block of rawBlocks) {
                                allChunks.push(...ChatParser.chunkText(block.trim()));
                            }
                            if (allChunks.length === 0 && part.content.trim()) allChunks.push(part.content.trim());

                            for (let i = 0; i < allChunks.length; i++) {
                                let chunk = normalizeLeakedReplyContextForQuote(allChunks[i]);
                                const delay = Math.min(Math.max(chunk.length * 50, 500), 2000);
                                await new Promise(r => setTimeout(r, delay));

                                let chunkReplyTarget: { id: number, content: string, name: string } | undefined;
                                const chunkQuoteMatch = chunk.match(QUOTE_RE_DOUBLE) || chunk.match(QUOTE_RE_SINGLE);
                                if (chunkQuoteMatch) {
                                    const quotedText = chunkQuoteMatch[1].trim();
                                    if (quotedText) {
                                        const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText))
                                            || (quotedText.length > 10 ? historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText.slice(0, 10))) : undefined);
                                        if (targetMsg) {
                                            const truncated = targetMsg.content.length > 10 ? targetMsg.content.slice(0, 10) + '...' : targetMsg.content;
                                            chunkReplyTarget = { id: targetMsg.id, content: truncated, name: userProfile.name };
                                        }
                                    }
                                    chunk = chunk.replace(QUOTE_CLEAN_DOUBLE, '').replace(QUOTE_CLEAN_SINGLE, '').trim();
                                }

                                const replyData = chunkReplyTarget || (globalMsgIndex === 0 ? aiReplyTarget : undefined);

                                if (ChatParser.hasDisplayContent(chunk)) {
                                    const cleanChunk = ChatParser.sanitize(chunk);
                                    if (cleanChunk) {
                                        // Use shared voice detection helper
                                        const saved = await saveTextOrVoiceChunk(cleanChunk, replyData);
                                        globalMsgIndex += saved;
                                    }
                                }
                            }
                        }
                    }
                }

                // 9. Attach thinking chain metadata to the first saved message
                if (thinkingContent && firstSavedMsgId !== null) {
                    await DB.updateMessageMetadata(firstSavedMsgId, { thinking: thinkingContent });
                    // Refresh messages to pick up the updated metadata
                    await refreshRecentMessages();
                }
            } else {
                // If content was empty (e.g. only actions), just refresh
                await refreshRecentMessages();
            }

            if (photoHint && autoPhoto && onPhotoHint) {
                const payload: PhotoHintTrigger = {
                    char: { ...char },
                    userProfile,
                    currentMsgs: promptContextMsgs,
                    aiReply: aiContent,
                    thinking: thinkingContent || undefined,
                    hint: photoHint,
                    sourceMessageId: firstSavedMsgId || undefined,
                    contextOptions: secondaryFullContextOptions,
                };
                window.setTimeout(() => onPhotoHint(payload), 800);
            }
            void BackendAgentManager.refreshCharacterContext(char.id, char);

            // ====== Vector Memory Extraction — fire-and-forget (success path only) ======
            const vectorSecondaryConfig = selectSecondaryApiConfig();
            if (vectorSecondaryConfig?.apiKey && char.vectorMemoryEnabled && char.vectorMemoryAutoExtract !== false) {
                const emKey = embeddingApiKey;
                if (emKey) {
                    const charSnapshot = { ...char };
                    VectorMemoryExtractor.maybeExtract(charSnapshot, vectorSecondaryConfig, emKey)
                        .catch(e => console.error('🧠 [VectorExtract] Background:', e));
                }
            }

            // ====== Inner Voice / Creative Card — fire-and-forget ======
            const mindSecondaryConfig = selectSecondaryApiConfig();
            if (mindSecondaryConfig?.apiKey && aiContent) {
                const charSnapshot = { ...char };
                lastMindSnapshotCtx.current = { char: charSnapshot, aiContent, msgs: promptContextMsgs, config: mindSecondaryConfig, goalListStr, contextOptions: secondaryFullContextOptions };
                const statusMode = char.statusBarMode || 'classic';
                // Skip card generation for modes that do not need a background status task.
                if (statusMode === 'off' || statusMode === 'story_phone' || statusMode === 'afterglow') { /* noop — bionic engine still runs */ }
                else {
                // Delay 2s to reduce resource contention on mobile
                setTimeout(() => {
                    if (statusMode === 'classic') {
                        // ── Classic inner voice ──
                        MindSnapshotExtractor.generateInnerVoice(charSnapshot, aiContent, promptContextMsgs, mindSecondaryConfig,
                            (reason) => addToast(reason, 'error'),
                            true, goalListStr, secondaryFullContextOptions
                        )
                            .then(newState => {
                                if (newState && char && onMoodUpdate) {
                                    onMoodUpdate(char.id, newState);
                                } else {
                                    console.warn('💭 [InnerVoice] Generation returned null — retry available via avatar button');
                                }
                            })
                            .catch(e => console.error('💭 [InnerVoice] Background:', e));
                    } else if (statusMode === 'freeform') {
                        // ── Freeform HTML card ──
                        MindSnapshotExtractor.generateFreeformCard(charSnapshot, aiContent, promptContextMsgs, mindSecondaryConfig,
                            (reason) => addToast(reason, 'error'),
                            secondaryFullContextOptions,
                        )
                            .then(cardData => {
                                if (cardData && char && onMoodUpdate) {
                                    onMoodUpdate(char.id, { ...(charSnapshot.moodState || {}), innerVoice: cardData.body }, cardData);
                                } else {
                                    console.warn('✨ [FreeformCard] Generation returned null');
                                }
                            })
                            .catch(e => console.error('✨ [FreeformCard] Background:', e));
                    } else if (statusMode === 'custom') {
                        // ── Custom user-defined template ──
                        const template = charSnapshot.customStatusTemplates?.find(
                            t => t.id === charSnapshot.activeCustomTemplateId,
                        ) || charSnapshot.customStatusTemplates?.[0];
                        if (template?.systemPrompt) {
                            MindSnapshotExtractor.generateCustomCard(charSnapshot, aiContent, promptContextMsgs, mindSecondaryConfig,
                                template,
                                (reason) => addToast(reason, 'error'),
                                secondaryFullContextOptions,
                            )
                                .then(cardData => {
                                    if (cardData && char && onMoodUpdate) {
                                        onMoodUpdate(char.id, { ...(charSnapshot.moodState || {}), innerVoice: cardData.body }, cardData);
                                    } else {
                                        console.warn('🎨 [CustomCard] Generation returned null');
                                    }
                                })
                                .catch(e => console.error('🎨 [CustomCard] Background:', e));
                        } else {
                            console.warn('🎨 [CustomCard] No template configured, skipping');
                        }
                    } else {
                        // ── Creative card ──
                        MindSnapshotExtractor.generateCreativeCard(charSnapshot, aiContent, promptContextMsgs, mindSecondaryConfig,
                            (reason) => addToast(reason, 'error'),
                            undefined,
                            secondaryFullContextOptions,
                        )
                            .then(cardData => {
                                if (cardData && char && onMoodUpdate) {
                                    onMoodUpdate(char.id, { ...(charSnapshot.moodState || {}), innerVoice: cardData.body }, cardData);
                                } else {
                                    console.warn('🎴 [CreativeCard] Generation returned null');
                                }
                            })
                            .catch(e => console.error('🎴 [CreativeCard] Background:', e));
                    }
                }, 2000);
                } // end else (statusMode needs background generation)
            }

            // ====== Event Extractor (时间事件提取) — fire-and-forget ======
            const eventSecondaryConfig = selectSecondaryApiConfig();
            if (eventSecondaryConfig?.apiKey) {
                const lastUserMsg = currentMsgs.filter(m => m.role === 'user').pop();
                if (lastUserMsg && lastUserMsg.content) {
                    EventExtractor.extract(char.id, lastUserMsg.content, eventSecondaryConfig)
                        .catch(e => console.error('⏰ [EventExtractor] Background:', e));
                }
            }

            maybeGenerateScheduleRevision(scheduleSignal, scheduleReason, aiContent, currentMsgs);

        } catch (e: any) {
            if (e instanceof ApiRequestDedupedError) {
                console.warn('[ApiLedger] Pending chat request blocked:', e.requestId);
                return;
            }
            await DB.saveMessage({ charId: char.id, role: 'system', type: 'text', content: `[连接中断: ${e.message}]` });
            await refreshRecentMessages();
        } finally {
            isTypingRef.current = false;
            setIsTyping(false);
            setRecallStatus('');
            setSearchStatus('');
            setDiaryStatus('');
            setXhsStatus('');
        }
    };

    const generateAfterglow = useCallback(async (options: AfterglowTriggerOptions = {}): Promise<StatusCardData | null> => {
        if (!char) return null;

        const ctx = lastMindSnapshotCtx.current;
        const secondaryConfig = selectSecondaryApiConfig();
        if (!secondaryConfig?.baseUrl || !secondaryConfig.apiKey || !secondaryConfig.model) {
            if (!options.silent) addToast('副 API 未配置，无法生成番外篇', 'error');
            return null;
        }

        const sourceReply = options.sourceMessage?.content || ctx?.aiContent || '';
        if (!sourceReply.trim()) {
            if (!options.silent) addToast('还没有可生成番外篇的角色回复', 'info');
            return null;
        }

        const charSnapshot = ctx?.char?.id === char.id
            ? ctx.char
            : { ...char };
        const contextMsgs = options.currentMsgs?.length
            ? options.currentMsgs
            : (ctx?.msgs?.length ? ctx.msgs : []);
        const contextOptions = ctx?.contextOptions || {
            userProfile,
            contextLimit: char.contextLimit || 500,
            allowMirrorLookup: true,
        };

        return MindSnapshotExtractor.generateAfterglowCard(
            charSnapshot,
            sourceReply,
            contextMsgs,
            secondaryConfig,
            (reason) => addToast(reason, 'error'),
            contextOptions,
            options.afterglowOptions,
            {
                userInitiated: options.userInitiated !== false,
                reason: options.userInitiated === false ? '番外篇生成（自动）' : undefined,
            },
        );
    }, [addToast, char, userProfile]);

    const retryMindSnapshot = useCallback(() => {
        const ctx = lastMindSnapshotCtx.current;
        if (!ctx) { console.warn('💭 [InnerVoice] No context to retry'); return; }
        const statusMode = ctx.char.statusBarMode || 'classic';
        console.log(`💭 [InnerVoice] Manual retry triggered (mode: ${statusMode})`);
        if (statusMode === 'off') {
            addToast('心声已关闭，请先选择一个模式', 'info');
            return;
        }
        if (statusMode === 'story_phone') {
            addToast('查手机模式不需要重试心声，点头像旁的小手机进入', 'info');
            return;
        }
        if (statusMode === 'afterglow') {
            addToast('番外篇模式不需要重试心声，点头像旁的星星生成', 'info');
            return;
        }
        if (statusMode === 'classic') {
            MindSnapshotExtractor.generateInnerVoice(ctx.char, ctx.aiContent, ctx.msgs, ctx.config,
                (reason) => addToast(reason, 'error'),
                true, ctx.goalListStr, ctx.contextOptions
            )
                .then(newState => {
                    if (newState && ctx.char && onMoodUpdate) {
                        onMoodUpdate(ctx.char.id, newState);
                    }
                })
                .catch(e => console.error('💭 [InnerVoice] Retry failed:', e));
        } else if (statusMode === 'freeform') {
            MindSnapshotExtractor.generateFreeformCard(ctx.char, ctx.aiContent, ctx.msgs, ctx.config,
                (reason) => addToast(reason, 'error'),
                ctx.contextOptions,
            )
                .then(cardData => {
                    if (cardData && ctx.char && onMoodUpdate) {
                        onMoodUpdate(ctx.char.id, { ...(ctx.char.moodState || {}), innerVoice: cardData.body }, cardData);
                    }
                })
                .catch(e => console.error('✨ [FreeformCard] Retry failed:', e));
        } else if (statusMode === 'custom') {
            const template = ctx.char.customStatusTemplates?.find(
                (t: any) => t.id === ctx.char.activeCustomTemplateId,
            ) || ctx.char.customStatusTemplates?.[0];
            if (template?.systemPrompt) {
                MindSnapshotExtractor.generateCustomCard(ctx.char, ctx.aiContent, ctx.msgs, ctx.config,
                    template,
                    (reason) => addToast(reason, 'error'),
                    ctx.contextOptions,
                )
                    .then(cardData => {
                        if (cardData && ctx.char && onMoodUpdate) {
                            onMoodUpdate(ctx.char.id, { ...(ctx.char.moodState || {}), innerVoice: cardData.body }, cardData);
                        }
                    })
                    .catch(e => console.error('🎨 [CustomCard] Retry failed:', e));
            }
        } else {
            MindSnapshotExtractor.generateCreativeCard(ctx.char, ctx.aiContent, ctx.msgs, ctx.config,
                (reason) => addToast(reason, 'error'),
                undefined,
                ctx.contextOptions,
            )
                .then(cardData => {
                    if (cardData && ctx.char && onMoodUpdate) {
                        onMoodUpdate(ctx.char.id, { ...(ctx.char.moodState || {}), innerVoice: cardData.body }, cardData);
                    }
                })
                .catch(e => console.error('🎴 [CreativeCard] Retry failed:', e));
        }
    }, [addToast, onMoodUpdate]);

    return {
        isTyping,
        recallStatus,
        searchStatus,
        diaryStatus,
        xhsStatus,
        weiboStatus,
        lastTokenUsage,
        tokenBreakdown,
        setLastTokenUsage,
        triggerAI,
        retryMindSnapshot,
        generateAfterglow
    };
};
