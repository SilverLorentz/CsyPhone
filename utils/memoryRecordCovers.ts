import type { MemoryRecord } from '../types';

export const MEMORY_RECORD_COVER_URLS = [
    '/images/music-record-covers/cover-01.png',
    '/images/music-record-covers/cover-02.png',
    '/images/music-record-covers/cover-03.png',
    '/images/music-record-covers/cover-04.png',
    '/images/music-record-covers/cover-05.png',
    '/images/music-record-covers/cover-06.png',
    '/images/music-record-covers/cover-07.png',
    '/images/music-record-covers/cover-08.png',
    '/images/music-record-covers/cover-09.jpg',
    '/images/music-record-covers/cover-10.jpg',
    '/images/music-record-covers/cover-11.jpg',
    '/images/music-record-covers/cover-12.jpg',
    '/images/music-record-covers/cover-13.jpg',
    '/images/music-record-covers/cover-14.jpg',
    '/images/music-record-covers/cover-15.jpg',
    '/images/music-record-covers/cover-16.jpg',
    '/images/music-record-covers/cover-17.png',
    '/images/music-record-covers/cover-18.png',
    '/images/music-record-covers/cover-19.png',
    '/images/music-record-covers/cover-20.png',
    '/images/music-record-covers/cover-21.jpg',
    '/images/music-record-covers/cover-22.png',
    '/images/music-record-covers/cover-23.jpg',
    '/images/music-record-covers/cover-24.png',
    '/images/music-record-covers/cover-25.png',
    '/images/music-record-covers/cover-26.jpg',
    '/images/music-record-covers/cover-27.jpg',
    '/images/music-record-covers/cover-28.jpg',
    '/images/music-record-covers/cover-29.jpg',
    '/images/music-record-covers/cover-30.jpg',
    '/images/music-record-covers/cover-31.jpg',
    '/images/music-record-covers/cover-32.jpg',
    '/images/music-record-covers/cover-33.jpg',
    '/images/music-record-covers/cover-34.jpg',
    '/images/music-record-covers/cover-35.jpg',
    '/images/music-record-covers/cover-36.jpg',
    '/images/music-record-covers/cover-37.jpg',
    '/images/music-record-covers/cover-38.png',
    '/images/music-record-covers/cover-39.png',
    '/images/music-record-covers/cover-40.png',
    '/images/music-record-covers/cover-41.png',
    '/images/music-record-covers/cover-42.png',
    '/images/music-record-covers/cover-43.png',
    '/images/music-record-covers/cover-44.png',
    '/images/music-record-covers/cover-45.jpg',
    '/images/music-record-covers/cover-46.jpg',
    '/images/music-record-covers/cover-47.jpg',
    '/images/music-record-covers/cover-48.jpg',
    '/images/music-record-covers/cover-49.png',
] as const;

function hashString(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function selectMemoryRecordCover(seed: string): string | undefined {
    const covers: readonly string[] = MEMORY_RECORD_COVER_URLS;
    if (covers.length === 0) return undefined;
    return covers[hashString(seed) % covers.length];
}

export function getMemoryRecordCoverImage(record: Pick<MemoryRecord, 'id' | 'coverImageUrl'>): string | undefined {
    return record.coverImageUrl || selectMemoryRecordCover(record.id);
}
