import { DB } from '../../utils/db';
import { FeishuManager } from '../../utils/realtimeContext';
import type { HandlerContext } from './types';

export async function handleFeishuDiary(aiContent: string, ctx: HandlerContext): Promise<string> {
    try {
        const fsDiaryStartMatch = aiContent.match(/\[\[FS_DIARY_START:\s*(.+?)\]\]\n?([\s\S]*?)\[\[FS_DIARY_END\]\]/);
        const fsDiaryMatch = fsDiaryStartMatch || aiContent.match(/\[\[FS_DIARY:\s*(.+?)\]\]/s);

        if (
            fsDiaryMatch &&
            ctx.realtimeConfig?.feishuEnabled &&
            ctx.realtimeConfig?.feishuAppId &&
            ctx.realtimeConfig?.feishuAppSecret &&
            ctx.realtimeConfig?.feishuBaseId &&
            ctx.realtimeConfig?.feishuTableId
        ) {
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
                fsTitle = `${ctx.char.name}的日记 - ${now.getMonth() + 1}/${now.getDate()}`;
            }

            try {
                const result = await FeishuManager.createDiaryRecord(
                    ctx.realtimeConfig.feishuAppId,
                    ctx.realtimeConfig.feishuAppSecret,
                    ctx.realtimeConfig.feishuBaseId,
                    ctx.realtimeConfig.feishuTableId,
                    { title: fsTitle, content: fsContent, mood: fsMood || undefined, characterName: ctx.char.name },
                );

                if (result.success) {
                    console.log('📒 [Feishu] 写入成功:', result.recordId);
                    await DB.saveMessage({
                        charId: ctx.char.id,
                        role: 'system',
                        type: 'text',
                        content: `📒 ${ctx.char.name}写了一篇日记「${fsTitle}」(飞书)`,
                    });
                    ctx.addToast(`📒 ${ctx.char.name}写了一篇日记! (飞书)`, 'success');
                } else {
                    console.error('📒 [Feishu] 写入失败:', result.message);
                    ctx.addToast(`飞书日记写入失败: ${result.message}`, 'error');
                }
            } catch (error) {
                console.error('📒 [Feishu] 写入异常:', error);
            }

            aiContent = aiContent.replace(fsDiaryMatch[0], '').trim();
        } else if (fsDiaryMatch) {
            console.log('📒 [Feishu] 检测到日记意图但未配置飞书');
            aiContent = aiContent.replace(fsDiaryMatch[0], '').trim();
        }

        aiContent = aiContent.replace(/\[\[FS_DIARY:.*?\]\]/gs, '').trim();
        return aiContent.replace(/\[\[FS_DIARY_START:.*?\]\][\s\S]*?\[\[FS_DIARY_END\]\]/g, '').trim();
    } catch (fsDiaryStageErr) {
        console.error('🗂️ [Feishu Diary] Stage failed:', fsDiaryStageErr);
        aiContent = aiContent.replace(/\[\[FS_DIARY:.*?\]\]/gs, '').trim();
        return aiContent.replace(/\[\[FS_DIARY_START:.*?\]\][\s\S]*?\[\[FS_DIARY_END\]\]/g, '').trim();
    }
}
