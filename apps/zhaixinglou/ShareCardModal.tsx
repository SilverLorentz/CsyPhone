/**
 * ShareCardModal — Gothic Share Card with dual themes
 *   - Gold (tarot / chart): dark red + bright gold
 *   - Akashic: deep-abyss dark blue/black + cold silver with Latin letter borders
 */
import React,{ useRef,useState,useEffect } from 'react';
import { exportShareCard,shareOrDownload } from './shareUtils';

export interface ShareContext {
    source: 'tarot' | 'chart' | 'akashic';
    title: string;
    subtitle?: string;
    date: string;
}

interface ShareCardModalProps {
    visible: boolean;
    onClose: () => void;
    content?: string;
    paragraphs?: string[];
    context: ShareContext;
}

const G = '255,235,160';
const S = '232,236,244';   // cold silver for akashic

const SOURCE_LABELS: Record<ShareContext['source'], { icon: string; label: string }> = {
    tarot: { icon: String.fromCodePoint(0x2726), label: 'Star Mirror \u00b7 High Priestess' },
    chart: { icon: String.fromCodePoint(0x25C9), label: 'Star Orbit \u00b7 Wheel of Fortune' },
    akashic: { icon: String.fromCodePoint(0x2727), label: 'Akashic Shadows \u00b7 Uranus' },
};

// ── Latin fragments for Akashic letter-border ──
const BORDER_WORDS = [
    'fatum', 'umbra', 'anima', 'nox', 'ignis', 'caelum', 'tempus',
    'memoria', 'desiderium', 'silentium', 'aeternum', 'veritas',
    'oblivio', 'somnus', 'stella', 'abyssus', 'arcanum', 'vestigium',
    'spiritus', 'tenebrae', 'lux', 'orbis', 'finis', 'initium',
];

// ═══════════════════════════════════
// Akashic-themed Card (Silver / Abyss)
// ═══════════════════════════════════

const AkashicCard: React.FC<{
    cardRef: React.RefObject<HTMLDivElement | null>;
    paragraphList: string[];
    title: string;
    subtitle?: string;
    date: string;
    label: string;
}> = ({ cardRef, paragraphList, title, subtitle, date, label }) => {
    const star4o = String.fromCodePoint(0x2727);
    const diamond = String.fromCodePoint(0x29C1);
    const oDash = '\u2500\u2500';
    const brandMark = `${star4o} Zhaixinglou ${star4o}`;
    const headerOrnament = `\u2295 ${oDash} ${star4o} ${oDash} \u2295`;
    const footerOrnament = `${String.fromCodePoint(0x2726)} ${oDash} ${star4o} ${oDash} ${String.fromCodePoint(0x2726)}`;

    // Build the continuous string for each edge
    const topWords = BORDER_WORDS.slice(0, 6);
    const bottomWords = BORDER_WORDS.slice(6, 12);
    const leftWords = BORDER_WORDS.slice(12, 18);
    const rightWords = BORDER_WORDS.slice(18, 24);

    return (
        <div
            ref={cardRef}
            style={{
                position: 'relative',
                overflow: 'hidden',
                background: `
                    radial-gradient(ellipse at 30% 20%, rgba(15,25,50,0.7) 0%, transparent 50%),
                    radial-gradient(ellipse at 70% 80%, rgba(10,18,40,0.6) 0%, transparent 50%),
                    radial-gradient(ellipse at 50% 50%, rgba(8,14,30,0.5) 0%, transparent 70%),
                    linear-gradient(165deg, #0c1a30 0%, #080f22 30%, #050b18 60%, #020408 100%)
                `,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)',
            }}
        >
            {/* Noise texture overlay */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`, backgroundSize: '128px 128px', opacity: 0.5, pointerEvents: 'none', mixBlendMode: 'overlay' }} />

            {/* Faint star dust */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', backgroundImage: `radial-gradient(1px 1px at 15% 25%, rgba(${S},0.35) 0%, transparent 100%), radial-gradient(1px 1px at 85% 15%, rgba(${S},0.25) 0%, transparent 100%), radial-gradient(1px 1px at 45% 75%, rgba(${S},0.40) 0%, transparent 100%), radial-gradient(1px 1px at 70% 55%, rgba(${S},0.20) 0%, transparent 100%), radial-gradient(1px 1px at 25% 90%, rgba(${S},0.30) 0%, transparent 100%), radial-gradient(1px 1px at 90% 70%, rgba(${S},0.35) 0%, transparent 100%), radial-gradient(1px 1px at 50% 10%, rgba(${S},0.45) 0%, transparent 100%), radial-gradient(1px 1px at 60% 40%, rgba(${S},0.20) 0%, transparent 100%)`, pointerEvents: 'none' }} />

            {/* Vignette */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'radial-gradient(ellipse at center, transparent 35%, rgba(2,4,8,0.45) 100%)', pointerEvents: 'none' }} />

            {/* Old God symbol watermark — very faint */}
            <img src="https://i.postimg.cc/NGRj3Xpb/qi-qi-su-cai-pu-(2).png" alt="" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '70%', maxWidth: '280px', opacity: 0.04, pointerEvents: 'none', userSelect: 'none', filter: 'brightness(2) contrast(0.5)' }} />

            {/* ═══ CONSTELLATION SVG BACKGROUND ═══ */}
            <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', userSelect: 'none' }}
                viewBox="0 0 400 600"
                preserveAspectRatio="xMidYMid slice"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Constellation group 1 — upper-left area (resembles Cassiopeia W-shape) */}
                <g opacity="0.12">
                    <line x1="45" y1="80" x2="78" y2="105" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="78" y1="105" x2="110" y2="85" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="110" y1="85" x2="145" y2="112" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="145" y1="112" x2="175" y2="90" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <circle cx="45" cy="80" r="2" fill={`rgba(${S},0.7)`} />
                    <circle cx="78" cy="105" r="1.5" fill={`rgba(${S},0.6)`} />
                    <circle cx="110" cy="85" r="2.5" fill={`rgba(${S},0.8)`} />
                    <circle cx="145" cy="112" r="1.5" fill={`rgba(${S},0.6)`} />
                    <circle cx="175" cy="90" r="2" fill={`rgba(${S},0.7)`} />
                    {/* Faint glow on brightest star */}
                    <circle cx="110" cy="85" r="6" fill={`rgba(${S},0.08)`} />
                </g>

                {/* Constellation group 2 — center-right area (resembles Orion's belt + body) */}
                <g opacity="0.10">
                    <line x1="280" y1="200" x2="310" y2="230" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="310" y1="230" x2="340" y2="225" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="340" y1="225" x2="355" y2="260" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="310" y1="230" x2="295" y2="275" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="295" y1="275" x2="330" y2="300" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="355" y1="260" x2="370" y2="295" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <circle cx="280" cy="200" r="1.5" fill={`rgba(${S},0.5)`} />
                    <circle cx="310" cy="230" r="2.5" fill={`rgba(${S},0.8)`} />
                    <circle cx="340" cy="225" r="1.5" fill={`rgba(${S},0.6)`} />
                    <circle cx="355" cy="260" r="2" fill={`rgba(${S},0.7)`} />
                    <circle cx="295" cy="275" r="1" fill={`rgba(${S},0.5)`} />
                    <circle cx="330" cy="300" r="1.5" fill={`rgba(${S},0.6)`} />
                    <circle cx="370" cy="295" r="1" fill={`rgba(${S},0.4)`} />
                    <circle cx="310" cy="230" r="7" fill={`rgba(${S},0.06)`} />
                </g>

                {/* Constellation group 3 — lower-left area (triangle + spur) */}
                <g opacity="0.09">
                    <line x1="50" y1="380" x2="95" y2="360" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="95" y1="360" x2="120" y2="410" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="120" y1="410" x2="50" y2="380" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="95" y1="360" x2="140" y2="340" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="140" y1="340" x2="160" y2="355" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <circle cx="50" cy="380" r="2" fill={`rgba(${S},0.6)`} />
                    <circle cx="95" cy="360" r="2" fill={`rgba(${S},0.7)`} />
                    <circle cx="120" cy="410" r="1.5" fill={`rgba(${S},0.5)`} />
                    <circle cx="140" cy="340" r="1" fill={`rgba(${S},0.5)`} />
                    <circle cx="160" cy="355" r="2.5" fill={`rgba(${S},0.8)`} />
                    <circle cx="160" cy="355" r="6" fill={`rgba(${S},0.07)`} />
                </g>

                {/* Constellation group 4 — lower-right (arc / crown shape) */}
                <g opacity="0.08">
                    <line x1="260" y1="440" x2="290" y2="420" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="290" y1="420" x2="320" y2="430" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="320" y1="430" x2="350" y2="415" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="350" y1="415" x2="370" y2="440" stroke={`rgba(${S},0.6)`} strokeWidth="0.5" />
                    <line x1="290" y1="420" x2="305" y2="395" stroke={`rgba(${S},0.5)`} strokeWidth="0.4" />
                    <line x1="350" y1="415" x2="340" y2="390" stroke={`rgba(${S},0.5)`} strokeWidth="0.4" />
                    <circle cx="260" cy="440" r="1.5" fill={`rgba(${S},0.5)`} />
                    <circle cx="290" cy="420" r="2" fill={`rgba(${S},0.7)`} />
                    <circle cx="320" cy="430" r="2.5" fill={`rgba(${S},0.8)`} />
                    <circle cx="350" cy="415" r="1.5" fill={`rgba(${S},0.6)`} />
                    <circle cx="370" cy="440" r="1" fill={`rgba(${S},0.5)`} />
                    <circle cx="305" cy="395" r="1" fill={`rgba(${S},0.4)`} />
                    <circle cx="340" cy="390" r="1" fill={`rgba(${S},0.4)`} />
                    <circle cx="320" cy="430" r="7" fill={`rgba(${S},0.06)`} />
                </g>

                {/* Scattered isolated stars — background star field  */}
                <g opacity="0.15">
                    <circle cx="200" cy="50" r="1" fill={`rgba(${S},0.4)`} />
                    <circle cx="30" cy="150" r="0.8" fill={`rgba(${S},0.3)`} />
                    <circle cx="370" cy="130" r="1" fill={`rgba(${S},0.35)`} />
                    <circle cx="220" cy="170" r="0.7" fill={`rgba(${S},0.3)`} />
                    <circle cx="180" cy="250" r="1" fill={`rgba(${S},0.4)`} />
                    <circle cx="60" cy="280" r="0.8" fill={`rgba(${S},0.35)`} />
                    <circle cx="250" cy="330" r="1" fill={`rgba(${S},0.3)`} />
                    <circle cx="380" cy="370" r="0.7" fill={`rgba(${S},0.25)`} />
                    <circle cx="170" cy="460" r="1" fill={`rgba(${S},0.35)`} />
                    <circle cx="30" cy="500" r="0.8" fill={`rgba(${S},0.3)`} />
                    <circle cx="350" cy="520" r="1" fill={`rgba(${S},0.35)`} />
                    <circle cx="210" cy="550" r="0.7" fill={`rgba(${S},0.3)`} />
                    <circle cx="100" cy="180" r="0.8" fill={`rgba(${S},0.3)`} />
                    <circle cx="330" cy="160" r="0.6" fill={`rgba(${S},0.25)`} />
                    <circle cx="240" cy="480" r="0.9" fill={`rgba(${S},0.3)`} />
                    <circle cx="80" cy="530" r="0.7" fill={`rgba(${S},0.25)`} />
                </g>

                {/* Micro cross-hair marks on a few key stars for "precision" feel */}
                <g opacity="0.06" stroke={`rgba(${S},0.5)`} strokeWidth="0.3">
                    <line x1="107" y1="85" x2="113" y2="85" />
                    <line x1="110" y1="82" x2="110" y2="88" />
                    <line x1="157" y1="355" x2="163" y2="355" />
                    <line x1="160" y1="352" x2="160" y2="358" />
                    <line x1="317" y1="430" x2="323" y2="430" />
                    <line x1="320" y1="427" x2="320" y2="433" />
                </g>
            </svg>

            {/* ═══ LATIN LETTER BORDERS ═══ */}
            {/* Top edge */}
            <div style={{
                position: 'absolute', top: '8px', left: '24px', right: '24px', height: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                pointerEvents: 'none', userSelect: 'none', overflow: 'hidden',
            }}>
                {topWords.map((w, i) => (
                    <span key={`t${i}`} style={{
                        fontFamily: 'ZhaixinglouFont, serif',
                        fontSize: '8px',
                        letterSpacing: '0.18em',
                        color: `rgba(${S},${0.12 + (i % 3) * 0.06})`,
                        textTransform: 'uppercase',
                        textShadow: `0 0 4px rgba(${S},0.15)`,
                        whiteSpace: 'nowrap',
                    }}>{w}</span>
                ))}
            </div>

            {/* Bottom edge */}
            <div style={{
                position: 'absolute', bottom: '8px', left: '24px', right: '24px', height: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                pointerEvents: 'none', userSelect: 'none', overflow: 'hidden',
            }}>
                {bottomWords.map((w, i) => (
                    <span key={`b${i}`} style={{
                        fontFamily: 'ZhaixinglouFont, serif',
                        fontSize: '8px',
                        letterSpacing: '0.18em',
                        color: `rgba(${S},${0.10 + (i % 3) * 0.06})`,
                        textTransform: 'uppercase',
                        textShadow: `0 0 4px rgba(${S},0.12)`,
                        whiteSpace: 'nowrap',
                    }}>{w}</span>
                ))}
            </div>

            {/* Left edge — vertical text */}
            <div style={{
                position: 'absolute', left: '6px', top: '28px', bottom: '28px', width: '16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                pointerEvents: 'none', userSelect: 'none', overflow: 'hidden',
            }}>
                {leftWords.map((w, i) => (
                    <span key={`l${i}`} style={{
                        fontFamily: 'ZhaixinglouFont, serif',
                        fontSize: '7px',
                        letterSpacing: '0.12em',
                        color: `rgba(${S},${0.10 + (i % 3) * 0.05})`,
                        textTransform: 'uppercase',
                        writingMode: 'vertical-rl',
                        textOrientation: 'mixed',
                        textShadow: `0 0 3px rgba(${S},0.1)`,
                        whiteSpace: 'nowrap',
                    }}>{w}</span>
                ))}
            </div>

            {/* Right edge — vertical text */}
            <div style={{
                position: 'absolute', right: '6px', top: '28px', bottom: '28px', width: '16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                pointerEvents: 'none', userSelect: 'none', overflow: 'hidden',
            }}>
                {rightWords.map((w, i) => (
                    <span key={`r${i}`} style={{
                        fontFamily: 'ZhaixinglouFont, serif',
                        fontSize: '7px',
                        letterSpacing: '0.12em',
                        color: `rgba(${S},${0.10 + (i % 3) * 0.05})`,
                        textTransform: 'uppercase',
                        writingMode: 'vertical-rl',
                        textOrientation: 'mixed',
                        textShadow: `0 0 3px rgba(${S},0.1)`,
                        whiteSpace: 'nowrap',
                    }}>{w}</span>
                ))}
            </div>

            {/* Corner sigils — ✧ at four corners */}
            {[
                { top: '4px', left: '4px' },
                { top: '4px', right: '4px' },
                { bottom: '4px', left: '4px' },
                { bottom: '4px', right: '4px' },
            ].map((pos, i) => (
                <span key={`corner${i}`} style={{
                    position: 'absolute', ...pos,
                    fontFamily: 'ZhaixinglouFont, serif',
                    fontSize: '11px',
                    color: `rgba(${S},0.25)`,
                    textShadow: `0 0 6px rgba(${S},0.3), 0 0 12px rgba(${S},0.15)`,
                    pointerEvents: 'none', userSelect: 'none',
                    lineHeight: 1,
                }}>✧</span>
            ))}

            {/* Faint silver connecting lines along edges */}
            {/* Top line */}
            <div style={{ position: 'absolute', top: '22px', left: '22px', right: '22px', height: '1px', background: `linear-gradient(90deg, transparent, rgba(${S},0.08) 20%, rgba(${S},0.12) 50%, rgba(${S},0.08) 80%, transparent)`, pointerEvents: 'none' }} />
            {/* Bottom line */}
            <div style={{ position: 'absolute', bottom: '22px', left: '22px', right: '22px', height: '1px', background: `linear-gradient(90deg, transparent, rgba(${S},0.08) 20%, rgba(${S},0.12) 50%, rgba(${S},0.08) 80%, transparent)`, pointerEvents: 'none' }} />
            {/* Left line */}
            <div style={{ position: 'absolute', top: '22px', bottom: '22px', left: '22px', width: '1px', background: `linear-gradient(180deg, transparent, rgba(${S},0.08) 20%, rgba(${S},0.12) 50%, rgba(${S},0.08) 80%, transparent)`, pointerEvents: 'none' }} />
            {/* Right line */}
            <div style={{ position: 'absolute', top: '22px', bottom: '22px', right: '22px', width: '1px', background: `linear-gradient(180deg, transparent, rgba(${S},0.08) 20%, rgba(${S},0.12) 50%, rgba(${S},0.08) 80%, transparent)`, pointerEvents: 'none' }} />

            {/* ═══ CONTENT ═══ */}
            <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Top decorative line */}
                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent 5%, rgba(${S},0.25) 30%, rgba(${S},0.4) 50%, rgba(${S},0.25) 70%, transparent 95%)` }} />

                {/* Header */}
                <div style={{ padding: '24px 32px 14px', textAlign: 'center' }}>
                    <div style={{ marginBottom: '6px' }}>
                        <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '10px', letterSpacing: '0.3em', color: `rgba(${S},0.45)`, textTransform: 'uppercase' }}>{label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <div className="flex-1 h-[1px]" style={{ background: `linear-gradient(90deg, transparent, rgba(${S},0.18))` }} />
                        <span style={{ fontSize: '8px', fontFamily: 'ZhaixinglouFont, serif', color: `rgba(${S},0.35)`, letterSpacing: '0.15em' }}>{headerOrnament}</span>
                        <div className="flex-1 h-[1px]" style={{ background: `linear-gradient(270deg, transparent, rgba(${S},0.18))` }} />
                    </div>
                    <h2 style={{ fontFamily: 'ZhaixinglouTitle, serif', fontSize: '24px', letterSpacing: '0.12em', color: `rgba(${S},0.90)`, textShadow: `0 0 8px rgba(${S},0.4), 0 0 20px rgba(${S},0.2), 0 0 40px rgba(160,180,210,0.1), 0 2px 4px rgba(0,0,0,0.6)`, margin: 0, lineHeight: 1.2 }}>{title}</h2>
                    {subtitle && <p style={{ fontFamily: 'ZhaixinglouCN, serif', fontSize: '11px', fontStyle: 'italic', letterSpacing: '0.2em', color: `rgba(${S},0.35)`, marginTop: '6px', marginBottom: 0 }}>{subtitle}</p>}
                </div>

                {/* Divider */}
                <div style={{ padding: '0 32px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ flex: 1, height: '1px', background: `rgba(${S},0.15)` }} />
                        <div style={{ height: '3px', width: '3px', borderRadius: '50%', background: `rgba(${S},0.3)` }} />
                        <div style={{ width: '40px', height: '1px', background: `rgba(${S},0.10)` }} />
                        <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '10px', color: `rgba(${S},0.40)` }}>{diamond}</span>
                        <div style={{ width: '40px', height: '1px', background: `rgba(${S},0.10)` }} />
                        <div style={{ height: '3px', width: '3px', borderRadius: '50%', background: `rgba(${S},0.3)` }} />
                        <div style={{ flex: 1, height: '1px', background: `rgba(${S},0.15)` }} />
                    </div>
                </div>

                {/* Body text */}
                <div style={{ padding: '0 32px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {paragraphList.map((para, i) => (
                        <p key={i} style={{ fontFamily: 'ZhaixinglouCN, serif', fontSize: '14px', lineHeight: 2.2, color: `rgba(${S},0.82)`, margin: 0, textShadow: `0 0 6px rgba(${S},0.1), 0 1px 3px rgba(0,0,0,0.5)` }}>{para}</p>
                    ))}
                </div>

                {/* Bottom divider */}
                <div style={{ padding: '16px 32px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ flex: 1, height: '1px', background: `rgba(${S},0.15)` }} />
                        <div style={{ height: '3px', width: '3px', borderRadius: '50%', background: `rgba(${S},0.3)` }} />
                        <div style={{ width: '40px', height: '1px', background: `rgba(${S},0.10)` }} />
                        <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '10px', color: `rgba(${S},0.40)` }}>{diamond}</span>
                        <div style={{ width: '40px', height: '1px', background: `rgba(${S},0.10)` }} />
                        <div style={{ height: '3px', width: '3px', borderRadius: '50%', background: `rgba(${S},0.3)` }} />
                        <div style={{ flex: 1, height: '1px', background: `rgba(${S},0.15)` }} />
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '18px 32px 26px', textAlign: 'center' }}>
                    {/* Small sigil circle */}
                    <div style={{ width: '36px', height: '36px', margin: '0 auto 10px', borderRadius: '50%', border: `1px solid rgba(${S},0.12)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src="https://i.postimg.cc/NGRj3Xpb/qi-qi-su-cai-pu-(2).png" alt="" style={{ width: '22px', height: '22px', opacity: 0.3, pointerEvents: 'none', userSelect: 'none', filter: 'brightness(1.5) contrast(0.7)' }} />
                    </div>
                    <div style={{ marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                            <div style={{ width: '28px', height: '1px', background: `rgba(${S},0.15)` }} />
                            <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '8px', color: `rgba(${S},0.30)`, letterSpacing: '0.1em' }}>{footerOrnament}</span>
                            <div style={{ width: '28px', height: '1px', background: `rgba(${S},0.15)` }} />
                        </div>
                    </div>
                    <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '11px', letterSpacing: '0.35em', color: `rgba(${S},0.45)`, display: 'block' }}>{brandMark}</span>
                    <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '9px', letterSpacing: '0.2em', color: `rgba(${S},0.25)`, display: 'block', marginTop: '4px' }}>{date}</span>
                </div>

                {/* Bottom decorative line */}
                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent 5%, rgba(${S},0.25) 30%, rgba(${S},0.4) 50%, rgba(${S},0.25) 70%, transparent 95%)` }} />
            </div>
        </div>
    );
};

// ═══════════════════════════════════
// Gold-themed Card (Original tarot/chart)
// ═══════════════════════════════════

const GoldCard: React.FC<{
    cardRef: React.RefObject<HTMLDivElement | null>;
    paragraphList: string[];
    title: string;
    subtitle?: string;
    date: string;
    label: string;
}> = ({ cardRef, paragraphList, title, subtitle, date, label }) => {
    const star4 = String.fromCodePoint(0x2726);
    const star4o = String.fromCodePoint(0x2727);
    const ornL = String.fromCodePoint(0x2295);
    const oDash = '\u2500\u2500';
    const diamond = String.fromCodePoint(0x29C1);
    const brandMark = `${star4o} Zhaixinglou ${star4o}`;
    const headerOrnament = `${ornL} ${oDash} ${star4o} ${oDash} ${ornL}`;
    const footerOrnament = `${star4} ${oDash} ${star4o} ${oDash} ${star4}`;

    return (
        <div
            ref={cardRef}
            style={{
                position: 'relative',
                overflow: 'hidden',
                background: `
                    radial-gradient(ellipse at 25% 15%, rgba(70,12,22,0.65) 0%, transparent 45%),
                    radial-gradient(ellipse at 75% 85%, rgba(55,8,18,0.55) 0%, transparent 45%),
                    radial-gradient(ellipse at 50% 50%, rgba(40,6,15,0.45) 0%, transparent 65%),
                    radial-gradient(ellipse at 80% 30%, rgba(50,10,20,0.3) 0%, transparent 50%),
                    linear-gradient(165deg, #2e0810 0%, #220610 25%, #1a050c 55%, #100308 100%)
                `,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)',
            }}
        >
            {/* Primary noise texture — coarse grain */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`, backgroundSize: '128px 128px', opacity: 0.55, pointerEvents: 'none', mixBlendMode: 'overlay' }} />
            {/* Secondary noise texture — fine grain for matte feel */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 128 128' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='0.03'/%3E%3C/svg%3E")`, backgroundSize: '96px 96px', opacity: 0.4, pointerEvents: 'none', mixBlendMode: 'soft-light' }} />
            {/* Star dust — warm gold specks */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', backgroundImage: `radial-gradient(1px 1px at 15% 25%, rgba(${G},0.45) 0%, transparent 100%), radial-gradient(1px 1px at 85% 15%, rgba(${G},0.35) 0%, transparent 100%), radial-gradient(1px 1px at 45% 75%, rgba(${G},0.50) 0%, transparent 100%), radial-gradient(1px 1px at 70% 55%, rgba(${G},0.28) 0%, transparent 100%), radial-gradient(1px 1px at 25% 90%, rgba(${G},0.38) 0%, transparent 100%), radial-gradient(1px 1px at 90% 70%, rgba(${G},0.42) 0%, transparent 100%), radial-gradient(1px 1px at 55% 12%, rgba(${G},0.32) 0%, transparent 100%), radial-gradient(1px 1px at 35% 45%, rgba(${G},0.25) 0%, transparent 100%)`, pointerEvents: 'none' }} />
            {/* Vignette — deeper edges for depth */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'radial-gradient(ellipse at center, transparent 30%, rgba(8,2,4,0.50) 100%)', pointerEvents: 'none' }} />
            <img src="/images/sun-wheel.png" alt="" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '75%', maxWidth: '300px', opacity: 0.05, pointerEvents: 'none', userSelect: 'none' }} />
            <img src="/images/corner-a.png" alt="" style={{ position: 'absolute', bottom: 0, right: 0, width: '140px', height: 'auto', opacity: 0.55, pointerEvents: 'none', userSelect: 'none' }} />
            <img src="/images/corner-a.png" alt="" style={{ position: 'absolute', top: 0, left: 0, width: '140px', height: 'auto', opacity: 0.55, pointerEvents: 'none', userSelect: 'none', transform: 'scale(-1,-1)' }} />
            <img src="/images/corner-b.png" alt="" style={{ position: 'absolute', top: 0, right: 0, width: '120px', height: 'auto', opacity: 0.45, pointerEvents: 'none', userSelect: 'none', transform: 'scaleY(-1)' }} />
            <img src="/images/corner-b.png" alt="" style={{ position: 'absolute', bottom: 0, left: 0, width: '120px', height: 'auto', opacity: 0.45, pointerEvents: 'none', userSelect: 'none', transform: 'scaleX(-1)' }} />

            <div style={{ position: 'absolute', left: '18px', top: '15%', bottom: '15%', width: '1px', display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none', userSelect: 'none' }}>
                <div style={{ width: '1px', opacity: 0.5, height: '18%', background: `linear-gradient(180deg, transparent, rgba(${G},0.4) 20%, rgba(${G},0.35) 80%, transparent)` }} />
                <div style={{ height: '12%' }} />
                <div style={{ width: '1px', opacity: 0.5, height: '12%', background: `linear-gradient(180deg, transparent, rgba(${G},0.32) 30%, rgba(${G},0.3) 70%, transparent)` }} />
                <div style={{ height: '14%' }} />
                <div style={{ width: '1px', opacity: 0.5, height: '8%', background: `linear-gradient(180deg, transparent, rgba(${G},0.28) 40%, rgba(${G},0.28) 60%, transparent)` }} />
                <div style={{ height: '10%' }} />
                <div style={{ width: '1px', opacity: 0.5, height: '14%', background: `linear-gradient(180deg, transparent, rgba(${G},0.36) 25%, rgba(${G},0.32) 75%, transparent)` }} />
            </div>
            <div style={{ position: 'absolute', right: '18px', top: '15%', bottom: '15%', width: '1px', display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none', userSelect: 'none' }}>
                <div style={{ width: '1px', opacity: 0.5, height: '10%', background: `linear-gradient(180deg, transparent, rgba(${G},0.34) 30%, rgba(${G},0.3) 70%, transparent)` }} />
                <div style={{ height: '10%' }} />
                <div style={{ width: '1px', opacity: 0.5, height: '20%', background: `linear-gradient(180deg, transparent, rgba(${G},0.42) 15%, rgba(${G},0.38) 85%, transparent)` }} />
                <div style={{ height: '12%' }} />
                <div style={{ width: '1px', opacity: 0.5, height: '14%', background: `linear-gradient(180deg, transparent, rgba(${G},0.36) 25%, rgba(${G},0.32) 75%, transparent)` }} />
                <div style={{ height: '10%' }} />
                <div style={{ width: '1px', opacity: 0.5, height: '10%', background: `linear-gradient(180deg, transparent, rgba(${G},0.3) 30%, rgba(${G},0.28) 70%, transparent)` }} />
            </div>

            <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent 5%, rgba(${G},0.4) 30%, rgba(${G},0.6) 50%, rgba(${G},0.4) 70%, transparent 95%)` }} />

                <div style={{ padding: '20px 28px 14px', textAlign: 'center' }}>
                    <div style={{ marginBottom: '6px' }}>
                        <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '10px', letterSpacing: '0.3em', color: `rgba(${G},0.55)`, textTransform: 'uppercase' }}>{label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <div className="flex-1 h-[1px]" style={{ background: `linear-gradient(90deg, transparent, rgba(${G},0.25))` }} />
                        <span style={{ fontSize: '8px', fontFamily: 'ZhaixinglouFont, serif', color: `rgba(${G},0.45)`, letterSpacing: '0.15em' }}>{headerOrnament}</span>
                        <div className="flex-1 h-[1px]" style={{ background: `linear-gradient(270deg, transparent, rgba(${G},0.25))` }} />
                    </div>
                    <h2 style={{ fontFamily: 'ZhaixinglouTitle, serif', fontSize: '24px', letterSpacing: '0.12em', color: `rgba(${G},0.95)`, textShadow: `0 0 8px rgba(${G},0.5), 0 0 20px rgba(${G},0.25), 0 2px 4px rgba(0,0,0,0.6)`, margin: 0, lineHeight: 1.2 }}>{title}</h2>
                    {subtitle && <p style={{ fontFamily: 'ZhaixinglouCN, serif', fontSize: '11px', fontStyle: 'italic', letterSpacing: '0.2em', color: `rgba(${G},0.4)`, marginTop: '6px', marginBottom: 0 }}>{subtitle}</p>}
                </div>

                <div style={{ padding: '0 28px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ flex: 1, height: '1px', background: `rgba(${G},0.25)` }} />
                        <div style={{ height: '3px', width: '3px', borderRadius: '50%', background: `rgba(${G},0.4)` }} />
                        <div style={{ width: '40px', height: '1px', background: `rgba(${G},0.15)` }} />
                        <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '10px', color: `rgba(${G},0.55)` }}>{diamond}</span>
                        <div style={{ width: '40px', height: '1px', background: `rgba(${G},0.15)` }} />
                        <div style={{ height: '3px', width: '3px', borderRadius: '50%', background: `rgba(${G},0.4)` }} />
                        <div style={{ flex: 1, height: '1px', background: `rgba(${G},0.25)` }} />
                    </div>
                </div>

                <div style={{ padding: '0 28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {paragraphList.map((para, i) => (
                        <p key={i} style={{ fontFamily: 'ZhaixinglouCN, serif', fontSize: '14px', lineHeight: 2.2, color: 'rgba(220,205,175,0.92)', margin: 0, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{para}</p>
                    ))}
                </div>

                <div style={{ padding: '16px 28px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ flex: 1, height: '1px', background: `rgba(${G},0.25)` }} />
                        <div style={{ height: '3px', width: '3px', borderRadius: '50%', background: `rgba(${G},0.4)` }} />
                        <div style={{ width: '40px', height: '1px', background: `rgba(${G},0.15)` }} />
                        <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '10px', color: `rgba(${G},0.55)` }}>{diamond}</span>
                        <div style={{ width: '40px', height: '1px', background: `rgba(${G},0.15)` }} />
                        <div style={{ height: '3px', width: '3px', borderRadius: '50%', background: `rgba(${G},0.4)` }} />
                        <div style={{ flex: 1, height: '1px', background: `rgba(${G},0.25)` }} />
                    </div>
                </div>

                <div style={{ padding: '16px 28px 22px', textAlign: 'center' }}>
                    <img src="/images/laurel-wreath.png" alt="" style={{ width: '180px', opacity: 0.5, display: 'block', margin: '0 auto 8px', userSelect: 'none', pointerEvents: 'none' }} />
                    <div style={{ marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                            <div style={{ width: '28px', height: '1px', background: `rgba(${G},0.2)` }} />
                            <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '8px', color: `rgba(${G},0.4)`, letterSpacing: '0.1em' }}>{footerOrnament}</span>
                            <div style={{ width: '28px', height: '1px', background: `rgba(${G},0.2)` }} />
                        </div>
                    </div>
                    <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '11px', letterSpacing: '0.35em', color: `rgba(${G},0.55)`, display: 'block' }}>{brandMark}</span>
                    <span style={{ fontFamily: 'ZhaixinglouFont, serif', fontSize: '9px', letterSpacing: '0.2em', color: `rgba(${G},0.35)`, display: 'block', marginTop: '4px' }}>{date}</span>
                </div>

                <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent 5%, rgba(${G},0.4) 30%, rgba(${G},0.6) 50%, rgba(${G},0.4) 70%, transparent 95%)` }} />
            </div>
        </div>
    );
};

// ═══════════════════════════════════
// Main Modal
// ═══════════════════════════════════

const ShareCardModal: React.FC<ShareCardModalProps> = ({
    visible, onClose, content, paragraphs, context,
}) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [cachedBlob, setCachedBlob] = useState<Blob | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // ── 弹窗打开后自动在后台预生成截图 ──
    useEffect(() => {
        if (!visible) {
            // 弹窗关闭时清理
            setCachedBlob(null);
            setIsGenerating(false);
            return;
        }

        // 等一帧让卡片 DOM 渲染完成，再截图
        let cancelled = false;
        const timer = setTimeout(async () => {
            if (!cardRef.current || cancelled) return;
            setIsGenerating(true);
            try {
                const blob = await exportShareCard(cardRef.current);
                if (!cancelled) setCachedBlob(blob);
            } catch (err) {
                console.error('[ShareCard] 预生成截图失败:', err);
            } finally {
                if (!cancelled) setIsGenerating(false);
            }
        }, 300); // 300ms 让 DOM + 字体渲染完毕

        return () => { cancelled = true; clearTimeout(timer); };
    }, [visible]);

    if (!visible) return null;

    const { title, subtitle, date, source } = context;
    const { label } = SOURCE_LABELS[source];
    const paragraphList: string[] = paragraphs && paragraphs.length > 0
        ? paragraphs
        : (content ? content.split(/\n+/).filter(p => p.trim()) : []);

    // ── 用户点击"保存图片"——blob 已就绪，立即分享 ──
    const handleExport = async () => {
        // 如果 blob 还没生成好，现场生成（兜底）
        let blob = cachedBlob;
        if (!blob) {
            if (!cardRef.current) return;
            setIsGenerating(true);
            try {
                blob = await exportShareCard(cardRef.current);
                setCachedBlob(blob);
            } catch (err) {
                console.error('[ShareCard] 截图失败:', err);
                return;
            } finally {
                setIsGenerating(false);
            }
        }

        const filename = `zhaixinglou-${new Date().toISOString().slice(0, 10)}.png`;
        try {
            await shareOrDownload(blob, filename);
        } catch (err) {
            console.error('[ShareCard] 分享失败:', err);
        }
    };

    const isAkashic = source === 'akashic';
    const accentColor = isAkashic ? S : G;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-[400px] mx-4 flex flex-col gap-4 max-h-[95vh] overflow-y-auto no-scrollbar py-4">
                {isAkashic ? (
                    <AkashicCard
                        cardRef={cardRef}
                        paragraphList={paragraphList}
                        title={title}
                        subtitle={subtitle}
                        date={date}
                        label={label}
                    />
                ) : (
                    <GoldCard
                        cardRef={cardRef}
                        paragraphList={paragraphList}
                        title={title}
                        subtitle={subtitle}
                        date={date}
                        label={label}
                    />
                )}

                <div className="flex gap-3 px-1">
                    <button onClick={onClose} className="flex-1 py-3 border border-white/15 rounded-xl text-white/50 text-sm active:scale-95 transition-transform">取消</button>
                    <button
                        onClick={handleExport}
                        disabled={isGenerating}
                        className="flex-2 flex-grow-[2] py-3 rounded-xl text-sm font-bold active:scale-95 transition-transform disabled:opacity-50"
                        style={{
                            background: `linear-gradient(135deg, rgba(${accentColor},0.25), rgba(${accentColor},0.15))`,
                            border: `1px solid rgba(${accentColor},0.4)`,
                            color: `rgba(${accentColor},0.9)`,
                        }}
                    >
                        {isGenerating ? '生成中...' : '保存图片'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ShareCardModal;
