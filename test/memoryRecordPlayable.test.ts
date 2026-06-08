import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DB } from '../utils/db';
import { hasPlayableMemoryRecordAudio, memoryRecordToPlayable } from '../utils/memoryRecordPlayable';
import { resolvePlayableUrl } from '../utils/musicService';
import type { MemoryRecord } from '../types';

const record: MemoryRecord = {
    id: 'mrec-playable',
    charId: 'char-a',
    charName: 'Sully',
    userName: '我',
    mode: 'dream_mix',
    status: 'ready',
    title: '梦里回声',
    albumName: '回忆唱片匣',
    artistName: 'Sully',
    monologueText: '先听这一段。',
    lyrics: '[Verse]\n梦在转动',
    lyricsOffsetMs: 12000,
    musicPrompt: 'dream pop',
    coverGradient: 'linear-gradient(135deg, #f7d6e0, #2d3142)',
    seedMemoryIds: ['vmem-a'],
    masterAudioId: 'mrec-playable:master',
    durationMs: 90000,
    createdAt: 100,
    updatedAt: 100,
};

describe('memory record playable resolver', () => {
    beforeEach(async () => {
        Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
        Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });
        Object.defineProperty(globalThis, 'Blob', { value: NodeBlob, configurable: true });
        Object.defineProperty(URL, 'createObjectURL', {
            value: vi.fn(() => 'blob:memory-record'),
            configurable: true,
        });
    });

    it('creates a playable and resolves its local blob URL', async () => {
        await DB.saveMemoryRecord(record);
        await DB.saveMemoryRecordAudio({
            id: record.masterAudioId!,
            recordId: record.id,
            kind: 'master',
            blob: new Blob(['audio'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationMs: record.durationMs,
            createdAt: 101,
        });

        const playable = memoryRecordToPlayable(record);
        const url = await resolvePlayableUrl(playable);

        expect(playable.kind).toBe('memoryRecord');
        expect(playable.coverImageUrl).toMatch(/^\/images\/music-record-covers\/cover-\d{2}\.(jpg|png)$/);
        expect(playable.monologueText).toBe('先听这一段。');
        expect(playable.lyricsOffsetMs).toBe(12000);
        expect(playable.lyrics).toContain('梦在转动');
        expect(url).toBe('blob:memory-record');
        expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });

    it('keeps old mastered records on the legacy lyric timeline when no offset exists', () => {
        const legacyPlayable = memoryRecordToPlayable({
            ...record,
            id: 'mrec-legacy-master',
            lyricsOffsetMs: undefined,
        });

        expect(legacyPlayable.audioId).toBe(record.masterAudioId);
        expect(legacyPlayable.coverImageUrl).toMatch(/^\/images\/music-record-covers\/cover-\d{2}\.(jpg|png)$/);
        expect(legacyPlayable.monologueText).toBeUndefined();
        expect(legacyPlayable.lyricsOffsetMs).toBeUndefined();
    });

    it('does not treat monologue-only records as playable songs', async () => {
        const monologueOnlyRecord: MemoryRecord = {
            ...record,
            id: 'mrec-monologue-only',
            status: 'failed',
            masterAudioId: undefined,
            musicAudioId: undefined,
            monologueAudioId: 'mrec-monologue-only:monologue',
            durationMs: 0,
            error: 'MiniMax Music 生成失败',
        };

        await DB.saveMemoryRecord(monologueOnlyRecord);
        await DB.saveMemoryRecordAudio({
            id: monologueOnlyRecord.monologueAudioId!,
            recordId: monologueOnlyRecord.id,
            kind: 'monologue',
            blob: new Blob(['spoken intro'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationMs: 5000,
            createdAt: 101,
        });

        const playable = memoryRecordToPlayable(monologueOnlyRecord);
        const url = await resolvePlayableUrl(playable);

        expect(hasPlayableMemoryRecordAudio(monologueOnlyRecord)).toBe(false);
        expect(playable.audioId).toBeUndefined();
        expect(url).toBeNull();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('does not play raw music tracks for monologue modes before mastering', async () => {
        const musicOnlyMonologueRecord: MemoryRecord = {
            ...record,
            id: 'mrec-music-only-monologue',
            status: 'failed',
            masterAudioId: undefined,
            musicAudioId: 'mrec-music-only-monologue:music',
            monologueAudioId: 'mrec-music-only-monologue:monologue',
            durationMs: 90000,
            error: '最终压制失败',
        };

        await DB.saveMemoryRecordAudio({
            id: musicOnlyMonologueRecord.musicAudioId!,
            recordId: musicOnlyMonologueRecord.id,
            kind: 'music',
            blob: new Blob(['song only'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationMs: 90000,
            createdAt: 101,
        });

        const playable = memoryRecordToPlayable(musicOnlyMonologueRecord);
        const url = await resolvePlayableUrl(playable);

        expect(hasPlayableMemoryRecordAudio(musicOnlyMonologueRecord)).toBe(false);
        expect(playable.requiresMasterAudio).toBe(true);
        expect(playable.audioId).toBeUndefined();
        expect(url).toBeNull();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('plays the music track for broken mastering fallbacks', async () => {
        const fallbackErrors = [
            '最终压制使用兜底拼接：MPEGMode is not defined',
            '最终压制失败，已改用音乐分轨播放（未包含独白）：decode failed',
        ];

        for (const [index, error] of fallbackErrors.entries()) {
            const brokenFallbackRecord: MemoryRecord = {
                ...record,
                id: `mrec-broken-fallback-${index}`,
            masterAudioId: `mrec-broken-fallback-${index}:master`,
            musicAudioId: `mrec-broken-fallback-${index}:music`,
            error,
            };

            await DB.saveMemoryRecordAudio({
                id: brokenFallbackRecord.masterAudioId!,
                recordId: brokenFallbackRecord.id,
                kind: 'master',
                blob: new Blob(['spoken intro only'], { type: 'audio/mpeg' }),
                mimeType: 'audio/mpeg',
                durationMs: 90000,
                createdAt: 101,
            });
            await DB.saveMemoryRecordAudio({
                id: brokenFallbackRecord.musicAudioId!,
                recordId: brokenFallbackRecord.id,
                kind: 'music',
                blob: new Blob(['song only'], { type: 'audio/mpeg' }),
                mimeType: 'audio/mpeg',
                durationMs: 90000,
                createdAt: 102,
            });

            const playable = memoryRecordToPlayable(brokenFallbackRecord);
            const url = await resolvePlayableUrl(playable);

            expect(hasPlayableMemoryRecordAudio(brokenFallbackRecord)).toBe(true);
            expect(playable.requiresMasterAudio).toBe(true);
            expect(playable.audioId).toBe(brokenFallbackRecord.musicAudioId);
            expect(playable.monologueText).toBeUndefined();
            expect(playable.lyricsOffsetMs).toBeUndefined();
            expect(url).toBe('blob:memory-record');
        }

        expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });

    it('still plays raw music tracks for non-monologue modes', async () => {
        const musicOnlyRecord: MemoryRecord = {
            ...record,
            id: 'mrec-music-only',
            mode: 'relationship_theme',
            masterAudioId: undefined,
            musicAudioId: 'mrec-music-only:music',
            monologueAudioId: undefined,
            monologueText: '',
            durationMs: 90000,
        };

        await DB.saveMemoryRecordAudio({
            id: musicOnlyRecord.musicAudioId!,
            recordId: musicOnlyRecord.id,
            kind: 'music',
            blob: new Blob(['song'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationMs: 90000,
            createdAt: 101,
        });

        const playable = memoryRecordToPlayable(musicOnlyRecord);
        const url = await resolvePlayableUrl(playable);

        expect(hasPlayableMemoryRecordAudio(musicOnlyRecord)).toBe(true);
        expect(playable.requiresMasterAudio).toBe(false);
        expect(playable.audioId).toBe(musicOnlyRecord.musicAudioId);
        expect(playable.monologueText).toBeUndefined();
        expect(playable.lyricsOffsetMs).toBeUndefined();
        expect(url).toBe('blob:memory-record');
        expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    });
});
