// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCityInputTips } from './mapService';

const BACKEND_URL = 'https://csyos-backend-staging.sully-tts-proxy.workers.dev';

describe('mapService', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
        vi.stubEnv('VITE_CSYOS_BACKEND_URL', BACKEND_URL);
        vi.stubEnv('VITE_CSYOS_BACKEND_TOKEN', 'staging-token');
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('quietly returns an empty list when city input tips hit the rate limit', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: 'rate_limited' }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' },
            }),
        ));

        await expect(getCityInputTips('上海')).resolves.toEqual([]);
    });

    it('surfaces auth failures with a refresh hint', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response('Invalid API secret', { status: 403 }),
        ));

        await expect(getCityInputTips('上海')).rejects.toThrow('城市搜索鉴权失败，请刷新后重试');
    });
});
