// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {
  applyPerformanceModeToDocument,
  normalizePerformanceModePreference,
  PERFORMANCE_MODE_STORAGE_KEY,
  readPerformanceModePreference,
  resolvePerformanceMode,
  writePerformanceModePreference,
} from './performanceMode';

function setNavigatorHint<K extends keyof Navigator>(key: K, value: Navigator[K]) {
  Object.defineProperty(navigator, key, {
    configurable: true,
    value,
  });
}

describe('performanceMode', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    setNavigatorHint('hardwareConcurrency', 8);
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-performance-mode');
    document.documentElement.classList.remove('sully-perf-lite');
  });

  it('defaults to off when no preference is stored', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    expect(readPerformanceModePreference()).toBe('off');
    expect(resolvePerformanceMode(readPerformanceModePreference(), {
      width: window.innerWidth,
      reducedMotion: false,
      saveData: false,
      hardwareConcurrency: 8,
    })).toBe('full');
  });

  it('normalizes invalid stored values to off', () => {
    localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, 'turbo');

    expect(normalizePerformanceModePreference('turbo')).toBe('off');
    expect(readPerformanceModePreference()).toBe('off');
  });

  it('lets manual on and off override device signals', () => {
    const lowEndSignals = {
      width: 360,
      reducedMotion: true,
      saveData: true,
      deviceMemory: 2,
      hardwareConcurrency: 2,
    };

    expect(resolvePerformanceMode('on', { ...lowEndSignals, width: 1440 })).toBe('lite');
    expect(resolvePerformanceMode('off', lowEndSignals)).toBe('full');
  });

  it('resolves auto to lite for small screens and low capability hints', () => {
    expect(resolvePerformanceMode('auto', {
      width: 430,
      reducedMotion: false,
      saveData: false,
      hardwareConcurrency: 8,
    })).toBe('lite');

    expect(resolvePerformanceMode('auto', {
      width: 1024,
      reducedMotion: false,
      saveData: false,
      deviceMemory: 4,
      hardwareConcurrency: 8,
    })).toBe('lite');

    expect(resolvePerformanceMode('auto', {
      width: 1024,
      reducedMotion: false,
      saveData: false,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    })).toBe('full');
  });

  it('writes preferences and marks the document root', () => {
    writePerformanceModePreference('on');
    expect(localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY)).toBe('on');

    applyPerformanceModeToDocument('lite');
    expect(document.documentElement.dataset.performanceMode).toBe('lite');
    expect(document.documentElement.classList.contains('sully-perf-lite')).toBe(true);

    applyPerformanceModeToDocument('full');
    expect(document.documentElement.dataset.performanceMode).toBe('full');
    expect(document.documentElement.classList.contains('sully-perf-lite')).toBe(false);
  });
});
