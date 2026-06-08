// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getClientId: vi.fn(() => 'client-1'),
    saveMessageOnceByBackendId: vi.fn(),
}));

vi.mock('./backendClient', () => ({
    getClientId: mocks.getClientId,
    pullMemories: vi.fn(),
}));

vi.mock('./agentContextSnapshot', () => ({
    buildCoreMemoryDigest: vi.fn(() => ''),
    buildMountedWorldbooksDigest: vi.fn(() => ''),
}));

vi.mock('./runtimeConfig', () => ({
    getPrimaryApiConfig: vi.fn(() => ({ baseUrl: '', apiKey: '', model: '' })),
    getRealtimeConfig: vi.fn(() => ({})),
}));

vi.mock('./lifeAnchor', () => ({
    buildCurrentLifeAnchorForCharacter: vi.fn(() => null),
}));

vi.mock('./storage', () => ({
    readJsonStorage: vi.fn(() => null),
    safeLocalStorageGet: vi.fn(() => null),
    safeLocalStorageSet: vi.fn(),
    writeJsonStorage: vi.fn(),
}));

vi.mock('./agentBackendClient', () => ({
    ackAgentMessages: vi.fn(),
    buildAgentSseUrl: vi.fn(() => ''),
    fetchAgentLifeStream: vi.fn(),
    fetchPendingAgentMessages: vi.fn(),
    notifyAgentUserReplied: vi.fn(),
    pushAgentContextSnapshot: vi.fn(),
    requestAgentTick: vi.fn(),
    startAgentOnBackend: vi.fn(),
    stopAgentOnBackend: vi.fn(),
}));

vi.mock('./db', () => ({
    DB: {
        getAllCharacters: vi.fn(),
        getRecentMessagesByCharId: vi.fn(),
        getUserProfile: vi.fn(),
        getEmojis: vi.fn(),
        getVectorMemoryHeaders: vi.fn(),
        resolveCharacterContentId: vi.fn(),
        saveMessage: vi.fn(),
        saveMessageOnceByBackendId: mocks.saveMessageOnceByBackendId,
    },
}));

import {
    AGENT_MESSAGE_SAVED_EVENT_NAME,
    type AgentMessageSavedEventDetail,
    BackendAgentManager,
    syncPendingAgentMessagesForCharacter,
} from './autonomousAgent';
import { ackAgentMessages, fetchPendingAgentMessages } from './agentBackendClient';
import { DB } from './db';

const mockedDB = vi.mocked(DB);
const mockAckAgentMessages = vi.mocked(ackAgentMessages);
const mockFetchPendingAgentMessages = vi.mocked(fetchPendingAgentMessages);

function createManager() {
    const manager = new BackendAgentManager();
    (manager as any).uiCharId = 'ui-char-1';
    (manager as any).charId = 'content-char-1';
    return manager;
}

function listenForAgentMessageSaved() {
    const events: AgentMessageSavedEventDetail[] = [];
    const handler = (event: Event) => {
        events.push((event as CustomEvent<AgentMessageSavedEventDetail>).detail);
    };
    window.addEventListener(AGENT_MESSAGE_SAVED_EVENT_NAME, handler);
    return {
        events,
        cleanup: () => window.removeEventListener(AGENT_MESSAGE_SAVED_EVENT_NAME, handler),
    };
}

describe('BackendAgentManager agent message saved event', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedDB.resolveCharacterContentId.mockResolvedValue('content-char-1');
        mockFetchPendingAgentMessages.mockResolvedValue([]);
        mockAckAgentMessages.mockResolvedValue(undefined);
    });

    it('dispatches an event with message details after saving a new backend message', async () => {
        mockedDB.saveMessageOnceByBackendId.mockResolvedValue({ saved: true, id: 42 });
        const manager = createManager();
        const listener = listenForAgentMessageSaved();

        try {
            await (manager as any).enqueueBackendMessage({
                id: 'backend-msg-1',
                role: 'assistant',
                content: '我回来了',
                createdAt: 1777550400000,
                metadata: { source: 'autonomous', reason: 'gentle_check_in' },
            });

            expect(listener.events).toEqual([
                {
                    charId: 'ui-char-1',
                    contentCharId: 'content-char-1',
                    messageId: 42,
                    backendMessageId: 'backend-msg-1',
                    role: 'assistant',
                    source: 'autonomous',
                    contentPreview: '我回来了',
                },
            ]);
            expect(mockedDB.saveMessageOnceByBackendId).toHaveBeenCalledWith(expect.objectContaining({
                charId: 'content-char-1',
                role: 'assistant',
                content: '我回来了',
                metadata: expect.objectContaining({
                    backendMessageId: 'backend-msg-1',
                    source: 'autonomous',
                    fromBackend: true,
                }),
            }));
        } finally {
            listener.cleanup();
        }
    });

    it('does not dispatch when the backend message was already saved', async () => {
        mockedDB.saveMessageOnceByBackendId.mockResolvedValue({ saved: false, id: 42 });
        const manager = createManager();
        const listener = listenForAgentMessageSaved();

        try {
            await (manager as any).enqueueBackendMessage({
                id: 'backend-msg-1',
                role: 'assistant',
                content: '重复消息',
                metadata: { source: 'autonomous' },
            });

            expect(listener.events).toEqual([]);
        } finally {
            listener.cleanup();
        }
    });

    it('stores backend life stream style messages as hidden fragments', async () => {
        mockedDB.saveMessageOnceByBackendId.mockResolvedValue({ saved: true, id: 43 });
        const manager = createManager();
        const listener = listenForAgentMessageSaved();

        try {
            await (manager as any).enqueueBackendMessage({
                id: 'backend-life-1',
                role: 'assistant',
                content: '上午在党校这边给培训班上了半天课，刚下课，准备去食堂吃午饭。',
                createdAt: 1777550400000,
                metadata: { source: 'autonomous' },
            });

            expect(listener.events).toEqual([]);
            expect(mockedDB.saveMessageOnceByBackendId).toHaveBeenCalledWith(expect.objectContaining({
                type: 'lifestream',
                metadata: expect.objectContaining({
                    backendMessageId: 'backend-life-1',
                    source: 'autonomous',
                    fromBackend: true,
                    hiddenFromUser: true,
                    lifeStreamHidden: true,
                }),
            }));
        } finally {
            listener.cleanup();
        }
    });

    it('pulls pending Weixin messages by content char id and saves them locally', async () => {
        mockedDB.resolveCharacterContentId.mockResolvedValue('content-char-1');
        mockedDB.saveMessageOnceByBackendId.mockResolvedValue({ saved: true, id: 44 });
        mockFetchPendingAgentMessages.mockResolvedValue([
            {
                id: 232217,
                role: 'user',
                content: '同步过来的微信消息',
                createdAt: 1780401203025,
                targetClientId: 'client-1',
                metadata: {
                    source: 'weixin',
                    targetClientId: 'client-1',
                    originalTimestamp: 1780401203025,
                    fromWeixinId: 'wx-user-1',
                },
            },
        ]);

        await expect(syncPendingAgentMessagesForCharacter('chinst-1')).resolves.toEqual({
            received: 1,
            saved: 1,
            acked: 1,
        });

        expect(mockFetchPendingAgentMessages).toHaveBeenCalledWith('content-char-1', {
            includeDelivered: true,
        });
        expect(mockedDB.saveMessageOnceByBackendId).toHaveBeenCalledWith(expect.objectContaining({
            charId: 'content-char-1',
            role: 'user',
            content: '同步过来的微信消息',
            metadata: expect.objectContaining({
                source: 'weixin',
                targetClientId: 'client-1',
                fromBackend: true,
                backendMessageId: '232217',
            }),
        }));
        expect(mockAckAgentMessages).toHaveBeenCalledWith([232217]);
    });
});
