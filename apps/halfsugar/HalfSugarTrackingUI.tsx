import React, { useEffect, useMemo, useState } from 'react';

import {
    ACTIVITY_LEVELS,
    type ActivityLevel,
    computeBMI,
    computeDailyCalorieGoal,
    computeGuidelineNutrients,
    type GoalType,
    type HealthAwareUserProfile,
    type HealthGoal,
    type HealthProfile,
} from './types';

export interface GoalFormState {
    weightTarget: string;
    dailyCalories: string;
    dailyProtein: string;
    dailyCarbs: string;
    dailyFat: string;
    dailyFiber: string;
}

interface GoalFieldDefinition {
    key: keyof GoalFormState;
    goalType: GoalType;
    label: string;
    unit: string;
}

const GOAL_FIELD_DEFINITIONS: GoalFieldDefinition[] = [
    { key: 'dailyCalories', goalType: 'daily_calories', label: '每日热量参考', unit: 'kcal' },
    { key: 'dailyProtein', goalType: 'daily_protein', label: '蛋白质参考', unit: 'g' },
    { key: 'dailyCarbs', goalType: 'daily_carbs', label: '碳水参考', unit: 'g' },
    { key: 'dailyFat', goalType: 'daily_fat', label: '脂肪参考', unit: 'g' },
    { key: 'dailyFiber', goalType: 'daily_fiber', label: '膳食纤维参考', unit: 'g' },
];

function parsePositiveNumber(value: string): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatGoalNumber(value: number | undefined): string {
    return value && Number.isFinite(value) ? String(value) : '';
}

function buildUserProfileShape(profile: HealthProfile): HealthAwareUserProfile {
    return {
        name: '',
        avatar: '',
        bio: '',
        healthGender: profile.gender || undefined,
        healthHeight: parsePositiveNumber(profile.height) || undefined,
        healthWeight: parsePositiveNumber(profile.weight) || undefined,
        healthBirthYear: parsePositiveNumber(profile.birthYear) || undefined,
        healthActivityLevel: profile.activityLevel || 'light',
        healthSetupDone: profile.isSetup,
    };
}

function getGoalValue(goals: HealthGoal[], goalType: GoalType): number | undefined {
    return goals.find((goal) => goal.goalType === goalType)?.targetValue;
}

function getBmiBadgeClassName(_bmi: number): string {
    return 'hs-bmi-badge';
}

export function buildGoalFormState(profile: HealthProfile, goals: HealthGoal[]): GoalFormState {
    const currentWeight = parsePositiveNumber(profile.weight) || undefined;
    const weightTarget = getGoalValue(goals, 'weight_target') ?? currentWeight;
    const userShape = buildUserProfileShape(profile);

    return {
        weightTarget: formatGoalNumber(weightTarget),
        dailyCalories: formatGoalNumber(
            getGoalValue(goals, 'daily_calories') ?? computeDailyCalorieGoal(userShape, weightTarget),
        ),
        dailyProtein: formatGoalNumber(getGoalValue(goals, 'daily_protein') ?? 60),
        dailyCarbs: formatGoalNumber(getGoalValue(goals, 'daily_carbs') ?? 250),
        dailyFat: formatGoalNumber(getGoalValue(goals, 'daily_fat') ?? 65),
        dailyFiber: formatGoalNumber(getGoalValue(goals, 'daily_fiber') ?? 25),
    };
}

export const BottomSheetModal: React.FC<{
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}> = ({ title, onClose, children }) => (
    <div className="hs-modal-overlay" onClick={onClose}>
        <div className="hs-modal-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="hs-modal-handle" />
            <div className="hs-modal-title">{title}</div>
            <div className="hs-modal-body">{children}</div>
        </div>
    </div>
);

export const OnboardingView: React.FC<{
    initialProfile: HealthProfile;
    initialGoals: GoalFormState;
    initialShareBodyInfo?: boolean;
    hasPersistedGoals: boolean;
    isSaving?: boolean;
    onComplete: (payload: { profile: HealthProfile; goals: GoalFormState; shareBodyInfo: boolean }) => void | Promise<void>;
}> = ({ initialProfile, initialGoals, initialShareBodyInfo = false, hasPersistedGoals, isSaving = false, onComplete }) => {
    const [gender, setGender] = useState<'male' | 'female' | ''>(initialProfile.gender);
    const [height, setHeight] = useState(initialProfile.height);
    const [weight, setWeight] = useState(initialProfile.weight);
    const [birthYear, setBirthYear] = useState(initialProfile.birthYear);
    const [activityLevel, setActivityLevel] = useState<ActivityLevel>(initialProfile.activityLevel || 'light');
    const [goals, setGoals] = useState<GoalFormState>(initialGoals);
    const [shareBodyInfo, setShareBodyInfo] = useState(initialShareBodyInfo);
    const [weightTargetTouched, setWeightTargetTouched] = useState(hasPersistedGoals);
    const [calorieTouched, setCalorieTouched] = useState(hasPersistedGoals);
    const currentYear = new Date().getFullYear();

    useEffect(() => {
        setGender(initialProfile.gender);
        setHeight(initialProfile.height);
        setWeight(initialProfile.weight);
        setBirthYear(initialProfile.birthYear);
        setActivityLevel(initialProfile.activityLevel || 'light');
        setGoals(initialGoals);
        setShareBodyInfo(initialShareBodyInfo);
        setWeightTargetTouched(hasPersistedGoals);
        setCalorieTouched(hasPersistedGoals);
    }, [
        hasPersistedGoals,
        initialGoals,
        initialProfile.birthYear,
        initialProfile.gender,
        initialProfile.height,
        initialProfile.weight,
        initialProfile.activityLevel,
        initialShareBodyInfo,
    ]);

    const profileDraft = useMemo<HealthProfile>(() => ({
        gender,
        height,
        weight,
        birthYear,
        activityLevel,
        isSetup: true,
    }), [birthYear, gender, height, weight, activityLevel]);

    const weightValue = parsePositiveNumber(weight);
    const heightValue = parsePositiveNumber(height);
    const goalWeightValue = parsePositiveNumber(goals.weightTarget);

    useEffect(() => {
        if (weightTargetTouched) {
            return;
        }
        setGoals((prev) => ({
            ...prev,
            weightTarget: weight,
        }));
    }, [weight, weightTargetTouched]);

    const suggestedDailyCalories = useMemo(
        () => computeDailyCalorieGoal(buildUserProfileShape(profileDraft), goalWeightValue || weightValue || undefined),
        [goalWeightValue, profileDraft, weightValue],
    );

    useEffect(() => {
        if (calorieTouched) {
            return;
        }
        setGoals((prev) => ({
            ...prev,
            dailyCalories: String(suggestedDailyCalories),
        }));
    }, [calorieTouched, suggestedDailyCalories]);

    const targetBmi = goalWeightValue && heightValue ? computeBMI(goalWeightValue, heightValue) : null;
    const isValid = Boolean(
        gender
        && heightValue
        && weightValue
        && parsePositiveNumber(birthYear)
        && parsePositiveNumber(goals.weightTarget)
        && parsePositiveNumber(goals.dailyCalories)
        && parsePositiveNumber(goals.dailyProtein)
        && parsePositiveNumber(goals.dailyCarbs)
        && parsePositiveNumber(goals.dailyFat)
        && parsePositiveNumber(goals.dailyFiber),
    );

    const handleGoalChange = (key: keyof GoalFormState, value: string) => {
        if (key === 'weightTarget') {
            setWeightTargetTouched(true);
        }
        if (key === 'dailyCalories') {
            setCalorieTouched(true);
        }
        setGoals((prev) => ({ ...prev, [key]: value }));
    };

    const handleSubmit = () => {
        if (!isValid || isSaving) return;
        
        // Enforce Chinese Dietary Guidelines bottom lines
        const baseCal = suggestedDailyCalories;
        const minimums = computeGuidelineNutrients(gender as any, baseCal);
        
        const finalGoals = { ...goals };
        if (parsePositiveNumber(finalGoals.dailyProtein)! < minimums.protein) finalGoals.dailyProtein = String(minimums.protein);
        if (parsePositiveNumber(finalGoals.dailyCarbs)! < minimums.carbs) finalGoals.dailyCarbs = String(minimums.carbs);
        if (parsePositiveNumber(finalGoals.dailyFat)! < minimums.fat) finalGoals.dailyFat = String(minimums.fat);
        if (parsePositiveNumber(finalGoals.dailyFiber)! < minimums.fiber) finalGoals.dailyFiber = String(minimums.fiber);

        void onComplete({
            profile: { gender, height, weight, birthYear, activityLevel, isSetup: true },
            goals: finalGoals,
            shareBodyInfo,
        });
    };

    const baseCal = suggestedDailyCalories;
    const minimums = computeGuidelineNutrients(gender as any, baseCal);

    return (
        <div className="hs-onboarding hs-animate-fade-in">
            <div className="hs-onboarding-illustration"><span className="hs-emoji" style={{ fontSize: 42 }}>⚖️</span></div>
            <h1 className="hs-onboarding-title">关于我</h1>
            <p className="hs-onboarding-subtitle">记录下来，随时可以修改</p>
            <div className="hs-form-group">
                <label className="hs-form-label">性别</label>
                <div className="hs-gender-toggle">
                    <button type="button" className={`hs-gender-btn ${gender === 'male' ? 'active' : ''}`} onClick={() => setGender('male')}>男</button>
                    <button type="button" className={`hs-gender-btn ${gender === 'female' ? 'active' : ''}`} onClick={() => setGender('female')}>女</button>
                </div>
            </div>
            <div className="hs-form-group">
                <label className="hs-form-label">身高</label>
                <div className="hs-form-input-with-unit">
                    <input type="number" inputMode="decimal" className="hs-form-input" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="170" min="100" max="250" />
                    <span className="hs-unit">cm</span>
                </div>
            </div>
            <div className="hs-form-group">
                <label className="hs-form-label">体重</label>
                <div className="hs-form-input-with-unit">
                    <input type="number" inputMode="decimal" className="hs-form-input" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="65" min="20" max="300" />
                    <span className="hs-unit">kg</span>
                </div>
            </div>
            <div className="hs-form-group">
                <label className="hs-form-label">出生年份</label>
                <input type="number" inputMode="numeric" className="hs-form-input" value={birthYear} onChange={(event) => setBirthYear(event.target.value)} placeholder="1998" min="1940" max={currentYear} />
            </div>
            
            <div className="hs-form-group">
                <label className="hs-form-label">日常活动强度</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {ACTIVITY_LEVELS.map(level => (
                        <button
                            key={level.key}
                            type="button"
                            className={`hs-gender-btn ${activityLevel === level.key ? 'active' : ''}`}
                            style={{ height: 'auto', padding: '12px', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}
                            onClick={() => {
                                setActivityLevel(level.key);
                                setCalorieTouched(false);
                            }}
                        >
                            <span style={{ fontSize: '15px', fontWeight: 600 }}>{level.label}</span>
                            <span style={{ fontSize: '12px', fontWeight: 400, opacity: 0.7 }}>{level.desc}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="hs-goal-section">
                <div className="hs-section-title" style={{ padding: 0, marginBottom: 10 }}>
                    <span>我的参考值</span>
                    <span></span>
                </div>
                <div className="hs-goal-row">
                    <div className="hs-goal-label" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span>目标体重</span>
                        {targetBmi && (
                            <span className={getBmiBadgeClassName(targetBmi)}>
                                BMI {targetBmi}
                            </span>
                        )}
                    </div>
                    <input
                        type="number"
                        inputMode="decimal"
                        className="hs-goal-input"
                        value={goals.weightTarget}
                        onChange={(event) => handleGoalChange('weightTarget', event.target.value)}
                        placeholder="65"
                    />
                    <span className="hs-goal-unit">kg</span>
                </div>

                {GOAL_FIELD_DEFINITIONS.map((field) => {
                    let minNote = '';
                    if (field.key === 'dailyProtein') minNote = `底线: ${minimums.protein}g`;
                    if (field.key === 'dailyCarbs') minNote = `底线: ${minimums.carbs}g`;
                    if (field.key === 'dailyFat') minNote = `底线: ${minimums.fat}g`;
                    if (field.key === 'dailyFiber') minNote = `底线: ${minimums.fiber}g`;

                    return (
                        <div key={field.goalType} className="hs-goal-row">
                            <div className="hs-goal-label" style={{ display: 'flex', flexDirection: 'column' }}>
                                <span>{field.label}</span>
                                {minNote && <span style={{ fontSize: 10, color: '#f5a623' }}>{minNote}</span>}
                            </div>
                            <input
                                type="number"
                                inputMode="decimal"
                                className="hs-goal-input"
                                value={goals[field.key]}
                                onChange={(event) => handleGoalChange(field.key, event.target.value)}
                            />
                            <span className="hs-goal-unit">{field.unit}</span>
                        </div>
                    );
                })}

                <div className="hs-goal-row">
                    <div className="hs-goal-label" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span>他会把你放在心上</span>
                        <span style={{ fontSize: 12, color: 'rgba(15, 23, 42, 0.56)', fontWeight: 400 }}>
                            开启后，他会知道你有没有好好吃饭、有没有好好睡觉
                        </span>
                    </div>
                    <label className="hs-toggle">
                        <input
                            type="checkbox"
                            aria-label="让角色感知健康数据"
                            checked={shareBodyInfo}
                            onChange={(event) => setShareBodyInfo(event.target.checked)}
                        />
                        <span className="hs-toggle-slider" />
                    </label>
                </div>
            </div>

            <button type="button" className="hs-submit-btn" onClick={handleSubmit} disabled={!isValid || isSaving}>
                {initialProfile.isSetup ? '保存' : '好了，开始记录'}
            </button>
        </div>
    );
};
