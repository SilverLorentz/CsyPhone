/**
 * Theater Prompts — 导演 Prompt + 场景注入 Prompt
 * 导演（副 API）生成结构化事件 JSON，主 API 基于事件演绎角色。
 */

import type { EventType, DirectorEvent, TheaterLocation, TimeSlot, TransitionEvent, LocationSuggestion } from '../types';
import { TIME_SLOT_LABELS } from '../types/theater';

// ── Director Prompt (for Secondary API) ──

const EVENT_TYPE_DESCRIPTIONS: Record<EventType, string> = {
    ambient:   '纯氛围描写。不需要具体事件发生，只描述此时此刻的环境、气氛、感觉。让读者"进入"这个场景。',
    encounter: '偶遇/发现/意外。在这个地点发生了一件出乎意料的事——遇到某个人、发现某个东西、突然出现的状况。',
    romantic:  '浪漫时刻。制造一个让两人关系更近一步的小契机——不需要大告白，一个眼神、一个意外的亲密接触就够了。',
    callback:  '回忆关联。设计一个"似曾相识"的场景——某个细节让角色想起过去的事。如果有记忆片段可用，融入场景。',
    conflict:  '小冲突/分歧。一个微妙的紧张时刻——意见不合、误会、第三者介入、尴尬时刻。注意：不要太严重，是生活中常见的小摩擦。',
    surprise:  '完全意想不到的转折。天气骤变、偶遇名人、捡到奇怪的东西、手机突然响了带来消息——打破当前节奏的意外。',
};

export interface DirectorPromptOptions {
    recentContext?: string;
    recentForbiddenMotifs?: string;
}

/**
 * Build the director prompt for the secondary API.
 * The director must return a structured JSON object.
 */
export function buildDirectorPrompt(
    charName: string,
    userName: string,
    location: TheaterLocation,
    timeSlot: TimeSlot,
    eventType: EventType,
    recentEvents: DirectorEvent[],
    recentMemories?: string,
    existingLocationNames?: string[],
    allowLocationSuggestion?: boolean,
    options: DirectorPromptOptions = {},
): string {
    const timeLabel = TIME_SLOT_LABELS[timeSlot];
    const recentEventsText = recentEvents.length > 0
        ? recentEvents.slice(-3).map((e, i) => `  ${i + 1}. [${e.sceneType}] ${e.event}`).join('\n')
        : '  (无)';

    const memoryBlock = recentMemories
        ? `\n### 可用真实记忆片段（仅 callback 可用）\n${recentMemories}\n`
        : '';

    const recentContextBlock = options.recentContext?.trim()
        ? `\n### 当前对话上下文（避免打断正在发生的情绪）\n${options.recentContext.trim()}\n`
        : '';

    const forbiddenMotifsBlock = options.recentForbiddenMotifs?.trim()
        ? `\n### 近期禁止复用的事件素材\n以下桥段、NPC、事故形态或同义变体近期已经用过，不能再次使用：\n${options.recentForbiddenMotifs.trim()}\n`
        : '';

    const locationListBlock = existingLocationNames && existingLocationNames.length > 0
        ? `\n### 已有地点列表（如果建议换场景，优先从这里选；也可以创造新地点）\n${existingLocationNames.map(n => `- ${n}`).join('\n')}\n`
        : '';

    const locationSuggestionBlock = allowLocationSuggestion
        ? `
### 场景切换建议（可选）
如果你觉得当前地点的故事已经自然走到了该换场景的时刻（角色自然提议去某处、气氛需要转换、发生了需要离开的事件），
你**可以**在 JSON 中额外添加一个 "locationSuggestion" 字段。
**不是每次都需要**——只在剧情真的需要场景转换时才加。

"locationSuggestion" 格式：
{
  "name": "海边栈道",
  "nameEn": "Seaside Boardwalk",
  "reason": "聊到想看海，自然地提议去海边",
  "description": "面朝大海的木质栈道，海风吹着头发……（100-200字场景氛围描写）",
  "tags": ["romantic", "outdoor"],
  "travelMethod": "打车"
}
tags 只能从以下选择：romantic, daily, adventure, quiet, crowded, outdoor, indoor
`
        : '';

    return `你是一个互动小说的"导演"。你不扮演任何角色，你的工作是设计场景和事件。

### 当前场景
- 地点：${location.name}
- 地点氛围：${location.description}
- 时段：${timeLabel.icon} ${timeLabel.zh}
- 角色：${charName}（AI角色），${userName}（用户）

### 最近发生的事件
${recentEventsText}
${recentContextBlock}${memoryBlock}${forbiddenMotifsBlock}${locationListBlock}
### 你的任务
设计一个 **${EVENT_TYPE_DESCRIPTIONS[eventType]}**
${locationSuggestionBlock}
### 输出格式（严格 JSON，不要添加任何其他内容）
\`\`\`json
{
  "sceneType": "${eventType}",
  "atmosphere": "（100-150字的场景氛围描写：环境细节、光线、声音、气味、温度）",
  "event": "（50-100字的事件核心描述：发生了什么，谁做了什么）",
  "tension": 0.5,
  "npcHint": "（如果有NPC出现，简短描述NPC；没有则为空字符串）",
  "suggestedBeats": ["建议1", "建议2", "建议3"]
}
\`\`\`

### 规则
1. atmosphere 要有画面感，像电影开场镜头
2. event 是客观描述，不要写角色的内心活动
3. tension 范围 0.0-1.0（0=轻松，0.5=日常，0.8=紧张，1.0=高潮）
4. suggestedBeats 是给角色扮演者的提示，不是给用户看的
5. 不要重复最近发生过的事件
6. 事件必须符合地点和时段的逻辑（深夜的咖啡厅可能要打烊了）
7. 如果 sceneType 是 callback，只能基于“可用真实记忆片段”设计似曾相识的触发点；没有写在记忆里的过去，绝不能编造
8. 事故类桥段不是禁用，但如果近期禁止素材里出现过类似事故、外卖员、电动车、撞倒、受伤等元素，必须换成完全不同的事件形态
9. 只输出 JSON，不要输出任何其他文字`;
}

// ── Scene Injection Prompt (injected into Main API system prompt) ──

/**
 * Build the scene injection block that gets added to the character's system prompt.
 * This tells the character AI what's happening around them.
 */
export function buildTheaterSceneInjection(
    event: DirectorEvent,
    location: TheaterLocation,
    timeSlot: TimeSlot,
): string {
    const timeLabel = TIME_SLOT_LABELS[timeSlot];

    return `
### 【约会 · 导演指令】
你正在和对方在 **${location.name}** 度过 ${timeLabel.icon}${timeLabel.zh} 的时光。

**当前场景氛围**：
${event.atmosphere}

**正在发生的事**：
${event.event}
${event.npcHint ? `\n**周围的人**：${event.npcHint}` : ''}

**导演提示**（仅供参考，你可以自由发挥）：
${event.suggestedBeats.map(b => `- ${b}`).join('\n')}

### 重要规则
1. 你**不能无视**正在发生的事。必须对事件做出自然反应。
2. 你的反应必须符合你的性格，不要因为事件而突然变成另一个人。
3. 不要照搬导演提示的原文，用你自己的方式演绎。
4. 场景氛围是你看到、听到、感受到的，自然融入你的描写。
`;
}

/**
 * Build the initial ambient scene prompt (first entry into a location).
 * This is always triggered when entering a new location, not through pity.
 */
export function buildInitialScenePrompt(
    location: TheaterLocation,
    timeSlot: TimeSlot,
    charName: string,
    userName: string,
    fromLocationName?: string,
): string {
    const timeLabel = TIME_SLOT_LABELS[timeSlot];
    const arrivalContext = fromLocationName
        ? `${userName}和${charName}刚从 ${fromLocationName} 来到 ${location.name}。`
        : `${userName}和${charName}刚刚来到 ${location.name}。`;

    return `### 场景：感知新地点
当前时段: ${timeLabel.icon} ${timeLabel.zh}
地点: ${location.name}

### 任务
${arrivalContext}
${location.description}

请用**第三人称**写一段到场描写（3-5行）。
描述：
1. 你们走进这个地方时的第一感受（视觉、听觉、嗅觉）
2. ${charName}此刻的状态和反应
3. 一个有趣的环境细节

不要输出任何前缀，直接输出描写内容。用 [emotion] 标签开头每一行。`;
}

// ── 520 Special Prompt Injection ──

/**
 * 520 confession easter egg injection.
 * Only injected during night + romantic event during 520 event window.
 */
export function build520ConfessionHint(charName: string): string {
    return `
[520 SPECIAL · 仅在时机成熟时触发]
今天是一个特殊的日子。如果在这个夜晚，在这个浪漫的时刻，你感觉时机到了——
你可以说出平时不会说出口的话。不是被要求的，是你自己想说的。
但如果你觉得还不到时候，就当这段话不存在。
${charName}，这个选择权在你。
`;
}

// ── Director Response Parser ──

/**
 * Parse the director API response into a DirectorEvent object.
 * Handles various response formats (raw JSON, markdown-wrapped JSON, etc.)
 */
export function parseDirectorResponse(raw: string): DirectorEvent | null {
    try {
        // 1. Strip thinking tokens (<think>...</think>, <Thought>...</Thought>, etc.)
        let cleaned = raw.replace(/<(?:think|thought|reasoning)[^>]*>[\s\S]*?<\/(?:think|thought|reasoning)>/gi, '').trim();
        if (!cleaned) cleaned = raw.trim();

        // 2. Try to extract JSON — multiple strategies
        let jsonStr: string | null = null;

        // Strategy A: markdown code block (```json ... ```)
        const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
        }

        // Strategy B: find first { ... } block
        if (!jsonStr) {
            const braceStart = cleaned.indexOf('{');
            const braceEnd = cleaned.lastIndexOf('}');
            if (braceStart !== -1 && braceEnd > braceStart) {
                jsonStr = cleaned.slice(braceStart, braceEnd + 1);
            }
        }

        // Strategy C: starts with { but may be truncated (no closing brace)
        if (!jsonStr) {
            const braceStart = cleaned.indexOf('{');
            if (braceStart !== -1) {
                jsonStr = cleaned.slice(braceStart);
            }
        }

        if (!jsonStr) {
            console.warn('[TheaterDirector] No JSON found in response:', cleaned.slice(0, 200));
            return null;
        }

        // 3. Attempt to repair truncated JSON
        let parsed: any;
        try {
            parsed = JSON.parse(jsonStr);
        } catch {
            // Try to fix common truncation issues: missing closing brackets/braces
            let repaired = jsonStr;
            // Count unmatched braces and brackets
            const openBraces = (repaired.match(/{/g) || []).length;
            const closeBraces = (repaired.match(/}/g) || []).length;
            const openBrackets = (repaired.match(/\[/g) || []).length;
            const closeBrackets = (repaired.match(/\]/g) || []).length;

            // Strip trailing incomplete string/value (e.g. `"suggestedBeats": ["foo`, "bar`)
            repaired = repaired.replace(/,\s*"[^"]*$/, '');  // trailing incomplete key
            repaired = repaired.replace(/,\s*$/, '');          // trailing comma

            // Add missing brackets then braces
            for (let i = closeBrackets; i < openBrackets; i++) repaired += ']';
            for (let i = closeBraces; i < openBraces; i++) repaired += '}';

            try {
                parsed = JSON.parse(repaired);
                console.info('[TheaterDirector] Repaired truncated JSON successfully');
            } catch (e2) {
                console.error('[TheaterDirector] Failed to parse director response:', (e2 as Error).message);
                console.error('[TheaterDirector] Raw (first 300 chars):', raw.slice(0, 300));
                return null;
            }
        }

        // 4. Validate required fields
        if (!parsed.sceneType || !parsed.atmosphere || !parsed.event) {
            console.warn('[TheaterDirector] Incomplete director response:', parsed);
            return null;
        }

        return {
            sceneType: parsed.sceneType as EventType,
            atmosphere: String(parsed.atmosphere),
            event: String(parsed.event),
            tension: typeof parsed.tension === 'number' ? Math.max(0, Math.min(1, parsed.tension)) : 0.5,
            npcHint: parsed.npcHint ? String(parsed.npcHint) : undefined,
            suggestedBeats: Array.isArray(parsed.suggestedBeats)
                ? parsed.suggestedBeats.map(String)
                : [],
            timestamp: Date.now(),
            locationSuggestion: parsed.locationSuggestion ? {
                name: String(parsed.locationSuggestion.name || ''),
                nameEn: parsed.locationSuggestion.nameEn ? String(parsed.locationSuggestion.nameEn) : undefined,
                reason: String(parsed.locationSuggestion.reason || ''),
                description: String(parsed.locationSuggestion.description || ''),
                tags: Array.isArray(parsed.locationSuggestion.tags)
                    ? parsed.locationSuggestion.tags.filter((t: string) =>
                        ['romantic','daily','adventure','quiet','crowded','outdoor','indoor'].includes(t))
                    : ['daily'],
                travelMethod: String(parsed.locationSuggestion.travelMethod || '步行'),
            } as LocationSuggestion : undefined,
        };
    } catch (e) {
        console.error('[TheaterDirector] Unexpected error parsing director response:', e);
        console.error('[TheaterDirector] Raw (first 300 chars):', raw.slice(0, 300));
        return null;
    }
}

// ── Transition Director Prompt (场景切换转场) ──

/**
 * Build prompt for the director to generate a transition scene.
 * Called when user selects a new location OR accepts a director-suggested location.
 */
export function buildTransitionDirectorPrompt(
    charName: string,
    userName: string,
    fromLocation: TheaterLocation,
    toLocation: TheaterLocation,
    timeSlot: TimeSlot,
    recentEvents: DirectorEvent[],
): string {
    const timeLabel = TIME_SLOT_LABELS[timeSlot];
    const recentText = recentEvents.length > 0
        ? recentEvents.slice(-3).map((e, i) => `  ${i + 1}. [${e.sceneType}] ${e.event}`).join('\n')
        : '  (无)';

    return `你是一个互动小说的"导演"。你的任务是设计一段**场景转换过渡**。

### 当前状态
- 现在位于：${fromLocation.name}（${fromLocation.description.slice(0, 80)}…）
- 即将前往：${toLocation.name}（${toLocation.description.slice(0, 80)}…）
- 时段：${timeLabel.icon} ${timeLabel.zh}
- 角色：${charName}（AI角色），${userName}（用户）

### 最近事件
${recentText}

### 你的任务
设计从「${fromLocation.name}」到「${toLocation.name}」的转场。包括：
1. 离开当前地点的一个画面/细节
2. 合理的交通方式（步行/打车/地铁/骑车/公交等，根据两个地点的距离和性质判断）
3. 路上的一个小场景或画面（3-5句即可，不要太长）
4. 到达新地点时的第一感受

### 输出格式（严格 JSON）
\`\`\`json
{
  "departure": "（30-60字：离开旧地点的画面/动作）",
  "travelMethod": "步行",
  "travelScene": "（60-100字：路上的场景和互动，要有画面感）",
  "arrivalMood": "（一个词：期待/好奇/紧张/放松/兴奋）",
  "suggestedBeats": ["到达后的第一反应", "可以注意的环境细节"]
}
\`\`\`

### 规则
1. 转场要自然——像电影里的转场镜头，不是瞬移
2. 路上可以有小互动，但不要太戏剧化
3. 交通方式要合理（深夜去便利店大概率是步行，去海边可能要打车）
4. 只输出 JSON`;
}

/**
 * Parse transition director response into TransitionEvent.
 */
export function parseTransitionResponse(raw: string): TransitionEvent | null {
    try {
        let cleaned = raw.replace(/<(?:think|thought|reasoning)[^>]*>[\s\S]*?<\/(?:think|thought|reasoning)>/gi, '').trim();
        if (!cleaned) cleaned = raw.trim();

        let jsonStr: string | null = null;
        const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
        if (!jsonStr) {
            const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
            if (s !== -1 && e > s) jsonStr = cleaned.slice(s, e + 1);
        }
        if (!jsonStr) return null;

        let parsed: any;
        try { parsed = JSON.parse(jsonStr); } catch {
            let repaired = jsonStr;
            repaired = repaired.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
            const ob = (repaired.match(/{/g) || []).length;
            const cb = (repaired.match(/}/g) || []).length;
            const oq = (repaired.match(/\[/g) || []).length;
            const cq = (repaired.match(/]/g) || []).length;
            for (let i = cq; i < oq; i++) repaired += ']';
            for (let i = cb; i < ob; i++) repaired += '}';
            try { parsed = JSON.parse(repaired); } catch { return null; }
        }

        if (!parsed.departure || !parsed.travelScene) return null;

        return {
            departure: String(parsed.departure),
            travelMethod: String(parsed.travelMethod || '步行'),
            travelScene: String(parsed.travelScene),
            arrivalMood: String(parsed.arrivalMood || '期待'),
            suggestedBeats: Array.isArray(parsed.suggestedBeats) ? parsed.suggestedBeats.map(String) : [],
        };
    } catch {
        return null;
    }
}

/**
 * Build the transition scene injection for the main API.
 * Tells the character AI to write a complete departure → travel → arrival narrative.
 */
export function buildTransitionSceneInjection(
    transition: TransitionEvent,
    fromLocation: TheaterLocation,
    toLocation: TheaterLocation,
    timeSlot: TimeSlot,
): string {
    const timeLabel = TIME_SLOT_LABELS[timeSlot];

    return `
### 【约会 · 转场指令】
你们正在从 **${fromLocation.name}** 出发，前往 **${toLocation.name}**。
当前时段：${timeLabel.icon}${timeLabel.zh}

**离开的画面**：
${transition.departure}

**交通方式**：${transition.travelMethod}

**路上**：
${transition.travelScene}

**到达心情**：${transition.arrivalMood}

**导演提示**：
${transition.suggestedBeats.map(b => `- ${b}`).join('\n')}

### 写作要求
1. 写一段完整的从离开到到达的叙事（中等长度，8-12行）
2. 包含三个部分：①离开时的片刻 ②路上的互动或画面 ③到达新地点的第一感受
3. 保持你的角色性格，用你自己的方式演绎这段转场
4. 每一行都必须以 [emotion] 开头
5. 转场叙事之后**不要**再写对话——到达即结束
`;
}
