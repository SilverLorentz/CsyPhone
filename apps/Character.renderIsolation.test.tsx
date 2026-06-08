// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Character from './Character';
import { useCharacterScreenDeps } from '../hooks/useCharacterScreenDeps';
import { DB } from '../utils/db';

const { locationSummaryRenderSpy } = vi.hoisted(() => ({
    locationSummaryRenderSpy: vi.fn(),
}));

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

vi.mock('../components/character/CharacterLocationSummaryCard', () => ({
    default: (props: any) => {
        locationSummaryRenderSpy(props);
        return (
            <button type="button" role="button" onClick={props.onEdit}>
                地理设定卡
            </button>
        );
    },
}));

vi.mock('../components/character/CharacterLifeProfileCard', () => ({
    default: () => <div>Life Profile Card</div>,
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
        saveCharacter: vi.fn(() => Promise.resolve()),
        saveWorldbook: vi.fn(() => Promise.resolve()),
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
const mockSetCharacters = vi.fn();
const mockSetWorldbooks = vi.fn();
const mockUpdateCharacter = vi.fn();

const baseCharacter = {
    id: 'char-1',
    name: 'Sully',
    avatar: 'avatar-1.png',
    description: '测试角色',
    systemPrompt: '',
    worldview: '',
    memories: [],
    mountedWorldbooks: [
        {
            id: 'wb-1',
            title: '世界书 1',
            content: 'content',
            category: '测试',
            position: 'top',
        },
        {
            id: 'wb-empty',
            title: '空白世界书',
            content: '',
            category: '测试',
            position: 'bottom',
        },
    ],
} as any;

function mockCharacterDeps(overrides: Record<string, unknown> = {}) {
    mockedUseCharacterScreenDeps.mockReturnValue({
        closeApp: mockCloseApp,
        openApp: mockOpenApp,
        characters: [baseCharacter],
        setActiveCharacterId: mockSetActiveCharacterId,
        setCharacters: mockSetCharacters,
        setWorldbooks: mockSetWorldbooks,
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
        ...overrides,
    } as any);
}

function renderCharacterDetail() {
    render(<Character />);
    fireEvent.click(screen.getByText('Sully'));
}

describe('Character render isolation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();

        mockCharacterDeps();
    });

    it('keeps support panels from rerendering when typing in identity fields', () => {
        renderCharacterDetail();

        expect(locationSummaryRenderSpy).toHaveBeenCalledTimes(1);

        const nameInput = screen.getByPlaceholderText('名称');
        fireEvent.change(nameInput, { target: { value: 'S' } });
        fireEvent.change(nameInput, { target: { value: 'Su' } });
        fireEvent.change(nameInput, { target: { value: 'Sully Prime' } });

        expect(locationSummaryRenderSpy).toHaveBeenCalledTimes(1);
    });

    it('opens a read-only preview for mounted worldbooks', () => {
        renderCharacterDetail();

        fireEvent.click(screen.getByRole('button', { name: '查看世界书 世界书 1' }));

        expect(screen.getByText('将随该角色注入聊天上下文')).toBeInTheDocument();
        expect(screen.getByText('content')).toBeInTheDocument();
        expect(screen.getAllByText('人设之前').length).toBeGreaterThanOrEqual(1);
    });

    it('does not open preview when using mounted worldbook action buttons', () => {
        renderCharacterDetail();

        fireEvent.click(screen.getAllByTitle('下移')[0]);

        expect(screen.queryByText('将随该角色注入聊天上下文')).not.toBeInTheDocument();
    });

    it('shows an empty-content warning in mounted worldbook preview', () => {
        renderCharacterDetail();

        fireEvent.click(screen.getByRole('button', { name: '查看世界书 空白世界书' }));

        expect(screen.getByText('内容为空，当前不会读取到可用设定。')).toBeInTheDocument();
        expect(screen.getAllByText('记忆之后').length).toBeGreaterThanOrEqual(1);
    });

    it('imports card-mounted worldbooks into the global library without creating a blank character', async () => {
        const existingWorldbook = {
            id: 'wb-shared',
            title: '已有同 ID 世界书',
            content: '旧内容',
            category: '旧分组',
            createdAt: 1,
            updatedAt: 1,
        };
        mockCharacterDeps({
            worldbooks: [existingWorldbook],
        });
        const { container } = render(<Character />);
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File([
            JSON.stringify({
                type: 'sully_character_card',
                version: 1,
                name: '导入角色',
                avatar: 'avatar-import.png',
                description: '导入测试',
                systemPrompt: '导入的人设',
                hideBeforeMessageId: 999999,
                memories: [{ date: '2026-05-04', summary: 'should be reset' }],
                mountedWorldbooks: [{
                    id: 'wb-shared',
                    title: '随卡世界书',
                    content: '角色卡世界书内容',
                    category: '随卡分组',
                    position: 'after_impression',
                }],
            }),
        ], 'character-card.json', { type: 'application/json' });

        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => expect(DB.saveCharacter).toHaveBeenCalled());

        expect(mockAddCharacter).not.toHaveBeenCalled();
        expect(DB.saveWorldbook).toHaveBeenCalledTimes(1);
        const savedWorldbook = vi.mocked(DB.saveWorldbook).mock.calls[0][0] as any;
        expect(savedWorldbook).toEqual(expect.objectContaining({
            title: '随卡世界书',
            content: '角色卡世界书内容',
            category: '随卡分组',
            position: 'after_impression',
        }));
        expect(savedWorldbook.id).toMatch(/^wb-imported-/);
        expect(savedWorldbook.id).not.toBe('wb-shared');

        const savedCharacter = vi.mocked(DB.saveCharacter).mock.calls[0][0] as any;
        expect(savedCharacter).toEqual(expect.objectContaining({
            name: '导入角色',
            memories: [],
            refinedMemories: {},
            activeMemoryMonths: [],
            hideBeforeMessageId: undefined,
        }));
        expect(savedCharacter.mountedWorldbooks).toEqual([
            expect.objectContaining({
                id: savedWorldbook.id,
                title: '随卡世界书',
                content: '角色卡世界书内容',
                category: '随卡分组',
                position: 'after_impression',
            }),
        ]);
        expect(mockSetCharacters).toHaveBeenCalledWith(expect.any(Function));
        expect(mockSetWorldbooks).toHaveBeenCalledWith(expect.any(Function));
        expect(mockSetActiveCharacterId).toHaveBeenCalledWith(savedCharacter.id);
        expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('已同步 1 本世界书'), 'success');
    });
});
