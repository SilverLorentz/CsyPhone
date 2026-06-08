/**
 * StickyNoteSkeleton — 便签/便利贴骨架
 *
 * 🖋️ 高级质感风 — 莫兰迪低饱和底色、真实纸张纹理、
 * 极简拉丝金属图钉、多层柔和深色悬浮投影、真实的光影翘角
 */
import React from 'react';
import { StatusCardData } from '../../../types/statusCard';

const FONT_MAP: Record<string, string> = {
    serif: "'Noto Serif SC', 'Kaiti SC', STKaiti, serif",
    sans: "'Inter', 'Noto Sans SC', system-ui, sans-serif",
    handwrite: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
};

/* ── 高级感莫兰迪色系 (Premium Morandi Palettes) ── */
const PREMIUM_PALETTES = [
    { base: '#FCFAF6', end: '#F4EFE6', accent: '#C8B8A0', text: '#50463C' },  // 奶油象牙白 (Cream Ivory)
    { base: '#FCF7F7', end: '#F3E9E9', accent: '#D2A1A1', text: '#644848' },  // 玫瑰灰粉 (Dusty Rose)
    { base: '#F6F9F6', end: '#EAF0EB', accent: '#A0BCA6', text: '#485C4E' },  // 鼠尾草绿 (Sage Green)
    { base: '#F5F8FA', end: '#E9EEF4', accent: '#A1B7CE', text: '#465362' },  // 迷雾蓝灰 (Mist Blue)
    { base: '#F9F7FA', end: '#EFEBF3', accent: '#B4A2CC', text: '#584E64' },  // 芋泥紫灰 (Lavender Ash)
];

const StickyNoteSkeleton: React.FC<{ data: StatusCardData }> = ({ data }) => {
    const { title, body, footer, icon, style } = data;

    /* 颜色分配逻辑 */
    const hashCode = (body || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const palette = PREMIUM_PALETTES[hashCode % PREMIUM_PALETTES.length];

    const baseColor = style.bgGradient?.[0] || palette.base;
    const endColor = style.bgGradient?.[1] || palette.end;
    const bgStyle = `linear-gradient(160deg, ${baseColor} 0%, ${endColor} 100%)`;

    const textColor = style.textColor || palette.text;
    const accent = style.accent || palette.accent;
    const fontFamily = FONT_MAP[style.fontStyle || 'handwrite'];

    return (
        <div style={{
            width: '280px',
            maxWidth: 'calc(100vw - 48px)',
            position: 'relative',
            transform: 'rotate(1deg)',
            // 多层柔和物理阴影，取代单层死板阴影
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.03)) drop-shadow(0 12px 24px rgba(0,0,0,0.05)) drop-shadow(0 24px 48px rgba(0,0,0,0.06))',
        }}>
            {/* ── 📌 高级拉丝金属图钉 (Minimalist Metal Pin) ── */}
            <div style={{
                position: 'absolute',
                top: '-12px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 4,
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, 
                    #F5F5F7 0%, 
                    #D1D1D6 40%, 
                    #B0B0B8 60%, 
                    #8E8E93 100%)`,
                boxShadow: `
                    0 4px 6px rgba(0,0,0,0.15),
                    0 1px 3px rgba(0,0,0,0.18),
                    inset 0 1px 1px rgba(255,255,255,0.7),
                    inset 0 -1px 2px rgba(0,0,0,0.2)
                `,
            }}>
                {/* 金属图钉高光反射 */}
                <div style={{
                    position: 'absolute',
                    top: '2px',
                    left: '3px',
                    width: '6px',
                    height: '4px',
                    borderRadius: '50%',
                    background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 70%)',
                    transform: 'rotate(-45deg)',
                }} />
                {/* 金属图钉针扣 (底层连接) */}
                <div style={{
                    position: 'absolute',
                    bottom: '-4px',
                    left: '7px',
                    width: '4px',
                    height: '6px',
                    background: 'linear-gradient(90deg, #999, #ddd, #888)',
                    zIndex: -1,
                    boxShadow: '1px 3px 4px rgba(0,0,0,0.3)'
                }} />
                {/* 金属图钉内同心圆环理 (拉丝质感) */}
                <div style={{
                    position: 'absolute',
                    top: '2px', left: '2px', right: '2px', bottom: '2px',
                    borderRadius: '50%',
                    border: '0.5px solid rgba(255,255,255,0.15)',
                    boxShadow: 'inset 0 0 2px rgba(0,0,0,0.1)'
                }} />
            </div>

            {/* ── 图钉顶层投射的真实阴影 ── */}
            <div style={{
                position: 'absolute',
                top: '4px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '18px',
                height: '24px',
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.08)',
                filter: 'blur(3px)',
                zIndex: 2,
            }} />

            {/* ── 便签主体 ── */}
            <div style={{
                background: bgStyle,
                color: textColor,
                fontFamily,
                padding: '36px 26px 28px',
                minHeight: '220px',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '2px 3px 6px 3px',
                display: 'flex',
                flexDirection: 'column' as const,
                boxShadow: `
                    inset 0 1px 0 rgba(255,255,255,0.8),
                    inset 1px 0 0 rgba(255,255,255,0.4),
                    inset -1px 0 0 rgba(0,0,0,0.01)
                `,
            }}>
                {/* ── 高级棉制纸张纤维纹理层 ── */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.045, // 降低噪点，更柔和
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    backgroundSize: '200px 200px',
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                    mixBlendMode: 'multiply' as const,
                }} />

                {/* ── 全局柔光与色彩过渡层 (更立体的纸张光影) ── */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(circle at 75% 15%, rgba(255,255,255,0.45) 0%, transparent 65%)',
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                }} />
                
                {/* ── 纸张微弱起伏暗影 (模拟不平整) ── */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(105deg, transparent 20%, rgba(0,0,0,0.012) 45%, transparent 75%)',
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                }} />

                {/* ── 上缘微厚度阴影 (便笺本撕下来的痕迹感) ── */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '16px',
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.025) 0%, transparent 100%)',
                    pointerEvents: 'none' as const,
                    zIndex: 1,
                }} />

                {/* ── 右下角翘角折痕重构 (更真实的平滑曲面) ── */}
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: '65px',
                    height: '65px',
                    background: `linear-gradient(225deg, 
                        rgba(0,0,0,0.07) 0%, 
                        rgba(0,0,0,0.015) 30%, 
                        transparent 45%)`,
                    pointerEvents: 'none' as const,
                    zIndex: 2,
                    borderBottomRightRadius: '6px',
                }} />
                {/* 翘起的反面颜色，带有高光 */}
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: '28px',
                    height: '28px',
                    background: `linear-gradient(225deg, 
                        ${endColor} 0%, 
                        #FFFFFF 30%,
                        rgba(0,0,0,0.06) 45%,
                        transparent 50%)`,
                    boxShadow: '-1px -1px 3px rgba(0,0,0,0.03)',
                    pointerEvents: 'none' as const,
                    zIndex: 2,
                    borderTopLeftRadius: '2px',
                }} />

                {/* ── 标题区域 ── */}
                {title && (
                    <div style={{
                        fontSize: '17px',
                        fontWeight: 600,
                        marginBottom: '10px',
                        letterSpacing: '0.8px',
                        position: 'relative',
                        zIndex: 3,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: textColor,
                        textShadow: `0 0 1px ${textColor}20`,
                    }}>
                        {icon && <span style={{ fontSize: '18px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))' }}>{icon}</span>}
                        <span>{title}</span>
                    </div>
                )}

                {/* ── 极简装饰留白/分割 ── */}
                {title && (
                    <div style={{
                        width: '32px',
                        height: '2px',
                        background: `${accent}95`,
                        borderRadius: '1px',
                        marginBottom: '16px',
                        position: 'relative',
                        zIndex: 3,
                        boxShadow: `0 1px 2px ${accent}25`
                    }} />
                )}

                {/* 如果没有标题，但有icon，单独展示，微调质感 */}
                {!title && icon && (
                    <div style={{
                        fontSize: '28px',
                        marginBottom: '16px',
                        position: 'relative',
                        zIndex: 3,
                        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.12))',
                    }}>
                        {icon}
                    </div>
                )}

                {/* ── 主体内容 ── */}
                <div style={{
                    fontSize: '16px',
                    lineHeight: '1.9',
                    whiteSpace: 'pre-wrap' as const,
                    flex: 1,
                    position: 'relative',
                    zIndex: 3,
                    wordBreak: 'break-word' as const,
                    letterSpacing: '0.4px',
                    /* 增加真实的墨水渗入纸张效果 */
                    textShadow: `
                        0.2px 0.2px 0.5px ${textColor}30,
                        -0.1px -0.1px 0.3px rgba(255,255,255,0.4)
                    `,
                }}>
                    {body}
                </div>

                {/* ── 底部签名/日期 ── */}
                {footer && (
                    <div style={{
                        fontSize: '12px',
                        opacity: 0.55,
                        marginTop: '24px',
                        textAlign: 'right' as const,
                        position: 'relative',
                        zIndex: 3,
                        letterSpacing: '1px',
                        fontFamily: "'Georgia', 'Noto Serif SC', serif",
                    }}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StickyNoteSkeleton;
