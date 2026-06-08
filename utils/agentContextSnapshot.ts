import type { CharacterProfile } from '../types';

const DEFAULT_MAX_BLOCK_LENGTH = 1200;
const DEFAULT_REFINED_MEMORY_LIMIT = 6;

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number = DEFAULT_MAX_BLOCK_LENGTH): string {
    const compact = collapseWhitespace(value);
    if (compact.length <= maxLength) return compact;
    return `${compact.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function stableSerialize(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(',')}]`;
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nestedValue]) => `${key}:${stableSerialize(nestedValue)}`);
        return `{${entries.join(',')}}`;
    }

    return String(value);
}

export function buildMountedWorldbooksDigest(
    mountedWorldbooks: CharacterProfile['mountedWorldbooks'],
    _options: { maxItems?: number; maxLength?: number } = {},
): string | undefined {
    if (!mountedWorldbooks || mountedWorldbooks.length === 0) return undefined;

    const digest = mountedWorldbooks
        .map((book, index) => {
            const title = collapseWhitespace(book.title || `Worldbook ${index + 1}`);
            const category = collapseWhitespace(book.category || 'General');
            const position = collapseWhitespace(book.position || 'after_worldview');
            const content = String(book.content || '').trim();
            const header = `### [${category}; position=${position}] ${title}`;
            return content ? `${header}\n${content}` : header;
        })
        .filter(Boolean)
        .join('\n\n');

    return digest || undefined;
}

export function buildCoreMemoryDigest(
    char: Pick<CharacterProfile, 'refinedMemories' | 'activeMemoryMonths'>,
    fallbackTopMemory?: string,
    options: { maxItems?: number; maxLength?: number } = {},
): string | undefined {
    const maxItems = options.maxItems ?? DEFAULT_REFINED_MEMORY_LIMIT;
    const maxLength = options.maxLength ?? DEFAULT_MAX_BLOCK_LENGTH;
    const refinedMemories = char.refinedMemories || {};
    const activeMonths = new Set(char.activeMemoryMonths || []);

    const refinedEntries = Object.entries(refinedMemories)
        .filter(([, summary]) => !!collapseWhitespace(summary || ''))
        .sort(([leftMonth], [rightMonth]) => {
            const leftActive = activeMonths.has(leftMonth) ? 1 : 0;
            const rightActive = activeMonths.has(rightMonth) ? 1 : 0;
            if (leftActive !== rightActive) return rightActive - leftActive;
            return rightMonth.localeCompare(leftMonth);
        })
        .slice(0, maxItems)
        .map(([month, summary]) => `[${month}] ${truncate(summary, 220)}`);

    if (refinedEntries.length > 0) {
        return truncate(refinedEntries.join('\n'), maxLength);
    }

    return fallbackTopMemory ? truncate(fallbackTopMemory, maxLength) : undefined;
}

export function didCharacterContextRelevantFieldsChange(
    previous: Pick<
        CharacterProfile,
        | 'name'
        | 'description'
        | 'systemPrompt'
        | 'softDevotionChatMode'
        | 'chatTimeAwarenessEnabled'
        | 'chatTimePassageAwarenessEnabled'
        | 'dateTimeAwarenessEnabled'
        | 'worldview'
        | 'mountedWorldbooks'
        | 'refinedMemories'
        | 'activeMemoryMonths'
        | 'moodState'
    > | null | undefined,
    next: Pick<
        CharacterProfile,
        | 'name'
        | 'description'
        | 'systemPrompt'
        | 'softDevotionChatMode'
        | 'chatTimeAwarenessEnabled'
        | 'chatTimePassageAwarenessEnabled'
        | 'dateTimeAwarenessEnabled'
        | 'worldview'
        | 'mountedWorldbooks'
        | 'refinedMemories'
        | 'activeMemoryMonths'
        | 'moodState'
    > | null | undefined,
): boolean {
    if (!previous || !next) return true;

    if ((previous.name || '') !== (next.name || '')) return true;
    if ((previous.description || '') !== (next.description || '')) return true;
    if ((previous.systemPrompt || '') !== (next.systemPrompt || '')) return true;
    if ((previous.softDevotionChatMode || false) !== (next.softDevotionChatMode || false)) return true;
    if ((previous.chatTimeAwarenessEnabled !== false) !== (next.chatTimeAwarenessEnabled !== false)) return true;
    if ((previous.chatTimePassageAwarenessEnabled !== false) !== (next.chatTimePassageAwarenessEnabled !== false)) return true;
    if ((previous.dateTimeAwarenessEnabled !== false) !== (next.dateTimeAwarenessEnabled !== false)) return true;
    if ((previous.worldview || '') !== (next.worldview || '')) return true;

    const previousWorldbooksDigest = buildMountedWorldbooksDigest(previous.mountedWorldbooks);
    const nextWorldbooksDigest = buildMountedWorldbooksDigest(next.mountedWorldbooks);
    if (previousWorldbooksDigest !== nextWorldbooksDigest) return true;

    const previousCoreMemoryDigest = buildCoreMemoryDigest(previous);
    const nextCoreMemoryDigest = buildCoreMemoryDigest(next);
    if (previousCoreMemoryDigest !== nextCoreMemoryDigest) return true;

    return stableSerialize(previous.moodState || null) !== stableSerialize(next.moodState || null);
}
