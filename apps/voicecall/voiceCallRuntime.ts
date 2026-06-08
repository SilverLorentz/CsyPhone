export type VoiceCallInputMode = 'voice' | 'text-only';

export interface VoiceCallRuntimeProbe {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
    standalone?: boolean;
    displayModeStandalone?: boolean;
}

export interface VoiceCallRuntimeProfile {
    lowMemoryMode: boolean;
    voiceInputMode: VoiceCallInputMode;
    recentContextLimit: number;
    ttsSampleRate: number;
    persistAssistantAudio: boolean;
}

export const VOICE_CALL_DEFAULT_SAMPLE_RATE = 24000;
export const VOICE_CALL_LOW_MEMORY_SAMPLE_RATE = 16000;
export const VOICE_CALL_DEFAULT_RECENT_CONTEXT_LIMIT = 50;
export const VOICE_CALL_LOW_MEMORY_RECENT_CONTEXT_LIMIT = 20;

export function readCurrentVoiceCallRuntimeProbe(): VoiceCallRuntimeProbe {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const standalone = typeof window !== 'undefined'
        ? (window.navigator as any)?.standalone === true
        : false;
    const displayModeStandalone = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches
        : false;

    return {
        userAgent: nav?.userAgent,
        platform: nav?.platform,
        maxTouchPoints: nav?.maxTouchPoints,
        standalone,
        displayModeStandalone,
    };
}

export function isIosWebKitRuntime(probe: VoiceCallRuntimeProbe = readCurrentVoiceCallRuntimeProbe()): boolean {
    const userAgent = probe.userAgent || '';
    const platform = probe.platform || '';
    const maxTouchPoints = probe.maxTouchPoints ?? 0;

    const isIosDevice = /iP(?:hone|ad|od)/i.test(userAgent) || /iP(?:hone|ad|od)/i.test(platform);
    const isIpadDesktopMode = platform === 'MacIntel' && maxTouchPoints > 1 && /AppleWebKit/i.test(userAgent);
    const isAppleWebKit = /AppleWebKit/i.test(userAgent);
    const isAndroid = /Android/i.test(userAgent);

    return !isAndroid && isAppleWebKit && (isIosDevice || isIpadDesktopMode);
}

export function getVoiceCallRuntimeProfile(
    probe: VoiceCallRuntimeProbe = readCurrentVoiceCallRuntimeProbe(),
): VoiceCallRuntimeProfile {
    const lowMemoryMode = isIosWebKitRuntime(probe);

    if (lowMemoryMode) {
        return {
            lowMemoryMode: true,
            // 不再预先禁用语音输入 — 让引擎尝试加载 VAD，
            // 如果 ONNX/WASM 加载失败，try-catch 会自动降级为 text-only
            voiceInputMode: 'voice',
            recentContextLimit: VOICE_CALL_LOW_MEMORY_RECENT_CONTEXT_LIMIT,
            ttsSampleRate: VOICE_CALL_LOW_MEMORY_SAMPLE_RATE,
            persistAssistantAudio: false,
        };
    }

    return {
        lowMemoryMode: false,
        voiceInputMode: 'voice',
        recentContextLimit: VOICE_CALL_DEFAULT_RECENT_CONTEXT_LIMIT,
        ttsSampleRate: VOICE_CALL_DEFAULT_SAMPLE_RATE,
        persistAssistantAudio: true,
    };
}
