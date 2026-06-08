import React,{ useState,useEffect,useRef,useCallback,useMemo } from 'react';
import { DB } from '../../utils/db';
import { saveVoiceAudio } from '../../utils/db/contentStore';
import { VectorMemoryExtractor } from '../../utils/vectorMemoryExtractor';
import { useVoiceCall,CallDirection } from './useVoiceCall';
import { useVoiceCallEngine } from './useVoiceCallEngine';
import IncomingCallOverlay from './components/IncomingCallOverlay';
import ConnectingOverlay from './components/ConnectingOverlay';
import ModeSelectOverlay from './components/ModeSelectOverlay';
import ActiveCallView from './components/ActiveCallView';
import CallEndedView from './components/CallEndedView';
import ErrorOverlay from './components/ErrorOverlay';
import type { VoiceCallError } from './components/ErrorOverlay';
import { unlockAudio } from './unlockAudio';
import { formatDuration } from './utils';
import { DEFAULT_REPLY_CHANNEL,MODE_LABELS,REPLY_CHANNEL_LABELS } from './voiceCallTypes';
import dialToneSrc from './assets/dial-tone.mp3';
import ringtoneWechatSrc from './assets/ringtone-wechat.mp3';
import vcBgSrc from './assets/vc-bg.jpg';
import vcBgDailySrc from './assets/vc-bg-daily.jpg';
import vcBgConfideSrc from './assets/vc-bg-confide.jpg';
import vcBgTruthSrc from './assets/vc-bg-truth.jpg';
import vcBgSleepSrc from './assets/vc-bg-sleep.jpg';
import vcBgModeSelectSrc from './assets/vc-bg-modeselect.jpg';
import type { TtsConfig } from '../../types/tts';
import type { SttConfig } from '../../types/stt';
import type { CharacterProfile,UserProfile } from '../../types';
import type { VoiceCallMode,VoiceCallModeSelection,VoiceCallReplyChannel } from './voiceCallTypes';
import type { MessageType } from '../../types';
import { getEmbeddingConfig,getSecondaryApiConfig } from '../../utils/runtimeConfig';
import { withCharacterVoiceCallTtsConfig } from '../../utils/characterTts';
import {
    buildPersistedCallAudioEntries,
    buildPersistedCallConversation,
    filterPersistedCallHistory,
} from './callLogPersistence';
import { getVoiceCallVisibleText } from './voiceCallTextSanitizer';
import {
    loadVoiceCallForeignLangConfig,
    saveVoiceCallForeignLangConfig,
    type VoiceCallForeignLangConfig,
} from './voiceCallForeignLangSettings';

interface VoiceCallScreenProps {
    avatarUrl: string;
    name: string;
    char: CharacterProfile;
    userProfile: UserProfile;
    direction: CallDirection;
    onCloseApp: () => void;
    onRegisterEndCall?: (handler: (() => void) | null) => void;
    ttsConfig: TtsConfig;
    sttConfig: SttConfig;
    apiConfig: { baseUrl: string; apiKey: string; model: string; useGeminiJailbreak?: boolean;[key: string]: any };
    addToast: (message: string, type?: 'info' | 'success' | 'error') => void;
    incomingMode?: VoiceCallMode;
    incomingReplyChannel?: VoiceCallReplyChannel;
    callReason?: string;
}

const VoiceCallScreen: React.FC<VoiceCallScreenProps> = ({
    avatarUrl, name, char, userProfile, direction, onCloseApp, onRegisterEndCall,
    ttsConfig, sttConfig, apiConfig, addToast, incomingMode, incomingReplyChannel, callReason,
}) => {
    const characterTtsConfig = useMemo(
        () => withCharacterVoiceCallTtsConfig(ttsConfig, char),
        [ttsConfig, char.id, char.ttsVoiceId, char.elevenLabsVoiceId],
    );

    const {
        callState,
        callDuration,
        isMuted,
        isSpeaking,
        setIsSpeaking,
        startCall,
        endCall,
        toggleMute,
        confirmMode,
    } = useVoiceCall(direction);

    // ─── 模式选择 ───────────────────────────────────────
    // ❗ incoming 时用状态初始值而非 useEffect，避免时序竞态（VoiceCallLlm 在首次 render 时就读取 callMode）
    const [selectedMode, setSelectedMode] = useState<VoiceCallMode | null>(
        direction === 'incoming' ? (incomingMode ?? 'daily') : null
    );
    const [selectedReplyChannel, setSelectedReplyChannel] = useState<VoiceCallReplyChannel>(
        direction === 'incoming' ? (incomingReplyChannel ?? DEFAULT_REPLY_CHANNEL) : DEFAULT_REPLY_CHANNEL
    );

    // ─── 外语模式 (Foreign Language) ───
    const [foreignLang, setForeignLangState] = useState<VoiceCallForeignLangConfig | null>(() => (
        loadVoiceCallForeignLangConfig()
    ));
    const setForeignLang = useCallback((config: VoiceCallForeignLangConfig | null) => {
        setForeignLangState(config);
        saveVoiceCallForeignLangConfig(config);
    }, []);

    // ─── 向量记忆 (Vector Memory) ───
    const embeddingApiKey = useMemo(() => getEmbeddingConfig().apiKey || undefined, []);

    const handleSelectMode = useCallback((selection: VoiceCallModeSelection) => {
        unlockAudio(); // Fix E: iOS Safari 音频解锁（必须在用户手势同步链中）
        const { mode, replyChannel } = selection;
        console.log(`[VoiceCall] Mode selected: ${mode}`);
        setSelectedMode(mode);
        setSelectedReplyChannel(replyChannel);
        confirmMode();
    }, [confirmMode]);

    const handleCancelModeSelect = useCallback(() => {
        onCloseApp();
    }, [onCloseApp]);

    // ─── 报错浮窗 ─────────────────────────────────────────────────
    const [callError, setCallError] = useState<VoiceCallError | null>(null);

    // ─── 语音引擎 ────────────────────────────────────────────────
    const onAISpeakingChange = useCallback((speaking: boolean) => {
        setIsSpeaking(speaking);
    }, [setIsSpeaking]);

    /** 将原始错误转换为友好描述 */
    const parseFriendlyError = (raw: string): string => {
        if (raw.includes('401') || raw.includes('Unauthorized')) return 'API 密钥无效或已过期';
        if (raw.includes('402') || raw.includes('insufficient')) return 'API 额度不足';
        if (raw.includes('403') || raw.includes('Forbidden')) return 'API 访问被拒绝';
        if (raw.includes('404')) return 'API 地址不正确';
        if (raw.includes('429') || raw.includes('rate')) return 'API 请求过于频繁，请稍后再试';
        if (raw.includes('500') || raw.includes('502') || raw.includes('503')) return 'AI 服务暂时不可用';
        if (raw.includes('timeout') || raw.includes('Timeout')) return '请求超时，网络可能不稳定';
        if (raw.includes('network') || raw.includes('fetch')) return '网络连接失败';
        if (raw.includes('语音识别')) return '语音识别出现问题';
        if (raw.includes('TTS') || raw.includes('MiniMax') || raw.includes('ElevenLabs')) return '语音合成服务异常';
        if (raw.includes('未配置')) return raw; // 已经是友好描述
        return 'AI 暂时无法回应';
    };

    const onEngineError = useCallback((msg: string) => {
        console.error('[VoiceCall] Engine error:', msg);
        // 同时显示浮窗和 toast（toast 作为备份，浮窗是主显示）
        addToast(msg, 'error');
        setCallError({
            friendlyMessage: parseFriendlyError(msg),
            rawError: msg,
            timestamp: Date.now(),
        });
    }, [addToast]);

    const {
        startEngine,
        stopEngine,
        releaseGate,
        lastCallHistory,
        sendTextMessage,
        pendingVoiceTranscript,
        sendPendingVoiceTranscript,
        discardPendingVoiceTranscript,
        engineState,
        isUserSpeaking,
        transcript,
        aiResponse,
        ttsDegraded,
        transcriptSource,
        lowMemoryMode,
        voiceInputMode,
        voiceInputFallbackReason,
        // ─── 通话质量反馈 ───
        sttEmptyHint,
        // ─── 外语模式 (Foreign Language) ───
        aiTranslation,
        subtitleHistory,
        // ─── 音量控制 ───
        volume,
        setVolume,
    } = useVoiceCallEngine({
        char,
        userProfile,
        ttsConfig: characterTtsConfig,
        sttConfig,
        apiConfig,
        isMuted,
        onAISpeakingChange,
        onError: onEngineError,
        onRetrying: useCallback(() => {
            setCallError({
                friendlyMessage: '正在重新连接…',
                rawError: '',
                timestamp: Date.now(),
                isRetrying: true,
            });
        }, []),
        callMode: selectedMode ?? undefined,
        replyChannel: selectedReplyChannel,
        isIncoming: direction === 'incoming',
        // ─── 来电理由 (Call Reason) ───
        callReason,
        // ─── 外语模式 (Foreign Language) ───
        foreignLang: foreignLang ?? undefined,
        // ─── 向量记忆 (Vector Memory) ───
        embeddingApiKey,
    });

    // 通话 active → 启动引擎；ended → 停止引擎 + 持久化通话记录
    const engineStartedRef = useRef(false);
    const missedCallSavedRef = useRef(false);  // 防止重复写入"未接来电"
    const callDurationRef = useRef(0);

    // 保持 callDuration 的最新值可在 useEffect 中读取
    useEffect(() => { callDurationRef.current = callDuration; }, [callDuration]);

    useEffect(() => {
        if (callState === 'dialing' && !engineStartedRef.current) {
            // outgoing: 响铃时提前启动引擎（闸门模式，音频缓冲不播放）
            engineStartedRef.current = true;
            startEngine(true);
        } else if (callState === 'connecting' && direction === 'incoming' && !engineStartedRef.current) {
            // incoming: 接听后 connecting 阶段提前启动引擎（闸门模式）
            // 用户已点接听 = 有用户手势，麦克风权限不会冲突
            // AI 在"翻通讯录"动画期间准备开场白，active 后开闸播放
            engineStartedRef.current = true;
            startEngine(true);
        } else if (callState === 'active' && engineStartedRef.current) {
            // outgoing 接通 / incoming connecting 结束：开闸播放缓冲音频
            releaseGate();
        } else if (callState === 'ended' && engineStartedRef.current) {
            engineStartedRef.current = false;
            stopEngine();

            // ── 持久化通话记录 ──
            const history = lastCallHistory.current;
            const isTextReplyChannel = selectedReplyChannel === 'text';
            const persistedHistory = lowMemoryMode || isTextReplyChannel
                ? history.map(({ role, content }) => ({ role, content }))
                : history;

            if (history.length > 0) {
                const mode = selectedMode || 'daily';
                const duration = callDurationRef.current;
                const modeText = MODE_LABELS[mode] || mode;
                const replyChannelText = REPLY_CHANNEL_LABELS[selectedReplyChannel];

                // 过滤掉系统自动发送的开场白提示词，避免出现在通话记录卡片中
                const filteredHistory = filterPersistedCallHistory(persistedHistory);
                const persistedConversation = buildPersistedCallConversation(persistedHistory, selectedReplyChannel);

                // 拼接给模型读 + 卡片展示的文本版
                const lines = filteredHistory.map(h =>
                    `${h.role === 'user' ? userProfile.name : name}: ${getVoiceCallVisibleText(h.role, h.content)}`
                );
                const callHeader = selectedReplyChannel === 'text'
                    ? `[电话记录 | ${modeText} | ${replyChannelText} | ${formatDuration(duration)}]`
                    : `[电话记录 | ${modeText} | ${formatDuration(duration)}]`;
                const content = [
                    callHeader,
                    ...lines,
                    `[通话结束]`,
                ].join('\n');

                DB.saveMessage({
                    charId: char.id,
                    role: 'system' as const,
                    type: 'call_log' as MessageType,
                    content,
                    metadata: {
                        source: 'voicecall',
                        duration,
                        mode,
                        turns: filteredHistory.length,
                        // 剥离 audioBlob，防止撑爆主存
                        conversation: persistedConversation,
                        hasCallAudio: selectedReplyChannel === 'voice' && persistedConversation.some(h => h.hasAudio === true),
                        lowMemoryMode,
                        voiceInputMode,
                        replyChannel: selectedReplyChannel,
                    },
                }).then(async (savedMsgId) => {
                    // ── 将音频 Blob 存入专用的 STORE_VOICE_AUDIO ──
                    const audioEntries = lowMemoryMode ? [] : buildPersistedCallAudioEntries(savedMsgId, persistedHistory, selectedReplyChannel);
                    for (const [i, entry] of audioEntries.entries()) {
                        try {
                            await saveVoiceAudio(entry.key, entry.blob);
                        } catch (e) {
                            console.warn(`[VoiceCall] Failed to save audio for persisted turn ${i}:`, e);
                        }
                    }
                    addToast('通话记录已保存', 'info');

                    // 向量记忆提取 (fire-and-forget，不阻塞关闭)
                    // Read secondary API config fresh at call-end time (not from useMemo)
                    if (char.vectorMemoryEnabled && embeddingApiKey) {
                        const callExtractConfig = getSecondaryApiConfig() || apiConfig;
                        VectorMemoryExtractor.extractFromCallHistory(
                            char.id, char.name, persistedHistory, Date.now(), callExtractConfig, embeddingApiKey,
                        ).then(count => {
                            if (count > 0) console.log(`[VoiceCall] Extracted ${count} memories from call`);
                        }).catch(err => console.error('[VoiceCall] Call memory extraction failed:', err));
                    }

                    // Fix F: 保存成功后 2s 关闭
                    setTimeout(() => onCloseApp(), 2000);
                }).catch(err => {
                    console.error('[VoiceCall] Failed to save call log:', err);
                    // Fix F: 保存失败也要关闭
                    setTimeout(() => onCloseApp(), 2000);
                });
            } else {
                // 无对话记录，直接计时关闭
                setTimeout(() => onCloseApp(), 2000);
            }
        } else if (callState === 'ended' && !engineStartedRef.current) {
            // 来电拒接 / 超时：引擎未启动
            // 超时自动挂断时 handleReject 不会被调用，需要在这里补写未接来电记录
            if (direction === 'incoming' && !missedCallSavedRef.current) {
                missedCallSavedRef.current = true;
                const modeLabel = MODE_LABELS[selectedMode || 'daily'] || selectedMode || 'daily';
                DB.saveMessage({
                    charId: char.id,
                    role: 'system' as const,
                    type: 'call_log' as MessageType,
                    content: `[未接来电 | ${modeLabel} | 0:00]`,
                    metadata: { source: 'voicecall', duration: 0, mode: selectedMode || 'daily', turns: 0, missed: true, replyChannel: selectedReplyChannel },
                }).catch(err => console.error('[VoiceCall] Failed to save missed call:', err));
            }
            setTimeout(() => onCloseApp(), 3000);
        }
    }, [callState, direction, startEngine, stopEngine, releaseGate, char.id, name, userProfile.name, selectedMode, selectedReplyChannel, addToast]);

    // 组件卸载时确保引擎停止
    useEffect(() => {
        return () => {
            if (engineStartedRef.current) {
                stopEngine();
            }
        };
    }, [stopEngine]);

    // ─── 拨号音效 ────────────────────────────────────────────────
    const dialToneRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        dialToneRef.current = new Audio(dialToneSrc);
        dialToneRef.current.loop = true;
        dialToneRef.current.volume = 0.6;
        return () => {
            if (dialToneRef.current) {
                dialToneRef.current.pause();
                dialToneRef.current = null;
            }
        };
    }, []);

    // dialing 状态播放嘟嘟声，其他状态停止
    useEffect(() => {
        const audio = dialToneRef.current;
        if (!audio) return;
        if (callState === 'dialing') {
            audio.currentTime = 0;
            audio.play().catch(() => { }); // 浏览器自动播放策略可能阻止
        } else {
            audio.pause();
            audio.currentTime = 0;
        }
    }, [callState]);

    // ─── 来电铃声 ────────────────────────────────────────────────
    const ringtoneRef = useRef<HTMLAudioElement | null>(null);
    const ringtoneCtxRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);

    useEffect(() => {
        // 默认使用微信来电铃声，可切换为 ringtoneIphoneSrc
        ringtoneRef.current = new Audio(ringtoneWechatSrc);
        ringtoneRef.current.loop = true;
        ringtoneRef.current.volume = 0.7;
        return () => {
            if (ringtoneRef.current) {
                ringtoneRef.current.pause();
                ringtoneRef.current = null;
            }
            // 清理 Web Audio 备用铃声
            if (ringtoneCtxRef.current) {
                try { ringtoneCtxRef.current.osc.stop(); } catch {}
                try { ringtoneCtxRef.current.ctx.close(); } catch {}
                ringtoneCtxRef.current = null;
            }
        };
    }, []);

    /** Web Audio API 备用铃声（当 HTML5 Audio 自动播放被拦截时） */
    const startFallbackRingtone = useCallback(() => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 440; // A4
            gain.gain.value = 0.15;
            // 模拟铃声节奏：1s 响 / 2s 停
            const now = ctx.currentTime;
            for (let i = 0; i < 30; i++) {
                gain.gain.setValueAtTime(0.15, now + i * 3);
                gain.gain.setValueAtTime(0, now + i * 3 + 1);
            }
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            ringtoneCtxRef.current = { ctx, osc, gain };
        } catch (e) {
            console.warn('[VoiceCall] Fallback ringtone failed:', e);
        }
    }, []);

    const stopFallbackRingtone = useCallback(() => {
        if (ringtoneCtxRef.current) {
            try { ringtoneCtxRef.current.osc.stop(); } catch {}
            try { ringtoneCtxRef.current.ctx.close(); } catch {}
            ringtoneCtxRef.current = null;
        }
    }, []);

    // ringing 状态播放来电铃声，其他状态停止
    useEffect(() => {
        const audio = ringtoneRef.current;
        if (!audio) return;
        if (callState === 'ringing') {
            audio.currentTime = 0;
            audio.play().then(() => {
                console.log('[VoiceCall] Ringtone playing via HTML5 Audio');
            }).catch(() => {
                // 浏览器自动播放策略阻止，启用 Web Audio API 备用铃声
                console.log('[VoiceCall] HTML5 Audio blocked, using Web Audio fallback');
                startFallbackRingtone();
            });
        } else {
            audio.pause();
            audio.currentTime = 0;
            stopFallbackRingtone();
        }
    }, [callState, startFallbackRingtone, stopFallbackRingtone]);

    // 注册 endCall 给父级的 back handler
    // mode-select 状态不注册：按 back 直接 closeApp（默认行为）
    useEffect(() => {
        if (onRegisterEndCall) {
            if (callState === 'dialing' || callState === 'connecting' || callState === 'active') {
                onRegisterEndCall(endCall);
            } else {
                onRegisterEndCall(null);
            }
        }
    }, [callState, endCall, onRegisterEndCall]);

    // Fix F: auto-close 已移入 DB.saveMessage 的 .then()/.catch() 中

    const handleReject = async () => {
        // 来电拒接时写入“未接来电”记录（必须在 endCall 之前）
        if (direction === 'incoming' && callState === 'ringing' && !missedCallSavedRef.current) {
            missedCallSavedRef.current = true;
            const modeLabel = MODE_LABELS[selectedMode || 'daily'] || selectedMode || 'daily';
            await DB.saveMessage({
                charId: char.id,
                role: 'system' as const,
                type: 'call_log' as MessageType,
                content: `[未接来电 | ${modeLabel} | 0:00]`,
                metadata: { source: 'voicecall', duration: 0, mode: selectedMode || 'daily', turns: 0, missed: true, replyChannel: selectedReplyChannel },
            });
        }
        endCall();
    };

    // ─── 背景图选择 ──────────────────────────────────────────────
    const modeBgMap: Record<string, string> = {
        daily: vcBgDailySrc,       // 日常模式 → 伦敦城市
        confide: vcBgConfideSrc,   // 倾听模式 → 皮革图
        truth: vcBgTruthSrc,       // 真心话/坦白局 → 雨窗
        sleep: vcBgSleepSrc,       // 哄睡模式 → 暖灯卧室
    };
    const activeBgSrc = !selectedMode
        ? vcBgModeSelectSrc
        : modeBgMap[selectedMode] ?? vcBgSrc;

    return (
        <div className="relative w-full h-full flex flex-col voice-call-root bg-[var(--vc-bg-dark)] overflow-hidden">

            {/* ═══ 三层背景系统 ═══ */}
            <div className="absolute inset-0 z-0">

                {/* Layer 1: 水墨艺术底图 — 高斯模糊 + 压暗 */}
                <div
                    className="absolute inset-0 vc-bg-ink-wash"
                    style={{ backgroundImage: `url(${activeBgSrc})` }}
                />

                {/* Layer 2: 光影流动色斑 */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="vc-ambient-orb vc-ambient-orb--1" />
                    <div className="vc-ambient-orb vc-ambient-orb--2" />
                    <div className="vc-ambient-orb vc-ambient-orb--3" />
                </div>

                {/* Layer 3: 柔纱叠加层 */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#0e0c08]/30 via-transparent to-[#0e0c08]/40" />
            </div>

            {/* ═══ 报错浮窗（覆盖在所有状态之上）═══ */}
            {(callState === 'connecting' || callState === 'active') && (
                <ErrorOverlay
                    error={callError}
                    onDismiss={() => setCallError(null)}
                />
            )}

            {/* ═══ 状态层渲染 ═══ */}
            <div className="relative z-10 w-full h-full flex flex-col">
                {/* 模式选择（仅 outgoing 首屏） */}
                {callState === 'mode-select' && (
                    <ModeSelectOverlay
                        charName={name}
                        onSelectMode={handleSelectMode}
                        onCancel={handleCancelModeSelect}
                        initialReplyChannel={selectedReplyChannel}
                        foreignLang={foreignLang}
                        onForeignLangChange={setForeignLang}
                    />
                )}

                {/* Outgoing: 拨号等待 */}
                {callState === 'dialing' && (
                    <IncomingCallOverlay
                        avatarUrl={avatarUrl}
                        name={name}
                        direction="outgoing"
                        onReject={handleReject}
                    />
                )}

                {/* Incoming: 来电等待 */}
                {callState === 'ringing' && (
                    <IncomingCallOverlay
                        avatarUrl={avatarUrl}
                        name={name}
                        direction="incoming"
                        onAccept={() => { unlockAudio(); startCall(); }}
                        onReject={handleReject}
                    />
                )}

                {/* Incoming connecting: 翻通讯录动画 */}
                {callState === 'connecting' && direction === 'incoming' && (
                    <ConnectingOverlay
                        avatarUrl={avatarUrl}
                        name={name}
                    />
                )}

                {/* 通话进行中（outgoing connecting + active） */}
                {((callState === 'connecting' && direction === 'outgoing') || callState === 'active') && (
                    <ActiveCallView
                        avatarUrl={avatarUrl}
                        name={name}
                        duration={callDuration}
                        isConnecting={callState === 'connecting'}
                        isSpeaking={isSpeaking}
                        isMuted={isMuted}
                        onToggleMute={toggleMute}
                        onEndCall={endCall}
                        onSendTextMessage={sendTextMessage}
                        pendingVoiceTranscript={pendingVoiceTranscript}
                        onSendPendingVoiceTranscript={sendPendingVoiceTranscript}
                        onDiscardPendingVoiceTranscript={discardPendingVoiceTranscript}
                        transcript={transcript}
                        aiResponse={aiResponse}
                        engineState={engineState}
                        isUserSpeaking={isUserSpeaking}
                        ttsDegraded={ttsDegraded}
                        replyChannel={selectedReplyChannel}
                        transcriptSource={transcriptSource}
                        callMode={selectedMode ?? undefined}
                        aiTranslation={aiTranslation}
                        subtitleHistory={subtitleHistory}
                        volume={volume}
                        onVolumeChange={setVolume}
                        sttEmptyHint={sttEmptyHint}
                        voiceInputDisabled={voiceInputMode === 'text-only'}
                        voiceInputFallbackReason={voiceInputFallbackReason}
                    />
                )}

                {/* 通话结束 */}
                {callState === 'ended' && (
                    <CallEndedView
                        avatarUrl={avatarUrl}
                        name={name}
                        duration={callDuration}
                    />
                )}
            </div>
        </div>
    );
};

export default VoiceCallScreen;
