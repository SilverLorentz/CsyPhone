
import React,{ useState } from 'react';
import { getGuardedInputProps } from '../../../utils/inputGuards';
import type { TtsFormState } from './useTtsForm';

interface Props {
    preprocessEnabled: boolean;
    preprocessPrompt: string;
    preprocessApiBase: string;
    preprocessApiKey: string;
    preprocessModel: string;
    set: <K extends keyof TtsFormState>(field: K, value: TtsFormState[K]) => void;
    onResetPrompt: () => void;
}

const TtsPreprocessSection: React.FC<Props> = ({
    preprocessEnabled, preprocessPrompt, preprocessApiBase, preprocessApiKey, preprocessModel,
    set, onResetPrompt,
}) => {
    // Local-only state — no need to lift these
    const [ppModels, setPpModels] = useState<string[]>([]);
    const [ppLoading, setPpLoading] = useState(false);
    const [ppStatus, setPpStatus] = useState('');

    const fetchModels = async () => {
        if (!preprocessApiBase) { setPpStatus('❌ 请先填写 URL'); return; }
        setPpLoading(true); setPpStatus('⏳ 拉取中...');
        try {
            const base = preprocessApiBase.replace(/\/+$/, '');
            const res = await fetch(`${base}/models`, { headers: { 'Authorization': `Bearer ${preprocessApiKey}`, 'Content-Type': 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const list = (data.data || data.models || []).map((m: any) => m.id || m).filter(Boolean);
            setPpModels(list);
            if (list.length > 0 && !preprocessModel) set('preprocessModel', list[0]);
            setPpStatus(`✅ 获取到 ${list.length} 个模型`);
        } catch (e: any) { setPpStatus(`❌ ${e.message}`); }
        finally { setPpLoading(false); }
    };

    const testConnection = async () => {
        if (!preprocessApiBase || !preprocessApiKey || !preprocessModel) { setPpStatus('❌ 请先填写完整配置'); return; }
        setPpStatus('⏳ 测试连接中...');
        try {
            const base = preprocessApiBase.replace(/\/+$/, '');
            const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Authorization': `Bearer ${preprocessApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: preprocessModel, messages: [{ role: 'user', content: 'hello' }], max_tokens: 1 }) });
            if (res.ok) setPpStatus('✅ 连接成功！模型可用');
            else if (res.status === 401) setPpStatus('❌ API Key 无效');
            else if (res.status === 404) setPpStatus('❌ 模型不存在或 URL 错误');
            else setPpStatus(`❌ HTTP ${res.status}`);
        } catch (e: any) { setPpStatus(`❌ 网络错误: ${e.message}`); }
    };

    return (
        <div className="bg-[#f0eaf7]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#e5ddf0]/40">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-sm font-bold text-[#a18db8]">AI 语气预处理</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={preprocessEnabled} onChange={e => set('preprocessEnabled', e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#c4b0d9]"></div>
                </label>
            </div>
            <p className="text-[10px] text-[#a18db8]/70">开启后，发送到 TTS 之前先用独立 AI 为文本添加语气词标签 (laughs)(sighs) 等，让朗读更自然。</p>
            {preprocessEnabled && (
                <div className="space-y-2">
                    <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">API Base URL</label>
                        <input type="text" value={preprocessApiBase} onChange={e => set('preprocessApiBase', e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="https://api.openai.com/v1 或其他兼容接口" {...getGuardedInputProps({ kind: 'url', field: 'tts-preprocess-base-url' })} /></div>
                    <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">API Key</label>
                        <input type="text" value={preprocessApiKey} onChange={e => set('preprocessApiKey', e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="sk-..." {...getGuardedInputProps({ kind: 'secret', field: 'tts-preprocess-api-key' })} /></div>
                    <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">模型 <span className="text-[#a18db8] font-normal normal-case">推荐 flash/turbo</span></label>
                        <div className="flex gap-2">
                            <input type="text" value={preprocessModel} onChange={e => set('preprocessModel', e.target.value)} className="flex-1 bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="gemini-2.0-flash / gpt-4o-mini ..." />
                            <button onClick={fetchModels} disabled={ppLoading} className="text-[10px] bg-[#e8cfe8]/50 text-[#a18db8] px-3 py-2 rounded-xl font-bold whitespace-nowrap active:scale-95 transition-transform disabled:opacity-50">{ppLoading ? '拉取中...' : '拉取模型'}</button>
                        </div>
                        {ppModels.length > 0 && (
                            <div className="mt-1.5 max-h-24 overflow-y-auto bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl">
                                {ppModels.map(m => (<button key={m} onClick={() => set('preprocessModel', m)} className={`block w-full text-left px-3 py-1.5 text-[10px] font-mono truncate transition-colors ${preprocessModel === m ? 'bg-[#e8cfe8]/50 text-[#9b7e8f] font-bold' : 'text-[#8b7e74] hover:bg-[#f0eaf7]/50'}`}>{m}</button>))}
                            </div>
                        )}
                    </div>
                    <button onClick={testConnection} className="w-full py-2 bg-[#e8cfe8]/40 text-[#a18db8] text-xs font-bold rounded-xl active:scale-95 transition-transform">测试连接</button>
                    {ppStatus && <p className={`text-[10px] text-center font-medium ${ppStatus.startsWith('✅') ? 'text-[#7faa95]' : ppStatus.startsWith('⏳') ? 'text-[#b8aaa0]' : 'text-red-400'}`}>{ppStatus}</p>}
                    <div className="border-t border-[#e5ddf0]/50 pt-2">
                        <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">预处理提示词</label>
                        <textarea value={preprocessPrompt} onChange={e => set('preprocessPrompt', e.target.value)} rows={4} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] resize-none focus:bg-white/80 transition-all" />
                        <button onClick={onResetPrompt} className="text-[10px] text-[#a18db8] underline">重置为默认提示词</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(TtsPreprocessSection);
