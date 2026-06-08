
import React,{ useState } from 'react';
import { useOS } from '../../context/OSContext';
import { safeResponseJson } from '../../utils/safeApi';
import Modal from '../../components/os/Modal';
import { getGuardedInputProps } from '../../utils/inputGuards';
import {
    DEFAULT_CHAT_TEMPERATURE,
    MAX_CHAT_TEMPERATURE,
    MIN_CHAT_TEMPERATURE,
    normalizeChatTemperature,
} from '../../utils/runtimeConfig';

const getConfigTemperature = (value: unknown) => normalizeChatTemperature(value, DEFAULT_CHAT_TEMPERATURE);

const ApiSettings: React.FC = () => {
    const { apiConfig, updateApiConfig, availableModels, setAvailableModels, apiPresets, addApiPreset, removeApiPreset, addToast } = useOS();

    const [localKey, setLocalKey] = useState(apiConfig.apiKey);
    const [localUrl, setLocalUrl] = useState(apiConfig.baseUrl);
    const [localModel, setLocalModel] = useState(apiConfig.model);
    const [localTemperature, setLocalTemperature] = useState(getConfigTemperature(apiConfig.temperature));
    const [localDisablePrefill, setLocalDisablePrefill] = useState(apiConfig.disablePrefill || false);
    const [localStreamChat, setLocalStreamChat] = useState(apiConfig.streamChat || false);
    const [localDeepSeekMode, setLocalDeepSeekMode] = useState(apiConfig.useDeepSeekMode || false);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [testConnectionStatus, setTestConnectionStatus] = useState<'idle' | 'success' | 'error' | 'testing'>('idle');
    const [newPresetName, setNewPresetName] = useState('');
    const [statusMsg, setStatusMsg] = useState('');
    const [showModelModal, setShowModelModal] = useState(false);
    const [showPresetModal, setShowPresetModal] = useState(false);

    React.useEffect(() => {
        setLocalUrl(apiConfig.baseUrl);
        setLocalKey(apiConfig.apiKey);
        setLocalModel(apiConfig.model);
        setLocalTemperature(getConfigTemperature(apiConfig.temperature));
        setLocalDisablePrefill(apiConfig.disablePrefill || false);
        setLocalStreamChat(apiConfig.streamChat || false);
        setLocalDeepSeekMode(apiConfig.useDeepSeekMode || false);
    }, [apiConfig]);

    const loadPreset = (preset: typeof apiPresets[0]) => {
        setLocalUrl(preset.config.baseUrl);
        setLocalKey(preset.config.apiKey);
        setLocalModel(preset.config.model);
        setLocalTemperature(getConfigTemperature(preset.config.temperature));
        setLocalDisablePrefill(preset.config.disablePrefill || false);
        setLocalStreamChat(preset.config.streamChat || false);
        setLocalDeepSeekMode(preset.config.useDeepSeekMode || false);
        addToast(`已加载配置: ${preset.name}`, 'info');
    };

    const handleSavePreset = () => {
        if (!newPresetName.trim()) { addToast('请输入预设名称', 'error'); return; }
        addApiPreset(newPresetName, { baseUrl: localUrl, apiKey: localKey, model: localModel, temperature: localTemperature, disablePrefill: localDisablePrefill, streamChat: localStreamChat, useDeepSeekMode: localDeepSeekMode });
        setNewPresetName('');
        setShowPresetModal(false);
        addToast('预设已保存', 'success');
    };

    const handleSaveApi = () => {
        updateApiConfig({ apiKey: localKey, baseUrl: localUrl, model: localModel, temperature: localTemperature, disablePrefill: localDisablePrefill, streamChat: localStreamChat, useDeepSeekMode: localDeepSeekMode });
        setStatusMsg('配置已保存');
        setTimeout(() => setStatusMsg(''), 2000);
        setTestConnectionStatus('idle');
    };

    const handleTemperatureChange = (value: string) => {
        setLocalTemperature(normalizeChatTemperature(value, localTemperature));
    };

    const fetchModels = async () => {
        if (!localUrl) { setStatusMsg('请先填写 URL'); return; }
        setIsLoadingModels(true);
        setStatusMsg('正在连接...');
        try {
            const baseUrl = localUrl.replace(/\/+$/, '');
            const response = await fetch(`${baseUrl}/models`, { method: 'GET', headers: { 'Authorization': `Bearer ${localKey}`, 'Content-Type': 'application/json' } });
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const data = await safeResponseJson(response);
            const list = data.data || data.models || [];
            if (Array.isArray(list)) {
                const models = list.map((m: any) => m.id || m);
                setAvailableModels(models);
                if (models.length > 0 && !localModel) setLocalModel(models[0]);
                setStatusMsg(`获取到 ${models.length} 个模型`);
                setShowModelModal(true);
            } else { setStatusMsg('格式不兼容'); }
        } catch (error: any) { console.error(error); setStatusMsg('连接失败'); }
        finally { setIsLoadingModels(false); }
    };

    const handleTestConnection = async () => {
        if (!localUrl || !localKey || !localModel) { setStatusMsg('请先填写完整配置'); return; }
        setIsTestingConnection(true);
        setTestConnectionStatus('testing');
        setStatusMsg('正在测试连通性...');
        try {
            const baseUrl = localUrl.replace(/\/+$/, '');
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: localModel, messages: [{ role: 'user', content: 'hello' }], max_tokens: 1 })
            });
            if (response.ok) { setTestConnectionStatus('success'); setStatusMsg('连接成功，模型可用！'); }
            else {
                setTestConnectionStatus('error');
                const errData = await response.json().catch(() => null);
                if (response.status === 401) setStatusMsg('API Key 无效或未授权');
                else if (response.status === 404) setStatusMsg('模型不存在或 URL 错误');
                else if (response.status === 429) setStatusMsg('请求被限流 (Rate Limit)');
                else setStatusMsg(`连接异样: ${errData?.error?.message || response.statusText}`);
            }
        } catch (error: any) { console.error(error); setTestConnectionStatus('error'); setStatusMsg('网络错误，请检查 URL 是否可达'); }
        finally {
            setIsTestingConnection(false);
            if (testConnectionStatus !== 'error') { setTimeout(() => setStatusMsg(''), 3000); }
        }
    };

    return (
        <>
            <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-emerald-100/50 rounded-xl text-emerald-600">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
                        </div>
                        <h2 className="text-sm font-semibold text-slate-600 tracking-wider">API 配置</h2>
                    </div>
                    <button onClick={() => setShowPresetModal(true)} className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform">
                        保存为预设
                    </button>
                </div>

                {apiPresets.length > 0 && (
                    <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block pl-1">我的预设 (Presets)</label>
                        <div className="flex gap-2 flex-wrap">
                            {apiPresets.map(preset => (
                                <div key={preset.id} className="flex items-center bg-white border border-slate-200 rounded-lg pl-3 pr-1 py-1 shadow-sm">
                                    <span onClick={() => loadPreset(preset)} className="text-xs font-medium text-slate-600 cursor-pointer hover:text-primary mr-2">{preset.name}</span>
                                    <button onClick={() => removeApiPreset(preset.id)} className="p-1 rounded-full text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <div className="group">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">URL</label>
                        <input type="text" value={localUrl} onChange={(e) => setLocalUrl(e.target.value)} placeholder="https://..." className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" {...getGuardedInputProps({ kind: 'url', field: 'primary-api-url' })} />
                    </div>

                    <div className="group">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Key</label>
                        <input type="text" value={localKey} onChange={(e) => setLocalKey(e.target.value)} placeholder="sk-..." className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" {...getGuardedInputProps({ kind: 'secret', field: 'primary-api-key' })} />
                    </div>
                    
                    <div className="group flex items-center gap-3 bg-white/50 border border-slate-200/60 rounded-xl px-4 py-3">
                        <input type="checkbox" id="disablePrefill" checked={localDisablePrefill} onChange={(e) => setLocalDisablePrefill(e.target.checked)} className="w-4 h-4 text-primary bg-slate-100 border-slate-300 rounded focus:ring-primary" />
                        <label htmlFor="disablePrefill" className="text-xs font-semibold text-slate-600 flex-1 cursor-pointer">
                            关闭助手预填充 (Disable Prefill)
                            <span className="block text-[10px] font-normal text-slate-400 mt-0.5">如果中转站报错 400 且频繁吞字数扣费，请务必勾选此项。官方接口无需勾选。</span>
                        </label>
                    </div>

                    <div className="group flex items-center gap-3 bg-white/50 border border-slate-200/60 rounded-xl px-4 py-3">
                        <input type="checkbox" id="streamChat" checked={localStreamChat} onChange={(e) => setLocalStreamChat(e.target.checked)} className="w-4 h-4 text-primary bg-slate-100 border-slate-300 rounded focus:ring-primary" />
                        <label htmlFor="streamChat" className="text-xs font-semibold text-slate-600 flex-1 cursor-pointer">
                            流式收消息（实验）
                            <span className="block text-[10px] font-normal text-slate-400 mt-0.5">开启后会先显示实时预览，结束后再按原有气泡、表情、语音、卡片逻辑入库；不兼容时自动退回普通模式。</span>
                        </label>
                    </div>

                    <div className="group flex items-center gap-3 bg-white/50 border border-slate-200/60 rounded-xl px-4 py-3">
                        <input type="checkbox" id="deepSeekMode" checked={localDeepSeekMode} onChange={(e) => setLocalDeepSeekMode(e.target.checked)} className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500" />
                        <label htmlFor="deepSeekMode" className="text-xs font-semibold text-slate-600 flex-1 cursor-pointer">
                            🐋 DeepSeek 特化模式
                            <span className="block text-[10px] font-normal text-slate-400 mt-0.5">为 DeepSeek V4 Pro 量身定制的角色扮演预设。启用后将替换破限层、角色规则、语言风格和思维链为 DeepSeek 优化版本。</span>
                        </label>
                    </div>

                    <div className="pt-2">
                        <div className="flex justify-between items-center mb-1.5 pl-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Model</label>
                        </div>
                        <div className="flex gap-2">
                            <input type="text" value={localModel} onChange={(e) => setLocalModel(e.target.value)} placeholder="手动输入模型名称..." className="flex-1 bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all shadow-sm" />
                            <button onClick={() => setShowModelModal(true)} className="shrink-0 bg-slate-100 text-slate-600 border border-slate-200/60 rounded-xl px-4 py-2.5 text-xs font-bold active:bg-slate-200 transition-all shadow-sm flex items-center gap-1 hover:bg-slate-200/50">
                                选择 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400"><path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <button onClick={handleTestConnection} disabled={isTestingConnection}
                                className={`flex-1 py-2.5 border rounded-xl text-xs font-bold shadow-sm transition-all flex justify-center items-center gap-1.5
                                ${testConnectionStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                                    testConnectionStatus === 'error' ? 'bg-red-50 border-red-200 text-red-500' :
                                        'bg-white border-slate-200/60 text-slate-600 active:bg-slate-50'}`}
                            >
                                {isTestingConnection ? (<div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                                ) : testConnectionStatus === 'success' ? (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg>
                                ) : testConnectionStatus === 'error' ? (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg>
                                ) : (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>)}
                                {isTestingConnection ? '测试中...' : testConnectionStatus === 'success' ? '测试通过' : testConnectionStatus === 'error' ? '测试异常' : '测试连通性'}
                            </button>

                            <button onClick={fetchModels} disabled={isLoadingModels}
                                className="flex-1 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-500 shadow-sm active:bg-slate-100 transition-all flex justify-center items-center gap-1.5">
                                {isLoadingModels ? (<div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></div>
                                ) : (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>)}
                                {isLoadingModels ? '获取中...' : '获取列表'}
                            </button>
                        </div>
                    </div>

                    <div className="group bg-white/50 border border-slate-200/60 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <label htmlFor="chatTemperature" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">主聊天自由度</label>
                                <span className="text-[10px] text-slate-400">Temperature，默认 {DEFAULT_CHAT_TEMPERATURE}</span>
                            </div>
                            <input
                                type="number"
                                min={MIN_CHAT_TEMPERATURE}
                                max={MAX_CHAT_TEMPERATURE}
                                step="0.05"
                                value={localTemperature}
                                onChange={(e) => handleTemperatureChange(e.target.value)}
                                className="w-20 bg-white border border-slate-200/80 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-600 text-center focus:outline-primary"
                                aria-label="主聊天自由度数值"
                            />
                        </div>
                        <input
                            id="chatTemperature"
                            type="range"
                            min={MIN_CHAT_TEMPERATURE}
                            max={MAX_CHAT_TEMPERATURE}
                            step="0.05"
                            value={localTemperature}
                            onChange={(e) => handleTemperatureChange(e.target.value)}
                            className="w-full accent-primary"
                        />
                        <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-slate-400">
                            <span>稳一点</span>
                            <button
                                type="button"
                                onClick={() => setLocalTemperature(DEFAULT_CHAT_TEMPERATURE)}
                                className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-500 active:scale-95 transition-transform"
                            >
                                重置默认
                            </button>
                            <span>更发散</span>
                        </div>
                    </div>

                    <button onClick={handleSaveApi} className="w-full py-3 rounded-2xl font-bold text-white shadow-lg shadow-primary/20 bg-primary active:scale-95 transition-all mt-4">
                        {statusMsg || '保存配置'}
                    </button>

                </div>
            </section>

            {/* 模型选择 Modal */}
            <Modal isOpen={showModelModal} title="选择模型" onClose={() => setShowModelModal(false)}>
                <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-2 p-1">
                    {availableModels.length > 0 ? availableModels.map(m => (
                        <button key={m} onClick={() => { setLocalModel(m); setShowModelModal(false); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-mono flex justify-between items-center ${m === localModel ? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                            <span className="truncate">{m}</span>
                            {m === localModel && <div className="w-2 h-2 rounded-full bg-primary"></div>}
                        </button>
                    )) : <div className="text-center text-slate-400 py-8 text-xs">列表为空，请先点击"刷新模型列表"</div>}
                </div>
            </Modal>

            {/* Preset Name Modal */}
            <Modal isOpen={showPresetModal} title="保存预设" onClose={() => setShowPresetModal(false)} footer={<button onClick={handleSavePreset} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存</button>}>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">预设名称 (例如: DeepSeek)</label>
                    <input value={newPresetName} onChange={e => setNewPresetName(e.target.value)} className="w-full bg-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-primary" autoFocus placeholder="Name..." />
                </div>
            </Modal>
        </>
    );
};

export default ApiSettings;
