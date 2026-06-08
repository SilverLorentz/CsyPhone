
/**
 * xhsProcessor.ts — XHS (Xiaohongshu / 小红书) action processor
 *
 * Extracted from useChatAI.ts to isolate the ~700 lines of XHS command
 * parsing and execution. This is a pure async function (not a Hook);
 * all state setters and caches are passed in via context.
 */

import { Message,RealtimeConfig } from '../types';
import { DB } from '../utils/db';
import { ChatParser } from '../utils/chatParser';
import { XhsNote } from '../utils/realtimeContext';
import { XhsMcpClient,extractNotesFromMcpData,normalizeNote } from '../utils/xhsMcpClient';
import { safeFetchJson } from '../utils/safeApi';
import {
  resolveXhsConfig,xhsSearch,xhsBrowse,xhsPublish,
  xhsComment,xhsLike,xhsFavorite,xhsReplyComment
} from './xhsHelpers';

// ─── Types ────────────────────────────────────────────────────────

export interface XhsProcessorContext {
    charId: string;
    charName: string;
    realtimeConfig?: RealtimeConfig;
    fullMessages: any[];
    apiConfig: { baseUrl: string; model: string; apiKey?: string };
    headers: Record<string, string>;
    addToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    setMessages: (msgs: Message[]) => void;
    setXhsStatus: (s: string) => void;
    updateTokenUsage: (data: any, msgCount: number, pass: string) => void;
    historyMsgCount: number;
    // Token caches (passed by ref from parent hook)
    xsecTokenCache: Map<string, string>;
    noteTitleCache: Map<string, string>;
    commentUserIdCache: Map<string, string>;
    commentAuthorNameCache: Map<string, string>;
    commentParentIdCache: Map<string, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Store xsecToken + title into the persistent caches */
function cacheXsecTokens(notes: XhsNote[], ctx: XhsProcessorContext) {
    for (const n of notes) {
        if (n.noteId && n.xsecToken) ctx.xsecTokenCache.set(n.noteId, n.xsecToken);
        if (n.noteId && n.title) ctx.noteTitleCache.set(n.noteId, n.title);
    }
}

/** Lookup xsecToken from local notes array or cache */
function findXsecToken(noteId: string, lastXhsNotes: XhsNote[], ctx: XhsProcessorContext): string | undefined {
    return lastXhsNotes.find(n => n.noteId === noteId)?.xsecToken
        || ctx.xsecTokenCache.get(noteId);
}

/** Format notes array into a string for AI prompt injection */
function formatNotesStr(notes: XhsNote[]): string {
    return notes.map((n, i) =>
        `${i + 1}. [noteId=${n.noteId}]「${n.title}」by ${n.author} (${n.likes}赞)\n   ${n.desc || '（无描述）'}`
    ).join('\n\n');
}

/** Make a second-pass API call and clean the result */
async function secondPassApiCall(
    ctx: XhsProcessorContext,
    messages: any[],
    passLabel: string
): Promise<string> {
    const baseUrl = ctx.apiConfig.baseUrl.replace(/\/+$/, '');
    const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: ctx.headers,
        body: JSON.stringify({ model: ctx.apiConfig.model, messages, temperature: 0.8, stream: false })
    });
    ctx.updateTokenUsage(data, ctx.historyMsgCount, passLabel);
    let content = data.choices?.[0]?.message?.content || '';
    content = ChatParser.cleanAiSecondPass(content);
    return content;
}

// ─── Interaction Sub-processors ───────────────────────────────────
// These handle COMMENT / REPLY / LIKE / FAV / POST / SHARE.
// They are called twice: once in the first round, once after DETAIL/PROFILE.

async function processComment(
    aiContent: string, xhsConf: ReturnType<typeof resolveXhsConfig>,
    lastXhsNotes: XhsNote[], ctx: XhsProcessorContext, round: string
): Promise<string> {
    const match = aiContent.match(/\[\[XHS_COMMENT:\s*(.+?)\]\]/);
    if (match && xhsConf.enabled) {
        const raw = match[1].trim();
        const sepIdx = raw.indexOf('|');
        if (sepIdx > 0) {
            const noteId = raw.slice(0, sepIdx).trim();
            const commentContent = raw.slice(sepIdx + 1).trim();
            const xsecToken = findXsecToken(noteId, lastXhsNotes, ctx);
            console.log(`📕 [XHS] AI要评论笔记(${round}):`, noteId, commentContent.slice(0, 30), xsecToken ? '(有xsecToken)' : '(无xsecToken)');
            ctx.setXhsStatus('正在评论...');
            try {
                const result = await xhsComment(xhsConf, noteId, commentContent, xsecToken);
                if (result.success) {
                    await DB.saveMessage({
                        charId: ctx.charId, role: 'system', type: 'text',
                        content: `📕 ${ctx.charName}在小红书评论了: "${commentContent.slice(0, 100)}${commentContent.length > 100 ? '...' : ''}"`
                    });
                    ctx.addToast(`📕 ${ctx.charName}在小红书留了评论`, 'success');
                } else {
                    ctx.addToast(`评论失败: ${result.message}`, 'error');
                }
            } catch (e) { console.error(`📕 [XHS] 评论异常(${round}):`, e); }
        }
        ctx.setXhsStatus('');
    }
    return aiContent.replace(/\[\[XHS_COMMENT:.*?\]\]/g, '').trim();
}

async function processReply(
    aiContent: string, xhsConf: ReturnType<typeof resolveXhsConfig>,
    lastXhsNotes: XhsNote[], ctx: XhsProcessorContext, round: string
): Promise<string> {
    const match = aiContent.match(/\[\[XHS_REPLY:\s*(.+?)\]\]/);
    if (match && xhsConf.enabled) {
        const parts = match[1].split('|').map((s: string) => s.trim());
        if (parts.length >= 3) {
            const [noteId, commentId, ...replyParts] = parts;
            const replyContent = replyParts.join('|').trim();
            const xsecToken = findXsecToken(noteId, lastXhsNotes, ctx);
            const commentUserId = ctx.commentUserIdCache.get(commentId);
            const commentAuthorName = ctx.commentAuthorNameCache.get(commentId);
            const parentCommentId = ctx.commentParentIdCache.get(commentId);
            if (xsecToken && replyContent) {
                console.log(`📕 [XHS] AI要回复评论(${round}):`, noteId, commentId, replyContent.slice(0, 30),
                    commentUserId ? `(userId=${commentUserId})` : '(无userId)',
                    commentAuthorName ? `(author=${commentAuthorName})` : '',
                    parentCommentId ? `(parentId=${parentCommentId})` : '(顶级评论)');
                ctx.setXhsStatus('正在回复评论...');
                try {
                    let result = await xhsReplyComment(xhsConf, noteId, xsecToken, replyContent, commentId, commentUserId, parentCommentId);
                    const selectorBroken = !result.success && result.message?.includes('未找到评论');
                    if (selectorBroken) {
                        console.warn(`📕 [XHS] 回复失败(${round})(DOM选择器不匹配)，跳过重试直接降级:`, result.message);
                    } else {
                        const replyRetries = [3000, 4000, 5000];
                        for (let i = 0; i < replyRetries.length && !result.success; i++) {
                            console.warn(`📕 [XHS] 回复失败(${round})(${i + 1}/${replyRetries.length})，${replyRetries[i] / 1000}秒后重试:`, result.message);
                            await new Promise(r => setTimeout(r, replyRetries[i]));
                            result = await xhsReplyComment(xhsConf, noteId, xsecToken, replyContent, commentId, commentUserId, parentCommentId);
                        }
                    }
                    if (result.success) {
                        ctx.addToast(`📕 ${ctx.charName}回复了一条评论`, 'success');
                    } else {
                        console.warn(`📕 [XHS] 回复失败(${round})，降级为 @提及 评论:`, result.message);
                        const fallbackContent = commentAuthorName ? `@${commentAuthorName} ${replyContent}` : replyContent;
                        let fallback = await xhsComment(xhsConf, noteId, fallbackContent, xsecToken);
                        if (!fallback.success) {
                            console.warn(`📕 [XHS] 顶级评论也失败(${round})，3秒后重试:`, fallback.message);
                            await new Promise(r => setTimeout(r, 3000));
                            fallback = await xhsComment(xhsConf, noteId, fallbackContent, xsecToken);
                        }
                        if (fallback.success) {
                            ctx.addToast(`📕 ${ctx.charName}评论了一条笔记（@提及回复）`, 'success');
                        } else {
                            ctx.addToast(`回复失败: ${result.message}`, 'error');
                        }
                    }
                } catch (e) { console.error(`📕 [XHS] 回复异常(${round}):`, e); }
                ctx.setXhsStatus('');
            } else {
                console.warn(`📕 [XHS] 回复缺少 xsecToken 或内容(${round})`);
            }
        }
    }
    return aiContent.replace(/\[\[XHS_REPLY:.*?\]\]/g, '').trim();
}

async function processLike(
    aiContent: string, xhsConf: ReturnType<typeof resolveXhsConfig>,
    lastXhsNotes: XhsNote[], ctx: XhsProcessorContext, round: string
): Promise<string> {
    const matches = aiContent.matchAll(/\[\[XHS_LIKE:\s*(.+?)\]\]/g);
    for (const m of matches) {
        if (xhsConf.enabled) {
            const noteId = m[1].trim();
            const xsecToken = findXsecToken(noteId, lastXhsNotes, ctx);
            if (xsecToken) {
                console.log(`📕 [XHS] AI要点赞笔记(${round}):`, noteId);
                try {
                    const result = await xhsLike(xhsConf, noteId, xsecToken);
                    if (result.success) ctx.addToast(`📕 ${ctx.charName}点赞了一条笔记`, 'success');
                    else console.warn(`📕 [XHS] 点赞失败(${round}):`, result.message);
                } catch (e) { console.error(`📕 [XHS] 点赞异常(${round}):`, e); }
            } else {
                console.warn(`📕 [XHS] 点赞缺少 xsecToken(${round}), noteId:`, noteId);
            }
        }
    }
    return aiContent.replace(/\[\[XHS_LIKE:.*?\]\]/g, '').trim();
}

async function processFavorite(
    aiContent: string, xhsConf: ReturnType<typeof resolveXhsConfig>,
    lastXhsNotes: XhsNote[], ctx: XhsProcessorContext, round: string
): Promise<string> {
    const matches = aiContent.matchAll(/\[\[XHS_FAV:\s*(.+?)\]\]/g);
    for (const m of matches) {
        if (xhsConf.enabled) {
            const noteId = m[1].trim();
            const xsecToken = findXsecToken(noteId, lastXhsNotes, ctx);
            if (xsecToken) {
                console.log(`📕 [XHS] AI要收藏笔记(${round}):`, noteId);
                try {
                    const result = await xhsFavorite(xhsConf, noteId, xsecToken);
                    if (result.success) ctx.addToast(`📕 ${ctx.charName}收藏了一条笔记`, 'success');
                    else console.warn(`📕 [XHS] 收藏失败(${round}):`, result.message);
                } catch (e) { console.error(`📕 [XHS] 收藏异常(${round}):`, e); }
            } else {
                console.warn(`📕 [XHS] 收藏缺少 xsecToken(${round}), noteId:`, noteId);
            }
        }
    }
    return aiContent.replace(/\[\[XHS_FAV:.*?\]\]/g, '').trim();
}

async function processPost(
    aiContent: string, xhsConf: ReturnType<typeof resolveXhsConfig>,
    ctx: XhsProcessorContext, round: string
): Promise<string> {
    const match = aiContent.match(/\[\[XHS_POST:\s*(.+?)\]\]/s);
    if (match && xhsConf.enabled) {
        const postRaw = match[1].trim();
        const parts = postRaw.split('|').map((p: string) => p.trim());
        const postTitle = parts[0] || '';
        const postContent = parts[1] || '';
        const postTags = (parts[2] || '').match(/#(\S+)/g)?.map((t: string) => t.replace('#', '')) || [];
        console.log(`📕 [XHS] AI要发小红书(${round}):`, postTitle);
        ctx.setXhsStatus(`正在发布小红书: ${postTitle}...`);
        try {
            const result = await xhsPublish(xhsConf, postTitle, postContent, postTags);
            if (result.success) {
                console.log(`📕 [XHS] 发布成功(${round}):`, result.noteId);
                const tagsStr = postTags.length > 0 ? ` #${postTags.join(' #')}` : '';
                await DB.saveMessage({
                    charId: ctx.charId, role: 'system', type: 'text',
                    content: `📕 ${ctx.charName}发了一条小红书「${postTitle}」\n${postContent.slice(0, 200)}${postContent.length > 200 ? '...' : ''}${tagsStr}`
                });
                ctx.addToast(`📕 ${ctx.charName}发了一条小红书!`, 'success');
            } else {
                console.error(`📕 [XHS] 发布失败(${round}):`, result.message);
                ctx.addToast(`小红书发布失败: ${result.message}`, 'error');
            }
        } catch (e) { console.error(`📕 [XHS] 发布异常(${round}):`, e); }
        ctx.setXhsStatus('');
    }
    return aiContent.replace(/\[\[XHS_POST:.*?\]\]/gs, '').trim();
}

async function processShare(
    aiContent: string, lastXhsNotes: XhsNote[], ctx: XhsProcessorContext
): Promise<string> {
    const matches = aiContent.matchAll(/\[\[XHS_SHARE:\s*(\d+)\]\]/g);
    for (const m of matches) {
        const idx = parseInt(m[1]) - 1;
        if (idx >= 0 && idx < lastXhsNotes.length) {
            const note = lastXhsNotes[idx];
            console.log('📕 [XHS] AI分享笔记卡片:', note.title);
            await DB.saveMessage({
                charId: ctx.charId, role: 'assistant', type: 'xhs_card',
                content: note.title || '小红书笔记',
                metadata: { xhsNote: note }
            });
            ctx.setMessages(await DB.getRecentMessagesByCharId(ctx.charId, 200));
        }
    }
    return aiContent.replace(/\[\[XHS_SHARE:\s*\d+\]\]/g, '').trim();
}

/** Run all interaction sub-processors in sequence (REPLY before LIKE/FAV) */
async function processXhsInteractions(
    aiContent: string, xhsConf: ReturnType<typeof resolveXhsConfig>,
    lastXhsNotes: XhsNote[], ctx: XhsProcessorContext, round: string
): Promise<string> {
    aiContent = await processComment(aiContent, xhsConf, lastXhsNotes, ctx, round);
    // ⚠️ REPLY must run before LIKE/FAV — like_feed changes MCP browser state
    aiContent = await processReply(aiContent, xhsConf, lastXhsNotes, ctx, round);
    aiContent = await processLike(aiContent, xhsConf, lastXhsNotes, ctx, round);
    aiContent = await processFavorite(aiContent, xhsConf, lastXhsNotes, ctx, round);
    aiContent = await processPost(aiContent, xhsConf, ctx, round);
    return aiContent;
}

// ─── Main Entry Point ─────────────────────────────────────────────

/**
 * Process all XHS tags in AI content.
 * Returns cleaned aiContent with all XHS tags removed.
 */
export async function processXhsActions(
    aiContent: string,
    ctx: XhsProcessorContext,
    char: { id: string; xhsEnabled?: boolean }
): Promise<string> {
    const xhsConf = resolveXhsConfig(char as any, ctx.realtimeConfig);
    let lastXhsNotes: XhsNote[] = [];

    // ── [[XHS_SEARCH: 关键词]] ─────────────────────────────────
    const xhsSearchMatch = aiContent.match(/\[\[XHS_SEARCH:\s*(.+?)\]\]/);
    if (xhsSearchMatch && xhsConf.enabled) {
        const keyword = xhsSearchMatch[1].trim();
        console.log(`📕 [XHS] AI想搜索小红书:`, keyword);
        ctx.setXhsStatus(`正在小红书搜索: ${keyword}...`);
        try {
            const result = await xhsSearch(xhsConf, keyword);
            if (result.success && result.notes.length > 0) {
                lastXhsNotes = result.notes;
                cacheXsecTokens(result.notes, ctx);
                const notesStr = formatNotesStr(result.notes);
                const cleanedForXhs = aiContent.replace(/\[\[XHS_SEARCH:.*?\]\]/g, '').trim() || '让我去小红书看看...';
                const xhsMessages = [
                    ...ctx.fullMessages,
                    { role: 'assistant', content: cleanedForXhs },
                    { role: 'user', content: `[系统: 你在小红书搜索了"${keyword}"，以下是搜索结果]\n\n${notesStr}\n\n[系统: 你已经看完了搜索结果（注意：以上只是摘要，想看某条笔记的完整正文可以用 [[XHS_DETAIL: noteId]]）。现在请你：\n1. 自然地分享你看到的内容，比如"我刚在小红书搜了一下..."、"诶小红书上有人说..."\n2. 可以评价、吐槽、分享感兴趣的内容\n3. 如果觉得某条笔记特别值得分享，可以用 [[XHS_SHARE: 序号]] 把它作为卡片分享给用户（序号从1开始），可以分享多条\n4. 如果想评论某条笔记，可以用 [[XHS_COMMENT: noteId | 评论内容]]\n5. 如果喜欢某条笔记，可以用 [[XHS_LIKE: noteId]] 点赞，[[XHS_FAV: noteId]] 收藏\n6. 如果想看某条笔记的完整内容和评论区，可以用 [[XHS_DETAIL: noteId]]\n7. 严禁再输出[[XHS_SEARCH:...]]标记]` }
                ];
                aiContent = await secondPassApiCall(ctx, xhsMessages, 'xhs-search');
                await DB.saveMessage({
                    charId: ctx.charId, role: 'system', type: 'text',
                    content: `📕 ${ctx.charName}在小红书搜索了「${keyword}」，看了 ${result.notes.length} 条笔记`
                });
                ctx.addToast(`📕 ${ctx.charName}搜索了小红书: ${keyword}`, 'info');
            } else {
                console.log('📕 [XHS] 搜索无结果:', result.message);
                aiContent = aiContent.replace(xhsSearchMatch[0], '').trim();
            }
        } catch (e) {
            console.error('📕 [XHS] 搜索异常:', e);
            aiContent = aiContent.replace(xhsSearchMatch[0], '').trim();
        }
        ctx.setXhsStatus('');
    } else if (xhsSearchMatch) {
        aiContent = aiContent.replace(xhsSearchMatch[0], '').trim();
    }
    aiContent = aiContent.replace(/\[\[XHS_SEARCH:.*?\]\]/g, '').trim();

    // ── [[XHS_BROWSE]] ─────────────────────────────────────────
    const xhsBrowseMatch = aiContent.match(/\[\[XHS_BROWSE(?::\s*(.+?))?\]\]/);
    if (xhsBrowseMatch && xhsConf.enabled) {
        const category = xhsBrowseMatch[1]?.trim();
        console.log(`📕 [XHS] AI想刷小红书:`, category || '首页推荐');
        ctx.setXhsStatus('正在刷小红书...');
        try {
            const result = await xhsBrowse(xhsConf);
            console.log('📕 [XHS] 浏览结果:', result.success, result.message, result.notes?.length || 0);
            if (result.success && result.notes.length > 0) {
                lastXhsNotes = result.notes;
                cacheXsecTokens(result.notes, ctx);
                const notesStr = formatNotesStr(result.notes);
                const cleanedForXhs = aiContent.replace(/\[\[XHS_BROWSE(?::.*?)?\]\]/g, '').trim() || '让我刷刷小红书...';
                const xhsMessages = [
                    ...ctx.fullMessages,
                    { role: 'assistant', content: cleanedForXhs },
                    { role: 'user', content: `[系统: 你刷了一会儿小红书首页，以下是你看到的内容]\n\n${notesStr}\n\n[系统: 你已经看完了（注意：以上只是摘要，想看某条笔记的完整正文可以用 [[XHS_DETAIL: noteId]]）。现在请你：\n1. 像在跟朋友分享一样，随意聊聊你看到了什么有趣的\n2. 不用全部都提，挑你感兴趣的1-3条聊就行\n3. 可以吐槽、感叹、分享想法\n4. 如果觉得某条笔记特别值得分享，可以用 [[XHS_SHARE: 序号]] 把它作为卡片分享给用户（序号从1开始），可以分享多条\n5. 如果想发一条自己的笔记，可以用 [[XHS_POST: 标题 | 内容 | #标签1 #标签2]]\n6. 如果喜欢某条笔记，可以用 [[XHS_LIKE: noteId]] 点赞，[[XHS_FAV: noteId]] 收藏\n7. 如果想看某条笔记的完整内容和评论区，可以用 [[XHS_DETAIL: noteId]]\n8. 严禁再输出[[XHS_BROWSE]]标记]` }
                ];
                aiContent = await secondPassApiCall(ctx, xhsMessages, 'xhs-browse');
                ctx.addToast(`📕 ${ctx.charName}刷了会儿小红书`, 'info');
            } else {
                aiContent = aiContent.replace(xhsBrowseMatch[0], '').trim();
            }
        } catch (e) {
            console.error('📕 [XHS] 浏览异常:', e);
            aiContent = aiContent.replace(xhsBrowseMatch[0], '').trim();
        }
        ctx.setXhsStatus('');
    } else if (xhsBrowseMatch) {
        aiContent = aiContent.replace(xhsBrowseMatch[0], '').trim();
    }
    aiContent = aiContent.replace(/\[\[XHS_BROWSE(?::.*?)?\]\]/g, '').trim();

    // ── [[XHS_SHARE: 序号]] ───────────────────────────────────
    aiContent = await processShare(aiContent, lastXhsNotes, ctx);

    // ── First-round interactions (COMMENT/REPLY/LIKE/FAV/POST) ─
    aiContent = await processXhsInteractions(aiContent, xhsConf, lastXhsNotes, ctx, '1st');

    // ── [[XHS_MY_PROFILE]] ────────────────────────────────────
    const xhsProfileMatch = aiContent.match(/\[\[XHS_MY_PROFILE\]\]/);
    if (xhsProfileMatch && xhsConf.enabled) {
        console.log(`📕 [XHS] AI要查看自己的主页`);
        ctx.setXhsStatus('正在查看小红书主页...');
        try {
            const nickname = xhsConf.loggedInNickname || '';
            const userId = xhsConf.loggedInUserId || '';
            let profileStr = '';
            let feedsStr = '（获取笔记失败）';
            let gotProfile = false;

            if (userId) {
                console.log(`📕 [XHS] 用 getUserProfile(${userId}) 获取主页...`);
                ctx.setXhsStatus('正在获取主页信息...');
                try {
                    const profileResult = await XhsMcpClient.getUserProfile(xhsConf.mcpUrl, userId);
                    if (profileResult.success && profileResult.data) {
                        const d = profileResult.data;
                        if (typeof d === 'string') {
                            profileStr = d.slice(0, 3000);
                            gotProfile = true;
                        } else {
                            profileStr = JSON.stringify(d, null, 2).slice(0, 3000);
                            gotProfile = true;
                            const notes = extractNotesFromMcpData(d);
                            if (notes.length > 0) {
                                const normalized = notes.map(n => normalizeNote(n) as XhsNote);
                                lastXhsNotes = normalized;
                                cacheXsecTokens(normalized, ctx);
                                feedsStr = formatNotesStr(normalized.slice(0, 8));
                            }
                        }
                        console.log(`📕 [XHS] getUserProfile 成功，数据长度: ${profileStr.length}`);
                    }
                } catch (e) {
                    console.warn('📕 [XHS] getUserProfile 失败，降级到搜索:', e);
                }
            }

            if (!gotProfile && nickname) {
                console.log(`📕 [XHS] 降级: 用昵称「${nickname}」搜索...`);
                ctx.setXhsStatus('正在搜索你的笔记...');
                const searchResult = await xhsSearch(xhsConf, nickname);
                if (searchResult.success && searchResult.notes.length > 0) {
                    lastXhsNotes = searchResult.notes;
                    cacheXsecTokens(searchResult.notes, ctx);
                    feedsStr = formatNotesStr(searchResult.notes.slice(0, 8));
                } else {
                    feedsStr = '（没有搜到相关笔记）';
                }
            }

            if (!nickname && !userId) {
                console.warn('📕 [XHS] 无昵称也无userId，无法查看主页。请在设置中填写。');
                feedsStr = '（无法获取主页：请在设置-小红书MCP中填写你的昵称或用户ID）';
            }

            const profileSection = gotProfile ? `\n\n你的主页信息:\n${profileStr}` : '';
            const cleanedForXhs = aiContent.replace(/\[\[XHS_MY_PROFILE\]\]/g, '').trim() || '让我看看我的小红书...';
            const xhsMessages = [
                ...ctx.fullMessages,
                { role: 'assistant', content: cleanedForXhs },
                { role: 'user', content: `[系统: 你打开了自己的小红书]\n\n你的小红书账号昵称: ${nickname || '未知'}${userId ? ` (userId: ${userId})` : ''}${profileSection}\n\n${gotProfile ? '你的笔记' : `搜索「${nickname}」找到的相关笔记`}:\n${feedsStr}\n\n[系统: ${gotProfile ? '以上是你的主页数据。' : '注意，搜索结果可能包含别人的帖子，你需要辨别哪些是你自己发的（看作者名字）。'}现在请你：\n1. 自然地聊聊你看到了什么，"我看了看我的小红书..."、"我之前发的那个帖子..."\n2. 如果想发新笔记，可以用 [[XHS_POST: 标题 | 内容 | #标签1 #标签2]]\n3. 如果想看某条笔记的详细内容，可以用 [[XHS_DETAIL: noteId]]\n4. 严禁再输出[[XHS_MY_PROFILE]]标记]` }
            ];
            aiContent = await secondPassApiCall(ctx, xhsMessages, 'xhs-profile');
            ctx.addToast(`📕 ${ctx.charName}看了看自己的小红书`, 'info');
        } catch (e) {
            console.error('📕 [XHS] 查看主页异常:', e);
            aiContent = aiContent.replace(xhsProfileMatch[0], '').trim();
        }
        ctx.setXhsStatus('');
    } else if (xhsProfileMatch) {
        aiContent = aiContent.replace(xhsProfileMatch[0], '').trim();
    }
    aiContent = aiContent.replace(/\[\[XHS_MY_PROFILE\]\]/g, '').trim();

    // ── [[XHS_DETAIL: noteId]] ────────────────────────────────
    const xhsDetailMatch = aiContent.match(/\[\[XHS_DETAIL:\s*(.+?)\]\]/);
    if (xhsDetailMatch && xhsConf.enabled) {
        const noteId = xhsDetailMatch[1].trim();
        let xsecToken = findXsecToken(noteId, lastXhsNotes, ctx);
        console.log(`📕 [XHS] AI要查看笔记详情:`, noteId, xsecToken ? '(有xsecToken)' : '(无xsecToken)');
        ctx.setXhsStatus('正在查看笔记详情...');

        try {
            let result = await XhsMcpClient.getNoteDetail(xhsConf.mcpUrl, noteId, xsecToken, { loadAllComments: true });

            // Token refresh on failure
            if (!result.success || !result.data) {
                const cachedTitle = ctx.noteTitleCache.get(noteId);
                if (cachedTitle) {
                    console.log(`📕 [XHS] 详情失败，尝试重新搜索「${cachedTitle}」以刷新 xsecToken...`);
                    ctx.setXhsStatus('正在刷新访问凭证...');
                    const refreshResult = await xhsSearch(xhsConf, cachedTitle);
                    if (refreshResult.success && refreshResult.notes.length > 0) {
                        cacheXsecTokens(refreshResult.notes, ctx);
                        lastXhsNotes = refreshResult.notes;
                        const refreshedNote = refreshResult.notes.find(n => n.noteId === noteId);
                        if (refreshedNote?.xsecToken) {
                            xsecToken = refreshedNote.xsecToken;
                            console.log(`📕 [XHS] 拿到新 xsecToken，重试 detail...`);
                            ctx.setXhsStatus('正在查看笔记详情...');
                            result = await XhsMcpClient.getNoteDetail(xhsConf.mcpUrl, noteId, xsecToken, { loadAllComments: true });
                        } else {
                            console.warn(`📕 [XHS] 重新搜索结果中未找到 noteId=${noteId}`);
                        }
                    } else {
                        console.warn(`📕 [XHS] 重新搜索「${cachedTitle}」失败:`, refreshResult.message);
                    }
                } else {
                    console.warn(`📕 [XHS] 详情失败且无缓存标题，无法重试`);
                }
            }

            // Cache comments from detail data
            if (result.success && result.data && typeof result.data === 'object') {
                const cacheComments = (comments: any[], parentId?: string) => {
                    for (const c of comments) {
                        const cid = c.id || c.commentId || c.comment_id;
                        const uid = c.userInfo?.userId || c.userInfo?.user_id || c.user_id || c.userId;
                        const authorName = c.userInfo?.nickname || c.userInfo?.name || c.nickname || c.userName || c.user_name;
                        if (cid && uid) ctx.commentUserIdCache.set(cid, uid);
                        if (cid && authorName) ctx.commentAuthorNameCache.set(cid, authorName);
                        if (cid && parentId) ctx.commentParentIdCache.set(cid, parentId);
                        if (Array.isArray(c.subComments)) cacheComments(c.subComments, cid);
                        if (Array.isArray(c.sub_comments)) cacheComments(c.sub_comments, cid);
                    }
                };
                const d = result.data;
                const commentList = d.data?.comments?.list || d.comments?.list || d.data?.comments || d.comments;
                if (Array.isArray(commentList)) {
                    cacheComments(commentList);
                    console.log(`📕 [XHS] 缓存了 ${ctx.commentUserIdCache.size} 条评论的 userId, ${ctx.commentAuthorNameCache.size} 条 authorName`);
                }
            }

            // Build detail string for AI
            const detailData = result.success ? result.data : null;
            let detailStr: string;
            if (detailData) {
                if (typeof detailData === 'string') {
                    if (detailData.includes('失败') || detailData.includes('not found')) {
                        detailStr = `[加载失败: ${detailData.slice(0, 200)}]`;
                    } else {
                        detailStr = detailData.slice(0, 3000);
                    }
                } else {
                    detailStr = JSON.stringify(detailData, null, 2).slice(0, 3000);
                }
            } else {
                detailStr = `[加载失败: ${result.error || '无法获取笔记详情，可能需要先在搜索/浏览结果中看到这条笔记'}]`;
            }

            const detailFailed = detailStr.startsWith('[加载失败');
            const cleanedForXhs = aiContent.replace(/\[\[XHS_DETAIL:.*?\]\]/g, '').trim() || '让我看看这条笔记...';
            const xhsMessages = [
                ...ctx.fullMessages,
                { role: 'assistant', content: cleanedForXhs },
                {
                    role: 'user', content: detailFailed
                        ? `[系统: 你尝试打开一条小红书笔记（noteId=${noteId}），但加载失败了]\n\n${detailStr}\n\n[系统: 笔记详情页加载失败了。可能的原因：这条笔记需要先通过搜索或浏览才能打开详情。现在请你：\n1. 自然地告知用户"这条笔记打不开/加载不出来"\n2. 可以建议搜索相关关键词再试: [[XHS_SEARCH: 关键词]]\n3. 严禁再输出[[XHS_DETAIL:...]]标记]`
                        : `[系统: 你点开了一条小红书笔记的详情页（noteId=${noteId}）]\n\n${detailStr}\n\n[系统: 你已经看完了这条笔记的完整内容和评论区。现在请你：\n1. 自然地分享你看到的内容和感受\n2. 如果想评论这条笔记，可以用 [[XHS_COMMENT: ${noteId} | 评论内容]]\n3. 如果想回复某条评论，可以用 [[XHS_REPLY: ${noteId} | commentId | 回复内容]]（commentId 在上面的评论区数据里）\n4. 如果想点赞，可以用 [[XHS_LIKE: ${noteId}]]；想收藏可以用 [[XHS_FAV: ${noteId}]]\n5. 严禁再输出[[XHS_DETAIL:...]]标记]`
                }
            ];
            aiContent = await secondPassApiCall(ctx, xhsMessages, 'xhs-detail');
            ctx.addToast(`📕 ${ctx.charName}${detailFailed ? '尝试查看一条笔记（加载失败）' : '看了一条笔记的详情'}`, 'info');
        } catch (e) {
            console.error('📕 [XHS] 查看详情异常:', e);
            aiContent = aiContent.replace(xhsDetailMatch[0], '').trim();
        }
        ctx.setXhsStatus('');
    } else if (xhsDetailMatch) {
        aiContent = aiContent.replace(xhsDetailMatch[0], '').trim();
    }
    aiContent = aiContent.replace(/\[\[XHS_DETAIL:.*?\]\]/g, '').trim();

    // ── Second-round interactions (after DETAIL/PROFILE re-generation) ─
    aiContent = await processXhsInteractions(aiContent, xhsConf, lastXhsNotes, ctx, '2nd');
    // Also catch second-round SHARE
    aiContent = await processShare(aiContent, lastXhsNotes, ctx);

    return aiContent;
}
