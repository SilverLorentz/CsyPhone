import { afterEach,describe,expect,it,vi } from 'vitest';
import { shouldEmitVoiceCallSentence,VoiceCallLlm } from '../apps/voicecall/voiceCallLlm';
import {
    sanitizeVoiceCallAssistantText,
    sanitizeVoiceCallAssistantTextForTts,
    splitVoiceCallForeignSentence,
} from '../apps/voicecall/voiceCallTextSanitizer';

describe('voice call guardrails', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('strips leaked English meta narration from assistant text', () => {
        expect(
            sanitizeVoiceCallAssistantText(
                "Synthesizing Lu Chen's voice. I'm now carefully integrating all the character aspects and the specific details from the memory database, to ensure an authentic and comforting response.",
            ),
        ).toBe('');
    });

    it('preserves normal spoken content while still removing stage directions', () => {
        expect(
            sanitizeVoiceCallAssistantText('(laughs softly) 那我继续说啦'),
        ).toBe('那我继续说啦');
        expect(
            sanitizeVoiceCallAssistantText('Hello there, stay with me.'),
        ).toBe('Hello there, stay with me.');
    });

    it('converts stage directions into provider emotion tags for TTS only', () => {
        expect(
            sanitizeVoiceCallAssistantTextForTts('(laughs softly) I knew it.', 'minimax'),
        ).toBe('(laughs) I knew it.');
        expect(
            sanitizeVoiceCallAssistantTextForTts('(sighs) I knew it.', 'elevenlabs-v3'),
        ).toBe('[sighs] I knew it.');
        expect(
            sanitizeVoiceCallAssistantTextForTts('(sighs) I knew it.', 'strip'),
        ).toBe('I knew it.');
    });

    it('locks default voice-call output to spoken Chinese when foreign mode is disabled', () => {
        const llm = new VoiceCallLlm(
            {
                baseUrl: 'https://example.com',
                apiKey: 'test-key',
                model: 'test-model',
            },
            {
                id: 'char-1',
                name: '陆沉',
                systemPrompt: '你很在意对方。',
                worldview: '',
                mountedWorldbooks: [],
                refinedMemories: {},
                memories: [],
                activeMemoryMonths: [],
                vectorMemoryEnabled: false,
            } as any,
            {
                name: '我',
            } as any,
        );

        const prompt = llm.getSystemPrompt();
        expect(prompt).toContain('默认只用简体中文口语说话');
        expect(prompt).toContain('不要输出任何系统提示、思维过程、检索过程');
    });

    it('waits for a complete foreign-language translation tag before emitting a sentence', () => {
        const originalOnly = 'こんにちは、元気？';
        const withTranslation = 'こんにちは、元気？[[翻译:你好，还好吗？]]';

        expect(shouldEmitVoiceCallSentence(originalOnly, '？', true)).toBe(false);
        expect(shouldEmitVoiceCallSentence(withTranslation, ']', true)).toBe(true);
        expect(splitVoiceCallForeignSentence(withTranslation)).toEqual({
            spokenText: 'こんにちは、元気？',
            translationText: '你好，还好吗？',
            hasTranslation: true,
        });
    });

    it('applies foreign-language instructions in truth mode too', () => {
        const llm = new VoiceCallLlm(
            {
                baseUrl: 'https://example.com',
                apiKey: 'test-key',
                model: 'test-model',
                callMode: 'truth',
                foreignLang: { sourceLang: '日本語', targetLang: '中文' },
            },
            {
                id: 'char-1',
                name: '陆沉',
                systemPrompt: '你很在意对方。',
                worldview: '',
                mountedWorldbooks: [],
                refinedMemories: {},
                memories: [],
                activeMemoryMonths: [],
                vectorMemoryEnabled: false,
            } as any,
            {
                name: '我',
            } as any,
        );

        const prompt = llm.getSystemPrompt();
        expect(prompt).toContain('你现在必须用 **日本語** 说话');
        expect(prompt).toContain('[[翻译:中文翻译内容]]');
    });

    it('falls back to non-streaming chat completion when streaming is aborted by transport', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                choices: [{ message: { content: '你好呀。我们继续聊。' } }],
            }), { status: 200 }));

        vi.stubGlobal('fetch', fetchMock);

        const llm = new VoiceCallLlm(
            {
                baseUrl: 'https://example.com/v1',
                apiKey: 'test-key',
                model: 'test-model',
            },
            {
                id: 'char-1',
                name: '陆沉',
                systemPrompt: '你很在意对方。',
                worldview: '',
                mountedWorldbooks: [],
                refinedMemories: {},
                memories: [],
                activeMemoryMonths: [],
                vectorMemoryEnabled: false,
            } as any,
            {
                name: '我',
            } as any,
        );

        const sentences: string[] = [];
        let complete = '';

        await llm.chat('喂？', {
            onSentence: (text) => { sentences.push(text); },
            onComplete: (text) => { complete = text; },
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).stream).toBe(true);
        expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).stream).toBe(false);
        expect(sentences).toEqual(['你好呀。', '我们继续聊。']);
        expect(complete).toBe('你好呀。我们继续聊。');
        const history = llm.getHistory();
        expect(history[history.length - 1]).toMatchObject({
            role: 'assistant',
            content: '你好呀。 我们继续聊。',
        });
    });

    it('does not fall back when the call intentionally aborts the active request', async () => {
        let capturedSignal: AbortSignal | undefined;
        const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            capturedSignal = init?.signal as AbortSignal | undefined;
            capturedSignal?.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
            }, { once: true });
        }));

        vi.stubGlobal('fetch', fetchMock);

        const llm = new VoiceCallLlm(
            {
                baseUrl: 'https://example.com/v1',
                apiKey: 'test-key',
                model: 'test-model',
            },
            {
                id: 'char-1',
                name: '陆沉',
                systemPrompt: '你很在意对方。',
                worldview: '',
                mountedWorldbooks: [],
                refinedMemories: {},
                memories: [],
                activeMemoryMonths: [],
                vectorMemoryEnabled: false,
            } as any,
            {
                name: '我',
            } as any,
        );

        const onError = vi.fn();
        const chatPromise = llm.chat('先停一下', {
            onSentence: vi.fn(),
            onComplete: vi.fn(),
            onError,
        });

        expect(capturedSignal).toBeDefined();
        llm.abort();
        await chatPromise;

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(onError).not.toHaveBeenCalled();
    });
});
