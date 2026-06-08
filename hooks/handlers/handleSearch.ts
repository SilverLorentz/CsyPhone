import { ChatParser } from '../../utils/chatParser';
import { safeFetchJson } from '../../utils/safeApi';
import { RealtimeContextManager } from '../../utils/realtimeContext';
import type { HandlerContext } from './types';

export async function handleSearch(aiContent: string, ctx: HandlerContext): Promise<string> {
    try {
        const searchMatch = aiContent.match(/\[\[SEARCH:\s*(.+?)\]\]/);
        if (searchMatch && ctx.realtimeConfig?.newsEnabled && ctx.realtimeConfig?.newsApiKey) {
            const searchQuery = searchMatch[1].trim();
            console.log('🔍 [Search] AI触发搜索:', searchQuery);
            ctx.setSearchStatus?.(`正在搜索: ${searchQuery}...`);

            try {
                const searchResult = await RealtimeContextManager.performSearch(
                    searchQuery,
                    ctx.realtimeConfig.newsApiKey,
                );
                console.log('🔍 [Search] 搜索结果:', searchResult);

                if (searchResult.success && searchResult.results.length > 0) {
                    const resultsStr = searchResult.results
                        .map((result, index) => `${index + 1}. ${result.title}\n   ${result.description}`)
                        .join('\n\n');

                    const cleanedForSearch = aiContent.replace(/\[\[SEARCH:.*?\]\]/g, '').trim() || '让我搜一下...';
                    const searchMessages = [
                        ...ctx.fullMessages,
                        { role: 'assistant', content: cleanedForSearch },
                        {
                            role: 'user',
                            content: `[系统: 搜索完成！以下是关于"${searchQuery}"的搜索结果]\n\n${resultsStr}\n\n[系统: 现在请根据这些真实信息回复用户。用自然的语气分享，比如"我刚搜了一下发现..."、"诶我看到说..."。不要再输出[[SEARCH:...]]了。]`,
                        },
                    ];

                    const data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                        method: 'POST',
                        headers: ctx.headers,
                        body: JSON.stringify({
                            model: ctx.apiConfig.model,
                            messages: searchMessages,
                            temperature: 0.8,
                            stream: false,
                        }),
                    });
                    ctx.updateTokenUsage(data, ctx.historyMsgCount, 'search');
                    aiContent = ChatParser.cleanAiSecondPass(data.choices?.[0]?.message?.content || '');
                    ctx.addToast(`🔍 搜索完成: ${searchQuery}`, 'success');
                } else {
                    console.log('🔍 [Search] 搜索失败或无结果:', searchResult.message);
                    ctx.addToast(`搜索失败: ${searchResult.message}`, 'error');
                    aiContent = aiContent.replace(searchMatch[0], '').trim();
                }
            } catch (error) {
                console.error('Search execution failed:', error);
                aiContent = aiContent.replace(searchMatch[0], '').trim();
            }
        } else if (searchMatch) {
            console.log('🔍 [Search] 检测到搜索意图但未配置API Key');
            aiContent = aiContent.replace(searchMatch[0], '').trim();
        }

        ctx.setSearchStatus?.('');
        return aiContent.replace(/\[\[SEARCH:.*?\]\]/g, '').trim();
    } catch (searchStageErr) {
        console.error('🔍 [Search] Stage failed:', searchStageErr);
        ctx.setSearchStatus?.('');
        return aiContent.replace(/\[\[SEARCH:.*?\]\]/g, '').trim();
    }
}
