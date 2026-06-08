import {
    addLlmHeaders,
    buildBackendUrl,
    buildHeaders,
    clearBackendHealthCache,
    fetchWithRetry,
    isBackendAlive,
    readBackendErrorDetail,
    readBackendPayload,
    type CloudHormoneBackfillItem,
    type MemoryEmbeddingEngineId,
    type MemoryEmbeddingEngineStatus,
    type RetryFailedMemoryEngineReindexResult,
    type SwitchMemoryEmbeddingEngineResult,
} from './backendCore';
import { safeTimeoutSignal } from '../safeTimeout';

const createOptionalTimeoutSignal = (timeoutMs: number): AbortSignal | undefined =>
    typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : safeTimeoutSignal(timeoutMs);

export async function getMemoryEmbeddingEngineStatus(): Promise<MemoryEmbeddingEngineStatus | null> {
    if (!await isBackendAlive()) return null;

    try {
        const resp = await fetchWithRetry(
            buildBackendUrl('/api/agent/memory-engine'),
            { headers: buildHeaders() },
            { timeoutMs: 10000, maxAttempts: 2, baseDelayMs: 400 },
        );

        if (!resp.ok) {
            return null;
        }

        return await resp.json();
    } catch (err: any) {
        console.error('[Backend] Get memory engine status failed:', err.message);
        clearBackendHealthCache();
        return null;
    }
}

export async function switchMemoryEmbeddingEngine(
    engineId: MemoryEmbeddingEngineId,
): Promise<SwitchMemoryEmbeddingEngineResult> {
    if (!await isBackendAlive()) {
        return { ok: false, reason: 'backend_unavailable' };
    }

    try {
        const resp = await fetch(
            buildBackendUrl('/api/agent/memory-engine'),
            {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify({ engineId }),
                signal: safeTimeoutSignal(15000),
            },
        );

        if (resp.status === 409) {
            const { payload, detail } = await readBackendPayload(resp);
            return {
                ok: false,
                reason: payload?.code === 'engine_switch_in_progress' ? 'switch_in_progress' : 'request_failed',
                detail,
                status: payload?.status,
            };
        }

        if (!resp.ok) {
            return {
                ok: false,
                reason: 'request_failed',
                detail: await readBackendErrorDetail(resp),
            };
        }

        const data = await resp.json();
        return {
            ok: true,
            changed: data.changed === true,
            reused: data.reused === true,
            status: data.status,
        };
    } catch (err: any) {
        console.error('[Backend] Switch memory engine failed:', err.message);
        clearBackendHealthCache();
        return {
            ok: false,
            reason: 'request_failed',
            detail: err?.message || 'Unknown error',
        };
    }
}

export async function cancelMemoryEngineReindex(jobId: string): Promise<boolean> {
    if (!await isBackendAlive()) return false;

    try {
        const resp = await fetch(
            buildBackendUrl(`/api/semantic/jobs/${encodeURIComponent(jobId)}/cancel`),
            {
                method: 'POST',
                headers: buildHeaders(),
                signal: createOptionalTimeoutSignal(10000),
            },
        );

        if (!resp.ok) {
            const detail = await readBackendErrorDetail(resp);
            console.error(`[Backend] Cancel memory engine reindex failed: HTTP ${resp.status}${detail ? ` ${detail}` : ''}`);
            return false;
        }

        return true;
    } catch (err: any) {
        console.error('[Backend] Cancel memory engine reindex failed:', err.message);
        clearBackendHealthCache();
        return false;
    }
}

export async function retryFailedMemoryEngineReindex(
    jobId?: string,
): Promise<RetryFailedMemoryEngineReindexResult> {
    if (!await isBackendAlive()) {
        return { ok: false, reason: 'backend_unavailable' };
    }

    try {
        const resp = await fetch(
            buildBackendUrl('/api/agent/memory-engine/retry-failed'),
            {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify(jobId ? { jobId } : {}),
                signal: safeTimeoutSignal(15000),
            },
        );

        if (resp.status === 409) {
            const { payload, detail } = await readBackendPayload(resp);
            return {
                ok: false,
                reason: payload?.code === 'engine_reindex_in_progress' ? 'switch_in_progress' : 'request_failed',
                detail,
                status: payload?.status,
            };
        }

        if (resp.status === 400) {
            const { payload, detail } = await readBackendPayload(resp);
            return {
                ok: false,
                reason: payload?.code === 'no_failed_items' ? 'no_failed_items' : 'request_failed',
                detail,
                status: payload?.status,
            };
        }

        if (!resp.ok) {
            return {
                ok: false,
                reason: 'request_failed',
                detail: await readBackendErrorDetail(resp),
            };
        }

        const data = await resp.json();
        return {
            ok: true,
            changed: data.changed === true,
            reused: data.reused === true,
            retriedItems: typeof data.retriedItems === 'number' ? data.retriedItems : undefined,
            status: data.status,
        };
    } catch (err: any) {
        console.error('[Backend] Retry failed reindex failed:', err.message);
        clearBackendHealthCache();
        return {
            ok: false,
            reason: 'request_failed',
            detail: err?.message || 'Unknown error',
        };
    }
}

// ─── Hormone Backfill Jobs (Async) ──────────────────

export interface HormoneBackfillJob {
    id: string;
    userId: string;
    type: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    charId?: string;
    totalItems: number;
    queuedItems: number;
    processingItems: number;
    completedItems: number;
    failedItems: number;
    cancelledItems: number;
    error?: string;
    createdAt: number;
    updatedAt: number;
    startedAt?: number;
    completedAt?: number;
    cancelledAt?: number;
}

export interface HormoneBackfillJobItem {
    id: string;
    jobId: string;
    type: string;
    targetId: string;
    charId?: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    result?: { status?: string; reason?: string; hormoneSnapshot?: Record<string, number>; salienceScore?: number };
    attempts: number;
    lastError?: string;
    createdAt: number;
    updatedAt: number;
}

export interface HormoneBackfillJobDetail {
    job: HormoneBackfillJob;
    items: HormoneBackfillJobItem[];
}

export interface HormoneBackfillJobCreateResult {
    job: HormoneBackfillJob;
    failedItems?: Array<{ memoryId: string; reason: string }>;
    reused?: boolean;
}

/**
 * Create an async hormone backfill job.
 * Returns the job record immediately; the backend processes items via queue.
 */
export async function createHormoneBackfillJob(
    charId: string,
    charName: string,
    items: CloudHormoneBackfillItem[],
    subApiConfig?: { baseUrl: string; model: string; apiKey: string },
    overwrite = false,
): Promise<HormoneBackfillJobCreateResult | null> {
    if (!await isBackendAlive()) return null;

    const headers = buildHeaders();
    addLlmHeaders(headers, subApiConfig);
    if (!headers['X-LLM-Key']) return null;

    try {
        const resp = await fetch(buildBackendUrl('/api/memories/backfill-hormones/jobs'), {
            method: 'POST',
            headers,
            body: JSON.stringify({ charId, charName, items, overwrite }),
            signal: safeTimeoutSignal(15000),
        });

        if (resp.status === 409) {
            const { payload, detail } = await readBackendPayload(resp);
            const jobId = typeof payload?.jobId === 'string' ? payload.jobId.trim() : '';
            const conflictCode = typeof payload?.code === 'string' ? payload.code.trim() : '';

            if (conflictCode === 'job_in_progress' && jobId) {
                const existingJob = await getHormoneBackfillJob(jobId);
                if (existingJob) {
                    return {
                        job: existingJob.job,
                        failedItems: undefined,
                        reused: true,
                    };
                }
            }

            console.error(`☁️ [CloudSync] Create hormone job conflict 409${detail ? `: ${detail}` : ''}`);
            return null;
        }

        if (!resp.ok) {
            const detail = await readBackendErrorDetail(resp);
            console.error(`☁️ [CloudSync] Create hormone job error ${resp.status}${detail ? `: ${detail}` : ''}`);
            return null;
        }

        const data = await resp.json();
        return { job: data.job, failedItems: data.failedItems, reused: data.reused === true };
    } catch (err: any) {
        console.error('☁️ [CloudSync] Create hormone job failed:', err.message);
        clearBackendHealthCache();
        return null;
    }
}

/**
 * Poll the status of an async hormone backfill job.
 */
export async function getHormoneBackfillJob(jobId: string): Promise<HormoneBackfillJobDetail | null> {
    if (!await isBackendAlive()) return null;

    try {
        const resp = await fetchWithRetry(
            buildBackendUrl(`/api/memories/backfill-hormones/jobs/${encodeURIComponent(jobId)}`),
            { headers: buildHeaders() },
            { timeoutMs: 10000, maxAttempts: 2 },
        );

        if (!resp.ok) return null;

        const data = await resp.json();
        return { job: data.job, items: data.items || [] };
    } catch (err: any) {
        console.error('☁️ [CloudSync] Get hormone job failed:', err.message);
        return null;
    }
}

/**
 * Cancel a running hormone backfill job.
 */
export async function cancelHormoneBackfillJob(jobId: string): Promise<HormoneBackfillJobDetail | null> {
    if (!await isBackendAlive()) return null;

    try {
        const resp = await fetch(
            buildBackendUrl(`/api/memories/backfill-hormones/jobs/${encodeURIComponent(jobId)}/cancel`),
            {
                method: 'POST',
                headers: buildHeaders(),
                signal: safeTimeoutSignal(10000),
            },
        );

        if (!resp.ok) return null;

        const data = await resp.json();
        return { job: data.job, items: data.items || [] };
    } catch (err: any) {
        console.error('☁️ [CloudSync] Cancel hormone job failed:', err.message);
        return null;
    }
}
