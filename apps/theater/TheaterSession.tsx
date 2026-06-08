/**
 * TheaterSession — VN 风格对话场景（光与夜之恋）
 * 底部毛玻璃对话框 · 打字机效果 · 点击翻页 · Auto · Log
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { resolveTheaterBg } from '../../utils/db/theaterStore';
import type { CharacterProfile, UserProfile, Message, DirectorEvent, TheaterLocation, TimeSlot, LocationSuggestion } from '../../types';
import type { InnerWhisper } from '../../utils/thinkingExtractor';
import { TIME_SLOT_LABELS } from '../../types/theater';
import { useOS } from '../../context/OSContext';
import { useConfig } from '../../context/ConfigContext';
import { useTheaterBgm } from '../../hooks/useTheaterBgm';
import TheaterSettings from './TheaterSettings';
import TheaterFloatingBall from './TheaterFloatingBall';
import InlineLocationSheet from './InlineLocationSheet';
import { TimeSlotIcon } from './TheaterMap';
import { MinimaxTts } from '../../utils/minimaxTts';
import { withCharacterTtsVoice } from '../../utils/characterTts';
import {
    formatTheaterUserBeatsForMessage,
    parseTheaterAssistantBeatReplyGroups,
    parseTheaterAssistantPages,
    parseTheaterUserPages,
    resolveTheaterPageIndexAfterMessagesChange,
    sanitizeTheaterUserBeats,
    stripTheaterBeatMarkers,
    type TheaterAssistantBeatReply,
    type TheaterAssistantBeatReplyGroup,
    type TheaterBeatKind,
    type TheaterUserBeat,
    type TheaterVNPage,
} from '../../utils/theaterDialogueFormat';
import {
    DATE_WORLDLINE_THEATER_GUIDE_KEY,
    readStorageFlag,
    writeStorageFlag,
} from '../../utils/dateWorldlineOrb';

const REQUIRED_EMOTIONS = ['normal', 'happy', 'angry', 'sad', 'shy'];

type TheaterExitSyncMode = 'summary' | 'raw' | 'none';

interface TheaterInputBeat extends TheaterUserBeat {
    id: string;
}

interface TheaterSessionProps {
    char: CharacterProfile;
    userProfile: UserProfile;
    location: TheaterLocation;
    timeSlot: TimeSlot;
    is520: boolean;
    currentEvent: DirectorEvent | null;
    isDirectorLoading: boolean;
    isAiLoading: boolean;
    messages: Message[];
    onSendMessage: (text: string, directorHint?: string, userBeats?: TheaterUserBeat[]) => Promise<void>;
    /** Location switching (inline, no exit) */
    locations: TheaterLocation[];
    visitedLocationIds: string[];
    onSelectLocation: (loc: TheaterLocation) => void;
    onAddLocation: (loc: TheaterLocation) => void;
    onDeleteCustomLocation: (id: string) => void;
    showLocationSheet: boolean;
    onCloseLocationSheet: () => void;
    onOpenLocationSheet: () => void;
    onExit: (syncMode?: TheaterExitSyncMode) => void;
    // Inner Whispers (内心低语)
    activeWhispers?: InnerWhisper[];
    onWhisperClick?: (whisper: InnerWhisper) => void;
    // Timeline / Fork
    timelineLabel?: string;
    onForkFromMessage?: (msg: Message) => void;
    // Summary
    isSummaryGenerating?: boolean;
    hasPendingSummary?: boolean;
    canManualSummary?: boolean;
    canAutoSummary?: boolean;
    summaryDisabledReason?: string;
    onRequestSummary?: () => void;
    onReviewPendingSummary?: () => void;
    onDiscardPendingSummary?: () => void;
    onToggleAutoSummary?: (enabled: boolean) => void;
    onToggleAutoHideSummary?: (enabled: boolean) => void;
    onChangeThreshold?: (threshold: number) => void;
    onOpenSummarySettings?: () => void;
    savedSummaryCount?: number;
    onOpenSavedSummaries?: () => void;
    // Transition
    isTransitioning?: boolean;
    transitionLocationName?: string;
    // Director Location Suggestion
    pendingLocationSuggestion?: LocationSuggestion | null;
    onAcceptLocationSuggestion?: () => void;
    onDeclineLocationSuggestion?: () => void;
    // Theater Ending Ceremony
    onGenerateGiftReaction?: (userGift: string) => Promise<string>;
    onGenerateFarewell?: () => Promise<string>;
    onGenerateMetaLetter?: () => Promise<string>;
    onSaveMetaLetter?: (letterContent: string) => Promise<void>;
}

// ── Helpers ──

const cleanText = (text: string) => stripTheaterBeatMarkers(text).replace(/\[.*?\]/g, '').trim();

const extractCurrentEmotion = (messages: Message[]): string => {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role !== 'assistant') continue;
        const lines = (messages[i].content || '').split('\n');
        for (let j = lines.length - 1; j >= 0; j--) {
            const match = lines[j].match(/^\[([a-zA-Z0-9_-]+)\]/);
            if (match) return match[1].toLowerCase();
        }
        break;
    }
    return 'normal';
};

const createInputBeat = (kind: TheaterBeatKind = 'speech'): TheaterInputBeat => ({
    id: `beat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    text: '',
});

const getMessageUserBeats = (msg: Message): TheaterUserBeat[] | undefined => {
    const raw = msg.metadata?.theaterUserBeats;
    if (!Array.isArray(raw)) return undefined;

    const beats = raw.filter((beat): beat is TheaterUserBeat => (
        beat
        && (beat.kind === 'speech' || beat.kind === 'action')
        && typeof beat.text === 'string'
    ));

    return beats.length > 0 ? beats : undefined;
};

const getMessageAssistantBeatReplies = (msg: Message): TheaterAssistantBeatReplyGroup[] => {
    const raw = msg.metadata?.theaterAssistantBeatReplies;
    if (Array.isArray(raw)) {
        return raw
            .filter((reply): reply is TheaterAssistantBeatReply => (
                reply
                && typeof reply.beatIndex === 'number'
                && Number.isFinite(reply.beatIndex)
                && typeof reply.content === 'string'
            ))
            .map(reply => ({
                ...reply,
                pages: parseTheaterAssistantPages(reply.content, msg.id),
            }))
            .filter(reply => reply.pages.length > 0);
    }

    const parsed = parseTheaterAssistantBeatReplyGroups(msg.content || '', msg.id);
    return parsed.hasBeatMarkers && parsed.unassignedPages.length === 0 ? parsed.groups : [];
};

function buildPages(messages: Message[]): TheaterVNPage[] {
    const pages: TheaterVNPage[] = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role === 'user') {
            const userPages = parseTheaterUserPages(msg.content || '', msg.id, getMessageUserBeats(msg));
            const next = messages[i + 1];
            if (next?.role === 'assistant') {
                const replyGroups = getMessageAssistantBeatReplies(next);
                if (replyGroups.length > 0) {
                    const repliesByBeat = new Map(replyGroups.map(group => [group.beatIndex, group.pages]));
                    const usedIndexes = new Set<number>();
                    userPages.forEach((page, index) => {
                        const beatIndex = index + 1;
                        pages.push(page);
                        const replies = repliesByBeat.get(beatIndex) || [];
                        if (replies.length > 0) {
                            pages.push(...replies);
                            usedIndexes.add(beatIndex);
                        }
                    });
                    replyGroups
                        .filter(group => !usedIndexes.has(group.beatIndex))
                        .forEach(group => pages.push(...group.pages));
                    i += 1;
                    continue;
                }

                pages.push(...userPages, ...parseTheaterAssistantPages(next.content || '', next.id));
                i += 1;
                continue;
            }
            pages.push(...userPages);
            continue;
        }
        pages.push(...parseTheaterAssistantPages(msg.content || '', msg.id));
    }
    return pages;
}

// ── Typewriter Hook ──

function useTypewriter(text: string, speed = 30) {
    const [displayed, setDisplayed] = useState('');
    const [done, setDone] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    useEffect(() => {
        clearTimer();
        setDisplayed('');
        setDone(false);
        let idx = 0;
        timerRef.current = setInterval(() => {
            idx++;
            if (idx >= text.length) {
                setDisplayed(text);
                setDone(true);
                clearTimer();
            } else {
                setDisplayed(text.slice(0, idx));
            }
        }, speed);
        return clearTimer;
    }, [clearTimer, text, speed]);

    const skipToEnd = useCallback(() => {
        clearTimer();
        setDisplayed(text);
        setDone(true);
    }, [clearTimer, text]);

    return { displayed, done, skipToEnd };
}

// ══════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════

const TheaterSession: React.FC<TheaterSessionProps> = ({
    char, userProfile, location, timeSlot,
    is520: _is520, currentEvent, isDirectorLoading, isAiLoading,
    messages, onSendMessage,
    locations, visitedLocationIds,
    onSelectLocation, onAddLocation, onDeleteCustomLocation,
    showLocationSheet, onCloseLocationSheet, onOpenLocationSheet,
    onExit,
    timelineLabel, onForkFromMessage,
    isSummaryGenerating, hasPendingSummary, canManualSummary, canAutoSummary,
    summaryDisabledReason,
    onRequestSummary, onReviewPendingSummary, onDiscardPendingSummary,
    onToggleAutoSummary, onToggleAutoHideSummary, onChangeThreshold,
    onOpenSummarySettings, savedSummaryCount, onOpenSavedSummaries,
    activeWhispers = [], onWhisperClick,
    isTransitioning, transitionLocationName: _transitionLocationName,
    pendingLocationSuggestion, onAcceptLocationSuggestion, onDeclineLocationSuggestion,
    onGenerateGiftReaction, onGenerateFarewell, onGenerateMetaLetter, onSaveMetaLetter,
}) => {
    const { addToast, registerBackHandler } = useOS();
    const { ttsConfig } = useConfig();

    // ── Theater TTS Config ──
    const characterTtsConfig = useMemo(
        () => ttsConfig && char ? withCharacterTtsVoice(ttsConfig, char) : ttsConfig,
        [ttsConfig, char?.id, char?.ttsVoiceId],
    );

    // ── BGM ──
    const bgm = useTheaterBgm({
        location,
        timeSlot,
        event: currentEvent,
        apiKey: ttsConfig.apiKey || '',
        groupId: ttsConfig.groupId,
    });

    // ── VN State ──
    const pages = useMemo(() => buildPages(messages), [messages]);
    const messageById = useMemo(
        () => new Map(messages.map(msg => [String(msg.id), msg])),
        [messages],
    );
    const [pageIndex, setPageIndex] = useState(0);
    const [showInput, setShowInput] = useState(false);
    const [autoMode, setAutoMode] = useState(false);
    const [showLog, setShowLog] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showExitModal, setShowExitModal] = useState(false);
    const [hideDialog, setHideDialog] = useState(false);
    const [showWorldlineGuide, setShowWorldlineGuide] = useState(false);
    const [inputBeats, setInputBeats] = useState<TheaterInputBeat[]>(() => [createInputBeat('speech')]);
    const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevPagesRef = useRef<TheaterVNPage[]>([]);
    const prevMessageIdsRef = useRef<Set<string>>(new Set());
    const pageIndexRef = useRef(0);
    /** Track whether the component mounted with messages already present (i.e. resumed history) */
    const hadInitialMessagesRef = useRef(messages.length > 0);

    // ── Background Crossfade ──
    const [resolvedBg, setResolvedBg] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        resolveTheaterBg(location.bgImage).then(url => {
            if (!cancelled) setResolvedBg(url);
        });
        return () => { cancelled = true; };
    }, [location.bgImage]);

    const currentBg = resolvedBg
        ? `url(${resolvedBg}) center/cover`
        : location.bgGradient || '#111';
    const prevBgRef = useRef(currentBg);
    const [bgLayers, setBgLayers] = useState<{ front: string; back: string; transitioning: boolean }>({
        front: currentBg, back: '', transitioning: false,
    });

    useLayoutEffect(() => {
        if (currentBg !== prevBgRef.current) {
            // Start crossfade: old bg goes to back layer (fading out), new bg on front (fading in)
            setBgLayers({ front: currentBg, back: prevBgRef.current, transitioning: true });
            prevBgRef.current = currentBg;
            const t = setTimeout(() => setBgLayers(prev => ({ ...prev, back: '', transitioning: false })), 700);
            return () => clearTimeout(t);
        }
    }, [currentBg]);
    const hasInitializedRef = useRef(false);
    const timeLabel = TIME_SLOT_LABELS[timeSlot];

    const currentPage = pages[pageIndex] || null;
    const isUserPage = currentPage?.role === 'user';
    const isSpeechPage = currentPage?.type === 'dialogue' || currentPage?.type === 'user';
    const shouldShowSpeakerBadge = !!currentPage && (isUserPage || currentPage.type === 'dialogue');
    const speakerName = isUserPage ? (userProfile.name || '你') : char.name;
    const speakerAvatar = isUserPage ? userProfile.avatar : char.avatar;
    const speakerInitial = Array.from((speakerName || '').trim())[0] || (isUserPage ? '你' : '角');
    const isLastPage = pageIndex >= pages.length - 1;
    const isLoading = isAiLoading || isDirectorLoading;
    const sendableInputBeats = useMemo(
        () => sanitizeTheaterUserBeats(inputBeats.map(({ kind, text }) => ({ kind, text }))),
        [inputBeats],
    );

    useEffect(() => {
        if (readStorageFlag(DATE_WORLDLINE_THEATER_GUIDE_KEY)) return;
        const timer = window.setTimeout(() => setShowWorldlineGuide(true), 700);
        return () => window.clearTimeout(timer);
    }, []);

    const handleCloseWorldlineGuide = useCallback(() => {
        writeStorageFlag(DATE_WORLDLINE_THEATER_GUIDE_KEY);
        setShowWorldlineGuide(false);
    }, []);

    // ── Typewriter ──
    const { displayed, done, skipToEnd } = useTypewriter(currentPage?.text || '', 30);

    useEffect(() => {
        pageIndexRef.current = pageIndex;
    }, [pageIndex]);

    // ── Theater TTS Playback ──
    const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
    const ttsUrlRef = useRef<string | null>(null);
    const [ttsPlaying, setTtsPlaying] = useState(false);
    const [ttsSynthesizing, setTtsSynthesizing] = useState(false);
    const ttsAbortRef = useRef<AbortController | null>(null);
    const ttsCacheRef = useRef<Map<string, Blob>>(new Map());

    const stopTtsAudio = useCallback(() => {
        ttsAbortRef.current?.abort();
        ttsAbortRef.current = null;
        if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
            ttsAudioRef.current.currentTime = 0;
            ttsAudioRef.current = null;
        }
        if (ttsUrlRef.current) {
            URL.revokeObjectURL(ttsUrlRef.current);
            ttsUrlRef.current = null;
        }
        setTtsPlaying(false);
        setTtsSynthesizing(false);
    }, []);

    const playTtsBlob = useCallback((blob: Blob) => {
        const url = URL.createObjectURL(blob);
        ttsUrlRef.current = url;
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        setTtsSynthesizing(false);
        setTtsPlaying(true);

        audio.onended = () => {
            URL.revokeObjectURL(url);
            ttsUrlRef.current = null;
            ttsAudioRef.current = null;
            setTtsPlaying(false);
        };
        audio.onerror = () => stopTtsAudio();

        skipToEnd();
        audio.play().catch(() => stopTtsAudio());
    }, [stopTtsAudio, skipToEnd]);

    // ── Page navigation: distinguish initial load vs new content ──
    useEffect(() => {
        if (pages.length === 0) {
            prevPagesRef.current = pages;
            prevMessageIdsRef.current = new Set(messages.map(msg => String(msg.id)));
            return;
        }

        if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            if (hadInitialMessagesRef.current) {
                // Resumed session with existing history: jump to LAST page
                setPageIndex(pages.length - 1);
            } else {
                // Fresh session — first scene just generated: start from page 0
                setPageIndex(0);
            }
        } else {
            const previousMessageIds = prevMessageIdsRef.current;
            const hasMessageChange =
                messages.length !== previousMessageIds.size
                || messages.some(msg => !previousMessageIds.has(String(msg.id)));

            if (hasMessageChange || pages.length !== prevPagesRef.current.length) {
                const nextPageIndex = resolveTheaterPageIndexAfterMessagesChange(
                    prevPagesRef.current,
                    pages,
                    pageIndexRef.current,
                    previousMessageIds,
                    messages,
                );
                setPageIndex(nextPageIndex);
                if (hasMessageChange) setShowInput(false);
            }
        }

        prevPagesRef.current = pages;
        prevMessageIdsRef.current = new Set(messages.map(msg => String(msg.id)));
    }, [pages, messages]);

    // ── Auto-play: advance page after typewriter finishes ──
    useEffect(() => {
        if (!autoMode || !done || isLoading) return;
        if (isLastPage) {
            // Wait a moment then show input
            autoTimerRef.current = setTimeout(() => setShowInput(true), 1500);
        } else {
            autoTimerRef.current = setTimeout(() => setPageIndex(i => i + 1), 2000);
        }
        return () => {
            if (autoTimerRef.current !== null) {
                clearTimeout(autoTimerRef.current);
                autoTimerRef.current = null;
            }
        };
    }, [autoMode, done, isLastPage, isLoading, pageIndex]);

    // ── Sprite System ──
    const dateEmotionKeys = useMemo(
        () => [...REQUIRED_EMOTIONS, ...(char.customDateSprites || [])],
        [char.customDateSprites],
    );

    const activeSprites: Record<string, string> = useMemo(() => {
        if (char.activeSkinSetId && char.dateSkinSets) {
            const skin = char.dateSkinSets.find(s => s.id === char.activeSkinSetId);
            if (skin && Object.keys(skin.sprites).length > 0) return skin.sprites;
        }
        return char.sprites || {};
    }, [char.activeSkinSetId, char.dateSkinSets, char.sprites]);

    const spriteConfig = char.spriteConfig || { scale: 1, x: 0, y: 0 };
    const hasSprites = Object.keys(activeSprites).length > 0;
    const currentEmotion = extractCurrentEmotion(messages);
    const currentSprite = useMemo(() => {
        if (!hasSprites) return null;
        if (activeSprites[currentEmotion]) return activeSprites[currentEmotion];
        const found = dateEmotionKeys.find(k => currentEmotion.includes(k));
        if (found && activeSprites[found]) return activeSprites[found];
        return activeSprites['normal'] || Object.values(activeSprites)[0] || null;
    }, [currentEmotion, activeSprites, hasSprites, dateEmotionKeys]);

    // ── Back handler ──
    useEffect(() => {
        const unreg = registerBackHandler(() => {
            if (showExitModal) { setShowExitModal(false); return true; }
            if (showLog) { setShowLog(false); return true; }
            if (showInput) { setShowInput(false); return true; }
            setShowExitModal(true);
            return true;
        });
        return unreg;
    }, [showExitModal, showInput, showLog, registerBackHandler]);

    // ── Click to advance / go back ──
    const handlePrevPage = useCallback((e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        stopTtsAudio();
        setPageIndex(i => Math.max(0, i - 1));
    }, [stopTtsAudio]);

    const handleDialogClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        stopTtsAudio();

        // If clicked on the left 30% of the screen, go back
        const clickX = e.clientX;
        const screenWidth = window.innerWidth;
        if (clickX < screenWidth * 0.3 && pageIndex > 0) {
            handlePrevPage();
            return;
        }

        if (!done) { skipToEnd(); return; }
        if (isLastPage) { setShowInput(true); return; }
        setPageIndex(i => i + 1);
    }, [done, skipToEnd, isLastPage, pageIndex, handlePrevPage]);

    // ── Skip all remaining pages ──
    const handleSkipAll = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        stopTtsAudio();
        if (pages.length > 0) {
            setPageIndex(pages.length - 1);
            skipToEnd();
        }
    }, [pages.length, skipToEnd, stopTtsAudio]);

    // ── Send message ──
    const handleSend = async () => {
        if (sendableInputBeats.length === 0 || isLoading) return;
        stopTtsAudio();
        const userBeats = sendableInputBeats;
        const text = formatTheaterUserBeatsForMessage(userBeats);
        setInputBeats([createInputBeat('speech')]);
        setShowInput(false);
        try { await onSendMessage(text, undefined, userBeats); } catch { addToast('发送失败，请重试', 'error'); }
    };

    // ── Handle whisper click ──
    const handleWhisperSelect = (w: InnerWhisper) => {
        if (isLoading || !onWhisperClick) return;
        onWhisperClick(w);
    };

    const updateInputBeat = useCallback((id: string, updates: Partial<TheaterUserBeat>) => {
        setInputBeats(prev => prev.map(beat => (
            beat.id === id ? { ...beat, ...updates } : beat
        )));
    }, []);

    const addInputBeat = useCallback((kind: TheaterBeatKind) => {
        setInputBeats(prev => [...prev, createInputBeat(kind)]);
    }, []);

    const removeInputBeat = useCallback((id: string) => {
        setInputBeats(prev => (
            prev.length <= 1
                ? [{ ...prev[0], text: '' }]
                : prev.filter(beat => beat.id !== id)
        ));
    }, []);

    const handleBeatKeyDown = (e: React.KeyboardEvent) => {
        // Ctrl+Enter or Cmd+Enter → send
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSend();
        }
        // Plain Enter → newline (default behavior, no preventDefault)
    };

    // ── Toggle auto ──
    const toggleAuto = (e: React.MouseEvent) => {
        e.stopPropagation();
        setAutoMode(v => !v);
    };

    // ── Theater Ending Ceremony State & Logic ──
    type EndingPhase = 'none' | 'gift' | 'gift-reaction' | 'farewell' | 'fade' | 'letter';
    const [endingPhase, setEndingPhase] = useState<EndingPhase>('none');
    const [giftInput, setGiftInput] = useState('');
    const [, setGiftReactionItems] = useState<{text: string, emotion: string}[]>([]);
    const [giftReactionQueue, setGiftReactionQueue] = useState<{text: string, emotion: string}[]>([]);
    const [, setFarewellItems] = useState<{text: string, emotion: string}[]>([]);
    const [farewellQueue, setFarewellQueue] = useState<{text: string, emotion: string}[]>([]);
    const [letterContent, setLetterContent] = useState('');
    const [endingLoading, setEndingLoading] = useState(false);
    const [endingCurrentText, setEndingCurrentText] = useState('');
    const [endingDisplayedText, setEndingDisplayedText] = useState('');
    const [, setEndingCurrentEmotion] = useState('normal');
    const letterRef = useRef<HTMLDivElement>(null);

    const parseEndingDialogue = (text: string) => {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const results: {text: string, emotion: string}[] = [];
        let curEmotion = 'normal';
        for (const line of lines) {
            const tagMatch = line.match(/^\[([a-zA-Z0-9_\-]+)\]\s*(.*)/);
            let content = line;
            if (tagMatch) { curEmotion = tagMatch[1].toLowerCase(); content = tagMatch[2]; }
            else {
                const standaloneTag = line.match(/^\[([a-zA-Z0-9_\-]+)\]$/);
                if (standaloneTag) { curEmotion = standaloneTag[1].toLowerCase(); continue; }
            }
            if (content) results.push({ text: content, emotion: curEmotion });
        }
        return results;
    };

    const handleStartEnding = () => {
        setShowExitModal(false);
        if (!onGenerateGiftReaction) {
            onExit('summary');
            return;
        }
        setEndingPhase('gift');
    };

    const handleSkipToSync = () => {
        setEndingPhase('none');
        setShowExitModal(false);
        onExit('summary');
    };

    const handleExitChoice = (syncMode: TheaterExitSyncMode) => {
        setShowExitModal(false);
        setEndingPhase('none');
        onExit(syncMode);
    };

    useEffect(() => {
        if (!endingCurrentText) { setEndingDisplayedText(''); return; }
        let i = 0;
        setEndingDisplayedText('');
        const timer = setInterval(() => {
            i++;
            setEndingDisplayedText(endingCurrentText.slice(0, i));
            if (i >= endingCurrentText.length) clearInterval(timer);
        }, 25);
        return () => clearInterval(timer);
    }, [endingCurrentText]);

    const processEndingDialogue = (queue: {text: string, emotion: string}[], setQueue: React.Dispatch<React.SetStateAction<{text: string, emotion: string}[]>>) => {
        if (queue.length === 0) return;
        const next = queue[0];
        setEndingCurrentText(next.text);
        if (next.emotion) setEndingCurrentEmotion(next.emotion);
        setQueue(queue.slice(1));
    };

    const handleSendGift = async () => {
        if (!giftInput.trim() || !onGenerateGiftReaction) return;
        setEndingLoading(true);
        try {
            const rawContent = await onGenerateGiftReaction(giftInput.trim());
            const items = parseEndingDialogue(rawContent);
            setGiftReactionItems(items);
            setGiftReactionQueue(items);
            setEndingPhase('gift-reaction');
            if (items.length > 0) processEndingDialogue(items, setGiftReactionQueue);
        } catch (e) {
            addToast('生成失败，已跳过', 'error');
            setEndingPhase('farewell');
            triggerFarewell();
        } finally {
            setEndingLoading(false);
        }
    };

    const triggerFarewell = async () => {
        if (!onGenerateFarewell) { setEndingPhase('letter'); triggerLetter(); return; }
        setEndingLoading(true);
        try {
            const rawContent = await onGenerateFarewell();
            const items = parseEndingDialogue(rawContent);
            setFarewellItems(items);
            setFarewellQueue(items);
            setEndingPhase('farewell');
            if (items.length > 0) processEndingDialogue(items, setFarewellQueue);
        } catch (e) {
            addToast('生成失败，已跳过', 'error');
            setEndingPhase('letter');
            triggerLetter();
        } finally {
            setEndingLoading(false);
        }
    };

    const triggerLetter = async () => {
        if (!onGenerateMetaLetter) { setEndingPhase('none'); onExit('summary'); return; }
        setEndingLoading(true);
        try {
            const rawContent = await onGenerateMetaLetter();
            setLetterContent(rawContent);
            if (onSaveMetaLetter) await onSaveMetaLetter(rawContent);
            setEndingPhase('letter');
        } catch (e) {
            addToast('信件生成失败', 'error');
            setEndingPhase('none');
            onExit('summary');
        } finally {
            setEndingLoading(false);
        }
    };

    const handleExportLetter = async () => {
        if (!letterRef.current) return;
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(letterRef.current, { scale: 3, backgroundColor: null, useCORS: true });
            const link = document.createElement('a');
            link.download = `letter-from-${char.name}-${new Date().toISOString().slice(0,10)}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            addToast('已保存', 'success');
        } catch (e) {
            addToast('导出失败', 'error');
        }
    };

    // ── Manual TTS: play current page on demand (with cache) ──
    const handleManualTts = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!currentPage || !characterTtsConfig?.apiKey) return;

        // If already playing, stop
        if (ttsPlaying || ttsSynthesizing) {
            stopTtsAudio();
            return;
        }

        if (currentPage.type === 'user') return;

        const cacheKey = currentPage.text;

        // Check cache first
        const cached = ttsCacheRef.current.get(cacheKey);
        if (cached) {
            playTtsBlob(cached);
            return;
        }

        // Fresh synthesis
        const controller = new AbortController();
        ttsAbortRef.current = controller;
        setTtsSynthesizing(true);

        (async () => {
            try {
                const result = await MinimaxTts.synthesizeSync(
                    currentPage.text,
                    characterTtsConfig,
                    undefined,
                    controller.signal,
                );
                if (controller.signal.aborted || !result?.blob) return;

                // Store in cache
                ttsCacheRef.current.set(cacheKey, result.blob);
                playTtsBlob(result.blob);
            } catch (err) {
                if (!controller.signal.aborted) {
                    console.error('[TheaterTTS] Manual synthesis failed:', err);
                    setTtsSynthesizing(false);
                }
            }
        })();
    }, [currentPage, characterTtsConfig, ttsPlaying, ttsSynthesizing, stopTtsAudio, playTtsBlob]);

    // ── Render ──
    return (
        <div className="h-full w-full relative bg-black overflow-hidden font-sans select-none flex flex-col" onClick={handleDialogClick}>
            {/* Background — dual-layer crossfade */}
            {bgLayers.back && (
                <div
                    className="theater-bg-layer theater-bg-crossfade-out"
                    style={{ background: bgLayers.back }}
                />
            )}
            <div
                className={`theater-bg-layer ${bgLayers.transitioning ? 'theater-bg-crossfade-in' : ''}`}
                style={{ background: bgLayers.front }}
            />
            {/* Gradient mask — replaces old panel background */}
            <div className="theater-vn-gradient-mask" />

            {/* Character Sprite */}
            {hasSprites && currentSprite && (
                <div className="absolute inset-x-0 bottom-0 h-[85%] flex items-end justify-center pointer-events-none z-10 overflow-hidden">
                    <img
                        src={currentSprite}
                        alt={char.name}
                        className="max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-all duration-300 origin-bottom"
                        style={{ transform: `translate(${spriteConfig.x}%, ${spriteConfig.y}%) scale(${spriteConfig.scale})` }}
                    />
                </div>
            )}

            {/* ════════ Transition Overlay ════════ */}
            {isTransitioning && (
                <div className="theater-transition-overlay">
                    <div className="theater-transition-content">
                        <div className="flex gap-2">
                            <button onClick={handleStartEnding} className="flex-1 py-3 text-sm font-bold rounded-xl transition-all" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>仪式感</button>
                            <button onClick={() => setShowInput(false)} className="py-3 px-4 text-sm font-bold rounded-xl transition-all" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>取消</button>
                        </div>
                        <div className="theater-transition-sub">场景切换中</div>
                        <div className="theater-transition-line" />
                    </div>
                </div>
            )}

            {/* Top Bar — minimal */}
            <div className="relative z-50 flex items-center justify-between px-4 pt-12 pb-3 shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowExitModal(true)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="rgba(255,255,255,0.6)" width={16} height={16}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </button>
                <div className="flex items-center gap-2">
                    <span className="text-white/30 text-[11px] font-medium tracking-wide">{location.name}</span>
                    {timelineLabel && (
                        <span className="text-emerald-400/40 text-[10px] font-medium">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={10} height={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }}><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>
                            {timelineLabel}
                        </span>
                    )}
                    <div className={`theater-time-badge theater-time-badge--${timeSlot}`} style={{ padding: '4px 10px', fontSize: 11 }}>
                        <TimeSlotIcon slot={timeSlot} size={12} className="theater-time-slot-icon" />
                        <span>{timeLabel.zh}</span>
                    </div>
                </div>
            </div>

            {showExitModal && (
                <div
                    className="absolute inset-0 z-[290] flex items-end justify-center px-4 pb-6 pt-20 sm:items-center sm:pb-0"
                    style={{ background: 'rgba(4, 4, 8, 0.72)', backdropFilter: 'blur(14px)' }}
                    onClick={() => setShowExitModal(false)}
                >
                    <div
                        className="w-full max-w-md rounded-[28px] p-4"
                        style={{
                            background: 'linear-gradient(180deg, rgba(24,22,31,0.96), rgba(10,10,16,0.98))',
                            border: '1px solid rgba(255,255,255,0.12)',
                            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                            animation: 'letterCardIn 0.32s ease-out both',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mb-3 px-1">
                            <div className="text-white/88 text-[15px] font-semibold tracking-wide">离开约会</div>
                            <div className="mt-1 text-white/42 text-xs leading-relaxed">可以把今天收成一段角色之后会自然记得的经历。</div>
                        </div>

                        <button
                            onClick={handleStartEnding}
                            className="group relative w-full overflow-hidden rounded-2xl p-[1px] text-left transition-all active:scale-[0.99]"
                            style={{
                                background: 'linear-gradient(135deg, rgba(255,196,218,0.9), rgba(255,255,255,0.18), rgba(255,116,169,0.55))',
                                boxShadow: '0 0 30px rgba(255,139,184,0.22), inset 0 0 18px rgba(255,255,255,0.08)',
                            }}
                        >
                            <div
                                className="relative rounded-2xl px-4 py-4"
                                style={{ background: 'linear-gradient(135deg, rgba(46,30,42,0.98), rgba(22,18,28,0.98))' }}
                            >
                                <div className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em]" style={{ color: 'rgba(255,215,228,0.92)', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }}>520</div>
                                <div className="flex items-center gap-3 pr-12">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(255,170,205,0.14)', border: '1px solid rgba(255,205,224,0.2)' }}>
                                        <span className="text-sm text-white/80">✦</span>
                                    </div>
                                    <div>
                                        <div className="text-[18px] font-semibold tracking-wide text-white">仪式感</div>
                                        <div className="mt-1 text-[12px] leading-relaxed text-white/56">交换礼物，收下他的回礼和一封信。</div>
                                    </div>
                                </div>
                            </div>
                        </button>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <button onClick={() => handleExitChoice('summary')} className="rounded-2xl px-3 py-3 text-xs font-medium tracking-wide text-white/72 transition-all active:scale-[0.98]" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.09)' }}>直接整理记忆</button>
                            <button onClick={() => handleExitChoice('raw')} className="rounded-2xl px-3 py-3 text-xs font-medium tracking-wide text-white/72 transition-all active:scale-[0.98]" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.09)' }}>同步原始记录</button>
                            <button onClick={() => handleExitChoice('none')} className="rounded-2xl px-3 py-3 text-xs font-medium tracking-wide text-white/54 transition-all active:scale-[0.98]" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>先离开一下</button>
                            <button onClick={() => setShowExitModal(false)} className="rounded-2xl px-3 py-3 text-xs font-medium tracking-wide text-white/70 transition-all active:scale-[0.98]" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>留在这里</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════ VN Dialog Box — borderless ════════ */}
            {!showInput && (
                <div className={`theater-vn-dialog ${hideDialog ? 'dialog-hidden' : ''}`} onClick={handleDialogClick}>
                    {/* Speaker badge */}
                    {shouldShowSpeakerBadge && (
                        <div className={`theater-vn-speaker-badge ${isUserPage ? 'user' : 'assistant'}`}>
                            <div className="theater-vn-speaker-avatar">
                                {speakerAvatar ? (
                                    <img src={speakerAvatar} alt={speakerName} />
                                ) : (
                                    <span>{speakerInitial}</span>
                                )}
                            </div>
                            <span>{isUserPage ? speakerName : char.name}</span>
                        </div>
                    )}

                    {/* Text area */}
                    {isLoading ? (
                        <div className="theater-vn-loading" role="status" aria-label={isDirectorLoading ? '场景准备中' : '回应生成中'}>
                            <div className="theater-vn-loading-dots">
                                <span /><span /><span />
                            </div>
                        </div>
                    ) : currentPage ? (
                        <div className={`theater-vn-text ${currentPage.type}`}>
                            {isSpeechPage && <span className="theater-vn-quote-mark open">{'\u201C'}</span>}
                            {displayed}
                            {!done && <span className="theater-vn-cursor" />}
                            {isSpeechPage && done && <span className="theater-vn-quote-mark close">{'\u201D'}</span>}
                        </div>
                    ) : (
                        <div className="theater-vn-text" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            点击屏幕开始对话…
                        </div>
                    )}

                    {/* Click to continue indicator */}
                    {done && !isLoading && !isLastPage && (
                        <div className="theater-vn-ctc">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20" width={12} height={12}>
                                <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
                            </svg>
                        </div>
                    )}

                    {/* End of conversation → tap hint */}
                    {done && !isLoading && isLastPage && pages.length > 0 && activeWhispers.length === 0 && (
                        <div className="theater-vn-ctc" style={{ fontSize: 10, letterSpacing: 2 }}>
                            点击回复
                        </div>
                    )}

                    {/* Inner Whispers — Glassmorphism floating options */}
                    {done && !isLoading && isLastPage && activeWhispers.length > 0 && (
                        <div className="theater-vn-whispers" onClick={e => e.stopPropagation()}>
                            {activeWhispers.map((w, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleWhisperSelect(w)}
                                    className="theater-vn-whisper-btn"
                                    style={{ animationDelay: `${i * 150}ms` }}
                                >
                                    <span className="theater-vn-whisper-text">{w.whisper}</span>
                                    {w.tone && <span className="theater-vn-whisper-tone">{w.tone}</span>}
                                </button>
                            ))}
                            <button
                                className="theater-vn-whisper-free"
                                onClick={() => setShowInput(true)}
                                style={{ animationDelay: `${activeWhispers.length * 150}ms` }}
                            >
                                <span>free 自由输入…</span>
                            </button>
                        </div>
                    )}

                    {/* Director Location Suggestion Card */}
                    {pendingLocationSuggestion && !isLoading && done && isLastPage && (
                        <div className="theater-vn-location-suggest" onClick={e => e.stopPropagation()}>
                            <div className="theater-vn-suggest-header">
                                <span className="theater-vn-suggest-icon">go</span>
                                <span className="theater-vn-suggest-label">
                                    想带你去 → {pendingLocationSuggestion.name}
                                </span>
                            </div>
                            <div className="theater-vn-suggest-actions">
                                <button
                                    className="theater-vn-suggest-accept"
                                    onClick={onAcceptLocationSuggestion}
                                >
                                    跟他走
                                </button>
                                <button
                                    className="theater-vn-suggest-decline"
                                    onClick={onDeclineLocationSuggestion}
                                >
                                    再待会儿
                                </button>
                            </div>
                        </div>
                    )}


                    {/* Bottom Control Bar */}
                    <div className="theater-vn-controls" onClick={e => e.stopPropagation()}>
                        {pageIndex > 0 && (
                            <button className="theater-vn-ctrl-btn" onClick={handlePrevPage}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                                <span>上页</span>
                            </button>
                        )}
                        <button className="theater-vn-ctrl-btn" onClick={(e) => { e.stopPropagation(); setShowLog(true); }}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                            <span>回顾</span>
                        </button>
                        <button className="theater-vn-ctrl-btn" onClick={(e) => { e.stopPropagation(); setHideDialog(true); }}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                            <span>隐藏</span>
                        </button>
                        <button className="theater-vn-ctrl-btn" onClick={handleSkipAll}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" /></svg>
                            <span>跳过</span>
                        </button>
                        {characterTtsConfig?.apiKey && currentPage?.role === 'assistant' && (
                            <button className={`theater-vn-ctrl-btn ${ttsPlaying || ttsSynthesizing ? 'active' : ''}`} onClick={handleManualTts}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill={ttsPlaying ? 'currentColor' : 'none'}/>
                                    {!ttsSynthesizing && <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>}
                                    {ttsSynthesizing && <path d="M15 10v4" strokeDasharray="2 2"><animate attributeName="stroke-dashoffset" from="0" to="4" dur="0.6s" repeatCount="indefinite"/></path>}
                                </svg>
                                <span>{ttsSynthesizing ? '合成…' : ttsPlaying ? '播放' : '听'}</span>
                            </button>
                        )}
                        <button className={`theater-vn-ctrl-btn ${autoMode ? 'active' : ''}`} onClick={toggleAuto}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
                            <span>自动</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Tap to restore dialog when hidden */}
            {hideDialog && (
                <div
                    className="absolute inset-0 z-30 cursor-pointer"
                    onClick={() => setHideDialog(false)}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                />
            )}

            {/* ════════ Input Area ════════ */}
            {showInput && (
                <div className="theater-vn-input-area" onClick={e => e.stopPropagation()}>
                    <div className="theater-vn-beat-list">
                        {inputBeats.map((beat, index) => (
                            <div key={beat.id} className={`theater-vn-beat-card ${beat.kind}`}>
                                <div className="theater-vn-beat-head">
                                    <div className="theater-vn-beat-toggle" role="group" aria-label="段落类型">
                                        <button
                                            type="button"
                                            className={beat.kind === 'speech' ? 'active' : ''}
                                            onClick={() => updateInputBeat(beat.id, { kind: 'speech' })}
                                        >
                                            台词
                                        </button>
                                        <button
                                            type="button"
                                            className={beat.kind === 'action' ? 'active' : ''}
                                            onClick={() => updateInputBeat(beat.id, { kind: 'action' })}
                                        >
                                            动作
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className="theater-vn-beat-remove"
                                        onClick={() => removeInputBeat(beat.id)}
                                        aria-label={inputBeats.length > 1 ? '删除段落' : '清空段落'}
                                        title={inputBeats.length > 1 ? '删除段落' : '清空段落'}
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="theater-vn-beat-input-shell">
                                    {beat.kind === 'speech' && <span className="theater-vn-beat-quote open">“</span>}
                                    <textarea
                                        value={beat.text}
                                        onChange={e => {
                                            updateInputBeat(beat.id, { text: e.target.value });
                                            const el = e.target;
                                            el.style.height = '42px';
                                            el.style.height = Math.min(el.scrollHeight, 92) + 'px';
                                        }}
                                        onKeyDown={handleBeatKeyDown}
                                        placeholder={isLoading ? '' : beat.kind === 'speech' ? '写一句要说的话…' : '写一个动作或停顿…'}
                                        disabled={isLoading}
                                        autoFocus={index === 0}
                                    />
                                    {beat.kind === 'speech' && <span className="theater-vn-beat-quote close">”</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="theater-vn-input-row">
                        <div className="theater-vn-beat-actions">
                            <button type="button" onClick={() => addInputBeat('speech')} disabled={isLoading}>
                                + 台词
                            </button>
                            <button type="button" onClick={() => addInputBeat('action')} disabled={isLoading}>
                                + 动作
                            </button>
                        </div>
                        <button
                            className="theater-vn-send-btn"
                            onClick={handleSend}
                            disabled={sendableInputBeats.length === 0 || isLoading}
                            aria-label="发送"
                            title="发送"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={20} height={20}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                            </svg>
                        </button>
                    </div>
                    <button
                        onClick={() => setShowInput(false)}
                        style={{ width: '100%', marginTop: 10, padding: '7px 0', fontSize: 11, color: 'rgba(255,255,255,0.25)', background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, cursor: 'pointer', letterSpacing: 1, fontWeight: 400 }}
                    >
                        ▾ 返回对话
                    </button>
                </div>
            )}

            {/* ════════ History Log ════════ */}
            {showLog && (
                <div className="theater-vn-log-overlay">
                    <div className="theater-vn-log-header">
                        <span className="theater-vn-log-title">对话记录</span>
                        <button className="theater-vn-log-close" onClick={() => setShowLog(false)}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={16} height={16}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="theater-vn-log-scroll">
                        {pages.map((page, index) => {
                            const sourceMessage = messageById.get(String(page.msgId));
                            const speaker = page.type === 'narration'
                                ? ''
                                : page.role === 'user'
                                    ? (userProfile.name || '你')
                                    : char.name;

                            return (
                                <div
                                    key={`${page.msgId}-${index}`}
                                    className={`theater-vn-log-item ${page.role} ${page.type}`}
                                    onContextMenu={(e) => {
                                        if (onForkFromMessage && sourceMessage) {
                                            e.preventDefault();
                                            onForkFromMessage(sourceMessage);
                                        }
                                    }}
                                >
                                    {speaker && (
                                        <div className={`theater-vn-log-item-name ${page.role === 'user' ? 'user' : ''}`}>
                                            {speaker}
                                        </div>
                                    )}
                                    <div className="theater-vn-log-item-text">{cleanText(page.text)}</div>
                                    {onForkFromMessage && sourceMessage && (
                                        <button
                                            className="theater-vn-log-fork-btn"
                                            onClick={(e) => { e.stopPropagation(); onForkFromMessage(sourceMessage); }}
                                            title="从这里分叉"
                                        >
                                            <span style={{ fontSize: 9, letterSpacing: 0.5 }}>分叉</span>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                        {pages.length === 0 && (
                            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', paddingTop: 40, fontSize: 13 }}>
                                暂无对话记录
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ====== Date Ending Ceremony Overlays ====== */}
            {endingPhase === 'gift' && (
                <div className="absolute inset-0 z-[300] flex flex-col items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}>
                    <button onClick={handleSkipToSync}
                        className="absolute top-6 right-6 text-white/30 text-xs tracking-wider hover:text-white/50 transition-colors z-10">
                        跳到整理 ›
                    </button>
                    <div className="w-[85%] max-w-sm" style={{ animation: 'letterCardIn 0.6s ease-out both' }}>
                        <div className="text-center mb-6">
                            <div className="text-white/60 text-sm font-light tracking-widest mb-1">交换礼物</div>
                            <div className="text-white/30 text-xs font-light">送一样东西给{char.name}吧</div>
                        </div>
                        <div className="bg-white/[0.08] backdrop-blur-xl rounded-2xl border border-white/[0.12] p-4">
                            <textarea
                                value={giftInput}
                                onChange={e => setGiftInput(e.target.value)}
                                placeholder="一首歌、一个拥抱、一句话、或者……"
                                className="w-full bg-transparent text-white/90 text-sm font-light placeholder:text-white/25 resize-none outline-none h-24 leading-relaxed"
                                autoFocus
                            />
                        </div>
                        <button
                            onClick={handleSendGift}
                            disabled={!giftInput.trim() || endingLoading}
                            className="w-full mt-4 py-3 rounded-2xl text-sm font-medium tracking-wider transition-all active:scale-[0.97] disabled:opacity-30"
                            style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {endingLoading ? '...' : '送出'}
                        </button>
                    </div>
                </div>
            )}
            {endingPhase === 'gift-reaction' && (
                <div className="absolute inset-0 z-[300] flex flex-col items-center justify-end"
                    style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
                    onClick={() => {
                        if (giftReactionQueue.length > 0) processEndingDialogue(giftReactionQueue, setGiftReactionQueue);
                        else { setEndingPhase('farewell'); triggerFarewell(); }
                    }}>
                    <button onClick={(e) => { e.stopPropagation(); handleSkipToSync(); }}
                        className="absolute top-6 right-6 text-white/30 text-xs tracking-wider hover:text-white/50 transition-colors z-10">
                        跳到整理 ›
                    </button>
                    <div className="w-[92%] max-w-lg mb-8 rounded-2xl p-5 pointer-events-none"
                        style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.85), rgba(0,0,0,0.7))', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="text-white/90 text-[15px] font-light leading-relaxed min-h-[3em]">{endingDisplayedText}</div>
                        {endingDisplayedText === endingCurrentText && giftReactionQueue.length === 0 && (
                            <div className="text-center text-white/30 text-[10px] mt-3 animate-pulse">点击继续</div>
                        )}
                    </div>
                </div>
            )}
            {endingPhase === 'farewell' && (
                <div className="absolute inset-0 z-[300] flex flex-col items-center justify-end"
                    style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
                    onClick={() => {
                        if (farewellQueue.length > 0) processEndingDialogue(farewellQueue, setFarewellQueue);
                        else { setEndingPhase('fade'); setTimeout(() => triggerLetter(), 1800); }
                    }}>
                    <button onClick={(e) => { e.stopPropagation(); handleSkipToSync(); }}
                        className="absolute top-6 right-6 text-white/30 text-xs tracking-wider hover:text-white/50 transition-colors z-10">
                        跳到整理 ›
                    </button>
                    <div className="w-[92%] max-w-lg mb-8 rounded-2xl p-5 pointer-events-none"
                        style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.85), rgba(0,0,0,0.7))', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {endingLoading ? <div className="text-white/40 text-sm text-center py-4 animate-pulse">……</div> : <div className="text-white/90 text-[15px] font-light leading-relaxed min-h-[3em]">{endingDisplayedText}</div>}
                        {!endingLoading && endingDisplayedText === endingCurrentText && farewellQueue.length === 0 && endingCurrentText && <div className="text-center text-white/30 text-[10px] mt-3 animate-pulse">点击继续</div>}
                    </div>
                </div>
            )}
            {endingPhase === 'fade' && (
                <div className="absolute inset-0 z-[310] bg-black" style={{ animation: 'fadeToBlack 1.5s ease-in both' }}>
                    {endingLoading && <div className="absolute inset-0 flex items-center justify-center"><div className="text-white/20 text-xs animate-pulse tracking-widest">……</div></div>}
                </div>
            )}
            {endingPhase === 'letter' && (
                <div className="absolute inset-0 z-[320] bg-black flex items-center justify-center overflow-y-auto" style={{ padding: '24px 16px' }}>
                    <button onClick={handleSkipToSync} className="absolute top-6 right-6 text-white/30 text-xs tracking-wider hover:text-white/50 transition-colors z-10">跳到整理 ›</button>
                    <div className="w-full max-w-md" style={{ animation: 'letterCardIn 0.8s ease-out 0.3s both' }}>
                        <div ref={letterRef} className="rounded-2xl p-8 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #faf6f0, #f5efe6)', boxShadow: '0 8px 40px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)' }}>
                            <img src="/images/paper-texture.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.06] mix-blend-multiply pointer-events-none" />
                            <div className="relative z-10">
                                {letterContent.split('\n').filter(l => l.trim()).map((line, i) => (
                                    <p key={i} className="text-[15px] leading-[2] mb-0" style={{ fontFamily: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif", color: '#3d3530', animation: `lineReveal 0.5s ease-out ${0.5 + i * 0.3}s both` }}>{line}</p>
                                ))}
                                <p className="text-right mt-6 text-sm" style={{ fontFamily: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif", color: '#8a7e75', animation: `lineReveal 0.5s ease-out ${0.5 + (letterContent.split('\n').filter(l => l.trim()).length) * 0.3}s both` }}>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6 justify-center" style={{ animation: `endingBtnIn 0.5s ease-out ${1 + (letterContent.split('\n').filter(l => l.trim()).length) * 0.3}s both` }}>
                            <button onClick={handleExportLetter} className="px-5 py-2.5 rounded-xl text-xs font-medium tracking-wider transition-all active:scale-[0.97]" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>保存原图</button>
                            <button onClick={() => { setEndingPhase('none'); onExit('summary'); }} className="px-5 py-2.5 rounded-xl text-xs font-medium tracking-wider transition-all active:scale-[0.97]" style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)' }}>收好这封信</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main VN Content Layer */}
            <TheaterSettings
                char={char}
                location={location}
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
            />

            {showWorldlineGuide && (
                <div className="pointer-events-auto absolute right-4 top-[5.7rem] z-[72] w-[min(18rem,calc(100vw-2rem))] rounded-[22px] border border-white/25 bg-black/40 p-3.5 text-[13px] leading-relaxed text-white shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                    <div className="mb-1 text-[12px] font-semibold tracking-[0.16em] text-white/70">吱吱吱探头。</div>
                    <p>戳约会里的小光球，可以切场景、调立绘，也能找到声音/语音入口。</p>
                    <p className="mt-1 text-white/70">约会途中想换地方，也从这里走。</p>
                    <div className="mt-3 flex justify-end">
                        <button
                            type="button"
                            onClick={handleCloseWorldlineGuide}
                            className="rounded-full bg-white/90 px-3.5 py-1.5 text-[12px] font-medium text-[#4d3341] active:scale-95"
                        >
                            知道啦
                        </button>
                    </div>
                </div>
            )}

            {/* Floating Ball */}
            <TheaterFloatingBall
                charId={char.id}
                onOpenSettings={() => setShowSettings(true)}
                onOpenFullLocationSheet={onOpenLocationSheet}
                bgmStatus={bgm.status}
                bgmEnabled={bgm.enabled}
                bgmVolume={bgm.volume}
                onBgmToggle={bgm.toggle}
                onBgmVolumeChange={bgm.setVolume}
                onBgmRegenerate={bgm.regenerate}
                isSummaryGenerating={isSummaryGenerating}
                hasPendingSummary={hasPendingSummary}
                canManualSummary={canManualSummary}
                canAutoSummary={canAutoSummary}
                summaryDisabledReason={summaryDisabledReason}
                onRequestSummary={onRequestSummary}
                onReviewPendingSummary={onReviewPendingSummary}
                onDiscardPendingSummary={onDiscardPendingSummary}
                onToggleAutoSummary={onToggleAutoSummary}
                onToggleAutoHideSummary={onToggleAutoHideSummary}
                onChangeThreshold={onChangeThreshold}
                onOpenSummarySettings={onOpenSummarySettings}
                savedSummaryCount={savedSummaryCount}
                onOpenSavedSummaries={onOpenSavedSummaries}
                theaterSummaryAutoEnabled={char.theaterSummaryAutoEnabled}
                theaterSummaryAutoHideEnabled={char.theaterSummaryAutoHideEnabled}
                theaterSummaryAutoThreshold={char.theaterSummaryAutoThreshold}
            />

            {/* Inline Location Sheet */}
            <InlineLocationSheet
                isOpen={showLocationSheet}
                onClose={onCloseLocationSheet}
                locations={locations}
                currentLocationId={location.id}
                visitedLocationIds={visitedLocationIds}
                timeSlot={timeSlot}
                onSelectLocation={onSelectLocation}
                onAddLocation={onAddLocation}
                onDeleteCustomLocation={onDeleteCustomLocation}
            />
        </div>
    );
};

export default TheaterSession;
