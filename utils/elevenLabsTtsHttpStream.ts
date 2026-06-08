/**
 * ElevenLabs HTTP streaming TTS client.
 *
 * eleven_v3 is not supported by the multi-context WebSocket endpoint, so voice
 * calls use the standard Stream speech endpoint through a same-origin proxy.
 */

import type { TtsConfig } from '../types/tts';
import type { TtsAudioChunk, WsConnectionState } from './minimaxTtsWs';
import { trackedApiRequest } from './apiRequestLedger';

export interface ElevenLabsTtsHttpStreamCallbacks {
    onStateChange?: (state: WsConnectionState) => void;
    onAudioChunk?: (chunk: TtsAudioChunk) => void;
    onTaskFinished?: () => void;
    onError?: (error: string, statusCode?: number) => void;
}

const ELEVENLABS_STREAM_PROXY_ENDPOINT = '/elevenlabs-tts-stream';

function ensureTrailingSpace(text: string): string {
    const trimmed = text.trim();
    return trimmed.endsWith(' ') ? trimmed : `${trimmed} `;
}

function getOutputFormat(sampleRate: number): 'pcm_16000' | 'pcm_24000' {
    return sampleRate <= 16000 ? 'pcm_16000' : 'pcm_24000';
}

function resolveModelId(modelId: string): string {
    const normalized = modelId.trim();
    return normalized || 'eleven_v3';
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

async function readResponseError(response: Response): Promise<string> {
    const fallback = `ElevenLabs stream HTTP ${response.status}`;
    let text = '';
    try {
        text = await response.text();
    } catch {
        return fallback;
    }

    if (!text.trim()) return fallback;

    try {
        const data = JSON.parse(text) as {
            error?: string;
            message?: string;
            detail?: string | { message?: string };
        };
        if (typeof data.detail === 'object' && data.detail?.message) {
            return data.detail.message;
        }
        return data.message || data.error || text;
    } catch {
        return text;
    }
}

function concatCarryByte(carryByte: number, bytes: Uint8Array): Uint8Array {
    const combined = new Uint8Array(bytes.byteLength + 1);
    combined[0] = carryByte;
    combined.set(bytes, 1);
    return combined;
}

export class ElevenLabsTtsHttpStream {
    private callbacks: ElevenLabsTtsHttpStreamCallbacks;
    private config: TtsConfig | null = null;
    private pendingTexts: string[] = [];
    private abortController: AbortController | null = null;
    private connected = false;
    private started = false;
    private processing = false;
    private finishing = false;
    private closedByClient = false;
    private taskFinishedEmitted = false;
    private finishResolve: (() => void) | null = null;

    constructor(callbacks: ElevenLabsTtsHttpStreamCallbacks = {}) {
        this.callbacks = callbacks;
    }

    private setState(state: WsConnectionState): void {
        this.callbacks.onStateChange?.(state);
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
        this.finishing = false;
        this.connected = true;
        this.setState('connecting');
        this.setState('connected');
    }

    async start(_config: TtsConfig): Promise<void> {
        if (!this.connected || !this.config) {
            throw new Error('ElevenLabs HTTP stream is not connected');
        }
        this.started = true;
        this.setState('task_started');
        void this.pumpQueue();
    }

    sendText(text: string): void {
        const trimmed = text.trim();
        if (!trimmed) return;
        if (!this.connected || !this.started || !this.config) {
            throw new Error('ElevenLabs HTTP stream is not ready');
        }
        this.pendingTexts.push(trimmed);
        void this.pumpQueue();
    }

    finish(): Promise<void> {
        this.finishing = true;
        void this.pumpQueue();

        if (!this.processing && this.pendingTexts.length === 0) {
            this.emitTaskFinished();
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.finishResolve = resolve;
        });
    }

    close(): void {
        this.closedByClient = true;
        this.connected = false;
        this.started = false;
        this.pendingTexts = [];
        this.abortController?.abort();
        this.abortController = null;
        this.setState('closed');
        this.finishResolve?.();
        this.finishResolve = null;
    }

    private async pumpQueue(): Promise<void> {
        if (this.processing || !this.connected || !this.started || !this.config || this.closedByClient) {
            return;
        }

        this.processing = true;
        try {
            while (this.pendingTexts.length > 0 && !this.closedByClient && this.config) {
                const text = this.pendingTexts.shift();
                if (!text) continue;
                await this.streamSentence(text, this.config);
            }
        } catch (error) {
            if (!this.closedByClient && !isAbortError(error)) {
                const message = error instanceof Error ? error.message : 'ElevenLabs HTTP stream error';
                this.setState('error');
                this.callbacks.onError?.(message);
            }
        } finally {
            this.processing = false;
            this.abortController = null;

            if (!this.closedByClient && this.pendingTexts.length > 0) {
                void this.pumpQueue();
                return;
            }

            if (this.finishing && this.pendingTexts.length === 0) {
                this.emitTaskFinished();
                this.finishResolve?.();
                this.finishResolve = null;
                this.setState('closed');
            }
        }
    }

    private async streamSentence(text: string, config: TtsConfig): Promise<void> {
        const controller = new AbortController();
        this.abortController = controller;

        const sampleRate = config.audioSetting.audio_sample_rate;
        const voiceSettings = {
            stability: config.elevenLabs.stability,
            similarity_boost: config.elevenLabs.similarityBoost,
            style: config.elevenLabs.style,
            speed: config.elevenLabs.speed,
            use_speaker_boost: config.elevenLabs.useSpeakerBoost,
        };

        const modelId = resolveModelId(config.elevenLabs.modelId);
        const response = await trackedApiRequest({
            feature: 'tts',
            reason: '语音通话 ElevenLabs TTS 流式合成',
            provider: 'elevenlabs',
            model: modelId,
            userInitiated: false,
            url: ELEVENLABS_STREAM_PROXY_ENDPOINT,
        }, () => fetch(ELEVENLABS_STREAM_PROXY_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-ElevenLabs-Key': config.elevenLabs.apiKey.trim(),
            },
            body: JSON.stringify({
                voiceId: config.elevenLabs.voiceId.trim(),
                text: ensureTrailingSpace(text),
                modelId,
                languageCode: config.elevenLabs.languageCode.trim(),
                outputFormat: getOutputFormat(sampleRate),
                voiceSettings,
            }),
            signal: controller.signal,
        }));

        if (!response.ok) {
            throw new Error(await readResponseError(response));
        }

        if (!response.body) {
            throw new Error('ElevenLabs stream response did not include a body');
        }

        const reader = response.body.getReader();
        let carryByte: number | null = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.byteLength === 0) continue;

            let audio: Uint8Array = carryByte === null ? value : concatCarryByte(carryByte, value);
            carryByte = null;

            if (audio.byteLength % 2 === 1) {
                carryByte = audio[audio.byteLength - 1];
                audio = audio.slice(0, audio.byteLength - 1);
            }

            if (audio.byteLength > 0) {
                this.callbacks.onAudioChunk?.({
                    audio,
                    isFinal: false,
                    extraInfo: {
                        audio_format: 'pcm',
                        audio_sample_rate: sampleRate,
                    },
                });
            }
        }

        this.callbacks.onAudioChunk?.({
            audio: new Uint8Array(0),
            isFinal: true,
            extraInfo: {
                audio_format: 'pcm',
                audio_sample_rate: sampleRate,
            },
        });
    }

    private emitTaskFinished(): void {
        if (this.taskFinishedEmitted) return;
        this.taskFinishedEmitted = true;
        this.callbacks.onTaskFinished?.();
    }
}
