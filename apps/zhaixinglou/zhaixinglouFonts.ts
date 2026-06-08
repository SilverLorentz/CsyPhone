import { useCallback,useEffect,useState } from 'react';
import { deleteAsset,getAsset,saveAsset } from '../../utils/db/contentStore';

export const ZHAIXINGLOU_FONT_SLOTS = ['title','accent','bodyCn','tarot','script','note'] as const;

export type ZhaixinglouFontSlot = typeof ZHAIXINGLOU_FONT_SLOTS[number];

export interface ZhaixinglouFontSlotMeta {
    label: string;
    hint: string;
    family: string;
}

export interface ZhaixinglouFontSetting {
    source: 'asset' | 'url';
    assetKey?: string;
    fileName?: string;
    url?: string;
    updatedAt: number;
}

export type ZhaixinglouFontSettings = Partial<Record<ZhaixinglouFontSlot,ZhaixinglouFontSetting>>;

const STORAGE_KEY = 'zhaixinglou_font_settings';
const STYLE_ID = 'zhaixinglou-custom-font-style';
const ASSET_PREFIX = 'zhaixinglou_font_';
const MAX_FONT_FILE_BYTES = 30 * 1024 * 1024;

export const ZHAIXINGLOU_FONT_ACCEPT = '.ttf,.otf,.woff,.woff2';

export const ZHAIXINGLOU_FONT_SLOT_META: Record<ZhaixinglouFontSlot,ZhaixinglouFontSlotMeta> = {
    title: {
        label: '标题字体',
        hint: 'Tower of Stars、标题、星座结果',
        family: 'ZhaixinglouTitle',
    },
    accent: {
        label: '装饰英文字体',
        hint: '按钮、标签、小标题、装饰文字',
        family: 'ZhaixinglouFont',
    },
    bodyCn: {
        label: '中文正文字体',
        hint: '中文正文、页面默认字、分享卡正文',
        family: 'ZhaixinglouCN',
    },
    tarot: {
        label: '塔罗牌面字体',
        hint: '塔罗牌牌面符号与牌名',
        family: 'TarotFont',
    },
    script: {
        label: '手写英文字体',
        hint: '阿卡西暗影里的手写英文装饰',
        family: 'Dancing Script',
    },
    note: {
        label: '便签提示字体',
        hint: '星象仪表盘提示、手写感说明',
        family: 'NoteFont',
    },
};

const SLOT_SET = new Set<ZhaixinglouFontSlot>(ZHAIXINGLOU_FONT_SLOTS);

export function getZhaixinglouFontAssetKey(slot: ZhaixinglouFontSlot): string {
    return `${ASSET_PREFIX}${slot}`;
}

export function sanitizeZhaixinglouFontSettings(value: unknown): ZhaixinglouFontSettings {
    const rawSlots = typeof value === 'object' && value !== null && 'slots' in value
        ? (value as { slots?: unknown }).slots
        : value;

    if (!rawSlots || typeof rawSlots !== 'object') return {};

    const clean: ZhaixinglouFontSettings = {};
    for (const [slotKey, rawSetting] of Object.entries(rawSlots as Record<string,unknown>)) {
        if (!SLOT_SET.has(slotKey as ZhaixinglouFontSlot) || !rawSetting || typeof rawSetting !== 'object') {
            continue;
        }

        const slot = slotKey as ZhaixinglouFontSlot;
        const setting = rawSetting as Record<string,unknown>;
        const updatedAt = typeof setting.updatedAt === 'number' ? setting.updatedAt : Date.now();

        if (setting.source === 'asset') {
            clean[slot] = {
                source: 'asset',
                assetKey: typeof setting.assetKey === 'string' && setting.assetKey ? setting.assetKey : getZhaixinglouFontAssetKey(slot),
                fileName: typeof setting.fileName === 'string' ? setting.fileName : undefined,
                updatedAt,
            };
        } else if (setting.source === 'url' && typeof setting.url === 'string' && isValidFontUrl(setting.url)) {
            clean[slot] = {
                source: 'url',
                url: setting.url.trim(),
                updatedAt,
            };
        }
    }

    return clean;
}

export function readStoredZhaixinglouFontSettings(): ZhaixinglouFontSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? sanitizeZhaixinglouFontSettings(JSON.parse(raw)) : {};
    } catch {
        return {};
    }
}

function writeStoredZhaixinglouFontSettings(settings: ZhaixinglouFontSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, slots: settings }));
}

export function isValidFontUrl(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    try {
        const url = new URL(trimmed);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

export function validateZhaixinglouFontFile(file: File): void {
    const name = file.name.toLowerCase();
    const hasFontExtension = ['.ttf','.otf','.woff','.woff2'].some(ext => name.endsWith(ext));
    if (!hasFontExtension) {
        throw new Error('只支持 .ttf / .otf / .woff / .woff2 字体文件');
    }
    if (file.size > MAX_FONT_FILE_BYTES) {
        throw new Error('字体文件不能超过 30MB');
    }
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('字体文件读取失败'));
        };
        reader.onerror = () => reject(new Error('字体文件读取失败'));
        reader.readAsDataURL(file);
    });
}

export function createZhaixinglouFontFaceCss(fontUrls: Partial<Record<ZhaixinglouFontSlot,string>>): string {
    return ZHAIXINGLOU_FONT_SLOTS
        .map(slot => {
            const url = fontUrls[slot];
            if (!url) return '';
            const family = ZHAIXINGLOU_FONT_SLOT_META[slot].family;
            return [
                '@font-face {',
                `  font-family: ${JSON.stringify(family)};`,
                `  src: url(${JSON.stringify(url)});`,
                '  font-display: swap;',
                '}',
            ].join('\n');
        })
        .filter(Boolean)
        .join('\n\n');
}

async function resolveFontUrls(settings: ZhaixinglouFontSettings): Promise<Partial<Record<ZhaixinglouFontSlot,string>>> {
    const fontUrls: Partial<Record<ZhaixinglouFontSlot,string>> = {};
    await Promise.all(ZHAIXINGLOU_FONT_SLOTS.map(async slot => {
        const setting = settings[slot];
        if (!setting) return;

        if (setting.source === 'url' && setting.url && isValidFontUrl(setting.url)) {
            fontUrls[slot] = setting.url.trim();
            return;
        }

        if (setting.source === 'asset') {
            const dataUrl = await getAsset(setting.assetKey || getZhaixinglouFontAssetKey(slot));
            if (dataUrl) fontUrls[slot] = dataUrl;
        }
    }));
    return fontUrls;
}

async function applyZhaixinglouFontSettings(settings: ZhaixinglouFontSettings): Promise<void> {
    if (typeof document === 'undefined') return;

    const fontUrls = await resolveFontUrls(settings);
    let style = document.getElementById(STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }
    style.textContent = createZhaixinglouFontFaceCss(fontUrls);

    if (document.fonts?.load) {
        await Promise.all(ZHAIXINGLOU_FONT_SLOTS.map(slot => {
            const family = ZHAIXINGLOU_FONT_SLOT_META[slot].family;
            return document.fonts.load(`1em ${JSON.stringify(family)}`).catch(() => undefined);
        }));
    }
}

export function useZhaixinglouFonts() {
    const [settings, setSettings] = useState<ZhaixinglouFontSettings>({});
    const [isLoading, setIsLoading] = useState(true);

    const commitSettings = useCallback(async (next: ZhaixinglouFontSettings) => {
        const clean = sanitizeZhaixinglouFontSettings(next);
        writeStoredZhaixinglouFontSettings(clean);
        setSettings(clean);
        await applyZhaixinglouFontSettings(clean);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            const stored = readStoredZhaixinglouFontSettings();
            await applyZhaixinglouFontSettings(stored);
            if (!cancelled) {
                setSettings(stored);
                setIsLoading(false);
            }
        };

        load().catch(() => {
            if (!cancelled) setIsLoading(false);
        });

        return () => { cancelled = true; };
    }, []);

    const setFontUrl = useCallback(async (slot: ZhaixinglouFontSlot, url: string) => {
        const trimmed = url.trim();
        if (!isValidFontUrl(trimmed)) throw new Error('请输入 http 或 https 字体文件链接');
        await deleteAsset(getZhaixinglouFontAssetKey(slot));
        await commitSettings({
            ...settings,
            [slot]: { source: 'url', url: trimmed, updatedAt: Date.now() },
        });
    }, [commitSettings, settings]);

    const setFontFile = useCallback(async (slot: ZhaixinglouFontSlot, file: File) => {
        validateZhaixinglouFontFile(file);
        const dataUrl = await readFileAsDataUrl(file);
        const assetKey = getZhaixinglouFontAssetKey(slot);
        await saveAsset(assetKey, dataUrl);
        await commitSettings({
            ...settings,
            [slot]: { source: 'asset', assetKey, fileName: file.name, updatedAt: Date.now() },
        });
    }, [commitSettings, settings]);

    const resetFont = useCallback(async (slot: ZhaixinglouFontSlot) => {
        await deleteAsset(getZhaixinglouFontAssetKey(slot));
        const next = { ...settings };
        delete next[slot];
        await commitSettings(next);
    }, [commitSettings, settings]);

    return {
        settings,
        isLoading,
        setFontUrl,
        setFontFile,
        resetFont,
    };
}
