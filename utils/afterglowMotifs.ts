const AFTERGLOW_MOTIF_MAX_LENGTH = 280;
const AFTERGLOW_CUSTOM_MOTIF_LIMIT = 80;

export const AFTERGLOW_CUSTOM_MOTIFS_STORAGE_KEY = 'afterglow_custom_motifs_v1';

export interface AfterglowCustomMotif {
    id: string;
    text: string;
    createdAt: number;
}

export type AfterglowGenerationMode = 'fanfic' | 'heartTalk';

export interface AfterglowGenerationOptions {
    mode?: AfterglowGenerationMode;
    userMotif?: string;
    customMotifs?: string[];
}

function getBrowserLocalStorage(): Storage | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage;
    } catch {
        return null;
    }
}

function createAfterglowMotifId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `ag-motif-${crypto.randomUUID()}`;
    }
    return `ag-motif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeAfterglowMotif(value: string | null | undefined): string {
    if (typeof value !== 'string') return '';

    return value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join(' / ')
        .replace(/[{}<>]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, AFTERGLOW_MOTIF_MAX_LENGTH);
}

export function parseAfterglowMotifInput(value: string | null | undefined): string[] {
    if (typeof value !== 'string') return [];

    const seen = new Set<string>();
    return value
        .split(/\r?\n/)
        .map(line => sanitizeAfterglowMotif(line))
        .filter(text => {
            if (!text || seen.has(text)) return false;
            seen.add(text);
            return true;
        });
}

function normalizeAfterglowCustomMotif(value: any): AfterglowCustomMotif | null {
    const text = sanitizeAfterglowMotif(value?.text);
    if (!text) return null;

    return {
        id: typeof value?.id === 'string' && value.id.trim() ? value.id.trim() : createAfterglowMotifId(),
        text,
        createdAt: Number.isFinite(value?.createdAt) ? Number(value.createdAt) : Date.now(),
    };
}

function persistAfterglowCustomMotifs(motifs: AfterglowCustomMotif[]): void {
    const storage = getBrowserLocalStorage();
    if (!storage) return;

    storage.setItem(
        AFTERGLOW_CUSTOM_MOTIFS_STORAGE_KEY,
        JSON.stringify(motifs.slice(0, AFTERGLOW_CUSTOM_MOTIF_LIMIT)),
    );
}

export function loadAfterglowCustomMotifs(): AfterglowCustomMotif[] {
    const storage = getBrowserLocalStorage();
    if (!storage) return [];

    try {
        const parsed = JSON.parse(storage.getItem(AFTERGLOW_CUSTOM_MOTIFS_STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];

        const seen = new Set<string>();
        return parsed
            .map(normalizeAfterglowCustomMotif)
            .filter((motif): motif is AfterglowCustomMotif => {
                if (!motif || seen.has(motif.text)) return false;
                seen.add(motif.text);
                return true;
            })
            .slice(0, AFTERGLOW_CUSTOM_MOTIF_LIMIT);
    } catch {
        return [];
    }
}

export function saveAfterglowCustomMotifsFromText(value: string): AfterglowCustomMotif[] {
    const additions = parseAfterglowMotifInput(value);
    if (additions.length === 0) return loadAfterglowCustomMotifs();

    const existing = loadAfterglowCustomMotifs();
    const seen = new Set(existing.map(motif => motif.text));
    const createdAt = Date.now();
    const nextAdditions = additions
        .filter(text => {
            if (seen.has(text)) return false;
            seen.add(text);
            return true;
        })
        .map((text, index) => ({
            id: createAfterglowMotifId(),
            text,
            createdAt: createdAt + index,
        }));

    const next = [...nextAdditions, ...existing].slice(0, AFTERGLOW_CUSTOM_MOTIF_LIMIT);
    persistAfterglowCustomMotifs(next);
    return next;
}

export function deleteAfterglowCustomMotif(id: string): AfterglowCustomMotif[] {
    const next = loadAfterglowCustomMotifs().filter(motif => motif.id !== id);
    persistAfterglowCustomMotifs(next);
    return next;
}
