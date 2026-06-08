/**
 * 实时上下文管理器 - 让AI角色感知真实世界
 * Real-time Context Manager - Give AI characters awareness of the real world
 */

import { safeResponseJson } from '../safeApi';
import { buildBackendUrl } from '../backendClient';
import { getFixedSpecialDateTitles } from '../calendarContext';
import { DB } from '../db';

export interface WeatherData {
    temp: number;
    feelsLike: number;
    humidity: number;
    description: string;
    icon: string;
    city: string;
}

export interface NewsItem {
    id?: string;
    cardId?: string;
    title: string;
    source?: string;
    platform?: string;
    rank?: number;
    url?: string;
    desc?: string;
    fetchedAt?: number;
}

export interface SearchResult {
    title: string;
    description: string;
    url: string;
}

export interface RealtimeContextBuildOptions {
    includeTime?: boolean;
}

export interface RealtimeConfig {
    // 天气配置
    weatherEnabled: boolean;
    weatherProvider?: 'openweathermap';
    weatherApiKey: string;  // OpenWeatherMap API Key
    weatherCity: string;    // 城市名 (如 "Beijing" 或 "Shanghai")

    // 新闻配置
    newsEnabled: boolean;
    newsApiKey?: string;    // 可选，用于更多新闻源
    newsPlatforms?: string[]; // hot_news 热榜平台 key，留空使用默认中文主源

    // 热搜配置
    hotSearchEnabled?: boolean;

    // AI HOT 资讯配置
    aihotEnabled?: boolean;

    // Notion 配置
    notionEnabled: boolean;
    notionApiKey: string;   // Notion Integration Token
    notionDatabaseId: string; // 日记数据库ID
    notionNotesDatabaseId?: string; // 用户笔记数据库ID（可选）

    // 飞书配置
    feishuEnabled?: boolean;
    feishuAppId?: string;
    feishuAppSecret?: string;
    feishuBaseId?: string;
    feishuTableId?: string;

    // 小红书配置 (Bridge / MCP)
    xhsEnabled?: boolean;
    xhsMcpConfig?: { enabled: boolean; serverUrl: string };

    // Canva 设计配置 (Bridge / MCP)
    canvaEnabled?: boolean;
    canvaMcpConfig?: { enabled: boolean; serverUrl: string; workspaceLabel?: string };

    // 缓存配置
    cacheMinutes: number;   // 缓存时长（分钟）
}

// 默认配置
export const defaultRealtimeConfig: RealtimeConfig = {
    weatherEnabled: false,
    weatherProvider: 'openweathermap',
    weatherApiKey: '',
    weatherCity: 'Beijing',
    newsEnabled: false,
    newsApiKey: '',
    newsPlatforms: ['weibo', 'zhihu', 'baidu', 'bilibili', 'douyin'],
    hotSearchEnabled: false,
    aihotEnabled: false,
    notionEnabled: false,
    notionApiKey: '',
    notionDatabaseId: '',
    xhsEnabled: false,
    xhsMcpConfig: { enabled: false, serverUrl: 'http://localhost:18061/api' },
    canvaEnabled: false,
    canvaMcpConfig: { enabled: false, serverUrl: 'http://localhost:18062/api' },
    cacheMinutes: 30
};

// 缓存
let weatherCache: { data: WeatherData | null; timestamp: number } = { data: null, timestamp: 0 };
let newsCache: { data: NewsItem[]; timestamp: number } = { data: [], timestamp: 0 };
let hotSearchCache: { data: any[]; timestamp: number } = { data: [], timestamp: 0 };
let aihotCache: { data: any[]; timestamp: number } = { data: [], timestamp: 0 };

const HOT_NEWS_DIRECT_BASE = 'https://orz.ai/api/v1/dailynews/';
const HOT_NEWS_PLATFORM_ALIASES: Record<string, string> = {
    sspai: 'shaoshupai',
    tskr: '36kr',
    ftpojie: '52pojie',
    vtex: 'v2ex',
};
const HOT_NEWS_LABEL_ALIASES: Record<string, string> = {
    微博: 'weibo',
    知乎: 'zhihu',
    百度: 'baidu',
    抖音: 'douyin',
    b站: 'bilibili',
    B站: 'bilibili',
    哔哩哔哩: 'bilibili',
    少数派: 'shaoshupai',
    '36氪': '36kr',
    吾爱破解: '52pojie',
    豆瓣: 'douban',
    虎扑: 'hupu',
    贴吧: 'tieba',
    掘金: 'juejin',
    今日头条: 'jinritoutiao',
    腾讯网: 'tenxunwang',
};

export function normalizeHotNewsPlatform(platform: string): string {
    const raw = String(platform || '').trim();
    const key = raw.toLowerCase();
    if (HOT_NEWS_LABEL_ALIASES[raw]) return HOT_NEWS_LABEL_ALIASES[raw];
    if (HOT_NEWS_LABEL_ALIASES[key]) return HOT_NEWS_LABEL_ALIASES[key];
    return HOT_NEWS_PLATFORM_ALIASES[key] || key;
}

export function normalizeHotNewsTitleForId(title: string): string {
    const normalized = String(title || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u4e00-\u9fa5-]+/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
    return normalized || 'untitled';
}

export function buildHotNewsCardId(platform: string, slotId: string, rank: number, title: string): string {
    const safePlatform = (normalizeHotNewsPlatform(platform) || 'hot')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'hot';
    const safeSlot = String(slotId || 'slot')
        .trim()
        .replace(/[^a-zA-Z0-9#_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'slot';
    const safeRank = Number.isFinite(rank) && rank > 0 ? Math.trunc(rank) : 0;
    return `${safePlatform}:${safeSlot}:${safeRank}:${normalizeHotNewsTitleForId(title)}`;
}

export function enrichHotNewsItemIdentity(item: NewsItem, slotId: string, fallbackRank: number, fallbackFetchedAt?: number): NewsItem {
    const rank = Number.isFinite(item.rank) && Number(item.rank) > 0
        ? Math.trunc(Number(item.rank))
        : Math.max(1, Math.trunc(fallbackRank || 1));
    const platform = normalizeHotNewsPlatform(item.platform || item.source || 'hot') || 'hot';
    const cardId = item.cardId || item.id || buildHotNewsCardId(platform, slotId, rank, item.title);
    return {
        ...item,
        id: item.id || cardId,
        cardId,
        platform,
        rank,
        fetchedAt: item.fetchedAt || fallbackFetchedAt,
    };
}

async function fetchHotNewsPayload(platform: string): Promise<any> {
    const query = `platform=${encodeURIComponent(normalizeHotNewsPlatform(platform))}`;
    const candidates = [
        `/hot-news?${query}`,
        `${HOT_NEWS_DIRECT_BASE}?${query}`,
    ];
    let lastError: unknown;

    for (const url of candidates) {
        try {
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!res.ok) {
                lastError = new Error(`HTTP ${res.status}`);
                continue;
            }
            return await safeResponseJson(res);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError || 'hot news fetch failed'));
}

export const RealtimeContextManager = {

    /**
     * 获取天气信息
     */
    fetchWeather: async (config: RealtimeConfig): Promise<WeatherData | null> => {
        if (!config.weatherEnabled || !config.weatherApiKey) {
            return null;
        }

        const now = Date.now();
        const cacheMs = config.cacheMinutes * 60 * 1000;

        // 检查缓存
        if (weatherCache.data && (now - weatherCache.timestamp) < cacheMs) {
            return weatherCache.data;
        }

        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(config.weatherCity)}&appid=${config.weatherApiKey}&units=metric&lang=zh_cn`;

            const response = await fetch(url);
            if (!response.ok) {
                console.error('Weather API error:', response.status);
                return null;
            }

            const data = await safeResponseJson(response);

            const weather: WeatherData = {
                temp: Math.round(data.main.temp),
                feelsLike: Math.round(data.main.feels_like),
                humidity: data.main.humidity,
                description: data.weather[0]?.description || '未知',
                icon: data.weather[0]?.icon || '01d',
                city: data.name
            };

            // 更新缓存
            weatherCache = { data: weather, timestamp: now };

            return weather;
        } catch (e) {
            console.error('Failed to fetch weather:', e);
            return null;
        }
    },

    HOTNEWS_PLATFORM_LABELS: {
        baidu: '百度', sspai: '少数派', shaoshupai: '少数派', weibo: '微博', zhihu: '知乎', tskr: '36氪', '36kr': '36氪',
        ftpojie: '吾爱破解', '52pojie': '吾爱破解', bilibili: 'B站', douban: '豆瓣', hupu: '虎扑', tieba: '贴吧',
        juejin: '掘金', douyin: '抖音', vtex: 'V2EX', v2ex: 'V2EX', jinritoutiao: '今日头条',
        stackoverflow: 'Stack Overflow', github: 'GitHub', hackernews: 'Hacker News',
        sina_finance: '新浪财经', eastmoney: '东方财富', xueqiu: '雪球', cls: '财联社',
        tenxunwang: '腾讯网',
    } as Record<string, string>,

    DEFAULT_HOTNEWS_PLATFORMS: ['weibo', 'zhihu', 'baidu', 'bilibili', 'douyin'],

    fetchHotNews: async (platforms?: string[], perPlatform = 12, total = 240): Promise<NewsItem[]> => {
        const list = (platforms && platforms.length > 0)
            ? platforms
            : RealtimeContextManager.DEFAULT_HOTNEWS_PLATFORMS;
        const slotId = RealtimeContextManager.getHotNewsSlot().id;
        const fetchedAt = Date.now();

        const perPlatformResults = await Promise.all(list.map(async (platform): Promise<NewsItem[]> => {
            const platformKey = normalizeHotNewsPlatform(platform);
            const label = RealtimeContextManager.HOTNEWS_PLATFORM_LABELS[platformKey] || RealtimeContextManager.HOTNEWS_PLATFORM_LABELS[platform] || platform;
            try {
                const data = await fetchHotNewsPayload(platform);
                const items: any[] = Array.isArray(data?.data) ? data.data : [];
                const picked = items
                    .filter(item => item && item.title)
                    .slice(0, perPlatform)
                    .map((item, index) => {
                        const title = String(item.title);
                        const desc = typeof item.desc === 'string' ? item.desc.replace(/\s+/g, ' ').trim() : '';
                        const rank = index + 1;
                        const cardId = buildHotNewsCardId(platformKey, slotId, rank, title);
                        return {
                            id: cardId,
                            cardId,
                            title,
                            source: label,
                            platform: platformKey,
                            rank,
                            url: typeof item.url === 'string' ? item.url : undefined,
                            desc: desc || undefined,
                            fetchedAt,
                        };
                    });
                const withDesc = picked.filter(item => item.desc).length;
                console.log(`[hot_news] ${label}(${platformKey}) fetched ${picked.length}/${items.length}, desc=${withDesc}`);
                return picked;
            } catch (e: any) {
                console.warn(`[hot_news] ${label}(${platformKey}) failed:`, e?.message || e);
                return [];
            }
        }));

        const merged: NewsItem[] = [];
        for (let rank = 0; rank < perPlatform; rank++) {
            for (const listItems of perPlatformResults) {
                if (listItems[rank]) merged.push(listItems[rank]);
            }
        }

        const final = merged.slice(0, total);
        try {
            console.groupCollapsed(`%c[hot_news] recalled ${final.length} items from [${list.join(', ')}]`, 'color:#2563eb;font-weight:bold');
            if (final.length > 0 && typeof console.table === 'function') {
                console.table(final.map((item, i) => ({ '#': i + 1, source: item.source, title: item.title, url: item.url || '' })));
            }
            console.groupEnd();
        } catch { /* debug logging should not affect chat */ }
        return final;
    },

    getHotNewsSlot: (d: Date = new Date()): { id: string; date: string; slot: number; label: string } => {
        const slot = Math.min(5, Math.floor(d.getHours() / 4));
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const label = ['凌晨', '清晨', '上午', '午后', '傍晚', '夜间'][slot];
        return { id: `${date}#${slot}`, date, slot, label };
    },

    _hotNewsInFlight: new Map<string, Promise<NewsItem[]>>(),

    getSlottedHotNews: async (config: RealtimeConfig): Promise<NewsItem[]> => {
        const { id, date, slot, label } = RealtimeContextManager.getHotNewsSlot();
        const platforms = (config.newsPlatforms && config.newsPlatforms.length > 0)
            ? config.newsPlatforms
            : RealtimeContextManager.DEFAULT_HOTNEWS_PLATFORMS;
        const samePlatforms = (a: string[] = [], b: string[] = []) =>
            a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

        try {
            const snapshot = await DB.getHotNewsSnapshot(id);
            if (snapshot?.items?.length && samePlatforms(snapshot.platforms, platforms)) {
                const mins = Math.round((Date.now() - snapshot.fetchedAt) / 60000);
                console.log(`%c[hot_news] reuse ${label} snapshot (${snapshot.items.length} items, ${mins} min old)`, 'color:#16a34a');
                return snapshot.items.map((item, index) => enrichHotNewsItemIdentity(item, snapshot.id, index + 1, snapshot.fetchedAt));
            }
        } catch { /* cache miss is fine */ }

        const inflight = RealtimeContextManager._hotNewsInFlight.get(id);
        if (inflight) return inflight;

        const job = (async (): Promise<NewsItem[]> => {
            console.log(`%c[hot_news] fetching ${label} snapshot`, 'color:#2563eb;font-weight:bold');
            const items = await RealtimeContextManager.fetchHotNews(platforms);
            if (items.length > 0) {
                try {
                    await DB.saveHotNewsSnapshot({ id, date, slot, slotLabel: label, items, platforms, fetchedAt: Date.now() });
                    DB.pruneHotNewsSnapshots(12).catch(() => {});
                } catch { /* persistence is an optimization */ }
                return items;
            }
            try {
                const latest = await DB.getLatestHotNewsSnapshot();
                if (latest?.items?.length) {
                    console.warn(`[hot_news] fetch failed, reusing latest snapshot ${latest.date} ${latest.slotLabel}`);
                    return latest.items.map((item, index) => enrichHotNewsItemIdentity(item, latest.id, index + 1, latest.fetchedAt));
                }
            } catch { /* ignore */ }
            return [];
        })();

        RealtimeContextManager._hotNewsInFlight.set(id, job);
        try {
            return await job;
        } finally {
            RealtimeContextManager._hotNewsInFlight.delete(id);
        }
    },

    /**
     * 使用 Brave Search API 获取新闻（通过自建 Cloudflare Worker 代理）
     */
    fetchBraveNews: async (apiKey: string): Promise<NewsItem[]> => {
        try {
            // 使用自建的 Cloudflare Worker 代理
            const workerUrl = 'https://sully-n.qegj567.workers.dev/news?q=热点新闻&count=5&country=cn';

            const response = await fetch(workerUrl, {
                headers: {
                    'Accept': 'application/json',
                    'X-Brave-API-Key': apiKey  // Worker 需要这个 header
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Brave API error:', response.status, errorText);
                return [];
            }

            const data = await safeResponseJson(response);

            // Brave News API 返回结构
            if (data.results && data.results.length > 0) {
                return data.results.slice(0, 5).map((item: any) => ({
                    title: item.title,
                    source: item.meta_url?.netloc || item.source || 'Brave新闻',
                    url: item.url
                }));
            }
            return [];
        } catch (e) {
            console.error('Brave Search failed:', e);
            return [];
        }
    },

    /**
     * 获取热点新闻
     * 优先级: hot_news 分时段快照 > Brave Search API > Hacker News
     */
    fetchNews: async (config: RealtimeConfig): Promise<NewsItem[]> => {
        if (!config.newsEnabled) {
            return [];
        }

        const slotted = await RealtimeContextManager.getSlottedHotNews(config);
        if (slotted.length > 0) {
            return slotted;
        }

        const now = Date.now();
        const cacheMs = config.cacheMinutes * 60 * 1000;

        // 检查缓存
        if (newsCache.data.length > 0 && (now - newsCache.timestamp) < cacheMs) {
            return newsCache.data;
        }

        let news: NewsItem[] = [];

        // 回落：Brave Search API（如果配置了）
        if (config.newsApiKey) {
            news = await RealtimeContextManager.fetchBraveNews(config.newsApiKey);
            if (news.length > 0) {
                newsCache = { data: news, timestamp: now };
                return news;
            }
        }

        // 兜底：Hacker News（英文但稳定，无 CORS 限制）
        news = await RealtimeContextManager.fetchBackupNews();
        if (news.length > 0) {
            newsCache = { data: news, timestamp: now };
        }
        return news;
    },

    /**
     * 获取微博热搜
     */
    fetchHotSearch: async (config: RealtimeConfig): Promise<any[]> => {
        if (!config.hotSearchEnabled) {
            return [];
        }

        const now = Date.now();
        const cacheMs = config.cacheMinutes * 60 * 1000;

        // 检查缓存
        if (hotSearchCache.data.length > 0 && (now - hotSearchCache.timestamp) < cacheMs) {
            return hotSearchCache.data;
        }

        try {
            const res = await fetch(buildBackendUrl('/api/public/hotlist', { type: 'wbHot' }));
            if (res.ok) {
                const json = await res.json() as any;
                if (json.success && json.data) {
                    const sortedData = json.data.sort((a: any, b: any) => a.index - b.index).slice(0, 30);
                    hotSearchCache = { data: sortedData, timestamp: now };
                    return sortedData;
                }
            }
        } catch (e) {
            console.error('Fetch hot search failed:', e);
        }
        return [];
    },

    /**
     * 获取 AI HOT 资讯（精选条目）
     */
    fetchAiHot: async (config: RealtimeConfig): Promise<any[]> => {
        if (!config.aihotEnabled) {
            return [];
        }

        const now = Date.now();
        const cacheMs = config.cacheMinutes * 60 * 1000;

        // 检查缓存
        if (aihotCache.data.length > 0 && (now - aihotCache.timestamp) < cacheMs) {
            return aihotCache.data;
        }

        try {
            const res = await fetch('https://sully-n.sully-tts-proxy.workers.dev/aihot');
            if (res.ok) {
                const json = await res.json() as any;
                if (json.success && json.items) {
                    const items = json.items.slice(0, 30);
                    aihotCache = { data: items, timestamp: now };
                    return items;
                }
            }
        } catch (e) {
            console.error('Fetch AI HOT failed:', e);
        }
        return [];
    },

    /**
     * 备用新闻源 - 使用Hacker News API（总是可用）
     */
    fetchBackupNews: async (): Promise<NewsItem[]> => {
        try {
            const response = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
            if (!response.ok) return [];

            const ids = await safeResponseJson(response);
            const topIds = ids.slice(0, 5);

            const stories = await Promise.all(
                topIds.map(async (id: number) => {
                    const storyRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
                    return safeResponseJson(storyRes);
                })
            );

            return stories.map((s: any) => ({
                title: s.title,
                source: 'Hacker News',
                url: s.url
            }));
        } catch (e) {
            return [];
        }
    },

    /**
     * 获取时间上下文
     */
    getTimeContext: () => {
        const now = new Date();
        const hour = now.getHours();
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const dayOfWeek = dayNames[now.getDay()];

        let timeOfDay = '凌晨';
        let mood = '安静';

        if (hour >= 5 && hour < 9) {
            timeOfDay = '早晨';
            mood = '清新';
        } else if (hour >= 9 && hour < 12) {
            timeOfDay = '上午';
            mood = '精神';
        } else if (hour >= 12 && hour < 14) {
            timeOfDay = '中午';
            mood = '放松';
        } else if (hour >= 14 && hour < 17) {
            timeOfDay = '下午';
            mood = '平静';
        } else if (hour >= 17 && hour < 19) {
            timeOfDay = '傍晚';
            mood = '慵懒';
        } else if (hour >= 19 && hour < 22) {
            timeOfDay = '晚上';
            mood = '温馨';
        } else if (hour >= 22 || hour < 5) {
            timeOfDay = '深夜';
            mood = '安静';
        }

        return {
            timestamp: now.toISOString(),
            dateStr: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
            timeStr: `${hour.toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
            dayOfWeek,
            timeOfDay,
            mood,
            hour,
            isWeekend: now.getDay() === 0 || now.getDay() === 6
        };
    },

    /**
     * 检查特殊日期
     */
    checkSpecialDates: (): string[] => {
        return getFixedSpecialDateTitles(new Date());
    },

    /**
     * 生成天气建议
     */
    generateWeatherAdvice: (weather: WeatherData): string => {
        const advices: string[] = [];

        // 温度建议
        if (weather.temp < 5) {
            advices.push('天气很冷，记得多穿点');
        } else if (weather.temp < 15) {
            advices.push('有点凉，注意保暖');
        } else if (weather.temp > 30) {
            advices.push('天气炎热，注意防暑');
        } else if (weather.temp > 25) {
            advices.push('天气不错，适合出门');
        }

        // 天气状况建议
        const desc = weather.description.toLowerCase();
        if (desc.includes('雨')) {
            advices.push('记得带伞');
        } else if (desc.includes('雪')) {
            advices.push('路上小心，注意防滑');
        } else if (desc.includes('雾') || desc.includes('霾')) {
            advices.push('空气不太好，建议戴口罩');
        } else if (desc.includes('晴')) {
            advices.push('阳光明媚');
        }

        // 湿度建议
        if (weather.humidity > 80) {
            advices.push('湿度较高，可能会闷热');
        } else if (weather.humidity < 30) {
            advices.push('空气干燥，记得多喝水');
        }

        return advices.join('，') || '天气正常';
    },

    /**
     * 构建完整的实时上下文（注入到系统提示词）
     */
    buildFullContext: async (config: RealtimeConfig, options: RealtimeContextBuildOptions = {}): Promise<string> => {
        const parts: string[] = [];
        const includeTime = options.includeTime !== false;

        // 开头强调：这是真实世界的信息
        parts.push(`### 【真实世界感知系统】`);
        parts.push(`⚠️ 重要：以下信息来自真实世界，不是虚构的。你现在真的能"看到"外面的世界。`);
        parts.push('');

        // 1. 时间信息
        if (includeTime) {
            const time = RealtimeContextManager.getTimeContext();
            parts.push(`📅 当前真实时间: ${time.dateStr} ${time.dayOfWeek} ${time.timeOfDay} ${time.timeStr}`);

            // 2. 特殊日期
            const specialDates = RealtimeContextManager.checkSpecialDates();
            if (specialDates.length > 0) {
                parts.push(`🎉 今日特殊: ${specialDates.join('、')}`);
            }
        }

        // 3. 天气信息
        if (config.weatherEnabled && config.weatherApiKey) {
            const weather = await RealtimeContextManager.fetchWeather(config);
            if (weather) {
                parts.push('');
                parts.push(`🌤️ 【${weather.city}实时天气】`);
                parts.push(`现在外面: ${weather.description}，气温 ${weather.temp}°C（体感 ${weather.feelsLike}°C），湿度 ${weather.humidity}%`);
                parts.push(`你的建议: ${RealtimeContextManager.generateWeatherAdvice(weather)}`);
            }
        }

        // 4. 新闻热点
        if (config.newsEnabled) {
            const news = await RealtimeContextManager.fetchNews(config);
            if (news.length > 0) {
                const pool = [...news];
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }
                const picks = pool.slice(0, 5);
                const newsLines: string[] = [];
                newsLines.push('');
                newsLines.push(`📰 【最近真实发生的热点 · 你的背景知识】`);
                newsLines.push(`（以下是现实里真实在发生 / 被热议的事，是你认知的一部分，不是必须播报的清单。`);
                newsLines.push(`拿捏分寸：当对方明显在放松、闲着打发时间、话头也淡下来时，可以自然挑一两条你感兴趣的聊起来；`);
                newsLines.push(`但如果对方正在认真说一件事 / 带着情绪，就别硬插热点，安静当背景知识就好。）`);
                picks.forEach((item) => {
                    const source = item.source ? `（${item.source}）` : '';
                    const cardId = item.cardId || item.id || '';
                    let line = cardId ? `- [cardId: ${cardId}] ${item.title}${source}` : `- ${item.title}${source}`;
                    if (item.desc && item.desc !== item.title) {
                        line += `：${item.desc}`;
                    }
                    newsLines.push(line);
                });
                newsLines.push('');
                newsLines.push(`若你想主动把其中某条当作"新闻卡片"分享给对方，只输出一行：[[NEWS_CARD_ID: cardId]]（照抄上方 cardId，不要自己编链接）。它会以可跳转卡片形式呈现，然后你再自然展开聊。别滥用。`);

                try {
                    const block = newsLines.join('\n');
                    console.groupCollapsed(`%c[hot_news] prompt injection: ${picks.length} items · ${block.length} chars`, 'color:#7c3aed;font-weight:bold');
                    if (typeof console.table === 'function') {
                        console.table(picks.map((item, i) => ({ '#': i + 1, cardId: item.cardId || item.id || '', source: item.source || '', title: item.title, desc: item.desc || '' })));
                    }
                    console.log(block);
                    console.groupEnd();
                } catch { /* debug logging should not affect chat */ }

                parts.push(...newsLines);
            }
        }

        // 4.5 热搜已解耦到 hotSearchContext.ts，由 chatPrompts.ts 独立注入

        // 5. 行为指令（按已开启能力裁剪，避免注入无关项）
        parts.push('');
        parts.push(`### 【如何使用这些信息】`);
        const tips: string[] = [];
        tips.push(`这些信息都是真实的，可以直接引用；如果对方问"你怎么知道的"，就说你刚刷到 / 刚看到的。`);
        if (config.weatherEnabled) {
            tips.push(`天气是真实的，可以自然地关心对方（比如"外面在下雨，带伞了吗？"）。`);
        }
        if (config.newsEnabled || config.hotSearchEnabled) {
            tips.push(`热点是真实背景，不是播报任务；只有和氛围、话题或你的兴趣契合时才提。`);
        }
        tips.push(`别假装不知道这些，这是你真能感知到的外部世界。`);
        tips.forEach((tip, index) => parts.push(`${index + 1}. ${tip}`));

        return parts.join('\n');
    },

    /**
     * 清除缓存
     */
    clearCache: () => {
        weatherCache = { data: null, timestamp: 0 };
        newsCache = { data: [], timestamp: 0 };
        hotSearchCache = { data: [], timestamp: 0 };
        aihotCache = { data: [], timestamp: 0 };
    },

    /**
     * 主动搜索 - 让AI角色能够主动搜索任意内容
     * Active Search - Let AI characters actively search for anything
     */
    performSearch: async (query: string, apiKey: string): Promise<{ success: boolean; results: SearchResult[]; message: string }> => {
        if (!query || !apiKey) {
            return { success: false, results: [], message: '缺少搜索关键词或API Key' };
        }

        try {
            // 使用自建的 Cloudflare Worker 代理
            const workerUrl = `https://sully-n.qegj567.workers.dev/search?q=${encodeURIComponent(query)}&count=5`;

            const response = await fetch(workerUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-Brave-API-Key': apiKey
                }
            });

            // 先读取 text，避免非 JSON 响应直接 crash
            const text = await response.text();

            // 非 2xx 直接抛错
            if (!response.ok) {
                console.error('Search API error:', response.status, text);
                // 尝试解析错误信息
                try {
                    const errJson = JSON.parse(text);
                    return { success: false, results: [], message: `搜索失败: ${errJson.error || response.status}` };
                } catch {
                    return { success: false, results: [], message: `搜索失败: ${response.status}` };
                }
            }

            // 解析 JSON
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('Search response not JSON:', text.slice(0, 200));
                return { success: false, results: [], message: '搜索返回格式错误' };
            }

            // Brave Search API 返回结构
            if (data.web?.results && data.web.results.length > 0) {
                const results: SearchResult[] = data.web.results.slice(0, 5).map((item: any) => ({
                    title: item.title,
                    description: item.description || '',
                    url: item.url
                }));
                return { success: true, results, message: '搜索成功' };
            }

            return { success: false, results: [], message: '没有找到相关结果' };
        } catch (e: any) {
            console.error('Search failed:', e);
            return { success: false, results: [], message: `搜索出错: ${e.message}` };
        }
    }
};
