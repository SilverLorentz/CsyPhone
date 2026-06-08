import { describe, expect, it } from 'vitest';
import { buildCurrentLifeAnchorForCharacter } from '../utils/lifeAnchor';
import type { CharacterProfile, Message } from '../types';

function char(systemPrompt: string): CharacterProfile {
    return {
        id: 'char-life-anchor',
        name: '测试角色',
        avatar: '',
        description: '',
        systemPrompt,
        memories: [],
    } as CharacterProfile;
}

function noonLocal(year: number, monthIndex: number, day: number): number {
    return new Date(year, monthIndex, day, 12, 0, 0).getTime();
}

describe('frontend life anchor', () => {
    it('does not treat every weekday as work when schedule says random two days', () => {
        const profile = char('周一到周五随机两天才上班，其他时间会上课出去玩会宅在家。');
        const anchors = [27, 28, 29, 30, 1].map((day, index) => {
            const month = index === 4 ? 4 : 3;
            return buildCurrentLifeAnchorForCharacter(profile, [], noonLocal(2026, month, day));
        });

        expect(anchors.filter(anchor => anchor.status === 'work')).toHaveLength(2);
        expect(anchors.filter(anchor => anchor.status === 'rest')).toHaveLength(3);
        expect(anchors.every(anchor => anchor.selectedWorkdays?.length === 2)).toBe(true);
    });

    it('lets same-day user correction override older shop/work hints', () => {
        const now = noonLocal(2026, 3, 29);
        const messages: Message[] = [
            {
                id: 1,
                charId: 'char-life-anchor',
                role: 'assistant',
                content: '我还在店里',
                timestamp: now - 30 * 60_000,
            } as Message,
            {
                id: 2,
                charId: 'char-life-anchor',
                role: 'user',
                content: '明明今天是休息日，你在家吃饭吧',
                timestamp: now,
            } as Message,
        ];

        const anchor = buildCurrentLifeAnchorForCharacter(char('周一到周五随机两天才上班'), messages, now);

        expect(anchor.status).toBe('rest');
        expect(anchor.sourceDetail).toBe('recent_user_correction_or_current_fact');
        expect(anchor.conflictHint).toContain('过去记录');
    });

    it('does not let assistant shop claims override an explicit rest schedule', () => {
        const now = noonLocal(2026, 3, 29);
        const messages: Message[] = [{
            id: 1,
            charId: 'char-life-anchor',
            role: 'assistant',
            content: '我在店里，刚下班',
            timestamp: now,
        } as Message];

        const anchor = buildCurrentLifeAnchorForCharacter(
            char('今天休息，不用上班，会宅在家。'),
            messages,
            now,
        );

        expect(anchor.status).toBe('rest');
        expect(anchor.sourceDetail).toBe('character_schedule_explicit_today');
    });
});
