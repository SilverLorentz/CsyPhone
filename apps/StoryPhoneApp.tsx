import React,{ useEffect,useMemo,useRef,useState } from 'react';
import { AppID,CharacterProfile,APIConfig,Message,StoryPhoneCustomApp } from '../types';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { ContextBuilder } from '../utils/context';
import { getChatContextMirror } from '../utils/chatContextMirror';
import { safeResponseJson } from '../utils/safeApi';
import { selectSecondaryApiConfig } from '../utils/runtimeConfig';
import { extractThinking } from '../utils/thinkingExtractor';
import Modal from '../components/os/Modal';
import { CaretLeft,ImageSquare,UploadSimple,X } from '@phosphor-icons/react';
import StoryPhoneScreen, {
    PHONE_APPS,
    pickRandomPhoneApp,
    type PhoneAppDef,
    type PhoneClue,
    type PhoneClueItem,
    type StoryPhoneHomeSurface,
    type StoryPhoneAppId,
} from '../components/story-phone/StoryPhoneScreen';

const CUSTOM_APP_ID_PREFIX = 'story-custom-app-';
const CUSTOM_ICON_PRESETS = ['💳', '🗂️', '🔐', '🎧', '🍜', '🧾', '📍', '🪞'];
const CUSTOM_COLOR_PRESETS = ['#0ea5e9', '#10b981', '#f97316', '#e11d48', '#8b5cf6', '#0f172a'];

function extractJsonObject(raw: string): any | null {
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first < 0 || last < first) return null;
    try {
        return JSON.parse(cleaned.slice(first, last + 1));
    } catch {
        return null;
    }
}

function toPhoneAppDef(app: StoryPhoneCustomApp): PhoneAppDef {
    return {
        id: app.id,
        name: app.name,
        icon: app.icon || '▣',
        iconImage: app.iconImage,
        color: app.color || '#0ea5e9',
        prompt: app.prompt,
        isCustom: true,
    };
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('file read failed'));
        reader.readAsDataURL(file);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('image load failed'));
        image.src = src;
    });
}

async function createAppIconDataUrl(file: File): Promise<string> {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const sourceX = ((image.naturalWidth || image.width) - sourceSize) / 2;
    const sourceY = ((image.naturalHeight || image.height) - sourceSize) / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    return canvas.toDataURL('image/webp', 0.9);
}

function normalizeClue(value: any, app: PhoneAppDef): PhoneClue {
    const rawItems = Array.isArray(value?.items) ? value.items : [];
    const itemLimit = app.id === 'wechat' ? 14 : app.id === 'qq' ? 12 : 6;
    const itemValueLimit = app.id === 'wechat' ? 520 : app.id === 'qq' ? 900 : 260;
    const itemDetailLimit = app.id === 'wechat' ? 520 : app.id === 'qq' ? 520 : 320;
    const items = rawItems
        .slice(0, itemLimit)
        .map((item: any): PhoneClueItem => ({
            label: String(item?.label || item?.title || '记录').slice(0, 40),
            value: String(item?.value || item?.content || item?.text || '').slice(0, itemValueLimit),
            detail: item?.detail ? String(item.detail).slice(0, itemDetailLimit) : undefined,
        }))
        .filter((item: PhoneClueItem) => item.value.trim() || item.detail?.trim());

    return {
        appId: app.id,
        appName: String(value?.appName || app.name).slice(0, 20),
        title: String(value?.title || `${app.name}里亮了一下`).slice(0, 60),
        subtitle: value?.subtitle ? String(value.subtitle).slice(0, 80) : undefined,
        timestamp: value?.timestamp ? String(value.timestamp).slice(0, 40) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        items: items.length > 0 ? items : [{ label: '线索', value: String(value?.evidenceText || '屏幕上有一条没来得及藏好的记录。').slice(0, 260) }],
        evidenceText: String(value?.evidenceText || value?.insertSummary || '').slice(0, 800),
        insertSummary: String(value?.insertSummary || value?.evidenceText || '').slice(0, 800),
        wechatData: app.id === 'wechat' && value?.wechatData && typeof value.wechatData === 'object' ? value.wechatData : undefined,
    };
}

function formatFallbackHistory(messages: Awaited<ReturnType<typeof DB.getMessagesByCharId>>, char: CharacterProfile, userName: string): string {
    const limit = char.contextLimit || 500;
    return messages.slice(-limit).map(message => {
        const speaker = message.role === 'user' ? userName : message.role === 'assistant' ? char.name : '系统';
        const content = message.type === 'text' ? message.content : `[${message.type}]`;
        return `${speaker}: ${content}`;
    }).join('\n');
}

function cleanSeenPhoneField(value: string | undefined, fallback: string): string {
    const text = String(value || '')
        .replace(/<\/?seen_phone_page>/gi, '[seen_phone_page]')
        .trim();
    return text || fallback;
}

function cleanHomeSurfaceText(value: string | undefined): string {
    return String(value || '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, ' ')
        .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[[^\]]{1,20}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function limitHomeSurfaceText(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength).trimEnd()}...`;
}

function pickHomeSurfaceSnippet(value: string | undefined, maxLength: number): string {
    const text = cleanHomeSurfaceText(value);
    if (!text) return '';
    const segment = text
        .split(/[。！？!?；;\n]+/)
        .map(part => part.trim())
        .find(part => part.length >= 4) || text;
    return limitHomeSurfaceText(segment, maxLength);
}

function formatHomeSurfaceTime(timestamp?: number): string {
    if (!timestamp) return '刚刚';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '刚刚';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getCharacterInnerVoice(char: CharacterProfile): string {
    const moodState = char.moodState as { innerVoice?: unknown } | undefined;
    return typeof moodState?.innerVoice === 'string' ? moodState.innerVoice : '';
}

function buildHomeSurface(messages: Message[], char: CharacterProfile, spotlightAppName: string): StoryPhoneHomeSurface {
    const recentMessages = messages
        .filter(message => message.type === 'text' && message.metadata?.source !== 'story_phone')
        .slice()
        .reverse();
    const recentAssistant = recentMessages.find(message => message.role === 'assistant');
    const recentUser = recentMessages.find(message => message.role === 'user');
    const sourceMessage = recentAssistant || recentUser || recentMessages[0];
    const messageSnippet = pickHomeSurfaceSnippet(sourceMessage?.content, 28);
    const innerVoiceSnippet = pickHomeSurfaceSnippet(getCharacterInnerVoice(char), 28);
    const snippet = messageSnippet || innerVoiceSnippet;

    return {
        headline: snippet ? '刚才的对话还没暗下去。' : `${char.name} 的屏幕刚刚亮过。`,
        stickyNote: snippet ? `「${snippet}」` : '临时亮屏，桌面没有固定便签。',
        spotlightDetail: snippet
            ? `${spotlightAppName} 会贴着刚才那一幕生成。`
            : `${spotlightAppName} 里有一页等待读取。`,
        spotlightFooter: sourceMessage
            ? `最近对话 · ${formatHomeSurfaceTime(sourceMessage.timestamp)}`
            : '等待读取',
    };
}

function formatStoryPhoneContext(clue: PhoneClue, char: CharacterProfile, userName: string): string {
    const visibleContent = clue.items.map((item, index) => {
        const parts = [
            `${index + 1}. ${item.label}`,
            `   ${item.value}`,
            item.detail ? `   细节: ${item.detail}` : '',
        ].filter(Boolean);
        return parts.join('\n');
    }).join('\n');

    const stateNotes = [
        clue.timestamp ? `时间: ${clue.timestamp}` : '',
        clue.subtitle ? `状态: ${clue.subtitle}` : '',
    ].filter(Boolean).join('\n');

    return `<seen_phone_page>
${userName}刚才看见了你手机上的一页内容。

注意：
- 这是你手机里的内容，不是${userName}说的话。
- 你知道/意识到${userName}可能已经看见了。
- 请根据你的性格自然反应。

页面来源：${cleanSeenPhoneField(clue.appName, '未知 App')}
页面类型：${cleanSeenPhoneField(clue.title, `${clue.appName}页面`)}
可见内容：
${cleanSeenPhoneField(visibleContent || clue.evidenceText, '（没有可见条目）')}

页面状态：
${cleanSeenPhoneField(stateNotes, '无额外状态')}

可能影响：
${cleanSeenPhoneField(clue.insertSummary || clue.evidenceText || `${userName}看见了${char.name}手机里的${clue.appName}内容。`, '可能影响你接下来的情绪和回复。')}
</seen_phone_page>`;
}

const StoryPhoneApp: React.FC = () => {
    const { characters, activeCharacterId, apiConfig, userProfile, appParams, openApp, closeApp, addToast, updateCharacter } = useOS();
    const targetCharId = typeof appParams?.targetCharId === 'string' ? appParams.targetCharId : activeCharacterId;
    const char = useMemo(
        () => characters.find(c => c.id === targetCharId) || characters.find(c => c.id === activeCharacterId) || characters[0],
        [activeCharacterId, characters, targetCharId],
    );

    const customApps = useMemo(
        () => char?.storyPhoneState?.customApps || [],
        [char?.storyPhoneState?.customApps],
    );
    const installedApps = useMemo(
        () => [...PHONE_APPS, ...customApps.map(toPhoneAppDef)],
        [customApps],
    );

    const [spotlightApp, setSpotlightApp] = useState<PhoneAppDef>(() => pickRandomPhoneApp(PHONE_APPS));
    const [activeAppId, setActiveAppId] = useState<StoryPhoneAppId | 'home'>('home');
    const [clue, setClue] = useState<PhoneClue | null>(null);
    const [visibleClue, setVisibleClue] = useState<PhoneClue | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [inserted, setInserted] = useState(false);
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [newAppName, setNewAppName] = useState('');
    const [newAppIcon, setNewAppIcon] = useState(CUSTOM_ICON_PRESETS[0]);
    const [newAppIconImage, setNewAppIconImage] = useState<string | null>(null);
    const [newAppColor, setNewAppColor] = useState(CUSTOM_COLOR_PRESETS[0]);
    const [newAppPrompt, setNewAppPrompt] = useState('');
    const [homeSurface, setHomeSurface] = useState<StoryPhoneHomeSurface | undefined>();
    const iconFileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setSpotlightApp(pickRandomPhoneApp(installedApps));
        setActiveAppId('home');
        setClue(null);
        setVisibleClue(null);
        setInserted(false);
    }, [char?.id]);

    useEffect(() => {
        const appStillInstalled = installedApps.some(app => app.id === activeAppId);
        if (activeAppId !== 'home' && !appStillInstalled) {
            setActiveAppId('home');
            setClue(null);
            setVisibleClue(null);
            setInserted(false);
        }
        if (!installedApps.some(app => app.id === spotlightApp.id)) {
            setSpotlightApp(pickRandomPhoneApp(installedApps));
        }
    }, [activeAppId, installedApps, spotlightApp.id]);

    useEffect(() => {
        if (!char) {
            setHomeSurface(undefined);
            return;
        }

        let cancelled = false;
        DB.getMessagesByCharId(char.id)
            .then(messages => {
                if (!cancelled) {
                    setHomeSurface(buildHomeSurface(messages, char, spotlightApp.name));
                }
            })
            .catch(error => {
                console.error('[StoryPhone] home surface load failed:', error);
                if (!cancelled) {
                    setHomeSurface(buildHomeSurface([], char, spotlightApp.name));
                }
            });

        return () => {
            cancelled = true;
        };
    }, [char, spotlightApp.name]);

    const handleBack = () => {
        if (activeAppId !== 'home') {
            setActiveAppId('home');
            return;
        }
        if (appParams?.returnApp === AppID.Chat && char?.id) {
            openApp(AppID.Chat, { targetCharId: char.id });
            return;
        }
        closeApp();
    };

    const resetInstallForm = () => {
        setNewAppName('');
        setNewAppIcon(CUSTOM_ICON_PRESETS[0]);
        setNewAppIconImage(null);
        setNewAppColor(CUSTOM_COLOR_PRESETS[0]);
        setNewAppPrompt('');
    };

    const handleOpenInstallModal = () => {
        resetInstallForm();
        setShowInstallModal(true);
    };

    const handleUploadIcon = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            addToast('请选择图片文件', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            addToast('图标图片不要超过 5MB', 'error');
            return;
        }

        try {
            const dataUrl = await createAppIconDataUrl(file);
            setNewAppIconImage(dataUrl);
            addToast('图标已上传', 'success');
        } catch (error) {
            console.error('[StoryPhone] icon upload failed:', error);
            addToast('图标读取失败，换张图试试', 'error');
        }
    };

    const handleInstallApp = () => {
        if (!char) return;
        const name = newAppName.trim().slice(0, 14);
        const prompt = newAppPrompt.trim().slice(0, 500);
        if (!name || !prompt) {
            addToast('App 名称和生成方向都要填', 'error');
            return;
        }

        const app: StoryPhoneCustomApp = {
            id: `${CUSTOM_APP_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            icon: newAppIcon.trim().slice(0, 4) || CUSTOM_ICON_PRESETS[0],
            iconImage: newAppIconImage || undefined,
            color: newAppColor,
            prompt,
            installedAt: Date.now(),
        };
        const nextCustomApps = [...customApps, app];
        const appDef = toPhoneAppDef(app);

        updateCharacter(char.id, {
            storyPhoneState: {
                ...char.storyPhoneState,
                customApps: nextCustomApps,
            },
        });
        setSpotlightApp(appDef);
        setActiveAppId(appDef.id);
        setClue(null);
        setVisibleClue(null);
        setInserted(false);
        setShowInstallModal(false);
        resetInstallForm();
        addToast(`已安装 ${app.name}`, 'success');
    };

    const handleUninstallApp = (app: PhoneAppDef) => {
        if (!char || !app.isCustom) return;
        const nextCustomApps = customApps.filter(item => item.id !== app.id);
        const nextInstalledApps = [...PHONE_APPS, ...nextCustomApps.map(toPhoneAppDef)];

        updateCharacter(char.id, {
            storyPhoneState: {
                ...char.storyPhoneState,
                customApps: nextCustomApps,
            },
        });
        if (activeAppId === app.id) {
            setActiveAppId('home');
            setClue(null);
            setVisibleClue(null);
            setInserted(false);
        }
        if (spotlightApp.id === app.id) {
            setSpotlightApp(pickRandomPhoneApp(nextInstalledApps));
        }
        addToast(`已卸载 ${app.name}`, 'success');
    };

    const buildGenerationMessages = async (app: PhoneAppDef, config: APIConfig) => {
        if (!char) return null;
        const mirror = await getChatContextMirror(char.id);
        const wechatTask = app.id === 'wechat' ? `
### [Task: 剧情查手机 / 微信专属]
你正在生成 ${char.name} 真正在使用的微信，而不是一张“微信风格线索卡”。

核心原则：
- 微信是 ${char.name} 长期使用的社交 App，有自己的联系人、群聊、聊天历史、朋友圈、收藏、账单和个人资料。
- 所有内容都要从 ${char.name} 的人设、世界观、关系阶段、主聊天历史、近期事件、本轮可见回复和本轮 thinking 推导。
- 不要写“示例联系人/示例群聊/占位数据”。不要复用截图里的固定名字。不要生成空壳入口。
- 可以合理补全手机里本来会存在的普通社交数据，但必须和角色身份、城市、工作/生活圈、亲密关系、当前剧情一致。
- 用户最终只会把当前打开页面放进剧情；因此 wechatData 可以丰富，但 insertSummary 只总结当前停留页。

输出 JSON 对象，字段必须如下：
{
  "appName": "微信",
  "title": "当前停留页标题，例如 微信 / 某个聊天 / 朋友圈 / 我",
  "subtitle": "当前页状态，例如 未读、置顶、屏幕亮起中",
  "timestamp": "当前屏幕时间",
  "items": [{ "label": "当前停留页上可见的列表项或字段", "value": "当前页可见文字", "detail": "时间/状态/备注" }],
  "evidenceText": "只说明当前停留页可见内容意味着什么",
  "insertSummary": "用户如果点击放进剧情，只写当前停留页的一到两句影响摘要",
  "wechatData": {
    "profile": { "id": "owner", "nickname": "${char.name}", "wechatId": "角色自己的微信号，若人设无明确值则生成符合角色的短ID", "avatar": "可选头像URL", "statusText": "角色当前微信状态" },
    "chats": [{ "id": "chat-id", "type": "private|group|system|fileHelper|official", "title": "会话名", "subtitle": "首页预览", "time": "时间", "unreadCount": 0, "pinned": false, "muted": false }],
    "chatMessages": { "chat-id": { "id": "chat-id", "title": "会话名", "participants": [], "messages": [{ "id": "msg-id", "sender": "owner|other|system", "senderId": "可选", "senderName": "发送者", "type": "text|image|file|voice|redPacket|transfer|recall|system|location|link", "text": "微信里可见的原文", "fileName": "可选", "amount": "可选金额", "duration": "可选语音时长", "time": "可选时间", "status": "sent|read|withdrawn|failed" }], "inputHint": "只读输入栏提示" } },
    "contacts": [{ "id": "contact-id", "name": "联系人昵称", "remark": "角色给对方的备注", "wechatId": "可选微信号", "groupKey": "首字母/分组", "tags": ["关系标签"], "source": "来源", "bio": "签名/简介", "relationshipHint": "和角色的关系暗示" }],
    "groups": [{ "id": "group-id", "name": "群聊名", "memberCount": 0, "members": [] }],
    "moments": { "cover": "可选封面URL", "posts": [{ "id": "post-id", "authorId": "联系人或owner id", "authorName": "发布者", "authorAvatar": "可选", "text": "朋友圈正文", "images": [], "location": "可选地点", "time": "时间", "likes": ["点赞者姓名"], "comments": [{ "id": "comment-id", "authorName": "评论者", "text": "评论内容" }] }] },
    "favorites": [{ "id": "fav-id", "type": "text|image|link|file|voice|chatRecord", "title": "标题", "content": "内容", "fileName": "可选文件名", "time": "时间" }],
    "services": { "groups": [{ "id": "service-group", "title": "分组名", "entries": [{ "id": "entry-id", "title": "入口名", "subtitle": "说明", "feature": "payments|services|favorites|moments|works|cards|stickers|settings" }] }] },
    "payments": [{ "id": "payment-id", "title": "交易标题", "subtitle": "说明", "amount": "金额", "time": "时间", "status": "状态", "type": "income|expense|transfer|refund" }],
    "works": [{ "id": "work-id", "title": "作品标题", "text": "说明", "time": "时间", "metrics": "播放/点赞等" }],
    "cards": [{ "id": "card-id", "title": "卡券/小店订单", "subtitle": "说明", "time": "时间", "status": "状态" }],
    "stickers": [{ "id": "sticker-id", "title": "表情包名", "usageHint": "常用语境" }],
    "settings": { "groups": [{ "id": "setting-group", "entries": [{ "id": "setting-id", "title": "设置项", "subtitle": "可选状态" }] }] },
    "enabledFeatures": ["services","favorites","moments","works","cards","stickers","settings","scan","search","nearby","miniPrograms","games"],
    "desktopLoggedInText": "可选，例如 Windows 微信已登录"
  }
}

微信内容数量目标：
- chats: 8-14 个，至少包含私聊、群聊、服务通知/公众号、文件传输助手中的 3 类；每个 chat 都必须有 chatMessages。
- chatMessages: 每个会话至少 3-8 条可见消息；私聊和群聊禁止只有 1 条或 2 条。服务通知/公众号/文件传输助手也至少 2 条。群聊要有不同 senderName；可以包含撤回、红包、转账、语音、文件、位置、链接。
- 不要只给“和 user / 主聊天对象”的会话完整记录；${char.name} 的同事、好友、群聊、家人/客户等其他会话也必须有真实历史。禁止把 chat.subtitle 当作唯一消息就结束。
- contacts: 12-30 个，必须能支撑 chats、groups、moments 里的姓名；每个联系人至少有 remark/name 与 relationshipHint 或 bio/source/tags。
- groups: 2-6 个，和 chats 中的群聊对应。
- moments.posts: 6-12 条，必须同时包含 ${char.name} 自己和好友/联系人发布的朋友圈；至少 4 条来自好友/联系人。每条尽量有 likes 或 comments，互动人名来自 contacts/chats。
- 朋友圈不是证据摘要，也不是联系人资料页。禁止把联系人 bio、relationshipHint、聊天预览、手机线索说明原样塞成朋友圈。每条 post.text 都要像发布者本人会发在朋友圈的信息流原文：生活、工作、情绪、转发、位置、照片说明或日常片段。
- post.text 绝不能写成人设/关系标签，例如“旧识，重点关注对象”“母亲，利益与家族纽带”“家族威严，人生导师”“同事，工作关系”“客户，利益相关”。这些只能出现在 contacts 的 relationshipHint/bio/tags，不能出现在朋友圈。
- 好友朋友圈要像对方自己发的原话：可以是“刚开完会，楼下的灯还亮着”“转发文章：关于东南沿海自贸区产...”“下午回老宅吃饭，别等我”，而不是对这个人的档案摘要。
- favorites/payments/works/cards/stickers/settings: 根据角色身份和剧情尽量给，不要全部空；没有依据的入口不要启用。
- enabledFeatures 只启用有数据或微信常驻合理入口；如果启用某入口，对应页面必须有可显示内容或合理空状态原因。

当前停留页规则：
- title/items/evidenceText/insertSummary 描述“手机当前正打开的那一页”，可以是聊天首页、某个聊天、通讯录、朋友圈或我。
- 不要把整个 wechatData 的隐藏内容塞进 items 或 insertSummary。
- 只输出 JSON，不要 Markdown。` : '';

        const genericTask = `### [Task: 剧情查手机]
你正在生成 ${char.name} 手机里「${app.name}」App 的可见内容。

App 生成方向：
${app.prompt}

输出 JSON 对象，字段必须如下：
{
  "appName": "${app.name}",
  "title": "屏幕标题",
  "subtitle": "可选的一句状态/时间/联系人",
  "timestamp": "可选时间",
  "items": [{ "label": "屏幕字段/列表名", "value": "手机屏幕上逐字或近似逐字可见的内容", "detail": "可选的小字、时间、地点、备注" }],
  "evidenceText": "用自然语言说明这些屏幕内容意味着什么",
  "insertSummary": "如果用户选择放进剧情，要写入聊天上下文的一到两句话摘要"
}

硬性要求：
- 内容必须紧贴当前聊天、完整人设、世界观、关系阶段和 ${char.name} 的本轮 thinking。
- 可以读 thinking 来贴近潜台词，但不要复述 thinking，不要提到“思考链”。
- items 是手机界面上看到的原文/列表项/标题/记录，不要写成剧情摘要；除非 App 本身是备忘录或邮件正文，否则不要把 item.value 写成一整段旁白。
- insertSummary 是给后续剧情用的摘要，不能简单复制 items 的全文。
- evidenceText 可以解释用户看到了什么，但不要和 insertSummary 逐字重复。
- 这是手机屏幕里的证据，不是旁白；不要替用户或角色做出后续反应。
- 如果这是用户安装的自定义 App，也要把它当作 ${char.name} 手机里真实存在的 App 来写。
- 只输出 JSON，不要 Markdown。`;

        const task = app.id === 'wechat' ? wechatTask : genericTask;

        if (mirror) {
            return [
                ...mirror.messages,
                {
                    role: 'user',
                    content: `### [Main Chat Mirror]
以下是主聊天刚刚完成后的镜像信息，供你对齐剧情后台。

【${char.name} 本轮可见回复】
${mirror.assistantReply || '（无）'}

【${char.name} 本轮 thinking / 思考链】
${mirror.thinking || '（无）'}

【镜像元信息】
主聊天实际上下文消息数：${mirror.historyMsgCount}
角色上下文上限：${mirror.contextLimit}
模型：${mirror.model || config.model}

${task}`,
                },
            ];
        }

        const messages = await DB.getMessagesByCharId(char.id);
        const fallbackContext = ContextBuilder.buildCoreContext(char, userProfile, true);
        return [{
            role: 'user',
            content: `${fallbackContext}

### [Chat Context: fallback uses character contextLimit]
${formatFallbackHistory(messages, char, userProfile.name)}

${task}`,
        }];
    };

    const generateForApp = async (app: PhoneAppDef) => {
        if (!char) return;
        const config = (selectSecondaryApiConfig() || apiConfig) as APIConfig;
        if (!config?.baseUrl || !config.apiKey || !config.model) {
            addToast('先配置可用的副模型或主模型 API', 'error');
            return;
        }

        setActiveAppId(app.id);
        setIsLoading(true);
        setInserted(false);
        setVisibleClue(null);
        try {
            const messages = await buildGenerationMessages(app, config);
            if (!messages) return;
            const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify({
                    model: config.model,
                    messages,
                    temperature: 0.82,
                    stream: false,
                }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await safeResponseJson(response);
            const raw = data.choices?.[0]?.message?.content
                || data.choices?.[0]?.message?.reasoning_content
                || data.choices?.[0]?.message?.thinking
                || '';
            const extracted = extractThinking(String(raw));
            const parsed = extractJsonObject(extracted.content || String(raw));
            if (!parsed) throw new Error('JSON parse failed');
            setClue(normalizeClue(parsed, app));
        } catch (error) {
            console.error('[StoryPhone] generate failed:', error);
            addToast('手机内容没生成出来，再点一次试试', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const wallpaper = char?.dateBackground || char?.chatBackground || 'linear-gradient(145deg, #1f2937 0%, #0f172a 46%, #4c1d95 100%)';

    const handleInsertContext = async () => {
        if (!char || !clue || inserted) return;
        const insertClue = visibleClue && visibleClue.appId === clue.appId ? visibleClue : clue;
        const sourceApp = installedApps.find(app => app.id === insertClue.appId);
        const fullContext = formatStoryPhoneContext(insertClue, char, userProfile.name);
        await DB.saveMessage({
            charId: char.id,
            role: 'system',
            type: 'text',
            content: fullContext,
            metadata: {
                source: 'story_phone',
                phonePeekAppId: insertClue.appId,
                phonePeekAppName: insertClue.appName,
                phonePeekTitle: insertClue.title,
                phonePeekSubtitle: insertClue.subtitle,
                phonePeekTimestamp: insertClue.timestamp,
                phonePeekItems: insertClue.items,
                phonePeekEvidence: insertClue.evidenceText,
                phonePeekInsertSummary: insertClue.insertSummary,
                phonePeekWallpaper: wallpaper,
                phonePeekAppIcon: sourceApp?.icon,
                phonePeekAppIconImage: sourceApp?.iconImage,
                phonePeekAppColor: sourceApp?.color,
                phonePeekAppIsCustom: sourceApp?.isCustom,
                charName: char.name,
                charAvatar: char.avatar,
            },
        });
        setInserted(true);
        addToast('已放进剧情上下文', 'success');
    };

    if (!char) {
        return (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-white">
                <button onClick={closeApp} className="rounded-full bg-white/10 px-4 py-2 text-sm">返回</button>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 overflow-hidden bg-[#e8ebe9] text-[#3e4245]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(255,255,255,0.78),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(210,214,211,0.42),transparent_30%),linear-gradient(180deg,#f2f4f2_0%,#e8ebe9_54%,#d9ddda_100%)]" />
            <div className="absolute left-10 top-24 h-px w-36 bg-[#9b927f]/18" />
            <div className="absolute bottom-24 right-8 h-24 w-16 rotate-12 border border-[#9b927f]/10 bg-white/20" />

            <div className="relative z-10 flex h-full flex-col px-4 pb-5 pt-10">
                <div className="mb-3 flex items-center justify-between">
                    <button
                        onClick={handleBack}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(120,120,120,0.18)] bg-white/70 text-[#3e4245] shadow-[0_10px_22px_rgba(64,69,71,0.1),inset_0_1px_0_rgba(255,255,255,0.88)] active:scale-95"
                        aria-label="返回"
                    >
                        <CaretLeft weight="bold" className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 text-center">
                        <div className="text-[15px] font-semibold tracking-wide">{char.name} 的手机</div>
                        <div className="text-[10px] font-medium text-[#3e4245]/45">临时许可 · 屏幕亮起中</div>
                    </div>
                    <img src={char.avatar} className="h-10 w-10 rounded-2xl object-cover grayscale-[25%] saturate-[0.72] shadow-[0_10px_22px_rgba(64,69,71,0.14)] ring-1 ring-white/80" alt={char.name} />
                </div>

                <div className="mx-auto flex min-h-0 w-full max-w-[23rem] flex-1 items-center justify-center">
                    <StoryPhoneScreen
                        charName={char.name}
                        charAvatar={char.avatar}
                        wallpaper={wallpaper}
                        apps={installedApps}
                        activeAppId={activeAppId}
                        spotlightApp={spotlightApp}
                        clue={clue}
                        isLoading={isLoading}
                        inserted={inserted}
                        homeSurface={homeSurface}
                        onBackHome={() => setActiveAppId('home')}
                        onOpenApp={app => setActiveAppId(app.id)}
                        onGenerateApp={app => void generateForApp(app)}
                        onInstallApp={handleOpenInstallModal}
                        onUninstallApp={handleUninstallApp}
                        onPeekOnly={() => setActiveAppId('home')}
                        onInsertContext={handleInsertContext}
                        onVisibleContentChange={setVisibleClue}
                    />
                </div>
            </div>

            <Modal
                isOpen={showInstallModal}
                title="安装 App"
                onClose={() => setShowInstallModal(false)}
                footer={(
                    <>
                        <button
                            onClick={() => setShowInstallModal(false)}
                            className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-500 active:scale-95"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleInstallApp}
                            disabled={!newAppName.trim() || !newAppPrompt.trim()}
                            className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white active:scale-95 disabled:bg-slate-200 disabled:text-slate-400"
                        >
                            安装
                        </button>
                    </>
                )}
            >
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div
                            className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-3xl text-white shadow-lg ring-1 ring-black/5"
                            style={{ background: newAppColor }}
                        >
                            {newAppIconImage ? (
                                <img src={newAppIconImage} className="absolute inset-0 h-full w-full object-cover" alt="" />
                            ) : (
                                newAppIcon
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">App 名称</label>
                            <input
                                value={newAppName}
                                onChange={event => setNewAppName(event.target.value)}
                                maxLength={14}
                                placeholder="银行 / 邮箱 / 秘密相册"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-400">图标</label>
                        <input
                            ref={iconFileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleUploadIcon}
                        />
                        <div className="mb-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => iconFileInputRef.current?.click()}
                                className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm active:scale-95"
                            >
                                <UploadSimple className="h-4 w-4" weight="bold" />
                                上传图片
                            </button>
                            {newAppIconImage && (
                                <button
                                    type="button"
                                    onClick={() => setNewAppIconImage(null)}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-95"
                                    aria-label="移除上传图标"
                                >
                                    <X className="h-4 w-4" weight="bold" />
                                </button>
                            )}
                            <div className="ml-auto flex items-center gap-1 rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] font-semibold text-slate-400">
                                <ImageSquare className="h-3.5 w-3.5" weight="bold" />
                                256px 方形裁切
                            </div>
                        </div>
                        <div className="grid grid-cols-8 gap-2">
                            {CUSTOM_ICON_PRESETS.map(icon => (
                                <button
                                    key={icon}
                                    onClick={() => {
                                        setNewAppIcon(icon);
                                        setNewAppIconImage(null);
                                    }}
                                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-lg active:scale-95 ${!newAppIconImage && newAppIcon === icon ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                                    aria-label={`选择图标 ${icon}`}
                                >
                                    {icon}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-400">颜色</label>
                        <div className="flex items-center gap-2">
                            {CUSTOM_COLOR_PRESETS.map(color => (
                                <button
                                    key={color}
                                    onClick={() => setNewAppColor(color)}
                                    className={`h-8 w-8 rounded-xl ring-offset-2 active:scale-95 ${newAppColor === color ? 'ring-2 ring-slate-900' : 'ring-1 ring-slate-200'}`}
                                    style={{ background: color }}
                                    aria-label={`选择颜色 ${color}`}
                                />
                            ))}
                            <input
                                type="color"
                                value={newAppColor}
                                onChange={event => setNewAppColor(event.target.value)}
                                className="h-8 w-10 cursor-pointer rounded-xl border border-slate-200 bg-white"
                                aria-label="自定义颜色"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">生成方向</label>
                        <textarea
                            value={newAppPrompt}
                            onChange={event => setNewAppPrompt(event.target.value)}
                            maxLength={500}
                            placeholder="例如：生成近期银行卡流水、余额变动和一条不太想被看到的转账备注。"
                            className="h-28 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700 outline-none focus:border-slate-400"
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default StoryPhoneApp;
