// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import MusicApp from './MusicApp';
import FloatingLyrics from '../../components/os/FloatingLyrics';
import { AppID } from '../../types';
import type {
    MemoryRecordPlayable,
    MusicPlayable,
    NeteaseDjProgram,
    NeteasePlaylist,
    NeteaseSong,
} from '../../types/music';
import type { MemoryRecord } from '../../types';
import { DB } from '../../utils/db';
import { exportMemoryRecordMp3 } from '../../utils/memoryRecordExport';
import { shareMemoryRecordPoster } from '../../utils/memoryRecordShare';
import { resetPlaybackLyricsRuntimeForTests } from '../../utils/playbackLyricsRuntime';
import { LYRIC_SETTINGS_KEY } from '../../components/os/floatingLyricsSettings';
import { useApp } from '../../context/AppContext';
import { useOS } from '../../context/OSContext';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import {
    getAlbumDetail,
    getArtistAlbums,
    getArtistDesc,
    getArtistDetail,
    getArtistTopSongs,
    getDjProgramDetail,
    getDjPrograms,
    getDjRadioDetail,
    getLyric,
    getPlaylistDetail,
    getQrKey,
    getQrUrl,
    getTopPlaylists,
    getUserAccount,
    isMusicLoggedIn,
    searchMusicAll,
    searchMusicByType,
} from '../../utils/musicService';

vi.mock('../../context/AppContext', () => ({
    useApp: vi.fn(),
}));

vi.mock('../../context/OSContext', () => ({
    useOS: vi.fn(),
}));

vi.mock('../../hooks/useAudioPlayer', () => ({
    useAudioPlayer: vi.fn(),
}));

vi.mock('../../utils/memoryRecordExport', () => ({
    exportMemoryRecordMp3: vi.fn(),
}));

vi.mock('../../utils/memoryRecordShare', () => ({
    buildMemoryRecordSharePreview: vi.fn((playable) => ({
        albumName: playable.albumName,
        artistName: playable.artistName,
        coverGradient: playable.coverGradient,
        coverImageUrl: playable.coverImageUrl,
        durationMs: playable.duration,
        lyricLines: ['梦在转动', '你在身后'],
        title: playable.name,
    })),
    formatMemoryRecordShareDuration: vi.fn(() => '3:12'),
    shareMemoryRecordPoster: vi.fn(),
}));

vi.mock('../../utils/musicService', () => ({
    addSongsToPlaylist: vi.fn(),
    checkQrStatus: vi.fn(),
    clearMusicCookie: vi.fn(),
    getAlbumDetail: vi.fn(),
    getArtistAlbums: vi.fn(),
    getArtistDesc: vi.fn(),
    getArtistDetail: vi.fn(),
    getArtistTopSongs: vi.fn(),
    getDjProgramDetail: vi.fn(),
    getDjPrograms: vi.fn(),
    getDjRadioDetail: vi.fn(),
    getLyric: vi.fn(),
    getPlaylistDetail: vi.fn(),
    getQrKey: vi.fn(),
    getQrUrl: vi.fn(),
    getRecommendResource: vi.fn(),
    getRecommendSongs: vi.fn(),
    getTopPlaylists: vi.fn(),
    getUserAccount: vi.fn(),
    getUserPlaylists: vi.fn(),
    isMusicLoggedIn: vi.fn(),
    MUSIC_SEARCH_TAB_LABELS: {
        song: '单曲',
        playlist: '歌单',
        album: '专辑',
        artist: '歌手',
        radio: '播客台',
        program: '声音',
        all: '综合',
    },
    MUSIC_SEARCH_TABS: ['all', 'song', 'playlist', 'album', 'artist', 'radio', 'program'],
    searchMusicAll: vi.fn(),
    searchMusicByType: vi.fn(),
    removeSongsFromPlaylist: vi.fn(),
    setMusicCookie: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedUseOS = vi.mocked(useOS);
const mockedUseAudioPlayer = vi.mocked(useAudioPlayer);
const mockedExportMemoryRecordMp3 = vi.mocked(exportMemoryRecordMp3);
const mockedShareMemoryRecordPoster = vi.mocked(shareMemoryRecordPoster);
const mockedGetAlbumDetail = vi.mocked(getAlbumDetail);
const mockedGetArtistAlbums = vi.mocked(getArtistAlbums);
const mockedGetArtistDesc = vi.mocked(getArtistDesc);
const mockedGetArtistDetail = vi.mocked(getArtistDetail);
const mockedGetArtistTopSongs = vi.mocked(getArtistTopSongs);
const mockedGetDjProgramDetail = vi.mocked(getDjProgramDetail);
const mockedGetDjPrograms = vi.mocked(getDjPrograms);
const mockedGetDjRadioDetail = vi.mocked(getDjRadioDetail);
const mockedGetLyric = vi.mocked(getLyric);
const mockedGetPlaylistDetail = vi.mocked(getPlaylistDetail);
const mockedGetQrKey = vi.mocked(getQrKey);
const mockedGetQrUrl = vi.mocked(getQrUrl);
const mockedGetTopPlaylists = vi.mocked(getTopPlaylists);
const mockedGetUserAccount = vi.mocked(getUserAccount);
const mockedIsMusicLoggedIn = vi.mocked(isMusicLoggedIn);
const mockedSearchMusicAll = vi.mocked(searchMusicAll);
const mockedSearchMusicByType = vi.mocked(searchMusicByType);

const sampleSong: NeteaseSong = {
    kind: 'song',
    id: 9527,
    name: '夜航星',
    artists: [{ id: 1, name: '不才' }],
    album: {
        kind: 'album',
        id: 24,
        name: '夜航星',
        picUrl: 'cover.jpg',
    },
    duration: 240000,
};

const sampleProgram: NeteaseDjProgram = {
    kind: 'program',
    id: 3001,
    name: '电台夜话',
    duration: 1800000,
    radioId: 99,
    radioName: '深夜播客',
    coverUrl: 'radio-cover.jpg',
};

const sampleMemoryPlayable: MemoryRecordPlayable = {
    kind: 'memoryRecord',
    id: 850000002,
    recordId: 'mrec-export',
    name: '梦里回声',
    artistName: 'Sully',
    albumName: '回忆唱片匣',
    duration: 120000,
    lyrics: '[Verse]\n梦在转动',
    audioId: 'mrec-export:master',
    requiresMasterAudio: true,
};

function buildPlayerState(currentSong: MusicPlayable | null) {
    return {
        currentSong,
        isPlaying: true,
        currentTime: 15,
        duration: currentSong ? currentSong.duration / 1000 : 0,
        progress: 35,
        volume: 0.8,
        playlist: currentSong ? [currentSong] : [],
        currentIndex: currentSong ? 0 : -1,
        playSong: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        resume: vi.fn(),
        togglePlay: vi.fn(),
        seek: vi.fn(),
        seekToTime: vi.fn(),
        playNext: vi.fn(),
        playPrev: vi.fn(),
        setVolume: vi.fn(),
    };
}

function buildAppContext(activeApp = AppID.Music) {
    return {
        activeApp,
        openApp: vi.fn(),
        closeApp: vi.fn(),
        registerBackHandler: vi.fn(() => vi.fn()),
    } as any;
}

describe('MusicApp', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetPlaybackLyricsRuntimeForTests();
        localStorage.clear();
        Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
        Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });

        vi.stubGlobal(
            'requestAnimationFrame',
            ((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0)) as typeof window.requestAnimationFrame,
        );
        vi.stubGlobal(
            'cancelAnimationFrame',
            ((handle: number) => window.clearTimeout(handle)) as typeof window.cancelAnimationFrame,
        );

        mockedUseApp.mockReturnValue(buildAppContext());
        mockedUseOS.mockReturnValue({ addToast: vi.fn() } as any);
        mockedUseAudioPlayer.mockReturnValue(buildPlayerState(null) as any);
        mockedExportMemoryRecordMp3.mockResolvedValue({
            fileName: '梦里回声 - Sully.mp3',
            method: 'download',
        });
        mockedShareMemoryRecordPoster.mockResolvedValue({
            cardFileName: '梦里回声 - Sully.png',
            fileNames: ['梦里回声 - Sully.png'],
            method: 'download',
        });
        mockedGetAlbumDetail.mockResolvedValue(null as any);
        mockedGetArtistAlbums.mockResolvedValue([]);
        mockedGetArtistDesc.mockResolvedValue('');
        mockedGetArtistDetail.mockResolvedValue(null as any);
        mockedGetArtistTopSongs.mockResolvedValue([]);
        mockedGetDjProgramDetail.mockResolvedValue(null as any);
        mockedGetDjPrograms.mockResolvedValue([]);
        mockedGetDjRadioDetail.mockResolvedValue(null as any);
        mockedGetLyric.mockResolvedValue({
            lrc: { lyric: '[00:10.00]穿过漫长星河\n[00:20.00]你终于靠近我' },
            tlyric: { lyric: '[00:10.00]Through the long galaxy\n[00:20.00]You finally come closer' },
        });
        mockedGetPlaylistDetail.mockResolvedValue(null as any);
        mockedGetQrKey.mockResolvedValue('');
        mockedGetQrUrl.mockResolvedValue('');
        mockedGetTopPlaylists.mockResolvedValue([]);
        mockedGetUserAccount.mockResolvedValue(null as any);
        mockedIsMusicLoggedIn.mockReturnValue(false);
        mockedSearchMusicAll.mockResolvedValue({ keyword: '', sections: [] });
        mockedSearchMusicByType.mockResolvedValue({
            tab: 'song',
            title: '单曲',
            items: [],
            total: 0,
        } as any);
    });

    it('shows the root close button on discover and profile pages and closes the app', async () => {
        const appContext = buildAppContext();
        mockedUseApp.mockReturnValue(appContext);

        render(<MusicApp />);

        await waitFor(() => {
            expect(mockedGetTopPlaylists).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByTestId('music-app-close'));
        expect(appContext.closeApp).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText('我的'));
        expect(screen.getByTestId('music-app-close')).toBeTruthy();
    });

    it('hides the root close button inside search and full player views', async () => {
        const { unmount } = render(<MusicApp />);

        await waitFor(() => {
            expect(mockedGetTopPlaylists).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByText('搜索单曲、歌单、专辑、播客台、声音'));
        expect(screen.queryByTestId('music-app-close')).toBeNull();

        unmount();
        mockedUseAudioPlayer.mockReturnValue(buildPlayerState(sampleSong) as any);
        render(<MusicApp />);

        await waitFor(() => {
            expect(mockedGetTopPlaylists).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByTestId('music-mini-player'));
        expect(screen.queryByTestId('music-app-close')).toBeNull();
    });

    it('removes playlist play count badges from the discover cards', async () => {
        const playlist: NeteasePlaylist = {
            kind: 'playlist',
            id: 88,
            name: '宇宙漫游',
            coverImgUrl: 'playlist.jpg',
            trackCount: 12,
            playCount: 87654,
        };

        mockedGetTopPlaylists.mockResolvedValue([playlist]);
        mockedGetPlaylistDetail.mockResolvedValue({
            ...playlist,
            tracks: [],
        });

        render(<MusicApp />);

        await waitFor(() => {
            expect(screen.getByText('宇宙漫游')).toBeTruthy();
        });

        expect(screen.queryByText('9万')).toBeNull();
    });

    it('renders an in-player lyrics panel for songs', async () => {
        mockedUseAudioPlayer.mockReturnValue(buildPlayerState(sampleSong) as any);

        render(<MusicApp />);

        await waitFor(() => {
            expect(mockedGetTopPlaylists).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByTestId('music-mini-player'));

        await waitFor(() => {
            expect(screen.getByTestId('music-player-lyrics-panel')).toBeTruthy();
        });

        await waitFor(() => {
            expect(screen.getByText('穿过漫长星河')).toBeTruthy();
        });
    });

    it('does not render the lyrics panel for podcast programs', async () => {
        mockedUseAudioPlayer.mockReturnValue(buildPlayerState(sampleProgram) as any);

        render(<MusicApp />);

        await waitFor(() => {
            expect(mockedGetTopPlaylists).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByTestId('music-mini-player'));

        expect(screen.queryByTestId('music-player-lyrics-panel')).toBeNull();
    });

    it('shows MP3 export for memory records and reports success', async () => {
        const addToast = vi.fn();
        mockedUseOS.mockReturnValue({ addToast } as any);
        mockedUseAudioPlayer.mockReturnValue(buildPlayerState(sampleMemoryPlayable) as any);

        render(<MusicApp />);

        await waitFor(() => {
            expect(mockedGetTopPlaylists).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByTestId('music-mini-player'));
        fireEvent.click(screen.getByLabelText('导出 MP3'));

        await waitFor(() => {
            expect(mockedExportMemoryRecordMp3).toHaveBeenCalledWith(expect.objectContaining({
                recordId: sampleMemoryPlayable.recordId,
            }));
        });
        expect(addToast).toHaveBeenCalledWith('MP3 已导出', 'success');
    });

    it('shows memory record share preview and shares poster', async () => {
        const addToast = vi.fn();
        mockedUseOS.mockReturnValue({ addToast } as any);
        mockedUseAudioPlayer.mockReturnValue(buildPlayerState(sampleMemoryPlayable) as any);
        mockedShareMemoryRecordPoster.mockResolvedValue({
            cardFileName: '星河回信.png',
            fileNames: ['星河回信.png'],
            method: 'download',
        });

        render(<MusicApp />);

        await waitFor(() => {
            expect(mockedGetTopPlaylists).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByTestId('music-mini-player'));
        fireEvent.click(screen.getByLabelText('分享歌曲'));

        expect(screen.getByRole('dialog', { name: '分享一起写歌作品' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '分享海报' }));

        await waitFor(() => {
            expect(mockedShareMemoryRecordPoster).toHaveBeenCalledWith(expect.objectContaining({
                recordId: sampleMemoryPlayable.recordId,
            }));
        });
        expect(addToast).toHaveBeenCalledWith('分享海报已下载', 'success');
    });

    it('does not show MP3 export for Netease songs', async () => {
        mockedUseAudioPlayer.mockReturnValue(buildPlayerState(sampleSong) as any);

        render(<MusicApp />);

        await waitFor(() => {
            expect(mockedGetTopPlaylists).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByTestId('music-mini-player'));

        expect(screen.queryByLabelText('导出 MP3')).toBeNull();
    });

    it('syncs lyric color changes from the player panel to floating lyrics', async () => {
        mockedUseAudioPlayer.mockReturnValue(buildPlayerState(sampleSong) as any);

        const { unmount } = render(<MusicApp />);

        await waitFor(() => {
            expect(mockedGetTopPlaylists).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByTestId('music-mini-player'));

        await waitFor(() => {
            expect(screen.getByTestId('music-player-lyrics-panel')).toBeTruthy();
        });

        fireEvent.change(screen.getByLabelText('歌词字体颜色'), {
            target: { value: '#7c3aed' },
        });

        await waitFor(() => {
            const saved = JSON.parse(localStorage.getItem(LYRIC_SETTINGS_KEY) || '{}');
            expect(saved.textColor).toBe('#7c3aed');
        });

        unmount();

        mockedUseApp.mockReturnValue(buildAppContext(AppID.Launcher));
        render(<FloatingLyrics />);

        await waitFor(() => {
            expect(screen.getByTestId('floating-lyrics')).toBeTruthy();
        });

        expect(
            screen.getByTestId('floating-lyrics').style.getPropertyValue('--lyric-color-active').trim(),
        ).toBe('#7c3aed');
    });

    it('renders local memory record lyrics in floating lyrics without fetching Netease lyrics', async () => {
        const playable: MemoryRecordPlayable = {
            ...sampleMemoryPlayable,
            lyrics: '[Verse]\n梦在转动\n你在身后',
        };

        mockedUseApp.mockReturnValue(buildAppContext(AppID.Launcher));
        mockedUseAudioPlayer.mockReturnValue({
            ...buildPlayerState(playable),
            currentTime: 1,
        } as any);

        render(<FloatingLyrics />);

        await waitFor(() => {
            expect(screen.getByTestId('floating-lyrics')).toBeTruthy();
        });

        expect(screen.getByText('梦在转动')).toBeTruthy();
        expect(mockedGetLyric).not.toHaveBeenCalled();
    });

    it('does not render floating lyrics for programs or memory records without local lyrics', async () => {
        mockedUseApp.mockReturnValue(buildAppContext(AppID.Launcher));
        mockedUseAudioPlayer.mockReturnValue(buildPlayerState(sampleProgram) as any);

        const { rerender } = render(<FloatingLyrics />);

        expect(screen.queryByTestId('floating-lyrics')).toBeNull();
        expect(mockedGetLyric).not.toHaveBeenCalled();

        mockedUseAudioPlayer.mockReturnValue(
            buildPlayerState({
                ...sampleMemoryPlayable,
                lyrics: '',
                monologueText: undefined,
            }) as any,
        );

        rerender(<FloatingLyrics />);

        await waitFor(() => {
            expect(screen.queryByTestId('floating-lyrics')).toBeNull();
        });
        expect(mockedGetLyric).not.toHaveBeenCalled();
    });

    it('saves manual lyric timing for memory records', async () => {
        const record: MemoryRecord = {
            id: 'mrec-timing',
            charId: 'char-a',
            charName: 'Sully',
            userName: '我',
            mode: 'dream_mix',
            status: 'ready',
            title: '梦里回声',
            albumName: '回忆唱片匣',
            artistName: 'Sully',
            monologueText: '先听这一段。',
            lyrics: '[Verse]\n梦在转动\n你在身后',
            lyricsOffsetMs: 20000,
            musicPrompt: 'dream pop',
            coverGradient: 'linear-gradient(135deg, #f7d6e0, #2d3142)',
            seedMemoryIds: [],
            monologueAudioId: 'mrec-timing:monologue',
            musicAudioId: 'mrec-timing:music',
            masterAudioId: 'mrec-timing:master',
            durationMs: 120000,
            createdAt: 100,
            updatedAt: 100,
        };
        const playable: MemoryRecordPlayable = {
            kind: 'memoryRecord',
            id: 850000001,
            recordId: record.id,
            name: record.title,
            artistName: record.artistName,
            albumName: record.albumName,
            duration: record.durationMs || 0,
            lyrics: record.lyrics,
            monologueText: record.monologueText,
            lyricsOffsetMs: record.lyricsOffsetMs,
            audioId: record.masterAudioId,
            requiresMasterAudio: true,
        };

        await DB.saveMemoryRecord(record);
        mockedUseAudioPlayer.mockReturnValue({
            ...buildPlayerState(playable),
            currentTime: 15,
            duration: 120,
            progress: 12.5,
        } as any);

        render(<MusicApp />);

        await waitFor(() => {
            expect(screen.getByTestId('music-mini-player')).toBeTruthy();
        });

        fireEvent.click(screen.getByTestId('music-mini-player'));

        await waitFor(() => {
            expect(screen.getByTestId('music-lyrics-timing-toggle')).toBeTruthy();
        });

        fireEvent.click(screen.getByTestId('music-lyrics-timing-toggle'));
        fireEvent.click(screen.getByText('梦在转动'));
        fireEvent.click(screen.getByText('定时'));
        fireEvent.click(screen.getByText('保存'));

        await waitFor(async () => {
            const saved = await DB.getMemoryRecordById(record.id);
            expect(saved?.lyricTiming?.lineTimesMs[1]).toBe(15000);
        });

        fireEvent.click(screen.getByTestId('music-lyrics-timing-toggle'));
        fireEvent.click(screen.getByText('重置'));

        await waitFor(async () => {
            const saved = await DB.getMemoryRecordById(record.id);
            expect(saved?.lyricTiming).toBeUndefined();
        });
    });
});
