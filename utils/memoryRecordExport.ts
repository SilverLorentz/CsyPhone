import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { MemoryRecord, MemoryRecordAudio } from '../types';
import type { MemoryRecordPlayable } from '../types/music';
import { DB } from './db';
import { buildLocalLyrics } from './localLyrics';
import { getMemoryRecordCoverImage } from './memoryRecordCovers';

export type MemoryRecordMp3ExportMethod = 'native-share' | 'web-share' | 'download';
export type MemoryRecordFileShareMethod = MemoryRecordMp3ExportMethod;

export interface MemoryRecordMp3ExportResult {
    fileName: string;
    method: MemoryRecordFileShareMethod;
    lyricsFileName?: string;
}

export interface MemoryRecordExportFile {
    blob: Blob;
    fileName: string;
}

export interface MemoryRecordExportPackage {
    audioEntry: MemoryRecordAudio;
    fileName: string;
    files: MemoryRecordExportFile[];
    lyricsFileName?: string;
    record: MemoryRecord;
}

interface ResolvedMemoryRecordExportAudio {
    audioEntry: MemoryRecordAudio;
    record: MemoryRecord;
}

interface MemoryRecordCoverPayload {
    bytes: Uint8Array;
    mimeType: string;
}

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1F]/g;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const DEFAULT_MP3_FILE_NAME = 'Emo Cloud 本地歌曲.mp3';
const MAX_FILE_NAME_BASE_LENGTH = 96;
const ID3_TEXT_ENCODING_UTF16 = 0x01;
const ID3_DEFAULT_LANGUAGE = 'eng';
const UTF16LE_BOM = Uint8Array.of(0xff, 0xfe);
const UTF16_TERMINATOR = Uint8Array.of(0x00, 0x00);

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isShareCancelled(error: unknown): boolean {
    const name = typeof error === 'object' && error !== null && 'name' in error
        ? String((error as { name?: unknown }).name)
        : '';
    const message = getErrorMessage(error).toLowerCase();

    return name === 'AbortError'
        || message.includes('cancel')
        || message.includes('abort')
        || message.includes('取消');
}

function sanitizeFileSegment(value: string): string {
    return value
        .replace(INVALID_FILENAME_CHARS, '')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '')
        .trim();
}

export function sanitizeMemoryRecordMp3FileName(title: string, artistName: string): string {
    const parts = [sanitizeFileSegment(title), sanitizeFileSegment(artistName)].filter(Boolean);
    let baseName = parts.join(' - ') || DEFAULT_MP3_FILE_NAME.replace(/\.mp3$/i, '');

    if (WINDOWS_RESERVED_NAMES.test(baseName)) {
        baseName = `${baseName} song`;
    }

    if (baseName.length > MAX_FILE_NAME_BASE_LENGTH) {
        baseName = baseName.slice(0, MAX_FILE_NAME_BASE_LENGTH).replace(/[. ]+$/g, '').trim();
    }

    return `${baseName || 'Emo Cloud 本地歌曲'}.mp3`;
}

export function sanitizeMemoryRecordLrcFileName(title: string, artistName: string): string {
    return sanitizeMemoryRecordMp3FileName(title, artistName).replace(/\.mp3$/i, '.lrc');
}

async function readCandidateAudioEntry(candidateIds: string[]): Promise<MemoryRecordAudio | null> {
    for (const id of candidateIds) {
        const entry = await DB.getMemoryRecordAudioEntry(id);
        if (entry?.blob) return entry;
    }

    return null;
}

async function resolveExportAudio(playable: MemoryRecordPlayable): Promise<ResolvedMemoryRecordExportAudio> {
    const record = await DB.getMemoryRecordById(playable.recordId);
    if (!record) {
        throw new Error('没有找到这首本地生成歌');
    }

    const candidateIds: string[] = [];
    const seen = new Set<string>();
    const addCandidate = (id?: string) => {
        const trimmed = id?.trim();
        if (!trimmed || seen.has(trimmed)) return;
        seen.add(trimmed);
        candidateIds.push(trimmed);
    };

    addCandidate(record.masterAudioId);
    addCandidate(record.musicAudioId);
    addCandidate(playable.audioId);

    const directEntry = await readCandidateAudioEntry(candidateIds);
    if (directEntry) return { audioEntry: directEntry, record };

    const recordAudio = await DB.getMemoryRecordAudioByRecordId(playable.recordId);
    const fallbackEntry = recordAudio.find((entry) => entry.kind === 'master' && entry.blob)
        || recordAudio.find((entry) => entry.kind === 'music' && entry.blob);

    if (!fallbackEntry) {
        throw new Error('没有找到可导出的音频');
    }

    return { audioEntry: fallbackEntry, record };
}

function ensureMp3Blob(blob: Blob): Blob {
    if (blob.type === 'audio/mpeg' || blob.type === 'audio/mp3') {
        return blob;
    }

    return new Blob([blob], { type: 'audio/mpeg' });
}

function concatUint8Arrays(chunks: readonly Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return result;
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}

function stringToAsciiBytes(value: string): Uint8Array {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
        bytes[i] = value.charCodeAt(i) & 0xff;
    }
    return bytes;
}

function stringToUtf16LeBytes(value: string): Uint8Array {
    const bytes = new Uint8Array(value.length * 2);
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        bytes[i * 2] = code & 0xff;
        bytes[i * 2 + 1] = code >> 8;
    }
    return bytes;
}

function stringToUtf16TextBytes(value: string): Uint8Array {
    return concatUint8Arrays([UTF16LE_BOM, stringToUtf16LeBytes(value)]);
}

function uint32ToBytes(value: number): Uint8Array {
    return Uint8Array.of(
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
    );
}

function uint32ToSyncsafeBytes(value: number): Uint8Array {
    return Uint8Array.of(
        (value >>> 21) & 0x7f,
        (value >>> 14) & 0x7f,
        (value >>> 7) & 0x7f,
        value & 0x7f,
    );
}

function syncsafeBytesToInt(bytes: Uint8Array, offset: number): number {
    return ((bytes[offset] & 0x7f) << 21)
        | ((bytes[offset + 1] & 0x7f) << 14)
        | ((bytes[offset + 2] & 0x7f) << 7)
        | (bytes[offset + 3] & 0x7f);
}

function stripLeadingId3Tag(bytes: Uint8Array): Uint8Array {
    if (
        bytes.byteLength < 10
        || bytes[0] !== 0x49
        || bytes[1] !== 0x44
        || bytes[2] !== 0x33
    ) {
        return bytes;
    }

    const tagSize = syncsafeBytesToInt(bytes, 6);
    const totalTagSize = 10 + tagSize;
    if (totalTagSize <= 10 || totalTagSize > bytes.byteLength) {
        return bytes;
    }

    return bytes.slice(totalTagSize);
}

function buildId3Frame(frameId: string, payload: Uint8Array): Uint8Array | null {
    if (!frameId || frameId.length !== 4 || payload.byteLength === 0) return null;

    return concatUint8Arrays([
        stringToAsciiBytes(frameId),
        uint32ToBytes(payload.byteLength),
        Uint8Array.of(0x00, 0x00),
        payload,
    ]);
}

function buildId3TextFrame(frameId: string, value: string | undefined): Uint8Array | null {
    const text = value?.replace(/[\r\n]+/g, ' ').trim();
    if (!text) return null;

    return buildId3Frame(
        frameId,
        concatUint8Arrays([
            Uint8Array.of(ID3_TEXT_ENCODING_UTF16),
            stringToUtf16TextBytes(text),
        ]),
    );
}

function buildId3UnsynchronizedLyricsFrame(lyrics: string | null): Uint8Array | null {
    const text = lyrics?.trim();
    if (!text) return null;

    return buildId3Frame(
        'USLT',
        concatUint8Arrays([
            Uint8Array.of(ID3_TEXT_ENCODING_UTF16),
            stringToAsciiBytes(ID3_DEFAULT_LANGUAGE),
            UTF16_TERMINATOR,
            stringToUtf16TextBytes(text),
        ]),
    );
}

function buildId3AttachedPictureFrame(cover: MemoryRecordCoverPayload | null): Uint8Array | null {
    if (!cover || cover.bytes.byteLength === 0) return null;

    return buildId3Frame(
        'APIC',
        concatUint8Arrays([
            Uint8Array.of(ID3_TEXT_ENCODING_UTF16),
            stringToAsciiBytes(cover.mimeType),
            Uint8Array.of(0x00),
            Uint8Array.of(0x03),
            UTF16_TERMINATOR,
            cover.bytes,
        ]),
    );
}

function buildId3Tag(options: {
    title: string;
    artistName: string;
    albumName: string;
    lyrics: string | null;
    cover: MemoryRecordCoverPayload | null;
}): Uint8Array | null {
    const frames = [
        buildId3TextFrame('TIT2', options.title),
        buildId3TextFrame('TPE1', options.artistName),
        buildId3TextFrame('TALB', options.albumName),
        buildId3UnsynchronizedLyricsFrame(options.lyrics),
        buildId3AttachedPictureFrame(options.cover),
    ].filter((frame): frame is Uint8Array => Boolean(frame));

    if (frames.length === 0) return null;

    const body = concatUint8Arrays(frames);
    return concatUint8Arrays([
        stringToAsciiBytes('ID3'),
        Uint8Array.of(0x03, 0x00, 0x00),
        uint32ToSyncsafeBytes(body.byteLength),
        body,
    ]);
}

function inferCoverMimeType(url: string, blob: Blob, response: Response): string {
    const headerMime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (headerMime?.startsWith('image/')) return headerMime;

    const blobMime = blob.type.split(';')[0]?.trim().toLowerCase();
    if (blobMime?.startsWith('image/')) return blobMime;

    if (/\.png(?:[?#].*)?$/i.test(url)) return 'image/png';
    if (/\.webp(?:[?#].*)?$/i.test(url)) return 'image/webp';
    return 'image/jpeg';
}

async function fetchMemoryRecordCoverPayload(url: string | undefined): Promise<MemoryRecordCoverPayload | null> {
    if (!url || typeof fetch !== 'function') return null;

    try {
        const response = await fetch(url);
        if (!response.ok) return null;

        const blob = await response.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.byteLength === 0) return null;

        return {
            bytes,
            mimeType: inferCoverMimeType(url, blob, response),
        };
    } catch (error) {
        console.warn('[MemoryRecordExport] Cover embedding skipped:', error);
        return null;
    }
}

function formatLrcTimestamp(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const totalCentiseconds = Math.round(safeSeconds * 100);
    const minutes = Math.floor(totalCentiseconds / 6000);
    const remainingCentiseconds = totalCentiseconds % 6000;
    const displaySeconds = Math.floor(remainingCentiseconds / 100);
    const centiseconds = remainingCentiseconds % 100;

    return `[${String(minutes).padStart(2, '0')}:${String(displaySeconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}]`;
}

function formatLrcMetadataLine(key: string, value: string | undefined): string | null {
    const safeValue = value?.replace(/[\r\n]+/g, ' ').trim();
    return safeValue ? `[${key}:${safeValue}]` : null;
}

function formatLrcLineText(text: string): string {
    return text.replace(/[\r\n]+/g, ' ').trim();
}

function buildMemoryRecordLocalLyrics(
    playable: MemoryRecordPlayable,
    record: MemoryRecord,
    audioEntry: MemoryRecordAudio,
): ReturnType<typeof buildLocalLyrics> {
    const usesMasterAudio = audioEntry.kind === 'master';
    const lyrics = record.lyrics || playable.lyrics;
    const monologueText = usesMasterAudio ? (record.monologueText || playable.monologueText) : undefined;
    const lyricsOffsetMs = usesMasterAudio ? (playable.lyricsOffsetMs ?? record.lyricsOffsetMs) : undefined;
    const lyricTiming = playable.lyricTiming ?? record.lyricTiming;

    return buildLocalLyrics({
        lyrics,
        monologueText,
        lyricsOffsetMs,
        lyricTiming,
    });
}

function buildMemoryRecordLrcText(
    playable: MemoryRecordPlayable,
    record: MemoryRecord,
    audioEntry: MemoryRecordAudio,
): string | null {
    const localLyrics = buildMemoryRecordLocalLyrics(playable, record, audioEntry);
    const timedLines = localLyrics.lines
        .map((line) => ({
            time: line.time,
            text: formatLrcLineText(line.text),
        }))
        .filter((line) => line.text);

    if (timedLines.length === 0) return null;

    const metadataLines = [
        formatLrcMetadataLine('ti', playable.name || record.title),
        formatLrcMetadataLine('ar', playable.artistName || record.artistName),
        formatLrcMetadataLine('al', playable.albumName || record.albumName),
        '[by:Emo Cloud]',
    ].filter((line): line is string => Boolean(line));

    const lyricLines = timedLines.map((line) => `${formatLrcTimestamp(line.time)}${line.text}`);
    return `${[...metadataLines, ...lyricLines].join('\n')}\n`;
}

function buildMemoryRecordEmbeddedLyricsText(
    playable: MemoryRecordPlayable,
    record: MemoryRecord,
    audioEntry: MemoryRecordAudio,
): string | null {
    const localLyrics = buildMemoryRecordLocalLyrics(playable, record, audioEntry);
    const lines = localLyrics.lines
        .map((line) => formatLrcLineText(line.text))
        .filter(Boolean);

    return lines.length > 0 ? lines.join('\n') : null;
}

function buildMemoryRecordLrcFile(
    playable: MemoryRecordPlayable,
    record: MemoryRecord,
    audioEntry: MemoryRecordAudio,
): MemoryRecordExportFile | null {
    const lrcText = buildMemoryRecordLrcText(playable, record, audioEntry);
    if (!lrcText) return null;

    return {
        blob: new Blob([lrcText], { type: 'text/plain;charset=utf-8' }),
        fileName: sanitizeMemoryRecordLrcFileName(playable.name, playable.artistName),
    };
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
            }
            reject(new Error('音频读取失败'));
        };
        reader.onerror = () => reject(reader.error || new Error('音频读取失败'));
        reader.readAsDataURL(blob);
    });
}

async function tryNativeShare(files: MemoryRecordExportFile[], title: string): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;

    try {
        const fileUris: string[] = [];

        for (const file of files) {
            const dataUrl = await blobToDataUrl(file.blob);
            await Filesystem.writeFile({
                path: file.fileName,
                data: dataUrl,
                directory: Directory.Cache,
            });
            const uriResult = await Filesystem.getUri({
                directory: Directory.Cache,
                path: file.fileName,
            });
            fileUris.push(uriResult.uri);
        }

        await Share.share({
            title,
            files: fileUris,
        });
        return true;
    } catch (error) {
        if (isShareCancelled(error)) {
            throw new Error('分享已取消');
        }
        console.warn('[MemoryRecordExport] Native share failed, falling back to download:', error);
        return false;
    }
}

async function tryWebShare(files: MemoryRecordExportFile[], title: string): Promise<boolean> {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File === 'undefined') {
        return false;
    }

    const shareFiles = files.map((file) => new File([file.blob], file.fileName, { type: file.blob.type || 'application/octet-stream' }));
    const shareData: ShareData = {
        title,
        files: shareFiles,
    };

    if (typeof navigator.canShare === 'function' && !navigator.canShare(shareData)) {
        return false;
    }

    try {
        await navigator.share(shareData);
        return true;
    } catch (error) {
        if (isShareCancelled(error)) {
            throw new Error('分享已取消');
        }
        console.warn('[MemoryRecordExport] Web share failed, falling back to download:', error);
        return false;
    }
}

async function buildTaggedMemoryRecordMp3(
    mp3Blob: Blob,
    playable: MemoryRecordPlayable,
    record: MemoryRecord,
    audioEntry: MemoryRecordAudio,
): Promise<Blob> {
    const audioBytes = stripLeadingId3Tag(new Uint8Array(await mp3Blob.arrayBuffer()));
    const coverImageUrl = playable.coverImageUrl || getMemoryRecordCoverImage(record);
    const cover = await fetchMemoryRecordCoverPayload(coverImageUrl);
    const lyrics = buildMemoryRecordEmbeddedLyricsText(playable, record, audioEntry);
    const tag = buildId3Tag({
        title: playable.name || record.title,
        artistName: playable.artistName || record.artistName || record.charName,
        albumName: playable.albumName || record.albumName || '回忆唱片匣',
        lyrics,
        cover,
    });

    if (!tag) return mp3Blob;

    const taggedBytes = concatUint8Arrays([tag, audioBytes]);
    return new Blob([uint8ArrayToArrayBuffer(taggedBytes)], { type: 'audio/mpeg' });
}

export async function buildMemoryRecordExportPackage(playable: MemoryRecordPlayable): Promise<MemoryRecordExportPackage> {
    const { audioEntry, record } = await resolveExportAudio(playable);
    const mp3Blob = ensureMp3Blob(audioEntry.blob);
    const taggedMp3Blob = await buildTaggedMemoryRecordMp3(mp3Blob, playable, record, audioEntry);
    const fileName = sanitizeMemoryRecordMp3FileName(playable.name, playable.artistName);
    const lrcFile = buildMemoryRecordLrcFile(playable, record, audioEntry);
    const files: MemoryRecordExportFile[] = [
        { blob: taggedMp3Blob, fileName },
        ...(lrcFile ? [lrcFile] : []),
    ];
    const lyricsFileName = lrcFile?.fileName;

    return {
        audioEntry,
        fileName,
        files,
        record,
        ...(lyricsFileName ? { lyricsFileName } : {}),
    };
}

export async function shareMemoryRecordFiles(
    files: MemoryRecordExportFile[],
    title: string,
): Promise<MemoryRecordFileShareMethod> {
    if (await tryNativeShare(files, title)) {
        return 'native-share';
    }

    if (await tryWebShare(files, title)) {
        return 'web-share';
    }

    for (const file of files) {
        triggerBrowserDownload(file.blob, file.fileName);
    }
    return 'download';
}

export async function exportMemoryRecordMp3(playable: MemoryRecordPlayable): Promise<MemoryRecordMp3ExportResult> {
    const exportPackage = await buildMemoryRecordExportPackage(playable);
    const method = await shareMemoryRecordFiles(exportPackage.files, exportPackage.fileName);

    return {
        fileName: exportPackage.fileName,
        method,
        ...(exportPackage.lyricsFileName ? { lyricsFileName: exportPackage.lyricsFileName } : {}),
    };
}
