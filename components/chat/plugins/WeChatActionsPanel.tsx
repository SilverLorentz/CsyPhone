import React from 'react';
import { Money,BookOpenText,GearSix,Image,ArrowsClockwise,HandTap,Phone,Sparkle,VinylRecord } from '@phosphor-icons/react';

export interface ActionsPanelProps {
    onPanelAction: (action: string) => void;
    isSummarizing: boolean;
    onReroll: () => void;
    canReroll: boolean;
    manualPhotoEnabled?: boolean;
    quickSongGenerating?: boolean;
    chatImageInputRef: React.RefObject<HTMLInputElement | null>;
}

const WeChatActionsPanel: React.FC<ActionsPanelProps> = ({
    onPanelAction,
    isSummarizing,
    onReroll,
    canReroll,
    manualPhotoEnabled = false,
    quickSongGenerating = false,
    chatImageInputRef,
}) => {
    // WeChat actions panel typically has a light grey background and white rounded rect icons
    return (
        <div className="p-6 grid grid-cols-4 gap-y-6 gap-x-4 overflow-y-auto no-scrollbar bg-[#f7f7f7] h-full" style={{ alignContent: 'start' }}>

            {/* 相册 */}
            <button onClick={() => chatImageInputRef.current?.click()} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <div className="w-[60px] h-[60px] bg-white rounded-[16px] flex items-center justify-center text-[#333333] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-100">
                    <Image className="w-7 h-7" weight="fill" />
                </div>
                <span className="text-[12px] text-[#888888]">相册</span>
            </button>

            {manualPhotoEnabled && (
                <button onClick={() => onPanelAction('manual-photo')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
                    <div className="w-[60px] h-[60px] bg-white rounded-[16px] flex items-center justify-center text-[#333333] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-100">
                        <Sparkle className="w-7 h-7" weight="fill" />
                    </div>
                    <span className="text-[12px] text-[#888888]">生图</span>
                </button>
            )}

            <button onClick={() => onPanelAction('quick-song')} disabled={quickSongGenerating} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${quickSongGenerating ? 'opacity-50' : ''}`}>
                <div className="w-[60px] h-[60px] bg-white rounded-[16px] flex items-center justify-center text-[#333333] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-100">
                    <VinylRecord className="w-7 h-7" weight="fill" />
                </div>
                <span className="text-[12px] text-[#888888]">{quickSongGenerating ? '写歌中…' : '主题曲'}</span>
            </button>

            {/* 转账 */}
            <button onClick={() => onPanelAction('transfer')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <div className="w-[60px] h-[60px] bg-white rounded-[16px] flex items-center justify-center text-[#333333] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-100">
                    <Money className="w-7 h-7" weight="fill" />
                </div>
                <span className="text-[12px] text-[#888888]">转账</span>
            </button>

            {/* 戳一戳 */}
            <button onClick={() => onPanelAction('poke')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <div className="w-[60px] h-[60px] bg-white rounded-[16px] flex items-center justify-center text-[#333333] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-100">
                    <HandTap className="w-7 h-7" weight="fill" />
                </div>
                <span className="text-[12px] text-[#888888]">戳一戳</span>
            </button>

            {/* 语音通话 */}
            <button onClick={() => onPanelAction('voice-call')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <div className="w-[60px] h-[60px] bg-white rounded-[16px] flex items-center justify-center text-[#333333] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-100">
                    <Phone className="w-7 h-7" weight="fill" />
                </div>
                <span className="text-[12px] text-[#888888]">语音通话</span>
            </button>

            {/* 记忆归档 */}
            <button onClick={() => onPanelAction('archive')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <div className="w-[60px] h-[60px] bg-white rounded-[16px] flex items-center justify-center text-[#333333] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-100">
                    <BookOpenText className="w-7 h-7" weight="fill" />
                </div>
                <span className="text-[12px] text-[#888888] whitespace-nowrap">{isSummarizing ? '归档中...' : '记忆归档'}</span>
            </button>

            {/* 重新生成 */}
            <button onClick={onReroll} disabled={!canReroll} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${!canReroll ? 'opacity-50' : ''}`}>
                <div className="w-[60px] h-[60px] bg-white rounded-[16px] flex items-center justify-center text-[#333333] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-100">
                    <ArrowsClockwise className="w-7 h-7" weight="bold" />
                </div>
                <span className="text-[12px] text-[#888888]">重新生成</span>
            </button>

            {/* 设置 */}
            <button onClick={() => onPanelAction('settings')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <div className="w-[60px] h-[60px] bg-white rounded-[16px] flex items-center justify-center text-[#333333] shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-slate-100">
                    <GearSix className="w-7 h-7" weight="fill" />
                </div>
                <span className="text-[12px] text-[#888888]">设置</span>
            </button>

        </div>
    );
};

export default WeChatActionsPanel;
