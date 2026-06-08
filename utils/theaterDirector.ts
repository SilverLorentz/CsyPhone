/**
 * Theater Director Engine — 导演引擎核心逻辑
 * 纯函数，无副作用，易于测试。
 * 负责：事件权重计算、保底概率、事件类型选择、时间推进。
 */

import type { CharacterProfile, EventType, Message, PityCounter, TimeSlot, TheaterLocation, DirectorEvent } from '../types';
import { isDateContextBridgeMessage } from './mainlineMemory';
import { formatMessageForContext } from './messageContext';

// ── Base Weights ──

const BASE_WEIGHTS: Record<EventType, number> = {
    ambient:   30,
    encounter: 20,
    romantic:  20,
    callback:  15,
    conflict:  10,
    surprise:   5,
};

// ── Pity Constants ──

const PITY_BASE_CHANCE = 0.10;        // 10% base probability
const PITY_INCREMENT = 0.08;          // +8% each round without event
// Medium drama: quieter than v1, but still eventually moves.
const PITY_HARD_GUARANTEE = 10;       // 100% at round 10
const PITY_COOLDOWN_ROUNDS = 3;       // 3 rounds cooldown after event

export const THEATER_AUTO_SUMMARY_SETTLE_BUFFER_COUNT = 8;

const DIRECTOR_FORBIDDEN_EVENT_LOOKBACK = 8;

const REPEAT_MOTIF_KEYWORDS = [
    '外卖员', '电动车', '撞', '撞到', '撞倒', '摔倒', '受伤', '车祸', '交通',
    '雨', '暴雨', '停电', '手机响', '电话', '迷路', '钱包', '钥匙', '陌生人',
    '服务员', '店员', '快递', '警报', '火灾', '争吵', '醉酒',
];

// ── Weight Computation ──

/**
 * Compute dynamic event weights based on context.
 * Returns adjusted weights that influence which event type gets rolled.
 */
export function computeWeights(
    location: TheaterLocation,
    timeSlot: TimeSlot,
    eventHistory: DirectorEvent[],
    is520: boolean,
): Record<EventType, number> {
    const w = { ...BASE_WEIGHTS };

    // 1. Location tag bonuses
    if (location.tags.includes('romantic')) {
        w.romantic += 10;
    }
    if (location.tags.includes('adventure')) {
        w.encounter += 10;
        w.surprise += 5;
    }
    if (location.tags.includes('quiet')) {
        w.ambient += 10;
        w.callback += 5;
    }
    if (location.tags.includes('crowded')) {
        w.encounter += 10;
    }

    // 2. Time-of-day modifiers
    switch (timeSlot) {
        case 'morning':
            w.ambient += 10;
            break;
        case 'afternoon':
            w.encounter += 5;
            w.surprise += 5;
            break;
        case 'evening':
            w.romantic += 15;
            break;
        case 'night':
            w.romantic += 20;
            w.callback += 10;
            w.conflict += 5;
            break;
    }

    // 3. 520 global romantic bonus
    if (is520) {
        w.romantic += 15;
    }

    // 4. Anti-repetition: reduce weight of last 2 event types
    const recentTypes = eventHistory.slice(-2).map(e => e.sceneType);
    for (const t of recentTypes) {
        w[t] = Math.max(5, w[t] - 15);
    }

    // 5. Visit frequency: more visits → more encounters & surprises
    if (location.visitCount >= 3) {
        w.encounter += 10;
        w.surprise += 10;
    }

    // 6. Emotional buffer: conflict → next event likely romantic or ambient
    const lastEvent = eventHistory[eventHistory.length - 1];
    if (lastEvent?.sceneType === 'conflict') {
        w.romantic += 20;
        w.ambient += 10;
        w.conflict = Math.max(2, w.conflict - 15);
    }

    return w;
}

// ── Weighted Random Selection ──

/**
 * Roll a random event type based on weighted probabilities.
 */
export function rollEventType(weights: Record<EventType, number>): EventType {
    const entries = Object.entries(weights) as [EventType, number][];
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * totalWeight;

    for (const [type, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return type;
    }

    return 'ambient'; // fallback
}

export function chooseDirectorEventType(
    weights: Record<EventType, number>,
    hasCallbackMemory: boolean,
    roll: (weights: Record<EventType, number>) => EventType = rollEventType,
): EventType {
    const firstRoll = roll(weights);
    if (firstRoll !== 'callback' || hasCallbackMemory) return firstRoll;

    const withoutCallback = { ...weights, callback: 0 };
    const fallbackRoll = roll(withoutCallback);
    return fallbackRoll === 'callback' ? 'ambient' : fallbackRoll;
}

// ── Director Context Helpers ──

function compactText(text: string, max = 220): string {
    const value = text
        .replace(/\[[a-zA-Z0-9_-]+\]\s*/g, '')
        .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return value.length > max ? `${value.slice(0, max)}…` : value;
}

function formatContinuityTimestamp(timestamp?: number): string {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '未知时间';
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return '未知时间';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isTheaterContinuityCandidate(message: Message): boolean {
    const source = String(message.metadata?.source || '');
    if (source === 'theater') return isDateContextBridgeMessage(message);
    if (message.metadata?.hiddenFromUser) return isDateContextBridgeMessage(message);
    return true;
}

function formatBridgeForTheaterContinuity(message: Message): string {
    const source = String(message.metadata?.source || '');
    const sourceLabel = source === 'theater' ? '约会剧场' : '线下见面';
    const typeLabel = message.metadata?.bridgeType === 'raw' ? '原始记录' : '总结';
    return `[${formatContinuityTimestamp(message.timestamp)}] [${sourceLabel}${typeLabel}] ${compactText(message.content || '', 520)}`;
}

/**
 * Build a compact continuity block from main chat, story-phone, Date, and synced Theater records.
 * Raw Theater messages are excluded because each Theater timeline owns its own branch.
 */
export function buildTheaterMainlineContinuityContext(
    messages: Message[],
    charName: string,
    userName: string,
    limit = 14,
): string {
    const lines = [...messages]
        .filter(isTheaterContinuityCandidate)
        .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id)
        .map(message => {
            if (isDateContextBridgeMessage(message)) return formatBridgeForTheaterContinuity(message);
            const formatted = formatMessageForContext(message, {
                surface: 'secondaryModel',
                charName,
                userName,
                includeTimestamp: true,
                includeSpeaker: true,
                compact: true,
                maxContentChars: 520,
                timestampFormatter: formatContinuityTimestamp,
            });
            return formatted ? compactText(formatted, 680) : null;
        })
        .filter((line): line is string => !!line?.trim())
        .slice(-limit);

    if (lines.length === 0) return '';

    return `
### 【入场前主线近况】
以下是同一角色在主聊天、剧情手机、见面模式或已同步约会记录里已经发生过的最近事实，用来校准约会剧场的当前关系状态。
如果旧记忆、旧世界线、旧开场与这里冲突，以这里最新记录为准；已经解决的矛盾不要当作仍在发生。
重点对齐：分手/和好、道歉、称呼变化、约定、正在执行的计划、手机线索。

${lines.join('\n')}
`;
}

export function buildTheaterDirectorRecentContext(
    messages: Message[],
    charName: string,
    userName: string,
    limit = 8,
): string {
    const lines = messages
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.type !== 'image')
        .slice(-limit)
        .map(m => {
            const speaker = m.role === 'user' ? userName : charName;
            return `${speaker}: ${compactText(m.content || '')}`;
        })
        .filter(line => line.trim().length > 0);

    return lines.join('\n');
}

export function buildTraditionalCallbackMemoryContext(char: CharacterProfile, maxItems = 8): string {
    const lines: string[] = [];
    const refinedLimit = Math.min(4, maxItems);

    if (char.refinedMemories && Object.keys(char.refinedMemories).length > 0) {
        for (const [date, summary] of Object.entries(char.refinedMemories).sort()) {
            if (!summary?.trim()) continue;
            lines.push(`- [传统记忆·${date}] ${compactText(summary, 260)}`);
            if (lines.length >= refinedLimit) break;
        }
    }

    if (lines.length < maxItems && char.activeMemoryMonths?.length && Array.isArray(char.memories)) {
        const activeMonths = new Set(char.activeMemoryMonths);
        for (const memory of char.memories) {
            let normalizedDate = memory.date.replace(/[\/年月]/g, '-').replace('日', '');
            const parts = normalizedDate.split('-');
            if (parts.length >= 2) {
                normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}`;
            }
            if (!activeMonths.has(normalizedDate)) continue;
            if (!memory.summary?.trim()) continue;
            lines.push(`- [详细回忆·${memory.date}${memory.mood ? `·${memory.mood}` : ''}] ${compactText(memory.summary, 260)}`);
            if (lines.length >= maxItems) break;
        }
    }

    return lines.join('\n');
}

export function combineCallbackMemoryContext(
    traditionalMemory: string | null | undefined,
    vectorMemory: string | null | undefined,
): string {
    const blocks: string[] = [];
    if (traditionalMemory?.trim()) {
        blocks.push(`【传统记忆】\n${traditionalMemory.trim()}`);
    }
    if (vectorMemory?.trim()) {
        blocks.push(`【向量记忆】\n${vectorMemory.trim()}`);
    }
    return blocks.join('\n\n');
}

export function hasCallbackMemory(memoryContext: string | null | undefined): boolean {
    return !!memoryContext?.trim();
}

export function buildRecentForbiddenMotifs(
    eventHistory: DirectorEvent[],
    lookback = DIRECTOR_FORBIDDEN_EVENT_LOOKBACK,
): string {
    const recentEvents = eventHistory.slice(-lookback);
    if (recentEvents.length === 0) return '';

    const motifSet = new Set<string>();
    for (const event of recentEvents) {
        const text = `${event.event || ''} ${event.atmosphere || ''} ${event.npcHint || ''}`;
        for (const keyword of REPEAT_MOTIF_KEYWORDS) {
            if (text.includes(keyword)) motifSet.add(keyword);
        }
    }

    const eventLines = recentEvents
        .map((event, index) => `${index + 1}. [${event.sceneType}] ${compactText(event.event || event.atmosphere || '', 180)}`)
        .join('\n');
    const keywordLine = motifSet.size > 0
        ? `\n\n近期已经用过的关键词：${Array.from(motifSet).join('、')}`
        : '';

    return `${eventLines}${keywordLine}`;
}

export function selectTheaterAutoSummaryTargetMessages(
    sessionMessages: Message[],
    lastAutoMsgId?: number,
    settleBufferCount = THEATER_AUTO_SUMMARY_SETTLE_BUFFER_COUNT,
): Message[] {
    const candidates = sessionMessages.filter(m =>
        (!lastAutoMsgId || m.id > lastAutoMsgId)
        && !m.metadata?.dateSummaryAutoHidden
    );
    return candidates.slice(0, Math.max(0, candidates.length - settleBufferCount));
}

export function getTheaterSummaryHiddenMsgIds(
    coveredMsgIds: number[],
    keepCount = THEATER_AUTO_SUMMARY_SETTLE_BUFFER_COUNT,
): number[] {
    return coveredMsgIds.slice(0, Math.max(0, coveredMsgIds.length - keepCount));
}

// ── Pity System ──

/**
 * Determine if an event should trigger this round.
 */
export function shouldTriggerEvent(pity: PityCounter): boolean {
    // Cooldown period: never trigger
    if (pity.cooldownRemaining > 0) return false;

    // Hard guarantee
    if (pity.roundsSinceLastEvent >= PITY_HARD_GUARANTEE) return true;

    // Calculate probability
    const probability = Math.min(1.0,
        PITY_BASE_CHANCE + PITY_INCREMENT * pity.roundsSinceLastEvent
    );

    return Math.random() < probability;
}

/**
 * Update pity counter after a round.
 * @param triggered - whether an event was triggered this round
 */
export function updatePity(pity: PityCounter, triggered: boolean): PityCounter {
    if (triggered) {
        return {
            roundsSinceLastEvent: 0,
            cooldownRemaining: PITY_COOLDOWN_ROUNDS,
            totalEventsTriggered: pity.totalEventsTriggered + 1,
        };
    }
    return {
        ...pity,
        roundsSinceLastEvent: pity.roundsSinceLastEvent + 1,
        cooldownRemaining: Math.max(0, pity.cooldownRemaining - 1),
    };
}

/**
 * Create a fresh pity counter.
 */
export function createPityCounter(): PityCounter {
    return { roundsSinceLastEvent: 0, cooldownRemaining: 0, totalEventsTriggered: 0 };
}

// ── Time Progression ──

const TIME_ORDER: TimeSlot[] = ['morning', 'afternoon', 'evening', 'night'];
const LOCATION_CHANGES_PER_ADVANCE = 2; // Every 2 location changes → advance 1 time slot

/** @deprecated 已弃用，改用 getInitialTimeSlot() 实时感知。保留仅为向后兼容。 */
export function advanceTimeSlot(current: TimeSlot, locationChangeCount: number): TimeSlot {
    const currentIdx = TIME_ORDER.indexOf(current);
    // How many advances have been earned
    const advanceSteps = Math.floor(locationChangeCount / LOCATION_CHANGES_PER_ADVANCE);
    const newIdx = Math.min(currentIdx + advanceSteps, TIME_ORDER.length - 1);
    return TIME_ORDER[newIdx];
}

/**
 * Calculate the time slot for a new session start based on real-world hour.
 */
export function getInitialTimeSlot(): TimeSlot {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

// ── 520 Detection ──

/**
 * Check if the current date falls within the 520 event window.
 * Event window: May 14 – May 21 (inclusive).
 */
export function is520EventActive(): boolean {
    const now = new Date();
    const month = now.getMonth(); // 0-indexed, May = 4
    const day = now.getDate();
    return month === 4 && day >= 14 && day <= 21;
}

// ── Session ID Generator ──

export function generateSessionId(): string {
    return `theater_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Auto Gradient for Director-Created Locations ──

/** 根据地点 tags 自动生成 CSS 渐变背景 */
const TAG_GRADIENT_MAP: Record<string, string> = {
    romantic: 'linear-gradient(135deg, #2d1b3d 0%, #5c2d6e 50%, #c44569 100%)',
    daily:    'linear-gradient(135deg, #2c3e50 0%, #4a6572 50%, #a8b6c0 100%)',
    adventure:'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #e94560 100%)',
    quiet:    'linear-gradient(135deg, #2d2d2d 0%, #4a4a4a 50%, #8b7355 100%)',
    crowded:  'linear-gradient(135deg, #e44d26 0%, #f16529 40%, #ffd700 100%)',
    outdoor:  'linear-gradient(135deg, #0c2461 0%, #1e90ff 40%, #a8d870 100%)',
    indoor:   'linear-gradient(135deg, #3d2b1f 0%, #78593a 50%, #c49b6c 100%)',
};

export function getAutoGradient(tags: string[]): string {
    for (const tag of tags) {
        if (TAG_GRADIENT_MAP[tag]) return TAG_GRADIENT_MAP[tag];
    }
    return 'linear-gradient(135deg, #1a1a2e 0%, #243B55 50%, #4a69bd 100%)';
}
