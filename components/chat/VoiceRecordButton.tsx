/**
 * VoiceRecordButton.tsx — 按住录音按钮 + 录音状态 UI
 *
 * 交互方式：按住说话，上滑取消，松开发送。
 * 录音中显示脉冲动画和计时器，上滑时变为红色取消提示。
 */

import React,{ useRef,useState,useCallback } from 'react';
import WaveformCanvas from './WaveformCanvas';

interface VoiceRecordButtonProps {
    /** Called when a voice recording is completed */
    onVoiceMessage: (blob: Blob, duration: number) => void;
    /** External processing state (e.g. STT running) */
    isProcessing?: boolean;
    /** Disable the button */
    disabled?: boolean;
    /** Whether voice recording is supported */
    isSupported?: boolean;
    /** Recording state from useVoiceRecorder */
    recorderState: 'idle' | 'recording' | 'processing';
    /** Current recording duration in seconds */
    recordingDuration: number;
    /** Start recording function */
    onStartRecording: () => Promise<boolean>;
    /** Stop recording function */
    onStopRecording: () => Promise<{ blob: Blob; duration: number } | null>;
    /** Cancel recording function */
    onCancelRecording: () => void;
    /** Error message */
    error?: string | null;
    /** AnalyserNode for real-time waveform (from useVoiceRecorder) */
    analyserNode?: AnalyserNode | null;
    /** Whether Silero VAD detects active speech */
    isSpeaking?: boolean;
}

/** Vertical distance (px) to trigger cancel */
const CANCEL_THRESHOLD = 50;

const VoiceRecordButton: React.FC<VoiceRecordButtonProps> = ({
    onVoiceMessage,
    isProcessing = false,
    disabled = false,
    recorderState,
    recordingDuration,
    onStartRecording,
    onStopRecording,
    onCancelRecording,
    error,
    analyserNode,
    isSpeaking = false,
}) => {
    const [isOverCancel, setIsOverCancel] = useState(false);
    const startYRef = useRef(0);
    const isRecordingRef = useRef(false);

    const formatDuration = (s: number) => {
        const min = Math.floor(s / 60);
        const sec = s % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    // --- Touch / Mouse handlers for press-hold recording ---

    const handlePointerDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if (disabled || recorderState !== 'idle') return;

        // Prevent default to stop text selection / context menu on long press
        e.preventDefault();

        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        startYRef.current = clientY;
        setIsOverCancel(false);

        // 同步标记开始，异步启动录音（不阻塞触摸事件）
        isRecordingRef.current = true;
        onStartRecording().then(ok => {
            if (!ok) {
                isRecordingRef.current = false;
            }
        }).catch(() => {
            isRecordingRef.current = false;
        });
    }, [disabled, recorderState, onStartRecording]);

    const handlePointerMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if (!isRecordingRef.current) return;

        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const dy = startYRef.current - clientY; // positive = moved up
        setIsOverCancel(dy > CANCEL_THRESHOLD);
    }, []);

    const handlePointerUp = useCallback(async () => {
        if (!isRecordingRef.current) return;
        isRecordingRef.current = false;

        if (isOverCancel) {
            onCancelRecording();
            setIsOverCancel(false);
            return;
        }

        const result = await onStopRecording();
        if (result && result.blob.size > 0) {
            onVoiceMessage(result.blob, Math.max(1, result.duration));
        }
        setIsOverCancel(false);
    }, [isOverCancel, onCancelRecording, onStopRecording, onVoiceMessage]);

    const isRecording = recorderState === 'recording';
    const showOverlay = isRecording;

    return (
        <>
            {/* Mic Button */}
            <button
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={() => { if (isRecordingRef.current) handlePointerUp(); }}
                onContextMenu={(e) => e.preventDefault()}
                disabled={disabled || isProcessing}
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all select-none
                    ${isRecording
                        ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-200'
                        : isProcessing
                            ? 'bg-slate-200 text-slate-400'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 active:bg-slate-300'
                    }`}
                style={{ touchAction: 'none' }}
                title={error || '按住说话'}
            >
                {isProcessing ? (
                    /* Spinner */
                    <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                ) : (
                    /* Mic icon */
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                    </svg>
                )}
            </button>

            {/* Recording Overlay */}
            {showOverlay && (
                <div
                    className="fixed inset-0 z-[999] flex flex-col items-center justify-end pb-32 pointer-events-none"
                    style={{ background: 'transparent' }}
                >
                    {/* Transparent touch catcher for gestures — pointer events on */}
                    <div
                        className="absolute inset-0 pointer-events-auto"
                        onTouchMove={handlePointerMove}
                        onTouchEnd={handlePointerUp}
                        onMouseMove={handlePointerMove}
                        onMouseUp={handlePointerUp}
                        style={{ touchAction: 'none' }}
                    />

                    {/* Recording indicator card */}
                    <div className={`relative pointer-events-none px-8 py-5 rounded-3xl backdrop-blur-2xl shadow-2xl border transition-all duration-200 ${isOverCancel
                        ? 'bg-red-500/90 border-red-400/50 scale-105'
                        : 'bg-black/70 border-white/10'
                        }`}>
                        {/* Cancel hint */}
                        <div className={`text-center text-xs font-bold mb-3 transition-colors ${isOverCancel ? 'text-white' : 'text-white/50'
                            }`}>
                            {isOverCancel ? '松开取消' : '↑ 上滑取消'}
                        </div>

                        {/* Waveform — real-time via AnalyserNode */}
                        <div className="flex items-center justify-center mb-3">
                            <WaveformCanvas
                                analyser={analyserNode ?? null}
                                barCount={20}
                                color={isOverCancel ? 'rgba(255,255,255,0.5)' : isSpeaking ? '#4ade80' : 'rgba(74,222,128,0.35)'}
                                height={36}
                                width={140}
                                barWidth={2}
                                barGap={2}
                                minBarHeight={2}
                            />
                        </div>

                        {/* Duration */}
                        <div className="text-center text-white text-lg font-mono font-bold tracking-wider">
                            {formatDuration(recordingDuration)}
                        </div>
                    </div>
                </div>
            )}

        </>
    );
};

export default React.memo(VoiceRecordButton);
