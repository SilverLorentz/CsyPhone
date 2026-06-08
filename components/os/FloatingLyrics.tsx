import React, {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useLyrics } from '../../hooks/useLyrics';
import { AppID } from '../../types';
import { useApp } from '../../context/AppContext';
import { isMemoryRecordPlayable,isSongPlayable,type MemoryRecordPlayable } from '../../types/music';
import { DB } from '../../utils/db';
import { memoryRecordToPlayable } from '../../utils/memoryRecordPlayable';
import {
    getLyricColorVars,
    type FloatingLyricsSettings,
    type LyricPosition,
    readFloatingLyricsSettings,
    updateFloatingLyricsSettings,
} from './floatingLyricsSettings';
import './FloatingLyrics.css';

const FloatingLyrics: React.FC = () => {
    const { activeApp } = useApp();
    const { currentSong, currentTime } = useAudioPlayer();
    const [settings, setSettings] = useState<FloatingLyricsSettings>(() =>
        readFloatingLyricsSettings(),
    );
    const [toolbarExpanded, setToolbarExpanded] = useState(false);
    const [trackOffset, setTrackOffset] = useState(0);
    const [storedMemoryRecord, setStoredMemoryRecord] =
        useState<MemoryRecordPlayable | null>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
    const toolbarHideTimerRef = useRef<number | null>(null);

    const currentMemoryRecord = isMemoryRecordPlayable(currentSong)
        ? currentSong
        : null;
    const effectiveMemoryRecord =
        currentMemoryRecord
            && storedMemoryRecord?.recordId === currentMemoryRecord.recordId
            ? storedMemoryRecord
            : currentMemoryRecord;
    const lyricSongId = currentSong && isSongPlayable(currentSong)
        ? currentSong.id
        : undefined;
    const lyricsEnabled = settings.enabled && activeApp !== AppID.Music;

    const { lines, currentIndex } = useLyrics({
        songId: effectiveMemoryRecord ? undefined : lyricSongId,
        currentTime,
        enabled: lyricsEnabled,
        localLyrics: effectiveMemoryRecord?.lyrics,
        localMonologueText: effectiveMemoryRecord?.monologueText,
        localLyricsOffsetMs: effectiveMemoryRecord?.lyricsOffsetMs,
        localLyricTiming: effectiveMemoryRecord?.lyricTiming,
    });

    useEffect(() => {
        if (!currentMemoryRecord) {
            setStoredMemoryRecord(null);
            return;
        }

        let active = true;

        DB.getMemoryRecordById(currentMemoryRecord.recordId)
            .then((record) => {
                if (!active) return;
                setStoredMemoryRecord(record ? memoryRecordToPlayable(record) : null);
            })
            .catch((error: unknown) => {
                console.warn('[FloatingLyrics] Failed to load memory record lyrics:', error);
                if (active) setStoredMemoryRecord(null);
            });

        return () => {
            active = false;
        };
    }, [currentMemoryRecord?.recordId]);

    useEffect(() => {
        const handleStorage = () => {
            setSettings(readFloatingLyricsSettings());
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const clearToolbarHideTimer = () => {
        if (toolbarHideTimerRef.current !== null) {
            window.clearTimeout(toolbarHideTimerRef.current);
            toolbarHideTimerRef.current = null;
        }
    };

    const scheduleToolbarAutoHide = () => {
        clearToolbarHideTimer();
        toolbarHideTimerRef.current = window.setTimeout(() => {
            setToolbarExpanded(false);
            toolbarHideTimerRef.current = null;
        }, 2600);
    };

    useEffect(() => () => {
        if (toolbarHideTimerRef.current !== null) {
            window.clearTimeout(toolbarHideTimerRef.current);
            toolbarHideTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        lineRefs.current = lineRefs.current.slice(0, lines.length);
    }, [lines.length]);

    useLayoutEffect(() => {
        if (currentIndex < 0) {
            setTrackOffset(0);
            return;
        }

        const frameId = window.requestAnimationFrame(() => {
            const viewport = viewportRef.current;
            const activeLine = lineRefs.current[currentIndex];

            if (!viewport || !activeLine) {
                setTrackOffset(0);
                return;
            }

            const viewportCenter = viewport.clientHeight / 2;
            const activeLineCenter =
                activeLine.offsetTop + activeLine.offsetHeight / 2;

            setTrackOffset(viewportCenter - activeLineCenter);
        });

        return () => window.cancelAnimationFrame(frameId);
    }, [currentIndex, lines, settings.showTranslation]);

    const shouldShow =
        settings.enabled &&
        currentSong !== null &&
        activeApp !== AppID.Music &&
        lines.length > 0;

    useEffect(() => {
        if (!shouldShow) {
            clearToolbarHideTimer();
            setToolbarExpanded(false);
        }
    }, [shouldShow]);

    const positionLabels: Record<LyricPosition, string> = {
        top: '顶部',
        center: '居中',
        bottom: '底部',
    };

    const handleCyclePosition = () => {
        const order: LyricPosition[] = ['top', 'center', 'bottom'];
        const nextPosition =
            order[(order.indexOf(settings.position) + 1) % order.length];
        setSettings(
            updateFloatingLyricsSettings({
                position: nextPosition,
            }),
        );
        scheduleToolbarAutoHide();
    };

    const handleToggleTranslation = () => {
        setSettings(
            updateFloatingLyricsSettings({
                showTranslation: !settings.showTranslation,
            }),
        );
        scheduleToolbarAutoHide();
    };

    const handleToggleEnabled = () => {
        setSettings(
            updateFloatingLyricsSettings({
                enabled: !settings.enabled,
            }),
        );
    };

    const handleRevealToolbar = () => {
        setToolbarExpanded(true);
        scheduleToolbarAutoHide();
    };

    const baseTransform =
        settings.position === 'center'
            ? 'translate(-50%, -50%)'
            : 'translateX(-50%)';

    return (
        <AnimatePresence>
            {shouldShow && (
                <motion.div
                    data-testid="floating-lyrics"
                    className={`floating-lyrics floating-lyrics--${settings.position}`}
                    style={
                        {
                            ...getLyricColorVars(settings.textColor),
                        } as React.CSSProperties
                    }
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: settings.opacity, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    transformTemplate={(_, generatedTransform) =>
                        generatedTransform
                            ? `${baseTransform} ${generatedTransform}`
                            : baseTransform
                    }
                >
                    <div
                        className="floating-lyrics-scroll"
                        ref={viewportRef}
                        onPointerDown={handleRevealToolbar}
                    >
                        <div
                            className="floating-lyrics-track"
                            style={{
                                transform: `translate3d(0, ${trackOffset}px, 0)`,
                            }}
                        >
                            {lines.map((line, index) => (
                                <div
                                    key={`${line.time}-${index}`}
                                    ref={(node) => {
                                        lineRefs.current[index] = node;
                                    }}
                                    className={`floating-lyric-line ${index === currentIndex ? 'floating-lyric-line--active' : ''}`}
                                >
                                    <span className="floating-lyric-text">
                                        {line.text}
                                    </span>
                                    {settings.showTranslation
                                        && line.translation && (
                                            <span className="floating-lyric-translation">
                                                {line.translation}
                                            </span>
                                        )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <AnimatePresence>
                        {toolbarExpanded && (
                            <motion.div
                                className="floating-lyrics-toolbar-wrap"
                                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                                transition={{
                                    type: 'spring',
                                    stiffness: 400,
                                    damping: 25,
                                }}
                            >
                                <div
                                    className="floating-lyrics-toolbar"
                                    onPointerEnter={clearToolbarHideTimer}
                                    onPointerLeave={scheduleToolbarAutoHide}
                                >
                                    <button
                                        className="fl-tool-btn"
                                        onClick={handleCyclePosition}
                                        title="切换位置"
                                    >
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M12 2v20M2 12h20" />
                                        </svg>
                                        <span>
                                            {positionLabels[settings.position]}
                                        </span>
                                    </button>
                                    <button
                                        className="fl-tool-btn"
                                        onClick={handleToggleTranslation}
                                        title="翻译"
                                    >
                                        <span>
                                            {settings.showTranslation
                                                ? '译✓'
                                                : '译'}
                                        </span>
                                    </button>
                                    <button
                                        className="fl-tool-btn fl-tool-btn--close"
                                        onClick={handleToggleEnabled}
                                        title="关闭歌词"
                                    >
                                        <svg
                                            width="12"
                                            height="12"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M18 6 6 18M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default React.memo(FloatingLyrics);
