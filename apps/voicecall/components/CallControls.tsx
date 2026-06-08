import React,{ useState,useCallback,useRef } from 'react';
import { MicrophoneSlash,Microphone,PhoneDisconnect,ChatCircle,SpeakerHigh,SpeakerLow,SpeakerSlash } from '@phosphor-icons/react';

interface CallControlsProps {
    isMuted: boolean;
    onToggleMute: () => void;
    onEndCall: () => void;
    isTextInputVisible: boolean;
    onToggleTextInput: () => void;
    // ─── 音量控制 ───
    volume?: number;
    onVolumeChange?: (v: number) => void;
    voiceInputDisabled?: boolean;
    voiceInputFallbackReason?: string;
    audioOutputDisabled?: boolean;
    audioOutputDisabledReason?: string;
}

const CallControls: React.FC<CallControlsProps> = ({
    isMuted,
    onToggleMute,
    onEndCall,
    isTextInputVisible,
    onToggleTextInput,
    volume = 1,
    onVolumeChange,
    voiceInputDisabled = false,
    voiceInputFallbackReason = '',
    audioOutputDisabled = false,
    audioOutputDisabledReason = '',
}) => {
    const [ripples, setRipples] = useState<number[]>([]);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const volumePopupRef = useRef<HTMLDivElement>(null);

    const handleEndCall = useCallback(() => {
        const id = Date.now();
        setRipples(prev => [...prev, id]);
        setTimeout(() => setRipples(prev => prev.filter(r => r !== id)), 700);
        setTimeout(() => onEndCall(), 200);
    }, [onEndCall]);

    return (
        <div className="vc-dock vc-animate-scale">

            {/* 文字输入切换 */}
            <button
                onClick={onToggleTextInput}
                className={`vc-dock-btn ${isTextInputVisible ? 'vc-dock-btn--active' : ''}`}
                title="文字输入"
            >
                <ChatCircle weight={isTextInputVisible ? 'fill' : 'regular'} className="w-6 h-6" />
            </button>

            <div className="vc-dock-divider" />

            {/* 静音 */}
            <button
                onClick={voiceInputDisabled ? undefined : onToggleMute}
                disabled={voiceInputDisabled}
                className={`vc-dock-btn ${isMuted || voiceInputDisabled ? 'vc-dock-btn--active' : ''} ${voiceInputDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={voiceInputDisabled ? (voiceInputFallbackReason || '当前设备使用文字输入') : '麦克风'}
            >
                {isMuted || voiceInputDisabled
                    ? <MicrophoneSlash weight="fill" className="w-6 h-6" />
                    : <Microphone weight="regular" className="w-6 h-6" />
                }
            </button>

            <div className="vc-dock-divider" />

            {/* 挂断 */}
            <button
                onClick={handleEndCall}
                className="vc-dock-hangup"
            >
                {ripples.map(id => (
                    <span
                        key={id}
                        className="absolute inset-0 rounded-full bg-white/25"
                        style={{ animation: 'vc-hangup-ripple 0.7s ease-out forwards' }}
                    />
                ))}
                <PhoneDisconnect weight="fill" className="w-7 h-7 relative z-10" />
            </button>

            <div className="vc-dock-divider" />

            {/* 音量 */}
            <div className="relative">
                <button
                    onClick={audioOutputDisabled ? undefined : () => setShowVolumeSlider(prev => !prev)}
                    disabled={audioOutputDisabled}
                    className={`vc-dock-btn ${showVolumeSlider ? 'vc-dock-btn--active' : ''} ${audioOutputDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={audioOutputDisabled ? (audioOutputDisabledReason || '当前通道不播放角色语音') : '音量'}
                >
                    {volume <= 0 ? (
                        <SpeakerSlash weight="fill" className="w-6 h-6" />
                    ) : volume < 0.5 ? (
                        <SpeakerLow weight="regular" className="w-6 h-6" />
                    ) : (
                        <SpeakerHigh weight="regular" className="w-6 h-6" />
                    )}
                </button>
                {/* 音量弹出滑条 */}
                {showVolumeSlider && (
                    <div ref={volumePopupRef} className="vc-volume-popup">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(volume * 100)}
                            onChange={e => onVolumeChange?.(Number(e.target.value) / 100)}
                            className="vc-volume-slider"
                        />
                        <span className="vc-volume-label">{Math.round(volume * 100)}%</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CallControls;
