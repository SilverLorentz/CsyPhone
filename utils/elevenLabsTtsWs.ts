/**
 * ElevenLabs Multi-Context TTS WebSocket client for voice calls.
 *
 * It adapts ElevenLabs base64 PCM chunks to the same callbacks used by the
 * existing MiniMax voice-call pipeline.
 */

import type { TtsConfig } from '../types/tts';
import type { TtsAudioChunk,WsConnectionState } from './minimaxTtsWs';
import { trackedApiRequest } from './apiRequestLedger';

export interface ElevenLabsTtsWsCallbacks {
    onStateChange?: (state: WsConnectionState) => void;
    onAudioChunk?: (chunk: TtsAudioChunk) => void;
    onTaskFinished?: () => void;
    onError?: (error: string, statusCode?: number) => void;
}

type ElevenLabsIncomingMessage = {
    audio?: string;
    is_final?: boolean;
    isFinal?: boolean;
    contextId?: string;
    context_id?: string;
    error?: string;
    message?: string;
};

const ELEVENLABS_WS_BASE = 'wss://api.elevenlabs.io/v1/text-to-speech';
const ELEVENLABS_TOKEN_ENDPOINT = '/elevenlabs-token';
const VOICE_CALL_DEBUG_ENDPOINT = '/voicecall-debug';
const VOICE_CALL_DEBUG_STORAGE_KEY = 'voicecall_debug';
const ELEVENLABS_CONTEXT_AUDIO_START_TIMEOUT_MS = 15000;
const ELEVENLABS_CONTEXT_FINAL_GRACE_MS = 6000;
// Keep sentence audio in the same order the current player expects.
const MAX_ACTIVE_CONTEXTS = 1;

function maskId(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}***`;
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function elapsedMs(startedAt: number): number {
    return Math.max(0, Math.round(nowMs() - startedAt));
}

function isVoiceCallDebugEnabled(): boolean {
    try {
        if (typeof window === 'undefined') return false;
        const params = new URLSearchParams(window.location.search);
        return params.get('voicecall_debug') === '1'
            || window.localStorage?.getItem(VOICE_CALL_DEBUG_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

function postVoiceCallDebug(event: string, details: Record<string, unknown> = {}): void {
    try {
        if (!isVoiceCallDebugEnabled()) return;
        if (typeof fetch !== 'function') return;
        fetch(VOICE_CALL_DEBUG_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: 'elevenlabs',
                event,
                ts: Date.now(),
                ...details,
            }),
            keepalive: true,
        }).catch(() => {});
    } catch {
        // Diagnostics must never affect the call path.
    }
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function ensureTrailingSpace(text: string): string {
    const trimmed = text.trim();
    return trimmed.endsWith(' ') ? trimmed : `${trimmed} `;
}

function getOutputFormat(sampleRate: number): 'pcm_16000' | 'pcm_24000' {
    return sampleRate <= 16000 ? 'pcm_16000' : 'pcm_24000';
}

function resolveModelId(modelId: string): string {
    const normalized = modelId.trim();
    if (!normalized) {
        return 'eleven_flash_v2_5';
    }
    return normalized;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(`ElevenLabs token response is not JSON (HTTP ${response.status})`);
    }
}

async function createSingleUseToken(apiKey: string): Promise<string> {
    const startedAt = nowMs();
    postVoiceCallDebug('token_request');
    const response = await trackedApiRequest({
        feature: 'tts',
        reason: '语音通话 ElevenLabs TTS token',
        provider: 'elevenlabs',
        userInitiated: false,
        url: ELEVENLABS_TOKEN_ENDPOINT,
    }, () => fetch(ELEVENLABS_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'X-ElevenLabs-Key': apiKey,
        },
    }));
    const data = await readJsonResponse<{ token?: string; error?: string; message?: string }>(response);
    postVoiceCallDebug('token_response', {
        status: response.status,
        ok: response.ok,
        hasToken: Boolean(data.token),
        elapsedMs: elapsedMs(startedAt),
    });

    if (!response.ok) {
        throw new Error(data.message || data.error || `ElevenLabs token HTTP ${response.status}`);
    }

    if (!data.token) {
        throw new Error('ElevenLabs token response did not include token');
    }

    return data.token;
}

function buildWsUrl(config: TtsConfig, token: string): string {
    const voiceId = config.elevenLabs.voiceId.trim();
    const modelId = resolveModelId(config.elevenLabs.modelId);
    const languageCode = config.elevenLabs.languageCode.trim();
    const sampleRate = config.audioSetting.audio_sample_rate;
    const url = new URL(`${ELEVENLABS_WS_BASE}/${encodeURIComponent(voiceId)}/multi-stream-input`);

    url.searchParams.set('single_use_token', token);
    url.searchParams.set('model_id', modelId);
    url.searchParams.set('output_format', getOutputFormat(sampleRate));
    if (languageCode) {
        url.searchParams.set('language_code', languageCode);
    }
    url.searchParams.set('auto_mode', 'true');
    url.searchParams.set('inactivity_timeout', '180');

    return url.toString();
}

export class ElevenLabsTtsWs {
    private ws: WebSocket | null = null;
    private callbacks: ElevenLabsTtsWsCallbacks;
    private config: TtsConfig | null = null;
    private pendingTexts: string[] = [];
    private activeContexts = new Set<string>();
    private activeContextAudioSeen = new Set<string>();
    private contextCounter = 0;
    private finishing = false;
    private closedByClient = false;
    private taskFinishedEmitted = false;
    private connectResolve: (() => void) | null = null;
    private connectReject: ((err: Error) => void) | null = null;
    private finishResolve: (() => void) | null = null;
    private connectTimeout: ReturnType<typeof setTimeout> | null = null;
    private connectStartedAt = 0;
    private contextStartedAt = new Map<string, number>();
    private contextAudioStartTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private contextFinalTimers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(callbacks: ElevenLabsTtsWsCallbacks = {}) {
        this.callbacks = callbacks;
    }

    private setState(state: WsConnectionState): void {
        this.callbacks.onStateChange?.(state);
    }

    private sendJson(payload: Record<string, unknown>): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('ElevenLabs WebSocket is not open');
        }
        this.ws.send(JSON.stringify(payload));
    }

    private clearTimer(
        timers: Map<string, ReturnType<typeof setTimeout>>,
        contextId: string,
    ): void {
        const timer = timers.get(contextId);
        if (!timer) return;
        clearTimeout(timer);
        timers.delete(contextId);
    }

    private clearContextTimers(contextId: string): void {
        this.clearTimer(this.contextAudioStartTimers, contextId);
        this.clearTimer(this.contextFinalTimers, contextId);
    }

    private clearAllContextTimers(): void {
        for (const timer of this.contextAudioStartTimers.values()) clearTimeout(timer);
        for (const timer of this.contextFinalTimers.values()) clearTimeout(timer);
        this.contextAudioStartTimers.clear();
        this.contextFinalTimers.clear();
    }

    private armContextAudioStartTimeout(contextId: string): void {
        this.clearTimer(this.contextAudioStartTimers, contextId);
        this.contextAudioStartTimers.set(contextId, setTimeout(() => {
            if (!this.activeContexts.has(contextId)) return;
            if (this.activeContextAudioSeen.has(contextId)) return;
            const startedAt = this.contextStartedAt.get(contextId);
            postVoiceCallDebug('context_audio_start_timeout', {
                contextId,
                elapsedMs: startedAt ? elapsedMs(startedAt) : undefined,
            });
            this.callbacks.onError?.('ElevenLabs did not start audio for this sentence');
        }, ELEVENLABS_CONTEXT_AUDIO_START_TIMEOUT_MS));
    }

    private armContextFinalGrace(contextId: string): void {
        this.clearTimer(this.contextFinalTimers, contextId);
        this.contextFinalTimers.set(contextId, setTimeout(() => {
            if (!this.activeContexts.has(contextId)) return;
            if (!this.activeContextAudioSeen.has(contextId)) return;
            const startedAt = this.contextStartedAt.get(contextId);
            postVoiceCallDebug('context_final_grace_timeout', {
                contextId,
                elapsedMs: startedAt ? elapsedMs(startedAt) : undefined,
            });
            this.finishContext(contextId, 'local_quiet_timeout');
        }, ELEVENLABS_CONTEXT_FINAL_GRACE_MS));
    }

    async connect(config: TtsConfig): Promise<void> {
        if (!config.elevenLabs.apiKey.trim()) {
            throw new Error('请先配置 ElevenLabs API Key');
        }
        if (!config.elevenLabs.voiceId.trim()) {
            throw new Error('请先配置 ElevenLabs Voice ID');
        }

        this.config = config;
        this.closedByClient = false;
        this.taskFinishedEmitted = false;
        this.connectStartedAt = nowMs();
        this.setState('connecting');
        postVoiceCallDebug('connect_start', {
            voiceId: maskId(config.elevenLabs.voiceId),
            modelId: resolveModelId(config.elevenLabs.modelId),
            languageCode: config.elevenLabs.languageCode || 'auto',
            outputFormat: getOutputFormat(config.audioSetting.audio_sample_rate),
        });

        const token = await createSingleUseToken(config.elevenLabs.apiKey.trim());
        const wsUrl = buildWsUrl(config, token);

        return new Promise((resolve, reject) => {
            this.connectResolve = resolve;
            this.connectReject = reject;
            this.ws = new WebSocket(wsUrl);

            this.connectTimeout = setTimeout(() => {
                this.connectReject?.(new Error('ElevenLabs WebSocket connect timeout'));
                this.close();
            }, 25000);

            this.ws.onopen = () => {
                if (this.connectTimeout) {
                    clearTimeout(this.connectTimeout);
                    this.connectTimeout = null;
                }
                postVoiceCallDebug('ws_open', { elapsedMs: elapsedMs(this.connectStartedAt) });
                this.setState('connected');
                this.connectResolve?.();
                this.connectResolve = null;
                this.connectReject = null;
            };

            this.ws.onmessage = (event) => this.handleMessage(event);
            this.ws.onerror = () => {
                const error = new Error('ElevenLabs WebSocket error');
                postVoiceCallDebug('ws_error');
                this.setState('error');
                this.callbacks.onError?.(error.message);
                this.connectReject?.(error);
                this.connectResolve = null;
                this.connectReject = null;
            };
            this.ws.onclose = () => {
                postVoiceCallDebug('ws_close', { closedByClient: this.closedByClient, taskFinished: this.taskFinishedEmitted });
                if (this.connectTimeout) {
                    clearTimeout(this.connectTimeout);
                    this.connectTimeout = null;
                }
                this.clearAllContextTimers();
                this.setState('closed');
                if (!this.closedByClient && !this.taskFinishedEmitted) {
                    this.emitTaskFinished();
                }
                this.finishResolve?.();
                this.finishResolve = null;
            };
        });
    }

    async start(_config: TtsConfig): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('ElevenLabs WebSocket is not open');
        }
        this.setState('task_started');
    }

    sendText(text: string): void {
        const trimmed = text.trim();
        if (!trimmed) return;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('ElevenLabs WebSocket is not open');
        }
        this.pendingTexts.push(trimmed);
        postVoiceCallDebug('send_text', { length: trimmed.length });
        this.pumpContexts();
    }

    finish(): Promise<void> {
        this.finishing = true;
        this.pumpContexts();
        this.maybeFinishTask();

        if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.finishResolve = resolve;
        });
    }

    close(): void {
        this.closedByClient = true;
        this.pendingTexts = [];
        this.activeContexts.clear();
        this.activeContextAudioSeen.clear();
        this.contextStartedAt.clear();
        this.clearAllContextTimers();

        try {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.sendJson({ close_socket: true });
            }
        } catch {
            // Best effort only; close() is used during interruptions.
        }

        this.ws?.close();
        this.ws = null;
        this.setState('closed');
        this.finishResolve?.();
        this.finishResolve = null;
    }

    private pumpContexts(): void {
        if (!this.config || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        while (this.pendingTexts.length > 0 && this.activeContexts.size < MAX_ACTIVE_CONTEXTS) {
            const text = this.pendingTexts.shift();
            if (!text) continue;
            const contextId = `voice_call_${Date.now()}_${++this.contextCounter}`;
            this.activeContexts.add(contextId);
            this.contextStartedAt.set(contextId, nowMs());
            this.armContextAudioStartTimeout(contextId);
            postVoiceCallDebug('context_start', { contextId, length: text.length });

            const voiceSettings = {
                stability: this.config.elevenLabs.stability,
                similarity_boost: this.config.elevenLabs.similarityBoost,
                style: this.config.elevenLabs.style,
                speed: this.config.elevenLabs.speed,
                use_speaker_boost: this.config.elevenLabs.useSpeakerBoost,
            };

            this.sendJson({
                text: ensureTrailingSpace(text),
                context_id: contextId,
                voice_settings: voiceSettings,
            });
            this.sendJson({
                context_id: contextId,
                flush: true,
            });
        }
    }

    private handleMessage(event: MessageEvent): void {
        let data: ElevenLabsIncomingMessage;
        try {
            data = JSON.parse(String(event.data)) as ElevenLabsIncomingMessage;
        } catch {
            console.warn('[ElevenLabs TTS WS] Ignoring non-JSON message');
            return;
        }

        if (data.error || data.message) {
            const message = data.message || data.error || 'ElevenLabs TTS error';
            postVoiceCallDebug('tts_error', { message });
            this.callbacks.onError?.(message);
        }

        const contextId = data.contextId || data.context_id || '';
        const isFinal = data.is_final === true || data.isFinal === true;

        if (contextId && !this.activeContexts.has(contextId)) {
            postVoiceCallDebug('late_context_message_ignored', {
                contextId,
                hasAudio: Boolean(data.audio),
                isFinal,
            });
            return;
        }

        if (data.audio) {
            const audio = base64ToUint8Array(data.audio);
            if (contextId) {
                const isFirstAudioForContext = !this.activeContextAudioSeen.has(contextId);
                this.clearTimer(this.contextAudioStartTimers, contextId);
                this.activeContextAudioSeen.add(contextId);
                this.armContextFinalGrace(contextId);
                if (isFirstAudioForContext) {
                    const startedAt = this.contextStartedAt.get(contextId);
                    postVoiceCallDebug('first_audio_chunk', {
                        contextId,
                        encodedBytes: data.audio.length,
                        decodedBytes: audio.byteLength,
                        elapsedMs: startedAt ? elapsedMs(startedAt) : undefined,
                    });
                }
            }
            this.callbacks.onAudioChunk?.({
                audio,
                isFinal: false,
                extraInfo: {
                    audio_format: 'pcm',
                    audio_sample_rate: this.config?.audioSetting.audio_sample_rate,
                },
            });
        }

        if (isFinal && contextId) {
            this.finishContext(contextId, 'server_final');
        } else if (isFinal && !contextId) {
            this.callbacks.onAudioChunk?.({ audio: new Uint8Array(0), isFinal: true });
        }
    }

    private finishContext(contextId: string, reason: string): void {
        if (!this.activeContexts.has(contextId)) return;

        this.activeContexts.delete(contextId);
        this.clearContextTimers(contextId);
        const sawAudio = this.activeContextAudioSeen.has(contextId);
        this.activeContextAudioSeen.delete(contextId);
        const startedAt = this.contextStartedAt.get(contextId);
        this.contextStartedAt.delete(contextId);
        if (!sawAudio) {
            postVoiceCallDebug('context_final_no_audio', {
                contextId,
                reason,
                elapsedMs: startedAt ? elapsedMs(startedAt) : undefined,
            });
            this.callbacks.onError?.('ElevenLabs did not return audio for this sentence');
        } else {
            postVoiceCallDebug('context_final', {
                contextId,
                reason,
                elapsedMs: startedAt ? elapsedMs(startedAt) : undefined,
            });
        }
        this.callbacks.onAudioChunk?.({
            audio: new Uint8Array(0),
            isFinal: true,
            extraInfo: {
                audio_format: 'pcm',
                audio_sample_rate: this.config?.audioSetting.audio_sample_rate,
            },
        });

        try {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.sendJson({ context_id: contextId, close_context: true });
            }
        } catch {
            // The context has already completed; closing it is cleanup only.
        }

        this.pumpContexts();
        this.maybeFinishTask();
    }

    private maybeFinishTask(): void {
        if (!this.finishing || this.pendingTexts.length > 0 || this.activeContexts.size > 0) return;
        this.emitTaskFinished();

        try {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.sendJson({ close_socket: true });
                this.ws.close();
            }
        } catch {
            this.ws?.close();
        }

        this.finishResolve?.();
        this.finishResolve = null;
    }

    private emitTaskFinished(): void {
        if (this.taskFinishedEmitted) return;
        this.taskFinishedEmitted = true;
        this.callbacks.onTaskFinished?.();
    }
}
