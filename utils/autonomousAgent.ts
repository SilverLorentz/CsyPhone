/**
 * Autonomous Agent - frontend orchestrator for the backend-driven agent flow.
 *
 * The backend owns decision-making. The frontend only:
 *   1. Starts and stops the backend agent
 *   2. Pushes fresh context snapshots
 *   3. Receives backend-generated messages via SSE or polling
 *   4. Mirrors LifeStream fragments into the local message store
 *   5. Notifies the backend when the user replies
 *   6. Triggers open-page ticks while the app is visible, or briefly backgrounded for short Chrome sessions
 */

import { DB } from './db';
import { CharacterProfile,VectorMemory } from '../types';
import { pullMemories } from './backendClient';
import { buildCoreMemoryDigest,buildMountedWorldbooksDigest } from './agentContextSnapshot';
import { getPrimaryApiConfig as getRuntimePrimaryApiConfig,getRealtimeConfig } from './runtimeConfig';
import { buildCurrentLifeAnchorForCharacter } from './lifeAnchor';
import { shouldHideLifeStreamLikeMessage } from './lifeStreamVisibility';
import { formatMessageForContext,shouldIncludeMessageInContext } from './messageContext';
import { loadCalendarContextForCharacter, type CalendarContext } from './calendarContext';
import {
    readJsonStorage,
    safeLocalStorageGet,
    safeLocalStorageSet,
    writeJsonStorage,
} from './storage';
import {
  ackAgentMessages,
  AgentBackendMessage,
  AgentWeatherConfig,
  LifeStreamFragment,
  buildAgentSseUrl,
  fetchAgentLifeStream,
  fetchPendingAgentMessages,
  notifyAgentUserReplied,
  pushAgentContextSnapshot,
  requestAgentTick,
  startAgentOnBackend,
  stopAgentOnBackend,
} from './agentBackendClient';
import { getClientId } from './backendClient';
import type { AgentConfig } from './agentTypes';

export type { AgentConfig } from './agentTypes';

export interface SecondaryApiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

export interface LLMDecision {
    action: 'none' | 'send' | 'call' | 'think';
    topic?: string;
    reason?: string;
    content?: string;
}

type ContextSnapshot = {
    charId: string;
    charName: string;
    charSystemPrompt: string;
    charPersonality: string;
    worldview?: string;
    mountedWorldbooksDigest?: string;
    coreMemoryDigest?: string;
    cityOverride?: string;
    cityAdcode?: string;
    isFictionalCity?: boolean;
    cityReferenceReal?: string;
    userName: string;
    recentMessages: Array<{
        role: string;
        content: string;
        timestamp: number;
    }>;
    moodState: Record<string, unknown> | null;
    lastUserMsgAt: number;
    lastAIMsgAt: number;
    lastAIMsgWasAutonomous: boolean;
    emojiNames: string[];
    topMemory?: string;
    lifeContextAnchor?: ReturnType<typeof buildCurrentLifeAnchorForCharacter>;
    calendarContext?: CalendarContext;
    updatedAt: number;
};

const AGENT_CONFIG_DEFAULTS: AgentConfig = {
    enabled: true,
    minIntervalMin: 15,
    maxIntervalMin: 40,
    cooldownHours: 2,
    maxDailyActions: 5,
    maxConsecutiveIgnored: 2,
    baseProb: 0.15,
    notificationsEnabled: true,
    debugMode: false,
    debugIntervalSec: 30,
};

const AGENT_CONFIG_STORAGE_KEY = 'agent_config';
const LIFE_STREAM_VISIBILITY_STORAGE_PREFIX = 'agent_lifestream_visibility_';
const AUTONOMOUS_DEBUG_STORAGE_KEY = 'autonomous_debug';
export const LIFE_STREAM_VISIBILITY_EVENT_NAME = 'agent-lifestream-visibility-changed';
export const AGENT_MESSAGE_SAVED_EVENT_NAME = 'agent-message-saved';
export const SHORT_BACKGROUND_TICK_GRACE_MS = 5 * 60_000;

export interface AgentMessageSavedEventDetail {
    charId: string;
    contentCharId: string;
    messageId: number;
    backendMessageId: string;
    role: string;
    source: string;
    contentPreview: string;
}

interface IngestBackendAgentMessageInput {
    message: AgentBackendMessage;
    contentCharId: string;
    uiCharId?: string;
}

export interface SyncPendingAgentMessagesResult {
    received: number;
    saved: number;
    acked: number;
}

type MemorySummary = Pick<
    VectorMemory,
    'title' | 'content' | 'importance' | 'createdAt' | 'deprecated' | 'salienceScore'
>;

function clampAgentNumber(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

export function normalizeAgentConfig(value?: Partial<AgentConfig> | null): AgentConfig {
    const merged = {
        ...AGENT_CONFIG_DEFAULTS,
        ...(value || {}),
    };

    merged.minIntervalMin = clampAgentNumber(
        merged.minIntervalMin,
        3,
        60,
        AGENT_CONFIG_DEFAULTS.minIntervalMin,
    );
    merged.maxIntervalMin = Math.max(
        merged.minIntervalMin,
        clampAgentNumber(
            merged.maxIntervalMin,
            merged.minIntervalMin,
            120,
            AGENT_CONFIG_DEFAULTS.maxIntervalMin,
        ),
    );
    merged.cooldownHours = clampAgentNumber(
        merged.cooldownHours,
        0.5,
        8,
        AGENT_CONFIG_DEFAULTS.cooldownHours,
    );
    merged.maxDailyActions = Math.round(clampAgentNumber(
        merged.maxDailyActions,
        1,
        20,
        AGENT_CONFIG_DEFAULTS.maxDailyActions,
    ));
    merged.maxConsecutiveIgnored = Math.round(clampAgentNumber(
        merged.maxConsecutiveIgnored,
        1,
        10,
        AGENT_CONFIG_DEFAULTS.maxConsecutiveIgnored,
    ));
    merged.baseProb = clampAgentNumber(
        merged.baseProb,
        0.05,
        0.95,
        AGENT_CONFIG_DEFAULTS.baseProb,
    );
    merged.enabled = merged.enabled !== false;
    merged.notificationsEnabled = merged.notificationsEnabled !== false;
    merged.debugMode = merged.debugMode === true;
    merged.debugIntervalSec = Math.round(clampAgentNumber(
        merged.debugIntervalSec,
        10,
        120,
        AGENT_CONFIG_DEFAULTS.debugIntervalSec,
    ));

    return merged;
}

export function getForegroundTickIntervalMs(config: AgentConfig): number {
    if (config.debugMode) {
        return normalizeAgentConfig(config).debugIntervalSec * 1000;
    }

    return Math.min(
        5 * 60_000,
        Math.max(60_000, Math.floor((normalizeAgentConfig(config).minIntervalMin * 60_000) / 3)),
    );
}

export function getAutonomousDebugEnabled(): boolean {
    const config = getAgentConfig();
    if (typeof config.debugMode === 'boolean') return config.debugMode;
    return safeLocalStorageGet(AUTONOMOUS_DEBUG_STORAGE_KEY) === 'true';
}

export function setAutonomousDebugEnabled(enabled: boolean): void {
    safeLocalStorageSet(AUTONOMOUS_DEBUG_STORAGE_KEY, String(enabled));
    saveAgentConfig({ debugMode: enabled });
}

function parseBackendMetadata(
    metadata: AgentBackendMessage['metadata'],
): Record<string, unknown> {
    if (!metadata) return {};
    if (typeof metadata === 'string') {
        try {
            return JSON.parse(metadata) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    if (typeof metadata === 'object') {
        return metadata;
    }
    return {};
}

function getBackendMessageTargetClientId(
    message: AgentBackendMessage,
    metadata: Record<string, unknown>,
): string {
    const candidates = [
        message.targetClientId,
        message.target_client_id,
        metadata.targetClientId,
        metadata.target_client_id,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
}

function buildAgentMessagePreview(content: unknown): string {
    if (typeof content !== 'string') return '';
    return content.replace(/\s+/g, ' ').trim().slice(0, 160);
}

export async function ingestBackendAgentMessageToLocal({
    message,
    contentCharId,
    uiCharId,
}: IngestBackendAgentMessageInput): Promise<{ saved: boolean; id?: number }> {
    const now = Date.now();
    const metadata = parseBackendMetadata(message.metadata);
    const role = message.role || 'assistant';
    const source = (metadata.source as string) || 'autonomous';
    const targetClientId = getBackendMessageTargetClientId(message, metadata);

    if (source === 'weixin') {
        const currentClientId = getClientId();
        if (!targetClientId) {
            console.warn('[Agent] Rejected Weixin backend message without target client id', {
                backendMessageId: message.id,
            });
            return { saved: false };
        }
        if (targetClientId !== currentClientId) {
            console.warn('[Agent] Rejected Weixin backend message for a different client', {
                backendMessageId: message.id,
                targetClientId,
                currentClientId,
            });
            return { saved: false };
        }
    }

    const backendMessageId = String(message.id);
    const msgMeta = {
        source,
        reason: metadata.reason,
        backendMessageId,
        fromBackend: true,
        ...(targetClientId ? { targetClientId } : {}),
        ...(metadata.originalTimestamp ? { originalTimestamp: metadata.originalTimestamp } : {}),
        ...(metadata.fromWeixinId ? { fromWeixinId: metadata.fromWeixinId } : {}),
        ...(metadata.bubbleIndex !== undefined ? { bubbleIndex: metadata.bubbleIndex } : {}),
    };
    const hideAsLifeStream = shouldHideLifeStreamLikeMessage({
        role,
        type: 'text',
        content: message.content,
        metadata: msgMeta,
    });
    const savedType = hideAsLifeStream ? 'lifestream' as any : 'text';
    const savedMetadata = hideAsLifeStream
        ? { ...msgMeta, hiddenFromUser: true, lifeStreamHidden: true }
        : msgMeta;

    const saveResult = await DB.saveMessageOnceByBackendId({
        charId: contentCharId,
        role,
        type: savedType,
        content: message.content,
        timestamp: message.createdAt || message.created_at || now,
        metadata: savedMetadata,
    });

    if (!hideAsLifeStream && saveResult.saved && typeof saveResult.id === 'number' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<AgentMessageSavedEventDetail>(AGENT_MESSAGE_SAVED_EVENT_NAME, {
            detail: {
                charId: uiCharId || contentCharId,
                contentCharId,
                messageId: saveResult.id,
                backendMessageId,
                role,
                source,
                contentPreview: buildAgentMessagePreview(message.content),
            },
        }));
    }

    return {
        saved: saveResult.saved,
        id: typeof saveResult.id === 'number' ? saveResult.id : undefined,
    };
}

export async function syncPendingAgentMessagesForCharacter(charId: string): Promise<SyncPendingAgentMessagesResult> {
    const contentCharId = await DB.resolveCharacterContentId(charId);
    const messages = await fetchPendingAgentMessages(contentCharId, { includeDelivered: true });

    let saved = 0;
    for (const message of messages) {
        const result = await ingestBackendAgentMessageToLocal({
            message,
            contentCharId,
            uiCharId: charId,
        });
        if (result.saved) saved++;
    }

    await ackAgentMessages(messages.map(message => message.id));

    return {
        received: messages.length,
        saved,
        acked: messages.length,
    };
}

function pickTopMemory(memories: MemorySummary[]): MemorySummary | undefined {
    return memories
        .filter(memory => !memory.deprecated)
        .sort((a, b) => {
            const salienceDiff = (b.salienceScore || 0) - (a.salienceScore || 0);
            if (salienceDiff !== 0) return salienceDiff;

            const importanceDiff = (b.importance || 0) - (a.importance || 0);
            if (importanceDiff !== 0) return importanceDiff;

            return (b.createdAt || 0) - (a.createdAt || 0);
        })[0];
}

function formatTopMemory(memory?: MemorySummary): string | undefined {
    if (!memory) return undefined;
    return `${memory.title || 'Memory'}: ${(memory.content || '').slice(0, 80)}`;
}

async function loadTopMemorySummary(charId: string): Promise<string | undefined> {
    try {
        const cloudMemories = await pullMemories(charId);
        const topCloudMemory = pickTopMemory((cloudMemories || []) as MemorySummary[]);
        if (topCloudMemory) {
            return formatTopMemory(topCloudMemory);
        }
    } catch {
        // Fall through to the local cache/offline fallback.
    }

    try {
        const localHeaders = await DB.getVectorMemoryHeaders(charId);
        const topLocalMemory = pickTopMemory(localHeaders as MemorySummary[]);
        return formatTopMemory(topLocalMemory);
    } catch {
        return undefined;
    }
}

function getCharWeatherConfig(): AgentWeatherConfig | undefined {
    const parsed = getRealtimeConfig();
    if (!parsed.weatherEnabled && !parsed.weatherApiKey) {
        return undefined;
    }

    return {
        weatherEnabled: !!parsed.weatherEnabled,
        weatherProvider: 'qweather',
        weatherApiKey: parsed.weatherApiKey || '',
    };
}

function getPrimaryApiConfig(): SecondaryApiConfig | undefined {
    const cfg = getRuntimePrimaryApiConfig();
    if (!cfg.apiKey || !cfg.baseUrl || !cfg.model) {
        return undefined;
    }

    return {
        baseUrl: cfg.baseUrl.replace(/\/+$/, ''),
        apiKey: cfg.apiKey,
        model: cfg.model,
    };
}

export function getAgentConfig(): AgentConfig {
    const parsed = readJsonStorage<Partial<AgentConfig>>(AGENT_CONFIG_STORAGE_KEY);
    if (parsed) {
        const normalized = normalizeAgentConfig(parsed);
        if (typeof parsed.debugMode !== 'boolean' && safeLocalStorageGet(AUTONOMOUS_DEBUG_STORAGE_KEY) === 'true') {
            return normalizeAgentConfig({ ...normalized, debugMode: true });
        }
        return normalized;
    }
    return normalizeAgentConfig({
        debugMode: safeLocalStorageGet(AUTONOMOUS_DEBUG_STORAGE_KEY) === 'true',
    });
}

export function saveAgentConfig(config: Partial<AgentConfig>): void {
    const current = getAgentConfig();
    const merged = normalizeAgentConfig({ ...current, ...config });
    writeJsonStorage(AGENT_CONFIG_STORAGE_KEY, merged);
    safeLocalStorageSet(AUTONOMOUS_DEBUG_STORAGE_KEY, String(merged.debugMode));
}

export function getLifeStreamVisibleInChat(_charId: string): boolean {
    // LifeStream fragments are hidden context only; they should not surface in the chat UI.
    return false;
}

function setLifeStreamVisibleInChat(charId: string, visibleInChat: boolean): void {
    safeLocalStorageSet(
        `${LIFE_STREAM_VISIBILITY_STORAGE_PREFIX}${charId}`,
        String(visibleInChat),
    );

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(LIFE_STREAM_VISIBILITY_EVENT_NAME));
    }
}

export async function buildContextSnapshot(
    charId: string,
    char: CharacterProfile,
): Promise<ContextSnapshot> {
    const now = Date.now();
    const recentMessages = await DB.getRecentMessagesByCharId(charId, 20);

    let lastUserMsgAt = 0;
    let lastAIMsgAt = 0;
    let lastAIMsgWasAutonomous = false;

    for (let i = recentMessages.length - 1; i >= 0; i--) {
        const message = recentMessages[i];
        if (message.role === 'user' && !lastUserMsgAt) {
            lastUserMsgAt = message.timestamp;
        }
        if (message.role === 'assistant' && !lastAIMsgAt) {
            lastAIMsgAt = message.timestamp;
            lastAIMsgWasAutonomous = message.metadata?.source === 'autonomous';
        }
    }

    let userName = 'User';
    try {
        const userProfile = await DB.getUserProfile();
        if (userProfile?.name) userName = userProfile.name;
    } catch {
        // Ignore user profile lookup failure.
    }

    let emojiNames: string[] = [];
    let emojis: Array<{ name: string; url: string }> = [];
    try {
        emojis = await DB.getEmojis();
        emojiNames = emojis.map(emoji => emoji.name).slice(0, 30);
    } catch {
        // Ignore emoji lookup failure.
    }

    const moodState = (char.moodState as unknown as Record<string, unknown> | undefined) || null;
    const charSystemPrompt = char.systemPrompt || '';
    const charPersonality = char.description || '';
    const topMemory = await loadTopMemorySummary(charId);
    const worldview = char.worldview || undefined;
    const mountedWorldbooksDigest = buildMountedWorldbooksDigest(char.mountedWorldbooks);
    const coreMemoryDigest = buildCoreMemoryDigest(char, topMemory);
    const cityOverride = char.cityOverride?.trim() || undefined;
    const cityAdcode = char.cityAdcode?.trim() || undefined;
    const isFictionalCity = char.isFictionalCity || undefined;
    const cityReferenceReal = char.isFictionalCity
        ? (char.cityReferenceReal?.trim() || undefined)
        : undefined;
    const lifeContextAnchor = buildCurrentLifeAnchorForCharacter(char, recentMessages);
    const calendarContext = await loadCalendarContextForCharacter(charId);

    return {
        charId,
        charName: char.name,
        charSystemPrompt,
        charPersonality,
        worldview,
        mountedWorldbooksDigest,
        coreMemoryDigest,
        cityOverride,
        cityAdcode,
        isFictionalCity,
        cityReferenceReal,
        userName,
        recentMessages: recentMessages
            .filter(message => shouldIncludeMessageInContext(message))
            .map(message => ({
                role: message.role,
                content: (formatMessageForContext(message, {
                    surface: 'agent',
                    charName: char.name,
                    userName,
                    emojis,
                    compact: true,
                    maxContentChars: 500,
                }) || message.content).slice(0, 500),
                timestamp: message.timestamp,
            })),
        moodState,
        lastUserMsgAt,
        lastAIMsgAt,
        lastAIMsgWasAutonomous,
        emojiNames,
        topMemory,
        lifeContextAnchor,
        calendarContext,
        updatedAt: now,
    };
}

let activeInstance: BackendAgentManager | null = null;

export class BackendAgentManager {
    private contextTimer: ReturnType<typeof setInterval> | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private tickTimer: ReturnType<typeof setInterval> | null = null;
    private eventSource: EventSource | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;
    private uiCharId = '';
    private charId = '';
    private charRef: CharacterProfile | null = null;
    private sseFailCount = 0;
    private useFallbackPolling = false;
    private reconnectDelay = 1000;
    private foregroundTickInFlight = false;
    private lastContextPushAt = 0;
    private hiddenSinceAt = 0;
    private visibilityChangeHandler: (() => void) | null = null;

    start(
        charId: string,
        char: CharacterProfile,
        secondaryApi: SecondaryApiConfig,
    ): () => void {
        if (activeInstance && activeInstance !== this) {
            activeInstance.stop();
        }
        activeInstance = this;

        this.stopped = false;
        this.uiCharId = charId;
        this.charId = char.id;
        this.charRef = char;
        this.sseFailCount = 0;
        this.useFallbackPolling = false;
        this.reconnectDelay = 1000;

        const agentConfig = getAgentConfig();
        const isDebug = agentConfig.debugMode;

        (async () => {
            try {
                const contextSnapshot = await buildContextSnapshot(this.charId, char);
                const mainApiConfig = getPrimaryApiConfig();

                if (!mainApiConfig) {
                    console.warn('[Agent] No primary API config, agent will not generate messages');
                }

                await startAgentOnBackend({
                    charId: this.charId,
                    apiConfig: secondaryApi,
                    mainApiConfig,
                    weatherConfig: getCharWeatherConfig(),
                    contextSnapshot,
                    agentConfig,
                });
                this.lastContextPushAt = Date.now();

                console.log(`[Agent] Backend agent started for ${char.name}`);

                if (this.stopped) return;

                this.connectSSE();
                this.startForegroundTickLoop(agentConfig);
                this.contextTimer = setInterval(() => {
                    if (this.stopped) return;
                    this.pushContext().catch(error => {
                        if (isDebug) {
                            console.warn('[Agent] Context push error:', error.message);
                        }
                    });
                }, agentConfig.debugMode ? 60_000 : 5 * 60 * 1000);
            } catch (error: any) {
                console.warn('[Agent] Failed to start backend agent:', error.message);
            }
        })();

        return () => this.stop();
    }

    private teardownClientRuntime(): void {
        this.stopped = true;
        activeInstance = null;

        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }
        if (this.contextTimer) {
            clearInterval(this.contextTimer);
            this.contextTimer = null;
        }
        if (this.visibilityChangeHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
            this.visibilityChangeHandler = null;
        }
        this.hiddenSinceAt = 0;
    }

    private syncVisibilityStateForTicks(): void {
        if (typeof document === 'undefined') {
            this.hiddenSinceAt = 0;
            return;
        }

        this.hiddenSinceAt = document.visibilityState === 'visible' ? 0 : Date.now();
    }

    private canRunOpenPageTick(): boolean {
        if (typeof document === 'undefined') return true;
        if (document.visibilityState === 'visible') return true;

        if (!this.hiddenSinceAt) {
            this.hiddenSinceAt = Date.now();
        }

        return Date.now() - this.hiddenSinceAt <= SHORT_BACKGROUND_TICK_GRACE_MS;
    }

    private startForegroundTickLoop(config: AgentConfig): void {
        if (this.tickTimer || this.stopped) return;

        const intervalMs = getForegroundTickIntervalMs(config);
        if (config.debugMode) {
            console.log(`[Agent] Foreground tick loop started (${intervalMs}ms)`);
        }

        if (typeof document !== 'undefined' && !this.visibilityChangeHandler) {
            this.visibilityChangeHandler = () => this.syncVisibilityStateForTicks();
            this.visibilityChangeHandler();
            document.addEventListener('visibilitychange', this.visibilityChangeHandler);
        }

        this.tickTimer = setInterval(() => {
            if (this.stopped) return;
            if (!this.canRunOpenPageTick()) return;

            this.triggerForegroundTick().catch((error: any) => {
                if (getAutonomousDebugEnabled()) {
                    console.warn('[Agent] Foreground tick failed:', error.message);
                }
            });
        }, intervalMs);
    }

    private async triggerForegroundTick(): Promise<void> {
        if (!this.charId || this.foregroundTickInFlight) return;

        this.foregroundTickInFlight = true;
        try {
            const isDebug = getAutonomousDebugEnabled();
            const shouldRefreshContext = isDebug || Date.now() - this.lastContextPushAt > 2 * 60_000;
            if (shouldRefreshContext) {
                await this.pushContext();
            }

            const tick = await requestAgentTick(this.charId);
            if (isDebug) {
                const summary = tick.result?.skipped || tick.result?.action || 'none';
                console.log(`[Agent] Foreground tick result: ${summary}`);
            }
        } finally {
            this.foregroundTickInFlight = false;
        }
    }

    disconnectFrontend(): void {
        this.teardownClientRuntime();
        console.log('[Agent] Frontend runtime disconnected, backend kept alive');
    }

    stop(): void {
        const charId = this.charId;
        this.teardownClientRuntime();

        if (charId) {
            stopAgentOnBackend(charId);
        }

        console.log('[Agent] Stopped');
    }

    private async enqueueBackendMessage(
        message: AgentBackendMessage,
        _options: { delayMs?: number } = {},
    ): Promise<void> {
        // Save directly to messages store (bypass scheduled queue to avoid lost messages).
        await ingestBackendAgentMessageToLocal({
            message,
            contentCharId: this.charId,
            uiCharId: this.uiCharId || this.charId,
        });
    }

    private async acknowledgeMessages(
        ids: Array<number | string>,
    ): Promise<void> {
        if (ids.length === 0) return;

        try {
            await ackAgentMessages(ids);
        } catch (error: any) {
            if (getAutonomousDebugEnabled()) {
                console.warn('[Agent] Ack failed:', error.message);
            }
        }
    }

    private async syncLifeStreamFragments(
        fragments: LifeStreamFragment[],
    ): Promise<void> {
        if (!this.charId || fragments.length === 0) return;

        const existingMessages = await DB.getRecentMessagesByCharId(this.charId, 200);
        const existingTimestamps = new Set(
            existingMessages
                .filter(message => (message.type as string) === 'lifestream')
                .map(message => message.timestamp),
        );

        let saved = 0;
        for (const fragment of fragments) {
            if (existingTimestamps.has(fragment.created_at)) continue;

            await DB.saveMessage({
                charId: this.charId,
                role: 'assistant',
                type: 'lifestream' as any,
                content: `${fragment.time_label} · ${fragment.fragment}`,
                timestamp: fragment.created_at,
            });
            saved++;
        }

        if (saved > 0 && getAutonomousDebugEnabled()) {
            console.log(`[LifeStream] Saved ${saved} new fragment(s) as local messages`);
        }
    }

    private connectSSE(): void {
        if (this.stopped || !this.charId) return;

        const sseUrl = buildAgentSseUrl(this.charId);
        if (!sseUrl) {
            console.warn('[Agent] No backend URL, falling back to polling');
            this.startFallbackPolling();
            return;
        }

        const isDebug = getAutonomousDebugEnabled();

        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        try {
            const eventSource = new EventSource(sseUrl);
            this.eventSource = eventSource;

            eventSource.addEventListener('connected', () => {
                console.log('[Agent] SSE connected');
                this.sseFailCount = 0;
                this.reconnectDelay = 1000;

                if (this.useFallbackPolling && this.pollTimer) {
                    clearInterval(this.pollTimer);
                    this.pollTimer = null;
                    this.useFallbackPolling = false;
                    console.log('[Agent] SSE recovered, stopped fallback polling');
                }
            });

            eventSource.addEventListener('message', async (event: MessageEvent) => {
                if (this.stopped) return;

                try {
                    const message = JSON.parse(event.data) as AgentBackendMessage;
                    if (isDebug) {
                        console.log(`[Agent] SSE message: "${(message.content || '').slice(0, 40)}..."`);
                    }

                    await this.enqueueBackendMessage(message);
                    await this.acknowledgeMessages([message.id]);
                } catch (error: any) {
                    if (isDebug) {
                        console.warn('[Agent] SSE message parse error:', error.message);
                    }
                }
            });

            eventSource.addEventListener('done', () => {
                if (isDebug) {
                    console.log('[Agent] SSE session ended, reconnecting...');
                }

                eventSource.close();
                this.eventSource = null;

                if (!this.stopped) {
                    this.reconnectTimer = setTimeout(() => this.connectSSE(), 500);
                }
            });

            eventSource.onerror = () => {
                if (this.stopped) return;

                this.sseFailCount++;
                eventSource.close();
                this.eventSource = null;

                if (this.sseFailCount >= 3 && !this.useFallbackPolling) {
                    console.warn(`[Agent] SSE failed ${this.sseFailCount} times, degrading to polling`);
                    this.startFallbackPolling();
                    this.reconnectTimer = setTimeout(() => this.connectSSE(), 60000);
                    return;
                }

                const delay = Math.min(this.reconnectDelay, 30000);
                if (isDebug) {
                    console.log(`[Agent] SSE error, reconnecting in ${delay}ms (fail #${this.sseFailCount})`);
                }
                this.reconnectTimer = setTimeout(() => this.connectSSE(), delay);
                this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
            };
        } catch (error: any) {
            console.warn('[Agent] EventSource constructor failed:', error.message);
            this.startFallbackPolling();
        }
    }

    private startFallbackPolling(): void {
        if (this.pollTimer || this.stopped) return;

        this.useFallbackPolling = true;
        console.log('[Agent] Starting fallback polling (30s interval)');

        this.pollTimer = setInterval(() => {
            if (this.stopped) return;
            this.pollMessages().catch(() => {});
        }, 30000);

        this.pollMessages().catch(() => {});
    }

    async pollMessages(): Promise<void> {
        if (!this.charId) return;

        const isDebug = getAutonomousDebugEnabled();

        try {
            const messages = await fetchPendingAgentMessages(this.charId, { includeDelivered: true });
            if (messages.length === 0) return;

            if (isDebug) {
                console.log(`[Agent] Polled ${messages.length} pending message(s)`);
            }

            for (let i = 0; i < messages.length; i++) {
                await this.enqueueBackendMessage(messages[i], {
                    delayMs: i * 3000,
                });
            }

            await this.acknowledgeMessages(messages.map(message => message.id));

            console.log(`[Agent] Saved ${messages.length} backend message(s) to scheduled queue`);
        } catch (error: any) {
            if (isDebug) {
                console.warn('[Agent] Poll failed:', error.message);
            }
        }
    }

    async pushContext(nextChar?: CharacterProfile): Promise<void> {
        if (nextChar && (nextChar.id === this.uiCharId || nextChar.id === this.charId)) {
            this.charRef = nextChar;
        }
        if (!this.charId || !this.charRef) return;

        try {
            let freshChar = nextChar && (nextChar.id === this.uiCharId || nextChar.id === this.charId)
                ? nextChar
                : this.charRef;
            try {
                const allChars = await DB.getAllCharacters();
                const found = allChars.find(char =>
                    char.id === this.uiCharId || char.id === this.charId,
                );
                if (found) {
                    freshChar = found;
                    this.charRef = found;
                }
            } catch {
                // Keep using the cached character reference.
            }

            const contextSnapshot = await buildContextSnapshot(this.charId, freshChar);
            await pushAgentContextSnapshot(contextSnapshot);
            this.lastContextPushAt = Date.now();

            if (getAutonomousDebugEnabled()) {
                console.log('[Agent] Context pushed to backend');
            }

            try {
                const lifeStreamState = await fetchAgentLifeStream(this.charId);
                setLifeStreamVisibleInChat(this.charId, lifeStreamState.visibleInChat);
                await this.syncLifeStreamFragments(lifeStreamState.fragments);
            } catch (error: any) {
                if (getAutonomousDebugEnabled()) {
                    console.log(`[LifeStream] fetch/save error: ${error.message}`);
                }
            }
        } catch (error: any) {
            if (getAutonomousDebugEnabled()) {
                console.warn('[Agent] Context push failed:', error.message);
            }
        }
    }

    static async notifyUserReplied(charId: string): Promise<void> {
        try {
            await notifyAgentUserReplied(await DB.resolveCharacterContentId(charId));
        } catch {
            // Silent on purpose. User replies should not block the chat flow.
        }
    }

    static async refreshCharacterContext(charId: string, char?: CharacterProfile): Promise<void> {
        if (!charId) return;

        try {
            if (activeInstance && !activeInstance.stopped && (
                activeInstance.uiCharId === charId || activeInstance.charId === charId
            )) {
                await activeInstance.pushContext(char);
                return;
            }

            let freshChar = char && (char.id === charId) ? char : undefined;
            if (!freshChar) {
                try {
                    const allChars = await DB.getAllCharacters();
                    freshChar = allChars.find(candidate =>
                        candidate.id === charId,
                    );
                } catch {
                    // Keep the refresh best-effort; local chat must remain uninterrupted.
                }
            }
            if (!freshChar) return;

            const contentCharId = freshChar.id;
            const contextSnapshot = await buildContextSnapshot(contentCharId, freshChar);
            await pushAgentContextSnapshot(contextSnapshot);

            if (getAutonomousDebugEnabled()) {
                console.log('[Agent] Context refreshed to backend');
            }
        } catch (error: any) {
            if (getAutonomousDebugEnabled()) {
                console.warn('[Agent] Context refresh failed:', error.message);
            }
        }
    }
}
