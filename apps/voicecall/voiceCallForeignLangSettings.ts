export interface VoiceCallForeignLangConfig {
    sourceLang: string;
    targetLang: string;
}

interface StoredVoiceCallForeignLangConfig extends VoiceCallForeignLangConfig {
    enabled: boolean;
}

export const VOICE_CALL_FOREIGN_LANG_STORAGE_KEY = 'voicecall_foreign_lang_config';

const DEFAULT_SOURCE_LANG = '日本語';
const DEFAULT_TARGET_LANG = '中文';

function getStorage(): Storage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

function cleanLang(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readStoredConfig(): Partial<StoredVoiceCallForeignLangConfig> | null {
    const storage = getStorage();
    if (!storage) return null;

    try {
        const raw = storage.getItem(VOICE_CALL_FOREIGN_LANG_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function getVoiceCallForeignLangDraft(): VoiceCallForeignLangConfig {
    const storage = getStorage();
    const stored = readStoredConfig();

    return {
        sourceLang: cleanLang(
            stored?.sourceLang,
            storage?.getItem('chat_translate_source_lang') || DEFAULT_SOURCE_LANG,
        ),
        targetLang: cleanLang(
            stored?.targetLang,
            storage?.getItem('chat_translate_lang') || DEFAULT_TARGET_LANG,
        ),
    };
}

export function loadVoiceCallForeignLangConfig(): VoiceCallForeignLangConfig | null {
    const stored = readStoredConfig();
    if (stored?.enabled !== true) {
        return null;
    }

    return getVoiceCallForeignLangDraft();
}

export function saveVoiceCallForeignLangConfig(config: VoiceCallForeignLangConfig | null): void {
    const storage = getStorage();
    if (!storage) return;

    const draft = config || getVoiceCallForeignLangDraft();
    const next: StoredVoiceCallForeignLangConfig = {
        enabled: !!config,
        sourceLang: cleanLang(draft.sourceLang, DEFAULT_SOURCE_LANG),
        targetLang: cleanLang(draft.targetLang, DEFAULT_TARGET_LANG),
    };

    try {
        storage.setItem(VOICE_CALL_FOREIGN_LANG_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Ignore localStorage failures; the current React state still drives this call.
    }
}
