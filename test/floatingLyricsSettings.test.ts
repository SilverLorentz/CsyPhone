// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
    DEFAULT_LYRIC_TEXT_COLOR,
    LYRIC_SETTINGS_KEY,
    readFloatingLyricsSettings,
    updateFloatingLyricsSettings,
} from '../components/os/floatingLyricsSettings';

describe('floatingLyricsSettings', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('enables floating lyrics by default for fresh users', () => {
        expect(readFloatingLyricsSettings()).toEqual({
            enabled: true,
            position: 'bottom',
            showTranslation: true,
            opacity: 0.85,
            textColor: DEFAULT_LYRIC_TEXT_COLOR,
        });
    });

    it('migrates legacy stored settings and preserves prior toggles', () => {
        localStorage.setItem(LYRIC_SETTINGS_KEY, JSON.stringify({
            enabled: false,
            position: 'top',
            showTranslation: false,
            opacity: 0.6,
        }));

        expect(readFloatingLyricsSettings()).toEqual({
            enabled: false,
            position: 'top',
            showTranslation: false,
            opacity: 0.6,
            textColor: DEFAULT_LYRIC_TEXT_COLOR,
        });
    });

    it('persists customized lyric text colors', () => {
        updateFloatingLyricsSettings({ textColor: '#7c3aed' });

        expect(readFloatingLyricsSettings().textColor).toBe('#7c3aed');
    });
});
