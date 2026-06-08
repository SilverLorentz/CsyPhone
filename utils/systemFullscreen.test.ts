// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import {
  FULLSCREEN_RESTORE_THROTTLE_MS,
  requestSystemFullscreenForMobileRestore,
  resetSystemFullscreenRestoreThrottleForTests,
} from './systemFullscreen';

describe('requestSystemFullscreenForMobileRestore', () => {
  let fullscreenElement: Element | null;
  let requestFullscreen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    resetSystemFullscreenRestoreThrottleForTests();
    fullscreenElement = null;
    requestFullscreen = vi.fn(() => Promise.resolve());

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
  });

  it('throttles repeated restore attempts from touch and click gestures', () => {
    localStorage.setItem('os_fullscreen_enabled', 'true');

    requestSystemFullscreenForMobileRestore(1000);
    requestSystemFullscreenForMobileRestore(1100);
    requestSystemFullscreenForMobileRestore(1000 + FULLSCREEN_RESTORE_THROTTLE_MS - 1);

    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    requestSystemFullscreenForMobileRestore(1000 + FULLSCREEN_RESTORE_THROTTLE_MS);

    expect(requestFullscreen).toHaveBeenCalledTimes(2);
  });

  it('does not spend the throttle window while fullscreen is disabled', () => {
    requestSystemFullscreenForMobileRestore(1000);

    expect(requestFullscreen).not.toHaveBeenCalled();

    localStorage.setItem('os_fullscreen_enabled', 'true');
    requestSystemFullscreenForMobileRestore(1000);

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('skips restore attempts while already in fullscreen', () => {
    localStorage.setItem('os_fullscreen_enabled', 'true');
    fullscreenElement = document.createElement('div');

    requestSystemFullscreenForMobileRestore(1000);

    expect(requestFullscreen).not.toHaveBeenCalled();

    fullscreenElement = null;
    requestSystemFullscreenForMobileRestore(1000);

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });
});
