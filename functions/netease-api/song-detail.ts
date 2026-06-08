const NETEASE_PUBLIC_API = 'https://music.163.com/api/song/detail/';

function createJsonResponse(payload: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json; charset=UTF-8');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return new Response(JSON.stringify(payload), { ...init, headers });
}

function parseSongIds(value: unknown): number[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((item) => typeof item === 'number' && Number.isFinite(item) ? Math.trunc(item) : NaN)
        .filter((item) => Number.isFinite(item) && item > 0);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
    try {
        const parsed = await request.json();
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // Ignore invalid JSON and fall through to an empty payload.
    }

    return {};
}

export const onRequest = async (context: { request: Request }): Promise<Response> => {
    const { request } = context;

    if (request.method === 'OPTIONS') {
        return createJsonResponse(null, { status: 204 });
    }

    if (request.method !== 'POST') {
        return createJsonResponse({ error: 'method_not_allowed' }, { status: 405 });
    }

    const body = await readJsonBody(request);
    const ids = parseSongIds(body.ids);
    if (ids.length === 0) {
        return createJsonResponse({ error: 'ids is required' }, { status: 400 });
    }

    try {
        const upstreamUrl = new URL(NETEASE_PUBLIC_API);
        upstreamUrl.searchParams.set('ids', JSON.stringify(ids));

        const upstream = await fetch(upstreamUrl.toString(), {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Referer: 'https://music.163.com/',
                Origin: 'https://music.163.com',
            },
        });

        if (!upstream.ok) {
            return createJsonResponse(
                { error: 'upstream_error', detail: `Netease upstream returned ${upstream.status}` },
                { status: 502 },
            );
        }

        const payload = await upstream.json();
        return createJsonResponse(payload, {
            headers: {
                'Cache-Control': 'public, max-age=300',
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return createJsonResponse({ error: 'proxy_error', detail: message }, { status: 502 });
    }
};
