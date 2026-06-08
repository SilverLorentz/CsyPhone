import React from 'react';
import { getGuardedInputProps } from '../../../utils/inputGuards';
import type { TtsFormState } from './useTtsForm';
import TtsEchoSection from './TtsEchoSection';

interface Props {
    voiceCallProvider: TtsFormState['voiceCallProvider'];
    elevenLabsApiKey: string;
    elevenLabsVoiceId: string;
    elevenLabsModelId: string;
    elevenLabsLanguageCode: string;
    elevenLabsStability: number;
    elevenLabsSimilarityBoost: number;
    elevenLabsStyle: number;
    elevenLabsSpeed: number;
    elevenLabsUseSpeakerBoost: boolean;
    set: <K extends keyof TtsFormState>(field: K, value: TtsFormState[K]) => void;
}

const ELEVENLABS_MODELS = [
    { value: 'eleven_flash_v2_5', label: 'eleven_flash_v2_5 (低延迟)' },
    { value: 'eleven_turbo_v2_5', label: 'eleven_turbo_v2_5' },
    { value: 'eleven_multilingual_v2', label: 'eleven_multilingual_v2' },
    { value: 'eleven_v3', label: 'eleven_v3 (情绪标签 / 较慢)' },
];

const ELEVENLABS_LANGUAGES = [
    { value: '', label: 'Auto / 自动识别' },
    { value: 'en', label: 'English' },
    { value: 'zh', label: '中文' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'es', label: 'Español' },
    { value: 'it', label: 'Italiano' },
    { value: 'pt', label: 'Português' },
];

const TtsVoiceCallSection: React.FC<Props> = ({
    voiceCallProvider,
    elevenLabsApiKey,
    elevenLabsVoiceId,
    elevenLabsModelId,
    elevenLabsLanguageCode,
    elevenLabsStability,
    elevenLabsSimilarityBoost,
    elevenLabsStyle,
    elevenLabsSpeed,
    elevenLabsUseSpeakerBoost,
    set,
}) => (
    <div className="bg-[#edf6ff]/60 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#d4e4f7]/40">
        <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-sm font-bold text-[#6f8dad]">语音通话引擎</span>
            <span className="text-[9px] px-2 py-1 rounded-full bg-white/60 text-[#8ba4c4] font-bold">WSS</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
            <button
                type="button"
                onClick={() => set('voiceCallProvider', 'minimax')}
                className={`py-2.5 rounded-xl text-xs font-bold transition-colors border ${voiceCallProvider === 'minimax' ? 'bg-[#8ba4c4] text-white border-[#8ba4c4]' : 'bg-white/60 text-[#8ba4c4] border-[#d4e4f7]/50'}`}
            >
                MiniMax
            </button>
            <button
                type="button"
                onClick={() => set('voiceCallProvider', 'elevenlabs')}
                className={`py-2.5 rounded-xl text-xs font-bold transition-colors border ${voiceCallProvider === 'elevenlabs' ? 'bg-[#8ba4c4] text-white border-[#8ba4c4]' : 'bg-white/60 text-[#8ba4c4] border-[#d4e4f7]/50'}`}
            >
                ElevenLabs
            </button>
        </div>

        {voiceCallProvider === 'elevenlabs' && (
            <div className="space-y-3 pt-2">
                <div>
                    <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">ElevenLabs API Key</label>
                    <input
                        type="text"
                        value={elevenLabsApiKey}
                        onChange={e => set('elevenLabsApiKey', e.target.value)}
                        className="w-full bg-white/60 backdrop-blur-sm border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all"
                        placeholder="xi-api-key"
                        {...getGuardedInputProps({ kind: 'secret', field: 'tts-elevenlabs-api-key' })}
                    />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">默认 Voice ID</label>
                    <input
                        type="text"
                        value={elevenLabsVoiceId}
                        onChange={e => set('elevenLabsVoiceId', e.target.value)}
                        className="w-full bg-white/60 backdrop-blur-sm border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all"
                        placeholder="角色未填写 ElevenLabs Voice ID 时使用"
                        {...getGuardedInputProps({ kind: 'config', field: 'tts-elevenlabs-voice-id' })}
                    />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">模型</label>
                    <select
                        value={elevenLabsModelId}
                        onChange={e => set('elevenLabsModelId', e.target.value)}
                        className="w-full bg-white/60 backdrop-blur-sm border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all"
                    >
                        {ELEVENLABS_MODELS.map(model => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">语种</label>
                    <select
                        value={elevenLabsLanguageCode}
                        onChange={e => set('elevenLabsLanguageCode', e.target.value)}
                        className="w-full bg-white/60 backdrop-blur-sm border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all"
                    >
                        {ELEVENLABS_LANGUAGES.map(lang => (
                            <option key={lang.value || 'auto'} value={lang.value}>{lang.label}</option>
                        ))}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">Stability</label>
                        <input
                            type="number"
                            value={elevenLabsStability}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={e => set('elevenLabsStability', Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                            className="w-full bg-white/60 border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">Style</label>
                        <input
                            type="number"
                            value={elevenLabsStyle}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={e => set('elevenLabsStyle', Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                            className="w-full bg-white/60 border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">Speed</label>
                        <input
                            type="number"
                            value={elevenLabsSpeed}
                            min={0.7}
                            max={1.2}
                            step={0.05}
                            onChange={e => set('elevenLabsSpeed', Math.max(0.7, Math.min(1.2, Number(e.target.value) || 1)))}
                            className="w-full bg-white/60 border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">Similarity</label>
                        <input
                            type="number"
                            value={elevenLabsSimilarityBoost}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={e => set('elevenLabsSimilarityBoost', Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                            className="w-full bg-white/60 border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all"
                        />
                    </div>
                </div>
                <label className="flex items-center justify-between gap-3 bg-white/55 border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5">
                    <span className="text-[11px] font-bold text-[#8ba4c4]">Speaker Boost</span>
                    <input
                        type="checkbox"
                        checked={elevenLabsUseSpeakerBoost}
                        onChange={e => set('elevenLabsUseSpeakerBoost', e.target.checked)}
                        className="w-4 h-4 accent-[#8ba4c4]"
                    />
                </label>
                <TtsEchoSection
                    elevenLabsApiKey={elevenLabsApiKey}
                    elevenLabsModelId={elevenLabsModelId}
                    set={set}
                />
            </div>
        )}
    </div>
);

export default React.memo(TtsVoiceCallSection);
