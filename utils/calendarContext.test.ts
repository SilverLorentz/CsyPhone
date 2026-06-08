import { describe, expect, it } from 'vitest';
import type { Anniversary } from '../types';
import {
    buildCalendarContext,
    getCalendarDisplayLabels,
    getFixedSpecialDateTitles,
} from './calendarContext';

describe('calendarContext', () => {
    it('marks 2026-05-20 as 520', () => {
        const now = new Date(2026, 4, 20, 9, 0, 0);

        expect(getFixedSpecialDateTitles(now)).toEqual(['520']);
        expect(buildCalendarContext('char-1', [], now).todayLabels).toEqual([
            {
                id: 'fixed-05-20',
                title: '520',
                kind: 'fixed',
                date: '2026-05-20',
            },
        ]);
    });

    it('keeps only current-character anniversaries for today and the next 7 days', () => {
        const anniversaries: Anniversary[] = [
            { id: 'a-today', title: '相识纪念日', date: '2026-05-20', charId: 'char-1' },
            { id: 'a-other', title: '其他角色生日', date: '2026-05-20', charId: 'char-2' },
            { id: 'a-soon', title: '第一次约会', date: '2026-05-23', charId: 'char-1' },
            { id: 'a-late', title: '太远的事', date: '2026-05-29', charId: 'char-1' },
            { id: 'a-past', title: '过去的事', date: '2026-05-19', charId: 'char-1' },
        ];

        const context = buildCalendarContext('char-1', anniversaries, new Date(2026, 4, 20, 9, 0, 0));

        expect(context.todayLabels.map(label => label.title)).toEqual(['520', '相识纪念日']);
        expect(context.upcomingLabels).toEqual([
            {
                id: 'a-soon',
                title: '第一次约会',
                kind: 'anniversary',
                date: '2026-05-23',
                daysUntil: 3,
                charId: 'char-1',
            },
        ]);
    });

    it('limits visible labels and reports the hidden count', () => {
        const labels = buildCalendarContext('char-1', [
            { id: 'a1', title: 'A', date: '2026-05-20', charId: 'char-1' },
            { id: 'a2', title: 'B', date: '2026-05-20', charId: 'char-1' },
            { id: 'a3', title: 'C', date: '2026-05-20', charId: 'char-1' },
        ], new Date(2026, 4, 20, 9, 0, 0)).todayLabels;

        const display = getCalendarDisplayLabels(labels, 3);

        expect(display.visibleLabels.map(label => label.title)).toEqual(['520', 'A', 'B']);
        expect(display.hiddenCount).toBe(1);
    });
});
