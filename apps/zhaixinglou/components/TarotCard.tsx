/**
 * TarotCard — A single tarot card rendered with transparent border + font
 *
 * v2: Image-based card back, full-card rotation for reversal (border + text),
 *     enhanced lighting effects, richer floating particles.
 *
 * Structure (back-to-front):
 * 1. Card back: Full-bleed image with overlay effects
 * 2. Card front: Glass + glow + particles + text + border + sweep
 *
 * When reversed, the ENTIRE front face (including border) is rotated 180°.
 */
import React,{ useMemo } from 'react';
import type { TarotCardDef } from '../tarotData';
import { CARD_BACK_USER } from '../tarotData';

interface TarotCardProps {
    card: TarotCardDef;
    borderUrl: string;
    isReversed: boolean;
    isFlipped: boolean;        // true = show front (revealed), false = show back
    onFlip?: () => void;
    size?: 'normal' | 'small' | 'xs'; // xs for 5+ card positioned spreads
    cardBackUrl?: string;      // custom card back image (defaults to CARD_BACK_USER)
    isNextToFlip?: boolean;    // golden breathing border hint for sequential flipping
    lightweight?: boolean;     // disable heavy effects (particles, breathing) for 8+ card spreads
}

// Roman numeral for major arcana
function toRoman(n: number): string {
    if (n === 0) return '0';
    const vals = [10, 9, 5, 4, 1];
    const syms = ['X', 'IX', 'V', 'IV', 'I'];
    let result = '';
    let remaining = n;
    for (let i = 0; i < vals.length; i++) {
        while (remaining >= vals[i]) {
            result += syms[i];
            remaining -= vals[i];
        }
    }
    return result;
}

// Stable mote positions (avoid re-randomizing on re-render)
const MOTE_CONFIGS = Array.from({ length: 8 }, (_, i) => ({
    w: 2 + (((i * 7 + 3) % 5) * 0.8),
    left: 12 + ((i * 13 + 7) % 70),
    top: 15 + ((i * 17 + 11) % 60),
    opBase: 0.3 + ((i * 3 + 2) % 4) * 0.1,
    dur: 3 + ((i * 5 + 1) % 4),
    delay: (i * 0.6) % 3,
}));

const TarotCard: React.FC<TarotCardProps> = ({
    card, borderUrl, isReversed, isFlipped, onFlip,
    size = 'normal', cardBackUrl, isNextToFlip = false, lightweight = false,
}) => {
    const isXs = size === 'xs';
    const isSmall = size === 'small' || isXs;
    const cardW = isXs ? 'w-[120px]' : isSmall ? 'w-[170px]' : 'w-[240px]';
    const aspect = 'aspect-[2/3.3]';
    const backImage = cardBackUrl || CARD_BACK_USER;

    // Glow color based on position
    const glowColor = isReversed
        ? 'rgba(139, 0, 0, 0.4)'
        : 'rgba(212, 175, 55, 0.35)';
    const glowShadow = isReversed
        ? '0 0 50px rgba(139,0,0,0.35), inset 0 0 40px rgba(139,0,0,0.15)'
        : '0 0 50px rgba(212,175,55,0.3), inset 0 0 35px rgba(212,175,55,0.12)';
    const sweepColor = isReversed
        ? 'rgba(180,40,40,0.12)'
        : 'rgba(255,255,255,0.1)';
    const sweepHighlight = isReversed
        ? 'rgba(180,40,40,0.18)'
        : 'rgba(255,255,255,0.15)';

    // Determine text sizing dynamically
    const textSizeClass = useMemo(() => {
        const len = card.nameEn.length;
        if (isXs) {
            return len > 16 ? 'text-[11px]' : len > 10 ? 'text-[13px]' : 'text-[15px]';
        }
        if (isSmall) {
            return len > 16 ? 'text-[14px]' : len > 10 ? 'text-[17px]' : 'text-[20px]';
        }
        return len > 16 ? 'text-[20px]' : len > 10 ? 'text-[26px]' : 'text-[32px]';
    }, [card.nameEn, isSmall]);

    // Golden breathing hint for next-to-flip cards
    const showFlipHint = isNextToFlip && !isFlipped;

    return (
        <div
            className={`${cardW} ${aspect} relative cursor-pointer select-none`}
            style={{ perspective: '1200px' }}
            onClick={onFlip}
        >
            {/* Golden breathing border hint */}
            {showFlipHint && (
                <div
                    className="absolute -inset-[3px] rounded-xl pointer-events-none z-30"
                    style={{
                        background: 'transparent',
                        boxShadow: '0 0 12px 2px rgba(212,175,55,0.5), 0 0 30px 4px rgba(212,175,55,0.2), inset 0 0 12px 2px rgba(212,175,55,0.15)',
                        animation: 'tarot-flip-hint 2s ease-in-out infinite',
                    }}
                />
            )}
            {/* 3D flip container */}
            <div
                className="absolute inset-0 transition-transform duration-[900ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
                style={{
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
            >
                {/* ═══════════════ BACK FACE ═══════════════ */}
                <div
                    className="absolute inset-0 rounded-xl overflow-hidden"
                    style={{ backfaceVisibility: 'hidden' }}
                >
                    {/* Full-bleed card back image */}
                    <img
                        src={backImage}
                        className="absolute inset-0 w-full h-full object-cover"
                        draggable={false}
                    />
                    {/* Golden vignette overlay */}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background: 'radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(0,0,0,0.5) 100%)',
                        }}
                    />
                    {/* Breathing golden highlight (skipped in lightweight mode) */}
                    {!lightweight && (
                        <div
                            className="absolute inset-0 pointer-events-none mix-blend-screen"
                            style={{
                                background: 'radial-gradient(ellipse at 50% 40%, rgba(212,175,55,0.08), transparent 60%)',
                                animation: 'tarot-breathe 4s ease-in-out infinite alternate',
                            }}
                        />
                    )}
                    {/* Sweep light on card back */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
                        <div
                            className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]"
                            style={{
                                background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.06) 47%, rgba(255,255,255,0.12) 50%, transparent 55%)',
                                animation: 'tarot-sweep 5s ease-in-out infinite',
                            }}
                        />
                    </div>
                    {/* Outer glow */}
                    <div
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        style={{ boxShadow: '0 0 40px rgba(212,175,55,0.2), inset 0 0 25px rgba(0,0,0,0.3)' }}
                    />
                </div>

                {/* ═══════════════ FRONT FACE ═══════════════ */}
                {/* When reversed, the ENTIRE front face rotates 180° — border + text + everything */}
                <div
                    className="absolute inset-0 rounded-xl overflow-hidden"
                    style={{
                        backfaceVisibility: 'hidden',
                        transform: `rotateY(180deg)${isReversed ? ' rotate(180deg)' : ''}`,
                    }}
                >
                    {/* Layer 1: Deep glass background */}
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-xl" />

                    {/* Layer 2: Inner ambient glow — static in lightweight, animated otherwise */}
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `
                                radial-gradient(ellipse 80% 60% at 50% 35%, ${glowColor}, transparent 65%),
                                radial-gradient(ellipse 50% 40% at 30% 70%, ${isReversed ? 'rgba(100,0,0,0.15)' : 'rgba(180,150,50,0.1)'}, transparent 60%)
                            `,
                            ...(lightweight ? {} : { animation: 'tarot-breathe 5s ease-in-out infinite alternate' }),
                        }}
                    />

                    {/* Layer 3: Subtle noise texture */}
                    <div className="absolute inset-0 opacity-[0.04]" style={{ filter: 'url(#zhaixinglou-noise)' }} />

                    {/* Layer 4: Floating motes/dust — skipped in lightweight mode */}
                    {!lightweight && (
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            {MOTE_CONFIGS.map((m, i) => (
                                <div
                                    key={i}
                                    className="absolute rounded-full"
                                    style={{
                                        width: `${m.w}px`,
                                        height: `${m.w}px`,
                                        left: `${m.left}%`,
                                        top: `${m.top}%`,
                                        background: isReversed
                                            ? `rgba(180, 40, 40, ${m.opBase})`
                                            : `rgba(212, 175, 55, ${m.opBase})`,
                                        boxShadow: isReversed
                                            ? `0 0 6px rgba(180,40,40,${m.opBase * 0.5})`
                                            : `0 0 6px rgba(212,175,55,${m.opBase * 0.5})`,
                                        animation: `tarot-mote ${m.dur}s ease-in-out infinite alternate`,
                                        animationDelay: `${m.delay}s`,
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Layer 5: Card text content (NOT rotated — rotation is on the parent) */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-4">
                        {/* Roman numeral (Major only) */}
                        {card.type === 'major' && (
                            <span
                                className={`${isSmall ? 'text-[10px]' : 'text-xs'} tracking-[0.5em] mb-3 ${isReversed ? 'text-red-400/60' : 'text-[#d4af37]/60'}`}
                                style={{ fontFamily: 'TarotFont, serif' }}
                            >
                                {toRoman(card.number)}
                            </span>
                        )}

                        {/* Suit indicator (Minor only) */}
                        {card.type !== 'major' && (
                            <span
                                className={`${isSmall ? 'text-[9px]' : 'text-[10px]'} tracking-[0.3em] mb-2 uppercase ${isReversed ? 'text-red-400/50' : 'text-[#8c6b3e]/70'}`}
                            >
                                {card.type === 'wands' ? '♦' : card.type === 'cups' ? '♥' : card.type === 'swords' ? '♠' : '★'}
                            </span>
                        )}

                        {/* Divider top */}
                        <div
                            className={`${isSmall ? 'w-8' : 'w-12'} h-[1px] mb-3 bg-gradient-to-r from-transparent ${isReversed ? 'via-red-500/40' : 'via-[#d4af37]/50'} to-transparent`}
                        />

                        {/* English name — the star of the show */}
                        <h2
                            className={`${textSizeClass} text-center leading-tight tracking-wide ${isReversed ? 'text-red-200/90' : 'text-[#e8d5a3]'}`}
                            style={{
                                fontFamily: 'TarotFont, serif',
                                textShadow: isReversed
                                    ? '0 0 25px rgba(180,40,40,0.6), 0 0 50px rgba(139,0,0,0.3), 0 2px 6px rgba(0,0,0,0.9)'
                                    : '0 0 25px rgba(212,175,55,0.5), 0 0 50px rgba(180,150,50,0.2), 0 2px 6px rgba(0,0,0,0.9)',
                                lineHeight: 1.3,
                            }}
                        >
                            {card.nameEn}
                        </h2>

                        {/* Divider bottom */}
                        <div
                            className={`${isSmall ? 'w-8' : 'w-12'} h-[1px] mt-3 bg-gradient-to-r from-transparent ${isReversed ? 'via-red-500/40' : 'via-[#d4af37]/50'} to-transparent`}
                        />


                    </div>

                    {/* Layer 6: Border frame overlay */}
                    <img
                        src={borderUrl}
                        className="absolute inset-0 w-full h-full object-fill pointer-events-none z-20"
                        draggable={false}
                    />

                    {/* Layer 7: Light sweep effect */}
                    <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden rounded-xl">
                        <div
                            className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]"
                            style={{
                                background: `linear-gradient(115deg, transparent 40%, ${sweepColor} 46%, ${sweepHighlight} 50%, transparent 55%)`,
                                animation: 'tarot-sweep 6s ease-in-out infinite',
                            }}
                        />
                    </div>

                    {/* Layer 8: Edge glow ring */}
                    <div
                        className="absolute inset-0 rounded-xl pointer-events-none z-10"
                        style={{ boxShadow: glowShadow }}
                    />

                    {/* Layer 9: Corner shimmer accents */}
                    <div className="absolute top-0 left-0 w-16 h-16 pointer-events-none z-25 opacity-30"
                        style={{
                            background: `radial-gradient(ellipse at 0% 0%, ${isReversed ? 'rgba(180,40,40,0.4)' : 'rgba(212,175,55,0.3)'}, transparent 70%)`,
                        }}
                    />
                    <div className="absolute bottom-0 right-0 w-16 h-16 pointer-events-none z-25 opacity-30"
                        style={{
                            background: `radial-gradient(ellipse at 100% 100%, ${isReversed ? 'rgba(180,40,40,0.4)' : 'rgba(212,175,55,0.3)'}, transparent 70%)`,
                        }}
                    />
                </div>
            </div>

            {/* Ground shadow beneath card */}
            <div
                className={`absolute -bottom-3 left-[15%] right-[15%] h-4 rounded-[50%] blur-[8px] transition-opacity duration-500 ${isFlipped ? 'opacity-60' : 'opacity-30'}`}
                style={{
                    background: isReversed && isFlipped
                        ? 'rgba(139, 0, 0, 0.4)'
                        : 'rgba(0, 0, 0, 0.5)',
                }}
            />
        </div>
    );
};

export default React.memo(TarotCard);
