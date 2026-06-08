
import { MemoryFragment,SpriteConfig,SkinSet,UserImpression } from './chat';
import { RoomItem,RoomGeneratedState } from './room';
import { ChatTheme } from './chat';
import { StatusBarMode,CustomStatusTemplate,StatusCardData } from './statusCard';

// --- DATE APP TYPES ---
export interface DialogueItem {
    text: string;
    emotion?: string;
    /** Translated text (populated when translation is enabled) */
    translationText?: string;
}

export interface DateState {
    dialogueQueue: DialogueItem[];
    dialogueBatch: DialogueItem[];
    currentText: string;
    /** Legacy/full background value; lightweight saves prefer bgSource. */
    bgImage: string;
    /** How to resolve bgImage without duplicating large inline assets. */
    bgSource?: 'characterDateBackground' | 'inline' | 'none';
    /** Legacy/full sprite value; lightweight saves prefer currentSpriteKey. */
    currentSprite: string;
    /** Emotion/sprite key resolved from the active date skin set or default sprites. */
    currentSpriteKey?: string;
    isNovelMode: boolean;
    /** Prefer text-first rendering and defer visual assets on weak devices or recovered autosaves. */
    visualSafeMode?: boolean;
    /** Metadata for crash-resume autosaves; normal manual exits may omit it. */
    autosaveReason?: string;
    autosavedAt?: number;
    restoredFromHistory?: boolean;
    timestamp: number;
    peekStatus: string;
}

export interface DateTokenUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    source: 'peek' | 'send' | 'reroll';
    updatedAt: number;
}

export type DateRequestDebugSource = 'peek' | 'send' | 'reroll' | 'auto-summary' | 'manual-summary' | 'exit-summary';

export interface DateRequestDebugMessage {
    role: string;
    content: string;
}

export interface DateRequestDebugSnapshot {
    id: string;
    source: DateRequestDebugSource;
    label: string;
    updatedAt: number;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    messages: DateRequestDebugMessage[];
}

export interface SpecialMomentRecord {
    content: string;
    timestamp: number;
    source?: 'generated' | 'migrated';
}

export interface PhoneCustomApp {
    id: string;
    name: string;
    icon: string;
    color: string;
    prompt: string;
}

export interface PhoneDesktopAppearance {
    wallpaper?: string;
    appIcons?: Record<string, string>;
    galleryPhotos?: string[];
}

export interface StoryPhoneCustomApp {
    id: string;
    name: string;
    icon: string;
    iconImage?: string;
    color: string;
    prompt: string;
    installedAt: number;
}

export interface PhoneEvidence {
    id: string;
    type: 'chat' | 'order' | 'social' | 'delivery' | string;
    title: string;
    detail: string;
    timestamp: number;
    systemMessageId?: number;
    value?: string;
    shop?: string;  // Store/shop name (used by Taobao order cards)
    artist?: string;
    comment?: string;
    songId?: number;
    songUrl?: string;
    albumCover?: string;
    profileNickname?: string;
    profileLevel?: number;
    profileSignature?: string;
    profilePlayCount?: number;
    playlistName?: string;
    playlistCount?: number;
    playlistIndex?: number;
    songIndex?: number;
}

export interface Worldbook {
    id: string;
    title: string;
    content: string;
    category: string;
    position?: 'top' | 'after_worldview' | 'after_impression' | 'bottom';
    createdAt: number;
    updatedAt: number;
}

export interface GroupProfile {
    id: string;
    name: string;
    members: string[];
    avatar?: string;
    createdAt: number;
}

/** 内部状态层 — 仿生情绪架构 (7维神经递质模型) */
export interface InternalState {
    // ─── 核心神经递质 (0.0 ~ 1.0, 基线 0.5) ───
    dopamine: number;          // 多巴胺: 奖赏/动力/期待 (低→无聊, 高→兴奋)
    serotonin: number;         // 血清素: 情绪稳定/安全感 (低→焦虑/emo, 高→平和)
    cortisol: number;          // 皮质醇: 压力/警觉 (低→放松, 高→紧张/易怒)
    oxytocin: number;          // 催产素: 亲密/信任 (低→疏离, 高→温柔/依恋)
    norepinephrine: number;    // 去甲肾上腺素: 专注/警觉 (低→走神, 高→精神集中)
    endorphin: number;         // 内啡肽: 释然/止痛 (低→痛感强, 高→释然/轻盈)
    energy: number;            // 综合精力 (低→疲倦/敷衍, 高→活跃/话多)

    // ─── 涌现层 ───
    innerVoice: string;        // 心声: 角色此刻脑中闪过的念头
    surfaceEmotion: string;    // 外显情绪标签 (2-4字, 用于日志/debug)

    // ─── 今日轨迹轻触发 ───
    scheduleSignal?: 'none' | 'soft' | 'candidate' | 'direct';
    scheduleReason?: string;

    // ─── 情绪惯性 ───
    streaks?: Partial<Record<string, number>>;  // 各维度连续偏离轮数（可选，旧数据自动兼容）

    // ─── 元数据 ───
    roundCount: number;        // 当前状态模式已持续几轮
    updatedAt: number;         // 上次更新时间戳
}

/** @deprecated 旧格式兼容 — 迁移期保留 */
export interface MoodState {
    mood: string;
    intensity: number;
    cause: string;
    innerVoice: string;
    unresolved?: string;
    roundCount: number;
    updatedAt: number;
}

export interface CharacterProfile {
    id: string;
    /**
     * @deprecated charInstanceId is being removed. Content ownership now uses `id` directly.
     * This field is retained only for reading legacy data that was stored under chinst_ IDs.
     */
    charInstanceId?: string;
    /** Original template/preset ID used for compatibility, e.g. preset-sully-v2. */
    templateCharId?: string;
    name: string;
    gender?: 'male' | 'female';
    avatar: string;
    description: string;
    systemPrompt: string;
    softDevotionChatMode?: boolean;
    worldview?: string;
    cityOverride?: string;
    cityAdcode?: string;
    isFictionalCity?: boolean;
    cityReferenceReal?: string;
    memories: MemoryFragment[];
    refinedMemories?: Record<string, string>;
    activeMemoryMonths?: string[];

    writerPersona?: string;
    writerPersonaGeneratedAt?: number;
    ttsVoiceId?: string;
    /** ElevenLabs 语音通话专用 Voice ID；MiniMax 仍使用 ttsVoiceId */
    elevenLabsVoiceId?: string;

    mountedWorldbooks?: { id: string; title: string; content: string; category?: string; position?: 'top' | 'after_worldview' | 'after_impression' | 'bottom'; vectorized?: boolean }[];

    impression?: UserImpression;

    bubbleStyle?: string;
    chatBackground?: string;
    contextLimit?: number;
    /** 主聊天当前时间/日期/日程锚点感知。默认开启；设为 false 时关闭。 */
    chatTimeAwarenessEnabled?: boolean;
    /** 主聊天时间流逝、空窗期、时段变迁与待跟进事件感知。默认开启；设为 false 时关闭。 */
    chatTimePassageAwarenessEnabled?: boolean;
    showThinking?: boolean;
    hideSystemLogs?: boolean;
    hideBeforeMessageId?: number;
    manualPhotoEnabled?: boolean;
    autoPhotoEnabled?: boolean;
    defaultPhotoStylePresetId?: string;
    boundPhotoStylePresetIds?: string[];
    defaultVibeReferenceIds?: string[];
    naiAppearanceTags?: string;
    naiAppearanceNegativeTags?: string;
    photoAppearancePrompt?: string;

    dateBackground?: string;
    sprites?: Record<string, string>;
    spriteConfig?: SpriteConfig;
    customDateSprites?: string[]; // User-added custom emotion names for date mode (per-character)
    dateLightReading?: boolean;   // Light reading mode for novel/text view in date
    /** 线下见面/约会的当前时间与时间流逝感知。默认开启；设为 false 时关闭。 */
    dateTimeAwarenessEnabled?: boolean;
    datePerspective?: 'second' | 'first' | 'third';  // Narrative POV in date mode (default: 'second')
    dateCharPerspective?: 'first' | 'third';  // Char's narrative POV in date mode (default: 'third'). 'second' excluded when user is also 'second'
    dateSkinSets?: SkinSet[];     // Multiple skin sets for portrait mode
    activeSkinSetId?: string;     // Currently active skin set ID
    dateSummaryPrompt?: string;        // User-customized date summary prompt
    dateSummaryAutoEnabled?: boolean;  // Auto date summary toggle
    dateSummaryAutoThreshold?: number; // Message threshold for auto summaries
    dateSummaryLastAutoMsgId?: number; // Last date message id covered by auto summary
    dateSummaryAutoHideEnabled?: boolean; // Hide summarized date messages, keeping only recent context

    // Date output tuning
    dateOutputWordCount?: number;          // Target reply word count (0 or undefined = default ~150)
    dateWritingStyle?: string;             // Writing style preset key or custom prompt text
    dateTemperature?: number;              // LLM temperature for date mode (0.0-2.0, default 0.85)
    dateFontScale?: number;                // Reading font scale for date mode (0.85-1.3, default 1)

    // Theater (520) Summary System
    theaterSummaryPrompt?: string;           // User-customized theater summary prompt
    theaterSummaryAutoEnabled?: boolean;     // Auto theater summary toggle
    theaterSummaryAutoThreshold?: number;    // Message threshold for auto summaries
    theaterSummaryLastAutoMsgId?: number;    // Last theater message id covered by auto summary
    theaterSummaryAutoHideEnabled?: boolean; // Hide summarized theater messages, keeping only recent context

    savedDateState?: DateState;
    specialMomentRecords?: Record<string, SpecialMomentRecord>;

    // 小红�?per-character toggle
    xhsEnabled?: boolean;

    socialProfile?: {
        handle: string;
        bio?: string;
    };

    roomConfig?: {
        bgImage?: string;
        wallImage?: string;
        floorImage?: string;
        items: RoomItem[];
        wallScale?: number;
        wallRepeat?: boolean;
        floorScale?: number;
        floorRepeat?: boolean;
    };

    lastRoomDate?: string;
    savedRoomState?: RoomGeneratedState;

    phoneState?: {
        records?: PhoneEvidence[];
        customApps?: PhoneCustomApp[];
        desktopAppearance?: PhoneDesktopAppearance;
    };

    storyPhoneState?: {
        customApps?: StoryPhoneCustomApp[];
    };

    // Vector Memory System
    vectorMemoryEnabled?: boolean;           // Master toggle (off = original mode)
    vectorMemoryAutoExtract?: boolean;       // Auto-extract (default true)
    vectorMemoryExtractInterval?: number;    // Extract interval in messages (default 30)
    vectorMemoryLastExtractAt?: number;      // Last extracted message ID
    vectorMemoryTakeover?: boolean;          // @deprecated — use vectorMemoryMode instead
    vectorMemoryMode?: 'traditional' | 'hybrid' | 'vector';  // Three-tier mode (default: 'hybrid')

    // Internal State Layer (内部状态层 — 仿生情绪架构)
    moodState?: InternalState | MoodState;     // Current internal state (or legacy MoodState for migration)

    // Creative Status Bar (创意状态栏)
    statusBarMode?: StatusBarMode;             // Heart/status/phone mode (default: 'classic')
    customStatusTemplates?: CustomStatusTemplate[];  // User-defined templates for 'custom' mode
    activeCustomTemplateId?: string;          // 当前活跃的自定义模板 ID
    lastStatusCard?: StatusCardData;           // Last generated creative card data
}

export interface CharacterExportData extends Omit<CharacterProfile, 'id' | 'memories' | 'refinedMemories' | 'activeMemoryMonths' | 'impression' | 'hideBeforeMessageId' | 'vectorMemoryEnabled' | 'vectorMemoryAutoExtract' | 'vectorMemoryExtractInterval' | 'vectorMemoryLastExtractAt' | 'vectorMemoryTakeover' | 'vectorMemoryMode' | 'moodState'> {
    version: number;
    type: 'sully_character_card';
    embeddedTheme?: ChatTheme;
}
