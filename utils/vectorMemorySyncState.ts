import type { MemorySyncState, VectorMemory } from '../types';

export const MEMORY_SYNC_STATES: MemorySyncState[] = [
    'local_only',
    'pending_sync',
    'synced',
    'backend_generated',
];

export function isMemorySyncState(value: unknown): value is MemorySyncState {
    return typeof value === 'string' && MEMORY_SYNC_STATES.includes(value as MemorySyncState);
}

export function getVectorMemorySyncState(memory: Pick<VectorMemory, 'syncState' | 'cloudSynced' | 'source'>): MemorySyncState {
    if (isMemorySyncState(memory.syncState)) {
        return memory.syncState;
    }

    if (memory.source === 'sync') {
        return 'backend_generated';
    }

    if (memory.cloudSynced === true) {
        return 'synced';
    }

    if (memory.cloudSynced === false) {
        return 'pending_sync';
    }

    return 'local_only';
}

export function withVectorMemorySyncState(memory: VectorMemory, syncState: MemorySyncState): VectorMemory {
    return {
        ...memory,
        syncState,
        cloudSynced: syncState === 'synced' || syncState === 'backend_generated'
            ? true
            : syncState === 'pending_sync'
                ? false
                : false,
    };
}

export function normalizeVectorMemorySyncState(memory: VectorMemory): VectorMemory {
    return withVectorMemorySyncState(memory, getVectorMemorySyncState(memory));
}

export function markVectorMemoryAsBackendGenerated(memory: VectorMemory): VectorMemory {
    return withVectorMemorySyncState(memory, 'backend_generated');
}

export function markVectorMemoryAsSynced(memory: VectorMemory): VectorMemory {
    return withVectorMemorySyncState(memory, 'synced');
}

export function markVectorMemoryAsPendingSync(memory: VectorMemory): VectorMemory {
    return withVectorMemorySyncState(memory, 'pending_sync');
}

export function markVectorMemoryAsLocalOnly(memory: VectorMemory): VectorMemory {
    return withVectorMemorySyncState(memory, 'local_only');
}

export function resolveLocalFallbackSyncState(hasCloudSyncTarget: boolean): MemorySyncState {
    return hasCloudSyncTarget ? 'pending_sync' : 'local_only';
}

export function isPendingCloudSync(memory: Pick<VectorMemory, 'syncState' | 'cloudSynced' | 'source'>): boolean {
    return getVectorMemorySyncState(memory) === 'pending_sync';
}
