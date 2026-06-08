
import React,{ useRef,useEffect,useState,useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOS } from '../../../context/OSContext';
import { CloudStt } from '../../../utils/cloudStt';
import { isIOSStandaloneWebApp } from '../../../utils/iosStandalone';
import WaveformCanvas from '../WaveformCanvas';

// ===== WeChat SVG Icons =====

const WxIconVoice = ({ className = 'w-[28px] h-[28px]' }: { className?: string }) => (
    <svg viewBox="0 0 100 100" className={className}>
        <circle cx="50" cy="50" r="42" fill="none" stroke="#2A2A2A" strokeWidth="6" />
        <g transform="translate(0, 6) scale(0.85)">
            <path d="M 33 50 L 40 42 A 12 12 0 0 1 40 58 Z" fill="#2A2A2A" />
            <path d="M 54 36 A 20 20 0 0 1 54 64" fill="none" stroke="#2A2A2A" strokeWidth="6" strokeLinecap="round" />
            <path d="M 69 24 A 36 36 0 0 1 69 76" fill="none" stroke="#2A2A2A" strokeWidth="6" strokeLinecap="round" />
        </g>
    </svg>
);

const WxIconKeyboard = ({ className = 'w-[28px] h-[28px]' }: { className?: string }) => (
    <svg viewBox="0 0 100 100" className={className}>
        <circle cx="50" cy="50" r="46" fill="none" stroke="#2A2A2A" strokeWidth="4" strokeLinejoin="round" />
        <rect x="24" y="31" width="9" height="9" fill="#2A2A2A" />
        <rect x="39" y="31" width="9" height="9" fill="#2A2A2A" />
        <rect x="54" y="31" width="9" height="9" fill="#2A2A2A" />
        <rect x="69" y="31" width="9" height="9" fill="#2A2A2A" />
        <rect x="24" y="47" width="9" height="9" fill="#2A2A2A" />
        <rect x="39" y="47" width="9" height="9" fill="#2A2A2A" />
        <rect x="54" y="47" width="9" height="9" fill="#2A2A2A" />
        <rect x="69" y="47" width="9" height="9" fill="#2A2A2A" />
        <rect x="35" y="63" width="30" height="9" fill="#2A2A2A" rx="1" ry="1" />
    </svg>
);

const WxIconEmoji = ({ className = 'w-[28px] h-[28px]' }: { className?: string }) => (
    <svg viewBox="-35 -35 528.71 528.71" className={className}>
        <g fill="#2A2A2A" stroke="#f7f7f7" strokeWidth="12" strokeLinejoin="round">
            <path d="M229.355,0C102.922,0,0,102.922,0,229.355S102.922,458.71,229.355,458.71 S458.71,355.788,458.71,229.355S355.788,0,229.355,0z M229.355,427.363c-109.192,0-198.008-88.816-198.008-198.008 S120.163,31.347,229.355,31.347s198.008,88.816,198.008,198.008S338.547,427.363,229.355,427.363z" />
            <path d="M329.665,243.984h-200.62c-8.882,0-15.673,6.792-15.673,15.673 c0,63.739,52.245,115.984,115.984,115.984s115.984-52.245,115.984-115.984C345.339,250.775,338.547,243.984,329.665,243.984z M229.355,344.294c-41.273,0-75.755-29.78-83.069-68.963h166.139C305.11,314.514,270.629,344.294,229.355,344.294z" />
            <circle cx="309.29" cy="164.049" r="29.257" />
            <circle cx="149.42" cy="164.049" r="29.257" />
        </g>
    </svg>
);

const WxIconPlus = ({ className = 'w-[28px] h-[28px]' }: { className?: string }) => (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="#2A2A2A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="24" r="21" />
        <line x1="24" y1="13" x2="24" y2="35" />
        <line x1="13" y1="24" x2="35" y2="24" />
    </svg>
);

// ===== Waveform config =====
const WECHAT_WAVE_BAR_COUNT = 30;

// ===== Props =====
interface WeChatInputBarProps {
    input: string;
    setInput: (v: string) => void;
    showPanel: 'none' | 'actions' | 'emojis' | 'chars';
    setShowPanel: (v: 'none' | 'actions' | 'emojis' | 'chars') => void;
    onSend: () => void;
    onVoiceMessage?: (blob: Blob, duration: number) => void;
    voiceRecorderState?: 'idle' | 'recording' | 'processing';
    voiceRecordingDuration?: number;
    onStartRecording?: () => Promise<boolean>;
    onStopRecording?: () => Promise<{ blob: Blob; duration: number } | null>;
    onCancelRecording?: () => void;
    voiceRecorderError?: string | null;
    isVoiceProcessing?: boolean;
    /** AnalyserNode for real-time waveform visualization */
    analyserNode?: AnalyserNode | null;
}

type GestureZone = 'send' | 'cancel' | 'convert';

const WeChatInputBar: React.FC<WeChatInputBarProps> = ({
    input, setInput, showPanel, setShowPanel, onSend,
    onVoiceMessage, voiceRecorderState = 'idle', 
    onStartRecording, onStopRecording, onCancelRecording,
    isVoiceProcessing = false,
    analyserNode,
}) => {
    const { sttConfig, addToast } = useOS();
    const wxTextareaRef = useRef<HTMLTextAreaElement>(null);
    const useIOSStandaloneInputFix = isIOSStandaloneWebApp();

    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [gestureZone, setGestureZone] = useState<GestureZone>('send');
    const gestureZoneRef = useRef<GestureZone>('send');
    const startYRef = useRef(0);
    const isRecordingRef = useRef(false);
    const [isConverting, setIsConverting] = useState(false);

    const isRecording = voiceRecorderState === 'recording';

    // ===== Gesture zone detection =====
    const resolveZone = useCallback((clientX: number, clientY: number): GestureZone => {
        const dy = startYRef.current - clientY;
        if (dy > 50) {
            return clientX < window.innerWidth * 0.5 ? 'cancel' : 'convert';
        }
        return 'send';
    }, []);

    const updateZone = useCallback((zone: GestureZone) => {
        setGestureZone(zone);
        gestureZoneRef.current = zone;
    }, []);

    // ===== Pointer handlers =====
    const handlePointerDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if (!onStartRecording || voiceRecorderState !== 'idle') return;
        e.preventDefault();
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        startYRef.current = clientY;
        updateZone('send');
        isRecordingRef.current = true;
        onStartRecording().then(ok => {
            if (!ok) isRecordingRef.current = false;
        }).catch(() => { isRecordingRef.current = false; });
    }, [voiceRecorderState, onStartRecording, updateZone]);

    const handlePointerUpAction = useCallback(async () => {
        if (!isRecordingRef.current) return;
        isRecordingRef.current = false;
        const zone = gestureZoneRef.current;
        updateZone('send');

        if (zone === 'cancel') { onCancelRecording?.(); return; }

        const result = await onStopRecording?.();
        if (!result || result.blob.size === 0) return;

        if (zone === 'convert') {
            setIsConverting(true);
            try {
                const sttResult = await CloudStt.transcribe(result.blob, sttConfig, 15000);
                if (sttResult.text.trim()) {
                    setInput(sttResult.text.trim());
                    setIsVoiceMode(false);
                    addToast('语音已转为文字', 'success');
                } else {
                    addToast('未识别到有效语音', 'info');
                }
            } catch (err: any) {
                const reason = err?.message || String(err);
                console.error('[WeChatInputBar] STT failed:', reason, err);
                addToast(`语音转文字失败: ${reason.slice(0, 120)}`, 'error');
                onVoiceMessage?.(result.blob, Math.max(1, result.duration));
            } finally { setIsConverting(false); }
        } else {
            onVoiceMessage?.(result.blob, Math.max(1, result.duration));
        }
    }, [onCancelRecording, onStopRecording, onVoiceMessage, sttConfig, setInput, addToast, updateZone]);

    // ===== Document-level listeners for gesture tracking =====
    useEffect(() => {
        if (!isRecording) return;
        const onTouchMove = (e: TouchEvent) => {
            const t = e.touches[0];
            if (t) updateZone(resolveZone(t.clientX, t.clientY));
        };
        const onMouseMove = (e: MouseEvent) => {
            updateZone(resolveZone(e.clientX, e.clientY));
        };
        const onEnd = () => handlePointerUpAction();

        document.addEventListener('touchmove', onTouchMove, { passive: true });
        document.addEventListener('touchend', onEnd);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('mousemove', onMouseMove);
        return () => {
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onEnd);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('mousemove', onMouseMove);
        };
    }, [isRecording, resolveZone, updateZone, handlePointerUpAction]);

    // ===== 3D perspective effect on message list (not header) =====
    useEffect(() => {
        const chatScroll = document.querySelector('.sully-chat-container .overflow-y-auto') as HTMLElement | null;
        const chatInput = document.querySelector('.sully-chat-container .sully-chat-input, .sully-chat-container > .relative.z-40') as HTMLElement | null;
        if (!chatScroll) return;
        if (isRecording) {
            chatScroll.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1), filter 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)';
            chatScroll.style.transformOrigin = 'top center';
            chatScroll.style.transform = 'perspective(1000px) rotateX(6deg) scale(0.88)';
            chatScroll.style.filter = 'blur(3px) brightness(0.5)';
            // Hide the input bar area during recording
            if (chatInput) {
                chatInput.style.transition = 'opacity 0.2s ease';
                chatInput.style.opacity = '0';
                chatInput.style.pointerEvents = 'none';
            }
        } else {
            chatScroll.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1), filter 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)';
            chatScroll.style.transformOrigin = 'top center';
            chatScroll.style.transform = 'none';
            chatScroll.style.filter = 'none';
            if (chatInput) {
                chatInput.style.transition = 'opacity 0.2s ease';
                chatInput.style.opacity = '1';
                chatInput.style.pointerEvents = '';
            }
        }
        return () => {
            chatScroll.style.transition = '';
            chatScroll.style.transformOrigin = '';
            chatScroll.style.transform = '';
            chatScroll.style.filter = '';
            if (chatInput) {
                chatInput.style.transition = '';
                chatInput.style.opacity = '';
                chatInput.style.pointerEvents = '';
            }
        };
    }, [isRecording]);

    // ===== Auto-expand textarea =====
    useEffect(() => {
        const el = wxTextareaRef.current;
        if (!el) return;
        el.style.height = '0px';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }, [input]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
    };
    const handleToggleVoiceMode = useCallback(() => setIsVoiceMode(prev => !prev), []);
    const handleTextareaFocus = useCallback(() => {
        if (!useIOSStandaloneInputFix) return;
        setShowPanel('none');
        const textarea = wxTextareaRef.current;
        if (!textarea) return;

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (document.activeElement !== textarea) return;
                try {
                    textarea.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                } catch {
                    // Older iOS builds can throw on unsupported scroll options.
                }
            });
        });
    }, [setShowPanel, useIOSStandaloneInputFix]);
    const handleOpenPanel = useCallback((panel: 'emojis' | 'actions') => {
        setIsVoiceMode(false);
        setShowPanel(showPanel === panel ? 'none' : panel);
    }, [showPanel, setShowPanel]);

    // ===== Recording Overlay (Portal to body) =====
    const cancelActive = gestureZone === 'cancel';
    const convertActive = gestureZone === 'convert';

    const recordingOverlay = isRecording && typeof document !== 'undefined' ? createPortal(
        <div style={{
            position: 'fixed', inset: 0, top: '44px', zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.65)',
            touchAction: 'none',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
        }}>
            {/* ===== Green Voice Bubble — centered in screen ===== */}
            <div style={{
                position: 'absolute',
                top: '40%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '56%', maxWidth: '260px',
            }}>
                <div style={{
                    background: '#95ec69',
                    borderRadius: '20px',
                    padding: '20px 28px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: '64px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '28px' }}>
                        <WaveformCanvas
                            analyser={analyserNode ?? null}
                            barCount={WECHAT_WAVE_BAR_COUNT}
                            color="#1a1a1a"
                            height={28}
                            width={200}
                            barWidth={2}
                            barGap={2}
                            minBarHeight={2}
                        />
                    </div>
                </div>
                {/* Triangle pointer — bottom center */}
                <svg style={{ display: 'block', margin: '0 auto' }} width="18" height="10" viewBox="0 0 18 10">
                    <polygon points="0,0 18,0 9,10" fill="#95ec69" />
                </svg>
            </div>

            {/* ===== Combined 3-zone SVG: arc-capsules (left #575757 | right #575757) + dome (#b9b9b9) =====
              ViewBox 1080×800. Bezier family: same control-point relative positions.
              Dome              : M 0,500  C 180,350 360,350 540,350   C 720,350 900,350 1080,500   L 1080,800 L 0,800 Z
              Left capsule:
                top  edge       :  M 0,310  C 180,145 360,145 540,145
                bottom edge(gap): L 540,305  C 360,305 180,305 0,460   (gap ≈40u above dome left, dome peak gap≈45u)
              Right capsule (mirror):
                top  edge       :  M 1080,310 C 900,145 720,145 540,145
                bottom edge     : L 540,305  C 720,305 900,305 1080,460
            ===== */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: '55vw', maxHeight: '270px', minHeight: '200px',
                pointerEvents: 'none',
            }}>
                <svg
                    viewBox="0 0 1080 800"
                    preserveAspectRatio="none"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
                >
                    {/* Left arc capsule — G1-smooth inner arc, endpoint x=450, inner bows to x≈510 */}
                    {/* G1 at (450,108): top tangent=(110,23), CP1=(510,121)=450+0.545*110,108+0.545*23 */}
                    {/* G1 at (450,312): bot tangent=(-110,-4), CP2=(510,314)=450+0.545*110,312+0.545*4 */}
                    <path
                        d="M 0 250 C 180 85 340 85 450 108 C 510 121 510 314 450 312 C 340 308 180 305 0 460 Z"
                        fill={cancelActive ? '#dddddd' : '#575757'}
                        style={{ transition: 'fill 0.25s' }}
                    />
                    {/* Right arc capsule — G1-smooth inner arc, endpoint x=630, inner bows to x≈570 (mirror) */}
                    {/* G1 at (630,108): top tangent=(-110,23), CP1=(570,121) */}
                    {/* G1 at (630,312): bot tangent=(110,-4), CP2=(570,314) */}
                    <path
                        d="M 1080 250 C 900 85 740 85 630 108 C 570 121 570 314 630 312 C 740 308 900 305 1080 460 Z"
                        fill={convertActive ? '#dddddd' : '#575757'}
                        style={{ transition: 'fill 0.25s' }}
                    />
                    {/* Dome (#b9b9b9) */}
                    <path
                        d="M 0 500 C 180 350 360 350 540 350 C 720 350 900 350 1080 500 L 1080 800 L 0 800 Z"
                        fill={gestureZone === 'send' ? '#dddddd' : '#b9b9b9'}
                        style={{ transition: 'fill 0.25s' }}
                    />
                </svg>

                {/* "取消" — centered at arc zone centroid (~20% left, ~27% top), tilted -13deg */}
                <div style={{
                    position: 'absolute',
                    left: '21%', top: '30%',
                    transform: 'translate(-50%, -50%) rotate(-13deg)',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                }}>
                    <span style={{
                        fontSize: '16px', fontWeight: 500,
                        color: cancelActive ? '#ffffff' : 'rgba(255,255,255,0.85)',
                        transition: 'color 0.2s',
                    }}>
                        取消
                    </span>
                </div>

                {/* "滑到这里 转文字" — mirror at (~80% left, ~27% top), tilted +13deg */}
                <div style={{
                    position: 'absolute',
                    left: '79%', top: '30%',
                    transform: 'translate(-50%, -50%) rotate(13deg)',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                }}>
                    <span style={{
                        fontSize: '16px', fontWeight: 500,
                        color: convertActive ? '#ffffff' : 'rgba(255,255,255,0.85)',
                        transition: 'color 0.2s',
                    }}>
                        滑到这里 转文字
                    </span>
                </div>

                {/* "松开 发送" — centered in dome zone */}
                <div style={{
                    position: 'absolute',
                    top: '60%',
                    left: '50%', transform: 'translateX(-50%)',
                    fontSize: '16px', fontWeight: 500,
                    color: gestureZone === 'send' ? '#111111' : 'rgba(0,0,0,0.30)',
                    letterSpacing: '2px',
                    pointerEvents: 'none',
                    transition: 'color 0.2s',
                    whiteSpace: 'nowrap',
                }}>
                    松开 发送
                </div>
            </div>

        </div>,
        document.body
    ) : null;

    // ===== Converting overlay =====
    const convertingOverlay = isConverting && typeof document !== 'undefined' ? createPortal(
        <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: 'rgba(0,0,0,0.78)', borderRadius: '16px',
                padding: '24px 32px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '12px',
            }}>
                <div style={{
                    width: '32px', height: '32px',
                    border: '3px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    animation: 'wx-spin 0.8s linear infinite',
                }} />
                <span style={{ color: '#fff', fontSize: '14px', fontWeight: 500 }}>
                    语音转文字中...
                </span>
            </div>
            <style>{`@keyframes wx-spin { to { transform: rotate(360deg); } }`}</style>
        </div>,
        document.body
    ) : null;

    // ===== Render =====
    return (
        <div style={{
            display: 'flex', alignItems: 'center',
            minHeight: '56px', padding: '8px 6px', gap: '4px',
            background: '#f7f7f7', borderTop: '0.5px solid rgba(0,0,0,0.12)',
        }}>
            <button
                onClick={handleToggleVoiceMode}
                disabled={isVoiceProcessing || isConverting}
                style={{
                    width: '36px', height: '36px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, background: 'transparent', border: 'none',
                    padding: 0, cursor: 'pointer',
                    opacity: (isVoiceProcessing || isConverting) ? 0.5 : 1,
                }}
            >
                {(isVoiceProcessing || isConverting) ? (
                    <div style={{
                        width: '20px', height: '20px',
                        border: '2px solid rgba(42,42,42,0.3)',
                        borderTopColor: '#2A2A2A', borderRadius: '50%',
                        animation: 'wx-spin 0.8s linear infinite',
                    }} />
                ) : isVoiceMode ? (
                    <WxIconKeyboard className="w-[27px] h-[27px]" />
                ) : (
                    <WxIconVoice className="w-[27px] h-[27px]" />
                )}
            </button>

            {isVoiceMode ? (
                <div
                    style={{
                        flex: 1, minWidth: 0, height: '38px',
                        background: '#ffffff', borderRadius: '6px',
                        border: '0.5px solid rgba(0,0,0,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        userSelect: 'none', cursor: 'pointer',
                        WebkitUserSelect: 'none',
                    }}
                    onTouchStart={handlePointerDown}
                    onMouseDown={handlePointerDown}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <span style={{ fontSize: '16px', fontWeight: 500, color: '#333', letterSpacing: '2px' }}>
                        按住 说话
                    </span>
                </div>
            ) : (
                <div style={{
                    flex: 1, minWidth: 0, minHeight: '38px',
                    background: '#ffffff', borderRadius: '6px',
                    border: '0.5px solid rgba(0,0,0,0.08)',
                    display: 'flex', alignItems: 'flex-end', padding: '7px 10px',
                }}>
                    <textarea
                        ref={wxTextareaRef} rows={1}
                        value={input} onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={handleTextareaFocus}
                        inputMode="text"
                        enterKeyHint="send"
                        autoCorrect="on"
                        autoCapitalize="sentences"
                        style={{
                            flex: 1, minWidth: 0, background: 'transparent',
                            fontSize: '16px', color: '#333',
                            border: 'none', outline: 'none', resize: 'none',
                            minHeight: '24px', maxHeight: '120px', lineHeight: '24px',
                            padding: 0, margin: 0, overflowY: 'auto',
                        }}
                        className="no-scrollbar" placeholder=""
                    />
                </div>
            )}

            <button onClick={() => handleOpenPanel('emojis')} style={{
                width: '36px', height: '36px', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: 'none',
                padding: 0, cursor: 'pointer', flexShrink: 0,
            }}>
                <WxIconEmoji className="w-[27px] h-[27px]" />
            </button>

            {input.trim() && !isVoiceMode ? (
                <button onClick={onSend} style={{
                    height: '36px', flexShrink: 0, padding: '0 14px',
                    background: '#07c160', borderRadius: '5px',
                    color: '#fff', fontSize: '15px', fontWeight: 500,
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>发送</button>
            ) : (
                <button onClick={() => handleOpenPanel('actions')} style={{
                    width: '36px', height: '36px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none',
                    padding: 0, cursor: 'pointer', flexShrink: 0,
                }}>
                    <WxIconPlus className="w-[27px] h-[27px]" />
                </button>
            )}

            {recordingOverlay}
            {convertingOverlay}
        </div>
    );
};

export default WeChatInputBar;
