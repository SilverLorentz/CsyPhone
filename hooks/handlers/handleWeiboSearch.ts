import { ChatParser } from '../../utils/chatParser';
import { buildBackendUrl, getBackendUrl } from '../../utils/backendClient';
import { safeFetchJson } from '../../utils/safeApi';
import type { HandlerContext } from './types';

export async function handleWeiboSearch(aiContent: string, ctx: HandlerContext): Promise<string> {
    try {
        const weiboSearchMatch = aiContent.match(/\[\[WEIBO_SEARCH:\s*(.+?)\]\]/);
        if (weiboSearchMatch && ctx.realtimeConfig?.hotSearchEnabled) {
            const weiboQuery = weiboSearchMatch[1].trim();
            console.log('📱 [WeiboSearch] AI触发微博搜索:', weiboQuery);
            ctx.setWeiboStatus?.(`正在刷微博: ${weiboQuery}...`);

            try {
                if (!getBackendUrl()) {
                    console.log('📱 [WeiboSearch] Backend URL missing, skipping');
                    ctx.setWeiboStatus?.('');
                    throw new Error('Backend URL not configured');
                }

                const wbRes = await safeFetchJson(buildBackendUrl('/api/public/weibo/search', { q: weiboQuery }), {});
                console.log('📱 [WeiboSearch] 搜索结果:', wbRes);

                if (wbRes.success && wbRes.posts && wbRes.posts.length > 0) {
                    const postsStr = wbRes.posts
                        .slice(0, 8)
                        .map(
                            (post: any, index: number) =>
                                `${index + 1}. @${post.user}: "${post.text}" (转发${post.reposts} 评论${post.comments} 赞${post.likes}${post.created_at ? ` · ${post.created_at}` : ''})`,
                        )
                        .join('\n\n');

                    const cleanedForWeibo =
                        aiContent.replace(/\[\[WEIBO_SEARCH:.*?\]\]/g, '').trim() || '等一下，我搜搜微博...';
                    const weiboMessages = [
                        ...ctx.fullMessages,
                        { role: 'assistant', content: cleanedForWeibo },
                        {
                            role: 'user',
                            content: `[系统: 你刚在微博上搜索了"${weiboQuery}"，以下是你看到的真实微博帖子]\n\n${postsStr}\n\n[系统: 现在请根据这些真实微博内容自然回复。像和朋友一起刷手机分享一样，比如"我刚看到有人说..."、"微博上好多人在讨论..."、"哈哈笑死有个人写的..."。用你自己的说话风格。不要再输出[[WEIBO_SEARCH:...]]了。]`,
                        },
                    ];

                    const data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                        method: 'POST',
                        headers: ctx.headers,
                        body: JSON.stringify({
                            model: ctx.apiConfig.model,
                            messages: weiboMessages,
                            temperature: 0.85,
                            stream: false,
                        }),
                    });
                    ctx.updateTokenUsage(data, ctx.historyMsgCount, 'weibo-search');
                    aiContent = ChatParser.cleanAiSecondPass(data.choices?.[0]?.message?.content || '');
                    ctx.addToast(`📱 微博搜索完成: ${weiboQuery}`, 'success');
                } else {
                    console.log('📱 [WeiboSearch] 搜索失败或无结果:', wbRes.error || '无帖子');
                    ctx.addToast(`微博搜索无结果: ${weiboQuery}`, 'info');
                    aiContent = aiContent.replace(weiboSearchMatch[0], '').trim();
                }
            } catch (error) {
                console.error('📱 [WeiboSearch] execution failed:', error);
                aiContent = aiContent.replace(weiboSearchMatch[0], '').trim();
            }
        } else if (weiboSearchMatch) {
            console.log('📱 [WeiboSearch] 检测到微博搜索意图但热搜未开启');
            aiContent = aiContent.replace(weiboSearchMatch[0], '').trim();
        }

        ctx.setWeiboStatus?.('');
        return aiContent.replace(/\[\[WEIBO_SEARCH:.*?\]\]/g, '').trim();
    } catch (weiboStageErr) {
        console.error('📫 [WeiboSearch] Stage failed:', weiboStageErr);
        ctx.setWeiboStatus?.('');
        return aiContent.replace(/\[\[WEIBO_SEARCH:.*?\]\]/g, '').trim();
    }
}
