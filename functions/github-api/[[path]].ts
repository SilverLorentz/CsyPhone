/**
 * Same-origin proxy for GitHub REST API calls used by private backups.
 *
 * Browser direct calls to api.github.com mostly work, but routing all GitHub
 * traffic through Pages keeps behavior consistent with the release asset upload
 * proxy and avoids mobile WebView CORS differences.
 */

const GITHUB_API_BASE = 'https://api.github.com';

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
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
    return `${GITHUB_API_BASE}/${path}${url.search}`;
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

    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Missing GitHub token' }), {
            status: 401,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    try {
        const init: RequestInit = {
            method: request.method,
            headers: buildForwardHeaders(request),
        };
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            init.body = request.body;
        }

        const upstream = await fetch(buildTargetUrl(request, params), init);
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
            JSON.stringify({ error: 'GitHub proxy error', message: err?.message || 'Unknown error' }),
            {
                status: 502,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            },
        );
    }
};
