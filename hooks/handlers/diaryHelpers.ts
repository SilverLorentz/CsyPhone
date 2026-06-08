import { ChatParser } from '../../utils/chatParser';
import { safeFetchJson } from '../../utils/safeApi';
import type { HandlerContext } from './types';

export function parseDiaryDate(dateInput: string): string {
    const now = new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
    if (dateInput === '今天') return now.toISOString().split('T')[0];
    if (dateInput === '昨天') {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    }
    if (dateInput === '前天') {
        const d = new Date(now);
        d.setDate(d.getDate() - 2);
        return d.toISOString().split('T')[0];
    }

    const daysAgo = dateInput.match(/^(\d+)天前$/);
    if (daysAgo) {
        const d = new Date(now);
        d.setDate(d.getDate() - parseInt(daysAgo[1], 10));
        return d.toISOString().split('T')[0];
    }

    const monthDay = dateInput.match(/(\d{1,2})月(\d{1,2})/);
    if (monthDay) {
        return `${now.getFullYear()}-${monthDay[1].padStart(2, '0')}-${monthDay[2].padStart(2, '0')}`;
    }

    const parsed = new Date(dateInput);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
    }

    return '';
}

export async function runDiaryFallbackCall(
    aiContent: string,
    reason: string,
    tagPattern: RegExp,
    ctx: HandlerContext,
    pass: string,
    placeholder = '让我翻翻日记...',
): Promise<string> {
    const cleaned = aiContent.replace(tagPattern, '').trim() || placeholder;
    const messages = [
        ...ctx.fullMessages,
        { role: 'assistant', content: cleaned },
        {
            role: 'user',
            content: `[系统: ${reason}。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 可以自然地提一下，比如"日记好像打不开诶"、"嗯...好像没找到"\n3. 继续正常聊天，用多条消息回复\n4. 严禁再输出[[READ_DIARY:...]]或[[FS_READ_DIARY:...]]标记]`,
        },
    ];

    try {
        const data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: ctx.headers,
            body: JSON.stringify({
                model: ctx.apiConfig.model,
                messages,
                temperature: 0.8,
                stream: false,
            }),
        });
        ctx.updateTokenUsage(data, ctx.historyMsgCount, pass);
        return ChatParser.cleanAiSecondPass(data.choices?.[0]?.message?.content || '');
    } catch (fallbackErr) {
        console.error('📖 [Diary Fallback] 也失败了:', fallbackErr);
        return aiContent.replace(tagPattern, '').trim();
    }
}
