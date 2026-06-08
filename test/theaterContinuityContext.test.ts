import { describe, expect, it } from 'vitest';
import type { Message } from '../types';
import { buildTheaterMainlineContinuityContext } from '../utils/theaterDirector';

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

describe('buildTheaterMainlineContinuityContext', () => {
    it('keeps recent mainline state while excluding unsynced Theater branch dialogue', () => {
        const context = buildTheaterMainlineContinuityContext([
            msg({
                id: 1,
                content: '旧剧场还停在闹分手。',
                timestamp: 1,
                metadata: { source: 'theater', branchId: 'old' },
            }),
            msg({
                id: 2,
                role: 'user',
                content: '刚才我们已经说开了，不分手了。',
                timestamp: 2,
            }),
            msg({
                id: 3,
                content: '嗯，我们和好了，今天重新开始。',
                timestamp: 3,
            }),
        ], 'Sully', '初初');

        expect(context).toContain('入场前主线近况');
        expect(context).toContain('不分手了');
        expect(context).toContain('我们和好了');
        expect(context).not.toContain('旧剧场还停在闹分手');
    });

    it('allows synced Theater bridge summaries back into Theater continuity', () => {
        const context = buildTheaterMainlineContinuityContext([
            msg({
                id: 1,
                role: 'system',
                content: '上次约会最后已经互相道歉并和好。',
                timestamp: 1,
                metadata: {
                    source: 'theater',
                    hiddenFromUser: true,
                    isDateContextBridge: true,
                    bridgeType: 'summary',
                },
            }),
        ], 'Sully', '初初');

        expect(context).toContain('约会剧场总结');
        expect(context).toContain('已经互相道歉并和好');
    });
});
