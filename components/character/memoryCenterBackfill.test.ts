import { describe,expect,it,vi } from 'vitest';
import { runHormoneBackfillJobFlow,syncHormoneBackfillLocalCache } from './memoryCenterBackfill';

function makeJob(status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled') {
    return {
        id: 'job-1',
        userId: 'user-1',
        type: 'hormone-backfill',
        status,
        totalItems: 2,
        queuedItems: status === 'queued' ? 2 : 0,
        processingItems: status === 'processing' ? 1 : 0,
        completedItems: status === 'completed' ? 2 : 0,
        failedItems: status === 'failed' ? 1 : 0,
        cancelledItems: status === 'cancelled' ? 1 : 0,
        createdAt: 1,
        updatedAt: 2,
    };
}

describe('runHormoneBackfillJobFlow', () => {
    it('continues polling when create returns a reused job', async () => {
        const createJob = vi.fn().mockResolvedValue({
            reused: true,
            job: makeJob('processing'),
        });
        const getJob = vi.fn()
            .mockResolvedValueOnce({ job: makeJob('processing'), items: [] })
            .mockResolvedValueOnce({ job: makeJob('completed'), items: [] });
        const cancelJob = vi.fn();
        const onJobAccepted = vi.fn();
        const onJobPolled = vi.fn();

        const result = await runHormoneBackfillJobFlow({
            createJob,
            getJob,
            cancelJob,
            onJobAccepted,
            onJobPolled,
            sleep: async () => undefined,
        });

        expect(createJob).toHaveBeenCalledTimes(1);
        expect(getJob).toHaveBeenCalledTimes(2);
        expect(cancelJob).not.toHaveBeenCalled();
        expect(onJobAccepted).toHaveBeenCalledWith(expect.objectContaining({ reused: true }));
        expect(onJobPolled).toHaveBeenCalledTimes(2);
        expect(result.cancelled).toBe(false);
        expect(result.finalDetail?.job.status).toBe('completed');
    });

    it('throws a clear timeout error after the polling limit is reached', async () => {
        const createJob = vi.fn().mockResolvedValue({
            job: makeJob('processing'),
        });
        const getJob = vi.fn().mockResolvedValue({ job: makeJob('processing'), items: [] });

        await expect(runHormoneBackfillJobFlow({
            createJob,
            getJob,
            cancelJob: vi.fn(),
            sleep: async () => undefined,
            maxPolls: 2,
        })).rejects.toThrow('Hormone backfill job polling timed out after 2 polls');

        expect(getJob).toHaveBeenCalledTimes(2);
    });

    it('treats a raced completion during cancel as completion instead of cancellation', async () => {
        const createJob = vi.fn().mockResolvedValue({
            job: makeJob('processing'),
        });
        const cancelJob = vi.fn().mockResolvedValue({
            job: makeJob('completed'),
            items: [],
        });

        const result = await runHormoneBackfillJobFlow({
            createJob,
            getJob: vi.fn(),
            cancelJob,
            isCancelled: () => true,
        });

        expect(cancelJob).toHaveBeenCalledTimes(1);
        expect(result.cancelled).toBe(false);
        expect(result.finalDetail?.job.status).toBe('completed');
    });

    it('throws when the cancel request cannot reach the backend', async () => {
        const createJob = vi.fn().mockResolvedValue({
            job: makeJob('processing'),
        });

        await expect(runHormoneBackfillJobFlow({
            createJob,
            getJob: vi.fn(),
            cancelJob: vi.fn().mockResolvedValue(null),
            isCancelled: () => true,
        })).rejects.toThrow('Failed to cancel hormone backfill job');
    });
});

describe('syncHormoneBackfillLocalCache', () => {
    it('merges cloud hormone snapshots into the local cache without replacing the whole character', async () => {
        const getLocalMemory = vi.fn()
            .mockResolvedValueOnce({
                id: 'vm-1',
                charId: 'char-1',
                title: 'Memory 1',
                content: 'A remembered moment',
                importance: 5,
                mentionCount: 0,
                lastMentioned: 0,
                createdAt: 100,
                vector: [],
            })
            .mockResolvedValueOnce(null);
        const saveLocalMemory = vi.fn().mockResolvedValue(undefined);

        await expect(syncHormoneBackfillLocalCache({
            charId: 'char-1',
            fetchCloudMemories: vi.fn().mockResolvedValue([
                {
                    id: 'vm-1',
                    hormone_snapshot: JSON.stringify({ dopamine: 0.7 }),
                    salience_score: 1.5,
                    updated_at: 999,
                },
                {
                    id: 'vm-missing',
                    hormone_snapshot: JSON.stringify({ cortisol: 0.3 }),
                    salience_score: 0.5,
                    updated_at: 1000,
                },
            ]),
            getLocalMemory,
            saveLocalMemory,
        })).resolves.toBe(1);

        expect(saveLocalMemory).toHaveBeenCalledWith(expect.objectContaining({
            id: 'vm-1',
            hormoneSnapshot: { dopamine: 0.7 },
            salienceScore: 1.5,
            updatedAt: 999,
        }));
    });
});
