export interface SpecialEventWindow {
    startDate: string;
    endDate: string;
}

export type SpecialEventDateWindow = SpecialEventWindow;

export interface SpecialEventConfig {
    eventId: string;
    appAvailability: SpecialEventWindow | null;
    popupAvailability: SpecialEventWindow | null;
    dismissedKey: string;
    completedKey: string;
}

export type SpecialEventDefinition = SpecialEventConfig;
export type SpecialEventRegistry = Record<string, SpecialEventDefinition>;

export interface SpecialEventStorageLike {
    getItem(key: string): string | null;
}

export interface SpecialEventRuntimeOptions {
    now?: Date;
    storage?: SpecialEventStorageLike | null;
}

export interface SpecialEventVisibilityState {
    event: SpecialEventDefinition;
    entryVisible: boolean;
    popupVisible: boolean;
    dismissed: boolean;
    completed: boolean;
}

function toLocalDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function isSpecialEventWindowActive(
    window: SpecialEventWindow | null,
    now: Date = new Date(),
): boolean {
    if (!window) return false;
    const today = toLocalDateKey(now);
    return today >= window.startDate && today <= window.endDate;
}

function getBrowserStorage(): SpecialEventStorageLike | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
}

function readStorageFlag(
    storage: SpecialEventStorageLike | null,
    key: string,
): boolean {
    if (!storage) return false;

    try {
        return Boolean(storage.getItem(key));
    } catch {
        return false;
    }
}

export function getSpecialEventVisibilityState(
    event: SpecialEventDefinition,
    options: SpecialEventRuntimeOptions = {},
): SpecialEventVisibilityState {
    const now = options.now ?? new Date();
    const storage = options.storage ?? getBrowserStorage();
    const entryVisible = isSpecialEventWindowActive(event.appAvailability, now);
    const popupWindowActive = isSpecialEventWindowActive(event.popupAvailability, now);
    const dismissed = readStorageFlag(storage, event.dismissedKey);
    const completed = readStorageFlag(storage, event.completedKey);

    return {
        event,
        entryVisible,
        popupVisible: popupWindowActive && !dismissed && !completed,
        dismissed,
        completed,
    };
}

export function isSpecialEventEntryVisible(
    event: SpecialEventDefinition,
    now: Date = new Date(),
): boolean {
    return getSpecialEventVisibilityState(event, { now }).entryVisible;
}

export function shouldShowSpecialEventPopup(
    event: SpecialEventDefinition,
    options: SpecialEventRuntimeOptions = {},
): boolean {
    return getSpecialEventVisibilityState(event, options).popupVisible;
}

export const SPECIAL_EVENT_REGISTRY = {
    valentine_2026: {
        eventId: 'valentine_2026',
        appAvailability: {
            startDate: '2026-02-01',
            endDate: '2026-02-28',
        },
        popupAvailability: {
            startDate: '2026-02-14',
            endDate: '2026-02-14',
        },
        dismissedKey: 'sullyos_valentine_2026_dismissed',
        completedKey: 'sullyos_valentine_2026_completed',
    },
} as const satisfies SpecialEventRegistry;

export function getSpecialEventDefinition(eventId: string): SpecialEventDefinition | undefined {
    return (SPECIAL_EVENT_REGISTRY as SpecialEventRegistry)[eventId];
}

export function listVisibleSpecialEvents(
    now: Date = new Date(),
    registry: SpecialEventRegistry = SPECIAL_EVENT_REGISTRY,
): SpecialEventDefinition[] {
    return Object.values(registry).filter((event) => isSpecialEventEntryVisible(event, now));
}
