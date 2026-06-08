import { describe, expect, it } from 'vitest';
import { buildDateHistoryContextBlock, injectDateHistoryAfterPreference } from './datePromptHistory';

describe('date prompt history injection', () => {
    it('formats recent dialogue as a system context block', () => {
        const block = buildDateHistoryContextBlock([
            { role: 'assistant', content: '会啊' },
            { role: 'user', content: '怎么突然想到问这个' },
        ], 'Ethan', '初初');

        expect(block).toContain('最近对话上下文');
        expect(block).toContain('Ethan: 会啊');
        expect(block).toContain('初初: 怎么突然想到问这个');
        expect(block).toContain('不是新的用户输入');
    });

    it('injects the history block immediately after soft devotion preference rules', () => {
        const prompt = '<soft_devotion_chat_mode>\n我想让TA感受到的是：我懂TA，尊重TA，偏爱TA。\n</soft_devotion_chat_mode>\n### 你的过去\n暂无';
        const block = '### 【最近对话上下文】\nEthan: 会啊';

        const result = injectDateHistoryAfterPreference(prompt, block);

        expect(result).toContain('</soft_devotion_chat_mode>\n\n### 【最近对话上下文】\nEthan: 会啊\n\n### 你的过去');
    });
});
