/**
 * halfsugarTrackingApi — Weight / Sleep / Exercise / Goal CRUD via local IndexedDB.
 * Replaces the previous backend fetch layer.
 */
import { getDB } from './storage/healthDB';
import type {
    ExerciseRecord,
    HealthGoal,
    SleepRecord,
    WeightRecord,
} from './types';

// ── Weight ──

export async function fetchWeightRecords(start: string, end: string): Promise<WeightRecord[]> {
    const db = await getDB();
    const all = await db.getAll('weights');
    return (all as WeightRecord[]).filter((r) => r.date >= start && r.date <= end);
}

export async function saveWeight(record: WeightRecord): Promise<WeightRecord> {
    const db = await getDB();
    await db.put('weights', record);
    return record;
}

export async function deleteWeight(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('weights', id);
}

// ── Sleep ──

export async function fetchSleep(date: string): Promise<SleepRecord | null> {
    const db = await getDB();
    const all = await db.getAllFromIndex('sleep', 'by-date', date);
    return (all[0] as SleepRecord) || null;
}

export async function saveSleep(record: SleepRecord): Promise<SleepRecord> {
    const db = await getDB();
    await db.put('sleep', record);
    return record;
}

export async function deleteSleep(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('sleep', id);
}

// ── Exercise ──

export async function fetchExercises(date: string): Promise<ExerciseRecord[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('exercises', 'by-date', date);
    return all as ExerciseRecord[];
}

export async function saveExercise(record: ExerciseRecord): Promise<ExerciseRecord> {
    const db = await getDB();
    await db.put('exercises', record);
    return record;
}

export async function deleteExercise(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('exercises', id);
}

// ── Goals ──

export async function fetchGoals(): Promise<HealthGoal[]> {
    const db = await getDB();
    return db.getAll('goals') as Promise<HealthGoal[]>;
}

export async function saveGoal(goal: HealthGoal): Promise<HealthGoal> {
    const db = await getDB();
    await db.put('goals', goal);
    return goal;
}

export async function deleteGoal(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('goals', id);
}
