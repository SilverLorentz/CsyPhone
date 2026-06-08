import { formatNotificationBody, formatNotificationTitle } from './notificationPreview';

const PUSH_SW_URL = '/push-sw.js';
const PUSH_SW_SCOPE = '/';

type BrowserNotificationOptions = NotificationOptions & {
    renotify?: boolean;
    vibrate?: VibratePattern;
};

export interface LocalNotificationPayload {
    title: string;
    body?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: unknown;
    silent?: boolean;
    renotify?: boolean;
    requireInteraction?: boolean;
    vibrate?: number[];
    onClick?: () => void;
}

function isNotificationReady(): boolean {
    return typeof window !== 'undefined'
        && 'Notification' in window
        && Notification.permission === 'granted';
}

function buildNotificationOptions(payload: LocalNotificationPayload): BrowserNotificationOptions {
    return {
        body: formatNotificationBody(payload.body),
        icon: payload.icon || '/icons/icon-192.webp',
        badge: payload.badge || '/icons/icon-96.webp',
        tag: payload.tag,
        data: payload.data,
        silent: payload.silent,
        renotify: payload.renotify,
        requireInteraction: payload.requireInteraction,
        vibrate: payload.vibrate,
    };
}

async function getLocalNotificationRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return null;
    }

    const existing = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE)
        || await navigator.serviceWorker.getRegistration(PUSH_SW_URL);

    if (existing) {
        return existing.active ? existing : navigator.serviceWorker.ready;
    }

    await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE });
    return navigator.serviceWorker.ready;
}

export async function showLocalNotification(payload: LocalNotificationPayload): Promise<boolean> {
    if (!isNotificationReady()) return false;

    const options = buildNotificationOptions(payload);
    const title = formatNotificationTitle(payload.title);

    try {
        const registration = await getLocalNotificationRegistration();
        if (registration && typeof registration.showNotification === 'function') {
            await registration.showNotification(title, options);
            return true;
        }
    } catch (error) {
        console.warn('[Notification] Service worker notification failed:', error);
    }

    try {
        const notification = new Notification(title, options);
        if (payload.onClick) {
            notification.onclick = () => {
                notification.close();
                payload.onClick?.();
            };
        }
        return true;
    } catch (error) {
        console.warn('[Notification] Page notification failed:', error);
        return false;
    }
}
