import { describe, expect, it } from 'vitest';
import { getLameMp3Encoder } from '../utils/lameMp3Encoder';

describe('lame MP3 encoder loader', () => {
    it('loads the bundled encoder without the broken CommonJS entrypoint', () => {
        const Mp3Encoder = getLameMp3Encoder();
        const encoder = new Mp3Encoder(1, 44100, 128);
        const silence = new Int16Array(1152);

        const head = encoder.encodeBuffer(silence);
        const tail = encoder.flush();

        expect(head.length + tail.length).toBeGreaterThan(0);
    });
});
