/**
 * AkashicShadows — 阿卡西之影 (Immersive Visual Novel Chat with Uranus)
 *
 * Three-phase UI:
 *   Phase 1: Entrance ceremony — floating silver text on ink-blue/black gradient, long-press to burn away
 *   Phase 2: Visual novel dialog — random background, Uranus' text fades in, abyss-style input panel
 *   Phase 3: Exit — fade-to-dark animation back to menu
 */
import React,{ useState,useRef,useEffect,useCallback,useMemo } from 'react';
import { SecondaryAPIConfig } from './zhaixinglouStore';
import { fetchSecondaryApi } from './zhaixinglouApi';
import { buildAkashicShadowsPrompt,URANUS_GREETINGS } from './divinationPrompts';
import { calcCelestialEvents,formatEphemerisForPrompt } from './astroCalc';
import { CharacterProfile } from '../../types';
import { SelectedCard } from './zhaixinglouStore';
import ShareCardModal,{ type ShareContext } from './ShareCardModal';
import { truncateMessages } from './chatUtils';


// ── Floating Latin text fragments for entrance ──
const LATIN_FRAGMENTS = [
    'fatum', 'umbra', 'anima', 'nox', 'ignis', 'caelum', 'tempus',
    'memoria', 'desiderium', 'silentium', 'aeternum', 'veritas',
    'oblivio', 'somnus', 'stella', 'abyssus', 'arcanum', 'vestigium',
    'spiritus', 'tenebrae', 'lux', 'orbis', 'finis', 'initium',
    'cinis', 'flamma', 'vox', 'cor', 'vita', 'mors',
];

interface Props {
    onBack: () => void;
    isApiConfigured: boolean;
    onOpenSettings: () => void;
    apiConfig: SecondaryAPIConfig;
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
    onAddMessage: (msg: { role: 'user' | 'assistant' | 'system'; content: string }) => void;
    onSetMessages: (msgs: { role: 'user' | 'assistant' | 'system'; content: string }[]) => void;
    isLoading: boolean;
    setLoading: (v: boolean) => void;
    selectedCard: SelectedCard | null;
    characters: CharacterProfile[];
    userName: string;
}

type Phase = 'entrance' | 'dialog' | 'exiting';

// ── Floating Text Item ──
interface FloatingText {
    id: number;
    text: string;
    x: number; // %
    y: number; // %
    size: number; // px
    opacity: number;
    duration: number; // animation duration
    delay: number;
    dissolved: boolean;
    dissolveDelay: number;
    rotation: number; // initial rotation in degrees
    spinDuration: number; // self-rotation period in seconds
    spinDirection: 1 | -1; // clockwise or counter-clockwise
}

function generateFloatingTexts(count: number): FloatingText[] {
    const texts: FloatingText[] = [];
    let attempts = 0;

    // Try to place words with minimum distance between them
    while (texts.length < count && attempts < count * 10) {
        attempts++;
        const angle = Math.random() * Math.PI * 2;
        const minR = 23; const maxR = 48; // keep a larger empty zone in the center
        const r = minR + Math.random() * (maxR - minR);
        const x = 50 + Math.cos(angle) * r;
        const y = 50 + Math.sin(angle) * r * 0.85;

        // Collision check - keep words at least 8-12 units apart (rough %)
        const tooClose = texts.some(existing => {
            const dx = existing.x - x;
            const dy = existing.y - y;
            return Math.sqrt(dx * dx + dy * dy) < 10; // Keep 10% distance threshold
        });

        if (tooClose) continue; // Try another spot

        const rotation = (Math.random() - 0.5) * 360;
        // Random self-rotation: slow (60-150s per revolution), random direction
        const spinDuration = Math.random() * 90 + 60;
        const spinDirection = (Math.random() > 0.5 ? 1 : -1) as 1 | -1;

        texts.push({
            id: texts.length,
            text: LATIN_FRAGMENTS[Math.floor(Math.random() * LATIN_FRAGMENTS.length)],
            x: Math.max(2, Math.min(96, x)),
            y: Math.max(2, Math.min(96, y)),
            size: Math.random() * 18 + 12,  // 12-30px
            opacity: Math.random() * 0.25 + 0.10, // Lower initial opacity
            duration: Math.random() * 15 + 10,
            delay: Math.random() * -20,
            dissolved: false,
            dissolveDelay: 0,
            rotation,
            spinDuration,
            spinDirection,
        });
    }

    // If collision detection couldn't fit all count, return what we have (keeps it clean)
    return texts;
}

const AkashicShadows: React.FC<Props> = ({
    onBack, isApiConfigured, onOpenSettings, apiConfig,
    messages, onAddMessage, isLoading, setLoading,
    selectedCard, characters, userName,
}) => {
    const [phase, setPhase] = useState<Phase>('entrance');
    const [showInput, setShowInput] = useState(false);
    const [input, setInput] = useState('');
    const [longPressActive, setLongPressActive] = useState(false);
    const [entranceDissolved, setEntranceDissolved] = useState(false);
    const [entranceFadingOut, setEntranceFadingOut] = useState(false); // overlay fade-out
    const [dissolvingMessage, setDissolvingMessage] = useState<string | null>(null);
    const [fadingOutAssistant, setFadingOutAssistant] = useState<string | null>(null);
    const [showLatestAssistant, setShowLatestAssistant] = useState(true);
    const prevAssistantCountRef = useRef(0);
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pressPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Session-stable random picks ──
    const randomGreeting = useMemo(() => URANUS_GREETINGS[Math.floor(Math.random() * URANUS_GREETINGS.length)], []);
    const sigilWords = useMemo(() => LATIN_FRAGMENTS.slice(0, 12), []);
    const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>(() => generateFloatingTexts(30));
    const [shareVisible, setShareVisible] = useState(false);
    const [shareContent, setShareContent] = useState('');
    const shareContext: ShareContext = {
        source: 'akashic',
        title: 'Akashic Shadows',
        date: new Date().toLocaleDateString('zh-CN'),
    };

    // ── Ephemeris data ──
    const ephemerisData = useMemo(() => {
        const now = new Date();
        const events = calcCelestialEvents(now);
        return formatEphemerisForPrompt(events, now);
    }, []);

    // ── Resolve character profile ──
    const charProfile = useMemo(() => {
        if (!selectedCard || selectedCard.type === 'user') return undefined;
        return characters.find(c => c.id === selectedCard.characterId);
    }, [selectedCard, characters]);
    const isUser = selectedCard?.type === 'user';

    // ── Build system prompt ──
    const systemPrompt = useMemo(() => buildAkashicShadowsPrompt({
        isUser: !!isUser,
        userName,
        ephemerisData,
        charProfile: charProfile as any,
    }), [isUser, userName, ephemerisData, charProfile]);

    // ── Detect new assistant messages → dissolve old, reveal new ──
    useEffect(() => {
        const assistantMsgs = messages.filter(m => m.role === 'assistant');
        const count = assistantMsgs.length;
        if (count > prevAssistantCountRef.current && prevAssistantCountRef.current > 0) {
            // A new assistant message arrived — fade out the previous one
            const prevMsg = assistantMsgs[count - 2];
            if (prevMsg) {
                setFadingOutAssistant(prevMsg.content);
                setShowLatestAssistant(false);
                // After old message dissolves, show new one
                setTimeout(() => {
                    setFadingOutAssistant(null);
                    setShowLatestAssistant(true);
                }, 1200);
            }
        }
        prevAssistantCountRef.current = count;
    }, [messages]);

    // ── Long press handlers ──
    const handlePressStart = useCallback((e: React.PointerEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        pressPoint.current = {
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
        };
        setLongPressActive(true);
        pressTimer.current = setTimeout(() => {
            // Dissolve texts based on distance from press point
            setFloatingTexts(prev => prev.map(t => {
                const dx = t.x - pressPoint.current.x;
                const dy = t.y - pressPoint.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                return { ...t, dissolved: true, dissolveDelay: dist * 15 };
            }));
            setEntranceDissolved(true);
            // Add greeting immediately so dialog is ready underneath
            if (messages.length === 0) {
                onAddMessage({ role: 'assistant', content: randomGreeting });
            }
            // Fade out the entrance overlay after text fully dissolves
            setTimeout(() => {
                setEntranceFadingOut(true);
                // After overlay fade completes, fully switch to dialog
                setTimeout(() => {
                    setPhase('dialog');
                }, 1500);
            }, 2500);
        }, 1500);
    }, [messages.length, onAddMessage, randomGreeting]);

    const handlePressEnd = useCallback(() => {
        setLongPressActive(false);
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    }, []);

    // ── Send message ──
    const handleSend = useCallback(async () => {
        if (!input.trim() || isLoading) return;
        const userMsg = input.trim();
        setInput('');
        setShowInput(false);

        // Show dissolving user message
        setDissolvingMessage(userMsg);
        setTimeout(() => setDissolvingMessage(null), 2000);

        onAddMessage({ role: 'user', content: userMsg });
        setLoading(true);

        try {
            const chatMessages = truncateMessages([
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: userMsg },
            ]);
            const reply = await fetchSecondaryApi(apiConfig, chatMessages, { temperature: 1.0 });
            onAddMessage({ role: 'assistant', content: reply || '……（深渊中一片寂静）' });
        } catch (err: any) {
            onAddMessage({ role: 'assistant', content: `……连深渊也在颤抖。(${err.message})` });
        } finally {
            setLoading(false);
        }
    }, [input, isLoading, systemPrompt, messages, apiConfig, onAddMessage, setLoading]);

    // ── Exit animation ──
    const handleExit = useCallback(() => {
        setPhase('exiting');
        setTimeout(onBack, 800);
    }, [onBack]);

    // ── Render: Entrance Phase (also rendered underneath during dissolve) ──
    const entranceOverlay = (
        <div
            className="absolute inset-0 overflow-hidden select-none z-50 akashic-no-callout"
            style={{
                background: 'radial-gradient(ellipse at 50% 40%, #0a1628 0%, #050d1a 40%, #020408 80%, #000 100%)',
                touchAction: 'none',
                opacity: entranceFadingOut ? 0 : 1,
                transition: entranceFadingOut ? 'opacity 1.5s ease-out' : undefined,
                pointerEvents: entranceFadingOut ? 'none' : undefined,
            }}
            onPointerDown={phase === 'entrance' ? handlePressStart : undefined}
            onPointerUp={phase === 'entrance' ? handlePressEnd : undefined}
            onPointerCancel={phase === 'entrance' ? handlePressEnd : undefined}
            onPointerLeave={phase === 'entrance' ? handlePressEnd : undefined}
        >
            {/* Dancing Script font — loaded locally via zhaixinglou.css @font-face */}

            {/* Floating gothic text fragments — wrapped in a slow global rotation */}
            <div className="absolute inset-0 pointer-events-none" style={{ animation: 'akashic-entrance-rotate 180s linear infinite' }}>
                {floatingTexts.map(t => (
                    /* Outer wrapper: handles per-word self-rotation at unique speed */
                    <span
                        key={t.id}
                        className="absolute pointer-events-none select-none"
                        style={{
                            left: `${t.x}%`,
                            top: `${t.y}%`,
                            animation: `akashic-word-spin ${t.spinDuration}s linear infinite${t.spinDirection < 0 ? ' reverse' : ''}`,
                        }}
                    >
                        {/* Inner word: static angle + float wobble + dissolve */}
                        <span
                            style={{
                                display: 'inline-block',
                                fontSize: `${t.size}px`,
                                opacity: t.dissolved ? 0 : t.opacity,
                                color: '#e8ecf4',
                                fontFamily: `'Dancing Script', cursive`,
                                letterSpacing: '0.04em',
                                textShadow: '0 0 6px rgba(232,236,244,0.7), 0 0 14px rgba(200,210,230,0.5), 0 0 28px rgba(180,195,220,0.3)',
                                transform: `rotate(${t.rotation}deg)`,
                                filter: t.dissolved ? 'blur(6px)' : 'none',
                                animation: `akashic-float-${t.id % 4} ${t.duration}s ease-in-out ${t.delay}s infinite alternate`,
                                animationPlayState: t.dissolved ? 'paused' : 'running',
                                transition: t.dissolved
                                    ? 'opacity 1.8s ease-out, filter 1.8s ease-out'
                                    : 'none',
                                transitionDelay: t.dissolved ? `${t.dissolveDelay}ms` : '0ms',
                                willChange: 'opacity, filter',
                            }}
                        >
                            {t.text}
                        </span>
                    </span>
                ))}
            </div>

            {/* Center prompt */}
            {!entranceDissolved && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 pointer-events-none">
                    <div
                        className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 ${longPressActive ? 'scale-110' : ''}`}
                        style={{ animation: 'akashic-symbol-glow 3s ease-in-out infinite alternate' }}
                    >
                        <img
                            src="https://i.postimg.cc/NGRj3Xpb/qi-qi-su-cai-pu-(2).png"
                            alt="旧神符号"
                            className={`w-16 h-16 object-contain transition-all duration-500 ${longPressActive ? 'opacity-100 scale-105' : 'opacity-[0.85]'}`}
                            style={{
                                filter: longPressActive
                                    ? 'drop-shadow(0 0 8px rgba(232,236,244,0.6)) drop-shadow(0 0 20px rgba(200,210,230,0.4))'
                                    : 'drop-shadow(0 0 6px rgba(192,200,216,0.3))',
                            }}
                        />
                    </div>
                    <p className="text-[#e8ecf4]/40 text-xs tracking-[0.35em]" style={{
                        fontFamily: 'ZhaixinglouFont, serif',
                        textShadow: '0 0 10px rgba(232,236,244,0.3)',
                        animation: 'akashic-hint-pulse 3s ease-in-out infinite',
                    }}>
                        ─── 长按以窥见深渊 ───
                    </p>
                </div>
            )}

            {/* Not configured warning */}
            {!isApiConfigured && (
                <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-20 pointer-events-none">
                    <p className="text-[#c0c8d8]/60 text-xs text-center">请先配置副API</p>
                    <button onClick={onOpenSettings} className="px-5 py-2 bg-[#c0c8d8]/10 border border-[#c0c8d8]/30 rounded-xl text-[#c0c8d8] text-xs active:scale-95 transition-transform pointer-events-auto">
                        前往设置
                    </button>
                </div>
            )}

            <style>{`
                @keyframes akashic-entrance-rotate {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes akashic-word-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes akashic-float-0 { 0% { translate: 0 0; opacity: 0.45; } 100% { translate: 6px -12px; opacity: 0.15; } }
                @keyframes akashic-float-1 { 0% { translate: 0 0; opacity: 0.15; } 100% { translate: -8px -10px; opacity: 0.45; } }
                @keyframes akashic-float-2 { 0% { translate: 0 0; opacity: 0.35; } 100% { translate: 5px 10px; opacity: 0.1; } }
                @keyframes akashic-float-3 { 0% { translate: 0 0; opacity: 0.1; } 100% { translate: -6px 8px; opacity: 0.4; } }
                @keyframes akashic-ring-fill {
                    from { stroke-dashoffset: ${2 * Math.PI * 36}; }
                    to { stroke-dashoffset: 0; }
                }
                @keyframes akashic-symbol-glow {
                    0% { filter: drop-shadow(0 0 4px rgba(232,236,244,0.15)); }
                    100% { filter: drop-shadow(0 0 12px rgba(200,210,230,0.35)) drop-shadow(0 0 24px rgba(180,195,220,0.15)); }
                }
                @keyframes akashic-hint-pulse {
                    0%, 100% { opacity: 0.35; }
                    50% { opacity: 0.6; }
                }
            `}</style>

        </div>
    );

    // No early return — dialog content always renders underneath
    // The entrance overlay covers it at z-20 during entrance phase


    // ── Render: Dialog Phase & Exiting Phase ──
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    return (
        <div className="absolute inset-0">
            {/* Dialog content */}
            <div
                className={`absolute inset-0 flex flex-col overflow-hidden transition-all duration-700 ${phase === 'exiting' ? 'opacity-0 translate-y-8' : 'opacity-100'}`}
            >
                {/* Dark gradient background */}
                <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, #0a1628 0%, #050d1a 40%, #020408 80%, #000 100%)' }} />

                {/* Noise texture overlay */}
                <div className="absolute inset-0 opacity-[0.035] pointer-events-none" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    backgroundSize: '128px 128px',
                }} />

                {/* Slow breathing glow */}
                <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'radial-gradient(ellipse at 50% 50%, rgba(100,120,160,0.06) 0%, transparent 60%)',
                    animation: 'akashic-breathe 8s ease-in-out infinite',
                }} />

                {/* Heavy vignette — imprisoned feeling */}
                <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.85) 100%)',
                }} />

                {/* ═══ TOP ZONE: Header + Oracle Panel ═══ */}
                <div className="relative z-30 pt-12 pb-2 px-6 flex items-center shrink-0">
                    <button
                        onClick={handleExit}
                        className="p-2 -ml-2 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-[#c0c8d8] border border-[#c0c8d8]/20 bg-black/30 backdrop-blur-md"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <div className="flex-1 flex justify-center">
                        <span className="text-[#e8ecf4]/80 text-lg tracking-[0.25em]" style={{
                            fontFamily: 'ZhaixinglouTitle, serif',
                            textShadow: '0 0 8px rgba(232,236,244,0.5), 0 0 20px rgba(200,210,230,0.3), 0 0 40px rgba(180,195,220,0.15)',
                        }}>
                            Akashic Shadows
                        </span>
                    </div>
                    <div className="w-9" />
                </div>

                {/* Oracle message panel — upper half */}
                <div className="relative z-20 px-5 shrink-0" style={{ height: '38%' }}>
                    <div className="h-full rounded-2xl overflow-hidden relative flex flex-col" style={{
                        border: '1px solid rgba(232,236,244,0.08)',
                        background: 'linear-gradient(180deg, rgba(10,22,40,0.4) 0%, rgba(5,13,26,0.6) 100%)',
                        boxShadow: 'inset 0 1px 0 rgba(232,236,244,0.05), 0 0 30px rgba(0,0,0,0.3)',
                    }}>
                        {/* Corner decorations — tarot card style */}
                        <div className="absolute top-2.5 left-2.5 w-4 h-4 border-t border-l border-[#e8ecf4]/15 rounded-tl-sm pointer-events-none z-10" />
                        <div className="absolute top-2.5 right-2.5 w-4 h-4 border-t border-r border-[#e8ecf4]/15 rounded-tr-sm pointer-events-none z-10" />
                        <div className="absolute bottom-2.5 left-2.5 w-4 h-4 border-b border-l border-[#e8ecf4]/15 rounded-bl-sm pointer-events-none z-10" />
                        <div className="absolute bottom-2.5 right-2.5 w-4 h-4 border-b border-r border-[#e8ecf4]/15 rounded-br-sm pointer-events-none z-10" />

                        {/* Oracle panel top decorative line */}
                        <div className="h-[1px] shrink-0" style={{
                            background: 'linear-gradient(90deg, transparent 10%, rgba(232,236,244,0.15) 30%, rgba(232,236,244,0.2) 50%, rgba(232,236,244,0.15) 70%, transparent 90%)',
                        }} />

                        {/* Oracle content area */}
                        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-5 py-5 flex flex-col">
                            <div style={{ margin: 'auto 0' }}>
                                {assistantMessages.length === 0 && !isLoading && (
                                    <div className="flex items-center justify-center">
                                        <p className="text-[#c0c8d8]/25 text-xs tracking-[0.3em]" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>
                                            ─ 深渊在凝视 ─
                                        </p>
                                    </div>
                                )}

                                {/* Previous assistant message dissolving away */}
                                {fadingOutAssistant && (
                                    <div className="animate-[akashic-dissolve-up_1.2s_ease-out_forwards]">
                                        <p
                                            className="text-[#d8dce8] text-[14px] leading-[2] tracking-wide"
                                            style={{
                                                fontFamily: 'ZhaixinglouCN, serif',
                                                textShadow: '0 0 6px rgba(200,210,230,0.15), 0 1px 3px rgba(0,0,0,0.6)',
                                            }}
                                        >
                                            {fadingOutAssistant}
                                        </p>
                                    </div>
                                )}

                                {/* Latest assistant message */}
                                {assistantMessages.length > 0 && showLatestAssistant && (
                                    <div className="animate-[akashic-blur-in_2s_ease-out_both]" key={assistantMessages.length}>
                                        <p
                                            className="text-[#d8dce8] text-[14px] leading-[2] tracking-wide"
                                            style={{
                                                fontFamily: 'ZhaixinglouCN, serif',
                                                textShadow: '0 0 6px rgba(200,210,230,0.15), 0 1px 3px rgba(0,0,0,0.6)',
                                            }}
                                        >
                                            {assistantMessages[assistantMessages.length - 1].content}
                                        </p>
                                    </div>
                                )}

                                {/* User message dissolve effect */}
                                {dissolvingMessage && (
                                    <div className="mt-4 animate-[akashic-dissolve-up_2s_ease-out_forwards]">
                                        <p
                                            className="text-[#e8ecf4]/50 text-[13px] leading-[1.9] tracking-wide text-right italic"
                                            style={{
                                                fontFamily: 'ZhaixinglouCN, serif',
                                                textShadow: '0 0 8px rgba(232,236,244,0.3)',
                                            }}
                                        >
                                            {dissolvingMessage}
                                        </p>
                                    </div>
                                )}

                                {/* Loading indicator */}
                                {isLoading && (
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-[#c0c8d8]/40 text-lg animate-pulse" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>✧</span>
                                        <span className="text-[#c0c8d8]/25 text-xs tracking-[0.3em]" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>深渊在回响</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Oracle panel bottom decorative line */}
                        <div className="h-[1px] shrink-0" style={{
                            background: 'linear-gradient(90deg, transparent 10%, rgba(232,236,244,0.1) 30%, rgba(232,236,244,0.15) 50%, rgba(232,236,244,0.1) 70%, transparent 90%)',
                        }} />

                        {/* Share button — bottom right corner */}
                        {assistantMessages.length > 0 && !isLoading && (
                            <button
                                onClick={() => {
                                    const latest = assistantMessages[assistantMessages.length - 1];
                                    if (latest) {
                                        setShareContent(latest.content);
                                        setShareVisible(true);
                                    }
                                }}
                                className="absolute bottom-3 right-3 z-20 p-1.5 rounded-full hover:bg-white/5 active:scale-90 transition-all"
                                title="分享"
                            >
                                <span className="text-[#e8ecf4]/25 text-[11px]" style={{
                                    fontFamily: 'ZhaixinglouFont, serif',
                                    textShadow: '0 0 4px rgba(232,236,244,0.2)',
                                }}>✧</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* ═══ BOTTOM ZONE: Sigil Ring + Input ═══ */}
                <div className="flex-1 relative z-20 flex flex-col items-center justify-center">
                    {/* Rotating sigil ring with old god symbol */}
                    <div className="relative" style={{ width: '250px', height: '250px' }}>
                        {/* ── Outer layer: Large, slow, clockwise ── */}
                        <div className="absolute inset-0" style={{ animation: 'akashic-sigil-rotate 90s linear infinite' }}>
                            {sigilWords.map((word, i) => {
                                const angle = (i / sigilWords.length) * 360;
                                return (
                                    <span
                                        key={`outer-${i}`}
                                        className="absolute left-1/2 top-1/2 pointer-events-none select-none"
                                        style={{
                                            transform: `rotate(${angle}deg) translateY(-120px) rotate(-${angle}deg)`,
                                            marginLeft: '-25px',
                                            marginTop: '-10px',
                                            fontSize: '14px',
                                            color: '#e8ecf4',
                                            opacity: i % 2 === 0 ? 0.25 : 0.15, // Alternating opacity
                                            fontFamily: `'Dancing Script', cursive`,
                                            letterSpacing: '0.08em',
                                            textShadow: '0 0 8px rgba(232,236,244,0.4)',
                                            width: '50px',
                                            textAlign: 'center',
                                        }}
                                    >
                                        {word}
                                    </span>
                                );
                            })}
                        </div>

                        {/* ── Middle layer: Medium, medium speed, counter-clockwise ── */}
                        <div className="absolute inset-0" style={{ animation: 'akashic-sigil-rotate-reverse 60s linear infinite' }}>
                            {sigilWords.map((word, i) => {
                                // Offset angle so they don't perfectly align initially
                                const angle = (i / sigilWords.length) * 360 + 15;
                                return (
                                    <span
                                        key={`mid-${i}`}
                                        className="absolute left-1/2 top-1/2 pointer-events-none select-none"
                                        style={{
                                            transform: `rotate(${angle}deg) translateY(-90px) rotate(-${angle}deg)`,
                                            marginLeft: '-22px',
                                            marginTop: '-8px',
                                            fontSize: '11px',
                                            color: '#e8ecf4',
                                            opacity: 0.18,
                                            fontFamily: `'Dancing Script', cursive`,
                                            letterSpacing: '0.05em',
                                            textShadow: '0 0 6px rgba(232,236,244,0.3)',
                                            width: '44px',
                                            textAlign: 'center',
                                        }}
                                    >
                                        {word}
                                    </span>
                                );
                            })}
                        </div>

                        {/* ── Inner layer: Small, fast, clockwise ── */}
                        <div className="absolute inset-0" style={{ animation: 'akashic-sigil-rotate 40s linear infinite' }}>
                            {sigilWords.map((word, i) => {
                                // Double the words for density, but smaller
                                if (i % 2 !== 0) return null; // skip every other word to reduce clutter
                                const angle = (i / sigilWords.length) * 360 + 45;
                                return (
                                    <span
                                        key={`inner-${i}`}
                                        className="absolute left-1/2 top-1/2 pointer-events-none select-none"
                                        style={{
                                            transform: `rotate(${angle}deg) translateY(-60px) rotate(-${angle}deg)`,
                                            marginLeft: '-18px',
                                            marginTop: '-6px',
                                            fontSize: '9px',
                                            color: '#e8ecf4',
                                            opacity: 0.3, // slightly brighter as it's closest to the god symbol
                                            fontFamily: `'Dancing Script', cursive`,
                                            letterSpacing: '0.04em',
                                            textShadow: '0 0 4px rgba(232,236,244,0.2)',
                                            width: '36px',
                                            textAlign: 'center',
                                        }}
                                    >
                                        {word}
                                    </span>
                                );
                            })}
                        </div>

                        {/* Center old god symbol */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <button
                                onClick={() => {
                                    setShowInput(!showInput);
                                    if (!showInput) setTimeout(() => inputRef.current?.focus(), 300);
                                }}
                                className="relative transition-all duration-500 active:scale-95"
                            >
                                <img
                                    src="https://i.postimg.cc/NGRj3Xpb/qi-qi-su-cai-pu-(2).png"
                                    alt="旧神符号"
                                    className="w-14 h-14 object-contain transition-all duration-500"
                                    style={{
                                        opacity: showInput ? 0.8 : 0.45,
                                        filter: showInput
                                            ? 'drop-shadow(0 0 10px rgba(232,236,244,0.5)) drop-shadow(0 0 25px rgba(200,210,230,0.3))'
                                            : 'drop-shadow(0 0 6px rgba(192,200,216,0.25))',
                                        animation: 'akashic-symbol-glow 3s ease-in-out infinite alternate',
                                    }}
                                />
                            </button>
                        </div>
                    </div>

                    {/* Input area — below sigil */}
                    <div className={`w-full px-8 transition-all duration-500 ease-out ${showInput ? 'max-h-[80px] opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`} style={{ overflow: 'hidden' }}>
                        <div className="flex items-center gap-3">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                placeholder="向深渊低语……"
                                className="flex-1 bg-transparent border-none px-0 py-2 text-sm text-[#e8ecf4] placeholder-[#c0c8d8]/20 focus:outline-none text-center"
                                style={{ fontFamily: 'ZhaixinglouCN, serif' }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                className="text-[#e8ecf4]/40 text-xs tracking-widest active:scale-95 transition-all disabled:opacity-10 hover:text-[#e8ecf4]/70"
                                style={{ fontFamily: 'ZhaixinglouFont, serif' }}
                            >
                                ✧
                            </button>
                        </div>
                        {/* Glowing silver line */}
                        <div className="h-[1px] mt-1" style={{
                            background: 'linear-gradient(90deg, transparent 0%, rgba(232,236,244,0.35) 30%, rgba(232,236,244,0.45) 50%, rgba(232,236,244,0.35) 70%, transparent 100%)',
                            boxShadow: '0 0 6px rgba(232,236,244,0.15), 0 0 12px rgba(200,210,230,0.08)',
                        }} />
                    </div>
                </div>

                <style>{`
                @keyframes akashic-blur-in {
                    0% { opacity: 0; filter: blur(8px); transform: translateY(12px); }
                    100% { opacity: 1; filter: blur(0); transform: translateY(0); }
                }
                @keyframes akashic-dissolve-up {
                    0% { opacity: 0.7; transform: translateY(0); filter: blur(0); }
                    60% { opacity: 0.3; transform: translateY(-15px); filter: blur(2px); }
                    100% { opacity: 0; transform: translateY(-30px); filter: blur(6px); }
                }
                @keyframes akashic-breathe {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 1; }
                }
                @keyframes akashic-sigil-rotate {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes akashic-sigil-rotate-reverse {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(-360deg); }
                }
            `}</style>


                <ShareCardModal
                    visible={shareVisible}
                    onClose={() => setShareVisible(false)}
                    content={shareContent}
                    context={shareContext}
                />
            </div>

            {/* Entrance overlay — covers everything during entrance, fades out during transition */}
            {(phase === 'entrance' || entranceFadingOut) && entranceOverlay}
        </div>
    );
};

export default AkashicShadows;
