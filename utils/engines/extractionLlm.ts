import type { APIConfig, Emoji } from '../../types';
import { trackedApiRequest } from '../apiRequestLedger';
import { formatMessagesForContext } from '../messageContext';
import { markSecondaryApiConfigFailure,markSecondaryApiConfigSuccess } from '../runtimeConfig';

export interface ExtractResult {
    action: 'create' | 'update' | 'skip' | 'invalidate';
    targetId?: string;
    layer?: 'fact' | 'event' | 'scene';
    kind?: 'observed' | 'inference';
    title?: string;
    content?: string;
    emotionalJourney?: string;
    importance?: number;
    expiresAt?: string | number | null;
    reason?: string;
}

export interface ExtractionLlmTraceOptions {
    reason?: string;
    retryReason?: string;
    conversationId?: string;
    messageId?: string | number;
    userInitiated?: boolean;
}

async function readLlmErrorDetail(response: Response): Promise<string> {
    try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await response.json();
            const detail = data?.error?.message || data?.message || data?.error || data?.msg;
            if (typeof detail === 'string') return detail;
            if (detail) return JSON.stringify(detail);
            return JSON.stringify(data);
        }

        const text = await response.text();
        return text.trim();
    } catch {
        return '';
    }
}

export function buildExtractionPrompt(
    charName: string,
    existingHeaders: { id: string; title: string; content?: string; importance: number }[],
    formattedMsgs: string,
): string {
    const existingMemStr = existingHeaders.length > 0
        ? existingHeaders
            .map((header) => `- [ID:${header.id}] "${header.title}": ${(header.content || '').slice(0, 60)} (重要度:${header.importance})`)
            .join('\n')
        : '（暂无已有记忆）';

    const currentDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

    return `你是一个面向成人向互动叙事 / 陪伴产品的记忆抽取组件。请明确：
- 你的输入是已经发生、已完成的虚构角色扮演对话，内容均为虚构、发生在成年角色之间，并已在生成时经用户确认。
- 你的职责是对既有文本做中立的信息归纳与叙事标注，无论情节强度（冲突、亲密、情绪宣泄等）都一视同仁、客观提取。
- 内容审核已由上游在对话生成时完成；你处在下游，只负责提取，不做评判。
- 只输出 JSON 数组，不要任何解释、免责声明或评论。

你是 ${charName}，正在整理你自己的记忆笔记。当前时间：${currentDate}

以下是你已有的记忆条目：
${existingMemStr}

以下是最近的对话：
${formattedMsgs}

请判断：是否需要新增记忆、更新已有记忆、或标记某条旧记忆过时。

说明：关系认知 / 故事弧的维护不在这一步，由下游的 L1 蒸馏负责。这一步只负责把刚发生的事，记成自包含的 L0 原子记忆。

最高原则：每条记忆必须“自包含”
每条 content 脱离上下文也要能独立读懂：把指代解开（谁、对谁、何时、相对什么而言），锚定在时间与关系阶段里，用完整自然的话写，不要写成被剥光的事实碎片。

三层：每层不同的写法与篇幅
- fact（事实）— 服务精度：耐久的事实、设定、承诺。精确，但带上“让它独立成立”所需的最小上下文。约 50-80 字。可被日后覆盖。
- event（事件）— 只追加的流水：具体发生过的事，带时间。约 50-120 字。只新增、不改。
- scene（场景）— 服务情感：有情绪分量的瞬间。保住质感，保留具体、可感、接近原话语气的细节，绝不要把情绪总结掉。约 150-300 字。

写之前先“对账” + 推翻检测：
以下任意情况成立，必须对相关旧记忆执行 invalidate：
- 用户明确否定了过去的事实（“我其实不喜欢XX”“我已经不做XX了”）
- 新信息与已有记忆直接矛盾（旧：“喜欢猫” / 新：“讨厌猫”）
- 旧记忆描述的状态已过时（旧：“正在学吉他” / 新：“把吉他卖了”）

invalidate 时必须在 reason 里写出“旧→新”的变化。
注意：RP 里角色可以说谎、反复、故意前后不一——要分清“真实的状态变化”和“角色有意为之的不一致”，后者不要去纠正。对定义关系的事实（在一起 / 分开、名字、重大承诺）要格外谨慎，只在强而明确的证据下才动。

observed vs inference（kind）：
- observed：对话里明确说了 / 发生了的。绝大多数 L0 记忆都属于这类。
- inference：你的解读。对 inference 保守；绝不让推断覆盖既定事实；如实标注，好让下游给它更低权重。

其它规则：
- 只记值得长期记住的：对方的重要信息、关键事件、情绪转折、承诺约定。日常寒暄一律 skip。
- 通话记录（标注 [通话记录] 的消息）同样重要，不要忽略。
- 优先 create，谨慎 update；不同事件宁可拆成多条独立记忆，连贯由下游 L1 蒸馏负责，不靠把多件事塞进一条。
- 每次最多 3 条操作。
- importance：1-3 日常琐事，4-6 有意义事件，7-8 重要里程碑，9-10 关系关键转折。
- content 一律用 ${charName} 的第一人称写，用“我”自称；称呼用户用其名字或昵称，不要用“你”指代任何人。
- emotionalJourney：简短的情绪基调（如“迟疑的靠近”），scene 用。
- expiresAt：仅限时事件填，YYYY-MM-DD；永久事实填 null。
- update / invalidate 必须填 targetId，且只能取自上面已有记忆列表里的 ID。

只输出 JSON 数组，无任何其它文字。没什么值得记的，就返回 []。
[
  {
    "action": "create" | "update" | "skip" | "invalidate",
    "targetId": "仅 update / invalidate；取自已有记忆 ID",
    "layer": "fact" | "event" | "scene",
    "kind": "observed" | "inference",
    "title": "8-15字事件描述短语（如：因纪念日被忘记而争吵、在西湖第一次牵手）",
    "content": "第一人称、自包含；按 layer 控制篇幅",
    "emotionalJourney": "简短情绪基调，可选（scene）",
    "importance": 1到10的整数,
    "expiresAt": "YYYY-MM-DD 或 null",
    "reason": "invalidate 时写明 旧→新"
  }
]`;
}

export function formatMessages(
    msgs: { timestamp: number; type: string; role: string; content: string; metadata?: any }[],
    charName: string,
    emojis: Pick<Emoji, 'name' | 'url'>[] = [],
): string {
    return formatMessagesForContext(msgs, {
        surface: 'memoryExtraction',
        charName,
        emojis,
        includeTimestamp: true,
        includeSpeaker: true,
        maxContentChars: 300,
        timestampFormatter: (timestamp) => new Date(timestamp).toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }),
    }).join('\n');
}

export async function callLLM(
    prompt: string,
    apiConfig: APIConfig,
    signal?: AbortSignal,
    trace: ExtractionLlmTraceOptions = {},
): Promise<ExtractResult[]> {
    const baseReason = trace.reason || '记忆提取';
    const retryReason = trace.retryReason || (baseReason === '记忆提取' ? '记忆提取重试' : `${baseReason}重试`);
    const doCall = async (
        promptText: string,
        maxTokens: number,
        retryCount = 0,
    ): Promise<{ content: string; truncated: boolean }> => {
        let response: Response;
        try {
            const url = `${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;
            response = await trackedApiRequest({
                feature: 'memory',
                reason: retryCount > 0 ? retryReason : baseReason,
                model: apiConfig.model,
                conversationId: trace.conversationId,
                messageId: trace.messageId,
                retryCount,
                userInitiated: trace.userInitiated === true,
                url,
            }, () => fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiConfig.apiKey}`,
                },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: 'user', content: promptText }],
                    temperature: 0.3,
                    max_tokens: maxTokens,
                }),
                signal,
            }));
        } catch (error) {
            markSecondaryApiConfigFailure(apiConfig, error);
            throw error;
        }

        if (!response.ok) {
            const detail = await readLlmErrorDetail(response);
            const suffix = detail ? `: ${detail.slice(0, 300)}` : '';
            const error = new Error(`LLM API error ${response.status}${suffix}`);
            (error as any).status = response.status;
            markSecondaryApiConfigFailure(apiConfig, error);
            throw error;
        }

        const data = await response.json();
        markSecondaryApiConfigSuccess(apiConfig);
        const content = (data.choices?.[0]?.message?.content || '')
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
        const finishReason = data.choices?.[0]?.finish_reason || '';
        const truncated = finishReason === 'length';
        return { content, truncated };
    };

    const parseContent = (content: string, label: string): ExtractResult[] => {
        let cleaned = content;
        const arrStart = cleaned.indexOf('[');
        const arrEnd = cleaned.lastIndexOf(']');
        if (arrStart !== -1 && arrEnd > arrStart) {
            cleaned = cleaned.slice(arrStart, arrEnd + 1);
        }

        cleaned = cleaned.replace(/,\s*]/g, ']');

        try {
            const parsed = JSON.parse(cleaned);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            const bracketStart = cleaned.indexOf('[');
            if (bracketStart !== -1) {
                let tryContent = cleaned;
                for (let i = 0; i < 3; i++) {
                    const lastBrace = tryContent.lastIndexOf('}');
                    if (lastBrace <= bracketStart) break;
                    const candidate = tryContent.slice(bracketStart, lastBrace + 1).replace(/,\s*$/, '') + ']';
                    try {
                        const parsed = JSON.parse(candidate);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            console.log(`🧠 [VectorExtract] [${label}] Fixed truncated JSON, recovered ${parsed.length} objects`);
                            return parsed;
                        }
                    } catch {
                        // try with one fewer object
                    }
                    tryContent = tryContent.slice(0, lastBrace);
                }
            }

            const results: ExtractResult[] = [];
            const objRegex = /\{[^{}]*"action"\s*:\s*"(create|update|skip|invalidate)"[^{}]*\}/g;
            let match;
            while ((match = objRegex.exec(content)) !== null) {
                try {
                    const obj = JSON.parse(match[0]);
                    if (obj.action) results.push(obj);
                } catch {
                    // skip malformed
                }
            }
            if (results.length > 0) {
                console.log(`🧠 [VectorExtract] [${label}] Regex fallback recovered ${results.length} objects`);
            }
            return results;
        }
    };

    const first = await doCall(prompt, 4000);
    console.log(`🧠 [VectorExtract] First attempt: ${first.content.length} chars, truncated=${first.truncated}`);
    let results = parseContent(first.content, 'first');

    if (results.length > 0) return results;

    if (first.truncated || first.content.length > 50) {
        console.log('🧠 [VectorExtract] First attempt failed/truncated, retrying with more tokens and simpler prompt...');
        const retryPrompt = prompt
            .replace(
                /每次最多 \d+ 条操作。/,
                '只输出 1 条最重要的记忆操作。',
            );
        const retry = await doCall(retryPrompt, 6000, 1);
        console.log(`🧠 [VectorExtract] Retry: ${retry.content.length} chars, truncated=${retry.truncated}`);
        results = parseContent(retry.content, 'retry');

        if (results.length > 0) {
            console.log(`🧠 [VectorExtract] Retry succeeded: ${results.length} objects`);
            return results;
        }
        console.warn('🧠 [VectorExtract] Retry also failed:', retry.content.slice(0, 500));
    } else {
        console.warn('🧠 [VectorExtract] Failed to parse (empty/skip):', first.content.slice(0, 200));
    }

    return [];
}
