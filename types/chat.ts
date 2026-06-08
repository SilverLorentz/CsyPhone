
export interface MemoryFragment {
    id: string;
    date: string;
    summary: string;
    mood?: string;
}

export interface SpriteConfig {
    scale: number;
    x: number;
    y: number;
}

export interface SkinSet {
    id: string;
    name: string;
    sprites: Record<string, string>; // emotion -> image URL or base64
}

export interface UserImpression {
    version: number;
    lastUpdated?: number;
    value_map: {
        likes: string[];
        dislikes: string[];
        core_values: string;
    };
    behavior_profile: {
        tone_style: string;
        emotion_summary: string;
        response_patterns: string;
    };
    emotion_schema: {
        triggers: {
            positive: string[];
            negative: string[];
        };
        comfort_zone: string;
        stress_signals: string[];
    };
    personality_core: {
        observed_traits: string[];
        interaction_style: string;
        summary: string;
    };
    mbti_analysis?: {
        type: string;
        reasoning: string;
        dimensions: {
            e_i: number;
            s_n: number;
            t_f: number;
            j_p: number;
        }
    };
    observed_changes?: string[];
}

export interface BubbleStyle {
    textColor: string;
    backgroundColor: string;
    backgroundImage?: string;
    backgroundImageOpacity?: number;
    borderRadius: number;
    opacity: number;
    hideTail?: boolean;

    // Gradient (takes priority over backgroundColor when present)
    gradient?: { from: string; to: string; direction: number };

    // Border
    borderWidth?: number;   // px, default 0
    borderColor?: string;   // default 'transparent'

    // Box Shadow
    boxShadow?: string;     // full CSS box-shadow value

    // Font
    fontSize?: number;      // px, default 15
    textShadow?: string;    // CSS text-shadow value

    decoration?: string;
    decorationX?: number;
    decorationY?: number;
    decorationScale?: number;
    decorationRotate?: number;

    avatarDecoration?: string;
    avatarDecorationX?: number;
    avatarDecorationY?: number;
    avatarDecorationScale?: number;
    avatarDecorationRotate?: number;
}

export interface ChatTheme {
    id: string;
    name: string;
    type: 'preset' | 'custom';
    baseThemeId?: string; // Inherited preset theme ID for CSS class (header/input/card styling)
    user: BubbleStyle;
    ai: BubbleStyle;
    customCss?: string;
    /** Theme-level: force-enable timestamp separators (e.g. WeChat). undefined/false = off */
    showTimestamp?: boolean;
    /** Minimum ms gap between messages to show a timestamp separator (default 180000 = 3min) */
    timestampIntervalMs?: number;
}

export type MessageType = 'text' | 'image' | 'emoji' | 'interaction' | 'transfer' | 'system' | 'social_card' | 'chat_forward' | 'xhs_card' | 'canva_card' | 'score_card' | 'music_card' | 'mcd_card' | 'html_card' | 'news_card' | 'moments' | 'voice' | 'call_log' | 'soul_reflection';

export interface Message {
    id: number;
    charId: string;
    ownerUserId?: string;
    groupId?: string;
    role: 'user' | 'assistant' | 'system';
    type: MessageType;
    content: string;
    timestamp: number;
    metadata?: any;
    replyTo?: {
        id: number;
        content: string;
        name: string;
        type?: MessageType;
        thumbnailUrl?: string;
        imageUrl?: string;
        visualSummary?: string;
    };
}

export interface EmojiCategory {
    id: string;
    name: string;
    isSystem?: boolean;
    allowedCharacterIds?: string[]; // If set, only these characters can see this category
}

export interface Emoji {
    name: string;
    url: string;
    categoryId?: string;
}

export interface HormoneSnapshot {
    dopamine: number;
    serotonin: number;
    cortisol: number;
    oxytocin: number;
    norepinephrine: number;
    endorphin: number;
    energy: number;
}

export type MemorySyncState = 'local_only' | 'pending_sync' | 'synced' | 'backend_generated';

export interface VectorMemory {
    id: string;                    // "vmem-{timestamp}-{random}"
    charId: string;
    title: string;                 // 3-6 char topic label
    content: string;               // Memory content text
    emotionalJourney?: string;     // Emotional context
    importance: number;            // 1-10 significance score
    mentionCount: number;          // Times retrieved in conversation
    lastMentioned: number;         // Timestamp (ms) of last retrieval
    createdAt: number;             // Timestamp (ms) of creation
    updatedAt?: number;            // Timestamp (ms) of last update
    vector: number[];              // Embedding vector (dim depends on model, bge-m3=1024, cohere embed-v4=1536)
    modelId?: string;              // Embedding model used (e.g. "BAAI/bge-m3")
    source: 'auto' | 'manual' | 'import' | 'sync' | 'call' | 'distillation' | 'musing'; // How it was created
    sourceMessageIds?: number[];           // IDs of messages that produced/updated this memory
    layer?: 'fact' | 'event' | 'scene';     // L0 extraction layer
    kind?: 'observed' | 'inference';        // Whether the content was directly observed or inferred
    expiresAt?: string | number | null;     // Optional expiry for time-limited facts/events
    cloudSynced?: boolean;                 // Whether this memory has been pushed to cloud successfully
    syncState?: MemorySyncState;           // Local/cloud sync state for cache + offline fallback
    deprecated?: boolean;              // Marked as outdated by LLM (info was corrected/superseded)
    deprecatedReason?: string;         // Why it was invalidated (e.g. "用户已声明不再喝奶茶")
    hormoneSnapshot?: HormoneSnapshot; // 情感基因：记忆产生时的 7 维激素状态快照
    salienceScore?: number;            // 情绪冲量 (0 ~ 7)：归一化偏离基线总和，越高越"刻骨铭心"
    level?: number;                    // 记忆层级：0=原始提取，1=蒸馏认知（L1）
    distilledInto?: string;            // L0 被蒸馏进了哪条 L1 记忆
    sourceMemoryIds?: string[];        // L1 记忆由哪些 L0 记忆聚合而来
}
