/**
 * Pain Medication State Machine
 *
 * Core behavior:
 *   - Track 24h rolling accumulated dosage per medication type.
 *   - On FIRST crossing of the warning threshold within a session: fire alert callback.
 *   - After alert has fired for that session: silently log, mark as over-threshold.
 *   - Reset session alert state only on page reload or explicit reset.
 */
import type { MedicationDef, MedicationLog } from './cycleTypes';
import { MEDICATION_MAP } from './cycleTypes';

/** Session state — tracks whether we've already alerted for each medication */
const sessionAlertedSet = new Set<string>();

/**
 * Reset the session alert state (call on tab mount or date change).
 */
export function resetSessionAlerts(): void {
    sessionAlertedSet.clear();
}

/**
 * Compute the rolling 24h accumulated dosage for a medication.
 */
export function compute24hAccumulated(
    medKey: string,
    logs: MedicationLog[],
    now = Date.now(),
): number {
    const cutoff = now - 24 * 60 * 60 * 1000;

    return logs
        .filter((log) => {
            if (log.name !== medKey) return false;
            const logTime = new Date(`${log.date}T${log.time}`).getTime();
            return logTime >= cutoff && logTime <= now;
        })
        .reduce((sum, log) => sum + log.dosageMg, 0);
}

export interface DosageCheckResult {
    /** Total mg consumed in the past 24h */
    accumulated: number;
    /** Whether we've crossed the warning threshold */
    isOverThreshold: boolean;
    /** Whether THIS check is the FIRST time crossing (should trigger alert) */
    shouldAlert: boolean;
    /** Medication definition for display */
    medDef: MedicationDef | undefined;
    /** Percentage of max daily dosage used */
    percentOfMax: number;
}

/**
 * Check dosage after adding a new entry.
 * Returns whether to show alert and current accumulated state.
 */
export function checkDosageAfterAdd(
    medKey: string,
    logs: MedicationLog[],
    now = Date.now(),
): DosageCheckResult {
    const medDef = MEDICATION_MAP.get(medKey);
    const accumulated = compute24hAccumulated(medKey, logs, now);
    const maxDaily = medDef?.warningThresholdMg || 1000;

    const isOverThreshold = accumulated >= maxDaily;
    const alreadyAlerted = sessionAlertedSet.has(medKey);
    const shouldAlert = isOverThreshold && !alreadyAlerted;

    if (shouldAlert) {
        sessionAlertedSet.add(medKey);
    }

    return {
        accumulated,
        isOverThreshold,
        shouldAlert,
        medDef,
        percentOfMax: medDef ? Math.round((accumulated / medDef.maxDailyMg) * 100) : 0,
    };
}

/**
 * Check if a medication log entry is over the threshold (for timeline red markers).
 */
export function isLogOverThreshold(
    log: MedicationLog,
    allLogs: MedicationLog[],
): boolean {
    const medDef = MEDICATION_MAP.get(log.name);
    if (!medDef) return false;

    const logTime = new Date(`${log.date}T${log.time}`).getTime();
    const accumulated = compute24hAccumulated(log.name, allLogs, logTime);
    return accumulated >= medDef.warningThresholdMg;
}
