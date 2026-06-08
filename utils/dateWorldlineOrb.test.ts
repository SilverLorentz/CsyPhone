import { describe, expect, it } from 'vitest';
import {
    DATE_WORLDLINE_520_DAY_COMPLETED_KEY,
    DATE_WORLDLINE_COMPLETED_KEY,
    DATE_WORLDLINE_READY_CHAR_KEY,
    clearReadyWorldlineCharId,
    get520CountdownText,
    getDateWorldlineIntroLines,
    getReadyWorldlineCharId,
    is520Day,
    isDateWorldlineCompleted,
    markDateWorldlineCompleted,
    readStorageFlag,
    setReadyWorldlineCharId,
    writeStorageFlag,
    type StorageLike,
} from './dateWorldlineOrb';

function createStorage(entries: Record<string, string> = {}): StorageLike {
    return {
        getItem(key: string) {
            return Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null;
        },
        setItem(key: string, value: string) {
            entries[key] = value;
        },
        removeItem(key: string) {
            delete entries[key];
        },
    };
}

describe('dateWorldlineOrb', () => {
    it('uses the requested 520 countdown copy on May 18/19/20', () => {
        expect(get520CountdownText(new Date(2026, 4, 18))).toBe('还有 2 天就是 520 了');
        expect(get520CountdownText(new Date(2026, 4, 19))).toBe('明天就是 520 了');
        expect(get520CountdownText(new Date(2026, 4, 20))).toBe('今天就是 520 了');
    });

    it('uses the 520 day blessing copy as two bubbles', () => {
        expect(getDateWorldlineIntroLines({
            now: new Date(2026, 4, 20),
            charName: '苏离',
            userName: '糯米',
        })).toEqual([
            [
                '吱吱吱冲出来！',
                '520 到啦到啦撒花ing',
                '',
                '祝愿 苏离 和 糯米',
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
        ]);
    });

    it('lets the 520 day appear once even if the pre-520 reminder already completed', () => {
        const storage = createStorage({ [DATE_WORLDLINE_COMPLETED_KEY]: 'done-before' });
        const may20 = new Date(2026, 4, 20);

        expect(is520Day(may20)).toBe(true);
        expect(isDateWorldlineCompleted(storage, may20)).toBe(false);

        markDateWorldlineCompleted(storage, may20);

        expect(readStorageFlag(DATE_WORLDLINE_520_DAY_COMPLETED_KEY, storage)).toBe(true);
        expect(isDateWorldlineCompleted(storage, may20)).toBe(true);
    });

    it('also marks the base completion flag when completed on 520 day', () => {
        const storage = createStorage();

        markDateWorldlineCompleted(storage, new Date(2026, 4, 20));

        expect(readStorageFlag(DATE_WORLDLINE_520_DAY_COMPLETED_KEY, storage)).toBe(true);
        expect(readStorageFlag(DATE_WORLDLINE_COMPLETED_KEY, storage)).toBe(true);
    });

    it('stores the one-time completed flag locally', () => {
        const storage = createStorage();
        const before520 = new Date(2026, 4, 19);

        expect(isDateWorldlineCompleted(storage, before520)).toBe(false);
        markDateWorldlineCompleted(storage, before520);

        expect(isDateWorldlineCompleted(storage, before520)).toBe(true);
        expect(readStorageFlag(DATE_WORLDLINE_COMPLETED_KEY, storage)).toBe(true);
    });

    it('stores the ready character in session-like storage', () => {
        const storage = createStorage();

        expect(getReadyWorldlineCharId(storage)).toBeNull();
        setReadyWorldlineCharId('char-520', storage);
        expect(getReadyWorldlineCharId(storage)).toBe('char-520');

        clearReadyWorldlineCharId(storage);
        expect(getReadyWorldlineCharId(storage)).toBeNull();
        expect(readStorageFlag(DATE_WORLDLINE_READY_CHAR_KEY, storage)).toBe(false);
    });

    it('ignores missing storage safely', () => {
        expect(readStorageFlag('missing', null)).toBe(false);
        expect(() => writeStorageFlag('missing', null)).not.toThrow();
    });
});
