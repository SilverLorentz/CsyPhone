import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../../../context/OSContext';
import { getGuardedInputProps } from '../../../utils/inputGuards';
import {
    createElevenLabsVoice,
    designElevenLabsVoice,
    generateCharacterEchoVoiceDraft,
    type EchoCreatedVoice,
    type EchoVoiceDesignModelId,
    type EchoVoiceDraft,
    type EchoVoicePreview,
} from '../../../utils/echoVoiceDesign';
import type { TtsFormState } from './useTtsForm';

interface Props {
    elevenLabsApiKey: string;
    elevenLabsModelId: string;
    set: <K extends keyof TtsFormState>(field: K, value: TtsFormState[K]) => void;
}

type PreviewWithUrl = EchoVoicePreview & { audioUrl: string };

const VOICE_DESIGN_MODELS: Array<{ value: EchoVoiceDesignModelId; label: string }> = [
    { value: 'eleven_ttv_v3', label: 'eleven_ttv_v3' },
    { value: 'eleven_multilingual_ttv_v2', label: 'eleven_multilingual_ttv_v2' },
];

const EMPTY_DRAFT: EchoVoiceDraft = {
    characterNote: '',
    voiceDescription: '',
    previewText: '',
    voiceName: '',
};

function getDefaultDesignModel(runtimeModelId: string): EchoVoiceDesignModelId {
    return runtimeModelId.trim() === 'eleven_v3' ? 'eleven_ttv_v3' : 'eleven_multilingual_ttv_v2';
}

function base64ToBlob(base64: string, mimeType: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
}

function buildPreviewUrls(previews: EchoVoicePreview[]): PreviewWithUrl[] {
    return previews.map(preview => ({
        ...preview,
        audioUrl: preview.audioBase64
            ? URL.createObjectURL(base64ToBlob(preview.audioBase64, preview.mediaType))
            : '',
    }));
}

const TtsEchoSection: React.FC<Props> = ({ elevenLabsApiKey, elevenLabsModelId, set }) => {
    const { apiConfig, characters, activeCharacterId, userProfile, updateCharacter, addToast } = useOS();
    const activeCharacter = useMemo(
        () => characters.find(char => char.id === activeCharacterId),
        [characters, activeCharacterId],
    );

    const [draft, setDraft] = useState<EchoVoiceDraft>(EMPTY_DRAFT);
    const [designModelId, setDesignModelId] = useState<EchoVoiceDesignModelId>(() => getDefaultDesignModel(elevenLabsModelId));
    const [guidanceScale, setGuidanceScale] = useState(5);
    const [shouldEnhance, setShouldEnhance] = useState(true);
    const [previews, setPreviews] = useState<PreviewWithUrl[]>([]);
    const [selectedPreviewId, setSelectedPreviewId] = useState('');
    const [playedPreviewIds, setPlayedPreviewIds] = useState<Set<string>>(() => new Set());
    const [playingPreviewId, setPlayingPreviewId] = useState('');
    const [createdVoice, setCreatedVoice] = useState<EchoCreatedVoice | null>(null);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isDesigning, setIsDesigning] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const previewListRef = useRef<HTMLDivElement | null>(null);
    const previewsRef = useRef<PreviewWithUrl[]>([]);
    const previewAudioRef = useRef<HTMLAudioElement | null>(null);

    const stopPreviewPlayback = useCallback((resetPlayingState = true) => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current.onended = null;
            previewAudioRef.current.onerror = null;
            previewAudioRef.current = null;
        }
        if (resetPlayingState) setPlayingPreviewId('');
    }, []);

    useEffect(() => () => {
        stopPreviewPlayback(false);
        previewsRef.current.forEach(preview => {
            if (preview.audioUrl) URL.revokeObjectURL(preview.audioUrl);
        });
        previewsRef.current = [];
    }, [stopPreviewPlayback]);

    useEffect(() => {
        if (previews.length === 0) return;
        window.setTimeout(() => {
            if (typeof previewListRef.current?.scrollIntoView === 'function') {
                previewListRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 0);
    }, [previews.length]);

    const replacePreviews = useCallback((next: EchoVoicePreview[]) => {
        stopPreviewPlayback();
        previewsRef.current.forEach(preview => {
            if (preview.audioUrl) URL.revokeObjectURL(preview.audioUrl);
        });
        const nextPreviews = buildPreviewUrls(next);
        previewsRef.current = nextPreviews;
        setPreviews(nextPreviews);
        setSelectedPreviewId('');
        setPlayedPreviewIds(new Set());
        setCreatedVoice(null);
    }, [stopPreviewPlayback]);

    const updateDraft = useCallback(<K extends keyof EchoVoiceDraft>(field: K, value: EchoVoiceDraft[K]) => {
        setDraft(prev => ({ ...prev, [field]: value }));
    }, []);

    const handleSuggest = useCallback(async () => {
        if (!activeCharacter) {
            addToast('请先选择一个角色', 'error');
            return;
        }
        setIsSuggesting(true);
        try {
            const nextDraft = await generateCharacterEchoVoiceDraft(apiConfig, activeCharacter, userProfile);
            setDraft(nextDraft);
            replacePreviews([]);
            addToast(`${activeCharacter.name} 写好了声线建议`, 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : '声线建议生成失败';
            addToast(message, 'error');
        } finally {
            setIsSuggesting(false);
        }
    }, [activeCharacter, addToast, apiConfig, replacePreviews, userProfile]);

    const handleDesign = useCallback(async () => {
        if (!elevenLabsApiKey.trim()) {
            addToast('请先填写 ElevenLabs API Key', 'error');
            return;
        }

        const confirmed = typeof window === 'undefined' ? true : window.confirm(
            '这一步会调用 ElevenLabs Voice Design，一次生成 3 个候选音色，会按试听文本字符消耗 credits；重复生成会再次消耗。确定继续吗？',
        );
        if (!confirmed) return;

        setIsDesigning(true);
        try {
            const result = await designElevenLabsVoice({
                apiKey: elevenLabsApiKey,
                voiceDescription: draft.voiceDescription,
                previewText: draft.previewText,
                modelId: designModelId,
                guidanceScale,
                shouldEnhance,
            });
            replacePreviews(result.previews);
            updateDraft('previewText', result.text);
            addToast(
                result.safetyAdjusted
                    ? '已用中性试听文本生成 3 个回声预览'
                    : '已生成 3 个回声预览',
                'success',
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'ElevenLabs 音色预览生成失败';
            addToast(message, 'error');
        } finally {
            setIsDesigning(false);
        }
    }, [
        addToast,
        designModelId,
        draft.previewText,
        draft.voiceDescription,
        elevenLabsApiKey,
        guidanceScale,
        replacePreviews,
        shouldEnhance,
        updateDraft,
    ]);

    const handleSaveVoice = useCallback(async () => {
        const selectedPreview = previews.find(preview => preview.generatedVoiceId === selectedPreviewId);
        if (!selectedPreview) {
            addToast('请先选择一个回声预览', 'error');
            return;
        }

        const confirmed = typeof window === 'undefined' ? true : window.confirm(
            '这一步会调用 ElevenLabs Create Voice，把选中的预览保存为可复用 Voice ID；保存后会占用 ElevenLabs voice slot。确定保存吗？',
        );
        if (!confirmed) return;

        setIsSaving(true);
        try {
            const voice = await createElevenLabsVoice({
                apiKey: elevenLabsApiKey,
                voiceName: draft.voiceName || `${activeCharacter?.name || 'Echo'} Voice`,
                voiceDescription: draft.voiceDescription,
                generatedVoiceId: selectedPreview.generatedVoiceId,
                playedNotSelectedVoiceIds: previews
                    .map(preview => preview.generatedVoiceId)
                    .filter(id => id !== selectedPreview.generatedVoiceId && playedPreviewIds.has(id)),
            });
            setCreatedVoice(voice);
            set('elevenLabsVoiceId', voice.voiceId);
            addToast('已创建 Voice ID，并填入默认 ElevenLabs Voice ID', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'ElevenLabs 音色保存失败';
            addToast(message, 'error');
        } finally {
            setIsSaving(false);
        }
    }, [
        activeCharacter?.name,
        addToast,
        draft.voiceDescription,
        draft.voiceName,
        elevenLabsApiKey,
        playedPreviewIds,
        previews,
        selectedPreviewId,
        set,
    ]);

    const bindCreatedVoiceToCharacter = useCallback(() => {
        if (!activeCharacter || !createdVoice) return;
        updateCharacter(activeCharacter.id, { elevenLabsVoiceId: createdVoice.voiceId });
        addToast(`已绑定给 ${activeCharacter.name}`, 'success');
    }, [activeCharacter, addToast, createdVoice, updateCharacter]);

    const handlePlayPreview = useCallback(async (preview: PreviewWithUrl) => {
        if (!preview.audioUrl) {
            addToast('这个回声预览没有返回音频', 'error');
            return;
        }

        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current.onended = null;
            previewAudioRef.current.onerror = null;
            previewAudioRef.current = null;
        }

        const audio = new Audio(preview.audioUrl);
        previewAudioRef.current = audio;
        setPlayingPreviewId(preview.generatedVoiceId);
        setPlayedPreviewIds(prev => new Set(prev).add(preview.generatedVoiceId));
        audio.onended = () => {
            if (previewAudioRef.current === audio) previewAudioRef.current = null;
            setPlayingPreviewId('');
        };
        audio.onerror = () => {
            if (previewAudioRef.current === audio) previewAudioRef.current = null;
            setPlayingPreviewId('');
            addToast('回声预览播放失败', 'error');
        };

        try {
            await audio.play();
        } catch {
            if (previewAudioRef.current === audio) previewAudioRef.current = null;
            setPlayingPreviewId('');
            addToast('浏览器暂时没能播放这条回声，请再点一次试听', 'error');
        }
    }, [addToast]);

    const previewTextLength = draft.previewText.trim().length;
    const descriptionLength = draft.voiceDescription.trim().length;

    return (
        <div className="pt-4 mt-4 border-t border-[#d4e4f7]/60 space-y-4">
            <details className="group">
                <summary className="cursor-pointer select-none text-xs font-bold text-[#6f8dad] flex items-center justify-between gap-3">
                    <span>回声</span>
                    <span className="text-[9px] px-2 py-1 rounded-full bg-white/60 text-[#8ba4c4] font-bold group-open:hidden">展开</span>
                </summary>

                <div className="pt-4 space-y-4">
                    <div className="text-[10px] leading-relaxed text-[#8ba4c4] bg-white/45 border border-[#d4e4f7]/50 rounded-2xl px-3 py-2">
                        让 char 写建议只使用当前聊天 API，不消耗 ElevenLabs credits。点击生成预览才会调用 ElevenLabs，一次 3 个候选并按试听文本字符消耗 credits；重复生成会再次消耗。保存选中音色会占用 ElevenLabs voice slot。
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[10px] font-bold text-[#b8aaa0] uppercase">当前角色</div>
                            <div className="text-xs font-semibold text-[#6f8dad] truncate">
                                {activeCharacter?.name || '未选择角色'}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleSuggest}
                            disabled={isSuggesting || !activeCharacter}
                            className="shrink-0 text-[10px] bg-[#8ba4c4] text-white px-3 py-2 rounded-xl font-bold disabled:opacity-45 active:scale-95 transition-transform"
                        >
                            {isSuggesting ? '书写中…' : '让 char 写提示词'}
                        </button>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">char 的声线建议</label>
                        <textarea
                            value={draft.characterNote}
                            onChange={e => updateDraft('characterNote', e.target.value)}
                            rows={3}
                            className="w-full bg-white/60 backdrop-blur-sm border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-[11px] resize-none focus:bg-white/80 transition-all"
                            placeholder="先让 char 自己说说：我应该听起来是什么样。"
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase">提交给 ElevenLabs 的提示词</label>
                            <span className={`text-[9px] font-mono ${descriptionLength < 20 || descriptionLength > 1000 ? 'text-amber-600' : 'text-[#8ba4c4]'}`}>
                                {descriptionLength}/1000
                            </span>
                        </div>
                        <textarea
                            value={draft.voiceDescription}
                            onChange={e => updateDraft('voiceDescription', e.target.value)}
                            rows={5}
                            className="w-full bg-white/60 backdrop-blur-sm border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-[11px] resize-none focus:bg-white/80 transition-all"
                            placeholder="A warm, intimate young adult voice..."
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase">试听文本</label>
                            <span className={`text-[9px] font-mono ${previewTextLength < 100 || previewTextLength > 1000 ? 'text-amber-600' : 'text-[#8ba4c4]'}`}>
                                {previewTextLength}/1000
                            </span>
                        </div>
                        <textarea
                            value={draft.previewText}
                            onChange={e => updateDraft('previewText', e.target.value)}
                            rows={5}
                            className="w-full bg-white/60 backdrop-blur-sm border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-[11px] resize-none focus:bg-white/80 transition-all"
                            placeholder="写一段让这个声音开口的台词，100-1000 字符。"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">Voice Design 模型</label>
                            <select
                                value={designModelId}
                                onChange={e => setDesignModelId(e.target.value as EchoVoiceDesignModelId)}
                                className="w-full bg-white/60 backdrop-blur-sm border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-xs focus:bg-white/80 transition-all"
                            >
                                {VOICE_DESIGN_MODELS.map(model => (
                                    <option key={model.value} value={model.value}>{model.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">音色名</label>
                            <input
                                value={draft.voiceName}
                                onChange={e => updateDraft('voiceName', e.target.value)}
                                className="w-full bg-white/60 backdrop-blur-sm border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5 text-xs focus:bg-white/80 transition-all"
                                placeholder={activeCharacter ? `${activeCharacter.name} Echo` : 'Echo Voice'}
                                {...getGuardedInputProps({ kind: 'config', field: 'tts-elevenlabs-echo-voice-name' })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <label className="text-[10px] font-bold text-[#b8aaa0] uppercase">Guidance</label>
                            <span className="text-[10px] font-mono text-[#8ba4c4]">{guidanceScale}</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={guidanceScale}
                            onChange={e => setGuidanceScale(Number(e.target.value) || 0)}
                            className="w-full accent-[#8ba4c4]"
                        />
                        <label className="flex items-center justify-between gap-3 bg-white/45 border border-[#d4e4f7]/50 rounded-xl px-3 py-2.5">
                            <span className="text-[11px] font-bold text-[#8ba4c4]">Enhance prompt</span>
                            <input
                                type="checkbox"
                                checked={shouldEnhance}
                                onChange={e => setShouldEnhance(e.target.checked)}
                                className="w-4 h-4 accent-[#8ba4c4]"
                            />
                        </label>
                    </div>

                    <button
                        type="button"
                        onClick={handleDesign}
                        disabled={isDesigning || isSuggesting}
                        className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#6f8dad] text-white disabled:opacity-45 active:scale-95 transition-transform"
                    >
                        {isDesigning ? '生成回声预览中…' : '生成 3 个回声预览'}
                    </button>

                    {previews.length > 0 && (
                        <div ref={previewListRef} className="space-y-3 rounded-3xl border border-[#d4e4f7]/60 bg-white/45 p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs font-bold text-[#6f8dad]">已生成 3 条回声预览</div>
                                    <div className="text-[10px] text-[#8ba4c4]/80">点播放试听，再选择最像的一条保存。</div>
                                </div>
                                <span className="shrink-0 rounded-full bg-[#edf6ff] px-2 py-1 text-[9px] font-bold text-[#6f8dad]">
                                    {selectedPreviewId ? '已选择' : '待选择'}
                                </span>
                            </div>

                            {previews.map((preview, index) => {
                                const isSelected = selectedPreviewId === preview.generatedVoiceId;
                                const isPlaying = playingPreviewId === preview.generatedVoiceId;
                                const previewInputId = `echo-preview-${preview.generatedVoiceId}`;

                                return (
                                    <div
                                        key={preview.generatedVoiceId}
                                        className={`rounded-2xl border px-3 py-3 transition-colors ${isSelected ? 'bg-[#edf6ff] border-[#8ba4c4]' : 'bg-white/60 border-[#d4e4f7]/50'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                id={previewInputId}
                                                type="radio"
                                                name="echo-preview"
                                                checked={isSelected}
                                                onChange={() => setSelectedPreviewId(preview.generatedVoiceId)}
                                                className="accent-[#8ba4c4]"
                                            />
                                            <label htmlFor={previewInputId} className="text-xs font-bold text-[#6f8dad]">
                                                回声 {index + 1}
                                            </label>
                                            <span className="ml-auto max-w-[120px] truncate text-[9px] font-mono text-[#8ba4c4]/70">
                                                {preview.generatedVoiceId}
                                            </span>
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handlePlayPreview(preview)}
                                                disabled={!preview.audioUrl}
                                                aria-label={`播放回声 ${index + 1} 试听`}
                                                className="rounded-xl bg-[#6f8dad] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-45 active:scale-95 transition-transform"
                                            >
                                                {isPlaying ? '重新播放' : '播放试听'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedPreviewId(preview.generatedVoiceId)}
                                                className={`rounded-xl border px-3 py-2 text-[11px] font-bold active:scale-95 transition-transform ${isSelected ? 'border-[#8ba4c4] bg-white text-[#6f8dad]' : 'border-[#d4e4f7]/70 bg-white/70 text-[#8ba4c4]'}`}
                                            >
                                                {isSelected ? '已选中' : '选择这条'}
                                            </button>
                                        </div>

                                        {!preview.audioUrl && (
                                            <div className="mt-2 text-[10px] text-amber-600">这个预览没有返回音频。</div>
                                        )}
                                    </div>
                                );
                            })}

                            <button
                                type="button"
                                onClick={handleSaveVoice}
                                disabled={isSaving || !selectedPreviewId}
                                className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#9b7e8f] text-white disabled:opacity-45 active:scale-95 transition-transform"
                            >
                                {isSaving ? '保存 Voice ID 中…' : '保存选中回声为 Voice ID'}
                            </button>
                        </div>
                    )}

                    {createdVoice && (
                        <div className="space-y-2 bg-[#f0eaf7]/50 border border-[#e5ddf0]/50 rounded-2xl px-3 py-3">
                            <div className="text-[10px] font-bold text-[#a18db8] uppercase">已创建 Voice ID</div>
                            <div className="text-[11px] font-mono text-[#6f5f7a] break-all">{createdVoice.voiceId}</div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        set('elevenLabsVoiceId', createdVoice.voiceId);
                                        addToast('已填入默认 Voice ID，点底部保存配置后生效', 'success');
                                    }}
                                    className="py-2 rounded-xl text-[10px] font-bold bg-white/70 text-[#9b7e8f] border border-white/60"
                                >
                                    填入默认
                                </button>
                                <button
                                    type="button"
                                    onClick={bindCreatedVoiceToCharacter}
                                    disabled={!activeCharacter}
                                    className="py-2 rounded-xl text-[10px] font-bold bg-white/70 text-[#6f8dad] border border-white/60 disabled:opacity-45"
                                >
                                    绑定当前角色
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </details>
        </div>
    );
};

export default React.memo(TtsEchoSection);
