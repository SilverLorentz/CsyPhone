// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HalfSugarApp from './HalfSugarApp';
import { useOS } from '../../context/OSContext';
import { deleteMeal, fetchMeals, saveMeal } from './halfsugarApi';
import {
    fetchFavorites,
    fetchSummaries,
    generateSummary,
} from './halfsugarSummaryApi';
import {
    fetchExercises,
    fetchGoals,
    fetchSleep,
    fetchWeightRecords,
    saveGoal,
} from './halfsugarTrackingApi';
import { estimateFoodByName, identifyFoodFromImage } from './halfsugarVision';
import { DB } from '../../utils/db';
import type { MealRecord } from './types';

vi.mock('../../context/OSContext', () => ({
    useOS: vi.fn(),
}));

vi.mock('./halfsugarApi', () => ({
    fetchMeals: vi.fn(),
    saveMeal: vi.fn(),
    deleteMeal: vi.fn(),
}));

vi.mock('./halfsugarSummaryApi', () => ({
    fetchSummaries: vi.fn(),
    fetchSummary: vi.fn(),
    generateSummary: vi.fn(),
    deleteSummary: vi.fn(),
    fetchFavorites: vi.fn(),
    saveFavorite: vi.fn(),
    deleteFavorite: vi.fn(),
    incrementFavoriteUse: vi.fn(),
}));

vi.mock('./halfsugarTrackingApi', () => ({
    fetchWeightRecords: vi.fn(),
    saveWeight: vi.fn(),
    deleteWeight: vi.fn(),
    fetchSleep: vi.fn(),
    saveSleep: vi.fn(),
    deleteSleep: vi.fn(),
    fetchExercises: vi.fn(),
    saveExercise: vi.fn(),
    deleteExercise: vi.fn(),
    fetchGoals: vi.fn(),
    saveGoal: vi.fn(),
    deleteGoal: vi.fn(),
}));

vi.mock('./halfsugarVision', () => ({
    estimateFoodByName: vi.fn(),
    identifyFoodFromImage: vi.fn(),
}));

vi.mock('../../utils/db', () => ({
    DB: {
        saveMessage: vi.fn(),
    },
}));

const mockedUseOS = vi.mocked(useOS);
const mockedFetchMeals = vi.mocked(fetchMeals);
const mockedSaveMeal = vi.mocked(saveMeal);
const mockedDeleteMeal = vi.mocked(deleteMeal);
const mockedFetchSummaries = vi.mocked(fetchSummaries);
const mockedFetchFavorites = vi.mocked(fetchFavorites);
const mockedGenerateSummary = vi.mocked(generateSummary);
const mockedFetchWeightRecords = vi.mocked(fetchWeightRecords);
const mockedFetchExercises = vi.mocked(fetchExercises);
const mockedFetchSleep = vi.mocked(fetchSleep);
const mockedFetchGoals = vi.mocked(fetchGoals);
const mockedSaveGoal = vi.mocked(saveGoal);
const mockedEstimateFoodByName = vi.mocked(estimateFoodByName);
const mockedIdentifyFoodFromImage = vi.mocked(identifyFoodFromImage);
const mockedSaveMessage = vi.mocked(DB.saveMessage);
const defaultApiConfig = {
    apiKey: 'test-key',
    baseUrl: 'https://example.com/v1',
    model: 'gpt-test',
};

function getTodayKey(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function createMeal(overrides: Partial<MealRecord> = {}): MealRecord {
    return {
        id: 'meal-1',
        date: '2026-04-14',
        type: 'breakfast',
        foods: [
            {
                id: 'food-1',
                name: '燕麦杯',
                calories: 220,
                protein: 12,
                carbs: 28,
                fat: 6,
            },
        ],
        totalCalories: 220,
        totalProtein: 12,
        totalCarbs: 28,
        totalFat: 6,
        source: 'manual',
        createdAt: 1713060000000,
        updatedAt: 1713060000000,
        ...overrides,
    };
}

async function clickOnboardingSubmit(): Promise<void> {
    const submitButton = screen.getByText('好了，开始记录') as HTMLButtonElement;
    await waitFor(() => {
        expect(submitButton.disabled).toBe(false);
    });
    fireEvent.click(submitButton);
}

describe('HalfSugarApp', () => {
    const addToast = vi.fn();
    const closeApp = vi.fn();
    const updateUserProfile = vi.fn();

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    beforeEach(() => {
        vi.clearAllMocks();

        mockedFetchMeals.mockResolvedValue([]);
        mockedSaveMeal.mockImplementation(async (meal) => meal);
        mockedDeleteMeal.mockResolvedValue();
        mockedFetchWeightRecords.mockResolvedValue([]);
        mockedFetchExercises.mockResolvedValue([]);
        mockedFetchSleep.mockResolvedValue(null);
        mockedFetchGoals.mockResolvedValue([]);
        mockedFetchSummaries.mockResolvedValue([]);
        mockedFetchFavorites.mockResolvedValue([]);
        mockedSaveMessage.mockResolvedValue(1);
        mockedGenerateSummary.mockResolvedValue({
            id: 'summary-1',
            periodType: 'weekly',
            periodKey: '2026-W16',
            startDate: '2026-04-13',
            endDate: '2026-04-19',
            statsJson: {
                periodDays: 7,
                recordedDays: 2,
                avgCalories: 480,
                totalProtein: 62,
                totalCarbs: 45,
                totalFat: 18,
                totalFiber: 9,
                exerciseCount: 2,
                exerciseCalories: 420,
                avgSleepMinutes: 460,
                sleepRecordedDays: 2,
            },
            summaryText: '这周整体节奏很稳，继续保持就很好。',
            charId: 'char-1',
            charName: '糯米',
            createdAt: 1713060000000,
            updatedAt: 1713060000000,
        });
        mockedSaveGoal.mockImplementation(async (goal) => goal);
        mockedEstimateFoodByName.mockResolvedValue({
            foods: [],
            mealDescription: '',
            totalCalories: 0,
            source: 'ai_vision',
        });
        mockedIdentifyFoodFromImage.mockResolvedValue({
            foods: [],
            mealDescription: '',
            totalCalories: 0,
            source: 'ai_vision',
        });
        mockedUseOS.mockReturnValue({
            addToast,
            closeApp,
            updateUserProfile,
            apiConfig: defaultApiConfig,
            activeCharacterId: 'char-1',
            characters: [{ id: 'char-1', name: '糯米' }],
            userProfile: {
                name: 'User',
                avatar: 'avatar.png',
                bio: 'bio',
            },
        } as any);
    });

    it('shows onboarding on first open when health setup is missing', () => {
        render(<HalfSugarApp />);

        expect(screen.getByText('关于我')).toBeTruthy();
        expect(screen.getByText('好了，开始记录')).toBeTruthy();
        expect(mockedFetchMeals).not.toHaveBeenCalled();
    });

    it('persists onboarding data into user profile when setup completes', async () => {
        render(<HalfSugarApp />);

        fireEvent.click(screen.getByRole('button', { name: /男/ }));
        fireEvent.change(screen.getByPlaceholderText('170'), { target: { value: '170' } });
        fireEvent.change(screen.getAllByPlaceholderText('65')[0], { target: { value: '70' } });
        fireEvent.change(screen.getByPlaceholderText('1998'), { target: { value: '2000' } });
        await clickOnboardingSubmit();

        expect(updateUserProfile).toHaveBeenCalledWith(expect.objectContaining({
            healthGender: 'male',
            healthHeight: 170,
            healthWeight: 70,
            healthBirthYear: 2000,
            healthSetupDone: true,
            healthShareBodyInfo: false,
            healthActivityLevel: 'light',
        }));
        await waitFor(() => {
            expect(addToast).toHaveBeenCalledWith('基础信息与目标已保存', 'success');
        });

        expect(await screen.findByText('摄入 kcal', {}, { timeout: 5000 })).toBeTruthy();
    }, 15000);

    it('keeps body impression sharing opt-in only and persists it when the switch is enabled', async () => {
        render(<HalfSugarApp />);

        fireEvent.click(screen.getByRole('button', { name: /女/ }));
        fireEvent.change(screen.getByPlaceholderText('170'), { target: { value: '165' } });
        fireEvent.change(screen.getAllByPlaceholderText('65')[0], { target: { value: '55' } });
        fireEvent.change(screen.getByPlaceholderText('1998'), { target: { value: '1999' } });
        fireEvent.click(screen.getByLabelText('让角色感知健康数据'));
        await clickOnboardingSubmit();

        await waitFor(() => {
            expect(updateUserProfile).toHaveBeenCalledWith(expect.objectContaining({
                healthGender: 'female',
                healthHeight: 165,
                healthWeight: 55,
                healthBirthYear: 1999,
                healthSetupDone: true,
                healthShareBodyInfo: true,
                healthActivityLevel: 'light',
            }));
        });
    }, 15000);

    it('computes the calorie target from BMR instead of using a hardcoded default', async () => {
        const currentYear = new Date().getFullYear();
        const expectedTarget = Math.round((10 * 70 + 6.25 * 170 - 5 * (currentYear - 2000) + 5) * 1.375);
        const consumed = 700;
        mockedFetchMeals.mockResolvedValue([
            createMeal({
                foods: [{ id: 'food-target', name: '测试餐', calories: consumed, protein: 20, carbs: 80, fat: 20 }],
                totalCalories: consumed,
                totalProtein: 20,
                totalCarbs: 80,
                totalFat: 20,
            }),
        ]);

        mockedUseOS.mockReturnValue({
            addToast,
            closeApp,
            updateUserProfile,
            apiConfig: defaultApiConfig,
            activeCharacterId: 'char-1',
            characters: [{ id: 'char-1', name: '糯米' }],
            userProfile: {
                name: 'User',
                avatar: 'avatar.png',
                bio: 'bio',
                healthGender: 'male',
                healthHeight: 170,
                healthWeight: 70,
                healthBirthYear: 2000,
                healthSetupDone: true,
            },
        } as any);

        render(<HalfSugarApp />);

        await waitFor(() => {
            expect(mockedFetchMeals).toHaveBeenCalledWith(getTodayKey());
        });
        expect(await screen.findByText('摄入 kcal', {}, { timeout: 5000 })).toBeTruthy();
        await waitFor(() => {
            const intakeCircle = document.querySelector<SVGCircleElement>('.hs-ring-progress.hs-ring-intake');
            expect(intakeCircle).toBeTruthy();
            const outerCircumference = 2 * Math.PI * 70;
            const expectedOffset = outerCircumference * (1 - consumed / expectedTarget);
            expect(Number(intakeCircle?.getAttribute('stroke-dashoffset'))).toBeCloseTo(expectedOffset, 3);
        });
    }, 15000);

    it('renders multiple same-type meal records separately after loading today meals', async () => {
        mockedUseOS.mockReturnValue({
            addToast,
            closeApp,
            updateUserProfile,
            apiConfig: defaultApiConfig,
            activeCharacterId: 'char-1',
            characters: [{ id: 'char-1', name: '糯米' }],
            userProfile: {
                name: 'User',
                avatar: 'avatar.png',
                bio: 'bio',
                healthGender: 'female',
                healthHeight: 165,
                healthWeight: 55,
                healthBirthYear: 1998,
                healthSetupDone: true,
            },
        } as any);
        mockedFetchMeals.mockResolvedValue([
            createMeal({
                id: 'meal-breakfast-1',
                foods: [{ id: 'food-a', name: '牛奶', calories: 120, protein: 7, carbs: 10, fat: 6 }],
                totalCalories: 120,
                totalProtein: 7,
                totalCarbs: 10,
                totalFat: 6,
                createdAt: 1713061200000,
                updatedAt: 1713061200000,
            }),
            createMeal({
                id: 'meal-breakfast-2',
                foods: [{ id: 'food-b', name: '吐司', calories: 180, protein: 6, carbs: 26, fat: 5 }],
                totalCalories: 180,
                totalProtein: 6,
                totalCarbs: 26,
                totalFat: 5,
                createdAt: 1713064800000,
                updatedAt: 1713064800000,
            }),
            createMeal({
                id: 'meal-lunch-1',
                type: 'lunch',
                foods: [{ id: 'food-c', name: '鸡胸肉沙拉', calories: 360, protein: 32, carbs: 18, fat: 12 }],
                totalCalories: 360,
                totalProtein: 32,
                totalCarbs: 18,
                totalFat: 12,
                createdAt: 1713072000000,
                updatedAt: 1713072000000,
            }),
        ]);

        render(<HalfSugarApp />);

        fireEvent.click(screen.getByLabelText('饮食记录'));

        await waitFor(() => {
            expect(screen.getByText(/吐司/)).toBeTruthy();
        }, { timeout: 5000 });
        expect(screen.getByText(/牛奶/)).toBeTruthy();
        expect(screen.getByText(/吐司/)).toBeTruthy();
        expect(screen.getAllByText('再记一份')).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: /午餐/ }));
        await waitFor(() => {
            expect(screen.getByText(/鸡胸肉沙拉/)).toBeTruthy();
        });
        expect(screen.getByText(/鸡胸肉沙拉/)).toBeTruthy();
    }, 15000);

    it('shows an error toast when meal loading fails', async () => {
        mockedUseOS.mockReturnValue({
            addToast,
            closeApp,
            updateUserProfile,
            apiConfig: defaultApiConfig,
            activeCharacterId: 'char-1',
            characters: [{ id: 'char-1', name: '糯米' }],
            userProfile: {
                name: 'User',
                avatar: 'avatar.png',
                bio: 'bio',
                healthGender: 'female',
                healthHeight: 160,
                healthWeight: 50,
                healthBirthYear: 1999,
                healthSetupDone: true,
            },
        } as any);
        mockedFetchMeals.mockRejectedValue(new Error('网络超时'));

        render(<HalfSugarApp />);

        await waitFor(() => {
            expect(addToast).toHaveBeenCalledWith('加载餐食失败：网络超时', 'error');
        });
    }, 15000);

    it('shows nutrient recommendations when macros are far below target', async () => {
        mockedUseOS.mockReturnValue({
            addToast,
            closeApp,
            updateUserProfile,
            apiConfig: defaultApiConfig,
            activeCharacterId: 'char-1',
            characters: [{ id: 'char-1', name: '糯米' }],
            userProfile: {
                name: 'User',
                avatar: 'avatar.png',
                bio: 'bio',
                healthGender: 'female',
                healthHeight: 165,
                healthWeight: 55,
                healthBirthYear: 1998,
                healthSetupDone: true,
            },
        } as any);
        mockedFetchMeals.mockResolvedValue([
            createMeal({
                foods: [{ id: 'food-gap', name: '苹果', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4 }],
                totalCalories: 52,
                totalProtein: 0.3,
                totalCarbs: 14,
                totalFat: 0.2,
            }),
        ]);

        render(<HalfSugarApp />);

        await waitFor(() => {
            expect(screen.getByText('今日食谱灵感')).toBeTruthy();
        });
        expect(screen.getAllByText(/今天可以来点补充/).length).toBeGreaterThan(0);
        expect(screen.getByText('蛋白质')).toBeTruthy();
    }, 15000);

    it('estimates nutrition from a food name and keeps manual fields behind the custom toggle', async () => {
        mockedUseOS.mockReturnValue({
            addToast,
            closeApp,
            updateUserProfile,
            apiConfig: defaultApiConfig,
            activeCharacterId: 'char-1',
            characters: [{ id: 'char-1', name: '糯米' }],
            userProfile: {
                name: 'User',
                avatar: 'avatar.png',
                bio: 'bio',
                healthGender: 'female',
                healthHeight: 165,
                healthWeight: 55,
                healthBirthYear: 1998,
                healthSetupDone: true,
            },
        } as any);
        mockedEstimateFoodByName.mockResolvedValue({
            foods: [
                {
                    id: 'food-ai-name-1',
                    name: '红烧肉',
                    calories: 480,
                    protein: 22,
                    carbs: 14,
                    fat: 36,
                    fiber: 1,
                    portion: '约1份',
                    source: 'ai_vision',
                    confidence: 'medium',
                },
            ],
            mealDescription: 'AI 估算完成',
            totalCalories: 480,
            source: 'ai_vision',
        });

        render(<HalfSugarApp />);

        await waitFor(() => {
            expect(mockedFetchMeals).toHaveBeenCalledWith(getTodayKey());
        });

        fireEvent.click(screen.getByLabelText('饮食记录'));
        fireEvent.click(await screen.findByText(/记录早餐/, {}, { timeout: 5000 }));

        expect(screen.queryByPlaceholderText('热量')).toBeNull();
        fireEvent.click(screen.getByText('自定义'));
        expect(screen.getByPlaceholderText('热量')).toBeTruthy();

        fireEvent.change(screen.getByPlaceholderText('食物名称 (如: 红烧肉)'), {
            target: { value: '酸奶' },
        });
        fireEvent.change(screen.getByPlaceholderText('热量'), {
            target: { value: '120' },
        });
        fireEvent.click(screen.getByText('添加'));

        expect(mockedEstimateFoodByName).not.toHaveBeenCalled();
        expect(screen.getByText('酸奶')).toBeTruthy();

        fireEvent.change(screen.getByPlaceholderText('食物名称 (如: 红烧肉)'), {
            target: { value: '红烧肉' },
        });
        fireEvent.click(screen.getByText('添加'));

        await waitFor(() => {
            expect(mockedEstimateFoodByName).toHaveBeenCalledWith('红烧肉', defaultApiConfig);
        });
        expect(screen.getByText('红烧肉')).toBeTruthy();
        expect(screen.getByText('AI')).toBeTruthy();
    }, 15000);

    it('offers separate camera and album inputs for photo recognition', async () => {
        const OriginalFileReader = globalThis.FileReader;
        class MockFileReader {
            result: string | ArrayBuffer | null = 'data:image/jpeg;base64,YWxidW0=';
            onload: null | (() => void) = null;
            onerror: null | (() => void) = null;

            readAsDataURL(): void {
                this.onload?.();
            }
        }
        vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);

        mockedUseOS.mockReturnValue({
            addToast,
            closeApp,
            updateUserProfile,
            apiConfig: defaultApiConfig,
            activeCharacterId: 'char-1',
            characters: [{ id: 'char-1', name: '糯米' }],
            userProfile: {
                name: 'User',
                avatar: 'avatar.png',
                bio: 'bio',
                healthGender: 'female',
                healthHeight: 165,
                healthWeight: 55,
                healthBirthYear: 1998,
                healthSetupDone: true,
            },
        } as any);
        mockedIdentifyFoodFromImage.mockResolvedValue({
            foods: [
                {
                    id: 'food-ai-album-1',
                    name: '鸡蛋羹',
                    calories: 140,
                    protein: 11,
                    carbs: 4,
                    fat: 8,
                    fiber: 0,
                    portion: '1碗',
                    source: 'ai_vision',
                    confidence: 'high',
                },
            ],
            mealDescription: '相册识别完成',
            totalCalories: 140,
            source: 'ai_vision',
        });

        render(<HalfSugarApp />);

        await waitFor(() => {
            expect(mockedFetchMeals).toHaveBeenCalledWith(getTodayKey());
        });

        fireEvent.click(screen.getByLabelText('饮食记录'));
        fireEvent.click(await screen.findByText(/记录早餐/, {}, { timeout: 5000 }));
        expect(screen.getByText('拍照')).toBeTruthy();
        expect(screen.getByText('相册')).toBeTruthy();

        const fileInputs = document.querySelectorAll('input[type="file"]');
        expect(fileInputs).toHaveLength(2);
        expect(fileInputs[0]?.getAttribute('capture')).toBe('environment');
        expect(fileInputs[1]?.getAttribute('capture')).toBeNull();

        fireEvent.change(fileInputs[1] as HTMLInputElement, {
            target: {
                files: [new File(['album'], 'album.jpg', { type: 'image/jpeg' })],
            },
        });

        await waitFor(() => {
            expect(mockedIdentifyFoodFromImage).toHaveBeenCalled();
        });
        expect(screen.getByText('鸡蛋羹')).toBeTruthy();

        vi.stubGlobal('FileReader', OriginalFileReader);
    }, 15000);

    it('appends AI identified foods after selecting a meal photo', async () => {
        const OriginalFileReader = globalThis.FileReader;
        class MockFileReader {
            result: string | ArrayBuffer | null = 'data:image/jpeg;base64,bWVhbA==';
            onload: null | (() => void) = null;
            onerror: null | (() => void) = null;

            readAsDataURL(): void {
                this.onload?.();
            }
        }
        vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);

        mockedUseOS.mockReturnValue({
            addToast,
            closeApp,
            updateUserProfile,
            apiConfig: defaultApiConfig,
            activeCharacterId: 'char-1',
            characters: [{ id: 'char-1', name: '糯米' }],
            userProfile: {
                name: 'User',
                avatar: 'avatar.png',
                bio: 'bio',
                healthGender: 'female',
                healthHeight: 165,
                healthWeight: 55,
                healthBirthYear: 1998,
                healthSetupDone: true,
            },
        } as any);
        mockedIdentifyFoodFromImage.mockResolvedValue({
            foods: [
                {
                    id: 'food-ai-1',
                    name: '鸡胸肉',
                    calories: 165,
                    protein: 31,
                    carbs: 0,
                    fat: 4,
                    fiber: 0,
                    portion: '约150g',
                    source: 'ai_vision',
                    confidence: 'high',
                },
            ],
            mealDescription: '识别完成',
            totalCalories: 165,
            source: 'ai_vision',
        });

        render(<HalfSugarApp />);

        await waitFor(() => {
            expect(mockedFetchMeals).toHaveBeenCalledWith(getTodayKey());
        });

        fireEvent.click(screen.getByLabelText('饮食记录'));
        fireEvent.click(await screen.findByText(/记录早餐/, {}, { timeout: 5000 }));
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
        expect(fileInput).toBeTruthy();
        fireEvent.change(fileInput!, {
            target: {
                files: [new File(['meal'], 'meal.jpg', { type: 'image/jpeg' })],
            },
        });

        await waitFor(() => {
            expect(mockedIdentifyFoodFromImage).toHaveBeenCalled();
        });
        expect(screen.getByText('鸡胸肉')).toBeTruthy();
        expect(screen.getByText('AI')).toBeTruthy();

        vi.stubGlobal('FileReader', OriginalFileReader);
    }, 15000);

    it('injects a hidden health signal after saving a meal when sharing is enabled', async () => {
        mockedUseOS.mockReturnValue({
            addToast,
            closeApp,
            updateUserProfile,
            apiConfig: defaultApiConfig,
            activeCharacterId: 'char-1',
            characters: [{ id: 'char-1', name: '糯米' }],
            userProfile: {
                name: 'User',
                avatar: 'avatar.png',
                bio: 'bio',
                healthGender: 'female',
                healthHeight: 165,
                healthWeight: 55,
                healthBirthYear: 1998,
                healthSetupDone: true,
                healthShareBodyInfo: true,
            },
        } as any);

        render(<HalfSugarApp />);

        await waitFor(() => {
            expect(mockedFetchMeals).toHaveBeenCalledWith(getTodayKey());
        });

        fireEvent.click(screen.getByLabelText('饮食记录'));
        fireEvent.click(await screen.findByText(/记录早餐/, {}, { timeout: 5000 }));
        fireEvent.click(screen.getByText('自定义'));
        fireEvent.change(screen.getByPlaceholderText('食物名称 (如: 红烧肉)'), {
            target: { value: '酸奶' },
        });
        fireEvent.change(screen.getByPlaceholderText('热量'), {
            target: { value: '120' },
        });
        fireEvent.click(screen.getByText('添加'));

        await waitFor(() => {
            expect(screen.getByText('酸奶')).toBeTruthy();
        });

        const headerButtons = document.querySelectorAll<HTMLButtonElement>('.hs-header .hs-back-btn');
        const saveButton = headerButtons[headerButtons.length - 1];
        expect(saveButton).toBeTruthy();
        await waitFor(() => {
            expect(saveButton.disabled).toBe(false);
        });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(mockedSaveMeal).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(mockedSaveMessage).toHaveBeenCalledWith(expect.objectContaining({
                charId: 'char-1',
                role: 'system',
                type: 'health_signal',
                content: '[生活感知] TA早餐吃了酸奶（你自然地注意到了，但不需要报数字，像关心TA的人一样自然回应就好）',
            }));
        });
    }, 15000);

    it('renders the latest summary preview and generates a weekly summary with active character context', async () => {
        mockedUseOS.mockReturnValue({
            addToast,
            closeApp,
            updateUserProfile,
            apiConfig: defaultApiConfig,
            activeCharacterId: 'char-1',
            characters: [{ id: 'char-1', name: '糯米' }],
            userProfile: {
                name: 'User',
                avatar: 'avatar.png',
                bio: 'bio',
                healthGender: 'female',
                healthHeight: 165,
                healthWeight: 55,
                healthBirthYear: 1998,
                healthSetupDone: true,
            },
        } as any);
        mockedFetchSummaries.mockResolvedValue([
            {
                id: 'summary-existing',
                periodType: 'weekly',
                periodKey: '2026-W15',
                startDate: '2026-04-06',
                endDate: '2026-04-12',
                statsJson: {
                    periodDays: 7,
                    recordedDays: 3,
                    avgCalories: 420,
                    totalProtein: 50,
                    totalCarbs: 40,
                    totalFat: 18,
                    totalFiber: 8,
                    exerciseCount: 1,
                    exerciseCalories: 180,
                    sleepRecordedDays: 2,
                },
                summaryText: '上周的记录已经很扎实啦。',
                createdAt: 1712455200000,
                updatedAt: 1712455200000,
            },
        ] as any);

        render(<HalfSugarApp />);

        fireEvent.click(screen.getByLabelText('趋势'));

        await waitFor(() => {
            expect(screen.getByText(/上周的记录已经很扎实啦/)).toBeTruthy();
        });

        fireEvent.click(screen.getByText('生成周报'));

        await waitFor(() => {
            expect(mockedGenerateSummary).toHaveBeenCalledWith(expect.objectContaining({
                periodType: 'weekly',
                charId: 'char-1',
                charName: '糯米',
                apiConfig: defaultApiConfig,
            }));
        });
    }, 15000);
});
