import { describe, expect, it } from 'vitest';
import type { Message } from '../types';
import {
    isDateModeContextMessage,
    isMainlineReadableMessage,
    isUnsyncedTheaterMessage,
} from '../utils/mainlineMemory';

function msg(overrides: Partial<Message>): Message {
    return {
        id: overrides.id || 1,
        charId: 'char-1',
        role: overrides.role || 'assistant',
        type: overrides.type || 'text',
        content: overrides.content || '',
        timestamp: overrides.timestamp || 1,
        metadata: overrides.metadata,
    };
}

describe('mainlineMemory', () => {
    it('keeps ordinary and Date messages readable for Date mode', () => {
        expect(isDateModeContextMessage(msg({ id: 1, content: 'chat' }))).toBe(true);
        expect(isDateModeContextMessage(msg({ id: 2, content: 'date', metadata: { source: 'date' } }))).toBe(true);
    });

    it('blocks unsynced Theater messages from mainline and Date context', () => {
        const theaterRaw = msg({ id: 1, content: 'if line', metadata: { source: 'theater' } });
        const theaterSummary = msg({
            id: 2,
            role: 'system',
            content: 'hidden if summary',
            metadata: { source: 'theater', hiddenFromUser: true, isSummary: true },
        });

        expect(isUnsyncedTheaterMessage(theaterRaw)).toBe(true);
        expect(isMainlineReadableMessage(theaterRaw)).toBe(false);
        expect(isDateModeContextMessage(theaterRaw)).toBe(false);
        expect(isMainlineReadableMessage(theaterSummary)).toBe(false);
        expect(isDateModeContextMessage(theaterSummary)).toBe(false);
    });

    it('allows synced Theater bridges back into Date context', () => {
        const theaterBridge = msg({
            id: 1,
            role: 'system',
            content: 'synced summary',
            metadata: {
                source: 'theater',
                hiddenFromUser: true,
                isDateContextBridge: true,
                bridgeType: 'summary',
            },
        });

        expect(isUnsyncedTheaterMessage(theaterBridge)).toBe(false);
        expect(isMainlineReadableMessage(theaterBridge)).toBe(true);
        expect(isDateModeContextMessage(theaterBridge)).toBe(true);
    });
});
