import type { Message } from './chat';
import type { CharacterProfile } from './character';
import type { UserProfile } from './core';

export type ImageProviderType = 'novelai' | 'openai-compatible';
export type ImageGenerationStyle = 'guoman' | 'cg' | 'real';
export type OpenAICompatibleStyleFamily = 'gpt' | 'gemini';
export type PhotoStyleProviderScope = 'all' | 'novelai' | 'openai-gpt' | 'openai-gemini';
export type OpenAIImageResponseFormat = 'auto' | 'b64_json' | 'url';
export type OpenAIImageQuality = '' | 'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd';
export type OpenAIImageStyle = '' | 'vivid' | 'natural';
export type OpenAIImageBackground = '' | 'auto' | 'transparent' | 'opaque';
export type OpenAIImageOutputFormat = '' | 'png' | 'jpeg' | 'webp';
export type OpenAIImageModeration = '' | 'auto' | 'low';
export type ManualPhotoMode = 'direct' | 'story';

export type NaiImageModel =
    | 'nai-diffusion-4-5-full'
    | 'nai-diffusion-4-5-curated'
    | 'nai-diffusion-4-full'
    | 'nai-diffusion-4-curated-preview'
    | 'nai-diffusion-3'
    | 'nai-diffusion-furry-3';

export interface NovelAIImageProviderConfig {
    apiUrl: string;
    apiToken: string;
    model: NaiImageModel;
    width: number;
    height: number;
    steps: number;
    scale: number;
    sampler: string;
    noiseSchedule: string;
    qualityTags: string;
    negativePrompt: string;
}

export interface OpenAICompatibleImageProviderConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    size: string;
    responseFormat: OpenAIImageResponseFormat;
    n?: number | null;
    quality?: OpenAIImageQuality;
    style?: OpenAIImageStyle;
    background?: OpenAIImageBackground;
    outputFormat?: OpenAIImageOutputFormat;
    outputCompression?: number | null;
    moderation?: OpenAIImageModeration;
    user?: string;
    stream?: boolean;
    partialImages?: number | null;
    extraRequestBody?: string;
    qualityTags: string;
    negativePrompt: string;
}

export interface ImageGenerationConfig {
    activeProvider: ImageProviderType;
    imageStyle: ImageGenerationStyle;
    novelai: NovelAIImageProviderConfig;
    openaiCompatible: OpenAICompatibleImageProviderConfig;
}

export interface ImageApiPreset {
    id: string;
    name: string;
    config: ImageGenerationConfig;
    createdAt: number;
    updatedAt: number;
}

export interface PhotoStylePreset {
    id: string;
    name: string;
    providerScope: PhotoStyleProviderScope;
    positivePrompt: string;
    negativePrompt: string;
    model?: string;
    width?: number;
    height?: number;
    steps?: number;
    scale?: number;
    sampler?: string;
    noiseSchedule?: string;
    size?: string;
    responseFormat?: OpenAIImageResponseFormat;
    n?: number | null;
    quality?: OpenAIImageQuality;
    openAIStyle?: OpenAIImageStyle;
    background?: OpenAIImageBackground;
    outputFormat?: OpenAIImageOutputFormat;
    outputCompression?: number | null;
    moderation?: OpenAIImageModeration;
    user?: string;
    stream?: boolean;
    partialImages?: number | null;
    extraRequestBody?: string;
}

export interface PhotoHint {
    type: 'photo_hint';
    strength: number;
    anchor_text: string;
    share_intent: string;
    must_keep: string[];
    must_avoid: string[];
}

export type PhotoIntent =
    | 'selfie'
    | 'daily_photo'
    | 'date_scene'
    | 'item_photo'
    | 'background'
    | 'portrait'
    | 'half_body'
    | 'full_body';

export interface PhotoDirectorResult {
    shouldGeneratePhoto: boolean;
    caption: string;
    scene_zh: string;
    camera: string;
    mood: string;
    stylePresetId: string;
    continuity_summary: string;
    intent?: PhotoIntent;
    subject_tags?: string;
    expression_tags?: string;
    pose_tags?: string;
    clothing_tags?: string;
    scene_tags?: string;
    camera_tags?: string;
    mood_tags?: string;
    dynamic_negative?: string;
}

export interface PhotoPromptBundle {
    positivePrompt: string;
    negativePrompt: string;
    finalPrompt: string;
}

export interface PhotoMeta {
    source: 'manual' | 'chat_auto';
    providerType: ImageProviderType;
    photoHint?: PhotoHint;
    directorResult?: PhotoDirectorResult;
    stylePresetId: string;
    model: string;
    naiModel?: NaiImageModel;
    positivePrompt: string;
    negativePrompt: string;
    finalPrompt: string;
    width: number;
    height: number;
    size?: string;
    steps?: number;
    scale?: number;
    sampler?: string;
    noiseSchedule?: string;
    responseFormat?: OpenAIImageResponseFormat;
    n?: number | null;
    quality?: OpenAIImageQuality;
    openAIStyle?: OpenAIImageStyle;
    background?: OpenAIImageBackground;
    outputFormat?: OpenAIImageOutputFormat;
    outputCompression?: number | null;
    moderation?: OpenAIImageModeration;
    user?: string;
    stream?: boolean;
    partialImages?: number | null;
    extraRequestBody?: string;
    seed: number;
    continuity_summary?: string;
}

export interface EncodedVibeReference {
    encodedReference: string;
    strength: number;
    informationExtracted: number;
}

export interface VibeReferenceInput {
    id: string;
    name: string;
    previewUrl?: string;
    imageDataUrl?: string;
    savedVibeId?: string;
    encodedReference?: string;
    strength: number;
    informationExtracted: number;
}

export interface SavedVibeEncoding {
    model: string;
    informationExtracted: number;
    encodedReference: string;
    updatedAt: number;
}

export interface SavedVibeReference {
    id: string;
    name: string;
    previewUrl?: string;
    imageDataUrl?: string;
    defaultStrength: number;
    defaultInformationExtracted: number;
    encodings: Record<string, SavedVibeEncoding>;
    source: 'image' | 'naiv4vibe';
    importedFileName?: string;
    createdAt: number;
    updatedAt: number;
}

export interface PhotoGenerationOptions {
    vibeReferences?: VibeReferenceInput[];
    onVibeReferenceEncoded?: (reference: VibeReferenceInput, encoding: SavedVibeEncoding) => void | Promise<void>;
}

export type ExtractedImage =
    | { kind: 'url'; url: string }
    | { kind: 'base64'; base64: string; mimeType: string }
    | { kind: 'dataUrl'; dataUrl: string; mimeType: string };

export interface PhotoAsset {
    id: string;
    thumbUrl: string;
    displayUrl: string;
    originalKind: ExtractedImage['kind'];
    mimeType?: string;
    width?: number;
    height?: number;
    createdAt: number;
    originalAssetId?: string;
}

export interface ManualPhotoGenerationOptions {
    mode?: ManualPhotoMode;
    useAppearance?: boolean;
    useUserAppearance?: boolean;
    appearanceTags?: string;
    appearanceNegativeTags?: string;
    userAppearanceTags?: string;
    userAppearanceNegativeTags?: string;
    appearancePrompt?: string;
    userAppearancePrompt?: string;
}

export interface PhotoHintTrigger {
    char: CharacterProfile;
    userProfile: UserProfile;
    currentMsgs: Message[];
    aiReply: string;
    thinking?: string;
    hint: PhotoHint;
    sourceMessageId?: number;
    contextOptions?: unknown;
}

export interface GalleryPhotoMetaRecord {
    photoMeta?: PhotoMeta;
}
