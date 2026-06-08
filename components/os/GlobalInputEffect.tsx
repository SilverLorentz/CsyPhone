import React,{ useEffect,useMemo,useRef,useState } from 'react';
import './GlobalInputEffect.css';

interface GlobalInputEffectProps {
    enabled?: boolean;
    asset?: string;
    scale?: number;
    opacity?: number;
    offsetX?: number;
    offsetY?: number;
    duration?: number;
    spinSpeed?: number;
}

const DEFAULT_MAGIC_CIRCLE = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="90" cy="90" r="62" stroke-width="2.5" opacity=".78"/>
    <circle cx="90" cy="90" r="72" stroke-width="1.6" stroke-dasharray="12 9" opacity=".55"/>
    <path d="M90 25 108 73 160 73 118 104 134 154 90 124 46 154 62 104 20 73 72 73Z" stroke-width="2.4" opacity=".72"/>
    <path d="M90 54 100 80 128 80 105 97 114 124 90 108 66 124 75 97 52 80 80 80Z" stroke-width="2" opacity=".7"/>
    <path d="M43 135 137 45M43 45l94 90" stroke-width="1.4" opacity=".36"/>
    <path d="M90 16v18M90 146v18M16 90h18M146 90h18" stroke-width="1.2" opacity=".42"/>
  </g>
</svg>
`)}`;

const EDITABLE_SELECTOR = [
    'textarea:not([readonly]):not([disabled])',
    'input:not([readonly]):not([disabled])',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
].join(',');

const IGNORED_INPUT_TYPES = new Set([
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
]);

type EffectState = {
    id: number;
    x: number;
    y: number;
};

function resolveEditableTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    const editable = target.closest(EDITABLE_SELECTOR) as HTMLElement | null;
    if (!editable || editable.closest('[data-sully-input-effect="off"]')) return null;

    if (editable instanceof HTMLInputElement && IGNORED_INPUT_TYPES.has(editable.type)) {
        return null;
    }

    const rect = editable.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return editable;
}

function getEffectPosition(target: HTMLElement, scale: number, offsetX: number, offsetY: number): { x: number; y: number } {
    const rect = target.getBoundingClientRect();
    const size = 148 * scale;
    const half = size / 2;
    const x = Math.min(Math.max(rect.left + rect.width / 2 + offsetX, half + 8), window.innerWidth - half - 8);
    const y = Math.min(Math.max(rect.top + rect.height / 2 + offsetY, half + 8), window.innerHeight - half - 8);
    return { x,y };
}

const GlobalInputEffect: React.FC<GlobalInputEffectProps> = ({
    enabled,
    asset,
    scale = 1,
    opacity = 0.85,
    offsetX = 0,
    offsetY = 0,
    duration = 0.95,
    spinSpeed = 1,
}) => {
    const [effect, setEffect] = useState<EffectState | null>(null);
    const pulseIdRef = useRef(0);
    const clearTimerRef = useRef<number | undefined>();
    const safeScale = Number.isFinite(scale) ? Math.min(Math.max(scale, 0.5), 2) : 1;
    const safeOpacity = Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0.2), 1) : 0.85;
    const safeOffsetX = Number.isFinite(offsetX) ? Math.min(Math.max(offsetX, -120), 120) : 0;
    const safeOffsetY = Number.isFinite(offsetY) ? Math.min(Math.max(offsetY, -120), 120) : 0;
    const safeDuration = Number.isFinite(duration) ? Math.min(Math.max(duration, 0.35), 3) : 0.95;
    const safeSpinSpeed = Number.isFinite(spinSpeed) ? Math.min(Math.max(spinSpeed, 0), 3) : 1;
    const durationMs = safeDuration * 1000;
    const effectAsset = useMemo(() => asset || DEFAULT_MAGIC_CIRCLE, [asset]);

    useEffect(() => {
        if (!enabled) {
            setEffect(null);
            return;
        }

        const showEffect = (event: Event) => {
            const target = resolveEditableTarget(event.target);
            if (!target) return;

            window.clearTimeout(clearTimerRef.current);
            pulseIdRef.current += 1;
            const { x,y } = getEffectPosition(target, safeScale, safeOffsetX, safeOffsetY);
            setEffect({ id: pulseIdRef.current,x,y });
            clearTimerRef.current = window.setTimeout(() => setEffect(null), durationMs);
        };

        document.addEventListener('input', showEffect, true);
        document.addEventListener('compositionupdate', showEffect, true);

        return () => {
            document.removeEventListener('input', showEffect, true);
            document.removeEventListener('compositionupdate', showEffect, true);
            window.clearTimeout(clearTimerRef.current);
        };
    }, [enabled, safeScale, safeOffsetX, safeOffsetY, durationMs]);

    if (!enabled || !effect) return null;

    const effectStyle = {
        left: `${effect.x}px`,
        top: `${effect.y}px`,
        '--sully-input-effect-scale': safeScale,
        '--sully-input-effect-opacity': safeOpacity,
        '--sully-input-effect-duration': `${durationMs}ms`,
        '--sully-input-effect-spin-from': `${-14 * safeSpinSpeed}deg`,
        '--sully-input-effect-spin-to': `${34 * safeSpinSpeed}deg`,
        '--sully-input-effect-spark-delay': `${durationMs * 0.095}ms`,
    } as React.CSSProperties;

    return (
        <div
            key={effect.id}
            className="sully-global-input-effect"
            aria-hidden="true"
            style={effectStyle}
        >
            <img className="sully-global-input-effect__asset" src={effectAsset} alt="" draggable={false} />
            <span className="sully-global-input-effect__spark sully-global-input-effect__spark--a" />
            <span className="sully-global-input-effect__spark sully-global-input-effect__spark--b" />
        </div>
    );
};

export default React.memo(GlobalInputEffect);
