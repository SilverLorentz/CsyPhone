import type { CharacterProfile,GroupProfile } from '../types';

export type GroupDirectorUserContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

export interface GroupDirectorImageAttachment {
    tag: number;
    url: string;
}

const SPEAKER_KEYS = [
    'charId',
    'characterId',
    'memberId',
    'speakerId',
    'senderId',
    'id',
    'name',
    'charName',
    'characterName',
    'speaker',
    'sender',
    'character',
    'role',
] as const;

const CONTENT_KEYS = ['content', 'message', 'text', 'reply', 'body'] as const;

export function isAttachableGroupDirectorImageUrl(value: unknown): value is string {
    return typeof value === 'string' && /^(data:|https?:\/\/)/i.test(value.trim());
}

export function buildGroupDirectorUserContent(
    prompt: string,
    attachedImages: GroupDirectorImageAttachment[],
): string | GroupDirectorUserContentPart[] {
    if (attachedImages.length === 0) return prompt;
    return [
        { type: 'text', text: prompt },
        ...attachedImages.map(img => ({
            type: 'image_url' as const,
            image_url: { url: img.url },
        })),
    ];
}

function normalizeComparable(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value)
        .trim()
        .replace(/^[\s"'“”‘’`@#]+|[\s"'“”‘’`]+$/g, '')
        .replace(/^(?:id|charid|characterid|角色id|角色|成员|speaker|sender)\s*[:：]\s*/i, '')
        .trim()
        .toLocaleLowerCase();
}

function collectStringCandidates(value: unknown): string[] {
    if (typeof value === 'string' || typeof value === 'number') {
        const raw = String(value).trim();
        const wrapped = Array.from(raw.matchAll(/[（([]\s*([^（）()[\]]+?)\s*[）)\]]/g))
            .map(match => match[1]);
        return [raw, ...wrapped].filter(Boolean);
    }

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const nestedKeys = ['id', 'charId', 'characterId', 'memberId', 'name', 'charName', 'characterName'];
        return nestedKeys.flatMap(key => collectStringCandidates(record[key]));
    }

    return [];
}

export function findGroupCharacterByMemberId(
    memberId: string,
    characters: CharacterProfile[],
): CharacterProfile | undefined {
    const memberKey = normalizeComparable(memberId);
    if (!memberKey) return undefined;
    return characters.find(character =>
        normalizeComparable(character.id) === memberKey
        || normalizeComparable(character.charInstanceId) === memberKey,
    );
}

export function getGroupMemberCharacters(
    group: GroupProfile,
    characters: CharacterProfile[],
): CharacterProfile[] {
    const seen = new Set<string>();
    const members: CharacterProfile[] = [];

    for (const memberId of group.members) {
        const character = findGroupCharacterByMemberId(memberId, characters);
        if (!character || seen.has(character.id)) continue;
        seen.add(character.id);
        members.push(character);
    }

    return members;
}

export function normalizeGroupProfileMembers(
    group: GroupProfile,
    characters: CharacterProfile[],
): { group: GroupProfile; changed: boolean } {
    const seen = new Set<string>();
    let changed = false;
    const members: string[] = [];

    for (const memberId of group.members) {
        const character = findGroupCharacterByMemberId(memberId, characters);
        const normalizedId = character?.id || memberId;
        if (normalizedId !== memberId) changed = true;
        if (seen.has(normalizedId)) {
            changed = true;
            continue;
        }
        seen.add(normalizedId);
        members.push(normalizedId);
    }

    return {
        group: changed ? { ...group, members } : group,
        changed,
    };
}

export function normalizeGroupProfiles(
    groups: GroupProfile[],
    characters: CharacterProfile[],
): { groups: GroupProfile[]; changedGroups: GroupProfile[] } {
    const changedGroups: GroupProfile[] = [];
    const normalizedGroups = groups.map(group => {
        const result = normalizeGroupProfileMembers(group, characters);
        if (result.changed) changedGroups.push(result.group);
        return result.group;
    });

    return { groups: normalizedGroups, changedGroups };
}

export function getGroupDirectorActionContent(action: unknown): string {
    if (typeof action === 'string') return action.trim();
    if (!action || typeof action !== 'object') return '';

    const record = action as Record<string, unknown>;
    for (const key of CONTENT_KEYS) {
        const value = record[key];
        if (typeof value === 'string') return value.trim();
        if (Array.isArray(value)) {
            return value
                .map(item => typeof item === 'string' ? item.trim() : '')
                .filter(Boolean)
                .join('\n');
        }
    }

    return '';
}

export function resolveGroupDirectorMemberId(
    action: unknown,
    group: GroupProfile,
    characters: CharacterProfile[],
): string | null {
    if (!action || typeof action !== 'object') return null;
    const record = action as Record<string, unknown>;
    const candidates = SPEAKER_KEYS.flatMap(key => collectStringCandidates(record[key]))
        .map(normalizeComparable)
        .filter(Boolean);

    if (candidates.length === 0) return null;

    for (const memberId of group.members) {
        const character = findGroupCharacterByMemberId(memberId, characters);
        const memberKeys = [
            memberId,
            character?.id,
            character?.charInstanceId,
            character?.name,
        ].map(normalizeComparable).filter(Boolean);

        for (const candidate of candidates) {
            if (memberKeys.some(key => key === candidate)) {
                return character?.id || memberId;
            }
            if (character && [character.id, character.charInstanceId].some(id => {
                const key = normalizeComparable(id);
                return key && candidate.includes(key);
            })) {
                return character.id;
            }
        }
    }

    return null;
}

function actionsFromParsedJson(parsed: unknown): unknown[] {
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || typeof parsed !== 'object') return [];

    const record = parsed as Record<string, unknown>;
    for (const key of ['actions', 'messages', 'replies', 'data']) {
        if (Array.isArray(record[key])) return record[key] as unknown[];
    }

    return [];
}

export function parseGroupDirectorActions(raw: unknown): unknown[] {
    const direct = actionsFromParsedJson(raw);
    if (direct.length > 0) return direct;
    if (typeof raw !== 'string') return [];

    const text = raw
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .trim();

    try {
        return actionsFromParsedJson(JSON.parse(text));
    } catch {
        // Continue with substring extraction below.
    }

    const starts = Array.from(text.matchAll(/\[/g)).map(match => match.index ?? -1).filter(index => index >= 0);
    for (const start of starts) {
        let end = text.lastIndexOf(']');
        while (end > start) {
            try {
                const parsed = JSON.parse(text.slice(start, end + 1));
                const actions = actionsFromParsedJson(parsed);
                if (actions.length > 0) return actions;
            } catch {
                // Try a shorter bracket range.
            }
            end = text.lastIndexOf(']', end - 1);
        }
    }

    return [];
}
