// @vitest-environment jsdom

import { beforeEach,describe,expect,it } from 'vitest';
import {
    getVoiceCallForeignLangDraft,
    loadVoiceCallForeignLangConfig,
    saveVoiceCallForeignLangConfig,
    VOICE_CALL_FOREIGN_LANG_STORAGE_KEY,
} from '../apps/voicecall/voiceCallForeignLangSettings';

describe('voice call foreign-language settings', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('starts disabled while using chat translation languages as the draft defaults', () => {
        localStorage.setItem('chat_translate_source_lang', 'English');
        localStorage.setItem('chat_translate_lang', '中文');

        expect(loadVoiceCallForeignLangConfig()).toBeNull();
        expect(getVoiceCallForeignLangDraft()).toEqual({
            sourceLang: 'English',
            targetLang: '中文',
        });
    });

    it('persists enabled foreign-language mode for the next call screen mount', () => {
        saveVoiceCallForeignLangConfig({ sourceLang: '日本語', targetLang: '中文' });

        expect(loadVoiceCallForeignLangConfig()).toEqual({
            sourceLang: '日本語',
            targetLang: '中文',
        });
        expect(JSON.parse(localStorage.getItem(VOICE_CALL_FOREIGN_LANG_STORAGE_KEY) || '{}')).toMatchObject({
            enabled: true,
            sourceLang: '日本語',
            targetLang: '中文',
        });
    });

    it('keeps the last language pair as a draft when disabled', () => {
        saveVoiceCallForeignLangConfig({ sourceLang: '한국어', targetLang: '中文' });
        saveVoiceCallForeignLangConfig(null);

        expect(loadVoiceCallForeignLangConfig()).toBeNull();
        expect(getVoiceCallForeignLangDraft()).toEqual({
            sourceLang: '한국어',
            targetLang: '中文',
        });
        expect(JSON.parse(localStorage.getItem(VOICE_CALL_FOREIGN_LANG_STORAGE_KEY) || '{}')).toMatchObject({
            enabled: false,
            sourceLang: '한국어',
            targetLang: '中文',
        });
    });
});
