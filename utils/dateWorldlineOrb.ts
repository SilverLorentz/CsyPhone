export const DATE_WORLDLINE_EVENT_ID = 'sullyos_520_date_worldline_2026';
export const DATE_WORLDLINE_COMPLETED_KEY = `${DATE_WORLDLINE_EVENT_ID}_completed`;
export const DATE_WORLDLINE_520_DAY_COMPLETED_KEY = `${DATE_WORLDLINE_EVENT_ID}_520_day_completed`;
export const DATE_WORLDLINE_READY_CHAR_KEY = `${DATE_WORLDLINE_EVENT_ID}_ready_char`;
export const DATE_WORLDLINE_THEATER_GUIDE_KEY = `${DATE_WORLDLINE_EVENT_ID}_date_guide_seen`;
export const DATE_WORLDLINE_LOCATION_GUIDE_KEY = `${DATE_WORLDLINE_EVENT_ID}_location_guide_seen`;

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

function getLocalStorage(): StorageLike | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

function getSessionStorage(): StorageLike | null {
    try {
        return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
        return null;
    }
}

export function readStorageFlag(key: string, storage: StorageLike | null = getLocalStorage()): boolean {
    if (!storage) return false;
    try {
        return Boolean(storage.getItem(key));
    } catch {
        return false;
    }
}

export function writeStorageFlag(key: string, storage: StorageLike | null = getLocalStorage()): void {
    if (!storage) return;
    try {
        storage.setItem(key, String(Date.now()));
    } catch {
        // Ignore storage failures; the guide can safely reappear.
    }
}

export function is520Day(now: Date = new Date()): boolean {
    return now.getMonth() === 4 && now.getDate() === 20;
}

export function getDateWorldlineCompletionKey(now: Date = new Date()): string {
    return is520Day(now) ? DATE_WORLDLINE_520_DAY_COMPLETED_KEY : DATE_WORLDLINE_COMPLETED_KEY;
}

export function isDateWorldlineCompleted(
    storage: StorageLike | null = getLocalStorage(),
    now: Date = new Date(),
): boolean {
    return readStorageFlag(getDateWorldlineCompletionKey(now), storage);
}

export function markDateWorldlineCompleted(
    storage: StorageLike | null = getLocalStorage(),
    now: Date = new Date(),
): void {
    if (is520Day(now)) {
        writeStorageFlag(DATE_WORLDLINE_520_DAY_COMPLETED_KEY, storage);
        writeStorageFlag(DATE_WORLDLINE_COMPLETED_KEY, storage);
        return;
    }

    writeStorageFlag(getDateWorldlineCompletionKey(now), storage);
}

export function getReadyWorldlineCharId(storage: StorageLike | null = getSessionStorage()): string | null {
    if (!storage) return null;
    try {
        return storage.getItem(DATE_WORLDLINE_READY_CHAR_KEY);
    } catch {
        return null;
    }
}

export function setReadyWorldlineCharId(charId: string, storage: StorageLike | null = getSessionStorage()): void {
    if (!storage) return;
    try {
        storage.setItem(DATE_WORLDLINE_READY_CHAR_KEY, charId);
    } catch {
        // Ignore storage failures; current component state still carries the flow.
    }
}

export function clearReadyWorldlineCharId(storage: StorageLike | null = getSessionStorage()): void {
    if (!storage) return;
    try {
        storage.removeItem(DATE_WORLDLINE_READY_CHAR_KEY);
    } catch {
        // Ignore storage failures.
    }
}

export function get520CountdownText(now: Date = new Date()): string {
    const month = now.getMonth();
    const day = now.getDate();

    if (month === 4 && day === 18) return '还有 2 天就是 520 了';
    if (month === 4 && day === 19) return '明天就是 520 了';
    if (month === 4 && day === 20) return '今天就是 520 了';

    const target = new Date(now.getFullYear(), 4, 20);
    const today = new Date(now.getFullYear(), month, day);
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / 86400000);

    if (diffDays > 1) return `还有 ${diffDays} 天就是 520 了`;
    if (diffDays === 1) return '明天就是 520 了';
    if (diffDays === 0) return '今天就是 520 了';
    return '这个五月，还有一场约会没出发';
}

export function getDateWorldlineIntroLines({
    now = new Date(),
    charName,
    userName,
}: {
    now?: Date;
    charName: string;
    userName: string;
}): string[] {
    if (is520Day(now)) {
        return [
            [
                '吱吱吱冲出来！',
                '520 到啦到啦撒花ing',
                '',
                `祝愿 ${charName} 和 ${userName}`,
                '不管去哪里，只要是你们一起走进去的地方，',
                '不管虚假还是真实，',
                '都能感受到最寻常的幸福',
            ].join('\n'),
            [
                '准备好了吗？',
                '',
                '戳我戳我',
                '吱带你们出发去美味糯米鸡吧！',
            ].join('\n'),
        ];
    }

    return [
        '吱吱吱探头。',
        `${get520CountdownText(now)}。`,
        '小情侣怎么能只隔着屏幕聊天呀。',
        '吱偷偷开了一条新的约会世界线哦。',
        '不能每天住在这个糯米鸡里面，年轻人，要多出去走走！',
        '你们快商量商量要去哪约会吧，讨论好了戳我！zzzzz',
    ];
}
