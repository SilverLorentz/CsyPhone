import React from 'react';
import {
    BatteryHigh,
    BellSimple,
    BookmarkSimple,
    BookBookmark,
    BookOpen,
    CalendarDots,
    Cards,
    CarProfile,
    CaretLeft,
    CaretRight,
    CellSignalFull,
    ChatCircleText,
    CheckCircle,
    Clock,
    CloudSun,
    CrownSimple,
    CreditCard,
    DiceFive,
    DotsThree,
    EnvelopeSimple,
    Eye,
    FileText,
    FilmSlate,
    Folder,
    ForkKnife,
    GearSix,
    GlobeHemisphereWest,
    GraduationCap,
    GameController,
    Heartbeat,
    HouseLine,
    ImageSquare,
    LockKey,
    MagnifyingGlass,
    MapPin,
    MapTrifold,
    MusicNotes,
    NotePencil,
    Package,
    PaintBrush,
    Palette,
    PaperPlaneTilt,
    Play,
    PottedPlant,
    Plus,
    Pulse,
    PuzzlePiece,
    Receipt,
    ShareNetwork,
    ShoppingBagOpen,
    SkipBack,
    SkipForward,
    Sparkle,
    Star,
    Student,
    Sword,
    Tag,
    Target,
    Television,
    Trophy,
    UserCircle,
    UsersThree,
    VideoCamera,
    Waveform,
    Wallet,
    WifiHigh,
} from '@phosphor-icons/react';
import WeChatApp, { buildWeChatDataFromClue, type WeChatVisibleContent } from './WeChatApp';
import type { WeChatData } from './wechatTypes';

export type StoryPhoneAppId = string;

export interface PhoneAppDef {
    id: StoryPhoneAppId;
    name: string;
    icon: string;
    iconImage?: string;
    color: string;
    prompt: string;
    isCustom?: boolean;
}

export interface PhoneClueItem {
    label: string;
    value: string;
    detail?: string;
}

export interface PhoneClue {
    appId: StoryPhoneAppId;
    appName: string;
    title: string;
    subtitle?: string;
    timestamp?: string;
    items: PhoneClueItem[];
    evidenceText: string;
    insertSummary: string;
    wechatData?: WeChatData;
}

export interface StoryPhoneHomeSurface {
    headline?: string;
    stickyNote?: string;
    spotlightDetail?: string;
    spotlightFooter?: string;
}

export const PHONE_APPS: PhoneAppDef[] = [
    { id: 'wechat', name: '微信', icon: '微', color: '#18b35f', prompt: '生成角色真实在使用的微信数据，而不是一页线索卡。必须输出丰富 wechatData：角色自己的微信资料、聊天列表、联系人、群聊、朋友圈、收藏、服务/账单、作品/视频号、小店与卡包、表情、设置等。内容要从当前角色人设、世界观、关系、主聊天历史和本轮状态推导；允许有隐私痕迹、未读、置顶、撤回、转账、红包、工作群、好友互动。每个私聊/群聊都要有多条 chatMessages，不要只有和 user 的聊天完整；朋友圈要有角色本人和好友/联系人发布的多条动态与点赞评论，post.text 必须像本人发的朋友圈原话，禁止写成“旧识/重点关注对象/家族纽带/人生导师”这类人设关系摘要。top-level items 只作为当前停留页摘要，完整内容放进 wechatData。' },
    { id: 'qq', name: 'QQ', icon: 'Q', color: '#2d7df0', prompt: '精做一个完整的 QQ App 内容快照，不要只生成几条粗略线索。必须让 QQ 像角色真实长期使用的社交软件：消息页、好友私聊、多个群聊、QQ空间说说/访客/留言、相册、群文件/微云、收藏、联系人资料、等级/个性签名、匿名或旧关系痕迹都要有内容。生成 8-12 个可点开的 items；items 的 label 写好友名、群名、功能页或相册/文件夹名，detail 写具体时间、群身份、空间权限、QQ号、文件名、相册名、访客记录或旧记录痕迹。每个 item.value 不能只有二三条，至少写 5-8 行屏幕上可见的原文或列表项：私聊/群聊要有多轮对话、撤回/未读/语音/图片/表情/文件等痕迹；空间动态要有多条说说、点赞评论和访客，但评论/访客/点赞数量不要单独作为纯数字 item.value，计数请写进 detail 或写成“林野：别装，访客记录看得到”这类真实评论原文；相册要有多个相册/照片描述；文件要有多个文件名、大小、下载/转发记录；资料页要有昵称、QQ号、等级、签名、备注、共同群或最近互动。内容要从当前角色人设、关系、主聊天历史和本轮状态推导，像翻到一整个 QQ，而不是每个模块只有摘要。避免写成“旧识/重点对象”这类人设说明，必须写屏幕上真的会出现的 QQ 文案。' },
    { id: 'messages', name: '信息', icon: '💬', color: 'from-emerald-400 to-green-600', prompt: '生成一段手机聊天/未发送消息/置顶会话线索。' },
    { id: 'notes', name: '备忘录', icon: '📝', color: 'from-amber-200 to-yellow-500', prompt: '生成一条备忘录、清单或私密随手记。' },
    { id: 'photos', name: '相册', icon: '🖼️', color: 'from-fuchsia-300 to-sky-400', prompt: '生成几张相册缩略图的文字描述，像用户翻到了相册最近项目。' },
    { id: 'calendar', name: '日历', icon: '📅', color: 'from-red-400 to-rose-600', prompt: '生成一个日历提醒、纪念日、行程或被隐藏的预约。' },
    { id: 'browser', name: '浏览器', icon: '🌐', color: 'from-blue-400 to-cyan-500', prompt: '生成近期搜索记录、浏览历史或未关闭网页标题。' },
    { id: 'music', name: '音乐', icon: '🎵', color: 'from-rose-400 to-pink-600', prompt: '生成最近循环、收藏歌词、歌单或播放记录。' },
    { id: 'maps', name: '地图', icon: '🧭', color: 'from-indigo-400 to-violet-600', prompt: '生成最近去过的地点、收藏地点或路线记录。' },
    { id: 'clock', name: '时钟', icon: '⏰', color: 'from-slate-600 to-slate-900', prompt: '生成闹钟、倒计时或某个异常时间提醒。' },
    { id: 'wallet', name: '钱包', icon: '💳', color: 'from-lime-400 to-emerald-600', prompt: '生成转账、订单付款、票据或余额变化线索。' },
    { id: 'mail', name: '邮件', icon: '✉️', color: 'from-sky-400 to-blue-600', prompt: '生成一封邮件标题、草稿或通知摘要。' },
    { id: 'health', name: '健康', icon: '♡', color: 'from-teal-300 to-emerald-500', prompt: '生成睡眠、步数、心率、用药或情绪记录线索。' },
    { id: 'settings', name: '设置', icon: '⚙️', color: 'from-zinc-400 to-zinc-700', prompt: '生成手机设置页里暴露的壁纸、专注模式、联系人备注或隐私状态。' },
    { id: 'social', name: '社交', icon: '◎', color: 'from-violet-400 to-fuchsia-600', prompt: '生成社交软件里的私信、动态互动、关注列表、仅自己可见草稿或暧昧点赞记录。' },
    { id: 'video', name: '短剧', icon: '▶', color: 'from-red-500 to-orange-500', prompt: '生成短视频/短剧 App 的观看记录、收藏剧集、暂停画面、弹幕或搜索词线索。' },
    { id: 'shopping', name: '购物', icon: '袋', color: 'from-orange-300 to-rose-500', prompt: '生成购物 App 的订单、购物车、物流、收藏商品或搜索记录线索。' },
    { id: 'delivery', name: '外卖', icon: '餐', color: 'from-yellow-300 to-orange-500', prompt: '生成外卖 App 的订单、收货地址、备注、骑手消息或夜宵记录线索。' },
    { id: 'ride', name: '打车', icon: '车', color: 'from-cyan-400 to-blue-600', prompt: '生成打车/出行 App 的最近路线、上车点、司机消息、发票或异常取消记录。' },
    { id: 'diary', name: '日记', icon: '私', color: 'from-pink-300 to-rose-500', prompt: '生成私密日记 App 里的上锁片段、心情标签、未同步记录或删改痕迹。' },
    { id: 'homekit', name: '智家', icon: '家', color: 'from-teal-300 to-cyan-600', prompt: '生成智能家居 App 的门锁、灯光、空调、摄像头、到家离家自动化记录线索。' },
    { id: 'reading', name: '阅读', icon: '书', color: 'from-indigo-300 to-slate-600', prompt: '生成阅读/小说 App 的书架、划线、书签、最近阅读章节或搜索记录线索。' },
    { id: 'study', name: '学习', icon: '学', color: 'from-lime-300 to-green-600', prompt: '生成学习 App 的课程进度、错题、单词本、打卡或考试提醒线索。' },
    { id: 'files', name: '文件', icon: '档', color: 'from-slate-300 to-blue-500', prompt: '生成文件/云盘 App 的最近文件、分享链接、加密文件夹、下载记录或重命名痕迹。' },
    { id: 'weather', name: '天气', icon: '☼', color: 'from-sky-300 to-amber-300', prompt: '生成天气 App 的城市、预警、降雨提醒、日出日落或异常关注地点线索。' },
    { id: 'pstation', name: 'P站', icon: 'P', color: 'from-sky-500 to-blue-700', prompt: '生成插画/作品社区 App 的收藏作品、标签搜索、关注作者、浏览历史、投稿草稿或隐私浏览线索；只生成全年龄、非露骨内容。' },
    { id: 'gacha', name: '抽卡', icon: '星', color: 'from-violet-500 to-cyan-400', prompt: '生成抽卡/养成游戏 App 的祈愿记录、保底、角色养成、好友留言、充值或截图线索。' },
    { id: 'rhythm', name: '音游', icon: '奏', color: 'from-fuchsia-400 to-cyan-400', prompt: '生成音游 App 的最近曲目、成绩、连击、凌晨游玩、好友排行或失败重打线索。' },
    { id: 'farmgame', name: '庄园', icon: '田', color: 'from-emerald-300 to-yellow-400', prompt: '生成经营/种田游戏 App 的庄园访客、作物收成、留言板、礼物或照料时间线索。' },
    { id: 'battle', name: '对战', icon: '战', color: 'from-slate-700 to-red-500', prompt: '生成竞技/组队游戏 App 的战绩、队友聊天、赛后邀请、禁言或隐藏亲密关系线索。' },
    { id: 'puzzle', name: '解谜', icon: '谜', color: 'from-blue-400 to-indigo-700', prompt: '生成解谜/逃脱游戏 App 的关卡进度、笔记、提示购买、截图标注或卡关时间线索。' },
];

export const pickRandomPhoneApp = (apps: PhoneAppDef[] = PHONE_APPS) => apps[Math.floor(Math.random() * apps.length)] || PHONE_APPS[0];

export function getStoryPhoneAppById(appId?: string, apps: PhoneAppDef[] = PHONE_APPS): PhoneAppDef | undefined {
    return apps.find(app => app.id === appId) || PHONE_APPS.find(app => app.id === appId);
}

type StoryPhoneIcon = React.ComponentType<{
    className?: string;
    size?: number | string;
    weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
}>;

const APP_ICON_MAP: Record<string, StoryPhoneIcon> = {
    wechat: ChatCircleText,
    messages: ChatCircleText,
    notes: NotePencil,
    photos: ImageSquare,
    calendar: CalendarDots,
    browser: GlobeHemisphereWest,
    music: MusicNotes,
    maps: MapTrifold,
    clock: Clock,
    wallet: Wallet,
    mail: EnvelopeSimple,
    health: Heartbeat,
    settings: GearSix,
    social: UsersThree,
    video: VideoCamera,
    shopping: ShoppingBagOpen,
    delivery: ForkKnife,
    ride: CarProfile,
    diary: BookBookmark,
    homekit: HouseLine,
    reading: BookOpen,
    study: GraduationCap,
    files: Folder,
    weather: CloudSun,
    pstation: Palette,
    gacha: Sparkle,
    rhythm: Waveform,
    farmgame: PottedPlant,
    battle: Sword,
    puzzle: PuzzlePiece,
};

const DOCK_APP_IDS = ['wechat', 'messages', 'mail', 'settings'];

function isImageIconSource(value?: string): value is string {
    return !!value && /^(data:image\/|blob:|https?:\/\/)/i.test(value);
}

function renderAppGlyph(app: PhoneAppDef, className: string, imageClassName?: string) {
    if (isImageIconSource(app.iconImage)) {
        return <img src={app.iconImage} className={imageClassName || `${className} rounded-[inherit] object-cover`} alt="" />;
    }

    const Icon = APP_ICON_MAP[app.id];
    if (Icon) {
        return <Icon weight="regular" className={className} />;
    }
    const emojiSizeClass = className.includes('h-9')
        ? 'text-[2rem]'
        : className.includes('h-7')
            ? 'text-[1.55rem]'
            : className.includes('h-6')
                ? 'text-[1.35rem]'
                : 'text-[1.1rem]';
    return <span className={`${className} flex items-center justify-center leading-none ${emojiSizeClass}`}>{app.icon}</span>;
}

const unreadDotClass = 'story-phone-unread-dot pointer-events-none absolute -right-1 -top-1 z-30 h-3 w-3 rounded-full border-2 border-white/85 bg-[#a76666] shadow-[0_2px_6px_rgba(83,45,45,0.24)]';

function StoryPhoneUnreadDot() {
    return <span aria-hidden="true" className={unreadDotClass} />;
}

function getWallpaperStyle(wallpaper?: string): React.CSSProperties {
    const fallback = 'linear-gradient(145deg, #f7f8f5 0%, #eef0ef 48%, #dfe3e1 100%)';
    const value = wallpaper || fallback;
    if (value.startsWith('linear-gradient') || value.startsWith('radial-gradient')) {
        return { background: value };
    }
    return {
        backgroundImage: `url(${value})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    };
}

interface AppTheme {
    screen: string;
    header: string;
    border: string;
    muted: string;
    accent: string;
    accentSoft: string;
    accentHex: string;
    dark?: boolean;
}

const APP_THEMES: Record<string, AppTheme> = {
    wechat: {
        screen: 'bg-[#ededed] text-[#111111]',
        header: 'bg-[#f7f7f7]/96 text-[#111111]',
        border: 'border-black/8',
        muted: 'text-[#8a8a8a]',
        accent: 'text-[#07c160]',
        accentSoft: 'bg-[#07c160]/10',
        accentHex: '#07c160',
    },
    qq: {
        screen: 'bg-[#f4f8ff] text-[#1f2a3d]',
        header: 'bg-white text-[#1f2a3d]',
        border: 'border-[#eef2f7]',
        muted: 'text-[#8491a5]',
        accent: 'text-[#2f8cff]',
        accentSoft: 'bg-[#edf6ff]',
        accentHex: '#2F8CFF',
    },
    messages: {
        screen: 'bg-[#eef7f1] text-[#1d3028]',
        header: 'bg-[#f8fffb]/92 text-[#1d3028]',
        border: 'border-emerald-900/10',
        muted: 'text-[#607168]',
        accent: 'text-[#13935f]',
        accentSoft: 'bg-emerald-500/12',
        accentHex: '#24b26b',
    },
    notes: {
        screen: 'bg-[#fff7d8] text-[#3d3320]',
        header: 'bg-[#fff9e6]/94 text-[#3d3320]',
        border: 'border-amber-900/12',
        muted: 'text-[#806f4f]',
        accent: 'text-[#b7791f]',
        accentSoft: 'bg-amber-500/14',
        accentHex: '#d6a035',
    },
    photos: {
        screen: 'bg-[#f7f3ff] text-[#30233f]',
        header: 'bg-[#fffaff]/92 text-[#30233f]',
        border: 'border-fuchsia-900/10',
        muted: 'text-[#766783]',
        accent: 'text-[#b53885]',
        accentSoft: 'bg-fuchsia-500/12',
        accentHex: '#c64f97',
    },
    calendar: {
        screen: 'bg-[#fff3f1] text-[#3f2624]',
        header: 'bg-[#fff9f8]/94 text-[#3f2624]',
        border: 'border-rose-900/10',
        muted: 'text-[#8a6560]',
        accent: 'text-[#cf3f44]',
        accentSoft: 'bg-rose-500/12',
        accentHex: '#dc4f57',
    },
    browser: {
        screen: 'bg-[#eff7ff] text-[#1e3146]',
        header: 'bg-[#f8fbff]/94 text-[#1e3146]',
        border: 'border-blue-900/10',
        muted: 'text-[#5e7288]',
        accent: 'text-[#2678cb]',
        accentSoft: 'bg-blue-500/12',
        accentHex: '#2d86dc',
    },
    music: {
        screen: 'bg-[#fff0f4] text-[#3f2430]',
        header: 'bg-[#fff8fa]/92 text-[#3f2430]',
        border: 'border-pink-900/10',
        muted: 'text-[#8b6674]',
        accent: 'text-[#cc3f76]',
        accentSoft: 'bg-pink-500/12',
        accentHex: '#d94e83',
    },
    maps: {
        screen: 'bg-[#f0f4ff] text-[#25304a]',
        header: 'bg-[#f8faff]/92 text-[#25304a]',
        border: 'border-indigo-900/10',
        muted: 'text-[#65708a]',
        accent: 'text-[#5a63d8]',
        accentSoft: 'bg-indigo-500/12',
        accentHex: '#656ee8',
    },
    clock: {
        screen: 'bg-[#101319] text-[#f6f7fb]',
        header: 'bg-[#171b23]/94 text-[#f6f7fb]',
        border: 'border-white/10',
        muted: 'text-white/55',
        accent: 'text-[#9ec7ff]',
        accentSoft: 'bg-white/10',
        accentHex: '#8bbcff',
        dark: true,
    },
    wallet: {
        screen: 'bg-[#eef8ef] text-[#1e3928]',
        header: 'bg-[#f8fff8]/92 text-[#1e3928]',
        border: 'border-emerald-900/10',
        muted: 'text-[#607a67]',
        accent: 'text-[#15915e]',
        accentSoft: 'bg-emerald-500/12',
        accentHex: '#23a66d',
    },
    mail: {
        screen: 'bg-[#eef6ff] text-[#1f3044]',
        header: 'bg-[#f8fbff]/94 text-[#1f3044]',
        border: 'border-sky-900/10',
        muted: 'text-[#607388]',
        accent: 'text-[#226dba]',
        accentSoft: 'bg-sky-500/12',
        accentHex: '#2c7ed0',
    },
    health: {
        screen: 'bg-[#effaf5] text-[#20392f]',
        header: 'bg-[#f9fffc]/94 text-[#20392f]',
        border: 'border-teal-900/10',
        muted: 'text-[#5f7a6d]',
        accent: 'text-[#138c72]',
        accentSoft: 'bg-teal-500/12',
        accentHex: '#20a88a',
    },
    settings: {
        screen: 'bg-[#f3f4f5] text-[#24282d]',
        header: 'bg-[#fbfbfc]/94 text-[#24282d]',
        border: 'border-zinc-900/10',
        muted: 'text-[#6c7076]',
        accent: 'text-[#565c66]',
        accentSoft: 'bg-zinc-500/12',
        accentHex: '#626a75',
    },
    social: {
        screen: 'bg-[#f6f1ff] text-[#2f2542]',
        header: 'bg-[#fcf9ff]/94 text-[#2f2542]',
        border: 'border-violet-900/10',
        muted: 'text-[#746683]',
        accent: 'text-[#8152d2]',
        accentSoft: 'bg-violet-500/12',
        accentHex: '#8c5bea',
    },
    video: {
        screen: 'bg-[#fff2ed] text-[#442a24]',
        header: 'bg-[#fff9f6]/94 text-[#442a24]',
        border: 'border-orange-900/10',
        muted: 'text-[#8d675e]',
        accent: 'text-[#d55335]',
        accentSoft: 'bg-orange-500/12',
        accentHex: '#e45d3e',
    },
    shopping: {
        screen: 'bg-[#fff4ef] text-[#432b25]',
        header: 'bg-[#fffaf7]/94 text-[#432b25]',
        border: 'border-rose-900/10',
        muted: 'text-[#86685f]',
        accent: 'text-[#c75a52]',
        accentSoft: 'bg-rose-500/12',
        accentHex: '#d95d57',
    },
    delivery: {
        screen: 'bg-[#fff8df] text-[#42331b]',
        header: 'bg-[#fffbee]/94 text-[#42331b]',
        border: 'border-orange-900/10',
        muted: 'text-[#826d4b]',
        accent: 'text-[#c57718]',
        accentSoft: 'bg-orange-500/14',
        accentHex: '#dc8a21',
    },
    ride: {
        screen: 'bg-[#eef8ff] text-[#203347]',
        header: 'bg-[#f8fcff]/94 text-[#203347]',
        border: 'border-cyan-900/10',
        muted: 'text-[#607487]',
        accent: 'text-[#2374b8]',
        accentSoft: 'bg-cyan-500/12',
        accentHex: '#2a89cf',
    },
    diary: {
        screen: 'bg-[#fff1f6] text-[#422633]',
        header: 'bg-[#fff9fb]/94 text-[#422633]',
        border: 'border-pink-900/10',
        muted: 'text-[#866474]',
        accent: 'text-[#c84f7c]',
        accentSoft: 'bg-pink-500/12',
        accentHex: '#d75c89',
    },
    homekit: {
        screen: 'bg-[#effaf9] text-[#203937]',
        header: 'bg-[#f8fffe]/94 text-[#203937]',
        border: 'border-teal-900/10',
        muted: 'text-[#607977]',
        accent: 'text-[#168f91]',
        accentSoft: 'bg-teal-500/12',
        accentHex: '#1ca0a4',
    },
    reading: {
        screen: 'bg-[#f1f3fa] text-[#2b3040]',
        header: 'bg-[#fafbff]/94 text-[#2b3040]',
        border: 'border-slate-900/10',
        muted: 'text-[#666d7e]',
        accent: 'text-[#5867b3]',
        accentSoft: 'bg-indigo-500/12',
        accentHex: '#6572c4',
    },
    study: {
        screen: 'bg-[#f4faec] text-[#2b3d24]',
        header: 'bg-[#fbfff7]/94 text-[#2b3d24]',
        border: 'border-green-900/10',
        muted: 'text-[#667a5e]',
        accent: 'text-[#4b8b2f]',
        accentSoft: 'bg-lime-500/14',
        accentHex: '#69a83c',
    },
    files: {
        screen: 'bg-[#f2f6fb] text-[#263342]',
        header: 'bg-[#fafcff]/94 text-[#263342]',
        border: 'border-slate-900/10',
        muted: 'text-[#637284]',
        accent: 'text-[#4b6f9d]',
        accentSoft: 'bg-blue-500/12',
        accentHex: '#5b7fb1',
    },
    weather: {
        screen: 'bg-[#eef8ff] text-[#233547]',
        header: 'bg-[#f8fcff]/94 text-[#233547]',
        border: 'border-sky-900/10',
        muted: 'text-[#60778b]',
        accent: 'text-[#2b83c4]',
        accentSoft: 'bg-sky-500/12',
        accentHex: '#48a2dd',
    },
    pstation: {
        screen: 'bg-[#eff7ff] text-[#20334a]',
        header: 'bg-[#f8fcff]/94 text-[#20334a]',
        border: 'border-blue-950/10',
        muted: 'text-[#62768c]',
        accent: 'text-[#1f73d3]',
        accentSoft: 'bg-blue-500/12',
        accentHex: '#2f7de1',
    },
    gacha: {
        screen: 'bg-[#f2f0ff] text-[#272342]',
        header: 'bg-[#fbfaff]/94 text-[#272342]',
        border: 'border-violet-950/10',
        muted: 'text-[#6f6a86]',
        accent: 'text-[#7358d8]',
        accentSoft: 'bg-violet-500/12',
        accentHex: '#7f63ea',
    },
    rhythm: {
        screen: 'bg-[#f2fbff] text-[#243344]',
        header: 'bg-[#fbfdff]/94 text-[#243344]',
        border: 'border-cyan-950/10',
        muted: 'text-[#647586]',
        accent: 'text-[#257fc0]',
        accentSoft: 'bg-cyan-500/12',
        accentHex: '#2d9bd3',
    },
    farmgame: {
        screen: 'bg-[#f3faed] text-[#273c25]',
        header: 'bg-[#fbfff7]/94 text-[#273c25]',
        border: 'border-emerald-950/10',
        muted: 'text-[#667a5e]',
        accent: 'text-[#4c8b34]',
        accentSoft: 'bg-emerald-500/12',
        accentHex: '#5e9b3f',
    },
    battle: {
        screen: 'bg-[#171b22] text-[#f8fafc]',
        header: 'bg-[#20252d]/94 text-[#f8fafc]',
        border: 'border-white/10',
        muted: 'text-white/58',
        accent: 'text-[#ff8a6a]',
        accentSoft: 'bg-red-500/14',
        accentHex: '#e75d49',
        dark: true,
    },
    puzzle: {
        screen: 'bg-[#eef4ff] text-[#24314a]',
        header: 'bg-[#f8fbff]/94 text-[#24314a]',
        border: 'border-indigo-950/10',
        muted: 'text-[#64708a]',
        accent: 'text-[#526bd7]',
        accentSoft: 'bg-indigo-500/12',
        accentHex: '#6277e5',
    },
};

const DEFAULT_APP_THEME: AppTheme = {
    screen: 'bg-[#f5f3ff] text-[#2c2642]',
    header: 'bg-[#fbfaff]/94 text-[#2c2642]',
    border: 'border-violet-900/10',
    muted: 'text-[#6e6683]',
    accent: 'text-[#7154cf]',
    accentSoft: 'bg-violet-500/12',
    accentHex: '#7154cf',
};

const SYSTEM_APP_THEME = {
    screen: 'bg-[#f3f5f8] text-[#27313f]',
    header: 'bg-[#fbfcfd]/94 text-[#27313f] backdrop-blur-xl',
    border: 'border-slate-900/10',
    muted: 'text-[#667180]',
    accent: 'story-phone-accent-text',
    accentSoft: 'story-phone-accent-soft',
};

const SYSTEM_APP_ACCENTS: Record<string, string> = {
    wechat: '#5f796b',
    qq: '#2d7df0',
    messages: '#5e796b',
    notes: '#887957',
    photos: '#7b7286',
    calendar: '#8f6d6b',
    browser: '#5f7489',
    music: '#856d79',
    maps: '#65718f',
    clock: '#67717f',
    wallet: '#617968',
    mail: '#62758a',
    health: '#5f7d75',
    settings: '#68707a',
    social: '#746b86',
    video: '#887066',
    shopping: '#8a716b',
    delivery: '#8a7a5d',
    ride: '#60798a',
    diary: '#856f7b',
    homekit: '#607b7b',
    reading: '#697187',
    study: '#6f7f61',
    files: '#677689',
    weather: '#6a7f8e',
    pstation: '#5d748a',
    gacha: '#716c88',
    rhythm: '#61798a',
    farmgame: '#687f61',
    battle: '#756d6c',
    puzzle: '#66728b',
};

const PHOTO_TILE_GRADIENTS = [
    'from-[#9bbce5] via-[#e7d4d7] to-[#f7e9c8]',
    'from-[#cfb3db] via-[#f1c3bf] to-[#f8e8b8]',
    'from-[#9ed0bf] via-[#d7e8c4] to-[#f5d4b5]',
    'from-[#b4c2e6] via-[#d8cff0] to-[#f3e0e4]',
    'from-[#e5b2b7] via-[#f0d6bc] to-[#d4e7d7]',
    'from-[#95bdd5] via-[#bfe3e0] to-[#f3e8cf]',
];

const ILLUSTRATION_TILE_GRADIENTS = [
    'from-[#7ab7ff] via-[#b9d7ff] to-[#fff0c4]',
    'from-[#8dd7e9] via-[#b8f2de] to-[#fff2b8]',
    'from-[#9e9bff] via-[#d6c5ff] to-[#ffe0ef]',
    'from-[#6bbbf1] via-[#87e1d1] to-[#f5f7ff]',
];

function getAppTheme(app?: PhoneAppDef): AppTheme {
    const baseTheme = (app && APP_THEMES[app.id]) || DEFAULT_APP_THEME;
    const accentHex = (app && SYSTEM_APP_ACCENTS[app.id]) || '#687386';
    if (app?.id === 'qq') {
        return {
            ...baseTheme,
            accent: 'story-phone-accent-text',
            accentSoft: 'story-phone-accent-soft',
            accentHex: '#2F8CFF',
            dark: false,
        };
    }
    return {
        ...baseTheme,
        ...SYSTEM_APP_THEME,
        accentHex,
        dark: false,
    };
}

function getAppIconStyle(app: PhoneAppDef | undefined, theme: AppTheme): React.CSSProperties {
    const color = app?.color?.startsWith('#') ? app.color : theme.accentHex;
    return {
        background: color,
        color: '#fff',
        boxShadow: '0 6px 16px rgba(31,41,55,0.12)',
    };
}

function getAppSystemStyle(theme: AppTheme): React.CSSProperties {
    const baseStyle = { '--story-phone-accent': theme.accentHex } as React.CSSProperties;
    if (theme.accentHex === '#2F8CFF') {
        return {
            ...baseStyle,
            '--story-phone-card': '#fff',
            '--story-phone-card-soft': '#F2F7FF',
            '--story-phone-border': '#EEF2F7',
            '--story-phone-shadow': 'none',
            '--story-phone-text': '#1F2A3D',
            '--story-phone-muted': '#8491A5',
            background: '#F4F8FF',
        } as React.CSSProperties;
    }
    return baseStyle;
}

function getClueItems(clue?: PhoneClue | null): PhoneClueItem[] {
    if (!clue?.items?.length) {
        return [{ label: '线索', value: clue?.evidenceText || clue?.title || '屏幕上还没有可读取的内容。' }];
    }
    return clue.items;
}

function itemText(item: PhoneClueItem): string {
    return [item.value, item.detail].filter(Boolean).join('\n');
}

function previewText(value: string, max = 76): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max).trimEnd()}...`;
}

function appTitle(clue: PhoneClue, fallback: string): string {
    return clue.title || `${fallback}记录`;
}

function parseConversationLines(clue: PhoneClue, charName: string) {
    const rawLines = getClueItems(clue)
        .flatMap(item => item.value.split(/\n+/).map(line => line.trim()).filter(Boolean))
        .slice(0, 8);

    const lines = rawLines.length > 0 ? rawLines : [clue.title, clue.evidenceText].filter(Boolean);
    return lines.map((raw, index) => {
        const match = raw.match(/^([^:：]{1,12})[:：]\s*(.+)$/);
        const speaker = match?.[1] || (index % 2 === 0 ? clue.subtitle || '对方' : charName);
        const text = match?.[2] || raw;
        const mine = speaker === '我' || speaker === charName || /^(me|i)$/i.test(speaker);
        return { speaker, text, mine };
    });
}

type StoryPhoneNestedRouteName = 'home' | 'thread' | 'moments' | 'wallet' | 'contacts' | 'search' | 'space' | 'files' | 'profile';

interface StoryPhoneNestedRoute {
    name: StoryPhoneNestedRouteName;
    itemIndex?: number;
}

const DEFAULT_NESTED_ROUTE: StoryPhoneNestedRoute = { name: 'home' };

function routeTitle(routeName: StoryPhoneNestedRouteName, fallback: string): string {
    const labels: Record<StoryPhoneNestedRouteName, string> = {
        home: fallback,
        thread: fallback,
        moments: '朋友圈',
        wallet: '支付',
        contacts: '通讯录',
        search: '搜索',
        space: 'QQ空间',
        files: '文件',
        profile: '资料',
    };
    return labels[routeName] || fallback;
}

function getRouteItem(items: PhoneClueItem[], index?: number): PhoneClueItem {
    return items[Math.max(0, Math.min(index ?? 0, items.length - 1))] || items[0] || { label: '线索', value: '这里还没有可读取的内容。' };
}

function parseThreadItemLines(item: PhoneClueItem, charName: string, otherName: string) {
    const rawLines = itemText(item)
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, 9);
    const lines = rawLines.length > 0 ? rawLines : [item.value || item.detail || '消息还停在屏幕上。'];

    return lines.map((raw, index) => {
        const match = raw.match(/^([^:：]{1,14})[:：]\s*(.+)$/);
        const speaker = match?.[1] || (index % 2 === 0 ? otherName : charName);
        const text = match?.[2] || raw;
        const mine = speaker === '我' || speaker === charName || /^(me|i|mine|self)$/i.test(speaker);
        return { speaker, text, mine };
    });
}

function getItemPreview(item: PhoneClueItem, max = 70): string {
    return previewText(itemText(item) || item.value || item.detail || item.label, max);
}

const RouteBackButton: React.FC<{
    compact: boolean;
    theme: AppTheme;
    title: string;
    onBack?: () => void;
}> = ({ compact, theme, title, onBack }) => (
    <div className={`mb-3 flex items-center gap-2 rounded-[1.2rem] border ${theme.border} bg-white/72 p-2.5 shadow-sm`}>
        <button
            type="button"
            onClick={onBack}
            className={`flex ${compact ? 'h-7 w-7' : 'h-8 w-8'} shrink-0 items-center justify-center rounded-full ${theme.accentSoft} ${theme.accent} active:scale-95 disabled:opacity-50`}
            disabled={!onBack}
            aria-label="返回上一层"
        >
            <CaretLeft weight="bold" className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
            <div className={`${compact ? 'text-[11px]' : 'text-sm'} truncate font-bold`}>{title}</div>
            <div className={`${compact ? 'text-[8px]' : 'text-[10px]'} ${theme.muted}`}>屏幕内页</div>
        </div>
    </div>
);

const PhoneThreadDetail: React.FC<{
    item: PhoneClueItem;
    charName: string;
    charAvatar?: string;
    compact: boolean;
    theme: AppTheme;
    platform: 'wechat' | 'qq';
    onBack?: () => void;
}> = ({ item, charName, charAvatar, compact, theme, platform, onBack }) => {
    const lines = parseThreadItemLines(item, charName, item.label || '对方');
    const mineBubble = platform === 'wechat' ? 'bg-[#95ec69] text-[#132015]' : 'bg-[#2d7df0] text-white';
    const otherBubble = platform === 'wechat' ? 'bg-white text-[#1f2d25]' : 'bg-white text-[#1d304a]';

    if (platform === 'qq') {
        const qqThreadInset = compact ? '-mx-3 -my-3' : '-mx-4 -my-4';
        const qqThreadPad = compact ? 'px-3' : 'px-4';
        const qqThreadSubtitle = item.detail ? `${item.detail} · QQ漫游记录` : '手机在线 · QQ漫游记录';
        return (
            <div className={`${qqThreadInset} min-h-full bg-[#F4F8FF] text-[#1F2A3D]`}>
                <div className={`flex h-12 items-center gap-2 border-b bg-white ${qqThreadPad}`} style={{ borderColor: '#EEF2F7' }}>
                    <button
                        type="button"
                        onClick={onBack}
                        disabled={!onBack}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#2F8CFF] active:bg-[#F2F7FF] disabled:opacity-50"
                        aria-label="返回上一层"
                    >
                        <CaretLeft weight="bold" className="h-[18px] w-[18px]" />
                    </button>
                    <div className="min-w-0 flex-1 text-center">
                        <div className={`${compact ? 'text-[13px]' : 'text-[15px]'} truncate font-semibold text-[#1F2A3D]`}>{item.label || routeTitle('thread', '聊天')}</div>
                        <div className={`${compact ? 'text-[8px]' : 'text-[10px]'} truncate text-[#8491A5]`}>{qqThreadSubtitle}</div>
                    </div>
                    <DotsThree weight="bold" className="h-5 w-5 shrink-0 text-[#2F8CFF]" />
                </div>
                <div className={`${qqThreadPad} py-3`}>
                    <div className="overflow-hidden rounded-[18px] bg-white">
                        <div className="flex items-center gap-3 border-b px-3 py-3" style={{ borderColor: '#EEF2F7' }}>
                            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#50b7ff,#2477ef)] text-sm font-bold text-white shadow-sm">
                                {(item.label || 'Q').slice(0, 1)}
                                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#36d16a]" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className={`${compact ? 'text-[12px]' : 'text-sm'} block truncate font-bold text-[#17233c]`}>{item.label || 'QQ聊天'}</span>
                                <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} block truncate text-[#7d8da5]`}>{qqThreadSubtitle}</span>
                            </span>
                            <DotsThree weight="bold" className="h-5 w-5 text-[#5b6f91]" />
                        </div>
                    <div className={`${compact ? 'space-y-2 px-2.5 py-3' : 'space-y-2.5 px-3 py-3.5'} bg-[#F4F8FF]`}>
                        <div className={`mx-auto w-fit rounded-full bg-white/72 px-2.5 py-1 ${compact ? 'text-[8px]' : 'text-[10px]'} text-[#8a99ad] shadow-sm`}>
                            {item.detail || '聊天记录已同步到本机'}
                        </div>
                        {lines.map((line, index) => (
                            <div key={`${line.speaker}-${index}`} className={`flex items-end gap-2 ${line.mine ? 'justify-end' : 'justify-start'}`}>
                                {!line.mine && (
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8dc9ff,#2d7df0)] text-[10px] font-bold text-white shadow-sm">
                                        {(line.speaker || item.label || '?').slice(0, 1)}
                                    </span>
                                )}
                                <div
                                    className={`max-w-[78%] px-3 py-2 shadow-sm ${line.mine ? 'rounded-[1.05rem] rounded-br-sm text-white' : 'rounded-[1.05rem] rounded-bl-sm bg-white text-[#17233c]'}`}
                                    style={line.mine ? { background: 'linear-gradient(135deg, #2d8cff 0%, #176fe8 100%)' } : undefined}
                                >
                                    {!line.mine && <div className={`${compact ? 'text-[8px]' : 'text-[9px]'} mb-0.5 font-semibold text-[#2d7df0]`}>{line.speaker}</div>}
                                    <div className={`${compact ? 'text-[10px]' : 'text-xs'} whitespace-pre-wrap leading-relaxed`}>{line.text}</div>
                                </div>
                                {line.mine && (
                                    <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-200 shadow-sm">
                                        {charAvatar ? <img src={charAvatar} alt={charName} className="h-full w-full object-cover" /> : <UserCircle className="h-full w-full p-1 text-slate-500" />}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 border-t border-[#c8d9ee] bg-[#fafdff]/95 px-3 py-2.5 text-[#6b7890]">
                        <Waveform className="h-4 w-4 shrink-0" />
                        <span className={`min-w-0 flex-1 rounded-full bg-[#eef4fb] px-3 py-1.5 ${compact ? 'text-[9px]' : 'text-[11px]'} text-[#8a99ad]`}>只读漫游记录，不能发送消息</span>
                        <Plus className="h-4 w-4 shrink-0" />
                        <PaperPlaneTilt weight="fill" className="h-4 w-4 shrink-0 text-[#2d7df0]" />
                    </div>
                </div>
            </div>
            </div>
        );
    }

    return (
        <div>
            <RouteBackButton compact={compact} theme={theme} title={item.label || routeTitle('thread', '聊天')} onBack={onBack} />
            <div className={`rounded-[1.35rem] border ${theme.border} bg-white/42 p-3`}>
                <div className={`mb-3 flex items-center justify-center gap-2 ${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>
                    <LockKey className="h-3.5 w-3.5" />
                    <span>{item.detail || '聊天记录仍停在这里'}</span>
                </div>
                <div className={`${compact ? 'space-y-2' : 'space-y-2.5'}`}>
                    {lines.map((line, index) => (
                        <div key={`${line.speaker}-${index}`} className={`flex items-end gap-2 ${line.mine ? 'justify-end' : 'justify-start'}`}>
                            {!line.mine && (
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/80 text-[10px] font-bold text-slate-500 shadow-sm">
                                    {(line.speaker || item.label || '?').slice(0, 1)}
                                </span>
                            )}
                            <div className={`max-w-[78%] rounded-2xl px-3 py-2 shadow-sm ${line.mine ? mineBubble : otherBubble}`}>
                                {!line.mine && <div className={`${compact ? 'text-[8px]' : 'text-[9px]'} mb-0.5 font-semibold ${platform === 'wechat' ? 'text-[#14915a]' : 'text-[#2474d8]'}`}>{line.speaker}</div>}
                                <div className={`${compact ? 'text-[10px]' : 'text-xs'} whitespace-pre-wrap leading-relaxed`}>{line.text}</div>
                            </div>
                            {line.mine && (
                                <span className="h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-slate-200 shadow-sm">
                                    {charAvatar ? <img src={charAvatar} alt={charName} className="h-full w-full object-cover" /> : <UserCircle className="h-full w-full p-1 text-slate-500" />}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
                <div className={`mt-3 flex items-center gap-2 rounded-full border ${theme.border} bg-white/72 px-3 py-2 ${theme.muted}`}>
                    <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} min-w-0 flex-1 truncate`}>草稿、语音和撤回记录还在输入栏附近</span>
                    <PaperPlaneTilt weight="fill" className={`h-4 w-4 ${theme.accent}`} />
                </div>
            </div>
        </div>
    );
};

interface AppContentProps {
    app: PhoneAppDef;
    clue: PhoneClue;
    charName: string;
    charAvatar?: string;
    compact: boolean;
    theme: AppTheme;
    nestedRoute?: StoryPhoneNestedRoute;
    onNavigate?: (route: StoryPhoneNestedRoute) => void;
    onVisibleContentChange?: (clue: PhoneClue | null) => void;
}

const WeChatScreen: React.FC<AppContentProps> = ({ clue, charName, charAvatar, compact, onVisibleContentChange }) => {
    const wechatData = React.useMemo(
        () => buildWeChatDataFromClue(clue, charName, charAvatar),
        [charAvatar, charName, clue],
    );

    const handleVisibleContentChange = React.useCallback((visible: WeChatVisibleContent) => {
        onVisibleContentChange?.({
            ...clue,
            title: visible.title,
            subtitle: visible.pageType,
            items: visible.items,
            evidenceText: visible.content,
            insertSummary: visible.summary,
            wechatData: undefined,
        });
    }, [clue, onVisibleContentChange]);

    return <WeChatApp data={wechatData} compact={compact} onVisibleContentChange={handleVisibleContentChange} />;
};

const QQ_LIGHT_BLUE = '#F2F7FF';
const QQ_PAGE_BG = '#F4F8FF';
const QQ_DIVIDER = '#EEF2F7';
const QQ_RED = '#FF4D5A';

type QQEntryKind = 'chat' | 'group' | 'space' | 'file' | 'profile' | 'album' | 'favorite';

const QQ_AVATAR_BACKGROUNDS = [
    'linear-gradient(135deg, #4db8ff 0%, #1e74ec 100%)',
    'linear-gradient(135deg, #62d4ff 0%, #2586f5 100%)',
    'linear-gradient(135deg, #8b9cff 0%, #5266e8 100%)',
    'linear-gradient(135deg, #6cd6c8 0%, #2e8fdc 100%)',
    'linear-gradient(135deg, #ffa75d 0%, #ff6f7b 100%)',
    'linear-gradient(135deg, #93c7ff 0%, #3d7bff 100%)',
];

function getQQEntryKind(item: PhoneClueItem): QQEntryKind {
    const raw = `${item.label} ${item.detail || ''} ${item.value || ''}`;
    if (/文件|群文件|文档|pdf|doc|zip|云盘|微云/i.test(raw)) return 'file';
    if (/群|班级|社团|频道|家族|工作组/.test(`${item.label} ${item.detail || ''}`)) return 'group';
    if (/空间|说说|动态|留言|访客/.test(raw)) return 'space';
    if (/相册|照片|图片/.test(raw)) return 'album';
    if (/收藏|书签/.test(raw)) return 'favorite';
    if (/资料|签名|等级|名片|备注|Q龄/i.test(raw)) return 'profile';
    return 'chat';
}

function getQQEntryMeta(item: PhoneClueItem, index: number): {
    kind: QQEntryKind;
    tag: string;
    icon: StoryPhoneIcon;
    background: string;
} {
    const kind = getQQEntryKind(item);
    const iconMap: Record<QQEntryKind, StoryPhoneIcon> = {
        chat: ChatCircleText,
        group: UsersThree,
        space: Star,
        file: Folder,
        profile: UserCircle,
        album: ImageSquare,
        favorite: BookmarkSimple,
    };
    const tagMap: Record<QQEntryKind, string> = {
        chat: '好友',
        group: '群聊',
        space: '空间',
        file: '文件',
        profile: '资料',
        album: '相册',
        favorite: '收藏',
    };
    return {
        kind,
        tag: tagMap[kind],
        icon: iconMap[kind],
        background: QQ_AVATAR_BACKGROUNDS[index % QQ_AVATAR_BACKGROUNDS.length],
    };
}

function getQQItemTime(item: PhoneClueItem, fallback?: string): string {
    const source = item.detail || item.value || '';
    const match = source.match(/(\d{1,2}:\d{2}|刚刚|昨天|前天|周[一二三四五六日天]|星期[一二三四五六日天]|凌晨|上午|下午|晚上)/);
    return match?.[0] || fallback || '刚刚';
}

const QQ_SPACE_METRIC_LABEL_RE = /^(赞|点赞|点赞数|评论|评论数|转发|转发数|访客|访客数|访问|访问数|留言|留言数|说说|说说数|相册|相册数|浏览|浏览量)$/;
const QQ_SPACE_STAT_ALIASES: Record<string, string[]> = {
    说说: ['说说', '动态'],
    相册: ['相册', '照片', '图片'],
    留言: ['留言', '评论'],
    访客: ['访客', '访问', '浏览'],
};

function isQQMetricOnlyLine(line: string): boolean {
    const normalized = line.replace(/\s+/g, '').trim();
    if (!normalized) return false;
    if (/^\d{1,5}$/.test(normalized)) return true;
    if (/^\d{1,5}(个赞|条评论|次转发|位访客|个访客|条留言|条说说|个相册|次访问|次浏览)$/.test(normalized)) return true;
    return /^(赞|点赞|点赞数|评论|评论数|转发|转发数|访客|访客数|访问|访问数|留言|留言数|说说|说说数|相册|相册数|浏览|浏览量)[:：]?\d{1,5}(个|条|次|人|位)?$/.test(normalized);
}

function isQQSpaceMetricItem(item: PhoneClueItem): boolean {
    const label = item.label.trim();
    const lines = item.value
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean);
    return QQ_SPACE_METRIC_LABEL_RE.test(label) && lines.length > 0 && lines.every(isQQMetricOnlyLine);
}

function getQQSpaceFeedEntries(items: PhoneClueItem[]): { item: PhoneClueItem; index: number }[] {
    const entries = items
        .map((item, index) => ({ item, index }))
        .filter(entry => !isQQSpaceMetricItem(entry.item));
    return entries.length > 0 ? entries : items.map((item, index) => ({ item, index }));
}

function getQQSpacePostText(item: PhoneClueItem, fallbackName: string, max = 112): string {
    const lines = itemText(item)
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => !isQQMetricOnlyLine(line));
    const text = lines.join('\n').trim();
    if (text) return previewText(text, max);
    return `${fallbackName || item.label} 的空间动态还停在屏幕上。`;
}

function getQQSpaceStatValue(items: PhoneClueItem[], label: string, fallback: number): number {
    const aliases = QQ_SPACE_STAT_ALIASES[label] || [label];
    const metric = items.find(item => {
        const rawLabel = item.label.trim();
        return aliases.some(alias => rawLabel.includes(alias)) && isQQSpaceMetricItem(item);
    });
    const source = metric ? itemText(metric) : '';
    const match = source.match(/\d{1,5}/);
    if (match) return Number(match[0]);
    return fallback;
}

const QQScreen: React.FC<AppContentProps> = ({ clue, charName, charAvatar, compact, theme, nestedRoute = DEFAULT_NESTED_ROUTE, onNavigate }) => {
    const items = getClueItems(clue).slice(0, compact ? 8 : 12);
    const selectedItem = getRouteItem(items, nestedRoute.itemIndex);
    const goHome = onNavigate ? () => onNavigate(DEFAULT_NESTED_ROUTE) : undefined;
    const pageInset = compact ? '-mx-3 -my-3' : '-mx-4 -my-4';
    const pagePad = compact ? 'px-3' : 'px-4';
    const qqNumber = `QQ号 ${String(10000 + charName.length * 137 + items.length * 11)}`;
    const spaceFeedEntries = getQQSpaceFeedEntries(items);
    const spaceStats = ['说说', '相册', '留言', '访客'].map((label, index) => ({
        label,
        value: getQQSpaceStatValue(items, label, Math.max(1, spaceFeedEntries.length + index + 1)),
    }));

    if (nestedRoute.name === 'thread') {
        return <PhoneThreadDetail item={selectedItem} charName={charName} charAvatar={charAvatar} compact={compact} theme={theme} platform="qq" onBack={goHome} />;
    }

    const HeaderButton = ({ label, icon: Icon, onClick }: { label: string; icon: StoryPhoneIcon; onClick?: () => void }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#2F8CFF] active:bg-[#F2F7FF] disabled:opacity-50"
            aria-label={label}
        >
            <Icon weight="bold" className="h-[18px] w-[18px]" />
        </button>
    );

    const FlatHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
        <div className={`flex h-12 items-center gap-2 border-b bg-white ${pagePad}`} style={{ borderColor: QQ_DIVIDER }}>
            <button
                type="button"
                onClick={goHome}
                disabled={!goHome}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#2F8CFF] active:bg-[#F2F7FF] disabled:opacity-50"
                aria-label="返回上一层"
            >
                <CaretLeft weight="bold" className="h-[18px] w-[18px]" />
            </button>
            <span className={`${compact ? 'text-sm' : 'text-base'} min-w-0 flex-1 truncate font-semibold text-[#1F2A3D]`}>{title}</span>
            {right || <span className="w-8" />}
        </div>
    );

    if (nestedRoute.name === 'space') {
        return (
            <div className={`${pageInset} min-h-full text-[#1F2A3D]`} style={{ backgroundColor: QQ_PAGE_BG }}>
                <FlatHeader
                    title="QQ空间"
                    right={
                        <div className="flex items-center gap-1">
                            <button type="button" className="rounded-full bg-[#F2F7FF] px-2.5 py-1 text-[10px] font-semibold text-[#2F8CFF]">访客</button>
                        </div>
                    }
                />
                <div className="bg-white">
                    <div className="relative h-28 bg-[linear-gradient(135deg,#12A8FF_0%,#2F8CFF_54%,#BFEAFF_100%)]">
                        <div className="absolute bottom-3 left-4 text-white">
                            <div className={`${compact ? 'text-lg' : 'text-xl'} font-bold`}>QQ空间</div>
                            <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} text-white/82`}>{clue.subtitle || '好友可见 · 最近有访问痕迹'}</div>
                        </div>
                    </div>
                    <div className={`${pagePad} pb-3`}>
                        <div className="-mt-7 flex items-end gap-3">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border-4 border-white bg-[#2F8CFF] text-xl font-black text-white">
                                {charAvatar ? <img src={charAvatar} alt={charName} className="h-full w-full object-cover" /> : charName.slice(0, 1)}
                            </span>
                            <div className="min-w-0 flex-1 pb-1">
                                <div className={`${compact ? 'text-sm' : 'text-base'} truncate font-semibold text-[#1F2A3D]`}>{charName}</div>
                                <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} truncate text-[#8491A5]`}>{qqNumber} · {selectedItem.detail || '个性签名还停在旧状态'}</div>
                            </div>
                            <button type="button" className="mb-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold text-[#2F8CFF]" style={{ borderColor: QQ_DIVIDER }}>装扮</button>
                        </div>
                        <div className={`${compact ? 'mt-3' : 'mt-4'} grid grid-cols-4 rounded-[18px] text-center`} style={{ backgroundColor: QQ_LIGHT_BLUE }}>
                            {spaceStats.map(stat => (
                                <span key={stat.label} className="border-r px-2 py-2 last:border-r-0" style={{ borderColor: '#fff' }}>
                                    <span className={`${compact ? 'text-xs' : 'text-sm'} block font-semibold text-[#1F2A3D]`}>{stat.value}</span>
                                    <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} text-[#8491A5]`}>{stat.label}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className={`${pagePad} space-y-2 pb-4 pt-2`}>
                    {spaceFeedEntries.map(({ item, index }) => (
                        <button
                            key={`${item.label}-space-${index}`}
                            type="button"
                            onClick={() => onNavigate?.({ name: 'thread', itemIndex: index })}
                            disabled={!onNavigate}
                            className="w-full rounded-[18px] bg-white p-3 text-left active:bg-[#F8FBFF] disabled:active:bg-white"
                        >
                            <div className="flex gap-2.5">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: QQ_AVATAR_BACKGROUNDS[index % QQ_AVATAR_BACKGROUNDS.length] }}>
                                    {(item.label || charName).slice(0, 1)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center justify-between gap-2">
                                        <span className={`${compact ? 'text-[12px]' : 'text-sm'} truncate font-semibold text-[#1F2A3D]`}>{item.label}</span>
                                        <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} shrink-0 text-[#8491A5]`}>{getQQItemTime(item, clue.timestamp)}</span>
                                    </span>
                                    <span className={`${compact ? 'text-[10px]' : 'text-xs'} mt-1 line-clamp-3 block leading-relaxed text-[#1F2A3D]`}>{getQQSpacePostText(item, charName)}</span>
                                    <span className="mt-2 grid grid-cols-3 gap-1.5">
                                        {[0, 1, 2].map(tile => (
                                            <span key={tile} className="h-12 rounded-xl bg-[linear-gradient(135deg,#D9EEFF,#F7FBFF)]" />
                                        ))}
                                    </span>
                                    <span className="mt-2 flex items-center gap-4 text-[10px] font-medium text-[#8491A5]">
                                        <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />赞</span>
                                        <span className="inline-flex items-center gap-1"><ChatCircleText className="h-3.5 w-3.5" />评论</span>
                                        <span className="inline-flex items-center gap-1"><ShareNetwork className="h-3.5 w-3.5" />转发</span>
                                    </span>
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (nestedRoute.name === 'files' || nestedRoute.name === 'profile' || nestedRoute.name === 'search' || nestedRoute.name === 'contacts') {
        const title = nestedRoute.name === 'files' ? '文件' : nestedRoute.name === 'search' ? '搜索' : '联系人';
        const leadItem = selectedItem || items[0];
        return (
            <div className={`${pageInset} min-h-full text-[#1F2A3D]`} style={{ backgroundColor: QQ_PAGE_BG }}>
                <FlatHeader title={title} />
                <div className={`${pagePad} py-3`}>
                    {nestedRoute.name === 'search' ? (
                        <button type="button" className="flex h-9 w-full items-center gap-2 rounded-[18px] px-3 text-left" style={{ backgroundColor: QQ_LIGHT_BLUE }}>
                            <MagnifyingGlass className="h-4 w-4 shrink-0 text-[#2F8CFF]" />
                            <span className={`${compact ? 'text-[10px]' : 'text-xs'} truncate text-[#8491A5]`}>搜索好友 / 群聊 / 聊天记录</span>
                        </button>
                    ) : (
                        <div className="rounded-[18px] bg-white p-3">
                            <div className="flex items-center gap-3">
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-[#2F8CFF] text-lg font-black text-white">
                                    {nestedRoute.name === 'files' ? <Folder weight="fill" className="h-6 w-6" /> : charAvatar ? <img src={charAvatar} alt={charName} className="h-full w-full object-cover" /> : (leadItem?.label || charName).slice(0, 1)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className={`${compact ? 'text-sm' : 'text-base'} block truncate font-semibold text-[#1F2A3D]`}>{nestedRoute.name === 'files' ? '文件助手' : leadItem?.label || charName}</span>
                                    <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate text-[#8491A5]`}>{leadItem?.detail || (nestedRoute.name === 'files' ? '群文件、离线文件、微云记录' : `${qqNumber} · 资料卡`)}</span>
                                </span>
                            </div>
                        </div>
                    )}
                </div>
                <div className="bg-white">
                    {items.map((item, index) => {
                        const meta = getQQEntryMeta(item, index);
                        const Icon = nestedRoute.name === 'files' ? Folder : meta.icon;
                        return (
                            <button
                                key={`${item.label}-qq-file-${index}`}
                                type="button"
                                onClick={() => onNavigate?.({ name: 'thread', itemIndex: index })}
                                disabled={!onNavigate}
                                className="flex h-[68px] w-full items-center gap-3 border-b px-4 text-left last:border-b-0 active:bg-[#F8FBFF] disabled:active:bg-white"
                                style={{ borderColor: QQ_DIVIDER }}
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-[#2F8CFF]" style={{ backgroundColor: QQ_LIGHT_BLUE }}>
                                    <Icon weight="regular" className="h-5 w-5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className={`${compact ? 'text-[12px]' : 'text-sm'} block truncate font-semibold text-[#1F2A3D]`}>{item.label}</span>
                                    <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate text-[#8491A5]`}>{item.detail || getItemPreview(item, 58)}</span>
                                </span>
                                <CaretRight className="h-4 w-4 text-[#8491A5]" />
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className={`${pageInset} min-h-full text-[#1F2A3D]`} style={{ backgroundColor: QQ_PAGE_BG }}>
            <div className="border-b bg-white" style={{ borderColor: QQ_DIVIDER }}>
                <div className={`flex h-12 items-center gap-3 ${pagePad}`}>
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2F8CFF] text-base font-black text-white">
                        {charAvatar ? <img src={charAvatar} alt={charName} className="h-full w-full object-cover" /> : charName.slice(0, 1)}
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#37D06B]" />
                    </span>
                    <span className={`${compact ? 'text-base' : 'text-[17px]'} min-w-0 flex-1 font-semibold text-[#1F2A3D]`}>消息</span>
                    <HeaderButton label="搜索" icon={MagnifyingGlass} onClick={() => onNavigate?.({ name: 'search' })} />
                    <HeaderButton label="添加" icon={Plus} onClick={() => onNavigate?.({ name: 'contacts' })} />
                </div>
                <div className={`${pagePad} pb-3`}>
                    <button
                        type="button"
                        onClick={() => onNavigate?.({ name: 'search' })}
                        disabled={!onNavigate}
                        className="flex h-9 w-full items-center gap-2 rounded-[18px] px-3 text-left active:opacity-90 disabled:active:opacity-100"
                        style={{ backgroundColor: QQ_LIGHT_BLUE }}
                    >
                        <MagnifyingGlass className="h-4 w-4 shrink-0 text-[#2F8CFF]" />
                        <span className={`${compact ? 'text-[10px]' : 'text-[13px]'} truncate text-[#8491A5]`}>搜索好友 / 群聊 / 聊天记录</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-5 border-b bg-white px-1.5 py-2" style={{ borderColor: QQ_DIVIDER }}>
                {[
                    { name: '好友动态', route: { name: 'space' } as StoryPhoneNestedRoute, icon: ShareNetwork },
                    { name: 'QQ空间', route: { name: 'space' } as StoryPhoneNestedRoute, icon: Star },
                    { name: '联系人', route: { name: 'profile' } as StoryPhoneNestedRoute, icon: UserCircle },
                    { name: '群聊', route: { name: 'contacts' } as StoryPhoneNestedRoute, icon: UsersThree },
                    { name: '文件', route: { name: 'files' } as StoryPhoneNestedRoute, icon: Folder },
                ].map(action => {
                    const Icon = action.icon;
                    return (
                        <button
                            key={action.name}
                            type="button"
                            onClick={() => onNavigate?.(action.route)}
                            disabled={!onNavigate}
                            className="flex flex-col items-center gap-1 px-1 py-1 active:bg-[#F8FBFF] disabled:active:bg-transparent"
                        >
                            <Icon weight="regular" className="h-5 w-5 text-[#2F8CFF]" />
                            <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} whitespace-nowrap font-medium text-[#8491A5]`}>{action.name}</span>
                        </button>
                    );
                })}
            </div>

            <div className="mt-2 bg-white">
                {items.map((item, index) => {
                    const meta = getQQEntryMeta(item, index);
                    const Icon = meta.icon;
                    const useInitial = meta.kind === 'chat' || meta.kind === 'group';
                    return (
                        <button
                            key={`${item.label}-qq-${index}`}
                            type="button"
                            onClick={() => onNavigate?.({ name: 'thread', itemIndex: index })}
                            disabled={!onNavigate}
                            className="flex h-[72px] w-full items-center gap-3 border-b px-4 text-left last:border-b-0 active:bg-[#F8FBFF] disabled:active:bg-white"
                            style={{ borderColor: QQ_DIVIDER }}
                        >
                            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white" style={{ background: meta.background }}>
                                {useInitial ? (item.label.slice(0, 1) || 'Q') : <Icon weight="regular" className="h-5 w-5" />}
                                {index === 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full border-2 border-white px-1 text-center text-[9px] leading-4 text-white" style={{ backgroundColor: QQ_RED }}>2</span>}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className={`${compact ? 'text-[13px]' : 'text-[16px]'} min-w-0 truncate font-semibold text-[#1F2A3D]`}>{item.label}</span>
                                    <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} shrink-0 text-[#8491A5]`}>{getQQItemTime(item, clue.timestamp)}</span>
                                </span>
                                <span className="mt-1 flex min-w-0 items-center gap-1.5">
                                    <span className={`shrink-0 rounded bg-[#EEF7FF] px-1.5 py-0.5 ${compact ? 'text-[8px]' : 'text-[10px]'} font-medium text-[#2F8CFF]`}>{meta.tag}</span>
                                    <span className={`${compact ? 'text-[10px]' : 'text-[13px]'} min-w-0 truncate text-[#8491A5]`}>{getItemPreview(item, 62)}</span>
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="mt-2 grid grid-cols-3 border-y bg-white px-5 py-1.5" style={{ borderColor: QQ_DIVIDER }}>
                {[
                    { label: '消息', active: true, icon: ChatCircleText },
                    { label: '联系人', active: false, icon: UserCircle, route: { name: 'profile' } as StoryPhoneNestedRoute },
                    { label: '动态', active: false, icon: Star, route: { name: 'space' } as StoryPhoneNestedRoute },
                ].map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.label}
                            type="button"
                            onClick={() => onNavigate?.(tab.route || DEFAULT_NESTED_ROUTE)}
                            disabled={!onNavigate}
                            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 ${tab.active ? 'text-[#2F8CFF]' : 'text-[#8491A5]'} active:bg-[#F8FBFF] disabled:active:bg-transparent`}
                        >
                            <Icon weight={tab.active ? 'fill' : 'regular'} className="h-4 w-4" />
                            <span className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-medium`}>{tab.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const StoryPhoneAppContent: React.FC<AppContentProps> = ({ app, clue, charName, charAvatar, compact, theme, nestedRoute, onNavigate, onVisibleContentChange }) => {
    switch (app.id) {
        case 'wechat':
            return <WeChatScreen app={app} clue={clue} charName={charName} charAvatar={charAvatar} compact={compact} theme={theme} nestedRoute={nestedRoute} onNavigate={onNavigate} onVisibleContentChange={onVisibleContentChange} />;
        case 'qq':
            return <QQScreen app={app} clue={clue} charName={charName} charAvatar={charAvatar} compact={compact} theme={theme} nestedRoute={nestedRoute} onNavigate={onNavigate} />;
        case 'messages':
            return <MessagesScreen clue={clue} charName={charName} charAvatar={charAvatar} compact={compact} theme={theme} />;
        case 'notes':
            return <NotesScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'photos':
            return <PhotosScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'calendar':
            return <CalendarScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'browser':
            return <BrowserScreen clue={clue} compact={compact} theme={theme} />;
        case 'music':
            return <MusicScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'maps':
            return <MapsScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'clock':
            return <ClockScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'wallet':
            return <WalletScreen clue={clue} compact={compact} theme={theme} />;
        case 'mail':
            return <MailScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'health':
            return <HealthScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'settings':
            return <SettingsScreen clue={clue} charName={charName} charAvatar={charAvatar} compact={compact} theme={theme} />;
        case 'social':
            return <SocialScreen clue={clue} charName={charName} charAvatar={charAvatar} compact={compact} theme={theme} />;
        case 'video':
            return <VideoScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'shopping':
            return <ShoppingScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'delivery':
            return <DeliveryScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'ride':
            return <RideScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'diary':
            return <DiaryScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'homekit':
            return <SmartHomeScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'reading':
            return <ReadingScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'study':
            return <StudyScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'files':
            return <FilesScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'weather':
            return <WeatherScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'pstation':
            return <PStationScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'gacha':
            return <GachaGameScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'rhythm':
            return <RhythmGameScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'farmgame':
            return <FarmGameScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'battle':
            return <BattleGameScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        case 'puzzle':
            return <PuzzleGameScreen clue={clue} charName={charName} compact={compact} theme={theme} />;
        default:
            return <CustomAppScreen app={app} clue={clue} charName={charName} compact={compact} theme={theme} />;
    }
};

const MessagesScreen: React.FC<Omit<AppContentProps, 'app'>> = ({ clue, charName, charAvatar, compact, theme }) => {
    const lines = parseConversationLines(clue, charName);
    return (
        <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
            <div className={`flex items-center gap-3 rounded-[1.35rem] border ${theme.border} bg-white/74 p-3 shadow-sm`}>
                <div className={`${compact ? 'h-10 w-10' : 'h-12 w-12'} overflow-hidden rounded-full bg-emerald-100`}>
                    {charAvatar ? <img src={charAvatar} alt={charName} className="h-full w-full object-cover" /> : <ChatCircleText className="h-full w-full p-2 text-emerald-600" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className={`${compact ? 'text-xs' : 'text-sm'} truncate font-bold`}>{clue.subtitle || appTitle(clue, '信息')}</div>
                    <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>{clue.timestamp || '刚刚'} · 置顶会话</div>
                </div>
                <DotsThree weight="bold" className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} ${theme.muted}`} />
            </div>
            <div className={`${compact ? 'space-y-1.5' : 'space-y-2'} rounded-[1.35rem] border ${theme.border} bg-white/45 p-3`}>
                {lines.map((line, index) => (
                    <div key={`${line.speaker}-${index}`} className={`flex ${line.mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[82%] rounded-2xl px-3 py-2 shadow-sm ${line.mine ? 'bg-[#31c46a] text-white' : 'bg-white text-[#203128]'}`}>
                            {!line.mine && <div className="mb-0.5 text-[9px] font-semibold text-[#13935f]">{line.speaker}</div>}
                            <div className={`${compact ? 'text-[10px]' : 'text-xs'} whitespace-pre-wrap leading-relaxed`}>{line.text}</div>
                        </div>
                    </div>
                ))}
            </div>
            <div className={`flex items-center gap-2 rounded-full border ${theme.border} bg-white/72 px-3 py-2 ${theme.muted}`}>
                <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} min-w-0 flex-1 truncate`}>输入框里还停着上一句没发出去的话</span>
                <PaperPlaneTilt weight="fill" className="h-4 w-4 text-emerald-600" />
            </div>
        </div>
    );
};

const NotesScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.4rem] border ${theme.border} bg-[#fffdf1] p-4 shadow-[0_12px_28px_rgba(91,71,25,0.08)]`}>
                <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>iCloud · {charName} 的备忘录</div>
                <h3 className={`${compact ? 'mt-1 text-base' : 'mt-2 text-xl'} font-semibold leading-tight`}>{appTitle(clue, '备忘录')}</h3>
                {clue.subtitle && <p className={`${compact ? 'mt-1 text-[10px]' : 'mt-2 text-xs'} ${theme.muted}`}>{clue.subtitle}</p>}
                <div className={`mt-3 space-y-2 border-l-2 border-amber-300/70 pl-3 ${compact ? 'text-[10px]' : 'text-xs'} leading-relaxed`}>
                    {items.map((item, index) => (
                        <div key={`${item.label}-${index}`}>
                            <div className="font-semibold text-[#6f5727]">{item.label}</div>
                            <div className="whitespace-pre-wrap text-[#3d3320]/86">{itemText(item)}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className={`grid grid-cols-2 gap-2 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
                <div className={`rounded-2xl border ${theme.border} bg-white/55 p-3`}>最近编辑<br /><span className="font-semibold">{clue.timestamp || '今天'}</span></div>
                <div className={`rounded-2xl border ${theme.border} bg-white/55 p-3`}>锁定痕迹<br /><span className="font-semibold">没有完全删掉</span></div>
            </div>
        </div>
    );
};

const PhotosScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 4 : 6);
    return (
        <div className="space-y-3">
            <div className={`flex items-end justify-between rounded-[1.35rem] border ${theme.border} bg-white/70 p-3`}>
                <div>
                    <div className={`${compact ? 'text-[10px]' : 'text-xs'} ${theme.muted}`}>最近项目</div>
                    <div className={`${compact ? 'text-lg' : 'text-2xl'} font-bold`}>{items.length} 张照片</div>
                </div>
                <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} rounded-full ${theme.accentSoft} px-2 py-1 ${theme.accent}`}>{charName}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`relative aspect-square overflow-hidden rounded-[1.1rem] bg-gradient-to-br ${PHOTO_TILE_GRADIENTS[index % PHOTO_TILE_GRADIENTS.length]} shadow-sm`}>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.55),transparent_32%),linear-gradient(180deg,transparent,rgba(0,0,0,0.34))]" />
                        <ImageSquare weight="duotone" className="absolute right-2 top-2 h-5 w-5 text-white/75" />
                        <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
                            <div className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold drop-shadow`}>{item.label}</div>
                            <div className={`${compact ? 'text-[8px]' : 'text-[9px]'} line-clamp-2 opacity-90 drop-shadow`}>{previewText(itemText(item), 48)}</div>
                        </div>
                    </div>
                ))}
            </div>
            <div className={`rounded-2xl border ${theme.border} bg-white/65 p-3 ${compact ? 'text-[10px]' : 'text-xs'} ${theme.muted}`}>
                {clue.subtitle || '照片详情里的时间、地点和备注比缩略图更诚实。'}
            </div>
        </div>
    );
};

const CalendarScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    const day = new Date().getDate();
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.35rem] border ${theme.border} bg-white/72 p-4`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className={`${compact ? 'text-[10px]' : 'text-xs'} ${theme.muted}`}>日程</div>
                        <div className={`${compact ? 'text-xl' : 'text-3xl'} font-bold`}>{day}</div>
                    </div>
                    <div className={`rounded-2xl ${theme.accentSoft} px-3 py-2 text-right ${theme.accent}`}>
                        <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} font-semibold`}>{clue.timestamp || '今天'}</div>
                        <div className={`${compact ? 'text-[8px]' : 'text-[10px]'}`}>和 {charName} 有关</div>
                    </div>
                </div>
            </div>
            <div className="space-y-2">
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`flex gap-3 rounded-[1.2rem] border ${theme.border} bg-white/70 p-3`}>
                        <div className="flex w-10 shrink-0 flex-col items-center">
                            <span className="h-2 w-2 rounded-full bg-rose-500" />
                            <span className="h-full w-px bg-rose-200" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} font-semibold ${theme.accent}`}>{item.label}</div>
                            <div className={`${compact ? 'text-[11px]' : 'text-sm'} whitespace-pre-wrap font-semibold leading-snug`}>{item.value}</div>
                            {item.detail && <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} mt-1 whitespace-pre-wrap ${theme.muted}`}>{item.detail}</div>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const BrowserScreen: React.FC<Omit<AppContentProps, 'app' | 'charName' | 'charAvatar'>> = ({ clue, compact, theme }) => {
    const items = getClueItems(clue);
    return (
        <div className="space-y-3">
            <div className={`flex items-center gap-2 rounded-full border ${theme.border} bg-white/78 px-3 py-2 shadow-sm`}>
                <MagnifyingGlass className="h-4 w-4 text-blue-500" />
                <div className={`${compact ? 'text-[10px]' : 'text-xs'} min-w-0 flex-1 truncate text-[#31445a]`}>{appTitle(clue, '搜索记录')}</div>
                <LockKey className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div className={`rounded-[1.35rem] border ${theme.border} bg-white/70 p-3`}>
                <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} mb-2 font-semibold ${theme.muted}`}>最近访问</div>
                <div className="space-y-2">
                    {items.map((item, index) => (
                        <div key={`${item.label}-${index}`} className="flex items-center gap-3">
                            <span className={`flex ${compact ? 'h-8 w-8' : 'h-9 w-9'} shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600`}>
                                <GlobeHemisphereWest className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                                <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 68)}</span>
                            </span>
                            <CaretRight className={`h-4 w-4 ${theme.muted}`} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MusicScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    const nowPlaying = items[0];
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.55rem] border ${theme.border} bg-gradient-to-br from-white/90 to-pink-100/75 p-4 text-center shadow-sm`}>
                <div className={`${compact ? 'mx-auto h-28 w-28' : 'mx-auto h-36 w-36'} flex items-center justify-center rounded-[2rem] bg-gradient-to-br from-[#2c2130] via-[#9e426c] to-[#f3b6ca] shadow-[0_18px_36px_rgba(157,55,104,0.22)]`}>
                    <MusicNotes weight="fill" className={`${compact ? 'h-12 w-12' : 'h-16 w-16'} text-white/88`} />
                </div>
                <div className={`${compact ? 'mt-3 text-sm' : 'mt-4 text-lg'} font-bold`}>{nowPlaying?.label || appTitle(clue, '正在播放')}</div>
                <div className={`${compact ? 'text-[10px]' : 'text-xs'} ${theme.muted}`}>{previewText(nowPlaying ? itemText(nowPlaying) : clue.subtitle || charName, 56)}</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-pink-100">
                    <div className="h-full w-[64%] rounded-full bg-pink-500" />
                </div>
                <div className="mt-3 flex items-center justify-center gap-5 text-pink-700">
                    <SkipBack weight="fill" className="h-5 w-5" />
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-600 text-white shadow-sm"><Play weight="fill" className="h-4 w-4 translate-x-px" /></span>
                    <SkipForward weight="fill" className="h-5 w-5" />
                </div>
            </div>
            <div className={`rounded-[1.25rem] border ${theme.border} bg-white/62 p-3`}>
                {items.slice(1, compact ? 3 : 4).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-pink-900/8 py-2 last:border-b-0">
                        <span className="text-[10px] font-bold text-pink-400">{String(index + 2).padStart(2, '0')}</span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[10px]' : 'text-xs'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 48)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const MapsScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 3 : 5);
    return (
        <div className="space-y-3">
            <div className={`relative h-44 overflow-hidden rounded-[1.45rem] border ${theme.border} bg-[#dde9d8] shadow-sm`}>
                <div className="absolute inset-0 bg-[linear-gradient(35deg,transparent_46%,rgba(255,255,255,0.65)_47%,rgba(255,255,255,0.65)_53%,transparent_54%),linear-gradient(108deg,transparent_42%,rgba(255,255,255,0.55)_43%,rgba(255,255,255,0.55)_49%,transparent_50%)]" />
                <div className="absolute left-9 top-12 h-28 w-32 rounded-full border-[5px] border-indigo-400/70 border-r-transparent border-t-transparent" />
                <div className="absolute left-14 top-14 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg"><MapPin weight="fill" className="h-4 w-4" /></div>
                <div className="absolute bottom-12 right-12 flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg"><MapPin weight="fill" className="h-5 w-5" /></div>
                <div className={`absolute bottom-3 left-3 right-3 rounded-2xl bg-white/82 p-2 ${compact ? 'text-[9px]' : 'text-[11px]'} text-[#25304a] shadow-sm`}>
                    {clue.subtitle || `${charName} 最近的路线仍在地图里`}
                </div>
            </div>
            <div className="space-y-2">
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`flex items-center gap-3 rounded-[1.1rem] border ${theme.border} bg-white/70 p-3`}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 66)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ClockScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    const cardStyle: React.CSSProperties = { background: 'var(--story-phone-card)' };
    const softCardStyle: React.CSSProperties = { background: 'var(--story-phone-card-soft)' };
    const textStyle: React.CSSProperties = { color: 'var(--story-phone-text)' };
    const mutedStyle: React.CSSProperties = { color: 'var(--story-phone-muted)' };
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.5rem] border ${theme.border} p-4 text-center shadow-sm`} style={cardStyle}>
                <div className={compact ? 'text-[10px]' : 'text-xs'} style={mutedStyle}>异常提醒</div>
                <div className={`${compact ? 'text-4xl' : 'text-5xl'} mt-1 font-extralight tracking-normal`} style={textStyle}>{clue.timestamp || '02:17'}</div>
                <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} mt-2`} style={mutedStyle}>{clue.subtitle || `${charName} 没删掉的时间点`}</div>
            </div>
            <div className="space-y-2">
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`flex items-center gap-3 rounded-[1.15rem] border ${theme.border} p-3`} style={softCardStyle}>
                        <BellSimple className="h-5 w-5" style={{ color: theme.accentHex }} />
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`} style={textStyle}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate`} style={mutedStyle}>{previewText(itemText(item), 68)}</span>
                        </span>
                        <span
                            className="h-6 w-10 rounded-full p-1"
                            style={{ background: index === 0 ? theme.accentHex : 'color-mix(in srgb, var(--story-phone-muted) 18%, transparent)' }}
                        >
                            <span className={`block h-4 w-4 rounded-full bg-white ${index === 0 ? 'translate-x-4' : ''}`} />
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const WalletScreen: React.FC<Omit<AppContentProps, 'app' | 'charName' | 'charAvatar'>> = ({ clue, compact, theme }) => {
    const items = getClueItems(clue);
    const first = items[0];
    return (
        <div className="space-y-3">
            <div className="rounded-[1.55rem] bg-gradient-to-br from-[#203e2c] via-[#2c6d49] to-[#9fd58d] p-4 text-white shadow-[0_16px_32px_rgba(24,97,61,0.24)]">
                <div className="flex items-center justify-between">
                    <CreditCard weight="duotone" className="h-7 w-7" />
                    <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} rounded-full bg-white/15 px-2 py-1`}>最近付款</span>
                </div>
                <div className={`${compact ? 'mt-5 text-xl' : 'mt-8 text-2xl'} font-semibold`}>{first?.label || appTitle(clue, '钱包')}</div>
                <div className={`${compact ? 'mt-1 text-[10px]' : 'mt-2 text-xs'} text-white/75`}>{previewText(first ? itemText(first) : clue.subtitle || '', 72)}</div>
            </div>
            <div className={`rounded-[1.25rem] border ${theme.border} bg-white/72 p-3`}>
                {items.slice(1).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-emerald-900/8 py-2 last:border-b-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Wallet className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 60)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const MailScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.35rem] border ${theme.border} bg-white/74 p-3`}>
                <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>收件箱 · {charName}</div>
                <div className={`${compact ? 'mt-1 text-lg' : 'mt-1 text-2xl'} font-bold`}>{appTitle(clue, '未读邮件')}</div>
            </div>
            <div className={`overflow-hidden rounded-[1.25rem] border ${theme.border} bg-white/78`}>
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex gap-3 border-b border-sky-900/8 p-3 last:border-b-0">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${index === 0 ? 'bg-sky-500' : 'bg-slate-200'}`} />
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[10px]' : 'text-xs'} mt-0.5 line-clamp-2 ${theme.muted}`}>{itemText(item)}</span>
                        </span>
                        <EnvelopeSimple className="h-4 w-4 text-sky-500/70" />
                    </div>
                ))}
            </div>
        </div>
    );
};

const HealthScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 3 : 4);
    return (
        <div className="space-y-3">
            <div className={`grid grid-cols-[0.9fr_1.1fr] gap-3 rounded-[1.45rem] border ${theme.border} bg-white/72 p-3`}>
                <div className="flex items-center justify-center">
                    <div className={`${compact ? 'h-24 w-24' : 'h-28 w-28'} rounded-full p-2`} style={{ background: 'conic-gradient(#20a88a 0 68%, #d8eee8 68% 100%)' }}>
                        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
                            <Heartbeat weight="fill" className="h-6 w-6 text-teal-600" />
                            <span className="text-[10px] font-bold text-teal-700">68%</span>
                        </div>
                    </div>
                </div>
                <div className="min-w-0 self-center">
                    <div className={`${compact ? 'text-[10px]' : 'text-xs'} ${theme.muted}`}>{charName} 的健康摘要</div>
                    <div className={`${compact ? 'mt-1 text-base' : 'mt-2 text-xl'} font-bold`}>{appTitle(clue, '健康')}</div>
                    {clue.subtitle && <div className={`${compact ? 'mt-1 text-[9px]' : 'mt-2 text-[11px]'} ${theme.muted}`}>{clue.subtitle}</div>}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`rounded-[1.05rem] border ${theme.border} bg-white/68 p-3`}>
                        <Pulse className="mb-2 h-4 w-4 text-teal-600" />
                        <div className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold`}>{item.label}</div>
                        <div className={`${compact ? 'mt-1 text-[9px]' : 'mt-1 text-[11px]'} line-clamp-3 ${theme.muted}`}>{itemText(item)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const SettingsScreen: React.FC<Omit<AppContentProps, 'app'>> = ({ clue, charName, charAvatar, compact, theme }) => {
    const items = getClueItems(clue);
    return (
        <div className="space-y-3">
            <div className={`flex items-center gap-3 rounded-[1.35rem] border ${theme.border} bg-white/78 p-3`}>
                <div className={`${compact ? 'h-11 w-11' : 'h-12 w-12'} overflow-hidden rounded-2xl bg-zinc-200`}>
                    {charAvatar ? <img src={charAvatar} alt={charName} className="h-full w-full object-cover" /> : <GearSix className="h-full w-full p-3 text-zinc-500" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className={`${compact ? 'text-sm' : 'text-base'} truncate font-bold`}>{charName}</div>
                    <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>Apple ID、专注模式与隐私</div>
                </div>
                <CaretRight className={`h-4 w-4 ${theme.muted}`} />
            </div>
            <div className={`overflow-hidden rounded-[1.25rem] border ${theme.border} bg-white/78`}>
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-zinc-900/8 p-3 last:border-b-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                            {index === 0 ? <CheckCircle className="h-4 w-4" /> : <GearSix className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 58)}</span>
                        </span>
                        <CaretRight className={`h-4 w-4 ${theme.muted}`} />
                    </div>
                ))}
            </div>
        </div>
    );
};

const SocialScreen: React.FC<Omit<AppContentProps, 'app'>> = ({ clue, charName, charAvatar, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 4 : 5);
    const first = items[0];
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.45rem] border ${theme.border} bg-white/76 p-3 shadow-sm`}>
                <div className="flex items-center gap-3">
                    <div className={`${compact ? 'h-11 w-11' : 'h-12 w-12'} overflow-hidden rounded-full bg-violet-100`}>
                        {charAvatar ? <img src={charAvatar} alt={charName} className="h-full w-full object-cover" /> : <UsersThree className="h-full w-full p-2.5 text-violet-600" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className={`${compact ? 'text-sm' : 'text-base'} truncate font-bold`}>{charName}</div>
                        <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>{clue.subtitle || '私密动态 · 仅部分好友可见'}</div>
                    </div>
                    <ShareNetwork className={`h-5 w-5 ${theme.accent}`} />
                </div>
                <div className={`mt-3 rounded-2xl ${theme.accentSoft} p-3`}>
                    <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} font-semibold ${theme.accent}`}>{first?.label || appTitle(clue, '社交动态')}</div>
                    <div className={`${compact ? 'mt-1 text-[11px]' : 'mt-1 text-sm'} whitespace-pre-wrap font-semibold leading-relaxed`}>{previewText(first ? itemText(first) : clue.evidenceText || '', 96)}</div>
                </div>
            </div>
            <div className="flex gap-2 overflow-hidden">
                {items.slice(0, 4).map((item, index) => (
                    <div key={`${item.label}-story-${index}`} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl border ${theme.border} bg-white/58 p-2`}>
                        <span className={`flex ${compact ? 'h-8 w-8' : 'h-10 w-10'} items-center justify-center rounded-full bg-gradient-to-br from-violet-300 to-fuchsia-400 text-white`}>
                            <UsersThree weight="fill" className="h-4 w-4" />
                        </span>
                        <span className={`${compact ? 'text-[8px]' : 'text-[9px]'} max-w-full truncate ${theme.muted}`}>{item.label}</span>
                    </div>
                ))}
            </div>
            <div className={`overflow-hidden rounded-[1.25rem] border ${theme.border} bg-white/72`}>
                {items.slice(1).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex gap-3 border-b border-violet-900/8 p-3 last:border-b-0">
                        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                            <ChatCircleText className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} line-clamp-2 ${theme.muted}`}>{itemText(item)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const VideoScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    const current = items[0];
    return (
        <div className="space-y-3">
            <div className="overflow-hidden rounded-[1.5rem] border border-orange-950/10 bg-[#241816] text-white shadow-[0_18px_34px_rgba(149,59,33,0.18)]">
                <div className={`relative ${compact ? 'h-36' : 'h-44'} bg-gradient-to-br from-[#39231f] via-[#a84435] to-[#f1aa5f]`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_32%_22%,rgba(255,255,255,0.32),transparent_30%),linear-gradient(180deg,transparent,rgba(0,0,0,0.48))]" />
                    <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/28 px-2.5 py-1 text-[10px] font-semibold">
                        <Television className="h-3.5 w-3.5" />
                        继续观看
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-orange-600 shadow-lg">
                            <Play weight="fill" className="h-5 w-5 translate-x-px" />
                        </span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                        <div className={`${compact ? 'text-sm' : 'text-base'} font-bold`}>{current?.label || appTitle(clue, '短剧')}</div>
                        <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} mt-1 line-clamp-2 text-white/76`}>{previewText(current ? itemText(current) : clue.subtitle || charName, 70)}</div>
                    </div>
                </div>
                <div className="h-1.5 bg-white/10">
                    <div className="h-full w-[71%] bg-orange-400" />
                </div>
            </div>
            <div className={`rounded-[1.25rem] border ${theme.border} bg-white/72 p-3`}>
                <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} mb-1.5 font-semibold ${theme.muted}`}>播放记录 · 弹幕还亮着</div>
                {items.slice(1, compact ? 4 : 5).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-orange-900/8 py-2 last:border-b-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                            <FilmSlate className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 62)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ShoppingScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, compact, theme }) => {
    const items = getClueItems(clue);
    const order = items[0];
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.45rem] border ${theme.border} bg-white/78 p-3 shadow-sm`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>订单追踪</div>
                        <div className={`${compact ? 'text-lg' : 'text-2xl'} font-bold`}>{order?.label || appTitle(clue, '购物')}</div>
                    </div>
                    <span className={`flex ${compact ? 'h-10 w-10' : 'h-12 w-12'} items-center justify-center rounded-2xl bg-rose-100 text-rose-600`}>
                        <ShoppingBagOpen weight="duotone" className="h-6 w-6" />
                    </span>
                </div>
                <div className={`mt-3 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 p-3 text-white`}>
                    <div className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold`}>最近下单</div>
                    <div className={`${compact ? 'mt-1 text-[11px]' : 'mt-1 text-sm'} line-clamp-3 leading-relaxed`}>{order ? itemText(order) : clue.subtitle}</div>
                </div>
            </div>
            <div className={`overflow-hidden rounded-[1.25rem] border ${theme.border} bg-white/76`}>
                {items.slice(1).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-rose-900/8 p-3 last:border-b-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                            {index % 2 === 0 ? <Package className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 58)}</span>
                        </span>
                        <CaretRight className={`h-4 w-4 ${theme.muted}`} />
                    </div>
                ))}
            </div>
        </div>
    );
};

const DeliveryScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    const order = items[0];
    return (
        <div className="space-y-3">
            <div className={`relative overflow-hidden rounded-[1.45rem] border ${theme.border} bg-[#fff4cf] p-4 shadow-sm`}>
                <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-orange-300/40" />
                <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} font-semibold ${theme.accent}`}>外卖订单 · {clue.timestamp || '刚刚'}</div>
                        <div className={`${compact ? 'mt-1 text-lg' : 'mt-1 text-2xl'} font-bold`}>{order?.label || appTitle(clue, '外卖')}</div>
                        <div className={`${compact ? 'mt-2 text-[10px]' : 'mt-2 text-xs'} line-clamp-3 ${theme.muted}`}>{previewText(order ? itemText(order) : clue.subtitle || `${charName} 的收货备注`, 92)}</div>
                    </div>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/78 text-orange-600 shadow-sm">
                        <ForkKnife weight="duotone" className="h-7 w-7" />
                    </span>
                </div>
                <div className={`relative mt-3 flex items-center gap-2 rounded-2xl bg-white/70 p-2 ${compact ? 'text-[9px]' : 'text-[11px]'} text-[#6d572f]`}>
                    <MapPin weight="fill" className="h-4 w-4 text-orange-500" />
                    <span className="min-w-0 flex-1 truncate">{clue.subtitle || '地址和备注没有来得及隐藏'}</span>
                </div>
            </div>
            <div className="space-y-2">
                {items.slice(1, compact ? 4 : 5).map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`flex items-center gap-3 rounded-[1.1rem] border ${theme.border} bg-white/70 p-3`}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                            <Receipt className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 64)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const RideScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 4 : 5);
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.45rem] border ${theme.border} bg-white/75 p-3 shadow-sm`}>
                <div className="relative h-36 overflow-hidden rounded-[1.2rem] bg-[#dbeef8]">
                    <div className="absolute inset-0 bg-[linear-gradient(28deg,transparent_46%,rgba(255,255,255,0.75)_47%,rgba(255,255,255,0.75)_53%,transparent_54%),linear-gradient(122deg,transparent_42%,rgba(255,255,255,0.6)_43%,rgba(255,255,255,0.6)_49%,transparent_50%)]" />
                    <div className="absolute left-8 top-8 h-20 w-28 rounded-full border-[5px] border-cyan-500/70 border-l-transparent border-b-transparent" />
                    <div className="absolute left-8 top-9 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-600 text-white shadow-lg"><MapPin weight="fill" className="h-4 w-4" /></div>
                    <div className="absolute bottom-8 right-9 flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg"><CarProfile weight="fill" className="h-5 w-5" /></div>
                    <div className={`absolute bottom-3 left-3 right-3 rounded-2xl bg-white/84 p-2 ${compact ? 'text-[9px]' : 'text-[11px]'} text-[#203347] shadow-sm`}>
                        {clue.subtitle || `${charName} 最近一次出行记录`}
                    </div>
                </div>
            </div>
            <div className={`overflow-hidden rounded-[1.25rem] border ${theme.border} bg-white/76`}>
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex gap-3 border-b border-cyan-900/8 p-3 last:border-b-0">
                        <div className="flex w-8 shrink-0 flex-col items-center">
                            <span className={`h-3 w-3 rounded-full ${index === 0 ? 'bg-cyan-500' : 'bg-blue-300'}`} />
                            {index < items.length - 1 && <span className="mt-1 h-full w-px bg-cyan-200" />}
                        </div>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} line-clamp-2 ${theme.muted}`}>{itemText(item)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const DiaryScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    const entry = items[0];
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.5rem] border ${theme.border} bg-[#fff7fa] p-4 shadow-[0_14px_28px_rgba(144,62,94,0.1)]`}>
                <div className="flex items-center justify-between">
                    <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>私密日记 · Face ID 已解锁</div>
                    <LockKey weight="fill" className="h-4 w-4 text-pink-500" />
                </div>
                <h3 className={`${compact ? 'mt-2 text-lg' : 'mt-3 text-2xl'} font-semibold leading-tight`}>{entry?.label || appTitle(clue, '日记')}</h3>
                <div className={`${compact ? 'mt-3 text-[11px]' : 'mt-4 text-sm'} whitespace-pre-wrap border-l-2 border-pink-300/70 pl-3 leading-relaxed text-[#533240]/86`}>
                    {entry ? itemText(entry) : clue.evidenceText || clue.subtitle || `${charName} 没有写完这一页。`}
                </div>
                <div className={`${compact ? 'mt-3 text-[9px]' : 'mt-4 text-[11px]'} flex items-center justify-between ${theme.muted}`}>
                    <span>{clue.timestamp || '今天'}</span>
                    <span>心情标签 · 未同步</span>
                </div>
            </div>
            <div className={`grid grid-cols-2 gap-2 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
                {items.slice(1, 3).map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`rounded-2xl border ${theme.border} bg-white/62 p-3`}>
                        <BookBookmark className="mb-2 h-4 w-4 text-pink-500" />
                        <div className="font-semibold">{item.label}</div>
                        <div className={`mt-1 line-clamp-3 ${theme.muted}`}>{itemText(item)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const SmartHomeScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 4 : 6);
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.45rem] border ${theme.border} bg-white/76 p-3`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className={`${compact ? 'text-[10px]' : 'text-xs'} ${theme.muted}`}>家庭</div>
                        <div className={`${compact ? 'text-lg' : 'text-2xl'} font-bold`}>{charName} 的房间</div>
                    </div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
                        <HouseLine weight="duotone" className="h-7 w-7" />
                    </span>
                </div>
                <div className={`mt-3 rounded-2xl ${theme.accentSoft} p-3 ${compact ? 'text-[10px]' : 'text-xs'} ${theme.accent}`}>
                    {clue.subtitle || '自动化记录会暴露他什么时候到家、什么时候离开。'}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`rounded-[1.15rem] border ${theme.border} bg-white/70 p-3`}>
                        <div className="flex items-center justify-between gap-2">
                            <HouseLine className="h-4 w-4 text-teal-600" />
                            <span className={`h-5 w-9 rounded-full ${index % 3 === 1 ? 'bg-slate-200' : 'bg-teal-500'} p-0.5`}>
                                <span className={`block h-4 w-4 rounded-full bg-white ${index % 3 === 1 ? '' : 'translate-x-4'}`} />
                            </span>
                        </div>
                        <div className={`${compact ? 'mt-2 text-[10px]' : 'mt-3 text-xs'} font-semibold`}>{item.label}</div>
                        <div className={`${compact ? 'mt-1 text-[9px]' : 'mt-1 text-[11px]'} line-clamp-2 ${theme.muted}`}>{previewText(itemText(item), 48)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ReadingScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    const book = items[0];
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.5rem] border ${theme.border} bg-[#fbfbff] p-4 shadow-sm`}>
                <div className="flex items-start gap-3">
                    <div className={`${compact ? 'h-24 w-16' : 'h-28 w-20'} shrink-0 rounded-r-2xl rounded-l-md bg-gradient-to-br from-indigo-500 via-slate-500 to-slate-800 p-2 text-white shadow-[0_14px_26px_rgba(49,58,109,0.22)]`}>
                        <BookOpen className="h-5 w-5" />
                        <div className="mt-5 text-[9px] font-semibold leading-tight">{book?.label || '最近阅读'}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>书架 · 上次读到</div>
                        <div className={`${compact ? 'mt-1 text-base' : 'mt-1 text-xl'} font-bold leading-tight`}>{appTitle(clue, '阅读')}</div>
                        <div className={`${compact ? 'mt-2 text-[10px]' : 'mt-2 text-xs'} line-clamp-4 leading-relaxed ${theme.muted}`}>{book ? itemText(book) : clue.subtitle || `${charName} 标过的句子留在页边。`}</div>
                    </div>
                </div>
            </div>
            <div className={`rounded-[1.25rem] border ${theme.border} bg-white/72 p-3`}>
                {items.slice(1, compact ? 4 : 5).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-indigo-900/8 py-2 last:border-b-0">
                        <BookBookmark className="h-4 w-4 shrink-0 text-indigo-500" />
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 60)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const StudyScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 4 : 5);
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.45rem] border ${theme.border} bg-white/76 p-4`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className={`${compact ? 'text-[10px]' : 'text-xs'} ${theme.muted}`}>今日学习</div>
                        <div className={`${compact ? 'text-xl' : 'text-3xl'} font-bold`}>72%</div>
                    </div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-100 text-lime-700">
                        <GraduationCap weight="duotone" className="h-7 w-7" />
                    </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-lime-100">
                    <div className="h-full w-[72%] rounded-full bg-lime-500" />
                </div>
                <div className={`${compact ? 'mt-2 text-[9px]' : 'mt-2 text-[11px]'} ${theme.muted}`}>{clue.subtitle || `${charName} 的学习记录和错题本`}</div>
            </div>
            <div className="space-y-2">
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`flex items-center gap-3 rounded-[1.1rem] border ${theme.border} bg-white/70 p-3`}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-100 text-lime-700">
                            {index === 0 ? <Student className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} line-clamp-2 ${theme.muted}`}>{itemText(item)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FilesScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, compact, theme }) => {
    const items = getClueItems(clue);
    return (
        <div className="space-y-3">
            <div className={`flex items-center gap-2 rounded-full border ${theme.border} bg-white/78 px-3 py-2`}>
                <MagnifyingGlass className="h-4 w-4 text-blue-500" />
                <div className={`${compact ? 'text-[10px]' : 'text-xs'} min-w-0 flex-1 truncate ${theme.muted}`}>搜索文件、共享链接或加密夹</div>
                <Folder className="h-4 w-4 text-blue-500" />
            </div>
            <div className={`rounded-[1.35rem] border ${theme.border} bg-white/76 p-3`}>
                <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} mb-2 font-semibold ${theme.muted}`}>最近项目</div>
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-slate-900/8 py-2.5 last:border-b-0">
                        <span className={`flex ${compact ? 'h-8 w-8' : 'h-9 w-9'} shrink-0 items-center justify-center rounded-xl ${index % 2 === 0 ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                            {index % 2 === 0 ? <Folder className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 64)}</span>
                        </span>
                        {index === 0 && <LockKey className="h-4 w-4 text-slate-400" />}
                    </div>
                ))}
            </div>
        </div>
    );
};

const WeatherScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 4 : 5);
    const city = items[0];
    return (
        <div className="space-y-3">
            <div className="overflow-hidden rounded-[1.5rem] border border-sky-900/10 bg-gradient-to-br from-[#69b7e7] via-[#9bd5f1] to-[#ffd083] p-4 text-white shadow-[0_18px_34px_rgba(64,137,179,0.2)]">
                <div className="flex items-start justify-between">
                    <div className="min-w-0">
                        <div className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold text-white/80`}>{city?.label || appTitle(clue, '天气')}</div>
                        <div className={`${compact ? 'mt-1 text-4xl' : 'mt-2 text-5xl'} font-light tracking-normal`}>24°</div>
                        <div className={`${compact ? 'mt-1 text-[10px]' : 'mt-2 text-xs'} line-clamp-2 text-white/82`}>{previewText(city ? itemText(city) : clue.subtitle || `${charName} 最近关注的城市`, 74)}</div>
                    </div>
                    <CloudSun weight="duotone" className={`${compact ? 'h-12 w-12' : 'h-16 w-16'} shrink-0 text-white`} />
                </div>
                <div className={`mt-4 rounded-2xl bg-white/18 p-2 ${compact ? 'text-[9px]' : 'text-[11px]'} text-white/88`}>{clue.timestamp || '今日'} · 位置记录可能没有关闭</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {items.slice(1).map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`rounded-[1.1rem] border ${theme.border} bg-white/70 p-3`}>
                        <CloudSun className="mb-2 h-4 w-4 text-sky-500" />
                        <div className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold`}>{item.label}</div>
                        <div className={`${compact ? 'mt-1 text-[9px]' : 'mt-1 text-[11px]'} line-clamp-3 ${theme.muted}`}>{itemText(item)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const PStationScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 4 : 5);
    const featured = items[0];
    return (
        <div className="space-y-3">
            <div className={`flex items-center gap-2 rounded-full border ${theme.border} bg-white/82 px-3 py-2 shadow-sm`}>
                <MagnifyingGlass className="h-4 w-4 text-blue-500" />
                <span className={`${compact ? 'text-[10px]' : 'text-xs'} min-w-0 flex-1 truncate ${theme.muted}`}>搜索标签、作者、收藏夹</span>
                <Tag className="h-4 w-4 text-blue-500" />
            </div>
            <div className={`overflow-hidden rounded-[1.5rem] border ${theme.border} bg-white/78 shadow-sm`}>
                <div className="relative p-4">
                    <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-600">
                        <Eye className="h-3.5 w-3.5" />
                        全年龄
                    </div>
                    <div className="flex items-start gap-3">
                        <span className={`${compact ? 'h-14 w-14' : 'h-16 w-16'} flex shrink-0 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-[#45a3ff] to-[#1f5bc6] text-3xl font-black text-white shadow-[0_14px_28px_rgba(47,125,225,0.28)]`}>
                            P
                        </span>
                        <div className="min-w-0 flex-1 pr-14">
                            <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>插画推荐 · {charName}</div>
                            <h3 className={`${compact ? 'mt-1 text-lg' : 'mt-1 text-2xl'} font-bold leading-tight`}>{featured?.label || appTitle(clue, 'P站')}</h3>
                            <div className={`${compact ? 'mt-2 text-[10px]' : 'mt-2 text-xs'} line-clamp-3 ${theme.muted}`}>{previewText(featured ? itemText(featured) : clue.subtitle || '收藏、标签和关注作者比推荐流更容易留下痕迹。', 86)}</div>
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                        {ILLUSTRATION_TILE_GRADIENTS.map((gradient, index) => (
                            <div key={gradient} className={`relative overflow-hidden rounded-[1.05rem] bg-gradient-to-br ${gradient} ${index % 2 === 0 ? 'aspect-[1.18/1]' : 'aspect-[1/1.18]'} shadow-sm`}>
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_22%,rgba(255,255,255,0.54),transparent_30%),linear-gradient(180deg,transparent,rgba(17,56,115,0.26))]" />
                                <PaintBrush weight="duotone" className="absolute right-2 top-2 h-5 w-5 text-white/82" />
                                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 text-white">
                                    <span className="min-w-0 truncate text-[9px] font-bold drop-shadow">{items[index]?.label || `收藏 ${index + 1}`}</span>
                                    <BookmarkSimple weight="fill" className="h-3.5 w-3.5 shrink-0 drop-shadow" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        {['关注作者', '收藏夹', '夜间浏览'].map((label, index) => (
                            <div key={label} className={`rounded-2xl ${theme.accentSoft} px-2 py-2`}>
                                <div className={`${compact ? 'text-[8px]' : 'text-[9px]'} ${theme.muted}`}>{label}</div>
                                <div className={`${compact ? 'text-xs' : 'text-sm'} font-bold ${theme.accent}`}>{index === 0 ? '18' : index === 1 ? '42' : '03:12'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className={`overflow-hidden rounded-[1.25rem] border ${theme.border} bg-white/74`}>
                {items.slice(1).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-blue-900/8 p-3 last:border-b-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                            {index === 0 ? <UserCircle className="h-4 w-4" /> : index === 1 ? <BookmarkSimple className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 64)}</span>
                        </span>
                        <CaretRight className={`h-4 w-4 ${theme.muted}`} />
                    </div>
                ))}
            </div>
        </div>
    );
};

const GachaGameScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    const featured = items[0];
    return (
        <div className="space-y-3">
            <div className="overflow-hidden rounded-[1.55rem] border border-violet-950/10 bg-[#18122d] text-white shadow-[0_18px_36px_rgba(73,48,142,0.24)]">
                <div className={`relative ${compact ? 'min-h-[10.5rem]' : 'min-h-[12rem]'} p-4`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(127,99,234,0.62),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(64,208,218,0.32),transparent_32%),linear-gradient(140deg,#17122b,#31205f_58%,#5b84d9)]" />
                    <div className="absolute -right-10 bottom-1 h-32 w-32 rounded-full border border-white/18" />
                    <div className="relative flex items-center justify-between">
                        <span className="rounded-full bg-white/13 px-2.5 py-1 text-[10px] font-semibold text-white/82">限定祈愿</span>
                        <Sparkle weight="fill" className="h-5 w-5 text-cyan-200" />
                    </div>
                    <div className="relative mt-5 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                            <div className={`${compact ? 'text-[10px]' : 'text-xs'} text-white/62`}>账号 · {charName}</div>
                            <div className={`${compact ? 'mt-1 text-xl' : 'mt-2 text-3xl'} font-bold tracking-normal`}>{featured?.label || appTitle(clue, '抽卡记录')}</div>
                            <div className={`${compact ? 'mt-2 text-[10px]' : 'mt-2 text-xs'} line-clamp-3 text-white/74`}>{previewText(featured ? itemText(featured) : clue.subtitle || '角色、保底和好友留言都留在祈愿页。', 88)}</div>
                        </div>
                        <div className="shrink-0 text-center">
                            <div className={`${compact ? 'h-16 w-16' : 'h-20 w-20'} flex items-center justify-center rounded-[1.35rem] bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]`}>
                                <Star weight="fill" className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} text-yellow-200`} />
                            </div>
                            <div className="mt-1 text-[9px] text-white/58">74 / 90</div>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-3 border-t border-white/10 bg-white/8 text-center">
                    {['保底', '原石', '好友'].map((label, index) => (
                        <div key={label} className="border-r border-white/8 px-2 py-2 last:border-r-0">
                            <div className="text-[10px] text-white/52">{label}</div>
                            <div className={`${compact ? 'text-xs' : 'text-sm'} font-bold`}>{index === 0 ? '16抽' : index === 1 ? '2,180' : '12'}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className={`overflow-hidden rounded-[1.25rem] border ${theme.border} bg-white/74`}>
                {items.slice(1, compact ? 4 : 5).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-violet-900/8 p-3 last:border-b-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                            {index % 2 === 0 ? <Cards className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 64)}</span>
                        </span>
                        <CaretRight className={`h-4 w-4 ${theme.muted}`} />
                    </div>
                ))}
            </div>
        </div>
    );
};

const RhythmGameScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    const track = items[0];
    const bars = [38, 62, 46, 88, 54, 72, 42, 95, 58, 76, 48, 66];
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.5rem] border ${theme.border} bg-white/78 p-3 shadow-sm`}>
                <div className="flex items-center gap-3">
                    <div className={`${compact ? 'h-24 w-24' : 'h-28 w-28'} relative shrink-0 overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#2e2254] via-[#b845a9] to-[#4bc4df] shadow-[0_16px_30px_rgba(72,115,160,0.2)]`}>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_20%,rgba(255,255,255,0.38),transparent_28%),linear-gradient(180deg,transparent,rgba(0,0,0,0.36))]" />
                        <Waveform weight="bold" className="absolute bottom-3 left-3 h-9 w-9 text-white/88" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>最近游玩 · {charName}</div>
                        <div className={`${compact ? 'mt-1 text-lg' : 'mt-1 text-2xl'} font-bold leading-tight`}>{track?.label || appTitle(clue, '音游成绩')}</div>
                        <div className={`${compact ? 'mt-2 text-[10px]' : 'mt-2 text-xs'} line-clamp-3 ${theme.muted}`}>{previewText(track ? itemText(track) : clue.subtitle || '凌晨重打的分数比聊天记录更诚实。', 84)}</div>
                    </div>
                </div>
                <div className="mt-4 flex h-16 items-end gap-1.5 rounded-2xl bg-cyan-50/80 px-3 py-2">
                    {bars.map((height, index) => (
                        <span key={`${height}-${index}`} className="flex-1 rounded-full bg-gradient-to-t from-cyan-500 to-fuchsia-400" style={{ height: `${height}%` }} />
                    ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {['准确率', '连击', '排名'].map((label, index) => (
                        <div key={label} className={`rounded-2xl ${theme.accentSoft} px-2 py-2`}>
                            <div className={`${compact ? 'text-[8px]' : 'text-[9px]'} ${theme.muted}`}>{label}</div>
                            <div className={`${compact ? 'text-xs' : 'text-sm'} font-bold ${theme.accent}`}>{index === 0 ? '99.27%' : index === 1 ? '843' : '#12'}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className={`rounded-[1.25rem] border ${theme.border} bg-white/72 p-3`}>
                {items.slice(1, compact ? 4 : 5).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-cyan-900/8 py-2 last:border-b-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                            {index === 0 ? <Target className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 62)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FarmGameScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 4 : 5);
    const note = items[0];
    const fieldTiles = ['bg-emerald-200', 'bg-lime-200', 'bg-yellow-200', 'bg-emerald-300', 'bg-lime-100', 'bg-amber-200', 'bg-emerald-100', 'bg-yellow-100', 'bg-lime-300', 'bg-emerald-200', 'bg-amber-100', 'bg-lime-200'];
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.45rem] border ${theme.border} bg-white/76 p-3 shadow-sm`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>庄园访客 · {clue.timestamp || '今天'}</div>
                        <div className={`${compact ? 'mt-1 text-lg' : 'mt-1 text-2xl'} font-bold`}>{note?.label || appTitle(clue, '庄园')}</div>
                        <div className={`${compact ? 'mt-2 text-[10px]' : 'mt-2 text-xs'} line-clamp-3 ${theme.muted}`}>{previewText(note ? itemText(note) : clue.subtitle || `${charName} 的作物和访客记录还在线。`, 82)}</div>
                    </div>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <PottedPlant weight="duotone" className="h-7 w-7" />
                    </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-[1.15rem] bg-[#d8c9a8]/35 p-2">
                    {fieldTiles.map((tile, index) => (
                        <span key={`${tile}-${index}`} className={`flex aspect-square items-center justify-center rounded-lg ${tile}`}>
                            {index % 3 === 0 && <PottedPlant weight="fill" className="h-3.5 w-3.5 text-emerald-700/72" />}
                        </span>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {items.slice(1).map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`rounded-[1.1rem] border ${theme.border} bg-white/70 p-3`}>
                        <div className="flex items-center justify-between gap-2">
                            <PottedPlant className="h-4 w-4 text-emerald-600" />
                            <span className={`${compact ? 'text-[8px]' : 'text-[9px]'} rounded-full ${theme.accentSoft} px-2 py-0.5 ${theme.accent}`}>{index === 0 ? '礼物' : '照料'}</span>
                        </div>
                        <div className={`${compact ? 'mt-2 text-[10px]' : 'mt-3 text-xs'} font-semibold`}>{item.label}</div>
                        <div className={`${compact ? 'mt-1 text-[9px]' : 'mt-1 text-[11px]'} line-clamp-3 ${theme.muted}`}>{itemText(item)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const BattleGameScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 4 : 5);
    const match = items[0];
    return (
        <div className="space-y-3">
            <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#0f131a] text-white shadow-[0_18px_36px_rgba(0,0,0,0.24)]">
                <div className="bg-gradient-to-br from-[#252b35] via-[#463042] to-[#d85b45] p-4">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-1 text-[10px] font-semibold text-white/76">
                            <GameController className="h-3.5 w-3.5" />
                            排位赛
                        </span>
                        <CrownSimple weight="fill" className="h-5 w-5 text-yellow-200" />
                    </div>
                    <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                        <div className="min-w-0 rounded-2xl bg-white/12 p-3">
                            <div className="text-[10px] text-white/54">我方</div>
                            <div className={`${compact ? 'text-xl' : 'text-2xl'} font-black`}>12</div>
                        </div>
                        <Sword weight="fill" className="h-7 w-7 text-white/82" />
                        <div className="min-w-0 rounded-2xl bg-black/18 p-3">
                            <div className="text-[10px] text-white/54">对面</div>
                            <div className={`${compact ? 'text-xl' : 'text-2xl'} font-black`}>9</div>
                        </div>
                    </div>
                    <div className={`${compact ? 'mt-4 text-sm' : 'mt-5 text-base'} font-bold`}>{match?.label || appTitle(clue, '对战记录')}</div>
                    <div className={`${compact ? 'mt-1 text-[10px]' : 'mt-1 text-xs'} line-clamp-2 text-white/72`}>{previewText(match ? itemText(match) : clue.subtitle || `${charName} 的赛后邀请还没处理。`, 78)}</div>
                </div>
                <div className="grid grid-cols-3 border-t border-white/10 bg-white/7 text-center">
                    {['KDA', '亲密队友', '禁言'].map((label, index) => (
                        <div key={label} className="border-r border-white/8 px-2 py-2 last:border-r-0">
                            <div className="text-[10px] text-white/44">{label}</div>
                            <div className={`${compact ? 'text-xs' : 'text-sm'} font-bold`}>{index === 0 ? '8/1/6' : index === 1 ? '在线' : '0天'}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className={`overflow-hidden rounded-[1.25rem] border ${theme.border} bg-white/8`}>
                {items.slice(1).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex gap-3 border-b border-white/8 p-3 last:border-b-0">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/16 text-[#ff8a6a]">
                            {index % 2 === 0 ? <Target className="h-4 w-4" /> : <DiceFive className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold text-white`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} line-clamp-2 text-white/58`}>{itemText(item)}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const PuzzleGameScreen: React.FC<Omit<AppContentProps, 'app' | 'charAvatar'>> = ({ clue, charName, compact, theme }) => {
    const items = getClueItems(clue).slice(0, compact ? 4 : 5);
    const level = items[0];
    const tiles = ['bg-indigo-500', 'bg-blue-400', 'bg-white/72', 'bg-cyan-300', 'bg-indigo-300', 'bg-blue-600', 'bg-white/56', 'bg-cyan-500', 'bg-indigo-400'];
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.5rem] border ${theme.border} bg-white/76 p-4 shadow-sm`}>
                <div className="flex items-start gap-3">
                    <div className={`${compact ? 'h-28 w-28' : 'h-32 w-32'} grid shrink-0 grid-cols-3 gap-1 rounded-[1.35rem] bg-indigo-950/8 p-2`}>
                        {tiles.map((tile, index) => (
                            <span key={`${tile}-${index}`} className={`flex items-center justify-center rounded-lg ${tile} ${index === 2 || index === 6 ? 'border border-indigo-200/70' : 'shadow-sm'}`}>
                                {index === 4 && <PuzzlePiece weight="fill" className="h-5 w-5 text-white" />}
                            </span>
                        ))}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className={`${compact ? 'text-[9px]' : 'text-[11px]'} ${theme.muted}`}>关卡进度 · {charName}</div>
                        <div className={`${compact ? 'mt-1 text-lg' : 'mt-1 text-2xl'} font-bold leading-tight`}>{level?.label || appTitle(clue, '解谜')}</div>
                        <div className={`${compact ? 'mt-2 text-[10px]' : 'mt-2 text-xs'} line-clamp-4 ${theme.muted}`}>{previewText(level ? itemText(level) : clue.subtitle || '提示、截图和卡关时间能拼出真正想隐藏的东西。', 94)}</div>
                        <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full ${theme.accentSoft} px-2.5 py-1 ${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold ${theme.accent}`}>
                            <LockKey className="h-3.5 w-3.5" />
                            第 7 章未通关
                        </div>
                    </div>
                </div>
            </div>
            <div className={`rounded-[1.25rem] border ${theme.border} bg-white/72 p-3`}>
                {items.slice(1).map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex items-center gap-3 border-b border-indigo-900/8 py-2 last:border-b-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                            {index === 0 ? <DiceFive className="h-4 w-4" /> : <PuzzlePiece className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`${compact ? 'text-[11px]' : 'text-sm'} block truncate font-semibold`}>{item.label}</span>
                            <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{previewText(itemText(item), 64)}</span>
                        </span>
                        <CaretRight className={`h-4 w-4 ${theme.muted}`} />
                    </div>
                ))}
            </div>
        </div>
    );
};

const CustomAppScreen: React.FC<AppContentProps> = ({ app, clue, charName, compact, theme }) => {
    const items = getClueItems(clue);
    return (
        <div className="space-y-3">
            <div className={`rounded-[1.45rem] border ${theme.border} bg-white/74 p-4 shadow-sm`}>
                <div className="flex items-center gap-3">
                    <span className={`${compact ? 'h-11 w-11' : 'h-12 w-12'} relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl text-xl text-white shadow-sm`} style={getAppIconStyle(app, theme)}>
                        {renderAppGlyph(app, compact ? 'h-5 w-5 text-white' : 'h-6 w-6 text-white', 'absolute inset-0 h-full w-full object-cover')}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className={`${compact ? 'text-sm' : 'text-base'} block truncate font-bold`}>{appTitle(clue, app.name)}</span>
                        <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} block truncate ${theme.muted}`}>{charName} 手机里的自定义 App</span>
                    </span>
                </div>
                {clue.subtitle && <div className={`${compact ? 'mt-3 text-[10px]' : 'mt-4 text-xs'} ${theme.muted}`}>{clue.subtitle}</div>}
            </div>
            <div className="space-y-2">
                {items.map((item, index) => (
                    <div key={`${item.label}-${index}`} className={`rounded-[1.1rem] border ${theme.border} bg-white/68 p-3`}>
                        <div className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold`} style={{ color: app.color?.startsWith('#') ? app.color : theme.accentHex }}>{item.label}</div>
                        <div className={`${compact ? 'mt-1 text-[10px]' : 'mt-1 text-xs'} whitespace-pre-wrap leading-relaxed`}>{itemText(item)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface StoryPhoneScreenProps {
    charName: string;
    charAvatar?: string;
    wallpaper?: string;
    apps?: PhoneAppDef[];
    activeAppId: StoryPhoneAppId | 'home';
    spotlightApp?: PhoneAppDef;
    clue?: PhoneClue | null;
    isLoading?: boolean;
    inserted?: boolean;
    compact?: boolean;
    currentTime?: string;
    homeSurface?: StoryPhoneHomeSurface;
    onBackHome?: () => void;
    onOpenApp?: (app: PhoneAppDef) => void;
    onGenerateApp?: (app: PhoneAppDef) => void;
    onInstallApp?: () => void;
    onUninstallApp?: (app: PhoneAppDef) => void;
    onPeekOnly?: () => void;
    onInsertContext?: () => void;
    onVisibleContentChange?: (clue: PhoneClue | null) => void;
}

const StoryPhoneScreen: React.FC<StoryPhoneScreenProps> = ({
    charName,
    charAvatar,
    wallpaper,
    apps = PHONE_APPS,
    activeAppId,
    spotlightApp = PHONE_APPS[0],
    clue,
    isLoading = false,
    inserted = false,
    compact = false,
    currentTime,
    homeSurface,
    onBackHome,
    onOpenApp,
    onGenerateApp,
    onInstallApp,
    onUninstallApp,
    onPeekOnly,
    onInsertContext,
    onVisibleContentChange,
}) => {
    const phoneApps = apps.length > 0 ? apps : PHONE_APPS;
    const currentApp = activeAppId === 'home' ? undefined : getStoryPhoneAppById(activeAppId, phoneApps);
    const [nestedRoute, setNestedRoute] = React.useState<StoryPhoneNestedRoute>(DEFAULT_NESTED_ROUTE);
    const timeLabel = currentTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const hasActions = Boolean(clue && clue.appId === activeAppId && !isLoading && (onPeekOnly || onInsertContext));
    const dockApps = DOCK_APP_IDS.map(appId => getStoryPhoneAppById(appId, phoneApps)).filter((app): app is PhoneAppDef => Boolean(app)).slice(0, 4);
    const dateLabel = new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
    const frameClass = compact
        ? 'relative aspect-[9/16] w-full rounded-[1.75rem] bg-[#050506] p-1.5 shadow-[0_18px_44px_rgba(15,23,42,0.22)] ring-1 ring-black/10'
        : 'relative h-full max-h-[45rem] min-h-[34rem] w-full rounded-[2.65rem] bg-[#050506] p-2.5 shadow-[0_24px_80px_rgba(0,0,0,0.48)] ring-1 ring-white/10';
    const notchClass = compact
        ? 'absolute left-1/2 top-2 z-30 h-3.5 w-20 -translate-x-1/2 rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]'
        : 'absolute left-1/2 top-4 z-30 h-6 w-[7.5rem] -translate-x-1/2 rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_10px_24px_rgba(0,0,0,0.28)]';
    const screenRadius = compact ? 'rounded-[1.28rem]' : 'rounded-[2rem]';
    const displayApp = currentApp || (activeAppId !== 'home' ? {
        id: activeAppId,
        name: clue?.appName || 'App',
        icon: '▣',
        color: DEFAULT_APP_THEME.accentHex,
        prompt: '',
    } : undefined);
    const appTheme = getAppTheme(displayApp);
    const clueHomeItem = clue ? getClueItems(clue)[0] : undefined;
    const clueHomeSnippet = clueHomeItem
        ? previewText(itemText(clueHomeItem), 28)
        : clue
            ? previewText(clue.evidenceText || clue.insertSummary || clue.title, 28)
            : '';
    const homeSurfaceCopy = {
        headline: homeSurface?.headline || (clue ? `${clue.appName} 刚刚亮了一下。` : `${charName} 的屏幕刚刚亮过。`),
        stickyNote: homeSurface?.stickyNote || (clueHomeSnippet ? `「${clueHomeSnippet}」` : '临时亮屏，桌面没有固定便签。'),
        spotlightDetail: homeSurface?.spotlightDetail || (clue ? previewText(clue.evidenceText || clue.insertSummary || clue.title, 44) : `${spotlightApp.name} 里有一页等待读取。`),
        spotlightFooter: homeSurface?.spotlightFooter || (clue?.timestamp ? `${clue.appName} · ${clue.timestamp}` : '等待读取'),
    };
    const useNativeAppChrome = activeAppId === 'wechat' || activeAppId === 'qq';
    const nestedNavigationEnabled = !compact && (activeAppId === 'wechat' || activeAppId === 'qq');

    React.useEffect(() => {
        setNestedRoute(DEFAULT_NESTED_ROUTE);
    }, [activeAppId, clue?.appId, clue?.title, clue?.timestamp]);

    React.useEffect(() => {
        if (!onVisibleContentChange) return;
        if (!clue || clue.appId !== activeAppId) {
            onVisibleContentChange(null);
            return;
        }
        if (activeAppId !== 'wechat') {
            onVisibleContentChange(clue);
        }
    }, [activeAppId, clue, onVisibleContentChange]);

    return (
        <div className={frameClass}>
            <div className={notchClass} />
            <div className={`relative h-full overflow-hidden ${screenRadius} bg-[#eef0ef]`} style={getWallpaperStyle(wallpaper)}>
                <div className="absolute inset-0 bg-[#eef0ef]/65" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_6%,rgba(255,255,255,0.78),transparent_34%),radial-gradient(circle_at_92%_70%,rgba(209,213,210,0.34),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(238,240,239,0.68))]" />
                <div className="pointer-events-none absolute -right-8 top-40 h-36 w-24 rotate-12 border border-[#b9b6ac]/15 bg-white/20" />
                <div className="pointer-events-none absolute bottom-28 left-4 h-px w-28 bg-[#9b927f]/18" />
                <div className="relative z-10 flex h-full flex-col">
                    <div className={`flex items-center justify-between text-[#3e4245] ${compact ? 'h-7 px-4 pt-1 text-[8px] font-semibold' : 'h-12 px-6 pt-2 text-[12px] font-bold'}`}>
                        <span>{timeLabel}</span>
                        <div className="flex items-center gap-1.5 text-[#3e4245]/80">
                            <CellSignalFull weight="fill" className={compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />
                            <WifiHigh weight="bold" className={compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />
                            <span>5G</span>
                            <BatteryHigh weight="fill" className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
                        </div>
                    </div>

                    {activeAppId === 'home' ? (
                        <div className="flex min-h-0 flex-1 flex-col">
                            <div className={compact ? 'px-4 pb-2 pt-2' : 'px-5 pb-2 pt-2'}>
                                <div className={`relative border border-[rgba(120,120,120,0.18)] bg-white/70 text-[#3e4245] shadow-[0_14px_30px_rgba(64,69,71,0.08),inset_0_1px_0_rgba(255,255,255,0.82)] ${compact ? 'rounded-2xl px-3 py-2.5' : 'rounded-[1.55rem] px-4 py-2.5'}`}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className={compact ? 'text-[10px] font-medium text-[#3e4245]/55' : 'text-[11px] font-medium text-[#3e4245]/55'}>{dateLabel}</div>
                                            <div className={compact ? 'mt-1 text-base font-semibold leading-tight' : 'mt-1 text-[1.55rem] font-semibold leading-none'}>{charName}</div>
                                            <div className={compact ? 'mt-1 line-clamp-2 text-[9px] leading-snug text-[#3e4245]/55' : 'mt-1.5 line-clamp-2 text-[11px] leading-snug text-[#3e4245]/60'}>{homeSurfaceCopy.headline}</div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div className={compact ? 'text-xl font-light leading-none' : 'text-[2.15rem] font-light leading-none tracking-normal'}>{timeLabel}</div>
                                            <div className={compact ? 'mt-1 text-[8px] text-[#3e4245]/42' : 'mt-2 text-[11px] text-[#3e4245]/45'}>主题桌面</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={`grid grid-cols-[0.88fr_1.12fr] gap-3 ${compact ? 'px-4 pb-1 pt-1' : 'px-5 pb-2 pt-2'}`}>
                                <div className={`relative flex items-center justify-center ${compact ? 'min-h-[7rem]' : 'min-h-[7.8rem]'}`}>
                                    <div className={`absolute rotate-[-5deg] rounded-[1.1rem] border border-[rgba(120,120,120,0.16)] bg-white/75 shadow-[0_12px_26px_rgba(64,69,71,0.09)] ${compact ? 'h-20 w-20' : 'h-24 w-24'}`} />
                                    <div className={`relative flex items-center justify-center overflow-hidden rounded-full border border-white/80 bg-[#f3f4f2] shadow-[0_16px_28px_rgba(64,69,71,0.11),inset_0_0_0_7px_rgba(255,255,255,0.58)] ${compact ? 'h-20 w-20' : 'h-24 w-24'}`}>
                                        {charAvatar ? (
                                            <img src={charAvatar} className="h-full w-full object-cover grayscale-[35%] contrast-[0.92] saturate-[0.55]" alt={charName} />
                                        ) : (
                                            <ChatCircleText weight="regular" className={compact ? 'h-8 w-8 text-[#62676b]' : 'h-11 w-11 text-[#62676b]'} />
                                        )}
                                    </div>
                                    {!compact && (
                                        <div className="absolute bottom-0 left-1 max-w-[8.75rem] -rotate-3 border border-[rgba(120,120,120,0.12)] bg-[#f8f6f1]/90 px-2.5 py-1 text-[9px] font-medium leading-snug text-[#3e4245]/62 shadow-sm">
                                            <span className="line-clamp-3 break-words">{homeSurfaceCopy.stickyNote}</span>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => onGenerateApp?.(spotlightApp)}
                                    className={`group relative border border-[rgba(120,120,120,0.18)] bg-white/72 text-left text-[#3e4245] shadow-[0_14px_28px_rgba(64,69,71,0.09),inset_0_1px_0_rgba(255,255,255,0.82)] active:scale-[0.985] ${compact ? 'rounded-2xl p-3' : 'rounded-[1.35rem] p-3'}`}
                                    aria-label={`读取 ${spotlightApp.name}`}
                                >
                                    <div className={compact ? 'text-[10px] font-semibold text-[#3e4245]/68' : 'text-sm font-semibold tracking-wide text-[#3e4245]'}>
                                        最后停留
                                    </div>
                                    <div className="mt-2.5 flex items-center gap-3">
                                        <span className="relative flex shrink-0">
                                            <span className={`flex items-center justify-center overflow-hidden rounded-full border border-[#8b8f91]/22 bg-[#f3f4f2] text-[#62676b] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ${compact ? 'h-10 w-10' : 'h-12 w-12'}`}>
                                                {renderAppGlyph(spotlightApp, compact ? 'h-5 w-5 text-[#62676b]' : 'h-6 w-6 text-[#62676b]', 'absolute inset-0 h-full w-full object-cover')}
                                            </span>
                                            <StoryPhoneUnreadDot />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className={compact ? 'block truncate text-[11px] font-semibold' : 'block truncate text-[13px] font-semibold'}>{spotlightApp.name} · {timeLabel}</span>
                                            <span className={compact ? 'mt-1 line-clamp-2 block text-[9px] leading-relaxed text-[#3e4245]/58' : 'mt-1 line-clamp-2 block text-[10px] leading-relaxed text-[#3e4245]/60'}>
                                                {homeSurfaceCopy.spotlightDetail}
                                            </span>
                                        </span>
                                    </div>
                                    <div className={compact ? 'mt-3 border-t border-[#8b8f91]/14 pt-2 text-[8px] text-[#3e4245]/36' : 'mt-3 border-t border-[#8b8f91]/14 pt-2 text-[10px] text-[#3e4245]/36'}>{homeSurfaceCopy.spotlightFooter}</div>
                                </button>
                            </div>

                            <div className={`story-phone-scroll min-h-0 flex-1 overflow-y-auto ${compact ? 'px-4 pb-4 pt-3' : 'px-5 pb-6 pt-4'}`}>
                                <div className={`grid grid-cols-4 ${compact ? 'gap-x-2 gap-y-4' : 'gap-x-3 gap-y-4'}`}>
                                    {phoneApps.map(app => {
                                        const active = app.id === spotlightApp.id;
                                        return (
                                            <div
                                                key={app.id}
                                                className="relative flex flex-col items-center gap-1.5"
                                            >
                                                <button
                                                    onClick={() => active ? onGenerateApp?.(app) : onOpenApp?.(app)}
                                                    className="group flex min-w-0 flex-col items-center gap-1.5 active:scale-95"
                                                    aria-label={active ? `读取 ${app.name}` : `打开 ${app.name}`}
                                                >
                                                    <span className="relative flex shrink-0">
                                                        <span
                                                            className={`flex ${compact ? 'h-10 w-10 rounded-xl' : 'h-12 w-12 rounded-[1.05rem]'} items-center justify-center overflow-hidden border border-[rgba(120,120,120,0.15)] bg-white/76 text-[#62676b] shadow-[0_8px_18px_rgba(64,69,71,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]`}
                                                        >
                                                            {renderAppGlyph(app, compact ? 'relative z-10 h-5 w-5 text-[#62676b]' : 'relative z-10 h-6 w-6 text-[#62676b]', 'absolute inset-0 h-full w-full object-cover')}
                                                        </span>
                                                        {active && <StoryPhoneUnreadDot />}
                                                    </span>
                                                    <span className={`${compact ? 'max-w-[3rem] text-[8px]' : 'max-w-[4rem] text-[10px]'} truncate font-medium text-[#3e4245]/70`}>{app.name}</span>
                                                </button>
                                                {app.isCustom && onUninstallApp && !compact && (
                                                    <button
                                                        onClick={() => onUninstallApp(app)}
                                                        className="absolute -right-1 -top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-white/70 bg-[#9b927f]/82 text-[12px] font-bold text-white shadow-sm active:scale-90"
                                                        aria-label={`卸载 ${app.name}`}
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {onInstallApp && !compact && (
                                        <button onClick={onInstallApp} className="flex flex-col items-center gap-1.5 active:scale-95">
                                            <span className="flex h-12 w-12 items-center justify-center rounded-[1.05rem] border border-[rgba(120,120,120,0.15)] bg-white/60 text-[#62676b] shadow-[0_8px_18px_rgba(64,69,71,0.07),inset_0_1px_0_rgba(255,255,255,0.85)]">
                                                <Plus weight="regular" className="h-6 w-6" />
                                            </span>
                                            <span className="max-w-[4rem] truncate text-[10px] font-medium text-[#3e4245]/70">安装</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {!compact && (
                                <div className="px-5 pb-5">
                                    <div className="grid grid-cols-4 gap-2.5 rounded-[2rem] border border-[rgba(120,120,120,0.16)] bg-white/58 p-2.5 shadow-[0_16px_30px_rgba(64,69,71,0.1),inset_0_1px_0_rgba(255,255,255,0.82)]">
                                        {dockApps.map(app => (
                                            <button
                                                key={`dock-${app.id}`}
                                                onClick={() => app.id === spotlightApp.id ? onGenerateApp?.(app) : onOpenApp?.(app)}
                                                className="group flex items-center justify-center active:scale-95"
                                                aria-label={`打开 ${app.name}`}
                                            >
                                                <span className="relative flex shrink-0">
                                                    <span
                                                        className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[1.05rem] border border-[rgba(120,120,120,0.14)] bg-white/76 text-[#62676b] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                                                    >
                                                        {renderAppGlyph(app, 'relative z-10 h-5 w-5 text-[#62676b]', 'absolute inset-0 h-full w-full object-cover')}
                                                    </span>
                                                    {app.id === spotlightApp.id && <StoryPhoneUnreadDot />}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={`story-phone-system-ui relative flex min-h-0 flex-1 flex-col ${appTheme.screen}`} style={getAppSystemStyle(appTheme)}>
                            {!useNativeAppChrome && (
                                <div className={`flex items-center justify-between border-b ${appTheme.border} ${appTheme.header} ${compact ? 'h-10 px-3' : 'h-12 px-4 py-2'}`}>
                                    {onBackHome ? (
                                        <button onClick={onBackHome} className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} flex shrink-0 items-center justify-center rounded-full ${appTheme.muted} active:scale-95`} aria-label="返回桌面">
                                            <CaretLeft weight="bold" className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                                        </button>
                                    ) : (
                                        <span className={compact ? 'w-4' : 'w-8'} />
                                    )}
                                    <div className="mx-2 flex min-w-0 flex-1 items-center justify-center gap-2">
                                        {displayApp && (
                                            <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${compact ? 'h-6 w-6' : 'h-8 w-8'}`} style={getAppIconStyle(displayApp, appTheme)}>
                                                {renderAppGlyph(displayApp, compact ? 'story-phone-force-white h-3.5 w-3.5 text-white' : 'story-phone-force-white h-4 w-4 text-white', 'absolute inset-0 h-full w-full object-cover')}
                                            </span>
                                        )}
                                        <span className="min-w-0 text-center">
                                            <span className={`${compact ? 'text-xs' : 'text-sm'} block truncate font-bold`}>{displayApp?.name || clue?.appName || 'App'}</span>
                                            {!compact && <span className={`${appTheme.muted} block truncate text-[10px]`}>{clue?.timestamp || charName}</span>}
                                        </span>
                                    </div>
                                    {onGenerateApp && currentApp ? (
                                        <button
                                            onClick={() => onGenerateApp(currentApp)}
                                            className={`${compact ? 'h-7 px-2 text-[9px]' : 'h-8 px-3 text-[11px]'} shrink-0 rounded-full font-bold active:scale-95 ${appTheme.accentSoft} ${appTheme.accent}`}
                                        >
                                            刷新
                                        </button>
                                    ) : (
                                        <span className={compact ? 'w-7' : 'w-12'} />
                                    )}
                                </div>
                            )}

                            <div className={`story-phone-scroll min-h-0 flex-1 overflow-y-auto ${compact ? 'px-3 py-3' : 'px-4 py-4'}`}>
                                {isLoading ? (
                                    <div className={`flex h-full flex-col items-center justify-center gap-3 text-center ${appTheme.muted}`}>
                                        <div className={`${compact ? 'h-7 w-7' : 'h-8 w-8'} animate-spin rounded-full border-2 border-current border-t-transparent opacity-70`} />
                                        <div className={compact ? 'text-[10px]' : 'text-xs'}>正在读取屏幕...</div>
                                    </div>
                                ) : clue && clue.appId === activeAppId && displayApp ? (
                                    <StoryPhoneAppContent
                                        app={displayApp}
                                        clue={clue}
                                        charName={charName}
                                        charAvatar={charAvatar}
                                        compact={compact}
                                        theme={appTheme}
                                        nestedRoute={nestedRoute}
                                        onNavigate={nestedNavigationEnabled ? setNestedRoute : undefined}
                                        onVisibleContentChange={onVisibleContentChange}
                                    />
                                ) : (
                                    <div className={`flex h-full flex-col items-center justify-center gap-3 text-center ${appTheme.muted}`}>
                                        <div className={`relative flex items-center justify-center overflow-hidden rounded-[1.35rem] ${appTheme.accentSoft} ${appTheme.accent} ${compact ? 'h-12 w-12' : 'h-16 w-16'}`}>
                                            {displayApp ? renderAppGlyph(displayApp, compact ? 'h-7 w-7' : 'h-9 w-9', 'absolute inset-0 h-full w-full object-cover') : <ChatCircleText weight="duotone" className={compact ? 'h-7 w-7' : 'h-9 w-9'} />}
                                        </div>
                                        <div className={compact ? 'text-[10px]' : 'text-xs'}>这里暂时没有新内容</div>
                                        {currentApp && onGenerateApp && (
                                            <button
                                                onClick={() => onGenerateApp(currentApp)}
                                                className={`${compact ? 'rounded-xl px-3 py-2 text-[10px]' : 'rounded-2xl px-4 py-2 text-xs'} font-bold text-white active:scale-95`}
                                                style={{ background: appTheme.accentHex }}
                                            >
                                                生成这页
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {hasActions && (
                                <div className={`grid grid-cols-2 gap-2 border-t ${appTheme.border} ${appTheme.header} ${compact ? 'p-2' : 'p-3'}`}>
                                    <button
                                        onClick={onPeekOnly}
                                        className={`${compact ? 'rounded-xl py-2 text-[10px]' : 'rounded-2xl py-3 text-xs'} ${appTheme.accentSoft} font-bold ${appTheme.muted} active:scale-95`}
                                    >
                                        只看看
                                    </button>
                                    <button
                                        onClick={onInsertContext}
                                        disabled={inserted}
                                        className={`${compact ? 'rounded-xl py-2 text-[10px]' : 'rounded-2xl py-3 text-xs'} font-bold text-white active:scale-95 disabled:bg-emerald-500`}
                                        style={{ background: inserted ? undefined : appTheme.accentHex }}
                                    >
                                        {inserted ? '已放进剧情' : '放进剧情'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {charAvatar && (
                    <div className={`absolute bottom-4 right-4 z-20 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 p-1 pr-2 text-white shadow-lg ${compact || activeAppId === 'home' || hasActions ? 'hidden' : ''}`}>
                        <img src={charAvatar} className="h-6 w-6 rounded-full object-cover" alt={charName} />
                        <span className="max-w-[7rem] truncate text-[10px] font-semibold">{charName}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StoryPhoneScreen;
