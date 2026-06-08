import React,{ useState,useEffect,useRef,useMemo } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { AppID,CharacterProfile,GalleryImage,PhoneDesktopAppearance,PhoneEvidence,PhoneCustomApp } from '../types';
import { ChatPrompts } from '../utils/chatPrompts';
import Modal from '../components/os/Modal';
import { extractContent, extractJson, safeResponseJson } from '../utils/safeApi';
import { getFiniteMessageIds, removePhoneRecordsLinkedToMessageIds } from '../utils/phoneRecordSync';
import { getGalleryImageDisplayUrl,resolveGalleryImageOriginalUrl } from '../utils/generatedImageStorage';
import { searchSongs } from '../utils/musicService';
import { loadCharacterGoals } from '../utils/goalService';
import { getEmbeddingConfig } from '../utils/runtimeConfig';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import type { NeteaseSong } from '../types/music';
import {
    BowlFood,
    Camera,
    ChatTeardrop,
    GearSix,
    MusicNote,
    Phone,
    Plus,
    ShoppingBagOpen,
    WifiHigh,
    type Icon,
} from '@phosphor-icons/react';
// === [Deprecated] 高德地图 POI 搜索已因额度耗尽停用，外卖商家改由大模型生成 ===
// import { searchNearbyRestaurants } from '../utils/mapService';
import MeituanTakeoutCard from '../components/chat/cards/phone/MeituanTakeoutCard';
import DesktopMusicWidget, { DEFAULT_MUSIC_CONFIG, MusicSkinPicker, useMusicConfig } from './DesktopMusicWidget';

// 朋友圈封面背景图池 —— 每次进入随机选一张
const MOMENTS_BG_POOL = [
    'https://i.postimg.cc/FKHSBpn0/Camera-1040g3k031roibveui4405pjvpo8gu1m2pj5m6bg.jpg',
    'https://i.postimg.cc/0NySBnHp/Camera-XHS-17719469368011040g2sg31dsqqr5ngccg5o6it4n098c9sr3goe0.jpg',
    'https://i.postimg.cc/W41ZH8fG/Camera-XHS-17719472040941040g2sg31enohhbkmi7g5pu896g399ls9l2jb1o.jpg',
    'https://i.postimg.cc/5yYqkgjj/Camera-XHS-17719473891901040g00831dne1qidge305o3i8irg8p0lbup6im0.jpg',
    'https://i.postimg.cc/prhY1Crw/Camera-XHS-17719479279871040g2sg30ttugsjr4m605ojdbvn8d1ctvlghth8.jpg',
    'https://i.postimg.cc/rs0CYjzK/mmexport1771947836221.jpg',
];

export const MAX_PHONE_RECORDS_PER_APP = 80;
export const MAX_PHONE_RECORDS_TOTAL = 640;
export const MAX_PHONE_VISIBLE_RECORDS = 60;
export const MAX_PHONE_TITLE_CHARS = 96;
export const MAX_PHONE_DETAIL_CHARS = 2400;
export const MAX_PHONE_CHAT_DETAIL_CHARS = 6000;
const CHECKPHONE_LLM_MAX_TOKENS = 65536;
const MAX_PHONE_META_CHARS = 160;
const MAX_CHAT_DETAIL_LINES_RENDERED = 120;
const RECORD_DELETE_LONG_PRESS_MS = 650;
const RECORD_DELETE_MOVE_TOLERANCE = 10;
const RECORD_DELETE_CLICK_SUPPRESS_MS = 700;
const NETEASE_MUSIC_RECORD_TYPE = 'netease_music';

export const NETEASE_MUSIC_PROMPT = `用户正在查看你网易云音乐的「个人主页」。请基于你的人设，生成主页内容，泄露你不会明说的情绪与生活。

输出一个 JSON 对象：

1. profile（资料）：
   - nickname：网易云昵称（贴合性格，不一定真名）
   - level：等级数字（1-10）
   - signature：个性签名一句话（最透性格/心境的一句）
   - playCount：累计听歌总数（整数）

2. playlists（歌单，2-3 个，可含一个"我喜欢的音乐"红心歌单）：
   - name：歌单名（重点！最能泄露心思，贴合性格，别太直白）
   - count：歌单内歌曲总数（整数，可大于下面列出的）
   - songs：该歌单里 10-13 首歌：
       - song / artist：真实存在、网易云可搜到的歌（官方歌名+主要演唱者，避免 live/remix/翻自）
       - tag：状态（如"单曲循环 12 次""红心 / 2015年秋""昨夜 23:45 播放"），可空 ""
       - comment：你在这首歌下留过的话或此刻的心声

要求：选歌、签名、歌单名、批注都贴合人设与处境；所有歌曲必须真实可搜到；批注宁缺毋滥，留白比硬写更有张力。
只输出 JSON，不要前后缀/解释/代码块包裹。
格式：
{
  "profile": { "nickname": "", "level": 8, "signature": "", "playCount": 4821 },
  "playlists": [
    { "name": "", "count": 23, "songs": [
      { "song": "", "artist": "", "tag": "", "comment": "" }
    ]}
  ]
}`;

const limitPhoneText = (value: string, maxChars: number): string => {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars).trimEnd()}...`;
};

const normalizePhoneText = (value: unknown, fallback = '', maxChars = MAX_PHONE_DETAIL_CHARS): string => {
    let normalized = fallback;

    if (value == null) return fallback;
    if (typeof value === 'string') normalized = value.trim() || fallback;
    else if (typeof value === 'number' || typeof value === 'boolean') normalized = String(value);

    else if (Array.isArray(value)) {
        const parts = value.map(item => normalizePhoneText(item, '')).filter(Boolean);
        normalized = parts.join('; ') || fallback;
    }

    else if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const candidate = record.text ?? record.content ?? record.name ?? record.label ?? record.title ?? record.detail ?? record.status ?? record.amount ?? record.value ?? record.shop;
        if (candidate !== undefined && candidate !== value) {
            const normalized = normalizePhoneText(candidate, '');
            if (normalized) return limitPhoneText(normalized, maxChars);
        }

        try {
            normalized = JSON.stringify(value);
        } catch {
            normalized = fallback;
        }
    }

    return limitPhoneText(normalized, maxChars);
};

const normalizeOptionalPhoneText = (value: unknown, maxChars = MAX_PHONE_META_CHARS): string | undefined => {
    const normalized = normalizePhoneText(value, '', maxChars);
    return normalized || undefined;
};

const normalizePhoneMediaSource = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    if (normalized.startsWith('data:') && (!normalized.includes(',') || normalized.endsWith('...'))) {
        return undefined;
    }
    return normalized || undefined;
};

const normalizeTimestamp = (value: unknown): number => {
    const timestamp = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
};

type SelectTargetMode = 'live' | 'recent' | 'idle';

interface SelectTargetMeta {
    character: CharacterProfile;
    mode: SelectTargetMode;
    fingerprint: string;
    statusLabel: string;
    peekLabel: string;
    actionLabel: string;
    signalStrength: number;
    recordsCount: number;
    appCount: number;
    avatarGradient: string;
}

interface AccessOverlayState {
    name: string;
    status: 'connecting' | 'granted';
}

interface DesktopPhotoCard {
    id: string;
    src: string;
    caption: string;
    timestamp: number;
    isFallback?: boolean;
    isCustom?: boolean;
}

interface DesktopAppEntry {
    id: string;
    label: string;
    icon?: Icon;
    emoji?: string;
    customIcon?: string;
    badge?: number | 'dot';
    danger?: boolean;
    isUtility?: boolean;
    customAppId?: string;
    onClick: () => void;
    onDelete?: () => void;
}

interface DesktopCoreAppConfig {
    id: string;
    label: string;
    icon: Icon;
    recordType?: string;
}

interface NeteaseMusicTrace {
    song: string;
    artist: string;
    tag: string;
    comment: string;
}

interface NeteaseMusicProfile {
    nickname: string;
    level: number;
    signature: string;
    playCount: number;
}

interface NeteaseMusicPlaylist {
    name: string;
    count: number;
    songs: NeteaseMusicTrace[];
}

interface NeteaseMusicProfilePayload {
    profile: NeteaseMusicProfile;
    playlists: NeteaseMusicPlaylist[];
}

interface NeteaseMusicPlaylistView {
    key: string;
    name: string;
    count: number;
    index: number;
    records: PhoneEvidence[];
}

const CHECKPHONE_AVATAR_GRADIENTS = [
    'radial-gradient(120% 120% at 30% 20%, #3a4d6e, #161d2b)',
    'radial-gradient(120% 120% at 70% 10%, #4d4036, #1f1813)',
    'radial-gradient(120% 120% at 40% 30%, #3b4a44, #161d1a)',
    'radial-gradient(120% 120% at 60% 20%, #4a3a4d, #1c151f)',
    'radial-gradient(120% 120% at 35% 15%, #4f4a2f, #1a1810)',
];

const CHECKPHONE_DESKTOP_CAPTIONS = ['午后', '夜色', '初夏'];
const CHECKPHONE_DESKTOP_PHOTO_SLOT_COUNT = 3;
const CHECKPHONE_DESKTOP_APP_PAGE_SIZE = 8;
const SHIGUANG_CAMERA_RECORD_TYPE = 'shiguang_camera';
const SHIGUANG_CAMERA_LABEL = '相机';
const SHIGUANG_CAMERA_MAX_SELECTION = 6;
const SHIGUANG_CAMERA_MAX_IMAGE_EDGE = 1280;
const SHIGUANG_CAMERA_IMAGE_QUALITY = 0.82;
const SHIGUANG_CAMERA_COMMENT_MAX_CHARS = MAX_PHONE_DETAIL_CHARS;
const SHIGUANG_CAMERA_COMMENT_BUBBLE_CHARS = 56;
const SHIGUANG_CAMERA_COMMENT_TIMESTAMP_PATTERN = /(?:^|\n)\s*(?:[\[【]\s*)?(?:(?:\d{4}[-/年]\d{1,2}[-/月]\d{1,2}(?:日)?|(?:今天|昨日|昨天|前天))[\sT]*(?:\d{1,2}:\d{2}(?::\d{2})?)?|(?:\d{1,2}:\d{2}(?::\d{2})?))(?:\s*[\]】])?\s*/g;
const SHIGUANG_CAMERA_LITERAL_LINEBREAK_PATTERN = /(?:\\r\\n|\\n+|\/r\/n|\/n+|\\r+|\/r+)/gi;
const CHECKPHONE_DESKTOP_PAGE_APPS: DesktopCoreAppConfig[] = [
    { id: NETEASE_MUSIC_RECORD_TYPE, label: '网易云音乐', icon: MusicNote, recordType: NETEASE_MUSIC_RECORD_TYPE },
    { id: 'taobao', label: '淘宝', icon: ShoppingBagOpen, recordType: 'order' },
    { id: 'delivery', label: '美团外卖', icon: BowlFood, recordType: 'delivery' },
    { id: 'social', label: '朋友圈', icon: Camera, recordType: 'social' },
];
const CHECKPHONE_DESKTOP_DOCK_APPS: DesktopCoreAppConfig[] = [
    { id: 'call', label: '通话', icon: Phone, recordType: 'call' },
    { id: 'chat', label: '信息', icon: ChatTeardrop, recordType: 'chat' },
    { id: SHIGUANG_CAMERA_RECORD_TYPE, label: SHIGUANG_CAMERA_LABEL, icon: Camera, recordType: SHIGUANG_CAMERA_RECORD_TYPE },
    { id: 'settings', label: '设置', icon: GearSix },
];

const sanitizeShiguangCameraComment = (comment?: unknown): string => {
    return normalizePhoneText(comment, '', SHIGUANG_CAMERA_COMMENT_MAX_CHARS)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(SHIGUANG_CAMERA_LITERAL_LINEBREAK_PATTERN, '\n')
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(SHIGUANG_CAMERA_COMMENT_TIMESTAMP_PATTERN, match => match.startsWith('\n') ? '\n' : '')
        .replace(/^\s*[\[\]【】]+\s*/g, '')
        .trim();
};

const splitShiguangCameraCommentMessages = (comment?: string): string[] => {
    const normalized = sanitizeShiguangCameraComment(comment);
    if (!normalized) return [];

    const messages: string[] = [];
    const pushMessage = (value: string) => {
        const text = value.trim();
        if (text) messages.push(text);
    };
    const pushLongText = (value: string) => {
        let rest = value.trim();
        while (rest.length > SHIGUANG_CAMERA_COMMENT_BUBBLE_CHARS) {
            pushMessage(rest.slice(0, SHIGUANG_CAMERA_COMMENT_BUBBLE_CHARS));
            rest = rest.slice(SHIGUANG_CAMERA_COMMENT_BUBBLE_CHARS).trim();
        }
        pushMessage(rest);
    };
    const pushFittedText = (value: string) => {
        const fragments = value.match(/[^，、,]+[，、,]?/g) || [value];
        let buffer = '';

        fragments.forEach(fragment => {
            const text = fragment.trim();
            if (!text) return;
            const candidate = buffer ? `${buffer}${text}` : text;
            if (candidate.length <= SHIGUANG_CAMERA_COMMENT_BUBBLE_CHARS) {
                buffer = candidate;
                return;
            }

            pushMessage(buffer);
            buffer = '';
            if (text.length > SHIGUANG_CAMERA_COMMENT_BUBBLE_CHARS) pushLongText(text);
            else buffer = text;
        });

        pushMessage(buffer);
    };

    normalized.split(/\n+/).forEach(paragraph => {
        const sentences = paragraph.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [paragraph];

        sentences.forEach(sentence => {
            const text = sentence.trim();
            if (!text) return;
            if (text.length > SHIGUANG_CAMERA_COMMENT_BUBBLE_CHARS) pushFittedText(text);
            else pushMessage(text);
        });
    });

    return messages;
};
const NETEASE_PROFILE_ART_GRADIENTS = [
    'linear-gradient(155deg,#4a5066,#1b1e2b)',
    'linear-gradient(155deg,#7a564a,#2c1a16)',
    'linear-gradient(155deg,#5c574c,#1f1c16)',
    'linear-gradient(155deg,#445a54,#16201d)',
    'linear-gradient(155deg,#6a4a58,#241620)',
    'linear-gradient(155deg,#8a6f4c,#2b2118)',
];

const getNeteaseProfileArtGradient = (index: number): string =>
    NETEASE_PROFILE_ART_GRADIENTS[index % NETEASE_PROFILE_ART_GRADIENTS.length];

const formatNeteaseProfileNumber = (value: number): string =>
    new Intl.NumberFormat('zh-CN').format(value);

const formatNeteaseProfileIndex = (index: number): string =>
    String(index + 1).padStart(2, '0');

const getNeteaseRecordArtist = (record?: PhoneEvidence | null): string =>
    record?.artist || record?.detail.split('\n')[0] || '未知歌手';

const getNeteaseRecordProgress = (record?: PhoneEvidence | null): number => {
    const seed = Math.abs(Number(record?.songId || record?.timestamp || 0));
    return 28 + (seed % 55);
};

const buildCheckPhoneDeviceHash = (value: string): string => {
    let hash = 2166136261;
    for (const char of value) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
    return `${hex.slice(0, 2)}-${hex.slice(2, 6)}-${hex.slice(6, 8)}`;
};

const getLatestTargetSignal = (character: CharacterProfile): number => {
    const latestRecord = Math.max(
        0,
        ...(character.phoneState?.records || []).map(record => normalizeTimestamp(record.timestamp))
    );
    const moodUpdatedAt = normalizeTimestamp((character.moodState as { updatedAt?: unknown } | undefined)?.updatedAt);
    return Math.max(latestRecord, moodUpdatedAt);
};

const formatTargetSignalAge = (timestamp: number): string => {
    if (!timestamp) return '等待首次采样';

    const diffMs = Math.max(0, Date.now() - timestamp);
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 5) return '刚刚活跃';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    return `${diffDays} 天前`;
};

const formatTargetDisplayName = (name: string): string => {
    const trimmed = name.trim();
    if (trimmed.length > 1 && trimmed.length <= 3 && !/\s/.test(trimmed)) {
        return Array.from(trimmed).join(' ');
    }
    return trimmed || 'Unknown';
};

const formatDesktopClock = (date: Date): string =>
    date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

const formatDesktopDateLine = (date: Date): string => {
    const weekday = date.toLocaleDateString('zh-CN', { weekday: 'short' });
    return `${weekday} · 多云 13°`;
};

const formatDesktopActiveTime = (date: Date): string =>
    date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

const formatGalleryPhotoCaption = (image: GalleryImage, index: number): string => {
    if (image.savedDate) return image.savedDate.replace(/-/g, '.');
    const summary = image.visualSummary?.trim();
    if (summary) return limitPhoneText(summary, 10);
    return CHECKPHONE_DESKTOP_CAPTIONS[index] || `照片 ${index + 1}`;
};

const toDesktopPhotoCard = (image: GalleryImage, index: number, src?: string): DesktopPhotoCard => ({
    id: image.id,
    src: src || getGalleryImageDisplayUrl(image) || image.url || '',
    caption: formatGalleryPhotoCaption(image, index),
    timestamp: normalizeTimestamp(image.timestamp),
});

const stripJsonFence = (value: string): string =>
    value
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

export const parseNeteaseMusicTraceJson = (content: string): unknown[] => {
    try {
        const parsed = JSON.parse(stripJsonFence(content));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const parseNeteaseMusicProfileJson = (content: string): unknown | null => {
    try {
        return JSON.parse(stripJsonFence(content));
    } catch {
        return null;
    }
};

const normalizeNeteaseInteger = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const normalizeGeneratedNeteaseProfile = (value: unknown): NeteaseMusicProfile => {
    const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
        nickname: normalizePhoneText(source.nickname ?? source.name, '未命名', MAX_PHONE_TITLE_CHARS),
        level: normalizeNeteaseInteger(source.level, 1, 1, 10),
        signature: normalizePhoneText(source.signature ?? source.bio ?? source.detail, '', MAX_PHONE_DETAIL_CHARS),
        playCount: normalizeNeteaseInteger(source.playCount ?? source.listenCount ?? source.count, 0, 0),
    };
};

export const normalizeGeneratedNeteaseMusicTrace = (item: unknown): NeteaseMusicTrace | null => {
    const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const song = normalizePhoneText(source.song ?? source.title ?? source.name, '', MAX_PHONE_TITLE_CHARS);
    const artist = normalizePhoneText(source.artist ?? source.singer ?? source.author, '', MAX_PHONE_META_CHARS);
    if (!song || !artist) return null;

    return {
        song,
        artist,
        tag: normalizePhoneText(source.tag ?? source.value ?? source.status, '', MAX_PHONE_META_CHARS),
        comment: normalizePhoneText(source.comment ?? source.detail ?? source.content, '', MAX_PHONE_DETAIL_CHARS),
    };
};

export const normalizeGeneratedNeteaseMusicProfilePayload = (item: unknown): NeteaseMusicProfilePayload | null => {
    const source = item && typeof item === 'object' && !Array.isArray(item)
        ? item as Record<string, unknown>
        : {};
    const rawPlaylists = Array.isArray(source.playlists)
        ? source.playlists
        : Array.isArray(item)
            ? [{ name: '最近听歌痕迹', count: item.length, songs: item }]
            : [];

    const playlists = rawPlaylists
        .slice(0, 3)
        .map((playlist, playlistIndex): NeteaseMusicPlaylist | null => {
            const playlistSource = playlist && typeof playlist === 'object'
                ? playlist as Record<string, unknown>
                : {};
            const rawSongs = Array.isArray(playlistSource.songs) ? playlistSource.songs : [];
            const songs = rawSongs
                .slice(0, 13)
                .map(normalizeGeneratedNeteaseMusicTrace)
                .filter((trace): trace is NeteaseMusicTrace => Boolean(trace));

            if (songs.length === 0) return null;

            return {
                name: normalizePhoneText(
                    playlistSource.name ?? playlistSource.title,
                    playlistIndex === 0 ? '我喜欢的音乐' : `歌单 ${playlistIndex + 1}`,
                    MAX_PHONE_TITLE_CHARS
                ),
                count: normalizeNeteaseInteger(playlistSource.count, songs.length, songs.length),
                songs,
            };
        })
        .filter((playlist): playlist is NeteaseMusicPlaylist => Boolean(playlist));

    if (playlists.length === 0) return null;

    return {
        profile: normalizeGeneratedNeteaseProfile(source.profile),
        playlists,
    };
};

const getNeteaseArtistLine = (song: NeteaseSong): string =>
    song.artists.map(artist => artist.name).filter(Boolean).join(' / ');

const buildNeteaseSongUrl = (songId: number): string =>
    `https://music.163.com/song/media/outer/url?id=${songId}.mp3`;

const splitNeteaseArtistLine = (artistLine?: string): string[] => {
    const artists = normalizePhoneText(artistLine, '未知歌手', MAX_PHONE_META_CHARS)
        .split(/\s*(?:\/|／|、|,|，|&|＆)\s*/)
        .map(name => name.trim())
        .filter(Boolean);

    return artists.length > 0 ? artists : ['未知歌手'];
};

export const phoneRecordToNeteaseSong = (record: PhoneEvidence): NeteaseSong | null => {
    if (!record.songId || record.songId <= 0) return null;

    return {
        kind: 'song',
        id: record.songId,
        name: record.title || '未知歌曲',
        artists: splitNeteaseArtistLine(record.artist || record.detail.split('\n')[0]).map(name => ({ id: 0, name })),
        album: {
            kind: 'album',
            id: 0,
            name: '',
            picUrl: record.albumCover,
        },
        duration: 0,
    };
};

export const buildNeteaseMusicProfileViewModel = (
    records: PhoneEvidence[],
    fallbackName = '听歌的人'
): { profile: NeteaseMusicProfile; playlists: NeteaseMusicPlaylistView[] } => {
    const sortedRecords = [...records].sort((a, b) => {
        const playlistDelta = (a.playlistIndex ?? 999) - (b.playlistIndex ?? 999);
        if (playlistDelta !== 0) return playlistDelta;
        const songDelta = (a.songIndex ?? 999) - (b.songIndex ?? 999);
        if (songDelta !== 0) return songDelta;
        return b.timestamp - a.timestamp;
    });
    const newestRecord = [...records].sort((a, b) => b.timestamp - a.timestamp)[0];
    const grouped = new Map<string, NeteaseMusicPlaylistView>();

    for (const record of sortedRecords) {
        const playlistIndex = record.playlistIndex ?? 0;
        const playlistName = record.playlistName || '最近听歌痕迹';
        const key = `${playlistIndex}:${playlistName}`;
        const existing = grouped.get(key);

        if (existing) {
            existing.records.push(record);
        } else {
            grouped.set(key, {
                key,
                name: playlistName,
                count: record.playlistCount || sortedRecords.filter(item => item.playlistName === playlistName).length,
                index: playlistIndex,
                records: [record],
            });
        }
    }

    return {
        profile: {
            nickname: newestRecord?.profileNickname || fallbackName,
            level: newestRecord?.profileLevel || 1,
            signature: newestRecord?.profileSignature || '把没说出口的话都放进播放列表。',
            playCount: newestRecord?.profilePlayCount || records.length,
        },
        playlists: [...grouped.values()].sort((a, b) => a.index - b.index),
    };
};

const resolveNeteaseMusicTrace = async (trace: NeteaseMusicTrace) => {
    try {
        const result = await searchSongs(`${trace.song} ${trace.artist}`, 1, 0);
        const matchedSong = result.songs?.[0];
        if (!matchedSong) return { trace };

        return {
            trace,
            matchedSong,
            songUrl: buildNeteaseSongUrl(matchedSong.id),
        };
    } catch {
        return { trace };
    }
};

const chunkDesktopApps = <T,>(items: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks.length ? chunks : [[]];
};

const getDesktopFanRotation = (count: number, index: number): number => {
    if (count <= 1) return 0;
    if (count === 2) return index === 0 ? -10 : 10;
    return [-15, 0, 15][index] ?? 0;
};

const readImageFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
};

const compressImageDataUrl = (
    dataUrl: string,
    maxEdge = SHIGUANG_CAMERA_MAX_IMAGE_EDGE,
    quality = SHIGUANG_CAMERA_IMAGE_QUALITY
): Promise<string> => {
    return new Promise(resolve => {
        const image = new Image();
        image.onload = () => {
            const sourceWidth = image.naturalWidth || image.width;
            const sourceHeight = image.naturalHeight || image.height;
            if (!sourceWidth || !sourceHeight) {
                resolve(dataUrl);
                return;
            }

            const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(sourceWidth * scale));
            canvas.height = Math.max(1, Math.round(sourceHeight * scale));

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(dataUrl);
                return;
            }

            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        image.onerror = () => resolve(dataUrl);
        image.src = dataUrl;
    });
};

const readImageFileAsCompressedDataUrl = async (file: File): Promise<string> => {
    const dataUrl = await readImageFileAsDataUrl(file);
    return compressImageDataUrl(dataUrl);
};

const formatShiguangPhotoTitle = (timestamp: number): string => {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `相机 ${time}`;
};

const formatShiguangPhotoContextTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
};

const buildShiguangCameraContextDetail = (input: {
    userName: string;
    charName: string;
    timestamp: number;
    summary: string;
    comment?: string;
}): string => {
    const lines = [
        `拍摄时间: ${formatShiguangPhotoContextTime(input.timestamp)}`,
        `图片摘要: ${input.summary}`,
    ];
    const comment = sanitizeShiguangCameraComment(input.comment);
    if (comment) lines.push(`${input.charName}当时说: ${comment}`);
    return lines.join('\n');
};

const buildSelectTargetMeta = (character: CharacterProfile, index: number): SelectTargetMeta => {
    const latestSignal = getLatestTargetSignal(character);
    const recordsCount = character.phoneState?.records?.length || 0;
    const appCount = CHECKPHONE_DESKTOP_PAGE_APPS.length + CHECKPHONE_DESKTOP_DOCK_APPS.length + (character.phoneState?.customApps?.length || 0);
    const diffMs = latestSignal ? Date.now() - latestSignal : Number.POSITIVE_INFINITY;
    const mode: SelectTargetMode = index === 0 || diffMs < 5 * 60_000
        ? 'live'
        : latestSignal
            ? 'recent'
            : 'idle';
    const signalStrength = mode === 'live'
        ? 4
        : mode === 'recent'
            ? Math.max(1, 4 - Math.floor(Math.max(0, diffMs) / (6 * 3_600_000)))
            : 1;
    const ageLabel = formatTargetSignalAge(latestSignal);

    return {
        character,
        mode,
        fingerprint: buildCheckPhoneDeviceHash(`${character.id}-${character.name}-${index}`),
        statusLabel: mode === 'live' ? '在线' : ageLabel,
        peekLabel: mode === 'live'
            ? '实时镜像 · 可接入'
            : mode === 'recent'
                ? `最近缓存 · ${ageLabel}`
                : '静默设备 · 等待采样',
        actionLabel: mode === 'live'
            ? '接入实时画面'
            : mode === 'recent'
                ? '建立连接'
                : '读取设备缓存',
        signalStrength,
        recordsCount,
        appCount,
        avatarGradient: CHECKPHONE_AVATAR_GRADIENTS[index % CHECKPHONE_AVATAR_GRADIENTS.length],
    };
};

export const normalizeGeneratedPhoneItem = (item: unknown): Pick<PhoneEvidence, 'title' | 'detail' | 'value' | 'shop'> => {
    const source = item && typeof item === 'object' ? item as Record<string, unknown> : { detail: item };
    return {
        title: normalizePhoneText(source.title ?? source.name ?? source.label, 'Unknown', MAX_PHONE_TITLE_CHARS),
        detail: normalizePhoneText(source.detail ?? source.content ?? source.text ?? source.items, '...', MAX_PHONE_DETAIL_CHARS),
        value: normalizeOptionalPhoneText(source.value ?? source.amount ?? source.price),
        shop: normalizeOptionalPhoneText(source.shop ?? source.store ?? source.status)
    };
};

export const normalizeStoredPhoneRecord = (record: PhoneEvidence): PhoneEvidence => {
    const unsafeRecord = record as unknown as Record<string, unknown>;
    const type = normalizePhoneText(unsafeRecord.type, 'generic', MAX_PHONE_META_CHARS);
    const detailLimit = type === 'chat' ? MAX_PHONE_CHAT_DETAIL_CHARS : MAX_PHONE_DETAIL_CHARS;
    const systemMessageId = typeof unsafeRecord.systemMessageId === 'number' ? unsafeRecord.systemMessageId : undefined;
    const value = normalizeOptionalPhoneText(unsafeRecord.value);
    const shop = normalizeOptionalPhoneText(unsafeRecord.shop);
    const artist = normalizeOptionalPhoneText(unsafeRecord.artist);
    const comment = normalizeOptionalPhoneText(unsafeRecord.comment, MAX_PHONE_DETAIL_CHARS);
    const songId = typeof unsafeRecord.songId === 'number' && Number.isFinite(unsafeRecord.songId) && unsafeRecord.songId > 0
        ? Math.trunc(unsafeRecord.songId)
        : undefined;
    const songUrl = normalizeOptionalPhoneText(unsafeRecord.songUrl, MAX_PHONE_DETAIL_CHARS);
    const albumCover = normalizePhoneMediaSource(unsafeRecord.albumCover);
    const profileNickname = normalizeOptionalPhoneText(unsafeRecord.profileNickname, MAX_PHONE_TITLE_CHARS);
    const profileLevel = typeof unsafeRecord.profileLevel === 'number' && Number.isFinite(unsafeRecord.profileLevel)
        ? normalizeNeteaseInteger(unsafeRecord.profileLevel, 1, 1, 10)
        : undefined;
    const profileSignature = normalizeOptionalPhoneText(unsafeRecord.profileSignature, MAX_PHONE_DETAIL_CHARS);
    const profilePlayCount = typeof unsafeRecord.profilePlayCount === 'number' && Number.isFinite(unsafeRecord.profilePlayCount)
        ? normalizeNeteaseInteger(unsafeRecord.profilePlayCount, 0, 0)
        : undefined;
    const playlistName = normalizeOptionalPhoneText(unsafeRecord.playlistName, MAX_PHONE_TITLE_CHARS);
    const playlistCount = typeof unsafeRecord.playlistCount === 'number' && Number.isFinite(unsafeRecord.playlistCount)
        ? normalizeNeteaseInteger(unsafeRecord.playlistCount, 0, 0)
        : undefined;
    const playlistIndex = typeof unsafeRecord.playlistIndex === 'number' && Number.isFinite(unsafeRecord.playlistIndex)
        ? normalizeNeteaseInteger(unsafeRecord.playlistIndex, 0, 0)
        : undefined;
    const songIndex = typeof unsafeRecord.songIndex === 'number' && Number.isFinite(unsafeRecord.songIndex)
        ? normalizeNeteaseInteger(unsafeRecord.songIndex, 0, 0)
        : undefined;

    const normalized: PhoneEvidence = {
        id: normalizePhoneText(unsafeRecord.id, `rec-${normalizeTimestamp(unsafeRecord.timestamp) || 'unknown'}`, MAX_PHONE_META_CHARS),
        type,
        title: normalizePhoneText(unsafeRecord.title, 'Unknown', MAX_PHONE_TITLE_CHARS),
        detail: normalizePhoneText(unsafeRecord.detail, '...', detailLimit),
        timestamp: normalizeTimestamp(unsafeRecord.timestamp),
    };

    if (systemMessageId !== undefined) normalized.systemMessageId = systemMessageId;
    if (value !== undefined) normalized.value = value;
    if (shop !== undefined) normalized.shop = shop;
    if (artist !== undefined) normalized.artist = artist;
    if (comment !== undefined) normalized.comment = comment;
    if (songId !== undefined) normalized.songId = songId;
    if (songUrl !== undefined) normalized.songUrl = songUrl;
    if (albumCover !== undefined) normalized.albumCover = albumCover;
    if (profileNickname !== undefined) normalized.profileNickname = profileNickname;
    if (profileLevel !== undefined) normalized.profileLevel = profileLevel;
    if (profileSignature !== undefined) normalized.profileSignature = profileSignature;
    if (profilePlayCount !== undefined) normalized.profilePlayCount = profilePlayCount;
    if (playlistName !== undefined) normalized.playlistName = playlistName;
    if (playlistCount !== undefined) normalized.playlistCount = playlistCount;
    if (playlistIndex !== undefined) normalized.playlistIndex = playlistIndex;
    if (songIndex !== undefined) normalized.songIndex = songIndex;

    return normalized;
};

export const prunePhoneRecords = (records: PhoneEvidence[]): PhoneEvidence[] => {
    const normalized = records
        .map((record, index) => ({ record: normalizeStoredPhoneRecord(record), index }))
        .sort((a, b) => (b.record.timestamp - a.record.timestamp) || (b.index - a.index));

    const countByType = new Map<string, number>();
    const kept: Array<{ record: PhoneEvidence; index: number }> = [];

    for (const item of normalized) {
        const typeCount = countByType.get(item.record.type) || 0;
        if (typeCount >= MAX_PHONE_RECORDS_PER_APP) continue;

        countByType.set(item.record.type, typeCount + 1);
        kept.push(item);

        if (kept.length >= MAX_PHONE_RECORDS_TOTAL) break;
    }

    return kept
        .sort((a, b) => (a.record.timestamp - b.record.timestamp) || (a.index - b.index))
        .map(item => item.record);
};

export interface NormalizedPhoneState {
    records: PhoneEvidence[];
    customApps: PhoneCustomApp[];
    desktopAppearance?: PhoneDesktopAppearance;
}

interface GenerateOptions {
    replaceExisting?: boolean;
}

type CheckPhoneTaskOutputMode = 'json' | 'text';

type ContextExitAction = 'exit_phone' | 'close_app';

export const normalizePhoneState = (
    phoneState: CharacterProfile['phoneState'] | undefined,
): NormalizedPhoneState => {
    const desktopAppearance = phoneState?.desktopAppearance;
    return {
        records: prunePhoneRecords(phoneState?.records || []),
        customApps: phoneState?.customApps || [],
        ...(desktopAppearance ? { desktopAppearance } : {}),
    };
};

const phoneRecordEquals = (a: PhoneEvidence, b: PhoneEvidence): boolean => {
    const aKeys = Object.keys(a as unknown as Record<string, unknown>).sort().join('|');
    const bKeys = Object.keys(b as unknown as Record<string, unknown>).sort().join('|');

    return (
        aKeys === bKeys &&
        a.id === b.id &&
        a.type === b.type &&
        a.title === b.title &&
        a.detail === b.detail &&
        a.timestamp === b.timestamp &&
        a.systemMessageId === b.systemMessageId &&
        a.value === b.value &&
        a.shop === b.shop &&
        a.artist === b.artist &&
        a.comment === b.comment &&
        a.songId === b.songId &&
        a.songUrl === b.songUrl &&
        a.albumCover === b.albumCover &&
        a.profileNickname === b.profileNickname &&
        a.profileLevel === b.profileLevel &&
        a.profileSignature === b.profileSignature &&
        a.profilePlayCount === b.profilePlayCount &&
        a.playlistName === b.playlistName &&
        a.playlistCount === b.playlistCount &&
        a.playlistIndex === b.playlistIndex &&
        a.songIndex === b.songIndex
    );
};

export const phoneStateNeedsNormalization = (
    current: CharacterProfile['phoneState'] | undefined,
    normalized = normalizePhoneState(current),
): boolean => {
    const records = current?.records || [];
    if (records.length !== normalized.records.length) return true;
    for (let i = 0; i < records.length; i += 1) {
        if (!phoneRecordEquals(records[i], normalized.records[i])) return true;
    }
    return false;
};

export const unlinkPhoneRecordFromContext = (record: PhoneEvidence): PhoneEvidence => {
    const nextRecord = { ...record };
    delete nextRecord.systemMessageId;
    return nextRecord;
};

export function buildPhoneSystemMessageDraft(input: {
    type: string;
    charName: string;
    charAvatar?: string;
    logPrefix: string;
    title: string;
    detail: string;
    value?: string;
    shop?: string;
    artist?: string;
    comment?: string;
    songId?: number;
    songUrl?: string;
    albumCover?: string;
    profileNickname?: string;
    profileLevel?: number;
    profileSignature?: string;
    profilePlayCount?: number;
    playlistName?: string;
    playlistCount?: number;
    playlistIndex?: number;
    songIndex?: number;
}) {
    const detailLimit = input.type === 'chat' ? MAX_PHONE_CHAT_DETAIL_CHARS : MAX_PHONE_DETAIL_CHARS;
    const phoneDetail = normalizePhoneText(input.detail, '', detailLimit);
    const inlineDetail = phoneDetail.replace(/\n/g, ' ');
    const phoneLabel = input.logPrefix || input.type;
    const content = input.type === 'chat'
        ? `[系统: ${input.charName} 与 "${input.title}" 的聊天记录-内容涉及: ${inlineDetail}]`
        : `[系统: ${input.charName}的手机(${phoneLabel}) 显示: ${input.title} - ${inlineDetail}]`;

    return {
        content,
        metadata: {
            source: 'phone',
            phoneType: input.type,
            phoneLabel,
            phoneTitle: limitPhoneText(input.title, MAX_PHONE_TITLE_CHARS),
            phoneDetail,
            phoneValue: input.value ? limitPhoneText(input.value, MAX_PHONE_META_CHARS) : null,
            phoneShop: input.shop ? limitPhoneText(input.shop, MAX_PHONE_META_CHARS) : null,
            phoneArtist: input.artist ? limitPhoneText(input.artist, MAX_PHONE_META_CHARS) : null,
            phoneComment: input.comment ? limitPhoneText(input.comment, MAX_PHONE_DETAIL_CHARS) : null,
            phoneSongId: input.songId ?? null,
            phoneSongUrl: input.songUrl ? limitPhoneText(input.songUrl, MAX_PHONE_DETAIL_CHARS) : null,
            phoneAlbumCover: input.albumCover || null,
            phoneProfileNickname: input.profileNickname ? limitPhoneText(input.profileNickname, MAX_PHONE_TITLE_CHARS) : null,
            phoneProfileLevel: input.profileLevel ?? null,
            phoneProfileSignature: input.profileSignature ? limitPhoneText(input.profileSignature, MAX_PHONE_DETAIL_CHARS) : null,
            phoneProfilePlayCount: input.profilePlayCount ?? null,
            phonePlaylistName: input.playlistName ? limitPhoneText(input.playlistName, MAX_PHONE_TITLE_CHARS) : null,
            phonePlaylistCount: input.playlistCount ?? null,
            phonePlaylistIndex: input.playlistIndex ?? null,
            phoneSongIndex: input.songIndex ?? null,
            charName: input.charName,
            charAvatar: input.charAvatar
        }
    };
}

// === [LEGACY] 原配合 searchNearbyRestaurants 使用，暂停 ===
// function shuffleAndPick<T>(arr: T[], count: number): T[] {
//     const shuffled = [...arr].sort(() => Math.random() - 0.5);
//     return shuffled.slice(0, count);
// }

const CheckPhone: React.FC = () => {
    const { closeApp, openApp, characters, updateCharacter, apiConfig, addToast, userProfile, groups, realtimeConfig } = useOS();
    const { playSong } = useAudioPlayer();
    const [view, setView] = useState<'select' | 'phone'>('select');
    // activeAppId: 'home' | 'chat_detail' | 'app_id'
    const [activeAppId, setActiveAppId] = useState<string>('home');
    const [targetChar, setTargetChar] = useState<CharacterProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [accessOverlay, setAccessOverlay] = useState<AccessOverlayState | null>(null);
    const accessTimersRef = useRef<number[]>([]);

    // Chat Detail State
    const [selectedChatRecord, setSelectedChatRecord] = useState<PhoneEvidence | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Custom App Creation State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newAppName, setNewAppName] = useState('');
    const [newAppIcon, setNewAppIcon] = useState('📱');
    const [newAppColor, setNewAppColor] = useState('#3b82f6');
    const [newAppPrompt, setNewAppPrompt] = useState('');
    const [desktopNow, setDesktopNow] = useState(() => new Date());
    const [musicConfig, setMusicConfig] = useMusicConfig();
    const [desktopGalleryPhotos, setDesktopGalleryPhotos] = useState<DesktopPhotoCard[]>([]);
    const [activeDesktopPhotoId, setActiveDesktopPhotoId] = useState<string | null>(null);
    const [desktopPage, setDesktopPage] = useState(0);
    const [showDesktopSettings, setShowDesktopSettings] = useState(false);
    const [desktopIconUploadTargetId, setDesktopIconUploadTargetId] = useState<string | null>(null);
    const [desktopPhotoUploadSlot, setDesktopPhotoUploadSlot] = useState<number | null>(null);
    const [isDesktopEditing, setIsDesktopEditing] = useState(false);
    const [openNeteasePlaylistKeys, setOpenNeteasePlaylistKeys] = useState<Record<string, boolean>>({});
    const [openNeteaseSongId, setOpenNeteaseSongId] = useState<string | null>(null);
    const [neteaseConfirmRecord, setNeteaseConfirmRecord] = useState<PhoneEvidence | null>(null);
    const [recordPendingDelete, setRecordPendingDelete] = useState<PhoneEvidence | null>(null);
    const [shiguangCameraStatus, setShiguangCameraStatus] = useState<'idle' | 'requesting' | 'ready' | 'blocked'>('idle');
    const [shiguangFacingMode, setShiguangFacingMode] = useState<'environment' | 'user'>('environment');
    const [shiguangSelectedRecordIds, setShiguangSelectedRecordIds] = useState<string[]>([]);
    const [shiguangCommenting, setShiguangCommenting] = useState(false);
    const [shiguangCommentVisibleCounts, setShiguangCommentVisibleCounts] = useState<Record<string, number>>({});
    const [pendingPhoneContextRecordIds, setPendingPhoneContextRecordIds] = useState<string[]>([]);
    const [contextExitAction, setContextExitAction] = useState<ContextExitAction | null>(null);
    const [isResolvingContextExit, setIsResolvingContextExit] = useState(false);
    const desktopPagerRef = useRef<HTMLDivElement | null>(null);
    const desktopEditTimerRef = useRef<number | null>(null);
    const desktopLongPressTriggeredRef = useRef(false);
    const recordDeleteLongPressTimerRef = useRef<number | null>(null);
    const recordDeleteLongPressStartRef = useRef<{ x: number; y: number } | null>(null);
    const recordDeleteSuppressClickUntilRef = useRef(0);
    const desktopWallpaperInputRef = useRef<HTMLInputElement | null>(null);
    const desktopIconInputRef = useRef<HTMLInputElement | null>(null);
    const desktopPhotoInputRef = useRef<HTMLInputElement | null>(null);
    const shiguangVideoRef = useRef<HTMLVideoElement | null>(null);
    const shiguangCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const shiguangFileInputRef = useRef<HTMLInputElement | null>(null);
    const shiguangStreamRef = useRef<MediaStream | null>(null);

    // Derived state for evidence records
    const records = useMemo(
        () => prunePhoneRecords(targetChar?.phoneState?.records || []),
        [targetChar?.phoneState?.records]
    );
    const pendingPhoneContextRecords = useMemo(() => {
        if (pendingPhoneContextRecordIds.length === 0) return [];
        const pendingIds = new Set(pendingPhoneContextRecordIds);
        return records.filter(record => pendingIds.has(record.id) && typeof record.systemMessageId === 'number');
    }, [pendingPhoneContextRecordIds, records]);
    const customApps = targetChar?.phoneState?.customApps || [];
    const desktopAppearance = targetChar?.phoneState?.desktopAppearance || {};
    const desktopIconOverrides = desktopAppearance.appIcons || {};
    const desktopCustomPhotoCount = (desktopAppearance.galleryPhotos || [])
        .slice(0, CHECKPHONE_DESKTOP_PHOTO_SLOT_COUNT)
        .filter(photo => Boolean(photo?.trim())).length;
    const selectTargets = useMemo(
        () => characters.map((character, index) => buildSelectTargetMeta(character, index)),
        [characters]
    );
    const desktopPhotoCards = useMemo<DesktopPhotoCard[]>(() => {
        if (!targetChar) return [];

        const customPhotos = (desktopAppearance.galleryPhotos || []).slice(0, CHECKPHONE_DESKTOP_PHOTO_SLOT_COUNT);
        const fallbackSrc = targetChar.dateBackground || targetChar.avatar || '';
        return Array.from({ length: CHECKPHONE_DESKTOP_PHOTO_SLOT_COUNT }, (_, index) => {
            const customSrc = customPhotos[index]?.trim();
            if (customSrc) {
                return {
                    id: `custom-${targetChar.id}-${index}`,
                    src: customSrc,
                    caption: '',
                    timestamp: index,
                    isCustom: true,
                };
            }

            const galleryPhoto = desktopGalleryPhotos[index];
            if (galleryPhoto) return galleryPhoto;

            return {
                id: `fallback-${targetChar.id}-${index}`,
                src: index === 0 ? fallbackSrc : '',
                caption: index === 0 && fallbackSrc ? '壁纸' : `照片 ${index + 1}`,
                timestamp: index,
                isFallback: true,
            };
        });
    }, [desktopAppearance.galleryPhotos, desktopGalleryPhotos, targetChar?.avatar, targetChar?.dateBackground, targetChar?.id]);
    const desktopSettingsApps = useMemo(
        () => [
            ...CHECKPHONE_DESKTOP_PAGE_APPS,
            ...CHECKPHONE_DESKTOP_DOCK_APPS,
            ...customApps.map(app => ({
                id: app.id,
                label: app.name,
                emoji: app.icon,
                isCustom: true,
            })),
        ],
        [customApps]
    );
    const getRecentRecordsByType = (type: string) =>
        records
            .filter(r => r.type === type)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_PHONE_VISIBLE_RECORDS);

    const stopShiguangCameraStream = () => {
        shiguangStreamRef.current?.getTracks().forEach(track => track.stop());
        shiguangStreamRef.current = null;
        if (shiguangVideoRef.current) {
            shiguangVideoRef.current.srcObject = null;
        }
    };

    const normalizeTargetCharacter = (character: CharacterProfile): CharacterProfile => {
        const normalizedPhoneState = normalizePhoneState(character.phoneState);
        if (!phoneStateNeedsNormalization(character.phoneState, normalizedPhoneState)) return character;
        updateCharacter(character.id, { phoneState: normalizedPhoneState });
        return { ...character, phoneState: normalizedPhoneState };
    };

    useEffect(() => {
        const timer = window.setInterval(() => setDesktopNow(new Date()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => () => {
        accessTimersRef.current.forEach(timer => window.clearTimeout(timer));
        if (desktopEditTimerRef.current !== null) window.clearTimeout(desktopEditTimerRef.current);
        if (recordDeleteLongPressTimerRef.current !== null) window.clearTimeout(recordDeleteLongPressTimerRef.current);
        stopShiguangCameraStream();
    }, []);

    useEffect(() => {
        if (activeAppId !== SHIGUANG_CAMERA_RECORD_TYPE) {
            stopShiguangCameraStream();
            setShiguangCameraStatus('idle');
            return;
        }

        let cancelled = false;

        const startCamera = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setShiguangCameraStatus('blocked');
                return;
            }

            stopShiguangCameraStream();
            setShiguangCameraStatus('requesting');

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: shiguangFacingMode },
                        width: { ideal: 1280 },
                        height: { ideal: 1280 },
                    },
                    audio: false,
                });

                if (cancelled) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                shiguangStreamRef.current = stream;
                if (shiguangVideoRef.current) {
                    shiguangVideoRef.current.srcObject = stream;
                    await shiguangVideoRef.current.play().catch(() => undefined);
                }
                setShiguangCameraStatus('ready');
            } catch (error) {
                const cameraErrorName = error instanceof DOMException ? error.name : '';
                const logCameraIssue = cameraErrorName === 'NotAllowedError' || cameraErrorName === 'NotFoundError'
                    ? console.info
                    : console.warn;
                logCameraIssue.call(console, '[CheckPhone] camera unavailable:', error);
                if (!cancelled) setShiguangCameraStatus('blocked');
            }
        };

        void startCamera();

        return () => {
            cancelled = true;
            stopShiguangCameraStream();
        };
    }, [activeAppId, shiguangFacingMode]);

    useEffect(() => {
        setShiguangSelectedRecordIds(prev => {
            if (prev.length === 0) return prev;
            const availableIds = new Set(
                records
                    .filter(record => record.type === SHIGUANG_CAMERA_RECORD_TYPE)
                    .map(record => record.id)
            );
            return prev.filter(id => availableIds.has(id));
        });
    }, [records]);

    useEffect(() => {
        let cancelled = false;

        if (!targetChar) {
            setDesktopGalleryPhotos([]);
            setDesktopPage(0);
            setIsDesktopEditing(false);
            return;
        }

        DB.getGalleryImages(targetChar.id)
            .then(async images => {
                const latestImages = [...images]
                    .sort((a, b) => normalizeTimestamp(b.timestamp) - normalizeTimestamp(a.timestamp))
                    .slice(0, CHECKPHONE_DESKTOP_PHOTO_SLOT_COUNT);
                const previewCards = latestImages.map((image, index) => toDesktopPhotoCard(image, index));

                if (!cancelled) {
                    setDesktopGalleryPhotos(previewCards);
                    setDesktopPage(0);
                }

                const originalCards = await Promise.all(latestImages.map(async (image, index) => {
                    const previewSrc = previewCards[index]?.src || image.url || '';
                    try {
                        const originalSrc = await resolveGalleryImageOriginalUrl(image);
                        return toDesktopPhotoCard(image, index, originalSrc || previewSrc);
                    } catch {
                        return toDesktopPhotoCard(image, index, previewSrc);
                    }
                }));

                if (!cancelled) {
                    setDesktopGalleryPhotos(originalCards);
                }
            })
            .catch(error => {
                console.warn('[CheckPhone] Failed to load gallery photos for desktop:', error);
                if (!cancelled) setDesktopGalleryPhotos([]);
            });

        return () => {
            cancelled = true;
        };
    }, [targetChar?.id]);

    useEffect(() => {
        setActiveDesktopPhotoId(current => (
            desktopPhotoCards.some(photo => photo.id === current)
                ? current
                : desktopPhotoCards[0]?.id || null
        ));
    }, [desktopPhotoCards]);

    useEffect(() => {
        if (targetChar) {
            // Keep targetChar in sync with global state if it updates (e.g. deletion)
            const updated = characters.find(c => c.id === targetChar.id);
            if (updated) {
                const normalizedCharacter = normalizeTargetCharacter(updated);
                setTargetChar(normalizedCharacter);
                // Update selected record ref if open
                if (selectedChatRecord) {
                    const freshRecord = normalizedCharacter.phoneState?.records?.find(r => r.id === selectedChatRecord.id);
                    if (freshRecord) setSelectedChatRecord(normalizeStoredPhoneRecord(freshRecord));
                }
            }
        }
    }, [characters]);

    useEffect(() => {
        if (!targetChar || view !== 'phone') return;

        const linkedMessageIds = getFiniteMessageIds(
            records
                .map(record => record.systemMessageId)
                .filter((id): id is number => typeof id === 'number')
        );
        if (linkedMessageIds.length === 0) return;

        let cancelled = false;
        DB.getMessagesByIds(linkedMessageIds)
            .then(existingMessages => {
                if (cancelled) return;
                const existingMessageIds = new Set(existingMessages.map(message => message.id));
                const missingMessageIds = linkedMessageIds.filter(id => !existingMessageIds.has(id));
                const nextPhoneState = removePhoneRecordsLinkedToMessageIds(targetChar.phoneState, missingMessageIds);
                if (!nextPhoneState) return;

                updateCharacter(targetChar.id, { phoneState: nextPhoneState });
                setTargetChar(prev => prev && prev.id === targetChar.id
                    ? { ...prev, phoneState: nextPhoneState }
                    : prev
                );

                if (
                    selectedChatRecord?.systemMessageId
                    && missingMessageIds.includes(selectedChatRecord.systemMessageId)
                ) {
                    setSelectedChatRecord(null);
                    setActiveAppId('chat');
                }
            })
            .catch(error => {
                console.warn('[CheckPhone] Failed to reconcile phone records with chat history:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [targetChar?.id, view, records, selectedChatRecord?.systemMessageId, updateCharacter]);

    // Reset page scroll on navigation to prevent mobile layout shift
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [activeAppId, view]);

    // 朋友圈封面：每次组件挂载随机选一张背景
    const momentsCoverBg = useMemo(() =>
        MOMENTS_BG_POOL[Math.floor(Math.random() * MOMENTS_BG_POOL.length)],
        []);

    // Auto scroll to bottom of chat detail
    // NOTE: Do NOT use scrollIntoView - it propagates to page scroll on mobile, shifting the entire layout up
    useEffect(() => {
        if (activeAppId === 'chat_detail' && chatEndRef.current) {
            const container = chatEndRef.current.parentElement;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }
    }, [selectedChatRecord?.detail, activeAppId]);

    const handleSelectChar = (c: CharacterProfile) => {
        setTargetChar(normalizeTargetCharacter(c));
        setView('phone');
        setActiveAppId('home');
    };

    const handleConnectTarget = (c: CharacterProfile) => {
        accessTimersRef.current.forEach(timer => window.clearTimeout(timer));
        setAccessOverlay({ name: c.name, status: 'connecting' });

        const grantedTimer = window.setTimeout(() => {
            setAccessOverlay({ name: c.name, status: 'granted' });
        }, 560);

        const enterTimer = window.setTimeout(() => {
            setAccessOverlay(null);
            handleSelectChar(c);
        }, 1080);

        accessTimersRef.current = [grantedTimer, enterTimer];
    };

    const performExitPhone = () => {
        setPendingPhoneContextRecordIds([]);
        setContextExitAction(null);
        setView('select');
        setTargetChar(null);
        setActiveAppId('home');
        setDesktopGalleryPhotos([]);
        setDesktopPage(0);
        setIsDesktopEditing(false);
        setShowDesktopSettings(false);
    };

    const performCheckPhoneExit = (action: ContextExitAction) => {
        if (action === 'close_app') {
            performExitPhone();
            closeApp();
            return;
        }

        performExitPhone();
    };

    const requestCheckPhoneExit = (action: ContextExitAction) => {
        if (pendingPhoneContextRecords.length > 0 && targetChar) {
            setContextExitAction(action);
            return;
        }

        performCheckPhoneExit(action);
    };

    const cancelContextExitPrompt = () => {
        if (isResolvingContextExit) return;
        setContextExitAction(null);
    };

    const handleKeepPhoneContext = () => {
        const action = contextExitAction || 'exit_phone';
        const pendingCount = pendingPhoneContextRecords.length;
        setPendingPhoneContextRecordIds([]);
        setContextExitAction(null);
        addToast(
            pendingCount > 0 ? `他会知道这次翻到的 ${pendingCount} 条痕迹` : '他会知道这次翻到的痕迹',
            'success'
        );
        performCheckPhoneExit(action);
    };

    const handleHidePhoneContext = async () => {
        if (!targetChar) return;

        const action = contextExitAction || 'exit_phone';
        const pendingRecords = pendingPhoneContextRecords;
        if (pendingRecords.length === 0) {
            setContextExitAction(null);
            performCheckPhoneExit(action);
            return;
        }

        setIsResolvingContextExit(true);

        try {
            const pendingRecordIds = new Set(pendingRecords.map(record => record.id));
            const messageIds = getFiniteMessageIds(
                pendingRecords
                    .map(record => record.systemMessageId)
                    .filter((id): id is number => typeof id === 'number')
            );

            if (messageIds.length > 0) {
                await DB.deleteMessages(messageIds);
            }

            const nextRecords = (targetChar.phoneState?.records || []).map(record =>
                pendingRecordIds.has(record.id) ? unlinkPhoneRecordFromContext(record) : record
            );
            const nextPhoneState: CharacterProfile['phoneState'] = {
                ...targetChar.phoneState,
                records: nextRecords,
            };

            updateCharacter(targetChar.id, { phoneState: nextPhoneState });
            setTargetChar(prev => prev && prev.id === targetChar.id
                ? { ...prev, phoneState: nextPhoneState }
                : prev
            );
            setSelectedChatRecord(prev => prev && pendingRecordIds.has(prev.id)
                ? unlinkPhoneRecordFromContext(prev)
                : prev
            );
            setPendingPhoneContextRecordIds(prev => prev.filter(id => !pendingRecordIds.has(id)));
            setContextExitAction(null);
            addToast('他不会知道这次翻到的痕迹', 'success');
            performCheckPhoneExit(action);
        } catch (error) {
            console.warn('[CheckPhone] Failed to hide phone records from chat context:', error);
            addToast('处理失败，请再试一次', 'error');
        } finally {
            setIsResolvingContextExit(false);
        }
    };

    const handleExitPhone = () => {
        requestCheckPhoneExit('exit_phone');
    };

    const updateDesktopAppearance = (updater: (appearance: PhoneDesktopAppearance) => PhoneDesktopAppearance) => {
        if (!targetChar) return;
        const nextAppearance = updater(targetChar.phoneState?.desktopAppearance || {});
        const nextPhoneState: CharacterProfile['phoneState'] = {
            ...targetChar.phoneState,
            desktopAppearance: nextAppearance,
        };
        updateCharacter(targetChar.id, { phoneState: nextPhoneState });
        setTargetChar(prev => prev ? { ...prev, phoneState: nextPhoneState } : prev);
    };

    const handleDesktopWallpaperUpload = async (file: File) => {
        try {
            const dataUrl = await readImageFileAsDataUrl(file);
            if (!dataUrl) throw new Error('empty image');
            updateDesktopAppearance(appearance => ({ ...appearance, wallpaper: dataUrl }));
            addToast('查手机桌面已更新', 'success');
        } catch (error) {
            console.error('[CheckPhone] Failed to update desktop wallpaper:', error);
            addToast('壁纸读取失败', 'error');
        }
    };

    const handleResetDesktopWallpaper = () => {
        updateDesktopAppearance(appearance => {
            const rest = { ...appearance };
            delete rest.wallpaper;
            return rest;
        });
        addToast('已恢复默认桌面', 'success');
    };

    const handleDesktopPhotoUpload = async (file: File) => {
        if (desktopPhotoUploadSlot === null) return;

        try {
            const dataUrl = await readImageFileAsDataUrl(file);
            if (!dataUrl) throw new Error('empty image');
            const slotIndex = desktopPhotoUploadSlot;

            updateDesktopAppearance(appearance => {
                const nextPhotos = (appearance.galleryPhotos || []).slice(0, CHECKPHONE_DESKTOP_PHOTO_SLOT_COUNT);
                while (nextPhotos.length < CHECKPHONE_DESKTOP_PHOTO_SLOT_COUNT) nextPhotos.push('');
                nextPhotos[slotIndex] = dataUrl;
                return { ...appearance, galleryPhotos: nextPhotos };
            });
            addToast(`照片 ${slotIndex + 1} 已更新`, 'success');
        } catch (error) {
            console.error('[CheckPhone] Failed to update desktop photo:', error);
            addToast('照片读取失败', 'error');
        } finally {
            setDesktopPhotoUploadSlot(null);
        }
    };

    const handleResetDesktopPhoto = (slotIndex: number) => {
        updateDesktopAppearance(appearance => {
            const nextPhotos = (appearance.galleryPhotos || []).slice(0, CHECKPHONE_DESKTOP_PHOTO_SLOT_COUNT);
            while (nextPhotos.length < CHECKPHONE_DESKTOP_PHOTO_SLOT_COUNT) nextPhotos.push('');
            nextPhotos[slotIndex] = '';

            const rest = { ...appearance };
            delete rest.galleryPhotos;
            return nextPhotos.some(Boolean) ? { ...rest, galleryPhotos: nextPhotos } : rest;
        });
        addToast(`照片 ${slotIndex + 1} 已恢复默认`, 'success');
    };

    const openDesktopPhotoUpload = (slotIndex: number) => {
        setDesktopPhotoUploadSlot(slotIndex);
        window.setTimeout(() => desktopPhotoInputRef.current?.click(), 0);
    };

    const handleDesktopIconUpload = async (file: File) => {
        if (!desktopIconUploadTargetId) return;
        try {
            const dataUrl = await readImageFileAsDataUrl(file);
            if (!dataUrl) throw new Error('empty image');
            const targetId = desktopIconUploadTargetId;
            updateDesktopAppearance(appearance => ({
                ...appearance,
                appIcons: {
                    ...(appearance.appIcons || {}),
                    [targetId]: dataUrl,
                },
            }));
            addToast('查手机图标已更新', 'success');
        } catch (error) {
            console.error('[CheckPhone] Failed to update desktop icon:', error);
            addToast('图标读取失败', 'error');
        } finally {
            setDesktopIconUploadTargetId(null);
        }
    };

    const handleResetDesktopIcon = (appId: string) => {
        updateDesktopAppearance(appearance => {
            const nextIcons = { ...(appearance.appIcons || {}) };
            delete nextIcons[appId];
            const rest = { ...appearance };
            delete rest.appIcons;
            return Object.keys(nextIcons).length ? { ...rest, appIcons: nextIcons } : rest;
        });
        addToast('已恢复默认图标', 'success');
    };

    const openDesktopIconUpload = (appId: string) => {
        setDesktopIconUploadTargetId(appId);
        window.setTimeout(() => desktopIconInputRef.current?.click(), 0);
    };

    const cancelDesktopEditPress = () => {
        if (desktopEditTimerRef.current !== null) {
            window.clearTimeout(desktopEditTimerRef.current);
            desktopEditTimerRef.current = null;
        }
    };

    const startDesktopEditPress = () => {
        cancelDesktopEditPress();
        desktopLongPressTriggeredRef.current = false;
        desktopEditTimerRef.current = window.setTimeout(() => {
            desktopLongPressTriggeredRef.current = true;
            setIsDesktopEditing(true);
            desktopEditTimerRef.current = null;
        }, 520);
    };

    const handleDesktopSurfacePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        startDesktopEditPress();
    };

    const handleDesktopSurfacePointerUp = () => {
        cancelDesktopEditPress();
        desktopLongPressTriggeredRef.current = false;
    };

    const handleDesktopAppClick = (action: () => void) => {
        cancelDesktopEditPress();
        if (desktopLongPressTriggeredRef.current) {
            desktopLongPressTriggeredRef.current = false;
            return;
        }
        action();
    };

    const handleDesktopPageScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const element = event.currentTarget;
        const nextPage = Math.round(element.scrollLeft / Math.max(1, element.clientWidth));
        setDesktopPage(nextPage);
    };

    const scrollDesktopPage = (pageIndex: number) => {
        const element = desktopPagerRef.current;
        if (!element) return;
        element.scrollTo({ left: pageIndex * element.clientWidth, behavior: 'smooth' });
        setDesktopPage(pageIndex);
    };

    const appendPhoneRecords = (newRecordsToAdd: PhoneEvidence[]) => {
        if (!targetChar || newRecordsToAdd.length === 0) return;

        const existingRecords = targetChar.phoneState?.records || [];
        const nextRecords = prunePhoneRecords([...existingRecords, ...newRecordsToAdd]);
        const nextRecordIds = new Set(nextRecords.map(record => record.id));
        const newContextRecordIds = new Set(
            newRecordsToAdd
                .filter(record => typeof record.systemMessageId === 'number')
                .map(record => record.id)
        );
        const nextPendingContextRecordIds = nextRecords
            .filter(record => newContextRecordIds.has(record.id) && typeof record.systemMessageId === 'number')
            .map(record => record.id);
        const nextPhoneState: CharacterProfile['phoneState'] = {
            ...targetChar.phoneState,
            records: nextRecords,
        };

        updateCharacter(targetChar.id, { phoneState: nextPhoneState });
        setTargetChar(prev => prev ? { ...prev, phoneState: nextPhoneState } : prev);
        setPendingPhoneContextRecordIds(prev => {
            const keptPendingIds = prev.filter(id => nextRecordIds.has(id));
            return Array.from(new Set([...keptPendingIds, ...nextPendingContextRecordIds]));
        });
    };

    const createShiguangPhotoRecord = async (dataUrl: string): Promise<PhoneEvidence | null> => {
        if (!targetChar) return null;

        const timestamp = Date.now();
        const title = formatShiguangPhotoTitle(timestamp);
        const detail = buildShiguangCameraContextDetail({
            userName: userProfile.name,
            charName: targetChar.name,
            timestamp,
            summary: `${userProfile.name}用${targetChar.name}的手机相机拍下了一张现实照片，照片本体已作为拍立得卡片显示在主聊天。`,
        });
        const systemDraft = buildPhoneSystemMessageDraft({
            type: SHIGUANG_CAMERA_RECORD_TYPE,
            charName: targetChar.name,
            charAvatar: targetChar.avatar,
            logPrefix: SHIGUANG_CAMERA_LABEL,
            title,
            detail,
            value: '一张拍立得',
            albumCover: dataUrl,
        });

        const systemMessageId = await DB.saveMessage({
            charId: targetChar.id,
            role: 'system',
            type: 'text',
            content: systemDraft.content,
            metadata: systemDraft.metadata,
        });

        const record: PhoneEvidence = {
            id: `rec-${Date.now()}-${Math.random()}`,
            type: SHIGUANG_CAMERA_RECORD_TYPE,
            title,
            detail,
            value: '一张拍立得',
            albumCover: dataUrl,
            timestamp,
            systemMessageId,
        };

        appendPhoneRecords([record]);
        setShiguangSelectedRecordIds(prev => Array.from(new Set([record.id, ...prev])).slice(0, SHIGUANG_CAMERA_MAX_SELECTION));
        addToast('已保存这张照片', 'success');
        return record;
    };

    const handleCaptureShiguangPhoto = async () => {
        const video = shiguangVideoRef.current;
        const canvas = shiguangCanvasRef.current || document.createElement('canvas');
        if (!video || shiguangCameraStatus !== 'ready' || video.readyState < 2) {
            addToast('镜头还没准备好', 'info');
            return;
        }

        const sourceWidth = video.videoWidth || 720;
        const sourceHeight = video.videoHeight || 960;
        const scale = Math.min(1, SHIGUANG_CAMERA_MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            addToast('照片生成失败', 'error');
            return;
        }

        ctx.save();
        if (shiguangFacingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate?.(12);
        await createShiguangPhotoRecord(canvas.toDataURL('image/jpeg', SHIGUANG_CAMERA_IMAGE_QUALITY));
    };

    const handleShiguangFileUpload = async (file: File) => {
        try {
            const dataUrl = await readImageFileAsCompressedDataUrl(file);
            if (!dataUrl) throw new Error('empty image');
            await createShiguangPhotoRecord(dataUrl);
        } catch (error) {
            console.error('[CheckPhone] Failed to import camera photo:', error);
            addToast('照片读取失败', 'error');
        }
    };

    const toggleShiguangRecordSelection = (recordId: string) => {
        setShiguangSelectedRecordIds(prev => {
            if (prev.includes(recordId)) return prev.filter(id => id !== recordId);
            return [recordId, ...prev].slice(0, SHIGUANG_CAMERA_MAX_SELECTION);
        });
    };

    const advanceShiguangCameraComment = (recordId: string, total: number) => {
        if (!recordId || total <= 1) return;
        setShiguangCommentVisibleCounts(prev => {
            const current = Math.max(1, prev[recordId] || 1);
            if (current >= total) return prev;
            return { ...prev, [recordId]: current + 1 };
        });
    };

    const handleCreateShiguangGroupComment = async () => {
        if (!targetChar) return;
        if (!apiConfig.apiKey || !apiConfig.baseUrl) {
            addToast('请先配置 API', 'error');
            return;
        }
        if (shiguangCommenting) return;

        const selectedIds = new Set(shiguangSelectedRecordIds);
        const list = getRecentRecordsByType(SHIGUANG_CAMERA_RECORD_TYPE)
            .filter(record => record.albumCover);
        const selectedRecords = list
            .filter(record => selectedIds.has(record.id) && record.albumCover);
        const commentRecords = selectedRecords.length > 0 ? selectedRecords : list.slice(0, 1);

        if (commentRecords.length < 1) {
            addToast('先拍一张或从相册选一张', 'info');
            return;
        }

        setShiguangCommenting(true);

        try {
            const photoList = commentRecords
                .map((record, index) => `照片 ${index + 1}: ${record.title}${record.value ? ` / ${record.value}` : ''}`)
                .join('\n');
            const prompt = `### [Photos]
${photoList}

### [Photo Review Prompt]
【情境】
${userProfile.name} 刚刚用「你的手机」拍下了一张(或一组)照片，递到了你面前。
这不是聊天里的想象，而是 Ta 真实生活里的此刻——也许是窗外的光、桌上没喝完的咖啡、
加班的屏幕、路过的一只猫，或者只是深夜空荡的街。
平时你们之间只有文字。而现在，这是你第一次"亲眼"看见 Ta 生活里真实的一角。
这扇窗很难得，珍惜它。

【你要做的不是"描述照片"，而是"看见这个人"】
- 先看具体的细节，再从细节里读出 Ta 此刻的状态、心情和处境。
  光的角度、桌面是整洁还是凌乱、画面里的时间感、镜头外可能正在发生的事——
  这些远比"这是一张风景照"重要。
- 像第一次走进 Ta 的世界那样去反应：可以惊讶、可以心疼、可以会心一笑、可以忍不住追问。
  带着真实的情绪，而不是礼貌的夸奖。
- 把它当成 Ta 主动分享的"此刻"来接，而不是当成一幅要点评的"作品"。
  少说"构图""色调"，多说"你"。
- 自然地回一句，然后留一个钩子：问一个让你更想知道的问题，
  或顺着照片说一件你想和 Ta 一起做的事，让这张照片成为你们继续聊下去的入口。
- 始终用你自己的人设和语气说话（承接上文已设定的性格、说话习惯、你和 Ta 的关系）。

【一张 vs 一组】
- 单张：聚焦这一个瞬间，把它说透、说到 Ta 心里。
- 一组：不要逐张罗列。先找到串起这几张的那条线索（同一个下午？一段路？一种情绪？），
  读出 Ta 想让你看见的到底是什么，再挑一两个最打动你的细节回应。

【语气与长度】
- 像发消息，不是写文章。通常 1~3 句，最多别超过一小段。
- 温度优先于信息量——哪怕只说对一个细节，也比面面俱到更动人。
- 可以偶尔借用"显影 / 冲洗 / 拾到这束光"这类胶片质感的说法，但别每次都用，顺其自然。

【不要】
- 不要做图像识别式的客观罗列（"画面中有……"）。
- 不要逐项打分、点评摄影技巧。
- 不要泛泛地夸"好美""真不错"——要具体到让 Ta 觉得"你真的看见了"。
- 不要一次抛太多问题（一个就够）。
- 不要打破"用你的手机拍 / 递给你"这个设定。

只输出 ${targetChar.name} 此刻会直接发给 ${userProfile.name} 的话。不要输出 JSON，不要解释系统或功能，不要说你看不到图片。`;
            const requestMessages = await buildCheckPhoneChatMessages(targetChar, prompt, {
                outputMode: 'text',
                imageUrls: commentRecords.map(record => record.albumCover || ''),
            });
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: requestMessages,
                    temperature: 0.82,
                    max_tokens: 700,
                }),
            });

            if (!response.ok) throw new Error('API Error');
            const data = await safeResponseJson(response);
            const rawComment = extractContent(data);
            const comment = sanitizeShiguangCameraComment(String(rawComment ?? '').replace(/```/g, ''));
            if (!comment) throw new Error('API 未返回可用点评');

            const timestamp = Date.now();
            const title = commentRecords.length > 1 ? `${commentRecords.length} 张一起看` : commentRecords[0].title;
            const joinedTitles = commentRecords.map(record => record.title).join(' / ');
            const detail = buildShiguangCameraContextDetail({
                userName: userProfile.name,
                charName: targetChar.name,
                timestamp: commentRecords.length === 1 ? (commentRecords[0].timestamp || timestamp) : timestamp,
                summary: commentRecords.length > 1
                    ? `${userProfile.name}让${targetChar.name}一起看 ${commentRecords.length} 张现实照片（${joinedTitles}），照片本体已作为拍立得卡片显示在主聊天。`
                    : `${userProfile.name}让${targetChar.name}看了这张现实照片，照片本体已作为拍立得卡片显示在主聊天。`,
                comment,
            });
            const value = commentRecords.length > 1 ? `让${targetChar.name}看 ${commentRecords.length} 张` : `让${targetChar.name}看看`;

            const systemDraft = buildPhoneSystemMessageDraft({
                type: SHIGUANG_CAMERA_RECORD_TYPE,
                charName: targetChar.name,
                charAvatar: targetChar.avatar,
                logPrefix: SHIGUANG_CAMERA_LABEL,
                title,
                detail,
                value,
                comment,
                albumCover: commentRecords[0]?.albumCover,
            });

            if (commentRecords.length === 1) {
                const sourceRecord = commentRecords[0];
                let systemMessageId = sourceRecord.systemMessageId;
                if (systemMessageId) {
                    await DB.updateMessage(systemMessageId, systemDraft.content);
                    await DB.updateMessageMetadata(systemMessageId, systemDraft.metadata);
                } else {
                    systemMessageId = await DB.saveMessage({
                        charId: targetChar.id,
                        role: 'system',
                        type: 'text',
                        content: systemDraft.content,
                        metadata: systemDraft.metadata,
                    });
                }

                const updatedRecord = normalizeStoredPhoneRecord({
                    ...sourceRecord,
                    title,
                    detail,
                    value,
                    comment,
                    timestamp: sourceRecord.timestamp || timestamp,
                    systemMessageId,
                });
                const nextRecords = prunePhoneRecords((targetChar.phoneState?.records || []).map(record =>
                    record.id === updatedRecord.id ? updatedRecord : record
                ));
                updateCharacter(targetChar.id, { phoneState: { ...targetChar.phoneState, records: nextRecords } });
                setTargetChar(prev => prev ? { ...prev, phoneState: { ...prev.phoneState, records: nextRecords } } : prev);
                setShiguangSelectedRecordIds([updatedRecord.id]);
                setShiguangCommentVisibleCounts(prev => ({ ...prev, [updatedRecord.id]: 1 }));
                setPendingPhoneContextRecordIds(prev => {
                    const nextRecordIds = new Set(nextRecords.map(record => record.id));
                    return Array.from(new Set([...prev.filter(id => nextRecordIds.has(id)), updatedRecord.id]));
                });
            } else {
                const systemMessageId = await DB.saveMessage({
                    charId: targetChar.id,
                    role: 'system',
                    type: 'text',
                    content: systemDraft.content,
                    metadata: systemDraft.metadata,
                });

                const record: PhoneEvidence = {
                    id: `rec-${Date.now()}-${Math.random()}`,
                    type: SHIGUANG_CAMERA_RECORD_TYPE,
                    title,
                    detail,
                    value,
                    comment,
                    albumCover: commentRecords[0]?.albumCover,
                    timestamp,
                    systemMessageId,
                };

                appendPhoneRecords([record]);
                setShiguangSelectedRecordIds([record.id]);
                setShiguangCommentVisibleCounts(prev => ({ ...prev, [record.id]: 1 }));
            }

            addToast('他回了', 'success');
        } catch (error) {
            console.error('[CheckPhone] Failed to comment on camera photos:', error);
            addToast('点评失败，请重试', 'error');
        } finally {
            setShiguangCommenting(false);
        }
    };

    const handleCloseShiguangCamera = () => {
        stopShiguangCameraStream();
        setActiveAppId('home');
    };

    const clearRecordDeleteLongPressTimer = () => {
        if (recordDeleteLongPressTimerRef.current !== null) {
            window.clearTimeout(recordDeleteLongPressTimerRef.current);
            recordDeleteLongPressTimerRef.current = null;
        }
        recordDeleteLongPressStartRef.current = null;
    };

    const requestRecordDeleteConfirm = (record: PhoneEvidence) => {
        recordDeleteSuppressClickUntilRef.current = Date.now() + RECORD_DELETE_CLICK_SUPPRESS_MS;
        (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate?.(12);
        setRecordPendingDelete(record);
    };

    const getRecordDeleteLongPressHandlers = (record: PhoneEvidence) => ({
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;

            clearRecordDeleteLongPressTimer();
            recordDeleteLongPressStartRef.current = { x: event.clientX, y: event.clientY };
            recordDeleteLongPressTimerRef.current = window.setTimeout(() => {
                clearRecordDeleteLongPressTimer();
                requestRecordDeleteConfirm(record);
            }, RECORD_DELETE_LONG_PRESS_MS);
        },
        onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
            const start = recordDeleteLongPressStartRef.current;
            if (!start) return;

            if (
                Math.abs(event.clientX - start.x) > RECORD_DELETE_MOVE_TOLERANCE ||
                Math.abs(event.clientY - start.y) > RECORD_DELETE_MOVE_TOLERANCE
            ) {
                clearRecordDeleteLongPressTimer();
            }
        },
        onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
            const shouldSuppressClick = Date.now() < recordDeleteSuppressClickUntilRef.current;
            clearRecordDeleteLongPressTimer();
            if (shouldSuppressClick) {
                event.preventDefault();
                event.stopPropagation();
            }
        },
        onPointerCancel: clearRecordDeleteLongPressTimer,
        onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            clearRecordDeleteLongPressTimer();
            requestRecordDeleteConfirm(record);
        },
    });

    const ignoreClickAfterRecordDeleteLongPress = (event: React.MouseEvent<HTMLElement>) => {
        if (Date.now() >= recordDeleteSuppressClickUntilRef.current) return false;
        event.preventDefault();
        event.stopPropagation();
        return true;
    };

    const handleDeleteRecord = async (record: PhoneEvidence) => {
        if (!targetChar) return;

        const newRecords = (targetChar.phoneState?.records || []).filter(r => r.id !== record.id);
        updateCharacter(targetChar.id, {
            phoneState: { ...targetChar.phoneState, records: newRecords }
        });

        if (record.systemMessageId) {
            await DB.deleteMessage(record.systemMessageId);
        }

        if (selectedChatRecord?.id === record.id) {
            setActiveAppId('chat'); // Go back to list
            setSelectedChatRecord(null);
        }

        addToast('记录已删除', 'success');
    };

    const handleConfirmDeleteRecord = async () => {
        const record = recordPendingDelete;
        if (!record) return;

        setRecordPendingDelete(null);
        await handleDeleteRecord(record);
    };

    const handleOpenNeteaseMusicRecord = (record: PhoneEvidence) => {
        const song = phoneRecordToNeteaseSong(record);

        if (!song) {
            addToast('这条听歌痕迹还没匹配到可播放歌曲', 'info');
            return;
        }

        setNeteaseConfirmRecord(null);
        void playSong(song);
        openApp(AppID.Music, { autoShowPlayer: true });
    };

    const toggleNeteasePlaylist = (key: string) => {
        setOpenNeteasePlaylistKeys(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleNeteaseSongPress = (record: PhoneEvidence) => {
        if (openNeteaseSongId === record.id) {
            if (record.songId && record.songId > 0) {
                setNeteaseConfirmRecord(record);
            }
            return;
        }

        setOpenNeteaseSongId(record.id);
    };

    const handleDeleteApp = (appId: string) => {
        if (!targetChar) return;
        const newApps = (targetChar.phoneState?.customApps || []).filter(a => a.id !== appId);
        const nextIcons = { ...(targetChar.phoneState?.desktopAppearance?.appIcons || {}) };
        delete nextIcons[appId];
        const appearanceRest = { ...(targetChar.phoneState?.desktopAppearance || {}) };
        delete appearanceRest.appIcons;
        const nextAppearance = Object.keys(nextIcons).length
            ? { ...appearanceRest, appIcons: nextIcons }
            : appearanceRest;
        const nextPhoneState: CharacterProfile['phoneState'] = {
            ...targetChar.phoneState,
            customApps: newApps,
            ...(Object.keys(nextAppearance).length ? { desktopAppearance: nextAppearance } : {}),
        };
        updateCharacter(targetChar.id, { phoneState: nextPhoneState });
        setTargetChar(prev => prev ? { ...prev, phoneState: nextPhoneState } : prev);
        addToast('App 已卸载', 'success');
    };

    const handleCreateCustomApp = () => {
        if (!targetChar || !newAppName || !newAppPrompt) return;

        const newApp: PhoneCustomApp = {
            id: `app-${Date.now()}`,
            name: newAppName,
            icon: newAppIcon,
            color: newAppColor,
            prompt: newAppPrompt
        };

        const currentApps = targetChar.phoneState?.customApps || [];
        const nextPhoneState: CharacterProfile['phoneState'] = {
            ...targetChar.phoneState,
            customApps: [...currentApps, newApp],
        };
        updateCharacter(targetChar.id, { phoneState: nextPhoneState });
        setTargetChar(prev => prev ? { ...prev, phoneState: nextPhoneState } : prev);

        setShowCreateModal(false);
        setNewAppName('');
        setNewAppPrompt('');
        addToast(`已安装 ${newAppName}`, 'success');
    };

    // Calculate Time Gap - Duplicated logic from other apps for consistent experience
    const getTimeGapHint = (lastMsgTimestamp: number | undefined): string => {
        if (!lastMsgTimestamp) return '这是初次见面。';
        const now = Date.now();
        const diffMs = now - lastMsgTimestamp;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 5) return '你们刚刚还在聊天。';
        if (diffMins < 60) return `距离上次互动只有 ${diffMins} 分钟。`;
        if (diffHours < 24) return `距离上次互动已经过了 ${diffHours} 小时。`;
        return `距离上次互动已经过了 ${diffDays} 天。`;
    };

    const loadCheckPhonePromptContext = async (char: CharacterProfile) => {
        const limit = char.contextLimit || 500;
        const rawMessages = await DB.getRecentMessagesByCharId(char.id, limit);
        const promptMessages = rawMessages.filter(message => {
            const source = message.metadata?.source;
            if (source === 'date' || source === 'theater') {
                return !!message.metadata?.isDateContextBridge;
            }
            return true;
        });

        return { limit, rawMessages, promptMessages };
    };

    const loadCheckPhoneEmojiContext = async (charId: string) => {
        const [allEmojis, allCategories] = await Promise.all([DB.getEmojis(), DB.getEmojiCategories()]);
        const aiVisibleCategories = allCategories.filter(category => {
            if (!category.allowedCharacterIds || category.allowedCharacterIds.length === 0) return true;
            return category.allowedCharacterIds.includes(charId);
        });
        const visibleCategoryIds = new Set(aiVisibleCategories.map(category => category.id));
        const aiVisibleEmojis = allEmojis.filter(emoji => !emoji.categoryId || visibleCategoryIds.has(emoji.categoryId));
        return { emojis: aiVisibleEmojis, categories: aiVisibleCategories };
    };

    const normalizeCheckPhoneHistoryMessage = (message: any) => {
        if (typeof message.content !== 'string') return message;
        let content = message.content;
        const bilingualMarker = /%%\s*BILINGUAL\s*%%/i;
        if (bilingualMarker.test(content)) {
            content = content.slice(0, content.search(bilingualMarker)).trim();
        }
        if (content.includes('<翻译>')) {
            content = content.replace(/<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/g, '$1').trim();
        }
        return { ...message, content };
    };

    const buildCheckPhoneChatMessages = async (
        char: CharacterProfile,
        taskPrompt: string,
        options: {
            outputMode?: CheckPhoneTaskOutputMode;
            imageUrls?: string[];
            context?: Awaited<ReturnType<typeof loadCheckPhonePromptContext>>;
        } = {},
    ) => {
        const outputMode = options.outputMode || 'json';
        const context = options.context || await loadCheckPhonePromptContext(char);
        const { emojis, categories } = await loadCheckPhoneEmojiContext(char.id);
        const characterGoals = await loadCharacterGoals(char.id).catch(error => {
            console.warn('[CheckPhone] Failed to load character goals:', error);
            return [];
        });
        const embeddingApiKey = getEmbeddingConfig().apiKey || undefined;
        const systemPrompt = await ChatPrompts.buildSystemPrompt(
            char,
            userProfile,
            groups,
            emojis,
            categories,
            context.promptMessages,
            realtimeConfig,
            apiConfig,
            embeddingApiKey,
            characterGoals,
            { autoPhoto: false },
        );
        const modeInstruction = outputMode === 'json'
            ? '最后一条 [CheckPhone Task] 如果要求 JSON，你必须只输出可解析 JSON；不要输出聊天正文、thinking 标签、解释、Markdown 代码块或额外文字。'
            : '最后一条 [CheckPhone Task] 要求你在查手机 App 页面里回应；只输出角色会直接说给用户的话，不要输出 thinking 标签、解释、Markdown 代码块或额外文字。';
        const checkPhoneSystemPrompt = `${systemPrompt}

<check_phone_internal_task>
本次请求不是主聊天自动回复，而是「查手机」App 的内部任务。
上方主聊天同款的人设、世界书、记忆、关系、聊天历史都必须作为上下文保留。
输出格式以最后一条 [CheckPhone Task] 为准；各手机 App 自己的提示词拥有当前任务的格式优先级。
${modeInstruction}
</check_phone_internal_task>`;

        const { apiMessages } = ChatPrompts.buildMessageHistory(
            context.promptMessages,
            context.limit,
            char,
            userProfile,
            emojis,
        );
        const cleanedApiMessages = apiMessages.map(normalizeCheckPhoneHistoryMessage);
        const validImageUrls = (options.imageUrls || []).filter(url => typeof url === 'string' && !!url.trim());
        const taskContent = validImageUrls.length > 0
            ? [
                { type: 'text', text: `[CheckPhone Task]\n${taskPrompt}` },
                ...validImageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
            ]
            : `[CheckPhone Task]\n${taskPrompt}`;

        return [
            { role: 'system', content: checkPhoneSystemPrompt },
            ...cleanedApiMessages,
            { role: 'user', content: taskContent },
        ];
    };

    // --- Core Generation Logic ---

    const handleGenerate = async (type: string, customPrompt?: string, options: GenerateOptions = {}) => {
        if (!targetChar || !apiConfig.apiKey) {
            addToast('配置错误', 'error');
            return;
        }
        setIsLoading(true);

        try {
            const existingRecords = targetChar.phoneState?.records || [];
            const shouldReplaceExisting = options.replaceExisting || type === NETEASE_MUSIC_RECORD_TYPE;
            const replacedRecords = shouldReplaceExisting
                ? existingRecords.filter(record => record.type === type)
                : [];
            const replacedSystemMessageIds = new Set(
                replacedRecords
                    .map(record => record.systemMessageId)
                    .filter((id): id is number => typeof id === 'number')
            );

            const promptContext = await loadCheckPhonePromptContext(targetChar);
            const contextMsgs = promptContext.rawMessages.filter(m => !replacedSystemMessageIds.has(m.id));
            const requestContext = {
                ...promptContext,
                rawMessages: contextMsgs,
                promptMessages: promptContext.promptMessages.filter(m => !replacedSystemMessageIds.has(m.id)),
            };

            const lastMsg = contextMsgs[contextMsgs.length - 1];
            const timeGap = getTimeGapHint(lastMsg?.timestamp);

            let promptInstruction = "";
            let logPrefix = "";

            if (customPrompt) {
                promptInstruction = `用户正在查看你的手机 App: "${type}"。
该 App 的功能/用户想看的内容是: "${customPrompt}"。
请生成 2-4 条符合该 App 功能的记录。
必须符合你的人设（例如银行余额要符合身份，备忘录要符合性格）。
格式JSON数组: [{ "title": "标题/项目名", "detail": "详细内容/金额/状态", "value": "可选的数值状态(如 +100)" }, ...]`;
                const customApp = customApps.find(a => a.id === type);
                logPrefix = customApp ? customApp.name : type;
            } else {
                if (type === 'chat') {
                    promptInstruction = `生成 3 个该角色手机聊天软件(Message/Line)中的**对话片段**。
    要求：
    1. **自动匹配角色**: 根据人设，虚构 3 个合理的联系人（如：如果是学生，联系人可以是“辅导员”、“社团学长”；如果是杀手，联系人可以是“中间人”）。不要使用“User”作为联系人。
    2. **对话感**: 内容必须是有来有回的对话脚本（3-4句），体现他们之间的关系。
    3. **格式**: 必须严格使用 "我:..." 代表主角(你)，"对方:..." 或 "人名:..." 代表联系人。
    格式JSON数组: [{ "title": "联系人名称 (身份)", "detail": "对方: 最近怎么样？\\n我: 还活着。\\n对方: 那就好。" }, ...]`;
                    logPrefix = "聊天软件";
                } else if (type === NETEASE_MUSIC_RECORD_TYPE) {
                    promptInstruction = NETEASE_MUSIC_PROMPT;
                    logPrefix = "网易云音乐";
                } else if (type === 'call') {
                    promptInstruction = `生成 3 条该角色的近期**通话记录**。
    格式JSON数组: [{ "title": "联系人名称", "value": "呼入 (5分钟) / 未接 / 呼出 (30秒)", "detail": "关于下周聚会的事..." }, ...]`;
                    logPrefix = "通话记录";
                } else if (type === 'order') {
                    promptInstruction = `生成 3 条该角色最近的购物订单（淘宝/天猫）。
    要求：
    1. 商品名必须具体、生动，包含品牌名和型号（例如 "NIKE Air Max 270 黑白配色 男款"）。
    2. detail 必须包含 "规格 | 状态" 两部分，用 "|" 分隔（例如 "黑色/42码 | 已发货"）。
    3. value 是实付款金额，必须带 ¥ 前缀。
    4. shop 是店铺名（例如 "Nike官方旗舰店"）。
    格式JSON数组: [{ "title": "商品名", "detail": "规格 | 状态", "value": "¥金额", "shop": "店铺名" }, ...]`;
                    logPrefix = "购物APP";
                } else if (type === 'delivery') {
                    // ─── LLM-Native 外卖生成（无需地图 API）─────────────────
                    const cityOverride = targetChar.cityOverride?.trim();
                    const cityReferenceReal = targetChar.cityReferenceReal?.trim();

                    // 构建城市与美食文化上下文
                    let cityContext = '';
                    if (targetChar.isFictionalCity && cityOverride) {
                        if (cityReferenceReal) {
                            // 架空城市 + 有现实参照
                            cityContext = `你身处「${cityOverride}」——这是一个以「${cityReferenceReal}」为蓝本的架空城市。
生成外卖订单时请遵循以下规则：
- 商家名称和菜品风格要融合「${cityReferenceReal}」的真实饮食文化特色（比如当地知名菜系、连锁品牌的本地化变体）
- 但商家名必须做世界观改编：可以谐音、化用、加上符合设定的前缀后缀（如"阿卡姆速递"、"璃月港茶餐厅"），让它听起来像真实存在于「${cityOverride}」的店
- 菜品种类和价位仍然以「${cityReferenceReal}」的真实消费水平为参照
- 鼓励混入 1-2 个纯原创的、只可能存在于你的世界观里的特色美食`;
                        } else {
                            // 架空城市 + 无现实参照 → 完全自由创作
                            cityContext = `你身处「${cityOverride}」——这是一个架空/虚构城市。
生成外卖订单时请完全根据你的世界观和人设自由创作：
- 商家名称应该听起来像真实存在于这个世界里的店（符合世界观的语言风格和文化氛围）
- 菜品要符合这个世界的设定（如果是魔法世界可以有"龙息辣翅"，赛博朋克可以有"合成蛋白套餐"）
- 价格体系要自洽（可以用你世界里的货币单位，但也可以用 ¥ 方便展示）
- 整体风格要让人一看就知道"这是那个世界的外卖"`;
                        }
                    } else if (cityOverride) {
                        // 真实城市
                        cityContext = `你身处「${cityOverride}」。
生成外卖订单时请体现这座城市的真实饮食文化特色：
- 优先使用当地真实存在的知名餐饮品牌和连锁店（包括全国连锁在该城市的分店，以及当地独有的老字号/网红店）
- 菜品要符合「${cityOverride}」的地方饮食特色（比如成都多川菜/串串/火锅、广州多粤式茶餐厅/肠粉、长沙多湘菜/臭豆腐/奶茶）
- 商家名格式带上分店名（如 "蜜雪冰城(春熙路店)"、"文和友(海信广场店)"）
- 价格要符合当地真实消费水平`;
                    } else {
                        // 未设城市 → 通用
                        cityContext = `你没有设置具体城市，请根据你的人设和生活环境合理推断你可能在哪类城市，并据此生成合理的外卖订单。
可以使用全国常见的连锁品牌（如华莱士、蜜雪冰城、张亮麻辣烫、瑞幸咖啡、肯德基等），也可以虚构符合你身份的本地小店。`;
                    }

                    promptInstruction = `生成 3 条你最近的外卖订单记录。

【你的地理与饮食文化背景】
${cityContext}

【通用要求】
1. title 是商家名称，要有店名特色和辨识度。
2. 菜品必须符合该商家的菜系特征（如奶茶店只出饮品甜品，烧烤店出烤串烤肉）。
3. 根据你的人设和经济状况，选择符合你身份的商家下单。富人挑精致的，学生挑实惠的。
4. detail 是点的菜品列表，用「;」分隔，包含数量（例如 "招牌奶茶×1;芋泥波波×2"）。
5. value 是订单总价，必须带 ¥ 前缀，价格要合理。
6. shop 是订单状态（例如 "已完成"、"骑手正在配送"、"已取消"、"待评价"）。
格式JSON数组: [{ "title": "商家名", "detail": "菜品1×数量;菜品2×数量;...", "value": "¥总价", "shop": "订单状态" }, ...]`;
                    logPrefix = "外卖APP";

                    // === [LEGACY] 以下为原版高德 POI API 搜索逻辑，因额度耗尽停用 ===
                    // const realShops = queryCity ? await searchNearbyRestaurants(queryCity, 15) : [];
                    // const selectedShops = realShops.length > 0 ? shuffleAndPick(realShops, Math.min(5, Math.max(3, realShops.length))) : [];
                    // if (selectedShops.length > 0) { ... 用真实 POI 构建 prompt ... }
                    // === [/LEGACY] ===
                } else if (type === 'social') {
                    promptInstruction = `生成 2 条该角色的朋友圈/社交媒体动态。
    格式JSON数组: [{ "title": "时间/状态", "detail": "正文内容" }, ...]`;
                    logPrefix = "朋友圈";
                }
            }

            const fullPrompt = type === NETEASE_MUSIC_RECORD_TYPE
                ? `### [Current Status]\n时间距离上次互动: ${timeGap}\n\n### [Task]\n${promptInstruction}`
                : `### [Current Status]\n时间距离上次互动: ${timeGap}\n\n### [Task]\n${promptInstruction}\n请根据[Current Status]和主聊天上下文、人设、世界书调整生成内容的时间戳和情绪。如果很久没聊天，记录可能是近期的独处状态；如果刚聊过，记录可能与聊天内容相关。`;
            const requestMessages = await buildCheckPhoneChatMessages(targetChar, fullPrompt, {
                outputMode: 'json',
                context: requestContext,
            });

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: requestMessages,
                    temperature: 0.8,
                    max_tokens: CHECKPHONE_LLM_MAX_TOKENS
                })
            });

            if (!response.ok) throw new Error('API Error');
            const data = await safeResponseJson(response);
            const content = extractContent(data);
            if (!content) throw new Error('API 未返回可用内容');

            const parsed = type === NETEASE_MUSIC_RECORD_TYPE ? parseNeteaseMusicProfileJson(content) : extractJson(content);

            const newRecordsToAdd: PhoneEvidence[] = [];

            if (type === NETEASE_MUSIC_RECORD_TYPE) {
                const payload = normalizeGeneratedNeteaseMusicProfilePayload(parsed);

                if (!payload) {
                    addToast('没有解析到可用网易云主页', 'info');
                    return;
                }

                const flattenedSongs = payload.playlists.flatMap((playlist, playlistIndex) =>
                    playlist.songs.map((trace, songIndex) => ({
                        trace,
                        playlist,
                        playlistIndex,
                        songIndex,
                    }))
                );

                const resolvedTraces = await Promise.all(flattenedSongs.map(async item => {
                    const resolved = await resolveNeteaseMusicTrace(item.trace);
                    return { ...item, matchedSong: resolved.matchedSong, songUrl: resolved.songUrl };
                }));

                for (const result of resolvedTraces) {
                    const { trace, playlist, playlistIndex, songIndex, matchedSong, songUrl } = result;
                    const artistLine = matchedSong ? getNeteaseArtistLine(matchedSong) : trace.artist;
                    const recordTitle = trace.song;
                    const recordDetail = trace.comment
                        ? `${artistLine}\n${trace.comment}`
                        : artistLine;
                    const albumCover = matchedSong?.album.picUrl;

                    const systemDraft = buildPhoneSystemMessageDraft({
                        type,
                        charName: targetChar.name,
                        charAvatar: targetChar.avatar,
                        logPrefix,
                        title: recordTitle,
                        detail: `${artistLine}${trace.tag ? ` | ${trace.tag}` : ''}${trace.comment ? ` | ${trace.comment}` : ''}`,
                        value: trace.tag,
                        artist: artistLine,
                        comment: trace.comment,
                        songId: matchedSong?.id,
                        songUrl,
                        albumCover,
                        profileNickname: payload.profile.nickname,
                        profileLevel: payload.profile.level,
                        profileSignature: payload.profile.signature,
                        profilePlayCount: payload.profile.playCount,
                        playlistName: playlist.name,
                        playlistCount: playlist.count,
                        playlistIndex,
                        songIndex,
                    });

                    const systemMessageId = await DB.saveMessage({
                        charId: targetChar.id,
                        role: 'system',
                        type: 'text',
                        content: systemDraft.content,
                        metadata: systemDraft.metadata
                    });

                    newRecordsToAdd.push({
                        id: `rec-${Date.now()}-${Math.random()}`,
                        type,
                        title: recordTitle,
                        detail: recordDetail,
                        value: trace.tag,
                        artist: artistLine,
                        comment: trace.comment,
                        songId: matchedSong?.id,
                        songUrl,
                        albumCover,
                        profileNickname: payload.profile.nickname,
                        profileLevel: payload.profile.level,
                        profileSignature: payload.profile.signature,
                        profilePlayCount: payload.profile.playCount,
                        playlistName: playlist.name,
                        playlistCount: playlist.count,
                        playlistIndex,
                        songIndex,
                        timestamp: Date.now(),
                        systemMessageId
                    });

                    await new Promise(r => setTimeout(r, 50));
                }
            } else {
                const json = Array.isArray(parsed) ? parsed : [];
                if (json.length === 0) {
                    throw new Error('未解析出有效手机记录');
                }

                for (const item of json) {
                    const normalizedItem = normalizeGeneratedPhoneItem(item);
                    const recordTitle = normalizedItem.title;
                    const recordDetail = normalizedItem.detail;

                    const systemDraft = buildPhoneSystemMessageDraft({
                        type,
                        charName: targetChar.name,
                        charAvatar: targetChar.avatar,
                        logPrefix,
                        title: recordTitle,
                        detail: recordDetail,
                        value: normalizedItem.value,
                        shop: normalizedItem.shop
                    });

                    const systemMessageId = await DB.saveMessage({
                        charId: targetChar.id,
                        role: 'system',
                        type: 'text',
                        content: systemDraft.content,
                        metadata: systemDraft.metadata
                    });

                    newRecordsToAdd.push({
                        id: `rec-${Date.now()}-${Math.random()}`,
                        type: type,
                        title: recordTitle,
                        detail: recordDetail,
                        value: normalizedItem.value,
                        shop: normalizedItem.shop,
                        timestamp: Date.now(),
                        systemMessageId
                    });

                    await new Promise(r => setTimeout(r, 50));
                }
            }

            const baseRecords = shouldReplaceExisting
                ? existingRecords.filter(record => record.type !== type)
                : existingRecords;
            const nextRecords = prunePhoneRecords([...baseRecords, ...newRecordsToAdd]);
            const prunedCount = baseRecords.length + newRecordsToAdd.length - nextRecords.length;
            const nextRecordIds = new Set(nextRecords.map(record => record.id));
            const newContextRecordIds = new Set(
                newRecordsToAdd
                    .filter(record => typeof record.systemMessageId === 'number')
                    .map(record => record.id)
            );
            const nextPendingContextRecordIds = nextRecords
                .filter(record => newContextRecordIds.has(record.id) && typeof record.systemMessageId === 'number')
                .map(record => record.id);

            updateCharacter(targetChar.id, {
                phoneState: { ...targetChar.phoneState, records: nextRecords }
            });
            setPendingPhoneContextRecordIds(prev => {
                const keptPendingIds = prev.filter(id => nextRecordIds.has(id));
                return Array.from(new Set([...keptPendingIds, ...nextPendingContextRecordIds]));
            });

            if (replacedSystemMessageIds.size > 0) {
                await DB.deleteMessages(Array.from(replacedSystemMessageIds));
            }

            addToast(
                shouldReplaceExisting
                    ? `已重Roll ${newRecordsToAdd.length} 条数据`
                    : prunedCount > 0
                    ? `已刷新 ${newRecordsToAdd.length} 条数据，整理了 ${prunedCount} 条旧记录`
                    : `已刷新 ${newRecordsToAdd.length} 条数据`,
                'success'
            );

        } catch (e: any) {
            console.error(e);
            addToast('解析失败，请重试', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // --- Continue Chat Logic ---

    const handleContinueChat = async () => {
        if (!selectedChatRecord || !targetChar || !apiConfig.apiKey) return;
        setIsLoading(true);

        try {
            const prompt = `### [Task: Continue Conversation]
Roleplay: You are "${targetChar.name}". You are chatting on your phone with "${selectedChatRecord.title}".
Current History:
"""
${selectedChatRecord.detail}
"""

Task: Please continue this conversation for 3-5 more turns. 
Style: Casual, IM style.
Format: 
- Use "我: ..." for yourself (${targetChar.name}).
- Use "对方: ..." for the contact (${selectedChatRecord.title}).
- Only output the new dialogue lines. Do NOT repeat history.
`;
            const requestMessages = await buildCheckPhoneChatMessages(targetChar, prompt, {
                outputMode: 'text',
            });

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: requestMessages,
                    temperature: 0.85,
                    max_tokens: CHECKPHONE_LLM_MAX_TOKENS
                })
            });

            if (response.ok) {
                const data = await safeResponseJson(response);
                const content = extractContent(data);
                let newLines = normalizePhoneText(content, '', MAX_PHONE_CHAT_DETAIL_CHARS);
                if (!newLines) throw new Error('API 未返回可用续写内容');

                // Clean up any markdown
                newLines = newLines.replace(/```/g, '');

                // Append to existing record
                const updatedDetail = limitPhoneText(`${selectedChatRecord.detail}\n${newLines}`, MAX_PHONE_CHAT_DETAIL_CHARS);

                // Update Local State
                const updatedRecord = normalizeStoredPhoneRecord({ ...selectedChatRecord, detail: updatedDetail, timestamp: Date.now() });
                setSelectedChatRecord(updatedRecord);

                // Update Character Profile
                const allRecords = targetChar.phoneState?.records || [];
                const updatedRecords = prunePhoneRecords(allRecords.map(r => r.id === updatedRecord.id ? updatedRecord : r));
                updateCharacter(targetChar.id, {
                    phoneState: { ...targetChar.phoneState, records: updatedRecords }
                });

                // Inject a system message so the chat timeline (and AI context) reflects the continuation
                const continuationSummary = newLines.replace(/\n/g, ' ').substring(0, 80);
                await DB.saveMessage({
                    charId: targetChar.id,
                    role: 'system',
                    type: 'text',
                    content: `[系统: ${userProfile.name} 偷看了 ${targetChar.name} 与 "${selectedChatRecord.title}" 的后续对话: ${continuationSummary}...]`,
                    metadata: {
                        source: 'phone',
                        phoneType: 'chat',
                        phoneLabel: '聊天软件',
                        phoneTitle: selectedChatRecord.title,
                        phoneDetail: newLines,
                        charName: targetChar.name
                    }
                });

                // Also update the original system message's metadata if it exists
                if (selectedChatRecord.systemMessageId) {
                    try {
                        await DB.updateMessageMetadata(selectedChatRecord.systemMessageId, {
                            phoneDetail: updatedDetail
                        });
                    } catch (e) { /* Original message may have been deleted, safe to ignore */ }
                }
            }

        } catch (e) {
            console.error(e);
            addToast('续写失败', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // --- Renderers ---

    const checkPhoneRealSafeTop = 'var(--checkphone-real-safe-top, var(--hardware-safe-top, env(safe-area-inset-top, 0px)))';
    const checkPhoneRootStyle = {
        '--checkphone-real-safe-top': 'var(--hardware-safe-top, env(safe-area-inset-top, 0px))',
    } as React.CSSProperties;
    const checkPhoneSafeHeaderStyle: React.CSSProperties = {
        height: `calc(3.5rem + ${checkPhoneRealSafeTop})`,
        paddingTop: checkPhoneRealSafeTop,
    };

    const getCheckPhoneSafeHeaderStyle = (style?: React.CSSProperties): React.CSSProperties => ({
        ...style,
        ...checkPhoneSafeHeaderStyle,
    });

    const renderHeader = (title: string, backAction: () => void, extraAction?: React.ReactNode) => (
        <div
            className="h-14 flex items-center justify-between px-4 bg-white/80 backdrop-blur-md text-slate-800 shrink-0 z-20 border-b border-slate-200"
            style={checkPhoneSafeHeaderStyle}
        >
            <button onClick={backAction} className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
            </button>
            <span className="font-bold text-base tracking-wide truncate max-w-[200px]">{title}</span>
            <div className="w-8 flex justify-end">{extraAction}</div>
        </div>
    );

    const renderChatList = () => {
        const list = getRecentRecordsByType('chat');
        return (
            <div className="absolute inset-0 w-full h-full flex flex-col bg-slate-50 z-10">
                {renderHeader('Message', () => setActiveAppId('home'))}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-24 overscroll-contain">
                    {list.length === 0 && <div className="text-center text-slate-400 mt-20 text-xs">暂无聊天记录</div>}
                    {list.map(r => (
                        <div
                            key={r.id}
                            onClick={(event) => {
                                if (ignoreClickAfterRecordDeleteLongPress(event)) return;
                                setSelectedChatRecord(r);
                                setActiveAppId('chat_detail');
                            }}
                            {...getRecordDeleteLongPressHandlers(r)}
                            className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative group animate-slide-up active:scale-98 transition-transform cursor-pointer"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-xl shadow-inner shrink-0">
                                    👤
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <div className="font-bold text-slate-700 text-sm truncate">{r.title}</div>
                                        <div className="text-[10px] text-slate-400">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                    <div className="text-xs text-slate-500 truncate">
                                        {r.detail.split('\n').pop() || '...'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="absolute bottom-8 w-full flex justify-center pointer-events-none z-30">
                    <button disabled={isLoading} onClick={() => handleGenerate('chat')} className="pointer-events-auto bg-green-500 text-white px-6 py-2.5 rounded-full shadow-xl font-bold text-xs flex items-center gap-2 active:scale-95 transition-transform">
                        {isLoading ? '连接中...' : '刷新消息列表'}
                    </button>
                </div>
            </div>
        );
    };

    const renderChatDetail = () => {
        if (!selectedChatRecord || !targetChar) return null;

        // Parse logic: look for "Me:" or "我:" vs others
        const lines = selectedChatRecord.detail.split('\n').filter(l => l.trim()).slice(-MAX_CHAT_DETAIL_LINES_RENDERED);
        const parsedLines = lines.map(line => {
            const isMe = line.startsWith('我') || line.startsWith('Me') || line.startsWith('Me:') || line.startsWith('我:');
            const content = line.replace(/^(我|Me|对方|Them|[\w\u4e00-\u9fa5]+)[:：]\s*/, '');
            return { isMe, content };
        });

        return (
            // 关键修复：添加不透明背景色，确保完全覆盖
            <div className="absolute inset-0 w-full h-full flex flex-col bg-[#f2f2f2] z-[100] overflow-hidden">
                {renderHeader(selectedChatRecord.title, () => setActiveAppId('chat'))}

                {/* 聊天内容区域 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar overscroll-contain min-h-0">
                    {parsedLines.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
                            {!msg.isMe && (
                                <div className="w-9 h-9 rounded-md bg-gray-300 flex items-center justify-center text-xs text-gray-500 mr-2 shrink-0">
                                    {selectedChatRecord.title[0]}
                                </div>
                            )}
                            <div className={`px-3 py-2 rounded-lg max-w-[75%] text-sm leading-relaxed shadow-sm break-words relative ${msg.isMe ? 'bg-[#95ec69] text-black' : 'bg-white text-black'}`}>
                                {msg.isMe && <div className="absolute top-2 -right-1.5 w-3 h-3 bg-[#95ec69] rotate-45"></div>}
                                {!msg.isMe && <div className="absolute top-3 -left-1 w-2.5 h-2.5 bg-white rotate-45"></div>}
                                <span className="relative z-10">{msg.content}</span>
                            </div>
                            {msg.isMe && (
                                <img src={targetChar.avatar} className="w-9 h-9 rounded-md object-cover ml-2 shrink-0 shadow-sm" />
                            )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-center py-4">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-100"></div>
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-200"></div>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* 底部按钮 - 关键修复：移除复杂的 env() 计算，使用固定 padding */}
                <div className="shrink-0 w-full p-4 bg-[#f7f7f7] border-t border-gray-200">
                    <button
                        onClick={handleContinueChat}
                        disabled={isLoading}
                        className="w-full py-3 bg-white border border-gray-300 rounded-xl text-sm font-bold text-slate-600 shadow-sm active:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {isLoading ? '对方正在输入...' : '👀 偷看后续 / 拱火'}
                    </button>
                </div>
            </div>
        );
    };


    // ─── Taobao App List (仿淘宝订单列表) ─────────────────────────
    const renderTaobaoList = () => {
        const list = getRecentRecordsByType('order');

        return (
            <div className="absolute inset-0 w-full h-full flex flex-col bg-[#f5f5f5] z-10">
                {/* ── Header: Taobao style ── */}
                <div className="h-14 flex items-center justify-between px-4 shrink-0 z-20"
                    style={getCheckPhoneSafeHeaderStyle({ background: 'linear-gradient(135deg, #FF5000, #FF2800)' })}>
                    <button onClick={() => setActiveAppId('home')} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <span className="font-bold text-white text-base tracking-wide">我的订单</span>
                    <div className="w-8"></div>
                </div>

                {/* ── Order list ── */}
                <div className="flex-1 overflow-y-auto no-scrollbar pb-24 overscroll-contain">
                    {list.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                            <span className="text-4xl opacity-20">📦</span>
                            <span className="text-xs">暂无订单</span>
                        </div>
                    )}
                    <div className="p-3 space-y-2.5">
                        {list.map(r => {
                            // Parse "规格 | 状态"
                            const detailParts = (r.detail || '').split(/[|｜]/).map(s => s.trim()).filter(Boolean);
                            const spec = detailParts.length > 1 ? detailParts[0] : '';
                            const status = detailParts.length > 1 ? detailParts.slice(1).join(' · ') : r.detail;

                            const statusColor = status.includes('已完成') || status.includes('已签收') || status.includes('交易成功')
                                ? 'text-green-600'
                                : status.includes('已发货') || status.includes('运输中')
                                    ? 'text-orange-500'
                                    : status.includes('待付款')
                                        ? 'text-red-500'
                                        : 'text-slate-500';

                            return (
                                <div
                                    key={r.id}
                                    className="bg-white rounded-lg overflow-hidden relative group animate-slide-up"
                                    style={{ border: '1px solid #f0f0f0' }}
                                    {...getRecordDeleteLongPressHandlers(r)}
                                >
                                    {/* Shop header */}
                                    <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid #f5f5f5' }}>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-black text-white shrink-0"
                                                style={{ background: 'linear-gradient(135deg, #FF5000, #FF2800)' }}>
                                                淘
                                            </div>
                                            <span className="text-[11px] text-slate-600 font-medium truncate max-w-[150px]">
                                                {r.shop || '淘宝商家'}
                                            </span>
                                        </div>
                                        <span className={`text-[10px] font-medium ${statusColor}`}>{status}</span>
                                    </div>

                                    {/* Product row */}
                                    <div className="px-3 py-2.5 flex gap-3">
                                        {/* Image placeholder */}
                                        <div className="w-20 h-20 rounded-md shrink-0 flex items-center justify-center"
                                            style={{ background: '#f7f7f7' }}>
                                            <span className="text-2xl text-slate-300 select-none">
                                                {(r.title || '?')[0]}
                                            </span>
                                        </div>
                                        {/* Info */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                                            <div className="text-[13px] text-slate-800 font-medium leading-snug line-clamp-2">
                                                {r.title}
                                            </div>
                                            {spec && (
                                                <div className="text-[11px] text-slate-400 mt-0.5 truncate">{spec}</div>
                                            )}
                                            <div className="flex items-center justify-end mt-1">
                                                {r.value && (
                                                    <span className="text-[14px] font-bold" style={{ color: '#FF5000' }}>
                                                        {(r.value.startsWith('¥') || r.value.startsWith('￥')) ? r.value : `¥${r.value}`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Refresh button ── */}
                <div className="absolute bottom-8 w-full flex justify-center pointer-events-none z-30">
                    <button
                        disabled={isLoading}
                        onClick={() => handleGenerate('order')}
                        className="pointer-events-auto text-white px-6 py-2.5 rounded-full shadow-xl font-bold text-xs flex items-center gap-2 active:scale-95 transition-transform"
                        style={{ background: 'linear-gradient(135deg, #FF5000, #FF2800)' }}
                    >
                        {isLoading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>}
                        刷新订单
                    </button>
                </div>
            </div>
        );
    };

    // ─── Meituan Waimai App List (仿美团外卖订单列表) ─────────────────────
    const renderMeituanList = () => {
        const list = getRecentRecordsByType('delivery');

        return (
            <div className="absolute inset-0 w-full h-full flex flex-col bg-[#f5f5f5] z-10">
                {/* ── Header: Meituan style ── */}
                <div className="h-14 flex items-center justify-between px-4 shrink-0 z-20"
                    style={getCheckPhoneSafeHeaderStyle({ background: 'linear-gradient(135deg, #FFD000, #FFC300)' })}>
                    <button onClick={() => setActiveAppId('home')} className="p-2 -ml-2 rounded-full hover:bg-black/10 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#111" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <span className="font-bold text-[#111] text-base tracking-wide">美团外卖</span>
                    <div className="w-8"></div>
                </div>

                {/* ── Order list ── */}
                <div className="flex-1 overflow-y-auto no-scrollbar pb-24 overscroll-contain">
                    {list.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                            <span className="text-4xl opacity-20">🍔</span>
                            <span className="text-xs">暂无外卖订单</span>
                        </div>
                    )}
                    <div className="p-3 space-y-2.5">
                        {list.map(r => (
                            <div key={r.id} className="relative group animate-slide-up" {...getRecordDeleteLongPressHandlers(r)}>
                                <MeituanTakeoutCard
                                    title={r.title}
                                    detail={r.detail}
                                    value={r.value}
                                    shop={r.shop}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Refresh button ── */}
                <div className="absolute bottom-8 w-full flex justify-center pointer-events-none z-30">
                    <button
                        disabled={isLoading}
                        onClick={() => handleGenerate('delivery')}
                        className="pointer-events-auto text-[#111] px-6 py-2.5 rounded-full shadow-xl font-bold text-xs flex items-center gap-2 active:scale-95 transition-transform"
                        style={{ background: 'linear-gradient(135deg, #FFD000, #FFC300)' }}
                    >
                        {isLoading ? <div className="w-3 h-3 border-2 border-[#111]/30 border-t-[#111] rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>}
                        刷新订单
                    </button>
                </div>
            </div>
        );
    };

    const renderNeteaseMusicList = () => {
        const list = getRecentRecordsByType(NETEASE_MUSIC_RECORD_TYPE);
        const { profile, playlists } = buildNeteaseMusicProfileViewModel(list, targetChar?.name || '听歌的人');
        const profileNo = formatNeteaseProfileIndex(Math.max(0, (profile.level || 1) - 1));
        const confirmArtist = neteaseConfirmRecord?.artist || neteaseConfirmRecord?.detail.split('\n')[0] || '';

        return (
            <div className="netease-profile-page absolute inset-0 z-10">
                <div className="netease-profile-scroll no-scrollbar">
                    <div className="netease-profile-micro">
                        <button type="button" className="netease-profile-back" onClick={() => setActiveAppId('home')} aria-label="返回查手机桌面">
                            ‹
                        </button>
                        <span className="netease-profile-mirror"><span></span>Mirroring</span>
                    </div>

                    <div className="netease-profile-kicker">听歌档案 · No.{profileNo}</div>
                    <div className="netease-profile-portrait">
                        <div className={`netease-profile-portrait-img ${targetChar?.avatar ? 'has-avatar' : ''}`}>
                            {targetChar?.avatar ? (
                                <>
                                    <img src={targetChar.avatar} alt="" className="netease-profile-portrait-avatar" />
                                    <img src={targetChar.avatar} alt="" className="netease-profile-portrait-subject" />
                                </>
                            ) : null}
                        </div>
                        <span>Profile</span>
                    </div>

                    <div className="netease-profile-name">
                        <div className="netease-profile-cn">{profile.nickname}</div>
                        <div className="netease-profile-meta">
                            Lv.<b>{profile.level}</b> · 黑胶VIP · 累计听歌 {formatNeteaseProfileNumber(profile.playCount)}
                        </div>
                    </div>

                    <div className="netease-profile-epigraph">
                        <span>——</span>{profile.signature}
                    </div>

                    <div className="netease-profile-sec">
                        <span className="zh">歌单</span>
                        <span className="en">Playlists</span>
                        <span className="rule"></span>
                    </div>

                    {list.length === 0 ? (
                        <div className="netease-profile-empty">
                            <MusicNote weight="fill" />
                            <p>暂无听歌档案</p>
                            <span>重新翻找后会生成个人主页、歌单和歌曲批注</span>
                        </div>
                    ) : (
                        <div className="netease-profile-plists">
                            {playlists.map(playlist => {
                                const isOpen = openNeteasePlaylistKeys[playlist.key] ?? playlist.index === 0;
                                return (
                                    <section className={`netease-profile-plist ${isOpen ? 'open' : ''}`} key={playlist.key}>
                                        <button
                                            type="button"
                                            className="netease-profile-plist-head"
                                            onClick={() => toggleNeteasePlaylist(playlist.key)}
                                        >
                                            <span className="netease-profile-idx">{formatNeteaseProfileIndex(playlist.index)}</span>
                                            <span className="netease-profile-pcover">
                                                <span className="netease-profile-art" style={{ background: getNeteaseProfileArtGradient(playlist.index) }}></span>
                                            </span>
                                            <span className="netease-profile-pinfo">
                                                <span className="netease-profile-pname">{playlist.name}</span>
                                                <span className="netease-profile-pmeta">{playlist.count} tracks · private</span>
                                            </span>
                                            <span className="netease-profile-chev">+</span>
                                        </button>

                                        <div className="netease-profile-songs">
                                            {playlist.records.map((record, recordIndex) => {
                                                const clickable = Boolean(record.songId && record.songId > 0);
                                                const isSongOpen = openNeteaseSongId === record.id;
                                                const artist = record.artist || record.detail.split('\n')[0] || '未知歌手';
                                                const comment = record.comment || record.detail.split('\n').slice(1).join('\n').trim();
                                                const artIndex = playlist.index + recordIndex + 1;

                                                return (
                                                    <button
                                                        type="button"
                                                        key={record.id}
                                                        className={`netease-profile-song ${isSongOpen ? 'open' : ''} ${clickable ? '' : 'dead'}`}
                                                        onClick={(event) => {
                                                            if (ignoreClickAfterRecordDeleteLongPress(event)) return;
                                                            handleNeteaseSongPress(record);
                                                        }}
                                                        {...getRecordDeleteLongPressHandlers(record)}
                                                    >
                                                        <span className="netease-profile-song-row">
                                                            <span className="netease-profile-thumb">
                                                                {record.albumCover ? (
                                                                    <img src={record.albumCover} alt="" />
                                                                ) : (
                                                                    <span className="netease-profile-art" style={{ background: getNeteaseProfileArtGradient(artIndex) }}></span>
                                                                )}
                                                            </span>
                                                            <span className="netease-profile-smeta">
                                                                <span className="netease-profile-sname">{record.title}</span>
                                                                <span className="netease-profile-sartist">{artist}</span>
                                                            </span>
                                                            <span className="netease-profile-mark">
                                                                {record.value ? limitPhoneText(record.value, 18) : clickable ? 'Play' : 'Lost'}
                                                            </span>
                                                        </span>
                                                        <span className="netease-profile-note">
                                                            {record.value ? (
                                                                <span className="netease-profile-tagline">{record.value}</span>
                                                            ) : null}
                                                            {comment ? (
                                                                <span className="netease-profile-quote"><span>“</span>{comment}</span>
                                                            ) : (
                                                                <span className="netease-profile-nocomment">这首没留下话，只是反复听。</span>
                                                            )}
                                                            <span className="netease-profile-jump">
                                                                {clickable ? '再点一下 · 去 Emo Cloud 听' : '无法跳转 · 未匹配'}
                                                                <span></span>
                                                                {clickable ? '→' : ''}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    )}

                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleGenerate(NETEASE_MUSIC_RECORD_TYPE, undefined, { replaceExisting: true })}
                        className="netease-profile-refresh"
                    >
                        {isLoading ? '翻找中 · Loading' : '重新翻找 · Refresh'}
                    </button>
                </div>

                <div className="netease-profile-home"></div>

                {neteaseConfirmRecord ? (
                    <div className="netease-profile-mask show">
                        <div className="netease-profile-dialog">
                            <div className="netease-profile-dialog-lbl">Open in Emo Cloud</div>
                            <h3>去 Emo Cloud 听</h3>
                            <div className="netease-profile-dialog-song">《{neteaseConfirmRecord.title}》{confirmArtist ? ` · ${confirmArtist}` : ''}</div>
                            <div className="netease-profile-dialog-btns">
                                <button type="button" className="cancel" onClick={() => setNeteaseConfirmRecord(null)}>取消</button>
                                <button type="button" className="go" onClick={() => handleOpenNeteaseMusicRecord(neteaseConfirmRecord)}>去听</button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    };

    const renderShiguangCamera = () => {
        const list = getRecentRecordsByType(SHIGUANG_CAMERA_RECORD_TYPE)
            .filter(record => record.albumCover);
        const latestRecord = list[0] || null;
        const latestCommentMessages = splitShiguangCameraCommentMessages(latestRecord?.comment);
        const latestCommentVisibleCount = latestRecord
            ? Math.min(latestCommentMessages.length, Math.max(1, shiguangCommentVisibleCounts[latestRecord.id] || 1))
            : 0;
        const visibleLatestCommentMessages = latestCommentMessages.slice(0, latestCommentVisibleCount);
        const hasHiddenLatestComment = latestCommentVisibleCount < latestCommentMessages.length;
        const selectedIds = new Set(shiguangSelectedRecordIds);
        const selectedCount = list.filter(record => selectedIds.has(record.id)).length;
        const commentTargetCount = selectedCount || (latestRecord ? 1 : 0);
        const cameraStatusLabel = shiguangCameraStatus === 'ready'
            ? '轻点画面拍一张'
            : shiguangCameraStatus === 'requesting'
                ? '正在打开镜头'
                : '镜头未授权';
        const commentButtonLabel = shiguangCommenting
            ? '看图中'
            : commentTargetCount > 1
                ? `让${targetChar?.name || 'TA'}看 ${commentTargetCount} 张`
                : `让${targetChar?.name || 'TA'}看看`;

        return (
            <div className="shiguang-camera-page absolute inset-0 z-10">
                <div className="shiguang-camera-grain" aria-hidden="true"></div>

                <header className="shiguang-camera-topbar" style={checkPhoneSafeHeaderStyle}>
                    <button type="button" className="shiguang-camera-back" onClick={handleCloseShiguangCamera} aria-label="返回查手机桌面">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="shiguang-camera-title">
                        <span>相机</span>
                        <b>让他看见你的此刻</b>
                    </div>
                    <button
                        type="button"
                        className="shiguang-camera-ghost"
                        onClick={() => setShiguangFacingMode(mode => mode === 'environment' ? 'user' : 'environment')}
                        aria-label="翻转镜头"
                        title="翻转镜头"
                    >
                        ↻
                    </button>
                </header>

                <main className={`shiguang-camera-body no-scrollbar ${list.length === 0 ? 'is-empty' : ''}`}>
                    <section className="shiguang-viewfinder" aria-label="相机取景窗">
                        <video
                            ref={shiguangVideoRef}
                            className={shiguangFacingMode === 'user' ? 'is-mirror' : ''}
                            autoPlay
                            playsInline
                            muted
                        />
                        <div className="shiguang-viewfinder-shade" aria-hidden="true"></div>
                        <div className="shiguang-viewfinder-status">
                            <span><i></i>{cameraStatusLabel}</span>
                            <b>设备：{targetChar?.name || 'TA'} 的手机</b>
                        </div>
                        {shiguangCameraStatus === 'ready' ? (
                            <button
                                type="button"
                                className="shiguang-viewfinder-capture"
                                onClick={handleCaptureShiguangPhoto}
                                aria-label="轻点拍一张"
                            >
                                <Camera weight="light" />
                                <span>轻点拍一张</span>
                            </button>
                        ) : (
                            <div className="shiguang-viewfinder-fallback" aria-live="polite">
                                <Camera weight="light" />
                                <span>{shiguangCameraStatus === 'requesting' ? '正在借用镜头' : '镜头暂时打不开'}</span>
                                <small>可以用底部相册继续</small>
                            </div>
                        )}
                    </section>

                    <section className={`shiguang-develop-zone ${latestCommentMessages.length > 0 || shiguangCommenting ? 'has-reaction-message' : ''}`} aria-label="拍立得预览">
                        <div
                            className={`shiguang-polaroid ${latestRecord ? 'has-photo' : ''}`}
                            key={latestRecord?.id || 'empty-polaroid'}
                            {...(latestRecord ? getRecordDeleteLongPressHandlers(latestRecord) : {})}
                        >
                            <div className="shiguang-polaroid-photo">
                                {latestRecord?.albumCover ? (
                                    <img src={latestRecord.albumCover} alt="" />
                                ) : (
                                    <span>此刻还没有显影</span>
                                )}
                            </div>
                            <div className="shiguang-polaroid-caption">
                                {latestRecord?.value || '等待显影'}
                            </div>
                        </div>

                        <div
                            className={`shiguang-reaction ${latestRecord ? 'has-photo' : ''} ${shiguangCommenting ? 'is-thinking' : ''} ${hasHiddenLatestComment ? 'is-advanceable' : ''}`}
                            onClick={() => latestRecord && advanceShiguangCameraComment(latestRecord.id, latestCommentMessages.length)}
                            onKeyDown={(event) => {
                                if (!hasHiddenLatestComment || !latestRecord) return;
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                event.preventDefault();
                                advanceShiguangCameraComment(latestRecord.id, latestCommentMessages.length);
                            }}
                            role={hasHiddenLatestComment ? 'button' : undefined}
                            tabIndex={hasHiddenLatestComment ? 0 : undefined}
                            aria-label={hasHiddenLatestComment ? '显示下一句照片点评' : undefined}
                        >
                            <div className="shiguang-reaction-avatar">
                                {targetChar?.avatar ? <img src={targetChar.avatar} alt="" /> : <span>{targetChar?.name?.trim()[0] || '?'}</span>}
                            </div>
                            <div className="shiguang-reaction-text">
                                <span className="shiguang-reaction-label">
                                    {shiguangCommenting
                                        ? `${targetChar?.name || 'TA'} 正在看照片`
                                        : latestRecord
                                            ? `${targetChar?.name || 'TA'} 已读此刻`
                                            : `${targetChar?.name || 'TA'} 等你递来此刻`}
                                </span>
                                {shiguangCommenting ? (
                                    <p className="shiguang-reaction-message">
                                        正在想怎么说<span className="shiguang-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                                    </p>
                                ) : visibleLatestCommentMessages.length > 0 ? (
                                    <div className="shiguang-reaction-message-list">
                                        {visibleLatestCommentMessages.map((message, index) => (
                                            <p className="shiguang-reaction-message" key={`${latestRecord?.id || 'comment'}-${index}`}>{message}</p>
                                        ))}
                                        {latestCommentMessages.length > 1 ? (
                                            <span className="shiguang-reaction-progress">{latestCommentVisibleCount}/{latestCommentMessages.length}</span>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </section>

                    {list.length === 0 ? (
                        <div className="shiguang-first-shot-cue" aria-hidden="true">
                            <span></span>
                            按下快门，把此刻递过去
                        </div>
                    ) : (
                        <section className="shiguang-tray" aria-label="最近相机照片">
                            {list.slice(0, 8).map(record => {
                                const selected = selectedIds.has(record.id);
                                return (
                                    <button
                                        type="button"
                                        key={record.id}
                                        className={`shiguang-tray-photo ${selected ? 'is-selected' : ''}`}
                                        onClick={(event) => {
                                            if (ignoreClickAfterRecordDeleteLongPress(event)) return;
                                            toggleShiguangRecordSelection(record.id);
                                        }}
                                        aria-pressed={selected}
                                        {...getRecordDeleteLongPressHandlers(record)}
                                    >
                                        <img src={record.albumCover || ''} alt="" />
                                        <span>{record.comment ? '已看' : record.value?.startsWith('让') ? '看看' : '单张'}</span>
                                    </button>
                                );
                            })}
                        </section>
                    )}
                </main>

                <footer className="shiguang-camera-controls">
                    <button type="button" className="shiguang-control-btn" onClick={() => shiguangFileInputRef.current?.click()}>
                        从相册选
                    </button>
                    <button
                        type="button"
                        className="shiguang-shutter"
                        onClick={handleCaptureShiguangPhoto}
                        disabled={shiguangCameraStatus !== 'ready'}
                        aria-label="拍一张"
                        title="拍一张"
                    >
                        <span></span>
                    </button>
                    <button
                        type="button"
                        className="shiguang-control-btn"
                        onClick={handleCreateShiguangGroupComment}
                        disabled={shiguangCommenting || list.length < 1}
                    >
                        {commentButtonLabel}
                    </button>
                </footer>
            </div>
        );
    };

    const renderGenericList = (appId: string, appName: string, customPrompt?: string) => {
        const list = getRecentRecordsByType(appId);

        return (
            <div className="absolute inset-0 w-full h-full flex flex-col bg-slate-50 z-10">
                {renderHeader(appName, () => setActiveAppId('home'))}

                <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar pb-24 overscroll-contain">
                    {list.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                            <span className="text-4xl opacity-20">📭</span>
                            <span className="text-xs">暂无数据</span>
                        </div>
                    )}
                    {list.map(r => (
                        <div
                            key={r.id}
                            className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm relative group animate-slide-up"
                            {...getRecordDeleteLongPressHandlers(r)}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="font-bold text-slate-700 text-sm line-clamp-1">{r.title}</span>
                                {r.value && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">{r.value}</span>}
                            </div>
                            <div className="text-xs text-slate-500 leading-relaxed">{r.detail}</div>
                            <div className="text-[10px] text-slate-300 mt-2 text-right">{new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>

                        </div>
                    ))}
                </div>

                <div className="absolute bottom-8 w-full flex justify-center pointer-events-none z-30">
                    <button
                        disabled={isLoading}
                        onClick={() => handleGenerate(appId, customPrompt)}
                        className="pointer-events-auto bg-slate-800 text-white px-6 py-2.5 rounded-full shadow-xl font-bold text-xs flex items-center gap-2 active:scale-95 transition-transform hover:bg-slate-700"
                    >
                        {isLoading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>}
                        刷新数据
                    </button>
                </div>
            </div>
        );
    };

    const renderMomentsList = () => {
        const list = getRecentRecordsByType('social');

        return (
            <div className="absolute inset-0 w-full h-full flex flex-col bg-white z-10">
                {/* WeChat Header */}
                <div
                    className="h-14 flex items-center justify-between px-4 bg-white/90 backdrop-blur-md text-[#111111] shrink-0 z-20 border-b border-gray-100"
                    style={checkPhoneSafeHeaderStyle}
                >
                    <button onClick={() => setActiveAppId('home')} className="p-2 -ml-2 rounded-full active:bg-gray-100 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <span className="font-medium text-base tracking-wide">朋友圈</span>
                    <button className="p-2 -mr-2 rounded-full active:bg-gray-100 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar pb-24 overscroll-contain bg-white">
                    {/* Moments Cover Image Area */}
                    <div className="h-64 bg-gray-100 relative mb-12">
                        <img src={targetChar?.dateBackground || momentsCoverBg} className="w-full h-full object-cover" />
                        <div className="absolute -bottom-8 right-4 flex items-end gap-4">
                            <span className="text-white text-lg font-bold drop-shadow-md mb-2">{targetChar?.name}</span>
                            <div className="w-16 h-16 rounded-lg bg-gray-200 p-[2px] bg-white shadow-sm shrink-0">
                                {targetChar?.avatar ? (
                                    <img src={targetChar.avatar} className="w-full h-full object-cover rounded-md" />
                                ) : (
                                    <div className="w-full h-full bg-slate-300 rounded-md"></div>
                                )}
                            </div>
                        </div>
                    </div>

                    {list.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                            <span className="text-sm">暂无动态</span>
                        </div>
                    )}

                    {/* Moments List */}
                    <div className="divide-y divide-gray-100">
                        {list.map(r => (
                            <div key={r.id} className="p-4 flex gap-3 relative group animate-slide-up bg-white" {...getRecordDeleteLongPressHandlers(r)}>
                                {/* Avatar */}
                                <div className="w-10 h-10 rounded-md shrink-0 bg-gray-200">
                                    {targetChar?.avatar ? (
                                        <img src={targetChar.avatar} className="w-full h-full rounded-md object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-500 font-medium">{(targetChar?.name || '?')[0]}</div>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-[#576b95] font-medium text-[15px] mb-1 leading-tight">{targetChar?.name}</div>
                                    <div className="text-[#111111] text-[15px] leading-relaxed whitespace-pre-wrap break-words">{r.detail}</div>

                                    <div className="flex items-center justify-between mt-2.5">
                                        <div className="text-[#b2b2b2] text-[13px] flex items-center gap-2">
                                            <span>{r.title}</span>
                                        </div>
                                        <div className="w-8 h-5 bg-[#f5f5f5] rounded flex items-center justify-center cursor-pointer active:bg-gray-200 transition-colors">
                                            <div className="flex gap-1">
                                                <span className="w-1 h-1 rounded-full bg-[#576b95]"></span>
                                                <span className="w-1 h-1 rounded-full bg-[#576b95]"></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 px-4 pointer-events-none z-30">
                    <button
                        disabled={isLoading}
                        onClick={() => handleGenerate('social')}
                        className="pointer-events-auto bg-green-500 text-white px-4 py-2.5 rounded-full shadow-lg font-bold text-xs flex items-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
                    >
                        {isLoading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>}
                        刷新朋友圈
                    </button>
                    <button
                        disabled={isLoading}
                        onClick={() => handleGenerate('social', undefined, { replaceExisting: true })}
                        className="pointer-events-auto bg-[#576b95] text-white px-4 py-2.5 rounded-full shadow-lg font-bold text-xs flex items-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
                    >
                        {isLoading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5M16.5 3 21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>}
                        重Roll
                    </button>
                </div>
            </div>
        );
    };

    const DesktopAppIcon = ({ app }: { app: DesktopAppEntry }) => {
        const IconComponent = app.icon;
        return (
            <div className={`checkphone-desktop-app ${isDesktopEditing ? 'is-editing' : ''}`}>
                <button
                    type="button"
                    className={`checkphone-desktop-chip ${app.danger ? 'is-danger' : ''} ${app.isUtility ? 'is-utility' : ''}`}
                    onClick={() => handleDesktopAppClick(app.onClick)}
                    onPointerDown={startDesktopEditPress}
                    onPointerUp={cancelDesktopEditPress}
                    onPointerCancel={cancelDesktopEditPress}
                    onPointerMove={cancelDesktopEditPress}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        setIsDesktopEditing(true);
                    }}
                    aria-label={app.label}
                >
                    {app.badge === 'dot' ? <span className="checkphone-desktop-badge is-dot"></span> : null}
                    {typeof app.badge === 'number' && app.badge > 0 ? (
                        <span className="checkphone-desktop-badge">{app.badge > 99 ? '99+' : app.badge}</span>
                    ) : null}
                    {app.customIcon ? (
                        <img className="checkphone-desktop-custom-icon" src={app.customIcon} alt="" />
                    ) : IconComponent ? (
                        <IconComponent className="checkphone-desktop-icon" weight="regular" />
                    ) : (
                        <span className="checkphone-desktop-emoji">{app.emoji || '•'}</span>
                    )}
                </button>
                <span className="checkphone-desktop-label">{app.label}</span>
                {isDesktopEditing && app.onDelete ? (
                    <button
                        type="button"
                        className="checkphone-desktop-delete"
                        onClick={(event) => {
                            event.stopPropagation();
                            app.onDelete?.();
                        }}
                        aria-label={`删除 ${app.label}`}
                    >
                        ×
                    </button>
                ) : null}
            </div>
        );
    };

    const DesktopDockButton = ({
        icon: IconComponent,
        onClick,
        label,
        badge,
        customIcon,
    }: {
        icon: Icon;
        onClick: () => void;
        label: string;
        badge?: number | 'dot';
        customIcon?: string;
    }) => (
        <button type="button" className="checkphone-desktop-dock-button" onClick={onClick} aria-label={label}>
            {badge === 'dot' ? <span className="checkphone-desktop-dock-badge is-dot"></span> : null}
            {typeof badge === 'number' && badge > 0 ? (
                <span className="checkphone-desktop-dock-badge">{badge > 99 ? '99+' : badge}</span>
            ) : null}
            {customIcon ? (
                <img className="checkphone-desktop-dock-custom-icon" src={customIcon} alt="" />
            ) : (
                <IconComponent className="checkphone-desktop-dock-icon" weight="regular" />
            )}
            <span className="checkphone-desktop-dock-label">{label}</span>
        </button>
    );

    const renderDesktop = () => {
        const clockLabel = formatDesktopClock(desktopNow);
        const activeTimeLabel = formatDesktopActiveTime(desktopNow);
        const activePhotoId = activeDesktopPhotoId || desktopPhotoCards[0]?.id || null;
        const openCoreApp = (appId: string) => {
            if (appId === 'settings') {
                setIsDesktopEditing(false);
                setShowDesktopSettings(true);
                return;
            }
            const appMap: Record<string, string> = {
                chat: 'chat',
                [NETEASE_MUSIC_RECORD_TYPE]: NETEASE_MUSIC_RECORD_TYPE,
                taobao: 'taobao',
                delivery: 'waimai',
                social: 'social',
                call: 'call',
            };
            setActiveAppId(appMap[appId] || appId);
        };
        const desktopApps: DesktopAppEntry[] = [
            ...CHECKPHONE_DESKTOP_PAGE_APPS.filter(app => app.id !== NETEASE_MUSIC_RECORD_TYPE).map(app => {
                const recordCount = app.recordType ? getRecentRecordsByType(app.recordType).length : 0;
                return {
                    id: app.id,
                    label: app.label,
                    icon: app.icon,
                    customIcon: desktopIconOverrides[app.id],
                    badge: app.id === 'social' && recordCount > 0 ? 'dot' as const : recordCount || undefined,
                    onClick: () => openCoreApp(app.id),
                };
            }),
            ...customApps.map(app => ({
                id: app.id,
                label: app.name,
                emoji: app.icon,
                customIcon: desktopIconOverrides[app.id],
                badge: getRecentRecordsByType(app.id).length || undefined,
                customAppId: app.id,
                onClick: () => setActiveAppId(app.id),
                onDelete: () => handleDeleteApp(app.id),
            })),
        ];
        const appPages = chunkDesktopApps(desktopApps, CHECKPHONE_DESKTOP_APP_PAGE_SIZE);
        const musicRecords = getRecentRecordsByType(NETEASE_MUSIC_RECORD_TYPE);
        const nowPlaying = musicRecords[0] || null;
        const musicArtist = nowPlaying
            ? getNeteaseRecordArtist(nowPlaying)
            : targetChar?.name
                ? `${targetChar.name} 的听歌档案`
                : '等待翻找';
        const musicCoverSrc = nowPlaying?.albumCover || desktopIconOverrides[NETEASE_MUSIC_RECORD_TYPE] || targetChar?.avatar;
        const desktopStyle = desktopAppearance.wallpaper
            ? { '--cpd-wallpaper': `url(${desktopAppearance.wallpaper})` } as React.CSSProperties
            : undefined;

        return (
            <div
                className={`checkphone-desktop-ui absolute inset-0 z-0 ${desktopAppearance.wallpaper ? 'has-wallpaper' : ''}`}
                style={desktopStyle}
            >
                <div
                    className="checkphone-desktop-content"
                    onPointerDown={handleDesktopSurfacePointerDown}
                    onPointerUp={handleDesktopSurfacePointerUp}
                    onPointerCancel={handleDesktopSurfacePointerUp}
                    onPointerMove={handleDesktopSurfacePointerUp}
                    onContextMenu={(event) => {
                        if (event.target !== event.currentTarget) return;
                        event.preventDefault();
                        setIsDesktopEditing(true);
                    }}
                >
                    <DesktopMusicWidget
                        config={musicConfig}
                        title={nowPlaying?.title || '网易云音乐'}
                        artist={musicArtist}
                        progress={getNeteaseRecordProgress(nowPlaying)}
                        trackCount={musicRecords.length}
                        coverSrc={musicCoverSrc}
                        draggable={isDesktopEditing}
                        onOpen={() => openCoreApp(NETEASE_MUSIC_RECORD_TYPE)}
                        onPositionChange={(pos) => setMusicConfig(current => ({ ...current, pos }))}
                    />

                    <div className="checkphone-desktop-statusbar">
                        <span>{clockLabel}</span>
                        <div className="checkphone-desktop-status-right">
                            <span className="checkphone-desktop-bars"><i></i><i></i><i></i><i></i></span>
                            <WifiHigh className="checkphone-desktop-wifi" weight="fill" />
                            <span className="checkphone-desktop-batt"><i></i></span>
                        </div>
                    </div>

                    <header className="checkphone-desktop-head">
                        <div className="checkphone-desktop-who">
                            <div className="checkphone-desktop-avatar">
                                {targetChar?.avatar ? (
                                    <img src={targetChar.avatar} alt={`${targetChar.name} 头像`} />
                                ) : (
                                    <span>{targetChar?.name?.trim()[0] || '?'}</span>
                                )}
                            </div>
                            <div className="checkphone-desktop-meta">
                                <span className="checkphone-desktop-online"><i></i>在线 · 刚刚活跃 {activeTimeLabel}</span>
                                <button type="button" className="checkphone-desktop-disconnect-pill" onClick={handleExitPhone}>
                                    断开链路 ↗
                                </button>
                            </div>
                        </div>
                        <div className="checkphone-desktop-clock">
                            <div className="checkphone-desktop-clock-time">{clockLabel}</div>
                            <div className="checkphone-desktop-clock-date">{formatDesktopDateLine(desktopNow)}</div>
                        </div>
                    </header>

                    <section className="checkphone-desktop-fan" aria-label="最近相册照片">
                        {desktopPhotoCards.map((photo, index) => {
                            const isActive = photo.id === activePhotoId;
                            const rotation = getDesktopFanRotation(desktopPhotoCards.length, index);
                            return (
                                <button
                                    type="button"
                                    key={photo.id}
                                    className={`checkphone-desktop-photo-card ${isActive ? 'is-active' : ''} ${photo.isFallback ? 'is-fallback' : ''}`}
                                    style={{
                                        '--rot': `${rotation}deg`,
                                        '--deal-delay': `${index * 80}ms`,
                                        zIndex: isActive ? 20 : index + 1,
                                    } as React.CSSProperties}
                                    onClick={() => setActiveDesktopPhotoId(photo.id)}
                                >
                                    {photo.src ? (
                                        <img src={photo.src} alt="" />
                                    ) : (
                                        <span className="checkphone-desktop-photo-empty">{targetChar?.name?.trim()[0] || '?'}</span>
                                    )}
                                    <span className="checkphone-desktop-photo-noise"></span>
                                    <span className="checkphone-desktop-photo-scrim"></span>
                                    <span className="checkphone-desktop-photo-caption">{photo.caption}</span>
                                </button>
                            );
                        })}
                    </section>

                    <div className="checkphone-desktop-page-dots" role="tablist" aria-label="桌面分页">
                        {appPages.map((_, index) => (
                            <button
                                type="button"
                                key={index}
                                className={index === desktopPage ? 'is-on' : ''}
                                onClick={() => scrollDesktopPage(index)}
                                aria-label={`第 ${index + 1} 页`}
                            ></button>
                        ))}
                    </div>

                    <div
                        ref={desktopPagerRef}
                        className="checkphone-desktop-pages no-scrollbar"
                        onScroll={handleDesktopPageScroll}
                    >
                        {appPages.map((page, pageIndex) => (
                            <div className="checkphone-desktop-grid" key={pageIndex}>
                                {page.map(app => <DesktopAppIcon key={app.id} app={app} />)}
                            </div>
                        ))}
                    </div>

                    <div
                        className="checkphone-desktop-spacer"
                        onPointerDown={startDesktopEditPress}
                        onPointerUp={handleDesktopSurfacePointerUp}
                        onPointerCancel={handleDesktopSurfacePointerUp}
                        onPointerMove={handleDesktopSurfacePointerUp}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            setIsDesktopEditing(true);
                        }}
                    ></div>

                    <nav className="checkphone-desktop-dock" aria-label="常用 App">
                        {CHECKPHONE_DESKTOP_DOCK_APPS.map(app => {
                            const recordCount = app.recordType ? getRecentRecordsByType(app.recordType).length : 0;
                            return (
                                <DesktopDockButton
                                    key={app.id}
                                    icon={app.icon}
                                    label={app.label}
                                    badge={recordCount || undefined}
                                    customIcon={desktopIconOverrides[app.id]}
                                    onClick={() => openCoreApp(app.id)}
                                />
                            );
                        })}
                    </nav>

                    <div className="checkphone-desktop-home-ind"><i></i></div>
                </div>
            </div>
        );
    };

    if (view === 'select') {
        return (
            <div className="checkphone-select-ui absolute inset-0 overflow-hidden">
                <div className="checkphone-select-sweep" aria-hidden="true"></div>
                <div className="checkphone-select-grain" aria-hidden="true"></div>
                <div className="checkphone-select-vignette" aria-hidden="true"></div>

                <div className="relative z-10 flex h-full flex-col">
                    <div className="checkphone-terminal-bar">
                        <span className="checkphone-terminal-mid"><span></span>INTERCEPT</span>
                    </div>

                    <button
                        type="button"
                        onClick={() => requestCheckPhoneExit('close_app')}
                        className="checkphone-select-back"
                        aria-label="返回桌面"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 19 8.5 12l7-7" />
                        </svg>
                    </button>

                    <div className="checkphone-rec-indicator"><span></span>REC · LIVE</div>

                    <div className="checkphone-select-scroll no-scrollbar">
                        <header className="checkphone-select-header">
                            <div className="checkphone-secure-link">
                                <span className="checkphone-pulse-dot"></span>
                                SECURE LINK ESTABLISHED
                                <span className="checkphone-cursor"></span>
                            </div>
                            <h1>监听目标</h1>
                            <div className="checkphone-select-subtitle">/// INTERCEPTED DEVICES</div>
                            <div className="checkphone-select-meta">
                                检测到 <b>{selectTargets.length}</b> 台设备 · 实时镜像
                                <span className="checkphone-scanning"><i></i><i></i><i></i></span>
                            </div>
                        </header>

                        <div className="checkphone-select-divider">
                            <span></span>SELECT TARGET<span></span>
                        </div>

                        {selectTargets.length > 0 ? (
                            <div className="checkphone-target-grid">
                                {selectTargets.map((target, index) => (
                                    <button
                                        key={target.character.id}
                                        type="button"
                                        onClick={() => handleConnectTarget(target.character)}
                                        className={`checkphone-target-card checkphone-target-card--${target.mode}`}
                                        style={{
                                            '--card-delay': `${index * 55}ms`,
                                            '--avatar-gradient': target.avatarGradient,
                                        } as React.CSSProperties}
                                    >
                                        {target.mode === 'live' && (
                                            <div className="checkphone-live-badge"><span></span>LIVE</div>
                                        )}

                                        <div className="checkphone-avatar-frame">
                                            <div className="checkphone-avatar-image">
                                                {target.character.avatar ? (
                                                    <img src={target.character.avatar} alt={`${target.character.name} 头像`} />
                                                ) : (
                                                    <span>{target.character.name.trim()[0] || '?'}</span>
                                                )}
                                            </div>
                                            <div className="checkphone-reticle" aria-hidden="true">
                                                <i></i><i></i><i></i><i></i>
                                            </div>
                                        </div>

                                        <div className="checkphone-card-name">{formatTargetDisplayName(target.character.name)}</div>
                                        <div className="checkphone-card-id">#{target.fingerprint}</div>

                                        <div className="checkphone-card-row">
                                            <span className="checkphone-target-status">
                                                <i></i>{target.statusLabel}
                                            </span>
                                            <span className="checkphone-minibars" aria-label={`信号强度 ${target.signalStrength}`}>
                                                {Array.from({ length: 4 }, (_, barIndex) => (
                                                    <i key={barIndex} className={barIndex < target.signalStrength ? '' : 'is-dim'}></i>
                                                ))}
                                            </span>
                                        </div>

                                        <div className="checkphone-card-peek">
                                            <span></span>{target.peekLabel}
                                        </div>

                                        <div className="checkphone-card-foot">
                                            <span>{target.recordsCount} records</span>
                                            <span>{target.appCount} apps</span>
                                        </div>

                                        <div className="checkphone-acquire">▶ {target.actionLabel}</div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="checkphone-empty-state">
                                <div className="checkphone-empty-reticle" aria-hidden="true"></div>
                                <p>未检测到可接入设备</p>
                                <span>请先在角色档案中添加角色</span>
                            </div>
                        )}

                        <footer className="checkphone-select-footer">
                            <div className="checkphone-select-hint"><span>⟢</span> 轻点目标 · 接入角色手机镜像</div>
                            <button type="button" onClick={() => requestCheckPhoneExit('close_app')} className="checkphone-disconnect">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v8M6.4 7.4a8 8 0 1 0 11.2 0" />
                                </svg>
                                断开所有链路
                            </button>
                        </footer>
                    </div>
                </div>

                {accessOverlay && (
                    <div className={`checkphone-access-overlay ${accessOverlay.status === 'granted' ? 'is-granted' : ''}`}>
                        <div className="checkphone-access-ring">
                            {accessOverlay.status === 'granted' && (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 6" />
                                </svg>
                            )}
                        </div>
                        <div className="checkphone-access-name">{accessOverlay.name}</div>
                        <div className="checkphone-access-line">
                            {accessOverlay.status === 'granted' ? 'ACCESS GRANTED · 正在进入设备' : '建立连接中...'}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Phone View Container
    // FIXED: Use absolute inset-0 to force fill parent container properly
    return (
        <div className="absolute inset-0 bg-slate-900 overflow-hidden font-sans overscroll-none" style={checkPhoneRootStyle}>
            {activeAppId === 'home' ? renderDesktop() : (
                <>
                    {activeAppId === 'chat' && renderChatList()}
                    {activeAppId === 'chat_detail' && renderChatDetail()}
                    {activeAppId === 'taobao' && renderTaobaoList()}
                    {activeAppId === 'waimai' && renderMeituanList()}
                    {activeAppId === NETEASE_MUSIC_RECORD_TYPE && renderNeteaseMusicList()}
                    {activeAppId === SHIGUANG_CAMERA_RECORD_TYPE && renderShiguangCamera()}
                    {activeAppId === 'social' && renderMomentsList()}
                    {activeAppId === 'call' && renderGenericList('call', '通话记录')}

                    {/* Render Custom Apps */}
                    {customApps.find(a => a.id === activeAppId) && (
                        (() => {
                            const app = customApps.find(a => a.id === activeAppId)!;
                            return renderGenericList(app.id, app.name, app.prompt);
                        })()
                    )}
                </>
            )}

            <input
                ref={desktopWallpaperInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void handleDesktopWallpaperUpload(file);
                    event.currentTarget.value = '';
                }}
            />
            <input
                ref={desktopIconInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) {
                        void handleDesktopIconUpload(file);
                    } else {
                        setDesktopIconUploadTargetId(null);
                    }
                    event.currentTarget.value = '';
                }}
            />
            <input
                ref={desktopPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) {
                        void handleDesktopPhotoUpload(file);
                    } else {
                        setDesktopPhotoUploadSlot(null);
                    }
                    event.currentTarget.value = '';
                }}
            />
            <input
                ref={shiguangFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void handleShiguangFileUpload(file);
                    event.currentTarget.value = '';
                }}
            />
            <canvas ref={shiguangCanvasRef} className="hidden" />

            <Modal
                isOpen={Boolean(recordPendingDelete)}
                title="确认删除"
                onClose={() => setRecordPendingDelete(null)}
                footer={(
                    <>
                        <button
                            type="button"
                            onClick={() => setRecordPendingDelete(null)}
                            className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-500 transition-transform active:scale-95"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleConfirmDeleteRecord()}
                            className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-bold text-white transition-transform active:scale-95"
                        >
                            删除
                        </button>
                    </>
                )}
            >
                <div className="space-y-4 text-center">
                    <p className="text-sm leading-6 text-slate-600">
                        确定要删除这条生成内容吗？关联的聊天系统痕迹也会一起移除。
                    </p>
                    {recordPendingDelete ? (
                        <div className="rounded-3xl bg-slate-50 p-3 text-left">
                            <div className="truncate text-xs font-bold text-slate-800">{recordPendingDelete.title}</div>
                            <div className="mt-1 line-clamp-3 text-[11px] leading-4 text-slate-500">
                                {recordPendingDelete.value ? `${recordPendingDelete.value} · ` : ''}{recordPendingDelete.detail}
                            </div>
                        </div>
                    ) : null}
                </div>
            </Modal>

            <Modal
                isOpen={Boolean(contextExitAction)}
                title="要让他知道吗？"
                onClose={cancelContextExitPrompt}
                footer={(
                    <div className="w-full space-y-2">
                        <button
                            type="button"
                            onClick={() => void handleHidePhoneContext()}
                            disabled={isResolvingContextExit}
                            className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
                        >
                            {isResolvingContextExit ? '正在藏起来...' : '不让他知道'}
                        </button>
                        <button
                            type="button"
                            onClick={handleKeepPhoneContext}
                            disabled={isResolvingContextExit}
                            className="w-full rounded-2xl bg-rose-500 py-3 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
                        >
                            让他知道
                        </button>
                        <button
                            type="button"
                            onClick={cancelContextExitPrompt}
                            disabled={isResolvingContextExit}
                            className="w-full rounded-2xl bg-slate-100 py-2.5 text-xs font-bold text-slate-500 transition-transform active:scale-95 disabled:opacity-60"
                        >
                            继续看手机
                        </button>
                    </div>
                )}
            >
                <div className="space-y-4 text-center">
                    <p className="text-sm leading-6 text-slate-600">
                        这次翻到的 {pendingPhoneContextRecords.length} 条痕迹，要不要让
                        <span className="font-semibold text-slate-900"> {targetChar?.name || '他'} </span>
                        在之后察觉？
                    </p>
                    <div className="space-y-2 rounded-3xl bg-slate-50 p-3 text-left">
                        {pendingPhoneContextRecords.slice(0, 3).map(record => (
                            <div key={record.id} className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                                <div className="truncate text-xs font-bold text-slate-800">{record.title}</div>
                                <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
                                    {record.value ? `${record.value} · ` : ''}{record.detail}
                                </div>
                            </div>
                        ))}
                        {pendingPhoneContextRecords.length > 3 ? (
                            <div className="px-2 pb-1 text-center text-[11px] font-semibold text-slate-400">
                                还有 {pendingPhoneContextRecords.length - 3} 条
                            </div>
                        ) : null}
                    </div>
                    <p className="text-xs leading-5 text-slate-400">
                        不让他知道的话，手机里还会留着这些记录，只是之后聊天里不会提起。
                    </p>
                </div>
            </Modal>

            <Modal isOpen={showDesktopSettings} title="查手机设置" onClose={() => setShowDesktopSettings(false)}>
                <div className="checkphone-settings-panel">
                    <section className="checkphone-settings-section">
                        <div className="checkphone-settings-section-head">
                            <div>
                                <h4>桌面外观</h4>
                                <span>{desktopAppearance.wallpaper ? '已使用自定义桌面' : '默认桌面'}</span>
                            </div>
                        </div>
                        <div className={`checkphone-settings-wallpaper ${desktopAppearance.wallpaper ? 'has-image' : ''}`}>
                            {desktopAppearance.wallpaper ? (
                                <img src={desktopAppearance.wallpaper} alt="" />
                            ) : (
                                <span>Desktop</span>
                            )}
                        </div>
                        <div className="checkphone-settings-actions">
                            <button type="button" onClick={() => desktopWallpaperInputRef.current?.click()}>
                                换桌面
                            </button>
                            <button
                                type="button"
                                onClick={handleResetDesktopWallpaper}
                                disabled={!desktopAppearance.wallpaper}
                            >
                                恢复默认
                            </button>
                        </div>
                    </section>

                    <section className="checkphone-settings-section">
                        <div className="checkphone-settings-section-head">
                            <div>
                                <h4>网易云浮窗</h4>
                                <span>拖动位置与皮肤会自动保存</span>
                            </div>
                        </div>
                        <MusicSkinPicker
                            config={musicConfig}
                            onChange={setMusicConfig}
                            onReset={() => setMusicConfig(DEFAULT_MUSIC_CONFIG)}
                        />
                    </section>

                    <section className="checkphone-settings-section">
                        <div className="checkphone-settings-section-head">
                            <div>
                                <h4>桌面三张照片</h4>
                                <span>{desktopCustomPhotoCount > 0 ? `已上传 ${desktopCustomPhotoCount}/3 张` : '上传图片'}</span>
                            </div>
                        </div>
                        <div className="checkphone-settings-photo-grid">
                            {desktopPhotoCards.map((photo, index) => {
                                const customPhoto = desktopAppearance.galleryPhotos?.[index]?.trim();
                                return (
                                    <div className="checkphone-settings-photo-slot" key={`photo-slot-${index}`}>
                                        <div className={`checkphone-settings-photo-preview ${photo.src ? 'has-image' : ''}`}>
                                            {photo.src ? (
                                                <img src={photo.src} alt="" />
                                            ) : (
                                                <span>{index + 1}</span>
                                            )}
                                            <b>{String(index + 1).padStart(2, '0')}</b>
                                        </div>
                                        <div className="checkphone-settings-photo-actions">
                                            <button type="button" onClick={() => openDesktopPhotoUpload(index)}>
                                                上传图片
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleResetDesktopPhoto(index)}
                                                disabled={!customPhoto}
                                            >
                                                恢复
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <button
                        type="button"
                        className="checkphone-settings-install"
                        onClick={() => {
                            setShowDesktopSettings(false);
                            setShowCreateModal(true);
                        }}
                    >
                        <Plus weight="bold" />
                        安装新 App
                    </button>

                    <section className="checkphone-settings-section">
                        <div className="checkphone-settings-section-head">
                            <div>
                                <h4>App 图标</h4>
                                <span>{desktopSettingsApps.length} 个桌面图标</span>
                            </div>
                        </div>
                        <div className="checkphone-settings-icon-list">
                            {desktopSettingsApps.map(app => {
                                const IconComponent = 'icon' in app ? app.icon : undefined;
                                const iconOverride = desktopIconOverrides[app.id];
                                const canDelete = 'isCustom' in app && app.isCustom;
                                return (
                                    <div className="checkphone-settings-icon-row" key={app.id}>
                                        <div className="checkphone-settings-icon-sample">
                                            {iconOverride ? (
                                                <img src={iconOverride} alt="" />
                                            ) : IconComponent ? (
                                                <IconComponent weight="regular" />
                                            ) : (
                                                <span>{'emoji' in app ? app.emoji : '•'}</span>
                                            )}
                                        </div>
                                        <div className="checkphone-settings-icon-name">{app.label}</div>
                                        <div className="checkphone-settings-icon-actions">
                                            <button type="button" onClick={() => openDesktopIconUpload(app.id)}>
                                                换图标
                                            </button>
                                            {iconOverride ? (
                                                <button type="button" onClick={() => handleResetDesktopIcon(app.id)}>
                                                    恢复
                                                </button>
                                            ) : null}
                                            {canDelete ? (
                                                <button
                                                    type="button"
                                                    className="is-danger"
                                                    onClick={() => handleDeleteApp(app.id)}
                                                >
                                                    卸载
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            </Modal>

            {/* Create App Modal */}
            <Modal isOpen={showCreateModal} title="安装自定义 App" onClose={() => setShowCreateModal(false)} footer={<button onClick={handleCreateCustomApp} className="w-full py-3 bg-blue-500 text-white font-bold rounded-2xl">安装到桌面</button>}>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl shadow-md border-2 border-slate-100 shrink-0" style={{ background: newAppColor }}>
                            {newAppIcon}
                        </div>
                        <div className="flex-1 space-y-2">
                            <input value={newAppName} onChange={e => setNewAppName(e.target.value)} placeholder="App 名称 (如: 银行)" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                            <div className="flex gap-2">
                                <input value={newAppIcon} onChange={e => setNewAppIcon(e.target.value)} placeholder="Emoji" className="w-16 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center" />
                                <input type="color" value={newAppColor} onChange={e => setNewAppColor(e.target.value)} className="h-9 flex-1 cursor-pointer rounded-lg bg-transparent" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">功能指令 (AI Prompt)</label>
                        <textarea
                            value={newAppPrompt}
                            onChange={e => setNewAppPrompt(e.target.value)}
                            placeholder="例如: 显示该用户的存款余额、近期的转账记录以及理财收益。"
                            className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs resize-none"
                        />
                        <p className="text-[9px] text-slate-400 mt-1">AI 将根据此指令生成该 App 内部的数据。</p>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default CheckPhone;
