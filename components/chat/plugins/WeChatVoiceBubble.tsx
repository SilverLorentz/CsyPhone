/**
 * WeChatVoiceBubble — 微信主题专属语音气泡（1:1 高仿真）
 *
 * 设计原则：
 *   - 仅用于 WeChat (default) 主题，不影响任何其他主题
 *   - 绿色(用户)/白色(对方) 硬编码，不接受气泡工坊覆盖
 *   - 声波方向镜像：用户 (( 朝左，对方 )) 朝右
 *   - 时长格式：微信风格 3"、25"
 *   - 完全遵循 VoiceBubbleProps 接口，即插即用
 */

import React,{ useCallback } from 'react';
import type { VoiceBubbleProps } from '../VoiceBubble';

const WeChatVoiceBubble: React.FC<VoiceBubbleProps> = ({
    duration,
    isPlaying,
    isLoading,
    hasFailed = false,
    isUser,
    onPlay,
    onStop,
    onRetry,
    showTranscribing = false,
}) => {


    // --- Colors ---
    const bgColor = isUser ? '#95ec69' : '#ffffff';
    const textColor = '#000000';

    // --- Dimensions: width scales with duration (WeChat behavior) ---
    const clampedDur = Math.max(1, Math.min(duration, 60));
    const width = 72 + (clampedDur / 60) * 128;

    // --- Duration label: WeChat uses 3" not 0:03 ---
    const durationLabel = `${Math.max(1, Math.round(duration))}"`;

    // --- Click handler ---
    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isLoading) return;
        if (hasFailed && onRetry) {
            onRetry();
        } else if (isPlaying) {
            onStop();
        } else {
            onPlay();
        }
    }, [isLoading, hasFailed, isPlaying, onRetry, onStop, onPlay]);



    // --- WeChat Sound Wave SVG (three arcs) ---
    // For user (green): arcs open to the LEFT ((
    // For AI (white): arcs open to the RIGHT ))
    const WaveIcon = () => {
        if (isLoading) {
            return (
                <div className="w-[18px] h-[18px] flex items-center justify-center">
                    <div
                        className="w-3.5 h-3.5 rounded-full border-2 animate-spin"
                        style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: 'rgba(0,0,0,0.6)' }}
                    />
                </div>
            );
        }

        if (isPlaying) {
            // Animated wave bars — WeChat style
            return (
                <div
                    className="flex items-end gap-[2px] shrink-0"
                    style={{ width: '18px', height: '18px', transform: isUser ? 'scaleX(-1)' : 'none' }}
                >
                    <span
                        className="w-[3px] rounded-full"
                        style={{
                            backgroundColor: textColor,
                            animation: 'wx-voice-bar1 0.8s ease-in-out infinite',
                        }}
                    />
                    <span
                        className="w-[3px] rounded-full"
                        style={{
                            backgroundColor: textColor,
                            animation: 'wx-voice-bar2 0.8s ease-in-out infinite 0.15s',
                        }}
                    />
                    <span
                        className="w-[3px] rounded-full"
                        style={{
                            backgroundColor: textColor,
                            animation: 'wx-voice-bar3 0.8s ease-in-out infinite 0.3s',
                        }}
                    />
                </div>
            );
        }

        // Static wave arcs — the iconic WeChat voice icon
        // User: arcs pointing LEFT (scaleX(-1)), AI: arcs pointing RIGHT
        return (
            <svg
                width="18" height="18" viewBox="0 0 24 24" fill="none"
                style={{ transform: isUser ? 'scaleX(-1)' : 'none' }}
            >
                {/* Innermost arc */}
                <path
                    d="M13 9.5a3.5 3.5 0 0 1 0 5"
                    stroke={textColor}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    opacity="1"
                />
                {/* Middle arc */}
                <path
                    d="M15.5 7a7 7 0 0 1 0 10"
                    stroke={textColor}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    opacity="0.6"
                />
                {/* Outermost arc */}
                <path
                    d="M18 4.5a10.5 10.5 0 0 1 0 15"
                    stroke={textColor}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    opacity="0.3"
                />
            </svg>
        );
    };

    return (
        <>
            <div
                className="relative flex items-center cursor-pointer select-none active:scale-[0.97] transition-transform animate-fade-in"
                style={{
                    background: bgColor,
                    borderRadius: '6px',
                    width: `${width}px`,
                    minHeight: '40px',
                    padding: '8px 12px',
                }}
                onClick={handleClick}
            >
                {/* SVG Tail (小三角箭头) */}
                <svg
                    className={`absolute top-[13px] pointer-events-none ${isUser ? '-right-[5px]' : '-left-[5px]'}`}
                    width="6" height="10"
                >
                    {isUser ? (
                        <polygon points="0,0 6,5 0,10" style={{ fill: bgColor }} />
                    ) : (
                        <polygon points="6,0 0,5 6,10" style={{ fill: bgColor }} />
                    )}
                </svg>

                {/* Content: direction depends on isUser */}
                <div className={`flex items-center gap-2 flex-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Wave icon */}
                    <WaveIcon />

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Duration label */}
                    <span
                        className="text-[13px] font-normal shrink-0 tabular-nums"
                        style={{ color: hasFailed ? '#f87171' : textColor }}
                    >
                        {isLoading ? '...' : hasFailed ? '重试' : showTranscribing ? '识别中' : durationLabel}
                    </span>
                </div>


            </div>

            {/* Keyframe animations for playing state */}
            <style>{`
                @keyframes wx-voice-bar1 {
                    0%, 100% { height: 4px; }
                    50% { height: 14px; }
                }
                @keyframes wx-voice-bar2 {
                    0%, 100% { height: 4px; }
                    50% { height: 18px; }
                }
                @keyframes wx-voice-bar3 {
                    0%, 100% { height: 4px; }
                    50% { height: 10px; }
                }
            `}</style>
        </>
    );
};

export default React.memo(WeChatVoiceBubble);
