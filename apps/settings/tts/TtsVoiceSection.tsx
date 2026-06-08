
import React from 'react';
import type { TtsFormState } from './useTtsForm';

interface Props {
    voiceId: string;
    speed: number;
    vol: number;
    pitch: number;
    emotion: string;
    langBoost: string;
    set: <K extends keyof TtsFormState>(field: K, value: TtsFormState[K]) => void;
}

const VOICE_PRESETS = ['audiobook_male_1', 'Chinese (Mandarin)_Lyrical_Voice', 'English_Graceful_Lady', 'Japanese_Whisper_Belle'];
const EMOTIONS = [
    { v: '', l: '自动' }, { v: 'happy', l: '开心' }, { v: 'sad', l: '悲伤' }, { v: 'angry', l: '愤怒' },
    { v: 'calm', l: '平静' }, { v: 'surprised', l: '惊讶' }, { v: 'fearful', l: '恐惧' }, { v: 'disgusted', l: '厌恶' }, { v: 'fluent', l: '生动' },
];

const TtsVoiceSection: React.FC<Props> = ({ voiceId, speed, vol, pitch, emotion, langBoost, set }) => {
    const sliders = [
        { label: '语速', value: speed, field: 'speed' as const, min: 0.5, max: 2, step: 0.1, fmt: (v: number) => v.toFixed(1) },
        { label: '音量', value: vol, field: 'vol' as const, min: 0.1, max: 10, step: 0.1, fmt: (v: number) => v.toFixed(1) },
        { label: '语调', value: pitch, field: 'pitch' as const, min: -12, max: 12, step: 1, fmt: (v: number) => String(v) },
    ];

    return (
        <div className="bg-[#fce4ec]/40 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f5d5da]/40">
            <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#c4929f]">默认音色设置</span></div>
            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">默认 Voice ID</label>
                <input type="text" value={voiceId} onChange={e => set('voiceId', e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#f5d5da]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="角色未填写 Voice ID 时使用" /></div>
            <div className="flex gap-1.5 flex-wrap">
                {VOICE_PRESETS.map(v => (
                    <button key={v} onClick={() => set('voiceId', v)} className={`text-[9px] px-2 py-1 rounded-lg font-medium transition-colors ${voiceId === v ? 'bg-[#c4929f] text-white' : 'bg-white/60 text-[#c4929f] border border-[#f5d5da]/50'}`}>{v.length > 18 ? v.slice(0, 18) + '...' : v}</button>
                ))}
            </div>
            <div className="space-y-3">
                {sliders.map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-[#b8aaa0] w-8">{s.label}</label>
                        <button onClick={() => set(s.field, Math.max(s.min, +(s.value - s.step).toFixed(2)) as any)} className="w-7 h-7 rounded-lg bg-white/60 border border-[#f5d5da]/50 text-[#c4929f] font-bold text-sm active:scale-90 transition-transform">−</button>
                        <input type="number" value={s.fmt(s.value)} onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) set(s.field, Math.max(s.min, Math.min(s.max, v)) as any); }} className="w-16 text-center bg-white/60 border border-[#f5d5da]/50 rounded-lg px-1 py-1 text-[11px] font-mono font-bold text-[#c4929f]" step={s.step} min={s.min} max={s.max} />
                        <button onClick={() => set(s.field, Math.min(s.max, +(s.value + s.step).toFixed(2)) as any)} className="w-7 h-7 rounded-lg bg-white/60 border border-[#f5d5da]/50 text-[#c4929f] font-bold text-sm active:scale-90 transition-transform">+</button>
                        <span className="text-[9px] text-[#b8aaa0]">{s.min}~{s.max}</span>
                    </div>
                ))}
            </div>
            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">情绪</label>
                <div className="flex gap-1.5 flex-wrap">
                    {EMOTIONS.map(e => (
                        <button key={e.v} onClick={() => set('emotion', e.v)} className={`text-[9px] px-2.5 py-1.5 rounded-lg font-medium transition-colors ${emotion === e.v ? 'bg-[#c4929f] text-white' : 'bg-white/60 text-[#c4929f] border border-[#f5d5da]/50'}`}>{e.l}</button>
                    ))}
                </div>
            </div>
            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">语种增强</label>
                <select value={langBoost} onChange={e => set('langBoost', e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#f5d5da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                    <option value="">不启用</option><option value="auto">自动判断</option><option value="Chinese">中文</option><option value="Chinese,Yue">粤语</option>
                    <option value="English">英语</option><option value="Japanese">日语</option><option value="Korean">韩语</option>
                    <option value="French">法语</option><option value="German">德语</option><option value="Spanish">西班牙语</option><option value="Russian">俄语</option>
                </select>
            </div>
        </div>
    );
};

export default React.memo(TtsVoiceSection);
