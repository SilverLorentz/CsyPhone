// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import SettingsMenu from './SettingsMenu';

const { getRuntimeConfigSnapshot } = vi.hoisted(() => ({
    getRuntimeConfigSnapshot: vi.fn(),
}));

vi.mock('../../utils/runtimeConfig', () => ({
    getRuntimeConfigSnapshot,
    inferEmbeddingEngineId: (modelId?: string | null) => (
        String(modelId || '').toLowerCase().includes('qwen3-embedding') ? 'enhanced' : 'standard'
    ),
}));

vi.mock('../../utils/haptics', () => ({
    haptic: {
        light: vi.fn(),
        medium: vi.fn(),
    },
}));

vi.mock('../../utils/systemFullscreen', () => ({
    requestSystemFullscreen: vi.fn(),
    exitSystemFullscreen: vi.fn(),
}));

describe('SettingsMenu', () => {
    beforeEach(() => {
        localStorage.clear();
        getRuntimeConfigSnapshot.mockReset();
    });

    it('renders status summaries from the runtime snapshot instead of direct storage parsing', () => {
        localStorage.setItem('os_api_config', JSON.stringify({
            apiKey: 'stale-key',
            baseUrl: 'https://stale.example.com',
            model: 'vendor/gpt-stale',
        }));
        localStorage.setItem('embedding_api_key', 'stale-embed-key');
        localStorage.setItem('embedding_model', 'BAAI/bge-m3');

        getRuntimeConfigSnapshot.mockReturnValue({
            backend: {},
            api: {
                primary: {
                    apiKey: 'live-key',
                    baseUrl: 'https://live.example.com',
                    model: 'vendor/gpt-live',
                    useGeminiJailbreak: false,
                    disablePrefill: false,
                },
                secondary: undefined,
                availableModels: [],
                presets: [],
            },
            realtime: {
                weatherEnabled: false,
                weatherApiKey: '',
                weatherCity: 'Beijing',
                newsEnabled: true,
                newsApiKey: '',
                hotSearchEnabled: false,
                notionEnabled: false,
                notionApiKey: '',
                notionDatabaseId: '',
                feishuEnabled: false,
                feishuAppId: '',
                feishuAppSecret: '',
                feishuBaseId: '',
                feishuTableId: '',
                xhsEnabled: false,
                canvaEnabled: false,
                canvaMcpConfig: {
                    enabled: false,
                    serverUrl: 'http://localhost:18062/api',
                },
                cacheMinutes: 30,
            },
            tts: {
                apiKey: 'tts-key',
            },
            stt: {
                provider: 'siliconflow',
            },
            imageGeneration: {
                config: {
                    activeProvider: 'novelai',
                    novelai: {
                        apiToken: '',
                        model: 'nai-diffusion-4-full',
                    },
                    openaiCompatible: {
                        apiKey: '',
                        model: '',
                    },
                },
                stylePresets: [],
            },
            embedding: {
                provider: 'openai',
                apiKey: 'live-embed-key',
                baseUrl: 'https://api.siliconflow.cn/v1',
                model: 'Qwen/Qwen3-Embedding-8B',
                rerankModel: 'Qwen/Qwen3-Reranker-8B',
                dimensions: 1024,
                rerankApiKey: '',
                rerankUsePaid: false,
            },
        } as any);

        render(<SettingsMenu onNavigate={vi.fn()} />);

        expect(screen.getByText('gpt-live')).toBeInTheDocument();
        expect(screen.getByText('增强版')).toBeInTheDocument();
        expect(screen.getByText('Qwen3-Embedding-8B')).toBeInTheDocument();
        expect(screen.queryByText('gpt-stale')).not.toBeInTheDocument();
        expect(screen.queryByText('bge-m3')).not.toBeInTheDocument();
    });
});
