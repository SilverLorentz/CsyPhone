export type PerformanceModePreference = 'auto' | 'on' | 'off';
export type ResolvedPerformanceMode = 'lite' | 'full';

export interface PerformanceModeSignals {
  width: number;
  reducedMotion: boolean;
  saveData: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export interface PerformanceModeState {
  preference: PerformanceModePreference;
  resolved: ResolvedPerformanceMode;
  signals: PerformanceModeSignals;
}

export const PERFORMANCE_MODE_STORAGE_KEY = 'sullyos_performance_mode';
export const PERFORMANCE_MODE_CHANGE_EVENT = 'sullyos-performance-mode-change';

const VALID_PREFERENCES = new Set<PerformanceModePreference>(['auto', 'on', 'off']);
const DEFAULT_PERFORMANCE_MODE_PREFERENCE: PerformanceModePreference = 'off';
const SMALL_SCREEN_WIDTH = 430;

interface NavigatorWithPerformanceHints extends Navigator {
  connection?: {
    saveData?: boolean;
    addEventListener?: (type: string, listener: EventListener) => void;
    removeEventListener?: (type: string, listener: EventListener) => void;
  };
  deviceMemory?: number;
}

export function normalizePerformanceModePreference(value: unknown): PerformanceModePreference {
  return typeof value === 'string' && VALID_PREFERENCES.has(value as PerformanceModePreference)
    ? value as PerformanceModePreference
    : DEFAULT_PERFORMANCE_MODE_PREFERENCE;
}

export function readPerformanceModePreference(): PerformanceModePreference {
  if (typeof window === 'undefined') return DEFAULT_PERFORMANCE_MODE_PREFERENCE;

  try {
    return normalizePerformanceModePreference(window.localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_PERFORMANCE_MODE_PREFERENCE;
  }
}

export function writePerformanceModePreference(preference: PerformanceModePreference): void {
  if (typeof window === 'undefined') return;

  const safePreference = normalizePerformanceModePreference(preference);
  try {
    window.localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, safePreference);
  } catch {
    // Ignore private mode / quota failures. The in-memory hook refresh still runs.
  }
  window.dispatchEvent(new Event(PERFORMANCE_MODE_CHANGE_EVENT));
}

export function getPerformanceModeSignals(): PerformanceModeSignals {
  const nav = typeof navigator === 'undefined'
    ? undefined
    : navigator as NavigatorWithPerformanceHints;
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    width: typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth,
    reducedMotion,
    saveData: Boolean(nav?.connection?.saveData),
    deviceMemory: nav?.deviceMemory,
    hardwareConcurrency: nav?.hardwareConcurrency,
  };
}

export function resolvePerformanceMode(
  preference: PerformanceModePreference,
  signals: PerformanceModeSignals,
): ResolvedPerformanceMode {
  if (preference === 'on') return 'lite';
  if (preference === 'off') return 'full';

  const isLowCapability =
    signals.width <= SMALL_SCREEN_WIDTH
    || signals.reducedMotion
    || signals.saveData
    || (typeof signals.deviceMemory === 'number' && signals.deviceMemory <= 4)
    || (typeof signals.hardwareConcurrency === 'number' && signals.hardwareConcurrency <= 4);

  return isLowCapability ? 'lite' : 'full';
}

export function getPerformanceModeState(): PerformanceModeState {
  const preference = readPerformanceModePreference();
  const signals = getPerformanceModeSignals();
  return {
    preference,
    signals,
    resolved: resolvePerformanceMode(preference, signals),
  };
}

export function applyPerformanceModeToDocument(
  resolved: ResolvedPerformanceMode,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): void {
  const root = doc?.documentElement;
  if (!root) return;

  root.dataset.performanceMode = resolved;
  root.classList.toggle('sully-perf-lite', resolved === 'lite');
}

export function subscribePerformanceModeChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const reducedMotionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  const nav = typeof navigator === 'undefined'
    ? undefined
    : navigator as NavigatorWithPerformanceHints;

  const handleStorage = (event: StorageEvent) => {
    if (event.key === PERFORMANCE_MODE_STORAGE_KEY) listener();
  };

  window.addEventListener(PERFORMANCE_MODE_CHANGE_EVENT, listener);
  window.addEventListener('resize', listener);
  window.addEventListener('storage', handleStorage);
  reducedMotionQuery?.addEventListener?.('change', listener);
  nav?.connection?.addEventListener?.('change', listener);

  return () => {
    window.removeEventListener(PERFORMANCE_MODE_CHANGE_EVENT, listener);
    window.removeEventListener('resize', listener);
    window.removeEventListener('storage', handleStorage);
    reducedMotionQuery?.removeEventListener?.('change', listener);
    nav?.connection?.removeEventListener?.('change', listener);
  };
}
