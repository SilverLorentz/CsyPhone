// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import EmbeddingSettings from './EmbeddingSettings';
import { getEmbeddingConfig,setEmbeddingConfig } from '../../utils/runtimeConfig';

const { addToast,getMemoryEmbeddingEngineStatus,switchMemoryEmbeddingEngine,cancelMemoryEngineReindex,retryFailedMemoryEngineReindex } = vi.hoisted(() => ({
    addToast: vi.fn(),
    getMemoryEmbeddingEngineStatus: vi.fn(),
    switchMemoryEmbeddingEngine: vi.fn(),
    cancelMemoryEngineReindex: vi.fn(),
    retryFailedMemoryEngineReindex: vi.fn(),
}));

vi.mock('../../context/OSContext', () => ({
    useOS: () => ({ addToast }),
}));

vi.mock('./BackendDiagnosticsCard', () => ({
    default: () => <div data-testid="backend-diagnostics-card" />,
}));

vi.mock('../../utils/backendClient', () => ({
    getMemoryEmbeddingEngineStatus,
    switchMemoryEmbeddingEngine,
    cancelMemoryEngineReindex,
    retryFailedMemoryEngineReindex,
}));

describe('EmbeddingSettings', () => {
    beforeEach(() => {
        localStorage.clear();
        addToast.mockReset();
        getMemoryEmbeddingEngineStatus.mockReset();
        switchMemoryEmbeddingEngine.mockReset();
        cancelMemoryEngineReindex.mockReset();
        retryFailedMemoryEngineReindex.mockReset();
        getMemoryEmbeddingEngineStatus.mockResolvedValue(null);
    });

    it('loads from runtime config and saves a round-tripped embedding config', async () => {
        setEmbeddingConfig({
            provider: 'openai',
            apiKey: 'seed-key',
            baseUrl: 'https://api.siliconflow.cn/v1/',
            model: 'Qwen/Qwen3-Embedding-8B',
            rerankModel: 'ignored',
            dimensions: 2048,
            rerankApiKey: '',
            rerankUsePaid: false,
        });

        render(<EmbeddingSettings />);
        await waitFor(() => {
            expect(getMemoryEmbeddingEngineStatus).toHaveBeenCalled();
        });

        const baseUrlInput = screen.getByPlaceholderText('https://api.siliconflow.cn/v1');
        const apiKeyInput = screen.getByPlaceholderText('sk-...');

        expect(baseUrlInput).toHaveValue('https://api.siliconflow.cn/v1');
        expect(apiKeyInput).toHaveValue('seed-key');
        expect(baseUrlInput).toHaveAttribute('autocomplete', 'new-password');
        expect(baseUrlInput).toHaveAttribute('inputmode', 'url');
        expect(baseUrlInput.getAttribute('name')).toMatch(/^sully-field-[a-z0-9]+-[a-z0-9]+$/);
        expect(baseUrlInput).toHaveAttribute('data-lpignore', 'true');
        expect(apiKeyInput).toHaveAttribute('type', 'text');
        expect(apiKeyInput).toHaveAttribute('autocomplete', 'new-password');
        expect(apiKeyInput).toHaveAttribute('inputmode', 'text');
        expect(apiKeyInput.getAttribute('name')).toMatch(/^sully-field-[a-z0-9]+-[a-z0-9]+$/);
        expect(apiKeyInput).toHaveAttribute('data-lpignore', 'true');

        fireEvent.change(baseUrlInput, { target: { value: ' https://embedding.example.com/v1/ ' } });
        fireEvent.change(apiKeyInput, { target: { value: ' next-key ' } });
        fireEvent.click(screen.getByRole('button', { name: '保存凭证' }));

        expect(getEmbeddingConfig()).toEqual({
            provider: 'openai',
            apiKey: 'next-key',
            baseUrl: 'https://embedding.example.com/v1',
            model: 'Qwen/Qwen3-Embedding-8B',
            rerankModel: 'Qwen/Qwen3-Reranker-8B',
            dimensions: 1024,
            rerankApiKey: '',
            rerankUsePaid: false,
        });
        expect(addToast).toHaveBeenCalledWith('记忆引擎凭证已保存', 'success');
    });

    it('retries only failed reindex items from the status card', async () => {
        getMemoryEmbeddingEngineStatus.mockResolvedValue({
            engineId: 'enhanced',
            engine: {
                id: 'enhanced',
                embeddingModel: 'Qwen/Qwen3-Embedding-8B',
                rerankModel: 'Qwen/Qwen3-Reranker-8B',
                vectorizeBinding: 'VECTOR_INDEX',
                defaultMinRawSimilarity: 0.35,
            },
            updatedAt: Date.now(),
            reindexJob: {
                id: 'semjob-1',
                userId: 'user-1',
                type: 'index-memory',
                status: 'failed',
                totalItems: 10,
                queuedItems: 0,
                processingItems: 0,
                completedItems: 4,
                failedItems: 6,
                cancelledItems: 0,
                error: 'Embedding API error 429',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
        });
        retryFailedMemoryEngineReindex.mockResolvedValue({
            ok: true,
            retriedItems: 6,
            status: {
                engineId: 'enhanced',
                engine: {
                    id: 'enhanced',
                    embeddingModel: 'Qwen/Qwen3-Embedding-8B',
                    rerankModel: 'Qwen/Qwen3-Reranker-8B',
                    vectorizeBinding: 'VECTOR_INDEX',
                    defaultMinRawSimilarity: 0.35,
                },
                updatedAt: Date.now(),
                reindexJob: {
                    id: 'semjob-2',
                    userId: 'user-1',
                    type: 'index-memory',
                    status: 'processing',
                    totalItems: 6,
                    queuedItems: 6,
                    processingItems: 0,
                    completedItems: 0,
                    failedItems: 0,
                    cancelledItems: 0,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            },
        });

        render(<EmbeddingSettings />);
        await waitFor(() => {
            expect(screen.getByRole('button', { name: '只重试失败项' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: '只重试失败项' }));

        await waitFor(() => {
            expect(retryFailedMemoryEngineReindex).toHaveBeenCalledWith('semjob-1');
        });
        expect(addToast).toHaveBeenCalledWith('已重新排队 6 条失败记忆', 'success');
    });
});
