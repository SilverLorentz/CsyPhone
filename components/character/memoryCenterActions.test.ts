// @vitest-environment jsdom

import { describe,expect,it,vi } from 'vitest';
import type { VectorMemory } from '../../types';
import {
    clearVectorMemoriesManaged,
    deleteVectorMemoryManaged,
    refreshVectorMemoryCache,
    updateVectorMemoryManaged,
    upsertVectorMemoriesManaged,
} from './memoryCenterActions';

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
        source: 'import',
        ...overrides,
    };
}

describe('memoryCenterActions', () => {
    it('refreshes the local cache from cloud memories and marks them as backend-generated', async () => {
        const cloudMemory = makeMemory({ source: 'auto' });
        const replaceLocalMemories = vi.fn().mockResolvedValue(undefined);

        const result = await refreshVectorMemoryCache('char-1', {
            pullCloudMemories: vi.fn().mockResolvedValue([cloudMemory]),
            replaceLocalMemories,
            listLocalMemories: vi.fn().mockResolvedValue([]),
        });

        expect(result.source).toBe('cloud');
        expect(result.memories[0]).toMatchObject({
            id: 'mem-1',
            syncState: 'backend_generated',
            cloudSynced: true,
        });
        expect(replaceLocalMemories).toHaveBeenCalledWith('char-1', expect.arrayContaining([
            expect.objectContaining({ id: 'mem-1', syncState: 'backend_generated' }),
        ]));
    });

    it('preserves local unsynced memories when refreshing from cloud', async () => {
        const cloudMemory = makeMemory({ id: 'cloud-1', source: 'sync' });
        const localPendingMemory = makeMemory({
            id: 'local-pending-1',
            syncState: 'pending_sync' as const,
            cloudSynced: false,
        });
        const localOnlyMemory = makeMemory({
            id: 'local-only-1',
            syncState: 'local_only' as const,
            cloudSynced: false,
        });
        const replaceLocalMemories = vi.fn().mockResolvedValue(undefined);

        const result = await refreshVectorMemoryCache('char-1', {
            pullCloudMemories: vi.fn().mockResolvedValue([cloudMemory]),
            replaceLocalMemories,
            listLocalMemories: vi.fn().mockResolvedValue([localPendingMemory, localOnlyMemory]),
        });

        expect(result.memories).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'cloud-1', syncState: 'backend_generated' }),
            expect.objectContaining({ id: 'local-pending-1', syncState: 'pending_sync' }),
            expect.objectContaining({ id: 'local-only-1', syncState: 'local_only' }),
        ]));
        expect(replaceLocalMemories).toHaveBeenCalledWith('char-1', expect.arrayContaining([
            expect.objectContaining({ id: 'cloud-1', syncState: 'backend_generated' }),
            expect.objectContaining({ id: 'local-pending-1', syncState: 'pending_sync' }),
            expect.objectContaining({ id: 'local-only-1', syncState: 'local_only' }),
        ]));
    });

    it('prefers a local pending memory over the cloud copy when ids collide', async () => {
        const cloudMemory = makeMemory({
            id: 'shared-1',
            source: 'sync',
            content: 'cloud copy',
            syncState: 'backend_generated' as const,
        });
        const localPendingMemory = makeMemory({
            id: 'shared-1',
            content: 'local imported copy',
            syncState: 'pending_sync' as const,
            cloudSynced: false,
        });
        const replaceLocalMemories = vi.fn().mockResolvedValue(undefined);

        const result = await refreshVectorMemoryCache('char-1', {
            pullCloudMemories: vi.fn().mockResolvedValue([cloudMemory]),
            replaceLocalMemories,
            listLocalMemories: vi.fn().mockResolvedValue([localPendingMemory]),
        });

        expect(result.memories).toEqual([
            expect.objectContaining({
                id: 'shared-1',
                content: 'local imported copy',
                syncState: 'pending_sync',
            }),
        ]);
        expect(replaceLocalMemories).toHaveBeenCalledWith('char-1', [
            expect.objectContaining({
                id: 'shared-1',
                content: 'local imported copy',
                syncState: 'pending_sync',
            }),
        ]);
    });

    it('prefers the cloud copy when a local-only memory collides by id', async () => {
        const cloudMemory = makeMemory({
            id: 'shared-1',
            source: 'sync',
            content: 'cloud copy',
            hormoneSnapshot: { dopamine: 0.7 } as any,
        });
        const localOnlyMemory = makeMemory({
            id: 'shared-1',
            content: 'stale local copy',
            syncState: 'local_only' as const,
            cloudSynced: false,
        });
        const replaceLocalMemories = vi.fn().mockResolvedValue(undefined);

        const result = await refreshVectorMemoryCache('char-1', {
            pullCloudMemories: vi.fn().mockResolvedValue([cloudMemory]),
            replaceLocalMemories,
            listLocalMemories: vi.fn().mockResolvedValue([localOnlyMemory]),
        });

        expect(result.memories).toEqual([
            expect.objectContaining({
                id: 'shared-1',
                content: 'cloud copy',
                syncState: 'backend_generated',
                hormoneSnapshot: { dopamine: 0.7 },
            }),
        ]);
        expect(replaceLocalMemories).toHaveBeenCalledWith('char-1', [
            expect.objectContaining({
                id: 'shared-1',
                content: 'cloud copy',
                syncState: 'backend_generated',
            }),
        ]);
    });

    it('falls back to deleting the local cache when cloud deletion fails', async () => {
        const remainingLocalMemories = [makeMemory({ id: 'mem-2', syncState: 'pending_sync' as const })];

        const result = await deleteVectorMemoryManaged('char-1', 'mem-1', {
            deleteCloudMemory: vi.fn().mockResolvedValue({ ok: false, reason: 'backend_unavailable' }),
            deleteLocalMemory: vi.fn().mockResolvedValue(undefined),
            pullCloudMemories: vi.fn().mockResolvedValue(null),
            replaceLocalMemories: vi.fn().mockResolvedValue(undefined),
            listLocalMemories: vi.fn().mockResolvedValue(remainingLocalMemories),
        });

        expect(result.mode).toBe('local_fallback');
        expect(result.reason).toBe('backend_unavailable');
        expect(result.memories).toEqual(remainingLocalMemories);
    });

    it('removes stale local pending memories when cloud deletion resolves as not_found', async () => {
        let localMemories = [
            makeMemory({
                id: 'mem-1',
                syncState: 'pending_sync' as const,
                cloudSynced: false,
            }),
        ];
        const deleteLocalMemory = vi.fn().mockImplementation(async (memoryId: string) => {
            localMemories = localMemories.filter((memory) => memory.id !== memoryId);
        });
        const replaceLocalMemories = vi.fn().mockImplementation(async (_charId: string, memories: VectorMemory[]) => {
            localMemories = [...memories];
        });

        const result = await deleteVectorMemoryManaged('char-1', 'mem-1', {
            deleteCloudMemory: vi.fn().mockResolvedValue({ ok: true, reason: 'not_found' }),
            deleteLocalMemory,
            pullCloudMemories: vi.fn().mockResolvedValue([]),
            replaceLocalMemories,
            listLocalMemories: vi.fn().mockImplementation(async () => localMemories),
        });

        expect(deleteLocalMemory).toHaveBeenCalledWith('mem-1');
        expect(replaceLocalMemories).toHaveBeenCalledWith('char-1', []);
        expect(result).toEqual({
            memories: [],
            mode: 'cloud',
            reason: 'not_found',
        });
    });

    it('updates a cloud memory and refreshes the local cache', async () => {
        const cloudMemory = makeMemory({
            title: 'Updated title',
            content: 'Updated content',
            importance: 8,
        });
        const replaceLocalMemories = vi.fn().mockResolvedValue(undefined);

        const result = await updateVectorMemoryManaged(
            'char-1',
            makeMemory(),
            { title: 'Updated title', content: 'Updated content', importance: 8 },
            true,
            {
                updateCloudMemory: vi.fn().mockResolvedValue({ ok: true }),
                saveLocalMemory: vi.fn().mockResolvedValue(undefined),
                pullCloudMemories: vi.fn().mockResolvedValue([cloudMemory]),
                replaceLocalMemories,
                listLocalMemories: vi.fn().mockResolvedValue([]),
            },
        );

        expect(result.mode).toBe('cloud');
        expect(result.memories).toEqual([
            expect.objectContaining({
                title: 'Updated title',
                content: 'Updated content',
                importance: 8,
            }),
        ]);
        expect(replaceLocalMemories).toHaveBeenCalledWith('char-1', expect.arrayContaining([
            expect.objectContaining({ title: 'Updated title' }),
        ]));
    });

    it('keeps vector memory edits locally as pending_sync when cloud update fails', async () => {
        const saveLocalMemory = vi.fn().mockResolvedValue(undefined);
        const localEditedMemory = makeMemory({
            title: 'Local edit',
            content: 'Edited while offline',
            importance: 7,
            syncState: 'pending_sync' as const,
        });

        const result = await updateVectorMemoryManaged(
            'char-1',
            makeMemory(),
            { title: 'Local edit', content: 'Edited while offline', importance: 7 },
            true,
            {
                updateCloudMemory: vi.fn().mockResolvedValue({ ok: false, reason: 'backend_unavailable' }),
                saveLocalMemory,
                pullCloudMemories: vi.fn().mockResolvedValue(null),
                replaceLocalMemories: vi.fn().mockResolvedValue(undefined),
                listLocalMemories: vi.fn().mockResolvedValue([localEditedMemory]),
            },
        );

        expect(result.mode).toBe('local_fallback');
        expect(result.reason).toBe('pending_sync');
        expect(saveLocalMemory).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Local edit',
            content: 'Edited while offline',
            importance: 7,
            syncState: 'pending_sync',
            cloudSynced: false,
        }));
    });

    it('stores imported memories locally as pending_sync when cloud upsert fails', async () => {
        const saveLocalMemory = vi.fn().mockResolvedValue(undefined);
        const importedMemory = makeMemory({ id: 'mem-import-1' });

        const result = await upsertVectorMemoriesManaged(
            'char-1',
            [importedMemory],
            true,
            {
                pushCloudMemories: vi.fn().mockResolvedValue(null),
                saveLocalMemory,
                pullCloudMemories: vi.fn().mockResolvedValue(null),
                replaceLocalMemories: vi.fn().mockResolvedValue(undefined),
                listLocalMemories: vi.fn().mockResolvedValue([
                    makeMemory({ id: 'mem-import-1', syncState: 'pending_sync' as const }),
                ]),
            },
        );

        expect(result.mode).toBe('local_fallback');
        expect(result.reason).toBe('pending_sync');
        expect(saveLocalMemory).toHaveBeenCalledWith(expect.objectContaining({
            id: 'mem-import-1',
            syncState: 'pending_sync',
            cloudSynced: false,
        }));
    });

    it('clears cloud memories first and then resets the local cache', async () => {
        const replaceLocalMemories = vi.fn().mockResolvedValue(undefined);

        const result = await clearVectorMemoriesManaged('char-1', {
            clearCloudMemories: vi.fn().mockResolvedValue({ ok: true, cleared: 2 }),
            clearLocalMemories: vi.fn().mockResolvedValue(undefined),
            pullCloudMemories: vi.fn().mockResolvedValue([]),
            replaceLocalMemories,
            listLocalMemories: vi.fn().mockResolvedValue([]),
        });

        expect(result).toEqual({
            memories: [],
            mode: 'cloud',
        });
        expect(replaceLocalMemories).toHaveBeenCalledWith('char-1', []);
    });
});
