import { afterEach,describe,expect,it,vi } from 'vitest';
import type { APIConfig,CharacterProfile,Message,UserProfile } from '../types';
import { generateSoulReflection } from './soulReflection';

const completeReflection = `===REFLECTION===
我刚才那句话确实太硬了。

我以为自己是在靠近，其实听起来像是在推着你走。
===ANCHORS===
- 想靠近时直接说想你
- 不用命令式语气包装关心`;

const incompleteReflection = `===REFLECTION===
我刚才那句话确实太硬了。`;

const baseChar = {
    id: 'char-1',
    name: 'Sully',
    description: '温柔但有点别扭。',
    systemPrompt: '你是 Sully。',
} as CharacterProfile;

const baseUser = {
    id: 'user-1',
    name: '糯米',
} as UserProfile;

const selectedMessages = [
    {
        id: 1,
        charId: 'char-1',
        role: 'assistant',
        type: 'text',
        content: '过来，听话。',
        timestamp: 1,
    },
] as Message[];

const recentContext = [
    {
        id: 2,
        charId: 'char-1',
        role: 'user',
        type: 'text',
        content: '你刚才那样说我不舒服。',
        timestamp: 2,
    },
] as Message[];

const geminiConfig: APIConfig = {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: 'sk-test',
    model: 'gemini-3.1-pro-preview',
};

const deepSeekConfig: APIConfig = {
    baseUrl: 'https://api.deepseek.example/v1',
    apiKey: 'sk-test',
    model: 'deepseek-chat',
    useDeepSeekMode: true,
};

function openAiResponse(content: string, finishReason = 'stop'): Response {
    return new Response(JSON.stringify({
        choices: [
            {
                finish_reason: finishReason,
                message: { content },
            },
        ],
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function openAiReasoningResponse(reasoningContent: string, content: string | null = null): Response {
    return new Response(JSON.stringify({
        choices: [
            {
                finish_reason: 'stop',
                message: {
                    content,
                    reasoning_content: reasoningContent,
                },
            },
        ],
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function errorResponse(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function runReflection(apiConfig: APIConfig = geminiConfig) {
    return generateSoulReflection({
        selectedMessages,
        userFeedback: '这句不像他，太命令式了。',
        char: baseChar,
        userProfile: baseUser,
        recentContext,
    }, apiConfig);
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index = 0): Record<string, any> {
    return JSON.parse(fetchMock.mock.calls[index][1].body as string);
}

describe('generateSoulReflection', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses a higher token ceiling and low Gemini reasoning effort for Gemini models', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(openAiResponse(completeReflection));
        vi.stubGlobal('fetch', fetchMock);

        const result = await runReflection();

        expect(result.reflection).toContain('我刚才那句话确实太硬了');
        expect(result.anchors).toContain('不用命令式语气');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const body = requestBody(fetchMock);
        expect(body.max_tokens).toBe(8000);
        expect(body.reasoning_effort).toBe('low');
        expect(body.stream).toBe(false);
    });

    it('does not add Gemini reasoning effort for DeepSeek mode', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(openAiResponse(completeReflection));
        vi.stubGlobal('fetch', fetchMock);

        await runReflection(deepSeekConfig);

        const body = requestBody(fetchMock);
        expect(body.max_tokens).toBe(8000);
        expect(body.reasoning_effort).toBeUndefined();
    });

    it('retries with 16000 tokens when the first response hits the length limit', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(openAiResponse(incompleteReflection, 'length'))
            .mockResolvedValueOnce(openAiResponse(completeReflection));
        vi.stubGlobal('fetch', fetchMock);

        const result = await runReflection();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(requestBody(fetchMock, 0).max_tokens).toBe(8000);
        expect(requestBody(fetchMock, 1).max_tokens).toBe(16000);
        expect(result.anchors).toContain('不用命令式语气');
    });

    it('throws instead of returning a partial reflection when both attempts are truncated', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(openAiResponse(incompleteReflection, 'length'))
            .mockResolvedValueOnce(openAiResponse(incompleteReflection, 'max_tokens'));
        vi.stubGlobal('fetch', fetchMock);

        await expect(runReflection()).rejects.toThrow(/max_tokens 上限/);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries incomplete formatted output and errors if anchors are still missing', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(openAiResponse(incompleteReflection))
            .mockResolvedValueOnce(openAiResponse(incompleteReflection));
        vi.stubGlobal('fetch', fetchMock);

        await expect(runReflection()).rejects.toThrow(/缺少 ANCHORS 区块/);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(requestBody(fetchMock, 1).max_tokens).toBe(16000);
    });

    it('retries without reasoning_effort when a proxy rejects that parameter', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, 'Unknown parameter: reasoning_effort'))
            .mockResolvedValueOnce(openAiResponse(completeReflection));
        vi.stubGlobal('fetch', fetchMock);

        const result = await runReflection();

        expect(result.reflection).toContain('我刚才那句话确实太硬了');
        expect(requestBody(fetchMock, 0).reasoning_effort).toBe('low');
        expect(requestBody(fetchMock, 1).reasoning_effort).toBeUndefined();
    });

    it('only falls back to reasoning_content when it contains reflection markers', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(openAiReasoningResponse(completeReflection));
        vi.stubGlobal('fetch', fetchMock);

        const result = await runReflection();

        expect(result.anchors).toContain('不用命令式语气');
    });
});
