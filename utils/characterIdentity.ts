import type { CharacterProfile } from '../types';

export const CHAR_INSTANCE_PREFIX = 'chinst_';

function fallbackUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const rand = Math.random() * 16 | 0;
        const value = char === 'x' ? rand : (rand & 0x3 | 0x8);
        return value.toString(16);
    });
}

/** @deprecated charInstanceId is being removed. Do not generate new instance IDs. */
export function generateCharInstanceId(): string {
    const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : fallbackUuid();
    return `${CHAR_INSTANCE_PREFIX}${uuid}`;
}

export function getCharacterTemplateId(char: Pick<CharacterProfile, 'id' | 'templateCharId'>): string {
    return (char.templateCharId || char.id).trim();
}

/**
 * Returns the canonical ID used for content ownership (messages, memories, etc.).
 * Always returns `char.id` — the IDB primary key.
 */
export function getCharacterContentId(char: Pick<CharacterProfile, 'id' | 'charInstanceId'>): string {
    return char.id.trim();
}

/**
 * @deprecated charInstanceId is being removed. This function now only backfills
 * templateCharId for existing characters. It no longer generates new charInstanceId values.
 */
export function ensureCharacterInstanceId(character: CharacterProfile): CharacterProfile {
    return {
        ...character,
        templateCharId: character.templateCharId || character.id,
    };
}
