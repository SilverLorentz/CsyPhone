/**
 * TrendsTab — Weight tracking + health summaries (weekly/monthly reports)
 */
import React, { useEffect, useState } from 'react';
import { useHalfSugar, formatSummaryStatValue } from '../HalfSugarContext';
import { BottomSheetModal } from '../HalfSugarTrackingUI';
import { formatDurationMinutes, formatWeekKeyAsRange, getCurrentWeekRange, getCurrentMonthKey, sortWeightRecordsByLatest, type WeightTimeOfDay } from '../types';

const TrendsTab: React.FC = () => {
    const {
        weightRecords, latestWeight, latestBmi, weightDelta, todayDate,
        handleSaveWeight, handleDeleteWeight,
        summaries, isGeneratingSummary, isSummaryListLoading,
        handleGenerateWeeklySummary, handleGenerateMonthlySummary, handleDeleteSummary, handleOpenSummaries,
    } = useHalfSugar();

    const [weightModalOpen, setWeightModalOpen] = useState(false);
    const [weightTimeOfDay, setWeightTimeOfDay] = useState<WeightTimeOfDay>('morning');
    const [weightValue, setWeightValue] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Load all summaries on mount
    useEffect(() => { void handleOpenSummaries(); }, [handleOpenSummaries]);

    const openWeightModal = (tod: WeightTimeOfDay) => {
        const existing = weightRecords.find((r) => r.date === todayDate && r.timeOfDay === tod);
        setWeightTimeOfDay(tod);
        setWeightValue(existing ? String(existing.weight) : '');
        setWeightModalOpen(true);
    };

    const selectedWeightRecord = weightRecords.find((r) => r.date === todayDate && r.timeOfDay === weightTimeOfDay);

    const handleSave = async () => {
        setIsSaving(true);
        const ok = await handleSaveWeight(weightTimeOfDay, weightValue);
        setIsSaving(false);
        if (ok) setWeightModalOpen(false);
    };

    const handleDelete = async () => {
        if (!selectedWeightRecord) return;
        setIsSaving(true);
        const ok = await handleDeleteWeight(selectedWeightRecord.id);
        setIsSaving(false);
        if (ok) setWeightModalOpen(false);
    };

    const recentWeights = sortWeightRecordsByLatest(weightRecords).slice(0, 10);

    return (
        <div className="hs-tab-content no-scrollbar">
            {/* Weight section */}
            <div className="hs-section-title"><span><span className="hs-emoji">⚖️</span> 体重</span></div>
            <div className="hs-track-card hs-animate-fade-in" style={{ margin: '0 20px 16px' }}>
                <div className="hs-track-header">
                    <span className="hs-track-title">最新体重</span>
                    <span className="hs-track-value">{latestWeight ? `${latestWeight.weight} kg` : '—'}</span>
                </div>
                {latestWeight && latestBmi && (
                    <div className="hs-track-subtitle">BMI {latestBmi}</div>
                )}
                {weightDelta && (
                    <div className="hs-weight-delta neutral">{weightDelta.text}</div>
                )}
                <div className="hs-track-actions">
                    <button className="hs-track-btn" onClick={() => openWeightModal('morning')}><span className="hs-emoji">🌤️</span> 晨间</button>
                    <button className="hs-track-btn" onClick={() => openWeightModal('evening')}><span className="hs-emoji">🌙</span> 晚间</button>
                </div>
            </div>

            {recentWeights.length > 0 && (
                <div className="hs-track-list" style={{ margin: '0 20px 20px' }}>
                    {recentWeights.map((r) => (
                        <div key={r.id} className="hs-track-list-item">
                            <div>
                                <div className="hs-track-list-title">{r.date}</div>
                                <div className="hs-track-subtitle">{r.timeOfDay === 'morning' ? '晨间' : '晚间'}</div>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{r.weight} kg</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Summaries section */}
            <div className="hs-section-title" style={{ marginTop: 8 }}><span><span className="hs-emoji">📊</span> 回顾</span></div>

            <div className="hs-track-cards" style={{ marginBottom: 8 }}>
                <div className="hs-track-card hs-animate-fade-in">
                    <div className="hs-track-header">
                        <span className="hs-track-title">本周</span>
                        <span className="hs-track-value">{getCurrentWeekRange()}</span>
                    </div>
                    <button className="hs-track-btn-full" onClick={() => void handleGenerateWeeklySummary()} disabled={isGeneratingSummary}>
                        {isGeneratingSummary ? '生成中…' : '生成周报'}
                    </button>
                </div>
                <div className="hs-track-card hs-animate-fade-in">
                    <div className="hs-track-header">
                        <span className="hs-track-title">本月</span>
                        <span className="hs-track-value">{getCurrentMonthKey()}</span>
                    </div>
                    <button className="hs-track-btn-full" onClick={() => void handleGenerateMonthlySummary()} disabled={isGeneratingSummary}>
                        {isGeneratingSummary ? '生成中…' : '生成月报'}
                    </button>
                </div>
            </div>

            {isSummaryListLoading && summaries.length === 0 && (
                <div className="hs-summary-generating">正在加载历史总结…</div>
            )}

            {summaries.length > 0 ? (
                <div className="hs-summary-list">
                    {summaries.map((summary) => (
                        <div key={summary.id} className="hs-summary-card hs-animate-fade-in">
                            <div className="hs-summary-card-header">
                                <span className={`hs-summary-period-badge ${summary.periodType === 'monthly' ? 'monthly' : ''}`}>
                                    {summary.periodType === 'weekly' ? '周报' : '月报'}
                                </span>
                                <span className="hs-summary-period-key">{summary.periodType === 'weekly' ? formatWeekKeyAsRange(summary.periodKey) : summary.periodKey}</span>
                                <span className="hs-summary-date-range">{summary.startDate} → {summary.endDate}</span>
                            </div>
                            <div className="hs-summary-text">{summary.summaryText}</div>
                            <div className="hs-summary-stats-grid">
                                <div className="hs-summary-stat">
                                    <div className="hs-summary-stat-value">{formatSummaryStatValue(summary.statsJson.avgCalories)}</div>
                                    <div className="hs-summary-stat-label">日均热量</div>
                                </div>
                                <div className="hs-summary-stat">
                                    <div className="hs-summary-stat-value">{summary.statsJson.weightChange !== undefined ? `${summary.statsJson.weightChange > 0 ? '+' : ''}${summary.statsJson.weightChange}kg` : '—'}</div>
                                    <div className="hs-summary-stat-label">体重变化</div>
                                </div>
                                <div className="hs-summary-stat">
                                    <div className="hs-summary-stat-value">{formatSummaryStatValue(summary.statsJson.exerciseCount)}</div>
                                    <div className="hs-summary-stat-label">运动次数</div>
                                </div>
                                <div className="hs-summary-stat">
                                    <div className="hs-summary-stat-value">{summary.statsJson.avgSleepMinutes !== undefined ? formatDurationMinutes(summary.statsJson.avgSleepMinutes) : '—'}</div>
                                    <div className="hs-summary-stat-label">平均睡眠</div>
                                </div>
                            </div>
                            <div className="hs-track-actions" style={{ marginTop: 12 }}>
                                <button className="hs-track-btn" onClick={() => void handleDeleteSummary(summary.id)}>删除</button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : !isSummaryListLoading ? (
                <div className="hs-summary-empty">还没有回顾记录</div>
            ) : null}

            {/* Weight modal */}
            {weightModalOpen && (
                <BottomSheetModal title="记录体重" onClose={() => setWeightModalOpen(false)}>
                    <div className="hs-track-actions">
                        <button type="button" className="hs-track-btn" style={weightTimeOfDay === 'morning' ? { background: 'var(--hs-primary-bg)', color: 'var(--hs-primary-dark)' } : undefined} onClick={() => { setWeightTimeOfDay('morning'); const e = weightRecords.find((r) => r.date === todayDate && r.timeOfDay === 'morning'); setWeightValue(e?.weight?.toString() || ''); }}><span className="hs-emoji">🌤️</span> 晨间</button>
                        <button type="button" className="hs-track-btn" style={weightTimeOfDay === 'evening' ? { background: 'var(--hs-primary-bg)', color: 'var(--hs-primary-dark)' } : undefined} onClick={() => { setWeightTimeOfDay('evening'); const e = weightRecords.find((r) => r.date === todayDate && r.timeOfDay === 'evening'); setWeightValue(e?.weight?.toString() || ''); }}><span className="hs-emoji">🌙</span> 晚间</button>
                    </div>
                    <div className="hs-form-input-with-unit">
                        <input type="number" inputMode="decimal" className="hs-form-input" value={weightValue} onChange={(e) => setWeightValue(e.target.value)} placeholder="62.5" />
                        <span className="hs-unit">kg</span>
                    </div>
                    <div className="hs-modal-action-row">
                        {selectedWeightRecord && (
                            <button type="button" className="hs-modal-secondary-btn" onClick={handleDelete} disabled={isSaving}>删除</button>
                        )}
                        <button type="button" className="hs-submit-btn hs-modal-submit-btn" onClick={handleSave} disabled={isSaving}>保存体重</button>
                    </div>
                </BottomSheetModal>
            )}
        </div>
    );
};

export default TrendsTab;
