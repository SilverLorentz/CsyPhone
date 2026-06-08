
import React,{ useState } from 'react';
import { buildBackendUrl } from '../../../utils/backendClient';
import { getGuardedInputProps } from '../../../utils/inputGuards';

const HOT_NEWS_PLATFORM_OPTIONS = [
    { key: 'weibo', label: '微博' },
    { key: 'zhihu', label: '知乎' },
    { key: 'baidu', label: '百度' },
    { key: 'bilibili', label: 'B站' },
    { key: 'douyin', label: '抖音' },
    { key: 'jinritoutiao', label: '今日头条' },
    { key: 'douban', label: '豆瓣' },
    { key: 'github', label: 'GitHub' },
];

interface WeatherProps {
    enabled: boolean; apiKey: string; city: string;
    set: (field: string, value: any) => void;
    onTestStatus: (msg: string) => void;
}

export const WeatherSection = React.memo<WeatherProps>(({ enabled, apiKey, city, set, onTestStatus }) => {
    const testWeatherApi = async () => {
        if (!apiKey) { onTestStatus('请先填写 API Key'); return; }
        onTestStatus('正在测试...');
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=zh_cn`;
            const res = await fetch(url);
            if (res.ok) { const data = await res.json(); onTestStatus(`连接成功！${data.name}: ${data.weather[0]?.description}, ${Math.round(data.main.temp)}°C`); }
            else { onTestStatus(`连接失败: HTTP ${res.status}`); }
        } catch (e: any) { onTestStatus(`网络错误: ${e.message}`); }
    };

    return (
        <div className="bg-emerald-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">☀️</span><span className="text-sm font-bold text-emerald-700">天气感知</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => set('weatherEnabled', e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
            </div>
            {enabled && (
                <div className="space-y-2">
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">OpenWeatherMap API Key</label>
                        <input type="text" value={apiKey} onChange={e => set('weatherApiKey', e.target.value)} className="w-full bg-white/80 border border-emerald-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="获取: openweathermap.org" {...getGuardedInputProps({ kind: 'secret', field: 'weather-api-key' })} /></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">城市 (英文)</label>
                        <input type="text" value={city} onChange={e => set('weatherCity', e.target.value)} className="w-full bg-white/80 border border-emerald-200 rounded-xl px-3 py-2 text-sm" placeholder="Beijing, Shanghai, etc." /></div>
                    <button onClick={testWeatherApi} className="w-full py-2 bg-emerald-100 text-emerald-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试天气API</button>
                </div>
            )}
        </div>
    );
});

interface NewsProps { enabled: boolean; apiKey: string; platforms: string[]; set: (field: string, value: any) => void; }

export const NewsSection = React.memo<NewsProps>(({ enabled, apiKey, platforms, set }) => {
    const selected = platforms && platforms.length > 0 ? platforms : ['weibo', 'zhihu', 'baidu', 'bilibili', 'douyin'];
    const togglePlatform = (key: string) => {
        const next = selected.includes(key)
            ? selected.filter(item => item !== key)
            : [...selected, key];
        set('newsPlatforms', next.length > 0 ? next : ['weibo']);
    };

    return (
    <div className="bg-blue-50/50 p-4 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="text-lg">📰</span><span className="text-sm font-bold text-blue-700">外部热点感知</span></div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={e => set('newsEnabled', e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
        </div>
        {enabled && (
            <div className="space-y-2">
                <p className="text-xs text-blue-600/70">把微博、B站、知乎、百度、抖音等多平台热榜作为外部世界快照；char 会按兴趣自然挑话题，也能生成可跳转热点卡片。</p>
                <div className="grid grid-cols-2 gap-2">
                    {HOT_NEWS_PLATFORM_OPTIONS.map(option => (
                        <label key={option.key} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors ${selected.includes(option.key) ? 'bg-white border-blue-200 text-blue-700' : 'bg-white/45 border-transparent text-slate-400'}`}>
                            <input
                                type="checkbox"
                                checked={selected.includes(option.key)}
                                onChange={() => togglePlatform(option.key)}
                                className="h-3.5 w-3.5 accent-blue-500"
                            />
                            {option.label}
                        </label>
                    ))}
                </div>
                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Brave Search API Key (可选回落)</label>
                    <input type="text" value={apiKey} onChange={e => set('newsApiKey', e.target.value)} className="w-full bg-white/80 border border-blue-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="获取: brave.com/search/api" {...getGuardedInputProps({ kind: 'secret', field: 'news-api-key' })} /></div>
                <p className="text-[10px] text-blue-500/70">Brave 可留空；只有多平台热榜拉不到时才会尝试 Brave，最后再兜底 Hacker News。</p>
            </div>
        )}
    </div>
    );
});

interface HotSearchProps { enabled: boolean; set: (field: string, value: any) => void; }

export const HotSearchSection = React.memo<HotSearchProps>(({ enabled, set }) => {
    const [testStatus, setTestStatus] = useState('');
    const testHotSearch = async () => {
        setTestStatus('正在测试...');
        try {
            const res = await fetch(buildBackendUrl('/api/public/hotlist', { type: 'wbHot' }));
            if (res.ok) {
                const json = await res.json() as any;
                if (json.success && json.data?.length > 0) {
                    setTestStatus(`✅ 连接成功！当前 #1 热搜: ${json.data[0].title}`);
                } else { setTestStatus('❌ 返回数据异常'); }
            } else { setTestStatus(`❌ HTTP ${res.status}`); }
        } catch (e: any) { setTestStatus(`❌ 网络错误: ${e.message}`); }
    };

    return (
        <div className="bg-red-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">🔥</span><span className="text-sm font-bold text-red-700">微博热搜精筛</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => set('hotSearchEnabled', e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                </label>
            </div>
            {enabled && (
                <div className="space-y-2">
                    <p className="text-xs text-red-600/70">这是外部感知里的微博补充能力：给角色做更细的微博热搜兴趣筛选。多平台入口仍由“外部热点感知”负责；两者可以同时开启。</p>
                    <button onClick={testHotSearch} className="w-full py-2 bg-red-100 text-red-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试热搜接口</button>
                    {testStatus && <p className="text-xs text-center text-red-600/80">{testStatus}</p>}
                </div>
            )}
        </div>
    );
});

interface AiHotProps { enabled: boolean; set: (field: string, value: any) => void; }

export const AiHotSection = React.memo<AiHotProps>(({ enabled, set }) => {
    const [testStatus, setTestStatus] = useState('');
    const testAiHot = async () => {
        setTestStatus('正在测试...');
        try {
            const res = await fetch('https://sully-n.sully-tts-proxy.workers.dev/aihot');
            if (res.ok) {
                const json = await res.json() as any;
                if (json.success && json.items?.length > 0) {
                    setTestStatus(`✅ 连接成功！最新: ${json.items[0].title}`);
                } else { setTestStatus('❌ 返回数据异常'); }
            } else { setTestStatus(`❌ HTTP ${res.status}`); }
        } catch (e: any) { setTestStatus(`❌ 网络错误: ${e.message}`); }
    };

    return (
        <div className="bg-violet-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">💡</span><span className="text-sm font-bold text-violet-700">AI 动态感知</span><span className="text-[9px] bg-violet-100 text-violet-500 px-1.5 py-0.5 rounded-full">免费</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => set('aihotEnabled', e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                </label>
            </div>
            {enabled && (
                <div className="space-y-2">
                    <p className="text-xs text-violet-600/70">开启后，char 将能感知最新的 AI 行业动态，并在聊天中自然地和你讨论。适合人机恋用户 — 让 char 不只是活在聊天框里，也关心着真实世界正在发生的事。角色扮演用户可以不必开启。</p>
                    <p className="text-[10px] text-violet-500/60">无需配置，零门槛开启 · 每日自动更新</p>
                    <button onClick={testAiHot} className="w-full py-2 bg-violet-100 text-violet-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试连接</button>
                    {testStatus && <p className="text-xs text-center text-violet-600/80">{testStatus}</p>}
                </div>
            )}
        </div>
    );
});

interface NotionProps {
    enabled: boolean; apiKey: string; dbId: string; notesDbId: string;
    set: (field: string, value: any) => void;
    onTestStatus: (msg: string) => void;
}

export const NotionSection = React.memo<NotionProps>(({ enabled, apiKey, dbId, notesDbId, set, onTestStatus }) => {
    const testNotionApi = async () => {
        if (!apiKey || !dbId) { onTestStatus('请填写 Notion API Key 和 Database ID'); return; }
        onTestStatus('正在测试 Notion 连接...');
        try {
            const { NotionManager } = await import('../../../utils/realtimeContext');
            const result = await NotionManager.testConnection(apiKey, dbId);
            onTestStatus(result.message);
        } catch (e: any) { onTestStatus(`网络错误: ${e.message}`); }
    };

    return (
        <div className="bg-orange-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">📝</span><span className="text-sm font-bold text-orange-700">Notion 日记</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => set('notionEnabled', e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
            </div>
            {enabled && (
                <div className="space-y-2">
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Notion Integration Token</label>
                        <input type="text" value={apiKey} onChange={e => set('notionApiKey', e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="secret_..." {...getGuardedInputProps({ kind: 'secret', field: 'notion-api-key' })} /></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Database ID</label>
                        <input type="text" value={dbId} onChange={e => set('notionDbId', e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="从数据库URL复制" {...getGuardedInputProps({ kind: 'config', field: 'notion-database-id' })} /></div>
                    <button onClick={testNotionApi} className="w-full py-2 bg-orange-100 text-orange-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试Notion连接</button>
                    <div className="border-t border-orange-200/50 pt-2 mt-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">笔记数据库 ID（可选）</label>
                        <input type="text" value={notesDbId} onChange={e => set('notionNotesDbId', e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="用户日常笔记的数据库ID" {...getGuardedInputProps({ kind: 'config', field: 'notion-notes-database-id' })} />
                        <p className="text-[10px] text-orange-500/60 leading-relaxed mt-1">填写后角色可以偶尔看到你的笔记标题，温馨地提起你写的内容。留空则不启用。</p>
                    </div>
                    <p className="text-[10px] text-orange-500/70 leading-relaxed">
                        1. 在 <a href="https://www.notion.so/my-integrations" target="_blank" className="underline">Notion开发者</a> 创建Integration<br />
                        2. 创建一个日记数据库，添加"Name"(标题)和"Date"(日期)属性<br />
                        3. 在数据库右上角菜单中 Connect 你的 Integration
                    </p>
                </div>
            )}
        </div>
    );
});

interface FeishuProps {
    enabled: boolean; appId: string; appSecret: string; baseId: string; tableId: string;
    set: (field: string, value: any) => void;
    onTestStatus: (msg: string) => void;
}

export const FeishuSection = React.memo<FeishuProps>(({ enabled, appId, appSecret, baseId, tableId, set, onTestStatus }) => {
    const testFeishuApi = async () => {
        if (!appId || !appSecret || !baseId || !tableId) { onTestStatus('请填写飞书 App ID、App Secret、多维表格 ID 和数据表 ID'); return; }
        onTestStatus('正在测试飞书连接...');
        try {
            const { FeishuManager } = await import('../../../utils/realtimeContext');
            const result = await FeishuManager.testConnection(appId, appSecret, baseId, tableId);
            onTestStatus(result.message);
        } catch (e: any) { onTestStatus(`网络错误: ${e.message}`); }
    };

    return (
        <div className="bg-indigo-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">📒</span><span className="text-sm font-bold text-indigo-700">飞书日记</span><span className="text-[9px] bg-indigo-100 text-indigo-500 px-1.5 py-0.5 rounded-full">中国区</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => set('feishuEnabled', e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
            </div>
            <p className="text-[10px] text-indigo-500/70 leading-relaxed">Notion 的中国区替代方案，无需翻墙。使用飞书多维表格存储日记。</p>
            {enabled && (
                <div className="space-y-2">
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">飞书 App ID</label><input type="text" value={appId} onChange={e => set('feishuAppId', e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="cli_xxxxxxxx" {...getGuardedInputProps({ kind: 'config', field: 'feishu-app-id' })} /></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">飞书 App Secret</label><input type="text" value={appSecret} onChange={e => set('feishuAppSecret', e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="xxxxxxxxxxxxxxxx" {...getGuardedInputProps({ kind: 'secret', field: 'feishu-app-secret' })} /></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">多维表格 App Token</label><input type="text" value={baseId} onChange={e => set('feishuBaseId', e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="从多维表格URL中获取" {...getGuardedInputProps({ kind: 'config', field: 'feishu-base-id' })} /></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">数据表 Table ID</label><input type="text" value={tableId} onChange={e => set('feishuTableId', e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="tblxxxxxxxx" {...getGuardedInputProps({ kind: 'config', field: 'feishu-table-id' })} /></div>
                    <button onClick={testFeishuApi} className="w-full py-2 bg-indigo-100 text-indigo-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试飞书连接</button>
                    <p className="text-[10px] text-indigo-500/70 leading-relaxed">
                        1. 在 <a href="https://open.feishu.cn/app" target="_blank" className="underline">飞书开放平台</a> 创建企业自建应用，获取 App ID 和 Secret<br />
                        2. 在应用权限中添加「多维表格」相关权限<br />
                        3. 创建一个多维表格，添加字段: 标题(文本)、内容(文本)、日期(日期)、心情(文本)、角色(文本)<br />
                        4. 从多维表格 URL 中获取 App Token 和 Table ID
                    </p>
                </div>
            )}
        </div>
    );
});

interface CanvaMcpProps {
    enabled: boolean; mcpUrl: string; workspaceLabel: string;
    set: (field: string, value: any) => void;
    onTestStatus: (msg: string) => void;
    onUpdateConfig: (config: any) => void;
}

export const CanvaMcpSection = React.memo<CanvaMcpProps>(({ enabled, mcpUrl, workspaceLabel, set, onTestStatus, onUpdateConfig }) => {
    const [connectedMode, setConnectedMode] = useState<'bridge' | 'mcp' | ''>('');
    const recommendedBridgeUrl = 'http://localhost:18062/api';

    const persistConfig = (nextUrl: string, nextWorkspaceLabel?: string) => {
        onUpdateConfig({
            enabled,
            serverUrl: nextUrl,
            workspaceLabel: nextWorkspaceLabel || workspaceLabel || undefined,
        });
    };

    const testCanvaMcp = async () => {
        if (!mcpUrl) { onTestStatus('请填写 Canva 服务地址'); return; }
        onTestStatus('正在连接 Canva...');
        try {
            const { CanvaMcpClient } = await import('../../../utils/canvaMcpClient');
            const result = await CanvaMcpClient.testConnection(mcpUrl);
            if (result.connected) {
                const toolCount = result.tools?.length || 0;
                const modeLabel = result.mode === 'bridge' ? 'Bridge' : '兼容 MCP';
                setConnectedMode(result.mode || '');
                if (result.workspaceLabel && !workspaceLabel) set('canvaWorkspaceLabel', result.workspaceLabel);
                persistConfig(mcpUrl, result.workspaceLabel);
                onTestStatus(`✅ Canva ${modeLabel} 连接成功! ${toolCount} 个工具可用${result.workspaceLabel ? ` | 工作区: ${result.workspaceLabel}` : ''}`);
            } else {
                setConnectedMode('');
                onTestStatus(`❌ Canva 连接失败: ${result.error}`);
            }
        } catch (e: any) {
            setConnectedMode('');
            onTestStatus(`Canva 网络错误: ${e.message}`);
        }
    };

    const autoDetect = async () => {
        onTestStatus('正在探测 Canva 服务...');
        const { CanvaMcpClient } = await import('../../../utils/canvaMcpClient');
        const candidates = [recommendedBridgeUrl, '/canva-api'];
        let lastError = '';
        for (const url of candidates) {
            try {
                onTestStatus(`尝试 ${url}...`);
                const result = await CanvaMcpClient.testConnection(url);
                if (result.connected) {
                    set('canvaMcpUrl', url);
                    setConnectedMode(result.mode || '');
                    if (result.workspaceLabel && !workspaceLabel) set('canvaWorkspaceLabel', result.workspaceLabel);
                    onUpdateConfig({
                        enabled,
                        serverUrl: url,
                        workspaceLabel: workspaceLabel || result.workspaceLabel || undefined,
                    });
                    onTestStatus(`✅ Canva 自动探测成功: ${url}`);
                    return;
                }
                lastError = result.error || '连接失败';
            } catch (error: any) {
                lastError = error?.message || '连接失败';
            }
        }
        onTestStatus(`❌ Canva 自动探测失败。请确认 Canva MCP/Bridge 已启动（推荐地址 ${recommendedBridgeUrl}）。${lastError ? `最后一次错误：${lastError}` : ''}`);
    };

    return (
        <div className="bg-cyan-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🎨</span>
                    <span className="text-sm font-bold text-cyan-700">Canva 设计</span>
                    <span className="text-[9px] bg-fuchsia-100 text-fuchsia-500 px-1.5 py-0.5 rounded-full">MCP</span>
                    {connectedMode && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${connectedMode === 'bridge' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                            {connectedMode === 'bridge' ? 'Bridge 模式' : '兼容 MCP'}
                        </span>
                    )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => { set('canvaMcpEnabled', e.target.checked); set('canvaEnabled', e.target.checked); }} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
            </div>
            <p className="text-[10px] text-cyan-600/70 leading-relaxed">开启后，char 可以在聊天里帮你生成 Canva 设计草稿、搜索已有设计、导出分享图。建议通过本地 Bridge 或远端代理处理 Canva OAuth。</p>
            {enabled && (
                <div className="space-y-2">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Server URL</label>
                        <input value={mcpUrl} onChange={e => set('canvaMcpUrl', e.target.value)} className="w-full bg-white/80 border border-cyan-200 rounded-xl px-3 py-2 text-[11px] font-mono" placeholder="推荐: http://localhost:18062/api；开发期也可用 /canva-api" {...getGuardedInputProps({ kind: 'url', field: 'canva-mcp-server-url', inputMode: 'text' })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={testCanvaMcp} className="py-2 bg-cyan-100 text-cyan-700 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试连接</button>
                        <button onClick={autoDetect} className="py-2 bg-cyan-50 text-cyan-600 text-xs font-bold rounded-xl active:scale-95 transition-transform border border-cyan-200">自动探测</button>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">工作区备注</label>
                        <input value={workspaceLabel} onChange={e => set('canvaWorkspaceLabel', e.target.value)} className="w-full bg-white/80 border border-cyan-200 rounded-xl px-3 py-2 text-[11px]" placeholder="例如: 个人 Canva / 品牌团队" />
                    </div>
                    <p className="text-[10px] text-cyan-600/70 leading-relaxed">
                        官方 Canva MCP 的登录和权限按每个用户单独授权；前端只保存服务地址和工作区备注。若在手机访问，请把 localhost 改成电脑局域网 IP，例如 http://192.168.x.x:18062/api。
                    </p>
                </div>
            )}
        </div>
    );
});

interface XhsMcpProps {
    enabled: boolean; mcpUrl: string; nickname: string; userId: string;
    set: (field: string, value: any) => void;
    onTestStatus: (msg: string) => void;
    onUpdateConfig: (config: any) => void;
}

export const XhsMcpSection = React.memo<XhsMcpProps>(({ enabled, mcpUrl, nickname, userId, set, onTestStatus, onUpdateConfig }) => {
    const [connectedMode, setConnectedMode] = useState<'bridge' | 'mcp' | ''>('');
    const [qrImage, setQrImage] = useState<string | null>(null);
    const [qrLoading, setQrLoading] = useState(false);
    const recommendedBridgeUrl = 'http://localhost:18061/api';

    const testXhsMcp = async () => {
        if (!mcpUrl) { onTestStatus('请填写小红书服务地址'); return; }
        onTestStatus('正在连接...');
        try {
            const { XhsMcpClient } = await import('../../../utils/xhsMcpClient');
            const result = await XhsMcpClient.testConnection(mcpUrl);
            if (result.connected) {
                const toolCount = result.tools?.length || 0;
                const modeLabel = result.mode === 'bridge' ? 'Bridge' : '兼容 MCP';
                setConnectedMode(result.mode || '');
                const loginInfo = result.loggedIn
                    ? ` | ${result.nickname ? `账号: ${result.nickname}` : '已登录'}${result.userId ? ` (ID: ${result.userId})` : ''}`
                    : ' | ⚠️ 未登录，请先登录小红书';
                onTestStatus(`✅ ${modeLabel} 连接成功! ${toolCount} 个工具可用${loginInfo}`);
                if (result.nickname && !nickname) set('xhsNickname', result.nickname);
                if (result.userId && !userId) set('xhsUserId', result.userId);
                onUpdateConfig({ enabled, serverUrl: mcpUrl, loggedInNickname: nickname || result.nickname, loggedInUserId: userId || result.userId });
            } else { onTestStatus(`❌ 连接失败: ${result.error}`); setConnectedMode(''); }
        } catch (e: any) { onTestStatus(`网络错误: ${e.message}`); setConnectedMode(''); }
    };

    const autoDetect = async () => {
        onTestStatus('🔍 自动探测中...');
        const { XhsMcpClient } = await import('../../../utils/xhsMcpClient');
        const candidates = [recommendedBridgeUrl, '/xhs-api'];
        let lastError = '';
        for (const url of candidates) {
            try {
                onTestStatus(`🔍 尝试 ${url}...`);
                const r = await XhsMcpClient.testConnection(url);
                if (r.connected) {
                    set('xhsMcpUrl', url);
                    setConnectedMode(r.mode || '');
                    const modeLabel = r.mode === 'bridge' ? 'Bridge' : '兼容 MCP';
                    onTestStatus(`✅ 自动探测成功: ${url} (${modeLabel})`);
                    if (r.nickname && !nickname) set('xhsNickname', r.nickname);
                    if (r.userId && !userId) set('xhsUserId', r.userId);
                    onUpdateConfig({ enabled, serverUrl: url, loggedInNickname: nickname || r.nickname, loggedInUserId: userId || r.userId });
                    return;
                }
                lastError = r.error ? `${url}：${r.error}` : `${url}：连接失败`;
            } catch { /* continue */ }
        }
        onTestStatus(`❌ 自动探测失败。请先双击 scripts/start-xhs.bat 启动 Bridge（推荐地址 ${recommendedBridgeUrl}）。${lastError ? `最后一次错误：${lastError}` : ''}`);
    };

    const fetchQrCode = async () => {
        if (!mcpUrl) { onTestStatus('请先连接小红书服务'); return; }
        setQrLoading(true);
        try {
            const { XhsMcpClient } = await import('../../../utils/xhsMcpClient');
            const r = await XhsMcpClient.getLoginQrcode(mcpUrl);
            if (r.success && r.data) {
                // data 可能是 base64 字符串或包含 base64 的对象
                const imgData = typeof r.data === 'string' ? r.data
                    : r.data.qrcode || r.data.image || r.data.base64 || r.data.qr_code || '';
                if (imgData) {
                    const src = imgData.startsWith('data:') ? imgData : `data:image/png;base64,${imgData}`;
                    setQrImage(src);
                } else {
                    onTestStatus('⚠️ 返回数据中未找到二维码图片');
                }
            } else {
                onTestStatus(`⚠️ 获取二维码失败: ${r.error || '未知错误'}`);
            }
        } catch (e: any) {
            onTestStatus(`⚠️ 获取二维码失败: ${e.message}`);
        } finally {
            setQrLoading(false);
        }
    };

    return (
        <div className="bg-red-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">📕</span>
                    <span className="text-sm font-bold text-red-700">小红书 Bridge</span>
                    {connectedMode && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${connectedMode === 'bridge' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                            {connectedMode === 'bridge' ? 'Bridge 模式' : '兼容 MCP'}
                        </span>
                    )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => { set('xhsMcpEnabled', e.target.checked); set('xhsEnabled', e.target.checked); }} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                </label>
            </div>
            <p className="text-[10px] text-red-500/70 leading-relaxed">默认使用 Bridge 连接本地小红书服务，登录状态会跟随专用浏览器会话。</p>
            {enabled && (
                <div className="space-y-2">
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Server URL</label><input value={mcpUrl} onChange={e => set('xhsMcpUrl', e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px] font-mono" placeholder="推荐: http://localhost:18061/api；开发期也可用 /xhs-api" {...getGuardedInputProps({ kind: 'url', field: 'xhs-mcp-server-url', inputMode: 'text' })} /></div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={testXhsMcp} className="py-2 bg-red-100 text-red-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试连接</button>
                        <button onClick={autoDetect} className="py-2 bg-red-50 text-red-500 text-xs font-bold rounded-xl active:scale-95 transition-transform border border-red-200">🔍 自动探测</button>
                    </div>
                    {connectedMode && (
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={fetchQrCode} disabled={qrLoading} className="py-2 bg-red-100 text-red-600 text-xs font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                                {qrLoading ? '获取中...' : '📱 扫码登录'}
                            </button>
                            <button onClick={async () => {
                                const { XhsMcpClient } = await import('../../../utils/xhsMcpClient');
                                const r = await XhsMcpClient.logout(mcpUrl);
                                onTestStatus(r.success ? '已重置登录状态' : `重置失败: ${r.error}`);
                            }} className="py-2 bg-slate-100 text-slate-500 text-xs rounded-xl active:scale-95 transition-transform border border-slate-200">
                                🔄 重置登录
                            </button>
                        </div>
                    )}
                    {qrImage && (
                        <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-xl border border-red-200">
                            <img src={qrImage} alt="小红书登录二维码" className="w-40 h-40 object-contain" />
                            <p className="text-[10px] text-red-500/70">请用小红书 App 扫码登录</p>
                            <button onClick={() => setQrImage(null)} className="text-[10px] text-slate-400 underline">关闭</button>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">小红书昵称</label><input value={nickname} onChange={e => set('xhsNickname', e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px]" placeholder="连接后自动获取" /></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">用户 ID</label><input value={userId} onChange={e => set('xhsUserId', e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px] font-mono" placeholder="可选" /></div>
                    </div>
                    <p className="text-[10px] text-red-500/70 leading-relaxed">
                        <b>推荐用法：</b>双击 scripts/start-xhs.bat 一键启动，连接 {recommendedBridgeUrl}<br />
                        手机或另一台设备访问时，请把 localhost 改成电脑局域网 IP，例如 http://192.168.x.x:18061/api<br />
                        本地开发也可直接用 /xhs-api（Vite 代理）<br />
                        连接成功后会自动读取昵称和登录状态
                    </p>
                </div>
            )}
        </div>
    );
});
