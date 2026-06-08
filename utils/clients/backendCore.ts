/**
 * Backend Client - unified backend API wrapper.
 *
 * Provides transparent fallback: if the backend is reachable,
 * use it; otherwise, return null/false and let the frontend
 * handle the flow locally.
 *
 * Runtime config stays on the frontend and is forwarded through HTTP headers.
 * The backend never stores any user model keys.
 */

import {
  BACKEND_HEALTH_TIMEOUT_MS,
  type BackendConfigSource,
  buildBackendUrl,buildBackendHeaders,
  clearBackendHealthCache,
  getBackendHealthCache,
  getBackendResolutionDebug,
  setBackendHealthCache,
  getBackendToken,
  getBackendUrl,sanitizeBackendHeader
} from '../backendConfig';
import {
    getEmbeddingConfig,
    getSecondaryApiConfig,
    getSttConfig,
} from '../runtimeConfig';
import {
    readJsonStorage,
    writeJsonStorage,
} from '../storage';
import { safeTimeoutSignal } from '../safeTimeout';
import { resolveCharacterContentId } from '../db/characterStore';
import { trackedApiRequest } from '../apiRequestLedger';

export {
    getBackendResolutionDebug,
    buildBackendAuthQuery,
    buildBackendUrl,
    buildBackendUrlObject,
    buildBackendHeaders,
    clearBackendHealthCache,
    setBackendHealthCache,
    getBackendToken,
    getBackendUrl,
    getFrontendOrigin,
    getTtsWsProxyUrl,
    getClientId,
    getUserId,
    sanitizeBackendHeader,
    setBackendUrl,
    setUserId,
} from '../backendConfig';
export type { BackendConfigSource } from '../backendConfig';

export interface CloudMemoryMutationResult {
    ok: boolean;
    reason?: 'backend_unavailable' | 'request_failed' | 'not_found';
    cleared?: number;
}

export interface CloudMemoryListOptions {
    vectors?: boolean;
    includeDeprecated?: boolean;
}

export interface CloudHormoneBackfillItem {
    memoryId: string;
    messages: { role: string; content: string; timestamp?: number; id?: number | null }[];
    referenceTimestamp?: number;
    overwrite?: boolean;
}

export interface BackendRetrievalResult {
    fallback: boolean;
    memories: string;
    reason: 'backend_handled' | 'backend_unavailable' | 'backend_error';
}

export type MemoryEmbeddingEngineId = 'standard' | 'enhanced';

export interface SemanticJobRecord {
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

export interface MemoryEmbeddingEngineDefinition {
    id: MemoryEmbeddingEngineId;
    embeddingModel: string;
    rerankModel: string;
    vectorizeBinding: 'VECTOR_INDEX' | 'LEGACY_VECTOR_INDEX';
    defaultMinRawSimilarity: number;
}

export interface MemoryEmbeddingEngineStatus {
    engineId: MemoryEmbeddingEngineId;
    engine: MemoryEmbeddingEngineDefinition;
    previousEngineId?: MemoryEmbeddingEngineId;
    updatedAt: number;
    reindexRequestedAt?: number;
    reindexJob: SemanticJobRecord | null;
}

export interface SwitchMemoryEmbeddingEngineResult {
    ok: boolean;
    changed?: boolean;
    reused?: boolean;
    status?: MemoryEmbeddingEngineStatus;
    reason?: 'backend_unavailable' | 'request_failed' | 'switch_in_progress';
    detail?: string;
}

export interface RetryFailedMemoryEngineReindexResult {
    ok: boolean;
    changed?: boolean;
    reused?: boolean;
    status?: MemoryEmbeddingEngineStatus;
    retriedItems?: number;
    reason?: 'backend_unavailable' | 'request_failed' | 'switch_in_progress' | 'no_failed_items';
    detail?: string;
}

export type BackendHealthStatus = 'idle' | 'checking' | 'ok' | 'missing_config' | 'unavailable' | 'error';
export type BackendRetrievalStatus = 'idle' | 'requesting' | 'backend_handled' | 'backend_unavailable' | 'backend_error';

export interface BackendRuntimeDebugSnapshot {
    backendUrl: string | null;
    backendUrlSource: BackendConfigSource;
    hasBackendToken: boolean;
    backendTokenSource: BackendConfigSource;
    hasEmbeddingKey: boolean;
    embeddingBaseUrl: string | null;
    embeddingModel: string | null;
    healthStatus: BackendHealthStatus;
    healthDetail?: string;
    healthCheckedAt?: number;
    retrievalStatus: BackendRetrievalStatus;
    retrievalDetail?: string;
    retrievalAt?: number;
}

const HEALTH_CACHE_POSITIVE_TTL = 5 * 60 * 1000; // 5 minutes
const HEALTH_CACHE_NEGATIVE_TTL = 15 * 1000;      // 15 seconds
const BACKEND_RUNTIME_DEBUG_KEY = 'csyos_backend_runtime_debug';
const BACKEND_RUNTIME_DEBUG_EVENT = 'csyos-backend-runtime-debug';

function buildBaseBackendRuntimeDebug(): BackendRuntimeDebugSnapshot {
    const resolution = getBackendResolutionDebug();
    const embeddingConfig = getEmbeddingConfig();
    return {
        ...resolution,
        hasEmbeddingKey: Boolean(embeddingConfig.apiKey),
        embeddingBaseUrl: embeddingConfig.baseUrl || null,
        embeddingModel: embeddingConfig.model || null,
        healthStatus: 'idle',
        retrievalStatus: 'idle',
    };
}

function writeBackendRuntimeDebug(snapshot: BackendRuntimeDebugSnapshot): void {
    writeJsonStorage(BACKEND_RUNTIME_DEBUG_KEY, snapshot);

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(BACKEND_RUNTIME_DEBUG_EVENT, { detail: snapshot }));
    }
}

export function publishBackendRuntimeDebug(
    patch: Partial<BackendRuntimeDebugSnapshot>,
): BackendRuntimeDebugSnapshot {
    const base = buildBaseBackendRuntimeDebug();
    const previous = readBackendRuntimeDebugSnapshot();
    const next: BackendRuntimeDebugSnapshot = {
        ...previous,
        ...patch,
        backendUrl: base.backendUrl,
        backendUrlSource: base.backendUrlSource,
        hasBackendToken: base.hasBackendToken,
        backendTokenSource: base.backendTokenSource,
        hasEmbeddingKey: base.hasEmbeddingKey,
        embeddingBaseUrl: base.embeddingBaseUrl,
        embeddingModel: base.embeddingModel,
    };
    writeBackendRuntimeDebug(next);
    return next;
}

export function readBackendRuntimeDebugSnapshot(): BackendRuntimeDebugSnapshot {
    const base = buildBaseBackendRuntimeDebug();
    try {
        const parsed = readJsonStorage<Partial<BackendRuntimeDebugSnapshot>>(BACKEND_RUNTIME_DEBUG_KEY);
        if (!parsed) return base;
        return {
            ...base,
            healthStatus: parsed.healthStatus || base.healthStatus,
            healthDetail: parsed.healthDetail,
            healthCheckedAt: parsed.healthCheckedAt,
            retrievalStatus: parsed.retrievalStatus || base.retrievalStatus,
            retrievalDetail: parsed.retrievalDetail,
            retrievalAt: parsed.retrievalAt,
        };
    } catch {
        return base;
    }
}

export function subscribeBackendRuntimeDebug(
    listener: (snapshot: BackendRuntimeDebugSnapshot) => void,
): () => void {
    if (typeof window === 'undefined') {
        return () => {};
    }

    const handler = (event: Event) => {
        const snapshot = (event as CustomEvent<BackendRuntimeDebugSnapshot>).detail;
        listener(snapshot || readBackendRuntimeDebugSnapshot());
    };

    window.addEventListener(BACKEND_RUNTIME_DEBUG_EVENT, handler as EventListener);
    return () => {
        window.removeEventListener(BACKEND_RUNTIME_DEBUG_EVENT, handler as EventListener);
    };
}

// ─── fetchWithRetry ──────────────────────────────

interface FetchWithRetryOptions {
    maxAttempts?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
}

const createOptionalTimeoutSignal = (timeoutMs: number): AbortSignal | undefined =>
    typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : safeTimeoutSignal(timeoutMs);

function isRetryableNetworkError(err: unknown): boolean {
    if (err instanceof TypeError) return true; // network error
    if (err instanceof DOMException && err.name === 'AbortError') return true; // timeout
    return false;
}

export async function fetchWithRetry(
    input: RequestInfo | URL,
    init?: RequestInit,
    options: FetchWithRetryOptions = {},
): Promise<Response> {
    const { maxAttempts = 3, baseDelayMs = 1000, timeoutMs } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const fetchInit = { ...init };
            // Always use a fresh timeout signal per attempt
            if (timeoutMs) {
                fetchInit.signal = createOptionalTimeoutSignal(timeoutMs);
            }
            return await fetch(input, fetchInit);
        } catch (err: any) {
            lastError = err instanceof Error ? err : new Error(String(err));

            if (!isRetryableNetworkError(err) || attempt >= maxAttempts) {
                throw lastError;
            }

            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            const jitter = Math.random() * delay * 0.3;
            console.warn(`[Retry] Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}, retrying in ${Math.round(delay + jitter)}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        }
    }

    throw lastError || new Error('fetchWithRetry failed');
}

export async function runBackendDiagnostics(): Promise<BackendRuntimeDebugSnapshot> {
    const url = getBackendUrl();
    const token = getBackendToken();

    if (!url || !token) {
        const missing: string[] = [];
        if (!url) missing.push('backend URL');
        if (!token) missing.push('backend token');
        return publishBackendRuntimeDebug({
            healthStatus: 'missing_config',
            healthDetail: `Missing ${missing.join(' and ')}`,
            healthCheckedAt: Date.now(),
        });
    }

    publishBackendRuntimeDebug({
        healthStatus: 'checking',
        healthDetail: 'Checking /health...',
        healthCheckedAt: Date.now(),
    });

    try {
        const resp = await fetchWithRetry(
            buildBackendUrl('/health'),
            { headers: { 'Authorization': `Bearer ${token}` } },
            { maxAttempts: 2, timeoutMs: BACKEND_HEALTH_TIMEOUT_MS, baseDelayMs: 500 },
        );
        const health = await classifyBackendHealthResponse(resp);
        const alive = health.alive;
        setBackendHealthCache(alive);
        return publishBackendRuntimeDebug({
            healthStatus: alive ? 'ok' : 'error',
            healthDetail: health.detail,
            healthCheckedAt: Date.now(),
        });
    } catch (err: any) {
        setBackendHealthCache(false);
        return publishBackendRuntimeDebug({
            healthStatus: 'unavailable',
            healthDetail: err?.message || 'Health check failed',
            healthCheckedAt: Date.now(),
        });
    }
}

async function classifyBackendHealthResponse(resp: Response): Promise<{ alive: boolean; detail: string }> {
    const contentType = resp.headers.get('content-type') || '';
    const baseDetail = `HTTP ${resp.status}`;

    if (!resp.ok) {
        return { alive: false, detail: baseDetail };
    }

    if (/text\/html/i.test(contentType)) {
        return {
            alive: false,
            detail: `${baseDetail}; received HTML instead of backend health response`,
        };
    }

    if (/application\/json/i.test(contentType)) {
        try {
            const data = await resp.clone().json() as { ok?: unknown; status?: unknown };
            if (data?.ok === false || data?.status === 'error') {
                return {
                    alive: false,
                    detail: `${baseDetail}; backend health returned an unhealthy payload`,
                };
            }
        } catch {
            return {
                alive: false,
                detail: `${baseDetail}; invalid backend health JSON`,
            };
        }
    }

    return { alive: true, detail: baseDetail };
}

/**
 * Check if the backend is reachable.
 * Positive results cached for 5 min, negative for 15s.
 */
export async function isBackendAlive(): Promise<boolean> {
    const url = getBackendUrl();
    const token = getBackendToken();
    if (!url || !token) {
        const missing: string[] = [];
        if (!url) missing.push('backend URL');
        if (!token) missing.push('backend token');
        publishBackendRuntimeDebug({
            healthStatus: 'missing_config',
            healthDetail: `Missing ${missing.join(' and ')}`,
            healthCheckedAt: Date.now(),
        });
        return false;
    }

    const cached = getBackendHealthCache();
    if (cached) {
        try {
            const { alive, ts } = cached as { alive?: boolean; ts?: number };
            const ttl = alive ? HEALTH_CACHE_POSITIVE_TTL : HEALTH_CACHE_NEGATIVE_TTL;
            if (typeof ts === 'number' && Date.now() - ts < ttl) {
                publishBackendRuntimeDebug({
                    healthStatus: alive === true ? 'ok' : 'unavailable',
                    healthDetail: alive === true ? 'Health cache hit' : 'Negative health cache hit',
                    healthCheckedAt: ts,
                });
                return alive === true;
            }
        } catch {
            clearBackendHealthCache();
        }
    }

    try {
        const resp = await fetchWithRetry(
            buildBackendUrl('/health'),
            { headers: { 'Authorization': `Bearer ${token}` } },
            { maxAttempts: 2, timeoutMs: BACKEND_HEALTH_TIMEOUT_MS, baseDelayMs: 500 },
        );
        const health = await classifyBackendHealthResponse(resp);
        const alive = health.alive;
        setBackendHealthCache(alive);
        publishBackendRuntimeDebug({
            healthStatus: alive ? 'ok' : 'error',
            healthDetail: health.detail,
            healthCheckedAt: Date.now(),
        });
        return alive;
    } catch (err: any) {
        setBackendHealthCache(false);
        publishBackendRuntimeDebug({
            healthStatus: 'unavailable',
            healthDetail: err?.message || 'Health check failed',
            healthCheckedAt: Date.now(),
        });
        return false;
    }
}

export function buildHeaders(options: { contentType?: string | false } = {}): Record<string, string> {
    const headers = buildBackendHeaders({ contentType: options.contentType });
    const embeddingConfig = getEmbeddingConfig();

    if (embeddingConfig.apiKey) headers['X-Embedding-Key'] = sanitizeBackendHeader(embeddingConfig.apiKey);
    if (embeddingConfig.provider) headers['X-Embedding-Provider'] = sanitizeBackendHeader(embeddingConfig.provider);
    if (embeddingConfig.baseUrl) headers['X-Embedding-Base-URL'] = sanitizeBackendHeader(embeddingConfig.baseUrl);
    if (embeddingConfig.model) headers['X-Embedding-Model'] = sanitizeBackendHeader(embeddingConfig.model);

    if (embeddingConfig.rerankApiKey) headers['X-Rerank-Key'] = sanitizeBackendHeader(embeddingConfig.rerankApiKey);
    if (embeddingConfig.rerankUsePaid) headers['X-Rerank-Use-Paid'] = 'true';

    const sttCfg = getSttConfig();
    if (sttCfg.siliconflowApiKey) headers['X-STT-Silicon-Key'] = sanitizeBackendHeader(sttCfg.siliconflowApiKey);
    if (sttCfg.groqApiKey) headers['X-STT-Groq-Key'] = sanitizeBackendHeader(sttCfg.groqApiKey);

    return headers;
}

export function addLlmHeaders(
    headers: Record<string, string>,
    subApiConfig?: { baseUrl: string; model: string; apiKey: string },
): void {
    if (!subApiConfig) return;
    headers['X-LLM-Key'] = sanitizeBackendHeader(subApiConfig.apiKey);
    headers['X-LLM-Base-URL'] = sanitizeBackendHeader(subApiConfig.baseUrl);
    headers['X-LLM-Model'] = sanitizeBackendHeader(subApiConfig.model);
}

function formatBackendErrorPayload(payload: any): string | undefined {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;

    const parts = [
        typeof payload.error === 'string' ? payload.error.trim() : '',
        typeof payload.details === 'string' ? payload.details.trim() : '',
        typeof payload.action === 'string' ? payload.action.trim() : '',
    ].filter(Boolean);

    if (parts.length === 0) return undefined;
    return parts.join(' | ').slice(0, 700);
}

export async function readBackendErrorDetail(resp: Response): Promise<string | undefined> {
    const raw = await resp.text().catch(() => '');
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    try {
        return formatBackendErrorPayload(JSON.parse(trimmed)) || trimmed.slice(0, 700);
    } catch {
        return trimmed.slice(0, 700);
    }
}

export async function readBackendPayload(resp: Response): Promise<{ detail?: string; payload?: any }> {
    const raw = await resp.text().catch(() => '');
    const trimmed = raw.trim();
    if (!trimmed) return {};

    try {
        const payload = JSON.parse(trimmed);
        return {
            payload,
            detail: formatBackendErrorPayload(payload) || trimmed.slice(0, 700),
        };
    } catch {
        return { detail: trimmed.slice(0, 700) };
    }
}

export async function clearCloudMemoriesLegacyFallback(
    url: string,
    charId: string,
): Promise<CloudMemoryMutationResult> {
    const listHeaders = buildHeaders();
    const listUrl = new URL(`/api/memories/${encodeURIComponent(charId)}`, `${url}/`);
    listUrl.searchParams.set('deprecated', 'true');

    try {
        const listResp = await fetch(listUrl.toString(), {
            headers: listHeaders,
            signal: safeTimeoutSignal(15000),
        });

        if (listResp.status === 404) {
            return { ok: true, cleared: 0 };
        }

        if (!listResp.ok) {
            console.error(`[CloudSync] Legacy clear fallback list error ${listResp.status}`);
            return { ok: false, reason: 'request_failed' };
        }

        const data = await listResp.json();
        const memories = Array.isArray(data?.memories) ? data.memories : [];
        if (memories.length === 0) {
            return { ok: true, cleared: 0 };
        }

        const deleteHeaders = buildHeaders({ contentType: false });
        let cleared = 0;

        for (const memory of memories) {
            const memoryId = typeof memory?.id === 'string' ? memory.id.trim() : '';
            if (!memoryId) continue;

            const deleteResp = await fetch(`${url}/api/memories/${encodeURIComponent(memoryId)}`, {
                method: 'DELETE',
                headers: deleteHeaders,
                signal: safeTimeoutSignal(10000),
            });

            if (deleteResp.status === 404) {
                cleared += 1;
                continue;
            }

            if (!deleteResp.ok) {
                console.error(`[CloudSync] Legacy clear fallback delete error ${deleteResp.status} for ${memoryId}`);
                return { ok: false, reason: 'request_failed' };
            }

            cleared += 1;
        }

        return { ok: true, cleared };
    } catch (err: any) {
        console.error('[CloudSync] Clear memories legacy fallback failed:', err.message);
        clearBackendHealthCache();
        return { ok: false, reason: 'request_failed' };
    }
}

/**
 * Try to retrieve memories from the backend.
 * Only falls back to local when the backend is unavailable.
 */
export async function tryBackendRetrieval(
    charId: string,
    charName: string,
    userName: string,
    contextMsgs: { role: string; content: string; type?: string }[],
    currentHormoneState?: Record<string, number>,
): Promise<BackendRetrievalResult> {
    const alive = await isBackendAlive();
    if (!alive) {
        publishBackendRuntimeDebug({
            retrievalStatus: 'backend_unavailable',
            retrievalDetail: 'Skipped retrieval because backend is unavailable',
            retrievalAt: Date.now(),
        });
        console.warn('🔎 [Backend Debug] Skipping backend retrieval because isBackendAlive returned false');
        return { fallback: true, memories: '', reason: 'backend_unavailable' };
    }

    const url = getBackendUrl()!;
    const contentCharId = await resolveCharacterContentId(charId);
    console.log(`🔎 [Backend Debug] Starting retrieval request to ${url}/api/retrieval/search...`);
    const headers = buildHeaders();
    publishBackendRuntimeDebug({
        retrievalStatus: 'requesting',
        retrievalDetail: 'Posting /api/retrieval/search',
        retrievalAt: Date.now(),
    });

    addLlmHeaders(headers, getSecondaryApiConfig());

    try {
        const resp = await fetchWithRetry(
            `${url}/api/retrieval/search`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ charId: contentCharId, charName, userName, contextMsgs, currentHormoneState }),
            },
            { timeoutMs: 15000, maxAttempts: 2 },
        );

        if (!resp.ok) {
            publishBackendRuntimeDebug({
                retrievalStatus: 'backend_error',
                retrievalDetail: `Retrieval failed with HTTP ${resp.status}`,
                retrievalAt: Date.now(),
            });
            console.warn(`🔎 [Backend] Retrieval error ${resp.status}, falling back to local`);
            return { fallback: true, memories: '', reason: 'backend_error' };
        }

        const data = await resp.json();
        publishBackendRuntimeDebug({
            retrievalStatus: 'backend_handled',
            retrievalDetail: data.memories ? 'Backend handled retrieval and returned memories' : 'Backend handled retrieval with no memory hits',
            retrievalAt: Date.now(),
        });
        console.log(`🔎 [Backend] Retrieval success (${data.elapsed}ms) - found ${data.memories ? 'memories' : '0 memories'}`);
        return { fallback: false, memories: data.memories || '', reason: 'backend_handled' };
    } catch (err: any) {
        publishBackendRuntimeDebug({
            retrievalStatus: 'backend_unavailable',
            retrievalDetail: err?.message || 'Retrieval request failed',
            retrievalAt: Date.now(),
        });
        console.warn('🔎 [Backend] Retrieval failed, falling back to local:', err.message);
        clearBackendHealthCache();
        return { fallback: true, memories: '', reason: 'backend_unavailable' };
    }
}

/**
 * Try to extract memories via the backend.
 * Returns true if backend handled it, false if the frontend should handle it.
 */
export async function tryBackendExtraction(
    charId: string,
    charName: string,
    messages: { role: string; content: string; type?: string; timestamp: number; id?: number }[],
    subApiConfig?: { baseUrl: string; model: string; apiKey: string },
): Promise<boolean> {
    if (!await isBackendAlive()) return false;

    const url = getBackendUrl()!;
    const contentCharId = await resolveCharacterContentId(charId);
    const headers = buildHeaders();
    addLlmHeaders(headers, subApiConfig);

    if (!headers['X-LLM-Key'] || !headers['X-Embedding-Key']) return false;

    try {
        const endpoint = `${url}/api/extraction/extract`;
        const resp = await trackedApiRequest({
            feature: 'memory',
            reason: '后端记忆提取',
            model: subApiConfig?.model,
            conversationId: charId,
            userInitiated: false,
            url: endpoint,
        }, () => fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ charId: contentCharId, charName, messages }),
            signal: safeTimeoutSignal(120000),
        }));

        if (!resp.ok) {
            console.warn(`🔎 [Backend] Extraction error ${resp.status}, falling back to local`);
            return false;
        }

        const data = await resp.json();
        console.log(`🔎 [Backend] Extraction: ${data.created?.length || 0} created, ${data.updated?.length || 0} updated (${data.elapsed}ms)`);
        return true;
    } catch (err: any) {
        console.warn('🔎 [Backend] Extraction failed, falling back to local:', err.message);
        clearBackendHealthCache();
        return false;
    }
}

/**
 * Try to extract memories from call history via the backend.
 */
export async function tryBackendCallExtraction(
    charId: string,
    charName: string,
    callHistory: { role: string; content: string }[],
    callTimestamp: number,
    subApiConfig?: { baseUrl: string; model: string; apiKey: string },
): Promise<boolean> {
    if (!await isBackendAlive()) return false;

    const url = getBackendUrl()!;
    const contentCharId = await resolveCharacterContentId(charId);
    const headers = buildHeaders();
    addLlmHeaders(headers, subApiConfig);

    if (!headers['X-LLM-Key'] || !headers['X-Embedding-Key']) return false;

    try {
        const endpoint = `${url}/api/extraction/extract-call`;
        const resp = await trackedApiRequest({
            feature: 'phone',
            reason: '通话结束记忆提取',
            model: subApiConfig?.model,
            conversationId: charId,
            userInitiated: false,
            url: endpoint,
        }, () => fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ charId: contentCharId, charName, callHistory, callTimestamp }),
            signal: safeTimeoutSignal(60000),
        }));

        if (!resp.ok) return false;

        const data = await resp.json();
        console.log(`🔎 [Backend] Call extraction: ${data.created?.length || 0} created (${data.elapsed}ms)`);
        return true;
    } catch {
        clearBackendHealthCache();
        return false;
    }
}
