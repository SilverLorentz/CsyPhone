// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import {
    selectExtractionMemoryHeaders,
    VECTOR_EXTRACTION_MEMORY_CONTEXT_LIMIT,
    VectorMemoryExtractor,
} from './vectorMemoryExtractor';

const {
    getMessagesByCharId,
    getAllVectorMemories,
    getVectorMemoryHeaders,
    getCharacterById,
    saveCharacter,
    getEmojis,
    callLLM,
    hasExtractionLock,
    acquireExtractionLock,
    releaseExtractionLock,
    processResult,
} = vi.hoisted(() => ({
    getMessagesByCharId: vi.fn(),
    getAllVectorMemories: vi.fn(),
    getVectorMemoryHeaders: vi.fn(),
    getCharacterById: vi.fn(),
    saveCharacter: vi.fn(),
    getEmojis: vi.fn(),
    callLLM: vi.fn(),
    hasExtractionLock: vi.fn(),
    acquireExtractionLock: vi.fn(),
    releaseExtractionLock: vi.fn(),
    processResult: vi.fn(),
}));

vi.mock('./db', () => ({
    DB: {
        getMessagesByCharId,
        getAllVectorMemories,
        getVectorMemoryHeaders,
        getCharacterById,
        saveCharacter,
        getEmojis,
    },
}));

vi.mock('./backendClient', () => ({
    pullMemories: vi.fn(),
    pushMemories: vi.fn(),
    tryBackendExtraction: vi.fn(),
}));

vi.mock('./mindSnapshotExtractor', () => ({
    MindSnapshotExtractor: {
        generateForMemory: vi.fn(),
    },
}));

vi.mock('./hormoneDynamics', () => ({
    extractHormoneSnapshot: vi.fn(),
    computeSalience: vi.fn(),
}));

vi.mock('./engines/extractionProcessor', () => ({
    hasExtractionLock,
    acquireExtractionLock,
    releaseExtractionLock,
    processResult,
}));

vi.mock('./engines/extractionLlm', async () => {
    const actual = await vi.importActual<typeof import('./engines/extractionLlm')>('./engines/extractionLlm');
    return {
        ...actual,
        callLLM,
    };
});

function makeHeader(index: number, overrides: Record<string, unknown> = {}) {
    return {
        id: `mem-${index}`,
        title: `Memory ${index}`,
        content: `Content ${index}`,
        importance: 5,
        createdAt: index,
        ...overrides,
    };
}

describe('vectorMemoryExtractor memory context selection', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        hasExtractionLock.mockReturnValue(false);
        callLLM.mockResolvedValue([]);
        getAllVectorMemories.mockResolvedValue([]);
        getCharacterById.mockResolvedValue({
            id: 'char-1',
            vectorMemoryLastExtractAt: 0,
        });
        saveCharacter.mockResolvedValue(undefined);
        getEmojis.mockResolvedValue([]);
    });

    it('keeps only the newest active memory headers for extraction prompts', () => {
        const headers = Array.from({ length: 150 }, (_, index) => makeHeader(index));
        const selected = selectExtractionMemoryHeaders([
            ...headers,
            makeHeader(999, { deprecated: true }),
        ]);

        expect(selected).toHaveLength(Math.min(150, VECTOR_EXTRACTION_MEMORY_CONTEXT_LIMIT));
        expect(selected[0].id).toBe('mem-149');
        expect(selected[selected.length - 1].id).toBe(
            `mem-${Math.max(0, 150 - VECTOR_EXTRACTION_MEMORY_CONTEXT_LIMIT)}`,
        );
        expect(selected.some(header => header.id === 'mem-999')).toBe(false);
    });

    it('caps manual batch extraction prompts when thousands of vector memories already exist', async () => {
        getMessagesByCharId.mockResolvedValue([
            {
                id: 1,
                charId: 'char-1',
                role: 'user',
                type: 'text',
                content: '我们昨天聊到了一件值得记住的事',
                timestamp: 1000,
            },
        ]);
        getVectorMemoryHeaders.mockResolvedValue(
            Array.from({ length: 3000 }, (_, index) => makeHeader(index)),
        );

        await expect(VectorMemoryExtractor.batchExtractFromMessages(
            'char-1',
            0,
            0,
            { baseUrl: 'https://llm.example.com/v1', apiKey: 'llm-key', model: 'test-model' },
            'embedding-key',
            'Sully',
        )).resolves.toBe(0);

        expect(callLLM).toHaveBeenCalledTimes(1);
        const prompt = callLLM.mock.calls[0][0] as string;
        const memoryLineCount = prompt.match(/- \[ID:/g)?.length || 0;

        expect(memoryLineCount).toBe(VECTOR_EXTRACTION_MEMORY_CONTEXT_LIMIT);
        expect(prompt).toContain('[ID:mem-2999]');
        const lastIncluded = 3000 - VECTOR_EXTRACTION_MEMORY_CONTEXT_LIMIT;
        expect(prompt).toContain(`[ID:mem-${lastIncluded}]`);
        expect(prompt).not.toContain(`[ID:mem-${lastIncluded - 1}]`);
        expect(processResult).not.toHaveBeenCalled();
        expect(releaseExtractionLock).toHaveBeenCalledWith('char-1');
    });

    it('includes phone evidence system messages in manual vector extraction prompts', async () => {
        getMessagesByCharId.mockResolvedValue([
            {
                id: 1,
                charId: 'char-1',
                role: 'system',
                type: 'text',
                content: '[系统: Sully的手机(通话记录) 显示: 未接来电]',
                timestamp: 1000,
                metadata: { source: 'phone', phoneTitle: '未接来电' },
            },
            {
                id: 2,
                charId: 'char-1',
                role: 'system',
                type: 'text',
                content: '[系统: 用户 查看了 Sully 手机中的「音乐」。]',
                timestamp: 2000,
                metadata: { source: 'story_phone', phonePeekTitle: '最后停留' },
            },
            {
                id: 3,
                charId: 'char-1',
                role: 'system',
                type: 'text',
                content: '[连接中断: network error]',
                timestamp: 3000,
                metadata: { source: 'connection' },
            },
        ]);
        getVectorMemoryHeaders.mockResolvedValue([]);

        await expect(VectorMemoryExtractor.batchExtractFromMessages(
            'char-1',
            0,
            10,
            { baseUrl: 'https://llm.example.com/v1', apiKey: 'llm-key', model: 'test-model' },
            'embedding-key',
            'Sully',
        )).resolves.toBe(0);

        expect(callLLM).toHaveBeenCalledTimes(1);
        const prompt = callLLM.mock.calls[0][0] as string;
        expect(prompt).toContain('未接来电');
        expect(prompt).toContain('用户 查看了 Sully 手机中的「音乐」');
        expect(prompt).not.toContain('连接中断');
    });

    it('includes emoji names in manual vector extraction prompts without raw sticker URLs', async () => {
        getEmojis.mockResolvedValue([{ name: 'Sully晚安', url: 'https://cdn.example/stickers/night.png' }]);
        getMessagesByCharId.mockResolvedValue([
            {
                id: 1,
                charId: 'char-1',
                role: 'assistant',
                type: 'emoji',
                content: 'https://cdn.example/stickers/night.png',
                timestamp: 1000,
            },
            {
                id: 2,
                charId: 'char-1',
                role: 'user',
                type: 'emoji',
                content: 'data:image/png;base64,very-large-sticker',
                timestamp: 2000,
                metadata: { name: '亲亲' },
            },
        ]);
        getVectorMemoryHeaders.mockResolvedValue([]);

        await expect(VectorMemoryExtractor.batchExtractFromMessages(
            'char-1',
            0,
            10,
            { baseUrl: 'https://llm.example.com/v1', apiKey: 'llm-key', model: 'test-model' },
            'embedding-key',
            'Sully',
        )).resolves.toBe(0);

        expect(callLLM).toHaveBeenCalledTimes(1);
        const prompt = callLLM.mock.calls[0][0] as string;
        expect(prompt).toContain('[发送了表情包: Sully晚安]');
        expect(prompt).toContain('[发送了表情包: 亲亲]');
        expect(prompt).not.toContain('https://cdn.example/stickers/night.png');
        expect(prompt).not.toContain('data:image');
    });
});
