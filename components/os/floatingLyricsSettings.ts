export type LyricPosition = 'top' | 'center' | 'bottom';

export interface FloatingLyricsSettings {
    enabled: boolean;
    position: LyricPosition;
    showTranslation: boolean;
    opacity: number;
    textColor: string;
}

export const LYRIC_SETTINGS_KEY = 'floating_lyrics_settings';
export const DEFAULT_LYRIC_TEXT_COLOR = '#ffffff';
export const LYRIC_TEXT_COLOR_PRESETS = [
    { label: '默认', value: '#ffffff' },
    { label: '玫红', value: '#ff7aa2' },
    { label: '青绿', value: '#7ef7d4' },
    { label: '金色', value: '#ffd166' },
    { label: '紫雾', value: '#b794f6' },
] as const;

export const DEFAULT_FLOATING_LYRICS_SETTINGS: FloatingLyricsSettings = {
    enabled: true,
    position: 'bottom',
    showTranslation: true,
    opacity: 0.85,
    textColor: DEFAULT_LYRIC_TEXT_COLOR,
};

function isLyricPosition(value: unknown): value is LyricPosition {
    return value === 'top' || value === 'center' || value === 'bottom';
}

function normalizeHexColor(value: unknown): string {
    if (typeof value !== 'string') {
        return DEFAULT_LYRIC_TEXT_COLOR;
    }

    const trimmed = value.trim();
    if (/^#[\da-fA-F]{6}$/.test(trimmed)) {
        return trimmed.toLowerCase();
    }

    if (/^#[\da-fA-F]{3}$/.test(trimmed)) {
        const hex = trimmed.slice(1);
        return `#${hex
            .split('')
            .map((char) => `${char}${char}`)
            .join('')}`.toLowerCase();
    }

    return DEFAULT_LYRIC_TEXT_COLOR;
}

function clampOpacity(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_FLOATING_LYRICS_SETTINGS.opacity;
    }

    return Math.max(0, Math.min(1, value));
}

export function readFloatingLyricsSettings(): FloatingLyricsSettings {
    try {
        const raw = localStorage.getItem(LYRIC_SETTINGS_KEY);
        if (!raw) {
            return { ...DEFAULT_FLOATING_LYRICS_SETTINGS };
        }

        const parsed = JSON.parse(raw) as Partial<FloatingLyricsSettings>;

        return {
            enabled:
                typeof parsed.enabled === 'boolean'
                    ? parsed.enabled
                    : DEFAULT_FLOATING_LYRICS_SETTINGS.enabled,
            position: isLyricPosition(parsed.position)
                ? parsed.position
                : DEFAULT_FLOATING_LYRICS_SETTINGS.position,
            showTranslation:
                typeof parsed.showTranslation === 'boolean'
                    ? parsed.showTranslation
                    : DEFAULT_FLOATING_LYRICS_SETTINGS.showTranslation,
            opacity: clampOpacity(parsed.opacity),
            textColor: normalizeHexColor(parsed.textColor),
        };
    } catch {
        return { ...DEFAULT_FLOATING_LYRICS_SETTINGS };
    }
}

function notifyFloatingLyricsSettingsChanged(): void {
    window.dispatchEvent(new Event('storage'));
}

export function writeFloatingLyricsSettings(
    settings: FloatingLyricsSettings,
): FloatingLyricsSettings {
    try {
        localStorage.setItem(LYRIC_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // Ignore storage failures.
    }

    notifyFloatingLyricsSettingsChanged();
    return settings;
}

export function updateFloatingLyricsSettings(
    patch: Partial<FloatingLyricsSettings>,
): FloatingLyricsSettings {
    const current = readFloatingLyricsSettings();
    const next: FloatingLyricsSettings = {
        enabled:
            typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
        position: isLyricPosition(patch.position)
            ? patch.position
            : current.position,
        showTranslation:
            typeof patch.showTranslation === 'boolean'
                ? patch.showTranslation
                : current.showTranslation,
        opacity:
            patch.opacity === undefined ? current.opacity : clampOpacity(patch.opacity),
        textColor:
            patch.textColor === undefined
                ? current.textColor
                : normalizeHexColor(patch.textColor),
    };

    return writeFloatingLyricsSettings(next);
}

export function toggleFloatingLyricsEnabled(): FloatingLyricsSettings {
    const current = readFloatingLyricsSettings();
    return writeFloatingLyricsSettings({
        ...current,
        enabled: !current.enabled,
    });
}

function hexToRgbChannels(hexColor: string): [number, number, number] {
    const normalized = normalizeHexColor(hexColor);
    return [
        Number.parseInt(normalized.slice(1, 3), 16),
        Number.parseInt(normalized.slice(3, 5), 16),
        Number.parseInt(normalized.slice(5, 7), 16),
    ];
}

function rgba(hexColor: string, alpha: number): string {
    const [red, green, blue] = hexToRgbChannels(hexColor);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function getLyricColorVars(
    textColor: string,
): Record<
    | '--lyric-color-active'
    | '--lyric-color-idle'
    | '--lyric-color-translation'
    | '--lyric-color-active-translation'
    | '--lyric-color-glow',
    string
> {
    const normalized = normalizeHexColor(textColor);

    return {
        '--lyric-color-active': normalized,
        '--lyric-color-idle': rgba(normalized, 0.42),
        '--lyric-color-translation': rgba(normalized, 0.24),
        '--lyric-color-active-translation': rgba(normalized, 0.72),
        '--lyric-color-glow': rgba(normalized, 0.32),
    };
}
