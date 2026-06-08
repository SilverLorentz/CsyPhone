import type { ExtractedImage,GalleryImage,Message,PhotoAsset } from '../types';
import { getAsset,saveAsset } from './db/contentStore';

const GENERATED_IMAGE_ORIGINAL_PREFIX = 'generated-image-original:';
const GENERATED_IMAGE_THUMBNAIL_FALLBACK = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%20160%22%3E%3Crect%20width%3D%22160%22%20height%3D%22160%22%20rx%3D%2220%22%20fill%3D%22%23eef2f7%22%2F%3E%3Cpath%20d%3D%22M38%20108l28-31%2021%2023%2012-13%2023%2021H38z%22%20fill%3D%22%23cbd5e1%22%2F%3E%3Ccircle%20cx%3D%22104%22%20cy%3D%2254%22%20r%3D%2214%22%20fill%3D%22%23dbe4ef%22%2F%3E%3C%2Fsvg%3E';

export interface GeneratedImageStorageDeps {
    createThumbnail?: (src: string, maxEdge?: number) => Promise<string | undefined>;
    getAsset?: (id: string) => Promise<string | null>;
    saveAsset?: (id: string, data: string) => Promise<void>;
}

export interface PreparedGeneratedImageStorage {
    displayUrl: string;
    thumbnailUrl?: string;
    originalAssetId?: string;
    photoAsset?: PhotoAsset;
}

export function isInlineImageDataUrl(value: unknown): value is string {
    return typeof value === 'string' && /^data:image\//i.test(value);
}

export function buildGeneratedImageOriginalAssetId(imageId: string): string {
    return `${GENERATED_IMAGE_ORIGINAL_PREFIX}${imageId}`;
}

function normalizeBase64Payload(base64: string): string {
    const rawBase64 = base64.includes(',') ? base64.split(',').pop() || '' : base64;
    const normalized = rawBase64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return normalized + padding;
}

function extractedImageToOriginalSource(image: ExtractedImage): { source: string; kind: ExtractedImage['kind']; mimeType?: string } {
    if (image.kind === 'url') {
        return { source: image.url, kind: image.kind };
    }
    if (image.kind === 'dataUrl') {
        return { source: image.dataUrl, kind: image.kind, mimeType: image.mimeType };
    }
    const mimeType = image.mimeType || 'image/png';
    return {
        source: `data:${mimeType};base64,${normalizeBase64Payload(image.base64)}`,
        kind: image.kind,
        mimeType,
    };
}

export function getImageMessageDisplayUrl(message: Message): string {
    return String(message.metadata?.thumbnailUrl || message.content || '');
}

export function getGalleryImageDisplayUrl(image: GalleryImage): string {
    return String(image.thumbnailUrl || image.url || '');
}

export function createImageThumbnail(src: string, maxEdge = 360): Promise<string | undefined> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
        return Promise.resolve(undefined);
    }

    return new Promise(resolve => {
        const img = new Image();
        if (/^https?:\/\//i.test(src)) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = () => {
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            if (!width || !height) {
                resolve(undefined);
                return;
            }

            const scale = Math.min(1, maxEdge / Math.max(width, height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(undefined);
                return;
            }

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            try {
                resolve(canvas.toDataURL('image/webp', 0.72));
            } catch {
                resolve(undefined);
            }
        };
        img.onerror = () => resolve(undefined);
        img.src = src;
    });
}

export async function prepareGeneratedImageStorage(
    imageId: string,
    originalUrl: string,
    deps: GeneratedImageStorageDeps = {},
): Promise<PreparedGeneratedImageStorage> {
    const extracted: ExtractedImage = isInlineImageDataUrl(originalUrl)
        ? { kind: 'dataUrl', dataUrl: originalUrl, mimeType: originalUrl.match(/^data:([^;,]+)/i)?.[1] || 'image/png' }
        : { kind: 'url', url: originalUrl };
    const asset = await persistGeneratedImage(imageId, extracted, deps);

    return {
        displayUrl: asset.thumbUrl,
        thumbnailUrl: asset.thumbUrl,
        originalAssetId: asset.originalAssetId,
        photoAsset: asset,
    };
}

export async function persistGeneratedImage(
    imageId: string,
    extractedImage: ExtractedImage,
    deps: GeneratedImageStorageDeps = {},
): Promise<PhotoAsset> {
    const createdAt = Date.now();
    const { source, kind, mimeType } = extractedImageToOriginalSource(extractedImage);
    const thumbnailUrl = await (deps.createThumbnail || createImageThumbnail)(source);
    const originalAssetId = buildGeneratedImageOriginalAssetId(imageId);

    await (deps.saveAsset || saveAsset)(originalAssetId, source);

    const isInlineOriginal = kind === 'base64' || kind === 'dataUrl';
    const safeThumbUrl = thumbnailUrl || (isInlineOriginal ? GENERATED_IMAGE_THUMBNAIL_FALLBACK : source);

    return {
        id: imageId,
        thumbUrl: safeThumbUrl,
        displayUrl: isInlineOriginal ? safeThumbUrl : source,
        originalKind: kind,
        mimeType,
        createdAt,
        originalAssetId,
    };
}

export async function resolveOriginalImageUrl(
    originalAssetId: string | undefined,
    fallbackUrl: string,
    deps: GeneratedImageStorageDeps = {},
): Promise<string> {
    if (!originalAssetId) return fallbackUrl;

    try {
        const original = await (deps.getAsset || getAsset)(originalAssetId);
        if (typeof original === 'string' && original) {
            return original;
        }
    } catch {
        // The thumbnail is still usable if the original asset read fails.
    }

    return fallbackUrl;
}

export function resolveGalleryImageOriginalUrl(
    image: GalleryImage,
    deps: GeneratedImageStorageDeps = {},
): Promise<string> {
    return resolveOriginalImageUrl(image.originalAssetId, image.url, deps);
}
