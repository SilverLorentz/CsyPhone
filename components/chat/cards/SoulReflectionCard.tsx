/**
 * SoulReflectionCard - 回神卡片
 * 展示角色的自省独白，嵌在聊天流中
 */
import React from 'react';
import { Message } from '../../../types';

interface SoulReflectionCardProps {
    message: Message;
}

const SoulReflectionCard: React.FC<SoulReflectionCardProps> = ({ message }) => {
    const reflection = message.metadata?.displayReflection || message.content;
    const mirrorSnippets: string[] = (message.metadata?.mirrorSnippets || '').split('||').filter(Boolean);

    return (
        <div
            className="max-w-[85%] mx-auto my-2 rounded-2xl border border-stone-200/60 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
            style={{ background: 'rgba(250, 250, 249, 0.8)', backdropFilter: 'blur(16px)' }}
        >
            <div className="px-5 pt-4 pb-5">
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm">🫧</span>
                    <span className="text-[11px] text-stone-400 tracking-[0.15em] font-medium uppercase">回神</span>
                </div>

                {mirrorSnippets.length > 0 && (
                    <div className="mb-4 pl-3 border-l-2 border-stone-200 space-y-1">
                        {mirrorSnippets.map((s, i) => (
                            <p key={i} className="text-[12px] text-stone-400/70 italic leading-relaxed">
                                "{s}{s.length >= 28 ? '…' : ''}"
                            </p>
                        ))}
                    </div>
                )}

                {mirrorSnippets.length > 0 && (
                    <div className="border-t border-dashed border-stone-200 my-4" />
                )}

                <div className="text-[14px] text-stone-700 leading-[1.9] whitespace-pre-wrap">
                    {reflection}
                </div>
            </div>
        </div>
    );
};

export default React.memo(SoulReflectionCard);
