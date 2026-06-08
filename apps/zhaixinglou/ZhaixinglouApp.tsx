/**
 * ZhaixinglouApp — 摘星楼 Main Entry Point
 * 
 * View state machine: select → menu → (starMirror | starOrbit | starCalendar | akashicShadows)
 * Features: card carousel (user first), 4-option menu, golden particles, secondary API settings.
 */
import React,{ useState,useCallback,useEffect,Suspense } from 'react';
import './zhaixinglou.css'; // Self-contained keyframes — independent from index.css
import { useOS } from '../../context/OSContext';
import { useZhaixinglouStore,SelectedCard } from './zhaixinglouStore';
import { GothicHeader,GothicDivider,GothicCornerDecor,GothicBackgroundDecor,DECOR } from './components/GothicDecorations';
import SecondaryApiSettingsModal from './SecondaryApiSettingsModal';
import { useTarotPreloader } from './AssetPreloader';
import { useZhaixinglouFonts } from './zhaixinglouFonts';
// --- Lazy-loaded sub-pages (progressively prefetched by viewState) ---
const LazyGoldenParticles = React.lazy(() => import('./GoldenParticles'));
const StarMirror = React.lazy(() => import('./StarMirror'));
const StarOrbit = React.lazy(() => import('./StarOrbit'));
const StarCalendar = React.lazy(() => import('./StarCalendar'));
const AkashicShadows = React.lazy(() => import('./AkashicShadows'));

const TAROT_BACK_IMAGE = 'https://i.postimg.cc/jS3qsYhB/MEITU-20260225-013328235.jpg';

/** SVG noise texture for atmospheric depth */
const NoiseBackground: React.FC = React.memo(() => (
    <>
        {/* SVG fractal noise filter */}
        <svg className="absolute w-0 h-0">
            <filter id="zhaixinglou-noise">
                <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" stitchTiles="stitch" />
                <feColorMatrix type="saturate" values="0" />
            </filter>
        </svg>
        {/* Noise overlay layer — subtle texture */}
        <div className="absolute inset-0 pointer-events-none z-[1] opacity-[0.045]" style={{ filter: 'url(#zhaixinglou-noise)' }}></div>

        {/* ── Static dark-red to black radial gradient (top-right → bottom-left) ── */}
        <div className="absolute inset-0 pointer-events-none z-[2]" style={{
            background: 'radial-gradient(ellipse 85% 75% at 80% 15%, rgba(110,15,25,0.85) 0%, rgba(60,8,14,0.45) 45%, transparent 80%)'
        }}></div>

        {/* Vignette — stronger edges for depth */}
        <div className="absolute inset-0 pointer-events-none z-[3]" style={{
            background: 'radial-gradient(ellipse 65% 55% at 50% 50%, transparent 15%, rgba(5,2,3,0.7) 85%)'
        }}></div>
    </>
));

const ZhaixinglouApp: React.FC = () => {
    const { closeApp, characters, userProfile } = useOS();
    const { state, dispatch, goBack } = useZhaixinglouStore();
    const [flippingCardId, setFlippingCardId] = useState<string | null>(null);
    const [flipPhase, setFlipPhase] = useState<'idle' | 'toBack' | 'holdBack' | 'toFront' | 'done'>('idle');
    const [showParticles, setShowParticles] = useState(false);
    const zhaixinglouFonts = useZhaixinglouFonts();

    // Preload all tarot images + font in background
    useTarotPreloader();

    // Load decorative particles after the first paint so the entry screen remains interactive.
    useEffect(() => {
        let cancelled = false;
        let idleId: number | null = null;
        const rIC = window.requestIdleCallback || ((cb: () => void) => window.setTimeout(cb, 1));
        const cIC = window.cancelIdleCallback || window.clearTimeout;
        const frameId = window.requestAnimationFrame(() => {
            const mountParticles = () => {
                if (!cancelled) {
                    setShowParticles(true);
                }
            };

            idleId = rIC(mountParticles, { timeout: 1200 });
        });

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frameId);
            if (idleId !== null) {
                cIC(idleId);
            }
        };
    }, []);

    // --- Progressive prefetch: preload sub-page chunks during user's natural interaction pauses ---
    // NOTE: Safari/iOS does NOT support requestIdleCallback — use setTimeout fallback.
    useEffect(() => {
        const rIC = window.requestIdleCallback || ((cb: () => void) => window.setTimeout(cb, 1));
        const cIC = window.cancelIdleCallback || window.clearTimeout;
        if (state.viewState === 'select') {
            // User is browsing the card carousel (2-3s) → prefetch the 2 most-used sub-pages
            const id = rIC(() => {
                import('./StarMirror');
                import('./StarCalendar');
            });
            return () => cIC(id);
        } else if (state.viewState === 'menu') {
            // User is viewing the menu → prefetch remaining sub-pages
            const id = rIC(() => {
                import('./StarOrbit');
                import('./AkashicShadows');
            });
            return () => cIC(id);
        }
    }, [state.viewState]);

    const isApiConfigured = !!(state.secondaryApiConfig.baseUrl && state.secondaryApiConfig.apiKey && state.secondaryApiConfig.model);

    // Track flip animation timers for cleanup
    const flipTimersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

    // Cleanup flip timers on unmount
    useEffect(() => {
        return () => { flipTimersRef.current.forEach(clearTimeout); };
    }, []);

    // --- Card Selection Handler: Full 4-phase flip ---
    // Phase 1: front → back (1000ms CSS transition)
    // Phase 2: hold on back (600ms pause to show tarot art)
    // Phase 3: back → front (1000ms CSS transition)
    // Phase 4: brief pause, then navigate to menu
    const handleCardSelect = useCallback((card: SelectedCard) => {
        if (flippingCardId) return;
        const flipId = card.type === 'user' ? '__user__' : card.characterId || '';
        setFlippingCardId(flipId);
        setFlipPhase('toBack');

        // Clear any previous timers
        flipTimersRef.current.forEach(clearTimeout);
        flipTimersRef.current = [];

        // Phase 2: Hold on back after flip completes
        flipTimersRef.current.push(setTimeout(() => setFlipPhase('holdBack'), 1000));
        // Phase 3: Flip back to front
        flipTimersRef.current.push(setTimeout(() => setFlipPhase('toFront'), 1600));
        // Phase 4: Navigate after returning to front
        flipTimersRef.current.push(setTimeout(() => {
            dispatch({ type: 'SELECT_CARD', card });
            setFlippingCardId(null);
            setFlipPhase('idle');
        }, 2600));
    }, [flippingCardId, dispatch]);

    const handleOpenSettings = useCallback(() => {
        dispatch({ type: 'TOGGLE_API_SETTINGS' });
    }, [dispatch]);

    // --- Build card list: user first, then characters ---
    const allCards: (SelectedCard & { id: string })[] = [
        { id: '__user__', type: 'user', name: userProfile.name, avatar: userProfile.avatar },
        ...characters.map(c => ({ id: c.id, type: 'character' as const, characterId: c.id, name: c.name, avatar: c.avatar })),
    ];

    // --- Render Feature Page ---
    const renderFeaturePage = () => {
        switch (state.viewState) {
            case 'starMirror':
                return (
                    <StarMirror
                        onBack={goBack}
                        isApiConfigured={isApiConfigured}
                        onOpenSettings={handleOpenSettings}
                        isUser={state.selectedCard?.type === 'user'}
                        apiConfig={state.secondaryApiConfig}
                        userName={userProfile.name}
                        userProfile={userProfile}
                        selectedCard={state.selectedCard}
                        characters={characters}
                        cachedAstroData={state.cachedAstroData}
                    />
                );
            case 'starOrbit':
                return (
                    <StarOrbit
                        onBack={goBack}
                        selectedCard={state.selectedCard}
                        userName={userProfile.name}
                        userProfile={userProfile}
                        apiConfig={state.secondaryApiConfig}
                        isApiConfigured={isApiConfigured}
                        onOpenSettings={handleOpenSettings}
                        characters={characters}
                        onCacheAstro={(key, text) => dispatch({ type: 'CACHE_ASTRO_DATA', key, text })}
                    />
                );
            case 'starCalendar':
                return (
                    <StarCalendar
                        onBack={goBack}
                        isApiConfigured={isApiConfigured}
                        onOpenSettings={handleOpenSettings}
                        apiConfig={state.secondaryApiConfig}
                        userName={userProfile.name}
                        userBio={userProfile.bio}
                        cachedAstroData={state.cachedAstroData}
                        selectedCard={state.selectedCard}
                    />
                );
            case 'akashicShadows':
                return (
                    <AkashicShadows
                        onBack={goBack}
                        isApiConfigured={isApiConfigured}
                        onOpenSettings={handleOpenSettings}
                        apiConfig={state.secondaryApiConfig}
                        messages={state.fateChatMessages}
                        onAddMessage={msg => dispatch({ type: 'ADD_FATE_MESSAGE', message: msg })}
                        onSetMessages={msgs => dispatch({ type: 'SET_FATE_MESSAGES', messages: msgs })}
                        isLoading={state.isLoading}
                        setLoading={v => dispatch({ type: 'SET_LOADING', loading: v })}
                        selectedCard={state.selectedCard}
                        characters={characters}
                        userName={userProfile.name}
                    />
                );
            default:
                return null;
        }
    };

    // --- Render Content Based on ViewState ---
    const renderContent = () => {
        // ========== SELECT SCREEN ==========
        if (state.viewState === 'select') {
            return (
                <>
                    {/* Header */}
                    <div className={`pt-12 pb-4 px-6 flex items-center justify-between shrink-0 h-24 z-30 transition-all duration-700 ${flippingCardId ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100'}`}>
                        <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-[#d4af37] border border-[#d4af37]/30 bg-black/30 backdrop-blur-md">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div className="flex flex-col items-center">
                            <span className="text-[#d4af37] text-2xl tracking-[0.08em]" style={{ fontFamily: 'ZhaixinglouTitle, serif', textShadow: '0 0 10px rgba(212,175,55,0.5)' }}>Tower of Stars</span>
                        </div>
                        <button onClick={handleOpenSettings} className="p-2 -mr-2 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-[#d4af37] border border-[#d4af37]/30 bg-black/30 backdrop-blur-md">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                        </button>
                    </div>

                    {/* Card Carousel */}
                    <div className={`flex-1 flex items-center overflow-x-auto snap-x snap-mandatory pb-10 no-scrollbar relative z-10 transition-opacity duration-1000 ${flippingCardId ? 'pointer-events-none' : ''}`} style={flippingCardId ? { animationPlayState: 'paused' } : undefined}>
                        <div className="w-[calc(50%-130px)] shrink-0"></div>

                        {allCards.map(card => {
                            const isFlipping = flippingCardId === card.id;
                            const showBack = isFlipping && (flipPhase === 'toBack' || flipPhase === 'holdBack');
                            const isOtherFlipping = flippingCardId && flippingCardId !== card.id;
                            const isUserCard = card.type === 'user';

                            return (
                                <div
                                    key={card.id}
                                    className={`snap-center shrink-0 w-[260px] aspect-[2/3.2] px-3 flex flex-col items-center justify-center transition-all duration-700 ease-in-out z-10 ${isOtherFlipping ? 'opacity-20 scale-90 pointer-events-none' : 'opacity-100'}`}
                                    style={{ perspective: '1500px' }}
                                >
                                    <div
                                        onClick={() => handleCardSelect(card)}
                                        className="relative w-full h-full cursor-pointer transition-all duration-[1000ms] group"
                                        style={{
                                            transformStyle: 'preserve-3d',
                                            transform: showBack ? 'rotateY(180deg) scale(1.15) translateY(-5%)' : (isFlipping ? 'rotateY(0deg) scale(1.15) translateY(-5%)' : 'rotateY(0deg)'),
                                            boxShadow: isFlipping ? '0 25px 60px rgba(0,0,0,0.9)' : '0 15px 35px rgba(0,0,0,0.6)',
                                        }}
                                    >
                                        {/* --- Front of Card --- */}
                                        <div
                                            className={`absolute inset-0 rounded-2xl overflow-hidden transition-all duration-300 ${isFlipping
                                                ? 'border-2 border-[#d4af37]/60 bg-[#0d0805]'
                                                : (flippingCardId ? 'bg-[#0a0605]' : 'animate-[background-shine_3s_linear_infinite] bg-[linear-gradient(110deg,#0a0605,40%,#2a1a08,50%,#0a0605)] bg-[length:200%_100%]')
                                                }`}
                                            style={{ backfaceVisibility: 'hidden' }}
                                        >
                                            {/* Inner card — 2px inset to reveal the animated border ring */}
                                            <div className="absolute inset-[2px] rounded-[14px] overflow-hidden bg-[#0a0605] flex flex-col">
                                                <div className="flex-1 relative overflow-hidden">
                                                    <img src={card.avatar} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500 filter contrast-110 saturate-[0.85]" />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                                                    <div className="absolute inset-0 bg-gradient-to-br from-[#d4af37]/10 to-[#8b0000]/10 mix-blend-overlay"></div>
                                                    {/* Image sweep-shine */}
                                                    {!flippingCardId && <div className="absolute inset-0 animate-[background-shine_4s_linear_infinite] bg-[linear-gradient(110deg,transparent,38%,rgba(255,255,255,0.08),50%,transparent)] bg-[length:200%_100%] mix-blend-screen pointer-events-none" />}
                                                </div>
                                                {/* Name + Badge */}
                                                <div className="absolute bottom-0 left-0 right-0 pb-6 pt-16 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col items-center z-10">
                                                    {isUserCard && (
                                                        <span className="text-[9px] bg-[#d4af37]/30 text-[#d4af37] px-3 py-0.5 rounded-full border border-[#d4af37]/40 mb-2 tracking-widest font-bold uppercase">YOU</span>
                                                    )}
                                                    <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/70 to-transparent mb-3"></div>
                                                    <span className="font-bold text-[#e5d08f] text-xl tracking-[0.3em] uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">{card.name}</span>
                                                    <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/70 to-transparent mt-3"></div>
                                                </div>
                                                {/* Corner decorations */}
                                                <div className="absolute top-3 left-3 w-5 h-5 border-t border-l border-[#d4af37]/40 pointer-events-none"></div>
                                                <div className="absolute top-3 right-3 w-5 h-5 border-t border-r border-[#d4af37]/40 pointer-events-none"></div>
                                                <div className="absolute bottom-3 left-3 w-5 h-5 border-b border-l border-[#d4af37]/40 pointer-events-none"></div>
                                                <div className="absolute bottom-3 right-3 w-5 h-5 border-b border-r border-[#d4af37]/40 pointer-events-none"></div>
                                            </div>
                                        </div>

                                        {/* --- Back of Card --- */}
                                        <div className="absolute inset-0 rounded-2xl overflow-hidden border-2 border-[#d4af37] shadow-[inset_0_0_40px_rgba(0,0,0,0.9)] bg-[#110a08]" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                                            <img src={TAROT_BACK_IMAGE} className="w-full h-full object-cover opacity-80 mix-blend-screen" />
                                            <div className="absolute inset-0 bg-gradient-to-b from-[#8c6b3e]/30 to-[#3a2622]/50 mix-blend-multiply"></div>
                                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_10%,_#000_100%)] opacity-90"></div>
                                            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                                                <div className={`absolute w-[150%] h-[200%] top-[-50%] left-[-50%] bg-gradient-to-br from-transparent via-white/10 to-transparent origin-center transition-transform duration-[1500ms] ${showBack ? 'translate-x-[50%] translate-y-[50%] rotate-45' : '-translate-x-[50%] -translate-y-[50%] rotate-45'} ease-out`}></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ground shadow */}
                                    <div className={`w-[70%] h-3 bg-black/60 blur-[8px] rounded-[100%] transition-all duration-1000 ${isFlipping ? 'w-[50%] opacity-20 translate-y-6' : 'translate-y-4'}`}></div>
                                </div>
                            );
                        })}

                        <div className="w-[calc(50%-130px)] shrink-0"></div>
                    </div>

                    {/* Bottom hint */}
                    <div className={`absolute bottom-10 w-full text-center pointer-events-none z-30 transition-all duration-700 ${flippingCardId ? 'opacity-0 translate-y-4' : 'opacity-100'}`}>
                        <span className="text-[#e5d08f]/80 text-xs tracking-widest animate-pulse" style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 8px rgba(212,175,55,0.3)' }}>Swipe to choose your companion</span>
                    </div>
                </>
            );
        }

        // ========== MENU SCREEN ==========
        if (state.viewState === 'menu' && state.selectedCard) {
            const card = state.selectedCard;
            const menuItems = [
                { key: 'starMirror' as const, title: 'Star Mirror', sub: '星 镜', icon: DECOR.justice },
                { key: 'starOrbit' as const, title: 'Astrolabe', sub: '星 轨', icon: DECOR.moonPhases },
                { key: 'starCalendar' as const, title: 'Horoscope', sub: '星 历', icon: DECOR.moon },
                { key: 'akashicShadows' as const, title: 'Akashic Shadows', sub: '阿卡西之影', icon: DECOR.priestess },
            ];
            return (
                <>
                    {/* 背景：命运轮盘缓慢旋转 */}
                    <GothicBackgroundDecor src={DECOR.wheel} size={280} opacity={0.07} spin />
                    {/* 四角装饰 */}
                    <GothicCornerDecor corners={['tl', 'tr', 'bl', 'br']} iconUrl={DECOR.occultSymbol} size={28} opacity={0.2} />

                    {/* Header */}
                    <GothicHeader
                        title="Wheel of Fate"
                        onBack={goBack}
                        decorIcon={DECOR.crown}
                        rightAction={
                            <button onClick={handleOpenSettings} className="p-2 -mr-1 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-[#d4af37] border border-[#d4af37]/30 bg-black/40 backdrop-blur-md">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                            </button>
                        }
                    />

                    {/* Selected Card — 角色信息带哥特装饰框 */}
                    <div className="relative mx-5 mt-1 mb-3 z-30 animate-fade-in">
                        <div className="flex items-center gap-4 px-5 py-3.5 rounded-2xl border border-[#d4af37]/20 bg-black/30 backdrop-blur-md relative overflow-hidden">
                            {/* 头像 */}
                            <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-[#d4af37]/50 shadow-[0_0_20px_rgba(212,175,55,0.3)] shrink-0">
                                <img src={card.avatar} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex flex-col flex-1">
                                <span className="text-[#e5d08f] font-bold text-base tracking-widest">{card.name}</span>
                                {card.type === 'user' && <span className="text-[11px] text-[#d4af37]/70 tracking-widest mt-0.5" style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 6px rgba(212,175,55,0.2)' }}>Seeker</span>}
                                {card.type === 'character' && <span className="text-[11px] text-[#d4af37]/70 tracking-widest mt-0.5" style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 6px rgba(212,175,55,0.2)' }}>Companion</span>}
                            </div>
                            {/* 右侧装饰：圣杯 */}
                            <img src={DECOR.chalice} className="w-10 h-10 object-contain opacity-30" style={{ filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.3))', animation: 'gothic-glow-pulse 5s ease-in-out infinite' }} alt="" />
                            {/* 扫光效果 */}
                            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                                <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.04) 48%, rgba(212,175,55,0.08) 50%, transparent 55%)', animation: 'tarot-sweep 6s ease-in-out infinite' }} />
                            </div>
                        </div>
                    </div>

                    {/* 哥特分割线 */}
                    <GothicDivider iconUrl={DECOR.triangleBorder} iconSize="w-16" className="mx-5" />

                    {/* 4-Option Menu — 哥特风卡片 */}
                    <div className="flex-1 px-5 pb-6 z-30 flex flex-col gap-2.5 overflow-y-auto no-scrollbar">
                        {menuItems.map((item, idx) => (
                            <button
                                key={item.key}
                                onClick={() => dispatch({ type: 'SET_VIEW', view: item.key })}
                                className="group relative w-full rounded-2xl border border-[#d4af37]/15 bg-black/25 backdrop-blur-md py-4 px-5 flex items-center gap-4 active:scale-[0.97] transition-all duration-500 hover:bg-[#d4af37]/[0.08] hover:border-[#d4af37]/35 hover:shadow-[0_0_20px_rgba(212,175,55,0.1)] overflow-hidden shrink-0"
                                style={{ animation: `gothic-fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both`, animationDelay: `${idx * 100}ms` }}
                            >
                                {/* 左侧装饰图标 */}
                                <img
                                    src={item.icon}
                                    className="w-9 h-9 object-contain shrink-0"
                                    style={{ filter: 'drop-shadow(0 0 8px rgba(212,175,55,0.4))', animation: 'gothic-glow-pulse 5s ease-in-out infinite', animationDelay: `${idx * 0.5}s` }}
                                    alt=""
                                />
                                {/* 分割竖线 */}
                                <div className="w-[1px] h-8 bg-gradient-to-b from-transparent via-[#d4af37]/25 to-transparent shrink-0" />
                                {/* 文字内容 */}
                                <div className="flex flex-col items-start gap-0.5 flex-1">
                                    <span className="text-[#e5d08f] text-lg tracking-[0.08em]" style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 10px rgba(212,175,55,0.3)' }}>{item.title}</span>
                                    <span className="text-[12px] text-[#d4af37]/50 tracking-[0.25em]">{item.sub}</span>
                                </div>
                                {/* 右侧指示箭头 */}
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-4 h-4 text-[#d4af37]/30 group-hover:text-[#d4af37]/60 transition-colors shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                                {/* 扫光 */}
                                <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                                    <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.05) 48%, rgba(212,175,55,0.1) 50%, transparent 55%)', animation: 'tarot-sweep 4s ease-in-out infinite' }} />
                                </div>
                                {/* 左侧金色竖条 */}
                                <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] rounded-full bg-gradient-to-b from-transparent via-[#d4af37]/30 to-transparent group-hover:via-[#d4af37]/60 transition-all duration-500" />
                            </button>
                        ))}
                    </div>

                    {/* 底部装饰：链式分割线 */}
                    <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center">
                        <img src={DECOR.chainDivider} className="w-24 h-auto object-contain opacity-20" style={{ filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.2))' }} alt="" />
                    </div>
                </>
            );
        }

        // ========== FEATURE PAGES ==========
        return (
            <div className="flex-1 flex flex-col relative z-30 overflow-hidden">
                <Suspense fallback={
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-[#d4af37]/30 border-t-[#d4af37] rounded-full animate-spin" />
                    </div>
                }>
                    {renderFeaturePage()}
                </Suspense>
            </div>
        );
    };

    // ========== UNIFIED RENDER ==========
    return (
        <div className="h-full w-full relative flex flex-col" style={{ background: '#060204', fontFamily: 'ZhaixinglouCN, serif' }}>
            <NoiseBackground />
            {showParticles && (
                <Suspense fallback={null}>
                    <LazyGoldenParticles paused={!!flippingCardId} />
                </Suspense>
            )}
            {renderContent()}
            <SecondaryApiSettingsModal
                isOpen={state.showApiSettings}
                onClose={() => dispatch({ type: 'TOGGLE_API_SETTINGS' })}
                config={state.secondaryApiConfig}
                presets={state.secondaryApiPresets}
                availableModels={state.secondaryAvailableModels}
                onUpdateConfig={c => dispatch({ type: 'SET_SECONDARY_API', config: c })}
                onAddPreset={p => dispatch({ type: 'ADD_SECONDARY_PRESET', preset: p })}
                onRemovePreset={id => dispatch({ type: 'REMOVE_SECONDARY_PRESET', id })}
                onSetModels={m => dispatch({ type: 'SET_SECONDARY_MODELS', models: m })}
                fontSettings={zhaixinglouFonts.settings}
                isFontLoading={zhaixinglouFonts.isLoading}
                onSetFontUrl={zhaixinglouFonts.setFontUrl}
                onSetFontFile={zhaixinglouFonts.setFontFile}
                onResetFont={zhaixinglouFonts.resetFont}
            />
        </div>
    );
};

export default ZhaixinglouApp;
