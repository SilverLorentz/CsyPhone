import { describe, expect, it } from 'vitest';
import {
    buildVoiceCallRecentContextMessages,
    buildVoiceCallRecentContextTranscript,
} from '../apps/voicecall/voiceCallRecentContext';
import type { Message } from '../types';

function createMessage(overrides: Partial<Message>): Message {
    return {
        id: 1,
        charId: 'char-1',
        role: 'user',
        type: 'text',
        content: '',
        timestamp: 1,
        ...overrides,
    };
}

describe('voice call recent context', () => {
    it('serializes recent chat messages for pre-call context including assistant TTS voice', () => {
        const messages: Message[] = [
            createMessage({ id: 1, role: 'user', type: 'text', content: '   早上好   ' }),
            createMessage({ id: 2, role: 'assistant', type: 'voice', content: '', metadata: { sourceText: '这条是 TTS 语音，也要保留' } }),
            createMessage({ id: 3, role: 'user', type: 'voice', content: '我刚刚说过了', metadata: { source: 'user-recording' } }),
            createMessage({ id: 4, role: 'assistant', type: 'image', content: 'https://example.com/a.png' }),
            createMessage({ id: 5, role: 'assistant', type: 'text', content: '那我们一会儿电话里接着说。' }),
        ];

        const recentContext = buildVoiceCallRecentContextMessages(messages, { limit: 50 });

        expect(recentContext).toEqual([
            {
                id: 1,
                charId: 'char-1',
                role: 'user',
                type: 'text',
                content: '早上好',
                timestamp: 1,
            },
            {
                id: 2,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '[语音消息] 这条是 TTS 语音，也要保留',
                timestamp: 1,
            },
            {
                id: 3,
                charId: 'char-1',
                role: 'user',
                type: 'text',
                content: '[语音消息] 我刚刚说过了',
                timestamp: 1,
            },
            {
                id: 4,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '[发送了一张图片]',
                timestamp: 1,
            },
            {
                id: 5,
                charId: 'char-1',
                role: 'assistant',
                type: 'text',
                content: '那我们一会儿电话里接着说。',
                timestamp: 1,
            },
        ]);

        expect(buildVoiceCallRecentContextTranscript(recentContext, '糯米', 'Char')).toBe([
            '糯米: 早上好',
            'Char: [语音消息] 这条是 TTS 语音，也要保留',
            '糯米: [语音消息] 我刚刚说过了',
            'Char: [发送了一张图片]',
            'Char: 那我们一会儿电话里接着说。',
        ].join('\n'));
    });

    it('keeps only the latest eligible messages and respects hideBeforeMessageId', () => {
        const messages = Array.from({ length: 55 }, (_, index) => createMessage({
            id: index + 1,
            timestamp: index + 1,
            role: index % 2 === 0 ? 'user' : 'assistant',
            type: 'text',
            content: `消息 ${index + 1}`,
        }));

        const recentContext = buildVoiceCallRecentContextMessages(messages, {
            limit: 50,
            hideBeforeMessageId: 10,
        });

        expect(recentContext).toHaveLength(46);
        expect(recentContext[0]?.id).toBe(10);
        expect(recentContext[recentContext.length - 1]?.id).toBe(55);
    });

    it('ignores stale imported hideBeforeMessageId values that are beyond all local messages', () => {
        const messages = [
            createMessage({ id: 1, role: 'user', type: 'text', content: '导入后新消息' }),
            createMessage({ id: 2, role: 'assistant', type: 'text', content: '导入后新回复' }),
        ];

        const recentContext = buildVoiceCallRecentContextMessages(messages, {
            limit: 50,
            hideBeforeMessageId: 999999,
        });

        expect(recentContext.map(message => message.id)).toEqual([1, 2]);
    });
});
