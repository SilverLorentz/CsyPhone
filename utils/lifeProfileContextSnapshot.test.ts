import { describe, expect, it, vi } from 'vitest';
import type { CharacterProfile } from '../types';

vi.mock('./db', () => ({
    DB: {
        getAllAnniversaries: vi.fn(async () => [
            { id: 'anni-1', title: '相识纪念日', date: '2026-05-20', charId: 'char-1' },
        ]),
    },
}));

import { buildLifeProfileContextSnapshot } from './lifeProfileContextSnapshot';

describe('buildLifeProfileContextSnapshot', () => {
    it('includes calendarContext for today-life handoff', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 4, 20, 9, 0, 0));

        const snapshot = await buildLifeProfileContextSnapshot({
            id: 'char-1',
            name: 'Sully',
            avatar: '',
            description: '安静。',
            systemPrompt: '今天保持日常。',
            memories: [],
        } as CharacterProfile, '糯米');

        expect(snapshot.calendarContext).toMatchObject({
            localDate: '2026-05-20',
            todayLabels: [
                { title: '520', kind: 'fixed' },
                { title: '相识纪念日', kind: 'anniversary', charId: 'char-1' },
            ],
        });

        vi.useRealTimers();
    });
});
