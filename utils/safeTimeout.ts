/**
 * safeTimeout.ts — Safari-compatible AbortSignal.timeout() helper.
 *
 * `AbortSignal.timeout()` is not supported in Safari < 16.4 (iOS < 16.4).
 * Calling it directly on older Safari throws a TypeError at runtime,
 * which can crash init-time code (keepAlive, heartbeat, etc.) and
 * prevent the entire app from loading.
 *
 * This helper provides the same semantics via a setTimeout + AbortController
 * fallback when the native method is unavailable.
 */

/**
 * Create an AbortSignal that automatically aborts after `ms` milliseconds.
 * Uses the native `AbortSignal.timeout()` when available; otherwise falls
 * back to a manual AbortController + setTimeout.
 */
export function safeTimeoutSignal(ms: number): AbortSignal {
    if (typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(ms);
    }

    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), ms);
    return controller.signal;
}

/**
 * Return an AbortSignal or `undefined`.
 * Useful in places where `signal` is optional and the caller doesn't
 * want to pass a value at all when the native API is missing.
 */
export function optionalTimeoutSignal(ms: number): AbortSignal | undefined {
    if (typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(ms);
    }
    // Fallback — still provide a real signal
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), ms);
    return controller.signal;
}
