import { afterEach,describe,expect,it,vi } from 'vitest';
import { XhsMcpClient } from './xhsMcpClient';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});

describe('XhsMcpClient bridge URL handling', () => {
    afterEach(() => {
        XhsMcpClient.resetSession();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('treats the Vite /xhs-api proxy as Bridge REST', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === '/xhs-api/health') return jsonResponse({ status: 'ok' });
            if (url === '/xhs-api/check-login') {
                expect(init?.method).toBe('POST');
                return jsonResponse({ logged_in: true, nickname: '测试用户', user_id: 'u1' });
            }
            if (url === '/xhs-api/list-feeds') return jsonResponse({ items: [{ xsec_token: 'token1' }] });
            throw new Error(`unexpected fetch: ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await XhsMcpClient.testConnection('/xhs-api');

        expect(result).toMatchObject({
            connected: true,
            mode: 'bridge',
            loggedIn: true,
            nickname: '测试用户',
            userId: 'u1',
            xsecToken: 'token1',
        });
        expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
            '/xhs-api/health',
            '/xhs-api/check-login',
            '/xhs-api/list-feeds',
        ]);
    });

    it('keeps direct Bridge /api URLs on the expected REST paths', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === 'http://localhost:18061/api/health') return jsonResponse({ status: 'ok' });
            if (url === 'http://localhost:18061/api/check-login') return jsonResponse({ logged_in: false });
            throw new Error(`unexpected fetch: ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await XhsMcpClient.testConnection('http://localhost:18061/api');

        expect(result).toMatchObject({
            connected: true,
            mode: 'bridge',
            loggedIn: false,
        });
        expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
            'http://localhost:18061/api/health',
            'http://localhost:18061/api/check-login',
        ]);
    });
});
