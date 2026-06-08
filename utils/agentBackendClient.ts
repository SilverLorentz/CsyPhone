import {
  buildBackendAuthQuery,
  buildBackendHeaders,
  getBackendResolutionDebug,
  buildBackendUrl,
  buildBackendUrlObject,
  getBackendToken,
  getBackendUrl,
} from './backendClient';
import { safeTimeoutSignal } from './safeTimeout';
import type { AgentConfig } from './agentTypes';

export type AgentApiConfig = {
    baseUrl: string;
    apiKey: string;
    model: string;
};

export type AgentWeatherConfig = {
    weatherEnabled: boolean;
    weatherProvider?: 'qweather';
    weatherApiKey?: string;
};

type AgentStartPayload = {
    charId: string;
    apiConfig: AgentApiConfig;
    mainApiConfig?: AgentApiConfig;
    weatherConfig?: AgentWeatherConfig;
    contextSnapshot?: Record<string, unknown>;
    agentConfig?: AgentConfig;
};

class AgentApiError extends Error {
    status: number;

    constructor(status: number, body: string) {
        super(`Agent API ${status}: ${body.slice(0, 200)}`);
        this.name = 'AgentApiError';
        this.status = status;
        Object.setPrototypeOf(this, AgentApiError.prototype);
    }
}

const STOP_REQUEST_DEDUPE_WINDOW_MS = 1500;
const AGENT_PROTOCOL_VERSION = '2';
export const TODAY_SCHEDULE_UPDATED_EVENT_NAME = 'agent-today-schedule-updated';
const lastStopRequestAt = new Map<string, number>();

export type AgentBackendMessage = {
    id: number | string;
    char_id?: string;
    role?: 'user' | 'assistant';
    content: string;
    created_at?: number;
    createdAt?: number;
    target_client_id?: string | null;
    targetClientId?: string | null;
    metadata?: string | Record<string, unknown> | null;
};

export type LifeStreamFragment = {
    id?: number | string;
    fragment: string;
    time_label: string;
    created_at: number;
};

export type LifeStreamSyncState = {
    fragments: LifeStreamFragment[];
    visibleInChat: boolean;
};

export type AgentLifeProfileStatus = 'missing' | 'ready' | 'failed';
export type AgentLifeProfileSection =
    | 'identity'
    | 'rhythm'
    | 'places'
    | 'activities'
    | 'relationship'
    | 'rules'
    | 'notes';

export type AgentLifeProfileSectionMeta = {
    source: 'generated' | 'manual';
    updatedAt: number;
    errorMessage?: string;
    debugCode?: string;
    debugMessage?: string;
};

export type AgentLifePatternSpecificPlace = {
    name: string;
    category: string;
    evidence: string;
    confidence: number;
    usePolicy?: string;
};

export type AgentLifePatternProfile = {
    lifeIdentity: Record<string, unknown>;
    weeklyRhythm: Record<string, unknown>;
    timeRhythm: Record<string, unknown>;
    placeModel: Record<string, unknown> & {
        specificPlaces?: AgentLifePatternSpecificPlace[];
        genericPlaces?: string[];
    };
    activityPalette: Record<string, unknown> & {
        stable?: string[];
        occasional?: string[];
        romanceUsable?: string[];
        privateTexture?: string[];
        lowFrequencyTexture?: string[];
        avoidAsCore?: string[];
    };
    relationshipToUser: Record<string, unknown>;
    variationPolicy: Record<string, unknown>;
    uncertainties: Array<Record<string, unknown>>;
    evidence: Array<Record<string, unknown>>;
};

export type AgentLifeProfileState = {
    status: AgentLifeProfileStatus;
    profile?: AgentLifePatternProfile;
    updatedAt?: number;
    sourceFingerprint?: string;
    errorMessage?: string;
    debugCode?: string;
    debugMessage?: string;
    sectionMeta?: Partial<Record<AgentLifeProfileSection, AgentLifeProfileSectionMeta>>;
};

export type AgentTodayLifeEnsureStatus = 'ready' | 'preparing' | 'fallback' | 'failed';

export type AgentTodayLifeEnsureResponse = {
    status: AgentTodayLifeEnsureStatus;
    localDate: string;
    timeLabel: string;
    visibleMessage: string;
    debugCode?: string;
    debugMessage?: string;
};

export type AgentScheduleSignal = 'none' | 'soft' | 'candidate' | 'direct';

export type AgentScheduleRevisionNode = {
    startTime?: string;
    endTime?: string;
    timeHint: string;
    place?: string;
    title: string;
    description: string;
    mode?: 'stable' | 'loose';
    durationMin?: number;
};

export type AgentScheduleRevision = {
    id: string;
    localDate: string;
    targetOriginalNodeId?: string;
    targetOriginalNodeHint?: string;
    changeType: 'cancel' | 'delay' | 'replace' | 'insert';
    newSchedule?: AgentScheduleRevisionNode;
    reason: string;
    innerVoice?: string;
    scheduleSignal?: AgentScheduleSignal;
    scheduleReason?: string;
    source: 'generated' | 'manual';
    sourceMessageIds?: string[];
    createdAt: number;
    updatedAt: number;
    debugCode?: string;
    debugMessage?: string;
};

export type AgentDaySnapshotNode = {
    id?: string;
    startTime?: string;
    endTime?: string;
    timeHint: string;
    place: string;
    mode: 'stable' | 'loose';
    plan: string;
    whyNatural: string;
    durationMin?: number;
};

export type AgentDaySnapshot = {
    schemaVersion?: number;
    localDate: string;
    timezone: string;
    weekday: string;
    isWorkday: boolean;
    dayTone: string;
    baseRhythm: string;
    planNodes: AgentDaySnapshotNode[];
    aftertasteSeed: string;
    weatherSummary?: string;
    generatedAt: number;
};

export type AgentEffectiveScheduleItem = {
    id: string;
    kind: 'original' | 'revision';
    startTime?: string;
    endTime?: string;
    timeHint: string;
    place?: string;
    title: string;
    description: string;
    mode?: 'stable' | 'loose';
    cancelled?: boolean;
    cancelledByRevisionId?: string;
    reason?: string;
    innerVoice?: string;
    revision?: AgentScheduleRevision;
};

export type AgentTodayScheduleState = {
    status: 'ready' | 'missing' | 'failed';
    localDate: string;
    timezone: string;
    daySnapshot?: AgentDaySnapshot;
    revisions: AgentScheduleRevision[];
    effectiveItems: AgentEffectiveScheduleItem[];
    visibleMessage?: string;
    debugCode?: string;
    debugMessage?: string;
    rewritten?: boolean;
    revision?: AgentScheduleRevision;
};

export type AgentTickResult = {
    action: string;
    messageGenerated: boolean;
    messageContent?: string;
    messageBubbles?: string[];
    charName?: string;
    reason?: string;
    skipped?: string;
    nextCheckAt?: number;
};

function withAgentProtocolQuery(
    query?: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean | null | undefined> {
    return {
        ...(query || {}),
        agentProtocol: AGENT_PROTOCOL_VERSION,
    };
}

function getTimeoutMs(path: string): number {
    if (path.startsWith('/api/agent/start')) return 45000;
    if (path.startsWith('/api/agent/life-profile/generate')) return 180000;
    if (path.startsWith('/api/agent/today-life/ensure')) return 180000;
    if (path.startsWith('/api/agent/today-life/revision/generate')) return 60000;
    return 15000;
}

async function agentFetch<T = any>(
    path: string,
    options: RequestInit = {},
    query?: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
    const baseUrl = getBackendUrl();
    const token = getBackendToken();
    if (!baseUrl || !token) {
        const resolution = getBackendResolutionDebug();
        const missing: string[] = [];
        if (!baseUrl) {
            missing.push(`backend URL (source=${resolution.backendUrlSource})`);
        }
        if (!token) {
            missing.push(`backend token (source=${resolution.backendTokenSource})`);
        }
        throw new Error(
            `Backend config missing: ${missing.join(', ')}. `
            + 'Check VITE_CSYOS_BACKEND_URL / VITE_CSYOS_BACKEND_TOKEN or localStorage overrides csyos_backend_url / csyos_backend_token.',
        );
    }

    const headers = new Headers(buildBackendHeaders());
    for (const [key, value] of new Headers(options.headers || {})) {
        headers.set(key, value);
    }

    const response = await fetch(buildBackendUrl(path, query), {
        ...options,
        headers,
        signal: options.signal || safeTimeoutSignal(getTimeoutMs(path)),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new AgentApiError(response.status, text);
    }

    return response.json() as Promise<T>;
}

function shouldRetryAgentFetch(error: unknown): boolean {
    const status = (error as { status?: unknown })?.status;
    if (typeof status === 'number') {
        return status === 408 || status === 429 || status >= 500;
    }

    const name = String((error as { name?: unknown })?.name || '');
    const message = String((error as { message?: unknown })?.message || error || '');
    return /abort|timeout|network|failed to fetch/i.test(`${name} ${message}`);
}

async function agentFetchWithRetry<T = any>(
    path: string,
    options: RequestInit = {},
    maxRetries = 2,
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await agentFetch<T>(path, options);
        } catch (error) {
            lastError = error;
            if (attempt >= maxRetries || !shouldRetryAgentFetch(error)) {
                break;
            }

            const delay = 1000 * Math.pow(2, attempt);
            console.warn(`[Agent] ${path} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

export async function startAgentOnBackend(payload: AgentStartPayload): Promise<void> {
    lastStopRequestAt.delete(payload.charId);
    await agentFetchWithRetry('/api/agent/start', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export function stopAgentOnBackend(charId: string): void {
    try {
        const shouldSkipDuplicateStop = () => {
            const now = Date.now();
            const lastRequestedAt = lastStopRequestAt.get(charId);
            if (lastRequestedAt && now - lastRequestedAt < STOP_REQUEST_DEDUPE_WINDOW_MS) {
                return true;
            }
            lastStopRequestAt.set(charId, now);
            return false;
        };

        const baseUrl = getBackendUrl();
        const token = getBackendToken();
        const canUseBeacon = baseUrl
            && token
            && typeof navigator !== 'undefined'
            && typeof navigator.sendBeacon === 'function';

        if (canUseBeacon) {
            const blob = new Blob(
                [JSON.stringify({ charId })],
                { type: 'application/json' },
            );
            const url = buildBackendUrlObject('/api/agent/stop');
            if (url) {
                const authParams = new URLSearchParams(
                    buildBackendAuthQuery({ tokenKey: '_token', userIdKey: '_userId' }),
                );
                for (const [key, value] of authParams.entries()) {
                    url.searchParams.set(key, value);
                }

                if (shouldSkipDuplicateStop()) return;
                const sent = navigator.sendBeacon(url.toString(), blob);
                if (sent) return;
                lastStopRequestAt.delete(charId);
            }
        }

        if (shouldSkipDuplicateStop()) return;
        agentFetch('/api/agent/stop', {
            method: 'POST',
            body: JSON.stringify({ charId }),
        }).catch((error) => {
            console.warn('[Agent] Failed to stop backend agent:', error instanceof Error ? error.message : error);
        });
    } catch (error) {
        console.warn('[Agent] Failed to stop backend agent:', error instanceof Error ? error.message : error);
    }
}

export function buildAgentSseUrl(charId: string): string | null {
    const baseUrl = getBackendUrl();
    const token = getBackendToken();
    if (!baseUrl || !token) return null;

    try {
        const url = buildBackendUrlObject('/api/agent/stream', { charId });
        if (!url) return null;
        url.searchParams.set('agentProtocol', AGENT_PROTOCOL_VERSION);

        const authParams = new URLSearchParams(buildBackendAuthQuery());
        for (const [key, value] of authParams.entries()) {
            url.searchParams.set(key, value);
        }

        return url.toString();
    } catch (error) {
        console.warn('[Agent] Failed to build SSE URL:', error instanceof Error ? error.message : error);
        return null;
    }
}

export async function pushAgentContextSnapshot(
    contextSnapshot: Record<string, unknown>,
): Promise<void> {
    await agentFetch('/api/agent/context', {
        method: 'POST',
        body: JSON.stringify(contextSnapshot),
    });
}

export async function fetchPendingAgentMessages(charId: string, options?: { includeDelivered?: boolean }): Promise<AgentBackendMessage[]> {
    const query: Record<string, string> = { charId };
    if (options?.includeDelivered) {
        query.include_delivered = '1';
    }
    const data = await agentFetch<{ messages?: AgentBackendMessage[] }>(
        '/api/agent/messages',
        {},
        withAgentProtocolQuery(query),
    );
    return data.messages || [];
}

export async function ackAgentMessages(
    ids: Array<number | string>,
): Promise<void> {
    if (ids.length === 0) return;

    await agentFetch('/api/agent/messages/ack', {
        method: 'POST',
        body: JSON.stringify({ ids }),
    });
}

export async function fetchAgentLifeStream(charId: string): Promise<LifeStreamSyncState> {
    const data = await agentFetch<{ fragments?: LifeStreamFragment[]; visibleInChat?: boolean }>(
        '/api/agent/lifestream',
        {},
        { charId },
    );
    return {
        fragments: data.fragments || [],
        visibleInChat: data.visibleInChat === true,
    };
}

export async function fetchAgentLifeProfile(charId: string): Promise<AgentLifeProfileState> {
    return agentFetch<AgentLifeProfileState>(
        '/api/agent/life-profile',
        {},
        { charId },
    );
}

export async function generateAgentLifeProfile(
    charId: string,
    contextSnapshot: Record<string, unknown>,
    apiConfig?: AgentApiConfig,
): Promise<AgentLifeProfileState> {
    return agentFetch<AgentLifeProfileState>('/api/agent/life-profile/generate', {
        method: 'POST',
        body: JSON.stringify({
            charId,
            contextSnapshot,
            ...(apiConfig ? { apiConfig } : {}),
        }),
    });
}

export async function updateAgentLifeProfileSection(
    charId: string,
    section: AgentLifeProfileSection,
    value: Record<string, unknown>,
    contextSnapshot?: Record<string, unknown>,
): Promise<AgentLifeProfileState> {
    return agentFetch<AgentLifeProfileState>('/api/agent/life-profile/section', {
        method: 'PATCH',
        body: JSON.stringify({
            charId,
            section,
            value,
            ...(contextSnapshot ? { contextSnapshot } : {}),
        }),
    });
}

export async function ensureAgentTodayLife(
    charId: string,
    contextSnapshot: Record<string, unknown>,
    options: {
        apiConfig?: AgentApiConfig;
        mainApiConfig?: AgentApiConfig;
        weatherConfig?: AgentWeatherConfig;
    } = {},
): Promise<AgentTodayLifeEnsureResponse> {
    return agentFetch<AgentTodayLifeEnsureResponse>('/api/agent/today-life/ensure', {
        method: 'POST',
        body: JSON.stringify({
            charId,
            contextSnapshot,
            ...(options.apiConfig ? { apiConfig: options.apiConfig } : {}),
            ...(options.mainApiConfig ? { mainApiConfig: options.mainApiConfig } : {}),
            ...(options.weatherConfig ? { weatherConfig: options.weatherConfig } : {}),
        }),
    });
}

export async function fetchAgentTodaySchedule(charId: string): Promise<AgentTodayScheduleState> {
    return agentFetch<AgentTodayScheduleState>(
        '/api/agent/today-life/schedule',
        {},
        { charId },
    );
}

export async function generateAgentScheduleRevision(
    charId: string,
    payload: {
        contextSnapshot?: Record<string, unknown>;
        mainApiConfig?: AgentApiConfig;
        apiConfig?: AgentApiConfig;
        weatherConfig?: AgentWeatherConfig;
        scheduleSignal: AgentScheduleSignal;
        scheduleReason?: string;
        assistantReply?: string;
        sourceMessageIds?: string[];
    },
): Promise<AgentTodayScheduleState> {
    return agentFetch<AgentTodayScheduleState>('/api/agent/today-life/revision/generate', {
        method: 'POST',
        body: JSON.stringify({
            charId,
            ...payload,
        }),
    });
}

export async function saveAgentScheduleRevision(
    charId: string,
    revision: Partial<AgentScheduleRevision> | Record<string, unknown>,
    contextSnapshot?: Record<string, unknown>,
): Promise<AgentTodayScheduleState> {
    return agentFetch<AgentTodayScheduleState>('/api/agent/today-life/revision', {
        method: 'POST',
        body: JSON.stringify({
            charId,
            revision,
            ...(contextSnapshot ? { contextSnapshot } : {}),
        }),
    });
}

export async function requestAgentTick(
    charId: string,
): Promise<{ ok: boolean; result?: AgentTickResult }> {
    return agentFetch('/api/agent/tick', {
        method: 'POST',
        body: JSON.stringify({ charId }),
    });
}

export async function notifyAgentUserReplied(charId: string): Promise<void> {
    await agentFetch('/api/agent/user-replied', {
        method: 'POST',
        body: JSON.stringify({ charId }),
    });
}
