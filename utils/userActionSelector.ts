import type { APIConfig, CharacterProfile, Emoji, Message, UserProfile } from '../types';
import { extractJson } from './safeApi';
import { formatMessageForContext } from './messageContext';
import { trackedApiRequest, type ApiRequestTraceMeta } from './apiRequestLedger';
import { markSecondaryApiConfigFailure, markSecondaryApiConfigSuccess } from './runtimeConfig';

export type UserActionChoiceId = 'gentle' | 'advance' | 'quiet' | 'turn';

export interface UserActionChoice {
    id: UserActionChoiceId;
    label: string;
    tone: string;
    segments: string[];
    emojiName: string;
}

export interface UserActionSelectorPromptInput {
    char: CharacterProfile;
    userProfile: UserProfile;
    messages: Message[];
    latestCharReply: string;
    emojis: Pick<Emoji, 'name'>[];
    contextLimit?: number;
}

const CHOICE_META: Record<UserActionChoiceId, { label: string; tone: string }> = {
    gentle: { label: '温柔接住', tone: '温柔' },
    advance: { label: '轻轻推进', tone: '主动' },
    quiet: { label: '克制留白', tone: '克制' },
    turn: { label: '换个方向', tone: '灵动' },
};

const CHOICE_IDS: UserActionChoiceId[] = ['gentle', 'advance', 'quiet', 'turn'];
const USER_ACTION_SELECTOR_MAX_TOKENS = 65536;

export type UserActionSelectorErrorCode = 'http' | 'context_length' | 'max_tokens' | 'empty_response' | 'invalid_response';

export class UserActionSelectorApiError extends Error {
    code: UserActionSelectorErrorCode;
    status?: number;
    detail?: string;

    constructor(message: string, code: UserActionSelectorErrorCode, options?: { status?: number; detail?: string }) {
        super(message);
        this.name = 'UserActionSelectorApiError';
        this.code = code;
        this.status = options?.status;
        this.detail = options?.detail;
    }
}

function cleanLine(value: unknown, limit = 240): string {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function cleanBlock(value: unknown, fallback = '无'): string {
    const text = String(value || '').replace(/\r\n?/g, '\n').trim();
    return text || fallback;
}

function uniqueEmojiNames(emojis: Pick<Emoji, 'name'>[]): string[] {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const emoji of emojis) {
        const name = cleanLine(emoji.name, 80);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
    }
    return names;
}

export function buildUserProfileBlock(user: UserProfile): string {
    const parts = [
        `名字：${cleanLine(user.name) || '你'}`,
        `设定/备注：${cleanBlock(user.bio)}`,
        user.healthGender ? `性别：${user.healthGender === 'female' ? '女' : '男'}` : '',
    ].filter(Boolean);
    return parts.join('\n');
}

export function buildCharIdentityBlock(char: CharacterProfile): string {
    const parts = [
        `名字：${cleanLine(char.name)}`,
        char.description ? `用户备注/爱称：${cleanBlock(char.description)}` : '',
        `核心性格/指令：\n${cleanBlock(char.systemPrompt, '无')}`,
    ].filter(Boolean);
    return parts.join('\n\n');
}

export function buildCharPrivateImpressionOfUserBlock(char: CharacterProfile, userName: string): string {
    const imp = char.impression;
    if (!imp) return `暂无 ${char.name} 对 ${userName} 的长期印象档案。`;

    const observedChanges = Array.isArray(imp.observed_changes)
        ? imp.observed_changes.map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
                const record = item as Record<string, unknown>;
                return [record.period, record.description].filter(Boolean).join(' ');
            }
            return String(item || '');
        }).filter(Boolean).join('；')
        : '';

    return [
        `核心评价：${cleanBlock(imp.personality_core?.summary)}`,
        `互动模式：${cleanBlock(imp.personality_core?.interaction_style)}`,
        `我观察到的特质：${(imp.personality_core?.observed_traits || []).map(item => cleanLine(item, 80)).filter(Boolean).join('、') || '无'}`,
        `TA的喜好：${(imp.value_map?.likes || []).map(item => cleanLine(item, 80)).filter(Boolean).join('、') || '无'}`,
        `情绪雷区：${(imp.emotion_schema?.triggers?.negative || []).map(item => cleanLine(item, 80)).filter(Boolean).join('、') || '无'}`,
        `舒适区：${cleanBlock(imp.emotion_schema?.comfort_zone)}`,
        `最近观察到的变化：${observedChanges || '无'}`,
    ].join('\n');
}

export function buildWorldAndMemoryBlock(char: CharacterProfile): string {
    const blocks: string[] = [];
    if (char.worldview?.trim()) {
        blocks.push(`世界观与设定：\n${char.worldview.trim()}`);
    }

    const worldbooks = char.mountedWorldbooks || [];
    if (worldbooks.length > 0) {
        blocks.push(`扩展设定：\n${worldbooks.map(wb => {
            const title = [wb.category, wb.title].filter(Boolean).join(' / ');
            return `- ${title || '设定'}：${cleanBlock(wb.content)}`;
        }).join('\n')}`);
    }

    const refined = char.refinedMemories || {};
    const memoryLines = Object.entries(refined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, summary]) => `- [${date}] ${cleanLine(summary, 500)}`);
    if (memoryLines.length > 0) {
        blocks.push(`长期记忆脉络：\n${memoryLines.join('\n')}`);
    }

    if (Array.isArray(char.activeMemoryMonths) && char.activeMemoryMonths.length > 0 && Array.isArray(char.memories)) {
        const activeDetails = char.memories
            .filter(memory => char.activeMemoryMonths?.some(month => String(memory.date || '').startsWith(month)))
            .slice(-40)
            .map(memory => `- ${memory.date}${memory.mood ? ` (${memory.mood})` : ''}: ${cleanLine(memory.summary, 360)}`);
        if (activeDetails.length > 0) {
            blocks.push(`当前激活的详细回忆：\n${activeDetails.join('\n')}`);
        }
    }

    return blocks.join('\n\n') || '暂无额外世界观、长期记忆或关系背景。';
}

export function buildVisibleConversationContext(input: {
    messages: Message[];
    charName: string;
    userName: string;
    limit?: number;
}): string {
    const limit = Math.max(1, input.limit || 40);
    const lines = input.messages
        .slice(-limit)
        .map(message => formatMessageForContext(message, {
            surface: 'secondaryModel',
            charName: input.charName,
            userName: input.userName,
            includeTimestamp: true,
            includeSpeaker: true,
            maxContentChars: 600,
        }))
        .filter((line): line is string => Boolean(line?.trim()));

    return lines.join('\n') || '暂无最近聊天记录。';
}

export function buildAvailableEmojiNamesBlock(emojis: Pick<Emoji, 'name'>[]): string {
    const names = uniqueEmojiNames(emojis);
    return names.length > 0 ? names.map(name => `- ${name}`).join('\n') : '无';
}

export function buildUserActionSelectorPrompt(input: UserActionSelectorPromptInput): { system: string; user: string } {
    const userName = cleanLine(input.userProfile.name) || '你';
    const charName = cleanLine(input.char.name) || '对方';
    const contextLimit = input.contextLimit || input.char.contextLimit || 80;

    const user = `# 角色与任务

你是 ${userName}，正在和 ${charName} 用手机线上聊天。
你不是在“扮演”——你就是 ${userName} 本人，刚看到对方的消息，正在想怎么回。

你的任务：给“我”（也就是 ${userName}）准备 4 条可以直接发出去的回复草稿，让我从里面挑一条、改一改、发出去。

---

# 这是谁

## 我（${userName}）
${buildUserProfileBlock(input.userProfile)}

## 对方（${charName}）
屏幕那头跟我聊天的人。
${buildCharIdentityBlock(input.char)}

## 在 ${charName} 眼里，我是这样的
${buildCharPrivateImpressionOfUserBlock(input.char, userName)}

用这层印象去判断：我俩关系到哪一步了、平时怎么称呼、有哪些只有我俩懂的默契、什么话题碰不得。回复要像“刚刚还活在这段关系里的我”会说出口的，而不是一个泛泛的用户在答题。

## 世界观 / 长期记忆 / 关系背景
${buildWorldAndMemoryBlock(input.char)}

---

# 现在的对话

## 最近的聊天记录
${buildVisibleConversationContext({
        messages: input.messages,
        charName,
        userName,
        limit: contextLimit,
    })}

## ${charName} 刚刚发来
${cleanBlock(input.latestCharReply, '（没有可用的最新回复。）')}

只根据上面看得见的内容来回。不要替 ${charName} 脑补他没说出口的心思，也不要把没发生过的事当成发生过。

---

# 我手机里的表情包

我可以用这些表情包：

${buildAvailableEmojiNamesBlock(input.emojis)}

我很爱发表情包。
表情包单独作为 \`emojiName\` 输出，不要写进文字消息里。

---

# 怎么写这 4 条

这 4 条是“我现在想怎么接”的 4 种**不同选择**，不是同一句话的 4 种说法。它们之间要让人一眼看出“这是完全不同的态度”：

1. **gentle｜温柔**：顺着对方此刻的情绪撒娇，善解人意一点。
2. **advance｜轻轻推进**：把关系或话题往前拱一步——主动一点、撩一点，抛个邀请或试探。
3. **quiet｜克制留白**：更短，像真实聊天里随手一发，话不说满，留点想象空间。
4. **turn｜换个方向**：制造鲜活感——撒娇、调侃、反问、岔开，或者退半步勾着他。

每一条都必须：
- 是“我”会说的话：贴我的人设、贴我俩此刻的关系温度、用我俩平时的称呼和口吻。
- 像真人在手机上打字，不像在写小说或作文。
- 配一个表情包，表情包名字从我手机里的表情包里选。

---

# 线上聊天的质感

这是手机聊天，不是台词，不是旁白。所以：

- **短**。一条消息就是脑子里冒出来的一个念头，不是一整段论述。
- **别把情绪解释满**。“有点想你了”比“看到你的消息我心里涌起一阵难以言说的思念”更像真人。
- **标点随意**。结尾常常没有句号，可能是省略号、波浪号，或者干脆什么都不加。

---

# 分句发（segments）

真人发消息很少把一大段一次性甩出去，而是一句一句连着发。所以每条回复都拆成“一条一条连着发的气泡”，放进 \`segments\` 数组：

- 按真人会怎么分着发来拆，在自然的语气停顿处断开，不要拦腰截断一个意思。
- 每一条都能单独成立、单独发出去。
- 用户可能会改其中一条，所以每条都要是干净、可直接发送的成品。

---

# 别犯这些错

- 4 条听起来差不多。
- 写成长段落、文绉绉、像念旁白。
- 不像 ${userName} 会说的话。
- 冒出我俩关系里不该有的称呼、口吻。
- 替对方脑补，或把没发生的事当成发生过。
- 说教、道德提醒、跳出角色解释。
- 把表情包名字混进文字消息里。

---

# 输出格式

只输出 JSON，不要 markdown，不要任何解释或前后缀。

{
  "choices": [
    { "id": "gentle", "label": "温柔接住", "tone": "温柔", "segments": ["第一句", "第二句"], "emojiName": "从可用表情包里选一个名字" },
    { "id": "advance", "label": "轻轻推进", "tone": "主动", "segments": ["..."], "emojiName": "从可用表情包里选一个名字" },
    { "id": "quiet", "label": "克制留白", "tone": "克制", "segments": ["..."], "emojiName": "从可用表情包里选一个名字" },
    { "id": "turn", "label": "换个方向", "tone": "灵动", "segments": ["...", "..."], "emojiName": "从可用表情包里选一个名字" }
  ]
}`;

    return {
        system: `你是线上聊天回复选择器。严格站在 ${userName} 的第一人称视角，输出 JSON。不要输出解释、markdown 或额外文本。`,
        user,
    };
}

function normalizeSegments(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => String(item || '').replace(/\r\n?/g, '\n').trim())
        .filter(Boolean)
        .slice(0, 5);
}

function resolveEmojiName(value: unknown, emojiNames: string[]): string {
    const raw = cleanLine(value, 120);
    if (raw) {
        const exact = emojiNames.find(name => name === raw);
        if (exact) return exact;
        const loose = emojiNames.find(name => name.toLowerCase() === raw.toLowerCase());
        if (loose) return loose;
    }
    return emojiNames[0] || '';
}

export function parseUserActionChoices(raw: string, emojis: Pick<Emoji, 'name'>[]): UserActionChoice[] | null {
    const emojiNames = uniqueEmojiNames(emojis);
    if (emojiNames.length === 0) return null;

    const parsed = extractJson(raw, { logFailure: false }) as any;
    const sourceChoices = Array.isArray(parsed?.choices) ? parsed.choices : [];
    if (sourceChoices.length === 0) return null;

    const byId = new Map<string, any>();
    for (const item of sourceChoices) {
        if (!item || typeof item !== 'object') continue;
        byId.set(String(item.id || '').trim(), item);
    }

    const choices: UserActionChoice[] = [];
    for (const id of CHOICE_IDS) {
        const item = byId.get(id) || sourceChoices[choices.length];
        const segments = normalizeSegments(item?.segments);
        if (segments.length === 0) return null;

        const meta = CHOICE_META[id];
        choices.push({
            id,
            label: cleanLine(item?.label, 20) || meta.label,
            tone: cleanLine(item?.tone, 20) || meta.tone,
            segments,
            emojiName: resolveEmojiName(item?.emojiName, emojiNames),
        });
    }

    return choices.length === CHOICE_IDS.length ? choices : null;
}

function getFinishReason(data: any): string {
    const choice = data?.choices?.[0];
    return String(choice?.finish_reason || choice?.finishReason || '').trim();
}

function isMaxTokenFinishReason(reason: string): boolean {
    return /(length|max_tokens|max_output_tokens)/i.test(reason);
}

function getApiErrorDetail(data: any, text: string): string {
    const detail = data?.error?.message
        || data?.error?.detail
        || data?.error
        || data?.message
        || text;
    return String(detail || '').replace(/\s+/g, ' ').trim();
}

function isContextLengthError(detail: string): boolean {
    return /(context_length|context window|maximum context|context.*length|prompt.*too long|too many tokens|input tokens|maximum number of tokens|token limit)/i.test(detail);
}

async function readJsonResponse(response: Response): Promise<{ data: any | null; text: string }> {
    const text = await response.text();
    if (!text.trim()) return { data: null, text };
    try {
        return { data: JSON.parse(text), text };
    } catch {
        return { data: null, text };
    }
}

export async function requestUserActionChoices(input: {
    apiConfig: APIConfig;
    prompt: { system: string; user: string };
    signal?: AbortSignal;
    trace?: ApiRequestTraceMeta;
}): Promise<string> {
    const baseUrl = input.apiConfig.baseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;

    let response: Response;
    try {
        response = await trackedApiRequest({
            feature: 'chat',
            reason: 'user线上选择器',
            model: input.apiConfig.model,
            userInitiated: true,
            ...input.trace,
            url,
        }, () => fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${input.apiConfig.apiKey}`,
            },
            body: JSON.stringify({
                model: input.apiConfig.model,
                messages: [
                    { role: 'system', content: input.prompt.system },
                    { role: 'user', content: input.prompt.user },
                ],
                temperature: 0.85,
                max_tokens: USER_ACTION_SELECTOR_MAX_TOKENS,
            }),
            signal: input.signal,
        }));
    } catch (error) {
        markSecondaryApiConfigFailure(input.apiConfig, error);
        throw error;
    }

    const { data, text } = await readJsonResponse(response);

    if (!response.ok) {
        const detail = getApiErrorDetail(data, text);
        const code: UserActionSelectorErrorCode = isContextLengthError(detail) ? 'context_length' : 'http';
        const error = new UserActionSelectorApiError(
            `回复选择请求失败 (HTTP ${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`,
            code,
            { status: response.status, detail },
        );
        markSecondaryApiConfigFailure(input.apiConfig, error);
        throw error;
    }

    if (!data) {
        const error = new UserActionSelectorApiError(
            `回复选择 API 返回了无效 JSON${text ? `: ${text.slice(0, 180)}` : ''}`,
            'invalid_response',
            { detail: text },
        );
        markSecondaryApiConfigFailure(input.apiConfig, error);
        throw error;
    }

    const finishReason = getFinishReason(data);
    if (isMaxTokenFinishReason(finishReason)) {
        const error = new UserActionSelectorApiError(
            `回复选择输出达到 max_tokens 上限（finish_reason: ${finishReason}, max_tokens: ${USER_ACTION_SELECTOR_MAX_TOKENS}）`,
            'max_tokens',
            { detail: finishReason },
        );
        markSecondaryApiConfigFailure(input.apiConfig, error);
        throw error;
    }

    const content = String(data.choices?.[0]?.message?.content || '').trim();
    if (!content) {
        const error = new UserActionSelectorApiError(
            finishReason ? `回复选择模型返回空白内容（finish_reason: ${finishReason}）` : '回复选择模型返回空白内容',
            'empty_response',
            { detail: finishReason },
        );
        markSecondaryApiConfigFailure(input.apiConfig, error);
        throw error;
    }

    markSecondaryApiConfigSuccess(input.apiConfig);
    return content;
}
