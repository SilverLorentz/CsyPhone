import React,{ useState,useEffect,useRef,useCallback } from 'react';
import CallControls from './CallControls';
import AudioVisualizer from './AudioVisualizer';
import AvatarPulse from './AvatarPulse';
import { formatDuration } from '../utils';
import { sanitizeVoiceCallAssistantText } from '../voiceCallTextSanitizer';
import type { EngineState,VoiceCallSubtitleEntry } from '../useVoiceCallEngine';
import type { VoiceCallMode,VoiceCallReplyChannel } from '../voiceCallTypes';

// ─── 打字机效果组件 ────────────────────────────────────────────
const TypewriterText: React.FC<{ text: string; speed?: number }> = ({ text, speed = 40 }) => {
    const [displayedLen, setDisplayedLen] = useState(0);
    const prevTextRef = useRef('');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // 文字完全更换（新对话）→ 从头
        if (!text.startsWith(prevTextRef.current)) {
            setDisplayedLen(0);
            prevTextRef.current = '';
        }

        const targetLen = text.length;
        const startFrom = prevTextRef.current.length;

        if (timerRef.current) clearInterval(timerRef.current);

        if (startFrom >= targetLen) {
            prevTextRef.current = text;
            setDisplayedLen(targetLen);
            return;
        }

        let current = startFrom;
        timerRef.current = setInterval(() => {
            current++;
            setDisplayedLen(current);
            if (current >= targetLen) {
                if (timerRef.current) clearInterval(timerRef.current);
                timerRef.current = null;
                prevTextRef.current = text;
            }
        }, speed);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [text, speed]);

    // 组件卸载时清理
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const isTyping = displayedLen < text.length;

    return (
        <>
            {text.slice(0, displayedLen)}
            {isTyping && <span className="vc-typewriter-cursor">|</span>}
        </>
    );
};

interface ActiveCallViewProps {
    avatarUrl: string;
    name: string;
    duration: number;
    isConnecting?: boolean;
    isSpeaking: boolean;
    isMuted: boolean;
    onToggleMute: () => void;
    onEndCall: () => void;
    onSendTextMessage: (text: string) => void;
    pendingVoiceTranscript?: string;
    onSendPendingVoiceTranscript?: () => void;
    onDiscardPendingVoiceTranscript?: () => void;
    transcript?: string;
    aiResponse?: string;
    engineState?: EngineState;
    isUserSpeaking?: boolean;
    /** TTS 合成失败，已降级为纯文字 */
    ttsDegraded?: boolean;
    /** 角色回复通道 */
    replyChannel?: VoiceCallReplyChannel;
    /** 当前 transcript 来源：语音识别 or 文字输入 */
    transcriptSource?: 'voice' | 'text';
    /** 当前通话模式 */
    callMode?: VoiceCallMode;
    // ─── 外语模式 (Foreign Language) ───
    /** AI 回复的翻译文本（外语模式下显示） */
    aiTranslation?: string;
    /** 当前通话内字幕记录，用于页面内回溯 */
    subtitleHistory?: VoiceCallSubtitleEntry[];
    // ─── 音量控制 ───
    volume?: number;
    onVolumeChange?: (v: number) => void;
    // ─── 通话质量反馈 ───
    /** STT 返回空结果，提示用户“没听清” */
    sttEmptyHint?: boolean;
    /** 当前设备禁用语音输入，使用文字输入兜底 */
    voiceInputDisabled?: boolean;
    /** 语音输入降级原因 */
    voiceInputFallbackReason?: string;
}

const ActiveCallView: React.FC<ActiveCallViewProps> = ({
    avatarUrl,
    name,
    duration,
    isSpeaking,
    isMuted,
    onToggleMute,
    onEndCall,
    onSendTextMessage,
    pendingVoiceTranscript = '',
    onSendPendingVoiceTranscript,
    onDiscardPendingVoiceTranscript,
    isConnecting = false,
    transcript = '',
    aiResponse = '',
    engineState = 'idle',
    isUserSpeaking = false,
    ttsDegraded = false,
    replyChannel = 'voice',
    transcriptSource = 'voice',
    // ─── 外语模式 (Foreign Language) ───
    aiTranslation = '',
    subtitleHistory = [],
    // ─── 音量控制 ───
    volume = 1,
    onVolumeChange,
    // ─── 通话质量反馈 ───
    sttEmptyHint = false,
    voiceInputDisabled = false,
    voiceInputFallbackReason = '',
}) => {
    const isTextReplyChannel = replyChannel === 'text';

    // 接通闪光效果
    const [showFlash, setShowFlash] = useState(true);
    useEffect(() => {
        const timer = setTimeout(() => setShowFlash(false), 900);
        return () => clearTimeout(timer);
    }, []);

    // 保存当前显示的 transcript 和 aiResponse
    const [displayedTranscript, setDisplayedTranscript] = useState('');
    const [displayedAiResponse, setDisplayedAiResponse] = useState('');
    const [transcriptKey, setTranscriptKey] = useState(0);
    const [aiResponseKey, setAiResponseKey] = useState(0);

    // transcript 变化
    useEffect(() => {
        if (!transcript) {
            setDisplayedTranscript('');
            return;
        }
        setDisplayedTranscript(transcript);
        setTranscriptKey(k => k + 1);
    }, [transcript]);

    // aiResponse 变化：每次更新都视为新句子，触发淡入动画
    useEffect(() => {
        setDisplayedAiResponse(aiResponse);
        if (aiResponse) {
            setAiResponseKey(k => k + 1);
        }
    }, [aiResponse]);

    // 降级文字区自动滚动到底部
    const degradedScrollRef = useRef<HTMLDivElement>(null);
    const subtitleHistoryRef = useRef<HTMLDivElement>(null);
    const visibleAiResponse = sanitizeVoiceCallAssistantText(displayedAiResponse);
    const visiblePendingVoiceTranscript = pendingVoiceTranscript.trim();
    useEffect(() => {
        if (ttsDegraded && degradedScrollRef.current) {
            degradedScrollRef.current.scrollTop = degradedScrollRef.current.scrollHeight;
        }
    }, [visibleAiResponse, ttsDegraded]);

    useEffect(() => {
        if (subtitleHistoryRef.current) {
            subtitleHistoryRef.current.scrollTop = subtitleHistoryRef.current.scrollHeight;
        }
    }, [subtitleHistory]);

    // ─── 响应延迟预警（processing 状态超时提示）───────────────
    const [delayHint, setDelayHint] = useState<'' | 'thinking' | 'slow'>('');
    useEffect(() => {
        if (engineState !== 'processing') {
            setDelayHint('');
            return;
        }
        const t1 = setTimeout(() => setDelayHint('thinking'), 5000);
        const t2 = setTimeout(() => setDelayHint('slow'), 10000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [engineState]);

    // ─── 文字输入 ─────────────────────────────────────────────────
    const [isTextInputVisible, setIsTextInputVisible] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const textInputOpenedForReplyChannelRef = useRef(false);

    useEffect(() => {
        if (isTextReplyChannel && !textInputOpenedForReplyChannelRef.current) {
            textInputOpenedForReplyChannelRef.current = true;
            setIsTextInputVisible(true);
            setTimeout(() => inputRef.current?.focus(), 200);
        } else if (!isTextReplyChannel) {
            textInputOpenedForReplyChannelRef.current = false;
        }
    }, [isTextReplyChannel]);

    // 追踪文字框是否由静音自动打开（取消静音时仅关闭自动打开的，保留用户手动打开的）
    const textInputAutoOpenedByMuteRef = useRef(false);

    // 静音 ↔ 取消静音时联动文字输入框
    useEffect(() => {
        if (voiceInputDisabled) {
            if (!isTextInputVisible) {
                textInputAutoOpenedByMuteRef.current = false;
                setIsTextInputVisible(true);
                setTimeout(() => inputRef.current?.focus(), 200);
            }
            return;
        }

        if (isMuted) {
            if (!isTextInputVisible) {
                textInputAutoOpenedByMuteRef.current = true;
                setIsTextInputVisible(true);
                setTimeout(() => inputRef.current?.focus(), 200);
            }
            // 用户已手动打开 → 不干涉，ref 保持 false
        } else {
            // 取消静音：只关掉由静音自动打开的，用户手动打开的保留
            if (textInputAutoOpenedByMuteRef.current) {
                textInputAutoOpenedByMuteRef.current = false;
                setIsTextInputVisible(false);
            }
        }
    }, [isMuted, isTextInputVisible, voiceInputDisabled]);

    const toggleTextInput = useCallback(() => {
        if (voiceInputDisabled) {
            setIsTextInputVisible(true);
            setTimeout(() => inputRef.current?.focus(), 100);
            return;
        }

        setIsTextInputVisible(prev => {
            const next = !prev;
            if (next) {
                // 延迟 focus，等动画展开
                setTimeout(() => inputRef.current?.focus(), 200);
            }
            return next;
        });
    }, [voiceInputDisabled]);

    const handleSend = useCallback(() => {
        const trimmed = inputValue.trim();
        if (!trimmed) return;
        onSendTextMessage(trimmed);
        setInputValue('');
    }, [inputValue, onSendTextMessage]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    return (
        <div className="absolute inset-0 flex flex-col items-center pt-10 pb-4 vc-animate-fade">

            {/* 接通闪光 */}
            {showFlash && (
                <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
                    <div className="vc-connect-flash w-[160px] h-[160px]" />
                </div>
            )}

            {/* ═══ 顶部极简状态条 ═══ */}
            <div className="w-full flex items-center justify-center mb-3 vc-animate-fade" style={{ animationDelay: '0.4s' }}>
                <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/[0.04] backdrop-blur-xl border border-white/[0.06]">
                    <div className="vc-status-dot" />
                    <span className="text-[var(--vc-text-primary)] text-xs font-mono font-light tracking-wider opacity-70">
                        {isConnecting ? (
                            <span className="vc-calling-text text-[var(--vc-text-muted)]">
                                连接中<span className="vc-dot">.</span><span className="vc-dot">.</span><span className="vc-dot">.</span>
                            </span>
                        ) : formatDuration(duration)}
                    </span>
                    {isTextReplyChannel && (
                        <span className="text-[10px] text-amber-300/60 tracking-wider">· 文字通道</span>
                    )}
                    {!isTextReplyChannel && ttsDegraded && (
                        <span className="text-[10px] text-amber-300/60 tracking-wider">· 文字模式</span>
                    )}
                    {voiceInputDisabled && !ttsDegraded && !isTextReplyChannel && (
                        <span
                            className="inline-block max-w-[140px] truncate text-[10px] text-amber-300/60 tracking-wider sm:max-w-[180px]"
                            title={voiceInputFallbackReason || '当前设备使用文字输入'}
                        >
                            · {voiceInputFallbackReason || '文字输入'}
                        </span>
                    )}
                </div>
            </div>

            {/* 名字 */}
            <h2 className="text-2xl font-light text-[var(--vc-text-primary)] mb-2 mt-4 tracking-wide vc-animate-slide-up">
                {name}
            </h2>

            {/* ═══ 头像 + 音频可视化 ═══ */}
            <div className="flex-[2] flex flex-col items-center justify-center w-full min-h-0">
                <div className="flex flex-col items-center gap-2 vc-animate-scale">
                    <AvatarPulse avatarUrl={avatarUrl} isRinging={false} isActive={true} isSpeaking={isSpeaking} />
                    <div className="w-full h-[50px] flex items-center justify-center">
                        <AudioVisualizer isActive={true} isSpeaking={isSpeaking} />
                    </div>
                </div>
            </div>

            {/* ═══ 悬浮字幕区 / 降级沉浸区 ═══ */}
            <div className="flex-[3] flex flex-col items-center justify-start w-full min-h-0 pt-2 overflow-y-auto overflow-x-hidden pb-2" style={{ scrollbarWidth: 'none' }}>

                {/* ── TTS 降级 — 魅魔沉浸文字区 ── */}
                {ttsDegraded && !isTextReplyChannel && visibleAiResponse ? (
                    <div className="vc-degraded-zone" ref={degradedScrollRef}>
                        {/* 酒红→黑渐变背景 */}
                        <div className="vc-degraded-bg" />
                        {/* 跳动发光爱心 */}
                        <div className="vc-hearts" aria-hidden="true">
                            <span /><span /><span /><span /><span /><span /><span />
                        </div>
                        {/* 优雅降级提示 */}
                        <div className="vc-degraded-hint">
                            <span>♡ 切换为文字，继续陪你</span>
                        </div>
                        {/* 暗红毛玻璃阅读卡片 */}
                        <div className="vc-degraded-card">
                            <span className="vc-subtitle-label vc-subtitle-label--ai">{name}</span>
                            <p className="vc-degraded-text">
                                <TypewriterText text={visibleAiResponse} speed={40} />
                            </p>
                        </div>
                    </div>
                ) : (
                    /* ── 正常字幕模式 ── */
                    <div className="vc-subtitle-container">

                        {/* 引擎状态 — 微小指示 */}
                        {!isConnecting && (
                            <div className="flex items-center justify-center gap-2 mb-1">
                                {!voiceInputDisabled && isUserSpeaking && (
                                    <span className="vc-mic-pulse text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 border border-red-400/20 text-red-300/70 tracking-wider">
                                        ● 录音中
                                    </span>
                                )}
                            </div>
                        )}

                        {/* STT 空结果提示 */}
                        {!voiceInputDisabled && sttEmptyHint && !displayedTranscript && !visibleAiResponse && (
                            <p className="vc-quality-hint vc-animate-fade">没有听清，再说一次？</p>
                        )}

                        {/* 响应延迟预警 */}
                        {delayHint && engineState === 'processing' && !visibleAiResponse && (
                            <p className={`vc-quality-hint vc-animate-fade ${delayHint === 'slow' ? 'vc-quality-hint--warn' : ''}`}>
                                {delayHint === 'thinking' ? '思考中，请稍等…' : '网络可能不稳定'}
                            </p>
                        )}

                        {subtitleHistory.length > 0 && (
                            <div className="vc-subtitle-history" ref={subtitleHistoryRef}>
                                {subtitleHistory.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className={`vc-subtitle-history-entry vc-subtitle-history-entry--${entry.role}`}
                                    >
                                        <span className="vc-subtitle-history-label">
                                            {entry.role === 'user'
                                                ? (entry.source === 'text' ? '你发送' : '你')
                                                : name}
                                        </span>
                                        <span className="vc-subtitle-history-text">{entry.text}</span>
                                        {entry.translation && (
                                            <span className="vc-subtitle-history-translation">{entry.translation}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {visiblePendingVoiceTranscript ? (
                            <div className="vc-voice-draft">
                                <span className="vc-subtitle-label">待发送</span>
                                <p className="vc-voice-draft-text">{visiblePendingVoiceTranscript}</p>
                                <div className="vc-voice-draft-actions">
                                    <button
                                        type="button"
                                        className="vc-voice-draft-btn vc-voice-draft-btn--ghost"
                                        onClick={onDiscardPendingVoiceTranscript}
                                    >
                                        重说
                                    </button>
                                    <button
                                        type="button"
                                        className="vc-voice-draft-btn vc-voice-draft-btn--send"
                                        onClick={onSendPendingVoiceTranscript}
                                    >
                                        发送
                                    </button>
                                </div>
                            </div>
                        ) : displayedTranscript ? (
                            <div key={`tr-${transcriptKey}`} className="flex flex-col items-center">
                                <span className="vc-subtitle-label">{transcriptSource === 'text' ? '你发送' : '你'}</span>
                                <p className="vc-subtitle vc-subtitle--user">{displayedTranscript}</p>
                            </div>
                        ) : !isConnecting && engineState === 'processing' && !displayedTranscript ? (
                            /* processing 状态：思考动画 */
                            <div className="vc-thinking-dots">
                                <span /><span /><span />
                            </div>
                        ) : !isConnecting && (
                            <p className="vc-subtitle vc-subtitle--hint">
                                {voiceInputDisabled ? '请打字继续…' : (isMuted ? '麦克风已关闭，请打字…' : '说话或打字…')}
                            </p>
                        )}

                        {/* AI 回复 — 悬浮字幕 */}
                        {visibleAiResponse && (
                            <div key={`ai-${aiResponseKey}`} className="flex flex-col items-center mt-2">
                                {/* TTS 降级提示（非降级沉浸模式时的 fallback，理论上不会走到这里） */}
                                {ttsDegraded && (
                                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-400/15 text-amber-300/60 tracking-wider mb-1.5 vc-animate-fade">
                                        语音暂时无法播放，用文字陪你
                                    </span>
                                )}
                                <span className="vc-subtitle-label vc-subtitle-label--ai">{name}</span>
                                <p className="vc-subtitle vc-subtitle--ai">{visibleAiResponse}</p>
                                {/* ─── 外语模式翻译字幕 (Foreign Language) ─── */}
                                {aiTranslation && (
                                    <p className="vc-subtitle vc-subtitle--translation">{aiTranslation}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ═══ 底部控制区 ═══ */}
            <div className="w-full flex flex-col items-center gap-3 mt-auto pb-8 vc-animate-slide-up" style={{ animationDelay: '0.3s' }}>

                {/* 文字输入框 — 仅通话 active 时显示 */}
                {!isConnecting && (
                    <div className={`vc-text-input-area ${isTextInputVisible ? 'vc-text-input-area--visible' : ''}`}>
                        <input
                            ref={inputRef}
                            type="text"
                            className="vc-text-input"
                            placeholder="发送消息…"
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={() => {
                                // 移动端软键盘弹起时滚到输入框
                                setTimeout(() => inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
                            }}
                        />
                        <button
                            className="vc-text-send-btn"
                            onClick={handleSend}
                            disabled={!inputValue.trim()}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* 药丸控制栏 */}
                <CallControls
                    isMuted={isMuted}
                    onToggleMute={onToggleMute}
                    onEndCall={onEndCall}
                    isTextInputVisible={isTextInputVisible}
                    onToggleTextInput={isConnecting ? () => {} : toggleTextInput}
                    volume={volume}
                    onVolumeChange={onVolumeChange}
                    voiceInputDisabled={voiceInputDisabled}
                    voiceInputFallbackReason={voiceInputFallbackReason}
                    audioOutputDisabled={isTextReplyChannel}
                    audioOutputDisabledReason="文字通道不播放角色语音"
                />
            </div>
        </div>
    );
};

export default ActiveCallView;
