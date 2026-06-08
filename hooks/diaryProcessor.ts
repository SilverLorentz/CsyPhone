import { Message,RealtimeConfig } from '../types';
import { NotionManager,FeishuManager } from '../utils/realtimeContext';
import { ChatParser } from '../utils/chatParser';
import { DB } from '../utils/db';
import { safeFetchJson } from '../utils/safeApi';

export interface DiaryProcessorContext {
    charId: string;
    charName: string;
    userName: string;
    realtimeConfig?: RealtimeConfig;
    apiConfig: any;
    fullMessages: Message[];
    headers: any;
    baseUrl: string;
    addToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    setDiaryStatus: (s: string) => void;
    updateTokenUsage: (data: any, msgCount: number, pass: string) => void;
    historyMsgCount: number;
}

export async function processDiaryActions(
    aiContent: string,
    ctx: DiaryProcessorContext
): Promise<string> {
    let data;
    // 支持两种格式:
    //   旧格式: [[DIARY: 标题 | 内容]]
    //   新格式: [[DIARY_START: 标题 | 心情]]\n多行内容...\n[[DIARY_END]]
    const diaryStartMatch = aiContent.match(/\[\[DIARY_START:\s*(.+?)\]\]\n?([\s\S]*?)\[\[DIARY_END\]\]/);
    const diaryMatch = diaryStartMatch || aiContent.match(/\[\[DIARY:\s*(.+?)\]\]/s);

    if (diaryMatch && ctx.realtimeConfig?.notionEnabled && ctx.realtimeConfig?.notionApiKey && ctx.realtimeConfig?.notionDatabaseId) {
        let title = '';
        let content = '';
        let mood = '';

        if (diaryStartMatch) {
            // 新格式: [[DIARY_START: 标题 | 心情]]\n内容\n[[DIARY_END]]
            const header = diaryStartMatch[1].trim();
            content = diaryStartMatch[2].trim();

            if (header.includes('|')) {
                const parts = header.split('|');
                title = parts[0].trim();
                mood = parts.slice(1).join('|').trim();
            } else {
                title = header;
            }
            console.log('📔 [Diary] AI写了一篇长日记:', title, '心情:', mood);
        } else {
            // 旧格式: [[DIARY: 标题 | 内容]]
            const diaryRaw = diaryMatch[1].trim();
            console.log('📔 [Diary] AI想写日记:', diaryRaw);

            if (diaryRaw.includes('|')) {
                const parts = diaryRaw.split('|');
                title = parts[0].trim();
                content = parts.slice(1).join('|').trim();
            } else {
                content = diaryRaw;
            }
        }

        // 没有标题时用日期
        if (!title) {
            const now = new Date();
            title = `${ctx.charName}的日记 - ${now.getMonth() + 1}/${now.getDate()}`;
        }

        try {
            const result = await NotionManager.createDiaryPage(
                ctx.realtimeConfig.notionApiKey,
                ctx.realtimeConfig.notionDatabaseId,
                { title, content, mood: mood || undefined, characterName: ctx.charName }
            );

            if (result.success) {
                console.log('📔 [Diary] 写入成功:', result.url);
                await DB.saveMessage({
                    charId: ctx.charId,
                    role: 'system',
                    type: 'text',
                    content: `📔 ${ctx.charName}写了一篇日记「${title}」`
                });
                ctx.addToast(`📔 ${ctx.charName}写了一篇日记!`, 'success');
            } else {
                console.error('📔 [Diary] 写入失败:', result.message);
                ctx.addToast(`日记写入失败: ${result.message}`, 'error');
            }
        } catch (e) {
            console.error('📔 [Diary] 写入异常:', e);
        }

        // 移除日记标记，不在聊天中显示
        aiContent = aiContent.replace(diaryMatch[0], '').trim();
    } else if (diaryMatch) {
        console.log('📔 [Diary] 检测到日记意图但未配置Notion');
        aiContent = aiContent.replace(diaryMatch[0], '').trim();
    }

    // 清理残留的日记标记（两种格式都清理）
    aiContent = aiContent.replace(/\[\[DIARY:.*?\]\]/gs, '').trim();
    aiContent = aiContent.replace(/\[\[DIARY_START:.*?\]\][\s\S]*?\[\[DIARY_END\]\]/g, '').trim();

    // 5.7 Handle Read Diary (翻阅日记)
    const readDiaryMatch = aiContent.match(/\[\[READ_DIARY:\s*(.+?)\]\]/);

    // Helper: make a fallback API call so the AI keeps talking even when diary fails
    // NOTE: Uses role:'user' for the system instruction to ensure API compatibility
    // (some providers reject conversations not ending with a user message)
    const diaryFallbackCall = async (reason: string, tagPattern: RegExp) => {
        const cleaned = aiContent.replace(tagPattern, '').trim() || '让我翻翻日记...';
        const msgs = [
            ...ctx.fullMessages,
            { role: 'assistant', content: cleaned },
            { role: 'user', content: `[系统: ${reason}。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 可以自然地提一下，比如"日记好像打不开诶"、"嗯...好像没找到"\n3. 继续正常聊天，用多条消息回复\n4. 严禁再输出[[READ_DIARY:...]]或[[FS_READ_DIARY:...]]标记]` }
        ];
        try {
            data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                method: 'POST', headers: ctx.headers,
                body: JSON.stringify({ model: ctx.apiConfig.model, messages: msgs, temperature: 0.8, stream: false })
            });
            ctx.updateTokenUsage(data, ctx.historyMsgCount, 'diary-fallback');
            aiContent = data.choices?.[0]?.message?.content || '';
            aiContent = ChatParser.cleanAiSecondPass(aiContent);
        } catch (fallbackErr) {
            console.error('📖 [Diary Fallback] 也失败了:', fallbackErr);
            aiContent = aiContent.replace(tagPattern, '').trim();
        }
    };

    // Helper: parse various date formats
    const parseDiaryDate = (dateInput: string): string => {
        const now = new Date();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
        if (dateInput === '今天') return now.toISOString().split('T')[0];
        if (dateInput === '昨天') { const d = new Date(now); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }
        if (dateInput === '前天') { const d = new Date(now); d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0]; }
        const daysAgo = dateInput.match(/^(\d+)天前$/);
        if (daysAgo) { const d = new Date(now); d.setDate(d.getDate() - parseInt(daysAgo[1])); return d.toISOString().split('T')[0]; }
        const monthDay = dateInput.match(/(\d{1,2})月(\d{1,2})/);
        if (monthDay) return `${now.getFullYear()}-${monthDay[1].padStart(2, '0')}-${monthDay[2].padStart(2, '0')}`;
        const parsed = new Date(dateInput);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
        return '';
    };

    if (readDiaryMatch) {
        const dateInput = readDiaryMatch[1].trim();
        console.log('📖 [ReadDiary] AI想翻阅日记:', dateInput);

        if (ctx.realtimeConfig?.notionEnabled && ctx.realtimeConfig?.notionApiKey && ctx.realtimeConfig?.notionDatabaseId) {
            const targetDate = parseDiaryDate(dateInput);

            if (targetDate) {
                try {
                    ctx.setDiaryStatus(`正在翻阅 ${targetDate} 的日记...`);

                    const findResult = await NotionManager.getDiaryByDate(
                        ctx.realtimeConfig.notionApiKey,
                        ctx.realtimeConfig.notionDatabaseId,
                        ctx.charName,
                        targetDate
                    );

                    if (findResult.success && findResult.entries.length > 0) {
                        ctx.setDiaryStatus(`找到 ${findResult.entries.length} 篇日记，正在阅读...`);
                        const diaryContents: string[] = [];
                        for (const entry of findResult.entries) {
                            const readResult = await NotionManager.readDiaryContent(
                                ctx.realtimeConfig.notionApiKey,
                                entry.id
                            );
                            if (readResult.success) {
                                diaryContents.push(`📔「${entry.title}」(${entry.date})\n${readResult.content}`);
                            }
                        }

                        if (diaryContents.length > 0) {
                            const diaryText = diaryContents.join('\n\n---\n\n');
                            console.log('📖 [ReadDiary] 成功读取', findResult.entries.length, '篇日记');
                            ctx.setDiaryStatus('正在整理日记回忆...');

                            const cleanedForDiary = aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                            const diaryMessages = [
                                ...ctx.fullMessages,
                                { role: 'assistant', content: cleanedForDiary },
                                { role: 'user', content: `[系统: 你翻开了自己 ${targetDate} 的日记，以下是你当时写的内容]\n\n${diaryText}\n\n[系统: 你已经看完了日记。现在请你：\n1. 先正常回应用户刚才说的话（这是最重要的！用户还在等你回复）\n2. 自然地把日记中的回忆融入你的回复中，比如"我想起来了那天..."、"看了日记才发现..."等\n3. 可以分享日记中有趣的细节，表达当时的情绪\n4. 用多条消息回复，别只说一句话就结束\n5. 严禁再输出[[READ_DIARY:...]]标记]` }
                            ];

                            data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                                method: 'POST', headers: ctx.headers,
                                body: JSON.stringify({ model: ctx.apiConfig.model, messages: diaryMessages, temperature: 0.8, stream: false })
                            });
                            ctx.updateTokenUsage(data, ctx.historyMsgCount, 'read-diary-notion');
                            aiContent = data.choices?.[0]?.message?.content || '';
                            aiContent = ChatParser.cleanAiSecondPass(aiContent);
                            ctx.addToast(`📖 ${ctx.charName}翻阅了${targetDate}的日记`, 'info');
                        } else {
                            console.log('📖 [ReadDiary] 日记内容为空');
                            await diaryFallbackCall('你翻开了日记本但页面是空白的', /\[\[READ_DIARY:.*?\]\]/g);
                        }
                    } else {
                        console.log('📖 [ReadDiary] 该日期没有日记:', targetDate);
                        ctx.setDiaryStatus(`${targetDate} 没有找到日记...`);
                        const cleanedForNoDiary = aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                        const nodiaryMessages = [
                            ...ctx.fullMessages,
                            { role: 'assistant', content: cleanedForNoDiary },
                            { role: 'user', content: `[系统: 你翻了翻日记本，发现 ${targetDate} 那天没有写日记。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 自然地提到没找到那天的日记，比如"嗯...那天好像没写日记"、"翻了翻没找到诶"\n3. 用多条消息回复，保持对话自然\n4. 严禁再输出[[READ_DIARY:...]]标记]` }
                        ];

                        data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                            method: 'POST', headers: ctx.headers,
                            body: JSON.stringify({ model: ctx.apiConfig.model, messages: nodiaryMessages, temperature: 0.8, stream: false })
                        });
                        ctx.updateTokenUsage(data, ctx.historyMsgCount, 'no-diary-notion');
                        aiContent = data.choices?.[0]?.message?.content || '';
                        aiContent = ChatParser.cleanAiSecondPass(aiContent);
                    }
                } catch (e) {
                    console.error('📖 [ReadDiary] 读取异常:', e);
                    ctx.setDiaryStatus('日记读取失败，继续对话...');
                    await diaryFallbackCall('你想翻阅日记但读取出了问题（可能是网络问题）', /\[\[READ_DIARY:.*?\]\]/g);
                }
            } else {
                console.log('📖 [ReadDiary] 无法解析日期:', dateInput);
                await diaryFallbackCall(`你想翻阅日记但没能理解要找哪天的（"${dateInput}"）`, /\[\[READ_DIARY:.*?\]\]/g);
            }
        } else {
            console.log('📖 [ReadDiary] 检测到读日记意图但未配置Notion');
            await diaryFallbackCall('你想翻阅日记但日记本暂时不可用', /\[\[READ_DIARY:.*?\]\]/g);
        }
        ctx.setDiaryStatus('');
    }

    // 清理残留的读日记标记
    aiContent = aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim();

    // 5.8 Handle Feishu Diary Writing (写日记到飞书多维表格 - 独立于 Notion)
    const fsDiaryStartMatch = aiContent.match(/\[\[FS_DIARY_START:\s*(.+?)\]\]\n?([\s\S]*?)\[\[FS_DIARY_END\]\]/);
    const fsDiaryMatch = fsDiaryStartMatch || aiContent.match(/\[\[FS_DIARY:\s*(.+?)\]\]/s);

    if (fsDiaryMatch && ctx.realtimeConfig?.feishuEnabled && ctx.realtimeConfig?.feishuAppId && ctx.realtimeConfig?.feishuAppSecret && ctx.realtimeConfig?.feishuBaseId && ctx.realtimeConfig?.feishuTableId) {
        let fsTitle = '';
        let fsContent = '';
        let fsMood = '';

        if (fsDiaryStartMatch) {
            const header = fsDiaryStartMatch[1].trim();
            fsContent = fsDiaryStartMatch[2].trim();
            if (header.includes('|')) {
                const parts = header.split('|');
                fsTitle = parts[0].trim();
                fsMood = parts.slice(1).join('|').trim();
            } else {
                fsTitle = header;
            }
            console.log('📒 [Feishu] AI写了一篇长日记:', fsTitle, '心情:', fsMood);
        } else {
            const diaryRaw = fsDiaryMatch[1].trim();
            console.log('📒 [Feishu] AI想写日记:', diaryRaw);
            if (diaryRaw.includes('|')) {
                const parts = diaryRaw.split('|');
                fsTitle = parts[0].trim();
                fsContent = parts.slice(1).join('|').trim();
            } else {
                fsContent = diaryRaw;
            }
        }

        if (!fsTitle) {
            const now = new Date();
            fsTitle = `${ctx.charName}的日记 - ${now.getMonth() + 1}/${now.getDate()}`;
        }

        try {
            const result = await FeishuManager.createDiaryRecord(
                ctx.realtimeConfig.feishuAppId,
                ctx.realtimeConfig.feishuAppSecret,
                ctx.realtimeConfig.feishuBaseId,
                ctx.realtimeConfig.feishuTableId,
                { title: fsTitle, content: fsContent, mood: fsMood || undefined, characterName: ctx.charName }
            );

            if (result.success) {
                console.log('📒 [Feishu] 写入成功:', result.recordId);
                await DB.saveMessage({
                    charId: ctx.charId,
                    role: 'system',
                    type: 'text',
                    content: `📒 ${ctx.charName}写了一篇日记「${fsTitle}」(飞书)`
                });
                ctx.addToast(`📒 ${ctx.charName}写了一篇日记! (飞书)`, 'success');
            } else {
                console.error('📒 [Feishu] 写入失败:', result.message);
                ctx.addToast(`飞书日记写入失败: ${result.message}`, 'error');
            }
        } catch (e) {
            console.error('📒 [Feishu] 写入异常:', e);
        }

        aiContent = aiContent.replace(fsDiaryMatch[0], '').trim();
    } else if (fsDiaryMatch) {
        console.log('📒 [Feishu] 检测到日记意图但未配置飞书');
        aiContent = aiContent.replace(fsDiaryMatch[0], '').trim();
    }

    // 清理残留的飞书日记标记
    aiContent = aiContent.replace(/\[\[FS_DIARY:.*?\]\]/gs, '').trim();
    aiContent = aiContent.replace(/\[\[FS_DIARY_START:.*?\]\][\s\S]*?\[\[FS_DIARY_END\]\]/g, '').trim();

    // 5.9 Handle Feishu Read Diary (翻阅飞书日记)
    const fsReadDiaryMatch = aiContent.match(/\[\[FS_READ_DIARY:\s*(.+?)\]\]/);
    if (fsReadDiaryMatch) {
        const dateInput = fsReadDiaryMatch[1].trim();
        console.log('📖 [Feishu ReadDiary] AI想翻阅飞书日记:', dateInput);

        if (ctx.realtimeConfig?.feishuEnabled && ctx.realtimeConfig?.feishuAppId && ctx.realtimeConfig?.feishuAppSecret && ctx.realtimeConfig?.feishuBaseId && ctx.realtimeConfig?.feishuTableId) {
            const targetDate = parseDiaryDate(dateInput);

            if (targetDate) {
                try {
                    ctx.setDiaryStatus(`正在翻阅 ${targetDate} 的飞书日记...`);

                    const findResult = await FeishuManager.getDiaryByDate(
                        ctx.realtimeConfig.feishuAppId,
                        ctx.realtimeConfig.feishuAppSecret,
                        ctx.realtimeConfig.feishuBaseId,
                        ctx.realtimeConfig.feishuTableId,
                        ctx.charName,
                        targetDate
                    );

                    if (findResult.success && findResult.entries.length > 0) {
                        ctx.setDiaryStatus(`找到 ${findResult.entries.length} 篇飞书日记，正在阅读...`);
                        const diaryContents: string[] = [];
                        for (const entry of findResult.entries) {
                            diaryContents.push(`📒「${entry.title}」(${entry.date})\n${entry.content}`);
                        }

                        if (diaryContents.length > 0) {
                            const diaryText = diaryContents.join('\n\n---\n\n');
                            console.log('📖 [Feishu ReadDiary] 成功读取', findResult.entries.length, '篇日记');
                            ctx.setDiaryStatus('正在整理日记回忆...');

                            const cleanedForFsDiary = aiContent.replace(/\[\[FS_READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                            const diaryMessages = [
                                ...ctx.fullMessages,
                                { role: 'assistant', content: cleanedForFsDiary },
                                { role: 'user', content: `[系统: 你翻开了自己 ${targetDate} 的日记（飞书），以下是你当时写的内容]\n\n${diaryText}\n\n[系统: 你已经看完了日记。现在请你：\n1. 先正常回应用户刚才说的话（这是最重要的！用户还在等你回复）\n2. 自然地把日记中的回忆融入你的回复中，比如"我想起来了那天..."、"看了日记才发现..."等\n3. 可以分享日记中有趣的细节，表达当时的情绪\n4. 用多条消息回复，别只说一句话就结束\n5. 严禁再输出[[FS_READ_DIARY:...]]标记]` }
                            ];

                            data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                                method: 'POST', headers: ctx.headers,
                                body: JSON.stringify({ model: ctx.apiConfig.model, messages: diaryMessages, temperature: 0.8, stream: false })
                            });
                            ctx.updateTokenUsage(data, ctx.historyMsgCount, 'read-diary-feishu');
                            aiContent = data.choices?.[0]?.message?.content || '';
                            aiContent = ChatParser.cleanAiSecondPass(aiContent);
                            ctx.addToast(`📖 ${ctx.charName}翻阅了${targetDate}的飞书日记`, 'info');
                        } else {
                            console.log('📖 [Feishu ReadDiary] 日记内容为空');
                            await diaryFallbackCall('你翻开了飞书日记本但页面是空白的', /\[\[FS_READ_DIARY:.*?\]\]/g);
                        }
                    } else {
                        ctx.setDiaryStatus(`${targetDate} 没有找到飞书日记...`);
                        const cleanedForFsNoDiary = aiContent.replace(/\[\[FS_READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                        const nodiaryMessages = [
                            ...ctx.fullMessages,
                            { role: 'assistant', content: cleanedForFsNoDiary },
                            { role: 'user', content: `[系统: 你翻了翻飞书日记本，发现 ${targetDate} 那天没有写日记。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 自然地提到没找到那天的日记，比如"嗯...那天好像没写日记"、"翻了翻没找到诶"\n3. 用多条消息回复，保持对话自然\n4. 严禁再输出[[FS_READ_DIARY:...]]标记]` }
                        ];

                        data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                            method: 'POST', headers: ctx.headers,
                            body: JSON.stringify({ model: ctx.apiConfig.model, messages: nodiaryMessages, temperature: 0.8, stream: false })
                        });
                        ctx.updateTokenUsage(data, ctx.historyMsgCount, 'no-diary-feishu');
                        aiContent = data.choices?.[0]?.message?.content || '';
                        aiContent = ChatParser.cleanAiSecondPass(aiContent);
                    }
                } catch (e) {
                    console.error('📖 [Feishu ReadDiary] 读取异常:', e);
                    ctx.setDiaryStatus('飞书日记读取失败，继续对话...');
                    await diaryFallbackCall('你想翻阅飞书日记但读取出了问题（可能是网络问题）', /\[\[FS_READ_DIARY:.*?\]\]/g);
                }
            } else {
                console.log('📖 [Feishu ReadDiary] 无法解析日期:', dateInput);
                await diaryFallbackCall(`你想翻阅飞书日记但没能理解要找哪天的（"${dateInput}"）`, /\[\[FS_READ_DIARY:.*?\]\]/g);
            }
        } else {
            console.log('📖 [Feishu ReadDiary] 检测到读日记意图但未配置飞书');
            await diaryFallbackCall('你想翻阅飞书日记但飞书暂时不可用', /\[\[FS_READ_DIARY:.*?\]\]/g);
        }
        ctx.setDiaryStatus('');
    }

    // 清理残留的飞书读日记标记
    aiContent = aiContent.replace(/\[\[FS_READ_DIARY:.*?\]\]/g, '').trim();

    // 5.9b Handle Read User Note (翻阅用户笔记)
    const readNoteMatch = aiContent.match(/\[\[READ_NOTE:\s*(.+?)\]\]/);
    if (readNoteMatch) {
        const keyword = readNoteMatch[1].trim();
        console.log('📝 [ReadNote] AI想翻阅用户笔记:', keyword);

        if (ctx.realtimeConfig?.notionEnabled && ctx.realtimeConfig?.notionApiKey && ctx.realtimeConfig?.notionNotesDatabaseId) {
            try {
                ctx.setDiaryStatus(`正在翻阅笔记: ${keyword}...`);

                const findResult = await NotionManager.searchUserNotes(
                    ctx.realtimeConfig.notionApiKey,
                    ctx.realtimeConfig.notionNotesDatabaseId,
                    keyword,
                    3
                );

                if (findResult.success && findResult.entries.length > 0) {
                    ctx.setDiaryStatus(`找到 ${findResult.entries.length} 篇笔记，正在阅读...`);
                    const noteContents: string[] = [];
                    for (const entry of findResult.entries) {
                        const readResult = await NotionManager.readNoteContent(
                            ctx.realtimeConfig.notionApiKey,
                            entry.id
                        );
                        if (readResult.success) {
                            noteContents.push(`📝「${entry.title}」(${entry.date})\n${readResult.content}`);
                        }
                    }

                    if (noteContents.length > 0) {
                        const noteText = noteContents.join('\n\n---\n\n');
                        console.log('📝 [ReadNote] 成功读取', findResult.entries.length, '篇笔记');
                        ctx.setDiaryStatus('正在整理笔记内容...');

                        const cleanedForNote = aiContent.replace(/\[\[READ_NOTE:.*?\]\]/g, '').trim() || '让我看看...';
                        const noteMessages = [
                            ...ctx.fullMessages,
                            { role: 'assistant', content: cleanedForNote },
                            { role: 'user', content: `[系统: 你翻阅了${ctx.userName}的笔记，以下是内容:\n\n${noteText}\n\n请你：\n1. 先正常回应用户刚才说的话\n2. 自然地提到你看到的笔记内容，语气温馨，像不经意间看到的\n3. 可以对内容表示好奇、关心或共鸣\n4. 用多条消息回复，保持对话自然\n5. 严禁再输出[[READ_NOTE:...]]标记]` }
                        ];

                        data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                            method: 'POST', headers: ctx.headers,
                            body: JSON.stringify({ model: ctx.apiConfig.model, messages: noteMessages, temperature: 0.8, stream: false })
                        });
                        ctx.updateTokenUsage(data, ctx.historyMsgCount, 'read-note');
                        aiContent = data.choices?.[0]?.message?.content || '';
                        aiContent = ChatParser.cleanAiSecondPass(aiContent);
                        ctx.addToast(`📝 ${ctx.charName}翻阅了关于"${keyword}"的笔记`, 'info');
                    } else {
                        console.log('📝 [ReadNote] 笔记内容为空');
                        await diaryFallbackCall('你翻阅了笔记但内容是空的', /\[\[READ_NOTE:.*?\]\]/g);
                    }
                } else {
                    console.log('📝 [ReadNote] 没有找到匹配的笔记:', keyword);
                    ctx.setDiaryStatus(`没有找到关于"${keyword}"的笔记...`);
                    const cleanedForNoNote = aiContent.replace(/\[\[READ_NOTE:.*?\]\]/g, '').trim() || '让我看看...';
                    const nonoteMessages = [
                        ...ctx.fullMessages,
                        { role: 'assistant', content: cleanedForNoNote },
                        { role: 'user', content: `[系统: 你想看${ctx.userName}关于"${keyword}"的笔记，但没有找到。请你：\n1. 先正常回应用户刚才说的话\n2. 可以自然地提一下，比如"嗯，好像没找到那篇笔记"\n3. 继续正常聊天\n4. 严禁再输出[[READ_NOTE:...]]标记]` }
                    ];

                    data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                        method: 'POST', headers: ctx.headers,
                        body: JSON.stringify({ model: ctx.apiConfig.model, messages: nonoteMessages, temperature: 0.8, stream: false })
                    });
                    ctx.updateTokenUsage(data, ctx.historyMsgCount, 'read-note-empty');
                    aiContent = data.choices?.[0]?.message?.content || '';
                    aiContent = ChatParser.cleanAiSecondPass(aiContent);
                }
            } catch (e) {
                console.error('📝 [ReadNote] 读取异常:', e);
                ctx.setDiaryStatus('笔记读取失败，继续对话...');
                await diaryFallbackCall('你想翻阅笔记但读取出了问题（可能是网络问题）', /\[\[READ_NOTE:.*?\]\]/g);
            }
        } else {
            console.log('📝 [ReadNote] 检测到读笔记意图但未配置笔记数据库');
            await diaryFallbackCall('你想翻阅笔记但笔记功能暂时不可用', /\[\[READ_NOTE:.*?\]\]/g);
        }
        ctx.setDiaryStatus('');
    }

    return aiContent;
}
