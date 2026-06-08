import React,{ createContext,useContext,useEffect,useRef,useState } from 'react';
import {
    AGENT_MESSAGE_SAVED_EVENT_NAME,
    type AgentMessageSavedEventDetail,
    BackendAgentManager,
    getAgentConfig,
    type SecondaryApiConfig,
} from '../utils/autonomousAgent';
import { didCharacterContextRelevantFieldsChange } from '../utils/agentContextSnapshot';
import { showLocalNotification } from '../utils/localNotification';
import { APP_NOTIFICATION_NAME, formatNotificationBody } from '../utils/notificationPreview';
import { disablePushSubscription,getPushDebugInfo,initPushSubscription } from '../utils/pushSubscription';
import { selectSecondaryApiConfig } from '../utils/runtimeConfig';
import { consumeCharacterUpdateOptions,useCharacter } from './CharacterContext';
import { useConfig } from './ConfigContext';
import { useApp } from './AppContext';
import { AppID } from '../types';

export interface AgentContextType {}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

const toAgentApiConfig = (
    config?: { apiKey?: string; baseUrl?: string; model?: string } | null,
): SecondaryApiConfig | undefined => {
    const apiKey = config?.apiKey?.trim();
    const baseUrl = config?.baseUrl?.trim();
    const model = config?.model?.trim();
    if (!apiKey || !baseUrl || !model) {
        return undefined;
    }

    return {
        apiKey,
        baseUrl,
        model,
    };
};

const getAgentStartApiConfig = (): SecondaryApiConfig | undefined => {
    return toAgentApiConfig(selectSecondaryApiConfig());
};

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { characters, activeCharacterId, setActiveCharacterId, isCharacterDataLoaded } = useCharacter();
    const { isConfigLoaded } = useConfig();
    const { openApp } = useApp();
    const [agentReloadCounter, setAgentReloadCounter] = useState(0);
    const [agentEnabled, setAgentEnabled] = useState(
        () => getAgentConfig().enabled,
    );
    const [notificationsEnabled, setNotificationsEnabled] = useState(
        () => getAgentConfig().notificationsEnabled,
    );
    const isAgentReady = isCharacterDataLoaded && isConfigLoaded;
    const managerRef = useRef<BackendAgentManager | null>(null);
    const activeCharacter = characters.find(character => character.id === activeCharacterId) || null;
    const activeCharacterRef = useRef(activeCharacter);
    const previousActiveCharacterRef = useRef(activeCharacter);

    activeCharacterRef.current = activeCharacter;

    useEffect(() => {
        const handler = () => {
            const nextConfig = getAgentConfig();
            setAgentReloadCounter(count => count + 1);
            setAgentEnabled(nextConfig.enabled);
            setNotificationsEnabled(nextConfig.notificationsEnabled);
        };
        window.addEventListener('agent-config-changed', handler);
        return () => window.removeEventListener('agent-config-changed', handler);
    }, []);

    useEffect(() => {
        if (!isAgentReady || !agentEnabled || !activeCharacterId) return;

        const char = activeCharacterRef.current;
        if (!char) return;

        const apiConfig = getAgentStartApiConfig();
        if (!apiConfig) return;

        const manager = new BackendAgentManager();
        managerRef.current = manager;
        manager.start(activeCharacterId, char, apiConfig);

        let keepBackendAlive = false;
        const markPageExit = () => {
            keepBackendAlive = true;
        };

        window.addEventListener('pagehide', markPageExit);
        window.addEventListener('beforeunload', markPageExit);

        return () => {
            window.removeEventListener('pagehide', markPageExit);
            window.removeEventListener('beforeunload', markPageExit);
            if (managerRef.current === manager) {
                managerRef.current = null;
            }

            if (keepBackendAlive) {
                try {
                    manager.disconnectFrontend();
                } catch (error) {
                    console.warn('[Agent] Failed to disconnect frontend runtime safely:', error);
                }
                return;
            }

            try {
                manager.stop();
            } catch (error) {
                console.warn('[Agent] Failed to stop backend agent safely during cleanup:', error);
            }
        };
    }, [isAgentReady, agentEnabled, activeCharacterId, agentReloadCounter]);

    useEffect(() => {
        const previousCharacter = previousActiveCharacterRef.current;
        previousActiveCharacterRef.current = activeCharacter;

        if (!isAgentReady || !agentEnabled || !activeCharacter) return;
        if (!previousCharacter || previousCharacter.id !== activeCharacter.id) return;
        if (previousCharacter === activeCharacter) return;

        const didContextRelevantFieldsChange = didCharacterContextRelevantFieldsChange(
            previousCharacter,
            activeCharacter,
        );
        const updateOptions = consumeCharacterUpdateOptions(activeCharacter.id);
        if (!didContextRelevantFieldsChange) {
            return;
        }
        if (updateOptions?.skipImmediateAgentContextPush) {
            return;
        }

        managerRef.current?.pushContext(activeCharacter).catch((error) => {
            console.warn('[Agent] Failed to push refreshed character context:', error);
        });
    }, [activeCharacter, agentEnabled, isAgentReady]);

    useEffect(() => {
        if (!isAgentReady) return;
        if (!agentEnabled || !notificationsEnabled) {
            disablePushSubscription().catch(err => {
                console.warn('[Push] Disable failed:', err.message || err);
            });
            return;
        }

        const timer = setTimeout(() => {
            initPushSubscription().catch(err => {
                console.warn('[Push] Init failed:', err.message || err);
            });
        }, 3000);

        return () => clearTimeout(timer);
    }, [isAgentReady, agentEnabled, notificationsEnabled]);

    useEffect(() => {
        if (!isAgentReady || !agentEnabled || !notificationsEnabled) return;

        const refreshPushSubscription = () => {
            if (document.visibilityState !== 'visible') return;

            initPushSubscription().catch(err => {
                console.warn('[Push] Resume sync failed:', err.message || err);
            });
        };

        document.addEventListener('visibilitychange', refreshPushSubscription);
        window.addEventListener('pageshow', refreshPushSubscription);

        return () => {
            document.removeEventListener('visibilitychange', refreshPushSubscription);
            window.removeEventListener('pageshow', refreshPushSubscription);
        };
    }, [isAgentReady, agentEnabled, notificationsEnabled]);

    useEffect(() => {
        if (!isAgentReady || !agentEnabled || !notificationsEnabled) return;

        const handleAgentMessageSaved = (event: Event) => {
            const detail = (event as CustomEvent<AgentMessageSavedEventDetail>).detail;
            if (!detail || detail.role !== 'assistant') return;
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

            const pushInfo = getPushDebugInfo();
            if (pushInfo.offlineCapable) return;

            const character = characters.find(char =>
                char.id === detail.charId
                || char.id === detail.contentCharId
                || char.charInstanceId === detail.contentCharId,
            );
            const title = character?.name || APP_NOTIFICATION_NAME;

            void showLocalNotification({
                title,
                body: formatNotificationBody(detail.contentPreview),
                icon: character?.avatar || '/icons/icon-192.webp',
                badge: '/icons/icon-96.webp',
                tag: `agent-${detail.backendMessageId}`,
                data: { charId: character?.id || detail.charId },
                silent: false,
                renotify: true,
                requireInteraction: false,
                vibrate: [200, 100, 200],
                onClick: () => {
                    window.focus();
                    if (character) {
                        setActiveCharacterId(character.id);
                    }
                    openApp(AppID.Chat);
                },
            });
        };

        window.addEventListener(AGENT_MESSAGE_SAVED_EVENT_NAME, handleAgentMessageSaved);
        return () => window.removeEventListener(AGENT_MESSAGE_SAVED_EVENT_NAME, handleAgentMessageSaved);
    }, [
        characters,
        isAgentReady,
        agentEnabled,
        notificationsEnabled,
        openApp,
        setActiveCharacterId,
    ]);

    return (
        <AgentContext.Provider value={{}}>
            {children}
        </AgentContext.Provider>
    );
};

export const useAgent = () => {
    const context = useContext(AgentContext);
    if (context === undefined) {
        throw new Error('useAgent must be used within an AgentProvider');
    }
    return context;
};
