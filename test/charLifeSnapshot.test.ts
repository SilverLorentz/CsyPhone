import { afterEach,describe,expect,it,vi } from 'vitest';

import {
  buildDaySnapshotSummaryForPrompt,
  computeContextFingerprint,
  formatCurrentWeatherForPrompt,
  getCurrentPlanNode,
  getCurrentPlanNodeStatus,
  getLocalDateInfo,
  getWeatherCacheStateKey,
  loadCurrentWeather,
  sanitizeDaySnapshot,
  sanitizePlaceSeed,
} from '../../csyos-workers/src/services/charLifeSnapshot';
import type { CityProfile, CurrentWeather, DaySnapshot, LocalDateInfo } from '../../csyos-workers/src/services/charLifeSnapshot';
import { buildFragmentPrompt } from '../../csyos-workers/src/services/lifeStreamService';

class FakeD1Database {
    private readonly state = new Map<string, string>();

    prepare(sql: string) {
        const db = this;
        return {
            params: [] as unknown[],
            bind(...params: unknown[]) {
                this.params = params;
                return this;
            },
            async first<T>() {
                if (sql.startsWith('SELECT value FROM agent_state')) {
                    const [userId, key] = this.params as [string, string];
                    const value = db.state.get(`${userId}:${key}`);
                    return value ? ({ value } as T) : null;
                }
                return null;
            },
            async run() {
                if (sql.includes('INSERT INTO agent_state')) {
                    const [userId, key, value] = this.params as [string, string, string];
                    db.state.set(`${userId}:${key}`, value);
                    return { success: true };
                }
                throw new Error(`Unsupported SQL in FakeD1Database: ${sql}`);
            },
        };
    }

    readState(userId: string, key: string): Record<string, unknown> | null {
        const raw = this.state.get(`${userId}:${key}`);
        return raw ? JSON.parse(raw) as Record<string, unknown> : null;
    }
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('charLifeSnapshot helpers', () => {
    it('normalizes branded POI-like seeds into soft place categories', () => {
        expect(sanitizePlaceSeed('星巴克臻选门店')).toBe('常去咖啡店');
        expect(sanitizePlaceSeed('7-11 便利店')).toBe('便利店');
        expect(sanitizePlaceSeed('静安寺 889 广场')).toBeUndefined();
    });

    it('keeps day snapshot nodes within 3-6 entries and only uses soft place seeds', () => {
        const snapshot = sanitizeDaySnapshot(
            {
                dayTone: '今天会慢一点。',
                baseRhythm: '上午散，傍晚再收回来。',
                planNodes: [
                    {
                        timeHint: '上午',
                        place: '星巴克臻选门店',
                        mode: 'loose',
                        plan: '进去躲一会儿雨。',
                        whyNatural: '他本来就容易被天气推着拐进这种地方。',
                    },
                ],
                aftertasteSeed: '夜里会有一点回潮。',
            },
            {
                homeCity: '上海',
                timezone: 'Asia/Shanghai',
                confidence: 0.91,
                lifestyleSketch: '平时会在住处、工作地点和散步路线之间来回。',
                placeSeeds: ['住处', '工作地点', '散步路线'],
                generatedAt: Date.now(),
                routineType: 'office_worker',
                routineHints: ['朝九晚六'],
                activeWindow: { start: 8, end: 22 },
                activityLevel: 0.6,
                nodeCountHint: { min: 3, max: 6 },
            },
            getLocalDateInfo('Asia/Shanghai', Date.UTC(2026, 3, 6, 2, 0, 0)),
        );

        expect(snapshot.planNodes.length).toBeGreaterThanOrEqual(3);
        expect(snapshot.planNodes.length).toBeLessThanOrEqual(6);
        expect(snapshot.planNodes.every(node => ['住处', '工作地点', '散步路线'].includes(node.place))).toBe(true);
    });

    it('getCurrentPlanNode returns the closest node for the current hour', () => {
        const snapshot: DaySnapshot = {
            localDate: '2026-04-08',
            timezone: 'Asia/Shanghai',
            weekday: '星期三',
            isWorkday: true,
            dayTone: 'test',
            baseRhythm: 'test',
            planNodes: [
                { timeHint: '早上', place: '住处', mode: 'stable', plan: 'p1', whyNatural: 'w1' },
                { timeHint: '中午', place: '工作地点', mode: 'stable', plan: 'p2', whyNatural: 'w2' },
                { timeHint: '傍晚', place: '散步路线', mode: 'loose', plan: 'p3', whyNatural: 'w3' },
                { timeHint: '晚上', place: '住处', mode: 'stable', plan: 'p4', whyNatural: 'w4' },
            ],
            aftertasteSeed: 'test',
            generatedAt: Date.now(),
        };

        const node15 = getCurrentPlanNode(snapshot, 15);
        expect(node15?.place).toBe('工作地点');

        const node21 = getCurrentPlanNode(snapshot, 21);
        expect(node21?.place).toBe('住处');

        const node5 = getCurrentPlanNode(snapshot, 5);
        expect(node5?.place).toBe('住处');
    });

    it('getCurrentPlanNodeStatus returns "left" when past durationMin', () => {
        const snapshot: DaySnapshot = {
            localDate: '2026-04-09',
            timezone: 'Asia/Shanghai',
            weekday: '星期三',
            isWorkday: true,
            dayTone: 'test',
            baseRhythm: 'test',
            planNodes: [
                { timeHint: '早上', place: '住处', mode: 'stable', plan: 'p1', whyNatural: 'w1', durationMin: 120 },
                { timeHint: '中午', place: '常去咖啡店', mode: 'loose', plan: 'p2', whyNatural: 'w2', durationMin: 40 },
                { timeHint: '傍晚', place: '散步路线', mode: 'loose', plan: 'p3', whyNatural: 'w3' },
                { timeHint: '晚上', place: '住处', mode: 'stable', plan: 'p4', whyNatural: 'w4' },
            ],
            aftertasteSeed: 'test',
            generatedAt: Date.now(),
        };

        const at1220 = getCurrentPlanNodeStatus(snapshot, 12, 20);
        expect(at1220?.status).toBe('at');
        expect(at1220?.node.place).toBe('常去咖啡店');

        const at1300 = getCurrentPlanNodeStatus(snapshot, 13, 0);
        expect(at1300?.status).toBe('transit');
        expect(at1300?.node.place).toBe('常去咖啡店');
        expect(at1300?.nextNode?.place).toBe('散步路线');

        const at1830 = getCurrentPlanNodeStatus(snapshot, 18, 30);
        expect(at1830?.status).toBe('at');
        expect(at1830?.node.place).toBe('散步路线');

        const at2330 = getCurrentPlanNodeStatus(snapshot, 23, 30);
        expect(at2330?.status).toBe('left');
        expect(at2330?.node.place).toBe('住处');
    });

    it('queries current weather by char homeCity and records weather_unavailable fallback', async () => {
        const db = new FakeD1Database();
        const userId = 'user-1';
        const charId = 'char-1';
        const localDateInfo = getLocalDateInfo('Asia/Tokyo', Date.UTC(2026, 3, 6, 3, 0, 0));

        let requestedUrl = '';
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            requestedUrl = String(input);
            return new Response(JSON.stringify({
                code: '200',
                now: {
                    temp: '12',
                    feelsLike: '10',
                    text: '小雨',
                    humidity: '91',
                    windSpeed: '15',
                },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }));

        const weather = await loadCurrentWeather(
            db as unknown as D1Database,
            userId,
            charId,
            { weatherEnabled: true, weatherProvider: 'qweather' },
            {
                homeCity: 'Tokyo',
                timezone: 'Asia/Tokyo',
                confidence: 0.88,
                lifestyleSketch: '平时会在住处和工作地点之间移动。',
                placeSeeds: ['住处', '工作地点'],
                generatedAt: Date.now(),
                routineType: 'office_worker',
                routineHints: ['通勤族'],
                activeWindow: { start: 8, end: 22 },
                activityLevel: 0.5,
                nodeCountHint: { min: 3, max: 5 },
            },
            localDateInfo,
            'test-qweather-key',
        );

        expect(requestedUrl).toContain('devapi.qweather.com');
        expect(requestedUrl).toContain('location=Tokyo');
        expect(weather?.city).toBe('Tokyo');
        expect(weather?.description).toBe('小雨');
        expect(weather?.provider).toBe('qweather');

        vi.stubGlobal('fetch', vi.fn());

        const missingConfigResult = await loadCurrentWeather(
            db as unknown as D1Database,
            userId,
            'char-2',
            { weatherEnabled: true, weatherProvider: 'qweather' },
            {
                homeCity: 'Kyoto',
                timezone: 'Asia/Tokyo',
                confidence: 0.41,
                lifestyleSketch: '平时在住处附近活动。',
                placeSeeds: ['住处'],
                generatedAt: Date.now(),
                routineType: 'homebound',
                routineHints: ['宅家'],
                activeWindow: { start: 10, end: 22 },
                activityLevel: 0.3,
                nodeCountHint: { min: 2, max: 4 },
            },
            localDateInfo,
            '',
        );

        expect(missingConfigResult).toBeNull();

        const cacheKey = getWeatherCacheStateKey('char-2', `current_${localDateInfo.localDate}_${String(localDateInfo.hour).padStart(2, '0')}`);
        expect(db.readState(userId, cacheKey)).toMatchObject({
            unavailable: true,
            reason: 'weather_config_missing',
        });
    });

    it('produces different weather nudges and keeps life stream prompt in drift mode instead of weather-report mode', () => {
        const rainWeather = formatCurrentWeatherForPrompt({
            city: 'Tokyo',
            description: '小雨',
            temp: 12,
            feelsLike: 10,
            humidity: 90,
            windSpeed: 4,
            dominantCondition: '雨',
            provider: 'qweather',
            observedAt: Date.now(),
        });
        const coldWeather = formatCurrentWeatherForPrompt({
            city: 'Tokyo',
            description: '晴',
            temp: 5,
            feelsLike: 2,
            humidity: 42,
            windSpeed: 2,
            dominantCondition: '晴',
            provider: 'qweather',
            observedAt: Date.now(),
        });
        const sunnyWeather = formatCurrentWeatherForPrompt({
            city: 'Tokyo',
            description: '晴',
            temp: 22,
            feelsLike: 22,
            humidity: 41,
            windSpeed: 1,
            dominantCondition: '晴',
            provider: 'qweather',
            observedAt: Date.now(),
        });

        expect(rainWeather).toContain('往室内');
        expect(coldWeather).toContain('动作收紧');
        expect(sunnyWeather).toContain('loose 节点轻微偏掉');

        const snapshotSummary = buildDaySnapshotSummaryForPrompt({
            localDate: '2026-04-06',
            timezone: 'Asia/Tokyo',
            weekday: '星期一',
            isWorkday: true,
            dayTone: '今天整体会慢一点。',
            baseRhythm: '先顺着惯性，后面再松。',
            planNodes: [
                {
                    timeHint: '下午',
                    place: '散步路线',
                    mode: 'loose',
                    plan: '原本想沿着散步路线晃一圈再回去。',
                    whyNatural: '这是他最容易被天气和心情一起改动的节点。',
                },
                {
                    timeHint: '晚上',
                    place: '住处',
                    mode: 'stable',
                    plan: '最后还是会回住处把节奏收回来。',
                    whyNatural: '住处是他自然会落回去的地方。',
                },
            ],
            aftertasteSeed: '夜里会留一点潮气似的余韵。',
            generatedAt: Date.now(),
        });

        const prompt = buildFragmentPrompt({
            context: {
                charId: 'char-1',
                charName: 'K',
                charSystemPrompt: '他习惯把情绪压在很细小的动作里。',
                charPersonality: '寡言，留白多，日常感强。',
                worldview: '住在常下雨的城市。',
                mountedWorldbooksDigest: '工作和散步都绕不开河边。',
                coreMemoryDigest: '[2026-03] 他常在雨天临时改变路线。',
                cityOverride: 'Tokyo',
                moodState: null,
                updatedAt: Date.now(),
            },
            timeLabel: '下午',
            timeStr: '星期一 15:20',
            existingFragments: ['我本来已经走到拐角，后来又停了一下。'],
            snapshotSummary,
            weatherSummary: rainWeather,
            lifeAnchorSummary: '[当前日程锚点]\n现在大概率在散步路线附近，不要沿用旧位置。',
        });

        expect(prompt.userPrompt).toContain('loose 节点轻微偏掉');
        expect(prompt.userPrompt).toContain('不要把输出写成天气播报');
        expect(prompt.userPrompt).toContain('今日原定生活快照');
    });

    it('produces stable fingerprints and detects context changes', () => {
        const base = {
            charId: 'c1',
            charName: 'K',
            charSystemPrompt: '他是一个安静的人。',
            charPersonality: '内向，喜欢独处。',
            worldview: '住在常下雨的城市。',
            moodState: null,
            updatedAt: Date.now(),
        };

        const fp1 = computeContextFingerprint(base);
        const fp2 = computeContextFingerprint(base);
        expect(fp1).toBe(fp2);

        const changed = { ...base, charSystemPrompt: '她是一个活泼的人。' };
        const fp3 = computeContextFingerprint(changed);
        expect(fp3).not.toBe(fp1);
    });

    it('allows verified place names to pass through sanitizePlaceSeed', () => {
        const verified = new Set(['西西弗书店·万象城店', '便利蜂·翠苑店']);
        expect(sanitizePlaceSeed('西西弗书店·万象城店', verified)).toBe('西西弗书店·万象城店');
        expect(sanitizePlaceSeed('便利蜂·翠苑店', verified)).toBe('便利蜂·翠苑店');
        expect(sanitizePlaceSeed('星巴克臻选门店')).toBe('常去咖啡店');
    });

    it('respects nodeCountHint for day snapshot node count', () => {
        const lowNodeProfile: CityProfile = {
            homeCity: '上海',
            timezone: 'Asia/Shanghai',
            confidence: 0.8,
            lifestyleSketch: '宅家型角色',
            placeSeeds: ['住处', '便利店'],
            generatedAt: Date.now(),
            routineType: 'homebound',
            routineHints: ['几乎不出门'],
            activeWindow: { start: 10, end: 22 },
            activityLevel: 0.25,
            nodeCountHint: { min: 1, max: 3 },
        };

        const dateInfo: LocalDateInfo = {
            timezone: 'Asia/Shanghai',
            localDate: '2026-04-08',
            weekday: '星期三',
            isWorkday: true,
            hour: 10,
            minute: 0,
            timeStr: '10:00',
            timeLabel: '上午',
        };

        const snapshot = sanitizeDaySnapshot({}, lowNodeProfile, dateInfo);
        expect(snapshot.planNodes.length).toBeGreaterThanOrEqual(1);
        expect(snapshot.planNodes.length).toBeLessThanOrEqual(3);
    });

    it('produces haze drift hint for foggy weather', () => {
        const fogWeather: CurrentWeather = {
            city: '上海',
            description: '霾',
            temp: 18,
            feelsLike: 17,
            humidity: 85,
            dominantCondition: '霾',
            provider: 'qweather',
            observedAt: Date.now(),
        };

        const result = formatCurrentWeatherForPrompt(fogWeather);
        expect(result).toContain('雾霾');
        expect(result).toContain('室内');
    });

    it('produces sandstorm drift hint', () => {
        const sandWeather: CurrentWeather = {
            city: '北京',
            description: '扬沙',
            temp: 12,
            feelsLike: 8,
            humidity: 30,
            dominantCondition: '扬沙',
            provider: 'qweather',
            observedAt: Date.now(),
        };

        const result = formatCurrentWeatherForPrompt(sandWeather);
        expect(result).toContain('沙尘');
    });

    it('produces extreme heat drift hint at 35+ degrees', () => {
        const hotWeather: CurrentWeather = {
            city: '重庆',
            description: '晴',
            temp: 38,
            feelsLike: 40,
            humidity: 60,
            dominantCondition: '晴',
            provider: 'qweather',
            observedAt: Date.now(),
        };

        const result = formatCurrentWeatherForPrompt(hotWeather);
        expect(result).toContain('极端高温');
    });

    describe('fictional city context', () => {
        it('computeContextFingerprint includes fictional city fields', () => {
            const base = {
                charId: 'c1',
                charName: 'TestChar',
                charSystemPrompt: 'prompt',
                charPersonality: 'personality',
                moodState: null,
                updatedAt: Date.now(),
            };

            const fp1 = computeContextFingerprint({
                ...base,
                cityOverride: '新月城',
            });

            const fp2 = computeContextFingerprint({
                ...base,
                cityOverride: '新月城',
                isFictionalCity: true,
                cityReferenceReal: '上海',
            });

            expect(fp1).not.toBe(fp2);
        });
    });
});
