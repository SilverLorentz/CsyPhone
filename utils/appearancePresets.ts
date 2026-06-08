import { AppearancePreset,OSTheme } from '../types';
import { loadJSZip } from './lazyThirdParty';

export const APPEARANCE_PRESET_ASSET_PREFIX = 'appearance_preset_';
export const APPEARANCE_PRESET_FILE_TYPE = 'sully_appearance_preset';
export const APPEARANCE_PRESET_VERSION = 1;

const WIDGET_ASSET_PREFIX = 'widget_';
const DECORATION_ASSET_PREFIX = 'deco_';
const ICON_ASSET_PREFIX = 'icon_';
const INPUT_EFFECT_ASSET_ID = 'input_effect_asset';
const ALLOWED_WIDGET_SLOTS = new Set(['tl', 'tr', 'wide']);

type AssetRecord = { id: string; data: string };

export interface AppearanceAssetStore {
    getAllAssets: () => Promise<AssetRecord[]>;
    saveAsset: (id: string, data: string) => Promise<void>;
    deleteAsset: (id: string) => Promise<void>;
}

export function sanitizeAppearanceTheme(theme: OSTheme): OSTheme {
    const next: OSTheme = { ...theme, launcherWidgetImage: undefined };

    if (typeof next.hue !== 'number') next.hue = 245;
    if (typeof next.saturation !== 'number') next.saturation = 25;
    if (typeof next.lightness !== 'number') next.lightness = 65;
    if (typeof next.wallpaper !== 'string') next.wallpaper = '';
    next.darkMode = next.darkMode === true;
    if (next.contentColor !== undefined && typeof next.contentColor !== 'string') next.contentColor = undefined;
    if (next.customFont !== undefined && typeof next.customFont !== 'string') next.customFont = undefined;
    if (next.inputEffectEnabled !== undefined && typeof next.inputEffectEnabled !== 'boolean') next.inputEffectEnabled = undefined;
    if (next.inputEffectAsset !== undefined && typeof next.inputEffectAsset !== 'string') next.inputEffectAsset = undefined;
    if (next.inputEffectScale !== undefined) {
        next.inputEffectScale = typeof next.inputEffectScale === 'number'
            ? Math.min(Math.max(next.inputEffectScale, 0.5), 2)
            : undefined;
    }
    if (next.inputEffectOpacity !== undefined) {
        next.inputEffectOpacity = typeof next.inputEffectOpacity === 'number'
            ? Math.min(Math.max(next.inputEffectOpacity, 0.2), 1)
            : undefined;
    }
    if (next.inputEffectOffsetX !== undefined) {
        next.inputEffectOffsetX = typeof next.inputEffectOffsetX === 'number'
            ? Math.min(Math.max(next.inputEffectOffsetX, -120), 120)
            : undefined;
    }
    if (next.inputEffectOffsetY !== undefined) {
        next.inputEffectOffsetY = typeof next.inputEffectOffsetY === 'number'
            ? Math.min(Math.max(next.inputEffectOffsetY, -120), 120)
            : undefined;
    }
    if (next.inputEffectDuration !== undefined) {
        next.inputEffectDuration = typeof next.inputEffectDuration === 'number'
            ? Math.min(Math.max(next.inputEffectDuration, 0.35), 3)
            : undefined;
    }
    if (next.inputEffectSpinSpeed !== undefined) {
        next.inputEffectSpinSpeed = typeof next.inputEffectSpinSpeed === 'number'
            ? Math.min(Math.max(next.inputEffectSpinSpeed, 0), 3)
            : undefined;
    }
    if (next.customIconFrame !== undefined && typeof next.customIconFrame !== 'boolean') next.customIconFrame = undefined;

    if (next.launcherWidgets && typeof next.launcherWidgets === 'object') {
        const cleanWidgets: Record<string, string> = {};
        for (const [slot, value] of Object.entries(next.launcherWidgets)) {
            if (ALLOWED_WIDGET_SLOTS.has(slot) && typeof value === 'string' && value) {
                cleanWidgets[slot] = value;
            }
        }
        next.launcherWidgets = Object.keys(cleanWidgets).length > 0 ? cleanWidgets : undefined;
    }

    if (Array.isArray(next.desktopDecorations)) {
        next.desktopDecorations = next.desktopDecorations.filter(deco => {
            return !!deco
                && typeof deco.id === 'string'
                && (deco.type === 'image' || deco.type === 'preset')
                && typeof deco.content === 'string'
                && deco.content !== '';
        });
    }

    return next;
}

export function stripAppearanceThemeForLocalStorage(theme: OSTheme): OSTheme {
    const next = sanitizeAppearanceTheme(theme);
    const lsTheme: OSTheme = { ...next };

    if (typeof lsTheme.wallpaper === 'string' && lsTheme.wallpaper.startsWith('data:')) {
        lsTheme.wallpaper = '';
    }

    if (lsTheme.launcherWidgets) {
        const cleanWidgets: Record<string, string> = {};
        for (const [slot, value] of Object.entries(lsTheme.launcherWidgets)) {
            cleanWidgets[slot] = value && value.startsWith('data:') ? '' : value;
        }
        lsTheme.launcherWidgets = Object.keys(cleanWidgets).length > 0 ? cleanWidgets : undefined;
    }

    if (lsTheme.desktopDecorations) {
        lsTheme.desktopDecorations = lsTheme.desktopDecorations.map(deco => ({
            ...deco,
            content: deco.type === 'image' && deco.content.startsWith('data:') ? '' : deco.content,
        }));
    }

    if (typeof lsTheme.customFont === 'string' && lsTheme.customFont.startsWith('data:')) {
        lsTheme.customFont = '';
    }

    if (typeof lsTheme.inputEffectAsset === 'string' && lsTheme.inputEffectAsset.startsWith('data:')) {
        lsTheme.inputEffectAsset = '';
    }

    lsTheme.launcherWidgetImage = undefined;
    return lsTheme;
}

export function createAppearancePreset(name: string, theme: OSTheme, customIcons: Record<string, string>): AppearancePreset {
    return {
        id: `ap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        createdAt: Date.now(),
        theme: sanitizeAppearanceTheme(theme),
        customIcons: Object.keys(customIcons).length > 0 ? { ...customIcons } : undefined,
    };
}

export function parseStoredAppearancePresets(assets: AssetRecord[]): AppearancePreset[] {
    const presets: AppearancePreset[] = [];

    for (const asset of assets || []) {
        if (!asset?.id?.startsWith(APPEARANCE_PRESET_ASSET_PREFIX)) continue;
        try {
            const raw = typeof asset.data === 'string' ? JSON.parse(asset.data) : asset.data;
            const preset = normalizeAppearancePreset(raw);
            presets.push(preset);
        } catch {
            // Ignore malformed legacy records.
        }
    }

    return presets.sort((a, b) => b.createdAt - a.createdAt);
}

export async function exportAppearancePresetBlob(preset: AppearancePreset): Promise<Blob> {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    zip.file('preset.json', JSON.stringify({
        type: APPEARANCE_PRESET_FILE_TYPE,
        version: APPEARANCE_PRESET_VERSION,
        ...preset,
        theme: sanitizeAppearanceTheme(preset.theme),
    }, null, 2));
    return zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
    } as any);
}

export async function importAppearancePresetFromFile(file: File): Promise<AppearancePreset> {
    const raw = await readAppearancePresetPayload(file);
    if (raw?.type !== APPEARANCE_PRESET_FILE_TYPE) {
        throw new Error('无效的外观预设文件');
    }
    if (!raw.theme || typeof raw.theme !== 'object') {
        throw new Error('外观预设缺少 theme');
    }

    return normalizeAppearancePreset({
        id: `ap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '导入的预设',
        createdAt: Date.now(),
        theme: raw.theme,
        customIcons: raw.customIcons,
    });
}

export async function replaceAppearancePresetAssets(store: AppearanceAssetStore, preset: AppearancePreset): Promise<void> {
    const assets = await store.getAllAssets();
    for (const asset of assets || []) {
        if (!asset?.id) continue;
        if (
            asset.id === 'wallpaper'
            || asset.id === 'launcherWidgetImage'
            || asset.id === INPUT_EFFECT_ASSET_ID
            || asset.id === 'custom_font_data'
            || asset.id.startsWith(ICON_ASSET_PREFIX)
            || asset.id.startsWith(WIDGET_ASSET_PREFIX)
            || asset.id.startsWith(DECORATION_ASSET_PREFIX)
        ) {
            await store.deleteAsset(asset.id);
        }
    }

    const theme = sanitizeAppearanceTheme(preset.theme);
    if (theme.wallpaper && theme.wallpaper.startsWith('data:')) {
        await store.saveAsset('wallpaper', theme.wallpaper);
    }

    if (theme.launcherWidgets) {
        for (const [slot, value] of Object.entries(theme.launcherWidgets)) {
            if (value && value.startsWith('data:')) {
                await store.saveAsset(`${WIDGET_ASSET_PREFIX}${slot}`, value);
            }
        }
    }

    if (theme.desktopDecorations) {
        for (const deco of theme.desktopDecorations) {
            if (deco.type === 'image' && deco.content && deco.content.startsWith('data:')) {
                await store.saveAsset(`${DECORATION_ASSET_PREFIX}${deco.id}`, deco.content);
            }
        }
    }

    if (theme.customFont && theme.customFont.startsWith('data:')) {
        await store.saveAsset('custom_font_data', theme.customFont);
    }

    if (theme.inputEffectAsset && theme.inputEffectAsset.startsWith('data:')) {
        await store.saveAsset(INPUT_EFFECT_ASSET_ID, theme.inputEffectAsset);
    }

    if (preset.customIcons) {
        for (const [appId, iconUrl] of Object.entries(preset.customIcons)) {
            if (typeof iconUrl === 'string' && iconUrl) {
                await store.saveAsset(`${ICON_ASSET_PREFIX}${appId}`, iconUrl);
            }
        }
    }
}

function normalizeAppearancePreset(raw: any): AppearancePreset {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid appearance preset');
    if (!raw.theme || typeof raw.theme !== 'object') throw new Error('Invalid appearance preset theme');

    const customIcons: Record<string, string> = {};
    if (raw.customIcons && typeof raw.customIcons === 'object') {
        for (const [appId, iconUrl] of Object.entries(raw.customIcons)) {
            if (typeof appId === 'string' && typeof iconUrl === 'string' && iconUrl) {
                customIcons[appId] = iconUrl;
            }
        }
    }

    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : `ap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '未命名预设',
        createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
        theme: sanitizeAppearanceTheme(raw.theme as OSTheme),
        customIcons: Object.keys(customIcons).length > 0 ? customIcons : undefined,
    };
}

async function readAppearancePresetPayload(file: File): Promise<any> {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const isZip = head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07);

    if (!isZip) {
        return JSON.parse(await file.text());
    }

    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(file);
    const files = (zip as any).files || {};
    const entry = zip.file('preset.json') || Object.values(files).find((item: any) => !item.dir && /\.json$/i.test(item.name));
    if (!entry) throw new Error('压缩包内未找到 preset.json');
    return JSON.parse(await (entry as any).async('string'));
}
