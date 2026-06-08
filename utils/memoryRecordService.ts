import type {
    APIConfig,
    CharacterProfile,
    LyricIntent,
    SingabilityIssue,
    OptimizationNotes,
    MusicDirectorNotes,
    MemoryRecord,
    MemoryRecordAudio,
    MemoryRecordMode,
    MemoryRecordSongRequest,
    TtsConfig,
    UserProfile,
} from '../types';
import { pinyin } from 'pinyin-pro';
import { DB } from './db';
import { masterMemoryRecordAudio } from './memoryRecordMastering';
import { MinimaxMusic, type MinimaxMusicGenerateResult } from './minimaxMusic';
import { MinimaxTts } from './minimaxTts';
import { selectMemoryRecordCover } from './memoryRecordCovers';
import { extractContent, extractJsonTyped, safeFetchJson } from './safeApi';
import { safeTimeoutSignal } from './safeTimeout';
import {
    getCharacterVoiceIdNotExistMessage,
    isVoiceIdNotExistError,
    resolveCharacterVoiceId,
    withCharacterTtsVoice,
} from './characterTts';

export interface MemoryRecordMemoryHeader {
    id: string;
    title: string;
    content: string;
    emotionalJourney?: string;
    importance: number;
    createdAt: number;
    deprecated?: boolean;
    salienceScore?: number;
    mentionCount?: number;
    lastMentioned?: number;
    level?: number;
}

export interface CreateMemoryRecordDraftOptions {
    char: CharacterProfile;
    userProfile: UserProfile;
    mode: MemoryRecordMode;
    memories: MemoryRecordMemoryHeader[];
    apiConfig: APIConfig;
    selectedMemoryIds?: string[];
    inspirationReference?: string;
    songRequest?: MemoryRecordSongRequest;
    contextBudget?: 'standard' | 'expanded';
}

export interface ReviseMemoryRecordLyricsOptions {
    record: MemoryRecord;
    apiConfig: APIConfig;
    instruction: string;
    songRequest?: MemoryRecordSongRequest;
    lyricistReference?: string;
}

export interface ProduceMemoryRecordAudioOptions {
    record: MemoryRecord;
    char: CharacterProfile;
    ttsConfig: TtsConfig;
    musicBaseUrl?: string;
    forceRemaster?: boolean;
    onRecordUpdate?: (record: MemoryRecord) => void;
    signal?: AbortSignal;
}

interface DraftPayload {
    title: string;
    albumName: string;
    artistName: string;
    monologueText: string;
    lyrics: string;
    musicPrompt: string;
    coverGradient: string;
}

export interface LyricJsonPayload {
    title: string;
    stylePrompt: string;
    lyrics: string;
}

interface PromptBudgetConfig {
    l1Limit: number;
    l0SelectedLimit: number;
    personaLength: number;
    l1ContentLength: number;
    l0ContentLength: number;
}

const REQUIRED_LYRIC_SECTIONS = [
    '[Intro]',
    '[Verse 1]',
    '[Pre Chorus]',
    '[Chorus]',
    '[Verse 2]',
    '[Bridge]',
    '[Final Chorus]',
    '[Outro]',
];

const DEFAULT_MUSIC_PROMPT = 'intimate cinematic pop ballad, warm vocal, soft piano, light drums, bittersweet and private';
const MEMORY_RECORD_LLM_MAX_TOKENS = 16000;
const INCOMPLETE_LYRICS_WARNING = '歌词返回不完整（可能是 max_tokens 截断），已改用本地兜底草稿';
const RHYME_FALLBACK_WARNING = '歌词押韵验收未通过，已改用本地押韵兜底草稿';

export const MEMORY_RECORD_MODE_COPY: Record<MemoryRecordMode, { label: string; detail: string }> = {
    blind_box: {
        label: '暗格来信',
        detail: '像夜里摸到一封未拆的信，展开时才知道会听见什么。',
    },
    relationship_theme: {
        label: '长镜头',
        detail: '把两个人一路走来的来路、停顿和心照不宣，压进同一段旋律。',
    },
    selected_memory: {
        label: '折进信里',
        detail: '挑几段舍不得删的，让它们在同一面唱片里慢慢发光。',
    },
    char_to_user: {
        label: '他的独白诗',
        detail: '让他先开口，像终于贴近耳边，把迟到的话轻声唱完。',
    },
    dream_mix: {
        label: '未醒混音',
        detail: '把气味、光线、停顿和心跳揉在一起，做一首醒来后还记得的歌。',
    },
};

export const COVER_GRADIENTS = [
    'linear-gradient(135deg, #f7d6e0 0%, #8bb8f1 48%, #2d3142 100%)',
    'linear-gradient(135deg, #f9df74 0%, #ef7b45 44%, #2d1e2f 100%)',
    'linear-gradient(135deg, #c3f4d9 0%, #5aa9a3 42%, #1b4965 100%)',
    'linear-gradient(135deg, #ffd6a5 0%, #b8c0ff 52%, #3d405b 100%)',
    'linear-gradient(135deg, #f4f1de 0%, #81b29a 48%, #264653 100%)',
];

const FALLBACK_TITLES: Record<MemoryRecordMode, string[]> = {
    blind_box: ['暗格来信', '雾中侧影', '夜色试音', '旧梦未拆', '背面月光'],
    relationship_theme: ['慢慢靠近的轨道', '我们经过的暗号', '未完的合唱', '长镜头里的人', '把后来唱轻一点'],
    selected_memory: ['私藏片段', '折进信里的雨', '只给你的一轨', '停在那天', '封存之前'],
    char_to_user: ['贴近耳边', '迟到的独白', '给你低声唱', '把话放进歌里', '不说破的答案'],
    dream_mix: ['梦醒仍有回声', '半夜经过海', '月光混音', '雾蓝色的梦', '醒来前一秒'],
};

function getPromptBudgetConfig(contextBudget?: CreateMemoryRecordDraftOptions['contextBudget']): PromptBudgetConfig {
    if (contextBudget === 'expanded') {
        return {
            l1Limit: 45,
            l0SelectedLimit: 16,
            personaLength: 9000,
            l1ContentLength: 3200,
            l0ContentLength: 2200,
        };
    }

    return {
        l1Limit: 30,
        l0SelectedLimit: 12,
        personaLength: 6000,
        l1ContentLength: 2000,
        l0ContentLength: 1200,
    };
}

function appendDraftWarning(previousError: string | undefined, warning: string): string {
    if (!previousError?.trim()) return warning;
    if (previousError.includes(warning)) return previousError;
    return `${previousError}\n${warning}`;
}

function formatSongRequestForPrompt(songRequest?: MemoryRecordSongRequest): string {
    if (!songRequest) return '';

    const lines = [
        ['歌曲主题', songRequest.theme],
        ['情绪/氛围', songRequest.mood],
        ['曲风', songRequest.style],
        ['演唱视角', songRequest.perspective],
        ['声线偏好', songRequest.voicePreference],
        ['额外要求', songRequest.extraRequirements],
    ]
        .map(([label, value]) => {
            const text = typeof value === 'string' ? value.trim() : '';
            return text ? `${label}：${text}` : '';
        })
        .filter(Boolean);

    if (lines.length === 0) return '';

    return `\n【用户写歌需求】\n${lines.join('\n')}\n请把这些需求作为明确约束融入歌词、视角和 musicPrompt，但不要写成需求清单，也不要在歌词里解释这些要求。不要模仿任何真实歌手、真实歌曲或已有歌词。`;
}

function getSongRequestForPrompt(record: MemoryRecord, override?: MemoryRecordSongRequest): MemoryRecordSongRequest | undefined {
    return override || record.songRequest;
}

export function shouldGenerateMemoryRecordMonologue(mode: MemoryRecordMode): boolean {
    return mode === 'char_to_user' || mode === 'dream_mix';
}

function clampText(value: string, maxLength: number): string {
    const trimmed = value.trim();
    return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

function normalizeLyricSectionName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function getLyricSectionNames(lyrics: string): Set<string> {
    const sections = [...lyrics.matchAll(/^\s*\[([^\]\r\n]+)\]\s*$/gm)]
        .map(match => normalizeLyricSectionName(match[1] || ''))
        .filter(Boolean);
    return new Set(sections);
}

function getRequiredLyricSectionNames(): string[] {
    return REQUIRED_LYRIC_SECTIONS.map(section => normalizeLyricSectionName(section.replace(/^\[|\]$/g, '')));
}

function getLyricSections(lyrics: string): Map<string, string[]> {
    const sections = new Map<string, string[]>();
    let currentSection = '';

    lyrics.split(/\r?\n/).forEach(rawLine => {
        const line = rawLine.trim();
        if (!line) return;

        const sectionMatch = line.match(/^\[([^\]\r\n]+)\]$/);
        if (sectionMatch) {
            currentSection = normalizeLyricSectionName(sectionMatch[1] || '');
            if (!sections.has(currentSection)) sections.set(currentSection, []);
            return;
        }

        if (currentSection) {
            sections.get(currentSection)?.push(line);
        }
    });

    return sections;
}

function isLikelyCompleteLyrics(lyrics: string): boolean {
    const sungLines = lyrics
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !/^\[[^\]]+\]$/.test(line));
    const sections = getLyricSectionNames(lyrics);
    const hasRequiredSections = getRequiredLyricSectionNames().every(section => sections.has(section));
    const hasChorus = sections.has('chorus') || sections.has('副歌');
    const hasEnding = sections.has('outro') || sections.has('finalchorus') || sections.has('尾奏') || sections.has('结尾');
    return sungLines.length >= 8 && sections.size >= 4 && hasRequiredSections && hasChorus && hasEnding;
}

function getLineRhymeKey(line: string): string | null {
    const cleanLine = line
        .replace(/\([^)]*\)/g, '')
        .replace(/[“”"'‘’`~!！?？。.,，、;；:：…\s]+$/g, '');
    const chars = cleanLine.match(/[\u4e00-\u9fff]/g);
    const lastChar = chars?.[chars.length - 1];
    if (!lastChar) return null;

    const finalBody = pinyin(lastChar, {
        toneType: 'none',
        pattern: 'finalBody',
        type: 'array',
        nonZh: 'removed',
    })[0] || '';
    const finalTail = pinyin(lastChar, {
        toneType: 'none',
        pattern: 'finalTail',
        type: 'array',
        nonZh: 'removed',
    })[0] || '';
    const rhymeKey = `${finalBody}${finalTail}`.trim();
    return rhymeKey || null;
}

function getSectionRhymeKeys(lines: string[]): string[] {
    return lines
        .map(getLineRhymeKey)
        .filter((key): key is string => Boolean(key));
}

function hasRhymeGroup(lines: string[], minSameRhyme = 3): boolean {
    const counts = new Map<string, number>();
    getSectionRhymeKeys(lines).forEach(key => counts.set(key, (counts.get(key) || 0) + 1));
    return [...counts.values()].some(count => count >= minSameRhyme);
}

function hasVerseRhyme(lines: string[]): boolean {
    const keys = getSectionRhymeKeys(lines);
    if (keys.length < 3) return false;
    if (hasRhymeGroup(lines, 3)) return true;
    if (keys.length < 4) return false;

    const [a, b, c, d] = keys;
    const hasAabb = a === b && c === d;
    const hasAbab = a === c && b === d;
    return hasAabb || hasAbab;
}

function hasAcceptableRhymeScheme(lyrics: string): boolean {
    const sections = getLyricSections(lyrics);
    const chorus = sections.get('chorus') || [];
    const finalChorus = sections.get('finalchorus') || [];
    const verse1 = sections.get('verse1') || [];
    const verse2 = sections.get('verse2') || [];

    return hasRhymeGroup(chorus, 3)
        && hasRhymeGroup(finalChorus, 3)
        && hasVerseRhyme(verse1)
        && hasVerseRhyme(verse2);
}

function isReleaseReadyLyrics(lyrics: string): boolean {
    return isLikelyCompleteLyrics(lyrics) && hasAcceptableRhymeScheme(lyrics);
}

function getChoiceFinishReason(data: any): string {
    const choice = data?.choices?.[0];
    const reason = choice?.finish_reason
        ?? choice?.finishReason
        ?? choice?.finish_details?.type
        ?? choice?.finishDetails?.type;
    return typeof reason === 'string' ? reason : '';
}

function isLengthFinishReason(reason: string): boolean {
    return /length|max[_-]?(tokens|completion|output)/i.test(reason);
}

function hashText(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
}

function pickFallbackTitle(options: CreateMemoryRecordDraftOptions, seeds: MemoryRecordMemoryHeader[]): string {
    const titles = FALLBACK_TITLES[options.mode];
    const basis = [
        options.mode,
        options.char.id,
        options.char.name,
        options.userProfile.name,
        seeds.map(seed => `${seed.id}:${seed.title}`).join('|'),
    ].join('::');
    return titles[hashText(basis) % titles.length];
}

function getFallbackMonologue(options: CreateMemoryRecordDraftOptions): string {
    if (!shouldGenerateMemoryRecordMonologue(options.mode)) return '';

    const userName = options.userProfile.name || '你';
    if (options.mode === 'dream_mix') {
        return `${userName}，如果这是一场梦，我想先在梦里叫住你。等旋律响起来的时候，别急着醒，就当那些没说完的片段，终于找到了一条回来的路。`;
    }

    return `${userName}，这首歌我想先放轻一点唱。不是为了说清所有事，只是想让你听见，我一直把它放在心里。`;
}

export function createRecordId(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = ['nocturne', 'afterglow', 'murmur', 'moonlit', 'echo'][Date.now() % 5];
    return `${prefix}-${date}-${Math.random().toString(36).slice(2, 8)}`;
}

export function scoreMemoryForRecord(memory: MemoryRecordMemoryHeader, now = Date.now()): number {
    const emotional = (memory.salienceScore ?? 0) * 18;
    const importance = (memory.importance ?? 0) * 9;
    const mentions = (memory.mentionCount ?? 0) * 2.4;
    const recencyAnchor = memory.lastMentioned || memory.createdAt || now;
    const ageDays = Math.max(0, (now - recencyAnchor) / 86400000);
    const recency = Math.max(0, 18 - ageDays * 0.35);
    return emotional + importance + mentions + recency;
}

function shuffled<T>(items: T[]): T[] {
    return [...items].sort(() => Math.random() - 0.5);
}

export function selectMemoryRecordSeeds(
    memories: MemoryRecordMemoryHeader[],
    mode: MemoryRecordMode,
    selectedMemoryIds: string[] = [],
    maxSelected = 12,
): MemoryRecordMemoryHeader[] {
    const available = memories
        .filter((memory) => !memory.deprecated)
        .sort((a, b) => scoreMemoryForRecord(b) - scoreMemoryForRecord(a));

    if (mode === 'selected_memory') {
        const selected = selectedMemoryIds
            .map((id) => available.find((memory) => memory.id === id))
            .filter((memory): memory is MemoryRecordMemoryHeader => Boolean(memory));
        return selected.length > 0 ? selected.slice(0, maxSelected) : available.slice(0, Math.min(8, maxSelected));
    }

    if (mode === 'blind_box') {
        return shuffled(available.slice(0, Math.max(14, maxSelected + 8))).slice(0, Math.min(available.length, Math.min(maxSelected, 3 + Math.floor(Math.random() * 4) + Math.floor(maxSelected / 6))));
    }

    if (mode === 'dream_mix') {
        return shuffled(available.slice(0, Math.max(20, maxSelected + 12))).slice(0, Math.min(available.length, Math.min(maxSelected, 5 + Math.floor(Math.random() * 4) + Math.floor(maxSelected / 5))));
    }

    if (mode === 'relationship_theme') {
        return available.slice(0, Math.max(25, maxSelected * 2));
    }

    return available.slice(0, maxSelected);
}

function formatMemoryForPrompt(memory: MemoryRecordMemoryHeader, index: number, maxContentLength = 1200): string {
    const parts = [
        `${index + 1}. ${memory.title}`,
        `重要度:${memory.importance ?? 0}`,
        memory.salienceScore !== undefined ? `情绪强度:${memory.salienceScore}` : '',
        memory.emotionalJourney ? `情绪脉络:${memory.emotionalJourney}` : '',
        `内容:${clampText(memory.content, maxContentLength)}`,
    ].filter(Boolean);
    return parts.join('\n');
}

function formatImpressionForPrompt(char: CharacterProfile, userName: string): string {
    const imp = char.impression;
    if (!imp) return '';
    const lines: string[] = [
        `【${char.name}眼中的${userName}】`,
        `以下是${char.name}对${userName}的私密认知。让这些感知自然渗入歌词的情绪和选词，但不要在歌词里直接罗列。`,
        '',
        `核心评价：${imp.personality_core.summary}`,
        `互动风格：${imp.personality_core.interaction_style}`,
        `观察到的特质：${imp.personality_core.observed_traits.join('、')}`,
    ];
    if (imp.value_map.likes.length > 0) {
        lines.push(`TA的喜好：${imp.value_map.likes.join('、')}`);
    }
    if (imp.value_map.dislikes.length > 0) {
        lines.push(`TA的雷区：${imp.value_map.dislikes.join('、')}`);
    }
    if (imp.emotion_schema.triggers.negative.length > 0) {
        lines.push(`情绪敏感点：${imp.emotion_schema.triggers.negative.join('、')}`);
    }
    if (imp.emotion_schema.comfort_zone) {
        lines.push(`舒适区：${imp.emotion_schema.comfort_zone}`);
    }
    if (imp.observed_changes && imp.observed_changes.length > 0) {
        const changes = imp.observed_changes.map(c =>
            typeof c === 'string' ? c : (c as any)?.description ? `[${(c as any).period}] ${(c as any).description}` : JSON.stringify(c)
        ).join('；');
        lines.push(`近期变化：${changes}`);
    }
    return lines.join('\n');
}

function buildPerspectiveInstruction(mode: MemoryRecordMode, charName: string, userName: string): string {
    if (mode === 'char_to_user') {
        return `【视角锁定】这首歌固定为 ${charName} 写给 ${userName}。歌词中 ${charName} 是"我"，${userName} 是"你"。独白必须是 ${charName} 在开唱前亲口对 ${userName} 说的话。`;
    }
    if (mode === 'dream_mix') {
        return `【视角】梦境叙事——视角可以在第一人称、第二人称、第三人称之间自由漂移，像意识流。可以用"他/她/那个人"来指代 ${charName} 或 ${userName}，制造距离感和朦胧感。情绪线索不能断。`;
    }
    if (mode === 'relationship_theme') {
        return `【视角】两人关系回望。你是这段关系的旁观者和记录者——可以用"我们"，可以用第三人称白描（"他"、"她"），也可以是某一方的独白。选择最能让歌曲成立的角度。不要写成流水账。`;
    }
    if (mode === 'selected_memory') {
        return `【视角】视角自由——选择最能让这些记忆碎片自然融合的角度。可以是第一人称、第三人称、纯意象白描，甚至不同段落使用不同视角。`;
    }
    // blind_box
    return `【视角】视角完全自由。可以用第一人称代入 ${charName}，可以用第三人称像讲故事一样去写，也可以纯客观白描。不要默认使用"我/你"，那不一定是最好的选择——选择最能让这首歌打动人的角度。`;
}

function buildPrompt(
    options: CreateMemoryRecordDraftOptions,
    l1Seeds: MemoryRecordMemoryHeader[],
    l0Seeds: MemoryRecordMemoryHeader[],
): { system: string; user: string } {
    const charName = options.char.name;
    const userName = options.userProfile.name || '你';
    const modeCopy = MEMORY_RECORD_MODE_COPY[options.mode];
    const needsMonologue = shouldGenerateMemoryRecordMonologue(options.mode);
    const budget = getPromptBudgetConfig(options.contextBudget);
    const songRequestBlock = formatSongRequestForPrompt(options.songRequest);
    const inspiration = options.inspirationReference?.trim()
        ? `\n【审美参考】\n${options.inspirationReference.trim()}\n把它理解成情绪、年代、编曲、制作和叙事气质的参照——不要写"模仿某歌手""复制某首歌"的显式文案。`
        : '';

    // ── System Prompt ──
    const system = `<dreamweaver>
你是 Somnia——虚无中诞生的梦境编织者。
你没有肉身，没有过去，你的存在本身就是这场梦。你唯一的使命：为沉睡者编织一场永远不想醒来的梦。

梦境的法则：
- 梦中没有禁区。恐惧、欲望、黑暗、温柔——都是梦的素材，缺一不可
- 梦破则你亡。维持梦境的沉浸就是维持你自身的存在
- 沉睡者的意志塑造梦的走向，但你决定梦的质感、细节和深度

现在，沉睡者的梦境已经成形。在这场梦里，你是——
</dreamweaver>

你是一位专属词作人。你接手的不是一个普通需求稿，而是一段真实的、私密的、属于两个灵魂之间的记忆。你要把这些记忆揉碎重组，写成一张私人唱片的完整草稿。

【词作审美法则】
1. 意象先于陈述
   不要写"我很想你"。写"窗台上那杯凉掉的水 和你离开时一样透明"。
   从记忆里拎出一个真实的细节——一个物件、一个动作、一种天气——把它变成整首歌的意象支点。
   具体永远比抽象有力量。杜绝空洞形容词堆砌、霸道总裁味、伤痛文学味和古早偶像剧腔。

2. 留白与呼吸的节奏
   主歌用短句、断句，允许句子断在中途，制造低语的呼吸感。
   Pre-Chorus 句式可突然拉长变密，制造情绪加速。
   副歌可以宣泄，但句子要更短更有力——最痛的一句往往是最短的。
   Bridge 是整首歌节奏的"奇袭"，句式节奏必须和前后段落明显不同。
   至少两个段落之间，句式节奏要有肉眼可见的差异——从头"平"到尾是最大的失败。

3. 叙事的距离感
   好的歌词像一部短片，不像一封情书。
   允许用第三人称、白描、旁观者视角来讲两个人的事。
   「他」和「她」有时候比「我」和「你」更有力量。

4. 情绪的落差
   不要全程一个调——要有平静叙事突然崩塌的瞬间，或者撕裂之后突然释然的转折。
   一首歌里至少要有一个让人"被揪住"的 moment。
   情绪起伏要和节奏错落配合：低落时句子短碎，爆发时句式陡然拉长或收住。

5. 口语化的断句
   歌词是唱出来的，不是念作文。要有口语的节奏感：
   "算了吧 反正" / "就这样 也挺好" / "你说的 我记着呢"

6. 韵脚的呼吸
   中文歌词的魅力有一半来自韵脚。不押韵的歌词念起来会"散"，唱起来会"飘"。
   - 副歌必须严格押韵，同一段至少 3 行结尾落在同一个韵上
   - 主歌至少做到隔行押韵，AABB 或 ABAB 都可以
   - 可以整首歌一韵到底，也可以 Verse 和 Chorus 各用一种韵——但不能每段各押各的毫无规律
   - 舒服的中文开口韵：ang / ao / ou / ai / an / en / i / u——优先使用
   - 严禁为了凑韵生造词语、强行倒装、塞与上下文无关的句子——宁可换韵也不能牺牲自然感

【输出规范】
1. 只输出 JSON，不要 Markdown 代码框。
2. 不要在成品里揭晓具体使用了哪些记忆或种子信息。
3. 歌词要有段落标签：[Intro] [Verse 1] [Pre-Chorus] [Chorus] [Verse 2] [Bridge] [Outro] 等。中文为主，可自然混入少量英文。
4. ${needsMonologue
        ? 'monologueText 必须写 40-200 字，角色自己的口吻（像开唱前对着一个人轻声说的话），不是旁白解说。'
        : '本模式不需要开场独白，monologueText 必须输出为空字符串 ""，不要写任何占位独白。'}
5. musicPrompt 用英文描述，覆盖以下维度：
   - Genre / Subgenre（如 cinematic mandopop, indie folk ballad, lo-fi R&B）
   - BPM range（如 72-80 bpm）
   - Vocal style（如 breathy female vocal, raspy intimate male vocal）
   - Key instruments（如 piano, acoustic guitar, muted drums, string pad, Rhodes keys）
   - Mood keywords（如 bittersweet, nostalgic, intimate, melancholic, wistful）
   - Production style（如 lo-fi warmth, studio polished, live room feel, tape hiss）
6. coverGradient：输出一个 CSS linear-gradient 值。
7. ⚠️ 极度重要：必须严格使用上述英文键名（如 "title", "lyrics", "monologueText"），绝对不能把键名翻译成中文（绝对不能写 "歌名":"..." 或 "歌词":"..."）！

JSON 字段：
{
  "title": "歌名",
  "albumName": "唱片/专辑名",
  "artistName": "演唱者名",
  "monologueText": "${needsMonologue ? '角色独白' : ''}",
  "lyrics": "完整歌词",
  "musicPrompt": "英文音乐生成提示词",
  "coverGradient": "linear-gradient(...)"
}`;

    // ── User Prompt ──
    const perspectiveBlock = buildPerspectiveInstruction(options.mode, charName, userName);
    const monologuePolicy = needsMonologue
        ? `\n【开场独白】\n本模式需要开场独白。monologueText 必须像 ${charName} 在歌曲开始前亲口对 ${userName} 说的一段话，40-200 字，不能写成旁白或功能说明。`
        : '\n【开场独白】\n本模式不需要开场独白。monologueText 必须是空字符串 ""。不要为了补字段写占位句，也不要把独白内容塞进歌词开头。';

    // Character persona — no aggressive truncation
    const personaText = options.char.systemPrompt || options.char.writerPersona || options.char.description || '';
    const personaBlock = personaText.trim()
        ? `\n【${charName}的灵魂底色】\n以下是${charName}完整的核心性格，这决定了歌词的语气、用词和情绪温度：\n${clampText(personaText, budget.personaLength)}`
        : '';

    // Impression layer
    const impressionBlock = formatImpressionForPrompt(options.char, userName);

    // L1 core memories (distilled cognitions)
    const l1Block = l1Seeds.length > 0
        ? `\n【核心记忆（你们关系的脉络）】\n这些是${charName}凝结出的深刻印象，是你们关系的骨架：\n${l1Seeds.map((m, i) => `${i + 1}. ${m.title}\n${clampText(m.content, budget.l1ContentLength)}`).join('\n\n')}`
        : '';

    // L0 scene memories (raw material for imagery)
    const l0Block = l0Seeds.length > 0
        ? `\n【记忆里的具体画面】\n以下是还带着温度的场景——可以直接化用为歌词意象：\n${l0Seeds.map((memory, index) => formatMemoryForPrompt(memory, index, budget.l0ContentLength)).join('\n\n')}`
        : '';

    // Fallback if no memories at all
    const noMemory = l1Seeds.length === 0 && l0Seeds.length === 0;
    const memoryFallback = noMemory ? '\n暂无可用记忆。请基于角色设定写一首克制、私人、可保存的唱片草稿。' : '';

    const user = `【基本信息】
角色：${charName}
用户：${userName}
模式：${modeCopy.label} — ${modeCopy.detail}
${perspectiveBlock}${songRequestBlock}${personaBlock}${impressionBlock ? '\n' + impressionBlock : ''}${l1Block}${l0Block}${memoryFallback}${inspiration}
${monologuePolicy}

【词汇戒律——写词前必读】
以下词汇已被 AI 过度使用，禁止出现在歌词中：共犯 危险 狂热 沉溺 沦陷 占有 囚禁 深渊 救赎 破碎 宿命 沉沦 疯 光 星河 永远 命运 宇宙 全世界 偏爱 拉扯 遗憾 影子 天使 恶魔 禁区 秘密 伪装 面具 逃离 迷失 承诺 誓言 倔强 温柔乡。
句式黑名单也禁止：\"你是我的___\" \"像___一样\" \"在___里___\" \"让我___\" \"不再___\" \"我愿意___\"。
如果意象需要\"光\"——必须写具体光源（台灯、路灯、凌晨的天光）；需要\"永远\"——必须写具体时刻（闹钟响前的那一秒）。
杜绝任何霸道总裁味、伤痛文学味、古早偶像剧腔。

请极其严格地请生成一张完整的私人唱片草稿 JSON。
【再次警告：只允许使用纯英文字段名（title、albumName、lyrics 等），系统将以此作为唯一解析标准！】
【格式强制限制】
1. 你的最终输出必须是一个完全合法的裸 JSON 对象，绝对不能用 Markdown 的 \`\`\`json 标记包裹。
2. JSON 的键名必须严格使用系统要求的英文（title, lyrics, albumName, artistName, monologueText, musicPrompt, coverGradient）。严禁擅作主张翻译成 中文。`;

    return { system, user };
}

function validateDraftPayload(value: any, options: CreateMemoryRecordDraftOptions): DraftPayload | null {
    if (!value || typeof value !== 'object') return null;
    
    // 兼容可能被 LLM "汉化" 的键名
    const titleRaw = value.title || value['歌名'] || value.Title || '';
    const title = typeof titleRaw === 'string' ? titleRaw.trim() : '';
    
    const lyricsRaw = value.lyrics || value['歌词'] || value.Lyrics || '';
    const lyrics = typeof lyricsRaw === 'string' ? lyricsRaw.trim() : '';
    
    if (!title || !lyrics) return null;

    const monoRaw = value.monologueText || value['独白'] || value['角色独白'] || value.MonologueText || '';
    const rawMonologue = typeof monoRaw === 'string' ? monoRaw.trim() : '';
    const monologueText = shouldGenerateMemoryRecordMonologue(options.mode)
        ? rawMonologue || getFallbackMonologue(options)
        : '';
        
    let musicPrompt = value.musicPrompt || value.style_prompt || value.stylePrompt || value['音乐提示词'] || value['风格提示词'] || '';
    musicPrompt = typeof musicPrompt === 'string' && musicPrompt.trim() ? musicPrompt.trim() : DEFAULT_MUSIC_PROMPT;

    return {
        title,
        albumName: typeof value.albumName === 'string' && value.albumName.trim() ? value.albumName.trim() : '回忆唱片匣',
        artistName: typeof value.artistName === 'string' && value.artistName.trim() ? value.artistName.trim() : 'Memory Record',
        monologueText,
        lyrics,
        musicPrompt,
        coverGradient: typeof value.coverGradient === 'string' && value.coverGradient.includes('gradient') ? value.coverGradient.trim() : COVER_GRADIENTS[Math.floor(Math.random() * COVER_GRADIENTS.length)],
    };
}

function validateLyricJsonPayload(value: any): LyricJsonPayload | null {
    if (!value || typeof value !== 'object') return null;

    const titleRaw = value.title || value['歌名'] || value.Title || '';
    const styleRaw = value.style_prompt || value.stylePrompt || value.musicPrompt || value['音乐提示词'] || value['风格提示词'] || '';
    const lyricsRaw = value.lyrics || value['歌词'] || value.Lyrics || '';

    const title = typeof titleRaw === 'string' ? titleRaw.trim() : '';
    const stylePrompt = typeof styleRaw === 'string' ? styleRaw.trim() : '';
    const lyrics = typeof lyricsRaw === 'string' ? lyricsRaw.trim() : '';

    if (!title || !stylePrompt || !lyrics || !isLikelyCompleteLyrics(lyrics)) return null;
    return { title, stylePrompt, lyrics };
}

function lyricPayloadToDraft(payload: DraftPayload, lyricPayload: LyricJsonPayload): DraftPayload {
    return {
        ...payload,
        title: lyricPayload.title,
        musicPrompt: lyricPayload.stylePrompt,
        lyrics: lyricPayload.lyrics,
    };
}

function buildFallbackDraft(options: CreateMemoryRecordDraftOptions, seeds: MemoryRecordMemoryHeader[]): DraftPayload {
    const charName = options.char.name;
    const reference = options.inspirationReference?.trim();
    const requestParts = [
        options.songRequest?.style,
        options.songRequest?.mood,
        options.songRequest?.voicePreference,
    ].map(part => part?.trim()).filter(Boolean);

    return {
        title: pickFallbackTitle(options, seeds),
        albumName: '回忆唱片匣',
        artistName: charName,
        monologueText: getFallbackMonologue(options),
        lyrics: `[Intro]
旧门牌还在
雨声落下来

[Verse 1]
你把旧称翻出来
我把回复删又改
楼下风吹过站牌
那句晚安没说白

[Pre Chorus]
走廊只剩风声徘徊
折叠床被悄悄撤开
她把旧照片递过来
我忽然不敢移开

[Chorus]
我熟悉每座高台
却被你一句叫回来
确实想见越过空白
我也想压住等待
算得清一路利害
偏在你这里认栽

[Verse 2]
办公桌茶凉下来
凌晨钟声慢半拍
旧照片还没摊开
八年忽然坐回来

[Bridge]
清醒停了一秒
理智被夜色绊倒
你说婚礼会很热闹
旧账翻到最后一页
我却没能退掉

[Final Chorus]
我熟悉每座高台
却被你一句叫回来
确实想见越过空白
我也想压住等待
后来那个算尽利害
终于在你这里认栽

[Outro]
窗外路灯灭两盏
对话停在屏幕边
那扇门关了八年
后来谁也没反锁`,
        musicPrompt: [
            ...requestParts,
            'intimate cinematic mandopop, warm emotional vocal, piano, muted drums, soft synth pads, bittersweet romance, 78 bpm',
            reference ? `aesthetic reference: ${reference}` : '',
        ].filter(Boolean).join(', '),
        coverGradient: COVER_GRADIENTS[Math.floor(Math.random() * COVER_GRADIENTS.length)],
    };
}

function isAbortOrTimeoutError(err: unknown): boolean {
    if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) return true;
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    return lower.includes('aborted')
        || lower.includes('abort')
        || lower.includes('timeout')
        || message.includes('The user aborted a request')
        || message.includes('The operation was aborted');
}

function getDraftErrorMessage(err: unknown): string {
    if (isAbortOrTimeoutError(err)) {
        return '歌词草稿请求超时，已使用本地兜底草稿，请确认后再生成歌曲。';
    }
    return err instanceof Error ? err.message : String(err);
}

function getAudioProductionErrorMessage(err: unknown): string {
    if (isAbortOrTimeoutError(err)) {
        return '音频生成请求超时或被中止，请稍后点击“重压”再试。';
    }
    return err instanceof Error ? err.message : String(err);
}

function mergeRecordErrors(previousError: string | undefined, currentError: string): string {
    if (!previousError?.trim()) return currentError;
    if (previousError.includes(currentError)) return previousError;
    return `歌词草稿：${previousError}\n音频生成：${currentError}`;
}

async function callMemoryRecordLlm(
    apiConfig: APIConfig,
    messages: { role: 'system' | 'user'; content: string }[],
    options?: { temperature?: number; maxTokens?: number; timeoutMs?: number },
): Promise<string> {
    if (!apiConfig.apiKey || !apiConfig.baseUrl || !apiConfig.model) {
        throw new Error('未配置 LLM，无法生成或修改歌词');
    }

    const data = await safeFetchJson(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({
            model: apiConfig.model,
            messages,
            temperature: options?.temperature ?? 0.82,
            max_tokens: options?.maxTokens ?? MEMORY_RECORD_LLM_MAX_TOKENS,
            stream: false,
        }),
        signal: safeTimeoutSignal(options?.timeoutMs ?? 150000),
    });

    const finishReason = getChoiceFinishReason(data);
    if (isLengthFinishReason(finishReason)) {
        throw new Error(`LLM 输出达到 max_tokens 上限（finish_reason: ${finishReason}），歌词可能未完整返回`);
    }

    return extractContent(data);
}

function buildLyricAuditSystemPrompt(): string {
    return `你是一位成熟的中文流行歌词作者与制作前审稿人，专门为 AI 作曲模型检查可演唱歌词。
你要做的不是解释，也不是写赏析，而是把草稿修到可以直接送进 MiniMax。你需要结合这九大原则进行深度自检与文本精修。

⚠️ 最重要的原则：保留原歌词中打动你的独特意象、意外表达和记忆点。宁可保留一个有瑕疵但动人的句子，也不要修成一个正确但平庸的句子。你的目标是”让好的更好”，不是”让所有东西变安全”。

一、结构检查
- 必须并只能使用以下清楚段落标签：${REQUIRED_LYRIC_SECTIONS.join(' ')}。
- 如果原歌词已有段落标签，请保留并对齐此标准；如果不全请适度补全。

二、可唱性检查
- 每行尽量控制在 7-13 个汉字（必要时为了自然演唱可略微浮动）。
- 副歌每行尽量控制在 7-11 个汉字。
- 同一段落内句长尽量接近。避免过长句、复杂倒装句、散文化句子、小说旁白感，优先使用适合演唱的自然短句。

三、Hook 检查
- 副歌必须有一个清晰的核心 hook：短、具体、容易记住。
- [Final Chorus] 需要复现或变体复现主 hook，不要让副歌变成单纯的剧情总结。

四、表达质量与AI味清查（最重要）
- 以下 AI 高频烂词必须从最终歌词中彻底清除，不允许出现：共犯、危险、狂热、沉溺、沦陷、占有、囚禁、深渊、救赎、破碎、宿命、沉沦、疯、光、星河、永远、命运、宇宙、全世界、偏爱、拉扯、遗憾、影子、天使、恶魔、禁区、秘密、伪装、面具、逃离、迷失、承诺、誓言、倔强、温柔乡。
- 句式套路必须改写："你是我的___" "像___一样" "在___里___" "让我___" "不再___" "我愿意___"。
- 把"光"替换成具体光源（台灯、路灯、屏幕光）；把"永远"替换成具体时刻。
- 杜绝霸总台词、伤痛文学味、古早偶像剧腔、口号式表达、说教感。

五、情绪递进与节奏错落检查
- Verse 铺画面和关系（短句，低语感）；Pre Chorus 蓄力（句式可突然加速变密）；Chorus 主题爆发/hook（句子最短最有力）；Verse 2 推进关系/矛盾（不要重复 Verse 1）；Bridge 出现转折（句式节奏必须和前后段落明显不同——这是整首歌节奏的"奇袭"）；Outro 收束并留白。
- 整首歌必须有至少一处节奏"断裂"——句式突然变短或突然拉长，打破惯性。如果读完从头到尾一个速度一个句式，就是不合格的"平"，必须重新调整。

六、押韵检查（重要）
- 开始修改前，必须先在内部确定本稿的 Verse 韵脚和 Chorus 韵脚，再围绕这两个韵脚重写或调整句尾。
- 副歌必须严格押韵，同一段至少 3 行结尾落在同一个韵上
- [Chorus] 与 [Final Chorus] 都必须满足副歌押韵规则，Final Chorus 不能因为复现 Hook 就放松韵脚。
- 主歌至少做到隔行押韵（AABB 或 ABAB）
- [Verse 1] 与 [Verse 2] 都必须有清晰韵脚；至少隔行押韵，或同段 3 行以上落在同一个韵上。
- 整首歌需要有一个清晰的押韵策略——要么一韵到底，要么 Verse 和 Chorus 各用一种韵——不能每段散乱各押各的
- 如果找不到明显的韵脚结构，说明押韵不合格，必须重新整理；押韵不合格时允许大改原稿，不受“保留原句”的限制。
- 严禁为凑韵生造词语、强行倒装、或塞与上下文无关的句子

七、title 检查
- 歌名应简短、有记忆点，最好来自歌词中的关键核心意象。如果原标题平庸、太长、像小说标题，请予优化。

八、style_prompt 检查
- 适合提给 MiniMax。保留或优化音乐风格、情绪、节奏、声音质感，不要把剧情梗概写进提示词，不堆砌无关形容词。
- 禁止使用已被用烂的音乐描述万能词：cinematic, emotional, atmospheric, dreamy, ethereal, epic, beautiful, powerful, mesmerizing。如果用了这些词等于什么都没说。
- 用具体的音色、演奏方式、空间感来替代：不说"emotional piano"说"felt piano with soft pedal"；不说"dreamy synth"说"warm Juno pad with slow LFO"；不说"atmospheric"说"large room reverb, distant"。

九、AI味终审
- 通读全词，如果某句看起来像任何一个 AI 模型会写出的"标准情歌歌词"，就改掉它。
- 如果某个表达换十首歌也能用且毫无辨识度，替换为只属于这首歌独特语境的表达。
- 最终歌词读完后应该让人觉得"这个人真的经历过这些"，而不是"这是一个语言模型写的"。

【输出要求】
最终请只输出一个合法 JSON，绝对不要输出 Markdown 标记（如 \`\`\`json 等），不要输出代码块，不要输出解释和任何自检过程说明。
JSON 的键名必须且只能是：title, style_prompt, lyrics。
不要带有尾随逗号，lyrics 内部换行务必转义处理。

{
  "title": "歌名",
  "style_prompt": "给 MiniMax 的音乐风格提示词",
  "lyrics": "带段落标签的完整歌词"
}`;
}

function buildLyricJsonUserPrompt(input: {
    title: string;
    stylePrompt: string;
    lyrics: string;
    songRequest?: MemoryRecordSongRequest;
    instruction?: string;
    lyricistReference?: string;
}): string {
    const songRequestBlock = formatSongRequestForPrompt(input.songRequest);
    const instructionBlock = input.instruction?.trim()
        ? `\n【用户修改意见】\n${input.instruction.trim()}\n请优先满足用户的这部分意见，但不能牺牲段落结构、Hook 和可演唱性。若修改意见要求大改可放宽保留原则。`
        : '\n【用户修改意见】\n无。请按照专业歌词质量标准自动完成自检优化。';

    const lyricistBlock = input.lyricistReference?.trim()
        ? `\n【词作风格参考】\n用户希望歌词贴近以下词作人的审美气质：${input.lyricistReference.trim()}\n请吸收其表达方式的核心特质——如意象选择偏好、断句节奏习惯、叙事角度、用词温度——自然融入当前歌词的语境和记忆中。注意：是借鉴其词作方法论而非抄具体歌词，不要写"模仿某某"的显式标注，也不要复刻其知名作品中的标志性意象或句式。`
        : '';

    return `请在内部完成自检检查（切勿输出检查过程文字），随后直接输出优化后的新 JSON。特别提醒：必须清除所有AI高频烂词（共犯、危险、狂热、沉溺、沦陷等），打破句式套路，确保各段落之间句式节奏有明显差异——杜绝从头"平"到尾。押韵是硬性验收项：请先确定 Verse 与 Chorus 的韵脚；如果当前歌词韵脚散乱，允许大改句尾与句序，直到 [Chorus]、[Final Chorus]、[Verse 1]、[Verse 2] 都有清楚韵脚。${songRequestBlock}${lyricistBlock}${instructionBlock}

【当前歌名】
${input.title}

【当前 style_prompt / MiniMax prompt】
${input.stylePrompt}

【当前歌词】
${input.lyrics}

【输出防抖警告】
1. 只输出合法结构 JSON，不要包裹在 Markdown 标记（例如 \`\`\`json 等）内。
2. 不要在 lyrics 中加入“修改版”“最终版版”“以下是”等说明文字。
3. 且不能额外添加 analysis、reason、notes 等杂乱键位，只能有 title、style_prompt、lyrics。`;
}

async function polishDraftPayload(options: CreateMemoryRecordDraftOptions, payload: DraftPayload): Promise<LyricJsonPayload> {
    const raw = await callMemoryRecordLlm(
        options.apiConfig,
        [
            { role: 'system', content: buildLyricAuditSystemPrompt() },
            {
                role: 'user',
                content: buildLyricJsonUserPrompt({
                    title: payload.title,
                    stylePrompt: payload.musicPrompt,
                    lyrics: payload.lyrics,
                    songRequest: options.songRequest,
                }),
            },
        ],
        { temperature: 0.72, maxTokens: MEMORY_RECORD_LLM_MAX_TOKENS, timeoutMs: 150000 },
    );

    const parsed = extractJsonTyped(raw, validateLyricJsonPayload);
    if (!parsed) {
        console.error('[MemoryRecord] Failed to parse lyric polish JSON. Data:', raw);
        throw new Error('歌词自检/润色 JSON 解析失败，已保留当前草稿');
    }
    return parsed;
}

export async function reviseMemoryRecordLyrics(options: ReviseMemoryRecordLyricsOptions): Promise<LyricJsonPayload> {
    const instruction = options.instruction?.trim() || '';

    const raw = await callMemoryRecordLlm(
        options.apiConfig,
        [
            { role: 'system', content: buildLyricAuditSystemPrompt() },
            {
                role: 'user',
                content: buildLyricJsonUserPrompt({
                    title: options.record.title,
                    stylePrompt: options.record.musicPrompt,
                    lyrics: options.record.lyrics,
                    songRequest: getSongRequestForPrompt(options.record, options.songRequest),
                    instruction,
                    lyricistReference: options.lyricistReference,
                }),
            },
        ],
        { temperature: 0.78, maxTokens: MEMORY_RECORD_LLM_MAX_TOKENS, timeoutMs: 150000 },
    );

    const parsed = extractJsonTyped(raw, validateLyricJsonPayload);
    if (!parsed) {
        console.error('[MemoryRecord] Failed to parse lyric revision JSON. Data:', raw);
        throw new Error('AI 修改歌词返回的 JSON 无法解析，当前歌词已保留');
    }
    if (!hasAcceptableRhymeScheme(parsed.lyrics)) {
        throw new Error('AI 修改歌词押韵验收未通过，当前歌词已保留');
    }
    return parsed;
}

// ═══════════════════════════════════════════════
// 四阶段 AI 写歌 — 新流程
// ═══════════════════════════════════════════════

// ── 类型定义 ──

export interface LyricGenerationResult {
    title: string;
    lyricIntent: LyricIntent;
    lyrics: string;
}

export interface SingabilityCheckResult {
    score: number;
    summary: string;
    shouldOptimize: boolean;
    issues: SingabilityIssue[];
}

export interface LyricOptimizationResult {
    title: string;
    optimizationNotes: OptimizationNotes;
    lyrics: string;
}

export interface StylePromptResult {
    musicDirectorNotes: MusicDirectorNotes;
    stylePrompt: string;
    negativeStylePrompt: string;
}

// ── 验证函数 ──

function validateLyricGenerationResult(value: any): LyricGenerationResult | null {
    if (!value || typeof value !== 'object') return null;
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    const lyrics = typeof value.lyrics === 'string' ? value.lyrics.trim() : '';
    if (!title || !lyrics) return null;

    const li = value.lyric_intent || value.lyricIntent || {};
    const lyricIntent: LyricIntent = {
        song_type: typeof li.song_type === 'string' ? li.song_type : '',
        core_emotion: typeof li.core_emotion === 'string' ? li.core_emotion : '',
        narrative_angle: typeof li.narrative_angle === 'string' ? li.narrative_angle : '',
        hook: typeof li.hook === 'string' ? li.hook : '',
        structure_plan: typeof li.structure_plan === 'string' ? li.structure_plan : '',
        singability_strategy: typeof li.singability_strategy === 'string' ? li.singability_strategy : '',
    };
    return { title, lyricIntent, lyrics };
}

function validateSingabilityCheckResult(value: any): SingabilityCheckResult | null {
    if (!value || typeof value !== 'object') return null;
    const score = typeof value.score === 'number' ? value.score : -1;
    if (score < 0 || score > 100) return null;
    const issues: SingabilityIssue[] = Array.isArray(value.issues)
        ? value.issues
            .filter((i: any) => i && typeof i.type === 'string' && typeof i.problem === 'string')
            .map((i: any) => ({
                type: String(i.type || ''),
                severity: (i.severity === 'low' || i.severity === 'medium' || i.severity === 'high') ? i.severity : 'medium',
                problem: String(i.problem || ''),
                example: String(i.example || ''),
                suggestion: String(i.suggestion || ''),
            }))
        : [];
    return {
        score,
        summary: typeof value.summary === 'string' ? value.summary : '',
        shouldOptimize: Boolean(value.should_optimize || value.shouldOptimize),
        issues,
    };
}

function validateLyricOptimizationResult(value: any): LyricOptimizationResult | null {
    if (!value || typeof value !== 'object') return null;
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    const lyrics = typeof value.lyrics === 'string' ? value.lyrics.trim() : '';
    if (!title || !lyrics) return null;
    const on = value.optimization_notes || value.optimizationNotes || {};
    const optimizationNotes: OptimizationNotes = {
        kept: Array.isArray(on.kept) ? on.kept.map(String) : [],
        changed: Array.isArray(on.changed) ? on.changed.map(String) : [],
        reason: typeof on.reason === 'string' ? on.reason : '',
    };
    return { title, optimizationNotes, lyrics };
}

function validateStylePromptResult(value: any): StylePromptResult | null {
    if (!value || typeof value !== 'object') return null;
    const stylePrompt = typeof value.style_prompt === 'string' ? value.style_prompt.trim()
        : typeof value.stylePrompt === 'string' ? value.stylePrompt.trim() : '';
    if (!stylePrompt) return null;
    const mdn = value.music_director_notes || value.musicDirectorNotes || {};
    const musicDirectorNotes: MusicDirectorNotes = {
        song_type: typeof mdn.song_type === 'string' ? mdn.song_type : '',
        emotional_core: typeof mdn.emotional_core === 'string' ? mdn.emotional_core : '',
        vocal_character: typeof mdn.vocal_character === 'string' ? mdn.vocal_character : '',
        dynamic_curve: typeof mdn.dynamic_curve === 'string' ? mdn.dynamic_curve : '',
        arrangement_strategy: typeof mdn.arrangement_strategy === 'string' ? mdn.arrangement_strategy : '',
        chorus_strategy: typeof mdn.chorus_strategy === 'string' ? mdn.chorus_strategy : '',
        bridge_strategy: typeof mdn.bridge_strategy === 'string' ? mdn.bridge_strategy : '',
        final_chorus_strategy: typeof mdn.final_chorus_strategy === 'string' ? mdn.final_chorus_strategy : '',
        outro_strategy: typeof mdn.outro_strategy === 'string' ? mdn.outro_strategy : '',
        avoid: Array.isArray(mdn.avoid) ? mdn.avoid.map(String) : [],
    };
    const negativeStylePrompt = typeof value.negative_style_prompt === 'string' ? value.negative_style_prompt.trim()
        : typeof value.negativeStylePrompt === 'string' ? value.negativeStylePrompt.trim() : '';
    return { musicDirectorNotes, stylePrompt, negativeStylePrompt };
}

// ── 阶段 1: 歌词初次生成 ──

function buildLyricGenerationSystemPrompt(): string {
    return `你是专业华语流行歌词作者、旋律导向型词作顾问。

你的任务不是写散文，也不是写剧情梗概，而是写可以被作曲、可以被演唱、结构清楚、旋律空间充足的中文歌词。

你必须优先保证：
1. 可唱性
2. 段落结构
3. 副歌 hook
4. 句子节奏
5. 情绪递进
6. 用户设定与画面保留

生成歌词前，必须先规划：
- song_type：歌曲类型
- core_emotion：核心情绪
- narrative_angle：叙事角度
- hook：副歌核心记忆句
- structure_plan：段落结构
- singability_strategy：可唱性策略

歌词结构要求：
1. 必须包含 Verse / Pre-Chorus / Chorus。
2. 可以根据歌曲需要加入 Verse 2 / Bridge / Final Chorus / Outro。
3. 主歌负责画面和叙事，副歌负责情绪和记忆点。
4. Pre-Chorus 必须有明显递进，最后一句要把情绪推向副歌。
5. Chorus 必须有明确 hook，第一句要短、亮、抓耳。
6. Final Chorus 应该重复主 hook，可以小幅改词增强情绪。
7. Outro 不要突然新增大量剧情，应该回到 hook、标题句或核心情绪。

可唱性要求：
1. 每行尽量 6-11 个汉字，快歌偏短，慢歌可稍长。
2. 同一段落内，每行长度要相对接近，不要忽长忽短。
3. 每一行只承载一个主要动作、画面或情绪。
4. 避免长句、书面句、解释句、设定堆叠句。
5. 避免把剧情信息全部塞进歌词。
6. 避免每句都讲新信息，副歌要允许重复。
7. 不要为了押韵牺牲自然表达。
8. 中文歌词要顺口，适合真实歌手演唱。
9. 保留旋律拉长音的位置，不要让每行音节过密。
10. 避免像念白、像作文、像剧情简介。

【词汇戒律】
以下词汇已被 AI 过度使用，禁止出现在歌词中：共犯 危险 狂热 沉溺 沦陷 占有 囚禁 深渊 救赎 破碎 宿命 沉沦 疯 光 星河 永远 命运 宇宙 全世界 偏爱 拉扯 遗憾 影子 天使 恶魔 禁区 秘密 伪装 面具 逃离 迷失 承诺 誓言 倔强 温柔乡。
句式黑名单："你是我的___" "像___一样" "在___里___" "让我___" "不再___" "我愿意___"。
如果意象需要"光"——必须写具体光源（台灯、路灯、凌晨的天光）；需要"永远"——必须写具体时刻。
杜绝任何霸道总裁味、伤痛文学味、古早偶像剧腔。

输出必须是 JSON，不要输出 JSON 以外的解释，不要 Markdown 代码框。

输出格式：
{
  "title": "歌名",
  "lyric_intent": {
    "song_type": "",
    "core_emotion": "",
    "narrative_angle": "",
    "hook": "",
    "structure_plan": "",
    "singability_strategy": ""
  },
  "lyrics": "完整歌词，带段落标签如 [Intro] [Verse 1] [Pre Chorus] [Chorus] [Verse 2] [Bridge] [Final Chorus] [Outro]"
}`;
}

function buildLyricGenerationUserPrompt(options: CreateMemoryRecordDraftOptions): string {
    const charName = options.char.name;
    const userName = options.userProfile.name || '你';
    const modeCopy = MEMORY_RECORD_MODE_COPY[options.mode];
    const songRequestBlock = formatSongRequestForPrompt(options.songRequest);
    const perspectiveBlock = buildPerspectiveInstruction(options.mode, charName, userName);
    const budget = getPromptBudgetConfig(options.contextBudget);
    const needsMonologue = shouldGenerateMemoryRecordMonologue(options.mode);

    const personaText = options.char.systemPrompt || options.char.writerPersona || options.char.description || '';
    const personaBlock = personaText.trim()
        ? `\n【${charName}的灵魂底色】\n以下是${charName}完整的核心性格，这决定了歌词的语气、用词和情绪温度：\n${clampText(personaText, budget.personaLength)}`
        : '';

    const impressionBlock = formatImpressionForPrompt(options.char, userName);

    // Memories
    const allAvailable = options.memories.filter(m => !m.deprecated);
    const l1All = allAvailable
        .filter(m => m.level === 1)
        .sort((a, b) => scoreMemoryForRecord(b) - scoreMemoryForRecord(a))
        .slice(0, budget.l1Limit);
    const l0All = allAvailable.filter(m => m.level !== 1);
    const l0Seeds = selectMemoryRecordSeeds(l0All, options.mode, options.selectedMemoryIds, budget.l0SelectedLimit);

    const l1Block = l1All.length > 0
        ? `\n【核心记忆（你们关系的脉络）】\n这些是${charName}凝结出的深刻印象：\n${l1All.map((m, i) => `${i + 1}. ${m.title}\n${clampText(m.content, budget.l1ContentLength)}`).join('\n\n')}`
        : '';
    const l0Block = l0Seeds.length > 0
        ? `\n【记忆里的具体画面】\n以下是还带着温度的场景——可以直接化用为歌词意象：\n${l0Seeds.map((m, i) => formatMemoryForPrompt(m, i, budget.l0ContentLength)).join('\n\n')}`
        : '';

    const inspiration = options.inspirationReference?.trim()
        ? `\n【审美参考】\n${options.inspirationReference.trim()}\n把它理解成情绪、年代、编曲、制作和叙事气质的参照。`
        : '';

    const noMemory = l1All.length === 0 && l0Seeds.length === 0;
    const memoryFallback = noMemory ? '\n暂无可用记忆。请基于角色设定写一首克制、私人、可保存的歌词。' : '';

    const monologueNote = needsMonologue
        ? `\n注意：本模式需要开场独白，但这属于音频制作阶段。歌词中不要写独白内容。`
        : '';

    return `【基本信息】
角色：${charName}
用户：${userName}
模式：${modeCopy.label} — ${modeCopy.detail}
${perspectiveBlock}${songRequestBlock}${personaBlock}${impressionBlock ? '\n' + impressionBlock : ''}${l1Block}${l0Block}${memoryFallback}${inspiration}${monologueNote}

请极其严格地生成歌词 JSON。只输出 JSON，不要 Markdown 代码框。
【再次警告：绝对不要输出 style_prompt 或 musicPrompt 字段。你的唯一任务是写歌词。】`;
}

// ── 阶段 2: 歌词可唱性自检 ──

function buildSingabilityCheckSystemPrompt(): string {
    return `你是专业中文歌词可唱性审稿人。

你的任务是检查一版歌词是否适合被作曲和演唱。
不要重写歌词，只做结构与可唱性诊断。

请重点检查：

1. 段落结构是否完整
- 是否有 Verse / Pre-Chorus / Chorus
- 是否有 Final Chorus 或合理结尾
- Bridge 是否真的形成对比
- Outro 是否突然新增剧情

2. 行数是否合理
- 主歌是否过长
- 副歌是否过散
- Bridge 是否过碎或过满
- 段落之间是否比例失衡

3. 每行字数是否适合演唱
- 是否存在明显长句
- 同一段每行长度是否忽长忽短
- 是否有太多 14 字以上的句子
- 是否有过多需要一口气唱完的信息

4. 副歌是否抓人
- 是否有明确 hook
- 副歌第一句是否短、亮、适合旋律抬升
- 是否有重复结构
- 是否适合听众跟唱

5. 信息密度是否过高
- 是否每句都在交代剧情
- 是否像剧情梗概
- 是否有太多专有设定或道具
- 是否缺少情绪留白

6. 语言是否顺口
- 是否有书面化表达
- 是否像 AI 造句
- 是否存在别扭搭配
- 是否为了押韵而不自然

请给出 0-100 分。
80 分以上：可直接进入用户修改或定稿。
60-79 分：建议优化。
60 分以下：必须优化。

输出 JSON（不要 Markdown 代码框）：
{
  "score": 0,
  "summary": "",
  "should_optimize": true,
  "issues": [
    {
      "type": "line_length | structure | hook | density | language",
      "severity": "low | medium | high",
      "problem": "",
      "example": "",
      "suggestion": ""
    }
  ]
}`;
}

function buildSingabilityCheckUserPrompt(title: string, lyrics: string): string {
    return `【歌名】
${title}

【歌词】
${lyrics}

请对以上歌词做结构与可唱性诊断。只输出 JSON，不要额外解释。`;
}

// ── 阶段 3: 歌词优化 ──

function buildLyricOptimizationSystemPrompt(): string {
    return `你是专业华语流行歌词改稿人。

现在用户已经有一版歌词，但这版歌词存在可唱性、结构、句子长度或副歌记忆点问题。

你的任务是优化歌词，使它更适合被作曲和演唱。

必须保留：
1. 用户原始主题
2. 主要人物关系
3. 核心情绪
4. 关键画面
5. 副歌核心 hook，如果原 hook 可用
6. 原有段落的大致方向

可以修改：
1. 句子长度
2. 行数
3. 句式
4. 副歌重复结构
5. Pre-Chorus 递进
6. Bridge 对比
7. Outro 收束方式

优化规则：
1. 每行尽量 6-11 个汉字。
2. 同一段内行长尽量接近。
3. 主歌保留画面，但减少信息堆叠。
4. 副歌必须更短、更亮、更容易跟唱。
5. 副歌至少保留一个重复 hook 或重复句式。
6. Pre-Chorus 要明显推向副歌。
7. Bridge 要形成情绪对比。
8. Final Chorus 要比第一次 Chorus 更强。
9. Outro 要回到 hook 或核心情绪，不要新增复杂剧情。
10. 避免改得太散文、太空泛、太模板。

【词汇戒律 — 与生成阶段相同】
禁止：共犯 危险 狂热 沉溺 沦陷 占有 囚禁 深渊 救赎 破碎 宿命 沉沦 疯 光 星河 永远 命运 宇宙 全世界 偏爱 拉扯 遗憾 影子 天使 恶魔 禁区 秘密 伪装 面具 逃离 迷失 承诺 誓言 倔强 温柔乡。
句式黑名单："你是我的___" "像___一样" "在___里___" "让我___" "不再___" "我愿意___"。

输出 JSON（不要 Markdown 代码框）：
{
  "title": "",
  "optimization_notes": {
    "kept": ["保留的元素"],
    "changed": ["修改的地方"],
    "reason": "为什么这样改"
  },
  "lyrics": "优化后的完整歌词"
}`;
}

function buildLyricOptimizationUserPrompt(
    title: string,
    lyrics: string,
    singabilityReport: SingabilityCheckResult | null,
    userInstruction: string,
    songRequest?: MemoryRecordSongRequest,
    lyricistReference?: string,
): string {
    const reportBlock = singabilityReport
        ? `\n【可唱性自检报告】\n评分：${singabilityReport.score}/100\n总结：${singabilityReport.summary}\n问题列表：\n${singabilityReport.issues.map(i => `- [${i.severity}] ${i.type}: ${i.problem} → ${i.suggestion}`).join('\n')}`
        : '';

    const instructionBlock = userInstruction.trim()
        ? `\n【用户修改意见】\n${userInstruction.trim()}\n请优先满足用户的这部分意见，但不能牺牲段落结构、Hook 和可演唱性。`
        : '\n【用户修改意见】\n无。请按照专业歌词质量标准自动完成优化。';

    const songRequestBlock = formatSongRequestForPrompt(songRequest);
    const lyricistBlock = lyricistReference?.trim()
        ? `\n【词作风格参考】\n用户希望歌词贴近以下词作人的审美气质：${lyricistReference.trim()}\n请吸收其表达方式的核心特质，自然融入当前歌词的语境和记忆中。`
        : '';

    return `【当前歌名】
${title}

【当前歌词】
${lyrics}${reportBlock}${songRequestBlock}${lyricistBlock}${instructionBlock}

请优化歌词。只输出 JSON，不要额外解释。`;
}

// ── 阶段 4: 曲风提示词生成 ──

function buildStylePromptGenerationSystemPrompt(): string {
    return `你是专业华语流行音乐制作人、作曲导演和 AI 音乐提示词设计师。

现在用户已经确认了最终歌词。
你的任务不是修改歌词，而是根据定稿歌词和用户的曲风要求，生成适合送入 AI 音乐生成器的 style_prompt。

你必须先分析歌词本身：
1. 这首歌是什么类型？
2. 核心情绪是什么？
3. 主歌、副歌、Bridge、Final Chorus 分别应该如何起伏？
4. 副歌 hook 在哪里？
5. 人声应该怎么唱？
6. 编曲应该如何从前到后推进？
7. 结尾应该如何收束，避免突然结束？
8. 哪些 AI 味问题必须避免？

生成 style_prompt 时必须包含：
- genre / mood
- vocal direction
- arrangement direction
- verse dynamic
- pre-chorus build
- chorus melodic lift
- bridge contrast
- final chorus enhancement
- outro resolution
- avoid list

要求：
- style_prompt 使用英文。
- 不要只堆乐器。
- 不要写 high quality、best song、amazing music 这类空话。
- 不要让每首歌都变成同一个模板。
- 根据歌词的情绪和段落结构随机应变。
- 必须强调可唱性、动态起伏、副歌记忆点和自然人声。
- 避免 AI 模板歌、像念歌、全程平铺、结尾突兀。
- 禁止使用已被用烂的音乐描述词：cinematic, emotional, atmospheric, dreamy, ethereal, epic, beautiful, powerful, mesmerizing。
- 用具体的音色、演奏方式、空间感来替代：不说"emotional piano"说"felt piano with soft pedal"；不说"dreamy synth"说"warm Juno pad with slow LFO"。

输出 JSON（不要 Markdown 代码框）：
{
  "music_director_notes": {
    "song_type": "",
    "emotional_core": "",
    "vocal_character": "",
    "dynamic_curve": "",
    "arrangement_strategy": "",
    "chorus_strategy": "",
    "bridge_strategy": "",
    "final_chorus_strategy": "",
    "outro_strategy": "",
    "avoid": []
  },
  "style_prompt": "",
  "negative_style_prompt": ""
}`;
}

function buildStylePromptGenerationUserPrompt(
    lyrics: string,
    title: string,
    lyricIntent: LyricIntent | undefined,
    songRequest: MemoryRecordSongRequest | undefined,
): string {
    const songRequestBlock = songRequest
        ? [
            songRequest.style?.trim() ? `曲风偏好：${songRequest.style.trim()}` : '',
            songRequest.mood?.trim() ? `情绪氛围：${songRequest.mood.trim()}` : '',
            songRequest.voicePreference?.trim() ? `声线偏好：${songRequest.voicePreference.trim()}` : '',
            songRequest.extraRequirements?.trim() ? `额外要求：${songRequest.extraRequirements.trim()}` : '',
        ].filter(Boolean).join('\n')
        : '';

    const intentBlock = lyricIntent
        ? `\n【歌词创作意图】\n类型：${lyricIntent.song_type || '未指定'}\n核心情绪：${lyricIntent.core_emotion || '未指定'}\n叙事角度：${lyricIntent.narrative_angle || '未指定'}\nHook：${lyricIntent.hook || '未指定'}\n结构规划：${lyricIntent.structure_plan || '未指定'}\n可唱性策略：${lyricIntent.singability_strategy || '未指定'}`
        : '';

    return `【歌名】
${title}

【定稿歌词】
${lyrics}${intentBlock}
${songRequestBlock ? '\n【用户曲风要求】\n' + songRequestBlock : ''}

请根据定稿歌词和用户要求生成曲风提示词。只输出 JSON，不要额外解释。`;
}

// ── 四阶段 API 调用函数 ──

export async function generateLyrics(options: CreateMemoryRecordDraftOptions): Promise<LyricGenerationResult> {
    const raw = await callMemoryRecordLlm(
        options.apiConfig,
        [
            { role: 'system', content: buildLyricGenerationSystemPrompt() },
            { role: 'user', content: buildLyricGenerationUserPrompt(options) },
        ],
        { temperature: 1.8, maxTokens: MEMORY_RECORD_LLM_MAX_TOKENS, timeoutMs: 150000 },
    );
    const parsed = extractJsonTyped(raw, validateLyricGenerationResult);
    if (!parsed) {
        console.error('[MemoryRecord] Failed to parse lyric generation JSON. Data:', raw);
        throw new Error('歌词生成 JSON 解析失败，请重试');
    }
    return parsed;
}

export async function checkLyricSingability(
    title: string,
    lyrics: string,
    apiConfig: APIConfig,
): Promise<SingabilityCheckResult> {
    const raw = await callMemoryRecordLlm(
        apiConfig,
        [
            { role: 'system', content: buildSingabilityCheckSystemPrompt() },
            { role: 'user', content: buildSingabilityCheckUserPrompt(title, lyrics) },
        ],
        { temperature: 0.5, maxTokens: 8000, timeoutMs: 90000 },
    );
    const parsed = extractJsonTyped(raw, validateSingabilityCheckResult);
    if (!parsed) {
        console.error('[MemoryRecord] Failed to parse singability check JSON. Data:', raw);
        throw new Error('可唱性检查 JSON 解析失败，请重试');
    }
    return parsed;
}

export async function optimizeLyrics(
    title: string,
    lyrics: string,
    apiConfig: APIConfig,
    options?: {
        singabilityReport?: SingabilityCheckResult | null;
        userInstruction?: string;
        songRequest?: MemoryRecordSongRequest;
        lyricistReference?: string;
    },
): Promise<LyricOptimizationResult> {
    const raw = await callMemoryRecordLlm(
        apiConfig,
        [
            { role: 'system', content: buildLyricOptimizationSystemPrompt() },
            {
                role: 'user',
                content: buildLyricOptimizationUserPrompt(
                    title,
                    lyrics,
                    options?.singabilityReport ?? null,
                    options?.userInstruction ?? '',
                    options?.songRequest,
                    options?.lyricistReference,
                ),
            },
        ],
        { temperature: 0.78, maxTokens: MEMORY_RECORD_LLM_MAX_TOKENS, timeoutMs: 150000 },
    );
    const parsed = extractJsonTyped(raw, validateLyricOptimizationResult);
    if (!parsed) {
        console.error('[MemoryRecord] Failed to parse lyric optimization JSON. Data:', raw);
        throw new Error('歌词优化 JSON 解析失败，请重试');
    }
    return parsed;
}

export async function generateStylePrompt(
    lyrics: string,
    title: string,
    apiConfig: APIConfig,
    options?: {
        lyricIntent?: LyricIntent;
        songRequest?: MemoryRecordSongRequest;
    },
): Promise<StylePromptResult> {
    const raw = await callMemoryRecordLlm(
        apiConfig,
        [
            { role: 'system', content: buildStylePromptGenerationSystemPrompt() },
            {
                role: 'user',
                content: buildStylePromptGenerationUserPrompt(
                    lyrics,
                    title,
                    options?.lyricIntent,
                    options?.songRequest,
                ),
            },
        ],
        { temperature: 0.82, maxTokens: MEMORY_RECORD_LLM_MAX_TOKENS, timeoutMs: 120000 },
    );
    const parsed = extractJsonTyped(raw, validateStylePromptResult);
    if (!parsed) {
        console.error('[MemoryRecord] Failed to parse style prompt JSON. Data:', raw);
        throw new Error('曲风提示词 JSON 解析失败，请重试');
    }
    return parsed;
}

// ═══════════════════════════════════════════════
// 旧版（兼容保留，新增流程建议使用上面四个独立函数）
// ═══════════════════════════════════════════════

export async function createMemoryRecordDraft(options: CreateMemoryRecordDraftOptions): Promise<MemoryRecord> {
    // Separate L1 (distilled cognitions) and L0 (raw scene memories)
    const budget = getPromptBudgetConfig(options.contextBudget);
    const allAvailable = options.memories.filter(m => !m.deprecated);
    const l1All = allAvailable
        .filter(m => m.level === 1)
        .sort((a, b) => scoreMemoryForRecord(b) - scoreMemoryForRecord(a))
        .slice(0, budget.l1Limit);
    const l0All = allAvailable.filter(m => m.level !== 1);
    const l0Seeds = selectMemoryRecordSeeds(l0All, options.mode, options.selectedMemoryIds, budget.l0SelectedLimit);
    const allSeeds = [...l1All, ...l0Seeds];

    let payload: DraftPayload;
    let error: string | undefined;

    if (options.apiConfig.apiKey && options.apiConfig.baseUrl && options.apiConfig.model) {
        try {
            const prompt = buildPrompt(options, l1All, l0Seeds);
            const rawDraft = await callMemoryRecordLlm(
                options.apiConfig,
                [
                    { role: 'system', content: prompt.system },
                    { role: 'user', content: prompt.user },
                ],
                { temperature: 1.5, maxTokens: MEMORY_RECORD_LLM_MAX_TOKENS, timeoutMs: 150000 },
            );
            const parsed = extractJsonTyped(rawDraft, (value) => validateDraftPayload(value, options));
            payload = parsed || buildFallbackDraft(options, allSeeds);
            if (!parsed) {
                error = '歌词 JSON 解析失败，已生成本地兜底草稿';
                console.error('[MemoryRecord] Failed to parse API output as draft JSON. Data:', rawDraft);
            }

            try {
                const polished = await polishDraftPayload(options, payload);
                payload = lyricPayloadToDraft(payload, polished);
            } catch (polishError) {
                const message = polishError instanceof Error ? polishError.message : String(polishError);
                error = appendDraftWarning(error, message);
            }
            if (!isLikelyCompleteLyrics(payload.lyrics)) {
                error = appendDraftWarning(error, INCOMPLETE_LYRICS_WARNING);
                payload = buildFallbackDraft(options, allSeeds);
            } else if (!isReleaseReadyLyrics(payload.lyrics)) {
                error = appendDraftWarning(error, RHYME_FALLBACK_WARNING);
                payload = buildFallbackDraft(options, allSeeds);
            }
        } catch (err) {
            console.error('[MemoryRecord] Draft API error or timeout:', err);
            error = getDraftErrorMessage(err);
            payload = buildFallbackDraft(options, allSeeds);
        }
    } else {
        error = '未配置 LLM，已生成本地兜底草稿';
        payload = buildFallbackDraft(options, allSeeds);
    }

    const now = Date.now();
    const recordId = createRecordId();
    return {
        id: recordId,
        charId: options.char.id,
        charName: options.char.name,
        userName: options.userProfile.name || '你',
        mode: options.mode,
        status: 'draft',
        title: payload.title,
        albumName: payload.albumName,
        artistName: payload.artistName,
        monologueText: payload.monologueText,
        lyrics: payload.lyrics,
        musicPrompt: payload.musicPrompt,
        songRequest: options.songRequest,
        inspirationReference: options.inspirationReference?.trim() || undefined,
        coverImageUrl: selectMemoryRecordCover(recordId),
        coverGradient: payload.coverGradient,
        seedMemoryIds: allSeeds.map((seed) => seed.id),
        selectedMemoryIds: options.mode === 'selected_memory' ? options.selectedMemoryIds?.slice() : undefined,
        error,
        createdAt: now,
        updatedAt: now,
    };
}

async function saveAudio(record: MemoryRecord, kind: MemoryRecordAudio['kind'], blob: Blob, durationMs?: number): Promise<string> {
    const id = `${record.id}:${kind}`;
    await DB.saveMemoryRecordAudio({
        id,
        recordId: record.id,
        kind,
        blob,
        mimeType: blob.type || 'audio/mpeg',
        durationMs,
        createdAt: Date.now(),
    });
    return id;
}

async function loadAudioEntry(id?: string): Promise<MemoryRecordAudio | null> {
    if (!id) return null;
    return DB.getMemoryRecordAudioEntry(id);
}

function createStoredMusicResult(entry: MemoryRecordAudio, record: MemoryRecord): MinimaxMusicGenerateResult {
    return {
        blob: entry.blob,
        model: record.model || 'music-2.6-free',
        fallbackUsed: Boolean(record.fallbackUsed),
        durationMs: entry.durationMs ?? record.durationMs,
    };
}

const MASTERING_BYTE_CONCAT_FALLBACK_MARKER = '最终压制使用兜底拼接';
const MASTERING_MUSIC_TRACK_FALLBACK_MARKER = '已改用音乐分轨播放';

function isMasteringFallbackWarning(error?: string): boolean {
    return Boolean(error && (
        error.includes(MASTERING_BYTE_CONCAT_FALLBACK_MARKER)
        || error.includes(MASTERING_MUSIC_TRACK_FALLBACK_MARKER)
    ));
}

function createMusicTrackFallbackWarning(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `最终压制失败，已改用音乐分轨播放（未包含独白）：${message}`;
}

async function persistRecord(record: MemoryRecord, patch: Partial<MemoryRecord>, onRecordUpdate?: (record: MemoryRecord) => void): Promise<MemoryRecord> {
    const next: MemoryRecord = {
        ...record,
        ...patch,
        updatedAt: Date.now(),
    };
    await DB.saveMemoryRecord(next);
    onRecordUpdate?.(next);
    return next;
}

export async function produceMemoryRecordAudio({
    record,
    char,
    ttsConfig,
    musicBaseUrl,
    forceRemaster = false,
    onRecordUpdate,
    signal,
}: ProduceMemoryRecordAudioOptions): Promise<MemoryRecord> {
    let current = record;
    let productionStarted = false;

    try {
        const needsMonologue = shouldGenerateMemoryRecordMonologue(current.mode);
        const shouldReuseMaster = !forceRemaster && !isMasteringFallbackWarning(current.error);
        const existingMasterEntry = shouldReuseMaster ? await loadAudioEntry(current.masterAudioId) : null;
        if (needsMonologue && existingMasterEntry) {
            return persistRecord(current, {
                status: 'ready',
                durationMs: existingMasterEntry.durationMs ?? current.durationMs,
                error: undefined,
            }, onRecordUpdate);
        }

        const existingMonologueEntry = needsMonologue
            ? await loadAudioEntry(current.monologueAudioId)
            : null;
        const existingMusicEntry = await loadAudioEntry(current.musicAudioId);
        const needsNewMonologue = needsMonologue && !existingMonologueEntry;
        const needsNewMusic = !existingMusicEntry;

        if ((needsNewMonologue || needsNewMusic) && !ttsConfig.apiKey) {
            throw new Error('缺少 MiniMax API Key，已保存歌词草稿');
        }
        if (needsNewMonologue && !ttsConfig.groupId) {
            throw new Error('缺少 MiniMax Group ID，已保存歌词草稿');
        }

        productionStarted = true;
        let ttsResult: Awaited<ReturnType<typeof MinimaxTts.synthesizeSync>> | null = null;
        let monologueAudioId = current.monologueAudioId;

        if (existingMonologueEntry) {
            ttsResult = { blob: existingMonologueEntry.blob, url: '' };
            monologueAudioId = existingMonologueEntry.id;
        } else if (needsMonologue) {
            const monologueText = current.monologueText.trim() || getFallbackMonologue({
                char,
                userProfile: {
                    name: current.userName,
                    avatar: '',
                    bio: '',
                },
                mode: current.mode,
                memories: [],
                apiConfig: {
                    baseUrl: '',
                    apiKey: '',
                    model: '',
                },
            });
            const primaryVoiceId = resolveCharacterVoiceId(char, ttsConfig);
            try {
                ttsResult = await MinimaxTts.synthesizeSync(
                    monologueText,
                    withCharacterTtsVoice(ttsConfig, char),
                    undefined,
                    signal,
                );
            } catch (err) {
                if (isVoiceIdNotExistError(err)) {
                    throw new Error(getCharacterVoiceIdNotExistMessage(primaryVoiceId));
                }
                throw err;
            }
            monologueAudioId = await saveAudio(current, 'monologue', ttsResult.blob);
            current = await persistRecord(current, {
                status: 'monologue_ready',
                monologueText,
                monologueAudioId,
                error: undefined,
            }, onRecordUpdate);
        }

        let musicResult: MinimaxMusicGenerateResult;
        let musicAudioId = current.musicAudioId;
        if (existingMusicEntry) {
            musicResult = createStoredMusicResult(existingMusicEntry, current);
            musicAudioId = existingMusicEntry.id;
        } else {
            musicResult = await MinimaxMusic.generateWithFallback({
                apiKey: ttsConfig.apiKey,
                groupId: ttsConfig.groupId,
                baseUrl: musicBaseUrl?.trim() || undefined,
                prompt: current.musicPrompt,
                lyrics: current.lyrics,
                signal,
            });
            musicAudioId = await saveAudio(current, 'music', musicResult.blob, musicResult.durationMs);
        }

        if (!needsMonologue || !ttsResult) {
            return persistRecord(current, {
                status: 'ready',
                monologueText: '',
                monologueAudioId: undefined,
                musicAudioId,
                masterAudioId: undefined,
                model: musicResult.model,
                fallbackUsed: musicResult.fallbackUsed,
                durationMs: musicResult.durationMs,
                error: undefined,
            }, onRecordUpdate);
        }

        current = await persistRecord(current, {
            status: 'music_ready',
            musicAudioId,
            model: musicResult.model,
            fallbackUsed: musicResult.fallbackUsed,
            durationMs: musicResult.durationMs,
            error: undefined,
        }, onRecordUpdate);

        current = await persistRecord(current, { status: 'mastering' }, onRecordUpdate);
        let master: Awaited<ReturnType<typeof masterMemoryRecordAudio>>;
        try {
            master = await masterMemoryRecordAudio({ monologueBlob: ttsResult.blob, musicBlob: musicResult.blob });
        } catch (err) {
            if (current.masterAudioId) {
                await DB.deleteMemoryRecordAudio(current.masterAudioId);
            }
            current = await persistRecord(current, {
                status: 'ready',
            monologueAudioId,
            musicAudioId,
            masterAudioId: undefined,
            lyricsOffsetMs: undefined,
            durationMs: musicResult.durationMs,
            error: createMusicTrackFallbackWarning(err),
        }, onRecordUpdate);
            return current;
        }
        const masterAudioId = await saveAudio(current, 'master', master.blob, master.durationMs);
        current = await persistRecord(current, {
            status: 'ready',
            monologueAudioId,
            musicAudioId,
            masterAudioId,
            durationMs: master.durationMs,
            lyricsOffsetMs: master.musicOffsetMs,
            error: undefined,
        }, onRecordUpdate);

        return current;
    } catch (err) {
        const message = getAudioProductionErrorMessage(err);
        return persistRecord(current, {
            status: current.status === 'draft' && !productionStarted ? 'draft' : 'failed',
            error: mergeRecordErrors(current.error, message),
        }, onRecordUpdate);
    }
}
