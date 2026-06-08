import { ChatParser } from '../../utils/chatParser';
import { NotionManager } from '../../utils/realtimeContext';
import { safeFetchJson } from '../../utils/safeApi';
import { processXhsActions } from '../xhsProcessor';
import { runDiaryFallbackCall } from './diaryHelpers';
import type { HandlerContext } from './types';

export async function handleXhsActions(aiContent: string, ctx: HandlerContext): Promise<string> {
    try {
        const readNoteMatch = aiContent.match(/\[\[READ_NOTE:\s*(.+?)\]\]/);
        if (readNoteMatch) {
            const keyword = readNoteMatch[1].trim();
            console.log('📝 [ReadNote] AI想翻阅用户笔记:', keyword);

            if (
                ctx.realtimeConfig?.notionEnabled &&
                ctx.realtimeConfig?.notionApiKey &&
                ctx.realtimeConfig?.notionNotesDatabaseId
            ) {
                try {
                    ctx.setDiaryStatus?.(`正在翻阅笔记: ${keyword}...`);

                    const findResult = await NotionManager.searchUserNotes(
                        ctx.realtimeConfig.notionApiKey,
                        ctx.realtimeConfig.notionNotesDatabaseId,
                        keyword,
                        3,
                    );

                    if (findResult.success && findResult.entries.length > 0) {
                        ctx.setDiaryStatus?.(`找到 ${findResult.entries.length} 篇笔记，正在阅读...`);
                        const noteContents: string[] = [];
                        for (const entry of findResult.entries) {
                            const readResult = await NotionManager.readNoteContent(
                                ctx.realtimeConfig.notionApiKey,
                                entry.id,
                            );
                            if (readResult.success) {
                                noteContents.push(`📝「${entry.title}」(${entry.date})\n${readResult.content}`);
                            }
                        }

                        if (noteContents.length > 0) {
                            const noteText = noteContents.join('\n\n---\n\n');
                            console.log('📝 [ReadNote] 成功读取', findResult.entries.length, '篇笔记');
                            ctx.setDiaryStatus?.('正在整理笔记内容...');

                            const cleanedForNote = aiContent.replace(/\[\[READ_NOTE:.*?\]\]/g, '').trim() || '让我看看...';
                            const noteMessages = [
                                ...ctx.fullMessages,
                                { role: 'assistant', content: cleanedForNote },
                                {
                                    role: 'user',
                                    content: `[系统: 你翻阅了${ctx.userProfile.name}的笔记，以下是内容:\n\n${noteText}\n\n请你：\n1. 先正常回应用户刚才说的话\n2. 自然地提到你看到的笔记内容，语气温馨，像不经意间看到的\n3. 可以对内容表示好奇、关心或共鸣\n4. 用多条消息回复，保持对话自然\n5. 严禁再输出[[READ_NOTE:...]]标记]`,
                                },
                            ];

                            const data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                                method: 'POST',
                                headers: ctx.headers,
                                body: JSON.stringify({
                                    model: ctx.apiConfig.model,
                                    messages: noteMessages,
                                    temperature: 0.8,
                                    stream: false,
                                }),
                            });
                            ctx.updateTokenUsage(data, ctx.historyMsgCount, 'read-note');
                            aiContent = ChatParser.cleanAiSecondPass(data.choices?.[0]?.message?.content || '');
                            ctx.addToast(`📝 ${ctx.char.name}翻阅了关于"${keyword}"的笔记`, 'info');
                        } else {
                            console.log('📝 [ReadNote] 笔记内容为空');
                            aiContent = await runDiaryFallbackCall(
                                aiContent,
                                '你翻阅了笔记但内容是空的',
                                /\[\[READ_NOTE:.*?\]\]/g,
                                ctx,
                                'diary-fallback',
                            );
                        }
                    } else {
                        console.log('📝 [ReadNote] 没有找到匹配的笔记:', keyword);
                        ctx.setDiaryStatus?.(`没有找到关于"${keyword}"的笔记...`);
                        const cleanedForNoNote = aiContent.replace(/\[\[READ_NOTE:.*?\]\]/g, '').trim() || '让我看看...';
                        const noNoteMessages = [
                            ...ctx.fullMessages,
                            { role: 'assistant', content: cleanedForNoNote },
                            {
                                role: 'user',
                                content: `[系统: 你想看${ctx.userProfile.name}关于"${keyword}"的笔记，但没有找到。请你：\n1. 先正常回应用户刚才说的话\n2. 可以自然地提一下，比如"嗯，好像没找到那篇笔记"\n3. 继续正常聊天\n4. 严禁再输出[[READ_NOTE:...]]标记]`,
                            },
                        ];

                        const data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                            method: 'POST',
                            headers: ctx.headers,
                            body: JSON.stringify({
                                model: ctx.apiConfig.model,
                                messages: noNoteMessages,
                                temperature: 0.8,
                                stream: false,
                            }),
                        });
                        ctx.updateTokenUsage(data, ctx.historyMsgCount, 'read-note-empty');
                        aiContent = ChatParser.cleanAiSecondPass(data.choices?.[0]?.message?.content || '');
                    }
                } catch (error) {
                    console.error('📝 [ReadNote] 读取异常:', error);
                    ctx.setDiaryStatus?.('笔记读取失败，继续对话...');
                    aiContent = await runDiaryFallbackCall(
                        aiContent,
                        '你想翻阅笔记但读取出了问题（可能是网络问题）',
                        /\[\[READ_NOTE:.*?\]\]/g,
                        ctx,
                        'diary-fallback',
                    );
                }
            } else {
                console.log('📝 [ReadNote] 检测到读笔记意图但未配置笔记数据库');
                aiContent = await runDiaryFallbackCall(
                    aiContent,
                    '你想翻阅笔记但笔记功能暂时不可用',
                    /\[\[READ_NOTE:.*?\]\]/g,
                    ctx,
                    'diary-fallback',
                );
            }

            ctx.setDiaryStatus?.('');
        }

        aiContent = aiContent.replace(/\[\[READ_NOTE:.*?\]\]/g, '').trim();
    } catch (readNoteStageErr) {
        console.error('📘 [ReadNote] Stage failed:', readNoteStageErr);
        ctx.setDiaryStatus?.('');
        aiContent = aiContent.replace(/\[\[READ_NOTE:.*?\]\]/g, '').trim();
    }

    try {
        aiContent = await processXhsActions(
            aiContent,
            {
                charId: ctx.char.id,
                charName: ctx.char.name,
                realtimeConfig: ctx.realtimeConfig,
                fullMessages: ctx.fullMessages,
                apiConfig: ctx.apiConfig,
                headers: ctx.headers,
                addToast: ctx.addToast,
                setMessages: ctx.setMessages,
                setXhsStatus: ctx.setXhsStatus ?? (() => {}),
                updateTokenUsage: ctx.updateTokenUsage,
                historyMsgCount: ctx.historyMsgCount,
                xsecTokenCache: ctx.xsecTokenCache ?? new Map<string, string>(),
                noteTitleCache: ctx.noteTitleCache ?? new Map<string, string>(),
                commentUserIdCache: ctx.commentUserIdCache ?? new Map<string, string>(),
                commentAuthorNameCache: ctx.commentAuthorNameCache ?? new Map<string, string>(),
                commentParentIdCache: ctx.commentParentIdCache ?? new Map<string, string>(),
            },
            ctx.char,
        );
        return await ChatParser.parseAndExecuteActions(aiContent, ctx.char.id, ctx.char.name, ctx.addToast);
    } catch (xhsStageErr) {
        console.error('📕 [XHS] Stage failed:', xhsStageErr);
        ctx.setXhsStatus?.('');
        aiContent = aiContent.replace(/\[\[XHS_[\s\S]*?\]\]/g, '').trim();
        return aiContent.replace(/\[\[ACTION:[\s\S]*?\]\]/g, '').trim();
    }
}
