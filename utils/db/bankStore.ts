import { BankTransaction,BankFullState,DollhouseState } from '../../types';
import { openDB,STORE_BANK_TX,STORE_BANK_DATA } from './core';

// --- Bank State ---
export const getBankState = async (): Promise<BankFullState | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(STORE_BANK_DATA)) { resolve(null); return; }
        const req = db.transaction(STORE_BANK_DATA, 'readonly').objectStore(STORE_BANK_DATA).get('main_state');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
};

export const saveBankState = async (state: BankFullState): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_BANK_DATA, 'readwrite');
    const { dollhouse: _dh, ...shopWithoutDollhouse } = (state.shop || {}) as any;
    const cleanState = { ...state, shop: shopWithoutDollhouse };
    transaction.objectStore(STORE_BANK_DATA).put({ ...cleanState, id: 'main_state' });
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

// --- Dollhouse ---
export const getBankDollhouse = async (): Promise<DollhouseState | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(STORE_BANK_DATA)) { resolve(null); return; }
        const req = db.transaction(STORE_BANK_DATA, 'readonly').objectStore(STORE_BANK_DATA).get('dollhouse_state');
        req.onsuccess = () => resolve(req.result?.data || null);
        req.onerror = () => reject(req.error);
    });
};

export const saveBankDollhouse = async (state: DollhouseState): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_BANK_DATA, 'readwrite');
    transaction.objectStore(STORE_BANK_DATA).put({ id: 'dollhouse_state', data: state });
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

// --- Transactions ---
export const getAllTransactions = async (): Promise<BankTransaction[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_BANK_TX)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_BANK_TX, 'readonly').objectStore(STORE_BANK_TX).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveTransaction = async (txData: BankTransaction): Promise<void> => { const db = await openDB(); db.transaction(STORE_BANK_TX, 'readwrite').objectStore(STORE_BANK_TX).put(txData); };
export const deleteTransaction = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_BANK_TX, 'readwrite').objectStore(STORE_BANK_TX).delete(id); };
