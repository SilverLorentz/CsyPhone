import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TTS_CONFIG, type TtsConfig } from '../types/tts';
import { MinimaxTts } from '../utils/minimaxTts';

const preprocessConfig = {
    prompt: '只添加少量 TTS 语气标签，不要改写正文。',
    apiBase: 'https://preprocess.example/v1',
    apiKey: 'pre-key',
    model: 'pre-model',
};

function chatResponse(content: string, finishReason = 'stop'): Response {
    return new Response(JSON.stringify({
        choices: [{
            message: { content },
            finish_reason: finishReason,
        }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function ttsSuccessResponse(): Response {
    return new Response(JSON.stringify({
        data: { audio: '494433' },
        extra_info: { usage_characters: 42 },
        base_resp: { status_code: 0, status_msg: 'ok' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function requestBody(call: unknown[]): Record<string, any> {
    const init = call[1] as RequestInit;
    return JSON.parse(String(init.body));
}

function longSentence(label: string): string {
    return `${label}${'这是一段很长但必须完整保留的正文'.repeat(50)}。`;
}

function buildTtsConfig(): TtsConfig {
    return {
        ...DEFAULT_TTS_CONFIG,
        baseUrl: 'https://tts.example',
        apiKey: 'mini-key',
        groupId: 'group-id',
        preprocessConfig: {
            enabled: true,
            ...preprocessConfig,
        },
    };
}

describe('MiniMax TTS preprocessing', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('preprocesses long text in ordered chunks without dropping content', async () => {
        const first = longSentence('第一段：');
        const second = longSentence('第二段：');
        const third = longSentence('第三段：');
        const text = `${first}${second}${third}`;
        const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body));
            const chunk = body.messages[1].content as string;
            return chatResponse(`(breath)${chunk}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await MinimaxTts.preprocessText(text, preprocessConfig);

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(result).toContain(first);
        expect(result).toContain(second);
        expect(result).toContain(third);
        expect(result.indexOf(first)).toBeLessThan(result.indexOf(second));
        expect(result.indexOf(second)).toBeLessThan(result.indexOf(third));

        const sentChunks = fetchMock.mock.calls.map(call => requestBody(call).messages[1].content as string);
        expect(sentChunks[0]).toContain('第一段：');
        expect(sentChunks[1]).toContain('第二段：');
        expect(sentChunks[2]).toContain('第三段：');
    });

    it('hard-splits a single overlong sentence before preprocessing', async () => {
        const text = '无标点长句'.repeat(260);
        const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body));
            return chatResponse(body.messages[1].content as string);
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await MinimaxTts.preprocessText(text, preprocessConfig);

        expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
        expect(result).toBe(text);
    });

    it('falls back to the original chunk when the preprocess model is cut off', async () => {
        const text = '这段原文不能丢。'.repeat(30);
        const fetchMock = vi.fn().mockResolvedValue(chatResponse('这段原文不能丢。', 'length'));
        vi.stubGlobal('fetch', fetchMock);

        const result = await MinimaxTts.preprocessText(text, preprocessConfig);

        expect(result).toBe(text);
    });

    it('sends original text to MiniMax when preprocessing returns a truncated choice', async () => {
        const originalText = '这是一段需要完整合成的长语音正文。'.repeat(20);
        const truncatedText = originalText.slice(0, 20);
        const fetchMock = vi.fn(async (url: string | URL | Request) => {
            const urlText = String(url);
            if (urlText.includes('/chat/completions')) return chatResponse(truncatedText, 'length');
            if (urlText.includes('/v1/t2a_v2')) return ttsSuccessResponse();
            throw new Error(`Unexpected URL: ${urlText}`);
        });
        vi.stubGlobal('fetch', fetchMock);
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:tts'),
        });

        const result = await MinimaxTts.synthesizeSync(originalText, buildTtsConfig());

        expect(result.url).toBe('blob:tts');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const ttsBody = requestBody(fetchMock.mock.calls[1]);
        expect(ttsBody.text).toBe(originalText);
        expect(ttsBody.text).not.toBe(truncatedText);
    });
});
