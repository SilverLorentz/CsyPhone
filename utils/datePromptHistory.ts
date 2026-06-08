export interface DatePromptHistoryItem {
    role: string;
    content: string;
}

const SOFT_DEVOTION_END_TAG = '</soft_devotion_chat_mode>';

function speakerLabel(role: string, charName: string, userName: string): string {
    if (role === 'user') return userName;
    if (role === 'assistant') return charName;
    return '系统';
}

export function buildDateHistoryContextBlock(
    items: DatePromptHistoryItem[],
    charName: string,
    userName: string,
): string {
    const lines = items
        .map(item => {
            const content = (item.content || '').trim();
            if (!content) return '';
            return `${speakerLabel(item.role, charName, userName)}: ${content}`;
        })
        .filter(Boolean);

    if (lines.length === 0) return '';

    return `### 【最近对话上下文】
以下是进入这轮见面回复前已经发生过的最近记录。它们只是共同经历的背景，不是新的用户输入；请自然承接，不要复述为记录或系统说明。

${lines.join('\n')}`;
}

export function injectDateHistoryAfterPreference(systemPrompt: string, historyBlock: string): string {
    const block = historyBlock.trim();
    if (!block) return systemPrompt;

    const markerIndex = systemPrompt.indexOf(SOFT_DEVOTION_END_TAG);
    if (markerIndex < 0) return `${systemPrompt}\n\n${block}\n`;

    const insertAt = markerIndex + SOFT_DEVOTION_END_TAG.length;
    return `${systemPrompt.slice(0, insertAt)}\n\n${block}\n${systemPrompt.slice(insertAt)}`;
}
