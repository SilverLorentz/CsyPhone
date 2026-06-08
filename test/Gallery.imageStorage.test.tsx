// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import Gallery from '../apps/Gallery';

const galleryMocks = vi.hoisted(() => ({
    addToast: vi.fn(),
    closeApp: vi.fn(),
    deleteGalleryImage: vi.fn(),
    getAsset: vi.fn(),
    getGalleryImages: vi.fn(),
    updateGalleryImageReview: vi.fn(),
}));

vi.mock('../context/OSContext', () => ({
    useOS: () => ({
        closeApp: galleryMocks.closeApp,
        characters: [{ id: 'char-1', name: 'Sully', avatar: '/avatar.png' }],
        apiConfig: { apiKey: '', baseUrl: '', model: '' },
        addToast: galleryMocks.addToast,
    }),
}));

vi.mock('../utils/db', () => ({
    DB: {
        deleteGalleryImage: galleryMocks.deleteGalleryImage,
        getGalleryImages: galleryMocks.getGalleryImages,
        updateGalleryImageReview: galleryMocks.updateGalleryImageReview,
    },
}));

vi.mock('../utils/db/contentStore', () => ({
    getAsset: galleryMocks.getAsset,
    saveAsset: vi.fn(),
}));

describe('Gallery image storage', () => {
    beforeEach(() => {
        galleryMocks.addToast.mockClear();
        galleryMocks.closeApp.mockClear();
        galleryMocks.deleteGalleryImage.mockClear();
        galleryMocks.updateGalleryImageReview.mockClear();
        galleryMocks.getAsset.mockReset();
        galleryMocks.getGalleryImages.mockReset();
        galleryMocks.getGalleryImages.mockResolvedValue([
            {
                id: 'photo-1',
                charId: 'char-1',
                url: 'data:image/webp;base64,thumb',
                thumbnailUrl: 'data:image/webp;base64,thumb',
                originalAssetId: 'asset-original-1',
                visualSummary: '窗边自拍',
                timestamp: 1,
            },
        ]);
        galleryMocks.getAsset.mockResolvedValue('data:image/png;base64,original');
    });

    it('uses thumbnails in the grid and loads the original in detail view', async () => {
        render(<Gallery />);

        fireEvent.click(screen.getByText('Sully'));

        const gridImage = await screen.findByTestId('gallery-grid-image-photo-1');
        expect(gridImage).toHaveAttribute('src', 'data:image/webp;base64,thumb');

        fireEvent.click(gridImage.parentElement!);

        await waitFor(() => {
            expect(screen.getByTestId('gallery-detail-image')).toHaveAttribute(
                'src',
                'data:image/png;base64,original',
            );
        });
        expect(galleryMocks.getAsset).toHaveBeenCalledWith('asset-original-1');
    });
});
