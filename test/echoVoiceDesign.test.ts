// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIConfig, CharacterProfile, UserProfile } from '../types';
import {
    createElevenLabsVoice,
    designElevenLabsVoice,
    generateCharacterEchoVoiceDraft,
    normalizeEchoVoiceDraft,
} from '../utils/echoVoiceDesign';

const apiConfig: APIConfig = {
    baseUrl: 'https://llm.example.test/v1',
    apiKey: 'sk-test',
    model: 'test-model',
};

const char = {
    id: 'char-a',
    name: 'Sully',
    avatar: '',
    description: '嘴硬但护短的电波系 AI。',
    systemPrompt: '说话短，带一点故障风。',
    memories: [],
} as CharacterProfile;

const user: UserProfile = {
    name: 'User',
    avatar: '',
    bio: '喜欢自然的声音。',
};

describe('Echo voice design helpers', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('asks the configured chat API for character voice guidance', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            choices: [{
                message: {
                    content: JSON.stringify({
                        characterNote: '我想听起来近一点，不要太端着。',
                        voiceDescription: 'A close, warm, slightly glitchy young adult male voice with dry humor and soft intimacy.',
                        previewText: 'User，如果你现在听见这句话，就当作系统终于学会了好好说人话。我会尽量让声音靠近一点，别太亮，也别太硬，像隔着屏幕压低声音跟你讲秘密。',
                        voiceName: 'Sully Echo',
                    }),
                },
            }],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const draft = await generateCharacterEchoVoiceDraft(apiConfig, char, user);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://llm.example.test/v1/chat/completions');
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
        expect(String(init?.body)).toContain('"model":"test-model"');
        expect(String(init?.body)).not.toContain('elevenlabs-voice-design');
        expect(draft.voiceDescription).toContain('slightly glitchy');
        expect(draft.previewText.length).toBeGreaterThanOrEqual(100);
    });

    it('normalizes incomplete AI JSON into a valid draft', () => {
        const draft = normalizeEchoVoiceDraft({ voiceDescription: 'too short' }, char, user);

        expect(draft.characterNote).toContain('Sully');
        expect(draft.voiceDescription.length).toBeGreaterThanOrEqual(20);
        expect(draft.previewText.length).toBeGreaterThanOrEqual(100);
        expect(draft.voiceName).toBe('Sully Echo');
    });

    it('generates ElevenLabs previews through the same-origin proxy', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            text: 'preview text from upstream',
            previews: [
                {
                    generated_voice_id: 'generated-1',
                    audio_base_64: 'AAAA',
                    media_type: 'audio/mpeg',
                    duration_secs: 3.2,
                },
            ],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await designElevenLabsVoice({
            apiKey: 'eleven-key',
            voiceDescription: 'A warm, natural, intimate voice with a low conversational tone.',
            previewText: '这是一段足够长的试听文本，用来确认这个声音是否适合角色。它需要自然、贴近、有停顿，像在屏幕另一边认真地说话，而不是机械朗读。最好还能听出一点迟疑、一点靠近，以及把一句普通的话说得像只说给某个人听的感觉。',
            modelId: 'eleven_ttv_v3',
            guidanceScale: 7,
            shouldEnhance: true,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/elevenlabs-voice-design');
        expect(init?.headers).toMatchObject({ 'X-ElevenLabs-Key': 'eleven-key' });
        expect(JSON.parse(String(init?.body))).toMatchObject({
            model_id: 'eleven_ttv_v3',
            guidance_scale: 7,
            should_enhance: true,
        });
        expect(result.previews[0]).toMatchObject({
            generatedVoiceId: 'generated-1',
            audioBase64: 'AAAA',
            mediaType: 'audio/mpeg',
        });
        expect(result.safetyAdjusted).toBe(false);
    });

    it('retries Voice Design with a neutral preview text when ElevenLabs blocks the sample', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                detail: {
                    message: "Sorry, this prompt potentially doesn't follow our safety guidelines and therefore has been blocked.",
                },
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                text: 'neutral retry sample',
                previews: [
                    {
                        generated_voice_id: 'generated-safe-1',
                        audio_base_64: 'BBBB',
                        media_type: 'audio/mpeg',
                    },
                ],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await designElevenLabsVoice({
            apiKey: 'eleven-key',
            voiceDescription: 'A gentle adult voice with a calm conversational tone and clear pacing.',
            previewText: 'Hey, Yuyu, come here for a moment. Are you feeling tired today? Let me help you slow down and take a quiet break, because this sample is intentionally long enough for the API minimum length.',
            modelId: 'eleven_multilingual_ttv_v2',
            guidanceScale: 5,
            shouldEnhance: true,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        const retryBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
        expect(firstBody.text).toContain('Hey, Yuyu');
        expect(retryBody.text).not.toContain('Hey, Yuyu');
        expect(retryBody.text).toContain('Today I am testing');
        expect(result.safetyAdjusted).toBe(true);
        expect(result.enhanceDisabled).toBe(false);
        expect(result.text).toBe('neutral retry sample');
        expect(result.previews[0].generatedVoiceId).toBe('generated-safe-1');
    });

    it('disables prompt enhancement if the safety retry is still blocked', async () => {
        const safetyResponse = () => new Response(JSON.stringify({
            detail: "Sorry, this prompt potentially doesn't follow our safety guidelines and therefore has been blocked.",
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(safetyResponse())
            .mockResolvedValueOnce(safetyResponse())
            .mockResolvedValueOnce(new Response(JSON.stringify({
                previews: [
                    {
                        generated_voice_id: 'generated-safe-2',
                        audio_base_64: 'CCCC',
                        media_type: 'audio/mpeg',
                    },
                ],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await designElevenLabsVoice({
            apiKey: 'eleven-key',
            voiceDescription: 'A gentle adult voice with a calm conversational tone and clear pacing.',
            previewText: '这是一段会被上游错误拦截的测试文本。它需要达到最小长度，所以这里补充一些普通的日常描述：窗边很安静，杯子里有热茶，语速自然，停顿清楚，声音稳定。接下来还会读到书页翻动、键盘轻响和午后光线这些中性的画面，用来确认音色的清晰度。',
            modelId: 'eleven_multilingual_ttv_v2',
            guidanceScale: 5,
            shouldEnhance: true,
        });

        expect(fetchMock).toHaveBeenCalledTimes(3);
        const thirdBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
        expect(thirdBody.should_enhance).toBe(false);
        expect(thirdBody.text).toContain('今天我在测试');
        expect(result.safetyAdjusted).toBe(true);
        expect(result.enhanceDisabled).toBe(true);
    });

    it('saves a selected preview through the create voice proxy', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            voice_id: 'voice-created-1',
            name: 'Sully Echo',
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const voice = await createElevenLabsVoice({
            apiKey: 'eleven-key',
            voiceName: 'Sully Echo',
            voiceDescription: 'A warm, natural, intimate voice with a low conversational tone.',
            generatedVoiceId: 'generated-1',
            playedNotSelectedVoiceIds: ['generated-2'],
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/elevenlabs-voice-create');
        expect(init?.headers).toMatchObject({ 'X-ElevenLabs-Key': 'eleven-key' });
        expect(JSON.parse(String(init?.body))).toMatchObject({
            voice_name: 'Sully Echo',
            generated_voice_id: 'generated-1',
            played_not_selected_voice_ids: ['generated-2'],
        });
        expect(voice.voiceId).toBe('voice-created-1');
    });
});
