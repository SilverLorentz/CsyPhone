/**
 * Cloudflare Pages Function - ElevenLabs Create Voice proxy.
 *
 * Saves a selected Voice Design preview as a reusable voice_id. This can occupy
 * an ElevenLabs voice slot, so the UI asks for explicit confirmation first.
 */

const ELEVENLABS_VOICE_CREATE_URL = 'https://api.elevenlabs.io/v1/text-to-voice';

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-ElevenLabs-Key, xi-api-key',
    'Access-Control-Max-Age': '86400',
};

type VoiceCreateRequest = {
    voice_name?: string;
    voice_description?: string;
    generated_voice_id?: string;
    labels?: Record<string, string> | null;
    played_not_selected_voice_ids?: string[] | null;
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

async function readJson(request: Request): Promise<VoiceCreateRequest> {
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
    const voiceName = body.voice_name?.trim() || '';
    const voiceDescription = body.voice_description?.trim() || '';
    const generatedVoiceId = body.generated_voice_id?.trim() || '';

    if (!voiceName) {
        return jsonResponse({ error: 'Missing voice_name' }, 400);
    }
    if (voiceDescription.length < 20 || voiceDescription.length > 1000) {
        return jsonResponse({ error: 'voice_description must be 20-1000 characters' }, 400);
    }
    if (!generatedVoiceId) {
        return jsonResponse({ error: 'Missing generated_voice_id' }, 400);
    }

    const upstreamBody: Record<string, unknown> = {
        voice_name: voiceName,
        voice_description: voiceDescription,
        generated_voice_id: generatedVoiceId,
    };
    if (body.labels && typeof body.labels === 'object') {
        upstreamBody.labels = body.labels;
    }
    if (Array.isArray(body.played_not_selected_voice_ids)) {
        upstreamBody.played_not_selected_voice_ids = body.played_not_selected_voice_ids;
    }

    console.log('[ElevenLabs voice create] request', JSON.stringify({
        requestId,
        voiceName,
        descriptionLength: voiceDescription.length,
        hasGeneratedVoiceId: Boolean(generatedVoiceId),
    }));

    try {
        const upstream = await fetch(ELEVENLABS_VOICE_CREATE_URL, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey.trim(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(upstreamBody),
        });

        console.log('[ElevenLabs voice create] upstream', JSON.stringify({
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
        console.log('[ElevenLabs voice create] error', JSON.stringify({
            requestId,
            message: err?.message || 'Unknown error',
        }));
        return jsonResponse({
            error: 'ElevenLabs voice create proxy error',
            message: err?.message || 'Unknown error',
        }, 502);
    }
};
