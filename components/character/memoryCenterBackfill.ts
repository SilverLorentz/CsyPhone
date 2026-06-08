import type {
  HormoneBackfillJobCreateResult,
  HormoneBackfillJobDetail,
} from '../../utils/backendClient';
import type { VectorMemory } from '../../types';
import { normalizeVectorMemorySyncState } from '../../utils/vectorMemorySyncState';

export const DEFAULT_HORMONE_JOB_POLL_INTERVAL_MS = 2500;
export const DEFAULT_HORMONE_JOB_MAX_POLLS = 600;

type JobStatusReader = (jobId: string) => Promise<HormoneBackfillJobDetail | null>;
type JobCanceller = (jobId: string) => Promise<HormoneBackfillJobDetail | null>;

export interface RunHormoneBackfillJobFlowOptions {
    createJob: () => Promise<HormoneBackfillJobCreateResult | null>;
    getJob: JobStatusReader;
    cancelJob: JobCanceller;
    isCancelled?: () => boolean;
    onJobAccepted?: (result: HormoneBackfillJobCreateResult) => void;
    onJobPolled?: (detail: HormoneBackfillJobDetail) => void;
    pollIntervalMs?: number;
    maxPolls?: number;
    sleep?: (ms: number) => Promise<void>;
}

export interface RunHormoneBackfillJobFlowResult {
    createResult: HormoneBackfillJobCreateResult;
    finalDetail?: HormoneBackfillJobDetail;
    cancelled: boolean;
}

interface CloudHormoneBackfillMemory {
    id?: string;
    hormone_snapshot?: unknown;
    salience_score?: unknown;
    updated_at?: unknown;
}

export interface SyncHormoneBackfillLocalCacheOptions {
    charId: string;
    fetchCloudMemories: (charId: string) => Promise<CloudHormoneBackfillMemory[] | null>;
    getLocalMemory: (memoryId: string) => Promise<VectorMemory | null>;
    saveLocalMemory: (memory: VectorMemory) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const coerced = Number(value);
    return Number.isFinite(coerced) ? coerced : undefined;
}

function parseHormoneSnapshot(value: unknown): VectorMemory['hormoneSnapshot'] | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as VectorMemory['hormoneSnapshot'];
            }
        } catch {
            return undefined;
        }
        return undefined;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as VectorMemory['hormoneSnapshot'];
    }
    return undefined;
}

function hormoneSnapshotsEqual(
    left: VectorMemory['hormoneSnapshot'] | undefined,
    right: VectorMemory['hormoneSnapshot'] | undefined,
): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export async function syncHormoneBackfillLocalCache(
    options: SyncHormoneBackfillLocalCacheOptions,
): Promise<number> {
    const {
        charId,
        fetchCloudMemories,
        getLocalMemory,
        saveLocalMemory,
    } = options;

    const cloudMemories = await fetchCloudMemories(charId);
    if (!cloudMemories) {
        throw new Error('Failed to refresh cloud memories after hormone backfill');
    }

    let synced = 0;
    for (const cloudMemory of cloudMemories) {
        const memoryId = typeof cloudMemory?.id === 'string' ? cloudMemory.id.trim() : '';
        if (!memoryId) continue;

        const localMemory = await getLocalMemory(memoryId);
        if (!localMemory) continue;

        const nextHormoneSnapshot = parseHormoneSnapshot(cloudMemory.hormone_snapshot);
        const nextSalienceScore = toFiniteNumber(cloudMemory.salience_score);
        const nextUpdatedAt = toFiniteNumber(cloudMemory.updated_at);

        const hasChanges = (
            nextHormoneSnapshot !== undefined
            && !hormoneSnapshotsEqual(localMemory.hormoneSnapshot, nextHormoneSnapshot)
        ) || (
            nextSalienceScore !== undefined
            && localMemory.salienceScore !== nextSalienceScore
        ) || (
            nextUpdatedAt !== undefined
            && localMemory.updatedAt !== nextUpdatedAt
        );

        if (!hasChanges) continue;

        await saveLocalMemory(normalizeVectorMemorySyncState({
            ...localMemory,
            ...(nextHormoneSnapshot !== undefined ? { hormoneSnapshot: nextHormoneSnapshot } : {}),
            ...(nextSalienceScore !== undefined ? { salienceScore: nextSalienceScore } : {}),
            ...(nextUpdatedAt !== undefined ? { updatedAt: nextUpdatedAt } : {}),
        }));
        synced += 1;
    }

    return synced;
}

export async function runHormoneBackfillJobFlow(
    options: RunHormoneBackfillJobFlowOptions,
): Promise<RunHormoneBackfillJobFlowResult> {
    const {
        createJob,
        getJob,
        cancelJob,
        isCancelled = () => false,
        onJobAccepted,
        onJobPolled,
        pollIntervalMs = DEFAULT_HORMONE_JOB_POLL_INTERVAL_MS,
        maxPolls = DEFAULT_HORMONE_JOB_MAX_POLLS,
        sleep = defaultSleep,
    } = options;

    const createResult = await createJob();
    if (!createResult) {
        throw new Error('Failed to create hormone backfill job');
    }

    onJobAccepted?.(createResult);
    const jobId = createResult.job.id;

    let polls = 0;
    while (polls < maxPolls) {
        if (isCancelled()) {
            const cancelDetail = await cancelJob(jobId);
            if (!cancelDetail) {
                throw new Error('Failed to cancel hormone backfill job');
            }
            return {
                createResult,
                finalDetail: cancelDetail,
                cancelled: cancelDetail.job.status === 'cancelled',
            };
        }

        await sleep(pollIntervalMs);
        polls += 1;

        const detail = await getJob(jobId);
        if (!detail) {
            throw new Error('Failed to fetch hormone backfill job status');
        }

        onJobPolled?.(detail);
        if (detail.job.status === 'completed' || detail.job.status === 'failed' || detail.job.status === 'cancelled') {
            return {
                createResult,
                finalDetail: detail,
                cancelled: false,
            };
        }
    }

    throw new Error(`Hormone backfill job polling timed out after ${maxPolls} polls`);
}
