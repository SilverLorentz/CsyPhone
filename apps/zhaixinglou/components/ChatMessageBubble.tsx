/**
 * ChatMessageBubble — 摘星楼共享聊天气泡组件
 *
 * 功能：
 * 1. assistant 消息按 \n\n 自然分段，每段渲染为独立气泡
 * 2. user 消息保持单气泡
 * 3. 正常模式：长按弹出菜单（分享 / 开始多选 / 编辑 / 删除 / 重发）
 * 4. 选择模式：段落左侧显示复选框，点击切换选中状态
 * 5. 编辑模式：内联输入框
 *
 * 菜单规则（正常模式）：
 * - assistant 中间段落：「分享」+「多选」
 * - assistant 最后段落：「分享」+「多选」+「重发」+「删除」
 * - user 气泡：「编辑」+「重发」+「删除」（无分享）
 *
 * 架构：
 * - 底层 messages[] 数据不变，分享/编辑/删除作用于整条消息
 * - 多选状态由父组件持有，通过 isSelectionMode / selectedParagraphKeys / onToggleSelect 控制
 */
import React,{ useState,useRef,useCallback,useMemo } from 'react';
import { splitParagraphs } from '../shareUtils';

export interface MessageAction {
    onEdit?: (index: number, newContent: string) => void;
    onDelete?: (index: number) => void;
    onRegenerate?: (index: number) => void;
    /** 单段快速分享（直接打开弹窗） */
    onShare?: (index: number, paragraphContent: string) => void;
    /** 进入多选模式（并预选该段落） */
    onEnterSelectMode?: (paragraphKey: string, paragraphContent: string) => void;
}

interface ChatMessageBubbleProps {
    index: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    actions: MessageAction;
    /** 是否处于多选模式 */
    isSelectionMode?: boolean;
    /** 当前已选中的段落 key 集合（key = `${index}-${pIdx}`） */
    selectedKeys?: Set<string>;
    /** 切换某段落的选中状态 */
    onToggleSelect?: (key: string, content: string) => void;
}

const LONG_PRESS_MS = 500;

// ─── 单个段落气泡（内层组件） ───

interface ParagraphBubbleProps {
    text: string;
    paragraphKey: string;
    isUser: boolean;
    isLastParagraph: boolean;
    messageIndex: number;
    fullContent: string;
    actions: MessageAction;
    isSelectionMode: boolean;
    isSelected: boolean;
    onToggleSelect?: (key: string, content: string) => void;
}

const ParagraphBubble: React.FC<ParagraphBubbleProps> = ({
    text, paragraphKey, isUser, isLastParagraph, messageIndex, fullContent,
    actions, isSelectionMode, isSelected, onToggleSelect,
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchMoved = useRef(false);

    // ── Long press detection ──
    const startPress = useCallback(() => {
        if (isSelectionMode) return; // 选择模式下禁用长按菜单
        touchMoved.current = false;
        longPressTimer.current = setTimeout(() => {
            if (!touchMoved.current) setShowMenu(true);
        }, LONG_PRESS_MS);
    }, [isSelectionMode]);

    const cancelPress = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleTouchMove = useCallback(() => {
        touchMoved.current = true;
        cancelPress();
    }, [cancelPress]);

    const dismissMenu = useCallback(() => setShowMenu(false), []);

    // ── Action handlers ──
    const handleEdit = useCallback(() => {
        setShowMenu(false);
        setEditText(fullContent);
        setIsEditing(true);
    }, [fullContent]);

    const handleEditConfirm = useCallback(() => {
        if (editText.trim() && actions.onEdit) {
            actions.onEdit(messageIndex, editText.trim());
        }
        setIsEditing(false);
        setEditText('');
    }, [editText, actions, messageIndex]);

    const handleEditCancel = useCallback(() => {
        setIsEditing(false);
        setEditText('');
    }, []);

    const handleDelete = useCallback(() => {
        setShowMenu(false);
        actions.onDelete?.(messageIndex);
    }, [actions, messageIndex]);

    const handleRegenerate = useCallback(() => {
        setShowMenu(false);
        actions.onRegenerate?.(messageIndex);
    }, [actions, messageIndex]);

    const handleShareSingle = useCallback(() => {
        setShowMenu(false);
        actions.onShare?.(messageIndex, text);
    }, [actions, messageIndex, text]);

    const handleEnterSelectMode = useCallback(() => {
        setShowMenu(false);
        actions.onEnterSelectMode?.(paragraphKey, text);
    }, [actions, paragraphKey, text]);

    const handleBubbleClick = useCallback(() => {
        if (isSelectionMode && !isUser) {
            onToggleSelect?.(paragraphKey, text);
        }
    }, [isSelectionMode, isUser, onToggleSelect, paragraphKey, text]);

    // ── Editing mode ──
    if (isEditing) {
        return (
            <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] w-full flex flex-col gap-1.5">
                    <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        className="w-full bg-black/40 border border-[#d4af37]/40 rounded-xl px-3 py-2 text-sm text-[#e5d08f] focus:outline-none focus:border-[#d4af37]/70 resize-none"
                        rows={Math.min(6, Math.max(2, editText.split('\n').length))}
                        autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                        <button onClick={handleEditCancel} className="px-3 py-1 text-[10px] text-[#8c6b3e]/60 border border-white/10 rounded-lg active:scale-95 transition-transform">
                            取消
                        </button>
                        <button onClick={handleEditConfirm} className="px-3 py-1 text-[10px] text-[#d4af37] border border-[#d4af37]/40 bg-[#d4af37]/10 rounded-lg active:scale-95 transition-transform">
                            确认
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Menu items ──
    const showShareBtn = !isUser && actions.onShare;
    const showSelectBtn = !isUser && actions.onEnterSelectMode;
    const showEditBtn = isUser && actions.onEdit;
    const showRegenBtn = (isUser || isLastParagraph) && actions.onRegenerate;
    const showDeleteBtn = (isUser || isLastParagraph) && actions.onDelete;

    return (
        <>
            {showMenu && <div className="fixed inset-0 z-[9998]" onClick={dismissMenu} />}

            <div className={`relative flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {/* 选择模式复选框（assistant 段落，左侧） */}
                {isSelectionMode && !isUser && (
                    <div
                        onClick={handleBubbleClick}
                        className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all cursor-pointer ${isSelected
                            ? 'bg-[#d4af37] border-[#d4af37]'
                            : 'border-[#d4af37]/40 bg-transparent'
                            }`}
                    >
                        {isSelected && (
                            <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </div>
                )}

                <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap transition-all ${isUser
                        ? 'bg-[#d4af37]/20 text-[#e5d08f] rounded-br-md border border-[#d4af37]/30'
                        : isSelectionMode
                            ? isSelected
                                ? 'bg-white/10 text-[#c8b88a] rounded-bl-md border border-[#d4af37]/50 cursor-pointer'
                                : 'bg-white/5 text-[#c8b88a] rounded-bl-md border border-white/10 cursor-pointer opacity-60'
                            : 'bg-white/5 text-[#c8b88a] rounded-bl-md border border-white/10'
                        }`}
                    style={!isUser ? { textIndent: '2em' } : undefined}
                    onTouchStart={startPress}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={cancelPress}
                    onMouseDown={startPress}
                    onMouseUp={cancelPress}
                    onMouseLeave={cancelPress}
                    onContextMenu={e => { e.preventDefault(); if (!isSelectionMode) setShowMenu(true); }}
                    onClick={handleBubbleClick}
                >
                    {text}
                </div>

                {/* Floating action menu */}
                {showMenu && (
                    <div
                        className={`absolute z-[9999] flex gap-1 ${isUser ? 'right-0' : 'left-0'}`}
                        style={{ top: '-36px' }}
                    >
                        <div className="flex items-center gap-0.5 bg-black/80 backdrop-blur-xl border border-[#d4af37]/25 rounded-xl px-1 py-1 shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
                            {showShareBtn && (
                                <button onClick={handleShareSingle} className="px-2.5 py-1.5 text-[10px] text-[#e5d08f]/80 hover:bg-white/10 rounded-lg transition-colors tracking-wider">
                                    分享
                                </button>
                            )}
                            {showSelectBtn && (
                                <button onClick={handleEnterSelectMode} className="px-2.5 py-1.5 text-[10px] text-[#e5d08f]/80 hover:bg-white/10 rounded-lg transition-colors tracking-wider">
                                    多选
                                </button>
                            )}
                            {showEditBtn && (
                                <button onClick={handleEdit} className="px-2.5 py-1.5 text-[10px] text-[#e5d08f]/80 hover:bg-white/10 rounded-lg transition-colors tracking-wider">
                                    编辑
                                </button>
                            )}
                            {showRegenBtn && (
                                <button onClick={handleRegenerate} className="px-2.5 py-1.5 text-[10px] text-[#e5d08f]/80 hover:bg-white/10 rounded-lg transition-colors tracking-wider">
                                    重发
                                </button>
                            )}
                            {showDeleteBtn && (
                                <button onClick={handleDelete} className="px-2.5 py-1.5 text-[10px] text-red-400/70 hover:bg-red-900/20 rounded-lg transition-colors tracking-wider">
                                    删除
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

// ─── 主组件（外层，负责段落拆分） ───

const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
    index, role, content, actions,
    isSelectionMode = false, selectedKeys, onToggleSelect,
}) => {
    const isUser = role === 'user';

    const paragraphs = useMemo(() => {
        if (isUser) return [content];
        return splitParagraphs(content);
    }, [content, isUser]);

    if (isUser) {
        return (
            <ParagraphBubble
                text={content}
                paragraphKey={`${index}-0`}
                isUser={true}
                isLastParagraph={true}
                messageIndex={index}
                fullContent={content}
                actions={actions}
                isSelectionMode={false}
                isSelected={false}
            />
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            {paragraphs.map((para, pIdx) => {
                const key = `${index}-${pIdx}`;
                return (
                    <ParagraphBubble
                        key={pIdx}
                        text={para}
                        paragraphKey={key}
                        isUser={false}
                        isLastParagraph={pIdx === paragraphs.length - 1}
                        messageIndex={index}
                        fullContent={content}
                        actions={actions}
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedKeys?.has(key) ?? false}
                        onToggleSelect={onToggleSelect}
                    />
                );
            })}
        </div>
    );
};

export default ChatMessageBubble;
