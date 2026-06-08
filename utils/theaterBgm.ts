/**
 * Theater BGM Service — 场景氛围 BGM 生成与缓存
 *
 * 使用 MiniMax Music 2.6 Free 的 instrumental 模式，
 * 根据场景 location + timeSlot + 导演事件 自动拼 prompt 生成纯音乐 BGM。
 * 生成结果缓存到 localStorage (metadata) + IndexedDB (blob)，
 * 同一场景+时间段再次进入直接播放，无需重新生成。
 */

import type { TheaterLocation, TimeSlot, LocationTag, DirectorEvent } from '../types/theater';
import { MinimaxMusic, type MinimaxMusicGenerateResult } from './minimaxMusic';

// ── Constants ──

const BGM_CACHE_PREFIX = 'theater_bgm_';
const BGM_GENERATION_TIMEOUT_MS = 300_000;
const BGM_MAX_CACHE_ENTRIES = 30;

// ── Types ──

export type BgmStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface BgmCacheEntry {
    cacheKey: string;
    blobUrl: string;
    prompt: string;
    durationMs?: number;
    createdAt: number;
}

interface BgmCacheMeta {
    prompt: string;
    durationMs?: number;
    createdAt: number;
}

// ── Prompt Generation ──

const TAG_STYLES: Record<LocationTag, string> = {
    romantic: 'romantic, warm strings, tender',
    quiet: 'soft ambient, minimal, contemplative',
    crowded: 'upbeat urban texture, light percussion, lively',
    outdoor: 'organic, nature texture, open air feel',
    indoor: 'intimate room reverb, cozy',
    daily: 'casual, light acoustic',
    adventure: 'playful, energetic, spirited',
};

const TIME_MOODS: Record<TimeSlot, string> = {
    morning: 'fresh morning light, hopeful, bright piano, gentle awakening',
    afternoon: 'warm afternoon glow, laid-back, acoustic guitar, easy going',
    evening: 'golden hour warmth, nostalgic, soft synth pads, bittersweet',
    night: 'late night intimacy, deep, muted jazz piano, moonlit calm',
};

export function buildBgmPrompt(
    location: TheaterLocation,
    timeSlot: TimeSlot,
    event?: DirectorEvent | null,
): string {
    const tagStyles = location.tags
        .map(tag => TAG_STYLES[tag])
        .filter(Boolean)
        .join(', ');

    const timeMood = TIME_MOODS[timeSlot] || '';

    let eventLayer = '';
    if (event?.atmosphere) {
        const atm = event.atmosphere.trim();
        if (atm.length > 0) {
            eventLayer = `, scene atmosphere: ${atm.slice(0, 120)}`;
        }
    }

    const eventMoodMap: Partial<Record<string, string>> = {
        romantic: 'tender romantic moment',
        conflict: 'subtle tension, uneasy undertone',
        surprise: 'unexpected twist, curious',
        callback: 'nostalgic memory, wistful',
        encounter: 'chance encounter, gentle curiosity',
    };
    const eventTypeMood = event?.sceneType ? eventMoodMap[event.sceneType] || '' : '';

    const parts = [
        'instrumental',
        'no vocals',
        'cinematic',
        tagStyles,
        timeMood,
        eventTypeMood,
        '70-82 bpm',
        'loopable ending',
        `scene: ${location.nameEn || location.name}`,
    ].filter(Boolean);

    return `${parts.join(', ')}${eventLayer}`.slice(0, 2000);
}

// ── Cache Key ──

export function buildBgmCacheKey(locationId: string, timeSlot: TimeSlot): string {
    return `${BGM_CACHE_PREFIX}${locationId}_${timeSlot}`;
}

// ── In-memory blob URL cache ──

const blobUrlCache = new Map<string, string>();

function revokeCachedBlobUrl(key: string): void {
    const url = blobUrlCache.get(key);
    if (url) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        blobUrlCache.delete(key);
    }
}

// ── LocalStorage metadata cache ──

function readCacheMeta(cacheKey: string): BgmCacheMeta | null {
    try {
        const raw = localStorage.getItem(cacheKey);
        if (!raw) return null;
        const meta = JSON.parse(raw);
        if (meta && typeof meta.createdAt === 'number') return meta as BgmCacheMeta;
    } catch { /* ignore */ }
    return null;
}

function writeCacheMeta(cacheKey: string, meta: BgmCacheMeta): void {
    try {
        localStorage.setItem(cacheKey, JSON.stringify(meta));
    } catch { /* ignore */ }
}

function deleteCacheMeta(cacheKey: string): void {
    try { localStorage.removeItem(cacheKey); } catch { /* ignore */ }
}

function getAllCacheKeys(): string[] {
    const keys: string[] = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(BGM_CACHE_PREFIX)) keys.push(key);
        }
    } catch { /* ignore */ }
    return keys;
}

function evictOldCacheEntries(): void {
    const keys = getAllCacheKeys();
    if (keys.length <= BGM_MAX_CACHE_ENTRIES) return;

    const entries = keys
        .map(key => ({ key, meta: readCacheMeta(key) }))
        .filter((e): e is { key: string; meta: BgmCacheMeta } => e.meta !== null)
        .sort((a, b) => a.meta.createdAt - b.meta.createdAt);

    const toRemove = entries.slice(0, entries.length - BGM_MAX_CACHE_ENTRIES);
    for (const entry of toRemove) {
        deleteCacheMeta(entry.key);
        revokeCachedBlobUrl(entry.key);
    }
}

// ── IndexedDB blob storage (reuses memory record audio store) ──

async function saveBgmBlob(cacheKey: string, blob: Blob): Promise<void> {
    const { DB } = await import('./db');
    await DB.saveMemoryRecordAudio({
        id: `bgm-${cacheKey}`,
        recordId: '__theater_bgm__',
        kind: 'music',
        mimeType: 'audio/mpeg',
        blob,
        createdAt: Date.now(),
    });
}

async function loadBgmBlob(cacheKey: string): Promise<Blob | null> {
    const { DB } = await import('./db');
    return DB.getMemoryRecordAudio(`bgm-${cacheKey}`);
}

// ── Public API ──

export async function loadCachedBgm(
    locationId: string,
    timeSlot: TimeSlot,
): Promise<BgmCacheEntry | null> {
    const cacheKey = buildBgmCacheKey(locationId, timeSlot);
    const meta = readCacheMeta(cacheKey);
    if (!meta) return null;

    const existingUrl = blobUrlCache.get(cacheKey);
    if (existingUrl) {
        return {
            cacheKey,
            blobUrl: existingUrl,
            prompt: meta.prompt,
            durationMs: meta.durationMs,
            createdAt: meta.createdAt,
        };
    }

    const blob = await loadBgmBlob(cacheKey);
    if (!blob) {
        deleteCacheMeta(cacheKey);
        return null;
    }

    const blobUrl = URL.createObjectURL(blob);
    blobUrlCache.set(cacheKey, blobUrl);

    return {
        cacheKey,
        blobUrl,
        prompt: meta.prompt,
        durationMs: meta.durationMs,
        createdAt: meta.createdAt,
    };
}

export interface GenerateBgmOptions {
    apiKey: string;
    groupId?: string;
    location: TheaterLocation;
    timeSlot: TimeSlot;
    event?: DirectorEvent | null;
    musicBaseUrl?: string;
    signal?: AbortSignal;
}

export interface GenerateBgmResult {
    cacheKey: string;
    blobUrl: string;
    prompt: string;
    durationMs?: number;
    fromCache: boolean;
}

export async function generateTheaterBgm(options: GenerateBgmOptions): Promise<GenerateBgmResult> {
    const cacheKey = buildBgmCacheKey(options.location.id, options.timeSlot);

    const cached = await loadCachedBgm(options.location.id, options.timeSlot);
    if (cached) {
        return {
            cacheKey: cached.cacheKey,
            blobUrl: cached.blobUrl,
            prompt: cached.prompt,
            durationMs: cached.durationMs,
            fromCache: true,
        };
    }

    const prompt = buildBgmPrompt(options.location, options.timeSlot, options.event);

    const result: MinimaxMusicGenerateResult = await MinimaxMusic.generateWithFallback({
        apiKey: options.apiKey,
        groupId: options.groupId,
        baseUrl: options.musicBaseUrl?.trim() || undefined,
        prompt,
        lyrics: '',
        isInstrumental: true,
        signal: options.signal,
        timeoutMs: BGM_GENERATION_TIMEOUT_MS,
    });

    evictOldCacheEntries();
    await saveBgmBlob(cacheKey, result.blob);
    const meta: BgmCacheMeta = {
        prompt,
        durationMs: result.durationMs,
        createdAt: Date.now(),
    };
    writeCacheMeta(cacheKey, meta);

    revokeCachedBlobUrl(cacheKey);
    const blobUrl = URL.createObjectURL(result.blob);
    blobUrlCache.set(cacheKey, blobUrl);

    return {
        cacheKey,
        blobUrl,
        prompt,
        durationMs: result.durationMs,
        fromCache: false,
    };
}

export function cleanupBgmBlobUrls(): void {
    for (const [, url] of blobUrlCache.entries()) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    blobUrlCache.clear();
}
