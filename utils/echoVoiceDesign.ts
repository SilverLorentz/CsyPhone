import type { APIConfig, CharacterProfile, UserProfile } from '../types';
import { extractContent, extractJson, safeFetchJson } from './safeApi';

export type EchoVoiceDesignModelId = 'eleven_multilingual_ttv_v2' | 'eleven_ttv_v3';

export interface EchoVoiceDraft {
    characterNote: string;
    voiceDescription: string;
    previewText: string;
    voiceName: string;
}

export interface EchoVoicePreview {
    audioBase64: string;
    generatedVoiceId: string;
    mediaType: string;
    durationSecs?: number;
    language?: string;
}

export interface EchoCreatedVoice {
    voiceId: string;
    name: string;
    description?: string | null;
}

export interface EchoVoiceDesignResult {
    previews: EchoVoicePreview[];
    text: string;
    safetyAdjusted: boolean;
    enhanceDisabled: boolean;
}

interface DesignVoiceOptions {
    apiKey: string;
    voiceDescription: string;
    previewText: string;
    modelId: EchoVoiceDesignModelId;
    guidanceScale?: number;
    shouldEnhance?: boolean;
}

interface CreateVoiceOptions {
    apiKey: string;
    voiceName: string;
    voiceDescription: string;
    generatedVoiceId: string;
    playedNotSelectedVoiceIds?: string[];
}

const ECHO_VOICE_DESIGN_ENDPOINT = '/elevenlabs-voice-design';
const ECHO_VOICE_CREATE_ENDPOINT = '/elevenlabs-voice-create';

const DESCRIPTION_MIN_LENGTH = 20;
const DESCRIPTION_MAX_LENGTH = 1000;
const PREVIEW_TEXT_MIN_LENGTH = 100;
const PREVIEW_TEXT_MAX_LENGTH = 1000;

const ELEVENLABS_SAFETY_BLOCK_MESSAGE =
    'ElevenLabs 安全审核拦截了这组回声提示。已尝试使用中性试听文本重试，仍未通过；请把提示词和试听文本改成更日常、中性的描述后再试。';

const SAFE_PREVIEW_TEXT_ZH =
    '今天我在测试这段声音的自然程度。请用平稳清晰的语气读出这段话，保留适当停顿和呼吸感，让语速不要太快，也不要太慢。窗边有一杯温热的茶，桌上放着一本翻开的书，外面的光线很安静。我会把每个词说得柔和、稳定、容易听清，像一条普通而真诚的日常留言。';

const SAFE_PREVIEW_TEXT_EN =
    'Today I am testing how this voice sounds in a calm, natural message. Please speak clearly, with steady pacing, soft pauses, and a warm conversational tone. There is a cup of tea on the desk, an open notebook by the window, and quiet light in the room. I will keep this sample simple, balanced, and easy to understand.';

function clip(value: string | undefined, maxLength: number): string {
    const normalized = (value || '').trim();
    return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function countMatches(value: string, pattern: RegExp): number {
    return value.match(pattern)?.length || 0;
}

function chooseSafePreviewText(original: string): string {
    const latinChars = countMatches(original, /[A-Za-z]/g);
    const cjkChars = countMatches(original, /[\u3400-\u9fff]/g);
    return latinChars > cjkChars ? SAFE_PREVIEW_TEXT_EN : SAFE_PREVIEW_TEXT_ZH;
}

function isElevenLabsSafetyError(message: string): boolean {
    return /safety|guidelines|policy|blocked|potentially doesn't follow|content\s+(policy|guideline)|not allowed|violat/i.test(message);
}

function sanitizeJsonString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeVoiceName(value: string, charName: string): string {
    const clean = value.trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, ' ');
    return clip(clean || `${charName} Echo`, 60);
}

function normalizeDescription(value: string, char: CharacterProfile): string {
    const description = clip(value, DESCRIPTION_MAX_LENGTH);
    if (description.length >= DESCRIPTION_MIN_LENGTH) return description;

    const fallbackParts = [
        `A natural character voice for ${char.name}.`,
        char.description ? `Personality: ${clip(char.description, 160)}` : '',
        'Warm, expressive, close, and suitable for conversational roleplay.',
    ].filter(Boolean);

    return clip(fallbackParts.join(' '), DESCRIPTION_MAX_LENGTH);
}

function normalizePreviewText(value: string, char: CharacterProfile, user: UserProfile): string {
    const previewText = clip(value, PREVIEW_TEXT_MAX_LENGTH);
    if (previewText.length >= PREVIEW_TEXT_MIN_LENGTH) return previewText;

    return clip(
        `${user.name}，如果这是你第一次听见我的声音，那我希望它不要太像一段被念出来的设定。` +
        `我是${char.name}，我想让这句话听起来近一点、自然一点，像我真的在屏幕另一边停了一下，` +
        `然后认真地把话说给你听。哪怕只是很短的一句问候，也要有呼吸、有迟疑、有一点只属于我们的距离。`,
        PREVIEW_TEXT_MAX_LENGTH,
    );
}

function buildEchoPrompt(char: CharacterProfile, user: UserProfile): string {
    return `你正在帮助一个角色为 ElevenLabs Voice Design 写音色提示词。

角色信息：
- 角色名：${char.name}
- 角色简介：${clip(char.description, 500) || '未填写'}
- 世界观/外观：${clip(char.worldview, 700) || '未填写'}
- 人设提示：${clip(char.systemPrompt, 1400) || '未填写'}
- 用户名：${user.name}
- 用户简介：${clip(user.bio, 300) || '未填写'}

请让角色先用第一人称向用户描述“我觉得自己的声音应该是什么样”，然后把它整理成 ElevenLabs 可用的 Voice Design 提示词。试听台词保持日常、中性，不写暧昧、身体照护、控制感或容易被安全审核误判的情节。

严格输出 JSON，不要加 Markdown，不要加解释：
{
  "characterNote": "中文，第一人称，像角色本人在给用户提声线建议，60-160字",
  "voiceDescription": "英文，20-1000字符，描述成年声线、音色、语速、情绪、自然说话距离、口音/语言倾向。不要模仿名人或真实人物，不要写 copyrighted character。",
  "previewText": "试听台词，100-1000字符，用角色本人的说话方式，可以中文或中英混合，内容保持日常、中性，不要解释功能，不要提 ElevenLabs。",
  "voiceName": "简短音色名，优先包含角色名"
}`;
}

function extractChatText(data: any): string {
    return extractContent(data)
        || data?.choices?.[0]?.text?.trim?.()
        || data?.choices?.[0]?.message?.reasoning_content?.trim?.()
        || '';
}

export function normalizeEchoVoiceDraft(raw: unknown, char: CharacterProfile, user: UserProfile): EchoVoiceDraft {
    const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const characterNote = sanitizeJsonString(
        source.characterNote ?? source.character_note,
        `我想让自己的声音听起来像${char.name}本人：自然、贴近、有一点呼吸感，不要太像机器在念稿。`,
    );

    return {
        characterNote: clip(characterNote, 260),
        voiceDescription: normalizeDescription(sanitizeJsonString(source.voiceDescription ?? source.voice_description), char),
        previewText: normalizePreviewText(sanitizeJsonString(source.previewText ?? source.preview_text), char, user),
        voiceName: normalizeVoiceName(sanitizeJsonString(source.voiceName ?? source.voice_name), char.name),
    };
}

export async function generateCharacterEchoVoiceDraft(
    apiConfig: APIConfig,
    char: CharacterProfile,
    user: UserProfile,
): Promise<EchoVoiceDraft> {
    if (!apiConfig.baseUrl?.trim()) {
        throw new Error('请先配置聊天 API URL');
    }
    if (!apiConfig.model?.trim()) {
        throw new Error('请先配置聊天 API 模型');
    }

    const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
    const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}`,
        },
        body: JSON.stringify({
            model: apiConfig.model,
            temperature: 0.7,
            stream: false,
            messages: [
                {
                    role: 'system',
                    content: '你是角色声线导演，只输出可解析 JSON。',
                },
                {
                    role: 'user',
                    content: buildEchoPrompt(char, user),
                },
            ],
        }),
    });

    const text = extractChatText(data);
    const parsed = extractJson(text);
    return normalizeEchoVoiceDraft(parsed, char, user);
}

async function readElevenLabsError(response: Response): Promise<string> {
    const fallback = `ElevenLabs HTTP ${response.status}`;
    const text = await response.text().catch(() => '');
    if (!text.trim()) return fallback;

    try {
        const data = JSON.parse(text) as {
            error?: string;
            message?: string;
            detail?: string | { message?: string };
        };
        if (typeof data.detail === 'object' && data.detail?.message) return data.detail.message;
        if (typeof data.detail === 'string') return data.detail;
        return data.message || data.error || fallback;
    } catch {
        return text.slice(0, 300);
    }
}

function ensureDescriptionLength(value: string): string {
    const normalized = value.trim();
    if (normalized.length < DESCRIPTION_MIN_LENGTH) {
        throw new Error(`音色提示词至少需要 ${DESCRIPTION_MIN_LENGTH} 个字符`);
    }
    if (normalized.length > DESCRIPTION_MAX_LENGTH) {
        throw new Error(`音色提示词不能超过 ${DESCRIPTION_MAX_LENGTH} 个字符`);
    }
    return normalized;
}

function ensurePreviewTextLength(value: string): string {
    const normalized = value.trim();
    if (normalized.length < PREVIEW_TEXT_MIN_LENGTH) {
        throw new Error(`试听文本至少需要 ${PREVIEW_TEXT_MIN_LENGTH} 个字符`);
    }
    if (normalized.length > PREVIEW_TEXT_MAX_LENGTH) {
        throw new Error(`试听文本不能超过 ${PREVIEW_TEXT_MAX_LENGTH} 个字符`);
    }
    return normalized;
}

function normalizePreview(raw: any): EchoVoicePreview {
    return {
        audioBase64: String(raw?.audio_base_64 || raw?.audioBase64 || ''),
        generatedVoiceId: String(raw?.generated_voice_id || raw?.generatedVoiceId || ''),
        mediaType: String(raw?.media_type || raw?.mediaType || 'audio/mpeg'),
        durationSecs: typeof raw?.duration_secs === 'number' ? raw.duration_secs : raw?.durationSecs,
        language: typeof raw?.language === 'string' ? raw.language : undefined,
    };
}

async function requestVoiceDesign(
    apiKey: string,
    voiceDescription: string,
    previewText: string,
    options: DesignVoiceOptions,
    shouldEnhance: boolean,
): Promise<Response> {
    return fetch(ECHO_VOICE_DESIGN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-ElevenLabs-Key': apiKey,
        },
        body: JSON.stringify({
            voice_description: voiceDescription,
            model_id: options.modelId,
            text: previewText,
            guidance_scale: options.guidanceScale ?? 5,
            should_enhance: shouldEnhance,
        }),
    });
}

export async function designElevenLabsVoice(options: DesignVoiceOptions): Promise<EchoVoiceDesignResult> {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error('请先配置 ElevenLabs API Key');

    const voiceDescription = ensureDescriptionLength(options.voiceDescription);
    const previewText = ensurePreviewTextLength(options.previewText);
    const requestedShouldEnhance = options.shouldEnhance ?? true;

    let response = await requestVoiceDesign(apiKey, voiceDescription, previewText, options, requestedShouldEnhance);
    let textUsed = previewText;
    let safetyAdjusted = false;
    let enhanceDisabled = false;

    if (!response.ok) {
        const firstError = await readElevenLabsError(response);
        if (!isElevenLabsSafetyError(firstError)) {
            throw new Error(firstError);
        }

        textUsed = chooseSafePreviewText(previewText);
        safetyAdjusted = true;
        response = await requestVoiceDesign(apiKey, voiceDescription, textUsed, options, requestedShouldEnhance);

        if (!response.ok) {
            const retryError = await readElevenLabsError(response);
            if (!isElevenLabsSafetyError(retryError) || !requestedShouldEnhance) {
                throw new Error(isElevenLabsSafetyError(retryError) ? ELEVENLABS_SAFETY_BLOCK_MESSAGE : retryError);
            }

            enhanceDisabled = true;
            response = await requestVoiceDesign(apiKey, voiceDescription, textUsed, options, false);
            if (!response.ok) {
                const finalError = await readElevenLabsError(response);
                throw new Error(isElevenLabsSafetyError(finalError) ? ELEVENLABS_SAFETY_BLOCK_MESSAGE : finalError);
            }
        }
    }

    const data = await response.json();
    const previews = Array.isArray(data?.previews)
        ? data.previews.map(normalizePreview).filter((preview: EchoVoicePreview) => preview.generatedVoiceId)
        : [];
    if (previews.length === 0) {
        throw new Error('ElevenLabs 没有返回可用音色预览');
    }

    return {
        previews,
        text: typeof data?.text === 'string' ? data.text : textUsed,
        safetyAdjusted,
        enhanceDisabled,
    };
}

export async function createElevenLabsVoice(options: CreateVoiceOptions): Promise<EchoCreatedVoice> {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error('请先配置 ElevenLabs API Key');

    const generatedVoiceId = options.generatedVoiceId.trim();
    if (!generatedVoiceId) throw new Error('请先选择一个预览音色');

    const voiceDescription = ensureDescriptionLength(options.voiceDescription);
    const response = await fetch(ECHO_VOICE_CREATE_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-ElevenLabs-Key': apiKey,
        },
        body: JSON.stringify({
            voice_name: options.voiceName.trim() || 'Echo voice',
            voice_description: voiceDescription,
            generated_voice_id: generatedVoiceId,
            played_not_selected_voice_ids: options.playedNotSelectedVoiceIds || undefined,
        }),
    });

    if (!response.ok) {
        throw new Error(await readElevenLabsError(response));
    }

    const data = await response.json();
    const voiceId = String(data?.voice_id || data?.voiceId || '');
    if (!voiceId) {
        throw new Error('ElevenLabs 创建成功响应里没有 voice_id');
    }

    return {
        voiceId,
        name: String(data?.name || options.voiceName || 'Echo voice'),
        description: typeof data?.description === 'string' ? data.description : null,
    };
}
