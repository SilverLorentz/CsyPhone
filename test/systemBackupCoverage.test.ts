import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DB } from '../utils/db';
import {
    DB_NAME_CONST,
    STORE_MEMORY_RECORD_AUDIO,
    STORE_VIBE_REFERENCES,
    STORE_VOICE_AUDIO,
    STORE_YESTERDAY_NEWSPAPERS,
} from '../utils/db/core';
import {
    exportSystemData,
    importSystemData,
    SYSTEM_BACKUP_ALWAYS_STORES,
    SYSTEM_BACKUP_CONDITIONAL_STORES,
    SYSTEM_BACKUP_EXCLUDED_STORES,
    type ExportStateSnapshot,
    type ImportCallbacks,
} from '../utils/systemBackup';
import {
    DEFAULT_RUNTIME_REALTIME_CONFIG,
    DEFAULT_IMAGE_GENERATION_CONFIG,
    DEFAULT_PHOTO_STYLE_PRESETS,
} from '../utils/runtimeConfig';
import {
    DEFAULT_STT_CONFIG,
    DEFAULT_TTS_CONFIG,
    type CharacterProfile,
    type FullBackupData,
    type MemoryRecord,
} from '../types';

const noopProgress = () => {};

const makeStateSnapshot = (): ExportStateSnapshot => ({
    apiConfig: { baseUrl: '', apiKey: '', model: '' },
    apiPresets: [],
    availableModels: [],
    realtimeConfig: DEFAULT_RUNTIME_REALTIME_CONFIG,
    ttsConfig: DEFAULT_TTS_CONFIG,
    sttConfig: DEFAULT_STT_CONFIG,
    imageGenerationConfig: DEFAULT_IMAGE_GENERATION_CONFIG,
    imageApiPresets: [],
    photoStylePresets: DEFAULT_PHOTO_STYLE_PRESETS,
    theme: {
        hue: 245,
        saturation: 25,
        lightness: 65,
        wallpaper: 'linear-gradient(135deg, #fff, #eee)',
        darkMode: false,
        contentColor: '#ffffff',
    },
});

const makeCallbacks = (): ImportCallbacks => ({
    updateTheme: vi.fn(),
    updateApiConfig: vi.fn(),
    saveModels: vi.fn(),
    savePresets: vi.fn(),
    updateRealtimeConfig: vi.fn(),
    setCharacters: vi.fn(),
    setGroups: vi.fn(),
    setCustomThemes: vi.fn(),
    setUserProfile: vi.fn(),
    setWorldbooks: vi.fn(),
    setNovels: vi.fn(),
    setCustomIcons: vi.fn(),
    addToast: vi.fn(),
});

async function readBackupData(blob: Blob): Promise<FullBackupData> {
    const zip = await JSZip.loadAsync(blob);
    const dataFile = zip.file('data.json');
    if (!dataFile) throw new Error('missing data.json');
    return JSON.parse(await dataFile.async('string')) as FullBackupData;
}

async function readBackupJson(blob: Blob): Promise<{ json: string; data: FullBackupData; assetEntries: string[] }> {
    const zip = await JSZip.loadAsync(blob);
    const dataFile = zip.file('data.json');
    if (!dataFile) throw new Error('missing data.json');
    const json = await dataFile.async('string');
    const files = (zip as any).files || {};
    return {
        json,
        data: JSON.parse(json) as FullBackupData,
        assetEntries: Object.keys(files).filter(name => name.startsWith('assets/') && !files[name].dir),
    };
}

function resetIndexedDb() {
    Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
    Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });
}

async function putExternalValue(
    dbName: string,
    storeName: string,
    value: unknown,
    key?: IDBValidKey,
    options?: IDBObjectStoreParameters,
): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(storeName)) {
                request.result.createObjectStore(storeName, options);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        if (key !== undefined) store.put(value, key);
        else store.put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

async function putExistingDbValue(
    dbName: string,
    storeName: string,
    value: unknown,
    key?: IDBValidKey,
): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        if (key !== undefined) store.put(value, key);
        else store.put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

async function getExternalValue(dbName: string, storeName: string, key: IDBValidKey): Promise<unknown> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    try {
        return await new Promise((resolve, reject) => {
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

async function getExternalValues(dbName: string, storeName: string): Promise<any[]> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    try {
        return await new Promise((resolve: (items: any[]) => void, reject) => {
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

async function importWithoutReload(fileOrJson: File | string) {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => 0 as any);
    try {
        await importSystemData(fileOrJson, noopProgress, makeCallbacks());
    } finally {
        timeoutSpy.mockRestore();
    }
}

describe('system backup coverage', () => {
    const graphImportBodies: any[] = [];
    const realFetch = globalThis.fetch?.bind(globalThis);

    beforeEach(() => {
        resetIndexedDb();
        localStorage.clear();
        graphImportBodies.length = 0;

        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.includes('/api/graph/export')) {
                return new Response(JSON.stringify({
                    ok: true,
                    relations: [{ id: 'rel-1' }],
                    l1Memories: [{ id: 'l1-1' }],
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (url.includes('/api/graph/import')) {
                graphImportBodies.push(JSON.parse(String(init?.body || '{}')));
                return new Response(JSON.stringify({ relationsImported: 1, l1MemoriesImported: 1 }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            if (url.startsWith('data:') && realFetch) {
                return realFetch(input, init);
            }
            throw new Error(`Unexpected fetch: ${url}`);
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('roundtrips character voice IDs, selected localStorage keys, and optional call audio', async () => {
        const char = {
            id: 'char-a',
            name: 'Sully',
            avatar: '',
            description: '',
            systemPrompt: '',
            memories: [],
            ttsVoiceId: 'voice-clone-123',
        } as CharacterProfile;
        await DB.saveCharacter(char);
        await putExistingDbValue(DB_NAME_CONST, STORE_VOICE_AUDIO, {
            msgId: 'call_1_0',
            createdAt: 1,
            mimeType: 'audio/webm',
            dataUrl: 'data:audio/webm;base64,dm9pY2UtZGF0YQ==',
        });

        localStorage.setItem('os_sub_api_config', '{"model":"flash"}');
        localStorage.setItem('character_refine_prompts', '["soft"]');
        localStorage.setItem('os_tts_presets', '[{"name":"voice"}]');
        localStorage.setItem('netease_music_cookie', 'MUSIC_U=secret');
        localStorage.setItem('chat_auto_tts_char-a', 'true');
        localStorage.setItem('csyos_backend_alive', '{"alive":true}');
        localStorage.setItem('vector_memory_batch_checkpoint:char-a', '{"cursor":1}');

        const noAudioData = await readBackupData(await exportSystemData('full', makeStateSnapshot(), noopProgress));
        expect(noAudioData.voiceAudio).toBeUndefined();

        const backupBlob = await exportSystemData('full', makeStateSnapshot(), noopProgress, { includeVoiceAudio: true });
        const data = await readBackupData(backupBlob);

        expect(data.version).toBe(3);
        expect(data.characters?.[0].ttsVoiceId).toBe('voice-clone-123');
        expect(data.voiceAudio?.[0].msgId).toBe('call_1_0');
        expect(data.voiceAudio?.[0].dataUrl).toMatch(/^assets\/.*\.webm$/);
        expect(data.extraLocalStorageConfig?.os_sub_api_config).toBe('{"model":"flash"}');
        expect(data.extraLocalStorageConfig?.character_refine_prompts).toBe('["soft"]');
        expect(data.extraLocalStorageConfig?.os_tts_presets).toBe('[{"name":"voice"}]');
        expect(data.extraLocalStorageConfig?.netease_music_cookie).toBe('MUSIC_U=secret');
        expect(data.extraLocalStorageConfig?.['chat_auto_tts_char-a']).toBe('true');
        expect(data.extraLocalStorageConfig?.csyos_backend_alive).toBeUndefined();
        expect(data.extraLocalStorageConfig?.['vector_memory_batch_checkpoint:char-a']).toBeUndefined();

        resetIndexedDb();
        localStorage.clear();
        await importWithoutReload(new File([backupBlob], 'backup.zip', { type: 'application/zip' }));

        const restoredChars = await DB.getAllCharacters();
        const restoredAudio = await DB.getVoiceAudio('call_1_0');
        expect(restoredChars[0].ttsVoiceId).toBe('voice-clone-123');
        expect(await restoredAudio?.text()).toBe('voice-data');
        expect(localStorage.getItem('os_sub_api_config')).toBe('{"model":"flash"}');
        expect(localStorage.getItem('chat_auto_tts_char-a')).toBe('true');
        expect(localStorage.getItem('csyos_backend_alive')).toBeNull();
    }, 15000);

    it('roundtrips image generation settings, saved image references, newspapers, and HalfSugar data', async () => {
        await DB.saveCharacter({
            id: 'char-a',
            name: 'Sully',
            avatar: '',
            description: '',
            systemPrompt: '',
            memories: [],
        } as CharacterProfile);
        await putExistingDbValue(DB_NAME_CONST, STORE_VIBE_REFERENCES, {
            id: 'vibe-a',
            name: '参考图',
            imageDataUrl: 'data:image/png;base64,dmliZQ==',
            defaultStrength: 0.6,
            defaultInformationExtracted: 1,
            encodings: {},
            source: 'image',
            createdAt: 1,
            updatedAt: 1,
        });
        await putExistingDbValue(DB_NAME_CONST, STORE_YESTERDAY_NEWSPAPERS, {
            id: 'paper-a',
            ownerUserId: 'owner-a',
            charId: 'char-a',
            date: '2026-05-27',
            createdAt: 1,
            updatedAt: 1,
            content: { title: '昨日小报' },
        });
        await putExternalValue('halfsugar-health', 'meals', {
            id: 'meal-a',
            date: '2026-05-28',
            type: 'breakfast',
            foods: [],
            photoUrl: 'data:image/png;base64,bWVhbA==',
            totalCalories: 100,
            totalProtein: 10,
            totalCarbs: 12,
            totalFat: 3,
            source: 'manual',
            createdAt: 1,
            updatedAt: 1,
        }, undefined, { keyPath: 'id' });
        localStorage.setItem('chat_today_schedule_enabled_char-a', 'true');
        localStorage.setItem('date_translation_char-a', 'true');
        localStorage.setItem('theater_custom_locations', '[{"id":"loc-a"}]');
        localStorage.setItem('trajectory_nodes_char-a', '[{"id":"node-a"}]');
        localStorage.setItem('crosstime_rooms', '[{"id":"room-a"}]');
        localStorage.setItem('loveshow_season_index', '["season-a"]');

        const state = makeStateSnapshot();
        state.imageGenerationConfig = {
            ...DEFAULT_IMAGE_GENERATION_CONFIG,
            activeProvider: 'openai-compatible',
            openaiCompatible: {
                ...DEFAULT_IMAGE_GENERATION_CONFIG.openaiCompatible,
                baseUrl: 'https://image.example/v1',
                apiKey: 'image-key',
                model: 'gpt-image-test',
            },
        };
        state.imageGenerationDraftConfig = {
            ...DEFAULT_IMAGE_GENERATION_CONFIG,
            novelai: {
                ...DEFAULT_IMAGE_GENERATION_CONFIG.novelai,
                apiToken: 'draft-nai-token',
            },
        };
        state.imageApiPresets = [{
            id: 'image-api-a',
            name: '测试生图接口',
            config: state.imageGenerationConfig,
            createdAt: 1,
            updatedAt: 1,
        }];
        state.photoStylePresets = [{
            id: 'style-a',
            name: '测试风格',
            providerScope: 'openai-gpt',
            positivePrompt: 'soft light',
            negativePrompt: '',
        }];

        const backupBlob = await exportSystemData('full', state, noopProgress);
        const data = await readBackupData(backupBlob);

        expect(data.imageGenerationConfig?.openaiCompatible.apiKey).toBe('image-key');
        expect(data.imageGenerationDraftConfig?.novelai.apiToken).toBe('draft-nai-token');
        expect(data.imageApiPresets?.[0].name).toBe('测试生图接口');
        expect(data.photoStylePresets?.[0].id).toBe('style-a');
        expect(data.vibeReferences?.[0].id).toBe('vibe-a');
        expect(data.vibeReferences?.[0].imageDataUrl).toMatch(/^assets\/.*\.png$/);
        expect(data.yesterdayNewspapers?.[0].id).toBe('paper-a');
        expect(data.halfSugarData?.stores.meals?.[0].id).toBe('meal-a');
        expect(data.halfSugarData?.stores.meals?.[0].photoUrl).toMatch(/^assets\/.*\.png$/);
        expect(data.extraLocalStorageConfig?.['chat_today_schedule_enabled_char-a']).toBe('true');
        expect(data.extraLocalStorageConfig?.theater_custom_locations).toContain('loc-a');
        expect(data.extraLocalStorageConfig?.['trajectory_nodes_char-a']).toContain('node-a');
        expect(data.extraLocalStorageConfig?.crosstime_rooms).toContain('room-a');
        expect(data.extraLocalStorageConfig?.loveshow_season_index).toContain('season-a');

        resetIndexedDb();
        localStorage.clear();
        await importWithoutReload(new File([backupBlob], 'backup.zip', { type: 'application/zip' }));

        const restoredVibes = await DB.getRawStoreData(STORE_VIBE_REFERENCES);
        const restoredPapers = await DB.getRawStoreData(STORE_YESTERDAY_NEWSPAPERS);
        const restoredMeals = await getExternalValues('halfsugar-health', 'meals');
        expect(JSON.parse(localStorage.getItem('os_image_generation_config') || '{}').openaiCompatible.apiKey).toBe('image-key');
        expect(JSON.parse(localStorage.getItem('os_image_generation_config_draft') || '{}').novelai.apiToken).toBe('draft-nai-token');
        expect(JSON.parse(localStorage.getItem('os_image_api_presets') || '[]')[0].name).toBe('测试生图接口');
        expect(JSON.parse(localStorage.getItem('os_photo_style_presets') || '[]')[0].id).toBe('style-a');
        expect(restoredVibes[0].imageDataUrl).toBe('data:image/png;base64,dmliZQ==');
        expect(restoredPapers[0].id).toBe('paper-a');
        expect(restoredMeals[0].photoUrl).toBe('data:image/png;base64,bWVhbA==');
        expect(localStorage.getItem('chat_today_schedule_enabled_char-a')).toBe('true');
        expect(localStorage.getItem('date_translation_char-a')).toBe('true');
    }, 15000);

    it('can export cloud-friendly memory record drafts without song audio', async () => {
        const record: MemoryRecord = {
            id: 'mrec-cloud',
            charId: 'char-a',
            charName: 'Sully',
            userName: '你',
            mode: 'dream_mix',
            status: 'ready',
            title: '月光唱片',
            albumName: '回声唱片匣',
            artistName: 'Sully',
            monologueText: '开场独白',
            lyrics: '[verse]\n一小段歌词',
            musicPrompt: 'soft piano ballad',
            coverGradient: 'linear-gradient(135deg,#111,#333)',
            seedMemoryIds: [],
            createdAt: 1,
            updatedAt: 2,
            durationMs: 123000,
            lyricsOffsetMs: 1200,
            lyricTiming: {
                sourceHash: 'hash',
                lineTimesMs: [1200],
                updatedAt: 2,
            },
            monologueAudioId: 'mrec-cloud:monologue',
            musicAudioId: 'mrec-cloud:music',
            masterAudioId: 'mrec-cloud:master',
        };
        await DB.saveMemoryRecord(record);
        await putExistingDbValue(DB_NAME_CONST, STORE_MEMORY_RECORD_AUDIO, {
            id: 'mrec-cloud:master',
            recordId: 'mrec-cloud',
            kind: 'master',
            blob: new Blob(['song-audio'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationMs: 123000,
            createdAt: 2,
            dataUrl: 'data:audio/mpeg;base64,c29uZy1hdWRpbw==',
        });

        const fullData = await readBackupData(await exportSystemData('full', makeStateSnapshot(), noopProgress));
        expect(fullData.memoryRecordAudio?.[0].dataUrl).toMatch(/^assets\/.*\.mp3$/);
        expect(fullData.memoryRecords?.[0].masterAudioId).toBe('mrec-cloud:master');

        const cloudData = await readBackupData(await exportSystemData('full', makeStateSnapshot(), noopProgress, {
            includeMemoryRecordAudio: false,
        }));
        const cloudRecord = cloudData.memoryRecords?.[0];

        expect(cloudData.memoryRecordAudio).toBeUndefined();
        expect(cloudRecord?.lyrics).toContain('一小段歌词');
        expect(cloudRecord?.status).toBe('draft');
        expect(cloudRecord?.monologueAudioId).toBeUndefined();
        expect(cloudRecord?.musicAudioId).toBeUndefined();
        expect(cloudRecord?.masterAudioId).toBeUndefined();
        expect(cloudRecord?.durationMs).toBeUndefined();
        expect(cloudRecord?.lyricsOffsetMs).toBeUndefined();
        expect(cloudRecord?.lyricTiming).toBeUndefined();
    }, 15000);

    it('exports only restorable memory record audio and skips cache rows', async () => {
        const record: MemoryRecord = {
            id: 'mrec-slim',
            charId: 'char-a',
            charName: 'Sully',
            userName: '你',
            mode: 'dream_mix',
            status: 'ready',
            title: '月光唱片',
            albumName: '回声唱片匣',
            artistName: 'Sully',
            monologueText: '开场独白',
            lyrics: '[verse]\n一小段歌词',
            musicPrompt: 'soft piano ballad',
            coverGradient: 'linear-gradient(135deg,#111,#333)',
            seedMemoryIds: [],
            createdAt: 1,
            updatedAt: 2,
            durationMs: 123000,
            lyricsOffsetMs: 1200,
            monologueAudioId: 'mrec-slim:monologue',
            musicAudioId: 'mrec-slim:music',
            masterAudioId: 'mrec-slim:master',
        };
        await DB.saveMemoryRecord(record);

        await putExistingDbValue(DB_NAME_CONST, STORE_MEMORY_RECORD_AUDIO, {
            id: 'mrec-slim:monologue',
            recordId: 'mrec-slim',
            kind: 'monologue',
            blob: new Blob(['monologue-audio'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            dataUrl: 'data:audio/mpeg;base64,bW9ub2xvZ3VlLWF1ZGlv',
            createdAt: 1,
        });
        await putExistingDbValue(DB_NAME_CONST, STORE_MEMORY_RECORD_AUDIO, {
            id: 'mrec-slim:music',
            recordId: 'mrec-slim',
            kind: 'music',
            blob: new Blob(['music-audio'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            dataUrl: 'data:audio/mpeg;base64,bXVzaWMtYXVkaW8=',
            createdAt: 2,
        });
        await putExistingDbValue(DB_NAME_CONST, STORE_MEMORY_RECORD_AUDIO, {
            id: 'mrec-slim:master',
            recordId: 'mrec-slim',
            kind: 'master',
            blob: new Blob(['master-audio'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationMs: 123000,
            dataUrl: 'data:audio/mpeg;base64,bWFzdGVyLWF1ZGlv',
            createdAt: 3,
        });
        await putExistingDbValue(DB_NAME_CONST, STORE_MEMORY_RECORD_AUDIO, {
            id: 'bgm-theater-cache',
            recordId: '__theater_bgm__',
            kind: 'music',
            blob: new Blob(['cached-bgm'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            dataUrl: 'data:audio/mpeg;base64,Y2FjaGVkLWJnbQ==',
            createdAt: 4,
        });
        await putExistingDbValue(DB_NAME_CONST, STORE_MEMORY_RECORD_AUDIO, {
            id: 'orphan-audio',
            recordId: 'missing-record',
            kind: 'music',
            blob: new Blob(['orphan-audio'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            dataUrl: 'data:audio/mpeg;base64,b3JwaGFuLWF1ZGlv',
            createdAt: 5,
        });

        const backupBlob = await exportSystemData('full', makeStateSnapshot(), noopProgress);
        const data = await readBackupData(backupBlob);

        expect(data.memoryRecordAudio?.map(item => item.id)).toEqual(['mrec-slim:master']);
        expect(data.memoryRecords?.[0].masterAudioId).toBe('mrec-slim:master');
        expect(data.memoryRecords?.[0].monologueAudioId).toBeUndefined();
        expect(data.memoryRecords?.[0].musicAudioId).toBeUndefined();

        resetIndexedDb();
        localStorage.clear();
        await importWithoutReload(new File([backupBlob], 'backup.zip', { type: 'application/zip' }));

        const restoredRecord = await DB.getMemoryRecordById('mrec-slim');
        const restoredMaster = await DB.getMemoryRecordAudio('mrec-slim:master');
        expect(restoredRecord?.masterAudioId).toBe('mrec-slim:master');
        expect(restoredRecord?.monologueAudioId).toBeUndefined();
        expect(restoredRecord?.musicAudioId).toBeUndefined();
        expect(await restoredMaster?.text()).toBe('master-audio');
        expect(await DB.getMemoryRecordAudio('mrec-slim:music')).toBeNull();
        expect(await DB.getMemoryRecordAudio('bgm-theater-cache')).toBeNull();
    }, 15000);

    it('does not export or restore device identity localStorage keys', async () => {
        localStorage.setItem('csyos_user_id', 'csy-user-original');
        localStorage.setItem('csyos_client_id', 'csy-client-original');
        localStorage.setItem('os_sub_api_config', '{"model":"flash"}');
        await DB.saveAsset('csyos_user_id', 'existing-user-asset');

        const data = await readBackupData(await exportSystemData('full', makeStateSnapshot(), noopProgress));
        expect(data.extraLocalStorageConfig?.csyos_user_id).toBeUndefined();
        expect(data.extraLocalStorageConfig?.csyos_client_id).toBeUndefined();

        const pollutedIdentityBackup = {
            timestamp: Date.now(),
            version: 3,
            csyos_user_id: 'csy-user-from-top-level',
            csyosClientId: 'csy-client-from-top-level',
            assets: [
                { id: 'csyos_user_id', data: 'asset-user-from-backup' },
                { id: 'safe_asset', data: 'safe-value' },
            ],
            customIcons: {
                csyos_client_id: 'icon-client-from-backup',
                Calendar: 'calendar-icon',
            },
            appearancePresets: [
                { id: 'csyos_client_id', name: 'bad preset' },
                { id: 'preset-safe', name: 'safe preset' },
            ],
            extraLocalStorageConfig: {
                csyos_user_id: 'csy-user-from-backup',
                csyos_client_id: 'csy-client-from-backup',
                os_sub_api_config: '{"model":"restored"}',
            },
        };

        await importWithoutReload(JSON.stringify(pollutedIdentityBackup));

        expect(localStorage.getItem('csyos_user_id')).toBe('csy-user-original');
        expect(localStorage.getItem('csyos_client_id')).toBe('csy-client-original');
        expect(localStorage.getItem('os_sub_api_config')).toBe('{"model":"restored"}');
        expect(await DB.getAsset('csyos_user_id')).toBe('existing-user-asset');
        expect(await DB.getAsset('safe_asset')).toBe('safe-value');
        expect(await DB.getAsset('icon_csyos_client_id')).toBeNull();
        expect(await DB.getAsset('icon_Calendar')).toBe('calendar-icon');
        expect(await DB.getAsset('appearance_preset_csyos_client_id')).toBeNull();
        expect(await DB.getAsset('appearance_preset_preset-safe')).toContain('safe preset');

        const zip = new JSZip();
        zip.file('data.json', JSON.stringify({
            ...pollutedIdentityBackup,
            extraLocalStorageConfig: {
                csyos_user_id: 'csy-user-from-zip',
                csyos_client_id: 'csy-client-from-zip',
                os_sub_api_config: '{"model":"zip-restored"}',
            },
        }));
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        await importWithoutReload(new File([zipBlob], 'polluted-device-id.zip', { type: 'application/zip' }));

        expect(localStorage.getItem('csyos_user_id')).toBe('csy-user-original');
        expect(localStorage.getItem('csyos_client_id')).toBe('csy-client-original');
        expect(localStorage.getItem('os_sub_api_config')).toBe('{"model":"zip-restored"}');
    });

    it('restores the original device identity even when import fails', async () => {
        localStorage.setItem('csyos_user_id', 'csy-user-original');
        localStorage.setItem('csyos_client_id', 'csy-client-original');

        const importSpy = vi.spyOn(DB, 'importFullData').mockImplementation(async () => {
            localStorage.setItem('csyos_user_id', 'csy-user-during-import');
            localStorage.setItem('csyos_client_id', 'csy-client-during-import');
            throw new Error('import failed');
        });

        await expect(importWithoutReload(JSON.stringify({
            timestamp: Date.now(),
            version: 3,
            extraLocalStorageConfig: {
                csyos_user_id: 'csy-user-from-backup',
                csyos_client_id: 'csy-client-from-backup',
            },
        }))).rejects.toThrow('import failed');

        expect(localStorage.getItem('csyos_user_id')).toBe('csy-user-original');
        expect(localStorage.getItem('csyos_client_id')).toBe('csy-client-original');

        importSpy.mockRestore();
    });

    it('roundtrips music profile background and custom player skins', async () => {
        await putExternalValue(
            'music_profile_bg_db',
            'backgrounds',
            'data:image/png;base64,cHJvZmlsZS1iZw==',
            'custom_bg',
        );
        await putExternalValue(
            'music_custom_skins',
            'skins',
            { id: 'custom-skin-1', name: '雨夜', blob: 'data:image/jpeg;base64,c2tpbi1pbWFnZQ==' },
            undefined,
            { keyPath: 'id' },
        );
        localStorage.setItem('music_profile_bg_setting', '{"type":"custom"}');
        localStorage.setItem('music_player_skin', 'custom-skin-1');

        const backupBlob = await exportSystemData('media_only', makeStateSnapshot(), noopProgress);
        const data = await readBackupData(backupBlob);

        expect(data.musicAssets?.profileBackground?.dataUrl).toMatch(/^assets\/.*\.png$/);
        expect(data.musicAssets?.customSkins?.[0]).toMatchObject({ id: 'custom-skin-1', name: '雨夜' });
        expect(data.extraLocalStorageConfig?.music_profile_bg_setting).toBe('{"type":"custom"}');
        expect(data.extraLocalStorageConfig?.music_player_skin).toBe('custom-skin-1');

        resetIndexedDb();
        localStorage.clear();
        await importWithoutReload(new File([backupBlob], 'backup.zip', { type: 'application/zip' }));

        const restoredBg = await getExternalValue('music_profile_bg_db', 'backgrounds', 'custom_bg');
        const restoredSkins = await getExternalValues('music_custom_skins', 'skins');

        expect(typeof (restoredBg as Blob).text).toBe('function');
        expect(await (restoredBg as Blob).text()).toBe('profile-bg');
        expect(restoredSkins).toHaveLength(1);
        expect(restoredSkins[0].id).toBe('custom-skin-1');
        expect(await restoredSkins[0].blob.text()).toBe('skin-image');
        expect(localStorage.getItem('music_profile_bg_setting')).toBe('{"type":"custom"}');
    });

    it('deduplicates exported asset files and omits raw appearance and dropped compatibility rows', async () => {
        const sharedImage = 'data:image/png;base64,c2hhcmVkLWltYWdl';
        const customFont = 'data:font/ttf;base64,Zm9udC1ieXRlcw==';
        const state = makeStateSnapshot();
        state.theme = {
            ...state.theme,
            wallpaper: sharedImage,
            launcherWidgets: { tl: sharedImage },
            customFont,
        };

        await DB.saveAsset('wallpaper', sharedImage);
        await DB.saveAsset('custom_font_data', customFont);
        await DB.saveAsset('icon_Chat', sharedImage);
        await DB.saveAsset('sullyos_upstream_compat_payload', JSON.stringify({
            oldPayload: [{ id: 'dropped-old-asset', image: sharedImage }],
        }));
        await DB.saveAsset('appearance_preset_ap_dup', JSON.stringify({
            id: 'ap_dup',
            name: 'SULLY',
            createdAt: 1,
            theme: {
                ...state.theme,
                desktopDecorations: [{
                    id: 'deco-a',
                    type: 'image',
                    content: sharedImage,
                    x: 50,
                    y: 50,
                    scale: 1,
                    rotation: 0,
                    opacity: 1,
                    zIndex: 1,
                }],
            },
            customIcons: { Chat: sharedImage },
        }));

        const backupBlob = await exportSystemData('full', state, noopProgress);
        const { json, data, assetEntries } = await readBackupJson(backupBlob);

        expect(json).not.toContain('c2hhcmVkLWltYWdl');
        expect(json).not.toContain('Zm9udC1ieXRlcw==');
        expect(data.assets?.some(asset => asset.id === 'wallpaper')).toBe(false);
        expect(data.assets?.some(asset => asset.id === 'custom_font_data')).toBe(false);
        expect(data.assets?.some(asset => asset.id === 'icon_Chat')).toBe(false);
        expect(data.assets?.some(asset => asset.id === 'appearance_preset_ap_dup')).toBe(false);
        expect(data.assets?.some(asset => asset.id === 'sullyos_upstream_compat_payload')).toBe(false);
        expect(data.theme?.wallpaper).toMatch(/^assets\/.*\.png$/);
        expect(data.theme?.launcherWidgets?.tl).toBe(data.theme?.wallpaper);
        expect(data.customIcons?.Chat).toBe(data.theme?.wallpaper);
        expect(data.appearancePresets?.[0].theme.wallpaper).toBe(data.theme?.wallpaper);
        expect(data.theme?.customFont).toMatch(/^assets\/.*\.ttf$/);
        expect(assetEntries.filter(name => name.endsWith('.png'))).toHaveLength(1);
        expect(assetEntries.filter(name => name.endsWith('.ttf'))).toHaveLength(1);

        resetIndexedDb();
        localStorage.clear();
        await importWithoutReload(new File([backupBlob], 'backup.zip', { type: 'application/zip' }));

        expect(await DB.getAsset('wallpaper')).toBe(sharedImage);
        expect(await DB.getAsset('widget_tl')).toBe(sharedImage);
        expect(await DB.getAsset('custom_font_data')).toBe(customFont);
        expect(await DB.getAsset('icon_Chat')).toBe(sharedImage);
        expect(await DB.getAsset('appearance_preset_ap_dup')).toContain('SULLY');
        expect(await DB.getAsset('sullyos_upstream_compat_payload')).toBeNull();
    }, 15000);

    it('declares every primary IndexedDB store in the backup coverage map', () => {
        const coreSource = fs.readFileSync(path.join(process.cwd(), 'utils/db/core.ts'), 'utf8');
        const stores = [...coreSource.matchAll(/export const STORE_[A-Z0-9_]+ = '([^']+)'/g)].map(match => match[1]);
        const coveredStores = new Set([
            ...SYSTEM_BACKUP_ALWAYS_STORES,
            ...SYSTEM_BACKUP_CONDITIONAL_STORES,
            ...SYSTEM_BACKUP_EXCLUDED_STORES,
        ]);

        expect(stores.filter(store => !coveredStores.has(store))).toEqual([]);
    });

    it('restores graph relations and L1 memories through the backend import API', async () => {
        await importWithoutReload(JSON.stringify({
            timestamp: Date.now(),
            version: 3,
            graphData: {
                relations: [{ id: 'rel-a' }],
                l1Memories: [{ id: 'l1-a' }],
            },
        }));

        expect(graphImportBodies[graphImportBodies.length - 1]).toEqual({
            relations: [{ id: 'rel-a' }],
            l1Memories: [{ id: 'l1-a' }],
        });
    });

});
