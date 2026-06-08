import type { Message } from '../types';
import { stripTranslationTags } from './chatParser';
import { shouldIncludeMessageInContext } from './messageContext';

export interface DateRequestContextMessage {
    role: Message['role'];
    content: string;
    sourceMessage: Message;
}

function getMessageSource(message: Message): string {
    const source = message.metadata?.source;
    return typeof source === 'string' ? source : '';
}

function compareMessagesByTimeline(a: Message, b: Message): number {
    return (a.timestamp || 0) - (b.timestamp || 0) || (a.id || 0) - (b.id || 0);
}

export function isMainChatContextMessageForDate(message: Message): boolean {
    const source = getMessageSource(message);
    if ((source === 'date' || source === 'theater') && message.metadata?.isDateContextBridge === true) {
        return true;
    }
    if (source === 'date' || source === 'theater') return false;
    return shouldIncludeMessageInContext(message);
}

export function formatDateContextContent(message: Message): string {
    if (message.type === 'image') return '[User sent an image]';
    return stripTranslationTags(message.content || '');
}

function selectRecentDateContextMessages(
    messages: Message[],
    limit: number,
): DateRequestContextMessage[] {
    return [...messages]
        .sort(compareMessagesByTimeline)
        .slice(-limit)
        .map(sourceMessage => {
            const content = formatDateContextContent(sourceMessage);
            return {
                role: sourceMessage.role,
                content,
                sourceMessage,
            };
        })
        .filter(item => item.content.trim().length > 0);
}

export function buildDateRequestContextMessages(input: {
    allMessages: Message[];
    currentSessionMessages?: Message[];
    contextLimit?: number;
}): DateRequestContextMessage[] {
    const contextLimit = Math.max(1, input.contextLimit || 500);
    const onlineMessages = input.allMessages.filter(isMainChatContextMessageForDate);
    const onlineContext = selectRecentDateContextMessages(
        onlineMessages,
        contextLimit,
    );

    const currentSessionMessages = (input.currentSessionMessages || [])
        .filter(shouldIncludeMessageInContext);
    const currentSessionContext = selectRecentDateContextMessages(
        currentSessionMessages,
        contextLimit,
    );

    const byId = new Map<number, DateRequestContextMessage>();
    for (const item of [...onlineContext, ...currentSessionContext]) {
        byId.set(item.sourceMessage.id, item);
    }

    return Array.from(byId.values()).sort((a, b) => compareMessagesByTimeline(a.sourceMessage, b.sourceMessage));
}
