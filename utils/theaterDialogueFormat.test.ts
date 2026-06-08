import { describe, expect, it } from 'vitest';
import {
    parseTheaterAssistantBeatReplyGroups,
    parseTheaterAssistantPages,
    parseTheaterUserPages,
    resolveTheaterPageIndexAfterMessagesChange,
    type TheaterVNPage,
} from './theaterDialogueFormat';

const userBeats = [
    { kind: 'speech' as const, text: '第一句' },
    { kind: 'speech' as const, text: '第二句' },
    { kind: 'speech' as const, text: '第三句' },
];

function interleaveUserAndAssistantReplies(userPages: TheaterVNPage[], assistantMsgId: number): TheaterVNPage[] {
    const replyParse = parseTheaterAssistantBeatReplyGroups(
        [
            '[happy] <beat:1> “回应第一句”',
            '[happy] <beat:2> “回应第二句”',
            '[happy] <beat:3> “回应第三句”',
        ].join('\n'),
        assistantMsgId,
    );
    const repliesByBeat = new Map(replyParse.groups.map(group => [group.beatIndex, group.pages]));

    return userPages.flatMap((page, index) => [
        page,
        ...(repliesByBeat.get(index + 1) || []),
    ]);
}

describe('resolveTheaterPageIndexAfterMessagesChange', () => {
    it('preserves the first user beat when assistant beat replies are inserted between user beats', () => {
        const userMsgId = 10;
        const assistantMsgId = 11;
        const previousPages = parseTheaterUserPages('', userMsgId, userBeats);
        const nextPages = interleaveUserAndAssistantReplies(previousPages, assistantMsgId);

        const nextIndex = resolveTheaterPageIndexAfterMessagesChange(
            previousPages,
            nextPages,
            0,
            new Set([String(userMsgId)]),
            [
                { id: userMsgId, role: 'user' },
                { id: assistantMsgId, role: 'assistant' },
            ],
        );

        expect(nextIndex).toBe(0);
        expect(nextPages[nextIndex].text).toBe('第一句');
    });

    it('keeps the currently viewed user beat stable when assistant replies reflow the same turn', () => {
        const userMsgId = 20;
        const assistantMsgId = 21;
        const previousPages = parseTheaterUserPages('', userMsgId, userBeats);
        const nextPages = interleaveUserAndAssistantReplies(previousPages, assistantMsgId);

        const nextIndex = resolveTheaterPageIndexAfterMessagesChange(
            previousPages,
            nextPages,
            2,
            new Set([String(userMsgId)]),
            [
                { id: userMsgId, role: 'user' },
                { id: assistantMsgId, role: 'assistant' },
            ],
        );

        expect(nextPages[nextIndex].text).toBe('第三句');
    });

    it('jumps to the first page of a newly sent user message', () => {
        const assistantPages = parseTheaterAssistantPages('[normal] 夜风从窗边吹过。', 1);
        const userPages = parseTheaterUserPages('', 2, userBeats);
        const nextPages = [...assistantPages, ...userPages];

        const nextIndex = resolveTheaterPageIndexAfterMessagesChange(
            assistantPages,
            nextPages,
            0,
            new Set(['1']),
            [
                { id: 1, role: 'assistant' },
                { id: 2, role: 'user' },
            ],
        );

        expect(nextIndex).toBe(assistantPages.length);
        expect(nextPages[nextIndex].text).toBe('第一句');
    });

    it('jumps to appended assistant pages when there is no interleaved user turn to preserve', () => {
        const previousPages = parseTheaterAssistantPages('[normal] 开场。', 1);
        const assistantPages = parseTheaterAssistantPages('[happy] “我们走吧。”', 2);
        const nextPages = [...previousPages, ...assistantPages];

        const nextIndex = resolveTheaterPageIndexAfterMessagesChange(
            previousPages,
            nextPages,
            0,
            new Set(['1']),
            [
                { id: 1, role: 'assistant' },
                { id: 2, role: 'assistant' },
            ],
        );

        expect(nextIndex).toBe(previousPages.length);
        expect(nextPages[nextIndex].text).toBe('我们走吧。');
    });
});
