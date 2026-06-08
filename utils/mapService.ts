import { buildBackendHeaders,buildBackendUrl } from './backendClient';
import { safeResponseJson } from './safeApi';
import { safeTimeoutSignal } from './safeTimeout';

export interface CityTip {
    name: string;
    district: string;
    adcode: string;
}

export interface POIResult {
    name: string;
    type: string;
    address: string;
}

export interface DistrictInfo {
    name: string;
    adcode: string;
    level: string;
    center: string;
    districts: DistrictInfo[];
}

interface MapRequestOptions {
    signal?: AbortSignal;
}

interface CacheEntry<T> {
    expiresAt: number;
    value: T;
}

const CITY_INPUT_TIPS_TIMEOUT_MS = 8000;
const CITY_INPUT_TIPS_CACHE_TTL_MS = 5 * 60 * 1000;
const CITY_INPUT_TIPS_CACHE_MAX_ENTRIES = 120;
const cityInputTipsCache = new Map<string, CacheEntry<CityTip[]>>();
const CITY_INPUT_TIPS_AUTH_ERROR = '城市搜索鉴权失败，请刷新后重试';

function normalizeCityTip(value: unknown): CityTip | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) return null;

    return {
        name,
        district: typeof record.district === 'string' ? record.district.trim() : '',
        adcode: typeof record.adcode === 'string' ? record.adcode.trim() : '',
    };
}

function normalizePOIResult(value: unknown): POIResult | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) return null;

    return {
        name,
        type: typeof record.type === 'string' ? record.type.trim() : '',
        address: typeof record.address === 'string' ? record.address.trim() : '',
    };
}

function normalizeDistrictInfo(value: unknown): DistrictInfo | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    return {
        name: typeof record.name === 'string' ? record.name.trim() : '',
        adcode: typeof record.adcode === 'string' ? record.adcode.trim() : '',
        level: typeof record.level === 'string' ? record.level.trim() : '',
        center: typeof record.center === 'string' ? record.center.trim() : '',
        districts: Array.isArray(record.districts)
            ? record.districts
                .map(normalizeDistrictInfo)
                .filter((district): district is DistrictInfo => Boolean(district))
            : [],
    };
}

function getCityInputTipsCacheKey(keyword: string): string {
    return keyword.trim().toLocaleLowerCase();
}

function readCityInputTipsCache(cacheKey: string): CityTip[] | null {
    const cached = cityInputTipsCache.get(cacheKey);
    if (!cached) return null;

    if (cached.expiresAt <= Date.now()) {
        cityInputTipsCache.delete(cacheKey);
        return null;
    }

    return cached.value;
}

function writeCityInputTipsCache(cacheKey: string, value: CityTip[]): void {
    cityInputTipsCache.set(cacheKey, {
        expiresAt: Date.now() + CITY_INPUT_TIPS_CACHE_TTL_MS,
        value,
    });

    while (cityInputTipsCache.size > CITY_INPUT_TIPS_CACHE_MAX_ENTRIES) {
        const oldestKey = cityInputTipsCache.keys().next().value;
        if (!oldestKey) break;
        cityInputTipsCache.delete(oldestKey);
    }
}

function createTimedAbortSignal(timeoutMs: number, externalSignal?: AbortSignal): {
    cleanup: () => void;
    didTimeout: () => boolean;
    signal: AbortSignal;
} {
    const controller = new AbortController();
    let timedOut = false;

    const abortFromExternal = () => {
        controller.abort();
    };

    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort();
        } else {
            externalSignal.addEventListener('abort', abortFromExternal, { once: true });
        }
    }

    const timeoutId = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    return {
        signal: controller.signal,
        didTimeout: () => timedOut,
        cleanup: () => {
            globalThis.clearTimeout(timeoutId);
            externalSignal?.removeEventListener('abort', abortFromExternal);
        },
    };
}

/**
 * 调用后端 Workers 的 /api/map/inputtips 接口做城市联想
 * @param keyword 用户输入的关键词片段
 * @returns 城市提示列表
 */
export async function getCityInputTips(keyword: string, options: MapRequestOptions = {}): Promise<CityTip[]> {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) return [];
    const cacheKey = getCityInputTipsCacheKey(trimmedKeyword);
    const cached = readCityInputTipsCache(cacheKey);
    if (cached) return cached;

    const abortHandle = createTimedAbortSignal(CITY_INPUT_TIPS_TIMEOUT_MS, options.signal);

    try {
        const response = await fetch(
            buildBackendUrl('/api/map/inputtips', { keywords: trimmedKeyword }),
            {
                headers: buildBackendHeaders({
                    contentType: false,
                    extra: { 'Accept': 'application/json' },
                }),
                signal: abortHandle.signal,
            },
        );

        if (!response.ok) {
            if (response.status === 429) {
                return [];
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error(CITY_INPUT_TIPS_AUTH_ERROR);
            }
            throw new Error(`城市搜索失败 (${response.status})`);
        }

        const data = await safeResponseJson(response);
        const tips = Array.isArray(data?.tips) ? (data.tips as unknown[]) : [];
        const normalizedTips = tips.length > 0
            ? tips
                .map(normalizeCityTip)
                .filter((tip): tip is CityTip => Boolean(tip))
            : [];

        writeCityInputTipsCache(cacheKey, normalizedTips);
        return normalizedTips;
    } catch (error) {
        if (abortHandle.didTimeout()) {
            throw new Error('城市搜索超时，请稍后再试');
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
        }
        if (error instanceof Error && error.message.trim()) {
            throw error;
        }
        throw new Error('城市搜索失败，请稍后再试');
    } finally {
        abortHandle.cleanup();
    }
}

export async function getDistrictInfo(keyword: string, subdistrict = 1): Promise<DistrictInfo[]> {
    const trimmed = keyword.trim();
    if (!trimmed) return [];

    try {
        const response = await fetch(
            buildBackendUrl('/api/map/district', {
                keywords: trimmed,
                subdistrict,
            }),
            {
                headers: buildBackendHeaders({
                    contentType: false,
                    extra: { 'Accept': 'application/json' },
                }),
                signal: safeTimeoutSignal(8000),
            },
        );

        if (!response.ok) {
            return [];
        }

        const data = await safeResponseJson(response);
        const districts = Array.isArray(data?.districts) ? (data.districts as unknown[]) : [];
        return districts.length > 0
            ? districts
                .map(normalizeDistrictInfo)
                .filter((district): district is DistrictInfo => Boolean(district))
            : [];
    } catch {
        return [];
    }
}

/**
 * 搜索指定城市的餐饮 POI
 * @param city 城市名
 * @param count 返回数量，默认 15
 * @returns 餐饮 POI 列表
 */
export async function searchNearbyRestaurants(city: string, count = 15): Promise<POIResult[]> {
    const trimmedCity = city.trim();
    if (!trimmedCity) return [];

    try {
        const response = await fetch(
            buildBackendUrl('/api/map/poi', {
                city: trimmedCity,
                keywords: '餐饮',
                count,
            }),
            {
                headers: buildBackendHeaders({
                    contentType: false,
                    extra: { 'Accept': 'application/json' },
                }),
                signal: safeTimeoutSignal(8000),
            },
        );

        if (!response.ok) {
            return [];
        }

        const data = await safeResponseJson(response);
        const pois = Array.isArray(data?.pois) ? (data.pois as unknown[]) : [];
        return pois.length > 0
            ? pois
                .map(normalizePOIResult)
                .filter((poi): poi is POIResult => Boolean(poi))
            : [];
    } catch {
        return [];
    }
}
