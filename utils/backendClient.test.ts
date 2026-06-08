// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {
  cancelMemoryEngineReindex,
  clearCloudMemories,
  createHormoneBackfillJob,
  getHormoneBackfillJob,
  listCloudChars,
  pullMemories,
  pushMemories,
  updateCloudMemory,
} from './backendClient';
import { BACKEND_HEALTH_TIMEOUT_MS,HEALTH_CACHE_KEY } from './backendConfig';

const BACKEND_URL = 'https://csyos-backend-staging.sully-tts-proxy.workers.dev';

function listCallsTo(fetchMock: ReturnType<typeof vi.fn>, path: string) {
    return fetchMock.mock.calls.filter(([input]) => String(input) === `${BACKEND_URL}${path}`);
}

describe('backendClient', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
        vi.stubEnv('VITE_CSYOS_BACKEND_URL', BACKEND_URL);
        vi.stubEnv('VITE_CSYOS_BACKEND_TOKEN', 'staging-token');

        if (typeof AbortSignal.timeout !== 'function') {
            (AbortSignal as typeof AbortSignal & { timeout: (ms: number) => AbortSignal }).timeout = () => new AbortController().signal;
        }
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('falls back to deleting each memory when the bulk clear endpoint returns 404', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response('{}', { status: 404 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ memories: [{ id: 'm1' }, { id: 'm2' }] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response('{}', { status: 200 }))
            .mockResolvedValueOnce(new Response('{}', { status: 404 }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(clearCloudMemories('char-1')).resolves.toEqual({ ok: true, cleared: 2 });
        expect(String(fetchMock.mock.calls[0][0])).toBe(`${BACKEND_URL}/health`);
        expect(String(fetchMock.mock.calls[1][0])).toBe(`${BACKEND_URL}/api/memories/char/char-1`);
        expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
        expect(String(fetchMock.mock.calls[2][0])).toBe(`${BACKEND_URL}/api/memories/char-1?deprecated=true`);
        expect(String(fetchMock.mock.calls[3][0])).toBe(`${BACKEND_URL}/api/memories/m1`);
        expect(String(fetchMock.mock.calls[4][0])).toBe(`${BACKEND_URL}/api/memories/m2`);
    });

    it('normalizes pulled cloud memories into the VectorMemory shape', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                memories: [
                    {
                        id: 'm1',
                        char_id: 'char-1',
                        title: '旅行',
                        content: '一起去了海边',
                        emotional_journey: '开心',
                        importance: 8,
                        mention_count: 2,
                        last_mentioned: 123,
                        created_at: 456,
                        updated_at: 789,
                        vector: '[0.1,0.2]',
                        model_id: 'embed-v1',
                        source: 'auto',
                        hormone_snapshot: JSON.stringify({
                            dopamine: 0.1,
                            serotonin: 0.2,
                            cortisol: 0.3,
                            oxytocin: 0.4,
                            norepinephrine: 0.5,
                            endorphin: 0.6,
                            energy: 0.7,
                        }),
                        salience_score: 0.88,
                        source_message_ids: '[7,8]',
                    },
                ],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(pullMemories('char-1')).resolves.toEqual([
            {
                id: 'm1',
                charId: 'char-1',
                title: '旅行',
                content: '一起去了海边',
                emotionalJourney: '开心',
                importance: 8,
                mentionCount: 2,
                lastMentioned: 123,
                createdAt: 456,
                updatedAt: 789,
                vector: [0.1, 0.2],
                modelId: 'embed-v1',
                source: 'auto',
                sourceMessageIds: [7, 8],
                cloudSynced: true,
                syncState: 'backend_generated',
                hormoneSnapshot: {
                    dopamine: 0.1,
                    serotonin: 0.2,
                    cortisol: 0.3,
                    oxytocin: 0.4,
                    norepinephrine: 0.5,
                    endorphin: 0.6,
                    energy: 0.7,
                },
                salienceScore: 0.88,
            },
        ]);
        expect(listCallsTo(fetchMock, '/api/memories/char-1')).toHaveLength(1);
    });

    it('silences aborted cloud pull failures without clearing health cache', async () => {
        vi.useFakeTimers();
        const abortError = new DOMException('The user aborted a request.', 'AbortError');
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockRejectedValueOnce(abortError)
            .mockRejectedValueOnce(abortError)
            .mockRejectedValueOnce(abortError);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        vi.stubGlobal('fetch', fetchMock);

        const resultPromise = pullMemories('char-1');
        await vi.runAllTimersAsync();

        await expect(resultPromise).resolves.toBeNull();
        expect(listCallsTo(fetchMock, '/api/memories/char-1')).toHaveLength(3);
        expect(errorSpy).not.toHaveBeenCalled();
        expect(localStorage.getItem(HEALTH_CACHE_KEY)).toContain('"alive":true');
    });

    it('does not retry createHormoneBackfillJob on a network failure', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockRejectedValueOnce(new TypeError('fetch failed'));

        vi.stubGlobal('fetch', fetchMock);

        await expect(createHormoneBackfillJob(
            'char-1',
            'Sully',
            [{ memoryId: 'm1', messages: [{ role: 'user', content: 'hi' }] }],
            { baseUrl: 'https://llm.example.com', model: 'gpt-test', apiKey: 'llm-key' },
        )).resolves.toBeNull();

        expect(listCallsTo(fetchMock, '/api/memories/backfill-hormones/jobs')).toHaveLength(1);
    });

    it('retries getHormoneBackfillJob after a transient fetch failure', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                job: {
                    id: 'job-1',
                    userId: 'user-1',
                    type: 'hormone-backfill',
                    status: 'completed',
                    totalItems: 1,
                    queuedItems: 0,
                    processingItems: 0,
                    completedItems: 1,
                    failedItems: 0,
                    cancelledItems: 0,
                    createdAt: 1,
                    updatedAt: 2,
                },
                items: [],
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(getHormoneBackfillJob('job-1')).resolves.toMatchObject({
            job: { id: 'job-1', status: 'completed' },
        });
        expect(listCallsTo(fetchMock, '/api/memories/backfill-hormones/jobs/job-1')).toHaveLength(2);
    });

    it('returns null when getHormoneBackfillJob exhausts its retries', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockRejectedValueOnce(new TypeError('fetch failed again'));

        vi.stubGlobal('fetch', fetchMock);

        await expect(getHormoneBackfillJob('job-2')).resolves.toBeNull();
        expect(listCallsTo(fetchMock, '/api/memories/backfill-hormones/jobs/job-2')).toHaveLength(2);
    });

    it('attaches to the active hormone job when create returns job_in_progress', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: 'active job already running',
                code: 'job_in_progress',
                jobId: 'job-reused',
            }), { status: 409, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                job: {
                    id: 'job-reused',
                    userId: 'user-1',
                    type: 'hormone-backfill',
                    status: 'processing',
                    totalItems: 3,
                    queuedItems: 1,
                    processingItems: 1,
                    completedItems: 1,
                    failedItems: 0,
                    cancelledItems: 0,
                    createdAt: 1,
                    updatedAt: 2,
                },
                items: [],
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(createHormoneBackfillJob(
            'char-1',
            'Sully',
            [{ memoryId: 'm1', messages: [{ role: 'user', content: 'hi' }] }],
            { baseUrl: 'https://llm.example.com', model: 'gpt-test', apiKey: 'llm-key' },
        )).resolves.toMatchObject({
            reused: true,
            job: { id: 'job-reused', status: 'processing' },
        });

        expect(listCallsTo(fetchMock, '/api/memories/backfill-hormones/jobs')).toHaveLength(1);
        expect(listCallsTo(fetchMock, '/api/memories/backfill-hormones/jobs/job-reused')).toHaveLength(1);
    });

    it('posts to the semantic job cancel route for memory engine reindex jobs', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(cancelMemoryEngineReindex('job-reindex-1')).resolves.toBe(true);
        expect(listCallsTo(fetchMock, '/api/semantic/jobs/job-reindex-1/cancel')).toHaveLength(1);
        expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    });

    it('keeps cloud memory requests working when AbortSignal.timeout is unavailable', async () => {
        const originalTimeout = (AbortSignal as typeof AbortSignal & { timeout?: typeof AbortSignal.timeout }).timeout;
        Object.defineProperty(AbortSignal, 'timeout', {
            configurable: true,
            value: undefined,
        });

        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(cancelMemoryEngineReindex('job-no-timeout')).resolves.toBe(true);
        expect(listCallsTo(fetchMock, '/api/semantic/jobs/job-no-timeout/cancel')).toHaveLength(1);

        Object.defineProperty(AbortSignal, 'timeout', {
            configurable: true,
            value: originalTimeout,
        });
    });

    it('returns false when memory engine reindex cancellation fails', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Semantic job not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(cancelMemoryEngineReindex('missing-job')).resolves.toBe(false);
        expect(listCallsTo(fetchMock, '/api/semantic/jobs/missing-job/cancel')).toHaveLength(1);
    });

    it('retries pushMemories after a transient network failure', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(new Response(JSON.stringify({ synced: 2, skipped: 1 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

        vi.stubGlobal('fetch', fetchMock);

        const resultPromise = pushMemories('char-1', [{ id: 'm1' }]);
        await vi.runAllTimersAsync();

        await expect(resultPromise).resolves.toEqual({ synced: 2, skipped: 1 });
        expect(listCallsTo(fetchMock, '/api/sync/push')).toHaveLength(2);
    });

    it('returns null when pushMemories exhausts its retries', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockRejectedValueOnce(new DOMException('timed out', 'AbortError'));

        vi.stubGlobal('fetch', fetchMock);

        const resultPromise = pushMemories('char-1', [{ id: 'm1' }]);
        await vi.runAllTimersAsync();

        await expect(resultPromise).resolves.toBeNull();
        expect(listCallsTo(fetchMock, '/api/sync/push')).toHaveLength(2);
    });

    it('retries updateCloudMemory after a transient network failure', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));

        vi.stubGlobal('fetch', fetchMock);

        const resultPromise = updateCloudMemory('memory-1', { title: 'Updated title' });
        await vi.runAllTimersAsync();

        await expect(resultPromise).resolves.toEqual({ ok: true });
        expect(listCallsTo(fetchMock, '/api/memories/memory-1')).toHaveLength(2);
    });

    it('returns offline when updateCloudMemory exhausts its retries', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockRejectedValueOnce(new DOMException('timed out', 'AbortError'))
            .mockRejectedValueOnce(new TypeError('fetch failed again'));

        vi.stubGlobal('fetch', fetchMock);

        const resultPromise = updateCloudMemory('memory-1', { title: 'Updated title' });
        await vi.runAllTimersAsync();

        await expect(resultPromise).resolves.toEqual({ ok: false, reason: 'offline' });
        expect(listCallsTo(fetchMock, '/api/memories/memory-1')).toHaveLength(2);
    });

    it('expires negative health cache sooner than positive cache', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(16_000);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ chars: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ chars: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

        vi.stubGlobal('fetch', fetchMock);

        localStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify({ alive: false, ts: 0 }));
        await expect(listCloudChars()).resolves.toEqual([]);
        expect(listCallsTo(fetchMock, '/health')).toHaveLength(1);

        localStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify({ alive: true, ts: 0 }));
        await expect(listCloudChars()).resolves.toEqual([]);
        expect(listCallsTo(fetchMock, '/health')).toHaveLength(1);
        expect(listCallsTo(fetchMock, '/api/memories/chars')).toHaveLength(2);
    });

    it('uses the shared health timeout for backend liveness probes', async () => {
        const timeoutMock = vi.fn(() => new AbortController().signal);
        Object.defineProperty(AbortSignal, 'timeout', {
            configurable: true,
            value: timeoutMock,
        });

        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ chars: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(listCloudChars()).resolves.toEqual([]);
        expect(timeoutMock).toHaveBeenNthCalledWith(1, BACKEND_HEALTH_TIMEOUT_MS);
    });

    it('logs structured backend error details when createHormoneBackfillJob fails', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: 'Semantic job schema is missing on this database',
                details: 'no such table: semantic_jobs',
                action: 'Apply migrations/2026-04-04-semantic-invalidation-and-jobs.sql to this environment before retrying.',
            }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        vi.stubGlobal('fetch', fetchMock);

        await expect(createHormoneBackfillJob(
            'char-1',
            'Sully',
            [{ memoryId: 'm1', messages: [{ role: 'user', content: 'hi' }] }],
            { baseUrl: 'https://llm.example.com', model: 'gpt-test', apiKey: 'llm-key' },
        )).resolves.toBeNull();

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Create hormone job error 503: Semantic job schema is missing on this database'));
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no such table: semantic_jobs'));
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('migrations/2026-04-04-semantic-invalidation-and-jobs.sql'));
    });
});
