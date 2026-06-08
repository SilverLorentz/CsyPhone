import { describe, expect, it } from 'vitest';
import type { LoveShowGuest } from '../types/loveshow';
import {
    createLoveShowWindItems,
    getLoveShowWindEffectHint,
    isUserCenteredLoveShowWindItem,
} from './loveshowWind';

function guest(input: Pick<LoveShowGuest, 'id' | 'source' | 'name' | 'profileSummary'> & Partial<LoveShowGuest>): LoveShowGuest {
    return {
        promoted: input.source === 'user_char',
        roleInShow: '正式嘉宾',
        state: {
            characterId: input.id,
            affection: 0,
            mood: '期待',
            confidence: 50,
            strategy: '观望',
            jealousyTarget: null,
            innerThought: '',
            lastUpdatedScene: '',
        },
        impression: {
            characterId: input.id,
            perceivedTraits: [],
            knownFacts: [],
            tentativeReads: [],
            misconceptions: [],
            impression: '',
            history: [],
        },
        ...input,
    };
}

const guests: LoveShowGuest[] = [
    guest({
        id: 'char-a',
        source: 'user_char',
        characterId: 'char-a',
        name: '阿序',
        profileSummary: '角色库嘉宾',
    }),
    guest({
        id: 'npc-1',
        source: 'program_invited',
        promoted: false,
        programGuestId: 'npc-1',
        npcId: 'npc-1',
        name: '沈既白',
        profileSummary: '节目组邀请嘉宾',
    }),
];

describe('LoveShow wind V0', () => {
    it('keeps wind items centered on the user', () => {
        const items = createLoveShowWindItems({
            guests,
            userName: '小雨',
            day: 1,
            sceneSummary: '阿序在厨房把最后一杯热水递给小雨',
            preferredGuestId: 'char-a',
        });

        expect(items.length).toBeGreaterThan(0);
        expect(items.every(item => isUserCenteredLoveShowWindItem(item, '小雨'))).toBe(true);
        expect(items.some(item => item.body.includes('你') || item.body.includes('小雨'))).toBe(true);
    });

    it('does not create guest-to-guest CP language', () => {
        const items = createLoveShowWindItems({
            guests,
            userName: '小雨',
            day: 2,
            sceneSummary: '两位嘉宾都在等小雨开口',
        });
        const text = items.map(item => `${item.title} ${item.body} ${item.effectHint || ''}`).join('\n');

        expect(text).not.toContain('谁和谁最配');
        expect(text).not.toContain('嘉宾 CP');
        expect(text).not.toContain('嘉宾互选心动对象');
        expect(text).not.toContain('×');
        expect(isUserCenteredLoveShowWindItem({
            title: '危险风向',
            body: '阿序和沈既白谁和谁最配',
        }, '小雨')).toBe(false);
    });

    it('can point to a real character or a program-invited guest', () => {
        const characterWind = createLoveShowWindItems({
            guests,
            userName: '小雨',
            day: 1,
            preferredGuestId: 'char-a',
        });
        const npcWind = createLoveShowWindItems({
            guests,
            userName: '小雨',
            day: 1,
            preferredGuestId: 'npc-1',
        });

        expect(characterWind[0]?.guestId).toBe('char-a');
        expect(npcWind[0]?.guestId).toBe('npc-1');
        expect(getLoveShowWindEffectHint(npcWind)).toContain('沈既白');
    });
});
