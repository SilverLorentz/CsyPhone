/**
 * Cycle Predictor — Weighted average cycle prediction + outlier detection.
 *
 * Algorithm:
 *   - Weight each past cycle by recency: most recent gets weight N, then N-1, etc.
 *   - Compute weighted average cycle length.
 *   - Outlier detection: cycles beyond 2× standard deviation are flagged.
 *   - Prediction confidence based on data quantity and consistency.
 */
import type { CyclePrediction, PeriodLog } from './cycleTypes';

/** Minimum data points for any prediction */
const MIN_CYCLES_FOR_PREDICTION = 2;

/** Default cycle / period duration when no data */
const DEFAULT_CYCLE_LENGTH = 28;
const DEFAULT_PERIOD_DURATION = 5;

/**
 * Compute completed cycle lengths from a sorted (by startDate asc) list of period logs.
 * A "cycle" is the gap between two consecutive period start dates.
 */
export function computeCycleLengths(logs: PeriodLog[]): { length: number; log: PeriodLog }[] {
    const sorted = [...logs]
        .filter((l) => !l.isOutlier)
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

    const cycles: { length: number; log: PeriodLog }[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1].startDate);
        const curr = new Date(sorted[i].startDate);
        const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
        if (diffDays > 0 && diffDays < 90) {
            cycles.push({ length: diffDays, log: sorted[i] });
        }
    }
    return cycles;
}

/**
 * Weighted average — recent cycles get higher weight.
 * weights: [1, 2, 3, ..., N] for N cycles (most recent = N)
 */
export function weightedAverage(values: number[]): number {
    if (values.length === 0) return DEFAULT_CYCLE_LENGTH;
    let weightSum = 0;
    let valueSum = 0;
    values.forEach((v, i) => {
        const w = i + 1;
        weightSum += w;
        valueSum += v * w;
    });
    return Math.round((valueSum / weightSum) * 10) / 10;
}

/**
 * Standard deviation of an array of numbers.
 */
function stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * Check if a given cycle length is an outlier (> 2σ from mean).
 * Returns true if it should be flagged.
 */
export function isOutlierCycle(cycleLength: number, allLengths: number[]): boolean {
    if (allLengths.length < 3) return false;
    const mean = allLengths.reduce((s, v) => s + v, 0) / allLengths.length;
    const sd = stdDev(allLengths);
    if (sd === 0) return false;
    return Math.abs(cycleLength - mean) > 2 * sd;
}

/**
 * Average period duration from logs that have both start and end dates.
 */
export function averagePeriodDuration(logs: PeriodLog[]): number {
    const completed = logs.filter((l) => l.endDate && !l.isOutlier);
    if (completed.length === 0) return DEFAULT_PERIOD_DURATION;

    const durations = completed.map((l) => {
        const start = new Date(l.startDate);
        const end = new Date(l.endDate!);
        return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    });

    return Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
}

/**
 * Predict the next period start date and cycle details.
 */
export function predictNextPeriod(logs: PeriodLog[]): CyclePrediction | null {
    const validLogs = logs.filter((l) => !l.isOutlier);
    if (validLogs.length === 0) return null;

    const sorted = [...validLogs].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const cycles = computeCycleLengths(sorted);

    if (cycles.length < MIN_CYCLES_FOR_PREDICTION) {
        // Not enough data — use default
        const lastLog = sorted[sorted.length - 1];
        const nextStart = addDays(lastLog.startDate, DEFAULT_CYCLE_LENGTH);
        const avgDuration = averagePeriodDuration(sorted);
        return {
            nextPeriodStart: nextStart,
            predictedCycleLength: DEFAULT_CYCLE_LENGTH,
            confidence: 'low',
            averagePeriodDuration: avgDuration,
            nextPeriodEnd: addDays(nextStart, avgDuration - 1),
        };
    }

    const lengths = cycles.map((c) => c.length);
    const predicted = weightedAverage(lengths);
    const sd = stdDev(lengths);
    const avgDuration = averagePeriodDuration(sorted);

    // Confidence based on consistency
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (cycles.length >= 6 && sd < 3) confidence = 'high';
    if (cycles.length < 3 || sd > 7) confidence = 'low';

    const lastLog = sorted[sorted.length - 1];
    const predictedLength = Math.round(predicted);
    const nextStart = addDays(lastLog.startDate, predictedLength);

    return {
        nextPeriodStart: nextStart,
        predictedCycleLength: predictedLength,
        confidence,
        averagePeriodDuration: avgDuration,
        nextPeriodEnd: addDays(nextStart, avgDuration - 1),
    };
}

/**
 * Add days to a YYYY-MM-DD date string.
 */
export function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return formatDate(d);
}

function formatDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Compute days remaining until predicted period.
 */
export function daysUntil(dateStr: string): number {
    const target = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

/**
 * Determine current cycle phase based on last period and prediction.
 */
export function getCurrentPhase(
    lastPeriod: PeriodLog | undefined,
    prediction: CyclePrediction | null,
): { phase: 'menstrual' | 'follicular' | 'ovulation' | 'luteal'; dayInCycle: number } {
    if (!lastPeriod) return { phase: 'follicular', dayInCycle: 1 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(lastPeriod.startDate);
    start.setHours(0, 0, 0, 0);
    const dayInCycle = Math.max(1, Math.ceil((today.getTime() - start.getTime()) / 86400000) + 1);

    const cycleLen = prediction?.predictedCycleLength || DEFAULT_CYCLE_LENGTH;
    const periodLen = prediction?.averagePeriodDuration || DEFAULT_PERIOD_DURATION;

    if (dayInCycle <= periodLen) return { phase: 'menstrual', dayInCycle };
    if (dayInCycle <= Math.floor(cycleLen * 0.45)) return { phase: 'follicular', dayInCycle };
    if (dayInCycle <= Math.floor(cycleLen * 0.55)) return { phase: 'ovulation', dayInCycle };
    return { phase: 'luteal', dayInCycle };
}
