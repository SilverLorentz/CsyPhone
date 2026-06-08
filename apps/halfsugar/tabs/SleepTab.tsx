/**
 * SleepTab — Sleep recording, quality tracking + weekly summary
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useHalfSugar } from '../HalfSugarContext';
import { BottomSheetModal } from '../HalfSugarTrackingUI';
import { computeSleepDurationMinutes, formatDurationMinutes, type SleepQuality } from '../types';
import { getRecentSleep } from '../storage/healthDB';

interface SleepRecord {
    id: string;
    date: string;
    sleepTime: string;
    wakeTime: string;
    durationMinutes: number;
    quality?: string;
}

const SleepTab: React.FC = () => {
    const { todaySleep, handleSaveSleep, handleDeleteSleep } = useHalfSugar();

    const [showModal, setShowModal] = useState(false);
    const [sleepTime, setSleepTime] = useState(todaySleep?.sleepTime || '23:30');
    const [wakeTime, setWakeTime] = useState(todaySleep?.wakeTime || '07:00');
    const [quality, setQuality] = useState<SleepQuality>(todaySleep?.quality || 'good');
    const [isSaving, setIsSaving] = useState(false);
    const [weekSleep, setWeekSleep] = useState<SleepRecord[]>([]);

    // Load past 7 days sleep for weekly stats
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const records = await getRecentSleep(7);
                if (!cancelled) setWeekSleep(records as SleepRecord[]);
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [todaySleep]);

    const previewDuration = useMemo(() => {
        if (!sleepTime || !wakeTime) return 0;
        return computeSleepDurationMinutes(sleepTime, wakeTime);
    }, [sleepTime, wakeTime]);

    const openModal = () => {
        setSleepTime(todaySleep?.sleepTime || '23:30');
        setWakeTime(todaySleep?.wakeTime || '07:00');
        setQuality(todaySleep?.quality || 'good');
        setShowModal(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        const ok = await handleSaveSleep(sleepTime, wakeTime, quality);
        setIsSaving(false);
        if (ok) setShowModal(false);
    };

    const handleDelete = async () => {
        setIsSaving(true);
        const ok = await handleDeleteSleep();
        setIsSaving(false);
        if (ok) setShowModal(false);
    };

    const qualityLabel = (q: SleepQuality) => q === 'good' ? '很好' : q === 'fair' ? '还行' : '不太好';

    // Weekly stats
    const weekDays = weekSleep.length;
    const avgDuration = weekDays > 0
        ? Math.round(weekSleep.reduce((sum, r) => sum + r.durationMinutes, 0) / weekDays)
        : 0;
    const goodCount = weekSleep.filter((r) => r.quality === 'good').length;

    return (
        <div className="hs-tab-content no-scrollbar">
            <div className="hs-section-title">
                <span>今日睡眠</span>
                <span>{todaySleep ? formatDurationMinutes(todaySleep.durationMinutes) : ''}</span>
            </div>

            {todaySleep ? (
                <div className="hs-track-card hs-animate-fade-in" style={{ margin: '0 20px 16px' }}>
                    <div className="hs-track-header">
                        <span className="hs-track-title"><span className="hs-emoji">🌙</span> 睡眠记录</span>
                        <span className="hs-track-value">{formatDurationMinutes(todaySleep.durationMinutes)}</span>
                    </div>
                    <div className="hs-track-subtitle">{todaySleep.sleepTime} → {todaySleep.wakeTime}</div>
                    {todaySleep.quality && (
                        <div className="hs-track-subtitle" style={{ color: 'var(--hs-text-secondary)', fontWeight: 600, marginTop: 4 }}>
                            {qualityLabel(todaySleep.quality)}
                        </div>
                    )}
                    <button className="hs-track-btn-full" onClick={openModal} style={{ marginTop: 10 }}>编辑</button>
                </div>
            ) : (
                <div className="hs-loading-card" style={{ color: 'var(--hs-text-muted)' }}>还没有睡眠记录</div>
            )}

            <button type="button" className="hs-meal-add hs-animate-fade-in" onClick={openModal}>
                <span>＋</span> {todaySleep ? '编辑睡眠' : '记录睡眠'}
            </button>

            {/* Weekly sleep stats */}
            {weekSleep.length > 0 && (
                <>
                    <div className="hs-section-title" style={{ marginTop: 8 }}><span>本周概览</span></div>
                    <div className="hs-dash-grid" style={{ paddingBottom: 20 }}>
                        <div className="hs-track-card">
                            <div className="hs-track-subtitle" style={{ marginBottom: 4, fontWeight: 600, color: 'var(--hs-text-secondary)' }}>记录天数</div>
                            <div className="hs-track-value" style={{ fontSize: 22 }}>{weekDays}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--hs-text-muted)' }}> / 7 天</span></div>
                        </div>
                        <div className="hs-track-card">
                            <div className="hs-track-subtitle" style={{ marginBottom: 4, fontWeight: 600, color: 'var(--hs-text-secondary)' }}>平均时长</div>
                            <div className="hs-track-value" style={{ fontSize: 22 }}>{formatDurationMinutes(avgDuration)}</div>
                        </div>
                        <div className="hs-track-card" style={{ gridColumn: '1 / -1' }}>
                            <div className="hs-track-subtitle" style={{ marginBottom: 4, fontWeight: 600, color: 'var(--hs-text-secondary)' }}>优质睡眠占比</div>
                            <div className="hs-track-value" style={{ fontSize: 22 }}>
                                {weekDays > 0 ? `${Math.round((goodCount / weekDays) * 100)}%` : '—'}
                                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--hs-text-muted)' }}> ({goodCount}/{weekDays} 天)</span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {showModal && (
                <BottomSheetModal title="记录睡眠" onClose={() => setShowModal(false)}>
                    <div className="hs-time-pair">
                        <input type="time" className="hs-time-input" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} />
                        <span className="hs-time-separator">→</span>
                        <input type="time" className="hs-time-input" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
                    </div>
                    <div className="hs-quality-row">
                        {(['good', 'fair', 'poor'] as SleepQuality[]).map((q) => (
                            <button key={q} type="button" className={`hs-quality-chip ${quality === q ? 'active' : ''}`} onClick={() => setQuality(q)}>
                                {qualityLabel(q)}
                            </button>
                        ))}
                    </div>
                    <div className="hs-track-subtitle">预计时长 {formatDurationMinutes(previewDuration)}</div>
                    <div className="hs-modal-action-row">
                        {todaySleep && (
                            <button type="button" className="hs-modal-secondary-btn" onClick={handleDelete} disabled={isSaving}>删除</button>
                        )}
                        <button type="button" className="hs-submit-btn hs-modal-submit-btn" onClick={handleSave} disabled={isSaving}>保存睡眠</button>
                    </div>
                </BottomSheetModal>
            )}
        </div>
    );
};

export default SleepTab;
