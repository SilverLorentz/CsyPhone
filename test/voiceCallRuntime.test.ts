import { describe,expect,it } from 'vitest';
import {
    getVoiceCallRuntimeProfile,
    isIosWebKitRuntime,
    VOICE_CALL_DEFAULT_RECENT_CONTEXT_LIMIT,
    VOICE_CALL_DEFAULT_SAMPLE_RATE,
    VOICE_CALL_LOW_MEMORY_RECENT_CONTEXT_LIMIT,
    VOICE_CALL_LOW_MEMORY_SAMPLE_RATE,
} from '../apps/voicecall/voiceCallRuntime';

describe('voice call runtime profile', () => {
    it('uses low-memory text input on iPhone Safari/PWA', () => {
        const probe = {
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
            platform: 'iPhone',
            maxTouchPoints: 5,
            standalone: true,
        };

        expect(isIosWebKitRuntime(probe)).toBe(true);
        expect(getVoiceCallRuntimeProfile(probe)).toEqual({
            lowMemoryMode: true,
            voiceInputMode: 'text-only',
            recentContextLimit: VOICE_CALL_LOW_MEMORY_RECENT_CONTEXT_LIMIT,
            ttsSampleRate: VOICE_CALL_LOW_MEMORY_SAMPLE_RATE,
            persistAssistantAudio: false,
        });
    });

    it('detects iPadOS desktop-mode Safari as iOS WebKit', () => {
        const probe = {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
            platform: 'MacIntel',
            maxTouchPoints: 5,
        };

        expect(isIosWebKitRuntime(probe)).toBe(true);
        expect(getVoiceCallRuntimeProfile(probe).voiceInputMode).toBe('text-only');
    });

    it('keeps the full voice profile on desktop browsers', () => {
        const probe = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            platform: 'Win32',
            maxTouchPoints: 0,
        };

        expect(isIosWebKitRuntime(probe)).toBe(false);
        expect(getVoiceCallRuntimeProfile(probe)).toEqual({
            lowMemoryMode: false,
            voiceInputMode: 'voice',
            recentContextLimit: VOICE_CALL_DEFAULT_RECENT_CONTEXT_LIMIT,
            ttsSampleRate: VOICE_CALL_DEFAULT_SAMPLE_RATE,
            persistAssistantAudio: true,
        });
    });
});
