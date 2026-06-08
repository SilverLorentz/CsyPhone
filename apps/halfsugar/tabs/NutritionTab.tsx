/**
 * NutritionTab — Meal recording, AI identification, favorites, recommendations
 */
import React, { useMemo, useState } from 'react';
import { useHalfSugar } from '../HalfSugarContext';
import { MealRecordView } from '../components/MealRecordView';
import { getRecommendations } from '../foodRecommendations';
import { computeNutrientGaps, MEAL_TYPES, type MealRecord, type MealTypeDefinition } from '../types';

function formatMealTime(timestamp: number): string {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

const NutritionTab: React.FC = () => {
    const {
        todayDate, todayLabel, meals, isMealsLoading, mealsByType,
        handleSaveMeal, handleDeleteMeal, handleSaveFavoriteFood, handleUseFavoriteFood,
        handleDeleteFavoriteFood,
        topFavoriteFoods, apiConfig, addToast, nutrientTargets,
    } = useHalfSugar();

    const [activeMealIdx, setActiveMealIdx] = useState(0);
    const [recordingMealType, setRecordingMealType] = useState<MealTypeDefinition | null>(null);
    const [editingMeal, setEditingMeal] = useState<MealRecord | null>(null);

    const activeMealType = MEAL_TYPES[activeMealIdx];
    const activeRecords = mealsByType[activeMealType.key] || [];

    // Compute meal-type-aware recommendations
    const mealRecommendations = useMemo(
        () => getRecommendations(computeNutrientGaps(meals, nutrientTargets), activeMealType.key),
        [meals, nutrientTargets, activeMealType.key],
    );

    const handleOpenMealRecord = (mealType: MealTypeDefinition, meal: MealRecord | null = null) => {
        setRecordingMealType(mealType);
        setEditingMeal(meal);
    };

    if (recordingMealType) {
        return (
            <MealRecordView
                currentDate={todayDate}
                mealType={recordingMealType}
                initialMeal={editingMeal}
                apiConfig={apiConfig}
                addToast={addToast}
                favorites={topFavoriteFoods}
                onBack={() => { setEditingMeal(null); setRecordingMealType(null); }}
                onDelete={handleDeleteMeal}
                onDeleteFavorite={handleDeleteFavoriteFood}
                onSaveFavorite={handleSaveFavoriteFood}
                onSave={handleSaveMeal}
                onUseFavorite={handleUseFavoriteFood}
            />
        );
    }

    return (
        <div className="hs-tab-content no-scrollbar">
            <div className="hs-section-title">
                <span>{todayLabel}</span>
                <span>{isMealsLoading ? '同步中…' : '今日饮食'}</span>
            </div>

            {isMealsLoading && meals.length === 0 && <div className="hs-loading-card">正在同步今日记录…</div>}

            {/* Horizontal meal type switcher */}
            <div className="hs-meal-type-switcher">
                {MEAL_TYPES.map((mealType, idx) => {
                    const count = (mealsByType[mealType.key] || []).length;
                    return (
                        <button
                            key={mealType.key}
                            type="button"
                            className={`hs-meal-type-chip ${activeMealIdx === idx ? 'active' : ''}`}
                            onClick={() => setActiveMealIdx(idx)}
                        >
                            <span className="hs-emoji">{mealType.icon}</span>
                            {mealType.label}
                            {count > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>({count})</span>}
                        </button>
                    );
                })}
            </div>

            {/* Selected meal type's records */}
            <section className="hs-meal-group hs-animate-fade-in" style={{ marginTop: 4 }}>
                <div className="hs-meal-group-title">
                    <span>{activeMealType.label}</span>
                    {activeRecords.length > 0 && <button type="button" className="hs-inline-add" onClick={() => handleOpenMealRecord(activeMealType)}>再记一份</button>}
                </div>
                {activeRecords.length === 0 ? (
                    <button type="button" className="hs-meal-add" onClick={() => handleOpenMealRecord(activeMealType)}><span>＋</span> 记录{activeMealType.label}</button>
                ) : (
                    activeRecords.map((meal) => (
                        <button key={meal.id} type="button" className="hs-meal-card hs-meal-record-card" onClick={() => handleOpenMealRecord(activeMealType, meal)}>
                            <div className="hs-meal-icon" style={{ background: activeMealType.bg, color: activeMealType.color }}><span className="hs-emoji">{activeMealType.icon}</span></div>
                            <div className="hs-meal-info">
                                <div className="hs-meal-type">{meal.customLabel || activeMealType.label}</div>
                                <div className="hs-meal-desc">{formatMealTime(meal.createdAt) || '刚刚'} · {meal.foods.length > 0 ? meal.foods.map((f) => f.name).join('、') : '未填写食物'}</div>
                            </div>
                            <div className="hs-meal-cal">{meal.totalCalories}<span className="hs-meal-cal-unit"> kcal</span></div>
                        </button>
                    ))
                )}
            </section>

            {mealRecommendations.length > 0 && (
                <div className="hs-recommendation-section hs-animate-fade-in" style={{ marginTop: 8 }}>
                    <div className="hs-section-title">食谱灵感</div>
                    {mealRecommendations.map((rec) => (
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
        </div>
    );
};

export default NutritionTab;
