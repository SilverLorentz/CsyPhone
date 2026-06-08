import React, { useEffect, useRef, useState } from 'react';
import { MusicNote, Play } from '@phosphor-icons/react';

export interface MusicSkin {
    surface: string;
    ink: string;
    accent: string;
}

export interface MusicShape {
    width: number;
    height: number;
    radius: number;
    alpha: number;
    blur: number;
    coverRound: boolean;
}

export interface MusicWidgetConfig {
    version: number;
    skin: MusicSkin;
    shape: MusicShape;
    pos: { x: number; y: number };
}

export const MUSIC_SKINS: { id: string; name: string; skin: MusicSkin }[] = [
    { id: 'cream', name: '纸白', skin: { surface: '#f8f5ee', ink: '#24221f', accent: '#8f8578' } },
    { id: 'mist', name: '雾粉', skin: { surface: '#f5e9e9', ink: '#4a3a3c', accent: '#cf8aa0' } },
    { id: 'lotus', name: '藕色', skin: { surface: '#efe7ec', ink: '#423742', accent: '#b288a6' } },
    { id: 'cherry', name: '晚樱', skin: { surface: '#f3e6ea', ink: '#4a3640', accent: '#d2849b' } },
    { id: 'oat', name: '燕麦', skin: { surface: '#efe9df', ink: '#3f3a30', accent: '#b59a6f' } },
    { id: 'sage', name: '鼠尾草', skin: { surface: '#e8ece4', ink: '#38402f', accent: '#bb8f86' } },
];

export const DEFAULT_MUSIC_CONFIG: MusicWidgetConfig = {
    version: 5,
    skin: { surface: '#f8f5ee', ink: '#24221f', accent: '#8f8578' },
    shape: { width: 164, height: 72, radius: 18, alpha: 94, blur: 0, coverRound: false },
    pos: { x: 24, y: 456 },
};

const MUSIC_CONFIG_STORAGE_KEY = 'cpMusicConfig';

const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

function normalizeConfig(value: unknown): MusicWidgetConfig {
    const source = value && typeof value === 'object' ? value as Partial<MusicWidgetConfig> : {};
    const isLegacyConfig = source.version !== DEFAULT_MUSIC_CONFIG.version;

    return {
        version: DEFAULT_MUSIC_CONFIG.version,
        skin: isLegacyConfig
            ? DEFAULT_MUSIC_CONFIG.skin
            : { ...DEFAULT_MUSIC_CONFIG.skin, ...(source.skin || {}) },
        shape: isLegacyConfig
            ? DEFAULT_MUSIC_CONFIG.shape
            : { ...DEFAULT_MUSIC_CONFIG.shape, ...(source.shape || {}) },
        pos: isLegacyConfig
            ? DEFAULT_MUSIC_CONFIG.pos
            : { ...DEFAULT_MUSIC_CONFIG.pos, ...(source.pos || {}) },
    };
}

export function useMusicConfig(): readonly [
    MusicWidgetConfig,
    React.Dispatch<React.SetStateAction<MusicWidgetConfig>>,
] {
    const [config, setConfig] = useState<MusicWidgetConfig>(() => {
        try {
            const raw = window.localStorage.getItem(MUSIC_CONFIG_STORAGE_KEY);
            return raw ? normalizeConfig(JSON.parse(raw)) : DEFAULT_MUSIC_CONFIG;
        } catch {
            return DEFAULT_MUSIC_CONFIG;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem(MUSIC_CONFIG_STORAGE_KEY, JSON.stringify(config));
        } catch {
            // Storage may be unavailable in restricted browser modes.
        }
    }, [config]);

    return [config, setConfig] as const;
}

interface DesktopMusicWidgetProps {
    config: MusicWidgetConfig;
    title: string;
    artist: string;
    progress: number;
    trackCount: number;
    coverSrc?: string;
    draggable?: boolean;
    onOpen: () => void;
    onPositionChange: (pos: { x: number; y: number }) => void;
}

interface MusicSkinPickerProps {
    config: MusicWidgetConfig;
    onChange: (next: MusicWidgetConfig) => void;
    onReset?: () => void;
}

export const MusicSkinPicker: React.FC<MusicSkinPickerProps> = ({ config, onChange, onReset }) => {
    const { skin, shape } = config;
    const setSkin = (nextSkin: Partial<MusicSkin>) => {
        onChange({ ...config, skin: { ...skin, ...nextSkin } });
    };
    const setShape = (nextShape: Partial<MusicShape>) => {
        onChange({ ...config, shape: { ...shape, ...nextShape } });
    };

    return (
        <div className="cpmsp">
            <div className="cpmsp-presets">
                {MUSIC_SKINS.map(preset => (
                    <button
                        key={preset.id}
                        type="button"
                        className={`cpmsp-chip ${skin.surface === preset.skin.surface ? 'is-on' : ''}`}
                        style={{
                            '--c': preset.skin.surface,
                            '--a': preset.skin.accent,
                        } as React.CSSProperties}
                        onClick={() => onChange({ ...config, skin: preset.skin })}
                    >
                        <span className="cpmsp-sw" />
                        {preset.name}
                    </button>
                ))}
            </div>

            <label className="cpmsp-row">
                <span>底色</span>
                <input type="color" value={skin.surface} onChange={(event) => setSkin({ surface: event.target.value })} />
            </label>
            <label className="cpmsp-row">
                <span>墨色</span>
                <input type="color" value={skin.ink} onChange={(event) => setSkin({ ink: event.target.value })} />
            </label>
            <label className="cpmsp-row">
                <span>点缀</span>
                <input type="color" value={skin.accent} onChange={(event) => setSkin({ accent: event.target.value })} />
            </label>
            <label className="cpmsp-row">
                <span>宽度</span>
                <input type="range" min={148} max={190} value={shape.width} onChange={(event) => setShape({ width: Number(event.target.value) })} />
            </label>
            <label className="cpmsp-row">
                <span>高度</span>
                <input type="range" min={66} max={96} value={shape.height} onChange={(event) => setShape({ height: Number(event.target.value) })} />
            </label>
            <label className="cpmsp-row">
                <span>圆角</span>
                <input type="range" min={0} max={28} value={shape.radius} onChange={(event) => setShape({ radius: Number(event.target.value) })} />
            </label>
            <label className="cpmsp-row">
                <span>透明度</span>
                <input type="range" min={40} max={100} value={shape.alpha} onChange={(event) => setShape({ alpha: Number(event.target.value) })} />
            </label>
            <div className="cpmsp-row">
                <span>磨砂</span>
                <button type="button" onClick={() => setShape({ blur: shape.blur ? 0 : 12 })}>
                    {shape.blur ? '开' : '关'}
                </button>
            </div>
            <div className="cpmsp-row">
                <span>封面</span>
                <button type="button" onClick={() => setShape({ coverRound: !shape.coverRound })}>
                    {shape.coverRound ? '圆形' : '圆角方'}
                </button>
            </div>
            {onReset ? (
                <button type="button" className="cpmsp-reset" onClick={onReset}>
                    恢复默认播放器
                </button>
            ) : null}
        </div>
    );
};

const DesktopMusicWidget: React.FC<DesktopMusicWidgetProps> = ({
    config,
    title,
    artist,
    progress,
    trackCount,
    coverSrc,
    draggable = true,
    onOpen,
    onPositionChange,
}) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef({
        active: false,
        moved: false,
        pointerId: -1,
        startX: 0,
        startY: 0,
        baseX: 0,
        baseY: 0,
        currentX: config.pos.x,
        currentY: config.pos.y,
    });
    const { skin, shape, pos } = config;

    function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
        if (!draggable) return;
        const element = ref.current;
        if (!element) return;

        dragRef.current = {
            active: true,
            moved: false,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            baseX: pos.x,
            baseY: pos.y,
            currentX: pos.x,
            currentY: pos.y,
        };
        element.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
        const state = dragRef.current;
        const element = ref.current;
        if (!state.active || !element) return;

        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        if (!state.moved && Math.hypot(deltaX, deltaY) < 6) return;

        const parent = element.offsetParent as HTMLElement | null;
        const parentWidth = parent?.clientWidth || window.innerWidth;
        const parentHeight = parent?.clientHeight || window.innerHeight;
        const nextX = clamp(state.baseX + deltaX, 8, parentWidth - element.offsetWidth - 8);
        const nextY = clamp(state.baseY + deltaY, 8, parentHeight - element.offsetHeight - 8);

        state.moved = true;
        state.currentX = nextX;
        state.currentY = nextY;
        element.classList.add('is-dragging');
        element.style.left = `${nextX}px`;
        element.style.top = `${nextY}px`;
    }

    function endPointer(): void {
        const state = dragRef.current;
        const element = ref.current;
        if (!state.active) return;

        state.active = false;
        try {
            element?.releasePointerCapture(state.pointerId);
        } catch {
            // Pointer capture may already be released.
        }
        element?.classList.remove('is-dragging');

        if (state.moved) {
            onPositionChange({ x: state.currentX, y: state.currentY });
            return;
        }

        onOpen();
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen();
    }

    return (
        <div
            ref={ref}
            className={`cp-music ${draggable ? 'is-editable' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="网易云音乐"
            style={{
                left: pos.x,
                top: pos.y,
                width: shape.width,
                height: shape.height,
                '--m-surface': skin.surface,
                '--m-ink': skin.ink,
                '--m-accent': skin.accent,
                '--m-radius': `${shape.radius}px`,
                '--m-alpha': String(shape.alpha),
                '--m-blur': `${shape.blur}px`,
                '--m-cover-radius': shape.coverRound ? '50%' : '12px',
            } as React.CSSProperties}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onKeyDown={handleKeyDown}
            onClick={draggable ? undefined : onOpen}
        >
            <span className="cp-music-cover">
                {coverSrc ? <img src={coverSrc} alt="" /> : <MusicNote weight="fill" />}
            </span>
            <span className="cp-music-body">
                <span className="cp-music-kick">
                    NOW PLAYING
                    <span className="cp-music-ln" />
                    <span className="cp-music-no">№ {trackCount || 0}</span>
                </span>
                <span className="cp-music-title">{title}</span>
                <span className="cp-music-artist">{artist}</span>
            </span>
            <span className="cp-music-play">
                <Play weight="fill" />
            </span>
            <span className="cp-music-progress" aria-hidden="true">
                <span style={{ width: `${clamp(progress, 0, 100)}%` }} />
            </span>
        </div>
    );
};

export default DesktopMusicWidget;
