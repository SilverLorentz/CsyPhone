import { CharacterProfile,GroupProfile,Message } from '../../types';
import { openDB,STORE_CHARACTERS,STORE_MESSAGES,STORE_GROUPS,ScheduledMessage,STORE_SCHEDULED,STORE_VECTOR_MEMORIES,STORE_MEMORY_RECORDS } from './core';
import { getUserId } from '../backendConfig';

const MESSAGE_TIME_INDEX = 'charIdTimestampId';

export interface RecentMessageWindow {
    messages: Message[];
    hasMore: boolean;
}

function getCurrentOwnerUserId(): string {
    return getUserId();
}

function belongsToCurrentOwner(item: { ownerUserId?: string | null }): boolean {
    return !item.ownerUserId || item.ownerUserId === getCurrentOwnerUserId();
}

function withCurrentOwner<T extends { ownerUserId?: string }>(item: T): T {
    return {
        ...item,
        ownerUserId: item.ownerUserId || getCurrentOwnerUserId(),
    };
}

function normalizeId(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(limit: number): number {
    return Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
}

function compareMessagesAsc(a: Message, b: Message): number {
    return a.timestamp - b.timestamp || a.id - b.id;
}

function compareMessagesDesc(a: Message, b: Message): number {
    return b.timestamp - a.timestamp || b.id - a.id;
}

function messageCharRange(charId: string): IDBKeyRange {
    return IDBKeyRange.bound([charId], [charId, []]);
}

function messageAfterTimestampRange(charId: string, afterTimestamp: number): IDBKeyRange {
    return IDBKeyRange.bound([charId, afterTimestamp], [charId, []], true, false);
}

function uniqueMessages(messages: Message[]): Message[] {
    const seen = new Set<number>();
    const unique: Message[] = [];
    for (const message of messages) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        unique.push(message);
    }
    return unique;
}

async function getAllCharactersFromDb(db: IDBDatabase): Promise<CharacterProfile[]> {
    if (!db.objectStoreNames.contains(STORE_CHARACTERS)) return [];
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_CHARACTERS, 'readonly');
        const request = transaction.objectStore(STORE_CHARACTERS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Resolve a charId to the canonical content ID (always character.id).
 * If a chinst_ ID is passed, looks up the owning character and returns its id.
 */
export const resolveCharacterContentId = async (charId: string): Promise<string> => {
    const requested = normalizeId(charId);
    if (!requested) return requested;
    // chinst_ IDs need resolution to the character's primary id
    if (!requested.startsWith('chinst_') || typeof indexedDB === 'undefined') return requested;

    try {
        const db = await openDB();
        const characters = await getAllCharactersFromDb(db);
        const found = characters.find(character =>
            normalizeId(character.charInstanceId) === requested,
        );
        return found ? normalizeId(found.id) : requested;
    } catch {
        return requested;
    }
};

/**
 * Returns all charId variants needed to read data that may have been stored
 * under either the character's primary id or its legacy charInstanceId.
 */
async function resolveCharacterReadIds(charId: string): Promise<string[]> {
    const requested = normalizeId(charId);
    if (!requested) return [];
    if (typeof indexedDB === 'undefined') return [requested];

    try {
        const db = await openDB();
        const characters = await getAllCharactersFromDb(db);
        // Find the character by either id or charInstanceId
        const found = characters.find(character =>
            character.id === requested || normalizeId(character.charInstanceId) === requested,
        );
        if (!found) return [requested];
        // Return both the primary id and the legacy charInstanceId (if different)
        const ids = [normalizeId(found.id)];
        const instanceId = normalizeId(found.charInstanceId);
        if (instanceId && instanceId !== ids[0]) ids.push(instanceId);
        return ids;
    } catch {
        return [requested];
    }
}

async function getAllByCharIds<T>(storeName: string, charIds: string[]): Promise<T[]> {
    const db = await openDB();
    if (!db.objectStoreNames.contains(storeName) || charIds.length === 0) return [];
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index('charId');
        const results: T[] = [];

        for (const charId of charIds) {
            const request = index.getAll(IDBKeyRange.only(charId));
            request.onsuccess = () => {
                results.push(...(request.result || []));
            };
        }

        transaction.oncomplete = () => resolve(results);
        transaction.onerror = () => reject(transaction.error);
    });
}

function readRecentMessagesForCharId(db: IDBDatabase, charId: string, limit: number): Promise<Message[]> {
    if (limit <= 0) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const store = transaction.objectStore(STORE_MESSAGES);

        if (!store.indexNames.contains(MESSAGE_TIME_INDEX)) {
            const request = store.index('charId').getAll(IDBKeyRange.only(charId));
            request.onsuccess = () => {
                resolve((request.result || [])
                    .filter((m: Message) => !m.groupId && belongsToCurrentOwner(m))
                    .sort(compareMessagesDesc)
                    .slice(0, limit));
            };
            request.onerror = () => reject(request.error);
            return;
        }

        const index = store.index(MESSAGE_TIME_INDEX);
        const collected: Message[] = [];
        const request = index.openCursor(messageCharRange(charId), 'prev');

        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || collected.length >= limit) {
                resolve(collected);
                return;
            }

            const message = cursor.value as Message;
            if (!message.groupId && belongsToCurrentOwner(message)) {
                collected.push(message);
            }
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
    });
}

async function readRecentMessagesByCharIds(charIds: string[], limit: number): Promise<Message[]> {
    if (charIds.length === 0 || limit <= 0) return [];
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MESSAGES)) return [];
    const batches = await Promise.all(charIds.map(id => readRecentMessagesForCharId(db, id, limit)));
    return uniqueMessages(batches.flat());
}

function countMessagesForCharId(db: IDBDatabase, charId: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const store = transaction.objectStore(STORE_MESSAGES);
        const indexName = store.indexNames.contains(MESSAGE_TIME_INDEX) ? MESSAGE_TIME_INDEX : 'charId';
        const index = store.index(indexName);
        const range = indexName === MESSAGE_TIME_INDEX ? messageCharRange(charId) : IDBKeyRange.only(charId);
        let count = 0;
        const request = index.openCursor(range);

        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(count);
                return;
            }

            const message = cursor.value as Message;
            if (!message.groupId && belongsToCurrentOwner(message)) count += 1;
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
    });
}

async function countMessagesByCharIds(charIds: string[]): Promise<number> {
    if (charIds.length === 0) return 0;
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MESSAGES)) return 0;
    const counts = await Promise.all(charIds.map(id => countMessagesForCharId(db, id)));
    return counts.reduce((sum, value) => sum + value, 0);
}

function readMessagesAfterTimestampForCharId(db: IDBDatabase, charId: string, afterTimestamp: number): Promise<Message[]> {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const store = transaction.objectStore(STORE_MESSAGES);

        if (!store.indexNames.contains(MESSAGE_TIME_INDEX)) {
            const request = store.index('charId').getAll(IDBKeyRange.only(charId));
            request.onsuccess = () => {
                resolve((request.result || [])
                    .filter((m: Message) => m.timestamp > afterTimestamp && !m.groupId && belongsToCurrentOwner(m))
                    .sort(compareMessagesAsc));
            };
            request.onerror = () => reject(request.error);
            return;
        }

        const index = store.index(MESSAGE_TIME_INDEX);
        const results: Message[] = [];
        const request = index.openCursor(messageAfterTimestampRange(charId, afterTimestamp));

        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(results);
                return;
            }

            const message = cursor.value as Message;
            if (!message.groupId && belongsToCurrentOwner(message)) {
                results.push(message);
            }
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
    });
}

function updateItemCharIdAndOwner<T extends { charId?: string; ownerUserId?: string }>(
    item: T,
    nextCharId: string,
): T {
    return withCurrentOwner({
        ...item,
        charId: nextCharId,
    });
}

// --- Characters ---
export const getAllCharacters = async (): Promise<CharacterProfile[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_CHARACTERS, 'readonly');
        const store = transaction.objectStore(STORE_CHARACTERS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

export const saveCharacter = async (character: CharacterProfile): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_CHARACTERS, 'readwrite');
    transaction.objectStore(STORE_CHARACTERS).put(character);
};

export const getCharacterById = async (id: string): Promise<CharacterProfile | undefined> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_CHARACTERS, 'readonly');
        const store = transaction.objectStore(STORE_CHARACTERS);
        const request = store.get(id);
        request.onsuccess = async () => {
            if (request.result) {
                resolve(request.result);
                return;
            }
            try {
                const characters = await getAllCharactersFromDb(db);
                resolve(characters.find(character => normalizeId(character.charInstanceId) === id) || undefined);
            } catch (error) {
                reject(error);
            }
        };
        request.onerror = () => reject(request.error);
    });
};

export const deleteCharacter = async (id: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_CHARACTERS, 'readwrite');
    transaction.objectStore(STORE_CHARACTERS).delete(id);
};

// --- Messages ---
export const getMessagesByCharId = async (charId: string): Promise<Message[]> => {
    const charIds = await resolveCharacterReadIds(charId);
    const results = await getAllByCharIds<Message>(STORE_MESSAGES, charIds);
    return results
        .filter((m: Message) => !m.groupId && belongsToCurrentOwner(m))
        .sort(compareMessagesAsc);
};

export const getRecentMessageWindow = async (charId: string, limit: number): Promise<RecentMessageWindow> => {
    const normalizedLimit = normalizeLimit(limit);
    if (normalizedLimit <= 0) return { messages: [], hasMore: false };

    const charIds = await resolveCharacterReadIds(charId);
    const candidates = await readRecentMessagesByCharIds(charIds, normalizedLimit + 1);
    candidates.sort(compareMessagesDesc);

    return {
        messages: candidates.slice(0, normalizedLimit).sort(compareMessagesAsc),
        hasMore: candidates.length > normalizedLimit,
    };
};

export const getRecentMessagesByCharId = async (charId: string, limit: number): Promise<Message[]> => {
    return (await getRecentMessageWindow(charId, limit)).messages;
};

export const getRecentMessagesWithCount = async (charId: string, limit: number): Promise<{ messages: Message[], totalCount: number }> => {
    const charIds = await resolveCharacterReadIds(charId);
    const [messages, totalCount] = await Promise.all([
        getRecentMessagesByCharId(charId, limit),
        countMessagesByCharIds(charIds),
    ]);
    return {
        messages,
        totalCount,
    };
};

export const getMessagesFromId = async (charId: string, fromId: number): Promise<{ messages: Message[], totalCount: number }> => {
    const messages = (await getMessagesByCharId(charId)).filter(m => m.id >= fromId);
    return { messages, totalCount: messages.length };
};

/**
 * Get messages for a character created after a specific timestamp.
 * Uses cursor-based filtering — only messages after `afterTimestamp` are accumulated,
 * so memory usage is O(new messages) rather than O(all messages).
 */
export const getMessagesByCharIdAfterTimestamp = async (charId: string, afterTimestamp: number): Promise<Message[]> => {
    if (!Number.isFinite(afterTimestamp)) return [];
    const charIds = await resolveCharacterReadIds(charId);
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_MESSAGES)) return [];
    const batches = await Promise.all(charIds.map(id => readMessagesAfterTimestampForCharId(db, id, afterTimestamp)));
    return uniqueMessages(batches.flat()).sort(compareMessagesAsc);
};

/**
 * Get specific messages by their IDs (for Source Tracing).
 * Returns messages in the order they were found (not necessarily input order).
 */
export const getMessagesByIds = async (ids: number[]): Promise<Message[]> => {
    if (ids.length === 0) return [];
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MESSAGES, 'readonly');
        const store = tx.objectStore(STORE_MESSAGES);
        const results: Message[] = [];
        for (const id of ids) {
            const req = store.get(id);
            req.onsuccess = () => {
                if (req.result && belongsToCurrentOwner(req.result as Message)) {
                    results.push(req.result);
                }
            };
        }
        tx.oncomplete = () => resolve(results.sort((a, b) => a.timestamp - b.timestamp));
        tx.onerror = () => reject(tx.error);
    });
};

export const saveMessage = async (msg: Omit<Message, 'id' | 'timestamp'> & { timestamp?: number }): Promise<number> => {
    const contentCharId = await resolveCharacterContentId(msg.charId);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = transaction.objectStore(STORE_MESSAGES);
        const request = store.add(withCurrentOwner({ ...msg, charId: contentCharId, timestamp: msg.timestamp ?? Date.now() }));
        request.onsuccess = () => resolve(request.result as number);
        request.onerror = () => reject(request.error);
    });
};

export const saveMessageOnceByBackendId = async (
    msg: Omit<Message, 'id' | 'timestamp'> & { timestamp?: number },
): Promise<{ saved: boolean; id?: number }> => {
    const backendMessageId = typeof msg.metadata?.backendMessageId === 'string'
        ? msg.metadata.backendMessageId
        : '';

    if (!backendMessageId) {
        const id = await saveMessage(msg);
        return { saved: true, id };
    }

    const readCharIds = await resolveCharacterReadIds(msg.charId);
    const contentCharId = readCharIds[0] || await resolveCharacterContentId(msg.charId);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = transaction.objectStore(STORE_MESSAGES);
        const index = store.index('charId');
        let settled = false;

        const settle = (result: { saved: boolean; id?: number }) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };

        let scanIndex = 0;
        const scanNextCharId = () => {
            const targetCharId = readCharIds[scanIndex];
            if (!targetCharId) {
                const addRequest = store.add(withCurrentOwner({ ...msg, charId: contentCharId, timestamp: msg.timestamp ?? Date.now() }));
                addRequest.onsuccess = () => settle({ saved: true, id: addRequest.result as number });
                addRequest.onerror = () => {
                    if (!settled) reject(addRequest.error);
                };
                return;
            }

            const request = index.openCursor(IDBKeyRange.only(targetCharId));
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    const existing = cursor.value as Message;
                    if (belongsToCurrentOwner(existing) && existing.metadata?.backendMessageId === backendMessageId) {
                        settle({ saved: false, id: existing.id });
                        return;
                    }
                    cursor.continue();
                    return;
                }

                scanIndex += 1;
                scanNextCharId();
            };
            request.onerror = () => {
                if (!settled) reject(request.error);
            };
        };

        scanNextCharId();
        transaction.onerror = () => {
            if (!settled) reject(transaction.error);
        };
    });
};

export const updateMessage = async (id: number, content: string): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const data = req.result as Message;
            if (data) {
                data.content = content;
                const putReq = store.put(data);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            } else {
                reject(new Error('Message not found'));
            }
        };
        req.onerror = () => reject(req.error);
    });
};

export const updateMessageMetadata = async (id: number, metadataUpdates: Record<string, any>): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const data = req.result as Message;
            if (data) {
                data.metadata = { ...(data.metadata || {}), ...metadataUpdates };
                const putReq = store.put(data);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            } else {
                reject(new Error('Message not found'));
            }
        };
        req.onerror = () => reject(req.error);
    });
};

/** Update a message's type (e.g. 'text' → 'voice') and optionally merge metadata in one transaction. */
export const updateMessageType = async (id: number, type: string, metadataUpdates?: Record<string, any>): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const data = req.result as Message;
            if (data) {
                data.type = type as Message['type'];
                if (metadataUpdates) {
                    data.metadata = { ...(data.metadata || {}), ...metadataUpdates };
                }
                const putReq = store.put(data);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            } else {
                reject(new Error('Message not found'));
            }
        };
        req.onerror = () => reject(req.error);
    });
};

export const deleteMessage = async (id: number): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    transaction.objectStore(STORE_MESSAGES).delete(id);
};

export const deleteMessages = async (ids: number[]): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    ids.forEach(id => store.delete(id));
    return new Promise((resolve) => { transaction.oncomplete = () => resolve(); });
};

export const clearMessages = async (charId: string): Promise<void> => {
    const charIds = await resolveCharacterReadIds(charId);
    const db = await openDB();
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    const index = store.index('charId');
    for (const targetCharId of charIds) {
        const request = index.openCursor(IDBKeyRange.only(targetCharId));
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                const m = cursor.value as Message;
                if (!m.groupId && belongsToCurrentOwner(m)) store.delete(cursor.primaryKey);
                cursor.continue();
            }
        };
    }
};

// --- Groups ---
export const getGroups = async (): Promise<GroupProfile[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_GROUPS)) return [];
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_GROUPS, 'readonly');
        const request = transaction.objectStore(STORE_GROUPS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

export const saveGroup = async (group: GroupProfile): Promise<void> => {
    const db = await openDB();
    db.transaction(STORE_GROUPS, 'readwrite').objectStore(STORE_GROUPS).put(group);
};

export const deleteGroup = async (id: string): Promise<void> => {
    const db = await openDB();
    db.transaction(STORE_GROUPS, 'readwrite').objectStore(STORE_GROUPS).delete(id);
};

export const getGroupMessages = async (groupId: string): Promise<Message[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const index = transaction.objectStore(STORE_MESSAGES).index('groupId');
        const request = index.getAll(IDBKeyRange.only(groupId));
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

export const getRecentGroupMessagesWithCount = async (groupId: string, limit: number): Promise<{ messages: Message[], totalCount: number }> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const index = transaction.objectStore(STORE_MESSAGES).index('groupId');
        const countReq = index.count(IDBKeyRange.only(groupId));
        countReq.onsuccess = () => {
            const totalCount = countReq.result;
            const collected: Message[] = [];
            const cursorReq = index.openCursor(IDBKeyRange.only(groupId), 'prev');
            cursorReq.onsuccess = () => {
                const cursor = cursorReq.result;
                if (cursor && collected.length < limit) { collected.push(cursor.value as Message); cursor.continue(); }
                else resolve({ messages: collected.reverse(), totalCount });
            };
            cursorReq.onerror = () => reject(cursorReq.error);
        };
        countReq.onerror = () => reject(countReq.error);
    });
};

// --- Scheduled Messages ---
export const saveScheduledMessage = async (msg: ScheduledMessage): Promise<void> => {
    const contentCharId = await resolveCharacterContentId(msg.charId);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SCHEDULED, 'readwrite');
        const store = tx.objectStore(STORE_SCHEDULED);
        const request = store.put(withCurrentOwner({ ...msg, charId: contentCharId }));
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
            if (tx.error) reject(tx.error);
        };
    });
};

export const getDueScheduledMessages = async (charId: string): Promise<ScheduledMessage[]> => {
    const charIds = await resolveCharacterReadIds(charId);
    const all = await getAllByCharIds<ScheduledMessage>(STORE_SCHEDULED, charIds);
    return all.filter(m => m.dueAt <= Date.now() && belongsToCurrentOwner(m));
};

export const deleteScheduledMessage = async (id: string): Promise<void> => {
    const db = await openDB();
    db.transaction(STORE_SCHEDULED, 'readwrite').objectStore(STORE_SCHEDULED).delete(id);
};

export const migrateLocalCharacterContentToInstance = async (
    legacyCharId: string,
    charInstanceId: string,
): Promise<{ messages: number; scheduledMessages: number; vectorMemories: number; memoryRecords: number }> => {
    const legacy = normalizeId(legacyCharId);
    const next = normalizeId(charInstanceId);
    if (!legacy || !next || legacy === next) {
        return { messages: 0, scheduledMessages: 0, vectorMemories: 0, memoryRecords: 0 };
    }

    const db = await openDB();
    const stores = [
        STORE_MESSAGES,
        STORE_SCHEDULED,
        STORE_VECTOR_MEMORIES,
        STORE_MEMORY_RECORDS,
    ].filter(store => db.objectStoreNames.contains(store));
    if (stores.length === 0) {
        return { messages: 0, scheduledMessages: 0, vectorMemories: 0, memoryRecords: 0 };
    }

    const counts = { messages: 0, scheduledMessages: 0, vectorMemories: 0, memoryRecords: 0 };
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(stores, 'readwrite');

        const migrateIndexedStore = (
            storeName: string,
            increment: keyof typeof counts,
            mapItem: (item: any) => any,
        ) => {
            if (!stores.includes(storeName)) return;
            const store = tx.objectStore(storeName);
            if (!store.indexNames.contains('charId')) return;
            const request = store.index('charId').openCursor(IDBKeyRange.only(legacy));
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                const item = cursor.value;
                const nextItem = mapItem(item);
                if (nextItem !== item || nextItem.charId !== item.charId) {
                    store.put(nextItem);
                    counts[increment]++;
                }
                cursor.continue();
            };
        };

        migrateIndexedStore(STORE_MESSAGES, 'messages', (item) =>
            belongsToCurrentOwner(item) ? updateItemCharIdAndOwner(item, next) : item,
        );
        migrateIndexedStore(STORE_SCHEDULED, 'scheduledMessages', (item) =>
            belongsToCurrentOwner(item) ? updateItemCharIdAndOwner(item, next) : item,
        );
        migrateIndexedStore(STORE_VECTOR_MEMORIES, 'vectorMemories', (item) => ({
            ...item,
            charId: next,
            syncState: item.syncState === 'backend_generated' ? 'pending_sync' : (item.syncState || 'pending_sync'),
            cloudSynced: false,
        }));
        migrateIndexedStore(STORE_MEMORY_RECORDS, 'memoryRecords', (item) => ({
            ...item,
            charId: next,
        }));

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });

    return counts;
};
