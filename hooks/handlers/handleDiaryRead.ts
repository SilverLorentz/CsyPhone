import { ChatParser } from '../../utils/chatParser';
import { NotionManager } from '../../utils/realtimeContext';
import { safeFetchJson } from '../../utils/safeApi';
import { parseDiaryDate, runDiaryFallbackCall } from './diaryHelpers';
import type { HandlerContext } from './types';

export async function handleDiaryRead(aiContent: string, ctx: HandlerContext): Promise<string> {
    const readDiaryMatch = aiContent.match(/\[\[READ_DIARY:\s*(.+?)\]\]/);

    try {
        if (readDiaryMatch) {
            const dateInput = readDiaryMatch[1].trim();
            console.log('📖 [ReadDiary] AI想翻阅日记:', dateInput);

            if (
                ctx.realtimeConfig?.notionEnabled &&
                ctx.realtimeConfig?.notionApiKey &&
                ctx.realtimeConfig?.notionDatabaseId
            ) {
                const targetDate = parseDiaryDate(dateInput);

                if (targetDate) {
                    try {
                        ctx.setDiaryStatus?.(`正在翻阅 ${targetDate} 的日记...`);

                        const findResult = await NotionManager.getDiaryByDate(
                            ctx.realtimeConfig.notionApiKey,
                            ctx.realtimeConfig.notionDatabaseId,
                            ctx.char.name,
                            targetDate,
                        );

                        if (findResult.success && findResult.entries.length > 0) {
                            ctx.setDiaryStatus?.(`找到 ${findResult.entries.length} 篇日记，正在阅读...`);
                            const diaryContents: string[] = [];
                            for (const entry of findResult.entries) {
                                const readResult = await NotionManager.readDiaryContent(
                                    ctx.realtimeConfig.notionApiKey,
                                    entry.id,
                                );
                                if (readResult.success) {
                                    diaryContents.push(`📔「${entry.title}」(${entry.date})\n${readResult.content}`);
                                }
                            }

                            if (diaryContents.length > 0) {
                                const diaryText = diaryContents.join('\n\n---\n\n');
                                console.log('📖 [ReadDiary] 成功读取', findResult.entries.length, '篇日记');
                                ctx.setDiaryStatus?.('正在整理日记回忆...');

                                const cleanedForDiary =
                                    aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                                const diaryMessages = [
                                    ...ctx.fullMessages,
                                    { role: 'assistant', content: cleanedForDiary },
                                    {
                                        role: 'user',
                                        content: `[系统: 你翻开了自己 ${targetDate} 的日记，以下是你当时写的内容]\n\n${diaryText}\n\n[系统: 你已经看完了日记。现在请你：\n1. 先正常回应用户刚才说的话（这是最重要的！用户还在等你回复）\n2. 自然地把日记中的回忆融入你的回复中，比如"我想起来了那天..."、"看了日记才发现..."等\n3. 可以分享日记中有趣的细节，表达当时的情绪\n4. 用多条消息回复，别只说一句话就结束\n5. 严禁再输出[[READ_DIARY:...]]标记]`,
                                    },
                                ];

                                const data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                                    method: 'POST',
                                    headers: ctx.headers,
                                    body: JSON.stringify({
                                        model: ctx.apiConfig.model,
                                        messages: diaryMessages,
                                        temperature: 0.8,
                                        stream: false,
                                    }),
                                });
                                ctx.updateTokenUsage(data, ctx.historyMsgCount, 'read-diary-notion');
                                aiContent = ChatParser.cleanAiSecondPass(data.choices?.[0]?.message?.content || '');
                                ctx.addToast(`📖 ${ctx.char.name}翻阅了${targetDate}的日记`, 'info');
                            } else {
                                console.log('📖 [ReadDiary] 日记内容为空');
                                aiContent = await runDiaryFallbackCall(
                                    aiContent,
                                    '你翻开了日记本但页面是空白的',
                                    /\[\[READ_DIARY:.*?\]\]/g,
                                    ctx,
                                    'diary-fallback',
                                );
                            }
                        } else {
                            console.log('📖 [ReadDiary] 该日期没有日记:', targetDate);
                            ctx.setDiaryStatus?.(`${targetDate} 没有找到日记...`);
                            const cleanedForNoDiary =
                                aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                            const noDiaryMessages = [
                                ...ctx.fullMessages,
                                { role: 'assistant', content: cleanedForNoDiary },
                                {
                                    role: 'user',
                                    content: `[系统: 你翻了翻日记本，发现 ${targetDate} 那天没有写日记。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 自然地提到没找到那天的日记，比如"嗯...那天好像没写日记"、"翻了翻没找到诶"\n3. 用多条消息回复，保持对话自然\n4. 严禁再输出[[READ_DIARY:...]]标记]`,
                                },
                            ];

                            const data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                                method: 'POST',
                                headers: ctx.headers,
                                body: JSON.stringify({
                                    model: ctx.apiConfig.model,
                                    messages: noDiaryMessages,
                                    temperature: 0.8,
                                    stream: false,
                                }),
                            });
                            ctx.updateTokenUsage(data, ctx.historyMsgCount, 'no-diary-notion');
                            aiContent = ChatParser.cleanAiSecondPass(data.choices?.[0]?.message?.content || '');
                        }
                    } catch (error) {
                        console.error('📖 [ReadDiary] 读取异常:', error);
                        ctx.setDiaryStatus?.('日记读取失败，继续对话...');
                        aiContent = await runDiaryFallbackCall(
                            aiContent,
                            '你想翻阅日记但读取出了问题（可能是网络问题）',
                            /\[\[READ_DIARY:.*?\]\]/g,
                            ctx,
                            'diary-fallback',
                        );
                    }
                } else {
                    console.log('📖 [ReadDiary] 无法解析日期:', dateInput);
                    aiContent = await runDiaryFallbackCall(
                        aiContent,
                        `你想翻阅日记但没能理解要找哪天的（"${dateInput}"）`,
                        /\[\[READ_DIARY:.*?\]\]/g,
                        ctx,
                        'diary-fallback',
                    );
                }
            } else {
                console.log('📖 [ReadDiary] 检测到读日记意图但未配置Notion');
                aiContent = await runDiaryFallbackCall(
                    aiContent,
                    '你想翻阅日记但日记本暂时不可用',
                    /\[\[READ_DIARY:.*?\]\]/g,
                    ctx,
                    'diary-fallback',
                );
            }

            ctx.setDiaryStatus?.('');
        }

        return aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim();
    } catch (readDiaryStageErr) {
        console.error('📉 [ReadDiary] Stage failed:', readDiaryStageErr);
        ctx.setDiaryStatus?.('');
        return aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim();
    }
}
