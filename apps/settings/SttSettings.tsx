
import React,{ useState } from 'react';
import { useOS } from '../../context/OSContext';
import { STT_PROVIDER_DEFAULTS,STT_SILICONFLOW_BASE_URL_PRESETS,getActiveApiKey } from '../../types/stt';
import { getGuardedInputProps } from '../../utils/inputGuards';
import type { SttProvider,SttConfig } from '../../types/stt';

/** 识别语言选项 */
const STT_LANGUAGE_OPTIONS: { value: string; label: string; hint?: string }[] = [
    { value: '', label: '自动探测', hint: '让模型自动判断语种' },
    { value: 'zh', label: '强制中文', hint: '推荐：彻底杜绝韩文幻觉' },
    { value: 'en', label: '强制英文' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
];

/**
 * 保存后立刻做一次真实的 API 连通性测试：
 * 发一段极短的静音 WAV 到供应商的 /audio/transcriptions，
 * 看返回 HTTP 状态码是否正常。
 */
async function verifySttKey(config: SttConfig): Promise<{ ok: boolean; detail: string }> {
    const apiKey = getActiveApiKey(config);
    if (!apiKey || !apiKey.trim()) {
        return { ok: false, detail: '当前供应商的 API Key 为空' };
    }

    const defaults = STT_PROVIDER_DEFAULTS[config.provider];
    const baseUrl = (config.baseUrl || defaults.baseUrl).replace(/\/+$/, '');
    const model = config.model || defaults.model;
    const url = `${baseUrl}/audio/transcriptions`;

    // 生成 0.1 秒有效静音 WAV（16kHz, 16bit, mono = 1600 samples = 3200 bytes）
    // 注意：不能用 0 字节 data chunk，否则 SenseVoice 会返回 500
    const sampleRate = 16000;
    const numSamples = 1600; // 0.1 秒
    const bytesPerSample = 2; // 16-bit
    const dataSize = numSamples * bytesPerSample;
    const headerSize = 44;
    const wavBuffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(wavBuffer);
    const writeStr = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, headerSize - 8 + dataSize, true); // file size - 8
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);              // fmt chunk size
    view.setUint16(20, 1, true);               // PCM format
    view.setUint16(22, 1, true);               // mono
    view.setUint32(24, sampleRate, true);       // sample rate
    view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
    view.setUint16(32, bytesPerSample, true);  // block align
    view.setUint16(34, 16, true);              // bits per sample
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);        // data chunk size
    // samples 区域默认全 0 = 静音，ArrayBuffer 初始化即为 0
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('file', blob, 'test.wav');
    formData.append('model', model);
    formData.append('response_format', 'json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData,
            signal: controller.signal,
        });

        if (resp.ok) {
            return { ok: true, detail: `连接成功 (${resp.status})` };
        }

        // 特殊情况：静音 WAV 可能被 API 拒绝为「无效音频」，
        // 但只要不是 401/403 就说明 key 是对的
        if (resp.status === 400) {
            return { ok: true, detail: `API Key 有效 (${resp.status} - 测试音频被忽略，属正常)` };
        }
        if (resp.status === 401 || resp.status === 403) {
            const errText = await resp.text().catch(() => '');
            return { ok: false, detail: `API Key 无效 (${resp.status}): ${errText.slice(0, 120)}` };
        }
        if (resp.status === 429) {
            return { ok: false, detail: `请求频率受限 (429)，请稍后再试` };
        }
        // 500/502/503 可能是服务端对测试静音音频的处理异常，不代表 Key 无效
        if (resp.status >= 500 && resp.status < 600) {
            return { ok: true, detail: `API Key 可能有效 (${resp.status} - 服务端处理测试音频异常，不影响正常使用)` };
        }

        const errText = await resp.text().catch(() => '');
        return { ok: false, detail: `API 返回错误 (${resp.status}): ${errText.slice(0, 120)}` };
    } catch (err: any) {
        if (err.name === 'AbortError') {
            return { ok: false, detail: '连接超时 (10s)，请检查网络或 API 地址' };
        }
        // CORS 或网络错误
        const msg = err?.message || String(err);
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')) {
            return { ok: false, detail: `网络错误（可能被 CORS 拦截）: ${msg.slice(0, 100)}` };
        }
        return { ok: false, detail: `请求失败: ${msg.slice(0, 100)}` };
    } finally {
        clearTimeout(timer);
    }
}

const SttSettings: React.FC = () => {
    const { sttConfig, updateSttConfig, addToast } = useOS();

    const [sttProvider, setSttProvider] = useState<SttProvider>(sttConfig.provider);
    const [sttGroqKey, setSttGroqKey] = useState(sttConfig.groqApiKey);
    const [sttSiliconKey, setSttSiliconKey] = useState(sttConfig.siliconflowApiKey);
    const [sttSiliconBaseUrl, setSttSiliconBaseUrl] = useState(
        sttConfig.provider === 'siliconflow' && sttConfig.baseUrl
            ? sttConfig.baseUrl
            : STT_PROVIDER_DEFAULTS.siliconflow.baseUrl,
    );
    const [sttLanguage, setSttLanguage] = useState(sttConfig.language || '');
    const [voiceCallManualSend, setVoiceCallManualSend] = useState(sttConfig.voiceCallManualSend === true);
    const [isTesting, setIsTesting] = useState(false);

    const handleSaveAndTest = async () => {
        const siliconBaseUrl = sttSiliconBaseUrl.trim() || STT_PROVIDER_DEFAULTS.siliconflow.baseUrl;
        const newConfig: SttConfig = {
            provider: sttProvider,
            groqApiKey: sttGroqKey,
            siliconflowApiKey: sttSiliconKey,
            baseUrl: sttProvider === 'siliconflow' ? siliconBaseUrl : undefined,
            language: sttLanguage || undefined,
            voiceCallManualSend,
        };

        // 1. 先保存
        updateSttConfig(newConfig);

        // 2. 检查当前 provider 对应的 key 是否填了
        const activeKey = getActiveApiKey(newConfig);
        if (!activeKey || !activeKey.trim()) {
            const providerLabel = STT_PROVIDER_DEFAULTS[sttProvider].label;
            addToast(`⚠️ 配置已保存，但当前供应商「${providerLabel}」的 Key 为空`, 'error');
            return;
        }

        // 3. 做连通性测试
        setIsTesting(true);
        addToast('配置已保存，正在验证 API Key...', 'info');

        try {
            const result = await verifySttKey(newConfig);
            if (result.ok) {
                addToast(`✅ ${result.detail}`, 'success');
            } else {
                addToast(`❌ ${result.detail}`, 'error');
            }
        } catch {
            addToast('验证过程出错', 'error');
        } finally {
            setIsTesting(false);
        }
    };

    // 当前编辑中的 provider 对应的 key 是否为空
    const activeKeyEmpty = sttProvider === 'groq' ? !sttGroqKey.trim() : !sttSiliconKey.trim();

    return (
        <section className="relative overflow-hidden bg-[#eef4fb]/70 backdrop-blur-sm rounded-3xl p-6 shadow-sm border border-[#d4e4f7]/60">
            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-[#c8d5f5]/30 to-[#d4e4f7]/30 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-gradient-to-tr from-[#f5d5c8]/25 to-[#c8d5f5]/25 blur-xl pointer-events-none" />

            <div className="relative flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-[#c8d5f5]/60 to-[#d4e4f7]/60 backdrop-blur-sm rounded-2xl text-[#7b8db8]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
                    </div>
                    <h2 className="text-sm font-semibold text-[#6b7f99] tracking-wider">语音识别</h2>
                </div>
            </div>

            <p className="relative text-xs text-[#8b9bb1] mb-4 leading-relaxed">
                使用云端 API 识别语音消息。支持 Groq (Whisper) 和硅基流动 (SenseVoice)，均可免费注册使用。
            </p>

            <div className="relative space-y-4">
                {/* 供应商选择 */}
                <div>
                    <label className="text-[10px] font-bold text-[#8b9bb1] uppercase tracking-widest mb-1.5 block pl-1">当前供应商</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(STT_PROVIDER_DEFAULTS) as SttProvider[]).map(p => (
                            <button
                                key={p}
                                onClick={() => setSttProvider(p)}
                                className={`py-3 rounded-xl text-xs font-bold transition-all ${sttProvider === p
                                    ? 'bg-[#7b8db8]/15 text-[#5a6f94] ring-1 ring-[#7b8db8]/30'
                                    : 'bg-white/50 text-[#8b9bb1] border border-[#d4e4f7]/60'
                                    }`}
                            >
                                {STT_PROVIDER_DEFAULTS[p].label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 识别语言选择 */}
                <div>
                    <label className="text-[10px] font-bold text-[#8b9bb1] uppercase tracking-widest mb-1.5 block pl-1">识别语言</label>
                    <div className="flex flex-wrap gap-1.5">
                        {STT_LANGUAGE_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setSttLanguage(opt.value)}
                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${sttLanguage === opt.value
                                    ? 'bg-[#7b8db8]/15 text-[#5a6f94] ring-1 ring-[#7b8db8]/30'
                                    : 'bg-white/50 text-[#8b9bb1] border border-[#d4e4f7]/60'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    {/* 提示文字 */}
                    {sttLanguage === '' && (
                        <p className="text-[10px] text-[#c4956a] mt-1.5 pl-1 leading-relaxed">
                            ⚠️ 自动探测模式下，静音或噪音可能被 Whisper 幻觉为韩文。建议选择「强制中文」。
                        </p>
                    )}
                    {sttLanguage === 'zh' && (
                        <p className="text-[10px] text-[#7faa95] mt-1.5 pl-1">
                            ✓ 已锁定中文识别，不会再出现韩文幻觉问题。
                        </p>
                    )}
                </div>

                <div className="rounded-2xl bg-white/45 border border-[#d4e4f7]/60 px-4 py-3">
                    <label className="flex items-center justify-between gap-4 cursor-pointer">
                        <span className="min-w-0">
                            <span className="block text-xs font-bold text-[#6b7f99]">语音通话手动发送</span>
                            <span className="block text-[10px] text-[#8b9bb1] mt-1 leading-relaxed">
                                STT 识别后先显示草稿，点发送才调用模型，适合长语音和停顿较多的通话。
                            </span>
                        </span>
                        <input
                            type="checkbox"
                            checked={voiceCallManualSend}
                            onChange={e => setVoiceCallManualSend(e.target.checked)}
                            className="h-5 w-5 rounded border-[#b9c9df] text-[#7b8db8] focus:ring-[#7b8db8]"
                        />
                    </label>
                </div>

                {/* Groq API Key */}
                <div>
                    <label className="text-[10px] font-bold text-[#8b9bb1] uppercase tracking-widest mb-1.5 block pl-1">Groq API Key</label>
                    <input
                        type="text"
                        value={sttGroqKey}
                        onChange={e => setSttGroqKey(e.target.value)}
                        placeholder="gsk_..."
                        className="w-full bg-white/60 border border-[#d4e4f7]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                        {...getGuardedInputProps({ kind: 'secret', field: 'stt-groq-key' })}
                    />
                    <a href={STT_PROVIDER_DEFAULTS.groq.registerUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#7b8db8] hover:underline mt-1.5 inline-block pl-1">
                        → 免费获取 Groq Key
                    </a>
                </div>

                {/* 硅基流动 API Key */}
                <div>
                    <label className="text-[10px] font-bold text-[#8b9bb1] uppercase tracking-widest mb-1.5 block pl-1">硅基流动 API Key</label>
                    <input
                        type="text"
                        value={sttSiliconKey}
                        onChange={e => setSttSiliconKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-white/60 border border-[#d4e4f7]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                        {...getGuardedInputProps({ kind: 'secret', field: 'stt-siliconflow-key' })}
                    />
                    <a href={STT_PROVIDER_DEFAULTS.siliconflow.registerUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#7b8db8] hover:underline mt-1.5 inline-block pl-1">
                        → 免费获取硅基流动 Key
                    </a>
                </div>

                {sttProvider === 'siliconflow' && (
                    <div>
                        <label className="text-[10px] font-bold text-[#8b9bb1] uppercase tracking-widest mb-1.5 block pl-1">硅基流动 Base URL</label>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            {STT_SILICONFLOW_BASE_URL_PRESETS.map(preset => {
                                const active = sttSiliconBaseUrl.trim().replace(/\/+$/, '') === preset.value;
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => setSttSiliconBaseUrl(preset.value)}
                                        className={`py-2 rounded-xl text-xs font-bold transition-all border ${active
                                            ? 'bg-[#7b8db8]/15 text-[#5a6f94] ring-1 ring-[#7b8db8]/30 border-[#7b8db8]/20'
                                            : 'bg-white/50 text-[#8b9bb1] border-[#d4e4f7]/60'
                                            }`}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                        <input
                            type="text"
                            value={sttSiliconBaseUrl}
                            onChange={e => setSttSiliconBaseUrl(e.target.value)}
                            placeholder={STT_PROVIDER_DEFAULTS.siliconflow.baseUrl}
                            className="w-full bg-white/60 border border-[#d4e4f7]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                            {...getGuardedInputProps({ kind: 'url', field: 'stt-siliconflow-base-url', inputMode: 'text' })}
                        />
                        <p className="text-[10px] text-[#8b9bb1] mt-1.5 pl-1 leading-relaxed">
                            国内默认不用改；海外用户可切到海外地址，或填自己的代理地址。
                        </p>
                    </div>
                )}

                {/* 当前 provider 的 key 为空时的警告 */}
                {activeKeyEmpty && (
                    <p className="text-[10px] text-[#c4956a] pl-1 leading-relaxed">
                        ⚠️ 当前选中的供应商「{STT_PROVIDER_DEFAULTS[sttProvider].label}」的 Key 为空，保存后语音识别将无法使用。
                    </p>
                )}

                {/* 保存按钮 */}
                <button
                    onClick={handleSaveAndTest}
                    disabled={isTesting}
                    className={`w-full py-3 rounded-2xl font-bold text-white shadow-lg shadow-[#7b8db8]/20 bg-gradient-to-r from-[#7b8db8] to-[#8ba3c8] active:scale-95 transition-all ${isTesting ? 'opacity-60' : ''}`}
                >
                    {isTesting ? '验证中...' : '保存并验证'}
                </button>
            </div>

            {/* 状态指示 */}
            <div className="relative grid grid-cols-3 gap-2 text-center mt-4">
                <div className={`py-3 rounded-2xl text-[10px] font-bold backdrop-blur-sm ${sttConfig.groqApiKey ? 'bg-[#e6f5ee]/60 text-[#7faa95] border border-[#d0e8da]/50' : 'bg-[#f0ebe5]/60 text-[#b8aaa0] border border-[#e5ddd4]/50'}`}>
                    <div className="text-xs mb-1 opacity-70">{sttConfig.groqApiKey ? '●' : '○'}</div>
                    Groq
                </div>
                <div className={`py-3 rounded-2xl text-[10px] font-bold backdrop-blur-sm ${sttConfig.siliconflowApiKey ? 'bg-[#e6f5ee]/60 text-[#7faa95] border border-[#d0e8da]/50' : 'bg-[#f0ebe5]/60 text-[#b8aaa0] border border-[#e5ddd4]/50'}`}>
                    <div className="text-xs mb-1 opacity-70">{sttConfig.siliconflowApiKey ? '●' : '○'}</div>
                    硅基流动
                </div>
                <div className="py-3 rounded-2xl text-[10px] font-bold bg-[#eef4fb]/60 backdrop-blur-sm text-[#7b8db8] border border-[#d4e4f7]/50">
                    <div className="text-[9px] mb-1 font-mono opacity-70">ACTIVE</div>
                    {STT_PROVIDER_DEFAULTS[sttConfig.provider]?.label?.split(' ')[0] || 'Unknown'}
                </div>
            </div>
        </section>
    );
};

export default SttSettings;
