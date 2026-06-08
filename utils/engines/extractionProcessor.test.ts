// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { VectorMemory } from '../../types';
import { processResult } from './extractionProcessor';

const {
    saveVectorMemory,
    getVectorMemoryById,
    embed,
    getEmbeddingConfig,
} = vi.hoisted(() => ({
    saveVectorMemory: vi.fn(),
    getVectorMemoryById: vi.fn(),
    embed: vi.fn(),
    getEmbeddingConfig: vi.fn(),
}));

vi.mock('../db', () => ({
    DB: {
        saveVectorMemory,
        getVectorMemoryById,
    },
}));

vi.mock('../embeddingService', () => ({
    EmbeddingService: {
        embed,
        cosineSimilarity: vi.fn(() => 0.1),
    },
    getEmbeddingConfig,
}));

vi.mock('../runtimeConfig', () => ({
    hasCloudSyncTarget: vi.fn(() => false),
}));

describe('extractionProcessor', () => {
    beforeEach(() => {
        saveVectorMemory.mockReset().mockResolvedValue(undefined);
        getVectorMemoryById.mockReset();
        embed.mockReset()
            .mockResolvedValueOnce([0.11, 0.22])
            .mockResolvedValueOnce([0.33, 0.44]);
        getEmbeddingConfig.mockReset().mockReturnValue({ model: 'test-embedding-model' });
    });

    it('reuses the just-created memory when the same source window yields another create result', async () => {
        const allMemories: VectorMemory[] = [];
        const vectorCache = new Map<string, number[]>();

        getVectorMemoryById.mockImplementation(async (id: string) => (
            allMemories.find((memory) => memory.id === id) ?? null
        ));

        const firstId = await processResult(
            {
                action: 'create',
                title: '海边约定',
                content: '她提到还想一起去海边看日落',
                importance: 6,
            },
            'char-1',
            'emb-key',
            vectorCache,
            [101, 102, 103],
            allMemories,
        );

        const secondId = await processResult(
            {
                action: 'create',
                title: '关于海边的期待',
                content: '她又一次说起想一起去海边散步',
                importance: 7,
            },
            'char-1',
            'emb-key',
            vectorCache,
            [101, 102, 103],
            allMemories,
        );

        expect(firstId).toBeTruthy();
        expect(secondId).toBe(firstId);
        expect(allMemories).toHaveLength(1);
        expect(allMemories[0]).toMatchObject({
            id: firstId,
            title: '关于海边的期待',
            content: '她又一次说起想一起去海边散步',
            importance: 7,
            sourceMessageIds: [101, 102, 103],
        });
        expect(getVectorMemoryById).toHaveBeenCalledWith(firstId);
        expect(saveVectorMemory).toHaveBeenCalledTimes(2);
        expect(saveVectorMemory).toHaveBeenLastCalledWith(expect.objectContaining({
            id: firstId,
            title: '关于海边的期待',
        }));
    });
});
