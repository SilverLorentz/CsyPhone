import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    buildQuickSongCoverPrompt,
    buildQuickSongMaterialBundle,
    deriveQuickSongTitle,
    extractQuickSongCoverMoment,
    extractQuickSongLyrics,
    extractQuickSongRewriteNote,
    extractQuickSongStylePrompt,
    extractQuickSongTitle,
    generateQuickSongLyrics,
} from './chatQuickSong';
import type { APIConfig, CharacterProfile, Message, UserProfile } from '../types';

const char = {
    id: 'char-1',
    name: 'Sully',
    avatar: '',
    description: '会把杯子放在窗边的人。',
    systemPrompt: '说话克制，记得用户的小习惯。',
    worldview: '两个人住在有雨的城市。',
    memories: [{ id: 'core-1', date: '2026-05', summary: '用户总在睡前说到家了。' }],
    refinedMemories: { '2026-05': '蓝杯子、便利店和到家消息是五月反复出现的关系细节。' },
    mountedWorldbooks: [{ id: 'wb-1', title: '便利店', content: '楼下便利店的灯会开到凌晨。' }],
    impression: {
        version: 1,
        value_map: { likes: ['蓝杯子'], dislikes: ['被催'], core_values: '慢一点也没关系' },
        behavior_profile: { tone_style: '口语', emotion_summary: '克制', response_patterns: '会用细节确认安全感' },
        emotion_schema: { triggers: { positive: ['到家报平安'], negative: ['含糊失约'] }, comfort_zone: '轻声聊天', stress_signals: ['沉默'] },
        personality_core: { observed_traits: ['敏感', '稳定'], interaction_style: '慢热', summary: '会把小事放很久' },
    },
} as CharacterProfile;

const userProfile: UserProfile = {
    name: '屿屿',
    avatar: '',
    bio: '',
};

const apiConfig: APIConfig = {
    baseUrl: 'https://llm.example.test/v1',
    apiKey: 'test-key',
    model: 'song-writer',
};

function sseResponse(events: any[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const event of events) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
        },
    });
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

function jsonChatResponse(content: string, finishReason = 'stop'): Response {
    return new Response(JSON.stringify({
        choices: [{ message: { content }, finish_reason: finishReason }],
    }), { headers: { 'content-type': 'application/json' } });
}

function makeMessage(id: number, role: Message['role'], content: string): Message {
    return {
        id,
        charId: char.id,
        role,
        type: 'text',
        content,
        timestamp: id,
    };
}

describe('chatQuickSong', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.removeItem('sully_api_request_ledger_v1');
    });

    it('extracts lyrics wrapped in markers and strips code fences', () => {
        const lyrics = extractQuickSongLyrics([
            '```lyrics',
            '===LYRICS===',
            '[Verse 1]',
            '你那句到家了还亮着',
            '[Pre-Chorus]',
            '杯沿还留着水',
            '===END===',
            '```',
        ].join('\n'));

        expect(lyrics).toBe('[Verse]\n你那句到家了还亮着\n[Pre Chorus]\n杯沿还留着水');
    });

    it('extracts rewrite note after the lyrics block', () => {
        const note = extractQuickSongRewriteNote([
            '===LYRICS===',
            '[Chorus]',
            '我看了第三遍 没回',
            '===END===',
            '再一行：删掉空泛表达，补了屏幕细节。',
        ].join('\n'));

        expect(note).toContain('屏幕细节');
    });

    it('loosely extracts lyrics from a truncated marker block', () => {
        const lyrics = extractQuickSongLyrics([
            '前面解释一句',
            '===LYRICS===',
            '[Verse]',
            '蓝杯子还在窗边',
            '[Chorus]',
            '到家了停在屏幕上',
            '再一行：这里开始是说明',
        ].join('\n'));

        expect(lyrics).toBe('[Verse]\n蓝杯子还在窗边\n[Chorus]\n到家了停在屏幕上');
    });

    it('loosely extracts lyrics from JSON output', () => {
        const lyrics = extractQuickSongLyrics(JSON.stringify({
            lyrics: '[Verse]\n便利店的灯没关',
        }));

        expect(lyrics).toBe('[Verse]\n便利店的灯没关');
    });

    it('normalizes style prompt into comma-separated MiniMax tags', () => {
        const prompt = extractQuickSongStylePrompt([
            '===PROMPT===',
            'indie folk， intimate',
            'fingerpicked guitar',
            'soft female vocal',
            '===END===',
        ].join('\n'));

        expect(prompt).toBe('indie folk, intimate, fingerpicked guitar, soft female vocal');
    });

    it('derives a compact concrete fallback title from the chorus hook', () => {
        const title = deriveQuickSongTitle([
            '[Verse]',
            '便利店的灯没关',
            '[Chorus]',
            '你那句到家了还停在屏幕上',
            '我看了第三遍 没回',
        ].join('\n'));

        expect(title).toBe('到家屏幕');
    });

    it('extracts a short title without decorations or explanation', () => {
        const title = extractQuickSongTitle([
            '《到家屏幕》',
            '这个标题来自副歌画面。',
        ].join('\n'));

        expect(title).toBe('到家屏幕');
    });

    it('builds material from recent chat and full relationship context', () => {
        const bundle = buildQuickSongMaterialBundle({
            messages: [
                makeMessage(1, 'user', '我把蓝杯子忘你那儿了'),
                makeMessage(2, 'assistant', '那我先替你放在窗边'),
            ],
            memories: [
                {
                    id: 'old',
                    title: '旧记忆',
                    content: '已经被废弃',
                    importance: 10,
                    createdAt: 1,
                    deprecated: true,
                },
                {
                    id: 'salient',
                    title: '蓝杯子',
                    content: '用户总把蓝色杯子落在窗边。',
                    importance: 8,
                    salienceScore: 6,
                    mentionCount: 4,
                    createdAt: 2,
                },
                {
                    id: 'l1',
                    title: '用户认知',
                    content: '用户会把报平安当成一种轻轻的确认。',
                    importance: 9,
                    createdAt: 3,
                    level: 1,
                },
            ],
            char,
            userProfile,
        });

        expect(bundle.materialText).toContain('我把蓝杯子忘你那儿了');
        expect(bundle.materialText).toContain('蓝色杯子');
        expect(bundle.materialText).toContain('角色人设');
        expect(bundle.materialText).toContain('世界书');
        expect(bundle.materialText).toContain('对用户的印象');
        expect(bundle.materialText).toContain('向量中对用户的认知');
        expect(bundle.sourceMemoryIds).toEqual(['salient', 'l1']);
        expect(bundle.sourceMessageIds).toEqual([1, 2]);
        expect(bundle.materialText).not.toContain('已经被废弃');
    });

    it('keeps the latest 300 messages in the material bundle', () => {
        const messages = Array.from({ length: 320 }, (_, index) => (
            makeMessage(index + 1, index % 2 === 0 ? 'user' : 'assistant', `消息 ${index + 1}`)
        ));

        const bundle = buildQuickSongMaterialBundle({
            messages,
            memories: [],
            char,
            userProfile,
        });

        expect(bundle.sourceMessageIds).toHaveLength(300);
        expect(bundle.sourceMessageIds[0]).toBe(21);
        expect(bundle.sourceMessageIds[299]).toBe(320);
        expect(bundle.materialText).toContain('消息 320');
    });

    it('builds cover prompts with fixed style and tone presets', () => {
        const moment = extractQuickSongCoverMoment([
            '[Verse]',
            '蓝杯子靠在窗边',
            '你说先别回',
            '[Chorus]',
            '到家了还停在屏幕上',
            '我看第三遍',
        ].join('\n'));
        const prompt = buildQuickSongCoverPrompt({
            scene: 'A blue cup beside a rainy window, a phone screen glowing nearby.',
            style: 'still_life',
            tone: 'rain_blue',
            characterAppearancePrompt: 'short black hair',
        });

        expect(moment).toContain('蓝杯子');
        expect(prompt.prompt).toContain('still-life illustration album cover');
        expect(prompt.prompt).toContain('desaturated cool blue');
        expect(prompt.includesCharacter).toBe(false);
    });

    it('streams lyrics from OpenAI-compatible SSE responses', async () => {
        const fetchMock = vi.fn().mockResolvedValue(sseResponse([
            { choices: [{ delta: { reasoning_content: '先找一个具体物件。' } }] },
            { choices: [{ delta: { content: '===LYRICS===\n[Verse]\n' } }] },
            { choices: [{ delta: { content: '蓝杯子还在窗边\n===END===' }, finish_reason: 'stop' }] },
        ]));
        vi.stubGlobal('fetch', fetchMock);

        const result = await generateQuickSongLyrics({
            apiConfig,
            char,
            userProfile,
            materialText: '蓝杯子、窗边、到家消息。',
        });

        expect(result.lyrics).toBe('[Verse]\n蓝杯子还在窗边');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        expect(body.stream).toBe(true);
        expect(body.max_tokens).toBe(65536);
    });

    it('accepts JSON responses when the streaming request is answered non-streaming', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonChatResponse([
            '===LYRICS===',
            '[Verse]',
            '便利店的灯没关',
            '===END===',
        ].join('\n')));
        vi.stubGlobal('fetch', fetchMock);

        const result = await generateQuickSongLyrics({
            apiConfig,
            char,
            userProfile,
            materialText: '便利店。',
        });

        expect(result.lyrics).toBe('[Verse]\n便利店的灯没关');
        const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        expect(body.stream).toBe(true);
    });

    it('falls back to non-streaming when streaming fails before any chunk', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new TypeError('streaming unsupported'))
            .mockResolvedValueOnce(jsonChatResponse([
                '===LYRICS===',
                '[Verse]',
                '到家消息停在屏幕上',
                '===END===',
            ].join('\n')));
        vi.stubGlobal('fetch', fetchMock);

        const result = await generateQuickSongLyrics({
            apiConfig,
            char,
            userProfile,
            materialText: '到家消息。',
        });

        expect(result.lyrics).toBe('[Verse]\n到家消息停在屏幕上');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).stream).toBe(true);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).stream).toBe(false);
    });

    it('reports max token truncation from streaming finish_reason length', async () => {
        const fetchMock = vi.fn().mockResolvedValue(sseResponse([
            { choices: [{ delta: { content: '===LYRICS===\n[Verse]\n蓝杯子' } }] },
            { choices: [{ delta: {}, finish_reason: 'length' }] },
        ]));
        vi.stubGlobal('fetch', fetchMock);

        await expect(generateQuickSongLyrics({
            apiConfig,
            char,
            userProfile,
            materialText: '蓝杯子。',
        })).rejects.toThrow(/finish_reason: length|max_tokens|截断/);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

});
