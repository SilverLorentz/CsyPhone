
import { useReducer,useCallback } from 'react';
import { useOS } from '../../../context/OSContext';
import type { TtsConfig } from '../../../types/tts';
import { DEFAULT_TTS_PREPROCESS_PROMPT } from '../../../types/tts';

// ─── Form State ─────────────────────────────────────────────────────────

export interface TtsFormState {
    voiceCallProvider: TtsConfig['voiceCallProvider'];
    baseUrl: string;
    apiKey: string;
    groupId: string;
    model: string;
    voiceId: string;
    speed: number;
    vol: number;
    pitch: number;
    emotion: string;
    format: string;
    sampleRate: number;
    bitrate: number;
    channel: number;
    modifyPitch: number;
    modifyIntensity: number;
    modifyTimbre: number;
    soundEffect: string;
    langBoost: string;
    pronounceDict: string;
    preprocessEnabled: boolean;
    preprocessPrompt: string;
    preprocessApiBase: string;
    preprocessApiKey: string;
    preprocessModel: string;
    elevenLabsApiKey: string;
    elevenLabsVoiceId: string;
    elevenLabsModelId: string;
    elevenLabsLanguageCode: string;
    elevenLabsStability: number;
    elevenLabsSimilarityBoost: number;
    elevenLabsStyle: number;
    elevenLabsSpeed: number;
    elevenLabsUseSpeakerBoost: boolean;
}

// ─── Reducer ────────────────────────────────────────────────────────────

type TtsAction =
    | { type: 'set'; field: keyof TtsFormState; value: any }
    | { type: 'merge'; payload: Partial<TtsFormState> };

function reducer(state: TtsFormState, action: TtsAction): TtsFormState {
    switch (action.type) {
        case 'set': return { ...state, [action.field]: action.value };
        case 'merge': return { ...state, ...action.payload };
    }
}

function initFromConfig(cfg: TtsConfig): TtsFormState {
    return {
        voiceCallProvider: cfg.voiceCallProvider || 'minimax',
        baseUrl: cfg.baseUrl || '/minimax-api',
        apiKey: cfg.apiKey,
        groupId: cfg.groupId || '',
        model: cfg.model,
        voiceId: cfg.voiceSetting.voice_id,
        speed: cfg.voiceSetting.speed,
        vol: cfg.voiceSetting.vol,
        pitch: cfg.voiceSetting.pitch,
        emotion: cfg.voiceSetting.emotion || '',
        format: cfg.audioSetting.format,
        sampleRate: cfg.audioSetting.audio_sample_rate,
        bitrate: cfg.audioSetting.bitrate,
        channel: cfg.audioSetting.channel,
        modifyPitch: cfg.voiceModify?.pitch || 0,
        modifyIntensity: cfg.voiceModify?.intensity || 0,
        modifyTimbre: cfg.voiceModify?.timbre || 0,
        soundEffect: cfg.voiceModify?.sound_effects || '',
        langBoost: cfg.languageBoost || '',
        pronounceDict: (cfg.pronunciationDict?.tone || []).join('\n'),
        preprocessEnabled: cfg.preprocessConfig.enabled,
        preprocessPrompt: cfg.preprocessConfig.prompt,
        preprocessApiBase: cfg.preprocessConfig.apiBase || '',
        preprocessApiKey: cfg.preprocessConfig.apiKey || '',
        preprocessModel: cfg.preprocessConfig.model || '',
        elevenLabsApiKey: cfg.elevenLabs.apiKey || '',
        elevenLabsVoiceId: cfg.elevenLabs.voiceId || '',
        elevenLabsModelId: cfg.elevenLabs.modelId || 'eleven_flash_v2_5',
        elevenLabsLanguageCode: cfg.elevenLabs.languageCode || '',
        elevenLabsStability: cfg.elevenLabs.stability ?? 0.5,
        elevenLabsSimilarityBoost: cfg.elevenLabs.similarityBoost ?? 0.8,
        elevenLabsStyle: cfg.elevenLabs.style ?? 0,
        elevenLabsSpeed: cfg.elevenLabs.speed ?? 1,
        elevenLabsUseSpeakerBoost: cfg.elevenLabs.useSpeakerBoost === true,
    };
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function useTtsForm() {
    const { ttsConfig, updateTtsConfig, addToast } = useOS();
    const [form, dispatch] = useReducer(reducer, ttsConfig, initFromConfig);

    /** Stable setter — dispatch is inherently stable */
    const set = useCallback(<K extends keyof TtsFormState>(field: K, value: TtsFormState[K]) => {
        dispatch({ type: 'set', field, value });
    }, []);

    /** Merge multiple fields at once (for preset loading) */
    const merge = useCallback((payload: Partial<TtsFormState>) => {
        dispatch({ type: 'merge', payload });
    }, []);

    /** Convert form state → TtsConfig and persist */
    const save = useCallback(() => {
        updateTtsConfig({
            voiceCallProvider: form.voiceCallProvider,
            baseUrl: form.baseUrl,
            apiKey: form.apiKey,
            groupId: form.groupId,
            model: form.model,
            voiceSetting: {
                voice_id: form.voiceId,
                speed: form.speed,
                vol: form.vol,
                pitch: form.pitch,
                emotion: form.emotion || undefined,
            },
            audioSetting: {
                audio_sample_rate: form.sampleRate,
                bitrate: form.bitrate,
                format: form.format as 'mp3' | 'pcm' | 'flac',
                channel: form.channel,
            },
            voiceModify: (form.modifyPitch || form.modifyIntensity || form.modifyTimbre || form.soundEffect)
                ? { pitch: form.modifyPitch, intensity: form.modifyIntensity, timbre: form.modifyTimbre, sound_effects: form.soundEffect || undefined }
                : undefined,
            languageBoost: form.langBoost || undefined,
            pronunciationDict: form.pronounceDict.trim()
                ? { tone: form.pronounceDict.split('\n').filter(l => l.trim()) }
                : undefined,
            preprocessConfig: {
                enabled: form.preprocessEnabled,
                prompt: form.preprocessPrompt,
                apiBase: form.preprocessApiBase,
                apiKey: form.preprocessApiKey,
                model: form.preprocessModel,
            },
            elevenLabs: {
                apiKey: form.elevenLabsApiKey,
                voiceId: form.elevenLabsVoiceId,
                modelId: form.elevenLabsModelId,
                languageCode: form.elevenLabsLanguageCode,
                stability: form.elevenLabsStability,
                similarityBoost: form.elevenLabsSimilarityBoost,
                style: form.elevenLabsStyle,
                speed: form.elevenLabsSpeed,
                useSpeakerBoost: form.elevenLabsUseSpeakerBoost,
            },
        });
        addToast('语音合成配置已保存', 'success');
    }, [form, updateTtsConfig, addToast]);

    /** Reset preprocess prompt to default */
    const resetPreprocessPrompt = useCallback(() => {
        set('preprocessPrompt', DEFAULT_TTS_PREPROCESS_PROMPT);
    }, [set]);

    /** Build a TtsConfig from current form (for test synthesis) */
    const buildTestConfig = useCallback((): TtsConfig => ({
        voiceCallProvider: form.voiceCallProvider,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        groupId: form.groupId,
        model: form.model,
        voiceSetting: { voice_id: form.voiceId, speed: form.speed, vol: form.vol, pitch: form.pitch, emotion: form.emotion || undefined },
        audioSetting: { audio_sample_rate: form.sampleRate, bitrate: form.bitrate, format: form.format as any, channel: form.channel },
        voiceModify: (form.modifyPitch || form.modifyIntensity || form.modifyTimbre || form.soundEffect)
            ? { pitch: form.modifyPitch, intensity: form.modifyIntensity, timbre: form.modifyTimbre, sound_effects: form.soundEffect || undefined }
            : undefined,
        languageBoost: form.langBoost || undefined,
        preprocessConfig: { enabled: false, prompt: '', apiBase: '', apiKey: '', model: '' },
        elevenLabs: {
            apiKey: form.elevenLabsApiKey,
            voiceId: form.elevenLabsVoiceId,
            modelId: form.elevenLabsModelId,
            languageCode: form.elevenLabsLanguageCode,
            stability: form.elevenLabsStability,
            similarityBoost: form.elevenLabsSimilarityBoost,
            style: form.elevenLabsStyle,
            speed: form.elevenLabsSpeed,
            useSpeakerBoost: form.elevenLabsUseSpeakerBoost,
        },
    }), [form]);

    return { form, set, merge, save, resetPreprocessPrompt, buildTestConfig, ttsConfig, addToast };
}
