/**
 * DiarySkeleton — 日记页骨架
 *
 * 📓 温暖手写本风 — 奶油暖纸、棕红装订线、柔和蓝灰横线、
 * 金属装订环、真实墨迹感、折角翻页效果
 */
import React from 'react';
import { StatusCardData } from '../../../types/statusCard';

const FONT_MAP: Record<string, string> = {
    serif: "'Noto Serif SC', 'Kaiti SC', STKaiti, serif",
    sans: "'Inter', 'Noto Sans SC', system-ui, sans-serif",
    handwrite: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
};

const LINE_HEIGHT_PX = 34;

const DiarySkeleton: React.FC<{ data: StatusCardData }> = ({ data }) => {
    const { title, body, footer, icon, style } = data;

    const bgColor = style.bgGradient
        ? `linear-gradient(180deg, ${style.bgGradient[0]}, ${style.bgGradient[1]})`
        : 'linear-gradient(180deg, #FDF8EF 0%, #FAF3E6 50%, #F7EEE0 100%)';
    const textColor = style.textColor || '#3D3225';
    const accent = style.accent || '#B85450';
    const fontFamily = FONT_MAP[style.fontStyle || 'handwrite'];

    /* 横线颜色 — 柔和蓝灰而非土灰 */
    const lineColor = 'rgba(160,175,195,0.28)';
    /* 装订线 */
    const bindingColor = accent;

    return (
        <div
            style={{
                width: '330px',
                maxWidth: 'calc(100vw - 48px)',
                background: typeof bgColor === 'string' && bgColor.startsWith('linear')
                    ? bgColor : bgColor as string,
                color: textColor,
                fontFamily,
                borderRadius: '4px',
                overflow: 'hidden',
                position: 'relative' as const,
                boxShadow:
                    '0 2px 5px rgba(0,0,0,0.05), ' +
                    '0 10px 24px -4px rgba(0,0,0,0.14), ' +
                    '0 28px 50px -10px rgba(0,0,0,0.18), ' +
                    'inset 0 0 0 1px rgba(255,255,255,0.55)',
            }}
        >
            {/* ── 纸张纹理 (温暖纤维感) ── */}
            <div
                style={{
                    position: 'absolute' as const,
                    inset: 0,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'repeat',
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                    mixBlendMode: 'multiply' as const,
                }}
            />

            {/* ── 装订线 (棕红双线 + 微妙阴影) ── */}
            <div
                style={{
                    position: 'absolute' as const,
                    left: '38px',
                    top: 0,
                    bottom: 0,
                    width: '1.5px',
                    background: `${bindingColor}35`,
                    zIndex: 3,
                }}
            />
            <div
                style={{
                    position: 'absolute' as const,
                    left: '42px',
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    background: `${bindingColor}25`,
                    zIndex: 3,
                }}
            />

            {/* ── 装订孔 — 金属环效果 ── */}
            {[0, 1, 2].map((i) => (
                <div
                    key={`hole-${i}`}
                    style={{
                        position: 'absolute' as const,
                        left: '8px',
                        top: `${55 + i * 80}px`,
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        zIndex: 4,
                    }}
                >
                    {/* 金属环外圈 */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: `conic-gradient(
                            from 0deg,
                            rgba(180,175,165,0.5) 0deg,
                            rgba(210,205,195,0.7) 90deg,
                            rgba(160,155,145,0.4) 180deg,
                            rgba(200,195,185,0.6) 270deg,
                            rgba(180,175,165,0.5) 360deg
                        )`,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.12), inset 0 0 2px rgba(255,255,255,0.3)',
                    }} />
                    {/* 金属环内孔 */}
                    <div style={{
                        position: 'absolute',
                        top: '3px',
                        left: '3px',
                        right: '3px',
                        bottom: '3px',
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.04)',
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.10), inset 0 -1px 1px rgba(255,255,255,0.15)',
                    }} />
                </div>
            ))}

            {/* ── 日期头区域 ── */}
            <div
                style={{
                    padding: '18px 20px 14px 54px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: `1.5px solid ${accent}18`,
                    position: 'relative' as const,
                    zIndex: 2,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '14px',
                        fontWeight: 600,
                        letterSpacing: '0.5px',
                    }}
                >
                    {icon && (
                        <span style={{ fontSize: '18px' }}>{icon}</span>
                    )}
                    <span>{title || '日记'}</span>
                </div>
                {footer && (
                    <span
                        style={{
                            fontSize: '10px',
                            opacity: 0.50,
                            fontFamily: "'Georgia', serif",
                            letterSpacing: '0.15em',
                        }}
                    >
                        {footer}
                    </span>
                )}
            </div>

            {/* ── 横线本体内容区域 ── */}
            <div
                style={{
                    padding: `18px 20px 40px 54px`,
                    fontSize: '15px',
                    lineHeight: `${LINE_HEIGHT_PX}px`,
                    whiteSpace: 'pre-wrap' as const,
                    minHeight: '170px',
                    position: 'relative' as const,
                    zIndex: 2,
                    /* 横线 — 柔和蓝灰色 */
                    backgroundImage: `repeating-linear-gradient(
                        transparent,
                        transparent ${LINE_HEIGHT_PX - 1}px,
                        ${lineColor} ${LINE_HEIGHT_PX - 1}px,
                        ${lineColor} ${LINE_HEIGHT_PX}px
                    )`,
                    backgroundPosition: '0 17px',
                    letterSpacing: '0.6px',
                }}
            >
                {/* 手写墨迹效果 */}
                <span
                    style={{
                        display: 'inline',
                        textShadow: `0.3px 0.2px 0.6px ${textColor}12`,
                    }}
                >
                    {body?.trim()}
                </span>
            </div>

            {/* ── 墨渍装饰 (更有存在感的墨水飞溅) ── */}
            <div
                style={{
                    position: 'absolute' as const,
                    bottom: '24px',
                    right: '20px',
                    zIndex: 3,
                    pointerEvents: 'none' as const,
                    display: 'flex',
                    gap: '5px',
                    alignItems: 'flex-end',
                }}
            >
                {/* 大墨点 — 不规则 */}
                <div style={{
                    width: '10px',
                    height: '9px',
                    borderRadius: '50% 45% 55% 40%',
                    background: `${textColor}18`,
                    boxShadow: `1px 1px 4px ${textColor}0a`,
                }} />
                {/* 中墨点 */}
                <div style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: `${textColor}14`,
                }} />
                {/* 小溅射 */}
                <div style={{
                    width: '3px',
                    height: '3px',
                    borderRadius: '50%',
                    background: `${textColor}10`,
                    transform: 'translate(4px, -6px)',
                }} />
                <div style={{
                    width: '2px',
                    height: '2px',
                    borderRadius: '50%',
                    background: `${textColor}0c`,
                    transform: 'translate(-2px, -10px)',
                }} />
            </div>

            {/* ── 页码 (底部居中) ── */}
            <div style={{
                position: 'absolute' as const,
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '8px',
                color: textColor,
                opacity: 0.20,
                fontFamily: "'Georgia', serif",
                letterSpacing: '0.15em',
                zIndex: 3,
            }}>
                — · —
            </div>

            {/* ── 角落装饰 icon ── */}
            {icon && (
                <div
                    style={{
                        position: 'absolute' as const,
                        bottom: '16px',
                        right: '16px',
                        fontSize: '22px',
                        opacity: 0.10,
                        transform: 'rotate(-8deg)',
                        zIndex: 2,
                        pointerEvents: 'none' as const,
                    }}
                >
                    {icon}
                </div>
            )}

            {/* ── 纸张右下角折角 ── */}
            <div
                style={{
                    position: 'absolute' as const,
                    bottom: 0,
                    right: 0,
                    width: '36px',
                    height: '36px',
                    background:
                        'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.018) 50%, rgba(0,0,0,0.04) 100%)',
                    pointerEvents: 'none' as const,
                    zIndex: 5,
                }}
            />
            {/* 折角反面色 */}
            <div style={{
                position: 'absolute' as const,
                bottom: 0,
                right: 0,
                width: '20px',
                height: '20px',
                background: 'linear-gradient(135deg, transparent 50%, rgba(245,238,225,0.8) 50%)',
                pointerEvents: 'none' as const,
                zIndex: 5,
            }} />

            {/* ── 页面暗角 ── */}
            <div
                style={{
                    position: 'absolute' as const,
                    inset: 0,
                    background:
                        'radial-gradient(ellipse at center, transparent 55%, rgba(140,120,85,0.05) 100%)',
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                }}
            />
        </div>
    );
};

export default DiarySkeleton;
