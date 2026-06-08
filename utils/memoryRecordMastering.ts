import { getLameMp3Encoder } from './lameMp3Encoder';

export interface MasterMemoryRecordAudioOptions {
    monologueBlob: Blob;
    musicBlob: Blob;
    gapMs?: number;
    bitrateKbps?: number;
}

export interface MasterMemoryRecordAudioResult {
    blob: Blob;
    durationMs: number;
    musicOffsetMs: number;
}

function getAudioContext(): AudioContext {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
        throw new Error('当前浏览器不支持 Web Audio，无法压制最终 MP3');
    }
    return new AudioContextClass();
}

async function decodeBlob(context: AudioContext, blob: Blob): Promise<AudioBuffer> {
    const buffer = await blob.arrayBuffer();
    return context.decodeAudioData(buffer.slice(0));
}

function copyBufferInto(
    source: AudioBuffer,
    target: Float32Array[],
    offset: number,
    fadeInFrames = 0,
): void {
    const channelCount = target.length;
    for (let channel = 0; channel < channelCount; channel++) {
        const sourceData = source.getChannelData(Math.min(channel, source.numberOfChannels - 1));
        const targetData = target[channel];

        for (let i = 0; i < source.length; i++) {
            const fadeGain = fadeInFrames > 0 && i < fadeInFrames ? i / fadeInFrames : 1;
            targetData[offset + i] = Math.max(-1, Math.min(1, sourceData[i] * fadeGain));
        }
    }
}

function floatToInt16(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const sample = Math.max(-1, Math.min(1, input[i]));
        output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output;
}

async function encodeMp3(channelData: Float32Array[], sampleRate: number, bitrateKbps: number): Promise<Blob> {
    const channels = channelData.length;
    const Mp3Encoder = getLameMp3Encoder();
    const encoder = new Mp3Encoder(channels, sampleRate, bitrateKbps);
    const parts: BlobPart[] = [];
    const blockSize = 1152;
    const totalSamples = channelData[0]?.length || 0;

    for (let offset = 0; offset < totalSamples; offset += blockSize) {
        const left = floatToInt16(channelData[0].subarray(offset, offset + blockSize));
        const encoded = channels > 1
            ? encoder.encodeBuffer(left, floatToInt16(channelData[1].subarray(offset, offset + blockSize)))
            : encoder.encodeBuffer(left);

        if (encoded.length > 0) {
            const chunk = new ArrayBuffer(encoded.byteLength);
            new Uint8Array(chunk).set(encoded);
            parts.push(chunk);
        }
    }

    const tail = encoder.flush();
    if (tail.length > 0) {
        const chunk = new ArrayBuffer(tail.byteLength);
        new Uint8Array(chunk).set(tail);
        parts.push(chunk);
    }

    return new Blob(parts, { type: 'audio/mpeg' });
}

export async function masterMemoryRecordAudio({
    monologueBlob,
    musicBlob,
    gapMs = 900,
    bitrateKbps = 160,
}: MasterMemoryRecordAudioOptions): Promise<MasterMemoryRecordAudioResult> {
    const context = getAudioContext();

    try {
        const [monologue, music] = await Promise.all([
            decodeBlob(context, monologueBlob),
            decodeBlob(context, musicBlob),
        ]);

        const channels = Math.min(2, Math.max(monologue.numberOfChannels, music.numberOfChannels, 1));
        const sampleRate = context.sampleRate;
        const gapFrames = Math.round((gapMs / 1000) * sampleRate);
        const musicOffset = monologue.length + gapFrames;
        const totalFrames = musicOffset + music.length;
        const channelData = Array.from({ length: channels }, () => new Float32Array(totalFrames));

        copyBufferInto(monologue, channelData, 0);
        copyBufferInto(music, channelData, musicOffset, Math.round(sampleRate * 0.18));

        const blob = await encodeMp3(channelData, sampleRate, bitrateKbps);
        return {
            blob,
            durationMs: Math.round((totalFrames / sampleRate) * 1000),
            musicOffsetMs: Math.round((musicOffset / sampleRate) * 1000),
        };
    } finally {
        try {
            await context.close();
        } catch {
            // Ignore close failures in older Safari/WebView.
        }
    }
}
