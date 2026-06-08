/**
 * LunarTidesTab — 月相潮汐 Menstrual Cycle Tracking
 *
 * Contains: cycle prediction display, period logging, pain medication tracker,
 * annual analysis (recharts), and rotating science tips.
 * Only shown when user gender === 'female'.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BottomSheetModal } from '../HalfSugarTrackingUI';
import { getDB } from '../storage/healthDB';
import type { MedicationLog, MonthCycleStat, PeriodLog } from '../lunarTides/cycleTypes';
import { FLOW_LABELS, MEDICATIONS, MEDICATION_MAP, type FlowIntensity } from '../lunarTides/cycleTypes';
import {
    computeCycleLengths,
    daysUntil,
    getCurrentPhase,
    isOutlierCycle,
    predictNextPeriod,
} from '../lunarTides/cyclePredictor';
import { checkDosageAfterAdd, isLogOverThreshold, resetSessionAlerts } from '../lunarTides/painMedMachine';
import { getRotatingTip } from '../lunarTides/scienceTipsData';
import { formatLocalDateKey } from '../types';

// Lazy-load the entire recharts chart as a single component to avoid
// React.lazy _status collision when wrapping multiple named exports.
const AnnualChart = React.lazy(() =>
    import('recharts').then((recharts) => ({
        default: function AnnualChartInner(props: {
            data: MonthCycleStat[];
            predictedCycleLength: number;
        }) {
            const { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } = recharts;
            return (
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={props.data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                        <XAxis dataKey="monthLabel" tick={{ fontSize: 10, fill: 'var(--hs-text-muted)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--hs-text-muted)' }} domain={[0, 'auto']} />
                        <Tooltip
                            contentStyle={{ background: '#E8E8E8', border: 'none', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                            formatter={(value: any) => [`${value} 天`, '周期长度']}
                        />
                        <ReferenceLine y={props.predictedCycleLength} stroke="var(--hs-primary)" strokeDasharray="4 4" />
                        <Bar dataKey="cycleLength" radius={[6, 6, 0, 0]} maxBarSize={24}>
                            {props.data.map((entry) => (
                                <Cell
                                    key={entry.month}
                                    fill={entry.isAnomaly ? 'var(--hs-rose)' : 'var(--hs-primary)'}
                                    opacity={entry.isAnomaly ? 0.9 : 0.7}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
        },
    })),
);

interface Props {
    addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const LunarTidesTab: React.FC<Props> = ({ addToast }) => {
    // ── State ──
    const [periods, setPeriods] = useState<PeriodLog[]>([]);
    const [medications, setMedications] = useState<MedicationLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modals
    const [showPeriodModal, setShowPeriodModal] = useState(false);
    const [showMedModal, setShowMedModal] = useState(false);
    const [showOutlierConfirm, setShowOutlierConfirm] = useState<{ cycleLength: number; logId: string } | null>(null);
    const [showMedAlert, setShowMedAlert] = useState<{ accumulated: number; maxDaily: number; medLabel: string } | null>(null);

    // Period form
    const [periodStartDate, setPeriodStartDate] = useState(formatLocalDateKey());
    const [periodEndDate, setPeriodEndDate] = useState('');
    const [periodFlow, setPeriodFlow] = useState<FlowIntensity>('medium');
    const [editingPeriod, setEditingPeriod] = useState<PeriodLog | null>(null); // null = new record

    // Medication form
    const [medKey, setMedKey] = useState(MEDICATIONS[0].key);
    const [medDosage, setMedDosage] = useState('');
    const [medTime, setMedTime] = useState(() => {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    });

    const todayDate = useMemo(() => formatLocalDateKey(), []);

    // Find the latest ongoing period (no endDate)
    const ongoingPeriod = useMemo(() => {
        return [...periods].reverse().find((p) => !p.endDate && !p.isOutlier) || null;
    }, [periods]);

    // ── Load Data ──
    useEffect(() => {
        let active = true;
        resetSessionAlerts();
        void (async () => {
            try {
                const db = await getDB();
                const [p, m] = await Promise.all([
                    db.getAll('periods'),
                    db.getAll('medications'),
                ]);
                if (active) {
                    setPeriods((p as PeriodLog[]).sort((a, b) => a.startDate.localeCompare(b.startDate)));
                    setMedications(m as MedicationLog[]);
                }
            } catch {
                if (active) addToast('加载经期数据失败', 'error');
            } finally {
                if (active) setIsLoading(false);
            }
        })();
        return () => { active = false; };
    }, [addToast]);

    // ── Derived ──
    const prediction = useMemo(() => predictNextPeriod(periods), [periods]);
    const lastPeriod = useMemo(() => {
        const valid = periods.filter((p) => !p.isOutlier);
        return valid[valid.length - 1] || undefined;
    }, [periods]);
    const { phase, dayInCycle } = useMemo(
        () => getCurrentPhase(lastPeriod, prediction),
        [lastPeriod, prediction],
    );
    const tip = useMemo(() => getRotatingTip(phase, dayInCycle), [phase, dayInCycle]);
    const daysLeft = prediction ? daysUntil(prediction.nextPeriodStart) : null;

    const todayMeds = useMemo(
        () => medications.filter((m) => m.date === todayDate).sort((a, b) => a.time.localeCompare(b.time)),
        [medications, todayDate],
    );

    // Annual stats for chart
    const annualStats = useMemo((): MonthCycleStat[] => {
        const cycles = computeCycleLengths(periods);
        if (cycles.length === 0) return [];

        const avgLen = cycles.reduce((s, c) => s + c.length, 0) / cycles.length;
        const monthMap = new Map<string, { lengths: number[]; durations: number[] }>();

        cycles.forEach((c) => {
            const month = c.log.startDate.slice(0, 7);
            if (!monthMap.has(month)) monthMap.set(month, { lengths: [], durations: [] });
            monthMap.get(month)!.lengths.push(c.length);
        });

        periods.forEach((p) => {
            if (p.endDate && !p.isOutlier) {
                const month = p.startDate.slice(0, 7);
                const dur = Math.max(1, Math.round((new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / 86400000) + 1);
                if (!monthMap.has(month)) monthMap.set(month, { lengths: [], durations: [] });
                monthMap.get(month)!.durations.push(dur);
            }
        });

        return Array.from(monthMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-12)
            .map(([month, data]) => {
                const avgCycle = data.lengths.length > 0
                    ? Math.round(data.lengths.reduce((s, v) => s + v, 0) / data.lengths.length)
                    : undefined;
                return {
                    month,
                    monthLabel: `${parseInt(month.split('-')[1], 10)}月`,
                    cycleLength: avgCycle,
                    periodDuration: data.durations.length > 0
                        ? Math.round(data.durations.reduce((s, v) => s + v, 0) / data.durations.length)
                        : undefined,
                    isAnomaly: avgCycle !== undefined && Math.abs(avgCycle - avgLen) > 7,
                };
            });
    }, [periods]);

    // ── Callbacks ──

    /** Open "new period" modal */
    const openNewPeriodModal = useCallback(() => {
        setEditingPeriod(null);
        setPeriodStartDate(formatLocalDateKey());
        setPeriodEndDate('');
        setPeriodFlow('medium');
        setShowPeriodModal(true);
    }, []);

    /** Open "edit period" modal for an existing record */
    const openEditPeriodModal = useCallback((log: PeriodLog) => {
        setEditingPeriod(log);
        setPeriodStartDate(log.startDate);
        setPeriodEndDate(log.endDate || '');
        setPeriodFlow(log.flowIntensity || 'medium');
        setShowPeriodModal(true);
    }, []);

    /** Mark the ongoing period as ended (today or yesterday) */
    const handleEndOngoingPeriod = useCallback(async (log: PeriodLog) => {
        const now = Date.now();
        // End date = last day with a daily flow entry, or today
        const dailyDates = Object.keys(log.dailyFlow || {}).sort();
        const endDate = dailyDates.length > 0 ? dailyDates[dailyDates.length - 1] : formatLocalDateKey();
        const updated: PeriodLog = { ...log, endDate, updatedAt: now };
        try {
            const db = await getDB();
            await db.put('periods', updated);
            setPeriods((prev) =>
                prev.map((p) => (p.id === updated.id ? updated : p)),
            );
            addToast('经期已标记结束', 'success');
        } catch {
            addToast('保存失败', 'error');
        }
    }, [addToast]);

    /** Check in daily flow for a specific date on the ongoing period */
    const handleDailyFlowCheckin = useCallback(async (log: PeriodLog, date: string, flow: FlowIntensity) => {
        const now = Date.now();
        const newDailyFlow = { ...(log.dailyFlow || {}), [date]: flow };
        const updated: PeriodLog = {
            ...log,
            dailyFlow: newDailyFlow,
            // Also update legacy flowIntensity to the latest entry for backward compat
            flowIntensity: flow,
            updatedAt: now,
        };
        try {
            const db = await getDB();
            await db.put('periods', updated);
            setPeriods((prev) =>
                prev.map((p) => (p.id === updated.id ? updated : p)),
            );
        } catch {
            addToast('保存失败', 'error');
        }
    }, [addToast]);

    /** Get the list of days from start to today for the ongoing period */
    const ongoingDays = useMemo(() => {
        if (!ongoingPeriod) return [];
        const start = new Date(ongoingPeriod.startDate);
        const today = new Date(formatLocalDateKey());
        const days: string[] = [];
        const cursor = new Date(start);
        // Show up to 10 days max
        while (cursor <= today && days.length < 10) {
            days.push(cursor.toISOString().slice(0, 10));
            cursor.setDate(cursor.getDate() + 1);
        }
        return days;
    }, [ongoingPeriod]);

    /** Save new or edited period record */
    const handleSavePeriod = useCallback(async () => {
        const now = Date.now();
        const isEdit = Boolean(editingPeriod);
        const newLog: PeriodLog = {
            id: editingPeriod?.id || `period-${now}-${Math.random().toString(36).slice(2, 8)}`,
            startDate: periodStartDate,
            endDate: periodEndDate || undefined,
            flowIntensity: periodFlow,
            isOutlier: editingPeriod?.isOutlier || false,
            createdAt: editingPeriod?.createdAt || now,
            updatedAt: now,
        };

        try {
            const db = await getDB();
            await db.put('periods', newLog);
            const updated = [...periods.filter((p) => p.id !== newLog.id), newLog]
                .sort((a, b) => a.startDate.localeCompare(b.startDate));

            // Check for outlier (only on new records)
            if (!isEdit) {
                const cycles = computeCycleLengths(updated);
                if (cycles.length >= 3) {
                    const lastCycle = cycles[cycles.length - 1];
                    const allLengths = cycles.map((c) => c.length);
                    if (isOutlierCycle(lastCycle.length, allLengths)) {
                        setShowOutlierConfirm({ cycleLength: lastCycle.length, logId: newLog.id });
                    }
                }
            }

            setPeriods(updated);
            setShowPeriodModal(false);
            setEditingPeriod(null);
            setPeriodEndDate('');
            addToast(isEdit ? '经期记录已更新' : '经期记录已保存', 'success');
        } catch {
            addToast('保存失败', 'error');
        }
    }, [addToast, editingPeriod, periodEndDate, periodFlow, periodStartDate, periods]);

    const handleConfirmOutlier = useCallback(async (confirm: boolean) => {
        if (!showOutlierConfirm) return;
        if (confirm) {
            try {
                const db = await getDB();
                const log = await db.get('periods', showOutlierConfirm.logId);
                if (log) {
                    const updated = { ...log, isOutlier: true, updatedAt: Date.now() };
                    await db.put('periods', updated);
                    setPeriods((prev) => prev.map((p) => p.id === updated.id ? (updated as PeriodLog) : p));
                }
            } catch { /* silent */ }
        }
        setShowOutlierConfirm(null);
    }, [showOutlierConfirm]);

    const handleDeletePeriod = useCallback(async (id: string) => {
        try {
            const db = await getDB();
            await db.delete('periods', id);
            setPeriods((prev) => prev.filter((p) => p.id !== id));
            addToast('经期记录已删除', 'success');
        } catch {
            addToast('删除失败', 'error');
        }
    }, [addToast]);

    const handleSaveMed = useCallback(async () => {
        const medDef = MEDICATION_MAP.get(medKey);
        const dosage = Number(medDosage) || medDef?.defaultDosageMg || 400;
        const now = Date.now();

        const newLog: MedicationLog = {
            id: `med-${now}-${Math.random().toString(36).slice(2, 8)}`,
            date: todayDate,
            time: medTime,
            name: medKey,
            dosageMg: dosage,
            createdAt: now,
        };

        try {
            const db = await getDB();
            await db.put('medications', newLog);
            const updatedMeds = [...medications, newLog];
            setMedications(updatedMeds);
            setShowMedModal(false);
            setMedDosage('');

            // Check dosage state machine
            const result = checkDosageAfterAdd(medKey, updatedMeds);
            if (result.shouldAlert && medDef) {
                setShowMedAlert({
                    accumulated: result.accumulated,
                    maxDaily: medDef.maxDailyMg,
                    medLabel: medDef.label,
                });
            } else {
                addToast('用药已记录', 'success');
            }
        } catch {
            addToast('记录用药失败', 'error');
        }
    }, [addToast, medDosage, medKey, medTime, medications, todayDate]);

    const handleDeleteMed = useCallback(async (id: string) => {
        try {
            const db = await getDB();
            await db.delete('medications', id);
            setMedications((prev) => prev.filter((m) => m.id !== id));
            addToast('用药记录已删除', 'success');
        } catch {
            addToast('删除失败', 'error');
        }
    }, [addToast]);

    // ── Phase Config ──
    const phaseConfig = {
        menstrual: { label: '经期', emoji: '🌑', color: 'var(--hs-rose)' },
        follicular: { label: '卵泡期', emoji: '🌒', color: 'var(--hs-sage)' },
        ovulation: { label: '排卵期', emoji: '🌕', color: 'var(--hs-clay)' },
        luteal: { label: '黄体期', emoji: '🌘', color: 'var(--hs-dusk)' },
    };
    const currentPhaseInfo = phaseConfig[phase];

    if (isLoading) {
        return <div className="hs-tab-content no-scrollbar"><div className="hs-loading-card">正在加载月相潮汐…</div></div>;
    }

    return (
        <div className="hs-tab-content no-scrollbar">
            {/* ── Phase Overview Card ── */}
            <div className="hs-track-card hs-animate-fade-in" style={{ margin: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: 'var(--hs-bg)', boxShadow: 'var(--hs-neu-lg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 28,
                    }}>
                        <span className="hs-emoji">{currentPhaseInfo.emoji}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--hs-text)', marginBottom: 2 }}>
                            {currentPhaseInfo.label}
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--hs-text-muted)', marginLeft: 8 }}>
                                第 {dayInCycle} 天
                            </span>
                        </div>
                        {prediction && daysLeft !== null && (
                            <div style={{ fontSize: 13, color: 'var(--hs-text-secondary)' }}>
                                {daysLeft > 0 ? `距下次经期还有 ${daysLeft} 天` : daysLeft === 0 ? '预计今天来潮' : '已超过预计日期'}
                            </div>
                        )}
                        {prediction && (
                            <div style={{ fontSize: 11, color: 'var(--hs-text-muted)', marginTop: 2 }}>
                                预测周期 {prediction.predictedCycleLength} 天 · 经期约 {prediction.averagePeriodDuration} 天
                                {prediction.confidence === 'high' && ' · 高置信度'}
                            </div>
                        )}
                        {!prediction && periods.length === 0 && (
                            <div style={{ fontSize: 13, color: 'var(--hs-text-muted)' }}>
                                还没有经期记录，记录后可预测周期
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Science Tip ── */}
            {tip && (
                <div className="hs-recommendation-card hs-animate-fade-in" style={{ margin: '0 20px 12px' }}>
                    <div className="hs-rec-header">
                        <span className="hs-emoji">{tip.emoji}</span> {tip.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--hs-text-secondary)', lineHeight: 1.6, marginTop: 4 }}>
                        {tip.content}
                    </div>
                </div>
            )}

            {/* ── Period History + Add ── */}
            <div className="hs-section-title"><span><span className="hs-emoji">🩸</span> 经期记录</span></div>

            {/* Ongoing period banner with daily flow check-in */}
            {ongoingPeriod && (
                <div className="hs-track-card hs-animate-fade-in" style={{ margin: '0 20px 12px', border: '1px solid var(--hs-rose)', borderRadius: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--hs-text)' }}>
                                经期进行中 🩸
                            </div>
                            <div className="hs-track-subtitle">
                                {ongoingPeriod.startDate} 开始 · 第 {ongoingDays.length} 天
                            </div>
                        </div>
                        <button
                            type="button"
                            className="hs-submit-btn"
                            style={{ fontSize: 12, padding: '8px 14px', borderRadius: 10, whiteSpace: 'nowrap' }}
                            onClick={() => handleEndOngoingPeriod(ongoingPeriod)}
                        >
                            标记结束
                        </button>
                    </div>

                    {/* Daily flow timeline */}
                    <div style={{ fontSize: 12, color: 'var(--hs-text-muted)', marginBottom: 6 }}>每日流量打卡</div>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                        {ongoingDays.map((day) => {
                            const currentFlow = ongoingPeriod.dailyFlow?.[day];
                            const dayLabel = `${parseInt(day.slice(8), 10)}日`;
                            const isToday = day === todayDate;
                            return (
                                <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 44 }}>
                                    <div style={{ fontSize: 10, color: isToday ? 'var(--hs-primary-dark)' : 'var(--hs-text-muted)', fontWeight: isToday ? 600 : 400 }}>{isToday ? '今天' : dayLabel}</div>
                                    <div style={{ display: 'flex', gap: 2 }}>
                                        {(['light', 'medium', 'heavy'] as FlowIntensity[]).map((f) => (
                                            <button
                                                key={f}
                                                type="button"
                                                onClick={() => handleDailyFlowCheckin(ongoingPeriod, day, f)}
                                                style={{
                                                    width: 12, height: 12, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
                                                    background: currentFlow === f
                                                        ? (f === 'light' ? 'var(--hs-clay)' : f === 'medium' ? 'var(--hs-rose)' : '#c0392b')
                                                        : 'var(--hs-bg)',
                                                    boxShadow: currentFlow === f ? '0 0 4px rgba(0,0,0,0.2)' : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                                                    opacity: currentFlow === f ? 1 : 0.5,
                                                    transition: 'all 0.2s',
                                                }}
                                                aria-label={`${day} ${FLOW_LABELS[f].label}`}
                                            />
                                        ))}
                                    </div>
                                    {currentFlow && <div style={{ fontSize: 9, color: 'var(--hs-text-muted)' }}>{FLOW_LABELS[currentFlow].label}</div>}
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--hs-text-muted)', marginTop: 6, display: 'flex', gap: 10, justifyContent: 'center' }}>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--hs-clay)', verticalAlign: 'middle' }} /> 少量</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--hs-rose)', verticalAlign: 'middle' }} /> 适中</span>
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#c0392b', verticalAlign: 'middle' }} /> 量多</span>
                    </div>
                </div>
            )}

            <button type="button" className="hs-meal-add hs-animate-fade-in" onClick={openNewPeriodModal}>
                <span>＋</span> {ongoingPeriod ? '补记其他经期' : '经期来了'}
            </button>

            {periods.length > 0 && (
                <div className="hs-track-list" style={{ margin: '8px 20px 16px' }}>
                    {[...periods].reverse().slice(0, 8).map((p) => {
                        // Show daily flow dots summary if available
                        const dailyEntries = p.dailyFlow ? Object.entries(p.dailyFlow).sort(([a], [b]) => a.localeCompare(b)) : [];
                        const durationDays = p.endDate
                            ? Math.max(1, Math.round((new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / 86400000) + 1)
                            : null;
                        return (
                        <div key={p.id} className="hs-track-list-item" style={p.isOutlier ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                            <button
                                type="button"
                                style={{ flex: 1, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                                onClick={() => openEditPeriodModal(p)}
                            >
                                <div className="hs-track-list-title">
                                    {p.startDate}{p.endDate ? ` → ${p.endDate}` : ' (进行中)'}
                                    {durationDays ? <span style={{ fontSize: 11, color: 'var(--hs-text-muted)', marginLeft: 6 }}>{durationDays}天</span> : null}
                                </div>
                                <div className="hs-track-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                    {dailyEntries.length > 0 ? (
                                        <>
                                            {dailyEntries.map(([d, f]) => (
                                                <span key={d} style={{
                                                    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                                    background: f === 'light' ? 'var(--hs-clay)' : f === 'medium' ? 'var(--hs-rose)' : '#c0392b',
                                                }} title={`${d}: ${FLOW_LABELS[f].label}`} />
                                            ))}
                                        </>
                                    ) : (
                                        <span>{p.flowIntensity ? FLOW_LABELS[p.flowIntensity].label : ''}</span>
                                    )}
                                    {p.isOutlier ? <span> · 已标记为异常</span> : null}
                                </div>
                            </button>
                            <button type="button" className="hs-track-delete-btn" onClick={() => handleDeletePeriod(p.id)}>删除</button>
                        </div>
                    )})}
                </div>
            )}

            {/* ── Pain Medication Tracker ── */}
            <div className="hs-section-title"><span><span className="hs-emoji">💊</span> 止痛药追踪</span></div>
            <button type="button" className="hs-meal-add hs-animate-fade-in" onClick={() => setShowMedModal(true)}>
                <span>＋</span> 记录用药
            </button>

            {todayMeds.length > 0 && (
                <div className="hs-track-list" style={{ margin: '8px 20px 16px' }}>
                    {todayMeds.map((m) => {
                        const over = isLogOverThreshold(m, medications);
                        const def = MEDICATION_MAP.get(m.name);
                        return (
                            <div key={m.id} className="hs-track-list-item" style={over ? { borderLeft: '3px solid var(--hs-rose)' } : undefined}>
                                <div>
                                    <div className="hs-track-list-title" style={over ? { color: 'var(--hs-rose)' } : undefined}>
                                        {def?.label || m.name} · {m.dosageMg}mg
                                    </div>
                                    <div className="hs-track-subtitle">{m.time}{over ? ' · ⚠️ 超出安全阈值' : ''}</div>
                                </div>
                                <button type="button" className="hs-track-delete-btn" onClick={() => handleDeleteMed(m.id)}>删除</button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Annual Analysis (Recharts) ── */}
            {annualStats.length > 0 && (
                <>
                    <div className="hs-section-title"><span><span className="hs-emoji">📊</span> 年度分析</span></div>
                    <div className="hs-track-card hs-animate-fade-in" style={{ margin: '0 20px 16px', padding: '16px 12px' }}>
                        <div style={{ fontSize: 13, color: 'var(--hs-text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                            每个人的周期都是独特的节奏，波动 ±7 天以内都很正常。如果持续异常，建议咨询医生。
                        </div>
                        <React.Suspense fallback={<div className="hs-loading-card">加载图表…</div>}>
                            <AnnualChart
                                data={annualStats}
                                predictedCycleLength={prediction?.predictedCycleLength || 28}
                            />
                        </React.Suspense>
                        <div style={{ fontSize: 11, color: 'var(--hs-text-muted)', textAlign: 'center', marginTop: 8 }}>
                            <span style={{ color: 'var(--hs-rose)' }}>■</span> 偏差 &gt;7天 &nbsp;
                            <span style={{ color: 'var(--hs-primary)' }}>■</span> 正常范围 &nbsp;
                            <span style={{ borderTop: '1px dashed var(--hs-primary)', display: 'inline-block', width: 16, verticalAlign: 'middle' }} /> 预测周期
                        </div>
                    </div>
                </>
            )}

            {/* ── Period Modal (New or Edit) ── */}
            {showPeriodModal && (
                <BottomSheetModal title={editingPeriod ? '编辑经期' : '记录经期'} onClose={() => { setShowPeriodModal(false); setEditingPeriod(null); }}>
                    <div className="hs-form-group">
                        <label className="hs-form-label">开始日期</label>
                        <input type="date" className="hs-form-input" value={periodStartDate} onChange={(e) => setPeriodStartDate(e.target.value)} />
                    </div>
                    {editingPeriod && (
                        <div className="hs-form-group" style={{ marginTop: 12 }}>
                            <label className="hs-form-label">结束日期（可留空）</label>
                            <input type="date" className="hs-form-input" value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />
                        </div>
                    )}
                    <div className="hs-form-group" style={{ marginTop: 12 }}>
                        <label className="hs-form-label">流量</label>
                        <div className="hs-quality-row">
                            {(['light', 'medium', 'heavy'] as FlowIntensity[]).map((f) => (
                                <button key={f} type="button" className={`hs-quality-chip ${periodFlow === f ? 'active' : ''}`} onClick={() => setPeriodFlow(f)}>
                                    {FLOW_LABELS[f].label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button type="button" className="hs-submit-btn hs-modal-submit-btn" onClick={handleSavePeriod} style={{ marginTop: 16 }}>
                        {editingPeriod ? '保存修改' : '保存'}
                    </button>
                </BottomSheetModal>
            )}

            {/* ── Medication Modal ── */}
            {showMedModal && (
                <BottomSheetModal title="记录用药" onClose={() => setShowMedModal(false)}>
                    <div className="hs-form-group">
                        <label className="hs-form-label">药物</label>
                        <div className="hs-quality-row">
                            {MEDICATIONS.map((m) => (
                                <button key={m.key} type="button" className={`hs-quality-chip ${medKey === m.key ? 'active' : ''}`} onClick={() => { setMedKey(m.key); setMedDosage(''); }}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="hs-form-group" style={{ marginTop: 12 }}>
                        <label className="hs-form-label">剂量 (mg)</label>
                        <div className="hs-form-input-with-unit">
                            <input type="number" inputMode="numeric" className="hs-form-input" value={medDosage} onChange={(e) => setMedDosage(e.target.value)} placeholder={String(MEDICATION_MAP.get(medKey)?.defaultDosageMg || 400)} />
                            <span className="hs-unit">mg</span>
                        </div>
                    </div>
                    <div className="hs-form-group" style={{ marginTop: 12 }}>
                        <label className="hs-form-label">服药时间</label>
                        <input type="time" className="hs-form-input" value={medTime} onChange={(e) => setMedTime(e.target.value)} />
                    </div>
                    <button type="button" className="hs-submit-btn hs-modal-submit-btn" onClick={handleSaveMed} style={{ marginTop: 16 }}>记录用药</button>
                </BottomSheetModal>
            )}

            {/* ── Outlier Confirmation Dialog ── */}
            {showOutlierConfirm && (
                <BottomSheetModal title="⚠️ 周期异常提醒" onClose={() => handleConfirmOutlier(false)}>
                    <div style={{ fontSize: 14, color: 'var(--hs-text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
                        本次周期长度为 <strong style={{ color: 'var(--hs-rose)' }}>{showOutlierConfirm.cycleLength} 天</strong>，
                        超出了你的正常范围（±2 标准差）。<br /><br />
                        这可能是由压力、旅行等临时因素导致。<br />
                        确认标记为异常？（标记后将不纳入预测计算）
                    </div>
                    <div className="hs-modal-action-row">
                        <button type="button" className="hs-modal-secondary-btn" onClick={() => handleConfirmOutlier(false)}>保留正常</button>
                        <button type="button" className="hs-submit-btn hs-modal-submit-btn" onClick={() => handleConfirmOutlier(true)} style={{ background: 'var(--hs-rose)' }}>标记为异常</button>
                    </div>
                </BottomSheetModal>
            )}

            {/* ── Medication Over-Threshold Alert ── */}
            {showMedAlert && (
                <BottomSheetModal title="⚠️ 用药安全提醒" onClose={() => { setShowMedAlert(null); addToast('用药已记录', 'info'); }}>
                    <div style={{ fontSize: 14, color: 'var(--hs-text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
                        过去 24 小时内，你已服用 <strong style={{ color: 'var(--hs-rose)' }}>{showMedAlert.medLabel}</strong> 合计{' '}
                        <strong style={{ color: 'var(--hs-rose)' }}>{showMedAlert.accumulated}mg</strong>，
                        接近或超过每日建议上限（{showMedAlert.maxDaily}mg）。<br /><br />
                        请注意控制用量，必要时咨询医生或药师。
                    </div>
                    <button type="button" className="hs-submit-btn hs-modal-submit-btn" onClick={() => { setShowMedAlert(null); addToast('已知悉，用药已记录', 'info'); }}>
                        我知道了
                    </button>
                </BottomSheetModal>
            )}
        </div>
    );
};

export default LunarTidesTab;
