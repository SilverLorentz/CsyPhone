import {
    type APIConfig,
    type ApiPreset,
    type RealtimeConfig,
    type ImageGenerationConfig,
    type ImageGenerationStyle,
    type ImageApiPreset,
    type ImageProviderType,
    type NaiImageModel,
    type NovelAIImageProviderConfig,
    type OpenAICompatibleStyleFamily,
    type OpenAIImageBackground,
    type OpenAIImageModeration,
    type OpenAIImageOutputFormat,
    type OpenAIImageQuality,
    type OpenAICompatibleImageProviderConfig,
    type OpenAIImageResponseFormat,
    type OpenAIImageStyle,
    type PhotoStylePreset,
    type PhotoStyleProviderScope,
    type SttConfig,
    type TtsConfig,
    DEFAULT_STT_CONFIG,
    DEFAULT_TTS_CONFIG,
} from '../types';
import {
    type BackendResolutionDebug,
    getBackendResolutionDebug,
    getBackendToken,
    getBackendUrl,
    getFrontendOrigin,
    getTtsWsProxyUrl,
    getUserId,
} from './backendConfig';
import {
    readJsonStorage,
    safeLocalStorageGet,
    safeLocalStorageRemove,
    safeLocalStorageSet,
} from './storage';
import { LOVE_SHOW_IMAGE_STYLE_PRESETS } from './loveshowPrompts';

export type EmbeddingProvider = 'openai' | 'cohere';
export type EmbeddingEngineId = 'standard' | 'enhanced';

export const PRIMARY_API_CONFIG_KEY = 'os_api_config';
export const AVAILABLE_MODELS_KEY = 'os_available_models';
export const API_PRESETS_KEY = 'os_api_presets';
export const SECONDARY_API_CONFIG_KEY = 'os_sub_api_config';
export const SECONDARY_API_POOL_KEY = 'os_sub_api_pool';
export const SECONDARY_API_POOL_STATE_KEY = 'os_sub_api_pool_state';
export const SECONDARY_API_POOL_CURSOR_KEY = 'os_sub_api_pool_cursor';
export const REALTIME_CONFIG_KEY = 'os_realtime_config';
export const TTS_CONFIG_KEY = 'os_tts_config';
export const STT_CONFIG_KEY = 'os_stt_config';
export const IMAGE_GENERATION_CONFIG_KEY = 'os_image_generation_config';
export const IMAGE_GENERATION_DRAFT_CONFIG_KEY = 'os_image_generation_config_draft';
export const IMAGE_API_PRESETS_KEY = 'os_image_api_presets';
export const PHOTO_STYLE_PRESETS_KEY = 'os_photo_style_presets';

export const LEGACY_SUB_API_KEY = 'sub_api_key';
export const LEGACY_SUB_API_BASE_URL_KEY = 'sub_api_base_url';
export const LEGACY_SUB_API_MODEL_KEY = 'sub_api_model';
const SECONDARY_API_RETRY_COOLDOWN_MS = 60 * 1000;

export const EMBEDDING_PROVIDER_KEY = 'embedding_provider';
export const EMBEDDING_API_KEY_KEY = 'embedding_api_key';
export const EMBEDDING_BASE_URL_KEY = 'embedding_base_url';
export const EMBEDDING_MODEL_KEY = 'embedding_model';
export const RERANK_API_KEY_KEY = 'cohere_rerank_api_key';
export const RERANK_USE_PAID_KEY = 'cohere_rerank_use_paid';
export const CHARACTER_REFINE_PROMPTS_KEY = 'character_refine_prompts';

export const DEFAULT_CHAT_TEMPERATURE = 0.85;
export const MIN_CHAT_TEMPERATURE = 0;
export const MAX_CHAT_TEMPERATURE = 2;

export const DEFAULT_RUNTIME_REALTIME_CONFIG: RealtimeConfig = {
    weatherEnabled: false,
    weatherApiKey: '',
    weatherCity: 'Beijing',
    newsEnabled: false,
    newsApiKey: '',
    newsPlatforms: ['weibo', 'zhihu', 'baidu', 'bilibili', 'douyin'],
    hotSearchEnabled: false,
    aihotEnabled: false,
    notionEnabled: false,
    notionApiKey: '',
    notionDatabaseId: '',
    feishuEnabled: false,
    feishuAppId: '',
    feishuAppSecret: '',
    feishuBaseId: '',
    feishuTableId: '',
    xhsEnabled: false,
    xhsMcpConfig: {
        enabled: false,
        serverUrl: 'http://localhost:18061/api',
    },
    canvaEnabled: false,
    canvaMcpConfig: {
        enabled: false,
        serverUrl: 'http://localhost:18062/api',
    },
    cacheMinutes: 30,
};

export const DEFAULT_RUNTIME_API_CONFIG: APIConfig = {
    baseUrl: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: DEFAULT_CHAT_TEMPERATURE,
};

export const NAI_IMAGE_MODELS: NaiImageModel[] = [
    'nai-diffusion-4-5-full',
    'nai-diffusion-4-5-curated',
    'nai-diffusion-4-full',
    'nai-diffusion-4-curated-preview',
    'nai-diffusion-3',
    'nai-diffusion-furry-3',
];

export const IMAGE_PROVIDER_TYPES: ImageProviderType[] = ['novelai', 'openai-compatible'];
export const IMAGE_GENERATION_STYLES: ImageGenerationStyle[] = ['guoman', 'cg', 'real'];
export const PHOTO_STYLE_PROVIDER_SCOPES: PhotoStyleProviderScope[] = ['all', 'novelai', 'openai-gpt', 'openai-gemini'];
type NaiImageOption = { value: string; label: string; aliases?: string[] };
export const NAI_IMAGE_SAMPLER_OPTIONS: NaiImageOption[] = [
    { value: 'k_euler', label: 'Euler', aliases: ['euler'] },
    { value: 'k_euler_ancestral', label: 'Euler Ancestral', aliases: ['euler ancestral', 'euler a', 'k_euler_a'] },
    { value: 'k_dpmpp_2m', label: 'DPM++ 2M', aliases: ['dpm++ 2m', 'dpmpp 2m', 'k_dpm++ 2m'] },
    { value: 'k_dpmpp_2m_sde', label: 'DPM++ 2M SDE', aliases: ['dpm++ 2m sde', 'dpmpp 2m sde', 'k_dpm++ 2m sde'] },
    { value: 'k_dpmpp_sde', label: 'DPM++ SDE', aliases: ['dpm++ sde', 'dpmpp sde', 'k_dpm++ sde'] },
    { value: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral', aliases: ['dpm++ 2s ancestral', 'dpmpp 2s ancestral', 'k_dpm++ 2s ancestral'] },
    { value: 'k_dpm_2', label: 'DPM2', aliases: ['dpm2', 'dpm 2'] },
    { value: 'k_dpm_2_ancestral', label: 'DPM2 Ancestral', aliases: ['dpm2 ancestral', 'dpm 2 ancestral'] },
    { value: 'k_dpm_fast', label: 'DPM Fast', aliases: ['dpm fast'] },
    { value: 'k_heun', label: 'Heun', aliases: ['heun'] },
    { value: 'k_lms', label: 'LMS', aliases: ['lms'] },
    { value: 'ddim', label: 'DDIM', aliases: ['ddim'] },
    { value: 'ddim_v3', label: 'DDIM v3', aliases: ['ddim v3'] },
    { value: 'plms', label: 'PLMS', aliases: ['plms'] },
];
export const NAI_IMAGE_NOISE_SCHEDULE_OPTIONS: NaiImageOption[] = [
    { value: 'native', label: 'Native', aliases: ['default', 'normal'] },
    { value: 'karras', label: 'Karras' },
    { value: 'exponential', label: 'Exponential', aliases: ['exp'] },
    { value: 'polyexponential', label: 'Polyexponential', aliases: ['poly exponential', 'poly-exponential', 'polyexp'] },
];
export const OPENAI_IMAGE_RESPONSE_FORMATS: OpenAIImageResponseFormat[] = ['auto', 'b64_json', 'url'];
export const OPENAI_IMAGE_QUALITIES: OpenAIImageQuality[] = ['', 'auto', 'low', 'medium', 'high', 'standard', 'hd'];
export const OPENAI_IMAGE_STYLES: OpenAIImageStyle[] = ['', 'vivid', 'natural'];
export const OPENAI_IMAGE_BACKGROUNDS: OpenAIImageBackground[] = ['', 'auto', 'transparent', 'opaque'];
export const OPENAI_IMAGE_OUTPUT_FORMATS: OpenAIImageOutputFormat[] = ['', 'png', 'jpeg', 'webp'];
export const OPENAI_IMAGE_MODERATIONS: OpenAIImageModeration[] = ['', 'auto', 'low'];

export const DEFAULT_NOVELAI_IMAGE_CONFIG: NovelAIImageProviderConfig = {
    apiUrl: 'https://image.novelai.net',
    apiToken: '',
    model: 'nai-diffusion-4-5-full',
    width: 832,
    height: 1216,
    steps: 28,
    scale: 5,
    sampler: 'k_euler',
    noiseSchedule: 'native',
    qualityTags: 'best quality, amazing quality, very aesthetic, absurdres',
    negativePrompt: 'lowres, blurry, bad anatomy, bad hands, extra fingers, missing fingers, watermark, text, logo, jpeg artifacts',
};

export const DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG: OpenAICompatibleImageProviderConfig = {
    baseUrl: '',
    apiKey: '',
    model: 'gpt-image-2',
    size: '1024x1024',
    responseFormat: 'auto',
    n: null,
    quality: '',
    style: '',
    background: '',
    outputFormat: '',
    outputCompression: null,
    moderation: '',
    user: '',
    stream: false,
    partialImages: null,
    extraRequestBody: '',
    qualityTags: 'high quality, detailed, natural composition',
    negativePrompt: 'low quality, blurry, distorted hands, watermark, text, logo',
};

export const GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
export const GEMINI_OPENAI_COMPATIBLE_IMAGE_DEFAULTS: Partial<OpenAICompatibleImageProviderConfig> = {
    model: GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
    size: '1024x1536',
    responseFormat: 'b64_json',
    qualityTags: DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.qualityTags,
    negativePrompt: DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.negativePrompt,
};

export const DEFAULT_IMAGE_GENERATION_CONFIG: ImageGenerationConfig = {
    activeProvider: 'novelai',
    imageStyle: 'guoman',
    novelai: DEFAULT_NOVELAI_IMAGE_CONFIG,
    openaiCompatible: DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG,
};

export const DEFAULT_IMAGE_API_PRESETS: ImageApiPreset[] = [];

export const DEFAULT_PHOTO_STYLE_PRESETS: PhotoStylePreset[] = [
    ...LOVE_SHOW_IMAGE_STYLE_PRESETS,
    {
        id: 'soft-polaroid-compatible',
        name: '柔光拍立得 / 兼容接口',
        providerScope: 'openai-gpt',
        positivePrompt: '一张柔和胶片质感的随手拍，暖色室内光，轻微颗粒，构图自然亲密，像刚刚用手机拍下来发给对方。',
        negativePrompt: '过曝，欠曝，强闪光，廉价影楼感，过度修图',
    },
    {
        id: 'clean-anime-snapshot-compatible',
        name: '清透动画随拍 / 兼容接口',
        providerScope: 'openai-gpt',
        positivePrompt: '清透细腻的动画插画风格，线条干净，色彩柔和，背景有生活感，画面像自然抓拍而不是摆拍。',
        negativePrompt: '线条混乱，背景空洞，光照扁平，肢体结构错误',
    },
    {
        id: 'style-openai-compatible-1779814872010',
        name: '少年漫',
        providerScope: 'openai-gpt',
        positivePrompt: '偏精修的少年漫画彩图风格，线条明确，结构清晰，光影利落，人物有张力和完成度，但整体仍保持干净、美型和现代感。',
        negativePrompt: '避免肌肉刻画夸张、表情太凶、画面过硬、动作别扭、背景粗糙。',
    },
    {
        id: 'style-openai-compatible-1779814906957',
        name: '居家',
        providerScope: 'openai-gpt',
        positivePrompt: '温暖舒适的居家照片风格，柔和室内光线，色调偏暖，氛围安静亲密，画面有生活气息但不凌乱，整体给人轻松陪伴的感觉。',
        negativePrompt: '',
    },
    {
        id: 'style-openai-compatible-1779815156168',
        name: '胶片风景',
        providerScope: 'openai-gpt',
        positivePrompt: '柔和胶片质感的环境摄影风格，带轻微颗粒，色彩自然偏暖，明暗过渡柔和，画面有旧照片般的温度和真实感。',
        negativePrompt: '避免颗粒过重、故意做旧过头、画质脏乱、偏色严重、复古滤镜太假。',
    },
    {
        id: 'style-openai-compatible-1779815270533',
        name: '静物',
        providerScope: 'openai-gpt',
        positivePrompt: '低饱和、安静克制的环境摄影风格，色彩柔和偏灰，画面简洁，注重空间里的物件、光线和留白，整体有平静、成熟、日常的质感',
        negativePrompt: '',
    },
    {
        id: 'style-openai-compatible-1779848616830',
        name: '成男',
        providerScope: 'openai-gpt',
        positivePrompt: '氛围感，容貌极度英俊，眼睛绝美，五官立体度高，面部高折叠度，国漫风，手机壁纸尺寸',
        negativePrompt: '',
    },
    {
        id: 'style-openai-compatible-mature-male-couple',
        name: '合照',
        providerScope: 'openai-gpt',
        positivePrompt: '双人同框合照，画面中有两位清晰绝美主体，人物之间有自然亲密的互动和明确站位，不像拼贴。一位主角为成熟英俊男性，氛围感，容貌极度英俊，眼睛绝美，五官立体度高，面部高折叠度，气质沉稳克制。另一位绝美人物与他自然同框，脸部清晰自然，比例协调。两人距离较近但姿态真实，适合情侣合照、生活照、手机壁纸。国漫风，精致恋爱向插画，高级柔和光影，清透色彩，电影感构图，手机壁纸尺寸',
        negativePrompt: '单人照，只有一个人，裁掉其中一人，人物融合，脸部融合，重复人物，额外人物，陌生第三人，错位构图，拼贴感，低质量，畸形手，脸崩',
    },
    {
        id: 'style-openai-compatible-mature-male-selfie-couple',
        name: '恋爱合照',
        providerScope: 'openai-gpt',
        positivePrompt: '双人合照，近距离同框，画面中有两位清晰绝美主体，像角色亲手拍下的照片。其中一位主角为成熟英俊男性，氛围感，容貌极度英俊，眼睛绝美，五官立体度高，面部高折叠度，气质沉稳温柔。两人靠得很近，互动自然亲密，有真实生活感和恋爱氛围，不像摆拍。脸部清晰，五官精致，比例协调，柔和室内光或夜景光，国漫风，精致恋爱向插画，手机壁纸尺寸',
        negativePrompt: '单人照，只有一个人，裁掉其中一人，人物融合，脸部融合，重复人物，额外人物，陌生第三人，距离太远，拼贴感，低质量，畸形手，脸崩',
    },
    {
        id: 'style-openai-compatible-mature-male-real-couple',
        name: '真人合照',
        providerScope: 'openai-gpt',
        positivePrompt: '双人同框真人感合照，画面中有两位清晰主体，像真实拍摄的人物照片，成熟英俊男性，五官立体，眼睛深邃好看，气质沉稳温柔，高颜值但自然不过分夸张。另一位人物与他自然同框，互动亲密自然，像情侣或暧昧对象的日常合照。整体为三次元真实摄影风格，皮肤质感自然，轻微肤纹，真实光影，生活感，高级氛围感，构图干净，电影感，手机壁纸尺寸',
        negativePrompt: '二次元，国漫风，动漫插画，Q版，卡通，3D建模感，假脸，塑料皮肤，过度磨皮，网红滤镜，单人照，只有一个人，人物融合，脸部融合，重复人物，第三人，肢体畸形，手部异常，裁掉其中一人，模糊脸，低清晰度',
    },
    {
        id: 'gemini-nano-banana-natural-snapshot',
        name: 'Gemini / Nano Banana 自然随拍',
        providerScope: 'openai-gemini',
        size: '1024x1536',
        positivePrompt: '自然生活随拍，真实手机摄影感，构图轻松，光线柔和，人物状态自然，细节清晰，有亲近的日常氛围。',
        negativePrompt: '过度修图，塑料皮肤，摆拍感，水印，文字，低清晰度，畸形手',
    },
];

const DEFAULT_PHOTO_STYLE_PRESET_BY_ID = new Map(DEFAULT_PHOTO_STYLE_PRESETS.map(preset => [preset.id, preset]));

const RETIRED_DEFAULT_PHOTO_STYLE_PRESET_IDS = new Set([
    'soft-polaroid',
    'clean-anime-snapshot',
]);
const PHOTO_STYLE_PRESETS_MIGRATION_KEY = 'os_photo_style_presets_migration';
const PHOTO_STYLE_PRESETS_MIGRATION_VERSION = 'openai-compatible-style-family-2026-06-06';

export const EMBEDDING_ENGINES: Record<
    EmbeddingEngineId,
    { model: string; rerankModel: string; baseUrl: string; dimensions?: number }
> = {
    standard: {
        model: 'BAAI/bge-m3',
        rerankModel: 'BAAI/bge-reranker-v2-m3',
        baseUrl: 'https://api.siliconflow.cn/v1',
    },
    enhanced: {
        model: 'Qwen/Qwen3-Embedding-8B',
        rerankModel: 'Qwen/Qwen3-Reranker-8B',
        baseUrl: 'https://api.siliconflow.cn/v1',
        dimensions: 1024,
    },
};

const EMBEDDING_PROVIDER_DEFAULTS: Record<
    EmbeddingProvider,
    { baseUrl: string; model: string; rerankModel: string; dimensions?: number }
> = {
    openai: {
        baseUrl: EMBEDDING_ENGINES.enhanced.baseUrl,
        model: EMBEDDING_ENGINES.enhanced.model,
        rerankModel: EMBEDDING_ENGINES.enhanced.rerankModel,
        dimensions: EMBEDDING_ENGINES.enhanced.dimensions,
    },
    cohere: {
        baseUrl: 'https://api.cohere.com/v2',
        model: 'embed-v4.0',
        rerankModel: 'rerank-v3.5',
    },
};

export interface EmbeddingRuntimeConfig {
    provider: EmbeddingProvider;
    apiKey: string;
    baseUrl: string;
    model: string;
    rerankModel: string;
    dimensions?: number;
    rerankApiKey: string;
    rerankUsePaid: boolean;
}

export interface BackendRuntimeConfig {
    backendUrl: string | null;
    backendToken: string | null;
    frontendOrigin: string;
    ttsWsProxyUrl: string;
    userId: string;
    resolutionDebug: BackendResolutionDebug;
}

export interface RuntimeConfigSnapshot {
    backend: BackendRuntimeConfig;
    api: {
        primary: APIConfig;
        secondary?: APIConfig;
        secondaryPool: SecondaryApiPoolEntry[];
        availableModels: string[];
        presets: ApiPreset[];
    };
    realtime: RealtimeConfig;
    tts: TtsConfig;
        stt: SttConfig;
        imageGeneration: {
            config: ImageGenerationConfig;
            apiPresets: ImageApiPreset[];
            stylePresets: PhotoStylePreset[];
        };
        embedding: EmbeddingRuntimeConfig;
}

export interface CharacterRefinePromptConfig {
    id: string;
    name: string;
    content: string;
}

export interface SecondaryApiPoolEntry {
    id: string;
    name: string;
    enabled: boolean;
    config: APIConfig;
}

export interface SecondaryApiPoolEntryWithStatus extends SecondaryApiPoolEntry {
    cooldownUntil?: number;
    lastError?: string;
    lastUsedAt?: number;
}

interface SecondaryApiPoolState {
    [entryId: string]: {
        cooldownUntil?: number;
        lastError?: string;
        lastUsedAt?: number;
    };
}

function readJsonValue<T>(key: string): T | null {
    return readJsonStorage<T>(key);
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function getOpenAICompatibleStyleFamily(
    config: Pick<OpenAICompatibleImageProviderConfig, 'baseUrl' | 'model'> | null | undefined,
): OpenAICompatibleStyleFamily {
    const source = `${String(config?.baseUrl || '')} ${String(config?.model || '')}`.toLowerCase();
    return /gemini|generativelanguage|googleapis|nano[-_\s]?banana|imagen/.test(source) ? 'gemini' : 'gpt';
}

function normalizeUrl(value: unknown): string {
    return normalizeString(value).replace(/\/+$/, '');
}

export function normalizeChatTemperature(
    value: unknown,
    fallback = DEFAULT_CHAT_TEMPERATURE,
): number {
    const numeric = typeof value === 'number'
        ? value
        : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
    const fallbackValue = Number.isFinite(fallback) ? fallback : DEFAULT_CHAT_TEMPERATURE;
    if (!Number.isFinite(numeric)) return fallbackValue;

    const clamped = Math.min(MAX_CHAT_TEMPERATURE, Math.max(MIN_CHAT_TEMPERATURE, numeric));
    return Math.round(clamped * 100) / 100;
}

function normalizeEmbeddingProvider(value: unknown): EmbeddingProvider {
    return value === 'cohere' ? 'cohere' : 'openai';
}

function normalizeApiConfig(
    value: Partial<APIConfig> | null | undefined,
    defaults: APIConfig = DEFAULT_RUNTIME_API_CONFIG,
): APIConfig {
    return {
        baseUrl: normalizeUrl(value?.baseUrl) || defaults.baseUrl,
        apiKey: normalizeString(value?.apiKey),
        model: normalizeString(value?.model) || defaults.model,
        temperature: normalizeChatTemperature(value?.temperature, defaults.temperature ?? DEFAULT_CHAT_TEMPERATURE),
        useGeminiJailbreak: value?.useGeminiJailbreak === true,
        useDeepSeekMode: value?.useDeepSeekMode === true,
        disablePrefill: value?.disablePrefill === true,
        streamChat: value?.streamChat === true,
    };
}

function normalizeRealtimeConfig(value: Partial<RealtimeConfig> | null | undefined): RealtimeConfig {
    const rawXhsServerUrl = normalizeString(value?.xhsMcpConfig?.serverUrl);
    const legacyUntouchedMcpDefault =
        rawXhsServerUrl === 'http://localhost:18060/mcp'
        && value?.xhsMcpConfig?.enabled !== true
        && !normalizeString(value?.xhsMcpConfig?.loggedInUserId)
        && !normalizeString(value?.xhsMcpConfig?.loggedInNickname);
    const normalizedXhsServerUrl = legacyUntouchedMcpDefault
        ? 'http://localhost:18061/api'
        : rawXhsServerUrl || DEFAULT_RUNTIME_REALTIME_CONFIG.xhsMcpConfig?.serverUrl || 'http://localhost:18061/api';
    const normalizedCanvaServerUrl = normalizeString(value?.canvaMcpConfig?.serverUrl)
        || DEFAULT_RUNTIME_REALTIME_CONFIG.canvaMcpConfig?.serverUrl
        || 'http://localhost:18062/api';
    const normalizedNewsPlatforms = normalizeStringArray(value?.newsPlatforms);

    return {
        ...DEFAULT_RUNTIME_REALTIME_CONFIG,
        ...(value || {}),
        weatherApiKey: normalizeString(value?.weatherApiKey),
        weatherCity: normalizeString(value?.weatherCity) || DEFAULT_RUNTIME_REALTIME_CONFIG.weatherCity,
        newsApiKey: normalizeString(value?.newsApiKey),
        newsPlatforms: normalizedNewsPlatforms.length > 0
            ? normalizedNewsPlatforms
            : DEFAULT_RUNTIME_REALTIME_CONFIG.newsPlatforms,
        notionApiKey: normalizeString(value?.notionApiKey),
        notionDatabaseId: normalizeString(value?.notionDatabaseId),
        notionNotesDatabaseId: normalizeString(value?.notionNotesDatabaseId) || undefined,
        feishuAppId: normalizeString(value?.feishuAppId),
        feishuAppSecret: normalizeString(value?.feishuAppSecret),
        feishuBaseId: normalizeString(value?.feishuBaseId),
        feishuTableId: normalizeString(value?.feishuTableId),
        xhsEnabled: value?.xhsEnabled === true,
        xhsMcpConfig: {
            enabled: value?.xhsMcpConfig?.enabled === true,
            serverUrl: normalizedXhsServerUrl,
            loggedInUserId: normalizeString(value?.xhsMcpConfig?.loggedInUserId) || undefined,
            loggedInNickname: normalizeString(value?.xhsMcpConfig?.loggedInNickname) || undefined,
        },
        canvaEnabled: value?.canvaEnabled === true,
        canvaMcpConfig: {
            enabled: value?.canvaMcpConfig?.enabled === true,
            serverUrl: normalizedCanvaServerUrl,
            workspaceLabel: normalizeString(value?.canvaMcpConfig?.workspaceLabel) || undefined,
        },
        cacheMinutes: typeof value?.cacheMinutes === 'number' && Number.isFinite(value.cacheMinutes)
            ? value.cacheMinutes
            : DEFAULT_RUNTIME_REALTIME_CONFIG.cacheMinutes,
    };
}

function normalizeTtsNumber(value: unknown, fallback: number, min: number, max: number): number {
    const numeric = typeof value === 'number'
        ? value
        : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
}

function normalizeElevenLabsModelId(value: unknown): string {
    const modelId = normalizeString(value);
    if (!modelId) {
        return DEFAULT_TTS_CONFIG.elevenLabs.modelId;
    }
    return modelId;
}

function normalizeTtsConfig(value: Partial<TtsConfig> | null | undefined): TtsConfig {
    return {
        ...DEFAULT_TTS_CONFIG,
        ...(value || {}),
        voiceCallProvider: value?.voiceCallProvider === 'elevenlabs' ? 'elevenlabs' : DEFAULT_TTS_CONFIG.voiceCallProvider,
        baseUrl: normalizeString(value?.baseUrl) || DEFAULT_TTS_CONFIG.baseUrl,
        apiKey: normalizeString(value?.apiKey),
        groupId: normalizeString(value?.groupId),
        model: normalizeString(value?.model) || DEFAULT_TTS_CONFIG.model,
        voiceSetting: {
            ...DEFAULT_TTS_CONFIG.voiceSetting,
            ...(value?.voiceSetting || {}),
        },
        audioSetting: {
            ...DEFAULT_TTS_CONFIG.audioSetting,
            ...(value?.audioSetting || {}),
        },
        preprocessConfig: {
            ...DEFAULT_TTS_CONFIG.preprocessConfig,
            ...(value?.preprocessConfig || {}),
        },
        elevenLabs: {
            ...DEFAULT_TTS_CONFIG.elevenLabs,
            ...(value?.elevenLabs || {}),
            apiKey: normalizeString(value?.elevenLabs?.apiKey),
            voiceId: normalizeString(value?.elevenLabs?.voiceId),
            modelId: normalizeElevenLabsModelId(value?.elevenLabs?.modelId),
            languageCode: normalizeString(value?.elevenLabs?.languageCode),
            stability: normalizeTtsNumber(
                value?.elevenLabs?.stability,
                DEFAULT_TTS_CONFIG.elevenLabs.stability,
                0,
                1,
            ),
            similarityBoost: normalizeTtsNumber(
                value?.elevenLabs?.similarityBoost,
                DEFAULT_TTS_CONFIG.elevenLabs.similarityBoost,
                0,
                1,
            ),
            style: normalizeTtsNumber(
                value?.elevenLabs?.style,
                DEFAULT_TTS_CONFIG.elevenLabs.style,
                0,
                1,
            ),
            speed: normalizeTtsNumber(
                value?.elevenLabs?.speed,
                DEFAULT_TTS_CONFIG.elevenLabs.speed,
                0.7,
                1.2,
            ),
            useSpeakerBoost: value?.elevenLabs?.useSpeakerBoost === true,
        },
        voiceModify: value?.voiceModify === null
            ? undefined
            : (value?.voiceModify
                ? {
                    ...(DEFAULT_TTS_CONFIG.voiceModify || { pitch: 0, intensity: 0, timbre: 0 }),
                    ...value.voiceModify,
                }
                : DEFAULT_TTS_CONFIG.voiceModify),
    };
}

function normalizeSttConfig(value: Partial<SttConfig> | null | undefined): SttConfig {
    return {
        ...DEFAULT_STT_CONFIG,
        ...(value || {}),
        groqApiKey: normalizeString(value?.groqApiKey),
        siliconflowApiKey: normalizeString(value?.siliconflowApiKey),
        baseUrl: normalizeString(value?.baseUrl) || undefined,
        model: normalizeString(value?.model) || undefined,
        language: normalizeString(value?.language) || undefined,
        voiceCallManualSend: value?.voiceCallManualSend === true,
    };
}

function normalizeApiPreset(value: unknown): ApiPreset | null {
    if (!value || typeof value !== 'object') return null;

    const parsed = value as Partial<ApiPreset>;
    const id = normalizeString(parsed.id);
    const name = normalizeString(parsed.name);
    if (!id || !name) return null;

    return {
        id,
        name,
        config: normalizeApiConfig(parsed.config || {}, DEFAULT_RUNTIME_API_CONFIG),
    };
}

function normalizeCharacterRefinePrompt(value: unknown): CharacterRefinePromptConfig | null {
    if (!value || typeof value !== 'object') return null;

    const parsed = value as Partial<CharacterRefinePromptConfig>;
    const id = normalizeString(parsed.id);
    const name = normalizeString(parsed.name);
    const content = normalizeString(parsed.content);
    if (!id || !name || !content) return null;

    return {
        id,
        name,
        content,
    };
}

function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => normalizeString(item))
        .filter(Boolean);
}

function normalizeImageProviderType(value: unknown): ImageProviderType {
    const provider = normalizeString(value) as ImageProviderType;
    return IMAGE_PROVIDER_TYPES.includes(provider) ? provider : DEFAULT_IMAGE_GENERATION_CONFIG.activeProvider;
}

function normalizeImageGenerationStyle(value: unknown): ImageGenerationStyle {
    const style = normalizeString(value) as ImageGenerationStyle;
    return IMAGE_GENERATION_STYLES.includes(style) ? style : DEFAULT_IMAGE_GENERATION_CONFIG.imageStyle;
}

export function normalizePhotoStyleProviderScope(
    value: unknown,
    fallback: PhotoStyleProviderScope = 'novelai',
    hint: (Partial<PhotoStylePreset> & Record<string, unknown>) | null | undefined = undefined,
): PhotoStyleProviderScope {
    const scope = normalizeString(value).toLowerCase();
    if (scope === 'openai-gpt') return 'openai-gpt';
    if (scope === 'openai-gemini') return 'openai-gemini';
    if (scope === 'gemini' || scope === 'nano-banana' || scope === 'nano_banana') return 'openai-gemini';
    if (scope === 'openai-compatible' || scope === 'openai' || scope === 'gpt') {
        return getOpenAICompatibleStyleFamily(hint) === 'gemini' ? 'openai-gemini' : 'openai-gpt';
    }
    return PHOTO_STYLE_PROVIDER_SCOPES.includes(scope as PhotoStyleProviderScope) ? scope as PhotoStyleProviderScope : fallback;
}

function normalizeOpenAIImageResponseFormat(value: unknown): OpenAIImageResponseFormat {
    const format = normalizeString(value) as OpenAIImageResponseFormat;
    return OPENAI_IMAGE_RESPONSE_FORMATS.includes(format) ? format : DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.responseFormat;
}

function normalizeOpenAIImageQuality(value: unknown): OpenAIImageQuality {
    const quality = normalizeString(value) as OpenAIImageQuality;
    return OPENAI_IMAGE_QUALITIES.includes(quality) ? quality : DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.quality || '';
}

function normalizeOpenAIImageStyle(value: unknown): OpenAIImageStyle {
    const style = normalizeString(value) as OpenAIImageStyle;
    return OPENAI_IMAGE_STYLES.includes(style) ? style : DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.style || '';
}

function normalizeOpenAIImageBackground(value: unknown): OpenAIImageBackground {
    const background = normalizeString(value) as OpenAIImageBackground;
    return OPENAI_IMAGE_BACKGROUNDS.includes(background) ? background : DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.background || '';
}

function normalizeOpenAIImageOutputFormat(value: unknown): OpenAIImageOutputFormat {
    const format = normalizeString(value) as OpenAIImageOutputFormat;
    return OPENAI_IMAGE_OUTPUT_FORMATS.includes(format) ? format : DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.outputFormat || '';
}

function normalizeOpenAIImageModeration(value: unknown): OpenAIImageModeration {
    const moderation = normalizeString(value) as OpenAIImageModeration;
    return OPENAI_IMAGE_MODERATIONS.includes(moderation) ? moderation : DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.moderation || '';
}

export function normalizeOptionalOpenAIImageResponseFormat(value: unknown): OpenAIImageResponseFormat | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return normalizeOpenAIImageResponseFormat(value);
}

export function normalizeOptionalOpenAIImageQuality(value: unknown): OpenAIImageQuality | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const quality = normalizeOpenAIImageQuality(value);
    return quality || undefined;
}

export function normalizeOptionalOpenAIImageStyle(value: unknown): OpenAIImageStyle | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const style = normalizeOpenAIImageStyle(value);
    return style || undefined;
}

export function normalizeOptionalOpenAIImageBackground(value: unknown): OpenAIImageBackground | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const background = normalizeOpenAIImageBackground(value);
    return background || undefined;
}

export function normalizeOptionalOpenAIImageOutputFormat(value: unknown): OpenAIImageOutputFormat | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const format = normalizeOpenAIImageOutputFormat(value);
    return format || undefined;
}

export function normalizeOptionalOpenAIImageModeration(value: unknown): OpenAIImageModeration | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const moderation = normalizeOpenAIImageModeration(value);
    return moderation || undefined;
}

function normalizeNaiImageModel(value: unknown, fallback: NaiImageModel = DEFAULT_NOVELAI_IMAGE_CONFIG.model): NaiImageModel {
    const model = normalizeString(value) as NaiImageModel;
    return NAI_IMAGE_MODELS.includes(model) ? model : fallback;
}

function normalizeNaiOptionKey(value: string): string {
    return value
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/\+\+/g, 'pp')
        .replace(/[^a-z0-9]+/g, '');
}

function resolveNaiOptionAlias(value: unknown, options: NaiImageOption[]): string | undefined {
    const raw = normalizeString(value);
    if (!raw) return undefined;
    const key = normalizeNaiOptionKey(raw);

    for (const option of options) {
        const candidateKeys = [option.value, option.label, ...(option.aliases || [])].map(normalizeNaiOptionKey);
        if (candidateKeys.includes(key)) return option.value;
    }

    return undefined;
}

export function normalizeNaiSampler(value: unknown, fallback: string = DEFAULT_NOVELAI_IMAGE_CONFIG.sampler): string {
    return resolveNaiOptionAlias(value, NAI_IMAGE_SAMPLER_OPTIONS) || fallback;
}

export function normalizeNaiNoiseSchedule(value: unknown, fallback: string = DEFAULT_NOVELAI_IMAGE_CONFIG.noiseSchedule): string {
    return resolveNaiOptionAlias(value, NAI_IMAGE_NOISE_SCHEDULE_OPTIONS) || fallback;
}

export function normalizeOptionalNaiSampler(value: unknown): string | undefined {
    const raw = normalizeString(value);
    return raw ? resolveNaiOptionAlias(raw, NAI_IMAGE_SAMPLER_OPTIONS) : undefined;
}

export function normalizeOptionalNaiNoiseSchedule(value: unknown): string | undefined {
    const raw = normalizeString(value);
    return raw ? resolveNaiOptionAlias(raw, NAI_IMAGE_NOISE_SCHEDULE_OPTIONS) : undefined;
}

function normalizeImageNumber(value: unknown, fallback: number, min: number, max: number, step?: number): number {
    const numeric = typeof value === 'number'
        ? value
        : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
    if (!Number.isFinite(numeric)) return fallback;
    const clamped = Math.min(max, Math.max(min, numeric));
    return step ? Math.round(clamped / step) * step : clamped;
}

export function normalizeOpenAIImageSize(value: unknown, fallback = DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.size): string {
    const raw = normalizeString(value).replace(/[×]/g, 'x').replace(/\s+/g, '');
    if (!raw) return fallback;
    const match = raw.match(/^(\d{2,5})x(\d{2,5})$/i);
    if (!match) return raw.toLowerCase() === 'auto' ? 'auto' : raw;
    return `${Number(match[1])}x${Number(match[2])}`;
}

function normalizeNullableInteger(value: unknown, fallback: number | null, min: number, max: number): number | null {
    if (value === null || value === undefined || value === '') return fallback;
    const numeric = typeof value === 'number'
        ? value
        : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizeNovelAIImageConfig(value: Partial<NovelAIImageProviderConfig> | null | undefined): NovelAIImageProviderConfig {
    return {
        ...DEFAULT_NOVELAI_IMAGE_CONFIG,
        ...(value || {}),
        apiUrl: normalizeUrl(value?.apiUrl) || DEFAULT_NOVELAI_IMAGE_CONFIG.apiUrl,
        apiToken: normalizeString(value?.apiToken),
        model: normalizeNaiImageModel(value?.model),
        width: normalizeImageNumber(value?.width, DEFAULT_NOVELAI_IMAGE_CONFIG.width, 64, 1600, 64),
        height: normalizeImageNumber(value?.height, DEFAULT_NOVELAI_IMAGE_CONFIG.height, 64, 1600, 64),
        steps: normalizeImageNumber(value?.steps, DEFAULT_NOVELAI_IMAGE_CONFIG.steps, 1, 50),
        scale: normalizeImageNumber(value?.scale, DEFAULT_NOVELAI_IMAGE_CONFIG.scale, 0, 10),
        sampler: normalizeNaiSampler(value?.sampler),
        noiseSchedule: normalizeNaiNoiseSchedule(value?.noiseSchedule),
        qualityTags: normalizeString(value?.qualityTags) || DEFAULT_NOVELAI_IMAGE_CONFIG.qualityTags,
        negativePrompt: normalizeString(value?.negativePrompt) || DEFAULT_NOVELAI_IMAGE_CONFIG.negativePrompt,
    };
}

function normalizeOpenAICompatibleImageConfig(value: Partial<OpenAICompatibleImageProviderConfig> | null | undefined): OpenAICompatibleImageProviderConfig {
    const raw = (value || {}) as Partial<OpenAICompatibleImageProviderConfig> & Record<string, unknown>;
    return {
        ...DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG,
        ...raw,
        baseUrl: normalizeUrl(raw.baseUrl),
        apiKey: normalizeString(raw.apiKey),
        model: normalizeString(raw.model) || DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.model,
        size: normalizeOpenAIImageSize(raw.size),
        responseFormat: normalizeOpenAIImageResponseFormat(raw.responseFormat ?? raw.response_format),
        n: normalizeNullableInteger(raw.n, DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.n || null, 1, 10),
        quality: normalizeOpenAIImageQuality(raw.quality),
        style: normalizeOpenAIImageStyle(raw.style),
        background: normalizeOpenAIImageBackground(raw.background),
        outputFormat: normalizeOpenAIImageOutputFormat(raw.outputFormat ?? raw.output_format),
        outputCompression: normalizeNullableInteger(raw.outputCompression ?? raw.output_compression, DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.outputCompression || null, 0, 100),
        moderation: normalizeOpenAIImageModeration(raw.moderation),
        user: normalizeString(raw.user),
        stream: raw.stream === true,
        partialImages: normalizeNullableInteger(raw.partialImages ?? raw.partial_images, DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.partialImages || null, 1, 3),
        extraRequestBody: normalizeString(raw.extraRequestBody),
        qualityTags: normalizeString(raw.qualityTags) || DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.qualityTags,
        negativePrompt: normalizeString(raw.negativePrompt) || DEFAULT_OPENAI_COMPATIBLE_IMAGE_CONFIG.negativePrompt,
    };
}

function normalizeImageGenerationConfig(value: Partial<ImageGenerationConfig> | Partial<NovelAIImageProviderConfig> | null | undefined): ImageGenerationConfig {
    const raw = value && typeof value === 'object' ? value as any : {};
    const looksLikeLegacyNai = raw.apiUrl !== undefined || raw.apiToken !== undefined || raw.noiseSchedule !== undefined;

    return {
        activeProvider: normalizeImageProviderType(raw.activeProvider),
        imageStyle: normalizeImageGenerationStyle(raw.imageStyle),
        novelai: normalizeNovelAIImageConfig(looksLikeLegacyNai ? raw : raw.novelai),
        openaiCompatible: normalizeOpenAICompatibleImageConfig(raw.openaiCompatible),
    };
}

function normalizeImageApiPreset(value: unknown, index: number): ImageApiPreset | null {
    if (!value || typeof value !== 'object') return null;
    const parsed = value as Partial<ImageApiPreset>;
    const config = normalizeImageGenerationConfig(parsed.config);
    const id = normalizeString(parsed.id) || `image-api-preset-${index + 1}`;
    const now = Date.now();

    return {
        id,
        name: normalizeString(parsed.name) || `生图 API 预设 ${index + 1}`,
        config,
        createdAt: typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt) ? parsed.createdAt : now,
        updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : now,
    };
}

function normalizeImageApiPresets(value: unknown): ImageApiPreset[] {
    if (!Array.isArray(value)) return DEFAULT_IMAGE_API_PRESETS;
    return value
        .map(normalizeImageApiPreset)
        .filter((preset): preset is ImageApiPreset => Boolean(preset));
}

function normalizePhotoStylePreset(value: unknown, index: number): PhotoStylePreset | null {
    if (!value || typeof value !== 'object') return null;
    const parsed = value as Partial<PhotoStylePreset> & Record<string, unknown>;
    const positivePrompt = normalizeString(parsed.positivePrompt);
    if (!positivePrompt) return null;
    const n = parsed.n === undefined ? undefined : normalizeNullableInteger(parsed.n, null, 1, 10);
    const outputCompression = parsed.outputCompression === undefined && parsed.output_compression === undefined
        ? undefined
        : normalizeNullableInteger(parsed.outputCompression ?? parsed.output_compression, null, 0, 100);
    const partialImages = parsed.partialImages === undefined && parsed.partial_images === undefined
        ? undefined
        : normalizeNullableInteger(parsed.partialImages ?? parsed.partial_images, null, 1, 3);
    const rawStream = parsed.stream;

    return {
        id: normalizeString(parsed.id) || `style-${index + 1}`,
        name: normalizeString(parsed.name) || `风格 ${index + 1}`,
        providerScope: normalizePhotoStyleProviderScope(parsed.providerScope, 'novelai', parsed),
        positivePrompt,
        negativePrompt: normalizeString(parsed.negativePrompt),
        model: normalizeString(parsed.model) || undefined,
        width: parsed.width === undefined ? undefined : normalizeImageNumber(parsed.width, DEFAULT_NOVELAI_IMAGE_CONFIG.width, 64, 1600, 64),
        height: parsed.height === undefined ? undefined : normalizeImageNumber(parsed.height, DEFAULT_NOVELAI_IMAGE_CONFIG.height, 64, 1600, 64),
        steps: parsed.steps === undefined ? undefined : normalizeImageNumber(parsed.steps, DEFAULT_NOVELAI_IMAGE_CONFIG.steps, 1, 50),
        scale: parsed.scale === undefined ? undefined : normalizeImageNumber(parsed.scale, DEFAULT_NOVELAI_IMAGE_CONFIG.scale, 0, 10),
        sampler: normalizeOptionalNaiSampler(parsed.sampler),
        noiseSchedule: normalizeOptionalNaiNoiseSchedule(parsed.noiseSchedule),
        size: parsed.size === undefined ? undefined : normalizeOpenAIImageSize(parsed.size),
        responseFormat: normalizeOptionalOpenAIImageResponseFormat(parsed.responseFormat ?? parsed.response_format),
        n,
        quality: normalizeOptionalOpenAIImageQuality(parsed.quality),
        openAIStyle: normalizeOptionalOpenAIImageStyle(parsed.openAIStyle ?? parsed.openaiStyle ?? parsed.openai_style ?? parsed.style),
        background: normalizeOptionalOpenAIImageBackground(parsed.background),
        outputFormat: normalizeOptionalOpenAIImageOutputFormat(parsed.outputFormat ?? parsed.output_format),
        outputCompression,
        moderation: normalizeOptionalOpenAIImageModeration(parsed.moderation),
        user: parsed.user === undefined ? undefined : normalizeString(parsed.user),
        stream: typeof rawStream === 'boolean' ? rawStream : undefined,
        partialImages,
        extraRequestBody: parsed.extraRequestBody === undefined ? undefined : normalizeString(parsed.extraRequestBody),
    };
}

function normalizePhotoStylePresets(value: unknown): PhotoStylePreset[] {
    if (!Array.isArray(value)) return DEFAULT_PHOTO_STYLE_PRESETS;
    const normalized = value
        .map(normalizePhotoStylePreset)
        .filter((preset): preset is PhotoStylePreset => Boolean(preset));
    return normalized.length > 0 ? normalized : DEFAULT_PHOTO_STYLE_PRESETS;
}

function migratePhotoStylePresetsWithBuiltIns(presets: PhotoStylePreset[]): PhotoStylePreset[] {
    const migrated = presets
        .filter(preset => !RETIRED_DEFAULT_PHOTO_STYLE_PRESET_IDS.has(preset.id))
        .map(preset => {
            const builtIn = DEFAULT_PHOTO_STYLE_PRESET_BY_ID.get(preset.id);
            if (!builtIn) return preset;
            return {
                ...preset,
                providerScope: builtIn.providerScope,
                model: builtIn.model,
                size: builtIn.size,
            };
        });
    const existingIds = new Set(migrated.map(preset => preset.id));

    for (const preset of DEFAULT_PHOTO_STYLE_PRESETS) {
        if (!existingIds.has(preset.id)) {
            migrated.push(preset);
            existingIds.add(preset.id);
        }
    }

    return migrated;
}

function normalizeApiPresets(value: unknown): ApiPreset[] {
    if (!Array.isArray(value)) return [];
    return value
        .map(normalizeApiPreset)
        .filter((preset): preset is ApiPreset => Boolean(preset));
}

function normalizeSecondaryApiPool(value: unknown): SecondaryApiPoolEntry[] {
    if (!Array.isArray(value)) return [];

    const seenIds = new Set<string>();
    return value
        .map((item, index): SecondaryApiPoolEntry | null => {
            if (!item || typeof item !== 'object') return null;
            const parsed = item as Partial<SecondaryApiPoolEntry>;
            const config = normalizeApiConfig(parsed.config || {}, DEFAULT_RUNTIME_API_CONFIG);
            if (!hasCompleteApiConfig(config)) return null;

            let id = normalizeString(parsed.id) || `sub-${index + 1}`;
            while (seenIds.has(id)) {
                id = `${id}-${index + 1}`;
            }
            seenIds.add(id);

            return {
                id,
                name: normalizeString(parsed.name) || `副 API ${index + 1}`,
                enabled: parsed.enabled !== false,
                config,
            };
        })
        .filter((entry): entry is SecondaryApiPoolEntry => Boolean(entry));
}

function readSecondaryApiPoolState(): SecondaryApiPoolState {
    const value = readJsonValue<SecondaryApiPoolState>(SECONDARY_API_POOL_STATE_KEY);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function writeSecondaryApiPoolState(state: SecondaryApiPoolState): void {
    safeLocalStorageSet(SECONDARY_API_POOL_STATE_KEY, JSON.stringify(state));
}

function hasCompleteApiConfig(config?: APIConfig): config is APIConfig {
    return Boolean(config?.apiKey && config.baseUrl && config.model);
}

export function inferEmbeddingEngineId(modelId?: string | null): EmbeddingEngineId {
    const normalized = normalizeString(modelId).toLowerCase();
    return normalized.includes('qwen3-embedding') ? 'enhanced' : 'standard';
}

function getEmbeddingProviderDefaults(provider: EmbeddingProvider, modelId?: string): {
    baseUrl: string;
    model: string;
    rerankModel: string;
    dimensions?: number;
} {
    if (provider === 'openai') {
        return EMBEDDING_ENGINES[inferEmbeddingEngineId(modelId)];
    }

    return EMBEDDING_PROVIDER_DEFAULTS[provider];
}

function normalizeEmbeddingConfig(
    value: Partial<EmbeddingRuntimeConfig> | null | undefined,
): EmbeddingRuntimeConfig {
    const provider = normalizeEmbeddingProvider(value?.provider);
    const explicitModel = normalizeString(value?.model);
    const providerDefaults = getEmbeddingProviderDefaults(provider, explicitModel);

    return {
        provider,
        apiKey: normalizeString(value?.apiKey),
        baseUrl: normalizeUrl(value?.baseUrl) || providerDefaults.baseUrl,
        model: explicitModel || providerDefaults.model,
        rerankModel: providerDefaults.rerankModel,
        dimensions: providerDefaults.dimensions,
        rerankApiKey: normalizeString(value?.rerankApiKey),
        rerankUsePaid: value?.rerankUsePaid === true,
    };
}

export function getPrimaryApiConfig(): APIConfig {
    return normalizeApiConfig(readJsonValue<Partial<APIConfig>>(PRIMARY_API_CONFIG_KEY));
}

export function setPrimaryApiConfig(config: APIConfig): void {
    safeLocalStorageSet(PRIMARY_API_CONFIG_KEY, JSON.stringify(normalizeApiConfig(config)));
}

export function getAvailableModels(): string[] {
    return normalizeStringArray(readJsonValue<unknown>(AVAILABLE_MODELS_KEY));
}

export function setAvailableModels(models: string[]): void {
    safeLocalStorageSet(AVAILABLE_MODELS_KEY, JSON.stringify(normalizeStringArray(models)));
}

export function getApiPresets(): ApiPreset[] {
    return normalizeApiPresets(readJsonValue<unknown>(API_PRESETS_KEY));
}

export function setApiPresets(presets: ApiPreset[]): void {
    safeLocalStorageSet(API_PRESETS_KEY, JSON.stringify(normalizeApiPresets(presets)));
}

function readLegacySecondaryApiConfig(): APIConfig | undefined {
    const config = normalizeApiConfig({
        apiKey: safeLocalStorageGet(LEGACY_SUB_API_KEY) ?? undefined,
        baseUrl: safeLocalStorageGet(LEGACY_SUB_API_BASE_URL_KEY) ?? undefined,
        model: safeLocalStorageGet(LEGACY_SUB_API_MODEL_KEY) ?? undefined,
    });

    return hasCompleteApiConfig(config) ? config : undefined;
}

function writeSecondaryCompatConfig(config?: APIConfig): void {
    if (!config) {
        safeLocalStorageRemove(SECONDARY_API_CONFIG_KEY);
        safeLocalStorageRemove(LEGACY_SUB_API_KEY);
        safeLocalStorageRemove(LEGACY_SUB_API_BASE_URL_KEY);
        safeLocalStorageRemove(LEGACY_SUB_API_MODEL_KEY);
        return;
    }

    const normalized = normalizeApiConfig(config);
    safeLocalStorageSet(SECONDARY_API_CONFIG_KEY, JSON.stringify(normalized));
    safeLocalStorageSet(LEGACY_SUB_API_KEY, normalized.apiKey);
    safeLocalStorageSet(LEGACY_SUB_API_BASE_URL_KEY, normalized.baseUrl);
    safeLocalStorageSet(LEGACY_SUB_API_MODEL_KEY, normalized.model);
}

function buildLegacySecondaryPoolEntry(config: APIConfig): SecondaryApiPoolEntry {
    return {
        id: 'secondary-default',
        name: '副 API 1',
        enabled: true,
        config,
    };
}

export function getSecondaryApiPool(): SecondaryApiPoolEntry[] {
    const rawPool = readJsonValue<unknown>(SECONDARY_API_POOL_KEY);
    const pool = normalizeSecondaryApiPool(rawPool);
    if (pool.length > 0 || Array.isArray(rawPool)) {
        return pool;
    }

    const structured = normalizeApiConfig(readJsonValue<Partial<APIConfig>>(SECONDARY_API_CONFIG_KEY));
    if (hasCompleteApiConfig(structured)) {
        return [buildLegacySecondaryPoolEntry(structured)];
    }

    const legacy = readLegacySecondaryApiConfig();
    return legacy ? [buildLegacySecondaryPoolEntry(legacy)] : [];
}

export function getSecondaryApiPoolWithStatus(): SecondaryApiPoolEntryWithStatus[] {
    const state = readSecondaryApiPoolState();
    return getSecondaryApiPool().map(entry => ({
        ...entry,
        cooldownUntil: state[entry.id]?.cooldownUntil,
        lastError: state[entry.id]?.lastError,
        lastUsedAt: state[entry.id]?.lastUsedAt,
    }));
}

export function setSecondaryApiPool(entries: SecondaryApiPoolEntry[]): void {
    const normalized = normalizeSecondaryApiPool(entries);
    if (normalized.length === 0) {
        safeLocalStorageRemove(SECONDARY_API_POOL_KEY);
        safeLocalStorageRemove(SECONDARY_API_POOL_STATE_KEY);
        safeLocalStorageRemove(SECONDARY_API_POOL_CURSOR_KEY);
        writeSecondaryCompatConfig(undefined);
        return;
    }

    safeLocalStorageSet(SECONDARY_API_POOL_KEY, JSON.stringify(normalized));

    const validIds = new Set(normalized.map(entry => entry.id));
    const existingState = readSecondaryApiPoolState();
    const nextState: SecondaryApiPoolState = {};
    for (const id of validIds) {
        if (existingState[id]) nextState[id] = existingState[id];
    }
    writeSecondaryApiPoolState(nextState);

    const firstEnabled = normalized.find(entry => entry.enabled) || normalized[0];
    writeSecondaryCompatConfig(firstEnabled.config);
}

function getRetryableStatus(error: unknown): number | null {
    const anyError = error as { status?: unknown; name?: unknown; message?: unknown };
    if (typeof anyError?.status === 'number') return anyError.status;

    const message = String(anyError?.message || error || '');
    const match = message.match(/\b(?:HTTP|API|status)\s*(429|408|500|502|503|504)\b/i)
        || message.match(/\b(429|408|500|502|503|504)\b/);
    return match ? Number(match[1]) : null;
}

export function isSecondaryApiRetryableError(error: unknown): boolean {
    const anyError = error as { name?: unknown; message?: unknown };
    const status = getRetryableStatus(error);
    if (status === 429 || status === 408 || (status !== null && status >= 500 && status < 600)) return true;

    const name = String(anyError?.name || '');
    const message = String(anyError?.message || error || '');
    return /abort|timeout|network|failed to fetch/i.test(`${name} ${message}`);
}

function findSecondaryApiPoolEntryByConfig(config: APIConfig): SecondaryApiPoolEntry | undefined {
    const normalized = normalizeApiConfig(config);
    return getSecondaryApiPool().find(entry =>
        entry.config.baseUrl === normalized.baseUrl
        && entry.config.apiKey === normalized.apiKey
        && entry.config.model === normalized.model
    );
}

export function markSecondaryApiConfigSuccess(config: APIConfig): void {
    const entry = findSecondaryApiPoolEntryByConfig(config);
    if (!entry) return;

    const state = readSecondaryApiPoolState();
    state[entry.id] = {
        ...state[entry.id],
        cooldownUntil: undefined,
        lastError: undefined,
        lastUsedAt: Date.now(),
    };
    writeSecondaryApiPoolState(state);
}

export function markSecondaryApiConfigFailure(config: APIConfig, error: unknown): void {
    const entry = findSecondaryApiPoolEntryByConfig(config);
    if (!entry) return;

    const now = Date.now();
    const message = String((error as { message?: unknown })?.message || error || '请求失败').slice(0, 160);
    const retryable = isSecondaryApiRetryableError(error);
    const state = readSecondaryApiPoolState();
    state[entry.id] = {
        ...state[entry.id],
        cooldownUntil: retryable ? now + SECONDARY_API_RETRY_COOLDOWN_MS : state[entry.id]?.cooldownUntil,
        lastError: message,
        lastUsedAt: state[entry.id]?.lastUsedAt,
    };
    writeSecondaryApiPoolState(state);
}

export function getSecondaryApiConfig(): APIConfig | undefined {
    const pool = getSecondaryApiPool().filter(entry => entry.enabled);
    if (pool.length === 0) return undefined;

    const now = Date.now();
    const state = readSecondaryApiPoolState();
    const candidates = pool.filter(entry => {
        const cooldownUntil = state[entry.id]?.cooldownUntil || 0;
        return cooldownUntil <= now;
    });
    if (candidates.length === 0) return undefined;

    return candidates[0].config;
}

export function selectSecondaryApiConfig(): APIConfig | undefined {
    const pool = getSecondaryApiPool().filter(entry => entry.enabled);
    if (pool.length === 0) return undefined;

    const now = Date.now();
    const state = readSecondaryApiPoolState();
    const candidates = pool.filter(entry => {
        const cooldownUntil = state[entry.id]?.cooldownUntil || 0;
        return cooldownUntil <= now;
    });
    if (candidates.length === 0) return undefined;

    const cursorRaw = Number(safeLocalStorageGet(SECONDARY_API_POOL_CURSOR_KEY) || '0');
    const cursor = Number.isFinite(cursorRaw) && cursorRaw >= 0 ? cursorRaw : 0;
    const selected = candidates[cursor % candidates.length];
    safeLocalStorageSet(SECONDARY_API_POOL_CURSOR_KEY, String((cursor + 1) % candidates.length));

    state[selected.id] = {
        ...state[selected.id],
        lastUsedAt: now,
    };
    writeSecondaryApiPoolState(state);

    return selected.config;
}

export function setSecondaryApiConfig(config?: APIConfig | null): void {
    if (!config) {
        setSecondaryApiPool([]);
        return;
    }

    const normalized = normalizeApiConfig(config);
    setSecondaryApiPool([buildLegacySecondaryPoolEntry(normalized)]);
}

export function getRealtimeConfig(): RealtimeConfig {
    return normalizeRealtimeConfig(readJsonValue<Partial<RealtimeConfig>>(REALTIME_CONFIG_KEY));
}

export function setRealtimeConfig(config: RealtimeConfig): void {
    safeLocalStorageSet(REALTIME_CONFIG_KEY, JSON.stringify(normalizeRealtimeConfig(config)));
}

export function getTtsConfig(): TtsConfig {
    return normalizeTtsConfig(readJsonValue<Partial<TtsConfig>>(TTS_CONFIG_KEY));
}

export function setTtsConfig(config: TtsConfig): void {
    safeLocalStorageSet(TTS_CONFIG_KEY, JSON.stringify(normalizeTtsConfig(config)));
}

export function getSttConfig(): SttConfig {
    return normalizeSttConfig(readJsonValue<Partial<SttConfig>>(STT_CONFIG_KEY));
}

export function setSttConfig(config: SttConfig): void {
    safeLocalStorageSet(STT_CONFIG_KEY, JSON.stringify(normalizeSttConfig(config)));
}

export function getImageGenerationConfig(): ImageGenerationConfig {
    return normalizeImageGenerationConfig(readJsonValue<Partial<ImageGenerationConfig>>(IMAGE_GENERATION_CONFIG_KEY));
}

export function setImageGenerationConfig(config: ImageGenerationConfig): void {
    safeLocalStorageSet(IMAGE_GENERATION_CONFIG_KEY, JSON.stringify(normalizeImageGenerationConfig(config)));
}

export function getImageGenerationDraftConfig(): ImageGenerationConfig | null {
    const raw = readJsonValue<Partial<ImageGenerationConfig>>(IMAGE_GENERATION_DRAFT_CONFIG_KEY);
    return raw ? normalizeImageGenerationConfig(raw) : null;
}

export function setImageGenerationDraftConfig(config: ImageGenerationConfig): void {
    safeLocalStorageSet(IMAGE_GENERATION_DRAFT_CONFIG_KEY, JSON.stringify(normalizeImageGenerationConfig(config)));
}

export function clearImageGenerationDraftConfig(): void {
    safeLocalStorageRemove(IMAGE_GENERATION_DRAFT_CONFIG_KEY);
}

export function getImageApiPresets(): ImageApiPreset[] {
    return normalizeImageApiPresets(readJsonValue<unknown>(IMAGE_API_PRESETS_KEY));
}

export function setImageApiPresets(presets: ImageApiPreset[]): void {
    safeLocalStorageSet(IMAGE_API_PRESETS_KEY, JSON.stringify(normalizeImageApiPresets(presets)));
}

export function getPhotoStylePresets(): PhotoStylePreset[] {
    const raw = readJsonValue<unknown>(PHOTO_STYLE_PRESETS_KEY);
    const normalized = normalizePhotoStylePresets(raw);
    if (
        !Array.isArray(raw)
        || safeLocalStorageGet(PHOTO_STYLE_PRESETS_MIGRATION_KEY) === PHOTO_STYLE_PRESETS_MIGRATION_VERSION
    ) {
        return normalized;
    }

    const migrated = migratePhotoStylePresetsWithBuiltIns(normalized);
    safeLocalStorageSet(PHOTO_STYLE_PRESETS_KEY, JSON.stringify(migrated));
    safeLocalStorageSet(PHOTO_STYLE_PRESETS_MIGRATION_KEY, PHOTO_STYLE_PRESETS_MIGRATION_VERSION);
    return migrated;
}

export function setPhotoStylePresets(presets: PhotoStylePreset[]): void {
    safeLocalStorageSet(PHOTO_STYLE_PRESETS_KEY, JSON.stringify(normalizePhotoStylePresets(presets)));
}

export function getEmbeddingConfig(): EmbeddingRuntimeConfig {
    return normalizeEmbeddingConfig({
        provider: (safeLocalStorageGet(EMBEDDING_PROVIDER_KEY) as EmbeddingProvider | null) ?? undefined,
        apiKey: safeLocalStorageGet(EMBEDDING_API_KEY_KEY) ?? undefined,
        baseUrl: safeLocalStorageGet(EMBEDDING_BASE_URL_KEY) ?? undefined,
        model: safeLocalStorageGet(EMBEDDING_MODEL_KEY) ?? undefined,
        rerankApiKey: safeLocalStorageGet(RERANK_API_KEY_KEY) ?? undefined,
        rerankUsePaid: safeLocalStorageGet(RERANK_USE_PAID_KEY) === 'true',
    });
}

export function setEmbeddingConfig(config: EmbeddingRuntimeConfig): void {
    const normalized = normalizeEmbeddingConfig(config);

    safeLocalStorageSet(EMBEDDING_PROVIDER_KEY, normalized.provider);
    safeLocalStorageSet(EMBEDDING_BASE_URL_KEY, normalized.baseUrl);
    safeLocalStorageSet(EMBEDDING_MODEL_KEY, normalized.model);
    safeLocalStorageSet(RERANK_USE_PAID_KEY, normalized.rerankUsePaid ? 'true' : 'false');

    if (normalized.apiKey) {
        safeLocalStorageSet(EMBEDDING_API_KEY_KEY, normalized.apiKey);
    } else {
        safeLocalStorageRemove(EMBEDDING_API_KEY_KEY);
    }

    if (normalized.rerankApiKey) {
        safeLocalStorageSet(RERANK_API_KEY_KEY, normalized.rerankApiKey);
    } else {
        safeLocalStorageRemove(RERANK_API_KEY_KEY);
    }
}

export function getCharacterRefinePrompts(): CharacterRefinePromptConfig[] {
    const prompts = readJsonValue<unknown>(CHARACTER_REFINE_PROMPTS_KEY);
    if (!Array.isArray(prompts)) return [];

    return prompts
        .map(normalizeCharacterRefinePrompt)
        .filter((prompt): prompt is CharacterRefinePromptConfig => Boolean(prompt))
        .filter((prompt) => !prompt.id.startsWith('refine_'));
}

export function getBackendRuntimeConfig(): BackendRuntimeConfig {
    return {
        backendUrl: getBackendUrl(),
        backendToken: getBackendToken(),
        frontendOrigin: getFrontendOrigin(),
        ttsWsProxyUrl: getTtsWsProxyUrl(),
        userId: getUserId(),
        resolutionDebug: getBackendResolutionDebug(),
    };
}

export function hasCloudSyncTarget(): boolean {
    const backend = getBackendRuntimeConfig();
    return Boolean(backend.backendUrl && backend.backendToken);
}

export function getRuntimeConfigSnapshot(): RuntimeConfigSnapshot {
    return {
        backend: getBackendRuntimeConfig(),
        api: {
            primary: getPrimaryApiConfig(),
            secondary: getSecondaryApiConfig(),
            secondaryPool: getSecondaryApiPool(),
            availableModels: getAvailableModels(),
            presets: getApiPresets(),
        },
        realtime: getRealtimeConfig(),
        tts: getTtsConfig(),
        stt: getSttConfig(),
        imageGeneration: {
            config: getImageGenerationConfig(),
            apiPresets: getImageApiPresets(),
            stylePresets: getPhotoStylePresets(),
        },
        embedding: getEmbeddingConfig(),
    };
}
