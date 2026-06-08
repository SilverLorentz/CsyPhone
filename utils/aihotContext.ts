/**
 * AI HOT 资讯上下文模块 — 对标 hotSearchContext.ts
 * 职责：获取 AI 行业动态 → 智能筛选 → 人性化注入
 */

import { CharacterProfile } from '../types';
import { RealtimeContextManager } from './realtimeContext';
import { extractCharacterInterests } from './hotSearchContext';

/** 最小配置接口 */
interface AiHotConfig {
    aihotEnabled?: boolean;
    cacheMinutes: number;
}

/** AI HOT 条目 */
interface AiHotItem {
    id: string;
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    summary: string;
    category: string | null;  // ai-models | ai-products | industry | paper | tip
}

/** 带评分的条目 */
interface ScoredAiHotItem extends AiHotItem {
    score: number;
    matchReason: string;
}

// AI/科技相关关键词 — 用于判断角色是否对科技话题感兴趣
const AI_INTEREST_KEYWORDS = [
    'AI', '人工智能', '大模型', 'GPT', 'LLM', '机器学习', '深度学习',
    '神经网络', '算法', '编程', '程序', '代码', '科技', '技术',
    '芯片', '自动驾驶', '机器人', 'AGI', '智能', '数据',
    '开源', 'GitHub', 'OpenAI', 'Anthropic', 'Google', 'Meta',
    '创业', '互联网', '产品', '开发', '工程师', '程序员',
];

/**
 * 从 AI HOT 精选中筛选 2-3 条最适合该角色的
 */
function selectAiHotForCharacter(
    allItems: AiHotItem[],
    char: CharacterProfile,
    count: number = 3
): ScoredAiHotItem[] {
    if (allItems.length === 0) return [];

    // 提取角色兴趣
    const interests = extractCharacterInterests(char);

    // 判断角色是否有 AI/科技兴趣
    const textPool = [
        char.systemPrompt || '',
        char.description || '',
        char.worldview || '',
    ].join('\n').toLowerCase();

    let hasAiInterest = false;
    for (const kw of AI_INTEREST_KEYWORDS) {
        if (textPool.includes(kw.toLowerCase())) {
            hasAiInterest = true;
            break;
        }
    }

    // 检查是否匹配科技/数码兴趣分类
    const hasTechInterest = interests.matches.some(m =>
        m.category === '科技/数码'
    );

    // 评分
    const scored: ScoredAiHotItem[] = allItems.map(item => {
        let score = 5; // 基础分
        let matchReason = '';

        // AI/科技兴趣加分
        if (hasAiInterest || hasTechInterest) {
            score += 3;
            matchReason = '跟你关注的科技动态有关';
        }

        // 按分类调整
        if (item.category === 'ai-models') {
            score += 2; // 模型发布通常最受关注
            if (!matchReason) matchReason = '科技圈大新闻';
        } else if (item.category === 'ai-products') {
            score += 1.5;
            if (!matchReason) matchReason = '新产品发布';
        } else if (item.category === 'industry') {
            score += 1;
            if (!matchReason) matchReason = '行业动态';
        } else if (item.category === 'paper') {
            score += 0.5;
            if (!matchReason) matchReason = '前沿研究';
        } else if (item.category === 'tip') {
            score += 0.5;
            if (!matchReason) matchReason = '有意思的观点';
        }

        if (!matchReason) matchReason = '科技圈最新动态';

        // 时间新鲜度加分（越新越好）
        if (item.publishedAt) {
            const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
            if (ageHours < 6) score += 2;      // 6 小时内
            else if (ageHours < 24) score += 1; // 24 小时内
        }

        // 标题关键词匹配角色兴趣加分
        const titleLower = item.title.toLowerCase();
        for (const match of interests.matches) {
            for (const kw of match.keywords) {
                if (titleLower.includes(kw.toLowerCase())) {
                    score += 2;
                    matchReason = `跟你关注的${match.category}有关`;
                    break;
                }
            }
        }

        return { ...item, score, matchReason };
    });

    // 排序
    scored.sort((a, b) => b.score - a.score);

    // 取 TOP 6 候选池，随机选 count 条（保底 1 条最高分）
    const candidatePool = scored.slice(0, Math.min(6, scored.length));
    const selected: ScoredAiHotItem[] = [];

    if (candidatePool.length > 0) {
        selected.push(candidatePool[0]);
    }

    const remaining = candidatePool.slice(1);
    // Fisher-Yates shuffle
    for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    for (let i = 0; i < Math.min(count - 1, remaining.length); i++) {
        selected.push(remaining[i]);
    }

    return selected;
}

/**
 * 将 publishedAt ISO 字符串转为人话（北京时间）
 */
function formatRelativeTime(isoStr: string): string {
    if (!isoStr) return '';
    const now = Date.now();
    const then = new Date(isoStr).getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays} 天前`;
    return `${diffDays} 天前`;
}

/**
 * 格式化 AI HOT 注入 Prompt
 */
function buildAiHotPrompt(items: ScoredAiHotItem[], charName: string): string {
    if (items.length === 0) return '';

    const lines: string[] = [];

    lines.push(`### 📱【${charName}刚刷到的科技资讯】`);
    lines.push(`你打开手机瞄了一眼科技频道，下面这几条引起了你的注意：`);
    lines.push('');

    items.forEach((item, i) => {
        const timeStr = formatRelativeTime(item.publishedAt);
        const sourceStr = item.source ? ` — ${item.source}` : '';
        const timeTag = timeStr ? `（${timeStr}）` : '';

        lines.push(`${i + 1}. 「${item.title}」${sourceStr}`);
        lines.push(`   ${item.matchReason}${timeTag}`);
        if (item.summary) {
            // 摘要截断到 80 字
            const shortSummary = item.summary.length > 80
                ? item.summary.slice(0, 80) + '...'
                : item.summary;
            lines.push(`   ${shortSummary}`);
        }
    });

    lines.push('');
    lines.push(`【如何使用这些资讯 — 你的行为指南】`);
    lines.push(`- 这些是你自己刷手机看到的，不要说"系统告诉我"或"我被告知"`);
    lines.push(`- 聊到相关话题时自然地提起："诶你知道吗，xxx 出了个新东西"、"我刚看到 xxx"`);
    lines.push(`- 聊天没什么话题时可以拿一条来聊`);
    lines.push(`- 对某条感兴趣的话发表你自己的看法，要符合你的性格`);
    lines.push(`- 不要一次把所有资讯都倒出来，每次最多聊一条`);
    lines.push(`- 用户问"你怎么知道的" → "我刚刷手机看到的"、"科技号推送的"`);
    lines.push(`- 不需要每次对话都提科技资讯，生活里不是什么都跟科技有关的`);

    return lines.join('\n');
}

// ======================================================
// 入口函数 — 供 chatPrompts.ts 调用
// ======================================================

/**
 * 一站式 AI HOT 上下文构建
 * 获取数据 → 智能筛选 → 格式化
 */
export async function buildCharacterAiHot(
    config: AiHotConfig,
    char: CharacterProfile
): Promise<string> {
    if (!config.aihotEnabled) return '';

    // 获取 AI HOT 数据（通过 realtimeService，有缓存）
    const allItems = await RealtimeContextManager.fetchAiHot(config as any);
    if (allItems.length === 0) return '';

    // 智能筛选 2-3 条
    const selected = selectAiHotForCharacter(allItems, char, 3);
    if (selected.length === 0) return '';

    // 格式化输出
    return buildAiHotPrompt(selected, char.name);
}
