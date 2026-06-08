
import React,{ useMemo } from 'react';
import { haptic } from '../../utils/haptics';
import { requestSystemFullscreen,exitSystemFullscreen } from '../../utils/systemFullscreen';
import { getRuntimeConfigSnapshot,inferEmbeddingEngineId } from '../../utils/runtimeConfig';
import { safeLocalStorageGet,safeLocalStorageSet } from '../../utils/storage';
import { usePerformanceMode } from '../../hooks/usePerformanceMode';
import type { PerformanceModePreference } from '../../utils/performanceMode';

export type SettingsPanel = 'menu' | 'data' | 'api' | 'subapi' | 'realtime' | 'tts' | 'stt' | 'image' | 'embedding' | 'agent' | 'debug';

interface Props {
    onNavigate: (panel: SettingsPanel) => void;
}

// ─── Static menu item definitions (no context dependency) ───────────────

interface MenuItem {
    id: SettingsPanel;
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    desc: string;
}

const MENU_ITEMS: MenuItem[] = [
    {
        id: 'data', iconBg: 'bg-blue-100 text-blue-600',
        icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>,
        title: '备份与恢复', desc: '导出/导入数据 · 格式化系统',
    },
    {
        id: 'api', iconBg: 'bg-emerald-100/50 text-emerald-600',
        icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>,
        title: 'API 配置', desc: '主 AI 连接 · 深度沉浸模式',
    },
    {
        id: 'subapi', iconBg: 'bg-amber-100/50 text-amber-600',
        icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.646.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a6.759 6.759 0 0 1 0 .255c-.008.378.137.75.43.99l1.004.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>,
        title: '副 API 配置', desc: '心声 / 记忆摘要 / 事件提取',
    },
    {
        id: 'realtime', iconBg: 'bg-violet-100/50 text-violet-600',
        icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>,
        title: '实时感知', desc: '天气 / 资讯 / 微博热搜 / 笔记与日程',
    },
    {
        id: 'tts', iconBg: 'bg-pink-100/50 text-pink-500',
        icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>,
        title: '语音合成', desc: 'MiniMax / ElevenLabs · 通话声线',
    },
    {
        id: 'stt', iconBg: 'bg-sky-100/50 text-sky-600',
        icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>,
        title: '语音识别', desc: 'Groq / 硅基流动 STT',
    },
    {
        id: 'image', iconBg: 'bg-fuchsia-100/50 text-fuchsia-600',
        icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>,
        title: '生图服务', desc: 'NAI / OpenAI · 分离风格',
    },
    {
        id: 'embedding', iconBg: 'bg-green-100/50 text-green-600',
        icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>,
        title: '向量记忆引擎', desc: '标准版 / 增强版',
    },
    {
        id: 'agent', iconBg: 'bg-orange-100/50 text-orange-600',
        icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg>,
        title: '自律代理', desc: '主动消息频率 · 推送通知',
    },
    {
        id: 'debug', iconBg: 'bg-slate-100 text-slate-600',
        icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h14.25c.621 0 1.125.504 1.125 1.125v14.25c0 .621-.504 1.125-1.125 1.125H4.875A1.125 1.125 0 0 1 3.75 19.125V4.875Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3.75h9m-9 3.75h5.25" /></svg>,
        title: 'API 请求账本', desc: '本地调试日志 · 脱敏导出',
    },
];

const HAPTICS_ENABLED_KEY = 'os_haptics_enabled';
const FULLSCREEN_ENABLED_KEY = 'os_fullscreen_enabled';
const PERFORMANCE_MODE_OPTIONS: Array<{ id: PerformanceModePreference; label: string }> = [
    { id: 'auto', label: '自动' },
    { id: 'on', label: '开启' },
    { id: 'off', label: '关闭' },
];

// ─── Status reading from runtime snapshot (no context subscription!) ─────

function readStatuses(): Record<string, string | undefined> {
    try {
        const snapshot = getRuntimeConfigSnapshot();
        const hasPrimaryApiConfig = Boolean(
            snapshot.api.primary.apiKey
            && snapshot.api.primary.baseUrl
            && snapshot.api.primary.model,
        );
        const apiStatus = hasPrimaryApiConfig
            ? snapshot.api.primary.model.split('/').pop()
            : '未配置';
        const ttsStatus = snapshot.tts.voiceCallProvider === 'elevenlabs'
            ? (snapshot.tts.elevenLabs.apiKey && snapshot.tts.elevenLabs.voiceId ? 'ElevenLabs' : '未配置')
            : (snapshot.tts.apiKey ? 'MiniMax' : '未配置');
        const sttStatus = snapshot.stt.provider === 'siliconflow' ? '硅基' : 'Groq';
        const rtStatus = [
            snapshot.realtime.weatherEnabled && '天气',
            snapshot.realtime.newsEnabled && '新闻',
            snapshot.realtime.notionEnabled && 'Notion',
            snapshot.realtime.feishuEnabled && '飞书',
            snapshot.realtime.xhsEnabled && '小红书',
            snapshot.realtime.canvaEnabled && 'Canva',
        ].filter(Boolean).join(' · ') || '未开启';

        const embeddingEngineId = inferEmbeddingEngineId(snapshot.embedding.model);
        const embStatus = snapshot.embedding.apiKey
            ? (embeddingEngineId === 'enhanced' ? '增强版' : '标准版')
            : '未配置';
        const embDesc = embeddingEngineId === 'enhanced'
            ? 'Qwen3-Embedding-8B'
            : 'bge-m3';
        const imageConfig = snapshot.imageGeneration.config;
        const imageStatus = imageConfig.activeProvider === 'openai-compatible'
            ? (imageConfig.openaiCompatible.apiKey && imageConfig.openaiCompatible.model
                ? imageConfig.openaiCompatible.model
                : '未配置')
            : (imageConfig.novelai.apiToken
                ? imageConfig.novelai.model.replace('nai-diffusion-', 'NAI ')
                : '未配置');

        return {
            api: apiStatus,
            tts: ttsStatus,
            stt: sttStatus,
            realtime: rtStatus,
            image: imageStatus,
            embedding: embStatus,
            embeddingDesc: embDesc,
        };
    } catch { return {}; }
}

// ─── Component ──────────────────────────────────────────────────────────

const SettingsMenu: React.FC<Props> = ({ onNavigate }) => {
    const statuses = useMemo(readStatuses, []);
    const performanceMode = usePerformanceMode();

    // Haptics toggle — UI-only preference via storage helper
    const [hapticsEnabled, setHapticsEnabled] = React.useState(() => {
        return safeLocalStorageGet(HAPTICS_ENABLED_KEY) !== 'false';
    });
    const toggleHaptics = (checked: boolean) => {
        setHapticsEnabled(checked);
        safeLocalStorageSet(HAPTICS_ENABLED_KEY, String(checked));
        if (checked) haptic.medium();
    };

    // Fullscreen toggle — UI-only preference via storage helper
    const [fullscreenEnabled, setFullscreenEnabled] = React.useState(() => {
        return safeLocalStorageGet(FULLSCREEN_ENABLED_KEY) === 'true';
    });
    const toggleFullscreen = (checked: boolean) => {
        setFullscreenEnabled(checked);
        safeLocalStorageSet(FULLSCREEN_ENABLED_KEY, String(checked));
        if (checked) {
            requestSystemFullscreen();
        } else {
            exitSystemFullscreen();
        }
    };

    const setPerformancePreference = (preference: PerformanceModePreference) => {
        haptic.light();
        performanceMode.setPreference(preference);
    };

    const statusMap: Record<string, string | undefined> = {
        api: statuses.api,
        tts: statuses.tts,
        stt: statuses.stt,
        image: statuses.image,
        realtime: statuses.realtime,
        embedding: statuses.embedding,
    };

    return (
        <div className="space-y-2">
            {MENU_ITEMS.map(item => (
                <button
                    key={item.id}
                    onClick={() => { haptic.light(); onNavigate(item.id); }}
                    className="w-full flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-white/50 active:scale-[0.98] transition-all text-left"
                >
                    <div className={`p-2 rounded-xl shrink-0 ${item.iconBg}`}>
                        {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-700">{item.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                            {item.id === 'embedding' ? (statuses.embeddingDesc || item.desc) : item.desc}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {statusMap[item.id] && <span className="text-[10px] text-slate-400 font-medium max-w-[80px] truncate">{statusMap[item.id]}</span>}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-300">
                            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                    </div>
                </button>
            ))}

            {/* 触觉反馈 */}
            <div className="flex items-center justify-between bg-white/60 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-white/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100/50 rounded-xl text-amber-600">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3" /></svg>
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-slate-700">触觉反馈</div>
                        <div className="text-[10px] text-slate-400">操作时产生震动反馈</div>
                    </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={hapticsEnabled} onChange={e => toggleHaptics(e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
            </div>

            {/* 沉浸全屏 */}
            <div className="flex items-center justify-between bg-white/60 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-white/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-teal-100/50 rounded-xl text-teal-600">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-slate-700">沉浸全屏</div>
                        <div className="text-[10px] text-slate-400">支持时隐藏；iOS 自动避开状态栏</div>
                    </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={fullscreenEnabled} onChange={e => toggleFullscreen(e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                </label>
            </div>

            {/* 流畅模式 */}
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-white/50">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-indigo-100/50 rounded-xl text-indigo-600 shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5 10.5 3.75l-1.5 7.5h11.25L13.5 20.25l1.5-6.75H3.75Z" /></svg>
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-700">流畅模式</div>
                            <div className="text-[10px] text-slate-400 truncate">
                                当前：{performanceMode.resolved === 'lite' ? '流畅优先' : '完整效果'}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100/70 p-1" data-testid="performance-mode-control">
                    {PERFORMANCE_MODE_OPTIONS.map(option => {
                        const active = performanceMode.preference === option.id;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setPerformancePreference(option.id)}
                                className={`h-8 rounded-lg text-[11px] font-bold transition-all ${
                                    active
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-slate-400 active:bg-white/60'
                                }`}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="text-center text-[10px] text-slate-300 pb-8 pt-4 font-mono tracking-widest uppercase">
                v2.2 (Realtime Awareness)
            </div>
        </div>
    );
};

export default React.memo(SettingsMenu);
