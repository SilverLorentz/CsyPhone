// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { masterMemoryRecordAudio } from '../utils/memoryRecordMastering';

vi.mock('../utils/lameMp3Encoder', () => ({
    getLameMp3Encoder: () => class MockMp3Encoder {
        encodeBuffer() {
            return new Uint8Array([1]);
        }

        flush() {
            return new Uint8Array([2]);
        }
    },
}));

function makeAudioBuffer(length: number, sampleRate: number): AudioBuffer {
    return {
        length,
        sampleRate,
        duration: length / sampleRate,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(length),
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
    } as unknown as AudioBuffer;
}

describe('memory record mastering', () => {
    beforeEach(() => {
        const decodeQueue = [
            makeAudioBuffer(2000, 1000),
            makeAudioBuffer(5000, 1000),
        ];

        class MockAudioContext {
            sampleRate = 1000;
            decodeAudioData = vi.fn(async () => decodeQueue.shift() || makeAudioBuffer(0, 1000));
            close = vi.fn(async () => undefined);
        }

        Object.defineProperty(window, 'AudioContext', {
            configurable: true,
            value: MockAudioContext,
        });
    });

    it('returns the music offset from the mastered monologue timeline', async () => {
        const result = await masterMemoryRecordAudio({
            monologueBlob: new Blob(['monologue'], { type: 'audio/mpeg' }),
            musicBlob: new Blob(['music'], { type: 'audio/mpeg' }),
            gapMs: 900,
        });

        expect(result.durationMs).toBe(7900);
        expect(result.musicOffsetMs).toBe(2900);
        expect(result.blob.size).toBeGreaterThan(0);
    });
});
