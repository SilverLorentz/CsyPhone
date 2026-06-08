/**
 * StarMirror — 星镜 · Tarot Divination Screen
 *
 * Thin orchestrator that manages state and delegates rendering to:
 *   - SpreadSelector — spread selection (idle phase)
 *   - TarotSpreadBoard — card layout + oracle + actions (drawn phase)
 *   - HistoryDrawer — bottom drawer with position list
 *   - TarotReading — AI reading chat (post-reveal)
 */
import React,{ useState,useCallback,useMemo,useEffect } from 'react';
import {
  drawCards,
  CARD_BACK_USER,
  CARD_BACK_CHAR,
  SPREADS,
} from './tarotData';
import TarotReading,{ type TarotDrawnCard } from './TarotReading';
import { SecondaryAPIConfig } from './zhaixinglouStore';
import { CharacterProfile,UserProfile } from '../../types';
import { SelectedCard } from './zhaixinglouStore';
import { GothicHeader,GothicCornerDecor,DECOR } from './components/GothicDecorations';
import TarotSpreadBoard,{ type DrawnCardState } from './components/TarotSpreadBoard';
import SpreadSelector from './components/SpreadSelector';
import HistoryDrawer from './components/HistoryDrawer';

interface Props {
    onBack: () => void;
    isApiConfigured: boolean;
    onOpenSettings: () => void;
    isUser?: boolean;
    apiConfig: SecondaryAPIConfig;
    userName: string;
    userProfile: UserProfile;
    selectedCard: SelectedCard | null;
    characters: CharacterProfile[];
    cachedAstroData: Record<string, string>;
}

type Phase = 'idle' | 'drawn';

const StarMirror: React.FC<Props> = ({ onBack, isUser = true, isApiConfigured, onOpenSettings, apiConfig, userName, userProfile, selectedCard, characters, cachedAstroData }) => {
    const [phase, setPhase] = useState<Phase>('idle');
    const [drawnCards, setDrawnCards] = useState<DrawnCardState[]>([]);
    const [selectedSpreadId, setSelectedSpreadId] = useState<string>(isUser ? 'single' : 'three');
    const [showHistory, setShowHistory] = useState(false);
    const [activeOracleIndex, setActiveOracleIndex] = useState<number>(0);
    const [showReading, setShowReading] = useState(false);
    const [showAstroHint, setShowAstroHint] = useState(false);

    // Filter spreads by role (exclude ephemeris spreads)
    const availableSpreads = useMemo(
        () => SPREADS.filter(s => {
            if (s.ephemeris) return false;
            if (isUser) return !s.charOnly;
            return !s.userOnly;
        }),
        [isUser]
    );

    const currentSpread = useMemo(
        () => SPREADS.find(s => s.id === selectedSpreadId) ?? SPREADS[0],
        [selectedSpreadId]
    );

    const cardBackUrl = isUser ? CARD_BACK_USER : CARD_BACK_CHAR;

    // --- Draw cards ---
    const handleDraw = useCallback(() => {
        const results = drawCards(currentSpread.cardCount);
        setDrawnCards(results.map(r => ({ ...r, isFlipped: false })));
        setPhase('drawn');
        setShowHistory(false);
        setActiveOracleIndex(-1);
        setTimeout(() => setActiveOracleIndex(0), 1200);
    }, [currentSpread]);

    // --- Flip a specific card (only next in sequence) ---
    const handleFlip = useCallback((index: number) => {
        setDrawnCards(prev => {
            const nextIdx = prev.findIndex(c => !c.isFlipped);
            if (nextIdx !== index) return prev;
            return prev.map((c, i) => i === index ? { ...c, isFlipped: true } : c);
        });
        setActiveOracleIndex(-1);
        setTimeout(() => {
            setActiveOracleIndex(index + 1);
        }, 1800);
    }, []);

    // --- Reset ---
    const handleReset = useCallback(() => {
        setPhase('idle');
        setDrawnCards([]);
        setShowHistory(false);
        setActiveOracleIndex(0);
    }, []);

    const allFlipped = useMemo(
        () => drawnCards.length > 0 && drawnCards.every(c => c.isFlipped),
        [drawnCards]
    );

    const nextFlipIndex = useMemo(
        () => drawnCards.findIndex(c => !c.isFlipped),
        [drawnCards]
    );

    // ── Char profile for AI reading ──
    const charProfile = selectedCard?.type === 'character' && selectedCard?.characterId
        ? characters.find(c => c.id === selectedCard.characterId)
        : undefined;

    // ── Build drawn cards info for TarotReading ──
    const drawnCardInfos: TarotDrawnCard[] = useMemo(
        () => drawnCards.map((dc, i) => ({
            nameZh: dc.card.nameZh,
            nameEn: dc.card.nameEn,
            isReversed: dc.isReversed,
            positionLabel: currentSpread.positions[i]?.label || `第${i + 1}张`,
        })),
        [drawnCards, currentSpread]
    );

    // ── Cached astro text ──
    const astroText = useMemo(() => {
        if (isUser) return cachedAstroData['user'] || '';
        if (selectedCard?.characterId) return cachedAstroData[`char_${selectedCard.characterId}`] || '';
        return '';
    }, [isUser, selectedCard, cachedAstroData]);

    // ── Astro hint toast ──
    useEffect(() => {
        if (!astroText) {
            const showTimer = setTimeout(() => setShowAstroHint(true), 600);
            const hideTimer = setTimeout(() => setShowAstroHint(false), 5500);
            return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ══════════════ READING MODE ══════════════
    if (showReading) {
        return (
            <TarotReading
                onBack={() => setShowReading(false)}
                spreadId={currentSpread.id}
                spreadName={currentSpread.name}
                spreadNameEn={currentSpread.nameEn}
                drawnCards={drawnCardInfos}
                apiConfig={apiConfig}
                isApiConfigured={isApiConfigured}
                onOpenSettings={onOpenSettings}
                userName={userName}
                userBio={userProfile.bio || ''}
                isUser={isUser}
                charProfile={charProfile}
                characters={characters}
                selectedCardType={selectedCard?.type || 'user'}
                astroText={astroText}
            />
        );
    }

    // ══════════════ DRAWN: Card board ══════════════
    if (phase === 'drawn') {
        return (
            <>
                <TarotSpreadBoard
                    spread={currentSpread}
                    drawnCards={drawnCards}
                    cardBackUrl={cardBackUrl}
                    nextFlipIndex={nextFlipIndex}
                    allFlipped={allFlipped}
                    activeOracleIndex={activeOracleIndex}
                    onFlip={handleFlip}
                    onReset={handleReset}
                    onReadCards={() => setShowReading(true)}
                    onBack={handleReset}
                    headerDecorIcon={DECOR.justice}
                    headerTitle="Star Mirror"
                />

                {/* History drawer toggle in header — overlay */}
                <div className="absolute top-0 right-0 pt-12 pr-5 z-[60]">
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={`p-2 -mr-1 rounded-full active:scale-90 transition-all border backdrop-blur-md ${showHistory
                            ? 'bg-[#d4af37]/20 border-[#d4af37]/50 text-[#e5d08f]'
                            : 'hover:bg-white/10 text-[#d4af37] border-[#d4af37]/30 bg-black/30'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                </div>

                {/* History Drawer */}
                <HistoryDrawer
                    show={showHistory}
                    onClose={() => setShowHistory(false)}
                    spread={currentSpread}
                    drawnCards={drawnCards}
                />
            </>
        );
    }

    // ══════════════ IDLE: Spread selection ══════════════
    return (
        <div className="flex-1 flex flex-col overflow-hidden relative">
            <GothicCornerDecor corners={['tl', 'tr']} iconUrl={DECOR.occultSymbol} size={24} opacity={0.18} />
            <GothicHeader
                title="Star Mirror"
                onBack={onBack}
                decorIcon={DECOR.justice}
                rightAction={<div className="w-9" />}
            />

            <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto overflow-x-hidden relative">
                <SpreadSelector
                    spreads={availableSpreads}
                    selectedSpreadId={selectedSpreadId}
                    onSelectSpread={setSelectedSpreadId}
                    onDraw={handleDraw}
                />
            </div>

            {/* ═══════════════ ASTRO HINT TOAST ═══════════════ */}
            {showAstroHint && (
                <div
                    className="absolute top-20 left-1/2 -translate-x-1/2 z-[60]"
                    style={{ animation: 'oracle-fade-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both' }}
                >
                    <div className="bg-black/80 backdrop-blur-xl rounded-xl border border-[#d4af37]/30 px-5 py-3.5 max-w-[300px] shadow-[0_0_30px_rgba(0,0,0,0.5)] flex items-center gap-3">
                        <img src={DECOR.moonPhases} className="w-7 h-7 object-contain shrink-0" style={{ filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.4))', animation: 'gothic-glow-pulse 4s ease-in-out infinite' }} alt="" />
                        <p className="text-[#e5d08f]/80 text-[11px] leading-relaxed">
                            若先在<span className="text-[#d4af37] font-bold">星轨</span>中推算星盘，
                            大祭司将融合星象进行更深度的解读
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StarMirror;
