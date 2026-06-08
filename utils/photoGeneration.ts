import JSZip from 'jszip';
import type {
    APIConfig,
    CharacterProfile,
    EncodedVibeReference,
    ExtractedImage,
    ImageGenerationConfig,
    ImageProviderType,
    Message,
    NaiImageModel,
    OpenAICompatibleImageProviderConfig,
    OpenAICompatibleStyleFamily,
    PhotoDirectorResult,
    PhotoGenerationOptions,
    PhotoHint,
    PhotoIntent,
    PhotoMeta,
    PhotoPromptBundle,
    PhotoStylePreset,
    PhotoStyleProviderScope,
    SavedVibeEncoding,
    UserProfile,
    VibeReferenceInput,
} from '../types';
import { extractJson } from './safeApi';
import {
    DEFAULT_NOVELAI_IMAGE_CONFIG,
    DEFAULT_PHOTO_STYLE_PRESETS,
    NAI_IMAGE_MODELS,
    getOpenAICompatibleStyleFamily,
    markSecondaryApiConfigFailure,
    markSecondaryApiConfigSuccess,
    normalizePhotoStyleProviderScope,
    normalizeNaiNoiseSchedule,
    normalizeNaiSampler,
    normalizeOpenAIImageSize,
    normalizeOptionalOpenAIImageBackground,
    normalizeOptionalOpenAIImageModeration,
    normalizeOptionalOpenAIImageOutputFormat,
    normalizeOptionalOpenAIImageQuality,
    normalizeOptionalOpenAIImageResponseFormat,
    normalizeOptionalOpenAIImageStyle,
    normalizeOptionalNaiNoiseSchedule,
    normalizeOptionalNaiSampler,
} from './runtimeConfig';
import { getLoveShowImagePresetId, isLoveShowImageStylePreset } from './loveshowPrompts';
import { trackedApiRequest } from './apiRequestLedger';
import { safeTimeoutSignal } from './safeTimeout';
import type { SecondaryFullContextOptions } from './mindSnapshotExtractor';
import {
    arrayBufferToBase64,
    dataUrlToBase64,
    isNaiVibeSupportedModel,
    normalizeNaiVibeModelKey,
} from './vibeReferences';

export interface GeneratedPhotoImage {
    blob?: Blob;
    dataUrl: string;
    remoteUrl?: string;
}

export interface OpenAICompatibleModelOption {
    id: string;
    name: string;
    displayName: string;
}

export const PHOTO_HINT_TAG_RE = /\[\[\s*PHOTO_HINT\s*:\s*([\s\S]*?)\s*\]\]+/gi;
const PHOTO_HINT_START_RE = /(?:\[\[?|\【)\s*PHOTO_HINT\s*[:：]/i;
export const PHOTO_DECISION_TAG_RE = /(?:\[\[?|\【)\s*PHOTO_DECISION\s*[:：]\s*([^\]\】\r\n]+?)\s*(?:\]\]?|】)/gi;
const PHOTO_DECISION_START_RE = /(?:\[\[?|\【)?\s*PHOTO_DECISION\s*[:：]/i;
const PHOTO_DIRECTOR_MAX_TOKENS = 65536;
export const PHOTO_DIRECTOR_TIMEOUT_MS = 90_000;
const PHOTO_INTENTS: PhotoIntent[] = [
    'selfie',
    'daily_photo',
    'date_scene',
    'item_photo',
    'background',
    'portrait',
    'half_body',
    'full_body',
];
const DIRECTOR_STYLE_TAGS = new Set([
    'masterpiece',
    'best quality',
    'amazing quality',
    'very aesthetic',
    'highres',
    'absurdres',
    'oil painting',
    'watercolor',
    'sketch',
    'thick painting',
    'realistic',
    'photorealistic',
    '3d',
    'cgi',
]);

export const NO_PHOTO_STYLE_PRESET_ID = 'no-style';
export const NO_PHOTO_STYLE_PRESET: PhotoStylePreset = {
    id: NO_PHOTO_STYLE_PRESET_ID,
    name: '不使用风格预设',
    providerScope: 'all',
    positivePrompt: '',
    negativePrompt: '',
};

export interface PhotoPromptBuildOptions {
    appearanceTags?: string;
    appearanceNegativeTags?: string;
    userAppearanceTags?: string;
    userAppearanceNegativeTags?: string;
    appearancePrompt?: string;
    userAppearancePrompt?: string;
    includeAppearance?: boolean;
    includeUserAppearance?: boolean;
    characterAppearanceLabel?: string;
    userAppearanceLabel?: string;
}

export function isNoPhotoStylePresetId(styleId: string | undefined | null): boolean {
    return String(styleId || '').trim() === NO_PHOTO_STYLE_PRESET_ID;
}

function getNaiAppearanceTags(config: ImageGenerationConfig, options?: PhotoPromptBuildOptions): string {
    if (config.activeProvider !== 'novelai') return '';
    if (options?.includeAppearance === false) return '';
    return normalizePromptList([options?.appearanceTags]);
}

function getNaiUserAppearanceTags(config: ImageGenerationConfig, options?: PhotoPromptBuildOptions): string {
    if (config.activeProvider !== 'novelai') return '';
    if (options?.includeAppearance === false || options?.includeUserAppearance === false) return '';
    return normalizePromptList([options?.userAppearanceTags]);
}

function getNaiAppearanceNegativeTags(config: ImageGenerationConfig, options?: PhotoPromptBuildOptions): string {
    if (config.activeProvider !== 'novelai') return '';
    if (options?.includeAppearance === false) return '';
    return normalizePromptList([
        options?.appearanceNegativeTags,
        options?.includeUserAppearance === false ? '' : options?.userAppearanceNegativeTags,
    ]);
}

function buildLockedAppearanceText(config: ImageGenerationConfig, options?: PhotoPromptBuildOptions): string {
    if (config.activeProvider !== 'openai-compatible') return '';
    if (options?.includeAppearance === false) return '';
    const characterAppearance = String(options?.appearancePrompt || '').trim();
    const userAppearance = options?.includeUserAppearance === false ? '' : String(options?.userAppearancePrompt || '').trim();
    const characterLabel = options?.characterAppearanceLabel || '固定角色外貌';
    const userLabel = options?.userAppearanceLabel || '固定用户外貌';
    return normalizeTextSections([
        characterAppearance ? `${characterLabel}：${characterAppearance}` : '',
        userAppearance ? `${userLabel}：${userAppearance}` : '',
    ]);
}

function normalizePromptList(parts: Array<string | undefined | null>): string {
    const seen = new Set<string>();
    return parts
        .flatMap(part => String(part || '').split(','))
        .map(part => part.trim())
        .filter(Boolean)
        .filter(part => {
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(', ');
}

function normalizeTextSections(parts: Array<string | undefined | null>): string {
    const seen = new Set<string>();
    return parts
        .map(part => String(part || '').trim())
        .filter(Boolean)
        .filter(part => {
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join('\n');
}

function joinPromptSections(parts: Array<string | undefined | null>): string {
    const seen = new Set<string>();
    return parts
        .map(part => String(part || '').trim())
        .filter(Boolean)
        .filter(part => {
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(', ');
}

function normalizePhotoIntent(value: unknown): PhotoIntent | undefined {
    const intent = String(value || '').trim();
    return PHOTO_INTENTS.includes(intent as PhotoIntent) ? intent as PhotoIntent : undefined;
}

function normalizeDirectorTagField(value: unknown, options: { limit?: number; filterStyleTags?: boolean } = {}): string {
    const text = Array.isArray(value) ? value.join(', ') : String(value || '');
    const seen = new Set<string>();
    const limit = options.limit || 12;
    const filterStyleTags = options.filterStyleTags !== false;
    const tags = text
        .split(/[,\n]/)
        .map(part => part.trim().replace(/^["'`]+|["'`]+$/g, ''))
        .map(part => part.replace(/[，。；;]+$/g, '').trim())
        .filter(Boolean)
        .filter(part => {
            const key = part.toLowerCase();
            if (seen.has(key)) return false;
            if (filterStyleTags && (DIRECTOR_STYLE_TAGS.has(key) || key.startsWith('artist:') || key.includes(' artist:'))) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limit);
    return tags.join(', ');
}

function hasStructuredNaiDirectorTags(director: PhotoDirectorResult): boolean {
    return Boolean(
        director.subject_tags
        || director.expression_tags
        || director.pose_tags
        || director.clothing_tags
        || director.scene_tags
        || director.camera_tags
        || director.mood_tags,
    );
}

function buildGenderGuardNegative(positivePrompt: string): string {
    const prompt = positivePrompt.toLowerCase();
    const hasMaleSubject = /\b(?:1boy|2boys|male|adult male|man|boy|handsome)\b/.test(prompt);
    const hasFemaleSubject = /\b(?:1girl|2girls|female|woman|girl)\b/.test(prompt);

    if (hasMaleSubject && !hasFemaleSubject) {
        return 'female, girl, woman, breasts, 1girl';
    }
    if (hasFemaleSubject && !hasMaleSubject) {
        return 'male, boy, man, 1boy, beard';
    }
    return '';
}

function truncateForDirector(text: string, maxLength: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}

function buildCharacterDirectorContext(char: CharacterProfile): string {
    const worldbook = Array.isArray(char.mountedWorldbooks)
        ? char.mountedWorldbooks
            .slice(0, 6)
            .map(item => `${item.title}：${truncateForDirector(item.content || '', 500)}`)
            .filter(Boolean)
            .join('\n')
        : '';
    return normalizeTextSections([
        `角色名：${char.name}`,
        char.description ? `角色简介：${truncateForDirector(char.description, 1200)}` : '',
        char.systemPrompt ? `角色设定：${truncateForDirector(char.systemPrompt, 2200)}` : '',
        char.worldview ? `世界观：${truncateForDirector(char.worldview, 1000)}` : '',
        worldbook ? `挂载世界书：\n${worldbook}` : '',
    ]);
}

function buildRecentChatDirectorContext(messages: Message[], char: CharacterProfile, userProfile: UserProfile): string {
    const lines = messages.slice(-14).map(message => {
        const speaker = message.role === 'assistant' ? char.name : message.role === 'user' ? userProfile.name : '系统';
        return `${speaker}: ${truncateForDirector(message.content || '', 220)}`;
    });
    return lines.join('\n') || '暂无。';
}

export function shouldIncludeUserAppearanceForPhoto(
    director?: PhotoDirectorResult | null,
    textHint?: string,
    hint?: PhotoHint,
): boolean {
    const haystack = normalizeTextSections([
        textHint,
        hint?.anchor_text,
        hint?.share_intent,
        hint?.must_keep?.join(' '),
        director?.intent,
        director?.scene_zh,
        director?.caption,
        director?.continuity_summary,
        director?.subject_tags,
        director?.pose_tags,
        director?.scene_tags,
    ]).toLowerCase();

    if (!haystack) return false;
    return /(?:合照|双人|两人|二人|一起|我们|我和|你和我|牵手|拥抱|约会|情侣|couple|two people|2people|2 people|2girls|2boys|1girl.*1boy|1boy.*1girl|with me|with you|date_scene)/i.test(haystack);
}

function randomId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHint(raw: any): PhotoHint | null {
    if (!raw || raw.type !== 'photo_hint') return null;
    const anchorText = typeof raw.anchor_text === 'string' ? raw.anchor_text.trim() : '';
    const shareIntent = typeof raw.share_intent === 'string' ? raw.share_intent.trim() : '';
    if (!anchorText || !shareIntent) return null;

    return {
        type: 'photo_hint',
        strength: Math.max(0, Math.min(1, Number(raw.strength) || 0)),
        anchor_text: anchorText.slice(0, 300),
        share_intent: shareIntent.slice(0, 300),
        must_keep: Array.isArray(raw.must_keep) ? raw.must_keep.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 8) : [],
        must_avoid: Array.isArray(raw.must_avoid) ? raw.must_avoid.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 8) : [],
    };
}

function isNaiImageModel(value: unknown): value is NaiImageModel {
    return NAI_IMAGE_MODELS.includes(String(value || '') as NaiImageModel);
}

function parsePhotoHintJson(jsonText: string): PhotoHint | null {
    const parsed = normalizeHint(extractJson(jsonText, { logFailure: false }));
    if (parsed) return parsed;

    const start = jsonText.indexOf('{');
    if (start < 0) return null;
    let repaired = jsonText.slice(start);
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;
    for (const ch of repaired) {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (ch === '{') openBraces += 1;
        else if (ch === '}') openBraces -= 1;
        else if (ch === '[') openBrackets += 1;
        else if (ch === ']') openBrackets -= 1;
    }
    if (inString) repaired += '"';
    for (let i = 0; i < openBrackets; i += 1) repaired += ']';
    for (let i = 0; i < openBraces; i += 1) repaired += '}';
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    try {
        return normalizeHint(JSON.parse(repaired));
    } catch {
        return null;
    }
}

function cleanPhotoHintContent(content: string): string {
    return content.replace(/\s*\r?\n\s*\r?\n\s*/g, '\n').trim();
}

function findBalancedObjectEnd(text: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
        const ch = text[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return i + 1;
        }
    }

    return -1;
}

function extractLoosePhotoHint(raw: string): { content: string; hint: PhotoHint | null } | null {
    const startMatch = raw.match(PHOTO_HINT_START_RE);
    if (!startMatch || startMatch.index === undefined) return null;

    const tagStart = startMatch.index;
    const jsonStart = raw.indexOf('{', tagStart + startMatch[0].length);
    if (jsonStart < 0) {
        return { content: raw.slice(0, tagStart).trim(), hint: null };
    }

    const balancedEnd = findBalancedObjectEnd(raw, jsonStart);
    if (balancedEnd > 0) {
        const jsonText = raw.slice(jsonStart, balancedEnd);
        const hint = parsePhotoHintJson(jsonText);
        const afterJson = raw.slice(balancedEnd);
        const closeMatch = afterJson.match(/^\s*(?:\]+|】)/);
        const tagEnd = closeMatch ? balancedEnd + closeMatch[0].length : balancedEnd;
        return {
            content: cleanPhotoHintContent(`${raw.slice(0, tagStart)}${raw.slice(tagEnd)}`),
            hint,
        };
    }

    const afterJson = raw.slice(jsonStart);
    const closeIndex = afterJson.search(/\]\]+|】/);
    const candidateEnds: number[] = [];
    if (closeIndex >= 0) {
        candidateEnds.push(jsonStart + closeIndex);
        if (raw[jsonStart + closeIndex + 2] === ']') {
            candidateEnds.push(jsonStart + closeIndex + 1);
        }
    }
    candidateEnds.push(raw.length);

    for (const candidateEnd of candidateEnds) {
        const hint = parsePhotoHintJson(raw.slice(jsonStart, candidateEnd));
        if (hint) {
            const afterCandidate = raw.slice(candidateEnd);
            const closeMatch = afterCandidate.match(/^\s*(?:\]+|】)/);
            const tagEnd = closeMatch ? candidateEnd + closeMatch[0].length : candidateEnd;
            return {
                content: cleanPhotoHintContent(`${raw.slice(0, tagStart)}${raw.slice(tagEnd)}`),
                hint,
            };
        }
    }

    const fallbackEnd = closeIndex >= 0
        ? jsonStart + closeIndex + (afterJson.slice(closeIndex).match(/^\]+/)?.[0].length || 1)
        : raw.length;
    return {
        content: cleanPhotoHintContent(`${raw.slice(0, tagStart)}${raw.slice(fallbackEnd)}`),
        hint: null,
    };
}

export function extractPhotoHint(raw: string): { content: string; hint: PhotoHint | null } {
    let hint: PhotoHint | null = null;
    const content = cleanPhotoHintContent(raw.replace(PHOTO_HINT_TAG_RE, (_match, jsonText: string) => {
        if (!hint) {
            hint = parsePhotoHintJson(jsonText);
        }
        return '';
    }));

    if (hint || !PHOTO_HINT_START_RE.test(content)) return { content, hint };
    const loose = extractLoosePhotoHint(content);
    return loose || { content, hint };
}

function parsePhotoDecisionValue(value: unknown): boolean | null {
    const raw = String(value || '').trim();
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'boolean') return parsed;
        if (parsed && typeof parsed === 'object') {
            const decision = (parsed as any).shouldGeneratePhoto ?? (parsed as any).generate ?? (parsed as any).value;
            if (typeof decision === 'boolean') return decision;
            return parsePhotoDecisionValue(decision);
        }
    } catch {
        // Fall through to loose token parsing.
    }

    const normalized = raw
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim()
        .toLowerCase();
    if (/^(true|1|yes|y|on|生成|发图|要发|是|对|可以|send|generate)(?:$|[\s,，。;；\]}])/.test(normalized)) return true;
    if (/^(false|0|no|n|off|不生成|不发|否|不用|不要|skip)(?:$|[\s,，。;；\]}])/.test(normalized)) return false;
    return null;
}

export function extractPhotoDecision(raw: string): { content: string; shouldGeneratePhoto: boolean | null } {
    let shouldGeneratePhoto: boolean | null = null;
    const content = cleanPhotoHintContent(raw.replace(PHOTO_DECISION_TAG_RE, (_match, value: string) => {
        if (shouldGeneratePhoto === null) {
            shouldGeneratePhoto = parsePhotoDecisionValue(value);
        }
        return '';
    }));

    if (shouldGeneratePhoto !== null || !PHOTO_DECISION_START_RE.test(content)) {
        return { content, shouldGeneratePhoto };
    }

    const startMatch = content.match(PHOTO_DECISION_START_RE);
    if (!startMatch || startMatch.index === undefined) return { content, shouldGeneratePhoto };

    const tagStart = startMatch.index;
    const valueStart = tagStart + startMatch[0].length;
    const afterStart = content.slice(valueStart);
    const endMatch = afterStart.match(/(?:\]\]+|\]|】|\r?\n)/);
    const valueEnd = endMatch?.index !== undefined ? valueStart + endMatch.index : content.length;
    const value = content.slice(valueStart, valueEnd);
    shouldGeneratePhoto = parsePhotoDecisionValue(value);
    const closeMatch = content.slice(valueEnd).match(/^\s*(?:\]\]+|\]|】)/);
    const tagEnd = closeMatch ? valueEnd + closeMatch[0].length : valueEnd;

    return {
        content: cleanPhotoHintContent(`${content.slice(0, tagStart)}${content.slice(tagEnd)}`),
        shouldGeneratePhoto,
    };
}

const EXPLICIT_PHOTO_DIRECT_RE = /(?:生图|出图|发图|发一张|发张|拍一张|拍张|画一张|画张|画个|来一张|来张|p图|P图|生成(?:一张|个)?(?:照片|图片|图|画面)?|(?:给我)?(?:发|拍|来|画)(?:一)?张(?:照片|图片|图|自拍)?)/i;
const PHOTO_SUBJECT_RE = /(?:照片|图片|图像|画面|自拍|随手拍|相片|图\b|图$)/i;
const PHOTO_ACTION_RE = /(?:发|再发|重发|补发|重新发|传|给我|看看|看一下|来一张|拍|画|生成|生|出|做|整|弄)/i;
const PHOTO_DESIRE_RE = /(?:想看|想要|要看|需要|很需要|真的很需要|求你|拜托|快点|现在就|给我看看|让我看看|给我这个|要这个)/i;
const PHOTO_RETRY_RE = /(?:再发|重发|补发|重新发|发一遍|再来|没看到|看不到|没收到|收不到|打不开|不显示|没图|坏了)/i;
const PHOTO_DONE_CLAIM_RE = /(?:发了|发过去|发给你|看到了吗|看到了没|收到了吗|现在能看到|再发一次|已经发|我发过|给你看)/i;

function normalizeLooseText(value: unknown): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function inferExplicitPhotoHintFromConversation(
    latestUserText: string,
    aiText: string,
    recentUserContext = latestUserText,
): PhotoHint | null {
    const latest = normalizeLooseText(latestUserText);
    if (!latest) return null;

    const aiReply = normalizeLooseText(aiText);
    const recentContext = normalizeLooseText(recentUserContext || latest);
    const recentPhotoRequest = EXPLICIT_PHOTO_DIRECT_RE.test(recentContext)
        || (PHOTO_SUBJECT_RE.test(recentContext) && (PHOTO_ACTION_RE.test(recentContext) || PHOTO_DESIRE_RE.test(recentContext)));
    const directRequest = EXPLICIT_PHOTO_DIRECT_RE.test(latest)
        || (PHOTO_SUBJECT_RE.test(latest) && (PHOTO_ACTION_RE.test(latest) || PHOTO_DESIRE_RE.test(latest) || PHOTO_RETRY_RE.test(latest)))
        || (PHOTO_DESIRE_RE.test(latest) && recentPhotoRequest);
    const retryInPhotoThread = PHOTO_RETRY_RE.test(latest) && PHOTO_SUBJECT_RE.test(recentContext);
    const modelClaimedDelivery = PHOTO_DONE_CLAIM_RE.test(aiReply) && PHOTO_SUBJECT_RE.test(recentContext);

    if (!directRequest && !retryInPhotoThread && !modelClaimedDelivery) return null;

    const anchor = latest.slice(0, 120);
    return {
        type: 'photo_hint',
        strength: modelClaimedDelivery ? 0.95 : 0.9,
        anchor_text: anchor,
        share_intent: '用户明确要求发送或生成一张图片',
        must_keep: [anchor],
        must_avoid: [],
    };
}

export function inferExplicitPhotoDecisionFromConversation(
    latestUserText: string,
    aiText: string,
    recentUserContext = latestUserText,
): boolean {
    return Boolean(inferExplicitPhotoHintFromConversation(latestUserText, aiText, recentUserContext));
}

export function buildPhotoHintFromDecision(
    latestUserText: string,
    aiText: string,
    shareIntent = '主模型判断本轮应该发送一张图片',
): PhotoHint {
    const aiReply = normalizeLooseText(aiText);
    const latest = normalizeLooseText(latestUserText);
    const anchor = (aiReply || latest || '本轮聊天中适合发送照片的时刻').slice(0, 120);
    return {
        type: 'photo_hint',
        strength: 0.95,
        anchor_text: anchor,
        share_intent: shareIntent,
        must_keep: [],
        must_avoid: [],
    };
}

export function isImageGenerationConfigured(config: ImageGenerationConfig): boolean {
    if (config.activeProvider === 'openai-compatible') {
        return Boolean(
            config.openaiCompatible.baseUrl.trim()
            && config.openaiCompatible.apiKey.trim()
            && config.openaiCompatible.model.trim(),
        );
    }
    return Boolean(config.novelai.apiToken.trim());
}

export function getImageProviderLabel(provider: ImageProviderType): string {
    return provider === 'openai-compatible' ? 'OpenAI 兼容' : 'NovelAI';
}

export function getOpenAIStyleFamilyForConfig(config: ImageGenerationConfig): OpenAICompatibleStyleFamily {
    return getOpenAICompatibleStyleFamily(config.openaiCompatible);
}

function getPhotoStyleProviderScopeForRuntime(
    providerType: ImageProviderType,
    openAIStyleFamily: OpenAICompatibleStyleFamily = 'gpt',
): PhotoStyleProviderScope {
    if (providerType === 'novelai') return 'novelai';
    return openAIStyleFamily === 'gemini' ? 'openai-gemini' : 'openai-gpt';
}

export function isPhotoStyleCompatible(
    style: PhotoStylePreset,
    providerType: ImageProviderType,
    openAIStyleFamily: OpenAICompatibleStyleFamily = 'gpt',
): boolean {
    if (style.id === NO_PHOTO_STYLE_PRESET_ID) return true;
    const styleScope = normalizePhotoStyleProviderScope(style.providerScope, 'novelai', style as Partial<PhotoStylePreset> & Record<string, unknown>);
    return styleScope === getPhotoStyleProviderScopeForRuntime(providerType, openAIStyleFamily);
}

export function getCompatiblePhotoStylePresets(
    presets: PhotoStylePreset[],
    providerType: ImageProviderType,
    openAIStyleFamily: OpenAICompatibleStyleFamily = 'gpt',
): PhotoStylePreset[] {
    const available = presets.length > 0 ? presets : DEFAULT_PHOTO_STYLE_PRESETS;
    const compatible = available.filter(style => isPhotoStyleCompatible(style, providerType, openAIStyleFamily));
    if (compatible.length > 0) return compatible;
    const shared = available.filter(style => style.providerScope === 'all');
    if (shared.length > 0) return shared;
    return available.filter(style => (
        providerType === 'openai-compatible'
            ? style.providerScope === 'openai-gpt' || style.providerScope === 'openai-gemini'
            : style.providerScope === 'novelai'
    ));
}

export function resolvePhotoStylePreset(
    requestedId: string | undefined,
    presets: PhotoStylePreset[],
    char?: CharacterProfile,
    providerType: ImageProviderType = 'novelai',
    options: { allowUnboundRequested?: boolean; openAIStyleFamily?: OpenAICompatibleStyleFamily } = {},
): PhotoStylePreset {
    if (isNoPhotoStylePresetId(requestedId)) return NO_PHOTO_STYLE_PRESET;
    if (!requestedId && isNoPhotoStylePresetId(char?.defaultPhotoStylePresetId)) return NO_PHOTO_STYLE_PRESET;
    const compatible = getCompatiblePhotoStylePresets(presets, providerType, options.openAIStyleFamily);
    const available = compatible.length > 0
        ? compatible
        : DEFAULT_PHOTO_STYLE_PRESETS.filter(style => isPhotoStyleCompatible(style, providerType, options.openAIStyleFamily));
    if (available.length === 0) return NO_PHOTO_STYLE_PRESET;
    const fallbackPool = available;
    const requestedStyleId = String(requestedId || '').trim();
    if (requestedStyleId && options.allowUnboundRequested) {
        const requestedStyle = fallbackPool.find(preset => preset.id === requestedStyleId);
        if (requestedStyle) return requestedStyle;
    }
    const boundIds = Array.isArray(char?.boundPhotoStylePresetIds) && char.boundPhotoStylePresetIds.length > 0
        ? new Set(char.boundPhotoStylePresetIds)
        : null;
    const charPresets = boundIds ? fallbackPool.filter(preset => boundIds.has(preset.id)) : fallbackPool;
    const candidates = charPresets.length > 0 ? charPresets : fallbackPool;
    return candidates.find(preset => preset.id === requestedStyleId)
        || candidates.find(preset => preset.id === char?.defaultPhotoStylePresetId)
        || (isNoPhotoStylePresetId(char?.defaultPhotoStylePresetId) ? NO_PHOTO_STYLE_PRESET : undefined)
        || candidates.find(preset => preset.id !== NO_PHOTO_STYLE_PRESET_ID)
        || candidates[0]
        || DEFAULT_PHOTO_STYLE_PRESETS[0];
}

export function resolveImageStylePhotoPreset(
    requestedId: string | undefined,
    presets: PhotoStylePreset[],
    char: CharacterProfile | undefined,
    config: ImageGenerationConfig,
    includeUserAppearance: boolean,
    options: { allowUnboundRequested?: boolean; openAIStyleFamily?: OpenAICompatibleStyleFamily } = {},
): PhotoStylePreset {
    const openAIStyleFamily = options.openAIStyleFamily || getOpenAIStyleFamilyForConfig(config);
    if (config.activeProvider !== 'openai-compatible' || requestedId) {
        return resolvePhotoStylePreset(requestedId, presets, char, config.activeProvider, {
            ...options,
            openAIStyleFamily,
        });
    }
    const mode = includeUserAppearance ? 'couple' : 'solo';
    const imageStylePresetId = getLoveShowImagePresetId(mode, config.imageStyle, openAIStyleFamily);
    return resolvePhotoStylePreset(imageStylePresetId, presets, char, config.activeProvider, {
        ...options,
        openAIStyleFamily,
        allowUnboundRequested: true,
    });
}

function buildOpenAICompatibleFinalPrompt(positivePrompt: string, negativePrompt: string): string {
    return normalizeTextSections([
        positivePrompt,
        negativePrompt ? `避免出现：\n${negativePrompt}` : '',
    ]);
}

function buildOpenAILockedAppearanceOptions(style: PhotoStylePreset, options: PhotoPromptBuildOptions): PhotoPromptBuildOptions {
    if (!isLoveShowImageStylePreset(style)) return options;
    return {
        ...options,
        characterAppearanceLabel: options.characterAppearanceLabel || '男生外貌',
        userAppearanceLabel: options.userAppearanceLabel || '女生外貌',
    };
}

export function buildPhotoPromptFromDirector(
    director: PhotoDirectorResult,
    hint: PhotoHint | undefined,
    style: PhotoStylePreset,
    config: ImageGenerationConfig,
    options: PhotoPromptBuildOptions = {},
): PhotoPromptBundle {
    if (config.activeProvider === 'openai-compatible') {
        const loveShowStyle = isLoveShowImageStylePreset(style);
        const lockedAppearanceText = buildLockedAppearanceText(config, buildOpenAILockedAppearanceOptions(style, options));
        const positivePrompt = normalizeTextSections(loveShowStyle
            ? [
                style.positivePrompt,
                lockedAppearanceText,
                director.scene_zh,
                director.camera,
                director.mood,
                hint?.anchor_text,
                hint?.must_keep?.join('，'),
                config.openaiCompatible.qualityTags,
            ]
            : [
                lockedAppearanceText,
                director.scene_zh,
                director.camera,
                director.mood,
                hint?.anchor_text,
                hint?.must_keep?.join('，'),
                style.positivePrompt,
                config.openaiCompatible.qualityTags,
            ]);
        const negativePrompt = normalizeTextSections([
            hint?.must_avoid?.join('；'),
            style.negativePrompt,
            config.openaiCompatible.negativePrompt,
        ]);
        return {
            positivePrompt,
            negativePrompt,
            finalPrompt: buildOpenAICompatibleFinalPrompt(positivePrompt, negativePrompt),
        };
    }

    const appearanceTags = getNaiAppearanceTags(config, options);
    const userAppearanceTags = getNaiUserAppearanceTags(config, options);
    const lockedAppearanceTags = normalizePromptList([appearanceTags, userAppearanceTags]);
    const appearanceNegativeTags = getNaiAppearanceNegativeTags(config, options);

    if (hasStructuredNaiDirectorTags(director)) {
        const contentPrompt = normalizePromptList([
            appearanceTags ? '' : normalizeDirectorTagField(director.subject_tags, { limit: 18 }),
            normalizeDirectorTagField(director.expression_tags, { limit: 8 }),
            normalizeDirectorTagField(director.pose_tags, { limit: 10 }),
            normalizeDirectorTagField(director.clothing_tags, { limit: 10 }),
            normalizeDirectorTagField(director.scene_tags, { limit: 12 }),
            normalizeDirectorTagField(director.camera_tags, { limit: 8 }),
            normalizeDirectorTagField(director.mood_tags, { limit: 8 }),
        ]);
        const positivePrompt = joinPromptSections([
            contentPrompt,
            lockedAppearanceTags,
            style.positivePrompt,
            config.novelai.qualityTags,
        ]);
        const negativePrompt = joinPromptSections([
            appearanceNegativeTags,
            style.negativePrompt,
            config.novelai.negativePrompt,
            normalizePromptList([
                buildGenderGuardNegative(normalizePromptList([contentPrompt, lockedAppearanceTags])),
                normalizeDirectorTagField(director.dynamic_negative, { limit: 24, filterStyleTags: false }),
            ]),
        ]);

        return { positivePrompt, negativePrompt, finalPrompt: positivePrompt };
    }

    const positivePrompt = normalizePromptList([
        director.scene_zh,
        director.camera,
        director.mood,
        hint?.anchor_text,
        hint?.must_keep?.join(', '),
        lockedAppearanceTags,
        style.positivePrompt,
        config.novelai.qualityTags,
    ]);

    const negativePrompt = normalizePromptList([
        appearanceNegativeTags,
        style.negativePrompt,
        config.novelai.negativePrompt,
        hint?.must_avoid?.join(', '),
    ]);

    return { positivePrompt, negativePrompt, finalPrompt: positivePrompt };
}

export function buildManualPhotoPrompt(
    prompt: string,
    style: PhotoStylePreset,
    config: ImageGenerationConfig,
    options: PhotoPromptBuildOptions = {},
): PhotoPromptBundle {
    if (config.activeProvider === 'openai-compatible') {
        const loveShowStyle = isLoveShowImageStylePreset(style);
        const lockedAppearanceText = buildLockedAppearanceText(config, buildOpenAILockedAppearanceOptions(style, options));
        const positivePrompt = normalizeTextSections(loveShowStyle
            ? [
                style.positivePrompt,
                lockedAppearanceText,
                prompt,
                config.openaiCompatible.qualityTags,
            ]
            : [
                prompt,
                lockedAppearanceText,
                style.positivePrompt,
                config.openaiCompatible.qualityTags,
            ]);
        const negativePrompt = normalizeTextSections([
            style.negativePrompt,
            config.openaiCompatible.negativePrompt,
        ]);
        return {
            positivePrompt,
            negativePrompt,
            finalPrompt: buildOpenAICompatibleFinalPrompt(positivePrompt, negativePrompt),
        };
    }

    const appearanceTags = getNaiAppearanceTags(config, options);
    const userAppearanceTags = getNaiUserAppearanceTags(config, options);
    const appearanceNegativeTags = getNaiAppearanceNegativeTags(config, options);
    const positivePrompt = normalizePromptList([prompt, appearanceTags, userAppearanceTags, style.positivePrompt, config.novelai.qualityTags]);
    const negativePrompt = normalizePromptList([appearanceNegativeTags, style.negativePrompt, config.novelai.negativePrompt]);
    return { positivePrompt, negativePrompt, finalPrompt: positivePrompt };
}

function parseImageSize(size: string, fallbackWidth = 1024, fallbackHeight = 1024): { width: number; height: number; size: string } {
    const normalized = String(size || '')
        .trim()
        .replace(/[×]/g, 'x')
        .replace(/\s+/g, '');
    const match = normalized.match(/^(\d{2,5})x(\d{2,5})$/i);
    if (!match) {
        return {
            width: fallbackWidth,
            height: fallbackHeight,
            size: normalized || `${fallbackWidth}x${fallbackHeight}`,
        };
    }
    const width = Number(match[1]);
    const height = Number(match[2]);
    return {
        width: Number.isFinite(width) ? width : fallbackWidth,
        height: Number.isFinite(height) ? height : fallbackHeight,
        size: `${Number.isFinite(width) ? width : fallbackWidth}x${Number.isFinite(height) ? height : fallbackHeight}`,
    };
}

export function createPhotoMeta(
    source: PhotoMeta['source'],
    config: ImageGenerationConfig,
    style: PhotoStylePreset,
    prompts: PhotoPromptBundle,
    seed: number,
    directorResult?: PhotoDirectorResult,
    photoHint?: PhotoHint,
): PhotoMeta {
    if (config.activeProvider === 'openai-compatible') {
        const openai = config.openaiCompatible;
        const parsedSize = parseImageSize(style.size || openai.size);
        return {
            source,
            providerType: 'openai-compatible',
            photoHint,
            directorResult,
            stylePresetId: style.id,
            model: normalizeOpenAICompatibleModelId(style.model || openai.model),
            positivePrompt: prompts.positivePrompt,
            negativePrompt: prompts.negativePrompt,
            finalPrompt: prompts.finalPrompt,
            width: parsedSize.width,
            height: parsedSize.height,
            size: parsedSize.size,
            responseFormat: style.responseFormat === undefined ? openai.responseFormat : style.responseFormat,
            n: style.n === undefined ? openai.n : style.n,
            quality: style.quality === undefined ? openai.quality : style.quality,
            openAIStyle: style.openAIStyle === undefined ? openai.style : style.openAIStyle,
            background: style.background === undefined ? openai.background : style.background,
            outputFormat: style.outputFormat === undefined ? openai.outputFormat : style.outputFormat,
            outputCompression: style.outputCompression === undefined ? openai.outputCompression : style.outputCompression,
            moderation: style.moderation === undefined ? openai.moderation : style.moderation,
            user: style.user === undefined ? openai.user : style.user,
            stream: style.stream === undefined ? openai.stream : style.stream,
            partialImages: style.partialImages === undefined ? openai.partialImages : style.partialImages,
            extraRequestBody: style.extraRequestBody,
            seed,
            continuity_summary: directorResult?.continuity_summary,
        };
    }

    const model = isNaiImageModel(style.model) ? style.model : config.novelai.model;
    return {
        source,
        providerType: 'novelai',
        photoHint,
        directorResult,
        stylePresetId: style.id,
        model,
        naiModel: model,
        positivePrompt: prompts.positivePrompt,
        negativePrompt: prompts.negativePrompt,
        finalPrompt: prompts.finalPrompt,
        width: style.width || config.novelai.width,
        height: style.height || config.novelai.height,
        steps: style.steps || config.novelai.steps,
        scale: style.scale || config.novelai.scale,
        sampler: normalizeNaiSampler(style.sampler || config.novelai.sampler, config.novelai.sampler),
        noiseSchedule: normalizeNaiNoiseSchedule(style.noiseSchedule || config.novelai.noiseSchedule, config.novelai.noiseSchedule),
        seed,
        continuity_summary: directorResult?.continuity_summary,
    };
}

export function buildPhotoContextSummary(meta: PhotoMeta, caption?: string): string {
    const director = meta.directorResult;
    const visibleTags = normalizePromptList([
        director?.subject_tags,
        director?.expression_tags,
        director?.pose_tags,
        director?.clothing_tags,
        director?.scene_tags,
        director?.camera_tags,
        director?.mood_tags,
    ]);
    const summary = normalizeTextSections([
        caption ? `配文：${truncateForDirector(caption, 120)}` : '',
        director?.continuity_summary || meta.continuity_summary
            ? `连续性：${truncateForDirector(director?.continuity_summary || meta.continuity_summary || '', 220)}`
            : '',
        director?.scene_zh ? `画面：${truncateForDirector(director.scene_zh, 220)}` : '',
        director?.camera ? `镜头：${truncateForDirector(director.camera, 120)}` : '',
        director?.mood ? `氛围：${truncateForDirector(director.mood, 120)}` : '',
        visibleTags ? `视觉标签：${truncateForDirector(visibleTags, 260)}` : '',
        !director && meta.positivePrompt ? `生成意图：${truncateForDirector(meta.positivePrompt, 260)}` : '',
    ]);

    return summary || '一张已生成的图片，原图保存在本地图片消息中。';
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
    if (typeof blob.arrayBuffer === 'function') {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
        reader.readAsDataURL(blob);
    });
}

function normalizeBase64Payload(base64: string): string {
    const rawBase64 = base64.includes(',') ? base64.split(',').pop() || '' : base64;
    const normalized = rawBase64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return normalized + padding;
}

function responseContentType(response: Response): string {
    return response.headers.get('Content-Type') || response.headers.get('content-type') || '';
}

function responsePreview(text: string, limit = 500): string {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function looksLikeHtmlResponse(text: string, contentType = ''): boolean {
    const trimmed = String(text || '').trimStart();
    return /text\/html/i.test(contentType)
        || /^<!doctype\b/i.test(trimmed)
        || /^<html\b/i.test(trimmed);
}

function buildHtmlResponseError(label: string, response: Response, text: string, contentType = responseContentType(response)): Error {
    return new Error(
        `${label}接口返回 HTML 页面，疑似请求 URL 错误、路由 fallback、服务商错误页或前端页面地址被当成 API。`
        + `（HTTP ${response.status}，Content-Type: ${contentType || 'unknown'}，响应开头：${responsePreview(text, 180) || '空'}）`,
    );
}

async function readResponseText(response: Response): Promise<{ text: string; contentType: string }> {
    const contentType = responseContentType(response);
    const text = await response.text().catch(() => '');
    return { text, contentType };
}

function parseJsonResponsePayload(label: string, response: Response, text: string, contentType = responseContentType(response)): any {
    const trimmed = String(text || '').trim();
    if (looksLikeHtmlResponse(trimmed, contentType)) {
        throw buildHtmlResponseError(label, response, text, contentType);
    }
    if (!trimmed) {
        throw new Error(`${label}返回空响应（HTTP ${response.status}）`);
    }
    if (!/application\/json/i.test(contentType) && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        throw new Error(`${label}返回的不是 JSON（HTTP ${response.status}，Content-Type: ${contentType || 'unknown'}）：${responsePreview(text, 200)}`);
    }
    try {
        return JSON.parse(trimmed);
    } catch (error: any) {
        throw new Error(`${label}返回无效 JSON（HTTP ${response.status}）：${responsePreview(text, 200) || error?.message || '解析失败'}`);
    }
}

async function readJsonResponsePayload(label: string, response: Response): Promise<{ payload: any; text: string; contentType: string }> {
    const { text, contentType } = await readResponseText(response);
    return {
        payload: parseJsonResponsePayload(label, response, text, contentType),
        text,
        contentType,
    };
}

function logPhotoResponse(label: string, response: Response, text: string, contentType = responseContentType(response)): void {
    console.info(`[${label}] response`, {
        status: response.status,
        ok: response.ok,
        contentType: contentType || 'unknown',
        responseTextPreview: responsePreview(text, 500),
    });
}

function normalizeOpenAICompatibleModelId(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const displayDelimiterParts = raw.split(/\s+\/\s+/).map(part => part.trim()).filter(Boolean);
    if (displayDelimiterParts.length > 1) {
        return displayDelimiterParts[displayDelimiterParts.length - 1];
    }
    const slashIndex = raw.lastIndexOf('/');
    if (slashIndex > 0 && slashIndex < raw.length - 1) {
        const prefix = raw.slice(0, slashIndex);
        const suffix = raw.slice(slashIndex + 1).trim();
        const prefixLooksLikeDisplay = /[\u4e00-\u9fff【】￥¥$]|\[[^\]]+\]|\([^)]+\)|价格|元|米/.test(prefix);
        if (prefixLooksLikeDisplay && suffix) return suffix;
    }
    return raw;
}

function normalizeOpenAICompatibleModelOption(item: any): OpenAICompatibleModelOption | null {
    const rawId = item && typeof item === 'object'
        ? (item.id ?? item.model ?? item.value ?? '')
        : item;
    const rawName = item && typeof item === 'object'
        ? (item.name ?? item.display_name ?? item.displayName ?? item.label ?? '')
        : '';
    const explicitId = String(rawId || '').trim();
    const displayOnlyId = String(rawName || '').trim();
    const id = explicitId || normalizeOpenAICompatibleModelId(displayOnlyId);
    if (!id) return null;
    const name = String(rawName || explicitId || id).trim();
    return {
        id,
        name,
        displayName: name && name !== id ? `${name} / ${id}` : id,
    };
}

function dedupeOpenAICompatibleModelOptions(options: OpenAICompatibleModelOption[]): OpenAICompatibleModelOption[] {
    const seen = new Set<string>();
    const deduped: OpenAICompatibleModelOption[] = [];
    for (const option of options) {
        if (!option.id || seen.has(option.id)) continue;
        seen.add(option.id);
        deduped.push(option);
    }
    return deduped;
}

function extractOpenAICompatibleModelItems(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.models)) return payload.models;
    if (Array.isArray(payload?.result?.data)) return payload.result.data;
    if (Array.isArray(payload?.result?.models)) return payload.result.models;
    return [];
}

function base64ToBlob(base64: string, mimeType = 'image/png'): Blob {
    const cleanBase64 = normalizeBase64Payload(base64);
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
}

function normalizeVibeNumber(value: unknown, fallback: number): number {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(1, Math.max(0, number));
}

function pickEncodedReferenceFromPayload(payload: any): string {
    if (typeof payload === 'string') return payload.trim();
    if (!payload || typeof payload !== 'object') return '';
    const candidates = [
        payload.encodedReference,
        payload.encoded_reference,
        payload.encoding,
        payload.reference_image,
        payload.referenceImage,
        payload.data?.encodedReference,
        payload.data?.encoding,
        payload.data?.reference_image,
    ];
    return candidates.find(candidate => typeof candidate === 'string' && candidate.trim())?.trim() || '';
}

async function readEncodedVibeResponse(response: Response): Promise<string> {
    const contentType = responseContentType(response);
    if (contentType.includes('application/json') || contentType.includes('text/')) {
        const { text } = await readResponseText(response);
        if (looksLikeHtmlResponse(text, contentType)) {
            throw buildHtmlResponseError('NAI Vibe 编码', response, text, contentType);
        }
        if (contentType.includes('application/json') || text.trim().startsWith('{')) {
            const payload = parseJsonResponsePayload('NAI Vibe 编码', response, text, contentType);
            const encoded = pickEncodedReferenceFromPayload(payload);
            if (encoded) return encoded;
            throw new Error('encode-vibe 没有返回可识别的编码');
        }
        const trimmed = text.trim();
        if (trimmed.length > 0) return trimmed;
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength <= 0) throw new Error('encode-vibe 返回空内容');
    return arrayBufferToBase64(buffer);
}

export async function encodeVibe(
    config: ImageGenerationConfig,
    imageDataUrl: string,
    model: string,
    informationExtracted: number,
): Promise<string> {
    if (!config.novelai.apiToken.trim()) throw new Error('请先配置 NovelAI Persistent API Token');
    if (!imageDataUrl) throw new Error('参考图缺少图片数据');
    const normalizedModel = normalizeNaiVibeModelKey(model);
    if (!isNaiVibeSupportedModel(normalizedModel)) {
        throw new Error(`当前 NAI 模型不支持 Vibe 参考图：${model}`);
    }
    const apiUrl = (config.novelai.apiUrl || DEFAULT_NOVELAI_IMAGE_CONFIG.apiUrl).replace(/\/+$/, '');
    return trackedApiRequest({
        feature: 'image',
        reason: 'Vibe 参考图编码',
        model: normalizedModel,
        userInitiated: true,
        url: `${apiUrl}/ai/encode-vibe`,
    }, async () => {
        const response = await fetch(`${apiUrl}/ai/encode-vibe`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.novelai.apiToken.trim()}`,
                'Content-Type': 'application/json',
                'X-Correlation-Id': randomId('vibe').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).padEnd(6, '0'),
            },
            body: JSON.stringify({
                image: dataUrlToBase64(imageDataUrl),
                model: normalizedModel,
                information_extracted: normalizeVibeNumber(informationExtracted, 0.6),
            }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`NAI Vibe 编码失败 (${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`);
        }
        return readEncodedVibeResponse(response);
    });
}

async function resolveEncodedVibeReferences(
    config: ImageGenerationConfig,
    meta: PhotoMeta,
    options?: PhotoGenerationOptions,
): Promise<EncodedVibeReference[]> {
    const references = (options?.vibeReferences || []).filter(Boolean);
    if (references.length === 0) return [];
    if (references.length > 3) throw new Error('Vibe 参考图最多只能选择 3 张');

    const model = normalizeNaiVibeModelKey(meta.naiModel || meta.model);
    if (!isNaiVibeSupportedModel(model)) {
        throw new Error(`当前 NAI 模型不支持 Vibe 参考图：${meta.naiModel || meta.model}`);
    }

    return Promise.all(references.map(async (reference: VibeReferenceInput, index) => {
        const strength = normalizeVibeNumber(reference.strength, 0.6);
        const informationExtracted = normalizeVibeNumber(reference.informationExtracted, 0.6);
        try {
            let encodedReference = reference.encodedReference?.trim() || '';
            if (!encodedReference) {
                if (!reference.imageDataUrl) throw new Error('缺少原图，无法重新编码');
                encodedReference = await encodeVibe(config, reference.imageDataUrl, model, informationExtracted);
                const encoding: SavedVibeEncoding = {
                    model,
                    informationExtracted,
                    encodedReference,
                    updatedAt: Date.now(),
                };
                await options?.onVibeReferenceEncoded?.(reference, encoding);
            }
            return { encodedReference, strength, informationExtracted };
        } catch (error: any) {
            const name = reference.name ? `「${reference.name}」` : `第 ${index + 1} 张参考图`;
            throw new Error(`${name}编码失败：${error?.message || String(error || '未知错误')}`);
        }
    }));
}

function buildNaiRequestBody(
    meta: PhotoMeta,
    config: ImageGenerationConfig,
    vibeReferences: EncodedVibeReference[] = [],
): Record<string, unknown> {
    const parameters: Record<string, unknown> = {
        params_version: 1,
        width: meta.width,
        height: meta.height,
        scale: meta.scale ?? config.novelai.scale,
        sampler: normalizeNaiSampler(meta.sampler || config.novelai.sampler, config.novelai.sampler),
        steps: meta.steps ?? config.novelai.steps,
        seed: meta.seed,
        n_samples: 1,
        ucPreset: 3,
        qualityToggle: false,
        sm: false,
        sm_dyn: false,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        legacy_v3_extend: false,
        add_original_image: false,
        cfg_rescale: 0,
        noise_schedule: normalizeNaiNoiseSchedule(meta.noiseSchedule || config.novelai.noiseSchedule, config.novelai.noiseSchedule),
        prompt: meta.positivePrompt,
        negative_prompt: meta.negativePrompt,
        extra_noise_seed: meta.seed,
        v4_prompt: {
            use_coords: false,
            use_order: false,
            caption: { base_caption: meta.positivePrompt, char_captions: [] },
        },
        v4_negative_prompt: {
            use_coords: false,
            use_order: false,
            caption: { base_caption: meta.negativePrompt, char_captions: [] },
        },
    };

    if (vibeReferences.length > 0) {
        parameters.reference_image_multiple = vibeReferences.map(reference => reference.encodedReference);
        parameters.reference_strength_multiple = vibeReferences.map(reference => reference.strength);
        parameters.reference_information_extracted_multiple = vibeReferences.map(reference => reference.informationExtracted);
        parameters.normalize_reference_strength_multiple = true;
    }

    return {
        input: meta.positivePrompt,
        model: meta.naiModel || meta.model,
        action: 'generate',
        parameters,
    };
}

async function generateNovelAIImage(
    config: ImageGenerationConfig,
    meta: PhotoMeta,
    options?: PhotoGenerationOptions,
): Promise<GeneratedPhotoImage> {
    if (!config.novelai.apiToken.trim()) throw new Error('请先配置 NovelAI Persistent API Token');
    const apiUrl = (config.novelai.apiUrl || DEFAULT_NOVELAI_IMAGE_CONFIG.apiUrl).replace(/\/+$/, '');
    const vibeReferences = await resolveEncodedVibeReferences(config, meta, options);
    return trackedApiRequest({
        feature: 'image',
        reason: meta.source === 'manual' ? '手动生图' : '角色主动发照片',
        model: meta.model,
        userInitiated: meta.source === 'manual',
        url: `${apiUrl}/ai/generate-image`,
    }, async () => {
        const response = await fetch(`${apiUrl}/ai/generate-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.novelai.apiToken.trim()}`,
                'Content-Type': 'application/json',
                'X-Correlation-Id': randomId('nai').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).padEnd(6, '0'),
            },
            body: JSON.stringify(buildNaiRequestBody(meta, config, vibeReferences)),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`NAI 生图失败 (${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`);
        }

        const zipBuffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(zipBuffer);
        const firstFile = Object.values(zip.files).find(file => !file.dir);
        if (!firstFile) throw new Error('NAI 返回包中没有图片');

        const imageBuffer = await firstFile.async('arraybuffer');
        const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
        const dataUrl = await blobToDataUrl(imageBlob);
        return { blob: imageBlob, dataUrl };
    });
}

type ImagePayloadCandidate = {
    path: string;
    value: string;
};

function maybeParseJsonText(value: string): any | null {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
}

function parseEventStreamPayloads(value: string): any[] {
    const payloads: any[] = [];
    for (const line of value.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        payloads.push(maybeParseJsonText(data) || data);
    }
    return payloads;
}

function parseOpenAICompatibleResponsePayload(responseText: string): any {
    const json = maybeParseJsonText(responseText);
    if (json) return json;

    const eventStreamPayloads = parseEventStreamPayloads(responseText);
    if (eventStreamPayloads.length > 0) {
        return {
            eventStream: eventStreamPayloads.reverse(),
            raw: responseText,
        };
    }

    return responseText;
}

function stripUrlTail(value: string): string {
    return value.replace(/[)\].,，。]+$/g, '');
}

function normalizeExtractedImageUrl(value: string): string {
    return stripUrlTail(value.trim().split(/[\s"'<>]+/)[0] || '');
}

function inferDataUrlMimeType(dataUrl: string): string {
    return dataUrl.match(/^data:([^;,]+)/i)?.[1] || 'image/png';
}

function extractedBase64(base64: string, mimeType = 'image/png'): ExtractedImage {
    return { kind: 'base64', base64: normalizeBase64Payload(base64), mimeType };
}

function extractImageFromText(value: string): ExtractedImage | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^data:image\//i.test(trimmed)) {
        return { kind: 'dataUrl', dataUrl: trimmed, mimeType: inferDataUrlMimeType(trimmed) };
    }
    if (/^https?:\/\//i.test(trimmed)) return { kind: 'url', url: normalizeExtractedImageUrl(trimmed) };

    const dataUrlMatch = trimmed.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/i);
    if (dataUrlMatch?.[0]) {
        return { kind: 'dataUrl', dataUrl: dataUrlMatch[0], mimeType: inferDataUrlMimeType(dataUrlMatch[0]) };
    }

    const srcMatch = trimmed.match(/\bsrc=["'](data:image\/[^"'\s<>]+|https?:\/\/[^"'\s<>]+)["']/i);
    if (srcMatch?.[1]) {
        return /^data:image\//i.test(srcMatch[1])
            ? { kind: 'dataUrl', dataUrl: srcMatch[1], mimeType: inferDataUrlMimeType(srcMatch[1]) }
            : { kind: 'url', url: normalizeExtractedImageUrl(srcMatch[1]) };
    }

    const markdownImageMatch = trimmed.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+|data:image\/[^)\s]+)\)/i);
    if (markdownImageMatch?.[1]) {
        return /^data:image\//i.test(markdownImageMatch[1])
            ? { kind: 'dataUrl', dataUrl: markdownImageMatch[1], mimeType: inferDataUrlMimeType(markdownImageMatch[1]) }
            : { kind: 'url', url: normalizeExtractedImageUrl(markdownImageMatch[1]) };
    }

    const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch?.[0]) return { kind: 'url', url: normalizeExtractedImageUrl(urlMatch[0]) };

    if (looksLikeBase64ImagePayload(trimmed)) return extractedBase64(trimmed);

    return null;
}

function isLikelyGeneratedImageUrl(value: string | undefined): boolean {
    if (!value) return false;
    return /\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(value)
        || /\/images?\//i.test(value);
}

function looksLikeBase64ImagePayload(value: string): boolean {
    const clean = normalizeBase64Payload(value);
    if (clean.length < 80) return false;
    if (!/^[A-Za-z0-9+/=]+$/.test(clean)) return false;
    return clean.length % 4 === 0;
}

function collectImagePayloadCandidates(value: any, path = 'payload', depth = 0, seen = new WeakSet<object>()): ImagePayloadCandidate[] {
    if (value === null || value === undefined || depth > 7) return [];

    if (typeof value === 'string') {
        const parsed = maybeParseJsonText(value);
        const nested = parsed ? collectImagePayloadCandidates(parsed, `${path}<json>`, depth + 1, seen) : [];
        return [{ path, value }, ...nested];
    }

    if (typeof value !== 'object') return [];
    if (seen.has(value)) return [];
    seen.add(value);

    if (Array.isArray(value)) {
        return value.flatMap((item, index) => collectImagePayloadCandidates(item, `${path}[${index}]`, depth + 1, seen));
    }

    return Object.entries(value).flatMap(([key, item]) => (
        collectImagePayloadCandidates(item, `${path}.${key}`, depth + 1, seen)
    ));
}

function summarizePayloadShape(value: any, depth = 0): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `string(${value.length})`;
    if (typeof value !== 'object') return typeof value;
    if (Array.isArray(value)) {
        if (depth >= 2) return `array(${value.length})`;
        const first = value.length > 0 ? ` first=${summarizePayloadShape(value[0], depth + 1)}` : '';
        return `array(${value.length})${first}`;
    }
    const keys = Object.keys(value).slice(0, 10);
    if (depth >= 2) return `object keys=[${keys.join(',')}]`;
    return `object {${keys.map(key => `${key}:${summarizePayloadShape(value[key], depth + 1)}`).join(', ')}}`;
}

export function extractGeneratedImage(payload: any): ExtractedImage | null {
    const rawCandidates = collectImagePayloadCandidates(payload);
    const candidates = [
        ...rawCandidates.filter(candidate => !/partial/i.test(candidate.path)),
        ...rawCandidates.filter(candidate => /partial/i.test(candidate.path)),
    ];
    const explicitBase64Path = /\.(?:b64_json|b64|base64|image_base64|base64_image|imageBase64)$/i;
    const likelyImagePath = /(?:image|img|url|result|artifact|output|data|content|file|media|b64_json|b64|base64)/i;

    for (const candidate of candidates) {
        const imageUrl = extractImageFromText(candidate.value);
        if (imageUrl && (likelyImagePath.test(candidate.path) || /^payload$/i.test(candidate.path))) {
            return imageUrl;
        }
    }

    for (const candidate of candidates) {
        const imageUrl = extractImageFromText(candidate.value);
        if (imageUrl?.kind === 'dataUrl' || imageUrl?.kind === 'base64' || (imageUrl?.kind === 'url' && isLikelyGeneratedImageUrl(imageUrl.url))) {
            return imageUrl;
        }
    }

    for (const candidate of candidates) {
        const value = candidate.value.trim();
        if (!value) continue;
        if (explicitBase64Path.test(candidate.path)) {
            const dataUrl = extractImageFromText(value);
            return dataUrl || extractedBase64(value);
        }
        if ((likelyImagePath.test(candidate.path) || /^payload$/i.test(candidate.path)) && looksLikeBase64ImagePayload(value)) {
            return extractedBase64(value);
        }
    }

    return null;
}

function readOpenAICompatibleErrorMessage(payload: any, fallbackText: string): string {
    const direct = typeof payload?.error?.message === 'string'
        ? payload.error.message
        : typeof payload?.message === 'string'
            ? payload.message
            : typeof payload?.error === 'string'
                ? payload.error
                : '';
    const message = direct.trim() || fallbackText.trim();
    return message.replace(/\s+/g, ' ').slice(0, 180);
}

function isOpenAICompatibleAuthError(status: number, detail: string): boolean {
    if (status === 401 || status === 403) return true;
    return /(?:api\s*key|apikey|authorization|bearer|unauthori[sz]ed|forbidden|token|鉴权|认证|密钥)/i.test(detail);
}

function buildOpenAICompatibleAuthError(label: string, status: number, detail: string): string {
    const original = detail ? ` 原始信息：${detail}` : '';
    return `${label}鉴权失败 (${status})：服务端提示 API Key 无效或未收到，请检查当前生图服务的 API Key。${original}`;
}

function buildOpenAICompatiblePayloadPreview(payload: any, responseText: string): string {
    const raw = typeof payload === 'string' ? payload : responseText;
    const preview = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 800);
    return preview ? `，预览：${preview}` : '';
}

function buildOpenAICompatibleImageRequestPreview(body: Record<string, unknown>): Record<string, unknown> {
    const preview: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
        if (/key|token|authorization|secret/i.test(key)) {
            preview[key] = '[REDACTED]';
            continue;
        }
        if (key === 'prompt' && typeof value === 'string') {
            preview.prompt = value.length > 1200 ? `${value.slice(0, 1200)}...` : value;
            preview.promptLength = value.length;
            continue;
        }
        preview[key] = value;
    }
    return preview;
}

type OpenAICompatibleImageDebugDetailsArgs = {
    requestUrl: string;
    authAttempt: string;
    requestBody: Record<string, unknown>;
    response: Response;
    responseText: string;
    contentType: string;
    payload?: any;
};

function buildOpenAICompatibleImageDebugDetails(args: OpenAICompatibleImageDebugDetailsArgs): string {
    const payloadShape = args.payload === undefined ? '' : `\n返回结构：${summarizePayloadShape(args.payload)}`;
    return [
        '',
        '--- OpenAI 兼容生图调试信息 ---',
        `请求 URL：${args.requestUrl}`,
        `鉴权方式：${args.authAttempt}`,
        `HTTP 状态：${args.response.status}`,
        `Content-Type：${args.contentType || 'unknown'}`,
        `请求体：${JSON.stringify(buildOpenAICompatibleImageRequestPreview(args.requestBody), null, 2)}`,
        `响应原文预览：${responsePreview(args.responseText, 1200) || '空'}`,
        payloadShape,
        '--- 调试信息结束 ---',
    ].filter(Boolean).join('\n');
}

async function extractedImageToGeneratedPhoto(image: ExtractedImage): Promise<GeneratedPhotoImage> {
    if (image.kind === 'url') {
        return { dataUrl: image.url, remoteUrl: image.url };
    }
    if (image.kind === 'dataUrl') {
        const blob = await fetch(image.dataUrl).then(res => res.blob());
        return { blob, dataUrl: image.dataUrl };
    }
    const blob = base64ToBlob(image.base64, image.mimeType);
    const dataUrl = `data:${image.mimeType || 'image/png'};base64,${normalizeBase64Payload(image.base64)}`;
    return { blob, dataUrl };
}

function parseOpenAICompatibleExtraRequestBody(raw: string | undefined): Record<string, unknown> {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return {};

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error: any) {
        throw new Error(`OpenAI 兼容额外请求参数不是合法 JSON：${error?.message || '解析失败'}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('OpenAI 兼容额外请求参数必须是 JSON 对象');
    }

    return parsed as Record<string, unknown>;
}

function setOptionalStringParam(target: Record<string, unknown>, key: string, value: unknown): void {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized) target[key] = normalized;
}

function setOptionalNumberParam(target: Record<string, unknown>, key: string, value: unknown): void {
    if (typeof value === 'number' && Number.isFinite(value)) {
        target[key] = value;
    }
}

function presetValue<T>(value: T | undefined, fallback: T): T {
    return value === undefined ? fallback : value;
}

function buildOpenAICompatibleImageRequestBody(
    provider: OpenAICompatibleImageProviderConfig,
    meta: PhotoMeta,
): Record<string, unknown> {
    const model = normalizeOpenAICompatibleModelId(meta.model || provider.model);
    const body: Record<string, unknown> = {
        model,
        prompt: meta.finalPrompt || meta.positivePrompt,
    };
    const size = String(meta.size || provider.size || '').trim();
    if (size) body.size = size;
    const responseFormat = presetValue(meta.responseFormat, provider.responseFormat);
    if (responseFormat && responseFormat !== 'auto') {
        body.response_format = responseFormat;
    }

    setOptionalNumberParam(body, 'n', presetValue(meta.n, provider.n));
    setOptionalStringParam(body, 'quality', presetValue(meta.quality, provider.quality));
    setOptionalStringParam(body, 'style', presetValue(meta.openAIStyle, provider.style));
    setOptionalStringParam(body, 'background', presetValue(meta.background, provider.background));
    setOptionalStringParam(body, 'output_format', presetValue(meta.outputFormat, provider.outputFormat));
    setOptionalNumberParam(body, 'output_compression', presetValue(meta.outputCompression, provider.outputCompression));
    setOptionalStringParam(body, 'moderation', presetValue(meta.moderation, provider.moderation));
    setOptionalStringParam(body, 'user', presetValue(meta.user, provider.user));
    if (presetValue(meta.stream, provider.stream)) {
        body.stream = true;
        setOptionalNumberParam(body, 'partial_images', presetValue(meta.partialImages, provider.partialImages));
    }

    return {
        ...body,
        ...parseOpenAICompatibleExtraRequestBody(provider.extraRequestBody),
        ...parseOpenAICompatibleExtraRequestBody(meta.extraRequestBody),
    };
}

async function generateOpenAICompatibleImage(
    config: ImageGenerationConfig,
    meta: PhotoMeta,
): Promise<GeneratedPhotoImage> {
    const provider = config.openaiCompatible;
    if (!provider.baseUrl.trim()) throw new Error('请先配置 OpenAI 兼容生图 Base URL');
    if (!provider.apiKey.trim()) throw new Error('请先配置 OpenAI 兼容生图 API Key');
    if (!provider.model.trim()) throw new Error('请先填写 OpenAI 兼容生图模型名');

    const baseUrl = provider.baseUrl.replace(/\/+$/, '');
    const requestUrl = `${baseUrl}/images/generations`;
    const requestBody = buildOpenAICompatibleImageRequestBody(provider, meta);
    console.info('[OpenAICompatibleImage] request', {
        source: meta.source,
        provider: 'openai-compatible',
        baseUrl,
        endpoint: '/images/generations',
        requestUrl,
        model: requestBody.model,
        responseFormat: requestBody.response_format || 'auto',
        size: requestBody.size,
    });
    return trackedApiRequest({
        feature: 'image',
        reason: meta.source === 'manual' ? '手动生图' : '角色主动发照片',
        model: String(requestBody.model || meta.model || ''),
        userInitiated: meta.source === 'manual',
        url: requestUrl,
    }, async () => {
        const authAttempt = 'Authorization Bearer';
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${provider.apiKey.trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const { text: responseText, contentType } = await readResponseText(response);
        logPhotoResponse('OpenAICompatibleImage', response, responseText, contentType);
        if (looksLikeHtmlResponse(responseText, contentType)) {
            console.warn('[OpenAICompatibleImage] image result parse failed', {
                reason: 'html_response',
                requestUrl,
                status: response.status,
                contentType: contentType || 'unknown',
            });
            const htmlError = buildHtmlResponseError('OpenAI 兼容生图', response, responseText, contentType);
            throw new Error(`${htmlError.message}${buildOpenAICompatibleImageDebugDetails({
                requestUrl,
                authAttempt,
                requestBody,
                response,
                responseText,
                contentType,
            })}`);
        }
        if (!responseText.trim()) {
            throw new Error(`OpenAI 兼容接口返回空响应，请检查 endpoint、model、key、CORS 或代理日志。${buildOpenAICompatibleImageDebugDetails({
                requestUrl,
                authAttempt,
                requestBody,
                response,
                responseText,
                contentType,
            })}`);
        }
        const payload = parseOpenAICompatibleResponsePayload(responseText);
        const image = extractGeneratedImage(payload);
        if (!response.ok && !image) {
            const detail = readOpenAICompatibleErrorMessage(payload, responseText);
            if (isOpenAICompatibleAuthError(response.status, detail)) {
                throw new Error(`${buildOpenAICompatibleAuthError('OpenAI 兼容生图', response.status, detail)}${buildOpenAICompatibleImageDebugDetails({
                    requestUrl,
                    authAttempt,
                    requestBody,
                    response,
                    responseText,
                    contentType,
                    payload,
                })}`);
            }
            const textOnlyHint = detail && !extractImageFromText(detail) && !looksLikeBase64ImagePayload(detail)
                ? `：接口返回了文字说明，未返回图片。${detail}`
                : detail
                    ? `: ${detail}`
                    : '';
            throw new Error(`OpenAI 兼容生图失败 (${response.status})${textOnlyHint}${buildOpenAICompatibleImageDebugDetails({
                requestUrl,
                authAttempt,
                requestBody,
                response,
                responseText,
                contentType,
                payload,
            })}`);
        }
        if (!response.ok) {
            console.warn('[OpenAICompatibleImage] non-OK response contained a usable image payload:', response.status);
        }
        if (image) {
            console.info('[OpenAICompatibleImage] image result parse success', {
                requestUrl,
                kind: image.kind,
                status: response.status,
                authAttempt,
            });
            return extractedImageToGeneratedPhoto(image);
        }
        console.warn('[OpenAICompatibleImage] image result parse failed', {
            requestUrl,
            status: response.status,
            payloadShape: summarizePayloadShape(payload),
            responseTextPreview: responsePreview(responseText, 500),
        });
        throw new Error(`OpenAI 兼容接口没有返回可识别的图片（返回结构：${summarizePayloadShape(payload)}${buildOpenAICompatiblePayloadPreview(payload, responseText)}）${buildOpenAICompatibleImageDebugDetails({
            requestUrl,
            authAttempt,
            requestBody,
            response,
            responseText,
            contentType,
            payload,
        })}`);
    });
}

export async function generatePhotoImage(
    config: ImageGenerationConfig,
    meta: PhotoMeta,
    options?: PhotoGenerationOptions,
): Promise<GeneratedPhotoImage> {
    if (meta.providerType === 'openai-compatible') {
        if ((options?.vibeReferences || []).length > 0) {
            throw new Error('Vibe 参考图目前只支持 NovelAI 生图');
        }
        return generateOpenAICompatibleImage(config, meta);
    }
    return generateNovelAIImage(config, meta, options);
}

function normalizeDirectorResult(raw: any): PhotoDirectorResult | null {
    if (!raw || typeof raw !== 'object') return null;
    const shouldGeneratePhoto = raw.shouldGeneratePhoto === true || raw.should_generate_photo === true;
    const tagSource = raw.naiTags && typeof raw.naiTags === 'object'
        ? raw.naiTags
        : raw.nai_tags && typeof raw.nai_tags === 'object'
            ? raw.nai_tags
            : raw;
    return {
        shouldGeneratePhoto,
        caption: String(raw.caption || '').trim(),
        scene_zh: String(raw.scene_zh || raw.sceneZh || '').trim(),
        camera: String(raw.camera || '').trim(),
        mood: String(raw.mood || '').trim(),
        stylePresetId: String(raw.stylePresetId || raw.style_preset_id || '').trim(),
        continuity_summary: String(raw.continuity_summary || raw.continuitySummary || '').trim(),
        intent: normalizePhotoIntent(tagSource.intent),
        subject_tags: normalizeDirectorTagField(tagSource.subject_tags ?? tagSource.subjectTags, { limit: 18 }),
        expression_tags: normalizeDirectorTagField(tagSource.expression_tags ?? tagSource.expressionTags, { limit: 8 }),
        pose_tags: normalizeDirectorTagField(tagSource.pose_tags ?? tagSource.poseTags, { limit: 10 }),
        clothing_tags: normalizeDirectorTagField(tagSource.clothing_tags ?? tagSource.clothingTags, { limit: 10 }),
        scene_tags: normalizeDirectorTagField(tagSource.scene_tags ?? tagSource.sceneTags, { limit: 12 }),
        camera_tags: normalizeDirectorTagField(tagSource.camera_tags ?? tagSource.cameraTags, { limit: 8 }),
        mood_tags: normalizeDirectorTagField(tagSource.mood_tags ?? tagSource.moodTags, { limit: 8 }),
        dynamic_negative: normalizeDirectorTagField(tagSource.dynamic_negative ?? tagSource.dynamicNegative, { limit: 24, filterStyleTags: false }),
    };
}

export async function runPhotoDirector(args: {
    apiConfig: APIConfig;
    char: CharacterProfile;
    userProfile: UserProfile;
    currentMsgs: Message[];
    aiReply: string;
    thinking?: string;
    hint: PhotoHint;
    stylePresets: PhotoStylePreset[];
    recentPhotoMetas: PhotoMeta[];
    providerType: ImageProviderType;
    openAIStyleFamily?: OpenAICompatibleStyleFamily;
    appearanceTags?: string;
    appearanceNegativeTags?: string;
    userAppearanceTags?: string;
    userAppearanceNegativeTags?: string;
    appearancePrompt?: string;
    userAppearancePrompt?: string;
    contextOptions?: SecondaryFullContextOptions;
}): Promise<PhotoDirectorResult | null> {
    const { apiConfig, char, userProfile, aiReply, thinking, hint, stylePresets, recentPhotoMetas, providerType, contextOptions } = args;
    const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
    const compatibleStyles = getCompatiblePhotoStylePresets(stylePresets, providerType, args.openAIStyleFamily);
    const styleLines = compatibleStyles.map(preset => `- ${preset.id}: ${preset.name}`).join('\n') || '- no-style: 不使用风格预设';
    const recentLines = recentPhotoMetas.slice(-8).map((meta, index) => {
        const director = meta.directorResult;
        return `${index + 1}. ${director?.caption || director?.continuity_summary || meta.continuity_summary || (meta.finalPrompt || meta.positivePrompt).slice(0, 120)}`;
    }).join('\n') || '暂无。';
    const charContext = buildCharacterDirectorContext(char);
    const recentChat = buildRecentChatDirectorContext(args.currentMsgs, char, userProfile);
    const externalAppearanceTags = normalizePromptList([args.appearanceTags]);
    const externalUserAppearanceTags = normalizePromptList([args.userAppearanceTags]);
    const externalAppearanceNegative = normalizePromptList([args.appearanceNegativeTags, args.userAppearanceNegativeTags]);
    const externalAppearanceText = normalizeTextSections([
        args.appearancePrompt ? `角色固定外貌：${args.appearancePrompt}` : '',
        args.userAppearancePrompt ? `用户固定外貌：${args.userAppearancePrompt}` : '',
    ]);

    const system = providerType === 'novelai'
        ? `你是 NovelAI 图像提示词生成副模型，同时负责判断角色是否应该在聊天里发一张照片。
你的任务不是写故事，而是把当前聊天上下文、人设、剧情意图，转换成适合 NovelAI 的英文 tag prompt 片段。
你只负责“画面内容”，不要负责画风。视觉风格由外部预设控制。
只输出 JSON，不要写解释。

规则：
- 不要输出 artist tag。
- 不要输出 quality tag，例如 masterpiece, best quality, very aesthetic, highres。
- 不要输出采样参数、模型参数、尺寸、steps、scale。
- 不要输出自然语言长句，每个字段只写英文 tag，用逗号分隔。
- 不要编造人设中不存在的外貌特征；优先保持角色一致性，其次表现当前剧情。
- 不确定的信息不要写；如果上下文信息不足，使用角色设定中的默认外貌、默认服装风格和当前剧情氛围。
- 不要写抽象心理，例如 love, sadness, longing，除非能转成可见表情或场景。
- 不要写冲突 tag，例如 smile 和 crying 同时出现，day 和 night 同时出现。
- Do not output style tags unless they are directly required by the image intent. The visual style is controlled by an external preset.
- 自拍时 pose_tags 或 camera_tags 必须包含 selfie, phone camera, looking at viewer, close-up 或 upper body。
- 约会场景时必须包含地点、光线、两人距离或互动动作。
- 如果是男性角色，subject_tags 应包含 1boy/solo/adult male 这类稳定身份 tag，并在 dynamic_negative 加入 female, girl, breasts。
- 如果是女性角色，subject_tags 应包含 1girl/solo 这类稳定身份 tag，并在 dynamic_negative 加入 male, boy。
- 如果外部提供了固定角色/用户外貌 NAI tags，不要在 subject_tags 里改写对应人物的发色、瞳色、体型、常设服装；只补本次剧情相关的表情、动作、场景、镜头。

输出格式：{
  "shouldGeneratePhoto": boolean,
  "caption": "角色发图时自然附带的一句话，可为空但不建议空",
  "stylePresetId": "从可用风格 ID 中选择一个，只选 ID，不写风格 tag",
  "continuity_summary": "给下一轮主模型看的照片连续性摘要",
  "intent": "selfie | daily_photo | date_scene | item_photo | background | portrait | half_body | full_body",
  "subject_tags": "英文 tag，用逗号分隔。人数/性别/角色稳定外貌优先，例如 1boy, solo, adult male",
  "expression_tags": "英文 tag，用逗号分隔",
  "pose_tags": "英文 tag，用逗号分隔",
  "clothing_tags": "英文 tag，用逗号分隔",
  "scene_tags": "英文 tag，用逗号分隔",
  "camera_tags": "英文 tag，用逗号分隔",
  "mood_tags": "英文 tag，用逗号分隔，只写可见氛围/光线",
  "dynamic_negative": "英文 tag，用逗号分隔"
}

注意：
- photo_hint 可能只是主模型的 PHOTO_DECISION:true 触发信号，不一定包含完整画面信息。
- 如果 anchor_text 信息很少，必须结合完整上下文、角色设定、本轮主模型回复和 thinking 来补足画面。
- 如果 photo_hint.strength >= 0.85，通常表示用户明确要求生图/发照片或角色强烈想发图。除非安全、重复或上下文明显不合适，应倾向 shouldGeneratePhoto=true。`
        : `你是 Photo Director，负责判断角色是否应该在聊天里发一张照片，并把聊天冲动转成摄影导演稿。
只输出 JSON，不要写解释。你可以进行艺术化想象，但画面必须围绕 photo_hint.anchor_text、share_intent 和 must_keep。
主模型不负责 NAI prompt，你也不要输出最终生图 prompt；只输出导演层字段。
如果外部提供了固定角色/用户外貌描述，scene_zh 不要写出与之冲突的外貌；画面包含对应人物时要保持这些特征。
输出格式：{
  "shouldGeneratePhoto": boolean,
  "caption": "角色发图时自然附带的一句话，可为空但不建议空",
  "scene_zh": "中文画面描述",
  "camera": "镜头/构图",
  "mood": "氛围",
  "stylePresetId": "从可用风格 ID 中选择一个",
  "continuity_summary": "给下一轮主模型看的照片连续性摘要"
}

注意：
- photo_hint 可能只是主模型的 PHOTO_DECISION:true 触发信号，不一定包含完整画面信息。
- 如果 anchor_text 信息很少，必须结合完整上下文、角色设定、本轮主模型回复和 thinking 来补足画面。
- 如果 photo_hint.strength >= 0.85，通常表示用户明确要求生图/发照片或角色强烈想发图。除非安全、重复或上下文明显不合适，应倾向 shouldGeneratePhoto=true。`;

    const user = [
        `角色：${char.name}`,
        `用户：${userProfile.name}`,
        `角色设定上下文：\n${charContext}`,
        `当前生图供应商：${getImageProviderLabel(providerType)}`,
        `可用风格：\n${styleLines}`,
        `最近照片记录：\n${recentLines}`,
        `最近聊天片段：\n${recentChat}`,
        `本轮主模型回复：\n${aiReply}`,
        thinking ? `本轮主模型 thinking：\n${thinking}` : '',
        `photo_hint：\n${JSON.stringify(hint, null, 2)}`,
        providerType === 'novelai' && externalAppearanceTags
            ? `外部角色外貌 NAI tags：\n${externalAppearanceTags}`
            : '',
        providerType === 'novelai' && externalUserAppearanceTags
            ? `外部用户外貌 NAI tags：\n${externalUserAppearanceTags}`
            : '',
        providerType === 'novelai' && externalAppearanceNegative
            ? `外部外貌 negative tags：\n${externalAppearanceNegative}`
            : '',
        providerType === 'openai-compatible' && externalAppearanceText
            ? `外部固定外貌描述：\n${externalAppearanceText}`
            : '',
        '如果强度太低、时机不自然或和最近照片重复，可以 shouldGeneratePhoto=false。',
    ].filter(Boolean).join('\n\n');

    const mirrorMessages = Array.isArray(contextOptions?.mirrorMessages)
        ? contextOptions?.mirrorMessages as Array<{ role: string; content: unknown }>
        : [];
    const messages = mirrorMessages.length > 0
        ? [
            ...mirrorMessages,
            { role: 'user', content: `### [Photo Director Instructions]\n${system}\n\n### [Photo Director Input]\n${user}` },
        ]
        : [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ];

    try {
        const data = await trackedApiRequest({
            feature: 'image',
            reason: 'Photo Director 判定',
            model: apiConfig.model,
            userInitiated: false,
            url: `${baseUrl}/chat/completions`,
        }, async () => {
            const signal = safeTimeoutSignal(PHOTO_DIRECTOR_TIMEOUT_MS);
            try {
                const response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiConfig.apiKey}`,
                    },
                    body: JSON.stringify({
                        model: apiConfig.model,
                        messages,
                        temperature: 0.45,
                        max_tokens: PHOTO_DIRECTOR_MAX_TOKENS,
                    }),
                    signal,
                });
                const { text, contentType } = await readResponseText(response);
                logPhotoResponse('PhotoDirector', response, text, contentType);
                if (!response.ok) {
                    if (looksLikeHtmlResponse(text, contentType)) {
                        throw buildHtmlResponseError('Photo Director', response, text, contentType);
                    }
                    throw new Error(`Photo Director 请求失败 (${response.status})${text ? `: ${responsePreview(text, 180)}` : ''}`);
                }
                return parseJsonResponsePayload('Photo Director', response, text, contentType);
            } catch (error) {
                if (signal.aborted) {
                    throw new Error(`Photo Director 请求超时（${Math.round(PHOTO_DIRECTOR_TIMEOUT_MS / 1000)} 秒），已停止生图`);
                }
                throw error;
            }
        });
        markSecondaryApiConfigSuccess(apiConfig);
        const rawDirectorOutput = data.choices?.[0]?.message?.content || '';
        const parsedDirectorJson = extractJson(rawDirectorOutput, { logFailure: false });
        const directorResult = normalizeDirectorResult(parsedDirectorJson);
        console.groupCollapsed('[PhotoDirector] output');
        console.info('providerType:', providerType);
        console.info('model:', apiConfig.model);
        console.info('photoHint:', hint);
        console.info('raw output:', rawDirectorOutput);
        console.info('parsed JSON:', parsedDirectorJson);
        console.info('normalized result:', directorResult);
        console.groupEnd();
        return directorResult;
    } catch (error) {
        markSecondaryApiConfigFailure(apiConfig, error);
        throw error;
    }
}

export async function runManualPhotoDirector(args: {
    apiConfig: APIConfig;
    char: CharacterProfile;
    userProfile: UserProfile;
    currentMsgs: Message[];
    userPrompt: string;
    stylePresets: PhotoStylePreset[];
    recentPhotoMetas: PhotoMeta[];
    providerType: ImageProviderType;
    openAIStyleFamily?: OpenAICompatibleStyleFamily;
    appearanceTags?: string;
    appearanceNegativeTags?: string;
    userAppearanceTags?: string;
    userAppearanceNegativeTags?: string;
    appearancePrompt?: string;
    userAppearancePrompt?: string;
    contextOptions?: SecondaryFullContextOptions;
}): Promise<PhotoDirectorResult | null> {
    const {
        apiConfig,
        char,
        userProfile,
        currentMsgs,
        userPrompt,
        stylePresets,
        recentPhotoMetas,
        providerType,
        openAIStyleFamily,
        appearanceTags,
        appearanceNegativeTags,
        userAppearanceTags,
        userAppearanceNegativeTags,
        appearancePrompt,
        userAppearancePrompt,
        contextOptions,
    } = args;
    const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
    const compatibleStyles = getCompatiblePhotoStylePresets(stylePresets, providerType, openAIStyleFamily);
    const styleLines = compatibleStyles.map(preset => `- ${preset.id}: ${preset.name}`).join('\n') || '- no-style: 不使用风格预设';
    const recentLines = recentPhotoMetas.slice(-8).map((meta, index) => {
        const director = meta.directorResult;
        return `${index + 1}. ${director?.caption || director?.continuity_summary || meta.continuity_summary || (meta.finalPrompt || meta.positivePrompt).slice(0, 120)}`;
    }).join('\n') || '暂无。';
    const charContext = buildCharacterDirectorContext(char);
    const recentChat = buildRecentChatDirectorContext(currentMsgs, char, userProfile);
    const externalAppearanceTags = normalizePromptList([appearanceTags]);
    const externalUserAppearanceTags = normalizePromptList([userAppearanceTags]);
    const externalAppearanceNegative = normalizePromptList([appearanceNegativeTags, userAppearanceNegativeTags]);
    const externalAppearanceText = normalizeTextSections([
        appearancePrompt ? `角色固定外貌：${appearancePrompt}` : '',
        userAppearancePrompt ? `用户固定外貌：${userAppearancePrompt}` : '',
    ]);

    const system = providerType === 'novelai'
        ? `你是 NovelAI 手动生图的 Photo Director。用户已经明确要求生成图片，你的任务是读取当前聊天剧情、角色设定和用户本次输入，把画面整理成适合 NovelAI 的英文 tag 字段。
你不是聊天模型，不要继续写剧情；你也不负责画风、质量词、Vibe 或模型参数。
只输出 JSON，不要写解释。

规则：
- shouldGeneratePhoto 通常必须为 true，除非用户输入完全不可用或有安全问题。
- 不要输出 artist tag。
- 不要输出 quality tag，例如 masterpiece, best quality, very aesthetic, highres。
- 不要输出采样参数、模型参数、尺寸、steps、scale。
- 每个 tag 字段只写英文 tag，用逗号分隔；不要写自然语言长句。
- 不要写抽象心理，必须转成可见表情、姿势、光线、场景或镜头。
- 不要写冲突 tag，例如 smile 和 crying 同时出现，day 和 night 同时出现。
- 如果外部已提供“角色外貌 NAI tags”，不要在 subject_tags 里改写发色、瞳色、体型、服装常设等稳定外貌；subject_tags 可保留 1girl/1boy/solo 等主体信息。
- 如果外部已提供“用户外貌 NAI tags”，且本次画面包含用户/合照，不要改写用户稳定外貌。
- 固定外貌由外部系统追加到最终 prompt，优先级高于你输出的临时剧情 tag。
- 你只补足本次剧情相关的表情、动作、服装变化、场景、镜头、氛围和 dynamic_negative。

输出格式：{
  "shouldGeneratePhoto": boolean,
  "caption": "图片发出时自然附带的一句话，可为空",
  "stylePresetId": "可为空；外部下拉框会决定风格",
  "continuity_summary": "给下一轮主模型看的照片连续性摘要",
  "intent": "selfie | daily_photo | date_scene | item_photo | background | portrait | half_body | full_body",
  "subject_tags": "英文 tag，用逗号分隔。只保留主体数量/性别/关系等必要信息",
  "expression_tags": "英文 tag，用逗号分隔",
  "pose_tags": "英文 tag，用逗号分隔",
  "clothing_tags": "英文 tag，用逗号分隔",
  "scene_tags": "英文 tag，用逗号分隔",
  "camera_tags": "英文 tag，用逗号分隔",
  "mood_tags": "英文 tag，用逗号分隔，只写可见氛围/光线",
  "dynamic_negative": "英文 tag，用逗号分隔"
}`
        : `你是手动生图的 Photo Director。用户已经明确要求生成图片，你需要结合当前聊天剧情、角色设定和用户本次输入，整理成摄影导演稿。
只输出 JSON，不要写解释。如果外部提供了固定角色/用户外貌描述，scene_zh 不要写出与之冲突的外貌；画面包含对应人物时要保持这些特征。
输出格式：{
  "shouldGeneratePhoto": boolean,
  "caption": "图片发出时自然附带的一句话，可为空",
  "scene_zh": "中文画面描述",
  "camera": "镜头/构图",
  "mood": "氛围",
  "stylePresetId": "可为空；外部下拉框会决定风格",
  "continuity_summary": "给下一轮主模型看的照片连续性摘要"
}`;

    const user = [
        `角色：${char.name}`,
        `用户：${userProfile.name}`,
        `角色设定上下文：\n${charContext}`,
        `当前生图供应商：${getImageProviderLabel(providerType)}`,
        `可用风格：\n${styleLines}`,
        `最近照片记录：\n${recentLines}`,
        `最近聊天片段：\n${recentChat}`,
        `用户本次生图要求：\n${userPrompt || '按当前剧情生成一张适合发出的照片。'}`,
        providerType === 'novelai'
            ? `外部角色外貌 NAI tags：\n${externalAppearanceTags || '未绑定。'}`
            : '',
        providerType === 'novelai' && externalUserAppearanceTags
            ? `外部用户外貌 NAI tags：\n${externalUserAppearanceTags}`
            : '',
        providerType === 'novelai' && externalAppearanceNegative
            ? `外部外貌 negative tags：\n${externalAppearanceNegative}`
            : '',
        providerType === 'openai-compatible' && externalAppearanceText
            ? `外部固定外貌描述：\n${externalAppearanceText}`
            : '',
        '请优先表现本次剧情和用户要求；不要把 Vibe、风格、quality tags 写进输出。',
    ].filter(Boolean).join('\n\n');

    const mirrorMessages = Array.isArray(contextOptions?.mirrorMessages)
        ? contextOptions?.mirrorMessages as Array<{ role: string; content: unknown }>
        : [];
    const messages = mirrorMessages.length > 0
        ? [
            ...mirrorMessages,
            { role: 'user', content: `### [Manual Photo Director Instructions]\n${system}\n\n### [Manual Photo Director Input]\n${user}` },
        ]
        : [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ];

    try {
        const data = await trackedApiRequest({
            feature: 'image',
            reason: '手动生图剧情模式',
            model: apiConfig.model,
            userInitiated: true,
            url: `${baseUrl}/chat/completions`,
        }, async () => {
            const signal = safeTimeoutSignal(PHOTO_DIRECTOR_TIMEOUT_MS);
            try {
                const response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiConfig.apiKey}`,
                    },
                    body: JSON.stringify({
                        model: apiConfig.model,
                        messages,
                        temperature: 0.4,
                        max_tokens: PHOTO_DIRECTOR_MAX_TOKENS,
                    }),
                    signal,
                });
                const { text, contentType } = await readResponseText(response);
                logPhotoResponse('ManualPhotoDirector', response, text, contentType);
                if (!response.ok) {
                    if (looksLikeHtmlResponse(text, contentType)) {
                        throw buildHtmlResponseError('手动生图剧情模式', response, text, contentType);
                    }
                    throw new Error(`手动生图剧情模式请求失败 (${response.status})${text ? `: ${responsePreview(text, 180)}` : ''}`);
                }
                return parseJsonResponsePayload('手动生图剧情模式', response, text, contentType);
            } catch (error) {
                if (signal.aborted) {
                    throw new Error(`手动生图剧情模式请求超时（${Math.round(PHOTO_DIRECTOR_TIMEOUT_MS / 1000)} 秒），已停止生图`);
                }
                throw error;
            }
        });
        markSecondaryApiConfigSuccess(apiConfig);
        const rawDirectorOutput = data.choices?.[0]?.message?.content || '';
        const parsedDirectorJson = extractJson(rawDirectorOutput, { logFailure: false });
        const directorResult = normalizeDirectorResult(parsedDirectorJson);
        console.groupCollapsed('[ManualPhotoDirector] output');
        console.info('providerType:', providerType);
        console.info('model:', apiConfig.model);
        console.info('userPrompt:', userPrompt);
        console.info('raw output:', rawDirectorOutput);
        console.info('parsed JSON:', parsedDirectorJson);
        console.info('normalized result:', directorResult);
        console.groupEnd();
        return directorResult;
    } catch (error) {
        markSecondaryApiConfigFailure(apiConfig, error);
        throw error;
    }
}

function normalizeOptionalIntegerParam(value: unknown, min: number, max: number): number | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const numeric = typeof value === 'number'
        ? value
        : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
    if (!Number.isFinite(numeric)) return undefined;
    return Math.min(max, Math.max(min, Math.round(numeric)));
}

function parseTextParam(text: string, names: string[]): string | undefined {
    const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return text.match(new RegExp(`(?:${escaped})\\s*[:：]\\s*([^\\n,]+)`, 'i'))?.[1]?.trim();
}

export function parsePhotoStylePaste(
    text: string,
    defaultScope: PhotoStyleProviderScope | 'openai-compatible' = 'novelai',
): PhotoStylePreset {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('请先粘贴风格内容');

    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
            return {
                id: String(parsed.id || randomId('style')),
                name: String(parsed.name || '导入风格'),
                providerScope: normalizePhotoStyleProviderScope(
                    parsed.providerScope,
                    normalizePhotoStyleProviderScope(defaultScope),
                    parsed as Partial<PhotoStylePreset> & Record<string, unknown>,
                ),
                positivePrompt: String(parsed.positivePrompt || parsed.positive || parsed.prompt || '').trim(),
                negativePrompt: String(parsed.negativePrompt || parsed.negative || parsed.uc || '').trim(),
                model: parsed.model ? String(parsed.model) : undefined,
                width: Number(parsed.width) || undefined,
                height: Number(parsed.height) || undefined,
                steps: Number(parsed.steps) || undefined,
                scale: Number(parsed.scale || parsed.cfg || parsed.cfgScale) || undefined,
                sampler: normalizeOptionalNaiSampler(parsed.sampler),
                noiseSchedule: normalizeOptionalNaiNoiseSchedule(parsed.noiseSchedule),
                size: parsed.size ? normalizeOpenAIImageSize(parsed.size) : undefined,
                responseFormat: normalizeOptionalOpenAIImageResponseFormat(parsed.responseFormat || parsed.response_format),
                n: normalizeOptionalIntegerParam(parsed.n, 1, 10),
                quality: normalizeOptionalOpenAIImageQuality(parsed.quality),
                openAIStyle: normalizeOptionalOpenAIImageStyle(parsed.openAIStyle || parsed.openaiStyle || parsed.openai_style || parsed.style),
                background: normalizeOptionalOpenAIImageBackground(parsed.background),
                outputFormat: normalizeOptionalOpenAIImageOutputFormat(parsed.outputFormat || parsed.output_format),
                outputCompression: normalizeOptionalIntegerParam(parsed.outputCompression ?? parsed.output_compression, 0, 100),
                moderation: normalizeOptionalOpenAIImageModeration(parsed.moderation),
                user: parsed.user ? String(parsed.user).trim() : undefined,
                stream: typeof parsed.stream === 'boolean' ? parsed.stream : undefined,
                partialImages: normalizeOptionalIntegerParam(parsed.partialImages ?? parsed.partial_images, 1, 3),
                extraRequestBody: parsed.extraRequestBody ? String(parsed.extraRequestBody).trim() : undefined,
            };
        }
    } catch {
        // Fall through to text parser.
    }

    const negativeMatch = trimmed.match(/(?:negative prompt|negative|负面提示词|负面|uc)\s*[:：]\s*([\s\S]*)/i);
    const positiveText = negativeMatch
        ? trimmed.slice(0, negativeMatch.index).replace(/^(?:positive prompt|positive|正面提示词|正面|prompt)\s*[:：]\s*/i, '').trim()
        : trimmed.replace(/^(?:positive prompt|positive|正面提示词|正面|prompt)\s*[:：]\s*/i, '').trim();
    const negativeText = negativeMatch ? negativeMatch[1].split(/\n(?:model|steps|sampler|noise schedule|schedule|cfg|size|response format|quality|style|background|output format|compression|moderation|user|stream|partial images|extra request body)\s*[:：]/i)[0].trim() : '';
    const steps = Number(trimmed.match(/steps\s*[:：]\s*(\d+)/i)?.[1] || '');
    const sampler = normalizeOptionalNaiSampler(trimmed.match(/sampler\s*[:：]\s*([^\n,]+)/i)?.[1]?.trim());
    const noiseSchedule = normalizeOptionalNaiNoiseSchedule(trimmed.match(/(?:noise schedule|schedule|调度)\s*[:：]\s*([^\n,]+)/i)?.[1]?.trim());
    const scale = Number(trimmed.match(/(?:cfg scale|cfg)\s*[:：]\s*([0-9.]+)/i)?.[1] || '');
    const sizeMatch = trimmed.match(/(?:size|尺寸)\s*[:：]\s*(\d{2,4})\s*[x×]\s*(\d{2,4})/i);
    const size = sizeMatch ? `${Number(sizeMatch[1])}x${Number(sizeMatch[2])}` : parseTextParam(trimmed, ['size', '尺寸']);

    return {
        id: randomId('style'),
        name: '粘贴导入风格',
        providerScope: normalizePhotoStyleProviderScope(defaultScope),
        positivePrompt: positiveText,
        negativePrompt: negativeText,
        model: parseTextParam(trimmed, ['model', '模型']),
        steps: Number.isFinite(steps) && steps > 0 ? steps : undefined,
        sampler,
        noiseSchedule,
        scale: Number.isFinite(scale) && scale > 0 ? scale : undefined,
        width: sizeMatch ? Number(sizeMatch[1]) : undefined,
        height: sizeMatch ? Number(sizeMatch[2]) : undefined,
        size: size ? normalizeOpenAIImageSize(size) : undefined,
        responseFormat: normalizeOptionalOpenAIImageResponseFormat(parseTextParam(trimmed, ['response format', 'response_format'])),
        n: normalizeOptionalIntegerParam(parseTextParam(trimmed, ['n', 'count']), 1, 10),
        quality: normalizeOptionalOpenAIImageQuality(parseTextParam(trimmed, ['quality'])),
        openAIStyle: normalizeOptionalOpenAIImageStyle(parseTextParam(trimmed, ['style', 'openai style', 'openai_style'])),
        background: normalizeOptionalOpenAIImageBackground(parseTextParam(trimmed, ['background'])),
        outputFormat: normalizeOptionalOpenAIImageOutputFormat(parseTextParam(trimmed, ['output format', 'output_format'])),
        outputCompression: normalizeOptionalIntegerParam(parseTextParam(trimmed, ['compression', 'output compression', 'output_compression']), 0, 100),
        moderation: normalizeOptionalOpenAIImageModeration(parseTextParam(trimmed, ['moderation'])),
        user: parseTextParam(trimmed, ['user']),
        stream: parseTextParam(trimmed, ['stream']) === undefined ? undefined : /^true|1|yes|on$/i.test(parseTextParam(trimmed, ['stream']) || ''),
        partialImages: normalizeOptionalIntegerParam(parseTextParam(trimmed, ['partial images', 'partial_images']), 1, 3),
    };
}

export async function testOpenAICompatibleImageConnection(config: OpenAICompatibleImageProviderConfig): Promise<{
    ok: boolean;
    status: number;
    message: string;
    models: string[];
    modelOptions: OpenAICompatibleModelOption[];
}> {
    if (!config.baseUrl.trim()) throw new Error('请先填写 Base URL');
    if (!config.apiKey.trim()) throw new Error('请先填写 API Key');

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${config.apiKey.trim()}`,
        },
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (looksLikeHtmlResponse(text, responseContentType(response))) {
            throw buildHtmlResponseError('OpenAI 兼容模型列表', response, text);
        }
        const detail = readOpenAICompatibleErrorMessage(parseOpenAICompatibleResponsePayload(text), text);
        if (isOpenAICompatibleAuthError(response.status, detail)) {
            return {
                ok: false,
                status: response.status,
                message: buildOpenAICompatibleAuthError('OpenAI 兼容模型列表', response.status, detail),
                models: [],
                modelOptions: [],
            };
        }
        return { ok: false, status: response.status, message: `连接失败：${response.status}${text ? `：${responsePreview(text, 120)}` : ''}`, models: [], modelOptions: [] };
    }

    const { payload } = await readJsonResponsePayload('OpenAI 兼容模型列表', response);
    const modelOptions = dedupeOpenAICompatibleModelOptions(extractOpenAICompatibleModelItems(payload)
        .map(normalizeOpenAICompatibleModelOption)
        .filter((item: OpenAICompatibleModelOption | null): item is OpenAICompatibleModelOption => Boolean(item)));
    const models = modelOptions.map(item => item.id);
    return {
        ok: true,
        status: response.status,
        message: models.length > 0 ? `连接成功，发现 ${models.length} 个模型` : '连接成功，但接口没有返回模型列表',
        models,
        modelOptions,
    };
}
