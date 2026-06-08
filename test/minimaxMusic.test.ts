import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeHexAudio, generateMinimaxMusicWithFallback } from '../utils/minimaxMusic';

describe('minimax music service', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('decodes hex audio payloads', () => {
        expect(Array.from(decodeHexAudio('494433'))).toEqual([0x49, 0x44, 0x33]);
    });

    it('falls back to music-2.6-free when the primary model fails', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                base_resp: { status_code: 1001, status_msg: 'busy' },
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: { audio: '494433' },
                extra_info: { music_duration: 123000 },
                base_resp: { status_code: 0, status_msg: 'ok' },
            }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await generateMinimaxMusicWithFallback({
            apiKey: 'key',
            groupId: 'group',
            baseUrl: '/minimax-api',
            model: 'music-2.6',
            prompt: 'warm pop',
            lyrics: '[Verse]\nhello',
        });

        expect(result.fallbackUsed).toBe(true);
        expect(result.model).toBe('music-2.6-free');
        expect(result.durationMs).toBe(123000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('music-2.6-free');
    });

    it('uses music-2.6-free by default to avoid paid music calls', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            data: { audio: '494433' },
            base_resp: { status_code: 0, status_msg: 'ok' },
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await generateMinimaxMusicWithFallback({
            apiKey: 'key',
            groupId: 'group',
            prompt: 'warm pop',
            lyrics: '[Verse]\nhello',
        });

        expect(result.model).toBe('music-2.6-free');
        expect(result.fallbackUsed).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('music-2.6-free');
    });

    it('allows instrumental generation without lyrics', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            data: { audio: '494433' },
            base_resp: { status_code: 0, status_msg: 'ok' },
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await generateMinimaxMusicWithFallback({
            apiKey: 'key',
            groupId: 'group',
            baseUrl: '/minimax-api',
            prompt: 'soft instrumental date scene',
            lyrics: '',
            isInstrumental: true,
        });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.is_instrumental).toBe(true);
        expect(body.lyrics).toBeUndefined();
    });

    it('accepts MiniMax success payloads even when HTTP status is 403', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            data: { audio: '494433' },
            extra_info: { music_duration: 88000 },
            base_resp: { status_code: 0, status_msg: 'ok' },
            trace_id: 'trace-success',
        }), { status: 403 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await generateMinimaxMusicWithFallback({
            apiKey: 'key',
            groupId: 'group',
            model: 'music-2.6',
            prompt: 'warm pop',
            lyrics: '[Verse]\nhello',
        });

        expect(result.model).toBe('music-2.6');
        expect(result.durationMs).toBe(88000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back when HTTP 403 has no usable audio payload', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                base_resp: { status_code: 1008, status_msg: 'forbidden' },
                trace_id: 'trace-primary',
            }), { status: 403 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: { audio: '494433' },
                base_resp: { status_code: 0, status_msg: 'ok' },
            }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await generateMinimaxMusicWithFallback({
            apiKey: 'key',
            groupId: 'group',
            model: 'music-2.6',
            prompt: 'warm pop',
            lyrics: '[Verse]\nhello',
        });

        expect(result.fallbackUsed).toBe(true);
        expect(result.model).toBe('music-2.6-free');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('includes HTTP status and trace id when primary and fallback both fail', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                base_resp: { status_code: 1008, status_msg: 'forbidden' },
                trace_id: 'trace-primary',
            }), { status: 403 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                base_resp: { status_code: 1009, status_msg: 'fallback forbidden' },
                trace_id: 'trace-fallback',
            }), { status: 403 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(generateMinimaxMusicWithFallback({
            apiKey: 'key',
            groupId: 'group',
            model: 'music-2.6',
            prompt: 'warm pop',
            lyrics: '[Verse]\nhello',
        })).rejects.toThrow(/MiniMax Music HTTP 403.*trace-primary.*trace-fallback/);
    });

    it('routes through csyos-workers proxy by default', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            data: { audio: '494433' },
            extra_info: { music_duration: 123000 },
            base_resp: { status_code: 0, status_msg: 'ok' },
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await generateMinimaxMusicWithFallback({
            apiKey: 'key',
            groupId: 'group',
            model: 'music-2.6',
            prompt: 'warm pop',
            lyrics: '[Verse]\nhello',
        });

        // Should route through the csyos-workers backend proxy
        const url = String(fetchMock.mock.calls[0][0]);
        expect(url).toContain('/api/music/minimax-generate');
        // MiniMax API key sent via X-MiniMax-Key (not Authorization, which is for backend auth)
        expect(fetchMock.mock.calls[0][1].headers['X-MiniMax-Key']).toBe('key');
        expect(fetchMock.mock.calls[0][1].headers['Group-Id']).toBe('group');
        expect(fetchMock.mock.calls[0][1].headers['X-Group-ID']).toBe('group');
    });

    it('waits longer for MiniMax music generation by default', async () => {
        const originalTimeout = AbortSignal.timeout;
        const timeoutSignal = new AbortController().signal;
        const timeoutMock = vi.fn(() => timeoutSignal);
        Object.defineProperty(AbortSignal, 'timeout', {
            configurable: true,
            value: timeoutMock,
        });
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            data: { audio: '494433' },
            extra_info: { music_duration: 123000 },
            base_resp: { status_code: 0, status_msg: 'ok' },
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            await generateMinimaxMusicWithFallback({
                apiKey: 'key',
                groupId: 'group',
                model: 'music-2.6',
                prompt: 'warm pop',
                lyrics: '[Verse]\nhello',
            });
        } finally {
            Object.defineProperty(AbortSignal, 'timeout', {
                configurable: true,
                value: originalTimeout,
            });
        }

        expect(timeoutMock).toHaveBeenCalledWith(300000);
    });

    it('does not retry model fallback when the proxy returns HTML', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(
            '<html><head><title>sully-frontend.pages.dev | 502: Bad gateway</title></head></html>',
            { status: 502, headers: { 'Content-Type': 'text/html' } },
        ));
        vi.stubGlobal('fetch', fetchMock);

        await expect(generateMinimaxMusicWithFallback({
            apiKey: 'key',
            groupId: 'group',
            baseUrl: '/minimax-api',
            model: 'music-2.6',
            prompt: 'warm pop',
            lyrics: '[Verse]\nhello',
        })).rejects.toThrow('API返回了HTML而非JSON');

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
