import type { CanvaDesignSummary } from '../types/canva';

export interface CanvaMcpToolResult {
    success: boolean;
    data?: any;
    error?: string;
}

export interface CanvaMcpConnectionResult {
    connected: boolean;
    mode?: 'bridge' | 'mcp';
    tools?: string[];
    workspaceLabel?: string;
    error?: string;
}

interface CanvaMcpTool {
    name: string;
    description?: string;
    inputSchema?: {
        properties?: Record<string, any>;
    };
}

interface CanvaMcpSession {
    initialized: boolean;
    sessionId: string | null;
    tools: CanvaMcpTool[];
}

type CanvaMcpMode = 'bridge' | 'mcp';

const CANVA_BRIDGE_SERVER_URL = 'http://localhost:18062/api';

const sessions = new Map<string, CanvaMcpSession>();
let requestId = 0;

const TOOL_ALIASES: Record<string, string[]> = {
    'generate-design': ['generate-design', 'generate_design', 'generateDesign'],
    'create-design-from-candidate': ['create-design-from-candidate', 'create_design_from_candidate', 'createDesignFromCandidate'],
    'generate-design-structured': ['generate-design-structured', 'generate_design_structured', 'generateDesignStructured'],
    'search-designs': ['search-designs', 'search_designs', 'searchDesigns'],
    'export-design': ['export-design', 'export_design', 'exportDesign'],
    'get-design-thumbnail': ['get-design-thumbnail', 'get_design_thumbnail', 'getDesignThumbnail'],
    'get-design': ['get-design', 'get_design', 'getDesign'],
};

const detectMode = (serverUrl: string): CanvaMcpMode => {
    const normalized = serverUrl.trim().toLowerCase();
    try {
        const { pathname, port } = new URL(normalized, 'http://local.test');
        if (
            port === '18062'
            || pathname === '/api'
            || pathname.startsWith('/api/')
            || pathname === '/canva-api'
            || pathname.startsWith('/canva-api/')
        ) return 'bridge';
    } catch {
        if (normalized.includes('18062') || normalized.includes('/canva-api')) return 'bridge';
    }
    return 'mcp';
};

const buildBridgeUrl = (serverUrl: string, endpoint: string): string => {
    const cleanBase = serverUrl.trim().replace(/\/+$/, '');
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    if (cleanBase.endsWith('/api') || cleanBase.endsWith('/canva-api')) {
        return `${cleanBase}/${cleanEndpoint}`;
    }
    return `${cleanBase}/api/${cleanEndpoint}`;
};

const readResponseData = async (resp: Response): Promise<any> => {
    const text = await resp.text();
    if (!text.trim()) return {};

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream') || text.includes('\ndata:')) {
        const dataLines = text
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trim())
            .filter(line => line && line !== '[DONE]');
        for (const line of dataLines.reverse()) {
            try { return JSON.parse(line); } catch { /* continue */ }
        }
    }

    try {
        return JSON.parse(text);
    } catch {
        return { text };
    }
};

const bridgeRequest = async (
    serverUrl: string,
    endpoint: string,
    body?: Record<string, any>,
): Promise<CanvaMcpToolResult> => {
    try {
        const resp = await fetch(buildBridgeUrl(serverUrl, endpoint), {
            method: body ? 'POST' : 'GET',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await readResponseData(resp);
        if (!resp.ok) {
            return { success: false, error: data?.error || data?.message || `HTTP ${resp.status}`, data };
        }
        if (data?.success === false || data?.error) {
            return { success: false, error: data.error || data.message || 'Canva Bridge 返回失败', data };
        }
        return { success: true, data };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Canva Bridge 网络错误' };
    }
};

const getSession = (serverUrl: string): CanvaMcpSession => {
    const key = serverUrl.trim();
    const existing = sessions.get(key);
    if (existing) return existing;
    const next = { initialized: false, sessionId: null, tools: [] };
    sessions.set(key, next);
    return next;
};

const mcpPost = async (serverUrl: string, method: string, params?: any, session?: CanvaMcpSession): Promise<any> => {
    const body = { jsonrpc: '2.0', id: ++requestId, method, params };
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
    };
    if (session?.sessionId) headers['Mcp-Session-Id'] = session.sessionId;

    const resp = await fetch(serverUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    const nextSessionId = resp.headers.get('Mcp-Session-Id') || resp.headers.get('mcp-session-id');
    if (session && nextSessionId) session.sessionId = nextSessionId;

    const data = await readResponseData(resp);
    if (!resp.ok) {
        throw new Error(data?.error?.message || data?.message || `HTTP ${resp.status}`);
    }
    if (data?.error) {
        throw new Error(data.error.message || 'MCP 调用失败');
    }
    return data?.result ?? data;
};

const ensureInitialized = async (serverUrl: string): Promise<CanvaMcpSession> => {
    const session = getSession(serverUrl);
    if (session.initialized) return session;

    await mcpPost(serverUrl, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'SullyOS Canva client', version: '1.0.0' },
    }, session);

    try {
        await mcpPost(serverUrl, 'notifications/initialized', undefined, session);
    } catch {
        // Some HTTP MCP gateways do not require the initialized notification.
    }

    const toolsResult = await mcpPost(serverUrl, 'tools/list', {}, session);
    session.tools = Array.isArray(toolsResult?.tools) ? toolsResult.tools : [];
    session.initialized = true;
    return session;
};

const normalizeName = (value: string): string => value.replace(/[_-]/g, '').toLowerCase();

const resolveToolName = (session: CanvaMcpSession, desiredName: string): string => {
    if (!session.tools.length) return desiredName;
    if (session.tools.some(tool => tool.name === desiredName)) return desiredName;
    const aliases = TOOL_ALIASES[desiredName] || [desiredName];
    for (const alias of aliases) {
        if (session.tools.some(tool => tool.name === alias)) return alias;
    }

    const desired = normalizeName(desiredName);
    return session.tools.find(tool => normalizeName(tool.name) === desired)?.name || desiredName;
};

const getToolSchemaProperties = (session: CanvaMcpSession, toolName: string): Record<string, any> => {
    return session.tools.find(tool => tool.name === toolName)?.inputSchema?.properties || {};
};

const setFirstSupported = (
    target: Record<string, any>,
    properties: Record<string, any>,
    candidates: string[],
    value: any,
): void => {
    const supported = candidates.find(candidate => Object.prototype.hasOwnProperty.call(properties, candidate));
    target[supported || candidates[0]] = value;
};

const adaptMcpArgs = (
    session: CanvaMcpSession,
    toolName: string,
    desiredName: string,
    args: Record<string, any>,
): Record<string, any> => {
    const properties = getToolSchemaProperties(session, toolName);
    const hasSchema = Object.keys(properties).length > 0;
    if (!hasSchema) return args;

    const adapted: Record<string, any> = {};
    if (desiredName === 'search-designs') {
        setFirstSupported(adapted, properties, ['query', 'search_query', 'keyword', 'keywords'], args.query);
        return adapted;
    }

    if (desiredName === 'export-design') {
        setFirstSupported(adapted, properties, ['design_id', 'designId', 'id'], args.design_id || args.designId);
        setFirstSupported(adapted, properties, ['format', 'file_format', 'export_format'], args.format || 'png');
        return adapted;
    }

    if (desiredName === 'generate-design') {
        setFirstSupported(adapted, properties, ['prompt', 'description', 'brief'], args.prompt);
        if (args.title) setFirstSupported(adapted, properties, ['title', 'name'], args.title);
        if (args.design_type) setFirstSupported(adapted, properties, ['design_type', 'designType', 'type'], args.design_type);
        if (args.style) setFirstSupported(adapted, properties, ['style', 'visual_style'], args.style);
        if (args.instructions) setFirstSupported(adapted, properties, ['instructions', 'notes'], args.instructions);
        return adapted;
    }

    if (desiredName === 'create-design-from-candidate') {
        setFirstSupported(adapted, properties, ['candidate_id', 'candidateId', 'id'], args.candidate_id || args.candidateId);
        if (args.title) setFirstSupported(adapted, properties, ['title', 'name'], args.title);
        return adapted;
    }

    return args;
};

const mcpCallTool = async (
    serverUrl: string,
    desiredName: string,
    args: Record<string, any>,
): Promise<CanvaMcpToolResult> => {
    try {
        const session = await ensureInitialized(serverUrl);
        const toolName = resolveToolName(session, desiredName);
        const result = await mcpPost(serverUrl, 'tools/call', {
            name: toolName,
            arguments: adaptMcpArgs(session, toolName, desiredName, args),
        }, session);
        return { success: true, data: extractMcpPayload(result) };
    } catch (e: any) {
        return { success: false, error: e?.message || 'MCP 调用失败' };
    }
};

const extractMcpPayload = (result: any): any => {
    if (!result?.content || !Array.isArray(result.content)) return result;
    const textParts = result.content
        .map((part: any) => typeof part?.text === 'string' ? part.text : '')
        .filter(Boolean);
    for (const text of textParts) {
        try { return JSON.parse(text); } catch { /* continue */ }
    }
    return { text: textParts.join('\n') || '', raw: result };
};

const getString = (value: any, keys: string[]): string => {
    if (!value || typeof value !== 'object') return '';
    for (const key of keys) {
        const raw = value[key];
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
    }
    return '';
};

const walkFindString = (value: any, keys: string[], visited = new Set<any>()): string => {
    if (!value || typeof value !== 'object' || visited.has(value)) return '';
    visited.add(value);
    const direct = getString(value, keys);
    if (direct) return direct;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = walkFindString(item, keys, visited);
            if (found) return found;
        }
        return '';
    }
    for (const item of Object.values(value)) {
        const found = walkFindString(item, keys, visited);
        if (found) return found;
    }
    return '';
};

const firstArray = (value: any, visited = new Set<any>()): any[] => {
    if (!value || typeof value !== 'object' || visited.has(value)) return [];
    visited.add(value);
    if (Array.isArray(value)) return value;
    for (const key of ['designs', 'items', 'results', 'data', 'candidates']) {
        if (Array.isArray(value[key])) return value[key];
    }
    for (const item of Object.values(value)) {
        const found = firstArray(item, visited);
        if (found.length) return found;
    }
    return [];
};

const normalizeDesign = (
    value: any,
    fallback: Partial<CanvaDesignSummary> = {},
): CanvaDesignSummary => {
    const raw = value?.design || value?.result || value?.data || value;
    const title = walkFindString(raw, ['title', 'name', 'displayName', 'display_name'])
        || fallback.title
        || 'Canva 设计';
    const id = walkFindString(raw, ['id', 'design_id', 'designId', 'urn']) || fallback.id;
    const url = walkFindString(raw, ['url', 'edit_url', 'editUrl', 'view_url', 'viewUrl', 'design_url', 'designUrl']) || fallback.url;
    const thumbnailUrl = walkFindString(raw, ['thumbnail_url', 'thumbnailUrl', 'thumbnail', 'image_url', 'imageUrl', 'preview_url', 'previewUrl']) || fallback.thumbnailUrl;
    const exportUrl = walkFindString(raw, ['export_url', 'exportUrl', 'download_url', 'downloadUrl', 'file_url', 'fileUrl']) || fallback.exportUrl;
    const format = walkFindString(raw, ['format', 'file_format', 'export_format']) || fallback.format;
    const designType = walkFindString(raw, ['design_type', 'designType', 'type']) || fallback.designType;

    return {
        id,
        title,
        url,
        thumbnailUrl,
        exportUrl,
        format,
        designType,
        status: fallback.status,
        raw,
    };
};

export const extractCanvaDesigns = (
    payload: any,
    fallback: Partial<CanvaDesignSummary> = {},
): CanvaDesignSummary[] => {
    const list = firstArray(payload);
    if (list.length) return list.map(item => normalizeDesign(item, fallback));
    return [normalizeDesign(payload, fallback)];
};

const callCanva = async (
    serverUrl: string,
    endpoint: string,
    args: Record<string, any>,
): Promise<CanvaMcpToolResult> => {
    if (detectMode(serverUrl) === 'bridge') {
        return bridgeRequest(serverUrl, endpoint, args);
    }
    return mcpCallTool(serverUrl, endpoint, args);
};

export const CanvaMcpClient = {
    recommendedBridgeUrl: CANVA_BRIDGE_SERVER_URL,

    resetSession: () => {
        sessions.clear();
    },

    testConnection: async (serverUrl: string): Promise<CanvaMcpConnectionResult> => {
        if (!serverUrl.trim()) {
            return { connected: false, error: '请填写 Canva 服务地址' };
        }

        const mode = detectMode(serverUrl);
        try {
            if (mode === 'bridge') {
                const health = await bridgeRequest(serverUrl, 'health');
                if (health.success) {
                    const tools = Array.isArray(health.data?.tools) ? health.data.tools : [];
                    return {
                        connected: true,
                        mode,
                        tools,
                        workspaceLabel: health.data?.workspaceLabel || health.data?.workspace || undefined,
                    };
                }

                const toolsResult = await bridgeRequest(serverUrl, 'tools');
                if (toolsResult.success) {
                    const tools = Array.isArray(toolsResult.data?.tools) ? toolsResult.data.tools : [];
                    return { connected: true, mode, tools };
                }
                return { connected: false, mode, error: health.error || toolsResult.error || 'Canva Bridge 连接失败' };
            }

            const session = await ensureInitialized(serverUrl);
            return {
                connected: true,
                mode,
                tools: session.tools.map(tool => tool.name),
            };
        } catch (e: any) {
            const raw = e?.message || 'Canva MCP 连接失败';
            const hint = /failed to fetch|networkerror|err_connection_refused|econnrefused/i.test(raw)
                ? `连接不到 ${serverUrl}。请确认 Canva MCP/Bridge 已启动，并处理好 OAuth 登录与浏览器跨域。`
                : raw;
            return { connected: false, mode, error: hint };
        }
    },

    generateDesign: async (
        serverUrl: string,
        params: { title: string; prompt: string; designType?: string; style?: string },
    ): Promise<CanvaMcpToolResult & { design?: CanvaDesignSummary }> => {
        const prompt = [
            params.title ? `标题: ${params.title}` : '',
            params.designType ? `类型: ${params.designType}` : '',
            params.style ? `风格: ${params.style}` : '',
            params.prompt,
        ].filter(Boolean).join('\n');
        const result = await callCanva(serverUrl, 'generate-design', {
            title: params.title,
            prompt,
            design_type: params.designType || 'social_media',
            style: params.style,
            instructions: params.prompt,
        });
        if (!result.success) return result;

        const candidateId = walkFindString(result.data, ['candidate_id', 'candidateId']);
        const existingUrl = walkFindString(result.data, ['url', 'edit_url', 'editUrl', 'design_url', 'designUrl']);
        if (candidateId && !existingUrl) {
            const createResult = await callCanva(serverUrl, 'create-design-from-candidate', {
                candidate_id: candidateId,
                candidateId,
                title: params.title,
            });
            if (createResult.success) {
                const design = extractCanvaDesigns(createResult.data, {
                    title: params.title || 'Canva 设计草稿',
                    designType: params.designType,
                    status: 'created',
                })[0];
                return { ...createResult, design };
            }
        }

        const design = extractCanvaDesigns(result.data, {
            title: params.title || 'Canva 设计草稿',
            designType: params.designType,
            status: candidateId ? 'candidate' : 'created',
        })[0];
        return { ...result, design };
    },

    searchDesigns: async (
        serverUrl: string,
        query: string,
    ): Promise<CanvaMcpToolResult & { designs?: CanvaDesignSummary[] }> => {
        const result = await callCanva(serverUrl, 'search-designs', { query });
        if (!result.success) return result;
        const designs = extractCanvaDesigns(result.data, {
            title: query,
            status: 'searched',
        });
        return { ...result, designs };
    },

    exportDesign: async (
        serverUrl: string,
        designId: string,
        format = 'png',
    ): Promise<CanvaMcpToolResult & { design?: CanvaDesignSummary }> => {
        const result = await callCanva(serverUrl, 'export-design', {
            design_id: designId,
            designId,
            format,
        });
        if (!result.success) return result;
        const design = extractCanvaDesigns(result.data, {
            id: designId,
            title: `Canva 导出 ${designId}`,
            format,
            status: 'exported',
        })[0];
        return { ...result, design };
    },
};
