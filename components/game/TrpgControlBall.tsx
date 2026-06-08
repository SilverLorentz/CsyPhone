import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { Eye, EyeSlash, Lightning, NotePencil, Thermometer, X } from '@phosphor-icons/react';
import type { GameSettings } from '../../types';
import {
    getTrpgWritingStyleLabel,
    normalizeTrpgSettings,
    resolveTrpgWritingStylePreset,
    TRPG_DEFAULT_TEMPERATURE,
    TRPG_WRITING_STYLE_PRESETS
} from '../../utils/trpgSettings';

type TokenUsage = { prompt?: number; completion?: number; total: number } | null;

interface TrpgControlBallProps {
    gameId: string;
    settings?: GameSettings;
    roundCount: number;
    nextSummaryRound: number;
    summariesCount: number;
    summarizedUntil: number;
    lastTokenUsage: TokenUsage;
    totalTokensUsed: number;
    isBusy: boolean;
    onChangeSettings: (patch: Partial<GameSettings>) => void;
}

const BALL_SIZE = 56;
const EDGE_PADDING = 14;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const readPosition = (key: string) => {
    if (typeof window === 'undefined') return null;
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (!parsed || typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
        return parsed as { x: number; y: number };
    } catch {
        return null;
    }
};

const getDefaultPosition = () => {
    if (typeof window === 'undefined') return { x: 20, y: 180 };
    return {
        x: Math.max(EDGE_PADDING, window.innerWidth - BALL_SIZE - 18),
        y: Math.max(EDGE_PADDING, Math.round(window.innerHeight * 0.48))
    };
};

const clampPosition = (position: { x: number; y: number }) => {
    if (typeof window === 'undefined') return position;
    return {
        x: clamp(position.x, EDGE_PADDING, Math.max(EDGE_PADDING, window.innerWidth - BALL_SIZE - EDGE_PADDING)),
        y: clamp(position.y, EDGE_PADDING, Math.max(EDGE_PADDING, window.innerHeight - BALL_SIZE - EDGE_PADDING))
    };
};

const TrpgControlBall: React.FC<TrpgControlBallProps> = memo(({
    gameId,
    settings,
    roundCount,
    nextSummaryRound,
    summariesCount,
    summarizedUntil,
    lastTokenUsage,
    totalTokensUsed,
    isBusy,
    onChangeSettings
}) => {
    const storageKey = `trpg_control_ball_pos_${gameId}`;
    const constraintsRef = useRef<HTMLDivElement>(null);
    const normalized = normalizeTrpgSettings(settings);
    const activePreset = resolveTrpgWritingStylePreset(normalized.writingStyle);
    const isCustomStyle = !!normalized.writingStyle && !activePreset;
    const [panelOpen, setPanelOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [customEditorOpen, setCustomEditorOpen] = useState(isCustomStyle);
    const [position, setPosition] = useState(() => clampPosition(readPosition(storageKey) || getDefaultPosition()));
    const [customStyle, setCustomStyle] = useState(isCustomStyle ? normalized.writingStyle || '' : '');
    const x = useMotionValue(position.x);
    const y = useMotionValue(position.y);

    useEffect(() => {
        const next = clampPosition(readPosition(storageKey) || getDefaultPosition());
        setPosition(next);
        x.set(next.x);
        y.set(next.y);
    }, [gameId, storageKey, x, y]);

    useEffect(() => {
        setCustomStyle(isCustomStyle ? normalized.writingStyle || '' : '');
        if (isCustomStyle) setCustomEditorOpen(true);
    }, [isCustomStyle, normalized.writingStyle]);

    useEffect(() => {
        const onResize = () => {
            const next = clampPosition({ x: x.get(), y: y.get() });
            setPosition(next);
            x.set(next.x);
            y.set(next.y);
            localStorage.setItem(storageKey, JSON.stringify(next));
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [storageKey, x, y]);

    const panelPlacement = useMemo(() => {
        if (typeof window === 'undefined') return { horizontal: 'left' as const, vertical: 'down' as const };
        return {
            horizontal: position.x > window.innerWidth - 310 ? 'left' as const : 'right' as const,
            vertical: position.y > window.innerHeight - 390 ? 'up' as const : 'down' as const
        };
    }, [position]);

    const panelStyle: React.CSSProperties = {
        left: panelPlacement.horizontal === 'right' ? BALL_SIZE + 10 : undefined,
        right: panelPlacement.horizontal === 'left' ? BALL_SIZE + 10 : undefined,
        top: panelPlacement.vertical === 'down' ? 0 : undefined,
        bottom: panelPlacement.vertical === 'up' ? 0 : undefined
    };

    const commitPosition = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const next = clampPosition({ x: x.get(), y: y.get() });
        setPosition(next);
        x.set(next.x);
        y.set(next.y);
        if (Math.hypot(info.offset.x, info.offset.y) >= 8) {
            localStorage.setItem(storageKey, JSON.stringify(next));
        }
        window.setTimeout(() => setDragging(false), 0);
    };

    const summaryProgress = `${Math.min(roundCount, nextSummaryRound)}/${nextSummaryRound}`;
    const usageLabel = lastTokenUsage
        ? `${lastTokenUsage.prompt ?? '?'} / ${lastTokenUsage.completion ?? '?'}`
        : '等待请求';

    const handleTemperatureChange = (value: string) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;
        const next = Math.round(clamp(parsed, 0.1, 2) * 100) / 100;
        onChangeSettings({ temperature: Math.abs(next - TRPG_DEFAULT_TEMPERATURE) < 0.001 ? undefined : next });
    };

    const handleStyleSelect = (style: string | undefined) => {
        setCustomEditorOpen(false);
        onChangeSettings({ writingStyle: style });
    };

    const handleCustomStyleChange = (value: string) => {
        setCustomStyle(value);
        onChangeSettings({ writingStyle: value.trim() || undefined });
    };

    const handleCustomStyleOpen = () => {
        setCustomEditorOpen(true);
        if (customStyle.trim()) {
            onChangeSettings({ writingStyle: customStyle.trim() });
        }
    };

    return (
        <div
            ref={constraintsRef}
            className="absolute inset-0 z-[45] pointer-events-none"
            onClick={() => panelOpen && setPanelOpen(false)}
        >
            <motion.div
                drag={!panelOpen}
                dragConstraints={constraintsRef}
                dragElastic={0}
                dragMomentum={false}
                style={{ x, y }}
                onDragStart={() => setDragging(true)}
                onDragEnd={commitPosition}
                className="absolute left-0 top-0 pointer-events-auto"
            >
                <button
                    type="button"
                    aria-label="TRPG GM 控制台"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (dragging) return;
                        setPanelOpen(prev => !prev);
                    }}
                    className={`relative flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-[0_16px_42px_rgba(0,0,0,0.42)] backdrop-blur-2xl transition-all active:scale-95 ${panelOpen ? 'ring-2 ring-orange-300/70' : ''}`}
                >
                    <span className="absolute inset-1 rounded-full border border-orange-300/20" />
                    <span className="relative flex flex-col items-center leading-none">
                        <span className="text-[13px] font-black tracking-[0.18em]">GM</span>
                        <span className="mt-1 text-[9px] font-mono text-orange-200">{roundCount}R</span>
                    </span>
                    {isBusy && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />}
                </button>

                {panelOpen && (
                    <div
                        className="absolute w-[min(19rem,calc(100vw-5rem))] rounded-2xl border border-white/15 bg-[#111015]/95 p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
                        style={panelStyle}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-200">GM 控制台</div>
                                <div className="mt-1 text-[10px] text-white/45">自动总结、文风、温度</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPanelOpen(false)}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/65 transition-colors hover:bg-white/15"
                                aria-label="关闭 GM 控制台"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div className="mb-3 grid grid-cols-3 gap-2">
                            <StatPill label="轮数" value={`${roundCount}`} />
                            <StatPill label="下次总结" value={summaryProgress} />
                            <StatPill label="摘要" value={`${summariesCount}`} />
                        </div>

                        <section className="mb-3 rounded-xl border border-white/10 bg-white/[0.06] p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-white/80">
                                    <Thermometer size={14} className="text-orange-200" />
                                    温度
                                </div>
                                <span className="font-mono text-[11px] text-orange-200">{normalized.temperature.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="2"
                                step="0.05"
                                value={normalized.temperature}
                                onChange={event => handleTemperatureChange(event.target.value)}
                                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-orange-300"
                            />
                        </section>

                        <section className="mb-3 rounded-xl border border-white/10 bg-white/[0.06] p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-white/80">
                                    <NotePencil size={14} className="text-orange-200" />
                                    文风
                                </div>
                                <span className="text-[10px] text-orange-200">{getTrpgWritingStyleLabel(normalized.writingStyle)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <StyleButton
                                    label="默认"
                                    active={!normalized.writingStyle && !customEditorOpen}
                                    onClick={() => handleStyleSelect(undefined)}
                                />
                                {TRPG_WRITING_STYLE_PRESETS.map(preset => (
                                    <StyleButton
                                        key={preset.key}
                                        label={preset.label}
                                        title={preset.desc}
                                        active={normalized.writingStyle === preset.key}
                                        onClick={() => handleStyleSelect(preset.key)}
                                    />
                                ))}
                                <StyleButton
                                    label="自定义"
                                    active={isCustomStyle || customEditorOpen}
                                    onClick={handleCustomStyleOpen}
                                />
                            </div>
                            {(isCustomStyle || customEditorOpen) && (
                                <textarea
                                    value={customStyle}
                                    onChange={event => handleCustomStyleChange(event.target.value)}
                                    placeholder="写下你想要的 TRPG 文风，例如：更像克苏鲁调查报告，少抒情，多线索和心理压迫。"
                                    className="mt-2 h-20 w-full resize-none rounded-xl border border-white/10 bg-black/25 p-2 text-[11px] leading-relaxed text-white/80 outline-none placeholder:text-white/25 focus:border-orange-300/40"
                                />
                            )}
                        </section>

                        <section className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-white/80">
                                    <Lightning size={14} className="text-orange-200" />
                                    Token
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onChangeSettings({ showTokenHud: !normalized.showTokenHud })}
                                    className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] text-white/65"
                                >
                                    {normalized.showTokenHud ? <Eye size={12} /> : <EyeSlash size={12} />}
                                    {normalized.showTokenHud ? '显示' : '隐藏'}
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div className="rounded-lg bg-black/20 p-2">
                                    <div className="text-white/35">最近输入/输出</div>
                                    <div className="mt-1 font-mono text-white/80">{usageLabel}</div>
                                </div>
                                <div className="rounded-lg bg-black/20 p-2">
                                    <div className="text-white/35">本局累计</div>
                                    <div className="mt-1 font-mono text-white/80">{totalTokensUsed || 0}</div>
                                </div>
                            </div>
                            <div className="mt-2 text-[9px] leading-relaxed text-white/35">
                                已压缩至第 {summarizedUntil} 轮。
                            </div>
                        </section>
                    </div>
                )}
            </motion.div>
        </div>
    );
});

const StatPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="rounded-xl border border-white/10 bg-white/[0.07] px-2 py-2 text-center">
        <div className="text-[9px] text-white/40">{label}</div>
        <div className="mt-0.5 font-mono text-[12px] font-bold text-white">{value}</div>
    </div>
);

const StyleButton: React.FC<{ label: string; active: boolean; title?: string; onClick: () => void }> = ({ label, active, title, onClick }) => (
    <button
        type="button"
        title={title}
        onClick={onClick}
        className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold transition-all active:scale-95 ${
            active
                ? 'border-orange-300/70 bg-orange-300/20 text-orange-100'
                : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/10'
        }`}
    >
        {label}
    </button>
);

TrpgControlBall.displayName = 'TrpgControlBall';

export default TrpgControlBall;
