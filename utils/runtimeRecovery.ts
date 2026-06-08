export type BuildInfo = {
  buildId: string;
  builtAt: string;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ReloadFn = () => void;

const BUILD_INFO_PATH = 'build-info.json';
const CHUNK_RELOAD_SESSION_KEY = 'sullyos_chunk_reload_attempted';
const RUNTIME_NOTICE_ID = 'sullyos-runtime-notice';
const VERSION_PROBE_THROTTLE_MS = 1500;
const DEFAULT_RELOAD_DELAY_MS = 350;
const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'ChunkLoadError',
  'Importing a module script failed',
  'Loading chunk',
];

let versionProbePromise: Promise<boolean> | null = null;
let lastVersionProbeAt = 0;
let reloadQueued = false;

function defaultReload(): void {
  window.location.reload();
}

function collectErrorTexts(error: unknown): string[] {
  if (!error) {
    return [];
  }

  if (typeof error === 'string') {
    return [error];
  }

  if (error instanceof Error) {
    const texts = [error.name, error.message, error.stack || ''];
    const maybeCause = (error as Error & { cause?: unknown }).cause;
    return maybeCause ? texts.concat(collectErrorTexts(maybeCause)) : texts;
  }

  if (typeof error === 'object') {
    return Object.values(error as Record<string, unknown>).flatMap((value) => collectErrorTexts(value));
  }

  return [String(error)];
}

function getBuildInfoRequestUrl(): string {
  const url = new URL(BUILD_INFO_PATH, window.location.href);
  url.searchParams.set('ts', Date.now().toString());
  return url.toString();
}

function ensureRuntimeNotice(): HTMLDivElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  let notice = document.getElementById(RUNTIME_NOTICE_ID) as HTMLDivElement | null;
  if (notice) {
    return notice;
  }

  notice = document.createElement('div');
  notice.id = RUNTIME_NOTICE_ID;
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  Object.assign(notice.style, {
    position: 'fixed',
    top: 'max(16px, calc(env(safe-area-inset-top) + 8px))',
    left: '50%',
    transform: 'translate3d(-50%, 12px, 0)',
    padding: '10px 14px',
    borderRadius: '999px',
    background: 'rgba(15, 23, 42, 0.92)',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '0.02em',
    boxShadow: '0 16px 40px rgba(15, 23, 42, 0.22)',
    opacity: '0',
    transition: 'opacity 180ms ease, transform 180ms ease',
    zIndex: '2147483647',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    maxWidth: 'calc(100vw - 32px)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(notice);
  return notice;
}

export function getCurrentBuildId(): string {
  return typeof __APP_BUILD_ID__ === 'string' && __APP_BUILD_ID__.trim()
    ? __APP_BUILD_ID__
    : 'dev';
}

export function isChunkLoadError(error: unknown): boolean {
  const haystack = collectErrorTexts(error).join('\n').toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => haystack.includes(pattern.toLowerCase()));
}

export function hasAttemptedChunkReload(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function showRuntimeNotice(message: string): void {
  const notice = ensureRuntimeNotice();
  if (!notice) {
    return;
  }

  notice.textContent = message;
  requestAnimationFrame(() => {
    notice.style.opacity = '1';
    notice.style.transform = 'translate3d(-50%, 0, 0)';
  });
}

export function reloadApplication(
  message = '检测到新版本，正在刷新…',
  delayMs = DEFAULT_RELOAD_DELAY_MS,
  reload: ReloadFn = defaultReload,
): boolean {
  if (typeof window === 'undefined' || reloadQueued) {
    return false;
  }

  reloadQueued = true;
  showRuntimeNotice(message);
  window.setTimeout(() => reload(), delayMs);
  return true;
}

export function attemptChunkAutoReload(error: unknown, reload: ReloadFn = defaultReload): boolean {
  if (!isChunkLoadError(error) || hasAttemptedChunkReload()) {
    return false;
  }

  try {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1');
  } catch {
    // ignore
  }

  return reloadApplication('检测到资源加载失败，正在刷新应用…', DEFAULT_RELOAD_DELAY_MS, reload);
}

export async function fetchRemoteBuildInfo(fetchImpl?: FetchLike): Promise<BuildInfo | null> {
  const effectiveFetch = fetchImpl ?? (typeof window !== 'undefined' ? window.fetch?.bind(window) : undefined);
  if (!effectiveFetch || typeof window === 'undefined') {
    return null;
  }

  try {
    const response = await effectiveFetch(getBuildInfoRequestUrl(), {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Partial<BuildInfo>;
    if (typeof payload.buildId !== 'string' || typeof payload.builtAt !== 'string') {
      return null;
    }

    return {
      buildId: payload.buildId,
      builtAt: payload.builtAt,
    };
  } catch {
    return null;
  }
}

export function shouldRefreshForBuild(remote: BuildInfo | null, currentBuildId = getCurrentBuildId()): remote is BuildInfo {
  return Boolean(remote?.buildId && remote.buildId !== currentBuildId);
}

export async function probeForUpdatedBuild(
  fetchImpl?: FetchLike,
  reload: ReloadFn = defaultReload,
): Promise<boolean> {
  if (typeof window === 'undefined' || reloadQueued) {
    return false;
  }

  const now = Date.now();
  if (versionProbePromise || now - lastVersionProbeAt < VERSION_PROBE_THROTTLE_MS) {
    return false;
  }

  lastVersionProbeAt = now;
  versionProbePromise = (async () => {
    const remoteBuildInfo = await fetchRemoteBuildInfo(fetchImpl);
    if (!shouldRefreshForBuild(remoteBuildInfo)) {
      return false;
    }

    return reloadApplication('检测到新版本，正在刷新…', DEFAULT_RELOAD_DELAY_MS, reload);
  })();

  try {
    return await versionProbePromise;
  } finally {
    versionProbePromise = null;
  }
}

export function resetRuntimeRecoveryStateForTests(): void {
  versionProbePromise = null;
  lastVersionProbeAt = 0;
  reloadQueued = false;

  try {
    sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY);
  } catch {
    // ignore
  }

  const notice = typeof document !== 'undefined' ? document.getElementById(RUNTIME_NOTICE_ID) : null;
  notice?.remove();
}
