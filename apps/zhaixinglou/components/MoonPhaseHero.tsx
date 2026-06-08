/**
 * MoonPhaseHero — Immersive moon phase display for StarCalendar
 *
 * Shows the current moon phase with decorative frame, glow auras,
 * phase name, moon sign, and illumination bar.
 */
import React from 'react';
import type { CelestialEvents } from '../astroCalc';
import { DECOR } from './GothicDecorations';

interface MoonPhaseHeroProps {
    dateStr: string;
    moonPhase: CelestialEvents['moonPhase'];
}

// ─── Style tokens ───
const themeFontTitle = { fontFamily: 'ZhaixinglouTitle, serif', textShadow: '0 0 10px rgba(212,175,55,0.5)' } as const;
const themeFontSub = { fontFamily: 'ZhaixinglouFont, serif' } as const;
const themeFontCN = { fontFamily: 'ZhaixinglouCN, serif' } as const;

const MoonPhaseHero: React.FC<MoonPhaseHeroProps> = ({ dateStr, moonPhase }) => {
    return (
        <div
            className="relative flex flex-col items-center pt-4 pb-8 px-6"
            style={{ animation: 'tarot-float-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both' }}
        >
            {/* Date label */}
            <span className="text-[#d4af37]/35 text-[10px] tracking-[0.35em] mb-6" style={themeFontSub}>
                {dateStr}
            </span>

            {/* Moon circle with enhanced glow aura */}
            <div className="relative mb-5">
                {/* Layered glow auras */}
                <div className="absolute inset-[-48px] rounded-full" style={{
                    background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, rgba(212,175,55,0.02) 50%, transparent 75%)',
                }} />
                <div className="absolute inset-[-32px] rounded-full" style={{
                    background: 'radial-gradient(circle, rgba(212,175,55,0.12) 0%, rgba(229,208,143,0.06) 35%, rgba(212,175,55,0.02) 60%, transparent 80%)',
                    animation: 'gothic-glow-pulse 4s ease-in-out infinite',
                }} />
                <div className="absolute inset-[-20px] rounded-full" style={{
                    background: 'radial-gradient(circle, rgba(229,208,143,0.10) 0%, rgba(212,175,55,0.04) 50%, transparent 75%)',
                }} />
                {/* Decorative outer frame */}
                <div className="w-40 h-40 relative flex items-center justify-center">
                    <img
                        src="https://i.postimg.cc/qvgzGKBR/qi-qi-su-cai-pu-(8).png"
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain"
                        style={{ filter: 'drop-shadow(0 0 12px rgba(212,175,55,0.3))' }}
                    />
                    {/* Moon image centered inside frame */}
                    <img
                        src={DECOR.moon}
                        alt="Moon"
                        className="w-[90px] h-[90px] object-contain relative z-10"
                        style={{ filter: 'drop-shadow(0 0 16px rgba(212,175,55,0.4)) brightness(1.1)' }}
                    />
                </div>
            </div>

            {/* Phase name */}
            <span
                className="text-[#e5d08f] text-lg tracking-[0.14em] mb-1.5"
                style={{ ...themeFontTitle, textShadow: '0 0 18px rgba(212,175,55,0.25)' }}
            >
                {moonPhase.phaseName}
            </span>

            {/* Moon sign */}
            <span className="text-[#d4af37]/70 text-xs tracking-[0.25em]" style={themeFontCN}>
                月亮在{moonPhase.moonSign}
            </span>

            {/* Illumination bar */}
            <div className="mt-5 w-28 h-[1.5px] rounded-full bg-white/[0.08] overflow-hidden">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-[#d4af37]/40 via-[#e5d08f]/50 to-[#d4af37]/40"
                    style={{ width: `${Math.round(moonPhase.illumination * 100)}%`, transition: 'width 1s ease' }}
                />
            </div>
        </div>
    );
};

export default React.memo(MoonPhaseHero);
