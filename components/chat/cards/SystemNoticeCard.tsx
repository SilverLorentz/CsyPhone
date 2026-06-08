import React from 'react';
import { Message } from '../../../types';
import ChartReadingCard from './ChartReadingCard';

/**
 * SystemNoticeCard — 策略 C: 独立系统卡片
 * 
 * Renders system messages with metadata.source tags as styled notification cards
 * instead of the default grey pill. Each source type gets its own icon and color scheme.
 * 
 * Fallback: Messages without metadata.source still use the original pill renderer in MessageItem.
 */

interface SystemNoticeCardProps {
    message: Message;
    displayText: string;
}

// Source → Icon & Color mapping
const SOURCE_CONFIG: Record<string, { icon: string; gradient: string; label: string; dark?: boolean; custom?: string }> = {
    phone: { icon: '📱', gradient: 'from-blue-50 to-indigo-50', label: '手机记录' },
    room: { icon: '🏠', gradient: 'from-amber-50 to-orange-50', label: '小窝动态' },
    schedule: { icon: '📋', gradient: 'from-emerald-50 to-teal-50', label: '任务/日程' },
    bank: { icon: '☕', gradient: 'from-yellow-50 to-amber-50', label: '咖啡馆' },
    zhaixinglou: { icon: '✦', gradient: '', label: '星痕铭刻', dark: true },         // legacy compat
    zhaixinglou_tarot: { icon: '✦', gradient: '', label: '星镜神谕', dark: true },
    zhaixinglou_chart: { icon: '✦', gradient: '', label: '星象启示', custom: 'chart' },
};

const SystemNoticeCard: React.FC<SystemNoticeCardProps> = ({ message, displayText }) => {
    const source = (message.metadata?.source as string) || '';
    const config = SOURCE_CONFIG[source];

    if (!config) {
        // Unknown source — return null to let caller fall through to legacy pill
        return null;
    }

    // ── 星盘解读：洛可可华丽卡片 ──
    if (config.custom === 'chart') {
        return <ChartReadingCard message={message} displayText={displayText} />;
    }

    // ── 摘星楼：特殊暗金卡片 ──
    if (config.dark) {
        return (
            <div
                className="w-[85%] max-w-xs mx-auto rounded-xl px-4 py-3 shadow-lg"
                style={{
                    background: 'linear-gradient(135deg, rgba(30,25,15,0.85) 0%, rgba(45,35,20,0.75) 50%, rgba(30,25,15,0.85) 100%)',
                    border: '1px solid rgba(212,175,55,0.35)',
                    boxShadow: '0 0 15px rgba(212,175,55,0.08), inset 0 1px 0 rgba(212,175,55,0.1)',
                }}
            >
                <div className="flex items-start gap-2.5">
                    <div
                        className="text-base shrink-0 mt-0.5"
                        style={{ color: '#d4af37', textShadow: '0 0 8px rgba(212,175,55,0.5)' }}
                    >
                        {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div
                            className="text-[9px] font-medium tracking-[0.2em] uppercase mb-0.5"
                            style={{ color: '#8c6b3e' }}
                        >
                            {config.label}
                        </div>
                        <div
                            className="text-[11px] font-medium leading-relaxed line-clamp-4"
                            style={{ color: '#c8b88a' }}
                        >
                            {displayText}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── 标准浅色卡片 ──
    return (
        <div className={`w-[85%] max-w-xs mx-auto bg-gradient-to-r ${config.gradient} rounded-xl px-4 py-2.5 shadow-sm border border-white/60 backdrop-blur-sm`}>
            <div className="flex items-start gap-2.5">
                <div className="text-lg shrink-0 mt-0.5">{config.icon}</div>
                <div className="flex-1 min-w-0">
                    <div className="text-[9px] text-slate-400 font-medium tracking-wider uppercase mb-0.5">{config.label}</div>
                    <div className="text-[11px] text-slate-600 font-medium leading-relaxed line-clamp-3">{displayText}</div>
                </div>
            </div>
        </div>
    );
};

export default SystemNoticeCard;

