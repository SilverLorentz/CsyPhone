/**
 * PolaroidSkeleton — 拍立得骨架
 *
 * 🎞️ 复古胶片风 — 泛黄牙白宝丽来边框、胶片颗粒感、
 * 柔和怀旧色调照片区、半透明纤维胶带、墨水手写底注
 */
import React from 'react';
import { StatusCardData } from '../../../types/statusCard';

const FONT_MAP: Record<string, string> = {
    serif: "'Noto Serif SC', 'Kaiti SC', STKaiti, serif",
    sans: "'Inter', 'Noto Sans SC', system-ui, sans-serif",
    handwrite: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
};

const PolaroidSkeleton: React.FC<{ data: StatusCardData }> = ({ data }) => {
    const { body, footer, icon, style } = data;

    /* 照片区渐变 — 偏暖的怀旧色调 */
    const bgGrad = style.bgGradient
        ? `linear-gradient(145deg, ${style.bgGradient[0]}, ${style.bgGradient[1]})`
        : 'linear-gradient(145deg, #C9B8A8, #A89080, #D4C4B0)';
    const textColor = style.textColor || '#4A3C2E';
    const accent = style.accent || '#B8A898';
    const fontFamily = FONT_MAP[style.fontStyle || 'handwrite'];

    return (
        <div
            style={{
                width: '330px',
                maxWidth: 'calc(100vw - 48px)',
                position: 'relative' as const,
                transform: 'rotate(-2.5deg)',
                overflow: 'visible',
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.06))',
            }}
        >
            {/* ── 胶带装饰 (半透明 + 纤维纹理) ── */}
            <div
                style={{
                    position: 'absolute' as const,
                    top: '-11px',
                    left: '50%',
                    transform: 'translateX(-50%) rotate(3deg)',
                    width: '76px',
                    height: '28px',
                    zIndex: 10,
                    overflow: 'hidden',
                    borderRadius: '0.5px',
                }}
            >
                {/* 胶带底色 */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(255,248,225,0.50) 0%, rgba(245,235,200,0.40) 50%, rgba(240,228,190,0.45) 100%)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08), inset 0 0 0 0.5px rgba(200,180,140,0.18)',
                }} />
                {/* 胶带纤维纹理 */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.15,
                    backgroundImage: `repeating-linear-gradient(
                        0deg,
                        transparent 0px, transparent 1.5px,
                        rgba(180,160,120,0.3) 1.5px,
                        rgba(180,160,120,0.3) 2px
                    )`,
                    pointerEvents: 'none' as const,
                }} />
                {/* 胶带光泽 */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.08) 100%)',
                    pointerEvents: 'none' as const,
                }} />
                {/* 胶带边缘撕裂效果 — 左右不规则 */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: '-1px',
                    width: '3px',
                    height: '100%',
                    background: 'linear-gradient(180deg, transparent 10%, rgba(255,245,220,0.3) 15%, transparent 25%, rgba(255,245,220,0.2) 40%, transparent 55%, rgba(255,245,220,0.25) 70%, transparent 85%)',
                    pointerEvents: 'none' as const,
                }} />
                <div style={{
                    position: 'absolute',
                    top: 0,
                    right: '-1px',
                    width: '3px',
                    height: '100%',
                    background: 'linear-gradient(180deg, transparent 5%, rgba(255,245,220,0.25) 20%, transparent 35%, rgba(255,245,220,0.3) 50%, transparent 65%, rgba(255,245,220,0.2) 80%, transparent 95%)',
                    pointerEvents: 'none' as const,
                }} />
            </div>

            {/* ── 主卡片 (泛黄牙白宝丽来) ── */}
            <div
                style={{
                    width: '100%',
                    /* 宝丽来纸张底色 — 不是纯白，而是温暖的牙白 */
                    background: 'linear-gradient(178deg, #FDFBF7 0%, #FAF6EE 50%, #F7F2E8 100%)',
                    borderRadius: '2px',
                    padding: '16px 16px 46px 16px',
                    boxShadow:
                        '0 1px 2px rgba(0,0,0,0.06), ' +
                        '0 4px 12px rgba(0,0,0,0.08), ' +
                        '0 16px 36px -6px rgba(0,0,0,0.18), ' +
                        '0 32px 56px -14px rgba(0,0,0,0.14), ' +
                        'inset 0 0 0 1px rgba(0,0,0,0.03)',
                    position: 'relative' as const,
                    overflow: 'hidden',
                }}
            >
                {/* ── 宝丽来纸张纹理 (更粗的纤维感) ── */}
                <div
                    style={{
                        position: 'absolute' as const,
                        inset: 0,
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'repeat',
                        pointerEvents: 'none' as const,
                        zIndex: 1,
                        mixBlendMode: 'multiply' as const,
                    }}
                />

                {/* ── 边缘泛黄晕 (模拟老化) ── */}
                <div
                    style={{
                        position: 'absolute' as const,
                        inset: 0,
                        background: `
                            radial-gradient(ellipse at 0% 0%, rgba(235,215,175,0.12) 0%, transparent 50%),
                            radial-gradient(ellipse at 100% 100%, rgba(235,215,175,0.10) 0%, transparent 50%),
                            radial-gradient(ellipse at center, transparent 50%, rgba(240,225,195,0.08) 100%)
                        `,
                        pointerEvents: 'none' as const,
                        zIndex: 1,
                    }}
                />

                {/* ── 正方形 "照片" 区域 ── */}
                <div
                    style={{
                        position: 'relative' as const,
                        width: '100%',
                        aspectRatio: '1 / 1',
                        background: bgGrad,
                        borderRadius: '1px',
                        boxShadow:
                            'inset 0 2px 10px rgba(0,0,0,0.12), ' +
                            'inset 0 0 0 1px rgba(0,0,0,0.05)',
                        overflow: 'hidden',
                        zIndex: 2,
                    }}
                >
                    {/* 胶片颗粒纹理 — 密集柔和 */}
                    <div
                        style={{
                            position: 'absolute' as const,
                            inset: 0,
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23g)' opacity='0.06'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'repeat',
                            pointerEvents: 'none' as const,
                            zIndex: 6,
                            mixBlendMode: 'overlay' as const,
                        }}
                    />

                    {/* 照片光影 — 左上暖光 + 右下暗角 */}
                    <div
                        style={{
                            position: 'absolute' as const,
                            inset: 0,
                            background: `
                                linear-gradient(165deg, rgba(255,248,230,0.15) 0%, transparent 35%, transparent 55%, rgba(0,0,0,0.06) 100%),
                                radial-gradient(ellipse at 25% 25%, rgba(255,250,235,0.12) 0%, transparent 50%)
                            `,
                            pointerEvents: 'none' as const,
                            zIndex: 3,
                        }}
                    />

                    {/* 胶片色彩偏移 (微妙的暖色调覆盖) */}
                    <div
                        style={{
                            position: 'absolute' as const,
                            inset: 0,
                            background: 'linear-gradient(180deg, rgba(255,240,210,0.06) 0%, rgba(200,180,160,0.04) 100%)',
                            pointerEvents: 'none' as const,
                            zIndex: 4,
                            mixBlendMode: 'color' as const,
                        }}
                    />

                    {/* icon 居中显示 */}
                    {icon && (
                        <div
                            style={{
                                position: 'absolute' as const,
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '56px',
                                filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))',
                                zIndex: 5,
                                lineHeight: 1,
                            }}
                        >
                            {icon}
                        </div>
                    )}

                    {/* 暗角 (vignette) — 更柔和 */}
                    <div
                        style={{
                            position: 'absolute' as const,
                            inset: 0,
                            boxShadow: 'inset 0 0 50px rgba(0,0,0,0.10)',
                            pointerEvents: 'none' as const,
                            zIndex: 7,
                        }}
                    />
                </div>

                {/* ── 底部宽白边区域：手写文字 ── */}
                <div
                    style={{
                        position: 'relative' as const,
                        zIndex: 2,
                        marginTop: '18px',
                        padding: '0 8px',
                    }}
                >
                    {/* body 手写文字 */}
                    <div
                        style={{
                            color: textColor,
                            fontFamily,
                            fontSize: '15px',
                            lineHeight: '2',
                            textAlign: 'center' as const,
                            whiteSpace: 'pre-wrap' as const,
                            letterSpacing: '0.3px',
                            transform: 'rotate(0.5deg)',
                            minHeight: '36px',
                            display: 'flex',
                            flexDirection: 'column' as const,
                            justifyContent: 'center',
                            alignItems: 'center',
                            /* 钢笔墨水微晕效果 */
                            textShadow: `0.3px 0.2px 0.8px ${textColor}18`,
                        }}
                    >
                        {body?.trim()}
                    </div>

                    {/* footer */}
                    {footer && (
                        <div
                            style={{
                                marginTop: '8px',
                                fontSize: '10px',
                                color: accent,
                                fontFamily: "'Georgia', 'Noto Serif SC', serif",
                                letterSpacing: '0.18em',
                                textAlign: 'center' as const,
                                opacity: 0.50,
                                transform: 'rotate(0.5deg)',
                            }}
                        >
                            {footer}
                        </div>
                    )}
                </div>

                {/* ── 右下角微翘 ── */}
                <div
                    style={{
                        position: 'absolute' as const,
                        bottom: 0,
                        right: 0,
                        width: '50px',
                        height: '50px',
                        background:
                            'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.018) 50%, rgba(0,0,0,0.04) 100%)',
                        pointerEvents: 'none' as const,
                        zIndex: 3,
                    }}
                />

                {/* ── 左上角泛黄老化角 ── */}
                <div
                    style={{
                        position: 'absolute' as const,
                        top: 0,
                        left: 0,
                        width: '90px',
                        height: '90px',
                        background:
                            'radial-gradient(circle at 0% 0%, rgba(240,225,190,0.15) 0%, transparent 65%)',
                        pointerEvents: 'none' as const,
                        zIndex: 3,
                    }}
                />
            </div>
        </div>
    );
};

export default PolaroidSkeleton;
