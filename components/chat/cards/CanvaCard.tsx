import React from 'react';
import { ArrowSquareOut, DownloadSimple, ImagesSquare } from '@phosphor-icons/react';
import type { CanvaDesignSummary } from '../../../types/canva';

interface CanvaCardProps {
    design: CanvaDesignSummary;
}

const statusLabel: Record<string, string> = {
    created: '设计草稿',
    searched: '搜索结果',
    exported: '导出结果',
    candidate: '候选设计',
};

const CanvaCard: React.FC<CanvaCardProps> = ({ design }) => {
    const primaryUrl = design.exportUrl || design.url;
    const label = statusLabel[design.status || ''] || 'Canva 设计';

    const openPrimary = () => {
        if (primaryUrl) window.open(primaryUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="sully-card-container w-64 overflow-hidden rounded-xl border border-cyan-100 bg-white shadow-sm">
            <button
                type="button"
                onClick={openPrimary}
                disabled={!primaryUrl}
                className="block w-full text-left disabled:cursor-default"
                aria-label={primaryUrl ? '打开 Canva 设计' : 'Canva 设计'}
            >
                {design.thumbnailUrl ? (
                    <div className="relative h-36 w-full overflow-hidden bg-cyan-50">
                        <img
                            src={design.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                                event.currentTarget.style.display = 'none';
                            }}
                        />
                        <div className="absolute left-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[9px] font-bold text-cyan-700 shadow-sm backdrop-blur">
                            {label}
                        </div>
                    </div>
                ) : (
                    <div className="flex h-24 w-full items-center justify-center bg-gradient-to-br from-cyan-400 via-sky-400 to-fuchsia-400">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 text-white shadow-sm backdrop-blur">
                            <ImagesSquare className="h-6 w-6" weight="duotone" />
                        </div>
                    </div>
                )}

                <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[9px] font-bold text-cyan-700">{label}</span>
                        {design.format && <span className="text-[9px] font-bold uppercase text-slate-300">{design.format}</span>}
                    </div>
                    <div className="line-clamp-2 text-sm font-bold leading-snug text-slate-800">{design.title || 'Canva 设计'}</div>
                    {design.designType && <p className="text-[10px] font-medium text-slate-400">{design.designType}</p>}
                </div>
            </button>

            <div className="flex items-center justify-between border-t border-slate-50 px-3 py-2">
                <span className="text-[9px] font-bold tracking-wide text-cyan-500">Canva</span>
                <div className="flex items-center gap-2">
                    {design.exportUrl && (
                        <a
                            href={design.exportUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-500 active:scale-95"
                            aria-label="下载 Canva 导出"
                            title="下载 Canva 导出"
                        >
                            <DownloadSimple className="h-4 w-4" weight="bold" />
                        </a>
                    )}
                    {primaryUrl && (
                        <a
                            href={primaryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-50 text-cyan-600 active:scale-95"
                            aria-label="打开 Canva 设计"
                            title="打开 Canva 设计"
                        >
                            <ArrowSquareOut className="h-4 w-4" weight="bold" />
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CanvaCard;
