export interface VectorMemoryBatchCheckpoint {
    version: 1;
    charId: string;
    rangeStartIdx: number;
    rangeEndIdx: number;
    nextStartIdx: number;
    nextStartMessageId?: number | null;
    nextStartTimestamp?: number;
    totalCreated: number;
    totalUpdated: number;
    processedWindows: number;
    totalWindows: number;
    lastProcessedTimestamp: number;
    updatedAt: number;
    status: 'running' | 'paused';
}

const CHECKPOINT_PREFIX = 'vector_memory_batch_checkpoint:';

function getCheckpointKey(charId: string): string {
    return `${CHECKPOINT_PREFIX}${charId}`;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function normalizeCheckpoint(raw: unknown, charId: string): VectorMemoryBatchCheckpoint | null {
    if (!raw || typeof raw !== 'object') return null;
    const checkpoint = raw as Partial<VectorMemoryBatchCheckpoint>;
    if (checkpoint.version !== 1) return null;
    if (checkpoint.charId !== charId) return null;
    if (!isFiniteNumber(checkpoint.rangeStartIdx) || !isFiniteNumber(checkpoint.rangeEndIdx)) return null;
    if (!isFiniteNumber(checkpoint.nextStartIdx) || !isFiniteNumber(checkpoint.totalCreated)) return null;
    if (!isFiniteNumber(checkpoint.totalUpdated) || !isFiniteNumber(checkpoint.processedWindows)) return null;
    if (!isFiniteNumber(checkpoint.totalWindows) || !isFiniteNumber(checkpoint.lastProcessedTimestamp)) return null;
    if (!isFiniteNumber(checkpoint.updatedAt)) return null;
    if (checkpoint.status !== 'running' && checkpoint.status !== 'paused') return null;
    const nextStartMessageId = isFiniteNumber(checkpoint.nextStartMessageId) ? checkpoint.nextStartMessageId : null;
    const nextStartTimestamp = isFiniteNumber(checkpoint.nextStartTimestamp) ? checkpoint.nextStartTimestamp : 0;

    return {
        version: 1,
        charId,
        rangeStartIdx: checkpoint.rangeStartIdx,
        rangeEndIdx: checkpoint.rangeEndIdx,
        nextStartIdx: checkpoint.nextStartIdx,
        nextStartMessageId,
        nextStartTimestamp,
        totalCreated: checkpoint.totalCreated,
        totalUpdated: checkpoint.totalUpdated,
        processedWindows: checkpoint.processedWindows,
        totalWindows: checkpoint.totalWindows,
        lastProcessedTimestamp: checkpoint.lastProcessedTimestamp,
        updatedAt: checkpoint.updatedAt,
        status: checkpoint.status,
    };
}

export function loadVectorMemoryBatchCheckpoint(charId: string): VectorMemoryBatchCheckpoint | null {
    try {
        const raw = localStorage.getItem(getCheckpointKey(charId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return normalizeCheckpoint(parsed, charId);
    } catch {
        return null;
    }
}

export function saveVectorMemoryBatchCheckpoint(checkpoint: VectorMemoryBatchCheckpoint): void {
    try {
        localStorage.setItem(getCheckpointKey(checkpoint.charId), JSON.stringify(checkpoint));
    } catch {
        // Ignore storage failures; resume is best-effort.
    }
}

export function clearVectorMemoryBatchCheckpoint(charId: string): void {
    try {
        localStorage.removeItem(getCheckpointKey(charId));
    } catch {
        // Ignore storage failures; resume is best-effort.
    }
}

export function createVectorMemoryBatchCheckpoint(input: {
    charId: string;
    rangeStartIdx: number;
    rangeEndIdx: number;
    nextStartIdx?: number;
    nextStartMessageId?: number | null;
    nextStartTimestamp?: number;
    totalCreated?: number;
    totalUpdated?: number;
    processedWindows?: number;
    totalWindows?: number;
    lastProcessedTimestamp?: number;
    status?: 'running' | 'paused';
}): VectorMemoryBatchCheckpoint {
    const rangeStartIdx = Math.max(0, input.rangeStartIdx);
    const rangeEndIdx = Math.max(rangeStartIdx, input.rangeEndIdx);
    const nextStartIdx = Math.min(
        Math.max(rangeStartIdx, input.nextStartIdx ?? rangeStartIdx),
        rangeEndIdx + 1,
    );

    return {
        version: 1,
        charId: input.charId,
        rangeStartIdx,
        rangeEndIdx,
        nextStartIdx,
        nextStartMessageId: input.nextStartMessageId ?? null,
        nextStartTimestamp: input.nextStartTimestamp ?? 0,
        totalCreated: input.totalCreated ?? 0,
        totalUpdated: input.totalUpdated ?? 0,
        processedWindows: input.processedWindows ?? 0,
        totalWindows: input.totalWindows ?? 0,
        lastProcessedTimestamp: input.lastProcessedTimestamp ?? 0,
        updatedAt: Date.now(),
        status: input.status ?? 'running',
    };
}

export function withCheckpointStatus(
    checkpoint: VectorMemoryBatchCheckpoint,
    status: 'running' | 'paused',
): VectorMemoryBatchCheckpoint {
    return {
        ...checkpoint,
        status,
        updatedAt: Date.now(),
    };
}
