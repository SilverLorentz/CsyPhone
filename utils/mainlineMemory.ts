import type { Message } from '../types';

function getMessageSource(message: Message): string {
    const source = message.metadata?.source;
    return typeof source === 'string' ? source : '';
}

export function isDateContextBridgeMessage(message: Message): boolean {
    return message.metadata?.isDateContextBridge === true;
}

export function isUnsyncedTheaterMessage(message: Message): boolean {
    return getMessageSource(message) === 'theater' && !isDateContextBridgeMessage(message);
}

export function isMainlineReadableMessage(message: Message): boolean {
    return !isUnsyncedTheaterMessage(message);
}

export function isDateModeContextMessage(message: Message): boolean {
    if (!isMainlineReadableMessage(message)) return false;
    if (message.metadata?.hiddenFromUser) return isDateContextBridgeMessage(message);
    return true;
}
