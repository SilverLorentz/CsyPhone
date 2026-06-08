import React from 'react';
import {
    BellSimple,
    CaretLeft,
    CaretRight,
    ChatCircleText,
    CreditCard,
    DotsThree,
    FileText,
    GearSix,
    GlobeHemisphereWest,
    ImageSquare,
    MagnifyingGlass,
    MapPin,
    Package,
    Plus,
    QrCode,
    Receipt,
    ShareNetwork,
    Smiley,
    Tag,
    UserCircle,
    UsersThree,
    VideoCamera,
    Wallet,
    Waveform,
} from '@phosphor-icons/react';
import type {
    WeChatCardItem,
    WeChatChatData,
    WeChatChatSummary,
    WeChatContact,
    WeChatData,
    WeChatFavoriteItem,
    WeChatFeatureKey,
    WeChatMessage,
    WeChatMomentPost,
    WeChatPaymentRecord,
    WeChatProfile,
    WeChatServiceGroup,
    WeChatSettingsData,
    WeChatStickerItem,
    WeChatWorkItem,
} from './wechatTypes';

type WeChatMainTab = 'chats' | 'contacts' | 'discover' | 'me';
type WeChatContactBucket = 'newFriends' | 'groups' | 'tags' | 'official';

type WeChatRoute =
    | { name: 'main'; tab: WeChatMainTab }
    | { name: 'chat'; chatId: string; fromTab: WeChatMainTab; contactId?: string }
    | { name: 'profile'; contactId: string; fromTab: WeChatMainTab }
    | { name: 'contactBucket'; bucket: WeChatContactBucket; fromTab: WeChatMainTab }
    | { name: 'moments'; fromTab: WeChatMainTab }
    | { name: 'favorites'; fromTab: WeChatMainTab }
    | { name: 'services'; fromTab: WeChatMainTab }
    | { name: 'payments'; fromTab: WeChatMainTab }
    | { name: 'paymentDetail'; paymentId: string; fromTab: WeChatMainTab }
    | { name: 'works'; fromTab: WeChatMainTab }
    | { name: 'cards'; fromTab: WeChatMainTab }
    | { name: 'stickers'; fromTab: WeChatMainTab }
    | { name: 'settings'; fromTab: WeChatMainTab }
    | { name: 'feature'; feature: WeChatFeatureKey; fromTab: WeChatMainTab };

export interface WeChatVisibleItem {
    label: string;
    value: string;
    detail?: string;
}

export interface WeChatVisibleContent {
    title: string;
    pageType: string;
    items: WeChatVisibleItem[];
    content: string;
    summary: string;
}

interface SourceClueItem {
    label: string;
    value: string;
    detail?: string;
}

interface SourceClue {
    title?: string;
    subtitle?: string;
    timestamp?: string;
    items?: SourceClueItem[];
    evidenceText?: string;
    wechatData?: Partial<WeChatData>;
}

const FEATURE_LABELS: Record<WeChatFeatureKey, string> = {
    services: '服务',
    favorites: '收藏',
    moments: '朋友圈',
    works: '视频号',
    cards: '小店与卡包',
    stickers: '表情',
    settings: '设置',
    scan: '扫一扫',
    search: '搜一搜',
    nearby: '附近',
    miniPrograms: '小程序',
    games: '游戏',
};

const MAIN_TABS: Array<{ key: WeChatMainTab; label: string; icon: typeof ChatCircleText }> = [
    { key: 'chats', label: '微信', icon: ChatCircleText },
    { key: 'contacts', label: '通讯录', icon: UsersThree },
    { key: 'discover', label: '发现', icon: ShareNetwork },
    { key: 'me', label: '我', icon: UserCircle },
];

const CONTACT_BUCKET_LABELS: Record<WeChatContactBucket, string> = {
    newFriends: '新的朋友',
    groups: '群聊',
    tags: '标签',
    official: '公众号 / 服务号',
};

const textFrom = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const arrayFrom = <T,>(value: T[] | undefined) => (Array.isArray(value) ? value : []);

function compactText(parts: Array<string | undefined>, fallback = '') {
    return parts.map(part => textFrom(part)).filter(Boolean).join(' · ') || fallback;
}

function truncate(value: string, max = 140) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > max ? `${normalized.slice(0, max).trimEnd()}...` : normalized;
}

function getInitial(value?: string) {
    return textFrom(value).slice(0, 1) || '微';
}

function detectMessageType(text: string): WeChatMessage['type'] {
    if (/撤回/.test(text)) return 'recall';
    if (/红包/.test(text)) return 'redPacket';
    if (/转账|收款|付款|退款|¥|￥/.test(text)) return 'transfer';
    if (/语音/.test(text)) return 'voice';
    if (/图片|照片|截图/.test(text)) return 'image';
    if (/文件|文档|附件/.test(text)) return 'file';
    if (/位置|定位|地址/.test(text)) return 'location';
    if (/链接|http|网页/.test(text)) return 'link';
    return 'text';
}

function splitVisibleSentences(value?: string, max = 4) {
    const raw = textFrom(value);
    if (!raw) return [];
    const seen = new Set<string>();
    const chunks = raw
        .split(/\n+/)
        .flatMap(line => line.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) || [line])
        .map(line => line.trim())
        .filter(Boolean);

    return chunks.filter(chunk => {
        const normalized = chunk.replace(/\s+/g, ' ');
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    }).slice(0, max);
}

function messageVisibleText(message: WeChatMessage) {
    return compactText([message.text, message.fileName, message.amount, message.duration]);
}

function getMessageMinimum(chat?: WeChatChatSummary) {
    if (!chat) return 2;
    if (chat.type === 'private' || chat.type === 'group') return 3;
    return 2;
}

function findContactForChat(chat: WeChatChatSummary | undefined, contacts: WeChatContact[], existing?: WeChatChatData) {
    if (!chat && !existing) return undefined;
    return contacts.find(contact => {
        const displayName = contact.remark || contact.name;
        return chat?.title === contact.name
            || chat?.title === contact.remark
            || existing?.participants?.some(participant => participant.id === contact.id || participant.name === contact.name || participant.remark === displayName);
    });
}

function buildConversationDepthMessages(
    messages: WeChatMessage[],
    chat: WeChatChatSummary | undefined,
    contacts: WeChatContact[],
    existing?: WeChatChatData,
) {
    const minCount = getMessageMinimum(chat);
    const current = messages.flatMap(message => {
        if (message.sender === 'system') return [message];
        const parts = splitVisibleSentences(message.text, 4);
        if (parts.length <= 1) return [message];
        return parts.map((part, index): WeChatMessage => ({
            ...message,
            id: `${message.id || chat?.id || existing?.id || 'msg'}-part-${index}`,
            text: part,
            time: index === 0 ? message.time : undefined,
        }));
    });
    const currentTexts = new Set(current.map(message => messageVisibleText(message)).filter(Boolean));
    const contact = findContactForChat(chat, contacts, existing);
    const baseId = chat?.id || existing?.id || contact?.id || 'chat';
    const senderName = contact?.remark || contact?.name || (chat?.type === 'group' ? chat.title : chat?.title) || existing?.title;
    const senderId = contact?.id;
    const senderAvatar = contact?.avatar || chat?.avatar || existing?.avatar;

    if (chat?.time && !current.some(message => message.sender === 'system' && (message.time === chat.time || message.text === chat.time))) {
        current.unshift({
            id: `${baseId}-time-marker`,
            sender: 'system',
            type: 'system',
            text: chat.time,
        });
    }

    const sourceTexts = [
        ...(current.length <= 2 ? current.flatMap(message => splitVisibleSentences(message.text, 3)) : []),
        ...splitVisibleSentences(chat?.subtitle, 4),
        ...splitVisibleSentences(contact?.relationshipHint, 2),
        ...splitVisibleSentences(contact?.bio, 1),
    ].filter(text => text && !currentTexts.has(text));

    sourceTexts.slice(0, Math.max(0, minCount - current.length)).forEach((text, index) => {
        currentTexts.add(text);
        current.push({
            id: `${baseId}-expanded-${index}`,
            sender: chat?.type === 'system' || chat?.type === 'official' ? 'system' : 'other',
            senderId,
            senderName,
            avatar: senderAvatar,
            type: chat?.type === 'system' || chat?.type === 'official' ? 'system' : detectMessageType(text),
            text,
        });
    });

    return current;
}

function parseMessagesFromItem(item: SourceClueItem, ownerName: string, chatId: string): WeChatMessage[] {
    const rawLines = textFrom(item.value)
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean);
    const lines = rawLines.length > 0 ? rawLines : [item.value || item.detail || ''];
    const messages = lines.filter(Boolean).map((raw, index): WeChatMessage => {
        const match = raw.match(/^([^:：]{1,16})[:：]\s*(.+)$/);
        const speaker = match?.[1]?.trim();
        const text = match?.[2]?.trim() || raw;
        const recalled = detectMessageType(text) === 'recall';
        const mine = speaker === '我' || speaker === ownerName || /^(me|owner|self)$/i.test(speaker || '');
        return {
            id: `${chatId}-msg-${index}`,
            sender: recalled ? 'system' : mine ? 'owner' : 'other',
            senderName: mine ? ownerName : speaker || item.label,
            type: recalled ? 'system' : detectMessageType(text),
            text,
            time: index === 0 ? item.detail : undefined,
        };
    });

    if (item.detail && !messages.some(message => message.time || message.text === item.detail)) {
        messages.unshift({
            id: `${chatId}-detail`,
            sender: 'system',
            type: 'system',
            text: item.detail,
        });
    }

    return messages;
}

function buildContactFromItem(item: SourceClueItem, index: number): WeChatContact {
    const name = textFrom(item.label) || `contact-${index + 1}`;
    return {
        id: `contact-${index}`,
        name,
        remark: textFrom(item.detail) || undefined,
        groupKey: /^[A-Za-z]/.test(name) ? name[0].toUpperCase() : '#',
        relationshipHint: truncate(item.value, 70),
    };
}

function buildChatFromItem(item: SourceClueItem, index: number, clue: SourceClue): WeChatChatSummary {
    const title = textFrom(item.label) || `chat-${index + 1}`;
    return {
        id: `chat-${index}`,
        type: /群/.test(title) ? 'group' : /通知|服务/.test(title) ? 'system' : /文件传输/.test(title) ? 'fileHelper' : 'private',
        title,
        subtitle: truncate(textFrom(item.value) || textFrom(item.detail), 58),
        time: textFrom(item.detail).match(/\b\d{1,2}:\d{2}\b/)?.[0] || textFrom(clue.timestamp),
        unreadCount: index === 0 && /未读|新消息/.test(`${item.value} ${item.detail}`) ? 1 : undefined,
        pinned: index === 0 && /置顶/.test(`${item.value} ${item.detail}`),
    };
}

function inferMoments(clue: SourceClue, owner: WeChatProfile): WeChatData['moments'] {
    const items = arrayFrom(clue.items);
    const momentItems = items.filter(item => /朋友圈|动态/.test(`${item.label} ${item.value} ${item.detail}`));
    if (momentItems.length === 0) return undefined;
    return {
        posts: momentItems.map((item, index) => ({
            id: `moment-${index}`,
            authorId: owner.id,
            authorName: owner.nickname,
            authorAvatar: owner.avatar,
            text: textFrom(item.value) || textFrom(item.detail),
            time: textFrom(item.detail) || textFrom(clue.timestamp),
        })),
    };
}

function inferPayments(clue: SourceClue): WeChatPaymentRecord[] | undefined {
    const records = arrayFrom(clue.items)
        .filter(item => /账单|支付|转账|收款|付款|退款|¥|￥/.test(`${item.label} ${item.value} ${item.detail}`))
        .map((item, index) => ({
            id: `payment-${index}`,
            title: textFrom(item.label) || '支付记录',
            subtitle: truncate(textFrom(item.value), 80),
            amount: textFrom(item.value).match(/[+-]?[¥￥]?\s?\d+(?:\.\d{1,2})?/)?.[0] || '',
            time: textFrom(item.detail) || textFrom(clue.timestamp),
            status: textFrom(item.detail) || undefined,
            type: /收款|收入|退款/.test(`${item.label} ${item.value}`) ? 'income' as const : 'expense' as const,
        }));
    return records.length > 0 ? records : undefined;
}

function buildFallbackSettings(profile: WeChatProfile): WeChatSettingsData {
    return {
        groups: [
            {
                id: 'account',
                entries: [
                    { id: 'account-security', title: '账号与安全', subtitle: profile.wechatId ? `微信号：${profile.wechatId}` : undefined },
                    { id: 'privacy', title: '朋友权限', subtitle: profile.statusText },
                ],
            },
            {
                id: 'general',
                entries: [
                    { id: 'notifications', title: '新消息通知' },
                    { id: 'general-settings', title: '通用' },
                ],
            },
        ],
    };
}

function buildSummaryMessages(chat: WeChatChatSummary, ownerName: string): WeChatMessage[] {
    const summary = textFrom(chat.subtitle);
    const baseMessages: WeChatMessage[] = chat.time ? [{
        id: `${chat.id}-time-marker`,
        sender: 'system',
        type: 'system',
        text: chat.time,
    }] : [];
    if (summary) {
        const summaryLines = splitVisibleSentences(summary, 4);
        return [
            ...baseMessages,
            ...summaryLines.map((text, index): WeChatMessage => ({
                id: `${chat.id}-summary-${index}`,
                sender: chat.type === 'system' || chat.type === 'official' ? 'system' : 'other',
                senderName: chat.type === 'group' ? chat.title : chat.title,
                type: chat.type === 'system' || chat.type === 'official' ? 'system' : detectMessageType(text),
                text,
                time: index === 0 && !chat.time ? chat.time : undefined,
            })),
        ];
    }

    if (chat.type === 'group' || chat.type === 'official' || chat.type === 'system' || chat.type === 'fileHelper') {
        return [
            ...baseMessages,
            {
                id: `${chat.id}-visible-entry`,
                sender: 'system',
                type: 'system',
                text: compactText([chat.title, chat.time ? `最后可见时间 ${chat.time}` : undefined], '只看见这个会话入口，未返回具体消息。'),
            },
        ];
    }

    return [
        ...baseMessages,
        {
            id: `${chat.id}-visible-entry`,
            sender: 'system',
            type: 'system',
            text: `${ownerName}的微信里只看见这个会话入口，未返回具体消息。`,
        },
    ];
}

function buildContactFallbackMessages(contact: WeChatContact, ownerName: string, chatId: string): WeChatMessage[] {
    const text = compactText([contact.relationshipHint, contact.bio, contact.source, contact.wechatId]);
    if (text) {
        return splitVisibleSentences(text, 3).map((line, index): WeChatMessage => ({
            id: `${chatId}-contact-preview-${index}`,
            sender: 'other',
            senderId: contact.id,
            senderName: contact.remark || contact.name,
            avatar: contact.avatar,
            type: detectMessageType(line),
            text: line,
        }));
    }

    return [{
        id: `${chatId}-contact-visible-entry`,
        sender: 'system',
        type: 'system',
        text: `${ownerName}的微信里只看见这个联系人资料，未返回具体聊天记录。`,
    }];
}

function isOwnerMomentPost(post: WeChatMomentPost, owner: WeChatProfile) {
    return post.authorId === owner.id || post.authorName === owner.nickname;
}

function hasFriendMomentPosts(posts: WeChatMomentPost[], owner: WeChatProfile) {
    return posts.some(post => !isOwnerMomentPost(post, owner));
}

function normalizeMomentText(value?: string) {
    return textFrom(value).replace(/\s+/g, '');
}

function looksLikeProfileSummaryText(value?: string) {
    const text = textFrom(value);
    if (!text) return false;

    const hasSentenceEnding = /[。！？!?]/.test(text);
    const hasDailyCue = /(今天|今晚|明天|刚刚|最近|路过|到家|回家|下班|加班|出差|开会|吃|喝|买|拍|看见|看到|收到|分享|转发|晚安|早安|照片|相册|定位|天气|雨|雪|海|云|风|电影|音乐|咖啡)/.test(text);
    if (hasSentenceEnding || hasDailyCue) return false;

    if (/(重点关注对象|利益与家族纽带|家族威严|人生导师|关系|人设|身份|目标对象|阵营|盟友|敌人|威胁|控制|监视|保护|联姻|继承|政务关系|家族关系)/.test(text)) {
        return true;
    }

    const parts = text.split(/[，,、/|·；;：:]+/).map(part => part.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.length <= 4 && text.length <= 24 && parts.every(part => part.length <= 8)) {
        return true;
    }

    return false;
}

function matchesContactMetadata(value: string | undefined, contacts: WeChatContact[]) {
    const normalized = normalizeMomentText(value);
    if (!normalized) return false;

    return contacts.some(contact => {
        const candidates = [
            contact.bio,
            contact.relationshipHint,
            contact.source,
            contact.tags?.join('，'),
            compactText([contact.bio, contact.relationshipHint]),
            compactText([contact.relationshipHint, contact.bio]),
            compactText([contact.source, contact.relationshipHint]),
        ].map(normalizeMomentText).filter(candidate => candidate.length >= 4);

        return candidates.some(candidate => normalized === candidate || normalized.includes(candidate));
    });
}

function isUsableMomentText(value: string | undefined, contacts: WeChatContact[]) {
    const text = textFrom(value);
    return looksLikeMomentText(text)
        && !looksLikeProfileSummaryText(text)
        && !matchesContactMetadata(text, contacts);
}

function hasVisibleMomentBody(post: WeChatMomentPost, contacts: WeChatContact[], owner: WeChatProfile) {
    if (arrayFrom(post.images).length > 0) return true;
    const text = textFrom(post.text);
    if (isOwnerMomentPost(post, owner)) return looksLikeMomentText(text) && !looksLikeProfileSummaryText(text);
    return isUsableMomentText(text, contacts);
}

function looksLikeMomentText(value?: string) {
    const text = textFrom(value);
    if (text.length < 6) return false;
    if (/^(群聊|工作|同事|朋友|家人|客户|来源|标签|政策研究|微信号)$/i.test(text)) return false;
    if (looksLikeProfileSummaryText(text)) return false;
    if (/^(转发|分享|今天|今晚|明天|刚刚|最近|路过|加班|出差|拍到|记录|碎碎念|看见|收到|关于)/.test(text)) return true;
    return /[。！？!?；;：:]/.test(text) || (/[，,]/.test(text) && text.length >= 18) || text.length >= 20;
}

function buildFallbackMomentComments(post: WeChatMomentPost, contacts: WeChatContact[], owner: WeChatProfile, chats: WeChatChatSummary[]) {
    const relatedChat = chats.find(chat => chat.title === post.authorName && textFrom(chat.subtitle));
    if (relatedChat?.subtitle && isUsableMomentText(relatedChat.subtitle, contacts) && normalizeMomentText(relatedChat.subtitle) !== normalizeMomentText(post.text)) {
        return [{
            id: `${post.id}-comment-chat`,
            authorName: owner.nickname,
            text: truncate(relatedChat.subtitle, 42),
        }];
    }

    const commenter = contacts.find(contact => contact.id !== post.authorId && (contact.remark || contact.name) !== post.authorName);
    if (!commenter) return [];
    return [{
        id: `${post.id}-comment-fallback`,
        authorName: commenter.remark || commenter.name,
        text: isOwnerMomentPost(post, owner) ? '看到了。' : '这个我也看到了。',
    }];
}

function enhanceMomentPost(post: WeChatMomentPost, contacts: WeChatContact[], chats: WeChatChatSummary[], owner: WeChatProfile, index: number): WeChatMomentPost {
    const fallbackLikeNames = contacts
        .filter(contact => contact.id !== post.authorId)
        .map(contact => contact.remark || contact.name)
        .slice(0, 3);
    const postId = post.id || `moment-${index}`;
    const fallbackComments = buildFallbackMomentComments({ ...post, id: postId }, contacts, owner, chats);

    return {
        ...post,
        id: postId,
        likes: post.likes?.length ? post.likes : fallbackLikeNames,
        comments: post.comments?.length ? post.comments : fallbackComments,
        authorName: post.authorName || owner.nickname,
        authorAvatar: post.authorAvatar || (post.authorId === owner.id ? owner.avatar : undefined),
    };
}

function deriveMomentPosts(owner: WeChatProfile, contacts: WeChatContact[], chats: WeChatChatSummary[], chatMessages: Record<string, WeChatChatData>, existingPosts: WeChatMomentPost[]): WeChatMomentPost[] {
    const existingAuthorIds = new Set(existingPosts.map(post => post.authorId).filter(Boolean));
    const candidates: WeChatMomentPost[] = [];

    contacts.forEach((contact, index) => {
        const matchingChat = chats.find(chat => chat.title === contact.name || chat.title === contact.remark);
        const matchingMessage = matchingChat && matchingChat.type === 'private'
            ? chatMessages[matchingChat.id]?.messages.find(message => message.sender !== 'system' && isUsableMomentText(message.text, contacts))
            : undefined;
        const text = [
            matchingChat?.type === 'private' ? matchingChat.subtitle : undefined,
            matchingMessage?.text,
        ].find(candidate => isUsableMomentText(candidate, contacts));
        if (!text || existingAuthorIds.has(contact.id)) return;
        const commentText = matchingChat?.subtitle
            && isUsableMomentText(matchingChat.subtitle, contacts)
            && normalizeMomentText(matchingChat.subtitle) !== normalizeMomentText(text)
            ? matchingChat.subtitle
            : undefined;
        candidates.push({
            id: `derived-moment-${contact.id || index}`,
            authorId: contact.id,
            authorName: contact.remark || contact.name,
            authorAvatar: contact.avatar,
            text,
            time: matchingChat?.time,
            likes: [owner.nickname, ...contacts.filter(item => item.id !== contact.id).map(item => item.remark || item.name).slice(0, 2)],
            comments: commentText ? [{
                id: `derived-moment-${contact.id || index}-comment`,
                authorName: owner.nickname,
                text: truncate(commentText, 42),
            }] : [{
                id: `derived-moment-${contact.id || index}-comment`,
                authorName: owner.nickname,
                text: '这条我看到了。',
            }],
        });
    });

    return candidates.slice(0, Math.max(0, 6 - existingPosts.length));
}

function normalizeMoments(
    moments: WeChatData['moments'],
    owner: WeChatProfile,
    contacts: WeChatContact[],
    chats: WeChatChatSummary[],
    chatMessages: Record<string, WeChatChatData>,
): WeChatData['moments'] {
    const basePosts = arrayFrom(moments?.posts)
        .filter(post => hasVisibleMomentBody(post, contacts, owner))
        .map((post, index) => enhanceMomentPost(post, contacts, chats, owner, index));
    const needsFriendFeed = basePosts.length < 4 || !hasFriendMomentPosts(basePosts, owner);
    const derivedPosts = needsFriendFeed ? deriveMomentPosts(owner, contacts, chats, chatMessages, basePosts) : [];
    const posts = [...basePosts, ...derivedPosts];
    return posts.length > 0 ? { cover: moments?.cover, posts } : undefined;
}

function hasArrayData<T>(value?: T[]) {
    return Array.isArray(value) && value.length > 0;
}

function normalizeProvidedData(raw: Partial<WeChatData> | undefined, fallback: WeChatData): WeChatData {
    const profile = raw?.profile || fallback.profile;
    const normalizedProfile: WeChatProfile = {
        id: textFrom(profile.id) || fallback.profile.id,
        nickname: textFrom(profile.nickname) || fallback.profile.nickname,
        wechatId: textFrom(profile.wechatId) || undefined,
        avatar: textFrom(profile.avatar) || fallback.profile.avatar,
        statusText: textFrom(profile.statusText) || fallback.profile.statusText,
        qrCodeUrl: textFrom(profile.qrCodeUrl) || undefined,
    };
    const chats = hasArrayData(raw?.chats) ? raw!.chats! : fallback.chats;
    const contacts = hasArrayData(raw?.contacts) ? raw!.contacts! : fallback.contacts;
    const chatMessages = raw?.chatMessages && typeof raw.chatMessages === 'object' ? raw.chatMessages : fallback.chatMessages;
    const fallbackMessagesByTitle = new Map(fallback.chats.map(chat => [chat.title, fallback.chatMessages[chat.id]]));

    const normalizedMessages = chats.reduce<Record<string, WeChatChatData>>((acc, chat) => {
        const existing = chatMessages[chat.id];
        const fallbackMessage = fallback.chatMessages[chat.id] || fallbackMessagesByTitle.get(chat.title);
        const existingMessages = arrayFrom(existing?.messages);
        const fallbackMessages = arrayFrom(fallbackMessage?.messages);
        const baseMessages = existingMessages.length > 0
            ? existingMessages
            : fallbackMessages.length > 0
                ? fallbackMessages
                : buildSummaryMessages(chat, normalizedProfile.nickname);
        const participants = existing?.participants || fallbackMessage?.participants;
        const messages = buildConversationDepthMessages(baseMessages, chat, contacts, {
            id: chat.id,
            title: existing?.title || fallbackMessage?.title || chat.title,
            avatar: existing?.avatar || fallbackMessage?.avatar || chat.avatar,
            participants,
            messages: baseMessages,
            inputHint: existing?.inputHint || fallbackMessage?.inputHint,
        });
        acc[chat.id] = {
            id: chat.id,
            title: existing?.title || chat.title,
            avatar: existing?.avatar || chat.avatar,
            participants,
            messages,
            inputHint: existing?.inputHint || fallbackMessage?.inputHint || '只读模式，不能发送消息',
        };
        return acc;
    }, {});
    const moments = normalizeMoments(raw?.moments || fallback.moments, normalizedProfile, contacts, chats, normalizedMessages);
    const settings = raw?.settings || fallback.settings || buildFallbackSettings(normalizedProfile);

    return {
        ...fallback,
        ...raw,
        profile: normalizedProfile,
        chats,
        contacts,
        chatMessages: normalizedMessages,
        groups: hasArrayData(raw?.groups) ? raw!.groups : fallback.groups,
        moments,
        favorites: hasArrayData(raw?.favorites) ? raw!.favorites : fallback.favorites,
        services: raw?.services || fallback.services,
        payments: hasArrayData(raw?.payments) ? raw!.payments : fallback.payments,
        works: hasArrayData(raw?.works) ? raw!.works : fallback.works,
        cards: hasArrayData(raw?.cards) ? raw!.cards : fallback.cards,
        stickers: hasArrayData(raw?.stickers) ? raw!.stickers : fallback.stickers,
        settings,
        enabledFeatures: hasArrayData(raw?.enabledFeatures) ? raw!.enabledFeatures : fallback.enabledFeatures,
        desktopLoggedInText: textFrom(raw?.desktopLoggedInText) || fallback.desktopLoggedInText,
    };
}

export function buildWeChatDataFromClue(clue: SourceClue, charName: string, charAvatar?: string): WeChatData {
    const items = arrayFrom(clue.items);
    const profile: WeChatProfile = {
        id: 'owner',
        nickname: charName,
        avatar: charAvatar,
        statusText: textFrom(clue.subtitle) || undefined,
    };
    const contacts = items.map(buildContactFromItem);
    const chats = items.map((item, index) => buildChatFromItem(item, index, clue));
    const chatMessages = chats.reduce<Record<string, WeChatChatData>>((acc, chat, index) => {
        const item = items[index];
        acc[chat.id] = {
            id: chat.id,
            title: chat.title,
            avatar: chat.avatar,
            participants: contacts[index] ? [contacts[index]] : undefined,
            messages: item ? parseMessagesFromItem(item, charName, chat.id) : [],
            inputHint: '只读模式，不能发送消息',
        };
        return acc;
    }, {});
    const payments = inferPayments(clue);
    const moments = inferMoments(clue, profile);
    const enabledFeatures = [
        moments ? 'moments' : undefined,
        payments ? 'services' : undefined,
    ].filter(Boolean) as WeChatFeatureKey[];

    const fallback: WeChatData = {
        profile,
        chats,
        contacts,
        chatMessages,
        moments,
        payments,
        enabledFeatures,
    };

    return normalizeProvidedData(clue.wechatData, fallback);
}

function makeContent(title: string, pageType: string, items: WeChatVisibleItem[], summary?: string): WeChatVisibleContent {
    const content = items.map((item, index) => {
        const detail = item.detail ? `（${item.detail}）` : '';
        return `${index + 1}. ${item.label}: ${item.value}${detail}`;
    }).join('\n');
    return {
        title,
        pageType,
        items,
        content,
        summary: summary || content || `${title}没有可见内容。`,
    };
}

function getEnabledFeatures(data: WeChatData) {
    const enabled = new Set(data.enabledFeatures || []);
    if (data.moments?.posts?.length) enabled.add('moments');
    if (data.favorites?.length) enabled.add('favorites');
    if (data.payments?.length || data.services?.groups?.length) enabled.add('services');
    if (data.works?.length) enabled.add('works');
    if (data.cards?.length) enabled.add('cards');
    if (data.stickers?.length) enabled.add('stickers');
    if (data.settings?.groups?.length) enabled.add('settings');
    return enabled;
}

function findContact(data: WeChatData, contactId?: string) {
    return data.contacts.find(contact => contact.id === contactId);
}

function findChatForContact(data: WeChatData, contact: WeChatContact) {
    return data.chats.find(chat => chat.title === contact.name || chat.title === contact.remark || data.chatMessages[chat.id]?.participants?.some(participant => participant.id === contact.id));
}

function getChatData(data: WeChatData, route: Extract<WeChatRoute, { name: 'chat' }>): WeChatChatData {
    const existing = data.chatMessages[route.chatId];
    const summary = data.chats.find(chat => chat.id === route.chatId);
    const contact = findContact(data, route.contactId);
    if (existing) {
        if (existing.messages.length > 0) {
            return {
                ...existing,
                messages: buildConversationDepthMessages(existing.messages, summary, data.contacts, existing),
            };
        }
        return {
            ...existing,
            participants: existing.participants || (contact ? [contact] : undefined),
            messages: buildConversationDepthMessages(
                summary ? buildSummaryMessages(summary, data.profile.nickname) : contact ? buildContactFallbackMessages(contact, data.profile.nickname, route.chatId) : [],
                summary,
                data.contacts,
                {
                    ...existing,
                    participants: existing.participants || (contact ? [contact] : undefined),
                },
            ),
        };
    }
    const baseMessages = summary ? buildSummaryMessages(summary, data.profile.nickname) : contact ? buildContactFallbackMessages(contact, data.profile.nickname, route.chatId) : [];
    return {
        id: route.chatId,
        title: summary?.title || contact?.remark || contact?.name || '聊天',
        avatar: summary?.avatar || contact?.avatar,
        participants: contact ? [contact] : undefined,
        messages: buildConversationDepthMessages(baseMessages, summary, data.contacts, {
            id: route.chatId,
            title: summary?.title || contact?.remark || contact?.name || '聊天',
            avatar: summary?.avatar || contact?.avatar,
            participants: contact ? [contact] : undefined,
            messages: baseMessages,
        }),
        inputHint: '只读模式，不能发送消息',
    };
}

function featureRows(data: WeChatData, source: 'discover' | 'me') {
    const enabled = getEnabledFeatures(data);
    const discoverOrder: WeChatFeatureKey[] = ['moments', 'works', 'scan', 'search', 'nearby', 'miniPrograms', 'games'];
    const meOrder: WeChatFeatureKey[] = ['services', 'favorites', 'moments', 'works', 'cards', 'stickers', 'settings'];
    return (source === 'discover' ? discoverOrder : meOrder).filter(feature => enabled.has(feature));
}

function groupRows(data: WeChatData) {
    const explicitGroups = arrayFrom(data.groups).map(group => ({
        id: group.id,
        title: group.name,
        subtitle: group.memberCount ? `${group.memberCount}人` : group.members?.length ? `${group.members.length}人` : undefined,
        avatar: group.avatar,
        chatId: data.chats.find(chat => chat.id === group.id || chat.title === group.name)?.id,
    }));
    const chatGroups = data.chats
        .filter(chat => chat.type === 'group' && !explicitGroups.some(group => group.chatId === chat.id || group.title === chat.title))
        .map(chat => ({
            id: chat.id,
            title: chat.title,
            subtitle: chat.subtitle || chat.time,
            avatar: chat.avatar,
            chatId: chat.id,
        }));
    return [...explicitGroups, ...chatGroups];
}

function officialRows(data: WeChatData) {
    return data.chats
        .filter(chat => chat.type === 'official' || chat.type === 'system')
        .map(chat => ({
            id: chat.id,
            title: chat.title,
            subtitle: chat.subtitle || chat.time,
            avatar: chat.avatar,
            chatId: chat.id,
        }));
}

function newFriendRows(data: WeChatData) {
    const sourced = data.contacts.filter(contact => contact.source || contact.relationshipHint);
    return sourced.length > 0 ? sourced : data.contacts.slice(0, 8);
}

function tagRows(data: WeChatData) {
    const tagMap = data.contacts.reduce<Record<string, WeChatContact[]>>((acc, contact) => {
        contact.tags?.forEach(tag => {
            acc[tag] = [...(acc[tag] || []), contact];
        });
        return acc;
    }, {});
    return Object.entries(tagMap).map(([tag, contacts]) => ({ tag, contacts }));
}

function bucketCount(data: WeChatData, bucket: WeChatContactBucket) {
    if (bucket === 'groups') return groupRows(data).length;
    if (bucket === 'official') return officialRows(data).length;
    if (bucket === 'tags') return tagRows(data).length;
    return newFriendRows(data).length;
}

function getFeatureSubtitle(feature: WeChatFeatureKey, data: WeChatData) {
    if (feature === 'moments') return data.moments?.posts?.[0]?.text;
    if (feature === 'services') return data.payments?.length ? `${data.payments.length}条支付记录` : data.services?.groups?.[0]?.title;
    if (feature === 'favorites') return data.favorites?.length ? `${data.favorites.length}条收藏` : undefined;
    if (feature === 'works') return data.works?.length ? `${data.works.length}条作品` : undefined;
    if (feature === 'cards') return data.cards?.length ? `${data.cards.length}条卡券 / 订单` : undefined;
    if (feature === 'stickers') return data.stickers?.length ? `${data.stickers.length}个常用表情` : undefined;
    if (feature === 'settings') return data.profile.wechatId ? `微信号：${data.profile.wechatId}` : '账号、安全、通知与隐私';
    return undefined;
}

export function getCurrentVisibleContent(data: WeChatData, route: WeChatRoute): WeChatVisibleContent {
    if (route.name === 'main') {
        if (route.tab === 'chats') {
            return makeContent('微信', '聊天列表', data.chats.map(chat => ({
                label: chat.title,
                value: chat.subtitle || '',
                detail: compactText([chat.time, chat.unreadCount ? `${chat.unreadCount}条未读` : undefined, chat.pinned ? '置顶' : undefined]),
            })), '用户看见了微信聊天列表。');
        }
        if (route.tab === 'contacts') {
            return makeContent('通讯录', '联系人列表', data.contacts.map(contact => ({
                label: contact.remark || contact.name,
                value: compactText([contact.wechatId, contact.relationshipHint, contact.bio]),
                detail: compactText([contact.groupKey, contact.tags?.join('/')]),
            })), '用户看见了微信通讯录。');
        }
        if (route.tab === 'discover') {
            const rows = featureRows(data, 'discover');
            return makeContent('发现', '发现入口', rows.map(feature => ({
                label: FEATURE_LABELS[feature],
                value: feature === 'moments' ? `${data.moments?.posts?.length || 0}条朋友圈可见` : '',
            })), '用户看见了微信发现页入口。');
        }
        return makeContent('我', '微信资料', [
            { label: '昵称', value: data.profile.nickname },
            { label: '微信号', value: data.profile.wechatId || '' },
            { label: '状态', value: data.profile.statusText || '' },
            ...featureRows(data, 'me').map(feature => ({ label: FEATURE_LABELS[feature], value: '' })),
        ], '用户看见了微信“我”页面。');
    }

    if (route.name === 'chat') {
        const chat = getChatData(data, route);
        return makeContent(chat.title, '聊天详情', chat.messages.map(message => ({
            label: message.sender === 'owner' ? data.profile.nickname : message.senderName || chat.title,
            value: compactText([message.text, message.fileName, message.amount, message.duration]),
            detail: compactText([message.time, message.type, message.status]),
        })), `用户看见了微信聊天「${chat.title}」。`);
    }

    if (route.name === 'profile') {
        const contact = findContact(data, route.contactId);
        return makeContent(contact?.remark || contact?.name || '联系人资料', '联系人资料', contact ? [
            { label: '昵称', value: contact.name },
            { label: '备注', value: contact.remark || '' },
            { label: '微信号', value: contact.wechatId || '' },
            { label: '标签', value: contact.tags?.join('、') || '' },
            { label: '来源', value: contact.source || '' },
            { label: '签名', value: contact.bio || contact.relationshipHint || '' },
        ] : [], '用户看见了微信联系人资料。');
    }

    if (route.name === 'contactBucket') {
        if (route.bucket === 'groups') {
            return makeContent('群聊', '群聊列表', groupRows(data).map(group => ({
                label: group.title,
                value: group.subtitle || '',
            })), '用户看见了微信通讯录里的群聊列表。');
        }
        if (route.bucket === 'official') {
            return makeContent('公众号 / 服务号', '公众号列表', officialRows(data).map(row => ({
                label: row.title,
                value: row.subtitle || '',
            })), '用户看见了微信通讯录里的公众号和服务通知。');
        }
        if (route.bucket === 'tags') {
            return makeContent('标签', '联系人标签', tagRows(data).map(row => ({
                label: row.tag,
                value: row.contacts.map(contact => contact.remark || contact.name).join('、'),
            })), '用户看见了微信通讯录里的联系人标签。');
        }
        return makeContent('新的朋友', '新的朋友', newFriendRows(data).map(contact => ({
            label: contact.remark || contact.name,
            value: compactText([contact.source, contact.relationshipHint, contact.wechatId]),
        })), '用户看见了微信新的朋友列表。');
    }

    if (route.name === 'moments') {
        return makeContent('朋友圈', '朋友圈', arrayFrom(data.moments?.posts).map(post => ({
            label: post.authorName,
            value: compactText([post.text, post.location]),
            detail: compactText([post.time, post.likes?.length ? `${post.likes.length}个赞` : undefined, post.comments?.length ? `${post.comments.length}条评论` : undefined]),
        })), '用户看见了微信朋友圈。');
    }

    if (route.name === 'favorites') {
        return makeContent('收藏', '收藏列表', arrayFrom(data.favorites).map(item => ({
            label: item.title || item.type,
            value: compactText([item.content, item.fileName]),
            detail: item.time,
        })), '用户看见了微信收藏。');
    }

    if (route.name === 'services') {
        const groups = arrayFrom(data.services?.groups);
        const serviceItems = groups.flatMap(group => group.entries.map(entry => ({
            label: entry.title,
            value: entry.subtitle || '',
            detail: group.title,
        })));
        const paymentItems = arrayFrom(data.payments).map(payment => ({
            label: payment.title,
            value: compactText([payment.subtitle, payment.amount]),
            detail: payment.time,
        }));
        return makeContent('服务', '服务入口', serviceItems.length > 0 ? serviceItems : paymentItems, '用户看见了微信服务页。');
    }

    if (route.name === 'payments') {
        return makeContent('账单', '支付账单', arrayFrom(data.payments).map(payment => ({
            label: payment.title,
            value: compactText([payment.subtitle, payment.amount]),
            detail: compactText([payment.time, payment.status]),
        })), '用户看见了微信支付账单。');
    }

    if (route.name === 'paymentDetail') {
        const payment = arrayFrom(data.payments).find(item => item.id === route.paymentId);
        return makeContent(payment?.title || '账单详情', '账单详情', payment ? [
            { label: '标题', value: payment.title },
            { label: '说明', value: payment.subtitle || '' },
            { label: '金额', value: payment.amount },
            { label: '时间', value: payment.time || '' },
            { label: '状态', value: payment.status || '' },
        ] : [], '用户看见了一条微信账单详情。');
    }

    if (route.name === 'works') {
        return makeContent('视频号', '作品列表', arrayFrom(data.works).map(work => ({
            label: work.title || '作品',
            value: work.text || '',
            detail: compactText([work.time, work.metrics]),
        })), '用户看见了微信作品页。');
    }

    if (route.name === 'cards') {
        return makeContent('小店与卡包', '卡包列表', arrayFrom(data.cards).map(card => ({
            label: card.title,
            value: card.subtitle || '',
            detail: compactText([card.time, card.status]),
        })), '用户看见了微信小店与卡包。');
    }

    if (route.name === 'stickers') {
        return makeContent('表情', '表情列表', arrayFrom(data.stickers).map(sticker => ({
            label: sticker.title || '表情',
            value: sticker.usageHint || '',
        })), '用户看见了微信表情页。');
    }

    if (route.name === 'settings') {
        return makeContent('设置', '设置入口', arrayFrom(data.settings?.groups).flatMap(group => group.entries.map(entry => ({
            label: entry.title,
            value: entry.subtitle || '',
        }))), '用户看见了微信设置页。');
    }

    return makeContent(FEATURE_LABELS[route.feature], `${FEATURE_LABELS[route.feature]}入口`, [], `用户看见了微信${FEATURE_LABELS[route.feature]}入口。`);
}

const WeChatAvatar: React.FC<{ name?: string; src?: string; className?: string; square?: boolean }> = ({ name, src, className = 'h-11 w-11', square = true }) => (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden ${square ? 'rounded-[7px]' : 'rounded-full'} bg-[#d8d8d8] text-sm font-medium text-white ${className}`}>
        {src ? <img src={src} alt={name || ''} className="h-full w-full object-cover" /> : getInitial(name)}
    </span>
);

const WeChatEmpty: React.FC<{ title?: string; detail?: string }> = ({ title = '暂无内容', detail = '这里没有可显示的数据' }) => (
    <div className="flex h-full min-h-[11rem] flex-col items-center justify-center px-8 text-center text-[#8a8a8a]">
        <ChatCircleText className="mb-3 h-8 w-8 text-[#c2c2c2]" />
        <div className="text-[13px] font-medium text-[#666666]">{title}</div>
        <div className="mt-1 text-[11px]">{detail}</div>
    </div>
);

const MainHeader: React.FC<{
    title: string;
    compact: boolean;
    unread?: number;
    right?: React.ReactNode;
}> = ({ title, compact, unread, right }) => (
    <div className={`flex shrink-0 items-center border-b border-black/8 bg-[#ededed] px-4 ${compact ? 'h-10' : 'h-12'}`}>
        <div className={`${compact ? 'text-[15px]' : 'text-[17px]'} flex-1 font-semibold text-[#111111]`}>
            {title}{unread ? <span className="ml-1 font-normal">({unread})</span> : null}
        </div>
        {right}
    </div>
);

const SubHeader: React.FC<{
    title: string;
    compact: boolean;
    onBack: () => void;
    right?: React.ReactNode;
}> = ({ title, compact, onBack, right }) => (
    <div className={`flex shrink-0 items-center border-b border-black/8 bg-[#ededed] px-2 ${compact ? 'h-10' : 'h-12'}`}>
        <button type="button" onClick={onBack} className="flex h-9 w-9 items-center justify-center text-[#111111] active:opacity-60" aria-label="返回上一层">
            <CaretLeft className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
        </button>
        <div className={`${compact ? 'text-[14px]' : 'text-[16px]'} min-w-0 flex-1 truncate text-center font-medium`}>{title}</div>
        <div className="flex h-9 w-9 items-center justify-center">{right}</div>
    </div>
);

const IconButton: React.FC<{ label: string; children: React.ReactNode; onClick?: () => void }> = ({ label, children, onClick }) => (
    <button type="button" onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-full text-[#111111] active:bg-black/5" aria-label={label}>
        {children}
    </button>
);

const SearchBar: React.FC<{ compact: boolean; placeholder?: string; onClick?: () => void }> = ({ compact, placeholder = '搜索', onClick }) => (
    <button type="button" onClick={onClick} className={`flex w-full items-center justify-center gap-1.5 rounded-[5px] bg-white text-[#8a8a8a] active:bg-[#f6f6f6] ${compact ? 'h-7 text-[10px]' : 'h-8 text-[12px]'}`}>
        <MagnifyingGlass className="h-3.5 w-3.5" />
        <span>{placeholder}</span>
    </button>
);

const FeatureIcon: React.FC<{ feature?: WeChatFeatureKey | 'payments' | 'friends' | 'groups' | 'tags' | 'official' }> = ({ feature }) => {
    const iconClass = 'h-5 w-5';
    if (feature === 'services') return <Wallet className={iconClass} />;
    if (feature === 'favorites') return <Package className={iconClass} />;
    if (feature === 'moments') return <ImageSquare className={iconClass} />;
    if (feature === 'works') return <VideoCamera className={iconClass} />;
    if (feature === 'cards') return <CreditCard className={iconClass} />;
    if (feature === 'stickers') return <Smiley className={iconClass} />;
    if (feature === 'settings') return <GearSix className={iconClass} />;
    if (feature === 'scan' || feature === 'search') return <MagnifyingGlass className={iconClass} />;
    if (feature === 'nearby') return <MapPin className={iconClass} />;
    if (feature === 'miniPrograms') return <Package className={iconClass} />;
    if (feature === 'games') return <GlobeHemisphereWest className={iconClass} />;
    if (feature === 'payments') return <Receipt className={iconClass} />;
    if (feature === 'groups') return <ChatCircleText className={iconClass} />;
    if (feature === 'tags') return <Tag className={iconClass} />;
    if (feature === 'official') return <BellSimple className={iconClass} />;
    return <UsersThree className={iconClass} />;
};

const WeChatRow: React.FC<{
    title: string;
    subtitle?: string;
    detail?: string;
    avatar?: React.ReactNode;
    onClick?: () => void;
    unread?: number;
    pinned?: boolean;
}> = ({ title, subtitle, detail, avatar, onClick, unread, pinned }) => (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 border-b border-black/8 px-4 py-2.5 text-left active:bg-[#f2f2f2] ${pinned ? 'bg-[#f7f7f7]' : 'bg-white'}`}>
        {avatar}
        <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-[#111111]">{title}</span>
                {detail && <span className="shrink-0 text-[11px] text-[#b2b2b2]">{detail}</span>}
            </span>
            <span className="mt-0.5 flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#8a8a8a]">{subtitle}</span>
                {unread ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#fa5151] px-1 text-[9px] font-medium text-white">{unread}</span> : null}
            </span>
        </span>
    </button>
);

const BottomTabs: React.FC<{ current: WeChatMainTab; onSelect: (tab: WeChatMainTab) => void; compact: boolean }> = ({ current, onSelect, compact }) => (
    <div className="grid shrink-0 grid-cols-4 border-t border-black/8 bg-[#f7f7f7]">
        {MAIN_TABS.map(tab => {
            const Icon = tab.icon;
            const active = tab.key === current;
            return (
                <button key={tab.key} type="button" onClick={() => onSelect(tab.key)} className={`flex flex-col items-center gap-0.5 py-1.5 ${active ? 'text-[#07c160]' : 'text-[#6f6f6f]'} active:bg-black/5`}>
                    <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                    <span className={compact ? 'text-[8px]' : 'text-[10px]'}>{tab.label}</span>
                </button>
            );
        })}
    </div>
);

const ChatsTab: React.FC<{
    data: WeChatData;
    compact: boolean;
    openChat: (chatId: string) => void;
    openFeature: (feature: WeChatFeatureKey) => void;
}> = ({ data, compact, openChat, openFeature }) => {
    const unread = data.chats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
    const chats = [...data.chats].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

    return (
        <>
            <MainHeader
                title="微信"
                compact={compact}
                unread={unread || undefined}
                right={(
                    <div className="flex items-center gap-1">
                        <IconButton label="搜索" onClick={() => openFeature('search')}><MagnifyingGlass className="h-5 w-5" /></IconButton>
                        <IconButton label="更多"><Plus className="h-5 w-5" /></IconButton>
                    </div>
                )}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
                {data.desktopLoggedInText && (
                    <div className="flex items-center gap-2 border-b border-black/8 bg-[#f7f7f7] px-4 py-2 text-[12px] text-[#666666]">
                        <ChatCircleText className="h-4 w-4 text-[#07c160]" />
                        <span className="truncate">{data.desktopLoggedInText}</span>
                    </div>
                )}
                {chats.length > 0 ? chats.map(chat => (
                    <WeChatRow
                        key={chat.id}
                        title={chat.title}
                        subtitle={chat.subtitle}
                        detail={chat.time}
                        unread={chat.unreadCount}
                        pinned={chat.pinned}
                        avatar={<WeChatAvatar name={chat.title} src={chat.avatar} />}
                        onClick={() => openChat(chat.id)}
                    />
                )) : <WeChatEmpty title="暂无聊天" detail="当前角色没有可显示的微信会话" />}
            </div>
        </>
    );
};

const ContactsTab: React.FC<{
    data: WeChatData;
    compact: boolean;
    openProfile: (contactId: string) => void;
    openBucket: (bucket: WeChatContactBucket) => void;
}> = ({ data, compact, openProfile, openBucket }) => {
    const grouped = data.contacts.reduce<Record<string, WeChatContact[]>>((acc, contact) => {
        const key = contact.groupKey || '#';
        acc[key] = [...(acc[key] || []), contact];
        return acc;
    }, {});
    const groupKeys = Object.keys(grouped).sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));

    return (
        <>
            <MainHeader title="通讯录" compact={compact} />
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
                <div className="px-3 py-2">
                    <SearchBar compact={compact} />
                </div>
                <div className="mb-2 bg-white">
                    {[
                        { label: '新的朋友', feature: 'friends' as const, bucket: 'newFriends' as const },
                        { label: '群聊', feature: 'groups' as const, bucket: 'groups' as const },
                        { label: '标签', feature: 'tags' as const, bucket: 'tags' as const },
                        { label: '公众号 / 服务号', feature: 'official' as const, bucket: 'official' as const },
                    ].map(entry => (
                        <WeChatRow
                            key={entry.label}
                            title={entry.label}
                            subtitle={bucketCount(data, entry.bucket) ? `${bucketCount(data, entry.bucket)}项` : undefined}
                            avatar={<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-[#07c160] text-white"><FeatureIcon feature={entry.feature} /></span>}
                            onClick={() => openBucket(entry.bucket)}
                        />
                    ))}
                </div>
                {groupKeys.length > 0 ? groupKeys.map(key => (
                    <div key={key}>
                        <div className="px-4 py-1 text-[10px] font-medium text-[#8a8a8a]">{key}</div>
                        <div className="bg-white">
                            {grouped[key].map(contact => (
                                <WeChatRow
                                    key={contact.id}
                                    title={contact.remark || contact.name}
                                    subtitle={contact.relationshipHint || contact.bio || contact.wechatId}
                                    avatar={<WeChatAvatar name={contact.remark || contact.name} src={contact.avatar} className="h-9 w-9" />}
                                    onClick={() => openProfile(contact.id)}
                                />
                            ))}
                        </div>
                    </div>
                )) : <WeChatEmpty title="暂无联系人" detail="当前角色没有可显示的联系人数据" />}
            </div>
        </>
    );
};

const FeatureListPage: React.FC<{
    data: WeChatData;
    compact: boolean;
    tab: 'discover' | 'me';
    openFeature: (feature: WeChatFeatureKey) => void;
}> = ({ data, compact, tab, openFeature }) => {
    const rows = featureRows(data, tab);
    return (
        <>
            <MainHeader title={tab === 'discover' ? '发现' : '我'} compact={compact} />
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
                {tab === 'me' && (
                    <div className="mb-2 bg-white">
                        <button type="button" className="flex w-full items-center gap-3 px-4 py-5 text-left active:bg-[#f2f2f2]">
                            <WeChatAvatar name={data.profile.nickname} src={data.profile.avatar} className="h-14 w-14" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[18px] font-semibold text-[#111111]">{data.profile.nickname}</span>
                                <span className="mt-1 block truncate text-[12px] text-[#666666]">{data.profile.wechatId ? `微信号：${data.profile.wechatId}` : data.profile.statusText || '微信资料'}</span>
                                {data.profile.statusText && data.profile.wechatId && <span className="mt-1 block truncate text-[12px] text-[#8a8a8a]">{data.profile.statusText}</span>}
                            </span>
                            <QrCode className="h-5 w-5 text-[#8a8a8a]" />
                            <CaretRight className="h-4 w-4 text-[#b2b2b2]" />
                        </button>
                        {data.profile.statusText && (
                            <div className="border-t border-black/8 px-4 py-2 text-[12px] text-[#666666]">
                                状态：{data.profile.statusText}
                            </div>
                        )}
                    </div>
                )}
                {rows.length > 0 ? (
                    <div className="bg-white">
                        {rows.map(feature => (
                            <WeChatRow
                                key={feature}
                                title={FEATURE_LABELS[feature]}
                                subtitle={getFeatureSubtitle(feature, data)}
                                avatar={<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-[#07c160] text-white"><FeatureIcon feature={feature} /></span>}
                                onClick={() => openFeature(feature)}
                            />
                        ))}
                    </div>
                ) : <WeChatEmpty title="暂无入口" detail="当前数据没有启用可显示的微信功能" />}
            </div>
        </>
    );
};

const MessageBubble: React.FC<{ message: WeChatMessage; data: WeChatData; chat: WeChatChatData; compact: boolean }> = ({ message, data, chat, compact }) => {
    if (message.sender === 'system' || message.type === 'system' || message.type === 'recall') {
        return (
            <div className="flex justify-center">
                <span className="max-w-[78%] rounded-[4px] bg-[#d4d4d4] px-2 py-1 text-center text-[11px] text-white">{message.text || '系统消息'}</span>
            </div>
        );
    }
    const mine = message.sender === 'owner';
    const avatar = mine ? data.profile.avatar : message.avatar || chat.avatar;
    const bubbleClass = mine ? 'bg-[#95ec69] text-[#111111]' : 'bg-white text-[#111111]';

    return (
        <div className={`flex items-start gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
            {!mine && <WeChatAvatar name={message.senderName || chat.title} src={avatar} className="h-9 w-9" />}
            <div className={`max-w-[72%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                {!mine && message.senderName && <span className="mb-1 text-[11px] text-[#7f7f7f]">{message.senderName}</span>}
                <div className={`rounded-[5px] px-2.5 py-2 text-[13px] leading-relaxed shadow-[0_1px_0_rgba(0,0,0,0.04)] ${bubbleClass}`}>
                    {message.type === 'image' && (
                        <div className="mb-1.5 flex h-20 w-24 items-center justify-center overflow-hidden rounded-[4px] bg-[#e8e8e8] text-[#7a7a7a]">
                            {message.imageUrl ? <img src={message.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImageSquare className="h-6 w-6" />}
                        </div>
                    )}
                    {message.type === 'file' && (
                        <div className="mb-1.5 flex items-center gap-2 rounded-[4px] bg-black/5 p-2">
                            <FileText className="h-5 w-5 text-[#576b95]" />
                            <span className="min-w-0 truncate">{message.fileName || message.text}</span>
                        </div>
                    )}
                    {message.type === 'voice' && (
                        <div className="flex min-w-[5rem] items-center gap-2">
                            <Waveform className="h-4 w-4" />
                            <span>{message.duration || message.text || ''}</span>
                        </div>
                    )}
                    {(message.type === 'redPacket' || message.type === 'transfer') && (
                        <div className="-m-2 min-w-[11rem] overflow-hidden rounded-[5px] bg-[#fa9d3b] text-white">
                            <div className="flex items-center gap-2 p-2.5">
                                <span className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-white/20 text-xs font-bold">¥</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">{message.type === 'redPacket' ? '微信红包' : '微信转账'}</span>
                                    <span className="block truncate text-[11px] text-white/80">{message.amount || message.text}</span>
                                </span>
                            </div>
                            <div className="bg-white/14 px-2.5 py-1 text-[10px] text-white/75">微信支付</div>
                        </div>
                    )}
                    {message.type === 'location' && (
                        <div className="mb-1 flex items-center gap-1.5 text-[#576b95]">
                            <MapPin className="h-4 w-4" />
                            <span>{message.text}</span>
                        </div>
                    )}
                    {message.type === 'link' && (
                        <div className="mb-1 flex items-center gap-1.5 text-[#576b95]">
                            <GlobeHemisphereWest className="h-4 w-4" />
                            <span>{message.text}</span>
                        </div>
                    )}
                    {!['image', 'file', 'voice', 'redPacket', 'transfer', 'location', 'link'].includes(message.type) && (
                        <div className={`${compact ? 'text-[12px]' : 'text-[13px]'} whitespace-pre-wrap`}>{message.text}</div>
                    )}
                </div>
            </div>
            {mine && <WeChatAvatar name={data.profile.nickname} src={avatar} className="h-9 w-9" />}
        </div>
    );
};

const ChatPage: React.FC<{
    data: WeChatData;
    compact: boolean;
    route: Extract<WeChatRoute, { name: 'chat' }>;
    onBack: () => void;
}> = ({ data, compact, route, onBack }) => {
    const chat = getChatData(data, route);
    return (
        <>
            <SubHeader title={chat.title} compact={compact} onBack={onBack} right={<DotsThree className="h-5 w-5" />} />
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed] px-3 py-4">
                {chat.messages.length > 0 ? (
                    <div className="space-y-4">
                        {chat.messages.map(message => <MessageBubble key={message.id} message={message} data={data} chat={chat} compact={compact} />)}
                    </div>
                ) : <WeChatEmpty title="暂无聊天记录" detail="这个会话没有可显示的消息" />}
            </div>
            <div className="shrink-0 border-t border-black/8 bg-[#f7f7f7] px-2.5 py-2">
                <div className="flex items-center gap-2">
                    <Waveform className="h-5 w-5 text-[#333333]" />
                    <div className="flex h-9 min-w-0 flex-1 items-center rounded-[5px] bg-white px-2.5 text-xs text-[#8a8a8a]">
                        <span className="truncate">{chat.inputHint || '只读模式，不能发送消息'}</span>
                    </div>
                    <Plus className="h-5 w-5 text-[#333333]" />
                </div>
            </div>
        </>
    );
};

const ProfilePage: React.FC<{
    data: WeChatData;
    contactId: string;
    compact: boolean;
    onBack: () => void;
    onMessage: (contact: WeChatContact) => void;
}> = ({ data, contactId, compact, onBack, onMessage }) => {
    const contact = findContact(data, contactId);
    return (
        <>
            <SubHeader title="详细资料" compact={compact} onBack={onBack} />
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
                {contact ? (
                    <>
                        <div className="mb-2 flex gap-4 bg-white px-4 py-5">
                            <WeChatAvatar name={contact.remark || contact.name} src={contact.avatar} className="h-14 w-14" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[18px] font-semibold">{contact.remark || contact.name}</div>
                                {contact.remark && <div className="mt-1 truncate text-[13px] text-[#666666]">昵称：{contact.name}</div>}
                                {contact.wechatId && <div className="mt-1 truncate text-[13px] text-[#666666]">微信号：{contact.wechatId}</div>}
                                {contact.source && <div className="mt-1 truncate text-[13px] text-[#8a8a8a]">来源：{contact.source}</div>}
                            </div>
                        </div>
                        <div className="mb-2 bg-white px-4">
                            {contact.tags?.length ? <div className="border-b border-black/8 py-3 text-[14px]">标签 <span className="ml-3 text-[#576b95]">{contact.tags.join('、')}</span></div> : null}
                            {contact.bio && <div className="border-b border-black/8 py-3 text-[14px]">个性签名 <span className="ml-3 text-[#666666]">{contact.bio}</span></div>}
                            {contact.relationshipHint && <div className="py-3 text-[14px] text-[#666666]">{contact.relationshipHint}</div>}
                        </div>
                        <div className="bg-white p-4">
                            <button type="button" onClick={() => onMessage(contact)} className="h-10 w-full rounded-[5px] bg-[#07c160] text-[15px] font-medium text-white active:opacity-80">发消息</button>
                        </div>
                    </>
                ) : <WeChatEmpty title="联系人不存在" detail="当前数据里没有这个联系人" />}
            </div>
        </>
    );
};

const ContactBucketPage: React.FC<{
    data: WeChatData;
    bucket: WeChatContactBucket;
    compact: boolean;
    onBack: () => void;
    openProfile: (contactId: string) => void;
    openChat: (chatId: string) => void;
}> = ({ data, bucket, compact, onBack, openProfile, openChat }) => {
    const title = CONTACT_BUCKET_LABELS[bucket];

    if (bucket === 'groups') {
        const rows = groupRows(data);
        return (
            <>
                <SubHeader title={title} compact={compact} onBack={onBack} />
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
                    {rows.length > 0 ? (
                        <div className="bg-white">
                            {rows.map(row => (
                                <WeChatRow
                                    key={row.id}
                                    title={row.title}
                                    subtitle={row.subtitle}
                                    avatar={<WeChatAvatar name={row.title} src={row.avatar} className="h-9 w-9" />}
                                    onClick={() => row.chatId && openChat(row.chatId)}
                                />
                            ))}
                        </div>
                    ) : <WeChatEmpty title="暂无群聊" detail="当前数据里没有可显示的群聊" />}
                </div>
            </>
        );
    }

    if (bucket === 'official') {
        const rows = officialRows(data);
        return (
            <>
                <SubHeader title={title} compact={compact} onBack={onBack} />
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
                    {rows.length > 0 ? (
                        <div className="bg-white">
                            {rows.map(row => (
                                <WeChatRow
                                    key={row.id}
                                    title={row.title}
                                    subtitle={row.subtitle}
                                    avatar={<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-[#07c160] text-white"><BellSimple className="h-5 w-5" /></span>}
                                    onClick={() => openChat(row.chatId)}
                                />
                            ))}
                        </div>
                    ) : <WeChatEmpty title="暂无公众号 / 服务号" detail="当前数据里没有可显示的公众号或服务通知" />}
                </div>
            </>
        );
    }

    if (bucket === 'tags') {
        const rows = tagRows(data);
        return (
            <>
                <SubHeader title={title} compact={compact} onBack={onBack} />
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
                    {rows.length > 0 ? rows.map(row => (
                        <div key={row.tag}>
                            <div className="px-4 py-1 text-[10px] font-medium text-[#8a8a8a]">{row.tag}</div>
                            <div className="bg-white">
                                {row.contacts.map(contact => (
                                    <WeChatRow
                                        key={`${row.tag}-${contact.id}`}
                                        title={contact.remark || contact.name}
                                        subtitle={contact.relationshipHint || contact.bio || contact.wechatId}
                                        avatar={<WeChatAvatar name={contact.remark || contact.name} src={contact.avatar} className="h-9 w-9" />}
                                        onClick={() => openProfile(contact.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )) : <WeChatEmpty title="暂无标签" detail="当前数据里没有联系人标签" />}
                </div>
            </>
        );
    }

    const contacts = newFriendRows(data);
    return (
        <>
            <SubHeader title={title} compact={compact} onBack={onBack} />
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
                {contacts.length > 0 ? (
                    <div className="bg-white">
                        {contacts.map(contact => (
                            <WeChatRow
                                key={contact.id}
                                title={contact.remark || contact.name}
                                subtitle={compactText([contact.source, contact.relationshipHint, contact.wechatId])}
                                avatar={<WeChatAvatar name={contact.remark || contact.name} src={contact.avatar} className="h-9 w-9" />}
                                onClick={() => openProfile(contact.id)}
                            />
                        ))}
                    </div>
                ) : <WeChatEmpty title="暂无新的朋友" detail="当前数据里没有新的朋友记录" />}
            </div>
        </>
    );
};

const MomentsPage: React.FC<{ data: WeChatData; compact: boolean; onBack: () => void }> = ({ data, compact, onBack }) => (
    <>
        <SubHeader title="朋友圈" compact={compact} onBack={onBack} />
        <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            <div className="relative h-40 bg-[#d7d7d7]">
                {data.moments?.cover && <img src={data.moments.cover} alt="" className="h-full w-full object-cover" />}
                <div className="absolute bottom-[-1.25rem] right-4 flex items-end gap-2">
                    <span className="mb-2 text-[16px] font-semibold text-white drop-shadow">{data.profile.nickname}</span>
                    <WeChatAvatar name={data.profile.nickname} src={data.profile.avatar} className="h-14 w-14 border-2 border-white" />
                </div>
            </div>
            <div className="pt-8">
                {arrayFrom(data.moments?.posts).length > 0 ? arrayFrom(data.moments?.posts).map(post => <MomentPostView key={post.id} post={post} />) : <WeChatEmpty title="暂无朋友圈" detail="当前角色没有可显示的朋友圈数据" />}
            </div>
        </div>
    </>
);

const MomentPostView: React.FC<{ post: WeChatMomentPost }> = ({ post }) => (
    <div className="flex gap-3 border-b border-black/8 px-4 py-3">
        <WeChatAvatar name={post.authorName} src={post.authorAvatar} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-[#576b95]">{post.authorName}</div>
            {post.text && <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#111111]">{post.text}</div>}
            {post.images?.length ? (
                <div className="mt-2 grid grid-cols-3 gap-1">
                    {post.images.slice(0, 9).map((image, index) => (
                        <div key={`${post.id}-image-${index}`} className="aspect-square bg-[#e6e6e6]">
                            <img src={image} alt="" className="h-full w-full object-cover" />
                        </div>
                    ))}
                </div>
            ) : null}
            {post.location && <div className="mt-1 text-[11px] text-[#576b95]">{post.location}</div>}
            <div className="mt-1 text-[11px] text-[#8a8a8a]">{post.time}</div>
            {(post.likes?.length || post.comments?.length) ? (
                <div className="mt-2 bg-[#f3f3f3] p-2 text-[12px] text-[#576b95]">
                    {post.likes?.length ? <div>{post.likes.join('、')}</div> : null}
                    {post.comments?.map(comment => (
                        <div key={comment.id} className="mt-1"><span className="font-medium">{comment.authorName}：</span><span className="text-[#111111]">{comment.text}</span></div>
                    ))}
                </div>
            ) : null}
        </div>
    </div>
);

const SimpleListPage = <T extends { id: string },>({
    title,
    items,
    compact,
    onBack,
    renderItem,
    emptyTitle,
}: {
    title: string;
    items: T[];
    compact: boolean;
    onBack: () => void;
    renderItem: (item: T) => React.ReactNode;
    emptyTitle: string;
}) => (
    <>
        <SubHeader title={title} compact={compact} onBack={onBack} />
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
            {items.length > 0 ? <div className="bg-white">{items.map(item => renderItem(item))}</div> : <WeChatEmpty title={emptyTitle} detail="当前数据里没有可显示内容" />}
        </div>
    </>
);

const ServicesPage: React.FC<{
    data: WeChatData;
    compact: boolean;
    onBack: () => void;
    openPayments: () => void;
    openPaymentDetail: (id: string) => void;
}> = ({ data, compact, onBack, openPayments, openPaymentDetail }) => {
    const groups = arrayFrom(data.services?.groups);
    const fallbackGroups: WeChatServiceGroup[] = data.payments?.length ? [{
        id: 'payments',
        title: '支付',
        entries: [{ id: 'payment-records', title: '账单', subtitle: `${data.payments.length}条记录`, feature: 'payments' }],
    }] : [];
    const visibleGroups = groups.length > 0 ? groups : fallbackGroups;

    return (
        <>
            <SubHeader title="服务" compact={compact} onBack={onBack} />
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed] p-3">
                {visibleGroups.length > 0 ? visibleGroups.map(group => (
                    <div key={group.id} className="mb-3 overflow-hidden rounded-[8px] bg-white">
                        {group.title && <div className="px-4 py-2 text-[12px] text-[#8a8a8a]">{group.title}</div>}
                        {group.entries.map(entry => (
                            <button
                                key={entry.id}
                                type="button"
                                onClick={() => entry.paymentRecordId ? openPaymentDetail(entry.paymentRecordId) : entry.feature === 'payments' ? openPayments() : undefined}
                                className="flex w-full items-center gap-3 border-t border-black/8 px-4 py-3 text-left active:bg-[#f2f2f2]"
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-[#07c160] text-white"><FeatureIcon feature={entry.feature === 'payments' ? 'payments' : entry.feature} /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-medium">{entry.title}</span>
                                    {entry.subtitle && <span className="block truncate text-[12px] text-[#8a8a8a]">{entry.subtitle}</span>}
                                </span>
                                <CaretRight className="h-4 w-4 text-[#b2b2b2]" />
                            </button>
                        ))}
                    </div>
                )) : <WeChatEmpty title="暂无服务" detail="当前角色没有可显示的服务数据" />}
            </div>
        </>
    );
};

const PaymentRecordsPage: React.FC<{
    payments: WeChatPaymentRecord[];
    compact: boolean;
    onBack: () => void;
    onOpen: (id: string) => void;
}> = ({ payments, compact, onBack, onOpen }) => (
    <SimpleListPage
        title="账单"
        items={payments}
        compact={compact}
        onBack={onBack}
        emptyTitle="暂无账单"
        renderItem={payment => (
            <button key={payment.id} type="button" onClick={() => onOpen(payment.id)} className="flex w-full items-center gap-3 border-b border-black/8 px-4 py-3 text-left active:bg-[#f2f2f2]">
                <Receipt className="h-5 w-5 shrink-0 text-[#07c160]" />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{payment.title}</span>
                    <span className="block truncate text-[12px] text-[#8a8a8a]">{compactText([payment.subtitle, payment.time, payment.status])}</span>
                </span>
                <span className={`text-[14px] font-medium ${payment.type === 'income' || payment.type === 'refund' ? 'text-[#07c160]' : 'text-[#111111]'}`}>{payment.amount}</span>
            </button>
        )}
    />
);

const PaymentDetailPage: React.FC<{ payment?: WeChatPaymentRecord; compact: boolean; onBack: () => void }> = ({ payment, compact, onBack }) => (
    <>
        <SubHeader title="账单详情" compact={compact} onBack={onBack} />
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
            {payment ? (
                <div className="mt-2 bg-white px-4 py-5 text-center">
                    <div className="text-[16px] font-medium">{payment.title}</div>
                    <div className="mt-3 text-[28px] font-semibold">{payment.amount}</div>
                    <div className="mt-5 divide-y divide-black/8 text-left text-[14px]">
                        {[
                            ['说明', payment.subtitle],
                            ['时间', payment.time],
                            ['状态', payment.status],
                            ['类型', payment.type],
                        ].map(([label, value]) => value ? (
                            <div key={label} className="flex gap-4 py-3">
                                <span className="w-16 shrink-0 text-[#8a8a8a]">{label}</span>
                                <span className="min-w-0 flex-1 text-[#111111]">{value}</span>
                            </div>
                        ) : null)}
                    </div>
                </div>
            ) : <WeChatEmpty title="账单不存在" detail="当前数据里没有这条账单" />}
        </div>
    </>
);

const SettingsPage: React.FC<{ data?: WeChatSettingsData; compact: boolean; onBack: () => void }> = ({ data, compact, onBack }) => (
    <>
        <SubHeader title="设置" compact={compact} onBack={onBack} />
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
            {arrayFrom(data?.groups).length > 0 ? arrayFrom(data?.groups).map(group => (
                <div key={group.id} className="mb-2 bg-white">
                    {group.entries.map(entry => (
                        <WeChatRow key={entry.id} title={entry.title} subtitle={entry.subtitle} avatar={null} />
                    ))}
                </div>
            )) : <WeChatEmpty title="暂无设置项" detail="当前数据里没有可展示的设置项" />}
        </div>
    </>
);

interface WeChatAppProps {
    data: WeChatData;
    compact: boolean;
    onVisibleContentChange?: (content: WeChatVisibleContent) => void;
}

const WeChatApp: React.FC<WeChatAppProps> = ({ data, compact, onVisibleContentChange }) => {
    const [route, setRoute] = React.useState<WeChatRoute>({ name: 'main', tab: 'chats' });
    const currentTab = route.name === 'main' ? route.tab : route.fromTab;
    const visibleContent = React.useMemo(() => getCurrentVisibleContent(data, route), [data, route]);

    React.useEffect(() => {
        onVisibleContentChange?.(visibleContent);
    }, [onVisibleContentChange, visibleContent]);

    const goMain = React.useCallback((tab: WeChatMainTab = currentTab) => setRoute({ name: 'main', tab }), [currentTab]);
    const openFeature = React.useCallback((feature: WeChatFeatureKey, fromTab: WeChatMainTab = currentTab) => {
        if (feature === 'moments') setRoute({ name: 'moments', fromTab });
        else if (feature === 'favorites') setRoute({ name: 'favorites', fromTab });
        else if (feature === 'services') setRoute({ name: 'services', fromTab });
        else if (feature === 'works') setRoute({ name: 'works', fromTab });
        else if (feature === 'cards') setRoute({ name: 'cards', fromTab });
        else if (feature === 'stickers') setRoute({ name: 'stickers', fromTab });
        else if (feature === 'settings') setRoute({ name: 'settings', fromTab });
        else setRoute({ name: 'feature', feature, fromTab });
    }, [currentTab]);

    let content: React.ReactNode;
    if (route.name === 'main' && route.tab === 'chats') {
        content = <ChatsTab data={data} compact={compact} openChat={chatId => setRoute({ name: 'chat', chatId, fromTab: 'chats' })} openFeature={feature => openFeature(feature, 'chats')} />;
    } else if (route.name === 'main' && route.tab === 'contacts') {
        content = <ContactsTab data={data} compact={compact} openProfile={contactId => setRoute({ name: 'profile', contactId, fromTab: 'contacts' })} openBucket={bucket => setRoute({ name: 'contactBucket', bucket, fromTab: 'contacts' })} />;
    } else if (route.name === 'main' && route.tab === 'discover') {
        content = <FeatureListPage data={data} compact={compact} tab="discover" openFeature={feature => openFeature(feature, 'discover')} />;
    } else if (route.name === 'main') {
        content = <FeatureListPage data={data} compact={compact} tab="me" openFeature={feature => openFeature(feature, 'me')} />;
    } else if (route.name === 'chat') {
        content = <ChatPage data={data} compact={compact} route={route} onBack={() => goMain(route.fromTab)} />;
    } else if (route.name === 'profile') {
        content = (
            <ProfilePage
                data={data}
                contactId={route.contactId}
                compact={compact}
                onBack={() => goMain(route.fromTab)}
                onMessage={contact => {
                    const chat = findChatForContact(data, contact);
                    setRoute({ name: 'chat', chatId: chat?.id || `contact-${contact.id}`, fromTab: 'contacts', contactId: contact.id });
                }}
            />
        );
    } else if (route.name === 'contactBucket') {
        content = (
            <ContactBucketPage
                data={data}
                bucket={route.bucket}
                compact={compact}
                onBack={() => goMain(route.fromTab)}
                openProfile={contactId => setRoute({ name: 'profile', contactId, fromTab: 'contacts' })}
                openChat={chatId => setRoute({ name: 'chat', chatId, fromTab: 'contacts' })}
            />
        );
    } else if (route.name === 'moments') {
        content = <MomentsPage data={data} compact={compact} onBack={() => goMain(route.fromTab)} />;
    } else if (route.name === 'favorites') {
        content = (
            <SimpleListPage
                title="收藏"
                items={arrayFrom(data.favorites)}
                compact={compact}
                onBack={() => goMain(route.fromTab)}
                emptyTitle="暂无收藏"
                renderItem={(item: WeChatFavoriteItem) => (
                    <WeChatRow key={item.id} title={item.title || item.type} subtitle={compactText([item.content, item.fileName])} detail={item.time} avatar={<FeatureIcon feature="favorites" />} />
                )}
            />
        );
    } else if (route.name === 'services') {
        content = <ServicesPage data={data} compact={compact} onBack={() => goMain(route.fromTab)} openPayments={() => setRoute({ name: 'payments', fromTab: route.fromTab })} openPaymentDetail={paymentId => setRoute({ name: 'paymentDetail', paymentId, fromTab: route.fromTab })} />;
    } else if (route.name === 'payments') {
        content = <PaymentRecordsPage payments={arrayFrom(data.payments)} compact={compact} onBack={() => setRoute({ name: 'services', fromTab: route.fromTab })} onOpen={paymentId => setRoute({ name: 'paymentDetail', paymentId, fromTab: route.fromTab })} />;
    } else if (route.name === 'paymentDetail') {
        content = <PaymentDetailPage payment={arrayFrom(data.payments).find(payment => payment.id === route.paymentId)} compact={compact} onBack={() => setRoute({ name: 'payments', fromTab: route.fromTab })} />;
    } else if (route.name === 'works') {
        content = (
            <SimpleListPage
                title="视频号"
                items={arrayFrom(data.works)}
                compact={compact}
                onBack={() => goMain(route.fromTab)}
                emptyTitle="暂无作品"
                renderItem={(item: WeChatWorkItem) => <WeChatRow key={item.id} title={item.title || '作品'} subtitle={item.text} detail={compactText([item.time, item.metrics])} avatar={<FeatureIcon feature="works" />} />}
            />
        );
    } else if (route.name === 'cards') {
        content = (
            <SimpleListPage
                title="小店与卡包"
                items={arrayFrom(data.cards)}
                compact={compact}
                onBack={() => goMain(route.fromTab)}
                emptyTitle="暂无卡包"
                renderItem={(item: WeChatCardItem) => <WeChatRow key={item.id} title={item.title} subtitle={item.subtitle} detail={compactText([item.time, item.status])} avatar={<FeatureIcon feature="cards" />} />}
            />
        );
    } else if (route.name === 'stickers') {
        content = (
            <SimpleListPage
                title="表情"
                items={arrayFrom(data.stickers)}
                compact={compact}
                onBack={() => goMain(route.fromTab)}
                emptyTitle="暂无表情"
                renderItem={(item: WeChatStickerItem) => <WeChatRow key={item.id} title={item.title || '表情'} subtitle={item.usageHint} avatar={<FeatureIcon feature="stickers" />} />}
            />
        );
    } else if (route.name === 'settings') {
        content = <SettingsPage data={data.settings} compact={compact} onBack={() => goMain(route.fromTab)} />;
    } else {
        content = (
            <>
                <SubHeader title={FEATURE_LABELS[route.feature]} compact={compact} onBack={() => goMain(route.fromTab)} />
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#ededed]">
                    <WeChatEmpty title="暂无内容" detail="这个入口已启用，但当前数据没有可显示内容" />
                </div>
            </>
        );
    }

    return (
        <div className={`${compact ? '-mx-3 -my-3 min-h-[25rem]' : '-mx-4 -my-4 min-h-[34rem]'} flex h-full flex-col overflow-hidden bg-[#ededed] text-[#111111]`}>
            {content}
            {route.name === 'main' && <BottomTabs current={route.tab} onSelect={tab => setRoute({ name: 'main', tab })} compact={compact} />}
        </div>
    );
};

export default WeChatApp;
