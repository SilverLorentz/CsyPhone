import React,{ useState,useEffect,useRef } from 'react';
import { CharacterProfile,Message,DateState,DialogueItem,UserProfile,DateTokenUsage,DateRequestDebugSnapshot } from '../../types';
import { type InnerWhisper } from '../../utils/thinkingExtractor';
import { extractTranslationPairs } from '../../utils/chatParser';
import Modal from '../../components/os/Modal';
import { useOS } from '../../context/OSContext';
import DateSettings from './DateSettings';
import SummaryFloatingBall from './SummaryFloatingBall';

const isAppleMobileWebKit = () => {
    if (typeof navigator === 'undefined') return false;
    const platform = navigator.platform || '';
    const ua = navigator.userAgent || '';
    return /iP(ad|hone|od)/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// Helper: Parse dialogue with simple state machine
const isContextNoise = (line: string) => {
    const l = line.trim().toLowerCase();
    if (l.startsWith('(') && l.endsWith(')')) {
        if (l.includes('in person') || l.includes('face-to-face') || l.includes('location') || l.includes('time')) return true;
    }
    if (l.startsWith('[system') || l.startsWith('(system')) return true;
    return false;
};

// Helper: Strip emotion tags like [shy], [happy] for pure text display
const cleanTextForDisplay = (text: string) => {
    // Remove content inside brackets [] and trim extra spaces
    // Also remove typical system prompts if any leak through
    return text.replace(/\[.*?\]/g, '').trim();
};

const resolveDateBackground = (state: DateState | undefined, char: CharacterProfile): string => {
    if (!state) return char.dateBackground || '';
    if (state.bgSource === 'none') return '';
    if (state.bgSource === 'characterDateBackground') return char.dateBackground || '';
    if (state.bgSource === 'inline') return state.bgImage || '';
    return state.bgImage || char.dateBackground || '';
};

/**
 * Parse dialogue text into DialogueItem[]. Supports:
 * 1. Plain lines with [emotion] tags
 * 2. <翻译><原文>...</原文><译文>...</译文></翻译> bilingual blocks
 * Philosophy: 先救再杀 — always extract displayable content, never crash on malformed AI output.
 */
const parseDialogue = (fullText: string, initialEmotion: string = 'normal'): DialogueItem[] => {
    if (!fullText) return [];

    // --- Phase 1: Translation-aware pre-pass ---
    // If the text contains <翻译> blocks, use extractTranslationPairs to split
    // into structured pairs first, then parse each pair's original for [emotion] tags.
    const hasTranslationXml = fullText.includes('<翻译>') || fullText.includes('<原文>');
    if (hasTranslationXml) {
        const pairs = extractTranslationPairs(fullText);
        const results: DialogueItem[] = [];
        let currentEmotion = initialEmotion;

        for (const pair of pairs) {
            // Parse the original text for [emotion] tags — line by line
            const origLines = pair.original.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            let translationAssigned = false; // Track per-pair: only attach translation to first content line

            for (const line of origLines) {
                if (isContextNoise(line)) continue;
                const tagMatch = line.match(/^\[([a-zA-Z0-9_\-]+)\]\s*(.*)/);
                let content = line;

                if (tagMatch) {
                    currentEmotion = tagMatch[1].toLowerCase();
                    content = tagMatch[2];
                } else {
                    const standaloneTag = line.match(/^\[([a-zA-Z0-9_\-]+)\]$/);
                    if (standaloneTag) {
                        currentEmotion = standaloneTag[1].toLowerCase();
                        continue;
                    }
                }

                if (content) {
                    // Attach translation to the first content line of this pair only
                    const shouldAttachTranslation = !translationAssigned && !!pair.translated;
                    results.push({
                        text: content,
                        emotion: currentEmotion,
                        translationText: shouldAttachTranslation
                            ? cleanTextForDisplay(pair.translated)
                            : undefined,
                    });
                    if (shouldAttachTranslation) translationAssigned = true;
                }
            }
            // If the pair's original had no parseable lines but translated exists, rescue it
            if (origLines.length === 0 && pair.translated) {
                results.push({ text: pair.translated, emotion: currentEmotion });
            }
        }
        return results;
    }

    // --- Phase 2: Standard parsing (no translation XML) ---
    const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const results: DialogueItem[] = [];
    let currentEmotion = initialEmotion;

    for (const line of lines) {
        if (isContextNoise(line)) continue;
        const tagMatch = line.match(/^\[([a-zA-Z0-9_\-]+)\]\s*(.*)/);
        let content = line;
        
        if (tagMatch) {
            currentEmotion = tagMatch[1].toLowerCase();
            content = tagMatch[2];
        } else {
            const standaloneTag = line.match(/^\[([a-zA-Z0-9_\-]+)\]$/);
            if (standaloneTag) {
                currentEmotion = standaloneTag[1].toLowerCase();
                continue; 
            }
        }
        if (content) {
            results.push({ text: content, emotion: currentEmotion });
        }
    }
    return results;
};

interface DateSessionProps {
    char: CharacterProfile;
    userProfile: UserProfile;
    messages: Message[]; // The DB messages for history/novel mode
    peekStatus: string;  // Initial text from the Peek phase
    initialState?: DateState; // Resume state
    onSendMessage: (text: string, directorHint?: string) => Promise<{ content: string; whispers: InnerWhisper[] }>; // Returns AI content + optional whispers
    onReroll: () => Promise<{ content: string; whispers: InnerWhisper[] }>;
    onExit: (currentState: DateState, syncMode: DateExitSyncMode) => void;
    onEditMessage: (msg: Message) => void;
    onDeleteMessage: (msg: Message) => void;
    isSummaryGenerating: boolean;
    hasPendingSummary: boolean;
    canManualSummary: boolean;
    canAutoSummary: boolean;
    summaryDisabledReason?: string;
    lastTokenUsage?: DateTokenUsage | null;
    requestDebugSnapshots?: DateRequestDebugSnapshot[];
    onRequestSummary: () => void;
    onReviewPendingSummary: () => void;
    onDiscardPendingSummary: () => void;
    onToggleAutoSummary: (enabled: boolean) => void;
    onToggleAutoHideSummary: (enabled: boolean) => void;
    onChangeThreshold: (threshold: number) => void;
    onOpenSummarySettings: () => void;
    // Output tuning
    wordCount?: number;
    writingStyle?: string;
    onChangeWordCount: (count: number | undefined) => void;
    onChangeWritingStyle: (style: string | undefined) => void;
    // Temperature
    temperature?: number;
    onChangeTemperature: (temp: number | undefined) => void;
    fontScale?: number;
    onChangeFontScale: (scale: number | undefined) => void;
    // Translation
    translationEnabled?: boolean;
    translateSourceLang?: string;
    translateTargetLang?: string;
    onToggleTranslation?: (enabled: boolean) => void;
    onSetTranslateSourceLang?: (lang: string) => void;
    onSetTranslateTargetLang?: (lang: string) => void;
}

export type DateExitSyncMode = 'summary' | 'raw' | 'none';

const DateSession: React.FC<DateSessionProps> = ({ 
    char, 
    userProfile,
    messages, 
    peekStatus, 
    initialState,
    onSendMessage, 
    onReroll, 
    onExit,
    onEditMessage,
    onDeleteMessage,
    isSummaryGenerating,
    hasPendingSummary,
    canManualSummary,
    canAutoSummary,
    summaryDisabledReason,
    lastTokenUsage,
    requestDebugSnapshots = [],
    onRequestSummary,
    onReviewPendingSummary,
    onDiscardPendingSummary,
    onToggleAutoSummary,
    onToggleAutoHideSummary,
    onChangeThreshold,
    onOpenSummarySettings,
    wordCount,
    writingStyle,
    onChangeWordCount,
    onChangeWritingStyle,
    temperature,
    onChangeTemperature,
    fontScale,
    onChangeFontScale,
    translationEnabled,
    translateSourceLang,
    translateTargetLang,
    onToggleTranslation,
    onSetTranslateSourceLang,
    onSetTranslateTargetLang}) => {
    const { addToast, registerBackHandler } = useOS();
    const textScale = Math.min(Math.max(fontScale ?? 1, 0.85), 1.3);
    const scaledFont = (basePx: number) => `${Math.round(basePx * textScale * 10) / 10}px`;
    
    // Core VN State
    const [isNovelMode, setIsNovelMode] = useState(false);
    const [bgImage, setBgImage] = useState<string>(char.dateBackground || '');
    const [currentSprite, setCurrentSprite] = useState<string>('');
    const [spriteConfig, setSpriteConfig] = useState(char.spriteConfig || { scale: 1, x: 0, y: 0 });
    
    // Dialogue Engine State
    const [dialogueQueue, setDialogueQueue] = useState<DialogueItem[]>([]);
    const [dialogueBatch, setDialogueBatch] = useState<DialogueItem[]>([]); // For replaying current batch
    const [currentText, setCurrentText] = useState('');
    const [displayedText, setDisplayedText] = useState('');
    const [isTextAnimating, setIsTextAnimating] = useState(false);
    
    // Interaction State
    const [input, setInput] = useState('');
    const [showInputBox, setShowInputBox] = useState(false);
    const [isTyping, setIsTyping] = useState(false); // Waiting for API
    const [showExitModal, setShowExitModal] = useState(false);
    const [showRequestDebug, setShowRequestDebug] = useState(false);
    const [selectedRequestDebugId, setSelectedRequestDebugId] = useState<string | null>(null);
    
    // Inner Whispers State (内心低语)
    const [activeWhispers, setActiveWhispers] = useState<InnerWhisper[]>([]);
    const [whispersVisible, setWhispersVisible] = useState(false);
    const whisperRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Settings Overlay State (Internal)
    const [showSettings, setShowSettings] = useState(false);

    // Edit Msg Logic
    const [modalType, setModalType] = useState<'none' | 'options'>('none');
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartRef = useRef<{x: number, y: number} | null>(null);
    const novelScrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const isResumedRef = useRef(false);
    const selectedRequestDebug = requestDebugSnapshots.find(item => item.id === selectedRequestDebugId) || requestDebugSnapshots[0] || null;
    const requestDebugText = React.useMemo(() => {
        if (!selectedRequestDebug) return '';
        return selectedRequestDebug.messages.map((message, index) => (
            `#${index + 1} ${message.role.toUpperCase()} (${message.content.length.toLocaleString('zh-CN')} 字符)\n${message.content}`
        )).join('\n\n' + '-'.repeat(64) + '\n\n');
    }, [selectedRequestDebug]);
    const requestDebugCharCount = selectedRequestDebug
        ? selectedRequestDebug.messages.reduce((sum, message) => sum + message.content.length, 0)
        : 0;

    useEffect(() => {
        return () => {
            if (whisperRevealTimer.current) {
                clearTimeout(whisperRevealTimer.current);
                whisperRevealTimer.current = null;
            }
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        };
    }, []);

    // Back Handler
    useEffect(() => {
        const unregister = registerBackHandler(() => {
            if (showSettings) {
                setShowSettings(false);
                return true;
            }
            if (showExitModal) {
                setShowExitModal(false);
                return true;
            }
            if (showRequestDebug) {
                setShowRequestDebug(false);
                return true;
            }
            setShowExitModal(true);
            return true;
        });
        return unregister;
    }, [showSettings, showExitModal, showRequestDebug, registerBackHandler]);

    // Filter messages for Novel Mode: Show only current session
    // Logic: Find the LAST message with `isOpening: true`. Show all messages from there onwards.
    const sessionMessages = React.useMemo(() => {
        const visibleMessages = messages.filter(m => !m.metadata?.hiddenFromUser && !m.metadata?.isSummary && !m.metadata?.isDateContextBridge);
        const openingIndex = visibleMessages.map(m => m.metadata?.isOpening).lastIndexOf(true);
        if (openingIndex !== -1) {
            return visibleMessages.slice(openingIndex);
        }
        // Fallback: If no opening found (legacy data), show all
        return visibleMessages;
    }, [messages]);

    // Initialization
    useEffect(() => {
        if (initialState) {
            // Resume
            isResumedRef.current = true;
            setBgImage(resolveDateBackground(initialState, char));
            setCurrentSprite(initialState.currentSprite || '');
            setCurrentText(initialState.currentText || '');
            setDisplayedText(initialState.currentText || '');
            setDialogueQueue(initialState.dialogueQueue || []);
            setDialogueBatch(initialState.dialogueBatch || []);
            setIsNovelMode(initialState.isNovelMode);
        } else {
            // New Session - pick initial sprite from active skin set or default sprites
            const s = (() => {
                if (char.activeSkinSetId && char.dateSkinSets) {
                    const skin = char.dateSkinSets.find(sk => sk.id === char.activeSkinSetId);
                    if (skin && Object.keys(skin.sprites).length > 0) return skin.sprites;
                }
                return char.sprites;
            })();
            let initSprite = s?.['normal'] || s?.['default'];
            if (!initSprite && s) {
                const fallbackKey = dateEmotionKeys.find(k => s[k]);
                initSprite = fallbackKey ? s[fallbackKey] : Object.values(s).find(v => v) || char.avatar;
            }
            if (!initSprite) initSprite = char.avatar;
            setCurrentSprite(initSprite);
            
            // Parse Peek Status as opening
            const startText = peekStatus || "Waiting for connection...";
            const items = parseDialogue(startText, 'normal');
            setDialogueBatch(items);
            setDialogueQueue(items);
            
            if (items.length > 0) {
                // Manually trigger first item processing
                const first = items[0];
                setCurrentText(first.text);
                // Note: Not setting sprite here because useEffect below will handle emotion->sprite mapping if needed, 
                // or we rely on default.
                setDialogueQueue(items.slice(1));
            }
        }
    }, []); // Run once on mount

    // Sprite & Config Sync (If user goes to settings and comes back, this helps)
    useEffect(() => {
        if (char.spriteConfig) setSpriteConfig(char.spriteConfig);
        if (!initialState || initialState.bgSource === 'characterDateBackground' || (!initialState.bgSource && !initialState.bgImage)) {
            setBgImage(char.dateBackground || '');
        }
    }, [char, initialState]);

    // Novel Mode Scroll
    useEffect(() => {
        if (isNovelMode && novelScrollRef.current) {
            novelScrollRef.current.scrollTop = novelScrollRef.current.scrollHeight;
        }
    }, [sessionMessages.length, isNovelMode, showInputBox]);

    useEffect(() => {
        if (!showInputBox || isTyping || isAppleMobileWebKit()) return;
        const id = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => window.clearTimeout(id);
    }, [showInputBox, isTyping]);

    // Typewriter effect
    useEffect(() => {
        if (!currentText || isNovelMode) {
            if (isNovelMode) setDisplayedText(currentText);
            return;
        }
        setIsTextAnimating(true);
        setDisplayedText('');
        let i = 0;
        const timer = setInterval(() => {
            setDisplayedText(currentText.substring(0, i + 1));
            i++;
            if (i >= currentText.length) {
                clearInterval(timer);
                setIsTextAnimating(false);
            }
        }, 20);
        return () => clearInterval(timer);
    }, [currentText, isNovelMode]);

    // --- Logic ---

    // Only allow date-relevant emotions (required + custom), never chibi or other non-date sprites
    const REQUIRED_EMOTIONS_SET = ['normal', 'happy', 'angry', 'sad', 'shy'];
    const dateEmotionKeys = [...REQUIRED_EMOTIONS_SET, ...(char.customDateSprites || [])];

    // Resolve active sprites: if a skin set is active, use its sprites; otherwise fall back to char.sprites
    const activeSprites = React.useMemo(() => {
        if (char.activeSkinSetId && char.dateSkinSets) {
            const skin = char.dateSkinSets.find(s => s.id === char.activeSkinSetId);
            if (skin) return skin.sprites;
        }
        return char.sprites || {};
    }, [char.activeSkinSetId, char.dateSkinSets, char.sprites]);

    // Track current translation text for VN mode display
    const [currentTranslation, setCurrentTranslation] = useState('');

    const processNextDialogue = (item: DialogueItem, remaining: DialogueItem[]) => {
        setCurrentText(item.text);
        setCurrentTranslation(item.translationText || '');
        if (item.emotion && activeSprites) {
            const emotionKey = item.emotion.toLowerCase();
            if (dateEmotionKeys.includes(emotionKey)) {
                const nextSprite = activeSprites[emotionKey];
                if (nextSprite) setCurrentSprite(nextSprite);
            } else {
                const found = dateEmotionKeys.find(k => emotionKey.includes(k));
                if (found && activeSprites[found]) {
                    setCurrentSprite(activeSprites[found]);
                }
            }
        }
        setDialogueQueue(remaining);
    };

    const handleScreenClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button, input, textarea, .control-panel')) return;
        if (isNovelMode) return;

        // Skip animation
        if (isTextAnimating) {
            setDisplayedText(currentText);
            setIsTextAnimating(false);
            return;
        }

        // Next item
        if ((dialogueQueue || []).length > 0) {
            processNextDialogue(dialogueQueue![0], dialogueQueue!.slice(1));
            return;
        }

        // Loop
        if ((dialogueBatch || []).length > 0) {
            // Replay
            addToast('↺ 重播对话', 'info');
            processNextDialogue(dialogueBatch[0], dialogueBatch.slice(1));
            return;
        }
    };

    // Clear whispers and cancel any pending reveal timer
    const clearWhispers = () => {
        setActiveWhispers([]);
        setWhispersVisible(false);
        if (whisperRevealTimer.current) {
            clearTimeout(whisperRevealTimer.current);
            whisperRevealTimer.current = null;
        }
    };

    const handleSend = async (directorHint?: string) => {
        if (!input.trim() && !directorHint || isTyping) return;
        const text = input.trim();
        setInput('');
        setShowInputBox(false);
        setIsTyping(true);
        clearWhispers();

        try {
            const result = await onSendMessage(text, directorHint);
            // Parse new content
            const items = parseDialogue(result.content, 'normal');
            setDialogueBatch(items);
            setDialogueQueue(items);
            if (items.length > 0) {
                processNextDialogue(items[0], items.slice(1));
            }
            // Schedule whisper reveal after dialogue plays out
            if (result.whispers.length > 0) {
                // Estimate dialogue play time: ~20ms/char * total chars + 500ms buffer per item
                const totalChars = items.reduce((sum, item) => sum + item.text.length, 0);
                const estimatedPlayMs = totalChars * 20 + items.length * 500;
                whisperRevealTimer.current = setTimeout(() => {
                    setActiveWhispers(result.whispers);
                    setWhispersVisible(true);
                }, Math.min(estimatedPlayMs, 8000)); // Cap at 8s
            }
        } catch (e: any) {
            setCurrentText("(连接中断)");
            setShowInputBox(true);
        } finally {
            setIsTyping(false);
        }
    };

    // Handle whisper option click: send the whisper as user action with hidden director hint
    const handleWhisperClick = async (whisper: InnerWhisper) => {
        if (isTyping) return;
        clearWhispers();
        setIsTyping(true);

        // The whisper text becomes the user's visible action
        const userAction = whisper.whisper;

        try {
            const result = await onSendMessage(userAction, whisper.secret || undefined);
            const items = parseDialogue(result.content, 'normal');
            setDialogueBatch(items);
            setDialogueQueue(items);
            if (items.length > 0) {
                processNextDialogue(items[0], items.slice(1));
            }
            // Schedule next whisper reveal if AI provided more
            if (result.whispers.length > 0) {
                const totalChars = items.reduce((sum, item) => sum + item.text.length, 0);
                const estimatedPlayMs = totalChars * 20 + items.length * 500;
                whisperRevealTimer.current = setTimeout(() => {
                    setActiveWhispers(result.whispers);
                    setWhispersVisible(true);
                }, Math.min(estimatedPlayMs, 8000));
            }
        } catch (e: any) {
            setCurrentText("(连接中断)");
            setShowInputBox(true);
        } finally {
            setIsTyping(false);
        }
    };

    const handleRerollClick = async () => {
        if (isTyping) return;
        setIsTyping(true);
        clearWhispers();
        try {
            const result = await onReroll();
            const items = parseDialogue(result.content, 'normal');
            setDialogueBatch(items);
            setDialogueQueue(items);
            if (items.length > 0) processNextDialogue(items[0], items.slice(1));
            // Schedule whisper reveal after reroll (same as handleSend)
            if (result.whispers.length > 0) {
                const totalChars = items.reduce((sum, item) => sum + item.text.length, 0);
                const estimatedPlayMs = totalChars * 20 + items.length * 500;
                whisperRevealTimer.current = setTimeout(() => {
                    setActiveWhispers(result.whispers);
                    setWhispersVisible(true);
                }, Math.min(estimatedPlayMs, 8000));
            }
        } catch(e) {
            // Error handled in parent
        } finally {
            setIsTyping(false);
        }
    };

    const handleExitClick = (syncMode: DateExitSyncMode) => {
        const currentState: DateState = {
            dialogueQueue: dialogueQueue || [],
            dialogueBatch: dialogueBatch || [],
            currentText,
            bgImage,
            bgSource: bgImage ? (bgImage === char.dateBackground ? 'characterDateBackground' : 'inline') : 'none',
            currentSprite,
            isNovelMode,
            timestamp: Date.now(),
            peekStatus
        };
        setShowExitModal(false);
        onExit(currentState, syncMode);
    };

    // Message Touch Logic (Robust version for scrollable lists)
    const handleMsgTouchStart = (e: React.TouchEvent | React.MouseEvent, msg: Message) => {
        if ('touches' in e) {
            touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            touchStartRef.current = { x: e.clientX, y: e.clientY };
        }

        longPressTimer.current = setTimeout(() => {
            setSelectedMessage(msg);
            setModalType('options');
        }, 600);
    };

    const handleMsgTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!longPressTimer.current || !touchStartRef.current) return;
        
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const dx = Math.abs(clientX - touchStartRef.current.x);
        const dy = Math.abs(clientY - touchStartRef.current.y);

        // If moved more than 10px, assume scrolling and cancel long press
        if (dx > 10 || dy > 10) {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleMsgTouchEnd = () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    };

    // Determine if we can reroll (last message is assistant)
    const canReroll = messages.length > 0 && messages[messages.length - 1].role === 'assistant';
    const transientUiActive = showInputBox || isTyping;

    return (
        <div className="h-full w-full relative bg-black overflow-hidden font-sans select-none" onClick={handleScreenClick}>
            
            {/* Background Layer */}
            <div 
                className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ${isNovelMode ? 'blur-xl opacity-30' : ''}`}
                style={{ backgroundImage: bgImage ? `url(${bgImage})` : 'none' }}
            ></div>

            {/* Menu Layer */}
            <div className="absolute top-0 right-0 p-4 pt-12 z-[100] flex justify-end gap-3 pointer-events-auto">
                {!isTyping && canReroll && (
                    <button onClick={(e) => { e.stopPropagation(); handleRerollClick(); }} className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${isNovelMode ? 'bg-white/10 backdrop-blur-md border-slate-300/30 text-slate-400 hover:bg-white/20' : 'bg-black/30 backdrop-blur-md border-white/20 text-white hover:bg-white/20'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                    </button>
                )}
                
                {/* Novel Mode Toggle */}
                <button onClick={(e) => { e.stopPropagation(); setIsNovelMode(!isNovelMode); }} className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${isNovelMode ? 'bg-white text-black border-white' : 'bg-black/30 backdrop-blur-md border-white/20 text-white hover:bg-white/20'}`}>
                    {isNovelMode ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                    )}
                </button>

                <button onClick={(e) => { e.stopPropagation(); setShowInputBox(!showInputBox); }} className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${showInputBox ? 'bg-primary border-primary text-white' : 'bg-black/30 backdrop-blur-md border-white/20 text-white hover:bg-white/20'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowSettings(true); }} className="bg-black/30 backdrop-blur-md text-white w-10 h-10 rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-all shadow-lg active:scale-95">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 2.555c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.212 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-2.555c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                </button>
                <button onClick={() => setShowExitModal(true)} className="bg-red-500/80 backdrop-blur-md text-white px-4 h-10 rounded-full flex items-center justify-center gap-1 border border-white/20 hover:bg-red-600 transition-colors shadow-lg active:scale-95">
                    <span className="text-xs font-bold mr-1">离开</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>
                </button>
            </div>

            <SummaryFloatingBall
                char={char}
                isGenerating={isSummaryGenerating}
                hasPendingSummary={hasPendingSummary}
                canManualSummary={canManualSummary}
                canAutoSummary={canAutoSummary}
                disabledReason={summaryDisabledReason}
                lastTokenUsage={lastTokenUsage}
                requestDebugCount={requestDebugSnapshots.length}
                onOpenRequestDebug={() => setShowRequestDebug(true)}
                onRequestManualSummary={onRequestSummary}
                onReviewPendingSummary={onReviewPendingSummary}
                onDiscardPendingSummary={onDiscardPendingSummary}
                onToggleAutoSummary={onToggleAutoSummary}
                onToggleAutoHideSummary={onToggleAutoHideSummary}
                onChangeThreshold={onChangeThreshold}
                onOpenSettings={onOpenSummarySettings}
                wordCount={wordCount}
                writingStyle={writingStyle}
                onChangeWordCount={onChangeWordCount}
                onChangeWritingStyle={onChangeWritingStyle}
                temperature={temperature}
                onChangeTemperature={onChangeTemperature}
                fontScale={textScale}
                onChangeFontScale={onChangeFontScale}
                translationEnabled={translationEnabled}
                translateSourceLang={translateSourceLang}
                translateTargetLang={translateTargetLang}
                onToggleTranslation={onToggleTranslation}
                onSetTranslateSourceLang={onSetTranslateSourceLang}
                onSetTranslateTargetLang={onSetTranslateTargetLang}
            />

            {/* Novel Mode View */}
            {isNovelMode && (
                <div ref={novelScrollRef} className={`absolute inset-0 z-20 overflow-y-auto no-scrollbar pt-24 pb-32 px-8 mask-image-gradient overscroll-contain ${char.dateLightReading ? 'bg-[#faf8f5]' : 'bg-black/90 backdrop-blur-sm'}`} onClick={(e) => { e.stopPropagation(); setShowInputBox(true); }}>
                    <div className="min-h-full flex flex-col justify-end">
                        <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
                            {sessionMessages.length === 0 && peekStatus && (
                                <div className={`italic text-center mb-8 px-4 ${char.dateLightReading ? 'text-stone-400' : 'text-slate-200/50'}`} style={{ fontSize: scaledFont(14) }}>
                                    {cleanTextForDisplay(peekStatus).split('\n').map((line, idx) => line.trim() && <p key={idx} className="whitespace-pre-wrap leading-relaxed tracking-wide my-2">{line}</p>)}
                                </div>
                            )}
                            {sessionMessages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`group relative rounded-xl transition-colors -mx-4 px-4 py-2 ${char.dateLightReading ? 'active:bg-stone-100' : 'active:bg-white/5'}`}
                                    onTouchStart={(e) => handleMsgTouchStart(e, msg)}
                                    onTouchEnd={handleMsgTouchEnd}
                                    onTouchMove={handleMsgTouchMove}
                                    onMouseDown={(e) => handleMsgTouchStart(e, msg)}
                                    onMouseUp={handleMsgTouchEnd}
                                    onMouseMove={handleMsgTouchMove}
                                    onMouseLeave={handleMsgTouchEnd}
                                    onContextMenu={(e) => { e.preventDefault(); setSelectedMessage(msg); setModalType('options'); }}
                                >
                                    {msg.role === 'user' ? (
                                        <p className={`whitespace-pre-wrap font-[inherit] text-right leading-loose tracking-wide italic pr-4 ${char.dateLightReading ? 'text-stone-400 border-r-2 border-stone-300/50' : 'text-slate-400 border-r-2 border-slate-600/50'}`} style={{ fontSize: scaledFont(16) }}>{cleanTextForDisplay(msg.content)} <span className="text-[10px] uppercase not-italic ml-2 opacity-50">{userProfile.name}</span></p>
                                    ) : (
                                        <div>
                                            {(() => {
                                                // Use parseDialogue to handle both plain text and <翻译> XML
                                                const items = parseDialogue(msg.content || '', 'normal');
                                                return items.map((item, idx) => {
                                                    const cleanLine = cleanTextForDisplay(item.text);
                                                    if (!cleanLine) return null;
                                                    return (
                                                        <div key={idx} className="mb-4 last:mb-0">
                                                            <p className={`whitespace-pre-wrap font-[inherit] text-justify leading-loose tracking-wide pl-4 ${char.dateLightReading ? 'text-stone-700 border-l-2 border-stone-200' : 'text-slate-200 drop-shadow-md border-l-2 border-white/10'}`} style={{ fontSize: scaledFont(18) }}>{cleanLine}</p>
                                                            {item.translationText && (
                                                                <p className={`whitespace-pre-wrap font-[inherit] text-justify leading-relaxed tracking-wide pl-4 mt-1 ${char.dateLightReading ? 'text-stone-400 border-l-2 border-stone-200/50' : 'text-slate-400/60 border-l-2 border-white/5'}`} style={{ fontSize: scaledFont(14) }}>{item.translationText}</p>
                                                            )}
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Visual Mode View */}
            {!isNovelMode && (
                <>
                    <div className="absolute inset-x-0 bottom-0 h-[90%] flex items-end justify-center pointer-events-none z-10 overflow-hidden">
                        {currentSprite && <img src={currentSprite} className="max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-all duration-300 origin-bottom" style={{ transform: `translate(${spriteConfig.x}%, ${spriteConfig.y}%) scale(${isTextAnimating ? spriteConfig.scale * 1.02 : spriteConfig.scale})` }} />}
                    </div>
                    {!isTyping && (
                        <div className="absolute inset-x-0 bottom-8 z-30 flex flex-col items-center gap-3">
                            {/* VN Dialogue Box */}
                            <div className={`w-[90%] max-w-lg rounded-2xl border border-white/10 p-6 min-h-[140px] shadow-2xl animate-slide-up hover:bg-black/70 cursor-pointer ${transientUiActive ? 'bg-black/70' : 'bg-black/60 backdrop-blur-xl'}`}>
                                <div className="absolute -top-3 left-6"><div className="bg-white/90 text-black px-4 py-1 rounded-sm text-xs font-bold tracking-widest uppercase shadow-[0_4px_10px_rgba(0,0,0,0.3)] transform -skew-x-12">{char.name}</div></div>
                                <p className="text-white/90 leading-relaxed font-light tracking-wide drop-shadow-md mt-2" style={{ fontSize: scaledFont(16) }}>{displayedText}{isTextAnimating && <span className="inline-block w-2 h-4 bg-white/70 ml-1 animate-pulse align-middle"></span>}</p>
                                {/* Translation subtitle — fades in after typewriter finishes */}
                                {!isTextAnimating && currentTranslation && (
                                    <p className="text-white/40 leading-relaxed font-light tracking-wide mt-2 pt-2 border-t border-white/[0.06] animate-fade-in" style={{ fontSize: scaledFont(13) }}>
                                        {currentTranslation}
                                    </p>
                                )}
                                {!isTextAnimating && (dialogueQueue || []).length > 0 && <div className="absolute bottom-3 right-4 animate-bounce opacity-70"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white"><path fillRule="evenodd" d="M12.53 16.28a.75.75 0 0 1-1.06 0l-7.5-7.5a.75.75 0 0 1 1.06-1.06L12 14.69l6.97-6.97a.75.75 0 1 1 1.06 1.06l-7.5 7.5Z" clipRule="evenodd" /></svg></div>}
                                {!isTextAnimating && (dialogueQueue || []).length === 0 && (dialogueBatch || []).length > 0 && !whispersVisible && <div className="absolute bottom-3 right-4 opacity-50 text-[10px] text-white flex items-center gap-1 animate-pulse"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>Loop</div>}
                            </div>

                            {/* Inner Whispers — Glassmorphism floating options */}
                            {whispersVisible && activeWhispers.length > 0 && !isTextAnimating && (dialogueQueue || []).length === 0 && (
                                <div className="w-[90%] max-w-lg flex flex-col gap-2 pointer-events-auto">
                                    {activeWhispers.map((w, i) => (
                                        <button
                                            key={i}
                                            onClick={(e) => { e.stopPropagation(); handleWhisperClick(w); }}
                                            className="w-full text-left px-5 py-3 rounded-2xl border transition-all duration-300 active:scale-[0.97]
                                                bg-white/[0.07] backdrop-blur-xl border-white/[0.12] hover:bg-white/[0.14] hover:border-white/[0.25]
                                                shadow-[0_4px_24px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.08)]"
                                            style={{ animationDelay: `${i * 150}ms`, animation: `whisperFadeIn 0.6s ease-out ${i * 150}ms both` }}
                                        >
                                            <span className="text-white/80 text-[14px] font-light tracking-wide leading-relaxed">
                                                {w.whisper}
                                            </span>
                                            {w.tone && (
                                                <span className="ml-2 text-[10px] text-white/30 font-medium tracking-wider uppercase">
                                                    {w.tone}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                    {/* Free input fallback */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); clearWhispers(); setShowInputBox(true); }}
                                        className="w-full text-center px-5 py-2.5 rounded-2xl border transition-all duration-300 active:scale-[0.97]
                                            bg-transparent border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12]"
                                        style={{ animation: `whisperFadeIn 0.6s ease-out ${activeWhispers.length * 150}ms both` }}
                                    >
                                        <span className="text-white/30 text-[12px] font-light tracking-widest">✨ 自由输入…</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Whisper fade-in keyframes (injected inline for isolation) */}
            <style>{`
                @keyframes whisperFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {/* Input Layer */}
            <div className={`absolute inset-x-0 bottom-0 z-40 flex justify-center pointer-events-none transition-all duration-300 ${isTyping || showInputBox ? 'opacity-100' : 'opacity-0'}`}>
                {isTyping && (
                    <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-auto">
                        <div className="bg-black/85 px-6 py-3 rounded-full border border-white/20 shadow-2xl animate-pulse flex items-center gap-3">
                             <div className="flex gap-1.5"><div className="w-2 h-2 bg-white rounded-full animate-bounce"></div><div className="w-2 h-2 bg-white rounded-full animate-bounce delay-75"></div><div className="w-2 h-2 bg-white rounded-full animate-bounce delay-150"></div></div>
                             <span className="text-xs text-white font-bold tracking-widest uppercase">Typing...</span>
                        </div>
                    </div>
                )}
                {showInputBox && (
                    <div className={`w-[90%] max-w-lg rounded-2xl p-2 flex gap-2 shadow-2xl animate-fade-in mb-8 pointer-events-auto ${char.dateLightReading ? 'bg-stone-100 border border-stone-300' : 'bg-black/70 border border-white/20'}`} onClick={(e) => e.stopPropagation()}>
                        <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder={isTyping ? "等待回应..." : "输入对话..."} disabled={isTyping} className={`flex-1 bg-transparent px-4 py-3 outline-none font-light resize-none h-14 no-scrollbar leading-tight ${char.dateLightReading ? 'text-stone-800 placeholder:text-stone-400' : 'text-white placeholder:text-white/30'}`} />
                        <button onClick={() => handleSend()} disabled={!input.trim() || isTyping} className="px-6 bg-white text-black rounded-xl font-bold text-sm hover:bg-slate-200 disabled:opacity-50 transition-colors h-14 flex items-center justify-center">SEND</button>
                    </div>
                )}
            </div>

            {/* Settings Overlay */}
            {showSettings && (
                <div className="absolute inset-0 z-[200] animate-slide-up bg-white">
                    <DateSettings char={char} onBack={() => setShowSettings(false)} />
                </div>
            )}

            <Modal isOpen={showRequestDebug} title="最近请求输入" onClose={() => setShowRequestDebug(false)}>
                <div className="space-y-3 text-slate-600">
                    {requestDebugSnapshots.length === 0 || !selectedRequestDebug ? (
                        <div className="py-6 text-center text-sm text-slate-400">还没有记录到见面请求。</div>
                    ) : (
                        <>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {requestDebugSnapshots.map((snapshot, index) => {
                                    const active = selectedRequestDebug.id === snapshot.id;
                                    return (
                                        <button
                                            key={snapshot.id}
                                            type="button"
                                            onClick={() => setSelectedRequestDebugId(snapshot.id)}
                                            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                            {index === 0 ? '最新' : `#${index + 1}`} · {snapshot.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
                                <div>时间：{new Date(selectedRequestDebug.updatedAt).toLocaleString()}</div>
                                <div>模型：{selectedRequestDebug.model || '--'}</div>
                                <div>消息：{selectedRequestDebug.messages.length} 条，合计 {requestDebugCharCount.toLocaleString('zh-CN')} 字符</div>
                                <div>参数：temperature {selectedRequestDebug.temperature ?? '--'}{selectedRequestDebug.maxTokens ? `，max_tokens ${selectedRequestDebug.maxTokens.toLocaleString('zh-CN')}` : ''}</div>
                            </div>
                            <textarea
                                readOnly
                                value={requestDebugText}
                                className="h-[52vh] w-full resize-none rounded-2xl bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100 outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(requestDebugText)
                                        .then(() => addToast('已复制请求输入', 'success'))
                                        .catch(() => addToast('复制失败', 'error'));
                                }}
                                className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white"
                            >
                                复制当前输入
                            </button>
                        </>
                    )}
                </div>
            </Modal>

            {/* Exit Modal */}
            <Modal isOpen={showExitModal} title="离开见面?" onClose={() => setShowExitModal(false)} footer={
                <div className="flex w-full flex-col gap-2">
                    <button onClick={() => handleExitClick('summary')} className="w-full py-3 bg-emerald-500 text-white rounded-2xl font-bold shadow-lg shadow-emerald-100">生成总结同步</button>
                    <button onClick={() => handleExitClick('raw')} className="w-full py-3 bg-slate-800 text-white rounded-2xl font-bold">同步原始记录</button>
                    <div className="flex gap-2">
                        <button onClick={() => setShowExitModal(false)} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold">留在这里</button>
                        <button onClick={() => handleExitClick('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold">暂不同步</button>
                    </div>
                </div>
            }>
                <div className="text-center text-slate-500 text-sm py-2 leading-relaxed">离开时可以把这次线下见面同步给主聊天。同步内容用户不会在聊天列表里看到，但角色之后会自然记得。</div>
            </Modal>

            {/* Message Options Modal */}
            <Modal isOpen={modalType === 'options'} title="操作" onClose={() => setModalType('none')}>
                <div className="space-y-3">
                    <button onClick={() => {
                        if (selectedMessage) {
                            const clean = (selectedMessage.content || '').replace(/\[.*?\]/g, '').trim();
                            navigator.clipboard.writeText(clean).then(() => addToast('已复制', 'success')).catch(() => addToast('复制失败', 'error'));
                        }
                        setModalType('none');
                    }} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl">复制文本</button>
                    <button onClick={() => { onEditMessage(selectedMessage!); setModalType('none'); }} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl">编辑内容</button>
                    <button onClick={() => { onDeleteMessage(selectedMessage!); setModalType('none'); }} className="w-full py-3 bg-red-50 text-red-500 font-medium rounded-2xl">删除记录</button>
                </div>
            </Modal>
        </div>
    );
};

export default DateSession;
