/**
 * SocialPostSkeleton — 社交动态骨架
 *
 * 💬 Native App 级极简主义 — 克制的留白、纯粹的色彩、
 * 平滑的苹果阴影 (Smooth Corners & Shadow)、原生的 Typography 比例
 */
import React,{ useMemo } from 'react';
import { StatusCardData } from '../../../types/statusCard';

const FONT_MAP: Record<string, string> = {
    serif: "'Noto Serif SC', 'Kaiti SC', STKaiti, serif",
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    handwrite: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif",
    mono: "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace",
};

/* 数字格式化 (e.g., 1.5K) */
const formatNum = (n: number) => n >= 1000 ? `${(Math.floor(n / 100) / 10).toFixed(1)}k` : String(n);

const SocialPostSkeleton: React.FC<{ data: StatusCardData }> = ({ data }) => {
    const { title, body, footer, icon, meta, style } = data;

    // 智能推断暗色模式
    const isDark = style.mood === 'dark' || (style.bgGradient && style.bgGradient[0].match(/^#[0-3]/));

    /* 
     * 极简、原生的背景底色 
     * 彻底摒弃杂乱的线性渐变，采用纯粹色彩与微弱的反光质感边框
     */
    const bgColor = isDark ? '#000000' : '#FFFFFF';
    const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
    
    // 超级平滑的多级环境阴影 (Apple / Twitter Native UI 风格)
    const cardShadow = isDark 
        ? `0 12px 32px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.06)` 
        : `
          0 4px 12px rgba(0,0,0,0.04),
          0 12px 32px -4px rgba(0,0,0,0.08),
          0 24px 48px -12px rgba(0,0,0,0.04)
        `;

    // 文字颜色：采用绝对的黑白+高透明度，而非生硬带色相的灰
    const textPrimary = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.95)';
    const textSecondary = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
    
    const accent = style.accent || '#1D9BF0'; // Twitter Blue
    const heartActiveColor = '#F91880';
    
    const fontFamily = FONT_MAP[style.fontStyle || 'sans'];

    const { likes, comments, shares, isLiked } = useMemo(() => {
        const _likes = meta?.likes ?? Math.floor(Math.random() * 800 + 10);
        return {
            likes: _likes,
            comments: meta?.comments ?? Math.floor(Math.random() * 80 + 2),
            shares: meta?.shares ?? Math.floor(Math.random() * 50),
            isLiked: _likes % 2 !== 0, // 增加随机点赞状态
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const avatar = meta?.avatar || icon || '🐱';
    const username = title ? title.toLowerCase().replace(/\s+/g, '_') : 'status_update';

    return (
        <div
            style={{
                width: '340px', // Native 卡片通常稍宽，视觉更大气
                maxWidth: 'calc(100vw - 32px)',
                background: bgColor,
                color: textPrimary,
                fontFamily,
                borderRadius: '16px', // 苹果标准的圆角
                border: `1px solid ${borderColor}`, // 极细边框增加物理切边感
                boxShadow: cardShadow,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                textRendering: 'optimizeLegibility', // 开启高质量字距渲染
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
            }}
        >
            {/* ── Header: Avatar, Name & Meta ── */}
            <div style={{
                padding: '20px 20px 10px 20px', // 更呼吸感的留白
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
            }}>
                {/* 1. 头像区区：干净，去除了廉价的渐变环 */}
                <div style={{
                    position: 'relative',
                    width: '44px',
                    height: '44px',
                    flexShrink: 0,
                    borderRadius: '50%',
                    background: isDark ? '#1a1a1a' : '#f5f5f5', // 原生底漆色
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    boxShadow: `inset 0 0 0 1px ${borderColor}`, // 内阴影充当线框
                    overflow: 'hidden',
                }}>
                    {avatar}
                    {/* 微弱的头像高光覆盖层 */}
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'linear-gradient(to bottom, rgba(255,255,255,0.06), transparent)',
                    }}/>
                </div>

                {/* 2. 姓名与账号 (Typography Hierarchy) */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '2px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                                fontSize: '15px',
                                fontWeight: 700,
                                letterSpacing: '-0.3px', // 原生系统紧凑字距
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                maxWidth: '140px'
                            }}>
                                {title || '匿名用户'}
                            </span>
                            {/* Native Verified Badge */}
                            <svg width="15" height="15" viewBox="0 0 24 24" fill={accent} style={{ flexShrink: 0 }}>
                                <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.918-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.337 2.25c-.416-.165-.866-.25-1.336-.25-2.21 0-3.918 1.792-3.918 4 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.46.746 2.75 1.87 3.45-.098.346-.152.712-.152 1.09 0 2.21 1.71 4 3.918 4 .58 0 1.13-.15 1.616-.41 1.252 1.05 2.85 1.69 4.58 1.69 1.73 0 3.328-.64 4.58-1.69.486.26 1.036.41 1.616.41 2.21 0 3.918-1.792 3.918-4 0-.378-.054-.744-.152-1.09 1.124-.7 1.87-1.99 1.87-3.45zm-10.42 5.01-4.88-4.88 1.768-1.767 3.112 3.11 7.356-7.355 1.767 1.768-9.123 9.124z" />
                            </svg>
                        </div>

                        {/* Options / More 按钮放在最右上角，弱化存在感 */}
                        <div style={{ color: textSecondary, opacity: 0.5 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="5" cy="12" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="19" cy="12" r="1.5" />
                            </svg>
                        </div>
                    </div>

                    <div style={{
                        fontSize: '14px', // 放大手柄字体
                        color: textSecondary,
                        display: 'flex',
                        alignItems: 'center',
                        letterSpacing: '-0.1px',
                    }}>
                        <span>@{username}</span>
                        <span style={{ margin: '0 4px', fontSize: '10px', opacity: 0.5 }}>•</span>
                        <span>now</span>
                    </div>
                </div>
            </div>

            {/* ── Body Content ── */}
            <div style={{
                padding: '4px 20px 14px 20px',
                fontSize: '16px', // 主正文字号增大，增加阅读舒适性
                lineHeight: '1.45', // Native 一般不会超过 1.5，显得利落
                whiteSpace: 'pre-wrap' as const,
                wordBreak: 'break-word',
                letterSpacing: '-0.15px',
            }}>
                {body}
            </div>

            {/* ── Optional Footer (Location, Datetime info) ── */}
            {footer && (
                <div style={{
                    padding: '0 20px 14px 20px',
                    fontSize: '13px',
                    color: textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                }}>
                    {footer}
                </div>
            )}

            {/* ── Hairline Divider — 极细实线分隔线 ── */}
            <div style={{
                height: '0.5px', // 真实的极细线
                background: borderColor,
                margin: '0', 
            }} />

            {/* ── Engagement Bar — Native Iconography ── */}
            <div style={{
                padding: '12px 20px 14px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                color: textSecondary,
                fontSize: '13px',
                fontWeight: 600, // 稍微加粗互动数字，平衡视觉
            }}>
                {/* 💬 Reply */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                    </svg>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNum(comments)}</span>
                </div>

                {/* 🔄 Retweet */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 1l4 4-4 4"/>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                        <path d="M7 23l-4-4 4-4"/>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                    </svg>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNum(shares)}</span>
                </div>

                {/* ❤️ Like */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: isLiked ? heartActiveColor : 'inherit',
                    cursor: 'pointer',
                }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? heartActiveColor : 'none'} stroke={isLiked ? heartActiveColor : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNum(likes)}</span>
                </div>

                {/* 📤 Share/Bookmark */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                        <polyline points="16 6 12 2 8 6"/>
                        <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                </div>
            </div>
        </div>
    );
};

export default SocialPostSkeleton;
