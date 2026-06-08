/**
 * TarotSpreadBoard — Shared card layout engine for StarMirror & StarCalendar
 *
 * Handles:
 *   - 1-card centered, 3-card fan, and 4+ positioned layouts
 *   - Oracle guidance panel (sequential flip with breathing pause)
 *   - Post-flip action bar (Redraw + Read Cards)
 *   - GothicHeader + corner decorations
 *
 * This component is a pure UI layer — all state is managed by the parent.
 */
import React from 'react';
import type { SpreadDef,TarotCardDef } from '../tarotData';
import TarotCard from './TarotCard';
import { GothicHeader,GothicCornerDecor,DECOR } from './GothicDecorations';

// ─── Shared drawn-card type (used by StarMirror, StarCalendar, HistoryDrawer) ───
export interface DrawnCardState {
    card: TarotCardDef;
    borderUrl: string;
    isReversed: boolean;
    isFlipped: boolean;
}

// ─── Props ───
interface TarotSpreadBoardProps {
    spread: SpreadDef;
    drawnCards: DrawnCardState[];
    cardBackUrl: string;
    nextFlipIndex: number;
    allFlipped: boolean;
    activeOracleIndex: number;
    onFlip: (index: number) => void;
    onReset: () => void;
    onReadCards: () => void;
    // Header
    headerTitle?: string;
    onBack: () => void;
    headerDecorIcon?: string;
}

// ─── Style tokens ───
const themeFontSub = { fontFamily: 'ZhaixinglouFont, serif' } as const;

const TarotSpreadBoard: React.FC<TarotSpreadBoardProps> = ({
    spread,
    drawnCards,
    cardBackUrl,
    nextFlipIndex,
    allFlipped,
    activeOracleIndex,
    onFlip,
    onReset,
    onReadCards,
    headerTitle,
    onBack,
    headerDecorIcon,
}) => {
    const isPositionedLayout = spread.cardCount > 3;

    return (
        <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* 角标装饰 */}
            <GothicCornerDecor corners={['tl', 'tr']} iconUrl={DECOR.occultSymbol} size={20} opacity={0.12} />
            {/* Header */}
            <GothicHeader
                title={headerTitle || spread.nameEn}
                onBack={onBack}
                decorIcon={headerDecorIcon || DECOR.justice}
            />

            {/* Card area — flex-1 centered */}
            <div className="flex-1 flex flex-col items-center w-full overflow-hidden relative">

                {/* Spread title */}
                <div className="flex flex-col items-center gap-0.5 pt-1 pb-2 shrink-0">
                    <span className="text-[#e5d08f]/80 text-sm tracking-[0.08em]" style={{ ...themeFontSub, textShadow: '0 0 6px rgba(212,175,55,0.2)' }}>{spread.nameEn}</span>
                    <span className="text-[#d4af37]/40 text-[9px] tracking-widest">{spread.name}</span>
                </div>

                {/* ── Card layouts ── */}
                <div className="flex-1 w-full flex items-center justify-center overflow-hidden relative">

                    {/* Single card: centered */}
                    {spread.cardCount === 1 && drawnCards.length === 1 && (
                        <div
                            className="flex flex-col items-center gap-2"
                            style={{ animation: 'tarot-float-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both' }}
                        >
                            <TarotCard
                                card={drawnCards[0].card}
                                borderUrl={drawnCards[0].borderUrl}
                                isReversed={drawnCards[0].isReversed}
                                isFlipped={drawnCards[0].isFlipped}
                                onFlip={() => onFlip(0)}
                                cardBackUrl={cardBackUrl}
                                isNextToFlip={nextFlipIndex === 0}
                            />
                        </div>
                    )}

                    {/* 3-card: centered overlapping fan layout */}
                    {spread.cardCount === 3 && drawnCards.length === 3 && (
                        <div className="absolute inset-0">
                            {(() => {
                                const fanConfig = [
                                    { xOffset: -80, rotate: -8, z: 10 },
                                    { xOffset: 0, rotate: 0, z: 12 },
                                    { xOffset: 80, rotate: 8, z: 11 },
                                ];
                                return drawnCards.map((dc, i) => {
                                    const cfg = fanConfig[i];
                                    return (
                                        <div
                                            key={dc.card.id}
                                            className="absolute"
                                            style={{
                                                left: '50%',
                                                top: '50%',
                                                transform: `translate(calc(-50% + ${cfg.xOffset}px), -55%) rotate(${cfg.rotate}deg)`,
                                                zIndex: dc.isFlipped ? cfg.z + 10 : (nextFlipIndex === i ? cfg.z + 5 : cfg.z),
                                            }}
                                        >
                                            <div style={{
                                                animation: `tarot-float-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both`,
                                                animationDelay: `${i * 200}ms`,
                                            }}>
                                                <TarotCard
                                                    card={dc.card}
                                                    borderUrl={dc.borderUrl}
                                                    isReversed={dc.isReversed}
                                                    isFlipped={dc.isFlipped}
                                                    onFlip={() => onFlip(i)}
                                                    size="small"
                                                    cardBackUrl={cardBackUrl}
                                                    isNextToFlip={nextFlipIndex === i}
                                                />
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    )}

                    {/* Positioned layouts: 4+ cards */}
                    {isPositionedLayout && drawnCards.length === spread.cardCount && (
                        <div className="absolute inset-0">
                            <div
                                className="absolute max-w-[330px] mx-auto"
                                style={{ left: 0, right: 0, top: '2%', bottom: '6%' }}
                            >
                                {drawnCards.map((dc, i) => {
                                    const pos = spread.positions[i];
                                    return (
                                        <div
                                            key={dc.card.id}
                                            className="absolute"
                                            style={{
                                                left: `${pos.x}%`,
                                                top: `${pos.y}%`,
                                                transform: 'translate(-50%, -50%)',
                                                zIndex: dc.isFlipped ? 20 : (nextFlipIndex === i ? 15 : 10),
                                            }}
                                        >
                                            <div style={{
                                                animation: `tarot-float-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both`,
                                                animationDelay: `${i * 150}ms`,
                                            }}>
                                                <TarotCard
                                                    card={dc.card}
                                                    borderUrl={dc.borderUrl}
                                                    isReversed={dc.isReversed}
                                                    isFlipped={dc.isFlipped}
                                                    onFlip={() => onFlip(i)}
                                                    size="xs"
                                                    cardBackUrl={cardBackUrl}
                                                    isNextToFlip={nextFlipIndex === i}
                                                    lightweight={spread.cardCount >= 8}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Oracle overlay / Action buttons ── */}
                <div className="flex flex-col items-center gap-2 py-3 shrink-0 px-4">
                    {!allFlipped ? (
                        activeOracleIndex >= 0 && activeOracleIndex === nextFlipIndex && nextFlipIndex >= 0 && (
                            <div
                                key={activeOracleIndex}
                                className="absolute inset-0 z-40 flex items-center justify-center cursor-pointer"
                                style={{ animation: 'oracle-fade-in 1s cubic-bezier(0.22, 1, 0.36, 1) both' }}
                                onClick={() => nextFlipIndex >= 0 && onFlip(nextFlipIndex)}
                            >
                                <div className="mx-6 max-w-[300px] bg-black/70 backdrop-blur-xl rounded-2xl border border-[#d4af37]/25 px-6 py-5 flex flex-col items-center gap-3 shadow-[0_0_40px_rgba(0,0,0,0.6)] relative overflow-hidden">
                                    {/* 神秘学装饰圆环 */}
                                    <img src={DECOR.occultSymbol} className="w-8 h-8 object-contain opacity-30" style={{ filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.3))' }} alt="" />
                                    {/* Position number */}
                                    <span className="text-[#d4af37]/30 text-[10px] tracking-[0.5em] uppercase">
                                        {['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][nextFlipIndex] ?? (nextFlipIndex + 1)}
                                    </span>
                                    {/* Position name */}
                                    <span
                                        className="text-[#e5d08f] text-base tracking-[0.12em]"
                                        style={{ fontFamily: 'ZhaixinglouTitle, serif', textShadow: '0 0 12px rgba(212,175,55,0.4)' }}
                                    >
                                        {spread.positions[nextFlipIndex]?.labelEn}
                                    </span>
                                    {/* 装饰分割线 */}
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#d4af37]/30" />
                                        <img src={DECOR.chainDivider} className="w-6 h-auto object-contain opacity-40" style={{ filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.3))' }} alt="" />
                                        <div className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[#d4af37]/30" />
                                    </div>
                                    {/* Oracle text */}
                                    <p className="text-[#e5d08f]/70 text-[11px] text-center leading-[1.8] tracking-wide">
                                        {spread.positions[nextFlipIndex]?.oracle}
                                    </p>
                                    {/* Tap hint */}
                                    <span className="text-[#d4af37]/50 text-[9px] tracking-[0.3em] animate-pulse mt-1">
                                        ✦ TAP TO REVEAL ✦
                                    </span>
                                    {/* 背景扫光 */}
                                    <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                                        <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.03) 48%, rgba(212,175,55,0.06) 50%, transparent 55%)', animation: 'tarot-sweep 6s ease-in-out infinite' }} />
                                    </div>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="flex items-center gap-3 animate-fade-in">
                            <button
                                onClick={onReset}
                                className="group relative px-5 py-2.5 rounded-xl border border-white/10 bg-black/30 backdrop-blur-md text-[#8c6b3e]/70 text-[11px] tracking-widest active:scale-95 transition-all hover:border-[#d4af37]/30 overflow-hidden"
                            >
                                <span style={themeFontSub}>Redraw</span><br /><span className="text-[8px] text-[#d4af37]/40">重新抽取</span>
                                <div className="absolute left-0 top-[15%] bottom-[15%] w-[1.5px] rounded-full bg-gradient-to-b from-transparent via-[#8c6b3e]/20 to-transparent" />
                            </button>
                            <button
                                onClick={onReadCards}
                                className="group relative px-5 py-2.5 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/15 backdrop-blur-md text-[#e5d08f] text-[11px] tracking-widest active:scale-95 transition-all hover:border-[#d4af37]/60 hover:shadow-[0_0_25px_rgba(212,175,55,0.2)] overflow-hidden"
                            >
                                <div className="flex items-center gap-2 justify-center">
                                    <img src={DECOR.priestess} className="w-4 h-4 object-contain opacity-60" style={{ filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.3))' }} alt="" />
                                    <span style={themeFontSub}>Read Cards</span>
                                </div>
                                <span className="text-[8px] text-[#d4af37]/50">聆听神谕</span>
                                <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                                    <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.05) 48%, rgba(212,175,55,0.1) 50%, transparent 55%)', animation: 'tarot-sweep 4s ease-in-out infinite' }} />
                                </div>
                                <div className="absolute left-0 top-[15%] bottom-[15%] w-[1.5px] rounded-full bg-gradient-to-b from-transparent via-[#d4af37]/40 to-transparent" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(TarotSpreadBoard);
