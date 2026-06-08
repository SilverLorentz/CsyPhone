import type { APIConfig, CharacterProfile, Message, UserProfile } from '../types';
import { trackedApiRequest, type ApiRequestTraceMeta } from './apiRequestLedger';
import { extractContent, extractJson, safeFetchJson, safeResponseJson } from './safeApi';
import { safeTimeoutSignal } from './safeTimeout';

const QUICK_SONG_LLM_MAX_TOKENS = 65536;
const QUICK_SONG_TIMEOUT_MS = 300000;
const QUICK_SONG_LYRICS_TIMEOUT_MS = 300000;
const QUICK_SONG_REWRITE_TIMEOUT_MS = 300000;
const MAX_LYRIC_CHARS = 3500;
const MAX_STYLE_PROMPT_CHARS = 2000;
const MAX_CHAT_SNIPPETS = 300;
const MAX_TITLE_CHARS = 14;

const LEGAL_LYRIC_LABELS = [
    '[Intro]',
    '[Verse]',
    '[Pre Chorus]',
    '[Chorus]',
    '[Post Chorus]',
    '[Bridge]',
    '[Hook]',
    '[Interlude]',
    '[Build Up]',
    '[Break]',
    '[Transition]',
    '[Inst]',
    '[Solo]',
    '[Outro]',
] as const;

const ABSTRACT_WORDS = [
    '时光',
    '星辰',
    '大海',
    '永恒',
    '命运',
    '羁绊',
    '银河',
    '宿命',
    '翅膀',
    '星空',
];

export type QuickSongCoverStyle = 'anime' | 'guoman' | 'still_life' | 'scenery';
export type QuickSongCoverTone = 'warm_night' | 'dreamy' | 'rain_blue' | 'neon' | 'morning';

const COVER_STYLE_PROMPTS: Record<QuickSongCoverStyle, string> = {
    anime: 'a polished 2D anime illustration, modern anime key-visual style, clean cel shading with crisp linework, expressive character as the focal subject, soft gradient lighting, vibrant but harmonious colors, detailed background, album-cover composition, 1:1 square, high quality',
    guoman: 'a Chinese donghua-style illustration (guoman aesthetic), painterly rendering with a touch of ink-wash, elegant flowing linework, refined oriental color palette, soft atmospheric light, a subtle guofeng mood, character as the focal subject, cinematic and detailed, album-cover composition, 1:1 square, high quality',
    still_life: 'a still-life illustration album cover, no people, one meaningful object (or a small arrangement) taken from the song\'s scene as the focal subject, soft directional light, intimate close framing, painterly and atmospheric, shallow depth of field, evocative and quiet, 1:1 square, high quality',
    scenery: 'a scenery illustration album cover, the place and atmosphere where the song\'s moment happens, no people (or one tiny distant silhouette), cinematic wide composition, painterly rendering, evocative light and color, a clear sense of mood and time of day, 1:1 square, high quality',
};

const COVER_TONE_PROMPTS: Record<QuickSongCoverTone, string> = {
    warm_night: 'warm amber and honey tones, gentle late-night glow, cozy',
    dreamy: 'soft pastel palette, hazy dreamy glow, light particles',
    rain_blue: 'desaturated cool blue and teal, rainy nocturnal mood, soft reflections',
    neon: 'retro neon glow, magenta and cyan, nostalgic city-pop vibe',
    morning: 'soft natural morning light, airy bright pastels, fresh and calm',
};

export interface QuickSongMemoryHeader {
    id: string;
    title: string;
    content: string;
    emotionalJourney?: string;
    importance: number;
    createdAt: number;
    updatedAt?: number;
    deprecated?: boolean;
    salienceScore?: number;
    mentionCount?: number;
    lastMentioned?: number;
    level?: number;
    source?: string;
}

export interface QuickSongMaterialBundle {
    materialText: string;
    sourceMemoryIds: string[];
    sourceMessageIds: number[];
}

export interface QuickSongLyricsResult {
    title: string;
    lyrics: string;
}

export interface QuickSongRewriteResult extends QuickSongLyricsResult {
    note?: string;
}

export interface QuickSongStylePromptResult {
    stylePrompt: string;
}

export interface QuickSongTitleResult {
    title: string;
}

export interface QuickSongCoverSceneResult {
    lockedMoment: string;
    scene: string;
}

export interface QuickSongCoverStyleChoice {
    style: QuickSongCoverStyle;
    tone: QuickSongCoverTone;
}

export interface QuickSongCoverPromptResult extends QuickSongCoverStyleChoice {
    prompt: string;
    negativePrompt: string;
    includesCharacter: boolean;
}

interface GenerateQuickSongLyricsOptions {
    apiConfig: APIConfig;
    char: CharacterProfile;
    userProfile: UserProfile;
    materialText: string;
}

interface RewriteQuickSongLyricsOptions extends GenerateQuickSongLyricsOptions {
    lyrics: string;
}

interface GenerateQuickSongStylePromptOptions {
    apiConfig: APIConfig;
    lyrics: string;
}

interface GenerateQuickSongTitleOptions {
    apiConfig: APIConfig;
    lyrics: string;
}

interface GenerateQuickSongCoverSceneOptions {
    apiConfig: APIConfig;
    lyrics: string;
    stylePrompt: string;
}

interface ChooseQuickSongCoverStyleOptions {
    apiConfig: APIConfig;
    lockedMoment: string;
    stylePrompt: string;
}

interface QuickSongLlmOptions {
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    reason?: string;
    stream?: boolean;
}

interface QuickSongStreamDiagnostics {
    stream: true;
    reason: string;
    model: string;
    baseUrl: string;
    url: string;
    elapsedMs: number;
    firstChunkReceived: boolean;
    receivedChars: number;
    reasoningChars: number;
    finishReason: string | null;
    contentType?: string;
    fallbackAttempted?: boolean;
}

class QuickSongLlmStreamError extends Error {
    diagnostics: QuickSongStreamDiagnostics;

    constructor(message: string, diagnostics: QuickSongStreamDiagnostics, cause?: unknown) {
        super(message);
        this.name = 'QuickSongLlmStreamError';
        this.diagnostics = diagnostics;
        const causeDetail = cause instanceof Error
            ? { name: cause.name, message: cause.message, stack: cause.stack }
            : cause;
        (this as Error & { cause?: unknown }).cause = cause === undefined
            ? diagnostics
            : { diagnostics, cause: causeDetail };
    }
}

function clampText(value: string, maxLength: number): string {
    const trimmed = value.trim();
    return trimmed.length > maxLength ? trimmed.slice(0, maxLength).trim() : trimmed;
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeInlineText(value: unknown): string {
    return String(value || '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function stripCodeFence(value: string): string {
    return value
        .replace(/^```(?:text|lyrics|markdown|json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();
}

function cleanOneLine(value: string, maxLength = 700): string {
    return clampText(
        stripCodeFence(value)
            .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
            .replace(/\s*\n+\s*/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim(),
        maxLength,
    );
}

function normalizeLyricLabels(lyrics: string): string {
    const legalByKey = new Map(LEGAL_LYRIC_LABELS.map(label => [
        label.slice(1, -1).toLowerCase().replace(/[\s-]+/g, ' '),
        label,
    ]));

    return lyrics.replace(/\[([^\]]+)\]/g, (full, rawLabel: string) => {
        const key = rawLabel
            .replace(/[–—-]/g, ' ')
            .replace(/^\s*(final|last)\s+/i, '')
            .replace(/\s+\d+\s*$/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        return legalByKey.get(key) || full;
    });
}

export function extractQuickSongLyrics(raw: string): string {
    const text = stripCodeFence(raw || '');
    const json = extractJson(text, { logFailure: false });
    const jsonLyrics = json && typeof json === 'object'
        ? String(json.lyrics || json.LYRICS || json.text || json.content || '').trim()
        : '';
    const markerMatch = text.match(/===\s*LYRICS\s*===([\s\S]*?)(?:===\s*END\s*===|$)/i);
    const markerStart = text.search(/===\s*LYRICS\s*===/i);
    const labelStart = text.search(/\[(?:Intro|Verse|Pre[\s-]?Chorus|Chorus|Post[\s-]?Chorus|Bridge|Hook|Interlude|Build[\s-]?Up|Break|Transition|Inst|Solo|Outro)(?:\s+\d+)?\]/i);
    const source = markerMatch
        ? markerMatch[1]
        : markerStart >= 0
            ? text.slice(markerStart).replace(/^===\s*LYRICS\s*===/i, '')
            : jsonLyrics
                ? jsonLyrics
                : labelStart >= 0
                    ? text.slice(labelStart)
                    : text;
    const lyrics = source
        .replace(/===\s*END\s*=*[\s\S]*$/i, '')
        .replace(/\n\s*(?:再一行|改了什么|修改说明|说明)[:：][\s\S]*$/i, '');
    return clampLyrics(normalizeLyricLabels(normalizeWhitespace(stripCodeFence(lyrics))));
}

export function extractQuickSongRewriteNote(raw: string): string | undefined {
    const endIndex = raw.search(/===END===/i);
    if (endIndex < 0) return undefined;
    const note = raw.slice(endIndex).replace(/===END===/i, '').trim();
    return note ? clampText(note.replace(/^再一行[:：]?\s*/i, ''), 160) : undefined;
}

export function extractQuickSongStylePrompt(raw: string): string {
    const text = stripCodeFence(raw || '');
    const match = text.match(/===PROMPT===([\s\S]*?)===END===/i);
    const prompt = match ? match[1] : text;
    return clampText(
        prompt
            .replace(/\s*\n+\s*/g, ', ')
            .replace(/，/g, ',')
            .replace(/,+/g, ',')
            .replace(/^\s*,\s*|\s*,\s*$/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim(),
        MAX_STYLE_PROMPT_CHARS,
    );
}

function clampLyrics(lyrics: string): string {
    return clampText(lyrics, MAX_LYRIC_CHARS);
}

function formatMessageSnippet(message: Message, userName: string, charName: string): string {
    const speaker = message.role === 'user' ? userName : message.role === 'assistant' ? charName : '系统';
    const sourceText = typeof message.metadata?.sourceText === 'string'
        ? message.metadata.sourceText
        : message.content;
    const typeLabel = message.type === 'voice' ? '语音' : message.type === 'interaction' ? '互动' : message.type;
    const text = normalizeInlineText(sourceText);
    return text ? `- ${speaker}（${typeLabel}｜${message.id}）：${text}` : '';
}

function scoreMemory(memory: QuickSongMemoryHeader): number {
    return (memory.level === 1 ? 1000 : 0)
        + (memory.salienceScore || 0) * 12
        + (memory.importance || 0) * 8
        + Math.min(memory.mentionCount || 0, 8) * 2
        + Math.min((memory.lastMentioned || memory.updatedAt || memory.createdAt || 0) / 1000000000000, 2);
}

function formatCharacterContext(char: CharacterProfile, userProfile: UserProfile): string {
    const cityLines = [
        char.cityOverride ? `城市设定：${char.cityOverride}` : '',
        char.cityReferenceReal ? `城市参考：${char.cityReferenceReal}` : '',
        char.isFictionalCity ? '城市类型：架空城市' : '',
    ].filter(Boolean);

    const personaLines = [
        `角色名：${char.name}`,
        char.description ? `角色简介：${char.description}` : '',
        char.systemPrompt ? `角色人设 / 系统设定：\n${char.systemPrompt}` : '',
        char.worldview ? `世界观：\n${char.worldview}` : '',
        char.writerPersona ? `写作人格：\n${char.writerPersona}` : '',
        ...cityLines,
    ].filter(Boolean);

    const userLines = [
        `用户名：${userProfile.name || '用户'}`,
        userProfile.bio ? `用户简介：${userProfile.bio}` : '',
        userProfile.photoAppearancePrompt ? `用户外貌提示：${userProfile.photoAppearancePrompt}` : '',
        char.photoAppearancePrompt ? `${char.name}外貌提示：${char.photoAppearancePrompt}` : '',
    ].filter(Boolean);

    return [
        '【角色人设 / 世界前提】',
        personaLines.length ? personaLines.join('\n') : '- 暂无额外人设',
        '',
        '【用户资料】',
        userLines.join('\n'),
    ].join('\n');
}

function formatWorldbooks(char: CharacterProfile): string {
    const books = Array.isArray(char.mountedWorldbooks) ? char.mountedWorldbooks : [];
    return [
        '【世界书】',
        books.length
            ? books.map((book, index) => [
                `#${index + 1} ${book.title || book.id}`,
                book.category ? `分类：${book.category}` : '',
                book.position ? `位置：${book.position}` : '',
                normalizeInlineText(book.content),
            ].filter(Boolean).join('\n')).join('\n\n')
            : '- 暂无世界书',
    ].join('\n');
}

function formatCoreMemories(char: CharacterProfile): string {
    const fragments = Array.isArray(char.memories) ? char.memories : [];
    const refined = char.refinedMemories || {};
    const activeMonths = Array.isArray(char.activeMemoryMonths) ? char.activeMemoryMonths : [];

    const fragmentLines = fragments.map(memory => {
        const mood = memory.mood ? `｜${memory.mood}` : '';
        return `- ${memory.date || '未标日期'}${mood}：${normalizeInlineText(memory.summary)}`;
    });
    const refinedLines = Object.entries(refined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `- ${key}：${normalizeInlineText(value)}`);

    return [
        '【核心记忆】',
        fragmentLines.length ? fragmentLines.join('\n') : '- 暂无核心记忆',
        '',
        '【月度 / 提炼记忆】',
        activeMonths.length ? `启用月份：${activeMonths.join('、')}` : '启用月份：未指定',
        refinedLines.length ? refinedLines.join('\n') : '- 暂无提炼记忆',
    ].join('\n');
}

function formatImpression(char: CharacterProfile): string {
    const imp = char.impression;
    if (!imp) return '【对用户的印象】\n- 暂无结构化印象';

    const lines = [
        imp.lastUpdated ? `更新时间：${new Date(imp.lastUpdated).toLocaleString()}` : '',
        imp.value_map?.likes?.length ? `喜欢 / 珍视：${imp.value_map.likes.join('、')}` : '',
        imp.value_map?.dislikes?.length ? `不喜欢 / 避免：${imp.value_map.dislikes.join('、')}` : '',
        imp.value_map?.core_values ? `核心价值：${imp.value_map.core_values}` : '',
        imp.behavior_profile?.tone_style ? `语气风格：${imp.behavior_profile.tone_style}` : '',
        imp.behavior_profile?.emotion_summary ? `情绪摘要：${imp.behavior_profile.emotion_summary}` : '',
        imp.behavior_profile?.response_patterns ? `回应模式：${imp.behavior_profile.response_patterns}` : '',
        imp.emotion_schema?.triggers?.positive?.length ? `正向触发：${imp.emotion_schema.triggers.positive.join('、')}` : '',
        imp.emotion_schema?.triggers?.negative?.length ? `负向触发：${imp.emotion_schema.triggers.negative.join('、')}` : '',
        imp.emotion_schema?.comfort_zone ? `舒适区：${imp.emotion_schema.comfort_zone}` : '',
        imp.emotion_schema?.stress_signals?.length ? `压力信号：${imp.emotion_schema.stress_signals.join('、')}` : '',
        imp.personality_core?.observed_traits?.length ? `观察到的特质：${imp.personality_core.observed_traits.join('、')}` : '',
        imp.personality_core?.interaction_style ? `互动风格：${imp.personality_core.interaction_style}` : '',
        imp.personality_core?.summary ? `人格摘要：${imp.personality_core.summary}` : '',
        imp.mbti_analysis?.type ? `MBTI 参考：${imp.mbti_analysis.type}（${imp.mbti_analysis.reasoning || '无说明'}）` : '',
        imp.observed_changes?.length ? `观察到的变化：${imp.observed_changes.join('、')}` : '',
    ].filter(Boolean);

    return [
        '【对用户的印象】',
        lines.length ? lines.join('\n') : '- 暂无结构化印象',
    ].join('\n');
}

function isL1Memory(memory: QuickSongMemoryHeader): boolean {
    return memory.level === 1 || memory.source === 'distillation';
}

function formatMemoryLine(memory: QuickSongMemoryHeader): string {
    const parts = [
        memory.content,
        memory.emotionalJourney ? `情绪轨迹：${memory.emotionalJourney}` : '',
    ].filter(Boolean);
    const meta = [
        `重要度 ${memory.importance || 0}`,
        memory.salienceScore ? `显著度 ${memory.salienceScore}` : '',
        memory.mentionCount ? `提及 ${memory.mentionCount}` : '',
    ].filter(Boolean).join(' / ');
    return `- ${memory.title}（${meta}）：${normalizeInlineText(parts.join('；'))}`;
}

function formatVectorMemories(memories: QuickSongMemoryHeader[]): string {
    const available = memories
        .filter(memory => !memory.deprecated)
        .sort((a, b) => scoreMemory(b) - scoreMemory(a));
    const l1 = available.filter(isL1Memory);
    const l0 = available.filter(memory => !isL1Memory(memory));

    return [
        '【向量中对用户的认知 / L1】',
        l1.length ? l1.map(formatMemoryLine).join('\n') : '- 暂无 L1 认知记忆',
        '',
        '【向量记忆 / 具体片段】',
        l0.length ? l0.map(formatMemoryLine).join('\n') : '- 暂无 L0 向量片段',
    ].join('\n');
}

export function buildQuickSongMaterialBundle(options: {
    messages: Message[];
    memories: QuickSongMemoryHeader[];
    char: CharacterProfile;
    userProfile: UserProfile;
}): QuickSongMaterialBundle {
    const userName = options.userProfile.name || '用户';
    const charName = options.char.name;
    const chatSnippets = options.messages
        .filter(message => message.role === 'user' || message.role === 'assistant')
        .filter(message => ['text', 'voice', 'interaction'].includes(message.type))
        .slice(-MAX_CHAT_SNIPPETS)
        .map(message => ({
            id: message.id,
            text: formatMessageSnippet(message, userName, charName),
        }))
        .filter(item => item.text);

    const availableMemories = options.memories.filter(memory => !memory.deprecated);
    const materialText = [
        formatCharacterContext(options.char, options.userProfile),
        '',
        formatWorldbooks(options.char),
        '',
        formatCoreMemories(options.char),
        '',
        formatImpression(options.char),
        '',
        formatVectorMemories(options.memories),
        '',
        '【最近 300 条聊天】',
        chatSnippets.length > 0 ? chatSnippets.map(item => item.text).join('\n') : '- 暂无可用聊天片段',
    ].join('\n');

    return {
        materialText,
        sourceMemoryIds: availableMemories.map(item => item.id),
        sourceMessageIds: chatSnippets.map(item => item.id),
    };
}

function extractStreamTextDelta(payload: any): string {
    const choice = payload?.choices?.[0];
    return choice?.delta?.content
        || choice?.delta?.text
        || choice?.message?.content
        || '';
}

function extractStreamReasoningDelta(payload: any): string {
    const delta = payload?.choices?.[0]?.delta;
    return delta?.reasoning_content
        || delta?.thinking
        || delta?.reasoning
        || '';
}

function getFinishReason(payload: any): string | null {
    const choice = payload?.choices?.[0];
    return choice?.finish_reason || choice?.finishReason || null;
}

function createLengthFinishError(diagnostics: QuickSongStreamDiagnostics): QuickSongLlmStreamError {
    return new QuickSongLlmStreamError(
        '模型输出达到 max_tokens 上限（finish_reason: length），歌词可能被截断；请提高上限或稍后重试。',
        diagnostics,
    );
}

function canFallbackToNonStreaming(error: unknown): boolean {
    return error instanceof QuickSongLlmStreamError
        && !error.diagnostics.firstChunkReceived
        && error.diagnostics.finishReason !== 'length';
}

function buildTrace(url: string, apiConfig: APIConfig, options?: QuickSongLlmOptions): ApiRequestTraceMeta {
    return {
        feature: 'chat',
        reason: options?.reason || '聊天页快捷生歌',
        model: apiConfig.model,
        userInitiated: true,
        url,
    };
}

async function callQuickSongLlmNonStreaming(
    apiConfig: APIConfig,
    url: string,
    body: Record<string, unknown>,
    options?: QuickSongLlmOptions,
): Promise<string> {
    const data = await safeFetchJson(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({ ...body, stream: false }),
        signal: safeTimeoutSignal(options?.timeoutMs ?? QUICK_SONG_TIMEOUT_MS),
    }, 2, buildTrace(url, apiConfig, options));

    return extractContent(data);
}

async function callQuickSongLlmStreaming(
    apiConfig: APIConfig,
    url: string,
    body: Record<string, unknown>,
    options?: QuickSongLlmOptions,
): Promise<string> {
    const startedAt = Date.now();
    const reason = options?.reason || '聊天页快捷生歌';
    let content = '';
    let reasoningContent = '';
    let finishReason: string | null = null;
    let contentType = '';
    let firstChunkReceived = false;

    const diagnostics = (): QuickSongStreamDiagnostics => ({
        stream: true,
        reason,
        model: apiConfig.model,
        baseUrl: apiConfig.baseUrl,
        url,
        elapsedMs: Date.now() - startedAt,
        firstChunkReceived,
        receivedChars: content.length,
        reasoningChars: reasoningContent.length,
        finishReason,
        contentType: contentType || undefined,
    });

    try {
        return await trackedApiRequest(buildTrace(url, apiConfig, { ...options, reason: `${reason}（流式）` }), async () => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiConfig.apiKey}`,
                },
                body: JSON.stringify({ ...body, stream: true }),
                signal: safeTimeoutSignal(options?.timeoutMs ?? QUICK_SONG_TIMEOUT_MS),
            });

            contentType = response.headers.get('content-type') || '';

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new QuickSongLlmStreamError(
                    `流式写歌词请求失败 (HTTP ${response.status}): ${text.slice(0, 200) || response.statusText}`,
                    diagnostics(),
                );
            }

            if (!response.body || contentType.includes('application/json')) {
                const data = await safeResponseJson(response);
                finishReason = getFinishReason(data);
                content = extractContent(data);
                firstChunkReceived = Boolean(content);
                if (finishReason === 'length') {
                    throw createLengthFinishError(diagnostics());
                }
                return content;
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
                    finishReason = getFinishReason(payload) || finishReason;

                    const reasoningDelta = extractStreamReasoningDelta(payload);
                    if (reasoningDelta) {
                        reasoningContent += reasoningDelta;
                        firstChunkReceived = true;
                    }

                    const delta = extractStreamTextDelta(payload);
                    if (delta) {
                        content += delta;
                        firstChunkReceived = true;
                    }
                } catch {
                    // Ignore non-JSON keepalive/comment lines from OpenAI-compatible streams.
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
            if (finishReason === 'length') {
                throw createLengthFinishError(diagnostics());
            }
            if (!content.trim()) {
                throw new QuickSongLlmStreamError('流式写歌词没有返回正文内容。', diagnostics());
            }
            return content.trim();
        });
    } catch (error) {
        if (error instanceof QuickSongLlmStreamError) throw error;

        throw new QuickSongLlmStreamError(
            error instanceof Error ? error.message : String(error),
            diagnostics(),
            error,
        );
    }
}

async function callQuickSongLlm(
    apiConfig: APIConfig,
    messages: { role: 'system' | 'user'; content: string }[],
    options?: QuickSongLlmOptions,
): Promise<string> {
    if (!apiConfig.apiKey || !apiConfig.baseUrl || !apiConfig.model) {
        throw new Error('请先配置主模型 API，才能从聊天生成歌词');
    }

    const url = `${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const body = {
        model: apiConfig.model,
        messages,
        temperature: options?.temperature ?? 0.9,
        max_tokens: options?.maxTokens ?? QUICK_SONG_LLM_MAX_TOKENS,
    };

    if (options?.stream) {
        try {
            return await callQuickSongLlmStreaming(apiConfig, url, body, options);
        } catch (error) {
            if (!canFallbackToNonStreaming(error)) throw error;

            (error as QuickSongLlmStreamError).diagnostics.fallbackAttempted = true;
            try {
                return await callQuickSongLlmNonStreaming(
                    apiConfig,
                    url,
                    body,
                    {
                        ...options,
                        reason: `${options.reason || '聊天页快捷生歌'}（流式失败后非流式兜底）`,
                        stream: false,
                    },
                );
            } catch (fallbackError) {
                const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                const combined = new Error(`流式写歌词失败，非流式兜底也失败：${message}`);
                (combined as Error & { cause?: unknown }).cause = {
                    streamDiagnostics: (error as QuickSongLlmStreamError).diagnostics,
                    fallbackError: message,
                };
                throw combined;
            }
        }
    }

    return callQuickSongLlmNonStreaming(apiConfig, url, body, options);
}

function buildLyricsPrompt(charName: string, materialText: string): string {
    return `你在为「用户」和「${charName}」之间这段真实关系写一首中文歌词。像个有故事的人那样写，不要像 AI。

【素材】
${materialText}

【铁律｜违反任一条即失败】
1. 从素材里挑【一个具体的瞬间或细节】（一句原话、一个动作、一件东西、一个时间点），整首围着它写。绝不写"关系总结"（"走过四季""你是我的全部"这类）。
2. 不准出现情绪的名字——不准用"想念 / 爱你 / 心动 / 温暖 / 幸福"这类词。用画面、动作、身体反应让人感觉到。
3. 少用空泛大词：${ABSTRACT_WORDS.join('、')}……能不用就不用；非用不可，必须立刻落到一个具体的东西上。
4. 至少 3 处只属于这段关系的专属细节，让别人套不进去。
5. 必须有自然押韵或近韵，尤其 [Chorus] 四行要有能记住的韵脚；但不要写成口号或顺口溜。
6. 别工整到像填表：长短句、口语、断句、留白都可以；细节放主歌，副歌只留一个清楚的钩子。
7. 克制：点到为止，不喊口号、不堆甜。用到的比喻 / 意象不解释。

【结构｜给 MiniMax 唱】
- 用结构标签，合法标签仅限：${LEGAL_LYRIC_LABELS.join(' ')}
- 标准流行骨架：可有 [Intro]；[Verse] 必须 4 行；[Pre Chorus] 2 行；[Chorus] 必须 4 行；第二段 [Verse] 仍然 4 行；后面再重复一次完整 [Chorus]。
- [Chorus] 的 4 行要能整段重复，且有一句反复出现的钩子句；钩子最好就是那个具体细节的升华。
- 主歌铺专属细节，副歌落点，留一条情绪弧线。副歌不要塞太多新信息。
- 行别太密，留换气和拖腔的空间；每行尽量 6-18 个汉字，长句要拆行。
- 全部 \\n 分行，总长 ≤ 3500 字符。

【输出】
只输出歌词本体，用 ===LYRICS=== 和 ===END=== 包起来。`;
}

function buildRewritePrompt(materialText: string, lyrics: string): string {
    return `下面是一版歌词。你的任务不是打分，是【改写】：让它更押韵、更合节奏、更具体、更有人味、更能被 MiniMax 唱。改完直接给新版。

先查可唱性，再查具体度：
- [Verse] 是否每段 4 行？[Chorus] 是否 4 行且整段重复？钩子句是否反复出现？不满足就修。
- 押韵 / 近韵是否自然？副歌韵脚是否能被记住？没有就改，但不要写成顺口溜。
- 行太密、MiniMax 唱不动？→ 拆短、留换气。
- 有空泛大词（时光 / 星辰 / 海 / 永恒…）？→ 换成具体的东西，或删。
- 有直接喊情绪（"想你""爱你""幸福"）？→ 改成画面 / 动作。
- 有烂俗意象（星空 / 翅膀 / 海）？→ 换成只属于这段关系的细节。
- 专属细节够吗（≥3 处）？→ 不够就从【素材】补。
- 对仗太工整、像填表？→ 打散，加长短句 / 口语。
- 结构标签合法吗？总长 ≤3500 吗？→ 修正。

【红线｜最重要】
你的活儿是让它更具体、更能唱——绝不是让它更工整、更"安全"、更平。
如果你的改动让它更像一首标准情歌，你就改错了，重来。

【素材】（补细节用）
${materialText}

【待改写歌词】
${lyrics}

【输出】
===LYRICS===
{改写后的完整歌词，带结构标签}
===END===
再一行：改了什么、为什么（≤2 句）。`;
}

function buildStylePromptUserPrompt(lyrics: string): string {
    return `下面是一首歌的定稿歌词。给它配一段 MiniMax 用的曲风描述（谱曲接口的 prompt 字段）。

从歌词读出情绪、场景、能量，然后定：体裁 + 情绪 + 配器 + 人声 + 速度 / 氛围。要点：
- 跟着歌词的情绪走，别和词打架（克制的深夜就别上史诗大编曲）。
- 人声性别 / 气质按这段关系里"唱歌的那个人"定（男声 / 女声、温柔 / 沙哑…）。
- 用英文、逗号分隔的短语，10–20 个词，别堆。
- 只输出那串描述，别解释，≤2000 字符。

【定稿歌词】
${lyrics}

只输出曲风描述本身，一行。`;
}

function buildTitlePrompt(lyrics: string): string {
    return `下面是一首已经定稿的中文歌词。请给它起一个歌名。

【歌名】
- 歌名不是歌词。不要直接抄副歌、不要抄任何一句词当标题，也不要用一个完整的句子。
- 从这首歌里挑一个最具体的"物"或"画面"（一件东西、一个动作、一个场景），让这个细节替整首歌说话，而不是去总结这段关系。
- 长度 2–6 个字，最多不超过 8 个字。太长既会被截断，也不像歌名。
- 越具体越好，越克制越好。不要用"爱 / 心动 / 温柔 / 永远 / 陪伴 / 救赎"这类空泛大词，也不要写关系总结（谁和谁、是什么样的感情）。
- 可以有一点反差或双关（软的词配硬的词），但不要写成玩笑或网络梗。
- 只输出歌名本身，不要加书名号、引号或任何解释。

【定稿歌词】
${lyrics}

只输出歌名本身。`;
}

const TITLE_FORBIDDEN_WORDS = [
    '爱',
    '心动',
    '温柔',
    '永远',
    '陪伴',
    '救赎',
    '想念',
    '幸福',
    '命运',
    '羁绊',
    '时光',
    '星辰',
    '大海',
    '关系',
    '我们',
    '你和我',
];

const TITLE_CONCRETE_TERMS = [
    '蓝杯子',
    '便利店',
    '到家',
    '屏幕',
    '窗边',
    '杯子',
    '路灯',
    '钥匙',
    '门口',
    '电梯',
    '月台',
    '车站',
    '伞',
    '雨伞',
    '外套',
    '围巾',
    '耳机',
    '照片',
    '纸条',
    '抽屉',
    '沙发',
    '餐桌',
    '床头',
    '咖啡',
    '奶茶',
    '糖',
    '灯',
    '雨',
    '晚安',
    '消息',
];

function stripTitleDecorations(raw: string): string {
    return raw
        .replace(/^```(?:text|json|lyrics)?\s*/i, '')
        .replace(/```$/g, '')
        .replace(/^["“”'‘’《〈「『【\[]+/, '')
        .replace(/["“”'‘’》〉」』】\]]+$/g, '')
        .replace(/^歌名\s*[:：]\s*/i, '')
        .replace(/^title\s*[:：]\s*/i, '')
        .trim();
}

function extractConcreteTitleFromLine(line: string): string {
    const found: string[] = [];
    for (const term of TITLE_CONCRETE_TERMS) {
        if (!line.includes(term)) continue;
        if (found.some(item => item.includes(term) || term.includes(item))) continue;
        found.push(term);
    }

    if (found.length >= 2) {
        const combined = found.slice(0, 2).join('');
        if (combined.length >= 2 && combined.length <= 8) return combined;
    }

    return found.find(term => term.length >= 2 && term.length <= 8) || '';
}

function normalizeQuickSongTitleCandidate(raw: string, fallbackLyrics?: string): string {
    const parsed = extractJson(raw);
    const jsonTitle = typeof parsed?.title === 'string'
        ? parsed.title
        : typeof parsed?.songTitle === 'string'
            ? parsed.songTitle
            : '';
    const source = jsonTitle || raw;
    const firstLine = source
        .split(/\n+/)
        .map(line => stripTitleDecorations(line.trim()))
        .find(Boolean) || '';
    let title = stripTitleDecorations(firstLine)
        .replace(/[，。,.!?！？、:：；;（）()]/g, '')
        .replace(/\s+/g, '');

    if (!title || TITLE_FORBIDDEN_WORDS.some(word => title === word || title.includes(word) && title.length > 6)) {
        return fallbackLyrics ? deriveQuickSongTitle(fallbackLyrics) : '这一刻';
    }

    if (title.length > 8) {
        const concrete = extractConcreteTitleFromLine(title);
        title = concrete || title.slice(0, 8);
    }

    if (title.length < 2) {
        return fallbackLyrics ? deriveQuickSongTitle(fallbackLyrics) : '这一刻';
    }

    return title;
}

export function deriveQuickSongTitle(lyrics: string): string {
    const lines = lyrics
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean);
    const chorusIndex = lines.findIndex(line => /^\[Chorus\]/i.test(line));
    const lyricLines = (chorusIndex >= 0 ? lines.slice(chorusIndex + 1) : lines)
        .filter(line => !/^\[[^\]]+\]$/.test(line));
    for (const line of lyricLines) {
        const concrete = extractConcreteTitleFromLine(line);
        if (concrete) return concrete;
    }
    const cleaned = (lyricLines[0] || '这一刻')
        .replace(/[，。,.!?！？、"“”'‘’]/g, '')
        .replace(/\s+/g, '');
    return clampText(cleaned || '这一刻', 8);
}

export function extractQuickSongTitle(raw: string, fallbackLyrics?: string): string {
    return normalizeQuickSongTitleCandidate(raw, fallbackLyrics);
}

export async function generateQuickSongLyrics(options: GenerateQuickSongLyricsOptions): Promise<QuickSongLyricsResult> {
    const raw = await callQuickSongLlm(
        options.apiConfig,
        [
            { role: 'system', content: '你是成熟的中文歌词作者，只写有具体细节、押韵、有节奏、能被唱出来的歌词。' },
            { role: 'user', content: buildLyricsPrompt(options.char.name, options.materialText) },
        ],
        {
            temperature: 1.8,
            maxTokens: QUICK_SONG_LLM_MAX_TOKENS,
            timeoutMs: QUICK_SONG_LYRICS_TIMEOUT_MS,
            reason: '聊天快捷生歌：写歌词',
            stream: true,
        },
    );
    const lyrics = extractQuickSongLyrics(raw);
    if (!lyrics) throw new Error('歌词生成失败：模型没有返回歌词');
    return { title: deriveQuickSongTitle(lyrics), lyrics };
}

export async function rewriteQuickSongLyrics(options: RewriteQuickSongLyricsOptions): Promise<QuickSongRewriteResult> {
    const raw = await callQuickSongLlm(
        options.apiConfig,
        [
            { role: 'system', content: '你是中文歌词改写与制作前质检。先修押韵、节奏和可唱性，再补具体细节，不要修成通用情歌。' },
            { role: 'user', content: buildRewritePrompt(options.materialText, options.lyrics) },
        ],
        {
            temperature: 0.42,
            maxTokens: QUICK_SONG_LLM_MAX_TOKENS,
            timeoutMs: QUICK_SONG_REWRITE_TIMEOUT_MS,
            reason: '聊天快捷生歌：质检改写歌词',
            stream: true,
        },
    );
    const lyrics = extractQuickSongLyrics(raw);
    if (!lyrics) throw new Error('歌词改写失败：模型没有返回歌词');
    return {
        title: deriveQuickSongTitle(lyrics),
        lyrics,
        note: extractQuickSongRewriteNote(raw),
    };
}

export async function generateQuickSongTitle(options: GenerateQuickSongTitleOptions): Promise<QuickSongTitleResult> {
    const raw = await callQuickSongLlm(
        options.apiConfig,
        [
            { role: 'system', content: '你只负责给中文歌起短歌名。歌名必须具体、克制，像一个物件或画面，不要解释。' },
            { role: 'user', content: buildTitlePrompt(options.lyrics) },
        ],
        { temperature: 0.55, maxTokens: 512, timeoutMs: 90000, reason: '聊天快捷生歌：生成歌名' },
    );
    return { title: extractQuickSongTitle(raw, options.lyrics) };
}

export async function generateQuickSongStylePrompt(options: GenerateQuickSongStylePromptOptions): Promise<QuickSongStylePromptResult> {
    const raw = await callQuickSongLlm(
        options.apiConfig,
        [
            { role: 'system', content: '你是给 MiniMax music-2.6-free 写曲风 prompt 的音乐制作人，只输出可执行的英文标签。' },
            { role: 'user', content: buildStylePromptUserPrompt(options.lyrics) },
        ],
        { temperature: 0.5, maxTokens: 3000, timeoutMs: 90000, reason: '聊天快捷生歌：生成曲风 prompt' },
    );
    const stylePrompt = extractQuickSongStylePrompt(raw);
    if (!stylePrompt) {
        return { stylePrompt: 'indie pop, intimate, soft vocal, warm guitar, slow tempo, late-night, restrained, conversational' };
    }
    return { stylePrompt };
}

function getLyricBlocks(lyrics: string): Array<{ label: string; lines: string[] }> {
    const blocks: Array<{ label: string; lines: string[] }> = [];
    let current: { label: string; lines: string[] } | null = null;
    for (const rawLine of lyrics.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const labelMatch = line.match(/^\[([^\]]+)\]$/);
        if (labelMatch) {
            current = { label: `[${labelMatch[1]}]`, lines: [] };
            blocks.push(current);
            continue;
        }
        if (!current) {
            current = { label: '[Verse]', lines: [] };
            blocks.push(current);
        }
        current.lines.push(line);
    }
    return blocks;
}

export function extractQuickSongCoverMoment(lyrics: string): string {
    const blocks = getLyricBlocks(lyrics);
    const verse = blocks.find(block => block.label === '[Verse]' && block.lines.length > 0);
    const chorus = blocks.find(block => block.label === '[Chorus]' && block.lines.length > 0);
    const selectedLines = [
        ...(verse?.lines.slice(0, 4) || []),
        ...(chorus?.lines.slice(0, 4) || []),
    ];
    return clampText(selectedLines.join('\n') || lyrics, 700);
}

function buildCoverScenePrompt(lockedMoment: string, stylePrompt: string): string {
    return `你要为一首歌做封面。下面是这首歌锁定的那个具体瞬间和它的情绪。把它转成【一到两句、适合做唱片封面的画面描述】：把画面里的**人、关键物件、所在场景 / 地点**都点出来，有镜头感；不要抽象，不要照抄歌词原文，画面里不要出现文字。

【歌词锁定的瞬间】${lockedMoment}
【情绪 / 曲风】${stylePrompt}

只输出那句画面描述，一行，别的都不要。`;
}

export async function generateQuickSongCoverScene(options: GenerateQuickSongCoverSceneOptions): Promise<QuickSongCoverSceneResult> {
    const lockedMoment = extractQuickSongCoverMoment(options.lyrics);
    const raw = await callQuickSongLlm(
        options.apiConfig,
        [
            { role: 'system', content: '你是唱片封面视觉导演，只把歌词里的具体瞬间转成清楚的封面画面。' },
            { role: 'user', content: buildCoverScenePrompt(lockedMoment, options.stylePrompt) },
        ],
        { temperature: 0.35, maxTokens: 1200, timeoutMs: 90000, reason: '聊天快捷生歌：封面画面描述' },
    );
    const scene = cleanOneLine(raw, 700);
    if (!scene) throw new Error('封面画面生成失败：模型没有返回画面描述');
    return { lockedMoment, scene };
}

function buildCoverStyleChoicePrompt(lockedMoment: string, stylePrompt: string): string {
    return `要给一首歌做封面，先定用哪套画风、哪个色调。

【画风四选一】看锁定瞬间的核心：
- 核心是两个人 / 一个互动动作 → anime
- 想要中式 / 国风味的人物画 → guoman
- 核心是一件有意义的东西（物件）→ still_life
- 核心是一个地点 / 氛围（没有人物特写）→ scenery
拿不准 → anime

【色调五选一】看曲风情绪：
- 温暖 / 亲密 / 深夜 → warm_night
- 甜 / 朦胧 / 浪漫 → dreamy
- 难过 / 思念 / 安静 → rain_blue
- 轻快 / 怀旧 / 复古 → neon
- 清新 / 希望 / 清晨 → morning

【锁定瞬间】${lockedMoment}
【曲风情绪】${stylePrompt}

只输出一行 JSON，别的都不要：{"style":"…","tone":"…"}`;
}

function normalizeCoverStyleChoice(value: unknown): QuickSongCoverStyleChoice | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const style = String(raw.style || '').trim() as QuickSongCoverStyle;
    const tone = String(raw.tone || '').trim() as QuickSongCoverTone;
    if (!Object.prototype.hasOwnProperty.call(COVER_STYLE_PROMPTS, style)) return null;
    if (!Object.prototype.hasOwnProperty.call(COVER_TONE_PROMPTS, tone)) return null;
    return { style, tone };
}

function fallbackCoverTone(stylePrompt: string): QuickSongCoverTone {
    const lower = stylePrompt.toLowerCase();
    if (/rain|blue|sad|melanchol|quiet|lonely|miss|tear|nocturnal/.test(lower)) return 'rain_blue';
    if (/dream|romantic|sweet|hazy|pastel/.test(lower)) return 'dreamy';
    if (/retro|city.?pop|neon|nostalg/.test(lower)) return 'neon';
    if (/morning|fresh|hope|bright|airy/.test(lower)) return 'morning';
    return 'warm_night';
}

export async function chooseQuickSongCoverStyle(options: ChooseQuickSongCoverStyleOptions): Promise<QuickSongCoverStyleChoice> {
    try {
        const raw = await callQuickSongLlm(
            options.apiConfig,
            [
                { role: 'system', content: '你是唱片封面美术指导，只输出合法 JSON。' },
                { role: 'user', content: buildCoverStyleChoicePrompt(options.lockedMoment, options.stylePrompt) },
            ],
            { temperature: 0.2, maxTokens: 1200, timeoutMs: 90000, reason: '聊天快捷生歌：选择封面风格' },
        );
        const parsed = extractJson(raw, { logFailure: false });
        const choice = normalizeCoverStyleChoice(parsed);
        if (choice) return choice;
    } catch {
        // Style selection failure should not block cover generation.
    }
    return { style: 'anime', tone: fallbackCoverTone(options.stylePrompt) };
}

export function buildQuickSongCoverPrompt(options: {
    scene: string;
    style: QuickSongCoverStyle;
    tone: QuickSongCoverTone;
    characterAppearancePrompt?: string;
}): QuickSongCoverPromptResult {
    const includesCharacter = options.style === 'anime' || options.style === 'guoman';
    const appearance = includesCharacter && options.characterAppearancePrompt
        ? `fixed character appearance reference: ${options.characterAppearancePrompt}`
        : '';
    const peopleGuard = includesCharacter
        ? 'the character is the focal subject'
        : 'do not include a close-up human face';
    const prompt = [
        COVER_STYLE_PROMPTS[options.style],
        options.scene,
        COVER_TONE_PROMPTS[options.tone],
        appearance,
        peopleGuard,
        'no text in image, no typography, no logo, no watermark',
    ].filter(Boolean).join(', ');

    return {
        style: options.style,
        tone: options.tone,
        prompt,
        negativePrompt: 'text, typography, logo, watermark, signature, extra text, low quality, blurry, distorted face, malformed hands, bad anatomy',
        includesCharacter,
    };
}
