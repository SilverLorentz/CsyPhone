import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterProfile } from '../types';
import type { CharacterState, LoveShowScene, NpcProfile } from '../types/loveshow';
import {
    clearLoveShowCastingConfirmation,
    isLoveShowSeasonCastingConfirmed,
    LOVE_SHOW_DEFAULT_GUESTS,
    loveShowGuestToRuntimeCharacter,
    npcToLoveShowGuest,
    resolveLoveShowGuestRoster,
    saveLoveShowCastingConfirmation,
    shouldReuseLoveShowNpcsForCastingPreview,
} from './loveshowCast';
import { createSeason } from './loveshowEngine';
import { LOVE_SHOW_COPY } from './loveshowCopy';
import {
    buildDirectorBeatPrompt,
    buildDirectorMissionPrompt,
    buildLoveShowPreamble,
    buildMultiCastLoveShowPreamble,
    buildNpcGeneratorPrompt,
    buildSocialPostsPrompt,
} from './loveshowPrompts';

function character(id: string, name: string): CharacterProfile {
    return {
        id,
        name,
        avatar: '',
        description: `${name} 的简介`,
        systemPrompt: `${name} 的人设`,
        memories: [],
    };
}

function npc(id: string, name: string): NpcProfile {
    return {
        id,
        name,
        age: 27,
        job: '纪录片剪辑师',
        memorableDetail: '随身带一本皱掉的场记本',
        sampleLine: '我先听你说完。',
        motivation: '想试着把注意力从工作里移开，认真靠近某个人。',
        approach: '观望',
        appearance: '二十七岁，窄长脸，黑色短发，眉眼安静，高鼻梁，身形清瘦，肤色偏白，手指修长',
        generatedPrompt: `${name} 是正式嘉宾，所有互动围绕用户展开。`,
    };
}

const characters = [
    character('char-a', '阿序'),
    character('char-b', '白榆'),
    character('char-c', '迟野'),
    character('char-d', '段星'),
    character('char-e', '额外角色'),
    character('char-f', '第六角色'),
];

describe('LoveShow guest roster', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('defaults to five guests and does not call NPC generation when all slots are real guests', async () => {
        const createNpcs = vi.fn();

        const roster = await resolveLoveShowGuestRoster({
            characters,
            activeCharacterId: 'char-a',
            lockedCharacterIds: ['char-b', 'char-c', 'char-d', 'char-e'],
            createNpcs,
        });

        expect(createNpcs).not.toHaveBeenCalled();
        expect(roster.guests).toHaveLength(LOVE_SHOW_DEFAULT_GUESTS);
        expect(roster.guests.map(guest => guest.id)).toEqual(['char-a', 'char-b', 'char-c', 'char-d', 'char-e']);
        expect(roster.guests.every(guest => guest.source === 'user_char')).toBe(true);
        expect(roster.npcs).toHaveLength(0);
    });

    it('fills intentional empty roster slots with NPC guests even when more real characters exist', async () => {
        const createNpcs = vi.fn().mockResolvedValue([
            npc('npc-1', '沈既白'),
            npc('npc-2', '林见川'),
        ]);

        const roster = await resolveLoveShowGuestRoster({
            characters,
            activeCharacterId: 'char-a',
            lockedCharacterIds: ['char-b', 'char-c'],
            createNpcs,
        });

        expect(createNpcs).toHaveBeenCalledWith(expect.objectContaining({ neededCount: 2 }));
        expect(roster.guests).toHaveLength(LOVE_SHOW_DEFAULT_GUESTS);
        expect(roster.guests.map(guest => guest.source)).toEqual(['user_char', 'user_char', 'user_char', 'program_invited', 'program_invited']);
        expect(roster.npcs.map(item => item.id)).toEqual(['npc-1', 'npc-2']);
        expect(roster.guests.every(guest => guest.roleInShow === '正式嘉宾')).toBe(true);
    });

    it('can target four guests', async () => {
        const roster = await resolveLoveShowGuestRoster({
            characters,
            activeCharacterId: 'char-a',
            lockedCharacterIds: ['char-b', 'char-c', 'char-d'],
            targetGuestCount: 4,
            createNpcs: vi.fn(),
        });

        expect(roster.guests.map(guest => guest.id)).toEqual(['char-a', 'char-b', 'char-c', 'char-d']);
        expect(roster.npcs).toHaveLength(0);
    });

    it('can target six guests', async () => {
        const createNpcs = vi.fn().mockResolvedValue([
            npc('npc-1', '沈既白'),
        ]);

        const roster = await resolveLoveShowGuestRoster({
            characters,
            activeCharacterId: 'char-a',
            lockedCharacterIds: ['char-b', 'char-c', 'char-d', 'char-e'],
            targetGuestCount: 6,
            createNpcs,
        });

        expect(createNpcs).toHaveBeenCalledWith(expect.objectContaining({ neededCount: 1 }));
        expect(roster.guests).toHaveLength(6);
        expect(roster.guests.map(guest => guest.id)).toEqual(['char-a', 'char-b', 'char-c', 'char-d', 'char-e', 'npc-1']);
    });

    it('does not duplicate the current character when it is also locked', async () => {
        const roster = await resolveLoveShowGuestRoster({
            characters,
            activeCharacterId: 'char-a',
            lockedCharacterIds: ['char-a', 'char-b'],
            existingNpcs: [npc('npc-1', '沈既白'), npc('npc-2', '林见川')],
            targetGuestCount: 4,
        });

        expect(roster.selectedCharacterIds).toEqual(['char-a', 'char-b']);
        expect(roster.guests.map(guest => guest.id)).toEqual(['char-a', 'char-b', 'npc-1', 'npc-2']);
    });

    it('reuses saved season NPC guests instead of generating duplicates', async () => {
        const createNpcs = vi.fn().mockResolvedValue([
            npc('npc-1', '沈既白'),
            npc('npc-2', '林见川'),
        ]);

        const firstRoster = await resolveLoveShowGuestRoster({
            characters,
            activeCharacterId: 'char-a',
            lockedCharacterIds: ['char-b'],
            targetGuestCount: 4,
            createNpcs,
        });
        const secondRoster = await resolveLoveShowGuestRoster({
            characters,
            activeCharacterId: 'char-a',
            lockedCharacterIds: ['char-b'],
            existingNpcs: firstRoster.npcs,
            targetGuestCount: 4,
            createNpcs,
        });

        expect(createNpcs).toHaveBeenCalledTimes(1);
        expect(secondRoster.generatedNpcCount).toBe(0);
        expect(secondRoster.guests.map(guest => guest.id)).toEqual(['char-a', 'char-b', 'npc-1', 'npc-2']);
    });

    it('adapts an NPC into a renderable runtime character without saving it to the character library', () => {
        const guest = npcToLoveShowGuest(npc('npc-1', '沈既白'));
        const runtimeCharacter = loveShowGuestToRuntimeCharacter(guest);

        expect(runtimeCharacter.id).toBe('npc-1');
        expect(runtimeCharacter.name).toBe('沈既白');
        expect(runtimeCharacter.avatar).toBe('');
        expect(runtimeCharacter.memories).toEqual([]);
        expect(runtimeCharacter.systemPrompt).toContain('本季只有用户一位主角');
        expect(runtimeCharacter.systemPrompt).toContain('不能和其他嘉宾发展成主 CP');
        expect(runtimeCharacter.systemPrompt).toContain('所有入组嘉宾都是正式嘉宾');
        expect(runtimeCharacter.photoAppearancePrompt).toContain('二十七岁');
        expect(guest.appearance).toContain('黑色短发');
        expect(guest.state.strategy).toBe('观望');
    });

    it('requires an explicit casting confirmation for a season to be reusable', () => {
        const season = {
            seasonId: 'season-a',
            charIds: ['char-a', 'char-b', 'npc-1', 'npc-2'],
        };

        expect(isLoveShowSeasonCastingConfirmed(season)).toBe(false);

        saveLoveShowCastingConfirmation(season);
        expect(isLoveShowSeasonCastingConfirmed(season)).toBe(true);
        expect(isLoveShowSeasonCastingConfirmed({
            seasonId: 'season-a',
            charIds: ['char-a', 'char-b', 'npc-2', 'npc-1'],
        })).toBe(false);

        clearLoveShowCastingConfirmation();
        expect(isLoveShowSeasonCastingConfirmed(season)).toBe(false);
    });

    it('does not seed a fresh casting preview from a confirmed previous season', () => {
        const season = {
            seasonId: 'season-a',
            charIds: ['char-a', 'char-b', 'npc-1', 'npc-2'],
        };

        expect(shouldReuseLoveShowNpcsForCastingPreview({ existingSeason: season })).toBe(true);

        saveLoveShowCastingConfirmation(season);
        expect(shouldReuseLoveShowNpcsForCastingPreview({ existingSeason: season })).toBe(false);
        expect(shouldReuseLoveShowNpcsForCastingPreview({ existingSeason: season, forceFreshSeason: true })).toBe(false);
    });
});

describe('LoveShow user-centered copy and prompts', () => {
    it('uses the new foreground naming system', () => {
        expect(LOVE_SHOW_COPY.appName).toBe('心动放送');
        expect(LOVE_SHOW_COPY.seasonName).toBe('唯一心动线');
        expect(LOVE_SHOW_COPY.audienceWind).toBe('心动风向');
        expect(LOVE_SHOW_COPY.windReveal).toBe('风向揭晓');
        expect(LOVE_SHOW_COPY.offCamera).toBe('镜头之外');
    });

    it('keeps NPC, hot-list, and mission prompts centered on the user', () => {
        const npcPrompt = buildNpcGeneratorPrompt(2, ['阿序：真实角色嘉宾']);
        const socialPrompt = buildSocialPostsPrompt(1, '初见片段结束', ['阿序', '白榆'], '小雨');
        const missionPrompt = buildDirectorMissionPrompt(1, ['阿序', '白榆'], '小雨刚完成初见片段');

        expect(npcPrompt).toContain('本季只有用户一位主角');
        expect(npcPrompt).toContain('绝不互相心动、互选或组成 CP');
        expect(npcPrompt).toContain('阿序：真实角色嘉宾');
        expect(npcPrompt).toContain('打法明显铺开');
        expect(npcPrompt).toContain('JSON 里加 "appearance" 字段');
        expect(socialPrompt).toContain('唯一主角：小雨');
        expect(socialPrompt).toContain('没有可发言嘉宾档案');
        expect(socialPrompt).toContain('风向只能围绕小雨');
        expect(socialPrompt).toContain('不允许生成 authorType=guest');
        expect(socialPrompt).toContain('不要生成“谁和谁最配”');
        expect(missionPrompt).toContain('任务必须围绕用户与嘉宾');
        expect(missionPrompt).toContain('不会替用户决定心动归属');
    });

    it('keeps Day 1 scene prompts in a first-acquaintance stage', () => {
        const season = createSeason(['char-a', 'char-b']);
        const state: CharacterState = {
            characterId: 'char-a',
            affection: 0,
            mood: '期待',
            confidence: 50,
            strategy: '观望',
            jealousyTarget: null,
            innerThought: '',
            lastUpdatedScene: '',
        };
        const scene: LoveShowScene = {
            id: 'scene-opening',
            dayNumber: 1,
            locationId: 'living_room',
            locationName: '合宿屋客厅',
            characterIds: ['char-a', 'char-b'],
            locationGuestIds: ['char-a', 'char-b'],
            atmosphere: '初见夜，嘉宾第一次在节目现场集合。',
            status: 'active',
        };
        const characterBriefs = [
            {
                id: 'char-a',
                name: '阿序',
                profile: '旧关系设定：阿序和小雨已经是恋人，拥有很多共同回忆。',
                state,
            },
        ];

        const singlePreamble = buildLoveShowPreamble('阿序', '小雨', season, state, null);
        const multiPreamble = buildMultiCastLoveShowPreamble('小雨', season, characterBriefs);
        const directorPrompt = buildDirectorBeatPrompt(
            season,
            scene,
            characterBriefs,
            [],
            '',
            '初见片段开始了，所有嘉宾在客厅集合',
        );

        expect(singlePreamble).toContain('Day 1 初识边界');
        expect(singlePreamble).toContain('不能表现成旧相识');
        expect(multiPreamble).toContain('角色库里的旧关系');
        expect(multiPreamble).toContain('关系必须通过之后的节目互动逐步升温');
        expect(directorPrompt).toContain('Day 1 初识调度');
        expect(directorPrompt).toContain('不要把任何嘉宾调度成已经认识用户');
        expect(directorPrompt).toContain('不继承与用户的旧关系');
    });
});
