/**
 * MusicApp — Emo Cloud 真实 API 版
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useOS } from '../../context/OSContext';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useLyrics } from '../../hooks/useLyrics';
import { useDominantColor } from '../../hooks/useDominantColor';
import {
  isMemoryRecordPlayable,
  isSongPlayable,
  type MemoryRecordPlayable,
  type MusicPlayable,
  type MusicSearchBundle,
  type MusicSearchItem,
  type MusicSearchSection,
  type MusicSearchTab,
  type NeteaseAlbumSummary,
  type NeteaseArtistSummary,
  type NeteaseDjProgram,
  type NeteaseDjRadio,
  type NeteasePlaylist,
  type NeteaseSong,
  type NeteaseUserAccount,
} from '../../types/music';
import {
  addSongsToPlaylist,
  checkQrStatus,
  clearMusicCookie,
  getAlbumDetail,
  getArtistAlbums,
  getArtistDesc,
  getArtistDetail,
  getArtistTopSongs,
  getDjProgramDetail,
  getDjPrograms,
  getDjRadioDetail,
  getPersonalizedPlaylists,
  getPlaylistDetail,
  getQrKey,
  getQrUrl,
  getRecommendResource,
  getRecommendSongs,
  getTopPlaylists,
  getUserAccount,
  getUserPlaylists,
  isMusicLoggedIn,
  MUSIC_SEARCH_TAB_LABELS,
  MUSIC_SEARCH_TABS,
  removeSongsFromPlaylist,
  searchMusicAll,
  searchMusicByType,
  setMusicCookie,
} from '../../utils/musicService';
import { DB } from '../../utils/db';
import { exportMemoryRecordMp3 } from '../../utils/memoryRecordExport';
import { shareMemoryRecordPoster } from '../../utils/memoryRecordShare';
import { hasPlayableMemoryRecordAudio, memoryRecordToPlayable } from '../../utils/memoryRecordPlayable';
import { findCurrentLyricIndex } from '../../utils/parseLrc';
import type { MemoryRecordLyricTiming } from '../../types/memoryRecord';
import {
  getLyricColorVars,
  readFloatingLyricsSettings,
  type FloatingLyricsSettings,
  updateFloatingLyricsSettings,
} from '../../components/os/floatingLyricsSettings';
import MemoryRecordShareModal from '../../components/music/MemoryRecordShareModal';
import './music.css';

const SEARCH_HISTORY_KEY = 'music_recent_keywords';
const MUSIC_APP_NAME = 'Emo Cloud';
const MUSIC_VIP_NAME = 'Cloud VIP';
const MUSIC_SCAN_APP_NAME = '手机音乐 App';
const MUSIC_WEB_LOGIN_NAME = '网页登录页';

type RootPage = 'discover' | 'search' | 'profile';
type PrimaryPage = Exclude<RootPage, 'search'>;
type SearchableMusicTab = Exclude<MusicSearchTab, 'all'>;

type DetailView =
  | { type: 'playlistDetail'; id: number; seed?: NeteasePlaylist }
  | { type: 'albumDetail'; id: number; seed?: NeteaseAlbumSummary }
  | { type: 'artistDetail'; id: number; seed?: NeteaseArtistSummary }
  | { type: 'radioDetail'; id: number; seed?: NeteaseDjRadio }
  | { type: 'programDetail'; id: number; seed?: NeteaseDjProgram };

type Loadable<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type PlaylistPreviewState = {
  playlist: NeteasePlaylist | null;
  tracks: NeteaseSong[];
  loading: boolean;
  error: string | null;
};

type ArtistDetailData = {
  artist: NeteaseArtistSummary | null;
  topSongs: NeteaseSong[];
  albums: NeteaseAlbumSummary[];
  description: string;
};

type RadioDetailData = {
  radio: NeteaseDjRadio | null;
  programs: NeteaseDjProgram[];
};

type ProgramDetailData = {
  program: NeteaseDjProgram | null;
};

type QrModalStatus = 'idle' | 'loading' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error';

const IconBack = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>;
const IconSearch = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>;
const IconHome = ({ active }: { active?: boolean }) => <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />{!active && <polyline points="9 22 9 12 15 12 15 22" />}</svg>;
const IconSearchTab = ({ active }: { active?: boolean }) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>;
const IconUser = ({ active }: { active?: boolean }) => <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const IconPlay = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
const IconPause = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>;
const IconPrev = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>;
const IconNext = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6z" /></svg>;
const IconHeart = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>;
const IconMore = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>;
const IconDownload = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>;
const IconShare = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.6l6.8-4.2" /><path d="M8.6 13.4l6.8 4.2" /></svg>;
const IconPlaylist = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
const IconMiniPlay = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
const IconMiniPause = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>;
const IconDown = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>;
const IconClear = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg>;

function readSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return [];
  }
}

function writeSearchHistory(history: string[]): void {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 8)));
  } catch {
    // Ignore storage failures.
  }
}

function formatSeconds(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatDurationMs(durationMs: number): string {
  return formatSeconds(durationMs / 1000);
}

function formatDateLabel(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

function getFallbackGradient(seed: number): string {
  const hue = ((seed % 360) + 360) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 72%, 66%), hsl(${(hue + 42) % 360}, 68%, 48%))`;
}

function buildQrImageCandidates(qrUrl: string): string[] {
  const encoded = encodeURIComponent(qrUrl);
  return [
    `https://quickchart.io/qr?text=${encoded}&size=240`,
    `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encoded}`,
  ];
}

function getVipLabel(account: NeteaseUserAccount | null): string {
  if (!account?.isVip) return '普通用户';
  if (account.vipLevel > 0) return `${MUSIC_VIP_NAME} Lv.${account.vipLevel}`;
  return MUSIC_VIP_NAME;
}

function getSongArtists(song: NeteaseSong): string {
  return song.artists.map((artist) => artist.name).join(' / ') || '未知歌手';
}

function getSongSubtitle(song: NeteaseSong): string {
  const albumName = song.album.name.trim();
  return albumName ? `${getSongArtists(song)} · ${albumName}` : getSongArtists(song);
}

function getPlaylistSubtitle(playlist: NeteasePlaylist): string {
  const owner = playlist.creator?.nickname?.trim();
  const count = playlist.trackCount > 0 ? `${playlist.trackCount} 首` : '';
  return [owner, count].filter(Boolean).join(' · ') || '歌单';
}

function getAlbumSubtitle(album: NeteaseAlbumSummary): string {
  const artistName = album.artistName?.trim();
  const publishDate = formatDateLabel(album.publishTime);
  const count = album.songCount ? `${album.songCount} 首` : '';
  return [artistName, publishDate, count].filter(Boolean).join(' · ') || '专辑';
}

function getArtistSubtitle(artist: NeteaseArtistSummary): string {
  const musicSize = artist.musicSize ? `${artist.musicSize} 首歌曲` : '';
  const albumSize = artist.albumSize ? `${artist.albumSize} 张专辑` : '';
  return [musicSize, albumSize].filter(Boolean).join(' · ') || '歌手';
}

function getRadioSubtitle(radio: NeteaseDjRadio): string {
  const owner = radio.dj?.nickname?.trim();
  const category = radio.category?.trim();
  const count = radio.programCount ? `${radio.programCount} 期` : '';
  return [owner || category, count].filter(Boolean).join(' · ') || '播客台';
}

function getProgramSubtitle(program: NeteaseDjProgram): string {
  const radioName = program.radio?.name?.trim() || program.radioName?.trim();
  const duration = program.duration > 0 ? formatDurationMs(program.duration) : '';
  return [radioName, duration].filter(Boolean).join(' · ') || '声音';
}

function getPlayableSubtitle(playable: MusicPlayable): string {
  if (isSongPlayable(playable)) return getSongSubtitle(playable);
  if (isMemoryRecordPlayable(playable)) return `${playable.artistName} · ${playable.albumName}`;
  return getProgramSubtitle(playable);
}

function getPlayableCover(playable: MusicPlayable): string | undefined {
  if (isSongPlayable(playable)) {
    return playable.album.picUrl;
  }
  if (isMemoryRecordPlayable(playable)) {
    return playable.coverImageUrl;
  }
  return playable.coverUrl || playable.radio?.picUrl;
}

function getPlayableFallbackGradient(playable: MusicPlayable): string {
  return isMemoryRecordPlayable(playable) && playable.coverGradient
    ? playable.coverGradient
    : getFallbackGradient(playable.id);
}

function getPlayableNote(playable: MusicPlayable): string {
  if (isSongPlayable(playable)) return '♪';
  if (isMemoryRecordPlayable(playable)) return '唱';
  return '播';
}

function getItemCover(item: MusicSearchItem): string | undefined {
  switch (item.kind) {
    case 'song':
      return item.album.picUrl;
    case 'playlist':
      return item.coverImgUrl;
    case 'album':
      return item.picUrl;
    case 'artist':
      return item.picUrl || item.avatarUrl;
    case 'radio':
      return item.picUrl;
    case 'program':
      return item.coverUrl || item.radio?.picUrl;
    default:
      return undefined;
  }
}

function getItemSubtitle(item: MusicSearchItem): string {
  switch (item.kind) {
    case 'song':
      return getSongSubtitle(item);
    case 'playlist':
      return getPlaylistSubtitle(item);
    case 'album':
      return getAlbumSubtitle(item);
    case 'artist':
      return getArtistSubtitle(item);
    case 'radio':
      return getRadioSubtitle(item);
    case 'program':
      return getProgramSubtitle(item);
    default:
      return '';
  }
}

function getItemBadge(item: MusicSearchItem): string {
  switch (item.kind) {
    case 'song':
      return item.duration > 0 ? formatDurationMs(item.duration) : '单曲';
    case 'playlist':
      return '歌单';
    case 'album':
      return '专辑';
    case 'artist':
      return '歌手';
    case 'radio':
      return '播客台';
    case 'program':
      return item.duration > 0 ? formatDurationMs(item.duration) : '声音';
    default:
      return '';
  }
}

function getSectionEmptyText(tab: MusicSearchTab): string {
  switch (tab) {
    case 'song':
      return '没有找到匹配单曲，试试歌手名或别名。';
    case 'playlist':
      return '没有找到匹配歌单，换个主题词再试试。';
    case 'album':
      return '没有找到匹配专辑，试试艺人名加专辑名。';
    case 'artist':
      return '没有找到匹配歌手，试试更完整的名字。';
    case 'radio':
      return '没有找到匹配播客台，试试节目品牌名或主播名。';
    case 'program':
      return '没有找到匹配声音，换个更短的关键词再试试。';
    default:
      return '暂时没有结果。';
  }
}

const CoverArt = ({
  src,
  alt,
  seed,
  className,
  note = '♪',
  gradient,
}: {
  src?: string;
  alt: string;
  seed: number;
  className: string;
  note?: string;
  gradient?: string;
}) => (
  <div className={className} style={src ? undefined : { background: gradient || getFallbackGradient(seed) }}>
    {src ? <img src={src} alt={alt} /> : <span className="music-cover-fallback-note">{note}</span>}
  </div>
);

const PlayableRow = ({
  playable,
  currentPlayable,
  onClick,
}: {
  playable: MusicPlayable;
  currentPlayable: MusicPlayable | null;
  onClick: (playable: MusicPlayable) => void;
}) => {
  const isCurrent = currentPlayable?.kind === playable.kind && currentPlayable.id === playable.id;

  return (
    <li className="music-song-item" onClick={() => onClick(playable)}>
      <CoverArt
        src={getPlayableCover(playable)}
        alt={playable.name}
        seed={playable.id}
        className="music-song-cover"
        note={getPlayableNote(playable)}
        gradient={getPlayableFallbackGradient(playable)}
      />
      <div className="music-song-info">
        <div className={`music-song-name ${isCurrent ? 'playing' : ''}`}>{playable.name}</div>
        <div className="music-song-artist">
          <span className="music-song-badge">{isMemoryRecordPlayable(playable) ? '回忆' : isSongPlayable(playable) ? '单曲' : '声音'}</span>
          {getPlayableSubtitle(playable)}
        </div>
      </div>
      <div className="music-song-actions">
        <div className="music-song-action"><IconHeart /></div>
        <div className="music-song-action"><IconMore /></div>
      </div>
    </li>
  );
};

const EntityRow = ({
  item,
  onClick,
}: {
  item: Exclude<MusicSearchItem, MusicPlayable>;
  onClick: () => void;
}) => (
  <li className="music-song-item" onClick={onClick}>
    <CoverArt src={getItemCover(item)} alt={item.name} seed={item.id} className="music-song-cover" note="♫" />
    <div className="music-song-info">
      <div className="music-song-name">{item.name}</div>
      <div className="music-song-artist">
        <span className="music-song-badge">{getItemBadge(item)}</span>
        {getItemSubtitle(item)}
      </div>
    </div>
    <div className="music-song-actions">
      <div className="music-song-action"><IconMore /></div>
    </div>
  </li>
);

const SectionBlock = ({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section>
    <div className="music-section-header">
      <div>
        <div className="music-section-title">{title}</div>
        {subtitle ? <div className="music-section-subtitle">{subtitle}</div> : null}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const DetailShell = ({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) => (
  <>
    <div className="music-navbar">
      <div className="music-navbar-back" onClick={onBack}><IconBack /></div>
      <div className="music-navbar-title">{title}</div>
      <div style={{ width: 32 }} />
    </div>
    <div className="music-search-page music-no-scrollbar">{children}</div>
  </>
);

const HeroCard = ({
  cover,
  seed,
  title,
  subtitle,
  description,
  actions,
}: {
  cover?: string;
  seed: number;
  title: string;
  subtitle?: string;
  description?: string;
  actions?: React.ReactNode;
}) => (
  <div className="music-state-card" style={{ margin: '16px 0', padding: 18 }}>
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <CoverArt src={cover} alt={title} seed={seed} className="music-song-cover" note="♫" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="music-state-title" style={{ fontSize: 18 }}>{title}</div>
        {subtitle ? <div className="music-state-text" style={{ marginTop: 4 }}>{subtitle}</div> : null}
        {description ? <div className="music-state-text">{description}</div> : null}
        {actions ? <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>{actions}</div> : null}
      </div>
    </div>
  </div>
);

const PlayerLyricsPanel = ({
  songId,
  currentTime,
  settings,
  onSettingsChange,
  onSeekToTime,
  localLyrics,
  memoryRecord,
  onSaveMemoryRecordLyricTiming,
}: {
  songId: number;
  currentTime: number;
  settings: FloatingLyricsSettings;
  onSettingsChange: (patch: Partial<FloatingLyricsSettings>) => void;
  onSeekToTime?: (seconds: number) => void;
  localLyrics?: string;
  memoryRecord?: MemoryRecordPlayable;
  onSaveMemoryRecordLyricTiming?: (recordId: string, timing: MemoryRecordLyricTiming | undefined) => Promise<void> | void;
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const userScrollingRef = useRef(false);
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoScrollIndexRef = useRef(-1);
  const [timingMode, setTimingMode] = useState(false);
  const [selectedTimingIndex, setSelectedTimingIndex] = useState(0);
  const [draftTimesMs, setDraftTimesMs] = useState<number[] | null>(null);
  const [timingSaving, setTimingSaving] = useState(false);
  const [timingMessage, setTimingMessage] = useState('');
  const [localTimingOverride, setLocalTimingOverride] = useState<MemoryRecordLyricTiming | null | undefined>(undefined);
  const effectiveLyricTiming = localTimingOverride === undefined
    ? memoryRecord?.lyricTiming
    : localTimingOverride || undefined;

  const {
    lines,
    currentIndex: syncedCurrentIndex,
    error,
    isLoading,
    localSourceHash,
  } = useLyrics({
    songId,
    currentTime,
    enabled: true,
    localLyrics,
    localMonologueText: memoryRecord?.monologueText,
    localLyricsOffsetMs: memoryRecord?.lyricsOffsetMs,
    localLyricTiming: effectiveLyricTiming,
  });

  const displayLines = useMemo(() => {
    if (!draftTimesMs || draftTimesMs.length !== lines.length) return lines;
    return lines.map((line, index) => ({
      ...line,
      time: Math.max(0, draftTimesMs[index] || 0) / 1000,
    }));
  }, [draftTimesMs, lines]);

  const currentIndex = useMemo(
    () => findCurrentLyricIndex(displayLines, currentTime),
    [currentTime, displayLines],
  );
  const canEditTiming = Boolean(memoryRecord?.recordId && onSaveMemoryRecordLyricTiming && localSourceHash && displayLines.length > 0);

  useEffect(() => {
    lineRefs.current = lineRefs.current.slice(0, displayLines.length);
  }, [displayLines.length]);

  useEffect(() => {
    setTimingMode(false);
    setDraftTimesMs(null);
    setSelectedTimingIndex(0);
    setTimingMessage('');
    setLocalTimingOverride(undefined);
  }, [memoryRecord?.recordId]);

  useEffect(() => {
    if (!timingMode || !draftTimesMs || draftTimesMs.length === lines.length) return;
    setTimingMode(false);
    setDraftTimesMs(null);
    setTimingMessage('歌词行已更新，打轴草稿已取消');
  }, [draftTimesMs, lines.length, timingMode]);

  // Detect user-initiated scroll via touch/wheel
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function markUserScrolling(): void {
      userScrollingRef.current = true;
      if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
      userScrollTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false;
      }, 3000);
    }

    viewport.addEventListener('touchstart', markUserScrolling, { passive: true });
    viewport.addEventListener('wheel', markUserScrolling, { passive: true });

    return () => {
      viewport.removeEventListener('touchstart', markUserScrolling);
      viewport.removeEventListener('wheel', markUserScrolling);
      if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
    };
  }, []);

  // Auto-scroll to current lyric line (smooth)
  useLayoutEffect(() => {
    if (currentIndex < 0 || userScrollingRef.current) return;
    if (currentIndex === lastAutoScrollIndexRef.current) return;
    lastAutoScrollIndexRef.current = currentIndex;

    const viewport = viewportRef.current;
    const activeLine = lineRefs.current[currentIndex];
    if (!viewport || !activeLine) return;

    const viewportCenter = viewport.clientHeight / 2;
    const activeLineCenter = activeLine.offsetTop + activeLine.offsetHeight / 2;
    const targetScroll = activeLineCenter - viewportCenter;

    const nextScrollTop = Math.max(0, targetScroll);
    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({
        top: nextScrollTop,
        behavior: 'smooth',
      });
    } else {
      viewport.scrollTop = nextScrollTop;
    }
  }, [currentIndex]);

  const style = {
    ...getLyricColorVars(settings.textColor),
  } as React.CSSProperties;

  function beginTimingMode(): void {
    if (!canEditTiming) return;
    setDraftTimesMs(displayLines.map((line) => Math.round(line.time * 1000)));
    setSelectedTimingIndex(Math.max(0, syncedCurrentIndex >= 0 ? syncedCurrentIndex : currentIndex));
    setTimingMessage('');
    setTimingMode(true);
    userScrollingRef.current = true;
  }

  function cancelTimingMode(): void {
    setTimingMode(false);
    setDraftTimesMs(null);
    setTimingMessage('');
    userScrollingRef.current = false;
  }

  function clampDraftTime(index: number, timeMs: number, times: number[]): number {
    const previous = index > 0 ? times[index - 1] : 0;
    const next = index < times.length - 1 ? times[index + 1] : Number.POSITIVE_INFINITY;
    const rounded = Math.max(0, Math.round(timeMs));
    return Math.max(previous, Math.min(rounded, next));
  }

  function setSelectedLineToCurrentTime(): void {
    if (!draftTimesMs || displayLines.length === 0) return;
    const index = Math.max(0, Math.min(selectedTimingIndex, draftTimesMs.length - 1));
    setDraftTimesMs((previous) => {
      if (!previous) return previous;
      const next = [...previous];
      next[index] = clampDraftTime(index, currentTime * 1000, next);
      return next;
    });
    setTimingMessage(`已定到 ${formatSeconds(currentTime)}`);
  }

  async function saveTiming(): Promise<void> {
    if (!memoryRecord?.recordId || !localSourceHash || !draftTimesMs || !onSaveMemoryRecordLyricTiming) return;
    setTimingSaving(true);
    try {
      let previousMs = 0;
      const normalized = draftTimesMs.map((value) => {
        const safeValue = Number.isFinite(value) ? Math.max(previousMs, Math.round(value)) : previousMs;
        previousMs = safeValue;
        return safeValue;
      });
      const timing: MemoryRecordLyricTiming = {
        sourceHash: localSourceHash,
        lineTimesMs: normalized,
        updatedAt: Date.now(),
      };
      await onSaveMemoryRecordLyricTiming(memoryRecord.recordId, timing);
      setLocalTimingOverride(timing);
      setDraftTimesMs(null);
      setTimingMode(false);
      setTimingMessage('打轴已保存');
      userScrollingRef.current = false;
    } catch (error) {
      console.error('[MusicApp] Failed to save lyric timing:', error);
      setTimingMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setTimingSaving(false);
    }
  }

  async function resetTiming(): Promise<void> {
    if (!memoryRecord?.recordId || !onSaveMemoryRecordLyricTiming) return;
    setTimingSaving(true);
    try {
      await onSaveMemoryRecordLyricTiming(memoryRecord.recordId, undefined);
      setLocalTimingOverride(null);
      setDraftTimesMs(null);
      setTimingMode(false);
      setTimingMessage('已恢复自动时间线');
      userScrollingRef.current = false;
    } catch (error) {
      console.error('[MusicApp] Failed to reset lyric timing:', error);
      setTimingMessage(error instanceof Error ? error.message : '重置失败');
    } finally {
      setTimingSaving(false);
    }
  }

  return (
    <section
      className="music-player-lyrics-card"
      style={style}
      data-testid="music-player-lyrics-panel"
    >
      <div className="music-player-lyrics-toolbar">
        <div className="music-player-lyrics-heading">
          <div className="music-player-lyrics-title">歌词</div>
        </div>

        <div className="music-player-lyrics-actions">
          {canEditTiming ? (
            <button
              type="button"
              className={`music-player-lyrics-translation-toggle ${timingMode ? 'active' : ''}`}
              data-testid="music-lyrics-timing-toggle"
              onClick={() => timingMode ? cancelTimingMode() : beginTimingMode()}
            >
              {timingMode ? '退出打轴' : '打轴'}
            </button>
          ) : null}

          <button
            type="button"
            className={`music-player-lyrics-translation-toggle ${settings.showTranslation ? 'active' : ''}`}
            onClick={() => onSettingsChange({ showTranslation: !settings.showTranslation })}
          >
            {settings.showTranslation ? '译文开' : '译文关'}
          </button>

          <label className="music-player-lyrics-color-picker">
            <span>自定义</span>
            <input
              aria-label="歌词字体颜色"
              type="color"
              value={settings.textColor}
              onChange={(event) => onSettingsChange({ textColor: event.target.value })}
            />
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="music-player-lyrics-empty">正在同步歌词...</div>
      ) : error ? (
        <div className="music-player-lyrics-empty">歌词加载失败：{error}</div>
      ) : displayLines.length === 0 ? (
        <div className="music-player-lyrics-empty">这首歌暂时没有可显示的歌词。</div>
      ) : (
        <div className="music-player-lyrics-viewport" ref={viewportRef}>
          <div className="music-player-lyrics-track">
            {displayLines.map((line, index) => (
              <div
                key={`${line.time}-${index}`}
                ref={(node) => {
                  lineRefs.current[index] = node;
                }}
                className={`music-player-lyrics-line ${index === currentIndex ? 'active' : ''}${timingMode && index === selectedTimingIndex ? ' timing-selected' : ''}`}
                data-testid={`music-lyrics-line-${index}`}
                onClick={() => {
                  if (timingMode) {
                    setSelectedTimingIndex(index);
                    setTimingMessage('');
                    return;
                  }
                  if (onSeekToTime && line.time >= 0) {
                    onSeekToTime(line.time);
                    // Resume auto-scroll immediately after seeking
                    userScrollingRef.current = false;
                    if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
                  }
                }}
              >
                <span className="music-player-lyrics-line-text">{line.text}</span>
                {settings.showTranslation && line.translation ? (
                  <span className="music-player-lyrics-line-translation">{line.translation}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
      {timingMode ? (
        <div className="music-player-lyrics-timing-panel" data-testid="music-lyrics-timing-panel">
          <div className="music-player-lyrics-timing-meta">
            <span>第 {Math.min(selectedTimingIndex + 1, displayLines.length)} / {displayLines.length} 行</span>
            <span>当前 {formatSeconds(currentTime)}</span>
          </div>
          <div className="music-player-lyrics-timing-selected">
            {displayLines[selectedTimingIndex]?.text || '请选择一句歌词'}
          </div>
          <div className="music-player-lyrics-timing-actions">
            <button type="button" onClick={setSelectedLineToCurrentTime} disabled={timingSaving}>定时</button>
            <button type="button" onClick={() => { void saveTiming(); }} disabled={timingSaving}>保存</button>
            <button type="button" onClick={cancelTimingMode} disabled={timingSaving}>取消</button>
            <button type="button" onClick={() => { void resetTiming(); }} disabled={timingSaving}>重置</button>
          </div>
          {timingMessage ? <div className="music-player-lyrics-timing-message">{timingMessage}</div> : null}
        </div>
      ) : null}
    </section>
  );
};

const DiscoverPage = ({
  playlists,
  playlistsLoading,
  playlistsError,
  previewPlaylist,
  previewTracks,
  previewLoading,
  previewError,
  currentPlayable,
  memoryRecords,
  onSearch,
  onCloseApp,
  showExitButton,
  onPlaylistSelect,
  onSongClick,
  onMemoryRecordClick,
  dailySongs,
  dailySongsLoading,
  isLoggedIn,
}: {
  playlists: NeteasePlaylist[];
  playlistsLoading: boolean;
  playlistsError: string | null;
  previewPlaylist: NeteasePlaylist | null;
  previewTracks: NeteaseSong[];
  previewLoading: boolean;
  previewError: string | null;
  currentPlayable: MusicPlayable | null;
  memoryRecords: MemoryRecordPlayable[];
  onSearch: () => void;
  onCloseApp: () => void;
  showExitButton: boolean;
  onPlaylistSelect: (playlist: NeteasePlaylist) => void;
  onSongClick: (song: NeteaseSong, queue?: NeteaseSong[]) => void;
  onMemoryRecordClick: (record: MemoryRecordPlayable, queue?: MemoryRecordPlayable[]) => void;
  dailySongs: NeteaseSong[];
  dailySongsLoading: boolean;
  isLoggedIn: boolean;
}) => (
  <div className="music-discover-page music-no-scrollbar">
    <div className="music-root-toolbar">
      {showExitButton ? (
        <button
          type="button"
          className="music-icon-button"
          aria-label="退出 Emo Cloud"
          data-testid="music-app-close"
          onClick={onCloseApp}
        >
          <IconBack />
        </button>
      ) : (
        <div className="music-root-toolbar-spacer" />
      )}

      <div className="music-search-bar music-search-bar--inline" onClick={onSearch}>
        <div className="music-search-input-wrapper music-search-entry" style={{ cursor: 'pointer' }}>
          <IconSearch />
          <span style={{ fontSize: 14, color: '#bbb' }}>搜索单曲、歌单、专辑、播客台、声音</span>
        </div>
      </div>
    </div>

    <SectionBlock title={isLoggedIn ? '每日推荐' : '推荐歌单'} subtitle={isLoggedIn ? '根据你的口味每天更新' : '热门个性化推荐'}>
      {playlistsError ? (
        <div className="music-state-card">
          <div className="music-state-title">歌单加载失败</div>
          <div className="music-state-text">{playlistsError}</div>
        </div>
      ) : null}

      {playlistsLoading ? (
        <div className="music-playlist-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="music-playlist-card">
              <div className="music-playlist-cover music-skeleton" />
              <div className="music-playlist-name music-skeleton" style={{ height: 34, marginTop: 6 }} />
            </div>
          ))}
        </div>
      ) : null}

      {!playlistsLoading && playlists.length > 0 ? (
        <div className="music-playlist-grid">
          {playlists.map((playlist, index) => (
            <div
              key={playlist.id}
              className={`music-playlist-card ${previewPlaylist?.id === playlist.id ? 'active' : ''}`}
              onClick={() => onPlaylistSelect(playlist)}
            >
              <CoverArt src={playlist.coverImgUrl} alt={playlist.name} seed={playlist.id + index} className="music-playlist-cover" note="♫" />
              <div className="music-playlist-name">{playlist.name}</div>
            </div>
          ))}
        </div>
      ) : null}
    </SectionBlock>

    {isLoggedIn && !dailySongsLoading && dailySongs.length > 0 ? (
      <SectionBlock title="每日推荐歌曲" subtitle="每天为你推荐 30 首好歌">
        <div style={{ padding: '0 16px' }}>
          <ul className="music-song-list">
            {dailySongs.slice(0, 10).map((song, index) => (
              <li
                key={song.id}
                className={`music-song-item ${currentPlayable?.id === song.id ? 'music-song-item-active' : ''}`}
                onClick={() => onSongClick(song, dailySongs)}
              >
                <div className="music-song-index">{index + 1}</div>
                <CoverArt
                  src={song.album?.picUrl}
                  alt={song.name}
                  seed={song.id}
                  className="music-song-cover"
                  note="♪"
                />
                <div className="music-song-info">
                  <div className="music-song-name">{song.name}</div>
                  <div className="music-song-artist">
                    {song.artists?.map(a => a.name).join(' / ') || '未知'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </SectionBlock>
    ) : null}

    {memoryRecords.length > 0 ? (
      <SectionBlock title="回忆唱片" subtitle="本地生成的私人唱片">
        <div style={{ padding: '0 16px' }}>
          <ul className="music-song-list">
            {memoryRecords.map((record) => (
              <PlayableRow
                key={record.recordId}
                playable={record}
                currentPlayable={currentPlayable}
                onClick={(targetRecord) => onMemoryRecordClick(targetRecord as MemoryRecordPlayable, memoryRecords)}
              />
            ))}
          </ul>
        </div>
      </SectionBlock>
    ) : null}

    {isLoggedIn && dailySongsLoading ? (
      <SectionBlock title="每日推荐歌曲" subtitle="加载中">
        <div className="music-loading-block">
          <div className="music-inline-spinner" />
        </div>
      </SectionBlock>
    ) : null}

    <SectionBlock
      title={previewPlaylist ? `${previewPlaylist.name} 速览` : '歌单速览'}
      subtitle={previewPlaylist ? '点一首直接进入真实播放' : '点上方歌单后，这里会加载真实歌曲'}
    >
      {previewLoading ? (
        <div className="music-state-card">
          <div className="music-inline-spinner" />
          <div className="music-state-text">正在拉取歌单歌曲...</div>
        </div>
      ) : null}

      {!previewLoading && previewError ? (
        <div className="music-state-card">
          <div className="music-state-title">歌单预览失败</div>
          <div className="music-state-text">{previewError}</div>
        </div>
      ) : null}

      {!previewLoading && !previewError && previewTracks.length > 0 ? (
        <div style={{ padding: '0 16px' }}>
          <ul className="music-song-list">
            {previewTracks.map((song) => (
              <PlayableRow
                key={song.id}
                playable={song}
                currentPlayable={currentPlayable}
                onClick={(targetSong) => onSongClick(targetSong as NeteaseSong, previewTracks)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </SectionBlock>

    <div style={{ height: 108 }} />
  </div>
);

const SearchPage = ({
  keyword,
  activeTab,
  isSearching,
  searchBundle,
  searchSections,
  searchHistory,
  suggestions,
  currentPlayable,
  onKeywordChange,
  onTabChange,
  onBack,
  onSubmit,
  onClearKeyword,
  onClearHistory,
  onHistoryClick,
  onSongClick,
  onOpenPlaylist,
  onOpenAlbum,
  onOpenArtist,
  onOpenRadio,
  onOpenProgram,
}: {
  keyword: string;
  activeTab: MusicSearchTab;
  isSearching: boolean;
  searchBundle: MusicSearchBundle;
  searchSections: Partial<Record<SearchableMusicTab, MusicSearchSection>>;
  searchHistory: string[];
  suggestions: string[];
  currentPlayable: MusicPlayable | null;
  onKeywordChange: (value: string) => void;
  onTabChange: (tab: MusicSearchTab) => void;
  onBack: () => void;
  onSubmit: () => void;
  onClearKeyword: () => void;
  onClearHistory: () => void;
  onHistoryClick: (term: string) => void;
  onSongClick: (song: NeteaseSong, queue?: NeteaseSong[]) => void;
  onOpenPlaylist: (playlist: NeteasePlaylist) => void;
  onOpenAlbum: (album: NeteaseAlbumSummary) => void;
  onOpenArtist: (artist: NeteaseArtistSummary) => void;
  onOpenRadio: (radio: NeteaseDjRadio) => void;
  onOpenProgram: (program: NeteaseDjProgram) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedKeyword = keyword.trim();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const renderItem = (item: MusicSearchItem, section: MusicSearchSection) => {
    if (item.kind === 'song') {
      const queue = section.items.filter((entry): entry is NeteaseSong => entry.kind === 'song');
      return (
        <PlayableRow
          key={`song-${item.id}`}
          playable={item}
          currentPlayable={currentPlayable}
          onClick={(song) => onSongClick(song as NeteaseSong, queue)}
        />
      );
    }

    if (item.kind === 'program') {
      return (
        <PlayableRow
          key={`program-${item.id}`}
          playable={item}
          currentPlayable={currentPlayable}
          onClick={() => onOpenProgram(item)}
        />
      );
    }

    if (item.kind === 'playlist') {
      return <EntityRow key={`playlist-${item.id}`} item={item} onClick={() => onOpenPlaylist(item)} />;
    }
    if (item.kind === 'album') {
      return <EntityRow key={`album-${item.id}`} item={item} onClick={() => onOpenAlbum(item)} />;
    }
    if (item.kind === 'artist') {
      return <EntityRow key={`artist-${item.id}`} item={item} onClick={() => onOpenArtist(item)} />;
    }
    return <EntityRow key={`radio-${item.id}`} item={item} onClick={() => onOpenRadio(item)} />;
  };

  const renderSection = (section: MusicSearchSection, showAction: boolean) => {
    if (section.error) {
      return (
        <div key={section.tab} className="music-state-card">
          <div className="music-state-title">{section.title}加载失败</div>
          <div className="music-state-text">{section.error}</div>
        </div>
      );
    }

    if (section.items.length === 0) {
      return activeTab === 'all' ? null : (
        <div key={section.tab} className="music-state-card music-empty-state">
          <div className="music-state-title">还没有结果</div>
          <div className="music-state-text">{getSectionEmptyText(section.tab)}</div>
        </div>
      );
    }

    return (
      <SectionBlock
        key={section.tab}
        title={section.title}
        subtitle={section.total > 0 ? `找到 ${section.total} 条结果` : undefined}
        action={showAction ? (
          <button type="button" className="music-text-button" onClick={() => onTabChange(section.tab)}>
            查看全部
          </button>
        ) : undefined}
      >
        <div style={{ padding: '0 16px' }}>
          <ul className="music-song-list">
            {section.items.map((item) => renderItem(item, section))}
          </ul>
        </div>
      </SectionBlock>
    );
  };

  const activeSection = activeTab === 'all' ? null : searchSections[activeTab];
  const hasAllResults = searchBundle.sections.some((section) => section.items.length > 0 || section.error);

  return (
    <>
      <div className="music-search-bar">
        <div className="music-navbar-back" onClick={onBack}><IconBack /></div>
        <div className="music-search-input-wrapper">
          <IconSearch />
          <input
            ref={inputRef}
            className="music-search-input"
            placeholder="搜索单曲、歌单、专辑、歌手、播客台、声音"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') onSubmit(); }}
          />
          {keyword ? <div onClick={onClearKeyword} style={{ cursor: 'pointer' }}><IconClear /></div> : null}
        </div>
        <div className="music-search-cancel" onClick={trimmedKeyword ? onSubmit : onBack}>{trimmedKeyword ? '搜索' : '取消'}</div>
      </div>

      <div className="music-search-page music-no-scrollbar">
        {trimmedKeyword ? (
          <div className="music-search-tabs">
            {MUSIC_SEARCH_TABS.map((tab) => (
              <div
                key={tab}
                className={`music-search-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => onTabChange(tab)}
              >
                {MUSIC_SEARCH_TAB_LABELS[tab]}
              </div>
            ))}
          </div>
        ) : null}

        {isSearching ? (
          <div className="music-loading-block">
            <div className="music-inline-spinner" />
            <div className="music-state-text">正在搜索“{trimmedKeyword}”...</div>
          </div>
        ) : null}

        {!isSearching && trimmedKeyword && activeTab === 'all' ? (
          hasAllResults ? (
            <>
              {searchBundle.sections.map((section) => renderSection(section, true))}
            </>
          ) : (
            <div className="music-state-card music-empty-state">
              <div className="music-state-title">没有找到匹配内容</div>
              <div className="music-state-text">试试更短的关键词，或者换歌手名 / 歌单名 / 播客名重新搜一下。</div>
            </div>
          )
        ) : null}

        {!isSearching && trimmedKeyword && activeTab !== 'all' ? (
          activeSection ? (
            renderSection(activeSection, false)
          ) : (
            <div className="music-state-card music-empty-state">
              <div className="music-state-title">正在准备结果</div>
              <div className="music-state-text">这一栏的数据还没回来，稍后会自动刷新。</div>
            </div>
          )
        ) : null}

        {!trimmedKeyword ? (
          <>
            <div className="music-search-history">
              <div className="music-search-history-header">
                <div className="music-search-history-title">最近搜索</div>
                {searchHistory.length > 0 ? <button type="button" className="music-text-button" onClick={onClearHistory}>清空</button> : null}
              </div>
              {searchHistory.length > 0 ? (
                <div className="music-search-history-tags">
                  {searchHistory.map((term) => (
                    <div key={term} className="music-search-history-tag" onClick={() => onHistoryClick(term)}>{term}</div>
                  ))}
                </div>
              ) : (
                <div className="music-state-text">还没有搜索记录，直接搜一首歌、一个歌单或一档播客吧。</div>
              )}
            </div>

            <div className="music-hot-section">
              <div className="music-hot-title">推荐搜索</div>
              <ul className="music-hot-list">
                {suggestions.map((name, index) => (
                  <li key={name} className="music-hot-item" onClick={() => onHistoryClick(name)}>
                    <span className={`music-hot-rank ${index < 3 ? `top-${index + 1}` : ''}`}>{index + 1}</span>
                    <span className="music-hot-name">{name}</span>
                    {index === 0 ? <span className="music-hot-badge">荐</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        <div style={{ height: 80 }} />
      </div>
    </>
  );
};

const PlaylistDetailPage = ({
  state,
  seed,
  currentPlayable,
  onBack,
  onSongClick,
}: {
  state?: Loadable<NeteasePlaylist>;
  seed?: NeteasePlaylist;
  currentPlayable: MusicPlayable | null;
  onBack: () => void;
  onSongClick: (song: NeteaseSong, queue?: NeteaseSong[]) => void;
}) => {
  const playlist = state?.data || seed || null;
  const tracks = playlist?.tracks || [];

  return (
    <DetailShell title="歌单" onBack={onBack}>
      {playlist ? (
        <>
          <HeroCard
            cover={playlist.coverImgUrl}
            seed={playlist.id}
            title={playlist.name}
            subtitle={getPlaylistSubtitle(playlist)}
            description={playlist.description}
            actions={tracks.length > 0 ? (
              <button type="button" className="music-primary-button" style={{ marginTop: 0 }} onClick={() => onSongClick(tracks[0], tracks)}>
                播放全部
              </button>
            ) : undefined}
          />
          <SectionBlock title="歌曲列表" subtitle={tracks.length > 0 ? `${tracks.length} 首歌曲` : '暂无歌曲'}>
            <div style={{ padding: '0 16px' }}>
              <ul className="music-song-list">
                {tracks.map((song) => (
                  <PlayableRow
                    key={song.id}
                    playable={song}
                    currentPlayable={currentPlayable}
                    onClick={(targetSong) => onSongClick(targetSong as NeteaseSong, tracks)}
                  />
                ))}
              </ul>
            </div>
          </SectionBlock>
        </>
      ) : null}

      {state?.loading && !playlist ? (
        <div className="music-loading-block">
          <div className="music-inline-spinner" />
          <div className="music-state-text">正在加载歌单详情...</div>
        </div>
      ) : null}

      {!state?.loading && !playlist ? (
        <div className="music-state-card" style={{ margin: '16px 0' }}>
          <div className="music-state-title">歌单加载失败</div>
          <div className="music-state-text">{state?.error || '暂时无法读取这个歌单。'}</div>
        </div>
      ) : null}
    </DetailShell>
  );
};

const AlbumDetailPage = ({
  state,
  seed,
  currentPlayable,
  onBack,
  onSongClick,
}: {
  state?: Loadable<NeteaseAlbumSummary>;
  seed?: NeteaseAlbumSummary;
  currentPlayable: MusicPlayable | null;
  onBack: () => void;
  onSongClick: (song: NeteaseSong, queue?: NeteaseSong[]) => void;
}) => {
  const album = state?.data || seed || null;
  const songs = album?.songs || [];

  return (
    <DetailShell title="专辑" onBack={onBack}>
      {album ? (
        <>
          <HeroCard
            cover={album.picUrl}
            seed={album.id}
            title={album.name}
            subtitle={getAlbumSubtitle(album)}
            description={album.description}
            actions={songs.length > 0 ? (
              <button type="button" className="music-primary-button" style={{ marginTop: 0 }} onClick={() => onSongClick(songs[0], songs)}>
                播放专辑
              </button>
            ) : undefined}
          />
          <SectionBlock title="曲目" subtitle={songs.length > 0 ? `${songs.length} 首` : '暂无曲目'}>
            <div style={{ padding: '0 16px' }}>
              <ul className="music-song-list">
                {songs.map((song) => (
                  <PlayableRow
                    key={song.id}
                    playable={song}
                    currentPlayable={currentPlayable}
                    onClick={(targetSong) => onSongClick(targetSong as NeteaseSong, songs)}
                  />
                ))}
              </ul>
            </div>
          </SectionBlock>
        </>
      ) : null}

      {state?.loading && !album ? (
        <div className="music-loading-block">
          <div className="music-inline-spinner" />
          <div className="music-state-text">正在加载专辑详情...</div>
        </div>
      ) : null}

      {!state?.loading && !album ? (
        <div className="music-state-card" style={{ margin: '16px 0' }}>
          <div className="music-state-title">专辑加载失败</div>
          <div className="music-state-text">{state?.error || '暂时无法读取这张专辑。'}</div>
        </div>
      ) : null}
    </DetailShell>
  );
};

const ArtistDetailPage = ({
  state,
  seed,
  currentPlayable,
  onBack,
  onSongClick,
  onOpenAlbum,
}: {
  state?: Loadable<ArtistDetailData>;
  seed?: NeteaseArtistSummary;
  currentPlayable: MusicPlayable | null;
  onBack: () => void;
  onSongClick: (song: NeteaseSong, queue?: NeteaseSong[]) => void;
  onOpenAlbum: (album: NeteaseAlbumSummary) => void;
}) => {
  const artist = state?.data?.artist || seed || null;
  const topSongs = state?.data?.topSongs || [];
  const albums = state?.data?.albums || [];
  const description = state?.data?.description || artist?.description || artist?.briefDesc || '';

  return (
    <DetailShell title="歌手" onBack={onBack}>
      {artist ? (
        <>
          <HeroCard
            cover={artist.picUrl || artist.avatarUrl}
            seed={artist.id}
            title={artist.name}
            subtitle={getArtistSubtitle(artist)}
            description={description}
          />
          <SectionBlock title="热门歌曲" subtitle={topSongs.length > 0 ? `${topSongs.length} 首` : '暂无'}>
            <div style={{ padding: '0 16px' }}>
              <ul className="music-song-list">
                {topSongs.map((song) => (
                  <PlayableRow
                    key={song.id}
                    playable={song}
                    currentPlayable={currentPlayable}
                    onClick={(targetSong) => onSongClick(targetSong as NeteaseSong, topSongs)}
                  />
                ))}
              </ul>
            </div>
          </SectionBlock>
          <SectionBlock title="专辑" subtitle={albums.length > 0 ? `${albums.length} 张` : '暂无'}>
            <div style={{ padding: '0 16px' }}>
              <ul className="music-song-list">
                {albums.map((album) => (
                  <EntityRow key={album.id} item={album} onClick={() => onOpenAlbum(album)} />
                ))}
              </ul>
            </div>
          </SectionBlock>
        </>
      ) : null}

      {state?.loading && !artist ? (
        <div className="music-loading-block">
          <div className="music-inline-spinner" />
          <div className="music-state-text">正在加载歌手详情...</div>
        </div>
      ) : null}

      {!state?.loading && !artist ? (
        <div className="music-state-card" style={{ margin: '16px 0' }}>
          <div className="music-state-title">歌手加载失败</div>
          <div className="music-state-text">{state?.error || '暂时无法读取这位歌手的信息。'}</div>
        </div>
      ) : null}
    </DetailShell>
  );
};

const RadioDetailPage = ({
  state,
  seed,
  currentPlayable,
  onBack,
  onProgramClick,
}: {
  state?: Loadable<RadioDetailData>;
  seed?: NeteaseDjRadio;
  currentPlayable: MusicPlayable | null;
  onBack: () => void;
  onProgramClick: (program: NeteaseDjProgram, queue?: NeteaseDjProgram[]) => void;
}) => {
  const radio = state?.data?.radio || seed || null;
  const programs = state?.data?.programs || radio?.programs || [];

  return (
    <DetailShell title="播客台" onBack={onBack}>
      {radio ? (
        <>
          <HeroCard
            cover={radio.picUrl}
            seed={radio.id}
            title={radio.name}
            subtitle={getRadioSubtitle(radio)}
            description={radio.description}
            actions={programs.length > 0 ? (
              <button type="button" className="music-primary-button" style={{ marginTop: 0 }} onClick={() => onProgramClick(programs[0], programs)}>
                播放最新一期
              </button>
            ) : undefined}
          />
          <SectionBlock title="节目列表" subtitle={programs.length > 0 ? `${programs.length} 期` : '暂无'}>
            <div style={{ padding: '0 16px' }}>
              <ul className="music-song-list">
                {programs.map((program) => (
                  <PlayableRow
                    key={program.id}
                    playable={program}
                    currentPlayable={currentPlayable}
                    onClick={(targetProgram) => onProgramClick(targetProgram as NeteaseDjProgram, programs)}
                  />
                ))}
              </ul>
            </div>
          </SectionBlock>
        </>
      ) : null}

      {state?.loading && !radio ? (
        <div className="music-loading-block">
          <div className="music-inline-spinner" />
          <div className="music-state-text">正在加载播客台详情...</div>
        </div>
      ) : null}

      {!state?.loading && !radio ? (
        <div className="music-state-card" style={{ margin: '16px 0' }}>
          <div className="music-state-title">播客台加载失败</div>
          <div className="music-state-text">{state?.error || '暂时无法读取这档播客。'}</div>
        </div>
      ) : null}
    </DetailShell>
  );
};

const ProgramDetailPage = ({
  state,
  seed,
  onBack,
  onPlay,
  onOpenRadio,
}: {
  state?: Loadable<ProgramDetailData>;
  seed?: NeteaseDjProgram;
  onBack: () => void;
  onPlay: (program: NeteaseDjProgram, queue?: NeteaseDjProgram[]) => void;
  onOpenRadio: (radio: NeteaseDjRadio) => void;
}) => {
  const program = state?.data?.program || seed || null;
  const radio = program?.radio || (program?.radioId ? {
    kind: 'radio' as const,
    id: program.radioId,
    name: program.radioName || '播客台',
    picUrl: program.coverUrl || '',
  } : null);

  return (
    <DetailShell title="声音" onBack={onBack}>
      {program ? (
        <>
          <HeroCard
            cover={program.coverUrl || program.radio?.picUrl}
            seed={program.id}
            title={program.name}
            subtitle={getProgramSubtitle(program)}
            description={program.description}
            actions={(
              <>
                <button type="button" className="music-primary-button" style={{ marginTop: 0 }} onClick={() => onPlay(program)}>
                  立即播放
                </button>
                {radio ? (
                  <button type="button" className="music-secondary-button" onClick={() => onOpenRadio(radio)}>
                    进入播客台
                  </button>
                ) : null}
              </>
            )}
          />
          <div className="music-state-card" style={{ margin: '16px 0' }}>
            <div className="music-state-title">节目说明</div>
            <div className="music-state-text">
              {program.description || '这期节目没有额外简介，可以直接播放收听。'}
            </div>
          </div>
        </>
      ) : null}

      {state?.loading && !program ? (
        <div className="music-loading-block">
          <div className="music-inline-spinner" />
          <div className="music-state-text">正在加载声音详情...</div>
        </div>
      ) : null}

      {!state?.loading && !program ? (
        <div className="music-state-card" style={{ margin: '16px 0' }}>
          <div className="music-state-title">声音加载失败</div>
          <div className="music-state-text">{state?.error || '暂时无法读取这期节目。'}</div>
        </div>
      ) : null}
    </DetailShell>
  );
};

/* ── Profile background IndexedDB helpers ── */
const PROFILE_BG_DB_NAME = 'music_profile_bg_db';
const PROFILE_BG_STORE = 'backgrounds';
const PROFILE_BG_KEY = 'custom_bg';
const PROFILE_BG_SETTING_KEY = 'music_profile_bg_setting';

type ProfileBgSetting = { type: 'default' | 'netease' | 'preset' | 'custom'; presetIndex?: number };

const PRESET_GRADIENTS = [
  'linear-gradient(135deg, #e8dfd5, #c4b5a3, #d6cdc2)',
  'linear-gradient(160deg, #d5cec8, #b8b3ad, #e0dbd5)',
  'linear-gradient(145deg, #c8c2bc, #a09890, #d0c8c0)',
  'linear-gradient(130deg, #d4c4c4, #c0a8a8, #ddd0d0)',
  'linear-gradient(150deg, #c5bcb0, #a8968a, #d8cfc5)',
  'linear-gradient(140deg, #b8c0c4, #98a4aa, #ccd2d5)',
];

function readBgSetting(): ProfileBgSetting {
  try {
    const raw = localStorage.getItem(PROFILE_BG_SETTING_KEY);
    if (!raw) return { type: 'default' };
    const parsed = JSON.parse(raw) as ProfileBgSetting;
    if (parsed && typeof parsed.type === 'string') return parsed;
  } catch { /* ignore */ }
  return { type: 'default' };
}

function writeBgSetting(setting: ProfileBgSetting): void {
  try { localStorage.setItem(PROFILE_BG_SETTING_KEY, JSON.stringify(setting)); } catch { /* ignore */ }
}

function openBgDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PROFILE_BG_DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(PROFILE_BG_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCustomBg(blob: Blob): Promise<void> {
  const db = await openBgDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILE_BG_STORE, 'readwrite');
    tx.objectStore(PROFILE_BG_STORE).put(blob, PROFILE_BG_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadCustomBg(): Promise<string | null> {
  try {
    const db = await openBgDb();
    return new Promise((resolve) => {
      const tx = db.transaction(PROFILE_BG_STORE, 'readonly');
      const req = tx.objectStore(PROFILE_BG_STORE).get(PROFILE_BG_KEY);
      req.onsuccess = () => {
        const blob = req.result as Blob | undefined;
        resolve(blob ? URL.createObjectURL(blob) : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

function compressImage(file: File, maxWidth = 1200, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => { blob ? resolve(blob) : reject(new Error('Compress failed')); }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

const IconWallpaper = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>;


const ProfileBgPicker = ({
  setting,
  hasNeteaseBackground,
  onSelect,
  onUpload,
  onClose,
}: {
  setting: ProfileBgSetting;
  hasNeteaseBackground: boolean;
  onSelect: (s: ProfileBgSetting) => void;
  onUpload: (file: File) => void;
  onClose: () => void;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="mp-bg-picker-backdrop" onClick={onClose} />
      <div className="mp-bg-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mp-bg-picker-handle" />
        <div className="mp-bg-picker-title">自定义背景</div>

        <div className="mp-bg-picker-section">
          <div className="mp-bg-picker-section-label">基本</div>
          <div className="mp-bg-picker-options">
            <button type="button" className={`mp-bg-option ${setting.type === 'default' ? 'active' : ''}`} onClick={() => onSelect({ type: 'default' })}>默认</button>
            <button type="button" className={`mp-bg-option ${setting.type === 'netease' ? 'active' : ''}`} disabled={!hasNeteaseBackground} onClick={() => onSelect({ type: 'netease' })}>账号背景</button>
          </div>
        </div>

        <div className="mp-bg-picker-section">
          <div className="mp-bg-picker-section-label">预设壁纸</div>
          <div className="mp-bg-presets">
            {PRESET_GRADIENTS.map((_, i) => (
              <div key={i} className={`mp-bg-preset mp-bg-preset-${i} ${setting.type === 'preset' && setting.presetIndex === i ? 'active' : ''}`} onClick={() => onSelect({ type: 'preset', presetIndex: i })} />
            ))}
          </div>
        </div>

        <div className="mp-bg-picker-section">
          <div className="mp-bg-picker-section-label">自定义</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
          <button type="button" className={`mp-bg-upload-btn ${setting.type === 'custom' ? 'active' : ''}`} onClick={() => fileRef.current?.click()}>从相册选择</button>
        </div>
      </div>
    </>
  );
};

const ProfilePage = ({
  account,
  isLoading,
  error,
  isLoggedIn,
  userPlaylists,
  userPlaylistsLoading,
  userPlaylistsError,
  onOpenLogin,
  onLogout,
  onCloseApp,
  onSearch,
  showExitButton,
  onOpenPlaylist,
}: {
  account: NeteaseUserAccount | null;
  isLoading: boolean;
  error: string | null;
  isLoggedIn: boolean;
  userPlaylists: NeteasePlaylist[];
  userPlaylistsLoading: boolean;
  userPlaylistsError: string | null;
  onOpenLogin: () => void;
  onLogout: () => void;
  onCloseApp: () => void;
  onSearch: () => void;
  showExitButton: boolean;
  onOpenPlaylist: (playlist: NeteasePlaylist) => void;
}) => {
  const [playlistTab, setPlaylistTab] = useState<'created' | 'collected'>('created');
  const [bgSetting, setBgSetting] = useState<ProfileBgSetting>(readBgSetting);
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [showBgPicker, setShowBgPicker] = useState(false);

  // Load custom background from IndexedDB on mount
  useEffect(() => {
    if (bgSetting.type === 'custom') { void loadCustomBg().then(setCustomBgUrl); }
  }, [bgSetting.type]);

  const accountUserId = account?.userId ?? null;

  const createdPlaylists = useMemo(() => {
    if (accountUserId === null) return [];
    return userPlaylists.filter((p) => p.creator?.userId === accountUserId);
  }, [accountUserId, userPlaylists]);

  const collectedPlaylists = useMemo(() => {
    if (accountUserId === null) return [];
    return userPlaylists.filter((p) => p.creator?.userId !== accountUserId);
  }, [accountUserId, userPlaylists]);

  // First created playlist is always "My Favorites" in NetEase
  const likedPlaylist = createdPlaylists[0] || null;
  const otherCreated = createdPlaylists.slice(1);
  const visiblePlaylists = playlistTab === 'created' ? otherCreated : collectedPlaylists;

  // Resolve background style
  const bgStyle = useMemo<React.CSSProperties>(() => {
    switch (bgSetting.type) {
      case 'netease':
        return account?.backgroundUrl
          ? { backgroundImage: `url(${account.backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : {};
      case 'preset':
        return { background: PRESET_GRADIENTS[bgSetting.presetIndex ?? 0] };
      case 'custom':
        return customBgUrl ? { backgroundImage: `url(${customBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {};
      default:
        return {};
    }
  }, [bgSetting, account?.backgroundUrl, customBgUrl]);

  function handleBgSelect(setting: ProfileBgSetting): void {
    setBgSetting(setting);
    writeBgSetting(setting);
    if (setting.type !== 'custom') setCustomBgUrl(null);
    setShowBgPicker(false);
  }

  function handleBgUpload(file: File): void {
    void (async () => {
      try {
        const compressed = await compressImage(file);
        await saveCustomBg(compressed);
        const url = URL.createObjectURL(compressed);
        setCustomBgUrl(url);
        const setting: ProfileBgSetting = { type: 'custom' };
        setBgSetting(setting);
        writeBgSetting(setting);
        setShowBgPicker(false);
      } catch { /* ignore */ }
    })();
  }

  return (
    <div className="music-profile-page music-no-scrollbar">
      <div className="music-profile-header">
        <div className="music-profile-bg" style={bgStyle} />

        {/* Toolbar */}
        <div className="music-profile-toolbar">
          <div className="music-profile-toolbar-group">
            {showExitButton ? (
              <button type="button" className="music-icon-button" aria-label="退出" data-testid="music-app-close" onClick={onCloseApp}>
                <IconBack />
              </button>
            ) : null}
          </div>
          <div className="music-profile-toolbar-group">
            <button type="button" className="music-icon-button" onClick={() => setShowBgPicker(true)} aria-label="自定义背景"><IconWallpaper /></button>
            <button type="button" className="music-icon-button" onClick={onSearch}><IconSearch /></button>
            {isLoggedIn ? <button type="button" className="music-text-button" style={{ color: '#9e9a94', fontSize: 12 }} onClick={onLogout}>退出</button> : null}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="music-profile-loading">
            <div className="mp-spinner" />
          </div>
        ) : isLoggedIn && account ? (
          <div className="mp-profile-row">
            <div className="mp-profile-left">
              <CoverArt src={account.avatarUrl} alt={account.nickname} seed={account.userId} className="music-profile-avatar" />
              {account.isVip ? <span className="music-vip-badge">{getVipLabel(account)}</span> : null}
            </div>
            <div className="mp-profile-info">
              <div className="music-profile-name">{account.nickname}</div>
              {account.signature ? (
                <div className="mp-profile-signature">{account.signature}</div>
              ) : null}
              <div className="music-profile-stats">
                <div className="music-profile-stat">
                  <span className="music-profile-stat-num">{account.follows}</span>
                  <span className="music-profile-stat-label">关注</span>
                </div>
                <div className="music-profile-stat">
                  <span className="music-profile-stat-num">{account.followeds}</span>
                  <span className="music-profile-stat-label">粉丝</span>
                </div>
                <div className="music-profile-stat">
                  <span className="music-profile-stat-num">{account.listenSongs}</span>
                  <span className="music-profile-stat-label">听歌</span>
                </div>
              </div>
            </div>
          </div>
        ) : isLoggedIn ? (
          <div className="mp-login-pending">
            <div className="mp-login-pending-title">{error ? '登录异常' : '登录中，请稍候'}</div>
            {error ? <div className="mp-login-pending-text">同步异常，请重新扫码登录</div> : null}
            <button type="button" className="mp-login-pending-btn" onClick={onOpenLogin}>{error ? '重新登录' : '打开二维码'}</button>
          </div>
        ) : (
          <div className="mp-login-prompt">
            <div className="mp-login-calligraphy">My Music</div>
            <div className="mp-login-title">登录即可查看</div>
            <div className="mp-login-subtitle">你的歌单和收藏</div>
            <button type="button" className="mp-login-btn" onClick={onOpenLogin}>扫码登录</button>
          </div>
        )}
      </div>

      {/* Error card */}
      {error && isLoggedIn ? (
        <div className="mp-error-card">
          <div className="mp-error-title">登录异常</div>
          <div className="mp-error-text">{error}</div>
          <button type="button" className="mp-error-btn" onClick={onOpenLogin}>重新登录</button>
        </div>
      ) : null}

      {/* Logged-in content */}
      {isLoggedIn && account ? (
        <>
          {/* 歌单封面照片画廊 — 倾斜卡片 */}
          {userPlaylists.length > 1 ? (
            <div className="mp-photo-gallery">
              <div className="mp-photo-scroll">
                {userPlaylists.slice(0, 6).map((pl) => (
                  <div key={pl.id} className="mp-photo-card" onClick={() => onOpenPlaylist(pl)}>
                    <CoverArt src={pl.coverImgUrl} alt={pl.name} seed={pl.id} className="mp-photo-card-img" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 「我喜欢的音乐」card */}
          {likedPlaylist ? (
            <div className="mp-liked-card" onClick={() => onOpenPlaylist(likedPlaylist)}>
              <div className="mp-liked-inner">
                <div className="mp-liked-left">
                  <CoverArt src={likedPlaylist.coverImgUrl} alt={likedPlaylist.name} seed={likedPlaylist.id} className="mp-liked-cover" />
                </div>
                <div className="mp-liked-info">
                  <div className="mp-liked-title">{likedPlaylist.name}</div>
                  <div className="mp-liked-count">{likedPlaylist.trackCount} 首歌曲</div>
                  <div className="mp-liked-play-all">
                    <span className="mp-liked-play-dot">▶</span>
                    播放全部
                  </div>
                </div>
                <svg className="mp-liked-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
              </div>
            </div>
          ) : null}

          {/* Playlist tabs */}
          {userPlaylistsLoading ? (
            <div className="mp-loading-block">
              <div className="mp-spinner" />
            </div>
          ) : (
            <div className="mp-playlist-section">
              <div className="mp-playlist-tabs">
                <button type="button" className={`mp-playlist-tab ${playlistTab === 'created' ? 'active' : ''}`} onClick={() => setPlaylistTab('created')}>
                  创建的歌单 ({otherCreated.length})
                </button>
                <button type="button" className={`mp-playlist-tab ${playlistTab === 'collected' ? 'active' : ''}`} onClick={() => setPlaylistTab('collected')}>
                  收藏的歌单 ({collectedPlaylists.length})
                </button>
              </div>
              {visiblePlaylists.length > 0 ? (
                <ul className="mp-playlist-list">
                  {visiblePlaylists.map((playlist) => (
                    <li key={playlist.id} className="mp-playlist-item" onClick={() => onOpenPlaylist(playlist)}>
                      <CoverArt src={playlist.coverImgUrl} alt={playlist.name} seed={playlist.id} className="mp-playlist-cover" note="♫" />
                      <div className="mp-playlist-info">
                        <div className="mp-playlist-name">{playlist.name}</div>
                        <div className="mp-playlist-meta">{getPlaylistSubtitle(playlist)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mp-empty-state">
                  <div className="mp-empty-icon">
                    <span className="mp-empty-sparkle">✦</span>
                    <span className="mp-empty-sparkle">✦</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                  </div>
                  <div className="mp-empty-title">还没有创建歌单</div>
                  <div className="mp-empty-desc">创建你的第一个歌单，分享你的音乐品味</div>
                </div>
              )}
            </div>
          )}

          {userPlaylistsError ? (
            <div className="mp-error-card">
              <div className="mp-error-title">歌单加载失败</div>
              <div className="mp-error-text">{userPlaylistsError}</div>
            </div>
          ) : null}
        </>
      ) : null}

      <div style={{ height: 112 }} />

      {/* Background picker sheet */}
      {showBgPicker ? (
        <ProfileBgPicker
          setting={bgSetting}
          hasNeteaseBackground={Boolean(account?.backgroundUrl)}
          onSelect={handleBgSelect}
          onUpload={handleBgUpload}
          onClose={() => setShowBgPicker(false)}
        />
      ) : null}
    </div>
  );
};

const QrLoginModal = ({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [status, setStatus] = useState<QrModalStatus>('idle');
  const [statusText, setStatusText] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const pollTimerRef = useRef<number | null>(null);

  const qrImageCandidates = useMemo(() => qrUrl ? buildQrImageCandidates(qrUrl) : [], [qrUrl]);
  const qrImageSrc = qrImageCandidates[imageIndex] || '';
  const requiresOfficialVerification = statusText.includes('验证');

  useEffect(() => {
    if (!open) {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setStatus('idle');
      setStatusText('');
      setQrUrl('');
      setImageIndex(0);
      return;
    }

    let active = true;

    const clearPollTimer = () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const pollStatus = async (key: string) => {
      try {
        const result = await checkQrStatus(key);
        if (!active) return;

        if (result.code === 801) {
          setStatus('waiting');
          setStatusText(`请使用${MUSIC_SCAN_APP_NAME}扫码。`);
          return;
        }
        if (result.code === 802) {
          setStatus('scanned');
          setStatusText('已扫码，请在手机上确认登录。');
          return;
        }
        if (result.code === 803) {
          clearPollTimer();
          if (!result.cookie) {
            setStatus('error');
            setStatusText('登录成功，但没有取到 cookie，请重新生成二维码。');
            return;
          }

          setStatus('success');
          setStatusText('登录成功，正在刷新“我的”页面...');
          setMusicCookie(result.cookie);
          onSuccess();
          window.setTimeout(() => {
            if (active) onClose();
          }, 500);
          return;
        }
        if (result.code === 800) {
          clearPollTimer();
          setStatus('expired');
          setStatusText('二维码已过期，请重新生成。');
          return;
        }

        setStatus('waiting');
        setStatusText(
          result.message
            ? `${result.message}${result.code > 0 ? `（状态码 ${result.code}）` : ''}`
            : '等待扫码中...',
        );
      } catch (error) {
        clearPollTimer();
        if (!active) return;
        setStatus('error');
        setStatusText(error instanceof Error ? error.message : '二维码状态检查失败');
      }
    };

    const initQr = async () => {
      setStatus('loading');
      setStatusText('正在生成二维码...');
      setQrUrl('');
      setImageIndex(0);

      try {
        const qrKey = await getQrKey();
        if (!active || !qrKey) throw new Error('没有获取到二维码 key');
        const nextQrUrl = await getQrUrl(qrKey);
        if (!active || !nextQrUrl) throw new Error('二维码内容生成失败');

        setQrUrl(nextQrUrl);
        setStatus('waiting');
        setStatusText(`请使用${MUSIC_SCAN_APP_NAME}扫码。`);
        await pollStatus(qrKey);
        if (!active) return;
        pollTimerRef.current = window.setInterval(() => { void pollStatus(qrKey); }, 2000);
      } catch (error) {
        if (!active) return;
        setStatus('error');
        setStatusText(error instanceof Error ? error.message : '二维码生成失败');
      }
    };

    void initQr();

    return () => {
      active = false;
      clearPollTimer();
    };
  }, [onClose, onSuccess, open, retryToken]);

  if (!open) return null;

  return (
    <div className="music-modal-backdrop" onClick={onClose}>
      <div className="music-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="music-modal-header">
          <div>
            <div className="music-modal-title">扫码登录 {MUSIC_APP_NAME}</div>
            <div className="music-modal-subtitle">使用手机 App 扫码后，这台设备会同步你的登录态</div>
          </div>
          <button type="button" className="music-icon-button" onClick={onClose}>×</button>
        </div>

        <div className="music-qr-stage">
          {status === 'loading' ? (
            <div className="music-qr-placeholder"><div className="music-inline-spinner" /></div>
          ) : qrImageSrc ? (
            <div className="music-qr-box">
              <img
                src={qrImageSrc}
                alt={`${MUSIC_APP_NAME} 二维码登录`}
                className="music-qr-image"
                onError={() => setImageIndex((current) => (current < qrImageCandidates.length - 1 ? current + 1 : current))}
              />
            </div>
          ) : (
            <div className="music-qr-placeholder">二维码暂不可用</div>
          )}
        </div>

        <div className={`music-qr-status music-qr-status-${status}`}>{statusText}</div>

        {requiresOfficialVerification ? (
          <div className="music-state-card" style={{ margin: '0 0 16px', padding: '14px 16px' }}>
            <div className="music-state-title">这一步需要网页验证</div>
            <div className="music-state-text">先在网页登录页完成一次验证，再回来重新扫码，通常就能进入成功回调。</div>
            <button
              type="button"
              className="music-secondary-button"
              onClick={() => window.open('https://music.163.com/#/login', '_blank', 'noopener,noreferrer')}
            >
              打开{MUSIC_WEB_LOGIN_NAME}
            </button>
          </div>
        ) : null}

        <div className="music-qr-actions">
          <button type="button" className="music-secondary-button" onClick={() => setRetryToken((value) => value + 1)}>重新生成</button>
          <button
            type="button"
            className="music-secondary-button"
            onClick={() => {
              if (!qrUrl || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
              void navigator.clipboard.writeText(qrUrl).then(
                () => setStatusText('二维码链接已复制，可用其他设备生成后扫码。'),
                () => setStatusText('复制失败，请稍后再试。'),
              );
            }}
            disabled={!qrUrl}
          >
            复制链接
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── 播放器皮肤系统 ─────────────────────────── */

type PlayerSkinEntry = {
  id: string;
  name: string;
  /** null = 封面模糊模式 */
  file: string | null;
};

const BUILTIN_SKINS: PlayerSkinEntry[] = [
  { id: 'rain',      name: '听雨', file: '/music-skins/skin-rain.jpg' },
  { id: 'sparkle',   name: '波光', file: '/music-skins/skin-sparkle.jpg' },
  { id: 'firework',  name: '花火', file: '/music-skins/skin-firework.jpg' },
  { id: 'snow-cat',  name: '初雪', file: '/music-skins/skin-snow-cat.jpg' },
  { id: 'ribbon',    name: '丝绒', file: '/music-skins/skin-ribbon.jpg' },
  { id: 'butterfly', name: '蝶渊', file: '/music-skins/skin-butterfly.jpg' },
  { id: 'umbrella',  name: '雨幕', file: '/music-skins/skin-umbrella.jpg' },
  { id: 'cover-blur', name: '封面', file: null },
];

const SKIN_STORAGE_KEY = 'music_player_skin';
const CUSTOM_SKIN_DB = 'music_custom_skins';
const CUSTOM_SKIN_STORE = 'skins';

function openCustomSkinDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CUSTOM_SKIN_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CUSTOM_SKIN_STORE)) {
        database.createObjectStore(CUSTOM_SKIN_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadCustomSkins(): Promise<PlayerSkinEntry[]> {
  try {
    const database = await openCustomSkinDb();
    return new Promise((resolve) => {
      const transaction = database.transaction(CUSTOM_SKIN_STORE, 'readonly');
      const store = transaction.objectStore(CUSTOM_SKIN_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = (request.result || []).map((record: { id: string; name: string; blob: Blob }) => ({
          id: record.id,
          name: record.name,
          file: URL.createObjectURL(record.blob),
        }));
        resolve(entries);
      };
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function saveCustomSkin(name: string, blob: Blob): Promise<PlayerSkinEntry> {
  const id = `custom-${Date.now()}`;
  const database = await openCustomSkinDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CUSTOM_SKIN_STORE, 'readwrite');
    const store = transaction.objectStore(CUSTOM_SKIN_STORE);
    const request = store.put({ id, name, blob });
    request.onsuccess = () => resolve({ id, name, file: URL.createObjectURL(blob) });
    request.onerror = () => reject(request.error);
  });
}

function getRandomSkinId(): string {
  // 只从有壁纸的皮肤中随机选（排除封面模糊）
  const wallpaperSkins = BUILTIN_SKINS.filter((skin) => skin.file !== null);
  const index = Math.floor(Math.random() * wallpaperSkins.length);
  return wallpaperSkins[index].id;
}

const GLASS_MODE_KEY = 'music_player_glass';

const IconGlass = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><ellipse cx="12" cy="9" rx="6" ry="3" opacity="0.5" /><path d="M6 15c0-1.5 2.7-3 6-3s6 1.5 6 3" opacity="0.3" /></svg>;

const IconSkin = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M2 12h4M18 12h4M12 2v4M12 18v4" /></svg>;

const SkinPicker = ({
  skins,
  activeSkinId,
  onSelect,
  onUpload,
  onClose,
}: {
  skins: PlayerSkinEntry[];
  activeSkinId: string;
  onSelect: (id: string) => void;
  onUpload: (file: File) => void;
  onClose: () => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="music-skin-picker-backdrop" onClick={onClose} />
      <div className="music-skin-picker-panel">
        <div className="music-skin-picker-header">
          <div className="music-skin-picker-title">播放器皮肤</div>
          <button type="button" className="music-skin-picker-close" onClick={onClose}>×</button>
        </div>
        <div className="music-skin-picker-scroll">
          {skins.map((skin) => (
            <div key={skin.id} className="music-skin-picker-item" onClick={() => onSelect(skin.id)}>
              <div className={`music-skin-picker-thumb ${activeSkinId === skin.id ? 'active' : ''}`}>
                {skin.file ? (
                  <img src={skin.file} alt={skin.name} />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 18,
                  }}>♪</div>
                )}
              </div>
              <div className={`music-skin-picker-label ${activeSkinId === skin.id ? 'active' : ''}`}>{skin.name}</div>
            </div>
          ))}
          <div className="music-skin-picker-item" onClick={() => fileInputRef.current?.click()}>
            <div className="music-skin-picker-upload">
              <span>+</span>
              <span className="music-skin-picker-upload-label">上传</span>
            </div>
            <div className="music-skin-picker-label">自定义</div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
      </div>
    </>
  );
};

const LIKED_SONGS_KEY = 'music_liked_songs';

function isLikedSong(songId: number): boolean {
  try {
    const raw = localStorage.getItem(LIKED_SONGS_KEY);
    if (!raw) return false;
    const set: number[] = JSON.parse(raw);
    return Array.isArray(set) && set.includes(songId);
  } catch {
    return false;
  }
}

function toggleLikedSong(songId: number): boolean {
  try {
    const raw = localStorage.getItem(LIKED_SONGS_KEY);
    const set: number[] = raw ? JSON.parse(raw) : [];
    const idx = set.indexOf(songId);
    if (idx >= 0) {
      set.splice(idx, 1);
      localStorage.setItem(LIKED_SONGS_KEY, JSON.stringify(set));
      return false;
    }
    set.push(songId);
    localStorage.setItem(LIKED_SONGS_KEY, JSON.stringify(set));
    return true;
  } catch {
    return false;
  }
}

const LikeButton = ({ songId, likedPlaylistId }: { songId: number; likedPlaylistId: number | null }) => {
  const [liked, setLiked] = useState(() => isLikedSong(songId));
  const [animating, setAnimating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setLiked(isLikedSong(songId));
  }, [songId]);

  return (
    <button
      type="button"
      className={`music-player-like-button ${liked ? 'music-player-like-button--active' : ''} ${animating ? 'music-player-like-button--pulse' : ''}`}
      aria-label={liked ? '取消喜欢' : '我喜欢'}
      style={{ opacity: syncing ? 0.5 : 1 }}
      disabled={syncing}
      onClick={() => {
        const next = toggleLikedSong(songId);
        setLiked(next);
        if (next) {
          setAnimating(true);
          setTimeout(() => setAnimating(false), 400);
        }
        // Sync to NetEase in background
        if (likedPlaylistId && likedPlaylistId > 0) {
          setSyncing(true);
          console.log('[LikeButton] syncing:', next ? 'add' : 'del', 'playlistId:', likedPlaylistId, 'songId:', songId);
          const apiCall = next
            ? addSongsToPlaylist(likedPlaylistId, [songId])
            : removeSongsFromPlaylist(likedPlaylistId, [songId]);
          apiCall
            .then(() => {
              console.log('[LikeButton] sync success');
            })
            .catch((err) => {
              console.warn('[LikeButton] sync failed, reverting:', err);
              window.alert(`收藏同步失败: ${err instanceof Error ? err.message : String(err)}`);
              // Revert optimistic update
              const reverted = toggleLikedSong(songId);
              setLiked(reverted);
            })
            .finally(() => setSyncing(false));
        } else {
          console.warn('[LikeButton] no likedPlaylistId, skip sync. id:', likedPlaylistId);
        }
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill={liked ? '#ec4141' : 'none'} stroke={liked ? '#ec4141' : 'currentColor'} strokeWidth="1.8">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    </button>
  );
};

const FullPlayer = ({
  playable,
  isPlaying,
  progress,
  currentTime,
  duration,
  lyricSettings,
  likedPlaylistId,
  onClose,
  onLyricSettingsChange,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onSeekToTime,
  onAddToPlaylist,
  onExportMemoryRecord,
  onOpenShareMemoryRecord,
  onSaveMemoryRecordLyricTiming,
}: {
  playable: MusicPlayable;
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  lyricSettings: FloatingLyricsSettings;
  likedPlaylistId: number | null;
  onClose: () => void;
  onLyricSettingsChange: (patch: Partial<FloatingLyricsSettings>) => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (pct: number) => void;
  onSeekToTime: (seconds: number) => void;
  onAddToPlaylist?: (songId: number) => void;
  onExportMemoryRecord?: (playable: MemoryRecordPlayable) => Promise<void> | void;
  onOpenShareMemoryRecord?: (playable: MemoryRecordPlayable) => void;
  onSaveMemoryRecordLyricTiming?: (recordId: string, timing: MemoryRecordLyricTiming | undefined) => Promise<void> | void;
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPercent, setDragPercent] = useState(0);
  const [isExportingMp3, setIsExportingMp3] = useState(false);
  const cover = getPlayableCover(playable);
  const displayDuration = duration > 0 ? duration : playable.duration / 1000;

  // ── 皮肤系统 ──
  const [activeSkinId, setActiveSkinId] = useState<string>(() => {
    // 每次打开随机一个皮肤
    return getRandomSkinId();
  });
  const [customSkins, setCustomSkins] = useState<PlayerSkinEntry[]>([]);
  const [showSkinPicker, setShowSkinPicker] = useState(false);

  // ── 液态玻璃模式 ──
  const [glassMode, setGlassMode] = useState<boolean>(() => {
    try { return localStorage.getItem(GLASS_MODE_KEY) === 'true'; } catch { return false; }
  });

  function toggleGlassMode(): void {
    setGlassMode((prev) => {
      const next = !prev;
      try { localStorage.setItem(GLASS_MODE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // 加载自定义皮肤
  useEffect(() => {
    void loadCustomSkins().then(setCustomSkins);
  }, []);

  const allSkins = useMemo(() => [...BUILTIN_SKINS, ...customSkins], [customSkins]);
  const activeSkin = allSkins.find((skin) => skin.id === activeSkinId) || BUILTIN_SKINS[0];
  const isSkinMode = activeSkin.file !== null;

  // 背景样式
  const backgroundStyle = isSkinMode
    ? { backgroundImage: `url(${activeSkin.file})` }
    : cover
      ? { backgroundImage: `url(${cover})` }
      : { background: getPlayableFallbackGradient(playable) };

  // 提取封面主色调用于氛围光
  const dominantColor = useDominantColor(cover);
  const ambientStyle = dominantColor
    ? {
        background: `radial-gradient(ellipse at 30% 20%, rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, 0.4) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}, 0.25) 0%, transparent 50%)`,
      }
    : undefined;

  function handleSkinSelect(id: string): void {
    setActiveSkinId(id);
    try { localStorage.setItem(SKIN_STORAGE_KEY, id); } catch { /* ignore */ }
  }

  function clampProgressPercent(event: React.PointerEvent, bar: HTMLDivElement): number {
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
  }

  function handleProgressPointerDown(event: React.PointerEvent): void {
    event.preventDefault();
    const bar = progressBarRef.current;
    if (!bar) return;

    bar.setPointerCapture(event.pointerId);
    setIsDragging(true);
    setDragPercent(clampProgressPercent(event, bar));
  }

  function handleProgressPointerMove(event: React.PointerEvent): void {
    if (!isDragging) return;
    const bar = progressBarRef.current;
    if (!bar) return;

    setDragPercent(clampProgressPercent(event, bar));
  }

  function handleProgressPointerUp(event: React.PointerEvent): void {
    if (!isDragging) return;
    const bar = progressBarRef.current;
    const nextPercent = bar ? clampProgressPercent(event, bar) : dragPercent;

    if (bar?.hasPointerCapture(event.pointerId)) {
      bar.releasePointerCapture(event.pointerId);
    }

    setDragPercent(nextPercent);
    setIsDragging(false);
    onSeek(nextPercent);
  }

  async function handleSkinUpload(file: File): Promise<void> {
    try {
      const entry = await saveCustomSkin(file.name.replace(/\.[^.]+$/, ''), file);
      setCustomSkins((previous) => [...previous, entry]);
      setActiveSkinId(entry.id);
      try { localStorage.setItem(SKIN_STORAGE_KEY, entry.id); } catch { /* ignore */ }
    } catch (error) {
      console.error('[MusicApp] Failed to save custom skin:', error);
    }
  }

  async function handleExportMp3(): Promise<void> {
    if (!isMemoryRecordPlayable(playable) || !onExportMemoryRecord || isExportingMp3) return;

    setIsExportingMp3(true);
    try {
      await onExportMemoryRecord(playable);
    } finally {
      setIsExportingMp3(false);
    }
  }

  return (
    <div className="music-player-page">
      {/* Layer 0: 皮肤壁纸 / 封面模糊 */}
      <div
        className={`music-player-bg ${isSkinMode ? 'music-player-bg--skin' : 'music-player-bg--cover'}`}
        style={backgroundStyle}
      />
      {/* Layer 1: 暗化遮罩 */}
      {isSkinMode ? <div className="music-player-dim" /> : null}
      {/* Layer 2: 封面色氛围光 */}
      <div className="music-player-ambient" style={ambientStyle} />
      {/* Layer 3: 暗角 */}
      <div className="music-player-vignette" />

      <div className="music-player-content">
        <div className="music-player-header">
          <button
            type="button"
            className="music-player-header-button"
            aria-label="收起播放器"
            onClick={onClose}
          >
            <IconDown />
          </button>
          <div className="music-player-header-copy" />
          <button
            type="button"
            className={`music-glass-toggle ${glassMode ? 'music-glass-toggle--active' : ''}`}
            aria-label="液态玻璃"
            onClick={toggleGlassMode}
          >
            <IconGlass />
          </button>
          <button
            type="button"
            className="music-player-header-button"
            aria-label="播放器皮肤"
            onClick={() => setShowSkinPicker(true)}
          >
            <IconSkin />
          </button>
        </div>

        {/* 旋转唱片 */}
        <div className="music-player-cover-area">
          <div className={`music-player-vinyl-halo ${isPlaying ? 'music-player-vinyl-halo--playing' : ''}${glassMode ? ' music-player-vinyl-halo--glass' : ''}`}>
            <div className={`music-player-disc ${isPlaying ? '' : 'music-player-disc--paused'}${glassMode ? ' music-player-disc--glass' : ''}`}>
              <div className="music-player-disc-cover">
                {cover ? (
                  <img src={cover} alt={playable.name} />
                ) : (
                  <div className="music-player-disc-note">
                    {getPlayableNote(playable)}
                  </div>
                )}
              </div>
              <div className="music-player-disc-center" />
            </div>
          </div>
        </div>

        <div className="music-player-song-info">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="music-player-song-name">{playable.name}</div>
              <div className="music-player-song-artist">
                {getPlayableSubtitle(playable)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexShrink: 0, alignItems: 'center' }}>
              {isSongPlayable(playable) ? (
                <LikeButton songId={playable.id} likedPlaylistId={likedPlaylistId} />
              ) : null}
              {isMemoryRecordPlayable(playable) ? (
                <>
                  <button
                    type="button"
                    className="music-player-share-button"
                    aria-label="分享歌曲"
                    title="分享歌曲"
                    onClick={() => onOpenShareMemoryRecord?.(playable)}
                  >
                    <IconShare />
                  </button>
                  <button
                    type="button"
                    className="music-player-export-button"
                    aria-label="导出 MP3"
                    title="导出 MP3"
                    disabled={isExportingMp3}
                    onClick={() => { void handleExportMp3(); }}
                  >
                    {isExportingMp3 ? <span className="music-export-spinner" /> : <IconDownload />}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="music-player-more-button"
                aria-label="更多"
                onClick={() => {
                  if (isSongPlayable(playable)) {
                    onAddToPlaylist?.(playable.id);
                  }
                }}
              >
                <IconMore />
              </button>
            </div>
          </div>
        </div>

        {isSongPlayable(playable) || isMemoryRecordPlayable(playable) ? (
          <PlayerLyricsPanel
            songId={isSongPlayable(playable) ? playable.id : 0}
            currentTime={currentTime}
            settings={lyricSettings}
            onSettingsChange={onLyricSettingsChange}
            onSeekToTime={onSeekToTime}
            localLyrics={isMemoryRecordPlayable(playable) ? playable.lyrics : undefined}
            memoryRecord={isMemoryRecordPlayable(playable) ? playable : undefined}
            onSaveMemoryRecordLyricTiming={onSaveMemoryRecordLyricTiming}
          />
        ) : null}

        <div className="music-player-progress">
          <div
            ref={progressBarRef}
            className={`music-player-progress-bar ${isDragging ? 'dragging' : ''}`}
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            onPointerUp={handleProgressPointerUp}
            onPointerCancel={handleProgressPointerUp}
            style={{ touchAction: 'none' }}
          >
            <div className="music-player-progress-fill" style={{ width: `${isDragging ? dragPercent : progress}%` }}>
              <div className="music-player-progress-dot" />
            </div>
          </div>
          <div className="music-player-time">
            <span>
              {isDragging
                ? formatSeconds((dragPercent / 100) * displayDuration)
                : formatSeconds(currentTime)}
            </span>
            <span>{formatSeconds(displayDuration)}</span>
          </div>
        </div>

        <div className="music-player-controls">
          <div className="music-ctrl-btn" onClick={onPrev}><IconPrev /></div>
          <div className="music-ctrl-play" onClick={onTogglePlay}>{isPlaying ? <IconPause /> : <IconPlay />}</div>
          <div className="music-ctrl-btn" onClick={onNext}><IconNext /></div>
        </div>
      </div>

      {/* 皮肤选择器 */}
      {showSkinPicker ? (
        <SkinPicker
          skins={allSkins}
          activeSkinId={activeSkinId}
          onSelect={handleSkinSelect}
          onUpload={(file) => { void handleSkinUpload(file); }}
          onClose={() => setShowSkinPicker(false)}
        />
      ) : null}
    </div>
  );
};

const MiniPlayer = ({
  playable,
  isPlaying,
  progress,
  onOpen,
  onTogglePlay,
}: {
  playable: MusicPlayable | null;
  isPlaying: boolean;
  progress: number;
  onOpen: () => void;
  onTogglePlay: (event: React.MouseEvent) => void;
}) => {
  if (!playable) return null;

  return (
    <div
      className="music-mini-player"
      data-testid="music-mini-player"
      onClick={onOpen}
    >
      <CoverArt
        src={getPlayableCover(playable)}
        alt={playable.name}
        seed={playable.id}
        className={`music-mini-cover ${isPlaying ? '' : 'paused'}`}
        note={getPlayableNote(playable)}
        gradient={getPlayableFallbackGradient(playable)}
      />
      <div className="music-mini-info">
        <div className="music-mini-title">{playable.name} · {getPlayableSubtitle(playable)}</div>
        <div className="music-mini-progress-track"><div className="music-mini-progress-fill" style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="music-mini-controls">
        <div className="music-mini-btn" onClick={onTogglePlay}>{isPlaying ? <IconMiniPause /> : <IconMiniPlay />}</div>
        <div className="music-mini-btn"><IconPlaylist /></div>
      </div>
    </div>
  );
};

const AddToPlaylistModal = ({
  open,
  songId,
  playlists,
  onClose,
}: {
  open: boolean;
  songId: number | null;
  playlists: NeteasePlaylist[];
  onClose: () => void;
}) => {
  const [addingTo, setAddingTo] = useState<number | null>(null);

  if (!open || !songId) return null;

  const handleAdd = async (playlistId: number) => {
    if (addingTo) return;
    setAddingTo(playlistId);
    try {
      await addSongsToPlaylist(playlistId, [songId]);
      window.alert('收藏成功');
      onClose();
    } catch (err: unknown) {
      window.alert(`收藏失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAddingTo(null);
    }
  };

  return (
    <>
      <div className="music-skin-picker-backdrop" onClick={onClose} />
      <div className="music-skin-picker-panel" style={{ height: '65vh' }}>
        <div className="music-skin-picker-header">
          <div className="music-skin-picker-title">收藏到歌单</div>
          <button type="button" className="music-skin-picker-close" onClick={onClose}>×</button>
        </div>
        <div className="music-skin-picker-scroll" style={{ padding: '8px 0' }}>
          {playlists.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>没有可收藏的歌单，请先在网页端创建。</div>
          ) : playlists.map((playlist) => (
            <div
              key={playlist.id}
              style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12, cursor: 'pointer', opacity: addingTo === playlist.id ? 0.5 : 1 }}
              onClick={() => handleAdd(playlist.id)}
            >
              <div style={{ width: 44, height: 44, borderRadius: 6, flexShrink: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                {playlist.coverImgUrl ? <img src={playlist.coverImgUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{playlist.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{playlist.trackCount}首</div>
              </div>
              {addingTo === playlist.id && <div className="music-inline-spinner" />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default function MusicApp() {
  const { closeApp, registerBackHandler, appParams } = useApp();
  const { addToast } = useOS();
  const { currentSong, isPlaying, currentTime, duration, progress, playSong, togglePlay, playNext, playPrev, seek, seekToTime } = useAudioPlayer();

  const [rootPage, setRootPage] = useState<RootPage>('discover');
  const [lastPrimaryPage, setLastPrimaryPage] = useState<PrimaryPage>('discover');
  const [detailStack, setDetailStack] = useState<DetailView[]>([]);
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [showQrLogin, setShowQrLogin] = useState(false);
  const [addToPlaylistSongId, setAddToPlaylistSongId] = useState<number | null>(null);
  const [shareModalPlayable, setShareModalPlayable] = useState<MemoryRecordPlayable | null>(null);
  const [isSharingMemoryRecord, setIsSharingMemoryRecord] = useState(false);

  // 预加载皮肤
  useEffect(() => {
    let preloaded = false;
    if (preloaded || typeof window === 'undefined') return;
    preloaded = true;
    for (const skin of BUILTIN_SKINS) {
      if (skin.file) {
        const img = new Image();
        img.src = skin.file;
      }
    }
  }, []);

  const [isLoggedIn, setIsLoggedIn] = useState(() => isMusicLoggedIn());
  const [account, setAccount] = useState<NeteaseUserAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountReloadKey, setAccountReloadKey] = useState(0);
  const [userPlaylists, setUserPlaylists] = useState<NeteasePlaylist[]>([]);
  const [userPlaylistsLoading, setUserPlaylistsLoading] = useState(false);
  const [userPlaylistsError, setUserPlaylistsError] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<NeteasePlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);
  const [memoryRecordPlayables, setMemoryRecordPlayables] = useState<MemoryRecordPlayable[]>([]);
  const [dailySongs, setDailySongs] = useState<NeteaseSong[]>([]);
  const [dailySongsLoading, setDailySongsLoading] = useState(false);
  const [playlistPreview, setPlaylistPreview] = useState<PlaylistPreviewState>({
    playlist: null,
    tracks: [],
    loading: false,
    error: null,
  });

  const [keyword, setKeyword] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>(() => readSearchHistory());
  const [activeSearchTab, setActiveSearchTab] = useState<MusicSearchTab>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchBundle, setSearchBundle] = useState<MusicSearchBundle>({ keyword: '', sections: [] });
  const [searchSections, setSearchSections] = useState<Partial<Record<SearchableMusicTab, MusicSearchSection>>>({});
  const searchRequestIdRef = useRef(0);

  const [playlistDetails, setPlaylistDetails] = useState<Record<number, Loadable<NeteasePlaylist>>>({});
  const [albumDetails, setAlbumDetails] = useState<Record<number, Loadable<NeteaseAlbumSummary>>>({});
  const [artistDetails, setArtistDetails] = useState<Record<number, Loadable<ArtistDetailData>>>({});
  const [radioDetails, setRadioDetails] = useState<Record<number, Loadable<RadioDetailData>>>({});
  const [programDetails, setProgramDetails] = useState<Record<number, Loadable<ProgramDetailData>>>({});
  const [lyricSettings, setLyricSettings] = useState<FloatingLyricsSettings>(() => readFloatingLyricsSettings());

  const activeDetail = detailStack.length > 0 ? detailStack[detailStack.length - 1] : null;
  const displayedCurrentSong = useMemo<MusicPlayable | null>(() => {
    if (!isMemoryRecordPlayable(currentSong)) return currentSong;
    return memoryRecordPlayables.find((record) => record.recordId === currentSong.recordId) || currentSong;
  }, [currentSong, memoryRecordPlayables]);

  useEffect(() => {
    const handleStorage = () => {
      setLyricSettings(readFloatingLyricsSettings());
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  function handleLyricSettingsChange(patch: Partial<FloatingLyricsSettings>): void {
    setLyricSettings(updateFloatingLyricsSettings(patch));
  }

  function commitSearchHistory(term: string): void {
    const trimmed = term.trim();
    if (!trimmed) return;

    setSearchHistory((previous) => {
      const next = [trimmed, ...previous.filter((item) => item !== trimmed)].slice(0, 8);
      writeSearchHistory(next);
      return next;
    });
  }

  function clearSearchHistory(): void {
    setSearchHistory([]);
    writeSearchHistory([]);
  }

  async function executeSearch(term: string, tab: MusicSearchTab, commitHistoryNow = false): Promise<void> {
    const trimmed = term.trim();
    const requestId = ++searchRequestIdRef.current;

    if (!trimmed) {
      setIsSearching(false);
      setSearchBundle({ keyword: '', sections: [] });
      setSearchSections({});
      return;
    }

    if (commitHistoryNow) {
      commitSearchHistory(trimmed);
    }

    setIsSearching(true);

    try {
      if (tab === 'all') {
        const bundle = await searchMusicAll(trimmed);
        if (requestId !== searchRequestIdRef.current) return;

        setSearchBundle(bundle);
        setSearchSections((previous) => {
          const next = { ...previous };
          bundle.sections.forEach((section) => {
            if (section.tab !== 'all') {
              next[section.tab] = section;
            }
          });
          return next;
        });
      } else {
        const section = await searchMusicByType(trimmed, tab, 30, 0);
        if (requestId !== searchRequestIdRef.current) return;

        setSearchSections((previous) => ({
          ...previous,
          [tab]: section,
        }));
      }
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return;

      const message = error instanceof Error ? error.message : '搜索失败，请稍后重试';
      if (tab === 'all') {
        setSearchBundle({
          keyword: trimmed,
          sections: (['song', 'playlist', 'album', 'artist', 'radio', 'program'] as SearchableMusicTab[]).map((sectionTab) => ({
            tab: sectionTab,
            title: MUSIC_SEARCH_TAB_LABELS[sectionTab],
            items: [],
            total: 0,
            error: message,
          })),
        });
      } else {
        setSearchSections((previous) => ({
          ...previous,
          [tab]: {
            tab,
            title: MUSIC_SEARCH_TAB_LABELS[tab],
            items: [],
            total: 0,
            error: message,
          },
        }));
      }
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  }

  function pushDetail(detail: DetailView): void {
    setDetailStack((previous) => [...previous, detail]);
  }

  function popDetail(): void {
    setDetailStack((previous) => previous.slice(0, -1));
  }

  function openSearch(): void {
    setLastPrimaryPage(rootPage === 'profile' ? 'profile' : 'discover');
    setRootPage('search');
  }

  function closeSearch(): void {
    setDetailStack([]);
    setRootPage(lastPrimaryPage);
  }

  function selectPrimaryPage(page: PrimaryPage): void {
    setLastPrimaryPage(page);
    setDetailStack([]);
    setRootPage(page);
  }

  function handlePlayableClick(playable: MusicPlayable, queue?: MusicPlayable[]): void {
    void playSong(playable, queue);
    setShowFullPlayer(true);
  }

  function handleSongClick(song: NeteaseSong, queue?: NeteaseSong[]): void {
    handlePlayableClick(song, queue);
  }

  function handleProgramClick(program: NeteaseDjProgram, queue?: NeteaseDjProgram[]): void {
    handlePlayableClick(program, queue);
  }

  function handleMemoryRecordClick(record: MemoryRecordPlayable, queue?: MemoryRecordPlayable[]): void {
    handlePlayableClick(record, queue);
  }

  async function handleExportMemoryRecordMp3(record: MemoryRecordPlayable): Promise<void> {
    try {
      await exportMemoryRecordMp3(record);
      addToast('MP3 已导出', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MP3 导出失败';
      addToast(message, 'error');
    }
  }

  async function handleShareMemoryRecordPoster(record: MemoryRecordPlayable): Promise<void> {
    setIsSharingMemoryRecord(true);
    try {
      const result = await shareMemoryRecordPoster(record);
      setShareModalPlayable(null);
      addToast(result.method === 'download' ? '分享海报已下载' : '已打开系统分享', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '分享失败';
      addToast(message, 'error');
    } finally {
      setIsSharingMemoryRecord(false);
    }
  }

  async function saveMemoryRecordLyricTiming(recordId: string, timing: MemoryRecordLyricTiming | undefined): Promise<void> {
    const record = await DB.getMemoryRecordById(recordId);
    if (!record) throw new Error('没有找到这张回忆唱片');

    const nextRecord = {
      ...record,
      lyricTiming: timing,
      updatedAt: Date.now(),
    };

    await DB.saveMemoryRecord(nextRecord);
    const nextPlayable = memoryRecordToPlayable(nextRecord);
    setMemoryRecordPlayables((previous) => previous.map((item) => (
      item.recordId === recordId ? nextPlayable : item
    )));
  }

  useEffect(() => {
    let cancelled = false;

    async function loadMemoryRecords(): Promise<void> {
      try {
        const records = await DB.getMemoryRecords();
        if (cancelled) return;
        setMemoryRecordPlayables(
          records
            .filter(hasPlayableMemoryRecordAudio)
            .map(memoryRecordToPlayable),
        );
      } catch (error) {
        console.warn('[MusicApp] Failed to load memory records:', error);
      }
    }

    void loadMemoryRecords();
    window.addEventListener('focus', loadMemoryRecords);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', loadMemoryRecords);
    };
  }, []);

  async function loadPlaylistPreview(playlist: NeteasePlaylist): Promise<void> {
    setPlaylistPreview({ playlist, tracks: [], loading: true, error: null });

    try {
      const detail = await getPlaylistDetail(playlist.id);
      const tracks = detail?.tracks?.slice(0, 12) || [];
      setPlaylistPreview({
        playlist: detail || playlist,
        tracks,
        loading: false,
        error: tracks.length > 0 ? null : '这个歌单暂时没有可预览的歌曲。',
      });
    } catch (error) {
      setPlaylistPreview({
        playlist,
        tracks: [],
        loading: false,
        error: error instanceof Error ? error.message : '歌单详情获取失败',
      });
    }
  }

  async function loadPlaylistDetail(id: number): Promise<void> {
    setPlaylistDetails((previous) => ({
      ...previous,
      [id]: {
        data: previous[id]?.data ?? null,
        loading: true,
        error: null,
      },
    }));

    try {
      const detail = await getPlaylistDetail(id);
      setPlaylistDetails((previous) => ({
        ...previous,
        [id]: {
          data: detail,
          loading: false,
          error: detail ? null : '暂时无法读取这个歌单。',
        },
      }));
    } catch (error) {
      setPlaylistDetails((previous) => ({
        ...previous,
        [id]: {
          data: previous[id]?.data ?? null,
          loading: false,
          error: error instanceof Error ? error.message : '歌单详情获取失败',
        },
      }));
    }
  }

  async function loadAlbumDetail(id: number): Promise<void> {
    setAlbumDetails((previous) => ({
      ...previous,
      [id]: {
        data: previous[id]?.data ?? null,
        loading: true,
        error: null,
      },
    }));

    try {
      const detail = await getAlbumDetail(id);
      setAlbumDetails((previous) => ({
        ...previous,
        [id]: {
          data: detail,
          loading: false,
          error: detail ? null : '暂时无法读取这张专辑。',
        },
      }));
    } catch (error) {
      setAlbumDetails((previous) => ({
        ...previous,
        [id]: {
          data: previous[id]?.data ?? null,
          loading: false,
          error: error instanceof Error ? error.message : '专辑详情获取失败',
        },
      }));
    }
  }

  async function loadArtistDetail(id: number): Promise<void> {
    setArtistDetails((previous) => ({
      ...previous,
      [id]: {
        data: previous[id]?.data ?? null,
        loading: true,
        error: null,
      },
    }));

    try {
      const [artist, topSongs, albums, desc] = await Promise.all([
        getArtistDetail(id),
        getArtistTopSongs(id),
        getArtistAlbums(id, 30, 0),
        getArtistDesc(id).catch(() => ''),
      ]);

      const data = artist ? {
        artist,
        topSongs,
        albums,
        description: desc || artist.description || artist.briefDesc || '',
      } : null;

      setArtistDetails((previous) => ({
        ...previous,
        [id]: {
          data,
          loading: false,
          error: data ? null : '暂时无法读取这位歌手的信息。',
        },
      }));
    } catch (error) {
      setArtistDetails((previous) => ({
        ...previous,
        [id]: {
          data: previous[id]?.data ?? null,
          loading: false,
          error: error instanceof Error ? error.message : '歌手详情获取失败',
        },
      }));
    }
  }

  async function loadRadioDetail(id: number): Promise<void> {
    setRadioDetails((previous) => ({
      ...previous,
      [id]: {
        data: previous[id]?.data ?? null,
        loading: true,
        error: null,
      },
    }));

    try {
      const [radio, programs] = await Promise.all([
        getDjRadioDetail(id),
        getDjPrograms(id, 30, 0, false),
      ]);

      const data = radio ? { radio, programs } : null;
      setRadioDetails((previous) => ({
        ...previous,
        [id]: {
          data,
          loading: false,
          error: data ? null : '暂时无法读取这档播客。',
        },
      }));
    } catch (error) {
      setRadioDetails((previous) => ({
        ...previous,
        [id]: {
          data: previous[id]?.data ?? null,
          loading: false,
          error: error instanceof Error ? error.message : '播客台详情获取失败',
        },
      }));
    }
  }

  async function loadProgramDetail(id: number): Promise<void> {
    setProgramDetails((previous) => ({
      ...previous,
      [id]: {
        data: previous[id]?.data ?? null,
        loading: true,
        error: null,
      },
    }));

    try {
      const program = await getDjProgramDetail(id);
      setProgramDetails((previous) => ({
        ...previous,
        [id]: {
          data: program ? { program } : null,
          loading: false,
          error: program ? null : '暂时无法读取这期节目。',
        },
      }));
    } catch (error) {
      setProgramDetails((previous) => ({
        ...previous,
        [id]: {
          data: previous[id]?.data ?? null,
          loading: false,
          error: error instanceof Error ? error.message : '声音详情获取失败',
        },
      }));
    }
  }

  function openPlaylistDetail(playlist: NeteasePlaylist): void {
    pushDetail({ type: 'playlistDetail', id: playlist.id, seed: playlist });
    if (!playlistDetails[playlist.id]?.data && !playlistDetails[playlist.id]?.loading) {
      void loadPlaylistDetail(playlist.id);
    }
  }

  function openAlbumDetail(album: NeteaseAlbumSummary): void {
    pushDetail({ type: 'albumDetail', id: album.id, seed: album });
    if (!albumDetails[album.id]?.data && !albumDetails[album.id]?.loading) {
      void loadAlbumDetail(album.id);
    }
  }

  function openArtistDetail(artist: NeteaseArtistSummary): void {
    pushDetail({ type: 'artistDetail', id: artist.id, seed: artist });
    if (!artistDetails[artist.id]?.data && !artistDetails[artist.id]?.loading) {
      void loadArtistDetail(artist.id);
    }
  }

  function openRadioDetail(radio: NeteaseDjRadio): void {
    pushDetail({ type: 'radioDetail', id: radio.id, seed: radio });
    if (!radioDetails[radio.id]?.data && !radioDetails[radio.id]?.loading) {
      void loadRadioDetail(radio.id);
    }
  }

  function openProgramDetail(program: NeteaseDjProgram): void {
    pushDetail({ type: 'programDetail', id: program.id, seed: program });
    if (!programDetails[program.id]?.data && !programDetails[program.id]?.loading) {
      void loadProgramDetail(program.id);
    }
  }

  // ── 推荐歌单：登录用每日推荐，未登录用个性化推荐，都失败回退到热门 ──
  useEffect(() => {
    let active = true;

    const loadRecommendations = async () => {
      setPlaylistsLoading(true);
      setPlaylistsError(null);

      try {
        let nextPlaylists: NeteasePlaylist[];

        if (isLoggedIn) {
          // 优先用每日推荐
          try {
            nextPlaylists = await getRecommendResource();
          } catch {
            // 降级到个性化推荐
            nextPlaylists = await getPersonalizedPlaylists(6);
          }
        } else {
          // 未登录：个性化推荐（不需要 cookie）
          try {
            nextPlaylists = await getPersonalizedPlaylists(6);
          } catch {
            // 最终降级到热门
            nextPlaylists = await getTopPlaylists('全部', 6);
          }
        }

        if (!active) return;
        setPlaylists(nextPlaylists.slice(0, 6));
      } catch (error) {
        if (!active) return;
        setPlaylists([]);
        setPlaylistsError(error instanceof Error ? error.message : '推荐歌单加载失败');
      } finally {
        if (active) setPlaylistsLoading(false);
      }
    };

    void loadRecommendations();
    return () => { active = false; };
  }, [isLoggedIn]);

  // ── 每日推荐歌曲（仅登录时加载） ──
  useEffect(() => {
    if (!isLoggedIn) {
      setDailySongs([]);
      return;
    }

    let active = true;
    setDailySongsLoading(true);

    getRecommendSongs()
      .then((songs) => {
        if (active) setDailySongs(songs);
      })
      .catch(() => {
        if (active) setDailySongs([]);
      })
      .finally(() => {
        if (active) setDailySongsLoading(false);
      });

    return () => { active = false; };
  }, [isLoggedIn]);

  useEffect(() => {
    if (appParams?.autoShowPlayer) {
      setShowFullPlayer(true);
    }
  }, [appParams]);

  useEffect(() => {
    if (playlists.length === 0 || playlistPreview.playlist) return;
    void loadPlaylistPreview(playlists[0]);
  }, [playlists, playlistPreview.playlist]);

  useEffect(() => {
    if (!isLoggedIn) {
      setAccount(null);
      setAccountLoading(false);
      setAccountError(null);
      return;
    }

    // account 信息在任何页面都可能需要（如收藏到歌单），不再限制只在 profile 页加载

    let active = true;
    setAccountLoading(true);
    setAccountError(null);

    const loadAccount = async () => {
      try {
        const nextAccount = await getUserAccount();
        if (!active) return;
        if (!nextAccount) throw new Error('没有拿到账号资料，请重新登录一次。');
        setAccount(nextAccount);
      } catch (error) {
        if (!active) return;
        setAccount(null);
        setAccountError(error instanceof Error ? error.message : '账号资料获取失败');
      } finally {
        if (active) {
          setAccountLoading(false);
        }
      }
    };

    void loadAccount();
    return () => { active = false; };
  }, [accountReloadKey, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !account) {
      setUserPlaylists([]);
      setUserPlaylistsLoading(false);
      setUserPlaylistsError(null);
      return;
    }

    let active = true;
    setUserPlaylistsLoading(true);
    setUserPlaylistsError(null);

    getUserPlaylists(account.userId)
      .then((playlists) => {
        if (!active) return;
        setUserPlaylists(playlists);
      })
      .catch((error) => {
        if (!active) return;
        setUserPlaylists([]);
        setUserPlaylistsError(error instanceof Error ? error.message : '歌单加载失败');
      })
      .finally(() => {
        if (active) {
          setUserPlaylistsLoading(false);
        }
      });

    return () => { active = false; };
  }, [account, isLoggedIn]);

  useEffect(() => {
    if (rootPage !== 'search') return;

    const trimmed = keyword.trim();
    if (!trimmed) {
      setIsSearching(false);
      setSearchBundle({ keyword: '', sections: [] });
      setSearchSections({});
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void executeSearch(trimmed, activeSearchTab);
    }, 320);

    return () => window.clearTimeout(timeoutId);
  }, [activeSearchTab, keyword, rootPage]);

  useEffect(() => registerBackHandler(() => {
    if (showQrLogin) {
      setShowQrLogin(false);
      return true;
    }
    if (showFullPlayer) {
      setShowFullPlayer(false);
      return true;
    }
    if (detailStack.length > 0) {
      setDetailStack((previous) => previous.slice(0, -1));
      return true;
    }
    if (rootPage === 'search') {
      setRootPage(lastPrimaryPage);
      return true;
    }
    return false;
  }), [detailStack.length, lastPrimaryPage, registerBackHandler, rootPage, showFullPlayer, showQrLogin]);

  const suggestionKeywords = useMemo(() => {
    const raw = [
      ...playlists.map((playlist) => playlist.name),
      ...playlistPreview.tracks.slice(0, 4).map((song) => song.name),
    ];
    const merged = Array.from(new Set(raw.filter(Boolean)));
    if (merged.length > 0) {
      return merged.slice(0, 8);
    }
    return ['周杰伦', '五月天', '故事FM', '机核', '陈奕迅', '薛之谦'];
  }, [playlistPreview.tracks, playlists]);

  const shouldHideChrome = showFullPlayer || rootPage === 'search' || Boolean(activeDetail);
  const showRootExitButton = !showFullPlayer && !showQrLogin && !activeDetail && rootPage !== 'search';

  return (
    <div className="music-app">
      {rootPage === 'discover' ? (
        <DiscoverPage
          playlists={playlists}
          playlistsLoading={playlistsLoading}
          playlistsError={playlistsError}
          previewPlaylist={playlistPreview.playlist}
          previewTracks={playlistPreview.tracks}
          previewLoading={playlistPreview.loading}
          previewError={playlistPreview.error}
          currentPlayable={displayedCurrentSong}
          memoryRecords={memoryRecordPlayables}
          onSearch={openSearch}
          onCloseApp={closeApp}
          showExitButton={showRootExitButton}
          onPlaylistSelect={(playlist) => { void loadPlaylistPreview(playlist); }}
          onSongClick={handleSongClick}
          onMemoryRecordClick={handleMemoryRecordClick}
          dailySongs={dailySongs}
          dailySongsLoading={dailySongsLoading}
          isLoggedIn={isLoggedIn}
        />
      ) : null}

      {rootPage === 'search' && !activeDetail ? (
        <SearchPage
          keyword={keyword}
          activeTab={activeSearchTab}
          isSearching={isSearching}
          searchBundle={searchBundle}
          searchSections={searchSections}
          searchHistory={searchHistory}
          suggestions={suggestionKeywords}
          currentPlayable={displayedCurrentSong}
          onKeywordChange={setKeyword}
          onTabChange={(tab) => setActiveSearchTab(tab)}
          onBack={closeSearch}
          onSubmit={() => { void executeSearch(keyword, activeSearchTab, true); }}
          onClearKeyword={() => setKeyword('')}
          onClearHistory={clearSearchHistory}
          onHistoryClick={(term) => {
            setKeyword(term);
            commitSearchHistory(term);
          }}
          onSongClick={handleSongClick}
          onOpenPlaylist={openPlaylistDetail}
          onOpenAlbum={openAlbumDetail}
          onOpenArtist={openArtistDetail}
          onOpenRadio={openRadioDetail}
          onOpenProgram={openProgramDetail}
        />
      ) : null}

      {rootPage === 'profile' ? (
        <ProfilePage
          account={account}
          isLoading={accountLoading}
          error={accountError}
          isLoggedIn={isLoggedIn}
          userPlaylists={userPlaylists}
          userPlaylistsLoading={userPlaylistsLoading}
          userPlaylistsError={userPlaylistsError}
          onOpenLogin={() => setShowQrLogin(true)}
          onLogout={() => {
            clearMusicCookie();
            setIsLoggedIn(false);
            setAccount(null);
            setAccountError(null);
            setShowQrLogin(false);
          }}
          onCloseApp={closeApp}
          onSearch={openSearch}
          showExitButton={showRootExitButton}
          onOpenPlaylist={openPlaylistDetail}
        />
      ) : null}

      {activeDetail?.type === 'playlistDetail' ? (
        <PlaylistDetailPage
          state={playlistDetails[activeDetail.id]}
          seed={activeDetail.seed}
          currentPlayable={displayedCurrentSong}
          onBack={popDetail}
          onSongClick={handleSongClick}
        />
      ) : null}

      {activeDetail?.type === 'albumDetail' ? (
        <AlbumDetailPage
          state={albumDetails[activeDetail.id]}
          seed={activeDetail.seed}
          currentPlayable={displayedCurrentSong}
          onBack={popDetail}
          onSongClick={handleSongClick}
        />
      ) : null}

      {activeDetail?.type === 'artistDetail' ? (
        <ArtistDetailPage
          state={artistDetails[activeDetail.id]}
          seed={activeDetail.seed}
          currentPlayable={displayedCurrentSong}
          onBack={popDetail}
          onSongClick={handleSongClick}
          onOpenAlbum={openAlbumDetail}
        />
      ) : null}

      {activeDetail?.type === 'radioDetail' ? (
        <RadioDetailPage
          state={radioDetails[activeDetail.id]}
          seed={activeDetail.seed}
          currentPlayable={displayedCurrentSong}
          onBack={popDetail}
          onProgramClick={handleProgramClick}
        />
      ) : null}

      {activeDetail?.type === 'programDetail' ? (
        <ProgramDetailPage
          state={programDetails[activeDetail.id]}
          seed={activeDetail.seed}
          onBack={popDetail}
          onPlay={handleProgramClick}
          onOpenRadio={openRadioDetail}
        />
      ) : null}

      {displayedCurrentSong && !shouldHideChrome ? (
        <MiniPlayer
          playable={displayedCurrentSong}
          isPlaying={isPlaying}
          progress={progress}
          onOpen={() => setShowFullPlayer(true)}
          onTogglePlay={(event) => {
            event.stopPropagation();
            togglePlay();
          }}
        />
      ) : null}

      {!shouldHideChrome ? (
        <div className="music-tabbar">
          <div className={`music-tab-item ${rootPage === 'discover' ? 'active' : ''}`} onClick={() => selectPrimaryPage('discover')}>
            <IconHome active={rootPage === 'discover'} />
            <span>首页</span>
          </div>
          <div className="music-tab-item" onClick={openSearch}>
            <IconSearchTab active={false} />
            <span>搜索</span>
          </div>
          <div className={`music-tab-item ${rootPage === 'profile' ? 'active' : ''}`} onClick={() => selectPrimaryPage('profile')}>
            <IconUser active={rootPage === 'profile'} />
            <span>我的</span>
          </div>
        </div>
      ) : null}

      {showFullPlayer && displayedCurrentSong ? (
        <FullPlayer
          playable={displayedCurrentSong}
          isPlaying={isPlaying}
          progress={progress}
          currentTime={currentTime}
          duration={duration}
          lyricSettings={lyricSettings}
          likedPlaylistId={(() => { const uid = account?.userId; if (!uid) return null; const first = userPlaylists.find(p => p.creator?.userId === uid); return first?.id ?? null; })()}
          onClose={() => setShowFullPlayer(false)}
          onLyricSettingsChange={handleLyricSettingsChange}
          onTogglePlay={togglePlay}
          onPrev={() => { void playPrev(); }}
          onNext={() => { void playNext(); }}
          onSeek={seek}
          onSeekToTime={seekToTime}
          onAddToPlaylist={setAddToPlaylistSongId}
          onExportMemoryRecord={handleExportMemoryRecordMp3}
          onOpenShareMemoryRecord={setShareModalPlayable}
          onSaveMemoryRecordLyricTiming={saveMemoryRecordLyricTiming}
        />
      ) : null}

      <QrLoginModal
        open={showQrLogin}
        onClose={() => setShowQrLogin(false)}
        onSuccess={() => {
          setIsLoggedIn(true);
          setAccount(null);
          setAccountError(null);
          setAccountReloadKey((value) => value + 1);
          setLastPrimaryPage('profile');
          setRootPage('profile');
        }}
      />

      <AddToPlaylistModal
        open={addToPlaylistSongId !== null}
        songId={addToPlaylistSongId}
        playlists={userPlaylists.filter((p) => account && p.creator?.userId === account.userId)}
        onClose={() => setAddToPlaylistSongId(null)}
      />

      <MemoryRecordShareModal
        playable={shareModalPlayable}
        isSharing={isSharingMemoryRecord}
        onClose={() => setShareModalPlayable(null)}
        onShare={() => {
          if (shareModalPlayable) {
            void handleShareMemoryRecordPoster(shareModalPlayable);
          }
        }}
      />
    </div>
  );
}
