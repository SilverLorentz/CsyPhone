import { describe, expect, it } from 'vitest';
import { normalizeMessageForVectorExtraction } from './messageCompatibility';

const baseMessage = {
    id: 1,
    charId: 'char-1',
    type: 'text',
    content: 'some useful evidence',
    timestamp: 1710000000000,
};

describe('normalizeMessageForVectorExtraction', () => {
    it('keeps phone evidence system messages for vector extraction', () => {
        const normalized = normalizeMessageForVectorExtraction({
            ...baseMessage,
            role: 'system',
            metadata: { source: 'phone', phoneTitle: 'missed call' },
        });

        expect(normalized).toMatchObject({
            role: 'system',
            type: 'text',
            content: 'some useful evidence',
            metadata: { source: 'phone' },
        });
    });

    it('keeps story phone evidence system messages for vector extraction', () => {
        const normalized = normalizeMessageForVectorExtraction({
            ...baseMessage,
            role: 'system',
            metadata: { source: 'story_phone', phonePeekTitle: 'last stop' },
        });

        expect(normalized?.metadata?.source).toBe('story_phone');
    });

    it('still excludes ordinary system messages from vector extraction', () => {
        const normalized = normalizeMessageForVectorExtraction({
            ...baseMessage,
            role: 'system',
            metadata: { source: 'connection' },
        });

        expect(normalized).toBeNull();
    });
});
