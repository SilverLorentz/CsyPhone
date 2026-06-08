import React from 'react';

/**
 * InteractionPill — 戳一戳等交互动作的渲染组件
 * 
 * Renders centered interaction pills (like "poke") with themed styling.
 * CSS class `sully-interaction-pill` can be overridden by themes.
 */

interface InteractionPillProps {
    isUser: boolean;
    charName: string;
}

const InteractionPill: React.FC<InteractionPillProps> = ({ isUser, charName }) => (
    <div className="group relative cursor-pointer active:scale-95 transition-transform">
        <div className="sully-interaction-pill text-[11px] text-slate-500 bg-slate-200/50 backdrop-blur-sm px-4 py-1.5 rounded-full flex items-center gap-1.5 border border-white/40 shadow-sm select-none">
            <span className="group-hover:animate-bounce">👉</span>
            <span className="font-medium opacity-80">{isUser ? '你' : charName}</span>
            <span className="opacity-60">戳了戳</span>
            <span className="font-medium opacity-80">{isUser ? charName : '你'}</span>
        </div>
    </div>
);

export default InteractionPill;
