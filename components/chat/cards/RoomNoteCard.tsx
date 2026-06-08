import React,{ useState,useEffect } from 'react';
import { Message,RoomNote } from '../../../types';
import { DB } from '../../../utils/db';

/**
 * RoomNoteCard — 私密记事本手帐风卡片
 *
 * Renders when metadata.source === 'room' && metadata.roomEvent === 'notebook'.
 * Data resolution priority:
 *   1. metadata.noteContent (new messages, zero DB query)
 *   2. DB.getRoomNotes() → find by relatedMessageId (legacy messages)
 *   3. message.content stripped of system prefix (ultimate fallback)
 *
 * Config-driven styling: NOTE_STYLE_MAP controls per-type colors, icons, and vibe.
 */

// --- Type-to-Style Configuration Map ---
interface NoteStyleConfig {
    label: string;
    emoji: string;
    // Light mode card colors
    bgGradient: string;       // Main card background gradient
    accentColor: string;      // Accent for tape / decorations
    textColor: string;        // Primary text
    mutedColor: string;       // Secondary / label text
    borderColor: string;      // Subtle border
    tapeColor: string;        // Frosted tape bg
    glowColor: string;        // Ambient light leak
}

const NOTE_STYLE_MAP: Record<string, NoteStyleConfig> = {
    thought: {
        label: '碎碎念',
        emoji: '💭',
        bgGradient: 'linear-gradient(145deg, #f5f0f8 0%, #ede4f3 40%, #e8dff5 100%)',
        accentColor: '#b39ddb',
        textColor: '#3d2c5e',
        mutedColor: '#8b7aab',
        borderColor: 'rgba(179, 157, 219, 0.25)',
        tapeColor: 'rgba(179, 157, 219, 0.18)',
        glowColor: 'rgba(186, 147, 230, 0.12)',
    },
    lyric: {
        label: '诗句',
        emoji: '🎵',
        bgGradient: 'linear-gradient(145deg, #f0f3f8 0%, #e0e8f0 40%, #d8e4ef 100%)',
        accentColor: '#7fa8c9',
        textColor: '#2c3e50',
        mutedColor: '#7093ab',
        borderColor: 'rgba(127, 168, 201, 0.25)',
        tapeColor: 'rgba(127, 168, 201, 0.18)',
        glowColor: 'rgba(100, 160, 220, 0.10)',
    },
    gossip: {
        label: '偷偷说',
        emoji: '🤫',
        bgGradient: 'linear-gradient(145deg, #fdf2f5 0%, #fce4ec 40%, #f8d7e0 100%)',
        accentColor: '#e091a8',
        textColor: '#5d2a3a',
        mutedColor: '#b5677d',
        borderColor: 'rgba(224, 145, 168, 0.25)',
        tapeColor: 'rgba(224, 145, 168, 0.18)',
        glowColor: 'rgba(240, 130, 170, 0.10)',
    },
    doodle: {
        label: '涂鸦',
        emoji: '🖊️',
        bgGradient: 'linear-gradient(145deg, #faf8f4 0%, #f5f0e8 40%, #efe8dc 100%)',
        accentColor: '#c4a97d',
        textColor: '#4a3f2f',
        mutedColor: '#9e8b6e',
        borderColor: 'rgba(196, 169, 125, 0.25)',
        tapeColor: 'rgba(196, 169, 125, 0.18)',
        glowColor: 'rgba(200, 170, 100, 0.10)',
    },
    search: {
        label: '好奇心',
        emoji: '🔎',
        bgGradient: 'linear-gradient(145deg, #f0f6f4 0%, #e0f0ec 40%, #d4ebe4 100%)',
        accentColor: '#7bb5a3',
        textColor: '#264a3f',
        mutedColor: '#6b9e8e',
        borderColor: 'rgba(123, 181, 163, 0.25)',
        tapeColor: 'rgba(123, 181, 163, 0.18)',
        glowColor: 'rgba(100, 190, 160, 0.10)',
    },
};

const DEFAULT_STYLE: NoteStyleConfig = NOTE_STYLE_MAP.thought;

const COLLAPSE_THRESHOLD = 80; // Characters before collapsing

interface RoomNoteCardProps {
    message: Message;
}

const RoomNoteCard: React.FC<RoomNoteCardProps> = ({ message }) => {
    const [expanded, setExpanded] = useState(false);
    const [noteContent, setNoteContent] = useState<string>('');
    const [noteTypeResolved, setNoteTypeResolved] = useState<string>(message.metadata?.noteType || 'thought');

    // --- 3-tier content resolution: metadata → DB → message fallback ---
    useEffect(() => {
        let cancelled = false;
        const meta = message.metadata;

        // Tier 1: New messages have full content in metadata (zero DB query)
        if (meta?.noteContent) {
            setNoteContent(meta.noteContent);
            setNoteTypeResolved(meta.noteType || 'thought');
            return;
        }

        // Tier 2: Legacy messages — async query DB for the linked RoomNote
        const loadFromDB = async () => {
            try {
                const notes = await DB.getRoomNotes(message.charId);
                if (cancelled) return;
                const matched = notes.find((n: RoomNote) => n.relatedMessageId === message.id);
                if (matched) {
                    setNoteContent(matched.content);
                    setNoteTypeResolved(matched.type || 'thought');
                    return;
                }
            } catch (e) {
                console.warn('RoomNoteCard: DB fallback failed', e);
            }

            // Tier 3: Ultimate fallback — strip system prefix from message content
            if (!cancelled) {
                const fallback = (meta?.notePreview) || message.content
                    .replace(/^\[(System|系统|System Log|系统记录)\s*[:：]?\s*/i, '')
                    .replace(/\]$/, '')
                    .trim();
                setNoteContent(fallback);
            }
        };
        loadFromDB();

        return () => { cancelled = true; };
    }, [message.id, message.charId, message.metadata, message.content]);

    const style = NOTE_STYLE_MAP[noteTypeResolved] || DEFAULT_STYLE;

    // Deterministic decorations from message ID
    const seed = message.id ?? 0;
    const cardRotation = ((seed * 3) % 5) - 2; // -2 to +2 degrees
    const tapeRotation = ((seed * 7) % 9) - 4; // -4 to +4 degrees
    const tapeStyle = seed % 3; // 0: top-left, 1: top-center, 2: top-right

    const isLong = noteContent.length > COLLAPSE_THRESHOLD;
    const shouldCollapse = isLong && !expanded;

    // Format timestamp
    const dateObj = new Date(message.timestamp);
    const timeStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;

    return (
        <div className="room-note-card w-[85%] max-w-[300px] mx-auto select-none my-1">
            <div
                className="relative"
                style={{ transform: `rotate(${cardRotation}deg)` }}
            >
                {/* === Frosted tape decoration === */}
                <div
                    className="absolute -top-2 z-10 h-4 w-14 rounded-[2px]"
                    style={{
                        background: style.tapeColor,
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        border: `1px solid ${style.borderColor}`,
                        transform: `rotate(${tapeRotation}deg)`,
                        ...(tapeStyle === 0
                            ? { left: '16px' }
                            : tapeStyle === 1
                                ? { left: '50%', marginLeft: '-28px' }
                                : { right: '16px' }),
                    }}
                />

                {/* === Main card body === */}
                <div
                    className="relative rounded-lg pt-5 pb-3.5 px-4 overflow-hidden"
                    style={{
                        background: style.bgGradient,
                        border: `1px solid ${style.borderColor}`,
                        boxShadow: `
                            0 2px 12px rgba(0,0,0,0.06),
                            inset 0 1px 0 rgba(255,255,255,0.6)
                        `,
                        fontFamily: "'NoteFont', 'JournalFont', 'Klee One', 'STKaiti', cursive",
                    }}
                >
                    {/* Ambient light leak effect */}
                    <div
                        className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none opacity-60"
                        style={{
                            background: `radial-gradient(circle at 70% 30%, ${style.glowColor}, transparent 70%)`,
                            filter: 'blur(8px)',
                        }}
                    />

                    {/* Subtle paper texture overlay */}
                    <div
                        className="absolute inset-0 pointer-events-none opacity-[0.03]"
                        style={{
                            backgroundImage: `radial-gradient(circle, #000 0.3px, transparent 0.3px)`,
                            backgroundSize: '6px 6px',
                        }}
                    />

                    {/* === Header: type badge + time === */}
                    <div className="flex items-center justify-between mb-2.5 relative z-10">
                        <div
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{
                                background: style.tapeColor,
                                color: style.mutedColor,
                                backdropFilter: 'blur(4px)',
                            }}
                        >
                            <span>{style.emoji}</span>
                            <span>{style.label}</span>
                        </div>
                        <div
                            className="text-[9px] italic"
                            style={{ color: style.mutedColor }}
                        >
                            {timeStr}
                        </div>
                    </div>

                    {/* === Content area === */}
                    <div className="relative z-10">
                        <div
                            className="relative overflow-hidden transition-all duration-300"
                            style={{
                                maxHeight: shouldCollapse ? '60px' : '600px',
                            }}
                        >
                            <p
                                className="text-[12.5px] leading-[22px] whitespace-pre-wrap break-words m-0"
                                style={{ color: style.textColor }}
                            >
                                {noteContent}
                            </p>

                            {/* Fade-out mask for collapsed state */}
                            {shouldCollapse && (
                                <div
                                    className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
                                    style={{
                                        background: `linear-gradient(transparent, ${style.bgGradient.includes('#f5f0f8') ? '#ede4f3' : '#f0f0f0'})`,
                                    }}
                                />
                            )}
                        </div>

                        {/* Expand / Collapse button */}
                        {isLong && (
                            <button
                                onClick={() => setExpanded(!expanded)}
                                className="mt-1 text-[10px] border-none bg-transparent cursor-pointer transition-opacity hover:opacity-80"
                                style={{ color: style.accentColor, padding: 0 }}
                            >
                                {expanded ? '收起 ▲' : '展开全文 ▼'}
                            </button>
                        )}
                    </div>

                    {/* === Footer watermark === */}
                    <div
                        className="mt-2.5 pt-2 flex items-center justify-between relative z-10"
                        style={{ borderTop: `1px dotted ${style.borderColor}` }}
                    >
                        <div
                            className="text-[8px] italic tracking-wider opacity-40"
                            style={{ color: style.mutedColor }}
                        >
                            private note ✦
                        </div>
                        {/* Tiny corner stamp */}
                        <div
                            className="text-sm opacity-20"
                            style={{ transform: 'rotate(8deg)' }}
                        >
                            {style.emoji}
                        </div>
                    </div>
                </div>

                {/* === Stacked paper shadow layers === */}
                <div
                    className="absolute -bottom-1 left-1 right-1 h-full rounded-lg -z-10"
                    style={{
                        background: style.bgGradient,
                        opacity: 0.3,
                        border: `1px solid ${style.borderColor}`,
                        transform: 'rotate(1.2deg)',
                    }}
                />
                <div
                    className="absolute -bottom-1.5 left-1.5 right-1.5 h-full rounded-lg -z-20"
                    style={{
                        background: style.bgGradient,
                        opacity: 0.15,
                        border: `1px solid ${style.borderColor}`,
                        transform: 'rotate(-0.8deg)',
                    }}
                />
            </div>
        </div>
    );
};

export default RoomNoteCard;
