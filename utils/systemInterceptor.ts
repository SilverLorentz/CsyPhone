/**
 * systemInterceptor.ts
 * 
 * Global fetch/console.error interceptor.
 * Initialized ONCE before React mounts (in index.tsx).
 * Communicates captured logs to React via an EventTarget-based emitter.
 */

import { SystemLog } from '../types';

// --- Event-based communication channel ---
type LogListener = (log: SystemLog) => void;

let _listener: LogListener | null = null;
let _initialized = false;

/**
 * Register a callback from React to receive intercepted logs.
 * Call this inside a useEffect in OSContext.
 * Returns an unsubscribe function.
 */
export function onSystemLog(listener: LogListener): () => void {
    _listener = listener;
    return () => {
        if (_listener === listener) {
            _listener = null;
        }
    };
}

function emit(log: SystemLog) {
    if (_listener) {
        _listener(log);
    }
}

/**
 * Initialize global interceptors.
 * MUST be called exactly once, before ReactDOM.createRoot().
 * Safe to call multiple times (idempotent via _initialized guard).
 */
/**
 * Patterns that indicate a non-critical, internal error which should NOT
 * be surfaced to the user in the debug terminal.  These are common browser
 * / infrastructure issues that clutter the log without actionable info.
 */
const SUPPRESSED_ERROR_PATTERNS: RegExp[] = [
    /ISO.8859/i,                          // Header encoding (non-ASCII in headers)
    /Failed to fetch/i,                   // Generic network connectivity
    /NetworkError/i,
    /Load failed/i,
    /AbortError/i,                        // AbortController / signal timeouts
    /user.*aborted/i,
    /request.*aborted/i,
    /operation was aborted/i,
    /operation.*aborted/i,
    /signal.*timed?\s*out/i,
    /ERR_CONNECTION/i,
    /ERR_NAME_NOT_RESOLVED/i,
    /ERR_INTERNET_DISCONNECTED/i,
    /CORS/i,                              // Cross-origin issues (infra, not user)
    /ServiceWorker/i,
    /chunk.*failed/i,                     // Vite HMR chunk loading
    /dynamically imported module/i,
    /ResizeObserver/i,                    // Harmless browser warning
    /\[Agent\]/i,                         // Background autonomous-agent runtime
    /\[Push\]/i,                          // Background Web Push setup/sync
    /CloudSync/i,                         // Background cloud memory sync
    /Unexpected token '<'.*not valid JSON/i, // HTML fallback from unavailable backend routes
];

/**
 * URL paths that are internal / background and whose failures should
 * NOT appear in the user-facing debug terminal.
 */
const SUPPRESSED_URL_PATTERNS: RegExp[] = [
    /\/api\/graph\//i,
    /\/api\/sync\//i,
    /\/api\/agent\//i,
    /\/api\/memory\//i,
    /\/api\/push\//i,
    /\/api\/vector/i,
    /hot-update/i,                        // Vite HMR
    /sockjs-node/i,
    /ws:\/\//i,
];

function isSuppressedError(message: string): boolean {
    return SUPPRESSED_ERROR_PATTERNS.some(p => p.test(message));
}

function isSuppressedUrl(url: string): boolean {
    return SUPPRESSED_URL_PATTERNS.some(p => p.test(url));
}

export function initSystemInterceptor(): void {
    if (_initialized) return;
    _initialized = true;

    // 1. Monkey Patch Fetch
    const originalFetch = window.fetch;
    const patchedFetch = async (...args: [RequestInfo | URL, RequestInit?]) => {
        const [resource] = args;
        const urlStr = String(resource);

        try {
            const response = await originalFetch(...args);

            if (!response.ok) {
                // Only log if it's an important user-facing API call
                if (urlStr.includes('/chat/completions') || urlStr.includes('/models')) {
                    try {
                        const clone = response.clone();
                        const text = await clone.text();
                        emit({
                            id: `log-${Date.now()}`,
                            timestamp: Date.now(),
                            type: 'network',
                            source: 'API Request',
                            message: `HTTP ${response.status} Error`,
                            detail: `URL: ${urlStr}\nResponse: ${text.substring(0, 500)}`
                        });
                    } catch {
                        emit({
                            id: `log-${Date.now()}`,
                            timestamp: Date.now(),
                            type: 'network',
                            source: 'API Request',
                            message: `HTTP ${response.status} (Unreadable Body)`,
                            detail: `URL: ${urlStr}`
                        });
                    }
                }
            }
            return response;
        } catch (err: any) {
            const errMsg = [err?.name, err?.message || 'Fetch Failed']
                .filter(Boolean)
                .join(': ');

            // Suppress non-critical / background network errors
            if (isSuppressedError(errMsg) || isSuppressedUrl(urlStr)) {
                throw err;   // Still throw (caller handles retry), just don't show in UI
            }

            // Only show important fetch errors to user
            if (urlStr.includes('/chat/completions') || urlStr.includes('/models')) {
                emit({
                    id: `log-${Date.now()}`,
                    timestamp: Date.now(),
                    type: 'network',
                    source: 'Network',
                    message: errMsg,
                    detail: `URL: ${urlStr}`
                });
            }
            throw err;
        }
    };

    try {
        window.fetch = patchedFetch;
    } catch {
        try {
            Object.defineProperty(window, 'fetch', {
                value: patchedFetch,
                writable: true,
                configurable: true
            });
        } catch (e2) {
            console.warn("Failed to install network interceptor", e2);
        }
    }

    // 2. Monkey Patch console.error
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
        originalConsoleError(...args);
        const msg = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');

        // Filter out React warnings and non-critical errors
        if (msg.includes('Warning:')) return;
        if (isSuppressedError(msg)) return;

        const detail = args.map(a => (a instanceof Error ? a.stack : '')).join('\n');
        emit({
            id: `log-${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            type: 'error',
            source: 'Application',
            message: msg.substring(0, 100),
            detail: detail || msg
        });
    };
}
