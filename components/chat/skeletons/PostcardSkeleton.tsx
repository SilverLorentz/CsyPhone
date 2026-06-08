/**
 * PostcardSkeleton — 明信片骨架
 *
 * 🏛️ 复古文艺风 — 厚实奶油卡纸、做旧暖色调、
 * 精致邮戳、邮票装饰区、手写感排版、复古装饰线
 */
import React from 'react';
import { StatusCardData } from '../../../types/statusCard';

const FONT_MAP: Record<string, string> = {
    serif: "'Noto Serif SC', 'Kaiti SC', STKaiti, serif",
    sans: "'Inter', 'Noto Sans SC', system-ui, sans-serif",
    handwrite: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
};

const PostcardSkeleton: React.FC<{ data: StatusCardData }> = ({ data }) => {
    const { title, body, footer, icon, style } = data;

    const bgGrad = style.bgGradient
        ? `linear-gradient(135deg, ${style.bgGradient[0]}, ${style.bgGradient[1]})`
        : 'linear-gradient(135deg, #D4C4A8, #C8B494, #BEA888)';
    const textColor = style.textColor || '#3D3425';
    const accent = style.accent || '#8C7B65';
    const fontFamily = FONT_MAP[style.fontStyle || 'handwrite'];

    /* 邮戳圆环 SVG — 更精致的双圈虚线 + 细节 */
    const postmarkSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='76' height='76' viewBox='0 0 76 76'%3E%3Ccircle cx='38' cy='38' r='32' fill='none' stroke='${encodeURIComponent(accent)}' stroke-width='1.8' stroke-dasharray='5 3' opacity='0.50'/%3E%3Ccircle cx='38' cy='38' r='24' fill='none' stroke='${encodeURIComponent(accent)}' stroke-width='1' opacity='0.35'/%3E%3Ccircle cx='38' cy='38' r='16' fill='none' stroke='${encodeURIComponent(accent)}' stroke-width='0.6' opacity='0.20'/%3E%3Cline x1='6' y1='38' x2='70' y2='38' stroke='${encodeURIComponent(accent)}' stroke-width='0.8' opacity='0.22'/%3E%3Cline x1='6' y1='32' x2='70' y2='32' stroke='${encodeURIComponent(accent)}' stroke-width='0.5' opacity='0.15'/%3E%3Cline x1='6' y1='44' x2='70' y2='44' stroke='${encodeURIComponent(accent)}' stroke-width='0.5' opacity='0.15'/%3E%3C/svg%3E")`;

    return (
        <div
            style={{
                width: '330px',
                maxWidth: 'calc(100vw - 48px)',
                /* 奶油厚卡纸底色 — 温暖的米白而非纯白 */
                background: 'linear-gradient(172deg, #FAF6EE 0%, #F5EFE2 40%, #F0E8D8 100%)',
                borderRadius: '3px',
                boxShadow:
                    '0 2px 4px rgba(0,0,0,0.06), ' +
                    '0 8px 18px rgba(0,0,0,0.08), ' +
                    '0 22px 44px -8px rgba(0,0,0,0.18), ' +
                    '0 36px 60px -14px rgba(0,0,0,0.14), ' +
                    'inset 0 0 0 1px rgba(255,255,255,0.75)',
                transform: 'rotate(-1.5deg)',
                padding: '14px',
                paddingBottom: '22px',
                position: 'relative' as const,
                overflow: 'hidden',
            }}
        >
            {/* ── 卡纸纹理 (较粗纤维) ── */}
            <div
                style={{
                    position: 'absolute' as const,
                    inset: 0,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.60' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.10'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'repeat',
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                    mixBlendMode: 'multiply' as const,
                }}
            />

            {/* ── 纸张纤维方向（细微条纹） ── */}
            <div
                style={{
                    position: 'absolute' as const,
                    inset: 0,
                    opacity: 0.018,
                    backgroundImage: `repeating-linear-gradient(
                        92deg,
                        transparent,
                        transparent 4px,
                        rgba(120,100,60,0.4) 4px,
                        rgba(120,100,60,0.4) 4.5px
                    )`,
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                }}
            />

            {/* ── 图片区域 (渐变色块, 4:3) ── */}
            <div
                style={{
                    position: 'relative' as const,
                    width: '100%',
                    aspectRatio: '4 / 3',
                    background: bgGrad,
                    borderRadius: '1.5px',
                    boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.10), inset 0 0 0 1px rgba(0,0,0,0.06)',
                    border: '1px solid rgba(0,0,0,0.05)',
                    overflow: 'hidden',
                    zIndex: 2,
                }}
            >
                {/* 邮戳装饰 */}
                <div
                    style={{
                        position: 'absolute' as const,
                        top: '10px',
                        right: '10px',
                        width: '76px',
                        height: '76px',
                        backgroundImage: postmarkSvg,
                        backgroundSize: 'contain',
                        backgroundRepeat: 'no-repeat',
                        transform: 'rotate(15deg)',
                        opacity: 0.75,
                    }}
                />

                {/* 邮票装饰区域（右上角偏下） */}
                <div
                    style={{
                        position: 'absolute' as const,
                        top: '8px',
                        right: '8px',
                        width: '38px',
                        height: '46px',
                        /* 齿孔边框效果 — 用 radial-gradient 模拟 */
                        background: `
                            radial-gradient(circle, transparent 3px, rgba(255,250,240,0.9) 3px) 0 0 / 8px 8px,
                            linear-gradient(135deg, ${accent}20, ${accent}40)
                        `,
                        borderRadius: '1px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.08)',
                        zIndex: 2,
                    }}
                >
                    {icon || '✉️'}
                </div>

                {/* icon 居中于图片区 — 当有邮票时显示在左下 */}
                {icon && (
                    <div
                        style={{
                            position: 'absolute' as const,
                            bottom: '14px',
                            left: '14px',
                            fontSize: '28px',
                            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))',
                        }}
                    >
                        {icon}
                    </div>
                )}

                {/* 照片光泽 */}
                <div
                    style={{
                        position: 'absolute' as const,
                        inset: 0,
                        background: `
                            radial-gradient(ellipse at 25% 65%, rgba(255,255,255,0.08) 0%, transparent 55%),
                            radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.05) 0%, transparent 50%),
                            linear-gradient(170deg, rgba(255,250,235,0.08) 0%, transparent 30%)
                        `,
                        pointerEvents: 'none' as const,
                    }}
                />

                {/* 老照片颗粒 */}
                <div style={{
                    position: 'absolute' as const,
                    inset: 0,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3'/%3E%3C/filter%3E%3Crect width='80' height='80' filter='url(%23g)' opacity='0.04'/%3E%3C/svg%3E")`,
                    mixBlendMode: 'overlay' as const,
                    pointerEvents: 'none' as const,
                }} />
            </div>

            {/* ── INNER VOICE 标题 — 精致装饰线 ── */}
            <div
                style={{
                    width: '100%',
                    marginTop: '22px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    zIndex: 2,
                    position: 'relative' as const,
                }}
            >
                {/* 左装饰线 — 渐变淡出 */}
                <div style={{
                    flex: 1,
                    maxWidth: '55px',
                    height: '0.5px',
                    background: `linear-gradient(90deg, transparent, ${accent}60)`,
                }} />
                {/* 左菱形 */}
                <div style={{
                    width: '4px',
                    height: '4px',
                    transform: 'rotate(45deg)',
                    background: `${accent}45`,
                }} />
                <div
                    style={{
                        fontSize: '9px',
                        letterSpacing: '0.5em',
                        color: accent,
                        textTransform: 'uppercase' as const,
                        fontFamily: "'Georgia', 'Noto Serif SC', serif",
                        fontWeight: 400,
                        opacity: 0.85,
                    }}
                >
                    Inner Voice
                </div>
                {/* 右菱形 */}
                <div style={{
                    width: '4px',
                    height: '4px',
                    transform: 'rotate(45deg)',
                    background: `${accent}45`,
                }} />
                {/* 右装饰线 */}
                <div style={{
                    flex: 1,
                    maxWidth: '55px',
                    height: '0.5px',
                    background: `linear-gradient(90deg, ${accent}60, transparent)`,
                }} />
            </div>

            {/* ── 正文 ── */}
            <div
                style={{
                    color: textColor,
                    fontSize: '15px',
                    lineHeight: '2.15',
                    fontFamily,
                    letterSpacing: '0.5px',
                    textAlign: 'center' as const,
                    whiteSpace: 'pre-wrap' as const,
                    minHeight: '48px',
                    display: 'flex',
                    flexDirection: 'column' as const,
                    justifyContent: 'center',
                    padding: '0 14px',
                    zIndex: 2,
                    position: 'relative' as const,
                    /* 墨水手写感 */
                    textShadow: `0.2px 0.15px 0.5px ${textColor}10`,
                }}
            >
                {body?.trim()}
            </div>

            {/* ── 底部 — Vol.XX / Date (精致双线分隔) ── */}
            {footer && (
                <div
                    style={{
                        width: '100%',
                        marginTop: '20px',
                        paddingTop: '14px',
                        /* 双线效果 */
                        borderTop: `0.5px solid ${accent}20`,
                        boxShadow: `0 -2px 0 0 transparent, 0 -1px 0 0 ${accent}10`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        zIndex: 2,
                        position: 'relative' as const,
                    }}
                >
                    <span
                        style={{
                            fontSize: '8px',
                            color: accent,
                            fontFamily: "'Georgia', serif",
                            letterSpacing: '0.25em',
                            textTransform: 'uppercase' as const,
                            opacity: 0.60,
                        }}
                    >
                        {title || 'Vol.∞'}
                    </span>
                    <span
                        style={{
                            fontSize: '8px',
                            color: accent,
                            fontFamily: "'Georgia', serif",
                            letterSpacing: '0.25em',
                            textTransform: 'uppercase' as const,
                            opacity: 0.60,
                        }}
                    >
                        {footer}
                    </span>
                </div>
            )}

            {/* ── 右下角厚卡纸微翘 ── */}
            <div
                style={{
                    position: 'absolute' as const,
                    bottom: 0,
                    right: 0,
                    width: '44px',
                    height: '44px',
                    background:
                        'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.02) 50%, rgba(0,0,0,0.045) 100%)',
                    pointerEvents: 'none' as const,
                    zIndex: 3,
                }}
            />

            {/* ── 边缘做旧晕染 ── */}
            <div style={{
                position: 'absolute' as const,
                inset: 0,
                background: 'radial-gradient(ellipse at center, transparent 55%, rgba(180,160,120,0.06) 100%)',
                pointerEvents: 'none' as const,
                zIndex: 1,
            }} />
        </div>
    );
};

export default PostcardSkeleton;
