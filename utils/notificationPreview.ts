export const APP_NOTIFICATION_NAME = 'Csy-OS';
export const DEFAULT_NOTIFICATION_BODY = '发来了一条新消息';
const DEFAULT_MAX_BODY_LENGTH = 120;
const DEFAULT_MAX_TITLE_LENGTH = 24;

const BILINGUAL_MARKER_RE = /%%\s*BILINGUAL\s*%%/gi;
const URL_RE = /\bhttps?:\/\/[^\s"'<>，。；！？、)）\]]+/gi;
const BARE_DOMAIN_RE = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|dev|app|io|cn|xyz|site|top|me|cc|vip|pages)(?:\/[^\s"'<>，。；！？、)）\]]*)?/gi;
const TECHNICAL_DETAIL_LINE_RE = /^\s*(?:URL|Request URL|Final Request URL|finalRequestURL|Final Base URL|finalBaseURL|Base URL|Endpoint|Response|Trace|Stack)\s*[:：].*$/gim;

export interface NotificationBodyFormatOptions {
    fallback?: string;
    maxLength?: number;
}

export interface NotificationTitleFormatOptions {
    maxLength?: number;
}

function truncateNotificationText(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatNotificationTitle(
    title: string | null | undefined,
    options: NotificationTitleFormatOptions = {},
): string {
    const maxLength = Math.max(8, options.maxLength ?? DEFAULT_MAX_TITLE_LENGTH);
    const normalized = String(title || '')
        .replace(URL_RE, '')
        .replace(BARE_DOMAIN_RE, '')
        .replace(/<[^>\n]{1,80}>/g, '')
        .replace(/[·•|｜]+$/g, '')
        .trim();

    if (!normalized || /^CSY-Sully\s*OS$/i.test(normalized) || /^CSY-SullyOS$/i.test(normalized)) {
        return APP_NOTIFICATION_NAME;
    }

    if (normalized === APP_NOTIFICATION_NAME || /来消息了|发来消息|发来了一条消息/.test(normalized)) {
        return truncateNotificationText(normalized, maxLength);
    }

    return truncateNotificationText(`${normalized} 来消息了`, maxLength);
}

function normalizeVoicePreview(value: string): string {
    const durationMatch = value.match(/[【\[]语音(?:消息)?[：:]\s*\d+\s*(?:秒|s|sec)?[】\]]\s*["“”「『]?([\s\S]*?)["“”」』]?\s*$/);
    if (durationMatch?.[1]?.trim()) {
        return `语音消息：${durationMatch[1].trim()}`;
    }

    const wrappedMatch = value.match(/^[\s\S]*?[【\[]语音(?:消息)?[：:]\s*([\s\S]+?)\s*[】\]][\s\S]*$/);
    if (wrappedMatch?.[1]?.trim()) {
        return `语音消息：${wrappedMatch[1].trim()}`;
    }

    const xmlMatch = value.match(/<语音>([\s\S]+?)<\/语音>/i);
    if (xmlMatch?.[1]?.trim()) {
        return `语音消息：${xmlMatch[1].trim()}`;
    }

    return value;
}

function normalizeEmojiPreview(value: string): string {
    const sendEmojiMatch = value.match(/\[\[SEND_EMOJI:\s*([^\]]+?)\s*\]\]/i);
    if (sendEmojiMatch?.[1]?.trim()) {
        return `发来一个表情：${sendEmojiMatch[1].trim()}`;
    }
    return value;
}

export function formatNotificationBody(
    content: string | null | undefined,
    options: NotificationBodyFormatOptions = {},
): string {
    const fallback = options.fallback || DEFAULT_NOTIFICATION_BODY;
    const maxLength = Math.max(12, options.maxLength ?? DEFAULT_MAX_BODY_LENGTH);

    let normalized = String(content || '')
        .replace(BILINGUAL_MARKER_RE, '\n')
        .replace(/\r\n?/g, '\n')
        .trim();

    normalized = normalizeEmojiPreview(normalized);
    normalized = normalizeVoicePreview(normalized);

    normalized = normalized
        .replace(TECHNICAL_DETAIL_LINE_RE, '\n')
        .replace(URL_RE, '')
        .replace(BARE_DOMAIN_RE, '')
        .replace(/<\/?(?:翻译|原文|译文|语音|think|thinking|reasoning)[^>]*>/gi, '\n')
        .replace(/<[^>\n]{1,80}>/g, '\n')
        .replace(/[`*_~#>]+/g, '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([，。；！？、,.!?;:])/g, '$1')
        .trim();

    return truncateNotificationText(normalized || fallback, maxLength);
}
