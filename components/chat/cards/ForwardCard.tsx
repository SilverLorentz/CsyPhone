import React,{ useState } from 'react';

/**
 * ForwardCard — 策略 B: 可主题化聊天记录卡片
 * 
 * Renders a merged chat forward card with collapsed preview and expandable full-screen overlay.
 * Uses CSS custom properties (tokens) for theme-aware styling.
 */

interface ForwardCardProps {
    forwardData: any;
    commonLayout: (content: React.ReactNode) => React.ReactElement;
    interactionProps: any;
    selectionMode: boolean;
}

const ForwardCard: React.FC<ForwardCardProps> = ({ forwardData, commonLayout, selectionMode }) => {
    const [expanded, setExpanded] = useState(false);

    const handleCardClick = (e: React.MouseEvent) => {
        if (selectionMode) return;
        e.stopPropagation();
        setExpanded(true);
    };

    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    return (
        <>
            {commonLayout(
                <div
                    className="sully-card-container w-64 rounded-2xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
                    style={{
                        backgroundColor: 'var(--card-bg, #ffffff)',
                        border: '1px solid var(--card-border, #f1f5f9)',
                    }}
                    onClick={handleCardClick}
                >
                    <div className="px-4 pt-3 pb-2" style={{ borderBottom: '1px solid var(--card-border, #f1f5f9)' }}>
                        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--card-text-primary, #334155)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-primary"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
                            {forwardData.fromUserName} 和 {forwardData.fromCharName} 的聊天记录
                        </div>
                    </div>
                    <div className="px-4 py-2 space-y-1">
                        {(forwardData.preview || []).slice(0, 4).map((line: string, i: number) => (
                            <div key={i} className="text-[11px] truncate leading-relaxed" style={{ color: 'var(--card-text-secondary, #64748b)' }}>{line}</div>
                        ))}
                    </div>
                    <div className="px-4 py-2 text-[10px] flex items-center justify-between" style={{ borderTop: '1px solid var(--card-border, #f1f5f9)', color: 'var(--card-text-secondary, #94a3b8)' }}>
                        <span>共 {forwardData.count || 0} 条聊天记录</span>
                        <span className="text-primary font-medium">点击查看</span>
                    </div>
                </div>
            )}

            {/* Expanded Full-screen Overlay */}
            {expanded && (
                <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-fade-in" onClick={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <div className="pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 px-4 bg-white border-b border-slate-100 shrink-0 flex items-center gap-3">
                        <button onClick={() => setExpanded(false)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-600">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-700 truncate">{forwardData.fromUserName} 和 {forwardData.fromCharName} 的聊天记录</div>
                            <div className="text-[10px] text-slate-400">共 {forwardData.count || 0} 条消息</div>
                        </div>
                    </div>

                    {/* Messages List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {(forwardData.messages || []).map((msg: any, i: number) => {
                            const isUser = msg.role === 'user';
                            const senderName = isUser ? forwardData.fromUserName : forwardData.fromCharName;
                            return (
                                <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                                        <div className="text-[10px] text-slate-400 mb-1 px-1">{senderName} {msg.timestamp ? formatTime(msg.timestamp) : ''}</div>
                                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-all ${isUser ? 'bg-primary text-white rounded-br-sm' : 'bg-white text-slate-700 rounded-bl-sm shadow-sm border border-slate-100'}`}>
                                            {msg.type === 'image' ? <img src={msg.content} className="max-w-[200px] rounded-xl" /> :
                                                msg.type === 'emoji' ? <img src={msg.content} className="max-w-[100px]" /> :
                                                    msg.type === 'voice' ? (
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-xs opacity-75">
                                                                    语音{msg.metadata?.duration ? ` ${msg.metadata.duration}″` : ''}
                                                                </span>
                                                            </div>
                                                            {msg.metadata?.sourceText && (
                                                                <div className={`text-xs italic ${isUser ? 'text-white/70' : 'text-slate-400'}`}>
                                                                    「{msg.metadata.sourceText}」
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) :
                                                        msg.content}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
};

export default ForwardCard;
