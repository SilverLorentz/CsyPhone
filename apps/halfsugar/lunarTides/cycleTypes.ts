/**
 * Lunar Tides — Type definitions for menstrual cycle tracking.
 */

/** A single period log entry */
export interface PeriodLog {
    id: string;
    startDate: string;        // YYYY-MM-DD
    endDate?: string;         // YYYY-MM-DD — undefined if still ongoing
    flowIntensity?: FlowIntensity;   // Legacy: overall flow (kept for backward compat)
    dailyFlow?: Record<string, FlowIntensity>; // Per-day flow, key = YYYY-MM-DD
    symptoms?: string[];
    notes?: string;
    isOutlier: boolean;       // Flagged by 2σ outlier detection
    createdAt: number;
    updatedAt: number;
}

export type FlowIntensity = 'light' | 'medium' | 'heavy';

/** A medication dose entry */
export interface MedicationLog {
    id: string;
    date: string;             // YYYY-MM-DD
    time: string;             // HH:MM
    name: string;             // Medication key, e.g. 'ibuprofen'
    dosageMg: number;
    createdAt: number;
}

/** Medication definition with safety limits */
export interface MedicationDef {
    key: string;
    label: string;
    emoji: string;
    defaultDosageMg: number;
    maxDailyMg: number;
    warningThresholdMg: number; // Typically ~80% of maxDailyMg
}

/** Common OTC pain medications for menstrual cramps */
export const MEDICATIONS: MedicationDef[] = [
    {
        key: 'ibuprofen',
        label: '布洛芬',
        emoji: '💊',
        defaultDosageMg: 400,
        maxDailyMg: 1200,
        warningThresholdMg: 1000,
    },
    {
        key: 'acetaminophen',
        label: '对乙酰氨基酚',
        emoji: '💊',
        defaultDosageMg: 500,
        maxDailyMg: 2000,
        warningThresholdMg: 1500,
    },
    {
        key: 'naproxen',
        label: '萘普生',
        emoji: '💊',
        defaultDosageMg: 250,
        maxDailyMg: 750,
        warningThresholdMg: 600,
    },
];

export const MEDICATION_MAP = new Map(MEDICATIONS.map((m) => [m.key, m]));

/** Cycle prediction result */
export interface CyclePrediction {
    nextPeriodStart: string;      // YYYY-MM-DD
    predictedCycleLength: number; // days
    confidence: 'high' | 'medium' | 'low';
    averagePeriodDuration: number; // days
    nextPeriodEnd: string;        // YYYY-MM-DD (predicted)
}

/** Annual statistics for a single month */
export interface MonthCycleStat {
    month: string;      // e.g. '2026-01'
    monthLabel: string;  // e.g. '1月'
    cycleLength?: number;
    periodDuration?: number;
    isAnomaly: boolean;  // Variation > 7 days from average
}

/** Flow intensity display helpers */
export const FLOW_LABELS: Record<FlowIntensity, { label: string; emoji: string }> = {
    light: { label: '少量', emoji: '🩸' },
    medium: { label: '适中', emoji: '🩸🩸' },
    heavy: { label: '量多', emoji: '🩸🩸🩸' },
};

/** Cycle phase (for science tips) */
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export interface ScienceTip {
    id: string;
    phase: CyclePhase;
    title: string;
    content: string;
    emoji: string;
}
