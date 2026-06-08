/**
 * Cloudflare Pages Function - ElevenLabs Stream speech proxy.
 *
 * Used for eleven_v3 because ElevenLabs multi-context WebSocket does not
 * support that model. The user's local API key is only sent to this same-origin
 * endpoint, then forwarded server-side to ElevenLabs.
 */

const ELEVENLABS_TTS_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const ALLOWED_OUTPUT_FORMATS = new Set(['pcm_16000', 'pcm_24000']);

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-ElevenLabs-Key, xi-api-key',
    'Access-Control-Max-Age': '86400',
};

type ElevenLabsStreamRequest = {
    voiceId?: string;
    text?: string;
    modelId?: string;
    languageCode?: string;
    outputFormat?: string;
    voiceSettings?: Record<string, unknown>;
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

async function readJson(request: Request): Promise<ElevenLabsStreamRequest> {
    try {
        return await request.json();
    } catch {
        return {};
    }
}

export const onRequest = async ({ request }: any) => {
    const requestId = crypto.randomUUID();
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const apiKey = request.headers.get('X-ElevenLabs-Key') || request.headers.get('xi-api-key');
    if (!apiKey?.trim()) {
        return jsonResponse({ error: 'Missing ElevenLabs API key' }, 400);
    }

    const body = await readJson(request);
    const voiceId = body.voiceId?.trim();
    const text = body.text?.trim();
    const modelId = body.modelId?.trim() || 'eleven_v3';
    const languageCode = body.languageCode?.trim();
    const outputFormat = body.outputFormat?.trim() || 'pcm_24000';

    if (!voiceId) {
        return jsonResponse({ error: 'Missing ElevenLabs Voice ID' }, 400);
    }
    if (!text) {
        return jsonResponse({ error: 'Missing text' }, 400);
    }
    if (!ALLOWED_OUTPUT_FORMATS.has(outputFormat)) {
        return jsonResponse({ error: 'Unsupported ElevenLabs output format' }, 400);
    }

    const url = new URL(`${ELEVENLABS_TTS_BASE_URL}/${encodeURIComponent(voiceId)}/stream`);
    url.searchParams.set('output_format', outputFormat);

    const upstreamBody: Record<string, unknown> = {
        text,
        model_id: modelId,
        voice_settings: body.voiceSettings || undefined,
    };
    if (languageCode) {
        upstreamBody.language_code = languageCode;
    }

    console.log('[ElevenLabs stream] request', JSON.stringify({
        requestId,
        modelId,
        outputFormat,
        hasLanguageCode: Boolean(languageCode),
        textLength: text.length,
    }));

    try {
        const upstream = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey.trim(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(upstreamBody),
        });

        console.log('[ElevenLabs stream] upstream', JSON.stringify({
            requestId,
            status: upstream.status,
            ok: upstream.ok,
            contentType: upstream.headers.get('content-type') || '',
        }));

        const responseHeaders = new Headers(upstream.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Expose-Headers', 'request-id');
        if (!responseHeaders.has('Content-Type')) {
            responseHeaders.set('Content-Type', upstream.ok ? 'application/octet-stream' : 'application/json');
        }

        return new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: responseHeaders,
        });
    } catch (err: any) {
        console.log('[ElevenLabs stream] error', JSON.stringify({
            requestId,
            message: err?.message || 'Unknown error',
        }));
        return jsonResponse({
            error: 'ElevenLabs stream proxy error',
            message: err?.message || 'Unknown error',
        }, 502);
    }
};
