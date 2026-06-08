import { useEffect, useMemo, useRef, useState } from 'react';
import type { LyricLine } from '../types/music';
import { findCurrentLyricIndex } from '../utils/parseLrc';
import type { MemoryRecordLyricTiming } from '../types/memoryRecord';
import { buildLocalLyrics } from '../utils/localLyrics';
import {
    getDistinctLyricTranslation,
    getPlaybackLyricsResource,
} from '../utils/playbackLyricsRuntime';

interface UseLyricsOptions {
    /** 歌曲 ID，为 0 或 undefined 时不获取 */
    songId: number | undefined;
    /** 当前播放时间（秒） */
    currentTime: number;
    /** 是否启用歌词（关闭时跳过获取） */
    enabled?: boolean;
    /** 本地歌词，回忆唱片等非网易云音源使用 */
    localLyrics?: string;
    /** 本地开场独白，回忆唱片 master 音频使用 */
    localMonologueText?: string;
    /** 正文歌词在本地 master 音频中的起始偏移 */
    localLyricsOffsetMs?: number;
    /** 用户手动保存的本地歌词打轴 */
    localLyricTiming?: MemoryRecordLyricTiming;
}

interface UseLyricsResult {
    /** 解析后的所有歌词行 */
    lines: LyricLine[];
    /** 当前高亮行索引，-1 表示尚无匹配 */
    currentIndex: number;
    /** 当前行歌词文本 */
    currentText: string;
    /** 当前行翻译（如有） */
    currentTranslation: string;
    /** 是否正在加载歌词 */
    isLoading: boolean;
    /** 加载错误 */
    error: string | null;
    /** 本地歌词行文本的 hash，用于保存手动打轴 */
    localSourceHash: string | null;
}

export function useLyrics({
    songId,
    currentTime,
    enabled = true,
    localLyrics,
    localMonologueText,
    localLyricsOffsetMs,
    localLyricTiming,
}: UseLyricsOptions): UseLyricsResult {
    const [lines, setLines] = useState<LyricLine[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [localSourceHash, setLocalSourceHash] = useState<string | null>(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        if ((localLyrics?.trim() || localMonologueText?.trim()) && enabled) {
            requestIdRef.current += 1;
            const local = buildLocalLyrics({
                lyrics: localLyrics,
                monologueText: localMonologueText,
                lyricsOffsetMs: localLyricsOffsetMs,
                lyricTiming: localLyricTiming,
            });

            setLines(local.lines);
            setLocalSourceHash(local.sourceHash);
            setIsLoading(false);
            setError(null);
            return;
        }

        if (!songId || songId <= 0 || !enabled) {
            requestIdRef.current += 1;
            setLines([]);
            setLocalSourceHash(null);
            setIsLoading(false);
            setError(null);
            return;
        }

        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        setIsLoading(true);
        setError(null);
        setLocalSourceHash(null);

        getPlaybackLyricsResource(songId)
            .then((result) => {
                if (requestId !== requestIdRef.current) return;

                setLines(result.lines);
                setError(result.error);
            })
            .catch((err: unknown) => {
                if (requestId !== requestIdRef.current) return;

                setError(err instanceof Error ? err.message : '歌词加载失败');
                setLines([]);
            })
            .finally(() => {
                if (requestId === requestIdRef.current) {
                    setIsLoading(false);
                }
            });
    }, [enabled, localLyricTiming, localLyrics, localLyricsOffsetMs, localMonologueText, songId]);

    const currentIndex = useMemo(
        () => findCurrentLyricIndex(lines, currentTime),
        [currentTime, lines],
    );

    const currentLine = currentIndex >= 0 ? lines[currentIndex] : null;

    return {
        lines,
        currentIndex,
        currentText: currentLine?.text ?? '',
        currentTranslation: getDistinctLyricTranslation(
            currentLine?.text ?? '',
            currentLine?.translation ?? '',
        ),
        isLoading,
        error,
        localSourceHash,
    };
}
