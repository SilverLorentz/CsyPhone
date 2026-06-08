
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { buildBackendHeaders,getBackendUrl,getUserId,sanitizeBackendHeader,setUserId,pushMemories,pullMemories,listCloudChars,migrateCloudCharacterInstance,updateCloudMemory } from '../utils/backendClient';
import { DB } from '../utils/db';
import { useOS } from '../context/OSContext';
import { haptic } from '../utils/haptics';
import { getEmbeddingConfig,getSecondaryApiConfig,hasCloudSyncTarget } from '../utils/runtimeConfig';
import { safeTimeoutSignal } from '../utils/safeTimeout';
import { findCharacterByAnyId,getCharacterIdentityIds,getOrphanCloudStats,getSelectedCharacterStats } from '../utils/cognitiveNetworkCharacterStats';
import type { CognitiveCharStats } from '../utils/cognitiveNetworkCharacterStats';
import { AppID,type CharacterProfile,type VectorMemory } from '../types';
import MemoryBrowser from '../components/cognitive/MemoryBrowser';
import { updateVectorMemoryManaged,type VectorMemoryEditableFields } from '../components/character/memoryCenterActions';

/* Recovered comment */

type CharStats = CognitiveCharStats;

interface PerCharStatsResponse {
    characters: CharStats[];
    graph: { nodes: number; edges: number };
}

interface BackfillResult {
    success: boolean;
    dryRun: boolean;
    characters: { charId: string; memoryCount: number; linksCreated: number; edgesCreated: number; skipped?: boolean }[];
    totals: { memories: number; linksCreated: number; edgesCreated: number };
    verification: { charId: string; total: number; withPrev: number; withNext: number; expected: number; complete: boolean }[];
    graphStats: { nodes: number; edges: number };
}

interface SemanticResult {
    success: boolean;
    dryRun: boolean;
    results: { charId: string; total: number; needsEdges: number; queued: number }[];
    totalQueued: number;
    note: string;
}

interface SemanticRebuildResult {
    success: boolean;
    deleted: number;
    reset: number;
    toProcess: number;
}

interface DistillResetStats {
    l1Deleted: number;
    l0Cleared: number;
    relationsCleared: number;
}

interface OrphanMemoryPreview {
    id: string;
    title: string;
    content: string;
    emotionalJourney?: string;
    createdAt?: number;
}

interface OrphanPreviewState {
    loading: boolean;
    memories: OrphanMemoryPreview[];
    error?: string;
}

interface GraphRelationPreview {
    id: string;
    charId: string;
    sourceId: string;
    targetId: string;
    sourceTitle: string;
    targetTitle: string;
    relationType: string;
    summary: string;
    strength?: number;
    createdAt?: number;
    sourceMessageIds: number[];
    targetMessageIds: number[];
}

interface GraphMemoryPreview {
    id: string;
    charId: string;
    title: string;
    content: string;
    emotionalJourney?: string;
    sourceMemoryIds: string[];
    sourceMessageIds: number[];
    createdAt?: number;
    importance?: number;
}

interface GraphInsightState {
    relations: GraphRelationPreview[];
    l1Memories: GraphMemoryPreview[];
}

type GraphDrawerSelection =
    | { kind: 'relation'; item: GraphRelationPreview }
    | { kind: 'memory'; item: GraphMemoryPreview };

interface DistillResult {
    clustersFound: number;
    processedClusters?: number;
    maxClustersPerRun?: number;
    l1Created: number;
    l1Merged: number;
    l1Deduped: number;
    l0Linked: number;
    errors: number;
    elapsed: number;
    deferred?: {
        stage: string;
        stageLabel: string;
        clusterSize: number;
        preview: string;
        reason: string;
    }[];
    resetStats?: DistillResetStats;
}

const ORPHAN_PREVIEW_LIMIT = 3;
const GRAPH_PREVIEW_LIMIT = 6;
const DISTILLATION_MEDIA_OMITTED = '（已设置；图片/媒体数据不注入 L1 prompt）';

function optionalTextForDistillation(value?: string | null): string | null {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed || null;
}

function optionalBooleanForDistillation(value?: boolean): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function optionalNumberForDistillation(value?: number): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mediaValueForDistillation(value?: string | null): string | null {
    const trimmed = optionalTextForDistillation(value);
    if (!trimmed) return null;
    return trimmed.startsWith('data:') ? DISTILLATION_MEDIA_OMITTED : trimmed;
}

function buildCharacterProfileContextForDistillation(character?: CharacterProfile | null): string {
    if (!character) return '';

    const context = {
        identityCompatibility: {
            id: character.id,
            name: character.name,
            charInstanceId: optionalTextForDistillation(character.charInstanceId),
            templateCharId: optionalTextForDistillation(character.templateCharId),
            gender: character.gender || null,
        },
        personaCore: {
            description: optionalTextForDistillation(character.description),
            systemPrompt: optionalTextForDistillation(character.systemPrompt),
            worldview: optionalTextForDistillation(character.worldview),
            softDevotionChatMode: optionalBooleanForDistillation(character.softDevotionChatMode),
            writerPersona: optionalTextForDistillation(character.writerPersona),
        },
        locationCity: {
            cityOverride: optionalTextForDistillation(character.cityOverride),
            cityAdcode: optionalTextForDistillation(character.cityAdcode),
            isFictionalCity: optionalBooleanForDistillation(character.isFictionalCity),
            cityReferenceReal: optionalTextForDistillation(character.cityReferenceReal),
        },
        memorySystem: {
            memories: (character.memories || []).map(memory => ({
                id: memory.id,
                date: memory.date,
                summary: memory.summary,
                mood: optionalTextForDistillation(memory.mood),
            })),
            refinedMemories: character.refinedMemories || {},
            activeMemoryMonths: character.activeMemoryMonths || [],
            impression: character.impression || null,
        },
        worldbooks: {
            mountedWorldbooks: (character.mountedWorldbooks || []).map(book => ({
                id: book.id,
                title: book.title,
                content: book.content,
                category: optionalTextForDistillation(book.category),
                position: book.position || null,
                vectorized: optionalBooleanForDistillation(book.vectorized),
            })),
        },
        chatDisplayAndContext: {
            bubbleStyle: optionalTextForDistillation(character.bubbleStyle),
            chatBackground: mediaValueForDistillation(character.chatBackground),
            contextLimit: optionalNumberForDistillation(character.contextLimit),
            showThinking: optionalBooleanForDistillation(character.showThinking),
            hideSystemLogs: optionalBooleanForDistillation(character.hideSystemLogs),
            hideBeforeMessageId: optionalNumberForDistillation(character.hideBeforeMessageId),
        },
    };

    return JSON.stringify(context, null, 2);
}

function readStringField(source: any, keys: string[], fallback = ''): string {
    for (const key of keys) {
        const value = source?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return fallback;
}

function readNumberField(source: any, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = Number(source?.[key]);
        if (Number.isFinite(value)) return value;
    }
    return undefined;
}

function readStringArrayField(source: any, keys: string[]): string[] {
    for (const key of keys) {
        const value = source?.[key];
        if (Array.isArray(value)) {
            return value.map(item => String(item || '').trim()).filter(Boolean);
        }
        if (typeof value === 'string' && value.trim()) {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) {
                    return parsed.map(item => String(item || '').trim()).filter(Boolean);
                }
            } catch {
                return value.split(',').map(item => item.trim()).filter(Boolean);
            }
        }
    }
    return [];
}

function readNumberArrayField(source: any, keys: string[]): number[] {
    for (const key of keys) {
        const value = source?.[key];
        const rawItems = Array.isArray(value)
            ? value
            : typeof value === 'string' && value.trim()
                ? (() => {
                    try {
                        const parsed = JSON.parse(value);
                        return Array.isArray(parsed) ? parsed : value.split(',');
                    } catch {
                        return value.split(',');
                    }
                })()
                : [];

        const ids = rawItems
            .map(item => Number(item))
            .filter(item => Number.isFinite(item));
        if (ids.length > 0) return Array.from(new Set(ids));
    }
    return [];
}

function vectorSourceMessageIds(memory?: VectorMemory): number[] {
    if (!Array.isArray(memory?.sourceMessageIds)) return [];
    return memory.sourceMessageIds
        .map(item => Number(item))
        .filter(item => Number.isFinite(item));
}

function mergeGraphMessageIds(...groups: Array<number[] | undefined>): number[] {
    return Array.from(new Set(groups.flatMap(group => group || [])));
}

function firstGraphMessageId(...groups: Array<number[] | undefined>): number | undefined {
    return mergeGraphMessageIds(...groups)[0];
}

function formatGraphStrength(value?: number): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '';
    return value <= 1 ? `${Math.round(value * 100)}%` : value.toFixed(1);
}

function formatGraphPreviewId(value: string): string {
    if (!value) return '未知片段';
    return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function looksLikeRawMemoryId(value: string): boolean {
    return /^(v?mem|memory|l1)[-_:]/i.test(value.trim());
}

function cleanGraphText(value?: string, rawId?: string): string {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (rawId && (normalized === rawId || normalized === formatGraphPreviewId(rawId))) return '';
    if (looksLikeRawMemoryId(normalized)) return '';
    if (normalized === '这两段回忆之间已经建立了关联。') return '';
    if (normalized === '这枚认知还没有留下正文。') return '';
    return normalized;
}

function trimGraphSnippet(value?: string, limit = 32): string {
    const text = cleanGraphText(value);
    if (!text) return '';
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function resolveGraphMemoryTitle(memory: VectorMemory | undefined, rawId: string, fallback: string): string {
    return cleanGraphText(memory?.title, rawId) || fallback;
}

function buildGraphRelationSummary(
    relation: GraphRelationPreview,
    sourceMemory: VectorMemory | undefined,
    targetMemory: VectorMemory | undefined,
): string {
    const explicit = cleanGraphText(relation.summary);
    if (explicit) return explicit;

    const sourceSnippet = trimGraphSnippet(sourceMemory?.emotionalJourney || sourceMemory?.content || sourceMemory?.title, 24);
    const targetSnippet = trimGraphSnippet(targetMemory?.emotionalJourney || targetMemory?.content || targetMemory?.title, 24);
    if (sourceSnippet && targetSnippet) {
        return `“${sourceSnippet}”和“${targetSnippet}”被识别为彼此呼应。`;
    }

    return '这两段回忆已经被识别为一条心意连接，正文还在等待同步。';
}

function normalizeGraphRelation(item: any, index: number): GraphRelationPreview {
    const sourceId = readStringField(item, ['sourceMemoryId', 'source_memory_id', 'sourceId', 'source_id', 'fromId', 'from_id', 'memoryIdA', 'memory_id_a']);
    const targetId = readStringField(item, ['targetMemoryId', 'target_memory_id', 'targetId', 'target_id', 'toId', 'to_id', 'memoryIdB', 'memory_id_b']);
    return {
        id: readStringField(item, ['id', 'relationId', 'relation_id'], `relation-${index}`),
        charId: readStringField(item, ['charId', 'char_id', 'characterId', 'character_id', 'charInstanceId', 'char_instance_id', 'templateCharId', 'template_char_id']),
        sourceId,
        targetId,
        sourceTitle: readStringField(item, ['sourceTitle', 'source_title', 'fromTitle', 'from_title']),
        targetTitle: readStringField(item, ['targetTitle', 'target_title', 'toTitle', 'to_title']),
        relationType: readStringField(item, ['relationType', 'relation_type', 'type', 'kind', 'label'], '心意关联'),
        summary: readStringField(item, ['summary', 'reason', 'description', 'evidence', 'note']),
        strength: readNumberField(item, ['strength', 'weight', 'score', 'confidence']),
        createdAt: readNumberField(item, ['createdAt', 'created_at', 'updatedAt', 'updated_at']),
        sourceMessageIds: readNumberArrayField(item, ['sourceMessageIds', 'source_message_ids', 'fromMessageIds', 'from_message_ids']),
        targetMessageIds: readNumberArrayField(item, ['targetMessageIds', 'target_message_ids', 'toMessageIds', 'to_message_ids']),
    };
}

function normalizeGraphMemory(item: any, index: number): GraphMemoryPreview {
    return {
        id: readStringField(item, ['id', 'memoryId', 'memory_id'], `l1-${index}`),
        charId: readStringField(item, ['charId', 'char_id', 'characterId', 'character_id', 'charInstanceId', 'char_instance_id', 'templateCharId', 'template_char_id']),
        title: readStringField(item, ['title', 'name']),
        content: readStringField(item, ['content', 'summary', 'text']),
        emotionalJourney: readStringField(item, ['emotionalJourney', 'emotional_journey', 'emotion'], ''),
        sourceMemoryIds: readStringArrayField(item, ['sourceMemoryIds', 'source_memory_ids', 'memoryIds', 'memory_ids']),
        sourceMessageIds: readNumberArrayField(item, ['sourceMessageIds', 'source_message_ids']),
        createdAt: readNumberField(item, ['createdAt', 'created_at', 'updatedAt', 'updated_at']),
        importance: readNumberField(item, ['importance', 'score']),
    };
}

function enrichGraphInsights(
    relations: GraphRelationPreview[],
    l1Memories: GraphMemoryPreview[],
    memoryById: Map<string, VectorMemory>,
): GraphInsightState {
    return {
        relations: relations.map((relation, index) => {
            const sourceMemory = memoryById.get(relation.sourceId);
            const targetMemory = memoryById.get(relation.targetId);
            const inferredCharId = relation.charId || sourceMemory?.charId || targetMemory?.charId || '';
            return {
                ...relation,
                charId: inferredCharId,
                sourceTitle: cleanGraphText(relation.sourceTitle, relation.sourceId)
                    || resolveGraphMemoryTitle(sourceMemory, relation.sourceId, `第 ${index + 1} 组回忆 A`),
                targetTitle: cleanGraphText(relation.targetTitle, relation.targetId)
                    || resolveGraphMemoryTitle(targetMemory, relation.targetId, `第 ${index + 1} 组回忆 B`),
                summary: buildGraphRelationSummary(relation, sourceMemory, targetMemory),
                sourceMessageIds: mergeGraphMessageIds(relation.sourceMessageIds, vectorSourceMessageIds(sourceMemory)),
                targetMessageIds: mergeGraphMessageIds(relation.targetMessageIds, vectorSourceMessageIds(targetMemory)),
            };
        }),
        l1Memories: l1Memories.map((memory, index) => {
            const localMemory = memoryById.get(memory.id);
            const sourceMemoryIds = memory.sourceMemoryIds.length
                ? memory.sourceMemoryIds
                : (Array.isArray(localMemory?.sourceMemoryIds) ? localMemory.sourceMemoryIds : []);
            const sourceMemories = sourceMemoryIds
                .map(id => memoryById.get(id))
                .filter((item): item is VectorMemory => Boolean(item));
            const inferredCharId = memory.charId
                || localMemory?.charId
                || sourceMemories.find(item => item.charId)?.charId
                || '';
            const linkedCount = sourceMemoryIds.length;
            return {
                ...memory,
                charId: inferredCharId,
                title: cleanGraphText(memory.title, memory.id)
                    || cleanGraphText(localMemory?.title, memory.id)
                    || `凝结认知 ${index + 1}`,
                content: cleanGraphText(memory.content)
                    || cleanGraphText(localMemory?.content)
                    || cleanGraphText(localMemory?.emotionalJourney)
                    || (linkedCount > 0
                        ? `由 ${linkedCount} 段回忆凝结而来，正文还在等待同步。`
                        : '这枚认知已经生成，正文还在等待同步。'),
                emotionalJourney: cleanGraphText(memory.emotionalJourney) || cleanGraphText(localMemory?.emotionalJourney),
                sourceMemoryIds,
                sourceMessageIds: mergeGraphMessageIds(
                    memory.sourceMessageIds,
                    vectorSourceMessageIds(localMemory),
                    ...sourceMemories.map(item => vectorSourceMessageIds(item)),
                ),
            };
        }),
    };
}

function formatOrphanPreviewDate(timestamp?: number): string {
    if (!timestamp) return '最近时间待确认';
    const normalized = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '最近时间待确认';
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = date.getFullYear() === now.getFullYear()
        ? { month: 'numeric', day: 'numeric' }
        : { year: 'numeric', month: 'numeric', day: 'numeric' };
    return date.toLocaleDateString('zh-CN', options);
}

function getOrphanPreviewTitle(memory: OrphanMemoryPreview): string {
    const title = memory.title?.trim();
    return title || '未命名回忆';
}

function getOrphanPreviewSnippet(memory: OrphanMemoryPreview): string {
    const text = (memory.emotionalJourney || memory.content || '').replace(/\s+/g, ' ').trim();
    if (!text) return '留下了一段还没归档的细节。';
    return text.length > 46 ? `${text.slice(0, 46)}...` : text;
}

function getOrphanGroupLabel(index: number, total: number): string {
    return total > 1 ? `第 ${index + 1} 组待归档回忆` : '一组待归档回忆';
}

/* Recovered comment */

const HOME_MEMORY_MOTES = [
    { left: '82%', top: '18%', size: 3.8, opacity: 0.64, color: '#fff7dc', x: 5, y: -8, scale: 1.55, duration: 12.5, delay: 0.2 },
    { left: '11%', top: '32%', size: 3.1, opacity: 0.54, color: '#e5d08f', x: -5, y: 7, scale: 1.4, duration: 14.8, delay: 1.5 },
    { left: '92%', top: '43%', size: 4.1, opacity: 0.48, color: '#d4af37', x: -7, y: -5, scale: 1.28, duration: 15.5, delay: 2.2 },
    { left: '7%', top: '52%', size: 3.5, opacity: 0.58, color: '#fff1bd', x: 6, y: 8, scale: 1.35, duration: 13.2, delay: 0.9 },
    { left: '72%', top: '58%', size: 2.9, opacity: 0.5, color: '#e5d08f', x: 5, y: -6, scale: 1.6, duration: 10.8, delay: 3.1 },
    { left: '29%', top: '67%', size: 4.5, opacity: 0.44, color: '#d4af37', x: -4, y: -9, scale: 1.22, duration: 16, delay: 1.1 },
    { left: '88%', top: '76%', size: 3.3, opacity: 0.54, color: '#fff7dc', x: -6, y: 5, scale: 1.45, duration: 12.2, delay: 2.7 },
    { left: '13%', top: '82%', size: 2.8, opacity: 0.48, color: '#e5d08f', x: 5, y: -7, scale: 1.3, duration: 14.2, delay: 4.2 },
    { left: '58%', top: '90%', size: 3.9, opacity: 0.48, color: '#fff1bd', x: -3, y: -8, scale: 1.36, duration: 11.4, delay: 1.9 },
    { left: '39%', top: '36%', size: 2.7, opacity: 0.44, color: '#d4af37', x: 6, y: 6, scale: 1.65, duration: 15.2, delay: 3.5 },
] as const;

const CognitiveNetworkApp: React.FC = () => {
    const { closeApp, openApp, addToast, characters, userProfile, setActiveCharacterId } = useOS();
    const [allStats, setAllStats] = useState<PerCharStatsResponse | null>(null);
    const [statsFailed, setStatsFailed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedCharId, setSelectedCharId] = useState<string | null>(null); // null = 全部角色
    const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
    const [semanticResult, setSemanticResult] = useState<SemanticResult | null>(null);
    const [backfilling, setBackfilling] = useState(false);
    const [semanticRunning, setSemanticRunning] = useState(false);
    const [showConfirm, setShowConfirm] = useState<'temporal' | 'semantic' | 'semanticRebuild' | 'rescan' | 'distill' | 'distillRebuild' | 'syncBind' | null>(null);
    // Navigation state
    const [activeTab, setActiveTab] = useState<'home' | 'browser' | 'workshop' | 'sync'>('home');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [queueStatus, setQueueStatus] = useState<{
        total: number; done: number; errors: number; running: boolean;
        lastError?: string; lastElapsed?: number;
        totalRelations?: number;
        lastRelations?: number;
        lastSnippet?: string;
        lastParseError?: string;
        lastRawCount?: number;
        lastFilterCount?: number;
        lastCandidateCount?: number;
        lastVecSim?: boolean;
        mode?: 'semantic' | 'semantic-rebuild';
        canAbort?: boolean;
        aborted?: boolean;
    } | null>(null);
    // Distillation state
    const [distilling, setDistilling] = useState(false);
    const [distillResult, setDistillResult] = useState<DistillResult | null>(null);
    const [semanticRebuilding, setSemanticRebuilding] = useState(false);
    const [semanticRebuildResult, setSemanticRebuildResult] = useState<({ charId: string } & Omit<SemanticRebuildResult, 'success'>) | null>(null);
    const [distillRebuilding, setDistillRebuilding] = useState(false);
    const [distillResetStats, setDistillResetStats] = useState<({ charId: string } & DistillResetStats) | null>(null);

    // Cloud Sync state
    const [syncCodeVisible, setSyncCodeVisible] = useState(false);
    const [bindInput, setBindInput] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ pushed: number; pulled: number } | null>(null);
    const [syncUserId, setSyncUserId] = useState(() => getUserId());
    const [claimingCloudCharId, setClaimingCloudCharId] = useState<string | null>(null);
    const [claimDrawerCharId, setClaimDrawerCharId] = useState<string | null>(null);
    const [claimTargetCharId, setClaimTargetCharId] = useState<string | null>(null);
    const [orphanPreviews, setOrphanPreviews] = useState<Record<string, OrphanPreviewState>>({});
    const [graphInsights, setGraphInsights] = useState<GraphInsightState | null>(null);
    const [graphDrawer, setGraphDrawer] = useState<GraphDrawerSelection | null>(null);
    const [graphInsightsLoading, setGraphInsightsLoading] = useState(false);
    const [graphInsightsFailed, setGraphInsightsFailed] = useState(false);
    const semanticAbortRef = React.useRef<AbortController | null>(null);
    const orphanPreviewRequestsRef = React.useRef<Set<string>>(new Set());

    const charNameMap = useCallback((charId: string) => {
        const found = findCharacterByAnyId(characters, charId);
        return found?.name || charId.slice(0, 12);
    }, [characters]);

    const charAvatarMap = useCallback((charId: string) => {
        const found = findCharacterByAnyId(characters, charId);
        return found?.avatar || '';
    }, [characters]);

    const selectedMemoryChar = useMemo(
        () => findCharacterByAnyId(characters, selectedCharId),
        [characters, selectedCharId]
    );

    const selectedBackendCharId = useMemo(() => {
        if (!selectedCharId) return null;
        return selectedMemoryChar ? selectedMemoryChar.id : selectedCharId;
    }, [selectedMemoryChar, selectedCharId]);

    const authHeaders = useCallback(() => {
        const h = buildBackendHeaders();
        const subApiConfig = getSecondaryApiConfig();
        if (subApiConfig?.apiKey) h['X-LLM-Key'] = sanitizeBackendHeader(subApiConfig.apiKey);
        if (subApiConfig?.baseUrl) h['X-LLM-Base-URL'] = sanitizeBackendHeader(subApiConfig.baseUrl);
        if (subApiConfig?.model) h['X-LLM-Model'] = sanitizeBackendHeader(subApiConfig.model);
        return h;
    }, []);

    const backendUrl = getBackendUrl();
    const isConnected = !!backendUrl;
    const hasSubApi = !!getSecondaryApiConfig()?.apiKey;
    const hasEmbeddingApi = !!getEmbeddingConfig().apiKey;
    const distillBusy = distilling || distillRebuilding;
    void semanticResult;
    void semanticRebuildResult;
    void distillResetStats;
    void charAvatarMap;
    void hasSubApi;
    void hasEmbeddingApi;
    void distillBusy;
    const shouldReduceMotion = useReducedMotion();
    const [isTouchLikeDevice, setIsTouchLikeDevice] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia('(pointer: coarse)').matches;
    });
    const shouldCalmHomeMotion = shouldReduceMotion || isTouchLikeDevice;

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const query = window.matchMedia('(pointer: coarse)');
        const syncPointer = () => setIsTouchLikeDevice(query.matches);
        syncPointer();
        query.addEventListener('change', syncPointer);
        return () => query.removeEventListener('change', syncPointer);
    }, []);

    // Full headers with embedding keys (for distillation)
    const fullHeaders = useCallback(() => {
        const h = authHeaders();
        const embeddingConfig = getEmbeddingConfig();
        if (embeddingConfig.apiKey) h['X-Embedding-Key'] = sanitizeBackendHeader(embeddingConfig.apiKey);
        if (embeddingConfig.provider) h['X-Embedding-Provider'] = sanitizeBackendHeader(embeddingConfig.provider);
        if (embeddingConfig.baseUrl) h['X-Embedding-Base-URL'] = sanitizeBackendHeader(embeddingConfig.baseUrl);
        if (embeddingConfig.model) h['X-Embedding-Model'] = sanitizeBackendHeader(embeddingConfig.model);
        return h;
    }, [authHeaders]);

    // Current selected character stats
    const currentStats = useMemo(() => {
        if (!allStats || allStats.characters.length === 0) return null;
        return getSelectedCharacterStats(allStats.characters, characters, selectedCharId);
    }, [allStats, characters, selectedCharId]);

    const orphanCloudStats = useMemo(
        () => getOrphanCloudStats(allStats?.characters || [], characters),
        [allStats, characters]
    );

    const orphanMemoryTotal = useMemo(
        () => orphanCloudStats.reduce((sum, stat) => sum + (stat.memories || 0), 0),
        [orphanCloudStats]
    );

    const activeClaimStat = useMemo(
        () => orphanCloudStats.find(stat => stat.charId === claimDrawerCharId) || null,
        [orphanCloudStats, claimDrawerCharId]
    );

    const claimTargetChar = useMemo(
        () => findCharacterByAnyId(characters, claimTargetCharId),
        [characters, claimTargetCharId]
    );

    const activeClaimPreview = claimDrawerCharId ? orphanPreviews[claimDrawerCharId] : undefined;

    const selectedGraphIdentityIds = useMemo(() => {
        if (!selectedCharId) return null;
        const selected = findCharacterByAnyId(characters, selectedCharId);
        const ids = selected ? getCharacterIdentityIds(selected) : [selectedCharId.trim()].filter(Boolean);
        return new Set(ids);
    }, [characters, selectedCharId]);

    const visibleGraphRelations = useMemo(() => {
        const relations = graphInsights?.relations || [];
        if (!selectedGraphIdentityIds) return relations.slice(0, GRAPH_PREVIEW_LIMIT);
        return relations
            .filter(relation => relation.charId && selectedGraphIdentityIds.has(relation.charId))
            .slice(0, GRAPH_PREVIEW_LIMIT);
    }, [graphInsights, selectedGraphIdentityIds]);

    const visibleGraphMemories = useMemo(() => {
        const memories = graphInsights?.l1Memories || [];
        if (!selectedGraphIdentityIds) return memories.slice(0, GRAPH_PREVIEW_LIMIT);
        return memories
            .filter(memory => memory.charId && selectedGraphIdentityIds.has(memory.charId))
            .slice(0, GRAPH_PREVIEW_LIMIT);
    }, [graphInsights, selectedGraphIdentityIds]);

    // 初次连接后只拉取一次统计，避免重复请求
    const statsLoaded = React.useRef(false);
    useEffect(() => {
        if (isConnected && !statsLoaded.current) {
            statsLoaded.current = true;
            fetchStats();
        }
    }, [isConnected]);

    const fetchStats = useCallback(async () => {
        const url = getBackendUrl();
        if (!url) return;
        setLoading(true);
        setStatsFailed(false);
        try {
            const resp = await fetch(`${url}/api/graph/stats-by-char`, {
                headers: authHeaders(),
                signal: safeTimeoutSignal(60000), // 60s timeout
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            setAllStats(data);
            setStatsFailed(false);
        } catch (e: any) {
            console.warn('加载图谱统计失败', e);
            setStatsFailed(true);
            // Set empty stats so the page doesn't get stuck on spinner
            setAllStats(prev => prev ?? { characters: [], graph: { nodes: 0, edges: 0 } });
        } finally { setLoading(false); }
    }, [authHeaders]);

    const fetchGraphInsights = useCallback(async () => {
        const url = getBackendUrl();
        if (!url) return;
        setGraphInsightsLoading(true);
        setGraphInsightsFailed(false);
        try {
            const resp = await fetch(`${url}/api/graph/export`, {
                headers: authHeaders(),
                signal: safeTimeoutSignal(45000),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const relations = Array.isArray(data.relations)
                ? data.relations.map(normalizeGraphRelation)
                : [];
            const l1Memories = Array.isArray(data.l1Memories)
                ? data.l1Memories.map(normalizeGraphMemory)
                : [];
            const memoryIds = Array.from(new Set([
                ...relations.flatMap(relation => [relation.sourceId, relation.targetId]),
                ...l1Memories.flatMap(memory => [memory.id, ...memory.sourceMemoryIds]),
            ].filter(Boolean)));
            const localMemories = await DB.getVectorMemoriesByIds(memoryIds).catch(() => [] as VectorMemory[]);
            const memoryById = new Map(localMemories.map(memory => [memory.id, memory]));
            setGraphInsights(enrichGraphInsights(relations, l1Memories, memoryById));
        } catch (e) {
            console.warn('加载认知图谱失败', e);
            setGraphInsightsFailed(true);
            setGraphInsights(prev => prev ?? { relations: [], l1Memories: [] });
        } finally {
            setGraphInsightsLoading(false);
        }
    }, [authHeaders]);

    const graphInsightsLoaded = React.useRef(false);
    useEffect(() => {
        if (isConnected && !graphInsightsLoaded.current) {
            graphInsightsLoaded.current = true;
            fetchGraphInsights();
        }
    }, [fetchGraphInsights, isConnected]);

    const fetchOrphanPreview = useCallback(async (cloudCharId: string, options?: { retry?: boolean }) => {
        const url = getBackendUrl();
        const legacyCharId = cloudCharId.trim();
        if (!url || !legacyCharId) return;

        const existing = orphanPreviews[legacyCharId];
        if (!options?.retry && (existing?.loading || existing?.memories.length || existing?.error)) return;
        if (orphanPreviewRequestsRef.current.has(legacyCharId)) return;

        orphanPreviewRequestsRef.current.add(legacyCharId);
        setOrphanPreviews(prev => ({ ...prev, [legacyCharId]: { loading: true, memories: [] } }));
        try {
            const resp = await fetch(
                `${url}/api/memories/${encodeURIComponent(legacyCharId)}/headers?limit=${ORPHAN_PREVIEW_LIMIT}`,
                { headers: authHeaders(), signal: safeTimeoutSignal(15000) },
            );
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const memories = Array.isArray(data.headers)
                ? data.headers.slice(0, ORPHAN_PREVIEW_LIMIT).map((item: any) => {
                    const createdAt = Number(item.createdAt);
                    return {
                        id: String(item.id || ''),
                        title: String(item.title || ''),
                        content: String(item.content || ''),
                        emotionalJourney: item.emotionalJourney ? String(item.emotionalJourney) : undefined,
                        createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
                    };
                })
                : [];
            setOrphanPreviews(prev => ({ ...prev, [legacyCharId]: { loading: false, memories } }));
        } catch (e: any) {
            setOrphanPreviews(prev => ({
                ...prev,
                [legacyCharId]: { loading: false, memories: [], error: e?.message || 'preview failed' },
            }));
        } finally {
            orphanPreviewRequestsRef.current.delete(legacyCharId);
        }
    }, [authHeaders, orphanPreviews]);

    useEffect(() => {
        if (!isConnected || orphanCloudStats.length === 0) return;
        orphanCloudStats.slice(0, 4).forEach(stat => fetchOrphanPreview(stat.charId));
    }, [fetchOrphanPreview, isConnected, orphanCloudStats]);

    const doBackfill = useCallback(async (dryRun: boolean) => {
        const url = getBackendUrl();
        if (!url) return;
        setBackfilling(true);
        try {
            const resp = await fetch(`${url}/api/graph/backfill`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ dryRun }),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result: BackfillResult = await resp.json();
            setBackfillResult(result);
            if (!dryRun && result.success) {
                addToast('时间丝线已经重新整理好了', 'success');
                fetchStats();
                fetchGraphInsights();
            }
        } catch (e: any) { addToast(`编织失败: ${e.message}`, 'error'); }
        finally { setBackfilling(false); setShowConfirm(null); }
    }, [authHeaders, addToast, fetchGraphInsights, fetchStats]);

    const runSemanticQueue = useCallback(async (
        url: string,
        total: number,
        options?: { canAbort?: boolean; mode?: 'semantic' | 'semantic-rebuild' },
    ) => {
        const controller = options?.canAbort ? new AbortController() : null;
        semanticAbortRef.current = controller;

        let done = 0;
        let errors = 0;
        let totalRelations = 0;
        let aborted = false;

        const markAborted = () => {
            if (aborted) return;
            aborted = true;
            setQueueStatus(prev => prev ? { ...prev, running: false, aborted: true, canAbort: false } : null);
            addToast('这次重新寻找已经暂停，稍后还可以继续', 'info');
        };

        setQueueStatus({
            total,
            done: 0,
            errors: 0,
            running: true,
            totalRelations: 0,
            mode: options?.mode || 'semantic',
            canAbort: !!options?.canAbort,
        });

        for (let i = 0; i < total; i++) {
            try {
                const processBody: any = {};
                if (selectedBackendCharId) processBody.charId = selectedBackendCharId;
                const timeoutSignal = safeTimeoutSignal(120_000);
                // AbortSignal.any is Safari 17.4+; fall back to manual wiring
                let combinedSignal: AbortSignal;
                if (controller && typeof AbortSignal.any === 'function') {
                    combinedSignal = AbortSignal.any([controller.signal, timeoutSignal]);
                } else if (controller) {
                    // Manual fallback: listen for timeout and abort the main controller
                    const onTimeout = () => { if (!controller.signal.aborted) controller.abort(); };
                    timeoutSignal.addEventListener('abort', onTimeout, { once: true });
                    combinedSignal = controller.signal;
                } else {
                    combinedSignal = timeoutSignal;
                }
                const r = await fetch(`${url}/api/graph/semantic-process-one`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify(processBody),
                    signal: combinedSignal,
                });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json() as any;

                if (data.done) {
                    setQueueStatus(prev => prev ? { ...prev, done, running: false, canAbort: false } : null);
                    break;
                }

                if (data.processed) {
                    done++;
                    totalRelations += (data.relationsFound || 0);
                    setQueueStatus({
                        total,
                        done,
                        errors,
                        running: true,
                        lastElapsed: data.elapsed,
                        totalRelations,
                        lastRelations: data.relationsFound,
                        lastSnippet: data.debug?.llmSnippet,
                        lastParseError: data.debug?.parseError,
                        lastRawCount: data.debug?.rawParsedCount ?? data.debug?.rawParsed?.length,
                        lastFilterCount: data.relationsFound,
                        lastCandidateCount: data.debug?.candidateCount,
                        lastVecSim: data.debug?.vectorSimilarityUsed,
                        mode: options?.mode || 'semantic',
                        canAbort: !!options?.canAbort,
                    });
                } else if (data.error) {
                    errors++;
                    setQueueStatus({
                        total,
                        done,
                        errors,
                        running: true,
                        lastError: data.error,
                        lastElapsed: data.elapsed,
                        mode: options?.mode || 'semantic',
                        canAbort: !!options?.canAbort,
                    });
                    if (errors >= 5) {
                        addToast('连续出现了几次异常，我先替你暂停了', 'error');
                        setQueueStatus(prev => prev ? { ...prev, running: false, lastError: data.error, canAbort: false } : null);
                        break;
                    }
                }
            } catch (e: any) {
                if (e?.name === 'AbortError') {
                    markAborted();
                    break;
                }

                errors++;
                setQueueStatus(prev => prev ? {
                    ...prev,
                    errors,
                    running: true,
                    lastError: e.message,
                    mode: options?.mode || 'semantic',
                } : null);
                if (errors >= 5) {
                    addToast('网络波动有些频繁，我先替你暂停了', 'error');
                    setQueueStatus(prev => prev ? { ...prev, running: false, canAbort: false } : null);
                    break;
                }
            }

            await new Promise(r => setTimeout(r, 1000));

            if (controller?.signal.aborted) {
                markAborted();
                break;
            }
        }

        setQueueStatus(prev => prev ? { ...prev, running: false, aborted, canAbort: false } : null);
        if (semanticAbortRef.current === controller) semanticAbortRef.current = null;

        return { done, errors, totalRelations, aborted };
    }, [authHeaders, addToast, selectedBackendCharId]);

    const doSemanticBackfill = useCallback(async (dryRun: boolean, forceRescan = false) => {
        const url = getBackendUrl();
        if (!url) return;
        setSemanticRunning(true);
        setSemanticRebuilding(false);
        if (!dryRun) {
            setQueueStatus(null);
            setSemanticRebuildResult(null);
        }
        try {
            const body: any = { dryRun, forceRescan };
            if (selectedBackendCharId) body.charId = selectedBackendCharId;
            const resp = await fetch(`${url}/api/graph/backfill-semantic`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result: SemanticResult = await resp.json();
            setSemanticResult(result);

            if (dryRun) return;

            if (result.totalQueued === 0) {
                addToast('所有回忆都已找到彼此的联系', 'success');
                setShowConfirm('rescan');
                return;
            }

            // 后端先把需要补语义边的记忆入队，真正逐条处理仍走 semantic-process-one
            const { done, errors, aborted } = await runSemanticQueue(url, result.totalQueued, { mode: 'semantic' });
            if (!aborted && done > 0) {
                addToast(`已为 ${done} 段回忆找到新的联系${errors > 0 ? `，另有 ${errors} 段暂未完成` : ''}`, 'success');
            }

            fetchStats();
            fetchGraphInsights();
        } catch (e: any) { addToast(`寻找失败: ${e.message}`, 'error'); }
        finally { setSemanticRunning(false); setShowConfirm(prev => prev === 'semantic' ? null : prev); }
    }, [authHeaders, addToast, selectedBackendCharId, fetchGraphInsights, fetchStats, runSemanticQueue]);

    const doSemanticRebuild = useCallback(async () => {
        const url = getBackendUrl();
        if (!url || !selectedBackendCharId) return;
        setSemanticRunning(true);
        setSemanticRebuilding(true);
        setQueueStatus(null);
        setSemanticResult(null);
        try {
            const resp = await fetch(`${url}/api/graph/semantic-rebuild`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ charId: selectedBackendCharId }),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const result: SemanticRebuildResult = await resp.json();
            setSemanticRebuildResult({
                charId: selectedBackendCharId,
                deleted: result.deleted,
                reset: result.reset,
                toProcess: result.toProcess,
            });

            addToast(`已清除 ${result.deleted} 条旧联系，${result.toProcess} 段回忆已排队重新寻找`, result.toProcess > 0 ? 'success' : 'info');
            fetchStats();
            fetchGraphInsights();

            if (result.toProcess === 0) return;

            const { done, errors, aborted } = await runSemanticQueue(url, result.toProcess, {
                canAbort: true,
                mode: 'semantic-rebuild',
            });

            if (!aborted) {
                if (done > 0) {
                    addToast(`重新织梦完成，已重新寻找 ${done} 段回忆${errors > 0 ? `，另有 ${errors} 段暂未完成` : ''}`, errors > 0 ? 'info' : 'success');
                } else if (errors > 0) {
                    addToast(`重新织梦暂未完成，还有 ${errors} 处异常`, 'error');
                }
            }

            fetchStats();
            fetchGraphInsights();
        } catch (e: any) {
            addToast(`重新织梦失败: ${e.message}`, 'error');
        } finally {
            setSemanticRunning(false);
            setSemanticRebuilding(false);
            setShowConfirm(prev => prev === 'semanticRebuild' ? null : prev);
        }
    }, [authHeaders, addToast, selectedBackendCharId, fetchGraphInsights, fetchStats, runSemanticQueue]);

    // Distillation 需要完整 embedding 配置，因此使用 fullHeaders
    const doDistill = useCallback(async () => {
        const url = getBackendUrl();
        if (!url || !selectedBackendCharId) return;
        setDistilling(true);
        setDistillResetStats(null);
        try {
            const charName = charNameMap(selectedBackendCharId);
            const systemPrompt = selectedMemoryChar?.systemPrompt || '';
            const characterProfileContext = buildCharacterProfileContextForDistillation(selectedMemoryChar);
            const resp = await fetch(`${url}/api/distillation/run`, {
                method: 'POST', headers: fullHeaders(),
                body: JSON.stringify({ charId: selectedBackendCharId, charName, userName: userProfile.name, systemPrompt, characterProfileContext }),
            });
            if (!resp.ok) {
                let detail = `HTTP ${resp.status}`;
                try { const body = await resp.json(); detail = body?.message || body?.error || detail; } catch {}
                throw new Error(detail);
            }
            const result: DistillResult = await resp.json();
            setDistillResult(result);
            if (result.l1Created > 0 || result.l1Merged > 0 || result.l1Deduped > 0) {
                const parts: string[] = [];
                if (result.l1Created > 0) parts.push(`新建 ${result.l1Created}`);
                if (result.l1Merged > 0) parts.push(`合并 ${result.l1Merged}`);
                if (result.l1Deduped > 0) parts.push(`去重 ${result.l1Deduped}`);
                addToast(`回忆结晶完成：${parts.join('，')}`, 'success');
                fetchStats();
                fetchGraphInsights();
            } else {
                addToast('暂时还没有适合凝结成印象的新回忆', 'info');
            }
        } catch (e: any) { addToast(`凝结失败: ${e.message}`, 'error'); }
        finally { setDistilling(false); setShowConfirm(prev => prev === 'distill' ? null : prev); }
    }, [fullHeaders, addToast, selectedBackendCharId, selectedMemoryChar, charNameMap, fetchGraphInsights, fetchStats, userProfile.name]);

    const doDistillRebuild = useCallback(async () => {
        const url = getBackendUrl();
        if (!url || !selectedBackendCharId) return;
        setDistillRebuilding(true);
        try {
            const charName = charNameMap(selectedBackendCharId);
            const systemPrompt = selectedMemoryChar?.systemPrompt || '';
            const characterProfileContext = buildCharacterProfileContextForDistillation(selectedMemoryChar);
            const resp = await fetch(`${url}/api/distillation/reset-and-run`, {
                method: 'POST',
                headers: fullHeaders(),
                body: JSON.stringify({ charId: selectedBackendCharId, charName, userName: userProfile.name, systemPrompt, characterProfileContext }),
            });
            if (!resp.ok) {
                let detail = `HTTP ${resp.status}`;
                try { const body = await resp.json(); detail = body?.message || body?.error || detail; } catch {}
                throw new Error(detail);
            }

            const result: DistillResult = await resp.json();
            setDistillResult(result);
            setDistillResetStats(result.resetStats ? { charId: selectedBackendCharId, ...result.resetStats } : null);

            if (result.l1Created > 0 || result.l1Merged > 0 || result.l1Deduped > 0) {
                const parts: string[] = [];
                if (result.l1Created > 0) parts.push(`新建 ${result.l1Created}`);
                if (result.l1Merged > 0) parts.push(`合并 ${result.l1Merged}`);
                if (result.l1Deduped > 0) parts.push(`去重 ${result.l1Deduped}`);
                addToast(`重新凝结完成：${parts.join('，')}`, 'success');
            } else {
                addToast('重新凝结完成，但这次还没有新的回忆印象出现', 'info');
            }

            fetchStats();
            fetchGraphInsights();
        } catch (e: any) {
            addToast(`重新凝结失败: ${e.message}`, 'error');
        } finally {
            setDistillRebuilding(false);
            setShowConfirm(prev => prev === 'distillRebuild' ? null : prev);
        }
    }, [fullHeaders, addToast, selectedBackendCharId, selectedMemoryChar, charNameMap, fetchGraphInsights, fetchStats, userProfile.name]);

    // ─── Sync helpers (used by sync view) ───
    const handleAbortSemantic = useCallback(() => {
        if (semanticAbortRef.current) {
            semanticAbortRef.current.abort();
            semanticAbortRef.current = null;
        }
    }, []);

    const startTemporalBackfill = useCallback(() => doBackfill(false), [doBackfill]);
    const startSemanticSweep = useCallback(() => doSemanticBackfill(false), [doSemanticBackfill]);
    const startSemanticRebuild = useCallback(() => doSemanticRebuild(), [doSemanticRebuild]);
    const startDistillation = useCallback(() => doDistill(), [doDistill]);
    const startDistillRebuild = useCallback(() => doDistillRebuild(), [doDistillRebuild]);

    const pushSync = useCallback(async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            let totalPushed = 0;
            for (const char of characters) {
                const mems = await DB.getAllVectorMemories(char.id);
                const result = await pushMemories(char.id, mems);
                if (result) totalPushed += result.synced;
            }
            setSyncResult({ pushed: totalPushed, pulled: 0 });
            addToast(`已将 ${totalPushed} 段回忆写入云端`, 'success');
            fetchStats();
        } catch (e: any) { addToast(`写入失败: ${e.message}`, 'error'); }
        finally { setSyncing(false); }
    }, [addToast, characters, fetchStats]);

    const pullSync = useCallback(async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const localIdentityIds = new Set(
                characters.flatMap(c =>
                    [c.id, c.charInstanceId].filter((v): v is string => typeof v === 'string' && v.trim() !== '')
                )
            );
            const cloudChars = await listCloudChars();
            if (!cloudChars || cloudChars.length === 0) {
                addToast('云端还没有回忆', 'info');
                setSyncing(false);
                return;
            }
            let totalPulled = 0;
            for (const cc of cloudChars) {
                const cloudCharId = cc.charId;
                const contentCharId = await DB.resolveCharacterContentId(cloudCharId);
                const isLocal = localIdentityIds.has(cloudCharId) || contentCharId !== cloudCharId;
                if (!isLocal) continue;

                const cloudMems = await pullMemories(cloudCharId);
                if (!cloudMems || cloudMems.length === 0) continue;
                for (const mem of cloudMems) {
                    const existing = await DB.getVectorMemoryById(mem.id);
                    if (!existing) {
                        await DB.saveVectorMemory(mem);
                        totalPulled++;
                    }
                }
            }
            setSyncResult({ pushed: 0, pulled: totalPulled });
            if (totalPulled === 0) addToast('云端回忆均已同步', 'info');
            else addToast(`已唤回 ${totalPulled} 段云端回忆`, 'success');
        } catch (e: any) { addToast(`唤回失败: ${e.message}`, 'error'); }
        finally { setSyncing(false); }
    }, [addToast, characters]);

    const claimCloudCharacter = useCallback(async (
        cloudCharId: string,
        targetChar: CharacterProfile | null,
    ): Promise<boolean> => {
        const legacyCharId = cloudCharId.trim();
        if (!legacyCharId) return false;
        if (!targetChar) {
            addToast('先选中要接收回忆的角色', 'info');
            return false;
        }

        const targetContentId = targetChar.id;
        setClaimingCloudCharId(legacyCharId);
        try {
            const cloudResult = await migrateCloudCharacterInstance(legacyCharId, targetContentId);
            if (!cloudResult?.ok) throw new Error('云端迁移没有完成');

            const localResult = await DB.migrateLocalCharacterContentToInstance(legacyCharId, targetContentId);
            const cloudMems = await pullMemories(targetContentId, { includeDeprecated: true, vectors: true });
            let pulled = 0;
            if (cloudMems) {
                for (const memory of cloudMems) {
                    await DB.saveVectorMemory({ ...memory, charId: targetContentId });
                    pulled++;
                }
            }

            const movedCount = Number(cloudResult.counts?.memories || localResult.vectorMemories || pulled || 0);
            setSelectedCharId(targetChar.id);
            setSyncResult({ pushed: 0, pulled: movedCount });
            await fetchStats();
            addToast(`已把 ${movedCount} 段云端回忆归档到 ${targetChar.name}`, 'success');
            haptic.medium();
            return true;
        } catch (e: any) {
            addToast(`绑定失败: ${e.message}`, 'error');
            return false;
        } finally {
            setClaimingCloudCharId(null);
        }
    }, [addToast, fetchStats]);

    const handleUpdateBrowserVectorMemory = useCallback(async (
        memoryId: string,
        updates: VectorMemoryEditableFields,
    ): Promise<{ mode: 'cloud' | 'local_fallback'; reason?: string }> => {
        const memory = await DB.getVectorMemoryById(memoryId);
        if (!memory) throw new Error('没有找到这条向量记忆');

        const result = await updateVectorMemoryManaged(
            memory.charId,
            memory,
            updates,
            hasCloudSyncTarget(),
            {
                updateCloudMemory,
                saveLocalMemory: DB.saveVectorMemory,
                pullCloudMemories: pullMemories,
                replaceLocalMemories: DB.replaceVectorMemories,
                listLocalMemories: DB.getAllVectorMemories,
            },
        );

        await Promise.all([
            fetchStats(),
            fetchGraphInsights(),
        ]);

        return {
            mode: result.mode,
            reason: result.reason,
        };
    }, [fetchGraphInsights, fetchStats]);

    const openClaimDrawer = useCallback((cloudCharId: string) => {
        setClaimDrawerCharId(cloudCharId);
        setClaimTargetCharId(selectedMemoryChar?.id || null);
        fetchOrphanPreview(cloudCharId, { retry: true });
        haptic.light();
    }, [fetchOrphanPreview, selectedMemoryChar]);

    const closeClaimDrawer = useCallback(() => {
        setClaimDrawerCharId(null);
        setClaimTargetCharId(null);
        haptic.light();
    }, []);

    const openGraphDrawer = useCallback((selection: GraphDrawerSelection) => {
        setGraphDrawer(selection);
        haptic.light();
    }, []);

    const closeGraphDrawer = useCallback(() => {
        setGraphDrawer(null);
        haptic.light();
    }, []);

    const confirmClaimDrawer = useCallback(async () => {
        if (!activeClaimStat) return;
        const migrated = await claimCloudCharacter(activeClaimStat.charId, claimTargetChar);
        if (migrated) {
            setClaimDrawerCharId(null);
            setClaimTargetCharId(null);
        }
    }, [activeClaimStat, claimCloudCharacter, claimTargetChar]);

    const handleBindSyncCode = useCallback(() => {
        const nextId = bindInput.trim();
        const currentId = getUserId().trim();
        if (!nextId) {
            addToast('请输入同步码', 'info');
            return;
        }
        if (nextId.toLowerCase() === currentId.toLowerCase()) {
            addToast('这已经是你的账号了', 'info');
            setBindInput('');
            setSyncCodeVisible(false);
            haptic.light();
            return;
        }
        setUserId(nextId, { source: 'manual' });
        setSyncUserId(nextId);
        setBindInput('');
        setSyncCodeVisible(false);
        setSyncResult(null);
        addToast('已登记这枚印记，点击「签收回忆」唤回云端回忆', 'success');
        haptic.medium();
    }, [addToast, bindInput]);

    const handleOpenSourceInChat = useCallback((charId: string, messageId: number) => {
        setActiveCharacterId(charId);
        openApp(AppID.Chat, {
            targetCharId: charId,
            targetMessageId: messageId,
            targetRequestId: `${charId}:${messageId}:${Date.now()}`,
        });
    }, [openApp, setActiveCharacterId]);

    const handleOpenGraphSourceInChat = useCallback((charId: string, messageId: number) => {
        setGraphDrawer(null);
        handleOpenSourceInChat(charId, messageId);
    }, [handleOpenSourceInChat]);

    /* ─── Render ─── */

    return (
        <div className="fixed inset-0 flex flex-col bg-[#F8F3ED] text-[#6B5E50] overflow-hidden font-sans selection:bg-[#8B7355]/20 selection:text-[#5C4F40]">

            {/* ── Floating Menu Button (when sidebar closed) ── */}
            {!sidebarOpen && (
                <button
                    aria-label="打开认知网络菜单"
                    onClick={() => { setSidebarOpen(true); haptic.light(); }}
                    className="fixed top-[max(0.6rem,calc(env(safe-area-inset-top)+0.25rem))] left-3 z-40 flex h-6 w-6 items-center justify-center text-[#e5d08f]/80 transition-transform active:scale-95"
                >
                    <span className="relative flex h-[18px] w-[18px] rotate-[-8deg] items-center justify-center rounded-[6px] border border-[#e5d08f]/36 bg-[#0d0c11]/18 shadow-[0_0_8px_rgba(229,208,143,0.10),0_1px_0_rgba(255,255,255,0.08)_inset] backdrop-blur-[2px]">
                        <span className="absolute inset-[3px] rounded-[4px] border border-[#e5d08f]/16" />
                        <span className="absolute h-px w-2 bg-gradient-to-r from-transparent via-[#fff1bd]/58 to-transparent" />
                        <span className="absolute h-2 w-px bg-gradient-to-b from-transparent via-[#fff1bd]/42 to-transparent" />
                        <span className="h-[4px] w-[4px] rounded-full border border-[#fff1bd]/58 bg-[#fff7dc]/26 shadow-[0_0_6px_rgba(255,241,189,0.28)]" />
                    </span>
                </button>
            )}

            {/* ── Sidebar Overlay (when open) ── */}
            {sidebarOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/45 backdrop-blur-[3px] z-40 transition-opacity"
                        onClick={() => { setSidebarOpen(false); haptic.light(); }}
                    />

                    {/* Drawer */}
                    <div className="fixed top-0 left-0 bottom-0 w-64 z-50 flex flex-col overflow-hidden bg-[#101621]/96 backdrop-blur-2xl border-r border-[#d7b56c]/22 shadow-[14px_0_44px_rgba(0,0,0,0.34)]" style={{ animation: 'slideInLeft 250ms ease-out' }}>
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,232,163,0.08),transparent_38%,rgba(255,255,255,0.03))]" />
                        <div className="pointer-events-none absolute inset-0 opacity-[0.045] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,232,163,0.72)_1px,transparent_0)] [background-size:18px_18px]" />

                        {/* Header */}
                        <div className="relative z-10 flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl border border-[#d7b56c]/38 bg-[#172235] shadow-[0_8px_18px_rgba(0,0,0,0.24)] flex items-center justify-center">
                                    <span className="text-[#ffe8a3] text-[11px] font-serif italic">N</span>
                                </div>
                                <div>
                                    <h2 className="text-[#ffe8a3] font-bold text-[15px] tracking-widest font-serif">认知网络</h2>
                                    <p className="mt-0.5 text-[8px] font-semibold tracking-[0.22em] text-[#d7b56c]/42">COGNITIVE NETWORK</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setSidebarOpen(false); haptic.light(); }}
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-[#d7b56c]/58 hover:bg-white/[0.06] hover:text-[#ffe8a3] transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-[16px] h-[16px]">
                                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                                </svg>
                            </button>
                        </div>

                        {/* Nav Items */}
                        <nav className="relative z-10 flex flex-col gap-1 px-3 mt-2">
                    {([
                        { id: 'home' as const, label: '记忆全览', iconPath: 'M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z' },
                        { id: 'browser' as const, label: '记忆浏览器', iconPath: 'M11.25 2.25c-2.347 0-4.25 1.903-4.25 4.25v.636a4.25 4.25 0 0 0 0 8.228v.636c0 2.347 1.903 4.25 4.25 4.25h4.25c2.347 0 4.25-1.903 4.25-4.25v-9.5c0-2.347-1.903-4.25-4.25-4.25h-4.25Zm-1.75 4.25c0-.966.784-1.75 1.75-1.75h4.25c.966 0 1.75.784 1.75 1.75v9.5c0 .966-.784 1.75-1.75 1.75h-4.25A1.75 1.75 0 0 1 9.5 16v-.25h2.75a.75.75 0 0 0 0-1.5H8.75a2.75 2.75 0 1 1 0-5.5h3.5a.75.75 0 0 0 0-1.5H9.5V6.5Z' },
                        { id: 'workshop' as const, label: '拾念', iconPath: 'M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z' },
                        { id: 'sync' as const, label: '漫游备份', iconPath: 'M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 0 0-1.032-.211 50.89 50.89 0 0 0-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 0 0 2.433 3.984L7.28 21.53A.75.75 0 0 1 6 21v-2.234a8.865 8.865 0 0 1-1.087-.215c-1.922-.25-3.291-1.86-3.405-3.727a46.606 46.606 0 0 1 0-8.862c.114-1.866 1.483-3.477 3.405-3.727ZM14.75 7.5c-1.946 0-3.87.078-5.77.226-1.46.122-2.48 1.362-2.48 2.682v4.286c0 1.32 1.02 2.56 2.48 2.682a48.93 48.93 0 0 0 5.77.226c1.946 0 3.87-.078 5.77-.226 1.46-.122 2.48-1.362 2.48-2.682v-4.286c0-1.32-1.02-2.56-2.48-2.682A48.574 48.574 0 0 0 14.75 7.5Z' },
                    ]).map(item => (
                        <button
                            key={item.id}
                            onClick={() => { setActiveTab(item.id); setSidebarOpen(false); haptic.medium(); }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all relative overflow-hidden group
                                ${activeTab === item.id ? 'text-[#ffe8a3] bg-[#172235]/92 shadow-[0_10px_22px_rgba(0,0,0,0.22)] ring-1 ring-[#d7b56c]/20' : 'text-[#d7b56c]/48 hover:bg-white/[0.055] hover:text-[#f2e6c6]/86'}
                            `}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-[18px] h-[18px] shrink-0 transition-transform ${activeTab === item.id ? 'scale-110 drop-shadow-sm' : 'opacity-80 group-hover:scale-105'}`}>
                                <path fillRule="evenodd" d={item.iconPath} clipRule="evenodd" />
                            </svg>
                            <span className="text-[13px] font-medium tracking-wide truncate">{item.label}</span>
                            {activeTab === item.id && <div className="absolute right-0 w-1 h-5 bg-[#d7b56c]/54 rounded-l-full" />}
                        </button>
                    ))}
                        </nav>

                        <div className="flex-1" />

                        {/* Exit Button */}
                        <button
                            onClick={() => { haptic.light(); closeApp(); }}
                            className="relative z-10 flex items-center gap-3 mx-3 mb-[max(0.5rem,env(safe-area-inset-bottom))] rounded-2xl px-4 py-3 text-[#d7b56c]/46 hover:bg-[#5f2b3a]/22 hover:text-[#ffd7df] transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px] shrink-0 opacity-80">
                                <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
                                <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-.943a.75.75 0 1 0-1.004-1.114l-2.5 2.25a.75.75 0 0 0 0 1.114l2.5 2.25a.75.75 0 1 0 1.004-1.114l-1.048-.943h9.546A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
                            </svg>
                            <span className="text-[12px] font-medium tracking-wide">退出系统</span>
                        </button>
                    </div>
                </>
            )}

            {/* ── Main Content Area ── */}
            <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">

                {/* ── HOME TAB ── */}
                {activeTab === 'home' && (
                    <div className="flex-1 overflow-y-auto no-scrollbar relative" style={{ background: 'radial-gradient(circle at 18% -8%, rgba(216,163,184,0.18) 0%, transparent 34%), radial-gradient(circle at 88% 16%, rgba(181,154,116,0.14) 0%, transparent 32%), linear-gradient(180deg, #0D0C11 0%, #141116 52%, #0F0E13 100%)' }}>
                        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
                            <img src="/images/bg-dusk.png" alt="" className="absolute inset-x-0 top-0 w-full h-64 object-cover opacity-[0.14]" />
                            <img src="/images/paper-texture.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.05]" />
                            <img src="/images/collage/flower-cosmos.png" alt="" className="absolute -left-16 top-36 w-56 opacity-[0.08]" style={{ filter: 'invert(1) brightness(1.6)', transform: 'rotate(-18deg)' }} />
                            <img src="/images/decorations/postmark3.png" alt="" className="absolute right-4 top-24 w-24 opacity-[0.08]" style={{ filter: 'invert(1) brightness(1.5)', transform: 'rotate(11deg)' }} />
                            {HOME_MEMORY_MOTES.map((mote, i) => (
                                <motion.span
                                    key={i}
                                    aria-hidden="true"
                                    data-home-memory-mote=""
                                    className={`absolute rounded-full ${shouldCalmHomeMotion ? '' : 'mix-blend-screen'}`}
                                    style={{
                                        left: mote.left,
                                        top: mote.top,
                                        width: mote.size,
                                        height: mote.size,
                                        background: `radial-gradient(circle, rgba(255,255,255,0.96) 0%, ${mote.color} 38%, rgba(212,175,55,0.18) 68%, transparent 100%)`,
                                        opacity: shouldCalmHomeMotion ? mote.opacity * 0.72 : mote.opacity,
                                        boxShadow: shouldCalmHomeMotion
                                            ? `0 0 ${mote.size * 3}px rgba(229,208,143,0.45)`
                                            : `0 0 ${mote.size * 6}px ${mote.color}, 0 0 ${mote.size * 20}px rgba(212,175,55,0.34)`,
                                        willChange: shouldCalmHomeMotion ? 'auto' : 'transform, opacity',
                                        backfaceVisibility: 'hidden',
                                    }}
                                    animate={shouldCalmHomeMotion ? undefined : {
                                        x: [0, mote.x, mote.x * -0.35, 0],
                                        y: [0, mote.y, mote.y * 0.45, 0],
                                        opacity: [mote.opacity * 0.35, mote.opacity, mote.opacity * 0.62, mote.opacity * 0.35],
                                        scale: [1, mote.scale, 0.92, 1],
                                    }}
                                    transition={shouldCalmHomeMotion ? undefined : {
                                        duration: mote.duration,
                                        repeat: Infinity,
                                        delay: mote.delay,
                                        ease: 'easeInOut',
                                    }}
                                />
                            ))}
                        </div>

                        <div className="relative z-10 px-5 pt-16 pb-24 space-y-5">
                            <section className="relative min-h-[218px] overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#141217]/90 shadow-[0_18px_44px_rgba(0,0,0,0.42)]">
                                <img
                                    src="/images/akashic-texture.png"
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-cover opacity-[0.34]"
                                    style={{ filter: 'brightness(1.12) contrast(1.16)', objectPosition: '50% 50%' }}
                                />
                                <div className="absolute inset-0 bg-gradient-to-r from-[#141217]/92 via-[#141217]/72 to-[#141217]/82" />
                                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,251,247,0.08),transparent_42%),radial-gradient(circle_at_78%_18%,rgba(216,163,184,0.16),transparent_34%)]" />
                                <div className="absolute left-0 top-0 h-full w-[42%] bg-[#FFFBF7]/[0.04] border-r border-white/[0.06]" />
                                <div className="absolute top-5 left-5 text-[8px] text-white/25 tracking-[0.28em] font-semibold">MEMORY DOSSIER</div>
                                <div className="absolute top-5 right-5 flex items-center gap-2 text-[8px] text-white/25 tracking-[0.18em]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#D8A3B8]/70 shadow-[0_0_12px_rgba(216,163,184,0.5)]" />
                                    PRIVATE
                                </div>
                                <div className="absolute right-5 bottom-5 h-12 w-[104px] -skew-x-6 overflow-hidden rounded-[6px] border border-[#e5d08f]/16 bg-[#0d0c11]/24 shadow-[0_1px_0_rgba(255,255,255,0.07)_inset,0_0_22px_rgba(212,175,55,0.08)]">
                                    <div className="absolute inset-px rounded-[5px] border border-white/[0.035]" />
                                    <div className="absolute left-3 top-3 h-px w-16 bg-gradient-to-r from-[#fff1bd]/34 via-[#e5d08f]/12 to-transparent" />
                                    <div className="absolute left-3 top-[18px] h-px w-10 bg-gradient-to-r from-[#e5d08f]/20 to-transparent" />
                                    <div className="absolute left-3 bottom-3 flex gap-1">
                                        {[0, 1, 2, 3, 4].map(mark => (
                                            <span key={mark} className="h-2.5 w-px bg-[#e5d08f]/16" />
                                        ))}
                                    </div>
                                    <div className="absolute right-3 top-2 h-7 w-5 bg-[linear-gradient(135deg,rgba(255,241,189,0.18),rgba(255,255,255,0.03)_44%,rgba(0,0,0,0.18))] shadow-[0_0_12px_rgba(229,208,143,0.08)]" />
                                </div>

                                <div className="relative h-full min-h-[218px] flex flex-col justify-end p-5">
                                    <p className="text-[10px] text-white/32 tracking-[0.22em] mb-3" style={{ fontFamily: "Georgia, serif" }}>
                                        {selectedCharId ? `VIEWING / ${charNameMap(selectedCharId)}` : 'VIEWING / ALL'}
                                    </p>
                                    <h1 className="text-[31px] font-bold text-[#FFFBF7] tracking-[0.16em] leading-none" style={{ fontFamily: "'Noto Serif SC', serif" }}>回忆卷宗</h1>
                                    <p className="text-[12px] text-white/60 leading-relaxed mt-4 tracking-[0.08em]" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                                        不必追问他记不记得，痕迹会自己浮上来。
                                    </p>
                                    <div className="mt-5 flex items-center gap-3 text-[9px] text-white/30 tracking-[0.14em]">
                                        <span className="h-px flex-1 bg-white/[0.08]" />
                                        <span>MEMORY ARCHIVE</span>
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-2.5">
                                <div className="flex items-center justify-between px-1">
                                    <p className="text-[10px] text-white/46 tracking-[0.22em] font-semibold">观测对象</p>
                                    <p className="text-[9px] text-white/28 tracking-[0.14em]">{characters.length} PROFILES</p>
                                </div>
                                <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                                    <button
                                        onClick={() => { setSelectedCharId(null); haptic.light(); }}
                                        className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full text-[11px] font-semibold transition-all border ${
                                            !selectedCharId
                                                ? 'bg-[#FFFBF7] text-[#17151B] border-transparent shadow-[0_8px_24px_rgba(255,251,247,0.16)]'
                                                : 'bg-white/[0.05] text-white/38 border-white/[0.07] hover:bg-white/[0.08]'
                                        }`}
                                    >
                                        全部角色
                                    </button>
                                    {characters.map(c => (
                                        <button key={c.id} onClick={() => { setSelectedCharId(c.id); haptic.light(); }}
                                            className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border ${
                                                selectedCharId === c.id
                                                    ? 'bg-[#FFFBF7] text-[#17151B] border-transparent shadow-[0_8px_24px_rgba(255,251,247,0.16)]'
                                                    : 'bg-white/[0.05] text-white/42 border-white/[0.07] hover:bg-white/[0.08]'
                                            }`}
                                        >
                                            <img src={c.avatar} alt={c.name} className="w-5 h-5 rounded-full object-cover ring-1 ring-white/20" />
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                                {orphanCloudStats.length > 0 && (
                                    <div className="space-y-2 rounded-[14px] border border-[#e5d08f]/18 bg-[#171419]/76 p-3 shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-[9px] font-semibold tracking-[0.22em] text-[#e5d08f]/70">待归档回忆</p>
                                                <p className="mt-1 text-[11px] leading-relaxed text-white/46">
                                                    发现 {orphanMemoryTotal} 段还没连到本机角色的云端回忆。
                                                </p>
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            {orphanCloudStats.map((stat, index) => {
                                                const isClaiming = claimingCloudCharId === stat.charId;
                                                const preview = orphanPreviews[stat.charId];
                                                const latestCreatedAt = preview?.memories?.[0]?.createdAt;
                                                return (
                                                    <div key={stat.charId} className="rounded-[10px] border border-white/[0.055] bg-white/[0.035] px-3 py-2.5">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="text-[11px] font-semibold text-white/72">{getOrphanGroupLabel(index, orphanCloudStats.length)}</p>
                                                                <p className="mt-0.5 text-[12px] font-semibold text-[#fff1bd]">
                                                                    {stat.memories} 段
                                                                    {latestCreatedAt ? ` · 最近 ${formatOrphanPreviewDate(latestCreatedAt)}` : ''}
                                                                </p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                disabled={isClaiming || syncing || !isConnected}
                                                                onClick={() => openClaimDrawer(stat.charId)}
                                                                className="shrink-0 rounded-full border border-[#e5d08f]/22 bg-[#FFFBF7] px-3 py-1.5 text-[10px] font-bold text-[#17151B] transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-white/[0.08] disabled:text-white/32"
                                                            >
                                                                {isClaiming ? '归档中...' : '整理归属'}
                                                            </button>
                                                        </div>
                                                        <div className="mt-2 space-y-1.5">
                                                            {preview?.loading ? (
                                                                <p className="text-[10px] text-white/36">正在拾取回忆线索...</p>
                                                            ) : preview?.memories.length ? (
                                                                preview.memories.map(memory => (
                                                                    <div key={memory.id || `${stat.charId}-${memory.createdAt || getOrphanPreviewTitle(memory)}`} className="rounded-[8px] border border-white/[0.045] bg-black/12 px-2.5 py-2">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <p className="min-w-0 truncate text-[10px] font-semibold text-white/62">{getOrphanPreviewTitle(memory)}</p>
                                                                            <p className="shrink-0 text-[9px] text-white/28">{formatOrphanPreviewDate(memory.createdAt)}</p>
                                                                        </div>
                                                                        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-white/40">{getOrphanPreviewSnippet(memory)}</p>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <p className="text-[10px] leading-relaxed text-white/36">
                                                                    {preview?.error ? '这组线索暂时没有回来，点整理归属还能继续处理。' : '回忆线索正在回温。'}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </section>

                            <section className="grid grid-cols-2 gap-3">
                                {[
                                    { label: '回忆片段', value: currentStats?.memories ?? '--', unit: '段', note: '被悄悄留下的细节' },
                                    { label: '心意相通', value: currentStats?.relations ?? '--', unit: '处', note: '暗暗互相回应的瞬间' },
                                    { label: '时间丝线', value: currentStats?.temporalEdges ?? '--', unit: '条', note: '相遇被重新串起' },
                                    { label: '系统状态', value: statsFailed ? '暂缺' : loading ? '回温中' : '安静运转', unit: '', note: statsFailed ? '部分数据还没回来' : '他的痕迹正在安静归档', isStatus: true },
                                ].map((stat, i) => (
                                    <div
                                        key={i}
                                        className="relative overflow-hidden rounded-[14px] border border-[#d4af37]/26 bg-[#171419] p-4 shadow-[0_18px_34px_rgba(0,0,0,0.46),0_1px_0_rgba(255,255,255,0.10)_inset,0_-1px_0_rgba(0,0,0,0.78)_inset] transition-transform duration-300 active:scale-[0.985]"
                                        style={{
                                            backgroundImage: [
                                                'linear-gradient(145deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.025) 24%, rgba(0,0,0,0.18) 58%, rgba(212,175,55,0.09) 100%)',
                                                'radial-gradient(circle at 12% 8%, rgba(255,241,189,0.12), transparent 30%)',
                                                'radial-gradient(circle at 86% 14%, rgba(255,255,255,0.055), transparent 34%)',
                                            ].join(', '),
                                        }}
                                    >
                                        <div className="absolute inset-px rounded-[13px] border border-white/[0.045] pointer-events-none" />
                                        <div className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-[#fff1bd]/52 to-transparent" />
                                        <div className="absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-[#7b6320]/32 to-transparent" />
                                        <div className="absolute -left-10 -top-14 h-28 w-40 rotate-[-16deg] bg-gradient-to-r from-transparent via-white/[0.075] to-transparent blur-[0.5px]" />
                                        <div className="absolute right-3 top-3 h-[18px] w-[26px] rounded-[5px] border border-[#e5d08f]/18 bg-[linear-gradient(135deg,rgba(229,208,143,0.12),rgba(255,255,255,0.025)_48%,rgba(0,0,0,0.18))] shadow-[0_1px_0_rgba(255,255,255,0.08)_inset]" />
                                        <div className="absolute right-4 top-5 h-px w-[18px] bg-gradient-to-r from-transparent via-[#e5d08f]/24 to-transparent" />
                                        <div
                                            className="absolute left-0 top-[11%] bottom-[11%] w-[2px] overflow-hidden bg-[#d4af37]/26 shadow-[0_0_10px_rgba(212,175,55,0.18)]"
                                            style={{
                                                WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 24%, #000 76%, transparent 100%)',
                                                maskImage: 'linear-gradient(180deg, transparent 0%, #000 24%, #000 76%, transparent 100%)',
                                            }}
                                        >
                                            <motion.div
                                                className="absolute left-0 right-0 h-[92%]"
                                                style={{
                                                    background: 'linear-gradient(180deg, transparent 0%, rgba(229,208,143,0.08) 22%, rgba(229,208,143,0.32) 40%, rgba(255,255,248,0.78) 50%, rgba(229,208,143,0.32) 60%, rgba(229,208,143,0.08) 78%, transparent 100%)',
                                                    filter: shouldCalmHomeMotion ? 'none' : 'blur(0.55px)',
                                                    boxShadow: '0 0 8px rgba(229,208,143,0.42), 0 0 16px rgba(212,175,55,0.18)',
                                                    willChange: shouldCalmHomeMotion ? 'auto' : 'transform, opacity',
                                                }}
                                                animate={shouldCalmHomeMotion ? undefined : { y: ['-118%', '128%'], opacity: [0, 0.78, 0.78, 0] }}
                                                transition={shouldCalmHomeMotion ? undefined : {
                                                    duration: 4.2,
                                                    repeat: Infinity,
                                                    repeatDelay: 0.85,
                                                    delay: i * 0.28,
                                                    ease: 'easeInOut',
                                                }}
                                            />
                                        </div>
                                        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.035),transparent_22%,transparent_78%,rgba(0,0,0,0.18))] pointer-events-none" />
                                        <div className="absolute left-4 right-4 bottom-3 h-px bg-gradient-to-r from-[#e5d08f]/18 via-transparent to-[#e5d08f]/10" />
                                        <div className="relative">
                                            <div className="inline-flex items-center gap-1.5 text-[9px] text-[#e5d08f]/90 tracking-[0.18em] font-semibold mb-3">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#e5d08f] shadow-[0_0_8px_rgba(229,208,143,0.58)]" />
                                                {stat.label}
                                            </div>
                                            {(stat as any).isStatus ? (
                                                <div className="text-[17px] font-bold text-[#FFFBF7] tracking-[0.08em]" style={{ fontFamily: "'Noto Serif SC', serif" }}>{stat.value}</div>
                                            ) : (
                                                <div className="text-[28px] font-bold text-[#FFFBF7] leading-none" style={{ fontFamily: "Georgia, serif" }}>
                                                    {stat.value}
                                                    <span className="ml-1.5 text-[10px] text-white/42 font-sans font-medium">{stat.unit}</span>
                                                </div>
                                            )}
                                            <p className="text-[9px] text-white/36 mt-3 leading-relaxed">{stat.note}</p>
                                        </div>
                                    </div>
                                ))}
                            </section>

                            <section className="relative overflow-hidden rounded-[14px] border border-[#d4af37]/18 bg-[#151319] p-4 shadow-[0_16px_34px_rgba(0,0,0,0.34),0_1px_0_rgba(255,255,255,0.07)_inset]">
                                <div className="absolute inset-px rounded-[13px] border border-white/[0.035] pointer-events-none" />
                                <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[#fff1bd]/34 to-transparent" />
                                <div className="relative space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="inline-flex items-center gap-1.5 text-[10px] text-[#e5d08f]/88 tracking-[0.2em] font-semibold">
                                                <span className="h-1.5 w-1.5 rounded-full bg-[#e5d08f] shadow-[0_0_8px_rgba(229,208,143,0.52)]" />
                                                心意图谱
                                            </div>
                                            <p className="mt-2 text-[12px] text-[#FFFBF7]/66 leading-relaxed" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                                                {selectedCharId ? `${charNameMap(selectedCharId)} 的心意连接与凝结认知，会在这里先浮出来。` : '所有角色的心意连接与凝结认知，会在这里先浮出来。'}
                                            </p>
                                        </div>
                                        <div className="shrink-0 rounded-[10px] border border-[#e5d08f]/16 bg-[#0d0c11]/28 px-2.5 py-2 text-right shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]">
                                            <div className="text-[9px] text-white/28 tracking-[0.16em]">已显现</div>
                                            <div className="mt-1 text-[18px] leading-none font-bold text-[#fff1bd]" style={{ fontFamily: "Georgia, serif" }}>
                                                {graphInsightsLoading ? '...' : visibleGraphRelations.length + visibleGraphMemories.length}
                                            </div>
                                        </div>
                                    </div>

                                    {(!isConnected || graphInsightsFailed) && (
                                        <div className="rounded-[10px] border border-[#e5d08f]/14 bg-[#0d0c11]/24 px-3 py-2 text-[11px] leading-relaxed text-white/46">
                                            {!isConnected ? '认知后端还没有连接，所以暂时读不到心意图谱。' : '心意图谱暂时没有读回来，可以稍后再刷新一次。'}
                                        </div>
                                    )}

                                    <div className="grid gap-3">
                                        <div className="rounded-[12px] border border-white/[0.055] bg-white/[0.035] p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-[10px] font-semibold tracking-[0.18em] text-[#e5d08f]/80">心意连接</p>
                                                <span className="text-[9px] text-white/30">{visibleGraphRelations.length} 条</span>
                                            </div>
                                            <div className="mt-2 space-y-2">
                                                {graphInsightsLoading ? (
                                                    [0, 1].map(item => (
                                                        <div key={item} className="h-[54px] animate-pulse rounded-[9px] border border-white/[0.045] bg-white/[0.035]" />
                                                    ))
                                                ) : visibleGraphRelations.length ? (
                                                    visibleGraphRelations.map(relation => (
                                                        <button
                                                            key={relation.id}
                                                            type="button"
                                                            onClick={() => openGraphDrawer({ kind: 'relation', item: relation })}
                                                            aria-label={`查看${relation.sourceTitle}与${relation.targetTitle}的心意连接`}
                                                            className="block w-full overflow-hidden rounded-[9px] border border-white/[0.045] bg-black/12 px-2.5 py-2 text-left transition-all active:scale-[0.99] hover:border-[#e5d08f]/18 hover:bg-white/[0.045]"
                                                        >
                                                            <div className="flex min-w-0 items-center justify-between gap-2">
                                                                <span className="min-w-0 truncate rounded-full border border-[#e5d08f]/16 px-1.5 py-0.5 text-[8px] text-[#e5d08f]/70">
                                                                    {relation.relationType}
                                                                </span>
                                                                <span className="shrink-0 text-[9px] text-[#fff1bd]/62">
                                                                    {formatGraphStrength(relation.strength) || '›'}
                                                                </span>
                                                            </div>
                                                            <p className="mt-2 line-clamp-2 max-w-full break-words text-[10px] font-semibold leading-relaxed text-[#FFFBF7]/76">
                                                                {relation.sourceTitle} <span className="text-[#e5d08f]/54">→</span> {relation.targetTitle}
                                                            </p>
                                                            <p className="mt-1 line-clamp-1 max-w-full break-words text-[10px] leading-relaxed text-white/42">{relation.summary}</p>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <p className="rounded-[9px] border border-white/[0.045] bg-black/12 px-2.5 py-2 text-[10px] leading-relaxed text-white/38">
                                                        暂时还没有可展示的心意连接。完成“心意提取”后，这里会出现两段回忆之间的关系线。
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-[12px] border border-white/[0.055] bg-white/[0.035] p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-[10px] font-semibold tracking-[0.18em] text-[#e5d08f]/80">凝结认知</p>
                                                <span className="text-[9px] text-white/30">{visibleGraphMemories.length} 条</span>
                                            </div>
                                            <div className="mt-2 space-y-2">
                                                {graphInsightsLoading ? (
                                                    [0, 1].map(item => (
                                                        <div key={item} className="h-[62px] animate-pulse rounded-[9px] border border-white/[0.045] bg-white/[0.035]" />
                                                    ))
                                                ) : visibleGraphMemories.length ? (
                                                    visibleGraphMemories.map(memory => (
                                                        <button
                                                            key={memory.id}
                                                            type="button"
                                                            onClick={() => openGraphDrawer({ kind: 'memory', item: memory })}
                                                            aria-label={`查看${memory.title}的凝结认知`}
                                                            className="block w-full overflow-hidden rounded-[9px] border border-white/[0.045] bg-black/12 px-2.5 py-2 text-left transition-all active:scale-[0.99] hover:border-[#e5d08f]/18 hover:bg-white/[0.045]"
                                                        >
                                                            <div className="flex min-w-0 items-center justify-between gap-2">
                                                                <p className="min-w-0 truncate text-[10px] font-semibold text-[#FFFBF7]/76">{memory.title}</p>
                                                                <span className="shrink-0 text-[9px] text-[#fff1bd]/54">
                                                                    {memory.sourceMemoryIds.length ? `${memory.sourceMemoryIds.length} 段` : 'L1'}
                                                                </span>
                                                            </div>
                                                            <p className="mt-1 line-clamp-2 max-w-full break-words text-[10px] leading-relaxed text-white/42">{memory.content}</p>
                                                            {memory.emotionalJourney && (
                                                                <p className="mt-1 line-clamp-1 max-w-full break-words text-[9px] leading-relaxed text-[#e5d08f]/46">{memory.emotionalJourney}</p>
                                                            )}
                                                        </button>
                                                    ))
                                                ) : (
                                                    <p className="rounded-[9px] border border-white/[0.045] bg-black/12 px-2.5 py-2 text-[10px] leading-relaxed text-white/38">
                                                        暂时还没有可展示的凝结认知。完成“回忆结晶”后，这里会出现由多段回忆沉淀出的印象。
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {isConnected && (
                                        <button
                                            type="button"
                                            onClick={() => { haptic.light(); fetchGraphInsights(); }}
                                            disabled={graphInsightsLoading}
                                            className="w-full rounded-full border border-[#e5d08f]/18 bg-[#FFFBF7]/[0.92] px-3 py-2 text-[10px] font-bold text-[#17151B] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/34"
                                        >
                                            {graphInsightsLoading ? '正在读取...' : '刷新心意图谱'}
                                        </button>
                                    )}
                                </div>
                            </section>

                            <section className="relative overflow-hidden rounded-[14px] border border-[#d4af37]/18 bg-[#151319] p-4 shadow-[0_16px_34px_rgba(0,0,0,0.36),0_1px_0_rgba(255,255,255,0.07)_inset]">
                                <div className="absolute inset-px rounded-[13px] border border-white/[0.035] pointer-events-none" />
                                <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[#fff1bd]/34 to-transparent" />
                                <div className="absolute -right-10 -top-14 h-28 w-32 rotate-[-14deg] bg-gradient-to-r from-transparent via-[#e5d08f]/[0.055] to-transparent blur-[1px]" />
                                <div className="relative space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="inline-flex items-center gap-1.5 text-[10px] text-[#e5d08f]/88 tracking-[0.2em] font-semibold">
                                                <span className="h-1.5 w-1.5 rounded-full bg-[#e5d08f] shadow-[0_0_8px_rgba(229,208,143,0.52)]" />
                                                未被发现的回声
                                            </div>
                                            <p className="mt-2 text-[12px] text-[#FFFBF7]/66 leading-relaxed" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                                                {typeof currentStats?.unscannedCount === 'number' && currentStats.unscannedCount > 0 ? (
                                                    <>还有 <span className="text-[#fff1bd] font-bold">{currentStats.unscannedCount}</span> 段回忆，等着被重新串回时间线。</>
                                                ) : currentStats ? (
                                                    <>暂时没有遗漏的回声，关系线索已经安静归位。</>
                                                ) : (
                                                    <>回忆索引还在回温，散落的线索会慢慢浮上来。</>
                                                )}
                                            </p>
                                        </div>
                                        <div className="shrink-0 rounded-[10px] border border-[#e5d08f]/16 bg-[#0d0c11]/28 px-2.5 py-2 text-right shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]">
                                            <div className="text-[9px] text-white/28 tracking-[0.16em]">WAITING</div>
                                            <div className="mt-1 text-[18px] leading-none font-bold text-[#fff1bd]" style={{ fontFamily: "Georgia, serif" }}>
                                                {currentStats?.unscannedCount ?? '--'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { label: '回声', value: currentStats?.unscannedCount ?? '--' },
                                            { label: '节点', value: allStats?.graph?.nodes ?? '--' },
                                            { label: '连线', value: allStats?.graph?.edges ?? '--' },
                                        ].map(item => (
                                            <div key={item.label} className="min-w-0 rounded-[10px] border border-white/[0.055] bg-white/[0.035] px-2 py-2">
                                                <div className="truncate text-[8px] text-white/28 tracking-[0.18em] font-semibold">{item.label}</div>
                                                <div className="mt-1 truncate text-[13px] text-[#FFFBF7]/82 font-semibold" style={{ fontFamily: "Georgia, serif" }}>{item.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                )}

                {/* ── BROWSER TAB ── */}
                {activeTab === 'browser' && (
                    <MemoryBrowser
                        characters={characters}
                        selectedCharId={selectedCharId}
                        onSelectedCharIdChange={setSelectedCharId}
                        userName={userProfile.name}
                        addToast={addToast}
                        onOpenSourceInChat={handleOpenSourceInChat}
                        onUpdateVectorMemory={handleUpdateBrowserVectorMemory}
                    />
                )}

                {/* ── WORKSHOP TAB ── */}
                {activeTab === 'workshop' && (
                    <div className="flex-1 overflow-y-auto no-scrollbar relative" style={{ background: 'radial-gradient(circle at 50% -20%, rgba(255,255,255,0.08) 0%, transparent 34%), linear-gradient(175deg, #0C0B0F 0%, #111015 48%, #0D0C11 100%)' }}>
                        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
                            <img src="/images/collage/flower-cosmos.png" alt="" className="absolute top-[16%] -left-10 w-48 opacity-[0.1]" style={{ filter: 'invert(1) brightness(1.5)', transform: 'rotate(-25deg)' }} />
                            <img src="/images/collage/clock-airmail.png" alt="" className="absolute top-8 right-1 w-28 opacity-[0.14]" style={{ filter: 'invert(1) brightness(1.6)', transform: 'rotate(8deg)' }} />
                        </div>
                        <div className="relative z-10 px-5 pt-16 pb-20">
                            <div className="text-center mb-2 relative">
                                <h2 className="text-[34px] font-bold text-white/90 tracking-[0.34em] leading-none mb-1" style={{ fontFamily: "'Noto Serif SC', serif" }}>拾 念</h2>
                                <p className="text-[10px] text-white/28 mt-3 tracking-[0.16em] italic leading-relaxed" style={{ fontFamily: "'Noto Serif SC', serif" }}>没说出口的心动，也会被他悄悄珍藏</p>
                            </div>
                            <div className="overflow-x-auto no-scrollbar mt-6 mb-10 -mx-5 px-5">
                                <div className="flex w-max min-w-full justify-center gap-2">
                                    {characters.map(c => (
                                        <button key={c.id} onClick={() => { setSelectedCharId(c.id); haptic.light(); }}
                                            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-medium transition-all ${selectedCharId === c.id ? 'bg-white/90 text-[#1E1E20] shadow-[0_4px_20px_rgba(255,255,255,0.12)]' : 'bg-white/[0.04] text-white/35 border border-white/[0.06] hover:bg-white/[0.08]'}`}>
                                            <img src={c.avatar} alt={c.name} className="w-4 h-4 rounded-full object-cover" />
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="relative space-y-[14px]">
                                <span className="absolute -top-5 right-2 text-[7px] text-white/[0.1] italic tracking-[0.15em] select-none pointer-events-none" style={{ fontFamily: "Georgia, serif" }}>Good night</span>
                                <div className="relative transition-transform duration-300 hover:-translate-y-0.5">
                                    <span className="absolute -top-5 -left-1 text-[46px] font-extralight text-white/[0.06] select-none pointer-events-none z-0" style={{ fontFamily: "'Ma Shan Zheng', serif", letterSpacing: '0.05em' }}>01</span>
                                    <div className="bg-[#FFFBF7]/[0.96] backdrop-blur-xl rounded-[14px] border border-white/30 overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.38),0_1px_0_rgba(255,255,255,0.45)_inset] relative z-10">
                                        <div className="absolute top-4 bottom-4 left-[38%] border-l border-[#D9CDC0]/80" />
                                        <div className="flex items-stretch gap-0 p-0 min-h-[140px]">
                                            <div className="w-[38%] shrink-0 overflow-hidden"><img src="/images/workshop-birds.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.88) contrast(1.08)' }} /></div>
                                            <div className="flex-1 flex flex-col justify-between p-4 min-w-0">
                                                <div><h4 className="text-[13px] font-bold text-[#1E1C22] tracking-wide mb-1.5" style={{ fontFamily: "'Noto Serif SC', serif" }}>时光编织</h4><p className="text-[10px] text-[#6B6675] leading-[1.7]">把每一次相遇串成时间轴上的珠子，让前因后果自然相连。</p></div>
                                                <div className="flex justify-end mt-2"><button onClick={() => { setShowConfirm('temporal'); haptic.light(); }} disabled={backfilling || !selectedCharId} className="px-4 py-1.5 rounded-full text-[10px] font-semibold text-white bg-[#2A2830] hover:bg-[#1E1C22] active:scale-[0.97] transition-all disabled:opacity-40">{backfilling ? '编织中…' : '纺线 →'}</button></div>
                                            </div>
                                        </div>
                                        {backfillResult && !backfilling && (<div className="mx-5 mb-5 pt-4 border-t border-[#EEEDF0]"><ResultCard title="编织报告" isDryRun={false} stats={[{value:backfillResult.totals?.memories??0,label:'跨越片段'},{value:backfillResult.totals?.linksCreated??0,label:'丝线成型'},{value:backfillResult.totals?.edgesCreated??0,label:'因果落定'}]} items={[]} note={undefined} /></div>)}
                                    </div>
                                </div>
                                <div className="relative transition-transform duration-300 hover:-translate-y-0.5">
                                    <span className="absolute -top-5 -left-1 text-[46px] font-extralight text-white/[0.06] select-none pointer-events-none z-0" style={{ fontFamily: "'Ma Shan Zheng', serif", letterSpacing: '0.05em' }}>02</span>
                                    <div className="bg-[#FFFBF7]/[0.96] backdrop-blur-xl rounded-[14px] border border-white/30 overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.38),0_1px_0_rgba(255,255,255,0.45)_inset] relative z-10">
                                        <div className="absolute top-4 bottom-4 left-[38%] border-l border-[#D9CDC0]/80" />
                                        <div className="flex items-stretch gap-0 p-0 min-h-[140px]">
                                            <div className="w-[38%] shrink-0 overflow-hidden"><img src="/images/workshop-window.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.88) contrast(1.08)' }} /></div>
                                            <div className="flex-1 flex flex-col justify-between p-4 min-w-0">
                                                <div><h4 className="text-[13px] font-bold text-[#1E1C22] tracking-wide mb-1.5" style={{ fontFamily: "'Noto Serif SC', serif" }}>心意提取</h4><p className="text-[10px] text-[#6B6675] leading-[1.7]">捕捉话语间微妙的情感共振，找到那些不曾说出口的默契。</p></div>
                                                <div className="flex justify-end gap-1.5 mt-2 flex-wrap">
                                                    {queueStatus?.running && queueStatus.canAbort && !queueStatus.aborted && (<button onClick={handleAbortSemantic} className="px-3 py-1.5 rounded-full text-[10px] font-medium text-[#C48070] border border-[#E0DDE4] hover:bg-[#F5F4F6] transition-all">暂停</button>)}
                                                    <button onClick={() => { setShowConfirm('semanticRebuild'); haptic.light(); }} disabled={semanticRebuilding || !selectedCharId} className="px-3 py-1.5 rounded-full text-[10px] font-medium text-[#6B6675] border border-[#E0DDE4] hover:bg-[#F5F4F6] active:scale-[0.97] transition-all disabled:opacity-40">全部重来</button>
                                                    <button onClick={() => { setShowConfirm('semantic'); haptic.light(); }} disabled={semanticRunning || !selectedCharId} className="px-4 py-1.5 rounded-full text-[10px] font-semibold text-white bg-[#2A2830] hover:bg-[#1E1C22] active:scale-[0.97] transition-all disabled:opacity-40">{semanticRunning && !semanticRebuilding ? '感应中…' : '执行 →'}</button>
                                                </div></div></div></div></div>
                                <div className="relative transition-transform duration-300 hover:-translate-y-0.5">
                                    <span className="absolute -top-5 -left-1 text-[46px] font-extralight text-white/[0.06] select-none pointer-events-none z-0" style={{ fontFamily: "'Ma Shan Zheng', serif", letterSpacing: '0.05em' }}>03</span>
                                    <div className="bg-[#FFFBF7]/[0.96] backdrop-blur-xl rounded-[14px] border border-white/30 overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.38),0_1px_0_rgba(255,255,255,0.45)_inset] relative z-10">
                                        <div className="absolute top-4 bottom-4 left-[38%] border-l border-[#D9CDC0]/80" />
                                        <div className="flex items-stretch gap-0 p-0 min-h-[140px]">
                                            <div className="w-[38%] shrink-0 overflow-hidden"><img src="/images/workshop-papers.jpg" alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.88) contrast(1.08)' }} /></div>
                                            <div className="flex-1 flex flex-col justify-between p-4 min-w-0">
                                                <div><h4 className="text-[13px] font-bold text-[#1E1C22] tracking-wide mb-1.5" style={{ fontFamily: "'Noto Serif SC', serif" }}>回忆结晶</h4><p className="text-[10px] text-[#6B6675] leading-[1.7]">将零碎的日常沉淀成一枚枚恒久的印象，像琥珀封住光阴。</p></div>
                                                <div className="flex justify-end gap-1.5 mt-2">
                                                    <button onClick={() => { setShowConfirm('distillRebuild'); haptic.light(); }} disabled={distillRebuilding || !selectedCharId} className="px-3 py-1.5 rounded-full text-[10px] font-medium text-[#6B6675] border border-[#E0DDE4] hover:bg-[#F5F4F6] active:scale-[0.97] transition-all disabled:opacity-40">打破重聚</button>
                                                    <button onClick={() => { setShowConfirm('distill'); haptic.light(); }} disabled={distilling || !selectedCharId} className="px-4 py-1.5 rounded-full text-[10px] font-semibold text-white bg-[#2A2830] hover:bg-[#1E1C22] active:scale-[0.97] transition-all disabled:opacity-40">{distilling ? '结晶中…' : '萃取印象 →'}</button>
                                                </div></div></div>
                                        {distillResult && !distilling && (distillResult.l1Created > 0 || distillResult.l1Merged > 0) && (<div className="mx-5 mb-5 pt-4 border-t border-[#EEEDF0]"><ResultCard title="结晶报告" isDryRun={false} stats={[{value:distillResult.l1Created,label:'L1 新建'},{value:distillResult.l1Merged,label:'合并'},{value:distillResult.l0Linked,label:'L0 关联'}]} items={[]} note={undefined} /></div>)}
                                    </div>
                                </div>
                                {queueStatus && (<div className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.06] text-white/90 rounded-2xl p-5 overflow-hidden mt-4" style={{ transform: 'rotate(0.3deg)' }}>
                                    <div className="flex justify-between items-center mb-3"><h4 className="text-[12px] font-semibold tracking-wider flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${queueStatus.running ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />处理进度</h4><span className="text-[9px] text-white/40 font-mono">{queueStatus.aborted ? '已暂停' : queueStatus.running ? '进行中' : '完成'}</span></div>
                                    <div className="relative h-1 bg-white/10 rounded-full overflow-hidden mb-4"><div className="absolute top-0 left-0 h-full bg-white/50 rounded-full transition-all duration-500" style={{ width: `${queueStatus.total > 0 ? ((queueStatus.done + queueStatus.errors) / queueStatus.total) * 100 : 0}%` }} /></div>
                                    <div className="flex justify-between text-[10px] text-white/50"><span>{queueStatus.done} / {queueStatus.total} 完成</span>{queueStatus.errors > 0 && <span className="text-rose-300">{queueStatus.errors} 异常</span>}{(queueStatus.totalRelations ?? 0) > 0 && <span>{queueStatus.totalRelations} 关联</span>}</div>
                                    {queueStatus.lastError && (<div className="mt-3 text-[9px] text-rose-300/80 font-mono break-words bg-white/5 p-2 rounded-lg">{queueStatus.lastError}</div>)}
                                </div>)}
                            </div>
                            <div className="mt-20 mb-4 text-center"><div className="w-10 h-px bg-white/[0.06] mx-auto mb-5" /><p className="text-[8px] text-white/[0.1] tracking-[0.3em] italic leading-loose" style={{ fontFamily: "'Noto Serif SC', serif" }}>记忆从不褪色，只是被时间温柔收藏。</p><p className="text-[7px] text-white/[0.05] tracking-[0.15em] mt-3 italic" style={{ fontFamily: "Georgia, serif" }}>Memory Engine</p></div>
                        </div></div>
                )}

                {/* ── SYNC TAB ── */}
                {activeTab === 'sync' && (
                    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#0b0a0c]">
                        <div className="mx-auto flex min-h-full max-w-[860px] flex-col justify-center px-4 pt-[calc(3.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6">
                            <div className="mb-3 flex items-center justify-between px-1">
                                <p className="text-[10px] font-semibold tracking-[0.28em] text-[#d8bd90]/58">漫游备份</p>
                                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${isConnected ? 'border-[#8bb99a]/34 bg-[#8bb99a]/12 text-[#ccefd9]' : 'border-[#d99aae]/30 bg-[#d99aae]/10 text-[#ffdce8]'}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-[#a9d9ba]' : 'bg-[#d99aae]'}`} />
                                    {isConnected ? '云端可通行' : '未连接'}
                                </span>
                            </div>

                            <section className="overflow-hidden rounded-[26px] border border-[#d2b16f]/34 bg-[#f4ead8] shadow-[0_28px_64px_rgba(0,0,0,0.46)] lg:grid lg:grid-cols-[0.92fr_1.08fr]">
                                <div className="relative min-h-[360px] overflow-hidden bg-[#152238] text-[#f6df9f]">
                                    <div className="absolute inset-5 rounded-[18px] border border-[#d7b56c]/40" />
                                    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_42%,rgba(0,0,0,0.18))]" />
                                    <img src="/images/cognitive-passport/passport-ticket-banner.png" alt="" loading="eager" decoding="async" className="absolute -bottom-10 left-1/2 w-[430px] max-w-none -translate-x-1/2 rotate-[-2deg] opacity-[0.08] mix-blend-screen" />

                                    <div className="relative z-10 flex min-h-[360px] flex-col justify-between p-8 sm:p-9">
                                        <p className="text-[10px] font-semibold tracking-[0.42em] text-[#e8cf8b]/78">MEMORY PASSPORT</p>

                                        <div className="text-center">
                                            <div className="mx-auto mb-7 flex h-20 w-20 items-center justify-center rounded-full border border-[#d7b56c]/50">
                                                <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.35} d="M12 3.75 18.25 6v5.4c0 4.08-2.68 7.55-6.25 8.85-3.57-1.3-6.25-4.77-6.25-8.85V6L12 3.75Z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.35} d="M9.2 12.2h5.6M12 9.4V15" />
                                                </svg>
                                            </div>
                                            <h2 className="text-[42px] font-bold leading-none tracking-[0.16em] text-[#ffe8a3]" style={{ fontFamily: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', serif" }}>回忆护照</h2>
                                            <p className="mx-auto mt-5 max-w-[280px] text-[12px] font-medium leading-[1.9] text-[#f2e6c6]/76" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                                                把这一份关系盖上云端印章，换个设备也能继续想起他。
                                            </p>
                                        </div>

                                        <div className="flex items-end justify-between gap-4 text-[10px] font-semibold tracking-[0.18em] text-[#e8cf8b]/62">
                                            <span>NO. {syncUserId.slice(0, 12).toUpperCase()}</span>
                                            <span>{characters.length} 位</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="relative overflow-hidden p-5 text-[#271e17] sm:p-7">
                                    <img src="/images/cognitive-passport/passport-lace-frame.png" alt="" loading="eager" decoding="async" className="pointer-events-none absolute -right-24 -bottom-24 w-[260px] opacity-[0.06]" />

                                    <div className="relative z-10">
                                        <div className="flex items-start justify-between gap-4 border-b border-[#d3b982]/45 pb-5">
                                            <div>
                                                <p className="text-[9px] font-bold tracking-[0.3em] text-[#9f7a49]/58">RELATION ENTRY</p>
                                                <h3 className="mt-2 text-[22px] font-bold tracking-[0.08em]" style={{ fontFamily: "'Noto Serif SC', serif" }}>云端通行页</h3>
                                            </div>
                                            <div className="flex h-16 w-16 shrink-0 rotate-[-8deg] items-center justify-center rounded-full border-2 border-[#b98552]/45 text-center text-[8px] font-black leading-[1.25] tracking-[0.16em] text-[#a4683d]">
                                                CLOUD<br />SEAL
                                            </div>
                                        </div>

                                        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
                                            {[
                                                { label: '持有人', value: userProfile.name || '我' },
                                                { label: '收录对象', value: `${characters.length} 位` },
                                                { label: '通行状态', value: isConnected ? '云端可通行' : '暂未连接' },
                                                { label: '同步方式', value: '手动签收' },
                                            ].map(item => (
                                                <div key={item.label} className="min-w-0 border-b border-[#d3b982]/32 pb-2">
                                                    <p className="text-[8px] font-bold tracking-[0.22em] text-[#9f7a49]/55">{item.label}</p>
                                                    <p className="mt-1 truncate text-[13px] font-bold text-[#271e17]">{item.value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-5 rounded-[16px] border border-[#d0ad70]/45 bg-[#fffaf0]/72 p-4">
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <span className="text-[9px] font-bold tracking-[0.24em] text-[#8b663e]/60">我的通行印记</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        try { navigator.clipboard.writeText(syncUserId); } catch { const t = document.createElement('textarea'); t.value = syncUserId; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
                                                        addToast('已复制', 'success'); haptic.light();
                                                    }}
                                                    className="inline-flex items-center gap-1.5 rounded-full border border-[#b98552]/30 bg-white/60 px-3 py-1.5 text-[9px] font-bold text-[#7b5632] transition-all active:scale-[0.97]"
                                                >
                                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" /></svg>
                                                    复制
                                                </button>
                                            </div>
                                            <p className="break-all font-mono text-[11px] font-bold leading-relaxed tracking-[0.08em] text-[#2c2119] select-all">{syncUserId}</p>
                                        </div>

                                        {!isConnected && (
                                            <p className="mt-4 rounded-[12px] border border-[#b46a6a]/24 bg-[#b46a6a]/10 px-3 py-2 text-[10px] font-medium leading-relaxed text-[#8c4a4a]">还没有连接到记忆服务，暂时不能签收或盖章。</p>
                                        )}

                                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                            <button
                                                type="button"
                                                disabled={syncing || !isConnected}
                                                onClick={pullSync}
                                                className="rounded-[14px] bg-[#172235] px-4 py-3 text-left text-[#ffe8a3] shadow-[0_10px_22px_rgba(23,34,53,0.22)] transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-[#d8cfbf] disabled:text-[#8d8271]"
                                            >
                                                <span className="block text-[14px] font-bold tracking-[0.12em]" style={{ fontFamily: "'Noto Serif SC', serif" }}>{syncing ? '签收中...' : '签收回忆'}</span>
                                                <span className="mt-1 block text-[10px] font-medium opacity-70">从云端唤回</span>
                                            </button>
                                            <button
                                                type="button"
                                                disabled={syncing || !isConnected || !!bindInput.trim()}
                                                onClick={pushSync}
                                                className="rounded-[14px] border border-[#172235]/16 bg-white/64 px-4 py-3 text-left text-[#271e17] transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-42"
                                            >
                                                <span className="block text-[14px] font-bold tracking-[0.12em]" style={{ fontFamily: "'Noto Serif SC', serif" }}>{syncing ? '盖章中...' : '盖章入云'}</span>
                                                <span className="mt-1 block text-[10px] font-medium opacity-60">写入云端护照</span>
                                            </button>
                                        </div>

                                        <div className="mt-5 border-t border-[#d3b982]/45 pt-4">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <p className="text-[9px] font-bold tracking-[0.26em] text-[#9f7a49]/52">OTHER PASSPORT</p>
                                                    <h4 className="mt-1 text-[15px] font-bold tracking-[0.08em]" style={{ fontFamily: "'Noto Serif SC', serif" }}>登记另一枚印记</h4>
                                                </div>
                                                {!syncCodeVisible && (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setSyncCodeVisible(true); haptic.light(); }}
                                                        className="rounded-full border border-[#b98552]/32 bg-[#fffaf0]/78 px-4 py-2 text-[11px] font-bold text-[#6f4b2d] transition-all active:scale-[0.97]"
                                                    >
                                                        登记
                                                    </button>
                                                )}
                                            </div>

                                            {syncCodeVisible && (
                                                <div className="mt-3 space-y-2">
                                                    <div className="flex min-w-0 gap-2">
                                                        <input
                                                            type="text"
                                                            value={bindInput}
                                                            onChange={e => setBindInput(e.target.value)}
                                                            placeholder="输入另一台设备上的印记 ID"
                                                            autoCapitalize="off"
                                                            spellCheck={false}
                                                            className="min-w-0 flex-1 rounded-[12px] border border-[#b98552]/30 bg-white/78 px-3 py-3 font-mono text-[11px] font-bold tracking-[0.04em] text-[#271e17] outline-none focus:border-[#8d673c]"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={!bindInput.trim()}
                                                            onClick={() => setShowConfirm('syncBind')}
                                                            className="shrink-0 rounded-[12px] bg-[#172235] px-4 py-3 text-[11px] font-bold text-[#ffe8a3] transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35"
                                                        >
                                                            登记
                                                        </button>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setBindInput(''); setSyncCodeVisible(false); haptic.light(); }}
                                                        className="text-[10px] font-medium text-[#7f684e]/70"
                                                    >
                                                        收起
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {syncResult && !syncing && (
                                            <div className="mt-5 grid grid-cols-2 gap-3 text-center">
                                                <div className="rounded-[14px] border border-[#d0ad70]/36 bg-white/44 px-3 py-3">
                                                    <p className="text-[9px] font-bold tracking-[0.18em] text-[#9f7a49]/56">本次签收</p>
                                                    <p className="mt-1 text-[24px] font-bold leading-none text-[#40694f]" style={{ fontFamily: "Georgia, serif" }}>{syncResult.pulled}</p>
                                                </div>
                                                <div className="rounded-[14px] border border-[#d0ad70]/36 bg-white/44 px-3 py-3">
                                                    <p className="text-[9px] font-bold tracking-[0.18em] text-[#9f7a49]/56">本次盖章</p>
                                                    <p className="mt-1 text-[24px] font-bold leading-none text-[#8b5e32]" style={{ fontFamily: "Georgia, serif" }}>{syncResult.pushed}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                )}
            </div>

            {graphDrawer && (
                <GraphInsightDrawer
                    selection={graphDrawer}
                    onClose={closeGraphDrawer}
                    onOpenChat={handleOpenGraphSourceInChat}
                    charNameMap={charNameMap}
                />
            )}

            {activeClaimStat && (
                <div className="fixed inset-0 z-[60]">
                    <button
                        type="button"
                        aria-label="关闭整理归属"
                        onClick={closeClaimDrawer}
                        className="absolute inset-0 bg-black/58 backdrop-blur-[2px]"
                    />
                    <div className="absolute inset-x-0 bottom-0 z-[61] mx-auto max-h-[86vh] w-full max-w-[520px] overflow-y-auto rounded-t-[22px] border border-white/[0.08] bg-[#121015]/96 px-4 pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_70px_rgba(0,0,0,0.62)]">
                        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/18" />
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-[10px] font-semibold tracking-[0.24em] text-[#e5d08f]/68">待归档回忆</p>
                                <h3 className="mt-1 text-[22px] font-semibold leading-tight text-[#fffaf0]" style={{ fontFamily: "'Noto Serif SC', serif" }}>整理归属</h3>
                            </div>
                            <button
                                type="button"
                                onClick={closeClaimDrawer}
                                className="rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-white/48 transition-colors hover:bg-white/[0.08]"
                            >
                                收起
                            </button>
                        </div>

                        <section className="mt-4 rounded-[14px] border border-[#e5d08f]/16 bg-white/[0.035] p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-semibold tracking-[0.18em] text-white/34">这组回忆</p>
                                    <p className="mt-1 text-[24px] font-semibold leading-none text-[#fff1bd]" style={{ fontFamily: "Georgia, serif" }}>{activeClaimStat.memories}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-semibold tracking-[0.18em] text-white/34">最近时间</p>
                                    <p className="mt-1 text-[13px] font-semibold text-white/66">
                                        {formatOrphanPreviewDate(activeClaimPreview?.memories?.[0]?.createdAt)}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 space-y-2">
                                {activeClaimPreview?.loading ? (
                                    <p className="rounded-[10px] border border-white/[0.045] bg-black/14 px-3 py-3 text-[11px] text-white/42">正在拾取回忆线索...</p>
                                ) : activeClaimPreview?.memories.length ? (
                                    activeClaimPreview.memories.map(memory => (
                                        <div key={memory.id || `${memory.createdAt || 0}-${getOrphanPreviewTitle(memory)}`} className="rounded-[10px] border border-white/[0.055] bg-black/14 px-3 py-2.5">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="min-w-0 truncate text-[11px] font-semibold text-white/68">{getOrphanPreviewTitle(memory)}</p>
                                                <p className="shrink-0 text-[9px] text-white/30">{formatOrphanPreviewDate(memory.createdAt)}</p>
                                            </div>
                                            <p className="mt-1.5 text-[11px] leading-relaxed text-white/42">{getOrphanPreviewSnippet(memory)}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="rounded-[10px] border border-white/[0.045] bg-black/14 px-3 py-3 text-[11px] leading-relaxed text-white/42">
                                        暂时没有取到预览，但这组云端回忆仍然可以归档到本机角色。
                                    </p>
                                )}
                            </div>
                        </section>

                        <section className="mt-4">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-[10px] font-semibold tracking-[0.22em] text-[#e5d08f]/62">选择归属角色</p>
                                <p className="text-[9px] text-white/28">{characters.length} PROFILES</p>
                            </div>
                            <div className="grid gap-2">
                                {characters.map(char => {
                                    const selected = claimTargetCharId === char.id;
                                    return (
                                        <button
                                            key={char.id}
                                            type="button"
                                            onClick={() => { setClaimTargetCharId(char.id); haptic.light(); }}
                                            className={`flex items-center justify-between gap-3 rounded-[13px] border px-3 py-2.5 text-left transition-all active:scale-[0.985] ${
                                                selected
                                                    ? 'border-[#e5d08f]/40 bg-[#fff7dc]/10 shadow-[0_10px_24px_rgba(229,208,143,0.08)]'
                                                    : 'border-white/[0.065] bg-white/[0.035] hover:bg-white/[0.06]'
                                            }`}
                                        >
                                            <span className="flex min-w-0 items-center gap-3">
                                                <img src={char.avatar} alt={char.name} className="h-8 w-8 rounded-full object-cover ring-1 ring-white/18" />
                                                <span className="min-w-0 truncate text-[13px] font-semibold text-white/72">{char.name}</span>
                                            </span>
                                            <span className={`h-4 w-4 rounded-full border ${selected ? 'border-[#fff1bd] bg-[#fff1bd]' : 'border-white/18 bg-white/[0.03]'}`} />
                                        </button>
                                    );
                                })}
                                {characters.length === 0 && (
                                    <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.035] px-3 py-4 text-[11px] text-white/42">
                                        还没有可归档的本机角色。
                                    </div>
                                )}
                            </div>
                        </section>

                        <button
                            type="button"
                            disabled={!claimTargetChar || claimingCloudCharId === activeClaimStat.charId || syncing}
                            onClick={confirmClaimDrawer}
                            className="mt-4 w-full rounded-[14px] border border-[#e5d08f]/22 bg-[#FFFBF7] px-4 py-3.5 text-[12px] font-bold text-[#17151B] shadow-[0_12px_30px_rgba(255,251,247,0.12)] transition-all active:scale-[0.985] disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-white/[0.08] disabled:text-white/30 disabled:shadow-none"
                        >
                            {claimingCloudCharId === activeClaimStat.charId
                                ? '归档中...'
                                : claimTargetChar
                                    ? `归档到${claimTargetChar.name}`
                                    : '先选择角色'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Confirm Overlay ── */}
            {showConfirm && (
                <ConfirmBar
                    type={showConfirm}
                    onConfirm={() => {
                        if (showConfirm === 'temporal') startTemporalBackfill();
                        if (showConfirm === 'semantic') startSemanticSweep();
                        if (showConfirm === 'semanticRebuild') startSemanticRebuild();
                        if (showConfirm === 'distill') startDistillation();
                        if (showConfirm === 'distillRebuild') startDistillRebuild();
                        if (showConfirm === 'rescan') { doSemanticBackfill(false, true); }
                        if (showConfirm === 'syncBind') handleBindSyncCode();
                        setShowConfirm(null);
                    }}
                    onCancel={() => setShowConfirm(null)}
                />
            )}

        </div>
    );
};

/* ─── Sub-components ─── */

const GraphInsightDrawer: React.FC<{
    selection: GraphDrawerSelection;
    onClose: () => void;
    onOpenChat: (charId: string, messageId: number) => void;
    charNameMap: (charId: string) => string;
}> = ({ selection, onClose, onOpenChat, charNameMap }) => {
    const relation = selection.kind === 'relation' ? selection.item : null;
    const memory = selection.kind === 'memory' ? selection.item : null;
    const item = relation || memory!;
    const sourceMessageId = relation
        ? firstGraphMessageId(relation.sourceMessageIds, relation.targetMessageIds)
        : firstGraphMessageId(memory?.sourceMessageIds);
    const charLabel = item.charId ? charNameMap(item.charId) : '角色待确认';
    const sourceCount = relation
        ? mergeGraphMessageIds(relation.sourceMessageIds, relation.targetMessageIds).length
        : memory?.sourceMessageIds.length || 0;

    return (
        <div className="fixed inset-0 z-[58]">
            <button
                type="button"
                aria-label="关闭心意图谱详情"
                onClick={onClose}
                className="absolute inset-0 bg-black/58 backdrop-blur-[2px]"
            />
            <div className="absolute inset-x-0 bottom-0 z-[59] mx-auto max-h-[84vh] w-full max-w-[520px] overflow-y-auto rounded-t-[24px] border border-white/[0.08] bg-[#121015]/[0.98] px-4 pb-[max(1.15rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_70px_rgba(0,0,0,0.62)]">
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/18" />
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold tracking-[0.24em] text-[#e5d08f]/68">
                            {relation ? '心意连接' : '凝结认知'}
                        </p>
                        <h3 className="mt-1 break-words text-[21px] font-semibold leading-tight text-[#fffaf0]" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                            {relation ? `${relation.sourceTitle} → ${relation.targetTitle}` : memory?.title}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-white/48 transition-colors hover:bg-white/[0.08]"
                    >
                        收起
                    </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[#e5d08f]/18 bg-[#e5d08f]/10 px-2.5 py-1 text-[9px] font-semibold text-[#fff1bd]/74">
                        {charLabel}
                    </span>
                    {relation && (
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.045] px-2.5 py-1 text-[9px] font-semibold text-white/46">
                            {relation.relationType}
                        </span>
                    )}
                    {relation && formatGraphStrength(relation.strength) && (
                        <span className="rounded-full border border-[#e5d08f]/14 bg-black/16 px-2.5 py-1 text-[9px] font-semibold text-[#fff1bd]/58">
                            {formatGraphStrength(relation.strength)}
                        </span>
                    )}
                    {memory && (
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.045] px-2.5 py-1 text-[9px] font-semibold text-white/46">
                            {memory.sourceMemoryIds.length ? `${memory.sourceMemoryIds.length} 段回忆` : 'L1'}
                        </span>
                    )}
                    {sourceCount > 0 && (
                        <span className="rounded-full border border-[#d99aae]/18 bg-[#d99aae]/10 px-2.5 py-1 text-[9px] font-semibold text-[#ffdce8]/64">
                            {sourceCount} 条聊天线索
                        </span>
                    )}
                </div>

                {relation ? (
                    <div className="mt-4 space-y-3">
                        <div className="grid gap-2">
                            <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.035] px-3 py-3">
                                <p className="text-[9px] font-semibold tracking-[0.18em] text-white/32">起点</p>
                                <p className="mt-1 break-words text-[12px] leading-relaxed text-white/72">{relation.sourceTitle}</p>
                            </div>
                            <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.035] px-3 py-3">
                                <p className="text-[9px] font-semibold tracking-[0.18em] text-white/32">回应</p>
                                <p className="mt-1 break-words text-[12px] leading-relaxed text-white/72">{relation.targetTitle}</p>
                            </div>
                        </div>
                        <section className="rounded-[14px] border border-[#e5d08f]/14 bg-[#e5d08f]/[0.055] px-3 py-3">
                            <p className="text-[9px] font-semibold tracking-[0.2em] text-[#fff1bd]/50">识别到的呼应</p>
                            <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-[1.85] text-[#fffaf0]/72" style={{ fontFamily: "'Noto Serif SC', serif" }}>{relation.summary}</p>
                        </section>
                    </div>
                ) : (
                    <div className="mt-4 space-y-3">
                        <section className="rounded-[14px] border border-[#e5d08f]/14 bg-[#e5d08f]/[0.055] px-3 py-3">
                            <p className="text-[9px] font-semibold tracking-[0.2em] text-[#fff1bd]/50">沉淀内容</p>
                            <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-[1.85] text-[#fffaf0]/72" style={{ fontFamily: "'Noto Serif SC', serif" }}>{memory?.content}</p>
                        </section>
                        {memory?.emotionalJourney && (
                            <section className="rounded-[14px] border border-[#d99aae]/18 bg-[#d99aae]/10 px-3 py-3">
                                <p className="text-[9px] font-semibold tracking-[0.2em] text-[#ffdce8]/54">情绪线索</p>
                                <p className="mt-2 whitespace-pre-wrap break-words text-[12px] italic leading-[1.85] text-[#ffe8f0]/68">{memory.emotionalJourney}</p>
                            </section>
                        )}
                    </div>
                )}

                {sourceMessageId && item.charId ? (
                    <button
                        type="button"
                        onClick={() => onOpenChat(item.charId, sourceMessageId)}
                        className="mt-4 w-full rounded-[14px] border border-[#e5d08f]/22 bg-[#FFFBF7] px-4 py-3.5 text-[12px] font-bold text-[#17151B] shadow-[0_12px_30px_rgba(255,251,247,0.12)] transition-all active:scale-[0.985]"
                    >
                        回到聊天
                    </button>
                ) : (
                    <p className="mt-4 rounded-[12px] border border-white/[0.055] bg-white/[0.035] px-3 py-3 text-[10px] leading-relaxed text-white/36">
                        这条图谱还没有可定位的聊天线索。
                    </p>
                )}
            </div>
        </div>
    );
};

const ConfirmBar: React.FC<{ type: string; onConfirm: () => void; onCancel: () => void }> = ({ type, onConfirm, onCancel }) => {
    let msg = '';
    let btn = '';
    if (type === 'temporal') { msg = '穿越时间的隧道，从头编织时光丝线？'; btn = '穿越'; }
    if (type === 'semantic') { msg = '开始感应散落的心意羁绊？'; btn = '开始感应'; }
    if (type === 'semanticRebuild') { msg = '打碎所有心意连接并重新构建全貌？'; btn = '彻底打碎并重建'; }
    if (type === 'rescan') { msg = '是否需要强制重新扫描所有回忆？'; btn = '重新扫描'; }
    if (type === 'distill') { msg = '将浮光掠影凝聚成深刻的印象？'; btn = '开始凝聚'; }
    if (type === 'distillRebuild') { msg = '将所有已有印象打碎退回，并重新凝聚？'; btn = '彻底重构印象'; }
    if (type === 'syncBind') { msg = '登记这枚印记后，之后会从它的云端回忆签收内容。继续吗？'; btn = '登记印记'; }

    return (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-50 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="backdrop-blur-2xl bg-[#111015]/90 p-4 rounded-[18px] shadow-[0_18px_44px_rgba(0,0,0,0.48)] border border-white/[0.08] max-w-sm w-full mx-auto">
                <p className="text-[12px] font-semibold text-[#F4EEE6]/80 mb-4 text-center leading-relaxed px-2" style={{ fontFamily: "'Noto Serif SC', serif" }}>{msg}</p>
                <div className="flex gap-2.5">
                    <button onClick={onCancel} className="flex-1 py-3 text-[11px] font-semibold text-white/45 bg-white/[0.05] border border-white/[0.08] rounded-[12px] hover:bg-white/[0.08] transition-colors active:scale-[0.98]">
                        稍后再说
                    </button>
                    <button onClick={onConfirm} className={`flex-1 py-3 text-[11px] font-bold rounded-[12px] shadow-sm transition-all active:scale-[0.98] ${type.includes('Rebuild') || type === 'rescan' ? 'bg-[#F1DFD8] text-[#7B3F3A] hover:bg-[#F6E7E2]' : 'bg-[#FFFBF7] text-[#1E1C22] hover:bg-white'}`}>
                        {btn}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ResultCard: React.FC<{
    title: string;
    isDryRun: boolean;
    items: { name: string; avatar: string; count: number; status: string; complete: boolean }[];
    stats: { value: number; label: string }[];
    note?: string;
}> = ({ title, isDryRun, stats, note }) => (
    <div className="pt-2">
        <div className="flex justify-between items-center mb-3">
            <h5 className="text-[11px] font-bold text-[#5C4F40] tracking-widest">{title}</h5>
            {isDryRun ? (
                <span className="text-[8px] bg-sky-50 text-sky-500 px-2.5 py-0.5 rounded-md font-bold">预览</span>
            ) : (
                <span className="text-[8px] bg-[#7EB5A0]/10 text-[#7EB5A0] px-2.5 py-0.5 rounded-md font-bold">落卷</span>
            )}
        </div>
        <div className="grid grid-cols-3 gap-2">
            {stats.map((s, idx) => (
                <div key={idx} className="bg-[#F8F3ED]/60 rounded-xl p-2.5 text-center border border-[#E8DDD4]/40">
                    <div className="text-[14px] font-mono font-bold text-[#8B7355]">{s.value}</div>
                    <div className="text-[8px] text-[#A89B8C] font-semibold mt-0.5">{s.label}</div>
                </div>
            ))}
        </div>
        {note && <div className="mt-3 text-[10px] text-rose-400 font-semibold text-center italic">{note}</div>}
    </div>
);

// inject slide-in animation
const sidebarStyle = document.createElement('style');
sidebarStyle.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;600;700&display=swap');
@font-face {
  font-family: 'Cognitive Vinyl Script';
  src: url('/fonts/pinyon-script.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@keyframes slideInLeft {
  from { transform: translateX(-100%); opacity: 0.5; }
  to { transform: translateX(0); opacity: 1; }
}
`;
if (!document.querySelector('#sidebar-anim')) {
    sidebarStyle.id = 'sidebar-anim';
    document.head.appendChild(sidebarStyle);
}

export default CognitiveNetworkApp;
