// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {
    EMBEDDING_API_KEY_KEY,
    EMBEDDING_BASE_URL_KEY,
    EMBEDDING_MODEL_KEY,
    EMBEDDING_PROVIDER_KEY,
    DEFAULT_CHAT_TEMPERATURE,
    GEMINI_OPENAI_COMPATIBLE_IMAGE_DEFAULTS,
    GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
    LEGACY_SUB_API_BASE_URL_KEY,
    LEGACY_SUB_API_KEY,
    LEGACY_SUB_API_MODEL_KEY,
    PHOTO_STYLE_PRESETS_KEY,
    PHOTO_STYLE_PROVIDER_SCOPES,
    REALTIME_CONFIG_KEY,
    SECONDARY_API_CONFIG_KEY,
    SECONDARY_API_POOL_CURSOR_KEY,
    SECONDARY_API_POOL_KEY,
    SECONDARY_API_POOL_STATE_KEY,
    STT_CONFIG_KEY,
    TTS_CONFIG_KEY,
    getEmbeddingConfig,
    getPhotoStylePresets,
    getRealtimeConfig,
    getSecondaryApiConfig,
    getSecondaryApiPool,
    getSttConfig,
    getTtsConfig,
    hasCloudSyncTarget,
    markSecondaryApiConfigFailure,
    normalizeChatTemperature,
    selectSecondaryApiConfig,
    setEmbeddingConfig,
    setSecondaryApiPool,
    setSecondaryApiConfig,
} from './runtimeConfig';

describe('runtimeConfig', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
    });

    it('reads the structured secondary API config before legacy keys', () => {
        localStorage.setItem(SECONDARY_API_CONFIG_KEY, JSON.stringify({
            apiKey: 'structured-key',
            baseUrl: 'https://llm.example.com/',
            model: 'gpt-structured',
        }));
        localStorage.setItem(LEGACY_SUB_API_KEY, 'legacy-key');
        localStorage.setItem(LEGACY_SUB_API_BASE_URL_KEY, 'https://legacy.example.com');
        localStorage.setItem(LEGACY_SUB_API_MODEL_KEY, 'gpt-legacy');

        expect(getSecondaryApiConfig()).toEqual({
            apiKey: 'structured-key',
            baseUrl: 'https://llm.example.com',
            model: 'gpt-structured',
            temperature: DEFAULT_CHAT_TEMPERATURE,
            useGeminiJailbreak: false,
            useDeepSeekMode: false,
            disablePrefill: false,
            streamChat: false,
        });
    });

    it('normalizes chat temperature with clamping and the current default', () => {
        expect(normalizeChatTemperature(undefined)).toBe(DEFAULT_CHAT_TEMPERATURE);
        expect(normalizeChatTemperature('1.234')).toBe(1.23);
        expect(normalizeChatTemperature('-1')).toBe(0);
        expect(normalizeChatTemperature(9)).toBe(2);
    });

    it('exposes split GPT and Gemini photo style scopes', () => {
        expect(PHOTO_STYLE_PROVIDER_SCOPES).toEqual(['all', 'novelai', 'openai-gpt', 'openai-gemini']);
    });

    it('migrates built-in GPT and Gemini photo style presets into saved style lists', () => {
        localStorage.setItem(PHOTO_STYLE_PRESETS_KEY, JSON.stringify([
            {
                id: 'custom-style',
                name: 'Custom Style',
                providerScope: 'openai-compatible',
                positivePrompt: 'soft light',
                negativePrompt: '',
            },
        ]));

        const presets = getPhotoStylePresets();
        const ids = presets.map(preset => preset.id);

        expect(presets.find(preset => preset.id === 'custom-style')?.providerScope).toBe('openai-gpt');
        expect(ids).toContain('loveshow-solo-guoman');
        expect(ids).toContain('loveshow-gemini-solo-guoman');
        expect(ids).toContain('gemini-nano-banana-natural-snapshot');
    });

    it('uses the latest Gemini default model for compatible image defaults', () => {
        expect(GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL).toBe('gemini-3.1-flash-image-preview');
        expect(GEMINI_OPENAI_COMPATIBLE_IMAGE_DEFAULTS.model).toBe('gemini-3.1-flash-image-preview');
    });

    it('clears app-owned Gemini style preset model locks without changing custom styles', () => {
        localStorage.setItem(PHOTO_STYLE_PRESETS_KEY, JSON.stringify([
            {
                id: 'gemini-nano-banana-natural-snapshot',
                name: 'Gemini / Nano Banana 自然随拍',
                providerScope: 'openai-gemini',
                model: 'gemini-2.5-flash-image',
                positivePrompt: 'natural snapshot',
                negativePrompt: '',
            },
            {
                id: 'loveshow-gemini-solo-real',
                name: 'Gemini 单人 · 真人风',
                providerScope: 'openai-gemini',
                model: GEMINI_OPENAI_COMPATIBLE_IMAGE_MODEL,
                positivePrompt: 'real portrait',
                negativePrompt: '',
            },
            {
                id: 'custom-gemini-style',
                name: 'Custom Gemini Style',
                providerScope: 'openai-gemini',
                model: 'gemini-2.5-flash-image',
                positivePrompt: 'custom snapshot',
                negativePrompt: '',
            },
        ]));

        const presets = getPhotoStylePresets();

        expect(presets.find(preset => preset.id === 'gemini-nano-banana-natural-snapshot')?.model)
            .toBeUndefined();
        expect(presets.find(preset => preset.id === 'loveshow-gemini-solo-real')?.model)
            .toBeUndefined();
        expect(presets.find(preset => preset.id === 'custom-gemini-style')?.model)
            .toBe('gemini-2.5-flash-image');
    });

    it('writes the secondary API config to both the structured key and legacy keys', () => {
        setSecondaryApiConfig({
            apiKey: 'sub-key',
            baseUrl: 'https://llm.example.com/',
            model: 'gpt-test',
        });

        expect(JSON.parse(localStorage.getItem(SECONDARY_API_CONFIG_KEY) || '{}')).toMatchObject({
            apiKey: 'sub-key',
            baseUrl: 'https://llm.example.com',
            model: 'gpt-test',
        });
        expect(localStorage.getItem(LEGACY_SUB_API_KEY)).toBe('sub-key');
        expect(localStorage.getItem(LEGACY_SUB_API_BASE_URL_KEY)).toBe('https://llm.example.com');
        expect(localStorage.getItem(LEGACY_SUB_API_MODEL_KEY)).toBe('gpt-test');
        expect(getSecondaryApiPool()).toHaveLength(1);
    });

    it('round-robins enabled secondary API pool entries', () => {
        setSecondaryApiPool([
            {
                id: 'sub-a',
                name: 'A',
                enabled: true,
                config: { apiKey: 'key-a', baseUrl: 'https://a.example.com', model: 'model-a' },
            },
            {
                id: 'sub-b',
                name: 'B',
                enabled: true,
                config: { apiKey: 'key-b', baseUrl: 'https://b.example.com', model: 'model-b' },
            },
        ]);

        expect(selectSecondaryApiConfig()?.model).toBe('model-a');
        expect(selectSecondaryApiConfig()?.model).toBe('model-b');
        expect(selectSecondaryApiConfig()?.model).toBe('model-a');
        expect(localStorage.getItem(SECONDARY_API_POOL_CURSOR_KEY)).toBe('1');
    });

    it('skips cooled-down secondary API pool entries', () => {
        setSecondaryApiPool([
            {
                id: 'sub-a',
                name: 'A',
                enabled: true,
                config: { apiKey: 'key-a', baseUrl: 'https://a.example.com', model: 'model-a' },
            },
            {
                id: 'sub-b',
                name: 'B',
                enabled: true,
                config: { apiKey: 'key-b', baseUrl: 'https://b.example.com', model: 'model-b' },
            },
        ]);

        markSecondaryApiConfigFailure(
            { apiKey: 'key-a', baseUrl: 'https://a.example.com', model: 'model-a' },
            Object.assign(new Error('HTTP 429'), { status: 429 }),
        );

        expect(getSecondaryApiConfig()?.model).toBe('model-b');
        expect(selectSecondaryApiConfig()?.model).toBe('model-b');

        const state = JSON.parse(localStorage.getItem(SECONDARY_API_POOL_STATE_KEY) || '{}');
        expect(state['sub-a'].cooldownUntil).toBeGreaterThan(Date.now());
        expect(localStorage.getItem(SECONDARY_API_POOL_KEY)).toContain('model-a');
    });

    it('normalizes embedding config with provider-aware defaults', () => {
        localStorage.setItem(EMBEDDING_PROVIDER_KEY, 'openai');
        localStorage.setItem(EMBEDDING_API_KEY_KEY, 'embed-key');
        localStorage.setItem(EMBEDDING_BASE_URL_KEY, 'https://api.siliconflow.cn/v1/');
        localStorage.setItem(EMBEDDING_MODEL_KEY, 'Qwen/Qwen3-Embedding-8B');

        expect(getEmbeddingConfig()).toMatchObject({
            provider: 'openai',
            apiKey: 'embed-key',
            baseUrl: 'https://api.siliconflow.cn/v1',
            model: 'Qwen/Qwen3-Embedding-8B',
            rerankModel: 'Qwen/Qwen3-Reranker-8B',
            dimensions: 1024,
        });
    });

    it('round-trips embedding config through the runtime setter', () => {
        setEmbeddingConfig({
            provider: 'openai',
            apiKey: 'embed-key',
            baseUrl: 'https://api.siliconflow.cn/v1/',
            model: 'Qwen/Qwen3-Embedding-8B',
            rerankModel: 'ignored-at-write-time',
            dimensions: 2048,
            rerankApiKey: 'rerank-key',
            rerankUsePaid: true,
        });

        expect(getEmbeddingConfig()).toEqual({
            provider: 'openai',
            apiKey: 'embed-key',
            baseUrl: 'https://api.siliconflow.cn/v1',
            model: 'Qwen/Qwen3-Embedding-8B',
            rerankModel: 'Qwen/Qwen3-Reranker-8B',
            dimensions: 1024,
            rerankApiKey: 'rerank-key',
            rerankUsePaid: true,
        });
    });

    it('merges STT config onto defaults without throwing on partial JSON', () => {
        localStorage.setItem(STT_CONFIG_KEY, JSON.stringify({
            provider: 'siliconflow',
            siliconflowApiKey: 'silicon-key',
        }));

        expect(getSttConfig()).toEqual({
            provider: 'siliconflow',
            groqApiKey: '',
            siliconflowApiKey: 'silicon-key',
            baseUrl: undefined,
            model: undefined,
            language: undefined,
            voiceCallManualSend: false,
        });
    });

    it('preserves STT base URL overrides', () => {
        localStorage.setItem(STT_CONFIG_KEY, JSON.stringify({
            provider: 'siliconflow',
            siliconflowApiKey: 'silicon-key',
            baseUrl: 'https://api-st.siliconflow.cn/v1',
            language: 'en',
            voiceCallManualSend: true,
        }));

        expect(getSttConfig()).toMatchObject({
            provider: 'siliconflow',
            siliconflowApiKey: 'silicon-key',
            baseUrl: 'https://api-st.siliconflow.cn/v1',
            language: 'en',
            voiceCallManualSend: true,
        });
    });

    it('normalizes ElevenLabs voice-call TTS config onto safe defaults', () => {
        localStorage.setItem(TTS_CONFIG_KEY, JSON.stringify({
            voiceCallProvider: 'elevenlabs',
            elevenLabs: {
                apiKey: ' eleven-key ',
                voiceId: ' eleven-voice ',
                modelId: 'eleven_v3',
                languageCode: ' en ',
                stability: 2,
                similarityBoost: '-1',
                style: '2',
                speed: '2',
                useSpeakerBoost: true,
            },
        }));

        expect(getTtsConfig()).toMatchObject({
            voiceCallProvider: 'elevenlabs',
            elevenLabs: {
                apiKey: 'eleven-key',
                voiceId: 'eleven-voice',
                modelId: 'eleven_v3',
                languageCode: 'en',
                stability: 1,
                similarityBoost: 0,
                style: 1,
                speed: 1.2,
                useSpeakerBoost: true,
            },
        });
    });

    it('defaults xhs config to the recommended bridge server', () => {
        expect(getRealtimeConfig().xhsMcpConfig).toEqual({
            enabled: false,
            serverUrl: 'http://localhost:18061/api',
            loggedInUserId: undefined,
            loggedInNickname: undefined,
        });
    });

    it('defaults canva config to the recommended bridge server', () => {
        expect(getRealtimeConfig().canvaMcpConfig).toEqual({
            enabled: false,
            serverUrl: 'http://localhost:18062/api',
            workspaceLabel: undefined,
        });
    });

    it('normalizes canva MCP config whitespace', () => {
        localStorage.setItem(REALTIME_CONFIG_KEY, JSON.stringify({
            canvaEnabled: true,
            canvaMcpConfig: {
                enabled: true,
                serverUrl: '  https://canva-mcp.example.com/mcp  ',
                workspaceLabel: '  Sully  ',
            },
        }));

        expect(getRealtimeConfig().canvaMcpConfig).toEqual({
            enabled: true,
            serverUrl: 'https://canva-mcp.example.com/mcp',
            workspaceLabel: 'Sully',
        });
    });

    it('migrates the untouched legacy xhs MCP default to the bridge server', () => {
        localStorage.setItem(REALTIME_CONFIG_KEY, JSON.stringify({
            xhsEnabled: false,
            xhsMcpConfig: {
                enabled: false,
                serverUrl: 'http://localhost:18060/mcp',
            },
        }));

        expect(getRealtimeConfig().xhsMcpConfig).toEqual({
            enabled: false,
            serverUrl: 'http://localhost:18061/api',
            loggedInUserId: undefined,
            loggedInNickname: undefined,
        });
    });

    it('preserves an explicitly enabled legacy MCP endpoint', () => {
        localStorage.setItem(REALTIME_CONFIG_KEY, JSON.stringify({
            xhsEnabled: true,
            xhsMcpConfig: {
                enabled: true,
                serverUrl: 'http://localhost:18060/mcp',
            },
        }));

        expect(getRealtimeConfig().xhsMcpConfig).toEqual({
            enabled: true,
            serverUrl: 'http://localhost:18060/mcp',
            loggedInUserId: undefined,
            loggedInNickname: undefined,
        });
    });

    it('detects when cloud sync can write based on backend env + token', () => {
        vi.stubEnv('VITE_CSYOS_BACKEND_URL', 'https://backend.example.com');
        vi.stubEnv('VITE_CSYOS_BACKEND_TOKEN', 'token-1');

        expect(hasCloudSyncTarget()).toBe(true);
    });
});
