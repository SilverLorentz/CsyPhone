import { describe, expect, it } from 'vitest';
import type { Message } from '../types';
import {
    formatMemoryArchiveLine,
    selectMessagesForMemoryArchive,
} from '../utils/archiveMessageSelector';

const baseTime = new Date('2026-05-19T12:00:00+08:00').getTime();

function msg(overrides: Partial<Message>): Message {
    return {
        id: overrides.id || 1,
        charId: 'char-1',
        role: overrides.role || 'assistant',
        type: overrides.type || 'text',
        content: overrides.content || '',
        timestamp: overrides.timestamp || baseTime + (overrides.id || 1) * 1000,
        metadata: overrides.metadata,
    };
}

function selectIds(messages: Message[]): number[] {
    return selectMessagesForMemoryArchive(messages).map(message => message.id);
}

describe('archiveMessageSelector', () => {
    it('keeps summary bridge and removes covered Date raw messages', () => {
        const messages = [
            msg({ id: 1, role: 'user', content: 'date raw user', metadata: { source: 'date' } }),
            msg({ id: 2, role: 'assistant', content: 'date raw assistant', metadata: { source: 'date' } }),
            msg({
                id: 3,
                role: 'system',
                content: 'date summary bridge',
                metadata: {
                    source: 'date',
                    hiddenFromUser: true,
                    isDateContextBridge: true,
                    bridgeType: 'summary',
                    coveredMsgIds: [1, 2],
                    sessionStartMsgId: 1,
                },
            }),
        ];

        expect(selectIds(messages)).toEqual([3]);
    });

    it('keeps internal Date summary and removes covered raw messages', () => {
        const messages = [
            msg({ id: 1, role: 'user', content: 'raw one', metadata: { source: 'date' } }),
            msg({ id: 2, role: 'assistant', content: 'raw two', metadata: { source: 'date' } }),
            msg({
                id: 3,
                role: 'system',
                content: 'internal summary',
                metadata: {
                    source: 'date',
                    hiddenFromUser: true,
                    isSummary: true,
                    coveredMsgIds: [1, 2],
                    sessionStartMsgId: 1,
                },
            }),
        ];

        expect(selectIds(messages)).toEqual([3]);
    });

    it('prefers summary bridge over raw bridge for the same session', () => {
        const messages = [
            msg({ id: 1, role: 'user', content: 'raw one', metadata: { source: 'date' } }),
            msg({
                id: 2,
                role: 'system',
                content: 'raw bridge',
                metadata: {
                    source: 'date',
                    hiddenFromUser: true,
                    isDateContextBridge: true,
                    bridgeType: 'raw',
                    coveredMsgIds: [1],
                    sessionStartMsgId: 1,
                },
            }),
            msg({
                id: 3,
                role: 'system',
                content: 'summary bridge',
                metadata: {
                    source: 'date',
                    hiddenFromUser: true,
                    isDateContextBridge: true,
                    bridgeType: 'summary',
                    coveredMsgIds: [1],
                    sessionStartMsgId: 1,
                },
            }),
        ];

        expect(selectIds(messages)).toEqual([3]);
    });

    it('prefers summary bridge over its linked internal summary', () => {
        const messages = [
            msg({ id: 1, role: 'user', content: 'raw one', metadata: { source: 'date' } }),
            msg({
                id: 2,
                role: 'system',
                content: 'internal summary',
                metadata: {
                    source: 'date',
                    hiddenFromUser: true,
                    isSummary: true,
                    coveredMsgIds: [1],
                    sessionStartMsgId: 1,
                },
            }),
            msg({
                id: 3,
                role: 'system',
                content: 'summary bridge',
                metadata: {
                    source: 'date',
                    hiddenFromUser: true,
                    isDateContextBridge: true,
                    bridgeType: 'summary',
                    summarySourceMsgId: 2,
                    coveredMsgIds: [1],
                    sessionStartMsgId: 1,
                },
            }),
        ];

        expect(selectIds(messages)).toEqual([3]);
    });

    it('keeps raw bridge when no summary exists and removes covered raw messages', () => {
        const messages = [
            msg({ id: 1, role: 'user', content: 'raw one', metadata: { source: 'date' } }),
            msg({ id: 2, role: 'assistant', content: 'raw two', metadata: { source: 'date' } }),
            msg({
                id: 3,
                role: 'system',
                content: 'raw bridge',
                metadata: {
                    source: 'date',
                    hiddenFromUser: true,
                    isDateContextBridge: true,
                    bridgeType: 'raw',
                    coveredMsgIds: [1, 2],
                    sessionStartMsgId: 1,
                },
            }),
        ];

        expect(selectIds(messages)).toEqual([3]);
    });

    it('keeps Date raw messages when no summary or bridge exists', () => {
        const messages = [
            msg({ id: 1, role: 'user', content: 'raw one', metadata: { source: 'date' } }),
            msg({ id: 2, role: 'assistant', content: 'raw two', metadata: { source: 'date' } }),
        ];

        expect(selectIds(messages)).toEqual([1, 2]);
    });

    it('drops unsynced Theater raw messages and internal summaries', () => {
        const messages = [
            msg({ id: 1, role: 'user', content: 'hello' }),
            msg({ id: 2, role: 'user', content: 'theater raw user', metadata: { source: 'theater' } }),
            msg({ id: 3, role: 'assistant', content: 'theater raw assistant', metadata: { source: 'theater' } }),
            msg({
                id: 4,
                role: 'system',
                content: 'theater internal summary',
                metadata: {
                    source: 'theater',
                    hiddenFromUser: true,
                    isSummary: true,
                    coveredMsgIds: [2, 3],
                    sessionStartMsgId: 2,
                },
            }),
        ];

        expect(selectIds(messages)).toEqual([1]);
    });

    it('keeps synced Theater summary bridge and removes covered raw messages', () => {
        const messages = [
            msg({ id: 1, role: 'user', content: 'theater raw user', metadata: { source: 'theater' } }),
            msg({ id: 2, role: 'assistant', content: 'theater raw assistant', metadata: { source: 'theater' } }),
            msg({
                id: 3,
                role: 'system',
                content: 'theater summary bridge',
                metadata: {
                    source: 'theater',
                    hiddenFromUser: true,
                    isDateContextBridge: true,
                    bridgeType: 'summary',
                    coveredMsgIds: [1, 2],
                    sessionStartMsgId: 1,
                },
            }),
        ];

        expect(selectIds(messages)).toEqual([3]);
    });

    it('leaves ordinary chat and call logs unchanged', () => {
        const messages = [
            msg({ id: 1, role: 'user', content: 'hello' }),
            msg({ id: 2, role: 'assistant', type: 'call_log', content: '[电话记录]\nhi\n[通话结束]' }),
        ];

        expect(selectIds(messages)).toEqual([1, 2]);
        expect(formatMemoryArchiveLine(messages[1], {
            charName: 'Sully',
            userName: '屿屿',
        })).toBe('[电话记录]\nhi\n[通话结束]');
    });

    it('can preserve Chat archive image and emoji formatting', () => {
        const imageMessage = msg({ id: 1, role: 'user', type: 'image', content: 'img.jpg' });
        const emojiMessage = msg({ id: 2, role: 'assistant', type: 'emoji', content: '/stickers/love.png' });

        expect(formatMemoryArchiveLine(imageMessage, {
            charName: 'Sully',
            userName: '屿屿',
            imageLabel: '[Image]',
            formatEmoji: false,
            formatTime: () => '12:00',
        })).toBe('[12:00] 屿屿: [Image]');
        expect(formatMemoryArchiveLine(emojiMessage, {
            charName: 'Sully',
            userName: '屿屿',
            imageLabel: '[Image]',
            formatEmoji: false,
            formatTime: () => '12:00',
        })).toBe('[12:00] Sully: /stickers/love.png');
    });

    it('formats Date and Theater summaries with archive labels', () => {
        const dateSummary = msg({
            id: 1,
            role: 'system',
            content: 'summary',
            metadata: { source: 'date', isDateContextBridge: true, bridgeType: 'summary' },
        });
        const theaterSummary = msg({
            id: 2,
            role: 'system',
            content: 'summary',
            metadata: { source: 'theater', isSummary: true },
        });

        expect(formatMemoryArchiveLine(dateSummary, {
            charName: 'Sully',
            userName: '屿屿',
            formatTime: () => '12:00',
        })).toBe('[12:00] [线下见面总结]: summary');
        expect(formatMemoryArchiveLine(theaterSummary, {
            charName: 'Sully',
            userName: '屿屿',
            formatTime: () => '12:00',
        })).toBe('[12:00] [约会总结]: summary');
    });
});
