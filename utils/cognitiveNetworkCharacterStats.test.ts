import { describe, expect, it } from 'vitest';
import type { CharacterProfile } from '../types';
import {
    getOrphanCloudStats,
    getSelectedCharacterStats,
    type CognitiveCharStats,
} from './cognitiveNetworkCharacterStats';

function makeStats(charId: string, memories: number): CognitiveCharStats {
    return {
        charId,
        memories,
        relations: Math.max(0, memories - 1),
        temporalEdges: Math.max(0, memories - 1),
        semanticEdges: Math.max(0, memories - 1),
        linkedCount: Math.max(0, memories - 1),
        unscannedCount: memories,
    };
}

const xiaYizhou = {
    id: 'local-xia',
    charInstanceId: 'chinst_xia_local',
    templateCharId: 'template-xia',
    name: '夏以昼',
} as CharacterProfile;

describe('cognitive network character stats', () => {
    it('reports cloud stats that do not match any local character identity as orphaned', () => {
        const cloudStats = [
            makeStats('chinst_4fd2621c-c715-4605-b9c5-efa5ec72593d', 1582),
            makeStats('chinst_xia_local', 2),
        ];

        const orphans = getOrphanCloudStats(cloudStats, [xiaYizhou]);

        expect(orphans).toHaveLength(1);
        expect(orphans[0].charId).toBe('chinst_4fd2621c-c715-4605-b9c5-efa5ec72593d');
        expect(orphans[0].memories).toBe(1582);
    });

    it('matches selected local characters by instance id after binding', () => {
        const stats = [makeStats('chinst_xia_local', 1582)];

        const selectedStats = getSelectedCharacterStats(stats, [xiaYizhou], 'local-xia');

        expect(selectedStats?.memories).toBe(1582);
        expect(selectedStats?.relations).toBe(1581);
    });
});
