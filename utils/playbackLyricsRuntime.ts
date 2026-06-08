import type { LyricLine,MusicPlayable } from '../types/music';
import { isMemoryRecordPlayable,isSongPlayable } from '../types/music';
import { buildLocalLyrics } from './localLyrics';
import { getLyric } from './musicService';
import { findCurrentLyricIndex,mergeLrcTranslation,parseLrc } from './parseLrc';

export interface PlaybackLyricsResource {
    songId: number;
    lines: LyricLine[];
    error: string | null;
    updatedAt: number;
}

export interface PlaybackLyricSnapshot {
    songId: number;
    currentIndex: number;
    currentText: string;
    currentTranslation: string;
    currentTime: number;
    lineStartTime: number;
    nextLineTime: number | null;
    updatedAt: number;
}

const lyricCache = new Map<number, PlaybackLyricsResource>();
const lyricRequestCache = new Map<number, Promise<PlaybackLyricsResource>>();

function createEmptyResource(songId: number): PlaybackLyricsResource {
    return {
        songId,
        lines: [],
        error: null,
        updatedAt: Date.now(),
    };
}

function extractLyricError(error: unknown): string {
    return error instanceof Error ? error.message : '歌词加载失败';
}

export function getDistinctLyricTranslation(text: string, translation: string): string {
    const nextText = text.trim();
    const nextTranslation = translation.trim();
    if (!nextTranslation || nextTranslation === nextText) return '';
    return nextTranslation;
}

async function fetchPlaybackLyricsResource(songId: number): Promise<PlaybackLyricsResource> {
    try {
        const result = await getLyric(songId);
        const lines = mergeLrcTranslation(
            parseLrc(result.lrc?.lyric ?? ''),
            result.tlyric?.lyric ?? '',
        );
        return {
            songId,
            lines,
            error: null,
            updatedAt: Date.now(),
        };
    } catch (error) {
        return {
            songId,
            lines: [],
            error: extractLyricError(error),
            updatedAt: Date.now(),
        };
    }
}

export async function getPlaybackLyricsResource(songId: number | undefined): Promise<PlaybackLyricsResource> {
    if (!songId || songId <= 0) return createEmptyResource(songId ?? 0);

    const cached = lyricCache.get(songId);
    if (cached) return cached;

    const inFlight = lyricRequestCache.get(songId);
    if (inFlight) return inFlight;

    const request = fetchPlaybackLyricsResource(songId)
        .then((resource) => {
            lyricCache.set(songId, resource);
            return resource;
        })
        .finally(() => {
            lyricRequestCache.delete(songId);
        });

    lyricRequestCache.set(songId, request);
    return request;
}

export function buildPlaybackLyricSnapshot(
    songId: number,
    currentTime: number,
    lines: LyricLine[],
): PlaybackLyricSnapshot | null {
    if (!songId || songId <= 0 || !Number.isFinite(currentTime) || lines.length === 0) {
        return null;
    }

    const currentIndex = findCurrentLyricIndex(lines, currentTime);
    if (currentIndex < 0) return null;

    const currentLine = lines[currentIndex];
    const currentText = currentLine?.text?.trim() ?? '';
    if (!currentText) return null;

    const nextLine = currentIndex < lines.length - 1 ? lines[currentIndex + 1] : null;

    return {
        songId,
        currentIndex,
        currentText,
        currentTranslation: getDistinctLyricTranslation(currentText, currentLine?.translation ?? ''),
        currentTime,
        lineStartTime: currentLine.time,
        nextLineTime: nextLine?.time ?? null,
        updatedAt: Date.now(),
    };
}

function normalizeLyricForQualityCheck(text: string): string {
    return text.toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
}

export function isLowQualityLyricLine(text: string): boolean {
    const normalized = normalizeLyricForQualityCheck(text);
    if (!normalized) return true;

    const chars = Array.from(normalized);
    if (chars.length < 3) return true;
    if (chars.every((char) => char === chars[0])) return true;
    if (/^(?:la|na|oh|ah|hey|woo|yeah|ooh|hah|uh|mm|hm)+$/i.test(normalized)) return true;
    if (/^(?:啦|啊|哈|呐|嗯|哦|哇|呀)+$/u.test(normalized)) return true;

    return false;
}

export function getPlaybackLyricKey(snapshot: PlaybackLyricSnapshot): string {
    return `${snapshot.songId}:${snapshot.currentIndex}`;
}

export function shouldInjectPlaybackLyricSnapshot(
    snapshot: PlaybackLyricSnapshot | null,
    lastInjectedKey?: string | null,
): boolean {
    if (!snapshot?.currentText) return false;
    if (isLowQualityLyricLine(snapshot.currentText)) return false;

    const elapsed = snapshot.currentTime - snapshot.lineStartTime;
    if (elapsed < 0.8) return false;

    if (snapshot.nextLineTime !== null) {
        const remaining = snapshot.nextLineTime - snapshot.currentTime;
        if (remaining < 1.2) return false;
    } else if (elapsed > 5) {
        return false;
    }

    const key = getPlaybackLyricKey(snapshot);
    if (lastInjectedKey && key === lastInjectedKey) return false;

    return true;
}

export async function getPlaybackLyricSnapshot(
    songId: number | undefined,
    currentTime: number,
): Promise<PlaybackLyricSnapshot | null> {
    if (!songId || songId <= 0) return null;

    const resource = await getPlaybackLyricsResource(songId);
    if (resource.error || resource.lines.length === 0) return null;

    return buildPlaybackLyricSnapshot(songId, currentTime, resource.lines);
}

export async function getPlayableLyricSnapshot(
    playable: MusicPlayable | null | undefined,
    currentTime: number,
): Promise<PlaybackLyricSnapshot | null> {
    if (!playable) return null;

    if (isSongPlayable(playable)) {
        return getPlaybackLyricSnapshot(playable.id, currentTime);
    }

    if (!isMemoryRecordPlayable(playable)) return null;

    const local = buildLocalLyrics({
        lyrics: playable.lyrics,
        monologueText: playable.monologueText,
        lyricsOffsetMs: playable.lyricsOffsetMs,
        lyricTiming: playable.lyricTiming,
    });

    if (local.lines.length === 0) return null;

    return buildPlaybackLyricSnapshot(playable.id, currentTime, local.lines);
}

export function resetPlaybackLyricsRuntimeForTests(): void {
    lyricCache.clear();
    lyricRequestCache.clear();
}
