// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { buildVibeEncodingCacheKey, parseNaiv4VibeFile } from '../utils/vibeReferences';

describe('vibeReferences helpers', () => {
    it('imports a single .naiv4vibe JSON file into a saved Vibe reference', async () => {
        const file = new File([JSON.stringify({
            identifier: 'novelai-vibe-transfer',
            name: 'Blue film',
            image: 'b3JpZ2luYWw=',
            thumbnail: 'dGh1bWI=',
            encodings: {
                'nai-diffusion-4-full': {
                    '0.6': 'encoded-06',
                    strong: {
                        information_extracted: 0.9,
                        encoding: 'encoded-09',
                    },
                },
            },
        })], 'blue.naiv4vibe');

        const saved = await parseNaiv4VibeFile(file);

        expect(saved.name).toBe('Blue film');
        expect(saved.source).toBe('naiv4vibe');
        expect(saved.imageDataUrl).toBe('data:image/png;base64,b3JpZ2luYWw=');
        expect(saved.previewUrl).toBe('data:image/png;base64,dGh1bWI=');
        expect(saved.encodings[buildVibeEncodingCacheKey('nai-diffusion-4-full', 0.6)]?.encodedReference).toBe('encoded-06');
        expect(saved.encodings[buildVibeEncodingCacheKey('nai-diffusion-4-full', 0.9)]?.encodedReference).toBe('encoded-09');
    });
});
