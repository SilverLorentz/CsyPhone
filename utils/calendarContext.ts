import type { Anniversary } from '../types';
import { DB } from './db';

export type CalendarContextLabelKind = 'fixed' | 'anniversary';

export interface CalendarContextLabel {
    id: string;
    title: string;
    kind: CalendarContextLabelKind;
    date: string;
    daysUntil?: number;
    charId?: string;
}

export interface CalendarContext {
    localDate: string;
    todayLabels: CalendarContextLabel[];
    upcomingLabels: CalendarContextLabel[];
}

export interface CalendarDisplayLabels {
    visibleLabels: CalendarContextLabel[];
    hiddenCount: number;
}

const UPCOMING_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const FIXED_GREGORIAN_SPECIAL_DATES: Record<string, string> = {
    '01-01': '元旦',
    '02-14': '情人节',
    '03-08': '妇女节',
    '03-12': '植树节',
    '04-01': '愚人节',
    '05-01': '劳动节',
    '05-04': '青年节',
    '05-20': '520',
    '06-01': '儿童节',
    '09-10': '教师节',
    '10-01': '国庆节',
    '10-31': '万圣节',
    '11-11': '光棍节',
    '12-24': '平安夜',
    '12-25': '圣诞节',
};

function pad(value: number): string {
    return value.toString().padStart(2, '0');
}

export function toLocalDateKey(date: Date = new Date()): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toMonthDay(dateKey: string): string {
    return dateKey.slice(5, 10);
}

function parseLocalDateKey(dateKey: string): Date | null {
    const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(year, month - 1, day);
}

function getDaysUntil(localDate: string, targetDate: string): number | null {
    const current = parseLocalDateKey(localDate);
    const target = parseLocalDateKey(targetDate);
    if (!current || !target) return null;
    current.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - current.getTime()) / MS_PER_DAY);
}

export function getFixedGregorianLabelsForDate(localDate: string): CalendarContextLabel[] {
    const monthDay = toMonthDay(localDate);
    const title = FIXED_GREGORIAN_SPECIAL_DATES[monthDay];
    if (!title) return [];
    return [{
        id: `fixed-${monthDay}`,
        title,
        kind: 'fixed',
        date: localDate,
    }];
}

export function getFixedSpecialDateTitles(date: Date = new Date()): string[] {
    return getFixedGregorianLabelsForDate(toLocalDateKey(date)).map(label => label.title);
}

export function buildCalendarContext(
    charId: string,
    anniversaries: Anniversary[] = [],
    now: Date = new Date(),
): CalendarContext {
    const localDate = toLocalDateKey(now);
    const fixedTodayLabels = getFixedGregorianLabelsForDate(localDate);
    const relevantAnniversaries = anniversaries.filter(anniversary => anniversary.charId === charId);
    const anniversaryLabels = relevantAnniversaries
        .map((anniversary): CalendarContextLabel | null => {
            const daysUntil = getDaysUntil(localDate, anniversary.date);
            if (daysUntil === null || daysUntil < 0 || daysUntil > UPCOMING_WINDOW_DAYS) return null;
            return {
                id: anniversary.id,
                title: anniversary.title,
                kind: 'anniversary',
                date: anniversary.date,
                daysUntil,
                charId: anniversary.charId,
            };
        })
        .filter((label): label is CalendarContextLabel => !!label)
        .sort((left, right) => {
            const dayDiff = (left.daysUntil ?? 0) - (right.daysUntil ?? 0);
            return dayDiff || left.date.localeCompare(right.date) || left.title.localeCompare(right.title);
        });

    const todayAnniversaryLabels = anniversaryLabels.filter(label => label.daysUntil === 0)
        .map(({ daysUntil, ...label }) => label);
    const upcomingLabels = anniversaryLabels.filter(label => (label.daysUntil ?? 0) > 0);

    return {
        localDate,
        todayLabels: [...fixedTodayLabels, ...todayAnniversaryLabels],
        upcomingLabels,
    };
}

export async function loadCalendarContextForCharacter(
    charId: string,
    now: Date = new Date(),
): Promise<CalendarContext> {
    let anniversaries: Anniversary[] = [];
    try {
        anniversaries = await DB.getAllAnniversaries();
    } catch {
        anniversaries = [];
    }
    return buildCalendarContext(charId, anniversaries, now);
}

export function getCalendarDisplayLabels(
    labels: CalendarContextLabel[],
    maxVisible = 3,
): CalendarDisplayLabels {
    const visibleLimit = Math.max(0, maxVisible);
    return {
        visibleLabels: labels.slice(0, visibleLimit),
        hiddenCount: Math.max(0, labels.length - visibleLimit),
    };
}

export function formatCalendarContextForPrompt(calendarContext: CalendarContext): string {
    const today = calendarContext.todayLabels.map(label => label.title).join('、');
    const upcoming = calendarContext.upcomingLabels
        .map(label => (
            typeof label.daysUntil === 'number'
                ? `${label.daysUntil}天后 ${label.title}（${label.date}）`
                : `${label.title}（${label.date}）`
        ))
        .join('、');

    if (!today && !upcoming) return '';

    return [
        '### 【特殊日期与纪念日】',
        `日期: ${calendarContext.localDate}`,
        today ? `今天: ${today}` : '',
        upcoming ? `未来7天: ${upcoming}` : '',
        '使用方式: 这是现实日期信息，可以自然影响语气、关心、准备和今天的安排；不需要每次都主动提，也不要硬转节日话题。',
    ].filter(Boolean).join('\n');
}
