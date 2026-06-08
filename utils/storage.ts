export function safeLocalStorageGet(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function safeLocalStorageSet(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Keep storage writes non-fatal.
    }
}

export function safeLocalStorageRemove(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // Keep storage writes non-fatal.
    }
}

export function readJsonStorage<T>(key: string): T | null {
    const raw = safeLocalStorageGet(key);
    if (!raw) return null;

    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function writeJsonStorage(key: string, value: unknown): void {
    safeLocalStorageSet(key, JSON.stringify(value));
}
