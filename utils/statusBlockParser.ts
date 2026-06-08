export interface ParsedStatusBlock {
    fields: Record<string, string | string[]>;
    raw: string;
}

type StatusFieldDef = {
    name: string;
    type?: 'text' | 'list';
    description?: string;
};

const STATUS_BLOCK_RE = /<status>([\s\S]*?)<\/status>/i;
const FIELD_LINE_RE = /^\s*([^:：\n][^:：]*?)\s*[:：]\s*(.*?)\s*$/;
const LIST_ITEM_RE = /^\s*-\s*(.*?)\s*$/;

function normalizeFieldName(value: string): string {
    return value.trim().replace(/\s+/g, '').toLocaleLowerCase();
}

function getEditDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;

    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    const current = Array.from({ length: b.length + 1 }, () => 0);

    for (let i = 1; i <= a.length; i += 1) {
        current[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + cost,
            );
        }
        for (let j = 0; j <= b.length; j += 1) {
            previous[j] = current[j];
        }
    }

    return previous[b.length];
}

function resolveFieldName(rawKey: string, fieldDefs?: Array<{ name: string }>): string {
    const key = rawKey.trim();
    if (!fieldDefs?.length) return key;

    const normalizedKey = normalizeFieldName(key);
    const exact = fieldDefs.find(field => normalizeFieldName(field.name) === normalizedKey);
    if (exact) return exact.name;

    const contained = fieldDefs.find(field => {
        const normalizedField = normalizeFieldName(field.name);
        return normalizedField && (normalizedKey.includes(normalizedField) || normalizedField.includes(normalizedKey));
    });
    if (contained) return contained.name;

    let best: { name: string; distance: number } | null = null;
    for (const field of fieldDefs) {
        const normalizedField = normalizeFieldName(field.name);
        if (!normalizedField) continue;

        const distance = getEditDistance(normalizedKey, normalizedField);
        if (!best || distance < best.distance) {
            best = { name: field.name, distance };
        }
    }

    if (!best) return key;

    const longest = Math.max(normalizedKey.length, normalizeFieldName(best.name).length);
    const threshold = longest <= 4 ? 1 : Math.max(1, Math.floor(longest * 0.34));
    return best.distance <= threshold ? best.name : key;
}

function appendListItem(
    fields: Record<string, string | string[]>,
    currentKey: string | null,
    item: string,
): void {
    if (!currentKey) return;

    const existing = fields[currentKey];
    if (Array.isArray(existing)) {
        existing.push(item);
    } else if (typeof existing === 'string' && existing.trim()) {
        fields[currentKey] = [existing, item];
    } else {
        fields[currentKey] = [item];
    }
}

export function parseStatusBlock(
    aiOutput: string,
    fieldDefs?: Array<{ name: string }>,
): ParsedStatusBlock | null {
    const blockMatch = (aiOutput || '').match(STATUS_BLOCK_RE);
    if (!blockMatch) return null;

    const raw = blockMatch[1].trim();
    const fields: Record<string, string | string[]> = {};
    let currentListKey: string | null = null;

    for (const sourceLine of raw.split(/\r?\n/)) {
        const line = sourceLine.trimEnd();
        if (!line.trim()) continue;

        const listMatch = line.match(LIST_ITEM_RE);
        if (listMatch && currentListKey) {
            appendListItem(fields, currentListKey, listMatch[1].trim());
            continue;
        }

        const fieldMatch = line.match(FIELD_LINE_RE);
        if (fieldMatch) {
            const key = resolveFieldName(fieldMatch[1], fieldDefs);
            const value = fieldMatch[2].trim();

            if (value) {
                fields[key] = value;
                currentListKey = null;
            } else {
                fields[key] = Array.isArray(fields[key]) ? fields[key] : [];
                currentListKey = key;
            }
            continue;
        }
    }

    return { fields, raw };
}

export function buildStatusSampleV2(fields: StatusFieldDef[]): string {
    const lines: string[] = ['<status>'];

    const fieldList = fields.length > 0
        ? fields
        : [{ name: '字段1', type: 'text' as const, description: '字段1示例值' }];

    for (const field of fieldList) {
        const name = field.name?.trim() || '字段';
        if (field.type === 'list') {
            lines.push(`${name}:`);
            lines.push(`  - ${name}示例1`);
            lines.push(`  - ${name}示例2`);
            lines.push(`  - ${name}示例3`);
        } else {
            lines.push(`${name}: ${name}示例值`);
        }
    }

    lines.push('</status>');
    return lines.join('\n');
}
