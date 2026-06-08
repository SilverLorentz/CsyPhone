import { getDecorativeEmojis, getMoodEmoji } from './notionService';

export interface FeishuDiaryEntry {
    title: string;
    content: string;
    mood?: string;
    date?: string;
    characterName?: string;
}

export interface FeishuDiaryPreview {
    recordId: string;
    title: string;
    date: string;
    content: string;
}

// 飞书 token 缓存
let feishuTokenCache: { token: string; expiresAt: number } | null = null;

/**
 * 飞书日记内容美化格式化器
 * 把 AI 写的原始文本变成带 emoji、分隔线、心情横幅的漂亮文本
 */
function formatFeishuDiaryContent(content: string, mood?: string, characterName?: string): string {
    const moodEmoji = getMoodEmoji(mood || '平静');
    const decorEmojis = getDecorativeEmojis(mood || '平静');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    const lines: string[] = [];

    // ── 心情横幅 ──
    if (mood) {
        lines.push(`${pick(decorEmojis)} ━━━━━━━━━━━━━━━━━━ ${pick(decorEmojis)}`);
        lines.push(`${moodEmoji}  今日心情: ${mood}  ${moodEmoji}`);
        lines.push(`${pick(decorEmojis)} ━━━━━━━━━━━━━━━━━━ ${pick(decorEmojis)}`);
        lines.push('');
    }

    // ── 时间戳 ──
    lines.push(`🕐 写于 ${timeStr}`);
    lines.push('');
    lines.push('─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
    lines.push('');

    // ── 正文处理 ──
    const contentLines = content.split('\n');
    for (const line of contentLines) {
        const trimmed = line.trim();
        if (!trimmed) {
            lines.push('');
            continue;
        }

        // # 大标题 → emoji 装饰
        if (trimmed.startsWith('# ')) {
            lines.push('');
            lines.push(`${pick(decorEmojis)} 【${trimmed.slice(2)}】${pick(decorEmojis)}`);
            lines.push('');
            continue;
        }

        // ## 中标题
        if (trimmed.startsWith('## ')) {
            lines.push('');
            lines.push(`✦ ${trimmed.slice(3)}`);
            lines.push('');
            continue;
        }

        // ### 小标题
        if (trimmed.startsWith('### ')) {
            lines.push(`  ▸ ${trimmed.slice(4)}`);
            continue;
        }

        // > 引用
        if (trimmed.startsWith('> ')) {
            lines.push(`  ❝ ${trimmed.slice(2)} ❞`);
            continue;
        }

        // --- 分割线
        if (/^[-*]{3,}$/.test(trimmed)) {
            lines.push('');
            lines.push(`  ${pick(decorEmojis)} · · · · · · · · · ${pick(decorEmojis)}`);
            lines.push('');
            continue;
        }

        // - 列表
        if (/^[-*]\s/.test(trimmed)) {
            lines.push(`  ${pick(decorEmojis)} ${trimmed.slice(2)}`);
            continue;
        }

        // 1. 有序列表
        if (/^\d+\.\s/.test(trimmed)) {
            lines.push(`  ${trimmed}`);
            continue;
        }

        // [!callout] 特殊标记
        const calloutMatch = trimmed.match(/^\[!(.+?)\]\s*(.*)/);
        if (calloutMatch) {
            const calloutType = calloutMatch[1];
            const calloutText = calloutMatch[2] || '';
            const calloutEmojis: Record<string, string> = {
                'heart': '💖', 'star': '⭐', 'warning': '⚠️', 'danger': '🚨',
                'info': 'ℹ️', 'success': '✅', 'note': '📝', 'tip': '💡',
                '重要': '❗', '想法': '💭', '秘密': '🤫', '提醒': '📌',
                '开心': '😊', '难过': '😢',
            };
            const emoji = calloutEmojis[calloutType] || '📌';
            lines.push(`  ┊ ${emoji} ${calloutText}`);
            continue;
        }

        // 普通段落
        lines.push(trimmed);
    }

    // ── 底部装饰 ──
    lines.push('');
    lines.push('─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');

    if (characterName) {
        lines.push(`${pick(decorEmojis)} —— ${characterName} ${pick(decorEmojis)}`);
    }

    return lines.join('\n');
}

export const FeishuManager = {

    WORKER_URL: 'https://sully-n.qegj567.workers.dev',

    /**
     * 获取飞书 tenant_access_token（通过 Worker 代理，带缓存）
     */
    getToken: async (appId: string, appSecret: string): Promise<{ success: boolean; token: string; message: string }> => {
        // 检查缓存是否有效 (提前5分钟过期)
        if (feishuTokenCache && feishuTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
            return { success: true, token: feishuTokenCache.token, message: '使用缓存token' };
        }

        try {
            const response = await fetch(`${FeishuManager.WORKER_URL}/feishu/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ app_id: appId, app_secret: appSecret })
            });

            const text = await response.text();
            if (!response.ok) {
                try {
                    const errJson = JSON.parse(text);
                    return { success: false, token: '', message: `获取token失败: ${errJson.msg || errJson.error || response.status}` };
                } catch {
                    return { success: false, token: '', message: `获取token失败: ${response.status}` };
                }
            }

            const data = JSON.parse(text);
            if (data.code !== 0) {
                return { success: false, token: '', message: `飞书错误: ${data.msg || '未知错误'}` };
            }

            const token = data.tenant_access_token;
            const expire = (data.expire || 7200) * 1000; // 转为毫秒
            feishuTokenCache = { token, expiresAt: Date.now() + expire };

            return { success: true, token, message: 'Token获取成功' };
        } catch (e: any) {
            return { success: false, token: '', message: `网络错误: ${e.message}` };
        }
    },

    /**
     * 测试飞书连接（验证凭据 + 列出数据表验证权限）
     */
    testConnection: async (
        appId: string,
        appSecret: string,
        baseId: string,
        tableId: string
    ): Promise<{ success: boolean; message: string }> => {
        try {
            const tokenResult = await FeishuManager.getToken(appId, appSecret);
            if (!tokenResult.success) {
                return { success: false, message: tokenResult.message };
            }

            // 用列出所有表的端点（飞书没有获取单个表的GET端点）
            const response = await fetch(`${FeishuManager.WORKER_URL}/feishu/bitable/${baseId}/tables`, {
                method: 'GET',
                headers: { 'X-Feishu-Token': tokenResult.token }
            });

            const text = await response.text();
            if (!response.ok) {
                try {
                    const errJson = JSON.parse(text);
                    return { success: false, message: `连接失败: ${errJson.msg || errJson.error || response.status}` };
                } catch {
                    return { success: false, message: `连接失败: ${response.status}` };
                }
            }

            const data = JSON.parse(text);
            if (data.code !== 0) {
                return { success: false, message: `飞书错误: ${data.msg || '请检查多维表格权限'}` };
            }

            const tables = data.data?.items || [];
            const targetTable = tables.find((t: any) => t.table_id === tableId);
            if (targetTable) {
                return { success: true, message: `连接成功! 数据表: ${targetTable.name}` };
            } else {
                const tableNames = tables.map((t: any) => `${t.name}(${t.table_id})`).join(', ');
                return { success: false, message: `多维表格中未找到表 ${tableId}。可用表: ${tableNames || '无'}` };
            }
        } catch (e: any) {
            return { success: false, message: `网络错误: ${e.message}` };
        }
    },

    /**
     * 创建日记记录（写入飞书多维表格）
     * 数据表需要字段: 标题(文本), 内容(文本), 日期(日期), 心情(文本), 角色(文本)
     */
    createDiaryRecord: async (
        appId: string,
        appSecret: string,
        baseId: string,
        tableId: string,
        entry: FeishuDiaryEntry
    ): Promise<{ success: boolean; recordId?: string; message: string }> => {
        try {
            const tokenResult = await FeishuManager.getToken(appId, appSecret);
            if (!tokenResult.success) {
                return { success: false, message: tokenResult.message };
            }

            const now = new Date();
            const dateStr = entry.date || now.toISOString().split('T')[0];
            const dateTimestamp = new Date(dateStr).getTime();
            const titlePrefix = entry.characterName ? `[${entry.characterName}] ` : '';

            // 美化日记内容
            const formattedContent = formatFeishuDiaryContent(
                entry.content || '',
                entry.mood,
                entry.characterName
            );

            const fields: Record<string, any> = {
                '标题': `${getMoodEmoji(entry.mood || '平静')} ${titlePrefix}${entry.title || dateStr + ' 的日记'}`,
                '内容': formattedContent,
                '日期': dateTimestamp,
                '心情': `${getMoodEmoji(entry.mood || '平静')} ${entry.mood || '平静'}`,
                '角色': entry.characterName || ''
            };

            const response = await fetch(`${FeishuManager.WORKER_URL}/feishu/bitable/${baseId}/${tableId}/records`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Feishu-Token': tokenResult.token
                },
                body: JSON.stringify({ fields })
            });

            const text = await response.text();
            if (!response.ok) {
                try {
                    const errJson = JSON.parse(text);
                    return { success: false, message: `写入失败: ${errJson.msg || errJson.error || response.status}` };
                } catch {
                    return { success: false, message: `写入失败: ${response.status}` };
                }
            }

            const data = JSON.parse(text);
            if (data.code !== 0) {
                return { success: false, message: `飞书错误: ${data.msg || '写入失败'}` };
            }

            return {
                success: true,
                recordId: data.data?.record?.record_id,
                message: '日记已写入飞书!'
            };
        } catch (e: any) {
            return { success: false, message: `网络错误: ${e.message}` };
        }
    },

    /**
     * 获取角色最近的日记
     */
    getRecentDiaries: async (
        appId: string,
        appSecret: string,
        baseId: string,
        tableId: string,
        characterName: string,
        limit: number = 5
    ): Promise<{ success: boolean; entries: FeishuDiaryPreview[]; message: string }> => {
        try {
            const tokenResult = await FeishuManager.getToken(appId, appSecret);
            if (!tokenResult.success) {
                return { success: false, entries: [], message: tokenResult.message };
            }

            const response = await fetch(`${FeishuManager.WORKER_URL}/feishu/bitable/${baseId}/${tableId}/records/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Feishu-Token': tokenResult.token
                },
                body: JSON.stringify({
                    filter: {
                        conjunction: 'and',
                        conditions: [{
                            field_name: '角色',
                            operator: 'is',
                            value: [characterName]
                        }]
                    },
                    sort: [{ field_name: '日期', desc: true }],
                    page_size: limit
                })
            });

            const text = await response.text();
            if (!response.ok) {
                return { success: false, entries: [], message: `查询失败: ${response.status}` };
            }

            const data = JSON.parse(text);
            if (data.code !== 0) {
                return { success: false, entries: [], message: `飞书错误: ${data.msg || '查询失败'}` };
            }

            const items = data.data?.items || [];
            if (items.length === 0) {
                return { success: true, entries: [], message: '暂无日记' };
            }

            const entries: FeishuDiaryPreview[] = items.map((item: any) => {
                const fields = item.fields || {};
                const rawTitle = (Array.isArray(fields['标题']) ? fields['标题']?.[0]?.text : fields['标题']) || '无标题';
                const cleanTitle = String(rawTitle).replace(/^\[.*?\]\s*/, '');
                const rawDate = fields['日期'];
                const dateStr = rawDate ? new Date(typeof rawDate === 'number' ? rawDate : rawDate).toISOString().split('T')[0] : '';

                return {
                    recordId: item.record_id,
                    title: cleanTitle,
                    date: dateStr,
                    content: (Array.isArray(fields['内容']) ? fields['内容']?.[0]?.text : fields['内容']) || ''
                };
            });

            return { success: true, entries, message: '获取成功' };
        } catch (e: any) {
            return { success: false, entries: [], message: `获取失败: ${e.message}` };
        }
    },

    /**
     * 按日期查找角色的日记
     */
    getDiaryByDate: async (
        appId: string,
        appSecret: string,
        baseId: string,
        tableId: string,
        characterName: string,
        date: string  // YYYY-MM-DD
    ): Promise<{ success: boolean; entries: FeishuDiaryPreview[]; message: string }> => {
        try {
            const tokenResult = await FeishuManager.getToken(appId, appSecret);
            if (!tokenResult.success) {
                return { success: false, entries: [], message: tokenResult.message };
            }

            const dateTimestamp = new Date(date).getTime();
            const nextDayTimestamp = dateTimestamp + 24 * 60 * 60 * 1000;

            const response = await fetch(`${FeishuManager.WORKER_URL}/feishu/bitable/${baseId}/${tableId}/records/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Feishu-Token': tokenResult.token
                },
                body: JSON.stringify({
                    filter: {
                        conjunction: 'and',
                        conditions: [
                            { field_name: '角色', operator: 'is', value: [characterName] },
                            { field_name: '日期', operator: 'isGreater', value: [dateTimestamp - 1] },
                            { field_name: '日期', operator: 'isLess', value: [nextDayTimestamp] }
                        ]
                    },
                    sort: [{ field_name: '日期', desc: true }],
                    page_size: 10
                })
            });

            const text = await response.text();
            if (!response.ok) {
                return { success: false, entries: [], message: `查询失败: ${response.status}` };
            }

            const data = JSON.parse(text);
            if (data.code !== 0) {
                return { success: false, entries: [], message: `飞书错误: ${data.msg || '查询失败'}` };
            }

            const items = data.data?.items || [];
            if (items.length === 0) {
                return { success: true, entries: [], message: `没有找到 ${date} 的日记` };
            }

            const entries: FeishuDiaryPreview[] = items.map((item: any) => {
                const fields = item.fields || {};
                const rawTitle = (Array.isArray(fields['标题']) ? fields['标题']?.[0]?.text : fields['标题']) || '无标题';
                const cleanTitle = String(rawTitle).replace(/^\[.*?\]\s*/, '');

                return {
                    recordId: item.record_id,
                    title: cleanTitle,
                    date: date,
                    content: (Array.isArray(fields['内容']) ? fields['内容']?.[0]?.text : fields['内容']) || ''
                };
            });

            return { success: true, entries, message: `找到 ${entries.length} 篇日记` };
        } catch (e: any) {
            return { success: false, entries: [], message: `查询失败: ${e.message}` };
        }
    },

    /**
     * 读取指定记录的日记内容
     * 飞书多维表格直接存储在字段中，不需要像 Notion 一样读取 blocks
     */
    readDiaryContent: async (
        appId: string,
        appSecret: string,
        baseId: string,
        tableId: string,
        recordId: string
    ): Promise<{ success: boolean; content: string; message: string }> => {
        try {
            const tokenResult = await FeishuManager.getToken(appId, appSecret);
            if (!tokenResult.success) {
                return { success: false, content: '', message: tokenResult.message };
            }

            const response = await fetch(`${FeishuManager.WORKER_URL}/feishu/bitable/${baseId}/${tableId}/records/${recordId}`, {
                method: 'GET',
                headers: { 'X-Feishu-Token': tokenResult.token }
            });

            const text = await response.text();
            if (!response.ok) {
                return { success: false, content: '', message: `读取失败: ${response.status}` };
            }

            const data = JSON.parse(text);
            if (data.code !== 0) {
                return { success: false, content: '', message: `飞书错误: ${data.msg || '读取失败'}` };
            }

            const fields = data.data?.record?.fields || {};
            const content = (Array.isArray(fields['内容']) ? fields['内容']?.[0]?.text : fields['内容']) || '（空白日记）';

            return { success: true, content: String(content), message: '读取成功' };
        } catch (e: any) {
            return { success: false, content: '', message: `读取失败: ${e.message}` };
        }
    }
};
