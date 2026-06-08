
import React,{ useState } from 'react';
import { useOS } from '../../context/OSContext';
import { safeResponseJson } from '../../utils/safeApi';
import Modal from '../../components/os/Modal';
import { getGuardedInputProps } from '../../utils/inputGuards';
import {
    getSecondaryApiPoolWithStatus,
    setSecondaryApiPool,
    type SecondaryApiPoolEntry,
    type SecondaryApiPoolEntryWithStatus,
} from '../../utils/runtimeConfig';
import { readJsonStorage,safeLocalStorageGet,safeLocalStorageSet,writeJsonStorage } from '../../utils/storage';

const SUB_API_PRESETS_KEY = 'sub_api_presets';
const BODY_SIGNAL_MODE_KEY = 'body_signal_mode';

function getInitialSubApiState() {
    const entry = getSecondaryApiPoolWithStatus()[0];
    const config = entry?.config;
    return {
        editingId: entry?.id || null,
        apiKey: config?.apiKey || '',
        baseUrl: config?.baseUrl || '',
        model: config?.model || '',
    };
}

function buildPoolEntry(
    current: SecondaryApiPoolEntryWithStatus | undefined,
    config: { baseUrl: string; apiKey: string; model: string },
    index: number,
): SecondaryApiPoolEntry {
    return {
        id: current?.id || `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: current?.name || `副 API ${index + 1}`,
        enabled: current?.enabled ?? true,
        config,
    };
}

function getPoolStatus(entry: SecondaryApiPoolEntryWithStatus): { label: string; tone: 'ready' | 'cooldown' | 'off' } {
    if (!entry.enabled) return { label: '已停用', tone: 'off' };
    const cooldownUntil = entry.cooldownUntil || 0;
    if (cooldownUntil > Date.now()) {
        const minutes = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 60000));
        return { label: `冷却 ${minutes} 分钟`, tone: 'cooldown' };
    }
    return { label: '可用', tone: 'ready' };
}

const SubApiSettings: React.FC = () => {
    const { addToast } = useOS();

    const [subPool, setSubPool] = useState<SecondaryApiPoolEntryWithStatus[]>(() => getSecondaryApiPoolWithStatus());
    const [editingPoolId, setEditingPoolId] = useState<string | null>(() => getInitialSubApiState().editingId);
    const [subKey, setSubKey] = useState(() => getInitialSubApiState().apiKey);
    const [subUrl, setSubUrl] = useState(() => getInitialSubApiState().baseUrl);
    const [subModel, setSubModel] = useState(() => getInitialSubApiState().model);
    const [subModels, setSubModels] = useState<string[]>([]);
    const [isLoadingSubModels, setIsLoadingSubModels] = useState(false);
    const [isTestingSub, setIsTestingSub] = useState(false);
    const [subTestStatus, setSubTestStatus] = useState<'idle' | 'success' | 'error' | 'testing'>('idle');
    const [subStatusMsg, setSubStatusMsg] = useState('');
    const [showSubModelModal, setShowSubModelModal] = useState(false);
    const [subPresets, setSubPresets] = useState<Array<{ id: string; name: string; config: { baseUrl: string; apiKey: string; model: string } }>>(() => {
        const presets = readJsonStorage<Array<{ id: string; name: string; config: { baseUrl: string; apiKey: string; model: string } }>>(SUB_API_PRESETS_KEY);
        return Array.isArray(presets) ? presets : [];
    });
    const [signalMode, setSignalMode] = useState(() => safeLocalStorageGet(BODY_SIGNAL_MODE_KEY) || 'raw');

    const persistSubPool = (entries: SecondaryApiPoolEntry[]) => {
        setSecondaryApiPool(entries);
        setSubPool(getSecondaryApiPoolWithStatus());
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('agent-config-changed'));
        }
    };

    const handleSaveSubApi = () => {
        const trimmedKey = subKey.trim();
        const trimmedUrl = subUrl.trim().replace(/\/+$/, '');
        const trimmedModel = subModel.trim();

        if (!trimmedKey && !trimmedUrl && !trimmedModel) {
            persistSubPool([]);
            setEditingPoolId(null);
            setSubKey('');
            setSubUrl('');
            setSubModel('');
        } else {
            const config = {
                apiKey: trimmedKey,
                baseUrl: trimmedUrl,
                model: trimmedModel,
            };
            const currentIndex = subPool.findIndex(entry => entry.id === editingPoolId);
            const current = currentIndex >= 0 ? subPool[currentIndex] : undefined;
            const nextEntry = buildPoolEntry(current, config, currentIndex >= 0 ? currentIndex : subPool.length);
            const nextPool = currentIndex >= 0
                ? subPool.map(entry => entry.id === editingPoolId ? nextEntry : entry)
                : [...subPool, nextEntry];

            persistSubPool(nextPool);
            setEditingPoolId(nextEntry.id);
            setSubKey(trimmedKey);
            setSubUrl(trimmedUrl);
            setSubModel(trimmedModel);
        }

        setSubStatusMsg('配置已保存');
        setTimeout(() => setSubStatusMsg(''), 2000);
        setSubTestStatus('idle');
    };

    const handleNewPoolEntry = () => {
        setEditingPoolId(null);
        setSubKey('');
        setSubUrl('');
        setSubModel('');
        setSubStatusMsg('正在新增');
        setSubTestStatus('idle');
        setTimeout(() => setSubStatusMsg(''), 1200);
    };

    const handleEditPoolEntry = (entry: SecondaryApiPoolEntryWithStatus) => {
        setEditingPoolId(entry.id);
        setSubUrl(entry.config.baseUrl);
        setSubKey(entry.config.apiKey);
        setSubModel(entry.config.model);
        setSubTestStatus('idle');
        setSubStatusMsg(`正在编辑 ${entry.name}`);
        setTimeout(() => setSubStatusMsg(''), 1500);
    };

    const handleTogglePoolEntry = (entryId: string) => {
        persistSubPool(subPool.map(entry => (
            entry.id === entryId ? { ...entry, enabled: !entry.enabled } : entry
        )));
    };

    const handleRemovePoolEntry = (entryId: string) => {
        const nextPool = subPool.filter(entry => entry.id !== entryId);
        persistSubPool(nextPool);
        if (editingPoolId === entryId) {
            const nextEditing = nextPool[0];
            setEditingPoolId(nextEditing?.id || null);
            setSubUrl(nextEditing?.config.baseUrl || '');
            setSubKey(nextEditing?.config.apiKey || '');
            setSubModel(nextEditing?.config.model || '');
        }
    };

    const fetchSubModels = async () => {
        if (!subUrl) { setSubStatusMsg('请先填写 URL'); return; }
        setIsLoadingSubModels(true);
        setSubStatusMsg('正在连接...');
        try {
            const baseUrl = subUrl.replace(/\/+$/, '');
            const response = await fetch(`${baseUrl}/models`, { method: 'GET', headers: { 'Authorization': `Bearer ${subKey}`, 'Content-Type': 'application/json' } });
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const data = await safeResponseJson(response);
            const list = data.data || data.models || [];
            if (Array.isArray(list)) {
                const models = list.map((m: any) => m.id || m);
                setSubModels(models);
                if (models.length > 0 && !subModel) setSubModel(models[0]);
                setSubStatusMsg(`获取到 ${models.length} 个模型`);
                setShowSubModelModal(true);
            } else { setSubStatusMsg('格式不兼容'); }
        } catch (error: any) { console.error(error); setSubStatusMsg('连接失败'); }
        finally { setIsLoadingSubModels(false); }
    };

    const handleTestSub = async () => {
        if (!subUrl || !subKey || !subModel) { setSubStatusMsg('请先填写完整配置'); return; }
        setIsTestingSub(true);
        setSubTestStatus('testing');
        setSubStatusMsg('正在测试连通性...');
        try {
            const baseUrl = subUrl.replace(/\/+$/, '');
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${subKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: subModel, messages: [{ role: 'user', content: 'hello' }], max_tokens: 1 })
            });
            if (response.ok) { setSubTestStatus('success'); setSubStatusMsg('连接成功，模型可用！'); }
            else {
                setSubTestStatus('error');
                const errData = await response.json().catch(() => null);
                if (response.status === 401) setSubStatusMsg('API Key 无效或未授权');
                else if (response.status === 404) setSubStatusMsg('模型不存在或 URL 错误');
                else setSubStatusMsg(`连接异样: ${errData?.error?.message || response.statusText}`);
            }
        } catch (error: any) { setSubTestStatus('error'); setSubStatusMsg('网络错误，请检查 URL 是否可达'); }
        finally { setIsTestingSub(false); setTimeout(() => setSubStatusMsg(''), 3000); }
    };

    const handleSaveSubPreset = (name: string) => {
        const preset = {
            id: `sub-${Date.now()}`,
            name,
            config: {
                baseUrl: subUrl.trim(),
                apiKey: subKey.trim(),
                model: subModel.trim(),
            },
        };
        const updated = [...subPresets, preset];
        setSubPresets(updated);
        writeJsonStorage(SUB_API_PRESETS_KEY, updated);
        addToast('副 API 预设已保存', 'success');
    };

    const removeSubPreset = (id: string) => {
        const updated = subPresets.filter(p => p.id !== id);
        setSubPresets(updated);
        writeJsonStorage(SUB_API_PRESETS_KEY, updated);
    };

    const loadSubPreset = (preset: typeof subPresets[0]) => {
        setSubUrl(preset.config.baseUrl);
        setSubKey(preset.config.apiKey);
        setSubModel(preset.config.model);
        addToast(`已加载: ${preset.name}`, 'info');
    };

    return (
        <>
            <section className="relative overflow-hidden bg-[#f8f5ee]/70 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-[#e8e0cc]/60">
                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-[#e8dcc8]/30 to-[#d4c8a8]/20 blur-2xl pointer-events-none" />

                <div className="relative flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-gradient-to-br from-amber-100/60 to-yellow-100/60 rounded-xl text-amber-600">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.646.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a6.759 6.759 0 0 1 0 .255c-.008.378.137.75.43.99l1.004.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-[#8b7e64] tracking-wider">副 API 配置</h2>
                            <p className="text-[10px] text-[#b0a48a]">辅助功能专用 · 心声 / 记忆摘要 / 事件提取</p>
                        </div>
                    </div>
                </div>

                <div className="relative space-y-4">
                    {subPresets.length > 0 && (
                        <div>
                            <label className="text-[10px] font-bold text-[#b0a48a] uppercase tracking-widest mb-2 block pl-1">我的预设</label>
                            <div className="flex gap-2 flex-wrap">
                                {subPresets.map(preset => (
                                    <div key={preset.id} className="flex items-center bg-white/60 border border-[#e8e0cc]/60 rounded-lg pl-3 pr-1 py-1 shadow-sm">
                                        <span onClick={() => loadSubPreset(preset)} className="text-xs font-medium text-[#8b7e64] cursor-pointer hover:text-amber-600 mr-2">{preset.name}</span>
                                        <button onClick={() => removeSubPreset(preset.id)} className="p-1 rounded-full text-[#b0a48a] hover:bg-red-50 hover:text-red-400 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <div className="flex items-center justify-between mb-2 pl-1">
                            <label className="text-[10px] font-bold text-[#b0a48a] uppercase tracking-widest">副 API 池</label>
                            <button onClick={handleNewPoolEntry} className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200/60 rounded-full px-2.5 py-1 active:scale-95 transition-all">
                                新增
                            </button>
                        </div>

                        {subPool.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-[#e8e0cc]/80 bg-white/35 px-4 py-3 text-xs text-[#b0a48a]">
                                还没有副 API。保存下方配置后会加入池，后台任务只会从这里分流。
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {subPool.map((entry, index) => {
                                    const status = getPoolStatus(entry);
                                    const isEditing = editingPoolId === entry.id;
                                    return (
                                        <div key={entry.id} className={`rounded-2xl border px-3 py-2.5 transition-all ${isEditing ? 'bg-amber-50/70 border-amber-200/80' : 'bg-white/45 border-[#e8e0cc]/60'}`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <button onClick={() => handleEditPoolEntry(entry)} className="min-w-0 flex-1 text-left">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-[#8b7e64]">{entry.name || `副 API ${index + 1}`}</span>
                                                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${status.tone === 'ready'
                                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                            : status.tone === 'cooldown'
                                                            ? 'bg-orange-50 text-orange-600 border border-orange-100'
                                                            : 'bg-slate-50 text-slate-400 border border-slate-100'
                                                        }`}>{status.label}</span>
                                                    </div>
                                                    <div className="mt-1 truncate font-mono text-[10px] text-[#b0a48a]">{entry.config.model}</div>
                                                    <div className="truncate font-mono text-[9px] text-[#c2b79e]">{entry.config.baseUrl}</div>
                                                    {entry.lastError && (
                                                        <div className="mt-1 truncate text-[9px] text-orange-500">{entry.lastError}</div>
                                                    )}
                                                </button>
                                                <div className="flex shrink-0 items-center gap-1">
                                                    <button onClick={() => handleTogglePoolEntry(entry.id)} className={`rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all ${entry.enabled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                        {entry.enabled ? '启用' : '停用'}
                                                    </button>
                                                    <button onClick={() => handleRemovePoolEntry(entry.id)} className="rounded-full p-1.5 text-[#b0a48a] hover:bg-red-50 hover:text-red-400 transition-colors" aria-label="删除副 API">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-[#b0a48a] uppercase tracking-widest mb-1.5 block pl-1">URL</label>
                        <input type="text" value={subUrl} onChange={e => setSubUrl(e.target.value)} placeholder="https://..." className="w-full bg-white/50 border border-[#e8e0cc]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" {...getGuardedInputProps({ kind: 'url', field: 'secondary-api-url' })} />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-[#b0a48a] uppercase tracking-widest mb-1.5 block pl-1">Key</label>
                        <input type="text" value={subKey} onChange={e => setSubKey(e.target.value)} placeholder="sk-..." className="w-full bg-white/50 border border-[#e8e0cc]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" {...getGuardedInputProps({ kind: 'secret', field: 'secondary-api-key' })} />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-[#b0a48a] uppercase tracking-widest mb-1.5 block pl-1">Model</label>
                        <div className="flex gap-2">
                            <input type="text" value={subModel} onChange={e => setSubModel(e.target.value)} placeholder="模型名称..." className="flex-1 bg-white/50 border border-[#e8e0cc]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all shadow-sm" />
                            <button onClick={() => setShowSubModelModal(true)} className="shrink-0 bg-[#f0eadc] text-[#8b7e64] border border-[#e8e0cc]/60 rounded-xl px-4 py-2.5 text-xs font-bold active:bg-[#e8e0cc] transition-all shadow-sm flex items-center gap-1">
                                选择 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#b0a48a]"><path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                            </button>
                        </div>

                        <div className="flex gap-2 mt-3">
                            <button onClick={handleTestSub} disabled={isTestingSub}
                                className={`flex-1 py-2.5 border rounded-xl text-xs font-bold shadow-sm transition-all flex justify-center items-center gap-1.5
                                ${subTestStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                                    subTestStatus === 'error' ? 'bg-red-50 border-red-200 text-red-500' :
                                        'bg-white/50 border-[#e8e0cc]/60 text-[#8b7e64] active:bg-[#f0eadc]'}`}
                            >
                                {isTestingSub ? <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-600 rounded-full animate-spin" /> :
                                    subTestStatus === 'success' ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg> :
                                        subTestStatus === 'error' ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /></svg> :
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>}
                                {isTestingSub ? '测试中...' : subTestStatus === 'success' ? '测试通过' : subTestStatus === 'error' ? '测试异常' : '测试连通性'}
                            </button>

                            <button onClick={fetchSubModels} disabled={isLoadingSubModels}
                                className="flex-1 py-2.5 bg-[#f0eadc] border border-[#e8e0cc]/60 rounded-xl text-xs font-bold text-[#8b7e64] shadow-sm active:bg-[#e8e0cc] transition-all flex justify-center items-center gap-1.5">
                                {isLoadingSubModels ? <div className="w-3.5 h-3.5 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" /> :
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>}
                                {isLoadingSubModels ? '获取中...' : '获取列表'}
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={handleSaveSubApi} className="flex-1 py-3 rounded-2xl font-bold text-white shadow-lg shadow-amber-500/20 bg-gradient-to-r from-amber-500 to-yellow-500 active:scale-95 transition-all">
                            {subStatusMsg || (editingPoolId ? '保存到池' : '新增到池')}
                        </button>
                        <button onClick={() => {
                            const name = prompt('预设名称：');
                            if (name?.trim()) handleSaveSubPreset(name.trim());
                        }} className="px-4 py-3 rounded-2xl font-bold text-amber-600 bg-amber-50 border border-amber-200/60 active:scale-95 transition-all text-xs">
                            存预设
                        </button>
                    </div>
                </div>

                <p className="relative text-[10px] text-[#b0a48a] mt-4 leading-relaxed px-1">
                    💡 此接口用于心声、情绪状态栏等辅助功能。建议使用 <b>Flash 系列</b>模型（如 Gemini Flash、GPT-4o-mini）以降低成本、提高效率。后台任务会在启用项之间轮询分流，429 或超时会临时冷却 1 分钟。
                </p>
            </section>

            {/* ─── 内部状态层注入模式 A/B 测试 ─── */}
            <section className="relative overflow-hidden bg-[#f8f5ee]/70 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-[#e8e0cc]/60">
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 bg-gradient-to-br from-purple-100/60 to-indigo-100/60 rounded-xl text-purple-600">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-[#8b7e64] tracking-wider">仿生感知引擎</h2>
                        <p className="text-[10px] text-[#b0a48a]">内部状态层 · 主模型注入格式</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => { safeLocalStorageSet(BODY_SIGNAL_MODE_KEY, 'raw'); setSignalMode('raw'); }}
                        className={`flex-1 py-3 px-3 rounded-2xl text-xs font-bold border transition-all ${signalMode === 'raw'
                            ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-300 shadow-lg shadow-purple-500/20'
                            : 'bg-white/50 text-[#8b7e64] border-[#e8e0cc]/60 active:bg-[#f0eadc]'}`}
                    >
                        <div className="text-center">
                            <div className="text-sm mb-1">🧬</div>
                            <div>原始信号</div>
                            <div className={`text-[9px] mt-0.5 ${signalMode === 'raw' ? 'text-purple-100' : 'text-[#b0a48a]'}`}>推荐</div>
                        </div>
                    </button>
                    <button
                        onClick={() => { safeLocalStorageSet(BODY_SIGNAL_MODE_KEY, 'wordLibrary'); setSignalMode('wordLibrary'); }}
                        className={`flex-1 py-3 px-3 rounded-2xl text-xs font-bold border transition-all ${signalMode === 'wordLibrary'
                            ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-300 shadow-lg shadow-purple-500/20'
                            : 'bg-white/50 text-[#8b7e64] border-[#e8e0cc]/60 active:bg-[#f0eadc]'}`}
                    >
                        <div className="text-center">
                            <div className="text-sm mb-1">📝</div>
                            <div>词库模式</div>
                            <div className={`text-[9px] mt-0.5 ${signalMode === 'wordLibrary' ? 'text-purple-100' : 'text-[#b0a48a]'}`}>躯体化描述</div>
                        </div>
                    </button>
                    <button
                        onClick={() => { safeLocalStorageSet(BODY_SIGNAL_MODE_KEY, 'quantified'); setSignalMode('quantified'); }}
                        className={`flex-1 py-3 px-3 rounded-2xl text-xs font-bold border transition-all ${signalMode === 'quantified'
                            ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-purple-300 shadow-lg shadow-purple-500/20'
                            : 'bg-white/50 text-[#8b7e64] border-[#e8e0cc]/60 active:bg-[#f0eadc]'}`}
                    >
                        <div className="text-center">
                            <div className="text-sm mb-1">📊</div>
                            <div>量化模式</div>
                            <div className={`text-[9px] mt-0.5 ${signalMode === 'quantified' ? 'text-purple-100' : 'text-[#b0a48a]'}`}>进度条数据</div>
                        </div>
                    </button>
                </div>

                <div className="mt-3 p-3 bg-white/40 rounded-xl border border-[#e8e0cc]/40">
                    <p className="text-[10px] text-[#8b7e64] font-mono leading-relaxed whitespace-pre-wrap">{signalMode === 'raw'
                        ? '[内分泌·当前浓度]\nDA=0.72↑ 5HT=0.48↓ OXT=0.68↑ E=0.62\n\n{角色名}，虽然你不知道，但是体检单上显示了你此时的激素水平——它们潜移默化地改变着你的行为。'
                        : signalMode === 'wordLibrary'
                        ? '你留意到自己的身体——\n胸口有些发紧，像是有什么东西压着\n脑子有些发沉，眼皮在打架\n\n这些只是你身体的感觉…'
                        : '[身体感知·本轮]\n紧绷感 ████████░░\n安定感 ███░░░░░░░\n精力　 ██░░░░░░░░\n\n这些是你身体的节律…'
                    }</p>
                </div>
            </section>

            {/* Sub API Model Selector Modal */}
            <Modal isOpen={showSubModelModal} title="选择副 API 模型" onClose={() => setShowSubModelModal(false)}>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                    {subModels.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">请先点击"获取列表"拉取模型</p>
                    ) : subModels.map(model => (
                        <button key={model} onClick={() => { setSubModel(model); setShowSubModelModal(false); }}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-mono transition-all ${model === subModel ? 'bg-amber-50 text-amber-700 font-bold ring-1 ring-amber-200' : 'hover:bg-slate-50 text-slate-600'}`}
                        >{model}</button>
                    ))}
                </div>
            </Modal>
        </>
    );
};

export default SubApiSettings;
