import { DB } from '../../utils/db';
import { NotionManager } from '../../utils/realtimeContext';
import type { HandlerContext } from './types';

export async function handleDiaryWrite(aiContent: string, ctx: HandlerContext): Promise<string> {
    try {
        const diaryStartMatch = aiContent.match(/\[\[DIARY_START:\s*(.+?)\]\]\n?([\s\S]*?)\[\[DIARY_END\]\]/);
        const diaryMatch = diaryStartMatch || aiContent.match(/\[\[DIARY:\s*(.+?)\]\]/s);

        if (
            diaryMatch &&
            ctx.realtimeConfig?.notionEnabled &&
            ctx.realtimeConfig?.notionApiKey &&
            ctx.realtimeConfig?.notionDatabaseId
        ) {
            let title = '';
            let content = '';
            let mood = '';

            if (diaryStartMatch) {
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

            if (!title) {
                const now = new Date();
                title = `${ctx.char.name}的日记 - ${now.getMonth() + 1}/${now.getDate()}`;
            }

            try {
                const result = await NotionManager.createDiaryPage(
                    ctx.realtimeConfig.notionApiKey,
                    ctx.realtimeConfig.notionDatabaseId,
                    { title, content, mood: mood || undefined, characterName: ctx.char.name },
                );

                if (result.success) {
                    console.log('📔 [Diary] 写入成功:', result.url);
                    await DB.saveMessage({
                        charId: ctx.char.id,
                        role: 'system',
                        type: 'text',
                        content: `📔 ${ctx.char.name}写了一篇日记「${title}」`,
                    });
                    ctx.addToast(`📔 ${ctx.char.name}写了一篇日记!`, 'success');
                } else {
                    console.error('📔 [Diary] 写入失败:', result.message);
                    ctx.addToast(`日记写入失败: ${result.message}`, 'error');
                }
            } catch (error) {
                console.error('📔 [Diary] 写入异常:', error);
            }

            aiContent = aiContent.replace(diaryMatch[0], '').trim();
        } else if (diaryMatch) {
            console.log('📔 [Diary] 检测到日记意图但未配置Notion');
            aiContent = aiContent.replace(diaryMatch[0], '').trim();
        }

        aiContent = aiContent.replace(/\[\[DIARY:.*?\]\]/gs, '').trim();
        return aiContent.replace(/\[\[DIARY_START:.*?\]\][\s\S]*?\[\[DIARY_END\]\]/g, '').trim();
    } catch (diaryStageErr) {
        console.error('📝 [Diary] Stage failed:', diaryStageErr);
        aiContent = aiContent.replace(/\[\[DIARY:.*?\]\]/gs, '').trim();
        return aiContent.replace(/\[\[DIARY_START:.*?\]\][\s\S]*?\[\[DIARY_END\]\]/g, '').trim();
    }
}
