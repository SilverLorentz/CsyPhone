/**
 * chatUtils — 摘星楼对话工具函数
 *
 * 提供对话历史截断机制，防止上下文超出 API token 限制。
 * 保留策略：始终保留 system prompt + 最近 N 轮对话。
 */

interface ChatMsg {
    role: string;
    content: string;
}

/** 估算文本 token 数（中文 ≈ 1.5 token/字，英文 ≈ 0.75 token/word） */
function estimateTokens(text: string): number {
    // 简化估算：中文字符 × 1.5 + 英文单词 × 1.3 + 标点等
    const chineseChars = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const remaining = text.length - chineseChars;
    return Math.ceil(chineseChars * 1.5 + remaining * 0.5);
}

/**
 * 截断消息列表，使总 token 数不超过 maxTokens。
 *
 * 策略：
 * 1. system 消息始终保留（不计入截断）
 * 2. 从最新消息开始回溯，保留尽量多的最近对话
 * 3. 保证至少保留最后一轮完整对话（user + assistant）
 *
 * @param messages    完整消息列表（含 system）
 * @param maxTokens   允许的最大总 token 数（默认 12000，留余量给 API 回复）
 * @returns           截断后的消息列表
 */
export function truncateMessages(
    messages: ChatMsg[],
    maxTokens: number = 12000
): ChatMsg[] {
    // 分离 system 消息和对话消息
    const systemMsgs = messages.filter(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');

    if (chatMsgs.length === 0) return messages;

    // 计算 system prompt 占用的 token
    const systemTokens = systemMsgs.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const budgetForChat = maxTokens - systemTokens;

    if (budgetForChat <= 0) {
        // system prompt 本身就超了，只保留 system + 最后一条
        return [...systemMsgs, chatMsgs[chatMsgs.length - 1]];
    }

    // 从后往前累加，直到超出预算
    let tokenCount = 0;
    let cutIndex = chatMsgs.length;

    for (let i = chatMsgs.length - 1; i >= 0; i--) {
        const msgTokens = estimateTokens(chatMsgs[i].content);
        if (tokenCount + msgTokens > budgetForChat) {
            cutIndex = i + 1;
            break;
        }
        tokenCount += msgTokens;
        if (i === 0) cutIndex = 0;
    }

    // 确保至少保留最后 2 条消息（一轮对话）
    cutIndex = Math.min(cutIndex, Math.max(chatMsgs.length - 2, 0));

    const kept = chatMsgs.slice(cutIndex);
    return [...systemMsgs, ...kept];
}
