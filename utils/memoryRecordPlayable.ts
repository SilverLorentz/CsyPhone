import type { MemoryRecord } from '../types';
import type { MemoryRecordPlayable } from '../types/music';
import { getMemoryRecordCoverImage } from './memoryRecordCovers';

const MEMORY_RECORD_ID_OFFSET = 850000000;
const MASTERING_MUSIC_FALLBACK_MARKERS = [
    '最终压制使用兜底拼接',
    '已改用音乐分轨播放',
];

function requiresMasterAudio(record: MemoryRecord): boolean {
    return record.mode === 'char_to_user' || record.mode === 'dream_mix';
}

function shouldPlayMusicFallback(record: MemoryRecord): boolean {
    return requiresMasterAudio(record)
        && Boolean(record.musicAudioId)
        && Boolean(record.error && MASTERING_MUSIC_FALLBACK_MARKERS.some(marker => record.error?.includes(marker)));
}

export function createMemoryRecordNumericId(recordId: string): number {
    let hash = 0;
    for (let i = 0; i < recordId.length; i++) {
        hash = (hash * 31 + recordId.charCodeAt(i)) >>> 0;
    }
    return MEMORY_RECORD_ID_OFFSET + (hash % 100000000);
}

export function getMemoryRecordPlayableAudioId(record: MemoryRecord): string | undefined {
    if (requiresMasterAudio(record)) {
        return shouldPlayMusicFallback(record) ? record.musicAudioId : record.masterAudioId;
    }
    return record.masterAudioId || record.musicAudioId;
}

export function hasPlayableMemoryRecordAudio(record: MemoryRecord): boolean {
    return Boolean(getMemoryRecordPlayableAudioId(record));
}

export function memoryRecordToPlayable(record: MemoryRecord): MemoryRecordPlayable {
    const audioId = getMemoryRecordPlayableAudioId(record);
    const playsMasterAudio = requiresMasterAudio(record) && audioId === record.masterAudioId;
    const hasMasterLyricsOffset = playsMasterAudio && Boolean(record.lyricsOffsetMs && record.lyricsOffsetMs > 0);

    return {
        kind: 'memoryRecord',
        id: createMemoryRecordNumericId(record.id),
        recordId: record.id,
        name: record.title,
        artistName: record.artistName || record.charName,
        albumName: record.albumName || '回忆唱片匣',
        duration: record.durationMs || 0,
        coverImageUrl: getMemoryRecordCoverImage(record),
        coverGradient: record.coverGradient,
        lyrics: record.lyrics,
        monologueText: hasMasterLyricsOffset ? record.monologueText : undefined,
        lyricsOffsetMs: hasMasterLyricsOffset ? record.lyricsOffsetMs : undefined,
        lyricTiming: record.lyricTiming,
        audioId,
        requiresMasterAudio: requiresMasterAudio(record),
        createdAt: record.createdAt,
    };
}
