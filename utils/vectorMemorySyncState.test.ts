import { describe, expect, it } from 'vitest';
import type { VectorMemory } from '../types';
import {
    getVectorMemorySyncState,
    isPendingCloudSync,
    markVectorMemoryAsBackendGenerated,
    markVectorMemoryAsPendingSync,
    resolveLocalFallbackSyncState,
} from './vectorMemorySyncState';

function makeMemory(overrides: Partial<VectorMemory> = {}): VectorMemory {
    return {
        id: 'mem-1',
        charId: 'char-1',
        title: 'Memory',
        content: 'Remembered detail',
        importance: 5,
        mentionCount: 0,
        lastMentioned: 0,
        createdAt: 1,
        vector: [0.1, 0.2],
        source: 'manual',
        syncState: 'local_only',
        cloudSynced: false,
        ...overrides,
    };
}

describe('vectorMemorySyncState', () => {
    it('derives sync state from current memory fields', () => {
        expect(getVectorMemorySyncState(makeMemory({ syncState: 'synced' }))).toBe('synced');
        expect(getVectorMemorySyncState(makeMemory({ syncState: undefined, source: 'sync' }))).toBe('backend_generated');
        expect(getVectorMemorySyncState(makeMemory({ syncState: undefined, cloudSynced: true }))).toBe('synced');
        expect(getVectorMemorySyncState(makeMemory({ syncState: undefined, cloudSynced: false }))).toBe('pending_sync');
    });

    it('marks pending and backend-generated memories with matching cloud flags', () => {
        expect(markVectorMemoryAsPendingSync(makeMemory())).toMatchObject({
            syncState: 'pending_sync',
            cloudSynced: false,
        });
        expect(markVectorMemoryAsBackendGenerated(makeMemory())).toMatchObject({
            syncState: 'backend_generated',
            cloudSynced: true,
        });
    });

    it('keeps cloud fallback decisions for local writes', () => {
        expect(resolveLocalFallbackSyncState(true)).toBe('pending_sync');
        expect(resolveLocalFallbackSyncState(false)).toBe('local_only');
        expect(isPendingCloudSync(makeMemory({ syncState: 'pending_sync' }))).toBe(true);
    });
});
