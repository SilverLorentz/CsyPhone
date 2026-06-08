// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DB } from './index';
import { SULLY_CATEGORY_ID, SULLY_PRESET_EMOJIS } from './core';

function resetIndexedDb() {
    Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
    Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });
    localStorage.clear();
}

describe('contentStore emoji initialization', () => {
    beforeEach(() => {
        resetIndexedDb();
    });

    it('seeds preset emojis only for a fresh empty emoji category store', async () => {
        await DB.initializeEmojiData();

        const categories = await DB.getEmojiCategories();
        const emojis = await DB.getEmojis();

        expect(categories.find(category => category.id === 'default')?.isSystem).toBe(true);
        expect(categories.find(category => category.id === SULLY_CATEGORY_ID)?.isSystem).toBe(false);
        expect(emojis.map(emoji => emoji.name)).toEqual(
            expect.arrayContaining(SULLY_PRESET_EMOJIS.map(emoji => emoji.name)),
        );
    });

    it('does not recreate deleted preset emoji categories on later initialization', async () => {
        await DB.initializeEmojiData();
        await DB.deleteEmojiCategory(SULLY_CATEGORY_ID);

        await DB.initializeEmojiData();

        const categories = await DB.getEmojiCategories();
        const emojis = await DB.getEmojis();
        const presetNames = new Set(SULLY_PRESET_EMOJIS.map(emoji => emoji.name));

        expect(categories.some(category => category.id === SULLY_CATEGORY_ID)).toBe(false);
        expect(emojis.some(emoji => presetNames.has(emoji.name))).toBe(false);
    });
});

describe('contentStore startup assets', () => {
    beforeEach(() => {
        resetIndexedDb();
    });

    it('loads only boot-critical assets and leaves generated image originals for on-demand reads', async () => {
        await DB.saveAsset('wallpaper', 'wallpaper-data');
        await DB.saveAsset('icon_chat', 'icon-data');
        await DB.saveAsset('widget_clock', 'widget-data');
        await DB.saveAsset('deco_rose', 'deco-data');
        await DB.saveAsset('appearance_preset_soft', 'preset-data');
        await DB.saveAsset('generated-image-original:photo-1', 'data:image/png;base64,large-original');
        await DB.saveAsset('spark_user_bg', 'social-bg-data');

        const startupAssets = await DB.getStartupAssets();
        const ids = startupAssets.map(asset => asset.id).sort();

        expect(ids).toEqual([
            'appearance_preset_soft',
            'deco_rose',
            'icon_chat',
            'wallpaper',
            'widget_clock',
        ]);
        expect(startupAssets.some(asset => asset.data.includes('large-original'))).toBe(false);
        expect(await DB.getAsset('generated-image-original:photo-1')).toBe('data:image/png;base64,large-original');
    });
});
