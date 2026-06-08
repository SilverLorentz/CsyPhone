import type { CharacterProfile, Message } from '../types';

export type CurrentLifeAnchorStatus = 'rest' | 'home' | 'work' | 'class' | 'out' | 'unknown';
export type CurrentLifeAnchorSource = 'recent_fact' | 'character_schedule' | 'fallback';
export type CurrentLifeAnchorConfidence = 'explicit' | 'inferred' | 'fallback';

export interface CurrentLifeAnchor {
    localDate: string;
    weekday: string;
    timeStr: string;
    timeLabel: string;
    status: CurrentLifeAnchorStatus;
    place?: string;
    activity?: string;
    source: CurrentLifeAnchorSource;
    sourceDetail: string;
    confidence: CurrentLifeAnchorConfidence;
    summary: string;
    conflictHint?: string;
    selectedWorkdays?: string[];
}

interface AnchorCandidate {
    priority: number;
    status: CurrentLifeAnchorStatus;
    place?: string;
    activity?: string;
    source: CurrentLifeAnchorSource;
    sourceDetail: string;
    confidence: CurrentLifeAnchorConfidence;
    selectedWorkdays?: string[];
}

const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五'] as const;
const WEEKDAY_INDEX: Record<string, number> = {
    星期一: 0,
    星期二: 1,
    星期三: 2,
    星期四: 3,
    星期五: 4,
    星期六: 5,
    星期日: 6,
};

export function buildCurrentLifeAnchorForCharacter(
    char: CharacterProfile,
    messages: Message[],
    timestamp: number = Date.now(),
): CurrentLifeAnchor {
    const localDateInfo = getLocalDateInfo(timestamp);
    const candidates = [
        buildRecentFactCandidate(messages, timestamp),
        buildScheduleCandidate(char, localDateInfo),
    ].filter((candidate): candidate is AnchorCandidate => !!candidate);

    const selected = candidates.sort((left, right) => right.priority - left.priority)[0] || {
        priority: 0,
        status: 'unknown',
        source: 'fallback',
        sourceDetail: 'no_current_schedule_fact',
        confidence: 'fallback',
        activity: '按角色设定保持弹性，不从旧聊天推断当前位置',
    } satisfies AnchorCandidate;

    const anchor: CurrentLifeAnchor = {
        ...localDateInfo,
        status: selected.status,
        place: selected.place,
        activity: selected.activity,
        source: selected.source,
        sourceDetail: selected.sourceDetail,
        confidence: selected.confidence,
        selectedWorkdays: selected.selectedWorkdays,
        summary: buildSummary(selected),
    };

    if (anchor.status === 'rest' || anchor.status === 'home') {
        anchor.conflictHint = '旧历史或生活碎片里的“在店里/上班/刚下班”等内容只能当作过去记录，不能覆盖当前休息/在家的锚点。';
    }
    return anchor;
}

export function formatCurrentLifeAnchorForPrompt(anchor: CurrentLifeAnchor): string {
    const lines = [
        '### 【当前日程锚点】',
        `- 当前本地时间: ${anchor.localDate} ${anchor.weekday} ${anchor.timeStr}（${anchor.timeLabel}）`,
        `- 此刻状态: ${anchor.summary}`,
        '- 优先级: 当前轮/当天明确事实 > 角色当前日程安排 > 当天生成快照 > 位置缓存 > 旧聊天/旧生活碎片/旧记忆。',
        '- 约束: 旧聊天里“在店里/上班/刚吃饭”等内容若与这个锚点冲突，只能当过去发生过，不能当现在正在发生。',
    ];
    if (anchor.selectedWorkdays?.length) {
        lines.push(`- 本周确定性随机上班日: ${anchor.selectedWorkdays.join('、')}；不在列表里的工作日不能默认写成上班。`);
    }
    if (anchor.conflictHint) {
        lines.push(`- 冲突提醒: ${anchor.conflictHint}`);
    }
    return lines.join('\n');
}

export function pickDeterministicWeekdays(
    charId: string,
    localDate: string,
    count: number,
): string[] {
    const weekStart = getWeekStartDate(localDate);
    let seed = hashString(`${charId || 'unknown'}:${weekStart}:${count}`);
    const days = [...WEEKDAYS];

    for (let index = days.length - 1; index > 0; index--) {
        seed = nextSeed(seed);
        const swapIndex = seed % (index + 1);
        [days[index], days[swapIndex]] = [days[swapIndex], days[index]];
    }

    return days.slice(0, Math.max(0, Math.min(5, count))).sort((left, right) => {
        return WEEKDAY_INDEX[left] - WEEKDAY_INDEX[right];
    });
}

function buildRecentFactCandidate(
    messages: Message[],
    now: number,
): AnchorCandidate | null {
    const currentDay = new Date(now).toDateString();
    const recentMessages = messages
        .filter(message => !message.metadata?.hiddenFromUser)
        .filter(message => message.metadata?.source !== 'date')
        .filter(message => (message.type as string) !== 'lifestream')
        .filter(message => new Date(message.timestamp).toDateString() === currentDay)
        .slice(-20);

    for (let index = recentMessages.length - 1; index >= 0; index--) {
        const message = recentMessages[index];
        const parsed = parseCurrentFactText(message.content);
        if (!parsed) continue;

        const isUser = message.role === 'user';
        const isFresh = now - message.timestamp < 90 * 60_000;
        if (!isUser && !isFresh) continue;

        return {
            ...parsed,
            priority: isUser ? 120 : 72,
            source: 'recent_fact',
            sourceDetail: isUser ? 'recent_user_correction_or_current_fact' : 'recent_assistant_current_fact',
            confidence: 'explicit',
        };
    }
    return null;
}

function buildScheduleCandidate(
    char: CharacterProfile,
    localDateInfo: ReturnType<typeof getLocalDateInfo>,
): AnchorCandidate | null {
    const worldbooks = (char.mountedWorldbooks || [])
        .map(item => `${item.title || ''}\n${item.content || ''}`)
        .join('\n');
    const text = normalizeText([
        char.systemPrompt,
        char.description,
        char.worldview,
        worldbooks,
    ].filter(Boolean).join('\n'));
    if (!text) return null;

    const todayFact = parseTodayScheduleText(text);
    if (todayFact) {
        return {
            ...todayFact,
            priority: 88,
            source: 'character_schedule',
            sourceDetail: 'character_schedule_explicit_today',
            confidence: 'explicit',
        };
    }

    const randomWork = parseRandomWeekdayWork(text);
    if (randomWork && localDateInfo.isWorkday) {
        const selectedWorkdays = pickDeterministicWeekdays(char.id, localDateInfo.localDate, randomWork.count);
        const selectedToday = selectedWorkdays.includes(localDateInfo.weekday);
        return {
            priority: 84,
            status: selectedToday ? 'work' : 'rest',
            place: selectedToday ? '工作地点' : '住处',
            activity: selectedToday
                ? `本周随机 ${randomWork.count} 天上班，今天在选中的上班日内`
                : `本周随机 ${randomWork.count} 天上班，今天不在选中的上班日内`,
            source: 'character_schedule',
            sourceDetail: 'character_schedule_random_weekday_work',
            confidence: 'inferred',
            selectedWorkdays,
        };
    }
    if (randomWork && !localDateInfo.isWorkday) {
        return {
            priority: 84,
            status: 'rest',
            place: '住处',
            activity: `设定只在周一到周五随机 ${randomWork.count} 天上班，今天是休息日`,
            source: 'character_schedule',
            sourceDetail: 'character_schedule_random_weekday_work',
            confidence: 'inferred',
            selectedWorkdays: pickDeterministicWeekdays(char.id, localDateInfo.localDate, randomWork.count),
        };
    }

    if (/晚上[^。；;\n]{0,16}(上班|值班|有班|店里)/.test(text)) {
        const nightWork = localDateInfo.hour >= 18 || localDateInfo.hour < 2;
        if (nightWork) {
            return {
                priority: 78,
                status: 'work',
                place: '工作地点',
                activity: '设定里夜间更可能在上班/店里',
                source: 'character_schedule',
                sourceDetail: 'character_schedule_time_rule',
                confidence: 'inferred',
            };
        }
        if (/白天[^。；;\n]{0,20}(咖啡店|咖啡馆)/.test(text)) {
            return {
                priority: 76,
                status: 'out',
                place: '常去咖啡店',
                activity: '设定里白天更可能在咖啡店',
                source: 'character_schedule',
                sourceDetail: 'character_schedule_time_rule',
                confidence: 'inferred',
            };
        }
    }

    if (/宅在家|待在家|在家里|家里/.test(text)) {
        return {
            priority: 70,
            status: 'home',
            place: '住处',
            activity: '设定中有在家/宅家倾向',
            source: 'character_schedule',
            sourceDetail: 'character_schedule_home_hint',
            confidence: 'inferred',
        };
    }

    if (/上课|课程|教室|学校|大学|高中/.test(text) && localDateInfo.isWorkday && localDateInfo.hour >= 7 && localDateInfo.hour < 18) {
        return {
            priority: 68,
            status: 'class',
            place: '学校/教室',
            activity: '设定中有上课/学校日程',
            source: 'character_schedule',
            sourceDetail: 'character_schedule_class_hint',
            confidence: 'inferred',
        };
    }

    return null;
}

function parseCurrentFactText(text: string): Omit<AnchorCandidate, 'priority' | 'source' | 'sourceDetail' | 'confidence'> | null {
    const value = normalizeText(text);
    if (/(今天|明明今天|现在|此刻|刚刚|刚才)?[^。；;\n]{0,8}(休息日|休息|不用上班|不上班|没班|放假)/.test(value)) {
        return { status: 'rest', place: '住处', activity: '今天明确是休息/不上班' };
    }
    if (/(刚做完晚饭|做完晚饭|吃完晚饭|在家吃|家里吃|在家|家里|家中)/.test(value)) {
        return { status: 'home', place: '住处', activity: '最近明确在家或刚处理完家里的饭点' };
    }
    if (/(今天|现在|此刻|刚刚|刚才)?[^。；;\n]{0,10}(在店里|到店里|上班|值班|有班|工位|公司)/.test(value)) {
        return { status: 'work', place: '工作地点', activity: '最近明确在上班/店里' };
    }
    if (/(今天|现在|此刻|刚刚|刚才)?[^。；;\n]{0,10}(上课|有课|教室|学校)/.test(value)) {
        return { status: 'class', place: '学校/教室', activity: '最近明确在上课/学校' };
    }
    return null;
}

function parseTodayScheduleText(text: string): Omit<AnchorCandidate, 'priority' | 'source' | 'sourceDetail' | 'confidence'> | null {
    if (/(今天|今日)[^。；;\n]{0,18}(休息日|休息|不用上班|不上班|没班|放假)/.test(text)) {
        return { status: 'rest', place: '住处', activity: '角色日程写明今天休息/不上班' };
    }
    if (/(今天|今日)[^。；;\n]{0,18}(上班|值班|有班|在店里)/.test(text)) {
        return { status: 'work', place: '工作地点', activity: '角色日程写明今天上班/有班' };
    }
    if (/(今天|今日)[^。；;\n]{0,18}(上课|有课|去学校)/.test(text)) {
        return { status: 'class', place: '学校/教室', activity: '角色日程写明今天上课/去学校' };
    }
    return null;
}

function parseRandomWeekdayWork(text: string): { count: number } | null {
    const patterns = [
        /周一到周五[^。；;\n]{0,30}随机\s*([一二两三四五六七八九十\d]+)\s*天[^。；;\n]{0,30}(上班|值班|有班)/,
        /工作日[^。；;\n]{0,30}随机\s*([一二两三四五六七八九十\d]+)\s*天[^。；;\n]{0,30}(上班|值班|有班)/,
        /随机\s*([一二两三四五六七八九十\d]+)\s*天[^。；;\n]{0,30}(上班|值班|有班)/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        const count = parseChineseNumber(match?.[1]);
        if (count && count > 0) return { count: Math.max(1, Math.min(5, count)) };
    }
    return null;
}

function getLocalDateInfo(timestamp: number) {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const minute = date.getMinutes();
    const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()];
    const pad = (value: number) => value.toString().padStart(2, '0');
    return {
        localDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        weekday,
        isWorkday: date.getDay() >= 1 && date.getDay() <= 5,
        hour,
        minute,
        timeStr: `${pad(hour)}:${pad(minute)}`,
        timeLabel: getTimeLabel(hour),
    };
}

function getTimeLabel(hour: number): string {
    if (hour >= 5 && hour < 7) return '清晨';
    if (hour >= 7 && hour < 9) return '早上';
    if (hour >= 9 && hour < 11) return '上午';
    if (hour >= 11 && hour < 13) return '中午';
    if (hour >= 13 && hour < 15) return '午后';
    if (hour >= 15 && hour < 17) return '下午';
    if (hour >= 17 && hour < 19) return '傍晚';
    if (hour >= 19 && hour < 21) return '晚上';
    if (hour >= 21 && hour < 23) return '深夜';
    return '凌晨';
}

function buildSummary(candidate: AnchorCandidate): string {
    const label: Record<CurrentLifeAnchorStatus, string> = {
        rest: '休息/不上班',
        home: '在家',
        work: '上班/在工作地点',
        class: '上课/在学校',
        out: '外出',
        unknown: '未明确',
    };
    const place = candidate.place ? `，地点倾向：${candidate.place}` : '';
    const activity = candidate.activity ? `，活动：${candidate.activity}` : '';
    return `${label[candidate.status]}${place}${activity}`;
}

function normalizeText(value: string): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseChineseNumber(value: unknown): number | null {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return Number(raw);
    const map: Record<string, number> = {
        一: 1,
        二: 2,
        两: 2,
        三: 3,
        四: 4,
        五: 5,
        六: 6,
        七: 7,
        八: 8,
        九: 9,
        十: 10,
    };
    if (raw === '十') return 10;
    if (raw.length === 1) return map[raw] || null;
    if (raw.startsWith('十')) return 10 + (map[raw.slice(1)] || 0);
    if (raw.includes('十')) {
        const [tens, ones] = raw.split('十');
        return (map[tens] || 1) * 10 + (map[ones] || 0);
    }
    return null;
}

function getWeekStartDate(localDate: string): string {
    const [year, month, day] = localDate.split('-').map(Number);
    const date = new Date(year || 1970, (month || 1) - 1, day || 1);
    const dayOfWeek = date.getDay();
    const mondayOffset = (dayOfWeek + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hashString(value: string): number {
    let hash = 5381;
    for (let index = 0; index < value.length; index++) {
        hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
    }
    return hash >>> 0;
}

function nextSeed(seed: number): number {
    return (seed * 1664525 + 1013904223) >>> 0;
}
