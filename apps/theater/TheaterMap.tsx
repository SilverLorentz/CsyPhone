/**
 * TheaterMap — 场景地图 · 乙游票根风地点选择
 * 双列票根卡片网格 + 撕口虚线 + 场次标签 + 空白票根新增
 */

import React, { useState, useEffect } from 'react';
import type { TheaterLocation, TimeSlot } from '../../types';
import { TIME_SLOT_LABELS } from '../../types/theater';
import LocationEditor from './LocationEditor';
import { resolveTheaterBg } from '../../utils/db/theaterStore';

/** Minimal SVG icons for time-of-day — replaces emoji with elegant line art */
export const TimeSlotIcon: React.FC<{ slot: TimeSlot; size?: number; className?: string }> = ({ slot, size = 14, className }) => {
    const props = { xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
    switch (slot) {
        case 'morning': // sunrise — half sun with horizon
            return <svg {...props}><path d="M12 2v3" /><path d="M4.93 4.93l2.12 2.12" /><path d="M19.07 4.93l-2.12 2.12" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="M12 16a4 4 0 0 1-4-4" /><path d="M12 16a4 4 0 0 0 4-4" /><line x1="2" y1="18" x2="22" y2="18" strokeDasharray="2 2" /></svg>;
        case 'afternoon': // full sun
            return <svg {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="M6.34 17.66l-1.41 1.41" /><path d="M19.07 4.93l-1.41 1.41" /></svg>;
        case 'evening': // sunset — sun dipping below horizon
            return <svg {...props}><path d="M12 10a4 4 0 0 1 4 4" /><path d="M12 10a4 4 0 0 0-4 4" /><line x1="2" y1="16" x2="22" y2="16" /><path d="M12 3v4" /><path d="M5.5 5.5l2 2" /><path d="M18.5 5.5l-2 2" /></svg>;
        case 'night': // crescent moon + star
            return <svg {...props}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /><path d="M17 5l.5 1.5L19 7l-1.5.5L17 9l-.5-1.5L15 7l1.5-.5L17 5z" strokeWidth={1.2} /></svg>;
    }
};

const TAG_LABELS: Record<string, string> = {
    romantic: '浪漫',
    daily: '日常',
    adventure: '冒险',
    quiet: '安静',
    crowded: '热闹',
    outdoor: '户外',
    indoor: '室内',
};

/** Short scene-mood hints mapped by primary tag */
const SCENE_HINTS: Record<string, string> = {
    romantic: '适合心动告白',
    daily: '轻松日常约会',
    adventure: '一起去冒险吧',
    quiet: '适合安静散步',
    crowded: '热闹又欢乐',
    outdoor: '感受微风阳光',
    indoor: '温暖室内时光',
};

/** Time-slot abbreviations for ticket serial */
const TIME_ABBR: Record<string, string> = {
    morning: 'MOR',
    afternoon: 'AFT',
    evening: 'EVE',
    night: 'NIG',
};

interface TheaterMapProps {
    locations: TheaterLocation[];
    timeSlot: TimeSlot;
    is520: boolean;
    visitedLocationIds: string[];
    onSelectLocation: (location: TheaterLocation) => void;
    onAddLocation: (location: TheaterLocation) => void;
    onDeleteCustomLocation: (id: string) => void;
    onBack: () => void;
}

const TheaterMap: React.FC<TheaterMapProps> = ({
    locations,
    timeSlot,
    is520,
    visitedLocationIds,
    onSelectLocation,
    onAddLocation,
    onDeleteCustomLocation,
    onBack,
}) => {
    const [showEditor, setShowEditor] = useState(false);
    const [resolvedBgs, setResolvedBgs] = useState<Record<string, string>>({});
    const timeLabel = TIME_SLOT_LABELS[timeSlot];

    // Resolve custom location bg images from IndexedDB
    useEffect(() => {
        let cancelled = false;
        const resolve = async () => {
            const result: Record<string, string> = {};
            await Promise.all(locations.map(async (loc) => {
                if (!loc.bgImage) return;
                const url = await resolveTheaterBg(loc.bgImage);
                if (url) result[loc.id] = url;
            }));
            if (!cancelled) setResolvedBgs(result);
        };
        resolve();
        return () => { cancelled = true; };
    }, [locations]);

    const handleLongPress = (locId: string, isPreset: boolean) => {
        if (isPreset) return;
        if (window.confirm('删除这个自定义地点？')) {
            onDeleteCustomLocation(locId);
        }
    };

    /** Unified visit-count copy — 方案A */
    const getVisitLabel = (count: number) => {
        if (count <= 0) return null;
        if (count === 1) return '首次赴约';
        return `赴约 ${count} 次`;
    };

    /** Pick the best scene hint from location tags */
    const getSceneHint = (tags: string[]) => {
        for (const t of tags) {
            if (SCENE_HINTS[t]) return SCENE_HINTS[t];
        }
        return '开启约会片段';
    };

    return (
        <div className="theater-map">
            {/* Paper texture overlay */}
            <div className="theater-map-paper-texture" />

            {/* 520 Petals */}
            {is520 && (
                <div className="theater-petals">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="theater-petal" />
                    ))}
                </div>
            )}

            {/* Header */}
            <div className="theater-map-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="theater-back-btn" onClick={onBack}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={18} height={18}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <div>
                        <div className="theater-map-title">约会</div>
                        <div className="theater-map-subtitle">LET'S FALL IN LOVE</div>
                    </div>
                </div>

                <div className={`theater-time-badge theater-time-badge--${timeSlot}`}>
                    <TimeSlotIcon slot={timeSlot} size={13} className="theater-time-slot-icon" />
                    <span>{timeLabel.zh}场</span>
                </div>
            </div>

            {/* Session info line */}
            <div className="theater-map-session-info">
                <span className="theater-map-session-dot" />
                今日场次 · {timeLabel.zh}场
            </div>

            {/* Decorative rule */}
            <div className="theater-map-rule" />

            {/* Tagline */}
            <div className="theater-map-tagline">
                选择一张票根，开启你们的约会片段。
            </div>

            {/* Ticket Stub Grid */}
            <div className="theater-card-scroll">
                <div className="theater-card-grid">
                    {locations.map((loc, idx) => {
                        const visited = visitedLocationIds.includes(loc.id);
                        const sceneNum = String(idx + 1).padStart(2, '0');
                        const visitLabel = getVisitLabel(loc.visitCount);
                        const sceneHint = getSceneHint(loc.tags);
                        const serialAbbr = TIME_ABBR[timeSlot] || 'AFT';

                        return (
                            <div
                                key={loc.id}
                                className={`theater-ticket${visited ? ' theater-ticket--visited' : ''}`}
                                onClick={() => onSelectLocation(loc)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    handleLongPress(loc.id, loc.isPreset);
                                }}
                            >
                                {/* Image area */}
                                <div className="theater-ticket-img">
                                    {/* Pink-tint unifier layer */}
                                    <div className="theater-ticket-img-tint" />
                                    <div
                                        className="theater-ticket-img-bg"
                                        style={{
                                        background: resolvedBgs[loc.id]
                                                ? `url(${resolvedBgs[loc.id]}) center/cover`
                                                : loc.bgGradient || 'linear-gradient(135deg, #f5d0e0, #e8d5f5)',
                                        }}
                                    />
                                    <div className="theater-ticket-img-overlay">
                                        <div className="theater-ticket-loc-name">{loc.name}</div>
                                        {loc.nameEn && <div className="theater-ticket-loc-en">{loc.nameEn}</div>}
                                    </div>

                                    {/* Visited badge */}
                                    {visited && (
                                        <div className="theater-ticket-visited">✓ 今日已赴约</div>
                                    )}
                                </div>

                                {/* Tear line with notches */}
                                <div className="theater-ticket-tear">
                                    <div className="theater-ticket-notch theater-ticket-notch-l" />
                                    <div className="theater-ticket-tear-line" />
                                    <div className="theater-ticket-notch theater-ticket-notch-r" />
                                </div>

                                {/* Info area — enriched ticket stub */}
                                <div className="theater-ticket-info">
                                    {/* Row 1: SCENE + visit badge */}
                                    <div className="theater-ticket-info-top">
                                        <span className="theater-ticket-scene">SCENE {sceneNum}</span>
                                        {visitLabel && (
                                            <span className="theater-ticket-visit-badge">{visitLabel}</span>
                                        )}
                                        {!loc.isPreset && loc.id.startsWith('dir_') && !visitLabel && (
                                            <span className="theater-ticket-discovered-badge">story 剧情发现</span>
                                        )}
                                        {!loc.isPreset && !loc.id.startsWith('dir_') && !visitLabel && (
                                            <span className="theater-ticket-custom-badge">自定义</span>
                                        )}
                                    </div>

                                    {/* Row 2: Scene hint */}
                                    <div className="theater-ticket-hint">{sceneHint}</div>

                                    {/* Row 3: Tags */}
                                    <div className="theater-ticket-tags">
                                        {loc.tags.slice(0, 3).map(tag => (
                                            <span key={tag} className="theater-ticket-tag">
                                                {TAG_LABELS[tag] || tag}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Row 4: Ticket serial */}
                                    <div className="theater-ticket-footer">
                                        <span className="theater-ticket-entry">ENTRY</span>
                                        <span className="theater-ticket-serial">
                                            DATE PASS {sceneNum} · {serialAbbr}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Add new — blank ticket stub */}
                    <div
                        className="theater-ticket theater-ticket-add"
                        onClick={() => setShowEditor(true)}
                    >
                        <div className="theater-ticket-add-inner">
                            <div className="theater-ticket-add-icon">＋</div>
                            <div className="theater-ticket-add-title">新增约会地点</div>
                            <div className="theater-ticket-add-sub">创建属于你们的新场次</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Location Editor */}
            <LocationEditor
                isOpen={showEditor}
                onClose={() => setShowEditor(false)}
                onSave={onAddLocation}
            />
        </div>
    );
};

export default TheaterMap;
