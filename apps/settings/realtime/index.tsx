
import React,{ useState } from 'react';
import { useOS } from '../../../context/OSContext';
import Modal from '../../../components/os/Modal';
import { WeatherSection,NewsSection,HotSearchSection,AiHotSection,NotionSection,FeishuSection,CanvaMcpSection,XhsMcpSection } from './sections';

const RealtimeSettings: React.FC = () => {
    const { realtimeConfig, updateRealtimeConfig, addToast } = useOS();

    const [rt, setRt] = useState(() => ({
        weatherEnabled: realtimeConfig.weatherEnabled,
        weatherApiKey: realtimeConfig.weatherApiKey,
        weatherCity: realtimeConfig.weatherCity,
        newsEnabled: realtimeConfig.newsEnabled,
        newsApiKey: realtimeConfig.newsApiKey || '',
        newsPlatforms: realtimeConfig.newsPlatforms || ['weibo', 'zhihu', 'baidu', 'bilibili', 'douyin'],
        hotSearchEnabled: realtimeConfig.hotSearchEnabled ?? false,
        aihotEnabled: realtimeConfig.aihotEnabled ?? false,
        notionEnabled: realtimeConfig.notionEnabled,
        notionApiKey: realtimeConfig.notionApiKey,
        notionDbId: realtimeConfig.notionDatabaseId,
        notionNotesDbId: realtimeConfig.notionNotesDatabaseId || '',
        feishuEnabled: realtimeConfig.feishuEnabled,
        feishuAppId: realtimeConfig.feishuAppId,
        feishuAppSecret: realtimeConfig.feishuAppSecret,
        feishuBaseId: realtimeConfig.feishuBaseId,
        feishuTableId: realtimeConfig.feishuTableId,
        xhsEnabled: realtimeConfig.xhsEnabled,
        xhsMcpEnabled: realtimeConfig.xhsMcpConfig?.enabled ?? false,
        xhsMcpUrl: realtimeConfig.xhsMcpConfig?.serverUrl || '',
        xhsNickname: realtimeConfig.xhsMcpConfig?.loggedInNickname || '',
        xhsUserId: realtimeConfig.xhsMcpConfig?.loggedInUserId || '',
        canvaEnabled: realtimeConfig.canvaEnabled ?? false,
        canvaMcpEnabled: realtimeConfig.canvaMcpConfig?.enabled ?? false,
        canvaMcpUrl: realtimeConfig.canvaMcpConfig?.serverUrl || 'http://localhost:18062/api',
        canvaWorkspaceLabel: realtimeConfig.canvaMcpConfig?.workspaceLabel || '',
    }));

    const [testStatus, setTestStatus] = useState('');
    const [showModal, setShowModal] = useState(false);

    const set = (field: string, value: any) => setRt(prev => ({ ...prev, [field]: value }));

    const handleSave = () => {
        updateRealtimeConfig({
            weatherEnabled: rt.weatherEnabled, weatherApiKey: rt.weatherApiKey, weatherCity: rt.weatherCity,
            newsEnabled: rt.newsEnabled, newsApiKey: rt.newsApiKey, newsPlatforms: rt.newsPlatforms, hotSearchEnabled: rt.hotSearchEnabled,
            aihotEnabled: rt.aihotEnabled,
            notionEnabled: rt.notionEnabled, notionApiKey: rt.notionApiKey, notionDatabaseId: rt.notionDbId,
            notionNotesDatabaseId: rt.notionNotesDbId || undefined,
            feishuEnabled: rt.feishuEnabled, feishuAppId: rt.feishuAppId, feishuAppSecret: rt.feishuAppSecret,
            feishuBaseId: rt.feishuBaseId, feishuTableId: rt.feishuTableId,
            xhsEnabled: rt.xhsEnabled,
            xhsMcpConfig: { enabled: rt.xhsMcpEnabled, serverUrl: rt.xhsMcpUrl, loggedInNickname: rt.xhsNickname || undefined, loggedInUserId: rt.xhsUserId || undefined },
            canvaEnabled: rt.canvaEnabled,
            canvaMcpConfig: { enabled: rt.canvaMcpEnabled, serverUrl: rt.canvaMcpUrl, workspaceLabel: rt.canvaWorkspaceLabel || undefined },
        });
        addToast('实时感知配置已保存', 'success');
        setShowModal(false);
    };

    return (
        <>
            {/* 概览卡片 */}
            {/* 概览卡片 - 高级质感重设 */}
            <section className="bg-white/70 backdrop-blur-md rounded-3xl p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-white/80 transition-all">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl text-white shadow-md shadow-violet-200">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-800 tracking-wide">实时感知引擎</h2>
                            <p className="text-[10px] text-slate-400 font-medium">Real-world Awareness</p>
                        </div>
                    </div>
                    <button onClick={() => setShowModal(true)} className="text-xs bg-slate-900 text-white px-4 py-2 rounded-xl font-semibold shadow-md active:scale-95 transition-transform hover:bg-slate-800">
                        配置节点
                    </button>
                </div>                <div className="grid grid-cols-3 gap-3">
                    <div className={`p-3 rounded-2xl transition-all border ${rt.weatherEnabled ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100 shadow-sm' : 'bg-slate-50/50 border-transparent text-slate-400 opacity-60'}`}>
                        <div className="text-2xl mb-1.5">{rt.weatherEnabled ? '🌦️' : '🌫️'}</div>
                        <div className={`text-xs font-bold ${rt.weatherEnabled ? 'text-emerald-700' : ''}`}>气象预报</div>
                    </div>
                    
                    <div className={`p-3 rounded-2xl transition-all border ${rt.newsEnabled ? 'bg-gradient-to-br from-blue-50 to-sky-50 border-blue-100 shadow-sm' : 'bg-slate-50/50 border-transparent text-slate-400 opacity-60'}`}>
                        <div className="text-2xl mb-1.5">{rt.newsEnabled ? '📰' : '📄'}</div>
                        <div className={`text-xs font-bold ${rt.newsEnabled ? 'text-blue-700' : ''}`}>外部热点</div>
                    </div>
                    
                    <div className={`p-3 rounded-2xl transition-all border ${rt.hotSearchEnabled ? 'bg-gradient-to-br from-rose-50 to-red-50 border-rose-100 shadow-sm' : 'bg-slate-50/50 border-transparent text-slate-400 opacity-60'}`}>
                        <div className="text-2xl mb-1.5">{rt.hotSearchEnabled ? '🔥' : '🧊'}</div>
                        <div className={`text-xs font-bold ${rt.hotSearchEnabled ? 'text-rose-700' : ''}`}>微博精筛</div>
                    </div>
                    
                    <div className={`p-3 rounded-2xl transition-all border ${rt.notionEnabled ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-100 shadow-sm' : 'bg-slate-50/50 border-transparent text-slate-400 opacity-60'}`}>
                        <div className="text-2xl mb-1.5">{rt.notionEnabled ? '📝' : '📋'}</div>
                        <div className={`text-xs font-bold ${rt.notionEnabled ? 'text-orange-700' : ''}`}>Notion</div>
                    </div>
                    
                    <div className={`p-3 rounded-2xl transition-all border ${rt.feishuEnabled ? 'bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-100 shadow-sm' : 'bg-slate-50/50 border-transparent text-slate-400 opacity-60'}`}>
                        <div className="text-2xl mb-1.5">{rt.feishuEnabled ? '📒' : '📋'}</div>
                        <div className={`text-xs font-bold ${rt.feishuEnabled ? 'text-indigo-700' : ''}`}>飞书文档</div>
                    </div>
                    
                    <div className={`p-3 rounded-2xl transition-all border ${rt.xhsEnabled ? 'bg-gradient-to-br from-red-50 to-pink-50 border-red-100 shadow-sm' : 'bg-slate-50/50 border-transparent text-slate-400 opacity-60'}`}>
                        <div className="text-2xl mb-1.5">{rt.xhsEnabled ? '📕' : '📋'}</div>
                        <div className={`text-xs font-bold ${rt.xhsEnabled ? 'text-red-700' : ''}`}>小红书</div>
                    </div>

                    <div className={`p-3 rounded-2xl transition-all border ${rt.canvaEnabled ? 'bg-gradient-to-br from-cyan-50 to-fuchsia-50 border-cyan-100 shadow-sm' : 'bg-slate-50/50 border-transparent text-slate-400 opacity-60'}`}>
                        <div className="text-2xl mb-1.5">{rt.canvaEnabled ? '🎨' : '🖼️'}</div>
                        <div className={`text-xs font-bold ${rt.canvaEnabled ? 'text-cyan-700' : ''}`}>Canva</div>
                    </div>

                    <div className={`p-3 rounded-2xl transition-all border ${rt.aihotEnabled ? 'bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100 shadow-sm' : 'bg-slate-50/50 border-transparent text-slate-400 opacity-60'}`}>
                        <div className="text-2xl mb-1.5">{rt.aihotEnabled ? '💡' : '📋'}</div>
                        <div className={`text-xs font-bold ${rt.aihotEnabled ? 'text-violet-700' : ''}`}>AI 动态</div>
                    </div>
                </div>
            </section>

            {/* 配置 Modal */}
            <Modal isOpen={showModal} title="实时感知配置" onClose={() => setShowModal(false)}
                footer={<button onClick={handleSave} className="w-full py-3 bg-violet-500 text-white font-bold rounded-2xl shadow-lg">保存配置</button>}>
                <div className="space-y-5 max-h-[60vh] overflow-y-auto no-scrollbar">
                    <WeatherSection enabled={rt.weatherEnabled} apiKey={rt.weatherApiKey} city={rt.weatherCity} set={set} onTestStatus={setTestStatus} />
                    <NewsSection enabled={rt.newsEnabled} apiKey={rt.newsApiKey} platforms={rt.newsPlatforms} set={set} />
                    <HotSearchSection enabled={rt.hotSearchEnabled} set={set} />
                    <AiHotSection enabled={rt.aihotEnabled} set={set} />
                    <NotionSection enabled={rt.notionEnabled} apiKey={rt.notionApiKey} dbId={rt.notionDbId} notesDbId={rt.notionNotesDbId} set={set} onTestStatus={setTestStatus} />
                    <FeishuSection enabled={rt.feishuEnabled} appId={rt.feishuAppId} appSecret={rt.feishuAppSecret} baseId={rt.feishuBaseId} tableId={rt.feishuTableId} set={set} onTestStatus={setTestStatus} />
                    <CanvaMcpSection enabled={rt.canvaMcpEnabled} mcpUrl={rt.canvaMcpUrl} workspaceLabel={rt.canvaWorkspaceLabel} set={set} onTestStatus={setTestStatus}
                        onUpdateConfig={(cfg) => updateRealtimeConfig({ canvaMcpConfig: cfg })} />
                    <XhsMcpSection enabled={rt.xhsMcpEnabled} mcpUrl={rt.xhsMcpUrl} nickname={rt.xhsNickname} userId={rt.xhsUserId} set={set} onTestStatus={setTestStatus}
                        onUpdateConfig={(cfg) => updateRealtimeConfig({ xhsMcpConfig: cfg })} />
                    {testStatus && (
                        <div className={`p-3 rounded-xl text-xs font-medium text-center ${testStatus.includes('成功') ? 'bg-emerald-100 text-emerald-700' : testStatus.includes('失败') || testStatus.includes('错误') ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                            {testStatus}
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
};

export default RealtimeSettings;
