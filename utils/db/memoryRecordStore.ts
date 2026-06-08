/**
 * Memory Record IndexedDB Store
 * Local-first CRUD for generated memory albums and their audio blobs.
 */

import type { MemoryRecord, MemoryRecordAudio } from '../../types';
import {
    openDB,
    STORE_MEMORY_RECORD_AUDIO,
    STORE_MEMORY_RECORDS,
} from './core';

export const getMemoryRecords = async (charId?: string): Promise<MemoryRecord[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MEMORY_RECORDS)) return [];

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MEMORY_RECORDS, 'readonly');
        const store = tx.objectStore(STORE_MEMORY_RECORDS);
        const request = charId ? store.index('charId').getAll(charId) : store.getAll();

        request.onsuccess = () => {
            const records = (request.result || []) as MemoryRecord[];
            resolve(records.sort((a, b) => b.createdAt - a.createdAt));
        };
        request.onerror = () => reject(request.error);
    });
};

export const getMemoryRecordById = async (id: string): Promise<MemoryRecord | null> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MEMORY_RECORDS)) return null;

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MEMORY_RECORDS, 'readonly');
        const request = tx.objectStore(STORE_MEMORY_RECORDS).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
};

export const saveMemoryRecord = async (record: MemoryRecord): Promise<void> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MEMORY_RECORDS)) return;

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MEMORY_RECORDS, 'readwrite');
        tx.objectStore(STORE_MEMORY_RECORDS).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const deleteMemoryRecord = async (id: string): Promise<void> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MEMORY_RECORDS)) return;

    return new Promise((resolve, reject) => {
        const stores = db.objectStoreNames.contains(STORE_MEMORY_RECORD_AUDIO)
            ? [STORE_MEMORY_RECORDS, STORE_MEMORY_RECORD_AUDIO]
            : [STORE_MEMORY_RECORDS];
        const tx = db.transaction(stores, 'readwrite');

        tx.objectStore(STORE_MEMORY_RECORDS).delete(id);

        if (stores.includes(STORE_MEMORY_RECORD_AUDIO)) {
            const audioIndex = tx.objectStore(STORE_MEMORY_RECORD_AUDIO).index('recordId');
            const cursorRequest = audioIndex.openCursor(IDBKeyRange.only(id));
            cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const saveMemoryRecordAudio = async (audio: MemoryRecordAudio): Promise<void> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MEMORY_RECORD_AUDIO)) return;

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MEMORY_RECORD_AUDIO, 'readwrite');
        tx.objectStore(STORE_MEMORY_RECORD_AUDIO).put(audio);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getMemoryRecordAudioEntry = async (id: string): Promise<MemoryRecordAudio | null> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MEMORY_RECORD_AUDIO)) return null;

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MEMORY_RECORD_AUDIO, 'readonly');
        const request = tx.objectStore(STORE_MEMORY_RECORD_AUDIO).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
};

export const getMemoryRecordAudio = async (id: string): Promise<Blob | null> => {
    const entry = await getMemoryRecordAudioEntry(id);
    return entry?.blob || null;
};

export const getMemoryRecordAudioByRecordId = async (recordId: string): Promise<MemoryRecordAudio[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MEMORY_RECORD_AUDIO)) return [];

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MEMORY_RECORD_AUDIO, 'readonly');
        const request = tx.objectStore(STORE_MEMORY_RECORD_AUDIO).index('recordId').getAll(recordId);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

export const deleteMemoryRecordAudio = async (id: string): Promise<void> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MEMORY_RECORD_AUDIO)) return;

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MEMORY_RECORD_AUDIO, 'readwrite');
        tx.objectStore(STORE_MEMORY_RECORD_AUDIO).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};
