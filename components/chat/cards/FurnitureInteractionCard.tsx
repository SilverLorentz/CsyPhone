import React from 'react';
import { Message } from '../../../types';

/**
 * FurnitureInteractionCard — 莫兰迪色系流动磨砂渐变互动反馈卡片
 *
 * Renders when metadata.source === 'room' && metadata.roomEvent === 'item_interaction'.
 * Purely presentational — consumes only Message.metadata, zero external state.
 *
 * Design philosophy:
 *   - Morandi low-saturation palette (warm rose → cool lavender)
 *   - Flowing gradient animation (slow rotation of gradient angle)
 *   - Frosted glass (backdrop-blur) with inner glow border
 *   - Extra-large border-radius (20px) to differentiate from all other cards
 *   - Gentle float-in entrance animation
 */

// ─── Inline keyframes (injected once via <style>) ─────────────────────────
const STYLE_ID = 'furniture-interaction-card-styles';

const injectStyles = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        @keyframes fi-gradient-flow {
            0%   { background-position: 0% 50%; }
            50%  { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        @keyframes fi-float-in {
            0%   { opacity: 0; transform: translateY(10px) scale(0.97); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fi-icon-pulse {
            0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px rgba(180,160,170,0.4)); }
            50%      { transform: scale(1.08); filter: drop-shadow(0 0 8px rgba(180,160,170,0.6)); }
        }
    `;
    document.head.appendChild(style);
};

// ─── Macaron Color Palette ─────────────────────────────────────────────────
// Low-saturation, dreamy macaron tones (mint, lavender, peach, baby blue)
const MACARON = {
    // Background gradient stops (flowing, very subtle and slightly translucent)
    gradientBg: 'linear-gradient(135deg, rgba(230, 246, 244, 0.7), rgba(244, 235, 250, 0.65), rgba(254, 240, 241, 0.7), rgba(232, 244, 252, 0.65))',
    // Text (Needs to be a bit darker for legibility on light background, using soft grey-purples)
    textPrimary: 'rgba(110, 100, 120, 0.85)',
    textSecondary: 'rgba(140, 130, 150, 0.8)',
    textMuted: 'rgba(160, 150, 170, 0.6)',
    // Border & glow
    innerGlow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
    ambientShadow: '0 4px 20px rgba(180, 170, 190, 0.15), 0 1px 4px rgba(0, 0, 0, 0.03)',
    // Icon glow
    iconGlow: 'drop-shadow(0 0 8px rgba(255, 230, 240, 0.6))',
};

// ─── Component ─────────────────────────────────────────────────────────────

interface FurnitureInteractionCardProps {
    message: Message;
}

const FurnitureInteractionCard: React.FC<FurnitureInteractionCardProps> = ({ message }) => {
    // Inject keyframe styles on first render
    React.useEffect(() => { injectStyles(); }, []);

    const meta = message.metadata || {};

    // Extract furniture info from metadata (graceful fallback)
    const furnitureName: string = meta.furnitureName || '';
    const furnitureIcon: string = meta.furnitureIcon || '';

    // Parse the content to extract description and reaction
    // Content format: "[用户]在[角色]的xxx上看到了：description。[角色]表示：reaction"
    const content = message.content || '';
    const descriptionMatch = content.match(/看到了[：:]\s*(.*?)[。.]\s*\[/);
    const reactionMatch = content.match(/表示[：:]\s*(.*)/);

    const description = descriptionMatch?.[1]?.trim() || '';
    const reaction = reactionMatch?.[1]?.trim() || content.replace(/^\[.*?\]/, '').trim();

    // Determine if icon is an image URL or emoji
    const isImageIcon = furnitureIcon && (furnitureIcon.startsWith('http') || furnitureIcon.startsWith('data'));

    // Timestamp
    const dateObj = new Date(message.timestamp);
    const timeStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;

    return (
        <div
            className="furniture-interaction-card w-[88%] max-w-[320px] mx-auto select-none my-1.5"
            style={{
                animation: 'fi-float-in 0.7s ease-out both',
            }}
        >
            <div
                className="relative overflow-hidden"
                style={{
                    borderRadius: '20px',
                    background: MACARON.gradientBg,
                    backgroundSize: '300% 300%',
                    animation: 'fi-gradient-flow 8s ease infinite',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: `${MACARON.innerGlow}, ${MACARON.ambientShadow}`,
                    padding: '16px 18px 14px',
                }}
            >
                {/* Subtle ambient light leak — top-right */}
                <div
                    className="absolute top-0 right-0 w-28 h-28 pointer-events-none"
                    style={{
                        background: 'radial-gradient(circle at 80% 20%, rgba(220,210,215,0.35), transparent 65%)',
                        filter: 'blur(10px)',
                    }}
                />

                {/* Fine grain texture overlay */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.025]"
                    style={{
                        backgroundImage: 'radial-gradient(circle, #000 0.25px, transparent 0.25px)',
                        backgroundSize: '5px 5px',
                    }}
                />

                {/* ── Icon + Furniture name header ── */}
                <div className="flex items-center gap-2.5 mb-3 relative z-10">
                    {/* Furniture icon with soft glow pulse */}
                    {furnitureIcon && (
                        <div
                            className="shrink-0"
                            style={{
                                animation: 'fi-icon-pulse 4s ease-in-out infinite',
                            }}
                        >
                            {isImageIcon ? (
                                <img
                                    src={furnitureIcon}
                                    alt=""
                                    className="w-8 h-8 object-contain"
                                    style={{ filter: MACARON.iconGlow }}
                                    draggable={false}
                                />
                            ) : (
                                <span
                                    className="text-2xl leading-none"
                                    style={{ filter: MACARON.iconGlow }}
                                >
                                    {furnitureIcon}
                                </span>
                            )}
                        </div>
                    )}

                    <div className="flex-1 min-w-0">
                        {furnitureName && (
                            <div
                                className="text-[11px] font-medium tracking-wide truncate"
                                style={{ color: MACARON.textPrimary }}
                            >
                                {furnitureName}
                            </div>
                        )}
                        <div
                            className="text-[9px] tracking-wider"
                            style={{ color: MACARON.textMuted }}
                        >
                            轻触 · {timeStr}
                        </div>
                    </div>
                </div>

                {/* ── Description — what is observed ── */}
                {description && (
                    <div
                        className="text-[11.5px] leading-[20px] mb-2.5 relative z-10 italic"
                        style={{
                            color: MACARON.textSecondary,
                            fontStyle: 'italic',
                        }}
                    >
                        "{description}"
                    </div>
                )}

                {/* ── Reaction — character's response ── */}
                {reaction && (
                    <div
                        className="relative z-10 pt-2"
                        style={{
                            borderTop: '1px solid rgba(180,170,175,0.2)',
                        }}
                    >
                        <div
                            className="text-[12px] leading-[20px] font-light"
                            style={{ color: MACARON.textPrimary }}
                        >
                            {reaction}
                        </div>
                    </div>
                )}

                {/* ── If no structured data, show raw content ── */}
                {!description && !reaction && content && (
                    <div
                        className="text-[11.5px] leading-[20px] relative z-10 font-light"
                        style={{ color: MACARON.textPrimary }}
                    >
                        {content.replace(/^\[.*?\]\s*/, '')}
                    </div>
                )}

                {/* ── Footer watermark ── */}
                <div
                    className="mt-3 flex items-center justify-end relative z-10"
                >
                    <span
                        className="text-[8px] tracking-widest italic"
                        style={{ color: MACARON.textMuted }}
                    >
                        ✦ 小窝
                    </span>
                </div>
            </div>
        </div>
    );
};

export default FurnitureInteractionCard;
