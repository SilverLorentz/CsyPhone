/**
 * Application keep-alive utility using Web Locks API.
 * This prevents the browser from aggressively freezing the background page.
 */

import {
  BACKEND_HEALTH_TIMEOUT_MS,
  buildBackendUrl,
  getBackendToken,
  setBackendHealthCache,
} from './backendConfig';
import { safeTimeoutSignal } from './safeTimeout';

let isKeepAliveStarted = false;
let isHeartbeatStarted = false;

const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

export function startKeepAlive() {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    console.warn('Web Locks API not supported, keep-alive may not work.');
    return;
  }
  
  if (isKeepAliveStarted) return;
  isKeepAliveStarted = true;

  console.log('Starting app keep-alive via Web Locks API...');

  // Web Lock helps prevent browser from completely freezing the page
  void navigator.locks.request('app-keep-alive', { mode: 'shared' }, () => {
    return new Promise<void>(() => {
      // Never resolve, keep the lock active as long as the page lives
    });
  });
}

/**
 * Periodic backend heartbeat — independent of Web Locks.
 * Pings /health every 3 minutes + on foreground resume.
 * Refreshes health cache on success.
 */
export function startBackendHeartbeat() {
  if (isHeartbeatStarted) return;
  isHeartbeatStarted = true;

  const pingBackend = async () => {
    const token = getBackendToken();
    if (!token) return;

    try {
      const resp = await fetch(buildBackendUrl('/health'), {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: safeTimeoutSignal(BACKEND_HEALTH_TIMEOUT_MS),
      });
      if (resp.ok) {
        setBackendHealthCache(true);
      }
    } catch {
      // Fire-and-forget — don't clear cache on heartbeat failure
    }
  };

  // Initial ping after a short delay to avoid blocking startup
  setTimeout(pingBackend, 5000);

  // Periodic ping
  setInterval(pingBackend, HEARTBEAT_INTERVAL_MS);

  // Immediate ping on foreground resume
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[KeepAlive] App returned to foreground, pinging backend...');
      pingBackend();
    }
  });
}
