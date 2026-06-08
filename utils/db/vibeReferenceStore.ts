import type { SavedVibeEncoding, SavedVibeReference } from '../../types';
import { openDB, STORE_VIBE_REFERENCES } from './core';
import { buildVibeEncodingCacheKey } from '../vibeReferences';

export const getSavedVibeReferences = async (): Promise<SavedVibeReference[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VIBE_REFERENCES)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_VIBE_REFERENCES, 'readonly').objectStore(STORE_VIBE_REFERENCES).getAll();
        request.onsuccess = () => {
            const vibes = (request.result || []) as SavedVibeReference[];
            vibes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            resolve(vibes);
        };
        request.onerror = () => reject(request.error);
    });
};

export const getSavedVibeReference = async (id: string): Promise<SavedVibeReference | null> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VIBE_REFERENCES)) return null;
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_VIBE_REFERENCES, 'readonly').objectStore(STORE_VIBE_REFERENCES).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
};

export const saveSavedVibeReference = async (vibe: SavedVibeReference): Promise<void> => {
    const db = await openDB();
    const now = Date.now();
    const record: SavedVibeReference = {
        ...vibe,
        encodings: vibe.encodings || {},
        createdAt: vibe.createdAt || now,
        updatedAt: now,
    };
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VIBE_REFERENCES, 'readwrite');
        tx.objectStore(STORE_VIBE_REFERENCES).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const renameSavedVibeReference = async (id: string, name: string): Promise<void> => {
    const vibe = await getSavedVibeReference(id);
    if (!vibe) throw new Error('Vibe 不存在');
    await saveSavedVibeReference({ ...vibe, name: name.trim() || vibe.name });
};

export const deleteSavedVibeReference = async (id: string): Promise<void> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VIBE_REFERENCES)) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VIBE_REFERENCES, 'readwrite');
        tx.objectStore(STORE_VIBE_REFERENCES).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const clearSavedVibeReferenceCache = async (id: string): Promise<void> => {
    const vibe = await getSavedVibeReference(id);
    if (!vibe) throw new Error('Vibe 不存在');
    await saveSavedVibeReference({ ...vibe, encodings: {} });
};

export const upsertSavedVibeEncoding = async (id: string, encoding: SavedVibeEncoding): Promise<void> => {
    const vibe = await getSavedVibeReference(id);
    if (!vibe) return;
    const key = buildVibeEncodingCacheKey(encoding.model, encoding.informationExtracted);
    await saveSavedVibeReference({
        ...vibe,
        encodings: {
            ...(vibe.encodings || {}),
            [key]: encoding,
        },
    });
};
