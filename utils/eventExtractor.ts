/**
 * Event Extractor — 时间事件提取器
 * 
 * 从用户消息中提取时间绑定事件（如"点了外卖"、"要去开会"），
 * 存储为 PendingEvent，供 temporalContext 在后续对话中注入。
 * 
 * 执行模式：fire-and-forget（异步，不阻塞主响应）
 * 触发条件：关键词预过滤 → 命中才调 LLM
 */

import { addPendingEvent,PendingEvent } from './temporalContext';
import { extractJsonTyped } from './safeApi';
import { markSecondaryApiConfigFailure,markSecondaryApiConfigSuccess } from './runtimeConfig';
import { trackedApiRequest } from './apiRequestLedger';

// ─── Configuration ──────────────────────────────────────────

const EXTRACT_TIMEOUT_MS = 20000; // 20s — cloud models like Gemini can take 10-15s cold start

// Module-level concurrency lock
let extracting = false;

// ─── Keyword Pre-filter ─────────────────────────────────────

const TIME_KEYWORDS = [
    // 动作类
    '外卖', '快递', '洗澡', '开会', '上课', '下课', '考试', '健身',
    '出去', '出门', '回来', '回家', '吃饭', '做饭', '午休', '睡觉',
    '上班', '下班', '面试', '约会', '看病', '取', '拿',
    // 时间词
    '分钟', '小时', '半小时', '一会儿', '一会', '等下', '待会', '马上',
    '明天', '后天', '下午', '晚上', '早上', '过会', '等会',
    // 计划类
    '要去', '打算', '准备', '计划', '约了', '得去', '该去',
];

/**
 * 检查消息是否包含时间相关关键词。
 * 通过预过滤避免对 "哈哈"、"好的" 这类消息调用 LLM。
 */
function hasTimeKeyword(content: string): boolean {
    const lower = content.toLowerCase();
    return TIME_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── LLM Extraction ─────────────────────────────────────────

function buildExtractionPrompt(userMessage: string, currentTime: string): string {
    return `用户刚才说了一句话，请判断里面有没有提到即将发生的事件（需要等待一段时间的事）。

用户消息: "${userMessage.slice(0, 200)}"
当前时间: ${currentTime}

判断标准：
- 有明确的未来事件（如：点外卖→等外卖到、去开会→会议结束、去洗澡→洗完回来）
- 有时间暗示（如："半小时后"、"一会儿"、"等下"）
- 不是正在进行的事（如"我在吃饭"不算，"我要去吃饭"才算）

如果有时间相关事件，输出 JSON:
{"hasEvent":true,"event":"事件描述(5字以内)","estimatedMinutes":预计分钟数,"confidence":"high或medium"}

如果没有:
{"hasEvent":false}

规则:
- confidence: 用户明确说了时间→high，需要靠常识推断→medium
- estimatedMinutes: 用户说了具体时间就用，没说就用常识估计
- 只输出纯 JSON，不要其他文字`;
}

interface ExtractionResult {
    hasEvent: boolean;
    event?: string;
    estimatedMinutes?: number;
    confidence?: 'high' | 'medium' | 'low';
}


function validateExtractionResult(obj: any): ExtractionResult | null {
    if (typeof obj.hasEvent !== 'boolean') return null;
    return {
        hasEvent: obj.hasEvent,
        event: obj.event ? String(obj.event).slice(0, 20) : undefined,
        estimatedMinutes: typeof obj.estimatedMinutes === 'number'
            ? Math.max(1, Math.min(1440, Math.round(obj.estimatedMinutes)))
            : undefined,
        confidence: ['high', 'medium', 'low'].includes(obj.confidence)
            ? obj.confidence
            : 'medium',
    };
}

// ─── Core Extraction ─────────────────────────────────────────

/**
 * 从用户消息中提取时间事件。
 * 
 * Fire-and-forget：调用者不需要 await 结果。
 * 提取到的事件会自动存入 localStorage，供 buildTemporalContext 读取。
 * 
 * @param charId 角色ID
 * @param userMessage 用户消息内容
 * @param apiConfig LLM API 配置（副 API）
 */
async function extract(
    charId: string,
    userMessage: string,
    apiConfig: { baseUrl: string; apiKey: string; model: string }
): Promise<void> {
    // Pre-filter: skip messages without time keywords
    if (!userMessage || userMessage.length < 3 || !hasTimeKeyword(userMessage)) {
        return;
    }

    // Concurrency guard
    if (extracting) {
        console.log('⏰ [EventExtractor] Already extracting, skipping');
        return;
    }

    extracting = true;

    try {
        const now = new Date();
        const currentTime = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const prompt = buildExtractionPrompt(userMessage, currentTime);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

        try {
            const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
            const url = `${baseUrl}/chat/completions`;
            const resp = await trackedApiRequest({
                feature: 'memory',
                reason: '时间事件提取',
                model: apiConfig.model,
                conversationId: charId,
                userInitiated: false,
                url,
            }, () => fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiConfig.apiKey}`,
                },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1,
                    max_tokens: 150,
                }),
                signal: controller.signal,
            }));

            if (!resp.ok) {
                const error = new Error(`HTTP ${resp.status}`);
                (error as any).status = resp.status;
                markSecondaryApiConfigFailure(apiConfig, error);
                console.warn(`⏰ [EventExtractor] LLM error ${resp.status}`);
                return;
            }

            const data = await resp.json();
            markSecondaryApiConfigSuccess(apiConfig);
            let content = (data.choices?.[0]?.message?.content || '').trim();

            // Strip <think>...</think> reasoning tags (DeepSeek-R1 / some models)
            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            content = content.replace(/<think>[\s\S]*/g, '').trim();

            const result = extractJsonTyped(content, validateExtractionResult);
            if (!result) {
                console.warn('⏰ [EventExtractor] Failed to parse JSON:', content.slice(0, 80));
                return;
            }

            if (result.hasEvent && result.event && result.estimatedMinutes) {
                const createdAt = Date.now();
                const event: PendingEvent = {
                    id: `evt-${createdAt}-${Math.random().toString(36).slice(2, 6)}`,
                    charId,
                    event: result.event,
                    estimatedMinutes: result.estimatedMinutes,
                    confidence: result.confidence || 'medium',
                    createdAt,
                    dueAt: createdAt + result.estimatedMinutes * 60000,
                };
                addPendingEvent(event);
            } else {
                console.log(`⏰ [EventExtractor] No event detected in: "${userMessage.slice(0, 50)}"`);
            }
        } finally {
            clearTimeout(timer);
        }
    } catch (err: any) {
        if (err.name === 'AbortError') {
            markSecondaryApiConfigFailure(apiConfig, err);
            console.warn(`⏰ [EventExtractor] Timed out (${EXTRACT_TIMEOUT_MS}ms)`);
        } else {
            markSecondaryApiConfigFailure(apiConfig, err);
            console.error('⏰ [EventExtractor] Error:', err.message);
        }
    } finally {
        extracting = false;
    }
}

// ─── Public API ──────────────────────────────────────────────

export const EventExtractor = {
    extract,
    /** 检查消息是否可能包含时间事件（用于外部预判断） */
    hasTimeKeyword,
};
