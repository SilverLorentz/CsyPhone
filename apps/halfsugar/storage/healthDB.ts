/**
 * Half Sugar Health — IndexedDB Storage Layer
 *
 * Uses the `idb` library to provide a local-first persistence store
 * for all health tracking data (meals, weight, exercise, sleep, goals,
 * favorites, summaries, periods, medications).
 *
 * Database: 'halfsugar-health', Version 2
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// ── DB Schema ──

interface HalfSugarDB extends DBSchema {
    meals: {
        key: string;
        value: {
            id: string;
            date: string;
            type: string;
            customLabel?: string;
            foods: Array<{
                id: string;
                name: string;
                calories: number;
                protein: number;
                carbs: number;
                fat: number;
                fiber?: number;
                portion?: string;
                source?: string;
                confidence?: string;
            }>;
            photoUrl?: string;
            totalCalories: number;
            totalProtein: number;
            totalCarbs: number;
            totalFat: number;
            source: string;
            createdAt: number;
            updatedAt: number;
        };
        indexes: { 'by-date': string };
    };
    weights: {
        key: string;
        value: {
            id: string;
            date: string;
            timeOfDay: string;
            weight: number;
            createdAt: number;
            updatedAt: number;
        };
        indexes: { 'by-date': string };
    };
    exercises: {
        key: string;
        value: {
            id: string;
            date: string;
            exerciseType: string;
            exerciseLabel: string;
            durationMinutes: number;
            metValue: number;
            caloriesBurned: number;
            createdAt: number;
            updatedAt: number;
        };
        indexes: { 'by-date': string };
    };
    sleep: {
        key: string;
        value: {
            id: string;
            date: string;
            sleepTime: string;
            wakeTime: string;
            durationMinutes: number;
            quality?: string;
            createdAt: number;
            updatedAt: number;
        };
        indexes: { 'by-date': string };
    };
    goals: {
        key: string;
        value: {
            id: string;
            goalType: string;
            targetValue: number;
            createdAt: number;
            updatedAt: number;
        };
        indexes: { 'by-goalType': string };
    };
    favorites: {
        key: string;
        value: {
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
        };
        indexes: { 'by-name': string };
    };
    summaries: {
        key: string;
        value: {
            id: string;
            periodType: string;
            periodKey: string;
            startDate: string;
            endDate: string;
            statsJson: any;
            summaryText: string;
            charId?: string;
            charName?: string;
            createdAt: number;
            updatedAt: number;
        };
        indexes: {
            'by-periodType': string;
            'by-periodKey': string;
        };
    };
    periods: {
        key: string;
        value: {
            id: string;
            startDate: string;
            endDate?: string;
            flowIntensity?: string;
            symptoms?: string[];
            notes?: string;
            isOutlier: boolean;
            createdAt: number;
            updatedAt: number;
        };
        indexes: { 'by-startDate': string };
    };
    medications: {
        key: string;
        value: {
            id: string;
            date: string;
            time: string;
            name: string;
            dosageMg: number;
            createdAt: number;
        };
        indexes: { 'by-date': string };
    };
}

// ── Singleton DB Instance ──

let dbPromise: Promise<IDBPDatabase<HalfSugarDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<HalfSugarDB>> {
    if (!dbPromise) {
        dbPromise = openDB<HalfSugarDB>('halfsugar-health', 2, {
            upgrade(db) {
                // Meals
                if (!db.objectStoreNames.contains('meals')) {
                    const meals = db.createObjectStore('meals', { keyPath: 'id' });
                    meals.createIndex('by-date', 'date');
                }

                // Weights
                if (!db.objectStoreNames.contains('weights')) {
                    const weights = db.createObjectStore('weights', { keyPath: 'id' });
                    weights.createIndex('by-date', 'date');
                }

                // Exercises
                if (!db.objectStoreNames.contains('exercises')) {
                    const exercises = db.createObjectStore('exercises', { keyPath: 'id' });
                    exercises.createIndex('by-date', 'date');
                }

                // Sleep
                if (!db.objectStoreNames.contains('sleep')) {
                    const sleep = db.createObjectStore('sleep', { keyPath: 'id' });
                    sleep.createIndex('by-date', 'date');
                }

                // Goals
                if (!db.objectStoreNames.contains('goals')) {
                    const goals = db.createObjectStore('goals', { keyPath: 'id' });
                    goals.createIndex('by-goalType', 'goalType');
                }

                // Favorites
                if (!db.objectStoreNames.contains('favorites')) {
                    const favorites = db.createObjectStore('favorites', { keyPath: 'id' });
                    favorites.createIndex('by-name', 'name');
                }

                // Summaries
                if (!db.objectStoreNames.contains('summaries')) {
                    const summaries = db.createObjectStore('summaries', { keyPath: 'id' });
                    summaries.createIndex('by-periodType', 'periodType');
                    summaries.createIndex('by-periodKey', 'periodKey');
                }

                // Periods (v2)
                if (!db.objectStoreNames.contains('periods')) {
                    const periods = db.createObjectStore('periods', { keyPath: 'id' });
                    periods.createIndex('by-startDate', 'startDate');
                }

                // Medications (v2)
                if (!db.objectStoreNames.contains('medications')) {
                    const medications = db.createObjectStore('medications', { keyPath: 'id' });
                    medications.createIndex('by-date', 'date');
                }
            },
        });
    }
    return dbPromise;
}

// ── Week-level query helpers ──

function getDateDaysAgo(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
}

/** Get all exercises from the past N days */
export async function getRecentExercises(days: number) {
    const db = await getDB();
    const startDate = getDateDaysAgo(days - 1);
    const range = IDBKeyRange.lowerBound(startDate);
    return db.getAllFromIndex('exercises', 'by-date', range);
}

/** Get all sleep records from the past N days */
export async function getRecentSleep(days: number) {
    const db = await getDB();
    const startDate = getDateDaysAgo(days - 1);
    const range = IDBKeyRange.lowerBound(startDate);
    return db.getAllFromIndex('sleep', 'by-date', range);
}
