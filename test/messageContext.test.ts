import { describe, expect, it } from 'vitest';
import {
    formatMessageForContext,
    shouldIncludeMessageInContext,
} from '../utils/messageContext';
import { ChatPrompts } from '../utils/chatPrompts';
import { formatMessages as formatExtractionMessages } from '../utils/engines/extractionLlm';
import type { Message } from '../types';

function msg(overrides: Partial<Message>): Message {
    return {
        id: 1,
        charId: 'char-1',
        role: 'user',
        type: 'text',
        content: '',
        timestamp: new Date(2026, 3, 21, 10, 30).getTime(),
        ...overrides,
    };
}

const character = {
    id: 'char-1',
    name: '糯米',
    avatar: 'avatar.png',
    description: '',
    systemPrompt: '',
    worldview: '',
    refinedMemories: {},
    activeMemoryMonths: [],
    memories: [],
    mountedWorldbooks: [],
} as any;

const user = {
    name: '栗子',
    avatar: 'avatar.png',
    bio: '',
} as any;

describe('message context formatter', () => {
    it('keeps assistant TTS voice text in chat history', () => {
        const { apiMessages } = ChatPrompts.buildMessageHistory([
            msg({
                role: 'assistant',
                type: 'voice',
                content: '',
                metadata: { source: 'read-aloud', sourceText: '我刚才说的是饭团，不是别的。' },
            }),
        ], 10, character, user, []);

        expect(apiMessages[0]?.content).toContain('[语音消息] 我刚才说的是饭团，不是别的。');
        expect(apiMessages[0]?.content).not.toContain('[你上一条语音]');
    });

    it('keeps user read-aloud voice via sourceText', () => {
        const text = formatMessageForContext(msg({
            type: 'voice',
            content: '',
            metadata: { source: 'read-aloud', sourceText: '这条文字被朗读后仍要进上下文。' },
        }), {
            surface: 'chat',
            charName: '糯米',
        });

        expect(text).toBe('[🎤用户语音] 这条文字被朗读后仍要进上下文。');
    });

    it('keeps date context bridges as timeline messages and drops raw date messages', () => {
        const { apiMessages } = ChatPrompts.buildMessageHistory([
            msg({
                id: 1,
                role: 'user',
                content: '线下原文',
                metadata: { source: 'date' },
            }),
            msg({
                id: 2,
                role: 'system',
                content: '他们在雨里一起回家。',
                metadata: {
                    source: 'date',
                    hiddenFromUser: true,
                    isDateContextBridge: true,
                    bridgeType: 'summary',
                },
            }),
            msg({
                id: 3,
                role: 'user',
                content: '回到线上了',
            }),
        ], 10, character, user, []);

        expect(apiMessages).toHaveLength(2);
        expect(apiMessages[0]?.role).toBe('system');
        expect(apiMessages[0]?.content).toContain('[线下见面总结已同步到主聊天时间线]');
        expect(apiMessages[0]?.content).toContain('他们在雨里一起回家。');
        expect(apiMessages[0]?.content).not.toContain('线下原文');
        expect(apiMessages[1]?.content).toContain('回到线上了');
    });

    it('formats rich chat messages instead of dropping them', () => {
        const messages = [
            msg({ type: 'image', content: 'https://example.com/a.png' }),
            msg({ type: 'emoji', content: 'sticker-url' }),
            msg({ type: 'transfer', content: '[转账]', metadata: { amount: '52.00', status: 'accepted' } }),
            msg({ type: 'social_card', content: '', metadata: { post: { title: '今天的云', content: '像一块软糖' } } }),
            msg({ type: 'xhs_card', content: '', metadata: { xhsNote: { title: '探店', author: '栗子', likes: 8, desc: '好吃' } } }),
            msg({
                type: 'chat_forward',
                content: JSON.stringify({
                    fromCharName: 'Sully',
                    count: 2,
                    messages: [
                        { role: 'user', type: 'text', content: '早安' },
                        { role: 'assistant', type: 'voice', content: '', metadata: { sourceText: '早安呀' } },
                    ],
                }),
            }),
        ];

        const formatted = messages.map(m => formatMessageForContext(m, {
            surface: 'memoryExtraction',
            charName: '糯米',
            emojis: [{ name: '挥手', url: 'sticker-url' }],
        }));

        expect(formatted.join('\n')).toContain('[发送了一张图片]');
        expect(formatted.join('\n')).toContain('[发送了表情包: 挥手]');
        expect(formatted.join('\n')).toContain('你已收取用户的 ¥52.00 转账');
        expect(formatted.join('\n')).toContain('标题: 今天的云');
        expect(formatted.join('\n')).toContain('标题: 探店');
        expect(formatted.join('\n')).toContain('用户转发了与 Sully 的 2 条聊天记录');
        expect(formatted.join('\n')).toContain('[语音] 早安呀');
    });

    it('uses low-induction formats for main chat generation context', () => {
        const assistantEmoji = formatMessageForContext(msg({
            role: 'assistant',
            type: 'emoji',
            content: 'sticker-url',
        }), {
            surface: 'chat',
            charName: '糯米',
            emojis: [{ name: '挥手', url: 'sticker-url' }],
        });
        const userEmoji = formatMessageForContext(msg({
            role: 'user',
            type: 'emoji',
            content: 'sticker-url',
        }), {
            surface: 'chat',
            charName: '糯米',
            emojis: [{ name: '挥手', url: 'sticker-url' }],
        });
        const assistantTransfer = formatMessageForContext(msg({
            role: 'assistant',
            type: 'transfer',
            content: '[转账]',
            metadata: { amount: '52.00', status: 'pending' },
        }), {
            surface: 'chat',
            charName: '糯米',
        });
        const userTransfer = formatMessageForContext(msg({
            role: 'user',
            type: 'transfer',
            content: '[转账]',
            metadata: { amount: '52.00', status: 'pending' },
        }), {
            surface: 'chat',
            charName: '糯米',
        });

        expect(assistantEmoji).toBe('[[SEND_EMOJI: 挥手]]');
        expect(assistantEmoji).not.toContain('发送了表情包');
        expect(userEmoji).toBe('[用户发来的表情包「挥手」]');
        expect(assistantTransfer).toBe('[[ACTION:TRANSFER:52.00]]');
        expect(userTransfer).toBe('[用户给你转账 ¥52.00，等待你收款]');
    });

    it('formats emoji messages with registry, metadata, and URL filename fallbacks', () => {
        const registryEmoji = formatMessageForContext(msg({
            role: 'assistant',
            type: 'emoji',
            content: 'https://cdn.example/stickers/sully-goodnight.png',
        }), {
            surface: 'memoryExtraction',
            charName: '糯米',
            emojis: [{ name: 'Sully晚安', url: 'https://cdn.example/stickers/sully-goodnight.png' }],
        });
        const metadataEmoji = formatMessageForContext(msg({
            role: 'assistant',
            type: 'emoji',
            content: 'data:image/png;base64,very-large-sticker',
            metadata: { name: '委屈' },
        }), {
            surface: 'memoryExtraction',
            charName: '糯米',
        });
        const filenameEmoji = formatMessageForContext(msg({
            role: 'assistant',
            type: 'emoji',
            content: 'https://cdn.example/stickers/kiss-face.webp?size=2',
        }), {
            surface: 'memoryExtraction',
            charName: '糯米',
        });

        expect(registryEmoji).toBe('[发送了表情包: Sully晚安]');
        expect(metadataEmoji).toBe('[发送了表情包: 委屈]');
        expect(filenameEmoji).toBe('[发送了表情包: kiss face]');
        expect(metadataEmoji).not.toContain('data:image');
    });

    it('keeps generated assistant images as chat-safe summaries in main chat history', () => {
        const { apiMessages } = ChatPrompts.buildMessageHistory([
            msg({
                role: 'assistant',
                type: 'image',
                content: 'data:image/png;base64,very-large-generated-image',
                metadata: {
                    imageId: 'photo-1',
                    visualSummary: '窗边自拍，暖光，近景构图。',
                },
            }),
        ], 10, character, user, []);

        expect(apiMessages[0]?.content).toBe('[2026-04-21 10:30] [你发送过的图片（图片已显示给用户）] 窗边自拍，暖光，近景构图。');
    });

    it('does not leak generated photo director fields into main chat history', () => {
        const { apiMessages } = ChatPrompts.buildMessageHistory([
            msg({
                role: 'assistant',
                type: 'image',
                content: 'data:image/png;base64,very-large-generated-image',
                metadata: {
                    imageId: 'photo-1',
                    caption: '给你看。',
                    visualSummary: [
                        '画面：角色站在窗边，傍晚暖光照在侧脸上。',
                        '镜头：近景自拍构图',
                        '氛围：柔和、私密',
                        '视觉标签：1girl, solo, window light',
                    ].join('\n'),
                    photoMeta: {
                        continuity_summary: '窗边自拍，暖光。',
                        directorResult: {
                            caption: '给你看。',
                            scene_zh: '角色站在窗边，傍晚暖光照在侧脸上。',
                            camera: '近景自拍构图',
                            mood: '柔和、私密',
                            continuity_summary: '窗边自拍，暖光。',
                        },
                    },
                },
            }),
        ], 10, character, user, []);

        expect(apiMessages[0]?.content).toContain('[你发送过的图片（图片已显示给用户）]');
        expect(apiMessages[0]?.content).toContain('配文「给你看。」');
        expect(apiMessages[0]?.content).toContain('后续承接：窗边自拍，暖光。');
        expect(apiMessages[0]?.content).not.toContain('画面：');
        expect(apiMessages[0]?.content).not.toContain('镜头：');
        expect(apiMessages[0]?.content).not.toContain('氛围：');
        expect(apiMessages[0]?.content).not.toContain('视觉标签');
    });

    it('keeps user images as structured image messages', () => {
        const { apiMessages } = ChatPrompts.buildMessageHistory([
            msg({
                id: 1,
                type: 'image',
                content: 'data:image/png;base64,older-user-image',
                metadata: { caption: '上一张图' },
            }),
            msg({
                id: 2,
                type: 'image',
                content: 'data:image/png;base64,latest-user-image',
                metadata: { caption: '最新图片' },
                timestamp: new Date(2026, 3, 21, 10, 31).getTime(),
            }),
        ], 10, character, user, []);

        expect(Array.isArray(apiMessages[0]?.content)).toBe(true);
        expect(apiMessages[0]?.content[1]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,older-user-image' },
        });
        expect(Array.isArray(apiMessages[1]?.content)).toBe(true);
        expect(apiMessages[1]?.content[1]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,latest-user-image' },
        });
    });

    it('keeps a sent image visible to the model when the user follows up with text', () => {
        const { apiMessages } = ChatPrompts.buildMessageHistory([
            msg({
                id: 1,
                type: 'image',
                content: 'data:image/png;base64,user-image',
                metadata: { caption: '刚发的图' },
            }),
            msg({
                id: 2,
                type: 'text',
                content: '看看这个是什么',
                timestamp: new Date(2026, 3, 21, 10, 31).getTime(),
            }),
        ], 10, character, user, []);

        expect(Array.isArray(apiMessages[0]?.content)).toBe(true);
        expect(apiMessages[0]?.content[0]?.text).toContain('[用户发来的图片] 刚发的图');
        expect(apiMessages[0]?.content[1]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,user-image' },
        });
        expect(Array.isArray(apiMessages[1]?.content)).toBe(false);
        expect(apiMessages[1]?.content).toContain('看看这个是什么');
    });

    it('does not duplicate a previous image into later text messages', () => {
        const { apiMessages } = ChatPrompts.buildMessageHistory([
            msg({
                id: 1,
                type: 'image',
                content: 'data:image/png;base64,already-replied-image',
                metadata: { caption: '已经聊过的图' },
            }),
            msg({
                id: 2,
                role: 'assistant',
                type: 'text',
                content: '我看到了。',
                timestamp: new Date(2026, 3, 21, 10, 31).getTime(),
            }),
            msg({
                id: 3,
                type: 'text',
                content: '那继续说刚才的',
                timestamp: new Date(2026, 3, 21, 10, 32).getTime(),
            }),
        ], 10, character, user, []);

        expect(Array.isArray(apiMessages[0]?.content)).toBe(true);
        expect(apiMessages[0]?.content[1]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,already-replied-image' },
        });
        expect(Array.isArray(apiMessages[2]?.content)).toBe(false);
        expect(apiMessages[2]?.content).toContain('那继续说刚才的');
        expect(apiMessages[2]?.content).not.toContain('already-replied-image');
    });

    it('keeps multiple user images as separate structured messages', () => {
        const { apiMessages } = ChatPrompts.buildMessageHistory([
            msg({
                id: 1,
                type: 'image',
                content: 'data:image/png;base64,first-image',
                metadata: { caption: '第一张' },
            }),
            msg({
                id: 2,
                type: 'image',
                content: 'data:image/png;base64,second-image',
                metadata: { caption: '第二张' },
                timestamp: new Date(2026, 3, 21, 10, 31).getTime(),
            }),
            msg({
                id: 3,
                type: 'text',
                content: '看后一张',
                timestamp: new Date(2026, 3, 21, 10, 32).getTime(),
            }),
        ], 10, character, user, []);

        expect(apiMessages[0]?.content[1]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,first-image' },
        });
        expect(apiMessages[1]?.content[1]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,second-image' },
        });
        expect(Array.isArray(apiMessages[2]?.content)).toBe(false);
        expect(apiMessages[2]?.content).toContain('看后一张');
    });

    it('formats text reply context with quoted content and current user content', () => {
        const text = formatMessageForContext(msg({
            role: 'user',
            content: '你要接住我后面这句话',
            replyTo: {
                id: 90,
                name: '糯米',
                content: '你发消息之前都不自己检查一遍的吗。',
                type: 'text',
            },
        }), {
            surface: 'chat',
            charName: '糯米',
        });

        expect(text).toContain('引用回复上下文');
        expect(text).toContain('正在回复糯米的消息');
        expect(text).toContain('你发消息之前都不自己检查一遍的吗。');
        expect(text).toContain('本条消息正文：你要接住我后面这句话');
    });

    it('formats image reply prefixes without leaking raw image URLs', () => {
        const text = formatMessageForContext(msg({
            role: 'user',
            content: '好帅',
            replyTo: {
                id: 91,
                name: '糯米',
                content: 'https://cdn.example.com/generated/window-selfie.webp',
                type: 'image',
                visualSummary: '窗边自拍',
            },
        }), {
            surface: 'chat',
            charName: '糯米',
        });

        expect(text).toContain('正在回复糯米的消息「窗边自拍」');
        expect(text).toContain('好帅');
        expect(text).not.toContain('https://cdn.example.com');
    });

    it('formats generated image reply prefixes without leaking director fields', () => {
        const text = formatMessageForContext(msg({
            role: 'user',
            content: '好帅',
            replyTo: {
                id: 91,
                name: '糯米',
                content: 'https://cdn.example.com/generated/window-selfie.webp',
                type: 'image',
                visualSummary: [
                    '画面：窗边自拍',
                    '镜头：中近景',
                    '氛围：柔和',
                ].join('\n'),
            },
        }), {
            surface: 'chat',
            charName: '糯米',
        });

        expect(text).toContain('正在回复糯米的消息「图片」');
        expect(text).toContain('好帅');
        expect(text).not.toContain('画面：');
        expect(text).not.toContain('镜头：');
        expect(text).not.toContain('氛围：');
    });

    it('keeps secondary model summaries unchanged while group director is low-induction', () => {
        const source = msg({
            role: 'assistant',
            type: 'emoji',
            content: 'sticker-url',
        });
        const secondary = formatMessageForContext(source, {
            surface: 'secondaryModel',
            charName: '糯米',
            emojis: [{ name: '挥手', url: 'sticker-url' }],
        });
        const groupDirector = formatMessageForContext(source, {
            surface: 'groupDirector',
            charName: '糯米',
            emojis: [{ name: '挥手', url: 'sticker-url' }],
        });

        expect(secondary).toBe('[发送了表情包: 挥手]');
        expect(groupDirector).toBe('[[SEND_EMOJI: 挥手]]');
    });

    it('includes hidden soul_reflection with the follow-up constraint', () => {
        const text = formatMessageForContext(msg({
            role: 'assistant',
            type: 'soul_reflection',
            content: '我需要更主动承认刚才的遗漏。',
            metadata: { hiddenFromUser: true, source: 'soul_reflection' },
        }), {
            surface: 'chat',
            charName: '糯米',
        });

        expect(text).toContain('[糯米的回神 - 停下来审视自己]');
        expect(text).toContain('自然地在言行中体现调整');
    });

    it('excludes status bar ecosystem content from context and extraction', () => {
        const statusLike = [
            msg({ metadata: { source: 'inner_voice', innerVoice: '这只是心声展示层。' } }),
            msg({ type: 'status_card' as any, content: '状态卡正文' }),
            msg({
                metadata: {
                    source: 'creative_card',
                    statusBarMode: 'creative',
                    statusCardData: { cardType: 'diary', body: '卡片正文', style: {} },
                },
            }),
            msg({
                metadata: {
                    source: 'custom_status',
                    lastStatusCard: { cardType: 'freeform', body: 'HTML 摘要', style: {} },
                },
            }),
        ];

        for (const message of statusLike) {
            expect(shouldIncludeMessageInContext(message)).toBe(false);
            expect(formatMessageForContext(message, { surface: 'memoryExtraction', charName: '糯米' })).toBeNull();
        }
    });

    it('uses the shared formatter for memory extraction windows', () => {
        const formatted = formatExtractionMessages([
            {
                timestamp: 1,
                role: 'assistant',
                type: 'voice',
                content: '',
                metadata: { sourceText: 'TTS 里的正文不能丢。' },
            },
            {
                timestamp: 2,
                role: 'assistant',
                type: 'soul_reflection',
                content: '我会把刚才的遗漏补回来。',
                metadata: { hiddenFromUser: true, source: 'soul_reflection' },
            },
            {
                timestamp: 3,
                role: 'assistant',
                type: 'status_card',
                content: '状态栏卡片正文不应被提取。',
                metadata: { source: 'creative_card' },
            },
        ], '糯米');

        expect(formatted).toContain('[语音消息] TTS 里的正文不能丢。');
        expect(formatted).toContain('[糯米的回神 - 停下来审视自己]');
        expect(formatted).not.toContain('状态栏卡片正文');
    });
});
