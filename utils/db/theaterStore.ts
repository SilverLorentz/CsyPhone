/**
 * Theater Store — IndexedDB persistence for theater sessions and custom locations.
 * Uses the character messages store for theater dialogue (metadata.source = 'theater').
 * Uses localStorage for lightweight session state (avoids DB version bumps).
 */

import type { TheaterSessionState, TheaterLocation, TheaterTimeline } from '../../types';
import { saveAsset, getAsset, deleteAsset } from './contentStore';

// ── Theater Background Image (IndexedDB via STORE_ASSETS) ──

const THEATER_BG_PREFIX = 'theater_bg_';

/** Check if a bgImage value is an IndexedDB asset key (vs a URL) */
export function isTheaterAssetKey(bgImage: string | undefined): boolean {
    if (!bgImage) return false;
    return bgImage.startsWith(THEATER_BG_PREFIX);
}

/** Generate asset key for a location's background image */
export function theaterBgKey(locationId: string): string {
    return `${THEATER_BG_PREFIX}${locationId}`;
}

/** Save a background image to IndexedDB, returns the asset key */
export async function saveTheaterBgImage(locationId: string, dataUrl: string): Promise<string> {
    const key = theaterBgKey(locationId);
    await saveAsset(key, dataUrl);
    return key;
}

/** Load a background image from IndexedDB by asset key */
export async function getTheaterBgImage(key: string): Promise<string | null> {
    return getAsset(key);
}

/** Delete a background image from IndexedDB */
export async function deleteTheaterBgImage(locationId: string): Promise<void> {
    await deleteAsset(theaterBgKey(locationId));
}

/**
 * Resolve a bgImage value to a displayable URL.
 * - If it's a URL (starts with / or http) → return as-is
 * - If it's an asset key → load from IndexedDB
 * - Otherwise → return null
 */
export async function resolveTheaterBg(bgImage: string | undefined): Promise<string | null> {
    if (!bgImage) return null;
    if (bgImage.startsWith('/') || bgImage.startsWith('http') || bgImage.startsWith('data:')) {
        return bgImage;
    }
    if (isTheaterAssetKey(bgImage)) {
        return getTheaterBgImage(bgImage);
    }
    return null;
}

const THEATER_SESSION_KEY = 'theater_session_';
const THEATER_CUSTOM_LOCATIONS_KEY = 'theater_custom_locations';

// ── Session State (localStorage — lightweight, no DB migration needed) ──

export function saveTheaterSession(session: TheaterSessionState): void {
    try {
        localStorage.setItem(
            THEATER_SESSION_KEY + session.charId,
            JSON.stringify(session),
        );
    } catch (e) {
        console.error('[TheaterStore] Failed to save session:', e);
    }
}

export function getTheaterSession(charId: string): TheaterSessionState | null {
    try {
        const raw = localStorage.getItem(THEATER_SESSION_KEY + charId);
        if (!raw) return null;
        return JSON.parse(raw) as TheaterSessionState;
    } catch {
        return null;
    }
}

export function deleteTheaterSession(charId: string): void {
    try {
        localStorage.removeItem(THEATER_SESSION_KEY + charId);
    } catch { /* ignore */ }
}

// ── Custom Locations (localStorage) ──

export function getCustomLocations(): TheaterLocation[] {
    try {
        const raw = localStorage.getItem(THEATER_CUSTOM_LOCATIONS_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as TheaterLocation[];
    } catch {
        return [];
    }
}

export function saveCustomLocations(locations: TheaterLocation[]): void {
    try {
        localStorage.setItem(THEATER_CUSTOM_LOCATIONS_KEY, JSON.stringify(locations));
    } catch (e) {
        console.error('[TheaterStore] Failed to save custom locations:', e);
    }
}

const MAX_CUSTOM_LOCATIONS = 20;

export function addCustomLocation(location: TheaterLocation): void {
    const existing = getCustomLocations();
    if (existing.length >= MAX_CUSTOM_LOCATIONS) {
        console.warn('[TheaterStore] Max custom locations reached');
        return;
    }
    existing.push(location);
    saveCustomLocations(existing);
}

export function deleteCustomLocation(id: string): void {
    const existing = getCustomLocations().filter(l => l.id !== id);
    saveCustomLocations(existing);
}

export function updateCustomLocation(id: string, updates: Partial<TheaterLocation>): void {
    const existing = getCustomLocations().map(l =>
        l.id === id ? { ...l, ...updates } : l
    );
    saveCustomLocations(existing);
}

// ── Visit Counts (persistent across sessions) ──

const THEATER_VISIT_COUNTS_KEY = 'theater_visit_counts';

export function getVisitCounts(): Record<string, number> {
    try {
        const raw = localStorage.getItem(THEATER_VISIT_COUNTS_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as Record<string, number>;
    } catch {
        return {};
    }
}

export function incrementVisitCount(locationId: string): number {
    const counts = getVisitCounts();
    const next = (counts[locationId] || 0) + 1;
    counts[locationId] = next;
    try {
        localStorage.setItem(THEATER_VISIT_COUNTS_KEY, JSON.stringify(counts));
    } catch { /* ignore */ }
    return next;
}

// ══════════════════════════════════════════════════════════
//  Timeline / Multiverse System (世界线系统)
// ══════════════════════════════════════════════════════════

const THEATER_TIMELINES_KEY = 'theater_timelines_';
const THEATER_ACTIVE_TIMELINE_KEY = 'theater_active_tl_';
const MAX_TIMELINES_PER_CHAR = 8;

/** Get all timelines for a character, sorted by lastActiveAt desc */
export function getTimelines(charId: string): TheaterTimeline[] {
    try {
        const raw = localStorage.getItem(THEATER_TIMELINES_KEY + charId);
        if (!raw) return [];
        const timelines = JSON.parse(raw) as TheaterTimeline[];
        return timelines.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    } catch {
        return [];
    }
}

/** Save or update a single timeline (upsert) */
export function saveTimeline(timeline: TheaterTimeline): void {
    try {
        const existing = getTimelines(timeline.charId);
        const idx = existing.findIndex(t => t.timelineId === timeline.timelineId);
        if (idx >= 0) {
            existing[idx] = timeline;
        } else {
            if (existing.length >= MAX_TIMELINES_PER_CHAR) {
                console.warn(`[TheaterStore] Max timelines (${MAX_TIMELINES_PER_CHAR}) reached for char ${timeline.charId}`);
                return;
            }
            existing.push(timeline);
        }
        localStorage.setItem(THEATER_TIMELINES_KEY + timeline.charId, JSON.stringify(existing));
    } catch (e) {
        console.error('[TheaterStore] Failed to save timeline:', e);
    }
}

/** Delete a timeline by ID */
export function deleteTimeline(charId: string, timelineId: string): void {
    try {
        const existing = getTimelines(charId).filter(t => t.timelineId !== timelineId);
        localStorage.setItem(THEATER_TIMELINES_KEY + charId, JSON.stringify(existing));
        // If this was the active timeline, clear it
        if (getActiveTimelineId(charId) === timelineId) {
            clearActiveTimelineId(charId);
        }
    } catch { /* ignore */ }
}

/** Get a specific timeline */
export function getTimelineById(charId: string, timelineId: string): TheaterTimeline | null {
    return getTimelines(charId).find(t => t.timelineId === timelineId) || null;
}

/** Get/set which timeline is currently active for a character */
export function getActiveTimelineId(charId: string): string | null {
    try {
        return localStorage.getItem(THEATER_ACTIVE_TIMELINE_KEY + charId) || null;
    } catch {
        return null;
    }
}

export function setActiveTimelineId(charId: string, timelineId: string): void {
    try {
        localStorage.setItem(THEATER_ACTIVE_TIMELINE_KEY + charId, timelineId);
    } catch { /* ignore */ }
}

export function clearActiveTimelineId(charId: string): void {
    try {
        localStorage.removeItem(THEATER_ACTIVE_TIMELINE_KEY + charId);
    } catch { /* ignore */ }
}

/** Check if the max timeline limit has been reached */
export function canCreateTimeline(charId: string): boolean {
    return getTimelines(charId).length < MAX_TIMELINES_PER_CHAR;
}

/**
 * Resolve the full fork chain for a timeline.
 * Returns [rootTimelineId, ...intermediateIds, thisTimelineId] with fork message IDs.
 */
export function resolveForkChain(charId: string, timelineId: string): Array<{ timelineId: string; forkAfterMessageId: number | null }> {
    const chain: Array<{ timelineId: string; forkAfterMessageId: number | null }> = [];
    const allTimelines = getTimelines(charId);
    let current: TheaterTimeline | undefined = allTimelines.find(t => t.timelineId === timelineId);

    while (current) {
        chain.unshift({ timelineId: current.timelineId, forkAfterMessageId: current.forkAfterMessageId });
        if (!current.parentTimelineId) break;
        current = allTimelines.find(t => t.timelineId === current!.parentTimelineId);
    }

    return chain;
}

/**
 * Generate a default label for a new timeline.
 * Format: "地点名 · 时段" or "世界线 #N"
 */
export function generateTimelineLabel(
    locationName: string,
    timeSlotZh: string,
    charId: string,
): string {
    const count = getTimelines(charId).length + 1;
    if (locationName) {
        return `${locationName} · ${timeSlotZh} #${count}`;
    }
    return `世界线 #${count}`;
}

