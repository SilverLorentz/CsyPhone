import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CharacterProfile, Emoji, Message, UserProfile } from '../types';
import {
    buildUserActionSelectorPrompt,
    parseUserActionChoices,
    requestUserActionChoices,
    UserActionSelectorApiError,
} from '../utils/userActionSelector';

const userProfile: UserProfile = {
    name: '糯米',
    avatar: '',
    bio: '嘴硬但很会撒娇，喜欢用短句和表情包',
};

const char = {
    id: 'char-1',
    name: 'Sully',
    avatar: '',
    description: '少爷',
    systemPrompt: '敏感、温柔，线上聊天会接住对方的小情绪',
    worldview: '现代同居前暧昧期',
    memories: [
        { id: 'm1', date: '2026-06-01', summary: '两个人雨天一起等车', mood: '靠近' },
    ],
    refinedMemories: {
        '2026-06': '最近聊天更像暧昧期，彼此会用玩笑试探。',
    },
    activeMemoryMonths: ['2026-06'],
    impression: {
        version: 1,
        value_map: {
            likes: ['被认真哄', '可爱的表情包'],
            dislikes: ['被冷处理'],
            core_values: '真诚',
        },
        behavior_profile: {
            tone_style: '短句，偶尔撒娇',
            emotion_summary: '嘴硬但容易心软',
            response_patterns: '先退半步再靠近',
        },
        emotion_schema: {
            triggers: {
                positive: ['被偏爱'],
                negative: ['敷衍'],
            },
            comfort_zone: '轻松玩笑和温柔确认',
            stress_signals: ['沉默'],
        },
        personality_core: {
            observed_traits: ['敏感', '爱逞强'],
            interaction_style: '用玩笑藏认真',
            summary: '她会用轻松语气试探亲密边界。',
        },
        observed_changes: ['最近更愿意主动表达想念'],
    },
} as CharacterProfile;

const messages = [
    {
        id: 1,
        charId: 'char-1',
        role: 'user',
        type: 'text',
        content: '你今天怎么这么安静',
        timestamp: 1,
    },
    {
        id: 2,
        charId: 'char-1',
        role: 'assistant',
        type: 'text',
        content: '可能是有点想你，又不好意思说',
        timestamp: 2,
        metadata: { thinking: 'SECRET_THINKING_MARKER' },
    },
] as Message[];

const emojis: Emoji[] = [
    { name: '猫猫探头', url: 'cat.png', categoryId: 'default' },
    { name: '抱抱', url: 'hug.png', categoryId: 'soft' },
];

describe('userActionSelector', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('builds a prompt with user, character, impression, context, latest reply, and emoji names', () => {
        const prompt = buildUserActionSelectorPrompt({
            char,
            userProfile,
            messages,
            latestCharReply: messages[1].content,
            emojis,
        });

        expect(prompt.user).toContain('你是 糯米');
        expect(prompt.user).toContain('嘴硬但很会撒娇');
        expect(prompt.user).toContain('屏幕那头跟我聊天的人');
        expect(prompt.user).toContain('敏感、温柔');
        expect(prompt.user).toContain('她会用轻松语气试探亲密边界');
        expect(prompt.user).toContain('现代同居前暧昧期');
        expect(prompt.user).toContain('可能是有点想你');
        expect(prompt.user).toContain('- 猫猫探头');
        expect(prompt.user).toContain('表情包单独作为 `emojiName` 输出');
        expect(prompt.user).not.toContain('SECRET_THINKING_MARKER');
    });

    it('parses four choices and keeps valid emoji names', () => {
        const result = parseUserActionChoices(JSON.stringify({
            choices: [
                { id: 'gentle', label: '温柔接住', tone: '温柔', segments: ['那你可以说呀', '我又不会笑你'], emojiName: '抱抱' },
                { id: 'advance', label: '轻轻推进', tone: '主动', segments: ['那今晚多想我一点'], emojiName: '猫猫探头' },
                { id: 'quiet', label: '克制留白', tone: '克制', segments: ['哦', '那我听见了'], emojiName: '抱抱' },
                { id: 'turn', label: '换个方向', tone: '灵动', segments: ['少来', '你就是想让我哄你'], emojiName: '猫猫探头' },
            ],
        }), emojis);

        expect(result).toHaveLength(4);
        expect(result?.[0]).toMatchObject({
            id: 'gentle',
            segments: ['那你可以说呀', '我又不会笑你'],
            emojiName: '抱抱',
        });
    });

    it('cleans empty segments and falls back invalid emoji names', () => {
        const result = parseUserActionChoices(JSON.stringify({
            choices: [
                { id: 'gentle', segments: ['  好吧  ', '', '那我哄你一下'], emojiName: '不存在' },
                { id: 'advance', segments: ['过来一点'], emojiName: '抱抱' },
                { id: 'quiet', segments: ['嗯'], emojiName: '抱抱' },
                { id: 'turn', segments: ['你先叫我一声'], emojiName: '抱抱' },
            ],
        }), emojis);

        expect(result?.[0].segments).toEqual(['好吧', '那我哄你一下']);
        expect(result?.[0].emojiName).toBe('猫猫探头');
    });

    it('requests the secondary model with the full output token cap', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{ message: { content: '{"choices":[]}' }, finish_reason: 'stop' }],
        }), { status: 200 }));

        await requestUserActionChoices({
            apiConfig: { baseUrl: 'https://api.example.test/v1', apiKey: 'key', model: 'model' },
            prompt: { system: 'system', user: 'user' },
        });

        const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
        expect(body.max_tokens).toBe(65536);
    });

    it('reports max token truncation from finish_reason', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            choices: [{ message: { content: '{"choices":[' }, finish_reason: 'length' }],
        }), { status: 200 }));

        let error: unknown;
        try {
            await requestUserActionChoices({
                apiConfig: { baseUrl: 'https://api.example.test/v1', apiKey: 'key', model: 'model' },
                prompt: { system: 'system', user: 'user' },
            });
        } catch (caught) {
            error = caught;
        }

        expect(error).toBeInstanceOf(UserActionSelectorApiError);
        expect(error).toMatchObject({ code: 'max_tokens' });
    });
});
