/**
 * HistoryDrawer — Bottom drawer showing drawn card positions
 *
 * Shows all card positions with their names and reversal status.
 * Slides up from bottom with backdrop overlay.
 */
import React from 'react';
import type { SpreadDef } from '../tarotData';
import type { DrawnCardState } from './TarotSpreadBoard';
import { DECOR } from './GothicDecorations';

interface HistoryDrawerProps {
    show: boolean;
    onClose: () => void;
    spread: SpreadDef;
    drawnCards: DrawnCardState[];
}

const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ show, onClose, spread, drawnCards }) => {
    return (
        <>
            {/* Backdrop */}
            {show && (
                <div
                    className="absolute inset-0 bg-black/60 z-40 animate-fade-in"
                    onClick={onClose}
                />
            )}
            {/* Drawer panel */}
            <div
                className={`
                    absolute bottom-0 left-0 right-0 z-50
                    bg-gradient-to-t from-[#0a0506] via-[#0d0708] to-[#0d0708]/95
                    backdrop-blur-xl border-t border-[#d4af37]/25
                    rounded-t-2xl
                    transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                    ${show ? 'translate-y-0' : 'translate-y-full'}
                `}
                style={{ maxHeight: '55vh' }}
            >
                {/* Handle bar */}
                <div className="flex justify-center pt-3 pb-2">
                    <img src={DECOR.chainDivider} className="w-12 h-auto object-contain opacity-30" style={{ filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.2))' }} alt="" />
                </div>

                {/* Title */}
                <div className="flex items-center justify-between px-5 pb-3">
                    <div className="flex items-center gap-2">
                        <img src={DECOR.occultSymbol} className="w-5 h-5 object-contain opacity-40" style={{ filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.3))' }} alt="" />
                        <div className="flex flex-col">
                            <span className="text-[#e5d08f]/90 text-sm tracking-[0.08em]" style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 6px rgba(212,175,55,0.2)' }}>{spread.nameEn}</span>
                            <span className="text-[#d4af37]/50 text-[8px] tracking-widest">{spread.name}</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-white/10 active:scale-90 transition-all text-[#8c6b3e]/60"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Card list */}
                <div className="overflow-y-auto px-4 pb-6" style={{ maxHeight: 'calc(55vh - 80px)' }}>
                    <div className="flex flex-col gap-2">
                        {drawnCards.map((dc, i) => (
                            <div
                                key={dc.card.id}
                                className={`
                                    flex items-center gap-3 px-3.5 py-2.5 rounded-lg border transition-all duration-300
                                    ${dc.isFlipped
                                        ? 'bg-white/[0.04] border-[#d4af37]/15'
                                        : 'bg-white/[0.02] border-white/[0.04] opacity-40'
                                    }
                                `}
                                style={{
                                    animation: show ? `tarot-float-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both` : undefined,
                                    animationDelay: show ? `${i * 60}ms` : undefined,
                                }}
                            >
                                {/* Position number */}
                                <div className={`
                                    w-6 h-6 rounded-full flex items-center justify-center shrink-0
                                    text-[10px] font-bold
                                    ${dc.isFlipped
                                        ? (dc.isReversed ? 'bg-red-900/30 text-red-300/70 border border-red-500/20' : 'bg-[#d4af37]/15 text-[#e5d08f]/80 border border-[#d4af37]/20')
                                        : 'bg-white/5 text-[#8c6b3e]/30 border border-white/5'
                                    }
                                `}>
                                    {i + 1}
                                </div>

                                {/* Position label */}
                                <span className="text-[9px] text-[#8c6b3e]/50 tracking-wider min-w-[48px]">
                                    {spread.positions[i].label}
                                </span>

                                {/* Card name (only if flipped) */}
                                {dc.isFlipped ? (
                                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                                        <span className={`text-[11px] tracking-wider font-bold ${dc.isReversed ? 'text-red-300/70' : 'text-[#e5d08f]/80'}`}>
                                            {dc.card.nameZh}
                                        </span>
                                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full border ${dc.isReversed
                                            ? 'bg-red-900/20 text-red-400/60 border-red-500/20'
                                            : 'bg-[#d4af37]/10 text-[#d4af37]/60 border-[#d4af37]/20'
                                            }`}>
                                            {dc.isReversed ? 'Rev' : 'Upr'}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-[9px] text-[#8c6b3e]/20 flex-1 text-right" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>Hidden</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
};

export default React.memo(HistoryDrawer);
