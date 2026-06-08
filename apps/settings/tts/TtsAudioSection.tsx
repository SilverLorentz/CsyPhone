
import React from 'react';
import type { TtsFormState } from './useTtsForm';

interface Props {
    format: string;
    sampleRate: number;
    bitrate: number;
    channel: number;
    set: <K extends keyof TtsFormState>(field: K, value: TtsFormState[K]) => void;
}

const TtsAudioSection: React.FC<Props> = ({ format, sampleRate, bitrate, channel, set }) => (
    <div className="bg-[#e6f5ee]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#d0e8da]/40">
        <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#7faa95]">音频格式</span></div>
        <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">格式</label>
                <select value={format} onChange={e => set('format', e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                    <option value="mp3">MP3</option><option value="pcm">PCM</option><option value="flac">FLAC</option></select></div>
            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">采样率</label>
                <select value={sampleRate} onChange={e => set('sampleRate', Number(e.target.value))} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                    {[8000, 16000, 22050, 24000, 32000, 44100].map(r => <option key={r} value={r}>{r} Hz</option>)}</select></div>
            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">比特率</label>
                <select value={bitrate} onChange={e => set('bitrate', Number(e.target.value))} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                    {[32000, 64000, 128000, 256000].map(b => <option key={b} value={b}>{b / 1000} kbps</option>)}</select></div>
            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">声道</label>
                <select value={channel} onChange={e => set('channel', Number(e.target.value))} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                    <option value={1}>单声道</option><option value={2}>双声道</option></select></div>
        </div>
    </div>
);

export default React.memo(TtsAudioSection);
