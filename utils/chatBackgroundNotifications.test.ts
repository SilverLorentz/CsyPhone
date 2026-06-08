// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CHAT_BACKGROUND_NOTIFICATIONS_CHANGED_EVENT_NAME,
    CHAT_BACKGROUND_NOTIFICATIONS_STORAGE_KEY,
    getChatBackgroundNotificationsEnabled,
    setChatBackgroundNotificationsEnabled,
} from './chatBackgroundNotifications';

describe('chat background notifications setting', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('defaults to enabled', () => {
        expect(getChatBackgroundNotificationsEnabled()).toBe(true);
    });

    it('persists disabled state', () => {
        setChatBackgroundNotificationsEnabled(false);

        expect(localStorage.getItem(CHAT_BACKGROUND_NOTIFICATIONS_STORAGE_KEY)).toBe('false');
        expect(getChatBackgroundNotificationsEnabled()).toBe(false);
    });

    it('emits a change event when updated', () => {
        const listener = vi.fn();
        window.addEventListener(CHAT_BACKGROUND_NOTIFICATIONS_CHANGED_EVENT_NAME, listener);

        setChatBackgroundNotificationsEnabled(true);

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            detail: { enabled: true },
        }));

        window.removeEventListener(CHAT_BACKGROUND_NOTIFICATIONS_CHANGED_EVENT_NAME, listener);
    });
});
