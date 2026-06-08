import React from 'react';

/**
 * TaobaoOrderCard — 高仿淘宝购物订单卡片
 * Renders a realistic Taobao order card for the chat evidence system.
 */

interface TaobaoOrderCardProps {
    title: string;
    detail: string;
    value?: string;
    shop?: string;
}

const TaobaoOrderCard: React.FC<TaobaoOrderCardProps> = ({ title, detail, value, shop }) => {
    // Parse detail: try to split "规格 | 状态" pattern
    const detailParts = detail.split(/[|｜]/).map(s => s.trim()).filter(Boolean);
    const spec = detailParts.length > 1 ? detailParts[0] : '';
    const status = detailParts.length > 1 ? detailParts.slice(1).join(' · ') : detail;

    // Derive status color
    const statusColor = status.includes('已完成') || status.includes('已签收') || status.includes('交易成功')
        ? 'text-green-600'
        : status.includes('已发货') || status.includes('运输中')
            ? 'text-orange-500'
            : status.includes('待付款')
                ? 'text-red-500'
                : 'text-slate-500';

    return (
        <div className="w-64 bg-white rounded-lg overflow-hidden shadow-sm" style={{ border: '1px solid #f0f0f0' }}>
            {/* ── Header: Taobao branding ── */}
            <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ borderBottom: '1px solid #f5f5f5' }}>
                <div className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-black text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, #FF5000, #FF2800)' }}>
                    淘
                </div>
                <span className="text-[10px] text-slate-400 tracking-wide">购物订单</span>
            </div>

            {/* ── Body: Image placeholder + Info ── */}
            <div className="px-3 py-2.5 flex gap-2.5">
                {/* Product image skeleton */}
                <div className="w-16 h-16 rounded-md shrink-0 flex items-center justify-center"
                    style={{ background: '#f7f7f7' }}>
                    <span className="text-xl text-slate-300 select-none">
                        {(title || '?')[0]}
                    </span>
                </div>
                {/* Product info */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="text-[12px] text-slate-800 font-medium leading-snug line-clamp-2">
                        {title}
                    </div>
                    {spec && (
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate">{spec}</div>
                    )}
                    <div className="flex items-center justify-between mt-1">
                        <span className={`text-[10px] font-medium ${statusColor}`}>{status}</span>
                        {value && (
                            <span className="text-[12px] font-bold" style={{ color: '#FF5000' }}>
                                {value.startsWith('¥') || value.startsWith('￥') ? value : `¥${value}`}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Footer: Shop name ── */}
            <div className="px-3 py-1.5 flex items-center justify-between" style={{ borderTop: '1px solid #f5f5f5' }}>
                <span className="text-[10px] text-slate-400 truncate max-w-[70%]">
                    {shop || '淘宝商家'}
                </span>
                <span className="text-[10px] text-slate-300">订单详情 ›</span>
            </div>
        </div>
    );
};

export default TaobaoOrderCard;
