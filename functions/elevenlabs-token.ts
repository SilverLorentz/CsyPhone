/**
 * Cloudflare Pages Function — ElevenLabs single-use token proxy
 *
 * The browser sends the user's local ElevenLabs key only to this same-origin
 * endpoint. The function exchanges it for a short-lived tts_websocket token
 * and does not store the key.
 */

const ELEVENLABS_TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/tts_websocket';

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-ElevenLabs-Key, xi-api-key',
    'Access-Control-Max-Age': '86400',
};

export const onRequest = async ({ request }: any) => {
    const requestId = crypto.randomUUID();
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    const apiKey = request.headers.get('X-ElevenLabs-Key') || request.headers.get('xi-api-key');
    console.log('[ElevenLabs token] request', JSON.stringify({
        requestId,
        method: request.method,
        hasApiKey: Boolean(apiKey?.trim()),
    }));

    if (!apiKey?.trim()) {
        return new Response(JSON.stringify({ error: 'Missing ElevenLabs API key' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    try {
        const upstream = await fetch(ELEVENLABS_TOKEN_URL, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey.trim(),
            },
        });
        console.log('[ElevenLabs token] upstream', JSON.stringify({
            requestId,
            status: upstream.status,
            ok: upstream.ok,
            contentType: upstream.headers.get('content-type') || '',
        }));

        const responseHeaders = new Headers(upstream.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');

        return new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: responseHeaders,
        });
    } catch (err: any) {
        console.log('[ElevenLabs token] error', JSON.stringify({
            requestId,
            message: err?.message || 'Unknown error',
        }));
        return new Response(
            JSON.stringify({ error: 'ElevenLabs token proxy error', message: err?.message || 'Unknown error' }),
            {
                status: 502,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            },
        );
    }
};
