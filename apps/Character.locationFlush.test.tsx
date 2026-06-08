// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Character from './Character';
import { AppID } from '../types';
import { useCharacterScreenDeps } from '../hooks/useCharacterScreenDeps';

vi.mock('../hooks/useCharacterScreenDeps', () => ({
    useCharacterScreenDeps: vi.fn(),
}));

vi.mock('../components/os/Modal', () => ({
    default: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => (isOpen ? <div>{children}</div> : null),
}));

vi.mock('../components/character/ImpressionPanel', () => ({
    default: () => <div>Impression Panel</div>,
}));

vi.mock('../components/character/MemoryCenter', () => ({
    default: () => <div>Memory Center</div>,
}));

vi.mock('../components/character/CharacterWeixinBindingCard', () => ({
    default: () => <div>Weixin Binding Card</div>,
}));

vi.mock('../utils/file', () => ({
    processImage: vi.fn(),
}));

vi.mock('../utils/db', () => ({
    DB: {
        getAllVectorMemories: vi.fn(() => Promise.resolve([])),
        deleteMessage: vi.fn(),
        getMessagesByCharId: vi.fn(() => Promise.resolve([])),
        saveMessage: vi.fn(),
    },
}));

vi.mock('../utils/context', () => ({
    ContextBuilder: {
        buildCoreContext: vi.fn(() => ''),
    },
}));

vi.mock('../utils/safeApi', () => ({
    safeResponseJson: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: vi.fn(() => false),
    },
}));

vi.mock('@capacitor/filesystem', () => ({
    Filesystem: {
        writeFile: vi.fn(),
        getUri: vi.fn(),
    },
    Directory: {
        Cache: 'CACHE',
    },
    Encoding: {
        UTF8: 'utf8',
    },
}));

vi.mock('@capacitor/share', () => ({
    Share: {
        share: vi.fn(),
    },
}));

const mockedUseCharacterScreenDeps = vi.mocked(useCharacterScreenDeps);

const mockAddCharacter = vi.fn();
const mockAddCustomTheme = vi.fn();
const mockAddToast = vi.fn();
const mockCloseApp = vi.fn();
const mockDeleteCharacter = vi.fn();
const mockOpenApp = vi.fn();
const mockSetActiveCharacterId = vi.fn();
const mockUpdateCharacter = vi.fn();

const baseCharacter = {
    id: 'char-1',
    name: 'Sully',
    avatar: 'avatar-1.png',
    description: '测试角色',
    systemPrompt: '',
    worldview: '',
    memories: [],
    mountedWorldbooks: [],
    isFictionalCity: true,
} as any;

function renderCharacterDetail() {
    render(<Character />);
    fireEvent.click(screen.getByText('Sully'));
}

function renderCharacterApp() {
    renderCharacterDetail();
    const summaryCard = screen.getByText('未命名架空城市').closest('[role="button"]');
    if (!summaryCard) {
        throw new Error('Could not find the location summary card.');
    }
    fireEvent.click(summaryCard);

    return screen.getByPlaceholderText('输入架空城市名...');
}

describe('Character location draft flush', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        localStorage.clear();

        mockedUseCharacterScreenDeps.mockReturnValue({
            closeApp: mockCloseApp,
            openApp: mockOpenApp,
            characters: [baseCharacter],
            setActiveCharacterId: mockSetActiveCharacterId,
            addCharacter: mockAddCharacter,
            updateCharacter: mockUpdateCharacter,
            deleteCharacter: mockDeleteCharacter,
            apiConfig: {
                apiKey: '',
                baseUrl: 'https://example.com',
                model: 'gpt-test',
            },
            addToast: mockAddToast,
            userProfile: {
                name: 'Tester',
                avatar: 'user.png',
                bio: '',
            },
            customThemes: [],
            addCustomTheme: mockAddCustomTheme,
            worldbooks: [],
        } as any);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('persists a pending fictional city draft before returning to the character list', async () => {
        const input = renderCharacterApp();

        fireEvent.change(input, { target: { value: '新月城' } });
        fireEvent.click(screen.getByRole('button', { name: /列表/ }));

        await act(async () => {
            await Promise.resolve();
        });

        expect(mockUpdateCharacter).toHaveBeenCalledWith('char-1', expect.objectContaining({
            cityOverride: '新月城',
        }), expect.objectContaining({
            skipImmediateAgentContextPush: true,
            reason: 'location',
        }));
    });

    it('persists a pending fictional city draft before opening chat', async () => {
        const input = renderCharacterApp();

        fireEvent.change(input, { target: { value: '白露城' } });
        fireEvent.click(screen.getByRole('button', { name: /发消息/ }));

        await act(async () => {
            await Promise.resolve();
        });

        expect(mockUpdateCharacter).toHaveBeenCalledWith('char-1', expect.objectContaining({
            cityOverride: '白露城',
        }), expect.objectContaining({
            skipImmediateAgentContextPush: true,
            reason: 'location',
        }));
        expect(mockSetActiveCharacterId).toHaveBeenCalledWith('char-1');
        expect(mockOpenApp).toHaveBeenCalledWith(AppID.Chat);
    });

    it('persists a pending fictional city draft before switching to the memory tab', async () => {
        const input = renderCharacterApp();

        fireEvent.change(input, { target: { value: '流云城' } });
        fireEvent.click(screen.getByRole('button', { name: /记忆/ }));

        await act(async () => {
            await Promise.resolve();
        });

        expect(mockUpdateCharacter).toHaveBeenCalledWith('char-1', expect.objectContaining({
            cityOverride: '流云城',
        }), expect.objectContaining({
            skipImmediateAgentContextPush: true,
            reason: 'location',
        }));
        expect(screen.getByText('Memory Center')).toBeInTheDocument();
    });

    it('persists a pending fictional city draft before returning to the identity summary', async () => {
        const input = renderCharacterApp();

        fireEvent.change(input, { target: { value: '夜航城' } });
        fireEvent.click(screen.getByRole('button', { name: '返回设定' }));

        await act(async () => {
            await Promise.resolve();
        });

        expect(mockUpdateCharacter).toHaveBeenCalledWith('char-1', expect.objectContaining({
            cityOverride: '夜航城',
        }), expect.objectContaining({
            skipImmediateAgentContextPush: true,
            reason: 'location',
        }));
        expect(screen.getByText('夜航城')).toBeInTheDocument();
    });

    it('debounces identity auto-save so rapid typing only persists once', async () => {
        renderCharacterDetail();

        const nameInput = screen.getByPlaceholderText('名称');
        fireEvent.change(nameInput, { target: { value: 'S' } });
        fireEvent.change(nameInput, { target: { value: 'Su' } });
        fireEvent.change(nameInput, { target: { value: 'Sully Prime' } });

        act(() => {
            vi.advanceTimersByTime(349);
        });

        expect(mockUpdateCharacter).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1);
            await Promise.resolve();
        });

        expect(mockUpdateCharacter).toHaveBeenCalledTimes(1);
        expect(mockUpdateCharacter).toHaveBeenLastCalledWith('char-1', expect.objectContaining({
            name: 'Sully Prime',
        }));
    });

    it('flushes a pending identity auto-save before opening chat', async () => {
        renderCharacterDetail();

        const nameInput = screen.getByPlaceholderText('名称');
        fireEvent.change(nameInput, { target: { value: 'Sully Prime' } });
        fireEvent.click(screen.getByRole('button', { name: /发消息/ }));

        await act(async () => {
            await Promise.resolve();
        });

        expect(mockUpdateCharacter).toHaveBeenCalledWith('char-1', expect.objectContaining({
            name: 'Sully Prime',
        }));
        expect(mockSetActiveCharacterId).toHaveBeenCalledWith('char-1');
        expect(mockOpenApp).toHaveBeenCalledWith(AppID.Chat);
    });
});
