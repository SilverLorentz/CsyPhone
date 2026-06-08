// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PhoneShell from './PhoneShell';
import { AppID } from '../types';
import { VirtualTimeProvider } from '../context/VirtualTimeContext';
import { useOS } from '../context/OSContext';
import { Capacitor } from '@capacitor/core';
import { StatusBar as CapStatusBar } from '@capacitor/status-bar';

let launcherRenderCount = 0;
let statusBarRenderCount = 0;

vi.mock('../context/OSContext', () => ({
    useOS: vi.fn(),
}));

vi.mock('../apps/Launcher', async () => {
    const React = await import('react');
    return {
        default: () => {
            launcherRenderCount += 1;
            return React.createElement('div', null, 'Launcher App');
        },
    };
});

vi.mock('./os/StatusBar', async () => {
    const React = await import('react');
    const { useVirtualTime } = await import('../context/VirtualTimeContext');

    return {
        default: () => {
            statusBarRenderCount += 1;
            const virtualTime = useVirtualTime();
            return React.createElement('div', { 'data-testid': 'status-bar' }, `status:${virtualTime.hours}:${virtualTime.minutes}`);
        },
    };
});

vi.mock('./os/AppSplashScreen', async () => {
    const React = await import('react');
    return {
        default: () => React.createElement('div', null, 'Loading App'),
    };
});

vi.mock('../apps/zhaixinglou/ZhaixinglouApp', async () => {
    const React = await import('react');
    return {
        default: () => React.createElement('div', null, 'Zhaixinglou App'),
    };
});

vi.mock('../apps/EchoRecordApp', async () => {
    const React = await import('react');
    return {
        default: () => React.createElement('div', null, 'EchoRecord App'),
    };
});

vi.mock('../apps/CheckPhone', async () => {
    const React = await import('react');
    return {
        default: () => React.createElement('div', null, 'CheckPhone App'),
    };
});

vi.mock('../apps/zhaixinglou/AssetPreloader', () => ({
    prefetchZhaixinglouAssets: vi.fn(() => Promise.resolve()),
}));

vi.mock('./os/UpdatePopup', async () => {
    const React = await import('react');
    return {
        default: () => React.createElement(React.Fragment, null),
    };
});

vi.mock('./os/DynamicIsland', async () => {
    const React = await import('react');
    return {
        default: () => React.createElement('div', { 'data-testid': 'dynamic-island' }, 'Dynamic Island'),
    };
});

vi.mock('./os/FloatingLyrics', async () => {
    const React = await import('react');
    return {
        default: () => React.createElement('div', { 'data-testid': 'floating-lyrics' }, 'Floating Lyrics'),
    };
});

vi.mock('./ValentineEvent', async () => {
    const React = await import('react');
    return {
        SpecialMomentsApp: () => React.createElement(React.Fragment, null),
        ValentineController: () => React.createElement(React.Fragment, null),
    };
});

vi.mock('../utils/specialEvents', () => ({
    getSpecialEventDefinition: vi.fn(() => null),
    shouldShowSpecialEventPopup: vi.fn(() => false),
}));

vi.mock('../utils/haptics', () => ({
    haptic: {
        light: vi.fn(),
    },
}));

vi.mock('../utils/runtimeRecovery', () => ({
    attemptChunkAutoReload: vi.fn(() => false),
    isChunkLoadError: vi.fn(() => false),
    reloadApplication: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: vi.fn(() => false),
        getPlatform: vi.fn(() => 'web'),
    },
}));

vi.mock('@capacitor/app', () => ({
    App: {
        addListener: vi.fn(),
        exitApp: vi.fn(),
        removeAllListeners: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('@capacitor/status-bar', () => ({
    StatusBar: {
        hide: vi.fn(),
        setOverlaysWebView: vi.fn(),
        setStyle: vi.fn(),
    },
    Style: {
        Dark: 'dark',
    },
    Animation: {
        None: 'NONE',
    },
}));

vi.mock('@capacitor/local-notifications', () => ({
    LocalNotifications: {
        checkPermissions: vi.fn(() => Promise.resolve({ display: 'granted' })),
        requestPermissions: vi.fn(() => Promise.resolve({ display: 'granted' })),
    },
}));

vi.mock('../utils/systemFullscreen', () => ({
    requestSystemFullscreen: vi.fn(),
}));

const mockedUseOS = vi.mocked(useOS);

describe('PhoneShell active app rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));

        launcherRenderCount = 0;
        statusBarRenderCount = 0;

        localStorage.clear();
        localStorage.setItem('sullyos_disclaimer_accepted', '1');
        vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
        vi.mocked(Capacitor.getPlatform).mockReturnValue('web');

        window.scrollTo = vi.fn();
        window.requestIdleCallback = ((callback: IdleRequestCallback) => window.setTimeout(() => callback({
            didTimeout: false,
            timeRemaining: () => 50,
        }), 1)) as typeof window.requestIdleCallback;
        window.cancelIdleCallback = ((id: number) => window.clearTimeout(id)) as typeof window.cancelIdleCallback;

        mockedUseOS.mockReturnValue({
            activeApp: AppID.Launcher,
            characters: [],
            closeApp: vi.fn(),
            handleBack: vi.fn(() => true),
            isDataLoaded: true,
            isLocked: false,
            theme: {
                wallpaper: 'linear-gradient(#000000, #111111)',
                hideStatusBar: false,
            },
            toasts: [],
            unreadMessages: {},
            unlock: vi.fn(),
        } as any);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not rerender the active app during same-minute virtual time checks', async () => {
        render(
            <VirtualTimeProvider>
                <PhoneShell />
            </VirtualTimeProvider>,
        );

        expect(launcherRenderCount).toBe(1);

        await act(async () => {
            vi.advanceTimersByTime(500);
            await Promise.resolve();
            await Promise.resolve();
        });
        const statusBarCountAfterIdleOverlays = statusBarRenderCount;

        await act(async () => {
            vi.advanceTimersByTime(3100);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(statusBarRenderCount).toBe(statusBarCountAfterIdleOverlays);
        expect(launcherRenderCount).toBe(1);
    });

    it('marks lite mode and lowers active-app background blur', async () => {
        vi.useRealTimers();
        localStorage.setItem('sullyos_performance_mode', 'on');
        mockedUseOS.mockReturnValue({
            activeApp: AppID.EchoRecord,
            characters: [],
            closeApp: vi.fn(),
            handleBack: vi.fn(() => true),
            isDataLoaded: true,
            isLocked: false,
            theme: {
                wallpaper: 'linear-gradient(#000000, #111111)',
                hideStatusBar: false,
            },
            toasts: [],
            unreadMessages: {},
            unlock: vi.fn(),
        } as any);

        render(
            <VirtualTimeProvider>
                <PhoneShell />
            </VirtualTimeProvider>,
        );

        expect(await screen.findByText('EchoRecord App', {}, { timeout: 3000 })).toBeTruthy();
        expect(screen.getByTestId('phone-shell-root')).toHaveAttribute('data-performance-mode', 'lite');
        expect(screen.getByTestId('phone-shell-background')).toHaveStyle({ filter: 'none' });
    });

    it('delays ambient overlays in lite mode until after idle', async () => {
        localStorage.setItem('sullyos_performance_mode', 'on');

        render(
            <VirtualTimeProvider>
                <PhoneShell />
            </VirtualTimeProvider>,
        );

        expect(screen.queryByTestId('dynamic-island')).toBeNull();

        await act(async () => {
            vi.advanceTimersByTime(2499);
            await Promise.resolve();
        });
        expect(screen.queryByTestId('dynamic-island')).toBeNull();

        await act(async () => {
            vi.advanceTimersByTime(3);
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByTestId('dynamic-island')).toBeTruthy();
        expect(screen.getByTestId('floating-lyrics')).toBeTruthy();
    });

    it('hides outer system chrome while CheckPhone is active', async () => {
        mockedUseOS.mockReturnValue({
            activeApp: AppID.CheckPhone,
            characters: [],
            closeApp: vi.fn(),
            handleBack: vi.fn(() => true),
            isDataLoaded: true,
            isLocked: false,
            theme: {
                wallpaper: 'linear-gradient(#000000, #111111)',
                hideStatusBar: false,
            },
            toasts: [],
            unreadMessages: {},
            unlock: vi.fn(),
        } as any);

        render(
            <VirtualTimeProvider>
                <PhoneShell />
            </VirtualTimeProvider>,
        );

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByText('CheckPhone App')).toBeTruthy();
        expect(screen.getByTestId('phone-shell-root')).toHaveAttribute('data-system-chrome', 'hidden');
        expect(screen.queryByTestId('status-bar')).toBeNull();

        await act(async () => {
            vi.advanceTimersByTime(4000);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.queryByTestId('dynamic-island')).toBeNull();
        expect(screen.queryByTestId('floating-lyrics')).toBeNull();
    });

    it('renders the EchoRecord app when it is the active app', async () => {
        vi.useRealTimers();
        mockedUseOS.mockReturnValue({
            activeApp: AppID.EchoRecord,
            characters: [],
            closeApp: vi.fn(),
            handleBack: vi.fn(() => true),
            isDataLoaded: true,
            isLocked: false,
            theme: {
                wallpaper: 'linear-gradient(#000000, #111111)',
                hideStatusBar: false,
            },
            toasts: [],
            unreadMessages: {},
            unlock: vi.fn(),
        } as any);

        render(
            <VirtualTimeProvider>
                <PhoneShell />
            </VirtualTimeProvider>,
        );

        expect(await screen.findByText('EchoRecord App', {}, { timeout: 3000 })).toBeTruthy();
    });

    it('does not call the Android-only overlay API before hiding the iOS status bar', async () => {
        vi.useRealTimers();
        vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
        vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');

        render(
            <VirtualTimeProvider>
                <PhoneShell />
            </VirtualTimeProvider>,
        );

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(CapStatusBar.setOverlaysWebView).not.toHaveBeenCalled();
        expect(CapStatusBar.hide).toHaveBeenCalledWith({ animation: 'NONE' });
    });
});
