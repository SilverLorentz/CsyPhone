/**
 * AssetPreloader — Silently preloads all tarot image assets and font
 *
 * Mount this at the ZhaixinglouApp level. It renders nothing visible but
 * triggers browser cache loading for all borders, card backs, and the font file.
 * This eliminates flash-of-unstyled-content when entering StarMirror.
 */
import { useEffect } from 'react';
import { PRELOAD_IMAGES } from './tarotData';

/** Preload a single image by creating a hidden Image object */
function preloadImage(url: string): Promise<void> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve(); // fail silently
        img.src = url;
    });
}

/** Preload the TarotFont by triggering a font load check */
function preloadFont(): Promise<void> {
    return new Promise((resolve) => {
        if (document.fonts && document.fonts.load) {
            document.fonts.load('1em TarotFont').then(() => resolve()).catch(() => resolve());
        } else {
            resolve();
        }
    });
}

/**
 * Hook that preloads all tarot assets on mount.
 * Call this at the top of ZhaixinglouApp.
 */
export function useTarotPreloader() {
    useEffect(() => {
        // Fire-and-forget: preload all images and font in parallel
        const tasks = [
            ...PRELOAD_IMAGES.map(preloadImage),
            preloadFont(),
        ];
        Promise.all(tasks);
    }, []);
}

/**
 * Lightweight prefetch for PhoneShell idle callback.
 * Only loads the critical first-screen assets (card back + fonts),
 * NOT the full tarot border set — that's handled by useTarotPreloader
 * once ZhaixinglouApp actually mounts.
 */
export function prefetchZhaixinglouAssets() {
    // Card back image (used in the card carousel first screen)
    preloadImage('https://i.postimg.cc/jS3qsYhB/MEITU-20260225-013328235.jpg');

    // Inject <link rel="preload"> hints for font files — now served locally from public/fonts/
    const fontUrls = [
        '/fonts/zhaixinglou-title.woff2',  // ZhaixinglouTitle (~16KB)
        '/fonts/zhaixinglou-body.woff2',   // ZhaixinglouFont (~31KB)
        '/fonts/zhaixinglou-cn.woff2',      // ZhaixinglouCN (full Chinese font, WOFF2 compressed)
    ];
    for (const url of fontUrls) {
        if (!document.querySelector(`link[href="${url}"]`)) {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'font';
            link.type = url.endsWith('.woff2') ? 'font/woff2' : 'font/ttf';
            link.href = url;
            link.crossOrigin = 'anonymous';
            document.head.appendChild(link);
        }
    }

    // Trigger font load check (works now that @font-face is declared in zhaixinglou.css)
    if (document.fonts?.load) {
        document.fonts.load('1em ZhaixinglouFont').catch(() => { });
        document.fonts.load('1em ZhaixinglouCN').catch(() => { });
        document.fonts.load('1em ZhaixinglouTitle').catch(() => { });
    }
}
