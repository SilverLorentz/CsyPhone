import type { LyricLine } from '../types/music';

const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

function parseTimestampFraction(fraction: string | undefined): number {
    if (!fraction) return 0;

    const parsed = Number.parseInt(fraction, 10);
    if (Number.isNaN(parsed)) return 0;

    if (fraction.length === 1) return parsed * 100;
    if (fraction.length === 2) return parsed * 10;
    return parsed;
}

/**
 * 解析标准 LRC 格式歌词。
 * 格式示例：[00:12.34]歌词文本
 * 支持一行多时间戳：[00:12.34][00:24.56]重复歌词
 */
export function parseLrc(lrcText: string): LyricLine[] {
    if (!lrcText || typeof lrcText !== 'string') return [];

    const lines: LyricLine[] = [];

    for (const rawLine of lrcText.split('\n')) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;

        const timestamps: number[] = [];
        let match: RegExpExecArray | null;
        let lastIndex = 0;

        TIMESTAMP_REGEX.lastIndex = 0;
        while ((match = TIMESTAMP_REGEX.exec(trimmed)) !== null) {
            const minutes = Number.parseInt(match[1], 10);
            const seconds = Number.parseInt(match[2], 10);
            const milliseconds = parseTimestampFraction(match[3]);

            timestamps.push(minutes * 60 + seconds + milliseconds / 1000);
            lastIndex = TIMESTAMP_REGEX.lastIndex;
        }

        if (timestamps.length === 0) continue;

        const text = trimmed.slice(lastIndex).trim();
        if (!text) continue;

        for (const time of timestamps) {
            lines.push({ time, text });
        }
    }

    lines.sort((a, b) => a.time - b.time);
    return lines;
}

/**
 * 合并原文歌词和翻译歌词。
 * 按时间戳匹配，将翻译写入 translation 字段。
 */
export function mergeLrcTranslation(
    original: LyricLine[],
    translationText: string,
): LyricLine[] {
    if (!translationText) return original;

    const translations = parseLrc(translationText);
    if (translations.length === 0) return original;

    const translationMap = new Map<number, string>();
    for (const line of translations) {
        // 用四舍五入到 0.1s 做 key，避免浮点精度问题
        const key = Math.round(line.time * 10);
        translationMap.set(key, line.text);
    }

    return original.map((line) => {
        const key = Math.round(line.time * 10);
        const translation = translationMap.get(key);
        return translation ? { ...line, translation } : line;
    });
}

/**
 * 二分查找当前播放时间对应的歌词行索引。
 * 返回 time <= currentTime 的最后一行的索引；无匹配返回 -1。
 */
export function findCurrentLyricIndex(
    lines: LyricLine[],
    currentTime: number,
): number {
    if (lines.length === 0) return -1;

    let low = 0;
    let high = lines.length - 1;
    let result = -1;

    while (low <= high) {
        const mid = (low + high) >>> 1;

        if (lines[mid].time <= currentTime) {
            result = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return result;
}
