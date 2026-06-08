/**
 * WaveformCanvas — 实时波形可视化组件（仿微信竖线频谱）
 *
 * 设计原则：
 *   - 纯展示组件，接收 AnalyserNode、输出 canvas 绘制
 *   - 内部使用 useWaveform hook 驱动帧循环
 *   - 竖线居中对称（上下镜像），两端自然收窄（正弦包络）
 *   - 静音时柱子最小高度 2px，不会消失
 *   - 支持自定义颜色/尺寸，适配不同主题
 */

import React,{ useRef,useEffect,useCallback } from 'react';
import { useWaveform } from '../../hooks/useWaveform';

interface WaveformCanvasProps {
    /** AnalyserNode from useVoiceRecorder (null when not recording) */
    analyser: AnalyserNode | null;
    /** Number of bars to display (default 20) */
    barCount?: number;
    /** Bar color (default '#4ade80' emerald-400) */
    color?: string;
    /** Canvas height in px (default 48) */
    height?: number;
    /** Canvas width in px (default 160) */
    width?: number;
    /** Bar width in px (default 2) */
    barWidth?: number;
    /** Gap between bars in px (default 2) */
    barGap?: number;
    /** Minimum bar height in px (default 2) */
    minBarHeight?: number;
}

const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
    analyser,
    barCount = 20,
    color = '#4ade80',
    height = 48,
    width = 160,
    barWidth = 2,
    barGap = 2,
    minBarHeight = 2,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Pre-compute sinusoidal envelope for bar max heights (spindle shape)
    const envelopeRef = useRef<number[]>([]);
    useEffect(() => {
        envelopeRef.current = Array.from({ length: barCount }, (_, i) => {
            const t = i / (barCount - 1 || 1);
            return Math.sin(t * Math.PI); // 0 at edges, 1 at center
        });
    }, [barCount]);

    // Draw callback — called every animation frame
    const draw = useCallback((data: Uint8Array) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        const envelope = envelopeRef.current;
        const maxBarH = (h / 2) - 1; // half height minus 1px padding
        const binCount = data.length; // typically 32 (fftSize=64)

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.fillStyle = color;

        // Total width of all bars
        const totalBarsWidth = barCount * barWidth + (barCount - 1) * barGap;
        const startX = (w - totalBarsWidth) / 2;

        // Most human voice energy is in the lower frequencies (0-8kHz).
        // Since Nyquist could be up to 24kHz and we have `binCount` bins, 
        // looking at the upper half of the bins will just show silence (flat lines).
        // We focus on the bottom 50% of the frequency bins.
        const usableBins = Math.max(1, Math.floor(binCount * 0.5));

        for (let i = 0; i < barCount; i++) {
            // Map bar index to a frequency bin within the usable human voice range
            const binIdx = Math.min(Math.floor((i / barCount) * usableBins), usableBins - 1);

            // Add a visual gain multiplier (1.4x) to make it more dramatic and less 'flat'
            const rawValue = data[binIdx] / 255;
            const value = Math.min(1, rawValue * 1.4);

            // Apply sinusoidal envelope so edges are naturally shorter
            const envScale = envelope[i] ?? 0.1;
            const barH = Math.max(minBarHeight, value * maxBarH * envScale);

            const x = startX + i * (barWidth + barGap);
            const yTop = h / 2 - barH;

            // Draw symmetric bar (top half + bottom half mirrored)
            ctx.beginPath();
            ctx.roundRect(x, yTop, barWidth, barH * 2, barWidth / 2);
            ctx.fill();
        }

        ctx.restore();
    }, [color, barCount, barWidth, barGap, minBarHeight]);

    // Hook into waveform data
    useWaveform(analyser, draw);

    // Draw idle state when no analyser (all bars at minimum)
    useEffect(() => {
        if (analyser) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        const envelope = envelopeRef.current;
        const totalBarsWidth = barCount * barWidth + (barCount - 1) * barGap;
        const startX = (w - totalBarsWidth) / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.fillStyle = color;

        for (let i = 0; i < barCount; i++) {
            const envScale = envelope[i] ?? 0.1;
            const barH = Math.max(minBarHeight, minBarHeight * envScale * 2);
            const x = startX + i * (barWidth + barGap);
            ctx.beginPath();
            ctx.roundRect(x, h / 2 - barH, barWidth, barH * 2, barWidth / 2);
            ctx.fill();
        }
        ctx.restore();
    }, [analyser, barCount, barWidth, barGap, minBarHeight, color]);

    // Handle DPR-aware canvas sizing
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    return (
        <canvas
            ref={canvasRef}
            width={width * dpr}
            height={height * dpr}
            style={{
                width: `${width}px`,
                height: `${height}px`,
                display: 'block',
            }}
        />
    );
};

export default React.memo(WaveformCanvas);
