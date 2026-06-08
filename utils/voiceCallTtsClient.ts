import type { TtsConfig } from '../types/tts';
import { ElevenLabsTtsHttpStream } from './elevenLabsTtsHttpStream';
import { ElevenLabsTtsWs } from './elevenLabsTtsWs';
import { MinimaxTtsWs,type MinimaxTtsWsCallbacks,type TtsAudioChunk,type WsConnectionState } from './minimaxTtsWs';

export interface VoiceCallTtsCallbacks {
    onStateChange?: (state: WsConnectionState) => void;
    onAudioChunk?: (chunk: TtsAudioChunk) => void;
    onTaskFinished?: () => void;
    onError?: (error: string, statusCode?: number) => void;
}

export interface VoiceCallTtsClient {
    connect(config: TtsConfig): Promise<void>;
    start(config: TtsConfig): Promise<void>;
    sendText(text: string): void;
    finish(): Promise<void>;
    close(): void;
}

export function isElevenLabsV3Model(config: TtsConfig): boolean {
    return config.voiceCallProvider === 'elevenlabs'
        && config.elevenLabs.modelId.trim() === 'eleven_v3';
}

export function createVoiceCallTtsClient(config: TtsConfig, callbacks: VoiceCallTtsCallbacks = {}): VoiceCallTtsClient {
    if (config.voiceCallProvider === 'elevenlabs') {
        if (isElevenLabsV3Model(config)) {
            return new ElevenLabsTtsHttpStream(callbacks);
        }
        return new ElevenLabsTtsWs(callbacks);
    }

    return new MinimaxTtsWs(callbacks as MinimaxTtsWsCallbacks);
}

export function isVoiceCallTtsConfigured(config: TtsConfig): boolean {
    if (config.voiceCallProvider === 'elevenlabs') {
        return Boolean(config.elevenLabs.apiKey.trim() && config.elevenLabs.voiceId.trim());
    }

    return Boolean(config.apiKey.trim() && config.groupId.trim());
}

export function getVoiceCallTtsProviderName(config: TtsConfig): string {
    return config.voiceCallProvider === 'elevenlabs' ? 'ElevenLabs' : 'MiniMax';
}
