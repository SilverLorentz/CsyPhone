import React from 'react';
import { CurrencyCircleDollar,CheckCircle,ArrowUUpLeft } from '@phosphor-icons/react';
import { TransferCardProps } from '../ThemeRegistry';

const DefaultTransferCard: React.FC<TransferCardProps> = ({ message: m, isUser, charName, selectionMode, onTransferAction }) => {
    const status = (m.metadata?.status as string) || 'pending';
    const isPending = status === 'pending';
    const isAccepted = status === 'accepted';
    const isReturned = status === 'returned';

    // Slate / Indigo neutral color scheme
    const topBg = isPending ? '#3b82f6' : isReturned ? '#e2e8f0' : '#dbeafe';
    const bottomBg = isPending ? '#ffffff' : isReturned ? '#f1f5f9' : '#eff6ff';
    const amtColor = isPending ? '#ffffff' : isReturned ? '#94a3b8' : '#3b82f6';
    const descColor = isPending ? 'rgba(255,255,255,0.8)' : isReturned ? '#94a3b8' : '#60a5fa';
    const labelColor = isPending ? '#3b82f6' : isReturned ? '#cbd5e1' : '#93c5fd';

    // Status text from the viewer's perspective
    let statusText = '';
    if (isPending) {
        statusText = isUser ? `转账给${charName}` : '转账给你';
    } else if (isAccepted) {
        statusText = isUser ? '已被接收' : '已收款';
    } else if (isReturned) {
        statusText = '已退还';
    }

    const StatusIcon = () => {
        if (isPending) {
            return <CurrencyCircleDollar className="w-5 h-5" weight="bold" />;
        }
        if (isAccepted) {
            return <CheckCircle className="w-5 h-5" weight="fill" />;
        }
        return <ArrowUUpLeft className="w-5 h-5" weight="bold" />;
    };

    const handleTransferClick = (e: React.MouseEvent) => {
        if (selectionMode) return;
        if (!isPending) return; // Only pending cards are actionable
        e.stopPropagation();
        if (typeof onTransferAction === 'function') {
            onTransferAction(m);
        }
    };

    return (
        <div
            className={`sully-transfer-card ${isReturned ? 'is-returned' : ''} ${isAccepted ? 'is-accepted' : ''} w-full max-w-[220px] sm:max-w-[240px] flex flex-col rounded-[12px] overflow-hidden shadow-sm border border-slate-100 ${isPending ? 'cursor-pointer active:scale-[0.98]' : ''} transition-transform`}
            onClick={handleTransferClick}
        >
            {/* Top Section */}
            <div className="sully-transfer-top p-3.5 pb-3 relative" style={{ backgroundColor: topBg }}>
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10px 10px, black 2px, transparent 0)', backgroundSize: '20px 20px' }} />

                <div className="flex items-center gap-3 relative z-10">
                    {/* Status icon */}
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: isPending ? 'rgba(255,255,255,0.2)' : '#ffffff', color: amtColor }}>
                        <StatusIcon />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-base font-bold leading-tight" style={{ color: amtColor, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                            <span className="text-[12px] opacity-80 mr-0.5">¥</span>
                            {m.metadata?.amount || '0.00'}
                        </span>
                        <span className="text-[11px] mt-0.5 max-w-[130px] truncate leading-tight font-medium" style={{ color: descColor }}>
                            {statusText}
                        </span>
                    </div>
                </div>
            </div>

            {/* Bottom Flap */}
            <div className="sully-transfer-bottom px-3.5 py-2 flex items-center justify-between" style={{ backgroundColor: bottomBg }}>
                <span className="text-[10px] font-bold tracking-wide opacity-80" style={{ color: labelColor }}>TRANSFER</span>
            </div>
        </div>
    );
};

export default DefaultTransferCard;
