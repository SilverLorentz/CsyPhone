import { describe, expect, it } from 'vitest';
import type { LoveShowGuest, LoveShowTheaterTicket, LoveShowWindItem } from '../types/loveshow';
import type { TheaterLocation } from '../types';
import {
    createLoveShowTheaterHotPost,
    createLoveShowTheaterEcho,
    createLoveShowTheaterResult,
    createLoveShowTheaterScene,
    createLoveShowTheaterTicket,
    getLoveShowEpisodeDayId,
    hasLoveShowTheaterEntryForDay,
    isUserCenteredTheaterText,
    mergeLoveShowTheaterEffectIntoAtmosphere,
    resolveLoveShowTheaterLocationId,
    validateLoveShowTheaterGuestSelection,
} from './loveshowTheater';
import { getLoveShowTheaterLocations, pickLoveShowTheaterLocationId } from './loveshowTheaterLocations';

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
    guest({
        id: 'char-b',
        source: 'user_char',
        characterId: 'char-b',
        name: '白榆',
        profileSummary: '角色库嘉宾',
    }),
];

const windItems: LoveShowWindItem[] = [
    {
        id: 'wind-1',
        type: 'solo_date',
        guestId: 'char-a',
        title: '观众正在起哄',
        body: '他们想看你和阿序单独聊聊。',
        effectHint: '下一轮镜头会更容易把阿序推到你身边。',
    },
    {
        id: 'wind-2',
        type: 'most_obvious',
        guestId: 'npc-1',
        title: '风向揭晓',
        body: '今天最藏不住的人，好像是沈既白。',
    },
];

const location: TheaterLocation = {
    id: 'convenience',
    name: '24小时便利店',
    description: '灯火通明的便利店。',
    tags: ['daily', 'indoor'],
    isPreset: true,
    visitCount: 0,
};

function expectTicket(ticket: LoveShowTheaterTicket | null): asserts ticket is LoveShowTheaterTicket {
    expect(ticket).not.toBeNull();
}

describe('LoveShow theater bridge', () => {
    it('provides a LoveShow-specific mobile ticket location set', () => {
        const locations = getLoveShowTheaterLocations();

        expect(locations.length).toBeGreaterThanOrEqual(12);
        expect(locations.some(item => item.name === '信号露台')).toBe(true);
        expect(locations.some(item => item.name === '单采间门外')).toBe(true);
        expect(locations.filter(item => item.description.includes('镜头') || item.description.includes('节目') || item.description.includes('嘉宾') || item.description.includes('片段')).length).toBeGreaterThanOrEqual(10);
        expect(pickLoveShowTheaterLocationId('season-1-day-1')).toBeTruthy();
    });

    it('can generate a solo heart-fragment ticket', () => {
        const ticket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'wind',
            windItems: [windItems[0]],
        });

        expectTicket(ticket);
        expect(ticket.mode).toBe('solo');
        expect(ticket.requiredGuestCount).toBe(1);
        expect(ticket.suggestedGuestIds).toEqual(['char-a']);
        expect(ticket.episodeDayId).toBe(getLoveShowEpisodeDayId('season-1', 1));
        expect(ticket.suggestedGuestRefs?.[0]).toMatchObject({
            guestId: 'char-a',
            guestType: 'cast',
            displayName: '阿序',
        });
        expect(ticket.title).toContain('单独时间');
    });

    it('can generate a triangle heart-fragment ticket', () => {
        const ticket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 2,
            guests,
            source: 'wind',
            mode: 'triangle',
            windItems,
        });

        expectTicket(ticket);
        expect(ticket.mode).toBe('triangle');
        expect(ticket.requiredGuestCount).toBe(2);
        expect(ticket.suggestedGuestIds).toEqual(['char-a', 'npc-1']);
        expect(ticket.suggestedGuestRefs?.map(ref => ref.guestType)).toEqual(['cast', 'program_invited']);
        expect(ticket.description).toContain('三人片段');
    });

    it('validates solo and triangle guest counts', () => {
        const solo = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'manual',
            force: true,
        });
        const triangle = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'manual',
            mode: 'triangle',
            force: true,
        });
        expectTicket(solo);
        expectTicket(triangle);

        expect(validateLoveShowTheaterGuestSelection(solo, ['char-a']).ok).toBe(true);
        expect(validateLoveShowTheaterGuestSelection(solo, ['char-a', 'npc-1']).ok).toBe(false);
        expect(validateLoveShowTheaterGuestSelection(triangle, ['char-a', 'npc-1']).ok).toBe(true);
        expect(validateLoveShowTheaterGuestSelection(triangle, ['char-a']).ok).toBe(false);
    });

    it('ticket can point to a real character or a program-invited guest', () => {
        const realTicket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'notice',
            suggestedGuestIds: ['char-b'],
        });
        const npcTicket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'notice',
            suggestedGuestIds: ['npc-1'],
        });

        expect(realTicket?.suggestedGuestIds).toEqual(['char-b']);
        expect(npcTicket?.suggestedGuestIds).toEqual(['npc-1']);
        expect(npcTicket?.suggestedGuestRefs?.[0]).toMatchObject({
            guestId: 'npc-1',
            guestType: 'program_invited',
            displayName: '沈既白',
        });
    });

    it('uses the director suggested location, or a stable fallback when missing', () => {
        const suggestedTicket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'manual',
            force: true,
            suggestedLocationId: 'kitchen_island',
        });
        const fallbackTicket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 2,
            guests,
            source: 'manual',
            force: true,
        });
        expectTicket(suggestedTicket);
        expectTicket(fallbackTicket);

        expect(resolveLoveShowTheaterLocationId(suggestedTicket)).toBe('kitchen_island');
        expect(resolveLoveShowTheaterLocationId(fallbackTicket)).toBe(pickLoveShowTheaterLocationId(fallbackTicket.id));
        expect(resolveLoveShowTheaterLocationId(fallbackTicket)).toBe(resolveLoveShowTheaterLocationId(fallbackTicket));
    });

    it('creates a real active LoveShow scene from a heart-fragment ticket', () => {
        const ticket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 3,
            guests,
            source: 'wind',
            mode: 'triangle',
            windItems,
            suggestedLocationId: location.id,
            effectHint: '下一场镜头会更在意用户把话递给谁。',
        });
        expectTicket(ticket);

        const scene = createLoveShowTheaterScene({
            ticket,
            guestIds: ['char-a', 'npc-1'],
            location,
        });

        expect(scene.id).toBe(`theater_scene_${ticket.id}`);
        expect(scene.status).toBe('active');
        expect(scene.dayNumber).toBe(3);
        expect(scene.locationId).toBe(location.id);
        expect(scene.locationName).toBe(location.name);
        expect(scene.characterIds).toEqual(['char-a', 'npc-1']);
        expect(scene.atmosphere).toContain('三人片段');
        expect(scene.atmosphere).toContain('灯火通明的便利店');
        expect(scene.atmosphere).not.toContain('导演提示');
        expect(scene.atmosphere).not.toContain('用户的注意力落点');
        expect(scene.atmosphere).not.toContain('CP');
    });

    it('only generates one ticket for the same LoveShow episode day', () => {
        const ticket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'wind',
            windItems: [windItems[0]],
            createdAt: 111,
        });
        expectTicket(ticket);

        expect(hasLoveShowTheaterEntryForDay([ticket], 'season-1', 1)).toBe(true);
        expect(hasLoveShowTheaterEntryForDay([ticket], 'season-1', 2)).toBe(false);

        const duplicate = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'wind',
            windItems: [windItems[1]],
            existingDayEntries: [ticket],
        });

        expect(duplicate).toBeNull();
    });

    it('triangle does not generate guest-to-guest CP semantics', () => {
        const ticket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 2,
            guests,
            source: 'wind',
            mode: 'triangle',
            windItems,
        });

        expectTicket(ticket);
        const text = `${ticket.title} ${ticket.description} ${ticket.effectHint || ''}`;
        expect(text).not.toContain('谁和谁最配');
        expect(text).not.toContain('嘉宾 CP');
        expect(text).not.toContain('互选心动');
        expect(isUserCenteredTheaterText('阿序和沈既白谁和谁最配')).toBe(false);
    });

    it('can generate a heart echo from a theater result', () => {
        const ticket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'wind',
            windItems: [windItems[0]],
        });
        expectTicket(ticket);
        const result = createLoveShowTheaterResult({
            ticket,
            guestIds: ['char-a'],
            guests,
            location,
            summary: '阿序在便利店灯下把热饮推给你，两个人都没有急着把话说满。',
        });
        const echo = createLoveShowTheaterEcho(result, guests, location);

        expect(result.guestRefs[0]).toMatchObject({ guestId: 'char-a', guestType: 'cast', displayName: '阿序' });
        expect(result.locationName).toBe('24小时便利店');
        expect(echo.title).toContain('心动回声');
        expect(echo.body).toContain('便利店');
        expect(echo.guestRefs[0]).toMatchObject({ guestId: 'char-a', guestType: 'cast', displayName: '阿序' });
        expect(echo.echoText).toBe(echo.body);
        expect(echo.effectHint).toBeTruthy();
    });

    it('program-invited guests can be archived into echo, memory copy, and hot posts by ref', () => {
        const ticket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'notice',
            suggestedGuestIds: ['npc-1'],
        });
        expectTicket(ticket);

        const result = createLoveShowTheaterResult({
            ticket,
            guestIds: ['npc-1'],
            guests,
            location,
            summary: '沈既白在便利店灯下替你挡住门口的冷风，话说得很轻。',
            createdAt: 222,
        });
        const echo = createLoveShowTheaterEcho(result, guests, location);
        const hotPost = createLoveShowTheaterHotPost({
            result,
            userName: '你',
            id: 'post-1',
        });

        expect(result.guestRefs[0]).toMatchObject({ guestId: 'npc-1', guestType: 'program_invited', displayName: '沈既白' });
        expect(result.memoryBody).toContain('沈既白');
        expect(echo.guestRefs[0]).toMatchObject(result.guestRefs[0]);
        expect(hotPost.guestRefs?.[0]).toMatchObject(result.guestRefs[0]);
        expect(hotPost.content).toContain('沈既白');
    });

    it('effectHint stays out of public atmosphere copy', () => {
        const atmosphere = mergeLoveShowTheaterEffectIntoAtmosphere(
            '镜头正在记录你的选择',
            '谁和谁最配，失败者淘汰出局',
        );

        expect(atmosphere).toBe('镜头正在记录你的选择');
        expect(atmosphere).not.toContain('心动片段余波');
        expect(atmosphere).not.toContain('淘汰');
        expect(atmosphere).not.toContain('出局');

        expect(mergeLoveShowTheaterEffectIntoAtmosphere(
            '镜头正在记录你的选择 心动片段余波：下一轮镜头会更容易把阿序推到你身边。',
            '下一轮镜头会更容易把阿序推到你身边。',
        )).toBe('镜头正在记录你的选择');
    });

    it('removes stale theater aftermath instead of stacking it', () => {
        const first = mergeLoveShowTheaterEffectIntoAtmosphere(
            '镜头正在记录你的选择',
            '下一轮镜头会更容易把阿序推到你身边。',
        );
        const second = mergeLoveShowTheaterEffectIntoAtmosphere(
            first,
            '沈既白会获得一次主动靠近你的机会。',
        );
        const duplicate = mergeLoveShowTheaterEffectIntoAtmosphere(
            second,
            '沈既白会获得一次主动靠近你的机会。',
        );

        expect(first).toBe('镜头正在记录你的选择');
        expect(second).toBe('镜头正在记录你的选择');
        expect(duplicate).toBe('镜头正在记录你的选择');
        expect(second).not.toContain('阿序推到你身边');
        expect(second).not.toContain('心动片段余波');
        expect(duplicate).not.toContain('沈既白');
    });

    it('does not force a ticket when there is no suitable trigger', () => {
        const ticket = createLoveShowTheaterTicket({
            seasonId: 'season-1',
            day: 1,
            guests,
            source: 'wind',
            windItems: [],
        });

        expect(ticket).toBeNull();
    });
});
