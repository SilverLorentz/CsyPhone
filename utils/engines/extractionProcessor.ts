import type { VectorMemory } from '../../types';
import { EmbeddingService, getEmbeddingConfig } from '../embeddingService';
import { DB } from '../db';
import { hasCloudSyncTarget } from '../runtimeConfig';
import {
    resolveLocalFallbackSyncState,
    withVectorMemorySyncState,
} from '../vectorMemorySyncState';
import type { ExtractResult } from './extractionLlm';

const extractingChars = new Map<string, number>();

export function hasExtractionLock(charId: string): boolean {
    return (extractingChars.get(charId) || 0) > 0;
}

export function acquireExtractionLock(charId: string): void {
    extractingChars.set(charId, (extractingChars.get(charId) || 0) + 1);
}

export function releaseExtractionLock(charId: string): void {
    const nextCount = (extractingChars.get(charId) || 0) - 1;
    if (nextCount > 0) {
        extractingChars.set(charId, nextCount);
        return;
    }
    extractingChars.delete(charId);
}

function getLocalWriteSyncState() {
    return resolveLocalFallbackSyncState(hasCloudSyncTarget());
}

function syncMemorySnapshot(allMemories: VectorMemory[], memory: VectorMemory): void {
    const existingIndex = allMemories.findIndex((item) => item.id === memory.id);
    if (existingIndex >= 0) {
        allMemories[existingIndex] = memory;
        return;
    }

    allMemories.push(memory);
}

export function findDuplicate(newVec: number[], vectorCache: Map<string, number[]>): string | null {
    if (vectorCache.size === 0) return null;

    let maxSim = 0;
    let maxId = '';

    for (const [id, vec] of vectorCache) {
        if (vec.length !== newVec.length) continue;
        const sim = EmbeddingService.cosineSimilarity(newVec, vec);
        if (sim > maxSim) {
            maxSim = sim;
            maxId = id;
        }
    }

    return maxSim > 0.92 ? maxId : null;
}

export function findSourceOverlap(
    newSourceIds: number[],
    allMemories: VectorMemory[],
): string | null {
    if (newSourceIds.length === 0) return null;
    const newSet = new Set(newSourceIds);

    let bestId: string | null = null;
    let bestOverlap = 0;

    for (const mem of allMemories) {
        if (mem.deprecated) continue;
        const existingIds = mem.sourceMessageIds || [];
        if (existingIds.length === 0) continue;
        const overlap = existingIds.filter((id) => newSet.has(id)).length;
        const overlapRatio = overlap / Math.min(newSet.size, existingIds.length);
        if (overlapRatio > bestOverlap) {
            bestOverlap = overlapRatio;
            bestId = mem.id;
        }
    }

    return bestOverlap >= 0.6 ? bestId : null;
}

export async function processResult(
    result: ExtractResult,
    charId: string,
    embeddingApiKey: string,
    vectorCache: Map<string, number[]>,
    sourceMessageIds: number[] = [],
    allMemories: VectorMemory[] = [],
): Promise<string | null> {
    const config = getEmbeddingConfig();
    const localWriteSyncState = getLocalWriteSyncState();

    if (result.action === 'skip') {
        return null;
    }

    if (result.action === 'invalidate' && result.targetId) {
        const target = await DB.getVectorMemoryById(result.targetId);
        if (target && !target.deprecated) {
            const updatedMem = withVectorMemorySyncState({
                ...target,
                deprecated: true,
                deprecatedReason: result.reason || '信息已过时',
                updatedAt: Date.now(),
            }, localWriteSyncState);
            await DB.saveVectorMemory(updatedMem);
            syncMemorySnapshot(allMemories, updatedMem);
            vectorCache.delete(result.targetId);
            console.log(`🧠 [VectorExtract] Invalidated: "${target.title}" — ${updatedMem.deprecatedReason}`);
            return target.id;
        }
        return null;
    }

    if (!result.title || !result.content) {
        return null;
    }

    const textToEmbed = `${result.title}: ${result.content}`;

    if (result.action === 'create') {
        const vector = await EmbeddingService.embed(textToEmbed, undefined, embeddingApiKey);
        const sourceOverlapId = findSourceOverlap(sourceMessageIds, allMemories);
        const duplicateId = sourceOverlapId || findDuplicate(vector, vectorCache);

        if (duplicateId) {
            console.log(`🧠 [VectorExtract] Duplicate detected (${sourceOverlapId ? 'source overlap ≥60%' : 'cosine>0.92'}), updating ${duplicateId}`);
            const target = await DB.getVectorMemoryById(duplicateId);
            if (target) {
                const mergedSourceIds = Array.from(new Set([...(target.sourceMessageIds || []), ...sourceMessageIds]));
                const updatedMem = withVectorMemorySyncState({
                    ...target,
                    title: result.title,
                    content: result.content,
                    emotionalJourney: result.emotionalJourney || target.emotionalJourney,
                    importance: Math.min(Math.max(result.importance || target.importance, 1), 10),
                    layer: result.layer || target.layer,
                    kind: result.kind || target.kind,
                    expiresAt: result.expiresAt === undefined ? target.expiresAt : result.expiresAt,
                    updatedAt: Date.now(),
                    vector,
                    modelId: config.model,
                    sourceMessageIds: mergedSourceIds,
                }, localWriteSyncState);
                await DB.saveVectorMemory(updatedMem);
                syncMemorySnapshot(allMemories, updatedMem);
                vectorCache.set(duplicateId, vector);
                console.log(`🧠 [VectorExtract] Dedup-updated: "${updatedMem.title}"`);
                return duplicateId;
            }
        }

        const newMem = withVectorMemorySyncState({
            id: `vmem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            charId,
            title: result.title,
            content: result.content,
            emotionalJourney: result.emotionalJourney,
            importance: Math.min(Math.max(result.importance || 5, 1), 10),
            layer: result.layer,
            kind: result.kind,
            expiresAt: result.expiresAt ?? null,
            mentionCount: 0,
            lastMentioned: 0,
            createdAt: Date.now(),
            vector,
            modelId: config.model,
            source: 'auto',
            sourceMessageIds,
        }, localWriteSyncState);
        await DB.saveVectorMemory(newMem);
        syncMemorySnapshot(allMemories, newMem);
        vectorCache.set(newMem.id, vector);
        console.log(`🧠 [VectorExtract] Created: "${result.title}" (imp: ${newMem.importance})`);
        return newMem.id;
    }

    if (result.action === 'update' && result.targetId) {
        const target = await DB.getVectorMemoryById(result.targetId);
        const vector = await EmbeddingService.embed(textToEmbed, undefined, embeddingApiKey);

        if (target) {
            const mergedSourceIds = Array.from(new Set([...(target.sourceMessageIds || []), ...sourceMessageIds]));
            const updatedMem = withVectorMemorySyncState({
                ...target,
                title: result.title || target.title,
                content: result.content,
                emotionalJourney: result.emotionalJourney || target.emotionalJourney,
                importance: Math.min(Math.max(result.importance || target.importance, 1), 10),
                layer: result.layer || target.layer,
                kind: result.kind || target.kind,
                expiresAt: result.expiresAt === undefined ? target.expiresAt : result.expiresAt,
                updatedAt: Date.now(),
                vector,
                modelId: config.model,
                sourceMessageIds: mergedSourceIds,
            }, localWriteSyncState);
            await DB.saveVectorMemory(updatedMem);
            syncMemorySnapshot(allMemories, updatedMem);
            vectorCache.set(result.targetId, vector);
            console.log(`🧠 [VectorExtract] Updated: "${updatedMem.title}"`);
            return result.targetId;
        }

        const fallbackId = `vmem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const newMem = withVectorMemorySyncState({
            id: fallbackId,
            charId,
            title: result.title || '未命名记忆',
            content: result.content,
            emotionalJourney: result.emotionalJourney,
            importance: Math.min(Math.max(result.importance || 5, 1), 10),
            layer: result.layer,
            kind: result.kind,
            expiresAt: result.expiresAt ?? null,
            mentionCount: 0,
            lastMentioned: 0,
            createdAt: Date.now(),
            vector,
            modelId: config.model,
            source: 'auto',
            sourceMessageIds,
        }, localWriteSyncState);
        await DB.saveVectorMemory(newMem);
        syncMemorySnapshot(allMemories, newMem);
        vectorCache.set(fallbackId, vector);
        console.log(`🧠 [VectorExtract] Target not found, created as new: "${result.title}"`);
        return fallbackId;
    }

    return null;
}
