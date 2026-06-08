import React from 'react';

/**
 * DefaultAppCard — 默认/自定义应用仿真卡片
 * Fallback for unknown phone types or custom apps.
 */

interface DefaultAppCardProps {
    label: string;
    title: string;
    detail: string;
    value?: string;
}

const DefaultAppCard: React.FC<DefaultAppCardProps> = ({ label, title, detail, value }) => (
    <div className="w-60 bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
        <div className="px-3 py-2 bg-gradient-to-r from-violet-500 to-purple-600 flex items-center gap-2">
            <span className="text-sm">📱</span>
            <span className="text-[11px] text-white font-medium truncate">{label}</span>
        </div>
        <div className="px-3 py-2.5">
            <div className="text-[12px] text-slate-800 font-medium line-clamp-1 mb-1">{title}</div>
            <div className="text-[10px] text-slate-500 line-clamp-3 leading-relaxed">{detail}</div>
            {value && (
                <div className="mt-1.5 text-right">
                    <span className="text-[10px] font-medium text-violet-500">{value}</span>
                </div>
            )}
        </div>
    </div>
);

export default DefaultAppCard;
