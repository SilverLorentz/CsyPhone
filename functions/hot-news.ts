const HOT_NEWS_API = 'https://orz.ai/api/v1/dailynews/';

const PLATFORM_ALIASES: Record<string, string> = {
    sspai: 'shaoshupai',
    tskr: '36kr',
    ftpojie: '52pojie',
    vtex: 'v2ex',
};

const CODELIFE_TOP_IDS: Record<string, string> = {
    weibo: 'KqndgxeLl9',
    zhihu: 'mproPpoq6O',
    baidu: 'Jb0vmloB1G',
    bilibili: '74KvxwokxM',
    douyin: 'DpQvNABoNE',
};

const ALLOWED_PLATFORMS = new Set([
    'baidu',
    'shaoshupai',
    'weibo',
    'zhihu',
    '36kr',
    '52pojie',
    'bilibili',
    'douban',
    'hupu',
    'tieba',
    'juejin',
    'douyin',
    'v2ex',
    'jinritoutiao',
    'stackoverflow',
    'github',
    'hackernews',
    'sina_finance',
    'eastmoney',
    'xueqiu',
    'cls',
    'tenxunwang',
]);

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
};

function createJsonResponse(payload: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
    headers.set('Content-Type', 'application/json; charset=UTF-8');
    return new Response(JSON.stringify(payload), { ...init, headers });
}

function normalizeFallbackItems(items: any[]): { title: string; url?: string; desc?: string }[] {
    return items
        .map((item) => {
            const title = String(item?.title || item?.name || '').trim();
            const url = typeof item?.url === 'string' ? item.url
                : typeof item?.link === 'string' ? item.link
                    : typeof item?.mobilUrl === 'string' ? item.mobilUrl
                        : undefined;
            const desc = String(item?.desc || item?.hotValue || item?.hot || '').replace(/\s+/g, ' ').trim();
            return title ? { title, url, desc: desc || undefined } : null;
        })
        .filter(Boolean) as { title: string; url?: string; desc?: string }[];
}

async function fetchFallbackPayload(platform: string): Promise<unknown | null> {
    const id = CODELIFE_TOP_IDS[platform];
    if (!id) return null;

    const fallbackUrl = new URL('https://api.codelife.cc/api/top/list');
    fallbackUrl.searchParams.set('lang', 'cn');
    fallbackUrl.searchParams.set('id', id);

    const fallback = await fetch(fallbackUrl.toString(), {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'SullyOS-HotNews/1.0',
        },
    });
    if (!fallback.ok) return null;

    const payload = await fallback.json() as any;
    const items = normalizeFallbackItems(Array.isArray(payload?.data) ? payload.data : []);
    if (items.length === 0) return null;
    return { status: '200', data: items, msg: 'success', fallback: 'codelife' };
}

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
        return createJsonResponse({ error: 'method_not_allowed' }, { status: 405 });
    }

    const url = new URL(request.url);
    const rawPlatform = (url.searchParams.get('platform') || '').trim().toLowerCase();
    const platform = PLATFORM_ALIASES[rawPlatform] || rawPlatform;
    if (!ALLOWED_PLATFORMS.has(platform)) {
        return createJsonResponse({ error: 'invalid_platform' }, { status: 400 });
    }

    const upstreamUrl = new URL(HOT_NEWS_API);
    upstreamUrl.searchParams.set('platform', platform);

    try {
        const upstream = await fetch(upstreamUrl.toString(), {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'SullyOS-HotNews/1.0',
            },
        });

        const headers = new Headers(upstream.headers);
        for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
        headers.set('Cache-Control', 'public, max-age=300');

        const upstreamText = await upstream.text();
        try {
            const payload = JSON.parse(upstreamText);
            const hasItems = Array.isArray(payload?.data) && payload.data.length > 0;
            if (!hasItems) {
                const fallbackPayload = await fetchFallbackPayload(platform);
                if (fallbackPayload) {
                    return createJsonResponse(fallbackPayload, {
                        status: 200,
                        headers: { 'Cache-Control': 'public, max-age=300' },
                    });
                }
            }
        } catch { /* preserve upstream response if it is not JSON */ }

        return new Response(upstreamText, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers,
        });
    } catch (error: unknown) {
        try {
            const fallbackPayload = await fetchFallbackPayload(platform);
            if (fallbackPayload) {
                return createJsonResponse(fallbackPayload, {
                    status: 200,
                    headers: { 'Cache-Control': 'public, max-age=300' },
                });
            }
        } catch { /* fall through to proxy error */ }
        const detail = error instanceof Error ? error.message : String(error);
        return createJsonResponse({ error: 'hot_news_proxy_error', detail }, { status: 502 });
    }
};
