// @vitest-environment jsdom

import { afterEach,describe,expect,it,vi } from 'vitest';
import { DEFAULT_TTS_CONFIG,type TtsConfig } from '../types';
import { ElevenLabsTtsHttpStream } from '../utils/elevenLabsTtsHttpStream';
import { createVoiceCallTtsClient,isElevenLabsV3Model } from '../utils/voiceCallTtsClient';

function buildConfig(overrides: Partial<TtsConfig['elevenLabs']> = {}): TtsConfig {
    return {
        ...DEFAULT_TTS_CONFIG,
        voiceCallProvider: 'elevenlabs',
        audioSetting: {
            ...DEFAULT_TTS_CONFIG.audioSetting,
            format: 'pcm',
            audio_sample_rate: 24000,
        },
        elevenLabs: {
            ...DEFAULT_TTS_CONFIG.elevenLabs,
            apiKey: 'eleven-key',
            voiceId: 'voice-1',
            modelId: 'eleven_v3',
            languageCode: 'en',
            ...overrides,
        },
    };
}

function streamResponse(chunks: Uint8Array[]): Response {
    return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(chunk);
            }
            controller.close();
        },
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
    });
}

describe('ElevenLabsTtsHttpStream', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses the HTTP streaming client for eleven_v3', () => {
        const config = buildConfig();
        expect(isElevenLabsV3Model(config)).toBe(true);
        expect(createVoiceCallTtsClient(config)).toBeInstanceOf(ElevenLabsTtsHttpStream);
    });

    it('streams v3 speech through the same-origin proxy', async () => {
        const audioChunks: Array<{ audio: Uint8Array; isFinal: boolean }> = [];
        const onTaskFinished = vi.fn();
        const fetchMock = vi.fn().mockResolvedValue(streamResponse([
            new Uint8Array([1, 0, 2, 0]),
        ]));
        vi.stubGlobal('fetch', fetchMock);

        const config = buildConfig();
        const client = new ElevenLabsTtsHttpStream({
            onAudioChunk: chunk => audioChunks.push(chunk),
            onTaskFinished,
        });

        await client.connect(config);
        await client.start(config);
        client.sendText('[sighs] Hello.');
        await client.finish();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [input, init] = fetchMock.mock.calls[0];
        expect(input).toBe('/elevenlabs-tts-stream');
        expect(init?.headers).toMatchObject({
            'Content-Type': 'application/json',
            'X-ElevenLabs-Key': 'eleven-key',
        });

        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
            voiceId: 'voice-1',
            text: '[sighs] Hello. ',
            modelId: 'eleven_v3',
            languageCode: 'en',
            outputFormat: 'pcm_24000',
        });
        expect(body.voiceSettings).toMatchObject({
            stability: config.elevenLabs.stability,
            similarity_boost: config.elevenLabs.similarityBoost,
            style: config.elevenLabs.style,
            speed: config.elevenLabs.speed,
            use_speaker_boost: config.elevenLabs.useSpeakerBoost,
        });

        expect(Array.from(audioChunks[0].audio)).toEqual([1, 0, 2, 0]);
        expect(audioChunks[audioChunks.length - 1].isFinal).toBe(true);
        expect(onTaskFinished).toHaveBeenCalledTimes(1);
    });

    it('keeps PCM frames aligned across arbitrary fetch chunks', async () => {
        const audioChunks: Uint8Array[] = [];
        const fetchMock = vi.fn().mockResolvedValue(streamResponse([
            new Uint8Array([1]),
            new Uint8Array([0, 2, 0, 3]),
        ]));
        vi.stubGlobal('fetch', fetchMock);

        const client = new ElevenLabsTtsHttpStream({
            onAudioChunk: chunk => {
                if (!chunk.isFinal) {
                    audioChunks.push(chunk.audio);
                }
            },
        });

        await client.connect(buildConfig());
        await client.start(buildConfig());
        client.sendText('Hello.');
        await client.finish();

        expect(audioChunks.map(chunk => Array.from(chunk))).toEqual([[1, 0, 2, 0]]);
    });
});
