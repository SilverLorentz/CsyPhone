
import React,{ useState } from 'react';
import { useOS } from '../context/OSContext';
import SettingsMenu from './settings/SettingsMenu';
import type { SettingsPanel } from './settings/SettingsMenu';

// Lazy load each settings panel for optimal performance
const ApiSettings = React.lazy(() => import('./settings/ApiSettings'));
const SubApiSettings = React.lazy(() => import('./settings/SubApiSettings'));
const RealtimeSettings = React.lazy(() => import('./settings/realtime'));
const TtsSettings = React.lazy(() => import('./settings/tts'));
const SttSettings = React.lazy(() => import('./settings/SttSettings'));
const ImageGenerationSettings = React.lazy(() => import('./settings/ImageGenerationSettings'));
const EmbeddingSettings = React.lazy(() => import('./settings/EmbeddingSettings'));
const DataSettings = React.lazy(() => import('./settings/DataSettings'));
const AgentSettings = React.lazy(() => import('./settings/AgentSettings'));
const ApiLedgerSettings = React.lazy(() => import('./settings/ApiLedgerSettings'));

const panelComponents: Record<Exclude<SettingsPanel, 'menu'>, React.LazyExoticComponent<React.FC>> = {
    api: ApiSettings,
    subapi: SubApiSettings,
    realtime: RealtimeSettings,
    tts: TtsSettings,
    stt: SttSettings,
    image: ImageGenerationSettings,
    embedding: EmbeddingSettings,
    data: DataSettings,
    agent: AgentSettings,
    debug: ApiLedgerSettings,
};

const panelTitles: Record<Exclude<SettingsPanel, 'menu'>, string> = {
    data: '备份与恢复',
    api: 'API 配置',
    subapi: '副 API 配置',
    realtime: '实时感知',
    tts: '语音合成',
    stt: '语音识别',
    image: '生图服务',
    embedding: '向量记忆引擎',
    agent: '自律代理',
    debug: 'API 请求账本',
};

const Settings: React.FC = () => {
    const { closeApp, sysOperation } = useOS();
    const [activePanel, setActivePanel] = useState<SettingsPanel>('menu');

    const handleBack = () => {
        if (activePanel === 'menu') closeApp();
        else setActivePanel('menu');
    };

    const ActiveComponent = activePanel !== 'menu' ? panelComponents[activePanel] : null;

    return (
        <div className="h-full w-full min-w-0 overflow-hidden bg-slate-50/50 flex flex-col font-light relative">

            {/* GLOBAL PROGRESS OVERLAY */}
            {sysOperation.status === 'processing' && (
                <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center animate-fade-in">
                    <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 w-64">
                        <div className="w-12 h-12 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
                        <div className="text-sm font-bold text-slate-700">{sysOperation.message}</div>
                        {sysOperation.progress > 0 && (
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${sysOperation.progress}%` }}></div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="h-20 bg-white/70 backdrop-blur-md flex items-end pb-3 px-4 border-b border-white/40 shrink-0 z-10 sticky top-0">
                <div className="flex items-center gap-2 w-full min-w-0">
                    <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <h1 className="min-w-0 truncate text-xl font-medium text-slate-700 tracking-wide">
                        {activePanel === 'menu' ? '系统设置' : panelTitles[activePanel]}
                    </h1>
                </div>
            </div>

            <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-4 py-5 sm:p-5 space-y-6 no-scrollbar pb-20">
                {activePanel === 'menu' ? (
                    <SettingsMenu onNavigate={setActivePanel} />
                ) : (
                    <React.Suspense fallback={
                        <div className="flex items-center justify-center py-20">
                            <div className="w-8 h-8 border-3 border-slate-200 border-t-primary rounded-full animate-spin"></div>
                        </div>
                    }>
                        {ActiveComponent && <ActiveComponent />}
                    </React.Suspense>
                )}
            </div>
        </div>
    );
};

export default Settings;
