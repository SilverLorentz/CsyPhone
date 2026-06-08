// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentProvider } from './AgentContext';
import { AppID } from '../types';

const mockUseCharacter = vi.hoisted(() => vi.fn());
const mockConsumeCharacterUpdateOptions = vi.hoisted(() => vi.fn());
const mockUseConfig = vi.hoisted(() => vi.fn());
const appMocks = vi.hoisted(() => ({
    openApp: vi.fn(),
}));
const pushMocks = vi.hoisted(() => ({
    disablePushSubscription: vi.fn(() => Promise.resolve()),
    getPushDebugInfo: vi.fn(() => ({
        status: '未初始化',
        endpoint: '',
        error: '',
        provider: '未知',
        offlineCapable: false,
        needsResubscribe: false,
    })),
    initPushSubscription: vi.fn(() => Promise.resolve()),
}));
const notificationMocks = vi.hoisted(() => ({
    showLocalNotification: vi.fn(() => Promise.resolve(true)),
}));
const runtimeConfigMocks = vi.hoisted(() => ({
    getPrimaryApiConfig: vi.fn(),
    selectSecondaryApiConfig: vi.fn(),
}));
const agentMocks = vi.hoisted(() => ({
    disconnectFrontend: vi.fn(),
    getAgentConfig: vi.fn(() => ({ enabled: true, notificationsEnabled: false })),
    pushContext: vi.fn(() => Promise.resolve()),
    start: vi.fn(),
    stop: vi.fn(),
}));

vi.mock('./CharacterContext', () => ({
    consumeCharacterUpdateOptions: mockConsumeCharacterUpdateOptions,
    useCharacter: mockUseCharacter,
}));

vi.mock('./ConfigContext', () => ({
    useConfig: mockUseConfig,
}));

vi.mock('../utils/autonomousAgent', () => ({
    AGENT_MESSAGE_SAVED_EVENT_NAME: 'agent-message-saved',
    BackendAgentManager: class MockBackendAgentManager {
        disconnectFrontend = agentMocks.disconnectFrontend;
        pushContext = agentMocks.pushContext;
        start = agentMocks.start;
        stop = agentMocks.stop;
    },
    getAgentConfig: agentMocks.getAgentConfig,
}));

vi.mock('./AppContext', () => ({
    useApp: () => ({
        openApp: appMocks.openApp,
    }),
}));

vi.mock('../utils/runtimeConfig', () => ({
    getPrimaryApiConfig: runtimeConfigMocks.getPrimaryApiConfig,
    selectSecondaryApiConfig: runtimeConfigMocks.selectSecondaryApiConfig,
}));

vi.mock('../utils/pushSubscription', () => ({
    disablePushSubscription: pushMocks.disablePushSubscription,
    getPushDebugInfo: pushMocks.getPushDebugInfo,
    initPushSubscription: pushMocks.initPushSubscription,
}));

vi.mock('../utils/localNotification', () => ({
    showLocalNotification: notificationMocks.showLocalNotification,
}));

const baseCharacter = {
    avatar: 'avatar.png',
    description: '测试角色',
    id: 'char-1',
    memories: [],
    name: 'Sully',
    systemPrompt: '',
} as any;

function setDocumentVisibility(visibilityState: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: visibilityState,
    });
}

describe('AgentContext location updates', () => {
    let characterState: any;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        setDocumentVisibility('visible');

        characterState = {
            activeCharacterId: 'char-1',
            characters: [baseCharacter],
            isCharacterDataLoaded: true,
            setActiveCharacterId: vi.fn(),
        };

        mockUseCharacter.mockImplementation(() => characterState);
        mockUseConfig.mockReturnValue({ isConfigLoaded: true });
        mockConsumeCharacterUpdateOptions.mockReturnValue(null);
        agentMocks.getAgentConfig.mockReturnValue({ enabled: true, notificationsEnabled: false });
        runtimeConfigMocks.getPrimaryApiConfig.mockReturnValue({
            apiKey: '',
            baseUrl: '',
            model: 'gpt-4o-mini',
        });
        runtimeConfigMocks.selectSecondaryApiConfig.mockReturnValue({
            apiKey: 'sub-key',
            baseUrl: 'https://sub.example.com',
            model: 'gpt-sub',
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('starts backend agent with the secondary API when both primary and secondary API are configured', () => {
        runtimeConfigMocks.getPrimaryApiConfig.mockReturnValue({
            apiKey: 'main-key',
            baseUrl: 'https://main.example.com',
            model: 'gpt-main',
        });

        render(
            <AgentProvider>
                <div>child</div>
            </AgentProvider>,
        );

        expect(agentMocks.start).toHaveBeenCalledTimes(1);
        expect(agentMocks.start).toHaveBeenCalledWith(
            'char-1',
            baseCharacter,
            {
                apiKey: 'sub-key',
                baseUrl: 'https://sub.example.com',
                model: 'gpt-sub',
            },
        );
    });

    it('does not start backend agent when autonomous agent is disabled', () => {
        agentMocks.getAgentConfig.mockReturnValue({ enabled: false, notificationsEnabled: false });

        render(
            <AgentProvider>
                <div>child</div>
            </AgentProvider>,
        );

        expect(agentMocks.start).not.toHaveBeenCalled();
        expect(runtimeConfigMocks.selectSecondaryApiConfig).not.toHaveBeenCalled();
    });

    it('does not start backend agent with the primary API when secondary API is missing', () => {
        runtimeConfigMocks.getPrimaryApiConfig.mockReturnValue({
            apiKey: 'main-key',
            baseUrl: 'https://main.example.com',
            model: 'gpt-main',
        });
        runtimeConfigMocks.selectSecondaryApiConfig.mockReturnValue(undefined);

        render(
            <AgentProvider>
                <div>child</div>
            </AgentProvider>,
        );

        expect(agentMocks.start).not.toHaveBeenCalled();
        expect(runtimeConfigMocks.getPrimaryApiConfig).not.toHaveBeenCalled();
    });

    it('does not start backend agent when the secondary API is incomplete even if primary is configured', () => {
        runtimeConfigMocks.getPrimaryApiConfig.mockReturnValue({
            apiKey: 'main-key',
            baseUrl: 'https://main.example.com',
            model: 'gpt-main',
        });
        runtimeConfigMocks.selectSecondaryApiConfig.mockReturnValue({
            apiKey: 'sub-key',
            baseUrl: 'https://sub.example.com',
            model: '',
        });

        render(
            <AgentProvider>
                <div>child</div>
            </AgentProvider>,
        );

        expect(agentMocks.start).not.toHaveBeenCalled();
        expect(runtimeConfigMocks.getPrimaryApiConfig).not.toHaveBeenCalled();
    });

    it('does not push agent context immediately for location updates marked to skip', async () => {
        const { rerender } = render(
            <AgentProvider>
                <div>child</div>
            </AgentProvider>,
        );

        const updatedCharacter = {
            ...baseCharacter,
            cityAdcode: '310000',
            cityOverride: '上海',
        };

        mockConsumeCharacterUpdateOptions.mockReturnValueOnce({
            reason: 'location',
            skipImmediateAgentContextPush: true,
        });
        characterState = {
            ...characterState,
            characters: [updatedCharacter],
        };

        await act(async () => {
            rerender(
                <AgentProvider>
                    <div>child</div>
                </AgentProvider>,
            );
            await Promise.resolve();
        });

        expect(mockConsumeCharacterUpdateOptions).toHaveBeenCalledWith('char-1');
        expect(agentMocks.pushContext).not.toHaveBeenCalled();
    });

    it('does not push agent context for location-only updates even without a skip marker', async () => {
        const { rerender } = render(
            <AgentProvider>
                <div>child</div>
            </AgentProvider>,
        );

        const updatedCharacter = {
            ...baseCharacter,
            cityAdcode: '330100',
            cityOverride: '杭州',
        };

        characterState = {
            ...characterState,
            characters: [updatedCharacter],
        };

        await act(async () => {
            rerender(
                <AgentProvider>
                    <div>child</div>
                </AgentProvider>,
            );
            await Promise.resolve();
        });

        expect(mockConsumeCharacterUpdateOptions).toHaveBeenCalledWith('char-1');
        expect(agentMocks.pushContext).not.toHaveBeenCalled();
    });

    it('still pushes agent context for regular same-character updates', async () => {
        const { rerender } = render(
            <AgentProvider>
                <div>child</div>
            </AgentProvider>,
        );

        const updatedCharacter = {
            ...baseCharacter,
            description: '更新后的描述',
        };

        characterState = {
            ...characterState,
            characters: [updatedCharacter],
        };

        await act(async () => {
            rerender(
                <AgentProvider>
                    <div>child</div>
                </AgentProvider>,
            );
            await Promise.resolve();
        });

        expect(mockConsumeCharacterUpdateOptions).toHaveBeenCalledWith('char-1');
        expect(agentMocks.pushContext).toHaveBeenCalledTimes(1);
        expect(agentMocks.pushContext).toHaveBeenCalledWith(updatedCharacter);
    });

    it('shows a browser notification fallback for hidden-page agent messages when Web Push is unavailable', () => {
        agentMocks.getAgentConfig.mockReturnValue({ enabled: true, notificationsEnabled: true });
        setDocumentVisibility('hidden');

        render(
            <AgentProvider>
                <div>child</div>
            </AgentProvider>,
        );

        act(() => {
            window.dispatchEvent(new CustomEvent('agent-message-saved', {
                detail: {
                    charId: 'char-1',
                    contentCharId: 'char-1',
                    messageId: 42,
                    backendMessageId: 'backend-msg-1',
                    role: 'assistant',
                    source: 'autonomous',
                    contentPreview: '我回来了',
                },
            }));
        });

        expect(notificationMocks.showLocalNotification).toHaveBeenCalledTimes(1);
        expect(notificationMocks.showLocalNotification).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Sully',
            body: '我回来了',
            icon: 'avatar.png',
            tag: 'agent-backend-msg-1',
            data: { charId: 'char-1' },
        }));

        vi.spyOn(window, 'focus').mockImplementation(() => {});

        act(() => {
            notificationMocks.showLocalNotification.mock.calls[0][0].onClick?.();
        });

        expect(characterState.setActiveCharacterId).toHaveBeenCalledWith('char-1');
        expect(appMocks.openApp).toHaveBeenCalledWith(AppID.Chat);
    });

    it('does not duplicate browser notifications when Web Push is already offline-capable', () => {
        agentMocks.getAgentConfig.mockReturnValue({ enabled: true, notificationsEnabled: true });
        pushMocks.getPushDebugInfo.mockReturnValue({
            status: '推送通知已就绪',
            endpoint: 'https://fcm.googleapis.com/fcm/send/example',
            error: '',
            provider: 'Chrome/FCM',
            offlineCapable: true,
            needsResubscribe: false,
        });
        setDocumentVisibility('hidden');

        render(
            <AgentProvider>
                <div>child</div>
            </AgentProvider>,
        );

        act(() => {
            window.dispatchEvent(new CustomEvent('agent-message-saved', {
                detail: {
                    charId: 'char-1',
                    contentCharId: 'char-1',
                    messageId: 42,
                    backendMessageId: 'backend-msg-1',
                    role: 'assistant',
                    source: 'autonomous',
                    contentPreview: '我回来了',
                },
            }));
        });

        expect(notificationMocks.showLocalNotification).not.toHaveBeenCalled();
    });
});
