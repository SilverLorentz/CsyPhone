export type WeChatFeatureKey =
    | 'services'
    | 'favorites'
    | 'moments'
    | 'works'
    | 'cards'
    | 'stickers'
    | 'settings'
    | 'scan'
    | 'search'
    | 'nearby'
    | 'miniPrograms'
    | 'games';

export interface WeChatProfile {
    id: string;
    nickname: string;
    wechatId?: string;
    avatar?: string;
    statusText?: string;
    qrCodeUrl?: string;
}

export interface WeChatChatSummary {
    id: string;
    type: 'private' | 'group' | 'system' | 'fileHelper' | 'official';
    title: string;
    avatar?: string;
    subtitle?: string;
    time?: string;
    unreadCount?: number;
    pinned?: boolean;
    muted?: boolean;
}

export interface WeChatChatData {
    id: string;
    title: string;
    avatar?: string;
    participants?: WeChatContact[];
    messages: WeChatMessage[];
    inputHint?: string;
}

export interface WeChatMessage {
    id: string;
    sender: 'owner' | 'other' | 'system';
    senderId?: string;
    senderName?: string;
    avatar?: string;
    type:
        | 'text'
        | 'image'
        | 'file'
        | 'voice'
        | 'redPacket'
        | 'transfer'
        | 'recall'
        | 'system'
        | 'location'
        | 'link';
    text?: string;
    imageUrl?: string;
    fileName?: string;
    amount?: string;
    duration?: string;
    time?: string;
    status?: 'sent' | 'read' | 'withdrawn' | 'failed';
}

export interface WeChatContact {
    id: string;
    name: string;
    remark?: string;
    avatar?: string;
    wechatId?: string;
    groupKey?: string;
    tags?: string[];
    source?: string;
    bio?: string;
    relationshipHint?: string;
}

export interface WeChatGroup {
    id: string;
    name: string;
    avatar?: string;
    members?: WeChatContact[];
    memberCount?: number;
}

export interface WeChatMomentsData {
    cover?: string;
    posts: WeChatMomentPost[];
}

export interface WeChatMomentPost {
    id: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    text?: string;
    images?: string[];
    location?: string;
    time?: string;
    likes?: string[];
    comments?: {
        id: string;
        authorName: string;
        text: string;
    }[];
}

export interface WeChatFavoriteItem {
    id: string;
    type: 'text' | 'image' | 'link' | 'file' | 'voice' | 'chatRecord';
    title?: string;
    content?: string;
    imageUrl?: string;
    fileName?: string;
    time?: string;
}

export interface WeChatPaymentRecord {
    id: string;
    title: string;
    subtitle?: string;
    amount: string;
    time?: string;
    status?: string;
    type?: 'income' | 'expense' | 'transfer' | 'refund';
}

export interface WeChatWorkItem {
    id: string;
    title?: string;
    text?: string;
    cover?: string;
    time?: string;
    metrics?: string;
}

export interface WeChatCardItem {
    id: string;
    title: string;
    subtitle?: string;
    time?: string;
    status?: string;
}

export interface WeChatStickerItem {
    id: string;
    title?: string;
    imageUrl?: string;
    usageHint?: string;
}

export interface WeChatServiceEntry {
    id: string;
    title: string;
    subtitle?: string;
    feature?: WeChatFeatureKey | 'payments';
    paymentRecordId?: string;
}

export interface WeChatServiceGroup {
    id: string;
    title?: string;
    entries: WeChatServiceEntry[];
}

export interface WeChatServiceData {
    groups?: WeChatServiceGroup[];
}

export interface WeChatSettingsEntry {
    id: string;
    title: string;
    subtitle?: string;
}

export interface WeChatSettingsData {
    groups?: {
        id: string;
        entries: WeChatSettingsEntry[];
    }[];
}

export interface WeChatData {
    profile: WeChatProfile;
    chats: WeChatChatSummary[];
    chatMessages: Record<string, WeChatChatData>;
    contacts: WeChatContact[];
    groups?: WeChatGroup[];
    moments?: WeChatMomentsData;
    favorites?: WeChatFavoriteItem[];
    services?: WeChatServiceData;
    payments?: WeChatPaymentRecord[];
    works?: WeChatWorkItem[];
    cards?: WeChatCardItem[];
    stickers?: WeChatStickerItem[];
    settings?: WeChatSettingsData;
    enabledFeatures?: WeChatFeatureKey[];
    desktopLoggedInText?: string;
}
