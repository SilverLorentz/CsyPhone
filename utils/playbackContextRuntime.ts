import type { PlaybackState } from '../hooks/useAudioPlayer';

export const PLAYBACK_CONTEXT_STALE_AFTER_MS = 15_000;

export function shouldInjectPlaybackContextFromState(
    playback: PlaybackState | null | undefined,
    now = Date.now(),
): boolean {
    if (!playback?.currentSong) return false;
    if (playback.isPlaying) return true;
    if (playback.currentTime <= 0) return false;
    if (!playback.lastActivityAt) return false;

    return now - playback.lastActivityAt <= PLAYBACK_CONTEXT_STALE_AFTER_MS;
}
