import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {
  attemptChunkAutoReload,
  isChunkLoadError,
  probeForUpdatedBuild,
  resetRuntimeRecoveryStateForTests,
  shouldRefreshForBuild,
} from '../utils/runtimeRecovery';

describe('runtimeRecovery', () => {
  beforeEach(() => {
    resetRuntimeRecoveryStateForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetRuntimeRecoveryStateForTests();
  });

  it('recognizes common chunk load failures', () => {
    expect(isChunkLoadError(new Error('ChunkLoadError: Loading chunk 123 failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('ordinary runtime error'))).toBe(false);
  });

  it('auto reloads chunk errors only once per tab session', () => {
    const reload = vi.fn();

    expect(attemptChunkAutoReload(new Error('ChunkLoadError: boom'), reload)).toBe(true);
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(1);

    expect(attemptChunkAutoReload(new Error('ChunkLoadError: boom'), reload)).toBe(false);
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('compares local and remote build ids correctly', () => {
    expect(shouldRefreshForBuild({ buildId: 'same-build', builtAt: '2026-04-07T00:00:00.000Z' }, 'same-build')).toBe(false);
    expect(shouldRefreshForBuild({ buildId: 'next-build', builtAt: '2026-04-07T00:00:00.000Z' }, 'current-build')).toBe(true);
    expect(shouldRefreshForBuild(null, 'current-build')).toBe(false);
  });

  it('schedules a refresh when the remote build id changes', async () => {
    const reload = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ buildId: 'next-build', builtAt: '2026-04-07T00:00:00.000Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(probeForUpdatedBuild(fetchMock as any, reload)).resolves.toBe(true);
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
