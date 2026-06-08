/**
 * Zhaixinglou (摘星楼) — Isolated State Management
 * 
 * Uses useReducer for complex state, completely sandboxed from main app.
 * Secondary API config persists to localStorage independently.
 */
import { useReducer,useEffect,useCallback } from 'react';

// --- Types ---
export interface SecondaryAPIConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

export interface SecondaryApiPreset {
    id: string;
    name: string;
    config: SecondaryAPIConfig;
}

export type ViewState = 'select' | 'menu' | 'starMirror' | 'starOrbit' | 'starCalendar' | 'akashicShadows';

export interface SelectedCard {
    type: 'user' | 'character';
    characterId?: string;
    name: string;
    avatar: string;
}

export interface ZhaixinglouState {
    viewState: ViewState;
    selectedCard: SelectedCard | null;
    // Secondary API
    secondaryApiConfig: SecondaryAPIConfig;
    secondaryApiPresets: SecondaryApiPreset[];
    secondaryAvailableModels: string[];
    // Feature data
    fateChatMessages: { role: 'user' | 'assistant' | 'system'; content: string }[];
    isLoading: boolean;
    showApiSettings: boolean;
    // 星盘缓存：key 为 'user' | 'char_<id>' | 'synastry_<id>'——会话级，不持久化
    cachedAstroData: Record<string, string>;
}

// --- Actions ---
type Action =
    | { type: 'SET_VIEW'; view: ViewState }
    | { type: 'SELECT_CARD'; card: SelectedCard }
    | { type: 'CLEAR_SELECTION' }
    | { type: 'SET_SECONDARY_API'; config: Partial<SecondaryAPIConfig> }
    | { type: 'SET_SECONDARY_PRESETS'; presets: SecondaryApiPreset[] }
    | { type: 'ADD_SECONDARY_PRESET'; preset: SecondaryApiPreset }
    | { type: 'REMOVE_SECONDARY_PRESET'; id: string }
    | { type: 'SET_SECONDARY_MODELS'; models: string[] }
    | { type: 'ADD_FATE_MESSAGE'; message: { role: 'user' | 'assistant' | 'system'; content: string } }
    | { type: 'SET_FATE_MESSAGES'; messages: { role: 'user' | 'assistant' | 'system'; content: string }[] }
    | { type: 'CLEAR_FATE_CHAT' }
    | { type: 'SET_LOADING'; loading: boolean }
    | { type: 'TOGGLE_API_SETTINGS' }
    | { type: 'CACHE_ASTRO_DATA'; key: string; text: string };

// --- localStorage Keys ---
const LS_API_CONFIG = 'zhaixinglou_secondary_api_config';
const LS_API_PRESETS = 'zhaixinglou_secondary_api_presets';
const LS_API_MODELS = 'zhaixinglou_secondary_models';

// --- Initial State ---
function loadInitialState(): ZhaixinglouState {
    let apiConfig: SecondaryAPIConfig = { baseUrl: '', apiKey: '', model: '' };
    let apiPresets: SecondaryApiPreset[] = [];
    let models: string[] = [];

    try {
        const savedConfig = localStorage.getItem(LS_API_CONFIG);
        if (savedConfig) apiConfig = JSON.parse(savedConfig);
        const savedPresets = localStorage.getItem(LS_API_PRESETS);
        if (savedPresets) apiPresets = JSON.parse(savedPresets);
        const savedModels = localStorage.getItem(LS_API_MODELS);
        if (savedModels) models = JSON.parse(savedModels);
    } catch { /* ignore corrupt data */ }

    return {
        viewState: 'select',
        selectedCard: null,
        secondaryApiConfig: apiConfig,
        secondaryApiPresets: apiPresets,
        secondaryAvailableModels: models,
        fateChatMessages: [],
        isLoading: false,
        showApiSettings: false,
        cachedAstroData: {},
    };
}

// --- Reducer (PURE — no side effects) ---
function reducer(state: ZhaixinglouState, action: Action): ZhaixinglouState {
    switch (action.type) {
        case 'SET_VIEW':
            return { ...state, viewState: action.view };
        case 'SELECT_CARD':
            return { ...state, selectedCard: action.card, viewState: 'menu' };
        case 'CLEAR_SELECTION':
            return { ...state, selectedCard: null, viewState: 'select', fateChatMessages: [] };
        case 'SET_SECONDARY_API': {
            const newConfig = { ...state.secondaryApiConfig, ...action.config };
            return { ...state, secondaryApiConfig: newConfig };
        }
        case 'SET_SECONDARY_PRESETS':
            return { ...state, secondaryApiPresets: action.presets };
        case 'ADD_SECONDARY_PRESET': {
            const newPresets = [...state.secondaryApiPresets, action.preset];
            return { ...state, secondaryApiPresets: newPresets };
        }
        case 'REMOVE_SECONDARY_PRESET': {
            const filtered = state.secondaryApiPresets.filter(p => p.id !== action.id);
            return { ...state, secondaryApiPresets: filtered };
        }
        case 'SET_SECONDARY_MODELS':
            return { ...state, secondaryAvailableModels: action.models };
        case 'ADD_FATE_MESSAGE':
            return { ...state, fateChatMessages: [...state.fateChatMessages, action.message] };
        case 'SET_FATE_MESSAGES':
            return { ...state, fateChatMessages: action.messages };
        case 'CLEAR_FATE_CHAT':
            return { ...state, fateChatMessages: [] };
        case 'SET_LOADING':
            return { ...state, isLoading: action.loading };
        case 'TOGGLE_API_SETTINGS':
            return { ...state, showApiSettings: !state.showApiSettings };
        case 'CACHE_ASTRO_DATA':
            return { ...state, cachedAstroData: { ...state.cachedAstroData, [action.key]: action.text } };
        default:
            return state;
    }
}

// --- Hook ---
export function useZhaixinglouStore() {
    const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

    // --- Sync state → localStorage (side effects outside reducer) ---
    useEffect(() => {
        try { localStorage.setItem(LS_API_CONFIG, JSON.stringify(state.secondaryApiConfig)); } catch { }
    }, [state.secondaryApiConfig]);

    useEffect(() => {
        try { localStorage.setItem(LS_API_PRESETS, JSON.stringify(state.secondaryApiPresets)); } catch { }
    }, [state.secondaryApiPresets]);

    useEffect(() => {
        try { localStorage.setItem(LS_API_MODELS, JSON.stringify(state.secondaryAvailableModels)); } catch { }
    }, [state.secondaryAvailableModels]);

    const goBack = useCallback(() => {
        switch (state.viewState) {
            case 'menu':
                dispatch({ type: 'CLEAR_SELECTION' });
                break;
            case 'starMirror':
            case 'starOrbit':
            case 'starCalendar':
            case 'akashicShadows':
                dispatch({ type: 'SET_VIEW', view: 'menu' });
                break;
            default:
                break;
        }
    }, [state.viewState]);

    return { state, dispatch, goBack };
}
