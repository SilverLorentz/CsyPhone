
/**
 * XHS Client — 双模式小红书自动化客户端
 *
 * 自动检测后端类型:
 * - Bridge 模式 (URL 含 /api): 使用 xiaohongshu-skills Python CLI (REST)
 * - 兼容 MCP 模式 (URL 含 /mcp): 使用 xiaohongshu-mcp Go 服务器 (JSON-RPC 2.0)
 *
 * MCP Server:   https://github.com/xpzouying/xiaohongshu-mcp
 * Skills Server: https://github.com/autoclaw-cc/xiaohongshu-skills
 */

export interface McpToolResult {
    success: boolean;
    data?: any;
    error?: string;
}

// ==================== Backend Detection ====================

type BackendMode = 'mcp' | 'bridge';

const XHS_BRIDGE_SERVER_URL = 'http://localhost:18061/api';

const detectMode = (serverUrl: string): BackendMode => {
    const normalized = serverUrl.trim().toLowerCase();
    try {
        const { pathname, port } = new URL(normalized, 'http://local.test');
        if (
            port === '18061'
            || pathname === '/api'
            || pathname.startsWith('/api/')
            || pathname === '/xhs-api'
            || pathname.startsWith('/xhs-api/')
        ) return 'bridge';
    } catch {
        if (normalized.includes('18061') || normalized.includes('/xhs-api')) return 'bridge';
    }
    return 'mcp'; // default: MCP (backwards compatible)
};

const buildBridgeUrl = (serverUrl: string, endpoint: string): string => {
    const cleanBase = serverUrl.trim().replace(/\/+$/, '');
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    if (
        cleanBase.endsWith('/api')
        || cleanBase.endsWith('/xhs-api')
    ) {
        return `${cleanBase}/${cleanEndpoint}`;
    }
    return `${cleanBase}/api/${cleanEndpoint}`;
};

const isConnectionRefusedError = (message: string): boolean => {
    return /failed to fetch|fetch failed|networkerror|err_connection_refused|econnrefused/i.test(message);
};

const formatConnectionError = (serverUrl: string, error: unknown): string => {
    const rawMessage = error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : '连接失败';

    if (!isConnectionRefusedError(rawMessage)) {
        return rawMessage;
    }

    if (detectMode(serverUrl) === 'bridge') {
        const mobileHint = /localhost|127\.0\.0\.1/i.test(serverUrl)
            ? '如果你是在手机或另一台设备上打开页面，请把 localhost 改成电脑的局域网 IP，例如 http://192.168.x.x:18061/api，并确认手机和电脑在同一 Wi-Fi。'
            : '如果跨设备使用，请确认手机和电脑在同一 Wi-Fi，并且 Windows 防火墙已允许 18061 端口。';
        return `连接不到 ${serverUrl}。请先运行 scripts/start-xhs.bat，启动 Bridge 服务后再试（推荐地址: ${XHS_BRIDGE_SERVER_URL}）。${mobileHint}`;
    }

    if (serverUrl.includes('/mcp') || serverUrl.includes('18060')) {
        return `连接不到 ${serverUrl}。这个旧版 MCP 端口当前未启动；请先运行 scripts/start-xhs.bat 改用 ${XHS_BRIDGE_SERVER_URL}，或自行启动 xiaohongshu-mcp。`;
    }

    return `连接不到 ${serverUrl}。请先运行 scripts/start-xhs.bat，或检查本地小红书服务是否已启动。`;
};

// ==================== Bridge Mode (REST) ====================

const bridgePost = async (
    serverUrl: string,
    endpoint: string,
    body: Record<string, any> = {},
): Promise<McpToolResult> => {
    const url = buildBridgeUrl(serverUrl, endpoint);

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (resp.status === 401) {
            return { success: false, error: '未登录，请先登录小红书' };
        }

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            return { success: false, error: errData.error || `HTTP ${resp.status}` };
        }

        const data = await resp.json();
        if (data.error) {
            return { success: false, error: data.error };
        }
        return { success: true, data };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

// ==================== MCP Mode (JSON-RPC 2.0) ====================

interface McpJsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: any;
    id?: number;
}

interface McpJsonRpcResponse {
    jsonrpc: '2.0';
    id?: number;
    result?: any;
    error?: { code: number; message: string; data?: any };
}

let mcpRequestIdCounter = 0;
let mcpSessionId: string | null = null;
let mcpInitialized = false;
let mcpDiscoveredTools: { name: string; description?: string }[] = [];

const TOOL_NAME_ALIASES: Record<string, string[]> = {
    'check_login':       ['check_login', 'checkLogin', 'check_login_status', 'checkLoginStatus'],
    'get_login_qrcode':  ['get_login_qrcode', 'getLoginQrcode'],
    'delete_cookies':    ['delete_cookies', 'deleteCookies'],
    'search':            ['search', 'search_notes', 'searchNotes', 'search_feeds', 'searchFeeds'],
    'get_recommend':     ['get_recommend', 'getRecommend', 'list_feeds', 'listFeeds', 'get_feed_list', 'getFeedList', 'list_notes', 'listNotes'],
    'get_note_detail':   ['get_note_detail', 'getNoteDetail', 'get_feed_detail', 'getFeedDetail'],
    'publish_note':      ['publish_note', 'publishNote', 'publish_post', 'publishPost', 'publish_content', 'publishContent'],
    'publish_with_video': ['publish_with_video', 'publishWithVideo'],
    'comment':           ['comment', 'post_comment', 'postComment', 'post_comment_to_feed', 'postCommentToFeed'],
    'get_user_info':     ['get_user_info', 'getUserInfo', 'get_user_profile', 'getUserProfile', 'user_profile', 'userProfile'],
    'like_feed':         ['like_feed', 'likeFeed', 'like_note', 'likeNote'],
    'favorite_feed':     ['favorite_feed', 'favoriteFeed', 'favorite_note', 'favoriteNote', 'collect_note', 'collectNote'],
    'reply_comment':     ['reply_comment', 'replyComment', 'reply_comment_in_feed', 'replyCommentInFeed'],
};

const mcpResolveToolName = (desiredName: string): string => {
    if (!mcpDiscoveredTools.length) return desiredName;
    if (mcpDiscoveredTools.some(t => t.name === desiredName)) return desiredName;
    const aliases = TOOL_NAME_ALIASES[desiredName];
    if (aliases) {
        for (const alias of aliases) {
            if (mcpDiscoveredTools.some(t => t.name === alias)) return alias;
        }
    }
    const norm = (s: string) => s.replace(/[_-]/g, '').toLowerCase();
    const desired = norm(desiredName);
    const match = mcpDiscoveredTools.find(t => norm(t.name) === desired);
    if (match) return match.name;
    console.warn(`[MCP] 未找到工具 "${desiredName}" 的匹配，可用: ${mcpDiscoveredTools.map(t => t.name).join(', ')}`);
    return desiredName;
};

const mcpAdaptParams = (resolvedName: string, args: Record<string, any>): Record<string, any> => {
    const norm = resolvedName.replace(/[_-]/g, '').toLowerCase();
    if (args.url && !args.feed_id) {
        const feedIdTools = ['getfeeddetail', 'getnotedetail', 'postcomment', 'postcommenttofeed', 'replycommentinfeed'];
        if (feedIdTools.some(n => norm === n)) {
            const adapted = { ...args };
            adapted.feed_id = extractNoteIdFromUrl(args.url);
            if (!adapted.xsec_token) {
                const token = extractXsecTokenFromUrl(args.url);
                if (token) adapted.xsec_token = token;
            }
            delete adapted.url;
            return adapted;
        }
    }
    return args;
};

const mcpBuildRequest = (method: string, params?: any, isNotification = false): McpJsonRpcRequest => {
    const req: McpJsonRpcRequest = { jsonrpc: '2.0', method, params };
    if (!isNotification) req.id = ++mcpRequestIdCounter;
    return req;
};

const mcpParseSseResponse = (text: string): McpJsonRpcResponse | null => {
    const lines = text.split('\n');
    const dataLines: string[] = [];
    for (const line of lines) {
        if (line.startsWith('data: ')) dataLines.push(line.slice(6));
        else if (line.startsWith('data:')) dataLines.push(line.slice(5));
    }
    if (dataLines.length === 0) return null;
    for (let i = dataLines.length - 1; i >= 0; i--) {
        try { return JSON.parse(dataLines[i]); } catch { continue; }
    }
    return null;
};

const mcpParseResponse = (text: string, contentType: string): McpJsonRpcResponse => {
    if (contentType.includes('text/event-stream') || text.trimStart().startsWith('event:') || text.trimStart().startsWith('data:')) {
        const parsed = mcpParseSseResponse(text);
        if (parsed) return parsed;
    }
    try { return JSON.parse(text); } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) { try { return JSON.parse(match[0]); } catch { /* fall through */ } }
        throw new Error(`MCP: 无法解析响应: ${text.slice(0, 300)}`);
    }
};

const mcpPost = async (
    serverUrl: string,
    body: McpJsonRpcRequest,
    expectResponse = true,
): Promise<{ response: McpJsonRpcResponse | null; sessionId: string | null }> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    };
    if (mcpSessionId) headers['Mcp-Session-Id'] = mcpSessionId;

    const resp = await fetch(serverUrl, { method: 'POST', headers, body: JSON.stringify(body) });
    const sessionId = resp.headers.get('Mcp-Session-Id') || resp.headers.get('mcp-session-id');

    if (resp.status === 202) return { response: null, sessionId };
    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`MCP HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }
    if (!expectResponse) return { response: null, sessionId };

    const contentType = resp.headers.get('content-type') || '';
    const text = await resp.text();
    return { response: mcpParseResponse(text, contentType), sessionId };
};

const mcpInitialize = async (serverUrl: string): Promise<void> => {
    const initReq = mcpBuildRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'AetherOS-XhsFreeRoam', version: '1.0.0' },
    });
    const { response, sessionId } = await mcpPost(serverUrl, initReq);
    if (sessionId) mcpSessionId = sessionId;
    if (response?.error) throw new Error(`MCP Initialize failed: ${response.error.message}`);

    if (!mcpSessionId) {
        console.warn(
            '[MCP] ⚠️ 无法读取 Mcp-Session-Id 响应头（CORS 限制）。\n' +
            '如需调试兼容 /mcp 接口，请运行 CORS 代理: node scripts/mcp-proxy.mjs\n' +
            '然后把服务地址改为代理输出的 /mcp 地址'
        );
        throw new Error(
            'MCP 连接失败: 浏览器 CORS 限制无法读取 Session ID。\n' +
            '如需调试兼容 /mcp 接口，请运行 CORS 代理: node scripts/mcp-proxy.mjs\n' +
            '然后把服务地址改为代理输出的 /mcp 地址'
        );
    }

    const notifReq = mcpBuildRequest('notifications/initialized', {}, true);
    await mcpPost(serverUrl, notifReq, false);

    try {
        const toolsReq = mcpBuildRequest('tools/list');
        const { response: toolsResp } = await mcpPost(serverUrl, toolsReq);
        if (toolsResp?.result?.tools) {
            mcpDiscoveredTools = toolsResp.result.tools.map((t: any) => ({ name: t.name, description: t.description }));
            console.log('[MCP] 发现工具:', mcpDiscoveredTools.map(t => t.name).join(', '));
        }
    } catch (e) {
        console.warn('[MCP] tools/list 调用失败，将使用默认工具名', e);
    }

    mcpInitialized = true;
};

const mcpCallTool = async (serverUrl: string, toolName: string, args: Record<string, any> = {}): Promise<McpToolResult> => {
    try {
        if (!mcpInitialized) await mcpInitialize(serverUrl);
        const resolved = mcpResolveToolName(toolName);
        const adapted = mcpAdaptParams(resolved, args);
        if (resolved !== toolName) console.log(`[MCP] 工具名映射: ${toolName} → ${resolved}`);

        const body = mcpBuildRequest('tools/call', { name: resolved, arguments: adapted });
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
        };
        if (mcpSessionId) headers['Mcp-Session-Id'] = mcpSessionId;

        const resp = await fetch(serverUrl, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            return { success: false, error: `MCP HTTP ${resp.status}: ${errText.slice(0, 200)}` };
        }

        const contentType = resp.headers.get('content-type') || '';
        const text = await resp.text();
        const parsed = mcpParseResponse(text, contentType);

        if (parsed.error) return { success: false, error: `MCP Error [${parsed.error.code}]: ${parsed.error.message}` };

        const result = parsed.result;
        if (result?.content) {
            const textParts = result.content.filter((c: any) => c.type === 'text').map((c: any) => c.text);
            const fullText = textParts.join('\n');
            if (result.isError) return { success: false, error: fullText || 'MCP 工具执行失败' };
            try {
                const parsed = JSON.parse(fullText);
                console.log(`[MCP] 工具 ${toolName} 返回 JSON, 顶层 keys: ${typeof parsed === 'object' && parsed ? Object.keys(parsed).join(',') : typeof parsed}`);
                return { success: true, data: parsed };
            } catch {
                console.log(`[MCP] 工具 ${toolName} 返回纯文本 (${fullText.length} chars)`);
                return { success: true, data: fullText };
            }
        }
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

// ==================== URL Helpers ====================

const extractNoteIdFromUrl = (url: string): string => {
    const match = url.match(/\/explore\/([a-f0-9]+)/i) || url.match(/\/discovery\/item\/([a-f0-9]+)/i) || url.match(/\/([a-f0-9]{24})/);
    return match ? match[1] : url;
};

const extractXsecTokenFromUrl = (url: string): string | undefined => {
    try {
        const u = new URL(url);
        return u.searchParams.get('xsec_token') || undefined;
    } catch {
        return undefined;
    }
};

// ==================== Auto-extract helpers ====================

/**
 * 从 feed/recommend 响应中提取第一个可用的 xsec_token
 */
const extractFirstXsecToken = (data: any): string | undefined => {
    if (!data) return undefined;

    const scanArray = (arr: any[]): string | undefined => {
        for (const item of arr) {
            const token = item?.xsec_token || item?.xsecToken
                || item?.noteCard?.xsec_token || item?.noteCard?.xsecToken;
            if (token) return token;
        }
        return undefined;
    };

    if (Array.isArray(data)) return scanArray(data);

    for (const key of ['items', 'notes', 'feeds', 'data', 'list', 'results', 'note_list', 'noteList']) {
        if (Array.isArray(data[key])) {
            const token = scanArray(data[key]);
            if (token) return token;
        }
    }

    // 解包一层 data: { data: { items: [...] } }
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        for (const key of ['items', 'notes', 'feeds', 'list', 'results', 'note_list', 'noteList']) {
            if (Array.isArray(data.data[key])) {
                const token = scanArray(data.data[key]);
                if (token) return token;
            }
        }
        if (Array.isArray(data.data)) return scanArray(data.data);
    }

    // 纯文本中正则匹配
    if (typeof data === 'string') {
        const match = data.match(/xsec_token[=:]["']?\s*([A-Za-z0-9+/=]+)/);
        if (match) return match[1];
    }

    return undefined;
};

// ==================== Public API (双模式) ====================

export interface SearchFilters {
    sort_by?: '综合' | '最新' | '最多点赞' | '最多评论' | '最多收藏';
    note_type?: '不限' | '视频' | '图文';
    publish_time?: '不限' | '一天内' | '一周内' | '半年内';
    search_scope?: '不限' | '已看过' | '未看过' | '已关注';
    location?: '不限' | '同城' | '附近';
}

export interface PublishParams {
    title: string;
    content: string;
    images?: string[];
    tags?: string[];
    is_private?: boolean;
    schedule_at?: string;       // ISO8601, 1h~14d
    visibility?: '公开可见' | '仅自己可见' | '仅互关好友可见';
    is_original?: boolean;
    products?: string[];
}

export const XhsMcpClient = {

    resetSession: () => {
        mcpSessionId = null;
        mcpInitialized = false;
        mcpRequestIdCounter = 0;
        mcpDiscoveredTools = [];
    },

    testConnection: async (serverUrl: string): Promise<{ connected: boolean; tools?: string[]; error?: string; nickname?: string; userId?: string; loggedIn?: boolean; xsecToken?: string; mode?: BackendMode }> => {
        const mode = detectMode(serverUrl);

        if (mode === 'bridge') {
            try {
                const healthResp = await fetch(buildBridgeUrl(serverUrl, 'health'));
                if (!healthResp.ok) return { connected: false, error: `Bridge 服务未响应 (HTTP ${healthResp.status})` };

                const loginResult = await bridgePost(serverUrl, 'check-login');
                const tools = ['check-login', 'search', 'list-feeds', 'get-feed-detail', 'publish', 'publish-video', 'long-article', 'post-comment', 'reply-comment', 'like-feed', 'favorite-feed', 'user-profile', 'login', 'get-qrcode'];
                let loggedIn = false, nickname: string | undefined, userId: string | undefined;
                if (loginResult.success && loginResult.data) {
                    const d = loginResult.data;
                    if (typeof d === 'string') {
                        loggedIn = d.includes('已登录') || d.includes('logged');
                        const nameMatch = d.match(/用户名[:：]\s*(.+)/);
                        if (nameMatch) nickname = nameMatch[1].trim();
                        const idMatch = d.match(/(?:用户ID|user_id|userId|red_id|ID)[:：]\s*(\S+)/i);
                        if (idMatch) userId = idMatch[1].trim();
                    } else {
                        loggedIn = !!(d.logged_in || d.loggedIn || d.is_logged_in || d.isLoggedIn || d.logged);
                        nickname = d.nickname || d.name || d.username || d.user_name || undefined;
                        userId = d.user_id || d.userId || d.id || d.red_id || undefined;
                    }
                }
                // 自动获取 xsecToken
                let xsecToken: string | undefined;
                if (loggedIn) {
                    try {
                        const feedResult = await bridgePost(serverUrl, 'list-feeds');
                        if (feedResult.success) xsecToken = extractFirstXsecToken(feedResult.data);
                    } catch { /* 非关键 */ }
                }
                return { connected: true, tools, nickname, userId, loggedIn, xsecToken, mode };
            } catch (e: any) {
                return { connected: false, error: formatConnectionError(serverUrl, e) };
            }
        }

        // MCP mode
        try {
            XhsMcpClient.resetSession();
            await mcpInitialize(serverUrl);
            const tools = mcpDiscoveredTools.map(t => t.name);
            let nickname: string | undefined, userId: string | undefined, loggedIn = false;
            try {
                const loginResult = await mcpCallTool(serverUrl, 'check_login');
                if (loginResult.success && loginResult.data) {
                    const d = loginResult.data;
                    if (typeof d === 'string') {
                        loggedIn = d.includes('已登录');
                        const nameMatch = d.match(/用户名[:：]\s*(.+)/);
                        if (nameMatch) nickname = nameMatch[1].trim();
                        const idMatch = d.match(/(?:用户ID|user_id|userId|red_id|ID)[:：]\s*(\S+)/i);
                        if (idMatch) userId = idMatch[1].trim();
                    } else {
                        loggedIn = !!(d.logged_in || d.loggedIn || d.is_logged_in || d.isLoggedIn);
                        nickname = d.nickname || d.name || d.username || undefined;
                        userId = d.user_id || d.userId || d.id || d.red_id || undefined;
                    }
                }
            } catch (e) {
                console.warn('[MCP] 获取登录状态失败，跳过:', e);
            }
            // 自动获取 xsecToken
            let xsecToken: string | undefined;
            if (loggedIn) {
                try {
                    console.log('[MCP] 自动获取 xsecToken: 调用 get_recommend...');
                    const feedResult = await mcpCallTool(serverUrl, 'get_recommend');
                    if (feedResult.success) {
                        xsecToken = extractFirstXsecToken(feedResult.data);
                        console.log(`[MCP] 自动获取 xsecToken: ${xsecToken ? '成功' : '未找到'}`);
                    }
                } catch (e) {
                    console.warn('[MCP] 自动获取 xsecToken 失败（不影响连接）:', e);
                }
            }
            return { connected: true, tools, nickname, userId, loggedIn, xsecToken, mode };
        } catch (e: any) {
            return { connected: false, error: formatConnectionError(serverUrl, e) };
        }
    },

    ensureInitialized: async (serverUrl: string): Promise<void> => {
        if (detectMode(serverUrl) === 'mcp' && !mcpInitialized) {
            XhsMcpClient.resetSession();
            await mcpInitialize(serverUrl);
        }
    },

    checkLogin: async (serverUrl: string): Promise<McpToolResult> => {
        return detectMode(serverUrl) === 'bridge'
            ? bridgePost(serverUrl, 'check-login')
            : mcpCallTool(serverUrl, 'check_login');
    },

    search: async (serverUrl: string, keyword: string, filters?: SearchFilters): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') {
            return bridgePost(serverUrl, 'search', { keyword, ...filters });
        }
        const args: Record<string, any> = { keyword };
        if (filters) args.filters = filters;
        return mcpCallTool(serverUrl, 'search', args);
    },

    getRecommend: async (serverUrl: string): Promise<McpToolResult> => {
        return detectMode(serverUrl) === 'bridge'
            ? bridgePost(serverUrl, 'list-feeds')
            : mcpCallTool(serverUrl, 'get_recommend');
    },

    getNoteDetail: async (serverUrl: string, noteUrl: string, xsecToken?: string, options?: {
        loadAllComments?: boolean;
        limit?: number;
        reply_limit?: number;
        scroll_speed?: 'slow' | 'normal' | 'fast';
    }): Promise<McpToolResult> => {
        const feedId = extractNoteIdFromUrl(noteUrl);
        const token = xsecToken || extractXsecTokenFromUrl(noteUrl) || '';

        if (detectMode(serverUrl) === 'bridge') {
            return bridgePost(serverUrl, 'get-feed-detail', {
                feed_id: feedId, xsec_token: token,
                load_all_comments: options?.loadAllComments || false,
                click_more_replies: options?.loadAllComments || false,
            });
        }
        const args: Record<string, any> = { url: noteUrl };
        if (xsecToken) args.xsec_token = xsecToken;
        if (options?.loadAllComments) { args.load_all_comments = true; args.click_more_replies = true; }
        if (options?.limit) args.limit = options.limit;
        if (options?.reply_limit) args.reply_limit = options.reply_limit;
        if (options?.scroll_speed) args.scroll_speed = options.scroll_speed;
        return mcpCallTool(serverUrl, 'get_note_detail', args);
    },

    publishNote: async (serverUrl: string, params: PublishParams): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') {
            return bridgePost(serverUrl, 'publish', {
                title: params.title, content: params.content,
                images: params.images || [], tags: params.tags || [],
                visibility: params.is_private ? 'private' : params.visibility,
                schedule_at: params.schedule_at,
                is_original: params.is_original,
                products: params.products,
            });
        }
        const args: Record<string, any> = {
            title: params.title,
            content: params.content,
            images: params.images || [],
        };
        if (params.tags?.length) args.tags = params.tags;
        if (params.is_private) args.is_private = true;
        if (params.schedule_at) args.schedule_at = params.schedule_at;
        if (params.visibility) args.visibility = params.visibility;
        if (params.is_original) args.is_original = true;
        if (params.products?.length) args.products = params.products;
        return mcpCallTool(serverUrl, 'publish_note', args);
    },

    publishVideo: async (serverUrl: string, params: {
        title: string; content: string; video: string; tags?: string[];
    }): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') {
            return bridgePost(serverUrl, 'publish-video', {
                title: params.title, content: params.content, video: params.video, tags: params.tags || [],
            });
        }
        return mcpCallTool(serverUrl, 'publish_with_video', {
            title: params.title, content: params.content, video: params.video, tags: params.tags || [],
        });
    },

    publishLongArticle: async (serverUrl: string, params: {
        title: string; content: string; images?: string[];
    }): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') {
            return bridgePost(serverUrl, 'long-article', {
                title: params.title, content: params.content, images: params.images || [],
            });
        }
        return { success: false, error: '长文发布仅在 Skills (Bridge) 模式下可用' };
    },

    comment: async (serverUrl: string, noteUrl: string, content: string, xsecToken?: string): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') {
            const feedId = extractNoteIdFromUrl(noteUrl);
            const token = xsecToken || extractXsecTokenFromUrl(noteUrl) || '';
            return bridgePost(serverUrl, 'post-comment', { feed_id: feedId, xsec_token: token, content });
        }
        const args: Record<string, any> = { url: noteUrl, content };
        if (xsecToken) args.xsec_token = xsecToken;
        return mcpCallTool(serverUrl, 'comment', args);
    },

    likeFeed: async (serverUrl: string, feedId: string, xsecToken: string, unlike = false): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') {
            return bridgePost(serverUrl, 'like-feed', { feed_id: feedId, xsec_token: xsecToken, unlike });
        }
        return mcpCallTool(serverUrl, 'like_feed', { feed_id: feedId, xsec_token: xsecToken, ...(unlike ? { unlike: true } : {}) });
    },

    favoriteFeed: async (serverUrl: string, feedId: string, xsecToken: string, unfavorite = false): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') {
            return bridgePost(serverUrl, 'favorite-feed', { feed_id: feedId, xsec_token: xsecToken, unfavorite });
        }
        return mcpCallTool(serverUrl, 'favorite_feed', { feed_id: feedId, xsec_token: xsecToken, ...(unfavorite ? { unfavorite: true } : {}) });
    },

    replyComment: async (serverUrl: string, feedId: string, xsecToken: string, content: string, commentId?: string, userId?: string, parentCommentId?: string): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') {
            return bridgePost(serverUrl, 'reply-comment', {
                feed_id: feedId, xsec_token: xsecToken, content, comment_id: commentId, user_id: userId,
            });
        }
        const args: Record<string, any> = { feed_id: feedId, xsec_token: xsecToken, content };
        if (commentId) args.comment_id = commentId;
        if (userId) args.user_id = userId;
        if (parentCommentId) args.parent_comment_id = parentCommentId;
        return mcpCallTool(serverUrl, 'reply_comment', args);
    },

    getUserProfile: async (serverUrl: string, userId: string, xsecToken?: string): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') {
            return bridgePost(serverUrl, 'user-profile', { user_id: userId, xsec_token: xsecToken || '' });
        }
        const args: Record<string, any> = { user_id: userId };
        if (xsecToken) args.xsec_token = xsecToken;
        return mcpCallTool(serverUrl, 'get_user_info', args);
    },

    /** 触发登录流程（Bridge: 命令式; MCP: 不支持） */
    login: async (serverUrl: string): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') return bridgePost(serverUrl, 'login');
        return { success: false, error: '登录功能仅在 Bridge 模式下可用；如果你填的是兼容 /mcp 地址，请改用 Bridge 连接后再试' };
    },

    /** 获取登录二维码（双模式都支持） */
    getLoginQrcode: async (serverUrl: string): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') return bridgePost(serverUrl, 'get-qrcode');
        return mcpCallTool(serverUrl, 'get_login_qrcode');
    },

    /** 登出 / 重置 cookies（双模式都支持） */
    logout: async (serverUrl: string): Promise<McpToolResult> => {
        if (detectMode(serverUrl) === 'bridge') return bridgePost(serverUrl, 'delete-cookies');
        return mcpCallTool(serverUrl, 'delete_cookies');
    },
};

// ==================== Helpers ====================

/**
 * 从 MCP 返回的 data 中提取笔记数组 — 兼容 MCP/Bridge 各种格式
 */
export const extractNotesFromMcpData = (data: any): any[] => {
    if (!data) return [];
    if (Array.isArray(data)) {
        // 嵌套数组（数组的数组），展平后过滤出笔记对象
        if (data.length > 0 && Array.isArray(data[0])) {
            console.log(`[XHS] extractNotes: 检测到嵌套数组，展平 (${data.length} 组)`);
            return data.flat().filter((n: any) => n && typeof n === 'object' && !Array.isArray(n));
        }
        return data;
    }
    // 直接查找常见 key
    for (const key of ['notes', 'items', 'feeds', 'data', 'list', 'results', 'note_list', 'noteList']) {
        if (Array.isArray(data[key])) {
            const arr = data[key];
            // 嵌套数组处理
            if (arr.length > 0 && Array.isArray(arr[0])) {
                console.log(`[XHS] extractNotes: data.${key} 是嵌套数组，展平`);
                return arr.flat().filter((n: any) => n && typeof n === 'object' && !Array.isArray(n));
            }
            return arr;
        }
    }
    // Bridge 模式嵌套: { code: 0, data: { notes: [...] } }
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        for (const key of ['notes', 'items', 'feeds', 'list', 'results', 'note_list', 'noteList']) {
            if (Array.isArray(data.data[key])) {
                console.log(`[XHS] extractNotes: 从 data.data.${key} 找到数组, length=${data.data[key].length}`);
                return data.data[key];
            }
        }
    }
    if (typeof data === 'object') {
        const skipKeys = new Set(['interactions', 'tags', 'images', 'comments', 'replies']);
        for (const [key, val] of Object.entries(data)) {
            if (skipKeys.has(key)) continue;
            if (Array.isArray(val) && (val as any[]).length > 0) {
                const first = (val as any[])[0];
                if (first && typeof first === 'object' &&
                    (first.noteId || first.note_id || first.id || first.noteCard ||
                     first.displayTitle || first.title || first.desc || first.cover)) {
                    console.log(`[XHS] extractNotes: 在 key "${key}" 中找到笔记数组, length=${(val as any[]).length}`);
                    return val as any[];
                }
            }
        }
    }
    if (typeof data === 'string') {
        console.warn('[XHS] extractNotes: data 是纯文本，无法提取笔记:', data.slice(0, 200));
        return [];
    }
    console.warn('[XHS] extractNotes: 未找到笔记数组, data keys:', Object.keys(data));
    return [];
};

/**
 * 将 MCP/Bridge 笔记数据标准化为统一格式
 */
export const normalizeNote = (n: any): { noteId: string; title: string; desc: string; author: string; authorId: string; likes: number; xsecToken?: string; coverUrl?: string; type?: string } => {
    const card = n.noteCard || n.notecard;
    const coverObj = card?.cover || n.cover;
    const rawCoverUrl = typeof coverObj === 'string' ? coverObj
        : coverObj?.urlDefault || coverObj?.url_default || coverObj?.url || coverObj?.urlPre || undefined;
    const coverUrl = rawCoverUrl?.replace(/^http:\/\//, 'https://');
    // 点赞数：支持多种格式
    const likesRaw = n.likes || n.liked_count
        || n.interact_info?.liked_count || n.interactInfo?.likedCount
        || card?.interact_info?.liked_count || card?.interactInfo?.likedCount || 0;
    return {
        noteId: n.noteId || n.note_id || n.id || card?.note_id || card?.noteId || '',
        title: n.title || n.display_title || n.displayTitle || card?.display_title || card?.displayTitle || '',
        desc: (n.desc || n.description || n.content || card?.desc || card?.description || card?.title || '').slice(0, 500),
        author: n.author || n.nickname || n.user?.nickname || n.user?.name || card?.user?.nickname || card?.user?.name || '',
        authorId: n.authorId || n.author_id || n.user?.user_id || n.user?.userId || card?.user?.user_id || card?.user?.userId || '',
        likes: typeof likesRaw === 'string' ? parseInt(likesRaw, 10) || 0 : (likesRaw || 0),
        xsecToken: n.xsecToken || n.xsec_token || card?.xsec_token || card?.xsecToken || undefined,
        coverUrl,
        type: n.type || card?.type || undefined,
    };
};
