/**
 * useVoiceRecorder.ts — 麦克风录音 Hook
 *
 * 封装 MediaRecorder API，管理录音状态。
 * 独立于 STT 引擎，仅负责采集音频。
 * 
 * 增强：集成 Silero VAD（@ricky0123/vad-web）进行精准语音活动检测。
 * VAD 作为增强层，如果加载失败不影响核心录音功能。
 */

import { useState,useRef,useCallback,useEffect } from 'react';
import { loadVadWeb,withMutedVadModelLoadErrors } from '../utils/voiceVadLoader';

export type RecordingState = 'idle' | 'recording' | 'processing';

export interface UseVoiceRecorderReturn {
    /** Current recording state */
    state: RecordingState;
    /** Duration in seconds of current recording */
    duration: number;
    /** Whether Silero VAD detects active speech right now */
    isSpeaking: boolean;
    /** Start recording (requests mic permission) */
    startRecording: () => Promise<boolean>;
    /** Stop recording and return audio blob */
    stopRecording: () => Promise<{ blob: Blob; duration: number } | null>;
    /** Cancel current recording without returning data */
    cancelRecording: () => void;
    /** Set state to processing (external control for STT phase) */
    setProcessing: (v: boolean) => void;
    /** Whether the browser supports MediaRecorder */
    isSupported: boolean;
    /** Error message if any */
    error: string | null;
    /** AnalyserNode for real-time waveform visualization (only available while recording) */
    analyserNode: AnalyserNode | null;
}

/** Maximum recording duration in seconds */
const MAX_DURATION = 60;

/** MediaRecorder preferred MIME type (ordered by preference) */
const MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=opus',  // Edge on Windows may prefer mp4 container
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
];

function getSupportedMime(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    for (const mime of MIME_CANDIDATES) {
        if (MediaRecorder.isTypeSupported(mime)) {
            console.log(`🎤 [Recorder] Using MIME: ${mime}`);
            return mime;
        }
    }
    console.warn('🎤 [Recorder] No candidate MIME supported, will use browser default');
    return '';
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
    const [state, setState] = useState<RecordingState>('idle');
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const mountedRef = useRef(true);
    const resourceGenerationRef = useRef(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);
    const resolveRef = useRef<((result: { blob: Blob; duration: number } | null) => void) | null>(null);
    const cancelledRef = useRef(false);

    // Web Audio API refs for real-time waveform visualization
    const audioCtxRef = useRef<AudioContext | null>(null);
    const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

    // Silero VAD ref — enhancement layer, non-critical
    const vadRef = useRef<any>(null);

    const isSupported = typeof navigator !== 'undefined'
        && typeof navigator.mediaDevices !== 'undefined'
        && typeof MediaRecorder !== 'undefined';

    /** Clean up all resources */
    const cleanup = useCallback((options?: { resetUi?: boolean; resolvePending?: boolean }) => {
        const resetUi = options?.resetUi ?? true;
        const resolvePending = options?.resolvePending ?? false;
        resourceGenerationRef.current += 1;
        // Stop timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        // Detach recorder callbacks so late browser events cannot update unmounted UI.
        if (mediaRecorderRef.current) {
            const recorder = mediaRecorderRef.current;
            mediaRecorderRef.current.ondataavailable = null;
            mediaRecorderRef.current.onstop = null;
            mediaRecorderRef.current.onerror = null;
            if (recorder.state !== 'inactive') {
                try {
                    recorder.stop();
                } catch {
                    // Some browsers throw if stop is already in progress.
                }
            }
        }
        // Stop all tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        // Close AudioContext (waveform)
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => { });
            audioCtxRef.current = null;
        }
        // Destroy VAD instance
        if (vadRef.current) {
            try {
                vadRef.current.destroy();
            } catch (e) {
                console.warn('🎤 [VAD] destroy error (non-fatal):', e);
            }
            vadRef.current = null;
        }
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        if (resolvePending) {
            resolveRef.current?.(null);
            resolveRef.current = null;
        }
        if (resetUi && mountedRef.current) {
            setAnalyserNode(null);
            setIsSpeaking(false);
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            cleanup({ resetUi: false, resolvePending: true });
        };
    }, [cleanup]);

    const startRecording = useCallback(async (): Promise<boolean> => {
        if (!mountedRef.current) return false;
        if (state !== 'idle') return false;

        setError(null);
        cancelledRef.current = false;
        const generation = resourceGenerationRef.current + 1;
        resourceGenerationRef.current = generation;

        // 安全上下文检查 —— 非 HTTPS 非 localhost 时浏览器禁止使用麦克风
        if (!isSupported) {
            const isLocalhost = typeof location !== 'undefined' &&
                (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
            if (!mountedRef.current) return false;
            if (!isLocalhost && location.protocol !== 'https:') {
                setError('录音需要 HTTPS 连接，请使用 HTTPS 部署或 localhost 测试');
            } else {
                setError('当前浏览器不支持录音（请使用 Chrome / Edge / Safari 最新版）');
            }
            console.error('🎤 [Recorder] Not supported.',
                'isSecureContext:', typeof window !== 'undefined' && window.isSecureContext,
                'mediaDevices:', !!navigator?.mediaDevices,
                'MediaRecorder:', typeof MediaRecorder !== 'undefined',
                'userAgent:', navigator?.userAgent);
            return false;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000, // request 16kHz (browser may ignore)
                },
            });
            if (!mountedRef.current || resourceGenerationRef.current !== generation) {
                stream.getTracks().forEach(t => t.stop());
                return false;
            }
            streamRef.current = stream;

            // Set up Web Audio API for real-time waveform
            try {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 128; // 64 frequency bins — more detail for responsive bars
                analyser.smoothingTimeConstant = 0.3; // lower = more responsive to voice changes
                analyser.minDecibels = -90; // raise noise floor threshold slightly
                analyser.maxDecibels = -30; // lower peak threshold so normal talking hits max height
                const source = ctx.createMediaStreamSource(stream);
                source.connect(analyser);
                if (!mountedRef.current || resourceGenerationRef.current !== generation) {
                    ctx.close().catch(() => { });
                    stream.getTracks().forEach(t => t.stop());
                    return false;
                }
                audioCtxRef.current = ctx;
                setAnalyserNode(analyser);
            } catch (audioErr) {
                console.warn('🎤 [Recorder] AudioContext for waveform failed (non-fatal):', audioErr);
            }

            // ── Silero VAD — enhancement layer (non-blocking, non-critical) ──
            // Initializes asynchronously; if it fails, recording still works fine.
            (async () => {
                try {
                    const { MicVAD } = await loadVadWeb();
                    // Pass the already-acquired stream so VAD doesn't request mic again
                    const vad = await withMutedVadModelLoadErrors(() => MicVAD.new({
                        model: 'legacy',
                        // Pass existing stream via callbacks so VAD doesn't request mic again
                        getStream: async () => stream,
                        pauseStream: async () => { /* no-op: we manage the stream ourselves */ },
                        resumeStream: async () => stream,
                        onnxWASMBasePath: '/vad/onnx/stable-20260529/',
                        baseAssetPath: '/vad/',
                        ortConfig: (ort: any) => {
                            if (!ort?.env) return;
                            ort.env.logLevel = 'error';
                            if (ort.env.wasm) {
                                ort.env.wasm.numThreads = 1;
                                ort.env.wasm.proxy = false;
                            }
                        },
                        positiveSpeechThreshold: 0.8,
                        negativeSpeechThreshold: 0.3,
                        redemptionMs: 500,
                        onSpeechStart: () => {
                            console.log('🎤 [VAD] Speech start');
                            if (mountedRef.current) setIsSpeaking(true);
                        },
                        onSpeechEnd: () => {
                            console.log('🎤 [VAD] Speech end');
                            if (mountedRef.current) setIsSpeaking(false);
                        },
                    }));
                    if (!mountedRef.current || resourceGenerationRef.current !== generation || streamRef.current !== stream) {
                        try {
                            vad.destroy();
                        } catch (e) {
                            console.warn('🎤 [VAD] destroy stale instance error (non-fatal):', e);
                        }
                        return;
                    }
                    vadRef.current = vad;
                    vad.start();
                    console.log('🎤 [VAD] Silero VAD initialized successfully');
                } catch (vadErr) {
                    console.warn('🎤 [VAD] Silero VAD init failed (non-fatal, recording continues):', vadErr);
                }
            })();

            const mimeType = getSupportedMime();
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            if (!mountedRef.current || resourceGenerationRef.current !== generation || streamRef.current !== stream) {
                recorder.ondataavailable = null;
                recorder.onstop = null;
                recorder.onerror = null;
                stream.getTracks().forEach(t => t.stop());
                return false;
            }
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            // Log the actual MIME type the browser chose (may differ from requested)
            console.log(`🎤 [Recorder] MediaRecorder actual mimeType: ${recorder.mimeType || '(default)'}`);

            recorder.ondataavailable = (e) => {
                if (!mountedRef.current) return;
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                if (cancelledRef.current) {
                    cleanup({ resolvePending: true });
                    return;
                }

                // Use the actual MIME type from the recorder instance, not the
                // requested one — on Edge, the browser may silently pick a
                // different container (e.g. mp4 instead of webm).
                const actualMime = recorder.mimeType || mimeType || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: actualMime });
                console.log(`🎤 [Recorder] Blob created: ${blob.size} bytes, type=${actualMime}`);
                const finalDuration = Math.round((Date.now() - startTimeRef.current) / 1000);
                cleanup();
                if (mountedRef.current) setState('idle');
                resolveRef.current?.({ blob, duration: Math.max(1, finalDuration) });
                resolveRef.current = null;
            };

            recorder.onerror = (e: any) => {
                console.error('🎤 [Recorder] Error:', e);
                if (mountedRef.current) setError('录音出错');
                cleanup({ resolvePending: true });
                if (mountedRef.current) setState('idle');
            };

            // Start recording
            recorder.start(250); // collect data every 250ms
            startTimeRef.current = Date.now();
            if (mountedRef.current) {
                setState('recording');
                setDuration(0);
            }

            // Duration timer
            timerRef.current = setInterval(() => {
                const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
                if (mountedRef.current) setDuration(elapsed);

                // Auto-stop at max duration
                if (elapsed >= MAX_DURATION) {
                    if (mediaRecorderRef.current?.state === 'recording') {
                        mediaRecorderRef.current.stop();
                    }
                }
            }, 200);

            return true;
        } catch (err: any) {
            console.error('🎤 [Recorder] Failed to start:', err);
            if (mountedRef.current) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    setError('请允许麦克风权限');
                } else if (err.name === 'NotFoundError') {
                    setError('未检测到麦克风');
                } else {
                    setError('无法启动录音');
                }
            }
            cleanup();
            if (mountedRef.current) setState('idle');
            return false;
        }
    }, [state, cleanup]);

    const stopRecording = useCallback((): Promise<{ blob: Blob; duration: number } | null> => {
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current || state !== 'recording') {
                resolve(null);
                return;
            }

            resolveRef.current = resolve;

            if (mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        });
    }, [state]);

    const cancelRecording = useCallback(() => {
        cancelledRef.current = true;
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        cleanup({ resolvePending: true });
        if (mountedRef.current) {
            setState('idle');
            setDuration(0);
        }
    }, [cleanup]);

    const setProcessing = useCallback((v: boolean) => {
        if (mountedRef.current) setState(v ? 'processing' : 'idle');
    }, []);

    return {
        state,
        duration,
        isSpeaking,
        startRecording,
        stopRecording,
        cancelRecording,
        setProcessing,
        isSupported,
        error,
        analyserNode,
    };
}
