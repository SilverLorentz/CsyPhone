/**
 * VoiceBubble — 通用语音条组件
 *
 * 设计原则：
 *   - 完全兼容气泡工坊：颜色/圆角/背景图/贴纸/CSS class 全部继承 BubbleStyle
 *   - 宽度按时长动态变化（min 80px，max 200px）
 *   - 三种状态：idle / playing / loading
 *   - 点击播放/暂停，全局唯一播放由父级管理
 */

import React from 'react';
import type { BubbleStyle } from '../../types/chat';

export interface VoiceBubbleProps {
    /** 语音时长（秒） */
    duration: number;
    /** 是否正在播放 */
    isPlaying: boolean;
    /** 是否正在合成/加载 */
    isLoading: boolean;
    /** 合成失败（有条目但 hasAudio=false 且不在加载中） */
    hasFailed?: boolean;
    /** 是否为用户消息 */
    isUser: boolean;
    /** 播放回调 */
    onPlay: () => void;
    /** 停止回调 */
    onStop: () => void;
    /** 重试回调（合成失败后重新合成） */
    onRetry?: () => void;
    /** 继承的气泡样式 — 完整 BubbleStyle，兼容气泡工坊所有自定义 */
    styleConfig?: BubbleStyle;
    /** 正在后台转录（用户录音消息） */
    showTranscribing?: boolean;
}

const VoiceBubble: React.FC<VoiceBubbleProps> = ({
    duration,
    isPlaying,
    isLoading,
    hasFailed = false,
    isUser,
    onPlay,
    onStop,
    onRetry,
    styleConfig,
    showTranscribing = false,
}) => {
    const bgColor = styleConfig?.backgroundColor || (isUser ? '#95ec69' : '#ffffff');
    const textColor = styleConfig?.textColor || (isUser ? '#000' : '#333');
    const radius = styleConfig?.borderRadius ?? 6;

    // Width scales with duration: min 80px, max 200px
    const clampedDur = Math.max(1, Math.min(duration, 60));
    const width = 80 + (clampedDur / 60) * 120;

    const formatDuration = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `0:${String(secs).padStart(2, '0')}`;
    };

    const handleClick = (e: React.MouseEvent) => {
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
    };

    return (
        <div
            className={`sully-voice-bubble relative flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none active:scale-[0.97] transition-transform animate-fade-in ${isUser ? 'sully-bubble-user' : 'sully-bubble-ai'}`}
            style={{
                background: styleConfig?.gradient
                    ? `linear-gradient(${styleConfig.gradient.direction}deg, ${styleConfig.gradient.from}, ${styleConfig.gradient.to})`
                    : bgColor,
                color: textColor,
                borderRadius: `${radius}px`,
                width: `${width}px`,
                minHeight: '36px',
                opacity: styleConfig?.opacity,
                border: styleConfig?.borderWidth && styleConfig.borderWidth > 0
                    ? `${styleConfig.borderWidth}px solid ${styleConfig.borderColor || 'transparent'}`
                    : undefined,
                boxShadow: styleConfig?.boxShadow || undefined,
                fontSize: styleConfig?.fontSize ? `${styleConfig.fontSize}px` : undefined,
            }}
            onClick={handleClick}
        >
            {/* Layer 0: Background Image — 气泡工坊底纹 */}
            {styleConfig?.backgroundImage && (
                <div
                    className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
                    style={{
                        backgroundImage: `url(${styleConfig.backgroundImage})`,
                        opacity: styleConfig.backgroundImageOpacity ?? 0.5,
                    }}
                />
            )}

            {/* Layer 1: Decoration Sticker — 气泡工坊贴纸角标 */}
            {styleConfig?.decoration && (
                <img
                    src={styleConfig.decoration}
                    className="absolute z-10 w-8 h-8 object-contain drop-shadow-sm pointer-events-none"
                    style={{
                        left: `${styleConfig.decorationX ?? (isUser ? 90 : 10)}%`,
                        top: `${styleConfig.decorationY ?? -10}%`,
                        transform: `translate(-50%, -50%) scale(${styleConfig.decorationScale ?? 1}) rotate(${styleConfig.decorationRotate ?? 0}deg)`,
                    }}
                    alt=""
                />
            )}

            {/* Play/Pause icon — z-10 to sit above background layers */}
            <div className="relative z-10 flex items-center gap-2 flex-1">
                {isLoading ? (
                    <svg className="w-4 h-4 shrink-0 animate-spin" style={{ color: textColor }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                ) : isPlaying ? (
                    /* Animated sound wave bars */
                    <div className="flex items-end gap-[2px] w-4 h-4 shrink-0" style={{ color: textColor }}>
                        <span className="sully-voice-bar w-[3px] rounded-full animate-voice-bar-1" style={{ backgroundColor: textColor }} />
                        <span className="sully-voice-bar w-[3px] rounded-full animate-voice-bar-2" style={{ backgroundColor: textColor }} />
                        <span className="sully-voice-bar w-[3px] rounded-full animate-voice-bar-3" style={{ backgroundColor: textColor }} />
                    </div>
                ) : (
                    /* Static play icon (speaker) */
                    <svg className="w-4 h-4 shrink-0" style={{ color: textColor }} xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.383 3.07a1 1 0 0 1 .617.924v16.012a1 1 0 0 1-1.617.784l-5.158-4.086H2a1 1 0 0 1-1-1v-7.408a1 1 0 0 1 1-1h3.225l5.158-4.086a1 1 0 0 1 1-.14zM14.5 7.5a4.5 4.5 0 0 1 0 9" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                )}

                {/* Spacer / visual wave area (grows with width) */}
                <div className="flex-1" />

                {/* Duration label */}
                <span className="text-[11px] font-medium shrink-0 tabular-nums opacity-70" style={{ color: hasFailed ? '#f87171' : textColor }}>
                    {isLoading ? '...' : hasFailed ? '重试' : showTranscribing ? '识别中' : formatDuration(duration)}
                </span>
            </div>
        </div>
    );
};

export default React.memo(VoiceBubble);
