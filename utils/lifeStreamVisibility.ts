type MessageLike = {
    role?: string;
    type?: string;
    content?: unknown;
    metadata?: Record<string, unknown> | null;
};

const LIFE_STREAM_METADATA_VALUES = new Set([
    'lifestream',
    'life_stream',
    'life-stream',
    'life_stream_fragment',
    'life-fragment',
    'life_fragment',
    'life_update',
    'daily_life',
]);

const LIFE_STREAM_FLAG_KEYS = [
    'isLifeStream',
    'lifeStream',
    'isLifestream',
    'lifestream',
    'isLifeFragment',
    'lifeFragment',
];

const LIFE_STREAM_VALUE_KEYS = [
    'source',
    'reason',
    'kind',
    'category',
    'messageKind',
    'messageType',
    'event',
];

const LIFE_STREAM_TIME_PREFIX = /^(凌晨|清晨|早晨|上午|中午|午后|下午|傍晚|晚上|深夜)\s*([·・•、，。:：\-—]|\s+|在|的)/;

function normalizeMetadataValue(value: unknown): string {
    return typeof value === 'string'
        ? value.trim().replace(/[A-Z]/g, match => `_${match.toLowerCase()}`).replace(/^_/, '').toLowerCase()
        : '';
}

export function isLifeStreamMetadata(metadata?: Record<string, unknown> | null): boolean {
    if (!metadata) return false;

    if (LIFE_STREAM_FLAG_KEYS.some(key => metadata[key] === true)) return true;

    return LIFE_STREAM_VALUE_KEYS.some(key => {
        const value = normalizeMetadataValue(metadata[key]);
        return LIFE_STREAM_METADATA_VALUES.has(value);
    });
}

export function looksLikeLifeStreamFragmentContent(content: unknown): boolean {
    if (typeof content !== 'string') return false;
    const firstLine = content.replace(/\s+/g, ' ').trim().split('\n')[0] || '';
    return LIFE_STREAM_TIME_PREFIX.test(firstLine);
}

export function shouldHideLifeStreamLikeMessage(message: MessageLike): boolean {
    if ((message.type as string) === 'lifestream') return true;
    if (isLifeStreamMetadata(message.metadata)) return true;

    const source = normalizeMetadataValue(message.metadata?.source);
    const fromBackend = message.metadata?.fromBackend === true || typeof message.metadata?.backendMessageId === 'string';
    const isBackendAutonomous = fromBackend && (!source || source === 'autonomous');

    return message.role === 'assistant'
        && isBackendAutonomous
        && looksLikeLifeStreamFragmentContent(message.content);
}
