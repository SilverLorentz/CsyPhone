/**
 * MealRecordView — Extracted sub-page for recording/editing a single meal.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { identifyFoodFromImage, estimateFoodByName } from '../halfsugarVision';
import {
    DEFAULT_NUTRIENT_TARGETS,
    type FavoriteFood,
    type FoodItem,
    type MealRecord,
    type MealTypeDefinition,
} from '../types';
import { getErrorMessage, normalizeFavoriteName } from '../HalfSugarContext';

interface FoodFormState {
    name: string;
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    fiber: string;
    portion: string;
}

const EMPTY_FOOD_FORM: FoodFormState = {
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: '',
    portion: '',
};

function buildFoodId(prefix = 'food'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatFoodNumber(value: number | undefined): string {
    return typeof value === 'number' && Number.isFinite(value) && value !== 0 ? String(value) : '';
}

function buildFoodForm(food?: Partial<FoodItem>): FoodFormState {
    return {
        name: food?.name || '',
        calories: formatFoodNumber(food?.calories),
        protein: formatFoodNumber(food?.protein),
        carbs: formatFoodNumber(food?.carbs),
        fat: formatFoodNumber(food?.fat),
        fiber: formatFoodNumber(food?.fiber),
        portion: food?.portion || '',
    };
}

function buildFoodFromForm(form: FoodFormState, existing?: FoodItem): FoodItem {
    const portion = form.portion.trim();
    return {
        id: existing?.id || buildFoodId(existing?.source === 'ai_vision' ? 'food-ai' : 'food'),
        name: form.name.trim(),
        calories: parseFloat(form.calories) || 0,
        protein: parseFloat(form.protein) || 0,
        carbs: parseFloat(form.carbs) || 0,
        fat: parseFloat(form.fat) || 0,
        fiber: parseFloat(form.fiber) || 0,
        portion: portion || undefined,
        source: existing?.source || 'manual',
        confidence: existing?.confidence,
    };
}

function getMealSource(foods: FoodItem[], fallbackSource?: string): string {
    return foods.some((food) => food.source === 'ai_vision') ? 'ai_vision' : fallbackSource || 'manual';
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
    });
}

function openFoodEditorOnKey(event: React.KeyboardEvent<HTMLDivElement>, onOpen: () => void): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen();
}

function hasManualNutritionInput(form: FoodFormState): boolean {
    return [form.calories, form.protein, form.carbs, form.fat, form.fiber, form.portion].some(
        (value) => value.trim().length > 0,
    );
}

export const MealRecordView: React.FC<{
    currentDate: string;
    mealType: MealTypeDefinition;
    initialMeal: MealRecord | null;
    apiConfig: { baseUrl: string; apiKey: string; model: string };
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    favorites: FavoriteFood[];
    onBack: () => void;
    onDelete: (mealId: string) => Promise<boolean>;
    onDeleteFavorite: (favoriteId: string) => Promise<void>;
    onSaveFavorite: (food: FoodItem) => Promise<void>;
    onSave: (meal: MealRecord) => Promise<boolean>;
    onUseFavorite: (favoriteId: string) => Promise<void>;
}> = ({
    currentDate,
    mealType,
    initialMeal,
    apiConfig,
    addToast,
    favorites,
    onBack,
    onDelete,
    onDeleteFavorite,
    onSaveFavorite,
    onSave,
    onUseFavorite,
}) => {
    const [foods, setFoods] = useState<FoodItem[]>(initialMeal?.foods || []);
    const [newFoodForm, setNewFoodForm] = useState<FoodFormState>(EMPTY_FOOD_FORM);
    const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
    const [editingFoodForm, setEditingFoodForm] = useState<FoodFormState>(EMPTY_FOOD_FORM);
    const [photoUrl, setPhotoUrl] = useState<string | null>(initialMeal?.photoUrl || null);
    const [favoritePromptFood, setFavoritePromptFood] = useState<FoodItem | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isIdentifying, setIsIdentifying] = useState(false);
    const [isEstimating, setIsEstimating] = useState(false);
    const [showCustomFields, setShowCustomFields] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const albumInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setFoods(initialMeal?.foods || []);
        setPhotoUrl(initialMeal?.photoUrl || null);
        setNewFoodForm(EMPTY_FOOD_FORM);
        setEditingFoodId(null);
        setEditingFoodForm(EMPTY_FOOD_FORM);
        setFavoritePromptFood(null);
        setIsIdentifying(false);
        setIsEstimating(false);
        setShowCustomFields(false);
    }, [initialMeal]);

    useEffect(() => {
        if (!favoritePromptFood) return undefined;
        const timeoutId = window.setTimeout(() => setFavoritePromptFood(null), 4500);
        return () => window.clearTimeout(timeoutId);
    }, [favoritePromptFood]);

    const totalCalories = useMemo(() => foods.reduce((sum, item) => sum + item.calories, 0), [foods]);
    const totalProtein = useMemo(() => foods.reduce((sum, item) => sum + item.protein, 0), [foods]);
    const totalCarbs = useMemo(() => foods.reduce((sum, item) => sum + item.carbs, 0), [foods]);
    const totalFat = useMemo(() => foods.reduce((sum, item) => sum + item.fat, 0), [foods]);

    const canSave = foods.length > 0 && !isSubmitting && !isIdentifying && !isEstimating;
    const canAddFood = newFoodForm.name.trim().length > 0 && !isSubmitting && !isIdentifying && !isEstimating;

    const updateNewFoodField = (field: keyof FoodFormState, value: string) => {
        setNewFoodForm((previous) => ({ ...previous, [field]: value }));
    };

    const updateEditingFoodField = (field: keyof FoodFormState, value: string) => {
        setEditingFoodForm((previous) => ({ ...previous, [field]: value }));
    };

    const resetNewFoodForm = () => {
        setNewFoodForm(EMPTY_FOOD_FORM);
        setShowCustomFields(false);
    };

    const maybePromptFavorite = (food: FoodItem | undefined) => {
        if (!food) return;
        const alreadyFavorited = favorites.some(
            (favorite) => normalizeFavoriteName(favorite.name) === normalizeFavoriteName(food.name),
        );
        setFavoritePromptFood(alreadyFavorited ? null : food);
    };

    const handleAddFood = async () => {
        const foodName = newFoodForm.name.trim();
        if (!foodName) return;

        if (showCustomFields || hasManualNutritionInput(newFoodForm)) {
            const manualFood = buildFoodFromForm(newFoodForm, {
                id: buildFoodId(),
                source: 'manual',
            } as FoodItem);
            setFoods((previous) => [...previous, manualFood]);
            resetNewFoodForm();
            maybePromptFavorite(manualFood);
            return;
        }

        setIsEstimating(true);
        try {
            const result = await estimateFoodByName(foodName, apiConfig);
            if (result.foods.length === 0) {
                addToast('无法估算，请手动输入', 'error');
                setShowCustomFields(true);
                return;
            }

            setFoods((previous) => [...previous, ...result.foods]);
            addToast(`已估算「${foodName}」的营养`, 'success');
            resetNewFoodForm();
            maybePromptFavorite(result.foods[0]);
        } catch (error) {
            addToast(`估算失败：${getErrorMessage(error, '请手动输入')}`, 'error');
            setShowCustomFields(true);
        } finally {
            setIsEstimating(false);
        }
    };

    const handleNewFoodKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void handleAddFood();
    };

    const handleStartEditingFood = (food: FoodItem) => {
        setEditingFoodId(food.id);
        setEditingFoodForm(buildFoodForm(food));
    };

    const handleCancelEditingFood = () => {
        setEditingFoodId(null);
        setEditingFoodForm(EMPTY_FOOD_FORM);
    };

    const handleUpdateEditingFood = () => {
        if (!editingFoodId || !editingFoodForm.name.trim()) return;
        setFoods((previous) =>
            previous.map((item) => (item.id === editingFoodId ? buildFoodFromForm(editingFoodForm, item) : item)),
        );
        handleCancelEditingFood();
    };

    const handleRemoveFood = (foodId: string) => {
        setFoods((previous) => previous.filter((item) => item.id !== foodId));
        if (editingFoodId === foodId) {
            handleCancelEditingFood();
        }
    };

    const handleDelete = async () => {
        if (!initialMeal || isSubmitting) return;
        const confirmed =
            typeof window === 'undefined' || typeof window.confirm !== 'function'
                ? true
                : window.confirm('删除这条餐食记录？');
        if (!confirmed) return;

        setIsSubmitting(true);
        const deleted = await onDelete(initialMeal.id);
        setIsSubmitting(false);
        if (deleted) onBack();
    };

    const handlePhotoClick = (mode: 'camera' | 'album') => {
        if (isSubmitting || isIdentifying) return;
        if (mode === 'camera') {
            fileInputRef.current?.click();
            return;
        }
        albumInputRef.current?.click();
    };

    const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const url = await readFileAsDataUrl(file);
            setPhotoUrl(url);

            if (!apiConfig.apiKey || !apiConfig.baseUrl || !apiConfig.model) {
                addToast('已添加照片，请先在设置中配置图片识别 API', 'error');
                return;
            }

            setIsIdentifying(true);
            const result = await identifyFoodFromImage(url, mealType.label, apiConfig);
            if (result.foods.length === 0) {
                addToast('没有识别到明确食物，可以手动补充', 'error');
                return;
            }

            setFoods((previous) => [...previous, ...result.foods]);
            addToast(result.mealDescription || `已识别 ${result.foods.length} 项食物`, 'success');
            maybePromptFavorite(result.foods[0]);
        } catch (error) {
            addToast(`识别失败：${getErrorMessage(error, '请稍后重试')}`, 'error');
        } finally {
            setIsIdentifying(false);
            event.target.value = '';
        }
    };

    const handleSave = async () => {
        if (!canSave) return;

        const now = Date.now();
        const meal: MealRecord = {
            id: initialMeal?.id || `meal-${now}-${Math.random().toString(36).slice(2, 8)}`,
            date: initialMeal?.date || currentDate,
            type: mealType.key,
            customLabel: initialMeal?.customLabel,
            foods,
            photoUrl: photoUrl || undefined,
            totalCalories,
            totalProtein,
            totalCarbs,
            totalFat,
            source: getMealSource(foods, initialMeal?.source),
            createdAt: initialMeal?.createdAt || now,
            updatedAt: now,
        };

        setIsSubmitting(true);
        const saved = await onSave(meal);
        setIsSubmitting(false);
        if (saved) onBack();
    };

    const handleFavoriteFill = (favorite: FavoriteFood) => {
        setNewFoodForm(
            buildFoodForm({
                name: favorite.name,
                calories: favorite.calories,
                protein: favorite.protein,
                carbs: favorite.carbs,
                fat: favorite.fat,
                fiber: favorite.fiber,
                portion: favorite.portion,
            }),
        );
        setShowCustomFields(true);
        void onUseFavorite(favorite.id);
    };

    const handleConfirmFavoritePrompt = async () => {
        if (!favoritePromptFood) return;
        await onSaveFavorite(favoritePromptFood);
        setFavoritePromptFood(null);
    };

    return (
        <div className="hs-tab-content no-scrollbar" style={{ display: 'flex', flexDirection: 'column', paddingBottom: 0 }}>
            <div className="hs-header">
                <button type="button" className="hs-back-btn" onClick={onBack}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </button>
                <span className="hs-header-title">
                    {initialMeal ? '编辑' : '记录'}
                    {mealType.label}
                </span>
                <button
                    type="button"
                    className="hs-back-btn"
                    onClick={handleSave}
                    disabled={!canSave}
                    style={canSave ? { background: 'var(--hs-sage-bg)', color: 'var(--hs-sage)' } : { opacity: 0.5 }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                </button>
            </div>

            <div className="hs-scroll-area no-scrollbar" style={{ flex: 1 }}>
                {favoritePromptFood && (
                    <div className="hs-inline-toast hs-animate-fade-in">
                        <div className="hs-inline-toast-text">收藏这个食物？</div>
                        <div className="hs-inline-toast-actions">
                            <button type="button" className="hs-inline-toast-btn primary" onClick={handleConfirmFavoritePrompt}>
                                收藏
                            </button>
                            <button type="button" className="hs-inline-toast-btn" onClick={() => setFavoritePromptFood(null)}>
                                稍后
                            </button>
                        </div>
                    </div>
                )}

                <div className={`hs-photo-area hs-animate-fade-in${photoUrl ? ' has-photo' : ''}`}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={handlePhotoChange}
                    />
                    <input
                        ref={albumInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handlePhotoChange}
                    />

                    {photoUrl ? (
                        <>
                            <img src={photoUrl} alt="meal" />
                            <div className="hs-photo-actions hs-photo-actions-overlay">
                                <button type="button" className="hs-photo-action-btn" onClick={() => handlePhotoClick('camera')} disabled={isIdentifying}>
                                    拍照
                                </button>
                                <button type="button" className="hs-photo-action-btn" onClick={() => handlePhotoClick('album')} disabled={isIdentifying}>
                                    相册
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="hs-photo-placeholder">
                            <span className="hs-photo-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width="28" height="28">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                                    />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                                </svg>
                            </span>
                            <div className="hs-photo-text">拍照或从相册识别营养</div>
                            <div className="hs-photo-actions">
                                <button type="button" className="hs-photo-action-btn" onClick={() => handlePhotoClick('camera')} disabled={isIdentifying}>
                                    拍照
                                </button>
                                <button type="button" className="hs-photo-action-btn" onClick={() => handlePhotoClick('album')} disabled={isIdentifying}>
                                    相册
                                </button>
                            </div>
                        </div>
                    )}

                    {isIdentifying && (
                        <div className="hs-identifying-overlay hs-animate-fade-in">
                            <div className="hs-identifying-spinner" />
                            <div className="hs-identifying-text">正在识别食物...</div>
                        </div>
                    )}
                </div>

                {favorites.length > 0 && (
                    <div className="hs-nutrition-summary hs-animate-fade-in" style={{ margin: '10px 20px 0' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--hs-text-secondary)', marginBottom: 10 }}>常吃</div>
                    <div className="hs-favorites-row">
                            {favorites.slice(0, 5).map((favorite) => (
                                <div key={favorite.id} className="hs-favorite-chip-wrap">
                                    <button type="button" className="hs-favorite-chip" onClick={() => handleFavoriteFill(favorite)}>
                                        <span>{favorite.name}</span>
                                        <span className="hs-favorite-chip-count">{favorite.useCount}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="hs-favorite-chip-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void onDeleteFavorite(favorite.id);
                                        }}
                                        aria-label={`删除${favorite.name}`}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {foods.map((food, index) =>
                    editingFoodId === food.id ? (
                        <div key={food.id} className={`hs-food-item hs-animate-slide-up hs-delay-${Math.min(index + 1, 5)}`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input className="hs-food-edit-input" value={editingFoodForm.name} onChange={(event) => updateEditingFoodField('name', event.target.value)} autoFocus />
                                    {food.source === 'ai_vision' && <span className="hs-ai-badge">AI</span>}
                                    <button type="button" className="hs-food-delete" onClick={() => handleRemoveFood(food.id)}>
                                        ✕
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <div className="hs-form-input-with-unit">
                                        <input className="hs-form-input" placeholder="热量" value={editingFoodForm.calories} onChange={(event) => updateEditingFoodField('calories', event.target.value)} type="number" inputMode="decimal" style={{ height: 40, fontSize: 14 }} />
                                        <span className="hs-unit" style={{ fontSize: 11 }}>kcal</span>
                                    </div>
                                    <div className="hs-form-input-with-unit">
                                        <input className="hs-form-input" placeholder="蛋白质" value={editingFoodForm.protein} onChange={(event) => updateEditingFoodField('protein', event.target.value)} type="number" inputMode="decimal" style={{ height: 40, fontSize: 14 }} />
                                        <span className="hs-unit" style={{ fontSize: 11 }}>g</span>
                                    </div>
                                    <div className="hs-form-input-with-unit">
                                        <input className="hs-form-input" placeholder="碳水" value={editingFoodForm.carbs} onChange={(event) => updateEditingFoodField('carbs', event.target.value)} type="number" inputMode="decimal" style={{ height: 40, fontSize: 14 }} />
                                        <span className="hs-unit" style={{ fontSize: 11 }}>g</span>
                                    </div>
                                    <div className="hs-form-input-with-unit">
                                        <input className="hs-form-input" placeholder="脂肪" value={editingFoodForm.fat} onChange={(event) => updateEditingFoodField('fat', event.target.value)} type="number" inputMode="decimal" style={{ height: 40, fontSize: 14 }} />
                                        <span className="hs-unit" style={{ fontSize: 11 }}>g</span>
                                    </div>
                                    <div className="hs-form-input-with-unit">
                                        <input className="hs-form-input" placeholder="膳食纤维" value={editingFoodForm.fiber} onChange={(event) => updateEditingFoodField('fiber', event.target.value)} type="number" inputMode="decimal" style={{ height: 40, fontSize: 14 }} />
                                        <span className="hs-unit" style={{ fontSize: 11 }}>g</span>
                                    </div>
                                </div>
                                <input className="hs-form-input" placeholder="份量描述（如：约200g / 1碗）" value={editingFoodForm.portion} onChange={(event) => updateEditingFoodField('portion', event.target.value)} style={{ height: 40, fontSize: 14 }} />
                                {food.confidence && <div style={{ fontSize: 11, color: 'var(--hs-text-muted)' }}>识别置信度：{food.confidence.toUpperCase()}</div>}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" className="hs-submit-btn" style={{ flex: 1, height: 42, fontSize: 14, marginTop: 0 }} onClick={handleUpdateEditingFood}>
                                        保存
                                    </button>
                                    <button
                                        type="button"
                                        className="hs-submit-btn"
                                        style={{ flex: 0.5, height: 42, fontSize: 14, marginTop: 0, background: 'rgba(0,0,0,0.05)', color: 'var(--hs-text-secondary)', boxShadow: 'none' }}
                                        onClick={handleCancelEditingFood}
                                    >
                                        取消
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            key={food.id}
                            role="button"
                            tabIndex={0}
                            className={`hs-food-item hs-food-item-editable hs-animate-slide-up hs-delay-${Math.min(index + 1, 5)}`}
                            onClick={() => handleStartEditingFood(food)}
                            onKeyDown={(event) => openFoodEditorOnKey(event, () => handleStartEditingFood(food))}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <div className="hs-food-name">{food.name}</div>
                                    {food.source === 'ai_vision' && <span className="hs-ai-badge">AI</span>}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--hs-text-muted)', marginTop: 4, lineHeight: 1.45 }}>
                                    {food.portion ? `${food.portion} · ` : ''}
                                    蛋白 {food.protein}g · 碳水 {food.carbs}g · 脂肪 {food.fat}g{(food.fiber || 0) > 0 ? ` · 膳食纤维 ${food.fiber}g` : ''}
                                </div>
                            </div>
                            <div className="hs-food-cal">
                                {food.calories}
                                <span className="hs-meal-cal-unit"> kcal</span>
                            </div>
                            <button
                                type="button"
                                className="hs-food-delete"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveFood(food.id);
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    ),
                )}

                <div className="hs-nutrition-summary hs-animate-slide-up" style={{ margin: '8px 20px' }}>
                    <div className="hs-smart-add-row">
                        <input
                            className="hs-form-input hs-smart-add-input"
                            placeholder="食物名称 (如: 红烧肉)"
                            value={newFoodForm.name}
                            onChange={(event) => updateNewFoodField('name', event.target.value)}
                            onKeyDown={handleNewFoodKeyDown}
                            style={{ height: 44, fontSize: 16 }}
                        />
                        <button
                            type="button"
                            className="hs-submit-btn hs-smart-add-button"
                            onClick={() => void handleAddFood()}
                            disabled={!canAddFood}
                            aria-busy={isEstimating}
                        >
                            {isEstimating ? (
                                <>
                                    <span className="hs-estimating-inline-spinner" />
                                    <span>估算中</span>
                                </>
                            ) : (
                                '添加'
                            )}
                        </button>
                    </div>

                    <div className="hs-smart-add-meta">
                        <div className="hs-smart-add-tip">
                            {showCustomFields ? '手动填写热量与营养素' : '只输食物名称会由 AI 估算 1 人份营养'}
                        </div>
                        <button
                            type="button"
                            className={`hs-expand-toggle${showCustomFields ? ' expanded' : ''}`}
                            onClick={() => setShowCustomFields((previous) => !previous)}
                            aria-expanded={showCustomFields}
                        >
                            <span>{showCustomFields ? '收起自定义' : '自定义'}</span>
                            <span aria-hidden="true">{showCustomFields ? '▴' : '▾'}</span>
                        </button>
                    </div>

                    {showCustomFields && (
                        <div className="hs-smart-add-fields hs-animate-fade-in">
                            <div className="hs-smart-add-grid">
                                <div className="hs-form-input-with-unit">
                                    <input className="hs-form-input" placeholder="热量" value={newFoodForm.calories} onChange={(event) => updateNewFoodField('calories', event.target.value)} type="number" inputMode="decimal" style={{ height: 40, fontSize: 16 }} />
                                    <span className="hs-unit" style={{ fontSize: 11 }}>kcal</span>
                                </div>
                                <div className="hs-form-input-with-unit">
                                    <input className="hs-form-input" placeholder="蛋白质" value={newFoodForm.protein} onChange={(event) => updateNewFoodField('protein', event.target.value)} type="number" inputMode="decimal" style={{ height: 40, fontSize: 16 }} />
                                    <span className="hs-unit" style={{ fontSize: 11 }}>g</span>
                                </div>
                                <div className="hs-form-input-with-unit">
                                    <input className="hs-form-input" placeholder="碳水" value={newFoodForm.carbs} onChange={(event) => updateNewFoodField('carbs', event.target.value)} type="number" inputMode="decimal" style={{ height: 40, fontSize: 16 }} />
                                    <span className="hs-unit" style={{ fontSize: 11 }}>g</span>
                                </div>
                                <div className="hs-form-input-with-unit">
                                    <input className="hs-form-input" placeholder="脂肪" value={newFoodForm.fat} onChange={(event) => updateNewFoodField('fat', event.target.value)} type="number" inputMode="decimal" style={{ height: 40, fontSize: 16 }} />
                                    <span className="hs-unit" style={{ fontSize: 11 }}>g</span>
                                </div>
                                <div className="hs-form-input-with-unit">
                                    <input className="hs-form-input" placeholder="膳食纤维" value={newFoodForm.fiber} onChange={(event) => updateNewFoodField('fiber', event.target.value)} type="number" inputMode="decimal" style={{ height: 40, fontSize: 16 }} />
                                    <span className="hs-unit" style={{ fontSize: 11 }}>g</span>
                                </div>
                            </div>
                            <input className="hs-form-input" placeholder="份量描述（可选）" value={newFoodForm.portion} onChange={(event) => updateNewFoodField('portion', event.target.value)} style={{ height: 40, fontSize: 14 }} />
                            <button type="button" className="hs-expand-toggle hs-expand-toggle-secondary" onClick={resetNewFoodForm}>
                                清空
                            </button>
                        </div>
                    )}
                </div>

                {(foods.length > 0 || initialMeal) && (
                    <div className="hs-nutrition-summary hs-animate-slide-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--hs-text)' }}>营养汇总</span>
                            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--hs-text)' }}>
                                {totalCalories}
                                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--hs-text-muted)' }}> kcal</span>
                            </span>
                        </div>
                        <div className="hs-nutrition-row">
                            <span className="hs-nutrition-name">蛋白</span>
                            <div className="hs-nutrition-bar-wrap">
                                <div className="hs-nutrition-bar-fill" style={{ width: `${Math.min((totalProtein / DEFAULT_NUTRIENT_TARGETS.protein) * 100, 100)}%`, background: 'var(--hs-sage)' }} />
                            </div>
                            <span className="hs-nutrition-amount">{totalProtein}g</span>
                        </div>
                        <div className="hs-nutrition-row">
                            <span className="hs-nutrition-name">碳水</span>
                            <div className="hs-nutrition-bar-wrap">
                                <div className="hs-nutrition-bar-fill" style={{ width: `${Math.min((totalCarbs / DEFAULT_NUTRIENT_TARGETS.carbs) * 100, 100)}%`, background: 'var(--hs-clay)' }} />
                            </div>
                            <span className="hs-nutrition-amount">{totalCarbs}g</span>
                        </div>
                        <div className="hs-nutrition-row">
                            <span className="hs-nutrition-name">脂肪</span>
                            <div className="hs-nutrition-bar-wrap">
                                <div className="hs-nutrition-bar-fill" style={{ width: `${Math.min((totalFat / DEFAULT_NUTRIENT_TARGETS.fat) * 100, 100)}%`, background: 'var(--hs-rose)' }} />
                            </div>
                            <span className="hs-nutrition-amount">{totalFat}g</span>
                        </div>
                    </div>
                )}

                {initialMeal && (
                    <button type="button" className="hs-delete-record-btn" onClick={handleDelete} disabled={isSubmitting}>
                        删除这条记录
                    </button>
                )}
            </div>
        </div>
    );
};
