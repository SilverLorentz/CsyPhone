import { describe, expect, it } from 'vitest';
import {
    NIANNIAN_SCENE_VISUALS,
    resolveNianNianSceneVisual,
} from './niannianSceneVisuals';

describe('niannianSceneVisuals', () => {
    it('registers the complete 28-scene asset set with stable numbered files', () => {
        expect(NIANNIAN_SCENE_VISUALS).toHaveLength(28);
        expect(new Set(NIANNIAN_SCENE_VISUALS.map(scene => scene.imageUrl)).size).toBe(28);

        NIANNIAN_SCENE_VISUALS.forEach((scene, index) => {
            const expectedPrefix = String(index + 1).padStart(2, '0');
            expect(scene.imageUrl).toContain(`/scene-${expectedPrefix}-`);
        });
    });

    it('resolves current status text to the closest scene image', () => {
        expect(resolveNianNianSceneVisual({
            location: '长街灯市',
            situation: '上元人海中与陌生人四目相对',
        }).imageUrl).toContain('scene-13-deng-hui-ye-shi.png');

        expect(resolveNianNianSceneVisual({
            location: '廊下',
            situation: '雨势渐急,两人被迫避在檐下',
        }).imageUrl).toContain('scene-09-yan-xia-hui-lang.png');
    });

    it('keeps legacy scene categories working after switching to image backgrounds', () => {
        expect(resolveNianNianSceneVisual({ category: '朝堂' }).imageUrl).toContain('scene-23-da-dian-chao-tang.png');
        expect(resolveNianNianSceneVisual({ category: '药铺' }).imageUrl).toContain('scene-26-yi-guan-yao-pu.png');
    });
});
