/**
 * Push Subscription Manager
 *
 * Called after app boot. Safe to call repeatedly.
 */

import { buildBackendHeaders,getBackendUrl } from './backendClient';
import { safeTimeoutSignal } from './safeTimeout';

let _pushStatus = '未初始化';
let _pushEndpoint = '';
let _pushError = '';
let _pushProvider = '未知';
let _pushOfflineCapable = false;
let _pushNeedsResubscribe = false;

class PushFeatureUnavailableError extends Error {}

type PushSyncResult = 'synced' | 'disabled' | 'invalid';

export interface PushDebugInfo {
    status: string;
    endpoint: string;
    error: string;
    provider: string;
    offlineCapable: boolean;
    needsResubscribe: boolean;
}

export function classifyPushEndpoint(endpoint: string): string {
    if (!endpoint) return '未知';
    if (endpoint.includes('permanently-removed.invalid')) return 'Edge Android 不可投递';
    if (endpoint.includes('fcm.googleapis.com')) return 'Chrome/FCM';
    if (endpoint.includes('mozilla.com')) return 'Firefox';
    if (endpoint.includes('windows.com')) return 'Edge/WNS';
    if (endpoint.includes('apple.com')) return 'Safari/APNs';
    return '未知';
}

export function getPushEndpointIssue(endpoint: unknown): string | null {
    if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
        return 'missing_endpoint';
    }

    let url: URL;
    try {
        url = new URL(endpoint);
    } catch {
        return 'invalid_url';
    }

    if (url.protocol !== 'https:') {
        return 'non_https_endpoint';
    }

    if (url.hostname === 'permanently-removed.invalid') {
        return 'removed_push_endpoint';
    }

    return null;
}

function setPushDebugInfo(patch: Partial<PushDebugInfo>): void {
    if (patch.status !== undefined) _pushStatus = patch.status;
    if (patch.endpoint !== undefined) _pushEndpoint = patch.endpoint;
    if (patch.error !== undefined) _pushError = patch.error;
    if (patch.provider !== undefined) _pushProvider = patch.provider;
    if (patch.offlineCapable !== undefined) _pushOfflineCapable = patch.offlineCapable;
    if (patch.needsResubscribe !== undefined) _pushNeedsResubscribe = patch.needsResubscribe;
}

export function getPushDebugInfo(): PushDebugInfo {
    return {
        status: _pushStatus,
        endpoint: _pushEndpoint,
        error: _pushError,
        provider: _pushProvider,
        offlineCapable: _pushOfflineCapable,
        needsResubscribe: _pushNeedsResubscribe,
    };
}

export async function disablePushSubscription(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushDebugInfo({
            status: '浏览器不支持 Web Push',
            endpoint: '',
            error: '',
            provider: '不支持',
            offlineCapable: false,
            needsResubscribe: false,
        });
        return;
    }

    setPushDebugInfo({ error: '', needsResubscribe: false });

    try {
        const registration = await navigator.serviceWorker.getRegistration('/push-sw.js');
        if (!registration) {
            setPushDebugInfo({
                status: '推送通知已禁用',
                endpoint: '',
                provider: '未知',
                offlineCapable: false,
            });
            return;
        }

        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            setPushDebugInfo({
                status: '推送通知已禁用',
                endpoint: '',
                provider: '未知',
                offlineCapable: false,
            });
            return;
        }

        await syncUnsubscribeToBackend(subscription).catch((error: any) => {
            console.warn('[Push] Failed to sync unsubscribe to backend:', error.message);
        });

        await subscription.unsubscribe();
        setPushDebugInfo({
            status: '推送通知已禁用',
            endpoint: '',
            provider: '未知',
            offlineCapable: false,
        });
    } catch (error: any) {
        setPushDebugInfo({
            status: '禁用推送失败',
            error: error.message || String(error),
        });
        throw error;
    }
}

export async function initPushSubscription(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushDebugInfo({
            status: '浏览器不支持 Web Push',
            provider: '不支持',
            offlineCapable: false,
            needsResubscribe: false,
        });
        console.log('[Push] Not supported in this browser');
        return;
    }

    if (
        typeof (window as any)?.Capacitor?.isNativePlatform === 'function'
        && (window as any).Capacitor.isNativePlatform()
    ) {
        setPushDebugInfo({
            status: '原生环境，跳过 Web Push',
            provider: '原生',
            offlineCapable: false,
            needsResubscribe: false,
        });
        return;
    }

    const backendUrl = getBackendUrl();
    if (!backendUrl) {
        setPushDebugInfo({
            status: '未配置后端地址',
            provider: '未知',
            offlineCapable: false,
        });
        console.log('[Push] No backend URL configured, skipping');
        return;
    }

    setPushDebugInfo({
        status: '正在注册...',
        error: '',
        needsResubscribe: false,
    });

    try {
        const registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        console.log('[Push] Service Worker registered');

        let subscription = await registration.pushManager.getSubscription();
        const vapidPublicKey = await fetchVapidPublicKey(backendUrl);

        if (subscription) {
            const endpointIssue = getPushEndpointIssue(subscription.endpoint);
            const provider = classifyPushEndpoint(subscription.endpoint);
            setPushDebugInfo({
                status: '已订阅，正在检查离线推送通道...',
                endpoint: `${subscription.endpoint.slice(0, 60)}...`,
                provider,
                offlineCapable: !endpointIssue,
            });

            if (endpointIssue) {
                await syncUnsubscribeToBackend(subscription).catch((error: any) => {
                    console.warn('[Push] Failed to sync invalid unsubscribe to backend:', error.message);
                });
                await subscription.unsubscribe().catch(() => {});
                setPushDebugInfo({
                    status: '当前浏览器返回的推送端点不可投递',
                    error: '建议使用 Chrome Android、Safari iOS 主屏幕 PWA，或重新安装 PWA 后再初始化。',
                    provider,
                    offlineCapable: false,
                    needsResubscribe: true,
                });
                return;
            }

            if (vapidPublicKey && isSubscriptionUsingVapidKey(subscription, vapidPublicKey) === false) {
                await syncUnsubscribeToBackend(subscription).catch((error: any) => {
                    console.warn('[Push] Failed to sync VAPID mismatch unsubscribe to backend:', error.message);
                });
                await subscription.unsubscribe();
                subscription = null;
                setPushDebugInfo({
                    status: '推送密钥已更新，正在重新订阅...',
                    endpoint: '',
                    provider: '未知',
                    offlineCapable: false,
                    needsResubscribe: true,
                });
            } else {
                setPushDebugInfo({
                    status: '已订阅，正在同步到后端...',
                    endpoint: `${subscription.endpoint.slice(0, 60)}...`,
                    provider,
                    offlineCapable: true,
                    needsResubscribe: false,
                });
                console.log('[Push] Already subscribed, syncing to backend...');

                const syncResult = await syncSubscriptionToBackend(backendUrl, subscription);
                if (syncResult === 'disabled') {
                    setPushDebugInfo({ status: '当前环境未启用推送订阅接口' });
                    return;
                }
                if (syncResult === 'invalid') {
                    setPushDebugInfo({
                        status: '后端拒绝了当前推送端点',
                        offlineCapable: false,
                        needsResubscribe: true,
                    });
                    return;
                }

                setPushDebugInfo({ status: '已订阅，离线推送就绪' });
                return;
            }
        }

        if (!('Notification' in window)) {
            setPushDebugInfo({
                status: '当前浏览器不支持通知权限',
                provider: '不支持',
                offlineCapable: false,
            });
            return;
        }

        if (Notification.permission === 'default') {
            setPushDebugInfo({ status: '等待通知权限...' });
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setPushDebugInfo({
                    status: '通知权限被拒绝',
                    error: '请在浏览器设置中开启通知权限。',
                    offlineCapable: false,
                });
                console.log('[Push] Notification permission denied');
                return;
            }
        } else if (Notification.permission === 'denied') {
            setPushDebugInfo({
                status: '通知权限已被禁用',
                error: '通知权限已被禁用，请在浏览器站点设置里开启。',
                offlineCapable: false,
            });
            console.log('[Push] Notification permission previously denied');
            return;
        }

        if (!vapidPublicKey) {
            setPushDebugInfo({
                status: 'VAPID 公钥为空',
                error: 'VAPID key empty from server',
                offlineCapable: false,
            });
            console.warn('[Push] VAPID key empty');
            return;
        }

        setPushDebugInfo({ status: '正在创建推送订阅...' });

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
                });
                break;
            } catch (error: any) {
                console.warn(`[Push] Subscribe attempt ${attempt}/3 failed:`, error.message);
                if (attempt === 3) {
                    setPushDebugInfo({
                        status: '推送订阅创建失败',
                        error: `创建推送订阅失败: ${error.message}`,
                        offlineCapable: false,
                        needsResubscribe: true,
                    });
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
        }

        if (!subscription) {
            setPushDebugInfo({ status: '推送订阅为空', offlineCapable: false });
            return;
        }

        const endpointIssue = getPushEndpointIssue(subscription.endpoint);
        const provider = classifyPushEndpoint(subscription.endpoint);
        setPushDebugInfo({
            endpoint: `${subscription.endpoint.slice(0, 60)}...`,
            provider,
            offlineCapable: !endpointIssue,
        });

        if (endpointIssue) {
            await subscription.unsubscribe().catch(() => {});
            setPushDebugInfo({
                status: '当前浏览器返回的推送端点不可投递',
                error: '浏览器返回了不可投递的 Web Push endpoint，未上传到后端。',
                offlineCapable: false,
                needsResubscribe: true,
            });
            return;
        }

        console.log('[Push] Subscribed to push notifications');
        setPushDebugInfo({ status: '正在同步订阅到后端...' });

        const syncResult = await syncSubscriptionToBackend(backendUrl, subscription);
        if (syncResult === 'disabled') {
            setPushDebugInfo({ status: '当前环境未启用推送订阅接口' });
            return;
        }
        if (syncResult === 'invalid') {
            setPushDebugInfo({
                status: '后端拒绝了当前推送端点',
                offlineCapable: false,
                needsResubscribe: true,
            });
            return;
        }

        setPushDebugInfo({
            status: '推送通知已就绪',
            offlineCapable: true,
            needsResubscribe: false,
        });
        console.log('[Push] Push notification setup complete');

        try {
            setPushDebugInfo({ status: '正在发送测试通知...' });
            await sendTestPush(backendUrl);
            setPushDebugInfo({ status: '推送通知已就绪（测试通知已发送）' });
        } catch (error: any) {
            console.warn('[Push] Test push failed (non-critical):', error.message);
            setPushDebugInfo({ status: '推送通知已就绪（测试通知发送失败，但订阅成功）' });
        }
    } catch (error: any) {
        setPushDebugInfo({
            status: '初始化失败',
            error: error.message || String(error),
        });
        console.warn('[Push] Initialization failed:', error.message);
    }
}

export async function forceResubscribe(): Promise<void> {
    try {
        const registration = await navigator.serviceWorker.getRegistration('/push-sw.js');
        if (registration) {
            const existingSubscription = await registration.pushManager.getSubscription();
            if (existingSubscription) {
                await syncUnsubscribeToBackend(existingSubscription).catch((error: any) => {
                    console.warn('[Push] Failed to sync manual unsubscribe to backend:', error.message);
                });
                await existingSubscription.unsubscribe();
                console.log('[Push] Unsubscribed existing subscription');
            }
        }
    } catch {
        // Continue into a clean re-init path.
    }

    await initPushSubscription();
}

async function fetchVapidPublicKey(backendUrl: string): Promise<string> {
    setPushDebugInfo({ status: '正在获取 VAPID 公钥...' });

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const keyResponse = await fetch(`${backendUrl}/api/push/vapid-key`, {
                headers: buildBackendHeaders({ contentType: false }),
                signal: safeTimeoutSignal(30000),
            });

            if (!keyResponse.ok) {
                throw new Error(`HTTP ${keyResponse.status}`);
            }

            const keyData = await keyResponse.json();
            return keyData.vapidPublicKey || '';
        } catch (error: any) {
            console.warn(`[Push] VAPID key fetch attempt ${attempt}/3 failed:`, error.message);
            if (attempt === 3) {
                setPushDebugInfo({
                    status: '获取 VAPID 公钥失败',
                    error: `VAPID 公钥获取失败: ${error.message}`,
                });
                return '';
            }
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }

    return '';
}

async function syncSubscriptionToBackend(
    backendUrl: string,
    subscription: PushSubscription,
): Promise<PushSyncResult> {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const headers = new Headers(buildBackendHeaders());
            headers.set('Content-Type', 'application/json');

            const response = await fetch(`${backendUrl}/api/push/subscribe`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ subscription: subscription.toJSON() }),
                signal: safeTimeoutSignal(30000),
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`[Push] Subscription synced to backend (${data.subscriptionCount || 1} device(s))`);
                return 'synced';
            }

            if (response.status === 405) {
                throw new PushFeatureUnavailableError('Push subscription endpoint is not enabled in this environment (HTTP 405)');
            }

            if (response.status === 400) {
                const data = await response.json().catch(() => null) as { error?: string; reason?: string } | null;
                if (data?.error === 'invalid_push_endpoint') {
                    _pushError = data.reason || 'invalid_push_endpoint';
                    return 'invalid';
                }
            }

            throw new Error(`HTTP ${response.status}`);
        } catch (error: any) {
            if (error instanceof PushFeatureUnavailableError) {
                setPushDebugInfo({
                    status: '当前环境未启用推送订阅接口',
                    error: '',
                });
                console.warn('[Push] Subscription endpoint returned 405, skipping push setup for this environment');
                return 'disabled';
            }

            console.warn(`[Push] Backend sync attempt ${attempt}/3 failed:`, error.message);
            if (attempt === 3) {
                _pushError = `后端同步失败: ${error.message}`;
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }

    return 'disabled';
}

async function syncUnsubscribeToBackend(subscription: PushSubscription): Promise<void> {
    const backendUrl = getBackendUrl();
    if (!backendUrl) return;

    const headers = new Headers(buildBackendHeaders());
    headers.set('Content-Type', 'application/json');

    const response = await fetch(`${backendUrl}/api/push/unsubscribe`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpoint: subscription.endpoint }),
        signal: safeTimeoutSignal(10000),
    });

    if (response.ok || response.status === 405) {
        return;
    }

    throw new Error(`HTTP ${response.status}`);
}

async function sendTestPush(backendUrl: string): Promise<void> {
    const headers = new Headers(buildBackendHeaders());
    headers.set('Content-Type', 'application/json');

    const response = await fetch(`${backendUrl}/api/push/test`, {
        method: 'POST',
        headers,
        signal: safeTimeoutSignal(30000),
    });

    if (response.ok) {
        console.log('[Push] Test notification sent');
        return;
    }

    if (response.status === 405) {
        console.warn('[Push] Test push endpoint returned 405, skipping test notification');
        return;
    }

    const text = await response.text().catch(() => '');
    console.warn('[Push] Test push failed:', response.status, text);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function bufferSourceToUint8Array(source: BufferSource): Uint8Array {
    if (source instanceof ArrayBuffer) {
        return new Uint8Array(source);
    }

    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

export function isSubscriptionUsingVapidKey(
    subscription: Pick<PushSubscription, 'options'>,
    vapidPublicKey: string,
): boolean | null {
    const applicationServerKey = subscription.options?.applicationServerKey;
    if (!applicationServerKey) return null;

    const current = uint8ArrayToBase64Url(bufferSourceToUint8Array(applicationServerKey));
    const expected = uint8ArrayToBase64Url(urlBase64ToUint8Array(vapidPublicKey));
    return current === expected;
}
