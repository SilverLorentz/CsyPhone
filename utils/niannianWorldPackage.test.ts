import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNianNianWorldBibleMarkdown } from './niannianWorldPackage';

describe('niannianWorldPackage', () => {
    it('parses the external ancient China world pack into engine fields', () => {
        const markdown = readFileSync(
            'public/worldpacks/ancient-china.md',
            'utf8',
        );
        const world = parseNianNianWorldBibleMarkdown(markdown);

        expect(world.theme).toContain('古代中国');
        expect(world.worldStyle).toContain('浮生六记');
        expect(world.customPrompt).toContain('红楼梦');
        expect(world.seedStatus?.ta.好感).toBe(8);
        expect(world.seedStatus?.worldExtra.拘束).toBe(75);
        expect(world.hiddenVarsSeed?.缘分).toBe(5);
        expect(world.openingStep?.sceneText).toContain('上元的灯火');
        expect(world.openingStep?.options).toHaveLength(3);
        expect(world.eventWeights.初遇).toEqual(expect.objectContaining({
            公共节庆: 5,
            被迫独处: 2,
        }));
        expect(world.statusSchema).toEqual([
            { key: '拘束', label: '拘束', type: 'number', min: 0, max: 100 },
        ]);
    });
});
