import { describe,expect,it } from 'vitest';
import { formatMessagesForSummary } from '../utils/dateSummaryPrompts';
import type { Message } from '../types';

const makeMessage = (content: string): Message => ({
    id: 1,
    charId: 'char-1',
    role: 'assistant',
    type: 'text',
    content,
    timestamp: 1_000,
    metadata: { source: 'date' },
});

describe('date summary prompt bilingual content', () => {
    it('keeps only original text when formatting stored bilingual date messages', () => {
        const formatted = formatMessagesForSummary([
            makeMessage('[shy]<翻译><原文>「描いてた」</原文><译文>「我在画画」</译文></翻译>'),
        ], 'Sully', '小米');

        expect(formatted).toContain('Sully: [shy]「描いてた」');
        expect(formatted).not.toContain('<翻译>');
        expect(formatted).not.toContain('<译文>');
        expect(formatted).not.toContain('我在画画');
    });
});
