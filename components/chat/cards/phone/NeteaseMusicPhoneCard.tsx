import React, { useMemo } from 'react';

export interface NeteaseMusicPhoneTrack {
    title: string;
    artist: string;
    comment?: string;
    tag?: string;
    albumCover?: string;
    playlistName?: string;
    playlistCount?: number;
    playlistIndex?: number;
    songIndex?: number;
}

interface NeteaseMusicPhoneCardProps {
    profileNickname?: string;
    profileLevel?: number;
    profileSignature?: string;
    profilePlayCount?: number;
    charName?: string;
    charAvatar?: string;
    tracks: NeteaseMusicPhoneTrack[];
}

interface PlaylistGroup {
    key: string;
    name: string;
    count?: number;
    index: number;
    tracks: NeteaseMusicPhoneTrack[];
}

const formatIndex = (index: number): string => String(index + 1).padStart(2, '0');

const formatCount = (value?: number): string => {
    if (!Number.isFinite(value)) return '0';
    return new Intl.NumberFormat('zh-CN').format(value || 0);
};

const getInitial = (value: string): string => {
    const chars = Array.from(value.trim());
    return chars[0] || 'N';
};

const fallbackGradient = (index: number): string => {
    const gradients = [
        'linear-gradient(135deg, #f87171 0%, #7f1d1d 100%)',
        'linear-gradient(135deg, #fb7185 0%, #701a75 100%)',
        'linear-gradient(135deg, #facc15 0%, #991b1b 100%)',
        'linear-gradient(135deg, #38bdf8 0%, #1e1b4b 100%)',
    ];
    return gradients[index % gradients.length];
};

const groupTracksByPlaylist = (tracks: NeteaseMusicPhoneTrack[]): PlaylistGroup[] => {
    const groups = new Map<string, PlaylistGroup>();

    tracks.forEach((track) => {
        const index = Number.isFinite(track.playlistIndex) ? track.playlistIndex || 0 : 0;
        const name = track.playlistName || '最近听歌痕迹';
        const key = `${index}:${name}`;
        const existing = groups.get(key);

        if (existing) {
            existing.tracks.push(track);
            if (!existing.count && track.playlistCount) existing.count = track.playlistCount;
            return;
        }

        groups.set(key, {
            key,
            name,
            count: track.playlistCount,
            index,
            tracks: [track],
        });
    });

    return Array.from(groups.values())
        .sort((a, b) => a.index - b.index)
        .map(group => ({
            ...group,
            tracks: [...group.tracks].sort((a, b) => {
                const aIndex = Number.isFinite(a.songIndex) ? a.songIndex || 0 : tracks.indexOf(a);
                const bIndex = Number.isFinite(b.songIndex) ? b.songIndex || 0 : tracks.indexOf(b);
                return aIndex - bIndex;
            }),
        }));
};

const NeteaseMusicPhoneCard: React.FC<NeteaseMusicPhoneCardProps> = ({
    profileNickname,
    profileLevel,
    profileSignature,
    profilePlayCount,
    charName,
    charAvatar,
    tracks,
}) => {
    const safeTracks = tracks.filter(track => track.title || track.artist);
    const playlists = useMemo(() => groupTracksByPlaylist(safeTracks), [safeTracks]);
    const displayName = profileNickname || (charName ? `${charName}的网易云` : '网易云音乐');
    const firstCover = safeTracks.find(track => track.albumCover)?.albumCover;
    const [avatarLoadFailed, setAvatarLoadFailed] = React.useState(false);
    const avatarSrc = !avatarLoadFailed ? (charAvatar || firstCover) : undefined;

    return (
        <article className="w-[304px] max-w-[78vw] overflow-hidden rounded-[7px] border border-red-950/10 bg-[#0f1014] text-white shadow-[0_16px_34px_rgba(15,23,42,0.28)]">
            <div className="bg-gradient-to-b from-[#2b0d11] via-[#151015] to-[#0f1014] px-4 pt-3.5 pb-3">
                <div className="mb-3 flex items-center justify-between text-[8px] font-semibold uppercase tracking-[0.18em] text-red-100/45">
                    <span>NETEASE CLOUD</span>
                    <span>PHONE TRACE</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative h-[54px] w-[54px] shrink-0 overflow-hidden rounded-full border border-white/20 bg-red-950">
                        {avatarSrc ? (
                            <img
                                src={avatarSrc}
                                alt=""
                                className="h-full w-full object-cover"
                                onError={() => setAvatarLoadFailed(true)}
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-red-700 text-lg font-bold">
                                {getInitial(displayName)}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-bold leading-tight">{displayName}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-white/55">
                            {profileLevel ? <span>Lv.{profileLevel}</span> : null}
                            <span>{formatCount(profilePlayCount || safeTracks.length)} 次播放</span>
                            <span>{safeTracks.length} 首痕迹</span>
                        </div>
                    </div>
                </div>

                {profileSignature ? (
                    <div className="mt-3 rounded-[5px] border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[10px] leading-relaxed text-white/68">
                        {profileSignature}
                    </div>
                ) : null}
            </div>

            <div className="max-h-[420px] overflow-y-auto bg-[#f7f3ef] text-[#171717]">
                {playlists.map(playlist => (
                    <section key={playlist.key} className="border-b border-stone-200/80 last:border-b-0">
                        <div className="flex items-center gap-2 px-3.5 py-2.5">
                            <span className="text-[10px] font-black text-red-600">{formatIndex(playlist.index)}</span>
                            <span
                                className="h-8 w-8 shrink-0 rounded-[5px] shadow-inner"
                                style={{ background: fallbackGradient(playlist.index) }}
                            />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[12px] font-bold">{playlist.name}</div>
                                <div className="text-[9px] font-medium uppercase tracking-[0.08em] text-stone-400">
                                    {playlist.count || playlist.tracks.length} tracks · private
                                </div>
                            </div>
                        </div>

                        <div className="pb-2">
                            {playlist.tracks.map((track, index) => {
                                const artIndex = playlist.index + index + 1;
                                return (
                                    <div key={`${playlist.key}-${track.title}-${index}`} className="px-3.5 py-2">
                                        <div className="flex items-start gap-2.5">
                                            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[5px] bg-stone-200">
                                                {track.albumCover ? (
                                                    <img src={track.albumCover} alt="" className="h-full w-full object-cover" />
                                                ) : (
                                                    <span
                                                        className="block h-full w-full"
                                                        style={{ background: fallbackGradient(artIndex) }}
                                                    />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="truncate text-[12px] font-semibold leading-tight">{track.title}</span>
                                                    {track.tag ? (
                                                        <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[8px] font-bold text-red-500">
                                                            {track.tag}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div className="mt-0.5 truncate text-[9px] text-stone-500">{track.artist}</div>
                                                {track.comment ? (
                                                    <div className="mt-1.5 rounded-[5px] bg-white px-2 py-1.5 text-[10px] leading-relaxed text-stone-600 shadow-[inset_0_0_0_1px_rgba(214,211,209,0.65)]">
                                                        {track.comment}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </article>
    );
};

export default NeteaseMusicPhoneCard;
