import { describe,expect,it } from 'vitest';
import { DATE_RECAP_SYSTEM_PROMPT,DEFAULT_DATE_SUMMARY_PROMPT } from './dateSummaryPrompts';
import { renderDateDiaryMemoryTemplate,toDateDiaryMemoryTemplate } from './dateDiaryMemory';

describe('dateDiaryMemory', () => {
    it('uses recap wording instead of long-term memory wording for date summaries', () => {
        expect(DATE_RECAP_SYSTEM_PROMPT).toContain('交接 recap');
        expect(DEFAULT_DATE_SUMMARY_PROMPT).toContain('重点放在“离场态”');
        expect(DEFAULT_DATE_SUMMARY_PROMPT).not.toContain('长期保存');
        expect(DEFAULT_DATE_SUMMARY_PROMPT).not.toContain('字面量占位符');
    });

    it('renders legacy placeholders for retrieval compatibility', () => {
        expect(renderDateDiaryMemoryTemplate(
            '我记得 {userName} 没有松开手，{charName} 也没有后退。',
            'Sully',
            '初时雨',
        )).toBe('我记得 初时雨 没有松开手，Sully 也没有后退。');
    });

    it('converts displayed names back to placeholders before saving', () => {
        expect(toDateDiaryMemoryTemplate(
            '我记得 初时雨 没有松开手，Sully 也没有后退。',
            'Sully',
            '初时雨',
        )).toBe('我记得 {userName} 没有松开手，{charName} 也没有后退。');
    });

    it('normalizes loose placeholder casing while rendering', () => {
        expect(renderDateDiaryMemoryTemplate(
            '我记得 ｛ username ｝ 递来的花。',
            'Sully',
            '初时雨',
        )).toBe('我记得 初时雨 递来的花。');
    });
});
