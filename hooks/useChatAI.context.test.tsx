// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatAI } from './useChatAI';
import { DB } from '../utils/db';
import { ChatPrompts } from '../utils/chatPrompts';
import { safeFetchJson,safeResponseJson } from '../utils/safeApi';
import { VectorMemoryExtractor } from '../utils/vectorMemoryExtractor';
import { MindSnapshotExtractor } from '../utils/mindSnapshotExtractor';
import { EventExtractor } from '../utils/eventExtractor';
import { getEmbeddingConfig, getSecondaryApiConfig, selectSecondaryApiConfig } from '../utils/runtimeConfig';
import type { CharacterProfile, Message } from '../types';

vi.mock('../utils/db', () => ({
    DB: {
        getRecentMessagesByCharId: vi.fn(),
        saveMessage: vi.fn(() => Promise.resolve(42)),
        updateMessageMetadata: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../utils/chatPrompts', () => ({
    ChatPrompts: {
        buildSystemPrompt: vi.fn(() => Promise.resolve('system prompt')),
        buildMessageHistory: vi.fn((messages: Message[]) => ({
            apiMessages: messages.map(message => ({ role: message.role, content: message.content })),
            historySlice: messages,
        })),
    },
}));

vi.mock('../utils/chatParser', () => ({
    BILINGUAL_MARKER: '%%BILINGUAL%%',
    ChatParser: {
        cleanAiSecondPass: vi.fn((content: string) => content),
        parseAndExecuteActions: vi.fn((content: string) => Promise.resolve(content)),
        sanitize: vi.fn((content: string) => content),
        splitResponse: vi.fn((content: string) => [{ type: 'text', content }]),
        hasDisplayContent: vi.fn((content: string) => content.trim().length > 0),
        chunkText: vi.fn((content: string) => [content]),
    },
}));

vi.mock('../utils/safeApi', () => ({
    safeFetchJson: vi.fn(),
    safeResponseJson: vi.fn((response: Response) => response.json()),
}));

vi.mock('../utils/haptics', () => ({
    haptic: { light: vi.fn(), medium: vi.fn() },
    playThemeNotification: vi.fn(),
}));

vi.mock('../components/chat/ThemeRegistry', () => ({
    THEME_PLUGINS: {},
}));

vi.mock('../utils/vectorMemoryExtractor', () => ({
    VectorMemoryExtractor: { maybeExtract: vi.fn(() => Promise.resolve()) },
}));

vi.mock('../utils/mindSnapshotExtractor', () => ({
    MindSnapshotExtractor: {
        senseBefore: vi.fn(() => Promise.resolve(null)),
        generateInnerVoice: vi.fn(() => Promise.resolve(null)),
    },
}));

vi.mock('../utils/goalService', () => ({
    loadCharacterGoals: vi.fn(() => Promise.resolve([])),
    formatGoalListStr: vi.fn(() => ''),
}));

vi.mock('../utils/eventExtractor', () => ({
    EventExtractor: { extract: vi.fn(() => Promise.resolve()) },
}));

vi.mock('../utils/thinkingExtractor', () => ({
    extractThinking: vi.fn((content: string) => ({ thinking: '', content })),
    safeThinkingFallbackReply: vi.fn(() => 'fallback'),
}));

vi.mock('../utils/deepseekPrompts', () => ({
    isDeepSeekMode: vi.fn(() => false),
}));

vi.mock('../utils/runtimeConfig', () => ({
    DEFAULT_CHAT_TEMPERATURE: 0.85,
    getEmbeddingConfig: vi.fn(() => ({ apiKey: '' })),
    getSecondaryApiConfig: vi.fn(() => null),
    normalizeChatTemperature: vi.fn((value: unknown, fallback: number) => (
        typeof value === 'number' && Number.isFinite(value) ? value : fallback
    )),
    selectSecondaryApiConfig: vi.fn(() => null),
}));

vi.mock('../utils/autonomousAgent', () => ({
    BackendAgentManager: {
        refreshCharacterContext: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../utils/agentBackendClient', () => ({
    generateAgentScheduleRevision: vi.fn(() => Promise.resolve({ rewritten: false })),
    TODAY_SCHEDULE_UPDATED_EVENT_NAME: 'today-schedule-updated',
}));

vi.mock('./handlers/handleRecall', () => ({ handleRecall: vi.fn((content: string) => Promise.resolve(content)) }));
vi.mock('./handlers/handleSearch', () => ({ handleSearch: vi.fn((content: string) => Promise.resolve(content)) }));
vi.mock('./handlers/handleWeiboSearch', () => ({ handleWeiboSearch: vi.fn((content: string) => Promise.resolve(content)) }));
vi.mock('./handlers/handleDiaryWrite', () => ({ handleDiaryWrite: vi.fn((content: string) => Promise.resolve(content)) }));
vi.mock('./handlers/handleDiaryRead', () => ({ handleDiaryRead: vi.fn((content: string) => Promise.resolve(content)) }));
vi.mock('./handlers/handleFeishuDiary', () => ({ handleFeishuDiary: vi.fn((content: string) => Promise.resolve(content)) }));
vi.mock('./handlers/handleFeishuDiaryRead', () => ({ handleFeishuDiaryRead: vi.fn((content: string) => Promise.resolve(content)) }));
vi.mock('./handlers/handleXhsActions', () => ({ handleXhsActions: vi.fn((content: string) => Promise.resolve(content)) }));

vi.mock('../utils/musicService', () => ({
    searchSongs: vi.fn(() => Promise.resolve({ songs: [] })),
}));

vi.mock('./useAudioPlayer', () => ({
    getCurrentPlayback: vi.fn(() => null),
}));

vi.mock('../utils/playbackLyricsRuntime', () => ({
    getPlaybackLyricKey: vi.fn(() => ''),
    getPlayableLyricSnapshot: vi.fn(() => Promise.resolve(null)),
    shouldInjectPlaybackLyricSnapshot: vi.fn(() => false),
}));

vi.mock('../utils/playbackContextRuntime', () => ({
    shouldInjectPlaybackContextFromState: vi.fn(() => false),
}));

const mockedDB = vi.mocked(DB);
const mockedChatPrompts = vi.mocked(ChatPrompts);
const mockedSafeFetchJson = vi.mocked(safeFetchJson);
const mockedSafeResponseJson = vi.mocked(safeResponseJson);
const mockedGetEmbeddingConfig = vi.mocked(getEmbeddingConfig);
const mockedGetSecondaryApiConfig = vi.mocked(getSecondaryApiConfig);
const mockedSelectSecondaryApiConfig = vi.mocked(selectSecondaryApiConfig);
const mockedVectorMemoryExtractor = vi.mocked(VectorMemoryExtractor);
const mockedMindSnapshotExtractor = vi.mocked(MindSnapshotExtractor);
const mockedEventExtractor = vi.mocked(EventExtractor);

function makeMessage(id: number, content: string): Message {
    return {
        id,
        charId: 'char-1',
        role: 'user',
        type: 'text',
        content,
        timestamp: 1000 + id,
    };
}

describe('useChatAI context loading', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
        mockedGetEmbeddingConfig.mockReturnValue({ apiKey: '' } as any);
        mockedGetSecondaryApiConfig.mockReturnValue(null as any);
        mockedSelectSecondaryApiConfig.mockReturnValue(null as any);
        mockedSafeResponseJson.mockImplementation((response: Response) => response.json());
        mockedDB.getRecentMessagesByCharId.mockResolvedValue([makeMessage(2, 'full db context')]);
        mockedSafeFetchJson.mockResolvedValue({
            choices: [{ message: { content: 'assistant reply' } }],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        } as any);
    });

    it('loads AI context from DB using the character context limit', async () => {
        const setMessages = vi.fn();
        const char = {
            id: 'char-1',
            name: 'Sully',
            avatar: '',
            description: '',
            systemPrompt: '',
            memories: [],
            contextLimit: 777,
            statusBarMode: 'off',
        } as CharacterProfile;

        const { result } = renderHook(() => useChatAI({
            char,
            userProfile: { name: 'Tester', avatar: '' } as any,
            apiConfig: { baseUrl: 'https://example.test', apiKey: 'sk-test', model: 'test-model' },
            groups: [],
            emojis: [],
            categories: [],
            addToast: vi.fn(),
            setMessages,
        }));

        await act(async () => {
            await result.current.triggerAI([makeMessage(1, 'ui-visible only')]);
        });

        expect(mockedDB.getRecentMessagesByCharId).toHaveBeenCalledWith('char-1', 777);
        expect(mockedChatPrompts.buildSystemPrompt).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'char-1' }),
            expect.anything(),
            [],
            [],
            [],
            [expect.objectContaining({ content: 'full db context' })],
            undefined,
            expect.anything(),
            undefined,
            [],
            expect.objectContaining({
                autoCall: undefined,
                autoPhoto: undefined,
                autoShareSong: undefined,
                autoVoice: undefined,
            }),
        );
    });

    it('keeps a live reply user message when the DB context is stale', async () => {
        const staleDbMessage = makeMessage(2, 'full db context');
        const liveReplyMessage: Message = {
            ...makeMessage(3, '我后面这句话也要被看见'),
            replyTo: {
                id: 99,
                name: 'Sully',
                content: '被引用的原文',
                type: 'text',
            },
        };
        mockedDB.getRecentMessagesByCharId.mockResolvedValueOnce([staleDbMessage]);

        const char = {
            id: 'char-1',
            name: 'Sully',
            avatar: '',
            description: '',
            systemPrompt: '',
            memories: [],
            contextLimit: 777,
            statusBarMode: 'off',
        } as CharacterProfile;

        const { result } = renderHook(() => useChatAI({
            char,
            userProfile: { name: 'Tester', avatar: '' } as any,
            apiConfig: { baseUrl: 'https://example.test', apiKey: 'sk-test', model: 'test-model' },
            groups: [],
            emojis: [],
            categories: [],
            addToast: vi.fn(),
            setMessages: vi.fn(),
        }));

        await act(async () => {
            await result.current.triggerAI([liveReplyMessage]);
        });

        const messageHistoryInput = mockedChatPrompts.buildMessageHistory.mock.calls[0][0];
        expect(messageHistoryInput).toEqual([
            staleDbMessage,
            expect.objectContaining({
                content: '我后面这句话也要被看见',
                replyTo: expect.objectContaining({
                    content: '被引用的原文',
                    name: 'Sully',
                }),
            }),
        ]);
    });

    it('normalizes leaked reply context into a saved quote reply', async () => {
        const quotedUserMessage = makeMessage(7, '你刚刚叫我什么？');
        mockedDB.getRecentMessagesByCharId.mockResolvedValueOnce([quotedUserMessage]);
        mockedSafeFetchJson.mockResolvedValueOnce({
            choices: [{
                message: {
                    content: '引用回复上下文：这条消息正在回复Tester的消息「你刚刚叫我什么？」。本条消息正文：我的错，一时嘴快。',
                },
            }],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        } as any);

        const char = {
            id: 'char-1',
            name: 'Sully',
            avatar: '',
            description: '',
            systemPrompt: '',
            memories: [],
            contextLimit: 777,
            statusBarMode: 'off',
        } as CharacterProfile;

        const { result } = renderHook(() => useChatAI({
            char,
            userProfile: { name: 'Tester', avatar: '' } as any,
            apiConfig: {
                baseUrl: 'https://example.test',
                apiKey: 'sk-test',
                model: 'test-model',
                disablePrefill: true,
            },
            groups: [],
            emojis: [],
            categories: [],
            addToast: vi.fn(),
            setMessages: vi.fn(),
        }));

        await act(async () => {
            await result.current.triggerAI([quotedUserMessage]);
        });

        expect(mockedDB.saveMessage).toHaveBeenCalledWith(expect.objectContaining({
            charId: 'char-1',
            role: 'assistant',
            type: 'text',
            content: '我的错，一时嘴快。',
            replyTo: {
                id: 7,
                content: '你刚刚叫我什么？',
                name: 'Tester',
            },
        }));
    });

    it('passes the previous assistant thinking chain to pre-reply state sensing', async () => {
        mockedSelectSecondaryApiConfig.mockReturnValue({
            baseUrl: 'https://secondary.example.test',
            apiKey: 'sk-secondary',
            model: 'secondary-model',
        } as any);

        const previousAssistant = {
            id: 2,
            charId: 'char-1',
            role: 'assistant',
            type: 'text',
            content: '我在。',
            timestamp: 1002,
            metadata: { thinking: '上一轮我其实有点担心她是不是在硬撑。' },
        } as Message;
        const currentUser = makeMessage(3, '今天还是有点累');
        mockedDB.getRecentMessagesByCharId.mockResolvedValue([previousAssistant, currentUser]);

        const char = {
            id: 'char-1',
            name: 'Sully',
            avatar: '',
            description: '',
            systemPrompt: '',
            memories: [],
            contextLimit: 777,
            statusBarMode: 'off',
        } as CharacterProfile;

        const { result } = renderHook(() => useChatAI({
            char,
            userProfile: { name: 'Tester', avatar: '' } as any,
            apiConfig: { baseUrl: 'https://example.test', apiKey: 'sk-test', model: 'test-model' },
            groups: [],
            emojis: [],
            categories: [],
            addToast: vi.fn(),
            setMessages: vi.fn(),
        }));

        await act(async () => {
            await result.current.triggerAI([currentUser]);
        });

        expect(mockedMindSnapshotExtractor.senseBefore).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'char-1' }),
            [previousAssistant, currentUser],
            expect.objectContaining({ model: 'secondary-model' }),
            '',
            [],
            expect.objectContaining({
                previousThinking: '上一轮我其实有点担心她是不是在硬撑。',
            }),
        );
    });

    it('does not run secondary background tasks through the primary API when secondary API is missing', async () => {
        mockedGetEmbeddingConfig.mockReturnValue({ apiKey: 'embedding-key' } as any);
        mockedGetSecondaryApiConfig.mockReturnValue(null as any);
        mockedSelectSecondaryApiConfig.mockReturnValue(null as any);
        const setMessages = vi.fn();
        const char = {
            id: 'char-1',
            name: 'Sully',
            avatar: '',
            description: '',
            systemPrompt: '',
            memories: [],
            contextLimit: 777,
            statusBarMode: 'classic',
            vectorMemoryEnabled: true,
            vectorMemoryAutoExtract: true,
        } as CharacterProfile;

        const { result } = renderHook(() => useChatAI({
            char,
            userProfile: { name: 'Tester', avatar: '' } as any,
            apiConfig: { baseUrl: 'https://primary.example.test', apiKey: 'sk-primary', model: 'primary-model' },
            groups: [],
            emojis: [],
            categories: [],
            addToast: vi.fn(),
            setMessages,
        }));

        await act(async () => {
            await result.current.triggerAI([makeMessage(1, '明天提醒我开会')]);
        });

        expect(mockedSafeFetchJson).toHaveBeenCalledTimes(1);
        expect(mockedSafeFetchJson.mock.calls[0][0]).toBe('https://primary.example.test/chat/completions');
        expect(mockedSafeFetchJson.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'POST' }));
        expect(mockedMindSnapshotExtractor.senseBefore).not.toHaveBeenCalled();
        expect(mockedMindSnapshotExtractor.generateInnerVoice).not.toHaveBeenCalled();
        expect(mockedVectorMemoryExtractor.maybeExtract).not.toHaveBeenCalled();
        expect(mockedEventExtractor.extract).not.toHaveBeenCalled();
    });

    it('keeps trailing chat instructions inside multimodal user content', async () => {
        mockedChatPrompts.buildMessageHistory.mockReturnValueOnce({
            apiMessages: [{
                role: 'user',
                content: [
                    { type: 'text', text: '[2026-04-21 10:31] 看看这个是什么' },
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,user-image' } },
                ],
            }],
            historySlice: [makeMessage(1, '看看这个是什么')],
        } as any);

        const char = {
            id: 'char-1',
            name: 'Sully',
            avatar: '',
            description: '',
            systemPrompt: '',
            memories: [],
            contextLimit: 777,
            statusBarMode: 'off',
        } as CharacterProfile;

        const { result } = renderHook(() => useChatAI({
            char,
            userProfile: { name: 'Tester', avatar: '' } as any,
            apiConfig: { baseUrl: 'https://example.test', apiKey: 'sk-test', model: 'test-model' },
            groups: [],
            emojis: [],
            categories: [],
            addToast: vi.fn(),
            setMessages: vi.fn(),
        }));

        await act(async () => {
            await result.current.triggerAI([makeMessage(1, '看看这个是什么')]);
        });

        const body = JSON.parse((mockedSafeFetchJson.mock.calls[0][1] as RequestInit).body as string);
        const userMessages = body.messages.filter((message: any) => message.role === 'user');
        expect(userMessages).toHaveLength(1);
        expect(Array.isArray(userMessages[0].content)).toBe(true);
        expect(userMessages[0].content).toEqual(expect.arrayContaining([
            { type: 'image_url', image_url: { url: 'data:image/png;base64,user-image' } },
            expect.objectContaining({ type: 'text', text: expect.stringContaining('[思考提示]') }),
        ]));
        expect(body.messages[body.messages.length - 1]).toEqual({ role: 'assistant', content: '<thinking>' });
    });

    it('uses streaming preview when the experimental stream toggle is enabled', async () => {
        const encoder = new TextEncoder();
        const fetchMock = vi.fn(async () => new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello "}}]}\n\n'));
                controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"world"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n'));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
            },
        }), { headers: { 'content-type': 'text/event-stream' } }));
        vi.stubGlobal('fetch', fetchMock);

        let renderedMessages: Message[] = [makeMessage(1, 'ui-visible only')];
        const setMessages = vi.fn((next: Message[] | ((prev: Message[]) => Message[])) => {
            renderedMessages = typeof next === 'function' ? next(renderedMessages) : next;
        });
        const char = {
            id: 'char-1',
            name: 'Sully',
            avatar: '',
            description: '',
            systemPrompt: '',
            memories: [],
            contextLimit: 777,
            statusBarMode: 'off',
        } as CharacterProfile;

        const { result } = renderHook(() => useChatAI({
            char,
            userProfile: { name: 'Tester', avatar: '' } as any,
            apiConfig: {
                baseUrl: 'https://example.test',
                apiKey: 'sk-test',
                model: 'test-model',
                disablePrefill: true,
                streamChat: true,
            },
            groups: [],
            emojis: [],
            categories: [],
            addToast: vi.fn(),
            setMessages: setMessages as any,
        }));

        await act(async () => {
            await result.current.triggerAI([makeMessage(1, 'ui-visible only')]);
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).stream).toBe(true);
        expect(mockedSafeFetchJson).not.toHaveBeenCalled();
        expect(setMessages).toHaveBeenCalledWith(expect.any(Function));
        expect(mockedDB.saveMessage).toHaveBeenCalledWith(expect.objectContaining({
            role: 'assistant',
            content: 'hello world',
        }));
    });
});
