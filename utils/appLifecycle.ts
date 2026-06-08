import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { requestSystemFullscreen } from './systemFullscreen';
import { probeForUpdatedBuild } from './runtimeRecovery';

let initialized = false;
let lastForegroundAt = 0;

function forceRepaint() {
  const el = document.documentElement;
  el.style.transform = 'translateZ(1px)';
  requestAnimationFrame(() => {
    el.style.transform = '';
  });
}

function resumeAllAudioContexts() {
  try {
    const anyWin = window as any;
    if (anyWin._audioContexts && Array.isArray(anyWin._audioContexts)) {
      anyWin._audioContexts.forEach((ctx: AudioContext) => {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      });
    }
  } catch {
    // ignore
  }
}

function onForeground() {
  const now = Date.now();
  if (now - lastForegroundAt < 1000) {
    return;
  }
  lastForegroundAt = now;

  forceRepaint();
  requestSystemFullscreen();
  resumeAllAudioContexts();
  window.setTimeout(forceRepaint, 100);
  void probeForUpdatedBuild();
}

export function initAppLifecycle() {
  if (initialized) {
    return;
  }
  initialized = true;

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      onForeground();
    }
  });

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      onForeground();
    }
  }).catch(() => {
    // ignore if listener registration fails
  });
}
