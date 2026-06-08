import { describe,expect,it } from 'vitest';
import {
  getSpecialEventVisibilityState,
  getSpecialEventDefinition,
  isSpecialEventEntryVisible,
  shouldShowSpecialEventPopup,
  type SpecialEventDefinition,
} from './specialEvents';

function createStorage(entries: Record<string, string> = {}) {
    return {
        getItem(key: string) {
            return Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null;
        },
    };
}

describe('specialEvents', () => {
    const valentine = getSpecialEventDefinition('valentine_2026');

    it('registers valentine as the first special event', () => {
        expect(valentine).toMatchObject({
            eventId: 'valentine_2026',
            appAvailability: { startDate: '2026-02-01', endDate: '2026-02-28' },
            popupAvailability: { startDate: '2026-02-14', endDate: '2026-02-14' },
        });
    });

    it('treats the app entry window as an inclusive date range', () => {
        expect(valentine).toBeDefined();
        expect(isSpecialEventEntryVisible(valentine!, new Date(2026, 1, 1))).toBe(true);
        expect(isSpecialEventEntryVisible(valentine!, new Date(2026, 1, 28))).toBe(true);
        expect(isSpecialEventEntryVisible(valentine!, new Date(2026, 0, 31))).toBe(false);
        expect(isSpecialEventEntryVisible(valentine!, new Date(2026, 2, 1))).toBe(false);
    });

    it('hides the popup outside its window or after dismissal/completion', () => {
        expect(valentine).toBeDefined();

        expect(shouldShowSpecialEventPopup(valentine!, {
            now: new Date(2026, 1, 13),
            storage: createStorage(),
        })).toBe(false);

        expect(shouldShowSpecialEventPopup(valentine!, {
            now: new Date(2026, 1, 14),
            storage: createStorage(),
        })).toBe(true);

        expect(shouldShowSpecialEventPopup(valentine!, {
            now: new Date(2026, 1, 14),
            storage: createStorage({ [valentine!.dismissedKey]: '1' }),
        })).toBe(false);

        expect(shouldShowSpecialEventPopup(valentine!, {
            now: new Date(2026, 1, 14),
            storage: createStorage({ [valentine!.completedKey]: '1' }),
        })).toBe(false);
    });

    it('hides both the special entry and popup on 2026-04-07', () => {
        expect(valentine).toBeDefined();

        const state = getSpecialEventVisibilityState(valentine!, {
            now: new Date(2026, 3, 7),
            storage: createStorage(),
        });

        expect(state.entryVisible).toBe(false);
        expect(state.popupVisible).toBe(false);
    });

    it('shows the entry across the event window but limits popup to the popup window', () => {
        expect(valentine).toBeDefined();

        const entryOnlyState = getSpecialEventVisibilityState(valentine!, {
            now: new Date(2026, 1, 10),
            storage: createStorage(),
        });
        expect(entryOnlyState.entryVisible).toBe(true);
        expect(entryOnlyState.popupVisible).toBe(false);

        const popupState = getSpecialEventVisibilityState(valentine!, {
            now: new Date(2026, 1, 14),
            storage: createStorage(),
        });
        expect(popupState.entryVisible).toBe(true);
        expect(popupState.popupVisible).toBe(true);

        const dismissedPopupState = getSpecialEventVisibilityState(valentine!, {
            now: new Date(2026, 1, 14),
            storage: createStorage({ [valentine!.dismissedKey]: '1' }),
        });
        expect(dismissedPopupState.entryVisible).toBe(true);
        expect(dismissedPopupState.popupVisible).toBe(false);

        const completedPopupState = getSpecialEventVisibilityState(valentine!, {
            now: new Date(2026, 1, 14),
            storage: createStorage({ [valentine!.completedKey]: '1' }),
        });
        expect(completedPopupState.entryVisible).toBe(true);
        expect(completedPopupState.popupVisible).toBe(false);
    });

    it('reuses the same generic state helper for newly added events without bespoke helpers', () => {
        const springEvent: SpecialEventDefinition = {
            eventId: 'spring_festival_demo',
            appAvailability: { startDate: '2026-04-01', endDate: '2026-04-10' },
            popupAvailability: { startDate: '2026-04-05', endDate: '2026-04-06' },
            dismissedKey: 'spring_demo_dismissed',
            completedKey: 'spring_demo_completed',
        };

        const prePopupState = getSpecialEventVisibilityState(springEvent, {
            now: new Date(2026, 3, 4),
            storage: createStorage(),
        });
        expect(prePopupState.entryVisible).toBe(true);
        expect(prePopupState.popupVisible).toBe(false);

        const popupState = getSpecialEventVisibilityState(springEvent, {
            now: new Date(2026, 3, 5),
            storage: createStorage(),
        });
        expect(popupState.entryVisible).toBe(true);
        expect(popupState.popupVisible).toBe(true);
    });
});
