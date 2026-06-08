/**
 * PhoneScreenSkeleton — 手机截图骨架
 *
 * 📱 高级 iOS 风 — 深邃渐变背景、毛玻璃导航栏、
 * 精致灵动岛、真实感状态栏、屏幕反光层、玻璃质感
 */
import React from 'react';
import { StatusCardData } from '../../../types/statusCard';

const FONT_MAP: Record<string, string> = {
    serif: "'Noto Serif SC', 'Kaiti SC', STKaiti, serif",
    sans: "'Inter', 'Noto Sans SC', system-ui, sans-serif",
    handwrite: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
};

const APP_PRESETS: Record<string, { navIcon: string; navTitle: string; bodyIcon: string }> = {
    weather:      { navIcon: '🌤️', navTitle: '天气',   bodyIcon: '🌡️' },
    delivery:     { navIcon: '🛵',  navTitle: '外卖',   bodyIcon: '📦' },
    notification: { navIcon: '🔔',  navTitle: '通知中心', bodyIcon: '💬' },
    generic:      { navIcon: '📱',  navTitle: '应用',   bodyIcon: '' },
};

/* ── Signal bars ── */
const SignalBars: React.FC<{ count: number; color: string }> = ({ count, color }) => (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '1.5px', height: '10px' }}>
        {[1, 2, 3, 4].map(i => (
            <span key={i} style={{
                width: '3px',
                height: `${i * 2.5}px`,
                borderRadius: '0.5px',
                background: i <= count ? color : `${color}30`,
            }} />
        ))}
    </span>
);

/* ── Battery icon ── */
const BatteryIcon: React.FC<{ pct: number; color: string }> = ({ pct, color }) => {
    const fillColor = pct <= 20 ? '#FF3B30' : pct <= 50 ? '#FFCC00' : '#30D158';
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px' }}>
            <span style={{
                position: 'relative', width: '22px', height: '10px',
                border: `1.5px solid ${color}`,
                borderRadius: '2.5px',
                display: 'inline-block',
            }}>
                <span style={{
                    position: 'absolute', left: '1.5px', top: '1.5px', bottom: '1.5px',
                    width: `${Math.min(100, Math.max(0, pct)) * 0.16}px`,
                    background: fillColor,
                    borderRadius: '1px',
                }} />
            </span>
            <span style={{
                width: '1.5px', height: '4px',
                background: color,
                borderRadius: '0 1px 1px 0',
            }} />
        </span>
    );
};

const PhoneScreenSkeleton: React.FC<{ data: StatusCardData }> = ({ data }) => {
    const { title, body, footer, icon, meta, style } = data;

    /* 背景 — 深邃渐变 */
    const bg = style.bgGradient
        ? `linear-gradient(165deg, ${style.bgGradient[0]}, ${style.bgGradient[1]})`
        : 'linear-gradient(165deg, #0A0A1A 0%, #1A1A35 40%, #12122A 100%)';
    const textColor = style.textColor || '#F5F5F7';
    const accent = style.accent || '#0A84FF';
    const fontFamily = FONT_MAP[style.fontStyle || 'sans'];

    const appType = (meta?.appType as string) || 'generic';
    const signal  = typeof meta?.signal  === 'number' ? meta.signal  : 3;
    const battery = typeof meta?.battery === 'number' ? meta.battery : 78;

    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    const preset = APP_PRESETS[appType] || APP_PRESETS.generic;
    const navIcon  = icon || preset.navIcon;
    const navTitle = title || preset.navTitle;
    const barColor = `${textColor}cc`;

    return (
        <div style={{
            width: '330px',
            maxWidth: 'calc(100vw - 48px)',
            background: bg,
            color: textColor,
            fontFamily,
            /* 精致手机边框 — 多层模拟 */
            borderRadius: '36px',
            overflow: 'hidden',
            boxShadow:
                '0 0 0 0.5px rgba(255,255,255,0.12), ' +       /* 内发光边 */
                '0 0 0 3px rgba(40,40,50,0.95), ' +            /* 金属中框 */
                '0 0 0 3.5px rgba(80,80,90,0.4), ' +           /* 金属高光 */
                '0 0 0 4px rgba(20,20,30,0.6), ' +             /* 外边缘 */
                '0 8px 32px -4px rgba(0,0,0,0.55), ' +         /* 设备投影 */
                '0 24px 64px -12px rgba(0,0,0,0.35)',           /* 远投影 */
            position: 'relative',
        }}>
            {/* ── 屏幕反光层 (斜向光带) ── */}
            <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '36px',
                background: `linear-gradient(
                    125deg,
                    transparent 0%,
                    rgba(255,255,255,0.03) 30%,
                    rgba(255,255,255,0.06) 45%,
                    transparent 55%,
                    transparent 100%
                )`,
                pointerEvents: 'none',
                zIndex: 10,
            }} />

            {/* ── 内屏区域 ── */}
            <div style={{
                borderRadius: '33px',
                overflow: 'hidden',
                position: 'relative',
            }}>
                {/* ═══  iOS 状态栏  ═══ */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 26px 4px',
                    fontSize: '13px',
                    fontWeight: 600,
                    fontFamily: "'SF Pro Text', 'Inter', system-ui, sans-serif",
                    letterSpacing: '-0.2px',
                }}>
                    <span style={{ minWidth: '44px' }}>{timeStr}</span>

                    {/* 灵动岛 — 多层精致 */}
                    <div style={{
                        width: '86px',
                        height: '24px',
                        background: 'rgba(0,0,0,0.80)',
                        borderRadius: '20px',
                        position: 'relative',
                        boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.06), 0 0 12px rgba(0,0,0,0.3)',
                    }}>
                        {/* 前置摄像头 */}
                        <div style={{
                            position: 'absolute',
                            right: '18px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'radial-gradient(circle at 40% 35%, rgba(30,30,50,0.9), rgba(15,15,25,1))',
                            boxShadow: 'inset 0 0 1px rgba(255,255,255,0.15)',
                        }} />
                    </div>

                    <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        minWidth: '44px',
                        justifyContent: 'flex-end',
                    }}>
                        <SignalBars count={signal} color={barColor} />
                        <span style={{ fontSize: '10px', opacity: 0.65, fontWeight: 400 }}>
                            {battery}%
                        </span>
                        <BatteryIcon pct={battery} color={barColor} />
                    </span>
                </div>

                {/* ═══  App 导航栏 — 毛玻璃效果  ═══ */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px 12px',
                    background: `linear-gradient(180deg, ${accent}18, ${accent}08)`,
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderBottom: `0.5px solid ${accent}25`,
                    position: 'relative',
                }}>
                    {/* 毛玻璃底层 */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(255,255,255,0.04)',
                        pointerEvents: 'none',
                    }} />

                    <span style={{
                        fontSize: '18px',
                        opacity: 0.50,
                        lineHeight: 1,
                        cursor: 'default',
                        color: accent,
                    }}>‹</span>
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '16px' }}>{navIcon}</span>
                        <span style={{
                            fontSize: '16px',
                            fontWeight: 600,
                            letterSpacing: '0.1px',
                        }}>{navTitle}</span>
                    </span>
                    <span style={{
                        fontSize: '16px',
                        opacity: 0.35,
                        color: accent,
                    }}>⋯</span>
                </div>

                {/* ═══  内容区  ═══ */}
                <div style={{
                    padding: '22px 22px 10px',
                    minHeight: '110px',
                    position: 'relative',
                }}>
                    {appType !== 'generic' && preset.bodyIcon && (
                        <div style={{
                            textAlign: 'center',
                            fontSize: '38px',
                            marginBottom: '14px',
                            filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.35))',
                        }}>
                            {preset.bodyIcon}
                        </div>
                    )}

                    <div style={{
                        fontSize: '14px',
                        lineHeight: '1.85',
                        whiteSpace: 'pre-wrap',
                        letterSpacing: '0.3px',
                        opacity: 0.92,
                    }}>
                        {body}
                    </div>

                    {/* 内容区分隔线 — 渐变淡出 */}
                    <div style={{
                        margin: '18px 0 8px',
                        height: '0.5px',
                        background: `linear-gradient(90deg, transparent, ${textColor}18, transparent)`,
                    }} />

                    {footer && (
                        <div style={{
                            fontSize: '11px',
                            opacity: 0.35,
                            textAlign: 'right',
                            paddingBottom: '4px',
                            fontStyle: 'italic',
                            fontFamily: "'Georgia', 'Noto Serif SC', serif",
                        }}>
                            {footer}
                        </div>
                    )}
                </div>

                {/* ═══  Home Indicator  ═══ */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    paddingBottom: '10px',
                    paddingTop: '4px',
                }}>
                    <span style={{
                        width: '108px',
                        height: '4px',
                        background: `linear-gradient(90deg, ${textColor}25, ${textColor}35, ${textColor}25)`,
                        borderRadius: '2px',
                    }} />
                </div>
            </div>
        </div>
    );
};

export default PhoneScreenSkeleton;
