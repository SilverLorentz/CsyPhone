/**
 * useVoiceTts — 语音消息管理 Hook
 *
 * 独立模块：封装 TTS 合成、IndexedDB 存储、音频播放三大能力。
 * 设计原则：
 *   - 全局单例播放（同时只播放一条语音）
 *   - 音频以 Blob 形式存入 IDB，持久可回听
 *   - 与主聊天逻辑解耦，仅通过回调暴露状态
 */

import { useState,useRef,useCallback,useEffect } from 'react';
import { MinimaxTts,TtsSynthesisStatus } from '../utils/minimaxTts';
import { TtsConfig } from '../types/tts';
import { DB } from '../utils/db';
import { toCharacterVoiceIdError } from '../utils/characterTts';
import type { ApiRequestTraceMeta } from '../utils/apiRequestLedger';

export interface VoiceTtsState {
    /** 当前正在播放的消息 ID */
    playingMsgId: number | null;
    /** 正在合成中的消息 ID 集合 */
    loadingMsgIds: Set<number>;
}

/**
 * 估算音频时长（秒）— 文件大小 + 比特率做近似（降级方案）。
 */
function estimateDuration(blob: Blob, bitrate = 128000): number {
    const bytes = blob.size;
    const seconds = (bytes * 8) / bitrate;
    return Math.max(1, Math.round(seconds));
}

/**
 * 精确获取音频时长（秒）— 使用 Web Audio API 解码。
 * 失败时回退到 estimateDuration。
 */
async function getAudioDuration(blob: Blob, bitrate?: number): Promise<number> {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const duration = Math.max(1, Math.round(audioBuffer.duration));
        ctx.close().catch(() => { });
        return duration;
    } catch {
        return estimateDuration(blob, bitrate);
    }
}

export function useVoiceTts() {
    const [playingMsgId, setPlayingMsgId] = useState<number | null>(null);
    const playingMsgIdRef = useRef<number | null>(null);
    const [loadingMsgIds, setLoadingMsgIds] = useState<Set<number>>(new Set());
    const mountedRef = useRef(true);

    // AudioElement ref — only one at a time
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentUrlRef = useRef<string | null>(null);
    const playVersionRef = useRef(0);

    // Per-msgId AbortController map — prevents concurrent auto-TTS calls from cancelling each other
    const abortMapRef = useRef<Map<number, AbortController>>(new Map());

    // Serial synthesis queue — ensures only one MiniMax request is in-flight at a time.
    // This prevents API concurrency errors when multiple voice messages are synthesized
    // back-to-back (e.g. AI replies with multiple voice bubbles in one response).
    // Loading state is still set immediately (outside the queue) so the UI responds at once.
    const synthQueueRef = useRef<Promise<void>>(Promise.resolve());

    // ── Stop any currently playing audio ──────────────────────────────
    const cleanupPlayback = useCallback((updateState: boolean) => {
        playVersionRef.current += 1;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.onended = null;
            audioRef.current.onerror = null;
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }
        if (currentUrlRef.current) {
            URL.revokeObjectURL(currentUrlRef.current);
            currentUrlRef.current = null;
        }
        playingMsgIdRef.current = null;
        if (updateState && mountedRef.current) setPlayingMsgId(null);
    }, []);

    const stopVoice = useCallback(() => {
        cleanupPlayback(true);
    }, [cleanupPlayback]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            cleanupPlayback(false);
            abortMapRef.current.forEach(controller => controller.abort());
            abortMapRef.current.clear();
        };
    }, [cleanupPlayback]);

    // ── Play audio for a given message ID (from IDB) ─────────────────
    const playVoice = useCallback(async (msgId: number) => {
        // Use ref (not state) to avoid stale closure issues on rapid clicks
        if (audioRef.current && playingMsgIdRef.current === msgId) {
            stopVoice();
            return;
        }
        // Stop any previous playback
        stopVoice();
        const version = playVersionRef.current;

        const blob = await DB.getVoiceAudio(msgId);
        if (!mountedRef.current || version !== playVersionRef.current) return;
        if (!blob) {
            console.warn('[VoiceTts] No audio blob found for msgId:', msgId);
            return;
        }

        const url = URL.createObjectURL(blob);
        currentUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;
        playingMsgIdRef.current = msgId;
        if (mountedRef.current) setPlayingMsgId(msgId);

        audio.onended = () => {
            stopVoice();
        };
        audio.onerror = () => {
            console.error('[VoiceTts] Audio playback error for msgId:', msgId);
            stopVoice();
        };

        try {
            await audio.play();
        } catch (err) {
            console.error('[VoiceTts] Failed to play audio:', err);
            stopVoice();
        }
    }, [stopVoice]);

    // ── Synthesize and save audio for a message ──────────────────────
    const synthesizeForMessage = useCallback((
        msgId: number,
        text: string,
        ttsConfig: TtsConfig,
        onStatus?: (status: TtsSynthesisStatus, message: string) => void,
        trace?: ApiRequestTraceMeta,
    ): Promise<{ duration: number } | null> => {
        // Mark as loading immediately (before queuing) so the UI spinner appears at once
        if (mountedRef.current) {
            setLoadingMsgIds(prev => {
                const next = new Set(prev);
                next.add(msgId);
                return next;
            });
        }

        // Cancel any previous in-progress synthesis for THIS msgId (e.g. retry scenario)
        abortMapRef.current.get(msgId)?.abort();
        const controller = new AbortController();
        abortMapRef.current.set(msgId, controller);

        // Chain onto the serial queue — ensures only ONE MiniMax request is active at a time.
        // Each job waits for the previous one to settle (resolve or reject) before starting.
        const job = synthQueueRef.current.then(async () => {
            try {
                // If aborted while waiting in queue (e.g. user navigated away), skip gracefully
                if (controller.signal.aborted) return null;
                const result = await MinimaxTts.synthesizeSync(text, ttsConfig, onStatus, controller.signal, {
                    ...trace,
                    feature: 'tts',
                    messageId: trace?.messageId ?? msgId,
                });
                if (!result || !result.blob) return null;

                await DB.saveVoiceAudio(msgId, result.blob);
                const duration = await getAudioDuration(result.blob, ttsConfig.audioSetting?.bitrate);
                if (result.url) MinimaxTts.revokeUrl(result.url);

                // Update message metadata BEFORE finally removes loading state.
                // This prevents a race where VoiceBubble sees !loading && !hasAudio
                // and briefly shows the retry button despite synthesis success.
                await DB.updateMessageMetadata(msgId, { duration, hasAudio: true });

                return { duration };
            } catch (err) {
                const friendlyError = toCharacterVoiceIdError(err, ttsConfig.voiceSetting.voice_id);
                console.error('[VoiceTts] Synthesis failed for msgId:', msgId, friendlyError);
                throw friendlyError;
            } finally {
                abortMapRef.current.delete(msgId);
                if (mountedRef.current) {
                    setLoadingMsgIds(prev => {
                        const next = new Set(prev);
                        next.delete(msgId);
                        return next;
                    });
                }
            }
        });

        // Update the queue tail. Use .catch() so a failed job doesn't block all later ones.
        synthQueueRef.current = job.then(() => { }, () => { });

        return job as Promise<{ duration: number } | null>;
    }, []);

    return {
        playingMsgId,
        loadingMsgIds,
        playVoice,
        stopVoice,
        synthesizeForMessage,
    };
}
