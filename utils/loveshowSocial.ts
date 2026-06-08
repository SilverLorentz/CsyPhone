import type { CharacterProfile } from '../types';
import type { ImageGenerationConfig, ImageGenerationStyle } from '../types/photo';
import type {
    DirectorMission,
    LoveShowFeedAuthorType,
    LoveShowFeedComment,
    LoveShowFeedImage,
    LoveShowFeedPost,
    LoveShowFeedSource,
    LoveShowPrivateSecret,
    LoveShowSocialPost,
    LoveShowWindItem,
    SocialImageIntent,
    SocialSignal,
} from '../types/loveshow';
import { getLoveShowImagePresetId } from './loveshowPrompts';

const SOCIAL_POST_LIMIT = 80;
const SOCIAL_SIGNAL_LIMIT = 160;
const ALT_NICKNAMES = ['匿名心跳', '玻璃窗外', '不署名观众', '晚风账号', '只看一眼'];
export const LOVE_SHOW_MIN_COMMENTS_PER_POST = 0;

const AUDIENCE_COMMENT_TEMPLATES = [
    '这条下面怎么突然有录制现场的味道了，我先蹲一个后续。',
    '{userName}一发动态，嘉宾们的语气都开始变得很有信息量。',
    '别急着站队，这种停顿一般都是下一轮镜头的伏笔。',
    '我觉得重点不是谁先评论，是谁评论的时候最不像平时。',
    '这条如果被剪进正片，观众席一定会集体倒回去看细节。',
    '节目组别装没看见，评论区已经比预告片还会说话。',
    '目前看下来，大家都在等{userName}下一句怎么接。',
    '我宣布这条动态可以加入今日心动风向观察样本。',
    '有些话看起来像普通留言，其实全是试探。',
    '谁懂，越是轻描淡写越像有事。',
    '这条下面的气氛已经不是普通营业了。',
    '先别嗑错方向，恋爱主线还是{userName}和嘉宾之间。',
    '这才像恋综，公开场一句话，评论区十五层暗流。',
    '我只想知道镜头外他们看到这条时是什么表情。',
    '这一季的弹幕一定会为了这条吵到明天。',
    '这不是普通动态，这是节目组应该重点标注的情绪证据。',
];

const GUEST_COMMENT_TEMPLATES_FOR_USER = [
    '看到这条的时候我停了一下。{userName}，你这句话是不是也给我留了半句？',
    '如果这是公开场能说的版本，那镜头外的版本我想亲自听。',
    '你把话说得这么轻，反而让人更想追问。',
    '我不太会在评论区抢镜，但这条我想留下来。',
    '下次不要只发给所有人看，也可以单独问我。',
    '我读了两遍，第二遍才发现自己好像有点在意。',
];

const GUEST_COMMENT_TEMPLATES_FOR_GUEST = [
    '你这条发得太明显了，最后还是在等{userName}回应吧。',
    '别把重点说得这么轻，镜头都拍到你刚才的停顿了。',
    '我也看到了，但我更想知道{userName}怎么理解。',
    '你这句像随手发的，其实一点也不随手。',
    '先别急着把话说完，给{userName}留一点选择权。',
    '评论区都看出来了，你应该也不用装得太自然。',
];

const GUEST_COMMENT_TEMPLATES_FOR_PUBLIC = [
    '这个角度有点准，但真正的重点还是{userName}刚才没说完的话。',
    '观众看到的是表面，现场那几秒比文字更明显。',
    '别替{userName}决定答案，下一轮镜头才知道。',
    '我只补一句：有些反应不是营业能演出来的。',
    '这条可以讨论，但不要把嘉宾之间误读成恋爱线。',
    '如果要复盘，最好把{userName}的选择也放进去看。',
];

export interface LoveShowSocialGuestBrief {
    id: string;
    name: string;
    avatar?: string;
    appearance?: string;
    roleInShow?: string;
}

export interface LoveShowSocialImagePlan {
    mode: 'solo' | 'couple';
    includeAppearance: boolean;
    includeUserAppearance: boolean;
    presetId: string;
}

function createSocialId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function stableIndex(seed: string, size: number): number {
    if (size <= 0) return 0;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash % size;
}

function compactText(value: string | undefined | null, maxLength: number): string {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function templateToRegExp(template: string): RegExp {
    const pattern = escapeForRegExp(template)
        .replace(/\\\{userName\\\}/g, '.+?')
        .replace(/\\\{authorName\\\}/g, '.+?')
        .replace(/\\\{postAuthorName\\\}/g, '.+?');
    return new RegExp(`^${pattern}$`);
}

const GENERATED_COMMENT_TEMPLATE_RE = [
    ...AUDIENCE_COMMENT_TEMPLATES,
    ...GUEST_COMMENT_TEMPLATES_FOR_USER,
    ...GUEST_COMMENT_TEMPLATES_FOR_GUEST,
    ...GUEST_COMMENT_TEMPLATES_FOR_PUBLIC,
].map(templateToRegExp);
const STOCK_SOCIAL_COMMENT_RE = /(遗憾留给|心动留给|被看见|留给昨天|我选[ABCDＡＢＣＤ]|大家怎么看|呼声最高|心动风向标|Day\s*\d+\s*总结|总结：|温柔庇护组|真迹拆穿组|宿命拉扯组|推倒重来组|投票|^[^，。！？]{0,8}留给[^，。！？]{0,12}[，,][^，。！？]{0,12}留给)/i;

function isTemplateGeneratedComment(raw: Partial<LoveShowFeedComment>, content: string): boolean {
    const id = String(raw.id || '');
    if (/^comment_(?:guest|audience)_/.test(id)) return true;
    if (STOCK_SOCIAL_COMMENT_RE.test(content)) return true;
    return GENERATED_COMMENT_TEMPLATE_RE.some(pattern => pattern.test(content));
}

function isVerifiedGeneratedGuestComment(comment: LoveShowFeedComment): boolean {
    return Boolean(comment.authorGuestId) && /^comment_ai_/.test(comment.id);
}

function authorIdFromName(type: LoveShowFeedAuthorType, name: string): string {
    const safeName = name.replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 24);
    return `${type}_${safeName || 'account'}`;
}

function inferAuthorType(raw: Partial<LoveShowFeedPost>): LoveShowFeedAuthorType {
    if (raw.authorType) return raw.authorType;
    if (raw.authorGuestId || raw.guestRefs?.length) return 'guest';
    return 'audience';
}

function inferSource(raw: Partial<LoveShowFeedPost>): LoveShowFeedSource {
    if (raw.source) return raw.source;
    if (raw.sourceTicketId || raw.locationId) return 'wind';
    return 'system';
}

function normalizeComment(raw: Partial<LoveShowFeedComment>, postId: string, index: number): LoveShowFeedComment | null {
    const authorType = raw.authorType || 'audience';
    const authorName = compactText(raw.authorName, 24) || '心动观众';
    const content = compactText(raw.content, 180);
    if (!content || isTemplateGeneratedComment(raw, content)) return null;
    return {
        id: raw.id || createSocialId(`comment_${index}`),
        postId,
        authorType,
        authorId: raw.authorId || authorIdFromName(authorType, authorName),
        authorName,
        authorGuestId: raw.authorGuestId,
        content,
        createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    };
}

function normalizeImage(raw: Partial<LoveShowFeedImage> | undefined): LoveShowFeedImage | undefined {
    if (!raw || !raw.intent || !raw.stylePresetId || !raw.prompt) return undefined;
    const status = raw.status === 'ready' || raw.status === 'failed' ? raw.status : 'pending';
    return {
        intent: raw.intent,
        stylePresetId: raw.stylePresetId,
        prompt: raw.prompt,
        assetId: raw.assetId,
        status,
    };
}

export function normalizeLoveShowSocialPost(raw: Partial<LoveShowFeedPost>, day: number): LoveShowSocialPost {
    const authorType = inferAuthorType(raw);
    const username = compactText(raw.username || raw.authorName, 28) || '心动观众';
    const authorName = compactText(raw.authorName || username, 28) || username;
    const id = raw.id || createSocialId('post');
    const content = compactText(raw.content, 280);
    const source = inferSource(raw);
    const likeCount = typeof raw.likeCount === 'number'
        ? Math.max(0, Math.round(raw.likeCount))
        : typeof raw.likes === 'number'
            ? Math.max(0, Math.round(raw.likes))
            : 0;
    const comments = Array.isArray(raw.comments)
        ? raw.comments
            .map((comment, index) => normalizeComment(comment, id, index))
            .filter((comment): comment is LoveShowFeedComment => Boolean(comment))
            .filter(comment => !(
                source === 'system'
                && authorType === 'audience'
                && comment.authorType === 'guest'
                && !isVerifiedGeneratedGuestComment(comment)
            ))
        : [];

    return {
        id,
        platform: raw.platform === 'xhs' ? 'xhs' : 'weibo',
        username,
        content,
        likes: likeCount,
        dayNumber: typeof raw.dayNumber === 'number' ? raw.dayNumber : day,
        authorType,
        authorId: raw.authorId || raw.authorGuestId || authorIdFromName(authorType, authorName),
        authorName,
        authorAvatar: raw.authorAvatar,
        authorGuestId: raw.authorGuestId || raw.guestRefs?.[0]?.guestId,
        hiddenOwnerGuestId: raw.hiddenOwnerGuestId,
        image: normalizeImage(raw.image),
        source,
        comments,
        likeCount,
        likedByUser: raw.likedByUser === true,
        recognizedByUser: raw.recognizedByUser === true,
        createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
        guestRefs: raw.guestRefs,
        sourceTicketId: raw.sourceTicketId,
        locationId: raw.locationId,
    };
}

export function isLoveShowTemplateFallbackPost(post: LoveShowSocialPost): boolean {
    const content = compactText(post.content, 280);
    if (!content) return true;
    if (post.source === 'scene_end' && post.authorType === 'guest' && content.startsWith('刚才那段停顿比台本长一点。')) {
        return true;
    }
    if (post.source === 'private_secret' && post.authorType === 'guest_alt' && content === '有些话在镜头前只能停一下。差点露出来的时候，反而更想装作没事。') {
        return true;
    }
    if (post.source === 'system' && post.authorType === 'audience') {
        const identity = `${post.username} ${post.authorName}`;
        if (identity.includes('心动风向标')) return true;
        return content.includes('心动风向又被观众起哄了，大家最想看TA下一步靠近谁。')
            || content.includes('今日风向有点微妙')
            || content.includes('单独约会投票')
            || content.includes('本轮最想看的单独约会')
            || (content.includes('心动放送开播了') && content.includes('的眼神感觉藏了很多话。'))
            || (content.includes('观众正在起哄，但别急着替') && content.includes('本质上还是都在观察'));
    }
    if (post.source === 'wind' && post.authorType === 'audience') {
        return content.startsWith('#心动风向#')
            && content.includes('这段心动片段有点安静')
            && content.includes('每个停顿都在等');
    }
    return false;
}

export function normalizeLoveShowSocialPosts(raw: Partial<LoveShowFeedPost>[], day: number): LoveShowSocialPost[] {
    return raw
        .filter(Boolean)
        .map(post => normalizeLoveShowSocialPost(post, day))
        .filter(post => !isLoveShowTemplateFallbackPost(post))
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-SOCIAL_POST_LIMIT);
}

export function mergeLoveShowSocialPosts(
    existing: LoveShowSocialPost[],
    additions: LoveShowSocialPost[],
): LoveShowSocialPost[] {
    const map = new Map<string, LoveShowSocialPost>();
    for (const post of [...existing, ...additions]) {
        map.set(post.id, post);
    }
    return [...map.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-SOCIAL_POST_LIMIT);
}

export function ensureLoveShowPostCommentFloor(
    post: LoveShowSocialPost,
    input: {
        userName: string;
        guests: LoveShowSocialGuestBrief[];
        minComments?: number;
        createdAt?: number;
    },
): LoveShowSocialPost {
    void input;
    const comments = post.comments
        .map((comment, index) => normalizeComment(comment, post.id, index))
        .filter((comment): comment is LoveShowFeedComment => Boolean(comment));
    return {
        ...post,
        comments,
    };
}

export function ensureLoveShowPostsCommentFloor(
    posts: LoveShowSocialPost[],
    input: {
        userName: string;
        guests: LoveShowSocialGuestBrief[];
        minComments?: number;
        createdAt?: number;
    },
): LoveShowSocialPost[] {
    return posts.map(post => ensureLoveShowPostCommentFloor(post, input));
}

export function createLoveShowSocialSignal(input: Omit<SocialSignal, 'id' | 'consumed' | 'createdAt'> & {
    id?: string;
    consumed?: boolean;
    createdAt?: number;
}): SocialSignal {
    return {
        ...input,
        id: input.id || createSocialId('signal'),
        consumed: input.consumed === true,
        createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
    };
}

export function appendLoveShowSocialSignals(existing: SocialSignal[], additions: SocialSignal[]): SocialSignal[] {
    const map = new Map<string, SocialSignal>();
    for (const signal of [...existing, ...additions]) {
        map.set(signal.id, signal);
    }
    return [...map.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-SOCIAL_SIGNAL_LIMIT);
}

export function getUnconsumedLoveShowSocialSignals(signals: SocialSignal[], limit = 12): SocialSignal[] {
    return signals.filter(signal => !signal.consumed).slice(-limit);
}

export function markLoveShowSocialSignalsConsumed(signals: SocialSignal[], consumedIds: string[]): SocialSignal[] {
    const idSet = new Set(consumedIds);
    return signals.map(signal => idSet.has(signal.id) ? { ...signal, consumed: true } : signal);
}

export function getLoveShowSocialImagePlan(
    intent: SocialImageIntent,
    imageStyle: ImageGenerationStyle,
): LoveShowSocialImagePlan {
    const coupleIntent = intent === 'guest_couple_moment' || intent === 'date_scene';
    const noCharacterIntent = intent === 'object_clue' || intent === 'alt_account_mood';
    const userSelfPostIntent = intent === 'user_post_image';
    const mode = coupleIntent ? 'couple' : 'solo';
    return {
        mode,
        includeAppearance: !noCharacterIntent,
        includeUserAppearance: coupleIntent || userSelfPostIntent,
        presetId: getLoveShowImagePresetId(mode, imageStyle),
    };
}

export function canUseLoveShowSocialImage2(config: ImageGenerationConfig): boolean {
    const openai = config.openaiCompatible;
    return config.activeProvider === 'openai-compatible'
        && Boolean(openai.baseUrl.trim())
        && Boolean(openai.apiKey.trim())
        && Boolean(openai.model.trim());
}

export function createLoveShowFeedImage(
    intent: SocialImageIntent,
    imageStyle: ImageGenerationStyle,
    prompt: string,
): LoveShowFeedImage {
    const plan = getLoveShowSocialImagePlan(intent, imageStyle);
    return {
        intent,
        stylePresetId: plan.presetId,
        prompt,
        status: 'pending',
    };
}

export function createLoveShowProgramWindPosts(input: {
    windItems: LoveShowWindItem[];
    day: number;
    createdAt?: number;
}): LoveShowSocialPost[] {
    const createdAt = input.createdAt || Date.now();
    return input.windItems.slice(0, 3).map((item, index) => normalizeLoveShowSocialPost({
        id: `program_wind_${item.id}`,
        platform: 'weibo',
        username: '心动放送节目组',
        content: `#心动风向# ${item.title}：${item.body}`,
        dayNumber: input.day,
        authorType: 'program',
        authorId: 'loveshow_program',
        authorName: '心动放送节目组',
        authorGuestId: item.guestId,
        source: 'wind',
        likeCount: 300 + index * 67,
        likes: 300 + index * 67,
        createdAt: createdAt + index,
    }, input.day));
}

export function createLoveShowMissionProgramPost(input: {
    mission: DirectorMission;
    day: number;
    createdAt?: number;
}): LoveShowSocialPost {
    const createdAt = input.createdAt || Date.now();
    return normalizeLoveShowSocialPost({
        id: `program_mission_${input.mission.id}`,
        platform: 'weibo',
        username: '心动放送节目组',
        content: `#隐藏心令# ${input.mission.description}。奖励：${input.mission.reward || '等待揭晓'}`,
        dayNumber: input.day,
        authorType: 'program',
        authorId: 'loveshow_program',
        authorName: '心动放送节目组',
        source: 'program_notice',
        likeCount: 188,
        likes: 188,
        createdAt,
    }, input.day);
}

export function createLoveShowGuestScenePosts(input: {
    day: number;
    sceneSummary: string;
    userName: string;
    guests: LoveShowSocialGuestBrief[];
    preferredGuestId?: string;
    imageStyle: ImageGenerationStyle;
    enableImage: boolean;
    createdAt?: number;
}): LoveShowSocialPost[] {
    void input;
    return [];
}

export function createLoveShowAltPostFromSecret(input: {
    secret: LoveShowPrivateSecret;
    guest: LoveShowSocialGuestBrief;
    day: number;
    imageStyle: ImageGenerationStyle;
    enableImage: boolean;
    createdAt?: number;
}): LoveShowSocialPost {
    const createdAt = input.createdAt || Date.now();
    const nickname = ALT_NICKNAMES[stableIndex(input.secret.id, ALT_NICKNAMES.length)];
    const imagePrompt = [
        '节目内匿名小号发帖配图，只表达心情，不露脸。',
        `情绪来源：${input.secret.publicSubtextHint || '有些话只在镜头外出现过，公开场差点露出破绽。'}`,
        '画面要求：局部视角、物件或场景图，例如水杯、门把手、窗边雨痕、没发出的短信；不要出现人脸，不要出现具体文字。',
    ].join('\n');
    return normalizeLoveShowSocialPost({
        id: createSocialId('alt_post'),
        platform: 'weibo',
        username: nickname,
        content: '有些话在镜头前只能停一下。差点露出来的时候，反而更想装作没事。',
        dayNumber: input.day,
        authorType: 'guest_alt',
        authorId: `alt_${input.secret.guestId}`,
        authorName: nickname,
        hiddenOwnerGuestId: input.secret.guestId,
        image: input.enableImage ? createLoveShowFeedImage('alt_account_mood', input.imageStyle, imagePrompt) : undefined,
        source: 'private_secret',
        likeCount: 76,
        likes: 76,
        createdAt,
    }, input.day);
}

export function getLoveShowSocialSignalContext(signals: SocialSignal[], guestNameById: Map<string, string>): string {
    const activeSignals = getUnconsumedLoveShowSocialSignals(signals, 8);
    if (activeSignals.length === 0) return '';
    const actionLabels: Record<SocialSignal['action'], string> = {
        post: '发帖',
        like: '点赞',
        comment: '评论',
        reply: '回复',
        recognize_alt: '识破小号',
    };
    return activeSignals.map(signal => {
        const target = signal.targetGuestId ? guestNameById.get(signal.targetGuestId) || signal.targetGuestId : '节目现场';
        const emotion = signal.emotion ? `，情绪=${signal.emotion}` : '';
        return `- ${signal.actorType}/${signal.actorId} ${actionLabels[signal.action]} -> ${target}，强度=${signal.intensity}${emotion}`;
    }).join('\n');
}

export function createLoveShowSocialCharacter(char: CharacterProfile | undefined): LoveShowSocialGuestBrief | null {
    if (!char) return null;
    return {
        id: char.id,
        name: char.name,
        avatar: char.avatar,
        appearance: char.photoAppearancePrompt,
    };
}
