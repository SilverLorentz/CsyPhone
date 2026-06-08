/**
 * Cloudflare Pages Function — MiniMax Music API proxy
 *
 * /minimax-music-api/* -> https://api.minimax.chat/*
 */

const MINIMAX_MUSIC_BASE = 'https://api.minimax.chat';

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Group-Id, X-Group-ID',
    'Access-Control-Max-Age': '86400',
};

export const onRequest = async (context: any) => {
    const { request, params } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const pathSegments = (params.path as string[]) || [];
    const targetPath = pathSegments.join('/');
    const url = new URL(request.url);
    const targetUrl = `${MINIMAX_MUSIC_BASE}/${targetPath}${url.search}`;

    const forwardHeaders = new Headers();
    const auth = request.headers.get('Authorization');
    const ct = request.headers.get('Content-Type');
    const gid = request.headers.get('Group-Id');
    const xgid = request.headers.get('X-Group-ID');

    if (auth) forwardHeaders.set('Authorization', auth);
    if (ct) forwardHeaders.set('Content-Type', ct);
    if (gid) forwardHeaders.set('Group-Id', gid);
    if (xgid || gid) forwardHeaders.set('X-Group-ID', xgid || gid || '');

    try {
        const init: RequestInit = {
            method: request.method,
            headers: forwardHeaders,
        };

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            init.body = request.body;
        }

        const upstream = await fetch(targetUrl, init);
        const responseHeaders = new Headers(upstream.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');

        return new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: responseHeaders,
        });
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: 'Proxy error', message: err?.message || 'Unknown error' }),
            {
                status: 502,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            },
        );
    }
};
