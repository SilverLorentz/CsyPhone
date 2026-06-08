/**
 * InlineLocationSheet — 底部抽屉式全量场景选择器
 * 在 session 内渲染，不离开聊天界面。
 * 粉色毛玻璃风格，延续「恋爱控制器」设计语言。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TheaterLocation, TimeSlot } from '../../types';
import { TIME_SLOT_LABELS } from '../../types/theater';
import LocationEditor from './LocationEditor';
import { resolveTheaterBg } from '../../utils/db/theaterStore';

const TAG_LABELS: Record<string, string> = {
    romantic: '浪漫', daily: '日常', adventure: '冒险',
    quiet: '安静', crowded: '热闹', outdoor: '户外', indoor: '室内',
};

const SCENE_HINTS: Record<string, string> = {
    romantic: '适合心动告白', daily: '轻松日常约会', adventure: '一起去冒险吧',
    quiet: '适合安静散步', crowded: '热闹又欢乐', outdoor: '感受微风阳光', indoor: '温暖室内时光',
};

interface InlineLocationSheetProps {
    isOpen: boolean;
    onClose: () => void;
    locations: TheaterLocation[];
    currentLocationId: string;
    visitedLocationIds: string[];
    timeSlot: TimeSlot;
    onSelectLocation: (loc: TheaterLocation) => void;
    onAddLocation: (loc: TheaterLocation) => void;
    onDeleteCustomLocation: (id: string) => void;
}

const InlineLocationSheet: React.FC<InlineLocationSheetProps> = ({
    isOpen, onClose, locations, currentLocationId,
    visitedLocationIds, timeSlot,
    onSelectLocation, onAddLocation, onDeleteCustomLocation,
}) => {
    const [showEditor, setShowEditor] = useState(false);
    const [resolvedBgs, setResolvedBgs] = useState<Record<string, string>>({});
    const timeLabel = TIME_SLOT_LABELS[timeSlot];

    // Resolve custom bg images
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
        if (isOpen) resolve();
        return () => { cancelled = true; };
    }, [locations, isOpen]);

    const getSceneHint = (tags: string[]) => {
        for (const t of tags) {
            if (SCENE_HINTS[t]) return SCENE_HINTS[t];
        }
        return '开启约会片段';
    };

    const handleSelect = useCallback((loc: TheaterLocation) => {
        if (loc.id === currentLocationId) return; // 已在当前场景
        onClose();
        // 延迟一帧让 sheet 关闭动画开始后再触发转场
        requestAnimationFrame(() => onSelectLocation(loc));
    }, [currentLocationId, onClose, onSelectLocation]);

    const handleLongPress = (locId: string, isPreset: boolean) => {
        if (isPreset) return;
        if (window.confirm('删除这个自定义地点？')) {
            onDeleteCustomLocation(locId);
        }
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            className="tls-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            onClick={onClose}
                        />

                        {/* Sheet */}
                        <motion.div
                            className="tls-sheet"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Handle */}
                            <div className="tls-handle-bar">
                                <div className="tls-handle" />
                            </div>

                            {/* Header */}
                            <div className="tls-header">
                                <div className="tls-header-left">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4607A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                                        <circle cx="12" cy="12" r="3"/>
                                    </svg>
                                    <span className="tls-title">切换场景</span>
                                </div>
                                <div className="tls-time-badge">
                                    <span>{timeLabel.icon}</span>
                                    <span>{timeLabel.zh}场</span>
                                </div>
                            </div>

                            {/* Current location indicator */}
                            <div className="tls-current">
                                <span className="tls-current-pin">now</span>
                                <span className="tls-current-label">当前：</span>
                                <span className="tls-current-name">
                                    {locations.find(l => l.id === currentLocationId)?.name || '未知'}
                                </span>
                            </div>

                            {/* Grid */}
                            <div className="tls-scroll">
                                <div className="tls-grid">
                                    {locations.map(loc => {
                                        const isCurrent = loc.id === currentLocationId;
                                        const visited = visitedLocationIds.includes(loc.id);
                                        const sceneHint = getSceneHint(loc.tags);

                                        return (
                                            <div
                                                key={loc.id}
                                                className={`tls-card${isCurrent ? ' tls-card--current' : ''}${visited ? ' tls-card--visited' : ''}`}
                                                onClick={() => handleSelect(loc)}
                                                onContextMenu={e => {
                                                    e.preventDefault();
                                                    handleLongPress(loc.id, loc.isPreset);
                                                }}
                                            >
                                                {/* Card image */}
                                                <div className="tls-card-img">
                                                    <div
                                                        className="tls-card-img-bg"
                                                        style={{
                                                            background: resolvedBgs[loc.id]
                                                                ? `url(${resolvedBgs[loc.id]}) center/cover`
                                                                : loc.bgGradient || 'linear-gradient(135deg, #f5d0e0, #e8d5f5)',
                                                        }}
                                                    />
                                                    <div className="tls-card-img-overlay">
                                                        <div className="tls-card-name">{loc.name}</div>
                                                        {loc.nameEn && <div className="tls-card-name-en">{loc.nameEn}</div>}
                                                    </div>
                                                    {isCurrent && (
                                                        <div className="tls-card-current-badge">✓ 当前</div>
                                                    )}
                                                </div>

                                                {/* Card info */}
                                                <div className="tls-card-info">
                                                    <div className="tls-card-hint">{sceneHint}</div>
                                                    <div className="tls-card-tags">
                                                        {loc.tags.slice(0, 2).map(tag => (
                                                            <span key={tag} className="tls-card-tag">
                                                                {TAG_LABELS[tag] || tag}
                                                            </span>
                                                        ))}
                                                        {!loc.isPreset && (
                                                            <span className="tls-card-tag tls-card-tag--custom">
                                                                {loc.id.startsWith('dir_') ? 'found' : 'new'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Add new location */}
                                    <div
                                        className="tls-card tls-card--add"
                                        onClick={() => setShowEditor(true)}
                                    >
                                        <div className="tls-card-add-inner">
                                            <div className="tls-card-add-icon">＋</div>
                                            <div className="tls-card-add-title">新增地点</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Close button at bottom */}
                            <div className="tls-footer">
                                <button className="tls-close-btn" onClick={onClose}>
                                    收起
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Location Editor (reused) */}
            <LocationEditor
                isOpen={showEditor}
                onClose={() => setShowEditor(false)}
                onSave={(loc) => { onAddLocation(loc); setShowEditor(false); }}
            />
        </>
    );
};

export default InlineLocationSheet;
