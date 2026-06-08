import type { MemoryRecordLyricTiming } from './memoryRecord';

export type MusicSearchTab =
    | 'all'
    | 'song'
    | 'playlist'
    | 'album'
    | 'artist'
    | 'radio'
    | 'program';

export type MusicEntityKind = Exclude<MusicSearchTab, 'all'>;

export interface NeteaseArtist {
    id: number;
    name: string;
    avatarUrl?: string;
}

export interface NeteaseArtistSummary extends NeteaseArtist {
    kind: 'artist';
    picUrl?: string;
    musicSize?: number;
    albumSize?: number;
    briefDesc?: string;
    description?: string;
}

export interface NeteaseAlbumSummary {
    kind: 'album';
    id: number;
    name: string;
    picUrl?: string;
    artistName?: string;
    publishTime?: number;
    songCount?: number;
    description?: string;
    songs?: NeteaseSong[];
}

export type NeteaseAlbum = NeteaseAlbumSummary;

export interface NeteaseSong {
    kind: 'song';
    id: number;
    name: string;
    artists: NeteaseArtist[];
    album: NeteaseAlbumSummary;
    duration: number;
    alias?: string[];
}

export type SongPlayable = NeteaseSong;

export interface NeteaseSongUrl {
    id: number;
    url: string | null;
    br: number;
    size: number;
    type: string;
}

export interface NeteaseLyric {
    lrc?: { lyric: string };
    tlyric?: { lyric: string };
}

export interface NeteasePlaylistCreator {
    userId: number;
    nickname: string;
    avatarUrl: string;
}

export interface NeteasePlaylist {
    kind: 'playlist';
    id: number;
    name: string;
    coverImgUrl: string;
    trackCount: number;
    tracks?: NeteaseSong[];
    creator?: NeteasePlaylistCreator;
    description?: string;
    playCount?: number;
}

export interface NeteaseDjCreator {
    userId: number;
    nickname: string;
    avatarUrl?: string;
}

export interface NeteaseDjRadio {
    kind: 'radio';
    id: number;
    name: string;
    picUrl: string;
    description?: string;
    category?: string;
    programCount?: number;
    subCount?: number;
    dj?: NeteaseDjCreator;
    lastProgramName?: string;
    programs?: NeteaseDjProgram[];
}

export interface NeteaseDjProgram {
    kind: 'program';
    id: number;
    name: string;
    duration: number;
    description?: string;
    coverUrl?: string;
    serialNum?: number;
    listenerCount?: number;
    createTime?: number;
    radioId?: number;
    radioName?: string;
    radio?: NeteaseDjRadio;
    dj?: NeteaseDjCreator;
    mainSong?: NeteaseSong;
}

export type ProgramPlayable = NeteaseDjProgram;

export interface MemoryRecordPlayable {
    kind: 'memoryRecord';
    id: number;
    recordId: string;
    name: string;
    artistName: string;
    albumName: string;
    duration: number;
    coverImageUrl?: string;
    coverGradient?: string;
    lyrics?: string;
    monologueText?: string;
    lyricsOffsetMs?: number;
    lyricTiming?: MemoryRecordLyricTiming;
    audioId?: string;
    requiresMasterAudio?: boolean;
    createdAt?: number;
}

export type MusicPlayable = SongPlayable | ProgramPlayable | MemoryRecordPlayable;

export type MusicSearchItem =
    | NeteaseSong
    | NeteasePlaylist
    | NeteaseAlbumSummary
    | NeteaseArtistSummary
    | NeteaseDjRadio
    | NeteaseDjProgram;

export interface MusicSearchSection<T extends MusicSearchItem = MusicSearchItem> {
    tab: MusicSearchTab;
    title: string;
    items: T[];
    total: number;
    error?: string | null;
}

export interface MusicSearchBundle {
    keyword: string;
    sections: MusicSearchSection[];
}

export interface NeteaseSearchResult {
    songs?: NeteaseSong[];
    songCount?: number;
}

export interface NeteaseUserAccount {
    userId: number;
    nickname: string;
    avatarUrl: string;
    backgroundUrl?: string;
    signature?: string;
    follows: number;
    followeds: number;
    eventCount: number;
    listenSongs: number;
    vipType: number;
    vipLevel: number;
    isVip: boolean;
}

export interface SongShareCard {
    songId: number;
    songName: string;
    artist: string;
    albumName?: string;
    albumCover?: string;
    duration?: number;
}

export interface SongCardMetadata extends SongShareCard {
    type: 'song_card';
}

export interface LyricLine {
    time: number;
    text: string;
    translation?: string;
}

export function isSongPlayable(value: MusicPlayable | null | undefined): value is SongPlayable {
    return value?.kind === 'song';
}

export function isProgramPlayable(value: MusicPlayable | null | undefined): value is ProgramPlayable {
    return value?.kind === 'program';
}

export function isMemoryRecordPlayable(value: MusicPlayable | null | undefined): value is MemoryRecordPlayable {
    return value?.kind === 'memoryRecord';
}
