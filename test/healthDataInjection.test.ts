import { describe, expect, it } from 'vitest';
import { ContextBuilder } from '../utils/context';
import { ChatPrompts } from '../utils/chatPrompts';

const baseCharacter = {
    id: 'char-1',
    name: '糯米',
    avatar: 'avatar.png',
    description: '',
    systemPrompt: '你是糯米。',
    worldview: '',
    refinedMemories: {},
    activeMemoryMonths: [],
    memories: [],
    mountedWorldbooks: [],
} as any;

const baseUser = {
    name: 'User',
    avatar: 'avatar.png',
    bio: 'bio',
};

describe('HalfSugar health data injection', () => {
    it('adds body information to core context only when body sharing is enabled', () => {
        const enabledContext = ContextBuilder.buildCoreContext(
            baseCharacter,
            {
                ...baseUser,
                healthShareBodyInfo: true,
                healthGender: 'female',
                healthHeight: 165,
                healthWeight: 55,
            },
            false,
            'vector',
        );

        expect(enabledContext).toContain('- 身体信息: 女，身高165cm，体重55kg，BMI 20.2');

        const disabledContext = ContextBuilder.buildCoreContext(
            baseCharacter,
            {
                ...baseUser,
                healthShareBodyInfo: false,
                healthGender: 'female',
                healthHeight: 165,
                healthWeight: 55,
            },
            false,
            'vector',
        );

        expect(disabledContext).not.toContain('身体信息:');
    });

    it('formats health_signal messages with the regular timestamp prefix', () => {
        const timestamp = new Date(2026, 3, 21, 10, 30).getTime();

        const { apiMessages } = ChatPrompts.buildMessageHistory(
            [{
                id: 1,
                charId: 'char-1',
                role: 'system',
                type: 'health_signal' as any,
                content: '[生活感知] TA早餐吃了酸奶，约120千卡',
                timestamp,
            }],
            10,
            baseCharacter,
            baseUser,
            [],
        );

        expect(apiMessages[0]).toEqual({
            role: 'system',
            content: '[2026-04-21 10:30] [生活感知] TA早餐吃了酸奶，约120千卡',
        });
    });

    it('injects mounted worldbook content into the core context', () => {
        const context = ContextBuilder.buildCoreContext(
            {
                ...baseCharacter,
                mountedWorldbooks: [{
                    id: 'wb-1',
                    title: '跟随角色卡的世界书',
                    content: '这段设定来自角色卡导入，并且应该进入聊天上下文。',
                    category: '导入设定',
                    position: 'after_worldview',
                }],
            },
            baseUser,
            false,
            'vector',
        );

        expect(context).toContain('跟随角色卡的世界书');
        expect(context).toContain('这段设定来自角色卡导入，并且应该进入聊天上下文。');
        expect(context).toContain('扩展设定集 (Worldbooks)');
    });

    it('injects soft devotion mode before the private impression layer', () => {
        const context = ContextBuilder.buildCoreContext(
            {
                ...baseCharacter,
                softDevotionChatMode: true,
                impression: {
                    version: 1,
                    value_map: {
                        likes: ['安静聊天'],
                        dislikes: [],
                        core_values: '',
                    },
                    behavior_profile: {
                        tone_style: '',
                        emotion_summary: '',
                        response_patterns: '',
                    },
                    emotion_schema: {
                        triggers: {
                            positive: [],
                            negative: ['被冷处理'],
                        },
                        comfort_zone: '慢慢说清楚',
                        stress_signals: [],
                    },
                    personality_core: {
                        observed_traits: ['敏感'],
                        interaction_style: '会试探确认',
                        summary: '很在意回应的温度',
                    },
                    observed_changes: [],
                },
            },
            {
                ...baseUser,
                name: '糯米',
            },
            false,
            'vector',
        );

        const userIndex = context.indexOf('### 互动对象 (User)');
        const softIndex = context.indexOf('<soft_devotion_chat_mode>');
        const impressionIndex = context.indexOf('### [私密档案: 我眼中的糯米] (Private Impression)');

        expect(softIndex).toBeGreaterThan(userIndex);
        expect(softIndex).toBeLessThan(impressionIndex);
        expect(context).toContain('糯米，你仍然是你，保持你的性格，但糯米是你格外珍惜、格外偏爱、会被格外温柔对待的人。');
        expect(context).toContain('但你对糯米的表达方式，应当明显更尊重，更珍视，更温柔、更耐心、更宠溺、让糯米更有安全感。');
        expect(context).toContain('我会尊重她的主体性、边界和选择。');
        expect(context).toContain('而不是：我管她，审判她，替她决定。');
        expect(context).not.toContain('本模式优先于通用 <equality> 规则里的部分禁用项');
    });
});
