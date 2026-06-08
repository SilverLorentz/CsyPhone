import type { VectorMemory } from '../../types';
import {
    getVectorMemorySyncState,
    markVectorMemoryAsBackendGenerated,
    resolveLocalFallbackSyncState,
    withVectorMemorySyncState,
} from '../../utils/vectorMemorySyncState';

export interface MemoryCenterActionDeps {
    pullCloudMemories: (
        charId: string,
        options?: { includeDeprecated?: boolean; vectors?: boolean },
    ) => Promise<VectorMemory[] | null>;
    replaceLocalMemories: (charId: string, memories: VectorMemory[]) => Promise<void>;
    listLocalMemories: (charId: string) => Promise<VectorMemory[]>;
    saveLocalMemory: (memory: VectorMemory) => Promise<void>;
    deleteLocalMemory: (memoryId: string) => Promise<void>;
    clearLocalMemories: (charId: string) => Promise<void>;
    deleteCloudMemory: (memoryId: string) => Promise<{ ok: boolean; reason?: string }>;
    updateCloudMemory: (
        memoryId: string,
        updates: VectorMemoryEditableFields,
    ) => Promise<{ ok: boolean; reason?: string }>;
    clearCloudMemories: (charId: string) => Promise<{ ok: boolean; reason?: string }>;
    pushCloudMemories: (
        charId: string,
        memories: VectorMemory[],
    ) => Promise<{ synced: number; skipped: number } | null>;
}

export interface RefreshVectorMemoryCacheResult {
    memories: VectorMemory[];
    source: 'cloud' | 'local';
}

export interface ManagedMemoryMutationResult {
    memories: VectorMemory[];
    mode: 'cloud' | 'local_fallback';
    reason?: string;
}

export interface ManagedMemoryUpsertResult extends ManagedMemoryMutationResult {
    imported: number;
}

export interface VectorMemoryEditableFields {
    title: string;
    content: string;
    importance: number;
}

function normalizeCloudMemories(memories: VectorMemory[]): VectorMemory[] {
    return memories.map(memory => markVectorMemoryAsBackendGenerated(memory));
}

function shouldPreserveLocalMemory(memory: VectorMemory): boolean {
    const syncState = getVectorMemorySyncState(memory);
    return syncState === 'pending_sync' || syncState === 'local_only';
}

async function listLocalMemoriesNormalized(
    charId: string,
    deps: Pick<MemoryCenterActionDeps, 'listLocalMemories'>,
): Promise<VectorMemory[]> {
    return deps.listLocalMemories(charId);
}

export async function refreshVectorMemoryCache(
    charId: string,
    deps: Pick<MemoryCenterActionDeps, 'pullCloudMemories' | 'replaceLocalMemories' | 'listLocalMemories'>,
): Promise<RefreshVectorMemoryCacheResult> {
    const localMemories = await listLocalMemoriesNormalized(charId, deps);
    const cloudMemories = await deps.pullCloudMemories(charId, {
        includeDeprecated: true,
        vectors: true,
    });

    if (cloudMemories) {
        const normalized = normalizeCloudMemories(cloudMemories);
        const mergedMap = new Map<string, VectorMemory>(
            normalized.map((memory) => [memory.id, memory]),
        );
        for (const memory of localMemories) {
            const syncState = getVectorMemorySyncState(memory);
            const shouldPreserveConflict = syncState === 'pending_sync';
            const shouldPreserveNewLocal = syncState === 'local_only' && !mergedMap.has(memory.id);

            if (shouldPreserveLocalMemory(memory) && (shouldPreserveConflict || shouldPreserveNewLocal)) {
                mergedMap.set(memory.id, memory);
            }
        }
        const merged = Array.from(mergedMap.values());
        await deps.replaceLocalMemories(charId, merged);
        return {
            memories: merged,
            source: 'cloud',
        };
    }

    return {
        memories: localMemories,
        source: 'local',
    };
}

export async function deleteVectorMemoryManaged(
    charId: string,
    memoryId: string,
    deps: Pick<
        MemoryCenterActionDeps,
        'deleteCloudMemory' | 'deleteLocalMemory' | 'pullCloudMemories' | 'replaceLocalMemories' | 'listLocalMemories'
    >,
): Promise<ManagedMemoryMutationResult> {
    const cloudResult = await deps.deleteCloudMemory(memoryId);
    if (cloudResult.ok) {
        await deps.deleteLocalMemory(memoryId);
        const refreshed = await refreshVectorMemoryCache(charId, deps);
        return {
            memories: refreshed.memories,
            mode: 'cloud',
            reason: cloudResult.reason,
        };
    }

    await deps.deleteLocalMemory(memoryId);
    return {
        memories: await listLocalMemoriesNormalized(charId, deps),
        mode: 'local_fallback',
        reason: cloudResult.reason,
    };
}

export async function updateVectorMemoryManaged(
    charId: string,
    memory: VectorMemory,
    updates: VectorMemoryEditableFields,
    hasCloudSyncTarget: boolean,
    deps: Pick<
        MemoryCenterActionDeps,
        'updateCloudMemory' | 'saveLocalMemory' | 'pullCloudMemories' | 'replaceLocalMemories' | 'listLocalMemories'
    >,
): Promise<ManagedMemoryMutationResult> {
    const updatedMemory: VectorMemory = {
        ...memory,
        ...updates,
        updatedAt: Date.now(),
    };

    const cloudResult = await deps.updateCloudMemory(memory.id, updates);
    if (cloudResult.ok) {
        const refreshed = await refreshVectorMemoryCache(charId, deps);
        return {
            memories: refreshed.memories,
            mode: 'cloud',
            reason: cloudResult.reason,
        };
    }

    const fallbackSyncState = resolveLocalFallbackSyncState(hasCloudSyncTarget);
    await deps.saveLocalMemory(withVectorMemorySyncState(updatedMemory, fallbackSyncState));

    return {
        memories: await listLocalMemoriesNormalized(charId, deps),
        mode: 'local_fallback',
        reason: fallbackSyncState,
    };
}

export async function clearVectorMemoriesManaged(
    charId: string,
    deps: Pick<
        MemoryCenterActionDeps,
        'clearCloudMemories' | 'clearLocalMemories' | 'pullCloudMemories' | 'replaceLocalMemories' | 'listLocalMemories'
    >,
): Promise<ManagedMemoryMutationResult> {
    const cloudResult = await deps.clearCloudMemories(charId);
    if (cloudResult.ok) {
        await deps.replaceLocalMemories(charId, []);
        return {
            memories: [],
            mode: 'cloud',
        };
    }

    await deps.clearLocalMemories(charId);
    return {
        memories: await listLocalMemoriesNormalized(charId, deps),
        mode: 'local_fallback',
        reason: cloudResult.reason,
    };
}

export async function upsertVectorMemoriesManaged(
    charId: string,
    memories: VectorMemory[],
    hasCloudSyncTarget: boolean,
    deps: Pick<
        MemoryCenterActionDeps,
        'pushCloudMemories' | 'saveLocalMemory' | 'pullCloudMemories' | 'replaceLocalMemories' | 'listLocalMemories'
    >,
): Promise<ManagedMemoryUpsertResult> {
    if (memories.length === 0) {
        const refreshed = await refreshVectorMemoryCache(charId, deps);
        return {
            imported: 0,
            memories: refreshed.memories,
            mode: refreshed.source === 'cloud' ? 'cloud' : 'local_fallback',
        };
    }

    if (hasCloudSyncTarget) {
        const pushed = await deps.pushCloudMemories(charId, memories);
        if (pushed) {
            const refreshed = await refreshVectorMemoryCache(charId, deps);
            return {
                imported: memories.length,
                memories: refreshed.memories,
                mode: 'cloud',
            };
        }
    }

    const fallbackSyncState = resolveLocalFallbackSyncState(hasCloudSyncTarget);
    for (const memory of memories) {
        await deps.saveLocalMemory(withVectorMemorySyncState(memory, fallbackSyncState));
    }

    return {
        imported: memories.length,
        memories: await listLocalMemoriesNormalized(charId, deps),
        mode: 'local_fallback',
        reason: fallbackSyncState,
    };
}
