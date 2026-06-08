import { safeLocalStorageGet, safeLocalStorageSet } from './storage';

export const CHAT_BACKGROUND_NOTIFICATIONS_STORAGE_KEY = 'chat_background_notifications_enabled';
export const CHAT_BACKGROUND_NOTIFICATIONS_CHANGED_EVENT_NAME = 'chat-background-notifications-changed';

export function getChatBackgroundNotificationsEnabled(): boolean {
    return safeLocalStorageGet(CHAT_BACKGROUND_NOTIFICATIONS_STORAGE_KEY) !== 'false';
}

export function setChatBackgroundNotificationsEnabled(enabled: boolean): void {
    safeLocalStorageSet(CHAT_BACKGROUND_NOTIFICATIONS_STORAGE_KEY, enabled ? 'true' : 'false');
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CHAT_BACKGROUND_NOTIFICATIONS_CHANGED_EVENT_NAME, {
            detail: { enabled },
        }));
    }
}
