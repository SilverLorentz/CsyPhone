/**
 * Cloudflare Pages Function - ElevenLabs Voice Design proxy.
 *
 * Generates three prompt-based voice previews. This can consume ElevenLabs
 * credits, so the UI asks for explicit confirmation before calling it.
 */

const ELEVENLABS_VOICE_DESIGN_URL = 'https://api.elevenlabs.io/v1/text-to-voice/design';
const ALLOWED_MODELS = new Set(['eleven_multilingual_ttv_v2', 'eleven_ttv_v3']);

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-ElevenLabs-Key, xi-api-key',
    'Access-Control-Max-Age': '86400',
};

type VoiceDesignRequest = {
    voice_description?: string;
    model_id?: string;
    text?: string;
    guidance_scale?: number;
    should_enhance?: boolean;
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

async function readJson(request: Request): Promise<VoiceDesignRequest> {
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
    const voiceDescription = body.voice_description?.trim() || '';
    const previewText = body.text?.trim() || '';
    const modelId = body.model_id?.trim() || 'eleven_multilingual_ttv_v2';

    if (voiceDescription.length < 20 || voiceDescription.length > 1000) {
        return jsonResponse({ error: 'voice_description must be 20-1000 characters' }, 400);
    }
    if (previewText.length < 100 || previewText.length > 1000) {
        return jsonResponse({ error: 'text must be 100-1000 characters' }, 400);
    }
    if (!ALLOWED_MODELS.has(modelId)) {
        return jsonResponse({ error: 'Unsupported Voice Design model' }, 400);
    }

    const upstreamBody: Record<string, unknown> = {
        voice_description: voiceDescription,
        model_id: modelId,
        text: previewText,
        should_enhance: body.should_enhance === true,
    };
    if (typeof body.guidance_scale === 'number') {
        upstreamBody.guidance_scale = Math.max(0, Math.min(100, body.guidance_scale));
    }

    console.log('[ElevenLabs voice design] request', JSON.stringify({
        requestId,
        modelId,
        descriptionLength: voiceDescription.length,
        textLength: previewText.length,
    }));

    try {
        const upstream = await fetch(ELEVENLABS_VOICE_DESIGN_URL, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey.trim(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(upstreamBody),
        });

        console.log('[ElevenLabs voice design] upstream', JSON.stringify({
            requestId,
            status: upstream.status,
            ok: upstream.ok,
            contentType: upstream.headers.get('content-type') || '',
        }));

        const responseHeaders = new Headers(upstream.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Expose-Headers', 'request-id');
        if (!responseHeaders.has('Content-Type')) {
            responseHeaders.set('Content-Type', 'application/json');
        }

        return new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: responseHeaders,
        });
    } catch (err: any) {
        console.log('[ElevenLabs voice design] error', JSON.stringify({
            requestId,
            message: err?.message || 'Unknown error',
        }));
        return jsonResponse({
            error: 'ElevenLabs voice design proxy error',
            message: err?.message || 'Unknown error',
        }, 502);
    }
};
