const FULLSCREEN_ENABLED_KEY = 'os_fullscreen_enabled';
export const FULLSCREEN_RESTORE_THROTTLE_MS = 2500;

let lastFullscreenRestoreRequestAt: number | null = null;

/**
 * Checks whether the user enabled immersive fullscreen mode.
 */
export function isFullscreenEnabled(): boolean {
  try {
    return localStorage.getItem(FULLSCREEN_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Requests browser fullscreen when the user enabled the preference.
 */
export function requestSystemFullscreen(): void {
  if (typeof document === 'undefined') return;
  if (!isFullscreenEnabled()) return;

  const el = document.documentElement;
  const request =
    el.requestFullscreen ||
    (el as any).webkitRequestFullscreen ||
    (el as any).mozRequestFullScreen ||
    (el as any).msRequestFullscreen;

  if (request && !document.fullscreenElement) {
    request.call(el).catch(() => {
      // Some browsers reject when fullscreen is unsupported or not gesture-initiated.
    });
  }
}

/**
 * Requests fullscreen from high-frequency mobile gestures without hammering
 * the browser fullscreen API on every touch/click pair.
 */
export function requestSystemFullscreenForMobileRestore(now = Date.now()): void {
  if (typeof document === 'undefined') return;
  if (!isFullscreenEnabled()) return;
  if (document.fullscreenElement) return;
  if (
    lastFullscreenRestoreRequestAt !== null &&
    now - lastFullscreenRestoreRequestAt < FULLSCREEN_RESTORE_THROTTLE_MS
  ) {
    return;
  }

  lastFullscreenRestoreRequestAt = now;
  requestSystemFullscreen();
}

/**
 * Exits browser fullscreen.
 */
export function exitSystemFullscreen(): void {
  if (typeof document === 'undefined') return;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

export function resetSystemFullscreenRestoreThrottleForTests(): void {
  lastFullscreenRestoreRequestAt = null;
}
