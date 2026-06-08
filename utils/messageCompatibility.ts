import type { Message } from '../types';
import { shouldIncludeMessageInContext } from './messageContext';

const VECTOR_EXCLUDED_TYPES = new Set<Message['type']>(['system', 'moments']);
const VECTOR_EXCLUDED_SOURCES = new Set(['theater', 'date']);
const VECTOR_ALLOWED_SYSTEM_SOURCES = new Set(['phone', 'story_phone']);

export function normalizeMessageForVectorExtraction(raw: unknown): Message | null {
    if (!raw || typeof raw !== 'object') return null;

    const message = raw as Message;
    if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') return null;
    if (typeof message.type !== 'string') return null;
    if (typeof message.content !== 'string') return null;

    const source = String(message.metadata?.source || '');
    const isVectorSystemEvidence = message.role === 'system' && VECTOR_ALLOWED_SYSTEM_SOURCES.has(source);
    if (message.role !== 'user' && message.role !== 'assistant' && !isVectorSystemEvidence) return null;
    if (VECTOR_EXCLUDED_TYPES.has(message.type)) return null;
    if (VECTOR_EXCLUDED_SOURCES.has(source)) return null;
    if (!shouldIncludeMessageInContext(message)) return null;
    if (!message.content && message.type === 'text') return null;
    return message;
}
