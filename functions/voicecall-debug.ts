/**
 * Sanitized voice-call diagnostics for beta debugging.
 *
 * The client only posts event names and non-sensitive metadata here. Never log
 * API keys, request text, raw audio, or full voice IDs.
 */

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

function cleanValue(value: unknown): unknown {
    if (typeof value === 'string') return value.slice(0, 240);
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
    return undefined;
}

export const onRequest = async ({ request }: any) => {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    let payload: Record<string, unknown> = {};
    try {
        payload = await request.json();
    } catch {
        payload = { event: 'invalid_json' };
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
        const clean = cleanValue(value);
        if (clean !== undefined) {
            sanitized[key.slice(0, 64)] = clean;
        }
    }

    console.log('[VoiceCall debug]', JSON.stringify(sanitized));
    return new Response(null, { status: 204, headers: CORS_HEADERS });
};
