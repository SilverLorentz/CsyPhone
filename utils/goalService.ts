/**
 * Goal Service — 角色目标拉取与缓存
 *
 * 从后端 /api/goals/:charId 拉取角色的隐性目标列表。
 * 内存缓存 + TTL，避免每轮都请求后端。
 * 后端不可用时静默降级（返回空数组）。
 */

import { isBackendAlive, buildHeaders } from './clients/backendCore';
import { getBackendUrl } from './backendConfig';
import { safeTimeoutSignal } from './safeTimeout';

export interface CharacterGoal {
    description: string;
    utility: number;    // 0~1
    category: string;   // attachment / status / protection / autonomy / pleasure
}

// ─── In-memory cache ─────────────────────────────────────────

interface GoalCacheEntry {
    goals: CharacterGoal[];
    fetchedAt: number;
}

const goalCache = new Map<string, GoalCacheEntry>();

/** Cache TTL: 10 minutes — goals change infrequently */
const CACHE_TTL_MS = 10 * 60 * 1000;

// ─── Public API ──────────────────────────────────────────────

/**
 * Load character goals from the backend.
 * Returns cached data if available and fresh.
 * Silently returns [] on failure (backend unavailable, network error, etc.).
 */
export async function loadCharacterGoals(charId: string): Promise<CharacterGoal[]> {
    // Check cache first
    const cached = goalCache.get(charId);
    if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
        return cached.goals;
    }

    try {
        const alive = await isBackendAlive();
        if (!alive) return cached?.goals || [];

        const url = getBackendUrl();
        if (!url) return cached?.goals || [];

        const headers = buildHeaders();
        const resp = await fetch(`${url}/api/goals/${encodeURIComponent(charId)}`, {
            headers,
            signal: safeTimeoutSignal(8000),
        });

        if (!resp.ok) {
            console.warn(`🎯 [Goals] HTTP ${resp.status} for ${charId}, using fallback`);
            return cached?.goals || [];
        }

        const data = await resp.json();
        const goals: CharacterGoal[] = Array.isArray(data?.goals) ? data.goals : [];

        // Update cache
        goalCache.set(charId, { goals, fetchedAt: Date.now() });
        if (goals.length > 0) {
            console.log(`🎯 [Goals] Loaded ${goals.length} goals for ${charId}`);
        }

        return goals;
    } catch (err: any) {
        console.warn(`🎯 [Goals] Failed to load for ${charId}:`, err?.message);
        return cached?.goals || [];
    }
}

/**
 * Format goals into a string for prompt injection.
 * Returns undefined if goals are empty (callers can use this for conditional injection).
 */
export function formatGoalListStr(goals: CharacterGoal[]): string | undefined {
    if (!goals || goals.length === 0) return undefined;

    return goals
        .sort((a, b) => b.utility - a.utility)
        .map(g => `· ${g.description} (重要度: ${g.utility > 0.7 ? '高' : g.utility > 0.4 ? '中' : '低'})`)
        .join('\n');
}

/**
 * Invalidate the cache for a specific character (e.g., after goal update).
 */
export function invalidateGoalCache(charId: string): void {
    goalCache.delete(charId);
}

/**
 * Invalidate the entire goal cache.
 */
export function clearGoalCache(): void {
    goalCache.clear();
}
