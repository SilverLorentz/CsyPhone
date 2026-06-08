/**
 * SpreadSelector — Vertical spread selection list for StarMirror
 *
 * Displays available tarot spreads as an interactive list with Gothic styling,
 * a Draw button, and decorative elements.
 */
import React from 'react';
import type { SpreadDef } from '../tarotData';
import { GothicDivider,DECOR } from './GothicDecorations';

interface SpreadSelectorProps {
    spreads: SpreadDef[];
    selectedSpreadId: string;
    onSelectSpread: (id: string) => void;
    onDraw: () => void;
}

const SpreadSelector: React.FC<SpreadSelectorProps> = ({ spreads, selectedSpreadId, onSelectSpread, onDraw }) => {
    return (
        <div className="flex flex-col items-center gap-4 animate-fade-in px-4 w-full max-w-[340px] py-4">

            {/* 装饰：正义天秤图标 + 神秘学引导语 */}
            <div className="flex flex-col items-center gap-3 mb-1">
                <img
                    src={DECOR.justice}
                    className="w-14 h-14 object-contain"
                    style={{ filter: 'drop-shadow(0 0 12px rgba(212,175,55,0.5))', animation: 'gothic-glow-pulse 5s ease-in-out infinite' }}
                    alt=""
                />
                <p className="text-[#e5d08f]/60 text-[11px] text-center leading-relaxed tracking-widest" style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 6px rgba(212,175,55,0.15)' }}>
                    Close your eyes, and whisper your question
                </p>
            </div>

            {/* ── Vertical Spread Selector ── */}
            <div className="w-full flex flex-col gap-2.5">
                {spreads.map((spread, idx) => {
                    const isActive = selectedSpreadId === spread.id;
                    return (
                        <button
                            key={spread.id}
                            onClick={() => onSelectSpread(spread.id)}
                            className={`
                                group relative w-full rounded-xl border backdrop-blur-md
                                px-5 py-3.5 flex items-center justify-between
                                transition-all duration-500 overflow-hidden
                                active:scale-[0.98]
                                ${isActive
                                    ? 'bg-[#d4af37]/10 border-[#d4af37]/40 shadow-[0_0_20px_rgba(212,175,55,0.1)]'
                                    : 'bg-white/[0.03] border-white/[0.06] hover:border-[#d4af37]/20'
                                }
                            `}
                            style={{
                                animation: `gothic-fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both`,
                                animationDelay: `${idx * 80}ms`,
                            }}
                        >
                            {/* Left: Name + subtitle */}
                            <div className="flex flex-col items-start gap-1 z-10">
                                <span className={`
                                    text-[15px] tracking-[0.08em] transition-colors duration-300
                                    ${isActive ? 'text-[#e5d08f]' : 'text-[#d4af37]/60'}
                                `} style={{ fontFamily: 'ZhaixinglouFont, serif' }}>
                                    {spread.nameEn}
                                </span>
                                <span className={`text-[11px] tracking-[0.15em] transition-colors duration-300 ${isActive ? 'text-[#d4af37]/80' : 'text-[#8c6b3e]/50'}`}>{spread.name}</span>
                            </div>

                            {/* Right: Card count badge */}
                            <div className={`
                                flex items-center gap-2 z-10 transition-all duration-300
                                ${isActive ? 'opacity-100' : 'opacity-30'}
                            `}>
                                <span className={`
                                    text-[11px] tracking-wider
                                    ${isActive ? 'text-[#d4af37]/80' : 'text-[#8c6b3e]/40'}
                                `} style={{ fontFamily: 'ZhaixinglouTitle, serif' }}>
                                    {['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][spread.cardCount] ?? spread.cardCount}
                                </span>
                                <span className={`
                                    text-[8px] transition-all duration-500
                                    ${isActive
                                        ? 'text-[#d4af37]/80 drop-shadow-[0_0_4px_rgba(212,175,55,0.5)]'
                                        : 'text-[#8c6b3e]/15'
                                    }
                                `}>◆</span>
                            </div>

                            {/* Sweep light on active */}
                            {isActive && (
                                <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                                    <div
                                        className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]"
                                        style={{
                                            background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.05) 48%, rgba(212,175,55,0.08) 50%, transparent 55%)',
                                            animation: 'tarot-sweep 5s ease-in-out infinite',
                                        }}
                                    />
                                </div>
                            )}

                            {/* Left accent bar */}
                            <div className={`
                                absolute left-0 top-[15%] bottom-[15%] w-[2px] rounded-full transition-all duration-500
                                ${isActive
                                    ? 'bg-gradient-to-b from-transparent via-[#d4af37]/60 to-transparent opacity-100'
                                    : 'opacity-0'
                                }
                            `} />
                        </button>
                    );
                })}
            </div>

            {/* 哥特分割线 */}
            <GothicDivider iconUrl={DECOR.chainDivider} iconSize="w-10" />

            {/* Draw button — 带命运轮盘装饰 */}
            <button
                onClick={onDraw}
                className="group relative w-full max-w-[260px] py-3.5 rounded-2xl border border-[#d4af37]/30 bg-[#d4af37]/10 backdrop-blur-md active:scale-95 transition-all duration-300 hover:bg-[#d4af37]/20 hover:border-[#d4af37]/50 hover:shadow-[0_0_30px_rgba(212,175,55,0.2)]"
            >
                <div className="flex items-center justify-center gap-2.5">
                    <img src={DECOR.wheel} className="w-5 h-5 object-contain" style={{ animation: 'gothic-spin 12s linear infinite', filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.4))' }} alt="" />
                    <span
                        className="text-[#e5d08f] text-base tracking-[0.15em]"
                        style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 10px rgba(212,175,55,0.3)' }}
                    >
                        Touch Destiny
                    </span>
                    <img src={DECOR.wheel} className="w-5 h-5 object-contain" style={{ animation: 'gothic-spin 12s linear infinite reverse', filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.4))' }} alt="" />
                </div>
                <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    <div
                        className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]"
                        style={{
                            background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.08) 48%, rgba(212,175,55,0.15) 50%, transparent 55%)',
                            animation: 'tarot-sweep 4s ease-in-out infinite',
                        }}
                    />
                </div>
            </button>
        </div>
    );
};

export default React.memo(SpreadSelector);
