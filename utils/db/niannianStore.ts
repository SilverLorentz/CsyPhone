import type { NianNianSession } from '../../types/niannian';
import { openDB, STORE_NIANNIAN_SESSIONS } from './core';

export const getAllNianNianSessions = async (): Promise<NianNianSession[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_NIANNIAN_SESSIONS)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NIANNIAN_SESSIONS, 'readonly')
            .objectStore(STORE_NIANNIAN_SESSIONS)
            .getAll();
        request.onsuccess = () => resolve((request.result || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        request.onerror = () => reject(request.error);
    });
};

export const getNianNianSessionsByCharId = async (charId: string): Promise<NianNianSession[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_NIANNIAN_SESSIONS)) return [];
    return new Promise((resolve, reject) => {
        const index = db.transaction(STORE_NIANNIAN_SESSIONS, 'readonly')
            .objectStore(STORE_NIANNIAN_SESSIONS)
            .index('charId');
        const request = index.getAll(IDBKeyRange.only(charId));
        request.onsuccess = () => resolve((request.result || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        request.onerror = () => reject(request.error);
    });
};

export const getNianNianSessionById = async (id: string): Promise<NianNianSession | null> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_NIANNIAN_SESSIONS)) return null;
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NIANNIAN_SESSIONS, 'readonly')
            .objectStore(STORE_NIANNIAN_SESSIONS)
            .get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
};

export const saveNianNianSession = async (session: NianNianSession): Promise<void> => {
    const db = await openDB();
    const next = { ...session, updatedAt: session.updatedAt || Date.now() };
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NIANNIAN_SESSIONS, 'readwrite');
        tx.objectStore(STORE_NIANNIAN_SESSIONS).put(next);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const deleteNianNianSession = async (id: string): Promise<void> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_NIANNIAN_SESSIONS)) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NIANNIAN_SESSIONS, 'readwrite');
        tx.objectStore(STORE_NIANNIAN_SESSIONS).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};
