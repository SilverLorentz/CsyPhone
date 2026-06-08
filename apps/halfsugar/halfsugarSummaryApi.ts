/**
 * halfsugarSummaryApi — Health summary + favorites CRUD via local IndexedDB.
 * Summary generation aggregates local data then calls LLM API directly.
 * Replaces the previous backend fetch layer.
 */
import { getDB } from './storage/healthDB';
import { safeResponseJson } from '../../utils/safeApi';
import { getSecondaryApiConfig } from '../../utils/runtimeConfig';
import type {
    FavoriteFood,
    HealthSummary,
    HealthSummaryStats,
    SummaryPeriodType,
} from './types';

// ── Helper ──

function buildSummaryId(periodType: string, periodKey: string): string {
    return `summary-${periodType}-${periodKey}`;
}

// ── Summaries ──

export async function fetchSummaries(periodType?: SummaryPeriodType, limit?: number): Promise<HealthSummary[]> {
    const db = await getDB();
    let all: HealthSummary[];
    if (periodType) {
        all = (await db.getAllFromIndex('summaries', 'by-periodType', periodType)) as HealthSummary[];
    } else {
        all = (await db.getAll('summaries')) as HealthSummary[];
    }
    // Sort by endDate desc, updatedAt desc
    all.sort((a, b) => {
        if (b.endDate !== a.endDate) return b.endDate.localeCompare(a.endDate);
        return b.updatedAt - a.updatedAt;
    });
    return limit ? all.slice(0, limit) : all;
}

export async function fetchSummary(periodKey: string): Promise<HealthSummary | null> {
    const db = await getDB();
    const results = (await db.getAllFromIndex('summaries', 'by-periodKey', periodKey)) as HealthSummary[];
    return results[0] || null;
}

/**
 * Generate a summary by aggregating local data and calling LLM for the text.
 */
export async function generateSummary(opts: {
    periodType: SummaryPeriodType;
    periodKey?: string;
    charId?: string;
    charName?: string;
    apiConfig?: { baseUrl: string; apiKey: string; model: string };
}): Promise<HealthSummary> {
    const db = await getDB();
    const now = Date.now();
    const today = new Date();

    // Calculate date range
    let startDate: string;
    let endDate: string;

    if (opts.periodType === 'monthly') {
        const key = opts.periodKey || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const [y, m] = key.split('-').map(Number);
        startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else {
        // Weekly — approximate: last 7 days ending today
        const end = new Date(today);
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        startDate = fmt(start);
        endDate = fmt(end);
    }

    // Aggregate local data
    const allMeals = (await db.getAll('meals')).filter((m) => m.date >= startDate && m.date <= endDate);
    const allWeights = (await db.getAll('weights')).filter((w) => w.date >= startDate && w.date <= endDate);
    const allExercises = (await db.getAll('exercises')).filter((e) => e.date >= startDate && e.date <= endDate);
    const allSleep = (await db.getAll('sleep')).filter((s) => s.date >= startDate && s.date <= endDate);

    // Compute stats
    const recordedDays = new Set(allMeals.map((m) => m.date)).size;
    const totalCalories = allMeals.reduce((s, m) => s + (m.totalCalories || 0), 0);
    const avgCalories = recordedDays > 0 ? Math.round(totalCalories / recordedDays) : 0;

    const totalProtein = allMeals.reduce((s, m) => s + (m.totalProtein || 0), 0);
    const totalCarbs = allMeals.reduce((s, m) => s + (m.totalCarbs || 0), 0);
    const totalFat = allMeals.reduce((s, m) => s + (m.totalFat || 0), 0);
    const totalFiber = allMeals.reduce((s, m) => s + m.foods.reduce((fs, f) => fs + (Number(f.fiber) || 0), 0), 0);

    const sortedWeights = [...allWeights].sort((a, b) => a.date.localeCompare(b.date));
    const weightStart = sortedWeights[0]?.weight;
    const weightEnd = sortedWeights[sortedWeights.length - 1]?.weight;
    const weightChange = weightStart !== undefined && weightEnd !== undefined
        ? Math.round((weightEnd - weightStart) * 10) / 10
        : undefined;

    const exerciseCount = allExercises.length;
    const exerciseCalories = allExercises.reduce((s, e) => s + (e.caloriesBurned || 0), 0);

    // Find most common exercise
    const exerciseCounts: Record<string, number> = {};
    allExercises.forEach((e) => { exerciseCounts[e.exerciseLabel] = (exerciseCounts[e.exerciseLabel] || 0) + 1; });
    const topExercise = Object.entries(exerciseCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    const sleepRecordedDays = allSleep.length;
    const avgSleepMinutes = sleepRecordedDays > 0
        ? Math.round(allSleep.reduce((s, sl) => s + (sl.durationMinutes || 0), 0) / sleepRecordedDays)
        : undefined;

    const goals = await db.getAll('goals');
    const goalTargets: Record<string, number> = {};
    goals.forEach((g) => { goalTargets[g.goalType] = g.targetValue; });

    const statsJson: HealthSummaryStats = {
        periodDays: Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1),
        recordedDays,
        avgCalories,
        totalProtein: Math.round(totalProtein),
        totalCarbs: Math.round(totalCarbs),
        totalFat: Math.round(totalFat),
        totalFiber: Math.round(totalFiber),
        weightStart,
        weightEnd,
        weightChange,
        exerciseCount,
        exerciseCalories: Math.round(exerciseCalories),
        topExercise,
        avgSleepMinutes,
        sleepRecordedDays,
        goalTargets: Object.keys(goalTargets).length > 0 ? goalTargets as any : undefined,
    };

    // Generate summary text via LLM (if API configured)
    let summaryText = buildFallbackSummaryText(statsJson, opts.periodType);

    const apiConfig = opts.apiConfig || getSecondaryApiConfig();
    if (apiConfig?.apiKey && apiConfig.baseUrl && apiConfig.model) {
        try {
            summaryText = await callLlmForSummary(statsJson, opts.periodType, opts.charName, apiConfig);
        } catch {
            // Fall back to template text
        }
    }

    const periodKey = opts.periodKey || (opts.periodType === 'monthly'
        ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
        : `${today.getFullYear()}-W${String(getISOWeek(today)).padStart(2, '0')}`);

    const summary: HealthSummary = {
        id: buildSummaryId(opts.periodType, periodKey),
        periodType: opts.periodType,
        periodKey,
        startDate,
        endDate,
        statsJson,
        summaryText,
        charId: opts.charId,
        charName: opts.charName,
        createdAt: now,
        updatedAt: now,
    };

    await db.put('summaries', summary);
    return summary;
}

export async function deleteSummary(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('summaries', id);
}

// ── Favorites ──

export async function fetchFavorites(): Promise<FavoriteFood[]> {
    const db = await getDB();
    return db.getAll('favorites') as Promise<FavoriteFood[]>;
}

export async function saveFavorite(food: FavoriteFood): Promise<FavoriteFood> {
    const db = await getDB();
    await db.put('favorites', food);
    return food;
}

export async function deleteFavorite(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('favorites', id);
}

export async function incrementFavoriteUse(id: string): Promise<void> {
    const db = await getDB();
    const fav = await db.get('favorites', id);
    if (fav) {
        fav.useCount = (fav.useCount || 0) + 1;
        fav.updatedAt = Date.now();
        await db.put('favorites', fav);
    }
}

// ── LLM Summary Generation Helpers ──

function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function buildFallbackSummaryText(stats: HealthSummaryStats, periodType: SummaryPeriodType): string {
    const lines: string[] = [];
    const label = periodType === 'weekly' ? '本周' : '本月';

    lines.push(`${label}共记录了 ${stats.recordedDays} 天的饮食数据。`);

    if (stats.avgCalories > 0) {
        lines.push(`日均摄入 ${stats.avgCalories} kcal。`);
    }

    if (stats.exerciseCount > 0) {
        lines.push(`运动 ${stats.exerciseCount} 次，共消耗 ${stats.exerciseCalories} kcal。`);
        if (stats.topExercise) {
            lines.push(`最常做的运动是${stats.topExercise}。`);
        }
    }

    if (stats.avgSleepMinutes !== undefined && stats.sleepRecordedDays > 0) {
        const hours = Math.floor(stats.avgSleepMinutes / 60);
        const mins = stats.avgSleepMinutes % 60;
        lines.push(`平均睡眠 ${hours}h${mins}m。`);
    }

    if (stats.weightChange !== undefined) {
        if (stats.weightChange > 0) {
            lines.push(`体重增加了 ${stats.weightChange} kg。`);
        } else if (stats.weightChange < 0) {
            lines.push(`体重减少了 ${Math.abs(stats.weightChange)} kg。`);
        } else {
            lines.push('体重保持稳定。');
        }
    }

    return lines.join('\n');
}

async function callLlmForSummary(
    stats: HealthSummaryStats,
    periodType: SummaryPeriodType,
    charName: string | undefined,
    apiConfig: { baseUrl: string; apiKey: string; model: string },
): Promise<string> {
    const label = periodType === 'weekly' ? '周度' : '月度';
    const prompt = `你是一个温暖的女性向健康小助手。请根据以下${label}健康统计数据，写一段温暖、鼓励的中文总结（3-5句话）。
${charName ? `请以 ${charName} 的口吻来写。` : ''}
不要输出 JSON，只要纯文本。

统计数据：
${JSON.stringify(stats, null, 2)}`;

    const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({
            model: apiConfig.model,
            messages: [
                { role: 'system', content: '你是一个温暖体贴的健康助手。' },
                { role: 'user', content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 500,
            stream: false,
        }),
    });

    if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await safeResponseJson(response);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) {
        return content.trim();
    }

    throw new Error('LLM returned empty content');
}
