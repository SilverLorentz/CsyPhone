import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    pushAgentContextSnapshot: vi.fn(),
    pullMemories: vi.fn(),
    buildCurrentLifeAnchorForCharacter: vi.fn(),
    getPrimaryApiConfig: vi.fn(),
    startAgentOnBackend: vi.fn(),
    stopAgentOnBackend: vi.fn(),
}));

vi.mock('./backendClient', () => ({
    pullMemories: mocks.pullMemories,
}));

vi.mock('./agentContextSnapshot', () => ({
    buildCoreMemoryDigest: vi.fn(() => ''),
    buildMountedWorldbooksDigest: vi.fn(() => ''),
}));

vi.mock('./runtimeConfig', () => ({
    getPrimaryApiConfig: mocks.getPrimaryApiConfig,
    getRealtimeConfig: vi.fn(() => ({})),
}));

vi.mock('./lifeAnchor', () => ({
    buildCurrentLifeAnchorForCharacter: mocks.buildCurrentLifeAnchorForCharacter,
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
    pushAgentContextSnapshot: mocks.pushAgentContextSnapshot,
    requestAgentTick: vi.fn(),
    startAgentOnBackend: mocks.startAgentOnBackend,
    stopAgentOnBackend: mocks.stopAgentOnBackend,
}));

vi.mock('./db', () => ({
    DB: {
        getAllCharacters: vi.fn(),
        getRecentMessagesByCharId: vi.fn(),
        getUserProfile: vi.fn(),
        getEmojis: vi.fn(),
        getVectorMemoryHeaders: vi.fn(),
    },
}));

import { BackendAgentManager } from './autonomousAgent';
import { DB } from './db';

const mockedDB = vi.mocked(DB);

describe('BackendAgentManager.refreshCharacterContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.pullMemories.mockResolvedValue([]);
        mocks.buildCurrentLifeAnchorForCharacter.mockReturnValue({ localDate: '2026-04-30' });
        mocks.getPrimaryApiConfig.mockReturnValue({ baseUrl: '', apiKey: '', model: '' });
        mocks.startAgentOnBackend.mockResolvedValue(undefined);
        mockedDB.getRecentMessagesByCharId.mockResolvedValue([
            {
                id: 1,
                charId: 'char-1',
                role: 'user',
                type: 'text',
                content: '我刚刚买了蓝莓酸奶',
                timestamp: 1777550400000,
            } as any,
        ]);
        mockedDB.getUserProfile.mockResolvedValue({ name: 'Tester' } as any);
        mockedDB.getEmojis.mockResolvedValue([]);
        mockedDB.getVectorMemoryHeaders.mockResolvedValue([]);
        mockedDB.getAllCharacters.mockResolvedValue([]);
    });

    it('pushes a context snapshot that includes the latest local chat messages', async () => {
        await BackendAgentManager.refreshCharacterContext('char-1', {
            id: 'char-1',
            name: 'Sully',
            systemPrompt: 'stay warm',
            description: 'friend',
        } as any);

        expect(mocks.pushAgentContextSnapshot).toHaveBeenCalledTimes(1);
        expect(mocks.pushAgentContextSnapshot.mock.calls[0][0]).toMatchObject({
            charId: 'char-1',
            charName: 'Sully',
            userName: 'Tester',
            recentMessages: [
                {
                    role: 'user',
                    content: '我刚刚买了蓝莓酸奶',
                    timestamp: 1777550400000,
                },
            ],
        });
    });

    it('starts backend with primary API as both apiConfig and mainApiConfig when primary is used as fallback', async () => {
        const primaryApi = {
            apiKey: 'main-key',
            baseUrl: 'https://main.example.com',
            model: 'gpt-main',
        };
        mocks.getPrimaryApiConfig.mockReturnValue(primaryApi);

        const manager = new BackendAgentManager();
        const stop = manager.start('char-1', {
            id: 'char-1',
            name: 'Sully',
            systemPrompt: 'stay warm',
            description: 'friend',
        } as any, primaryApi);

        try {
            await vi.waitFor(() => expect(mocks.startAgentOnBackend).toHaveBeenCalledTimes(1));

            expect(mocks.startAgentOnBackend.mock.calls[0][0]).toMatchObject({
                charId: 'char-1',
                apiConfig: primaryApi,
                mainApiConfig: primaryApi,
            });
        } finally {
            stop();
        }
    });

    it('starts backend with secondary apiConfig while preserving primary mainApiConfig', async () => {
        const primaryApi = {
            apiKey: 'main-key',
            baseUrl: 'https://main.example.com',
            model: 'gpt-main',
        };
        const secondaryApi = {
            apiKey: 'sub-key',
            baseUrl: 'https://sub.example.com',
            model: 'gpt-sub',
        };
        mocks.getPrimaryApiConfig.mockReturnValue(primaryApi);

        const manager = new BackendAgentManager();
        const stop = manager.start('char-1', {
            id: 'char-1',
            name: 'Sully',
            systemPrompt: 'stay warm',
            description: 'friend',
        } as any, secondaryApi);

        try {
            await vi.waitFor(() => expect(mocks.startAgentOnBackend).toHaveBeenCalledTimes(1));

            expect(mocks.startAgentOnBackend.mock.calls[0][0]).toMatchObject({
                charId: 'char-1',
                apiConfig: secondaryApi,
                mainApiConfig: primaryApi,
            });
        } finally {
            stop();
        }
    });
});
