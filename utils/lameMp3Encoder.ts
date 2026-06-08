import lameBundleSource from 'lamejs/lame.min.js?raw';

export interface Mp3EncoderLike {
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array | Uint8Array;
    flush(): Int8Array | Uint8Array;
}

export interface Mp3EncoderConstructor {
    new (channels: number, sampleRate: number, kbps: number): Mp3EncoderLike;
}

interface LameBundle {
    Mp3Encoder?: Mp3EncoderConstructor;
}

let cachedMp3Encoder: Mp3EncoderConstructor | null = null;

export function getLameMp3Encoder(): Mp3EncoderConstructor {
    if (cachedMp3Encoder) return cachedMp3Encoder;

    const loadBundle = new Function(`${lameBundleSource}\nreturn lamejs;`) as () => LameBundle;
    const bundle = loadBundle();
    if (!bundle?.Mp3Encoder) {
        throw new Error('MP3 encoder failed to load');
    }

    cachedMp3Encoder = bundle.Mp3Encoder;
    return cachedMp3Encoder;
}
