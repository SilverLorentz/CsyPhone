import type { HormoneSnapshot,VectorMemory } from '../../types';
import { markVectorMemoryAsBackendGenerated } from '../vectorMemorySyncState';
import {
    buildBackendUrl,
    buildHeaders,
    clearBackendHealthCache,
    clearCloudMemoriesLegacyFallback,
    fetchWithRetry,
    getBackendUrl,
    isBackendAlive,
    type CloudMemoryListOptions,
    type CloudMemoryMutationResult,
} from './backendCore';

type RawCloudMemory = Partial<VectorMemory> & {
    char_id?: string;
    emotional_journey?: string;
    mention_count?: number;
    last_mentioned?: number;
    created_at?: number;
    updated_at?: number;
    model_id?: string;
    deprecated_reason?: string;
    hormone_snapshot?: HormoneSnapshot | string | null;
    salience_score?: number;
    source_message_ids?: number[] | string | null;
    distilled_into?: string;
    source_memory_ids?: string[] | string | null;
};

const VECTOR_MEMORY_SOURCES: ReadonlySet<VectorMemory['source']> = new Set([
    'auto',
    'manual',
    'import',
    'sync',
    'call',
    'distillation',
]);

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseJsonValue(value: unknown): unknown {
    if (typeof value !== 'string') return value;

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function normalizeNumberArray(value: unknown): number[] {
    const parsed = parseJsonValue(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
        .map(item => typeof item === 'number' ? item : Number(item))
        .filter(item => Number.isFinite(item));
}

function normalizeHormoneSnapshot(value: unknown): HormoneSnapshot | undefined {
    const parsed = parseJsonValue(value);
    if (!parsed || typeof parsed !== 'object') return undefined;

    const record = parsed as Record<string, unknown>;
    const dopamine = record.dopamine;
    const serotonin = record.serotonin;
    const cortisol = record.cortisol;
    const oxytocin = record.oxytocin;
    const norepinephrine = record.norepinephrine;
    const endorphin = record.endorphin;
    const energy = record.energy;

    if (
        typeof dopamine !== 'number' ||
        !Number.isFinite(dopamine) ||
        typeof serotonin !== 'number' ||
        !Number.isFinite(serotonin) ||
        typeof cortisol !== 'number' ||
        !Number.isFinite(cortisol) ||
        typeof oxytocin !== 'number' ||
        !Number.isFinite(oxytocin) ||
        typeof norepinephrine !== 'number' ||
        !Number.isFinite(norepinephrine) ||
        typeof endorphin !== 'number' ||
        !Number.isFinite(endorphin) ||
        typeof energy !== 'number' ||
        !Number.isFinite(energy)
    ) {
        return undefined;
    }

    return {
        dopamine,
        serotonin,
        cortisol,
        oxytocin,
        norepinephrine,
        endorphin,
        energy,
    };
}

function normalizeSource(value: unknown): VectorMemory['source'] {
    return typeof value === 'string' && VECTOR_MEMORY_SOURCES.has(value as VectorMemory['source'])
        ? value as VectorMemory['source']
        : 'sync';
}

function isAbortOrTimeoutError(err: unknown): boolean {
    const name = typeof (err as { name?: unknown })?.name === 'string'
        ? (err as { name: string }).name
        : '';
    const message = err instanceof Error ? err.message : String(err);
    const lower = `${name} ${message}`.toLowerCase();
    return lower.includes('abort')
        || lower.includes('aborted')
        || lower.includes('timeout')
        || lower.includes('timed out');
}

function normalizeCloudMemory(memory: unknown, fallbackCharId: string): VectorMemory | null {
    if (!memory || typeof memory !== 'object') return null;

    const record = memory as RawCloudMemory;
    const id = normalizeString(record.id);
    const rawCharId = normalizeString(record.charId) || normalizeString(record.char_id) || '';
    const charId = rawCharId && rawCharId !== fallbackCharId ? fallbackCharId : (rawCharId || fallbackCharId);
    const title = normalizeString(record.title);
    const content = normalizeString(record.content);

    if (!id || !charId || !title || !content) {
        return null;
    }

    const emotionalJourney = normalizeString(record.emotionalJourney ?? record.emotional_journey);
    const modelId = normalizeString(record.modelId ?? record.model_id);
    const deprecatedReason = normalizeString(record.deprecatedReason ?? record.deprecated_reason);
    const updatedAt = record.updatedAt ?? record.updated_at;
    const salienceScore = record.salienceScore ?? record.salience_score;
    const hormoneSnapshot = normalizeHormoneSnapshot(record.hormoneSnapshot ?? record.hormone_snapshot);
    const sourceMessageIds = normalizeNumberArray(record.sourceMessageIds ?? record.source_message_ids);
    const distilledInto = normalizeString(record.distilledInto ?? record.distilled_into);
    const rawSourceMemoryIds = parseJsonValue(record.sourceMemoryIds ?? record.source_memory_ids);
    const sourceMemoryIds = Array.isArray(rawSourceMemoryIds)
        ? rawSourceMemoryIds.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        : [];

    const normalized: VectorMemory = {
        id,
        charId,
        title,
        content,
        importance: normalizeNumber(record.importance, 5),
        mentionCount: normalizeNumber(record.mentionCount ?? record.mention_count, 0),
        lastMentioned: normalizeNumber(record.lastMentioned ?? record.last_mentioned, 0),
        createdAt: normalizeNumber(record.createdAt ?? record.created_at, Date.now()),
        vector: normalizeNumberArray(record.vector),
        source: normalizeSource(record.source),
    };

    if (emotionalJourney) normalized.emotionalJourney = emotionalJourney;
    if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) normalized.updatedAt = updatedAt;
    if (modelId) normalized.modelId = modelId;
    if (sourceMessageIds.length > 0) normalized.sourceMessageIds = sourceMessageIds;
    if (record.deprecated === true) normalized.deprecated = true;
    if (deprecatedReason) normalized.deprecatedReason = deprecatedReason;
    if (hormoneSnapshot) normalized.hormoneSnapshot = hormoneSnapshot;
    if (typeof salienceScore === 'number' && Number.isFinite(salienceScore)) normalized.salienceScore = salienceScore;
    const level = record.level;
    if (typeof level === 'number' && Number.isFinite(level) && level > 0) normalized.level = level;
    if (distilledInto) normalized.distilledInto = distilledInto;
    if (sourceMemoryIds.length > 0) normalized.sourceMemoryIds = sourceMemoryIds;

    return normalized;
}
/**
 * Push local memories to the backend for syncing.
 */
export async function pushMemories(charId: string, memories: any[]): Promise<{ synced: number; skipped: number } | null> {
    if (!await isBackendAlive()) return null;

    const url = getBackendUrl()!;
    const headers = buildHeaders();

    try {
        const resp = await fetchWithRetry(
            `${url}/api/sync/push`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ charId, memories, clientTimestamp: Date.now() }),
            },
            { timeoutMs: 30000, maxAttempts: 2, baseDelayMs: 500 },
        );

        if (!resp.ok) {
            console.error(`☁️ [CloudSync] Push error ${resp.status}`);
            return null;
        }

        const data = await resp.json();
        console.log(`☁️ [CloudSync] Push success: ${data.synced} synced, ${data.skipped} skipped`);
        return { synced: data.synced, skipped: data.skipped };
    } catch (err: any) {
        console.error('☁️ [CloudSync] Push failed:', err.message);
        return null;
    }
}

/**
 * Pull memories from the cloud backend for a given character.
 */
export async function pullMemories(charId: string, options: CloudMemoryListOptions = {}): Promise<VectorMemory[] | null> {
    if (!await isBackendAlive()) return null;

    const headers = buildHeaders();
    const requestUrl = buildBackendUrl(`/api/memories/${encodeURIComponent(charId)}`, {
        vectors: options.vectors ? 'true' : undefined,
        deprecated: options.includeDeprecated ? 'true' : undefined,
    });

    try {
        const resp = await fetchWithRetry(
            requestUrl,
            { headers },
            { timeoutMs: 15000 },
        );

        if (!resp.ok) {
            console.error(`☁️ [CloudSync] Pull error ${resp.status}`);
            return null;
        }

        const data = await resp.json();
        const rawMemories = Array.isArray(data.memories) ? (data.memories as unknown[]) : [];
        const memories = rawMemories
            .map((memory: unknown) => normalizeCloudMemory(memory, charId))
            .filter((memory): memory is VectorMemory => Boolean(memory))
            .map((memory: VectorMemory) => markVectorMemoryAsBackendGenerated(memory));
        console.log(`☁️ [CloudSync] Pull success: ${memories.length} memories for ${charId}`);
        return memories;
    } catch (err: any) {
        if (isAbortOrTimeoutError(err)) {
            return null;
        }

        console.error('☁️ [CloudSync] Pull failed:', err.message);
        clearBackendHealthCache();
        return null;
    }
}

/**
 * List all character IDs that have cloud memories for the current user.
 */
export async function listCloudChars(): Promise<{ charId: string; memoryCount: number }[] | null> {
    if (!await isBackendAlive()) return null;

    const url = getBackendUrl()!;
    const headers = buildHeaders();

    try {
        const resp = await fetchWithRetry(
            `${url}/api/memories/chars`,
            { headers },
            { timeoutMs: 10000 },
        );

        if (!resp.ok) {
            console.error(`☁️ [CloudSync] ListChars error ${resp.status}`);
            return null;
        }

        const data = await resp.json();
        const chars = data.chars || [];
        console.log(`☁️ [CloudSync] Cloud has ${chars.length} character(s) with memories`);
        return chars;
    } catch (err: any) {
        console.error('☁️ [CloudSync] ListChars failed:', err.message);
        clearBackendHealthCache();
        return null;
    }
}

export async function migrateCloudCharacterInstance(
    legacyCharId: string,
    charInstanceId: string,
): Promise<{ ok: boolean; skipped?: boolean; counts?: Record<string, number> } | null> {
    if (!legacyCharId || !charInstanceId || legacyCharId === charInstanceId) {
        return { ok: true, skipped: true };
    }
    if (!await isBackendAlive()) return null;

    const requestUrl = buildBackendUrl('/api/characters/migrate-instance');
    try {
        const resp = await fetchWithRetry(
            requestUrl,
            {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify({ legacyCharId, charInstanceId }),
            },
            { timeoutMs: 20000, maxAttempts: 2, baseDelayMs: 500 },
        );

        if (!resp.ok) {
            console.error(`☁️ [CloudSync] Character instance migration error ${resp.status}`);
            return null;
        }

        return await resp.json();
    } catch (err: any) {
        console.error('☁️ [CloudSync] Character instance migration failed:', err.message);
        clearBackendHealthCache();
        return null;
    }
}

/**
 * Delete a single memory from the cloud backend.
 * Returns a structured result so callers can decide whether to mutate local cache.
 */
export async function deleteCloudMemory(id: string): Promise<CloudMemoryMutationResult> {
    if (!await isBackendAlive()) {
        return { ok: false, reason: 'backend_unavailable' };
    }

    const url = getBackendUrl()!;
    const headers = buildHeaders({ contentType: false });

    try {
        const resp = await fetchWithRetry(
            `${url}/api/memories/${encodeURIComponent(id)}`,
            { method: 'DELETE', headers },
            { timeoutMs: 10000 },
        );

        if (resp.status === 404) {
            return { ok: true, reason: 'not_found' };
        }

        if (!resp.ok) {
            console.error(`☁️ [CloudSync] Delete memory error ${resp.status}`);
            return { ok: false, reason: 'request_failed' };
        }

        return { ok: true };
    } catch (err: any) {
        console.error('☁️ [CloudSync] Delete memory failed:', err.message);
        clearBackendHealthCache();
        return { ok: false, reason: 'request_failed' };
    }
}

/**
 * Update a single memory on the cloud backend.
 * Callers should only refresh local state after this succeeds.
 */
export async function updateCloudMemory(
    memoryId: string,
    updates: { title?: string; content?: string; importance?: number },
): Promise<{ ok: boolean; reason?: string }> {
    if (!await isBackendAlive()) {
        return { ok: false, reason: 'backend_unavailable' };
    }

    const url = getBackendUrl()!;
    const headers = buildHeaders();

    try {
        const resp = await fetchWithRetry(
            `${url}/api/memories/${encodeURIComponent(memoryId)}`,
            {
                method: 'PATCH',
                headers,
                body: JSON.stringify(updates),
            },
            { timeoutMs: 10000, maxAttempts: 2, baseDelayMs: 500 },
        );

        if (!resp.ok) {
            let reason = 'request_failed';
            try {
                const data = await resp.json();
                if (typeof data?.error === 'string' && data.error.trim()) {
                    reason = data.error.trim();
                }
            } catch {
                // Ignore malformed error bodies and fall back to a generic reason.
            }
            return { ok: false, reason };
        }

        return { ok: true };
    } catch (err: any) {
        console.error('[CloudSync] Update memory failed:', err.message);
        clearBackendHealthCache();
        return { ok: false, reason: 'offline' };
    }
}

/**
 * Clear all memories for a character from the cloud backend.
 * Callers should only clear the local mirror when this succeeds.
 */
export async function clearCloudMemories(charId: string): Promise<CloudMemoryMutationResult> {
    if (!await isBackendAlive()) {
        return { ok: false, reason: 'backend_unavailable' };
    }

    const url = getBackendUrl()!;
    const headers = buildHeaders({ contentType: false });

    try {
        const resp = await fetchWithRetry(
            `${url}/api/memories/char/${encodeURIComponent(charId)}`,
            { method: 'DELETE', headers },
            { timeoutMs: 15000 },
        );

        if (resp.status === 404) {
            console.warn('[CloudSync] Clear-char endpoint missing, falling back to per-memory deletes');
            return clearCloudMemoriesLegacyFallback(url, charId);
        }

        if (!resp.ok) {
            console.error(`☁️ [CloudSync] Clear memories error ${resp.status}`);
            return { ok: false, reason: 'request_failed' };
        }

        const data = await resp.json();
        return { ok: true, cleared: data.cleared || 0 };
    } catch (err: any) {
        console.error('☁️ [CloudSync] Clear memories failed:', err.message);
        clearBackendHealthCache();
        return { ok: false, reason: 'request_failed' };
    }
}
