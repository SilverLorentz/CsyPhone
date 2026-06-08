import React,{ useState,useRef,useCallback,useEffect } from 'react';
import { Message } from '../../../types';
import { formatDuration } from '../../../apps/voicecall/utils';
import { MODE_LABELS,REPLY_CHANNEL_LABELS } from '../../../apps/voicecall/voiceCallTypes';
import { buildVoiceCallAudioLookupKeys } from '../../../apps/voicecall/callLogPersistence';
import { getVoiceCallVisibleText } from '../../../apps/voicecall/voiceCallTextSanitizer';
import type { VoiceCallMode,VoiceCallReplyChannel } from '../../../apps/voicecall/voiceCallTypes';
import { getVoiceAudio } from '../../../utils/db/contentStore';

/**
 * VoiceCallSummaryCard — 通话记录可展开卡片
 * 
 * 折叠态: 📞 + 模式标签 + 通话时长
 * 展开态: 完整对话列表（按角色渲染）+ AI 消息可播放/下载
 */

interface VoiceCallSummaryCardProps {
    message: Message;
}

const VoiceCallSummaryCard: React.FC<VoiceCallSummaryCardProps> = ({ message }) => {
    const [expanded, setExpanded] = useState(false);

    // ── 音频播放状态 ──
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);
    const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    // 版本号：防止快速连点导致的竞态（旧的 async 回调不再生效）
    const playVersionRef = useRef(0);

    const duration = message.metadata?.duration ?? 0;
    const mode = message.metadata?.mode as string | undefined;
    const replyChannel: VoiceCallReplyChannel = message.metadata?.replyChannel === 'text' ? 'text' : 'voice';
    const isTextReplyChannel = replyChannel === 'text';
    const conversation = message.metadata?.conversation as { role: string; content: string; hasAudio?: boolean }[] | undefined;
    const hasCallAudio = !isTextReplyChannel && message.metadata?.hasCallAudio === true;
    const isLegacyConversation = hasCallAudio
        && (conversation?.length ?? 0) > 0
        && conversation!.every((entry) => entry.hasAudio === undefined);

    const modeText = mode ? (MODE_LABELS[mode as VoiceCallMode] || mode) : '';
    const durationText = formatDuration(duration);
    const turnCount = conversation?.length ?? 0;

    // ── 清理音频资源 ──
    const cleanupAudio = useCallback(() => {
        playVersionRef.current++; // 使所有正在 await 的旧 handlePlay 失效
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.onended = null;
            audioRef.current.onerror = null;
            audioRef.current = null;
        }
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
        setPlayingIndex(null);
        setLoadingIndex(null);
    }, []);

    // ── 组件卸载时清理（防止 Audio 泄漏继续播放）──
    useEffect(() => {
        return () => { cleanupAudio(); };
    }, [cleanupAudio]);

    const loadAudioBlob = useCallback(async (index: number) => {
        const candidateKeys = buildVoiceCallAudioLookupKeys(message.id, index, isLegacyConversation);

        for (const key of candidateKeys) {
            const blob = await getVoiceAudio(key);
            if (blob) {
                return { blob, key };
            }
        }

        return { blob: null as Blob | null, key: candidateKeys[0], attemptedKeys: candidateKeys };
    }, [message.id, isLegacyConversation]);

    // ── 播放指定 index 的音频 ──
    const handlePlay = useCallback(async (index: number, e: React.MouseEvent) => {
        e.stopPropagation(); // 阻止展开/折叠

        // 如果正在播放同一条，停止
        if (playingIndex === index) {
            cleanupAudio();
            return;
        }

        // 停止上一条 & 记录本次版本
        cleanupAudio();
        const version = playVersionRef.current;
        setLoadingIndex(index);

        try {
            const { blob, attemptedKeys } = await loadAudioBlob(index);

            // 版本已变（用户点了别的按钮或组件卸载），放弃本次
            if (version !== playVersionRef.current) return;

            if (!blob) {
                console.warn('[VoiceCallCard] No audio found for keys:', attemptedKeys);
                setLoadingIndex(null);
                return;
            }

            const url = URL.createObjectURL(blob);
            objectUrlRef.current = url;

            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onended = () => {
                cleanupAudio();
            };
            audio.onerror = () => {
                console.error('[VoiceCallCard] Audio playback error');
                cleanupAudio();
            };

            await audio.play();

            // 再次检查版本（play() 也是异步的）
            if (version !== playVersionRef.current) return;

            setPlayingIndex(index);
            setLoadingIndex(null);
        } catch (err) {
            console.error('[VoiceCallCard] Failed to play audio:', err);
            if (version === playVersionRef.current) {
                cleanupAudio();
            }
        }
    }, [playingIndex, cleanupAudio, loadAudioBlob]);

    // ── 下载指定 index 的音频 ──
    const handleDownload = useCallback(async (index: number, e: React.MouseEvent) => {
        e.stopPropagation();

        try {
            const { blob } = await loadAudioBlob(index);
            if (!blob) return;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `通话录音_${index + 1}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('[VoiceCallCard] Failed to download audio:', err);
        }
    }, [loadAudioBlob]);

    return (
        <div
            className="w-full max-w-[280px] bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer active:scale-[0.98] transition-transform select-none"
            onClick={() => setExpanded(!expanded)}
        >
            {/* 折叠态头部 */}
            <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-lg shrink-0 shadow-sm">
                    📞
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] text-slate-700 font-medium">语音通话</span>
                        {modeText && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-medium">
                                {modeText}
                            </span>
                        )}
                        {isTextReplyChannel && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded-full font-medium">
                                {REPLY_CHANNEL_LABELS[replyChannel]}
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                        {durationText} · {turnCount} 条消息
                    </div>
                </div>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                >
                    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
            </div>

            {/* 展开态：对话列表 */}
            {expanded && conversation && conversation.length > 0 && (
                <div className="border-t border-slate-100 px-3 py-2 max-h-[300px] overflow-y-auto space-y-1.5">
                    {conversation.map((msg, i) => {
                        const isAssistant = msg.role === 'assistant';
                        const isPlaying = playingIndex === i;
                        const isLoading = loadingIndex === i;
                        const showAudioBtn = !isTextReplyChannel && isAssistant && (msg.hasAudio ?? hasCallAudio);
                        const displayContent = getVoiceCallVisibleText(msg.role, msg.content);

                        return (
                            <div
                                key={i}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`text-[11px] leading-relaxed px-2.5 py-1.5 rounded-xl max-w-[85%] ${
                                        msg.role === 'user'
                                            ? 'bg-emerald-50 text-emerald-800'
                                            : 'bg-slate-50 text-slate-700'
                                    }`}
                                >
                                    <div className="flex items-start gap-1.5">
                                        <span className="flex-1">{displayContent}</span>
                                        {showAudioBtn && (
                                            <span className="flex items-center gap-0.5 shrink-0 ml-1 mt-0.5">
                                                {/* 播放/停止按钮 */}
                                                <button
                                                    onClick={(e) => handlePlay(i, e)}
                                                    className={`p-0.5 rounded-full transition-colors ${
                                                        isPlaying
                                                            ? 'text-emerald-600 bg-emerald-100'
                                                            : 'text-slate-400 hover:text-emerald-500 active:text-emerald-600'
                                                    }`}
                                                    title={isPlaying ? '停止' : '播放'}
                                                >
                                                    {isLoading ? (
                                                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                                                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="20 10" />
                                                        </svg>
                                                    ) : isPlaying ? (
                                                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                                                            <rect x="4" y="3" width="3" height="10" rx="1" />
                                                            <rect x="9" y="3" width="3" height="10" rx="1" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                                                            <path d="M5 3.5a.5.5 0 0 1 .804-.394l7 5a.5.5 0 0 1 0 .788l-7 5A.5.5 0 0 1 5 13.5V3.5z" />
                                                        </svg>
                                                    )}
                                                </button>
                                                {/* 下载按钮 */}
                                                <button
                                                    onClick={(e) => handleDownload(i, e)}
                                                    className="p-0.5 rounded-full text-slate-300 hover:text-slate-500 active:text-slate-600 transition-colors"
                                                    title="下载音频"
                                                >
                                                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                                                        <path d="M8 1a.5.5 0 0 1 .5.5v8.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 10.293V1.5A.5.5 0 0 1 8 1z" />
                                                        <path d="M2 13.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z" />
                                                    </svg>
                                                </button>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default VoiceCallSummaryCard;
