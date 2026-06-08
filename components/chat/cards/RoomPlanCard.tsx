import React,{ useState,useEffect } from 'react';
import { Message,RoomTodo } from '../../../types';
import { DB } from '../../../utils/db';

/**
 * RoomPlanCard — 拼贴手帐风今日计划卡片
 *
 * Renders when metadata.source === 'room' && metadata.roomEvent === 'todo'.
 * Loads the RoomTodo data from DB using charId + timestamp-derived date key.
 * Pure display — does NOT allow toggling items from chat side.
 */

// --- Helper: Get virtual day from a timestamp (mirrors RoomApp logic) ---
// Resets at 6 AM: if before 6 AM, count as previous day
const getVirtualDayFromTimestamp = (ts: number): string => {
    const d = new Date(ts);
    if (d.getHours() < 6) {
        d.setDate(d.getDate() - 1);
    }
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
};

// --- Decorative constants ---
const TAPE_COLORS = [
    'bg-pink-200/70',
    'bg-amber-200/70',
    'bg-sky-200/70',
    'bg-lime-200/70',
    'bg-violet-200/70',
];

const STAMP_EMOJIS = ['📌', '🌸', '☕', '🐾', '✨', '🎀', '🍓', '🌙'];

interface RoomPlanCardProps {
    message: Message;
}

const RoomPlanCard: React.FC<RoomPlanCardProps> = ({ message }) => {
    const [todo, setTodo] = useState<RoomTodo | null>(null);
    const [loading, setLoading] = useState(true);

    // Deterministic random from message ID for decorations
    const seed = message.id ?? 0;
    const tapeColor = TAPE_COLORS[seed % TAPE_COLORS.length];
    const tapeRotation = ((seed * 7) % 11) - 5; // -5 to +5 degrees
    const stampEmoji = STAMP_EMOJIS[seed % STAMP_EMOJIS.length];
    const cardRotation = ((seed * 3) % 5) - 2; // -2 to +2 degrees subtle tilt

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const date = getVirtualDayFromTimestamp(message.timestamp);
                const result = await DB.getRoomTodo(message.charId, date);
                if (!cancelled) {
                    setTodo(result);
                }
            } catch (e) {
                console.warn('RoomPlanCard: Failed to load todo', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [message.id, message.charId, message.timestamp]);

    // --- Loading skeleton ---
    if (loading) {
        return (
            <div className="room-plan-card w-[85%] max-w-[300px] mx-auto">
                <div className="bg-amber-50/80 rounded-lg p-5 shadow-sm border border-amber-100/60 animate-pulse">
                    <div className="h-3 bg-amber-200/50 rounded w-2/3 mb-3"></div>
                    <div className="h-2.5 bg-amber-200/40 rounded w-full mb-2"></div>
                    <div className="h-2.5 bg-amber-200/40 rounded w-5/6 mb-2"></div>
                    <div className="h-2.5 bg-amber-200/40 rounded w-4/6"></div>
                </div>
            </div>
        );
    }

    // --- Empty / no data ---
    if (!todo || todo.items.length === 0) {
        return (
            <div className="room-plan-card w-[85%] max-w-[300px] mx-auto">
                <div
                    className="relative bg-[#fffef5] rounded-lg p-5 shadow-md border border-amber-100/60"
                    style={{
                        backgroundImage: 'radial-gradient(circle, #e8e4d8 0.5px, transparent 0.5px)',
                        backgroundSize: '12px 12px',
                        transform: `rotate(${cardRotation}deg)`,
                        fontFamily: "'JournalFont', 'Klee One', 'STKaiti', cursive",
                    }}
                >
                    <div className="text-center text-amber-400/70 text-sm py-4">
                        📝 今天好像没有计划哦~
                    </div>
                </div>
            </div>
        );
    }

    const completedCount = todo.items.filter(i => i.done).length;
    const totalCount = todo.items.length;
    const progress = Math.round((completedCount / totalCount) * 100);

    // Date display
    const dateObj = new Date(todo.generatedAt || message.timestamp);
    const monthDay = `${dateObj.getMonth() + 1}.${dateObj.getDate()}`;
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekDay = weekDays[dateObj.getDay()];

    return (
        <div className="room-plan-card w-[85%] max-w-[300px] mx-auto select-none">
            {/* Outer paper card with subtle tilt */}
            <div
                className="relative"
                style={{ transform: `rotate(${cardRotation}deg)` }}
            >
                {/* Washi tape decoration at top */}
                <div
                    className={`absolute -top-2.5 left-1/2 -translate-x-1/2 h-5 w-20 ${tapeColor} rounded-sm z-10 shadow-sm`}
                    style={{
                        transform: `rotate(${tapeRotation}deg)`,
                        backdropFilter: 'blur(2px)',
                        opacity: 0.85,
                    }}
                ></div>

                {/* Main card body */}
                <div
                    className="relative bg-[#fffef5] rounded-lg pt-6 pb-4 px-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-amber-100/50 overflow-hidden"
                    style={{
                        backgroundImage: `
                            linear-gradient(transparent 23px, #e8dcc8 24px),
                            radial-gradient(circle, #e8e4d8 0.4px, transparent 0.4px)
                        `,
                        backgroundSize: '100% 24px, 10px 10px',
                        fontFamily: "'JournalFont', 'Klee One', 'STKaiti', cursive",
                    }}
                >
                    {/* Corner stamp decoration */}
                    <div
                        className="absolute top-2 right-3 text-xl opacity-30 pointer-events-none"
                        style={{ transform: 'rotate(12deg)' }}
                    >
                        {stampEmoji}
                    </div>

                    {/* Header area */}
                    <div className="flex items-end justify-between mb-3 pb-1.5 border-b border-dashed border-amber-200/60">
                        {/* Date pill */}
                        <div className="flex items-center gap-1.5">
                            <div className="bg-amber-800/80 text-amber-50 text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider">
                                {monthDay} 周{weekDay}
                            </div>
                        </div>
                        {/* Progress badge */}
                        <div className="flex items-center gap-1">
                            <div className="text-[9px] text-amber-500/70 font-medium">
                                {completedCount}/{totalCount}
                            </div>
                            {/* Mini progress ring */}
                            <svg width="16" height="16" viewBox="0 0 20 20" className="opacity-60">
                                <circle cx="10" cy="10" r="8" fill="none" stroke="#e8dcc8" strokeWidth="2.5" />
                                <circle
                                    cx="10" cy="10" r="8" fill="none"
                                    stroke={progress === 100 ? '#86efac' : '#d97706'}
                                    strokeWidth="2.5"
                                    strokeDasharray={`${(progress / 100) * 50.27} 50.27`}
                                    strokeLinecap="round"
                                    transform="rotate(-90 10 10)"
                                />
                            </svg>
                        </div>
                    </div>

                    {/* Title */}
                    <div className="text-[13px] font-bold text-amber-900/80 mb-2.5 tracking-wide">
                        ☀️ 今日计划
                    </div>

                    {/* Todo items */}
                    <div className="space-y-1">
                        {todo.items.map((item, idx) => (
                            <div
                                key={idx}
                                className="flex items-start gap-2 py-1 group"
                            >
                                {/* Checkbox visual (read-only) */}
                                <div className={`mt-0.5 w-3.5 h-3.5 rounded-sm border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${item.done
                                        ? 'bg-green-400/70 border-green-500/50'
                                        : 'border-amber-300/80 bg-transparent'
                                    }`}>
                                    {item.done && (
                                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                                        </svg>
                                    )}
                                </div>
                                {/* Text */}
                                <span className={`text-[12px] leading-[24px] transition-all ${item.done
                                        ? 'text-amber-400/60 line-through decoration-amber-300/40'
                                        : 'text-amber-900/75'
                                    }`}>
                                    {item.text}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Bottom decoration - small doodle line */}
                    <div className="mt-3 pt-2 border-t border-dotted border-amber-200/40 flex items-center justify-between">
                        <div className="text-[9px] text-amber-400/50 italic tracking-wider">
                            — from the room 🏠
                        </div>
                        {progress === 100 && (
                            <div className="text-[10px] bg-green-100/80 text-green-600/80 px-2 py-0.5 rounded-full font-bold tracking-wide">
                                ✅ ALL DONE!
                            </div>
                        )}
                    </div>
                </div>

                {/* Paper shadow layers (stacked paper effect) */}
                <div
                    className="absolute -bottom-1 left-1 right-1 h-full bg-amber-50/40 rounded-lg -z-10 border border-amber-100/30"
                    style={{ transform: 'rotate(1.5deg)' }}
                ></div>
                <div
                    className="absolute -bottom-2 left-2 right-2 h-full bg-amber-50/20 rounded-lg -z-20 border border-amber-100/20"
                    style={{ transform: 'rotate(-1deg)' }}
                ></div>
            </div>
        </div>
    );
};

export default RoomPlanCard;
