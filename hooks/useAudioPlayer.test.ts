import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicPlayable, NeteaseSong } from '../types/music';

const resolvePlayableUrlMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/musicService', () => ({
    resolvePlayableUrl: resolvePlayableUrlMock,
}));

type PlayBehavior = 'resolve' | 'reject';

const sampleSong: NeteaseSong = {
    kind: 'song',
    id: 9527,
    name: 'Test Song',
    artists: [{ id: 1, name: 'Tester' }],
    album: {
        kind: 'album',
        id: 24,
        name: 'Test Album',
    },
    duration: 240000,
};

let audioInstances: MockAudioElement[] = [];
let playBehaviors: PlayBehavior[] = [];

class MockMediaError {
    readonly code = 4;
    readonly message = 'The element has no supported sources.';
}

class MockAudioElement {
    readonly NETWORK_EMPTY = 0;
    readonly NETWORK_IDLE = 1;
    readonly NETWORK_LOADING = 2;
    readonly NETWORK_NO_SOURCE = 3;

    preload = '';
    volume = 1;
    muted = false;
    currentTime = 0;
    duration = 240;
    paused = true;
    ended = false;
    networkState = this.NETWORK_EMPTY;
    error: MockMediaError | null = null;

    readonly play = vi.fn(async () => {
        const behavior = playBehaviors.shift() || 'resolve';
        if (behavior === 'reject') {
            this.paused = true;
            this.error = new MockMediaError();
            this.networkState = this.NETWORK_NO_SOURCE;
            this.dispatchEventType('error');
            throw new Error('The element has no supported sources.');
        }

        this.paused = false;
        this.ended = false;
        this.error = null;
        this.networkState = this.NETWORK_IDLE;
        this.dispatchEventType('play');
    });

    readonly pause = vi.fn(() => {
        this.paused = true;
        this.dispatchEventType('pause');
    });

    readonly load = vi.fn(() => {
        if (this.source) {
            this.networkState = this.NETWORK_LOADING;
            this.error = null;
        } else {
            this.networkState = this.NETWORK_EMPTY;
        }
    });

    private source = '';
    private readonly attributes = new Set<string>();
    private readonly listeners = new Map<string, Set<() => void>>();

    constructor() {
        audioInstances.push(this);
    }

    get src(): string {
        return this.source;
    }

    set src(value: string) {
        this.source = value;
        if (value) {
            this.attributes.add('src');
            this.networkState = this.NETWORK_IDLE;
            this.error = null;
        } else {
            this.attributes.delete('src');
            this.networkState = this.NETWORK_EMPTY;
        }
    }

    get currentSrc(): string {
        return this.source;
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    getAttribute(name: string): string | null {
        return this.attributes.has(name) ? this.source : null;
    }

    removeAttribute(name: string): void {
        if (name === 'src') {
            this.source = '';
            this.error = null;
            this.networkState = this.NETWORK_EMPTY;
        }
        this.attributes.delete(name);
    }

    addEventListener(name: string, listener: () => void): void {
        const listeners = this.listeners.get(name) || new Set<() => void>();
        listeners.add(listener);
        this.listeners.set(name, listeners);
    }

    private dispatchEventType(name: string): void {
        this.listeners.get(name)?.forEach((listener) => listener());
    }
}

async function loadPlayer() {
    const module = await import('./useAudioPlayer');
    const rendered = renderHook(() => module.useAudioPlayer());
    return {
        ...module,
        ...rendered,
    };
}

async function playSong(playSongFn: (song: MusicPlayable, playlist?: MusicPlayable[]) => Promise<void>): Promise<void> {
    await act(async () => {
        await playSongFn(sampleSong);
    });
}

describe('useAudioPlayer', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        audioInstances = [];
        playBehaviors = [];
        vi.stubGlobal('Audio', MockAudioElement);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('re-resolves the playable after failed sources instead of logging a resume error', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        resolvePlayableUrlMock
            .mockResolvedValueOnce('https://audio.example/bad.mp3')
            .mockResolvedValueOnce('https://audio.example/fresh.mp3');
        playBehaviors = ['resolve', 'reject', 'reject', 'resolve', 'resolve'];
        const { result } = await loadPlayer();

        await playSong(result.current.playSong);

        expect(resolvePlayableUrlMock).toHaveBeenCalledTimes(1);
        expect(audioInstances[0].src).toBe('');

        act(() => {
            result.current.togglePlay();
        });

        await waitFor(() => {
            expect(resolvePlayableUrlMock).toHaveBeenCalledTimes(2);
        });
        expect(audioInstances[0].src).toBe('https://audio.example/fresh.mp3');
        expect(consoleErrorSpy).not.toHaveBeenCalledWith(
            '[AudioPlayer] Resume error:',
            expect.anything(),
        );
    });

    it('resumes a healthy paused source without requesting a new playback URL', async () => {
        resolvePlayableUrlMock.mockResolvedValue('https://audio.example/song.mp3');
        playBehaviors = ['resolve', 'resolve', 'resolve'];
        const { result } = await loadPlayer();

        await playSong(result.current.playSong);

        act(() => {
            result.current.pause();
        });

        await waitFor(() => {
            expect(result.current.isPlaying).toBe(false);
        });

        act(() => {
            result.current.togglePlay();
        });

        await waitFor(() => {
            expect(result.current.isPlaying).toBe(true);
        });
        expect(resolvePlayableUrlMock).toHaveBeenCalledTimes(1);
        expect(audioInstances[0].play).toHaveBeenCalledTimes(3);
    });

    it('clears an expired paused source and retries with a freshly resolved URL', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        resolvePlayableUrlMock
            .mockResolvedValueOnce('https://audio.example/expired.mp3')
            .mockResolvedValueOnce('https://audio.example/refreshed.mp3');
        playBehaviors = ['resolve', 'resolve', 'reject', 'resolve', 'resolve'];
        const { result } = await loadPlayer();

        await playSong(result.current.playSong);

        act(() => {
            result.current.pause();
        });

        await waitFor(() => {
            expect(result.current.isPlaying).toBe(false);
        });

        act(() => {
            result.current.togglePlay();
        });

        await waitFor(() => {
            expect(resolvePlayableUrlMock).toHaveBeenCalledTimes(2);
        });
        await waitFor(() => {
            expect(result.current.isPlaying).toBe(true);
        });
        expect(audioInstances[0].src).toBe('https://audio.example/refreshed.mp3');
        expect(consoleErrorSpy).not.toHaveBeenCalledWith(
            '[AudioPlayer] Resume error:',
            expect.anything(),
        );
    });
});
