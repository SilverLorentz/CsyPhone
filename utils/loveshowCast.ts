import type { CharacterProfile } from '../types';
import type { GuestState, ImpressionCard, LoveShowGuest, LoveShowStrategy, NpcProfile, SeasonState } from '../types/loveshow';

export const LOVE_SHOW_MIN_GUESTS = 4;
export const LOVE_SHOW_DEFAULT_GUESTS = 5;
export const LOVE_SHOW_MAX_GUESTS = 6;
export const LOVE_SHOW_LOCKED_GUEST_IDS_KEY = 'loveshow_locked_guest_ids_v1';
export const LOVE_SHOW_CASTING_CONFIRMATION_KEY = 'loveshow_casting_confirmation_v1';
export const LOVE_SHOW_TARGET_GUEST_COUNT_KEY = 'loveshow_target_guest_count_v1';

interface ResolveLoveShowGuestRosterOptions {
    characters: CharacterProfile[];
    activeCharacterId?: string | null;
    lockedCharacterIds?: string[];
    existingNpcs?: NpcProfile[];
    targetGuestCount?: number;
    maxGuests?: number;
    createNpcs?: (input: LoveShowNpcCreateInput) => Promise<NpcProfile[]> | NpcProfile[];
}

export interface LoveShowNpcCreateInput {
    neededCount: number;
    existingGuests: LoveShowGuest[];
    existingNpcs: NpcProfile[];
}

export interface LoveShowGuestRosterResult {
    guests: LoveShowGuest[];
    selectedCharacterIds: string[];
    npcs: NpcProfile[];
    neededNpcCount: number;
    generatedNpcCount: number;
}

interface LoveShowCastingConfirmation {
    seasonId: string;
    charIds: string[];
    confirmedAt: number;
}

export const LOVE_SHOW_APPROACHES: LoveShowStrategy[] = [
    '主动进攻',
    '欲擒故纵',
    '默默守护',
    '直球表白',
    '观望',
    '撤退',
];

const FALLBACK_NPC_APPEARANCES = [
    '二十多岁，轮廓清爽的长脸，眉眼温和但眼尾微垂，黑色微卷短发自然蓬松，身形偏高偏瘦但肩线干净，肤色白净，笑起来左侧有浅浅酒窝',
    '二十七八岁，骨相利落的窄方脸，浓眉深目高鼻梁，黑色短发剪得很短，身形结实肩背宽，小麦色皮肤，手背有一颗小痣，气质沉稳直接',
    '三十出头，脸型偏圆但下颌线清楚，单眼皮眼睛细长，深棕色中短发略长到眉梢，身形不算高却很挺拔，肤色自然偏暖，说话前会轻轻抿唇',
    '二十五六岁，清瘦鹅蛋脸，浅棕色短发带一点自然卷，鼻梁挺直唇色偏淡，身形修长肩颈线漂亮，肤色冷白，右耳戴一枚很小的银色耳钉',
    '二十九岁左右，眉骨明显的菱形脸，眼睛黑亮带笑，高鼻梁薄唇，黑发利落侧分，身形高大匀称，肤色健康，走路时习惯把袖口卷到小臂',
    '二十三四岁，少年感偏强的心形脸，圆眼清亮，黑色碎发盖住一点额头，身形中等偏瘦但动作轻快，肤色白皙，笑时会露出一颗小虎牙',
];

export function getFallbackLoveShowNpcAppearance(index: number): string {
    return FALLBACK_NPC_APPEARANCES[index % FALLBACK_NPC_APPEARANCES.length];
}

export function isLoveShowStrategy(value: unknown): value is LoveShowStrategy {
    return typeof value === 'string' && LOVE_SHOW_APPROACHES.includes(value as LoveShowStrategy);
}

export function clampLoveShowGuestCount(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return LOVE_SHOW_DEFAULT_GUESTS;
    return Math.min(LOVE_SHOW_MAX_GUESTS, Math.max(LOVE_SHOW_MIN_GUESTS, Math.round(numeric)));
}

function isProgramInvitedProfile(input: CharacterProfile | NpcProfile): input is NpcProfile {
    return 'generatedPrompt' in input || 'memorableDetail' in input;
}

function firstValidCharacter(characters: CharacterProfile[], preferredId?: string | null): CharacterProfile | null {
    if (preferredId) {
        const preferred = characters.find(char => char.id === preferredId);
        if (preferred) return preferred;
    }
    return characters[0] || null;
}

function sameOrderedIds(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, index) => b[index] === id);
}

function createGuestState(id: string, strategy: LoveShowStrategy = '观望'): GuestState {
    return {
        characterId: id,
        affection: 0,
        mood: '期待',
        confidence: 50,
        strategy,
        jealousyTarget: null,
        innerThought: '',
        lastUpdatedScene: '',
    };
}

function createGuestImpression(id: string): ImpressionCard {
    return {
        characterId: id,
        perceivedTraits: [],
        knownFacts: [],
        tentativeReads: [],
        misconceptions: [],
        impression: '',
        history: [],
    };
}

export function readLoveShowCastingConfirmation(): LoveShowCastingConfirmation | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(LOVE_SHOW_CASTING_CONFIRMATION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<LoveShowCastingConfirmation>;
        if (!parsed || typeof parsed.seasonId !== 'string' || !Array.isArray(parsed.charIds)) {
            return null;
        }
        return {
            seasonId: parsed.seasonId,
            charIds: parsed.charIds.filter((id): id is string => typeof id === 'string'),
            confirmedAt: typeof parsed.confirmedAt === 'number' ? parsed.confirmedAt : 0,
        };
    } catch {
        return null;
    }
}

export function saveLoveShowCastingConfirmation(season: Pick<SeasonState, 'seasonId' | 'charIds'>): void {
    try {
        if (typeof localStorage === 'undefined') return;
        const confirmation: LoveShowCastingConfirmation = {
            seasonId: season.seasonId,
            charIds: [...season.charIds],
            confirmedAt: Date.now(),
        };
        localStorage.setItem(LOVE_SHOW_CASTING_CONFIRMATION_KEY, JSON.stringify(confirmation));
    } catch {
        // Best-effort marker; missing it should fall back to the casting screen.
    }
}

export function clearLoveShowCastingConfirmation(): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(LOVE_SHOW_CASTING_CONFIRMATION_KEY);
    } catch {
        // ignore
    }
}

export function isLoveShowSeasonCastingConfirmed(season: Pick<SeasonState, 'seasonId' | 'charIds'> | null | undefined): boolean {
    if (!season) return false;
    const confirmation = readLoveShowCastingConfirmation();
    return Boolean(
        confirmation
        && confirmation.seasonId === season.seasonId
        && sameOrderedIds(confirmation.charIds, season.charIds),
    );
}

export function shouldReuseLoveShowNpcsForCastingPreview(input: {
    existingSeason?: Pick<SeasonState, 'seasonId' | 'charIds'> | null;
    forceFreshSeason?: boolean;
}): boolean {
    return Boolean(
        input.existingSeason
        && !input.forceFreshSeason
        && !isLoveShowSeasonCastingConfirmed(input.existingSeason),
    );
}

export function characterToLoveShowGuest(character: CharacterProfile): LoveShowGuest {
    return {
        id: character.id,
        source: 'user_char',
        promoted: true,
        characterId: character.id,
        name: character.name,
        avatar: character.avatar,
        profileSummary: [character.description, character.systemPrompt].filter(Boolean).join('\n').slice(0, 1200),
        roleInShow: '正式嘉宾',
        state: createGuestState(character.id),
        impression: createGuestImpression(character.id),
    };
}

export function npcToLoveShowGuest(npc: NpcProfile): LoveShowGuest {
    return {
        id: npc.id,
        source: 'program_invited',
        promoted: false,
        programGuestId: npc.id,
        npcId: npc.id,
        name: npc.name,
        avatar: npc.avatar,
        avatarAssetId: npc.avatarAssetId,
        appearance: npc.appearance,
        profileSummary: [
            `${npc.age}岁，${npc.job}`,
            npc.appearance ? `外貌：${npc.appearance}` : '',
            npc.memorableDetail,
            npc.sampleLine ? `说话示例：「${npc.sampleLine}」` : '',
            npc.motivation ? `参加动机：${npc.motivation}` : '',
            npc.approach ? `恋爱打法：${npc.approach}` : '',
            npc.generatedPrompt,
        ].filter(Boolean).join('\n').slice(0, 1600),
        roleInShow: '正式嘉宾',
        state: createGuestState(npc.id, isLoveShowStrategy(npc.approach) ? npc.approach : '观望'),
        impression: createGuestImpression(npc.id),
    };
}

export function toLoveShowGuest(input: CharacterProfile | NpcProfile): LoveShowGuest {
    return isProgramInvitedProfile(input) ? npcToLoveShowGuest(input) : characterToLoveShowGuest(input);
}

export function loveShowGuestToRuntimeCharacter(
    guest: LoveShowGuest,
    sourceCharacter?: CharacterProfile,
): CharacterProfile {
    if (guest.characterId && sourceCharacter) return sourceCharacter;

    // TODO: LoveShow runtime should gradually depend on LoveShowGuest
    // instead of temporary CharacterProfile mapping.
    return {
        id: guest.id,
        name: guest.name,
        avatar: guest.avatar || '',
        description: guest.profileSummary,
        systemPrompt: [
            `你是《唯一心动线》的节目嘉宾 ${guest.name}。`,
            '本季只有用户一位主角。你的兴趣、竞争、观察、吃醋和试探都必须最终回到用户身上。',
            '你可以和其他嘉宾产生节目张力，但不能和其他嘉宾发展成主 CP 或恋爱主线。',
            '你和所有入组嘉宾都是正式嘉宾，都可以获得镜头、心令、热榜、单采、私聊和约会机会。',
            guest.profileSummary,
        ].filter(Boolean).join('\n'),
        memories: [],
        dateTemperature: 0.86,
        photoAppearancePrompt: guest.source === 'program_invited' ? guest.appearance : undefined,
    };
}

export function selectLoveShowCharacterGuests(
    characters: CharacterProfile[],
    activeCharacterId?: string | null,
    lockedCharacterIds: string[] = [],
    maxGuests = LOVE_SHOW_DEFAULT_GUESTS,
): LoveShowGuest[] {
    const selected: CharacterProfile[] = [];
    const seen = new Set<string>();
    const push = (id?: string | null) => {
        if (!id || seen.has(id) || selected.length >= maxGuests) return;
        const character = characters.find(char => char.id === id);
        if (!character) return;
        selected.push(character);
        seen.add(character.id);
    };

    push(firstValidCharacter(characters, activeCharacterId)?.id);
    lockedCharacterIds.forEach(push);

    return selected.map(characterToLoveShowGuest);
}

export function createFallbackLoveShowNpc(index: number, existingGuests: LoveShowGuest[]): NpcProfile {
    const presets = [
        {
            name: '沈既白',
            job: '独立花艺师',
            detail: '总会把节目组发的提示卡折成很整齐的小方块',
            line: '我可以慢一点，但我不太会假装没看见。',
            motivation: '忙了几年终于把店稳定下来，朋友说他再不学会靠近别人，就只会和植物说话。',
            approach: '默默守护' as const,
            appearance: getFallbackLoveShowNpcAppearance(0),
        },
        {
            name: '林见川',
            job: '急诊科医生',
            detail: '紧张时会下意识确认门口和水杯的位置',
            line: '你不用马上回答，我只是想先把我的意思说清楚。',
            motivation: '长期轮班让他的生活被工作切得很碎，他想试一次不靠效率表推进的关系。',
            approach: '直球表白' as const,
            appearance: getFallbackLoveShowNpcAppearance(1),
        },
        {
            name: '陈望舒',
            job: '游戏关卡设计师',
            detail: '随身带一枚旧街机代币，讲话前常先笑一下',
            line: '这个选择有隐藏路线吗？我想知道你会不会走。',
            motivation: '他习惯设计别人的相遇，这次想看看自己被放进镜头里会不会失控。',
            approach: '观望' as const,
            appearance: getFallbackLoveShowNpcAppearance(2),
        },
    ];
    const preset = presets[index % presets.length];
    const contrast = existingGuests.map(guest => guest.name).join('、') || '已锁定嘉宾';

    return {
        id: `npc_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
        name: preset.name,
        age: 24 + (index % 6),
        job: preset.job,
        memorableDetail: preset.detail,
        sampleLine: preset.line,
        motivation: `${preset.motivation} 他会和${contrast}形成不同的节目气质，入组后所有互动都围绕用户展开。`,
        approach: preset.approach,
        appearance: preset.appearance || getFallbackLoveShowNpcAppearance(index),
        generatedPrompt: [
            `${preset.name}是《唯一心动线》的正式嘉宾，由节目组在人数不足时邀请入组。`,
            `他来节目是为了靠近用户，也会观察其他嘉宾如何对待用户。`,
            '他可以制造群像、吃醋和选择张力，但不能与其他嘉宾发展成主 CP。',
            `初始恋爱打法：${preset.approach}`,
            `外貌：${preset.appearance || getFallbackLoveShowNpcAppearance(index)}`,
            `记忆点：${preset.detail}`,
            `说话方式：「${preset.line}」`,
        ].join('\n'),
    };
}

export async function resolveLoveShowGuestRoster(
    options: ResolveLoveShowGuestRosterOptions,
): Promise<LoveShowGuestRosterResult> {
    const maxGuests = clampLoveShowGuestCount(options.targetGuestCount ?? options.maxGuests ?? LOVE_SHOW_DEFAULT_GUESTS);
    const characterGuests = selectLoveShowCharacterGuests(
        options.characters,
        options.activeCharacterId,
        options.lockedCharacterIds || [],
        maxGuests,
    );
    const selectedCharacterIds = characterGuests
        .map(guest => guest.characterId)
        .filter((id): id is string => Boolean(id));

    if (characterGuests.length >= maxGuests) {
        return {
            guests: characterGuests.slice(0, maxGuests),
            selectedCharacterIds,
            npcs: [],
            neededNpcCount: 0,
            generatedNpcCount: 0,
        };
    }

    const neededNpcCount = maxGuests - characterGuests.length;
    const existingNpcs = (options.existingNpcs || []).slice(0, neededNpcCount);
    let npcs = [...existingNpcs];
    let generatedNpcCount = 0;
    const missingCount = neededNpcCount - existingNpcs.length;

    if (missingCount > 0) {
        const generated = options.createNpcs
            ? await options.createNpcs({
                neededCount: missingCount,
                existingGuests: [...characterGuests, ...existingNpcs.map(npcToLoveShowGuest)],
                existingNpcs: options.existingNpcs || [],
            })
            : Array.from({ length: missingCount }, (_, index) => createFallbackLoveShowNpc(index, characterGuests));
        const usableGenerated = generated.slice(0, missingCount);
        generatedNpcCount = usableGenerated.length;
        npcs = [...npcs, ...usableGenerated];
    }

    const npcGuests = npcs.slice(0, neededNpcCount).map(npcToLoveShowGuest);

    return {
        guests: [...characterGuests, ...npcGuests].slice(0, maxGuests),
        selectedCharacterIds,
        npcs: npcs.slice(0, neededNpcCount),
        neededNpcCount,
        generatedNpcCount,
    };
}

export function buildLoveShowNpcSeedSummaries(guests: LoveShowGuest[]): string[] {
    return guests.map(guest => [
        guest.name,
        '正式嘉宾',
        guest.appearance ? `外貌：${guest.appearance}` : '',
        guest.profileSummary,
    ].filter(Boolean).join('：').slice(0, 500));
}

export function readLoveShowLockedCharacterIds(): string[] {
    try {
        const raw = localStorage.getItem(LOVE_SHOW_LOCKED_GUEST_IDS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

export function saveLoveShowLockedCharacterIds(ids: string[]): void {
    try {
        localStorage.setItem(LOVE_SHOW_LOCKED_GUEST_IDS_KEY, JSON.stringify(Array.from(new Set(ids))));
    } catch {
        // Best-effort preference storage; roster can still fall back to current character + NPCs.
    }
}

export function readLoveShowTargetGuestCount(): number {
    try {
        if (typeof localStorage === 'undefined') return LOVE_SHOW_DEFAULT_GUESTS;
        return clampLoveShowGuestCount(localStorage.getItem(LOVE_SHOW_TARGET_GUEST_COUNT_KEY));
    } catch {
        return LOVE_SHOW_DEFAULT_GUESTS;
    }
}

export function saveLoveShowTargetGuestCount(count: number): void {
    try {
        localStorage.setItem(LOVE_SHOW_TARGET_GUEST_COUNT_KEY, String(clampLoveShowGuestCount(count)));
    } catch {
        // ignore
    }
}
