// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DB } from './index';
import type { SavedVibeReference } from '../../types';
import { buildVibeEncodingCacheKey } from '../vibeReferences';

function resetIndexedDb() {
    Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
    Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });
}

function createSavedVibe(id = 'vibe-1'): SavedVibeReference {
    return {
        id,
        name: 'Soft color',
        previewUrl: 'data:image/png;base64,cHJldmlldw==',
        imageDataUrl: 'data:image/png;base64,b3JpZ2luYWw=',
        defaultStrength: 0.6,
        defaultInformationExtracted: 0.6,
        encodings: {},
        source: 'image',
        createdAt: 1000,
        updatedAt: 1000,
    };
}

describe('vibeReferenceStore', () => {
    beforeEach(() => {
        resetIndexedDb();
        localStorage.clear();
    });

    it('saves, reads, renames, updates cache, clears cache, and deletes Vibe references', async () => {
        await DB.saveSavedVibeReference(createSavedVibe());

        let vibes = await DB.getSavedVibeReferences();
        expect(vibes).toHaveLength(1);
        expect(vibes[0].name).toBe('Soft color');

        await DB.renameSavedVibeReference('vibe-1', 'Film tone');
        expect((await DB.getSavedVibeReference('vibe-1'))?.name).toBe('Film tone');

        await DB.upsertSavedVibeEncoding('vibe-1', {
            model: 'nai-diffusion-4-full',
            informationExtracted: 0.6,
            encodedReference: 'encoded',
            updatedAt: 2000,
        });
        const cached = await DB.getSavedVibeReference('vibe-1');
        expect(cached?.encodings[buildVibeEncodingCacheKey('nai-diffusion-4-full', 0.6)]?.encodedReference).toBe('encoded');

        await DB.clearSavedVibeReferenceCache('vibe-1');
        expect(Object.keys((await DB.getSavedVibeReference('vibe-1'))?.encodings || {})).toHaveLength(0);

        await DB.deleteSavedVibeReference('vibe-1');
        vibes = await DB.getSavedVibeReferences();
        expect(vibes).toHaveLength(0);
    });
});
