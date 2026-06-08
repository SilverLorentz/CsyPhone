import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useWillChange } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { AppID } from '../../types';
import { isMemoryRecordPlayable, isSongPlayable } from '../../types/music';
import {
    readFloatingLyricsSettings,
    toggleFloatingLyricsEnabled,
} from './floatingLyricsSettings';
import './DynamicIsland.css';
import { useDominantColor } from '../../hooks/useDominantColor';

/** Cult UI 验证过的弹簧参数 — 果冻感但不过度弹跳 */
const SPRING_CONFIG = {
    type: 'spring' as const,
    stiffness: 400,
    damping: 30,
};

/** 胶囊态和展开态的尺寸预设 */
const DI_PRESETS = {
    capsule: {
        width: 220,
        maxWidth: 220,
        height: 40,
        borderRadius: 24,
        padding: '4px 10px 4px 4px',
    },
    expanded: {
        width: 'min(320px, 85vw)',
        maxWidth: 320,
        height: 'auto',
        borderRadius: 28,
        padding: '8px 16px 14px',
    },
};

/** 内容进出场动画 */
const CONTENT_ENTER = { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' };
const CONTENT_EXIT = { opacity: 0, scale: 0.95, y: 8, filter: 'blur(10px)' };
const CONTENT_INITIAL = {
    opacity: 0,
    scale: 0.9,
    y: 10,
    filter: 'blur(6px)',
};
const LONG_PRESS_DISMISS_MS = 650;
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

/** Convert HSL (h: 0-360, s/l: 0-1) to "R, G, B" CSS string */
function hslToRgbString(h: number, s: number, l: number): string {
    const hN = h / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
        const tc = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
        if (tc < 1 / 6) return p + (q - p) * 6 * tc;
        if (tc < 1 / 2) return q;
        if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
        return p;
    };
    return [
        Math.round(f(hN + 1 / 3) * 255),
        Math.round(f(hN) * 255),
        Math.round(f(hN - 1 / 3) * 255),
    ].join(', ');
}

/**
 * 灵动岛 — 退出音乐 App 后的浮动迷你播放器。
 *
 * 显示条件：
 * 1. 当前 activeApp 不是 Music
 * 2. 有可恢复的当前歌曲 (currentSong !== null)
 *
 * 状态：
 * - collapsed（胶囊）：显示封面缩略图 + 歌名滚动 + 播放/暂停按钮
 * - expanded（展开）：显示封面 + 歌名 + 艺术家 + 进度条 + 上一首/播放/下一首
 */
const DynamicIsland: React.FC = () => {
    const willChange = useWillChange();
    const { activeApp, openApp } = useApp();
    const {
        currentSong,
        isPlaying,
        progress,
        currentTime,
        duration,
        togglePlay,
        playNext,
        playPrev,
        seek,
        stop,
    } = useAudioPlayer();
    const [expanded, setExpanded] = useState(false);
    const [lyricsEnabled, setLyricsEnabled] = useState(
        () => readFloatingLyricsSettings().enabled,
    );
    const longPressTimerRef = useRef<number | null>(null);
    const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
    const suppressNextClickRef = useRef(false);

    const shouldShow = useMemo(
        () => activeApp !== AppID.Music && currentSong !== null,
        [activeApp, currentSong],
    );

    useEffect(() => {
        if (!shouldShow) {
            setExpanded(false);
        }
    }, [shouldShow]);

    useEffect(() => {
        const handleStorage = () => {
            setLyricsEnabled(readFloatingLyricsSettings().enabled);
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const clearLongPressTimer = useCallback(() => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        longPressStartRef.current = null;
    }, []);

    useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

    const consumeSuppressedClick = useCallback((event: React.SyntheticEvent) => {
        if (!suppressNextClickRef.current) return false;
        event.preventDefault();
        event.stopPropagation();
        suppressNextClickRef.current = false;
        return true;
    }, []);

    const handleStopPlayback = useCallback(() => {
        suppressNextClickRef.current = true;
        setExpanded(false);
        stop();
    }, [stop]);

    const handleLongPressPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
        event.stopPropagation();
        clearLongPressTimer();
        longPressStartRef.current = { x: event.clientX, y: event.clientY };
        longPressTimerRef.current = window.setTimeout(() => {
            longPressTimerRef.current = null;
            longPressStartRef.current = null;
            handleStopPlayback();
        }, LONG_PRESS_DISMISS_MS);
    }, [clearLongPressTimer, handleStopPlayback]);

    const handleLongPressPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const startPoint = longPressStartRef.current;
        if (!startPoint) return;

        const deltaX = event.clientX - startPoint.x;
        const deltaY = event.clientY - startPoint.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance > LONG_PRESS_MOVE_TOLERANCE_PX) {
            clearLongPressTimer();
        }
    }, [clearLongPressTimer]);

    const handleLongPressPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (suppressNextClickRef.current) {
            event.preventDefault();
            event.stopPropagation();
        }
        clearLongPressTimer();
    }, [clearLongPressTimer]);

    const longPressHandlers = {
        onPointerDown: handleLongPressPointerDown,
        onPointerMove: handleLongPressPointerMove,
        onPointerUp: handleLongPressPointerEnd,
        onPointerCancel: handleLongPressPointerEnd,
        onPointerLeave: handleLongPressPointerEnd,
    };

    const handleToggleExpand = useCallback((event: React.MouseEvent) => {
        if (consumeSuppressedClick(event)) return;
        event.stopPropagation();
        setExpanded((prev) => !prev);
    }, [consumeSuppressedClick]);

    const handleOpenMusicApp = useCallback((event: React.MouseEvent) => {
        if (consumeSuppressedClick(event)) return;
        event.stopPropagation();
        setExpanded(false);
        openApp(AppID.Music);
    }, [consumeSuppressedClick, openApp]);

    const handleTogglePlay = useCallback(
        (event: React.MouseEvent) => {
            if (consumeSuppressedClick(event)) return;
            event.stopPropagation();
            togglePlay();
        },
        [consumeSuppressedClick, togglePlay],
    );

    const handlePrev = useCallback(
        (event: React.MouseEvent) => {
            if (consumeSuppressedClick(event)) return;
            event.stopPropagation();
            void playPrev();
        },
        [consumeSuppressedClick, playPrev],
    );

    const handleNext = useCallback(
        (event: React.MouseEvent) => {
            if (consumeSuppressedClick(event)) return;
            event.stopPropagation();
            void playNext();
        },
        [consumeSuppressedClick, playNext],
    );

    const handleProgressClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (consumeSuppressedClick(event)) return;
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            const percent = Math.max(
                0,
                Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
            );
            seek(percent);
        },
        [consumeSuppressedClick, seek],
    );

    const handleToggleLyrics = useCallback((event: React.MouseEvent) => {
        if (consumeSuppressedClick(event)) return;
        event.stopPropagation();
        const nextSettings = toggleFloatingLyricsEnabled();
        setLyricsEnabled(nextSettings.enabled);
    }, [consumeSuppressedClick]);

    // ── 封面色提取（hook 必须在条件 return 之前调用）──
    const coverUrl = currentSong
        ? (isSongPlayable(currentSong)
            ? currentSong.album.picUrl
            : isMemoryRecordPlayable(currentSong)
                ? currentSong.coverImageUrl
            : currentSong.coverUrl
                || currentSong.radio?.picUrl
                || currentSong.mainSong?.album.picUrl)
        : undefined;
    const dominantColor = useDominantColor(coverUrl);
    const coverSeed = currentSong?.id || 0;
    const fallbackHue = ((coverSeed % 360) + 360) % 360;
    const glowRgb = dominantColor
        ? `${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}`
        : currentSong ? hslToRgbString(fallbackHue, 0.65, 0.55) : null;

    if (!shouldShow || !currentSong) return null;

    const artistText = isSongPlayable(currentSong)
        ? currentSong.artists.map((artist) => artist.name).join(' / ') || '未知歌手'
        : isMemoryRecordPlayable(currentSong)
            ? `${currentSong.artistName} · ${currentSong.albumName}`
        : currentSong.radioName
            || currentSong.radio?.name
            || currentSong.dj?.nickname
            || currentSong.radio?.dj?.nickname
            || '播客节目';

    const formatTime = (seconds: number): string => {
        const safeSeconds = Math.max(0, Math.floor(seconds));
        return `${Math.floor(safeSeconds / 60)}:${(safeSeconds % 60)
            .toString()
            .padStart(2, '0')}`;
    };

    return (
        <motion.div
            layout
            className={`dynamic-island ${expanded ? 'dynamic-island--expanded' : 'dynamic-island--collapsed'}`}
            animate={{
                width: expanded
                    ? DI_PRESETS.expanded.maxWidth
                    : DI_PRESETS.capsule.width,
                borderRadius: expanded
                    ? DI_PRESETS.expanded.borderRadius
                    : DI_PRESETS.capsule.borderRadius,
            }}
            transition={SPRING_CONFIG}
            style={{
                willChange,
                maxWidth: expanded
                    ? DI_PRESETS.expanded.width
                    : DI_PRESETS.capsule.maxWidth,
                boxShadow: isPlaying && glowRgb
                    ? `0 2px 20px rgba(${glowRgb}, 0.4), 0 0 40px rgba(${glowRgb}, 0.15)`
                    : 'none',
            }}
        >
            <AnimatePresence mode="wait" initial={false}>
                {!expanded ? (
                    <motion.div
                        key="capsule"
                        className="di-capsule"
                        onClick={handleToggleExpand}
                        {...longPressHandlers}
                        initial={CONTENT_INITIAL}
                        animate={CONTENT_ENTER}
                        exit={CONTENT_EXIT}
                        transition={{ ...SPRING_CONFIG, duration: 0.25 }}
                    >
                        <div
                            className={`di-capsule-cover ${isPlaying ? '' : 'di-capsule-cover--paused'}`}
                            style={
                                coverUrl
                                    ? { backgroundImage: `url(${coverUrl})` }
                                    : {
                                          background: `linear-gradient(135deg, hsl(${fallbackHue}, 70%, 60%), hsl(${(fallbackHue + 40) % 360}, 65%, 50%))`,
                                      }
                            }
                        >
                            {!coverUrl && (
                                <span className="di-capsule-cover-note">♪</span>
                            )}
                        </div>

                        <div className="di-capsule-info">
                            <div className="di-capsule-title">
                                <span className="di-capsule-title-text">
                                    {currentSong.name || '未知歌曲'}
                                </span>
                            </div>
                        </div>

                        {isPlaying ? (
                            <div
                                className="di-capsule-bars"
                                onClick={handleTogglePlay}
                            >
                                <span className="di-bar" />
                                <span className="di-bar" />
                                <span className="di-bar" />
                            </div>
                        ) : (
                            <div
                                className="di-capsule-play-btn"
                                onClick={handleTogglePlay}
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="expanded"
                        className="di-expanded"
                        {...longPressHandlers}
                        initial={CONTENT_INITIAL}
                        animate={CONTENT_ENTER}
                        exit={CONTENT_EXIT}
                        transition={{ ...SPRING_CONFIG, duration: 0.3 }}
                        style={glowRgb ? {
                            background: `linear-gradient(145deg, rgba(${glowRgb}, 0.45) 0%, rgba(0,0,0,0.95) 45%, rgba(${glowRgb}, 0.2) 100%)`,
                        } : undefined}
                    >
                        <div
                            className="di-expanded-handle"
                            onClick={handleToggleExpand}
                        >
                            <div className="di-expanded-handle-bar" />
                        </div>

                        <div className="di-expanded-main">
                            <div
                                className={`di-expanded-cover ${isPlaying ? 'di-expanded-cover--spinning' : ''}`}
                                style={
                                    coverUrl
                                        ? { backgroundImage: `url(${coverUrl})` }
                                        : {
                                              background: `linear-gradient(135deg, hsl(${fallbackHue}, 70%, 60%), hsl(${(fallbackHue + 40) % 360}, 65%, 50%))`,
                                          }
                                }
                            >
                                {!coverUrl && (
                                    <span className="di-expanded-cover-note">♪</span>
                                )}
                            </div>

                            <div className="di-expanded-info">
                                <div className="di-expanded-name">
                                    {currentSong.name || '未知歌曲'}
                                </div>
                                <div className="di-expanded-artist">
                                    {artistText}
                                </div>
                            </div>
                        </div>

                        <div
                            className="di-expanded-progress"
                            onClick={handleProgressClick}
                        >
                            <div
                                className="di-expanded-progress-fill"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className="di-expanded-time">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>

                        <div className="di-expanded-controls">
                            <div className="di-ctrl-btn" onClick={handlePrev}>
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                                </svg>
                            </div>
                            <div
                                className="di-ctrl-play"
                                onClick={handleTogglePlay}
                            >
                                {isPlaying ? (
                                    <svg
                                        width="22"
                                        height="22"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                    </svg>
                                ) : (
                                    <svg
                                        width="22"
                                        height="22"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                )}
                            </div>
                            <div className="di-ctrl-btn" onClick={handleNext}>
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6z" />
                                </svg>
                            </div>
                        </div>

                        <div className="di-expanded-extras">
                            <div
                                className={`di-expanded-lyric-toggle ${lyricsEnabled ? 'di-expanded-lyric-toggle--active' : ''}`}
                                onClick={handleToggleLyrics}
                            >
                                词
                            </div>
                        </div>

                        <div
                            className="di-expanded-open"
                            onClick={handleOpenMusicApp}
                        >
                            打开音乐
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default React.memo(DynamicIsland);
