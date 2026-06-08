/**
 * Same-origin proxy for GitHub release asset uploads.
 *
 * GitHub release assets use uploads.github.com, which does not behave like the
 * regular REST API in mobile browsers. This function streams the request body to
 * GitHub from Cloudflare Pages so the app only talks to its own origin.
 */

const GITHUB_UPLOAD_BASE = 'https://uploads.github.com';

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type, X-GitHub-Api-Version',
    'Access-Control-Max-Age': '86400',
};

const FORWARDED_HEADERS = [
    'Authorization',
    'Accept',
    'Content-Type',
    'X-GitHub-Api-Version',
];

function buildTargetUrl(request: Request, params: Record<string, unknown>): string {
    const path = Array.isArray(params.path) ? params.path.join('/') : '';
    const url = new URL(request.url);
    return `${GITHUB_UPLOAD_BASE}/${path}${url.search}`;
}

function buildForwardHeaders(request: Request): Headers {
    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }
    headers.set('User-Agent', 'Sully-GitHub-Backup');
    return headers;
}

export const onRequest = async ({ request, params }: any) => {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Missing GitHub token' }), {
            status: 401,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    try {
        const upstream = await fetch(buildTargetUrl(request, params), {
            method: 'POST',
            headers: buildForwardHeaders(request),
            body: request.body,
        });
        const headers = new Headers(upstream.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', 'no-store');

        return new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers,
        });
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: 'GitHub upload proxy error', message: err?.message || 'Unknown error' }),
            {
                status: 502,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            },
        );
    }
};
