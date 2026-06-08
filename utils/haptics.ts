
import { Capacitor } from '@capacitor/core';
import { Haptics,ImpactStyle,NotificationType } from '@capacitor/haptics';

// ── Global Toggle (read by all haptic functions) ────────────────────────────
// This is set from OSContext and persisted in IndexedDB.
let _hapticsEnabled = true;

export const setHapticsEnabled = (v: boolean) => { _hapticsEnabled = v; };
export const getHapticsEnabled = () => _hapticsEnabled;

const isNative = Capacitor.isNativePlatform();

// ── Core vibration wrapper ──────────────────────────────────────────────────
const vibrate = (style: ImpactStyle, fallbackMs: number) => {
    if (!_hapticsEnabled) return;
    try {
        if (isNative) { Haptics.impact({ style }); }
        else if (navigator.vibrate) { navigator.vibrate(fallbackMs); }
    } catch { /* silent */ }
};

const notify = (type: NotificationType, fallbackMs: number) => {
    if (!_hapticsEnabled) return;
    try {
        if (isNative) { Haptics.notification({ type }); }
        else if (navigator.vibrate) { navigator.vibrate(fallbackMs); }
    } catch { /* silent */ }
};

// ── Semantic API ────────────────────────────────────────────────────────────
export const haptic = {
    light: () => vibrate(ImpactStyle.Light, 10),
    medium: () => vibrate(ImpactStyle.Medium, 20),
    heavy: () => vibrate(ImpactStyle.Heavy, 30),
    success: () => notify(NotificationType.Success, 15),
    warning: () => notify(NotificationType.Warning, 25),
    error: () => notify(NotificationType.Error, 30),
    selection: () => vibrate(ImpactStyle.Light, 8),
};

// ── Generic Theme Notification Sound ────────────────────────────────────────
// Caches Audio objects per URL for reuse across calls.
const _soundCache = new Map<string, HTMLAudioElement>();

/**
 * Play a notification sound for the active theme.
 * The URL is provided by the ThemePlugin registry.
 * Audio elements are lazily created and cached per-URL.
 */
export const playThemeNotification = (url: string) => {
    try {
        let sound = _soundCache.get(url);
        if (!sound) {
            sound = new Audio(url);
            sound.volume = 0.6;
            sound.preload = 'auto';
            _soundCache.set(url, sound);
        }
        sound.currentTime = 0;
        sound.play().catch(() => { /* autoplay blocked or network error — silent */ });
    } catch { /* silent */ }
};

// ── Backward-Compatible Alias ───────────────────────────────────────────────
const WECHAT_NOTIFICATION_URL = 'https://image2url.com/r2/default/audio/1771769870930-c9be8c96-c34e-4509-bc81-48619ad5406d.wav';

/** @deprecated Use playThemeNotification(url) instead. Kept for backward compatibility. */
export const playWechatNotification = () => playThemeNotification(WECHAT_NOTIFICATION_URL);

// Eagerly pre-load (but NOT play) the WeChat sound on module initialization
if (typeof window !== 'undefined') {
    const _preload = new Audio(WECHAT_NOTIFICATION_URL);
    _preload.volume = 0.6;
    _preload.preload = 'auto';
    _soundCache.set(WECHAT_NOTIFICATION_URL, _preload);
}
