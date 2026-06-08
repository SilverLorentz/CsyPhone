/**
 * HalfSugarContext — Shared state provider for the Half Sugar multi-tab app.
 * Extracted from the monolithic HalfSugarApp component.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { deleteMeal, fetchMeals, saveMeal } from './halfsugarApi';
import {
    deleteFavorite,
    deleteSummary,
    fetchFavorites,
    fetchSummaries,
    generateSummary,
    incrementFavoriteUse,
    saveFavorite,
} from './halfsugarSummaryApi';
import {
    deleteExercise,
    deleteSleep,
    deleteWeight,
    fetchExercises,
    fetchGoals,
    fetchSleep,
    fetchWeightRecords,
    saveExercise,
    saveGoal,
    saveSleep,
    saveWeight,
} from './halfsugarTrackingApi';
import { getRecommendations } from './foodRecommendations';
import { buildGoalFormState, type GoalFormState } from './HalfSugarTrackingUI';
import {
    buildHealthProfileFromUserProfile,
    computeBMI,
    computeCalorieTarget,
    computeNutrientGaps,
    computeSleepDurationMinutes,
    estimateCaloriesBurned,
    type FavoriteFood,
    formatLocalDateKey,
    type FoodItem,
    type ExerciseRecord,
    type HealthGoal,
    type HealthProfile,
    type HealthAwareUserProfile,
    getCurrentISOWeekKey,
    getCurrentMonthKey,
    computeGuidelineNutrients,

    type HealthSummary,
    MEAL_TYPES,
    MET_TABLE,
    type MealRecord,
    type MealTypeDefinition,
    type SleepQuality,
    type SummaryPeriodType,
    type SleepRecord,
    sortMealsByCreatedAtDesc,
    sortWeightRecordsByLatest,
    type WeightRecord,
    type WeightTimeOfDay,
} from './types';

// ── Helper Functions ──

export function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message.trim();
    }
    return fallback;
}

export function parsePositiveNumber(value: string): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function buildTrackingId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shiftDateKey(dateKey: string, days: number): string {
    const nextDate = new Date(`${dateKey}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + days);
    return formatLocalDateKey(nextDate);
}

export function getGoalValue(goals: HealthGoal[], goalType: HealthGoal['goalType']): number | undefined {
    return goals.find((goal) => goal.goalType === goalType)?.targetValue;
}

function sortSummariesByLatest(items: HealthSummary[]): HealthSummary[] {
    return [...items].sort((left, right) => {
        if (right.endDate !== left.endDate) return right.endDate.localeCompare(left.endDate);
        if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
        return right.createdAt - left.createdAt;
    });
}

export function sortFavoritesByUsage(items: FavoriteFood[]): FavoriteFood[] {
    return [...items].sort((left, right) => {
        if (right.useCount !== left.useCount) return right.useCount - left.useCount;
        if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
        return right.createdAt - left.createdAt;
    });
}

export function normalizeFavoriteName(name: string): string {
    return name.trim().toLocaleLowerCase('zh-CN');
}

export function buildFavoriteFoodFromItem(food: FoodItem, existing?: FavoriteFood): FavoriteFood {
    const now = Date.now();
    return {
        id: existing?.id || `favorite-${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: food.name.trim(),
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        portion: food.portion,
        useCount: existing?.useCount || 0,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
    };
}

export function buildWeightDelta(currentWeight: number, targetWeight: number): { text: string; tone: string } {
    const delta = Math.round((currentWeight - targetWeight) * 10) / 10;
    const absDelta = Math.abs(delta).toFixed(1);
    if (delta > 0) return { text: `距目标还差 ${absDelta} kg`, tone: 'positive' };
    if (delta < 0) return { text: `比目标轻 ${absDelta} kg`, tone: 'negative' };
    return { text: '已达到目标体重', tone: 'negative' };
}

export function formatSummaryStatValue(value?: number, unit = ''): string {
    if (value === undefined || value === null || Number.isNaN(value)) return '—';
    return `${Math.round(value)}${unit}`;
}

const GOAL_TYPE_MAP: Record<keyof GoalFormState, HealthGoal['goalType']> = {
    weightTarget: 'weight_target',
    dailyCalories: 'daily_calories',
    dailyProtein: 'daily_protein',
    dailyCarbs: 'daily_carbs',
    dailyFat: 'daily_fat',
    dailyFiber: 'daily_fiber',
};

export function buildGoalRecords(goalForm: GoalFormState, existingGoals: HealthGoal[]): HealthGoal[] {
    const now = Date.now();
    return (Object.keys(GOAL_TYPE_MAP) as Array<keyof GoalFormState>)
        .map((fieldKey) => {
            const targetValue = parsePositiveNumber(goalForm[fieldKey]);
            if (!targetValue) return null;
            const goalType = GOAL_TYPE_MAP[fieldKey];
            const existingGoal = existingGoals.find((goal) => goal.goalType === goalType);
            return {
                id: existingGoal?.id || buildTrackingId(`goal-${goalType}`),
                goalType,
                targetValue,
                createdAt: existingGoal?.createdAt || now,
                updatedAt: now,
            } satisfies HealthGoal;
        })
        .filter((goal): goal is HealthGoal => Boolean(goal));
}

// ── Tab Types ──

export type TabID = 'dashboard' | 'nutrition' | 'activity' | 'sleep' | 'lunar_tides' | 'trends' | 'profile';

// ── Context Shape ──

export interface HalfSugarContextValue {
    // OS hooks
    addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    apiConfig: { baseUrl: string; apiKey: string; model: string };
    closeApp: () => void;
    userProfile: ReturnType<typeof useOS>['userProfile'];
    updateUserProfile: ReturnType<typeof useOS>['updateUserProfile'];
    activeCharacterId: string | null;
    activeCharacter: ReturnType<typeof useOS>['characters'][0] | null;

    // Health profile
    healthProfile: HealthProfile;
    isHealthSetup: boolean;
    onboardingGoalState: GoalFormState;
    isSettingsSaving: boolean;
    handleOnboardingComplete: (data: { profile: HealthProfile; goals: GoalFormState; shareBodyInfo: boolean }) => Promise<void>;

    // Dates
    todayDate: string;
    todayLabel: string;

    // Meals
    meals: MealRecord[];
    isMealsLoading: boolean;
    mealsByType: Record<MealTypeDefinition['key'], MealRecord[]>;
    caloriesConsumed: number;
    proteinConsumed: number;
    carbsConsumed: number;
    fatConsumed: number;
    fiberConsumed: number;
    handleSaveMeal: (meal: MealRecord) => Promise<boolean>;
    handleDeleteMeal: (mealId: string) => Promise<boolean>;

    // Favorites
    favorites: FavoriteFood[];
    topFavoriteFoods: FavoriteFood[];
    handleSaveFavoriteFood: (food: FoodItem) => Promise<void>;
    handleDeleteFavoriteFood: (favoriteId: string) => Promise<void>;
    handleUseFavoriteFood: (favoriteId: string) => Promise<void>;

    // Nutrition targets
    activeCalorieTarget: number;
    nutrientTargets: { protein: number; carbs: number; fat: number; fiber: number };
    recommendations: ReturnType<typeof getRecommendations>;

    // Weight
    weightRecords: WeightRecord[];
    latestWeight: WeightRecord | null;
    latestBmi: number | null;
    weightTarget: number | undefined;
    weightDelta: { text: string; tone: string } | null;
    latestKnownWeightKg: number;
    handleSaveWeight: (timeOfDay: WeightTimeOfDay, value: string) => Promise<boolean>;
    handleDeleteWeight: (recordId: string) => Promise<boolean>;

    // Exercise
    todayExercises: ExerciseRecord[];
    todayExerciseCalories: number;
    handleSaveExercise: (exerciseType: string, durationMinutes: number) => Promise<boolean>;
    handleDeleteExercise: (exerciseId: string) => Promise<void>;

    // Sleep
    todaySleep: SleepRecord | null;
    handleSaveSleep: (sleepTime: string, wakeTime: string, quality: SleepQuality) => Promise<boolean>;
    handleDeleteSleep: () => Promise<boolean>;

    // Goals
    goals: HealthGoal[];

    // Summaries
    summaries: HealthSummary[];
    latestSummary: HealthSummary | null;
    isGeneratingSummary: boolean;
    isSummaryListLoading: boolean;
    handleGenerateWeeklySummary: () => Promise<void>;
    handleGenerateMonthlySummary: () => Promise<void>;
    handleDeleteSummary: (summaryId: string) => Promise<void>;
    handleOpenSummaries: () => Promise<void>;

    // Loading
    isTrackingLoading: boolean;

    // Tab navigation
    activeTab: TabID;
    setActiveTab: (tab: TabID) => void;
}

const HalfSugarContext = createContext<HalfSugarContextValue | null>(null);

export function useHalfSugar(): HalfSugarContextValue {
    const ctx = useContext(HalfSugarContext);
    if (!ctx) throw new Error('useHalfSugar must be inside HalfSugarProvider');
    return ctx;
}

// ── Provider ──

export const HalfSugarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        activeCharacterId,
        addToast,
        apiConfig,
        characters,
        closeApp,
        updateUserProfile,
        userProfile: rawUserProfile,
    } = useOS();

    // Cast to HealthAwareUserProfile for health field access
    const userProfile = rawUserProfile as HealthAwareUserProfile;

    const todayDate = useMemo(() => formatLocalDateKey(new Date()), []);
    const todayLabel = useMemo(() => new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }), []);

    const [activeTab, setActiveTab] = useState<TabID>('dashboard');
    const [healthProfile, setHealthProfile] = useState<HealthProfile>(() => buildHealthProfileFromUserProfile(userProfile));
    const [meals, setMeals] = useState<MealRecord[]>([]);
    const [isMealsLoading, setIsMealsLoading] = useState(false);
    const [isTrackingLoading, setIsTrackingLoading] = useState(false);
    const [isSettingsSaving, setIsSettingsSaving] = useState(false);
    const [weightRecords, setWeightRecords] = useState<WeightRecord[]>([]);
    const [todayExercises, setTodayExercises] = useState<ExerciseRecord[]>([]);
    const [todaySleep, setTodaySleep] = useState<SleepRecord | null>(null);
    const [goals, setGoals] = useState<HealthGoal[]>([]);
    const [summaries, setSummaries] = useState<HealthSummary[]>([]);
    const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
    const [isSummaryListLoading, setIsSummaryListLoading] = useState(false);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const mealsRef = useRef<MealRecord[]>([]);

    useEffect(() => { mealsRef.current = meals; }, [meals]);

    useEffect(() => {
        setHealthProfile(buildHealthProfileFromUserProfile(userProfile));
    }, [userProfile.healthBirthYear, userProfile.healthGender, userProfile.healthHeight, userProfile.healthSetupDone, userProfile.healthWeight]);

    const isHealthSetup = healthProfile.isSetup;
    const activeCharacter = useMemo(
        () => characters.find((c) => c.id === activeCharacterId) || null,
        [activeCharacterId, characters],
    );
    const onboardingGoalState = useMemo(() => buildGoalFormState(healthProfile, goals), [goals, healthProfile]);

    // ── Data Loading ──

    useEffect(() => {
        if (!isHealthSetup) { setMeals([]); return; }
        let active = true;
        setIsMealsLoading(true);
        void fetchMeals(todayDate)
            .then((records) => { if (active) setMeals(sortMealsByCreatedAtDesc(records)); })
            .catch((error) => { if (active) addToast(`加载餐食失败：${getErrorMessage(error, '请稍后重试')}`, 'error'); })
            .finally(() => { if (active) setIsMealsLoading(false); });
        return () => { active = false; };
    }, [addToast, isHealthSetup, todayDate]);

    useEffect(() => {
        if (!isHealthSetup) { setWeightRecords([]); setTodayExercises([]); setTodaySleep(null); setGoals([]); return; }
        let active = true;
        setIsTrackingLoading(true);
        const thirtyDaysAgo = shiftDateKey(todayDate, -29);
        void Promise.allSettled([fetchWeightRecords(thirtyDaysAgo, todayDate), fetchExercises(todayDate), fetchSleep(todayDate), fetchGoals()])
            .then((results) => {
                if (!active) return;
                const [wr, er, sr, gr] = results;
                const failed: string[] = [];
                if (wr.status === 'fulfilled') setWeightRecords(wr.value); else failed.push('体重');
                if (er.status === 'fulfilled') setTodayExercises(er.value); else failed.push('运动');
                if (sr.status === 'fulfilled') setTodaySleep(sr.value); else failed.push('睡眠');
                if (gr.status === 'fulfilled') setGoals(gr.value); else failed.push('目标');
                if (failed.length > 0) addToast(`加载追踪数据失败：${failed.join('、')}`, 'error');
            })
            .finally(() => { if (active) setIsTrackingLoading(false); });
        return () => { active = false; };
    }, [addToast, isHealthSetup, todayDate]);

    useEffect(() => {
        if (!isHealthSetup) { setSummaries([]); setFavorites([]); return; }
        let active = true;
        void Promise.allSettled([fetchSummaries('weekly', 5), fetchFavorites()])
            .then((results) => {
                if (!active) return;
                const [sr, fr] = results;
                if (sr.status === 'fulfilled') setSummaries(sortSummariesByLatest(sr.value));
                if (fr.status === 'fulfilled') setFavorites(sortFavoritesByUsage(fr.value));
            });
        return () => { active = false; };
    }, [addToast, isHealthSetup]);

    // ── Derived Values ──

    const calorieTarget = useMemo(() => computeCalorieTarget(userProfile), [userProfile.healthBirthYear, userProfile.healthGender, userProfile.healthHeight, userProfile.healthWeight, userProfile.healthActivityLevel]);
    const activeCalorieTarget = useMemo(() => getGoalValue(goals, 'daily_calories') || calorieTarget, [calorieTarget, goals]);
    
    const nutrientTargets = useMemo(() => {
        const minimums = computeGuidelineNutrients(healthProfile.gender as any, activeCalorieTarget);
        return {
            protein: Math.max(getGoalValue(goals, 'daily_protein') || minimums.protein, minimums.protein),
            carbs: Math.max(getGoalValue(goals, 'daily_carbs') || minimums.carbs, minimums.carbs),
            fat: Math.max(getGoalValue(goals, 'daily_fat') || minimums.fat, minimums.fat),
            fiber: Math.max(getGoalValue(goals, 'daily_fiber') || minimums.fiber, minimums.fiber),
        };
    }, [activeCalorieTarget, goals, healthProfile.gender]);

    const caloriesConsumed = useMemo(() => meals.reduce((s, m) => s + m.totalCalories, 0), [meals]);
    const proteinConsumed = useMemo(() => meals.reduce((s, m) => s + m.totalProtein, 0), [meals]);
    const carbsConsumed = useMemo(() => meals.reduce((s, m) => s + m.totalCarbs, 0), [meals]);
    const fatConsumed = useMemo(() => meals.reduce((s, m) => s + m.totalFat, 0), [meals]);
    const fiberConsumed = useMemo(() => meals.reduce((s, m) => s + m.foods.reduce((fs, f) => fs + (Number(f.fiber) || 0), 0), 0), [meals]);
    const recommendations = useMemo(() => getRecommendations(computeNutrientGaps(meals, nutrientTargets)), [meals, nutrientTargets]);
    const sortedWeightRecords = useMemo(() => sortWeightRecordsByLatest(weightRecords), [weightRecords]);
    const latestWeight = sortedWeightRecords[0] || null;
    const heightCm = userProfile.healthHeight || parsePositiveNumber(healthProfile.height) || undefined;
    const latestBmi = latestWeight && heightCm ? computeBMI(latestWeight.weight, heightCm) : null;
    const weightTargetVal = getGoalValue(goals, 'weight_target');
    const weightDelta = latestWeight && weightTargetVal ? buildWeightDelta(latestWeight.weight, weightTargetVal) : null;
    const todayExerciseCalories = useMemo(() => Math.round(todayExercises.reduce((s, r) => s + r.caloriesBurned, 0)), [todayExercises]);
    const latestKnownWeightKg = latestWeight?.weight || userProfile.healthWeight || parsePositiveNumber(healthProfile.weight) || 60;
    const latestSummary = useMemo(() => sortSummariesByLatest(summaries)[0] || null, [summaries]);
    const topFavoriteFoods = useMemo(() => sortFavoritesByUsage(favorites).slice(0, 5), [favorites]);
    const mealsByType = useMemo(
        () => Object.fromEntries(MEAL_TYPES.map((mt) => [mt.key, sortMealsByCreatedAtDesc(meals.filter((m) => m.type === mt.key))])) as Record<MealTypeDefinition['key'], MealRecord[]>,
        [meals],
    );

    // ── Callbacks ──

    /**
     * 当半糖分享开关打开时，向聊天历史注入一条隐形 health_signal 消息。
     * AI 可以在 buildMessageHistory 中看到，但 Chat UI 会过滤掉。
     */
    const injectHealthSignal = useCallback(async (signalText: string) => {
        const shareEnabled = (userProfile as any).healthShareBodyInfo === true;
        if (!shareEnabled || !activeCharacterId) return;
        try {
            const { DB } = await import('../../utils/db');
            await DB.saveMessage({
                charId: activeCharacterId,
                role: 'system',
                type: 'health_signal' as any,
                content: signalText,
            });
        } catch (e) {
            console.warn('[HalfSugar] Health signal injection failed:', e);
        }
    }, [activeCharacterId, userProfile]);

    const handleOnboardingComplete = useCallback(async ({ profile, goals: nextGoalForm, shareBodyInfo }: { profile: HealthProfile; goals: GoalFormState; shareBodyInfo: boolean }) => {
        const nextGoals = buildGoalRecords(nextGoalForm, goals);
        const wasSetup = isHealthSetup;
        setIsSettingsSaving(true);
        updateUserProfile({
            healthGender: profile.gender as 'male' | 'female',
            healthHeight: parseFloat(profile.height),
            healthWeight: parseFloat(profile.weight),
            healthBirthYear: parseInt(profile.birthYear, 10),
            healthSetupDone: true,
            healthShareBodyInfo: shareBodyInfo,
            healthActivityLevel: profile.activityLevel,
        } as any);
        setHealthProfile({ ...profile, isSetup: true });
        try {
            const savedGoals = await Promise.all(nextGoals.map((g) => saveGoal(g)));
            setGoals(savedGoals);
            addToast(wasSetup ? '基础资料与目标已保存' : '基础信息与目标已保存', 'success');
        } catch (error) {
            addToast(`基础信息已保存，目标同步失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
        } finally {
            setIsSettingsSaving(false);
            setActiveTab('dashboard');
        }
    }, [addToast, goals, isHealthSetup, updateUserProfile]);

    const handleSaveMeal = useCallback(async (meal: MealRecord) => {
        const prev = mealsRef.current;
        const opt = sortMealsByCreatedAtDesc([meal, ...prev.filter((e) => e.id !== meal.id)]);
        mealsRef.current = opt; setMeals(opt);
        try {
            const persisted = await saveMeal(meal);
            const next = sortMealsByCreatedAtDesc([persisted, ...mealsRef.current.filter((e) => e.id !== persisted.id)]);
            mealsRef.current = next; setMeals(next);
            addToast('餐食已保存', 'success');
            const mealLabel = MEAL_TYPES.find(mt => mt.key === meal.type)?.label || '餐食';
            const foodNames = meal.foods.map(f => f.name).join('、');
            void injectHealthSignal(
                `[生活感知] TA${mealLabel}吃了${foodNames}（你自然地注意到了，但不需要报数字，像关心TA的人一样自然回应就好）`
            );
            return true;
        } catch (error) {
            mealsRef.current = prev; setMeals(prev);
            addToast(`保存失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
            return false;
        }
    }, [addToast, injectHealthSignal]);

    const handleDeleteMeal = useCallback(async (mealId: string) => {
        const prev = mealsRef.current;
        const opt = prev.filter((m) => m.id !== mealId);
        mealsRef.current = opt; setMeals(opt);
        try {
            await deleteMeal(mealId);
            addToast('餐食已删除', 'success');
            return true;
        } catch (error) {
            mealsRef.current = prev; setMeals(prev);
            addToast(`删除失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
            return false;
        }
    }, [addToast]);

    const handleSaveFavoriteFood = useCallback(async (food: FoodItem) => {
        try {
            const existing = favorites.find((f) => normalizeFavoriteName(f.name) === normalizeFavoriteName(food.name));
            const saved = await saveFavorite(buildFavoriteFoodFromItem(food, existing));
            setFavorites((prev) => sortFavoritesByUsage([saved, ...prev.filter((f) => f.id !== saved.id)]));
            addToast(existing ? '常吃食物已更新' : '已加入常吃', 'success');
        } catch (error) {
            addToast(`收藏失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
        }
    }, [addToast, favorites]);

    const handleUseFavoriteFood = useCallback(async (favoriteId: string) => {
        setFavorites((prev) => sortFavoritesByUsage(prev.map((f) => f.id === favoriteId ? { ...f, useCount: f.useCount + 1, updatedAt: Date.now() } : f)));
        try { await incrementFavoriteUse(favoriteId); } catch { /* silent */ }
    }, []);

    const handleDeleteFavoriteFood = useCallback(async (favoriteId: string) => {
        const prev = favorites;
        setFavorites((current) => current.filter((f) => f.id !== favoriteId));
        try {
            await deleteFavorite(favoriteId);
            addToast('已移除常吃食物', 'success');
        } catch (error) {
            setFavorites(prev);
            addToast(`删除失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
        }
    }, [addToast, favorites]);

    const reloadAllSummaries = useCallback(async () => {
        const next = await fetchSummaries(undefined, 24);
        setSummaries(sortSummariesByLatest(next));
    }, []);

    const handleOpenSummaries = useCallback(async () => {
        setIsSummaryListLoading(true);
        try { await reloadAllSummaries(); } catch (error) {
            addToast(`加载总结失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
        } finally { setIsSummaryListLoading(false); }
    }, [addToast, reloadAllSummaries]);

    const handleGenerateSummary = useCallback(async (periodType: SummaryPeriodType) => {
        setIsGeneratingSummary(true);
        addToast(periodType === 'weekly' ? '正在生成本周总结…' : '正在生成本月总结…', 'info');
        try {
            const summary = await generateSummary({
                periodType,
                periodKey: periodType === 'weekly' ? getCurrentISOWeekKey() : getCurrentMonthKey(),
                charId: activeCharacterId || undefined,
                charName: activeCharacter?.name,
                apiConfig,
            });
            setSummaries((prev) => sortSummariesByLatest([summary, ...prev.filter((i) => i.id !== summary.id)]));
            addToast('总结已生成', 'success');
        } catch (error) {
            addToast(`生成总结失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
        } finally { setIsGeneratingSummary(false); }
    }, [activeCharacter?.name, activeCharacterId, addToast, apiConfig]);

    const handleGenerateWeeklySummary = useCallback(async () => { await handleGenerateSummary('weekly'); }, [handleGenerateSummary]);
    const handleGenerateMonthlySummary = useCallback(async () => { await handleGenerateSummary('monthly'); }, [handleGenerateSummary]);

    const handleDeleteSummary = useCallback(async (summaryId: string) => {
        try {
            await deleteSummary(summaryId);
            setSummaries((prev) => prev.filter((s) => s.id !== summaryId));
            addToast('总结已删除', 'success');
        } catch (error) {
            addToast(`删除总结失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
        }
    }, [addToast]);

    const handleSaveWeight = useCallback(async (timeOfDay: WeightTimeOfDay, value: string) => {
        const wv = parsePositiveNumber(value);
        if (!wv) { addToast('请输入有效体重', 'error'); return false; }
        const existing = weightRecords.find((r) => r.date === todayDate && r.timeOfDay === timeOfDay);
        const now = Date.now();
        try {
            const saved = await saveWeight({
                id: existing?.id || buildTrackingId(`weight-${todayDate}-${timeOfDay}`),
                date: todayDate, timeOfDay, weight: Math.round(wv * 10) / 10,
                createdAt: existing?.createdAt || now, updatedAt: now,
            });
            setWeightRecords((prev) => sortWeightRecordsByLatest([saved, ...prev.filter((r) => r.id !== saved.id)]));
            addToast('体重已保存', 'success');
            const timeLabel = timeOfDay === 'morning' ? '早上' : '晚上';
            void injectHealthSignal(
                `[生活感知] TA${timeLabel}称了体重（你心里知道大概的数字，但不要主动说出来。像关心TA的人一样自然回应，比如关心TA有没有好好吃饭、感觉怎么样，而不是报体重数值）`
            );
            return true;
        } catch (error) {
            addToast(`保存体重失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
            return false;
        }
    }, [addToast, injectHealthSignal, todayDate, weightRecords]);

    const handleDeleteWeight = useCallback(async (recordId: string) => {
        try {
            await deleteWeight(recordId);
            setWeightRecords((prev) => prev.filter((r) => r.id !== recordId));
            addToast('体重记录已删除', 'success');
            return true;
        } catch (error) {
            addToast(`删除体重失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
            return false;
        }
    }, [addToast]);

    const handleSaveExercise = useCallback(async (exerciseType: string, durationMin: number) => {
        const isCustom = exerciseType.startsWith('custom:');
        const meta = isCustom ? null : MET_TABLE[exerciseType];
        const customLabel = isCustom ? exerciseType.slice('custom:'.length).trim() : '';
        const DEFAULT_CUSTOM_MET = 3.5; // moderate general activity

        if (!isCustom && !meta) { addToast('请选择运动类型并输入时长', 'error'); return false; }
        if (isCustom && !customLabel) { addToast('请输入运动名称', 'error'); return false; }
        if (durationMin <= 0) { addToast('请输入运动时长', 'error'); return false; }

        const metValue = meta?.met ?? DEFAULT_CUSTOM_MET;
        const label = meta?.label ?? customLabel;
        const now = Date.now();
        try {
            const saved = await saveExercise({
                id: buildTrackingId(`exercise-${todayDate}`),
                date: todayDate, exerciseType, exerciseLabel: label,
                durationMinutes: Math.round(durationMin), metValue,
                caloriesBurned: estimateCaloriesBurned(metValue, latestKnownWeightKg, durationMin),
                createdAt: now, updatedAt: now,
            });
            setTodayExercises((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)].sort((a, b) => b.createdAt - a.createdAt));
            addToast('运动已保存', 'success');
            void injectHealthSignal(
                `[生活感知] TA去${label}了${Math.round(durationMin)}分钟（你注意到了，自然地关心就好，不需要报卡路里数字）`
            );
            return true;
        } catch (error) {
            addToast(`保存运动失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
            return false;
        }
    }, [addToast, injectHealthSignal, latestKnownWeightKg, todayDate]);

    const handleDeleteExercise = useCallback(async (exerciseId: string) => {
        try {
            await deleteExercise(exerciseId);
            setTodayExercises((prev) => prev.filter((r) => r.id !== exerciseId));
            addToast('运动记录已删除', 'success');
        } catch (error) {
            addToast(`删除运动失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
        }
    }, [addToast]);

    const handleSaveSleep = useCallback(async (sleepTime: string, wakeTime: string, quality: SleepQuality) => {
        const dur = computeSleepDurationMinutes(sleepTime, wakeTime);
        if (dur <= 0) { addToast('请输入有效睡眠时间', 'error'); return false; }
        const now = Date.now();
        try {
            const saved = await saveSleep({
                id: todaySleep?.id || buildTrackingId(`sleep-${todayDate}`),
                date: todayDate, sleepTime, wakeTime, durationMinutes: dur, quality,
                createdAt: todaySleep?.createdAt || now, updatedAt: now,
            });
            setTodaySleep(saved);
            addToast('睡眠已保存', 'success');
            const hours = Math.floor(dur / 60);
            const mins = dur % 60;
            const qualityLabel = quality === 'good' ? '质量不错' : quality === 'fair' ? '质量一般' : '没太睡好';
            void injectHealthSignal(
                `[生活感知] TA昨晚${sleepTime}睡、${wakeTime}醒，睡了${hours}小时${mins > 0 ? mins + '分钟' : ''}，${qualityLabel}`
            );
            return true;
        } catch (error) {
            addToast(`保存睡眠失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
            return false;
        }
    }, [addToast, injectHealthSignal, todayDate, todaySleep]);

    const handleDeleteSleep = useCallback(async () => {
        if (!todaySleep) return false;
        try {
            await deleteSleep(todaySleep.id);
            setTodaySleep(null);
            addToast('睡眠记录已删除', 'success');
            return true;
        } catch (error) {
            addToast(`删除睡眠失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
            return false;
        }
    }, [addToast, todaySleep]);

    const value = useMemo<HalfSugarContextValue>(() => ({
        addToast, apiConfig, closeApp, userProfile, updateUserProfile,
        activeCharacterId: activeCharacterId || null, activeCharacter,
        healthProfile, isHealthSetup, onboardingGoalState, isSettingsSaving, handleOnboardingComplete,
        todayDate, todayLabel,
        meals, isMealsLoading, mealsByType, caloriesConsumed, proteinConsumed, carbsConsumed, fatConsumed, fiberConsumed,
        handleSaveMeal, handleDeleteMeal,
        favorites, topFavoriteFoods, handleSaveFavoriteFood, handleDeleteFavoriteFood, handleUseFavoriteFood,
        activeCalorieTarget, nutrientTargets, recommendations,
        weightRecords, latestWeight, latestBmi, weightTarget: weightTargetVal, weightDelta, latestKnownWeightKg,
        handleSaveWeight, handleDeleteWeight,
        todayExercises, todayExerciseCalories, handleSaveExercise, handleDeleteExercise,
        todaySleep, handleSaveSleep, handleDeleteSleep,
        goals,
        summaries, latestSummary, isGeneratingSummary, isSummaryListLoading,
        handleGenerateWeeklySummary, handleGenerateMonthlySummary, handleDeleteSummary, handleOpenSummaries,
        isTrackingLoading,
        activeTab, setActiveTab,
    }), [
        addToast, apiConfig, closeApp, userProfile, updateUserProfile,
        activeCharacterId, activeCharacter,
        healthProfile, isHealthSetup, onboardingGoalState, isSettingsSaving, handleOnboardingComplete,
        todayDate, todayLabel,
        meals, isMealsLoading, mealsByType, caloriesConsumed, proteinConsumed, carbsConsumed, fatConsumed, fiberConsumed,
        handleSaveMeal, handleDeleteMeal,
        favorites, topFavoriteFoods, handleSaveFavoriteFood, handleDeleteFavoriteFood, handleUseFavoriteFood,
        activeCalorieTarget, nutrientTargets, recommendations,
        weightRecords, latestWeight, latestBmi, weightTargetVal, weightDelta, latestKnownWeightKg,
        handleSaveWeight, handleDeleteWeight,
        todayExercises, todayExerciseCalories, handleSaveExercise, handleDeleteExercise,
        todaySleep, handleSaveSleep, handleDeleteSleep,
        goals,
        summaries, latestSummary, isGeneratingSummary, isSummaryListLoading,
        handleGenerateWeeklySummary, handleGenerateMonthlySummary, handleDeleteSummary, handleOpenSummaries,
        isTrackingLoading,
        activeTab, setActiveTab,
    ]);

    return <HalfSugarContext.Provider value={value}>{children}</HalfSugarContext.Provider>;
};
