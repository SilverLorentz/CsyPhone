import { ChatParser } from '../../utils/chatParser';
import { CanvaMcpClient } from '../../utils/canvaMcpClient';
import { DB } from '../../utils/db';
import { safeFetchJson } from '../../utils/safeApi';
import type { CanvaDesignSummary } from '../../types/canva';
import type { HandlerContext } from './types';

const CANVA_TAG_RE = /\[\[(?:CANVA_CREATE|CANVA_SEARCH|CANVA_EXPORT)\s*[:：][\s\S]*?\]\]/gi;

const stripCanvaTags = (content: string): string => content.replace(CANVA_TAG_RE, '').trim();

const getCanvaConfig = (ctx: HandlerContext): { enabled: boolean; serverUrl: string } => {
    const cfg = ctx.realtimeConfig?.canvaMcpConfig;
    const serverUrl = cfg?.serverUrl?.trim() || '';
    return {
        enabled: ctx.realtimeConfig?.canvaEnabled === true && cfg?.enabled === true && !!serverUrl,
        serverUrl,
    };
};

const splitActionArgs = (raw: string): string[] => raw.split(/[|｜]/).map(part => part.trim()).filter(Boolean);

const parseCreateArgs = (raw: string): { designType: string; title: string; prompt: string; style?: string } => {
    const parts = splitActionArgs(raw);
    if (parts.length <= 1) {
        const title = parts[0] || '给用户的 Canva 设计';
        return { designType: '社交媒体图片', title, prompt: title };
    }
    if (parts.length === 2) {
        return {
            designType: parts[0],
            title: parts[1],
            prompt: parts[1],
        };
    }

    const designType = parts[0] || '社交媒体图片';
    const title = parts[1] || '给用户的 Canva 设计';
    const style = parts.length >= 4 ? parts[parts.length - 1] : undefined;
    const promptEnd = style ? parts.length - 1 : parts.length;
    const prompt = parts.slice(2, promptEnd).join(' | ') || title;
    return { designType, title, prompt, style };
};

const parseExportArgs = (raw: string): { designId: string; format: string } => {
    const parts = splitActionArgs(raw);
    return {
        designId: parts[0] || raw.trim(),
        format: parts[1] || 'png',
    };
};

const saveCanvaCard = async (
    ctx: HandlerContext,
    design: CanvaDesignSummary,
    fallbackContent: string,
): Promise<void> => {
    await DB.saveMessage({
        charId: ctx.char.id,
        role: 'assistant',
        type: 'canva_card' as any,
        content: fallbackContent,
        metadata: { canvaDesign: design },
    });
    ctx.setMessages(await DB.getRecentMessagesByCharId(ctx.char.id, 200));
};

const runCanvaSecondPass = async (
    ctx: HandlerContext,
    aiContent: string,
    systemEvent: string,
    marker: string,
): Promise<string> => {
    const cleaned = stripCanvaTags(aiContent) || '等我一下。';
    const messages = [
        ...ctx.fullMessages,
        { role: 'assistant', content: cleaned },
        {
            role: 'user',
            content: `[系统: ${systemEvent}

请你继续自然回复用户：
1. 先接住用户刚才的情绪和需求。
2. 可以轻轻提到你已经把 Canva 设计草稿/搜索结果/导出结果准备好了。
3. 不要复述工具参数，不要解释 MCP，不要再输出 CANVA_* 标记。]`,
        },
    ];

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
    ctx.updateTokenUsage(data, ctx.historyMsgCount, marker);
    return ChatParser.cleanAiSecondPass(data.choices?.[0]?.message?.content || cleaned);
};

export async function handleCanvaActions(aiContent: string, ctx: HandlerContext): Promise<string> {
    if (!/\[\[CANVA_(?:CREATE|SEARCH|EXPORT)\s*[:：]/i.test(aiContent)) {
        return aiContent;
    }

    const { enabled, serverUrl } = getCanvaConfig(ctx);
    if (!enabled) {
        return stripCanvaTags(aiContent);
    }

    try {
        const createMatch = aiContent.match(/\[\[CANVA_CREATE\s*[:：]\s*([\s\S]*?)\]\]/i);
        if (createMatch) {
            const args = parseCreateArgs(createMatch[1]);
            ctx.setSearchStatus?.('正在让 Canva 生成设计...');
            const result = await CanvaMcpClient.generateDesign(serverUrl, args);
            if (!result.success || !result.design) {
                ctx.addToast(`Canva 创建设计失败：${result.error || '未知错误'}`, 'error');
                return stripCanvaTags(aiContent);
            }

            await saveCanvaCard(
                ctx,
                result.design,
                `[Canva 设计草稿] ${result.design.title}`,
            );
            ctx.addToast(`${ctx.char.name} 准备了一张 Canva 设计`, 'info');
            return await runCanvaSecondPass(
                ctx,
                aiContent,
                `你刚刚用 Canva 创建了一张设计草稿：${result.design.title}${result.design.url ? `。链接：${result.design.url}` : ''}`,
                'canva-create',
            );
        }

        const searchMatch = aiContent.match(/\[\[CANVA_SEARCH\s*[:：]\s*([\s\S]*?)\]\]/i);
        if (searchMatch) {
            const query = searchMatch[1].trim();
            ctx.setSearchStatus?.(`正在搜索 Canva: ${query}...`);
            const result = await CanvaMcpClient.searchDesigns(serverUrl, query);
            if (!result.success || !result.designs?.length) {
                ctx.addToast(`Canva 搜索失败：${result.error || '没有找到设计'}`, 'error');
                return stripCanvaTags(aiContent);
            }

            const [firstDesign] = result.designs;
            await saveCanvaCard(
                ctx,
                firstDesign,
                `[Canva 搜索结果] ${firstDesign.title}`,
            );
            return await runCanvaSecondPass(
                ctx,
                aiContent,
                `你在 Canva 中搜索了「${query}」，并找到了 ${result.designs.length} 个相关设计。第一个结果是：${firstDesign.title}${firstDesign.url ? `。链接：${firstDesign.url}` : ''}`,
                'canva-search',
            );
        }

        const exportMatch = aiContent.match(/\[\[CANVA_EXPORT\s*[:：]\s*([\s\S]*?)\]\]/i);
        if (exportMatch) {
            const args = parseExportArgs(exportMatch[1]);
            if (!args.designId) return stripCanvaTags(aiContent);

            ctx.setSearchStatus?.('正在导出 Canva 设计...');
            const result = await CanvaMcpClient.exportDesign(serverUrl, args.designId, args.format);
            if (!result.success || !result.design) {
                ctx.addToast(`Canva 导出失败：${result.error || '未知错误'}`, 'error');
                return stripCanvaTags(aiContent);
            }

            await saveCanvaCard(
                ctx,
                result.design,
                `[Canva 导出结果] ${result.design.title}`,
            );
            return await runCanvaSecondPass(
                ctx,
                aiContent,
                `你刚刚导出了 Canva 设计 ${args.designId}，格式为 ${args.format}${result.design.exportUrl ? `。下载链接：${result.design.exportUrl}` : ''}`,
                'canva-export',
            );
        }

        return stripCanvaTags(aiContent);
    } catch (error: any) {
        console.error('[Canva] action failed:', error);
        ctx.addToast(`Canva 动作失败：${error?.message || '未知错误'}`, 'error');
        return stripCanvaTags(aiContent);
    } finally {
        ctx.setSearchStatus?.('');
    }
}
