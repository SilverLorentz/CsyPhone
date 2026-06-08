
import React,{ useState } from 'react';
import Modal from '../../../components/os/Modal';
import { useTtsForm } from './useTtsForm';
import TtsApiSection from './TtsApiSection';
import TtsVoiceSection from './TtsVoiceSection';
import TtsEffectsSection from './TtsEffectsSection';
import TtsAudioSection from './TtsAudioSection';
import TtsPreprocessSection from './TtsPreprocessSection';
import TtsTestSection from './TtsTestSection';
import TtsVoiceCallSection from './TtsVoiceCallSection';

// ─── Preset persistence ─────────────────────────────────────────────────

type TtsPreset = { name: string; config: Record<string, any> };

function loadPresets(): TtsPreset[] {
    try { return JSON.parse(localStorage.getItem('os_tts_presets') || '[]'); } catch { return []; }
}

// ─── Component ──────────────────────────────────────────────────────────

const TtsSettings: React.FC = () => {
    const { form, set, merge, save, resetPreprocessPrompt, buildTestConfig, ttsConfig, addToast } = useTtsForm();
    const [showModal, setShowModal] = useState(false);
    const [presets, setPresets] = useState<TtsPreset[]>(loadPresets);
    const [presetName, setPresetName] = useState('');
    const voiceCallProviderLabel = ttsConfig.voiceCallProvider === 'elevenlabs' ? 'ElevenLabs' : 'MiniMax';
    const voiceCallConfigured = ttsConfig.voiceCallProvider === 'elevenlabs'
        ? Boolean(ttsConfig.elevenLabs.apiKey && ttsConfig.elevenLabs.voiceId)
        : Boolean(ttsConfig.apiKey && ttsConfig.groupId);
    const voiceCallVoiceId = ttsConfig.voiceCallProvider === 'elevenlabs'
        ? ttsConfig.elevenLabs.voiceId
        : ttsConfig.voiceSetting.voice_id;

    const handleSave = () => { save(); setShowModal(false); };

    const savePreset = () => {
        if (!presetName.trim()) return;
        const preset: TtsPreset = {
            name: presetName.trim(),
            config: {
                voiceId: form.voiceId, speed: form.speed, vol: form.vol, pitch: form.pitch, emotion: form.emotion,
                model: form.model, langBoost: form.langBoost, modifyPitch: form.modifyPitch, modifyIntensity: form.modifyIntensity,
                modifyTimbre: form.modifyTimbre, soundEffect: form.soundEffect, format: form.format,
                sampleRate: form.sampleRate, bitrate: form.bitrate, channel: form.channel,
            },
        };
        const updated = [...presets.filter(p => p.name !== preset.name), preset];
        setPresets(updated);
        localStorage.setItem('os_tts_presets', JSON.stringify(updated));
        setPresetName('');
        addToast(`预设「${preset.name}」已保存`, 'success');
    };

    const loadPreset = (c: Record<string, any>) => {
        merge({
            voiceId: c.voiceId || '', speed: c.speed ?? 1, vol: c.vol ?? 1, pitch: c.pitch ?? 0, emotion: c.emotion || '',
            model: c.model || 'speech-2.8-hd', langBoost: c.langBoost || '',
            modifyPitch: c.modifyPitch ?? 0, modifyIntensity: c.modifyIntensity ?? 0, modifyTimbre: c.modifyTimbre ?? 0,
            soundEffect: c.soundEffect || '', format: c.format || 'mp3', sampleRate: c.sampleRate ?? 32000,
            bitrate: c.bitrate ?? 128000, channel: c.channel ?? 1,
        });
    };

    const removePreset = (i: number) => {
        const updated = presets.filter((_, j) => j !== i);
        setPresets(updated);
        localStorage.setItem('os_tts_presets', JSON.stringify(updated));
    };

    const minimaxSettings = (
        <>
            <TtsApiSection baseUrl={form.baseUrl} apiKey={form.apiKey} groupId={form.groupId} model={form.model} set={set} />
            <TtsVoiceSection voiceId={form.voiceId} speed={form.speed} vol={form.vol} pitch={form.pitch} emotion={form.emotion} langBoost={form.langBoost} set={set} />
            <TtsEffectsSection modifyPitch={form.modifyPitch} modifyIntensity={form.modifyIntensity} modifyTimbre={form.modifyTimbre} soundEffect={form.soundEffect} set={set} />
            <TtsAudioSection format={form.format} sampleRate={form.sampleRate} bitrate={form.bitrate} channel={form.channel} set={set} />

            {/* 发音词典 (inline — too small to extract) */}
            <div className="bg-[#fef5e7]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f0e4d7]/40">
                <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#c4a86c]">发音词典</span></div>
                <textarea value={form.pronounceDict} onChange={e => set('pronounceDict', e.target.value)} rows={3} className="w-full bg-white/60 backdrop-blur-sm border border-[#f0e4d7]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono resize-none focus:bg-white/80 transition-all" placeholder={`每行一条规则，例如：\n燕少飞/(yan4)(shao3)(fei1)\nomg/oh my god`} />
                {/[（）]/.test(form.pronounceDict) && (
                    <p className="text-[10px] text-amber-600 bg-amber-50/80 px-3 py-1.5 rounded-lg font-medium">⚠️ 检测到中文括号（），请替换为英文半角括号 ()，否则注音不会生效</p>
                )}
                <p className="text-[10px] text-[#c4a86c]/70">每行一条注音规则。中文声调: 1=一声 2=二声 3=三声 4=四声 5=轻声。注意使用英文半角括号 ()</p>
            </div>

            <TtsPreprocessSection
                preprocessEnabled={form.preprocessEnabled} preprocessPrompt={form.preprocessPrompt}
                preprocessApiBase={form.preprocessApiBase} preprocessApiKey={form.preprocessApiKey}
                preprocessModel={form.preprocessModel} set={set} onResetPrompt={resetPreprocessPrompt}
            />
            <TtsTestSection apiKey={form.apiKey} buildTestConfig={buildTestConfig} />
        </>
    );

    return (
        <>
            {/* ── 概览卡片 ── */}
            <section className="relative overflow-hidden bg-[#fdf6f0]/70 backdrop-blur-sm rounded-3xl p-6 shadow-sm border border-[#f0e4d7]/60">
                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-[#f5d5c8]/30 to-[#e8cfe8]/30 blur-2xl pointer-events-none" />
                <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-gradient-to-tr from-[#d4e4f7]/25 to-[#f5d5c8]/25 blur-xl pointer-events-none" />

                <div className="relative flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-[#f5d5c8]/60 to-[#e8cfe8]/60 backdrop-blur-sm rounded-2xl text-[#b8849b]">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
                        </div>
                        <h2 className="text-sm font-semibold text-[#8b7e74] tracking-wider">语音合成</h2>
                    </div>
                    <button onClick={() => setShowModal(true)} className="text-[10px] bg-gradient-to-r from-[#e8cfe8]/70 to-[#f5d5c8]/70 backdrop-blur-sm text-[#9b7e8f] px-4 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform border border-white/40">配置</button>
                </div>

                <p className="relative text-xs text-[#a89b91] mb-4 leading-relaxed">
                    使用 MiniMax 语音合成 API，让角色用声音说话；语音通话可切换 ElevenLabs。
                </p>

                <div className="relative grid grid-cols-3 gap-3 text-center">
                    <div className={`py-3.5 rounded-2xl text-xs font-bold backdrop-blur-sm ${voiceCallConfigured ? 'bg-[#e6f5ee]/60 text-[#7faa95] border border-[#d0e8da]/50' : 'bg-[#f0ebe5]/60 text-[#b8aaa0] border border-[#e5ddd4]/50'}`}>
                        <div className="text-sm mb-1.5 opacity-70">{voiceCallConfigured ? '●' : '○'}</div>
                        {voiceCallConfigured ? '已配置' : '未配置'}
                    </div>
                    <div className="py-3.5 rounded-2xl text-xs font-bold bg-[#fce4ec]/50 backdrop-blur-sm text-[#c4929f] border border-[#f5d5da]/50">
                        <div className="text-[10px] mb-1.5 font-mono opacity-70">CALL</div>
                        {voiceCallProviderLabel}
                    </div>
                    <div className="py-3.5 rounded-2xl text-xs font-bold bg-[#f0eaf7]/50 backdrop-blur-sm text-[#a18db8] border border-[#e5ddf0]/50">
                        <div className="text-[10px] mb-1.5 font-mono opacity-70">VOICE</div>
                        {voiceCallVoiceId.length > 10 ? voiceCallVoiceId.slice(0, 10) + '...' : voiceCallVoiceId || '未填写'}
                    </div>
                </div>
            </section>

            {/* ── 配置 Modal ── */}
            <Modal isOpen={showModal} title="语音合成配置" onClose={() => setShowModal(false)}
                footer={<button onClick={handleSave} className="w-full py-3 bg-gradient-to-r from-[#e8a0bf] to-[#c4b0d9] text-white font-bold rounded-2xl shadow-lg border border-white/30">保存配置</button>}>
                <div className="space-y-6 max-h-[60vh] overflow-y-auto no-scrollbar">

                    {/* 预设管理 */}
                    <div className="bg-[#fef0e7]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f0e4d7]/40">
                        <div className="flex items-center gap-2 mb-1"><span className="text-sm font-bold text-[#c4929f]">MiniMax 预设管理</span></div>
                        <div className="flex gap-2">
                            <input type="text" value={presetName} onChange={e => setPresetName(e.target.value)} className="flex-1 bg-white/70 backdrop-blur-sm border border-[#f0e4d7]/60 rounded-xl px-3 py-2 text-[11px] focus:bg-white/90 transition-all" placeholder="输入预设名称..." />
                            <button onClick={savePreset} className="text-[10px] bg-gradient-to-r from-[#e8a0bf] to-[#c4b0d9] text-white px-3 py-2 rounded-xl font-bold whitespace-nowrap active:scale-95 transition-transform border border-white/30">保存预设</button>
                        </div>
                        {presets.length > 0 && (
                            <div className="space-y-1.5">
                                {presets.map((p, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-xl px-3 py-2 border border-[#f0e4d7]/30">
                                        <span className="flex-1 text-[11px] font-medium text-[#8b7e74] truncate">{p.name}</span>
                                        <button onClick={() => { loadPreset(p.config); addToast(`已加载预设「${p.name}」`, 'success'); }} className="text-[9px] bg-[#e8cfe8]/50 text-[#9b7e8f] px-2 py-1 rounded-lg font-bold active:scale-95 transition-transform">加载</button>
                                        <button onClick={() => removePreset(i)} className="text-[9px] text-[#b8aaa0] px-1.5 py-1 rounded-lg hover:text-red-400 transition-colors">✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <TtsVoiceCallSection
                        voiceCallProvider={form.voiceCallProvider}
                        elevenLabsApiKey={form.elevenLabsApiKey}
                        elevenLabsVoiceId={form.elevenLabsVoiceId}
                        elevenLabsModelId={form.elevenLabsModelId}
                        elevenLabsLanguageCode={form.elevenLabsLanguageCode}
                        elevenLabsStability={form.elevenLabsStability}
                        elevenLabsSimilarityBoost={form.elevenLabsSimilarityBoost}
                        elevenLabsStyle={form.elevenLabsStyle}
                        elevenLabsSpeed={form.elevenLabsSpeed}
                        elevenLabsUseSpeakerBoost={form.elevenLabsUseSpeakerBoost}
                        set={set}
                    />
                    {form.voiceCallProvider === 'elevenlabs' ? (
                        <details className="bg-white/45 border border-[#d4e4f7]/50 rounded-3xl p-4">
                            <summary className="cursor-pointer text-xs font-bold text-[#8ba4c4] select-none">
                                MiniMax 聊天朗读 / 备用配置
                            </summary>
                            <div className="space-y-6 mt-4">
                                {minimaxSettings}
                            </div>
                        </details>
                    ) : minimaxSettings}
                </div>
            </Modal>
        </>
    );
};

export default TtsSettings;
