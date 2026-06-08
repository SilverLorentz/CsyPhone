/**
 * CelestialDashboard — Planetary positions, celestial phenomena, spreads & talisman
 *
 * The scrollable dashboard content below the moon phase hero in StarCalendar.
 * Contains:
 *   - Planetary positions (horizontal scroll cards)
 *   - Celestial phenomena timeline (retrograde, ingress, opposition)
 *   - Character mode notice
 *   - Star spreads list (user only)
 *   - Transit talisman section (user only)
 */
import React from 'react';
import type { CelestialEvents,TransitHit } from '../astroCalc';
import type { SpreadDef } from '../tarotData';
import { SPREADS } from '../tarotData';
import { GothicDivider,DECOR } from './GothicDecorations';

interface CelestialDashboardProps {
    events: CelestialEvents;
    triggeredSpreads: SpreadDef[];
    isCharMode: boolean;
    charName: string;
    hasNatalData: boolean;
    transitHit: TransitHit | null;
    onStartSpread: (spread: SpreadDef) => void;
    onBack: () => void;
}

// ─── Style tokens ───
const themeFontTitle = { fontFamily: 'ZhaixinglouTitle, serif', textShadow: '0 0 10px rgba(212,175,55,0.5)' } as const;
const themeFontSub = { fontFamily: 'ZhaixinglouFont, serif' } as const;
const themeFontCN = { fontFamily: 'ZhaixinglouCN, serif' } as const;
const dimGold = 'text-[#d4af37]/70';
const goldText = 'text-[#d4af37]';

const CelestialDashboard: React.FC<CelestialDashboardProps> = ({
    events,
    triggeredSpreads,
    isCharMode,
    charName,
    hasNatalData,
    transitHit,
    onStartSpread,
    onBack,
}) => {
    return (
        <>
            {/* ═══════════ Planetary Positions — Horizontal Scroll ═══════════ */}
            <div
                className="pt-2 pb-6"
                style={{ animation: 'tarot-float-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both', animationDelay: '150ms' }}
            >
                {/* Section header */}
                <div className="flex items-center gap-2 px-6 mb-4">
                    <img src={DECOR.occultSymbol} className="w-4 h-4 object-contain opacity-30" style={{ filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.3))' }} alt="" />
                    <span className={`${dimGold} text-[10px] tracking-[0.3em]`} style={themeFontSub}>
                        Planetary Positions
                    </span>
                </div>

                {/* Horizontal scrolling cards */}
                <div
                    className="flex gap-2.5 overflow-x-auto no-scrollbar px-6 pb-1"
                    style={{ scrollSnapType: 'x mandatory' }}
                >
                    {events.transitChart.planets.filter(p => p.name !== '上升点').map((p, idx) => {
                        const isRetro = events.retrograding.some(r => r.planet === p.name);
                        const ingress = events.ingresses.find(ig => ig.planet === p.name);
                        return (
                            <div
                                key={p.name}
                                className="shrink-0 w-[86px] bg-black/30 backdrop-blur-sm rounded-xl border border-[#d4af37]/12 hover:border-[#d4af37]/30 transition-all duration-500 py-3.5 px-2 flex flex-col items-center gap-1.5 relative overflow-hidden"
                                style={{
                                    scrollSnapAlign: 'start',
                                    animation: `tarot-float-in 0.5s cubic-bezier(0.22,1,0.36,1) both`,
                                    animationDelay: `${200 + idx * 60}ms`,
                                }}
                            >
                                {/* Status indicator dots */}
                                {(isRetro || ingress) && (
                                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                                        {isRetro && <div className="w-1.5 h-1.5 rounded-full bg-red-400/70 shadow-[0_0_4px_rgba(248,113,113,0.4)]" />}
                                        {ingress && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 shadow-[0_0_4px_rgba(52,211,153,0.4)]" />}
                                    </div>
                                )}
                                {/* Planet symbol */}
                                <span className="text-[#e5d08f] text-lg leading-none" style={{ textShadow: '0 0 8px rgba(229,208,143,0.3)' }}>{p.symbol}</span>
                                {/* Planet name */}
                                <span className="text-[#e5d08f]/80 text-[10px] tracking-wider" style={themeFontCN}>
                                    {p.name}
                                </span>
                                {/* Sign + degree */}
                                <span className={`${dimGold} text-[8px] tracking-wider`} style={themeFontCN}>
                                    {p.sign} {p.degree.toFixed(1)}°
                                </span>
                                {/* Retrograde label */}
                                {isRetro && (
                                    <span className="text-red-400/60 text-[7px] tracking-[0.2em]">℈</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ═══════════ Celestial Phenomena — Timeline ═══════════ */}
            {(events.retrograding.length > 0 || events.ingresses.length > 0 || events.oppositions.length > 0) && (
                <div
                    className="px-6 pb-6"
                    style={{ animation: 'tarot-float-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both', animationDelay: '300ms' }}
                >
                    {/* Section header */}
                    <div className="flex items-center gap-2 mb-4">
                        <img src={DECOR.occultSymbol} className="w-4 h-4 object-contain opacity-30" style={{ filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.3))' }} alt="" />
                        <span className={`${dimGold} text-[10px] tracking-[0.3em]`} style={themeFontSub}>
                            Celestial Phenomena
                        </span>
                    </div>

                    {/* Timeline layout */}
                    <div className="relative pl-5 space-y-3">
                        {/* Vertical timeline line */}
                        <div className="absolute left-[3px] top-1 bottom-1 w-[1px] bg-gradient-to-b from-[#d4af37]/20 via-[#d4af37]/10 to-transparent" />

                        {/* Retrograde events */}
                        {events.retrograding.map(r => (
                            <div key={`retro-${r.planet}`} className="relative flex items-start gap-3">
                                <div className="absolute left-[-18px] top-[7px] w-[7px] h-[7px] rounded-full border border-red-400/40 bg-red-400/20 shadow-[0_0_6px_rgba(248,113,113,0.15)]" />
                                <div className="flex-1 bg-white/[0.025] rounded-lg border border-white/[0.04] px-3.5 py-2.5">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-red-300/80 text-[10px] font-bold tracking-[0.15em]" style={themeFontCN}>逆行</span>
                                        <span className="text-[#e5d08f]/60 text-[10px]" style={themeFontCN}>{r.symbol} {r.planet}</span>
                                    </div>
                                    <span className={`${dimGold} text-[9px] tracking-wider`} style={themeFontCN}>{r.sign}</span>
                                </div>
                            </div>
                        ))}

                        {/* Ingress events */}
                        {events.ingresses.map(ig => (
                            <div key={`ingress-${ig.planet}`} className="relative flex items-start gap-3">
                                <div className="absolute left-[-18px] top-[7px] w-[7px] h-[7px] rounded-full border border-emerald-400/40 bg-emerald-400/20 shadow-[0_0_6px_rgba(52,211,153,0.15)]" />
                                <div className="flex-1 bg-white/[0.025] rounded-lg border border-white/[0.04] px-3.5 py-2.5">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-emerald-300/80 text-[10px] font-bold tracking-[0.15em]" style={themeFontCN}>换座</span>
                                        <span className="text-[#e5d08f]/60 text-[10px]" style={themeFontCN}>{ig.symbol} {ig.planet}</span>
                                    </div>
                                    <span className={`${dimGold} text-[9px] tracking-wider`} style={themeFontCN}>{ig.fromSign} → {ig.toSign}</span>
                                </div>
                            </div>
                        ))}

                        {/* Opposition events */}
                        {events.oppositions.map((o, idx) => (
                            <div key={`opp-${idx}`} className="relative flex items-start gap-3">
                                <div className="absolute left-[-18px] top-[7px] w-[7px] h-[7px] rounded-full border border-[#d4af37]/40 bg-[#d4af37]/20 shadow-[0_0_6px_rgba(212,175,55,0.15)]" />
                                <div className="flex-1 bg-white/[0.025] rounded-lg border border-white/[0.04] px-3.5 py-2.5">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[#d4af37]/80 text-[10px] font-bold tracking-[0.15em]" style={themeFontCN}>对冲</span>
                                    </div>
                                    <span className={`${dimGold} text-[9px] tracking-wider`} style={themeFontCN}>
                                        {o.symbol1}{o.planet1}({o.sign1}) ⟷ {o.symbol2}{o.planet2}({o.sign2})
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════ Character Mode Notice ═══════════ */}
            {isCharMode && (
                <div
                    className="px-6 pb-6"
                    style={{ animation: 'tarot-float-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both', animationDelay: '300ms' }}
                >
                    <div className="flex flex-col items-center gap-3 py-6">
                        <span className={`${dimGold} text-[10px] tracking-[0.35em] uppercase`} style={themeFontSub}>
                            Character View
                        </span>
                        <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/20 to-transparent" />
                        <p className={`${dimGold} text-xs leading-relaxed text-center`} style={{ fontFamily: 'NoteFont, ZhaixinglouCN, serif' }}>
                            {charName}正在仰望与你相同的星空。<br />
                            牌阵仅在你的星历中开放。
                        </p>
                    </div>
                </div>
            )}

            {/* ── Ornamental divider before spreads ── */}
            {!isCharMode && (
                <GothicDivider iconUrl={DECOR.triangleBorder} iconSize="w-6" className="py-2" />
            )}

            {/* ═══════════ Star Spreads (User only) ═══════════ */}
            {!isCharMode && (
                <div
                    className="px-6 pb-6"
                    style={{ animation: 'tarot-float-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both', animationDelay: '400ms' }}
                >
                    {/* Section header */}
                    <div className="flex items-center gap-2 mb-5">
                        <img src={DECOR.moonPhases} className="w-4 h-4 object-contain opacity-35" style={{ filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.3))' }} alt="" />
                        <span className={`${dimGold} text-[10px] tracking-[0.3em]`} style={themeFontSub}>
                            Star Spreads
                        </span>
                    </div>

                    <div className="space-y-3">
                        {triggeredSpreads.map((spread, idx) => {
                            const isEvent = spread.id !== 'seven-stars';
                            return (
                                <button
                                    key={spread.id}
                                    onClick={() => onStartSpread(spread)}
                                    className={`w-full text-left rounded-2xl border transition-all active:scale-[0.97] overflow-hidden relative group
                                        ${isEvent
                                            ? 'bg-[#d4af37]/[0.06] border-[#d4af37]/20 hover:bg-[#d4af37]/10 hover:border-[#d4af37]/35'
                                            : 'bg-black/25 border-[#d4af37]/8 hover:border-[#d4af37]/20'
                                        }`}
                                    style={{
                                        animation: `gothic-fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both`,
                                        animationDelay: `${450 + idx * 100}ms`,
                                    }}
                                >
                                    <div className="px-5 py-4 flex items-center justify-between">
                                        <div className="flex flex-col gap-1">
                                            <span
                                                className="text-[#e5d08f] text-[14px] tracking-[0.06em]"
                                                style={themeFontTitle}
                                            >
                                                {spread.nameEn}
                                            </span>
                                            <span className={`${dimGold} text-[10px] tracking-[0.15em]`} style={themeFontCN}>
                                                {spread.name}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <span className={`text-[10px] ${dimGold}`} style={{ fontFamily: 'ZhaixinglouTitle, serif' }}>
                                                {['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][spread.cardCount] ?? spread.cardCount}
                                            </span>
                                            {isEvent && (
                                                <span
                                                    className="text-[7px] px-2.5 py-1 rounded-full bg-[#d4af37]/10 text-[#d4af37]/70 tracking-[0.25em] border border-[#d4af37]/15"
                                                    style={{ ...themeFontCN, animation: 'gothic-glow-pulse 3s ease-in-out infinite' }}
                                                >
                                                    限时
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Sweep light on hover */}
                                    <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div
                                            className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]"
                                            style={{
                                                background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.04) 48%, rgba(212,175,55,0.07) 50%, transparent 55%)',
                                                animation: 'tarot-sweep 5s ease-in-out infinite',
                                            }}
                                        />
                                    </div>

                                    {/* Left accent bar */}
                                    <div className={`absolute left-0 top-[12%] bottom-[12%] w-[2px] rounded-full bg-gradient-to-b from-transparent via-[#d4af37]/${isEvent ? '35' : '15'} to-transparent`} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ═══════════ Transit Talisman (User only) ═══════════ */}
            {!isCharMode && (
                <div
                    className="px-6 pb-8"
                    style={{ animation: 'tarot-float-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both', animationDelay: '550ms' }}
                >
                    {/* Section header */}
                    <div className="flex items-center gap-2 mb-5">
                        <img src={DECOR.wheel} className="w-4 h-4 object-contain opacity-30" style={{ filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.3))', animation: 'gothic-spin 20s linear infinite' }} alt="" />
                        <span className={`${dimGold} text-[10px] tracking-[0.3em]`} style={themeFontSub}>
                            Transit Talisman
                        </span>
                    </div>

                    {hasNatalData ? (
                        <div className="space-y-4">
                            {transitHit ? (
                                <>
                                    <div className="bg-white/[0.03] rounded-xl border border-[#d4af37]/10 px-4 py-3">
                                        <div className="text-[#e5d08f] text-sm" style={themeFontCN}>
                                            行运 {transitHit.transitSymbol}{transitHit.transitPlanet}({transitHit.transitSign})
                                            {' '}<span className={goldText}>{transitHit.aspectName}</span>{' '}
                                            本命 {transitHit.natalSymbol}{transitHit.natalPlanet}({transitHit.natalSign})
                                        </div>
                                        <div className={`${dimGold} text-[10px] mt-1`} style={themeFontCN}>
                                            容许度 {transitHit.orb}° · {transitHit.nature === 'harmonious' ? '和谐' : transitHit.nature === 'tense' ? '紧张' : '中性'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const talismanSpread = SPREADS.find(s => s.id === 'ephemeris-single');
                                            if (talismanSpread) onStartSpread(talismanSpread);
                                        }}
                                        className="group relative w-full py-3.5 bg-[#d4af37]/10 border border-[#d4af37]/25 rounded-2xl text-[#d4af37] text-sm active:scale-95 transition-all tracking-[0.2em] hover:bg-[#d4af37]/15 hover:border-[#d4af37]/40 hover:shadow-[0_0_20px_rgba(212,175,55,0.1)] overflow-hidden"
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <img src={DECOR.wheel} className="w-4 h-4 object-contain" style={{ animation: 'gothic-spin 12s linear infinite', filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.4))' }} alt="" />
                                            <span style={themeFontTitle}>Draw Talisman</span>
                                        </div>
                                        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.04) 48%, rgba(212,175,55,0.08) 50%, transparent 55%)', animation: 'tarot-sweep 4s ease-in-out infinite' }} />
                                        </div>
                                        <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] rounded-full bg-gradient-to-b from-transparent via-[#d4af37]/30 to-transparent" />
                                    </button>
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-4 py-2">
                                    <span className={`${dimGold} text-xs`} style={{ fontFamily: 'NoteFont, ZhaixinglouCN, serif' }}>今日行运相位计算中……</span>
                                    <button
                                        onClick={() => {
                                            const talismanSpread = SPREADS.find(s => s.id === 'ephemeris-single');
                                            if (talismanSpread) onStartSpread(talismanSpread);
                                        }}
                                        className="w-full py-3.5 bg-[#d4af37]/10 border border-[#d4af37]/25 rounded-2xl text-[#d4af37] text-sm active:scale-95 transition-all tracking-[0.2em] hover:bg-[#d4af37]/15 hover:border-[#d4af37]/40 hover:shadow-[0_0_20px_rgba(212,175,55,0.1)]"
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <img src={DECOR.wheel} className="w-4 h-4 object-contain" style={{ animation: 'gothic-spin 12s linear infinite', filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.4))' }} alt="" />
                                            <span style={themeFontTitle}>Draw Talisman</span>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-5 py-4">
                            {/* Decorative sigil with glow */}
                            <div className="relative">
                                <div className="absolute inset-[-16px] rounded-full" style={{
                                    background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)',
                                }} />
                                <div className="w-16 h-16 rounded-full border border-[#d4af37]/15 bg-gradient-to-br from-[#d4af37]/[0.04] to-transparent flex items-center justify-center">
                                    <img src={DECOR.wheel} className="w-8 h-8 object-contain opacity-25" style={{ filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.3))', animation: 'gothic-spin 20s linear infinite' }} alt="" />
                                </div>
                            </div>
                            <p className={`${dimGold} text-xs leading-relaxed text-center max-w-[240px]`} style={{ fontFamily: 'NoteFont, ZhaixinglouCN, serif' }}>
                                星辰引力需要知道你的出生时刻<br />
                                才能找到今日与你共振最深的行运
                            </p>
                            <button
                                onClick={onBack}
                                className="px-6 py-3 bg-[#d4af37]/[0.08] border border-[#d4af37]/20 rounded-2xl text-[#d4af37] text-xs tracking-[0.15em] active:scale-95 transition-all hover:bg-[#d4af37]/[0.12] hover:border-[#d4af37]/30"
                            >
                                <span style={{ fontFamily: 'NoteFont, ZhaixinglouCN, serif' }}>前往「星轨」录入出生信息</span>
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom ornament */}
            <GothicDivider iconUrl={DECOR.triangleBorder} iconSize="w-6" className="pt-4 pb-8" />
        </>
    );
};

export default React.memo(CelestialDashboard);
