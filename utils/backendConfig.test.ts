// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {
  BACKEND_TOKEN_KEY,
  BACKEND_URL_KEY,
  buildBackendAuthQuery,
  buildBackendHeaders,
  getClientId,
  getBackendResolutionDebug,
  getBackendToken,
  getBackendUrl,
  setUserId,
} from './backendConfig';

describe('backendConfig', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('prefers the build backend when localStorage points to a different deployed environment', () => {
        vi.stubEnv('VITE_CSYOS_BACKEND_URL', 'https://csyos-backend-staging.sully-tts-proxy.workers.dev');
        localStorage.setItem(BACKEND_URL_KEY, 'https://chushiyu.de5.net');
        localStorage.setItem(BACKEND_TOKEN_KEY, 'prod-token');
        const expectedToken = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_CSYOS_BACKEND_TOKEN;

        expect(getBackendUrl()).toBe('https://csyos-backend-staging.sully-tts-proxy.workers.dev');
        expect(getBackendToken()).toBe(expectedToken);
        expect(getBackendToken()).not.toBe('prod-token');
    });

    it('still allows localhost debug overrides', () => {
        vi.stubEnv('VITE_CSYOS_BACKEND_URL', 'https://csyos-backend-staging.sully-tts-proxy.workers.dev');
        vi.stubEnv('VITE_CSYOS_BACKEND_TOKEN', 'staging-token');
        localStorage.setItem(BACKEND_URL_KEY, 'http://localhost:8787');
        localStorage.setItem(BACKEND_TOKEN_KEY, 'local-token');

        expect(getBackendUrl()).toBe('http://localhost:8787');
        expect(getBackendToken()).toBe('local-token');
    });

    it('reports when backend config comes from build env instead of localStorage', () => {
        vi.stubEnv('VITE_CSYOS_BACKEND_URL', 'https://csyos-backend-staging.sully-tts-proxy.workers.dev');
        vi.stubEnv('VITE_CSYOS_BACKEND_TOKEN', 'staging-token');

        const debug = getBackendResolutionDebug();

        expect(debug.backendUrl).toBe('https://csyos-backend-staging.sully-tts-proxy.workers.dev');
        expect(debug.backendUrlSource).toBe('build_env');
        expect(debug.hasBackendToken).toBe(true);
        expect(debug.backendTokenSource).toBe('build_env');
    });

    it('keeps a stable local client id and sends it with backend requests', () => {
        localStorage.setItem('csyos_user_id', 'csy-user-a');
        const clientId = getClientId();

        expect(clientId).toMatch(/^csy-client-/);
        expect(getClientId()).toBe(clientId);

        const headers = buildBackendHeaders();
        expect(headers['X-Client-Id']).toBe(clientId);

        const params = new URLSearchParams(buildBackendAuthQuery());
        expect(params.get('_clientId')).toBe(clientId);
        expect(params.get('userId')).toBe('csy-user-a');
    });

    it('only changes the sync code through the explicit manual path', () => {
        localStorage.setItem('csyos_user_id', 'csy-user-original');

        const unsafeSetUserId = setUserId as unknown as (id: string, options?: { source?: string }) => void;
        unsafeSetUserId('csy-user-from-import');
        expect(localStorage.getItem('csyos_user_id')).toBe('csy-user-original');

        setUserId('csy-user-manual', { source: 'manual' });
        expect(localStorage.getItem('csyos_user_id')).toBe('csy-user-manual');
    });
});
