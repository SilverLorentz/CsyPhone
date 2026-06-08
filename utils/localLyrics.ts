import type { MemoryRecordLyricTiming } from '../types/memoryRecord';
import type { LyricLine } from '../types/music';
import { parseLrc } from './parseLrc';

const PLAIN_SECTION_LINE_REGEX = /^\[[^\d][^\]]*\]$/;
const MONOLOGUE_SEGMENT_REGEX = /[^。！？!?；;，,]+[。！？!?；;，,]*/g;
const PLAIN_LINE_SECONDS = 6;

export interface BuildLocalLyricsOptions {
    lyrics?: string;
    monologueText?: string;
    lyricsOffsetMs?: number;
    lyricTiming?: MemoryRecordLyricTiming;
}

export interface BuildLocalLyricsResult {
    lines: LyricLine[];
    sourceHash: string;
    timingApplied: boolean;
}

function normalizeLineText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function toPlainLyricLines(lyrics: string): string[] {
    return lyrics
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !PLAIN_SECTION_LINE_REGEX.test(line));
}

function compactSegments(segments: string[], maxLines: number): string[] {
    if (segments.length <= maxLines) return segments;

    const buckets = Array.from({ length: maxLines }, () => '');
    segments.forEach((segment, index) => {
        const bucketIndex = Math.min(maxLines - 1, Math.floor((index * maxLines) / segments.length));
        buckets[bucketIndex] = `${buckets[bucketIndex]}${segment}`;
    });

    return buckets.map((line) => line.trim()).filter(Boolean);
}

export function splitMonologueForLyrics(monologueText?: string): string[] {
    const normalized = normalizeLineText(monologueText || '');
    if (!normalized) return [];

    const segments = normalized.match(MONOLOGUE_SEGMENT_REGEX)
        ?.map((segment) => segment.trim())
        .filter(Boolean);

    if (!segments || segments.length === 0) return [normalized];
    return compactSegments(segments, 3);
}

export function computeLocalLyricsSourceHash(lineTexts: string[]): string {
    const source = lineTexts.map(normalizeLineText).join('\n');
    let hash = 2166136261;

    for (let i = 0; i < source.length; i++) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16);
}

function applySavedTiming(lines: LyricLine[], timing?: MemoryRecordLyricTiming): { lines: LyricLine[]; applied: boolean } {
    const sourceHash = computeLocalLyricsSourceHash(lines.map((line) => line.text));
    if (!timing || timing.sourceHash !== sourceHash || timing.lineTimesMs.length !== lines.length) {
        return { lines, applied: false };
    }

    let previousMs = 0;
    const timedLines = lines.map((line, index) => {
        const rawMs = timing.lineTimesMs[index];
        const safeMs = Number.isFinite(rawMs) ? Math.max(previousMs, Math.round(rawMs)) : Math.round(line.time * 1000);
        previousMs = safeMs;
        return { ...line, time: safeMs / 1000 };
    });

    return { lines: timedLines, applied: true };
}

export function buildLocalLyrics({
    lyrics,
    monologueText,
    lyricsOffsetMs,
    lyricTiming,
}: BuildLocalLyricsOptions): BuildLocalLyricsResult {
    const safeLyrics = lyrics?.trim() || '';
    const offsetSeconds = Math.max(0, (lyricsOffsetMs || 0) / 1000);
    const monologueLines = offsetSeconds > 0 ? splitMonologueForLyrics(monologueText) : [];
    const lines: LyricLine[] = [];

    if (monologueLines.length > 0) {
        const spacing = offsetSeconds / Math.max(monologueLines.length, 1);
        const latestIntroTime = Math.max(0, offsetSeconds - 0.25);
        monologueLines.forEach((text, index) => {
            lines.push({
                time: Math.min(latestIntroTime, index * spacing),
                text,
            });
        });
    }

    const lrcLines = parseLrc(safeLyrics);
    if (lrcLines.length > 0) {
        lines.push(...lrcLines.map((line) => ({
            ...line,
            time: line.time + offsetSeconds,
        })));
    } else {
        const plainLines = toPlainLyricLines(safeLyrics);
        lines.push(...plainLines.map((text, index) => ({
            time: offsetSeconds + index * PLAIN_LINE_SECONDS,
            text,
        })));
    }

    const timed = applySavedTiming(lines, lyricTiming);
    return {
        lines: timed.lines,
        sourceHash: computeLocalLyricsSourceHash(lines.map((line) => line.text)),
        timingApplied: timed.applied,
    };
}
