// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Chat from './Chat';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { AGENT_MESSAGE_SAVED_EVENT_NAME } from '../utils/autonomousAgent';
import { ensureAgentTodayLife } from '../utils/agentBackendClient';
import type { Message } from '../types';

vi.mock('../context/OSContext', () => ({
    useOS: vi.fn(),
}));

vi.mock('../utils/db', () => ({
    DB: {
        getMessagesByCharId: vi.fn(() => Promise.resolve([])),
        getRecentMessageWindow: vi.fn(() => Promise.resolve({ messages: [], hasMore: false })),
        initializeEmojiData: vi.fn(() => Promise.resolve()),
        getEmojis: vi.fn(() => Promise.resolve([])),
        getEmojiCategories: vi.fn(() => Promise.resolve([])),
        deleteMessage: vi.fn(() => Promise.resolve()),
        deleteMessages: vi.fn(() => Promise.resolve()),
        deleteVoiceAudio: vi.fn(() => Promise.resolve()),
        clearMessages: vi.fn(() => Promise.resolve()),
        resolveCharacterContentId: vi.fn((charId: string) => Promise.resolve(charId)),
        saveGalleryImage: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../components/chat/MessageItem', () => ({
    default: (props: any) => {
        return (
            <button type="button" data-testid={`message-item-${props.msg.id}`} onClick={() => props.onLongPress(props.msg)}>
                {props.msg.content || 'Message Item'}
            </button>
        );
    },
}));

vi.mock('../components/chat/ChatHeader', () => ({
    default: () => <div>Chat Header</div>,
}));

vi.mock('../components/chat/ChatInputArea', () => ({
    default: (props: any) => (
        <div>
            <div>Chat Input</div>
            <button type="button" onClick={props.onSoulReflection}>打开回神</button>
        </div>
    ),
}));

vi.mock('../components/chat/ChatModals', () => ({
    default: (props: any) => (
        <div data-testid="chat-modals-state">
            {props.selectedMessage ? `selected:${props.selectedMessage.id}` : 'selected:none'}
            {props.modalType === 'message-options' && (
                <div data-testid="message-options-modal">
                    <button type="button" onClick={props.onReplyMessage}>引用 / 回复</button>
                    <button type="button" onClick={props.onDeleteMessage}>删除消息</button>
                    <button type="button" onClick={props.onCloseMessageOptions}>关闭消息操作</button>
                </div>
            )}
        </div>
    ),
}));

vi.mock('../components/os/Modal', () => ({
    default: () => null,
}));

vi.mock('../hooks/useChatAI', () => ({
    useChatAI: () => ({
        isTyping: false,
        recallStatus: '',
        searchStatus: '',
        diaryStatus: '',
        weiboStatus: '',
        lastTokenUsage: null,
        tokenBreakdown: null,
        setLastTokenUsage: vi.fn(),
        triggerAI: vi.fn(),
        retryMindSnapshot: vi.fn(),
    }),
}));

vi.mock('../hooks/useVoiceTts', () => ({
    useVoiceTts: () => ({
        playingMsgId: null,
        loadingMsgIds: new Set<number>(),
        playVoice: vi.fn(),
        stopVoice: vi.fn(),
        synthesizeForMessage: vi.fn(),
    }),
}));

vi.mock('../hooks/useVoiceRecorder', () => ({
    useVoiceRecorder: () => ({
        error: '',
        state: 'idle',
        duration: 0,
        startRecording: vi.fn(),
        stopRecording: vi.fn(),
        cancelRecording: vi.fn(),
        analyserNode: null,
        isSpeaking: false,
    }),
}));

vi.mock('../utils/file', () => ({
    processImage: vi.fn(),
}));

vi.mock('../utils/safeApi', () => ({
    safeResponseJson: vi.fn(),
}));

vi.mock('../utils/chatParser', () => ({
    parseBilingual: vi.fn((content: string) => ({ langA: content, langB: '' })),
}));

vi.mock('../utils/xhsMcpClient', () => ({
    XhsMcpClient: {
        getNoteDetail: vi.fn(),
    },
    normalizeNote: vi.fn(),
}));

vi.mock('./voicecall/unlockAudio', () => ({
    unlockAudio: vi.fn(),
}));

vi.mock('../utils/cloudStt', () => ({
    CloudStt: {
        transcribe: vi.fn(),
    },
    SttNotConfiguredError: class extends Error {},
}));

vi.mock('../utils/haptics', () => ({
    haptic: {
        light: vi.fn(),
        medium: vi.fn(),
    },
}));

vi.mock('../utils/autonomousAgent', () => ({
    BackendAgentManager: {
        notifyUserReplied: vi.fn(() => Promise.resolve()),
        refreshCharacterContext: vi.fn(() => Promise.resolve()),
    },
    AGENT_MESSAGE_SAVED_EVENT_NAME: 'agent-message-saved',
}));

vi.mock('../utils/agentBackendClient', () => ({
    ensureAgentTodayLife: vi.fn(() => Promise.resolve({ status: 'ready' })),
    fetchAgentTodaySchedule: vi.fn(() => Promise.resolve({
        charId: 'char-1',
        localDate: '2026-05-21',
        items: [],
        revisions: [],
    })),
    saveAgentScheduleRevision: vi.fn(() => Promise.resolve({
        charId: 'char-1',
        localDate: '2026-05-21',
        items: [],
        revisions: [],
    })),
    TODAY_SCHEDULE_UPDATED_EVENT_NAME: 'agent-today-schedule-updated',
}));

vi.mock('../utils/lifeProfileContextSnapshot', () => ({
    buildLifeProfileContextSnapshot: vi.fn(() => Promise.resolve({ charName: 'Sully' })),
}));

const mockedUseOS = vi.mocked(useOS);
const mockedDB = vi.mocked(DB);
const mockedEnsureAgentTodayLife = vi.mocked(ensureAgentTodayLife);

function buildOsContext(overrides: Record<string, unknown> = {}) {
    return {
        characters: [
            {
                id: 'char-2',
                name: 'Backup',
                avatar: 'backup.png',
            },
        ],
        activeCharacterId: 'char-missing',
        setActiveCharacterId: vi.fn(),
        updateCharacter: vi.fn(),
        apiConfig: {
            apiKey: '',
            baseUrl: 'https://example.com',
            model: 'gpt-test',
        },
        closeApp: vi.fn(),
        openApp: vi.fn(),
        customThemes: [],
        removeCustomTheme: vi.fn(),
        addToast: vi.fn(),
        userProfile: {
            name: 'Tester',
            avatar: 'user.png',
        },
        lastMsgTimestamp: 0,
        groups: [],
        clearUnread: vi.fn(),
        realtimeConfig: {},
        ttsConfig: null,
        sttConfig: null,
        isDataLoaded: true,
        ...overrides,
    } as any;
}

describe('Chat active character fallback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        localStorage.clear();

        mockedUseOS.mockReturnValue(buildOsContext());
    });

    it('falls back to the first available character when the active character id is stale', async () => {
        const setActiveCharacterId = vi.fn();
        mockedUseOS.mockReturnValue(buildOsContext({ setActiveCharacterId }));

        render(<Chat />);

        expect(screen.getByText('Chat Header')).toBeInTheDocument();
        expect(screen.getByText('Chat Input')).toBeInTheDocument();
        expect(screen.queryByText('角色资料同步中')).not.toBeInTheDocument();

        await waitFor(() => {
            expect(setActiveCharacterId).toHaveBeenCalledWith('char-2');
        });
    });

    it('renders a loading fallback while character data is still booting', async () => {
        const closeApp = vi.fn();
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [],
            activeCharacterId: '',
            isDataLoaded: false,
            closeApp,
        }));

        render(<Chat />);

        await waitFor(() => {
            expect(screen.getByText('角色资料同步中')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '返回桌面' })).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: '返回桌面' }));

        expect(closeApp).toHaveBeenCalledTimes(1);
    });

    it('shows a loading state while the first page of chat history is still loading', async () => {
        let resolveRecentMessages: ((value: { messages: any[]; hasMore: boolean }) => void) | null = null;
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [{ id: 'char-1', name: 'Sully', avatar: 'sully.png' }],
            activeCharacterId: 'char-1',
        }));
        mockedDB.getRecentMessageWindow.mockImplementationOnce(() => (
            new Promise((resolve) => {
                resolveRecentMessages = resolve;
            })
        ));

        render(<Chat />);

        expect(screen.getByText('正在载入最近的聊天记录...')).toBeInTheDocument();

        const fulfillRecentMessages = resolveRecentMessages as
            | ((value: { messages: any[]; hasMore: boolean }) => void)
            | null;
        if (fulfillRecentMessages) {
            fulfillRecentMessages({ messages: [], hasMore: false });
        }

        await waitFor(() => {
            expect(screen.queryByText('正在载入最近的聊天记录...')).not.toBeInTheDocument();
        });
    });

    it('loads additional history through the lightweight message window', async () => {
        const makeMessages = (count: number): Message[] => Array.from({ length: count }, (_, index) => ({
            id: index + 1,
            charId: 'char-1',
            role: index % 2 === 0 ? 'user' : 'assistant',
            type: 'text',
            content: `message-${index + 1}`,
            timestamp: 1000 + index,
        }));
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [{ id: 'char-1', name: 'Sully', avatar: 'sully.png' }],
            activeCharacterId: 'char-1',
        }));
        mockedDB.getRecentMessageWindow.mockImplementation((_charId: string, limit: number) => Promise.resolve({
            messages: makeMessages(limit),
            hasMore: limit <= 30,
        }));

        render(<Chat />);

        await waitFor(() => {
            expect(screen.getByText('加载历史消息')).toBeInTheDocument();
        });
        const loadMore = screen.getByText('加载历史消息');
        fireEvent.click(loadMore);

        await waitFor(() => {
            expect(mockedDB.getRecentMessageWindow).toHaveBeenCalledWith('char-1', 60);
        });
    });

    it('keeps loading older windows when recent date messages are hidden from the main chat', async () => {
        const hiddenDateMessages = Array.from({ length: 30 }, (_, index): Message => ({
            id: index + 31,
            charId: 'char-1',
            role: index % 2 === 0 ? 'user' : 'assistant',
            type: 'text',
            content: `date-${index + 1}`,
            timestamp: 2000 + index,
            metadata: { source: 'date' },
        }));
        const visibleMessages = Array.from({ length: 30 }, (_, index): Message => ({
            id: index + 1,
            charId: 'char-1',
            role: index % 2 === 0 ? 'user' : 'assistant',
            type: 'text',
            content: `chat-${index + 1}`,
            timestamp: 1000 + index,
        }));
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [{ id: 'char-1', name: 'Sully', avatar: 'sully.png' }],
            activeCharacterId: 'char-1',
        }));
        mockedDB.getRecentMessageWindow.mockImplementation((_charId: string, limit: number) => Promise.resolve({
            messages: limit <= 30 ? hiddenDateMessages : [...visibleMessages, ...hiddenDateMessages],
            hasMore: limit <= 30,
        }));

        render(<Chat />);

        await waitFor(() => {
            expect(mockedDB.getRecentMessageWindow).toHaveBeenCalledWith('char-1', 60);
            expect(screen.getByTestId('message-item-30')).toHaveTextContent('chat-30');
        });
        expect(screen.queryByText('date-1')).not.toBeInTheDocument();
    });

    it('keeps life stream fragments hidden from the main chat', async () => {
        localStorage.setItem('agent_lifestream_visibility_char-1', 'true');
        const messages: Message[] = [
            {
                id: 1,
                charId: 'char-1',
                role: 'assistant',
                type: 'lifestream' as any,
                content: '午后的草坪生活碎片',
                timestamp: 1000,
            },
            {
                id: 2,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '上午在党校这边给培训班上了半天课，刚下课，准备去食堂吃午饭。',
                timestamp: 1500,
                metadata: {
                    source: 'autonomous',
                    fromBackend: true,
                    backendMessageId: 'backend-life-1',
                },
            },
            {
                id: 3,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '看到消息回我一下，哪怕只发个表情。',
                timestamp: 1700,
                metadata: {
                    source: 'autonomous',
                    fromBackend: true,
                    backendMessageId: 'backend-checkin-1',
                },
            },
            {
                id: 4,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '正常聊天消息',
                timestamp: 2000,
            },
        ];
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [{ id: 'char-1', name: 'Sully', avatar: 'sully.png' }],
            activeCharacterId: 'char-1',
        }));
        mockedDB.getRecentMessageWindow.mockResolvedValue({
            messages,
            hasMore: false,
        });

        render(<Chat />);

        await waitFor(() => {
            expect(screen.getByTestId('message-item-4')).toHaveTextContent('正常聊天消息');
        });
        expect(screen.queryByText('午后的草坪生活碎片')).not.toBeInTheDocument();
        expect(screen.queryByText('上午在党校这边给培训班上了半天课，刚下课，准备去食堂吃午饭。')).not.toBeInTheDocument();
        expect(screen.getByText('看到消息回我一下，哪怕只发个表情。')).toBeInTheDocument();
    });

    it('ignores a stale imported history breakpoint so new chat messages stay visible', async () => {
        const messages: Message[] = [
            {
                id: 1,
                charId: 'char-1',
                role: 'user',
                type: 'text',
                content: '新导入角色后的第一条消息',
                timestamp: 1000,
            },
            {
                id: 2,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '我能正常显示回复',
                timestamp: 2000,
            },
        ];
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [{
                id: 'char-1',
                name: 'Sully',
                avatar: 'sully.png',
                hideBeforeMessageId: 999999,
            }],
            activeCharacterId: 'char-1',
        }));
        mockedDB.getRecentMessageWindow.mockResolvedValue({
            messages,
            hasMore: false,
        });

        render(<Chat />);

        await waitFor(() => {
            expect(screen.getByTestId('message-item-1')).toHaveTextContent('新导入角色后的第一条消息');
            expect(screen.getByTestId('message-item-2')).toHaveTextContent('我能正常显示回复');
        });
    });

    it('opens the soul reflection panel with the active character name', async () => {
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [{ id: 'char-1', name: 'Sully', avatar: 'sully.png' }],
            activeCharacterId: 'char-1',
        }));

        render(<Chat />);

        await waitFor(() => {
            expect(screen.getByText('Chat Input')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: '打开回神' }));

        expect(screen.getByPlaceholderText('和Sully说...')).toBeInTheDocument();
    });

    it('clears the selected message after choosing reply and allows another quote target', async () => {
        const messages: Message[] = [
            {
                id: 1,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '第一条可引用',
                timestamp: 1000,
            },
            {
                id: 2,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '第二条可引用',
                timestamp: 2000,
            },
        ];
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [{ id: 'char-1', name: 'Sully', avatar: 'sully.png' }],
            activeCharacterId: 'char-1',
        }));
        mockedDB.getRecentMessageWindow.mockResolvedValue({
            messages,
            hasMore: false,
        });

        render(<Chat />);

        await waitFor(() => {
            expect(screen.getByTestId('message-item-1')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('message-item-1'));
        expect(screen.getByTestId('chat-modals-state')).toHaveTextContent('selected:1');
        fireEvent.click(screen.getByRole('button', { name: '引用 / 回复' }));

        expect(screen.getByText('正在回复:')).toBeInTheDocument();
        expect(screen.getAllByText('第一条可引用')).toHaveLength(2);
        expect(screen.getByTestId('chat-modals-state')).toHaveTextContent('selected:none');

        fireEvent.click(screen.getByTestId('message-item-2'));
        expect(screen.getByTestId('chat-modals-state')).toHaveTextContent('selected:2');
        fireEvent.click(screen.getByRole('button', { name: '引用 / 回复' }));

        expect(screen.getByTestId('chat-modals-state')).toHaveTextContent('selected:none');
        expect(screen.getAllByText('第一条可引用')).toHaveLength(1);
        expect(screen.getAllByText('第二条可引用')).toHaveLength(2);
    });

    it('keeps a deleted image message deleted across current-chat reloads', async () => {
        const clearUnread = vi.fn();
        let storedMessages: Message[] = [
            {
                id: 77,
                charId: 'char-1',
                role: 'assistant',
                type: 'image',
                content: 'https://cdn.example.com/broken-generated.webp',
                timestamp: 1000,
                metadata: {
                    status: 'ready',
                    imageId: 'photo-77',
                    thumbnailUrl: 'https://cdn.example.com/broken-generated.webp',
                },
            },
        ];
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [{ id: 'char-1', name: 'Sully', avatar: 'sully.png' }],
            activeCharacterId: 'char-1',
            clearUnread,
        }));
        mockedDB.getRecentMessageWindow.mockImplementation(() => Promise.resolve({
            messages: storedMessages,
            hasMore: false,
        }));
        mockedDB.deleteMessage.mockImplementation(async (id: number) => {
            storedMessages = storedMessages.filter(message => message.id !== id);
        });

        render(<Chat />);

        await waitFor(() => {
            expect(screen.getByTestId('message-item-77')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('message-item-77'));
        fireEvent.click(screen.getByRole('button', { name: '删除消息' }));

        await waitFor(() => {
            expect(mockedDB.deleteMessage).toHaveBeenCalledWith(77);
        });
        expect(screen.queryByTestId('message-item-77')).not.toBeInTheDocument();

        mockedDB.getRecentMessageWindow.mockClear();
        window.dispatchEvent(new CustomEvent(AGENT_MESSAGE_SAVED_EVENT_NAME, {
            detail: {
                charId: 'char-1',
                contentCharId: 'char-1',
                messageId: 78,
                backendMessageId: 'backend-msg-78',
                role: 'assistant',
                source: 'autonomous',
            },
        }));

        await waitFor(() => {
            expect(mockedDB.getRecentMessageWindow).toHaveBeenCalledWith('char-1', 30);
        });
        expect(screen.queryByTestId('message-item-77')).not.toBeInTheDocument();
    });

    it('reloads the current chat when a backend agent message is saved for the active character', async () => {
        const clearUnread = vi.fn();
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [{ id: 'char-1', name: 'Sully', avatar: 'sully.png' }],
            activeCharacterId: 'char-1',
            clearUnread,
        }));

        render(<Chat />);

        await waitFor(() => {
            expect(mockedDB.getRecentMessageWindow).toHaveBeenCalled();
        });
        mockedDB.getRecentMessageWindow.mockClear();
        clearUnread.mockClear();

        window.dispatchEvent(new CustomEvent(AGENT_MESSAGE_SAVED_EVENT_NAME, {
            detail: {
                charId: 'char-1',
                contentCharId: 'char-1',
                messageId: 99,
                backendMessageId: 'backend-msg-99',
                role: 'assistant',
                source: 'autonomous',
            },
        }));

        await waitFor(() => {
            expect(mockedDB.getRecentMessageWindow).toHaveBeenCalledWith('char-1', 30);
        });
        expect(clearUnread).toHaveBeenCalledWith('char-1');
    });

    it('ignores backend agent message events for other characters', async () => {
        const clearUnread = vi.fn();
        mockedUseOS.mockReturnValue(buildOsContext({
            characters: [{ id: 'char-1', name: 'Sully', avatar: 'sully.png' }],
            activeCharacterId: 'char-1',
            clearUnread,
        }));

        render(<Chat />);

        await waitFor(() => {
            expect(mockedDB.getRecentMessageWindow).toHaveBeenCalled();
        });
        mockedDB.getRecentMessageWindow.mockClear();
        clearUnread.mockClear();

        window.dispatchEvent(new CustomEvent(AGENT_MESSAGE_SAVED_EVENT_NAME, {
            detail: {
                charId: 'char-2',
                contentCharId: 'char-2',
                messageId: 100,
                backendMessageId: 'backend-msg-100',
                role: 'assistant',
                source: 'autonomous',
            },
        }));

        expect(mockedDB.getRecentMessageWindow).not.toHaveBeenCalled();
        expect(clearUnread).not.toHaveBeenCalled();
    });

    it('does not resync today life just because the chat timestamp changes', async () => {
        const character = { id: 'char-1', name: 'Sully', avatar: 'sully.png' };
        const apiConfig = { apiKey: 'main-key', baseUrl: 'https://main.example.com', model: 'main-model' };
        const osContext = buildOsContext({
            characters: [character],
            activeCharacterId: 'char-1',
            apiConfig,
            lastMsgTimestamp: 1000,
        });
        mockedUseOS.mockImplementation(() => osContext);
        mockedDB.getRecentMessageWindow.mockResolvedValue({
            messages: [{
                id: 1,
                charId: 'char-1',
                role: 'user',
                type: 'text',
                content: 'hello',
                timestamp: 1000,
            }],
            hasMore: false,
        });
        localStorage.setItem('chat_today_schedule_enabled_char-1', 'true');

        const { rerender } = render(<Chat />);

        await waitFor(() => expect(mockedEnsureAgentTodayLife).toHaveBeenCalledTimes(1));
        mockedEnsureAgentTodayLife.mockClear();

        osContext.lastMsgTimestamp = 2000;
        rerender(<Chat />);

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 1300));
        });

        expect(mockedEnsureAgentTodayLife).not.toHaveBeenCalled();
    });
});
