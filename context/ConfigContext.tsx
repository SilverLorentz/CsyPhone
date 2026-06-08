import React,{ createContext,useContext,useEffect,useState } from 'react';
import { APIConfig,ApiPreset,RealtimeConfig,TtsConfig,SttConfig,ImageApiPreset,ImageGenerationConfig,PhotoStylePreset } from '../types';
import {
    DEFAULT_RUNTIME_API_CONFIG,
    DEFAULT_RUNTIME_REALTIME_CONFIG,
    getApiPresets,
    getAvailableModels,
    getPrimaryApiConfig,
    getRealtimeConfig,
    getImageApiPresets,
    getImageGenerationConfig,
    getPhotoStylePresets,
    getSttConfig,
    getTtsConfig,
    setApiPresets,
    setAvailableModels,
    setPrimaryApiConfig,
    setRealtimeConfig,
    setImageApiPresets,
    setImageGenerationConfig,
    setPhotoStylePresets,
    setSttConfig,
    setTtsConfig,
} from '../utils/runtimeConfig';

export interface ConfigContextType {
    apiConfig: APIConfig;
    updateApiConfig: (updates: Partial<APIConfig>) => void;

    availableModels: string[];
    setAvailableModels: (models: string[]) => void;

    apiPresets: ApiPreset[];
    addApiPreset: (name: string, config: APIConfig) => void;
    removeApiPreset: (id: string) => void;

    realtimeConfig: RealtimeConfig;
    updateRealtimeConfig: (updates: Partial<RealtimeConfig>) => void;

    ttsConfig: TtsConfig;
    updateTtsConfig: (updates: Partial<TtsConfig>) => void;

    sttConfig: SttConfig;
    updateSttConfig: (updates: Partial<SttConfig>) => void;

    imageGenerationConfig: ImageGenerationConfig;
    updateImageGenerationConfig: (updates: Partial<ImageGenerationConfig>) => void;

    imageApiPresets: ImageApiPreset[];
    saveImageApiPresets: (presets: ImageApiPreset[]) => void;

    photoStylePresets: PhotoStylePreset[];
    savePhotoStylePresets: (presets: PhotoStylePreset[]) => void;
}

interface InternalConfigContextType extends ConfigContextType {
    isConfigLoaded: boolean;
    savePresets: (presets: ApiPreset[]) => void;
}

const ConfigContext = createContext<InternalConfigContextType | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [apiConfig, setApiConfig] = useState<APIConfig>(DEFAULT_RUNTIME_API_CONFIG);
    const [availableModelsState, setAvailableModelsState] = useState<string[]>([]);
    const [apiPresets, setApiPresetsState] = useState<ApiPreset[]>([]);
    const [realtimeConfig, setRealtimeConfigState] = useState<RealtimeConfig>(DEFAULT_RUNTIME_REALTIME_CONFIG);
    const [ttsConfig, setTtsConfigState] = useState<TtsConfig>(getTtsConfig());
    const [sttConfig, setSttConfigState] = useState<SttConfig>(getSttConfig());
    const [imageGenerationConfig, setImageGenerationConfigState] = useState<ImageGenerationConfig>(getImageGenerationConfig());
    const [imageApiPresets, setImageApiPresetsState] = useState<ImageApiPreset[]>(getImageApiPresets());
    const [photoStylePresets, setPhotoStylePresetsState] = useState<PhotoStylePreset[]>(getPhotoStylePresets());
    const [isConfigLoaded, setIsConfigLoaded] = useState(false);

    useEffect(() => {
        try {
            setApiConfig(getPrimaryApiConfig());
            setAvailableModelsState(getAvailableModels());
            setApiPresetsState(getApiPresets());
            setRealtimeConfigState(getRealtimeConfig());
            setTtsConfigState(getTtsConfig());
            setSttConfigState(getSttConfig());
            setImageGenerationConfigState(getImageGenerationConfig());
            setImageApiPresetsState(getImageApiPresets());
            setPhotoStylePresetsState(getPhotoStylePresets());
        } finally {
            setIsConfigLoaded(true);
        }
    }, []);

    const updateApiConfig = (updates: Partial<APIConfig>) => {
        const newConfig = { ...apiConfig, ...updates };
        setApiConfig(newConfig);
        setPrimaryApiConfig(newConfig);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('agent-config-changed'));
        }
    };

    const setAvailableModelsStateValue = (models: string[]) => {
        setAvailableModelsState(models);
        setAvailableModels(models);
    };

    const addApiPreset = (name: string, config: APIConfig) => {
        setApiPresetsState(prev => {
            const next = [...prev, { id: Date.now().toString(), name, config }];
            setApiPresets(next);
            return next;
        });
    };

    const removeApiPreset = (id: string) => {
        setApiPresetsState(prev => {
            const next = prev.filter(preset => preset.id !== id);
            setApiPresets(next);
            return next;
        });
    };

    const savePresets = (presets: ApiPreset[]) => {
        setApiPresetsState(presets);
        setApiPresets(presets);
    };

    const updateRealtimeConfig = (updates: Partial<RealtimeConfig>) => {
        const newConfig = { ...realtimeConfig, ...updates };
        setRealtimeConfigState(newConfig);
        setRealtimeConfig(newConfig);
    };

    const updateTtsConfig = (updates: Partial<TtsConfig>) => {
        setTtsConfigState(prev => {
            const newConfig: TtsConfig = {
                ...prev,
                ...updates,
                voiceSetting: { ...prev.voiceSetting, ...(updates.voiceSetting || {}) },
                audioSetting: { ...prev.audioSetting, ...(updates.audioSetting || {}) },
                preprocessConfig: { ...prev.preprocessConfig, ...(updates.preprocessConfig || {}) },
                elevenLabs: { ...prev.elevenLabs, ...(updates.elevenLabs || {}) },
            };

            if (updates.voiceModify !== undefined) {
                newConfig.voiceModify = updates.voiceModify === null
                    ? undefined
                    : { ...(prev.voiceModify || { pitch: 0, intensity: 0, timbre: 0 }), ...updates.voiceModify };
            }

            if (updates.pronunciationDict !== undefined) {
                newConfig.pronunciationDict = updates.pronunciationDict;
            }

            setTtsConfig(newConfig);
            return newConfig;
        });
    };

    const updateSttConfig = (updates: Partial<SttConfig>) => {
        setSttConfigState(prev => {
            const newConfig = { ...prev, ...updates };
            setSttConfig(newConfig);
            return newConfig;
        });
    };

    const updateImageGenerationConfig = (updates: Partial<ImageGenerationConfig>) => {
        setImageGenerationConfigState(prev => {
            const newConfig: ImageGenerationConfig = {
                ...prev,
                ...updates,
                novelai: { ...prev.novelai, ...(updates.novelai || {}) },
                openaiCompatible: { ...prev.openaiCompatible, ...(updates.openaiCompatible || {}) },
            };
            setImageGenerationConfig(newConfig);
            return getImageGenerationConfig();
        });
    };

    const saveImageApiPresets = (presets: ImageApiPreset[]) => {
        setImageApiPresets(presets);
        setImageApiPresetsState(getImageApiPresets());
    };

    const savePhotoStylePresets = (presets: PhotoStylePreset[]) => {
        setPhotoStylePresets(presets);
        setPhotoStylePresetsState(getPhotoStylePresets());
    };

    const value: InternalConfigContextType = {
        apiConfig,
        updateApiConfig,
        availableModels: availableModelsState,
        setAvailableModels: setAvailableModelsStateValue,
        apiPresets,
        addApiPreset,
        removeApiPreset,
        realtimeConfig,
        updateRealtimeConfig,
        ttsConfig,
        updateTtsConfig,
        sttConfig,
        updateSttConfig,
        imageGenerationConfig,
        updateImageGenerationConfig,
        imageApiPresets,
        saveImageApiPresets,
        photoStylePresets,
        savePhotoStylePresets,
        isConfigLoaded,
        savePresets,
    };

    return (
        <ConfigContext.Provider value={value}>
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => {
    const context = useContext(ConfigContext);
    if (context === undefined) {
        throw new Error('useConfig must be used within a ConfigProvider');
    }
    return context;
};
