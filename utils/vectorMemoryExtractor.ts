/**
 * Vector Memory Extractor — Write Path
 * 
 * Two modes:
 *   1. maybeExtract()  — auto mode, fires after every AI reply, checks interval
 *   2. batchExtractFromMessages() — manual mode, processes a user-specified message range
 * 
 * Both use the same LLM prompt to extract 1-3 memories per window,
 * embed them via the Embedding API, and store in IndexedDB.
 */

import { CharacterProfile,VectorMemory,APIConfig,Message } from '../types';
import { DB } from './db';
import { extractHormoneSnapshot,computeSalience } from './hormoneDynamics';
import { pullMemories,tryBackendExtraction,pushMemories } from './backendClient';
import { MindSnapshotExtractor } from './mindSnapshotExtractor';
import { VectorMemoryBatchCheckpoint } from './vectorMemoryBatchCheckpoint';
import {
    normalizeVectorMemorySyncState,
    markVectorMemoryAsSynced,
} from './vectorMemorySyncState';
import { buildExtractionPrompt, formatMessages, callLLM } from './engines/extractionLlm';
import { formatMessageForContext } from './messageContext';
import { normalizeMessageForVectorExtraction } from './messageCompatibility';
import {
    hasExtractionLock,
    acquireExtractionLock,
    releaseExtractionLock,
    processResult,
} from './engines/extractionProcessor';

// Tail buffer: exclude the N most recent messages from auto-extraction
// to prevent extracting memories from messages the user might roll/regenerate.
const TAIL_BUFFER = 20;
export const VECTOR_EXTRACTION_MEMORY_CONTEXT_LIMIT = 200;

type ExtractionMemoryHeader = {
    id: string;
    title: string;
    content?: string;
    importance: number;
    createdAt?: number;
    deprecated?: boolean;
};

interface BatchExtractOptions {
    checkpoint?: VectorMemoryBatchCheckpoint | null;
    onCheckpoint?: (checkpoint: VectorMemoryBatchCheckpoint) => void;
}

interface DirectExtractOptions {
    reason?: string;
    retryReason?: string;
    userInitiated?: boolean;
}

function normalizeProvidedExtractionMessages(messages: Message[]): Message[] {
    return messages
        .filter(message => (
            (message.role === 'user' || message.role === 'assistant' || message.role === 'system')
            && typeof message.content === 'string'
            && message.content.trim().length > 0
        ))
        .map(message => ({
            ...message,
            // Date/theater recap compression may hide raw messages from UI, but
            // explicit L0 extraction still needs the original record.
            metadata: { ...(message.metadata || {}), hiddenFromUser: false },
        }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

export function selectExtractionMemoryHeaders<T extends ExtractionMemoryHeader>(headers: T[]): T[] {
    return [...headers]
        .filter(h => !h.deprecated)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, VECTOR_EXTRACTION_MEMORY_CONTEXT_LIMIT);
}

async function resolveEffectiveLastExtractAt(charId: string, charSnapshot: CharacterProfile): Promise<number> {
    const freshChar = await DB.getCharacterById(charId);
    let lastExtractAt = freshChar?.vectorMemoryLastExtractAt || charSnapshot.vectorMemoryLastExtractAt || 0;

    if (lastExtractAt > 0) {
        try {
            const vectorCount = await DB.countVectorMemories(charId);
            if (vectorCount === 0 && freshChar) {
                freshChar.vectorMemoryLastExtractAt = 0;
                await DB.saveCharacter(freshChar);
                lastExtractAt = 0;
                console.warn('🧠 [VectorExtract] Reset stale lastExtractAt because local vector memories are empty:', charId);
            }
        } catch (error) {
            console.warn('🧠 [VectorExtract] Failed to validate lastExtractAt:', error);
        }
    }

    return lastExtractAt;
}

export const VectorMemoryExtractor = {

    /**
     * Auto mode — check if enough new messages, then extract.
     * Safe to call frequently; returns immediately if conditions aren't met.
     */
    async maybeExtract(
        charSnapshot: CharacterProfile,
        apiConfig: APIConfig,
        embeddingApiKey: string,
        subApiConfig?: { baseUrl: string; model: string; apiKey: string },
    ): Promise<void> {
        const charId = charSnapshot.id;
        // Fire-and-forget retry for memories that previously failed cloud sync.
        DB.getUnsyncedVectorMemories(charId)
            .then(async unsyncedMemories => {
                if (unsyncedMemories.length === 0) return;
                console.log(`☁️ [CloudSync] Retrying ${unsyncedMemories.length} unsynced memories for ${charSnapshot.name}...`);
                const pushResult = await pushMemories(charId, unsyncedMemories);
                if (!pushResult) {
                    console.log(`☁️ [CloudSync] Retry push failed for ${charSnapshot.name}, will retry later.`);
                    return;
                }

                for (const memory of unsyncedMemories) {
                    await DB.saveVectorMemory(markVectorMemoryAsSynced(memory));
                }
                console.log(`☁️ [CloudSync] Retry push success: marked ${unsyncedMemories.length} memories as synced for ${charSnapshot.name}.`);
            })
            .catch(err => console.warn('☁️ [CloudSync] Retry scan failed:', err));

        if (hasExtractionLock(charId)) {
            console.log('🧠 [VectorExtract] Already extracting for', charId);
            return;
        }

        const interval = charSnapshot.vectorMemoryExtractInterval || 30;
        // 🔧 Fix: 从 DB 读取最新的 lastExtractAt，而非依赖可能过时的 React 快照
        // React 状态在 batchExtractFromMessages 更新 DB 后不会自动同步，
        // 导致此处拿到 lastExtractAt=0，从而拉取全部历史消息造成重复向量化
        const lastExtractAt = await resolveEffectiveLastExtractAt(charId, charSnapshot);

        // Incremental load: only fetch messages after lastExtractAt
        // to avoid loading all historical messages into memory.
        const msgsAfterExtract = await DB.getMessagesByCharIdAfterTimestamp(charId, lastExtractAt);
        const allNewMsgs = msgsAfterExtract
            .map(m => normalizeMessageForVectorExtraction(m))
            .filter((m): m is Message => Boolean(m));

        // Exclude the newest TAIL_BUFFER messages — they're in the "draft zone"
        // and might be rolled/regenerated by the user.
        let newMsgs = allNewMsgs.length > TAIL_BUFFER
            ? allNewMsgs.slice(0, -TAIL_BUFFER)
            : [];

        if (newMsgs.length < interval) {
            console.log(`🧠 [VectorExtract] Only ${newMsgs.length}/${interval} settled msgs (${allNewMsgs.length} total, ${TAIL_BUFFER} buffered). Skipping.`);
            return;
        }

        // 🔧 防爆冲熔断：如果积压消息远超 interval，说明有大量搬家/导入的历史数据
        // 自动模式只处理最新的一小批，剩余交给用户手动在记忆中心批量提取
        const MAX_AUTO_WINDOW = interval * 3;
        if (newMsgs.length > MAX_AUTO_WINDOW) {
            console.log(`🧠 [VectorExtract] ⚡ Backlog detected: ${newMsgs.length} msgs exceeds cap ${MAX_AUTO_WINDOW}. Auto-mode will only process the latest ${MAX_AUTO_WINDOW}.`);
            // 快进 lastExtractAt 到被跳过消息的末尾，防止下次再拉到同一批积压
            const skipBoundary = newMsgs[newMsgs.length - MAX_AUTO_WINDOW - 1];
            if (skipBoundary) {
                try {
                    const fcSkip = await DB.getCharacterById(charId);
                    if (fcSkip) {
                        fcSkip.vectorMemoryLastExtractAt = skipBoundary.timestamp;
                        await DB.saveCharacter(fcSkip);
                        console.log(`🧠 [VectorExtract] Fast-forwarded lastExtractAt past ${newMsgs.length - MAX_AUTO_WINDOW} backlogged msgs to ${new Date(skipBoundary.timestamp).toLocaleString()}`);
                    }
                } catch { /* silent */ }
            }
            // 只保留最新的 MAX_AUTO_WINDOW 条进行处理
            newMsgs = newMsgs.slice(-MAX_AUTO_WINDOW);
        }

        acquireExtractionLock(charId);
        console.log(`🧠 [VectorExtract] Starting auto-extract for ${charSnapshot.name} (${newMsgs.length} new)`);
        const emojis = await DB.getEmojis().catch(() => []);

        // ========== Backend-First Extraction ==========
        try {
            const backendMsgs = newMsgs.map(m => {
                const content = formatMessageForContext(m, {
                    surface: 'memoryExtraction',
                    charName: charSnapshot.name,
                    emojis,
                    compact: true,
                    maxContentChars: 300,
                }) || m.content;
                return {
                    role: m.role, content, type: m.type,
                    timestamp: m.timestamp || Date.now(),
                    id: m.id,
                };
            });
            const handled = await tryBackendExtraction(
                charId, charSnapshot.name, backendMsgs, subApiConfig,
            );
            if (handled) {
                console.log('🔗 [VectorExtract] Backend handled extraction, updating lastExtractAt');
                const cloudMemories = await pullMemories(charId, {
                    includeDeprecated: true,
                    vectors: true,
                }).catch(() => null);
                if (cloudMemories) {
                    await DB.replaceVectorMemories(charId, cloudMemories);
                }
                const lastTs = newMsgs[newMsgs.length - 1]?.timestamp || Date.now();
                const freshChar = await DB.getCharacterById(charId);
                if (freshChar) {
                    freshChar.vectorMemoryLastExtractAt = lastTs;
                    await DB.saveCharacter(freshChar);
                }
                releaseExtractionLock(charId);
                return;
            }
        } catch {
            // Silent fallthrough to local pipeline
        }

        // ========== Local Pipeline (Fallback) ==========
        let lastProcessedTimestamp = lastExtractAt;

        try {
            const allMems = await DB.getAllVectorMemories(charId);
            const vectorCache = new Map<string, number[]>(allMems.map(m => [m.id, m.vector]));
            console.log(`🧠 [VectorExtract] Loaded vector cache: ${vectorCache.size} memories`);

            // Process all new messages in sliding windows (50 msgs, 10 overlap)
            // Each window refreshes existingHeaders to see newly created memories
            const WINDOW_SIZE = 50;
            const OVERLAP = 10;
            for (let i = 0; i < newMsgs.length; i += WINDOW_SIZE - OVERLAP) {
                const windowMsgs = newMsgs.slice(i, i + WINDOW_SIZE);
                const allHeaders = await DB.getVectorMemoryHeaders(charId);
                const existingHeaders = selectExtractionMemoryHeaders(allHeaders);
                const formattedMsgs = formatMessages(windowMsgs, charSnapshot.name, emojis);
                const prompt = buildExtractionPrompt(charSnapshot.name, existingHeaders, formattedMsgs);
                const results = await callLLM(prompt, apiConfig, undefined, {
                    reason: '自动记忆提取',
                    retryReason: '自动记忆提取重试',
                    conversationId: charId,
                    userInitiated: false,
                });

                const windowSourceIds = windowMsgs.map(m => m.id).filter((id): id is number => typeof id === 'number');
                const newMemIds: string[] = [];
                for (const result of results) {
                    const memId = await processResult(result, charId, embeddingApiKey, vectorCache, windowSourceIds, allMems);
                    if (memId) newMemIds.push(memId);
                }

                // 情感刻印：对新记忆回填激素快照（fire-and-forget）
                if (newMemIds.length > 0 && subApiConfig) {
                    // backfillNewMemories will auto-push to cloud after completion
                    VectorMemoryExtractor.backfillNewMemories(newMemIds, charSnapshot.name, subApiConfig)
                        .catch(e => console.warn('🧬 [AutoBackfill] Non-fatal:', e));
                } else if (newMemIds.length > 0) {
                    // ☁️ No sub-API → no hormone backfill, but still push memories to cloud
                    DB.getVectorMemoriesByIds(newMemIds).then(mems => {
                        if (mems.length > 0) {
                            pushMemories(charId, mems)
                                .then(async (pushResult) => {
                                    if (!pushResult) return;
                                    for (const memory of mems) {
                                        await DB.saveVectorMemory(markVectorMemoryAsSynced(memory));
                                    }
                                })
                                .catch(e => console.warn('☁️ [CloudSync] Auto-push (no sub-API) failed:', e));
                        }
                    }).catch(() => {});
                }

                // Mark this window as successfully processed
                lastProcessedTimestamp = windowMsgs[windowMsgs.length - 1].timestamp;

                // Delay between windows to avoid rate limiting
                if (i + WINDOW_SIZE < newMsgs.length) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            // Update lastExtractAt — read fresh char to minimize race condition
            const freshChar = await DB.getCharacterById(charId);
            if (freshChar) {
                freshChar.vectorMemoryLastExtractAt = lastProcessedTimestamp;
                await DB.saveCharacter(freshChar);
                console.log(`🧠 [VectorExtract] Updated lastExtractAt to ${new Date(lastProcessedTimestamp).toLocaleString()}`);
            }
        } catch (err) {
            console.error('🧠 [VectorExtract] Extraction error:', err);
            // Only advance lastExtractAt to the last SUCCESSFULLY processed window,
            // so unprocessed windows will be retried on the next trigger.
            try {
                if (lastProcessedTimestamp > lastExtractAt) {
                    const freshChar = await DB.getCharacterById(charId);
                    if (freshChar) {
                        freshChar.vectorMemoryLastExtractAt = lastProcessedTimestamp;
                        await DB.saveCharacter(freshChar);
                        console.log(`🧠 [VectorExtract] Error recovery: saved progress up to ${new Date(lastProcessedTimestamp).toLocaleString()} (failed windows will be retried)`);
                    }
                }
            } catch { /* silent */ }
        } finally {
            releaseExtractionLock(charId);
        }
    },

    /**
     * Direct mode — extract L0 memories from an explicit message list.
     * Used by flows like offline meeting recap where the source messages are
     * intentionally excluded from the normal chat auto-extraction path.
     */
    async extractFromMessages(
        charId: string,
        charName: string,
        messages: Message[],
        apiConfig: APIConfig,
        embeddingApiKey: string,
        subApiConfig?: { baseUrl: string; model: string; apiKey: string },
        options: DirectExtractOptions = {},
    ): Promise<number> {
        const sourceMessages = normalizeProvidedExtractionMessages(messages);
        if (sourceMessages.length === 0) return 0;

        if (hasExtractionLock(charId)) {
            console.log('🧠 [VectorExtract] Direct extract skipped: already extracting for', charId);
            return 0;
        }
        acquireExtractionLock(charId);

        try {
            const allMems = await DB.getAllVectorMemories(charId);
            const vectorCache = new Map<string, number[]>(allMems.map(m => [m.id, m.vector]));
            const emojis = await DB.getEmojis().catch(() => []);
            const WINDOW_SIZE = 30;
            const OVERLAP = 10;
            const STRIDE = WINDOW_SIZE - OVERLAP;
            const affectedMemIds = new Set<string>();

            for (let i = 0; i < sourceMessages.length; i += STRIDE) {
                const windowMsgs = sourceMessages.slice(i, i + WINDOW_SIZE);
                if (windowMsgs.length === 0) break;

                const allHeaders = await DB.getVectorMemoryHeaders(charId);
                const existingHeaders = selectExtractionMemoryHeaders(allHeaders);
                const formattedMsgs = formatMessages(windowMsgs, charName, emojis);
                const prompt = buildExtractionPrompt(charName, existingHeaders, formattedMsgs);
                const results = await callLLM(prompt, apiConfig, undefined, {
                    reason: options.reason || '线下见面L0记忆提取',
                    retryReason: options.retryReason || '线下见面L0记忆提取重试',
                    conversationId: charId,
                    userInitiated: options.userInitiated === true,
                });

                const sourceMessageIds = windowMsgs
                    .map(m => m.id)
                    .filter((id): id is number => typeof id === 'number');
                for (const result of results) {
                    const memId = await processResult(result, charId, embeddingApiKey, vectorCache, sourceMessageIds, allMems);
                    if (memId) affectedMemIds.add(memId);
                }
            }

            const ids = Array.from(affectedMemIds);
            if (ids.length > 0 && subApiConfig) {
                VectorMemoryExtractor.backfillNewMemories(ids, charName, subApiConfig)
                    .catch(e => console.warn('🧬 [DirectBackfill] Non-fatal:', e));
            } else if (ids.length > 0) {
                DB.getVectorMemoriesByIds(ids).then(mems => {
                    if (mems.length > 0) pushMemories(charId, mems).catch(() => {});
                }).catch(() => {});
            }

            console.log(`🧠 [VectorExtract] Direct extract complete: ${ids.length} memories affected`);
            return ids.length;
        } finally {
            releaseExtractionLock(charId);
        }
    },

    /**
     * Batch mode — process a specific range of messages.
     * Used for historical chat vectorization.
     *
     * @param charId - Character ID
     * @param startIdx - Start message index (0-based from full history)
     * @param endIdx - End message index (inclusive)
     * @param apiConfig - LLM API config
     * @param embeddingApiKey - Embedding API key
     * @param charName - Character name for prompts
     * @param onProgress - Progress callback (windowIdx, totalWindows, memoriesCreated)
     * @param signal - AbortSignal for cancellation
     * @returns Total memories created/updated
     */
    async batchExtractFromMessages(
        charId: string,
        startIdx: number,
        endIdx: number,
        apiConfig: APIConfig,
        embeddingApiKey: string,
        charName: string,
        onProgress?: (windowIdx: number, totalWindows: number, memoriesCreated: number) => void,
        signal?: AbortSignal,
        subApiConfig?: { baseUrl: string; model: string; apiKey: string },
        options?: BatchExtractOptions,
    ): Promise<number> {
        // Concurrency lock: prevent batch + auto extraction from running simultaneously
        if (hasExtractionLock(charId)) {
            console.log('🧠 [VectorExtract] Batch: auto-extract in progress, waiting up to 5s...');
            const waitStart = Date.now();
            while (hasExtractionLock(charId) && Date.now() - waitStart < 5000) {
                if (signal?.aborted) {
                    throw new DOMException('Batch extraction aborted', 'AbortError');
                }
                await new Promise(r => setTimeout(r, 500));
            }
            if (hasExtractionLock(charId)) {
                console.warn('🧠 [VectorExtract] Batch: force-acquiring lock (auto-extract too slow)');
            }
        }
        acquireExtractionLock(charId);

        try {
            const filteredMsgs = (await DB.getMessagesByCharId(charId))
                .map(m => normalizeMessageForVectorExtraction(m))
                .filter((m): m is Message => Boolean(m));
            const boundedStartIdx = Math.max(0, startIdx);
            const boundedEndIdx = Math.min(endIdx, filteredMsgs.length - 1);

            if (boundedEndIdx < boundedStartIdx) return 0;

            const WINDOW_SIZE = 40;
            const OVERLAP = 10;
            const WINDOW_STRIDE = WINDOW_SIZE - OVERLAP;
            const resumeCheckpoint = options?.checkpoint?.charId === charId ? options.checkpoint : null;
            const effectiveStartIdx = (() => {
                if (!resumeCheckpoint) return boundedStartIdx;

                if (typeof resumeCheckpoint.nextStartMessageId === 'number') {
                    const messageIdIdx = filteredMsgs.findIndex(m => m.id === resumeCheckpoint.nextStartMessageId);
                    if (messageIdIdx >= boundedStartIdx && messageIdIdx <= boundedEndIdx) {
                        return messageIdIdx;
                    }
                }

                if ((resumeCheckpoint.nextStartTimestamp || 0) > 0) {
                    const timestampIdx = filteredMsgs.findIndex((m, idx) => (
                        idx >= boundedStartIdx &&
                        idx <= boundedEndIdx &&
                        (m.timestamp || 0) >= (resumeCheckpoint.nextStartTimestamp || 0)
                    ));
                    if (timestampIdx !== -1) {
                        return timestampIdx;
                    }
                }

                return Math.min(Math.max(resumeCheckpoint.nextStartIdx, boundedStartIdx), boundedEndIdx + 1);
            })();

            if (effectiveStartIdx > boundedEndIdx) {
                return resumeCheckpoint ? resumeCheckpoint.totalCreated + resumeCheckpoint.totalUpdated : 0;
            }

            const totalTaskWindows = (() => {
                let count = 0;
                for (let i = boundedStartIdx; i <= boundedEndIdx; i += WINDOW_STRIDE) {
                    count++;
                }
                return count;
            })();

            const windows: Array<{ startIdx: number; messages: typeof filteredMsgs }> = [];

            for (let i = effectiveStartIdx; i <= boundedEndIdx; i += WINDOW_STRIDE) {
                if (signal?.aborted) break;
                const windowMsgs = filteredMsgs.slice(i, Math.min(i + WINDOW_SIZE, boundedEndIdx + 1));
                if (windowMsgs.length === 0) break;
                windows.push({ startIdx: i, messages: windowMsgs });
            }

        // Load vector cache once for the entire batch to avoid repeated full-table scans in isDuplicate.
        const allMems = await DB.getAllVectorMemories(charId);
        const vectorCache = new Map<string, number[]>(allMems.map(m => [m.id, m.vector]));
        console.log(`🧠 [VectorExtract] Batch: loaded vector cache: ${vectorCache.size} memories`);
        const emojis = await DB.getEmojis().catch(() => []);

        let totalCreated = resumeCheckpoint?.totalCreated ?? 0;
        let totalUpdated = resumeCheckpoint?.totalUpdated ?? 0;
        let processedWindows = resumeCheckpoint?.processedWindows ?? 0;
        let lastProcessedTimestamp = resumeCheckpoint?.lastProcessedTimestamp ?? 0;

        for (let w = 0; w < windows.length; w++) {
            if (signal?.aborted) {
                console.log('🧠 [VectorExtract] Batch aborted by user');
                throw new DOMException('Batch extraction aborted', 'AbortError');
            }

            const window = windows[w];
            onProgress?.(processedWindows + 1, totalTaskWindows, totalCreated + totalUpdated);

            // Refresh headers each window so LLM sees previously created memories
            const allHeaders = await DB.getVectorMemoryHeaders(charId);
            const existingHeaders = selectExtractionMemoryHeaders(allHeaders);
            const formattedMsgs = formatMessages(window.messages, charName, emojis);
            const prompt = buildExtractionPrompt(charName, existingHeaders, formattedMsgs);

            try {
                const results = await callLLM(prompt, apiConfig, signal, {
                    reason: '批量记忆提取',
                    retryReason: '批量记忆提取重试',
                    conversationId: charId,
                    userInitiated: true,
                });
                if (signal?.aborted) {
                    throw new DOMException('Batch extraction aborted', 'AbortError');
                }

                const batchSourceIds = window.messages.map(m => m.id).filter((id): id is number => typeof id === 'number');
                const windowMemIds: string[] = [];
                for (const result of results) {
                    if (signal?.aborted) {
                        throw new DOMException('Batch extraction aborted', 'AbortError');
                    }
                    const memId = await processResult(result, charId, embeddingApiKey, vectorCache, batchSourceIds, allMems);
                    if (memId) {
                        windowMemIds.push(memId);
                        if (result.action === 'create') totalCreated++;
                        else totalUpdated++;
                    }
                }

                // 情感刻印：每个窗口的新记忆回填（fire-and-forget）
                if (windowMemIds.length > 0 && subApiConfig && !signal?.aborted) {
                    // backfillNewMemories will auto-push to cloud after completion
                    VectorMemoryExtractor.backfillNewMemories(windowMemIds, charName, subApiConfig)
                        .catch(e => console.warn('🧬 [BatchBackfill] Non-fatal:', e));
                } else if (windowMemIds.length > 0 && !signal?.aborted) {
                    // ☁️ No sub-API → push without hormone data
                    DB.getVectorMemoriesByIds(windowMemIds).then(mems => {
                        if (mems.length > 0) pushMemories(charId, mems).catch(() => {});
                    }).catch(() => {});
                }
                lastProcessedTimestamp = Math.max(
                    lastProcessedTimestamp,
                    window.messages[window.messages.length - 1]?.timestamp || 0,
                );
                processedWindows++;
                const nextWindowStartIdx = Math.min(window.startIdx + WINDOW_STRIDE, boundedEndIdx + 1);
                const nextWindowStartMessage = filteredMsgs[nextWindowStartIdx];

                options?.onCheckpoint?.({
                    version: 1,
                    charId,
                    rangeStartIdx: boundedStartIdx,
                    rangeEndIdx: boundedEndIdx,
                    nextStartIdx: nextWindowStartIdx,
                    nextStartMessageId: typeof nextWindowStartMessage?.id === 'number' ? nextWindowStartMessage.id : null,
                    nextStartTimestamp: nextWindowStartMessage?.timestamp || 0,
                    totalCreated,
                    totalUpdated,
                    processedWindows,
                    totalWindows: totalTaskWindows,
                    lastProcessedTimestamp,
                    updatedAt: Date.now(),
                    status: 'running',
                });
            } catch (err: any) {
                // AbortError is expected when user cancels — don't log as error
                if (err?.name === 'AbortError') {
                    console.log('🧠 [VectorExtract] Batch aborted during network request');
                    throw err;
                }
                console.error(`🧠 [VectorExtract] Batch window ${w + 1} error:`, err);
                throw err;
            }

            // Track the last successfully processed window's end timestamp
            // Delay between windows to avoid rate limiting (3s)
            if (w < windows.length - 1 && !signal?.aborted) {
                await new Promise<void>(resolve => {
                    const timer = setTimeout(() => {
                        signal?.removeEventListener('abort', onAbort);
                        resolve();
                    }, 3000);
                    const onAbort = () => {
                        clearTimeout(timer);
                        signal?.removeEventListener('abort', onAbort);
                        resolve();
                    };
                    signal?.addEventListener('abort', onAbort, { once: true });
                });
            }
        }

        // Update lastExtractAt so maybeExtract() won't re-process these messages
        if (lastProcessedTimestamp > 0) {
            try {
                const freshChar = await DB.getCharacterById(charId);
                if (freshChar) {
                    const currentLastExtract = freshChar.vectorMemoryLastExtractAt || 0;
                    if (lastProcessedTimestamp > currentLastExtract) {
                        freshChar.vectorMemoryLastExtractAt = lastProcessedTimestamp;
                        await DB.saveCharacter(freshChar);
                        console.log(`🧠 [VectorExtract] Batch: updated lastExtractAt to ${new Date(lastProcessedTimestamp).toLocaleString()}`);
                    }
                }
            } catch (e) {
                console.error('🧠 [VectorExtract] Batch: failed to update lastExtractAt:', e);
            }
        }

        onProgress?.(processedWindows, totalTaskWindows, totalCreated + totalUpdated);
        console.log(`🧠 [VectorExtract] Batch complete: ${totalCreated} created, ${totalUpdated} updated from ${windows.length} windows`);
        console.log(`🧠 [VectorExtract] Batch complete: ${totalCreated} created, ${totalUpdated} updated from ${processedWindows} windows`);
        return totalCreated + totalUpdated;
        } finally {
            releaseExtractionLock(charId);
        }
    },

    /**
     * 通话结束后专项提取 — 从结构化通话历史直接提取记忆。
     * 不走 maybeExtract() 的消息计数机制，也不受 300 字截断限制。
     * @param charId 角色 ID
     * @param charName 角色名
     * @param callHistory 通话对话历史 [{role, content}, ...]
     * @param callTimestamp 通话时间戳
     * @param apiConfig LLM 配置
     * @param embeddingApiKey embedding API key
     * @returns 提取的记忆数量
     */
    async extractFromCallHistory(
        charId: string,
        charName: string,
        callHistory: { role: string; content: string }[],
        callTimestamp: number,
        apiConfig: APIConfig,
        embeddingApiKey: string,
        subApiConfig?: { baseUrl: string; model: string; apiKey: string },
    ): Promise<number> {
        // 短通话跳过（≤4 轮 ≈ 打个招呼）
        if (callHistory.length <= 4) {
            console.log(`🧠 [VectorExtract/Call] Only ${callHistory.length} turns, skipping.`);
            return 0;
        }

        // 并发锁
        if (hasExtractionLock(charId)) {
            console.log(`🧠 [VectorExtract/Call] Already extracting for ${charId}, skipping call extraction.`);
            return 0;
        }
        acquireExtractionLock(charId);

        console.log(`🧠 [VectorExtract/Call] Starting extraction from ${callHistory.length}-turn call for ${charName}`);

        let totalExtracted = 0;
        try {
            // 转换为 formatMessages 兼容格式（每轮 +1s 偏移）
            const virtualMsgs = callHistory.map((h, i) => ({
                timestamp: callTimestamp + i * 1000,
                type: 'call_log' as const,
                role: h.role,
                content: h.content,
            }));

            // 加载向量缓存
            const allMems = await DB.getAllVectorMemories(charId);
            const vectorCache = new Map<string, number[]>(allMems.map(m => [m.id, m.vector]));

            // 滑动窗口（30 轮/窗，8 轮重叠）
            const WINDOW = 30;
            const OVERLAP = 8;

            for (let i = 0; i < virtualMsgs.length; i += WINDOW - OVERLAP) {
                const windowMsgs = virtualMsgs.slice(i, i + WINDOW);
                const allHeaders = await DB.getVectorMemoryHeaders(charId);
                const existingHeaders = selectExtractionMemoryHeaders(allHeaders);

                const formattedMsgs = formatMessages(
                    windowMsgs.map(m => ({ ...m, content: m.content })), // 通话内容不截断
                    charName,
                );
                const prompt = buildExtractionPrompt(charName, existingHeaders, formattedMsgs);
                const results = await callLLM(prompt, apiConfig, undefined, {
                    reason: '通话记忆提取',
                    retryReason: '通话记忆提取重试',
                    conversationId: charId,
                    userInitiated: false,
                });

                const callMemIds: string[] = [];
                for (const result of results) {
                    const memId = await processResult(result, charId, embeddingApiKey, vectorCache, [], allMems);
                    if (memId) {
                        callMemIds.push(memId);
                        totalExtracted++;
                    }
                }

                // 情感刻印（fire-and-forget）
                if (callMemIds.length > 0 && subApiConfig) {
                    // backfillNewMemories will auto-push to cloud after completion
                    VectorMemoryExtractor.backfillNewMemories(callMemIds, charName, subApiConfig)
                        .catch(e => console.warn('🧬 [CallBackfill] Non-fatal:', e));
                } else if (callMemIds.length > 0) {
                    // ☁️ No sub-API → push without hormone data
                    DB.getVectorMemoriesByIds(callMemIds).then(mems => {
                        if (mems.length > 0) pushMemories(charId, mems).catch(() => {});
                    }).catch(() => {});
                }

                // 窗口间延迟
                if (i + WINDOW < virtualMsgs.length) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            console.log(`🧠 [VectorExtract/Call] Done: ${totalExtracted} memories from ${callHistory.length}-turn call`);
        } catch (err) {
            console.error('🧠 [VectorExtract/Call] Error:', err);
        } finally {
            releaseExtractionLock(charId);
        }
        return totalExtracted;
    },

    // ═══════════════════════════════════════════════════════════
    //  情感基因溯源 — 统一回填入口
    // ═══════════════════════════════════════════════════════════

    /**
     * 为一组记忆回填激素快照。统一入口：auto/batch/call/一键回填共用。
     *
     * 流程：
     *   1. 遍历每条记忆
     *   2. 跳过已有快照的、无 sourceMessageIds 的
     *   3. 从 DB 加载 sourceMessageIds 对应的消息
     *   4. 调用 batchSenseForWindow() 生成 InternalState
     *   5. 提取 hormoneSnapshot + computeSalience
     *   6. 回写到记忆
     *
     * @returns { success: number; skipped: number; failed: number }
     */
    backfillHormoneSnapshots: async (
        memories: VectorMemory[],
        charName: string,
        subApiConfig: { baseUrl: string; model: string; apiKey: string },
        onProgress?: (current: number, total: number, memTitle: string) => void,
        signal?: AbortSignal,
    ): Promise<{ success: number; skipped: number; failed: number }> => {
        const result = { success: 0, skipped: 0, failed: 0 };
        const total = memories.length;

        // Build char context once (reused for all windows)
        const charContext = MindSnapshotExtractor.buildCharContext({ name: charName } as CharacterProfile);

        for (let i = 0; i < total; i++) {
            if (signal?.aborted) {
                console.log(`🧬 [Backfill] Aborted at ${i}/${total}`);
                break;
            }

            const mem = memories[i];
            onProgress?.(i + 1, total, mem.title);

            // Skip if already has snapshot
            if (mem.hormoneSnapshot) {
                result.skipped++;
                continue;
            }

            // Skip if no source messages to trace back to
            if (!mem.sourceMessageIds || mem.sourceMessageIds.length === 0) {
                result.skipped++;
                continue;
            }

            try {
                // Load source messages from DB
                const sourceMsgs = await DB.getMessagesByIds(mem.sourceMessageIds);
                if (sourceMsgs.length === 0) {
                    result.skipped++;
                    continue;
                }

                // Run sub-model to generate InternalState
                const state = await MindSnapshotExtractor.batchSenseForWindow(
                    sourceMsgs.map(m => ({
                        role: m.role,
                        content: m.content || '',
                        timestamp: m.timestamp,
                    })),
                    charName,
                    charContext,
                    subApiConfig,
                    signal,
                );

                if (!state) {
                    result.failed++;
                    continue;
                }

                // Extract snapshot and compute salience
                const snapshot = extractHormoneSnapshot(state);
                const salience = computeSalience(state);

                // Write back to memory
                await DB.saveVectorMemory(normalizeVectorMemorySyncState({
                    ...mem,
                    hormoneSnapshot: snapshot,
                    salienceScore: salience,
                }));

                result.success++;
                console.log(`🧬 [Backfill] ✅ "${mem.title}" salience=${salience.toFixed(2)}`);

                // Rate limit: small delay between calls to avoid overwhelming the API
                if (i < total - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch (err: any) {
                console.error(`🧬 [Backfill] ❌ "${mem.title}":`, err.message);
                result.failed++;
            }
        }

        console.log(`🧬 [Backfill] Done: ${result.success} success, ${result.skipped} skipped, ${result.failed} failed`);
        return result;
    },

    /**
     * 便捷方法：对一组新创建的记忆 ID 进行情感基因溯源。
     * 用于 maybeExtract / batchExtract / callExtract 完成后自动回填。
     */
    backfillNewMemories: async (
        memoryIds: string[],
        charName: string,
        subApiConfig: { baseUrl: string; model: string; apiKey: string },
    ): Promise<void> => {
        if (memoryIds.length === 0) return;
        try {
            const memories = await DB.getVectorMemoriesByIds(memoryIds);
            if (memories.length === 0) return;

            const markSynced = async (targetMemories: VectorMemory[]): Promise<void> => {
                for (const memory of targetMemories) {
                    await DB.saveVectorMemory(markVectorMemoryAsSynced(memory));
                }
            };

            const pushAndMarkSynced = async (targetMemories: VectorMemory[], label: string): Promise<void> => {
                const charId = targetMemories[0]?.charId;
                if (!charId || targetMemories.length === 0) return;
                const pushResult = await pushMemories(charId, targetMemories);
                if (!pushResult) {
                    console.warn(`☁️ [CloudSync] ${label} failed, memories remain unsynced.`);
                    return;
                }
                await markSynced(targetMemories);
                console.log(`☁️ [CloudSync] ${label} success, marked ${targetMemories.length} memories as synced.`);
            };

            const needBackfill = memories.filter(m => !m.hormoneSnapshot && m.sourceMessageIds?.length);
            if (needBackfill.length === 0) {
                // No hormone backfill needed, but still push the memories to cloud
                if (memories.length > 0) {
                    pushAndMarkSynced(memories, 'auto-push (no backfill)')
                        .catch(e => console.warn('☁️ [CloudSync] Auto-push failed (no backfill):', e));
                }
                return;
            }

            console.log(`🧬 [AutoBackfill] Starting for ${needBackfill.length} new memories...`);
            await VectorMemoryExtractor.backfillHormoneSnapshots(
                needBackfill, charName, subApiConfig,
            );

            // ☁️ 星图锚定：情感刻印完成后，将完整记忆晶体静默推送到云端
            const charId = memories[0]?.charId;
            if (charId) {
                // Re-read finalized memories (with hormone snapshots) from DB
                const finalizedMemories = await DB.getVectorMemoriesByIds(memoryIds);
                if (finalizedMemories.length > 0) await pushAndMarkSynced(finalizedMemories, 'Auto-push')
                    .catch(e => console.warn('☁️ [CloudSync] Auto-push failed:', e));
            }
        } catch (err) {
            console.error('🧬 [AutoBackfill] Error:', err);
        }
    },
};

