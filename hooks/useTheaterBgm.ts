/**
 * useTheaterBgm — Theater 场景 BGM 播放 Hook
 *
 * 进入场景时自动触发 BGM 生成（或从缓存读取），
 * 生成完毕后自动播放，离开场景自动停止。
 * 使用独立 Audio 实例，不干扰 Emo Cloud 主播放器。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TheaterLocation, TimeSlot, DirectorEvent } from '../types/theater';
import {
    buildBgmCacheKey,
    generateTheaterBgm,
    cleanupBgmBlobUrls,
    type BgmStatus,
    type GenerateBgmResult,
} from '../utils/theaterBgm';

const BGM_FADE_DURATION_MS = 1500;
const BGM_DEFAULT_VOLUME = 0.35;
const BGM_STORAGE_KEY = 'theater_bgm_enabled';
const BGM_VOLUME_KEY = 'theater_bgm_volume';

function readBgmEnabled(): boolean {
    try {
        const raw = localStorage.getItem(BGM_STORAGE_KEY);
        return raw !== 'false';
    } catch { return true; }
}

function writeBgmEnabled(enabled: boolean): void {
    try { localStorage.setItem(BGM_STORAGE_KEY, String(enabled)); } catch { /* */ }
}

function readBgmVolume(): number {
    try {
        const raw = localStorage.getItem(BGM_VOLUME_KEY);
        if (raw) {
            const v = parseFloat(raw);
            if (Number.isFinite(v) && v >= 0 && v <= 1) return v;
        }
    } catch { /* */ }
    return BGM_DEFAULT_VOLUME;
}

function writeBgmVolume(volume: number): void {
    try { localStorage.setItem(BGM_VOLUME_KEY, String(volume)); } catch { /* */ }
}

export interface UseTheaterBgmOptions {
    location: TheaterLocation;
    timeSlot: TimeSlot;
    event?: DirectorEvent | null;
    apiKey: string;
    groupId?: string;
    musicBaseUrl?: string;
}

export interface UseTheaterBgmReturn {
    status: BgmStatus;
    enabled: boolean;
    volume: number;
    error: string | null;
    /** Toggle BGM on/off */
    toggle: () => void;
    /** Set volume 0~1 */
    setVolume: (v: number) => void;
    /** Force regenerate current scene BGM (ignores cache) */
    regenerate: () => void;
}

export function useTheaterBgm({
    location,
    timeSlot,
    event,
    apiKey,
    groupId,
    musicBaseUrl,
}: UseTheaterBgmOptions): UseTheaterBgmReturn {
    const [status, setStatus] = useState<BgmStatus>('idle');
    const [enabled, setEnabled] = useState(readBgmEnabled);
    const [volume, setVolumeState] = useState(readBgmVolume);
    const [error, setError] = useState<string | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const locationKeyRef = useRef('');
    const regenerateCountRef = useRef(0);

    // Get or create a dedicated Audio element for BGM
    const getAudio = useCallback(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.loop = true;
            audioRef.current.volume = volume;
        }
        return audioRef.current;
    }, []);

    // Fade in helper
    const fadeIn = useCallback((audio: HTMLAudioElement, targetVolume: number) => {
        if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
        audio.volume = 0;

        const steps = 30;
        const stepMs = BGM_FADE_DURATION_MS / steps;
        const increment = targetVolume / steps;
        let current = 0;

        fadeTimerRef.current = setInterval(() => {
            current += increment;
            if (current >= targetVolume) {
                audio.volume = targetVolume;
                if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
                fadeTimerRef.current = null;
            } else {
                audio.volume = current;
            }
        }, stepMs);
    }, []);

    // Fade out and stop
    const fadeOutAndStop = useCallback((audio: HTMLAudioElement) => {
        if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);

        const startVolume = audio.volume;
        if (startVolume <= 0) {
            audio.pause();
            return;
        }

        const steps = 20;
        const stepMs = (BGM_FADE_DURATION_MS * 0.6) / steps;
        const decrement = startVolume / steps;
        let current = startVolume;

        fadeTimerRef.current = setInterval(() => {
            current -= decrement;
            if (current <= 0) {
                audio.volume = 0;
                audio.pause();
                if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
                fadeTimerRef.current = null;
            } else {
                audio.volume = current;
            }
        }, stepMs);
    }, []);

    // Stop current playback
    const stopPlayback = useCallback(() => {
        const audio = audioRef.current;
        if (audio) {
            fadeOutAndStop(audio);
        }
        abortRef.current?.abort();
        abortRef.current = null;
    }, [fadeOutAndStop]);

    // Start BGM generation + playback
    const startBgm = useCallback(async (forceRegenerate = false) => {
        if (!apiKey || !enabled) return;

        // Abort previous
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setStatus('generating');
        setError(null);

        try {
            // If force regenerating, clear cache for this scene
            if (forceRegenerate) {
                const cacheKey = buildBgmCacheKey(location.id, timeSlot);
                try { localStorage.removeItem(cacheKey); } catch { /* */ }
            }

            const result: GenerateBgmResult = await generateTheaterBgm({
                apiKey,
                groupId,
                location,
                timeSlot,
                event,
                musicBaseUrl,
                signal: controller.signal,
            });

            if (controller.signal.aborted) return;

            // Play the BGM
            const audio = getAudio();
            audio.src = result.blobUrl;
            audio.loop = true;
            audio.currentTime = 0;

            try {
                await audio.play();
                fadeIn(audio, volume);
                setStatus('ready');
            } catch (playError) {
                // Autoplay blocked — still mark as ready, will play on next user interaction
                console.warn('[TheaterBGM] Autoplay blocked, BGM ready but needs interaction:', playError);
                setStatus('ready');
            }
        } catch (err) {
            if (controller.signal.aborted) return;
            const message = err instanceof Error ? err.message : String(err);
            console.error('[TheaterBGM] Generation failed:', message);
            setError(message);
            setStatus('error');
        }
    }, [apiKey, enabled, location, timeSlot, event, groupId, musicBaseUrl, getAudio, fadeIn, volume]);

    // React to scene changes
    useEffect(() => {
        const newKey = `${location.id}_${timeSlot}_${regenerateCountRef.current}`;
        if (newKey === locationKeyRef.current) return;
        locationKeyRef.current = newKey;

        if (!enabled || !apiKey) {
            stopPlayback();
            setStatus('idle');
            return;
        }

        void startBgm();

        return () => {
            abortRef.current?.abort();
        };
    }, [location.id, timeSlot, enabled, apiKey, startBgm, stopPlayback]);

    // Update volume in real time
    useEffect(() => {
        const audio = audioRef.current;
        if (audio && !audio.paused && !fadeTimerRef.current) {
            audio.volume = volume;
        }
    }, [volume]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
            const audio = audioRef.current;
            if (audio) {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
            }
            abortRef.current?.abort();
            cleanupBgmBlobUrls();
        };
    }, []);

    // Toggle
    const toggle = useCallback(() => {
        const next = !enabled;
        setEnabled(next);
        writeBgmEnabled(next);

        if (!next) {
            stopPlayback();
            setStatus('idle');
        } else {
            locationKeyRef.current = ''; // force re-trigger
            // Will be triggered by effect
        }
    }, [enabled, stopPlayback]);

    // Volume setter
    const setVolume = useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        setVolumeState(clamped);
        writeBgmVolume(clamped);
    }, []);

    // Regenerate
    const regenerate = useCallback(() => {
        regenerateCountRef.current += 1;
        locationKeyRef.current = ''; // force re-trigger
        void startBgm(true);
    }, [startBgm]);

    return {
        status,
        enabled,
        volume,
        error,
        toggle,
        setVolume,
        regenerate,
    };
}
