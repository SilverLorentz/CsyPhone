import type {
    LoveShowGuest,
    LoveShowTheaterEcho,
    LoveShowTheaterGuestRef,
    LoveShowTheaterMode,
    LoveShowTheaterResult,
    LoveShowTheaterSource,
    LoveShowTheaterTicket,
    LoveShowScene,
    LoveShowSocialPost,
    LoveShowWindItem,
} from '../types/loveshow';
import type { TheaterLocation } from '../types';
import { normalizeLoveShowSocialPost } from './loveshowSocial';
import { pickLoveShowTheaterLocationId } from './loveshowTheaterLocations';

interface CreateLoveShowTheaterTicketInput {
    seasonId: string;
    day: number;
    episodeDayId?: string;
    guests: LoveShowGuest[];
    source: LoveShowTheaterSource;
    windItems?: LoveShowWindItem[];
    mode?: LoveShowTheaterMode;
    suggestedGuestIds?: string[];
    suggestedLocationId?: string;
    effectHint?: string;
    createdAt?: number;
    existingDayEntries?: LoveShowTheaterDayEntry[];
    force?: boolean;
}

const THEATER_CP_RISK_RE = /(谁和谁最配|嘉宾\s*CP|CP\s*排名|嘉宾互选|互选心动|恋爱线投票|互相心动|锁死|在一起|最配|出局|淘汰|失败者|最终归属|决定你爱谁|×)/i;
const THEATER_EFFECT_PREFIX = '心动片段余波：';
const THEATER_EFFECT_RE = /心动片段余波：[^。！？\n]*(?:[。！？]|$)/g;
const THEATER_DIRECTOR_HINT_RE = /导演提示：[^。！？\n]*(?:[。！？]|$)/g;
const THEATER_TRIANGLE_RULE_RE = /三人片段的张力必须[^。！？\n]*(?:[。！？]|$)/g;
const THEATER_SOLO_RULE_RE = /这段单独约会必须[^。！？\n]*(?:[。！？]|$)/g;

const SOURCE_LABELS: Record<LoveShowTheaterSource, string> = {
    wind: '来自心动风向',
    mission: '来自隐藏心令',
    notice: '来自放送通知',
    private_message: '来自镜头之外',
    confessional: '来自单采间',
    manual: '节目组临时加开',
};

export interface LoveShowTheaterDayEntry {
    seasonId?: string;
    day?: number;
    episodeDayId?: string;
}

function compactText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function ensureChineseSentence(text: string): string {
    const trimmed = text.trim();
    return /[。！？]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function safeIdPart(text: string): string {
    return text.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getLoveShowEpisodeDayId(seasonId: string, day: number): string {
    return `${seasonId}:day:${day}`;
}

export function getLoveShowTheaterEntryDayId(entry: LoveShowTheaterDayEntry | null | undefined): string | null {
    if (!entry) return null;
    if (entry.episodeDayId) return entry.episodeDayId;
    if (entry.seasonId && typeof entry.day === 'number') {
        return getLoveShowEpisodeDayId(entry.seasonId, entry.day);
    }
    return null;
}

export function hasLoveShowTheaterEntryForDay(
    entries: Array<LoveShowTheaterDayEntry | null | undefined>,
    seasonId: string,
    day: number,
): boolean {
    const episodeDayId = getLoveShowEpisodeDayId(seasonId, day);
    return entries.some(entry => getLoveShowTheaterEntryDayId(entry) === episodeDayId);
}

export function loveShowGuestToTheaterGuestRef(guest: LoveShowGuest): LoveShowTheaterGuestRef {
    const shortBio = guest.profileSummary?.trim();
    return {
        guestId: guest.id,
        guestType: guest.programGuestId || guest.npcId ? 'program_invited' : 'cast',
        displayName: guest.name,
        avatar: guest.avatar,
        shortBio: shortBio ? shortBio.slice(0, 140) : undefined,
    };
}

export function resolveLoveShowTheaterGuestRefs(
    guests: LoveShowGuest[],
    guestIds: string[],
    fallbackRefs: LoveShowTheaterGuestRef[] = [],
): LoveShowTheaterGuestRef[] {
    const refById = new Map<string, LoveShowTheaterGuestRef>();
    for (const guest of guests) {
        refById.set(guest.id, loveShowGuestToTheaterGuestRef(guest));
    }
    for (const ref of fallbackRefs) {
        if (!refById.has(ref.guestId)) refById.set(ref.guestId, ref);
    }
    return guestIds.map(id => refById.get(id) || {
        guestId: id,
        guestType: 'cast' as const,
        displayName: id,
    });
}

function uniqueExistingGuestIds(ids: string[], guests: LoveShowGuest[]): string[] {
    const validIds = new Set(guests.map(guest => guest.id));
    const seen = new Set<string>();
    return ids.filter(id => {
        if (!validIds.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function idsFromWindItems(items: LoveShowWindItem[] | undefined): string[] {
    return (items || [])
        .map(item => item.guestId)
        .filter((id): id is string => Boolean(id));
}

function fallbackGuestIds(guests: LoveShowGuest[], count: 1 | 2): string[] {
    return guests.slice(0, count).map(guest => guest.id);
}

export function isUserCenteredTheaterText(text: string): boolean {
    const content = text.trim();
    return Boolean(content) && !THEATER_CP_RISK_RE.test(content);
}

export function getLoveShowTheaterRequiredGuestCount(mode: LoveShowTheaterMode): 1 | 2 {
    return mode === 'triangle' ? 2 : 1;
}

export function validateLoveShowTheaterGuestSelection(
    ticket: Pick<LoveShowTheaterTicket, 'mode' | 'requiredGuestCount'>,
    guestIds: string[],
): { ok: boolean; message?: string } {
    const uniqueCount = new Set(guestIds).size;
    if (uniqueCount !== guestIds.length) {
        return { ok: false, message: '同一位嘉宾不能重复选择' };
    }
    if (ticket.mode === 'solo' && guestIds.length !== 1) {
        return { ok: false, message: '单独约会需要选择 1 位嘉宾' };
    }
    if (ticket.mode === 'triangle' && guestIds.length !== 2) {
        return { ok: false, message: '三人片段需要选择 2 位嘉宾' };
    }
    if (guestIds.length !== ticket.requiredGuestCount) {
        return { ok: false, message: `请先选择 ${ticket.requiredGuestCount} 位嘉宾` };
    }
    return { ok: true };
}

export function resolveLoveShowTheaterLocationId(
    ticket: Pick<LoveShowTheaterTicket, 'id' | 'suggestedLocationId'>,
): string {
    return ticket.suggestedLocationId || pickLoveShowTheaterLocationId(ticket.id);
}

export function createLoveShowTheaterScene(input: {
    ticket: LoveShowTheaterTicket;
    guestIds: string[];
    location: Pick<TheaterLocation, 'id' | 'name' | 'description'>;
}): LoveShowScene {
    const modeCopy = input.ticket.mode === 'triangle' ? '三人片段' : '单独约会';
    const atmosphere = compactText([
        `${modeCopy}正式开机。${input.ticket.description}`,
        input.location.description,
    ].join(' '));
    return {
        id: `theater_scene_${safeIdPart(input.ticket.id)}`,
        dayNumber: input.ticket.day,
        locationId: input.location.id,
        locationName: input.location.name,
        characterIds: input.guestIds,
        locationGuestIds: input.guestIds,
        atmosphere,
        status: 'active',
    };
}

export function createLoveShowTheaterTicket(input: CreateLoveShowTheaterTicketInput): LoveShowTheaterTicket | null {
    const mode = input.mode || 'solo';
    const requiredGuestCount = getLoveShowTheaterRequiredGuestCount(mode);
    if (input.existingDayEntries && hasLoveShowTheaterEntryForDay(input.existingDayEntries, input.seasonId, input.day)) {
        return null;
    }
    if (input.guests.length < requiredGuestCount) return null;

    const requestedIds = uniqueExistingGuestIds([
        ...(input.suggestedGuestIds || []),
        ...idsFromWindItems(input.windItems),
    ], input.guests);
    const suggestedGuestIds = requestedIds.length >= requiredGuestCount
        ? requestedIds.slice(0, requiredGuestCount)
        : input.force
            ? fallbackGuestIds(input.guests, requiredGuestCount)
            : [];

    if (suggestedGuestIds.length < requiredGuestCount) return null;

    const suggestedGuestRefs = resolveLoveShowTheaterGuestRefs(input.guests, suggestedGuestIds);
    const guestNames = suggestedGuestRefs.map(ref => ref.displayName).join('、');
    const episodeDayId = input.episodeDayId || getLoveShowEpisodeDayId(input.seasonId, input.day);
    const title = mode === 'triangle'
        ? '特别分组已开启'
        : input.source === 'wind'
            ? '风向推来一段单独时间'
            : '今日心动片段';
    const modeCopy = mode === 'triangle' ? '三人片段' : '单独约会';
    const sourceCopy = SOURCE_LABELS[input.source];
    const description = `${sourceCopy}，节目组送来一张${modeCopy}票根。${guestNames ? `这段会围绕你和${guestNames}展开。` : '这段会围绕你和嘉宾展开。'}`;
    const safeEffectHint = input.effectHint && isUserCenteredTheaterText(input.effectHint)
        ? input.effectHint
        : mode === 'triangle'
            ? '这段三人片段会让下一场镜头更在意你的注意力落点。'
            : '这段单独约会会让下一场镜头更在意你和嘉宾之间的停顿。';

    return {
        id: `lst_${safeIdPart(episodeDayId)}_${input.source}_${mode}_${suggestedGuestIds.join('_')}`,
        seasonId: input.seasonId,
        day: input.day,
        episodeDayId,
        mode,
        source: input.source,
        title,
        description,
        suggestedGuestIds,
        suggestedGuestRefs,
        requiredGuestCount,
        suggestedLocationId: input.suggestedLocationId,
        effectHint: safeEffectHint,
        createdAt: input.createdAt || Date.now(),
    };
}

export function createLoveShowTheaterResult(input: {
    ticket: LoveShowTheaterTicket;
    guestIds: string[];
    guests?: LoveShowGuest[];
    location?: Pick<TheaterLocation, 'id' | 'name'> | null;
    summary: string;
    createdAt?: number;
}): LoveShowTheaterResult {
    const locationName = input.location?.name || '心动片段';
    const modeCopy = input.ticket.mode === 'triangle' ? '三人片段' : '单独约会';
    const guestRefs = resolveLoveShowTheaterGuestRefs(input.guests || [], input.guestIds, input.ticket.suggestedGuestRefs || []);
    const names = guestRefs.map(ref => ref.displayName).join('、') || '嘉宾';
    const summary = input.summary.trim() || `${locationName}里的${modeCopy}安静收束，镜头留下了没有说完的话。`;
    const episodeDayId = input.ticket.episodeDayId || getLoveShowEpisodeDayId(input.ticket.seasonId, input.ticket.day);
    const memoryBody = summary.includes(names)
        ? summary
        : `${names}和你在${locationName}留下了一段被观众反复回看的停顿。${summary}`;
    return {
        ticketId: input.ticket.id,
        seasonId: input.ticket.seasonId,
        day: input.ticket.day,
        episodeDayId,
        mode: input.ticket.mode,
        guestIds: input.guestIds,
        guestRefs,
        locationId: input.location?.id,
        locationName,
        summary,
        memoryTitle: `${locationName}的心动回声`,
        memoryBody,
        echoText: memoryBody,
        effectHint: sanitizeLoveShowTheaterEffectHint(input.ticket.effectHint || `下一场镜头会继续回看${locationName}里你的选择。`),
        createdAt: input.createdAt || Date.now(),
    };
}

export function createLoveShowTheaterEcho(
    result: LoveShowTheaterResult,
    guests: LoveShowGuest[] = [],
    location?: Pick<TheaterLocation, 'id' | 'name'> | null,
): LoveShowTheaterEcho {
    const guestRefs = result.guestRefs?.length
        ? result.guestRefs
        : resolveLoveShowTheaterGuestRefs(guests, result.guestIds);
    const names = guestRefs.map(ref => ref.displayName).join('、') || '嘉宾';
    const locationName = result.locationName || location?.name || '心动片段';
    const title = result.memoryTitle || `${locationName}的心动回声`;
    const body = result.memoryBody || `${names}和你在${locationName}留下了一段被观众反复回看的停顿。`;
    return {
        id: `echo_${result.ticketId}_${result.createdAt || Date.now()}`,
        ticketId: result.ticketId,
        seasonId: result.seasonId,
        day: result.day,
        episodeDayId: result.episodeDayId || getLoveShowEpisodeDayId(result.seasonId, result.day),
        mode: result.mode,
        guestRefs,
        locationId: result.locationId || location?.id,
        locationName,
        title,
        body,
        echoText: body,
        effectHint: result.effectHint,
        createdAt: result.createdAt || Date.now(),
    };
}

export function sanitizeLoveShowTheaterEffectHint(effectHint: string): string {
    const content = compactText(effectHint.replace(THEATER_EFFECT_PREFIX, ''));
    if (!isUserCenteredTheaterText(content)) {
        return '片段结果只会推近下一场镜头，不会替你决定心动归属。';
    }
    return content;
}

export function normalizeLoveShowTheaterEffectHint(effectHint: string): string {
    const safeHint = sanitizeLoveShowTheaterEffectHint(effectHint);
    return `${THEATER_EFFECT_PREFIX}${ensureChineseSentence(safeHint)}`;
}

export function stripLoveShowTheaterEffectFromAtmosphere(atmosphere: string): string {
    return compactText(atmosphere.replace(THEATER_EFFECT_RE, ' '));
}

export function stripLoveShowInternalDirectionFromAtmosphere(atmosphere: string): string {
    return compactText(stripLoveShowTheaterEffectFromAtmosphere(atmosphere)
        .replace(THEATER_DIRECTOR_HINT_RE, ' ')
        .replace(THEATER_TRIANGLE_RULE_RE, ' ')
        .replace(THEATER_SOLO_RULE_RE, ' '));
}

export function mergeLoveShowTheaterEffectIntoAtmosphere(atmosphere: string, effectHint?: string): string {
    void effectHint;
    return stripLoveShowInternalDirectionFromAtmosphere(atmosphere);
}

export function createLoveShowTheaterHotPost(input: {
    result: LoveShowTheaterResult;
    userName: string;
    id: string;
    likes?: number;
}): LoveShowSocialPost {
    const guestNames = input.result.guestRefs.map(ref => ref.displayName).join('、') || '嘉宾';
    const locationName = input.result.locationName || '心动片段';
    return normalizeLoveShowSocialPost({
        id: input.id,
        platform: 'weibo',
        username: '片段观察员',
        authorType: 'audience',
        authorId: 'audience_theater_observer',
        authorName: '片段观察员',
        content: `#心动风向# ${locationName}这段心动片段有点安静，${guestNames}的每个停顿都在等${input.userName}怎么接。`,
        likes: input.likes ?? 226,
        likeCount: input.likes ?? 226,
        dayNumber: input.result.day,
        source: 'wind',
        createdAt: Date.now(),
        guestRefs: input.result.guestRefs,
        sourceTicketId: input.result.ticketId,
        locationId: input.result.locationId,
    }, input.result.day);
}
