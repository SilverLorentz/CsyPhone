import type { Message } from '../types';

function normalizeHistoryStartMessageId(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : undefined;
}

export function getEffectiveHistoryStartMessageId(
    messages: Pick<Message, 'id'>[],
    value: unknown,
): number | undefined {
    const historyStartMessageId = normalizeHistoryStartMessageId(value);
    if (!historyStartMessageId) return undefined;
    const messageIds = messages
        .map(message => message.id)
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id));

    if (messageIds.includes(historyStartMessageId)) return historyStartMessageId;
    if (messageIds.length > 0 && messageIds.every(id => id >= historyStartMessageId)) return historyStartMessageId;
    return undefined;
}

export function isAfterHistoryStart(
    message: Pick<Message, 'id'>,
    historyStartMessageId: number | undefined,
): boolean {
    return !historyStartMessageId || message.id >= historyStartMessageId;
}
