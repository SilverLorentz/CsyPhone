import type { LoveShowGuest, LoveShowWindItem } from '../types/loveshow';
import { LOVE_SHOW_COPY } from './loveshowCopy';

interface CreateLoveShowWindItemsInput {
    guests: LoveShowGuest[];
    userName: string;
    day: number;
    sceneSummary?: string;
    preferredGuestId?: string;
}

const CP_RISK_RE = /(谁和谁最配|嘉宾\s*CP|CP\s*排名|嘉宾互选|互选心动|恋爱线投票|互相心动|锁死|在一起|最配|×)/i;

function stableIndex(seed: string, length: number): number {
    if (length <= 0) return 0;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    return hash % length;
}

function pickGuest(guests: LoveShowGuest[], preferredGuestId: string | undefined, offset: number): LoveShowGuest | null {
    if (guests.length === 0) return null;
    const preferred = preferredGuestId ? guests.find(guest => guest.id === preferredGuestId) : null;
    if (preferred && offset === 0) return preferred;
    const start = stableIndex(`${preferredGuestId || 'wind'}_${offset}`, guests.length);
    return guests[(start + offset) % guests.length] || guests[0];
}

export function isUserCenteredLoveShowWindItem(
    item: Pick<LoveShowWindItem, 'title' | 'body' | 'effectHint'>,
    userName: string,
): boolean {
    const text = [item.title, item.body, item.effectHint].filter(Boolean).join(' ');
    if (!text.trim()) return false;
    if (CP_RISK_RE.test(text)) return false;
    return text.includes('你') || text.includes(userName);
}

export function getLoveShowWindEffectHint(items: LoveShowWindItem[]): string | undefined {
    return items.find(item => item.type === 'solo_date')?.effectHint
        || items.find(item => item.type === 'most_obvious')?.effectHint
        || items.find(item => item.effectHint)?.effectHint;
}

export function createLoveShowWindItems(input: CreateLoveShowWindItemsInput): LoveShowWindItem[] {
    const guests = input.guests.slice(0, 4);
    const primary = pickGuest(guests, input.preferredGuestId, 0);
    if (!primary) return [];

    const secondary = pickGuest(guests, input.preferredGuestId, 1) || primary;
    const third = pickGuest(guests, input.preferredGuestId, 2) || primary;
    const userLabel = input.userName.trim() || '你';
    const dayKey = `d${input.day}`;
    const sceneHint = input.sceneSummary?.trim()
        ? `刚刚那段被剪成短片后，观众都在反复回看：${input.sceneSummary.trim()}`
        : `Day ${input.day} 的镜头刚收束，观众已经开始猜下一次谁会靠近你。`;

    const items: LoveShowWindItem[] = [
        {
            id: `wind_${dayKey}_solo_${primary.id}`,
            type: 'solo_date',
            guestId: primary.id,
            title: '观众正在起哄',
            body: `他们想看你和${primary.name}单独聊聊。`,
            effectHint: `下一轮镜头会更容易把${primary.name}推到你身边。`,
        },
        {
            id: `wind_${dayKey}_obvious_${secondary.id}`,
            type: 'most_obvious',
            guestId: secondary.id,
            title: LOVE_SHOW_COPY.windReveal,
            body: `今天最藏不住的人，好像是${secondary.name}。`,
            effectHint: `${secondary.name}会获得一次主动靠近你的机会。`,
        },
        {
            id: `wind_${dayKey}_scene_${third.id}`,
            type: 'famous_scene',
            guestId: third.id,
            title: '最像心动名场面的瞬间',
            body: sceneHint.includes(userLabel) || sceneHint.includes('你')
                ? sceneHint
                : `${sceneHint} 但所有讨论最后还是回到你和嘉宾的关系张力。`,
        },
        {
            id: `wind_${dayKey}_lens_${primary.id}`,
            type: 'tomorrow_lens',
            guestId: primary.id,
            title: '明日镜头倾向',
            body: `${primary.name}获得一次主动靠近你的机会。`,
            effectHint: LOVE_SHOW_COPY.windRule,
        },
    ];

    return items.filter(item => isUserCenteredLoveShowWindItem(item, userLabel));
}
