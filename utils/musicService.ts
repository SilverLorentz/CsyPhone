import { buildBackendAuthQuery, buildBackendHeaders, buildBackendUrl, buildBackendUrlObject } from './backendClient';
import { DB } from './db';
import { safeResponseJson } from './safeApi';
import { safeTimeoutSignal } from './safeTimeout';
import type {
    MusicPlayable,
    MusicSearchBundle,
    MusicSearchItem,
    MusicSearchSection,
    MusicSearchTab,
    NeteaseAlbumSummary,
    NeteaseArtist,
    NeteaseArtistSummary,
    NeteaseDjCreator,
    NeteaseDjProgram,
    NeteaseDjRadio,
    NeteaseLyric,
    NeteasePlaylist,
    NeteasePlaylistCreator,
    NeteaseSearchResult,
    NeteaseSong,
    NeteaseSongUrl,
    NeteaseUserAccount,
} from '../types/music';
import { isMemoryRecordPlayable } from '../types/music';

const COOKIE_KEY = 'netease_music_cookie';
const NETEASE_DETAIL_PROXY_PATH = '/netease-api/song-detail';
const MUSIC_SERVICE_NAME = '音乐服务';
const SONG_FALLBACK_LEVEL = 'exhigh';
const PROGRAM_FALLBACK_LEVEL = 'standard';

type JsonRecord = Record<string, unknown>;
type SearchableMusicTab = Exclude<MusicSearchTab, 'all'>;

export const MUSIC_SEARCH_TABS: MusicSearchTab[] = [
    'all',
    'song',
    'playlist',
    'album',
    'artist',
    'radio',
    'program',
];

export const MUSIC_SEARCH_SECTION_ORDER: SearchableMusicTab[] = [
    'song',
    'playlist',
    'album',
    'artist',
    'radio',
    'program',
];

export const MUSIC_SEARCH_TAB_LABELS: Record<MusicSearchTab, string> = {
    all: '综合',
    song: '单曲',
    playlist: '歌单',
    album: '专辑',
    artist: '歌手',
    radio: '播客台',
    program: '声音',
};

const SEARCH_TAB_TYPES: Record<SearchableMusicTab, number> = {
    song: 1,
    album: 10,
    artist: 100,
    playlist: 1000,
    radio: 1009,
    program: 2000,
};

function asRecord(value: unknown): JsonRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonRecord
        : null;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeUrl(value: unknown): string {
    const url = readString(value);
    if (!url) return '';
    return url.replace(/^http:\/\//i, 'https://');
}

function readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }

    return null;
}

function extractErrorMessage(value: unknown, fallback: string): string {
    const record = asRecord(value);
    if (!record) return fallback;

    const parts = [
        readString(record.error),
        readString(record.detail),
        readString(record.message),
        readString(record.msg),
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' | ') : fallback;
}

function assertMusicApiSuccess(value: unknown, fallback: string): void {
    const record = asRecord(value);
    if (!record) return;

    const code = readNumber(record.code);
    const nested = asRecord(record.data);
    const verifyUrl = readString(nested?.verifyUrl) || readString(nested?.url);
    const message = extractErrorMessage(record, fallback);

    if (verifyUrl || (code !== null && code < 0)) {
        throw new Error(verifyUrl ? `${message} | ${MUSIC_SERVICE_NAME}触发了验证` : message);
    }
}

function readCoverUrl(record: JsonRecord | null): string {
    if (!record) return '';

    return normalizeUrl(record.picUrl)
        || normalizeUrl(record.coverImgUrl)
        || normalizeUrl(record.img1v1Url)
        || normalizeUrl(record.avatarUrl)
        || normalizeUrl(record.coverUrl)
        || normalizeUrl(record.blurCoverUrl)
        || normalizeUrl(record.intervenePicUrl);
}

function normalizeArtist(value: unknown): NeteaseArtist | null {
    const record = asRecord(value);
    if (!record) return null;

    const name = readString(record.name);
    const id = readNumber(record.id) ?? 0;
    if (!name) return null;

    const artist: NeteaseArtist = { id, name };
    const avatarUrl = readCoverUrl(record);
    if (avatarUrl) {
        artist.avatarUrl = avatarUrl;
    }

    return artist;
}

function normalizeArtistSummary(value: unknown): NeteaseArtistSummary | null {
    const artist = normalizeArtist(value);
    const record = asRecord(value);
    if (!artist || !record) return null;

    return {
        kind: 'artist',
        ...artist,
        picUrl: readCoverUrl(record) || artist.avatarUrl,
        musicSize: readNumber(record.musicSize) ?? undefined,
        albumSize: readNumber(record.albumSize) ?? undefined,
        briefDesc: readString(record.briefDesc) || undefined,
        description: readString(record.description) || readString(record.briefDesc) || undefined,
    };
}

function readArtistName(value: unknown): string {
    const record = asRecord(value);
    if (!record) return '';

    const directArtist = normalizeArtist(record.artist);
    if (directArtist?.name) {
        return directArtist.name;
    }

    const artists = [
        ...asArray(record.artists),
        ...asArray(record.ar),
    ]
        .map(normalizeArtist)
        .filter((artist): artist is NeteaseArtist => Boolean(artist));

    if (artists.length > 0) {
        return artists.map((artist) => artist.name).join(' / ');
    }

    return readString(record.artistName);
}

function normalizeAlbumSummary(value: unknown): NeteaseAlbumSummary | null {
    const record = asRecord(value);
    if (!record) return null;

    const name = readString(record.name);
    const id = readNumber(record.id) ?? 0;
    if (!name || id <= 0) return null;

    return {
        kind: 'album',
        id,
        name,
        picUrl: readCoverUrl(record) || undefined,
        artistName: readArtistName(record) || undefined,
        publishTime: readNumber(record.publishTime) ?? undefined,
        songCount: readNumber(record.size) ?? readNumber(record.songCount) ?? undefined,
        description: readString(record.description) || readString(record.desc) || undefined,
    };
}

function normalizeSong(value: unknown): NeteaseSong | null {
    const record = asRecord(value);
    if (!record) return null;

    const id = readNumber(record.id) ?? 0;
    const name = readString(record.name);
    if (id <= 0 || !name) return null;

    const artistSource = Array.isArray(record.artists)
        ? record.artists
        : Array.isArray(record.ar)
            ? record.ar
            : [];
    const artists = artistSource
        .map(normalizeArtist)
        .filter((artist): artist is NeteaseArtist => Boolean(artist));

    const album = normalizeAlbumSummary(record.album) || normalizeAlbumSummary(record.al) || {
        kind: 'album' as const,
        id: 0,
        name: '',
    };

    const alias = asArray(record.alia)
        .map(readString)
        .filter(Boolean);

    return {
        kind: 'song',
        id,
        name,
        artists,
        album,
        duration: readNumber(record.duration) ?? readNumber(record.dt) ?? 0,
        ...(alias.length > 0 ? { alias } : {}),
    };
}

function mergeSongAlbumCover(source: NeteaseSong, detail?: NeteaseSong): NeteaseSong {
    const detailPicUrl = detail?.album.picUrl?.trim();
    if (!detailPicUrl || source.album.picUrl?.trim()) {
        return source;
    }

    return {
        ...source,
        album: {
            ...source.album,
            picUrl: detailPicUrl,
        },
    };
}

async function enrichSongsWithAlbumCovers(songs: NeteaseSong[]): Promise<NeteaseSong[]> {
    const missingCoverIds = Array.from(new Set(
        songs
            .filter((song) => !song.album.picUrl?.trim())
            .map((song) => song.id)
            .filter((id) => id > 0),
    ));

    if (missingCoverIds.length === 0) {
        return songs;
    }

    for (const fetchDetail of [
        () => sameOriginPost<{ songs?: unknown }>(NETEASE_DETAIL_PROXY_PATH, { ids: missingCoverIds }),
        () => musicPost<{ songs?: unknown }>('/api/music/song/detail', { ids: missingCoverIds }),
    ]) {
        try {
            const detailResponse = await fetchDetail();
            assertMusicApiSuccess(detailResponse, `${MUSIC_SERVICE_NAME}歌曲详情暂时不可用`);

            const detailMap = new Map(
                asArray(detailResponse.songs)
                    .map(normalizeSong)
                    .filter((song): song is NeteaseSong => Boolean(song))
                    .map((song) => [song.id, song] as const),
            );

            return songs.map((song) => mergeSongAlbumCover(song, detailMap.get(song.id)));
        } catch {
            // Try the next detail source.
        }
    }

    return songs;
}

function normalizeSongUrl(value: unknown): NeteaseSongUrl | null {
    const record = asRecord(value);
    if (!record) return null;

    const id = readNumber(record.id) ?? 0;
    if (id <= 0) return null;

    return {
        id,
        url: typeof record.url === 'string' ? record.url : null,
        br: readNumber(record.br) ?? 0,
        size: readNumber(record.size) ?? 0,
        type: readString(record.type),
    };
}

function normalizePlaylistCreator(value: unknown): NeteasePlaylistCreator | undefined {
    const record = asRecord(value);
    if (!record) return undefined;

    const nickname = readString(record.nickname);
    if (!nickname) return undefined;

    return {
        userId: readNumber(record.userId) ?? 0,
        nickname,
        avatarUrl: readCoverUrl(record),
    };
}

function normalizePlaylist(value: unknown): NeteasePlaylist | null {
    const record = asRecord(value);
    if (!record) return null;

    const id = readNumber(record.id) ?? 0;
    const name = readString(record.name);
    if (id <= 0 || !name) return null;

    const playlist: NeteasePlaylist = {
        kind: 'playlist',
        id,
        name,
        coverImgUrl: readCoverUrl(record),
        trackCount: readNumber(record.trackCount) ?? 0,
        description: readString(record.description) || undefined,
        playCount: readNumber(record.playCount) ?? undefined,
    };

    if (Array.isArray(record.tracks)) {
        playlist.tracks = record.tracks
            .map(normalizeSong)
            .filter((song): song is NeteaseSong => Boolean(song));
    }

    const creator = normalizePlaylistCreator(record.creator);
    if (creator) {
        playlist.creator = creator;
    }

    return playlist;
}

function normalizeDjCreator(value: unknown): NeteaseDjCreator | undefined {
    const record = asRecord(value);
    if (!record) return undefined;

    const nickname = readString(record.nickname);
    const userId = readNumber(record.userId) ?? 0;
    if (!nickname && userId <= 0) return undefined;

    return {
        userId,
        nickname: nickname || '播客主播',
        avatarUrl: readCoverUrl(record) || undefined,
    };
}

function normalizeDjRadio(value: unknown): NeteaseDjRadio | null {
    const record = asRecord(value);
    if (!record) return null;

    const id = readNumber(record.id) ?? readNumber(record.rid) ?? 0;
    const name = readString(record.name);
    if (id <= 0 || !name) return null;

    const radio: NeteaseDjRadio = {
        kind: 'radio',
        id,
        name,
        picUrl: readCoverUrl(record),
        description: readString(record.desc) || readString(record.description) || readString(record.rcmdtext) || undefined,
        category: readString(record.category) || undefined,
        programCount: readNumber(record.programCount) ?? undefined,
        subCount: readNumber(record.subCount) ?? readNumber(record.subedCount) ?? undefined,
        lastProgramName: readString(record.lastProgramName) || undefined,
    };

    const dj = normalizeDjCreator(record.dj);
    if (dj) {
        radio.dj = dj;
    }

    if (Array.isArray(record.programs)) {
        radio.programs = record.programs
            .map(normalizeDjProgram)
            .filter((program): program is NeteaseDjProgram => Boolean(program));
    }

    return radio;
}

function normalizeDjProgram(value: unknown): NeteaseDjProgram | null {
    const record = asRecord(value);
    if (!record) return null;

    const base = asRecord(record.baseInfo) || record;
    const mainSong = normalizeSong(base.mainSong) || normalizeSong(record.mainSong) || undefined;
    const radio = normalizeDjRadio(base.radio) || normalizeDjRadio(record.radio) || normalizeDjRadio(base.djRadio) || normalizeDjRadio(record.djRadio) || undefined;
    const dj = normalizeDjCreator(base.dj) || normalizeDjCreator(record.dj) || radio?.dj;
    const id = readNumber(base.id) ?? readNumber(record.id) ?? 0;
    const name = readString(base.name) || readString(record.name) || mainSong?.name || '';

    if (id <= 0 || !name) return null;

    return {
        kind: 'program',
        id,
        name,
        duration: readNumber(base.duration) ?? readNumber(record.duration) ?? mainSong?.duration ?? 0,
        description: readString(base.description) || readString(record.description) || readString(base.desc) || readString(record.desc) || undefined,
        coverUrl: readCoverUrl(base) || readCoverUrl(record) || mainSong?.album.picUrl || undefined,
        serialNum: readNumber(base.serialNum) ?? readNumber(record.serialNum) ?? undefined,
        listenerCount: readNumber(base.listenerCount) ?? readNumber(record.listenerCount) ?? readNumber(record.subscribedCount) ?? undefined,
        createTime: readNumber(base.createTime) ?? readNumber(record.createTime) ?? undefined,
        radioId: radio?.id ?? readNumber(base.radioId) ?? readNumber(record.radioId) ?? undefined,
        radioName: radio?.name || readString(base.radioName) || readString(record.radioName) || undefined,
        ...(radio ? { radio } : {}),
        ...(dj ? { dj } : {}),
        ...(mainSong ? { mainSong } : {}),
    };
}

function normalizeUserAccount(value: unknown): NeteaseUserAccount | null {
    const record = asRecord(value);
    if (!record) return null;

    const profile = asRecord(record.profile);
    const account = asRecord(record.account);
    if (!profile) return null;

    const nickname = readString(profile.nickname);
    const userId = readNumber(profile.userId) ?? readNumber(account?.id) ?? 0;
    if (!nickname || userId <= 0) return null;

    const vipType = readNumber(profile.vipType) ?? readNumber(account?.vipType) ?? 0;
    const vipLevel = readNumber(profile.redVipLevel)
        ?? readNumber(profile.vipLevel)
        ?? readNumber(account?.redVipLevel)
        ?? 0;

    return {
        userId,
        nickname,
        avatarUrl: readCoverUrl(profile),
        backgroundUrl: normalizeUrl(profile.backgroundUrl) || undefined,
        signature: readString(profile.signature) || undefined,
        follows: readNumber(profile.follows) ?? 0,
        followeds: readNumber(profile.followeds) ?? 0,
        eventCount: readNumber(profile.eventCount) ?? 0,
        listenSongs: readNumber(profile.listenSongs) ?? 0,
        vipType,
        vipLevel,
        isVip: vipType > 0 || vipLevel > 0,
    };
}

function getSearchEntries(result: JsonRecord, tab: SearchableMusicTab): unknown[] {
    switch (tab) {
        case 'song':
            return asArray(result.songs);
        case 'playlist':
            return asArray(result.playlists);
        case 'album':
            return asArray(result.albums);
        case 'artist':
            return asArray(result.artists);
        case 'radio':
            return asArray(result.djRadios);
        case 'program':
            return asArray(result.programs).length > 0
                ? asArray(result.programs)
                : asArray(result.djprograms).length > 0
                    ? asArray(result.djprograms)
                    : asArray(result.resources);
        default:
            return [];
    }
}

function getSearchCount(result: JsonRecord, tab: SearchableMusicTab, fallback: number): number {
    const candidates: Record<SearchableMusicTab, string[]> = {
        song: ['songCount'],
        playlist: ['playlistCount'],
        album: ['albumCount'],
        artist: ['artistCount'],
        radio: ['djRadiosCount', 'radioCount'],
        program: ['programCount', 'resourceCount'],
    };

    for (const key of candidates[tab]) {
        const value = readNumber(result[key]);
        if (value !== null) return value;
    }

    return fallback;
}

async function normalizeSearchItems(tab: SearchableMusicTab, entries: unknown[]): Promise<MusicSearchItem[]> {
    switch (tab) {
        case 'song':
            return enrichSongsWithAlbumCovers(
                entries
                    .map(normalizeSong)
                    .filter((song): song is NeteaseSong => Boolean(song)),
            );
        case 'playlist':
            return entries
                .map(normalizePlaylist)
                .filter((item): item is NeteasePlaylist => Boolean(item));
        case 'album':
            return entries
                .map(normalizeAlbumSummary)
                .filter((item): item is NeteaseAlbumSummary => Boolean(item));
        case 'artist':
            return entries
                .map(normalizeArtistSummary)
                .filter((item): item is NeteaseArtistSummary => Boolean(item));
        case 'radio':
            return entries
                .map(normalizeDjRadio)
                .filter((item): item is NeteaseDjRadio => Boolean(item));
        case 'program':
            return entries
                .map(normalizeDjProgram)
                .filter((item): item is NeteaseDjProgram => Boolean(item));
        default:
            return [];
    }
}

async function musicPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(buildBackendUrl(path), {
        method: 'POST',
        headers: buildBackendHeaders(),
        body: JSON.stringify(body),
        signal: safeTimeoutSignal(15000),
    });
    const data = await safeResponseJson(response) as T;

    if (!response.ok) {
        throw new Error(extractErrorMessage(data, `Music API error: ${response.status}`));
    }

    return data;
}

async function sameOriginPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: safeTimeoutSignal(15000),
    });
    const data = await safeResponseJson(response) as T;

    if (!response.ok) {
        throw new Error(extractErrorMessage(data, `Music API error: ${response.status}`));
    }

    return data;
}

function buildSongFallbackUrl(songId: number): string {
    return `https://music.163.com/song/media/outer/url?id=${songId}.mp3`;
}

function maybeProxyAudioUrl(rawUrl: string | null | undefined): string | null {
    const trimmedUrl = typeof rawUrl === 'string' ? normalizeUrl(rawUrl) : '';
    if (!trimmedUrl) return null;
    return getAudioProxyUrl(trimmedUrl) || trimmedUrl;
}

export function getMusicCookie(): string {
    try {
        return localStorage.getItem(COOKIE_KEY) || '';
    } catch {
        return '';
    }
}

export function setMusicCookie(cookie: string): void {
    try {
        localStorage.setItem(COOKIE_KEY, cookie);
    } catch {
        // Ignore localStorage failures.
    }
}

export function clearMusicCookie(): void {
    try {
        localStorage.removeItem(COOKIE_KEY);
    } catch {
        // Ignore localStorage failures.
    }
}

export function isMusicLoggedIn(): boolean {
    return Boolean(getMusicCookie());
}

export async function searchMusicByType(
    keyword: string,
    tab: SearchableMusicTab,
    limit = 30,
    offset = 0,
): Promise<MusicSearchSection> {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
        return {
            tab,
            title: MUSIC_SEARCH_TAB_LABELS[tab],
            items: [],
            total: 0,
        };
    }

    const data = await musicPost<{ result?: unknown }>('/api/music/search', {
        keyword: trimmedKeyword,
        limit,
        offset,
        type: SEARCH_TAB_TYPES[tab],
    });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}${MUSIC_SEARCH_TAB_LABELS[tab]}搜索暂时不可用`);

    const result = asRecord(data.result) || {};
    const items = await normalizeSearchItems(tab, getSearchEntries(result, tab));

    return {
        tab,
        title: MUSIC_SEARCH_TAB_LABELS[tab],
        items,
        total: getSearchCount(result, tab, items.length),
    };
}

export async function searchMusicAll(keyword: string): Promise<MusicSearchBundle> {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
        return { keyword: '', sections: [] };
    }

    const settled = await Promise.allSettled(
        MUSIC_SEARCH_SECTION_ORDER.map((tab) => searchMusicByType(trimmedKeyword, tab, 6, 0)),
    );

    return {
        keyword: trimmedKeyword,
        sections: settled.map((result, index) => {
            const tab = MUSIC_SEARCH_SECTION_ORDER[index];
            if (result.status === 'fulfilled') {
                return result.value;
            }

            return {
                tab,
                title: MUSIC_SEARCH_TAB_LABELS[tab],
                items: [],
                total: 0,
                error: result.reason instanceof Error
                    ? result.reason.message
                    : '搜索失败，请稍后重试',
            };
        }),
    };
}

export async function searchSongs(keyword: string, limit = 30, offset = 0): Promise<NeteaseSearchResult> {
    const result = await searchMusicByType(keyword, 'song', limit, offset);
    const songs = result.items.filter((song): song is NeteaseSong => song.kind === 'song');

    return {
        songs,
        songCount: result.total,
    };
}

export async function getSongUrl(
    ids: number[],
    options: { resourceType?: 'song' | 'program'; level?: string; br?: number } = {},
): Promise<NeteaseSongUrl[]> {
    const resourceType = options.resourceType === 'program' ? 'program' : 'song';
    const level = options.level || (resourceType === 'program' ? PROGRAM_FALLBACK_LEVEL : SONG_FALLBACK_LEVEL);
    const br = options.br ?? 320000;

    const data = await musicPost<{ data?: unknown }>('/api/music/song/url', {
        ids,
        cookie: getMusicCookie(),
        level,
        br,
        resourceType,
    });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}播放链接暂时不可用`);
    return asArray(data.data)
        .map(normalizeSongUrl)
        .filter((item): item is NeteaseSongUrl => Boolean(item));
}

export async function resolvePlayableUrl(playable: MusicPlayable): Promise<string | null> {
    if (isMemoryRecordPlayable(playable)) {
        if (playable.audioId) {
            const blob = await DB.getMemoryRecordAudio(playable.audioId);
            if (blob) return URL.createObjectURL(blob);
        }

        const audioRows = await DB.getMemoryRecordAudioByRecordId(playable.recordId);
        const preferred = audioRows.find((item) => item.kind === 'master')
            || (!playable.requiresMasterAudio ? audioRows.find((item) => item.kind === 'music') : undefined);
        return preferred?.blob ? URL.createObjectURL(preferred.blob) : null;
    }

    const targetId = playable.kind === 'program'
        ? playable.mainSong?.id ?? playable.id
        : playable.id;
    const urls = await getSongUrl([targetId], {
        resourceType: playable.kind === 'program' ? 'program' : 'song',
    });
    const targetUrl = urls.find((item) => item.id === targetId)?.url;
    if (targetUrl) {
        return maybeProxyAudioUrl(targetUrl);
    }

    if (playable.kind === 'song') {
        return maybeProxyAudioUrl(buildSongFallbackUrl(playable.id));
    }

    return null;
}

export function getAudioProxyUrl(rawUrl: string | null | undefined): string | null {
    const trimmedUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!trimmedUrl) return null;

    const target = buildBackendUrlObject('/api/music/audio-proxy');
    if (!target) return trimmedUrl;

    const authParams = new URLSearchParams(
        buildBackendAuthQuery({ tokenKey: '_token', userIdKey: '_userId' }),
    );
    for (const [key, value] of authParams.entries()) {
        target.searchParams.set(key, value);
    }

    target.searchParams.set('url', trimmedUrl);
    return target.toString();
}

export async function getLyric(id: number): Promise<NeteaseLyric> {
    const data = await musicPost<JsonRecord>('/api/music/lyric', { id });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}歌词暂时不可用`);
    const lyric: NeteaseLyric = {};

    const lrc = asRecord(data.lrc);
    if (lrc) {
        lyric.lrc = { lyric: readString(lrc.lyric) };
    }

    const tlyric = asRecord(data.tlyric);
    if (tlyric) {
        lyric.tlyric = { lyric: readString(tlyric.lyric) };
    }

    return lyric;
}

export async function getSongDetail(ids: number[]): Promise<NeteaseSong[]> {
    const data = await musicPost<{ songs?: unknown }>('/api/music/song/detail', { ids });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}歌曲详情暂时不可用`);
    return asArray(data.songs)
        .map(normalizeSong)
        .filter((song): song is NeteaseSong => Boolean(song));
}

export async function getPlaylistDetail(id: number): Promise<NeteasePlaylist | null> {
    const data = await musicPost<{ playlist?: unknown }>('/api/music/playlist/detail', {
        id,
        cookie: getMusicCookie(),
    });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}歌单详情暂时不可用`);
    return normalizePlaylist(data.playlist);
}

export async function getAlbumDetail(id: number): Promise<NeteaseAlbumSummary | null> {
    const data = await musicPost<JsonRecord>('/api/music/album/detail', { id });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}专辑详情暂时不可用`);

    const album = normalizeAlbumSummary(data.album);
    if (!album) return null;

    const songs = asArray(data.songs)
        .map(normalizeSong)
        .filter((song): song is NeteaseSong => Boolean(song));

    return {
        ...album,
        ...(songs.length > 0 ? { songs } : {}),
        description: album.description || readString(asRecord(data.album)?.description) || undefined,
    };
}

export async function getArtistDetail(id: number): Promise<NeteaseArtistSummary | null> {
    const data = await musicPost<JsonRecord>('/api/music/artist/detail', { id });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}歌手详情暂时不可用`);

    const dataRecord = asRecord(data.data);
    const artist = normalizeArtistSummary(dataRecord?.artist || data.artist);
    if (!artist) return null;

    const description = readString(dataRecord?.briefDesc)
        || readString(asRecord(dataRecord?.artist)?.briefDesc)
        || readString(asRecord(data.artist)?.briefDesc)
        || artist.description;

    return {
        ...artist,
        ...(description ? { description } : {}),
    };
}

export async function getArtistTopSongs(id: number): Promise<NeteaseSong[]> {
    const data = await musicPost<JsonRecord>('/api/music/artist/top/song', { id });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}歌手热门歌曲暂时不可用`);
    return enrichSongsWithAlbumCovers(
        asArray(data.songs)
            .map(normalizeSong)
            .filter((song): song is NeteaseSong => Boolean(song)),
    );
}

export async function getArtistAlbums(id: number, limit = 30, offset = 0): Promise<NeteaseAlbumSummary[]> {
    const data = await musicPost<JsonRecord>('/api/music/artist/album', { id, limit, offset });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}歌手专辑暂时不可用`);
    return asArray(data.hotAlbums)
        .map(normalizeAlbumSummary)
        .filter((album): album is NeteaseAlbumSummary => Boolean(album));
}

export async function getArtistDesc(id: number): Promise<string> {
    const data = await musicPost<JsonRecord>('/api/music/artist/desc', { id });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}歌手简介暂时不可用`);
    return readString(data.briefDesc);
}

export async function getDjRadioDetail(id: number): Promise<NeteaseDjRadio | null> {
    const data = await musicPost<JsonRecord>('/api/music/dj/detail', { id });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}播客详情暂时不可用`);
    return normalizeDjRadio(data.data || data.djRadio);
}

export async function getDjPrograms(
    rid: number,
    limit = 30,
    offset = 0,
    asc = false,
): Promise<NeteaseDjProgram[]> {
    const data = await musicPost<JsonRecord>('/api/music/dj/program', {
        rid,
        limit,
        offset,
        asc,
    });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}节目列表暂时不可用`);
    return asArray(data.programs)
        .map(normalizeDjProgram)
        .filter((program): program is NeteaseDjProgram => Boolean(program));
}

export async function getDjProgramDetail(id: number): Promise<NeteaseDjProgram | null> {
    const data = await musicPost<JsonRecord>('/api/music/dj/program/detail', { id });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}节目详情暂时不可用`);
    return normalizeDjProgram(data.program || data.data);
}

export async function getTopPlaylists(cat = '全部', limit = 30): Promise<NeteasePlaylist[]> {
    const data = await musicPost<{ playlists?: unknown }>('/api/music/top/playlist', { cat, limit });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}推荐歌单暂时不可用`);
    return asArray(data.playlists)
        .map(normalizePlaylist)
        .filter((playlist): playlist is NeteasePlaylist => Boolean(playlist));
}

/**
 * 个性化推荐歌单（不需要登录也能用，登录后更精准）
 */
export async function getPersonalizedPlaylists(limit = 6): Promise<NeteasePlaylist[]> {
    const data = await musicPost<{ result?: unknown }>('/api/music/personalized', {
        limit,
        cookie: getMusicCookie(),
    });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}个性化推荐暂时不可用`);
    return asArray(data.result)
        .map(normalizePlaylist)
        .filter((item): item is NeteasePlaylist => Boolean(item));
}

/**
 * 每日推荐歌单（需要登录）
 */
export async function getRecommendResource(): Promise<NeteasePlaylist[]> {
    const cookie = getMusicCookie();
    if (!cookie) throw new Error('需要登录才能使用每日推荐');
    const data = await musicPost<{ recommend?: unknown }>('/api/music/recommend/resource', { cookie });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}每日推荐暂时不可用`);
    return asArray(data.recommend)
        .map(normalizePlaylist)
        .filter((item): item is NeteasePlaylist => Boolean(item));
}

/**
 * 每日推荐歌曲（需要登录，每天 30 首）
 */
export async function getRecommendSongs(): Promise<NeteaseSong[]> {
    const cookie = getMusicCookie();
    if (!cookie) throw new Error('需要登录才能使用每日推荐歌曲');
    const data = await musicPost<{ data?: { dailySongs?: unknown } }>('/api/music/recommend/songs', { cookie });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}每日推荐歌曲暂时不可用`);
    const dailySongs = (data.data as Record<string, unknown>)?.dailySongs;
    return asArray(dailySongs)
        .map(normalizeSong)
        .filter((item): item is NeteaseSong => Boolean(item));
}

export async function getQrKey(): Promise<string> {
    const data = await musicPost<{ unikey?: unknown; data?: unknown }>('/api/music/login/qr/key', {});
    const dataRecord = asRecord(data.data);
    return readString(data.unikey) || readString(dataRecord?.unikey);
}

export async function getQrUrl(key: string): Promise<string> {
    const data = await musicPost<{ data?: unknown }>('/api/music/login/qr/create', { key });
    const dataRecord = asRecord(data.data);
    return readString(dataRecord?.qrurl);
}

export async function checkQrStatus(key: string): Promise<{ code: number; message?: string; cookie?: string }> {
    const data = await musicPost<JsonRecord>('/api/music/login/qr/check', { key });
    const nestedData = asRecord(data.data);
    const topLevelCode = readNumber(data.code);
    const nestedCode = readNumber(nestedData?.code);
    const code = (topLevelCode !== null && topLevelCode >= 800 && topLevelCode <= 899)
        ? topLevelCode
        : nestedCode ?? topLevelCode ?? 0;

    return {
        code,
        message: readString(data.message) || readString(nestedData?.message) || undefined,
        cookie: readString(data.cookie) || undefined,
    };
}

export async function getUserAccount(cookie = getMusicCookie()): Promise<NeteaseUserAccount | null> {
    const trimmedCookie = cookie.trim();
    if (!trimmedCookie) return null;

    const data = await musicPost<JsonRecord>('/api/music/user/account', { cookie: trimmedCookie });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}账号信息暂时不可用`);
    return normalizeUserAccount(data);
}

export async function getUserPlaylists(uid: number, limit = 50, offset = 0): Promise<NeteasePlaylist[]> {
    const data = await musicPost<{ playlist?: unknown }>('/api/music/user/playlist', {
        uid,
        limit,
        offset,
        cookie: getMusicCookie(),
    });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}用户歌单暂时不可用`);
    return asArray(data.playlist)
        .map(normalizePlaylist)
        .filter((item): item is NeteasePlaylist => Boolean(item));
}

export async function addSongsToPlaylist(playlistId: number, songIds: number[]): Promise<void> {
    const cookie = getMusicCookie();
    if (!cookie) throw new Error('请先登录');
    if (songIds.length === 0) return;
    const data = await musicPost<JsonRecord>('/api/music/playlist/tracks', {
        op: 'add',
        pid: playlistId,
        tracks: songIds.join(','),
        cookie,
    });
    assertMusicApiSuccess(data, '收藏失败');
}

export async function removeSongsFromPlaylist(playlistId: number, songIds: number[]): Promise<void> {
    const cookie = getMusicCookie();
    if (!cookie) throw new Error('请先登录');
    if (songIds.length === 0) return;
    const data = await musicPost<JsonRecord>('/api/music/playlist/tracks', {
        op: 'del',
        pid: playlistId,
        tracks: songIds.join(','),
        cookie,
    });
    assertMusicApiSuccess(data, '取消收藏失败');
}
