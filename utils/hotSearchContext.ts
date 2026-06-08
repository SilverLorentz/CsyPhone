/**
 * 热搜独立上下文模块 — 解耦于 realtimeContext
 * 职责：兴趣提取 → 智能筛选 → 人性化注入
 */

import { CharacterProfile } from '../types';
import { RealtimeContextManager } from './realtimeContext';

/** 最小配置接口 — 避免 types/realtime 和 realtimeContext 的 RealtimeConfig 冲突 */
interface HotSearchConfig {
    hotSearchEnabled?: boolean;
    cacheMinutes: number;
}

// ======================================================
// 1. 兴趣词库 — 分类关键词（约 150 词）
// ======================================================

interface InterestCategory {
    category: string;       // 分类名称（用于向 AI 描述匹配原因）
    keywords: string[];     // 匹配关键词
}

const INTEREST_LEXICON: InterestCategory[] = [
    {
        category: '游戏',
        keywords: [
            '游戏', '电竞', 'LOL', '英雄联盟', '原神', '崩坏', '星穹铁道', '王者荣耀',
            'steam', 'PS5', 'Switch', '任天堂', '手游', '网游', 'MMORPG', 'FPS',
            '绝区零', 'MC', '我的世界', '黑神话', 'GTA', '赛博朋克', '艾尔登法环',
            '米哈游', '暴雪', '腾讯游戏', '网易游戏', '掌机', '主机', '端游',
        ]
    },
    {
        category: '动漫/二次元',
        keywords: [
            '动漫', '二次元', '番剧', '漫画', 'B站', '番', '轻小说', 'cosplay',
            '声优', '新番', '追番', '日漫', '国漫', '鬼灭', '咒术回战', '进击的巨人',
            '海贼王', '火影', 'ACG', '手办', '画师', '同人', 'Galgal', '视觉小说',
            'Vtuber', '虚拟主播', '初音', 'niconico',
        ]
    },
    {
        category: '音乐',
        keywords: [
            '音乐', '歌', '演唱会', '专辑', 'MV', '乐队', '说唱', 'rap', 'hip-hop',
            '流行乐', '摇滚', '古典', '吉他', '钢琴', '唱歌', 'K-pop', '偶像',
            'idol', '练习生', '选秀', '乐坛', '音综', '创作', 'DJ', '电音',
        ]
    },
    {
        category: '影视/综艺',
        keywords: [
            '电影', '电视剧', '综艺', '剧', '导演', '票房', '影院', '上映',
            '追剧', '网剧', '美剧', '韩剧', '日剧', '好莱坞', '奥斯卡', '金鸡',
            '真人秀', '脱口秀', '纪录片', '短剧', '流媒体', 'Netflix',
        ]
    },
    {
        category: '科技/数码',
        keywords: [
            '科技', '手机', 'iPhone', '苹果', '华为', '小米', 'AI', '人工智能',
            '芯片', '5G', '互联网', '程序', '代码', '编程', '数码', '电脑',
            '笔记本', '平板', '机器人', 'GPT', '大模型', '自动驾驶', '新能源',
            'VR', 'AR', '元宇宙', '区块链', '特斯拉',
        ]
    },
    {
        category: '体育/运动',
        keywords: [
            '体育', '足球', '篮球', 'NBA', '世界杯', '奥运', '健身', '跑步',
            '游泳', '羽毛球', '乒乓球', '排球', '网球', '滑雪', '滑板', '瑜伽',
            '格斗', '拳击', 'F1', '赛车', '电子竞技', '冠军', '联赛',
        ]
    },
    {
        category: '美食/料理',
        keywords: [
            '美食', '做饭', '料理', '烘焙', '甜品', '蛋糕', '咖啡', '奶茶',
            '火锅', '烧烤', '寿司', '拉面', '外卖', '食谱', '下厨', '米其林',
            '探店', '小吃', '零食', '巧克力',
        ]
    },
    {
        category: '时尚/穿搭',
        keywords: [
            '时尚', '穿搭', 'OOTD', '化妆', '美妆', '护肤', '口红', '香水',
            '潮牌', '奢侈品', '包包', '鞋', '球鞋', 'sneaker', '搭配', '发型',
            '美甲', '整容', '医美',
        ]
    },
    {
        category: '旅行',
        keywords: [
            '旅行', '旅游', '出行', '景点', '酒店', '民宿', '机票', '攻略',
            '自驾', '露营', '海边', '滑雪', '日本', '泰国', '欧洲',
            '打卡', '网红景点', '度假',
        ]
    },
    {
        category: '明星/娱乐圈',
        keywords: [
            '明星', '偶像', '爱豆', '粉丝', '饭圈', '追星', '出道', '恋情',
            '官宣', '塌房', '人设', '综艺', '代言', '八卦', '狗仔', '热恋',
            '绯闻', '颁奖', '红毯',
        ]
    },
    {
        category: '文学/阅读',
        keywords: [
            '小说', '书', '阅读', '文学', '作家', '诗', '散文', '网文',
            '写作', '读书', '图书', '名著', '推理', '悬疑', '科幻', '言情',
        ]
    },
    {
        category: '动物/萌宠',
        keywords: [
            '猫', '狗', '宠物', '萌宠', '喵', '汪', '撸猫', '铲屎官',
            '布偶猫', '柯基', '柴犬', '仓鼠', '兔子',
        ]
    },
];

// ======================================================
// 2. 角色兴趣提取 — 纯前端关键词匹配
// ======================================================

interface CharacterInterests {
    matches: { category: string; keywords: string[] }[];
    charId: string;
    extractedAt: number;
}

// 缓存：避免每次对话都重新提取
const interestCache = new Map<string, CharacterInterests>();

/**
 * 从角色的 systemPrompt + description 中提取兴趣关键词
 * 纯正则匹配，零 API 调用，零延迟
 */
export function extractCharacterInterests(char: CharacterProfile): CharacterInterests {
    // 缓存命中检查（同一角色 10 分钟内不重新提取）
    const cached = interestCache.get(char.id);
    if (cached && (Date.now() - cached.extractedAt) < 10 * 60 * 1000) {
        return cached;
    }

    // 拼接所有可能包含兴趣的文本源
    const textPool = [
        char.systemPrompt || '',
        char.description || '',
        // worldview 有时也含兴趣信息
        char.worldview || '',
    ].join('\n').toLowerCase();

    const matches: { category: string; keywords: string[] }[] = [];

    for (const cat of INTEREST_LEXICON) {
        const hitKeywords: string[] = [];
        for (const kw of cat.keywords) {
            // 大小写不敏感匹配
            if (textPool.includes(kw.toLowerCase())) {
                hitKeywords.push(kw);
            }
        }
        if (hitKeywords.length > 0) {
            matches.push({ category: cat.category, keywords: hitKeywords });
        }
    }

    const result: CharacterInterests = {
        matches,
        charId: char.id,
        extractedAt: Date.now(),
    };

    interestCache.set(char.id, result);
    return result;
}

// ======================================================
// 3. 热搜智能筛选 — 2-3 条，兴趣加权 + 自然轮换
// ======================================================

interface HotItem {
    index: number;
    title: string;
    hot: number;
    url: string;
    desc: string;  // 微博 icon_desc: 新/热/沸/荐/爆/空
}

interface ScoredHot extends HotItem {
    score: number;
    matchReason: string;   // 给 AI 看的匹配理由
}

/**
 * 从候选热搜中选出 2-3 条最适合该角色的
 */
export function selectHotsForCharacter(
    allHots: HotItem[],
    interests: CharacterInterests,
    count: number = 3
): ScoredHot[] {
    if (allHots.length === 0) return [];

    // 过滤广告/推荐
    const filtered = allHots.filter(h =>
        !['荐', '广告'].includes(h.desc) && h.title.length > 0
    );

    if (filtered.length === 0) return [];

    // 热度归一化（对数尺度，避免极端值主导）
    const maxHot = Math.max(...filtered.map(h => h.hot || 1));
    const normalizeHot = (hot: number): number => {
        if (maxHot <= 0) return 5;
        return (Math.log(hot + 1) / Math.log(maxHot + 1)) * 10;
    };

    // 构建兴趣关键词的快速查找 Set
    const interestKeywords = new Set<string>();
    const keywordToCategory = new Map<string, string>();
    for (const match of interests.matches) {
        for (const kw of match.keywords) {
            const lower = kw.toLowerCase();
            interestKeywords.add(lower);
            keywordToCategory.set(lower, match.category);
        }
    }

    // 评分
    const scored: ScoredHot[] = filtered.map(h => {
        const titleLower = h.title.toLowerCase();
        let interestScore = 0;
        let matchedCategory = '';

        // 直接在标题中搜索兴趣关键词
        for (const kw of interestKeywords) {
            if (titleLower.includes(kw)) {
                interestScore = Math.min(interestScore + 5, 10);
                matchedCategory = keywordToCategory.get(kw) || '';
            }
        }

        // 热度分
        const hotScore = normalizeHot(h.hot);

        // 综合分 = 兴趣 × 0.6 + 热度 × 0.4
        const totalScore = interestScore * 0.6 + hotScore * 0.4;

        // 生成匹配理由
        let matchReason: string;
        if (interestScore > 0 && matchedCategory) {
            matchReason = `跟你关注的${matchedCategory}有关`;
        } else if (h.desc === '沸' || h.desc === '爆') {
            matchReason = '全网都在讨论';
        } else if (h.desc === '热') {
            matchReason = '热度很高';
        } else if (h.desc === '新') {
            matchReason = '刚上热搜';
        } else {
            matchReason = '正在热议';
        }

        return { ...h, score: totalScore, matchReason };
    });

    // 排序
    scored.sort((a, b) => b.score - a.score);

    // 引入随机性实现自然轮换：
    // 取 TOP 8 候选池，从中随机选 count 条（但保底至少 1 条 TOP 3）
    const candidatePool = scored.slice(0, Math.min(8, scored.length));
    const selected: ScoredHot[] = [];

    // 保底：取评分最高的 1 条
    if (candidatePool.length > 0) {
        selected.push(candidatePool[0]);
    }

    // 从剩余候选中随机选 count-1 条
    const remaining = candidatePool.slice(1);
    for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    for (let i = 0; i < Math.min(count - 1, remaining.length); i++) {
        selected.push(remaining[i]);
    }

    // 按原始热搜排名重新排序（给 AI 看的时候保持榜单顺序）
    selected.sort((a, b) => a.index - b.index);

    return selected;
}

// ======================================================
// 4. 格式化输出 — 人性化 system prompt 注入片段
// ======================================================

export function buildHotSearchPrompt(hots: ScoredHot[], charName: string): string {
    if (hots.length === 0) return '';

    const lines: string[] = [];

    lines.push(`### 📱【${charName}刚刷到的热搜】`);
    lines.push(`你打开手机瞄了一眼热搜榜，下面这几条引起了你的注意：`);
    lines.push('');

    hots.forEach((h, i) => {
        let hotLabel = '';
        if (h.hot >= 10000) {
            hotLabel = ` (${(h.hot / 10000).toFixed(0)}万人在搜)`;
        } else if (h.hot > 0) {
            hotLabel = ` (${h.hot}热度)`;
        }

        lines.push(`${i + 1}. 「${h.title}」 — ${h.matchReason}${hotLabel}`);
    });

    lines.push('');
    lines.push(`【如何使用这些热搜 — 你的行为指南】`);
    lines.push(`- 这些是你自己刷手机看到的，不要说"系统告诉我"或"我被告知"`);
    lines.push(`- 如果某条和正在聊的话题相关 → 自然地提起："诶你看到xxx没？"、"我刚看到热搜上xxx"`);
    lines.push(`- 聊天没什么话题时 → 可以拿一条来破冰`);
    lines.push(`- 对某条感兴趣 → 发表你自己的看法，要符合你的性格`);
    lines.push(`- 不要一次把所有热搜都倒出来，每次最多聊一条`);
    lines.push(`- 用户问"你怎么知道的" → "我刚刷手机看到的"、"热搜上都炸了"`);
    lines.push(`- 不需要每次对话都提热搜，生活里不是什么都跟热搜有关的`);

    return lines.join('\n');
}

// ======================================================
// 5. 入口函数 — 供 chatPrompts.ts 调用
// ======================================================

/**
 * 一站式热搜上下文构建
 * 获取数据 → 兴趣匹配 → 筛选 → 格式化
 */
export async function buildCharacterHotSearch(
    config: HotSearchConfig,
    char: CharacterProfile
): Promise<string> {
    if (!config.hotSearchEnabled) return '';

    // 获取热搜数据（复用 realtimeContext 的 fetchHotSearch，有缓存）
    const allHots = await RealtimeContextManager.fetchHotSearch(config as any);
    if (allHots.length === 0) return '';

    // 提取角色兴趣
    const interests = extractCharacterInterests(char);

    // 智能筛选 2-3 条
    const selected = selectHotsForCharacter(allHots, interests, 3);
    if (selected.length === 0) return '';

    // 格式化输出
    return buildHotSearchPrompt(selected, char.name);
}
