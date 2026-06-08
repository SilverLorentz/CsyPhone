import React from 'react';
import { Camera, ChatCircleDots } from '@phosphor-icons/react';

interface ShiguangCameraCardProps {
    title: string;
    value?: string;
    comment?: string;
    albumCover?: string;
    charName?: string;
    charAvatar?: string;
}

const ShiguangCameraCard: React.FC<ShiguangCameraCardProps> = ({
    title,
    value,
    comment,
    albumCover,
    charName,
    charAvatar,
}) => {
    const displayName = charName || 'TA';

    return (
        <div className="w-[272px] overflow-hidden rounded-lg border border-[#eadfcc] bg-[#f6efe4] shadow-[0_18px_40px_rgba(67,45,33,0.16)]">
            <div className="flex items-center justify-between px-3.5 py-2.5 text-[#6f5a43]">
                <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold leading-tight">{title || '相机照片'}</div>
                    <div className="text-[8px] uppercase tracking-[0.18em] text-[#a68a68]">Shiguang Camera</div>
                </div>
                {value && <span className="max-w-[80px] truncate rounded-full bg-white/70 px-2 py-1 text-[9px] font-medium text-[#9a7350]">{value}</span>}
            </div>

            <div className="px-4 pb-3">
                <div className="-rotate-[1.5deg] bg-white p-2.5 pb-5 shadow-[0_14px_28px_rgba(83,62,43,0.18)]">
                    <div className="relative aspect-[4/5] overflow-hidden bg-[#d8c9b7]">
                        {albumCover ? (
                            <img src={albumCover} alt={title || '相机照片'} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[#8b765f]">
                                <Camera className="h-8 w-8" weight="duotone" />
                                <span className="text-[10px]">照片正在显影</span>
                            </div>
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.24),transparent_34%,rgba(0,0,0,0.08))]" />
                    </div>
                </div>
            </div>

            {comment ? (
                <div className="mx-3.5 mb-3 flex items-start gap-2 rounded-lg bg-white/72 p-2.5 shadow-inner shadow-white/40">
                    <div className="h-8 w-8 flex-none overflow-hidden rounded-full bg-[#efe1cf] ring-1 ring-white">
                        {charAvatar ? (
                            <img src={charAvatar} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-[12px] font-semibold text-[#9d7b58]">
                                {displayName.slice(0, 1)}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold text-[#9c7c5b]">
                            <ChatCircleDots className="h-3 w-3" weight="bold" />
                            <span className="truncate">{displayName} 看见后说</span>
                        </div>
                        <div className="rounded-2xl rounded-tl-md bg-[#2f2a25] px-3 py-2 text-[11px] leading-relaxed text-[#fff7ec] shadow-sm">
                            {comment}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mx-3.5 mb-3 rounded-lg border border-white/70 bg-white/55 px-3 py-2 text-[10px] leading-relaxed text-[#9a7b5c]">
                    这张拍立得已经回到主聊天，等 {displayName} 看见它。
                </div>
            )}
        </div>
    );
};

export default ShiguangCameraCard;
