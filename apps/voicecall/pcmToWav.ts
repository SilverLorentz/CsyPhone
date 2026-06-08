/**
 * pcmToWav.ts — Int16LE PCM 碎片 → 标准 WAV Blob
 *
 * 用于将语音通话中收集的 TTS PCM 数据合并并打包为
 * 可直接播放 / 下载的 WAV 文件（16-bit, mono）。
 */

/**
 * 将多段 Int16LE PCM 数据合并并加上 44 字节 WAV 文件头，
 * 生成一个可直接播放的 audio/wav Blob。
 *
 * @param chunks  - 多段 Uint8Array（Int16LE 编码 PCM）
 * @param sampleRate - 采样率（与 TTS 输出一致，通常 24000）
 * @returns WAV Blob
 */
export function pcmChunksToWavBlob(chunks: Uint8Array[], sampleRate: number = 24000): Blob {
    // 1. 计算总字节数
    let totalBytes = 0;
    for (const chunk of chunks) {
        totalBytes += chunk.byteLength;
    }

    if (totalBytes === 0) {
        // 返回一个空的但合法的 WAV
        return new Blob([createWavHeader(0, sampleRate)], { type: 'audio/wav' });
    }

    // 2. 合并所有 PCM 数据
    const pcmData = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        pcmData.set(chunk, offset);
        offset += chunk.byteLength;
    }

    // 3. 创建 WAV 头并拼接
    const header = createWavHeader(totalBytes, sampleRate);

    return new Blob([header, pcmData], { type: 'audio/wav' });
}

/**
 * 创建 44 字节标准 WAV 文件头（PCM, 16-bit, mono）
 */
function createWavHeader(pcmByteLength: number, sampleRate: number): ArrayBuffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmByteLength, true); // ChunkSize
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);           // Subchunk1Size (PCM = 16)
    view.setUint16(20, 1, true);            // AudioFormat (PCM = 1)
    view.setUint16(22, numChannels, true);  // NumChannels
    view.setUint32(24, sampleRate, true);   // SampleRate
    view.setUint32(28, byteRate, true);     // ByteRate
    view.setUint16(32, blockAlign, true);   // BlockAlign
    view.setUint16(34, bitsPerSample, true); // BitsPerSample

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, pcmByteLength, true); // Subchunk2Size

    return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
