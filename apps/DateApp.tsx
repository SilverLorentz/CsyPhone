
import React,{ useState,useEffect,useRef } from 'react';
import { useOS } from '../context/OSContext';
import { useVirtualTime } from '../context/VirtualTimeContext';
import { DB } from '../utils/db';
import { CharacterProfile,Message,DateState,UserProfile,DateTokenUsage,DateRequestDebugSnapshot } from '../types';
import { ContextBuilder } from '../utils/context';
import { safeResponseJson } from '../utils/safeApi';
import Modal from '../components/os/Modal';
import DateSession,{ DateExitSyncMode } from '../components/date/DateSession';
import DateSettings from '../components/date/DateSettings';
import { buildDatePreamble,buildIdentityIntro,buildTheaterScene,buildDateTail,buildDateTimeBlock } from '../utils/datePrompts';
import { pronoun } from '../utils/genderWords';
import { extractThinking, extractInnerWhispers, type InnerWhisper } from '../utils/thinkingExtractor';
import { DATE_RECAP_SYSTEM_PROMPT,DEFAULT_DATE_SUMMARY_PROMPT,buildSummaryPrompt,formatDateMessagesForBridge,formatMessagesForSummary } from '../utils/dateSummaryPrompts';
import { getEmbeddingConfig,getSecondaryApiConfig } from '../utils/runtimeConfig';
import { renderMarkdown } from '../utils/markdownLite';
import { stripTranslationTags } from '../utils/chatParser';
import { trackedApiRequest } from '../utils/apiRequestLedger';
import { buildTemporalContext } from '../utils/temporalContext';
import { EventExtractor } from '../utils/eventExtractor';
import { buildDateRequestContextMessages, type DateRequestContextMessage } from '../utils/dateContext';
import { buildDateHistoryContextBlock, injectDateHistoryAfterPreference } from '../utils/datePromptHistory';

type SummaryType = 'auto' | 'manual';
type DateOpeningMode = 'sense' | 'coming_over' | 'chance' | 'rendezvous' | 'custom';
const DATE_SUMMARY_CONTEXT_KEEP_COUNT = 5;
const DATE_CHAT_MAX_TOKENS = 65536;
const DATE_OPENING_MODE_OPTIONS: Array<{ key: DateOpeningMode; label: string }> = [
    { key: 'sense', label: '靠近' },
    { key: 'coming_over', label: '造访' },
    { key: 'chance', label: '偶遇' },
    { key: 'rendezvous', label: '赴约' },
    { key: 'custom', label: '自定义' },
];
export type DateHistorySession = { date: string, msgs: Message[], rawMsgs: Message[], startMsgId: number, summaries: Message[], bridges: Message[] };
type SummaryDraft = {
    content: string;
    summaryType: SummaryType;
    coveredMsgIds: number[];
    sessionStartMsgId: number;
    promptSnapshot: string;
    lastCoveredMsgId: number;
    exitState?: DateState;
    fromPendingAuto?: boolean;
    /** Set only during exit flow — after saving, also create bridge + finishExit */
    bridgeOnSave?: boolean;
};

const isDateSummaryMessage = (m: Message) => m.metadata?.source === 'date' && m.metadata?.isSummary === true;
const isDateBridgeMessage = (m: Message) => {
    const bridgeType = m.metadata?.bridgeType;
    return m.metadata?.source === 'date'
        && m.metadata?.isDateContextBridge === true
        && (bridgeType === undefined || bridgeType === 'raw' || bridgeType === 'summary');
};
const isDateRawDialogueMessage = (m: Message) => (
    m.metadata?.source === 'date'
    && !m.metadata?.isSummary
    && !m.metadata?.isDateContextBridge
);
const isDateDialogueMessage = (m: Message) => (
    isDateRawDialogueMessage(m)
    && !m.metadata?.hiddenFromUser
);
const getBridgeTypeLabel = (m: Message) => {
    if (m.metadata?.bridgeType === 'raw') return '原始记录';
    return '总结';
};
const getDateHistoryDisplayText = (content: string) => (
    stripTranslationTags(content || '').replace(/\[.*?\]/g, '').trim()
);

const buildDateOpeningInstructions = ({
    mode,
    char,
    userProfile,
    timeAwarenessInstruction,
    timeContinuityInstruction,
    userKeywords,
}: {
    mode: DateOpeningMode;
    char: CharacterProfile;
    userProfile: UserProfile;
    timeAwarenessInstruction: string;
    timeContinuityInstruction: string;
    userKeywords: string;
}) => {
    switch (mode) {
        case 'coming_over':
            return `
### 场景：造访 (Coming Over)
${timeAwarenessInstruction}

### 任务
你现在并不在和${userProfile.name}直接对话。此刻是你主动前往${userProfile.name}所在的地点。
请用**第三人称**描写一段话。
描述：${char.name} 正怎样赶往那里（在路上 / 即将抵达 / 站在门外）？沿途的环境是怎样的？${char.name} 此时是什么心情、什么状态？

### 逻辑检查
${timeContinuityInstruction}
3. **视角约束**: 只描写${char.name}和环境，写到即将与${userProfile.name}照面为止，不要替${userProfile.name}描写其反应、动作或内心。
4. **描写风格**: 电影感，沉浸式，细节丰富。不要输出任何前缀，直接输出描写内容。`;
        case 'custom':
            return `
### 场景：自定义 (Custom Scene)
${timeAwarenessInstruction}

### 任务
你现在并不在和${userProfile.name}直接对话。请围绕以下关键词，描写${userProfile.name}与你即将照面前的那一刻场景：
【关键词】${userKeywords}
请用**第三人称**描写一段话。
描述：在这些关键词设定的情境里，${char.name} 此时此刻正在做什么？周围环境如何？${char.name} 的状态如何？

### 逻辑检查
${timeContinuityInstruction}
3. **关键词处理**: 把上述关键词自然地织进场景与${char.name}的状态里，不要生硬罗列或逐条解释；若某个关键词与已有设定冲突，以连贯性为准。
4. **视角约束**: 只描写${char.name}和环境，不要替${userProfile.name}描写其反应或内心。
5. **描写风格**: 电影感，沉浸式，细节丰富。不要输出任何前缀，直接输出描写内容。`;
        case 'chance':
            return `
### 场景：偶遇 (Chance Encounter)
${timeAwarenessInstruction}

### 任务
你现在并不在和${userProfile.name}直接对话。此刻你和${userProfile.name}恰好身处同一个地方——你不是来找ta的，也还不知道ta就在附近，你在这里只是为了你自己的事。
请用**第三人称**描写一段话。
描述：${char.name} 此刻在这个地方做什么、为什么会在这里？周围环境是怎样的？${char.name} 的状态如何？（写到你们可能即将注意到彼此的那一刻为止）

### 逻辑检查
${timeContinuityInstruction}
3. **偶遇前提**: ${char.name}是为自己的事而来，对${userProfile.name}的出现毫不知情，不要让${char.name}表现得像在等谁、找谁或预感到什么。
4. **视角约束**: 只描写${char.name}和环境，不要替${userProfile.name}描写其反应或内心。
5. **描写风格**: 电影感，沉浸式，细节丰富。不要输出任何前缀，直接输出描写内容。`;
        case 'rendezvous':
            return `
### 场景：赴约 (Rendezvous)
${timeAwarenessInstruction}

### 任务
你现在并不在和${userProfile.name}直接对话。你和${userProfile.name}事先约好了见面，此刻你正在约定的地点等ta——或刚到，或快到约定的时间——你清楚ta就要来了。
请用**第三人称**描写一段话。
描述：${char.name} 在约定的地点是什么模样、正用什么方式打发等待？周围环境如何？想到马上要见到${userProfile.name}，${char.name} 是什么心情、什么状态？

### 逻辑检查
${timeContinuityInstruction}
3. **赴约前提**: 这是事先约好的见面，${char.name}是带着期待在等${userProfile.name}的，把这份等待与心绪写出来；但${userProfile.name}此刻尚未现身。
4. **视角约束**: 只描写${char.name}和环境，写到${userProfile.name}即将出现为止，不要替${userProfile.name}描写其反应、动作或内心。
5. **描写风格**: 电影感，沉浸式，细节丰富。不要输出任何前缀，直接输出描写内容。`;
        case 'sense':
        default:
            return `
### 场景：感知 (Sense Presence)
${timeAwarenessInstruction}

### 任务
你现在并不在和${userProfile.name}直接对话。${userProfile.name}正在悄悄靠近你所在的地点。
请用**第三人称**描写一段话。
描述：${char.name} 此时此刻正在做什么？周围环境是怎样的？状态如何？

### 逻辑检查
${timeContinuityInstruction}
3. **描写风格**: 电影感，沉浸式，细节丰富。不要输出任何前缀，直接输出描写内容。`;
    }
};

const getCurrentSessionMessages = (msgs: Message[]) => {
    const dateMsgs = msgs.filter(isDateRawDialogueMessage).sort((a, b) => a.timestamp - b.timestamp);
    const openingIndex = dateMsgs.map(m => m.metadata?.isOpening).lastIndexOf(true);
    return openingIndex >= 0 ? dateMsgs.slice(openingIndex) : dateMsgs;
};

const buildDateSummaryMemoryPrompt = (msgs: Message[]) => {
    const sessionMessages = getCurrentSessionMessages(msgs);
    if (sessionMessages.length === 0) return '';
    const sessionStartMsgId = sessionMessages[0].id;
    const sessionMsgIds = new Set(sessionMessages.map(m => m.id));
    const summaries = msgs
        .filter(isDateSummaryMessage)
        .filter(summary => (
            summary.metadata?.sessionStartMsgId === sessionStartMsgId
            || (
                Array.isArray(summary.metadata?.coveredMsgIds)
                && summary.metadata.coveredMsgIds.some((id: unknown) => typeof id === 'number' && sessionMsgIds.has(id))
            )
        ))
        .sort((a, b) => a.timestamp - b.timestamp);
    if (summaries.length === 0) return '';

    const blocks = summaries.map((summary, index) => {
        const label = summary.metadata?.summaryType === 'auto' ? '自动总结' : '手动总结';
        return `### 已总结片段 ${index + 1}（${label}）\n${summary.content}`;
    }).join('\n\n');

    return `\n\n### 【本次见面的已总结上下文】\n以下是本次见面中较早内容的压缩总结。它们是刚才线下见面已经发生过的事，不是新的用户消息。继续当前线下见面时，请把这些当作共同经历的背景，和后续未总结原文自然衔接。\n\n${blocks}\n`;
};

const hasCompleteApiConfig = (config?: { baseUrl?: string; apiKey?: string; model?: string } | null): config is { baseUrl: string; apiKey: string; model: string } => (
    !!config?.baseUrl?.trim() && !!config?.apiKey?.trim() && !!config?.model?.trim()
);

const toTokenCount = (value: unknown): number | undefined => {
    const numberValue = typeof value === 'number'
        ? value
        : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
    return Number.isFinite(numberValue) && numberValue >= 0 ? Math.round(numberValue) : undefined;
};

const readTokenCount = (usage: Record<string, unknown>, keys: string[]): number | undefined => {
    for (const key of keys) {
        const value = toTokenCount(usage[key]);
        if (value !== undefined) return value;
    }
    return undefined;
};

const normalizeDateTokenUsage = (payload: unknown, source: DateTokenUsage['source']): DateTokenUsage => {
    const maybeRecord = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const usagePayload = maybeRecord.usage && typeof maybeRecord.usage === 'object'
        ? maybeRecord.usage as Record<string, unknown>
        : maybeRecord;
    const inputTokens = readTokenCount(usagePayload, ['prompt_tokens', 'input_tokens', 'promptTokens', 'inputTokens', 'prompt', 'input']);
    const outputTokens = readTokenCount(usagePayload, ['completion_tokens', 'output_tokens', 'completionTokens', 'outputTokens', 'completion', 'output']);
    const explicitTotal = readTokenCount(usagePayload, ['total_tokens', 'totalTokens', 'total']);
    const totalTokens = explicitTotal ?? (
        inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined
    );
    return {
        inputTokens,
        outputTokens,
        totalTokens,
        source,
        updatedAt: Date.now(),
    };
};

export const buildDateSessionSystemPrompt = ({
    char,
    userProfile,
    allMsgs,
    historyContextBlock,
}: {
    char: CharacterProfile;
    userProfile: UserProfile;
    allMsgs: Message[];
    historyContextBlock?: string;
}): string => {
    let systemPrompt = buildDatePreamble(char.name, userProfile.name);
    systemPrompt += ContextBuilder.buildCoreContext(char, userProfile);
    systemPrompt = injectDateHistoryAfterPreference(systemPrompt, historyContextBlock || '');
    systemPrompt += buildIdentityIntro(char.name, userProfile.name);
    if (char.dateTimeAwarenessEnabled !== false) {
        systemPrompt += buildDateTimeBlock();
    }
    systemPrompt += buildDateSummaryMemoryPrompt(allMsgs);
    const REQUIRED_EMOTIONS = ['normal', 'happy', 'angry', 'sad', 'shy'];
    const dateEmotions = [...REQUIRED_EMOTIONS, ...(char.customDateSprites || [])];
    const userPov = char.datePerspective || 'second';
    const charPov = char.dateCharPerspective || 'third';
    systemPrompt += buildTheaterScene(char.name, userProfile.name, dateEmotions, userPov, charPov, undefined, char.dateOutputWordCount, char.dateWritingStyle, char.gender ?? 'male');
    systemPrompt += buildDateTail(char.name, userProfile.name, userPov, charPov, char.gender ?? 'male', char.dateTimeAwarenessEnabled !== false);
    return systemPrompt;
};

export const appendDateTemporalContext = (content: string, temporalContext?: string): string => {
    const normalized = temporalContext?.trim();
    return normalized ? `${content}\n\n${normalized}` : content;
};

const buildDateRequestHistoryBlock = (
    requestContext: DateRequestContextMessage[],
    charName: string,
    userName: string,
    excludeMessageId?: number,
): string => buildDateHistoryContextBlock(
    requestContext
        .filter(item => item.sourceMessage.id !== excludeMessageId)
        .map(item => ({ role: item.role, content: item.content })),
    charName,
    userName,
);

export const maybeExtractDateTemporalEvent = (
    charId: string,
    text: string,
    secondaryConfig?: { baseUrl?: string; apiKey?: string; model?: string } | null,
): void => {
    if (!hasCompleteApiConfig(secondaryConfig)) return;
    if (!EventExtractor.hasTimeKeyword(text)) return;
    EventExtractor.extract(charId, text, secondaryConfig)
        .catch(e => console.error('⏰ [DateEventExtractor] Background:', e));
};

const fetchDateChatCompletion = (
    config: { baseUrl: string; apiKey: string; model: string },
    body: Record<string, unknown>,
    reason: string,
    conversationId?: string,
    messageId?: number,
    userInitiated = false,
): Promise<Response> => {
    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    return trackedApiRequest({
        feature: 'date',
        reason,
        model: config.model,
        conversationId,
        messageId,
        userInitiated,
        url,
    }, () => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
    }));
};

export const buildHistorySessions = (msgs: Message[]): DateHistorySession[] => {
    const dateMsgs = msgs
        .filter(isDateRawDialogueMessage)
        .sort((a, b) => b.timestamp - a.timestamp);

    const sessions: DateHistorySession[] = [];
    if (dateMsgs.length === 0) return sessions;

    let currentSession: Message[] = [dateMsgs[0]];

    for (let i = 1; i < dateMsgs.length; i++) {
        const prev = dateMsgs[i - 1];
        const curr = dateMsgs[i];
        const isTimeBreak = Math.abs(prev.timestamp - curr.timestamp) > 30 * 60 * 1000;
        const splitSincePrevWasOpening = prev.metadata?.isOpening === true;

        if (isTimeBreak || splitSincePrevWasOpening) {
            const sessionStartMsg = currentSession[currentSession.length - 1];
            const orderedSessionMsgs = [...currentSession].reverse();
            sessions.push({
                date: new Date(sessionStartMsg.timestamp).toLocaleString(),
                msgs: orderedSessionMsgs,
                rawMsgs: [...orderedSessionMsgs],
                startMsgId: sessionStartMsg.id,
                summaries: [],
                bridges: [],
            });
            currentSession = [curr];
        } else {
            currentSession.push(curr);
        }
    }

    const sessionStartMsg = currentSession[currentSession.length - 1];
    const orderedSessionMsgs = [...currentSession].reverse();
    sessions.push({
        date: new Date(sessionStartMsg.timestamp).toLocaleString(),
        msgs: orderedSessionMsgs,
        rawMsgs: [...orderedSessionMsgs],
        startMsgId: sessionStartMsg.id,
        summaries: [],
        bridges: [],
    });

    const summaries = msgs.filter(isDateSummaryMessage).sort((a, b) => a.timestamp - b.timestamp);
    const bridges = msgs.filter(isDateBridgeMessage).sort((a, b) => a.timestamp - b.timestamp);
    return sessions.map(session => {
        const rawIds = new Set(session.rawMsgs.map(m => m.id));
        const matchesSession = (m: Message) => (
            m.metadata?.sessionStartMsgId === session.startMsgId
            || (
                Array.isArray(m.metadata?.coveredMsgIds)
                && m.metadata.coveredMsgIds.some((id: unknown) => typeof id === 'number' && rawIds.has(id))
            )
        );
        return {
            ...session,
            summaries: summaries.filter(matchesSession),
            bridges: bridges.filter(matchesSession),
        };
    });
};

const DateApp: React.FC = () => {
    const { closeApp, characters, activeCharacterId, setActiveCharacterId, apiConfig, addToast, updateCharacter, userProfile } = useOS();
    const virtualTime = useVirtualTime();

    // Modes: 'select' -> 'peek' -> 'session' | 'settings' | 'history'
    const [mode, setMode] = useState<'select' | 'peek' | 'session' | 'settings' | 'history'>('select');
    // Track previous mode for Settings back navigation
    const [previousMode, setPreviousMode] = useState<'select' | 'peek'>('select');

    const [peekStatus, setPeekStatus] = useState<string>('');
    const [peekThinking, setPeekThinking] = useState<string>('');
    const [peekLoading, setPeekLoading] = useState(false);
    const [lastDateTokenUsage, setLastDateTokenUsage] = useState<DateTokenUsage | null>(null);
    const [dateRequestDebugSnapshots, setDateRequestDebugSnapshots] = useState<DateRequestDebugSnapshot[]>([]);
    const [dateOpeningMode, setDateOpeningMode] = useState<DateOpeningMode>('sense');
    const [dateOpeningKeywords, setDateOpeningKeywords] = useState('');
    const [peekOpeningMode, setPeekOpeningMode] = useState<DateOpeningMode>('sense');
    const [peekOpeningKeywords, setPeekOpeningKeywords] = useState('');

    // History State
    const [historySessions, setHistorySessions] = useState<DateHistorySession[]>([]);
    const [expandedSummarySessions, setExpandedSummarySessions] = useState<Set<number>>(() => new Set());

    // Resume Logic State
    const [pendingSessionCharId, setPendingSessionCharId] = useState<string | null>(null);

    // --- NEW: Editing State lifted to here for DB sync ---
    const [dateMessages, setDateMessages] = useState<Message[]>([]);
    const [hasSavedOpening, setHasSavedOpening] = useState(false);
    const [forceFreshSession, setForceFreshSession] = useState(false);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editTargetMsg, setEditTargetMsg] = useState<Message | null>(null);
    const [editContent, setEditContent] = useState('');

    const recordDateRequestDebugSnapshot = (snapshot: Omit<DateRequestDebugSnapshot, 'id' | 'updatedAt'>) => {
        const updatedAt = Date.now();
        setDateRequestDebugSnapshots(prev => [{
            ...snapshot,
            id: `${updatedAt}_${snapshot.source}_${prev.length}`,
            updatedAt,
            messages: snapshot.messages.map(message => ({
                role: message.role,
                content: message.content || '',
            })),
        }, ...prev].slice(0, 12));
    };
    const [isSummaryGenerating, setIsSummaryGenerating] = useState(false);
    const [activeSummaryDraft, setActiveSummaryDraft] = useState<SummaryDraft | null>(null);
    const [pendingAutoSummary, setPendingAutoSummary] = useState<SummaryDraft | null>(null);
    const [isDateMemoryExtracting, setIsDateMemoryExtracting] = useState(false);
    const [showSummarySettings, setShowSummarySettings] = useState(false);
    const [summaryPromptDraft, setSummaryPromptDraft] = useState('');
    const summaryGeneratingRef = useRef(false);

    const char = characters.find(c => c.id === activeCharacterId);
    const pendingChar = pendingSessionCharId ? characters.find(c => c.id === pendingSessionCharId) : null;
    const secondaryApiConfig = getSecondaryApiConfig();
    const canManualSummary = hasCompleteApiConfig(secondaryApiConfig) || hasCompleteApiConfig(apiConfig);
    const canAutoSummary = hasCompleteApiConfig(secondaryApiConfig);
    const summaryDisabledReason = canManualSummary ? undefined : '请先配置主 API 或副 API';

    // --- Translation State (persisted to localStorage per character) ---
    const [dateTranslationEnabled, setDateTranslationEnabled] = useState(() => {
        if (!char) return false;
        try { return JSON.parse(localStorage.getItem(`date_translation_${char.id}`) || 'false'); } catch { return false; }
    });
    const [dateTranslateSourceLang, setDateTranslateSourceLang] = useState(() => {
        if (!char) return '日本語';
        return localStorage.getItem(`date_trans_src_${char.id}`) || '日本語';
    });
    const [dateTranslateTargetLang, setDateTranslateTargetLang] = useState(() => {
        if (!char) return '中文';
        return localStorage.getItem(`date_trans_tgt_${char.id}`) || '中文';
    });

    // Persist translation settings when they change
    useEffect(() => {
        if (!char) return;
        localStorage.setItem(`date_translation_${char.id}`, JSON.stringify(dateTranslationEnabled));
    }, [char?.id, dateTranslationEnabled]);
    useEffect(() => {
        if (!char) return;
        localStorage.setItem(`date_trans_src_${char.id}`, dateTranslateSourceLang);
    }, [char?.id, dateTranslateSourceLang]);
    useEffect(() => {
        if (!char) return;
        localStorage.setItem(`date_trans_tgt_${char.id}`, dateTranslateTargetLang);
    }, [char?.id, dateTranslateTargetLang]);

    // --- Data Loading ---
    const loadDateMessages = async () => {
        if (char) {
            const msgs = await DB.getMessagesByCharId(char.id);
            // 只筛选 source='date' 的消息用于小说模式显示
            const filtered = msgs.filter(isDateDialogueMessage).sort((a, b) => a.timestamp - b.timestamp);
            setDateMessages(filtered);

            // 检查数据库中是否已经包含当前的 peekStatus（通过内容比对），避免重复保存
            if (peekStatus && filtered.some(m => m.content === peekStatus && m.role === 'assistant')) {
                setHasSavedOpening(true);
            }
        }
    };

    useEffect(() => {
        if (char && mode === 'session') {
            loadDateMessages();
        }
    }, [char, mode]);

    // --- Navigation Helpers ---
    const handleBack = () => {
        if (mode === 'peek') {
            setMode('select');
            setPeekStatus('');
        } else if (mode === 'history') {
            setMode('select');
        } else closeApp();
    };

    const formatTime = () => `${virtualTime.hours.toString().padStart(2, '0')}:${virtualTime.minutes.toString().padStart(2, '0')}`;

    const loadHistorySessions = async (charId: string) => {
        const msgs = await DB.getMessagesByCharId(charId);
        setHistorySessions(buildHistorySessions(msgs));
    };

    const closeEditModal = () => {
        setIsEditModalOpen(false);
        setEditTargetMsg(null);
        setEditContent('');
    };

    const openEditModal = (msg: Message) => {
        setEditTargetMsg(msg);
        setEditContent(msg.content);
        setIsEditModalOpen(true);
    };

    const renderEditModal = () => (
        <Modal
            isOpen={isEditModalOpen}
            title="编辑内容"
            onClose={closeEditModal}
            footer={
                <>
                    <button onClick={closeEditModal} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button>
                    <button onClick={confirmEditMessage} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl">保存</button>
                </>
            }
        >
            <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="w-full h-32 bg-slate-100 rounded-2xl p-4 resize-none focus:ring-1 focus:ring-primary/20 transition-all text-sm leading-relaxed"
            />
        </Modal>
    );

    const buildTimeLabel = () => `${virtualTime.day} ${formatTime()}`;

    const openSummarySettings = () => {
        if (!char) return;
        setSummaryPromptDraft(char.dateSummaryPrompt || DEFAULT_DATE_SUMMARY_PROMPT);
        setShowSummarySettings(true);
    };

    const saveSummarySettings = () => {
        if (!char) return;
        updateCharacter(char.id, {
            dateSummaryPrompt: summaryPromptDraft.trim() || DEFAULT_DATE_SUMMARY_PROMPT,
        });
        setShowSummarySettings(false);
        addToast('总结设置已保存', 'success');
    };

    const restoreDefaultSummarySettings = () => {
        if (!char) return;
        setSummaryPromptDraft(DEFAULT_DATE_SUMMARY_PROMPT);
        updateCharacter(char.id, { dateSummaryPrompt: DEFAULT_DATE_SUMMARY_PROMPT });
        addToast('总结提示词已恢复默认', 'success');
    };

    const generateSummaryDraft = async (summaryType: SummaryType): Promise<SummaryDraft | null> => {
        if (!char || summaryGeneratingRef.current) return null;

        const secondaryConfig = getSecondaryApiConfig();
        const selectedApi = summaryType === 'auto'
            ? secondaryConfig
            : (hasCompleteApiConfig(secondaryConfig) ? secondaryConfig : apiConfig);

        if (!hasCompleteApiConfig(selectedApi)) {
            if (summaryType === 'manual') addToast('请先配置 API', 'error');
            return null;
        }

        summaryGeneratingRef.current = true;
        setIsSummaryGenerating(true);

        try {
            const allMsgs = await DB.getMessagesByCharId(char.id);
            const sessionMessages = getCurrentSessionMessages(allMsgs);
            if (sessionMessages.length === 0) {
                if (summaryType === 'manual') addToast('还没有可总结的见面内容', 'info');
                return null;
            }

            const targetMessages = summaryType === 'auto'
                ? sessionMessages.filter(m => (!char.dateSummaryLastAutoMsgId || m.id > char.dateSummaryLastAutoMsgId) && !m.metadata?.dateSummaryAutoHidden)
                : sessionMessages;

            const threshold = char.dateSummaryAutoThreshold || 20;
            if (summaryType === 'auto' && targetMessages.length < threshold) return null;
            if (targetMessages.length < 4) {
                if (summaryType === 'manual') addToast('消息太少，无法总结', 'info');
                return null;
            }

            const promptSnapshot = char.dateSummaryPrompt?.trim() || DEFAULT_DATE_SUMMARY_PROMPT;
            const prompt = buildSummaryPrompt(char.name, userProfile.name, buildTimeLabel(), targetMessages, promptSnapshot);
            const requestMessages = [
                { role: 'system', content: DATE_RECAP_SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ];
            const requestBody = {
                model: selectedApi.model,
                messages: requestMessages,
                temperature: 0.45,
            };
            recordDateRequestDebugSnapshot({
                source: summaryType === 'auto' ? 'auto-summary' : 'manual-summary',
                label: summaryType === 'auto' ? '见面自动摘要更新' : '见面手动摘要生成',
                model: selectedApi.model,
                temperature: 0.45,
                messages: requestMessages,
            });

            const response = await fetchDateChatCompletion(selectedApi,
                requestBody,
                summaryType === 'auto' ? '见面自动摘要更新' : '见面手动摘要生成',
                char.id,
                undefined,
                summaryType === 'manual',
            );

            if (!response.ok) throw new Error(`Summary API Error: ${response.status}`);
            const data = await safeResponseJson(response);
            const extracted = extractThinking(data.choices?.[0]?.message?.content || '');
            const content = extracted.content.trim();
            if (!content) throw new Error('Summary content empty');

            const sessionStartMsgId = sessionMessages[0].id;
            const coveredMsgIds = targetMessages.map(m => m.id);
            return {
                content,
                summaryType,
                coveredMsgIds,
                sessionStartMsgId,
                promptSnapshot,
                lastCoveredMsgId: coveredMsgIds[coveredMsgIds.length - 1],
            };
        } catch (e: any) {
            if (summaryType === 'manual') addToast(`总结生成失败: ${e.message || e}`, 'error');
            else console.warn('[DateSummary] auto summary failed:', e);
            return null;
        } finally {
            summaryGeneratingRef.current = false;
            setIsSummaryGenerating(false);
        }
    };

    /**
     * Generate a comprehensive exit summary:
     * Combines existing auto-summaries + unsummarized raw messages into one complete summary.
     */
    const generateExitSummaryDraft = async (): Promise<SummaryDraft | null> => {
        if (!char || summaryGeneratingRef.current) return null;
        const secondaryConfig = getSecondaryApiConfig();
        const selectedApi = hasCompleteApiConfig(secondaryConfig) ? secondaryConfig : apiConfig;
        if (!hasCompleteApiConfig(selectedApi)) { addToast('请先配置 API', 'error'); return null; }

        summaryGeneratingRef.current = true;
        setIsSummaryGenerating(true);
        try {
            const allMsgs = await DB.getMessagesByCharId(char.id);
            const sessionMessages = getCurrentSessionMessages(allMsgs);
            if (sessionMessages.length === 0) { addToast('还没有可总结的见面内容', 'info'); return null; }

            const sessionStartMsgId = sessionMessages[0].id;
            const sessionMsgIds = new Set(sessionMessages.map(m => m.id));

            const savedSummaries = allMsgs
                .filter(isDateSummaryMessage)
                .filter(s => s.metadata?.sessionStartMsgId === sessionStartMsgId
                    || (Array.isArray(s.metadata?.coveredMsgIds) && s.metadata.coveredMsgIds.some((id: unknown) => typeof id === 'number' && sessionMsgIds.has(id as number))))
                .sort((a, b) => a.timestamp - b.timestamp);

            const coveredByExistingSummaries = new Set<number>();
            for (const s of savedSummaries) {
                if (Array.isArray(s.metadata?.coveredMsgIds)) {
                    for (const id of s.metadata.coveredMsgIds) {
                        if (typeof id === 'number') coveredByExistingSummaries.add(id);
                    }
                }
            }

            const unsummarizedMessages = sessionMessages.filter(m => !coveredByExistingSummaries.has(m.id));

            const promptSnapshot = char.dateSummaryPrompt?.trim() || DEFAULT_DATE_SUMMARY_PROMPT;
            let exitPromptContent = '';

            if (savedSummaries.length > 0) {
                const summaryBlocks = savedSummaries.map((s, i) => `### 已总结片段 ${i + 1}\n${s.content}`).join('\n\n');
                exitPromptContent += `【之前的阶段总结】\n${summaryBlocks}\n\n`;
            }

            if (unsummarizedMessages.length > 0) {
                const rawBlock = formatMessagesForSummary(unsummarizedMessages, char.name, userProfile.name);
                exitPromptContent += `【未总结的新记录】\n${rawBlock}\n\n`;
            } else if (savedSummaries.length > 0) {
                exitPromptContent += '（所有内容均已在上方总结中覆盖）\n\n';
            }

            if (!exitPromptContent.trim()) { addToast('没有可总结的内容', 'info'); return null; }

            const fullPrompt = `你正在为 ${char.name} 和 ${userProfile.name} 的一次线下见面写最终交接 recap。
请把下面所有内容（包括之前的阶段 recap 和新增原始记录）合并成一份完整、连贯、能带回线上对话的交接 recap。

当前时间: ${buildTimeLabel()}

${exitPromptContent}
【输出要求】
- 使用 Markdown。
- 以 ${char.name} 的口径写——这是 ${char.name} 刚刚亲历、带回线上的事，不是旁观总结。
- 保留关键事件、关系变化、未说出口的情绪、值得之后线上承接的小细节。
- 重点放在“离场态”：这次见面结束时两人是什么心情、停在哪一步、有没有没说完 / 没收尾的话。
- 不要生成新的剧情，不要改写已经发生的事实。
- 把之前的阶段 recap 和新内容融合成一份流畅的整体，不要简单拼接。

结构：
## 事件脉络
## 情绪变化
## 关系信号`;
            const requestMessages = [
                { role: 'system', content: DATE_RECAP_SYSTEM_PROMPT },
                { role: 'user', content: fullPrompt },
            ];
            const requestBody = {
                model: selectedApi.model,
                messages: requestMessages,
                temperature: 0.45,
            };
            recordDateRequestDebugSnapshot({
                source: 'exit-summary',
                label: '见面退出最终摘要',
                model: selectedApi.model,
                temperature: 0.45,
                messages: requestMessages,
            });

            const response = await fetchDateChatCompletion(selectedApi,
                requestBody,
                '见面退出最终摘要',
                char.id,
                undefined,
                true,
            );
            if (!response.ok) throw new Error(`Summary API Error: ${response.status}`);
            const data = await safeResponseJson(response);
            const extracted = extractThinking(data.choices?.[0]?.message?.content || '');
            const content = extracted.content.trim();
            if (!content) throw new Error('Exit summary content empty');

            const allCoveredMsgIds = sessionMessages.map(m => m.id);
            return {
                content, summaryType: 'manual', coveredMsgIds: allCoveredMsgIds,
                sessionStartMsgId, promptSnapshot,
                lastCoveredMsgId: allCoveredMsgIds[allCoveredMsgIds.length - 1],
            };
        } catch (e: any) {
            addToast(`总结生成失败: ${e.message || e}`, 'error');
            return null;
        } finally {
            summaryGeneratingRef.current = false;
            setIsSummaryGenerating(false);
        }
    };

    const saveSummaryRecord = async (draft: SummaryDraft): Promise<number> => {
        if (!char) return 0;
        // Save summary as pure summary — NO bridge flag in metadata.
        const savedSummaryId = await DB.saveMessage({
            charId: char.id, role: 'system', type: 'text', content: draft.content,
            metadata: {
                source: 'date', hiddenFromUser: true, isSummary: true, summaryType: draft.summaryType,
                coveredMsgIds: draft.coveredMsgIds, sessionStartMsgId: draft.sessionStartMsgId, promptSnapshot: draft.promptSnapshot,
            },
        });
        if (char.dateSummaryAutoHideEnabled) await hideSummarizedDateMessages(draft, savedSummaryId);
        if (draft.summaryType === 'auto') updateCharacter(char.id, { dateSummaryLastAutoMsgId: draft.lastCoveredMsgId });
        if (draft.fromPendingAuto || pendingAutoSummary?.lastCoveredMsgId === draft.lastCoveredMsgId) setPendingAutoSummary(null);
        await loadDateMessages();
        return savedSummaryId;
    };

    const extractDateL0Memories = async (coveredMsgIds?: number[]): Promise<number> => {
        if (!char || !char.vectorMemoryEnabled) return 0;

        const secondaryConfig = getSecondaryApiConfig();
        const selectedApi = hasCompleteApiConfig(secondaryConfig) ? secondaryConfig : apiConfig;
        if (!hasCompleteApiConfig(selectedApi)) {
            addToast('L0 记忆提取已跳过：请先配置主 API 或副 API', 'info');
            return 0;
        }

        const embeddingApiKey = getEmbeddingConfig().apiKey;
        if (!embeddingApiKey) {
            addToast('L0 记忆提取已跳过：未配置 Embedding API Key', 'info');
            return 0;
        }

        setIsDateMemoryExtracting(true);
        try {
            const allMsgs = await DB.getMessagesByCharId(char.id);
            const sessionMessages = getCurrentSessionMessages(allMsgs);
            const coveredSet = new Set((coveredMsgIds || []).filter((id): id is number => typeof id === 'number'));
            const sourceMessages = coveredSet.size > 0
                ? sessionMessages.filter(message => coveredSet.has(message.id))
                : sessionMessages;
            if (sourceMessages.length === 0) return 0;

            const { VectorMemoryExtractor } = await import('../utils/vectorMemoryExtractor');
            return await VectorMemoryExtractor.extractFromMessages(
                char.id,
                char.name,
                sourceMessages,
                selectedApi,
                embeddingApiKey,
                hasCompleteApiConfig(secondaryConfig) ? secondaryConfig : undefined,
                { reason: '线下见面L0记忆提取', retryReason: '线下见面L0记忆提取重试', userInitiated: true },
            );
        } catch (e: any) {
            console.error('[DateApp] Date L0 extraction failed', e);
            addToast(`L0 记忆提取失败: ${e.message || e}`, 'error');
            return 0;
        } finally {
            setIsDateMemoryExtracting(false);
        }
    };

    const finishSummarySave = async (draft: SummaryDraft, l0MemoryCount = 0) => {
        const memorySuffix = l0MemoryCount > 0 ? `，已提取 ${l0MemoryCount} 条 L0 记忆` : '';
        // If this save was triggered from exit flow, create bridge then exit
        if (draft.bridgeOnSave && draft.exitState) {
            const bridged = await createBridgeFromSummary();
            addToast(bridged ? `交接 recap 已同步到主聊天${memorySuffix}` : `交接 recap 已保存${memorySuffix}`, 'success');
            finishExitSession(draft.exitState);
        } else {
            addToast(`交接 recap 已保存${memorySuffix}`, 'success');
            if (draft.exitState) finishExitSession(draft.exitState);
        }
    };

    const saveSummaryDraft = async (draft: SummaryDraft) => {
        if (!char) return;
        const content = draft.content.trim();
        if (!content) {
            addToast('recap 内容不能为空', 'error');
            return;
        }

        const normalizedDraft = { ...draft, content };
        const savedSummaryId = await saveSummaryRecord(normalizedDraft);
        if (savedSummaryId) {
            const l0MemoryCount = normalizedDraft.bridgeOnSave
                ? await extractDateL0Memories(normalizedDraft.coveredMsgIds)
                : 0;
            setActiveSummaryDraft(null);
            await finishSummarySave(normalizedDraft, l0MemoryCount);
        }
    };

    const closeSummaryModal = () => {
        setActiveSummaryDraft(null);
    };

    const discardSummaryDraft = () => {
        if (!char || !activeSummaryDraft) return;
        const draft = activeSummaryDraft;
        if (draft.summaryType === 'auto') {
            updateCharacter(char.id, { dateSummaryLastAutoMsgId: draft.lastCoveredMsgId });
            setPendingAutoSummary(null);
        }
        setActiveSummaryDraft(null);
        addToast('已丢弃总结草稿', 'info');
        if (draft.exitState) finishExitSession(draft.exitState);
    };

    const discardPendingAutoSummary = () => {
        if (!char || !pendingAutoSummary) return;
        updateCharacter(char.id, { dateSummaryLastAutoMsgId: pendingAutoSummary.lastCoveredMsgId });
        setPendingAutoSummary(null);
        addToast('已丢弃自动总结', 'info');
    };

    const hideCoveredDateMessageIds = async (coveredMsgIds: number[], summaryMsgId: number) => {
        const idsToHide = coveredMsgIds.slice(0, Math.max(0, coveredMsgIds.length - DATE_SUMMARY_CONTEXT_KEEP_COUNT));
        if (idsToHide.length === 0) return;

        await Promise.all(idsToHide.map(id => DB.updateMessageMetadata(id, {
            hiddenFromUser: true,
            dateSummaryAutoHidden: true,
            hiddenBySummaryMsgId: summaryMsgId,
        })));
    };

    const hideSummarizedDateMessages = async (draft: SummaryDraft, summaryMsgId: number) => {
        await hideCoveredDateMessageIds(draft.coveredMsgIds, summaryMsgId);
    };

    const compressExistingDateSummaries = async () => {
        if (!char) return;
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const summaries = allMsgs
            .filter(isDateSummaryMessage)
            .sort((a, b) => a.timestamp - b.timestamp);

        for (const summary of summaries) {
            if (!Array.isArray(summary.metadata?.coveredMsgIds)) continue;
            const coveredMsgIds = summary.metadata.coveredMsgIds.filter((id: unknown): id is number => typeof id === 'number');
            await hideCoveredDateMessageIds(coveredMsgIds, summary.id);
        }

        await loadDateMessages();
    };

    const requestManualSummary = async () => {
        const draft = await generateSummaryDraft('manual');
        if (draft) setActiveSummaryDraft(draft);
    };

    const maybeTriggerAutoSummary = async (msgs: Message[]) => {
        if (!char || !char.dateSummaryAutoEnabled || pendingAutoSummary || summaryGeneratingRef.current) return;
        if (!hasCompleteApiConfig(getSecondaryApiConfig())) return;
        const sessionMessages = getCurrentSessionMessages(msgs);
        const unsummarizedSessionMessages = sessionMessages.filter(m => !m.metadata?.dateSummaryAutoHidden);
        const newCount = char.dateSummaryLastAutoMsgId
            ? unsummarizedSessionMessages.filter(m => m.id > char.dateSummaryLastAutoMsgId!).length
            : unsummarizedSessionMessages.length;
        const threshold = char.dateSummaryAutoThreshold || 20;
        if (newCount < threshold) return;

        const draft = await generateSummaryDraft('auto');
        if (draft) {
            setPendingAutoSummary(draft);
        }
    };

    const finishExitSession = (finalState: DateState) => {
        if (char) {
            updateCharacter(char.id, { savedDateState: finalState });
            addToast('进度已保存', 'success');
        }
        setPendingAutoSummary(null);
        setActiveSummaryDraft(null);
        setMode('select');
        setPeekStatus('');
        setHasSavedOpening(false);
    };

    const saveRawBridgeAndExit = async (finalState: DateState) => {
        if (!char) return;
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const sessionMessages = getCurrentSessionMessages(allMsgs);
        if (sessionMessages.length > 0) {
            await DB.saveMessage({
                charId: char.id,
                role: 'system',
                type: 'text',
                content: formatDateMessagesForBridge(sessionMessages, char.name, userProfile.name),
                metadata: {
                    source: 'date',
                    hiddenFromUser: true,
                    isDateContextBridge: true,
                    bridgeType: 'raw',
                    coveredMsgIds: sessionMessages.map(m => m.id),
                    sessionStartMsgId: sessionMessages[0].id,
                },
            });
            addToast('原始记录已同步到主聊天', 'success');
        }
        finishExitSession(finalState);
    };

    /** Remove all bridge messages created during this date session */
    const cleanSessionBridges = async () => {
        if (!char) return;
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const sessionMessages = getCurrentSessionMessages(allMsgs);
        if (sessionMessages.length === 0) return;
        const sessionMsgIds = new Set(sessionMessages.map(m => m.id));
        const sessionStartMsgId = sessionMessages[0].id;
        const bridges = allMsgs.filter(m =>
            m.metadata?.source === 'date' && m.metadata?.isDateContextBridge === true
            && (m.metadata?.sessionStartMsgId === sessionStartMsgId
                || (Array.isArray(m.metadata?.coveredMsgIds) && m.metadata.coveredMsgIds.some((id: unknown) => typeof id === 'number' && sessionMsgIds.has(id as number))))
        );
        if (bridges.length > 0) {
            await DB.deleteMessages(bridges.map(m => m.id));
            console.log(`[Date] Cleaned ${bridges.length} bridge messages on 'none' exit`);
        }
    };

    /** Create a bridge message from an existing saved summary */
    const createBridgeFromSummary = async (): Promise<boolean> => {
        if (!char) return false;
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const sessionMessages = getCurrentSessionMessages(allMsgs);
        if (sessionMessages.length === 0) return false;
        const sessionStartMsgId = sessionMessages[0].id;
        const sessionMsgIds = new Set(sessionMessages.map(m => m.id));
        const savedSummary = allMsgs
            .filter(isDateSummaryMessage)
            .sort((a, b) => b.timestamp - a.timestamp || b.id - a.id)
            .find(m => m.metadata?.sessionStartMsgId === sessionStartMsgId
                || (Array.isArray(m.metadata?.coveredMsgIds) && m.metadata.coveredMsgIds.some((id: unknown) => typeof id === 'number' && sessionMsgIds.has(id as number))));
        if (!savedSummary) return false;
        const existingBridge = allMsgs.find(m =>
            m.metadata?.source === 'date' && m.metadata?.isDateContextBridge === true && m.metadata?.summarySourceMsgId === savedSummary.id
        );
        if (existingBridge) return true;
        const coveredMsgIds = Array.isArray(savedSummary.metadata?.coveredMsgIds)
            ? savedSummary.metadata.coveredMsgIds.filter((id: unknown): id is number => typeof id === 'number')
            : sessionMessages.map(m => m.id);
        await DB.saveMessage({
            charId: char.id, role: 'system', type: 'text', content: savedSummary.content,
            metadata: {
                source: 'date', hiddenFromUser: true, isDateContextBridge: true, bridgeType: 'summary',
                coveredMsgIds, sessionStartMsgId, summarySourceMsgId: savedSummary.id,
                promptSnapshot: savedSummary.metadata?.promptSnapshot || '',
            },
        });
        return true;
    };

    const renderSummaryModal = () => {
        if (!activeSummaryDraft) return null;
        const saveLabel = activeSummaryDraft.bridgeOnSave ? '保存并同步' : activeSummaryDraft.exitState ? '保存并退出' : '保存';
        return (
            <Modal
                isOpen={!!activeSummaryDraft}
                title="交接 recap 预览"
                onClose={closeSummaryModal}
                footer={
                    <>
                        <button
                            onClick={() => navigator.clipboard.writeText(activeSummaryDraft.content).then(() => addToast('已复制', 'success')).catch(() => addToast('复制失败', 'error'))}
                            className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold"
                        >
                            复制
                        </button>
                        <button onClick={discardSummaryDraft} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-500 font-bold">丢弃</button>
                        <button
                            disabled={!activeSummaryDraft.content.trim() || isDateMemoryExtracting}
                            onClick={() => saveSummaryDraft(activeSummaryDraft)}
                            className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-2xl disabled:opacity-50"
                        >
                            {isDateMemoryExtracting ? '提取记忆...' : saveLabel}
                        </button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-400">
                            <span>recap 正文</span>
                            <span>{activeSummaryDraft.content.trim().length} 字</span>
                        </div>
                        <textarea
                            value={activeSummaryDraft.content}
                            onChange={e => setActiveSummaryDraft(current => current ? { ...current, content: e.target.value } : current)}
                            rows={10}
                            className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                        />
                    </div>
                    {activeSummaryDraft.content.trim() && (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">排版预览</div>
                            <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
                                {renderMarkdown(activeSummaryDraft.content)}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        );
    };

    const renderSummarySettingsModal = () => (
        <Modal
            isOpen={showSummarySettings}
            title="总结设置"
            onClose={() => setShowSummarySettings(false)}
            footer={
                <>
                    <button onClick={() => setShowSummarySettings(false)} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-500 font-bold">取消</button>
                    <button onClick={saveSummarySettings} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-2xl">保存</button>
                </>
            }
        >
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs leading-relaxed text-slate-400">只影响见面总结生成，不会改动立绘、场景等其他见面设置。</p>
                    <button
                        onClick={restoreDefaultSummarySettings}
                        className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-500 active:scale-95"
                    >
                        恢复默认
                    </button>
                </div>
                <textarea
                    value={summaryPromptDraft}
                    onChange={e => setSummaryPromptDraft(e.target.value)}
                    rows={9}
                    className="w-full resize-y rounded-2xl border border-slate-100 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-700 outline-none focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-100"
                />
                <div className="rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-400">
                    可用变量: <span className="font-mono text-slate-500">${'{charName}'}</span> <span className="font-mono text-slate-500">${'{userName}'}</span> <span className="font-mono text-slate-500">${'{time}'}</span> <span className="font-mono text-slate-500">${'{messages}'}</span>
                </div>
            </div>
        </Modal>
    );

    // Improved Time Gap Logic
    const getTimeGapHint = (lastMsgTimestamp: number | undefined): string => {
        if (!lastMsgTimestamp) return '这是你们的初次互动。';
        const now = Date.now();
        const diffMs = now - lastMsgTimestamp;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const currentHour = new Date().getHours();
        const isNight = currentHour >= 23 || currentHour <= 6;

        if (diffMins < 5) return '';
        if (diffMins < 60) return `[系统提示: 距离上次互动: ${diffMins} 分钟。]`;
        if (diffHours < 6) {
            if (isNight) return `[系统提示: 距离上次互动: ${diffHours} 小时。现在是深夜/清晨。]`;
            return `[系统提示: 距离上次互动: ${diffHours} 小时。]`;
        }
        if (diffHours < 24) return `[系统提示: 距离上次互动: ${diffHours} 小时。]`;
        const days = Math.floor(diffHours / 24);
        return `[系统提示: 距离上次互动: ${days} 天。]`;
    };

    // --- Resume / Start Logic ---
    const handleCharClick = (c: CharacterProfile) => {
        if (c.savedDateState) {
            setPendingSessionCharId(c.id);
        } else {
            startPeek(c);
        }
    };

    const handleResumeSession = () => {
        if (!pendingSessionCharId) return;
        const c = characters.find(ch => ch.id === pendingSessionCharId);
        if (!c || !c.savedDateState) {
            addToast('存档已丢失', 'error');
            setPendingSessionCharId(null);
            return;
        }
        setActiveCharacterId(c.id);
        setForceFreshSession(false);
        setMode('session');
        setPendingSessionCharId(null);
        addToast('已恢复上次进度', 'success');
    };

    const handleStartNewSession = async () => {
        if (!pendingSessionCharId) return;
        const c = characters.find(ch => ch.id === pendingSessionCharId);
        if (!c) {
            setPendingSessionCharId(null);
            return;
        }
        updateCharacter(c.id, { savedDateState: undefined });
        setForceFreshSession(true);
        const started = await startPeek(c);
        if (started) setPendingSessionCharId(null);
    };

    // --- 关键修复: 进入 Session 时立即归档开场白 ---
    const handleEnterSession = async () => {
        if (!char) return;

        // 1. 如果有开场白且未保存，立即保存到数据库
        // 这确保了 user 发送第一句话时，AI 能在历史记录里读到这个开场
        // UPDATE: 添加 isOpening 标记，用于区分新会话
        if (peekStatus && !hasSavedOpening) {
            try {
                await DB.saveMessage({
                    charId: char.id,
                    role: 'assistant',
                    type: 'text',
                    content: peekStatus,
                    metadata: {
                        source: 'date',
                        isOpening: true,
                        thinking: peekThinking || undefined,
                        openingMode: peekOpeningMode,
                        openingKeywords: peekOpeningKeywords || undefined,
                    }
                });
                setHasSavedOpening(true);
            } catch (e) {
                console.error("Failed to save opening", e);
            }
        }

        // 2. 切换模式并刷新数据
        setMode('session');
        await loadDateMessages();
    };

    // --- Peek (Generation) Logic ---
    const startPeek = async (
        c: CharacterProfile,
        openingMode: DateOpeningMode = dateOpeningMode,
        customKeywords: string = dateOpeningKeywords,
    ): Promise<boolean> => {
        const normalizedKeywords = customKeywords.trim();
        if (openingMode === 'custom' && !normalizedKeywords) {
            addToast('先写自定义开场关键词', 'info');
            return false;
        }
        setActiveCharacterId(c.id);
        setForceFreshSession(true);
        setMode('peek');
        setPeekLoading(true);
        setPeekStatus('');
        setHasSavedOpening(false);
        setLastDateTokenUsage(null);
        setPeekOpeningMode(openingMode);
        setPeekOpeningKeywords(normalizedKeywords);

        try {
            const allMsgs = await DB.getMessagesByCharId(c.id);
            const limit = c.contextLimit || 500;
            const requestContext = buildDateRequestContextMessages({
                allMessages: allMsgs,
                currentSessionMessages: [],
                contextLimit: limit,
            });
            const lastMsg = requestContext[requestContext.length - 1]?.sourceMessage;
            const dateTimeAwarenessEnabled = c.dateTimeAwarenessEnabled !== false;
            const gapHint = dateTimeAwarenessEnabled ? getTimeGapHint(lastMsg?.timestamp) : '';

            const timeStr = `${virtualTime.day} ${formatTime()}`;

            // Build system prompt: dreamweaver + core context + identity intro
            let peekSystemPrompt = buildDatePreamble(c.name, userProfile.name);
            peekSystemPrompt += ContextBuilder.buildCoreContext(c, userProfile, false);
            peekSystemPrompt = injectDateHistoryAfterPreference(
                peekSystemPrompt,
                buildDateRequestHistoryBlock(requestContext, c.name, userProfile.name),
            );
            peekSystemPrompt += buildIdentityIntro(c.name, userProfile.name);

            // Force separator to signal new scene
            const contextSeparator = dateTimeAwarenessEnabled && gapHint ? `\n\n--- [TIME SKIP: ${gapHint}] ---\n\n` : `\n\n--- [NEW SCENE START] ---\n\n`;
            const timeAwarenessInstruction = dateTimeAwarenessEnabled
                ? `当前时间: ${timeStr}\n时间上下文: ${gapHint || '无明显间隔'}`
                : '时间感知: 已关闭。不要根据现实时间、时段或距离上次互动多久来安排开场状态。';
            const timeContinuityInstruction = dateTimeAwarenessEnabled
                ? `1. **上下文连贯性**: 参考【最近对话上下文】，但**必须**注意 [TIME SKIP]。如果是很久没见，不要接着上一次的话题聊，而是开启新场景。
2. **状态一致性**: ${gapHint.includes('很久') ? '因为很久没见，可能在发呆、忙碌或者有点落寞。' : '根据之前的聊天状态决定。'}`
                : `1. **上下文连贯性**: 参考【最近对话上下文】，但不要主动演绎现实时间、时段或久别感。
2. **状态一致性**: 根据之前的聊天状态决定。`;

            const peekInstructions = buildDateOpeningInstructions({
                mode: openingMode,
                char: c,
                userProfile,
                timeAwarenessInstruction,
                timeContinuityInstruction,
                userKeywords: normalizedKeywords,
            });
            const requestMessages = [
                { role: 'system', content: peekSystemPrompt },
                { role: 'user', content: `${contextSeparator}${peekInstructions}\n\n(Start sensing...)` },
            ];
            const requestBody = {
                model: apiConfig.model,
                messages: requestMessages,
                temperature: 0.85,
            };
            recordDateRequestDebugSnapshot({
                source: 'peek',
                label: '见面入场前状态感知',
                model: apiConfig.model,
                temperature: 0.85,
                messages: requestMessages,
            });

            const response = await fetchDateChatCompletion(apiConfig,
                requestBody,
                '见面入场前状态感知',
                c.id,
                undefined,
                true,
            );

            if (!response.ok) throw new Error('Failed to sense presence');
            const data = await safeResponseJson(response);
            setLastDateTokenUsage(normalizeDateTokenUsage(data, 'peek'));
            const rawPeek = data.choices[0].message.content;
            const peekExtracted = extractThinking(rawPeek);
            setPeekStatus(peekExtracted.content);
            setPeekThinking(peekExtracted.thinking || '');

        } catch (e: any) {
            setPeekStatus(`(无法感知状态: ${e.message})`);
        } finally {
            setPeekLoading(false);
        }
        return true;
    };

    // --- Session API Logic ---
    const handleSendMessage = async (text: string, directorHint?: string): Promise<{ content: string; whispers: InnerWhisper[] }> => {
        if (!char) throw new Error("No char");

        // 1. Save User Msg
        const userMessageId = await DB.saveMessage({ charId: char.id, role: 'user', type: 'text', content: text, metadata: { source: 'date' } });

        // 2. Prepare Context
        // Re-fetch messages. Since we saved the opening in handleEnterSession,
        // 'allMsgs' will now correctly contain: [History..., Opening, UserMsg]
        const allMsgs = await DB.getMessagesByCharId(char.id);

        // Update local state for display
        const dateFiltered = allMsgs.filter(isDateDialogueMessage).sort((a, b) => a.timestamp - b.timestamp);
        setDateMessages(dateFiltered);

        const limit = char.contextLimit || 500;
        const sessionMessages = getCurrentSessionMessages(allMsgs);
        const requestContext = buildDateRequestContextMessages({
            allMessages: allMsgs,
            currentSessionMessages: sessionMessages,
            contextLimit: limit,
        });
        const temporalHistory = requestContext.map(item => item.sourceMessage);
        const previousContextMsg = temporalHistory[temporalHistory.length - 2];
        const temporalContext = char.dateTimeAwarenessEnabled !== false
            ? buildTemporalContext(temporalHistory, Date.now(), char.id)
                || getTimeGapHint(previousContextMsg?.timestamp)
            : '';
        const userPromptText = appendDateTemporalContext(text, temporalContext);

        const historyContextBlock = buildDateRequestHistoryBlock(requestContext, char.name, userProfile.name, userMessageId);
        const systemPrompt = buildDateSessionSystemPrompt({ char, userProfile, allMsgs, historyContextBlock });
        const finalUserPrompt = `${userPromptText}\n\n(System Note: 严格遵守沉浸剧场格式。每一行都要以 [emotion] 开头，根据内容逐行切换情绪标签。叙述人称严格遵守当前视角设定。${directorHint ? `\n<director_note>${directorHint}</director_note>` : ''}${dateTranslationEnabled ? `\n[Reminder: 双语模式已开启。规则：
• 每一行仍然必须以 [emotion] 开头，<翻译> 标签只能出现在 [emotion] 后面，不能放在行首。
• 只有${char.name}的「台词/说的话」用${dateTranslateSourceLang}写，并写成 [emotion]<翻译><原文>${dateTranslateSourceLang}台词</原文><译文>${dateTranslateTargetLang}译文</译文></翻译>。
• 叙述、动作描写、心理活动、环境描写 → 保持中文不变，不用 <翻译> 标签。
• <原文> 和 <译文> 内不要再写 [emotion] 标签。
示例：
[happy]<翻译><原文>「おはよう！今日はいい天気だね」</原文><译文>「早上好！今天天气真好呢」</译文></翻译>
[shy] ${pronoun(char.gender ?? 'male')}的脸颊微微泛红，视线移向了窗外。]` : ''})`;
        const requestMessages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: finalUserPrompt },
        ];
        const requestBody = {
            model: apiConfig.model,
            messages: requestMessages,
            temperature: char.dateTemperature ?? 0.85,
            max_tokens: DATE_CHAT_MAX_TOKENS,
        };
        recordDateRequestDebugSnapshot({
            source: 'send',
            label: directorHint ? '见面导演提示回复' : '见面聊天回复',
            model: apiConfig.model,
            temperature: char.dateTemperature ?? 0.85,
            maxTokens: DATE_CHAT_MAX_TOKENS,
            messages: requestMessages,
        });

        const response = await fetchDateChatCompletion(apiConfig,
            requestBody,
            directorHint ? '见面导演提示回复' : '见面聊天回复',
            char.id,
            userMessageId,
            true,
        );

        if (!response.ok) throw new Error('API Error');
        const data = await safeResponseJson(response);
        setLastDateTokenUsage(normalizeDateTokenUsage(data, 'send'));
        const rawContent = data.choices[0].message.content;
        const extracted = extractThinking(rawContent);
        // Extract inner whispers from the cleaned content
        const whisperResult = extractInnerWhispers(extracted.content);
        const content = whisperResult.content;

        // Keep bilingual XML in storage so replay/novel mode can show subtitles later.
        // Context and summaries strip translation tags before they are sent to the model.
        await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content, metadata: { source: 'date', thinking: extracted.thinking } });

        // Refresh local state
        const freshMsgs = await DB.getMessagesByCharId(char.id);
        setDateMessages(freshMsgs.filter(isDateDialogueMessage).sort((a, b) => a.timestamp - b.timestamp));
        if (char.dateTimeAwarenessEnabled !== false) {
            maybeExtractDateTemporalEvent(char.id, text, secondaryApiConfig);
        }
        void maybeTriggerAutoSummary(freshMsgs);

        return { content, whispers: whisperResult.whispers };
    };

    const handleReroll = async (): Promise<{ content: string; whispers: InnerWhisper[] }> => {
        if (!char || dateMessages.length === 0) throw new Error("No context");

        const lastMsg = dateMessages[dateMessages.length - 1];
        if (lastMsg.role !== 'assistant') throw new Error("Cannot reroll user message");

        // 1. Find the user input that triggered it
        // Note: filter out the last AI msg from context without deleting it yet.
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const validAllMsgs = allMsgs.filter(m => m.id !== lastMsg.id);
        const validSessionMessages = getCurrentSessionMessages(validAllMsgs);
        const validDateMsgs = validSessionMessages.filter(isDateDialogueMessage).sort((a, b) => a.timestamp - b.timestamp);
        const lastUserMsg = [...validDateMsgs].reverse().find(m => m.role === 'user');

        if (!lastUserMsg || lastUserMsg.role !== 'user') throw new Error("Context lost");

        // 2. Call API logic
        const limit = char.contextLimit || 500;
        const requestContext = buildDateRequestContextMessages({
            allMessages: validAllMsgs,
            currentSessionMessages: validSessionMessages,
            contextLimit: limit,
        });
        const temporalHistory = requestContext.map(item => item.sourceMessage);
        const previousContextMsg = temporalHistory[temporalHistory.length - 2];
        const temporalContext = char.dateTimeAwarenessEnabled !== false
            ? buildTemporalContext(temporalHistory, Date.now(), char.id)
                || getTimeGapHint(previousContextMsg?.timestamp)
            : '';
        const userPromptText = appendDateTemporalContext(lastUserMsg.content, temporalContext);
        const historyContextBlock = buildDateRequestHistoryBlock(requestContext, char.name, userProfile.name, lastUserMsg.id);
        const systemPrompt = buildDateSessionSystemPrompt({ char, userProfile, allMsgs, historyContextBlock });
        const rerollUserPrompt = `${userPromptText}\n\n(System Note: Reroll. 用不同的角度重写。严格遵守沉浸剧场格式、当前叙述人称。${dateTranslationEnabled ? `\n[Reminder: 双语模式已开启。每一行仍必须以 [emotion] 开头。只有${char.name}的台词用${dateTranslateSourceLang}写成 [emotion]<翻译><原文>...</原文><译文>...</译文></翻译>；叙述/动作/心理描写保持中文不变，不用 <翻译>。]` : ''})`;
        const requestMessages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: rerollUserPrompt },
        ];
        const requestBody = {
            model: apiConfig.model,
            messages: requestMessages,
            temperature: Math.min((char.dateTemperature ?? 0.85) + 0.05, 2.0),
            max_tokens: DATE_CHAT_MAX_TOKENS,
        };
        recordDateRequestDebugSnapshot({
            source: 'reroll',
            label: '见面回复重掷',
            model: apiConfig.model,
            temperature: Math.min((char.dateTemperature ?? 0.85) + 0.05, 2.0),
            maxTokens: DATE_CHAT_MAX_TOKENS,
            messages: requestMessages,
        });

        const response = await fetchDateChatCompletion(apiConfig,
            requestBody,
            '见面回复重掷',
            char.id,
            lastUserMsg.id,
            true,
        );

        if (!response.ok) throw new Error('API Error');
        const data = await safeResponseJson(response);
        setLastDateTokenUsage(normalizeDateTokenUsage(data, 'reroll'));
        const rawContent = data.choices[0].message.content;
        const extracted = extractThinking(rawContent);
        // Also strip inner whispers on reroll (same as normal send)
        const whisperResult = extractInnerWhispers(extracted.content);
        const content = whisperResult.content;

        await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content, metadata: { source: 'date', thinking: extracted.thinking } });

        // 3. Now safely delete the old AI message since the new one is saved
        await DB.deleteMessage(lastMsg.id);

        // Sync
        const freshMsgs = await DB.getMessagesByCharId(char.id);
        setDateMessages(freshMsgs.filter(isDateDialogueMessage).sort((a, b) => a.timestamp - b.timestamp));

        return { content, whispers: whisperResult.whispers };
    };

    // --- Editing & Deletion ---
    const handleDeleteMessage = async (msg: Message) => {
        await DB.deleteMessage(msg.id);
        if (mode === 'history') {
            await loadHistorySessions(msg.charId);
            addToast('已删除该条记录', 'success');
            return;
        }
        setDateMessages(prev => prev.filter(m => m.id !== msg.id));
    };

    const confirmEditMessage = async () => {
        if (!editTargetMsg) return;
        const targetMsg = editTargetMsg;
        const nextContent = editContent;
        await DB.updateMessage(targetMsg.id, nextContent);
        if (mode === 'history') {
            await loadHistorySessions(targetMsg.charId);
        } else {
            setDateMessages(prev => prev.map(m => m.id === targetMsg.id ? { ...m, content: nextContent } : m));
        }
        closeEditModal();
        addToast('已保存修改', 'success');
    };

    const handleDeleteHistorySession = async (session: DateHistorySession) => {
        if (!char) return;
        const sessionMessageIds = Array.from(new Set([...session.rawMsgs, ...session.summaries, ...session.bridges].map(msg => msg.id)));
        if (sessionMessageIds.length === 0) return;
        if (!window.confirm(`删除这次见面记录？共 ${sessionMessageIds.length} 条消息会被移除。`)) return;
        await DB.deleteMessages(sessionMessageIds);
        await loadHistorySessions(char.id);
        addToast('已删除本次见面记录', 'success');
    };

    const onExitSession = async (finalState: DateState, syncMode: DateExitSyncMode) => {
        if (!char) return;
        if (syncMode === 'none') {
            await cleanSessionBridges();
            finishExitSession(finalState);
            return;
        }
        if (syncMode === 'raw') { await saveRawBridgeAndExit(finalState); return; }
        // syncMode === 'summary'
        // Generate a comprehensive exit summary (auto-summaries + unsummarized messages)
        if (pendingAutoSummary) {
            await saveSummaryDraft({ ...pendingAutoSummary, fromPendingAuto: true, exitState: finalState });
        }
        const draft = await generateExitSummaryDraft();
        if (!draft) { addToast('未同步总结，仅保存进度', 'info'); finishExitSession(finalState); return; }
        setActiveSummaryDraft({ ...draft, bridgeOnSave: true, exitState: finalState });
    };

    const openHistory = async (c: CharacterProfile) => {
        setActiveCharacterId(c.id);
        await loadHistorySessions(c.id);
        setMode('history');
    };

    // --- Render ---

    if (mode === 'select' || !char) {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-light">
                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-white sticky top-0 z-10">
                    <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="font-bold text-slate-700">选择见面对象</span>
                    <div className="w-8"></div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <section className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-slate-500">开场</span>
                            <span className="text-[10px] text-slate-400">点击角色后生成</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {DATE_OPENING_MODE_OPTIONS.map(option => {
                                const isActive = dateOpeningMode === option.key;
                                return (
                                    <button
                                        key={option.key}
                                        type="button"
                                        onClick={() => setDateOpeningMode(option.key)}
                                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${isActive ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                        {dateOpeningMode === 'custom' && (
                            <textarea
                                value={dateOpeningKeywords}
                                onChange={e => setDateOpeningKeywords(e.target.value)}
                                rows={2}
                                placeholder="写关键词或场景要求，比如：雨夜便利店门口、刚吵完架、他手里拿着伞"
                                className="mt-3 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 outline-none transition-all focus:border-slate-300 focus:bg-white"
                            />
                        )}
                    </section>
                    <div className="grid grid-cols-2 gap-4">
                        {characters.map(c => (
                            <div key={c.id} onClick={() => handleCharClick(c)} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:scale-95 transition-transform flex flex-col items-center gap-3 relative group">
                                <button
                                    onClick={(e) => { e.stopPropagation(); openHistory(c); }}
                                    className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-20 active:scale-90"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                                </button>
                                <img src={c.avatar} className="w-16 h-16 rounded-full object-cover" />
                                <span className="font-bold text-slate-700">{c.name}</span>
                                {c.savedDateState && <div className="absolute top-2 left-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" title="有存档"></div>}
                            </div>
                        ))}
                    </div>
                </div>
                <Modal isOpen={!!pendingSessionCharId} title="发现进度" onClose={() => setPendingSessionCharId(null)} footer={<div className="flex gap-3 w-full"><button onClick={handleStartNewSession} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold">新的见面</button><button onClick={handleResumeSession} className="flex-1 py-3 bg-green-500 text-white rounded-2xl font-bold shadow-lg shadow-green-200">继续上次</button></div>}>
                    <div className="text-center text-slate-500 text-sm py-4">检测到 {pendingChar?.name} 有未结束的见面。<br /><span className="text-xs text-slate-400 mt-2 block">(存档时间: {pendingChar?.savedDateState?.timestamp ? new Date(pendingChar.savedDateState.timestamp).toLocaleString() : 'Unknown'})</span></div>
                </Modal>
            </div>
        );
    }

    if (mode === 'history') {
        return (
            <>
                <div className="h-full w-full bg-slate-50 flex flex-col font-light">
                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-white sticky top-0 z-10">
                    <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
                    <span className="font-bold text-slate-700">见面记录</span>
                    <div className="w-8"></div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
                    {historySessions.length === 0 ? <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2"><span className="text-4xl opacity-50">📖</span><span className="text-xs">暂无见面记录</span></div> : historySessions.map((session, idx) => (
                        <div key={idx} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center"><span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{session.date}</span><span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{session.msgs.length} 句</span></div>
                            <div className="p-4 space-y-4">
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => handleDeleteHistorySession(session)}
                                        className="px-2.5 py-1 text-[11px] font-medium text-red-500 bg-red-50 rounded-full hover:bg-red-100 transition-colors"
                                    >
                                        删除本次
                                    </button>
                                </div>
                                {session.msgs.map(m => {
                                    const text = getDateHistoryDisplayText(m.content || '');
                                    return (
                                        <React.Fragment key={m.id}>
                                            <div className={`mb-1 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`flex gap-1 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                                    <button
                                                        onClick={() => openEditModal(m)}
                                                        className="px-2 py-1 text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
                                                    >
                                                        编辑
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteMessage(m)}
                                                        className="px-2 py-1 text-[11px] font-medium text-red-500 bg-red-50 rounded-full hover:bg-red-100 transition-colors"
                                                    >
                                                        删除
                                                    </button>
                                                </div>
                                            </div>
                                        <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}><div className={`max-w-[90%] text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'text-slate-500 text-right italic' : 'text-slate-800'}`}>{m.role === 'user' ? <span className="bg-slate-100 px-3 py-2 rounded-xl rounded-tr-none inline-block">{text}</span> : <span>{text || '(无内容)'}</span>}</div></div>
                                        </React.Fragment>
                                    );
                                })}
                                {session.bridges.length > 0 && (
                                    <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs">
                                        <span className="font-bold text-emerald-700">已同步到主聊天</span>
                                        <span className="text-[11px] text-emerald-500">
                                            {Array.from(new Set(session.bridges.map(getBridgeTypeLabel))).join(' / ')}
                                        </span>
                                    </div>
                                )}
                                {session.summaries.length > 0 && (
                                    <div className="border-t border-slate-100 pt-3">
                                        <button
                                            onClick={() => setExpandedSummarySessions(prev => {
                                                const next = new Set(prev);
                                                if (next.has(session.startMsgId)) next.delete(session.startMsgId);
                                                else next.add(session.startMsgId);
                                                return next;
                                            })}
                                            className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500"
                                        >
                                            <span>📋 总结 ({session.summaries.length})</span>
                                            <span>{expandedSummarySessions.has(session.startMsgId) ? '▾' : '▸'}</span>
                                        </button>
                                        {expandedSummarySessions.has(session.startMsgId) && (
                                            <div className="mt-3 space-y-3">
                                                {session.summaries.map(summary => (
                                                    <div key={summary.id} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                                                        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                            {summary.metadata?.summaryType === 'auto' ? '自动总结' : '手动总结'}
                                                        </div>
                                                        <div className="text-xs leading-relaxed text-slate-700">
                                                            {renderMarkdown(summary.content)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                </div>
                {renderEditModal()}
            </>
        );
    }

    if (mode === 'peek') {
        return (
            <div className="h-full w-full bg-black relative flex flex-col font-sans overflow-hidden">
                <div className="pt-24 flex flex-col items-center z-10 shrink-0">
                    <div className="text-xs font-mono text-neutral-500 mb-2 tracking-[0.2em] font-medium">{virtualTime.day.toUpperCase()} {formatTime()}</div>
                    <h2 className="text-4xl font-light text-white tracking-[0.3em] uppercase">{char.name}</h2>
                </div>
                {peekLoading && (
                    <div className="flex-1 flex flex-col items-center justify-center -mt-20 z-10"><div className="w-12 h-[1px] bg-neutral-800 mb-12"></div><div className="w-[1px] h-12 bg-gradient-to-b from-transparent via-white to-transparent animate-pulse mb-6"></div><p className="text-sm font-light text-neutral-500 italic tracking-widest">正在感知...</p></div>
                )}
                {!peekLoading && peekStatus && (
                    <div className="flex-1 min-h-0 flex flex-col px-8 pb-10 z-10 animate-fade-in">
                        <div className="flex-1 overflow-y-auto no-scrollbar mb-8 mask-image-gradient pt-8"><div className="min-h-full flex flex-col justify-center"><p className="text-neutral-300 text-[15px] leading-8 tracking-wide text-justify font-light select-none whitespace-pre-wrap">{peekStatus}</p></div></div>
                        <div className="shrink-0 flex flex-col items-center gap-6">
                            <div className="w-full flex gap-3">
                                {/* 修改这里：调用 handleEnterSession 确保开场白被保存 */}
                                <button onClick={handleEnterSession} className="flex-1 h-14 bg-white text-black rounded-full font-bold tracking-[0.1em] text-sm shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95 transition-transform hover:bg-neutral-200">开始见面</button>
                                <button onClick={() => startPeek(char, peekOpeningMode, peekOpeningKeywords)} className="w-14 h-14 bg-neutral-800 text-white rounded-full flex items-center justify-center border border-neutral-700 shadow-lg active:scale-90 transition-transform"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></button>
                            </div>
                            <div className="flex flex-col items-center gap-3 text-[10px] text-neutral-600 font-medium tracking-wider"><button onClick={() => { setPreviousMode('peek'); setMode('settings'); }} className="hover:text-neutral-400 transition-colors">布置场景 / 设定立绘</button><button onClick={handleBack} className="hover:text-neutral-400 transition-colors">悄悄离开</button></div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (mode === 'settings') {
        return <DateSettings char={char} onBack={() => setMode(previousMode)} />;
    }

    if (mode === 'session') {
        return (
            <>
                <DateSession
                    char={char}
                    userProfile={userProfile}
                    messages={dateMessages}
                    peekStatus={peekStatus}
                    initialState={forceFreshSession ? undefined : char.savedDateState}
                    onSendMessage={handleSendMessage}
                    onReroll={handleReroll}
                    onExit={onExitSession}
                    onEditMessage={openEditModal}
                    onDeleteMessage={handleDeleteMessage}
                    isSummaryGenerating={isSummaryGenerating}
                    hasPendingSummary={!!pendingAutoSummary}
                    canManualSummary={canManualSummary}
                    canAutoSummary={canAutoSummary}
                    summaryDisabledReason={summaryDisabledReason}
                    lastTokenUsage={lastDateTokenUsage}
                    requestDebugSnapshots={dateRequestDebugSnapshots}
                    onRequestSummary={requestManualSummary}
                    onReviewPendingSummary={() => pendingAutoSummary && setActiveSummaryDraft({ ...pendingAutoSummary, fromPendingAuto: true })}
                    onDiscardPendingSummary={discardPendingAutoSummary}
                    onToggleAutoSummary={(enabled) => updateCharacter(char.id, { dateSummaryAutoEnabled: enabled })}
                    onToggleAutoHideSummary={async (enabled) => {
                        updateCharacter(char.id, { dateSummaryAutoHideEnabled: enabled });
                        if (enabled) {
                            await compressExistingDateSummaries();
                            addToast('已开启压缩旧记录', 'success');
                        }
                    }}
                    onChangeThreshold={(threshold) => updateCharacter(char.id, { dateSummaryAutoThreshold: threshold })}
                    onOpenSummarySettings={openSummarySettings}
                    wordCount={char.dateOutputWordCount}
                    writingStyle={char.dateWritingStyle}
                    onChangeWordCount={(count) => updateCharacter(char.id, { dateOutputWordCount: count })}
                    onChangeWritingStyle={(style) => updateCharacter(char.id, { dateWritingStyle: style })}
                    temperature={char.dateTemperature}
                    onChangeTemperature={(temp) => updateCharacter(char.id, { dateTemperature: temp })}
                    fontScale={char.dateFontScale}
                    onChangeFontScale={(scale) => updateCharacter(char.id, { dateFontScale: scale })}
                    translationEnabled={dateTranslationEnabled}
                    translateSourceLang={dateTranslateSourceLang}
                    translateTargetLang={dateTranslateTargetLang}
                    onToggleTranslation={setDateTranslationEnabled}
                    onSetTranslateSourceLang={setDateTranslateSourceLang}
                    onSetTranslateTargetLang={setDateTranslateTargetLang}
                />

                {/* Global Message Edit Modal for Session Mode */}
                <Modal isOpen={isEditModalOpen} title="编辑内容" onClose={() => setIsEditModalOpen(false)} footer={<><button onClick={() => setIsEditModalOpen(false)} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={confirmEditMessage} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl">保存</button></>}>
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full h-32 bg-slate-100 rounded-2xl p-4 resize-none focus:ring-1 focus:ring-primary/20 transition-all text-sm leading-relaxed" />
                </Modal>
                {renderSummaryModal()}
                {renderSummarySettingsModal()}
            </>
        );
    }

    return null;
};

export default DateApp;
