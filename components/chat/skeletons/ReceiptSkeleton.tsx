/**
 * ReceiptSkeleton — 收据/小票骨架
 *
 * 🧾 极致仿真热敏纸 — 灰白热纸质地、竖向拉丝纹理、
 * 不规则撕纸边、打印头压痕、精致条形码、褪色效果
 */
import React from 'react';
import { StatusCardData } from '../../../types/statusCard';

const FONT_MAP: Record<string, string> = {
    serif: "'Noto Serif SC', 'Kaiti SC', STKaiti, serif",
    sans: "'Inter', 'Noto Sans SC', system-ui, sans-serif",
    handwrite: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
};

/* ── 撕纸边 clipPath ── */
const tearEdge = (pos: 'top' | 'bottom') => {
    // 生成更不规则的撕裂效果
    const points: string[] = [];
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
        const x = (i / steps * 100).toFixed(1);
        const jitter = (Math.sin(i * 7.3 + 2) * 2.5 + Math.sin(i * 13.7) * 1.2).toFixed(1);
        if (pos === 'top') {
            points.push(`${x}% ${Number(jitter) + 3}%`);
        } else {
            points.push(`${x}% ${97 - Number(jitter)}%`);
        }
    }
    if (pos === 'top') {
        return `polygon(0% 0%, ${points.join(', ')}, 100% 0%, 100% 100%, 0% 100%)`;
    }
    return `polygon(0% 0%, 100% 0%, 100% 100%, ${points.reverse().join(', ')}, 0% 100%)`;
};

/* ── 虚线分隔符 ── */
const DashedDivider: React.FC<{ color: string; spacing?: string }> = ({ color, spacing = '10px 0' }) => (
    <div style={{
        margin: spacing,
        height: '1px',
        backgroundImage: `repeating-linear-gradient(90deg, ${color} 0px, ${color} 4px, transparent 4px, transparent 7px)`,
        backgroundSize: '7px 1px',
        backgroundRepeat: 'repeat-x',
    }} />
);

/* ── 条形码装饰 ── */
const Barcode: React.FC<{ color: string }> = ({ color }) => {
    const bars = [2,1,1,3,1,2,1,1,3,1,1,2,3,1,1,2,1,3,1,1,2,1,1,3,1,2,1,1,2,3,1,1,2,1,3,1,1,2,1,1,2,1,3,1];
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            gap: '0.5px',
            marginTop: '14px',
            padding: '0 16px',
            opacity: 0.40,
        }}>
            {bars.map((w, i) => (
                <div key={i} style={{
                    width: `${w}px`,
                    height: `${14 + (i % 5 === 0 ? 4 : i % 3 === 0 ? 2 : 0)}px`,
                    background: color,
                    borderRadius: '0.3px',
                }} />
            ))}
        </div>
    );
};

const ReceiptSkeleton: React.FC<{ data: StatusCardData }> = ({ data }) => {
    const { title, body, footer, icon, meta, style } = data;

    const textColor = style.textColor || '#3C3830';
    const fontFamily = FONT_MAP['mono'];

    /* 热敏纸色 — 灰白微黄 */
    const paperBg = style.bgGradient
        ? `linear-gradient(180deg, ${style.bgGradient[0]}, ${style.bgGradient[1]})`
        : `linear-gradient(180deg, #FEFDF8 0%, #FCFAF2 30%, #F9F5EAee 70%, #F5F0E4 100%)`;

    return (
        <div style={{
            width: 'min(88vw, 340px)',
            maxWidth: 'calc(100vw - 32px)',
            position: 'relative' as const,
            transform: 'rotate(0.8deg)',
            /* 撕纸边 */
            clipPath: tearEdge('bottom'),
        }}>
            {/* 顶部撕纸边 (独立层) */}
            <div style={{
                position: 'absolute' as const,
                top: 0,
                left: 0,
                right: 0,
                height: '8px',
                clipPath: tearEdge('top'),
                background: paperBg,
                zIndex: 5,
            }} />

            <div style={{
                background: paperBg,
                color: textColor,
                fontFamily,
                padding: '26px 22px 28px',
                position: 'relative' as const,
                boxShadow:
                    '0 1px 3px rgba(0,0,0,0.05), ' +
                    '0 6px 14px rgba(0,0,0,0.07), ' +
                    '0 18px 36px -8px rgba(0,0,0,0.14), ' +
                    'inset 0 0 0 0.5px rgba(0,0,0,0.03)',
            }}>
                {/* ── 热敏纸竖向拉丝纹理 ── */}
                <div style={{
                    position: 'absolute' as const,
                    inset: 0,
                    opacity: 0.025,
                    backgroundImage: `repeating-linear-gradient(
                        0deg,
                        transparent 0px, transparent 1px,
                        rgba(80,70,55,0.5) 1px,
                        rgba(80,70,55,0.5) 1.3px
                    )`,
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                }} />

                {/* ── 热敏纸噪点纹理 ── */}
                <div style={{
                    position: 'absolute' as const,
                    inset: 0,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='150' height='150' filter='url(%23t)' opacity='0.05'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'repeat',
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                    mixBlendMode: 'multiply' as const,
                }} />

                {/* ── 左边缘打印头压痕 ── */}
                <div style={{
                    position: 'absolute' as const,
                    top: '12%',
                    bottom: '12%',
                    left: '2px',
                    width: '1.5px',
                    background: `linear-gradient(180deg, transparent, ${textColor}06, ${textColor}08, ${textColor}06, transparent)`,
                    pointerEvents: 'none' as const,
                    zIndex: 3,
                }} />

                {/* ── 边缘泛黄 ── */}
                <div style={{
                    position: 'absolute' as const,
                    inset: 0,
                    background: 'radial-gradient(ellipse at center, transparent 55%, rgba(200,185,150,0.06) 100%)',
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                }} />

                {/* ═══  标题区  ═══ */}
                <div style={{
                    textAlign: 'center' as const,
                    position: 'relative' as const,
                    zIndex: 2,
                }}>
                    <div style={{
                        fontSize: '17px',
                        fontWeight: 700,
                        letterSpacing: '2px',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                    }}>
                        <span style={{ opacity: 0.45, fontSize: '10px' }}>★</span>
                        <span>{title || '收据'}</span>
                        <span style={{ opacity: 0.45, fontSize: '10px' }}>★</span>
                    </div>

                    <div style={{
                        fontSize: '8px',
                        letterSpacing: '3px',
                        opacity: 0.35,
                        textTransform: 'uppercase' as const,
                        marginBottom: '2px',
                    }}>
                        {icon ? `${icon} INNER VOICE` : 'INNER VOICE'}
                    </div>
                </div>

                <DashedDivider color={`${textColor}35`} spacing="12px 0" />

                {/* ═══  正文  ═══ */}
                <div style={{
                    position: 'relative' as const,
                    zIndex: 2,
                    fontSize: '14px',
                    lineHeight: '2.0',
                    whiteSpace: 'pre-wrap' as const,
                    letterSpacing: '0.5px',
                    padding: '4px 0',
                }}>
                    {body}
                </div>

                {/* ═══  明细  ═══ */}
                {meta?.items && Array.isArray(meta.items) && meta.items.length > 0 && (
                    <div style={{ position: 'relative' as const, zIndex: 2 }}>
                        <DashedDivider color={`${textColor}28`} spacing="8px 0" />

                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '10px',
                            fontWeight: 700,
                            opacity: 0.40,
                            letterSpacing: '1px',
                            marginBottom: '6px',
                            textTransform: 'uppercase' as const,
                        }}>
                            <span>ITEM</span>
                            <span>PRICE</span>
                        </div>

                        {meta.items.map((item: { name: string; price: string }, i: number) => (
                            <div key={i} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'baseline',
                                fontSize: '13px',
                                lineHeight: '2.0',
                                gap: '10px',
                            }}>
                                <span style={{
                                    flex: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap' as const,
                                }}>{item.name}</span>
                                <span style={{
                                    flex: 1,
                                    borderBottom: `1px dotted ${textColor}20`,
                                    height: '1px',
                                    minWidth: '20px',
                                }} />
                                <span style={{
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap' as const,
                                }}>{item.price}</span>
                            </div>
                        ))}

                        {meta.total && (
                            <>
                                <DashedDivider color={`${textColor}30`} spacing="6px 0" />
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                    fontSize: '15px',
                                    fontWeight: 700,
                                }}>
                                    <span>合计 TOTAL</span>
                                    <span>{meta.total}</span>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <DashedDivider color={`${textColor}30`} spacing="12px 0 8px" />

                {/* ═══  Footer  ═══ */}
                {footer && (
                    <div style={{
                        textAlign: 'center' as const,
                        fontSize: '11px',
                        opacity: 0.45,
                        letterSpacing: '1px',
                        position: 'relative' as const,
                        zIndex: 2,
                        marginBottom: '6px',
                    }}>
                        {footer}
                    </div>
                )}

                {/* ═══  Thank you  ═══ */}
                <div style={{
                    textAlign: 'center' as const,
                    fontSize: '9px',
                    letterSpacing: '4px',
                    opacity: 0.28,
                    textTransform: 'uppercase' as const,
                    position: 'relative' as const,
                    zIndex: 2,
                    marginTop: '6px',
                }}>
                    THANK YOU
                </div>

                {/* ═══  条形码  ═══ */}
                <div style={{ position: 'relative' as const, zIndex: 2 }}>
                    <Barcode color={textColor} />
                    <div style={{
                        textAlign: 'center' as const,
                        fontSize: '7px',
                        letterSpacing: '3px',
                        opacity: 0.22,
                        marginTop: '3px',
                    }}>
                        4 902430 581039
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReceiptSkeleton;
