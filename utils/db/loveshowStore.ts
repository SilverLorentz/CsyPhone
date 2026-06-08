/**
 * Love Show Store — localStorage persistence for 恋综 (Love Show) seasons.
 *
 * Key schema:
 *   loveshow_season_${seasonId}              → SeasonState
 *   loveshow_charstate_${seasonId}_${charId}  → CharacterState
 *   loveshow_impression_${seasonId}_${charId} → LoveShowUserImpression
 *   loveshow_npcs_${seasonId}                → NpcProfile[]
 *   loveshow_active_season                   → string (seasonId)
 *   loveshow_social_${seasonId}_day${day}     → LoveShowSocialPost[]
 *   loveshow_social_signals_${seasonId}       → SocialSignal[]
 *   loveshow_missions_${seasonId}            → DirectorMission[]
 *   loveshow_memories_${seasonId}            → MemoryCard[]
 *   loveshow_highlights_${seasonId}          → HighlightMemory[]
 */

import type {
    SeasonState,
    CharacterState,
    LoveShowUserImpression,
    NpcProfile,
    LoveShowCastingDraft,
    LoveShowSocialPost,
    DirectorMission,
    MemoryCard,
    HighlightMemory,
    SocialSignal,
} from '../../types/loveshow';
import { normalizeSeasonState } from '../loveshowEngine';
import { getFallbackLoveShowNpcAppearance } from '../loveshowCast';
import {
    appendLoveShowSocialSignals,
    markLoveShowSocialSignalsConsumed,
    normalizeLoveShowSocialPosts,
} from '../loveshowSocial';

// ── Key helpers ──

const KEY_SEASON         = 'loveshow_season_';
const KEY_CHARSTATE      = 'loveshow_charstate_';
const KEY_IMPRESSION     = 'loveshow_impression_';
const KEY_NPCS           = 'loveshow_npcs_';
const KEY_ACTIVE_SEASON  = 'loveshow_active_season';
const KEY_SOCIAL         = 'loveshow_social_';
const KEY_SOCIAL_SIGNALS = 'loveshow_social_signals_';
const KEY_MISSIONS       = 'loveshow_missions_';
const KEY_MEMORIES       = 'loveshow_memories_';
const KEY_HIGHLIGHTS     = 'loveshow_highlights_';
const KEY_SEASON_INDEX   = 'loveshow_season_index';
const KEY_CASTING_DRAFT  = 'loveshow_casting_draft_v2';
const HIGHLIGHT_MEMORY_LIMIT = 15;

// ═══════════════════════════════════
//  赛季 CRUD
// ═══════════════════════════════════

/** Save or update a season */
export function saveSeason(season: SeasonState): void {
    try {
        const normalized = normalizeSeasonState(season);
        localStorage.setItem(KEY_SEASON + normalized.seasonId, JSON.stringify(normalized));
        // Maintain an index of all season IDs for enumeration
        const index = _getSeasonIndex();
        if (!index.includes(normalized.seasonId)) {
            index.push(normalized.seasonId);
            localStorage.setItem(KEY_SEASON_INDEX, JSON.stringify(index));
        }
    } catch (e) {
        console.error('[LoveShowStore] Failed to save season:', e);
    }
}

/** Get a season by ID */
export function getSeason(seasonId: string): SeasonState | null {
    try {
        const raw = localStorage.getItem(KEY_SEASON + seasonId);
        if (!raw) return null;
        return normalizeSeasonState(JSON.parse(raw) as SeasonState);
    } catch {
        return null;
    }
}

/** Get the currently active season */
export function getActiveSeason(): SeasonState | null {
    try {
        const id = localStorage.getItem(KEY_ACTIVE_SEASON);
        if (!id) return null;
        return getSeason(id);
    } catch {
        return null;
    }
}

/** Set the active season ID */
export function setActiveSeasonId(seasonId: string): void {
    try {
        localStorage.setItem(KEY_ACTIVE_SEASON, seasonId);
    } catch { /* ignore */ }
}

/** Delete a season and all its associated data */
export function deleteSeason(seasonId: string): void {
    try {
        const season = getSeason(seasonId);
        localStorage.removeItem(KEY_SEASON + seasonId);
        localStorage.removeItem(KEY_NPCS + seasonId);
        localStorage.removeItem(KEY_MISSIONS + seasonId);
        localStorage.removeItem(KEY_MEMORIES + seasonId);
        localStorage.removeItem(KEY_HIGHLIGHTS + seasonId);
        localStorage.removeItem(KEY_SOCIAL_SIGNALS + seasonId);

        // Clean up per-character keys
        _cleanCharacterKeys(seasonId, season?.charIds || []);

        // Clean up social posts (days 1-5)
        for (let d = 1; d <= 5; d++) {
            localStorage.removeItem(KEY_SOCIAL + seasonId + '_day' + d);
        }

        // Remove from index
        const index = _getSeasonIndex().filter(id => id !== seasonId);
        localStorage.setItem(KEY_SEASON_INDEX, JSON.stringify(index));

        // Clear active if it was this season
        if (localStorage.getItem(KEY_ACTIVE_SEASON) === seasonId) {
            localStorage.removeItem(KEY_ACTIVE_SEASON);
        }
    } catch { /* ignore */ }
}

/** Get all saved seasons, sorted by lastActiveAt desc */
export function getAllSeasons(): SeasonState[] {
    const index = _getSeasonIndex();
    const seasons: SeasonState[] = [];
    for (const id of index) {
        const s = getSeason(id);
        if (s) seasons.push(s);
    }
    return seasons.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

// ═══════════════════════════════════
//  角色状态
// ═══════════════════════════════════

/** Save or update a character's state for a given season */
export function saveCharacterState(seasonId: string, state: CharacterState): void {
    try {
        localStorage.setItem(
            KEY_CHARSTATE + seasonId + '_' + state.characterId,
            JSON.stringify(state),
        );
    } catch (e) {
        console.error('[LoveShowStore] Failed to save character state:', e);
    }
}

/** Get a character's state */
export function getCharacterState(seasonId: string, charId: string): CharacterState | null {
    try {
        const raw = localStorage.getItem(KEY_CHARSTATE + seasonId + '_' + charId);
        if (!raw) return null;
        return JSON.parse(raw) as CharacterState;
    } catch {
        return null;
    }
}

/** Get all character states for a season (requires season's charIds) */
export function getAllCharacterStates(seasonId: string): CharacterState[] {
    const season = getSeason(seasonId);
    if (!season) return [];
    const states: CharacterState[] = [];
    for (const charId of season.charIds) {
        const s = getCharacterState(seasonId, charId);
        if (s) states.push(s);
    }
    return states;
}

// ═══════════════════════════════════
//  印象卡
// ═══════════════════════════════════

/** Save or update a user impression for a character */
export function saveImpression(seasonId: string, impression: LoveShowUserImpression): void {
    try {
        localStorage.setItem(
            KEY_IMPRESSION + seasonId + '_' + impression.characterId,
            JSON.stringify(impression),
        );
    } catch (e) {
        console.error('[LoveShowStore] Failed to save impression:', e);
    }
}

/** Get impression for a specific character */
export function getImpression(seasonId: string, charId: string): LoveShowUserImpression | null {
    try {
        const raw = localStorage.getItem(KEY_IMPRESSION + seasonId + '_' + charId);
        if (!raw) return null;
        return JSON.parse(raw) as LoveShowUserImpression;
    } catch {
        return null;
    }
}

/** Get all impressions for a season (requires season's charIds) */
export function getAllImpressions(seasonId: string): LoveShowUserImpression[] {
    const season = getSeason(seasonId);
    if (!season) return [];
    const impressions: LoveShowUserImpression[] = [];
    for (const charId of season.charIds) {
        const imp = getImpression(seasonId, charId);
        if (imp) impressions.push(imp);
    }
    return impressions;
}

// ═══════════════════════════════════
//  NPC
// ═══════════════════════════════════

/** Save the NPC list for a season */
export function saveNpcs(seasonId: string, npcs: NpcProfile[]): void {
    try {
        localStorage.setItem(KEY_NPCS + seasonId, JSON.stringify(serializeNpcsForStorage(npcs)));
    } catch (e) {
        console.error('[LoveShowStore] Failed to save NPCs:', e);
    }
}

/** Get the NPC list for a season */
export function getNpcs(seasonId: string): NpcProfile[] {
    try {
        const raw = localStorage.getItem(KEY_NPCS + seasonId);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return normalizeNpcsForStorage(Array.isArray(parsed) ? parsed as NpcProfile[] : []);
    } catch {
        return [];
    }
}

// ═══════════════════════════════════
//  选角草稿
// ═══════════════════════════════════

/** Save the current casting preview draft */
export function saveCastingDraft(draft: LoveShowCastingDraft): void {
    try {
        localStorage.setItem(KEY_CASTING_DRAFT, JSON.stringify({
            ...draft,
            npcs: serializeNpcsForStorage(draft.npcs),
        }));
    } catch (e) {
        console.error('[LoveShowStore] Failed to save casting draft:', e);
    }
}

/** Get the current casting preview draft */
export function getCastingDraft(): LoveShowCastingDraft | null {
    try {
        const raw = localStorage.getItem(KEY_CASTING_DRAFT);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<LoveShowCastingDraft>;
        if (!parsed || typeof parsed.draftId !== 'string' || !Array.isArray(parsed.npcs)) return null;
        return {
            draftId: parsed.draftId,
            targetGuestCount: typeof parsed.targetGuestCount === 'number' ? parsed.targetGuestCount : 5,
            selectedCharacterIds: Array.isArray(parsed.selectedCharacterIds)
                ? parsed.selectedCharacterIds.filter((id): id is string => typeof id === 'string')
                : [],
            npcs: normalizeNpcsForStorage(parsed.npcs as NpcProfile[]),
            createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
        };
    } catch {
        return null;
    }
}

/** Clear the current casting preview draft */
export function clearCastingDraft(): void {
    try {
        localStorage.removeItem(KEY_CASTING_DRAFT);
    } catch {
        // ignore
    }
}

// ═══════════════════════════════════
//  社交媒体
// ═══════════════════════════════════

/** Save social posts for a specific day */
export function saveSocialPosts(seasonId: string, day: number, posts: LoveShowSocialPost[]): void {
    try {
        localStorage.setItem(KEY_SOCIAL + seasonId + '_day' + day, JSON.stringify(normalizeLoveShowSocialPosts(posts, day)));
    } catch (e) {
        console.error('[LoveShowStore] Failed to save social posts:', e);
    }
}

/** Get social posts for a specific day */
export function getSocialPosts(seasonId: string, day: number): LoveShowSocialPost[] {
    try {
        const raw = localStorage.getItem(KEY_SOCIAL + seasonId + '_day' + day);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Partial<LoveShowSocialPost>[];
        return normalizeLoveShowSocialPosts(Array.isArray(parsed) ? parsed : [], day);
    } catch {
        return [];
    }
}

/** Save social signals for a season */
export function saveSocialSignals(seasonId: string, signals: SocialSignal[]): void {
    try {
        localStorage.setItem(KEY_SOCIAL_SIGNALS + seasonId, JSON.stringify(signals));
    } catch (e) {
        console.error('[LoveShowStore] Failed to save social signals:', e);
    }
}

/** Get social signals for a season */
export function getSocialSignals(seasonId: string): SocialSignal[] {
    try {
        const raw = localStorage.getItem(KEY_SOCIAL_SIGNALS + seasonId);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as SocialSignal[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Append social signals without mutating character state */
export function appendSocialSignals(seasonId: string, signals: SocialSignal[]): void {
    if (signals.length === 0) return;
    saveSocialSignals(seasonId, appendLoveShowSocialSignals(getSocialSignals(seasonId), signals));
}

/** Mark signals consumed after the existing state/beat funnel has seen them */
export function consumeSocialSignals(seasonId: string, signalIds: string[]): void {
    if (signalIds.length === 0) return;
    saveSocialSignals(seasonId, markLoveShowSocialSignalsConsumed(getSocialSignals(seasonId), signalIds));
}

// ═══════════════════════════════════
//  密令
// ═══════════════════════════════════

/** Save director missions for a season */
export function saveMissions(seasonId: string, missions: DirectorMission[]): void {
    try {
        localStorage.setItem(KEY_MISSIONS + seasonId, JSON.stringify(missions));
    } catch (e) {
        console.error('[LoveShowStore] Failed to save missions:', e);
    }
}

/** Get director missions for a season */
export function getMissions(seasonId: string): DirectorMission[] {
    try {
        const raw = localStorage.getItem(KEY_MISSIONS + seasonId);
        if (!raw) return [];
        return JSON.parse(raw) as DirectorMission[];
    } catch {
        return [];
    }
}

// ═══════════════════════════════════
//  回忆
// ═══════════════════════════════════

/** Append a memory card to the season's collection */
export function saveMemoryCard(seasonId: string, card: MemoryCard): void {
    try {
        const existing = getMemoryCards(seasonId);
        existing.push(card);
        localStorage.setItem(KEY_MEMORIES + seasonId, JSON.stringify(existing));
    } catch (e) {
        console.error('[LoveShowStore] Failed to save memory card:', e);
    }
}

/** Get all memory cards for a season */
export function getMemoryCards(seasonId: string): MemoryCard[] {
    try {
        const raw = localStorage.getItem(KEY_MEMORIES + seasonId);
        if (!raw) return [];
        return JSON.parse(raw) as MemoryCard[];
    } catch {
        return [];
    }
}

// ═══════════════════════════════════
//  高光记忆
// ═══════════════════════════════════

function normalizeHighlightMemory(memory: HighlightMemory): HighlightMemory | null {
    if (!memory || typeof memory !== 'object') return null;
    const guestIds = Array.isArray(memory.guestIds)
        ? Array.from(new Set(memory.guestIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))))
        : [];
    const summary = typeof memory.summary === 'string' ? memory.summary.trim() : '';
    const meaning = typeof memory.meaning === 'string' ? memory.meaning.trim() : '';
    if (!memory.id || !memory.seasonId || guestIds.length === 0 || !summary || !meaning) return null;
    return {
        ...memory,
        guestIds,
        summary,
        meaning,
        callbackLine: typeof memory.callbackLine === 'string' && memory.callbackLine.trim()
            ? memory.callbackLine.trim()
            : undefined,
        weight: Math.min(100, Math.max(0, Number(memory.weight) || 0)),
        createdAt: typeof memory.createdAt === 'number' ? memory.createdAt : Date.now(),
    };
}

function trimHighlightMemories(memories: HighlightMemory[]): HighlightMemory[] {
    const deduped = new Map<string, HighlightMemory>();
    for (const memory of memories) {
        const normalized = normalizeHighlightMemory(memory);
        if (normalized) deduped.set(normalized.id, normalized);
    }
    return [...deduped.values()]
        .sort((a, b) => (b.weight - a.weight) || (b.day - a.day) || (b.createdAt - a.createdAt))
        .slice(0, HIGHLIGHT_MEMORY_LIMIT)
        .sort((a, b) => a.createdAt - b.createdAt);
}

export function saveHighlightMemories(seasonId: string, memories: HighlightMemory[]): void {
    try {
        localStorage.setItem(KEY_HIGHLIGHTS + seasonId, JSON.stringify(trimHighlightMemories(memories)));
    } catch (e) {
        console.error('[LoveShowStore] Failed to save highlight memories:', e);
    }
}

export function appendHighlightMemories(seasonId: string, memories: HighlightMemory[]): void {
    if (memories.length === 0) return;
    saveHighlightMemories(seasonId, [...getHighlightMemories(seasonId), ...memories]);
}

export function getHighlightMemories(seasonId: string): HighlightMemory[] {
    try {
        const raw = localStorage.getItem(KEY_HIGHLIGHTS + seasonId);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as HighlightMemory[];
        return Array.isArray(parsed) ? trimHighlightMemories(parsed) : [];
    } catch {
        return [];
    }
}

// ═══════════════════════════════════
//  工具函数
// ═══════════════════════════════════

/** Generate a unique season ID (timestamp + random suffix) */
export function generateSeasonId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `ls_${ts}_${rand}`;
}

/** Create initial CharacterState with sensible defaults */
export function createInitialCharacterState(charId: string): CharacterState {
    return {
        characterId: charId,
        affection: 0,
        mood: '期待',
        confidence: 50,
        strategy: '观望',
        jealousyTarget: null,
        innerThought: '',
        lastUpdatedScene: '',
    };
}

/** Create initial LoveShowUserImpression with empty arrays */
export function createInitialImpression(charId: string): LoveShowUserImpression {
    return {
        characterId: charId,
        perceivedTraits: [],
        knownFacts: [],
        tentativeReads: [],
        misconceptions: [],
        impression: '',
        history: [],
    };
}

// ── Internal helpers ──

function _getSeasonIndex(): string[] {
    try {
        const raw = localStorage.getItem(KEY_SEASON_INDEX);
        if (!raw) return [];
        return JSON.parse(raw) as string[];
    } catch {
        return [];
    }
}

function serializeNpcsForStorage(npcs: NpcProfile[]): NpcProfile[] {
    return normalizeNpcsForStorage(npcs).map(npc => {
        if (npc.avatarAssetId && typeof npc.avatar === 'string' && npc.avatar.startsWith('data:')) {
            const { avatar: _avatar, ...rest } = npc;
            return rest;
        }
        return npc;
    });
}

function normalizeNpcsForStorage(npcs: NpcProfile[]): NpcProfile[] {
    return npcs.map((npc, index) => ({
        ...npc,
        appearance: typeof npc.appearance === 'string' && npc.appearance.trim()
            ? npc.appearance.trim()
            : getFallbackLoveShowNpcAppearance(index),
    }));
}

/** Remove character-state and impression keys for a deleted season */
function _cleanCharacterKeys(seasonId: string, charIds: string[]): void {
    for (const charId of charIds) {
        localStorage.removeItem(KEY_CHARSTATE + seasonId + '_' + charId);
        localStorage.removeItem(KEY_IMPRESSION + seasonId + '_' + charId);
    }
}
