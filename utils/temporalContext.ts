/**
 * Temporal Context Builder — 时间感知上下文
 * 
 * 纯本地计算，零 API 调用。为每轮对话生成时间上下文，让 AI 感知：
 *   - 当前精确时间 + 时段
 *   - 会话持续时长（从哪一刻开始聊的）
 *   - 对话节奏（快聊/慢聊/刚回来）
 *   - 时段变迁（下午→晚上）
 *   - 待跟进事件（来自 EventExtractor 的时间绑定事件）
 */

import { Message } from '../types';
import { RealtimeContextManager } from './realtimeContext';

// ─── Types ──────────────────────────────────────────────────

export interface PendingEvent {
    id: string;
    charId: string;
    event: string;           // 事件描述，如"外卖到达"
    estimatedMinutes: number; // 预计多少分钟后发生
    confidence: 'high' | 'medium' | 'low';
    createdAt: number;        // 提取时的时间戳
    dueAt: number;            // 预计发生时间 = createdAt + estimatedMinutes * 60000
}

type ConversationRhythm = 'rapid' | 'normal' | 'slow' | 'returned';

interface SessionInfo {
    startTime: number;         // 本轮会话开始时间
    durationMinutes: number;   // 已聊了多少分钟
    startTimeOfDay: string;    // 开始时的时段（如"下午"）
}

export interface TemporalContextOptions {
    includeCurrentTime?: boolean;
    includeTimePassage?: boolean;
}

// ─── Constants ──────────────────────────────────────────────

/** 两条消息间隔超过此值（毫秒）视为新会话 */
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 分钟

/** 时段名称映射 */
const getTimeOfDay = (hour: number): string => {
    if (hour >= 5 && hour < 9) return '早晨';
    if (hour >= 9 && hour < 12) return '上午';
    if (hour >= 12 && hour < 14) return '中午';
    if (hour >= 14 && hour < 17) return '下午';
    if (hour >= 17 && hour < 19) return '傍晚';
    if (hour >= 19 && hour < 22) return '晚上';
    if (hour >= 22 && hour < 24) return '夜晚';
    return '凌晨'; // 0-5
};

// ─── Event Queue (localStorage persistence) ─────────────────

const EVENTS_STORAGE_KEY = 'temporal_pending_events';

/** 读取所有待处理事件 */
const loadAllEvents = (): PendingEvent[] => {
    try {
        const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
};

/** 保存所有事件 */
const saveAllEvents = (events: PendingEvent[]): void => {
    try {
        localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
    } catch (e) {
        console.error('⏰ [Temporal] Failed to save events:', e);
    }
};

/** 获取某角色的待处理事件 */
export const getPendingEvents = (charId: string): PendingEvent[] => {
    return loadAllEvents().filter(e => e.charId === charId);
};

/** 添加一个待处理事件 */
export const addPendingEvent = (event: PendingEvent): void => {
    const all = loadAllEvents();
    all.push(event);
    saveAllEvents(all);
    console.log(`⏰ [Temporal] Added event: "${event.event}" (due in ${event.estimatedMinutes}min, confidence=${event.confidence})`);
};

/** 清理已过期超过 30 分钟的事件 */
export const cleanupExpiredEvents = (charId: string): void => {
    const now = Date.now();
    const EXPIRY_BUFFER = 30 * 60 * 1000; // 过期后再保留 30 分钟
    const all = loadAllEvents();
    const cleaned = all.filter(e => {
        if (e.charId !== charId) return true; // 保留其他角色的事件
        return (now - e.dueAt) < EXPIRY_BUFFER; // 保留未严重过期的
    });
    if (cleaned.length !== all.length) {
        saveAllEvents(cleaned);
        console.log(`⏰ [Temporal] Cleaned ${all.length - cleaned.length} expired events for ${charId}`);
    }
};

// ─── Core: Build Temporal Context ───────────────────────────

/**
 * 构建时间感知上下文，附加到最后一条用户消息后面。
 * 
 * @param messages 当前消息列表
 * @param currentTimestamp 当前时间戳（通常是 Date.now()）
 * @param charId 角色ID（用于读取待处理事件）
 * @returns 格式化的时间感知字符串，或空字符串（如果消息太少）
 */
export const buildTemporalContext = (
    messages: Message[],
    currentTimestamp: number,
    charId: string,
    options: TemporalContextOptions = {},
): string => {
    if (messages.length < 2) return '';

    const includeCurrentTime = options.includeCurrentTime !== false;
    const includeTimePassage = options.includeTimePassage !== false;
    if (!includeCurrentTime && !includeTimePassage) return '';

    const now = new Date(currentTimestamp);
    const parts: string[] = [];

    parts.push('\n[时间感知]');

    // 1. 精确当前时间
    if (includeCurrentTime) {
        const timeCtx = RealtimeContextManager.getTimeContext();
        parts.push(`⏰ 现在 ${timeCtx.timeStr} ${timeCtx.timeOfDay}`);
    }

    // 2. 会话信息
    if (includeTimePassage) {
        const session = detectSession(messages, currentTimestamp);
        if (session) {
            const durStr = formatDuration(session.durationMinutes);
            const startTimeStr = new Date(session.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            parts.push(`📊 你们从 ${startTimeStr} 开始聊，已经${durStr}了`);

            // 时段变迁检测
            const currentTimeOfDay = getTimeOfDay(now.getHours());
            if (session.startTimeOfDay !== currentTimeOfDay) {
                parts.push(`🔄 时段变迁：从${session.startTimeOfDay}聊到了${currentTimeOfDay}`);
            }
        }

        // 3. 对话节奏
        const rhythm = analyzeRhythm(messages, currentTimestamp);
        if (rhythm) {
            const rhythmLabels: Record<ConversationRhythm, string> = {
                rapid: '你们聊得很热络，用户在快速回复',
                normal: '你们在悠闲地聊天',
                slow: '用户回复比较慢，可能在忙别的事',
                returned: '用户沉默了一会儿后刚回来',
            };
            parts.push(`💬 对话节奏：${rhythmLabels[rhythm]}`);
        }

        // 4. 最后一次消息间隔（与现有 getTimeGapHint 互补但更丰富）
        const lastGapInfo = getLastGapDescription(messages, currentTimestamp);
        if (lastGapInfo) {
            parts.push(lastGapInfo);
        }

        // 5. 待跟进事件
        cleanupExpiredEvents(charId);
        const pendingEvents = getPendingEvents(charId);
        if (pendingEvents.length > 0) {
            for (const evt of pendingEvents) {
                const minutesSinceCreated = Math.round((currentTimestamp - evt.createdAt) / 60000);
                const minutesUntilDue = Math.round((evt.dueAt - currentTimestamp) / 60000);

                if (minutesUntilDue > 5) {
                    // 还没到时间
                    parts.push(`⏳ ${minutesSinceCreated}分钟前用户提到${evt.event}（预计${evt.estimatedMinutes}分钟，还有约${minutesUntilDue}分钟）`);
                } else if (minutesUntilDue > -5) {
                    // 差不多到了
                    parts.push(`⏳ ${minutesSinceCreated}分钟前用户说的${evt.event}，现在应该差不多了`);
                } else {
                    // 已经过了
                    const overdue = Math.abs(minutesUntilDue);
                    parts.push(`⏳ ${minutesSinceCreated}分钟前用户提到的${evt.event}，已经过了预计时间${overdue}分钟了，应该完成了`);
                }
            }
        }
    }

    if (parts.length <= 1) return '';
    return parts.join('\n');
};

// ─── Helpers ────────────────────────────────────────────────

/**
 * 检测当前会话边界：从后往前扫描消息，遇到 >30min 间隔即断开。
 */
function detectSession(messages: Message[], currentTimestamp: number): SessionInfo | null {
    if (messages.length < 2) return null;

    let sessionStartIdx = messages.length - 1;

    // 从倒数第二条开始往前找
    for (let i = messages.length - 2; i >= 0; i--) {
        const gap = messages[i + 1].timestamp - messages[i].timestamp;
        if (gap > SESSION_GAP_MS) {
            sessionStartIdx = i + 1;
            break;
        }
        sessionStartIdx = i;
    }

    const startTime = messages[sessionStartIdx].timestamp;
    const durationMinutes = Math.round((currentTimestamp - startTime) / 60000);
    const startHour = new Date(startTime).getHours();

    return {
        startTime,
        durationMinutes,
        startTimeOfDay: getTimeOfDay(startHour),
    };
}

/**
 * 分析对话节奏：基于最近 5 条消息的平均间隔。
 */
function analyzeRhythm(messages: Message[], currentTimestamp: number): ConversationRhythm | null {
    // 至少需要 3 条消息才能判断节奏
    if (messages.length < 3) return null;

    const recent = messages.slice(-6); // 最近 6 条
    if (recent.length < 3) return null;

    // 计算相邻消息的间隔
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
        gaps.push(recent[i].timestamp - recent[i - 1].timestamp);
    }

    // 最后一次间隔
    const lastGap = currentTimestamp - messages[messages.length - 1].timestamp;

    // 如果最后一次间隔 > 30 分钟，用户是刚回来
    if (lastGap > SESSION_GAP_MS) return 'returned';

    // 计算平均间隔（毫秒）
    const avgGapMs = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const avgGapMin = avgGapMs / 60000;

    if (avgGapMin < 2) return 'rapid';
    if (avgGapMin < 10) return 'normal';
    return 'slow';
}

/**
 * 获取最后两条消息之间的时间差描述（增强版，考虑是否为新会话）。
 */
function getLastGapDescription(messages: Message[], _currentTimestamp: number): string | null {
    if (messages.length < 2) return null;

    const lastMsg = messages[messages.length - 1];
    const secondLastMsg = messages[messages.length - 2];

    // 检测最后两条消息之间的间隔
    const gapMs = lastMsg.timestamp - secondLastMsg.timestamp;
    const gapMinutes = Math.round(gapMs / 60000);

    if (gapMinutes < 10) return null; // 太短，不需要提示

    const gapHours = Math.round(gapMs / 3600000);
    const lastMsgHour = new Date(lastMsg.timestamp).getHours();
    const isDeepNight = lastMsgHour >= 23 || lastMsgHour < 6;

    if (gapMinutes < 60) {
        return `⏸️ 上一条消息是 ${gapMinutes} 分钟前的`;
    }
    if (gapHours < 6) {
        if (isDeepNight) {
            return `⏸️ 距离上一条消息 ${gapHours} 小时（凌晨时段）`;
        }
        return `⏸️ 用户离开了 ${gapHours} 小时后回来了`;
    }
    if (gapHours < 24) {
        return `⏸️ 用户消失了 ${gapHours} 小时，刚回来`;
    }

    const days = Math.floor(gapHours / 24);
    return `⏸️ 用户消失了 ${days} 天，刚回来（请根据你们的关系做出反应）`;
}

/**
 * 格式化分钟数为中文时长。
 */
function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} 分钟`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h} 小时`;
    return `${h} 小时 ${m} 分钟`;
}
