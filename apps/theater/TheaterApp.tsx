/**
 * TheaterApp — 520 约会 主入口
 * 模式流转: select → map → session
 * 导演引擎 (副API) + 角色扮演 (主API) 双API架构
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import { ContextBuilder } from '../../utils/context';
import { safeResponseJson } from '../../utils/safeApi';
import { extractThinking, extractInnerWhispers, type InnerWhisper } from '../../utils/thinkingExtractor';
import { getEmbeddingConfig, getSecondaryApiConfig } from '../../utils/runtimeConfig';
import { buildDatePreamble, buildIdentityIntro, buildTheaterScene, buildDateTail, buildDateTimeBlock } from '../../utils/datePrompts';
import { hasCompleteApiConfig } from '../../utils/apiValidation';
import { DEFAULT_DATE_SUMMARY_PROMPT, buildSummaryPrompt } from '../../utils/dateSummaryPrompts';
import { renderMarkdown } from '../../utils/markdownLite';
import { trackedApiRequest } from '../../utils/apiRequestLedger';
import type { CharacterProfile, Message, TheaterLocation, DirectorEvent, TheaterSessionState, TheaterTimeline, TransitionEvent, LocationSuggestion } from '../../types';
import { buildGiftExchangePrompt, buildFarewellPrompt, buildMetaLetterPrompt, formatSessionContextForEnding } from '../../utils/dateEndingPrompts';
import { TIME_SLOT_LABELS } from '../../types/theater';

import {
    buildRecentForbiddenMotifs,
    buildTheaterDirectorRecentContext,
    buildTheaterMainlineContinuityContext,
    buildTraditionalCallbackMemoryContext,
    chooseDirectorEventType,
    combineCallbackMemoryContext,
    computeWeights, shouldTriggerEvent, updatePity,
    createPityCounter, getInitialTimeSlot,
    getTheaterSummaryHiddenMsgIds,
    hasCallbackMemory,
    is520EventActive, generateSessionId, getAutoGradient,
    selectTheaterAutoSummaryTargetMessages,
    THEATER_AUTO_SUMMARY_SETTLE_BUFFER_COUNT,
} from '../../utils/theaterDirector';
import {
    buildDirectorPrompt, buildTheaterSceneInjection, buildInitialScenePrompt,
    build520ConfessionHint, parseDirectorResponse,
    buildTransitionDirectorPrompt, parseTransitionResponse, buildTransitionSceneInjection,
} from '../../utils/theaterPrompts';
import { getPresetLocations } from '../../utils/theaterLocations';
import {
    buildTheaterUserBeatsSystemNote,
    parseTheaterAssistantBeatReplyGroups,
    sanitizeTheaterUserBeats,
    stripTheaterBeatMarkers,
    type TheaterUserBeat,
} from '../../utils/theaterDialogueFormat';
import {
    saveTheaterSession,
    getCustomLocations, addCustomLocation as dbAddCustomLocation,
    deleteCustomLocation as dbDeleteCustomLocation,
    getVisitCounts, incrementVisitCount,
    getTimelines, saveTimeline, deleteTimeline as deleteTimelineStore,
    getActiveTimelineId, setActiveTimelineId,
    canCreateTimeline, generateTimelineLabel, getTimelineById,
    resolveForkChain, deleteTheaterBgImage,
} from '../../utils/db/theaterStore';
import { VectorMemoryRetriever } from '../../utils/vectorMemoryRetriever';

import TheaterMap from './TheaterMap';
import TheaterSession from './TheaterSession';
import Modal from '../../components/os/Modal';
import './theater.css';

type Mode = 'select' | 'timelines' | 'map' | 'session';
export type TheaterExitSyncMode = 'summary' | 'raw' | 'none';
type TheaterEndingAct = 'user-gift' | 'gift-reaction' | 'farewell' | 'meta-letter';

type SummaryDraft = {
    content: string;
    summaryType: 'auto' | 'manual';
    coveredMsgIds: number[];
    sessionStartMsgId: number;
    promptSnapshot: string;
    lastCoveredMsgId: number;
    fromPendingAuto?: boolean;
    /** Set only during exit flow — after saving, also create bridge + finishExit */
    bridgeOnSave?: boolean;
    injectToVectorMemory?: boolean;
};

const isTheaterMessage = (m: Message, branchId?: string) =>
    m.metadata?.source === 'theater' && !m.metadata?.hiddenFromUser
    && (branchId ? m.metadata?.branchId === branchId : true);

const isTheaterRawMessage = (m: Message, branchId?: string) =>
    m.metadata?.source === 'theater' && !m.metadata?.isSummary && !m.metadata?.isDateContextBridge
    && (branchId ? m.metadata?.branchId === branchId : true);

const isTheaterSummaryMessage = (m: Message) =>
    m.metadata?.source === 'theater' && m.metadata?.isSummary === true;

// hasCompleteApiConfig — imported from utils/apiValidation.ts

const fetchTheaterChatCompletion = (
    config: { baseUrl: string; apiKey: string; model?: string },
    body: Record<string, unknown>,
    reason: string,
    conversationId?: string,
    messageId?: number,
    userInitiated = false,
): Promise<Response> => {
    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    return trackedApiRequest({
        feature: 'theater',
        reason,
        model: typeof body.model === 'string' ? body.model : config.model,
        conversationId,
        messageId,
        userInitiated,
        url,
    }, () => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
    }));
};

const THEATER_ENDING_ACT_LABELS: Record<TheaterEndingAct, string> = {
    'user-gift': '用户送出的礼物',
    'gift-reaction': '角色回礼',
    farewell: '尾声对白',
    'meta-letter': '信件',
};

const cleanTheaterSummaryContent = (content: string) =>
    (content || '').replace(/\[[^\]]+\]\s*/g, '').trim();

const cleanTimelinePreview = (content?: string) =>
    stripTheaterBeatMarkers(content || '')
        .replace(/\[[^\]]+\]\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const formatTheaterMessagesForSummary = (messages: Message[], charName: string, userName: string): string => {
    return messages
        .map((msg) => {
            const speaker = msg.role === 'user' ? userName : msg.role === 'assistant' ? charName : '系统';
            const content = cleanTheaterSummaryContent(msg.content || '');
            if (!content) return '';
            if (msg.metadata?.isEndingCeremony) {
                const label = THEATER_ENDING_ACT_LABELS[msg.metadata.endingAct as TheaterEndingAct] || '散场记录';
                return `【${label}】${speaker}: ${content}`;
            }
            return `${speaker}: ${content}`;
        })
        .filter(line => line.trim().length > 0)
        .join('\n');
};

/**
 * Get messages visible in the current timeline.
 * For a forked timeline, includes shared ancestor messages up to the fork point + branch-own messages.
 */
const getTimelineVisibleMessages = (allMsgs: Message[], charId: string, timelineId: string): Message[] => {
    const chain = resolveForkChain(charId, timelineId);
    if (chain.length === 0) return [];

    const result: Message[] = [];
    const theaterMsgs = allMsgs.filter(m => m.metadata?.source === 'theater' && !m.metadata?.hiddenFromUser);

    for (let i = 0; i < chain.length; i++) {
        const segment = chain[i];
        const segmentMsgs = theaterMsgs.filter(m => m.metadata?.branchId === segment.timelineId);

        if (i < chain.length - 1) {
            // Ancestor segment — only include messages up to the next fork point
            const nextForkId = chain[i + 1].forkAfterMessageId;
            if (nextForkId !== null) {
                result.push(...segmentMsgs.filter(m => m.id <= nextForkId));
            } else {
                result.push(...segmentMsgs);
            }
        } else {
            // Current (leaf) segment — include all messages
            result.push(...segmentMsgs);
        }
    }

    return result.sort((a, b) => a.timestamp - b.timestamp);
};

const getCurrentTheaterSessionMessages = (msgs: Message[], branchId?: string) => {
    const theatMsgs = msgs.filter(m => isTheaterRawMessage(m, branchId)).sort((a, b) => a.timestamp - b.timestamp);
    const openingIndex = theatMsgs.map(m => m.metadata?.isOpening).lastIndexOf(true);
    return openingIndex >= 0 ? theatMsgs.slice(openingIndex) : theatMsgs;
};

const getTimelineRawMessagesForSummaryLookup = (allMsgs: Message[], charId: string, timelineId: string | null): Message[] => {
    if (!timelineId) return allMsgs.filter(m => isTheaterRawMessage(m)).sort((a, b) => a.timestamp - b.timestamp);
    const chain = resolveForkChain(charId, timelineId);
    const result: Message[] = [];

    for (let i = 0; i < chain.length; i++) {
        const segment = chain[i];
        const segmentMsgs = allMsgs.filter(m => isTheaterRawMessage(m, segment.timelineId));
        if (i < chain.length - 1) {
            const nextForkId = chain[i + 1].forkAfterMessageId;
            result.push(...(nextForkId !== null ? segmentMsgs.filter(m => m.id <= nextForkId) : segmentMsgs));
        } else {
            result.push(...segmentMsgs);
        }
    }

    return result.sort((a, b) => a.timestamp - b.timestamp);
};

const getSavedTheaterSummariesForTimeline = (allMsgs: Message[], charId: string, timelineId: string | null): Message[] => {
    const sessionMessages = getCurrentTheaterSessionMessages(getTimelineRawMessagesForSummaryLookup(allMsgs, charId, timelineId));
    if (sessionMessages.length === 0) return [];
    const sessionStartMsgId = sessionMessages[0].id;
    const sessionMsgIds = new Set(sessionMessages.map(m => m.id));
    return allMsgs
        .filter(isTheaterSummaryMessage)
        .filter(summary =>
            summary.metadata?.sessionStartMsgId === sessionStartMsgId
            || (
                Array.isArray(summary.metadata?.coveredMsgIds)
                && summary.metadata.coveredMsgIds.some((id: unknown) => typeof id === 'number' && sessionMsgIds.has(id))
            )
        )
        .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
};

const buildTheaterSummaryMemoryPrompt = (msgs: Message[]) => {
    const sessionMessages = getCurrentTheaterSessionMessages(msgs);
    if (sessionMessages.length === 0) return '';
    const sessionStartMsgId = sessionMessages[0].id;
    const sessionMsgIds = new Set(sessionMessages.map(m => m.id));
    const summaries = msgs
        .filter(isTheaterSummaryMessage)
        .filter(s => s.metadata?.sessionStartMsgId === sessionStartMsgId || (
            Array.isArray(s.metadata?.coveredMsgIds) && s.metadata.coveredMsgIds.some((id: unknown) => typeof id === 'number' && sessionMsgIds.has(id))
        ))
        .sort((a, b) => a.timestamp - b.timestamp);
    if (summaries.length === 0) return '';
    const blocks = summaries.map((s, i) => {
        const label = s.metadata?.summaryType === 'auto' ? '自动总结' : '手动总结';
        return `### 已总结片段 ${i + 1}（${label}）\n${s.content}`;
    }).join('\n\n');
    return `\n\n### 【本次约会的已总结上下文】\n以下是本次约会中较早内容的压缩总结。它们是刚才520约会已经发生过的事，不是新消息。请把这些当作共同经历的背景，和后续未总结原文自然衔接。\n\n${blocks}\n`;
};

const TheaterApp: React.FC = () => {
    const { closeApp, characters, setActiveCharacterId, apiConfig, addToast, userProfile, updateCharacter } = useOS();

    // ── Core State ──
    const [mode, setMode] = useState<Mode>('select');
    const [char, setChar] = useState<CharacterProfile | null>(null);

    // ── Timeline State ──
    const [currentTimelineId, setCurrentTimelineId] = useState<string | null>(null);
    const [charTimelines, setCharTimelines] = useState<TheaterTimeline[]>([]);

    // ── Session State ──
    const [session, setSession] = useState<TheaterSessionState | null>(null);
    const [locations, setLocations] = useState<TheaterLocation[]>([]);
    const [currentLocation, setCurrentLocation] = useState<TheaterLocation | null>(null);
    const [theaterMessages, setTheaterMessages] = useState<Message[]>([]);
    const [currentEvent, setCurrentEvent] = useState<DirectorEvent | null>(null);

    // ── Loading State ──
    const [isDirectorLoading, setIsDirectorLoading] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);

    // ── Inner Whispers State ──
    const [activeWhispers, setActiveWhispers] = useState<InnerWhisper[]>([]);

    // ── Fork UI State ──
    const [showForkModal, setShowForkModal] = useState(false);
    const [forkTargetMsg, setForkTargetMsg] = useState<Message | null>(null);
    const [forkLabel, setForkLabel] = useState('');

    // ── Summary State ──
    const [isSummaryGenerating, setIsSummaryGenerating] = useState(false);
    const [activeSummaryDraft, setActiveSummaryDraft] = useState<SummaryDraft | null>(null);
    const [pendingAutoSummary, setPendingAutoSummary] = useState<SummaryDraft | null>(null);
    const [showSummarySettings, setShowSummarySettings] = useState(false);
    const [summaryPromptDraft, setSummaryPromptDraft] = useState('');
    const [savedSummaryMessages, setSavedSummaryMessages] = useState<Message[]>([]);
    const [showSavedSummaries, setShowSavedSummaries] = useState(false);
    const [editingSavedSummary, setEditingSavedSummary] = useState<Message | null>(null);
    const [savedSummaryEditContent, setSavedSummaryEditContent] = useState('');
    const summaryGeneratingRef = useRef(false);

    // ── Gallery Carousel State ──
    const carouselRef = useRef<HTMLDivElement>(null);
    const autoScrollPaused = useRef(false);
    const [focusedCharId, setFocusedCharId] = useState<string | null>(null);
    const [selectingCharId, setSelectingCharId] = useState<string | null>(null);

    // ── Transition State ──
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [transitionLocationName, setTransitionLocationName] = useState('');
    // ── Director Location Suggestion ──
    const [pendingLocationSuggestion, setPendingLocationSuggestion] = useState<LocationSuggestion | null>(null);

    // ── Inline Location Sheet ──
    const [showLocationSheet, setShowLocationSheet] = useState(false);

    const secondaryApiConfig = getSecondaryApiConfig();
    const canManualSummary = hasCompleteApiConfig(secondaryApiConfig) || hasCompleteApiConfig(apiConfig);
    const canAutoSummary = hasCompleteApiConfig(secondaryApiConfig);
    const summaryDisabledReason = canManualSummary ? undefined : '请先配置主 API 或副 API';

    // ── Pity ref for non-stale access in callbacks ──
    const sessionRef = useRef(session);
    useEffect(() => { sessionRef.current = session; }, [session]);
    const timelineIdRef = useRef(currentTimelineId);
    useEffect(() => { timelineIdRef.current = currentTimelineId; }, [currentTimelineId]);

    // ── Keep local char in sync with global characters (e.g. after sprite config save) ──
    useEffect(() => {
        if (!char) return;
        const latest = characters.find(c => c.id === char.id);
        if (latest && latest !== char) setChar(latest);
    }, [characters, char]);

    // ── Init locations ──
    useEffect(() => {
        const presets = getPresetLocations();
        const custom = getCustomLocations();
        const counts = getVisitCounts();
        const merged = [...presets, ...custom].map(loc => ({
            ...loc,
            visitCount: counts[loc.id] || loc.visitCount || 0,
        }));
        setLocations(merged);
    }, []);

    // ── Auto-scroll gallery carousel ──
    useEffect(() => {
        if (mode !== 'select' || characters.length <= 2) return;
        const el = carouselRef.current;
        if (!el) return;
        let rafId: number;
        const tick = () => {
            if (!autoScrollPaused.current && el) {
                el.scrollLeft += 0.35;
                if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 1) {
                    el.scrollLeft = 0;
                }
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [mode, characters.length]);

    // ── IntersectionObserver: detect centered poster for focus highlight ──
    useEffect(() => {
        if (mode !== 'select') return;
        const el = carouselRef.current;
        if (!el) return;
        const posters = el.querySelectorAll<HTMLElement>('.theater-gallery-poster');
        if (posters.length === 0) return;

        // Auto-focus first card on mount if <= 2
        if (characters.length <= 2 && characters.length > 0) {
            setFocusedCharId(characters[0].id);
        }

        const observer = new IntersectionObserver(
            (entries) => {
                // Pick the entry with highest intersection ratio
                let best: IntersectionObserverEntry | null = null;
                for (const entry of entries) {
                    if (!best || entry.intersectionRatio > best.intersectionRatio) {
                        best = entry;
                    }
                }
                if (best && best.intersectionRatio >= 0.6) {
                    const charId = (best.target as HTMLElement).dataset.charId || null;
                    setFocusedCharId(charId);
                }
            },
            { root: el, threshold: [0, 0.3, 0.6, 0.85, 1] }
        );

        posters.forEach(p => observer.observe(p));
        return () => observer.disconnect();
    }, [mode, characters.length]);

    // ── Character Selection ──
    const handleSelectChar = useCallback(async (c: CharacterProfile) => {
        setChar(c);
        setActiveCharacterId(c.id);

        // Check for existing timelines
        const timelines = getTimelines(c.id);
        setCharTimelines(timelines);

        if (timelines.length > 0) {
            // Has timelines → show timeline selection
            setMode('timelines');
        } else {
            // No timelines → start fresh, create initial timeline implicitly on first location select
            const newSession: TheaterSessionState = {
                sessionId: generateSessionId(),
                charId: c.id,
                currentLocationId: '',
                timeSlot: getInitialTimeSlot(),
                locationChangeCount: 0,
                pity: createPityCounter(),
                eventHistory: [],
                visitedLocationIds: [],
                is520Event: is520EventActive(),
                startedAt: Date.now(),
                lastActiveAt: Date.now(),
            };
            setSession(newSession);
            setCurrentTimelineId(null); // will be created on first location
            setMode('map');
        }
    }, [locations, setActiveCharacterId]);

    /** Staged poster click: animate → then navigate */
    const handlePosterClick = useCallback((c: CharacterProfile) => {
        if (selectingCharId) return; // prevent double-click
        setSelectingCharId(c.id);
        autoScrollPaused.current = true;
        setTimeout(() => {
            handleSelectChar(c);
            // Reset after navigation (in case user comes back)
            setSelectingCharId(null);
        }, 620);
    }, [selectingCharId, handleSelectChar]);

    // ── Timeline Selection ──
    const handleSelectTimeline = useCallback(async (timeline: TheaterTimeline) => {
        if (!char) return;
        setSession(timeline.session);
        setCurrentTimelineId(timeline.timelineId);
        setActiveTimelineId(char.id, timeline.timelineId);
        const loc = locations.find(l => l.id === timeline.session.currentLocationId);
        if (loc) setCurrentLocation(loc);

        // Load timeline-specific messages
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const visibleMsgs = getTimelineVisibleMessages(allMsgs, char.id, timeline.timelineId);
        setTheaterMessages(visibleMsgs);
        setSavedSummaryMessages(getSavedTheaterSummariesForTimeline(allMsgs, char.id, timeline.timelineId));

        if (loc) {
            setMode('session');
        } else {
            setMode('map');
        }
    }, [char, locations]);

    const handleStartNewTimeline = useCallback(() => {
        if (!char) return;
        if (!canCreateTimeline(char.id)) {
            addToast('世界线数量已达上限 (8)', 'error');
            return;
        }
        const newSession: TheaterSessionState = {
            sessionId: generateSessionId(),
            charId: char.id,
            currentLocationId: '',
            timeSlot: getInitialTimeSlot(),
            locationChangeCount: 0,
            pity: createPityCounter(),
            eventHistory: [],
            visitedLocationIds: [],
            is520Event: is520EventActive(),
            startedAt: Date.now(),
            lastActiveAt: Date.now(),
        };
        setSession(newSession);
        setCurrentTimelineId(null); // will be created on first location
        setSavedSummaryMessages([]);
        setShowSavedSummaries(false);
        setMode('map');
    }, [char, addToast]);

    const handleDeleteTimeline = useCallback((timelineId: string) => {
        if (!char) return;
        deleteTimelineStore(char.id, timelineId);
        setCharTimelines(prev => prev.filter(t => t.timelineId !== timelineId));
        addToast('世界线已删除', 'info');
    }, [char, addToast]);

    // ── Location Selection ──
    const handleSelectLocation = useCallback(async (loc: TheaterLocation) => {
        if (!char || !session) {
            console.warn('[Theater] handleSelectLocation: no char or session', { char: !!char, session: !!session });
            return;
        }

        const isFirstLocation = !session.currentLocationId;
        const isNewLocation = loc.id !== session.currentLocationId;
        const prevLocation = currentLocation; // 旧地点（转场用）

        // ── 更新 session ──
        let updatedSession = {
            ...session,
            currentLocationId: loc.id,
            lastActiveAt: Date.now(),
            timeSlot: getInitialTimeSlot(), // ★ 实时时间感知
        };

        if (isNewLocation) {
            updatedSession.locationChangeCount += 1;
            if (!updatedSession.visitedLocationIds.includes(loc.id)) {
                updatedSession.visitedLocationIds.push(loc.id);
            }
            const newCount = incrementVisitCount(loc.id);
            loc = { ...loc, visitCount: newCount, lastVisitTime: Date.now() };
            setLocations(prev => prev.map(l => l.id === loc.id ? loc : l));
        }

        setSession(updatedSession);
        setCurrentEvent(null);

        // ── Timeline creation ──
        let tlId = currentTimelineId;
        try {
            if (!tlId) {
                const timeSlotZh = TIME_SLOT_LABELS[updatedSession.timeSlot]?.zh || '';
                tlId = crypto.randomUUID();
                const newTimeline: TheaterTimeline = {
                    timelineId: tlId, charId: char.id,
                    label: generateTimelineLabel(loc.name, timeSlotZh, char.id),
                    createdAt: Date.now(), lastActiveAt: Date.now(),
                    parentTimelineId: null, forkAfterMessageId: null,
                    session: updatedSession, locationName: loc.name,
                    messageCount: 0, preview: '',
                };
                saveTimeline(newTimeline);
                setActiveTimelineId(char.id, tlId);
                setCurrentTimelineId(tlId);
                setCharTimelines(prev => [...prev, newTimeline]);
            }
            persistSessionToTimeline(updatedSession, tlId, loc.name);
        } catch (e) {
            console.error('[Theater] Timeline creation failed:', e);
        }

        // ══════════════════════════════════════
        //  分支：第一个地点 vs 换地点（转场）
        // ══════════════════════════════════════

        if (isFirstLocation || !prevLocation || !isNewLocation) {
            // ── 第一个地点 or 同地点：直接进入 ──
            setCurrentLocation(loc);
            setMode('session');
            if (isNewLocation) {
                await generateInitialScene(loc, updatedSession, tlId);
            }
            return;
        }

        // ── 换地点：转场流程 ──
        // 先进入 session（但不切背景，旧背景还在）
        setMode('session');

        // ① 插入系统叙述消息
        await DB.saveMessage({
            charId: char.id, role: 'user', type: 'text',
            content: `（提议去${loc.name}。）`,
            metadata: {
                source: 'theater', branchId: tlId,
                locationId: prevLocation.id,
                isTransitionTrigger: true,
            },
        });
        await refreshTimelineMessages();

        // ② 调导演生成转场事件
        let transitionEvent: TransitionEvent | null = null;
        const secondaryConfig = getSecondaryApiConfig();
        if (secondaryConfig?.baseUrl && secondaryConfig?.apiKey) {
            setIsDirectorLoading(true);
            try {
                const prompt = buildTransitionDirectorPrompt(
                    char.name, userProfile.name,
                    prevLocation, loc,
                    updatedSession.timeSlot, updatedSession.eventHistory,
                );
                const resp = await fetchTheaterChatCompletion(
                    secondaryConfig,
                    {
                        model: secondaryConfig.model || apiConfig!.model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.7,
                    },
                    '约会转场导演事件',
                    char.id,
                    undefined,
                    false,
                );
                if (resp.ok) {
                    const data = await safeResponseJson(resp);
                    transitionEvent = parseTransitionResponse(data.choices[0].message.content);
                }
            } catch (e) {
                console.warn('[Theater] Transition director failed:', e);
            } finally {
                setIsDirectorLoading(false);
            }
        }

        // ③ 调主 API 生成转场叙事
        if (apiConfig?.baseUrl) {
            setIsAiLoading(true);
            try {
                const allMsgs = await DB.getMessagesByCharId(char.id);
                const continuityContext = buildTheaterMainlineContinuityContext(allMsgs, char.name, userProfile.name);
                let systemPrompt = buildDatePreamble(char.name, userProfile.name);
                systemPrompt += ContextBuilder.buildCoreContext(char, userProfile);
                systemPrompt += buildIdentityIntro(char.name, userProfile.name);
                systemPrompt += continuityContext;

                if (transitionEvent) {
                    systemPrompt += buildTransitionSceneInjection(
                        transitionEvent, prevLocation, loc, updatedSession.timeSlot,
                    );
                }

                const REQUIRED_EMOTIONS = ['normal', 'happy', 'angry', 'sad', 'shy'];
                const dateEmotions = [...REQUIRED_EMOTIONS, ...(char.customDateSprites || [])];
                const userPov = char.datePerspective || 'second';
                const charPov = char.dateCharPerspective || 'third';
                systemPrompt += buildTheaterScene(char.name, userProfile.name, dateEmotions, userPov, charPov, updatedSession.timeSlot, undefined, undefined, char.gender ?? 'male');
                systemPrompt += buildDateTail(char.name, userProfile.name, userPov, charPov, char.gender ?? 'male');

                const theaterMsgs = allMsgs
                    .filter(m => isTheaterMessage(m, tlId || undefined))
                    .sort((a, b) => a.timestamp - b.timestamp);
                const limit = char.contextLimit || 500;
                const historyMsgs = theaterMsgs.slice(-limit).map(m => ({
                    role: m.role,
                    content: m.type === 'image' ? '[User sent an image]' : m.content,
                }));

                const transitionHint = transitionEvent
                    ? `\n\n(System: 转场已触发。写一段从${prevLocation.name}到${loc.name}的完整叙事。严格遵守沉浸互动格式。)`
                    : `\n\n(System: 你们正在从${prevLocation.name}去${loc.name}。写一段转场叙事。严格遵守沉浸互动格式。)`;

                const resp = await fetchTheaterChatCompletion(
                    apiConfig,
                    {
                        model: apiConfig.model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            ...historyMsgs,
                            { role: 'user', content: `（去${loc.name}吧。）` + transitionHint },
                        ],
                        temperature: 0.85,
                    },
                    '约会转场叙事',
                    char.id,
                    undefined,
                    true,
                );

                if (!resp.ok) throw new Error('API Error');
                const data = await safeResponseJson(resp);
                const raw = data.choices[0].message.content;
                const extracted = extractThinking(raw);
                const whisperResult = extractInnerWhispers(extracted.content);

                await DB.saveMessage({
                    charId: char.id, role: 'assistant', type: 'text',
                    content: whisperResult.content,
                    metadata: {
                        source: 'theater', branchId: tlId,
                        locationId: prevLocation.id,
                        isTransition: true,
                        transitionTo: loc.id,
                        thinking: extracted.thinking,
                    },
                });

                if (whisperResult.whispers.length > 0) {
                    setActiveWhispers(whisperResult.whispers);
                }

                await refreshTimelineMessages();
            } catch (e) {
                console.error('[Theater] Transition narrative error:', e);
                addToast('转场叙事生成失败', 'error');
            } finally {
                setIsAiLoading(false);
            }
        }

        // ④ 视觉转场 → 切换到新地点
        setTransitionLocationName(loc.name);
        setIsTransitioning(true);
        // 等 2 秒让用户看到转场动画
        await new Promise(r => setTimeout(r, 2000));
        setCurrentLocation(loc);
        // 再等 0.5 秒让新背景 crossfade in
        await new Promise(r => setTimeout(r, 500));
        setIsTransitioning(false);
        setTransitionLocationName('');

    }, [char, session, currentLocation, currentTimelineId, apiConfig, userProfile, addToast]);

    /** Helper: persist session state into the current timeline object */
    const persistSessionToTimeline = (sess: TheaterSessionState, tlId: string | null, locationName?: string) => {
        if (!char || !tlId) {
            // Fallback: save to legacy key
            saveTheaterSession(sess);
            return;
        }
        const existing = getTimelineById(char.id, tlId);
        if (existing) {
            const updated: TheaterTimeline = {
                ...existing,
                session: sess,
                lastActiveAt: Date.now(),
                ...(locationName ? { locationName } : {}),
            };
            saveTimeline(updated);
        }
    };

    // ── Generate Initial Scene (entering a new location) ──
    const generateInitialScene = async (loc: TheaterLocation, sess: TheaterSessionState, tlId: string | null = currentTimelineId) => {
        if (!char || !apiConfig?.baseUrl) return;

        setIsAiLoading(true);
        try {
            const scenePrompt = buildInitialScenePrompt(loc, sess.timeSlot, char.name, userProfile.name);
            const allMsgs = await DB.getMessagesByCharId(char.id);
            const continuityContext = buildTheaterMainlineContinuityContext(allMsgs, char.name, userProfile.name);

            // Build system prompt (reuse date mode prompts)
            let systemPrompt = buildDatePreamble(char.name, userProfile.name);
            systemPrompt += ContextBuilder.buildCoreContext(char, userProfile);
            systemPrompt += buildIdentityIntro(char.name, userProfile.name);
            systemPrompt += continuityContext;
            systemPrompt += `\n\n${scenePrompt}`;

            const REQUIRED_EMOTIONS = ['normal', 'happy', 'angry', 'sad', 'shy'];
            const dateEmotions = [...REQUIRED_EMOTIONS, ...(char.customDateSprites || [])];
            const userPov = char.datePerspective || 'second';
            const charPov = char.dateCharPerspective || 'third';
            systemPrompt += buildTheaterScene(char.name, userProfile.name, dateEmotions, userPov, charPov, sess.timeSlot, undefined, undefined, char.gender ?? 'male');

            const response = await fetchTheaterChatCompletion(
                apiConfig,
                {
                    model: apiConfig.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `（你们刚到 ${loc.name}。请写一段到场描写。）` },
                    ],
                    temperature: 0.85,
                },
                '约会地点开场',
                char.id,
                undefined,
                true,
            );

            if (!response.ok) throw new Error('API Error');
            const data = await safeResponseJson(response);
            const raw = data.choices[0].message.content;
            const extracted = extractThinking(raw);
            const whisperResult = extractInnerWhispers(extracted.content);

            await DB.saveMessage({
                charId: char.id, role: 'assistant', type: 'text',
                content: whisperResult.content,
                metadata: { source: 'theater', branchId: tlId, isOpening: true, locationId: loc.id, thinking: extracted.thinking },
            });

            await refreshTimelineMessages();
        } catch (e) {
            console.error('[Theater] Initial scene error:', e);
            addToast('场景加载失败', 'error');
        } finally {
            setIsAiLoading(false);
        }
    };

    /** Refresh messages for the current timeline */
    const refreshTimelineMessages = async () => {
        if (!char) return;
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const tlId = timelineIdRef.current;
        if (tlId) {
            setTheaterMessages(getTimelineVisibleMessages(allMsgs, char.id, tlId));
            setSavedSummaryMessages(getSavedTheaterSummariesForTimeline(allMsgs, char.id, tlId));
        } else {
            // Legacy fallback (no timeline yet)
            setTheaterMessages(allMsgs.filter(m => isTheaterMessage(m)).sort((a, b) => a.timestamp - b.timestamp));
            setSavedSummaryMessages(getSavedTheaterSummariesForTimeline(allMsgs, char.id, null));
        }
        return allMsgs;
    };

    const getCurrentTimelineSessionMessages = useCallback((allMsgs: Message[]): Message[] => {
        if (!char) return [];
        return getCurrentTheaterSessionMessages(
            getTimelineRawMessagesForSummaryLookup(allMsgs, char.id, currentTimelineId),
        );
    }, [char, currentTimelineId]);

    const getCurrentTimelineSavedSummaries = useCallback((allMsgs: Message[]): Message[] => {
        if (!char) return [];
        return getSavedTheaterSummariesForTimeline(allMsgs, char.id, currentTimelineId);
    }, [char, currentTimelineId]);

    const getCurrentTimelineLabel = useCallback((): string | undefined => {
        if (!currentTimelineId) return undefined;
        return charTimelines.find(t => t.timelineId === currentTimelineId)?.label;
    }, [charTimelines, currentTimelineId]);

    // ── Send Message (with director engine integration) ──
    const handleSendMessage = useCallback(async (text: string, directorHint?: string, userBeats?: TheaterUserBeat[]) => {
        if (!char || !currentLocation || !session || !apiConfig?.baseUrl) return;

        // 0. Clear whispers from previous turn
        setActiveWhispers([]);
        const normalizedUserBeats = sanitizeTheaterUserBeats(userBeats || []);

        // 1. Save user message
        const userMessageId = await DB.saveMessage({
            charId: char.id, role: 'user', type: 'text', content: text,
            metadata: {
                source: 'theater',
                branchId: currentTimelineId,
                locationId: currentLocation.id,
                ...(normalizedUserBeats.length > 0 ? { theaterUserBeats: normalizedUserBeats } : {}),
            },
        });

        // Refresh messages
        let allMsgs = await refreshTimelineMessages() || await DB.getMessagesByCharId(char.id);
        const mainlineContinuityContext = buildTheaterMainlineContinuityContext(allMsgs, char.name, userProfile.name);
        const theaterMsgsForDirector = allMsgs
            .filter(m => isTheaterMessage(m, currentTimelineId || undefined))
            .sort((a, b) => a.timestamp - b.timestamp);
        const theaterDirectorContext = buildTheaterDirectorRecentContext(
            theaterMsgsForDirector,
            char.name,
            userProfile.name,
        );
        const recentDirectorContext = [theaterDirectorContext, mainlineContinuityContext]
            .filter(Boolean)
            .join('\n\n');
        const recentForbiddenMotifs = buildRecentForbiddenMotifs(session.eventHistory);

        // 2. Check pity system — should we trigger a director event?
        const triggered = shouldTriggerEvent(session.pity);
        let directorEvent: DirectorEvent | null = null;

        if (triggered) {
            // 2a. Build callback memory first, so callback only fires from real memory.
            const traditionalMemory = buildTraditionalCallbackMemoryContext(char);
            let vectorMemory: string | null = null;
            const embeddingConfig = getEmbeddingConfig();
            if (char.vectorMemoryEnabled && embeddingConfig.apiKey) {
                try {
                    vectorMemory = await VectorMemoryRetriever.retrieve(
                        char.id,
                        char.name,
                        userProfile.name,
                        theaterMsgsForDirector,
                        embeddingConfig.apiKey,
                        apiConfig,
                        char.moodState as any,
                    );
                } catch (e) {
                    console.warn('[Theater] Callback vector memory retrieval failed:', e);
                }
            }
            const callbackMemoryContext = combineCallbackMemoryContext(traditionalMemory, vectorMemory);
            const canUseCallback = hasCallbackMemory(callbackMemoryContext);

            // 2b. Roll event type
            const weights = computeWeights(currentLocation, session.timeSlot, session.eventHistory, session.is520Event);
            const eventType = chooseDirectorEventType(weights, canUseCallback);

            // 2c. Call director (secondary API)
            const secondaryConfig = getSecondaryApiConfig();
            if (secondaryConfig?.baseUrl && secondaryConfig?.apiKey) {
                setIsDirectorLoading(true);
                try {
                    const directorPrompt = buildDirectorPrompt(
                        char.name, userProfile.name, currentLocation,
                        session.timeSlot, eventType, session.eventHistory,
                        eventType === 'callback' ? callbackMemoryContext : undefined,
                        locations.map(l => l.name), // ★ 已有地点列表
                        true, // ★ 允许建议换场景
                        {
                            recentContext: recentDirectorContext,
                            recentForbiddenMotifs,
                        },
                    );

                    const dirResponse = await fetchTheaterChatCompletion(
                        secondaryConfig,
                        {
                            model: secondaryConfig.model || apiConfig.model,
                            messages: [{ role: 'user', content: directorPrompt }],
                            temperature: 0.7,
                        },
                        '约会导演事件',
                        char.id,
                        undefined,
                        false,
                    );

                    if (dirResponse.ok) {
                        const dirData = await safeResponseJson(dirResponse);
                        const rawDir = dirData.choices[0].message.content;
                        directorEvent = parseDirectorResponse(rawDir);
                    }
                } catch (e) {
                    console.warn('[Theater] Director call failed, proceeding without event:', e);
                } finally {
                    setIsDirectorLoading(false);
                }
            }
        }

        // 3. Update pity
        const updatedPity = updatePity(session.pity, !!directorEvent);
        const updatedSession = {
            ...session,
            pity: updatedPity,
            eventHistory: directorEvent ? [...session.eventHistory, directorEvent] : session.eventHistory,
            lastActiveAt: Date.now(),
            timeSlot: getInitialTimeSlot(), // ★ 每次对话刷新实时时间
        };
        setSession(updatedSession);
        persistSessionToTimeline(updatedSession, currentTimelineId, currentLocation.name);

        if (directorEvent) {
            setCurrentEvent(directorEvent);
        }

        // ── 导演建议换场景 ──
        if (directorEvent?.locationSuggestion) {
            setPendingLocationSuggestion(directorEvent.locationSuggestion);
        }

        // 4. Call main API (character roleplay)
        setIsAiLoading(true);
        try {
            let systemPrompt = buildDatePreamble(char.name, userProfile.name);
            systemPrompt += ContextBuilder.buildCoreContext(char, userProfile);
            systemPrompt += buildIdentityIntro(char.name, userProfile.name);
            systemPrompt += mainlineContinuityContext;
            systemPrompt += buildTheaterSummaryMemoryPrompt(
                getTimelineRawMessagesForSummaryLookup(allMsgs, char.id, currentTimelineId),
            );

            // Inject director event if triggered
            if (directorEvent) {
                systemPrompt += buildTheaterSceneInjection(directorEvent, currentLocation, session.timeSlot);
            }

            // 520 confession hint (night + romantic + 520 event)
            if (session.is520Event && session.timeSlot === 'night' && directorEvent?.sceneType === 'romantic') {
                systemPrompt += build520ConfessionHint(char.name);
            }

            const REQUIRED_EMOTIONS = ['normal', 'happy', 'angry', 'sad', 'shy'];
            const dateEmotions = [...REQUIRED_EMOTIONS, ...(char.customDateSprites || [])];
            const userPov = char.datePerspective || 'second';
            const charPov = char.dateCharPerspective || 'third';
            systemPrompt += buildTheaterScene(char.name, userProfile.name, dateEmotions, userPov, charPov, session.timeSlot, undefined, undefined, char.gender ?? 'male');
            systemPrompt += buildDateTail(char.name, userProfile.name, userPov, charPov, char.gender ?? 'male');

            // Build history
            allMsgs = await DB.getMessagesByCharId(char.id);
            const theaterMsgs = allMsgs.filter(m => isTheaterMessage(m, currentTimelineId || undefined)).sort((a, b) => a.timestamp - b.timestamp);
            const limit = char.contextLimit || 500;
            const historyMsgs = theaterMsgs.slice(-limit, -1).map(m => ({
                role: m.role,
                content: m.type === 'image' ? '[User sent an image]' : m.content,
            }));

            let eventNote = directorEvent
                ? `\n\n(System: 导演事件已触发 [${directorEvent.sceneType}]。你必须在回复中自然地对这个事件做出反应。严格遵守沉浸互动格式。)`
                : `\n\n(System: 严格遵守沉浸互动格式。每一行都要以 [emotion] 开头。)`;
            if (directorHint) {
                eventNote += `\n<director_note>${directorHint}</director_note>`;
            }
            eventNote += buildTheaterUserBeatsSystemNote(normalizedUserBeats, userProfile.name, char.name);

            const response = await fetchTheaterChatCompletion(
                apiConfig,
                {
                    model: apiConfig.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...historyMsgs,
                        { role: 'user', content: text + eventNote },
                    ],
                    temperature: 0.85,
                },
                directorHint ? '约会导演提示回复' : '约会聊天回复',
                char.id,
                userMessageId,
                true,
            );

            if (!response.ok) throw new Error('API Error');
            const data = await safeResponseJson(response);
            const raw = data.choices[0].message.content;
            const extracted = extractThinking(raw);
            // Extract inner whispers from the cleaned content
            const whisperResult = extractInnerWhispers(extracted.content);
            const cleanContent = whisperResult.content;
            const assistantBeatReplyParse = parseTheaterAssistantBeatReplyGroups(cleanContent, 'pending');
            const hasCompleteBeatReplies = assistantBeatReplyParse.hasBeatMarkers
                && assistantBeatReplyParse.unassignedPages.length === 0;
            const contentForDb = stripTheaterBeatMarkers(cleanContent);
            const assistantBeatReplies = hasCompleteBeatReplies
                ? assistantBeatReplyParse.groups.map(group => ({
                    beatIndex: group.beatIndex,
                    content: group.content,
                }))
                : [];

            await DB.saveMessage({
                charId: char.id, role: 'assistant', type: 'text',
                content: contentForDb,
                metadata: {
                    source: 'theater',
                    branchId: currentTimelineId,
                    locationId: currentLocation.id,
                    directorEvent: directorEvent?.sceneType || null,
                    thinking: extracted.thinking,
                    ...(assistantBeatReplies.length > 0 ? { theaterAssistantBeatReplies: assistantBeatReplies } : {}),
                },
            });

            // Surface whispers to the UI
            if (whisperResult.whispers.length > 0) {
                setActiveWhispers(whisperResult.whispers);
            }

            // Update timeline preview
            if (currentTimelineId) {
                const tl = getTimelineById(char.id, currentTimelineId);
                if (tl) {
                    saveTimeline({ ...tl, preview: contentForDb.slice(0, 50), messageCount: tl.messageCount + 1, lastActiveAt: Date.now() });
                }
            }

            const freshMsgs = await refreshTimelineMessages() || await DB.getMessagesByCharId(char.id);
            void maybeTriggerAutoSummary(freshMsgs);
        } catch (e) {
            console.error('[Theater] AI response error:', e);
            addToast('回复生成失败', 'error');
        } finally {
            setIsAiLoading(false);
        }
    }, [char, currentLocation, session, apiConfig, userProfile, addToast]);

    // ── Add Custom Location ──
    const handleAddLocation = useCallback((loc: TheaterLocation) => {
        dbAddCustomLocation(loc);
        setLocations(prev => [...prev, loc]);
        addToast(`已添加「${loc.name}」`, 'success');
    }, [addToast]);

    // ── Delete Custom Location ──
    const handleDeleteCustomLocation = useCallback((id: string) => {
        dbDeleteCustomLocation(id);
        deleteTheaterBgImage(id).catch(() => {}); // best-effort cleanup
        setLocations(prev => prev.filter(l => l.id !== id));
        addToast('已删除自定义地点', 'info');
    }, [addToast]);

    // ── 接受导演建议的换场景 ──
    const handleAcceptLocationSuggestion = useCallback(async () => {
        if (!pendingLocationSuggestion || !char) return;
        const suggestion = pendingLocationSuggestion;
        setPendingLocationSuggestion(null);

        // 查找已有地点（模糊匹配名称）
        let targetLoc = locations.find(l =>
            l.name === suggestion.name ||
            l.name.includes(suggestion.name) ||
            suggestion.name.includes(l.name)
        );

        if (!targetLoc) {
            // ── 自动创建新地点 ──
            const newId = `dir_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            targetLoc = {
                id: newId,
                name: suggestion.name,
                nameEn: suggestion.nameEn,
                description: suggestion.description,
                tags: suggestion.tags as any[],
                bgGradient: getAutoGradient(suggestion.tags),
                isPreset: false,
                visitCount: 0,
                // bgImage 留空，用户之后可以上传
            };
            dbAddCustomLocation(targetLoc);
            setLocations(prev => [...prev, targetLoc!]);
            addToast(`发现新地点「${suggestion.name}」`, 'success');
        }

        // 触发换地点流程（复用 handleSelectLocation）
        await handleSelectLocation(targetLoc);
    }, [pendingLocationSuggestion, char, locations, handleSelectLocation, addToast]);

    const handleDeclineLocationSuggestion = useCallback(() => {
        setPendingLocationSuggestion(null);
    }, []);

    // ══════════════════════════════════════════════
    //  Summary System (ported from DateApp)
    // ══════════════════════════════════════════════

    const generateSummaryDraft = async (summaryType: 'auto' | 'manual'): Promise<SummaryDraft | null> => {
        if (!char || summaryGeneratingRef.current) return null;
        const secondaryConfig = getSecondaryApiConfig();
        const selectedApi = summaryType === 'auto'
            ? secondaryConfig
            : (hasCompleteApiConfig(secondaryConfig) ? secondaryConfig : apiConfig);
        if (!hasCompleteApiConfig(selectedApi)) {
            if (summaryType === 'manual') addToast('请先配置 API', 'error');
            return null;
        }
        summaryGeneratingRef.current = true;
        setIsSummaryGenerating(true);
        try {
            const allMsgs = await DB.getMessagesByCharId(char.id);
            const sessionMessages = getCurrentTimelineSessionMessages(allMsgs);
            if (sessionMessages.length === 0) { if (summaryType === 'manual') addToast('还没有可总结的约会内容', 'info'); return null; }
            const targetMessages = summaryType === 'auto'
                ? selectTheaterAutoSummaryTargetMessages(sessionMessages, char.theaterSummaryLastAutoMsgId)
                : sessionMessages;
            const threshold = char.theaterSummaryAutoThreshold || 20;
            if (summaryType === 'auto' && targetMessages.length < threshold) return null;
            if (targetMessages.length < 4) { if (summaryType === 'manual') addToast('消息太少，无法总结', 'info'); return null; }
            const promptSnapshot = char.theaterSummaryPrompt?.trim() || DEFAULT_DATE_SUMMARY_PROMPT;
            const prompt = buildSummaryPrompt(char.name, userProfile.name, new Date().toLocaleString(), targetMessages, promptSnapshot);
            const response = await fetchTheaterChatCompletion(
                selectedApi,
                {
                    model: selectedApi.model,
                    messages: [
                        { role: 'system', content: '你负责把520约会记录整理成可供角色之后自然记住的总结。只输出总结正文。' },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.45,
                },
                summaryType === 'auto' ? '约会自动摘要更新' : '约会手动摘要生成',
                char.id,
                undefined,
                summaryType === 'manual',
            );
            if (!response.ok) throw new Error(`Summary API Error: ${response.status}`);
            const data = await safeResponseJson(response);
            const extracted = extractThinking(data.choices?.[0]?.message?.content || '');
            const content = extracted.content.trim();
            if (!content) throw new Error('Summary content empty');
            const coveredMsgIds = targetMessages.map(m => m.id);
            return {
                content, summaryType, coveredMsgIds,
                sessionStartMsgId: sessionMessages[0].id, promptSnapshot,
                lastCoveredMsgId: coveredMsgIds[coveredMsgIds.length - 1],
            };
        } catch (e: any) {
            if (summaryType === 'manual') addToast(`总结生成失败: ${e.message || e}`, 'error');
            else console.warn('[TheaterSummary] auto summary failed:', e);
            return null;
        } finally {
            summaryGeneratingRef.current = false;
            setIsSummaryGenerating(false);
        }
    };

    /**
     * Generate a comprehensive exit summary:
     * Combines existing auto-summaries + unsummarized raw messages into one complete summary.
     */
    const generateExitSummaryDraft = async (): Promise<SummaryDraft | null> => {
        if (!char || summaryGeneratingRef.current) return null;
        const secondaryConfig = getSecondaryApiConfig();
        const selectedApi = hasCompleteApiConfig(secondaryConfig) ? secondaryConfig : apiConfig;
        if (!hasCompleteApiConfig(selectedApi)) { addToast('请先配置 API', 'error'); return null; }

        summaryGeneratingRef.current = true;
        setIsSummaryGenerating(true);
        try {
            const allMsgs = await DB.getMessagesByCharId(char.id);
            const sessionMessages = getCurrentTimelineSessionMessages(allMsgs);
            if (sessionMessages.length === 0) { addToast('还没有可总结的约会内容', 'info'); return null; }

            const sessionStartMsgId = sessionMessages[0].id;
            const sessionMsgIds = new Set(sessionMessages.map(m => m.id));

            // Gather existing auto-summaries for this session
            const savedSummaries = allMsgs
                .filter(isTheaterSummaryMessage)
                .filter(s => s.metadata?.sessionStartMsgId === sessionStartMsgId
                    || (Array.isArray(s.metadata?.coveredMsgIds) && s.metadata.coveredMsgIds.some((id: unknown) => typeof id === 'number' && sessionMsgIds.has(id as number))))
                .sort((a, b) => a.timestamp - b.timestamp);

            // Gather IDs covered by existing summaries
            const coveredByExistingSummaries = new Set<number>();
            for (const s of savedSummaries) {
                if (Array.isArray(s.metadata?.coveredMsgIds)) {
                    for (const id of s.metadata.coveredMsgIds) {
                        if (typeof id === 'number') coveredByExistingSummaries.add(id);
                    }
                }
            }

            // Find messages NOT yet covered by any summary
            const unsummarizedMessages = sessionMessages.filter(m => !coveredByExistingSummaries.has(m.id));

            // Build the prompt: summaries + new raw messages
            const promptSnapshot = char.theaterSummaryPrompt?.trim() || DEFAULT_DATE_SUMMARY_PROMPT;
            let exitPromptContent = '';

            if (savedSummaries.length > 0) {
                const summaryBlocks = savedSummaries.map((s, i) => `### 已总结片段 ${i + 1}\n${s.content}`).join('\n\n');
                exitPromptContent += `【之前的阶段总结】\n${summaryBlocks}\n\n`;
            }

            if (unsummarizedMessages.length > 0) {
                const rawBlock = formatTheaterMessagesForSummary(unsummarizedMessages, char.name, userProfile.name);
                exitPromptContent += `【未总结的新记录】\n${rawBlock}\n\n`;
            } else if (savedSummaries.length > 0) {
                exitPromptContent += '（所有内容均已在上方总结中覆盖）\n\n';
            }

            if (!exitPromptContent.trim()) { addToast('没有可总结的内容', 'info'); return null; }

            const fullPrompt = `你正在为 ${char.name} 和 ${userProfile.name} 的一次 520 约会写最终隐藏记忆。
请把下面所有内容（包括已总结的片段和新增原始记录）合并成一份完整的、连贯的记忆。

当前时间: ${new Date().toLocaleString()}

${exitPromptContent}
【输出要求】
- 使用 Markdown。
- 写成 ${char.name} 之后能自然记得、在线上聊天时自然接住的经历。
- 保留地点、关键事件、${userProfile.name}送出的礼物、${char.name}的回赠、尾声对白、信件，以及关系里细微变化的地方。
- 不要生成新的剧情，不要改写已经发生的事实。
- 不要美化成没有发生过的事。
- 不要写报告口吻，不要出现“总结如下”。
- 把之前的总结片段和新内容融合成一份流畅的整体，不要简单拼接。`;

            const response = await fetchTheaterChatCompletion(
                selectedApi,
                {
                    model: selectedApi.model,
                    messages: [
                        { role: 'system', content: '你负责把520约会的所有记录整理成一份完整的最终总结。只输出总结正文。' },
                        { role: 'user', content: fullPrompt },
                    ],
                    temperature: 0.45,
                },
                '约会退出最终摘要',
                char.id,
                undefined,
                true,
            );
            if (!response.ok) throw new Error(`Summary API Error: ${response.status}`);
            const data = await safeResponseJson(response);
            const extracted = extractThinking(data.choices?.[0]?.message?.content || '');
            const content = extracted.content.trim();
            if (!content) throw new Error('Exit summary content empty');

            const allCoveredMsgIds = sessionMessages.map(m => m.id);
            return {
                content, summaryType: 'manual', coveredMsgIds: allCoveredMsgIds,
                sessionStartMsgId, promptSnapshot,
                lastCoveredMsgId: allCoveredMsgIds[allCoveredMsgIds.length - 1],
            };
        } catch (e: any) {
            addToast(`总结生成失败: ${e.message || e}`, 'error');
            return null;
        } finally {
            summaryGeneratingRef.current = false;
            setIsSummaryGenerating(false);
        }
    };

    const hideCoveredMsgIds = async (coveredMsgIds: number[], summaryMsgId: number) => {
        const idsToHide = getTheaterSummaryHiddenMsgIds(coveredMsgIds, THEATER_AUTO_SUMMARY_SETTLE_BUFFER_COUNT);
        if (idsToHide.length === 0) return;
        await Promise.all(idsToHide.map(id => DB.updateMessageMetadata(id, {
            hiddenFromUser: true, dateSummaryAutoHidden: true, hiddenBySummaryMsgId: summaryMsgId,
        })));
    };

    const saveSummaryDraft = async (draft: SummaryDraft) => {
        if (!char) return;
        const content = draft.content.trim();
        if (!content) {
            addToast('总结内容不能为空', 'error');
            return;
        }
        // Save summary as pure summary — NO bridge flag in metadata.
        const savedId = await DB.saveMessage({
            charId: char.id, role: 'system', type: 'text', content,
            metadata: {
                source: 'theater', hiddenFromUser: true, isSummary: true, summaryType: draft.summaryType,
                coveredMsgIds: draft.coveredMsgIds, sessionStartMsgId: draft.sessionStartMsgId, promptSnapshot: draft.promptSnapshot,
            },
        });
        if (char.theaterSummaryAutoHideEnabled) await hideCoveredMsgIds(draft.coveredMsgIds, savedId);
        if (draft.summaryType === 'auto') updateCharacter(char.id, { theaterSummaryLastAutoMsgId: draft.lastCoveredMsgId });
        if (draft.fromPendingAuto || pendingAutoSummary?.lastCoveredMsgId === draft.lastCoveredMsgId) setPendingAutoSummary(null);
        setActiveSummaryDraft(null);
        await refreshTimelineMessages();
        
        if (draft.injectToVectorMemory) {
            try {
                const { getEmbeddingConfig, hasCloudSyncTarget } = await import('../../utils/runtimeConfig');
                const { EmbeddingService } = await import('../../utils/embeddingService');
                const { markVectorMemoryAsPendingSync, markVectorMemoryAsLocalOnly, markVectorMemoryAsSynced } = await import('../../utils/vectorMemorySyncState');
                const { pushMemories } = await import('../../utils/backendClient');

                const embedConfig = getEmbeddingConfig();
                const embedKey = embedConfig.apiKey;
                
                if (!embedKey) {
                    addToast('无法刻入向量记忆：未配置 Embedding API Key', 'error');
                } else {
                    const vector = await EmbeddingService.embed(content, 'VECTOR_MEMORY', embedKey);
                    const newMemId = crypto.randomUUID();
                    const newMem = {
                        id: newMemId,
                        charId: char.id,
                        title: '约会记忆总结',
                        content,
                        vector,
                        modelId: embedConfig.model,
                        source: 'import' as const,
                        importance: 5,
                        createdAt: Date.now(),
                        mentionCount: 0,
                        lastMentioned: 0,
                        sourceMessageIds: Array.isArray(draft.coveredMsgIds) ? draft.coveredMsgIds.filter(id => typeof id === 'number') as number[] : [],
                    };
                    
                    const isCloud = hasCloudSyncTarget();
                    const finalMem = isCloud ? markVectorMemoryAsPendingSync(newMem) : markVectorMemoryAsLocalOnly(newMem);
                    await DB.saveVectorMemory(finalMem);
                    
                    if (isCloud) {
                        pushMemories(char.id, [finalMem]).then(success => {
                            if (success) {
                                DB.saveVectorMemory(markVectorMemoryAsSynced(finalMem)).catch(() => {});
                            }
                        }).catch(() => {});
                    }
                    addToast('已存入永久记忆库', 'success');
                }
            } catch (e: any) {
                console.error('[TheaterApp] Save vector memory failed', e);
                addToast('向量记忆写入失败，但总结已保存', 'error');
            }
        }

        // If this save was triggered from exit flow, create bridge then exit
        if (draft.bridgeOnSave) {
            const bridged = await createBridgeFromSummary();
            addToast(bridged ? '总结已同步到主聊天' : '总结已保存', 'success');
            finishExit();
        } else {
            addToast('总结已保存', 'success');
        }
    };

    const discardSummaryDraft = () => {
        if (!char || !activeSummaryDraft) return;
        if (activeSummaryDraft.summaryType === 'auto') {
            updateCharacter(char.id, { theaterSummaryLastAutoMsgId: activeSummaryDraft.lastCoveredMsgId });
            setPendingAutoSummary(null);
        }
        setActiveSummaryDraft(null);
        addToast('已丢弃总结草稿', 'info');
    };

    const discardPendingAutoSummary = () => {
        if (!char || !pendingAutoSummary) return;
        updateCharacter(char.id, { theaterSummaryLastAutoMsgId: pendingAutoSummary.lastCoveredMsgId });
        setPendingAutoSummary(null);
        addToast('已丢弃自动总结', 'info');
    };

    const requestManualSummary = async () => {
        const draft = await generateSummaryDraft('manual');
        if (draft) setActiveSummaryDraft(draft);
    };

    const maybeTriggerAutoSummary = async (msgs: Message[]) => {
        if (!char || !char.theaterSummaryAutoEnabled || pendingAutoSummary || summaryGeneratingRef.current) return;
        if (!hasCompleteApiConfig(getSecondaryApiConfig())) return;
        const sessionMessages = getCurrentTheaterSessionMessages(msgs);
        const eligibleMessages = selectTheaterAutoSummaryTargetMessages(sessionMessages, char.theaterSummaryLastAutoMsgId);
        const threshold = char.theaterSummaryAutoThreshold || 20;
        if (eligibleMessages.length < threshold) return;
        const draft = await generateSummaryDraft('auto');
        if (draft) setPendingAutoSummary(draft);
    };

    const compressExistingSummaries = async () => {
        if (!char) return;
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const summaries = allMsgs.filter(isTheaterSummaryMessage).sort((a, b) => a.timestamp - b.timestamp);
        for (const summary of summaries) {
            if (!Array.isArray(summary.metadata?.coveredMsgIds)) continue;
            const ids = summary.metadata.coveredMsgIds.filter((id: unknown): id is number => typeof id === 'number');
            await hideCoveredMsgIds(ids, summary.id);
        }
        await refreshTimelineMessages();
    };

    const openSummarySettings = () => {
        if (!char) return;
        setSummaryPromptDraft(char.theaterSummaryPrompt || DEFAULT_DATE_SUMMARY_PROMPT);
        setShowSummarySettings(true);
    };

    const saveSummarySettings = () => {
        if (!char) return;
        updateCharacter(char.id, { theaterSummaryPrompt: summaryPromptDraft.trim() || DEFAULT_DATE_SUMMARY_PROMPT });
        setShowSummarySettings(false);
        addToast('总结设置已保存', 'success');
    };

    const openSavedSummaryEditor = (summary: Message) => {
        setShowSavedSummaries(false);
        setEditingSavedSummary(summary);
        setSavedSummaryEditContent(summary.content);
    };

    const closeSavedSummaryEditor = () => {
        setEditingSavedSummary(null);
        setSavedSummaryEditContent('');
    };

    const saveSavedSummaryEdit = async () => {
        if (!editingSavedSummary) return;
        const content = savedSummaryEditContent.trim();
        if (!content) {
            addToast('总结内容不能为空', 'error');
            return;
        }

        await DB.updateMessage(editingSavedSummary.id, content);
        const allMsgs = await DB.getMessagesByCharId(editingSavedSummary.charId);
        const bridges = allMsgs.filter(m =>
            m.metadata?.source === editingSavedSummary.metadata?.source
            && m.metadata?.isDateContextBridge === true
            && m.metadata?.summarySourceMsgId === editingSavedSummary.id
        );
        await Promise.all(bridges.map(bridge => DB.updateMessage(bridge.id, content)));

        closeSavedSummaryEditor();
        await refreshTimelineMessages();
        setShowSavedSummaries(true);
        addToast('总结已保存', 'success');
    };

    // ══════════════════════════════════════════════
    //  Exit & Sync
    // ══════════════════════════════════════════════

    const finishExit = () => {
        // Timeline data is persisted — do NOT delete. Just reset UI state.
        setPendingAutoSummary(null);
        setActiveSummaryDraft(null);
        setMode('select');
        setSession(null);
        setChar(null);
        setCurrentLocation(null);
        setCurrentTimelineId(null);
        setTheaterMessages([]);
        setSavedSummaryMessages([]);
        setShowSavedSummaries(false);
        setEditingSavedSummary(null);
        setSavedSummaryEditContent('');
        setCurrentEvent(null);
        setIsTransitioning(false);
        setTransitionLocationName('');
        setPendingLocationSuggestion(null);
    };

    // ══════════════════════════════════════════════
    //  Timeline Fork (世界线分叉)
    // ══════════════════════════════════════════════

    const handleForkFromMessage = useCallback(async (msg: Message, label: string) => {
        if (!char || !session || !currentTimelineId) return;
        if (!canCreateTimeline(char.id)) {
            addToast('世界线数量已达上限 (8)', 'error');
            return;
        }

        const forkedSession: TheaterSessionState = {
            ...session,
            sessionId: generateSessionId(),
        };

        const tlId = crypto.randomUUID();
        const autoLabel = label.trim() || generateTimelineLabel(
            currentLocation?.name || '',
            TIME_SLOT_LABELS[session.timeSlot]?.zh || '',
            char.id,
        );

        const newTimeline: TheaterTimeline = {
            timelineId: tlId,
            charId: char.id,
            label: autoLabel,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
            parentTimelineId: currentTimelineId,
            forkAfterMessageId: msg.id,
            session: forkedSession,
            locationName: currentLocation?.name || '',
            messageCount: 0,
            preview: '',
        };

        saveTimeline(newTimeline);
        setActiveTimelineId(char.id, tlId);
        setCurrentTimelineId(tlId);
        setSession(forkedSession);
        setCharTimelines(prev => [...prev, newTimeline]);

        // Refresh messages for the new forked timeline
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const visibleMsgs = getTimelineVisibleMessages(allMsgs, char.id, tlId);
        setTheaterMessages(visibleMsgs);

        setShowForkModal(false);
        setForkTargetMsg(null);
        setForkLabel('');
        addToast(`新世界线「${autoLabel}」已创建`, 'success');
    }, [char, session, currentTimelineId, currentLocation, addToast]);

    /** Remove all bridge messages created during this theater session */
    const cleanSessionBridges = async () => {
        if (!char) return;
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const sessionMessages = getCurrentTimelineSessionMessages(allMsgs);
        if (sessionMessages.length === 0) return;
        const sessionMsgIds = new Set(sessionMessages.map(m => m.id));
        const sessionStartMsgId = sessionMessages[0].id;
        // Find bridge messages that belong to this session
        const bridges = allMsgs.filter(m =>
            m.metadata?.source === 'theater'
            && m.metadata?.isDateContextBridge === true
            && (
                m.metadata?.sessionStartMsgId === sessionStartMsgId
                || (Array.isArray(m.metadata?.coveredMsgIds) && m.metadata.coveredMsgIds.some((id: unknown) => typeof id === 'number' && sessionMsgIds.has(id as number)))
            )
        );
        if (bridges.length > 0) {
            await DB.deleteMessages(bridges.map(m => m.id));
            console.log(`[Theater] Cleaned ${bridges.length} bridge messages on 'none' exit`);
        }
    };

    /** Create a bridge message from an existing saved summary */
    const createBridgeFromSummary = async (): Promise<boolean> => {
        if (!char) return false;
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const sessionMessages = getCurrentTimelineSessionMessages(allMsgs);
        if (sessionMessages.length === 0) return false;
        const sessionStartMsgId = sessionMessages[0].id;
        const sessionMsgIds = new Set(sessionMessages.map(m => m.id));
        // Find the latest saved summary for this session
        const savedSummary = allMsgs
            .filter(isTheaterSummaryMessage)
            .sort((a, b) => b.timestamp - a.timestamp || b.id - a.id)
            .find(m =>
                m.metadata?.sessionStartMsgId === sessionStartMsgId
                || (Array.isArray(m.metadata?.coveredMsgIds) && m.metadata.coveredMsgIds.some((id: unknown) => typeof id === 'number' && sessionMsgIds.has(id as number)))
            );
        if (!savedSummary) return false;
        // Check if a bridge for this summary already exists
        const existingBridge = allMsgs.find(m =>
            m.metadata?.source === 'theater'
            && m.metadata?.isDateContextBridge === true
            && m.metadata?.summarySourceMsgId === savedSummary.id
        );
        if (existingBridge) return true; // Already bridged
        const coveredMsgIds = Array.isArray(savedSummary.metadata?.coveredMsgIds)
            ? savedSummary.metadata.coveredMsgIds.filter((id: unknown): id is number => typeof id === 'number')
            : sessionMessages.map(m => m.id);
        await DB.saveMessage({
            charId: char.id, role: 'system', type: 'text', content: savedSummary.content,
            metadata: {
                source: 'theater', hiddenFromUser: true, isDateContextBridge: true, bridgeType: 'summary',
                coveredMsgIds, sessionStartMsgId, summarySourceMsgId: savedSummary.id,
                promptSnapshot: savedSummary.metadata?.promptSnapshot || '',
            },
        });
        return true;
    };

    // ====== Theater Ending Three-Act Ceremony API Calls ======

    const getEndingContextBundle = async (): Promise<{ allMsgs: Message[]; sessionMessages: Message[]; savedSummaries: Message[]; sessionContext: string }> => {
        if (!char) return { allMsgs: [], sessionMessages: [], savedSummaries: [], sessionContext: '' };
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const sessionMessages = getCurrentTimelineSessionMessages(allMsgs);
        const savedSummaries = getCurrentTimelineSavedSummaries(allMsgs);
        const sessionContext = formatSessionContextForEnding(sessionMessages, char.name, userProfile.name, {
            locationName: currentLocation?.name,
            timeSlotLabel: session ? TIME_SLOT_LABELS[session.timeSlot]?.zh : undefined,
            timelineLabel: getCurrentTimelineLabel(),
            savedSummaries,
            eventHistory: session?.eventHistory || [],
            currentEvent,
        });
        return { allMsgs, sessionMessages, savedSummaries, sessionContext };
    };

    const retrieveEndingVectorMemory = async (contextMessages: Message[]): Promise<string | null> => {
        if (!char || !char.vectorMemoryEnabled) return null;
        const embeddingConfig = getEmbeddingConfig();
        if (!embeddingConfig.apiKey) return null;
        try {
            return await VectorMemoryRetriever.retrieve(
                char.id,
                char.name,
                userProfile.name,
                contextMessages.filter(m => !m.metadata?.hiddenFromUser),
                embeddingConfig.apiKey,
                apiConfig,
            );
        } catch (e) {
            console.warn('[TheaterEnding] Vector memory retrieval failed:', e);
            return null;
        }
    };

    const buildEndingSystemPrompt = async (contextMessages: Message[]): Promise<string> => {
        if (!char) return '';
        let systemPrompt = buildDatePreamble(char.name, userProfile.name);
        systemPrompt += ContextBuilder.buildCoreContext(char, userProfile, true);
        systemPrompt += buildIdentityIntro(char.name, userProfile.name);
        systemPrompt += buildDateTimeBlock();
        const vectorMemory = await retrieveEndingVectorMemory(contextMessages);
        if (vectorMemory?.trim()) {
            systemPrompt += `\n\n### 【相关长期记忆 · 向量检索】\n${vectorMemory.trim()}\n`;
        }
        return systemPrompt;
    };

    const saveEndingCeremonyMessage = async (
        endingAct: TheaterEndingAct,
        role: Message['role'],
        content: string,
        extraMetadata: Record<string, any> = {},
    ): Promise<number | null> => {
        if (!char) return null;
        const trimmed = content.trim();
        if (!trimmed) return null;
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const sessionMessages = getCurrentTimelineSessionMessages(allMsgs);
        const sessionStartMsgId = sessionMessages.length > 0 ? sessionMessages[0].id : undefined;
        return DB.saveMessage({
            charId: char.id,
            role,
            type: 'text',
            content: trimmed,
            metadata: {
                source: 'theater',
                branchId: currentTimelineId,
                locationId: currentLocation?.id,
                hiddenFromUser: true,
                isEndingCeremony: true,
                endingAct,
                sessionStartMsgId,
                ...extraMetadata,
            },
        });
    };

    const handleGenerateGiftReaction = async (userGift: string): Promise<string> => {
        if (!char || !session) throw new Error('No char');
        await saveEndingCeremonyMessage('user-gift', 'user', userGift, { userGift });
        const { sessionMessages, sessionContext } = await getEndingContextBundle();
        const systemPrompt = await buildEndingSystemPrompt(sessionMessages);

        const prompt = buildGiftExchangePrompt(char.name, userProfile.name, userGift, sessionContext);

        const response = await fetchTheaterChatCompletion(
            apiConfig,
            {
                model: apiConfig.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.85,
            },
            '约会散场礼物回应',
            char.id,
            undefined,
            true,
        );
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await safeResponseJson(response);
        const extracted = extractThinking(data.choices?.[0]?.message?.content || '');
        const content = extracted.content.trim();
        await saveEndingCeremonyMessage('gift-reaction', 'assistant', content);
        return content;
    };

    const handleGenerateFarewell = async (): Promise<string> => {
        if (!char || !session) throw new Error('No char');
        const { sessionMessages, sessionContext } = await getEndingContextBundle();
        const systemPrompt = await buildEndingSystemPrompt(sessionMessages);

        const prompt = buildFarewellPrompt(char.name, userProfile.name, sessionContext);

        const response = await fetchTheaterChatCompletion(
            apiConfig,
            {
                model: apiConfig.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.85,
            },
            '约会散场告别',
            char.id,
            undefined,
            true,
        );
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await safeResponseJson(response);
        const extracted = extractThinking(data.choices?.[0]?.message?.content || '');
        const content = extracted.content.trim();
        await saveEndingCeremonyMessage('farewell', 'assistant', content);
        return content;
    };

    const handleGenerateMetaLetter = async (): Promise<string> => {
        if (!char || !session) throw new Error('No char');
        const { allMsgs, sessionMessages, sessionContext } = await getEndingContextBundle();
        const systemPrompt = await buildEndingSystemPrompt(sessionMessages);
        const hasPreviousMetaLetter = allMsgs.some(m =>
            m.metadata?.source === 'theater'
            && (m.metadata?.endingAct === 'meta-letter' || m.metadata?.isMetaLetter === true)
        );

        const prompt = buildMetaLetterPrompt(char.name, userProfile.name, sessionContext, {
            isFirstMetaLetter: !hasPreviousMetaLetter,
            charGender: char.gender ?? 'male',
        });

        const response = await fetchTheaterChatCompletion(
            apiConfig,
            {
                model: apiConfig.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.8,
            },
            '约会散场信件',
            char.id,
            undefined,
            true,
        );
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await safeResponseJson(response);
        const extracted = extractThinking(data.choices?.[0]?.message?.content || '');
        return extracted.content;
    };

    /** Save the meta letter to DB so it can be viewed in history */
    const handleSaveMetaLetter = async (letterContent: string): Promise<void> => {
        await saveEndingCeremonyMessage('meta-letter', 'assistant', letterContent, { isMetaLetter: true });
    };

    const saveRawBridgeAndExit = async () => {
        if (!char) return;
        const allMsgs = await DB.getMessagesByCharId(char.id);
        const sessionMessages = getCurrentTimelineSessionMessages(allMsgs);
        if (sessionMessages.length > 0) {
            await DB.saveMessage({
                charId: char.id, role: 'system', type: 'text',
                content: formatTheaterMessagesForSummary(sessionMessages, char.name, userProfile.name),
                metadata: { source: 'theater', hiddenFromUser: true, isDateContextBridge: true, bridgeType: 'raw', coveredMsgIds: sessionMessages.map(m => m.id), sessionStartMsgId: sessionMessages[0].id },
            });
            addToast('原始记录已同步到主聊天', 'success');
        }
        finishExit();
    };

    const onExitSession = async (syncMode: TheaterExitSyncMode) => {
        if (!char) return;
        if (syncMode === 'none') {
            await cleanSessionBridges();
            finishExit();
            return;
        }
        if (syncMode === 'raw') { await saveRawBridgeAndExit(); return; }
        // syncMode === 'summary'
        // Generate a comprehensive exit summary (auto-summaries + unsummarized messages)
        // and show in modal for user review
        if (pendingAutoSummary) {
            // Save the pending auto summary first so it can be included
            await saveSummaryDraft({ ...pendingAutoSummary, fromPendingAuto: true });
        }
        const draft = await generateExitSummaryDraft();
        if (!draft) { addToast('未同步总结，仅保存进度', 'info'); finishExit(); return; }
        setActiveSummaryDraft({ ...draft, bridgeOnSave: true });
    };

    const handleExit = useCallback((syncMode: TheaterExitSyncMode = 'none') => {
        void onExitSession(syncMode);
    }, [onExitSession]);

    // ── Render ──


    if (mode === 'select' || !char) {
        return (
            <div className="theater-app">
                <div className="theater-entry-root">
                    {/* Floating decorations */}
                    <div className="theater-entry-deco">
                        <div className="theater-entry-orb" />
                        <div className="theater-entry-orb" />
                        <div className="theater-entry-orb" />
                        <span className="theater-entry-float-heart">love</span>
                        <span className="theater-entry-float-heart">date</span>
                        <span className="theater-entry-float-heart">soft</span>
                        <span className="theater-entry-float-heart">dream</span>
                    </div>

                    {/* Top bar */}
                    <div className="theater-entry-topbar">
                        <button className="theater-entry-back" onClick={closeApp}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={16} height={16}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <span className="theater-entry-topbar-label">INVITATION</span>
                    </div>

                    {/* Invitation letter card */}
                    <div className="theater-entry-letter">
                        {/* Watermark background */}
                        <div className="theater-entry-watermark">Je t'aime</div>

                        {/* Love stamp */}
                        <svg className="theater-entry-stamp" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="2" y="2" width="44" height="44" rx="4" stroke="rgba(255,45,120,0.4)" strokeWidth="1.5" strokeDasharray="3 2" />
                            <path d="M24 36s-10-6.5-10-13a6 6 0 0 1 10-4.5A6 6 0 0 1 34 23c0 6.5-10 13-10 13z" fill="rgba(255,45,120,0.3)" />
                            <text x="24" y="14" textAnchor="middle" fontSize="5" fill="rgba(255,45,120,0.35)" fontWeight="600" letterSpacing="1">520</text>
                        </svg>

                        {/* Hero */}
                        <div className="theater-entry-hero">
                            <div className="theater-entry-hero-eyebrow">A Date with Destiny</div>
                            <div className="theater-entry-hero-number">Je t'aime</div>
                            <div className="theater-entry-hero-subtitle">倾心序章</div>
                            <div className="theater-entry-hero-tagline">在这个专属于你的故事里，赴一场命定之约</div>
                            <div className="theater-entry-hero-line" />
                        </div>

                        {/* 摘星楼海报画廊 */}
                        <div
                            className={`theater-gallery-carousel${characters.length <= 2 ? ' theater-gallery-carousel--center' : ' theater-gallery-carousel--autoscroll'}`}
                            ref={carouselRef}
                            onTouchStart={() => { autoScrollPaused.current = true; }}
                            onTouchEnd={() => { setTimeout(() => { autoScrollPaused.current = false; }, 3000); }}
                            onMouseEnter={() => { autoScrollPaused.current = true; }}
                            onMouseLeave={() => { autoScrollPaused.current = false; }}
                        >
                            {characters.map(c => {
                                const isSelecting = selectingCharId === c.id;
                                const isDismissing = selectingCharId !== null && selectingCharId !== c.id;
                                let posterClass = 'theater-gallery-poster';
                                if (isSelecting) posterClass += ' theater-gallery-poster--selecting';
                                else if (isDismissing) posterClass += ' theater-gallery-poster--dismissing';
                                else if (focusedCharId === c.id) posterClass += ' theater-gallery-poster--focused';
                                return (
                                    <div
                                        key={c.id}
                                        data-char-id={c.id}
                                        className={posterClass}
                                        onClick={() => handlePosterClick(c)}
                                    >
                                        {/* 满铺角色原画 */}
                                        <img className="theater-gallery-poster-bg" src={c.avatar} alt={c.name} loading="eager" decoding="async" />
                                        {/* 爱心邮戳 — 选中态淡入 */}
                                        <svg className="theater-gallery-poster-stamp" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <circle cx="18" cy="18" r="16.5" stroke="rgba(255,45,120,0.35)" strokeWidth="1" strokeDasharray="2.5 1.8" />
                                            <path d="M18 27s-7.5-4.8-7.5-9.8a4.5 4.5 0 0 1 7.5-3.35A4.5 4.5 0 0 1 25.5 17.2c0 5-7.5 9.8-7.5 9.8z" fill="rgba(255,45,120,0.45)" />
                                            <text x="18" y="13" textAnchor="middle" fontSize="4.5" fill="rgba(255,45,120,0.4)" fontWeight="600" letterSpacing="0.5">520</text>
                                        </svg>
                                        {/* 底部渐变信息区 */}
                                        <div className="theater-gallery-poster-info">
                                            <div className="theater-gallery-poster-name">{c.name}</div>
                                            <div className="theater-gallery-poster-desc">{c.description || '赴约档案…'}</div>
                                            <div className="theater-gallery-poster-action">
                                                <span>赴 约</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" width={14} height={14}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {characters.length === 0 && (
                                <div style={{ width: '100%', textAlign: 'center', color: 'var(--te-text-sub)', paddingTop: 40, fontSize: 13, fontWeight: 300 }}>还没有角色</div>
                            )}
                        </div>
                    </div>

                    {/* Footer ornament */}
                    <div className="theater-entry-footer">
                        <div className="theater-entry-ornament">
                            <span className="theater-entry-ornament-text">SELECT YOUR STORY</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (mode === 'timelines' && char) {
        const activeStoredTimelineId = getActiveTimelineId(char.id);
        const highlightedTimelineId = charTimelines.some(t => t.timelineId === activeStoredTimelineId)
            ? activeStoredTimelineId
            : charTimelines[0]?.timelineId;

        return (
            <div className="theater-app">
                <div className="theater-worldlines-root">
                    <div className="theater-worldlines-bg" aria-hidden="true">
                        <span className="theater-worldlines-wave wave-a" />
                        <span className="theater-worldlines-wave wave-b" />
                        <span className="theater-worldlines-signal signal-a" />
                        <span className="theater-worldlines-signal signal-b" />
                    </div>

                    <div className="theater-worldlines-topbar">
                        <button className="theater-entry-back theater-worldlines-back" onClick={() => { setMode('select'); setChar(null); }}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={16} height={16}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <span className="theater-worldlines-event-label">520 EVENT ARCHIVE</span>
                    </div>
                    <div className="theater-worldlines-hero">
                        <div className="theater-worldlines-avatar-wrap">
                            <span className="theater-worldlines-avatar-signal" />
                            <img src={char.avatar} alt={char.name} className="theater-entry-char-img" loading="eager" decoding="async" />
                        </div>
                        <div className="theater-worldlines-char-name">{char.name}</div>
                        <div className="theater-worldlines-title">WORLDLINES</div>
                        <div className="theater-worldlines-title-sub">LOVE RADIO · PARALLEL TICKETS</div>
                    </div>

                    <div className="theater-worldlines-list">
                        <button className="theater-worldlines-new-ticket" onClick={handleStartNewTimeline}>
                            <span className="theater-worldlines-ticket-code">DATE PASS</span>
                            <span className="theater-worldlines-ticket-stub">SIGNAL 520</span>
                            <div className="theater-worldlines-new-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" width={20} height={20}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                            </div>
                            <div className="theater-worldlines-new-copy">
                                <div className="theater-worldlines-new-title">开启新世界线</div>
                                <div className="theater-worldlines-new-sub">NEW WORLDLINE</div>
                            </div>
                        </button>

                        {charTimelines.length > 0 && <div className="theater-worldlines-divider">ON AIR</div>}

                        {charTimelines.map((tl, index) => {
                            const timeLabel = TIME_SLOT_LABELS[tl.session.timeSlot];
                            const isForked = !!tl.parentTimelineId;
                            const isActive = tl.timelineId === highlightedTimelineId;
                            const preview = cleanTimelinePreview(tl.preview);
                            return (
                                <div key={tl.timelineId} className={`theater-tl-card ${isActive ? 'theater-tl-card--active' : ''}`}>
                                    <span className="theater-tl-serial">PASS {String(index + 1).padStart(2, '0')}</span>
                                    <button onClick={() => handleSelectTimeline(tl)} className="theater-tl-main">
                                        <div className={`theater-tl-icon ${isForked ? 'forked' : 'origin'}`}>
                                            {isForked ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.35} stroke="currentColor" width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.35} stroke="currentColor" width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                                            )}
                                        </div>
                                        <div className="theater-tl-body">
                                            <div className="theater-tl-label">{tl.label}</div>
                                            <div className="theater-tl-meta">
                                                <span>{tl.locationName || '未开始'}</span>
                                                {timeLabel && <><div className="theater-tl-meta-dot" /><span>{timeLabel.icon} {timeLabel.zh}</span></>}
                                                <div className="theater-tl-meta-dot" /><span>{tl.messageCount} 条</span>
                                            </div>
                                            {preview && <div className="theater-tl-preview">{preview}</div>}
                                        </div>
                                    </button>
                                    <button className="theater-tl-delete" aria-label="删除世界线" onClick={(e) => { e.stopPropagation(); handleDeleteTimeline(tl.timelineId); }}>
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.35} stroke="currentColor" width={14} height={14}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                        </svg>
                                    </button>
                                </div>
                            );
                        })}

                        {charTimelines.length === 0 && (
                            <div className="theater-worldlines-empty">
                                <div className="theater-worldlines-empty-stamp">NO SIGNAL</div>
                                <div className="theater-worldlines-empty-title">还没有世界线</div>
                                <div className="theater-worldlines-empty-copy">抽出一张新的入场券，开始今天的 520 片段。</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (mode === 'map') {
        return (
            <div className="theater-app">
                <TheaterMap
                    locations={locations}
                    timeSlot={session?.timeSlot || 'afternoon'}
                    is520={session?.is520Event || false}
                    visitedLocationIds={session?.visitedLocationIds || []}
                    onSelectLocation={handleSelectLocation}
                    onAddLocation={handleAddLocation}
                    onDeleteCustomLocation={handleDeleteCustomLocation}
                    onBack={() => { setMode(charTimelines.length > 0 ? 'timelines' : 'select'); }}
                />
            </div>
        );
    }

    if (mode === 'session' && currentLocation) {
        return (
            <div className="theater-app">
                <TheaterSession
                    char={char}
                    userProfile={userProfile}
                    location={currentLocation}
                    timeSlot={session?.timeSlot || 'afternoon'}
                    is520={session?.is520Event || false}
                    currentEvent={currentEvent}
                    isDirectorLoading={isDirectorLoading}
                    isAiLoading={isAiLoading}
                    messages={theaterMessages}
                    onSendMessage={handleSendMessage}
                    activeWhispers={activeWhispers}
                    onWhisperClick={async (w) => {
                        setActiveWhispers([]);
                        await handleSendMessage(w.whisper, w.secret || undefined, [{ kind: 'action', text: w.whisper }]);
                    }}
                    locations={locations}
                    visitedLocationIds={session?.visitedLocationIds || []}
                    onSelectLocation={handleSelectLocation}
                    onAddLocation={handleAddLocation}
                    onDeleteCustomLocation={handleDeleteCustomLocation}
                    showLocationSheet={showLocationSheet}
                    onCloseLocationSheet={() => setShowLocationSheet(false)}
                    onOpenLocationSheet={() => setShowLocationSheet(true)}
                    onExit={handleExit}
                    timelineLabel={currentTimelineId ? (charTimelines.find(t => t.timelineId === currentTimelineId)?.label || undefined) : undefined}
                    onForkFromMessage={(msg) => { setForkTargetMsg(msg); setForkLabel(''); setShowForkModal(true); }}
                    isSummaryGenerating={isSummaryGenerating}
                    hasPendingSummary={!!pendingAutoSummary}
                    canManualSummary={canManualSummary}
                    canAutoSummary={canAutoSummary}
                    summaryDisabledReason={summaryDisabledReason}
                    onRequestSummary={requestManualSummary}
                    onReviewPendingSummary={() => pendingAutoSummary && setActiveSummaryDraft({ ...pendingAutoSummary, fromPendingAuto: true })}
                    onDiscardPendingSummary={discardPendingAutoSummary}
                    onToggleAutoSummary={(enabled) => updateCharacter(char.id, { theaterSummaryAutoEnabled: enabled })}
                    onToggleAutoHideSummary={async (enabled) => {
                        updateCharacter(char.id, { theaterSummaryAutoHideEnabled: enabled });
                        if (enabled) { await compressExistingSummaries(); addToast('已开启压缩旧记录', 'success'); }
                    }}
                    onChangeThreshold={(t) => updateCharacter(char.id, { theaterSummaryAutoThreshold: t })}
                    onOpenSummarySettings={openSummarySettings}
                    savedSummaryCount={savedSummaryMessages.length}
                    onOpenSavedSummaries={() => setShowSavedSummaries(true)}
                    isTransitioning={isTransitioning}
                    transitionLocationName={transitionLocationName}
                    pendingLocationSuggestion={pendingLocationSuggestion}
                    onAcceptLocationSuggestion={handleAcceptLocationSuggestion}
                    onDeclineLocationSuggestion={handleDeclineLocationSuggestion}
                    onGenerateGiftReaction={handleGenerateGiftReaction}
                    onGenerateFarewell={handleGenerateFarewell}
                    onGenerateMetaLetter={handleGenerateMetaLetter}
                    onSaveMetaLetter={handleSaveMetaLetter}
                />

                {/* Saved Summaries Modal */}
                <Modal isOpen={showSavedSummaries} title="已保存总结" onClose={() => setShowSavedSummaries(false)} footer={
                    <button onClick={() => setShowSavedSummaries(false)} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold">关闭</button>
                }>
                    <div className="space-y-3">
                        {savedSummaryMessages.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400">当前世界线还没有保存过总结</div>
                        ) : savedSummaryMessages.map(summary => (
                            <div key={summary.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        {summary.metadata?.summaryType === 'auto' ? '自动总结' : '手动总结'}
                                    </div>
                                    <button
                                        onClick={() => openSavedSummaryEditor(summary)}
                                        className="px-2 py-1 text-[11px] font-medium text-slate-500 bg-white rounded-full hover:bg-slate-100 transition-colors"
                                    >
                                        编辑
                                    </button>
                                </div>
                                <div className="text-xs leading-relaxed text-slate-700">
                                    {renderMarkdown(summary.content)}
                                </div>
                            </div>
                        ))}
                    </div>
                </Modal>

                {/* Saved Summary Edit Modal */}
                <Modal isOpen={!!editingSavedSummary} title="编辑总结" onClose={closeSavedSummaryEditor} footer={
                    <>
                        <button onClick={closeSavedSummaryEditor} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-500 font-bold">取消</button>
                        <button disabled={!savedSummaryEditContent.trim()} onClick={saveSavedSummaryEdit} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-2xl disabled:opacity-50">保存</button>
                    </>
                }>
                    <textarea
                        value={savedSummaryEditContent}
                        onChange={e => setSavedSummaryEditContent(e.target.value)}
                        rows={10}
                        className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                </Modal>

                {/* Summary Preview Modal */}
                {activeSummaryDraft && (
                    <Modal isOpen={!!activeSummaryDraft} title="约会总结预览" onClose={() => setActiveSummaryDraft(null)} footer={
                        <>
                            <button onClick={() => navigator.clipboard.writeText(activeSummaryDraft.content).then(() => addToast('已复制', 'success')).catch(() => addToast('复制失败', 'error'))} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold">复制</button>
                            <button onClick={discardSummaryDraft} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-500 font-bold">丢弃</button>
                            <button disabled={!activeSummaryDraft.content.trim()} onClick={() => saveSummaryDraft(activeSummaryDraft)} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-2xl disabled:opacity-50">{activeSummaryDraft.bridgeOnSave ? '保存并同步' : '保存'}</button>
                        </>
                    }>
                        <div className="flex flex-col gap-4">
                            <div>
                                <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-400">
                                    <span>总结正文</span>
                                    <span>{activeSummaryDraft.content.trim().length} 字</span>
                                </div>
                                <textarea
                                    value={activeSummaryDraft.content}
                                    onChange={e => setActiveSummaryDraft(current => current ? { ...current, content: e.target.value } : current)}
                                    rows={10}
                                    className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                                />
                            </div>
                            {activeSummaryDraft.content.trim() && (
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">排版预览</div>
                                    <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
                                        {renderMarkdown(activeSummaryDraft.content)}
                                    </div>
                                </div>
                            )}
                            {activeSummaryDraft.summaryType === 'manual' && activeSummaryDraft.bridgeOnSave && (
                                <label className="flex items-center gap-2 mt-4 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200 transition-colors hover:bg-slate-100">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500" 
                                        checked={activeSummaryDraft.injectToVectorMemory || false} 
                                        onChange={e => setActiveSummaryDraft({ ...activeSummaryDraft, injectToVectorMemory: e.target.checked })} 
                                    />
                                    <span className="text-sm font-medium text-slate-700">将此段总结刻入永久向量记忆库 (Vector Memory)</span>
                                </label>
                            )}
                        </div>
                    </Modal>
                )}

                {/* Summary Settings Modal */}
                <Modal isOpen={showSummarySettings} title="总结设置" onClose={() => setShowSummarySettings(false)} footer={
                    <>
                        <button onClick={() => setShowSummarySettings(false)} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-500 font-bold">取消</button>
                        <button onClick={saveSummarySettings} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-2xl">保存</button>
                    </>
                }>
                    <div className="space-y-3">
                        <p className="text-xs leading-relaxed text-slate-400">只影响约会总结生成，不会改动立绘、场景等其他设置。</p>
                        <textarea value={summaryPromptDraft} onChange={e => setSummaryPromptDraft(e.target.value)} rows={9} className="w-full resize-y rounded-2xl border border-slate-100 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-700 outline-none focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-100" />
                    </div>
                </Modal>

                {/* Fork Modal */}
                <Modal isOpen={showForkModal && !!forkTargetMsg} title="开启平行时空" onClose={() => { setShowForkModal(false); setForkTargetMsg(null); setForkLabel(''); }} footer={
                    <>
                        <button onClick={() => { setShowForkModal(false); setForkTargetMsg(null); setForkLabel(''); }} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-500 font-bold">取消</button>
                        <button onClick={() => forkTargetMsg && handleForkFromMessage(forkTargetMsg, forkLabel)} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-2xl">创建世界线</button>
                    </>
                }>
                    <div className="space-y-4">
                        <div className="text-xs text-slate-400">从这条消息之后开始分叉，之前的对话将被共享：</div>
                        {forkTargetMsg && (
                            <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600 line-clamp-3">
                                {forkTargetMsg.content.replace(/\[.*?\]/g, '').slice(0, 100)}...
                            </div>
                        )}
                        <div>
                            <label className="text-xs text-slate-400 mb-1 block">世界线名称（留空自动命名）</label>
                            <input
                                value={forkLabel}
                                onChange={e => setForkLabel(e.target.value)}
                                placeholder="如果当时更大胆…"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-50"
                            />
                        </div>
                        <div className="text-[11px] text-slate-300">之后的消息将独立于原时间线</div>
                    </div>
                </Modal>
            </div>
        );
    }

    return null;
};

export default TheaterApp;

