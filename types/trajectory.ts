/**
 * Trajectory Types — 人生轨迹
 * 角色人生时间线：独白演出 + 窃语交互 + 记忆回溯
 */

// ── Era ──

/** 时间节点的时代划分 */
export type TrajectoryEra = 'before_meeting' | 'after_meeting';

// ── Mood ──

/** 节点情绪基调 — 影响视觉配色 */
export type TrajectoryMood =
    | 'nostalgic'    // 怀旧
    | 'melancholy'   // 忧郁
    | 'hopeful'      // 充满希望
    | 'rebellious'   // 叛逆
    | 'peaceful'     // 平静
    | 'painful'      // 痛苦
    | 'joyful'       // 快乐
    | 'anxious'      // 焦虑
    | 'lonely';      // 孤独

/** 情绪对应的视觉配色 (HSL hue) */
export const MOOD_COLORS: Record<TrajectoryMood, { hue: number; label: string }> = {
    nostalgic:  { hue: 330, label: '怀旧' },
    melancholy: { hue: 270, label: '忧郁' },
    hopeful:    { hue: 340, label: '希望' },
    rebellious: { hue: 350, label: '叛逆' },
    peaceful:   { hue: 300, label: '平静' },
    painful:    { hue: 280, label: '痛苦' },
    joyful:     { hue: 320, label: '快乐' },
    anxious:    { hue: 260, label: '焦虑' },
    lonely:     { hue: 290, label: '孤独' },
};

// ── Whisper Record ──

/** 窃语记录 — 用户对过去的 char 说的一句话 + char 的模糊回应 */
export interface WhisperRecord {
    userWhisper: string;
    charResponse: string;
    timestamp: number;
}

// ── Timeline Node ──

/** 单个时间节点 */
export interface TrajectoryNode {
    id: string;                        // UUID
    charId: string;
    age: number;                       // 节点对应的年龄
    year?: number;                     // 对应年份（可选）
    title: string;                     // "海边的夏天"
    era: TrajectoryEra;
    mood: TrajectoryMood;
    moodVerse?: string;                // LLM 选取的真实诗句（中外皆可）
    keywords: string[];                // ["搬家", "海", "孤独"]

    // 独白内容（生成后缓存）
    monologue?: string;
    monologueGeneratedAt?: number;

    // 窃语记录
    whisperHistory?: WhisperRecord[];
    whisperSealed?: boolean;           // 时空乱流后封存，不可再窃语

    // 记忆关联（after_meeting 节点）
    memorySource?: 'vector' | 'manual';
    memoryKeywords?: string;           // 用户手动标记时填的关键词
    memoryTimeRange?: {
        start: number;
        end: number;
    };

    // 跨时空对话钩子（预留）
    personaSnapshot?: {
        systemPromptFragment: string;
        memoryContext?: string;
    };

    // 排序 & 元数据
    sortOrder: number;
    createdAt: number;
    updatedAt: number;
}

/** 整条轨迹的元数据 */
export interface TrajectoryMeta {
    charId: string;
    lastGeneratedAt: number;
    meetingPointTimestamp?: number;     // "遇到 user" 的分界点（第一条消息时间戳）
    totalNodes: number;
}
