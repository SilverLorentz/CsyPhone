// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ensureWeixinSync,
    getWeixinReadiness,
    repairWeixinClientBinding,
} from './weixinClient';

const { mockResolveCharacterContentId } = vi.hoisted(() => ({
    mockResolveCharacterContentId: vi.fn(),
}));

vi.mock('../db/characterStore', () => ({
    resolveCharacterContentId: mockResolveCharacterContentId,
}));

const BACKEND_URL = 'https://csyos-backend-staging.sully-tts-proxy.workers.dev';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function firstFetchCall(fetchMock: ReturnType<typeof vi.fn>): [RequestInfo | URL, RequestInit | undefined] {
    return fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
}

describe('weixinClient', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
        vi.stubEnv('VITE_CSYOS_BACKEND_URL', BACKEND_URL);
        vi.stubEnv('VITE_CSYOS_BACKEND_TOKEN', 'staging-token');
        mockResolveCharacterContentId.mockResolvedValue('content-char-1');
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('requests readiness through the backend path parameter endpoint', async () => {
        mockResolveCharacterContentId.mockResolvedValue('content/char 1');
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            ready: true,
            repair: {
                needed: false,
                available: false,
            },
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(getWeixinReadiness('local-char-1')).resolves.toMatchObject({
            ready: true,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [input] = firstFetchCall(fetchMock);
        expect(String(input)).toBe(
            `${BACKEND_URL}/api/weixin/readiness/content%2Fchar%201`,
        );
    });

    it('posts repair requests to the backend repair-client endpoint', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            repaired: true,
            imported: 2,
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(repairWeixinClientBinding('local-char-1', 3)).resolves.toMatchObject({
            repaired: true,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [input, init] = firstFetchCall(fetchMock);
        expect(String(input)).toBe(`${BACKEND_URL}/api/weixin/bindings/repair-client`);
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        expect(JSON.parse(String(init?.body))).toEqual({
            charId: 'content-char-1',
            lookbackDays: 3,
        });
    });

    it('posts manual sync ensure requests to the backend ensure endpoint', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            status: 'processed',
            processed: true,
            remainingQueued: 0,
            clientIdBound: true,
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(ensureWeixinSync('local-char-1')).resolves.toMatchObject({
            status: 'processed',
            processed: true,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [input, init] = firstFetchCall(fetchMock);
        expect(String(input)).toBe(`${BACKEND_URL}/api/weixin/sync/ensure`);
        expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
        expect(JSON.parse(String(init?.body))).toEqual({
            charId: 'content-char-1',
        });
    });

    it('normalizes client id conflict repair responses', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
            error: 'client_id_conflict',
            details: 'Binding already belongs to another client',
        }, 409));
        vi.stubGlobal('fetch', fetchMock);

        await expect(repairWeixinClientBinding('local-char-1')).resolves.toMatchObject({
            ok: false,
            conflict: true,
            repair: {
                needed: true,
                available: false,
                conflict: true,
            },
        });
    });
});
