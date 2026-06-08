/**
 * WritingStyleSheet - Premium writing style picker for Date mode.
 *
 * Bottom sheet with grouped style rows, CSS color swatches, and one-at-a-time
 * sample previews. Used by SummaryFloatingBall and DateSettings.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DATE_WRITING_STYLE_PRESETS, resolveDateWritingStylePreset, type DateWritingStylePreset } from '../../utils/datePrompts';

export interface WritingStyleSheetProps {
    isOpen: boolean;
    /** Current style: a preset key (e.g. 'cozy') or custom text, or undefined */
    currentStyle?: string;
    onSelect: (style: string | undefined) => void;
    onClose: () => void;
}

type GroupedWritingStyles = {
    group: string;
    presets: DateWritingStylePreset[];
};

type AccentVars = React.CSSProperties & {
    '--wsp-accent-light'?: string;
    '--wsp-accent-dark'?: string;
};

const CUSTOM_KEY = '__custom__';
const CUSTOM_ACCENT = { light: '#888780', dark: '#B8B6AE' };

const calmTransition = {
    type: 'tween' as const,
    duration: 0.22,
    ease: [0.22, 1, 0.36, 1] as const,
};

/** Check if a style string is a preset key */
const isPresetKey = (s?: string): boolean => {
    return !!resolveDateWritingStylePreset(s);
};

/** Get display label for current style */
const getStyleDisplayLabel = (style?: string): string => {
    if (!style) return '未选择';
    const preset = resolveDateWritingStylePreset(style);
    if (preset) return preset.label;
    return '自定义';
};

const groupWritingStyles = (presets: DateWritingStylePreset[]): GroupedWritingStyles[] => {
    const groups = new Map<string, DateWritingStylePreset[]>();
    presets.forEach(preset => {
        const existing = groups.get(preset.group);
        if (existing) existing.push(preset);
        else groups.set(preset.group, [preset]);
    });
    return Array.from(groups, ([group, groupedPresets]) => ({ group, presets: groupedPresets }));
};

const getAccentVars = (accent: { light: string; dark: string }): AccentVars => ({
    '--wsp-accent-light': accent.light,
    '--wsp-accent-dark': accent.dark,
});

const isKeyboardActivation = (event: React.KeyboardEvent) => (
    event.key === 'Enter' || event.key === ' '
);

const WritingStyleSheet: React.FC<WritingStyleSheetProps> = ({
    isOpen,
    currentStyle,
    onSelect,
    onClose,
}) => {
    const prefersReducedMotion = useReducedMotion() ?? false;
    const groupedStyles = useMemo(() => groupWritingStyles(DATE_WRITING_STYLE_PRESETS), []);
    const activePreset = resolveDateWritingStylePreset(currentStyle);
    const activePresetKey = activePreset?.key;
    const isCustomActive = !!currentStyle && !activePreset;
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [customText, setCustomText] = useState<string>('');
    const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const customTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const hasScrolledCurrentIntoViewRef = useRef(false);

    useEffect(() => {
        if (!isOpen) return;
        if (isCustomActive && currentStyle) {
            setCustomText(currentStyle);
            setExpandedKey(CUSTOM_KEY);
            return;
        }
        setExpandedKey(activePresetKey || null);
    }, [activePresetKey, currentStyle, isCustomActive, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            hasScrolledCurrentIntoViewRef.current = false;
            return;
        }
        if (hasScrolledCurrentIntoViewRef.current) return;

        const targetKey = activePresetKey || (isCustomActive ? CUSTOM_KEY : null);
        if (!targetKey) return;

        hasScrolledCurrentIntoViewRef.current = true;
        const timer = window.setTimeout(() => {
            rowRefs.current[targetKey]?.scrollIntoView({
                block: 'center',
                behavior: 'auto',
            });
        }, 80);

        return () => window.clearTimeout(timer);
    }, [activePresetKey, isCustomActive, isOpen]);

    useEffect(() => {
        const textarea = customTextareaRef.current;
        if (!textarea || expandedKey !== CUSTOM_KEY) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(62, textarea.scrollHeight)}px`;
    }, [customText, expandedKey]);

    const registerRow = useCallback((key: string, node: HTMLDivElement | null) => {
        rowRefs.current[key] = node;
    }, []);

    const handlePresetSelect = useCallback((preset: DateWritingStylePreset) => {
        setExpandedKey(preset.key);
        onSelect(preset.key);
    }, [onSelect]);

    const handleCustomOpen = useCallback(() => {
        setExpandedKey(CUSTOM_KEY);
        if (customText.trim()) {
            onSelect(customText.trim());
        }
    }, [customText, onSelect]);

    const handleCustomTextChange = useCallback((text: string) => {
        setCustomText(text);
        const trimmed = text.trim();
        if (trimmed) {
            onSelect(trimmed);
        } else if (isCustomActive) {
            onSelect(undefined);
        }
    }, [isCustomActive, onSelect]);

    const currentAccent = activePreset?.accent || (isCustomActive ? CUSTOM_ACCENT : undefined);

    const sheetTransition = prefersReducedMotion
        ? { duration: 0 }
        : calmTransition;

    const sheet = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="writing-style-sheet-overlay"
                    initial={prefersReducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                    className="writing-style-sheet-overlay"
                    onClick={onClose}
                >
                    <style>{WRITING_STYLE_SHEET_CSS}</style>
                    <div className="writing-style-sheet-backdrop" />

                    <motion.section
                        key="writing-style-sheet"
                        initial={prefersReducedMotion ? false : { y: '100%' }}
                        animate={{ y: 0 }}
                        exit={prefersReducedMotion ? { y: 0 } : { y: '100%' }}
                        transition={sheetTransition}
                        className="writing-style-sheet"
                        aria-label="文风选择"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="wsp-content">
                            <button type="button" className="wsp-grab-button" onClick={onClose} aria-label="收起文风选择">
                                <span className="wsp-grab" aria-hidden="true" />
                            </button>

                            <div className="wsp-header">
                                <div>
                                    <h2 className="wsp-title">文风</h2>
                                    <p className="wsp-subtitle">为这场见面，选一种叙述的声音</p>
                                </div>
                                <button type="button" className="wsp-close" onClick={onClose} aria-label="关闭文风选择">关闭</button>
                            </div>

                            <div className="wsp-current" style={currentAccent ? getAccentVars(currentAccent) : undefined}>
                                <span className="wsp-current-label">当前</span>
                                <span className="wsp-current-spacer" />
                                <span className={`wsp-current-swatch ${currentAccent ? '' : 'is-empty'}`} aria-hidden="true" />
                                <span className="wsp-current-name">{getStyleDisplayLabel(currentStyle)}</span>
                            </div>
                        </div>

                        <div className="wsp-scroll">
                            <div className="wsp-list">
                                {groupedStyles.map(group => (
                                    <React.Fragment key={group.group}>
                                        <SectionLabel label={group.group} />
                                        {group.presets.map(preset => (
                                            <PresetStyleRow
                                                key={preset.key}
                                                preset={preset}
                                                isActive={activePresetKey === preset.key}
                                                isExpanded={expandedKey === preset.key}
                                                prefersReducedMotion={prefersReducedMotion}
                                                onSelect={() => handlePresetSelect(preset)}
                                                registerRow={registerRow}
                                            />
                                        ))}
                                    </React.Fragment>
                                ))}

                                <SectionLabel label="自定义" />
                                <CustomStyleRow
                                    isActive={isCustomActive}
                                    isExpanded={expandedKey === CUSTOM_KEY}
                                    value={customText}
                                    prefersReducedMotion={prefersReducedMotion}
                                    onOpen={handleCustomOpen}
                                    onChange={handleCustomTextChange}
                                    registerRow={registerRow}
                                    textareaRef={customTextareaRef}
                                />
                            </div>
                        </div>
                    </motion.section>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body);
};

interface SectionLabelProps {
    label: string;
}

const SectionLabel: React.FC<SectionLabelProps> = React.memo(({ label }) => (
    <div className="wsp-section-label">
        <span>{label}</span>
        <i aria-hidden="true" />
    </div>
));

SectionLabel.displayName = 'SectionLabel';

interface PresetStyleRowProps {
    preset: DateWritingStylePreset;
    isActive: boolean;
    isExpanded: boolean;
    prefersReducedMotion: boolean;
    onSelect: () => void;
    registerRow: (key: string, node: HTMLDivElement | null) => void;
}

const PresetStyleRow: React.FC<PresetStyleRowProps> = React.memo(({
    preset,
    isActive,
    isExpanded,
    prefersReducedMotion,
    onSelect,
    registerRow,
}) => (
    <motion.div
        ref={node => registerRow(preset.key, node)}
        className={`wsp-row ${isActive ? 'is-active' : ''}`}
        style={getAccentVars(preset.accent)}
    >
        <button
            type="button"
            className="wsp-row-main"
            onClick={onSelect}
            aria-expanded={isExpanded}
            aria-label={`选择${preset.label}`}
        >
            <span className="wsp-swatch" aria-hidden="true" />
            <span className="wsp-name">{preset.label}</span>
            <span className="wsp-ref">{preset.ref}</span>
        </button>
        <SamplePreview
            isOpen={isExpanded}
            sample={preset.sample}
            prefersReducedMotion={prefersReducedMotion}
        />
    </motion.div>
));

PresetStyleRow.displayName = 'PresetStyleRow';

interface SamplePreviewProps {
    isOpen: boolean;
    sample: string;
    prefersReducedMotion: boolean;
}

const SamplePreview: React.FC<SamplePreviewProps> = React.memo(({ isOpen, sample, prefersReducedMotion }) => (
    <AnimatePresence initial={false}>
        {isOpen && (
            <motion.div
                className="wsp-row-extra"
                initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={prefersReducedMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : calmTransition}
            >
                <motion.div
                    className="wsp-read"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, delay: 0.08 }}
                >
                    「{sample}」
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
));

SamplePreview.displayName = 'SamplePreview';

interface CustomStyleRowProps {
    isActive: boolean;
    isExpanded: boolean;
    value: string;
    prefersReducedMotion: boolean;
    onOpen: () => void;
    onChange: (text: string) => void;
    registerRow: (key: string, node: HTMLDivElement | null) => void;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

const CustomStyleRow: React.FC<CustomStyleRowProps> = React.memo(({
    isActive,
    isExpanded,
    value,
    prefersReducedMotion,
    onOpen,
    onChange,
    registerRow,
    textareaRef,
}) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!isKeyboardActivation(event)) return;
        event.preventDefault();
        onOpen();
    };

    return (
        <motion.div
            ref={node => registerRow(CUSTOM_KEY, node)}
            className={`wsp-row wsp-custom-row ${isActive ? 'is-active' : ''}`}
            style={getAccentVars(CUSTOM_ACCENT)}
        >
            <div
                role="button"
                tabIndex={0}
                className="wsp-row-main"
                aria-expanded={isExpanded}
                aria-label="选择自定义文风"
                onClick={onOpen}
                onKeyDown={handleKeyDown}
            >
                <span className="wsp-swatch is-custom" aria-hidden="true" />
                <span className="wsp-name">自定义文风</span>
                <span className="wsp-ref">用你的话写</span>
            </div>

            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        className="wsp-row-extra"
                        initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={prefersReducedMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={prefersReducedMotion ? { duration: 0 } : calmTransition}
                    >
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={event => onChange(event.target.value)}
                            onClick={event => event.stopPropagation()}
                            className="wsp-textarea"
                            rows={2}
                            placeholder="例：像深夜电台，语速慢，多用第二人称，句子短，留白多..."
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
});

CustomStyleRow.displayName = 'CustomStyleRow';

const WRITING_STYLE_SHEET_CSS = `
.writing-style-sheet-overlay {
    --wsp-font-serif: "HuiwenMingchao", "Songti SC", "Noto Serif SC", SimSun, serif;
    --wsp-bg-primary: var(--color-background-primary, #FCFBF8);
    --wsp-bg-secondary: var(--color-background-secondary, #F3F1EC);
    --wsp-text-primary: var(--color-text-primary, #1E1D1A);
    --wsp-text-secondary: var(--color-text-secondary, #68625A);
    --wsp-text-tertiary: var(--color-text-tertiary, #A09A91);
    --wsp-border-secondary: var(--color-border-secondary, #E1DDD4);
    --wsp-border-tertiary: var(--color-border-tertiary, #ECE8DF);
    --wsp-radius-md: var(--border-radius-md, 12px);
    --wsp-radius-lg: var(--border-radius-lg, 18px);
    --wsp-radius-xl: var(--border-radius-xl, 28px);
    --wsp-top-gap: max(76px, calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 16px));
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    color: var(--wsp-text-primary);
    font-family: var(--app-font), -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    pointer-events: auto;
}

.writing-style-sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(20, 18, 16, 0.42);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
}

.writing-style-sheet {
    position: relative;
    width: 100%;
    max-width: 420px;
    max-height: calc(var(--visual-viewport-height, 100dvh) - var(--wsp-top-gap));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 0.5px solid var(--wsp-border-secondary);
    border-bottom: 0;
    border-radius: 28px 28px 0 0;
    background: var(--wsp-bg-primary);
    box-shadow: 0 -18px 44px rgba(20, 18, 16, 0.22);
}

.wsp-content {
    flex: none;
    padding: 8px 16px 0;
}

.wsp-grab-button {
    display: flex;
    width: 100%;
    height: 30px;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    cursor: pointer;
}

.wsp-grab {
    width: 34px;
    height: 4px;
    border-radius: 2px;
    background: var(--wsp-border-secondary);
}

.wsp-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 0 0 0;
}

.wsp-title {
    margin: 0;
    color: var(--wsp-text-primary);
    font-family: var(--wsp-font-serif);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 1px;
    line-height: 1.22;
}

.wsp-subtitle {
    margin: 3px 0 0;
    color: var(--wsp-text-secondary);
    font-size: 13px;
    line-height: 1.45;
}

.wsp-close {
    min-width: 54px;
    height: 36px;
    flex: none;
    border: 0.5px solid var(--wsp-border-secondary);
    border-radius: 999px;
    background: var(--wsp-bg-secondary);
    color: var(--wsp-text-secondary);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.5px;
    line-height: 1;
    padding: 0 14px;
}

.wsp-current,
.writing-style-sheet .wsp-row,
.writing-style-sheet .wsp-current-swatch,
.writing-style-sheet .wsp-swatch {
    --wsp-accent: var(--wsp-accent-light);
}

.wsp-current {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    margin: 14px 0 10px;
    border-radius: var(--wsp-radius-md);
    background: var(--wsp-bg-secondary);
    padding: 9px 14px;
}

.wsp-current-label {
    color: var(--wsp-text-tertiary);
    font-size: 12px;
    line-height: 1;
}

.wsp-current-spacer,
.wsp-row-spacer {
    flex: 1;
    min-width: 8px;
}

.wsp-current-swatch,
.wsp-swatch {
    display: inline-flex;
    width: 14px;
    height: 14px;
    flex: none;
    border: 0.5px solid var(--wsp-border-tertiary);
    border-radius: 3px;
    background: var(--wsp-accent);
}

.wsp-current-swatch {
    width: 12px;
    height: 12px;
}

.wsp-current-swatch.is-empty {
    border-style: dashed;
    background: transparent;
}

.wsp-current-name {
    max-width: 176px;
    overflow: hidden;
    color: var(--wsp-text-primary);
    font-family: var(--wsp-font-serif);
    font-size: 14px;
    letter-spacing: 0.5px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.wsp-scroll {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 0 16px calc(16px + var(--safe-bottom, env(safe-area-inset-bottom, 0px)));
}

.wsp-list {
    overflow: hidden;
    border: 0.5px solid var(--wsp-border-tertiary);
    border-radius: var(--wsp-radius-lg);
    background: var(--wsp-bg-primary);
    padding: 0 6px 4px;
}

.wsp-section-label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 8px 8px;
}

.wsp-section-label span {
    color: var(--wsp-text-tertiary);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 3px;
    line-height: 1;
}

.wsp-section-label i {
    height: 0.5px;
    flex: 1;
    background: var(--wsp-border-tertiary);
}

.wsp-row {
    overflow: hidden;
    border-bottom: 0.5px solid var(--wsp-border-tertiary);
    border-left: 3px solid transparent;
    transition: border-left-color 0.18s ease, background 0.18s ease;
}

.wsp-row.is-active {
    border-left-color: var(--wsp-accent);
}

.wsp-custom-row {
    border-bottom: 0;
}

.wsp-row-main {
    display: grid;
    grid-template-columns: 18px minmax(78px, max-content) minmax(0, 1fr);
    width: 100%;
    min-height: 37px;
    align-items: start;
    column-gap: 10px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 11px 12px 11px 8px;
    text-align: left;
}

.wsp-name {
    min-width: 0;
    color: var(--wsp-text-primary);
    font-family: var(--wsp-font-serif);
    font-size: 16px;
    font-weight: 400;
    letter-spacing: 0.5px;
    line-height: 1.25;
    white-space: nowrap;
}

.wsp-row.is-active .wsp-name {
    font-weight: 500;
}

.wsp-ref {
    color: var(--wsp-text-tertiary);
    font-size: 11.5px;
    letter-spacing: 0.2px;
    line-height: 1.42;
    overflow-wrap: anywhere;
    text-align: right;
    white-space: normal;
}

.wsp-swatch.is-custom {
    border-style: dashed;
    background: transparent;
}

.wsp-row-extra {
    overflow: hidden;
}

.wsp-read {
    color: var(--wsp-text-secondary);
    font-family: var(--wsp-font-serif);
    font-size: 14px;
    font-style: normal;
    letter-spacing: 0.15px;
    line-height: 1.7;
    padding: 9px 4px 3px 24px;
}

.wsp-textarea {
    width: calc(100% - 24px);
    min-height: 62px;
    max-height: 180px;
    resize: none;
    overflow: hidden;
    border: 0.5px solid var(--wsp-border-tertiary);
    border-radius: 12px;
    background: var(--wsp-bg-secondary);
    color: var(--wsp-text-primary);
    font-family: var(--wsp-font-serif);
    font-size: 14px;
    font-style: normal;
    line-height: 1.7;
    margin: 10px 12px 4px;
    padding: 10px 12px;
}

.wsp-textarea::placeholder {
    color: var(--wsp-text-tertiary);
}

@media (hover: hover) {
    .wsp-row:hover {
        background: var(--wsp-bg-secondary);
    }

    .wsp-close:hover {
        color: var(--wsp-text-secondary);
        background: var(--wsp-bg-secondary);
    }
}

@media (prefers-color-scheme: dark) {
    .writing-style-sheet-overlay {
        --wsp-bg-primary: var(--color-background-primary, #17171D);
        --wsp-bg-secondary: var(--color-background-secondary, #22222A);
        --wsp-text-primary: var(--color-text-primary, #F3F0EA);
        --wsp-text-secondary: var(--color-text-secondary, #BDB5AA);
        --wsp-text-tertiary: var(--color-text-tertiary, #807C74);
        --wsp-border-secondary: var(--color-border-secondary, #393943);
        --wsp-border-tertiary: var(--color-border-tertiary, #2F2F38);
    }

    .wsp-current,
    .writing-style-sheet .wsp-row,
    .writing-style-sheet .wsp-current-swatch,
    .writing-style-sheet .wsp-swatch {
        --wsp-accent: var(--wsp-accent-dark);
    }
}

@media (max-width: 360px) {
    .wsp-row-main {
        grid-template-columns: 16px minmax(72px, max-content) minmax(0, 1fr);
        column-gap: 8px;
        padding-right: 8px;
    }

    .wsp-name {
        font-size: 15px;
    }

    .wsp-ref {
        font-size: 11px;
    }
}

@media (prefers-reduced-motion: reduce) {
    .wsp-row,
    .wsp-close {
        transition: none;
    }
}
`;

export default WritingStyleSheet;
export { getStyleDisplayLabel, isPresetKey };
