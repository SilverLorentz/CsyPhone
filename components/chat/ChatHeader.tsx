
import React from 'react';
import { CaretLeft,Lightning,Phone } from '@phosphor-icons/react';
import { CharacterProfile } from '../../types';

interface TokenBreakdown {
    prompt: number;
    completion: number;
    total: number;
    msgCount: number;
    pass: string;
}

interface ChatHeaderProps {
    selectionMode: boolean;
    selectedCount: number;
    onCancelSelection: () => void;
    activeCharacter: CharacterProfile;
    isTyping: boolean;
    isSummarizing: boolean;
    lastTokenUsage: number | null;
    tokenBreakdown?: TokenBreakdown | null;
    onClose: () => void;
    onTriggerAI: () => void;
    onShowCharsPanel: () => void;
    onCallPress?: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
    selectionMode,
    selectedCount,
    onCancelSelection,
    activeCharacter,
    isTyping,
    isSummarizing,
    lastTokenUsage,
    tokenBreakdown,
    onClose,
    onTriggerAI,
    onShowCharsPanel,
    onCallPress
}) => {
    return (
        <div className="sully-chat-header min-h-[6rem] pt-10 bg-white/80 backdrop-blur-xl px-5 flex items-end pb-4 border-b border-slate-200/60 shrink-0 z-30 sticky top-0 shadow-sm relative transition-all duration-300">
            {selectionMode ? (
                <div className="flex items-center justify-between w-full">
                    <button onClick={onCancelSelection} className="text-sm font-bold text-slate-500 px-2 py-1">取消</button>
                    <span className="text-sm font-bold text-slate-800">已选 {selectedCount} 项</span>
                    <div className="w-10"></div>
                </div>
            ) : (
                <div className="flex items-center gap-3 w-full">
                    <button onClick={onClose} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full">
                        <CaretLeft className="w-5 h-5" weight="bold" />
                    </button>

                    <div onClick={onShowCharsPanel} className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer">
                        <img src={activeCharacter.avatar} className="w-10 h-10 rounded-xl object-cover shadow-sm" alt="avatar" />
                        <div>
                            <div className="font-bold text-slate-800">{activeCharacter.name}</div>
                            <div className="flex items-center gap-2">
                                <div className="text-[10px] text-slate-400 uppercase">Online</div>
                                {lastTokenUsage && (
                                    <div className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-md font-mono border border-slate-200" title={tokenBreakdown ? `prompt: ${tokenBreakdown.prompt} | completion: ${tokenBreakdown.completion} | msgs: ${tokenBreakdown.msgCount} | pass: ${tokenBreakdown.pass}` : ''}>
                                        ⚡ {lastTokenUsage}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {onCallPress && (
                        <button
                            onClick={onCallPress}
                            className="p-2 -mr-1 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                            title="语音通话"
                        >
                            <Phone className="w-5 h-5" weight="bold" />
                        </button>
                    )}

                    <button
                        onClick={onTriggerAI}
                        disabled={isTyping}
                        className={`p-2 rounded-full ${isTyping ? 'bg-slate-100' : 'bg-primary/10 text-primary'}`}
                    >
                        <Lightning className="w-5 h-5" weight="bold" />
                    </button>
                </div>
            )}

            {isSummarizing && (
                <div className="absolute top-full left-0 w-full bg-indigo-50 border-b border-indigo-100 p-2 flex items-center justify-center gap-2">
                    <div className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
                    <span className="text-xs text-indigo-600 font-medium">正在整理记忆档案，请稍候...</span>
                </div>
            )}
        </div>
    );
};

export default ChatHeader;
