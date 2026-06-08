/**
 * Zhaixinglou — Real Birth Chart Calculator
 * 
 * Uses the `astronomy-engine` library to compute actual planetary positions
 * and map them to zodiac signs.
 */
import * as Astronomy from 'astronomy-engine';

// --- Types ---
export interface PlanetPosition {
    name: string;
    symbol: string;
    longitude: number;      // ecliptic longitude in degrees (0-360)
    sign: string;           // zodiac sign name
    signIndex: number;      // 0=Aries, 11=Pisces
    degree: number;         // degree within the sign (0-30)
}

export interface BirthChart {
    date: Date;
    latitude: number;
    longitude: number;
    planets: PlanetPosition[];
    sunSign: string;
    moonSign: string;
    ascendantSign?: string;   // 上升星座（需要经纬度才能计算）
    ascendantDegree?: number; // 上升点在星座内的度数
}

export interface SynastryResult {
    chart1: BirthChart;
    chart2: BirthChart;
    aspects: SynastryAspect[];
}

export interface SynastryAspect {
    planet1: string;
    planet2: string;
    angle: number;
    aspectName: string;
    nature: 'harmonious' | 'tense' | 'neutral';
    orb: number;
}

// --- Constants ---
const ZODIAC_SIGNS = [
    '白羊座', '金牛座', '双子座', '巨蟹座',
    '狮子座', '处女座', '天秤座', '天蝎座',
    '射手座', '摩羯座', '水瓶座', '双鱼座',
];

const ZODIAC_SYMBOLS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

const PLANET_CONFIG: { body: Astronomy.Body; name: string; symbol: string }[] = [
    { body: Astronomy.Body.Sun, name: '太阳', symbol: '☉' },
    { body: Astronomy.Body.Moon, name: '月亮', symbol: '☽' },
    { body: Astronomy.Body.Mercury, name: '水星', symbol: '☿' },
    { body: Astronomy.Body.Venus, name: '金星', symbol: '♀' },
    { body: Astronomy.Body.Mars, name: '火星', symbol: '♂' },
    { body: Astronomy.Body.Jupiter, name: '木星', symbol: '♃' },
    { body: Astronomy.Body.Saturn, name: '土星', symbol: '♄' },
];

const ASPECT_DEFS = [
    { name: '合相', angle: 0, orb: 8, nature: 'neutral' as const },
    { name: '六分相', angle: 60, orb: 6, nature: 'harmonious' as const },
    { name: '四分相', angle: 90, orb: 7, nature: 'tense' as const },
    { name: '三分相', angle: 120, orb: 8, nature: 'harmonious' as const },
    { name: '对冲相', angle: 180, orb: 8, nature: 'tense' as const },
];

// --- Helpers ---
function longitudeToSign(longitude: number): { sign: string; signIndex: number; degree: number; symbol: string } {
    const norm = ((longitude % 360) + 360) % 360;
    const signIndex = Math.floor(norm / 30);
    const degree = norm % 30;
    return { sign: ZODIAC_SIGNS[signIndex], signIndex, degree: Math.round(degree * 100) / 100, symbol: ZODIAC_SYMBOLS[signIndex] };
}

function getEclipticLongitude(body: Astronomy.Body, date: Date): number {
    // 太阳：用 SunPosition 获取地心视黄经
    if (body === Astronomy.Body.Sun) {
        const sunPos = Astronomy.SunPosition(date);
        return sunPos.elon;
    }

    // 月亮：用 EclipticGeoMoon 获取地心视黄经
    if (body === Astronomy.Body.Moon) {
        const moonPos = Astronomy.EclipticGeoMoon(date);
        return moonPos.lon;
    }

    // 地心黄经：先取地心向量(含光行差修正)，再转黄道坐标
    // 注意：EclipticLongitude 内部用 HelioVector (日心)，占星学需要地心坐标
    const geo = Astronomy.GeoVector(body, date, true);
    const ecl = Astronomy.Ecliptic(geo);
    return ecl.elon;
}

/**
 * Calculate the Ascendant (上升点) ecliptic longitude.
 * Requires birth date/time, geographic latitude, and geographic longitude.
 *
 * Formula:
 *   RAMC = Local Sidereal Time × 15  (degrees)
 *   Asc λ = atan2(cos(RAMC), -(sin(RAMC) × cos(ε) + tan(φ) × sin(ε)))
 *   where ε = obliquity of ecliptic, φ = geographic latitude
 */
function calcAscendant(date: Date, lat: number, lon: number): number {
    // 1. Greenwich Sidereal Time (hours)
    const gst = Astronomy.SiderealTime(date);

    // 2. Local Sidereal Time (hours) → degrees
    const lstHours = ((gst + lon / 15) % 24 + 24) % 24;
    const RAMC = lstHours * 15; // Right Ascension of Medium Coeli in degrees

    // 3. Obliquity of the ecliptic (approximate, good enough for astrology)
    const obliquity = 23.4393; // degrees — mean obliquity J2000

    // Convert to radians
    const ramcRad = RAMC * Math.PI / 180;
    const oblRad = obliquity * Math.PI / 180;
    const latRad = lat * Math.PI / 180;

    // 4. Ascendant formula
    const y = Math.cos(ramcRad);
    const x = -(Math.sin(ramcRad) * Math.cos(oblRad) + Math.tan(latRad) * Math.sin(oblRad));
    let ascLon = Math.atan2(y, x) * 180 / Math.PI;

    // Normalize to 0-360
    ascLon = ((ascLon % 360) + 360) % 360;

    return ascLon;
}

// --- Public API ---

/**
 * Calculate a birth chart for a given date, latitude, and longitude.
 */
export function calcBirthChart(date: Date, latitude: number = 0, longitude: number = 0): BirthChart {
    const planets: PlanetPosition[] = PLANET_CONFIG.map(({ body, name, symbol }) => {
        const lon = getEclipticLongitude(body, date);
        const { sign, signIndex, degree } = longitudeToSign(lon);
        return { name, symbol, longitude: Math.round(lon * 100) / 100, sign, signIndex, degree };
    });

    const sunSign = planets.find(p => p.name === '太阳')?.sign || '未知';
    const moonSign = planets.find(p => p.name === '月亮')?.sign || '未知';

    // 如果提供了经纬度，计算上升星座
    let ascendantSign: string | undefined;
    let ascendantDegree: number | undefined;
    if (latitude !== 0 || longitude !== 0) {
        const ascLon = calcAscendant(date, latitude, longitude);
        const ascInfo = longitudeToSign(ascLon);
        ascendantSign = ascInfo.sign;
        ascendantDegree = ascInfo.degree;
        // 将上升点加入行星列表（供星谕卡片等使用）
        planets.push({
            name: '上升点',
            symbol: 'Asc',
            longitude: Math.round(ascLon * 100) / 100,
            sign: ascInfo.sign,
            signIndex: ascInfo.signIndex,
            degree: ascInfo.degree,
        });
    }

    return { date, latitude, longitude, planets, sunSign, moonSign, ascendantSign, ascendantDegree };
}

/**
 * Calculate synastry aspects between two birth charts.
 */
export function calcSynastry(chart1: BirthChart, chart2: BirthChart): SynastryResult {
    const aspects: SynastryAspect[] = [];

    for (const p1 of chart1.planets) {
        for (const p2 of chart2.planets) {
            const diff = Math.abs(p1.longitude - p2.longitude);
            const angle = diff > 180 ? 360 - diff : diff;

            for (const asp of ASPECT_DEFS) {
                const orb = Math.abs(angle - asp.angle);
                if (orb <= asp.orb) {
                    aspects.push({
                        planet1: p1.name,
                        planet2: p2.name,
                        angle: Math.round(angle * 10) / 10,
                        aspectName: asp.name,
                        nature: asp.nature,
                        orb: Math.round(orb * 10) / 10,
                    });
                }
            }
        }
    }

    // Sort by orb (tightest aspects first)
    aspects.sort((a, b) => a.orb - b.orb);

    return { chart1, chart2, aspects };
}

/**
 * Format a birth chart into a human-readable summary for AI prompts.
 */
export function formatChartForPrompt(chart: BirthChart, label: string): string {
    const lines = chart.planets.map(p => `${p.symbol} ${p.name}: ${p.sign} ${p.degree.toFixed(1)}° (黄经 ${p.longitude.toFixed(1)}°)`);
    let text = `【${label}的星盘数据】\n日期: ${chart.date.toLocaleDateString('zh-CN')}`;
    if (chart.ascendantSign) {
        text += `\n上升星座: ${chart.ascendantSign} ${chart.ascendantDegree?.toFixed(1) ?? ''}°`;
    }
    text += `\n${lines.join('\n')}`;
    return text;
}

/**
 * Format synastry aspects for AI prompts.
 */
export function formatSynastryForPrompt(syn: SynastryResult, name1: string, name2: string): string {
    const topAspects = syn.aspects.slice(0, 15).map(a =>
        `${a.planet1}(${name1}) ${a.aspectName} ${a.planet2}(${name2}) — 角度 ${a.angle}°, 容许度 ${a.orb}°, ${a.nature === 'harmonious' ? '和谐' : a.nature === 'tense' ? '紧张' : '中性'}`
    );
    return `【合盘相位分析】\n${topAspects.join('\n')}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Star Calendar (星历) — Celestial Event Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MoonPhaseInfo {
    angle: number;          // 0-360, 0=新月, 90=上弦, 180=满月, 270=下弦
    phaseName: string;
    phaseEmoji: string;
    illumination: number;   // 0-1
    moonSign: string;
}

export interface RetrogradeInfo {
    planet: string;
    symbol: string;
    sign: string;
}

export interface IngressInfo {
    planet: string;
    symbol: string;
    fromSign: string;
    toSign: string;
}

export interface OppositionInfo {
    planet1: string;
    planet2: string;
    symbol1: string;
    symbol2: string;
    sign1: string;
    sign2: string;
    angle: number;
    orb: number;
}

export interface TransitHit {
    transitPlanet: string;
    transitSymbol: string;
    transitSign: string;
    natalPlanet: string;
    natalSymbol: string;
    natalSign: string;
    aspectName: string;
    orb: number;
    nature: 'harmonious' | 'tense' | 'neutral';
}

export interface CelestialEvents {
    moonPhase: MoonPhaseInfo;
    retrograding: RetrogradeInfo[];
    ingresses: IngressInfo[];
    oppositions: OppositionInfo[];
    transitChart: BirthChart;
}

// 月相名称映射
const MOON_PHASE_NAMES: { maxAngle: number; name: string; emoji: string }[] = [
    { maxAngle: 11.25, name: '新月', emoji: '🌑' },
    { maxAngle: 78.75, name: '蛾眉月', emoji: '🌒' },
    { maxAngle: 101.25, name: '上弦月', emoji: '🌓' },
    { maxAngle: 168.75, name: '盈凸月', emoji: '🌔' },
    { maxAngle: 191.25, name: '满月', emoji: '🌕' },
    { maxAngle: 258.75, name: '亏凸月', emoji: '🌖' },
    { maxAngle: 281.25, name: '下弦月', emoji: '🌗' },
    { maxAngle: 348.75, name: '残月', emoji: '🌘' },
    { maxAngle: 360, name: '新月', emoji: '🌑' },
];

/** Get current moon phase info. */
export function getMoonPhaseInfo(date: Date): MoonPhaseInfo {
    const angle = Astronomy.MoonPhase(date);
    const phase = MOON_PHASE_NAMES.find(p => angle < p.maxAngle) || MOON_PHASE_NAMES[0];
    const illumination = Math.round((1 - Math.cos(angle * Math.PI / 180)) / 2 * 100) / 100;
    const moonLon = getEclipticLongitude(Astronomy.Body.Moon, date);
    const moonSign = longitudeToSign(moonLon).sign;
    return { angle, phaseName: phase.name, phaseEmoji: phase.emoji, illumination, moonSign };
}

/**
 * Detect retrograde planets by comparing longitude today vs tomorrow.
 * Skip Sun (index 0) and Moon (index 1) — they never retrograde.
 */
export function checkRetrograde(date: Date): RetrogradeInfo[] {
    const result: RetrogradeInfo[] = [];
    const tomorrow = new Date(date.getTime() + 86400000);
    for (let i = 2; i < PLANET_CONFIG.length; i++) {
        const { body, name, symbol } = PLANET_CONFIG[i];
        const lonToday = getEclipticLongitude(body, date);
        const lonTomorrow = getEclipticLongitude(body, tomorrow);
        let delta = lonTomorrow - lonToday;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        if (delta < -0.01) {
            result.push({ planet: name, symbol, sign: longitudeToSign(lonToday).sign });
        }
    }
    return result;
}

/** Detect sign ingresses by comparing each planet's sign today vs yesterday. */
export function checkSignIngress(date: Date): IngressInfo[] {
    const result: IngressInfo[] = [];
    const yesterday = new Date(date.getTime() - 86400000);
    for (const { body, name, symbol } of PLANET_CONFIG) {
        const signToday = longitudeToSign(getEclipticLongitude(body, date));
        const signYesterday = longitudeToSign(getEclipticLongitude(body, yesterday));
        if (signToday.signIndex !== signYesterday.signIndex) {
            result.push({ planet: name, symbol, fromSign: signYesterday.sign, toSign: signToday.sign });
        }
    }
    return result;
}

/** Detect opposition aspects (near 180°) between planet pairs. */
export function checkOpposition(date: Date): OppositionInfo[] {
    const result: OppositionInfo[] = [];
    const positions = PLANET_CONFIG.map(({ body, name, symbol }) => {
        const lon = getEclipticLongitude(body, date);
        return { name, symbol, lon, sign: longitudeToSign(lon).sign };
    });
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            if (i <= 1 && j <= 1) continue; // skip Sun-Moon (covered by moon phase)
            const p1 = positions[i]; const p2 = positions[j];
            const diff = Math.abs(p1.lon - p2.lon);
            const angle = diff > 180 ? 360 - diff : diff;
            const orb = Math.abs(angle - 180);
            if (orb <= 5) {
                result.push({
                    planet1: p1.name, planet2: p2.name,
                    symbol1: p1.symbol, symbol2: p2.symbol,
                    sign1: p1.sign, sign2: p2.sign,
                    angle: Math.round(angle * 10) / 10,
                    orb: Math.round(orb * 10) / 10,
                });
            }
        }
    }
    return result;
}

/** Find the strongest (smallest orb) transit aspect between today's sky and a natal chart. */
export function findStrongestTransit(transitChart: BirthChart, natalChart: BirthChart): TransitHit | null {
    let best: TransitHit | null = null;
    let bestOrb = Infinity;
    for (const tp of transitChart.planets) {
        if (tp.name === '上升点') continue;
        for (const np of natalChart.planets) {
            const diff = Math.abs(tp.longitude - np.longitude);
            const angle = diff > 180 ? 360 - diff : diff;
            for (const asp of ASPECT_DEFS) {
                const orb = Math.abs(angle - asp.angle);
                if (orb <= asp.orb && orb < bestOrb) {
                    bestOrb = orb;
                    best = {
                        transitPlanet: tp.name, transitSymbol: tp.symbol, transitSign: tp.sign,
                        natalPlanet: np.name, natalSymbol: np.symbol, natalSign: np.sign,
                        aspectName: asp.name, orb: Math.round(orb * 10) / 10, nature: asp.nature,
                    };
                }
            }
        }
    }
    return best;
}

/** Master function: calculate all celestial events for a given date. */
export function calcCelestialEvents(date: Date): CelestialEvents {
    const transitChart = calcBirthChart(date, 0, 0);
    return {
        moonPhase: getMoonPhaseInfo(date),
        retrograding: checkRetrograde(date),
        ingresses: checkSignIngress(date),
        oppositions: checkOpposition(date),
        transitChart,
    };
}

/** Format celestial events into a human-readable string for AI prompts. */
export function formatEphemerisForPrompt(events: CelestialEvents, date: Date): string {
    const lines: string[] = [];
    lines.push(`【今日天象 — ${date.toLocaleDateString('zh-CN')}】`);
    const mp = events.moonPhase;
    lines.push(`月相：${mp.phaseEmoji} ${mp.phaseName}（角度 ${mp.angle.toFixed(1)}°，照亮 ${Math.round(mp.illumination * 100)}%），月亮位于${mp.moonSign}`);
    lines.push('');
    lines.push('行运行星位置：');
    for (const p of events.transitChart.planets) {
        if (p.name === '上升点') continue;
        lines.push(`  ${p.symbol} ${p.name}：${p.sign} ${p.degree.toFixed(1)}°`);
    }
    if (events.retrograding.length > 0) {
        lines.push('');
        lines.push('⚠ 当前逆行行星：');
        for (const r of events.retrograding) lines.push(`  ${r.symbol} ${r.planet}逆行中（位于${r.sign}）`);
    }
    if (events.ingresses.length > 0) {
        lines.push('');
        lines.push('🔄 今日行星换座：');
        for (const ing of events.ingresses) lines.push(`  ${ing.symbol} ${ing.planet}：${ing.fromSign} → ${ing.toSign}`);
    }
    if (events.oppositions.length > 0) {
        lines.push('');
        lines.push('💥 行星对冲：');
        for (const opp of events.oppositions) lines.push(`  ${opp.symbol1}${opp.planet1}(${opp.sign1}) 对冲 ${opp.symbol2}${opp.planet2}(${opp.sign2})，容许度 ${opp.orb}°`);
    }
    return lines.join('\n');
}
