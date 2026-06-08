import { APIConfig } from '../types';
import { openDB,STORE_CHAT_CONTEXT_MIRRORS } from './db/core';

export type ChatContextMirrorMessage = {
    role: string;
    content: unknown;
};

export interface ChatContextMirror {
    charId: string;
    createdAt: number;
    contextLimit: number;
    historyMsgCount: number;
    model?: string;
    messages: ChatContextMirrorMessage[];
    assistantReply: string;
    thinking: string;
}

const MAX_MIRROR_AGE_MS = 1000 * 60 * 60 * 6;

function cloneMessages(messages: ChatContextMirrorMessage[]): ChatContextMirrorMessage[] {
    return messages.map(message => ({
        role: message.role,
        content: message.content,
    }));
}

export async function saveChatContextMirror(input: {
    charId: string;
    contextLimit: number;
    historyMsgCount: number;
    model?: APIConfig['model'];
    messages: ChatContextMirrorMessage[];
    assistantReply: string;
    thinking: string;
}): Promise<void> {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_CHAT_CONTEXT_MIRRORS)) return;

    const record: ChatContextMirror = {
        charId: input.charId,
        createdAt: Date.now(),
        contextLimit: input.contextLimit,
        historyMsgCount: input.historyMsgCount,
        model: input.model,
        messages: cloneMessages(input.messages),
        assistantReply: input.assistantReply,
        thinking: input.thinking,
    };

    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CHAT_CONTEXT_MIRRORS, 'readwrite');
        const request = tx.objectStore(STORE_CHAT_CONTEXT_MIRRORS).put(record);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getChatContextMirror(charId: string): Promise<ChatContextMirror | null> {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_CHAT_CONTEXT_MIRRORS)) return null;

    const mirror = await new Promise<ChatContextMirror | undefined>((resolve, reject) => {
        const request = db.transaction(STORE_CHAT_CONTEXT_MIRRORS, 'readonly')
            .objectStore(STORE_CHAT_CONTEXT_MIRRORS)
            .get(charId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    if (!mirror) return null;
    if (Date.now() - mirror.createdAt > MAX_MIRROR_AGE_MS) return null;
    return mirror;
}
