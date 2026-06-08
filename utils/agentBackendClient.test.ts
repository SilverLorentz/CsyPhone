// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {
    buildAgentSseUrl,
    fetchAgentLifeProfile,
    fetchPendingAgentMessages,
    generateAgentLifeProfile,
    ensureAgentTodayLife,
    startAgentOnBackend,
    updateAgentLifeProfileSection,
} from './agentBackendClient';
import { getBackendToken } from './backendConfig';

const BACKEND_URL = 'https://csyos-backend-staging.sully-tts-proxy.workers.dev';

describe('agentBackendClient', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
        vi.stubEnv('VITE_CSYOS_BACKEND_URL', BACKEND_URL);
        vi.stubEnv('VITE_CSYOS_BACKEND_TOKEN', 'staging-token');
        localStorage.setItem('csyos_user_id', 'csy-user-1');
        localStorage.setItem('csyos_client_id', 'csy-client-1');

        if (typeof AbortSignal.timeout !== 'function') {
            (AbortSignal as typeof AbortSignal & { timeout: (ms: number) => AbortSignal }).timeout =
                () => new AbortController().signal;
        }
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('negotiates polling protocol through the query string without a custom request header', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchPendingAgentMessages('char-1')).resolves.toEqual([]);

        expect(String(fetchMock.mock.calls[0][0])).toBe(
            `${BACKEND_URL}/api/agent/messages?charId=char-1&agentProtocol=2`,
        );

        const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
        expect(headers.get('X-Agent-Protocol')).toBeNull();
        expect(headers.get('X-Client-Id')).toBe('csy-client-1');
    });

    it('keeps start requests free of the protocol header for older beta backends', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(startAgentOnBackend({
            charId: 'char-1',
            apiConfig: {
                baseUrl: 'https://llm.example.com',
                apiKey: 'sub-key',
                model: 'gpt-test',
            },
        })).resolves.toBeUndefined();

        expect(String(fetchMock.mock.calls[0][0])).toBe(`${BACKEND_URL}/api/agent/start`);

        const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
        expect(headers.get('X-Agent-Protocol')).toBeNull();
    });

    it('does not retry missing agent start endpoints', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
        }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(startAgentOnBackend({
            charId: 'char-1',
            apiConfig: {
                baseUrl: 'https://llm.example.com',
                apiKey: 'sub-key',
                model: 'gpt-test',
            },
        })).rejects.toThrow('Agent API 404');

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('adds the protocol query param to the SSE URL', () => {
        const sseUrl = buildAgentSseUrl('char-1');
        expect(sseUrl).not.toBeNull();

        const parsed = new URL(sseUrl!);
        expect(parsed.origin).toBe(BACKEND_URL);
        expect(parsed.pathname).toBe('/api/agent/stream');
        expect(parsed.searchParams.get('charId')).toBe('char-1');
        expect(parsed.searchParams.get('agentProtocol')).toBe('2');
        expect(parsed.searchParams.get('userId')).toBe('csy-user-1');
        expect(parsed.searchParams.get('_clientId')).toBe('csy-client-1');
        expect(parsed.searchParams.get('token')).toBe(getBackendToken());
    });

    it('fetches a life profile by character id', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'missing' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchAgentLifeProfile('char-1')).resolves.toEqual({ status: 'missing' });

        expect(String(fetchMock.mock.calls[0][0])).toBe(
            `${BACKEND_URL}/api/agent/life-profile?charId=char-1`,
        );
    });

    it('posts context and optional secondary API config when generating a life profile', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ready', profile: { lifeIdentity: {} } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(generateAgentLifeProfile('char-1', {
            charId: 'char-1',
            charName: 'Sully',
        }, {
            baseUrl: 'https://llm.example.com',
            apiKey: 'sub-key',
            model: 'profile-model',
        })).resolves.toMatchObject({ status: 'ready' });

        expect(String(fetchMock.mock.calls[0][0])).toBe(`${BACKEND_URL}/api/agent/life-profile/generate`);
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
            charId: 'char-1',
            contextSnapshot: {
                charId: 'char-1',
                charName: 'Sully',
            },
            apiConfig: {
                baseUrl: 'https://llm.example.com',
                apiKey: 'sub-key',
                model: 'profile-model',
            },
        });
    });

    it('patches one life profile section with context snapshot', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ready', sectionMeta: { activities: { source: 'manual', updatedAt: 1 } } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(updateAgentLifeProfileSection(
            'char-1',
            'activities',
            { activityPalette: { stable: ['????'] } },
            { charName: 'Sully' },
        )).resolves.toMatchObject({ status: 'ready' });

        expect(String(fetchMock.mock.calls[0][0])).toBe(`${BACKEND_URL}/api/agent/life-profile/section`);
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
            charId: 'char-1',
            section: 'activities',
            value: {
                activityPalette: {
                    stable: ['????'],
                },
            },
            contextSnapshot: {
                charName: 'Sully',
            },
        });
    });

    it('ensures today life with main and secondary API configs', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            status: 'ready',
            localDate: '2026-05-16',
            timeLabel: '??',
            visibleMessage: '???????',
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        vi.stubGlobal('fetch', fetchMock);

        await expect(ensureAgentTodayLife('char-1', {
            charId: 'char-1',
            charName: 'Sully',
            recentMessages: [{ role: 'user', content: '??????', timestamp: 1 }],
        }, {
            mainApiConfig: { baseUrl: 'https://main.example.com', apiKey: 'main-key', model: 'main-model' },
            apiConfig: { baseUrl: 'https://sub.example.com', apiKey: 'sub-key', model: 'sub-model' },
        })).resolves.toMatchObject({ status: 'ready' });

        expect(String(fetchMock.mock.calls[0][0])).toBe(`${BACKEND_URL}/api/agent/today-life/ensure`);
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
            charId: 'char-1',
            contextSnapshot: {
                charName: 'Sully',
                recentMessages: [{ role: 'user', content: '??????', timestamp: 1 }],
            },
            mainApiConfig: { baseUrl: 'https://main.example.com', apiKey: 'main-key', model: 'main-model' },
            apiConfig: { baseUrl: 'https://sub.example.com', apiKey: 'sub-key', model: 'sub-model' },
        });
    });
});
