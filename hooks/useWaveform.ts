/**
 * useWaveform.ts — 实时波形数据 Hook
 *
 * 独立模块：驱动 requestAnimationFrame 循环，从 AnalyserNode 采样频率数据。
 * 设计原则：
 *   - 纯数据 Hook，不含任何渲染逻辑
 *   - analyser 为 null 时停止循环，零开销
 *   - 返回 Uint8Array 引用（每帧原地更新），消费者用 canvas 读取即可
 */

import { useRef,useEffect,useCallback } from 'react';

/**
 * 从 AnalyserNode 持续采样频率数据。
 *
 * @param analyser  录音中的 AnalyserNode，录音结束传 null
 * @param onFrame   每帧回调，收到最新的 frequencyData（Uint8Array）
 */
export function useWaveform(
    analyser: AnalyserNode | null,
    onFrame: (data: Uint8Array<ArrayBuffer>) => void,
) {
    const rafRef = useRef<number>(0);
    const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
    const onFrameRef = useRef(onFrame);
    onFrameRef.current = onFrame;

    const tick = useCallback(() => {
        if (!analyser || !bufferRef.current) return;
        analyser.getByteFrequencyData(bufferRef.current);
        onFrameRef.current(bufferRef.current);
        rafRef.current = requestAnimationFrame(tick);
    }, [analyser]);

    useEffect(() => {
        if (!analyser) {
            bufferRef.current = null;
            return;
        }

        // Allocate buffer once per analyser instance
        bufferRef.current = new Uint8Array(analyser.frequencyBinCount);

        // Start RAF loop
        rafRef.current = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(rafRef.current);
        };
    }, [analyser, tick]);
}
