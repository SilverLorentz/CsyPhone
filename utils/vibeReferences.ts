import JSZip from 'jszip';
import type { NaiImageModel, SavedVibeEncoding, SavedVibeReference, VibeReferenceInput } from '../types';

export const MAX_VIBE_REFERENCES = 3;
export const DEFAULT_VIBE_STRENGTH = 0.6;
export const DEFAULT_VIBE_INFORMATION_EXTRACTED = 0.6;

export const VIBE_STRENGTH_OPTIONS = [
    { label: '低', value: 0.35 },
    { label: '中', value: DEFAULT_VIBE_STRENGTH },
    { label: '高', value: 0.85 },
];

export const VIBE_INFORMATION_OPTIONS = [
    { label: '保守', value: 0.3 },
    { label: '默认', value: DEFAULT_VIBE_INFORMATION_EXTRACTED },
    { label: '强烈', value: 0.9 },
];

const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SUPPORTED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;
const NAI_VIBE_IDENTIFIER = 'novelai-vibe-transfer';

export function randomVibeId(prefix = 'vibe'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isSupportedVibeImageFile(file: File): boolean {
    return SUPPORTED_IMAGE_MIME_TYPES.has(file.type) || SUPPORTED_IMAGE_EXTENSIONS.test(file.name);
}

export function isNaiv4VibeFile(file: File): boolean {
    return /\.naiv4vibe$/i.test(file.name);
}

export function isNaiv4VibeBundleFile(file: File): boolean {
    return /\.naiv4vibebundle$/i.test(file.name);
}

export function dataUrlToBase64(dataUrl: string): string {
    const value = String(dataUrl || '').trim();
    const commaIndex = value.indexOf(',');
    return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

export async function fileToDataUrl(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

function normalizeInformationExtracted(value: unknown): number | null {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.min(1, Math.max(0, number));
}

function normalizeImageDataUrl(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const raw = value.trim();
    if (raw.startsWith('data:image/')) return raw;
    if (/^[A-Za-z0-9+/=\s]+$/.test(raw)) {
        return `data:image/png;base64,${raw.replace(/\s+/g, '')}`;
    }
    return undefined;
}

function nestedString(source: unknown, keys: string[]): string | undefined {
    if (!source || typeof source !== 'object') return undefined;
    for (const key of keys) {
        const value = (source as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value && typeof value === 'object') {
            const nested = nestedString(value, ['data', 'base64', 'image']);
            if (nested) return nested;
        }
    }
    return undefined;
}

export function normalizeNaiVibeModelKey(value: unknown): string {
    const raw = String(value || '').trim();
    const key = raw.toLowerCase().replace(/[\s_]+/g, '-');
    if (!key) return '';
    if (key.includes('4-5') || key.includes('4.5')) {
        if (key.includes('curated')) return 'nai-diffusion-4-5-curated';
        return 'nai-diffusion-4-5-full';
    }
    if (key.includes('furry') && key.includes('3')) return 'nai-diffusion-furry-3';
    if (key.includes('diffusion-3') || key === 'v3' || key.includes('nai3')) return 'nai-diffusion-3';
    if (key.includes('4')) {
        if (key.includes('curated')) return 'nai-diffusion-4-curated-preview';
        return 'nai-diffusion-4-full';
    }
    return raw;
}

export function buildVibeEncodingCacheKey(model: string, informationExtracted: number): string {
    const normalizedModel = normalizeNaiVibeModelKey(model) || String(model || '').trim();
    return `${normalizedModel}|${Number(informationExtracted).toFixed(3)}`;
}

export function getSavedVibeEncoding(
    vibe: SavedVibeReference,
    model: string,
    informationExtracted: number,
): SavedVibeEncoding | undefined {
    const exact = vibe.encodings?.[buildVibeEncodingCacheKey(model, informationExtracted)];
    if (exact) return exact;
    const normalizedModel = normalizeNaiVibeModelKey(model);
    return Object.values(vibe.encodings || {}).find(encoding =>
        normalizeNaiVibeModelKey(encoding.model) === normalizedModel
        && Math.abs(Number(encoding.informationExtracted) - informationExtracted) < 0.001,
    );
}

export function isNaiVibeSupportedModel(model: string): model is NaiImageModel {
    const normalized = normalizeNaiVibeModelKey(model);
    return normalized === 'nai-diffusion-4-5-full'
        || normalized === 'nai-diffusion-4-5-curated'
        || normalized === 'nai-diffusion-4-full'
        || normalized === 'nai-diffusion-4-curated-preview';
}

function pickModelFromPath(path: string[]): string {
    for (const part of [...path].reverse()) {
        const normalized = normalizeNaiVibeModelKey(part);
        if (normalized.startsWith('nai-diffusion-')) return normalized;
    }
    return '';
}

function collectEncodingEntries(
    node: unknown,
    path: string[] = [],
    entries: SavedVibeEncoding[] = [],
): SavedVibeEncoding[] {
    if (!node || typeof node !== 'object') return entries;
    const record = node as Record<string, unknown>;
    const encoded = nestedString(record, ['encoding', 'encodedReference', 'encoded_reference', 'reference_image', 'referenceImage']);
    const information = normalizeInformationExtracted(
        record.informationExtracted
        ?? record.information_extracted
        ?? record.information
        ?? record.i,
    );
    if (encoded && information !== null) {
        const modelCandidate = record.model || pickModelFromPath(path);
        entries.push({
            model: normalizeNaiVibeModelKey(modelCandidate) || String(modelCandidate || 'unknown'),
            informationExtracted: information,
            encodedReference: encoded,
            updatedAt: Date.now(),
        });
    }

    for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string') {
            const infoFromKey = normalizeInformationExtracted(key);
            if (infoFromKey !== null && value.trim()) {
                const modelCandidate = pickModelFromPath(path);
                entries.push({
                    model: normalizeNaiVibeModelKey(modelCandidate) || String(modelCandidate || 'unknown'),
                    informationExtracted: infoFromKey,
                    encodedReference: value.trim(),
                    updatedAt: Date.now(),
                });
            }
        } else if (value && typeof value === 'object') {
            collectEncodingEntries(value, [...path, key], entries);
        }
    }
    return entries;
}

function savedVibeFromRawPayload(raw: Record<string, unknown>, fileName: string): SavedVibeReference {
    if (raw.identifier && raw.identifier !== NAI_VIBE_IDENTIFIER) {
        throw new Error('这个文件不是 NovelAI Vibe 文件');
    }
    const now = Date.now();
    const name = String(raw.name || raw.title || fileName.replace(/\.naiv4vibe$/i, '') || '导入的 Vibe').trim();
    const imageDataUrl = normalizeImageDataUrl(nestedString(raw, ['image', 'originalImage', 'original_image', 'referenceImage', 'reference_image']));
    const previewUrl = normalizeImageDataUrl(nestedString(raw, ['thumbnail', 'preview', 'previewImage', 'preview_image'])) || imageDataUrl;
    const entries = collectEncodingEntries(raw.encodings || raw.encoding || raw.references || raw);
    const encodings: Record<string, SavedVibeEncoding> = {};
    for (const entry of entries) {
        encodings[buildVibeEncodingCacheKey(entry.model, entry.informationExtracted)] = entry;
    }
    if (!imageDataUrl && Object.keys(encodings).length === 0) {
        throw new Error('Vibe 文件里没有可用原图或编码');
    }
    return {
        id: randomVibeId('saved-vibe'),
        name,
        previewUrl,
        imageDataUrl,
        defaultStrength: DEFAULT_VIBE_STRENGTH,
        defaultInformationExtracted: DEFAULT_VIBE_INFORMATION_EXTRACTED,
        encodings,
        source: 'naiv4vibe',
        importedFileName: fileName,
        createdAt: now,
        updatedAt: now,
    };
}

async function readJsonFromPossibleZip(file: File): Promise<Record<string, unknown>> {
    const zip = await JSZip.loadAsync(file);
    const files = Object.values(zip.files) as JSZip.JSZipObject[];
    const jsonFile = files.find(entry => !entry.dir && /\.json$/i.test(entry.name))
        || files.find(entry => !entry.dir);
    if (!jsonFile) throw new Error('Vibe 文件包里没有可读取内容');
    return JSON.parse(await jsonFile.async('text'));
}

export async function parseNaiv4VibeFile(file: File): Promise<SavedVibeReference> {
    if (isNaiv4VibeBundleFile(file)) {
        throw new Error('暂不支持 .naiv4vibeBundle，请先导入单个 .naiv4vibe 文件');
    }
    if (!isNaiv4VibeFile(file)) {
        throw new Error('请选择 .naiv4vibe 文件');
    }
    let raw: Record<string, unknown>;
    try {
        raw = JSON.parse(await file.text());
    } catch {
        raw = await readJsonFromPossibleZip(file);
    }
    return savedVibeFromRawPayload(raw, file.name);
}

export function buildSavedVibeFromImage(reference: VibeReferenceInput): SavedVibeReference {
    if (!reference.imageDataUrl) throw new Error('这张参考图缺少原图数据，无法保存');
    const now = Date.now();
    return {
        id: randomVibeId('saved-vibe'),
        name: reference.name || '新的 Vibe',
        previewUrl: reference.previewUrl || reference.imageDataUrl,
        imageDataUrl: reference.imageDataUrl,
        defaultStrength: reference.strength || DEFAULT_VIBE_STRENGTH,
        defaultInformationExtracted: reference.informationExtracted || DEFAULT_VIBE_INFORMATION_EXTRACTED,
        encodings: {},
        source: 'image',
        createdAt: now,
        updatedAt: now,
    };
}

export function buildVibeInputFromSaved(vibe: SavedVibeReference): VibeReferenceInput {
    return {
        id: randomVibeId('vibe-ref'),
        name: vibe.name,
        previewUrl: vibe.previewUrl,
        imageDataUrl: vibe.imageDataUrl,
        savedVibeId: vibe.id,
        strength: vibe.defaultStrength || DEFAULT_VIBE_STRENGTH,
        informationExtracted: vibe.defaultInformationExtracted || DEFAULT_VIBE_INFORMATION_EXTRACTED,
    };
}
