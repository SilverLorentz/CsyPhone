// @vitest-environment jsdom

import { describe,expect,it,vi } from 'vitest';
import type { GalleryImage,Message } from '../types';
import {
    buildGeneratedImageOriginalAssetId,
    getGalleryImageDisplayUrl,
    getImageMessageDisplayUrl,
    persistGeneratedImage,
    prepareGeneratedImageStorage,
    resolveGalleryImageOriginalUrl,
    resolveOriginalImageUrl,
} from './generatedImageStorage';

describe('generatedImageStorage', () => {
    it('stores inline generated originals in assets and returns thumbnail display URLs', async () => {
        const saveAsset = vi.fn(() => Promise.resolve());
        const createThumbnail = vi.fn(() => Promise.resolve('data:image/webp;base64,thumb'));
        const originalUrl = 'data:image/png;base64,original';

        const result = await prepareGeneratedImageStorage('photo-1', originalUrl, {
            createThumbnail,
            saveAsset,
        });

        expect(result).toMatchObject({
            displayUrl: 'data:image/webp;base64,thumb',
            thumbnailUrl: 'data:image/webp;base64,thumb',
            originalAssetId: buildGeneratedImageOriginalAssetId('photo-1'),
            photoAsset: {
                id: 'photo-1',
                thumbUrl: 'data:image/webp;base64,thumb',
                displayUrl: 'data:image/webp;base64,thumb',
                originalKind: 'dataUrl',
                mimeType: 'image/png',
                originalAssetId: buildGeneratedImageOriginalAssetId('photo-1'),
            },
        });
        expect(result.photoAsset?.createdAt).toEqual(expect.any(Number));
        expect(saveAsset).toHaveBeenCalledWith(
            buildGeneratedImageOriginalAssetId('photo-1'),
            originalUrl,
        );
    });

    it('stores remote generated originals as asset pointers for full-size previews', async () => {
        const saveAsset = vi.fn(() => Promise.resolve());
        const createThumbnail = vi.fn(() => Promise.resolve('data:image/webp;base64,thumb'));
        const remoteUrl = 'https://cdn.example/image.png';

        const result = await prepareGeneratedImageStorage('photo-remote', remoteUrl, {
            createThumbnail,
            saveAsset,
        });

        expect(result).toMatchObject({
            displayUrl: 'data:image/webp;base64,thumb',
            thumbnailUrl: 'data:image/webp;base64,thumb',
            originalAssetId: buildGeneratedImageOriginalAssetId('photo-remote'),
            photoAsset: {
                id: 'photo-remote',
                thumbUrl: 'data:image/webp;base64,thumb',
                displayUrl: remoteUrl,
                originalKind: 'url',
                originalAssetId: buildGeneratedImageOriginalAssetId('photo-remote'),
            },
        });
        expect(result.photoAsset?.createdAt).toEqual(expect.any(Number));
        expect(saveAsset).toHaveBeenCalledWith(
            buildGeneratedImageOriginalAssetId('photo-remote'),
            remoteUrl,
        );
    });

    it('does not use full base64 as the display URL when thumbnail generation fails', async () => {
        const saveAsset = vi.fn(() => Promise.resolve());
        const createThumbnail = vi.fn(() => Promise.resolve(undefined));
        const originalBase64 = btoa('fake-image-binary'.repeat(12));

        const asset = await persistGeneratedImage('photo-base64', {
            kind: 'base64',
            base64: originalBase64,
            mimeType: 'image/png',
        }, {
            createThumbnail,
            saveAsset,
        });

        expect(asset.thumbUrl).toMatch(/^data:image\/svg\+xml/);
        expect(asset.displayUrl).toBe(asset.thumbUrl);
        expect(asset.displayUrl).not.toContain(originalBase64);
        expect(asset.originalKind).toBe('base64');
        expect(saveAsset).toHaveBeenCalledWith(
            buildGeneratedImageOriginalAssetId('photo-base64'),
            `data:image/png;base64,${originalBase64}`,
        );
    });

    it('resolves originals from asset storage and falls back when missing', async () => {
        const getAsset = vi.fn()
            .mockResolvedValueOnce('data:image/png;base64,original')
            .mockResolvedValueOnce(null);

        await expect(resolveOriginalImageUrl('asset-1', 'thumb', { getAsset }))
            .resolves.toBe('data:image/png;base64,original');
        await expect(resolveOriginalImageUrl('asset-2', 'thumb', { getAsset }))
            .resolves.toBe('thumb');
    });

    it('uses thumbnails for list display and asset originals for gallery details', async () => {
        const message = {
            type: 'image',
            content: 'data:image/webp;base64,thumb',
            metadata: { thumbnailUrl: 'data:image/webp;base64,thumb' },
        } as Message;
        const image = {
            id: 'photo-1',
            charId: 'char-1',
            url: 'data:image/webp;base64,thumb',
            thumbnailUrl: 'data:image/webp;base64,thumb',
            originalAssetId: 'asset-1',
            timestamp: 1,
        } as GalleryImage;

        expect(getImageMessageDisplayUrl(message)).toBe('data:image/webp;base64,thumb');
        expect(getGalleryImageDisplayUrl(image)).toBe('data:image/webp;base64,thumb');
        await expect(resolveGalleryImageOriginalUrl(image, {
            getAsset: vi.fn(() => Promise.resolve('data:image/png;base64,original')),
        })).resolves.toBe('data:image/png;base64,original');
    });
});
