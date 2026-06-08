
import {
    APIConfig,
    OSTheme,
    CharacterProfile,
    ChatTheme,
    FullBackupData,
    UserProfile,
    ApiPreset,
    GroupProfile,
    Worldbook,
    NovelBook,
    Message,
    RealtimeConfig,
    TtsConfig,
    SttConfig,
    BackupMusicAssets,
    SerializedVoiceAudio,
    MemoryRecord,
    ImageGenerationConfig,
    PhotoStylePreset,
    ImageApiPreset,
    BackupExternalIndexedDbData,
} from '../types';
import { DB } from './db';
import { buildBackendHeaders,getBackendUrl } from './backendClient';
import { loadJSZip } from './lazyThirdParty';
import {
    IMAGE_API_PRESETS_KEY,
    IMAGE_GENERATION_CONFIG_KEY,
    IMAGE_GENERATION_DRAFT_CONFIG_KEY,
    PHOTO_STYLE_PRESETS_KEY,
} from './runtimeConfig';
import { safeTimeoutSignal } from './safeTimeout';

// ─── JSZip Dynamic Loader ───────────────────────────────────────────────

interface JSZipLike {
    folder: (name: string) => { file: (name: string, data: string, options?: { base64?: boolean }) => void } | null;
    file: (...args: any[]) => any;
    generateAsync: (options: { type: 'blob'; compression?: string; compressionOptions?: { level: number } }, onUpdate?: (metadata: { percent: number }) => void) => Promise<Blob>;
}

export type SystemBackupMode = 'text_only' | 'media_only' | 'full';

export interface SystemBackupOptions {
    includeVoiceAudio?: boolean;
    includeMemoryRecordAudio?: boolean;
}

export const SYSTEM_BACKUP_INCLUDE_VOICE_AUDIO_KEY = 'system_backup_include_voice_audio';
export const IMPORT_IN_PROGRESS_KEY = 'sullyos_import_in_progress_v1';

export type ImportRecoveryPhase = 'parsing' | 'assets' | 'database' | 'settings' | 'error';

export interface ImportRecoveryMarker {
    startedAt?: number;
    updatedAt?: number;
    phase?: ImportRecoveryPhase | string;
    source?: string;
    sourceSize?: number;
    current?: string;
    error?: string;
}

let importStartedAt: number | null = null;
let importSourceName: string | null = null;

function canUseImportRecoveryStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function writeImportRecoveryMarker(
    phase: ImportRecoveryPhase,
    source?: string,
    update: Omit<ImportRecoveryMarker, 'startedAt' | 'updatedAt' | 'phase' | 'source'> = {},
): void {
    if (!canUseImportRecoveryStorage()) return;

    try {
        const now = Date.now();
        if (phase === 'parsing') {
            importStartedAt = now;
            importSourceName = source || null;
        }

        const marker: ImportRecoveryMarker = {
            startedAt: importStartedAt || now,
            updatedAt: now,
            phase,
            source: source || importSourceName || undefined,
            ...update,
        };
        window.localStorage.setItem(IMPORT_IN_PROGRESS_KEY, JSON.stringify(marker));
    } catch {
        // Recovery markers are best-effort; never block import/export.
    }
}

export function readImportRecoveryMarker(): ImportRecoveryMarker | null {
    if (!canUseImportRecoveryStorage()) return null;

    try {
        const raw = window.localStorage.getItem(IMPORT_IN_PROGRESS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as ImportRecoveryMarker : null;
    } catch {
        return null;
    }
}

export function clearImportRecoveryMarker(): void {
    importStartedAt = null;
    importSourceName = null;
    if (!canUseImportRecoveryStorage()) return;

    try {
        window.localStorage.removeItem(IMPORT_IN_PROGRESS_KEY);
    } catch {
        // ignore
    }
}

export function readSystemBackupIncludeVoiceAudio(): boolean {
    try {
        return localStorage.getItem(SYSTEM_BACKUP_INCLUDE_VOICE_AUDIO_KEY) === 'true';
    } catch {
        return false;
    }
}

export function writeSystemBackupIncludeVoiceAudio(value: boolean): void {
    try {
        localStorage.setItem(SYSTEM_BACKUP_INCLUDE_VOICE_AUDIO_KEY, String(value));
    } catch {
        // Keep backup preference writes non-fatal.
    }
}

const MUSIC_PROFILE_BG_DB_NAME = 'music_profile_bg_db';
const MUSIC_PROFILE_BG_STORE = 'backgrounds';
const MUSIC_PROFILE_BG_KEY = 'custom_bg';
const MUSIC_CUSTOM_SKIN_DB_NAME = 'music_custom_skins';
const MUSIC_CUSTOM_SKIN_STORE = 'skins';
const HALF_SUGAR_DB_NAME = 'halfsugar-health';
const HALF_SUGAR_DB_VERSION = 2;
const HALF_SUGAR_STORE_DEFINITIONS: Array<{
    name: string;
    options: IDBObjectStoreParameters;
    indexes?: Array<{ name: string; keyPath: string | string[]; options?: IDBIndexParameters }>;
}> = [
    { name: 'meals', options: { keyPath: 'id' }, indexes: [{ name: 'by-date', keyPath: 'date' }] },
    { name: 'weights', options: { keyPath: 'id' }, indexes: [{ name: 'by-date', keyPath: 'date' }] },
    { name: 'exercises', options: { keyPath: 'id' }, indexes: [{ name: 'by-date', keyPath: 'date' }] },
    { name: 'sleep', options: { keyPath: 'id' }, indexes: [{ name: 'by-date', keyPath: 'date' }] },
    { name: 'goals', options: { keyPath: 'id' }, indexes: [{ name: 'by-goalType', keyPath: 'goalType' }] },
    { name: 'favorites', options: { keyPath: 'id' }, indexes: [{ name: 'by-name', keyPath: 'name' }] },
    {
        name: 'summaries',
        options: { keyPath: 'id' },
        indexes: [
            { name: 'by-periodType', keyPath: 'periodType' },
            { name: 'by-periodKey', keyPath: 'periodKey' },
        ],
    },
    { name: 'periods', options: { keyPath: 'id' }, indexes: [{ name: 'by-startDate', keyPath: 'startDate' }] },
    { name: 'medications', options: { keyPath: 'id' }, indexes: [{ name: 'by-date', keyPath: 'date' }] },
];
const SYSTEM_BACKUP_DROPPED_ASSET_IDS = new Set(['sullyos_upstream_compat_payload']);
const SYSTEM_BACKUP_THEME_ASSET_IDS = new Set(['wallpaper', 'launcherWidgetImage', 'custom_font_data']);
const SYSTEM_BACKUP_THEME_ASSET_PREFIXES = ['widget_', 'deco_'];
const SYSTEM_BACKUP_APPEARANCE_ASSET_PREFIXES = ['icon_', 'appearance_preset_'];

// ─── Pure Data Processing Helpers ───────────────────────────────────────

/** Strip all data URIs recursively */
function stripBase64(obj: any): any {
    if (typeof obj === 'string') {
        if (obj.startsWith('data:')) return '';
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => stripBase64(item));
    }
    if (obj !== null && typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = stripBase64(obj[key]);
            }
        }
        return newObj;
    }
    return obj;
}

function isBase64DataUrl(value: string): boolean {
    return /^data:[^,]+;base64,/i.test(value);
}

function dataUrlToAssetExtension(dataUrl: string): string {
    const mime = getDataUrlMimeType(dataUrl)?.toLowerCase() || '';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
    if (mime === 'image/png') return 'png';
    if (mime === 'image/gif') return 'gif';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/svg+xml') return 'svg';
    if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'mp3';
    if (mime === 'audio/webm') return 'webm';
    if (mime === 'audio/wav' || mime === 'audio/wave') return 'wav';
    if (mime === 'audio/ogg') return 'ogg';
    if (mime === 'font/ttf' || mime === 'application/x-font-ttf') return 'ttf';
    if (mime === 'font/otf' || mime === 'application/x-font-otf') return 'otf';
    if (mime === 'font/woff' || mime === 'application/font-woff') return 'woff';
    if (mime === 'font/woff2' || mime === 'application/font-woff2') return 'woff2';
    return 'bin';
}

function assetExtensionToMime(ext: string): string {
    switch (ext.toLowerCase()) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        case 'gif':
            return 'image/gif';
        case 'webp':
            return 'image/webp';
        case 'svg':
            return 'image/svg+xml';
        case 'mp3':
            return 'audio/mpeg';
        case 'webm':
            return 'audio/webm';
        case 'wav':
            return 'audio/wav';
        case 'ogg':
            return 'audio/ogg';
        case 'ttf':
            return 'font/ttf';
        case 'otf':
            return 'font/otf';
        case 'woff':
            return 'font/woff';
        case 'woff2':
            return 'font/woff2';
        default:
            return 'application/octet-stream';
    }
}

/** Extract base64 data URIs into ZIP assets folder, replacing them with path references */
function processObjectForZip(
    obj: any,
    assetsFolder: { file: (name: string, data: string, options?: { base64?: boolean }) => void } | null,
    assetCounter: { count: number },
    assetRegistry: Map<string, string>
): any {
    if (typeof obj === 'string' && isBase64DataUrl(obj)) {
        try {
            const commaIndex = obj.indexOf(',');
            const base64Data = obj.slice(commaIndex + 1);
            const existing = assetRegistry.get(base64Data);
            if (existing) return existing;

            const ext = dataUrlToAssetExtension(obj);
            const filename = `asset_${Date.now()}_${assetCounter.count++}.${ext}`;
            assetsFolder?.file(filename, base64Data, { base64: true });
            const reference = `assets/${filename}`;
            assetRegistry.set(base64Data, reference);
            return reference;
        } catch (e) {
            console.warn("Failed to process asset", e);
            return obj;
        }
    }

    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => processObjectForZip(item, assetsFolder, assetCounter, assetRegistry));
    }

    const newObj: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            let value = obj[key];
            value = processObjectForZip(value, assetsFolder, assetCounter, assetRegistry);
            newObj[key] = value;
        }
    }
    return newObj;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
}

function isBlobLike(value: unknown): value is Blob {
    return value instanceof Blob
        || !!value && typeof value === 'object' && typeof (value as Blob).arrayBuffer === 'function';
}

function getDataUrlMimeType(dataUrl: string): string | undefined {
    const match = /^data:([^;,]+)/.exec(dataUrl);
    return match?.[1];
}

async function serializeBlobOrDataUrl(value: unknown): Promise<{ dataUrl: string; mimeType?: string } | null> {
    if (typeof value === 'string' && value.startsWith('data:')) {
        return { dataUrl: value, mimeType: getDataUrlMimeType(value) };
    }

    if (isBlobLike(value)) {
        return { dataUrl: await blobToDataUrl(value), mimeType: value.type };
    }

    return null;
}

async function serializeMemoryRecordAudioForBackup(items: any[]): Promise<any[]> {
    const serialized = [];
    for (const item of items) {
        const { blob, ...rest } = item || {};
        const audioAsset = await serializeBlobOrDataUrl(blob || item?.dataUrl);
        serialized.push({
            ...rest,
            dataUrl: audioAsset?.dataUrl || item?.dataUrl,
        });
    }
    return serialized;
}

async function serializeVoiceAudioForBackup(items: any[]): Promise<SerializedVoiceAudio[]> {
    const serialized: SerializedVoiceAudio[] = [];
    for (const item of items) {
        const blob = item?.blob;
        const audioAsset = await serializeBlobOrDataUrl(blob || item?.dataUrl);
        serialized.push({
            msgId: item?.msgId,
            createdAt: item?.createdAt,
            mimeType: item?.mimeType || audioAsset?.mimeType,
            dataUrl: audioAsset?.dataUrl,
        });
    }
    return serialized;
}

const MEMORY_RECORD_AUDIO_STATUSES = new Set(['monologue_ready', 'music_ready', 'mastering', 'ready']);
const MEMORY_RECORD_MASTER_AUDIO_MODES = new Set(['char_to_user', 'dream_mix']);
const MEMORY_RECORD_MUSIC_FALLBACK_MARKERS = [
    '最终压制使用兜底拼接',
    '已改用音乐分轨播放',
];

function addBackupAudioId(ids: Set<string>, id?: string): void {
    const trimmed = id?.trim();
    if (trimmed) ids.add(trimmed);
}

function usesMusicFallback(record: MemoryRecord): boolean {
    return MEMORY_RECORD_MASTER_AUDIO_MODES.has(record.mode)
        && Boolean(record.musicAudioId)
        && Boolean(record.error && MEMORY_RECORD_MUSIC_FALLBACK_MARKERS.some(marker => record.error?.includes(marker)));
}

function getNeededMemoryRecordAudioIds(record: MemoryRecord): Set<string> {
    const ids = new Set<string>();
    if (!record || typeof record !== 'object') return ids;

    if (usesMusicFallback(record)) {
        addBackupAudioId(ids, record.musicAudioId);
        return ids;
    }

    if (record.status === 'ready' && record.masterAudioId) {
        addBackupAudioId(ids, record.masterAudioId);
        return ids;
    }

    addBackupAudioId(ids, record.monologueAudioId);
    addBackupAudioId(ids, record.musicAudioId);
    addBackupAudioId(ids, record.masterAudioId);

    return ids;
}

function collectNeededMemoryRecordAudioIds(records: any[]): Set<string> {
    const ids = new Set<string>();
    if (!Array.isArray(records)) return ids;

    for (const record of records) {
        for (const id of getNeededMemoryRecordAudioIds(record as MemoryRecord)) {
            ids.add(id);
        }
    }

    return ids;
}

function filterMemoryRecordAudioForBackup(items: any[], records: any[]): any[] {
    if (!Array.isArray(items) || items.length === 0) return [];

    const neededAudioIds = collectNeededMemoryRecordAudioIds(records);
    if (neededAudioIds.size === 0) return [];

    return items.filter(item => typeof item?.id === 'string' && neededAudioIds.has(item.id));
}

function removePrunedMemoryRecordAudioReferences(records: any[], keptAudioIds: Set<string>): any[] {
    if (!Array.isArray(records)) return records;

    return records.map((item: MemoryRecord) => {
        if (!item || typeof item !== 'object') return item;

        const next: MemoryRecord = { ...item };
        if (next.monologueAudioId && !keptAudioIds.has(next.monologueAudioId)) next.monologueAudioId = undefined;
        if (next.musicAudioId && !keptAudioIds.has(next.musicAudioId)) next.musicAudioId = undefined;
        if (next.masterAudioId && !keptAudioIds.has(next.masterAudioId)) next.masterAudioId = undefined;
        return next;
    });
}

function stripMemoryRecordAudioReferences(items: any[]): any[] {
    if (!Array.isArray(items)) return items;

    return items.map((item: MemoryRecord) => {
        if (!item || typeof item !== 'object') return item;

        const hasAudioReference = Boolean(item.monologueAudioId || item.musicAudioId || item.masterAudioId);
        if (!hasAudioReference) return item;

        return {
            ...item,
            status: MEMORY_RECORD_AUDIO_STATUSES.has(item.status) ? 'draft' : item.status,
            durationMs: undefined,
            lyricsOffsetMs: undefined,
            lyricTiming: undefined,
            monologueAudioId: undefined,
            musicAudioId: undefined,
            masterAudioId: undefined,
        };
    });
}

async function collectAssetBackedAppearanceFields(mode: SystemBackupMode): Promise<Partial<FullBackupData>> {
    if (mode !== 'text_only' && mode !== 'media_only' && mode !== 'full') return {};

    const assets = await DB.getAllAssets();
    const customIcons: Record<string, string> = {};
    const appearancePresets: any[] = [];

    for (const asset of assets || []) {
        if (!asset?.id) continue;
        if (asset.id.startsWith('icon_') && typeof asset.data === 'string') {
            customIcons[asset.id.replace('icon_', '')] = asset.data;
        } else if (asset.id.startsWith('appearance_preset_')) {
            try {
                appearancePresets.push(typeof asset.data === 'string' ? JSON.parse(asset.data) : asset.data);
            } catch {
                // Ignore malformed appearance preset records.
            }
        }
    }

    appearancePresets.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
    return {
        customIcons: Object.keys(customIcons).length > 0 ? customIcons : undefined,
        appearancePresets: appearancePresets.length > 0 ? appearancePresets : undefined,
    };
}

function isThemeAssetId(id: string): boolean {
    return SYSTEM_BACKUP_THEME_ASSET_IDS.has(id)
        || SYSTEM_BACKUP_THEME_ASSET_PREFIXES.some(prefix => id.startsWith(prefix));
}

function isAppearanceAssetId(id: string): boolean {
    return SYSTEM_BACKUP_APPEARANCE_ASSET_PREFIXES.some(prefix => id.startsWith(prefix));
}

function shouldSkipRawAssetInBackup(asset: any): boolean {
    const id = asset?.id;
    return typeof id === 'string'
        && (SYSTEM_BACKUP_DROPPED_ASSET_IDS.has(id) || isThemeAssetId(id) || isAppearanceAssetId(id));
}

function stripUndefinedFields<T extends Record<string, any>>(value: T): T {
    const cleaned: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
        if (item !== undefined) cleaned[key] = item;
    }
    return cleaned as T;
}

async function restoreAssetBackedAppearanceFields(data: FullBackupData): Promise<void> {
    if (data.customIcons === undefined && data.appearancePresets === undefined) return;

    const existingAssets = await DB.getAllAssets();
    if (Array.isArray(existingAssets)) {
        for (const asset of existingAssets) {
            if (data.customIcons !== undefined && asset.id.startsWith('icon_')) {
                await DB.deleteAsset(asset.id);
            }
            if (data.appearancePresets !== undefined && asset.id.startsWith('appearance_preset_')) {
                await DB.deleteAsset(asset.id);
            }
        }
    }

    if (data.customIcons) {
        for (const [appId, iconUrl] of Object.entries(data.customIcons)) {
            if (typeof iconUrl === 'string') {
                await DB.saveAsset(`icon_${appId}`, iconUrl);
            }
        }
    }

    if (data.appearancePresets) {
        for (const preset of data.appearancePresets) {
            if (preset?.id) {
                await DB.saveAsset(`appearance_preset_${preset.id}`, JSON.stringify(preset));
            }
        }
    }
}

async function indexedDbNameExists(name: string): Promise<boolean> {
    if (typeof indexedDB === 'undefined') return false;

    const dbFactory = indexedDB as IDBFactory & {
        databases?: () => Promise<Array<{ name?: string }>>;
    };

    if (typeof dbFactory.databases === 'function') {
        try {
            const dbs = await dbFactory.databases();
            return dbs.some(db => db.name === name);
        } catch {
            return true;
        }
    }

    return true;
}

async function openExistingIndexedDb(name: string): Promise<IDBDatabase | null> {
    if (!await indexedDbNameExists(name)) return null;

    return new Promise((resolve) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
}

async function getAllFromExternalStore(dbName: string, storeName: string): Promise<any[]> {
    const db = await openExistingIndexedDb(dbName);
    if (!db) return [];

    try {
        if (!db.objectStoreNames.contains(storeName)) return [];
        return await new Promise((resolve: (items: any[]) => void) => {
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    } finally {
        db.close();
    }
}

async function getExternalStoreValue(dbName: string, storeName: string, key: string): Promise<unknown> {
    const db = await openExistingIndexedDb(dbName);
    if (!db) return undefined;

    try {
        if (!db.objectStoreNames.contains(storeName)) return undefined;
        return await new Promise((resolve) => {
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(undefined);
        });
    } finally {
        db.close();
    }
}

async function exportExternalIndexedDbStores(
    dbName: string,
    storeNames: string[],
    version = 1,
): Promise<BackupExternalIndexedDbData | undefined> {
    const stores: Record<string, any[]> = {};
    let hasData = false;

    for (const storeName of storeNames) {
        const items = await getAllFromExternalStore(dbName, storeName);
        stores[storeName] = items;
        if (items.length > 0) hasData = true;
    }

    return hasData ? { version, stores } : undefined;
}

async function openIndexedDbWithStore(
    dbName: string,
    storeName: string,
    options?: IDBObjectStoreParameters,
): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return null;

    const openCurrent = () => new Promise<IDBDatabase | null>((resolve) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });

    const current = await openCurrent();
    if (!current) return null;
    if (current.objectStoreNames.contains(storeName)) return current;

    const nextVersion = current.version + 1;
    current.close();

    return new Promise((resolve) => {
        const request = indexedDB.open(dbName, nextVersion);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, options);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
}

function ensureBackupStoreIndexes(store: IDBObjectStore, indexes?: Array<{ name: string; keyPath: string | string[]; options?: IDBIndexParameters }>): void {
    for (const index of indexes || []) {
        if (!store.indexNames.contains(index.name)) {
            store.createIndex(index.name, index.keyPath, index.options);
        }
    }
}

async function openHalfSugarDbForRestore(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return null;

    return new Promise((resolve) => {
        const request = indexedDB.open(HALF_SUGAR_DB_NAME, HALF_SUGAR_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            const tx = request.transaction;
            for (const definition of HALF_SUGAR_STORE_DEFINITIONS) {
                const store = db.objectStoreNames.contains(definition.name)
                    ? tx?.objectStore(definition.name)
                    : db.createObjectStore(definition.name, definition.options);
                if (store) ensureBackupStoreIndexes(store, definition.indexes);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
}

async function restoreHalfSugarDataFromBackup(halfSugarData?: BackupExternalIndexedDbData): Promise<void> {
    if (!halfSugarData?.stores || typeof halfSugarData.stores !== 'object') return;

    const db = await openHalfSugarDbForRestore();
    if (!db) return;

    try {
        const storeNames = HALF_SUGAR_STORE_DEFINITIONS
            .map(definition => definition.name)
            .filter(name => db.objectStoreNames.contains(name));
        if (storeNames.length === 0) return;

        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeNames, 'readwrite');
            for (const storeName of storeNames) {
                const items = halfSugarData.stores[storeName];
                if (!Array.isArray(items)) continue;
                const store = tx.objectStore(storeName);
                store.clear();
                items.forEach(item => store.put(item));
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

async function exportMusicAssetsForBackup(mode: SystemBackupMode): Promise<BackupMusicAssets | undefined> {
    if (mode === 'text_only') return undefined;

    const musicAssets: BackupMusicAssets = {};
    const profileBlob = await getExternalStoreValue(
        MUSIC_PROFILE_BG_DB_NAME,
        MUSIC_PROFILE_BG_STORE,
        MUSIC_PROFILE_BG_KEY,
    );

    const profileAsset = await serializeBlobOrDataUrl(profileBlob);
    if (profileAsset) {
        musicAssets.profileBackground = {
            key: MUSIC_PROFILE_BG_KEY,
            mimeType: profileAsset.mimeType,
            dataUrl: profileAsset.dataUrl,
        };
    }

    const customSkinRecords = await getAllFromExternalStore(MUSIC_CUSTOM_SKIN_DB_NAME, MUSIC_CUSTOM_SKIN_STORE);
    const customSkins: NonNullable<BackupMusicAssets['customSkins']> = [];
    for (const record of customSkinRecords) {
        const skinAsset = await serializeBlobOrDataUrl(record?.blob);
        if (!record?.id || !skinAsset) continue;
        customSkins.push({
            id: String(record.id),
            name: typeof record.name === 'string' ? record.name : '自定义皮肤',
            mimeType: skinAsset.mimeType,
            dataUrl: skinAsset.dataUrl,
        });
    }

    if (customSkins.length > 0) {
        musicAssets.customSkins = customSkins;
    }

    return musicAssets.profileBackground || musicAssets.customSkins?.length ? musicAssets : undefined;
}

async function replaceExternalStoreItems(
    dbName: string,
    storeName: string,
    items: Array<{ value: any; key?: IDBValidKey }>,
    options?: IDBObjectStoreParameters,
): Promise<void> {
    const db = await openIndexedDbWithStore(dbName, storeName, options);
    if (!db) return;

    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.clear();
            for (const item of items) {
                if (item.key !== undefined) {
                    store.put(item.value, item.key);
                } else {
                    store.put(item.value);
                }
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

async function restoreMusicAssetsFromBackup(musicAssets?: BackupMusicAssets): Promise<void> {
    if (!musicAssets) return;

    const profileItems: Array<{ value: any; key?: IDBValidKey }> = [];
    if (musicAssets.profileBackground?.dataUrl) {
        profileItems.push({
            key: musicAssets.profileBackground.key || MUSIC_PROFILE_BG_KEY,
            value: await dataUrlToBlob(musicAssets.profileBackground.dataUrl),
        });
    }
    await replaceExternalStoreItems(MUSIC_PROFILE_BG_DB_NAME, MUSIC_PROFILE_BG_STORE, profileItems);

    const skinItems: Array<{ value: any; key?: IDBValidKey }> = [];
    for (const skin of musicAssets.customSkins || []) {
        if (!skin.dataUrl) continue;
        skinItems.push({
            value: {
                id: skin.id,
                name: skin.name,
                blob: await dataUrlToBlob(skin.dataUrl),
            },
        });
    }
    await replaceExternalStoreItems(
        MUSIC_CUSTOM_SKIN_DB_NAME,
        MUSIC_CUSTOM_SKIN_STORE,
        skinItems,
        { keyPath: 'id' },
    );
}

/** Restore ZIP asset references back to base64 data URIs */
async function restoreAssetsFromZip(obj: any, zip: JSZipLike | null): Promise<any> {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        const arr = [];
        for (const item of obj) {
            arr.push(await restoreAssetsFromZip(item, zip));
        }
        return arr;
    }

    const newObj: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            let value = obj[key];
            if (typeof value === 'string' && value.startsWith('assets/') && zip) {
                try {
                    const filename = value.split('/')[1];
                    const fileInZip = zip.file(`assets/${filename}`);
                    if (fileInZip) {
                        const base64 = await (fileInZip as any).async("base64");
                        const ext = filename.split('.').pop() || 'png';
                        const mime = assetExtensionToMime(ext);

                        value = `data:${mime};base64,${base64}`;
                    }
                } catch (e) {
                    console.warn(`Failed to restore asset: ${value}`);
                }
            } else {
                value = await restoreAssetsFromZip(value, zip);
            }
            newObj[key] = value;
        }
    }
    return newObj;
}

// ─── Store Definitions ──────────────────────────────────────────────────

export const SYSTEM_BACKUP_ALWAYS_STORES = [
    'characters', 'messages', 'themes', 'emojis', 'emoji_categories', 'assets', 'gallery',
    'user_profile', 'diaries', 'tasks', 'anniversaries', 'room_todos',
    'room_notes', 'groups', 'journal_stickers', 'social_posts', 'courses', 'games', 'worldbooks', 'novels',
    'bank_transactions', 'bank_data',
    'xhs_activities', 'xhs_stock',
    'vector_memories',
    'memory_records', 'memory_record_audio',
    'scheduled_messages', 'letters', 'yesterday_newspapers', 'vibe_references'
];

export const SYSTEM_BACKUP_CONDITIONAL_STORES = [
    'voice_audio',
];

export const SYSTEM_BACKUP_EXCLUDED_STORES = [
    'hot_news_snapshots',
    'chat_context_mirrors',
];

const ALL_STORES = SYSTEM_BACKUP_ALWAYS_STORES;

// localStorage keys to include in backup (sub API, embedding, backend, etc.)
export const SYSTEM_BACKUP_LOCAL_STORAGE_KEYS = [
    'sub_api_key', 'sub_api_base_url', 'sub_api_model', 'sub_api_presets',
    'os_sub_api_config', 'os_sub_api_pool', 'os_sub_api_pool_state', 'os_sub_api_pool_cursor', 'character_refine_prompts',
    'csyos_backend_token', 'csyos_backend_url',
    'embedding_provider', 'embedding_api_key', 'embedding_base_url', 'embedding_model',
    'embedding_api_key_openai', 'embedding_base_url_openai', 'embedding_model_openai',
    'embedding_api_key_cohere', 'embedding_base_url_cohere', 'embedding_model_cohere',
    'cohere_rerank_api_key', 'cohere_rerank_use_paid',
    'body_signal_mode', 'autonomous_debug',
    'browser_brave_key', 'browser_use_real_search',
    // Agent config
    'agent_config',
    // 摘星楼 secondary API
    'zhaixinglou_secondary_api_config', 'zhaixinglou_secondary_api_presets', 'zhaixinglou_secondary_models',
    // Misc app settings
    'schedule_app_theme', 'os_haptics_enabled', 'os_last_active_char_id',
    IMAGE_GENERATION_CONFIG_KEY, IMAGE_GENERATION_DRAFT_CONFIG_KEY, IMAGE_API_PRESETS_KEY, PHOTO_STYLE_PRESETS_KEY,
    'chat_archive_prompts', 'chat_active_archive_prompt_id',
    'character_active_refine_prompt_id',
    'chat_translate_lang', 'chat_translate_source_lang',
    'groupchat_context_limit',
    'os_tts_presets',
    'netease_music_cookie', 'music_recent_keywords', 'music_liked_songs',
    'music_profile_bg_setting', 'music_player_skin', 'music_player_glass',
    'floating_lyrics_settings', 'temporal_pending_events',
    'zhaixinglou_font_settings',
    'os_fullscreen_enabled', 'sullyos_performance_mode',
    'theater_custom_locations', 'theater_visit_counts', 'theater_bgm_enabled', 'theater_bgm_volume',
    'crosstime_rooms',
    'loveshow_active_season', 'loveshow_season_index', 'loveshow_phone_wallpaper_mode', 'loveshow_locked_guest_ids_v1',
    'loveshow_casting_confirmation_v1', 'loveshow_target_guest_count_v1', 'loveshow_casting_draft_v2',
    'echo_record_needle_drop_form_v1',
    SYSTEM_BACKUP_INCLUDE_VOICE_AUDIO_KEY,
];

export const SYSTEM_BACKUP_LOCAL_STORAGE_PREFIXES = [
    'chat_translate_enabled_',
    'chat_show_timestamp_',
    'chat_auto_tts_',
    'chat_auto_call_',
    'chat_auto_share_song_',
    'chat_inject_playback_context_',
    'chat_today_schedule_enabled_',
    'chat_today_schedule_entry_hidden_',
    'chat_private_newspaper_enabled_',
    'date_translation_',
    'date_trans_src_',
    'date_trans_tgt_',
    'date_summary_ball_pos_',
    'agent_lifestream_visibility_',
    'theater_session_',
    'theater_timelines_',
    'theater_active_tl_',
    'theater_ball_pos_',
    'trajectory_nodes_',
    'trajectory_meta_',
    'crosstime_msgs_',
    'loveshow_season_',
    'loveshow_charstate_',
    'loveshow_impression_',
    'loveshow_npcs_',
    'loveshow_social_',
    'loveshow_missions_',
    'loveshow_memories_',
    'loveshow_highlights_',
    'loveshow_ui_',
    'loveshow_choice_history_',
];

export const SYSTEM_BACKUP_EXCLUDED_LOCAL_STORAGE_KEYS = [
    'csyos_backend_alive',
    'csyos_backend_runtime_debug',
    'csyos_user_id',
    'csyos_client_id',
    'rerank_dismissed_until',
    'sullyos_valentine_2026_dismissed',
    'sullyos_valentine_2026_completed',
    'sullyos_disclaimer_accepted',
];

export const SYSTEM_BACKUP_EXCLUDED_LOCAL_STORAGE_PREFIXES = [
    'vector_memory_batch_checkpoint:',
];

const SYSTEM_BACKUP_DEVICE_IDENTITY_KEYS = [
    'csyos_user_id',
    'csyos_client_id',
    'csyosUserId',
    'csyosClientId',
];

const SYSTEM_BACKUP_DEVICE_IDENTITY_STORAGE_KEYS = [
    'csyos_user_id',
    'csyos_client_id',
] as const;

type DeviceIdentitySnapshot = Record<typeof SYSTEM_BACKUP_DEVICE_IDENTITY_STORAGE_KEYS[number], string | null>;

const SYSTEM_BACKUP_DEVICE_IDENTITY_KEY_FINGERPRINTS = new Set(
    SYSTEM_BACKUP_DEVICE_IDENTITY_KEYS.map(key => key.replace(/[-_\s]/g, '').toLowerCase())
);

const DROP_IMPORTED_DEVICE_IDENTITY_VALUE = Symbol('dropImportedDeviceIdentityValue');

function isDeviceIdentityImportKey(key: unknown): boolean {
    return typeof key === 'string'
        && SYSTEM_BACKUP_DEVICE_IDENTITY_KEY_FINGERPRINTS.has(key.replace(/[-_\s]/g, '').toLowerCase());
}

function stripImportedDeviceIdentityValue(value: unknown): unknown | typeof DROP_IMPORTED_DEVICE_IDENTITY_VALUE {
    if (Array.isArray(value)) {
        const cleaned: unknown[] = [];
        for (const item of value) {
            const next = stripImportedDeviceIdentityValue(item);
            if (next !== DROP_IMPORTED_DEVICE_IDENTITY_VALUE) cleaned.push(next);
        }
        return cleaned;
    }

    if (value !== null && typeof value === 'object') {
        const source = value as Record<string, unknown>;
        if (isDeviceIdentityImportKey(source.id) || isDeviceIdentityImportKey(source.key) || isDeviceIdentityImportKey(source.name)) {
            return DROP_IMPORTED_DEVICE_IDENTITY_VALUE;
        }

        const cleaned: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(source)) {
            if (isDeviceIdentityImportKey(key)) continue;
            const next = stripImportedDeviceIdentityValue(child);
            if (next !== DROP_IMPORTED_DEVICE_IDENTITY_VALUE) cleaned[key] = next;
        }
        return cleaned;
    }

    return value;
}

function stripImportedDeviceIdentity(data: FullBackupData): FullBackupData {
    const cleaned = stripImportedDeviceIdentityValue(data);
    return cleaned && typeof cleaned === 'object' ? cleaned as FullBackupData : data;
}

function captureDeviceIdentitySnapshot(): DeviceIdentitySnapshot {
    const snapshot = {} as DeviceIdentitySnapshot;
    for (const key of SYSTEM_BACKUP_DEVICE_IDENTITY_STORAGE_KEYS) {
        try {
            snapshot[key] = localStorage.getItem(key);
        } catch {
            snapshot[key] = null;
        }
    }
    return snapshot;
}

function restoreDeviceIdentitySnapshot(snapshot: DeviceIdentitySnapshot): void {
    for (const key of SYSTEM_BACKUP_DEVICE_IDENTITY_STORAGE_KEYS) {
        try {
            const value = snapshot[key];
            if (value === null) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, value);
            }
        } catch {
            // Import must not fail while restoring the local-only device identity guard.
        }
    }
}

function shouldIncludeMemoryRecordAudio(mode: SystemBackupMode, options: SystemBackupOptions = {}): boolean {
    return mode !== 'text_only' && options.includeMemoryRecordAudio !== false;
}

async function restoreThemeAssetsFromBackup(theme?: OSTheme): Promise<void> {
    const existingAssets = await DB.getAllAssets();
    if (Array.isArray(existingAssets)) {
        for (const asset of existingAssets) {
            if (asset?.id && isThemeAssetId(asset.id)) {
                await DB.deleteAsset(asset.id);
            }
        }
    }

    if (!theme) return;

    if (typeof theme.wallpaper === 'string' && theme.wallpaper.startsWith('data:')) {
        await DB.saveAsset('wallpaper', theme.wallpaper);
    }

    if (theme.launcherWidgets) {
        for (const [slot, value] of Object.entries(theme.launcherWidgets)) {
            if (typeof value === 'string' && value.startsWith('data:')) {
                await DB.saveAsset(`widget_${slot}`, value);
            }
        }
    }

    if (theme.desktopDecorations) {
        for (const deco of theme.desktopDecorations) {
            if (deco?.type === 'image' && typeof deco.content === 'string' && deco.content.startsWith('data:')) {
                await DB.saveAsset(`deco_${deco.id}`, deco.content);
            }
        }
    }

    if (typeof theme.customFont === 'string' && theme.customFont.startsWith('data:')) {
        await DB.saveAsset('custom_font_data', theme.customFont);
    }
}

function getStoresToProcess(mode: SystemBackupMode, options: SystemBackupOptions = {}): string[] {
    let stores: string[];
    if (mode === 'full') stores = [...ALL_STORES];
    else if (mode === 'text_only') stores = ALL_STORES.filter(s => s !== 'assets' && s !== 'memory_record_audio');
    // media_only
    else stores = ['gallery', 'emojis', 'emoji_categories', 'journal_stickers', 'user_profile', 'characters', 'messages', 'themes', 'assets', 'bank_data', 'memory_records', 'memory_record_audio'];

    if (!shouldIncludeMemoryRecordAudio(mode, options)) {
        stores = stores.filter(s => s !== 'memory_record_audio');
    }

    if (options.includeVoiceAudio && mode !== 'text_only' && !stores.includes('voice_audio')) {
        stores.push('voice_audio');
    }

    return stores;
}

function isExcludedLocalStorageKey(key: string): boolean {
    return SYSTEM_BACKUP_EXCLUDED_LOCAL_STORAGE_KEYS.includes(key)
        || SYSTEM_BACKUP_EXCLUDED_LOCAL_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
}

function shouldIncludeLocalStorageKey(key: string): boolean {
    if (isExcludedLocalStorageKey(key)) return false;
    return SYSTEM_BACKUP_LOCAL_STORAGE_KEYS.includes(key)
        || SYSTEM_BACKUP_LOCAL_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
}

function collectExtraLocalStorageConfig(): Record<string, string> {
    const extraConfig: Record<string, string> = {};

    const collectKey = (key: string | null) => {
        if (!key || !shouldIncludeLocalStorageKey(key)) return;
        try {
            const val = localStorage.getItem(key);
            if (val !== null) extraConfig[key] = val;
        } catch {
            // Keep backups resilient when storage is unavailable.
        }
    };

    for (const key of SYSTEM_BACKUP_LOCAL_STORAGE_KEYS) {
        collectKey(key);
    }

    try {
        for (let i = 0; i < localStorage.length; i++) {
            collectKey(localStorage.key(i));
        }
    } catch {
        // Exact-key collection above already captured the stable keys.
    }

    return extraConfig;
}

// ─── Export Pipeline ────────────────────────────────────────────────────

export interface ExportStateSnapshot {
    apiConfig: APIConfig;
    apiPresets: ApiPreset[];
    availableModels: string[];
    realtimeConfig: RealtimeConfig;
    ttsConfig: TtsConfig;
    sttConfig: SttConfig;
    imageGenerationConfig: ImageGenerationConfig;
    imageGenerationDraftConfig?: ImageGenerationConfig;
    imageApiPresets: ImageApiPreset[];
    photoStylePresets: PhotoStylePreset[];
    theme: OSTheme;
}

export async function exportSystemData(
    mode: SystemBackupMode,
    state: ExportStateSnapshot,
    onProgress: (message: string, progress: number) => void,
    options: SystemBackupOptions = {},
): Promise<Blob> {
    onProgress('正在初始化打包引擎...', 0);

    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const assetsFolder = zip.folder("assets");
    const assetCounter = { count: 0 };
    const assetRegistry = new Map<string, string>();

    const processObject = (obj: any) => processObjectForZip(obj, assetsFolder, assetCounter, assetRegistry);

    const storesToProcess = getStoresToProcess(mode, options);
    const includeMemoryRecordAudio = shouldIncludeMemoryRecordAudio(mode, options);

    // Fetch Social App & Room Assets
    const sparkUserBg = await DB.getAsset('spark_user_bg');
    const sparkSocialProfile = await DB.getAsset('spark_social_profile');
    const roomCustomAssets = await DB.getAsset('room_custom_assets_list');
    const musicAssets = await exportMusicAssetsForBackup(mode);
    const halfSugarData = (mode === 'text_only' || mode === 'full')
        ? await exportExternalIndexedDbStores(
            HALF_SUGAR_DB_NAME,
            HALF_SUGAR_STORE_DEFINITIONS.map(definition => definition.name),
            HALF_SUGAR_DB_VERSION,
        )
        : undefined;
    const assetBackedAppearanceFields = await collectAssetBackedAppearanceFields(mode);

    const backupData: Partial<FullBackupData> = {
        timestamp: Date.now(),
        version: 3,
        apiConfig: (mode === 'text_only' || mode === 'full') ? state.apiConfig : undefined,
        apiPresets: (mode === 'text_only' || mode === 'full') ? state.apiPresets : undefined,
        availableModels: (mode === 'text_only' || mode === 'full') ? state.availableModels : undefined,
        realtimeConfig: (mode === 'text_only' || mode === 'full') ? state.realtimeConfig : undefined,
        ttsConfig: (mode === 'text_only' || mode === 'full') ? state.ttsConfig : undefined,
        sttConfig: (mode === 'text_only' || mode === 'full') ? state.sttConfig : undefined,
        imageGenerationConfig: (mode === 'text_only' || mode === 'full') ? state.imageGenerationConfig : undefined,
        imageGenerationDraftConfig: (mode === 'text_only' || mode === 'full') ? state.imageGenerationDraftConfig : undefined,
        imageApiPresets: (mode === 'text_only' || mode === 'full') ? state.imageApiPresets : undefined,
        photoStylePresets: (mode === 'text_only' || mode === 'full') ? state.photoStylePresets : undefined,
        theme: state.theme,

        socialAppData: (mode === 'text_only' || mode === 'media_only' || mode === 'full') ? {
            charHandles: JSON.parse(localStorage.getItem('spark_char_handles') || '{}'),
            userProfile: sparkSocialProfile ? JSON.parse(sparkSocialProfile) : undefined,
            userId: localStorage.getItem('spark_user_id') || undefined,
            userBg: sparkUserBg || undefined
        } : undefined,

        roomCustomAssets: (mode === 'text_only' || mode === 'media_only' || mode === 'full') ? (roomCustomAssets ? JSON.parse(roomCustomAssets) : []) : undefined,
        musicAssets,
        halfSugarData,
        mediaAssets: [],
        ...stripUndefinedFields(assetBackedAppearanceFields),
    };

    const totalSteps = storesToProcess.length + 3;
    let currentStep = 0;

    // Pre-process specialized image fields
    if (mode !== 'text_only') {
        if (backupData.socialAppData?.userProfile) backupData.socialAppData.userProfile = processObject(backupData.socialAppData.userProfile);
        if (backupData.socialAppData?.userBg) backupData.socialAppData.userBg = processObject(backupData.socialAppData.userBg);
        if (backupData.roomCustomAssets) backupData.roomCustomAssets = processObject(backupData.roomCustomAssets);
        if (backupData.theme) backupData.theme = processObject(backupData.theme);
        if (backupData.customIcons) backupData.customIcons = processObject(backupData.customIcons);
        if (backupData.appearancePresets) backupData.appearancePresets = processObject(backupData.appearancePresets);
        if (backupData.musicAssets) backupData.musicAssets = processObject(backupData.musicAssets);
        if (backupData.halfSugarData) backupData.halfSugarData = processObject(backupData.halfSugarData);
    } else {
        if (backupData.socialAppData?.userProfile) backupData.socialAppData.userProfile = stripBase64(backupData.socialAppData.userProfile);
        if (backupData.socialAppData?.userBg) backupData.socialAppData.userBg = stripBase64(backupData.socialAppData.userBg);
        if (backupData.roomCustomAssets) backupData.roomCustomAssets = stripBase64(backupData.roomCustomAssets);
        if (backupData.customIcons) backupData.customIcons = stripBase64(backupData.customIcons);
        if (backupData.appearancePresets) backupData.appearancePresets = stripBase64(backupData.appearancePresets);
        if (backupData.halfSugarData) backupData.halfSugarData = stripBase64(backupData.halfSugarData);
        if (backupData.theme) {
            const savedPresetDecos = backupData.theme.desktopDecorations
                ?.filter(d => d.type === 'preset')
                .map(d => ({ id: d.id, content: d.content }));
            backupData.theme = stripBase64(backupData.theme);
            if (backupData.theme!.desktopDecorations && savedPresetDecos) {
                backupData.theme!.desktopDecorations = backupData.theme!.desktopDecorations
                    .map((d: any) => {
                        const saved = savedPresetDecos.find(p => p.id === d.id);
                        return saved ? { ...d, content: saved.content } : d;
                    })
                    .filter((d: any) => d.content && d.content !== '');
            }
        }
    }

    for (const storeName of storesToProcess) {
        currentStep++;
        onProgress(`正在打包: ${storeName} ...`, (currentStep / totalSteps) * 100);

        let rawData = await DB.getRawStoreData(storeName);
        let processedData: any;

        if (mode === 'text_only') {
            processedData = stripBase64(rawData);
        } else {
            if (storeName === 'messages' && mode === 'media_only') {
                rawData = rawData.filter((m: Message) => m.type === 'image' || m.type === 'emoji');
            }

            if (storeName === 'memory_record_audio') {
                const exportableAudio = filterMemoryRecordAudioForBackup(rawData, backupData.memoryRecords || []);
                processedData = processObject(await serializeMemoryRecordAudioForBackup(exportableAudio));
                const keptAudioIds = new Set<string>(
                    processedData
                        .map((item: any) => item?.id)
                        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
                );
                if (backupData.memoryRecords) {
                    backupData.memoryRecords = removePrunedMemoryRecordAudioReferences(backupData.memoryRecords, keptAudioIds);
                }
                backupData.memoryRecordAudio = processedData.length > 0 ? processedData : undefined;
                continue;
            }

            if (storeName === 'voice_audio') {
                processedData = processObject(await serializeVoiceAudioForBackup(rawData));
                backupData.voiceAudio = processedData;
                continue;
            }

            if (storeName === 'characters' && mode === 'media_only') {
                const mediaList = rawData.map((c: CharacterProfile) => {
                    const extracted = {
                        charId: c.id,
                        avatar: c.avatar,
                        sprites: c.sprites,
                        roomItems: c.roomConfig?.items?.reduce((acc: any, item: any) => {
                            if (item.image && item.image.startsWith('data:')) {
                                acc[item.id] = item.image;
                            }
                            return acc;
                        }, {}),
                        backgrounds: {
                            chat: c.chatBackground,
                            date: c.dateBackground,
                            roomWall: c.roomConfig?.wallImage,
                            roomFloor: c.roomConfig?.floorImage
                        }
                    };
                    return processObject(extracted);
                });
                backupData.mediaAssets = mediaList;
                continue;
            }

            processedData = processObject(
                storeName === 'assets' && Array.isArray(rawData)
                    ? rawData.filter((asset: any) => !shouldSkipRawAssetInBackup(asset))
                    : rawData,
            );
            if (storeName === 'memory_records' && !includeMemoryRecordAudio) {
                processedData = stripMemoryRecordAudioReferences(processedData);
            }
        }

        // Assign to Backup Data
        switch (storeName) {
            case 'characters': if (mode !== 'media_only') backupData.characters = processedData; break;
            case 'messages': backupData.messages = processedData; break;
            case 'themes': backupData.customThemes = processedData; break;
            case 'emojis': backupData.savedEmojis = processedData; break;
            case 'assets': backupData.assets = processedData; break;
            case 'gallery': backupData.galleryImages = processedData; break;
            case 'user_profile': if (processedData[0]) backupData.userProfile = processedData[0]; break;
            case 'diaries': backupData.diaries = processedData; break;
            case 'tasks': backupData.tasks = processedData; break;
            case 'anniversaries': backupData.anniversaries = processedData; break;
            case 'room_todos': backupData.roomTodos = processedData; break;
            case 'room_notes': backupData.roomNotes = processedData; break;
            case 'groups': backupData.groups = processedData; break;
            case 'journal_stickers': backupData.savedJournalStickers = processedData; break;
            case 'social_posts': backupData.socialPosts = processedData; break;
            case 'courses': backupData.courses = processedData; break;
            case 'games': backupData.games = processedData; break;
            case 'worldbooks': backupData.worldbooks = processedData; break;
            case 'novels': backupData.novels = processedData; break;
            case 'bank_transactions': backupData.bankTransactions = processedData; break;
            case 'bank_data': {
                if (Array.isArray(processedData)) {
                    const mainState = processedData.find((d: any) => d.id === 'main_state');
                    const dollhouseRecord = processedData.find((d: any) => d.id === 'dollhouse_state');
                    backupData.bankState = mainState ? { ...mainState, id: undefined } : undefined;
                    backupData.bankDollhouse = dollhouseRecord?.data || undefined;
                }
                break;
            }
            case 'xhs_activities': backupData.xhsActivities = processedData; break;
            case 'xhs_stock': backupData.xhsStockImages = processedData; break;
            case 'emoji_categories': backupData.emojiCategories = processedData; break;
            case 'vector_memories': backupData.vectorMemories = processedData; break;
            case 'memory_records': backupData.memoryRecords = processedData; break;
            case 'memory_record_audio': backupData.memoryRecordAudio = processedData; break;
            case 'voice_audio': backupData.voiceAudio = processedData; break;
            case 'scheduled_messages': backupData.scheduledMessages = processedData; break;
            case 'letters': backupData.letters = processedData; break;
            case 'yesterday_newspapers': backupData.yesterdayNewspapers = processedData; break;
            case 'vibe_references': backupData.vibeReferences = processedData; break;
        }

        await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Collect extra localStorage config keys
    const extraConfig = collectExtraLocalStorageConfig();
    if (Object.keys(extraConfig).length > 0) {
        backupData.extraLocalStorageConfig = extraConfig;
    }

    // ── 拉取后端 graph 数据（语义关联 + 逻辑链 + 认知）──
    if (mode === 'text_only' || mode === 'full') {
        onProgress('正在拉取认知网络数据...', 90);
        try {
            const backendUrl = getBackendUrl();
            if (backendUrl) {
                const graphResp = await fetch(`${backendUrl}/api/graph/export`, {
                    headers: buildBackendHeaders({ contentType: false }),
                    signal: safeTimeoutSignal(15000),
                });
                if (graphResp.ok) {
                    const graphData = await graphResp.json();
                    if (graphData.ok) {
                        backupData.graphData = {
                            relations: graphData.relations || [],
                            l1Memories: graphData.l1Memories || [],
                        };
                        console.log(`📦 [Export] Graph data: ${graphData.relations?.length || 0} relations, ${graphData.l1Memories?.length || 0} L1 memories`);
                    }
                }
            }
        } catch (e: any) {
            console.warn('📦 [Export] Graph data fetch failed (non-critical):', e.message);
        }
    }

    onProgress('正在生成压缩包...', 95);

    zip.file("data.json", JSON.stringify(backupData));

    const content = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
    }, (metadata: { percent: number }) => {
        if (Math.random() > 0.8) {
            onProgress(`压缩中 ${metadata.percent.toFixed(0)}%...`, 95);
        }
    });

    return content;
}

// ─── Import Pipeline ────────────────────────────────────────────────────

export interface ImportCallbacks {
    updateTheme: (updates: Partial<OSTheme>) => void;
    updateApiConfig: (updates: Partial<APIConfig>) => void;
    saveModels: (models: string[]) => void;
    savePresets: (presets: ApiPreset[]) => void;
    updateRealtimeConfig: (updates: Partial<RealtimeConfig>) => void;
    setCharacters: (chars: CharacterProfile[]) => void;
    setGroups: (groups: GroupProfile[]) => void;
    setCustomThemes: (themes: ChatTheme[]) => void;
    setUserProfile: (profile: UserProfile) => void;
    setWorldbooks: (books: Worldbook[]) => void;
    setNovels: (novels: NovelBook[]) => void;
    setCustomIcons: (icons: Record<string, string>) => void;
    addToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export async function importSystemData(
    fileOrJson: File | string,
    onProgress: (message: string, progress: number) => void,
    callbacks: ImportCallbacks
): Promise<void> {
    const deviceIdentitySnapshot = captureDeviceIdentitySnapshot();
    const sourceName = typeof fileOrJson === 'string' ? 'JSON 文本' : fileOrJson.name;
    const sourceSize = typeof fileOrJson === 'string' ? undefined : fileOrJson.size;
    const reportImportProgress = (
        phase: ImportRecoveryPhase,
        message: string,
        progress: number,
        update: Omit<ImportRecoveryMarker, 'startedAt' | 'updatedAt' | 'phase' | 'source'> = {},
    ) => {
        writeImportRecoveryMarker(phase, sourceName, { sourceSize, current: message, ...update });
        onProgress(message, progress);
    };

    try {
        reportImportProgress('parsing', '正在解析备份文件...', 0);
        let data: FullBackupData;
        let zip: JSZipLike | null = null;

        if (typeof fileOrJson === 'string') {
            data = JSON.parse(fileOrJson);
        } else {
            if (!fileOrJson.name.endsWith('.zip')) {
                throw new Error("无效的文件格式，请上传 .zip");
            }

            const JSZip = await loadJSZip();
            const loadedZip = await JSZip.loadAsync(fileOrJson);
            zip = loadedZip;
            const dataFile = loadedZip.file("data.json");
            if (!dataFile) throw new Error("损坏的备份包: 缺少 data.json");
            const jsonStr = await dataFile.async("string");
            data = JSON.parse(jsonStr);
        }

        reportImportProgress('assets', '正在恢复数据与素材...', 50);

        if (zip) {
            data = await restoreAssetsFromZip(data, zip);
        }

        data = stripImportedDeviceIdentity(data);

        reportImportProgress('database', '正在写入本地数据库...', 64);
        await DB.importFullData(data);
        await restoreHalfSugarDataFromBackup(data.halfSugarData);
        await restoreThemeAssetsFromBackup(data.theme);
        await restoreAssetBackedAppearanceFields(data);

        if (data.musicAssets) {
            try {
                reportImportProgress('assets', '正在恢复音乐素材...', 72);
                await restoreMusicAssetsFromBackup(data.musicAssets);
            } catch (e: any) {
                console.warn('📦 [Import] Music assets restore failed (non-critical):', e.message);
            }
        }

        // ── Write config to localStorage directly (NO React setState!) ──────
        // All DB data is already written by importFullData above.
        // After reload, initData() will read everything from DB.
        // We only need localStorage writes for settings that are loaded from localStorage on boot.
        // Triggering React setState here would cause cross-version import crashes
        // (insertBefore error) because the UI re-renders with potentially incompatible data
        // right before reload.

        reportImportProgress('settings', '正在恢复系统设置...', 82);

        if (data.theme) {
            const cleanTheme = { ...data.theme } as any;
            if (cleanTheme.wallpaper && cleanTheme.wallpaper.startsWith('data:')) { delete cleanTheme.wallpaper; }
            if (cleanTheme.launcherWidgetImage && cleanTheme.launcherWidgetImage.startsWith('data:')) { delete cleanTheme.launcherWidgetImage; }
            if (cleanTheme.launcherWidgets) {
                const cw = { ...cleanTheme.launcherWidgets };
                for (const k of Object.keys(cw)) { if (cw[k]?.startsWith('data:')) delete cw[k]; }
                cleanTheme.launcherWidgets = Object.keys(cw).length > 0 ? cw : undefined;
            }
            if (cleanTheme.customFont && cleanTheme.customFont.startsWith('data:')) { delete cleanTheme.customFont; }
            if (cleanTheme.desktopDecorations) {
                cleanTheme.desktopDecorations = cleanTheme.desktopDecorations.map((d: any) => ({
                    ...d,
                    content: (d.content && d.content.startsWith('data:') && d.type === 'image') ? '' : d.content
                }));
            }
            localStorage.setItem('os_theme', JSON.stringify(cleanTheme));
        }
        if (data.apiConfig) localStorage.setItem('os_api_config', JSON.stringify(data.apiConfig));
        if (data.availableModels) localStorage.setItem('os_available_models', JSON.stringify(data.availableModels));
        if (data.apiPresets) localStorage.setItem('os_api_presets', JSON.stringify(data.apiPresets));
        if (data.realtimeConfig) localStorage.setItem('os_realtime_config', JSON.stringify(data.realtimeConfig));
        if (data.ttsConfig) localStorage.setItem('os_tts_config', JSON.stringify(data.ttsConfig));
        if (data.sttConfig) localStorage.setItem('os_stt_config', JSON.stringify(data.sttConfig));
        if (data.imageGenerationConfig) localStorage.setItem(IMAGE_GENERATION_CONFIG_KEY, JSON.stringify(data.imageGenerationConfig));
        if (data.imageGenerationDraftConfig) localStorage.setItem(IMAGE_GENERATION_DRAFT_CONFIG_KEY, JSON.stringify(data.imageGenerationDraftConfig));
        if (data.imageApiPresets) localStorage.setItem(IMAGE_API_PRESETS_KEY, JSON.stringify(data.imageApiPresets));
        if (data.photoStylePresets) localStorage.setItem(PHOTO_STYLE_PRESETS_KEY, JSON.stringify(data.photoStylePresets));

        if (data.socialAppData) {
            if (data.socialAppData.charHandles) localStorage.setItem('spark_char_handles', JSON.stringify(data.socialAppData.charHandles));
            if (data.socialAppData.userId) localStorage.setItem('spark_user_id', data.socialAppData.userId);
            if (data.socialAppData.userProfile) await DB.saveAsset('spark_social_profile', JSON.stringify(data.socialAppData.userProfile));
            if (data.socialAppData.userBg) await DB.saveAsset('spark_user_bg', data.socialAppData.userBg);
        }

        if (data.roomCustomAssets) {
            await DB.saveAsset('room_custom_assets_list', JSON.stringify(data.roomCustomAssets));
        }

        // Restore extra localStorage config (sub API, embedding, backend, etc.)
        if (data.extraLocalStorageConfig) {
            for (const [key, value] of Object.entries(data.extraLocalStorageConfig)) {
                if (!shouldIncludeLocalStorageKey(key)) continue;
                localStorage.setItem(key, value);
            }
        }

        // ── 恢复后端 graph 数据（语义关联 + 逻辑链 + 认知）──
        if (data.graphData) {
            try {
                const backendUrl = getBackendUrl();
                if (backendUrl) {
                    reportImportProgress('settings', '正在恢复认知网络数据...', 90);
                    const graphData = data.graphData;
                    const importResp = await fetch(`${backendUrl}/api/graph/import`, {
                        method: 'POST',
                        headers: buildBackendHeaders(),
                        body: JSON.stringify({
                            relations: graphData.relations || [],
                            l1Memories: graphData.l1Memories || [],
                        }),
                        signal: safeTimeoutSignal(30000),
                    });
                    if (importResp.ok) {
                        const result = await importResp.json();
                        console.log(`📦 [Import] Graph data restored: ${result.relationsImported} relations`);
                    }
                }
            } catch (e: any) {
                console.warn('📦 [Import] Graph data restore failed (non-critical):', e.message);
            }
        }

        clearImportRecoveryMarker();
        callbacks.addToast('恢复成功，系统即将重启...', 'success');
        setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
        writeImportRecoveryMarker('error', sourceName, {
            sourceSize,
            current: '导入失败',
            error: error?.stack || error?.message || String(error || '未知错误'),
        });
        throw error;
    } finally {
        restoreDeviceIdentitySnapshot(deviceIdentitySnapshot);
    }
}
