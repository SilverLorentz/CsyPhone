import { loadHtml2Canvas } from './lazyThirdParty';

function makeUnsupportedColorRegex(): RegExp {
    return /(?:oklch|oklab|color-mix|lch|lab|color)\([^()]*(?:\([^()]*\)[^()]*)*\)/g;
}

async function sanitizeModernColors(clonedDoc: Document): Promise<void> {
    const unsupportedColor = makeUnsupportedColorRegex();

    clonedDoc.querySelectorAll('style').forEach(styleEl => {
        if (styleEl.textContent) {
            styleEl.textContent = styleEl.textContent.replace(unsupportedColor, 'transparent');
        }
    });

    const linkEls = Array.from(clonedDoc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
    await Promise.all(linkEls.map(async linkEl => {
        if (!linkEl.href) return;
        try {
            const res = await fetch(linkEl.href);
            const css = (await res.text()).replace(unsupportedColor, 'transparent');
            const styleEl = clonedDoc.createElement('style');
            styleEl.textContent = css;
            linkEl.parentNode?.replaceChild(styleEl, linkEl);
        } catch {
            // Keep export best-effort when a stylesheet cannot be fetched.
        }
    }));

    clonedDoc.querySelectorAll('[style]').forEach(el => {
        const styleAttr = el.getAttribute('style');
        if (styleAttr) {
            el.setAttribute('style', styleAttr.replace(unsupportedColor, 'transparent'));
        }
    });
}

export async function exportElementToPngBlob(
    element: HTMLElement,
    options: { scale?: number; backgroundColor?: string | null } = {},
): Promise<Blob> {
    if (document.fonts?.ready) {
        await document.fonts.ready;
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 80)));

    const html2canvas = await loadHtml2Canvas();
    const width = element.scrollWidth;
    const height = element.scrollHeight;
    const canvas = await html2canvas(element, {
        useCORS: true,
        logging: false,
        backgroundColor: options.backgroundColor ?? null,
        scale: options.scale ?? 1,
        width,
        height,
        windowWidth: Math.max(document.documentElement.scrollWidth, width),
        windowHeight: Math.max(document.documentElement.scrollHeight, height + 200),
        onclone: async (clonedDoc: Document) => {
            await sanitizeModernColors(clonedDoc);
        },
    });

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('PNG 导出失败'));
        }, 'image/png');
    });
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 1000);
}
