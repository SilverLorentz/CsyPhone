import { describe,expect,it } from 'vitest';

import type { PlaybackState } from '../hooks/useAudioPlayer';
import { PLAYBACK_CONTEXT_STALE_AFTER_MS,shouldInjectPlaybackContextFromState } from '../utils/playbackContextRuntime';
import type { NeteaseSong } from '../types/music';

function createSong(): NeteaseSong {
    return {
        kind: 'song',
        id: 42,
        name: '晴天',
        artists: [{ id: 1, name: '周杰伦' }],
        album: {
            kind: 'album',
            id: 7,
            name: '叶惠美',
        },
        duration: 269000,
    };
}

function createPlaybackState(overrides: Partial<PlaybackState> = {}): PlaybackState {
    return {
        isPlaying: false,
        currentSong: createSong(),
        currentTime: 32,
        duration: 269,
        progress: 12,
        volume: 0.8,
        playlist: [createSong()],
        currentIndex: 0,
        lastActivityAt: 10_000,
        ...overrides,
    };
}

describe('shouldInjectPlaybackContextFromState', () => {
    it('returns true while playback is active', () => {
        expect(
            shouldInjectPlaybackContextFromState(
                createPlaybackState({
                    isPlaying: true,
                    currentTime: 0,
                    lastActivityAt: 0,
                }),
                20_000,
            ),
        ).toBe(true);
    });

    it('returns true for a recently paused track that already started', () => {
        expect(
            shouldInjectPlaybackContextFromState(
                createPlaybackState({
                    isPlaying: false,
                    currentTime: 48,
                    lastActivityAt: 20_000,
                }),
                20_000 + PLAYBACK_CONTEXT_STALE_AFTER_MS - 1,
            ),
        ).toBe(true);
    });

    it('returns false when the paused track has gone stale', () => {
        expect(
            shouldInjectPlaybackContextFromState(
                createPlaybackState({
                    isPlaying: false,
                    currentTime: 48,
                    lastActivityAt: 20_000,
                }),
                20_000 + PLAYBACK_CONTEXT_STALE_AFTER_MS + 1,
            ),
        ).toBe(false);
    });

    it('returns false when a track never really started playing', () => {
        expect(
            shouldInjectPlaybackContextFromState(
                createPlaybackState({
                    isPlaying: false,
                    currentTime: 0,
                    lastActivityAt: 20_000,
                }),
                20_100,
            ),
        ).toBe(false);
    });
});
