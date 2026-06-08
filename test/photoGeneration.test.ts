// @vitest-environment jsdom
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildPhotoHintFromDecision,
    buildPhotoContextSummary,
    buildPhotoPromptFromDirector,
    buildManualPhotoPrompt,
    createPhotoMeta,
    extractGeneratedImage,
    extractPhotoDecision,
    extractPhotoHint,
    generatePhotoImage,
    getCompatiblePhotoStylePresets,
    inferExplicitPhotoDecisionFromConversation,
    inferExplicitPhotoHintFromConversation,
    NO_PHOTO_STYLE_PRESET,
    NO_PHOTO_STYLE_PRESET_ID,
    parsePhotoStylePaste,
    PHOTO_DIRECTOR_TIMEOUT_MS,
    resolveImageStylePhotoPreset,
    resolvePhotoStylePreset,
    runManualPhotoDirector,
    runPhotoDirector,
    shouldIncludeUserAppearanceForPhoto,
    testOpenAICompatibleImageConnection,
} from '../utils/photoGeneration';
import {
    getImageGenerationConfig,
    getPhotoStylePresets,
    IMAGE_GENERATION_CONFIG_KEY,
    PHOTO_STYLE_PRESETS_KEY,
} from '../utils/runtimeConfig';
import type { APIConfig, CharacterProfile, ImageGenerationConfig, PhotoMeta, PhotoStylePreset, UserProfile } from '../types';

const baseConfig: ImageGenerationConfig = {
    activeProvider: 'novelai',
    imageStyle: 'guoman',
    novelai: {
        apiUrl: 'https://image.novelai.net',
        apiToken: 'token',
        model: 'nai-diffusion-4-full',
        width: 832,
        height: 1216,
        steps: 28,
        scale: 5,
        sampler: 'k_euler',
        noiseSchedule: 'native',
        negativePrompt: 'lowres, blurry',
        qualityTags: 'best quality, amazing quality',
    },
    openaiCompatible: {
        baseUrl: 'https://imagegen.example/v1',
        apiKey: 'key',
        model: 'image2',
        size: '1024x1024',
        responseFormat: 'auto',
        negativePrompt: 'low quality, watermark',
        qualityTags: 'high quality',
    },
};

const style: PhotoStylePreset = {
    id: 'soft',
    name: 'Soft',
    providerScope: 'novelai',
    positivePrompt: 'warm light, best quality',
    negativePrompt: 'bad hands, lowres',
};

const directorApiConfig: APIConfig = {
    baseUrl: 'https://llm.example/v1',
    apiKey: 'key',
    model: 'director-model',
};

const directorChar = {
    id: 'char-1',
    name: 'Sully',
    avatar: '',
    description: 'gentle companion',
    systemPrompt: 'keep the visual identity stable',
    memories: [],
} as CharacterProfile;

const directorUser: UserProfile = {
    name: 'User',
    avatar: '',
    bio: '',
};

const naiMeta: PhotoMeta = {
    source: 'manual',
    providerType: 'novelai',
    stylePresetId: 'soft',
    model: 'nai-diffusion-4-full',
    naiModel: 'nai-diffusion-4-full',
    positivePrompt: 'prompt',
    negativePrompt: 'bad',
    finalPrompt: 'prompt',
    width: 832,
    height: 1216,
    steps: 28,
    scale: 5,
    sampler: 'k_euler',
    noiseSchedule: 'native',
    seed: 1,
};

const openAICompatibleMeta: PhotoMeta = {
    source: 'manual',
    providerType: 'openai-compatible',
    stylePresetId: 'compat',
    model: 'image2',
    positivePrompt: 'prompt',
    negativePrompt: 'bad',
    finalPrompt: 'prompt\n避免出现：bad',
    width: 1024,
    height: 1024,
    size: '1024x1024',
    seed: 1,
};

async function createNaiZipResponse(): Promise<Response> {
    const zip = new JSZip();
    zip.file('image.png', new Uint8Array([1, 2, 3]));
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    return new Response(buffer, { status: 200, headers: { 'Content-Type': 'application/zip' } });
}

describe('photoGeneration helpers', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('extracts and removes a main-model photo hint tag', () => {
        const result = extractPhotoHint('今晚月色很好。[[PHOTO_HINT: {"type":"photo_hint","strength":1.4,"anchor_text":"窗边的月光","share_intent":"想把这一刻分享给用户","must_keep":["月光","月光","窗边"],"must_avoid":["多人"]}]]');

        expect(result.content).toBe('今晚月色很好。');
        expect(result.hint).toMatchObject({
            type: 'photo_hint',
            strength: 1,
            anchor_text: '窗边的月光',
            share_intent: '想把这一刻分享给用户',
            must_keep: ['月光', '月光', '窗边'],
            must_avoid: ['多人'],
        });
    });

    it('extracts a hint even when the reply contains only the internal tag', () => {
        const result = extractPhotoHint('[[PHOTO_HINT: {"type":"photo_hint","strength":0.9,"anchor_text":"给你看窗边的月光","share_intent":"用户想看画面","must_keep":["月光"],"must_avoid":[]}]]');

        expect(result.content).toBe('');
        expect(result.hint).toMatchObject({
            strength: 0.9,
            anchor_text: '给你看窗边的月光',
        });
    });

    it('extracts and strips a malformed multiline photo hint leak', () => {
        const result = extractPhotoHint([
            '可能是我刚才网络不好没发出去。',
            '[[PHOTO_HINT:',
            '{"type":"photo_hint","strength":0.85,"anchor_text":"随便拍的，凑合看吧","share_intent":"满足想看照片的愿望","must_keep":["祁寒川","在家休闲装","随意感"],"must_avoid":["过于正式","严肃"]]]',
            '现在能看到了吗？',
        ].join('\n'));

        expect(result.content).toBe('可能是我刚才网络不好没发出去。\n现在能看到了吗？');
        expect(result.hint).toMatchObject({
            strength: 0.85,
            anchor_text: '随便拍的，凑合看吧',
            must_keep: ['祁寒川', '在家休闲装', '随意感'],
        });
    });

    it('extracts and removes a simple PHOTO_DECISION true tag', () => {
        const result = extractPhotoDecision('等我一下。[[PHOTO_DECISION:true]]');

        expect(result.content).toBe('等我一下。');
        expect(result.shouldGeneratePhoto).toBe(true);
    });

    it('loosely extracts localized PHOTO_DECISION values', () => {
        const trueResult = extractPhotoDecision('给你看看。【PHOTO_DECISION：是】');
        const falseResult = extractPhotoDecision('先不发。[PHOTO_DECISION: 不发]');

        expect(trueResult.content).toBe('给你看看。');
        expect(trueResult.shouldGeneratePhoto).toBe(true);
        expect(falseResult.content).toBe('先不发。');
        expect(falseResult.shouldGeneratePhoto).toBe(false);
    });

    it('infers a high-strength photo hint when the user explicitly asks for a resend', () => {
        const hint = inferExplicitPhotoHintFromConversation(
            '再发一次嘛',
            '现在看到了没？没看到我可不发第三次了。',
            '看不到照片\n再发一次嘛',
        );

        expect(hint).toMatchObject({
            type: 'photo_hint',
            strength: 0.95,
            anchor_text: '再发一次嘛',
            share_intent: '用户明确要求发送或生成一张图片',
            must_keep: ['再发一次嘛'],
        });
    });

    it('infers a photo decision for explicit requests without building a director', () => {
        expect(inferExplicitPhotoDecisionFromConversation(
            '来张自拍',
            '等我一下。',
            '来张自拍',
        )).toBe(true);
        expect(inferExplicitPhotoDecisionFromConversation(
            '那算了，先睡觉吧',
            '好，陪你安静一会儿。',
            '能发一张照片吗\n那算了，先睡觉吧',
        )).toBe(false);
    });

    it('builds a lightweight hint from PHOTO_DECISION for Photo Director only', () => {
        const hint = buildPhotoHintFromDecision('来张自拍', '等我一下，给你看看。');

        expect(hint).toMatchObject({
            type: 'photo_hint',
            strength: 0.95,
            anchor_text: '等我一下，给你看看。',
            share_intent: '主模型判断本轮应该发送一张图片',
            must_keep: [],
            must_avoid: [],
        });
    });

    it('does not infer a photo hint for unrelated chat in a previous photo thread', () => {
        const hint = inferExplicitPhotoHintFromConversation(
            '那算了，先睡觉吧',
            '好，陪你安静一会儿。',
            '能发一张照片吗\n那算了，先睡觉吧',
        );

        expect(hint).toBeNull();
    });

    it('infers a photo hint for short Chinese photo requests', () => {
        const hint = inferExplicitPhotoHintFromConversation(
            '来张自拍',
            '等我一下。',
            '来张自拍',
        );

        expect(hint).toMatchObject({
            strength: 0.9,
            anchor_text: '来张自拍',
            share_intent: '用户明确要求发送或生成一张图片',
        });
    });

    it('infers a photo hint for urgent follow-up in a photo request thread', () => {
        const hint = inferExplicitPhotoHintFromConversation(
            '我真的很需要',
            '别急，我在找。',
            '想要你的自拍\n我真的很需要',
        );

        expect(hint).toMatchObject({
            strength: 0.9,
            anchor_text: '我真的很需要',
            share_intent: '用户明确要求发送或生成一张图片',
        });
    });

    it('migrates legacy flat NovelAI config into the new provider shape', () => {
        localStorage.setItem(IMAGE_GENERATION_CONFIG_KEY, JSON.stringify({
            apiUrl: 'https://legacy.example',
            apiToken: 'legacy-token',
            model: 'nai-diffusion-4-full',
            width: 768,
            height: 1024,
            steps: 30,
            scale: 6,
            sampler: 'k_euler',
            noiseSchedule: 'native',
            qualityTags: 'best',
            negativePrompt: 'bad',
        }));

        const config = getImageGenerationConfig();

        expect(config.activeProvider).toBe('novelai');
        expect(config.imageStyle).toBe('guoman');
        expect(config.novelai.apiUrl).toBe('https://legacy.example');
        expect(config.novelai.apiToken).toBe('legacy-token');
        expect(config.novelai.model).toBe('nai-diffusion-4-full');
        expect(config.openaiCompatible.size).toBe('1024x1024');
    });

    it('normalizes the global image style setting', () => {
        localStorage.setItem(IMAGE_GENERATION_CONFIG_KEY, JSON.stringify({
            imageStyle: 'real',
        }));

        expect(getImageGenerationConfig().imageStyle).toBe('real');

        localStorage.setItem(IMAGE_GENERATION_CONFIG_KEY, JSON.stringify({
            imageStyle: 'unknown',
        }));

        expect(getImageGenerationConfig().imageStyle).toBe('guoman');
    });

    it('normalizes NovelAI sampler and schedule aliases', () => {
        localStorage.setItem(IMAGE_GENERATION_CONFIG_KEY, JSON.stringify({
            novelai: {
                sampler: 'k_dpm++ 2m',
                noiseSchedule: 'Poly Exponential',
            },
        }));

        const config = getImageGenerationConfig();

        expect(config.novelai.sampler).toBe('k_dpmpp_2m');
        expect(config.novelai.noiseSchedule).toBe('polyexponential');
    });

    it('keeps OpenAI-compatible advanced image params and snake_case aliases', () => {
        localStorage.setItem(IMAGE_GENERATION_CONFIG_KEY, JSON.stringify({
            activeProvider: 'openai-compatible',
            openaiCompatible: {
                baseUrl: 'https://imagegen.example/v1',
                apiKey: 'key',
                model: 'gpt-image-1',
                size: 'auto',
                response_format: 'url',
                n: 2,
                quality: 'high',
                style: 'natural',
                background: 'transparent',
                output_format: 'webp',
                output_compression: 72,
                moderation: 'low',
                user: 'user-1',
                stream: true,
                partial_images: 2,
                extraRequestBody: '{"seed":1234}',
            },
        }));

        const config = getImageGenerationConfig();

        expect(config.openaiCompatible).toMatchObject({
            size: 'auto',
            responseFormat: 'url',
            n: 2,
            quality: 'high',
            style: 'natural',
            background: 'transparent',
            outputFormat: 'webp',
            outputCompression: 72,
            moderation: 'low',
            user: 'user-1',
            stream: true,
            partialImages: 2,
            extraRequestBody: '{"seed":1234}',
        });
    });

    it('defaults legacy style presets to NovelAI scope', () => {
        localStorage.setItem(PHOTO_STYLE_PRESETS_KEY, JSON.stringify([
            { id: 'legacy-style', name: 'Legacy', positivePrompt: 'tag prompt', negativePrompt: 'bad' },
        ]));

        expect(getPhotoStylePresets()[0]).toMatchObject({
            id: 'legacy-style',
            providerScope: 'novelai',
        });
    });

    it('normalizes provider params stored on style presets', () => {
        localStorage.setItem(PHOTO_STYLE_PRESETS_KEY, JSON.stringify([
            {
                id: 'param-style',
                name: 'Params',
                providerScope: 'openai-compatible',
                positivePrompt: 'cinematic',
                negativePrompt: '',
                size: 'auto',
                response_format: 'url',
                n: 2,
                quality: 'high',
                style: 'natural',
                background: 'transparent',
                output_format: 'webp',
                output_compression: 72,
                moderation: 'low',
                stream: true,
                partial_images: 2,
                extraRequestBody: '{"seed":42}',
                sampler: 'DPM++ 2M',
                noiseSchedule: 'Poly Exponential',
            },
        ]));

        expect(getPhotoStylePresets()[0]).toMatchObject({
            id: 'param-style',
            providerScope: 'openai-compatible',
            size: 'auto',
            responseFormat: 'url',
            n: 2,
            quality: 'high',
            openAIStyle: 'natural',
            background: 'transparent',
            outputFormat: 'webp',
            outputCompression: 72,
            moderation: 'low',
            stream: true,
            partialImages: 2,
            extraRequestBody: '{"seed":42}',
            sampler: 'k_dpmpp_2m',
            noiseSchedule: 'polyexponential',
        });
    });

    it('normalizes legacy split OpenAI-compatible style scopes back to OpenAI-compatible', () => {
        localStorage.setItem(PHOTO_STYLE_PRESETS_KEY, JSON.stringify([
            {
                id: 'legacy-gpt-soft',
                name: 'Legacy GPT Soft',
                providerScope: 'openai-' + 'gpt',
                positivePrompt: 'natural snapshot',
                negativePrompt: '',
            },
            {
                id: 'legacy-gemini-soft',
                name: 'Legacy Gemini Soft',
                providerScope: 'openai-' + 'gemini',
                positivePrompt: 'natural snapshot',
                negativePrompt: '',
            },
        ]));

        expect(getPhotoStylePresets().map(preset => [preset.id, preset.providerScope])).toEqual([
            ['legacy-gpt-soft', 'openai-compatible'],
            ['legacy-gemini-soft', 'openai-compatible'],
        ]);
    });

    it('migrates saved style presets to include new OpenAI-compatible defaults and drop retired NAI defaults', () => {
        localStorage.setItem(PHOTO_STYLE_PRESETS_KEY, JSON.stringify([
            {
                id: 'soft-polaroid',
                name: '柔光拍立得 / NAI',
                providerScope: 'novelai',
                positivePrompt: 'soft lighting',
                negativePrompt: '',
            },
            {
                id: 'custom-openai',
                name: 'Custom',
                providerScope: 'openai-compatible',
                positivePrompt: 'custom style',
                negativePrompt: '',
            },
        ]));

        const presets = getPhotoStylePresets();
        const ids = presets.map(preset => preset.id);

        expect(ids).not.toContain('soft-polaroid');
        expect(ids).toContain('custom-openai');
        expect(ids).toContain('loveshow-solo-guoman');
        expect(ids).toContain('loveshow-couple-real');
        expect(ids).toContain('style-openai-compatible-1779814872010');
        expect(ids).toContain('style-openai-compatible-mature-male-real-couple');
        expect(presets.find(preset => preset.id === 'custom-openai')?.providerScope).toBe('openai-compatible');
    });

    it('filters style presets by the active provider without mixing shared presets', () => {
        const presets: PhotoStylePreset[] = [
            { ...style, id: 'nai-only', providerScope: 'novelai' },
            { ...style, id: 'compat-only', providerScope: 'openai-compatible' },
            { ...style, id: 'shared', providerScope: 'all' },
        ];

        expect(getCompatiblePhotoStylePresets(presets, 'openai-compatible').map(preset => preset.id)).toEqual(['compat-only']);
        expect(resolvePhotoStylePreset('nai-only', presets, undefined, 'openai-compatible').id).toBe('compat-only');
    });

    it('falls back to legacy shared style presets when no provider-specific preset exists', () => {
        const presets: PhotoStylePreset[] = [
            { ...style, id: 'nai-only', providerScope: 'novelai' },
            { ...style, id: 'shared', providerScope: 'all' },
        ];

        expect(getCompatiblePhotoStylePresets(presets, 'openai-compatible').map(preset => preset.id)).toEqual(['shared']);
        expect(resolvePhotoStylePreset(undefined, presets, undefined, 'openai-compatible').id).toBe('shared');
    });

    it('lets a manual style selection override character-bound style presets', () => {
        const presets: PhotoStylePreset[] = [
            { ...style, id: 'bound-style', positivePrompt: 'bound style' },
            { ...style, id: 'manual-style', positivePrompt: 'manual style' },
        ];
        const char = {
            ...directorChar,
            defaultPhotoStylePresetId: 'bound-style',
            boundPhotoStylePresetIds: ['bound-style'],
        } as CharacterProfile;

        expect(resolvePhotoStylePreset('manual-style', presets, char, 'novelai', { allowUnboundRequested: true }).id).toBe('manual-style');
        expect(resolvePhotoStylePreset('manual-style', presets, char, 'novelai').id).toBe('bound-style');
    });

    it('uses character defaults for manual photo when no style was explicitly selected', () => {
        const presets: PhotoStylePreset[] = [
            NO_PHOTO_STYLE_PRESET,
            { ...style, id: 'first-style', positivePrompt: 'first style' },
            { ...style, id: 'bound-style', positivePrompt: 'bound style' },
        ];
        const char = {
            ...directorChar,
            boundPhotoStylePresetIds: ['bound-style'],
        } as CharacterProfile;

        expect(resolvePhotoStylePreset(undefined, presets, char, 'novelai').id).toBe('bound-style');
        expect(resolvePhotoStylePreset(undefined, presets, undefined, 'novelai').id).toBe('first-style');
    });

    it('uses the global LoveShow image style preset for OpenAI-compatible generation without an explicit style', () => {
        const config: ImageGenerationConfig = { ...baseConfig, activeProvider: 'openai-compatible', imageStyle: 'cg' };
        const presets = getPhotoStylePresets();

        expect(resolveImageStylePhotoPreset(undefined, presets, undefined, config, false).id).toBe('loveshow-solo-cg');
        expect(resolveImageStylePhotoPreset(undefined, presets, undefined, config, true).id).toBe('loveshow-couple-cg');
        expect(resolveImageStylePhotoPreset('custom-style', [
            {
                id: 'custom-style',
                name: 'Custom',
                providerScope: 'openai-compatible',
                positivePrompt: 'custom',
                negativePrompt: '',
            },
        ], undefined, config, true, { allowUnboundRequested: true }).id).toBe('custom-style');
    });

    it('combines manual NovelAI prompt, style preset, and config prompts with de-duplication', () => {
        const prompts = buildManualPhotoPrompt('warm light, portrait', style, baseConfig);

        expect(prompts.positivePrompt).toBe('warm light, portrait, best quality, amazing quality');
        expect(prompts.negativePrompt).toBe('bad hands, lowres, blurry');
        expect(prompts.finalPrompt).toBe(prompts.positivePrompt);
    });

    it('allows NovelAI generation without a style preset', () => {
        const prompts = buildManualPhotoPrompt('window light, portrait', NO_PHOTO_STYLE_PRESET, baseConfig);

        expect(resolvePhotoStylePreset(NO_PHOTO_STYLE_PRESET_ID, [style], undefined, 'novelai').id).toBe(NO_PHOTO_STYLE_PRESET_ID);
        expect(prompts.positivePrompt).toBe('window light, portrait, best quality, amazing quality');
        expect(prompts.negativePrompt).toBe('lowres, blurry');
    });

    it('adds character appearance tags to manual NovelAI prompts when enabled', () => {
        const prompts = buildManualPhotoPrompt('soft smile', style, baseConfig, {
            appearanceTags: '1girl, solo, blue eyes',
            appearanceNegativeTags: 'male, beard',
        });

        expect(prompts.positivePrompt).toContain('soft smile, 1girl, solo, blue eyes');
        expect(prompts.positivePrompt).toContain('warm light');
        expect(prompts.negativePrompt).toContain('male, beard');
        expect(prompts.negativePrompt).toContain('bad hands');
    });

    it('adds user appearance tags to manual NovelAI prompts only when enabled', () => {
        const prompts = buildManualPhotoPrompt('couple selfie', style, baseConfig, {
            appearanceTags: '1boy, adult male, black hair',
            userAppearanceTags: '1girl, long brown hair, green eyes',
            userAppearanceNegativeTags: 'short hair',
            includeUserAppearance: true,
        });
        const promptsWithoutUser = buildManualPhotoPrompt('solo selfie', style, baseConfig, {
            appearanceTags: '1boy, adult male, black hair',
            userAppearanceTags: '1girl, long brown hair, green eyes',
            includeUserAppearance: false,
        });

        expect(prompts.positivePrompt).toContain('1boy, adult male, black hair');
        expect(prompts.positivePrompt).toContain('1girl, long brown hair, green eyes');
        expect(prompts.negativePrompt).toContain('short hair');
        expect(promptsWithoutUser.positivePrompt).not.toContain('long brown hair');
    });

    it('builds NovelAI auto prompts from director tags before quality and style presets', () => {
        const weightedStyle: PhotoStylePreset = {
            ...style,
            positivePrompt: '4::artist:sample,::, 2::soft film grain,::',
            negativePrompt: 'bad hands',
        };
        const prompts = buildPhotoPromptFromDirector({
            shouldGeneratePhoto: true,
            caption: '给你看。',
            scene_zh: '',
            camera: '',
            mood: '',
            stylePresetId: weightedStyle.id,
            continuity_summary: '自拍',
            intent: 'selfie',
            subject_tags: '1boy, solo, adult male, handsome, dark eyes, masterpiece, artist:wrong',
            expression_tags: 'gentle smile, looking at viewer',
            pose_tags: 'selfie, phone camera, arm extended, close-up, upper body',
            clothing_tags: 'black shirt, open collar',
            scene_tags: 'bedroom, night',
            camera_tags: 'intimate angle, shallow depth of field',
            mood_tags: 'warm indoor lighting, private moment',
            dynamic_negative: 'female, girl, child',
        }, undefined, weightedStyle, baseConfig);

        expect(prompts.positivePrompt.startsWith('1boy, solo, adult male')).toBe(true);
        expect(prompts.positivePrompt).toContain('selfie');
        expect(prompts.positivePrompt).toContain('4::artist:sample,::, 2::soft film grain,::');
        expect(prompts.positivePrompt.endsWith('best quality, amazing quality')).toBe(true);
        expect(prompts.positivePrompt).not.toContain('artist:wrong');
        expect(prompts.negativePrompt).toContain('lowres, blurry');
        expect(prompts.negativePrompt).toContain('female');
        expect(prompts.negativePrompt).toContain('breasts');
        expect(prompts.finalPrompt).toBe(prompts.positivePrompt);
    });

    it('lets character appearance override director subject appearance tags', () => {
        const prompts = buildPhotoPromptFromDirector({
            shouldGeneratePhoto: true,
            caption: '',
            scene_zh: '',
            camera: '',
            mood: '',
            stylePresetId: style.id,
            continuity_summary: '',
            subject_tags: '1boy, solo, short black hair, brown eyes',
            expression_tags: 'gentle smile',
            pose_tags: 'looking at viewer',
            clothing_tags: 'white shirt',
            scene_tags: 'sunlit room',
            camera_tags: 'close-up',
            mood_tags: 'soft light',
            dynamic_negative: 'extra fingers',
        }, undefined, style, baseConfig, {
            appearanceTags: '1girl, solo, long silver hair, blue eyes',
            appearanceNegativeTags: 'male, beard',
        });

        expect(prompts.positivePrompt).toContain('1girl, solo, long silver hair, blue eyes');
        expect(prompts.positivePrompt).not.toContain('short black hair');
        expect(prompts.positivePrompt).toContain('looking at viewer');
        expect(prompts.negativePrompt).toContain('male, beard');
        expect(prompts.negativePrompt).toContain('extra fingers');
    });

    it('builds OpenAI-compatible prompt as natural text with avoid instructions', () => {
        const config: ImageGenerationConfig = { ...baseConfig, activeProvider: 'openai-compatible' };
        const compatStyle: PhotoStylePreset = {
            ...style,
            providerScope: 'openai-compatible',
            positivePrompt: '柔和胶片感，生活化抓拍',
            negativePrompt: '过曝',
        };

        const prompts = buildManualPhotoPrompt('窗边自拍', compatStyle, config);

        expect(prompts.positivePrompt).toContain('窗边自拍');
        expect(prompts.positivePrompt).toContain('柔和胶片感');
        expect(prompts.finalPrompt).toContain('避免出现：');
        expect(prompts.finalPrompt).toContain('过曝');
        expect(prompts.finalPrompt).toContain('watermark');
    });

    it('adds natural-language locked appearances to OpenAI-compatible prompts', () => {
        const config: ImageGenerationConfig = { ...baseConfig, activeProvider: 'openai-compatible' };
        const compatStyle: PhotoStylePreset = {
            ...style,
            providerScope: 'openai-compatible',
            positivePrompt: '生活化抓拍',
            negativePrompt: '',
        };

        const prompts = buildManualPhotoPrompt('雨夜合照', compatStyle, config, {
            appearancePrompt: '角色固定为黑色短发、灰蓝眼睛、穿深色衬衫',
            userAppearancePrompt: '用户固定为黑色中长发、圆眼、浅色针织衫',
            includeUserAppearance: true,
        });

        expect(prompts.positivePrompt).toContain('固定角色外貌：角色固定为黑色短发');
        expect(prompts.positivePrompt).toContain('固定用户外貌：用户固定为黑色中长发');
        expect(prompts.finalPrompt).toContain('固定角色外貌');
        expect(prompts.finalPrompt).toContain('雨夜合照');
    });

    it('puts LoveShow style presets before labeled male/female appearances', () => {
        const config: ImageGenerationConfig = { ...baseConfig, activeProvider: 'openai-compatible', imageStyle: 'real' };
        const loveShowStyle = getPhotoStylePresets().find(preset => preset.id === 'loveshow-couple-real')!;

        const prompts = buildManualPhotoPrompt('雨夜阳台合照', loveShowStyle, config, {
            appearancePrompt: '黑色短发，方脸，高鼻梁，身形高大',
            userAppearancePrompt: '黑色中长发，圆眼，浅色针织衫',
            includeUserAppearance: true,
        });

        expect(prompts.positivePrompt.startsWith('双人同框真人感合照')).toBe(true);
        expect(prompts.positivePrompt).toContain('男生外貌：黑色短发');
        expect(prompts.positivePrompt).toContain('女生外貌：黑色中长发');
        expect(prompts.finalPrompt).toContain('避免出现：');
        expect(prompts.negativePrompt).toContain('人物融合');
    });

    it('detects when user appearance should be included for two-person photos', () => {
        expect(shouldIncludeUserAppearanceForPhoto(undefined, '我们拍一张合照')).toBe(true);
        expect(shouldIncludeUserAppearanceForPhoto({ shouldGeneratePhoto: true, caption: '', scene_zh: '', camera: '', mood: '', stylePresetId: '', continuity_summary: '', intent: 'date_scene' })).toBe(true);
        expect(shouldIncludeUserAppearanceForPhoto(undefined, '给我发一张窗边自拍')).toBe(false);
    });

    it('builds a compact generated-photo summary for chat context', () => {
        const meta: PhotoMeta = {
            source: 'chat_auto',
            providerType: 'novelai',
            stylePresetId: 'soft',
            model: 'nai-diffusion-4-full',
            positivePrompt: '1girl, solo, window light',
            negativePrompt: 'lowres',
            finalPrompt: '1girl, solo, window light',
            width: 832,
            height: 1216,
            seed: 7,
            continuity_summary: '窗边自拍，暖光',
            directorResult: {
                shouldGeneratePhoto: true,
                caption: '给你看。',
                scene_zh: '角色站在窗边，傍晚暖光照在侧脸上。',
                camera: '近景自拍构图',
                mood: '柔和、私密',
                stylePresetId: 'soft',
                continuity_summary: '窗边自拍，暖光',
            },
        };

        const summary = buildPhotoContextSummary(meta, '给你看。');

        expect(summary).toContain('配文：给你看。');
        expect(summary).toContain('画面：角色站在窗边');
        expect(summary.length).toBeLessThan(500);
    });

    it('imports JSON community style presets with providerScope', () => {
        const preset = parsePhotoStylePaste(JSON.stringify({
            id: 'community-soft',
            name: 'Community Soft',
            providerScope: 'openai-compatible',
            positive: 'soft focus, gentle color',
            uc: 'blur, watermark',
            width: 1024,
            height: 1024,
            cfg: 6,
            sampler: 'k_dpm++ 2m',
            noiseSchedule: 'poly exponential',
            size: 'auto',
            response_format: 'url',
            quality: 'high',
            style: 'natural',
            output_format: 'webp',
            output_compression: 80,
        }), 'novelai');

        expect(preset).toMatchObject({
            id: 'community-soft',
            providerScope: 'openai-compatible',
            positivePrompt: 'soft focus, gentle color',
            negativePrompt: 'blur, watermark',
            width: 1024,
            height: 1024,
            scale: 6,
            sampler: 'k_dpmpp_2m',
            noiseSchedule: 'polyexponential',
            size: 'auto',
            responseFormat: 'url',
            quality: 'high',
            openAIStyle: 'natural',
            outputFormat: 'webp',
            outputCompression: 80,
        });
    });

    it('imports plain-text community style presets with the current provider scope', () => {
        const preset = parsePhotoStylePaste([
            'positive prompt: cinematic portrait, window light',
            'negative prompt: lowres, bad anatomy',
            'steps: 24',
            'sampler: DPM++ 2M',
            'schedule: karras',
            'quality: high',
            'style: natural',
            'output_format: webp',
            'cfg scale: 5.5',
            'size: 832x1216',
        ].join('\n'), 'openai-compatible');

        expect(preset.providerScope).toBe('openai-compatible');
        expect(preset.positivePrompt).toBe('cinematic portrait, window light');
        expect(preset.negativePrompt).toBe('lowres, bad anatomy');
        expect(preset.steps).toBe(24);
        expect(preset.sampler).toBe('k_dpmpp_2m');
        expect(preset.noiseSchedule).toBe('karras');
        expect(preset.quality).toBe('high');
        expect(preset.openAIStyle).toBe('natural');
        expect(preset.outputFormat).toBe('webp');
        expect(preset.scale).toBe(5.5);
        expect(preset.width).toBe(832);
        expect(preset.height).toBe(1216);
    });

    it('sends Photo Director requests with a timeout signal', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            choices: [{
                message: {
                    content: JSON.stringify({
                        shouldGeneratePhoto: true,
                        caption: '给你看。',
                        stylePresetId: 'soft',
                        continuity_summary: '窗边自拍',
                        intent: 'selfie',
                        subject_tags: '1girl, solo',
                        expression_tags: 'gentle smile',
                        pose_tags: 'selfie, looking at viewer',
                        clothing_tags: 'casual shirt',
                        scene_tags: 'bedroom, night',
                        camera_tags: 'phone camera, close-up',
                        mood_tags: 'warm indoor lighting',
                        dynamic_negative: 'male, boy',
                    }),
                },
            }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const result = await runPhotoDirector({
            apiConfig: directorApiConfig,
            char: directorChar,
            userProfile: directorUser,
            currentMsgs: [],
            aiReply: '等我一下，给你看看。',
            hint: {
                type: 'photo_hint',
                strength: 0.95,
                anchor_text: '等我一下，给你看看。',
                share_intent: '用户想看照片',
                must_keep: [],
                must_avoid: [],
            },
            stylePresets: [style],
            recentPhotoMetas: [],
            providerType: 'novelai',
        });

        expect(result?.shouldGeneratePhoto).toBe(true);
        expect(fetch).toHaveBeenCalledWith('https://llm.example/v1/chat/completions', expect.objectContaining({
            method: 'POST',
            signal: expect.any(AbortSignal),
        }));
    });

    it('runs manual story Photo Director with recent chat and user prompt', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            choices: [{
                message: {
                    content: JSON.stringify({
                        shouldGeneratePhoto: true,
                        caption: '窗边那张。',
                        stylePresetId: '',
                        continuity_summary: '雨夜窗边自拍',
                        intent: 'selfie',
                        subject_tags: '1girl, solo',
                        expression_tags: 'gentle smile',
                        pose_tags: 'looking at viewer',
                        clothing_tags: 'white shirt',
                        scene_tags: 'rainy window, night',
                        camera_tags: 'close-up',
                        mood_tags: 'soft indoor light',
                        dynamic_negative: 'male, boy',
                    }),
                },
            }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const result = await runManualPhotoDirector({
            apiConfig: directorApiConfig,
            char: directorChar,
            userProfile: directorUser,
            currentMsgs: [
                { id: 1, charId: 'char-1', role: 'user', type: 'text', content: '外面下雨了。', timestamp: 1 },
                { id: 2, charId: 'char-1', role: 'assistant', type: 'text', content: '我在窗边看雨。', timestamp: 2 },
            ] as any,
            userPrompt: '想要窗边雨夜自拍',
            stylePresets: [NO_PHOTO_STYLE_PRESET, style],
            recentPhotoMetas: [],
            providerType: 'novelai',
            appearanceTags: '1girl, solo, long hair',
        });

        const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body || '{}'));
        const sentText = JSON.stringify(body.messages);
        expect(result?.scene_tags).toBe('rainy window, night');
        expect(sentText).toContain('最近聊天片段');
        expect(sentText).toContain('外面下雨了');
        expect(sentText).toContain('想要窗边雨夜自拍');
        expect(sentText).toContain('1girl, solo, long hair');
    });

    it('reports a clear Photo Director timeout error', async () => {
        const originalTimeout = (AbortSignal as typeof AbortSignal & { timeout?: typeof AbortSignal.timeout }).timeout;
        const controller = new AbortController();
        Object.defineProperty(AbortSignal, 'timeout', {
            configurable: true,
            value: vi.fn((ms: number) => {
                expect(ms).toBe(PHOTO_DIRECTOR_TIMEOUT_MS);
                controller.abort();
                return controller.signal;
            }),
        });
        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));

        try {
            await expect(runPhotoDirector({
                apiConfig: directorApiConfig,
                char: directorChar,
                userProfile: directorUser,
                currentMsgs: [],
                aiReply: '等我一下，给你看看。',
                hint: {
                    type: 'photo_hint',
                    strength: 0.95,
                    anchor_text: '等我一下，给你看看。',
                    share_intent: '用户想看照片',
                    must_keep: [],
                    must_avoid: [],
                },
                stylePresets: [style],
                recentPhotoMetas: [],
                providerType: 'novelai',
            })).rejects.toThrow('Photo Director 请求超时（90 秒）');
        } finally {
            if (originalTimeout) {
                Object.defineProperty(AbortSignal, 'timeout', {
                    configurable: true,
                    value: originalTimeout,
                });
            } else {
                Reflect.deleteProperty(AbortSignal, 'timeout');
            }
        }
    });

    it('reports HTML Photo Director responses with a clear endpoint hint', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<!doctype html><html><title>Fallback</title></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        }));

        await expect(runPhotoDirector({
            apiConfig: directorApiConfig,
            char: directorChar,
            userProfile: directorUser,
            currentMsgs: [],
            aiReply: '等我一下，给你看看。',
            hint: {
                type: 'photo_hint',
                strength: 0.95,
                anchor_text: '等我一下，给你看看。',
                share_intent: '用户想看照片',
                must_keep: [],
                must_avoid: [],
            },
            stylePresets: [style],
            recentPhotoMetas: [],
            providerType: 'openai-compatible',
        })).rejects.toThrow('接口返回 HTML 页面');
    });

    it('reads OpenAI-compatible b64_json image responses and omits auto response_format', async () => {
        const config: ImageGenerationConfig = { ...baseConfig, activeProvider: 'openai-compatible' };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            data: [{ b64_json: 'aGVsbG8=' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const result = await generatePhotoImage(config, openAICompatibleMeta);

        expect(result.dataUrl).toBe('data:image/png;base64,aGVsbG8=');
        expect(fetch).toHaveBeenCalledWith('https://imagegen.example/v1/images/generations', expect.objectContaining({
            method: 'POST',
        }));
        const [, init] = (fetch as any).mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body).toMatchObject({
            model: 'image2',
            prompt: 'prompt\n避免出现：bad',
            size: '1024x1024',
        });
        expect(body).not.toHaveProperty('response_format');
    });

    it('reports HTML OpenAI-compatible image responses before image parsing', async () => {
        const config: ImageGenerationConfig = { ...baseConfig, activeProvider: 'openai-compatible' };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<!doctype html><html><title>Pages fallback</title></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        }));

        await expect(generatePhotoImage(config, openAICompatibleMeta)).rejects.toThrow('接口返回 HTML 页面');
    });

    it('sends the real OpenAI-compatible model id when a display label was stored', async () => {
        const config: ImageGenerationConfig = { ...baseConfig, activeProvider: 'openai-compatible' };
        const meta: PhotoMeta = { ...openAICompatibleMeta, model: '【0.08】米/gpt-image-2' };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            data: [{ b64_json: 'aGVsbG8=' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        await generatePhotoImage(config, meta);

        const [, init] = (fetch as any).mock.calls[0];
        expect(JSON.parse(init.body).model).toBe('gpt-image-2');
    });

    it('cleans display model labels but preserves real provider-prefixed model ids before requesting', async () => {
        const config: ImageGenerationConfig = { ...baseConfig, activeProvider: 'openai-compatible' };
        const cases: Array<[string, string]> = [
            ['假流/gemini-3.1-flash-image-preview', GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL],
            ['fake-stream/gemini-3-pro-image-preview', 'fake-stream/gemini-3-pro-image-preview'],
            ['假流/gemini-3.1-flash-image-preview / gemini-3.1-flash-image-preview', GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL],
            ['openai/gpt-image-2', 'openai/gpt-image-2'],
        ];
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
            data: [{ b64_json: 'aGVsbG8=' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        for (const [storedModel] of cases) {
            await generatePhotoImage(config, { ...openAICompatibleMeta, model: storedModel });
        }

        expect(fetchMock).toHaveBeenCalledTimes(cases.length);
        cases.forEach(([, expectedModel], index) => {
            const [, init] = fetchMock.mock.calls[index];
            expect(JSON.parse(String(init?.body || '{}')).model).toBe(expectedModel);
        });
    });

    it('passes OpenAI-compatible optional request params and extra JSON overrides', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: {
                ...baseConfig.openaiCompatible,
                size: 'auto',
                responseFormat: 'url',
                n: 2,
                quality: 'high',
                style: 'natural',
                background: 'transparent',
                outputFormat: 'webp',
                outputCompression: 80,
                moderation: 'low',
                user: 'user-1',
                stream: true,
                partialImages: 2,
                extraRequestBody: '{"seed":1234,"response_format":"b64_json","custom_param":"x"}',
            },
        };
        const meta: PhotoMeta = { ...openAICompatibleMeta, size: 'auto' };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            data: [{ b64_json: 'aGVsbG8=' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        await generatePhotoImage(config, meta);

        const [, init] = (fetch as any).mock.calls[0];
        expect(JSON.parse(init.body)).toMatchObject({
            model: 'image2',
            prompt: 'prompt\n避免出现：bad',
            size: 'auto',
            response_format: 'b64_json',
            n: 2,
            quality: 'high',
            style: 'natural',
            background: 'transparent',
            output_format: 'webp',
            output_compression: 80,
            moderation: 'low',
            user: 'user-1',
            stream: true,
            partial_images: 2,
            seed: 1234,
            custom_param: 'x',
        });
    });

    it('sends a minimal Gemini-compatible image request body even when GPT image params are configured', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: {
                ...baseConfig.openaiCompatible,
                model: GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
                size: '768x1344',
                responseFormat: 'url',
                n: 1,
                quality: 'high',
                style: 'natural',
                background: 'transparent',
                outputFormat: 'webp',
                outputCompression: 80,
                moderation: 'low',
                user: 'user-1',
                stream: true,
                partialImages: 2,
                extraRequestBody: '{"seed":1234,"response_format":"url","custom_param":"x"}',
            },
        };
        const meta: PhotoMeta = {
            ...openAICompatibleMeta,
            model: GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
            width: 768,
            height: 1344,
            size: '768x1344',
            responseFormat: 'url',
            n: 1,
            quality: 'high',
            openAIStyle: 'natural',
            background: 'transparent',
            outputFormat: 'webp',
            outputCompression: 80,
            moderation: 'low',
            user: 'user-1',
            stream: true,
            partialImages: 2,
        };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            data: [{ b64_json: 'aGVsbG8=' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        await generatePhotoImage(config, meta);

        const [, init] = (fetch as any).mock.calls[0];
        expect(JSON.parse(init.body)).toEqual({
            model: GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
            prompt: 'prompt\n避免出现：bad',
            size: '1024x1536',
            response_format: 'b64_json',
            n: 1,
        });
    });

    it('lets OpenAI-compatible style presets override image request params', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: {
                ...baseConfig.openaiCompatible,
                model: 'global-image',
                size: '1024x1024',
                responseFormat: 'auto',
                quality: 'medium',
                extraRequestBody: '{"seed":1,"global_param":"kept"}',
            },
        };
        const compatStyle: PhotoStylePreset = {
            ...style,
            providerScope: 'openai-gpt',
            model: 'style-image',
            size: 'auto',
            responseFormat: 'url',
            n: 2,
            quality: 'high',
            openAIStyle: 'natural',
            background: 'transparent',
            outputFormat: 'webp',
            outputCompression: 80,
            moderation: 'low',
            user: 'style-user',
            stream: true,
            partialImages: 2,
            extraRequestBody: '{"seed":2,"style_param":"x"}',
        };
        const prompts = buildManualPhotoPrompt('窗边自拍', compatStyle, config);
        const meta = createPhotoMeta('manual', config, compatStyle, prompts, 123);
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            data: [{ b64_json: 'aGVsbG8=' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        await generatePhotoImage(config, meta);

        const [, init] = (fetch as any).mock.calls[0];
        expect(meta).toMatchObject({
            model: 'style-image',
            size: 'auto',
            responseFormat: 'url',
            quality: 'high',
            openAIStyle: 'natural',
        });
        expect(JSON.parse(init.body)).toMatchObject({
            model: 'style-image',
            size: 'auto',
            response_format: 'url',
            n: 2,
            quality: 'high',
            style: 'natural',
            background: 'transparent',
            output_format: 'webp',
            output_compression: 80,
            moderation: 'low',
            user: 'style-user',
            stream: true,
            partial_images: 2,
            seed: 2,
            global_param: 'kept',
            style_param: 'x',
        });
    });

    it('extracts generated images from URL, markdown, image_url, data URL, and pure base64 shapes', () => {
        const pureBase64 = btoa('fake-image-binary'.repeat(20));

        expect(extractGeneratedImage({ data: [{ image_url: 'https://cdn.example/image-url.png' }] })).toEqual({
            kind: 'url',
            url: 'https://cdn.example/image-url.png',
        });
        expect(extractGeneratedImage('![image](https://cdn.example/markdown.webp)')).toEqual({
            kind: 'url',
            url: 'https://cdn.example/markdown.webp',
        });
        expect(extractGeneratedImage({
            choices: [{ message: { content: 'done\n![image](https://cdn.example/chat-wrapper.png)' } }],
        })).toEqual({
            kind: 'url',
            url: 'https://cdn.example/chat-wrapper.png',
        });
        expect(extractGeneratedImage('data:image/webp;base64,aGVsbG8=')).toEqual({
            kind: 'dataUrl',
            dataUrl: 'data:image/webp;base64,aGVsbG8=',
            mimeType: 'image/webp',
        });
        expect(extractGeneratedImage(pureBase64)).toEqual({
            kind: 'base64',
            base64: pureBase64,
            mimeType: 'image/png',
        });
    });

    it('keeps OpenAI-compatible url image responses as remote image URLs', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, responseFormat: 'url' },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: 'image2',
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            seed: 1,
        };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            data: [{ url: 'https://cdn.example/image.png' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const result = await generatePhotoImage(config, meta);

        expect(result.dataUrl).toBe('https://cdn.example/image.png');
        expect(result.remoteUrl).toBe('https://cdn.example/image.png');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('trims prose after loose OpenAI-compatible URL text responses', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, responseFormat: 'url' },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: 'image2',
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            seed: 1,
        };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
            'https://cdn.example/generated.webp\n配文：找到了。',
            { status: 200, headers: { 'Content-Type': 'text/plain' } },
        ));

        const result = await generatePhotoImage(config, meta);

        expect(result.dataUrl).toBe('https://cdn.example/generated.webp');
        expect(result.remoteUrl).toBe('https://cdn.example/generated.webp');
    });

    it('keeps loose image payload parsing for non-OK compatible responses', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, responseFormat: 'url' },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: 'image2',
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            seed: 1,
        };
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
            'http://70.39.197.55:3000/images/generated.png',
            { status: 500, headers: { 'Content-Type': 'text/plain' } },
        ));

        const result = await generatePhotoImage(config, meta);

        expect(result.dataUrl).toBe('http://70.39.197.55:3000/images/generated.png');
        expect(result.remoteUrl).toBe('http://70.39.197.55:3000/images/generated.png');
    });

    it('keeps loose image URL parsing when non-OK compatible responses nest the URL in error.message', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, responseFormat: 'url' },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: 'image2',
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            seed: 1,
        };
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            error: {
                message: 'generated: http://70.39.197.55:3000/images/from-error-message.webp',
                type: 'invalid_request_error',
            },
        }), { status: 500, headers: { 'Content-Type': 'application/json' } }));

        const result = await generatePhotoImage(config, meta);

        expect(result.dataUrl).toBe('http://70.39.197.55:3000/images/from-error-message.webp');
        expect(result.remoteUrl).toBe('http://70.39.197.55:3000/images/from-error-message.webp');
    });

    it('reports text-only non-OK compatible image responses without treating them as images', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, responseFormat: 'url' },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: 'image2',
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            seed: 1,
        };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            error: {
                message: '这是一张在暖黄灯光电梯里拍下的亲昵对镜自拍，氛围柔和又带点暧昧的温度感。',
                type: 'invalid_request_error',
            },
        }), { status: 400, headers: { 'Content-Type': 'application/json' } }));

        await expect(generatePhotoImage(config, meta))
            .rejects
            .toThrow('接口返回了文字说明，未返回图片');
    });

    it('includes request and response debug details for OpenAI-compatible invalid argument errors', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: {
                ...baseConfig.openaiCompatible,
                model: GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
                responseFormat: 'url',
            },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            n: 1,
            seed: 1,
        };
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { message: 'Request contains an invalid argument.' },
            }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { message: 'Request contains an invalid argument.' },
            }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { message: 'Request contains an invalid argument.' },
            }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { message: 'Request contains an invalid argument.' },
            }), { status: 400, headers: { 'Content-Type': 'application/json' } }));

        await expect(generatePhotoImage(config, meta))
            .rejects
            .toThrow(/Gemini 参数降级：移除 size -> 移除 n -> 移除 response_format[\s\S]*请求体：[\s\S]*gemini-3\.1-flash-image-preview[\s\S]*响应原文预览：/);
        expect(fetchMock).toHaveBeenCalledTimes(4);
        const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
        const thirdBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
        const fourthBody = JSON.parse(String(fetchMock.mock.calls[3][1]?.body));
        expect(firstBody.size).toBe('1024x1024');
        expect(firstBody.n).toBe(1);
        expect(firstBody.response_format).toBe('b64_json');
        expect(secondBody.size).toBeUndefined();
        expect(secondBody.n).toBe(1);
        expect(secondBody.response_format).toBe('b64_json');
        expect(thirdBody.size).toBeUndefined();
        expect(thirdBody.n).toBeUndefined();
        expect(thirdBody.response_format).toBe('b64_json');
        expect(fourthBody).toEqual({
            model: GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
            prompt: 'prompt\n避免出现：bad',
        });
    });

    it('reports OpenAI-compatible API key errors as auth failures even when alternate key headers fail', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, responseFormat: 'url' },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: 'image2',
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            seed: 1,
        };
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { message: 'Please pass a valid API key' },
            }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { message: 'Please pass a valid API key' },
            }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { message: 'Please pass a valid API key' },
            }), { status: 400, headers: { 'Content-Type': 'application/json' } }));

        await expect(generatePhotoImage(config, meta))
            .rejects
            .toThrow('OpenAI 兼容生图鉴权失败 (400)');
    });

    it('retries OpenAI-compatible image requests with x-goog-api-key when Bearer is rejected as missing API key', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, apiKey: 'gemini-key', responseFormat: 'url' },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: 'gemini-3.1-flash-image-preview',
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            seed: 1,
        };
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { message: 'Please pass a valid API key' },
            }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: [{ b64_json: 'aGVsbG8=' }],
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const result = await generatePhotoImage(config, meta);

        expect(result.dataUrl).toBe('data:image/png;base64,aGVsbG8=');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
            Authorization: 'Bearer gemini-key',
            'x-goog-api-key': 'gemini-key',
        });
    });

    it('reports empty OpenAI-compatible responses explicitly', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, responseFormat: 'url' },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: 'image2',
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            seed: 1,
        };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
        }));

        await expect(generatePhotoImage(config, meta))
            .rejects
            .toThrow('OpenAI 兼容接口返回空响应，请检查 endpoint、model、key、CORS 或代理日志。');
    });

    it('includes a long string preview when compatible responses contain no image', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, responseFormat: 'url' },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: 'image2',
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            seed: 1,
        };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
            `model not found: ${'x'.repeat(900)}`,
            { status: 200, headers: { 'Content-Type': 'text/plain' } },
        ));

        await expect(generatePhotoImage(config, meta))
            .rejects
            .toThrow('预览：model not found');
    });

    it('reads OpenAI-compatible image arrays that contain URL strings', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, responseFormat: 'url' },
        };
        const meta: PhotoMeta = {
            source: 'manual',
            providerType: 'openai-compatible',
            stylePresetId: 'compat',
            model: 'image2',
            positivePrompt: 'prompt',
            negativePrompt: 'bad',
            finalPrompt: 'prompt\n避免出现：bad',
            width: 1024,
            height: 1024,
            size: '1024x1024',
            seed: 1,
        };
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            images: ['https://cdn.example/generated.webp'],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const result = await generatePhotoImage(config, meta);

        expect(result.dataUrl).toBe('https://cdn.example/generated.webp');
        expect(result.remoteUrl).toBe('https://cdn.example/generated.webp');
    });

    it('reads OpenAI Responses-style image generation results', async () => {
        const config: ImageGenerationConfig = { ...baseConfig, activeProvider: 'openai-compatible' };
        const b64 = btoa('fake-image-binary'.repeat(24));
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            output: [{ type: 'image_generation_call', result: b64 }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const result = await generatePhotoImage(config, openAICompatibleMeta);

        expect(result.dataUrl).toBe(`data:image/png;base64,${b64}`);
    });

    it('reads the final image from OpenAI-compatible text/event-stream responses', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, stream: true, partialImages: 1 },
        };
        const partial = btoa('partial-image-binary'.repeat(24));
        const final = btoa('final-image-binary'.repeat(24));
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
            [
                `data: ${JSON.stringify({ type: 'image_generation.partial_image', partial_image_b64: partial })}`,
                '',
                `data: ${JSON.stringify({ type: 'image_generation.completed', b64_json: final })}`,
                '',
                'data: [DONE]',
            ].join('\n'),
            { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ));

        const result = await generatePhotoImage(config, openAICompatibleMeta);

        expect(result.dataUrl).toBe(`data:image/png;base64,${final}`);
    });

    it('reports invalid OpenAI-compatible extra request JSON before sending', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            activeProvider: 'openai-compatible',
            openaiCompatible: { ...baseConfig.openaiCompatible, extraRequestBody: '{"seed":' },
        };
        vi.spyOn(globalThis, 'fetch');

        await expect(generatePhotoImage(config, openAICompatibleMeta)).rejects.toThrow('额外请求参数不是合法 JSON');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('keeps the NovelAI generate-image body unchanged when no Vibe references are selected', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await createNaiZipResponse());

        await generatePhotoImage(baseConfig, naiMeta);

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('https://image.novelai.net/ai/generate-image', expect.objectContaining({
            method: 'POST',
        }));
        const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
        expect(body.parameters.reference_image_multiple).toBeUndefined();
        expect(body.parameters.reference_strength_multiple).toBeUndefined();
        expect(body.parameters.reference_information_extracted_multiple).toBeUndefined();
    });

    it('uses customized NovelAI config params in photo meta and generate-image body', async () => {
        const config: ImageGenerationConfig = {
            ...baseConfig,
            novelai: {
                ...baseConfig.novelai,
                width: 896,
                height: 1152,
                steps: 35,
                scale: 6.5,
                sampler: 'DPM++ 2M',
                noiseSchedule: 'Poly Exponential',
                qualityTags: 'custom quality',
                negativePrompt: 'custom negative',
            },
        };
        const prompts = buildManualPhotoPrompt('portrait', style, config);
        const meta = createPhotoMeta('manual', config, style, prompts, 123);
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await createNaiZipResponse());

        await generatePhotoImage(config, meta);

        const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
        expect(meta).toMatchObject({
            width: 896,
            height: 1152,
            steps: 35,
            scale: 6.5,
            sampler: 'k_dpmpp_2m',
            noiseSchedule: 'polyexponential',
        });
        expect(body.parameters).toMatchObject({
            width: 896,
            height: 1152,
            steps: 35,
            scale: 6.5,
            sampler: 'k_dpmpp_2m',
            noise_schedule: 'polyexponential',
            prompt: expect.stringContaining('custom quality'),
            negative_prompt: expect.stringContaining('custom negative'),
        });
    });

    it('lets NovelAI style presets override sampler and generation params', async () => {
        const paramStyle: PhotoStylePreset = {
            ...style,
            model: 'nai-diffusion-4-5-full',
            width: 768,
            height: 1024,
            steps: 24,
            scale: 6,
            sampler: 'DPM++ 2M',
            noiseSchedule: 'Poly Exponential',
        };
        const prompts = buildManualPhotoPrompt('portrait', paramStyle, baseConfig);
        const meta = createPhotoMeta('manual', baseConfig, paramStyle, prompts, 321);
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await createNaiZipResponse());

        await generatePhotoImage(baseConfig, meta);

        const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
        expect(meta).toMatchObject({
            model: 'nai-diffusion-4-5-full',
            width: 768,
            height: 1024,
            steps: 24,
            scale: 6,
            sampler: 'k_dpmpp_2m',
            noiseSchedule: 'polyexponential',
        });
        expect(body).toMatchObject({
            model: 'nai-diffusion-4-5-full',
            parameters: {
                width: 768,
                height: 1024,
                steps: 24,
                scale: 6,
                sampler: 'k_dpmpp_2m',
                noise_schedule: 'polyexponential',
            },
        });
    });

    it('encodes ordinary Vibe images before passing them to NovelAI generate-image', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }))
            .mockResolvedValueOnce(await createNaiZipResponse());

        const onEncoded = vi.fn();
        await generatePhotoImage(baseConfig, naiMeta, {
            vibeReferences: [{
                id: 'ref-1',
                name: 'mood',
                imageDataUrl: 'data:image/png;base64,aGVsbG8=',
                strength: 0.85,
                informationExtracted: 0.9,
                savedVibeId: 'saved-1',
            }],
            onVibeReferenceEncoded: onEncoded,
        });

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenNthCalledWith(1, 'https://image.novelai.net/ai/encode-vibe', expect.objectContaining({
            method: 'POST',
        }));
        const encodeBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
        expect(encodeBody).toMatchObject({
            image: 'aGVsbG8=',
            model: 'nai-diffusion-4-full',
            information_extracted: 0.9,
        });
        const generateBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
        expect(generateBody.parameters.reference_image_multiple).toEqual(['AQI=']);
        expect(generateBody.parameters.reference_strength_multiple).toEqual([0.85]);
        expect(generateBody.parameters.reference_information_extracted_multiple).toEqual([0.9]);
        expect(generateBody.parameters.normalize_reference_strength_multiple).toBe(true);
        expect(onEncoded).toHaveBeenCalledWith(expect.objectContaining({ savedVibeId: 'saved-1' }), expect.objectContaining({
            encodedReference: 'AQI=',
            informationExtracted: 0.9,
            model: 'nai-diffusion-4-full',
        }));
    });

    it('uses cached Vibe encodings without calling encode-vibe again', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(await createNaiZipResponse());
        const onEncoded = vi.fn();

        await generatePhotoImage(baseConfig, naiMeta, {
            vibeReferences: [{
                id: 'ref-1',
                name: 'cached',
                encodedReference: 'cached-encoding',
                strength: 0.6,
                informationExtracted: 0.6,
            }],
            onVibeReferenceEncoded: onEncoded,
        });

        expect(fetch).toHaveBeenCalledTimes(1);
        const generateBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
        expect(generateBody.parameters.reference_image_multiple).toEqual(['cached-encoding']);
        expect(onEncoded).not.toHaveBeenCalled();
    });

    it('stops generation when a Vibe reference fails to encode', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('bad image', { status: 500 }));

        await expect(generatePhotoImage(baseConfig, naiMeta, {
            vibeReferences: [{
                id: 'ref-1',
                name: 'broken',
                imageDataUrl: 'data:image/png;base64,aGVsbG8=',
                strength: 0.6,
                informationExtracted: 0.6,
            }],
        })).rejects.toThrow('broken');

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('reports unsupported NovelAI models before encoding Vibe references', async () => {
        const meta: PhotoMeta = { ...naiMeta, model: 'nai-diffusion-3', naiModel: 'nai-diffusion-3' };
        vi.spyOn(globalThis, 'fetch');

        await expect(generatePhotoImage(baseConfig, meta, {
            vibeReferences: [{
                id: 'ref-1',
                name: 'old-model',
                imageDataUrl: 'data:image/png;base64,aGVsbG8=',
                strength: 0.6,
                informationExtracted: 0.6,
            }],
        })).rejects.toThrow('不支持 Vibe');

        expect(fetch).not.toHaveBeenCalled();
    });

    it('fetches OpenAI-compatible model ids from /models', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            data: [
                { id: 'image2', name: 'Image 2' },
                { name: '【0.08】米/gpt-image-2' },
                { id: 'fake-stream/gemini-3-pro-image-preview', name: '假流/gemini-3-pro-image-preview' },
            ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const result = await testOpenAICompatibleImageConnection(baseConfig.openaiCompatible);

        expect(result.ok).toBe(true);
        expect(result.models).toEqual([
            'image2',
            'gpt-image-2',
            'fake-stream/gemini-3-pro-image-preview',
        ]);
        expect(result.modelOptions).toEqual([
            { id: 'image2', name: 'Image 2', displayName: 'Image 2 / image2' },
            { id: 'gpt-image-2', name: '【0.08】米/gpt-image-2', displayName: '【0.08】米/gpt-image-2 / gpt-image-2' },
            { id: 'fake-stream/gemini-3-pro-image-preview', name: '假流/gemini-3-pro-image-preview', displayName: '假流/gemini-3-pro-image-preview / fake-stream/gemini-3-pro-image-preview' },
        ]);
        expect(fetch).toHaveBeenCalledWith('https://imagegen.example/v1/models', expect.objectContaining({
            method: 'GET',
        }));
    });

    it('does not fake Gemini model ids when /models is unavailable', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
        }));

        const result = await testOpenAICompatibleImageConnection({
            ...baseConfig.openaiCompatible,
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
            model: GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(404);
        expect(result.models).toEqual([]);
        expect(result.modelOptions).toEqual([]);
        expect(result.message).toContain('连接失败：404');
    });

    it('reports /models API key errors as auth failures even when the status is 400', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            error: { message: 'Please pass a valid API key' },
        }), { status: 400, headers: { 'Content-Type': 'application/json' } }));

        const result = await testOpenAICompatibleImageConnection(baseConfig.openaiCompatible);

        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
        expect(result.models).toEqual([]);
        expect(result.modelOptions).toEqual([]);
        expect(result.message).toContain('OpenAI 兼容模型列表鉴权失败 (400)');
        expect(result.message).toContain('Please pass a valid API key');
    });

    it('reads OpenAI-compatible model ids from models arrays without rewriting real prefixed ids', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
            models: [
                'models/gemini-2.5-flash-image',
                { name: '假流/gemini-3-pro-image-preview' },
            ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const result = await testOpenAICompatibleImageConnection({
            ...baseConfig.openaiCompatible,
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
            model: GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
        });

        expect(result.models).toEqual([
            'models/gemini-2.5-flash-image',
            'gemini-3-pro-image-preview',
        ]);
        expect(result.modelOptions).toEqual([
            { id: 'models/gemini-2.5-flash-image', name: 'models/gemini-2.5-flash-image', displayName: 'models/gemini-2.5-flash-image' },
            { id: 'gemini-3-pro-image-preview', name: '假流/gemini-3-pro-image-preview', displayName: '假流/gemini-3-pro-image-preview / gemini-3-pro-image-preview' },
        ]);
    });

    it('throws a clear error when /models returns HTML instead of model JSON', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        }));

        await expect(testOpenAICompatibleImageConnection(baseConfig.openaiCompatible)).rejects.toThrow('接口返回 HTML 页面');
    });

    it('reports a successful but empty /models response without fake fallbacks', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        const result = await testOpenAICompatibleImageConnection(baseConfig.openaiCompatible);

        expect(result.ok).toBe(true);
        expect(result.models).toEqual([]);
        expect(result.modelOptions).toEqual([]);
        expect(result.message).toBe('连接成功，但接口没有返回模型列表');
    });
});
