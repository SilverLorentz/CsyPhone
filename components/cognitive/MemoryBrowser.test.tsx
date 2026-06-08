// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemoryBrowser from './MemoryBrowser';
import { DB } from '../../utils/db';

vi.mock('../../utils/db', () => ({
    DB: {
        getAllVectorMemories: vi.fn(),
        getMemoryRecords: vi.fn(),
        getMessagesByIds: vi.fn(),
        getMessagesByCharId: vi.fn(),
    },
}));

const mockedDB = vi.mocked(DB);

const vectorCreatedAt = new Date(2026, 4, 2, 12, 0).getTime();

function makeCharacter(overrides: Record<string, unknown> = {}) {
    return {
        id: 'char-1',
        name: 'Sully',
        avatar: 'sully.png',
        memories: [
            {
                id: 'mem-1',
                date: '2026-05-01',
                summary: '雨夜一起买奶茶',
                mood: 'archive',
            },
        ],
        refinedMemories: {
            '2026-05': '五月的核心记忆：一起把很多小事收好。',
        },
        ...overrides,
    } as any;
}

function makeVectorMemory(overrides: Record<string, unknown> = {}) {
    return {
        id: 'vm-1',
        charId: 'char-1',
        title: '奶茶约定',
        content: '记得那次雨夜奶茶。',
        emotionalJourney: '有一点被照顾到的安心。',
        importance: 9,
        mentionCount: 0,
        lastMentioned: 0,
        createdAt: vectorCreatedAt,
        vector: [],
        source: 'auto',
        sourceMessageIds: [101],
        ...overrides,
    } as any;
}

function renderBrowser(overrides: Record<string, unknown> = {}) {
    const onSelectedCharIdChange = vi.fn();
    const onOpenSourceInChat = vi.fn();
    const addToast = vi.fn();
    const result = render(
        <MemoryBrowser
            characters={[makeCharacter()]}
            selectedCharId={null}
            onSelectedCharIdChange={onSelectedCharIdChange}
            userName="Tester"
            addToast={addToast}
            onOpenSourceInChat={onOpenSourceInChat}
            {...overrides}
        />,
    );

    return {
        ...result,
        onSelectedCharIdChange,
        onOpenSourceInChat,
        addToast,
    };
}

describe('MemoryBrowser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedDB.getAllVectorMemories.mockResolvedValue([makeVectorMemory()]);
        mockedDB.getMemoryRecords.mockResolvedValue([
            {
                id: 'record-1',
                charId: 'char-1',
                seedMemoryIds: ['vm-1'],
                selectedMemoryIds: [],
            },
        ] as any);
        mockedDB.getMessagesByIds.mockResolvedValue([
            {
                id: 101,
                charId: 'char-1',
                role: 'user',
                type: 'text',
                content: '我们去买奶茶吧',
                timestamp: vectorCreatedAt,
            },
        ] as any);
        mockedDB.getMessagesByCharId.mockResolvedValue([
            {
                id: 100,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '外面下雨了',
                timestamp: vectorCreatedAt - 60_000,
            },
            {
                id: 101,
                charId: 'char-1',
                role: 'user',
                type: 'text',
                content: '我们去买奶茶吧',
                timestamp: vectorCreatedAt,
            },
            {
                id: 102,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '好，我陪你',
                timestamp: vectorCreatedAt + 60_000,
            },
        ] as any);
    });

    it('merges traditional, core, and vector memories with search and type filters', async () => {
        renderBrowser();

        expect(await screen.findByText('奶茶约定')).toBeInTheDocument();
        expect(screen.getByText('雨夜一起买奶茶')).toBeInTheDocument();
        expect(screen.getByText(/五月的核心记忆/)).toBeInTheDocument();
        expect(screen.getByText('关联回声唱片 1')).toBeInTheDocument();

        fireEvent.change(screen.getByDisplayValue('全部类型'), {
            target: { value: 'vector' },
        });

        expect(screen.getByText('奶茶约定')).toBeInTheDocument();
        expect(screen.queryByText('雨夜一起买奶茶')).not.toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('搜索标题、内容、角色或来源...'), {
            target: { value: '不存在的关键词' },
        });

        expect(screen.getByText('没有找到匹配的记忆')).toBeInTheDocument();
    });

    it('loads exact source context and opens the source chat message', async () => {
        const { onOpenSourceInChat } = renderBrowser();

        fireEvent.click(await screen.findByText('奶茶约定'));

        await waitFor(() => {
            expect(screen.getAllByText('精确来源').length).toBeGreaterThan(0);
            expect(screen.getByText(/Tester: 我们去买奶茶吧/)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /回到聊天/ }));
        expect(onOpenSourceInChat).toHaveBeenCalledWith('char-1', 101);
    });

    it('allows vector memories to be edited from the browser', async () => {
        const onUpdateVectorMemory = vi.fn().mockResolvedValue({ mode: 'cloud' });
        const { addToast } = renderBrowser({ onUpdateVectorMemory });

        fireEvent.click(await screen.findByText('奶茶约定'));
        fireEvent.click(await screen.findByRole('button', { name: /编辑记忆/ }));

        fireEvent.change(screen.getByDisplayValue('奶茶约定'), {
            target: { value: '新的奶茶约定' },
        });
        fireEvent.change(screen.getByDisplayValue('记得那次雨夜奶茶。'), {
            target: { value: '修改后的雨夜奶茶细节。' },
        });
        fireEvent.change(screen.getByRole('slider'), {
            target: { value: '6' },
        });

        fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

        await waitFor(() => {
            expect(onUpdateVectorMemory).toHaveBeenCalledWith('vm-1', {
                title: '新的奶茶约定',
                content: '修改后的雨夜奶茶细节。',
                importance: 6,
            });
            expect(addToast).toHaveBeenCalledWith('已保存并同步云端', 'success');
        });

        expect(screen.getByText('新的奶茶约定')).toBeInTheDocument();
        expect(screen.getByText(/修改后的雨夜奶茶细节/)).toBeInTheDocument();
    });

    it('falls back to nearby chat records for traditional memories without source ids', async () => {
        mockedDB.getAllVectorMemories.mockResolvedValue([]);
        mockedDB.getMemoryRecords.mockResolvedValue([]);
        mockedDB.getMessagesByCharId.mockResolvedValue([
            {
                id: 201,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '雨夜的聊天记录',
                timestamp: new Date(2026, 4, 1, 20, 0).getTime(),
            },
        ] as any);
        renderBrowser();

        fireEvent.click(await screen.findByText('雨夜一起买奶茶'));

        await waitFor(() => {
            expect(screen.getByText('日期附近')).toBeInTheDocument();
            expect(screen.getByText(/Sully: 雨夜的聊天记录/)).toBeInTheDocument();
        });
    });
});
