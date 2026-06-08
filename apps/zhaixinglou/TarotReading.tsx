/**
 * TarotReading — 星镜 · 大祭司解牌聊天页
 *
 * 专属的塔罗 AI 解读聊天界面。
 * 挂载时自动调用副 API（使用大祭司 Selenes 人格）生成首次解读，
 * 用户可继续追问。退出时弹出「星痕铭刻/天机焚卷」结算面板。
 *
 * 架构约定：
 * - 数据层（API 调用、消息管理）与渲染层严格分离
 * - 三段式布局：Header / MessageList / InputBar，每段有语义化容器
 * - 所有视觉样式通过 className 管理，方便后续统一美化
 */
import React,{ useState,useRef,useEffect,useCallback } from 'react';
import { SecondaryAPIConfig } from './zhaixinglouStore';
import { fetchSecondaryApi } from './zhaixinglouApi';
import { TarotMode,buildTarotReadingPrompt } from './divinationPrompts';
import { CharacterProfile } from '../../types';
import MemoryDestinyModal from './MemoryDestinyModal';
import ChatMessageBubble,{ type MessageAction } from './components/ChatMessageBubble';
import ShareCardModal,{ type ShareContext } from './ShareCardModal';
import { truncateMessages } from './chatUtils';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
}

let _tarotMsgIdCounter = 0;
const nextTarotMsgId = () => `tmsg-${Date.now()}-${++_tarotMsgIdCounter}`;

/** 从 StarMirror 传入的单张牌信息 */
export interface TarotDrawnCard {
    nameZh: string;
    nameEn: string;
    isReversed: boolean;
    positionLabel: string;
}

export interface TarotReadingProps {
    onBack: () => void;
    spreadId: string;
    spreadName: string;
    spreadNameEn: string;
    drawnCards: TarotDrawnCard[];
    apiConfig: SecondaryAPIConfig;
    isApiConfigured: boolean;
    onOpenSettings: () => void;
    userName: string;
    userBio: string;
    isUser: boolean;
    charProfile?: CharacterProfile;
    characters: CharacterProfile[];
    selectedCardType: 'user' | 'character';
    astroText?: string;
    systemPromptOverride?: string; // If provided, bypass buildTarotReadingPrompt
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TarotReading: React.FC<TarotReadingProps> = ({
    onBack, spreadId, spreadName, spreadNameEn, drawnCards,
    apiConfig, isApiConfigured, onOpenSettings,
    userName, userBio, isUser,
    charProfile, characters, selectedCardType, astroText, systemPromptOverride,
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
    // 多选模式
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [selectedContents, setSelectedContents] = useState<Map<string, string>>(new Map());
    const shareContext: ShareContext = {
        source: 'tarot',
        title: spreadNameEn,
        subtitle: spreadName !== spreadNameEn ? spreadName : undefined,
        date: new Date().toLocaleDateString('zh-CN'),
    };

    // 退出多选模式
    const exitSelectionMode = useCallback(() => {
        setIsSelectionMode(false);
        setSelectedKeys(new Set());
        setSelectedContents(new Map());
    }, []);

    // 切换某个段落的选中状态
    const handleToggleSelect = useCallback((key: string, content: string) => {
        setSelectedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
        setSelectedContents(prev => {
            const next = new Map(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.set(key, content);
            }
            return next;
        });
    }, []);

    // 导出已选段落
    const handleExportSelected = useCallback(() => {
        // 按展示顺序排序：key 格式为 `${msgIdx}-${paraIdx}`
        const sorted = [...selectedContents.entries()].sort((a, b) => {
            const [ai, ap] = a[0].split('-').map(Number);
            const [bi, bp] = b[0].split('-').map(Number);
            return ai !== bi ? ai - bi : ap - bp;
        });
        setShareParagraphs(sorted.map(e => e[1]));
        setShareVisible(true);
    }, [selectedContents]);


    // ── Auto-scroll on new messages ──
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    // ── Build system prompt and trigger first reading on mount ──
    useEffect(() => {
        if (hasInitialized || !isApiConfigured) return;
        setHasInitialized(true);

        const tarotMode: TarotMode = isUser ? 'user' : 'char';

        // Use override if provided, otherwise build standard tarot prompt
        const systemPrompt = systemPromptOverride || buildTarotReadingPrompt({
            mode: tarotMode,
            spreadId,
            cards: drawnCards,
            userName,
            userBio: userBio || undefined,
            astroData: astroText || undefined,
            charProfile,
        });
        systemPromptRef.current = systemPrompt;

        // Auto-generate first reading
        const generateFirstReading = async () => {
            setIsLoading(true);
            try {
                const chatMessages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: '请为我解读这些牌。' },
                ];

                const reply = await fetchSecondaryApi(apiConfig, chatMessages, {
                    temperature: 0.85,
                });

                setMessages([
                    { id: nextTarotMsgId(), role: 'assistant', content: reply || '……牌面上的烛影摇曳不定，请再次叩问星镜。' },
                ]);
            } catch (err: any) {
                setMessages([
                    { id: nextTarotMsgId(), role: 'assistant', content: `⚠️ 星镜传讯受阻：${err.message}` },
                ]);
            } finally {
                setIsLoading(false);
            }
        };

        generateFirstReading();
    }, [hasInitialized, isApiConfigured, spreadId, drawnCards, userName, userBio, isUser, charProfile, apiConfig, astroText]);

    // ── Send follow-up message ──
    const handleSend = useCallback(async () => {
        if (!input.trim() || isLoading) return;
        const userMsg = input.trim();
        setInput('');

        const newMessages = [...messages, { id: nextTarotMsgId(), role: 'user' as const, content: userMsg }];
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
                { id: nextTarotMsgId(), role: 'assistant', content: reply || '……（大祭司陷入了沉思）' },
            ]);
        } catch (err: any) {
            setMessages(prev => [
                ...prev,
                { id: nextTarotMsgId(), role: 'assistant', content: `⚠️ ${err.message}` },
            ]);
        } finally {
            setIsLoading(false);
        }
    }, [input, isLoading, messages, apiConfig]);

    // ── Handle back → intercept and show settlement modal ──
    const handleBack = useCallback(() => {
        if (messages.length > 0) {
            setShowModal(true);
        } else {
            onBack();
        }
    }, [onBack, messages]);

    const handleBurn = useCallback(() => {
        setShowModal(false);
        onBack();
    }, [onBack]);

    const handleModalClose = useCallback(() => {
        setShowModal(false);
        onBack();
    }, [onBack]);

    // ── Regenerate from a specific point in the conversation ──
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
            setMessages([...messagesUpTo, { id: nextTarotMsgId(), role: 'assistant', content: reply || '……（大祭司陷入了沉思）' }]);
        } catch (err: any) {
            setMessages([...messagesUpTo, { id: nextTarotMsgId(), role: 'assistant', content: `⚠️ ${err.message}` }]);
        } finally {
            setIsLoading(false);
        }
    }, [apiConfig]);

    // ── Message actions ──
    const messageActions: MessageAction = {
        onEdit: useCallback((index: number, newContent: string) => {
            // Replace message, truncate everything after it, regenerate
            const updated = messages.slice(0, index);
            updated.push({ ...messages[index], content: newContent });
            setMessages(updated);
            regenerateFrom(updated);
        }, [messages, regenerateFrom]),

        onDelete: useCallback((index: number) => {
            setMessages(prev => {
                const next = [...prev];
                // If deleting a user message and next is assistant, remove both
                if (prev[index].role === 'user' && prev[index + 1]?.role === 'assistant') {
                    next.splice(index, 2);
                } else {
                    next.splice(index, 1);
                }
                return next;
            });
        }, []),

        onRegenerate: useCallback((index: number) => {
            // For assistant messages: remove it and everything after, regenerate
            // For user messages: truncate after it and regenerate
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
            // 进入多选模式，预选该段落
            setIsSelectionMode(true);
            setSelectedKeys(new Set([paragraphKey]));
            setSelectedContents(new Map([[paragraphKey, paragraphContent]]));
        }, []),
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Render
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    return (
        <>
            <div className="flex-1 flex flex-col overflow-hidden">

                {/* ═══ HEADER ═══ */}
                <div className="tarot-reading-header pt-12 pb-3 px-6 flex items-center justify-between shrink-0 border-b border-[#d4af37]/10">
                    <button
                        onClick={handleBack}
                        className="p-2 -ml-2 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-[#d4af37] border border-[#d4af37]/30 bg-black/30 backdrop-blur-md"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[#d4af37] text-xl tracking-[0.08em] whitespace-nowrap" style={{ fontFamily: 'ZhaixinglouTitle, serif', textShadow: '0 0 10px rgba(212,175,55,0.5)' }}>
                            {spreadNameEn}
                        </span>
                    </div>
                    <div className="w-9"></div>
                </div>

                {/* ═══ MESSAGES AREA ═══ */}
                {!isApiConfigured ? (
                    <div className="tarot-reading-unconfigured flex-1 flex flex-col items-center justify-center gap-4 px-6">
                        <div className="text-4xl opacity-60">🔮</div>
                        <p className="text-[#8c6b3e] text-sm text-center">
                            请先配置副API<br />才能聆听大祭司的神谕
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
                        <div ref={scrollRef} className="tarot-reading-messages flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4">
                            {/* Initial loading state */}
                            {messages.length === 0 && isLoading && (
                                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-80">
                                    <div className="text-3xl animate-pulse">✧</div>
                                    <p className="text-[#8c6b3e] text-xs text-center leading-relaxed" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>
                                        The High Priest reads the cards...
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

                            {/* Typing indicator */}
                            {isLoading && messages.length > 0 && (
                                <div className="flex justify-start">
                                    <div className="bg-white/5 rounded-2xl rounded-bl-md px-4 py-3 border border-white/10">
                                        <span className="text-[#d4af37]/60 text-sm animate-pulse" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>✧</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 多选模式: 底部浮动操作栏 */}
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

                        {/* ═══ INPUT BAR ═══ */}
                        <div className="tarot-reading-input px-4 py-3 border-t border-[#d4af37]/10 bg-black/20 backdrop-blur-sm">
                            <div className="flex gap-2">
                                <input
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                    placeholder="向大祭司追问..."
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

            {/* ═══ SETTLEMENT MODAL ═══ */}
            <MemoryDestinyModal
                visible={showModal}
                messages={messages}
                apiConfig={apiConfig}
                readingMode={'tarot'}
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

export default TarotReading;
