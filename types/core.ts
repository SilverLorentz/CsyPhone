
export enum AppID {
    Launcher = 'launcher',
    Settings = 'settings',
    Character = 'character',
    Chat = 'chat',
    GroupChat = 'group_chat',
    Gallery = 'gallery',
    Music = 'music',
    Browser = 'browser',
    ThemeMaker = 'thememaker',
    Appearance = 'appearance',
    Date = 'date',
    User = 'user',
    Journal = 'journal',
    Schedule = 'schedule',
    Room = 'room',
    CheckPhone = 'check_phone',
    StoryPhone = 'story_phone',
    Social = 'social',
    Study = 'study',
    FAQ = 'faq',
    Game = 'game',
    Worldbook = 'worldbook',
    Novel = 'novel',
    HotSearch = 'hot_search', // 外部热点 / 多平台热榜
    Bank = 'bank', // New App
    XhsStock = 'xhs_stock', // XHS image stock for publishing
    SpecialMoments = 'special_moments', // Seasonal specials and future limited-time events
    XhsFreeRoam = 'xhs_free_roam', // Character autonomous XHS activity
    Zhaixinglou = 'zhaixinglou', // 摘星楼 - Astrology & Divination
    CsyManual = 'csy_manual', // CSY二改版使用手册
    VoiceCall = 'voice_call', // 语音通话
    CognitiveNetwork = 'cognitive_network', // 记忆浏览器
    EchoRecord = 'echo_record', // 回声唱片
    StatusWorkshop = 'status_workshop', // 状态栏工坊
    HalfSugar = 'half_sugar', // 半糖主义
    Theater = 'theater', // 520 约会
    Trajectory = 'trajectory', // 人生轨迹
    Crosstime = 'crosstime', // 跨时空对话
    LoveShow = 'love_show', // 恋综
    NianNian = 'nian_nian', // 念念浮生
}

export interface SystemLog {
    id: string;
    timestamp: number;
    type: 'error' | 'network' | 'system';
    source: string;
    message: string;
    detail?: string;
}

export interface AppConfig {
    id: AppID;
    name: string;
    icon: string;
    color: string;
}

export interface DesktopDecoration {
    id: string;
    type: 'image' | 'preset';
    content: string; // data URI for image, SVG data URI or emoji for preset
    x: number;       // percentage 0-100
    y: number;       // percentage 0-100
    scale: number;   // multiplier (0.2 - 3)
    rotation: number; // degrees (-180 to 180)
    opacity: number;  // 0-1
    zIndex: number;
    flip?: boolean;
}

export interface OSTheme {
    hue: number;
    saturation: number;
    lightness: number;
    wallpaper: string;
    darkMode: boolean;
    contentColor?: string;
    launcherWidgetImage?: string; // kept for backward compat, migrated to launcherWidgets['wide']
    launcherWidgets?: Record<string, string>; // slots: 'tl' | 'tr' | 'wide'
    desktopDecorations?: DesktopDecoration[];
    customFont?: string;
    inputEffectEnabled?: boolean;
    inputEffectAsset?: string;
    inputEffectScale?: number;
    inputEffectOpacity?: number;
    inputEffectOffsetX?: number;
    inputEffectOffsetY?: number;
    inputEffectDuration?: number;
    inputEffectSpinSpeed?: number;
    hideStatusBar?: boolean;
    customIconFrame?: boolean;
}

export interface AppearancePreset {
    id: string;
    name: string;
    createdAt: number;
    theme: OSTheme;
    customIcons?: Record<string, string>;
}

export interface TranslationConfig {
    enabled: boolean;
    sourceLang: string; // e.g. '日本語' - the language messages are displayed in (选)
    targetLang: string; // e.g. '中文' - the language to translate into (译)
}

export interface VirtualTime {
    hours: number;
    minutes: number;
    day: string;
}

export interface APIConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature?: number;
    useGeminiJailbreak?: boolean;
    useDeepSeekMode?: boolean;
    disablePrefill?: boolean;
    streamChat?: boolean;
}

export interface ApiPreset {
    id: string;
    name: string;
    config: APIConfig;
}

export interface UserProfile {
    name: string;
    avatar: string;
    bio: string;
    naiAppearanceTags?: string;
    naiAppearanceNegativeTags?: string;
    photoAppearancePrompt?: string;
    // HalfSugar health fields (persisted by updateUserProfile)
    healthGender?: 'male' | 'female';
    healthHeight?: number;
    healthWeight?: number;
    healthBirthYear?: number;
    healthSetupDone?: boolean;
    healthShareBodyInfo?: boolean;
    healthActivityLevel?: 'sedentary' | 'light' | 'moderate' | 'active';
}

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}
