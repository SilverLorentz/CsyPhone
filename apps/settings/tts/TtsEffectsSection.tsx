
import React from 'react';
import type { TtsFormState } from './useTtsForm';

interface Props {
    modifyPitch: number;
    modifyIntensity: number;
    modifyTimbre: number;
    soundEffect: string;
    set: <K extends keyof TtsFormState>(field: K, value: TtsFormState[K]) => void;
}

const EFFECTS = [
    { v: '', l: '无' }, { v: 'spacious_echo', l: '空旷回音' }, { v: 'auditorium_echo', l: '礼堂广播' },
    { v: 'lofi_telephone', l: '电话失真' }, { v: 'robotic', l: '电音' },
];

const TtsEffectsSection: React.FC<Props> = ({ modifyPitch, modifyIntensity, modifyTimbre, soundEffect, set }) => {
    const knobs = [
        { label: '音高', desc: '低沉↔明亮', value: modifyPitch, field: 'modifyPitch' as const },
        { label: '强度', desc: '刚劲↔轻柔', value: modifyIntensity, field: 'modifyIntensity' as const },
        { label: '音色', desc: '浑厚↔清脆', value: modifyTimbre, field: 'modifyTimbre' as const },
    ];

    return (
        <div className="bg-[#e8f0fe]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#d4e4f7]/40">
            <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#8ba4c4]">声音效果器</span></div>
            <div className="space-y-3">
                {knobs.map(s => (
                    <div key={s.label} className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-[#b8aaa0] w-14 leading-tight">{s.label}<br /><span className="text-[8px] font-normal">{s.desc}</span></label>
                        <button onClick={() => set(s.field, Math.max(-100, s.value - 10) as any)} className="w-7 h-7 rounded-lg bg-white/60 border border-[#d4e4f7]/50 text-[#8ba4c4] font-bold text-sm active:scale-90 transition-transform">−</button>
                        <input type="number" value={s.value} onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) set(s.field, Math.max(-100, Math.min(100, v)) as any); }} className="w-16 text-center bg-white/60 border border-[#d4e4f7]/50 rounded-lg px-1 py-1 text-[11px] font-mono font-bold text-[#8ba4c4]" step={10} min={-100} max={100} />
                        <button onClick={() => set(s.field, Math.min(100, s.value + 10) as any)} className="w-7 h-7 rounded-lg bg-white/60 border border-[#d4e4f7]/50 text-[#8ba4c4] font-bold text-sm active:scale-90 transition-transform">+</button>
                        <span className="text-[9px] text-[#b8aaa0]">-100~100</span>
                    </div>
                ))}
            </div>
            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">音效</label>
                <div className="flex gap-1.5 flex-wrap">
                    {EFFECTS.map(e => (
                        <button key={e.v} onClick={() => set('soundEffect', e.v)} className={`text-[9px] px-2.5 py-1.5 rounded-lg font-medium transition-colors ${soundEffect === e.v ? 'bg-[#8ba4c4] text-white' : 'bg-white/60 text-[#8ba4c4] border border-[#d4e4f7]/50'}`}>{e.l}</button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default React.memo(TtsEffectsSection);
