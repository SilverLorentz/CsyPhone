// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import type { MemoryRecord } from '../types';
import type { MemoryRecordPlayable } from '../types/music';
import { DB } from './db';
import { computeLocalLyricsSourceHash } from './localLyrics';
import { exportMemoryRecordMp3, shareMemoryRecordFiles } from './memoryRecordExport';

let createObjectURLMock: ReturnType<typeof vi.fn>;

function syncsafeBytesToInt(bytes: Uint8Array, offset: number): number {
    return ((bytes[offset] & 0x7f) << 21)
        | ((bytes[offset + 1] & 0x7f) << 14)
        | ((bytes[offset + 2] & 0x7f) << 7)
        | (bytes[offset + 3] & 0x7f);
}

function uint32BytesToInt(bytes: Uint8Array, offset: number): number {
    return ((bytes[offset] << 24) >>> 0)
        + (bytes[offset + 1] << 16)
        + (bytes[offset + 2] << 8)
        + bytes[offset + 3];
}

function bytesToAscii(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

function decodeUtf16LeText(bytes: Uint8Array): string {
    let offset = bytes[0] === 0xff && bytes[1] === 0xfe ? 2 : 0;
    let text = '';

    for (; offset + 1 < bytes.byteLength; offset += 2) {
        const code = bytes[offset] | (bytes[offset + 1] << 8);
        if (code === 0) continue;
        text += String.fromCharCode(code);
    }

    return text;
}

async function readId3Frames(blob: Blob): Promise<Map<string, Uint8Array>> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytesToAscii(bytes.slice(0, 3))).toBe('ID3');
    expect(bytes[3]).toBe(3);

    const frames = new Map<string, Uint8Array>();
    const tagEnd = 10 + syncsafeBytesToInt(bytes, 6);
    let offset = 10;

    while (offset + 10 <= tagEnd) {
        const id = bytesToAscii(bytes.slice(offset, offset + 4));
        if (!/^[A-Z0-9]{4}$/.test(id)) break;

        const size = uint32BytesToInt(bytes, offset + 4);
        if (size <= 0 || offset + 10 + size > tagEnd) break;

        frames.set(id, bytes.slice(offset + 10, offset + 10 + size));
        offset += 10 + size;
    }

    return frames;
}

function getDownloadedMp3Blob(): Blob {
    const blob = createObjectURLMock.mock.calls
        .map(([downloadedBlob]) => downloadedBlob as Blob)
        .find((downloadedBlob) => downloadedBlob.type === 'audio/mpeg');

    expect(blob).toBeDefined();
    return blob!;
}

function decodeTextFrame(frame: Uint8Array | undefined): string {
    expect(frame).toBeDefined();
    expect(frame![0]).toBe(1);
    return decodeUtf16LeText(frame!.slice(1));
}

function decodeUsltFrame(frame: Uint8Array | undefined): string {
    expect(frame).toBeDefined();
    expect(frame![0]).toBe(1);
    expect(bytesToAscii(frame!.slice(1, 4))).toBe('eng');
    return decodeUtf16LeText(frame!.slice(6));
}

function buildRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
    return {
        id: 'record-1',
        charId: 'char-a',
        charName: 'Sully',
        userName: '我',
        mode: 'dream_mix',
        status: 'ready',
        title: '梦里回声',
        albumName: '回忆唱片匣',
        artistName: 'Sully',
        monologueText: '',
        lyrics: '[Verse]\n梦在转动',
        musicPrompt: 'dream pop',
        coverGradient: 'linear-gradient(135deg, #f7d6e0, #2d3142)',
        seedMemoryIds: [],
        createdAt: 100,
        updatedAt: 100,
        ...overrides,
    };
}

function buildPlayable(record: MemoryRecord): MemoryRecordPlayable {
    return {
        kind: 'memoryRecord',
        id: 850000001,
        recordId: record.id,
        name: record.title,
        artistName: record.artistName,
        albumName: record.albumName,
        duration: record.durationMs || 120000,
        lyrics: record.lyrics,
        audioId: record.masterAudioId || record.musicAudioId,
        requiresMasterAudio: true,
    };
}

async function saveAudio(recordId: string, id: string, kind: 'master' | 'music', text: string): Promise<void> {
    await DB.saveMemoryRecordAudio({
        id,
        recordId,
        kind,
        blob: new Blob([text], { type: 'audio/mpeg' }),
        mimeType: 'audio/mpeg',
        durationMs: 120000,
        createdAt: 100,
    });
}

describe('memoryRecordExport', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
        Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });

        createObjectURLMock = vi.fn(() => 'blob:memory-record-mp3');
        Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLMock, configurable: true });
        Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
        Object.defineProperty(globalThis, 'fetch', {
            value: vi.fn(async () => new Response(
                Uint8Array.of(1, 2, 3, 4).buffer,
                { headers: { 'content-type': 'image/png' } },
            )),
            configurable: true,
        });
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
        Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    it('exports master audio before music audio', async () => {
        const record = buildRecord({
            masterAudioId: 'record-1:master',
            musicAudioId: 'record-1:music',
        });
        await DB.saveMemoryRecord(record);
        await saveAudio(record.id, 'record-1:music', 'music', 'music-track');
        await saveAudio(record.id, 'record-1:master', 'master', 'master-track');
        const getAudioEntrySpy = vi.spyOn(DB, 'getMemoryRecordAudioEntry');

        const result = await exportMemoryRecordMp3(buildPlayable(record));

        expect(result.method).toBe('download');
        expect(result.fileName).toBe('梦里回声 - Sully.mp3');
        expect(result.lyricsFileName).toBe('梦里回声 - Sully.lrc');
        expect(getAudioEntrySpy).toHaveBeenCalledWith('record-1:master');
        expect(getAudioEntrySpy).not.toHaveBeenCalledWith('record-1:music');
        expect(createObjectURLMock).toHaveBeenCalledTimes(2);
    });

    it('embeds ID3v2.3 metadata, lyrics, and cover in the exported mp3', async () => {
        const record = buildRecord({
            masterAudioId: 'record-1:master',
            coverImageUrl: 'https://example.com/cover.png',
        });
        await DB.saveMemoryRecord(record);
        await saveAudio(record.id, 'record-1:master', 'master', 'master-track');

        await exportMemoryRecordMp3(buildPlayable(record));

        const frames = await readId3Frames(getDownloadedMp3Blob());
        expect([...frames.keys()]).toEqual(expect.arrayContaining(['TIT2', 'TPE1', 'TALB', 'USLT', 'APIC']));
        expect(decodeTextFrame(frames.get('TIT2'))).toBe('梦里回声');
        expect(decodeTextFrame(frames.get('TPE1'))).toBe('Sully');
        expect(decodeTextFrame(frames.get('TALB'))).toBe('回忆唱片匣');
        expect(decodeUsltFrame(frames.get('USLT'))).toContain('梦在转动');

        const apicFrame = frames.get('APIC');
        expect(apicFrame).toBeDefined();
        expect(bytesToAscii(apicFrame!.slice(1, 10))).toBe('image/png');
        expect(Array.from(apicFrame!.slice(-4))).toEqual([1, 2, 3, 4]);
    });

    it('falls back to music audio when master audio is missing', async () => {
        const record = buildRecord({
            masterAudioId: 'record-1:master',
            musicAudioId: 'record-1:music',
        });
        await DB.saveMemoryRecord(record);
        await saveAudio(record.id, 'record-1:music', 'music', 'music-track');
        const getAudioEntrySpy = vi.spyOn(DB, 'getMemoryRecordAudioEntry');

        await exportMemoryRecordMp3(buildPlayable(record));

        expect(getAudioEntrySpy).toHaveBeenNthCalledWith(1, 'record-1:master');
        expect(getAudioEntrySpy).toHaveBeenNthCalledWith(2, 'record-1:music');
        expect(createObjectURLMock).toHaveBeenCalledTimes(2);
    });

    it('throws a user-readable error when there is no audio blob', async () => {
        const record = buildRecord({
            masterAudioId: 'record-1:master',
            musicAudioId: 'record-1:music',
        });
        await DB.saveMemoryRecord(record);

        await expect(exportMemoryRecordMp3(buildPlayable(record))).rejects.toThrow('没有找到可导出的音频');
    });

    it('removes unsafe filename characters and keeps the mp3 extension', async () => {
        const record = buildRecord({
            title: '梦:里/回*声?',
            artistName: 'Sul<ly>|"A',
            musicAudioId: 'record-1:music',
        });
        await DB.saveMemoryRecord(record);
        await saveAudio(record.id, 'record-1:music', 'music', 'music-track');

        const result = await exportMemoryRecordMp3(buildPlayable(record));

        expect(result.fileName).toBe('梦里回声 - SullyA.mp3');
        expect(result.lyricsFileName).toBe('梦里回声 - SullyA.lrc');
        expect(result.fileName).not.toMatch(/[\\/:*?"<>|]/);
        expect(result.lyricsFileName).not.toMatch(/[\\/:*?"<>|]/);
    });

    it('exports an lrc file with local lyrics timing', async () => {
        const record = buildRecord({
            masterAudioId: 'record-1:master',
            monologueText: '开场白。',
            lyrics: '第一句\n第二句',
            lyricsOffsetMs: 20000,
            lyricTiming: {
                sourceHash: computeLocalLyricsSourceHash(['开场白。', '第一句', '第二句']),
                lineTimesMs: [1000, 21000, 33000],
                updatedAt: 200,
            },
        });
        await DB.saveMemoryRecord(record);
        await saveAudio(record.id, 'record-1:master', 'master', 'master-track');

        const result = await exportMemoryRecordMp3(buildPlayable(record));
        const lrcBlob = createObjectURLMock.mock.calls
            .map(([blob]) => blob as Blob)
            .find((blob) => blob.type.startsWith('text/plain'));

        expect(result.lyricsFileName).toBe('梦里回声 - Sully.lrc');
        expect(lrcBlob).toBeDefined();
        const lrcText = await lrcBlob!.text();
        expect(lrcText).toContain('[ti:梦里回声]');
        expect(lrcText).toContain('[00:01.00]开场白。');
        expect(lrcText).toContain('[00:21.00]第一句');
        expect(lrcText).toContain('[00:33.00]第二句');
    });

    it('downloads only the mp3 when there are no lyrics', async () => {
        const record = buildRecord({
            lyrics: '',
            monologueText: '',
            musicAudioId: 'record-1:music',
        });
        await DB.saveMemoryRecord(record);
        await saveAudio(record.id, 'record-1:music', 'music', 'music-track');

        const result = await exportMemoryRecordMp3(buildPlayable(record));
        const frames = await readId3Frames(getDownloadedMp3Blob());

        expect(result.fileName).toBe('梦里回声 - Sully.mp3');
        expect(result.lyricsFileName).toBeUndefined();
        expect(createObjectURLMock).toHaveBeenCalledTimes(1);
        expect(frames.has('USLT')).toBe(false);
        expect(frames.has('APIC')).toBe(true);
    });

    it('exports mp3 without APIC when cover embedding fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        Object.defineProperty(globalThis, 'fetch', {
            value: vi.fn(async () => {
                throw new Error('cover failed');
            }),
            configurable: true,
        });
        const record = buildRecord({
            masterAudioId: 'record-1:master',
            coverImageUrl: 'https://example.com/missing-cover.png',
        });
        await DB.saveMemoryRecord(record);
        await saveAudio(record.id, 'record-1:master', 'master', 'master-track');

        await exportMemoryRecordMp3(buildPlayable(record));

        const frames = await readId3Frames(getDownloadedMp3Blob());
        expect(frames.has('TIT2')).toBe(true);
        expect(frames.has('USLT')).toBe(true);
        expect(frames.has('APIC')).toBe(false);
    });

    it('uses Web Share when browser file sharing is available', async () => {
        const webShare = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'share', { value: webShare, configurable: true });
        Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true });

        const method = await shareMemoryRecordFiles([
            { blob: new Blob(['png'], { type: 'image/png' }), fileName: 'card.png' },
        ], '分享卡片');

        expect(method).toBe('web-share');
        expect(webShare).toHaveBeenCalledWith(expect.objectContaining({
            files: [expect.any(File)],
            title: '分享卡片',
        }));
        expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    });

    it('falls back to download when native share fails and Web Share is unsupported', async () => {
        vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
        Object.defineProperty(Filesystem, 'writeFile', {
            configurable: true,
            value: vi.fn().mockResolvedValue(undefined),
        });
        Object.defineProperty(Filesystem, 'getUri', {
            configurable: true,
            value: vi.fn().mockResolvedValue({ uri: 'cache://song.mp3' }),
        });

        const method = await shareMemoryRecordFiles([
            { blob: new Blob(['png'], { type: 'image/png' }), fileName: 'card.png' },
            { blob: new Blob(['mp3'], { type: 'audio/mpeg' }), fileName: 'song.mp3' },
        ], '分享卡片');

        expect(method).toBe('download');
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2);
    });
});
