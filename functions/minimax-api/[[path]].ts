/**
 * Cloudflare Pages Function — MiniMax HTTP API 代理
 *
 * 将 /minimax-api/* 的请求转发到 https://api.minimaxi.com/*
 * 保留 Authorization / Group-Id / Content-Type 请求头。
 *
 * 路由规则：
 *   /minimax-api/v1/t2a_v2       → https://api.minimaxi.com/v1/t2a_v2
 *   /minimax-api/v1/query/...    → https://api.minimaxi.com/v1/query/...
 *   /minimax-api/v1/files/...    → https://api.minimaxi.com/v1/files/...
 *
 * 等同于 Vite dev server 中的 proxy 配置：
 *   '/minimax-api': { target: 'https://api.minimaxi.com', rewrite: path => path.replace(/^\/minimax-api/, '') }
 */

const MINIMAX_BASE = 'https://api.minimaxi.com';

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Group-Id',
    'Access-Control-Max-Age': '86400',
};

export const onRequest = async (context: any) => {
    const { request, params } = context;

    // ── CORS 预检请求 ─────────────────────────────────────────────
    // 浏览器在发送带自定义 Header 的 POST 前会先发一次 OPTIONS 预检
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── 构建目标 URL ──────────────────────────────────────────────
    // params.path 是 [[path]].ts 捕获的路径段数组
    const pathSegments = (params.path as string[]) || [];
    const targetPath = pathSegments.join('/');

    // 保留原始 query string
    const url = new URL(request.url);
    const queryString = url.search; // 包含 '?' 前缀，为空则为 ''

    const targetUrl = `${MINIMAX_BASE}/${targetPath}${queryString}`;

    // ── 转发请求头 ───────────────────────────────────────────────
    const forwardHeaders = new Headers();
    const auth = request.headers.get('Authorization');
    const ct = request.headers.get('Content-Type');
    const gid = request.headers.get('Group-Id');

    if (auth) forwardHeaders.set('Authorization', auth);
    if (ct) forwardHeaders.set('Content-Type', ct);
    if (gid) forwardHeaders.set('Group-Id', gid);

    // ── 发送请求到 MiniMax ──────────────────────────────────────
    try {
        const init: RequestInit = {
            method: request.method,
            headers: forwardHeaders,
        };

        // GET / HEAD 不应携带 body
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            init.body = request.body;
        }

        const upstream = await fetch(targetUrl, init);

        // ── 构建响应 ─────────────────────────────────────────────
        const responseHeaders = new Headers(upstream.headers);
        // 注入 CORS 头
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
            }
        );
    }
};
