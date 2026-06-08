import type { YesterdayNewspaperPeriodType,YesterdayNewspaperRecord } from '../../types';
import { openDB,STORE_YESTERDAY_NEWSPAPERS } from './core';

export const buildYesterdayNewspaperId = (
    ownerUserId: string,
    charId: string,
    date: string,
    periodType: YesterdayNewspaperPeriodType = 'daily',
): string => periodType === 'daily'
    ? `${ownerUserId}::${charId}::${date}`
    : `${ownerUserId}::${charId}::${periodType}::${date}`;

export const getYesterdayNewspaper = async (
    ownerUserId: string,
    charId: string,
    date: string,
): Promise<YesterdayNewspaperRecord | null> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_YESTERDAY_NEWSPAPERS)) return null;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_YESTERDAY_NEWSPAPERS, 'readonly');
        const index = tx.objectStore(STORE_YESTERDAY_NEWSPAPERS).index('ownerUserIdCharIdDate');
        const request = index.get([ownerUserId, charId, date]);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
};

export const saveYesterdayNewspaper = async (
    record: YesterdayNewspaperRecord,
): Promise<void> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_YESTERDAY_NEWSPAPERS)) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_YESTERDAY_NEWSPAPERS, 'readwrite');
        tx.objectStore(STORE_YESTERDAY_NEWSPAPERS).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const markYesterdayNewspaperOpened = async (
    ownerUserId: string,
    charId: string,
    date: string,
    openedAt = Date.now(),
): Promise<YesterdayNewspaperRecord | null> => {
    const existing = await getYesterdayNewspaper(ownerUserId, charId, date);
    if (!existing) return null;
    const updated: YesterdayNewspaperRecord = {
        ...existing,
        openedAt,
        updatedAt: openedAt,
    };
    await saveYesterdayNewspaper(updated);
    return updated;
};

export const getLatestYesterdayNewspaperByPeriod = async (
    ownerUserId: string,
    charId: string,
    periodType: YesterdayNewspaperPeriodType,
): Promise<YesterdayNewspaperRecord | null> => {
    const records = await getYesterdayNewspapersByCharId(charId);
    return records
        .filter(record => record.ownerUserId === ownerUserId)
        .filter(record => (record.periodType || 'daily') === periodType)
        .sort((a, b) => (
            (b.generatedAt || b.updatedAt || b.createdAt || 0)
            - (a.generatedAt || a.updatedAt || a.createdAt || 0)
        ))[0] || null;
};

export const getYesterdayNewspapersByCharId = async (
    charId: string,
): Promise<YesterdayNewspaperRecord[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_YESTERDAY_NEWSPAPERS)) return [];
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_YESTERDAY_NEWSPAPERS, 'readonly');
        const store = tx.objectStore(STORE_YESTERDAY_NEWSPAPERS);
        const index = store.index('charIdDate');
        const request = index.openCursor(IDBKeyRange.bound([charId], [charId, []]));
        const records: YesterdayNewspaperRecord[] = [];
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(records.sort((a, b) => (
                    (b.generatedAt || b.updatedAt || b.createdAt || 0)
                    - (a.generatedAt || a.updatedAt || a.createdAt || 0)
                )));
                return;
            }
            records.push(cursor.value);
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
};
