import React from 'react';

/**
 * CallLogCard — 通话记录仿真卡片
 */

interface CallLogCardProps {
    title: string;
    detail: string;
    value?: string;
}

const CallLogCard: React.FC<CallLogCardProps> = ({ title, detail, value }) => (
    <div className="w-60 bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
        <div className="px-3 py-2 bg-gradient-to-r from-slate-700 to-slate-800 flex items-center gap-2">
            <span className="text-sm">📞</span>
            <span className="text-[11px] text-white font-medium">通话记录</span>
        </div>
        <div className="px-3 py-2.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {(title || '?')[0]}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[12px] text-slate-800 font-medium truncate">{title}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{value || '未知'}</div>
                {detail && <div className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">{detail}</div>}
            </div>
        </div>
    </div>
);

export default CallLogCard;
