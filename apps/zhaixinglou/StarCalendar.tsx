/**
 * StarCalendar — 星历：实时宇宙天气仪表盘 + 天象触发塔罗
 *
 * Thin orchestrator that manages state and delegates rendering to:
 *   - MoonPhaseHero — immersive moon phase display
 *   - CelestialDashboard — planets, phenomena, spreads, talisman
 *   - TarotSpreadBoard — card layout + oracle (shared with StarMirror)
 *   - TarotReading — AI reading chat (post-reveal)
 */
import React,{ useMemo,useState,useCallback } from 'react';
import { calcCelestialEvents,formatEphemerisForPrompt } from './astroCalc';
import type { CelestialEvents,TransitHit } from './astroCalc';
import { SPREADS,drawCards,CARD_BACK_USER } from './tarotData';
import type { SpreadDef } from './tarotData';
import { buildEphemerisReadingPrompt } from './divinationPrompts';
import type { DrawnCardInfo } from './divinationPrompts';
import type { SecondaryAPIConfig,SelectedCard } from './zhaixinglouStore';
import TarotReading,{ type TarotDrawnCard } from './TarotReading';
import { GothicHeader,GothicDivider,GothicCornerDecor,DECOR } from './components/GothicDecorations';
import TarotSpreadBoard,{ type DrawnCardState } from './components/TarotSpreadBoard';
import MoonPhaseHero from './components/MoonPhaseHero';
import CelestialDashboard from './components/CelestialDashboard';

// ─── Props ───
interface Props {
    onBack: () => void;
    isApiConfigured: boolean;
    onOpenSettings: () => void;
    apiConfig: SecondaryAPIConfig;
    userName: string;
    userBio?: string;
    cachedAstroData: Record<string, string>;
    selectedCard?: SelectedCard | null;
}

// ─── Trigger logic ───
function getTriggeredSpreadIds(events: CelestialEvents): string[] {
    const triggered: string[] = [];
    triggered.push('seven-stars');
    if (events.moonPhase.angle <= 36 || events.moonPhase.angle >= 324) triggered.push('new-moon');
    if (events.moonPhase.angle >= 160 && events.moonPhase.angle <= 200) triggered.push('full-moon');
    if (events.retrograding.some(r => r.planet === '水星')) triggered.push('mercury-retrograde');
    if (events.ingresses.some(i => i.planet === '金星')) triggered.push('venus-ingress');
    if (events.ingresses.some(i => i.planet === '火星')) triggered.push('mars-ingress');
    if (events.oppositions.length > 0) triggered.push('planet-opposition');
    return triggered;
}

const StarCalendar: React.FC<Props> = ({
    onBack, isApiConfigured, onOpenSettings,
    apiConfig, userName, userBio, cachedAstroData, selectedCard,
}) => {
    // ── Char vs User mode ──
    const isCharMode = selectedCard?.type === 'character';
    const charName = selectedCard?.name || '角色';
    const now = useMemo(() => new Date(), []);
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

    // ── Compute celestial events ──
    const events = useMemo(() => calcCelestialEvents(now), [now]);
    const ephemerisText = useMemo(() => formatEphemerisForPrompt(events, now), [events, now]);

    // ── Determine which spreads are triggered ──
    const triggeredIds = useMemo(() => getTriggeredSpreadIds(events), [events]);
    const triggeredSpreads = useMemo(() =>
        triggeredIds.map(id => SPREADS.find(s => s.id === id)).filter(Boolean) as SpreadDef[],
        [triggeredIds]);

    // ── Has natal chart? ──
    const hasNatalData = Object.keys(cachedAstroData).includes('user');

    // ── Transit hit (future: computed from cached birth data) ──
    const [transitHit] = useState<TransitHit | null>(null);

    // ── Spread reading state ──
    const [activeSpread, setActiveSpread] = useState<SpreadDef | null>(null);
    const [drawnCards, setDrawnCards] = useState<DrawnCardState[]>([]);
    const [activeOracleIndex, setActiveOracleIndex] = useState<number>(0);
    const [showReading, setShowReading] = useState(false);

    // ── Derived states ──
    const allFlipped = useMemo(
        () => drawnCards.length > 0 && drawnCards.every(c => c.isFlipped),
        [drawnCards]
    );
    const nextFlipIndex = useMemo(
        () => drawnCards.findIndex(c => !c.isFlipped),
        [drawnCards]
    );

    // ── Start a spread ──
    const handleStartSpread = useCallback((spread: SpreadDef) => {
        if (!isApiConfigured) { onOpenSettings(); return; }
        const cards = drawCards(spread.cardCount);
        setActiveSpread(spread);
        setDrawnCards(cards.map(r => ({ ...r, isFlipped: false })));
        setShowReading(false);
        setActiveOracleIndex(-1);
        setTimeout(() => setActiveOracleIndex(0), 1200);
    }, [isApiConfigured, onOpenSettings]);

    // ── Flip a card (sequential) ──
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

    // ── Reset spread ──
    const handleResetSpread = useCallback(() => {
        setActiveSpread(null);
        setDrawnCards([]);
        setShowReading(false);
        setActiveOracleIndex(0);
    }, []);

    // ── Build ephemeris system prompt for TarotReading ──
    const ephemerisSystemPrompt = useMemo(() => {
        if (!activeSpread) return '';
        const cardInfos: DrawnCardInfo[] = drawnCards.map((c, i) => ({
            nameZh: c.card.nameZh,
            nameEn: c.card.nameEn,
            isReversed: c.isReversed,
            positionLabel: activeSpread.positions[i]?.label || `位置${i + 1}`,
        }));

        const ingressInfo = activeSpread.id === 'venus-ingress'
            ? events.ingresses.find(i => i.planet === '金星')
            : activeSpread.id === 'mars-ingress'
                ? events.ingresses.find(i => i.planet === '火星')
                : undefined;
        const oppositionInfo = activeSpread.id === 'planet-opposition' && events.oppositions[0]
            ? events.oppositions[0]
            : undefined;

        const astroData = cachedAstroData['user'] || undefined;

        return buildEphemerisReadingPrompt({
            spreadId: activeSpread.id,
            cards: cardInfos,
            userName,
            userBio,
            astroData,
            ephemerisData: ephemerisText,
            transitHit,
            ingressInfo,
            oppositionInfo,
        });
    }, [activeSpread, drawnCards, events, ephemerisText, transitHit, userName, userBio, cachedAstroData]);

    // ── Build drawn cards info for TarotReading component ──
    const drawnCardInfos: TarotDrawnCard[] = useMemo(
        () => drawnCards.map((dc, i) => ({
            nameZh: dc.card.nameZh,
            nameEn: dc.card.nameEn,
            isReversed: dc.isReversed,
            positionLabel: activeSpread?.positions[i]?.label || `位置${i + 1}`,
        })),
        [drawnCards, activeSpread]
    );

    // ═══════════════════════════════════════
    // ─── READING CHAT VIEW ───
    // ═══════════════════════════════════════
    if (showReading && activeSpread) {
        return (
            <TarotReading
                onBack={() => setShowReading(false)}
                spreadId={activeSpread.id}
                spreadName={activeSpread.name}
                spreadNameEn={activeSpread.nameEn}
                drawnCards={drawnCardInfos}
                apiConfig={apiConfig}
                isApiConfigured={isApiConfigured}
                onOpenSettings={onOpenSettings}
                userName={userName}
                userBio={userBio || ''}
                isUser={true}
                characters={[]}
                selectedCardType='user'
                astroText={cachedAstroData['user'] || ''}
                systemPromptOverride={ephemerisSystemPrompt}
            />
        );
    }

    // ═══════════════════════════════════════
    // ─── SPREAD VIEW (TarotSpreadBoard) ───
    // ═══════════════════════════════════════
    if (activeSpread) {
        return (
            <TarotSpreadBoard
                spread={activeSpread}
                drawnCards={drawnCards}
                cardBackUrl={CARD_BACK_USER}
                nextFlipIndex={nextFlipIndex}
                allFlipped={allFlipped}
                activeOracleIndex={activeOracleIndex}
                onFlip={handleFlip}
                onReset={handleResetSpread}
                onReadCards={() => setShowReading(true)}
                onBack={handleResetSpread}
                headerDecorIcon={DECOR.moonPhases}
            />
        );
    }

    // ═══════════════════════════════════════
    // ─── MAIN DASHBOARD VIEW ───
    // ═══════════════════════════════════════
    return (
        <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* 角标装饰 */}
            <GothicCornerDecor corners={['tl', 'tr']} iconUrl={DECOR.occultSymbol} size={24} opacity={0.15} />
            {/* Header */}
            <GothicHeader
                title="Ephemeris"
                onBack={onBack}
                decorIcon={DECOR.moon}
            />

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                <MoonPhaseHero dateStr={dateStr} moonPhase={events.moonPhase} />
                <GothicDivider iconUrl={DECOR.chainDivider} iconSize="w-8" className="mb-2" />
                <CelestialDashboard
                    events={events}
                    triggeredSpreads={triggeredSpreads}
                    isCharMode={isCharMode}
                    charName={charName}
                    hasNatalData={hasNatalData}
                    transitHit={transitHit}
                    onStartSpread={handleStartSpread}
                    onBack={onBack}
                />
            </div>
        </div>
    );
};

export default StarCalendar;
