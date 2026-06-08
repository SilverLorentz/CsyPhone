import React from 'react';

export const MacroBar: React.FC<{ label: string; value: number; target: number; color: string; unit?: string }> = React.memo(
    ({ label, value, target, color, unit = 'g' }) => {
        // Clamp at 100% — no red, no anxiety
        const percent = Math.min((value / Math.max(target, 1)) * 100, 100);
        return (
            <div className="hs-macro-item hs-animate-fade-in">
                <div className="hs-macro-label" style={{ color }}>
                    <span className="dot" style={{ background: color }} />
                    {label}
                </div>
                <div className="hs-macro-bar">
                    <div className="hs-macro-bar-fill" style={{ width: `${percent}%`, background: color }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="hs-macro-value">{value}{unit}</span>
                    <span className="hs-macro-target">/ {target}{unit}</span>
                </div>
            </div>
        );
    },
);
