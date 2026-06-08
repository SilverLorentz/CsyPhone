import React, { useEffect } from 'react';
import './TrajectoryCollapseTransition.css';

const COLLAPSE_LINES = [
    { id: 'voluntary', text: '我是自愿入了歧途', emphasisStart: 6, emphasisEnd: 8 },
    { id: 'nowhere', text: '渺渺人间无归处', emphasisStart: 4, emphasisEnd: 7 },
    { id: 'find-him', text: '但我还是想去找他', emphasisStart: 6, emphasisEnd: 8 },
] as const;

const COMPLETE_DELAY_MS = 5800;

interface TrajectoryCollapseTransitionProps {
    onComplete: () => void;
}

const TrajectoryCollapseTransition: React.FC<TrajectoryCollapseTransitionProps> = ({ onComplete }) => {
    useEffect(() => {
        const timer = window.setTimeout(onComplete, COMPLETE_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [onComplete]);

    return (
        <div
            className="traj-collapse-transition"
            role="status"
            aria-live="assertive"
            aria-label={COLLAPSE_LINES.map(line => line.text).join('\n')}
        >
            <div className="traj-collapse-transition__void" aria-hidden="true" />
            <div className="traj-collapse-transition__hands-stage" aria-hidden="true">
                <span className="traj-collapse-transition__hands-glow" />
                <img
                    className="traj-collapse-transition__hands"
                    src="/assets/trajectory/collapse-hands.png"
                    alt=""
                    draggable={false}
                />
                <span className="traj-collapse-transition__ink" />
            </div>

            <div className="traj-collapse-transition__copy" aria-hidden="true">
                <div className="traj-collapse-transition__caption">WHISPER / SPACETIME COLLAPSE</div>
                {COLLAPSE_LINES.map((line, lineIndex) => (
                    <div
                        key={line.id}
                        className={`traj-collapse-transition__line traj-collapse-transition__line--${line.id}`}
                    >
                        {Array.from(line.text).map((char, charIndex) => {
                            const isEmphasis = charIndex >= line.emphasisStart && charIndex < line.emphasisEnd;
                            const style = {
                                '--traj-collapse-delay': `${720 + lineIndex * 780 + charIndex * 46}ms`,
                                '--traj-collapse-y': `${(charIndex % 3) - 1}px`,
                            } as React.CSSProperties;

                            return (
                                <span
                                    key={`${line.id}-${charIndex}-${char}`}
                                    className={`traj-collapse-transition__char${isEmphasis ? ' traj-collapse-transition__char--emphasis' : ''}`}
                                    style={style}
                                >
                                    {char}
                                </span>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TrajectoryCollapseTransition;
