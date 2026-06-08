import type { UserProfile } from '../../types';

/**
 * The Half Sugar module extends UserProfile with health-related fields
 * that are persisted at runtime via updateUserProfile.
 */
export interface HealthAwareUserProfile extends UserProfile {
    healthGender?: 'male' | 'female';
    healthHeight?: number;
    healthWeight?: number;
    healthBirthYear?: number;
    healthSetupDone?: boolean;
    healthShareBodyInfo?: boolean;
    healthActivityLevel?: ActivityLevel;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'afternoon_tea';
export type FoodSource = 'manual' | 'ai_vision';
export type FoodConfidence = 'high' | 'medium' | 'low';
export type NutrientKey = 'protein' | 'carbs' | 'fat' | 'fiber';
export type WeightTimeOfDay = 'morning' | 'evening';
export type SleepQuality = 'good' | 'fair' | 'poor';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
export type GoalType =
    | 'weight_target'
    | 'daily_calories'
    | 'daily_protein'
    | 'daily_carbs'
    | 'daily_fat'
    | 'daily_fiber';

export interface FoodItem {
    id: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    portion?: string;
    source?: FoodSource;
    confidence?: FoodConfidence;
}

export interface MealRecord {
    id: string;
    date: string;
    type: MealType;
    customLabel?: string;
    foods: FoodItem[];
    photoUrl?: string;
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    source: string;
    createdAt: number;
    updatedAt: number;
}

export interface WeightRecord {
    id: string;
    date: string;
    timeOfDay: WeightTimeOfDay;
    weight: number;
    createdAt: number;
    updatedAt: number;
}

export interface SleepRecord {
    id: string;
    date: string;
    sleepTime: string;
    wakeTime: string;
    durationMinutes: number;
    quality?: SleepQuality;
    createdAt: number;
    updatedAt: number;
}

export interface ExerciseRecord {
    id: string;
    date: string;
    exerciseType: string;
    exerciseLabel: string;
    durationMinutes: number;
    metValue: number;
    caloriesBurned: number;
    createdAt: number;
    updatedAt: number;
}

export interface HealthGoal {
    id: string;
    goalType: GoalType;
    targetValue: number;
    createdAt: number;
    updatedAt: number;
}

export type SummaryPeriodType = 'weekly' | 'monthly';

export interface HealthSummary {
    id: string;
    periodType: SummaryPeriodType;
    periodKey: string;
    startDate: string;
    endDate: string;
    statsJson: HealthSummaryStats;
    summaryText: string;
    charId?: string;
    charName?: string;
    createdAt: number;
    updatedAt: number;
}

export interface HealthSummaryStats {
    periodDays: number;
    recordedDays: number;
    avgCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    totalFiber: number;
    weightStart?: number;
    weightEnd?: number;
    weightChange?: number;
    exerciseCount: number;
    exerciseCalories: number;
    topExercise?: string;
    avgSleepMinutes?: number;
    sleepRecordedDays: number;
    goalTargets?: Partial<Record<GoalType, number>>;
}

export interface FavoriteFood {
    id: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    portion?: string;
    useCount: number;
    createdAt: number;
    updatedAt: number;
}

export interface HealthProfile {
    gender: 'male' | 'female' | '';
    height: string;
    weight: string;
    birthYear: string;
    activityLevel: ActivityLevel;
    isSetup: boolean;
}

export interface MealTypeDefinition {
    key: MealType;
    label: string;
    icon: string;
    bg: string;
    color: string;
}

export interface DailyNutrientTargets {
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
}

export interface NutrientGap {
    nutrient: NutrientKey;
    label: string;
    current: number;
    target: number;
    gap: number;
    gapPercent: number;
}

export const MEAL_TYPES: MealTypeDefinition[] = [
    { key: 'breakfast', label: '早餐', icon: '🌅', bg: 'var(--hs-clay-bg)', color: 'var(--hs-clay)' },
    { key: 'lunch', label: '午餐', icon: '☀️', bg: 'var(--hs-sage-bg)', color: 'var(--hs-sage)' },
    { key: 'dinner', label: '晚餐', icon: '🌙', bg: 'var(--hs-dusk-bg)', color: 'var(--hs-dusk)' },
    { key: 'snack', label: '零食', icon: '🍪', bg: 'var(--hs-rose-bg)', color: 'var(--hs-rose)' },
    { key: 'afternoon_tea', label: '下午茶', icon: '🧋', bg: 'var(--hs-ocean-bg)', color: 'var(--hs-ocean)' },
];

export const DEFAULT_NUTRIENT_TARGETS: DailyNutrientTargets = {
    protein: 60,
    carbs: 250,
    fat: 65,
    fiber: 25,
};

export const ACTIVITY_LEVELS: { key: ActivityLevel; label: string; multiplier: number; desc: string }[] = [
    { key: 'sedentary', label: '久坐', multiplier: 1.2, desc: '办公室/在家，很少运动' },
    { key: 'light', label: '轻度活动', multiplier: 1.375, desc: '每周 1-3 次轻运动' },
    { key: 'moderate', label: '中度活动', multiplier: 1.55, desc: '每周 3-5 次运动' },
    { key: 'active', label: '高度活动', multiplier: 1.725, desc: '每天运动或体力劳动' },
];

const ACTIVITY_LEVEL_MAP = new Map(ACTIVITY_LEVELS.map((a) => [a.key, a]));

export const MET_TABLE: Record<string, { label: string; met: number; icon: string }> = {
    // Female-priority ordering
    walking_slow: { label: '散步', met: 2.0, icon: '🚶' },
    walking_fast: { label: '快走', met: 3.5, icon: '🚶‍♀️' },
    yoga: { label: '瑜伽', met: 2.5, icon: '🧘' },
    pilates: { label: '普拉提', met: 3.0, icon: '🤸' },
    dancing: { label: '跳舞', met: 5.0, icon: '💃' },
    stretching: { label: '拉伸', met: 2.3, icon: '🙆' },
    jogging: { label: '慢跑', met: 7.0, icon: '🏃‍♀️' },
    running: { label: '跑步', met: 9.8, icon: '🏃' },
    swimming: { label: '游泳', met: 8.0, icon: '🏊' },
    cycling_casual: { label: '骑行', met: 4.0, icon: '🚲' },
    cycling_fast: { label: '快骑', met: 8.0, icon: '🚴' },
    hula_hoop: { label: '呼啦圈', met: 6.0, icon: '⭕' },
    jump_rope: { label: '跳绳', met: 12.3, icon: '⚡' },
    elliptical: { label: '椭圆机', met: 5.0, icon: '🔄' },
    stair_climber: { label: '爬楼梯', met: 4.0, icon: '🪜' },
    roller_skating: { label: '轮滑', met: 7.0, icon: '⛸️' },
    strength: { label: '力量训练', met: 6.0, icon: '💪' },
    badminton: { label: '羽毛球', met: 5.5, icon: '🏸' },
    hiking: { label: '徒步', met: 6.0, icon: '🥾' },
    basketball: { label: '篮球', met: 6.5, icon: '🏀' },
    custom: { label: '自定义', met: 4.0, icon: '✏️' },
};

const MEAL_TYPE_MAP = new Map(MEAL_TYPES.map((item) => [item.key, item]));
const NUTRIENT_LABELS: Record<NutrientKey, string> = {
    protein: '蛋白质',
    carbs: '碳水',
    fat: '脂肪',
    fiber: '膳食纤维',
};

export function getMealTypeDefinition(type: string): MealTypeDefinition {
    return MEAL_TYPE_MAP.get(type as MealType) || {
        key: 'snack',
        label: '餐食',
        icon: '餐',
        bg: 'var(--hs-glass)',
        color: 'var(--hs-text-secondary)',
    };
}

export function buildHealthProfileFromUserProfile(userProfile: HealthAwareUserProfile): HealthProfile {
    return {
        gender: userProfile.healthGender || '',
        height: userProfile.healthHeight?.toString() || '',
        weight: userProfile.healthWeight?.toString() || '',
        birthYear: userProfile.healthBirthYear?.toString() || '',
        activityLevel: userProfile.healthActivityLevel || 'light',
        isSetup: Boolean(userProfile.healthSetupDone),
    };
}

export function formatLocalDateKey(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getCurrentISOWeekKey(date = new Date()): string {
    const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = normalized.getUTCDay() || 7;
    normalized.setUTCDate(normalized.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((normalized.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${normalized.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Convert an ISO week key like "2026-W16" to a date range string like "4/13 – 4/19".
 * Falls back to the original key if parsing fails.
 */
export function formatWeekKeyAsRange(weekKey: string): string {
    const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return weekKey;
    const year = Number(match[1]);
    const week = Number(match[2]);
    // ISO week 1 contains the year's first Thursday.
    // Jan 4 is always in ISO week 1.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7; // Mon=1 … Sun=7
    // Monday of ISO week 1
    const week1Monday = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
    // Monday of the target week
    const monday = new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    const fmt = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    return `${fmt(monday)} – ${fmt(sunday)}`;
}

/** Get the current week's date range string, e.g. "4/13 – 4/19" */
export function getCurrentWeekRange(date = new Date()): string {
    return formatWeekKeyAsRange(getCurrentISOWeekKey(date));
}

export function getCurrentMonthKey(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function computeBmr(userProfile: HealthAwareUserProfile, now = new Date()): number | null {
    const height = userProfile.healthHeight;
    const weight = userProfile.healthWeight;
    const birthYear = userProfile.healthBirthYear;
    if (!height || !weight) {
        return null;
    }

    const age = birthYear ? Math.max(0, now.getFullYear() - birthYear) : 25;
    return userProfile.healthGender === 'female'
        ? 10 * weight + 6.25 * height - 5 * age - 161
        : 10 * weight + 6.25 * height - 5 * age + 5;
}

export function computeCalorieTarget(userProfile: HealthAwareUserProfile, now = new Date()): number {
    const bmr = computeBmr(userProfile, now);
    if (!bmr) return 2000;
    const level = userProfile.healthActivityLevel || 'light';
    const multiplier = ACTIVITY_LEVEL_MAP.get(level)?.multiplier || 1.375;
    return Math.round(bmr * multiplier);
}

export function computeDailyCalorieGoal(userProfile: HealthAwareUserProfile, _targetWeightKg?: number, now = new Date()): number {
    return computeCalorieTarget(userProfile, now);
}

/**
 * 根据《中国居民膳食指南(2022)》计算各营养素推荐最低值。
 * 此值为用户不可下调的底线。
 */
export function computeGuidelineNutrients(
    gender: 'male' | 'female' | '',
    tdee: number,
): DailyNutrientTargets {
    const isMale = gender === 'male';
    return {
        protein: isMale ? 65 : 55,                // RNI (g/day)
        carbs: Math.round(tdee * 0.55 / 4),        // 50-65% 能量，取中值 55%
        fat: Math.round(tdee * 0.25 / 9),           // 20-30% 能量，取下限 25%
        fiber: 25,                                   // 膳食指南推荐
    };
}

export function sortMealsByCreatedAtDesc(meals: MealRecord[]): MealRecord[] {
    return [...meals].sort((left, right) => {
        if (right.createdAt !== left.createdAt) {
            return right.createdAt - left.createdAt;
        }
        return right.updatedAt - left.updatedAt;
    });
}

export function computeNutrientGaps(
    meals: MealRecord[],
    targets: DailyNutrientTargets,
): NutrientGap[] {
    return (Object.keys(NUTRIENT_LABELS) as NutrientKey[]).map((nutrient) => {
        const current = meals.reduce(
            (mealSum, meal) => mealSum + meal.foods.reduce(
                (foodSum, food) => foodSum + (Number(food[nutrient] ?? 0) || 0),
                0,
            ),
            0,
        );
        const target = Number(targets[nutrient]) || 0;
        const gap = Math.max(0, target - current);
        const gapPercent = target > 0 ? (gap / target) * 100 : 0;

        return {
            nutrient,
            label: NUTRIENT_LABELS[nutrient],
            current,
            target,
            gap,
            gapPercent,
        };
    });
}

export function estimateCaloriesBurned(met: number, weightKg: number, durationMinutes: number): number {
    return Math.round(met * weightKg * (durationMinutes / 60));
}

export function computeBMI(weightKg: number, heightCm: number): number {
    const heightM = heightCm / 100;
    return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function getBMICategory(bmi: number): string {
    if (bmi < 18.5) return '偏瘦';
    if (bmi < 24) return '正常';
    if (bmi < 28) return '偏重';
    return '肥胖';
}

export function computeSleepDurationMinutes(sleepTime: string, wakeTime: string): number {
    const [sleepHour, sleepMinute] = sleepTime.split(':').map((value) => Number(value) || 0);
    const [wakeHour, wakeMinute] = wakeTime.split(':').map((value) => Number(value) || 0);

    const sleepTotal = sleepHour * 60 + sleepMinute;
    let wakeTotal = wakeHour * 60 + wakeMinute;

    if (wakeTotal <= sleepTotal) {
        wakeTotal += 24 * 60;
    }

    return Math.max(0, wakeTotal - sleepTotal);
}

export function formatDurationMinutes(durationMinutes: number): string {
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return `${hours}h${minutes}m`;
}

export function sortWeightRecordsByLatest(records: WeightRecord[]): WeightRecord[] {
    const timePriority: Record<WeightTimeOfDay, number> = {
        evening: 2,
        morning: 1,
    };

    return [...records].sort((left, right) => {
        if (right.date !== left.date) {
            return right.date.localeCompare(left.date);
        }
        if (timePriority[right.timeOfDay] !== timePriority[left.timeOfDay]) {
            return timePriority[right.timeOfDay] - timePriority[left.timeOfDay];
        }
        return right.updatedAt - left.updatedAt;
    });
}
