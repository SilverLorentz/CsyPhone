import React from 'react';

/**
 * WeChatSpyCard — 微信聊天记录仿真卡片
 * Parses "我:xxx\n对方:xxx" format into chat-like bubbles.
 */

interface WeChatSpyCardProps {
    title: string;
    detail: string;
    charName: string;
}

const WeChatSpyCard: React.FC<WeChatSpyCardProps> = ({ title, detail, charName }) => {
    const lines = detail.split(/\\n|\n/).filter(l => l.trim());

    return (
        <div className="w-64 bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
            {/* Header */}
            <div className="px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[9px] text-white font-bold">💬</div>
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-white font-medium truncate">{title}</div>
                    <div className="text-[8px] text-white/60">{charName}的聊天软件</div>
                </div>
            </div>
            {/* Chat bubbles */}
            <div className="px-3 py-2 space-y-1.5 bg-gradient-to-b from-slate-50 to-white max-h-36 overflow-y-auto">
                {lines.map((line, i) => {
                    const isSelf = line.trim().startsWith('我:') || line.trim().startsWith('我：');
                    const content = line.replace(/^(我|对方|[^:：]+)[：:]\s*/, '').trim();
                    if (!content) return null;
                    return (
                        <div key={i} className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] px-2.5 py-1.5 rounded-lg text-[10px] leading-relaxed ${isSelf
                                ? 'bg-green-500 text-white rounded-br-sm'
                                : 'bg-white text-slate-700 border border-slate-100 rounded-bl-sm shadow-sm'
                                }`}>
                                {content}
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Footer */}
            <div className="px-3 py-1.5 border-t border-slate-50 text-[9px] text-slate-300 text-center">
                📱 来自{charName}的手机
            </div>
        </div>
    );
};

export default WeChatSpyCard;
