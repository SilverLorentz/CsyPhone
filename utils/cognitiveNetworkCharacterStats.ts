import type { CharacterProfile } from '../types';

export interface CognitiveCharStats {
    charId: string;
    memories: number;
    relations: number;
    temporalEdges: number;
    semanticEdges: number;
    linkedCount: number;
    unscannedCount: number;
}

export function normalizeCharacterIdentityId(value?: string | null): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function getCharacterIdentityIds(
    char: Pick<CharacterProfile, 'id' | 'charInstanceId' | 'templateCharId'>,
): string[] {
    return Array.from(new Set([
        normalizeCharacterIdentityId(char.id),
        normalizeCharacterIdentityId(char.charInstanceId),
        normalizeCharacterIdentityId(char.templateCharId),
    ].filter(Boolean)));
}

export function findCharacterByAnyId(
    characters: CharacterProfile[],
    charId?: string | null,
): CharacterProfile | null {
    const normalized = normalizeCharacterIdentityId(charId);
    if (!normalized) return null;
    return characters.find(char => getCharacterIdentityIds(char).includes(normalized)) || null;
}

export function aggregateCharStats(stats: CognitiveCharStats[], charId = 'all'): CognitiveCharStats {
    return stats.reduce<CognitiveCharStats>((acc, stat) => ({
        charId: acc.charId,
        memories: acc.memories + (stat.memories || 0),
        relations: acc.relations + (stat.relations || 0),
        temporalEdges: acc.temporalEdges + (stat.temporalEdges || 0),
        semanticEdges: acc.semanticEdges + (stat.semanticEdges || 0),
        linkedCount: acc.linkedCount + (stat.linkedCount || 0),
        unscannedCount: acc.unscannedCount + (stat.unscannedCount || 0),
    }), {
        charId,
        memories: 0,
        relations: 0,
        temporalEdges: 0,
        semanticEdges: 0,
        linkedCount: 0,
        unscannedCount: 0,
    });
}

export function getSelectedCharacterStats(
    cloudStats: CognitiveCharStats[],
    characters: CharacterProfile[],
    selectedCharId?: string | null,
): CognitiveCharStats | null {
    if (cloudStats.length === 0) return null;
    if (!selectedCharId) return aggregateCharStats(cloudStats);

    const selectedCharacter = findCharacterByAnyId(characters, selectedCharId);
    const candidateIds = selectedCharacter
        ? getCharacterIdentityIds(selectedCharacter)
        : [normalizeCharacterIdentityId(selectedCharId)].filter(Boolean);
    const candidateSet = new Set(candidateIds);
    const matchedStats = cloudStats.filter(stat => candidateSet.has(normalizeCharacterIdentityId(stat.charId)));
    if (matchedStats.length === 0) return null;

    return aggregateCharStats(matchedStats, normalizeCharacterIdentityId(selectedCharId));
}

export function getOrphanCloudStats(
    cloudStats: CognitiveCharStats[],
    characters: CharacterProfile[],
): CognitiveCharStats[] {
    if (cloudStats.length === 0) return [];

    const localIdentityIds = new Set(characters.flatMap(getCharacterIdentityIds));
    return cloudStats.filter(stat => {
        const charId = normalizeCharacterIdentityId(stat.charId);
        return charId !== '' && !localIdentityIds.has(charId) && (stat.memories || 0) > 0;
    });
}
