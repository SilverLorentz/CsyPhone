// ============================================
// Notion 集成模块
// ============================================

export interface NotionDiaryEntry {
    title: string;
    content: string;
    mood?: string;
    date?: string;
    tags?: string[];
    characterName?: string;  // 角色名，用于区分不同角色的日记
}

export interface DiaryPreview {
    id: string;
    title: string;
    date: string;
    url: string;
}

export const NotionManager = {

    // Worker 代理地址
    WORKER_URL: 'https://sully-n.qegj567.workers.dev',

    /**
     * 测试 Notion 连接（通过 Worker 代理）
     */
    testConnection: async (apiKey: string, databaseId: string): Promise<{ success: boolean; message: string }> => {
        try {
            const response = await fetch(`${NotionManager.WORKER_URL}/notion/database/${databaseId}`, {
                method: 'GET',
                headers: {
                    'X-Notion-API-Key': apiKey
                }
            });

            const text = await response.text();

            if (!response.ok) {
                try {
                    const errJson = JSON.parse(text);
                    return { success: false, message: `连接失败: ${errJson.error || errJson.message || response.status}` };
                } catch {
                    return { success: false, message: `连接失败: ${response.status}` };
                }
            }

            try {
                const data = JSON.parse(text);
                return { success: true, message: `连接成功！数据库: ${data.title?.[0]?.plain_text || databaseId}` };
            } catch {
                return { success: false, message: '返回格式错误' };
            }
        } catch (e: any) {
            return { success: false, message: `网络错误: ${e.message}` };
        }
    },

    /**
     * 创建日记页面（通过 Worker 代理）- 花里胡哨美化版 ✨
     * 支持 Markdown 格式的日记内容，自动转换为丰富的 Notion blocks
     */
    createDiaryPage: async (
        apiKey: string,
        databaseId: string,
        entry: NotionDiaryEntry
    ): Promise<{ success: boolean; pageId?: string; url?: string; message: string }> => {
        try {
            const now = new Date();
            const dateStr = entry.date || now.toISOString().split('T')[0];

            // 使用 markdown 解析器生成丰富的 Notion blocks
            const children = parseMarkdownToNotionBlocks(entry.content, entry.mood, entry.characterName);

            // 构建页面数据，标题包含角色名便于筛选
            const titlePrefix = entry.characterName ? `[${entry.characterName}] ` : '';
            const moodEmoji = getMoodEmoji(entry.mood || '平静');
            const pageData = {
                parent: { database_id: databaseId },
                icon: { emoji: moodEmoji },
                properties: {
                    'Name': {
                        title: [{ text: { content: `${titlePrefix}${entry.title || dateStr + ' 的日记'}` } }]
                    },
                    'Date': {
                        date: { start: dateStr }
                    }
                },
                children
            };

            const response = await fetch(`${NotionManager.WORKER_URL}/notion/pages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Notion-API-Key': apiKey
                },
                body: JSON.stringify(pageData)
            });

            const text = await response.text();

            if (!response.ok) {
                try {
                    const errJson = JSON.parse(text);
                    return { success: false, message: `写入失败: ${errJson.error || errJson.message || response.status}` };
                } catch {
                    return { success: false, message: `写入失败: ${response.status}` };
                }
            }

            try {
                const data = JSON.parse(text);
                return {
                    success: true,
                    pageId: data.id,
                    url: data.url,
                    message: '日记已写入Notion!'
                };
            } catch {
                return { success: false, message: '返回格式错误' };
            }
        } catch (e: any) {
            return { success: false, message: `网络错误: ${e.message}` };
        }
    },

    /**
     * 获取角色最近的日记（通过 Worker 代理）
     */
    getRecentDiaries: async (
        apiKey: string,
        databaseId: string,
        characterName: string,
        limit: number = 5
    ): Promise<{ success: boolean; entries: DiaryPreview[]; message: string }> => {
        try {
            const response = await fetch(`${NotionManager.WORKER_URL}/notion/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Notion-API-Key': apiKey
                },
                body: JSON.stringify({
                    database_id: databaseId,
                    filter: {
                        property: 'Name',
                        title: {
                            starts_with: `[${characterName}]`
                        }
                    },
                    sorts: [{ property: 'Date', direction: 'descending' }],
                    page_size: limit
                })
            });

            const text = await response.text();

            if (!response.ok) {
                console.error('Query diaries failed:', response.status, text);
                return { success: false, entries: [], message: `查询失败: ${response.status}` };
            }

            const data = JSON.parse(text);

            if (!data.results || data.results.length === 0) {
                return { success: true, entries: [], message: '暂无日记' };
            }

            const entries: DiaryPreview[] = data.results.map((page: any) => {
                const title = page.properties?.Name?.title?.[0]?.plain_text || '无标题';
                // 移除角色名前缀，只保留实际标题
                const cleanTitle = title.replace(/^\[.*?\]\s*/, '');
                return {
                    id: page.id,
                    title: cleanTitle,
                    date: page.properties?.Date?.date?.start || '',
                    url: page.url
                };
            });

            return { success: true, entries, message: '获取成功' };
        } catch (e: any) {
            console.error('Get diaries failed:', e);
            return { success: false, entries: [], message: `获取失败: ${e.message}` };
        }
    },

    /**
     * 按日期查找角色的日记（通过 Worker 代理）
     * 支持一天多篇日记，全部返回
     */
    getDiaryByDate: async (
        apiKey: string,
        databaseId: string,
        characterName: string,
        date: string  // YYYY-MM-DD
    ): Promise<{ success: boolean; entries: DiaryPreview[]; message: string }> => {
        try {
            const response = await fetch(`${NotionManager.WORKER_URL}/notion/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Notion-API-Key': apiKey
                },
                body: JSON.stringify({
                    database_id: databaseId,
                    filter: {
                        and: [
                            {
                                property: 'Name',
                                title: { starts_with: `[${characterName}]` }
                            },
                            {
                                property: 'Date',
                                date: { equals: date }
                            }
                        ]
                    },
                    sorts: [{ property: 'Date', direction: 'descending' }],
                    page_size: 10
                })
            });

            const text = await response.text();

            if (!response.ok) {
                console.error('Query diary by date failed:', response.status, text);
                return { success: false, entries: [], message: `查询失败: ${response.status}` };
            }

            const data = JSON.parse(text);

            if (!data.results || data.results.length === 0) {
                return { success: true, entries: [], message: `没有找到 ${date} 的日记` };
            }

            const entries: DiaryPreview[] = data.results.map((page: any) => {
                const title = page.properties?.Name?.title?.[0]?.plain_text || '无标题';
                const cleanTitle = title.replace(/^\[.*?\]\s*/, '');
                return {
                    id: page.id,
                    title: cleanTitle,
                    date: page.properties?.Date?.date?.start || '',
                    url: page.url
                };
            });

            return { success: true, entries, message: `找到 ${entries.length} 篇日记` };
        } catch (e: any) {
            console.error('Get diary by date failed:', e);
            return { success: false, entries: [], message: `查询失败: ${e.message}` };
        }
    },

    /**
     * 读取日记页面的完整内容（通过 Worker 代理）
     * 调用 /notion/blocks/:pageId 端点，将 blocks 转换为可读文本
     */
    readDiaryContent: async (
        apiKey: string,
        pageId: string
    ): Promise<{ success: boolean; content: string; message: string }> => {
        try {
            const response = await fetch(`${NotionManager.WORKER_URL}/notion/blocks/${pageId}`, {
                method: 'GET',
                headers: {
                    'X-Notion-API-Key': apiKey
                }
            });

            const text = await response.text();

            if (!response.ok) {
                console.error('Read diary content failed:', response.status, text);
                return { success: false, content: '', message: `读取失败: ${response.status}` };
            }

            const data = JSON.parse(text);

            if (!data.results || data.results.length === 0) {
                return { success: true, content: '（空白日记）', message: '日记内容为空' };
            }

            // 将 Notion blocks 转换为可读文本
            const content = notionBlocksToText(data.results);
            return { success: true, content, message: '读取成功' };
        } catch (e: any) {
            console.error('Read diary content failed:', e);
            return { success: false, content: '', message: `读取失败: ${e.message}` };
        }
    },

    /**
     * 获取用户笔记列表（从用户的笔记数据库）
     * 让角色能偶尔看到用户写的日常笔记，增加温馨感
     */
    getUserNotes: async (
        apiKey: string,
        notesDatabaseId: string,
        limit: number = 5
    ): Promise<{ success: boolean; entries: DiaryPreview[]; message: string }> => {
        try {
            const response = await fetch(`${NotionManager.WORKER_URL}/notion/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Notion-API-Key': apiKey
                },
                body: JSON.stringify({
                    database_id: notesDatabaseId,
                    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
                    page_size: limit
                })
            });

            const text = await response.text();

            if (!response.ok) {
                console.error('Query user notes failed:', response.status, text);
                return { success: false, entries: [], message: `查询失败: ${response.status}` };
            }

            const data = JSON.parse(text);

            if (!data.results || data.results.length === 0) {
                return { success: true, entries: [], message: '暂无笔记' };
            }

            const entries: DiaryPreview[] = data.results.map((page: any) => {
                const title = page.properties?.Name?.title?.[0]?.plain_text
                    || page.properties?.['名称']?.title?.[0]?.plain_text
                    || page.properties?.Title?.title?.[0]?.plain_text
                    || '无标题';
                // 尝试多种日期属性名
                const date = page.properties?.Date?.date?.start
                    || page.properties?.['日期']?.date?.start
                    || page.last_edited_time?.split('T')[0]
                    || '';
                return {
                    id: page.id,
                    title,
                    date,
                    url: page.url || ''
                };
            });

            return { success: true, entries, message: '获取成功' };
        } catch (e: any) {
            console.error('Get user notes failed:', e);
            return { success: false, entries: [], message: `获取失败: ${e.message}` };
        }
    },

    /**
     * 读取用户笔记页面的完整内容
     * 复用 readDiaryContent 的逻辑（都是通过 pageId 读 blocks）
     */
    readNoteContent: async (
        apiKey: string,
        pageId: string
    ): Promise<{ success: boolean; content: string; message: string }> => {
        // 和 readDiaryContent 一样，通过 blocks 端点读取
        return NotionManager.readDiaryContent(apiKey, pageId);
    },

    /**
     * 按关键词搜索用户笔记
     */
    searchUserNotes: async (
        apiKey: string,
        notesDatabaseId: string,
        keyword: string,
        limit: number = 5
    ): Promise<{ success: boolean; entries: DiaryPreview[]; message: string }> => {
        try {
            const response = await fetch(`${NotionManager.WORKER_URL}/notion/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Notion-API-Key': apiKey
                },
                body: JSON.stringify({
                    database_id: notesDatabaseId,
                    filter: {
                        property: 'Name',
                        title: { contains: keyword }
                    },
                    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
                    page_size: limit
                })
            });

            const text = await response.text();

            if (!response.ok) {
                return { success: false, entries: [], message: `搜索失败: ${response.status}` };
            }

            const data = JSON.parse(text);

            if (!data.results || data.results.length === 0) {
                return { success: true, entries: [], message: `没有找到关于"${keyword}"的笔记` };
            }

            const entries: DiaryPreview[] = data.results.map((page: any) => {
                const title = page.properties?.Name?.title?.[0]?.plain_text
                    || page.properties?.['名称']?.title?.[0]?.plain_text
                    || page.properties?.Title?.title?.[0]?.plain_text
                    || '无标题';
                const date = page.properties?.Date?.date?.start
                    || page.properties?.['日期']?.date?.start
                    || page.last_edited_time?.split('T')[0]
                    || '';
                return {
                    id: page.id,
                    title,
                    date,
                    url: page.url || ''
                };
            });

            return { success: true, entries, message: `找到 ${entries.length} 篇笔记` };
        } catch (e: any) {
            console.error('Search user notes failed:', e);
            return { success: false, entries: [], message: `搜索失败: ${e.message}` };
        }
    }
};

// 心情对应的 Emoji
export function getMoodEmoji(mood: string): string {
    const moodMap: Record<string, string> = {
        'happy': '😊',
        'sad': '😢',
        'angry': '😠',
        'excited': '🎉',
        'tired': '😴',
        'calm': '😌',
        'anxious': '😰',
        'love': '❤️',
        'nostalgic': '🌅',
        'curious': '🔍',
        'grateful': '🙏',
        'confused': '😵‍💫',
        'proud': '✨',
        'lonely': '🌙',
        'hopeful': '🌈',
        'playful': '🎮',
        '开心': '😊',
        '难过': '😢',
        '生气': '😠',
        '兴奋': '🎉',
        '疲惫': '😴',
        '平静': '😌',
        '焦虑': '😰',
        '爱': '❤️',
        '怀念': '🌅',
        '好奇': '🔍',
        '感恩': '🙏',
        '迷茫': '😵‍💫',
        '骄傲': '✨',
        '孤独': '🌙',
        '期待': '🌈',
        '调皮': '🎮',
        '温暖': '☀️',
        '感动': '🥹',
        '害羞': '😳',
        '无聊': '😑',
        '紧张': '😬',
        '满足': '😌',
        '幸福': '🥰',
        '心动': '💓',
        '思念': '💭',
        '委屈': '🥺',
        '释然': '🍃'
    };
    return moodMap[mood.toLowerCase()] || '📝';
}

// 心情对应的颜色主题
function getMoodColorTheme(mood: string): { primary: string; secondary: string; accent: string } {
    const moodColors: Record<string, { primary: string; secondary: string; accent: string }> = {
        'happy': { primary: 'yellow_background', secondary: 'orange', accent: 'yellow' },
        'sad': { primary: 'blue_background', secondary: 'blue', accent: 'purple' },
        'angry': { primary: 'red_background', secondary: 'red', accent: 'orange' },
        'excited': { primary: 'pink_background', secondary: 'pink', accent: 'red' },
        'tired': { primary: 'gray_background', secondary: 'gray', accent: 'brown' },
        'calm': { primary: 'blue_background', secondary: 'blue', accent: 'green' },
        'anxious': { primary: 'purple_background', secondary: 'purple', accent: 'gray' },
        'love': { primary: 'pink_background', secondary: 'pink', accent: 'red' },
        '开心': { primary: 'yellow_background', secondary: 'orange', accent: 'yellow' },
        '难过': { primary: 'blue_background', secondary: 'blue', accent: 'purple' },
        '生气': { primary: 'red_background', secondary: 'red', accent: 'orange' },
        '兴奋': { primary: 'pink_background', secondary: 'orange', accent: 'red' },
        '疲惫': { primary: 'gray_background', secondary: 'gray', accent: 'brown' },
        '平静': { primary: 'blue_background', secondary: 'blue', accent: 'green' },
        '焦虑': { primary: 'purple_background', secondary: 'purple', accent: 'gray' },
        '爱': { primary: 'pink_background', secondary: 'pink', accent: 'red' },
        '温暖': { primary: 'yellow_background', secondary: 'orange', accent: 'brown' },
        '感动': { primary: 'pink_background', secondary: 'pink', accent: 'blue' },
        '害羞': { primary: 'pink_background', secondary: 'pink', accent: 'red' },
        '思念': { primary: 'purple_background', secondary: 'purple', accent: 'blue' },
        '幸福': { primary: 'yellow_background', secondary: 'pink', accent: 'orange' },
        '心动': { primary: 'pink_background', secondary: 'red', accent: 'pink' },
        '孤独': { primary: 'gray_background', secondary: 'blue', accent: 'purple' },
        '期待': { primary: 'green_background', secondary: 'green', accent: 'blue' },
    };
    return moodColors[mood.toLowerCase()] || { primary: 'blue_background', secondary: 'blue', accent: 'gray' };
}

// 装饰性 emoji 池 - 根据心情随机选取
export function getDecorativeEmojis(mood: string): string[] {
    const moodDecorations: Record<string, string[]> = {
        'happy': ['🌟', '✨', '🎵', '🌻', '🍀', '🎈', '💫'],
        'sad': ['🌧️', '💧', '🍂', '🌊', '🕊️', '🌙'],
        'angry': ['🔥', '⚡', '💢', '🌪️', '💥'],
        'excited': ['🎉', '🎊', '🚀', '✨', '💥', '🎆', '⭐'],
        'love': ['💕', '💗', '🌹', '💝', '🦋', '🌸', '💖'],
        'calm': ['🍃', '☁️', '🌿', '🕊️', '💠', '🌊'],
        'tired': ['💤', '🌙', '☕', '🛏️', '😪'],
        '开心': ['🌟', '✨', '🎵', '🌻', '🍀', '🎈', '💫'],
        '难过': ['🌧️', '💧', '🍂', '🌊', '🕊️', '🌙'],
        '兴奋': ['🎉', '🎊', '🚀', '✨', '💥', '🎆', '⭐'],
        '爱': ['💕', '💗', '🌹', '💝', '🦋', '🌸', '💖'],
        '平静': ['🍃', '☁️', '🌿', '🕊️', '💠', '🌊'],
        '温暖': ['☀️', '🌼', '🍵', '🧡', '🌅'],
        '思念': ['💭', '🌙', '⭐', '🌌', '📮'],
        '幸福': ['🥰', '🌈', '🌸', '💖', '✨'],
    };
    return moodDecorations[mood.toLowerCase()] || ['📝', '✨', '💫', '🌟'];
}

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================
// 解析内联格式 (Markdown → Notion Rich Text)
// ============================================
function parseInlineFormatting(text: string): any[] {
    const richTexts: any[] = [];
    // 正则匹配: **bold**, *italic*, ~~strikethrough~~, `code`
    const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`)/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        // 前面的普通文本
        if (match.index > lastIndex) {
            richTexts.push({
                type: 'text',
                text: { content: text.slice(lastIndex, match.index) }
            });
        }

        if (match[2]) {
            // **bold**
            richTexts.push({
                type: 'text',
                text: { content: match[2] },
                annotations: { bold: true }
            });
        } else if (match[3]) {
            // *italic*
            richTexts.push({
                type: 'text',
                text: { content: match[3] },
                annotations: { italic: true }
            });
        } else if (match[4]) {
            // ~~strikethrough~~
            richTexts.push({
                type: 'text',
                text: { content: match[4] },
                annotations: { strikethrough: true }
            });
        } else if (match[5]) {
            // `code`
            richTexts.push({
                type: 'text',
                text: { content: match[5] },
                annotations: { code: true }
            });
        }

        lastIndex = match.index + match[0].length;
    }

    // 剩余文本
    if (lastIndex < text.length) {
        richTexts.push({
            type: 'text',
            text: { content: text.slice(lastIndex) }
        });
    }

    if (richTexts.length === 0) {
        richTexts.push({ type: 'text', text: { content: text } });
    }

    return richTexts;
}

// ============================================
// Markdown → Notion Blocks 转换器
// ============================================
function parseMarkdownToNotionBlocks(content: string, mood?: string, characterName?: string): any[] {
    const blocks: any[] = [];
    const lines = content.split('\n');
    const colors = getMoodColorTheme(mood || '平静');
    const decorEmojis = getDecorativeEmojis(mood || '平静');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    // ── 顶部: 心情横幅 ──
    if (mood) {
        blocks.push({
            object: 'block', type: 'callout',
            callout: {
                rich_text: [{
                    type: 'text',
                    text: { content: `${pickRandom(decorEmojis)} 今日心情: ${mood} ${pickRandom(decorEmojis)}` },
                    annotations: { bold: true }
                }],
                icon: { emoji: getMoodEmoji(mood) },
                color: colors.primary
            }
        });
    }

    // ── 时间戳 ──
    blocks.push({
        object: 'block', type: 'quote',
        quote: {
            rich_text: [
                { type: 'text', text: { content: '🕐 ' }, annotations: { color: 'gray' } },
                { type: 'text', text: { content: `写于 ${timeStr}` }, annotations: { italic: true, color: 'gray' } }
            ],
            color: 'gray'
        }
    });

    blocks.push({ object: 'block', type: 'divider', divider: {} });

    // ── 正文解析 ──
    let sectionIndex = 0;
    const sectionColors = ['default', colors.secondary, 'default', colors.accent, 'default'];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) continue; // 跳过空行

        // --- 或 *** → 分割线
        if (/^[-*]{3,}$/.test(trimmed)) {
            blocks.push({ object: 'block', type: 'divider', divider: {} });
            sectionIndex++;
            continue;
        }

        // # Heading 1
        if (trimmed.startsWith('# ')) {
            const headingText = trimmed.slice(2);
            blocks.push({
                object: 'block', type: 'heading_2',
                heading_2: {
                    rich_text: [
                        { type: 'text', text: { content: `${pickRandom(decorEmojis)} ` } },
                        { type: 'text', text: { content: headingText }, annotations: { bold: true, color: colors.secondary } }
                    ],
                    color: colors.primary
                }
            });
            continue;
        }

        // ## Heading 2
        if (trimmed.startsWith('## ')) {
            const headingText = trimmed.slice(3);
            blocks.push({
                object: 'block', type: 'heading_3',
                heading_3: {
                    rich_text: parseInlineFormatting(headingText),
                    color: colors.accent
                }
            });
            continue;
        }

        // ### Heading 3 → 用 callout 代替，更好看
        if (trimmed.startsWith('### ')) {
            const headingText = trimmed.slice(4);
            const bgColors = [colors.primary, 'green_background', 'purple_background', 'orange_background', 'pink_background'];
            blocks.push({
                object: 'block', type: 'callout',
                callout: {
                    rich_text: parseInlineFormatting(headingText),
                    icon: { emoji: pickRandom(decorEmojis) },
                    color: bgColors[sectionIndex % bgColors.length]
                }
            });
            continue;
        }

        // > quote
        if (trimmed.startsWith('> ')) {
            const quoteText = trimmed.slice(2);
            blocks.push({
                object: 'block', type: 'quote',
                quote: {
                    rich_text: parseInlineFormatting(quoteText),
                    color: colors.secondary
                }
            });
            continue;
        }

        // - bullet / * bullet
        if (/^[-*]\s/.test(trimmed)) {
            const bulletText = trimmed.slice(2);
            blocks.push({
                object: 'block', type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: parseInlineFormatting(bulletText),
                    color: sectionColors[sectionIndex % sectionColors.length]
                }
            });
            continue;
        }

        // 1. numbered list
        if (/^\d+\.\s/.test(trimmed)) {
            const numText = trimmed.replace(/^\d+\.\s/, '');
            blocks.push({
                object: 'block', type: 'numbered_list_item',
                numbered_list_item: {
                    rich_text: parseInlineFormatting(numText)
                }
            });
            continue;
        }

        // [!callout] 特殊 callout 语法
        if (trimmed.startsWith('[!') && trimmed.includes(']')) {
            const calloutMatch = trimmed.match(/^\[!(.+?)\]\s*(.*)/);
            if (calloutMatch) {
                const calloutType = calloutMatch[1];
                const calloutText = calloutMatch[2] || '';
                const calloutColorMap: Record<string, string> = {
                    'warning': 'orange_background', 'danger': 'red_background',
                    'info': 'blue_background', 'success': 'green_background',
                    'note': 'purple_background', 'tip': 'green_background',
                    'heart': 'pink_background', 'star': 'yellow_background',
                    '重要': 'red_background', '想法': 'purple_background',
                    '秘密': 'pink_background', '提醒': 'orange_background',
                    '开心': 'yellow_background', '难过': 'blue_background',
                };
                const calloutEmojiMap: Record<string, string> = {
                    'warning': '⚠️', 'danger': '🚨', 'info': 'ℹ️',
                    'success': '✅', 'note': '📝', 'tip': '💡',
                    'heart': '💖', 'star': '⭐',
                    '重要': '❗', '想法': '💭', '秘密': '🤫',
                    '提醒': '📌', '开心': '😊', '难过': '😢',
                };
                blocks.push({
                    object: 'block', type: 'callout',
                    callout: {
                        rich_text: parseInlineFormatting(calloutText),
                        icon: { emoji: calloutEmojiMap[calloutType] || '📌' },
                        color: calloutColorMap[calloutType] || colors.primary
                    }
                });
                continue;
            }
        }

        // 普通段落 - 带随机微妙颜色
        const currentColor = sectionIndex % 3 === 0 ? 'default' : sectionColors[sectionIndex % sectionColors.length];
        blocks.push({
            object: 'block', type: 'paragraph',
            paragraph: {
                rich_text: parseInlineFormatting(trimmed),
                color: currentColor
            }
        });
    }

    // ── 底部装饰 ──
    blocks.push({ object: 'block', type: 'divider', divider: {} });

    // 签名
    if (characterName) {
        blocks.push({
            object: 'block', type: 'paragraph',
            paragraph: {
                rich_text: [
                    { type: 'text', text: { content: `${pickRandom(decorEmojis)} ` } },
                    { type: 'text', text: { content: `—— ${characterName}` }, annotations: { italic: true, color: 'gray' } },
                    { type: 'text', text: { content: ` ${pickRandom(decorEmojis)}` } }
                ]
            }
        });
    }

    return blocks;
}

// ============================================
// Notion Blocks → 可读文本 转换器
// ============================================
function notionBlocksToText(blocks: any[]): string {
    const lines: string[] = [];

    for (const block of blocks) {
        const type = block.type;

        if (type === 'divider') {
            lines.push('---');
            continue;
        }

        // 提取 rich_text
        const richText = block[type]?.rich_text;
        if (!richText) continue;

        const text = richText.map((rt: any) => rt.plain_text || rt.text?.content || '').join('');
        if (!text.trim()) continue;

        switch (type) {
            case 'heading_1':
                lines.push(`# ${text}`);
                break;
            case 'heading_2':
                lines.push(`## ${text}`);
                break;
            case 'heading_3':
                lines.push(`### ${text}`);
                break;
            case 'quote':
                lines.push(`> ${text}`);
                break;
            case 'callout':
                const emoji = block.callout?.icon?.emoji || '📌';
                lines.push(`${emoji} ${text}`);
                break;
            case 'bulleted_list_item':
                lines.push(`- ${text}`);
                break;
            case 'numbered_list_item':
                lines.push(`· ${text}`);
                break;
            case 'to_do':
                const checked = block.to_do?.checked ? '✅' : '⬜';
                lines.push(`${checked} ${text}`);
                break;
            case 'toggle':
                lines.push(`▶ ${text}`);
                break;
            case 'code':
                lines.push(`\`\`\`\n${text}\n\`\`\``);
                break;
            default:
                lines.push(text);
        }
    }

    return lines.join('\n');
}

// ============================================
// 飞书多维表格 集成模块 (中国区 Notion 替代)
// ============================================
