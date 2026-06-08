import type {
    APIConfig,
    CharacterProfile,
    Message,
    UserProfile,
    VectorMemory,
    YesterdayNewspaperContent,
    YesterdayNewspaperLayout,
    YesterdayNewspaperPeriodType,
    YesterdayNewspaperRecord,
    YesterdayNewspaperSourceSummary,
} from '../types';
import { DB } from './db';
import { buildBackendHeaders,getBackendUrl,getUserId } from './backendConfig';
import { extractContent,extractJsonTyped,safeFetchJson } from './safeApi';
import { safeTimeoutSignal } from './safeTimeout';
import { parseBilingual } from './chatParser';

const MAX_CHAT_LINES = 90;
const MAX_CHAT_CHARS = 12000;
const MAX_MEMORY_LINES = 12;
const GENERATING_STALE_MS = 2 * 60 * 1000;
const NEWSPAPER_MAX_COMPLETION_TOKENS = 65536;
const STRICT_JSON_SYSTEM_PROMPT = [
    '你是严格 JSON API。',
    '你的回复必须是一个合法 JSON 对象，必须以 { 开头并以 } 结尾。',
    '不要输出 Markdown、解释、前言、后记、项目符号或代码块。',
    '所有字符串必须使用双引号，不能出现未转义换行。',
].join('\n');
const ALLOWED_LAYOUTS = new Set<YesterdayNewspaperLayout>([
    'morning',
    'extra',
    'night',
    'sweet',
    'coldwar',
    'short',
]);
const DAY_MS = 24 * 60 * 60 * 1000;
const NEWSPAPER_PERIODS: YesterdayNewspaperPeriodType[] = ['daily', 'weekly', 'monthly'];
const PERIOD_CADENCE_MS: Record<YesterdayNewspaperPeriodType, number> = {
    daily: DAY_MS,
    weekly: 7 * DAY_MS,
    monthly: 30 * DAY_MS,
};

const PERIOD_PUBLICATION_META: Record<YesterdayNewspaperPeriodType, {
    name: string;
    subtitle: string;
    promptScope: string;
    sourceLabel: string;
}> = {
    daily: {
        name: '昨日来信',
        subtitle: '昨天的小事',
        promptScope: '昨天',
        sourceLabel: '昨日',
    },
    weekly: {
        name: '回望·周章',
        subtitle: '前七天的回顾',
        promptScope: '前七天',
        sourceLabel: '近七天',
    },
    monthly: {
        name: '回望·月章',
        subtitle: '前三十天的回顾',
        promptScope: '前三十天',
        sourceLabel: '近三十天',
    },
};

interface EnsureYesterdayNewspaperOptions {
    char: CharacterProfile;
    userProfile: UserProfile;
    apiConfig?: APIConfig | null;
    forceRegenerate?: boolean;
    periodType?: YesterdayNewspaperPeriodType;
}

export interface NewspaperPeriodBounds {
    date: string;
    periodType: YesterdayNewspaperPeriodType;
    periodLabel: string;
    publicationName: string;
    publicationSubtitle: string;
    issueLabel: string;
    promptScope: string;
    sourceLabel: string;
    startDate: string;
    endDate: string;
    start: number;
    end: number;
}

interface GraphRelationSnippet {
    sourceTitle: string;
    targetTitle: string;
    relationType: string;
    summary: string;
    createdAt?: number;
}

interface NewspaperSourceBundle {
    date: string;
    periodType: YesterdayNewspaperPeriodType;
    periodLabel: string;
    publicationName: string;
    publicationSubtitle: string;
    issueLabel: string;
    promptScope: string;
    sourceLabel: string;
    startDate: string;
    endDate: string;
    dayStart: number;
    dayEnd: number;
    messages: Message[];
    diaryTexts: string[];
    traditionalMemories: string[];
    vectorMemories: VectorMemory[];
    graphRelations: GraphRelationSnippet[];
    innerVoice: string;
    statusSnapshot: string;
    cardEcho: string;
    sourceSummary: YesterdayNewspaperSourceSummary;
}

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

function toDateKey(timestamp: number): string {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatPeriodLabel(start: number, end: number, periodType: YesterdayNewspaperPeriodType): string {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (periodType === 'daily') return toDateKey(start);
    const startLabel = `${startDate.getFullYear()}.${pad2(startDate.getMonth() + 1)}.${pad2(startDate.getDate())}`;
    const endLabel = startDate.getFullYear() === endDate.getFullYear()
        ? `${pad2(endDate.getMonth() + 1)}.${pad2(endDate.getDate())}`
        : `${endDate.getFullYear()}.${pad2(endDate.getMonth() + 1)}.${pad2(endDate.getDate())}`;
    return `${startLabel}-${endLabel}`;
}

function createPeriodBounds(
    periodType: YesterdayNewspaperPeriodType,
    date: string,
    start: number,
    end: number,
): NewspaperPeriodBounds {
    const meta = PERIOD_PUBLICATION_META[periodType];
    return {
        date,
        periodType,
        periodLabel: formatPeriodLabel(start, end, periodType),
        publicationName: meta.name,
        publicationSubtitle: meta.subtitle,
        issueLabel: periodType === 'daily'
            ? `NO. ${date.replace(/\D/g, '')}`
            : periodType === 'weekly'
                ? `NO. W${toDateKey(end).replace(/\D/g, '')}`
                : `NO. M${toDateKey(end).replace(/\D/g, '')}`,
        promptScope: meta.promptScope,
        sourceLabel: meta.sourceLabel,
        startDate: toDateKey(start),
        endDate: toDateKey(end),
        start,
        end,
    };
}

function getDisplayUserName(userProfile: UserProfile): string {
    const name = userProfile.name?.trim();
    if (!name || name.toLowerCase() === 'user' || name === '用户') return '你';
    return name;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeNameVariables(value: string, char: CharacterProfile, userProfile: UserProfile): string {
    let text = value
        .replace(/\{\{\s*user\s*\}\}/gi, '{{userName}}')
        .replace(/\{\{\s*userName\s*\}\}/g, '{{userName}}')
        .replace(/\{\{\s*char\s*\}\}/gi, '{{charName}}')
        .replace(/\{\{\s*charName\s*\}\}/g, '{{charName}}')
        .replace(/\bUser\b/g, '{{userName}}');

    const userName = getDisplayUserName(userProfile);
    if (userName !== '你') {
        text = text.replace(new RegExp(escapeRegExp(userName), 'g'), '{{userName}}');
    }

    if (char.name) {
        text = text.replace(new RegExp(escapeRegExp(char.name), 'g'), '{{charName}}');
    }

    return text;
}

function normalizeContentVariables(
    content: YesterdayNewspaperContent,
    char: CharacterProfile,
    userProfile: UserProfile,
): YesterdayNewspaperContent {
    const normalize = (value: string) => normalizeNameVariables(value, char, userProfile);
    return {
        ...content,
        periodLabel: normalize(content.periodLabel || ''),
        publicationName: normalize(content.publicationName || ''),
        publicationSubtitle: normalize(content.publicationSubtitle || ''),
        issueLabel: normalize(content.issueLabel || ''),
        headline: normalize(content.headline),
        subheadline: normalize(content.subheadline),
        relationshipWeather: normalize(content.relationshipWeather),
        lead: normalize(content.lead || content.leadStory),
        leadStory: normalize(content.leadStory),
        sideCards: (content.sideCards || []).map(card => ({
            title: normalize(card.title),
            content: normalize(card.content),
        })),
        extraNotes: (content.extraNotes || []).map(normalize),
        closingLine: normalize(content.closingLine || content.tomorrowHint),
        memoryHighlights: content.memoryHighlights.map(normalize),
        heartGraphNote: normalize(content.heartGraphNote),
        cornerNote: normalize(content.cornerNote),
        tomorrowHint: normalize(content.tomorrowHint),
        footer: normalize(content.footer),
        voiceSnippet: normalize(content.voiceSnippet || ''),
        statusSnapshot: normalize(content.statusSnapshot || ''),
        cardEcho: normalize(content.cardEcho || ''),
        moodTags: (content.moodTags || []).map(normalize),
    };
}

export function getYesterdayLocalDay(now = new Date()): NewspaperPeriodBounds {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const start = todayStart - DAY_MS;
    const end = todayStart - 1;
    return createPeriodBounds('daily', toDateKey(start), start, end);
}

function getRollingCompletedPeriod(
    periodType: YesterdayNewspaperPeriodType,
    days: number,
    now = new Date(),
): NewspaperPeriodBounds {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const start = todayStart - days * DAY_MS;
    const end = todayStart - 1;
    const prefix = periodType === 'weekly' ? 'week' : 'month';
    return createPeriodBounds(periodType, `${prefix}-${toDateKey(end)}`, start, end);
}

function getCurrentWeekPeriod(now = new Date()): NewspaperPeriodBounds {
    return getRollingCompletedPeriod('weekly', 7, now);
}

function getCurrentMonthPeriod(now = new Date()): NewspaperPeriodBounds {
    return getRollingCompletedPeriod('monthly', 30, now);
}

export function getCurrentNewspaperPeriods(now = new Date()): NewspaperPeriodBounds[] {
    return [
        getYesterdayLocalDay(now),
        getCurrentWeekPeriod(now),
        getCurrentMonthPeriod(now),
    ];
}

function getCurrentNewspaperPeriod(periodType: YesterdayNewspaperPeriodType, now = new Date()): NewspaperPeriodBounds {
    return getCurrentNewspaperPeriods(now).find(period => period.periodType === periodType) || getYesterdayLocalDay(now);
}

function isWithinPublicationCadence(record: YesterdayNewspaperRecord | null | undefined, now = Date.now()): boolean {
    if (!record) return false;
    const periodType = record.periodType || 'daily';
    if (periodType === 'daily') return true;
    const anchor = record.generatedAt || record.createdAt || record.updatedAt || 0;
    return Number.isFinite(anchor) && now - anchor < PERIOD_CADENCE_MS[periodType];
}

function isWithinDay(timestamp: unknown, day: NewspaperPeriodBounds): boolean {
    const value = Number(timestamp);
    if (!Number.isFinite(value)) return false;
    const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
    return normalized >= day.start && normalized <= day.end;
}

function hasSourceMaterial(summary?: YesterdayNewspaperSourceSummary | null): boolean {
    if (!summary) return false;
    return (summary.messageCount || 0) > 0
        || (summary.diaryCount || 0) > 0
        || (summary.memoryCount || 0) > 0
        || (summary.graphRelationCount || 0) > 0
        || Boolean(summary.hasInnerVoice)
        || Boolean(summary.hasStatusSnapshot);
}

function shouldRecheckEmptyReadyRecord(record: YesterdayNewspaperRecord | null | undefined): boolean {
    if (!record || record.status !== 'ready') return false;
    if (!hasSourceMaterial(record.sourceSummary)) return true;
    const content = record.content;
    const hasHighlights = (content?.memoryHighlights || []).some(item => Boolean(item?.trim()));
    const legacyText = `${content?.leadStory || ''} ${content?.headline || ''}`;
    const looksLikeLegacyFallback = /真实发生过的部分保存下来|留下的内容不算喧哗|被折成一小版/.test(legacyText);
    return !hasHighlights && (record.sourceSummary?.messageCount || 0) > 0 && looksLikeLegacyFallback;
}

function shouldRecheckClippedReadyRecord(record: YesterdayNewspaperRecord | null | undefined): boolean {
    if (!record || record.status !== 'ready' || !record.content) return false;
    const content = record.content;
    const texts = [
        content.headline,
        content.subheadline,
        content.relationshipWeather,
        content.leadStory,
        content.heartGraphNote,
        content.cornerNote,
        content.tomorrowHint,
        content.footer,
        content.voiceSnippet,
        content.statusSnapshot,
        content.cardEcho,
        ...(content.memoryHighlights || []),
    ];
    return texts.some(text => /(\.\.\.|……)\s*$/.test(String(text || '').trim()));
}

function shouldRecheckPeriodWindow(
    record: YesterdayNewspaperRecord | null | undefined,
    expected: NewspaperPeriodBounds,
): boolean {
    if (!record || record.status !== 'ready' || expected.periodType === 'daily') return false;
    return record.date !== expected.date
        || record.sourceSummary?.periodStartDate !== expected.startDate
        || record.sourceSummary?.periodEndDate !== expected.endDate;
}

function cleanText(value: unknown, limit = 600): string {
    const text = String(value || '')
        .replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > limit ? `${text.slice(0, limit).trim()}...` : text;
}

function cleanGeneratedText(value: unknown, limit = 6000): string {
    const text = String(value || '')
        .replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!limit || text.length <= limit) return text;
    return text.slice(0, limit).trim();
}

function normalizeMessageContent(message: Message): string {
    const parsed = parseBilingual(message.content || '');
    const base = parsed.langA || parsed.langB || message.content || '';
    if (message.type === 'image') return '[图片]';
    if (message.type === 'voice') return cleanText(message.metadata?.transcribedText || base || '[语音消息]', 260);
    if (message.type === 'emoji') return `[表情] ${cleanText(base, 80)}`;
    if (message.type === 'music_card') return `[歌曲卡片] ${cleanText(base, 160)}`;
    if (message.type === 'html_card' || message.type === 'news_card' || message.type === 'canva_card') return `[卡片] ${cleanText(base, 260)}`;
    if (message.type === 'call_log') return `[通话记录] ${cleanText(base, 260)}`;
    if (message.metadata?.source === 'story_phone') return `[剧情手机] ${cleanText(base, 260)}`;
    return cleanText(base, 360);
}

function formatTime(timestamp: number, includeDate = false): string {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return '--:--';
    const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return includeDate ? `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${time}` : time;
}

function trimJoinedLines(lines: string[], maxChars: number): string {
    const picked: string[] = [];
    let total = 0;
    for (const line of lines) {
        const nextTotal = total + line.length + 1;
        if (nextTotal > maxChars) break;
        picked.push(line);
        total = nextTotal;
    }
    return picked.join('\n');
}

function formatMessages(messages: Message[], charName: string, userName: string, includeDate = false): string {
    const visible = messages
        .filter(message => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
        .slice(-MAX_CHAT_LINES)
        .map(message => {
            const speaker = message.role === 'user'
                ? (userName || '你')
                : message.role === 'assistant'
                    ? charName
                    : '来信旁白';
            return `- ${formatTime(message.timestamp, includeDate)} ${speaker}: ${normalizeMessageContent(message)}`;
        });
    return trimJoinedLines(visible, MAX_CHAT_CHARS) || '（聊天框里几乎没有留下可引用的对话。）';
}

function buildMessageHighlights(messages: Message[], charName: string, userName: string, includeDate = false): string[] {
    const visible = messages.filter(message => message.role === 'user' || message.role === 'assistant');
    const recent = visible.slice(-12);
    const userCount = recent.filter(message => message.role === 'user').length;
    const charCount = recent.filter(message => message.role === 'assistant').length;
    const hasImage = recent.some(message => message.type === 'image');
    const hasVoice = recent.some(message => message.type === 'voice');
    const hasCard = recent.some(message => message.type === 'html_card' || message.type === 'news_card' || message.type === 'canva_card' || message.type === 'music_card');
    const scope = includeDate ? '这一段时间' : '昨天';
    const userLabel = userName || '你';
    const highlights = [
        recent.length > 0 ? `${scope}聊天框留下 ${recent.length} 次现场声响` : '',
        userCount > 0 && charCount > 0 ? `${userLabel}和${charName}都有回应，现场没有完全冷掉` : '',
        hasImage ? '有一张图片把版面轻轻点亮' : '',
        hasVoice ? '有语音痕迹从纸面背后冒出来' : '',
        hasCard ? '有卡片消息在角落留下小广告感' : '',
    ].filter(Boolean);
    return highlights.slice(0, 4);
}

function extractDiaryTexts(diaries: Awaited<ReturnType<typeof DB.getDiariesByCharId>>, day: NewspaperPeriodBounds): string[] {
    return diaries
        .filter(diary => diary.date === day.date || isDateKeyInPeriod(normalizeLooseDateKey(diary.date || ''), day) || isWithinDay(diary.timestamp, day))
        .flatMap(diary => [
            diary.charPage?.text ? `char日记: ${cleanText(diary.charPage.text, 900)}` : '',
            diary.userPage?.text ? `user日记: ${cleanText(diary.userPage.text, 600)}` : '',
        ])
        .filter(Boolean)
        .slice(0, 6);
}

function normalizeLooseDateKey(value: string): string {
    const match = value.match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/);
    if (!match) return '';
    return `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`;
}

function isDateKeyInPeriod(dateKey: string, period: NewspaperPeriodBounds): boolean {
    if (!dateKey) return false;
    return dateKey >= period.startDate && dateKey <= period.endDate;
}

function extractTraditionalMemories(char: CharacterProfile, day: NewspaperPeriodBounds): string[] {
    return (char.memories || [])
        .filter(memory => {
            const dateText = cleanText(memory.date, 80);
            const normalized = normalizeLooseDateKey(dateText);
            return dateText.includes(day.date) || isDateKeyInPeriod(normalized, day);
        })
        .map(memory => {
            const mood = memory.mood ? ` · ${memory.mood}` : '';
            return `${memory.date}${mood}: ${cleanText(memory.summary, 420)}`;
        })
        .slice(0, MAX_MEMORY_LINES);
}

function extractStatusSnapshot(char: CharacterProfile): string {
    const card = char.lastStatusCard;
    if (!card) return '';
    return [
        card.title ? `标题：${cleanText(card.title, 80)}` : '',
        card.body ? `正文：${cleanText(card.body, 320)}` : '',
        card.footer ? `页脚：${cleanText(card.footer, 100)}` : '',
    ].filter(Boolean).join(' / ');
}

function extractCardEcho(char: CharacterProfile): string {
    const card = char.lastStatusCard;
    if (!card) return '';
    const typeLabel = card.cardType ? `状态卡 ${card.cardType}` : '状态卡';
    const mood = card.style?.mood ? `，情绪偏 ${cleanText(card.style.mood, 40)}` : '';
    return `${typeLabel}${mood}`;
}

function extractInnerVoice(char: CharacterProfile): string {
    const mood = char.moodState as { innerVoice?: string } | undefined;
    return cleanText(mood?.innerVoice, 220);
}

function normalizeTimestamp(value: unknown): number | undefined {
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    return n < 1_000_000_000_000 ? n * 1000 : n;
}

function readString(source: any, keys: string[], fallback = ''): string {
    for (const key of keys) {
        const value = source?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return fallback;
}

async function fetchGraphRelationsForDay(charId: string, day: NewspaperPeriodBounds): Promise<GraphRelationSnippet[]> {
    const backendUrl = getBackendUrl();
    if (!backendUrl) return [];
    try {
        const resp = await fetch(`${backendUrl}/api/graph/export`, {
            headers: buildBackendHeaders(),
            signal: safeTimeoutSignal(12000),
        });
        if (!resp.ok) return [];
        const data = await resp.json();
        const relations = Array.isArray(data.relations) ? data.relations : [];
        const memoryIds = Array.from(new Set<string>(relations.flatMap((item: any) => [
            readString(item, ['sourceMemoryId', 'source_memory_id', 'sourceId', 'source_id']),
            readString(item, ['targetMemoryId', 'target_memory_id', 'targetId', 'target_id']),
        ]).filter((value: string): value is string => Boolean(value))));
        const memories = await DB.getVectorMemoriesByIds(memoryIds).catch(() => [] as VectorMemory[]);
        const memoryById = new Map(memories.map(memory => [memory.id, memory]));
        const normalizedRelations: Array<GraphRelationSnippet & { charId?: string }> = relations
            .map((item: any) => {
                const sourceId = readString(item, ['sourceMemoryId', 'source_memory_id', 'sourceId', 'source_id']);
                const targetId = readString(item, ['targetMemoryId', 'target_memory_id', 'targetId', 'target_id']);
                const sourceMemory = memoryById.get(sourceId);
                const targetMemory = memoryById.get(targetId);
                const inferredCharId = readString(item, ['charId', 'char_id', 'characterId', 'character_id'])
                    || sourceMemory?.charId
                    || targetMemory?.charId
                    || '';
                return {
                    charId: inferredCharId,
                    sourceTitle: cleanText(readString(item, ['sourceTitle', 'source_title']) || sourceMemory?.title || sourceId, 80),
                    targetTitle: cleanText(readString(item, ['targetTitle', 'target_title']) || targetMemory?.title || targetId, 80),
                    relationType: cleanText(readString(item, ['relationType', 'relation_type', 'type', 'kind', 'label'], '心意关联'), 60),
                    summary: cleanText(readString(item, ['summary', 'reason', 'description', 'evidence', 'note']), 260),
                    createdAt: normalizeTimestamp(readString(item, ['createdAt', 'created_at', 'updatedAt', 'updated_at'])),
                };
            });
        return normalizedRelations
            .filter(item => item.charId === charId)
            .filter(item => item.createdAt ? item.createdAt >= day.start && item.createdAt <= day.end : true)
            .slice(0, 6);
    } catch (error) {
        console.warn('[YesterdayNewspaper] Graph source unavailable:', error instanceof Error ? error.message : error);
        return [];
    }
}

async function collectNewspaperSources(char: CharacterProfile, day: NewspaperPeriodBounds): Promise<NewspaperSourceBundle> {
    const [allMessages, diaries, vectorMemories, graphRelations] = await Promise.all([
        DB.getMessagesByCharId(char.id).catch(() => [] as Message[]),
        DB.getDiariesByCharId(char.id).catch(() => []),
        DB.getAllVectorMemories(char.id).catch(() => [] as VectorMemory[]),
        fetchGraphRelationsForDay(char.id, day),
    ]);
    const messages = allMessages.filter(message => isWithinDay(message.timestamp, day));
    const diaryTexts = extractDiaryTexts(diaries, day);
    const traditionalMemories = extractTraditionalMemories(char, day);
    const dayVectorMemories = vectorMemories
        .filter(memory => isWithinDay(memory.createdAt, day) || isWithinDay(memory.updatedAt, day))
        .sort((a, b) => (b.importance || 0) - (a.importance || 0))
        .slice(0, MAX_MEMORY_LINES);
    const innerVoice = extractInnerVoice(char);
    const statusSnapshot = extractStatusSnapshot(char);
    const cardEcho = extractCardEcho(char);
    return {
        date: day.date,
        periodType: day.periodType,
        periodLabel: day.periodLabel,
        publicationName: day.publicationName,
        publicationSubtitle: day.publicationSubtitle,
        issueLabel: day.issueLabel,
        promptScope: day.promptScope,
        sourceLabel: day.sourceLabel,
        startDate: day.startDate,
        endDate: day.endDate,
        dayStart: day.start,
        dayEnd: day.end,
        messages,
        diaryTexts,
        traditionalMemories,
        vectorMemories: dayVectorMemories,
        graphRelations,
        innerVoice,
        statusSnapshot,
        cardEcho,
        sourceSummary: {
            messageCount: messages.length,
            diaryCount: diaryTexts.length,
            memoryCount: traditionalMemories.length + dayVectorMemories.length,
            graphRelationCount: graphRelations.length,
            hasInnerVoice: Boolean(innerVoice),
            hasStatusSnapshot: Boolean(statusSnapshot),
            periodStartDate: day.startDate,
            periodEndDate: day.endDate,
        },
    };
}

function formatVectorMemories(memories: VectorMemory[]): string {
    if (memories.length === 0) return '（没有读到本期新增或更新的向量记忆。）';
    return memories.map(memory => {
        const journey = memory.emotionalJourney ? ` / 情绪脉络：${cleanText(memory.emotionalJourney, 220)}` : '';
        return `- ${cleanText(memory.title, 60)}: ${cleanText(memory.content, 360)}${journey}`;
    }).join('\n');
}

function formatGraphRelations(relations: GraphRelationSnippet[]): string {
    if (relations.length === 0) return '（此栏暂时空白。）';
    return relations.map(relation => (
        `- ${relation.sourceTitle} -> ${relation.targetTitle} [${relation.relationType}] ${relation.summary || '两段回忆被识别为彼此呼应。'}`
    )).join('\n');
}

function getPeriodEditorialBrief(sources: NewspaperSourceBundle): string {
    if (sources.periodType === 'daily') {
        return `你不是在复述聊天记录，而是在为用户和角色生成一份「昨日小报」。

你的任务：
1. 先从信息源中提取昨日真实发生的 3-7 个事实点，只在心里使用，不要输出事实清单。
2. 判断昨日主线：暧昧推进 / 日常陪伴 / 误会波动 / 礼物事件 / 手机线索 / 情绪低潮 / 无明显大事。
3. 只选择最有报纸感的一件事作为头条，不要把所有信息都塞进头条。
4. 用娱乐小报、温柔八卦、轻微港媒标题的方式包装，但不要过度夸张。
5. 日报要“短、准、有余韵”，不是长篇小说复述。

写作限制：
- 不要直接照搬原始数据字段。
- 不要出现“状态卡 freeform”“备忘录 x2”这种后台字段。
- 不要每篇都写成悬疑爆料。
- 不要贬低 ta，不要用审判语气。
- 尊重女性，默认 ta 的感受和选择都是值得被认真对待的。
- 如果涉及暧昧或亲密关系，写得细腻、体面、含蓄，不要油腻。
- headline 18-28 字以内，两行内可读，像小报头条。
- subheadline 不超过 32 字，温柔、有钩子。
- lead 写 180-260 字，要像报纸报道，不要像小说全文复述。
- sideCards 必须包含“昨日一句”“可疑物证”“前线记者观察”三张。
- extraNotes 输出 3-4 条短讯，每条 20-45 字，像报纸边角料，不重复主新闻。
- closingLine 写一句很轻的收束语，像日报底部小字。`;
    }

    if (sources.periodType === 'weekly') {
        return `你正在撰写《${sources.publicationName}》。

这是七天关系趋势复盘，不是流水账。
你要找出这一周反复出现的情绪、互动模式、关系变化。

风格：
- 情感周刊。
- 专栏复盘。
- 带一点温柔八卦感。
- 比日报更克制，比月报更有现场感。

重点：
- 不要逐日总结。
- 只提炼 2-3 条本周主线。
- 关注关系升温、误会、反复试探、撒娇、冷场、和好、记忆点、共同梗。
- 允许用“本周关键词”“本周风向”“本周名场面”来组织内容。

栏目映射：
- headline 和 leadStory 写“本周封面故事”。
- relationshipWeather 写“关系风向”。
- memoryHighlights 写“本周关键词”或“名场面回放”。
- heartGraphNote 写这一周最值得存档的关系线索。
- tomorrowHint 写“下周看点”。`;
    }

    return `你正在撰写《${sources.publicationName}》。

这是近三十天的私人关系档案，不是聊天摘要。
你要从一个月的信息源中提炼阶段主题：他们这个月经历了什么、关系发生了什么变化、留下了什么反复出现的痕迹。

风格：
- 私人月刊。
- 档案感。
- 情感纪实。
- 有一点旧报纸、旧杂志、港媒大标题的味道。
- 可以有文学化总结，但不能编造事实。

重点：
- 月报不要写单日小事，除非它代表整个月的转折。
- 不要堆事件，要写“趋势”。
- 找出这个月的关键词、反复出现的人设、关系状态、情绪主题。
- 信息少时，写成“本月档案稀薄，版面安静，但沉默本身也留下了记录”的感觉。

栏目映射：
- headline 和 leadStory 写“本月封面故事”。
- relationshipWeather 写“关系主线”。
- memoryHighlights 写“本月关键词”或“本月名场面”。
- heartGraphNote 写“心意地图”。
    - tomorrowHint 或 footer 写“编辑月评”。`;
}

function getOutputSchema(sources: NewspaperSourceBundle, lowInteraction: boolean): string {
    if (sources.periodType === 'daily') {
        return `必须输出以下 JSON 结构：
{
  "masthead": "昨日来信",
  "date": "${sources.date}",
  "periodType": "daily",
  "periodLabel": "${sources.periodLabel}",
  "publicationName": "${sources.publicationName}",
  "publicationSubtitle": "${sources.publicationSubtitle}",
  "issueLabel": "${sources.issueLabel}",
  "layoutType": "morning | extra | night | sweet | coldwar | short",
  "headline": "",
  "subheadline": "",
  "relationshipWeather": "",
  "lead": "",
  "leadStory": "",
  "sideCards": [
    { "title": "昨日一句", "content": "" },
    { "title": "可疑物证", "content": "" },
    { "title": "前线记者观察", "content": "" }
  ],
  "extraNotes": [],
  "closingLine": "",
  "memoryHighlights": [],
  "heartGraphNote": "",
  "cornerNote": "",
  "tomorrowHint": "",
  "footer": "",
  "moodTags": [],
  "isShort": ${lowInteraction ? 'true' : 'false'}
}

日报字段映射要求：
- lead 和 leadStory 必须都填写同一篇主新闻正文。
- extraNotes 和 memoryHighlights 必须都填写同一组边角短讯。
- closingLine、tomorrowHint 和 footer 可以同义，但都必须完整填写。
- sideCards 的 content 要完整可读，不要输出省略号。`;
    }

    return `必须输出以下结构：
{
  "date": "${sources.date}",
  "periodType": "${sources.periodType}",
  "periodLabel": "${sources.periodLabel}",
  "publicationName": "${sources.publicationName}",
  "publicationSubtitle": "${sources.publicationSubtitle}",
  "issueLabel": "${sources.issueLabel}",
  "layoutType": "morning | extra | night | sweet | coldwar | short",
  "masthead": "${sources.publicationName}",
  "headline": "",
  "subheadline": "",
  "relationshipWeather": "",
  "leadStory": "",
  "memoryHighlights": [],
  "heartGraphNote": "",
  "cornerNote": "",
  "tomorrowHint": "",
  "footer": "",
  "voiceSnippet": "",
  "statusSnapshot": "",
  "cardEcho": "",
  "moodTags": [],
  "isShort": ${lowInteraction ? 'true' : 'false'}
}`;
}

function buildPrompt(
    char: CharacterProfile,
    userProfile: UserProfile,
    sources: NewspaperSourceBundle,
): string {
    const userName = getDisplayUserName(userProfile);
    const lowInteraction = sources.messages.length <= 3
        && sources.diaryTexts.length === 0
        && sources.traditionalMemories.length + sources.vectorMemories.length === 0
        && sources.graphRelations.length === 0;
    const longEdition = sources.periodType !== 'daily';
    const highlightLimit = longEdition ? 6 : 4;
    const leadShape = sources.periodType === 'daily'
        ? '写成一条完整的小型新闻，抓一条主线，不要宏大总结'
        : sources.periodType === 'weekly'
            ? '写成完整的周刊封面故事，提炼 2-3 条趋势，不要逐日流水账'
            : '写成完整的月刊封面故事，提炼阶段主题和反复痕迹，不要堆事件';
    const editorialBrief = getPeriodEditorialBrief(sources);
    const outputSchema = getOutputSchema(sources, lowInteraction);
    return `你是一份只服务于 ${userName} 和 ${char.name} 的${sources.publicationName}编辑。

请把输入中真实存在的${sources.promptScope}互动、日记、记忆、状态卡和心意图谱素材，整理成一份可由前端固定模板渲染的 JSON。
你不是摘录员。你要像编辑一样，从素材里选题、取标题、重组叙事，再写成一篇有报纸感的内容。

${editorialBrief}

输出要求：
- 只输出一个 JSON 对象，不要 Markdown，不要解释。
- 不要编造输入里没有发生过的事实。
- 如果本期互动少，layoutType 使用 "short"，内容短一点，允许安静和留白。
- 如果本期关系低压，可以使用 "coldwar" 或 "night"，不要强行甜。
- 文风像一份只属于 user 和 char 的小报：有纪念感、生活感、轻微假正经。
- 不管是日报、周报还是月报，都不要把信息源搬进报纸。
- 禁止使用“系统检测到”“沟通质量”“关系推进明显”“用户画像”“心理建议”“客服式安慰”等后台表达。
- 禁止使用“本期没有新增醒目的心意连线”“根据记录显示”“信息源中提到”“用户与角色进行了互动”“本月发生了若干事件”。
- 不要写任何像系统摘要、字段说明、数据报告的句子。
- 不要写恋爱教程，不要分析人格，不要说教。
- 可以温柔、暧昧、好笑、酸涩，但必须贴合真实素材。
- 称呼双方时优先使用占位符 "{{userName}}" 和 "{{charName}}"；不要输出 User 这种测试名。
- memoryHighlights 最多 ${highlightLimit} 条；每条都要是完整栏目文案，不要用省略号表示截断。
- leadStory ${leadShape}；必须完整收尾，不要用“……”或“...”表示没写完。
- headline 必须根据本期真实素材自己拟一个报纸标题，不要重复刊名“${sources.publicationName}”，也不要使用“昨天被折成一小版”“这一周被折成一小版”“这个月被折成一小版”等模板话。
- leadStory 要写成报纸体/娱乐新闻体报道，不要把聊天原文按时间流水账贴进去；可以短引用一两个关键词，但必须改写成版面语言。
- 如果素材里有状态标签、动作描写或括号标记，只能作为理解情绪的线索，不要原样大段照抄。
- masthead 使用 "${sources.publicationName}"。

${outputSchema}

【来源概况】
期别：${sources.publicationName} / ${sources.publicationSubtitle}
时间：${sources.periodLabel}（${sources.startDate} 至 ${sources.endDate}）
用户：${userName}
角色：${char.name}
本期消息数：${sources.messages.length}
是否低互动：${lowInteraction ? '是' : '否'}

【${sources.sourceLabel}聊天】
${formatMessages(sources.messages, char.name, userName, sources.periodType !== 'daily')}

【${sources.sourceLabel} char / user 日记】
${sources.diaryTexts.length ? sources.diaryTexts.map(item => `- ${item}`).join('\n') : '（此栏暂时空白。）'}

【${sources.sourceLabel}新增或更新的传统记忆】
${sources.traditionalMemories.length ? sources.traditionalMemories.map(item => `- ${item}`).join('\n') : '（此栏暂时空白。）'}

【${sources.sourceLabel}新增或更新的向量记忆】
${formatVectorMemories(sources.vectorMemories)}

【${sources.sourceLabel}新增心意图谱关联】
${formatGraphRelations(sources.graphRelations)}

【状态栏 / 心声素材】
心声：${sources.innerVoice || '（没有可用心声。）'}
状态快照：${sources.statusSnapshot || '（没有可用状态快照。）'}
随机卡片回声：${sources.cardEcho || '（没有可用卡片回声。）'}`;
}

const GENERATED_FIELD_LIMITS: Record<YesterdayNewspaperPeriodType, {
    headline: number;
    subheadline: number;
    weather: number;
    lead: number;
    memoryCount: number;
    memoryItem: number;
    sideText: number;
    footer: number;
    tag: number;
}> = {
    daily: {
        headline: 220,
        subheadline: 2400,
        weather: 1200,
        lead: 40000,
        memoryCount: 8,
        memoryItem: 2400,
        sideText: 12000,
        footer: 2400,
        tag: 28,
    },
    weekly: {
        headline: 260,
        subheadline: 3600,
        weather: 1800,
        lead: 80000,
        memoryCount: 12,
        memoryItem: 3200,
        sideText: 16000,
        footer: 3200,
        tag: 32,
    },
    monthly: {
        headline: 300,
        subheadline: 4800,
        weather: 2400,
        lead: 120000,
        memoryCount: 16,
        memoryItem: 4000,
        sideText: 20000,
        footer: 4000,
        tag: 36,
    },
};

const LOOSE_FIELD_ALIASES = {
    date: ['date', '日期'],
    periodType: ['periodType', 'period_type', 'period', 'type', '期别', '刊期'],
    periodLabel: ['periodLabel', 'period_label', '时间', '时间范围', 'period'],
    publicationName: ['publicationName', 'publication_name', 'masthead', '刊名', '报头'],
    publicationSubtitle: ['publicationSubtitle', 'publication_subtitle', 'subtitle', '副标题', '刊物副标题'],
    issueLabel: ['issueLabel', 'issue_label', 'issue', '期号'],
    layoutType: ['layoutType', 'layout_type', 'layout', '版式'],
    masthead: ['masthead', 'publicationName', '刊名', '报头'],
    headline: ['headline', 'title', 'mainTitle', 'main_title', '今日头条', '本周封面故事', '本月封面故事', '标题'],
    subheadline: ['subheadline', 'subTitle', 'subtitle', '副标题', '导语'],
    relationshipWeather: ['relationshipWeather', 'relationship_weather', 'weather', '今日气象', '关系风向', '关系主线', '气象'],
    leadStory: ['leadStory', 'lead_story', 'lead', 'story', 'body', 'article', '现场直击', '封面故事', '报道正文', '正文'],
    sideCards: ['sideCards', 'side_cards', 'cards', '边栏卡片', '侧栏', '栏目卡片'],
    memoryHighlights: ['memoryHighlights', 'memory_highlights', 'extraNotes', 'extra_notes', 'highlights', 'keywords', '本周关键词', '本月关键词', '名场面回放', '本月名场面', '边角料', '短讯', '栏目', '要点'],
    heartGraphNote: ['heartGraphNote', 'heart_graph_note', 'heartMap', '心意地图', '关系线索'],
    cornerNote: ['cornerNote', 'corner_note', 'gossip', '小道消息', '角落短讯'],
    tomorrowHint: ['tomorrowHint', 'tomorrow_hint', 'closingLine', 'closing_line', 'next', '下周看点', '编辑短评', '编辑月评', '收束语', '看点'],
    footer: ['footer', '落款'],
    voiceSnippet: ['voiceSnippet', 'voice_snippet', '心声'],
    statusSnapshot: ['statusSnapshot', 'status_snapshot', '状态快照', '门口状态'],
    cardEcho: ['cardEcho', 'card_echo', '小广告', '随信小广告'],
    moodTags: ['moodTags', 'mood_tags', 'tags', '关键词标签'],
    isShort: ['isShort', 'is_short', 'short'],
} as const;

const LOOSE_SECTION_LABELS = [
    '今日头条',
    '现场直击',
    '今日气象',
    '小道消息',
    '编辑短评',
    '本周封面故事',
    '关系风向',
    '名场面回放',
    '本周关键词',
    '下周看点',
    '本月封面故事',
    '关系主线',
    '本月关键词',
    '本月名场面',
    '心意地图',
    '编辑月评',
    '标题',
    '副标题',
    '正文',
];

function generatedClip(value: unknown, limit: number): string {
    return cleanGeneratedText(value, limit);
}

function normalizePeriodType(value: unknown, fallback: YesterdayNewspaperPeriodType): YesterdayNewspaperPeriodType {
    const text = cleanGeneratedText(value, 40).toLowerCase();
    if (!text) return fallback;
    if (text.includes('weekly') || text.includes('week') || text.includes('周')) return 'weekly';
    if (text.includes('monthly') || text.includes('month') || text.includes('月')) return 'monthly';
    if (text.includes('daily') || text.includes('day') || text.includes('日') || text.includes('昨')) return 'daily';
    return NEWSPAPER_PERIODS.includes(text as YesterdayNewspaperPeriodType)
        ? text as YesterdayNewspaperPeriodType
        : fallback;
}

function unwrapLooseObject(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.find(item => item && typeof item === 'object' && !Array.isArray(item)) || obj[0];
    }
    if (!obj || typeof obj !== 'object') return obj;
    for (const key of ['content', 'report', 'newspaper', 'data', 'result', 'output', 'article']) {
        const nested = obj[key];
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
            return { ...obj, ...nested };
        }
    }
    return obj;
}

function flattenLooseSections(obj: any): Record<string, unknown> {
    const flattened: Record<string, unknown> = {};
    for (const key of ['sections', 'columns', 'items', '栏目']) {
        const value = obj?.[key];
        if (Array.isArray(value)) {
            value.forEach(section => {
                if (!section || typeof section !== 'object') return;
                const title = cleanGeneratedText(section.title || section.name || section.heading || section.key || section.label, 80);
                const body = section.content || section.body || section.text || section.summary || section.value || section.items;
                if (title && body !== undefined) flattened[title] = body;
            });
        } else if (value && typeof value === 'object') {
            Object.assign(flattened, value);
        }
    }
    return flattened;
}

function readLooseValue(obj: any, keys: readonly string[]): unknown {
    const root = unwrapLooseObject(obj);
    if (!root || typeof root !== 'object') return undefined;
    const flattened = { ...root, ...flattenLooseSections(root) };
    for (const key of keys) {
        if (flattened[key] !== undefined) return flattened[key];
    }
    const entries = Object.entries(flattened);
    for (const key of keys) {
        const normalizedKey = key.toLowerCase();
        const found = entries.find(([entryKey]) => entryKey.toLowerCase() === normalizedKey);
        if (found) return found[1];
    }
    return undefined;
}

function stringArray(value: unknown, limit: number, itemLimit: number): string[] {
    const values = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(/\n|[；;]/)
            : [];
    return values
        .map(item => {
            if (item && typeof item === 'object') {
                const title = cleanGeneratedText((item as any).title || (item as any).name || (item as any).label, 80);
                const text = cleanGeneratedText((item as any).content || (item as any).body || (item as any).text || (item as any).summary || (item as any).value, itemLimit);
                return title && text ? `${title}：${text}` : title || text;
            }
            return cleanGeneratedText(String(item || '').replace(/^\s*[-*•]\s*/, ''), itemLimit);
        })
        .filter(Boolean)
        .slice(0, limit);
}

function sideCardArray(value: unknown, itemLimit: number): { title: string; content: string }[] {
    const values = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
            ? Object.entries(value).map(([title, content]) => ({ title, content }))
            : [];
    return values
        .map((item, index) => {
            if (item && typeof item === 'object') {
                const raw = item as any;
                const title = cleanGeneratedText(raw.title || raw.name || raw.label || raw.key || `边栏 ${index + 1}`, 40);
                const content = cleanGeneratedText(raw.content || raw.body || raw.text || raw.summary || raw.value, itemLimit);
                return title && content ? { title, content } : null;
            }
            return null;
        })
        .filter((item): item is { title: string; content: string } => Boolean(item))
        .slice(0, 6);
}

function validateContent(obj: any, fallbackPeriodType: YesterdayNewspaperPeriodType = 'daily'): YesterdayNewspaperContent | null {
    const root = unwrapLooseObject(obj);
    if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
    const periodType = normalizePeriodType(readLooseValue(root, LOOSE_FIELD_ALIASES.periodType), fallbackPeriodType);
    const layoutValue = readLooseValue(root, LOOSE_FIELD_ALIASES.layoutType);
    const layout = ALLOWED_LAYOUTS.has(layoutValue as YesterdayNewspaperLayout) ? layoutValue as YesterdayNewspaperLayout : 'morning';
    const meta = PERIOD_PUBLICATION_META[periodType];
    const limits = GENERATED_FIELD_LIMITS[periodType];
    const leadStory = generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.leadStory), limits.lead);
    const memoryHighlights = stringArray(readLooseValue(root, LOOSE_FIELD_ALIASES.memoryHighlights), limits.memoryCount, limits.memoryItem);
    const tomorrowHint = generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.tomorrowHint), limits.sideText);
    const cards = sideCardArray(readLooseValue(root, LOOSE_FIELD_ALIASES.sideCards), limits.sideText);
    return {
        date: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.date), 32),
        periodType,
        periodLabel: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.periodLabel), 64),
        publicationName: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.publicationName), 40) || meta.name,
        publicationSubtitle: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.publicationSubtitle), 80) || meta.subtitle,
        issueLabel: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.issueLabel), 32),
        layoutType: layout,
        masthead: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.masthead), 48) || meta.name,
        headline: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.headline), limits.headline),
        subheadline: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.subheadline), limits.subheadline),
        relationshipWeather: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.relationshipWeather), limits.weather),
        lead: leadStory,
        leadStory,
        sideCards: cards,
        extraNotes: memoryHighlights,
        closingLine: tomorrowHint,
        memoryHighlights,
        heartGraphNote: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.heartGraphNote), limits.sideText),
        cornerNote: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.cornerNote), limits.sideText),
        tomorrowHint,
        footer: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.footer), limits.footer),
        voiceSnippet: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.voiceSnippet), limits.sideText),
        statusSnapshot: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.statusSnapshot), limits.sideText),
        cardEcho: generatedClip(readLooseValue(root, LOOSE_FIELD_ALIASES.cardEcho), limits.sideText),
        moodTags: stringArray(readLooseValue(root, LOOSE_FIELD_ALIASES.moodTags), 8, limits.tag),
        isShort: Boolean(readLooseValue(root, LOOSE_FIELD_ALIASES.isShort)),
    };
}

function readLooseSection(raw: string, labels: string[], limit: number): string {
    const text = raw
        .replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '')
        .replace(/^```(?:json|JSON|markdown|md)?\s*\n?/gm, '')
        .replace(/\n?```\s*$/gm, '')
        .trim();
    const allLabels = LOOSE_SECTION_LABELS.map(escapeRegExp).join('|');
    for (const label of labels) {
        const startPattern = new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?${escapeRegExp(label)}\\s*[:：]?\\s*`, 'i');
        const match = startPattern.exec(text);
        if (!match) continue;
        const rest = text.slice(match.index + match[0].length);
        const nextPattern = new RegExp(`\\n\\s*(?:#{1,6}\\s*)?(?:${allLabels})\\s*[:：]?`, 'i');
        const next = nextPattern.exec(rest);
        return cleanGeneratedText(rest.slice(0, next ? next.index : undefined).replace(/^\s*[-*•]\s*/, ''), limit);
    }
    return '';
}

function parseLooseTextContent(raw: string, sources: NewspaperSourceBundle): YesterdayNewspaperContent | null {
    const limits = GENERATED_FIELD_LIMITS[sources.periodType];
    const headline = readLooseSection(raw, ['今日头条', '本周封面故事', '本月封面故事', '标题'], limits.headline);
    const leadStory = readLooseSection(raw, ['现场直击', '本周封面故事', '本月封面故事', '正文'], limits.lead);
    if (!headline && !leadStory) return null;
    const highlightText = readLooseSection(raw, ['本周关键词', '本月关键词', '名场面回放', '本月名场面'], limits.memoryItem * limits.memoryCount);
    const dailyExtraNotes = readLooseSection(raw, ['边角料', '短讯'], limits.memoryItem * limits.memoryCount);
    const sideCards = sources.periodType === 'daily'
        ? [
            { title: '昨日一句', content: readLooseSection(raw, ['昨日一句'], limits.sideText) },
            { title: '可疑物证', content: readLooseSection(raw, ['可疑物证'], limits.sideText) },
            { title: '前线记者观察', content: readLooseSection(raw, ['前线记者观察'], limits.sideText) },
        ].filter(card => card.content)
        : [];
    return validateContent({
        date: sources.date,
        periodType: sources.periodType,
        periodLabel: sources.periodLabel,
        publicationName: sources.publicationName,
        publicationSubtitle: sources.publicationSubtitle,
        issueLabel: sources.issueLabel,
        masthead: sources.publicationName,
        headline,
        subheadline: readLooseSection(raw, ['副标题'], limits.subheadline),
        relationshipWeather: readLooseSection(raw, ['今日气象', '关系风向', '关系主线'], limits.weather),
        lead: leadStory,
        leadStory,
        sideCards,
        extraNotes: dailyExtraNotes || highlightText,
        memoryHighlights: dailyExtraNotes || highlightText,
        heartGraphNote: readLooseSection(raw, ['心意地图'], limits.sideText),
        cornerNote: readLooseSection(raw, ['小道消息'], limits.sideText),
        closingLine: readLooseSection(raw, ['编辑短评', '下周看点', '编辑月评', '收束语'], limits.sideText),
        tomorrowHint: readLooseSection(raw, ['编辑短评', '下周看点', '编辑月评', '收束语'], limits.sideText),
        footer: readLooseSection(raw, ['编辑短评', '编辑月评', '收束语'], limits.footer),
        moodTags: [],
        isShort: false,
    }, sources.periodType);
}

function parseGeneratedContent(raw: string, sources: NewspaperSourceBundle): YesterdayNewspaperContent | null {
    return extractJsonTyped(raw, obj => validateContent(obj, sources.periodType), { logFailure: false })
        || parseLooseTextContent(raw, sources);
}

function shouldRetryWithoutJsonMode(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    return /response_format|json_object|json mode|unsupported|invalid.*parameter|unknown.*parameter/i.test(message);
}

function buildRepairPrompt(originalPrompt: string, invalidRaw: string): string {
    return `上一次输出不是合法 JSON。请丢弃上一次的自由文本，只根据原任务重新输出一个完整、合法、可 JSON.parse 的对象。

硬性要求：
- 只输出 JSON 对象。
- 第一个字符必须是 {，最后一个字符必须是 }。
- 不要项目符号，不要解释，不要 Markdown。
- 字段必须完整，字段名必须使用双引号。

【原任务】
${originalPrompt}

【上一次错误输出片段】
${cleanText(invalidRaw, 900)}`;
}

async function requestNewspaperRaw(
    baseUrl: string,
    apiConfig: APIConfig,
    prompt: string,
    options: { useJsonMode: boolean; temperature: number; maxTokens?: number },
): Promise<string> {
    const body: Record<string, unknown> = {
        model: apiConfig.model,
        messages: [
            {
                role: 'system',
                content: STRICT_JSON_SYSTEM_PROMPT,
            },
            {
                role: 'user',
                content: prompt,
            },
        ],
        temperature: options.temperature,
        max_tokens: options.maxTokens ?? NEWSPAPER_MAX_COMPLETION_TOKENS,
        stream: false,
    };
    if (options.useJsonMode) {
        body.response_format = { type: 'json_object' };
    }

    const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}`,
        },
        body: JSON.stringify(body),
        signal: safeTimeoutSignal(120000),
    }, 1, {
        feature: 'newspaper',
        reason: '昨日来信生成',
        model: apiConfig.model,
        userInitiated: false,
    });

    return extractContent(data);
}

function buildFallbackContent(
    char: CharacterProfile,
    userProfile: UserProfile,
    sources: NewspaperSourceBundle,
): YesterdayNewspaperContent {
    const userName = getDisplayUserName(userProfile);
    const messageSignals = buildMessageHighlights(sources.messages, char.name, userName, sources.periodType !== 'daily');
    const hasMaterial = sources.messages.length > 0
        || sources.diaryTexts.length > 0
        || sources.traditionalMemories.length > 0
        || sources.vectorMemories.length > 0
        || sources.graphRelations.length > 0;
    const isDaily = sources.periodType === 'daily';
    const quietSubject = isDaily ? '昨天' : sources.promptScope;
    const memoryCount = sources.traditionalMemories.length + sources.vectorMemories.length;
    const signalHighlights = [
        ...messageSignals,
        sources.diaryTexts.length > 0 ? '日记页有新痕迹，像夹在版缝里的便签' : '',
        memoryCount > 0 ? '记忆档案被重新翻动，旧纸边压出新折痕' : '',
        sources.graphRelations.length > 0 ? '心意地图出现可追的细线' : '',
        sources.innerVoice ? '角落有一小段心声适合另起小标题' : '',
        sources.statusSnapshot ? '门口状态给这一期留下天气感' : '',
    ].filter(Boolean).slice(0, isDaily ? 4 : 6);
    const fallbackLead = hasMaterial
        ? `${quietSubject}没有被写成流水账。编辑部只抓住最明显的现场气味：聊天、记忆或状态在纸面边缘轻轻碰了一下，像一条还没正式盖章的小新闻。`
        : `${quietSubject} ${userName} 和 ${char.name} 没有留下太多可写的事。昨日风平浪静，但安静本身也在信纸上留下了一点折痕。`;
    return {
        date: sources.date,
        periodType: sources.periodType,
        periodLabel: sources.periodLabel,
        publicationName: sources.publicationName,
        publicationSubtitle: sources.publicationSubtitle,
        issueLabel: sources.issueLabel,
        layoutType: hasMaterial ? 'morning' : 'short',
        masthead: sources.publicationName,
        headline: hasMaterial
            ? (isDaily ? '昨日现场有轻微动静，私人头条暂列一版' : `${quietSubject}关系风向有了可追的线索`)
            : `${quietSubject}的来信很轻`,
        subheadline: hasMaterial
            ? '本期只保留最像新闻的一条线索，其余细节暂不抢版。'
            : '信箱里只有一点安静的纸声。',
        relationshipWeather: hasMaterial ? '有微风' : '少云',
        lead: fallbackLead,
        leadStory: fallbackLead,
        sideCards: [
            {
                title: '昨日一句',
                content: hasMaterial ? '有些话没被大声刊出，但纸面记得。' : '风平浪静，也是一种轻轻的回声。',
            },
            {
                title: '可疑物证',
                content: hasMaterial ? '聊天框、记忆页和门口状态共同留下细小线索。' : '信箱暂时安静，只剩一页没盖章的空白。',
            },
            {
                title: '前线记者观察',
                content: hasMaterial ? '关系没有被定论，只是比上一页多了一点可读的温度。' : '没有大事发生时，留白也能说明当天的天气。',
            },
        ],
        extraNotes: signalHighlights,
        memoryHighlights: signalHighlights,
        heartGraphNote: sources.graphRelations[0]
            ? '两处回忆在地图上轻轻靠近，像一条还没公开署名的关系线索。'
            : sources.messages.length > 0
                ? '有些话没有立刻变成大事件，只在心意地图边缘留下小脚注。'
                : '心意地图暂时安静，像一张还没盖上邮戳的空白页。',
        cornerNote: hasMaterial ? '小道消息称，真正的情绪往往藏在没被大声命名的地方。' : '角落留白，等下一次风吹过来。',
        closingLine: isDaily ? '明天的来信还没落款。' : '下一期还没落款。',
        tomorrowHint: isDaily ? '明天的来信还没落款。' : '下一期还没落款。',
        footer: `${char.name} / ${userName} · ${sources.periodLabel}`,
        voiceSnippet: '',
        statusSnapshot: '',
        cardEcho: '',
        moodTags: hasMaterial ? [sources.sourceLabel, sources.messages.length > 0 ? '聊天' : '小事'] : ['短版', '留白'],
        isShort: !hasMaterial,
    };
}

function hasReportWriting(content: YesterdayNewspaperContent | null | undefined): boolean {
    if (!content) return false;
    const headline = cleanText(content.headline, 80);
    const leadStory = cleanText(content.leadStory, 260);
    if (!headline || !leadStory) return false;
    return !/被折成一小版|版面很轻|有几句话被排进版面|来信很轻|有几句话被写进来信|被收进一页/.test(headline);
}

async function generateContent(
    char: CharacterProfile,
    userProfile: UserProfile,
    apiConfig: APIConfig,
    sources: NewspaperSourceBundle,
): Promise<YesterdayNewspaperContent> {
    const baseUrl = apiConfig.baseUrl?.replace(/\/+$/, '');
    if (!baseUrl || !apiConfig.model) {
        throw new Error('昨日来信需要可用的聊天模型配置');
    }
    const prompt = buildPrompt(char, userProfile, sources);
    const maxTokens = NEWSPAPER_MAX_COMPLETION_TOKENS;
    let raw = '';
    try {
        raw = await requestNewspaperRaw(baseUrl, apiConfig, prompt, {
            useJsonMode: true,
            temperature: 0.45,
            maxTokens,
        });
    } catch (error) {
        if (!shouldRetryWithoutJsonMode(error)) throw error;
        console.warn('[YesterdayNewspaper] JSON mode unavailable, retrying without response_format.');
        raw = await requestNewspaperRaw(baseUrl, apiConfig, prompt, {
            useJsonMode: false,
            temperature: 0.45,
            maxTokens,
        });
    }

    const requireReportWriting = hasSourceMaterial(sources.sourceSummary);
    let parsed = parseGeneratedContent(raw, sources);
    if (!parsed || (requireReportWriting && !hasReportWriting(parsed))) {
        console.warn('[YesterdayNewspaper] Model returned non-JSON newspaper, retrying JSON repair once.');
        const repairedRaw = await requestNewspaperRaw(baseUrl, apiConfig, buildRepairPrompt(prompt, raw), {
            useJsonMode: false,
            temperature: 0.2,
            maxTokens,
        });
        parsed = parseGeneratedContent(repairedRaw, sources);
    }
    if (!parsed) {
        throw new Error('昨日来信 JSON 解析失败');
    }
    if (requireReportWriting && !hasReportWriting(parsed)) {
        throw new Error('昨日来信没有写出有效标题和正文');
    }
    const fallback = buildFallbackContent(char, userProfile, sources);
    return {
        ...parsed,
        date: sources.date,
        periodType: sources.periodType,
        periodLabel: sources.periodLabel,
        publicationName: sources.publicationName,
        publicationSubtitle: sources.publicationSubtitle,
        issueLabel: sources.issueLabel,
        masthead: parsed.masthead || sources.publicationName,
        headline: parsed.headline || fallback.headline,
        lead: parsed.lead || parsed.leadStory || fallback.lead,
        leadStory: parsed.leadStory || parsed.lead || fallback.leadStory,
        sideCards: parsed.sideCards?.length ? parsed.sideCards : fallback.sideCards,
        extraNotes: parsed.extraNotes?.length ? parsed.extraNotes : parsed.memoryHighlights?.length ? parsed.memoryHighlights : fallback.extraNotes,
        memoryHighlights: parsed.memoryHighlights?.length ? parsed.memoryHighlights : parsed.extraNotes?.length ? parsed.extraNotes : fallback.memoryHighlights,
        closingLine: parsed.closingLine || parsed.tomorrowHint || fallback.closingLine,
        tomorrowHint: parsed.tomorrowHint || parsed.closingLine || fallback.tomorrowHint,
        footer: parsed.footer || parsed.closingLine || `${char.name} / ${getDisplayUserName(userProfile)} · ${sources.periodLabel}`,
        layoutType: parsed.isShort ? 'short' : parsed.layoutType,
    };
}

function createBaseRecord(
    ownerUserId: string,
    charId: string,
    period: NewspaperPeriodBounds,
    status: YesterdayNewspaperRecord['status'],
): YesterdayNewspaperRecord {
    const now = Date.now();
    return {
        id: DB.buildYesterdayNewspaperId(ownerUserId, charId, period.date, period.periodType),
        ownerUserId,
        charId,
        date: period.date,
        periodType: period.periodType,
        status,
        createdAt: now,
        updatedAt: now,
    };
}

export async function ensureYesterdayNewspaper(
    options: EnsureYesterdayNewspaperOptions,
): Promise<YesterdayNewspaperRecord> {
    const ownerUserId = getUserId();
    const periodType = options.periodType || 'daily';
    const day = getCurrentNewspaperPeriod(periodType);
    let existing = await DB.getYesterdayNewspaper(ownerUserId, options.char.id, day.date);
    if (!existing && periodType !== 'daily' && !options.forceRegenerate) {
        const latest = await DB.getLatestYesterdayNewspaperByPeriod(ownerUserId, options.char.id, periodType).catch(() => null);
        if (isWithinPublicationCadence(latest)) {
            existing = latest;
        }
    }
    const now = Date.now();
    let recoveredSources: NewspaperSourceBundle | null = null;
    if (
        existing
        && !options.forceRegenerate
        && (existing.status === 'ready' || existing.status === 'failed')
    ) {
        const needsPeriodRepair = shouldRecheckPeriodWindow(existing, day);
        const needsEmptyRepair = shouldRecheckEmptyReadyRecord(existing);
        const needsClippedRepair = shouldRecheckClippedReadyRecord(existing);
        if (needsPeriodRepair || needsEmptyRepair || needsClippedRepair) {
            recoveredSources = await collectNewspaperSources(options.char, day).catch(() => null);
            if (!recoveredSources) return existing;
            if (!needsPeriodRepair && !hasSourceMaterial(recoveredSources.sourceSummary)) {
                return existing;
            }
        } else {
            return existing;
        }
    }
    if (
        existing?.status === 'generating'
        && !options.forceRegenerate
        && now - existing.updatedAt < GENERATING_STALE_MS
    ) {
        return existing;
    }

    const generatingBase = existing?.date === day.date
        ? existing
        : createBaseRecord(ownerUserId, options.char.id, day, 'generating');
    const generating: YesterdayNewspaperRecord = {
        ...generatingBase,
        periodType: day.periodType,
        status: 'generating',
        error: undefined,
        updatedAt: now,
    };
    await DB.saveYesterdayNewspaper(generating);

    try {
        const sources = recoveredSources || await collectNewspaperSources(options.char, day);
        if (!options.apiConfig && hasSourceMaterial(sources.sourceSummary)) {
            throw new Error('昨日来信需要可用的聊天模型来生成内容');
        }
        const generatedContent = options.apiConfig
            ? await generateContent(options.char, options.userProfile, options.apiConfig, sources)
            : buildFallbackContent(options.char, options.userProfile, sources);
        const content = normalizeContentVariables(generatedContent, options.char, options.userProfile);
        const ready: YesterdayNewspaperRecord = {
            ...generating,
            periodType: day.periodType,
            status: 'ready',
            content,
            sourceSummary: sources.sourceSummary,
            generatedAt: Date.now(),
            updatedAt: Date.now(),
        };
        await DB.saveYesterdayNewspaper(ready);
        return ready;
    } catch (error) {
        const sources = await collectNewspaperSources(options.char, day).catch(() => null);
        const failed: YesterdayNewspaperRecord = {
            ...generating,
            periodType: day.periodType,
            status: 'failed',
            sourceSummary: sources?.sourceSummary,
            error: error instanceof Error ? error.message : '昨日来信生成失败',
            updatedAt: Date.now(),
        };
        await DB.saveYesterdayNewspaper(failed);
        return failed;
    }
}

export async function getCurrentYesterdayNewspaper(
    charId: string,
    periodType: YesterdayNewspaperPeriodType = 'daily',
): Promise<YesterdayNewspaperRecord | null> {
    const ownerUserId = getUserId();
    const day = getCurrentNewspaperPeriod(periodType);
    const current = await DB.getYesterdayNewspaper(ownerUserId, charId, day.date);
    if (current || periodType === 'daily') return current;
    const latest = await DB.getLatestYesterdayNewspaperByPeriod(ownerUserId, charId, periodType).catch(() => null);
    return isWithinPublicationCadence(latest) ? latest : null;
}

export async function markCurrentYesterdayNewspaperOpened(
    charId: string,
    periodType: YesterdayNewspaperPeriodType = 'daily',
): Promise<YesterdayNewspaperRecord | null> {
    const ownerUserId = getUserId();
    const record = await getCurrentYesterdayNewspaper(charId, periodType);
    if (!record) return null;
    return DB.markYesterdayNewspaperOpened(ownerUserId, charId, record.date);
}

export { NEWSPAPER_PERIODS };
