// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { DEFAULT_TTS_CONFIG,type TtsConfig } from '../types';
import { ElevenLabsTtsWs } from '../utils/elevenLabsTtsWs';

type FakeMessageHandler = ((event: MessageEvent) => void) | null;
type FakeOpenHandler = (() => void) | null;
type FakeCloseHandler = (() => void) | null;

class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = FakeWebSocket.CONNECTING;
    onopen: FakeOpenHandler = null;
    onmessage: FakeMessageHandler = null;
    onerror: (() => void) | null = null;
    onclose: FakeCloseHandler = null;
    sent: Record<string, any>[] = [];

    constructor(public url: string) {
        FakeWebSocket.instances.push(this);
        setTimeout(() => {
            this.readyState = FakeWebSocket.OPEN;
            this.onopen?.();
        }, 0);
    }

    send(payload: string): void {
        this.sent.push(JSON.parse(payload));
    }

    close(): void {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.();
    }

    emit(data: Record<string, unknown>): void {
        this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
    }

    static instances: FakeWebSocket[] = [];
}

function buildConfig(): TtsConfig {
    return {
        ...DEFAULT_TTS_CONFIG,
        voiceCallProvider: 'elevenlabs',
        audioSetting: {
            ...DEFAULT_TTS_CONFIG.audioSetting,
            format: 'pcm',
            audio_sample_rate: 24000,
        },
        elevenLabs: {
            ...DEFAULT_TTS_CONFIG.elevenLabs,
            apiKey: 'eleven-key',
            voiceId: 'voice-1',
        },
    };
}

function tokenResponse(): Response {
    return new Response(JSON.stringify({ token: 'single-use-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('ElevenLabsTtsWs diagnostics', () => {
    beforeEach(() => {
        localStorage.clear();
        FakeWebSocket.instances = [];
        vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it('does not post voice-call diagnostics unless explicitly enabled', async () => {
        const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
        vi.stubGlobal('fetch', fetchMock);

        const client = new ElevenLabsTtsWs();
        await client.connect(buildConfig());
        client.sendText('你好。');

        const socket = FakeWebSocket.instances[0];
        const contextId = socket.sent.find(payload => payload.context_id && payload.text)?.context_id;
        socket.emit({ context_id: contextId, audio: btoa('pcm-audio') });
        socket.emit({ context_id: contextId, is_final: true });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('/elevenlabs-token', expect.any(Object));
    });

    it('posts coarse diagnostics only when debug is enabled', async () => {
        localStorage.setItem('voicecall_debug', 'true');
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            if (String(input) === '/elevenlabs-token') return Promise.resolve(tokenResponse());
            return Promise.resolve(new Response(null, { status: 204 }));
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new ElevenLabsTtsWs();
        await client.connect(buildConfig());
        client.sendText('你好。');

        const socket = FakeWebSocket.instances[0];
        const contextId = socket.sent.find(payload => payload.context_id && payload.text)?.context_id;
        socket.emit({ context_id: contextId, audio: btoa('pcm-audio') });
        socket.emit({ context_id: contextId, audio: btoa('more-audio') });
        socket.emit({ context_id: contextId, is_final: true });

        const debugEvents = fetchMock.mock.calls
            .filter(([input]) => String(input) === '/voicecall-debug')
            .map(([, init]) => JSON.parse(String((init as RequestInit).body)).event);

        expect(debugEvents).toContain('token_request');
        expect(debugEvents).toContain('token_response');
        expect(debugEvents).toContain('connect_start');
        expect(debugEvents).toContain('ws_open');
        expect(debugEvents).toContain('first_audio_chunk');
        expect(debugEvents).toContain('context_final');
        expect(debugEvents).not.toContain('audio_chunk');
        expect(debugEvents.filter(event => event === 'first_audio_chunk')).toHaveLength(1);
    });

    it('locally finalizes a quiet context so later sentences can be sent', async () => {
        vi.useFakeTimers();
        const audioChunks: Array<{ audio: Uint8Array; isFinal: boolean }> = [];
        const fetchMock = vi.fn().mockResolvedValue(tokenResponse());
        vi.stubGlobal('fetch', fetchMock);

        const client = new ElevenLabsTtsWs({
            onAudioChunk: chunk => audioChunks.push(chunk),
        });
        const connectPromise = client.connect(buildConfig());
        await vi.advanceTimersByTimeAsync(0);
        await connectPromise;

        client.sendText('第一句。');
        client.sendText('第二句。');

        const socket = FakeWebSocket.instances[0];
        const textPayloadsBefore = socket.sent.filter(payload => payload.context_id && payload.text);
        const firstContextId = textPayloadsBefore[0].context_id;
        expect(textPayloadsBefore).toHaveLength(1);

        socket.emit({ context_id: firstContextId, audio: btoa('first-audio') });
        await vi.advanceTimersByTimeAsync(5999);
        expect(socket.sent.filter(payload => payload.context_id && payload.text)).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(1);

        const textPayloadsAfter = socket.sent.filter(payload => payload.context_id && payload.text);
        expect(textPayloadsAfter).toHaveLength(2);
        expect(socket.sent).toContainEqual({ context_id: firstContextId, close_context: true });
        expect(audioChunks.some(chunk => chunk.isFinal)).toBe(true);

        vi.useRealTimers();
    });
});
