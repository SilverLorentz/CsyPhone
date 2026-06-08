import { beforeEach,describe,expect,it,vi } from 'vitest';

vi.mock('../utils/musicService', () => ({
    getLyric: vi.fn(),
}));

import { getLyric } from '../utils/musicService';
import { computeLocalLyricsSourceHash } from '../utils/localLyrics';
import type {
    MemoryRecordPlayable,
    NeteaseDjProgram,
    NeteaseSong,
} from '../types/music';
import {
    buildPlaybackLyricSnapshot,
    getDistinctLyricTranslation,
    getPlaybackLyricKey,
    getPlaybackLyricSnapshot,
    getPlaybackLyricsResource,
    getPlayableLyricSnapshot,
    resetPlaybackLyricsRuntimeForTests,
    shouldInjectPlaybackLyricSnapshot,
} from '../utils/playbackLyricsRuntime';

const mockedGetLyric = vi.mocked(getLyric);

describe('playbackLyricsRuntime', () => {
    beforeEach(() => {
        resetPlaybackLyricsRuntimeForTests();
        mockedGetLyric.mockReset();
    });

    it('caches lyric fetches per song id', async () => {
        mockedGetLyric.mockResolvedValue({
            lrc: { lyric: '[00:01.00]第一句\n[00:05.00]第二句' },
            tlyric: { lyric: '[00:01.00]First line' },
        });

        const [resourceA, resourceB] = await Promise.all([
            getPlaybackLyricsResource(42),
            getPlaybackLyricsResource(42),
        ]);

        expect(mockedGetLyric).toHaveBeenCalledTimes(1);
        expect(resourceA.lines).toHaveLength(2);
        expect(resourceB.lines[0].text).toBe('第一句');
    });

    it('builds a snapshot for the active lyric line', () => {
        const snapshot = buildPlaybackLyricSnapshot(1, 5.5, [
            { time: 4, text: '你先开了口', translation: 'You spoke first' },
            { time: 8, text: '我还没点头' },
        ]);

        expect(snapshot).toBeTruthy();
        expect(snapshot?.currentIndex).toBe(0);
        expect(snapshot?.currentText).toBe('你先开了口');
        expect(snapshot?.currentTranslation).toBe('You spoke first');
        expect(snapshot?.lineStartTime).toBe(4);
        expect(snapshot?.nextLineTime).toBe(8);
    });

    it('allows stable, non-duplicate lyric snapshots to be injected', () => {
        const snapshot = {
            songId: 1,
            currentIndex: 0,
            currentText: '你先开了口',
            currentTranslation: '',
            currentTime: 5.2,
            lineStartTime: 4,
            nextLineTime: 8,
            updatedAt: 1000,
        };

        expect(shouldInjectPlaybackLyricSnapshot(snapshot, null)).toBe(true);
    });

    it('blocks unstable, duplicate, noisy, and stale last-line snapshots', () => {
        const unstableSnapshot = {
            songId: 1,
            currentIndex: 0,
            currentText: '你先开了口',
            currentTranslation: '',
            currentTime: 4.3,
            lineStartTime: 4,
            nextLineTime: 8,
            updatedAt: 1000,
        };
        expect(shouldInjectPlaybackLyricSnapshot(unstableSnapshot, null)).toBe(false);

        const stableSnapshot = {
            ...unstableSnapshot,
            currentTime: 5.2,
        };
        expect(
            shouldInjectPlaybackLyricSnapshot(
                stableSnapshot,
                getPlaybackLyricKey(stableSnapshot),
            ),
        ).toBe(false);

        const noisySnapshot = {
            ...stableSnapshot,
            currentText: '啦啦啦',
        };
        expect(shouldInjectPlaybackLyricSnapshot(noisySnapshot, null)).toBe(false);

        const staleLastLine = {
            ...stableSnapshot,
            currentText: '终于来到这里',
            currentTime: 16.2,
            lineStartTime: 10,
            nextLineTime: null,
        };
        expect(shouldInjectPlaybackLyricSnapshot(staleLastLine, null)).toBe(false);
    });

    it('returns null when playback has not reached the first lyric line', async () => {
        mockedGetLyric.mockResolvedValue({
            lrc: { lyric: '[00:10.00]晚一点才开口' },
        });

        const snapshot = await getPlaybackLyricSnapshot(7, 2);

        expect(snapshot).toBeNull();
    });

    it('builds playable snapshots from memory record local lyrics with offset and saved timing', async () => {
        const playable: MemoryRecordPlayable = {
            kind: 'memoryRecord',
            id: 850000123,
            recordId: 'mrec-lyrics',
            name: '梦里回声',
            artistName: 'Sully',
            albumName: '回忆唱片匣',
            duration: 120000,
            lyrics: '[Verse]\n第一句\n第二句',
            monologueText: '先听这一段。',
            lyricsOffsetMs: 10000,
            lyricTiming: {
                sourceHash: computeLocalLyricsSourceHash([
                    '先听这一段。',
                    '第一句',
                    '第二句',
                ]),
                lineTimesMs: [0, 12000, 18000],
                updatedAt: 1000,
            },
        };

        const snapshot = await getPlayableLyricSnapshot(playable, 12.8);

        expect(mockedGetLyric).not.toHaveBeenCalled();
        expect(snapshot?.songId).toBe(playable.id);
        expect(snapshot?.currentIndex).toBe(1);
        expect(snapshot?.currentText).toBe('第一句');
        expect(snapshot?.lineStartTime).toBe(12);
        expect(snapshot?.nextLineTime).toBe(18);
    });

    it('delegates playable snapshots for Netease songs to the lyric service', async () => {
        const song: NeteaseSong = {
            kind: 'song',
            id: 99,
            name: '晴天',
            artists: [{ id: 1, name: '周杰伦' }],
            album: {
                kind: 'album',
                id: 7,
                name: '叶惠美',
            },
            duration: 269000,
        };

        mockedGetLyric.mockResolvedValue({
            lrc: { lyric: '[00:01.00]故事的小黄花' },
        });

        const snapshot = await getPlayableLyricSnapshot(song, 1.5);

        expect(mockedGetLyric).toHaveBeenCalledWith(song.id);
        expect(snapshot?.currentText).toBe('故事的小黄花');
    });

    it('returns null for program playables and memory records without local lyrics', async () => {
        const program: NeteaseDjProgram = {
            kind: 'program',
            id: 3001,
            name: '深夜播客',
            duration: 1800000,
        };
        const emptyMemory: MemoryRecordPlayable = {
            kind: 'memoryRecord',
            id: 850000456,
            recordId: 'mrec-empty',
            name: '空白唱片',
            artistName: 'Sully',
            albumName: '回忆唱片匣',
            duration: 120000,
            lyrics: '',
        };

        await expect(getPlayableLyricSnapshot(program, 20)).resolves.toBeNull();
        await expect(getPlayableLyricSnapshot(emptyMemory, 20)).resolves.toBeNull();
        expect(mockedGetLyric).not.toHaveBeenCalled();
    });

    it('drops translation lines that duplicate the original lyric', () => {
        expect(getDistinctLyricTranslation('Hello', 'Hello')).toBe('');
        expect(getDistinctLyricTranslation('你好', '')).toBe('');
        expect(getDistinctLyricTranslation('你好', 'Hello')).toBe('Hello');
    });
});
