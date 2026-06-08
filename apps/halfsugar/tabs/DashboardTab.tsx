/**
 * DashboardTab — Today's overview with calorie ring, swipeable quotes,
 * macro nutrients (2×2), and horizontal summary row.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useHalfSugar } from '../HalfSugarContext';
import { CalorieRing } from '../components/CalorieRing';
import { getDailyNarration, getThemedSuggestion } from '../foodRecommendations';
import { MacroBar } from '../components/MacroBar';
import { formatDurationMinutes } from '../types';

// ── Date string for subtitle ──
function getDateString(): string {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${now.getMonth() + 1}月${now.getDate()}日 · 星期${weekdays[now.getDay()]}`;
}

// ── Swipeable Quotes ──
function getQuotes(): string[] {
    const narration = getDailyNarration();
    const themed = getThemedSuggestion();
    const quotes: string[] = [];
    if (narration) quotes.push(narration);
    if (themed && themed !== narration) quotes.push(themed);
    if (quotes.length < 2) {
        quotes.push('好好吃饭，好好生活 ✿');
    }
    return quotes;
}

const SwipeQuotes: React.FC = React.memo(() => {
    const quotes = getQuotes();
    const [activeIdx, setActiveIdx] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const startXRef = useRef(0);
    const isDraggingRef = useRef(false);

    const goTo = useCallback((idx: number) => {
        setActiveIdx(Math.max(0, Math.min(idx, quotes.length - 1)));
    }, [quotes.length]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        startXRef.current = e.touches[0].clientX;
        isDraggingRef.current = true;
    }, []);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        const diff = startXRef.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) {
            goTo(activeIdx + (diff > 0 ? 1 : -1));
        }
    }, [activeIdx, goTo]);

    // Auto-rotate every 6s
    useEffect(() => {
        if (quotes.length <= 1) return;
        const timer = setInterval(() => {
            setActiveIdx((prev) => (prev + 1) % quotes.length);
        }, 6000);
        return () => clearInterval(timer);
    }, [quotes.length]);

    return (
        <div className="hs-swipe-quotes hs-animate-fade-in">
            <div
                className="hs-swipe-track"
                ref={containerRef}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                <span className="hs-swipe-mark hs-swipe-mark-open">❝</span>
                <div className="hs-swipe-text">{quotes[activeIdx]}</div>
                <span className="hs-swipe-mark hs-swipe-mark-close">❞</span>
            </div>
            {quotes.length > 1 && (
                <div className="hs-swipe-dots">
                    {quotes.map((_, i) => (
                        <span
                            key={i}
                            className={`hs-swipe-dot ${i === activeIdx ? 'active' : ''}`}
                            onClick={() => goTo(i)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

const DashboardTab: React.FC = () => {
    const {
        activeCalorieTarget, caloriesConsumed, proteinConsumed, carbsConsumed, fatConsumed, fiberConsumed,
        nutrientTargets, recommendations, isMealsLoading, isTrackingLoading,
        latestWeight, todaySleep,
        todayExercises, todayExerciseCalories, setActiveTab,
    } = useHalfSugar();

    const totalExerciseMinutes = todayExercises.reduce((sum, e) => sum + e.durationMinutes, 0);
    const themedSuggestion = getThemedSuggestion();

    return (
        <div className="hs-tab-content no-scrollbar">
            {/* ── Date subtitle (below page header's "今日") ── */}
            <div className="hs-date-subtitle hs-animate-fade-in">
                <span>{getDateString()}</span>
            </div>

            <CalorieRing consumed={caloriesConsumed} exerciseBurned={todayExerciseCalories} target={activeCalorieTarget} />

            {/* ── Swipeable Quotes ── */}
            <SwipeQuotes />

            <div className="hs-macro-grid">
                <MacroBar label="蛋白" value={proteinConsumed} target={nutrientTargets.protein} color="var(--hs-sage)" />
                <MacroBar label="碳水" value={carbsConsumed} target={nutrientTargets.carbs} color="var(--hs-clay)" />
                <MacroBar label="脂肪" value={fatConsumed} target={nutrientTargets.fat} color="var(--hs-rose)" />
                <MacroBar label="膳食纤维" value={fiberConsumed} target={nutrientTargets.fiber} color="var(--hs-ocean)" />
            </div>

            {/* ── Quick-access summary row — horizontal ── */}
            <div className="hs-dash-row">
                <div className="hs-dash-row-card hs-animate-fade-in" onClick={() => setActiveTab('nutrition')} role="button" tabIndex={0}>
                    <span className="hs-dash-row-icon hs-emoji">🍽️</span>
                    <span className="hs-dash-row-label">饮食</span>
                    <span className="hs-dash-row-value">{isMealsLoading ? '…' : caloriesConsumed}</span>
                    <span className="hs-dash-row-unit">kcal</span>
                </div>
                <div className="hs-dash-row-card hs-animate-fade-in" onClick={() => setActiveTab('trends')} role="button" tabIndex={0}>
                    <span className="hs-dash-row-icon hs-emoji">⚖️</span>
                    <span className="hs-dash-row-label">体重</span>
                    <span className="hs-dash-row-value">{latestWeight ? latestWeight.weight : '—'}</span>
                    <span className="hs-dash-row-unit">{latestWeight ? 'kg' : ''}</span>
                </div>
                <div className="hs-dash-row-card hs-animate-fade-in" onClick={() => setActiveTab('activity')} role="button" tabIndex={0}>
                    <span className="hs-dash-row-icon hs-emoji">🔥</span>
                    <span className="hs-dash-row-label">运动</span>
                    <span className="hs-dash-row-value">{totalExerciseMinutes > 0 ? totalExerciseMinutes : '—'}</span>
                    <span className="hs-dash-row-unit">{totalExerciseMinutes > 0 ? 'min' : ''}</span>
                </div>
                <div className="hs-dash-row-card hs-animate-fade-in" onClick={() => setActiveTab('sleep')} role="button" tabIndex={0}>
                    <span className="hs-dash-row-icon hs-emoji">🌙</span>
                    <span className="hs-dash-row-label">睡眠</span>
                    <span className="hs-dash-row-value">{todaySleep ? formatDurationMinutes(todaySleep.durationMinutes) : '—'}</span>
                    <span className="hs-dash-row-unit"></span>
                </div>
            </div>

            {recommendations.length > 0 && (
                <div className="hs-recommendation-section hs-animate-fade-in">
                    <div className="hs-section-title">
                        <span>今日食谱灵感</span>
                        {themedSuggestion && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--hs-primary-dark)' }}>{themedSuggestion}</span>}
                    </div>
                    {recommendations.map((rec) => (
                        <div key={rec.nutrient} className="hs-recommendation-card">
                            <div className="hs-rec-header" style={{ color: 'var(--hs-text)' }}>今天可以来点补充 <span style={{ color: 'var(--hs-primary-dark)' }}>{rec.label}</span></div>
                            <div className="hs-rec-foods">
                                {rec.foods.slice(0, 3).map((food) => (
                                    <span key={food.name} className="hs-rec-food-chip">{food.name}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {(isMealsLoading || isTrackingLoading) && (
                <div className="hs-loading-card">正在同步今日记录…</div>
            )}
        </div>
    );
};

export default DashboardTab;
