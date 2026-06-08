/**
 * MusicPlayerSkeleton — 音乐播放器骨架
 *
 * 🎵 沉浸式听歌风 (网易云 + Apple Music 缝合体验)
 * 全景弥散光背景 + 毛玻璃顶层叠加 + 旋转黑胶唱片 + 拟真唱机指针
 */
import React from 'react';
import { StatusCardData } from '../../../types/statusCard';

const FONT_MAP: Record<string, string> = {
    serif: "'Noto Serif SC', 'Kaiti SC', STKaiti, serif",
    sans: "'Inter', 'Noto Sans SC', system-ui, sans-serif",
    handwrite: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
};

const MusicPlayerSkeleton: React.FC<{ data: StatusCardData }> = ({ data }) => {
    const { title, body, footer, icon, meta, style } = data;

    // 获取 AI 传过来的主要颜色，如果没有则用一套深邃色
    const color1 = style.bgGradient?.[0] || '#2c3e50';
    const color2 = style.bgGradient?.[1] || '#0f0f1a';
    
    // 文本颜色默认纯白
    const textColor = style.textColor || '#ffffff';
    // 进度条与高亮的基础色，默认纯白或者跟随主题参数
    const accent = style.accent || '#ffffff';
    const fontFamily = FONT_MAP[style.fontStyle || 'sans'];

    const artist = meta?.artist || body || '未知频率';
    const progress = Math.min(100, Math.max(0, meta?.progress ?? 38));
    const duration = meta?.duration || '4:30';

    const durationParts = duration.split(':');
    const totalSec = (parseInt(durationParts[0] || '4') * 60) + parseInt(durationParts[1] || '30');
    const currentSec = Math.round(totalSec * progress / 100);
    const currentTime = `${Math.floor(currentSec / 60)}:${String(currentSec % 60).padStart(2, '0')}`;

    // 唯一 ID 防样式冲突
    const uniqueId = React.useId().replace(/:/g, '');

    return (
        <div
            style={{
                width: '330px',
                maxWidth: 'calc(100vw - 48px)',
                background: '#121216', // 极深沉寂的底色
                color: textColor,
                fontFamily,
                borderRadius: '24px',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: `
                    0 10px 30px rgba(0,0,0,0.4),
                    0 24px 64px -10px ${color1}60,
                    inset 0 1px 1px rgba(255,255,255,0.2),
                    inset 0 0 0 1px rgba(255,255,255,0.06)
                `,
            }}
        >
            <style>{`
                @keyframes spin-${uniqueId} {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>

            {/* ── 1. 全景弥散毛玻璃光影底色 (Immersive Ambient Glow) ── */}
            <div style={{
                position: 'absolute',
                top: '-50%',
                left: '-50%',
                width: '200%',
                height: '200%',
                background: `
                    radial-gradient(ellipse at 40% 30%, ${color1} 0%, transparent 60%),
                    radial-gradient(ellipse at 60% 70%, ${color2} 0%, transparent 60%)
                `,
                filter: 'blur(70px)',
                opacity: 0.85,
                pointerEvents: 'none',
                zIndex: 0,
            }} />

            {/* ── 2. 毛玻璃遮罩底板与胶片颗粒噪点 ── */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.2)',
                backdropFilter: 'blur(24px)', // 类似 Apple Music 的极致柔焦
                WebkitBackdropFilter: 'blur(24px)',
                pointerEvents: 'none',
                zIndex: 1,
            }} />
            <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`,
                mixBlendMode: 'overlay',
                pointerEvents: 'none',
                zIndex: 1,
            }} />

            {/* ── 3. 拟真黑胶唱片区域 (Vinyl Record Player) ── */}
            <div style={{
                paddingTop: '60px',
                height: '220px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 2,
            }}>
                {/* 唱片底部弥散强光，用来凸显唱片边缘 */}
                <div style={{
                    position: 'absolute',
                    width: '190px',
                    height: '190px',
                    borderRadius: '50%',
                    background: `${color1}99`,
                    filter: 'blur(40px)',
                    zIndex: 2,
                }} />

                {/* 黑胶唱片 (旋转的实体) */}
                <div style={{
                    width: '185px',
                    height: '185px',
                    borderRadius: '50%',
                    background: '#111',
                    position: 'relative',
                    zIndex: 3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 12px 36px rgba(0,0,0,0.8), inset 0 1.5px 1px rgba(255,255,255,0.25), inset 0 -1.5px 2px rgba(0,0,0,0.8)',
                    animation: `spin-${uniqueId} 16s linear infinite`,
                    border: '4px solid rgba(255,255,255,0.04)' // 最外层轨道边框
                }}>
                    {/* 唱片切面高光环境反射 (静态/随环境走的反射) */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: `
                            conic-gradient(from 30deg,
                                transparent 0deg, rgba(255,255,255,0.07) 30deg, transparent 75deg,
                                transparent 180deg, rgba(255,255,255,0.07) 210deg, transparent 255deg
                            )
                        `,
                        pointerEvents: 'none',
                        zIndex: 2 // 压在纹理上面
                    }} />

                    {/* 唱片物理凹声轨纹理 (黑胶同心圆缝隙) */}
                    <div style={{ position: 'absolute', inset: '8px', borderRadius: '50%', border: '0.5px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 0 0 4px rgba(0,0,0,0.6)' }} />
                    <div style={{ position: 'absolute', inset: '16px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)' }} />
                    <div style={{ position: 'absolute', inset: '24px', borderRadius: '50%', border: '0.5px solid rgba(255,255,255,0.03)' }} />
                    <div style={{ position: 'absolute', inset: '34px', borderRadius: '50%', border: '0.5px solid rgba(255,255,255,0.06)' }} />
                    <div style={{ position: 'absolute', inset: '46px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 0 0 1px rgba(0,0,0,0.8)' }} />

                    {/* 中心专辑内页贴花 (Album Label) */}
                    <div style={{
                        width: '70px',
                        height: '70px',
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${color1}, ${color2})`,
                        position: 'relative',
                        boxShadow: '0 0 0 4px #0c0c0c, 0 0 10px rgba(0,0,0,0.8), inset 0 2px 4px rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1, // 纹理层之下
                    }}>
                        {icon && (
                            <span style={{
                                fontSize: '28px',
                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                            }}>
                                {icon}
                            </span>
                        )}
                        {/* 唱机轴心圆孔 */}
                        <div style={{
                            position: 'absolute',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: '#151515',
                            boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.8), 0 1px 1px rgba(255,255,255,0.3)',
                        }} />
                    </div>
                </div>

                {/* 唱机金属指针臂 (Tonearm) */}
                <div style={{
                    position: 'absolute',
                    top: '-15px',
                    left: '50%',
                    transform: 'translateX(28px) rotate(22deg)', // 指针落盘的角度
                    transformOrigin: '12px 12px',
                    width: '60px',
                    height: '110px',
                    zIndex: 4,
                    pointerEvents: 'none',
                    filter: 'drop-shadow(-8px 12px 16px rgba(0,0,0,0.5))'
                }}>
                    {/* 枢轴轴承 */}
                    <div style={{
                        position: 'absolute', top: '0', left: '0',
                        width: '24px', height: '24px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #e0e0e0, #a0a0a0, #666)',
                        boxShadow: 'inset 0 1px 2px #fff, 0 4px 6px rgba(0,0,0,0.4)',
                        border: '1px solid #777'
                    }}>
                        {/* 轴承中心小帽 */}
                        <div style={{
                            position: 'absolute', top: '6px', left: '6px', width: '10px', height: '10px',
                            borderRadius: '50%', background: 'linear-gradient(135deg, #555, #222)',
                            boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.8), 0 1px 1px rgba(255,255,255,0.4)'
                        }}/>
                    </div>
                    {/* 金属长杆 */}
                    <div style={{
                        position: 'absolute', top: '12px', left: '10px',
                        width: '5px', height: '65px',
                        background: 'linear-gradient(90deg, #d4d4d4 0%, #ffffff 30%, #909090 70%, #555555 100%)',
                        boxShadow: '-2px 0 4px rgba(0,0,0,0.3)',
                        transform: 'rotate(-4deg)',
                        transformOrigin: 'top center'
                    }} />
                    {/* 唱头底座外壳 */}
                    <div style={{
                        position: 'absolute', top: '75px', left: '2.5px',
                        width: '16px', height: '26px',
                        background: 'linear-gradient(135deg, #c0c0c0, #666)',
                        borderRadius: '3px',
                        transform: 'rotate(-10deg)',
                        boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset 0 1.5px 2px rgba(255,255,255,0.5)',
                        border: '1px solid #444'
                    }}>
                        {/* 唱针触排 */}
                        <div style={{
                            position: 'absolute', bottom: '-4px', left: '5px',
                            width: '4px', height: '8px', background: '#e0e0e0',
                            borderRadius: '1px', boxShadow: 'inset -1px 0 1px rgba(0,0,0,0.5)'
                        }} />
                        {/* 唱头侧面纹理线 */}
                        <div style={{ position: 'absolute', top: '6px', left: '2px', right: '2px', height: '1px', background: 'rgba(0,0,0,0.3)' }} />
                        <div style={{ position: 'absolute', top: '10px', left: '2px', right: '2px', height: '1px', background: 'rgba(0,0,0,0.3)' }} />
                    </div>
                </div>
            </div>

            {/* ── 4. Typography & Glassmorphism UI 控制区 ── */}
            <div style={{
                padding: '16px 30px 24px',
                position: 'relative',
                zIndex: 4, // 必须在毛玻璃和旋转指针之上
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center'
            }}>
                {/* 歌曲与歌手信息 */}
                <div style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    letterSpacing: '0.8px',
                    lineHeight: 1.2,
                    marginBottom: '6px',
                    width: '100%',
                    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {title || '未知频率'}
                </div>

                <div style={{
                    fontSize: '13px',
                    opacity: 0.65,
                    letterSpacing: '1px',
                    marginBottom: '26px',
                    textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                    maxWidth: '85%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {artist}
                </div>

                {/* 纤细的毛玻璃光影进度条 */}
                <div style={{ width: '100%', marginBottom: '24px' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        color: textColor,
                        opacity: 0.5,
                        marginBottom: '10px',
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: "'Inter', 'SF Mono', system-ui, monospace",
                        textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                        letterSpacing: '0.5px'
                    }}>
                        <span>{currentTime}</span>
                        <span>{duration}</span>
                    </div>

                    {/* Progress Track */}
                    <div style={{
                        width: '100%',
                        height: '4px',
                        borderRadius: '2px',
                        background: 'rgba(255,255,255,0.1)',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
                        position: 'relative',
                    }}>
                        {/* Progress Fill */}
                        <div style={{
                            width: `${progress}%`,
                            height: '100%',
                            borderRadius: '2px',
                            background: accent,
                            boxShadow: `0 0 10px ${accent}80`,
                            position: 'relative',
                        }}>
                            {/* Glowing Dot */}
                            <div style={{
                                position: 'absolute',
                                right: '-5px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: '#fff',
                                boxShadow: `0 2px 6px rgba(0,0,0,0.5), 0 0 0 3px rgba(255,255,255,0.2)`
                            }} />
                        </div>
                    </div>
                </div>

                {/* 全玻璃态的交互大按钮 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '28px',
                    width: '100%',
                }}>
                    {/* 上一首 (Previous) */}
                    <div style={{
                        width: '32px', height: '32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: textColor, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                        opacity: 0.6
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                        </svg>
                    </div>

                    {/* 播放/暂停大按钮 (Frosted Blur Circle) */}
                    <div style={{
                        width: '68px',
                        height: '68px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.15)', // 半透明白玻
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255,255,255,0.25)', // 玻璃高光边
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.4)',
                        color: textColor,
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '4px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </div>

                    {/* 下一首 (Next) */}
                    <div style={{
                        width: '32px', height: '32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: textColor, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                        opacity: 0.6
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6z"/>
                        </svg>
                    </div>
                </div>
            </div>

            {/* ── Footer ── */}
            {footer && (
                <div style={{
                    padding: '0 28px 24px',
                    textAlign: 'center',
                    fontSize: '10px',
                    color: textColor,
                    opacity: 0.35,
                    letterSpacing: '1px',
                    fontFamily: "'Inter', system-ui, sans-serif",
                    position: 'relative',
                    zIndex: 4,
                    textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                }}>
                    — {footer} —
                </div>
            )}
            {!footer && <div style={{ height: '16px' }} />}
        </div>
    );
};

export default MusicPlayerSkeleton;
