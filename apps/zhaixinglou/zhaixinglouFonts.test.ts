import { describe,expect,it } from 'vitest';
import {
    createZhaixinglouFontFaceCss,
    isValidFontUrl,
    sanitizeZhaixinglouFontSettings,
} from './zhaixinglouFonts';

describe('zhaixinglouFonts', () => {
    it('sanitizes settings to known local slots only', () => {
        const settings = sanitizeZhaixinglouFontSettings({
            version: 1,
            slots: {
                title: { source: 'url', url: 'https://example.com/title.woff2', updatedAt: 123 },
                bodyCn: { source: 'asset', assetKey: 'zhaixinglou_font_bodyCn', fileName: 'body.woff2' },
                unknown: { source: 'url', url: 'https://example.com/nope.woff2' },
                script: { source: 'url', url: 'javascript:alert(1)' },
            },
        });

        expect(settings.title).toEqual({
            source: 'url',
            url: 'https://example.com/title.woff2',
            updatedAt: 123,
        });
        expect(settings.bodyCn?.source).toBe('asset');
        expect(settings.bodyCn?.assetKey).toBe('zhaixinglou_font_bodyCn');
        expect(settings.script).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(settings, 'unknown')).toBe(false);
    });

    it('only accepts http and https font URLs', () => {
        expect(isValidFontUrl('https://example.com/font.woff2')).toBe(true);
        expect(isValidFontUrl('http://example.com/font.woff')).toBe(true);
        expect(isValidFontUrl('data:font/woff2;base64,abc')).toBe(false);
        expect(isValidFontUrl('javascript:alert(1)')).toBe(false);
    });

    it('creates font-face CSS for configured slots', () => {
        const css = createZhaixinglouFontFaceCss({
            title: 'https://example.com/title.woff2',
            script: 'https://example.com/script.woff2',
        });

        expect(css).toContain('font-family: "ZhaixinglouTitle";');
        expect(css).toContain('src: url("https://example.com/title.woff2");');
        expect(css).toContain('font-family: "Dancing Script";');
        expect(css).not.toContain('ZhaixinglouCN');
    });
});
