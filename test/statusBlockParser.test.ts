import { describe, expect, it } from 'vitest';
import { buildStatusSampleV2, parseStatusBlock } from '../utils/statusBlockParser';

describe('statusBlockParser', () => {
    it('parses scalar fields with half-width and full-width colons', () => {
        const parsed = parseStatusBlock('<status>\n时间: 22:15\n心情：安静\n</status>');

        expect(parsed?.fields).toEqual({
            时间: '22:15',
            心情: '安静',
        });
    });

    it('parses list fields with dash items', () => {
        const parsed = parseStatusBlock('<status>\n弹幕:\n  - 刚刚那句好真\n  - 用户A: 别装冷静了\n</status>');

        expect(parsed?.fields.弹幕).toEqual(['刚刚那句好真', '用户A: 别装冷静了']);
    });

    it('parses mixed scalar and list fields beyond 20 fields', () => {
        const scalarLines = Array.from({ length: 21 }, (_, index) => `字段${index + 1}: 值${index + 1}`);
        const parsed = parseStatusBlock(`<status>\n${scalarLines.join('\n')}\n物品:\n- 雨伞\n- 钥匙\n</status>`);

        expect(parsed?.fields.字段1).toBe('值1');
        expect(parsed?.fields.字段21).toBe('值21');
        expect(parsed?.fields.物品).toEqual(['雨伞', '钥匙']);
    });

    it('ignores extra blank lines and whitespace', () => {
        const parsed = parseStatusBlock('x\n<status>\n\n  地点 :   图书馆  \n\n  待办:\n    -  看材料  \n\n</status>');

        expect(parsed?.fields).toEqual({
            地点: '图书馆',
            待办: ['看材料'],
        });
    });

    it('returns null when no status block exists', () => {
        expect(parseStatusBlock('没有状态块')).toBeNull();
    });

    it('maps fuzzy field names to provided definitions', () => {
        const parsed = parseStatusBlock('<status>\n心 情: 稳住\n当前地点: 书桌\n</status>', [
            { name: '心情' },
            { name: '地点' },
        ]);

        expect(parsed?.fields.心情).toBe('稳住');
        expect(parsed?.fields.地点).toBe('书桌');
    });

    it('builds scalar and list samples', () => {
        expect(buildStatusSampleV2([
            { name: '时间', type: 'text' },
            { name: '弹幕', type: 'list' },
        ])).toBe('<status>\n时间: 时间示例值\n弹幕:\n  - 弹幕示例1\n  - 弹幕示例2\n  - 弹幕示例3\n</status>');
    });
});
