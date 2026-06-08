// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryRecord } from '../types';
import type { MemoryRecordPlayable } from '../types/music';
import {
    buildMemoryRecordSharePreview,
    extractMemoryRecordShareLyricLines,
    shareMemoryRecordPoster,
} from './memoryRecordShare';
import { shareMemoryRecordFiles } from './memoryRecordExport';

vi.mock('./memoryRecordExport', () => ({
    sanitizeMemoryRecordMp3FileName: vi.fn((title: string, artistName: string) => `${title} - ${artistName}.mp3`),
    shareMemoryRecordFiles: vi.fn(),
}));

const mockedShareMemoryRecordFiles = vi.mocked(shareMemoryRecordFiles);

const playable: MemoryRecordPlayable = {
    kind: 'memoryRecord',
    id: 850001,
    recordId: 'record-1',
    name: '星河回信',
    artistName: '苏里',
    albumName: '回忆唱片匣',
    duration: 192000,
    coverGradient: 'linear-gradient(135deg,#111,#eee)',
    lyrics: '[Verse]\n梦在转动\n你在身后\n梦在转动\n[Chorus]\n我终于听见你',
    audioId: 'audio-1',
};

const record: MemoryRecord = {
    id: 'record-1',
    charId: 'char-1',
    charName: '苏里',
    userName: '我',
    mode: 'blind_box',
    status: 'ready',
    title: '星河回信',
    albumName: '回忆唱片匣',
    artistName: '苏里',
    monologueText: '',
    lyrics: '[00:01.00]第一句歌词\n[00:02.00]第二句歌词',
    musicPrompt: '',
    coverGradient: 'linear-gradient(135deg,#111,#eee)',
    seedMemoryIds: [],
    durationMs: 192000,
    musicAudioId: 'audio-1',
    createdAt: 1,
    updatedAt: 1,
};

describe('memoryRecordShare', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('extracts concise lyric lines without section labels or duplicates', () => {
        expect(extractMemoryRecordShareLyricLines(playable.lyrics)).toEqual([
            '梦在转动',
            '你在身后',
        ]);
    });

    it('builds preview with record cover and timed lyrics when full record is available', () => {
        const preview = buildMemoryRecordSharePreview(playable, record);

        expect(preview.title).toBe('星河回信');
        expect(preview.artistName).toBe('苏里');
        expect(preview.durationMs).toBe(192000);
        expect(preview.lyricLines).toEqual(['第一句歌词', '第二句歌词']);
        expect(preview.coverImageUrl).toContain('/images/music-record-covers/');
    });

    it('shares only the poster png without mp3 or lrc files', async () => {
        const cardBlob = new Blob(['png'], { type: 'image/png' });
        mockedShareMemoryRecordFiles.mockResolvedValue('web-share');

        const result = await shareMemoryRecordPoster(playable, {
            renderPoster: vi.fn().mockResolvedValue(cardBlob),
        });

        expect(mockedShareMemoryRecordFiles).toHaveBeenCalledWith(
            [{ blob: cardBlob, fileName: '星河回信 - 苏里.png' }],
            '星河回信 - Emo Cloud',
        );
        expect(result.method).toBe('web-share');
        expect(result.fileNames).toEqual(['星河回信 - 苏里.png']);
    });

    it('returns download when poster sharing falls back to browser download', async () => {
        const cardBlob = new Blob(['png'], { type: 'image/png' });
        mockedShareMemoryRecordFiles.mockResolvedValue('download');

        const result = await shareMemoryRecordPoster(playable, {
            renderPoster: vi.fn().mockResolvedValue(cardBlob),
        });

        expect(mockedShareMemoryRecordFiles).toHaveBeenCalledWith(
            [{ blob: cardBlob, fileName: '星河回信 - 苏里.png' }],
            '星河回信 - Emo Cloud',
        );
        expect(result.method).toBe('download');
        expect(result.cardFileName).toBe('星河回信 - 苏里.png');
    });
});
