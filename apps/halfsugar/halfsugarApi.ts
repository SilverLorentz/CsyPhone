/**
 * halfsugarApi — Meal CRUD via local IndexedDB.
 * Replaces the previous backend fetch layer.
 */
import { getDB } from './storage/healthDB';
import type { MealRecord } from './types';

export async function fetchMeals(date: string): Promise<MealRecord[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('meals', 'by-date', date);
    return all as MealRecord[];
}

export async function saveMeal(meal: MealRecord): Promise<MealRecord> {
    const db = await getDB();
    await db.put('meals', meal);
    return meal;
}

export async function deleteMeal(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('meals', id);
}
