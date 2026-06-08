import { readJsonStorage,safeLocalStorageSet } from './storage';

export type ApiTraceFeature =
    | 'chat'
    | 'memory'
    | 'summary'
    | 'tts'
    | 'phone'
    | 'loveshow'
    | 'love_show'
    | 'zhaixinglou'
    | 'date'
    | 'theater'
    | 'newspaper'
    | 'image'
    | 'unknown';

export type ApiRequestStatus = 'pending' | 'success' | 'failed' | 'aborted';

export interface ApiRequestLogEntry {
    requestId: string;
    timestamp: string;
    feature: ApiTraceFeature;
    reason: string;
    provider: string;
    endpoint?: string;
    model?: string;
    conversationId?: string;
    messageId?: string | number;
    status: ApiRequestStatus;
    retryCount: number;
    durationMs?: number;
    errorMessage?: string;
    userInitiated: boolean;
}

export interface ApiRequestTraceMeta {
    feature?: ApiTraceFeature;
    reason?: string;
    provider?: string;
    model?: string;
    conversationId?: string;
    messageId?: string | number;
    userInitiated?: boolean;
    dedupeKey?: string;
    retryCount?: number;
    url?: string;
}

export interface TrackedApiRequestContext {
    requestId: string;
}

export class ApiRequestDedupedError extends Error {
    requestId: string;

    constructor(requestId: string) {
        super('API request is already pending');
        this.name = 'ApiRequestDedupedError';
        this.requestId = requestId;
    }
}

const STORAGE_KEY = 'sully_api_request_ledger_v1';
const MAX_LOG_ENTRIES = 500;
const LEDGER_UPDATED_EVENT = 'sully-api-request-ledger-updated';
const pendingDedupeKeys = new Map<string, string>();

function nowIso(): string {
    return new Date().toISOString();
}

function makeRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeMessage(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;

    const raw = value instanceof Error ? value.message : String(value);
    const sanitized = raw
        .replace(/Bearer\s+[\w.\-+/=]+/gi, 'Bearer [REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_\-]{8,}\b/g, 'sk-[REDACTED]')
        .replace(/((?:api[_-]?key|x-api-key|authorization|token|single_use_token)=)[^&\s]+/gi, '$1[REDACTED]')
        .replace(/("(?:apiKey|api_key|authorization|token|single_use_token)"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"');

    return sanitized.slice(0, 500);
}

function inferProviderFromUrl(url?: string): string {
    if (!url) return 'unknown';

    try {
        const host = new URL(url).hostname.toLowerCase();
        if (host.includes('openai')) return 'openai';
        if (host.includes('google') || host.includes('gemini')) return 'gemini';
        if (host.includes('deepseek')) return 'deepseek';
        if (host.includes('anthropic')) return 'anthropic';
        if (host.includes('groq')) return 'groq';
        if (host.includes('siliconflow')) return 'siliconflow';
        if (host.includes('minimax')) return 'minimax';
        if (host.includes('elevenlabs')) return 'elevenlabs';
        if (host.includes('workers.dev') || host.includes('pages.dev')) return 'cloudflare-worker';
        return host;
    } catch {
        return 'unknown';
    }
}

function sanitizeEndpointFromUrl(url?: string): string | undefined {
    if (!url) return undefined;

    try {
        const parsed = new URL(url);
        const path = parsed.pathname || '/';
        return `${parsed.hostname}${path}`;
    } catch {
        return undefined;
    }
}

function normalizeEntry(entry: unknown): ApiRequestLogEntry | null {
    if (!entry || typeof entry !== 'object') return null;
    const raw = entry as Partial<ApiRequestLogEntry>;
    if (!raw.requestId || !raw.timestamp) return null;

    return {
        requestId: String(raw.requestId),
        timestamp: String(raw.timestamp),
        feature: raw.feature || 'unknown',
        reason: raw.reason || 'unknown',
        provider: raw.provider || 'unknown',
        endpoint: typeof raw.endpoint === 'string' ? raw.endpoint : undefined,
        model: raw.model,
        conversationId: raw.conversationId,
        messageId: raw.messageId,
        status: raw.status || 'failed',
        retryCount: Number(raw.retryCount || 0),
        durationMs: raw.durationMs,
        errorMessage: sanitizeMessage(raw.errorMessage),
        userInitiated: raw.userInitiated === true,
    };
}

function readLedger(): ApiRequestLogEntry[] {
    const parsed = readJsonStorage<unknown[]>(STORAGE_KEY);
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map(normalizeEntry)
        .filter((entry): entry is ApiRequestLogEntry => Boolean(entry));
}

function writeLedger(entries: ApiRequestLogEntry[]): void {
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_LOG_ENTRIES)));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(LEDGER_UPDATED_EVENT));
    }
}

function isAbortError(error: unknown): boolean {
    return (
        error instanceof DOMException && error.name === 'AbortError'
    ) || (
        typeof error === 'object'
        && error !== null
        && 'name' in error
        && (error as { name?: unknown }).name === 'AbortError'
    );
}

function beginApiRequest(meta: ApiRequestTraceMeta): ApiRequestLogEntry {
    const entry: ApiRequestLogEntry = {
        requestId: makeRequestId(),
        timestamp: nowIso(),
        feature: meta.feature || 'unknown',
        reason: meta.reason || 'unknown',
        provider: meta.provider || inferProviderFromUrl(meta.url),
        endpoint: sanitizeEndpointFromUrl(meta.url),
        model: meta.model,
        conversationId: meta.conversationId,
        messageId: meta.messageId,
        status: 'pending',
        retryCount: meta.retryCount || 0,
        userInitiated: meta.userInitiated === true,
    };

    writeLedger([...readLedger(), entry]);
    return entry;
}

function patchApiRequest(requestId: string, patch: Partial<ApiRequestLogEntry>): void {
    const sanitizedPatch = { ...patch };
    if ('errorMessage' in sanitizedPatch) {
        sanitizedPatch.errorMessage = sanitizeMessage(sanitizedPatch.errorMessage);
    }
    const next = readLedger().map(entry => (
        entry.requestId === requestId
            ? { ...entry, ...sanitizedPatch }
            : entry
    ));
    writeLedger(next);
}

export function getApiRequestLedger(): ApiRequestLogEntry[] {
    return readLedger();
}

export function isApiRequestDedupePending(dedupeKey: string | undefined): boolean {
    return Boolean(dedupeKey && pendingDedupeKeys.has(dedupeKey));
}

export function setApiRequestRetry(requestId: string, retryCount: number, reason?: string): void {
    patchApiRequest(requestId, {
        retryCount,
        ...(reason ? { reason } : {}),
    });
}

export async function trackedApiRequest<T>(
    meta: ApiRequestTraceMeta,
    run: (context: TrackedApiRequestContext) => Promise<T>,
): Promise<T> {
    const dedupeKey = meta.dedupeKey;
    if (dedupeKey) {
        const pendingRequestId = pendingDedupeKeys.get(dedupeKey);
        if (pendingRequestId) {
            throw new ApiRequestDedupedError(pendingRequestId);
        }
    }

    const entry = beginApiRequest(meta);
    const startedAt = Date.now();
    if (dedupeKey) pendingDedupeKeys.set(dedupeKey, entry.requestId);

    try {
        const result = await run({ requestId: entry.requestId });
        patchApiRequest(entry.requestId, {
            status: 'success',
            durationMs: Date.now() - startedAt,
        });
        return result;
    } catch (error) {
        patchApiRequest(entry.requestId, {
            status: isAbortError(error) ? 'aborted' : 'failed',
            durationMs: Date.now() - startedAt,
            errorMessage: sanitizeMessage(error),
        });
        throw error;
    } finally {
        if (dedupeKey) pendingDedupeKeys.delete(dedupeKey);
    }
}

export function getApiRequestLedgerSummary(referenceTime = Date.now()) {
    const entries = readLedger();
    const dayStart = new Date(referenceTime);
    dayStart.setHours(0, 0, 0, 0);
    const todayStartMs = dayStart.getTime();
    const today = entries.filter(entry => {
        const time = Date.parse(entry.timestamp);
        return Number.isFinite(time) && time >= todayStartMs;
    });

    const featureCounts = today.reduce<Record<ApiTraceFeature, number>>((acc, entry) => {
        acc[entry.feature] = (acc[entry.feature] || 0) + 1;
        return acc;
    }, {
        chat: 0,
        memory: 0,
        summary: 0,
        tts: 0,
        image: 0,
        phone: 0,
        loveshow: 0,
        love_show: 0,
        zhaixinglou: 0,
        date: 0,
        theater: 0,
        newspaper: 0,
        unknown: 0,
    });

    return {
        totalToday: today.length,
        pendingCount: entries.filter(entry => entry.status === 'pending').length,
        featureCounts,
        recent: [...entries].reverse().slice(0, 30),
    };
}

export function exportApiRequestLedgerJson(): string {
    const payload = {
        schemaVersion: 1,
        exportedAt: nowIso(),
        redaction: 'API keys, authorization tokens, prompts, and response bodies are not stored in this ledger.',
        maxEntries: MAX_LOG_ENTRIES,
        entries: readLedger(),
    };

    return JSON.stringify(payload, null, 2);
}

export function clearApiRequestLedger(): void {
    writeLedger([]);
}

export function subscribeApiRequestLedger(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(LEDGER_UPDATED_EVENT, listener);
    window.addEventListener('storage', listener);
    return () => {
        window.removeEventListener(LEDGER_UPDATED_EVENT, listener);
        window.removeEventListener('storage', listener);
    };
}
