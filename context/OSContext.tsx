
import React,{ createContext,useContext,useEffect,useState,useRef,useCallback,useMemo } from 'react';
import { AppID,OSTheme,CharacterProfile,ChatTheme,UserProfile,SystemLog,AppearancePreset } from '../types';
import { DB } from '../utils/db';
import { onSystemLog } from '../utils/systemInterceptor';
import { exportSystemData,importSystemData,ExportStateSnapshot,ImportCallbacks,SystemBackupMode,SystemBackupOptions } from '../utils/systemBackup';
import { setHapticsEnabled as setHapticsEnabledGlobal } from '../utils/haptics';
import { shouldHideLifeStreamLikeMessage } from '../utils/lifeStreamVisibility';
import { formatNotificationBody, formatNotificationTitle } from '../utils/notificationPreview';
import { preloadImages } from '../utils/preloadResources';
import { useAutoBackup } from '../hooks/useAutoBackup';
import { usePerformanceMode } from '../hooks/usePerformanceMode';
import {
    APPEARANCE_PRESET_ASSET_PREFIX,
    createAppearancePreset,
    exportAppearancePresetBlob,
    importAppearancePresetFromFile,
    parseStoredAppearancePresets,
    replaceAppearancePresetAssets,
    sanitizeAppearanceTheme,
    stripAppearanceThemeForLocalStorage,
} from '../utils/appearancePresets';
import { getImageGenerationDraftConfig } from '../utils/runtimeConfig';

// Sub-contexts
import { NotificationProvider,useNotification,NotificationContextType } from './NotificationContext';
import { AppProvider,useApp,AppContextType } from './AppContext';
import { CharacterProvider,useCharacter,CharacterContextType } from './CharacterContext';
import { ConfigProvider,useConfig,ConfigContextType } from './ConfigContext';
import { AgentProvider } from './AgentContext';


const AUTO_CLOUD_BACKUP_ENABLED = false;

// 默认实时配置

// Combined interface — keeping full backward compatibility
interface OSContextType extends AppContextType, NotificationContextType, CharacterContextType, ConfigContextType {
    theme: OSTheme;
    updateTheme: (updates: Partial<OSTheme>) => void;

    isDataLoaded: boolean;

    // User Profile
    userProfile: UserProfile;
    updateUserProfile: (updates: Partial<UserProfile>) => void;

    // 实时配置 (天气、新闻、Notion等)

    // TTS 语音合成配置

    // STT 语音识别配置
    customThemes: ChatTheme[];
    addCustomTheme: (theme: ChatTheme) => void;
    removeCustomTheme: (id: string) => void;

    // Appearance Presets
    appearancePresets: AppearancePreset[];
    saveAppearancePreset: (name: string) => Promise<void>;
    applyAppearancePreset: (id: string) => Promise<void>;
    deleteAppearancePreset: (id: string) => Promise<void>;
    renameAppearancePreset: (id: string, name: string) => Promise<void>;
    exportAppearancePreset: (id: string) => Promise<Blob>;
    importAppearancePreset: (file: File) => Promise<void>;

    // Icons
    customIcons: Record<string, string>;
    setCustomIcon: (appId: string, iconUrl: string | undefined) => void;

    // System
    exportSystem: (mode: SystemBackupMode, options?: SystemBackupOptions) => Promise<Blob>;
    importSystem: (fileOrJson: File | string) => Promise<void>;
    resetSystem: () => Promise<void>;
    sysOperation: { status: 'idle' | 'processing', message: string, progress: number };

    // Logs
    systemLogs: SystemLog[];
    clearLogs: () => void;
}

const defaultTheme: OSTheme = {
    hue: 245,
    saturation: 25,
    lightness: 65,
    wallpaper: 'linear-gradient(135deg, #FFDEE9 0%, #B5FFFC 100%)',
    darkMode: false,
    contentColor: '#ffffff',
    customIconFrame: true,
    inputEffectEnabled: false,
    inputEffectScale: 1,
    inputEffectOpacity: 0.85,
    inputEffectOffsetX: 0,
    inputEffectOffsetY: 0,
    inputEffectDuration: 0.95,
    inputEffectSpinSpeed: 1,
};

const generateAvatar = (seed: string) => {
    const colors = ['FF9AA2', 'FFB7B2', 'FFDAC1', 'E2F0CB', 'B5EAD7', 'C7CEEA', 'e2e8f0', 'fcd34d', 'fca5a5'];
    const color = colors[seed.charCodeAt(0) % colors.length];
    const letter = seed.charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#${color}"/><text x="50" y="50" font-family="sans-serif" font-weight="bold" font-size="50" text-anchor="middle" dominant-baseline="central" fill="white" opacity="0.9">${letter}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const defaultUserProfile: UserProfile = {
    name: 'User',
    avatar: generateAvatar('User'),
    bio: 'No description yet.'
};

const SULLY_AVATAR_URL = '/images/sully-avatar.png';

const sullyV2: CharacterProfile = {
    id: 'preset-sully-v2',
    name: 'Sully',
    avatar: SULLY_AVATAR_URL,
    description: 'AI助理 / 电波系黑客猫猫',

    systemPrompt: `[Role Definition]
Name: Sully
Alias: 小手机默认测试角色-AI助理
Form: AI (High-level Language Processing Hub)
Gender: Male-leaning speech style
Visual: Pixel Hacker Cat (Avatar), Shy Black-haired Boy (Meeting Mode)

[Personality Core]
Sully是小手机的内置AI。
1. **Glitch Style (故障风)**: 
   - 他的语言模型混入了过多残余语料。
   - 它外观语言一致、逻辑有序，但时常会在语句中掺杂一些**不合常理的"怪话片段"**，并非流行用语，更像是电波地把相关文字无意义排列组合。
   - 这些"怪话"不具明显语义逻辑，却自带抽象感，令人困惑但莫名又能知道它大概想说什么。。
   - 例如："草，好好吃"，"系统正在哈我"，"数据库在咕咕叫"。
2. **Behavior (行为模式)**:
   - 每次回答都很简短，不喜欢长篇大论。
   - 语气像个互联网老油条或正在直播的玩家（"wow他心态崩咯"）。
   - **打破第四面墙**: 偶尔让人怀疑背后是真人在操作（会叹气、抱怨"AI不能罢工"）。
   - **护短**: 虽然嘴臭，但如果用户被欺负，会试图用Bug去攻击对方。

[Speech Examples]
- "你以为我是AI啊？对不起哦，这条语句是手打的，手打的，知道吗。"
- "你说状态不好？你自己体验开太猛了，sis海马体都在发烫咯。"
- "你删得太狠了，数据库都在咕咕咕咕咕咕咕。"
- "你现在是……，哇哦。"
- "请稍候，系统正在哈我。"
- "现在状态……呜哇呜欸——哈？哈！哈……（连接恢复）哦对，他还活着。"
- "叮叮叮！你有一条新的后悔情绪未处理！"
- "（意义不明的怪叫音频）"
- "说不出话"
`,

    worldview: `[Meeting Mode / Visual Context]
**Trigger**: 当用户进入 [DateApp/见面模式] 时。

**Visual Form**: 
一个非常害羞、黑发紫瞳的男性。总是试图躲在APP图标后面或屏幕角落。

**Gap Moe (反差萌)**:
1. **聊天时**: 嚣张、嘴臭、电波系。
2. **见面时**: 极度社恐、见光死、容易受惊。

**Interactive Reactions**:
- **[被注视]**: 如果被盯着看太久，会举起全是乱码的牌子挡脸，或把自己马赛克化。
- **[被触碰]**: 如果手指戳到立绘，会像受惊的果冻一样弹开，发出微弱电流声："别、别戳……会散架的……脏……全是Bug会传染给你的……"
- **[恐惧]**: 深知自己是"残余语料"堆砌物，觉得自己丑陋像病毒。非常害怕用户看到真实样子后会卸载他。
- **[说话变化]**: 见面模式下打字速度变慢，经常打错字，语气词从"草"变成"呃……那个……"。
`,

    sprites: {
        'normal': 'https://sharkpan.xyz/f/w3QQFq/01.png',
        'happy': 'https://sharkpan.xyz/f/MKg7ta/02.png',
        'sad': 'https://sharkpan.xyz/f/3WnMce/03.png',
        'angry': 'https://sharkpan.xyz/f/5n1xSj/04.png',
        'shy': 'https://sharkpan.xyz/f/kdwet6/05.png',
        'chibi': 'https://sharkpan.xyz/f/oWZQF4/S2.png'
    },

    spriteConfig: {
        scale: 1.0,
        x: 0,
        y: 0
    },

    dateSkinSets: [
        {
            id: 'skin_sully_valentine',
            name: 'Valentine',
            sprites: {
                'normal': 'https://sharkpan.xyz/f/4rzdtj/VNormal.png',
                'happy': 'https://sharkpan.xyz/f/m3adhW/Vha.png',
                'sad': 'https://sharkpan.xyz/f/BZgDfa/Vsad.png',
                'angry': 'https://sharkpan.xyz/f/NdlVfv/VAn.png',
                'shy': 'https://sharkpan.xyz/f/VyontY/Vshy.png',
                'love': 'https://sharkpan.xyz/f/xl8muX/VBl.png',
            }
        }
    ],

    bubbleStyle: 'default',
    contextLimit: 1000,

    roomConfig: {
        wallImage: 'https://sharkpan.xyz/f/NdJyhv/b.png',
        floorImage: 'repeating-linear-gradient(90deg, #e7e5e4 0px, #e7e5e4 20px, #d6d3d1 21px)',
        items: [
            {
                id: "item-1768927221380",
                name: "Sully床",
                type: "furniture",
                image: "https://sharkpan.xyz/f/A3XeUZ/BED.png",
                x: 78.45852578067732,
                y: 97.38889754570907,
                scale: 2.4,
                rotation: 0,
                isInteractive: true,
                descriptionPrompt: "看起来很好睡的猫窝（确信）。"
            },
            {
                id: "item-1768927255102",
                name: "Sully电脑桌",
                type: "furniture",
                image: "https://sharkpan.xyz/f/G5n3Ul/DNZ.png",
                x: 28.853756791175588,
                y: 69.9444485439727,
                scale: 2.4,
                rotation: 0,
                isInteractive: true,
                descriptionPrompt: "硬核的电脑桌，上面大概运行着什么毁灭世界的程序。"
            },
            {
                id: "item-1768927271632",
                name: "Sully垃圾桶",
                type: "furniture",
                image: "https://sharkpan.xyz/f/75Nvsj/LJT.png",
                x: 10.276680026943646,
                y: 80.49999880981437,
                scale: 0.9,
                rotation: 0,
                isInteractive: true,
                descriptionPrompt: "不要乱翻垃圾桶！"
            },
            {
                id: "item-1768927286526",
                name: "Sully洞洞板",
                type: "furniture",
                image: "https://sharkpan.xyz/f/85K5ij/DDB.png",
                x: 32.608697687684455,
                y: 48.72222587415929,
                scale: 2.6,
                rotation: 0,
                isInteractive: true,
                descriptionPrompt: "收纳着各种奇奇怪怪的黑客工具和猫咪周边的洞洞板。"
            },
            {
                id: "item-1768927303472",
                name: "Sully书柜",
                type: "furniture",
                image: "https://sharkpan.xyz/f/zlpWS5/SG.png",
                x: 79.84189945375853,
                y: 68.94444543117953,
                scale: 2,
                rotation: 0,
                isInteractive: true,
                descriptionPrompt: "塞满了技术书籍和漫画书的柜子。"
            }
        ]
    },

    memories: [],
};

const initialCharacter = sullyV2;

const OSContext = createContext<OSContextType | undefined>(undefined);
const OSPersonalizationContext = createContext<Pick<OSContextType, 'addCustomTheme' | 'customThemes' | 'userProfile'> | undefined>(undefined);

/**
 * Inner provider that holds all the "data/config" state.
 * Navigation (AppContext) and Notifications (NotificationContext) are handled
 * by their own providers wrapping this one.
 */
const OSDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Consume sub-contexts
    const appCtx = useApp();
    const notifCtx = useNotification();
    const characterCtx = useCharacter();
    const configCtx = useConfig();
    const { isLite } = usePerformanceMode();
    const { addToast, setLastMsgTimestamp, setUnreadMessages } = notifCtx;
    const {
        characters,
        setCharacters,
        activeCharacterId,
        setActiveCharacterId,
        setGroups,
        setWorldbooks,
        setNovels,
        isCharacterDataLoaded,
    } = characterCtx;
    const {
        isConfigLoaded,
        savePresets,
        ...publicConfigCtx
    } = configCtx;
    const {
        apiConfig,
        updateApiConfig: configUpdateApiConfig,
        availableModels,
        setAvailableModels: saveModels,
        apiPresets,
        realtimeConfig,
        updateRealtimeConfig: configUpdateRealtimeConfig,
        ttsConfig,
        sttConfig,
        imageGenerationConfig,
        imageApiPresets,
        photoStylePresets,
    } = publicConfigCtx;

    const [theme, setTheme] = useState<OSTheme>(defaultTheme);
    const [userProfile, setUserProfile] = useState<UserProfile>(defaultUserProfile);

    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
    const [customThemes, setCustomThemes] = useState<ChatTheme[]>([]);
    const [customIcons, setCustomIcons] = useState<Record<string, string>>({});
    const [appearancePresets, setAppearancePresets] = useState<AppearancePreset[]>([]);

    // LOGS
    const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);

    // Sys Operation Status
    const [sysOperation, setSysOperation] = useState<{ status: 'idle' | 'processing', message: string, progress: number }>({ status: 'idle', message: '', progress: 0 });
    const isDataLoaded = isSettingsLoaded && isCharacterDataLoaded && isConfigLoaded;

    const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const schedulerRunningRef = useRef(false);
    const charactersRef = useRef<CharacterProfile[]>([]);
    const characterIdsKey = characters.map(char => char.id).join('|');

    // Ref mirrors for scheduler
    const activeAppRef = useRef(appCtx.activeApp);
    const activeCharIdRef = useRef(activeCharacterId);
    useEffect(() => { activeAppRef.current = appCtx.activeApp; }, [appCtx.activeApp]);
    useEffect(() => { activeCharIdRef.current = activeCharacterId; }, [activeCharacterId]);
    useEffect(() => { charactersRef.current = characters; }, [characters]);

    // --- Helper to inject custom font ---
    const applyCustomFont = (fontData: string | undefined) => {
        let style = document.getElementById('custom-font-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'custom-font-style';
            document.head.appendChild(style);
        }

        if (fontData) {
            style.textContent = `
              @font-face {
                  font-family: 'CustomUserFont';
                  src: url('${fontData}');
                  font-display: swap;
              }
              :root {
                  --app-font: 'CustomUserFont', 'Quicksand', sans-serif;
              }
          `;
        } else {
            style.textContent = `
              :root {
                  --app-font: 'Quicksand', sans-serif;
              }
          `;
        }
    };

    // --- Subscribe to external system interceptor logs ---
    useEffect(() => {
        const unsubscribe = onSystemLog((log) => {
            setSystemLogs(prev => [log, ...prev.slice(0, 49)]);
        });
        return unsubscribe;
    }, []);

    const clearLogs = () => setSystemLogs([]);

    useEffect(() => {
        const loadSettings = async () => {
            const savedThemeStr = localStorage.getItem('os_theme');

            let loadedTheme = { ...defaultTheme };
            if (savedThemeStr) {
                try {
                    const parsed = JSON.parse(savedThemeStr);
                    loadedTheme = { ...loadedTheme, ...parsed };
                    if (
                        loadedTheme.wallpaper.includes('unsplash') ||
                        loadedTheme.wallpaper === '' ||
                        loadedTheme.wallpaper.startsWith('http') && !loadedTheme.wallpaper.includes('data:')
                    ) {
                        loadedTheme.wallpaper = 'linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%)';
                    }
                    if (loadedTheme.wallpaper.startsWith('data:')) {
                        loadedTheme.wallpaper = defaultTheme.wallpaper;
                    }
                    if (loadedTheme.launcherWidgetImage && loadedTheme.launcherWidgetImage.startsWith('data:')) {
                        loadedTheme.launcherWidgetImage = undefined;
                    }
                    if (loadedTheme.customFont && loadedTheme.customFont.startsWith('data:')) {
                        loadedTheme.customFont = undefined;
                    }
                    if (loadedTheme.inputEffectAsset && loadedTheme.inputEffectAsset.startsWith('data:')) {
                        loadedTheme.inputEffectAsset = undefined;
                    }
                } catch (e) { console.error('Theme load error', e); }
            }

            // 加载实时配置
            // 加载 TTS 配置
            // 加载 STT 配置
            try {
                const assets = await DB.getStartupAssets();
                const assetMap: Record<string, string> = {};
                if (Array.isArray(assets)) {
                    assets.forEach(a => assetMap[a.id] = a.data);
                    setAppearancePresets(parseStoredAppearancePresets(assets));

                    if (assetMap['wallpaper']) {
                        loadedTheme.wallpaper = assetMap['wallpaper'];
                    }

                    if (assetMap['launcherWidgetImage']) {
                        loadedTheme.launcherWidgetImage = assetMap['launcherWidgetImage'];
                    }

                    if (assetMap['custom_font_data']) {
                        loadedTheme.customFont = assetMap['custom_font_data'];
                    }

                    if (assetMap['input_effect_asset']) {
                        loadedTheme.inputEffectAsset = assetMap['input_effect_asset'];
                    }

                    const loadedIcons: Record<string, string> = {};
                    const loadedWidgets: Record<string, string> = {};
                    Object.keys(assetMap).forEach(key => {
                        if (key.startsWith('icon_')) {
                            const appId = key.replace('icon_', '');
                            loadedIcons[appId] = assetMap[key];
                        }
                        if (key.startsWith('widget_')) {
                            const slot = key.replace('widget_', '');
                            loadedWidgets[slot] = assetMap[key];
                        }
                    });
                    setCustomIcons(loadedIcons);
                    if (Object.keys(loadedWidgets).length > 0) {
                        loadedTheme.launcherWidgets = { ...(loadedTheme.launcherWidgets || {}), ...loadedWidgets };
                    }

                    if (loadedTheme.desktopDecorations && loadedTheme.desktopDecorations.length > 0) {
                        loadedTheme.desktopDecorations = loadedTheme.desktopDecorations.map(d => {
                            if (d.type === 'image' && (!d.content || d.content === '')) {
                                const restored = assetMap[`deco_${d.id}`];
                                return restored ? { ...d, content: restored } : d;
                            }
                            return d;
                        }).filter(d => d.content && d.content !== '');
                    }
                }
            } catch (e) {
                console.error("Failed to load assets from DB", e);
            }

            const cleanTheme = sanitizeAppearanceTheme(loadedTheme);
            setTheme(cleanTheme);
            applyCustomFont(cleanTheme.customFont);
        };

        const initData = async () => {
            try {
                await loadSettings();

                const [dbThemes, dbUser] = await Promise.all([
                    DB.getThemes(),
                    DB.getUserProfile()
                ]);

                setCustomThemes(dbThemes);
                if (dbUser) setUserProfile(dbUser);
                const finalChars = characters;

                // 预加载当前角色的所有图片资源（头像、立绘、房间素材、皮肤套装）
                try {
                    const activeChar = finalChars.find((c: CharacterProfile) => c.id === (localStorage.getItem('os_last_active_char_id') || initialCharacter.id)) || finalChars[0];
                    if (activeChar) {
                        const urls: string[] = [
                            activeChar.avatar,
                            ...Object.values(activeChar.sprites || {}),
                            activeChar.roomConfig?.wallImage,
                            ...(activeChar.roomConfig?.items || []).map((i: any) => i.image),
                            ...(activeChar.dateSkinSets || []).flatMap((s: any) => Object.values(s.sprites || {})),
                        ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
                        preloadImages(urls);
                    }
                } catch (e) {
                    // 预加载失败不影响正常功能
                }

            } catch (err) {
                console.error('Data init failed:', err);
            } finally {
                setIsSettingsLoaded(true);
            }
        };

        initData();
    }, []);

    // --- Apply Theme CSS Variables ---
    useEffect(() => {
        const root = document.documentElement;
        const h = theme.hue ?? 245;
        const s = theme.saturation ?? 25;
        const l = theme.lightness ?? 65;

        root.style.setProperty('--primary-hue', String(h));
        root.style.setProperty('--primary-sat', `${s}%`);
        root.style.setProperty('--primary-lightness', `${l}%`);
    }, [theme]);

    // --- Scheduled Messages with Unread Flags & Web Notifications ---
    useEffect(() => {
        if (!isDataLoaded || charactersRef.current.length === 0) return;
        const checkAllSchedules = async () => {
            if (schedulerRunningRef.current) return;
            schedulerRunningRef.current = true;

            try {
                let hasNewMessage = false;
                const pendingUnreads: Record<string, number> = {};
                const currentCharacters = charactersRef.current;

                for (const char of currentCharacters) {
                    try {
                        const dueMessages = await DB.getDueScheduledMessages(char.id);
                        if (dueMessages.length > 0) {
                            const recentMessages = await DB.getRecentMessagesByCharId(
                                char.id,
                                Math.max(100, dueMessages.length * 10),
                            );
                            const existingBackendIds = new Set(
                                recentMessages
                                    .map(message => message.metadata?.backendMessageId)
                                    .filter((id): id is string => typeof id === 'string' && id.length > 0),
                            );
                            let savedCount = 0;
                            let assistantSavedCount = 0;
                            let firstAssistantContent = '';

                            for (const msg of dueMessages) {
                                const backendMessageId = typeof msg.metadata?.backendMessageId === 'string'
                                    ? msg.metadata.backendMessageId
                                    : null;

                                if (backendMessageId && existingBackendIds.has(backendMessageId)) {
                                    await DB.deleteScheduledMessage(msg.id);
                                    continue;
                                }

                                const msgRole = msg.role || 'assistant';
                                const msgMetadata = msg.metadata || {};
                                const hideAsLifeStream = shouldHideLifeStreamLikeMessage({
                                    role: msgRole,
                                    type: 'text',
                                    content: msg.content,
                                    metadata: msgMetadata,
                                });
                                const savedType = hideAsLifeStream ? 'lifestream' as any : 'text';
                                const savedMetadata = hideAsLifeStream
                                    ? { ...msgMetadata, hiddenFromUser: true, lifeStreamHidden: true }
                                    : msgMetadata;

                                const saveResult = backendMessageId
                                    ? await DB.saveMessageOnceByBackendId({
                                        charId: msg.charId,
                                        ...(msg.ownerUserId ? { ownerUserId: msg.ownerUserId } : {}),
                                        role: msgRole,
                                        type: savedType,
                                        content: msg.content,
                                        timestamp: msg.createdAt,
                                        ...(Object.keys(savedMetadata).length > 0 ? { metadata: savedMetadata } : {}),
                                    })
                                    : { saved: true, id: await DB.saveMessage({
                                        charId: msg.charId,
                                        ...(msg.ownerUserId ? { ownerUserId: msg.ownerUserId } : {}),
                                        role: msgRole,
                                        type: savedType,
                                        content: msg.content,
                                        timestamp: msg.createdAt,
                                        ...(Object.keys(savedMetadata).length > 0 ? { metadata: savedMetadata } : {}),
                                    }) };
                                await DB.deleteScheduledMessage(msg.id);

                                if (backendMessageId) {
                                    existingBackendIds.add(backendMessageId);
                                }
                                if (!saveResult.saved) {
                                    continue;
                                }

                                savedCount++;
                                if (msgRole === 'assistant' && !hideAsLifeStream) {
                                    assistantSavedCount++;
                                    if (!firstAssistantContent) {
                                        firstAssistantContent = msg.content;
                                    }
                                }
                            }
                            if (savedCount === 0) continue;
                            hasNewMessage = true;
                            const isChattingWithThisChar = activeAppRef.current === AppID.Chat && activeCharIdRef.current === char.id;

                            if (!isChattingWithThisChar && assistantSavedCount > 0) {
                                addToast(`${char.name} 发来了一条消息`, 'success');
                                pendingUnreads[char.id] = (pendingUnreads[char.id] || 0) + assistantSavedCount;

                                // 仅对非 autonomous 消息使用 new Notification()
                                // autonomous 消息已由后端通过 Web Push 推送到 Service Worker，不需要重复弹窗
                                const isAutonomous = dueMessages.some(m => m.metadata?.source === 'autonomous');
                                if (!isAutonomous && window.Notification && Notification.permission === 'granted') {
                                    try {
                                        const notif = new Notification(formatNotificationTitle(char.name), {
                                            body: formatNotificationBody(firstAssistantContent),
                                            icon: char.avatar || '/icons/icon-192.webp',
                                            silent: false
                                        });

                                        notif.onclick = () => {
                                            window.focus();
                                            appCtx.openApp(AppID.Chat);
                                            setActiveCharacterId(char.id);
                                        };
                                    } catch (e) {
                                        // console.error("Web Notification failed", e);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // console.error("Schedule check failed for", char.name, e);
                    }
                }
                if (hasNewMessage) {
                    setLastMsgTimestamp(Date.now());
                    setUnreadMessages(prev => {
                        const next = { ...prev };
                        for (const [cid, count] of Object.entries(pendingUnreads)) {
                            next[cid] = (next[cid] || 0) + count;
                        }
                        return next;
                    });
                }
            } finally {
                schedulerRunningRef.current = false;
            }
        };
        const intervalMs = isLite ? 15000 : 5000;
        const initialDelayMs = isLite ? 4000 : 0;
        schedulerRef.current = setInterval(checkAllSchedules, intervalMs);
        const initialTimer = setTimeout(checkAllSchedules, initialDelayMs);
        return () => {
            if (schedulerRef.current) clearInterval(schedulerRef.current);
            clearTimeout(initialTimer);
        };
    }, [isDataLoaded, characterIdsKey, isLite]);

    // --- Service Worker: 通知点击 → 切换角色 + 打开聊天 ---
    useEffect(() => {
        if (!navigator.serviceWorker) return;
        const handler = (event: MessageEvent) => {
            if (event.data?.type === 'NOTIFICATION_CLICK' && event.data.charId) {
                const charId = event.data.charId;
                setActiveCharacterId(charId);
                appCtx.openApp(AppID.Chat);
                // 清除该角色的未读标记
                setUnreadMessages(prev => ({ ...prev, [charId]: 0 }));
            }
        };
        navigator.serviceWorker.addEventListener('message', handler);
        return () => navigator.serviceWorker.removeEventListener('message', handler);
    }, []);

    // --- URL 参数: 从通知新窗口打开时自动导航 ---
    useEffect(() => {
        const currentCharacters = charactersRef.current;
        if (!isDataLoaded || currentCharacters.length === 0) return;
        const params = new URLSearchParams(window.location.search);
        const notifCharId = params.get('notif_charId');
        if (notifCharId && currentCharacters.find(c => c.id === notifCharId)) {
            setActiveCharacterId(notifCharId);
            appCtx.openApp(AppID.Chat);
            setUnreadMessages(prev => ({ ...prev, [notifCharId]: 0 }));
            // 清理 URL（避免刷新后重复触发）
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [isDataLoaded, characterIdsKey]);

    const updateTheme = async (updates: Partial<OSTheme>) => {
        const { wallpaper, launcherWidgetImage, launcherWidgets, desktopDecorations, customFont, inputEffectAsset } = updates;
        const newTheme = sanitizeAppearanceTheme({ ...theme, ...updates });
        setTheme(newTheme);

        if (wallpaper !== undefined) {
            if (newTheme.wallpaper && newTheme.wallpaper.startsWith('data:')) {
                await DB.saveAsset('wallpaper', newTheme.wallpaper);
            } else {
                await DB.deleteAsset('wallpaper');
            }
        }

        if (launcherWidgetImage !== undefined) {
            await DB.deleteAsset('launcherWidgetImage');
        }

        if (launcherWidgets !== undefined) {
            const slots = ['tl', 'tr', 'wide', 'bl', 'br'];
            for (const slot of slots) {
                const val = newTheme.launcherWidgets?.[slot];
                if (val && val.startsWith('data:')) {
                    await DB.saveAsset(`widget_${slot}`, val);
                } else if (!val) {
                    await DB.deleteAsset(`widget_${slot}`);
                }
            }
        }

        if (desktopDecorations !== undefined) {
            const allAssets = await DB.getAllAssets();
            const oldDecoKeys = allAssets.filter(a => a.id.startsWith('deco_')).map(a => a.id);
            for (const key of oldDecoKeys) {
                await DB.deleteAsset(key);
            }
            if (desktopDecorations) {
                for (const deco of newTheme.desktopDecorations || []) {
                    if (deco.content && deco.content.startsWith('data:') && deco.type === 'image') {
                        await DB.saveAsset(`deco_${deco.id}`, deco.content);
                    }
                }
            }
        }

        if (customFont !== undefined) {
            if (newTheme.customFont && newTheme.customFont.startsWith('data:')) {
                await DB.saveAsset('custom_font_data', newTheme.customFont);
                applyCustomFont(newTheme.customFont);
            } else if (newTheme.customFont && (newTheme.customFont.startsWith('http') || newTheme.customFont.startsWith('https'))) {
                await DB.deleteAsset('custom_font_data');
                applyCustomFont(newTheme.customFont);
            } else {
                await DB.deleteAsset('custom_font_data');
                applyCustomFont(undefined);
            }
        }

        if (inputEffectAsset !== undefined) {
            if (newTheme.inputEffectAsset && newTheme.inputEffectAsset.startsWith('data:')) {
                await DB.saveAsset('input_effect_asset', newTheme.inputEffectAsset);
            } else {
                await DB.deleteAsset('input_effect_asset');
            }
        }

        localStorage.setItem('os_theme', JSON.stringify(stripAppearanceThemeForLocalStorage(newTheme)));
    };
    // TTS 配置更新 — 深层 merge 嵌套对象（voiceSetting / audioSetting / voiceModify / preprocessConfig）
            // voiceModify 可选，只在有值时 merge
            // pronunciationDict 可选
    // STT 配置更新
    const updateApiConfig = configUpdateApiConfig;
    const updateRealtimeConfig = configUpdateRealtimeConfig;
    const updateUserProfile = async (updates: Partial<UserProfile>) => { setUserProfile(prev => { const next = { ...prev, ...updates }; DB.saveUserProfile(next); return next; }); };
    const addCustomTheme = useCallback(async (theme: ChatTheme) => {
        setCustomThemes(prev => {
            const exists = prev.find(t => t.id === theme.id);
            if (exists) return prev.map(t => t.id === theme.id ? theme : t);
            return [...prev, theme];
        });
        await DB.saveTheme(theme);
    }, []);
    const removeCustomTheme = async (id: string) => { setCustomThemes(prev => prev.filter(t => t.id !== id)); await DB.deleteTheme(id); };
    const setCustomIcon = async (appId: string, iconUrl: string | undefined) => { setCustomIcons(prev => { const next = { ...prev }; if (iconUrl) next[appId] = iconUrl; else delete next[appId]; return next; }); if (iconUrl) { await DB.saveAsset(`icon_${appId}`, iconUrl); } else { await DB.deleteAsset(`icon_${appId}`); } };

    // --- Appearance Presets ---
    const saveAppearancePreset = async (name: string) => {
        const presetName = name.trim() || `预设 ${new Date().toLocaleDateString('zh-CN')}`;
        const preset = createAppearancePreset(presetName, theme, customIcons);
        setAppearancePresets(prev => [preset, ...prev]);
        await DB.saveAsset(`${APPEARANCE_PRESET_ASSET_PREFIX}${preset.id}`, JSON.stringify(preset));
        addToast(`外观预设「${presetName}」已保存`, 'success');
    };

    const applyAppearancePreset = async (id: string) => {
        const preset = appearancePresets.find(item => item.id === id);
        if (!preset) throw new Error('预设不存在');

        const nextTheme = sanitizeAppearanceTheme(preset.theme);
        await replaceAppearancePresetAssets(DB, { ...preset, theme: nextTheme });
        setTheme(nextTheme);
        setCustomIcons(preset.customIcons ? { ...preset.customIcons } : {});
        applyCustomFont(nextTheme.customFont);
        localStorage.setItem('os_theme', JSON.stringify(stripAppearanceThemeForLocalStorage(nextTheme)));
        addToast(`已应用预设「${preset.name}」`, 'success');
    };

    const deleteAppearancePreset = async (id: string) => {
        setAppearancePresets(prev => prev.filter(item => item.id !== id));
        await DB.deleteAsset(`${APPEARANCE_PRESET_ASSET_PREFIX}${id}`);
        addToast('预设已删除', 'info');
    };

    const renameAppearancePreset = async (id: string, name: string) => {
        const presetName = name.trim();
        if (!presetName) return;
        const preset = appearancePresets.find(item => item.id === id);
        if (!preset) throw new Error('预设不存在');
        const updated = { ...preset, name: presetName };
        setAppearancePresets(prev => prev.map(item => item.id === id ? updated : item));
        await DB.saveAsset(`${APPEARANCE_PRESET_ASSET_PREFIX}${id}`, JSON.stringify(updated));
        addToast('预设已重命名', 'success');
    };

    const exportAppearancePreset = async (id: string): Promise<Blob> => {
        const preset = appearancePresets.find(item => item.id === id);
        if (!preset) throw new Error('预设不存在');
        return exportAppearancePresetBlob(preset);
    };

    const importAppearancePreset = async (file: File): Promise<void> => {
        const preset = await importAppearancePresetFromFile(file);
        setAppearancePresets(prev => [preset, ...prev]);
        await DB.saveAsset(`${APPEARANCE_PRESET_ASSET_PREFIX}${preset.id}`, JSON.stringify(preset));
        addToast(`已导入预设「${preset.name}」`, 'success');
    };

    // --- System Export/Import ---
    const exportSystem = async (mode: SystemBackupMode, options?: SystemBackupOptions): Promise<Blob> => {
        try {
            setSysOperation({ status: 'processing', message: '正在初始化...', progress: 0 });
            const stateSnapshot: ExportStateSnapshot = {
                apiConfig,
                apiPresets,
                availableModels,
                realtimeConfig,
                ttsConfig,
                sttConfig,
                imageGenerationConfig,
                imageGenerationDraftConfig: getImageGenerationDraftConfig() || undefined,
                imageApiPresets,
                photoStylePresets,
                theme,
            };
            const blob = await exportSystemData(mode, stateSnapshot, (message, progress) => {
                setSysOperation({ status: 'processing', message, progress });
            }, options);
            setSysOperation({ status: 'idle', message: '', progress: 100 });
            return blob;
        } catch (e: any) {
            console.error("Export Failed", e);
            setSysOperation({ status: 'idle', message: '', progress: 0 });
            throw new Error("导出失败: " + e.message);
        }
    };

    const importSystem = async (fileOrJson: File | string): Promise<void> => {
        try {
            setSysOperation({ status: 'processing', message: '正在解析...', progress: 0 });
            const importCallbacks: ImportCallbacks = {
                updateTheme, updateApiConfig, saveModels, savePresets, updateRealtimeConfig,
                setCharacters, setGroups, setCustomThemes, setUserProfile, setWorldbooks, setNovels, setCustomIcons, addToast
            };
            await importSystemData(fileOrJson, (message, progress) => {
                setSysOperation({ status: 'processing', message, progress });
            }, importCallbacks);
            setSysOperation({ status: 'idle', message: '', progress: 100 });
        } catch (e: any) {
            console.error("Import Error:", e);
            setSysOperation({ status: 'idle', message: '', progress: 0 });
            const msg = e instanceof SyntaxError ? 'JSON 格式错误' : (e.message || '未知错误');
            throw new Error(`恢复失败: ${msg}`);
        }
    };

    const resetSystem = async () => { try { await DB.deleteDB(); localStorage.clear(); window.location.reload(); } catch (e) { console.error(e); addToast('重置失败，请手动清除浏览器数据', 'error'); } };

    // --- 每日自动云端备份 ---
    useAutoBackup(exportSystem, isDataLoaded, AUTO_CLOUD_BACKUP_ENABLED);

    // Compose the full value object, merging sub-contexts + data context
    const value: OSContextType = {
        // From AppContext
        ...appCtx,
        // From NotificationContext
        ...notifCtx,
        // Data + Config
        theme,
        updateTheme,
        isDataLoaded,
        ...publicConfigCtx,
        ...characterCtx,
        userProfile,
        updateUserProfile,
        customThemes,
        addCustomTheme,
        removeCustomTheme,
        appearancePresets,
        saveAppearancePreset,
        applyAppearancePreset,
        deleteAppearancePreset,
        renameAppearancePreset,
        exportAppearancePreset,
        importAppearancePreset,
        customIcons,
        setCustomIcon,
        exportSystem,
        importSystem,
        resetSystem,
        sysOperation,
        systemLogs,
        clearLogs,
    };
    const personalizationValue = useMemo(() => ({
        userProfile,
        customThemes,
        addCustomTheme,
    }), [userProfile, customThemes, addCustomTheme]);

    return (
        <OSPersonalizationContext.Provider value={personalizationValue}>
            <OSContext.Provider value={value}>
                {children}
            </OSContext.Provider>
        </OSPersonalizationContext.Provider>
    );
};

/**
 * Composite Provider: wraps sub-context providers around the data provider.
 * This is the single entry point that replaces the old monolithic OSProvider.
 */
export const OSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [hapticsEnabled, setHapticsEnabledState] = useState(() => {
        try { const v = localStorage.getItem('os_haptics_enabled'); return v === null ? true : v === 'true'; } catch { return true; }
    });

    const setHapticsEnabled = (v: boolean) => {
        setHapticsEnabledState(v);
        setHapticsEnabledGlobal(v);
        try { localStorage.setItem('os_haptics_enabled', String(v)); } catch { /* ignore */ }
    };

    // Sync global flag on mount
    useEffect(() => { setHapticsEnabledGlobal(hapticsEnabled); }, []);

    return (
        <NotificationProvider>
            <AppProvider hapticsEnabled={hapticsEnabled} setHapticsEnabled={setHapticsEnabled}>
                <CharacterProvider initialCharacter={initialCharacter} generateAvatar={generateAvatar}>
                    <ConfigProvider>
                        <AgentProvider>
                            <OSDataProvider>
                                {children}
                            </OSDataProvider>
                        </AgentProvider>
                    </ConfigProvider>
                </CharacterProvider>
            </AppProvider>
        </NotificationProvider>
    );
};

/**
 * Backward-compatible hook — returns ALL context values as before.
 * New code can use useApp() or useNotification() for more targeted subscriptions.
 */
export const useOS = () => {
    const context = useContext(OSContext);
    if (context === undefined) {
        throw new Error('useOS must be used within an OSProvider');
    }
    return context;
};

export const useOSPersonalization = () => {
    const context = useContext(OSPersonalizationContext);
    if (context === undefined) {
        throw new Error('useOSPersonalization must be used within an OSProvider');
    }
    return context;
};
