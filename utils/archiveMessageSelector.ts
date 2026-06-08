import type { Message } from '../types';
import { isMainlineReadableMessage } from './mainlineMemory';

type ArchiveSource = 'date' | 'theater';

interface FormatMemoryArchiveLineOptions {
    charName: string;
    userName: string;
    imageLabel?: string;
    formatEmoji?: boolean;
    formatTime?: (timestamp: number) => string;
}

const ARCHIVE_SOURCES = new Set<string>(['date', 'theater']);

function getArchiveSource(message: Message): ArchiveSource | null {
    const source = String(message.metadata?.source || '');
    return ARCHIVE_SOURCES.has(source) ? source as ArchiveSource : null;
}

function getCoveredMsgIds(message: Message): number[] {
    if (!Array.isArray(message.metadata?.coveredMsgIds)) return [];
    return message.metadata.coveredMsgIds.filter((id: unknown): id is number => (
        typeof id === 'number' && Number.isFinite(id)
    ));
}

function isSummaryBridge(message: Message): boolean {
    return message.metadata?.isDateContextBridge === true && message.metadata?.bridgeType === 'summary';
}

function isRawBridge(message: Message): boolean {
    return message.metadata?.isDateContextBridge === true && message.metadata?.bridgeType === 'raw';
}

function isInternalSummary(message: Message): boolean {
    return message.metadata?.isSummary === true;
}

function isCanonicalCandidate(message: Message): boolean {
    return isSummaryBridge(message) || isInternalSummary(message) || isRawBridge(message);
}

function getSessionKey(message: Message): string {
    const source = getArchiveSource(message) || 'other';
    const sessionStartMsgId = Number(message.metadata?.sessionStartMsgId);
    if (Number.isFinite(sessionStartMsgId) && sessionStartMsgId > 0) {
        return `${source}:session:${sessionStartMsgId}`;
    }

    const coveredMsgIds = getCoveredMsgIds(message);
    if (coveredMsgIds.length > 0) {
        return `${source}:covered:${[...coveredMsgIds].sort((a, b) => a - b).join(',')}`;
    }

    return `${source}:message:${message.id}`;
}

function getCandidateIdentity(message: Message): string {
    const source = getArchiveSource(message) || 'other';
    const summarySourceMsgId = Number(message.metadata?.summarySourceMsgId);
    if (isSummaryBridge(message) && Number.isFinite(summarySourceMsgId) && summarySourceMsgId > 0) {
        return `${source}:summary-source:${summarySourceMsgId}`;
    }

    const coveredMsgIds = getCoveredMsgIds(message);
    if (coveredMsgIds.length > 0) {
        return `${source}:covered:${[...coveredMsgIds].sort((a, b) => a - b).join(',')}`;
    }

    return `${source}:message:${message.id}`;
}

function isFullyCovered(message: Message, coveredIds: Set<number>): boolean {
    const ids = getCoveredMsgIds(message);
    return ids.length > 0 && ids.every(id => coveredIds.has(id));
}

function addCoveredIds(message: Message, coveredIds: Set<number>): void {
    getCoveredMsgIds(message).forEach(id => coveredIds.add(id));
}

function sortNewestFirst(left: Message, right: Message): number {
    return right.timestamp - left.timestamp || right.id - left.id;
}

function sortArchiveOrder(left: Message, right: Message): number {
    return left.timestamp - right.timestamp || left.id - right.id;
}

export function selectMessagesForMemoryArchive(messages: Message[]): Message[] {
    const dateLikeMessages = messages.filter(message => getArchiveSource(message) && isMainlineReadableMessage(message));
    const summaryBridges = dateLikeMessages.filter(isSummaryBridge).sort(sortNewestFirst);
    const internalSummaries = dateLikeMessages.filter(isInternalSummary).sort(sortArchiveOrder);
    const rawBridges = dateLikeMessages.filter(isRawBridge).sort(sortArchiveOrder);

    const selectedIds = new Set<number>();
    const selectedIdentities = new Set<string>();
    const coveredIds = new Set<number>();
    const summarySourceIds = new Set<number>();
    const sessionsWithSummary = new Set<string>();

    const includeCandidate = (message: Message): boolean => {
        const identity = getCandidateIdentity(message);
        if (selectedIdentities.has(identity)) return false;
        selectedIdentities.add(identity);
        selectedIds.add(message.id);
        addCoveredIds(message, coveredIds);
        return true;
    };

    for (const bridge of summaryBridges) {
        if (!includeCandidate(bridge)) continue;
        sessionsWithSummary.add(getSessionKey(bridge));

        const summarySourceMsgId = Number(bridge.metadata?.summarySourceMsgId);
        if (Number.isFinite(summarySourceMsgId) && summarySourceMsgId > 0) {
            summarySourceIds.add(summarySourceMsgId);
        }
    }

    for (const summary of internalSummaries) {
        if (summarySourceIds.has(summary.id)) continue;
        if (sessionsWithSummary.has(getSessionKey(summary))) continue;
        if (isFullyCovered(summary, coveredIds)) continue;
        if (!includeCandidate(summary)) continue;
        sessionsWithSummary.add(getSessionKey(summary));
    }

    for (const bridge of rawBridges) {
        if (sessionsWithSummary.has(getSessionKey(bridge))) continue;
        if (isFullyCovered(bridge, coveredIds)) continue;
        includeCandidate(bridge);
    }

    return messages
        .filter(message => {
            if (!isMainlineReadableMessage(message)) return false;
            if (!getArchiveSource(message)) return true;
            if (selectedIds.has(message.id)) return true;
            if (isCanonicalCandidate(message)) return false;
            return !coveredIds.has(message.id);
        })
        .sort(sortArchiveOrder);
}

function defaultFormatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function getArchiveSpecialLabel(message: Message): string | null {
    const source = getArchiveSource(message);
    if (!source) return null;

    const sourceLabel = source === 'theater' ? '约会' : '线下见面';
    if (isSummaryBridge(message) || isInternalSummary(message)) return `[${sourceLabel}总结]`;
    if (isRawBridge(message)) return `[${sourceLabel}原始记录]`;
    return null;
}

export function formatMemoryArchiveLine(
    message: Message,
    options: FormatMemoryArchiveLineOptions,
): string {
    if (message.type === 'call_log') return message.content;

    const time = (options.formatTime || defaultFormatTime)(message.timestamp);
    const specialLabel = getArchiveSpecialLabel(message);
    if (specialLabel) {
        return `[${time}] ${specialLabel}: ${message.content}`;
    }

    let content = message.content;
    if (message.type === 'image') content = options.imageLabel || '[图片/Image]';
    if (message.type === 'emoji' && options.formatEmoji !== false) {
        content = `[表情包: ${message.content.split('/').pop() || 'sticker'}]`;
    }

    const speaker = message.role === 'user' ? options.userName : options.charName;
    return `[${time}] ${speaker}: ${content}`;
}
