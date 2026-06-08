import { describe, expect, it } from 'vitest';
import { buildLocalLyrics } from '../utils/localLyrics';

describe('local lyrics builder', () => {
    it('places monologue before lyric lines and offsets plain lyrics', () => {
        const result = buildLocalLyrics({
            monologueText: '先听我说完这一段，再让梦继续往下走。',
            lyricsOffsetMs: 12000,
            lyrics: '[Verse]\n梦在转动\n你在回头',
        });

        expect(result.lines.map((line) => line.text)).toEqual([
            '先听我说完这一段，',
            '再让梦继续往下走。',
            '梦在转动',
            '你在回头',
        ]);
        expect(result.lines[0].time).toBe(0);
        expect(result.lines[2].time).toBe(12);
        expect(result.lines[3].time).toBe(18);
    });

    it('shifts LRC timestamps by the local lyrics offset', () => {
        const result = buildLocalLyrics({
            lyricsOffsetMs: 30000,
            lyrics: '[00:10.00]穿过漫长星河\n[00:20.50]你终于靠近我',
        });

        expect(result.lines.map((line) => line.time)).toEqual([40, 50.5]);
    });

    it('applies saved line timing only when the source hash matches', () => {
        const base = buildLocalLyrics({
            lyrics: '[Verse]\n第一句\n第二句',
        });
        const timed = buildLocalLyrics({
            lyrics: '[Verse]\n第一句\n第二句',
            lyricTiming: {
                sourceHash: base.sourceHash,
                lineTimesMs: [1500, 7400],
                updatedAt: 123,
            },
        });
        const stale = buildLocalLyrics({
            lyrics: '[Verse]\n第一句\n第二句',
            lyricTiming: {
                sourceHash: 'stale',
                lineTimesMs: [1500, 7400],
                updatedAt: 123,
            },
        });

        expect(timed.timingApplied).toBe(true);
        expect(timed.lines.map((line) => line.time)).toEqual([1.5, 7.4]);
        expect(stale.timingApplied).toBe(false);
        expect(stale.lines.map((line) => line.time)).toEqual([0, 6]);
    });
});
