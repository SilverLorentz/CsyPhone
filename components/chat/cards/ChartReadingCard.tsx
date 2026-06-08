/**
 * ChartReadingCard — 星盘解读「星痕铭刻」系统通知卡片
 *
 * 洛可可中世纪华丽风：命运轮盘、链式分割线、神秘学符号装饰。
 * 用于在主聊天中展示「命运之神的星轨推演」摘要。
 */
import React from 'react';
import { Message } from '../../../types';
import { DECOR } from '../../../apps/zhaixinglou/components/GothicDecorations';

interface ChartReadingCardProps {
    message: Message;
    displayText: string;
}

const ChartReadingCard: React.FC<ChartReadingCardProps> = ({ displayText }) => {
    return (
        <div
            className="w-[90%] max-w-sm mx-auto relative overflow-hidden"
            style={{
                borderRadius: '16px',
                background: 'linear-gradient(160deg, #1a1408 0%, #2a1f10 30%, #1e1a0e 60%, #151008 100%)',
                border: '1px solid rgba(212,175,55,0.3)',
                boxShadow: `
                    0 0 20px rgba(212,175,55,0.06),
                    0 4px 24px rgba(0,0,0,0.5),
                    inset 0 1px 0 rgba(212,175,55,0.15),
                    inset 0 -1px 0 rgba(212,175,55,0.05)
                `,
            }}
        >
            {/* ── Inner ornate border ── */}
            <div
                className="absolute inset-[3px] rounded-[13px] pointer-events-none z-[1]"
                style={{
                    border: '1px solid rgba(212,175,55,0.12)',
                    boxShadow: 'inset 0 0 30px rgba(212,175,55,0.04)',
                }}
            />

            {/* ── Ambient radial glow ── */}
            <div
                className="absolute inset-0 pointer-events-none z-[0]"
                style={{
                    background: 'radial-gradient(ellipse at 50% 20%, rgba(212,175,55,0.08) 0%, transparent 60%)',
                }}
            />

            {/* ── Top decorative divider ── */}
            <div className="flex items-center justify-center pt-3 px-4 relative z-[2]">
                <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/20 to-[#d4af37]/10" />
                <img
                    src={DECOR.chainDivider}
                    className="w-10 h-auto object-contain mx-2"
                    style={{
                        opacity: 0.4,
                        filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.3))',
                    }}
                    alt=""
                />
                <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent via-[#d4af37]/20 to-[#d4af37]/10" />
            </div>

            {/* ── Wheel of Fortune (rotating decoration) ── */}
            <div className="flex justify-center -mt-1 mb-0 relative z-[2]">
                <img
                    src={DECOR.wheel}
                    className="w-10 h-10 object-contain"
                    style={{
                        opacity: 0.3,
                        filter: 'drop-shadow(0 0 10px rgba(212,175,55,0.4))',
                        animation: 'gothic-spin 30s linear infinite',
                    }}
                    alt=""
                />
            </div>

            {/* ── Title row with occult symbol flanks ── */}
            <div className="flex items-center justify-center gap-2 px-4 -mt-1 relative z-[2]">
                <img
                    src={DECOR.occultSymbol}
                    className="w-4 h-4 object-contain"
                    style={{
                        opacity: 0.35,
                        filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.3))',
                        animation: 'gothic-glow-pulse 4s ease-in-out infinite',
                    }}
                    alt=""
                />
                <span
                    className="text-sm tracking-[0.2em] font-bold"
                    style={{
                        fontFamily: 'ZhaixinglouTitle, serif',
                        color: '#d4af37',
                        textShadow: '0 0 12px rgba(212,175,55,0.5), 0 0 4px rgba(212,175,55,0.3)',
                    }}
                >
                    星象启示
                </span>
                <img
                    src={DECOR.occultSymbol}
                    className="w-4 h-4 object-contain"
                    style={{
                        opacity: 0.35,
                        filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.3))',
                        transform: 'scaleX(-1)',
                        animation: 'gothic-glow-pulse 4s ease-in-out infinite 2s',
                    }}
                    alt=""
                />
            </div>

            {/* ── Subtitle ── */}
            <div className="text-center mt-0.5 mb-1.5 relative z-[2]">
                <span
                    className="text-[8px] tracking-[0.3em] uppercase"
                    style={{ color: '#8c6b3e', opacity: 0.7 }}
                >
                    命运之神的星轨推演
                </span>
            </div>

            {/* ── Content body ── */}
            <div className="px-5 pb-2 relative z-[2]">
                <div
                    className="text-[11px] leading-[1.8] font-normal"
                    style={{
                        fontFamily: 'ZhaixinglouCN, "Noto Serif SC", serif',
                        color: '#c8b88a',
                        textShadow: '0 0 8px rgba(200,184,138,0.1)',
                    }}
                >
                    {displayText}
                </div>
            </div>

            {/* ── Bottom decorative divider with crown ── */}
            <div className="flex items-center justify-center px-4 pb-3 relative z-[2]">
                <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/15 to-[#d4af37]/08" />
                <img
                    src={DECOR.crown}
                    className="w-5 h-5 object-contain mx-2"
                    style={{
                        opacity: 0.25,
                        filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.3))',
                    }}
                    alt=""
                />
                <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent via-[#d4af37]/15 to-[#d4af37]/08" />
            </div>

            {/* ── Corner accents (top-left & top-right) ── */}
            <div
                className="absolute top-1 left-1 w-4 h-4 pointer-events-none z-[3]"
                style={{
                    borderTop: '1px solid rgba(212,175,55,0.25)',
                    borderLeft: '1px solid rgba(212,175,55,0.25)',
                    borderRadius: '4px 0 0 0',
                }}
            />
            <div
                className="absolute top-1 right-1 w-4 h-4 pointer-events-none z-[3]"
                style={{
                    borderTop: '1px solid rgba(212,175,55,0.25)',
                    borderRight: '1px solid rgba(212,175,55,0.25)',
                    borderRadius: '0 4px 0 0',
                }}
            />
            <div
                className="absolute bottom-1 left-1 w-4 h-4 pointer-events-none z-[3]"
                style={{
                    borderBottom: '1px solid rgba(212,175,55,0.25)',
                    borderLeft: '1px solid rgba(212,175,55,0.25)',
                    borderRadius: '0 0 0 4px',
                }}
            />
            <div
                className="absolute bottom-1 right-1 w-4 h-4 pointer-events-none z-[3]"
                style={{
                    borderBottom: '1px solid rgba(212,175,55,0.25)',
                    borderRight: '1px solid rgba(212,175,55,0.25)',
                    borderRadius: '0 0 4px 0',
                }}
            />
        </div>
    );
};

export default ChartReadingCard;
