// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DynamicIsland from './DynamicIsland';
import { useApp } from '../../context/AppContext';
import type { AppContextType } from '../../context/AppContext';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useDominantColor } from '../../hooks/useDominantColor';
import { AppID } from '../../types';
import type { MemoryRecordPlayable } from '../../types/music';

vi.mock('motion/react', async () => {
    const React = await import('react');
    type MotionDivProps = React.HTMLAttributes<HTMLDivElement> & {
        animate?: unknown;
        exit?: unknown;
        initial?: unknown;
        layout?: unknown;
        transition?: unknown;
    };
    const MotionDiv = React.forwardRef<HTMLDivElement, MotionDivProps>((props, ref) => {
        const {
            animate,
            children,
            exit,
            initial,
            layout,
            transition,
            ...rest
        } = props;
        return React.createElement('div', { ...rest, ref }, children);
    });

    return {
        AnimatePresence: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
        motion: { div: MotionDiv },
        useWillChange: () => undefined,
    };
});

vi.mock('../../context/AppContext', () => ({
    useApp: vi.fn(),
}));

vi.mock('../../hooks/useAudioPlayer', () => ({
    useAudioPlayer: vi.fn(),
}));

vi.mock('../../hooks/useDominantColor', () => ({
    useDominantColor: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedUseAudioPlayer = vi.mocked(useAudioPlayer);
const mockedUseDominantColor = vi.mocked(useDominantColor);

type AudioPlayerApi = ReturnType<typeof useAudioPlayer>;

function buildMemoryRecord(overrides: Partial<MemoryRecordPlayable> = {}): MemoryRecordPlayable {
    return {
        kind: 'memoryRecord',
        id: 850000001,
        recordId: 'record-1',
        name: '梦里回声',
        artistName: 'Sully',
        albumName: '回忆唱片匣',
        duration: 120000,
        coverImageUrl: '/images/music-record-covers/cover-17.png',
        ...overrides,
    };
}

function buildAppContext(overrides: Partial<AppContextType> = {}): AppContextType {
    return {
        activeApp: AppID.Launcher,
        appParams: {},
        openApp: vi.fn(),
        closeApp: vi.fn(),
        isLocked: false,
        unlock: vi.fn(),
        registerBackHandler: vi.fn(() => vi.fn()),
        handleBack: vi.fn(() => false),
        hapticsEnabled: true,
        setHapticsEnabled: vi.fn(),
        ...overrides,
    };
}

function buildAudioPlayer(overrides: Partial<AudioPlayerApi> = {}): AudioPlayerApi {
    return {
        currentSong: null,
        isPlaying: false,
        progress: 0,
        currentTime: 0,
        duration: 0,
        volume: 0.8,
        playlist: [],
        currentIndex: -1,
        lastActivityAt: 0,
        playSong: vi.fn(async () => undefined),
        pause: vi.fn(),
        stop: vi.fn(),
        resume: vi.fn(async () => undefined),
        togglePlay: vi.fn(),
        seek: vi.fn(),
        seekToTime: vi.fn(),
        playNext: vi.fn(async () => undefined),
        playPrev: vi.fn(async () => undefined),
        setVolume: vi.fn(),
        ...overrides,
    };
}

describe('DynamicIsland', () => {
    beforeEach(() => {
        mockedUseApp.mockReturnValue(buildAppContext());
        mockedUseAudioPlayer.mockReturnValue(buildAudioPlayer());
        mockedUseDominantColor.mockReturnValue(null);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('uses memory record cover images in the capsule player', () => {
        const playable = buildMemoryRecord();
        mockedUseAudioPlayer.mockReturnValue(buildAudioPlayer({
            currentSong: playable,
            isPlaying: true,
            progress: 25,
            currentTime: 30,
            duration: 120,
        }));

        render(<DynamicIsland />);

        const cover = document.querySelector('.di-capsule-cover') as HTMLElement | null;
        expect(cover?.style.backgroundImage).toContain(playable.coverImageUrl);
        expect(screen.queryByText('♪')).toBeNull();
        expect(mockedUseDominantColor).toHaveBeenCalledWith(playable.coverImageUrl);
    });

    it('stops playback after a sustained capsule long press', () => {
        vi.useFakeTimers();
        const stop = vi.fn();
        mockedUseAudioPlayer.mockReturnValue(buildAudioPlayer({
            currentSong: buildMemoryRecord(),
            isPlaying: true,
            stop,
        }));

        render(<DynamicIsland />);

        const capsule = document.querySelector('.di-capsule') as HTMLElement | null;
        expect(capsule).not.toBeNull();

        act(() => {
            fireEvent.pointerDown(capsule!, { clientX: 20, clientY: 20 });
            vi.advanceTimersByTime(649);
        });
        expect(stop).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(stop).toHaveBeenCalledTimes(1);
    });

    it('does not stop playback when the capsule press ends before the long-press threshold', () => {
        vi.useFakeTimers();
        const stop = vi.fn();
        mockedUseAudioPlayer.mockReturnValue(buildAudioPlayer({
            currentSong: buildMemoryRecord(),
            isPlaying: true,
            stop,
        }));

        render(<DynamicIsland />);

        const capsule = document.querySelector('.di-capsule') as HTMLElement | null;
        expect(capsule).not.toBeNull();

        act(() => {
            fireEvent.pointerDown(capsule!, { clientX: 20, clientY: 20 });
            vi.advanceTimersByTime(300);
            fireEvent.pointerUp(capsule!, { clientX: 20, clientY: 20 });
            vi.advanceTimersByTime(350);
        });

        expect(stop).not.toHaveBeenCalled();
    });

    it('cancels the capsule long press when the pointer moves too far', () => {
        vi.useFakeTimers();
        const stop = vi.fn();
        mockedUseAudioPlayer.mockReturnValue(buildAudioPlayer({
            currentSong: buildMemoryRecord(),
            isPlaying: true,
            stop,
        }));

        render(<DynamicIsland />);

        const capsule = document.querySelector('.di-capsule') as HTMLElement | null;
        expect(capsule).not.toBeNull();

        act(() => {
            fireEvent.pointerDown(capsule!, { clientX: 20, clientY: 20 });
            fireEvent.pointerMove(capsule!, { clientX: 33, clientY: 20 });
            vi.advanceTimersByTime(650);
        });

        expect(stop).not.toHaveBeenCalled();
    });
});
