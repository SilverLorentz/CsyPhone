import React, { useEffect, useMemo, useState } from 'react';
import {
    clearReadyWorldlineCharId,
    getDateWorldlineIntroLines,
    getReadyWorldlineCharId,
    isDateWorldlineCompleted,
    markDateWorldlineCompleted,
    setReadyWorldlineCharId,
} from '../../utils/dateWorldlineOrb';

type OrbStage = 'intro' | 'ready' | 'launch';

interface DateWorldlineOrbProps {
    charId: string;
    charName: string;
    userName: string;
    isBusy?: boolean;
    onStartDiscussion: () => void | Promise<void>;
    onLaunch: () => void;
}

const INTRO_DELAY_MS = 900;
const INTRO_LINE_DELAY_MS = 620;
const LAUNCH_LINE_DELAY_MS = 360;

const DateWorldlineOrb: React.FC<DateWorldlineOrbProps> = ({
    charId,
    charName,
    userName,
    isBusy = false,
    onStartDiscussion,
    onLaunch,
}) => {
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [visible, setVisible] = useState(false);
    const [bubbleOpen, setBubbleOpen] = useState(false);
    const [stage, setStage] = useState<OrbStage>('intro');
    const [visibleLineCount, setVisibleLineCount] = useState(0);

    useEffect(() => {
        const nextMidnight = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate() + 1,
        );
        const timer = window.setTimeout(
            () => setCurrentDate(new Date()),
            Math.max(1000, nextMidnight.getTime() - currentDate.getTime() + 1000),
        );

        return () => window.clearTimeout(timer);
    }, [currentDate]);

    useEffect(() => {
        let timer: number | undefined;
        let openTimer: number | undefined;
        const readyCharId = getReadyWorldlineCharId();

        if (readyCharId === charId) {
            setVisible(true);
            setStage('ready');
            setBubbleOpen(false);
            return;
        }

        if (!isDateWorldlineCompleted(undefined, currentDate)) {
            setVisible(false);
            setStage('intro');
            setBubbleOpen(false);
            setVisibleLineCount(0);
            timer = window.setTimeout(() => {
                setVisible(true);
                openTimer = window.setTimeout(() => setBubbleOpen(true), 720);
            }, INTRO_DELAY_MS);
        } else {
            setVisible(false);
            setBubbleOpen(false);
            setVisibleLineCount(0);
        }

        return () => {
            if (timer) window.clearTimeout(timer);
            if (openTimer) window.clearTimeout(openTimer);
        };
    }, [charId, currentDate]);

    const introLines = useMemo(() => getDateWorldlineIntroLines({
        now: currentDate,
        charName,
        userName,
    }), [charName, currentDate, userName]);

    const lines = useMemo(() => (
        stage === 'launch'
            ? ['吱醒了。', '商量好了吗？', '那就出发吧。']
            : introLines
    ), [introLines, stage]);

    useEffect(() => {
        if (!bubbleOpen) {
            setVisibleLineCount(0);
            return;
        }

        setVisibleLineCount(0);
        const lineDelay = stage === 'launch' ? LAUNCH_LINE_DELAY_MS : INTRO_LINE_DELAY_MS;
        const timers = lines.map((_, index) => (
            window.setTimeout(() => setVisibleLineCount(index + 1), 120 + index * lineDelay)
        ));

        return () => timers.forEach(timer => window.clearTimeout(timer));
    }, [bubbleOpen, lines, stage]);

    const handleOrbClick = () => {
        if (stage === 'ready') {
            setStage('launch');
            setBubbleOpen(true);
            return;
        }
        setBubbleOpen(true);
    };

    const handlePrimary = async () => {
        if (isBusy) return;
        if (stage === 'launch') {
            clearReadyWorldlineCharId();
            setBubbleOpen(false);
            onLaunch();
            return;
        }

        markDateWorldlineCompleted(undefined, currentDate);
        setReadyWorldlineCharId(charId);
        setStage('ready');
        setBubbleOpen(false);
        await onStartDiscussion();
    };

    if (!visible) return null;

    const allLinesVisible = visibleLineCount >= lines.length;
    const visibleLines = lines.slice(0, visibleLineCount);
    const orbModeClass = stage === 'ready'
        ? 'date-worldline-orb-button--ready'
        : stage === 'launch'
            ? 'date-worldline-orb-button--launch'
            : '';

    return (
        <div className="date-worldline-orb-shell pointer-events-none absolute bottom-[calc(var(--safe-bottom)+5.75rem)] right-4 z-[58] flex flex-col items-end gap-2">
            <style>{`
                @keyframes date-worldline-orb-arrive {
                    0% { opacity: 0; transform: translate3d(120px, 48px, 0) scale(0.42); filter: blur(6px); }
                    42% { opacity: 1; transform: translate3d(-28px, -44px, 0) scale(0.88); filter: blur(0); }
                    72% { transform: translate3d(10px, -12px, 0) scale(1.04); }
                    100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
                }
                @keyframes date-worldline-orb-float {
                    0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
                    50% { transform: translate3d(-4px, -8px, 0) scale(1.03); }
                }
                @keyframes date-worldline-orb-doze {
                    0%, 100% { transform: translate3d(0, 0, 0) scale(0.92); opacity: 0.88; }
                    50% { transform: translate3d(-2px, -4px, 0) scale(0.98); opacity: 1; }
                }
                @keyframes date-worldline-orb-aura {
                    0%, 100% { opacity: 0.42; transform: scale(0.92); }
                    50% { opacity: 0.76; transform: scale(1.12); }
                }
                @keyframes date-worldline-orb-trail {
                    0% { opacity: 0; transform: translate3d(10px, 8px, 0) scale(0.2); }
                    35% { opacity: 0.72; }
                    100% { opacity: 0; transform: translate3d(-34px, -20px, 0) scale(1); }
                }
                @keyframes date-worldline-line-in {
                    from { opacity: 0; transform: translate3d(8px, 8px, 0) scale(0.98); }
                    to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
                }
                @keyframes date-worldline-button-in {
                    from { opacity: 0; transform: translate3d(0, 8px, 0) scale(0.96); }
                    to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
                }
                .date-worldline-orb-shell {
                    animation: date-worldline-orb-arrive 1.18s cubic-bezier(0.18, 0.9, 0.2, 1) both;
                }
                .date-worldline-orb-button {
                    animation: date-worldline-orb-float 3.8s ease-in-out infinite;
                    box-shadow:
                        0 0 26px rgba(255, 199, 218, 0.82),
                        0 0 54px rgba(161, 224, 255, 0.48),
                        inset 0 0 18px rgba(255, 255, 255, 0.88);
                }
                .date-worldline-orb-button::before {
                    content: '';
                    position: absolute;
                    inset: -12px;
                    border-radius: 999px;
                    background: radial-gradient(circle, rgba(255,255,255,0.88) 0%, rgba(255,206,226,0.46) 38%, rgba(156,220,255,0) 72%);
                    animation: date-worldline-orb-aura 2.6s ease-in-out infinite;
                    z-index: -1;
                }
                .date-worldline-orb-button--ready {
                    animation: date-worldline-orb-doze 4.8s ease-in-out infinite;
                    box-shadow:
                        0 0 18px rgba(255, 199, 218, 0.68),
                        0 0 36px rgba(161, 224, 255, 0.34),
                        inset 0 0 18px rgba(255, 255, 255, 0.82);
                }
                .date-worldline-orb-button--launch {
                    animation-duration: 2.4s;
                }
                .date-worldline-orb-trail {
                    animation: date-worldline-orb-trail 2.4s ease-out infinite;
                }
                .date-worldline-line {
                    animation: date-worldline-line-in 260ms ease-out both;
                }
                .date-worldline-primary {
                    animation: date-worldline-button-in 260ms ease-out both;
                }
            `}</style>

            {bubbleOpen && (
                <div className="pointer-events-auto w-[min(17rem,calc(100vw-2rem))] rounded-[22px] border border-white/70 bg-white/78 p-2.5 text-[13px] leading-relaxed text-[#4f3f47] shadow-[0_18px_48px_rgba(95,62,78,0.18)] backdrop-blur-xl">
                    <div className="space-y-2" aria-live="polite">
                        {visibleLines.map((line, index) => (
                            <p
                                key={`${stage}-${index}-${line}`}
                                className="date-worldline-line w-fit max-w-full whitespace-pre-line rounded-[16px] bg-white/86 px-3 py-2 shadow-[0_6px_18px_rgba(126,88,104,0.08)]"
                                style={{ animationDelay: `${Math.min(index * 28, 120)}ms` }}
                            >
                                {line}
                            </p>
                        ))}
                    </div>
                    <div className="mt-3 flex min-h-[2rem] justify-end">
                        {allLinesVisible && (
                            <button
                                type="button"
                                onClick={handlePrimary}
                                disabled={isBusy}
                                className="date-worldline-primary rounded-full bg-[#33232b] px-4 py-2 text-[12px] font-medium text-white shadow-[0_10px_24px_rgba(51,35,43,0.18)] transition-transform active:scale-95 disabled:opacity-45"
                            >
                                {stage === 'launch' ? '出发' : '去商量商量'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            <button
                type="button"
                aria-label="吱吱吱的约会入口"
                onClick={handleOrbClick}
                className={`date-worldline-orb-button ${orbModeClass} pointer-events-auto relative h-[54px] w-[54px] rounded-full border border-white/90 bg-[radial-gradient(circle_at_32%_28%,#ffffff_0%,#fff9c9_18%,#ffd1e0_44%,#9de2ff_76%,#bba4ff_100%)]`}
            >
                <span className="date-worldline-orb-trail absolute right-[8px] top-[28px] h-2 w-6 rounded-full bg-white/60 blur-[2px]" />
                <span className="date-worldline-orb-trail absolute right-[16px] top-[38px] h-1.5 w-4 rounded-full bg-[#ffd2e7]/70 blur-[2px]" style={{ animationDelay: '1.1s' }} />
                <span className="absolute left-[16px] top-[12px] h-3 w-3 rounded-full bg-white/95 blur-[1px]" />
                <span className="absolute bottom-[11px] right-[13px] h-2 w-2 rounded-full bg-white/80" />
            </button>
        </div>
    );
};

export default DateWorldlineOrb;
