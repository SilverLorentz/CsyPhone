import type { Message } from '../../types';
import { getEffectiveHistoryStartMessageId,isAfterHistoryStart } from '../../utils/historyStart';
import { formatMessageForContext,shouldIncludeMessageInContext } from '../../utils/messageContext';

export interface VoiceCallRecentContextMessage {
    id: number;
    charId: string;
    role: 'user' | 'assistant';
    type: 'text';
    content: string;
    timestamp: number;
}

const RECENT_CONTEXT_CHAR_LIMIT = 240;

function clipText(text: string, limit: number = RECENT_CONTEXT_CHAR_LIMIT): string {
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function serializeRecentContextMessage(message: Message): string | null {
    return formatMessageForContext(message, {
        surface: 'voiceCall',
        compact: true,
        maxContentChars: RECENT_CONTEXT_CHAR_LIMIT,
    });
}

export function buildVoiceCallRecentContextMessages(
    messages: Message[],
    options?: { limit?: number; hideBeforeMessageId?: number },
): VoiceCallRecentContextMessage[] {
    const limit = options?.limit ?? 50;
    const historyStartMessageId = getEffectiveHistoryStartMessageId(messages, options?.hideBeforeMessageId);

    const filtered = messages.filter((message) => {
        if (message.role !== 'user' && message.role !== 'assistant') return false;
        if (!isAfterHistoryStart(message, historyStartMessageId)) return false;
        return shouldIncludeMessageInContext(message);
    });

    return filtered
        .map((message) => {
            const serialized = serializeRecentContextMessage(message);
            if (!serialized) return null;

            return {
                id: message.id,
                charId: message.charId,
                role: message.role,
                type: 'text' as const,
                content: clipText(serialized),
                timestamp: message.timestamp,
            };
        })
        .filter((message): message is VoiceCallRecentContextMessage => !!message)
        .slice(-limit);
}

export function buildVoiceCallRecentContextTranscript(
    messages: VoiceCallRecentContextMessage[],
    userName: string,
    charName: string,
): string {
    return messages
        .map((message) => `${message.role === 'user' ? userName : charName}: ${message.content}`)
        .join('\n');
}
