/**
 * Shared backend config and auth helpers.
 *
 * Resolution order for backend URL/token is intentionally fixed:
 *   1. localStorage override (debug-only)
 *   2. Vite environment variables
 *   3. code fallback defaults
 */

import {
    readJsonStorage,
    safeLocalStorageGet,
    safeLocalStorageRemove,
    safeLocalStorageSet,
    writeJsonStorage,
} from './storage';

const DEFAULT_BACKEND_URL = 'https://csyos-backend-staging.sully-tts-proxy.workers.dev';
const DEFAULT_TTS_WS_PROXY_URL = 'wss://tts-ws-proxy.sully-tts-proxy.workers.dev/ws';
const DEFAULT_FRONTEND_ORIGIN = 'https://sully-frontend.pages.dev';
const DEFAULT_BACKEND_TOKEN = '';
export const BACKEND_HEALTH_TIMEOUT_MS = 6000;

export const BACKEND_URL_KEY = 'csyos_backend_url';
export const BACKEND_TOKEN_KEY = 'csyos_backend_token';
export const HEALTH_CACHE_KEY = 'csyos_backend_alive';
const USER_ID_KEY = 'csyos_user_id';
export const CLIENT_ID_KEY = 'csyos_client_id';

export type SetUserIdOptions = {
    source: 'manual';
};

type EnvMap = Record<string, string | undefined>;
type BackendQueryValue = string | number | boolean | null | undefined;
export type BackendConfigSource = 'local_override' | 'build_env' | 'default_fallback' | 'missing';
export interface BackendResolutionDebug {
    backendUrl: string | null;
    backendUrlSource: BackendConfigSource;
    hasBackendToken: boolean;
    backendTokenSource: BackendConfigSource;
}
const warnedInvalidBackendUrls = new Set<string>();
let warnedDefaultBackendFallback = false;

function getViteEnv(): EnvMap {
    return ((import.meta as ImportMeta & { env?: EnvMap }).env || {});
}

function readEnvString(key: string): string | null {
    const raw = getViteEnv()[key];
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed || null;
}

function normalizeConfiguredValue(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function normalizeConfiguredUrl(value: string | null | undefined): string | null {
    const normalized = normalizeConfiguredValue(value);
    if (!normalized) return null;
    return normalized.replace(/\/+$/, '') || null;
}

function resolveConfiguredBackendUrl(value: string | null | undefined): string | null {
    const normalized = normalizeConfiguredUrl(value);
    if (!normalized) return null;

    if (normalized.startsWith('/')) {
        const origin = typeof window !== 'undefined' ? window.location?.origin : null;
        if (!origin) return null;

        try {
            return normalizeConfiguredUrl(new URL(normalized, origin).toString());
        } catch {
            return null;
        }
    }

    try {
        const url = new URL(normalized);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return null;
        }
        return normalizeConfiguredUrl(url.toString());
    } catch {
        return null;
    }
}

function warnInvalidBackendUrl(rawValue: string): void {
    if (warnedInvalidBackendUrls.has(rawValue)) return;
    warnedInvalidBackendUrls.add(rawValue);
    console.warn(`[Backend] Ignoring invalid backend URL "${rawValue}" and falling back to the default backend.`);
}

function warnDefaultBackendFallback(): void {
    if (warnedDefaultBackendFallback) return;
    warnedDefaultBackendFallback = true;
    console.warn(
        '[Backend] No VITE_CSYOS_BACKEND_URL configured, falling back to default staging URL. This should NOT happen in production builds.',
    );
}

function isLocalDebugBackendHost(hostname: string): boolean {
    return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '[::1]'
        || hostname.endsWith('.local');
}

function shouldUseStoredBackendOverride(storedUrl: string, envUrl: string | null): boolean {
    if (!envUrl) return true;

    try {
        const stored = new URL(storedUrl);
        const env = new URL(envUrl);
        if (stored.host === env.host) {
            return true;
        }
        if (isLocalDebugBackendHost(stored.hostname)) {
            return true;
        }

        console.warn(
            `[Backend] Ignoring stored backend URL "${storedUrl}" because it does not match the build backend "${envUrl}".`,
        );
        return false;
    } catch {
        return true;
    }
}

export function sanitizeBackendHeader(value: string): string {
    return value ? value.replace(/[^\x20-\x7E]/g, '') : '';
}

export function clearBackendHealthCache(): void {
    safeLocalStorageRemove(HEALTH_CACHE_KEY);
}

export function setBackendHealthCache(alive: boolean): void {
    writeJsonStorage(HEALTH_CACHE_KEY, { alive, ts: Date.now() });
}

export function getBackendHealthCache(): { alive?: boolean; ts?: number } | null {
    return readJsonStorage<{ alive?: boolean; ts?: number }>(HEALTH_CACHE_KEY);
}

function resolveBackendUrlWithSource(): { value: string | null; source: BackendConfigSource } {
    const storedConfigured = normalizeConfiguredValue(safeLocalStorageGet(BACKEND_URL_KEY));
    const envConfigured = normalizeConfiguredValue(readEnvString('VITE_CSYOS_BACKEND_URL'));
    const resolvedStored = resolveConfiguredBackendUrl(storedConfigured);
    const resolvedEnv = resolveConfiguredBackendUrl(envConfigured);

    if (storedConfigured && !resolvedStored) {
        warnInvalidBackendUrl(storedConfigured);
    }
    if (resolvedStored && shouldUseStoredBackendOverride(resolvedStored, resolvedEnv)) {
        return { value: resolvedStored, source: 'local_override' };
    }

    if (envConfigured) {
        if (resolvedEnv) {
            return { value: resolvedEnv, source: 'build_env' };
        }
        warnInvalidBackendUrl(envConfigured);
    }

    if (!storedConfigured && !envConfigured) {
        warnDefaultBackendFallback();
    }

    const fallback = resolveConfiguredBackendUrl(DEFAULT_BACKEND_URL)
        || normalizeConfiguredUrl(DEFAULT_BACKEND_URL);
    return fallback
        ? { value: fallback, source: 'default_fallback' }
        : { value: null, source: 'missing' };
}

function resolveBackendTokenWithSource(): { value: string | null; source: BackendConfigSource } {
    const storedToken = normalizeConfiguredValue(safeLocalStorageGet(BACKEND_TOKEN_KEY));
    if (storedToken) {
        const storedConfigured = normalizeConfiguredValue(safeLocalStorageGet(BACKEND_URL_KEY));
        if (!storedConfigured) {
            return { value: storedToken, source: 'local_override' };
        }

        const resolvedStored = resolveConfiguredBackendUrl(storedConfigured);
        const resolvedEnv = resolveConfiguredBackendUrl(readEnvString('VITE_CSYOS_BACKEND_URL'));
        if (resolvedStored && shouldUseStoredBackendOverride(resolvedStored, resolvedEnv)) {
            return { value: storedToken, source: 'local_override' };
        }
    }

    const envToken = normalizeConfiguredValue(readEnvString('VITE_CSYOS_BACKEND_TOKEN'));
    if (envToken) {
        return { value: envToken, source: 'build_env' };
    }

    const fallbackToken = normalizeConfiguredValue(DEFAULT_BACKEND_TOKEN);
    return fallbackToken
        ? { value: fallbackToken, source: 'default_fallback' }
        : { value: null, source: 'missing' };
}

export function getBackendUrl(): string | null {
    return resolveBackendUrlWithSource().value;
}

export function setBackendUrl(url: string): void {
    const trimmed = normalizeConfiguredUrl(url);
    if (trimmed) {
        safeLocalStorageSet(BACKEND_URL_KEY, trimmed);
    } else {
        safeLocalStorageRemove(BACKEND_URL_KEY);
    }
    clearBackendHealthCache();
}

export function getTtsWsProxyUrl(): string {
    return normalizeConfiguredUrl(readEnvString('VITE_CSYOS_TTS_WS_PROXY_URL'))
        || DEFAULT_TTS_WS_PROXY_URL;
}

export function getFrontendOrigin(): string {
    return normalizeConfiguredUrl(readEnvString('VITE_CSYOS_FRONTEND_ORIGIN'))
        || DEFAULT_FRONTEND_ORIGIN;
}

export function getBackendToken(): string | null {
    return resolveBackendTokenWithSource().value;
}

export function getBackendResolutionDebug(): BackendResolutionDebug {
    const urlResolution = resolveBackendUrlWithSource();
    const tokenResolution = resolveBackendTokenWithSource();
    return {
        backendUrl: urlResolution.value,
        backendUrlSource: urlResolution.source,
        hasBackendToken: Boolean(tokenResolution.value),
        backendTokenSource: tokenResolution.source,
    };
}

export function getUserId(): string {
    let id = safeLocalStorageGet(USER_ID_KEY);
    if (!id) {
        let uuid: string;
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            uuid = crypto.randomUUID();
        } else {
            uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
                const rand = Math.random() * 16 | 0;
                const value = char === 'x' ? rand : (rand & 0x3 | 0x8);
                return value.toString(16);
            });
        }
        id = `csy-${uuid}`;
        safeLocalStorageSet(USER_ID_KEY, id);
        console.log(`[Identity] Generated new Sync Code: ${id}`);
    }
    return id;
}

export function getClientId(): string {
    let id = safeLocalStorageGet(CLIENT_ID_KEY);
    if (!id) {
        let uuid: string;
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            uuid = crypto.randomUUID();
        } else {
            uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
                const rand = Math.random() * 16 | 0;
                const value = char === 'x' ? rand : (rand & 0x3 | 0x8);
                return value.toString(16);
            });
        }
        id = `csy-client-${uuid}`;
        safeLocalStorageSet(CLIENT_ID_KEY, id);
        console.log(`[Identity] Generated new Client ID: ${id}`);
    }
    return id;
}

export function setUserId(id: string, options: SetUserIdOptions): void {
    if (options?.source !== 'manual') {
        console.warn('[Identity] Ignored non-manual Sync Code update.');
        return;
    }

    const trimmed = id.trim();
    if (trimmed) {
        safeLocalStorageSet(USER_ID_KEY, trimmed);
        clearBackendHealthCache();
        console.log(`[Identity] Bound to Sync Code: ${trimmed}`);
    }
}

export function buildBackendUrl(
    path: string,
    query?: Record<string, BackendQueryValue>,
): string {
    const url = buildBackendUrlObject(path, query);
    return url ? url.toString() : path;
}

export function buildBackendUrlObject(
    path: string,
    query?: Record<string, BackendQueryValue>,
): URL | null {
    const base = getBackendUrl();
    if (!base) return null;

    let url: URL;
    try {
        let baseUrlStr = `${base}/`;
        // Try parsing first, if it fails, prepend origin
        try {
            new URL(baseUrlStr);
        } catch {
            const origin = typeof window !== 'undefined' ? window.location?.origin : 'http://localhost';
            baseUrlStr = new URL(baseUrlStr, origin).toString();
        }
        url = new URL(path, baseUrlStr);

        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value === undefined || value === null || value === '') continue;
                url.searchParams.set(key, String(value));
            }
        }

        return url;
    } catch (error: any) {
        console.warn(`[Backend] Failed to construct backend URL for "${path}": ${error?.message || error}. Base was [${base}]`);
        return null;
    }
}

export function buildBackendHeaders(options: {
    contentType?: string | false;
    extra?: Record<string, string>;
} = {}): Record<string, string> {
    const headers: Record<string, string> = {};

    if (options.contentType !== false) {
        headers['Content-Type'] = options.contentType || 'application/json';
    }

    const token = getBackendToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    headers['X-User-Id'] = sanitizeBackendHeader(getUserId());
    headers['X-Client-Id'] = sanitizeBackendHeader(getClientId());

    if (options.extra) {
        for (const [key, value] of Object.entries(options.extra)) {
            if (value) headers[key] = value;
        }
    }

    return headers;
}

export function buildBackendAuthQuery(options: {
    tokenKey?: string;
    userIdKey?: string;
    clientIdKey?: string;
} = {}): string {
    const params = new URLSearchParams();
    const token = getBackendToken();
    if (token) {
        params.set(options.tokenKey || 'token', token);
    }
    params.set(options.userIdKey || 'userId', getUserId());
    params.set(options.clientIdKey || '_clientId', getClientId());
    return params.toString();
}
