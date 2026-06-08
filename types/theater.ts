/**
 * Theater App Types — 520 约会
 * 导演引擎驱动的沉浸式文游体验
 */

// ── Location ──

export type LocationTag =
    | 'romantic'    // 浪漫场景
    | 'daily'       // 日常场景
    | 'adventure'   // 冒险/刺激
    | 'quiet'       // 安静/私密
    | 'crowded'     // 人多/热闹
    | 'outdoor'     // 户外
    | 'indoor';     // 室内

export interface TheaterLocation {
    id: string;
    name: string;               // "街角咖啡厅"
    nameEn?: string;            // "Corner Café" — 卡片副标题
    description: string;        // 给导演的氛围提示 (100-200字)
    tags: LocationTag[];        // 事件权重偏好
    bgImage?: string;           // 卡片背景图 URL（预设用 /assets/theater/xxx.webp）
    bgGradient?: string;        // 备用 CSS 渐变
    isPreset: boolean;          // 系统预设 vs 用户自建
    visitCount: number;         // 累计访问次数（影响事件概率）
    lastVisitTime?: number;     // 上次访问时间戳
}

// ── Director Events ──

export type EventType =
    | 'ambient'     // 氛围 — 纯场景描写，不需要用户行动
    | 'encounter'   // 偶遇 — 意外发现、遇到人
    | 'romantic'    // 浪漫 — 甜蜜时刻
    | 'callback'    // 回忆杀 — 关联角色记忆
    | 'conflict'    // 冲突 — 小矛盾、误会
    | 'surprise';   // 惊喜 — 完全意想不到的转折

export interface DirectorEvent {
    sceneType: EventType;
    atmosphere: string;          // 场景氛围描写 (给主 API 的上下文)
    event: string;               // 事件核心描述
    tension: number;             // 0.0-1.0 紧张度
    npcHint?: string;            // NPC 提示（可选）
    suggestedBeats: string[];    // 建议发展方向（辅助主 API）
    timestamp?: number;          // 触发时间
    /** 导演建议的场景切换（可选，仅在导演认为该换场景时出现） */
    locationSuggestion?: LocationSuggestion;
}

// ── Location Suggestion (导演建议换场景) ──

/** 导演事件中可选的场景切换建议 */
export interface LocationSuggestion {
    /** 目标地点名称（可以是已有地点名，也可以是全新名称） */
    name: string;
    /** 英文副标题（可选） */
    nameEn?: string;
    /** 为什么要去这里（给系统用，不给用户看） */
    reason: string;
    /** 地点氛围描述（100-200字，如果是新地点则用于创建） */
    description: string;
    /** 地点标签 */
    tags: LocationTag[];
    /** 交通方式 */
    travelMethod: string;
    /** 备用 CSS 渐变（根据 tags 自动生成，不需要导演提供） */
    bgGradient?: string;
}

// ── Transition Event (转场事件) ──

/** 导演生成的转场事件（用户主动换地点 或 导演建议换地点时） */
export interface TransitionEvent {
    /** 离开当前地点的氛围 */
    departure: string;
    /** 交通方式 */
    travelMethod: string;
    /** 路上的场景描写 */
    travelScene: string;
    /** 到达时的心情/氛围 */
    arrivalMood: string;
    /** 给角色扮演者的提示 */
    suggestedBeats: string[];
}

// ── Pity System ──

export interface PityCounter {
    roundsSinceLastEvent: number;   // 上次事件后经过的对话轮数
    cooldownRemaining: number;      // 冷却期剩余轮数（触发后 2 轮内不再触发）
    totalEventsTriggered: number;   // 本次游玩总事件触发数
}

// ── Time ──

export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';

export const TIME_SLOT_LABELS: Record<TimeSlot, { zh: string; icon: string }> = {
    morning:   { zh: '早晨', icon: 'AM' },
    afternoon: { zh: '下午', icon: 'PM' },
    evening:   { zh: '傍晚', icon: 'EVE' },
    night:     { zh: '深夜', icon: 'NITE' },
};

// ── Session State (serializable) ──

export interface TheaterSessionState {
    sessionId: string;
    charId: string;
    currentLocationId: string;
    timeSlot: TimeSlot;
    locationChangeCount: number;     // 累计换地点次数
    pity: PityCounter;
    eventHistory: DirectorEvent[];   // 本次游玩所有已触发事件
    visitedLocationIds: string[];    // 本次游玩去过的地点
    is520Event: boolean;             // 是否 520 限时模式
    startedAt: number;
    lastActiveAt: number;
}

// ── Timeline / Multiverse (世界线系统) ──

/** 一条独立的世界线（平行时空） */
export interface TheaterTimeline {
    timelineId: string;              // UUID, 同时作为消息 metadata.branchId
    charId: string;
    label: string;                   // "咖啡厅·温柔线" — 用户可编辑
    createdAt: number;
    lastActiveAt: number;

    /** 分叉源 — null 表示这是初始主线 */
    parentTimelineId: string | null;
    /** 从父世界线的哪条消息之后开始分叉 (fork point) — null 表示根 */
    forkAfterMessageId: number | null;

    /** 该世界线的 session 状态 (pity/events/location 等) */
    session: TheaterSessionState;

    /** 显示信息 */
    locationName: string;            // 最后所在地点名
    messageCount: number;            // 该世界线独有的消息数
    preview: string;                 // 最后一条 AI 消息的前 50 字
}

