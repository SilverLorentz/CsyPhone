// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DB } from '../utils/db';
import { ensureCharacterInstanceId, getCharacterContentId } from '../utils/characterIdentity';
import type { CharacterProfile } from '../types';

function resetIndexedDb() {
    Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
    Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });
}

function makeCharacter(overrides: Partial<CharacterProfile> = {}): CharacterProfile {
    return {
        id: 'preset-sully-v2',
        name: 'Sully',
        avatar: '',
        description: '',
        systemPrompt: '',
        memories: [],
        ...overrides,
    };
}

describe('character identity', () => {
    beforeEach(() => {
        resetIndexedDb();
        localStorage.clear();
        localStorage.setItem('csyos_user_id', 'csy-user-test');
    });

    it('getCharacterContentId always returns char.id regardless of charInstanceId', () => {
        const charWithInstance = makeCharacter({ charInstanceId: 'chinst_old-123' });
        expect(getCharacterContentId(charWithInstance)).toBe('preset-sully-v2');

        const charWithout = makeCharacter();
        expect(getCharacterContentId(charWithout)).toBe('preset-sully-v2');
    });

    it('ensureCharacterInstanceId backfills templateCharId but does not generate charInstanceId', () => {
        const character = ensureCharacterInstanceId(makeCharacter());

        expect(character.id).toBe('preset-sully-v2');
        expect(character.templateCharId).toBe('preset-sully-v2');
        // Should NOT generate a new charInstanceId
        expect(character.charInstanceId).toBeUndefined();
    });

    it('ensureCharacterInstanceId preserves existing charInstanceId', () => {
        const character = ensureCharacterInstanceId(
            makeCharacter({ charInstanceId: 'chinst_existing' }),
        );

        expect(character.charInstanceId).toBe('chinst_existing');
        expect(character.templateCharId).toBe('preset-sully-v2');
    });

    it('reads legacy chinst_ data via resolveCharacterReadIds (backward compat)', async () => {
        const charInstanceId = 'chinst_test-sully-instance';
        await DB.saveCharacter(makeCharacter({ charInstanceId, templateCharId: 'preset-sully-v2' }));

        // Simulate legacy data stored under the chinst_ ID
        await DB.saveMessage({
            charId: charInstanceId,
            role: 'assistant',
            type: 'text',
            content: 'legacy chinst message',
            metadata: { backendMessageId: 'backend-msg-1' },
        });

        // Reading by primary id should still find the message stored under chinst_
        const messages = await DB.getMessagesByCharId('preset-sully-v2');
        expect(messages).toHaveLength(1);
        expect(messages[0].content).toBe('legacy chinst message');

        // Dedup should work across both IDs
        const deduped = await DB.saveMessageOnceByBackendId({
            charId: 'preset-sully-v2',
            role: 'assistant',
            type: 'text',
            content: 'duplicate from backend',
            metadata: { backendMessageId: 'backend-msg-1' },
        });
        expect(deduped.saved).toBe(false);
    });
});
