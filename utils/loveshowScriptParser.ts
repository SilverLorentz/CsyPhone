/** 解析后的脚本节点 */
export type ScriptNode =
    | { type: 'narration'; content: string }
    | { type: 'dialogue'; character: string; content: string }
    | { type: 'interview'; character: string; content: string }
    | { type: 'phone'; content: string }
    | { type: 'text'; content: string };

/** 完整的场景解析结果 */
export interface ParsedScene {
    nodes: ScriptNode[];
    /** 从对话中提取到的所有角色名 */
    detectedCharacters: string[];
}

const NARRATION_RE = /^\*(.+?)\*$/ms;
const DIALOGUE_RE = /^([^\s：:*「」]{1,20})[：:]\s*(?:[「『""](.+?)[」』""]|(.+))$/m;
const INTERVIEW_RE = /^(?:📹\s*|[（(]对镜头[）)]\s*)([^\s：:]{1,20})[：:]\s*(.+)$/m;
const PHONE_RE = /^📱\s*(.+)$/m;
const INLINE_NARRATION_RE = /\*([\s\S]+?)\*/g;
const INLINE_DIALOGUE_RE = /^([^\s：:*「」]{1,20})[：:]\s*(?:[「『""]([\s\S]+?)[」』""]|([\s\S]+))$/;

function fullMatch(text: string, re: RegExp): RegExpMatchArray | null {
    const match = text.match(re);
    return match && match[0] === text ? match : null;
}

function parseSingleBlock(text: string): ScriptNode | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const interviewMatch = fullMatch(trimmed, INTERVIEW_RE);
    if (interviewMatch) {
        return {
            type: 'interview',
            character: interviewMatch[1].trim(),
            content: stripQuotes(interviewMatch[2].trim()),
        };
    }

    const phoneMatch = fullMatch(trimmed, PHONE_RE);
    if (phoneMatch) {
        return { type: 'phone', content: phoneMatch[1].trim() };
    }

    const dialogueMatch = fullMatch(trimmed, DIALOGUE_RE);
    if (dialogueMatch) {
        return {
            type: 'dialogue',
            character: dialogueMatch[1].trim(),
            content: stripQuotes((dialogueMatch[2] || dialogueMatch[3] || '').trim()),
        };
    }

    const narrationMatch = fullMatch(trimmed, NARRATION_RE);
    if (narrationMatch && !narrationMatch[1].includes('*')) {
        return { type: 'narration', content: narrationMatch[1].trim() };
    }

    return null;
}

function parseBlock(text: string): ScriptNode[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const singleNode = parseSingleBlock(trimmed);
    if (singleNode) return [singleNode];

    const nodes: ScriptNode[] = [];
    let cursor = 0;

    while (cursor < trimmed.length) {
        const spacing = trimmed.slice(cursor).match(/^\s*/)?.[0] || '';
        cursor += spacing.length;
        if (cursor >= trimmed.length) break;

        if (trimmed[cursor] === '*') {
            INLINE_NARRATION_RE.lastIndex = cursor;
            const match = INLINE_NARRATION_RE.exec(trimmed);
            if (match && match.index === cursor) {
                nodes.push({ type: 'narration', content: match[1].trim() });
                cursor = match.index + match[0].length;
                continue;
            }
        }

        const lineEndMatch = trimmed.slice(cursor).match(/\r?\n/);
        const lineEnd = lineEndMatch?.index === undefined ? trimmed.length : cursor + lineEndMatch.index;
        const line = trimmed.slice(cursor, lineEnd).trim();
        if (line) nodes.push(...parseInlineContent(line));
        cursor = lineEnd;
    }

    return nodes.length > 0 ? nodes : [{ type: 'text', content: trimmed }];
}

/** 检测文本是否像恋综格式（包含对话格式 or 星号旁白） */
export function hasLoveShowFormat(text: string): boolean {
    return parseLoveShowScript(text).nodes.some((node) => node.type !== 'text');
}

/** 从对话内容中去除引号（「」『』""） */
export function stripQuotes(text: string): string {
    const trimmed = text.trim();
    for (const [open, close] of [['「', '」'], ['『', '』'], ['"', '"'], ['“', '”']] as Array<[string, string]>) {
        if (trimmed.startsWith(open) && trimmed.endsWith(close)) {
            return trimmed.slice(open.length, -close.length).trim();
        }
    }

    return trimmed;
}

/** 合并连续的同类型节点（如连续的 narration） */
export function mergeConsecutiveNodes(nodes: ScriptNode[]): ScriptNode[] {
    const merged: ScriptNode[] = [];

    for (const node of nodes) {
        const previous = merged[merged.length - 1];
        if (
            previous &&
            previous.type === node.type &&
            'content' in previous &&
            'content' in node &&
            !('character' in previous) &&
            !('character' in node)
        ) {
            previous.content = `${previous.content}\n${node.content}`.trim();
        } else {
            merged.push({ ...node });
        }
    }

    return merged;
}

/**
 * 从一段混合文本中提取交错的旁白和对话。
 * 处理 AI 不换行就混写的情况：`*他笑了笑。*阿昊：「那走吧。」`。
 */
export function parseInlineContent(line: string): ScriptNode[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    const singleNode = parseSingleBlock(trimmed);
    if (singleNode) return [singleNode];
    if (!trimmed.startsWith('*')) return [{ type: 'text', content: trimmed }];

    const nodes: ScriptNode[] = [];
    let cursor = 0;

    while (cursor < trimmed.length) {
        const spacing = trimmed.slice(cursor).match(/^\s*/)?.[0] || '';
        cursor += spacing.length;
        if (cursor >= trimmed.length) break;

        if (trimmed[cursor] !== '*') {
            const rest = trimmed.slice(cursor).trim();
            const dialogueMatch = fullMatch(rest, INLINE_DIALOGUE_RE);
            if (!dialogueMatch || nodes.length === 0) return [{ type: 'text', content: trimmed }];

            nodes.push({
                type: 'dialogue',
                character: dialogueMatch[1].trim(),
                content: stripQuotes((dialogueMatch[2] || dialogueMatch[3] || '').trim()),
            });
            cursor = trimmed.length;
            break;
        }

        INLINE_NARRATION_RE.lastIndex = cursor;
        const match = INLINE_NARRATION_RE.exec(trimmed);
        if (!match || match.index !== cursor) return [{ type: 'text', content: trimmed }];

        nodes.push({ type: 'narration', content: match[1].trim() });
        cursor = match.index + match[0].length;
    }

    return nodes.length > 0 ? nodes : [{ type: 'text', content: trimmed }];
}

/**
 * 将 AI 自然文本输出解析为结构化节点。
 */
export function parseLoveShowScript(raw: string): ParsedScene {
    const blocks = raw.split(/\r?\n\s*\r?\n/);
    let nodes = blocks.flatMap(parseBlock);

    if (nodes.length > 1 && nodes.every((node) => node.type === 'text')) {
        nodes = [{ type: 'text', content: raw.trim() }];
    }

    const dialogueNodes = nodes.filter((node): node is Extract<ScriptNode, { type: 'dialogue' }> => node.type === 'dialogue');
    const detectedCharacters = Array.from(new Set(dialogueNodes.map((node) => node.character)));

    return { nodes, detectedCharacters };
}
