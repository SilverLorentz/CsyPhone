import React from 'react';
import { TransferCardProps } from '../ThemeRegistry';

const WeChatTransferCard: React.FC<TransferCardProps> = ({ message: m, isUser, charName, selectionMode, onTransferAction }) => {
    const status = (m.metadata?.status as string) || 'pending';
    const isPending = status === 'pending';
    const isAccepted = status === 'accepted';
    const isReturned = status === 'returned';

    // Colors: pending=bright orange, accepted=muted light orange, returned=grey
    const topBg = isPending ? '#f3883b' : isReturned ? '#e8e8e8' : '#fadcce';
    const bottomBg = isPending ? '#ffffff' : isReturned ? '#f0f0f0' : '#f7ece3';
    const amtColor = isPending ? '#ffffff' : isReturned ? '#999999' : '#f09a37';
    const descColor = isPending ? 'rgba(255,255,255,0.8)' : isReturned ? '#aaaaaa' : '#c08a5a';
    const labelColor = isPending ? '#f3883b' : isReturned ? '#bbbbbb' : '#d4a574';

    // Status text from the viewer's perspective
    let statusText = '';
    if (isPending) {
        statusText = isUser ? `转账给${charName}` : '转账给你';
    } else if (isAccepted) {
        statusText = isUser ? '已被接收' : '已收款';
    } else if (isReturned) {
        statusText = '已退还';
    }

    // Icons for different states
    const StatusIcon = () => {
        if (isPending) {
            // Double-arrow transfer icon
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
            );
        }
        if (isAccepted) {
            // Checkmark without outer circle (handled by container)
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px] ml-0.5"><path d="M5 13l4 4L19 7" /></svg>
            );
        }
        // Returned: 1:1 WeChat refund arrow (arrow curving to the left)
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-[17px] h-[17px]"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" /></svg>
        );
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
            className={`sully-transfer-card ${isReturned ? 'is-returned' : ''} ${isAccepted ? 'is-accepted' : ''} w-full max-w-[220px] sm:max-w-[240px] flex flex-col rounded-[8px] overflow-hidden shadow-sm ${isPending ? 'cursor-pointer active:scale-[0.98]' : ''} transition-transform`}
            onClick={handleTransferClick}
        >
            {/* Top Section */}
            <div className="sully-transfer-top p-3.5 pb-3 relative" style={{ backgroundColor: topBg }}>
                {/* Faint ¥ watermark */}
                <span className="sully-transfer-watermark absolute right-3 top-1/2 -translate-y-1/2 text-[42px] font-bold leading-none pointer-events-none select-none" style={{ fontFamily: 'system-ui, sans-serif', color: isPending ? 'rgba(255,255,255,0.12)' : 'rgba(210,160,100,0.15)' }}>¥</span>

                <div className="flex items-center gap-3 relative z-10">
                    {/* Status icon */}
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: isPending ? 'rgba(255,255,255,0.2)' : '#ffffff', color: amtColor }}>
                        <StatusIcon />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-base font-medium leading-tight" style={{ color: amtColor }}>¥{m.metadata?.amount || '0.00'}</span>
                        <span className="text-[11px] mt-0.5 max-w-[130px] truncate leading-tight" style={{ color: descColor }}>
                            {statusText}
                        </span>
                    </div>
                </div>
            </div>

            {/* Bottom Flap */}
            <div className="sully-transfer-bottom px-3.5 py-1.5 flex items-center" style={{ backgroundColor: bottomBg }}>
                <span className="text-[10px] font-medium opacity-80" style={{ color: labelColor }}>微信转账</span>
            </div>
        </div>
    );
};

export default WeChatTransferCard;
