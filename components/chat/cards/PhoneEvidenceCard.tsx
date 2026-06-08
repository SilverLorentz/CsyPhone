import React from 'react';
import { Message } from '../../../types';

// ─── Sub-card imports (modular architecture) ────────────────────
import WeChatSpyCard from './phone/WeChatSpyCard';
import TaobaoOrderCard from './phone/TaobaoOrderCard';
import MeituanTakeoutCard from './phone/MeituanTakeoutCard';
import CallLogCard from './phone/CallLogCard';
import SocialPostSpyCard from './phone/SocialPostSpyCard';
import DefaultAppCard from './phone/DefaultAppCard';
import NeteaseMusicPhoneCard, { NeteaseMusicPhoneTrack } from './phone/NeteaseMusicPhoneCard';
import ShiguangCameraCard from './phone/ShiguangCameraCard';

/**
 * PhoneEvidenceCard — Pure Dispatcher / Router
 *
 * Routes `phoneType` to the appropriate sub-card component.
 * Each sub-card lives in its own file under `./phone/` for
 * easy maintenance, independent iteration, and zero cross-contamination.
 *
 * These cards are IMMUTABLE (not affected by chat theme).
 */

interface PhoneEvidenceCardProps {
    message: Message;
    charName?: string;
    charAvatar?: string;
}

function asPhoneCardText(value: unknown, fallback = '', maxChars = 1200): string {
    let text = fallback;
    if (value === null || value === undefined) return fallback;

    if (typeof value === 'string') {
        text = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
        text = String(value);
    } else if (Array.isArray(value)) {
        text = value
            .map(item => asPhoneCardText(item, '', Math.ceil(maxChars / 2)))
            .filter(Boolean)
            .join('; ');
    } else if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const candidate = record.text ?? record.content ?? record.name ?? record.label ?? record.title ?? record.detail ?? record.status ?? record.amount ?? record.value ?? record.shop;
        if (candidate !== undefined && candidate !== value) {
            text = asPhoneCardText(candidate, fallback, maxChars);
        } else {
            try {
                text = JSON.stringify(value);
            } catch {
                text = fallback;
            }
        }
    }

    const normalized = text.trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars).trimEnd()}...`;
}

function asPhoneCardNumber(value: unknown): number | undefined {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function asPhoneCardImageUrl(value: unknown): string | undefined {
    return asPhoneCardText(value, '', Number.POSITIVE_INFINITY) || undefined;
}

function asNeteaseTrack(value: unknown): NeteaseMusicPhoneTrack | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const title = asPhoneCardText(record.title);
    const artist = asPhoneCardText(record.artist);
    if (!title && !artist) return null;

    return {
        title,
        artist,
        comment: asPhoneCardText(record.comment) || undefined,
        tag: asPhoneCardText(record.tag) || undefined,
        albumCover: asPhoneCardText(record.albumCover) || undefined,
        playlistName: asPhoneCardText(record.playlistName) || undefined,
        playlistCount: asPhoneCardNumber(record.playlistCount),
        playlistIndex: asPhoneCardNumber(record.playlistIndex),
        songIndex: asPhoneCardNumber(record.songIndex),
    };
}

const PhoneEvidenceCard: React.FC<PhoneEvidenceCardProps> = ({ message, charName: currentCharName, charAvatar: currentCharAvatar }) => {
    const meta = message.metadata || {};
    const phoneType = asPhoneCardText(meta.phoneType);
    const title = asPhoneCardText(meta.phoneTitle);
    const detail = asPhoneCardText(meta.phoneDetail);
    const value = asPhoneCardText(meta.phoneValue) || undefined;
    const label = asPhoneCardText(meta.phoneLabel, phoneType);
    const charName = currentCharName || asPhoneCardText(meta.charName);
    const charAvatar = currentCharAvatar || asPhoneCardText(meta.charAvatar) || undefined;
    const shop = asPhoneCardText(meta.phoneShop) || undefined;
    const comment = asPhoneCardText(meta.phoneComment) || undefined;
    const albumCover = asPhoneCardImageUrl(meta.phoneAlbumCover);
    const profileNickname = asPhoneCardText(meta.phoneProfileNickname) || undefined;
    const profileLevel = asPhoneCardNumber(meta.phoneProfileLevel);
    const profileSignature = asPhoneCardText(meta.phoneProfileSignature) || undefined;
    const profilePlayCount = asPhoneCardNumber(meta.phoneProfilePlayCount);

    switch (phoneType) {
        case 'chat':
            return <WeChatSpyCard title={title} detail={detail} charName={charName} />;
        case 'order':
            return <TaobaoOrderCard title={title} detail={detail} value={value} shop={shop} />;
        case 'delivery':
            return <MeituanTakeoutCard title={title} detail={detail} value={value} shop={shop} />;
        case 'call':
            return <CallLogCard title={title} detail={detail} value={value} />;
        case 'social':
            return <SocialPostSpyCard title={title} detail={detail} charName={charName} charAvatar={charAvatar} />;
        case 'shiguang_camera':
            return (
                <ShiguangCameraCard
                    title={title}
                    value={value}
                    comment={comment}
                    albumCover={albumCover}
                    charName={charName}
                    charAvatar={charAvatar}
                />
            );
        case 'netease_music_page': {
            const tracks = Array.isArray(meta.phoneNeteaseTracks)
                ? meta.phoneNeteaseTracks
                    .map(asNeteaseTrack)
                    .filter((track): track is NeteaseMusicPhoneTrack => Boolean(track))
                : [];
            return (
                <NeteaseMusicPhoneCard
                    profileNickname={profileNickname}
                    profileLevel={profileLevel}
                    profileSignature={profileSignature}
                    profilePlayCount={profilePlayCount}
                    charName={charName}
                    charAvatar={charAvatar}
                    tracks={tracks}
                />
            );
        }
        case 'netease_music':
            return (
                <NeteaseMusicPhoneCard
                    profileNickname={profileNickname}
                    profileLevel={profileLevel}
                    profileSignature={profileSignature}
                    profilePlayCount={profilePlayCount}
                    charName={charName}
                    charAvatar={charAvatar}
                    tracks={[{
                        title,
                        artist: asPhoneCardText(meta.phoneArtist) || detail.split(/\s*\|\s*|\n/)[0] || '未知歌手',
                        comment,
                        tag: value,
                        albumCover,
                        playlistName: asPhoneCardText(meta.phonePlaylistName) || undefined,
                        playlistCount: asPhoneCardNumber(meta.phonePlaylistCount),
                        playlistIndex: asPhoneCardNumber(meta.phonePlaylistIndex),
                        songIndex: asPhoneCardNumber(meta.phoneSongIndex),
                    }]}
                />
            );
        default:
            // Custom apps or unknown types — generic purple card
            return <DefaultAppCard label={label} title={title} detail={detail} value={value} />;
    }
};

export default PhoneEvidenceCard;
