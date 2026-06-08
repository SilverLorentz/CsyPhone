/**
 * ActivityTab — Exercise recording + weekly summary
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useHalfSugar, parsePositiveNumber } from '../HalfSugarContext';
import { BottomSheetModal } from '../HalfSugarTrackingUI';
import { estimateCaloriesBurned, MET_TABLE, type ExerciseRecord } from '../types';
import { getRecentExercises } from '../storage/healthDB';

const ActivityTab: React.FC = () => {
    const {
        todayExercises, latestKnownWeightKg,
        handleSaveExercise, handleDeleteExercise, addToast,
    } = useHalfSugar();

    const [showModal, setShowModal] = useState(false);
    const [exerciseType, setExerciseType] = useState(Object.keys(MET_TABLE)[0] || 'walking_slow');
    const [durationMinutes, setDurationMinutes] = useState('');
    const [customName, setCustomName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [weekExercises, setWeekExercises] = useState<ExerciseRecord[]>([]);

    const selectedMeta = MET_TABLE[exerciseType] || Object.values(MET_TABLE)[0];
    const isCustom = exerciseType === 'custom';

    // Load past 7 days exercises for weekly stats
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const records = await getRecentExercises(7);
                if (!cancelled) setWeekExercises(records);
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [todayExercises]); // refresh when today's exercises change

    const previewCalories = useMemo(() => {
        const dur = parsePositiveNumber(durationMinutes);
        return dur && selectedMeta ? estimateCaloriesBurned(selectedMeta.met, latestKnownWeightKg, dur) : 0;
    }, [durationMinutes, latestKnownWeightKg, selectedMeta]);

    const handleSave = async () => {
        const dur = parsePositiveNumber(durationMinutes);
        if (!dur) { addToast('请输入运动时长', 'error'); return; }
        if (isCustom && !customName.trim()) { addToast('请输入运动名称', 'error'); return; }
        setIsSaving(true);
        const ok = await handleSaveExercise(isCustom ? `custom:${customName.trim()}` : exerciseType, dur);
        setIsSaving(false);
        if (ok) { setShowModal(false); setDurationMinutes(''); setCustomName(''); }
    };

    const totalMinutes = todayExercises.reduce((sum, e) => sum + e.durationMinutes, 0);
    const totalCaloriesBurned = todayExercises.reduce((sum, e) => sum + e.caloriesBurned, 0);
    const weekMinutes = weekExercises.reduce((sum, e) => sum + e.durationMinutes, 0);
    const weekCalories = weekExercises.reduce((sum, e) => sum + e.caloriesBurned, 0);
    const weekDays = new Set(weekExercises.map((e) => e.date)).size;

    return (
        <div className="hs-tab-content no-scrollbar">
            <div className="hs-section-title">
                <span>今日运动</span>
                <span>{totalMinutes > 0 ? `${totalMinutes} 分钟` : ''}</span>
            </div>

            {/* Today's summary card */}
            {todayExercises.length > 0 && (
                <div className="hs-track-card hs-animate-fade-in" style={{ margin: '0 20px 12px' }}>
                    <div className="hs-track-header">
                        <span className="hs-track-title"><span className="hs-emoji">🔥</span> 今日消耗</span>
                        <span className="hs-track-value">{Math.round(totalCaloriesBurned)} kcal</span>
                    </div>
                    <div className="hs-track-subtitle" style={{ marginBottom: 0 }}>
                        {todayExercises.map((e) => e.exerciseLabel).join('、')} · 共 {totalMinutes} 分钟
                    </div>
                </div>
            )}

            {todayExercises.length > 0 ? (
                <div className="hs-track-list" style={{ margin: '0 20px 16px' }}>
                    {todayExercises.map((exercise) => (
                        <div key={exercise.id} className="hs-track-list-item">
                            <div>
                                <div className="hs-track-list-title">{exercise.exerciseLabel}</div>
                                <div className="hs-track-subtitle">{exercise.durationMinutes} 分钟 · {Math.round(exercise.caloriesBurned)} kcal</div>
                            </div>
                            <button type="button" className="hs-track-delete-btn" onClick={() => handleDeleteExercise(exercise.id)}>删除</button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="hs-loading-card" style={{ color: 'var(--hs-text-muted)' }}>还没有运动记录</div>
            )}

            <button type="button" className="hs-meal-add hs-animate-fade-in" onClick={() => setShowModal(true)} style={{ marginBottom: 16 }}>
                <span>＋</span> 记录运动
            </button>

            {/* Weekly stats */}
            {weekExercises.length > 0 && (
                <>
                    <div className="hs-section-title"><span>本周概览</span></div>
                    <div className="hs-dash-grid" style={{ paddingBottom: 20 }}>
                        <div className="hs-track-card">
                            <div className="hs-track-subtitle" style={{ marginBottom: 4, fontWeight: 600, color: 'var(--hs-text-secondary)' }}>运动天数</div>
                            <div className="hs-track-value" style={{ fontSize: 22 }}>{weekDays}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--hs-text-muted)' }}> / 7 天</span></div>
                        </div>
                        <div className="hs-track-card">
                            <div className="hs-track-subtitle" style={{ marginBottom: 4, fontWeight: 600, color: 'var(--hs-text-secondary)' }}>总运动时长</div>
                            <div className="hs-track-value" style={{ fontSize: 22 }}>{weekMinutes}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--hs-text-muted)' }}> min</span></div>
                        </div>
                        <div className="hs-track-card" style={{ gridColumn: '1 / -1' }}>
                            <div className="hs-track-subtitle" style={{ marginBottom: 4, fontWeight: 600, color: 'var(--hs-text-secondary)' }}>本周总消耗</div>
                            <div className="hs-track-value" style={{ fontSize: 22 }}>{Math.round(weekCalories)}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--hs-text-muted)' }}> kcal</span></div>
                        </div>
                    </div>
                </>
            )}

            {showModal && (
                <BottomSheetModal title="记录运动" onClose={() => setShowModal(false)}>
                    <div className="hs-free-input-row">
                        <input
                            type="text"
                            className="hs-form-input"
                            value={customName}
                            onChange={(e) => { setCustomName(e.target.value); if (e.target.value.trim()) setExerciseType('custom'); }}
                            placeholder="输入运动名称，如：爬山、瑜伽"
                            maxLength={20}
                        />
                    </div>
                    <div className="hs-free-input-label">或选择类型</div>
                    <div className="hs-exercise-grid">
                        {Object.entries(MET_TABLE).filter(([key]) => key !== 'custom').map(([key, item]) => (
                            <button key={key} type="button" className={`hs-exercise-option ${exerciseType === key ? 'active' : ''}`} onClick={() => { setExerciseType(key); setCustomName(''); }}>
                                <span className="hs-exercise-emoji"><span className="hs-emoji">{item.icon}</span></span>
                                <span>{item.label}</span>
                            </button>
                        ))}
                    </div>
                    <div className="hs-form-input-with-unit">
                        <input type="number" inputMode="numeric" className="hs-form-input" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} placeholder="30" />
                        <span className="hs-unit">min</span>
                    </div>
                    <div className="hs-track-subtitle">预计消耗 {previewCalories} kcal</div>
                    <button type="button" className="hs-submit-btn hs-modal-submit-btn" onClick={handleSave} disabled={isSaving}>保存运动</button>
                </BottomSheetModal>
            )}
        </div>
    );
};

export default ActivityTab;
