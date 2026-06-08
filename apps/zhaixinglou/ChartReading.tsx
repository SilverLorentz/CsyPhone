/**
 * ChartReading — 解盘对话界面
 *
 * 核心功能：
 * 1. 首次挂载时自动调用副 API 生成宏观星象解读
 * 2. 用户可继续问答对话
 * 3. 退出时拦截返回，弹出「星痕铭刻/天机焚卷」面板（Phase 2）
 *
 * 对话消息用组件内 useState 管理，退出即结算，不持久化到 store。
 */
import React,{ useState,useRef,useEffect,useCallback } from 'react';
import { SecondaryAPIConfig } from './zhaixinglouStore';
import { fetchSecondaryApi } from './zhaixinglouApi';
import { ReadingMode,buildChartReadingSystemPrompt } from './divinationPrompts';
import { CharacterProfile } from '../../types';
import MemoryDestinyModal from './MemoryDestinyModal';
import ChatMessageBubble,{ type MessageAction } from './components/ChatMessageBubble';
import ShareCardModal,{ type ShareContext } from './ShareCardModal';
import { truncateMessages } from './chatUtils';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
}

let _msgIdCounter = 0;
const nextMsgId = () => `msg-${Date.now()}-${++_msgIdCounter}`;

interface ChartReadingProps {
    onBack: () => void;
    mode: ReadingMode;
    chartData: string;
    apiConfig: SecondaryAPIConfig;
    isApiConfigured: boolean;
    onOpenSettings: () => void;
    userName: string;
    userBio: string;
    charProfile?: CharacterProfile;
    characters: CharacterProfile[];
    selectedCardType: 'user' | 'character';
}

const ChartReading: React.FC<ChartReadingProps> = ({
    onBack, mode, chartData, apiConfig, isApiConfigured, onOpenSettings,
    userName, userBio, charProfile, characters, selectedCardType,
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [hasInitialized, setHasInitialized] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const systemPromptRef = useRef<string>('');
    const [showModal, setShowModal] = useState(false);
    const [shareVisible, setShareVisible] = useState(false);
    const shareContent = '';
    const [shareParagraphs, setShareParagraphs] = useState<string[]>([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [selectedContents, setSelectedContents] = useState<Map<string, string>>(new Map());

    const exitSelectionMode = useCallback(() => {
        setIsSelectionMode(false);
        setSelectedKeys(new Set());
        setSelectedContents(new Map());
    }, []);

    const handleToggleSelect = useCallback((key: string, content: string) => {
        setSelectedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) { next.delete(key); } else { next.add(key); }
            return next;
        });
        setSelectedContents(prev => {
            const next = new Map(prev);
            if (next.has(key)) { next.delete(key); } else { next.set(key, content); }
            return next;
        });
    }, []);

    const handleExportSelected = useCallback(() => {
        const sorted = [...selectedContents.entries()].sort((a, b) => {
            const [ai, ap] = a[0].split('-').map(Number);
            const [bi, bp] = b[0].split('-').map(Number);
            return ai !== bi ? ai - bi : ap - bp;
        });
        setShareParagraphs(sorted.map(e => e[1]));
        setShareVisible(true);
    }, [selectedContents]);

    // Scroll to bottom on new messages
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    // ── Build system prompt and trigger first reading on mount ──
    useEffect(() => {
        if (hasInitialized || !isApiConfigured) return;
        setHasInitialized(true);

        const systemPrompt = buildChartReadingSystemPrompt({
            mode,
            chartData,
            userName,
            userBio,
            charProfile,
        });
        systemPromptRef.current = systemPrompt;

        // Auto-generate first reading
        const generateFirstReading = async () => {
            setIsLoading(true);
            try {
                const chatMessages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: '请为我解读这份星盘。' },
                ];

                const reply = await fetchSecondaryApi(apiConfig, chatMessages, {
                    temperature: 0.85,
                });

                setMessages([
                    { id: nextMsgId(), role: 'assistant', content: reply || '……星轨之上，迷雾尚未退散。请再次叩问命运。' },
                ]);
            } catch (err: any) {
                setMessages([
                    { id: nextMsgId(), role: 'assistant', content: `⚠️ 星象传讯受阻：${err.message}` },
                ]);
            } finally {
                setIsLoading(false);
            }
        };

        generateFirstReading();
    }, [hasInitialized, isApiConfigured, mode, chartData, userName, userBio, charProfile, apiConfig]);

    // ── Send follow-up message ──
    const handleSend = useCallback(async () => {
        if (!input.trim() || isLoading) return;
        const userMsg = input.trim();
        setInput('');

        const newMessages = [...messages, { id: nextMsgId(), role: 'user' as const, content: userMsg }];
        setMessages(newMessages);
        setIsLoading(true);

        try {
            const chatMessages = truncateMessages([
                { role: 'system', content: systemPromptRef.current },
                ...newMessages.map(m => ({ role: m.role, content: m.content })),
            ]);

            const reply = await fetchSecondaryApi(apiConfig, chatMessages, {
                temperature: 0.85,
            });

            setMessages(prev => [
                ...prev,
                { id: nextMsgId(), role: 'assistant', content: reply || '……（命运之神沉默不语）' },
            ]);
        } catch (err: any) {
            setMessages(prev => [
                ...prev,
                { id: nextMsgId(), role: 'assistant', content: `⚠️ ${err.message}` },
            ]);
        } finally {
            setIsLoading(false);
        }
    }, [input, isLoading, messages, apiConfig]);

    // ── Handle back → intercept and show settlement modal ──
    const handleBack = useCallback(() => {
        // If there are messages (conversation happened), show the modal
        if (messages.length > 0) {
            setShowModal(true);
        } else {
            // No conversation yet, just go back
            onBack();
        }
    }, [onBack, messages]);

    // Modal handlers
    const handleBurn = useCallback(() => {
        // 天机焚卷: clear and return
        setShowModal(false);
        onBack();
    }, [onBack]);

    const handleModalClose = useCallback(() => {
        // 星痕铭刻 complete: return
        setShowModal(false);
        onBack();
    }, [onBack]);

    // ── Regenerate from a specific point ──
    const regenerateFrom = useCallback(async (messagesUpTo: ChatMessage[]) => {
        setIsLoading(true);
        try {
            const chatMessages = truncateMessages([
                { role: 'system', content: systemPromptRef.current },
                ...messagesUpTo.map(m => ({ role: m.role, content: m.content })),
            ]);
            const reply = await fetchSecondaryApi(apiConfig, chatMessages, {
                temperature: 0.85,
            });
            setMessages([...messagesUpTo, { id: nextMsgId(), role: 'assistant', content: reply || '……（命运之神沉默不语）' }]);
        } catch (err: any) {
            setMessages([...messagesUpTo, { id: nextMsgId(), role: 'assistant', content: `⚠️ ${err.message}` }]);
        } finally {
            setIsLoading(false);
        }
    }, [apiConfig]);

    // ── Message actions ──
    const messageActions: MessageAction = {
        onEdit: useCallback((index: number, newContent: string) => {
            const updated = messages.slice(0, index);
            updated.push({ ...messages[index], content: newContent });
            setMessages(updated);
            regenerateFrom(updated);
        }, [messages, regenerateFrom]),

        onDelete: useCallback((index: number) => {
            setMessages(prev => {
                const next = [...prev];
                if (prev[index].role === 'user' && prev[index + 1]?.role === 'assistant') {
                    next.splice(index, 2);
                } else {
                    next.splice(index, 1);
                }
                return next;
            });
        }, []),

        onRegenerate: useCallback((index: number) => {
            if (messages[index].role === 'assistant') {
                const upTo = messages.slice(0, index);
                setMessages(upTo);
                regenerateFrom(upTo);
            } else {
                const upTo = messages.slice(0, index + 1);
                setMessages(upTo);
                regenerateFrom(upTo);
            }
        }, [messages, regenerateFrom]),

        onShare: useCallback((_index: number, paragraphContent: string) => {
            setShareParagraphs([paragraphContent]);
            setShareVisible(true);
        }, []),

        onEnterSelectMode: useCallback((paragraphKey: string, paragraphContent: string) => {
            setIsSelectionMode(true);
            setSelectedKeys(new Set([paragraphKey]));
            setSelectedContents(new Map([[paragraphKey, paragraphContent]]));
        }, []),
    };

    // ── Mode title ──
    const modeTitle = {
        self: 'Soul Reading',
        observe_user: 'Star Gazing',
        observe_char: 'Star Gazing',
        synastry: 'Synastry Reading',
        tarot: 'Tarot Reading',
    }[mode];

    const modeSubtitle = {
        self: charProfile?.name || '',
        observe_user: userName,
        observe_char: charProfile?.name || '',
        synastry: `${userName} & ${charProfile?.name || ''}`,
        tarot: '',
    }[mode];

    const shareContext: ShareContext = {
        source: 'chart',
        title: modeTitle || 'Chart Reading',
        subtitle: modeSubtitle || undefined,
        date: new Date().toLocaleDateString('zh-CN'),
    };

    return (
        <>
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="pt-12 pb-3 px-6 flex items-center justify-between shrink-0 border-b border-[#d4af37]/10">
                    <button
                        onClick={handleBack}
                        className="p-2 -ml-2 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-[#d4af37] border border-[#d4af37]/30 bg-black/30 backdrop-blur-md"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[#d4af37] text-xl tracking-[0.08em]" style={{ fontFamily: 'ZhaixinglouTitle, serif', textShadow: '0 0 10px rgba(212,175,55,0.5)' }}>
                            {modeTitle}
                        </span>
                        {modeSubtitle && <span className="text-[9px] text-[#8c6b3e] tracking-widest mt-0.5" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>{modeSubtitle}</span>}
                    </div>
                    <div className="w-9"></div>
                </div>

                {/* Messages Area */}
                {!isApiConfigured ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
                        <div className="text-4xl opacity-60">👁</div>
                        <p className="text-[#8c6b3e] text-sm text-center">
                            请先配置副API<br />才能开启命运的解读
                        </p>
                        <button
                            onClick={onOpenSettings}
                            className="px-6 py-2.5 bg-[#d4af37]/20 border border-[#d4af37]/40 rounded-xl text-[#d4af37] text-sm font-bold active:scale-95 transition-transform"
                        >
                            前往设置
                        </button>
                    </div>
                ) : (
                    <>
                        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4">
                            {/* Initial loading state */}
                            {messages.length === 0 && isLoading && (
                                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-80">
                                    <div className="text-3xl animate-pulse">✧</div>
                                    <p className="text-[#8c6b3e] text-xs text-center leading-relaxed" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>
                                        The stars are aligning...<br />
                                        Reading will emerge.
                                    </p>
                                    <span className="text-[#d4af37]/60 text-sm animate-pulse" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>✧</span>
                                </div>
                            )}

                            {/* Chat messages */}
                            {messages.map((msg, i) => (
                                <ChatMessageBubble
                                    key={msg.id}
                                    index={i}
                                    role={msg.role}
                                    content={msg.content}
                                    actions={messageActions}
                                    isSelectionMode={isSelectionMode}
                                    selectedKeys={selectedKeys}
                                    onToggleSelect={handleToggleSelect}
                                />
                            ))}

                            {/* Typing indicator during follow-up */}
                            {isLoading && messages.length > 0 && (
                                <div className="flex justify-start">
                                    <div className="bg-white/5 rounded-2xl rounded-bl-md px-4 py-3 border border-white/10">
                                        <span className="text-[#d4af37]/60 text-sm animate-pulse" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>✧</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Multi-select bottom bar */}
                        {isSelectionMode && (
                            <div className="absolute bottom-0 left-0 right-0 z-50 px-4 py-3 flex items-center gap-3"
                                style={{ background: 'linear-gradient(0deg, rgba(5,3,2,0.98) 0%, rgba(5,3,2,0.92) 100%)' }}>
                                <button onClick={exitSelectionMode} className="text-xs text-white/40 px-3 py-2 rounded-xl border border-white/10 active:scale-95 transition-transform">
                                    取消
                                </button>
                                <span className="flex-1 text-[11px] text-[#8c6b3e] text-center">
                                    {selectedKeys.size > 0 ? `已选 ${selectedKeys.size} 段` : '轻触段落以选择'}
                                </span>
                                <button
                                    onClick={handleExportSelected}
                                    disabled={selectedKeys.size === 0}
                                    className="text-xs text-[#d4af37] px-3 py-2 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 active:scale-95 transition-transform disabled:opacity-30"
                                >
                                    导出图片
                                </button>
                            </div>
                        )}

                        {/* Input Bar */}
                        <div className="px-4 py-3 border-t border-[#d4af37]/10 bg-black/20 backdrop-blur-sm">
                            <div className="flex gap-2">
                                <input
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                    placeholder="向命运之神提问..."
                                    disabled={isLoading || messages.length === 0}
                                    className="flex-1 bg-white/5 border border-[#d4af37]/20 rounded-xl px-4 py-2.5 text-sm text-[#e5d08f] placeholder-[#8c6b3e]/50 focus:outline-none focus:border-[#d4af37]/50 disabled:opacity-40"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading || messages.length === 0}
                                    className="px-4 py-2.5 bg-[#d4af37]/20 border border-[#d4af37]/40 rounded-xl text-[#d4af37] font-bold text-sm active:scale-95 transition-transform disabled:opacity-30"
                                >
                                    Ask<br /><span className="text-[8px] opacity-60">问</span>
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Settlement Modal */}
            <MemoryDestinyModal
                visible={showModal}
                messages={messages}
                apiConfig={apiConfig}
                readingMode={mode}
                selectedCardType={selectedCardType}
                charProfile={charProfile}
                characters={characters}
                onClose={handleModalClose}
                onBurn={handleBurn}
            />
            <ShareCardModal
                visible={shareVisible}
                onClose={() => { setShareVisible(false); setShareParagraphs([]); exitSelectionMode(); }}
                paragraphs={shareParagraphs.length > 0 ? shareParagraphs : undefined}
                content={shareParagraphs.length === 0 ? shareContent : undefined}
                context={shareContext}
            />
        </>
    );
};

export default ChartReading;
