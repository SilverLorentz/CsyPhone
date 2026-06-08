import { ChatParser } from '../../utils/chatParser';
import { safeFetchJson } from '../../utils/safeApi';
import type { HandlerContext } from './types';

function getDetailedLogs(ctx: HandlerContext, year: string, month: string): string | null {
    if (!ctx.char.memories) return null;
    const target = `${year}-${month.padStart(2, '0')}`;
    const logs = ctx.char.memories.filter((mem) => {
        return mem.date.includes(target) || mem.date.includes(`${year}年${parseInt(month, 10)}月`);
    });
    if (logs.length === 0) return null;
    return logs.map((mem) => `[${mem.date}] (${mem.mood || 'normal'}): ${mem.summary}`).join('\n');
}

export async function handleRecall(aiContent: string, ctx: HandlerContext): Promise<string> {
    try {
        const recallMatch = aiContent.match(/\[\[RECALL:\s*(\d{4})[-/年](\d{1,2})\]\]/);
        if (recallMatch) {
            const year = recallMatch[1];
            const month = recallMatch[2];
            const targetMonth = `${year}-${month.padStart(2, '0')}`;
            const alreadyActive = ctx.char.activeMemoryMonths?.includes(targetMonth);

            if (alreadyActive) {
                console.log(`♻️ [Recall] ${targetMonth} already in activeMemoryMonths, skipping duplicate recall`);
                aiContent = aiContent.replace(/\[\[RECALL:\s*\d{4}[-/年]\d{1,2}\]\]/g, '').trim();
            } else {
                ctx.setRecallStatus?.(`正在调阅 ${year}年${month}月 的详细档案...`);
                const detailedLogs = getDetailedLogs(ctx, year, month);

                if (detailedLogs) {
                    const recallMessages = [
                        ...ctx.fullMessages,
                        {
                            role: 'user',
                            content: `[系统: 已成功调取 ${year}-${month} 的详细日志]\n${detailedLogs}\n[系统: 现在请结合这些细节回答用户。保持对话自然。]`,
                        },
                    ];

                    try {
                        const data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                            method: 'POST',
                            headers: ctx.headers,
                            body: JSON.stringify({
                                model: ctx.apiConfig.model,
                                messages: recallMessages,
                                temperature: 0.8,
                                stream: false,
                            }),
                        });
                        ctx.updateTokenUsage(data, ctx.historyMsgCount, 'recall');
                        aiContent = ChatParser.cleanAiSecondPass(data.choices?.[0]?.message?.content || '');
                        ctx.addToast(`已调用 ${year}-${month} 详细记忆`, 'info');
                    } catch (recallErr: any) {
                        console.error('Recall API failed:', recallErr.message);
                    }
                }
            }
        }
        ctx.setRecallStatus?.('');
        return aiContent;
    } catch (recallStageErr) {
        console.error('♻️ [Recall] Stage failed:', recallStageErr);
        ctx.setRecallStatus?.('');
        return aiContent.replace(/\[\[RECALL:.*?\]\]/g, '').trim();
    }
}
