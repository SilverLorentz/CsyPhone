


import React,{ useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import ReactDOM from 'react-dom';
import { ArrowSquareOut, ArrowsOutSimple, DownloadSimple, DeviceMobileCamera, Fire, PlayCircle, Sparkle, X } from '@phosphor-icons/react';
import { Message,ChatTheme } from '../../types';
import { StatusCardData } from '../../types/statusCard';
import { haptic } from '../../utils/haptics';
import { THEME_PLUGINS } from './ThemeRegistry';
import DefaultTransferCard from './plugins/DefaultTransferCard';
import { stripJunk } from '../../utils/markdownLite';
import { parseBilingual } from '../../utils/chatParser';
import { getImageMessageDisplayUrl,resolveOriginalImageUrl } from '../../utils/generatedImageStorage';
import {
    deleteAfterglowCustomMotif,
    loadAfterglowCustomMotifs,
    parseAfterglowMotifInput,
    saveAfterglowCustomMotifsFromText,
    sanitizeAfterglowMotif,
    type AfterglowCustomMotif,
    type AfterglowGenerationMode,
    type AfterglowGenerationOptions,
} from '../../utils/afterglowMotifs';
import XhsCard from './cards/XhsCard';
import CanvaCard from './cards/CanvaCard';
import SocialCard from './cards/SocialCard';
import SystemNoticeCard from './cards/SystemNoticeCard';
import PhoneEvidenceCard from './cards/PhoneEvidenceCard';
import StoryPhoneEvidenceCard from './cards/StoryPhoneEvidenceCard';
import RoomPlanCard from './cards/RoomPlanCard';
import RoomNoteCard from './cards/RoomNoteCard';
import FurnitureInteractionCard from './cards/FurnitureInteractionCard';
import VoiceCallSummaryCard from './cards/VoiceCallSummaryCard';
import ForwardCard from './cards/ForwardCard';
import WeChatMomentsCard from './cards/WeChatMomentsCard';
import SongShareCardBubble from './cards/SongShareCardBubble';
// SoulReflectionCard removed — soul_reflection messages are now hiddenFromUser and shown via immersive panel in Chat.tsx
import ChatBubble from './ChatBubble';
import InteractionPill from './InteractionPill';
import VoiceBubble from './VoiceBubble';
import { useSafeImageLoad } from './useSafeImageLoad';
const StatusCardRenderer = React.lazy(() => import('./StatusCardRenderer'));
const CLASSIC_INNER_VOICE_PREVIEW_THRESHOLD = 48;
const customCssTargetsBubbleShell = (css: string | undefined) => /\.sully-bubble-(?:user|ai)\b/.test(css || '');

type ImagePreviewState = {
    src: string;
    alt: string;
    summary?: string;
    isLoadingOriginal?: boolean;
};

type AfterglowAtom = {
    t: string;
    np: boolean;
    first?: boolean;
    kind?: 'paragraph' | 'heading' | 'snippet' | 'tail';
};

type AfterglowCoverMeta = {
    theme?: string;
    themeSource?: string;
    type?: string;
    tone?: string;
    snacks?: string[];
};

const escapeAfterglowHtml = (value: string): string =>
    (value || '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));

function splitAfterglowSentences(paragraph: string): string[] {
    const matcher = /[^。！？…]*[。！？…]+[”’"')）】\]]*/g;
    const sentences: string[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = matcher.exec(paragraph)) !== null) {
        sentences.push(match[0]);
        lastIndex = matcher.lastIndex;
    }

    if (lastIndex < paragraph.length) {
        const rest = paragraph.slice(lastIndex).trim();
        if (rest) sentences.push(rest);
    }

    return sentences.length ? sentences : [paragraph];
}

function renderAfterglowAtoms(list: AfterglowAtom[]): string {
    let paragraphs = '';
    let open = false;
    const closeParagraph = () => {
        if (open) {
            paragraphs += '</p>';
            open = false;
        }
    };

    list.forEach((atom, index) => {
        if (atom.kind === 'heading') {
            closeParagraph();
            paragraphs += `<div class="ag-section-heading">${escapeAfterglowHtml(atom.t)}</div>`;
            return;
        }

        if (atom.kind === 'snippet') {
            closeParagraph();
            paragraphs += `<div class="ag-snippet-heading">${escapeAfterglowHtml(atom.t)}</div>`;
            return;
        }

        if (atom.kind === 'tail') {
            closeParagraph();
            paragraphs += `<div class="ag-tail">${escapeAfterglowHtml(atom.t)}</div>`;
            return;
        }

        if (index === 0) {
            paragraphs += `<p class="${atom.np ? (atom.first ? 'ag-p ag-p--first' : 'ag-p') : 'ag-p ag-p--cont'}">`;
            open = true;
        } else if (atom.np) {
            closeParagraph();
            paragraphs += `<p class="${atom.first ? 'ag-p ag-p--first' : 'ag-p'}">`;
            open = true;
        }

        if (atom.first) {
            const first = atom.t.charAt(0);
            const rest = atom.t.slice(1);
            paragraphs += /[\u4e00-\u9fff]/.test(first)
                ? `<span class="ag-initial">${escapeAfterglowHtml(first)}</span>${escapeAfterglowHtml(rest)}`
                : escapeAfterglowHtml(atom.t);
        } else {
            paragraphs += escapeAfterglowHtml(atom.t);
        }
    });

    closeParagraph();
    const body = paragraphs;
    return body
        ? `<div class="ag-body-wrap"><div class="ag-body-rule"><i></i></div><div class="ag-body-copy">${body}</div></div>`
        : '';
}

function normalizeAfterglowCoverMeta(value: unknown): AfterglowCoverMeta | null {
    if (!value || typeof value !== 'object') return null;
    const meta = value as Record<string, unknown>;
    const clean = (input: unknown, maxLength = 42): string => {
        const text = String(input || '').replace(/\s+/g, ' ').trim();
        return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
    };
    const snacks = Array.isArray(meta.snacks)
        ? meta.snacks
            .map(item => clean(item, 16))
            .filter((item, index, list) => item && list.indexOf(item) === index)
            .slice(0, 3)
        : [];
    return {
        theme: clean(meta.theme),
        themeSource: clean(meta.themeSource, 18),
        type: clean(meta.type, 18),
        tone: clean(meta.tone, 18),
        snacks,
    };
}

function renderAfterglowCoverMeta(meta: AfterglowCoverMeta | null): string {
    if (!meta?.theme) return '';
    const source = meta.themeSource || '本轮主题';

    return `<div class="ag-seed" data-testid="afterglow-reader-core-seed">` +
        `<div class="ag-seed-label">${escapeAfterglowHtml(source)}</div>` +
        `<div class="ag-seed-value">${escapeAfterglowHtml(meta.theme)}</div>` +
        `</div>`;
}

function parseAfterglowRaw(rawInput: string, coverMeta: AfterglowCoverMeta | null): { title: string; coverHTML: string; atoms: AfterglowAtom[] } {
    const raw = String(rawInput || '').replace(/\r/g, '');
    const lines = raw.split('\n');
    const findLineIndex = (tester: (line: string) => boolean): number => {
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index].trim();
            if (line && tester(line)) return index;
        }
        return -1;
    };
    const findNextNonEmpty = (from: number): number => {
        for (let index = from; index < lines.length; index += 1) {
            if (lines[index].trim()) return index;
        }
        return -1;
    };

    const typeIndex = findLineIndex(line => /^🎭/.test(line));
    let title = '';
    let epigraphQuote = '';
    let epigraphSource = '';
    let epigraphIndex = -1;
    const titleIndex = findLineIndex(line => /^《.+?》/.test(line));

    if (titleIndex > -1) {
        title = (lines[titleIndex].trim().match(/^《\s*(.+?)\s*》/)?.[1] || '').trim();
        const nextLineIndex = findNextNonEmpty(titleIndex + 1);
        if (nextLineIndex > -1) {
            const line = lines[nextLineIndex].trim();
            if (line.length <= 100 && !/^〔/.test(line) && !/^━+$/.test(line) && !/^【/.test(line)) {
                epigraphIndex = nextLineIndex;
                const dividerMatch = line.match(/^(.+?)\s*[—–-]{1,}\s*(.+)$/);
                if (dividerMatch) {
                    epigraphQuote = dividerMatch[1].trim();
                    epigraphSource = dividerMatch[2].trim();
                } else {
                    epigraphQuote = line;
                }
            }
        }
    }

    const lastHeaderIndex = Math.max(typeIndex, titleIndex, epigraphIndex);
    let body = lastHeaderIndex >= 0 ? lines.slice(lastHeaderIndex + 1).join('\n') : raw;
    body = body.replace(/^\s+|\s+$/g, '');
    const bodyLines = body
        .split(/\n+/)
        .map(paragraph => paragraph.trim())
        .filter(paragraph => paragraph);

    const coverHTML =
        `<div class="ag-cover-wrap"><div class="ag-cover-inner">` +
        `<div class="ag-orn"><i></i></div>` +
        (title ? `<h1 class="ag-title">${escapeAfterglowHtml(title)}</h1>` : '') +
        `<div class="ag-orn ag-orn--sm"><i></i></div>` +
        (epigraphQuote
            ? `<div class="ag-ep"><div class="ag-ep-q">${escapeAfterglowHtml(epigraphQuote)}</div>${epigraphSource ? `<div class="ag-ep-s">${escapeAfterglowHtml(epigraphSource)}</div>` : ''}</div>`
            : '') +
        renderAfterglowCoverMeta(coverMeta) +
        `</div></div>`;

    const atoms: AfterglowAtom[] = [];
    bodyLines.forEach(line => {
        if (/^🎭/.test(line) || /^━+$/.test(line)) return;
        const snackDivider = line.match(/^——\s*(番外小料|小料|Side\s*Stories?)\s*——$/i);
        if (snackDivider) {
            atoms.push({ t: snackDivider[1], np: true, kind: 'heading' });
            return;
        }

        const snippetMatch = line.match(/^◆\s*〈(.+?)〉\s*$/);
        if (snippetMatch) {
            atoms.push({ t: snippetMatch[1].trim(), np: true, kind: 'snippet' });
            return;
        }

        const mainMatch = line.match(/^【(.+?)】\s*$/);
        if (mainMatch) {
            atoms.push({ t: mainMatch[1].trim(), np: true, kind: 'heading' });
            return;
        }

        const tailMatch = line.match(/^〔尾声〕\s*(.*)$/);
        if (tailMatch) {
            const tailText = tailMatch[1].trim();
            atoms.push({ t: tailText ? `尾声｜${tailText}` : '尾声', np: true, kind: 'tail' });
            return;
        }

        if (/^〔/.test(line)) return;

        splitAfterglowSentences(line).forEach((sentence, index) => {
            const text = sentence.trim();
            if (text) atoms.push({ t: text, np: index === 0 });
        });
    });

    const firstParagraphAtom = atoms.find(atom => !atom.kind);
    if (firstParagraphAtom) firstParagraphAtom.first = true;
    return { title, coverHTML, atoms };
}

export const AfterglowReaderModal: React.FC<{
    data: StatusCardData;
    onClose: () => void;
    brand?: string;
}> = ({ data, onClose, brand = '番外篇' }) => {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const pageRef = useRef<HTMLDivElement | null>(null);
    const coverMeta = useMemo(() => normalizeAfterglowCoverMeta(data.meta?.afterglowCover), [data.meta?.afterglowCover]);
    const { title, coverHTML, atoms } = useMemo(() => parseAfterglowRaw(data.body, coverMeta), [coverMeta, data.body]);
    const [pages, setPages] = useState<string[]>([coverHTML]);
    const [pageIndex, setPageIndex] = useState(0);
    const [direction, setDirection] = useState(1);

    const paginate = useCallback(() => {
        const page = pageRef.current;
        const stage = stageRef.current;
        if (!page || !stage) return;

        const measure = document.createElement('div');
        measure.className = 'afterglow-reader-page';
        const measureWidth = page.clientWidth || stage.clientWidth || 320;
        const measureHeight = page.clientHeight || stage.clientHeight || 420;
        Object.assign(measure.style, {
            position: 'absolute',
            visibility: 'hidden',
            pointerEvents: 'none',
            left: '-9999px',
            top: '0',
            width: `${measureWidth}px`,
            height: `${measureHeight}px`,
            overflow: 'hidden',
            whiteSpace: 'normal',
        });
        stage.appendChild(measure);

        const bodyPages: AfterglowAtom[][] = [];
        let currentAtoms: AfterglowAtom[] = [];

        atoms.forEach(atom => {
            currentAtoms.push(atom);
            measure.innerHTML = renderAfterglowAtoms(currentAtoms);
            if (measure.scrollHeight > measure.clientHeight + 2 && currentAtoms.length > 1) {
                currentAtoms.pop();
                bodyPages.push(currentAtoms.slice());
                currentAtoms = [atom];
            }
        });

        if (currentAtoms.length) bodyPages.push(currentAtoms.slice());
        stage.removeChild(measure);

        const nextPages = [coverHTML, ...bodyPages.map(renderAfterglowAtoms)];
        setPages(nextPages);
        setPageIndex(index => Math.min(index, nextPages.length - 1));
    }, [atoms, coverHTML]);

    useLayoutEffect(() => {
        paginate();
    }, [paginate]);

    useEffect(() => {
        setPageIndex(0);
    }, [data.body]);

    useEffect(() => {
        const handleResize = () => paginate();
        window.addEventListener('resize', handleResize);
        if (document.fonts?.ready) {
            document.fonts.ready.then(() => setTimeout(paginate, 0));
        }
        return () => window.removeEventListener('resize', handleResize);
    }, [paginate]);

    const go = useCallback((delta: number) => {
        setPageIndex(index => {
            const nextIndex = Math.min(Math.max(index + delta, 0), pages.length - 1);
            if (nextIndex !== index) setDirection(nextIndex > index ? 1 : -1);
            return nextIndex;
        });
    }, [pages.length]);

    const jump = useCallback((targetIndex: number) => {
        setPageIndex(index => {
            const nextIndex = Math.min(Math.max(targetIndex, 0), pages.length - 1);
            if (nextIndex !== index) setDirection(nextIndex > index ? 1 : -1);
            return nextIndex;
        });
    }, [pages.length]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            } else if (event.key === 'ArrowLeft') {
                go(-1);
            } else if (event.key === 'ArrowRight') {
                go(1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [go, onClose]);

    const touchStart = useRef({ x: 0, y: 0 });
    const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        touchStart.current = {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY,
        };
    };

    const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
        const dx = event.changedTouches[0].clientX - touchStart.current.x;
        const dy = event.changedTouches[0].clientY - touchStart.current.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            go(dx < 0 ? 1 : -1);
        }
    };

    const goPrev = (event?: React.MouseEvent) => {
        event?.stopPropagation();
        go(-1);
    };

    const goNext = (event?: React.MouseEvent) => {
        event?.stopPropagation();
        go(1);
    };

    const canGoPrev = pageIndex > 0;
    const canGoNext = pageIndex < pages.length - 1;

    return (
        <div
            data-testid="afterglow-reader-backdrop"
            className="afterglow-reader-backdrop"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                data-testid="afterglow-reader-shell"
                className="afterglow-reader-shell"
                role="dialog"
                aria-modal="true"
                aria-label="番外篇阅读器"
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    data-testid="afterglow-reader-close-button"
                    className="afterglow-reader-close"
                    aria-label="关闭番外篇"
                    title="关闭番外篇"
                    onClick={onClose}
                >
                    ✕
                </button>

                <div className="ag-head">
                    <div className="ag-brand">{pageIndex === 0 ? brand : title || brand}</div>
                </div>

                <div
                    className="afterglow-reader-stage"
                    ref={stageRef}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    <button
                        type="button"
                        data-testid="afterglow-reader-left-zone"
                        className="afterglow-reader-turn-zone afterglow-reader-turn-zone--left"
                        aria-label="上一页"
                        disabled={!canGoPrev}
                        onClick={goPrev}
                    />
                    <div
                        data-testid="afterglow-reader-page"
                        className="afterglow-reader-page"
                        ref={pageRef}
                        key={pageIndex}
                        data-dir={direction}
                        dangerouslySetInnerHTML={{ __html: pages[pageIndex] || '' }}
                    />
                    <button
                        type="button"
                        data-testid="afterglow-reader-right-zone"
                        className="afterglow-reader-turn-zone afterglow-reader-turn-zone--right"
                        aria-label="下一页"
                        disabled={!canGoNext}
                        onClick={goNext}
                    />
                </div>

                <footer className="ag-foot">
                    <button
                        type="button"
                        data-testid="afterglow-reader-prev"
                        className="ag-chev"
                        disabled={!canGoPrev}
                        aria-label="上一页"
                        onClick={goPrev}
                    >
                        ‹
                    </button>
                    <div className="ag-ind" data-testid="afterglow-reader-counter">
                        {pages.length <= 7 ? (
                            pages.map((_, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    className={`ag-dot${index === pageIndex ? ' on' : ''}`}
                                    aria-label={`第 ${index + 1} 页`}
                                    onClick={() => jump(index)}
                                />
                            ))
                        ) : (
                            <span className="ag-count">
                                {pageIndex + 1} / {pages.length}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        data-testid="afterglow-reader-next"
                        className="ag-chev"
                        disabled={!canGoNext}
                        aria-label="下一页"
                        onClick={goNext}
                    >
                        ›
                    </button>
                </footer>
            </section>
        </div>
    );
};

// --- Deduplicated Selection Checkbox ---
const SelectionCheckbox: React.FC<{ isSelected: boolean; onToggle: () => void }> = ({ isSelected, onToggle }) => (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer z-20" onClick={onToggle}>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-slate-300 bg-white/80'}`}>
            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
        </div>
    </div>
);

/** Format timestamp in WeChat style: today → "上午 10:30", this year → "3月4日 上午 10:30", other → with year */
const formatWeChatTime = (ts: number): string => {
    const now = new Date();
    const d = new Date(ts);
    const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (d.toDateString() === now.toDateString()) return timeStr;
    if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`;
};

interface MessageItemProps {
    msg: Message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    activeTheme: ChatTheme;
    charAvatar: string;
    charName: string;
    userAvatar: string;
    onLongPress: (m: Message) => void;
    selectionMode: boolean;
    isSelected: boolean;
    onToggleSelect: (id: number) => void;
    // Translation (AI messages only, bilingual content parsed from %%BILINGUAL%%)
    translationEnabled?: boolean;
    isShowingTarget?: boolean;
    onTranslateToggle?: (msgId: number) => void;
    // Transfer card actions
    onTransferAction?: (msg: Message) => void;
    // Timestamp separator (computed by parent Chat.tsx)
    showTimestamp?: boolean;
    timestampValue?: number;
    // Voice playback
    onPlayVoice?: (msgId: number) => void;
    onStopVoice?: () => void;
    onRetryVoice?: (msgId: number) => void;
    playingMsgId?: number | null;
    loadingMsgIds?: Set<number>;
    // Voice transcript
    isVoiceTextExpanded?: boolean;
    onToggleVoiceText?: (msgId: number) => void;
    // Inner voice (心声) / Creative Card (创意状态栏)
    innerVoice?: string;
    statusCardData?: StatusCardData;
    onRetryInnerVoice?: () => void;
    afterglowCardData?: StatusCardData;
    isAfterglowLoading?: boolean;
    onRequestAfterglow?: (message: Message, options?: AfterglowGenerationOptions) => Promise<StatusCardData | null>;
    onOpenStoryPhone?: (message: Message) => void;
    onUserAvatarAction?: (message: Message) => void;
    isUserAvatarActionLoading?: boolean;
    // Thinking chain visibility
    showThinking?: boolean;
}

const MessageItem = React.memo(({
    msg: m,
    isLastInGroup,
    activeTheme,
    charAvatar,
    charName,
    userAvatar,
    onLongPress,
    selectionMode,
    isSelected,
    onToggleSelect,
    translationEnabled,
    isShowingTarget,
    onTranslateToggle,
    onTransferAction,
    showTimestamp,
    timestampValue,
    onPlayVoice,
    onStopVoice,
    onRetryVoice,
    playingMsgId,
    loadingMsgIds,
    isVoiceTextExpanded,
    onToggleVoiceText,
    innerVoice,
    statusCardData,
    onRetryInnerVoice,
    afterglowCardData,
    isAfterglowLoading,
    onRequestAfterglow,
    onOpenStoryPhone,
    onUserAvatarAction,
    isUserAvatarActionLoading,
    showThinking,
}: MessageItemProps) => {
    const isUser = m.role === 'user';
    const isSystem = m.role === 'system';
    const marginBottom = isLastInGroup ? 'mb-4' : 'mb-2';
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPos = useRef({ x: 0, y: 0 }); // Track touch start position
    const [showInnerVoice, setShowInnerVoice] = useState(false);
    const [isClassicInnerVoiceExpanded, setIsClassicInnerVoiceExpanded] = useState(false);
    const [showAfterglow, setShowAfterglow] = useState(false);
    const [localAfterglowCard, setLocalAfterglowCard] = useState<StatusCardData | null>(null);
    const [showAfterglowComposer, setShowAfterglowComposer] = useState(false);
    const [afterglowComposerMode, setAfterglowComposerMode] = useState<AfterglowGenerationMode>('fanfic');
    const [afterglowMotifDraft, setAfterglowMotifDraft] = useState('');
    const [saveMotifToPool, setSaveMotifToPool] = useState(false);
    const [customAfterglowMotifs, setCustomAfterglowMotifs] = useState<AfterglowCustomMotif[]>([]);
    const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
    const imagePreviewRequestRef = useRef(0);

    const styleConfig = isUser ? activeTheme.user : activeTheme.ai;
    const allowBubbleCssOverride = customCssTargetsBubbleShell(activeTheme.customCss);
    const imageSrc = m.type === 'image' ? String(m.content || '').trim() : '';
    const thumbnailSrc = m.type === 'image' ? getImageMessageDisplayUrl(m).trim() : '';
    const imageDisplaySrc = thumbnailSrc || imageSrc;
    const imageDisplayKey = m.type === 'image' ? `${m.id}:${imageDisplaySrc}` : '';
    const safeImage = useSafeImageLoad(imageDisplaySrc, imageDisplayKey);
    const emojiSrc = m.type === 'emoji' ? String(m.content || '').trim() : '';
    const safeEmoji = useSafeImageLoad(emojiSrc, m.type === 'emoji' ? `${m.id}:${emojiSrc}` : '');

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        // Record initial position
        if ('touches' in e) {
            startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            startPos.current = { x: e.clientX, y: e.clientY };
        }

        longPressTimer.current = setTimeout(() => {
            if (!selectionMode) {
                haptic.heavy();
                onLongPress(m);
            }
        }, 600);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    // New handler to cancel long press if user drags/scrolls
    const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!longPressTimer.current) return;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const diffX = Math.abs(clientX - startPos.current.x);
        const diffY = Math.abs(clientY - startPos.current.y);

        // If moved more than 10px, assume scrolling and cancel long press
        if (diffX > 10 || diffY > 10) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        if (selectionMode) {
            e.stopPropagation();
            e.preventDefault();
            onToggleSelect(m.id);
        }
    };

    const interactionProps = {
        onMouseDown: handleTouchStart,
        onMouseUp: handleTouchEnd,
        onMouseLeave: handleTouchEnd,
        onMouseMove: handleMove,
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd,
        onTouchMove: handleMove,
        onTouchCancel: handleTouchEnd, // Handle system interruptions
        onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault();
            if (!selectionMode) onLongPress(m);
        },
        onClick: handleClick
    };

    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    // Reusable timestamp separator element (only rendered when showTimestamp is true)
    const timestampSeparator = showTimestamp && timestampValue ? (
        <div className="sully-msg-timestamp flex justify-center w-full py-2">
            <span className="text-[11px] text-gray-400">{formatWeChatTime(timestampValue)}</span>
        </div>
    ) : null;

    const trimmedInnerVoice = innerVoice?.trim() || '';
    const hasClassicInnerVoice = trimmedInnerVoice.length > 0;
    const hasAnyVoice = hasClassicInnerVoice || !!statusCardData;
    const visibleAfterglowCard = localAfterglowCard || afterglowCardData || null;
    const showClassicInnerVoiceToggle = !statusCardData && trimmedInnerVoice.length > CLASSIC_INNER_VOICE_PREVIEW_THRESHOLD;
    const hasAfterglowMotifDraft = sanitizeAfterglowMotif(afterglowMotifDraft).length > 0;
    const hasMotifsToAdd = parseAfterglowMotifInput(afterglowMotifDraft).length > 0;
    const isAfterglowHeartTalkMode = afterglowComposerMode === 'heartTalk';

    const handleAvatarClick = () => {
        if (!hasAnyVoice || selectionMode) return;
        setShowInnerVoice(prev => !prev);
    };

    const openAfterglowComposer = (event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        if (isAfterglowLoading || selectionMode) return;

        if (!onRequestAfterglow) {
            if (visibleAfterglowCard) setShowAfterglow(true);
            return;
        }

        setCustomAfterglowMotifs(loadAfterglowCustomMotifs());
        setShowAfterglowComposer(true);
    };

    const requestAfterglow = async (options?: AfterglowGenerationOptions) => {
        if (!onRequestAfterglow || isAfterglowLoading || selectionMode) return;

        try {
            setShowAfterglowComposer(false);
            setShowAfterglow(false);
            const card = await onRequestAfterglow(m, options);
            if (card) {
                setLocalAfterglowCard(card);
                setShowAfterglow(true);
            }
        } catch (error) {
            console.error('[Afterglow] request failed:', error);
        }
    };

    const handleAddMotifsToPool = () => {
        if (parseAfterglowMotifInput(afterglowMotifDraft).length === 0) return;
        const next = saveAfterglowCustomMotifsFromText(afterglowMotifDraft);
        setCustomAfterglowMotifs(next);
        setSaveMotifToPool(false);
    };

    const handleDeleteCustomMotif = (id: string) => {
        setCustomAfterglowMotifs(deleteAfterglowCustomMotif(id));
    };

    const handleGenerateRandomAfterglow = () => {
        const customMotifs = customAfterglowMotifs.map(motif => motif.text);
        requestAfterglow(customMotifs.length > 0 ? { customMotifs } : {});
    };

    const handleGenerateWithMotif = () => {
        const userMotif = sanitizeAfterglowMotif(afterglowMotifDraft);
        if (!userMotif) {
            if (!isAfterglowHeartTalkMode) handleGenerateRandomAfterglow();
            return;
        }

        if (isAfterglowHeartTalkMode) {
            requestAfterglow({
                mode: 'heartTalk',
                userMotif,
            });
            return;
        }

        const nextMotifs = saveMotifToPool
            ? saveAfterglowCustomMotifsFromText(afterglowMotifDraft)
            : customAfterglowMotifs;
        if (saveMotifToPool) {
            setCustomAfterglowMotifs(nextMotifs);
            setSaveMotifToPool(false);
        }

        requestAfterglow({
            userMotif,
            customMotifs: nextMotifs.map(motif => motif.text),
        });
    };

    const closeImagePreview = () => {
        imagePreviewRequestRef.current += 1;
        setImagePreview(null);
    };

    useEffect(() => {
        if (!showInnerVoice) {
            setIsClassicInnerVoiceExpanded(false);
        }
    }, [showInnerVoice, trimmedInnerVoice]);

    useEffect(() => {
        if (!imagePreview) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                imagePreviewRequestRef.current += 1;
                setImagePreview(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [imagePreview]);

    useEffect(() => () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const renderAvatar = (src: string, isCharAvatar = false) => {
        const isUserActionAvatar = !isCharAvatar && isUser && !!onUserAvatarAction;
        return (
        <div
            className={`relative w-9 h-9 shrink-0 z-0 ${(isCharAvatar && hasAnyVoice) || isUserActionAvatar ? 'cursor-pointer' : ''}`}
            onClick={isCharAvatar ? handleAvatarClick : isUserActionAvatar ? (event) => {
                event.stopPropagation();
                if (!selectionMode) onUserAvatarAction?.(m);
            } : undefined}
        >
            <img
                src={src}
                className="w-full h-full rounded-[4px] object-cover bg-slate-200 pointer-events-none select-none"
                alt="avatar"
                loading="lazy"
                decoding="async"
            />
            {styleConfig.avatarDecoration && (
                <img
                    src={styleConfig.avatarDecoration}
                    className="absolute pointer-events-none z-10 max-w-none"
                    style={{
                        left: `${styleConfig.avatarDecorationX ?? 50}%`,
                        top: `${styleConfig.avatarDecorationY ?? 50}%`,
                        width: `${36 * (styleConfig.avatarDecorationScale ?? 1)}px`,
                        height: 'auto',
                        transform: `translate(-50%, -50%) rotate(${styleConfig.avatarDecorationRotate ?? 0}deg)`,
                    }}
                />
            )}
            {isCharAvatar && !showInnerVoice && (hasAnyVoice || onRequestAfterglow || onOpenStoryPhone || (!hasAnyVoice && onRetryInnerVoice)) && (
                <div className="absolute -top-1 -right-1 z-20 flex items-center gap-0.5">
                    {onOpenStoryPhone ? (
                        <button
                            type="button"
                            className="flex h-4 w-4 items-center justify-center bg-transparent p-0 text-red-500 drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)] transition-transform active:scale-90"
                            aria-label={`查看${charName}的手机`}
                            title={`查看${charName}的手机`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenStoryPhone(m);
                            }}
                        >
                            <DeviceMobileCamera className="h-2.5 w-2.5" weight="bold" />
                        </button>
                    ) : onRequestAfterglow ? (
                        <button
                            type="button"
                            className="flex h-4 w-4 items-center justify-center bg-transparent p-0 text-amber-300 drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)] transition-transform active:scale-90 disabled:cursor-wait disabled:opacity-80"
                            aria-label="生成番外篇"
                            title="生成番外篇"
                            disabled={isAfterglowLoading}
                            onClick={openAfterglowComposer}
                        >
                            <Sparkle className={`h-2.5 w-2.5 ${isAfterglowLoading ? 'animate-spin' : ''}`} weight="bold" />
                        </button>
                    ) : hasAnyVoice ? (
                        <button
                            type="button"
                            className="flex h-4 w-4 items-center justify-center bg-transparent p-0 transition-transform active:scale-90"
                            style={{ filter: statusCardData ? 'drop-shadow(0 1px 2px rgba(100,60,180,0.4))' : 'drop-shadow(0 1px 2px rgba(180,60,60,0.3))' }}
                            aria-label={statusCardData ? '打开状态卡片' : '打开心声卡片'}
                            title={statusCardData ? '打开状态卡片' : '打开心声卡片'}
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowInnerVoice(true);
                            }}
                        >
                            {statusCardData
                                ? <span style={{ fontSize: '10px', lineHeight: 1 }}>🎴</span>
                                : <svg viewBox="0 0 24 24" fill="#c44d4d" className="h-2.5 w-2.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                            }
                        </button>
                    ) : !hasAnyVoice && onRetryInnerVoice ? (
                        <button
                            type="button"
                            className="flex h-4 w-4 items-center justify-center bg-transparent p-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)] transition-transform active:scale-90"
                            onClick={(e) => { e.stopPropagation(); onRetryInnerVoice(); }}
                            title="重试生成心声"
                            aria-label="重试生成心声"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="#d4a547" strokeWidth="2.5" className="h-2.5 w-2.5">
                                <path d="M1 4v6h6" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    ) : null}
                </div>
            )}
            {isUserActionAvatar && isUserAvatarActionLoading && (
                <span className="absolute -right-1 -top-1 z-20 h-3.5 w-3.5 rounded-full border-2 border-white border-t-[#c47770] bg-white shadow-sm animate-spin" />
            )}
        </div>
    );
    };

    // --- SYSTEM MESSAGE RENDERING ---
    if (isSystem) {
        // Clean up text: remove [System:] or [系统:] prefix for display
        const displayText = m.content.replace(/^\[(System|系统|System Log|系统记录)\s*[:：]?\s*/i, '').replace(/\]$/, '').trim();

        // Route to structured card if metadata.source is available
        // Priority: StoryPhoneEvidenceCard > PhoneEvidenceCard > RoomPlanCard (todo) > RoomNoteCard (notebook) > SystemNoticeCard > Legacy pill
        let noticeCard: React.ReactNode = null;
        if (m.metadata?.source === 'story_phone') {
            noticeCard = <StoryPhoneEvidenceCard message={m} />;
        } else if (m.metadata?.source === 'phone' && m.metadata?.phoneTitle) {
            // Phone evidence with structured data → render as app-simulation card
            noticeCard = <PhoneEvidenceCard message={m} charName={charName} charAvatar={charAvatar} />;
        } else if (m.metadata?.source === 'room' && m.metadata?.roomEvent === 'todo') {
            // Room daily plan → collage journal style card
            noticeCard = <RoomPlanCard message={m} />;
        } else if (m.metadata?.source === 'room' && m.metadata?.roomEvent === 'notebook') {
            // Room private notebook → intimate note card
            noticeCard = <RoomNoteCard message={m} />;
        } else if (m.metadata?.source === 'room' && m.metadata?.roomEvent === 'item_interaction') {
            // Room furniture touch → Morandi glassmorphism feedback card
            noticeCard = <FurnitureInteractionCard message={m} />;
        } else if (m.metadata?.source === 'voicecall' || m.type === 'call_log') {
            // Voice call log → expandable call summary card
            noticeCard = <VoiceCallSummaryCard message={m} />;
        } else if (m.metadata?.source) {
            // Other tagged sources (room item_interaction, schedule, bank) → styled notice card
            noticeCard = <SystemNoticeCard message={m} displayText={displayText} />;
        }

        return (
            <>
                {timestampSeparator}
                <div className={`flex flex-col items-center w-full ${selectionMode ? 'pl-8' : ''} animate-fade-in relative transition-[padding] duration-300`}>
                    {selectionMode && <SelectionCheckbox isSelected={isSelected} onToggle={() => onToggleSelect(m.id)} />}
                    {!showTimestamp && <div className="text-[10px] text-slate-400 mt-4 mb-0.5 opacity-70">{formatTime(m.timestamp)}</div>}
                    <div className="flex justify-center mb-4 px-10 w-full" {...interactionProps}>
                        {noticeCard || (
                            /* Fallback: Legacy grey pill for untagged system messages */
                            <div className="sully-system-pill flex items-center gap-1.5 bg-slate-200/40 backdrop-blur-md text-slate-500 px-3 py-1 rounded-full shadow-sm border border-white/20 select-none cursor-pointer active:scale-95 transition-transform">
                                {displayText.includes('任务') ? '✨' :
                                    displayText.includes('纪念日') || displayText.includes('Event') ? '📅' :
                                        displayText.includes('转账') ? '💰' : '🔔'}
                                <span className="text-[10px] font-medium tracking-wide">{displayText}</span>
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    }

    if (m.type === 'interaction') {
        return (
            <>
                {timestampSeparator}
                <div className={`flex flex-col items-center ${marginBottom} w-full animate-fade-in relative transition-[padding] duration-300 ${selectionMode ? 'pl-8' : ''}`}>
                    {selectionMode && <SelectionCheckbox isSelected={isSelected} onToggle={() => onToggleSelect(m.id)} />}
                    {!showTimestamp && <div className="text-[10px] text-slate-400 mb-1 opacity-70">{formatTime(m.timestamp)}</div>}
                    <div {...interactionProps}>
                        <InteractionPill isUser={isUser} charName={charName} />
                    </div>
                </div>
            </>
        );
    }

    // ═══ LifeStream Fragment — iOS minimal timeline card ═══
    if ((m.type as string) === 'lifestream') {
        return (
            <>
                {timestampSeparator}
                <div className={`flex justify-center ${marginBottom} w-full animate-fade-in relative transition-[padding] duration-300 ${selectionMode ? 'pl-8' : ''}`}>
                    {selectionMode && <SelectionCheckbox isSelected={isSelected} onToggle={() => onToggleSelect(m.id)} />}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                            maxWidth: '75%',
                            padding: '8px 14px',
                            borderRadius: '10px',
                            background: 'rgba(120, 120, 128, 0.06)',
                            border: '0.5px solid rgba(120, 120, 128, 0.12)',
                        }}
                        {...interactionProps}
                    >
                        {/* Left accent line */}
                        <div style={{
                            width: '2px',
                            minHeight: '100%',
                            borderRadius: '1px',
                            background: 'rgba(120, 120, 128, 0.2)',
                            flexShrink: 0,
                            marginTop: '2px',
                        }} />
                        <div style={{
                            fontSize: '12px',
                            lineHeight: '1.5',
                            color: 'rgba(142, 142, 147, 0.9)',
                            fontWeight: 400,
                            letterSpacing: '0.01em',
                        }}>
                            {m.content}
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // Soul Reflection — no longer rendered in chat flow (hiddenFromUser: true, shown via immersive panel)

    const commonLayout = (content: React.ReactNode) => (
        <>
            {timestampSeparator}
            <div className={`flex items-start ${isUser ? 'justify-end' : 'justify-start'} ${marginBottom} px-3 group select-none relative transition-[padding] duration-300 ${selectionMode ? (isUser ? 'pr-14' : 'pl-14') : ''}`}>
                {selectionMode && <SelectionCheckbox isSelected={isSelected} onToggle={() => onToggleSelect(m.id)} />}

                {/* Avatar for AI */}
                {!isUser && renderAvatar(charAvatar, true)}

                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[70%] min-w-0 mx-2.5`} {...interactionProps}>
                    <div className={`${selectionMode ? 'pointer-events-none' : ''} relative w-full`}>
                        {content}
                    </div>
                    {/* Inner Voice / Creative Card Floating Overlay */}
                    {!isUser && showInnerVoice && hasAnyVoice && ReactDOM.createPortal(
                        <div
                            data-testid="inner-voice-backdrop"
                            className="fixed inset-0 z-[9999] overflow-y-auto px-4 py-6 transition-opacity duration-300 animate-fade-in sm:px-6 sm:py-10"
                            style={{
                                backgroundColor: 'transparent',
                            }}
                            onClick={() => setShowInnerVoice(false)}
                        >
                            <button
                                type="button"
                                data-testid="inner-voice-close-button"
                                aria-label="关闭心声卡片"
                                title="关闭心声卡片"
                                className="fixed z-[10000] flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-slate-950/45 text-white shadow-[0_10px_30px_rgba(15,23,42,0.24)] backdrop-blur-md transition-all duration-200 hover:bg-slate-950/60 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/35"
                                style={{
                                    top: 'max(18px, env(safe-area-inset-top))',
                                    right: 'max(18px, env(safe-area-inset-right))',
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowInnerVoice(false);
                                }}
                            >
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    className="h-5 w-5"
                                >
                                    <path
                                        d="M6.75 6.75l10.5 10.5M17.25 6.75l-10.5 10.5"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </button>
                            <div className="flex min-h-full flex-col items-center">
                                <div
                                    data-testid={statusCardData ? 'status-card-overlay-shell' : 'inner-voice-overlay-shell'}
                                    className={`relative my-auto flex w-full flex-col items-center justify-center ${
                                        statusCardData
                                            ? 'animate-status-card-in'
                                            : 'animate-inner-voice-in'
                                    }`}
                                    style={{
                                        maxWidth: statusCardData ? 'min(96vw, 560px)' : 'min(88vw, 360px)',
                                        height: statusCardData ? 'calc(100vh - 48px)' : undefined,
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {statusCardData ? (
                                        /* ═══ Creative Card Mode ═══ */
                                        <React.Suspense fallback={<div style={{ color: '#fff', textAlign: 'center', padding: '40px' }}>加载中...</div>}>
                                            <StatusCardRenderer data={statusCardData} />
                                        </React.Suspense>
                                    ) : hasClassicInnerVoice ? (
                                        /* ═══ Classic Inner Voice — Premium Art Gallery Card ═══ */
                                        <div className="relative" style={{
                                            background: '#F9F8F4',
                                            borderRadius: '3px',
                                            boxShadow: '0 30px 60px -15px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(255,255,255,0.7)',
                                            transform: 'rotate(-1.5deg)',
                                            padding: '18px',
                                            paddingBottom: '24px',
                                            maxHeight: 'calc(100vh - 48px)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                        }}>
                                            <div className="absolute inset-0 pointer-events-none rounded-[3px]" style={{
                                                opacity: 0.15,
                                                mixBlendMode: 'color-burn',
                                                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                                                backgroundSize: '128px 128px',
                                            }} />
                                            <div className="relative w-full aspect-[4/3] bg-[#E8E6DF] z-10" style={{
                                                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)',
                                                border: '1px solid rgba(0,0,0,0.05)',
                                            }}>
                                                <img
                                                    src={`/images/inner-voice/${(() => {
                                                        const str = trimmedInnerVoice || String(m.id ?? 0);
                                                        let hash = 0;
                                                        for (let i = 0; i < str.length; i++) {
                                                            hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
                                                        }
                                                        return (((hash % 11) + 11) % 11) + 1;
                                                    })()}.jpg`}
                                                    alt=""
                                                    style={{
                                                        width: '100%', height: '100%',
                                                        objectFit: 'cover', objectPosition: 'center',
                                                        display: 'block',
                                                        filter: 'contrast(0.95) sepia(15%) opacity(0.95)',
                                                    }}
                                                    decoding="async"
                                                />
                                                {(() => {
                                                    const POSTMARKS = [
                                                        { file: 'postmark.png',  w: 85, h: 85, rotate: -25, bottom: -7, right: -5  },
                                                        { file: 'postmark2.png', w: 78, h: 90, rotate: -15, bottom: -8, right: -3  },
                                                        { file: 'postmark3.png', w: 80, h: 80, rotate: -30, bottom: -6, right: -4  },
                                                        { file: 'postmark4.png', w: 90, h: 75, rotate: -20, bottom: -5, right: -6  },
                                                    ];
                                                    const idx = Math.abs((m.id ?? 0)) % POSTMARKS.length;
                                                    const pm = POSTMARKS[idx];
                                                    return (
                                                        <div className="absolute pointer-events-none" style={{
                                                            bottom: `${pm.bottom}px`, right: `${pm.right}px`,
                                                            width: `${pm.w}px`, height: `${pm.h}px`,
                                                            opacity: 0.55, mixBlendMode: 'multiply',
                                                            transform: `rotate(${pm.rotate}deg)`, filter: 'contrast(1.2)',
                                                        }}>
                                                            <img src={`/images/decorations/${pm.file}`} alt="postmark" className="w-full h-full object-contain" />
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                            <div className="w-full mt-7 mb-4 flex items-center justify-center relative z-10">
                                                <div className="text-[10px] tracking-[0.4em] text-[#8C8273] font-serif uppercase">Inner Voice</div>
                                            </div>
                                            <div className="relative z-10 px-2" style={{
                                                color: '#2A2520', fontSize: '16px', lineHeight: '2.0',
                                                fontFamily: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif",
                                                letterSpacing: '1px', textAlign: 'center', whiteSpace: 'pre-wrap',
                                                minHeight: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                                flex: isClassicInnerVoiceExpanded ? '1 1 auto' : undefined,
                                                minWidth: 0,
                                            }}>
                                                <div
                                                    data-testid="classic-inner-voice-scroll-area"
                                                    style={{
                                                        maxHeight: isClassicInnerVoiceExpanded ? 'calc(100vh - 120px)' : undefined,
                                                        overflowY: isClassicInnerVoiceExpanded ? 'auto' : 'visible',
                                                        paddingRight: isClassicInnerVoiceExpanded ? '6px' : undefined,
                                                    }}
                                                >
                                                    <div
                                                        data-testid="classic-inner-voice-text"
                                                        style={isClassicInnerVoiceExpanded ? undefined : {
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: 3,
                                                            WebkitBoxOrient: 'vertical',
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        {trimmedInnerVoice}
                                                    </div>
                                                </div>
                                                {showClassicInnerVoiceToggle ? (
                                                    <button
                                                        type="button"
                                                        data-testid="classic-inner-voice-toggle"
                                                        className="mt-3 self-center text-[11px] tracking-[0.18em] text-[#8C8273] font-serif uppercase transition-opacity hover:opacity-75"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setIsClassicInnerVoiceExpanded(prev => !prev);
                                                        }}
                                                    >
                                                        {isClassicInnerVoiceExpanded ? '收起全文' : '展开全文'}
                                                    </button>
                                                ) : null}
                                            </div>
                                            <div className="w-full mt-6 pt-4 border-t border-[#8C8273]/20 flex justify-between items-end relative z-10">
                                                <span className="text-[9px] text-[#A69D8F] font-serif tracking-[0.2em] uppercase">
                                                    Vol.{String((m.id ?? 0) % 100).padStart(2, '0')}
                                                </span>
                                                <span className="text-[9px] text-[#A69D8F] font-serif tracking-[0.2em] uppercase">
                                                    {(() => {
                                                        const d = new Date(m.timestamp);
                                                        const months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
                                                        return `${months[d.getMonth()]} ${d.getDate()}`;
                                                    })()}
                                                </span>
                                            </div>
                                            <div className="absolute top-0 right-0 w-12 h-12 pointer-events-none rounded-tr-[3px]" style={{
                                                background: 'linear-gradient(225deg, rgba(0,0,0,0.02) 0%, transparent 50%)',
                                            }}></div>
                                        </div>
                                    ) : null}

                                </div>
                            </div>
                            <div
                                data-testid="inner-voice-close-hint"
                                className="pointer-events-none fixed inset-x-0 bottom-8 flex justify-center opacity-60 sm:bottom-10"
                            >
                                <div className="text-[10px] text-white/90 font-serif tracking-widest px-3 py-1 rounded-full border border-white/20 bg-black/20 backdrop-blur-sm">
                                    TAP ANYWHERE TO CLOSE
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                    {!isUser && showAfterglow && visibleAfterglowCard && ReactDOM.createPortal(
                        <AfterglowReaderModal
                            data={visibleAfterglowCard}
                            onClose={() => setShowAfterglow(false)}
                        />,
                        document.body
                    )}
                    {!isUser && showAfterglowComposer && ReactDOM.createPortal(
                        <div
                            data-testid="afterglow-composer-backdrop"
                            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/35 px-3 pb-4 pt-12 backdrop-blur-sm sm:items-center sm:p-6"
                            onClick={() => setShowAfterglowComposer(false)}
                        >
                            <div
                                data-testid="afterglow-composer-dialog"
                                role="dialog"
                                aria-modal="true"
                                aria-label="番外篇命题"
                                className="w-full max-w-md overflow-hidden rounded-2xl border border-white/70 bg-[#fffaf2] shadow-2xl"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <div className="flex items-center justify-between border-b border-[#eadcc8] px-4 py-3">
                                    <div>
                                        <div className="text-[13px] font-bold tracking-[0.18em] text-[#7a4b22]">番外篇命题</div>
                                        <div className="mt-0.5 text-[11px] text-[#a2774d]">番外篇</div>
                                    </div>
                                    <button
                                        type="button"
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-[#8a6849] transition-colors hover:bg-[#eadcc8]/70"
                                        aria-label="关闭番外篇命题"
                                        onClick={() => setShowAfterglowComposer(false)}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="space-y-3 px-4 py-4">
                                    <div className="grid grid-cols-2 rounded-xl border border-[#e3d1bb] bg-white/65 p-1">
                                        <button
                                            type="button"
                                            className={`min-h-8 rounded-lg px-2 text-[12px] font-bold transition ${!isAfterglowHeartTalkMode ? 'bg-[#2d2118] text-[#ffe4bb] shadow-sm' : 'text-[#81552f] hover:bg-[#fff4e4]'}`}
                                            onClick={() => setAfterglowComposerMode('fanfic')}
                                        >
                                            写番外
                                        </button>
                                        <button
                                            type="button"
                                            className={`min-h-8 rounded-lg px-2 text-[12px] font-bold transition ${isAfterglowHeartTalkMode ? 'bg-[#2d2118] text-[#ffe4bb] shadow-sm' : 'text-[#81552f] hover:bg-[#fff4e4]'}`}
                                            onClick={() => {
                                                setAfterglowComposerMode('heartTalk');
                                                setSaveMotifToPool(false);
                                            }}
                                        >
                                            谈心
                                        </button>
                                    </div>

                                    <textarea
                                        data-testid="afterglow-motif-input"
                                        value={afterglowMotifDraft}
                                        onChange={(event) => setAfterglowMotifDraft(event.target.value)}
                                        rows={4}
                                        maxLength={600}
                                        className="w-full resize-none rounded-xl border border-[#e3d1bb] bg-white/80 p-3 text-[13px] leading-6 text-[#4b3324] outline-none transition focus:border-[#b77b45] focus:ring-2 focus:ring-[#f0d2ad]"
                                        placeholder={isAfterglowHeartTalkMode ? '把想跟 ta 聊的话写在这里' : '例如：雨夜误会、他听见你梦话、一封没寄出的信'}
                                    />

                                    {!isAfterglowHeartTalkMode && (
                                        <label className="flex items-center gap-2 text-[12px] font-medium text-[#7c5a3d]">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 accent-[#9b5f2f]"
                                                checked={saveMotifToPool}
                                                onChange={(event) => setSaveMotifToPool(event.target.checked)}
                                            />
                                            同时存入随机池
                                        </label>
                                    )}

                                    <div className={`grid gap-2 ${isAfterglowHeartTalkMode ? (visibleAfterglowCard ? 'grid-cols-2' : 'grid-cols-1') : (visibleAfterglowCard ? 'grid-cols-2' : 'grid-cols-3')}`}>
                                        {visibleAfterglowCard && (
                                            <button
                                                type="button"
                                                className="flex min-h-10 items-center justify-center rounded-xl border border-[#dbc4a9] bg-white px-2 text-[12px] font-bold text-[#81552f] transition hover:bg-[#fff4e4]"
                                                onClick={() => {
                                                    setShowAfterglowComposer(false);
                                                    setShowAfterglow(true);
                                                }}
                                            >
                                                打开已有
                                            </button>
                                        )}
                                        {!isAfterglowHeartTalkMode && (
                                            <button
                                                type="button"
                                                className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#dbc4a9] bg-white px-2 text-[12px] font-bold text-[#81552f] transition hover:bg-[#fff4e4] disabled:cursor-wait disabled:opacity-60"
                                                disabled={isAfterglowLoading}
                                                onClick={handleGenerateRandomAfterglow}
                                            >
                                                <Sparkle className="h-3.5 w-3.5" weight="bold" />
                                                随机生成
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="min-h-10 rounded-xl bg-[#2d2118] px-2 text-[12px] font-bold text-[#ffe4bb] transition hover:bg-[#3b2b1f] disabled:cursor-not-allowed disabled:opacity-45"
                                            disabled={isAfterglowLoading || !hasAfterglowMotifDraft}
                                            onClick={handleGenerateWithMotif}
                                        >
                                            {isAfterglowHeartTalkMode ? '开始谈心' : '按这个梗生成'}
                                        </button>
                                        {!isAfterglowHeartTalkMode && (
                                            <button
                                                type="button"
                                                className="min-h-10 rounded-xl border border-dashed border-[#c79f75] bg-[#fff7ea] px-2 text-[12px] font-bold text-[#8f5b2e] transition hover:bg-[#ffedcf] disabled:cursor-not-allowed disabled:opacity-45"
                                                disabled={!hasMotifsToAdd}
                                                onClick={handleAddMotifsToPool}
                                            >
                                                加入随机池
                                            </button>
                                        )}
                                    </div>

                                    {!isAfterglowHeartTalkMode && (
                                        <div className="rounded-xl border border-[#eadcc8] bg-white/55 p-3">
                                            <div className="mb-2 flex items-center justify-between text-[11px] font-bold tracking-[0.12em] text-[#9c7148]">
                                                <span>随机池</span>
                                                <span>{customAfterglowMotifs.length}</span>
                                            </div>
                                            {customAfterglowMotifs.length > 0 ? (
                                                <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                                                    {customAfterglowMotifs.map(motif => (
                                                        <div key={motif.id} className="flex items-start gap-2 rounded-lg bg-[#fffaf2] px-2 py-1.5 text-[12px] text-[#5a3a24]">
                                                            <span className="min-w-0 flex-1 break-words leading-5">{motif.text}</span>
                                                            <button
                                                                type="button"
                                                                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#a58062] hover:bg-[#eadcc8] hover:text-[#6a3f1f]"
                                                                aria-label={`删除梗：${motif.text}`}
                                                                onClick={() => handleDeleteCustomMotif(motif.id)}
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="rounded-lg border border-dashed border-[#e4cfb7] px-3 py-4 text-center text-[12px] text-[#b08b67]">
                                                    暂无自定义梗
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>

                {/* Avatar for User */}
                {isUser && renderAvatar(userAvatar)}
            </div>
        </>
    );

    // [New] Social Card Rendering
    // --- Chat Forward Card ---
    if (m.type === 'chat_forward') {
        let forwardData: any = null;
        try { forwardData = JSON.parse(m.content); } catch { }
        if (forwardData) {
            return <ForwardCard forwardData={forwardData} commonLayout={commonLayout} interactionProps={interactionProps} selectionMode={selectionMode} />;
        }
    }

    // --- XHS Card Rendering (小红书笔记卡片) ---
    if (m.type === 'xhs_card' && m.metadata?.xhsNote) {
        return commonLayout(
            <XhsCard note={m.metadata.xhsNote} isUser={isUser} />
        );
    }

    // --- Canva Card Rendering (Canva 设计卡片) ---
    if (m.type === 'canva_card' && m.metadata?.canvaDesign) {
        return commonLayout(
            <CanvaCard design={m.metadata.canvaDesign} />
        );
    }

    // --- WeChat Moments Card (朋友圈动态卡片) ---
    if (m.type === 'moments' && m.metadata?.moments) {
        return commonLayout(
            <WeChatMomentsCard data={m.metadata.moments} />
        );
    }

    if (m.type === 'social_card' && m.metadata?.post) {
        return commonLayout(
            <SocialCard post={m.metadata.post} />
        );
    }

    if (m.type === 'transfer') {
        const CustomTransferCard = THEME_PLUGINS[activeTheme.id]?.TransferCard as any;

        if (CustomTransferCard) {
            return commonLayout(
                <CustomTransferCard
                    message={m}
                    isUser={isUser}
                    charName={charName}
                    selectionMode={selectionMode}
                    onTransferAction={onTransferAction}
                />
            );
        }

        // Fallback to the neutral default card
        return commonLayout(
            <DefaultTransferCard
                message={m}
                isUser={isUser}
                charName={charName}
                selectionMode={selectionMode}
                onTransferAction={onTransferAction}
            />
        );
    }

    if (m.type === 'emoji') {
        if (!emojiSrc || safeEmoji.isFailed || !safeEmoji.isLoaded) return null;
        return commonLayout(
            <img
                src={safeEmoji.src}
                data-testid="chat-emoji-image"
                className="max-w-[160px] max-h-[160px] hover:scale-105 transition-transform drop-shadow-md active:scale-95"
                loading="lazy"
                decoding="async"
                onError={safeEmoji.markFailed}
            />
        );
    }

    if (m.type === 'image') {
        const hasDisplayableImageSrc = Boolean(imageDisplaySrc);
        const imageLoadFailed = safeImage.isFailed;
        const imageStatus = String(m.metadata?.status || '');
        const isGeneratingImage = imageStatus === 'generating';
        const isFailedImage = imageStatus === 'failed';
        const originalAssetId = typeof m.metadata?.originalAssetId === 'string'
            ? m.metadata.originalAssetId
            : undefined;
        const imageSummary = String(m.metadata?.visualSummary || m.metadata?.caption || '').trim();
        const imageAlt = isUser ? 'Uploaded image' : 'Generated image';
        const fallbackPreviewSrc = imageSrc || thumbnailSrc;
        if ((isGeneratingImage || isFailedImage) && (!hasDisplayableImageSrc || imageLoadFailed)) {
            return commonLayout(
                <div
                    className="sully-image-msg-shell flex h-[240px] w-[180px] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-black/5 bg-black/5 px-4 text-center shadow-sm"
                    data-testid="chat-image-placeholder"
                    role={isGeneratingImage ? 'status' : undefined}
                >
                    {isGeneratingImage ? (
                        <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
                    ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-500">!</div>
                    )}
                    <div className="text-xs font-medium text-slate-500">
                        {isGeneratingImage ? '发送图片中...' : '图片发送失败'}
                    </div>
                </div>
            );
        }
        if (!hasDisplayableImageSrc || imageLoadFailed || !safeImage.isLoaded) return null;
        const stopImageGesture = (event: React.SyntheticEvent) => {
            if (!selectionMode) {
                event.stopPropagation();
            }
        };
        const openImagePreview = () => {
            const requestId = imagePreviewRequestRef.current + 1;
            imagePreviewRequestRef.current = requestId;

            if (!originalAssetId) {
                setImagePreview({ src: fallbackPreviewSrc, alt: imageAlt, summary: imageSummary });
                return;
            }

            setImagePreview({
                src: thumbnailSrc || fallbackPreviewSrc,
                alt: imageAlt,
                summary: imageSummary,
                isLoadingOriginal: true,
            });

            void resolveOriginalImageUrl(originalAssetId, fallbackPreviewSrc).then(src => {
                if (imagePreviewRequestRef.current !== requestId) return;
                setImagePreview(prev => prev ? { ...prev, src, isLoadingOriginal: false } : prev);
            });
        };
        const previewPortal = imagePreview ? ReactDOM.createPortal(
            <div
                className="sully-image-preview-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 px-3 py-6 backdrop-blur-xl"
                role="dialog"
                aria-modal="true"
                onClick={closeImagePreview}
            >
                <button
                    type="button"
                    className="sully-image-preview-action absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-lg backdrop-blur-md transition-transform active:scale-95"
                    aria-label="关闭预览"
                    title="关闭预览"
                    onClick={(event) => {
                        event.stopPropagation();
                        closeImagePreview();
                    }}
                >
                    <X className="h-5 w-5" weight="bold" />
                </button>
                <a
                    className="sully-image-preview-action absolute bottom-5 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-lg backdrop-blur-md transition-transform active:scale-95"
                    href={imagePreview.src}
                    download={`sully-image-${m.id}.png`}
                    aria-label="保存原图"
                    title="保存原图"
                    onClick={event => event.stopPropagation()}
                >
                    <DownloadSimple className="h-5 w-5" weight="bold" />
                </a>
                <img
                    src={imagePreview.src}
                    data-testid="chat-image-preview-img"
                    className="max-h-[88vh] max-w-[94vw] rounded-lg object-contain shadow-2xl"
                    alt={imagePreview.alt}
                    decoding="async"
                    onClick={event => event.stopPropagation()}
                />
            </div>,
            document.body
        ) : null;

        return commonLayout(
            <>
                <button
                    type="button"
                    className="sully-image-msg-shell relative group block overflow-hidden rounded-2xl border border-black/5 bg-black/5 shadow-sm transition-transform active:scale-[0.98]"
                    aria-label="打开原图预览"
                    title="打开原图预览"
                    onMouseDown={stopImageGesture}
                    onMouseUp={stopImageGesture}
                    onTouchStart={stopImageGesture}
                    onTouchEnd={stopImageGesture}
                    onClick={(event) => {
                        if (selectionMode) return;
                        event.stopPropagation();
                        openImagePreview();
                    }}
                >
                    <img
                        src={safeImage.src}
                        data-testid="chat-image-thumbnail"
                        className="sully-image-msg max-h-[300px] max-w-[200px] object-cover"
                        alt={imageAlt}
                        loading="lazy"
                        decoding="async"
                        onError={safeImage.markFailed}
                    />
                    <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white opacity-0 shadow-sm backdrop-blur-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        <ArrowsOutSimple className="h-4 w-4" weight="bold" />
                    </span>
                </button>
                {previewPortal}
            </>
        );
    }

    if (m.type === 'news_card') {
        const md: any = m.metadata || {};
        const title: string = md.title || '热点';
        const source: string = md.source || '热点';
        const url: string | undefined = md.url;
        const desc: string | undefined = md.desc && md.desc !== title ? md.desc : undefined;
        const rawPlatform = String(md.platform || '').toLowerCase();
        const platform = rawPlatform
            || (source.includes('B站') || source.toLowerCase().includes('bilibili') ? 'bilibili' : '')
            || (source.includes('微博') ? 'weibo' : '')
            || (source.includes('知乎') ? 'zhihu' : '')
            || (source.includes('百度') ? 'baidu' : '')
            || (source.includes('抖音') ? 'douyin' : '');
        const rank = Number(md.rank);
        const rankLabel = Number.isFinite(rank) && rank > 0 ? `#${Math.trunc(rank)}` : '热点';
        const dateStr = new Date(m.timestamp).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
        const openNews = () => { if (url) window.open(url, '_blank', 'noopener,noreferrer'); };

        if (platform === 'bilibili') {
            return commonLayout(
                <div
                    className={`w-64 overflow-hidden rounded-lg border border-[#fb2d86]/40 bg-white shadow-[0_4px_14px_rgba(251,45,134,0.18)] transition-transform active:scale-[0.98] ${url ? 'cursor-pointer' : ''}`}
                    onClick={openNews}
                >
                    <div className="flex items-center justify-between bg-[#fff0f6] px-3 py-2">
                        <div className="flex items-center gap-2 text-[#d91672]">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fb2d86] text-white">
                                <PlayCircle className="h-5 w-5" weight="fill" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black tracking-[0.16em]">Csy-OS</p>
                                <p className="text-[9px] font-bold text-[#d91672]/70">BILIBILI 视频热榜</p>
                            </div>
                        </div>
                        <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-black text-[#fb2d86]">{rankLabel}</span>
                    </div>
                    <div className="px-3 py-2.5">
                        <p
                            className="text-[15px] font-black leading-snug text-slate-950"
                            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                            {title}
                        </p>
                        {desc && (
                            <p
                                className="mt-1 text-[11px] leading-snug text-slate-500"
                                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                                {desc}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-between border-t border-[#fb2d86]/20 px-3 py-2">
                        <span className="text-[9px] font-bold text-slate-400">{charName || 'Ta'} 转给你看</span>
                        {url ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#d91672]">
                                打开视频
                                <ArrowSquareOut className="h-3 w-3" weight="bold" />
                            </span>
                        ) : (
                            <span className="text-[9px] text-slate-300">热点速读</span>
                        )}
                    </div>
                </div>
            );
        }

        if (platform === 'weibo') {
            return commonLayout(
                <div
                    className={`w-64 overflow-hidden rounded-lg border border-[#ff8200]/35 bg-white shadow-[0_4px_14px_rgba(255,130,0,0.16)] transition-transform active:scale-[0.98] ${url ? 'cursor-pointer' : ''}`}
                    onClick={openNews}
                >
                    <div className="flex items-center justify-between bg-[#ff8200] px-3 py-2 text-white">
                        <div className="flex items-center gap-2">
                            <Fire className="h-4 w-4" weight="fill" />
                            <span className="text-[10px] font-black tracking-[0.18em]">Csy-OS</span>
                            <span className="text-[10px] font-bold text-white/80">微博热搜</span>
                        </div>
                        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-black text-[#ff8200]">{rankLabel}</span>
                    </div>
                    <div className="px-3 py-2.5">
                        <p
                            className="text-[16px] font-black leading-snug text-stone-950"
                            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                            {title}
                        </p>
                        {desc && (
                            <p
                                className="mt-1 text-[11px] leading-snug text-stone-600"
                                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                                {desc}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-between border-t border-[#ff8200]/20 px-3 py-2">
                        <span className="text-[9px] font-bold text-[#ff8200]/70">{dateStr} · {source}</span>
                        {url ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#ff8200]">
                                看热搜
                                <ArrowSquareOut className="h-3 w-3" weight="bold" />
                            </span>
                        ) : (
                            <span className="text-[9px] text-[#ff8200]/45">热点速读</span>
                        )}
                    </div>
                </div>
            );
        }

        if (platform === 'zhihu') {
            return commonLayout(
                <div
                    className={`w-64 overflow-hidden rounded-lg border border-[#1772f6]/35 bg-white shadow-[0_4px_14px_rgba(23,114,246,0.16)] transition-transform active:scale-[0.98] ${url ? 'cursor-pointer' : ''}`}
                    onClick={openNews}
                >
                    <div className="bg-[#1772f6] px-3 py-2 text-white">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black tracking-[0.2em]">Csy-OS</span>
                            <span className="text-[9px] font-bold text-white/75">{dateStr} · 号外</span>
                        </div>
                        <div className="mt-2 h-[2px] bg-gradient-to-r from-white via-[#8bbcff] to-white/40" />
                    </div>
                    <div className="px-3 pt-2.5">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded bg-[#1772f6] px-2 py-1 text-[10px] font-black text-white shadow-sm">
                                知乎热榜
                            </span>
                            <span className="text-[10px] font-black text-[#1772f6]">{rankLabel}</span>
                        </div>
                    </div>
                    <div className="px-3 pb-2 pt-2">
                        <p
                            className="text-[16px] font-black leading-snug text-slate-950"
                            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                            {title}
                        </p>
                        {desc && (
                            <p
                                className="mt-1 text-[11px] leading-snug text-slate-500"
                                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                                {desc}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-between border-t border-[#1772f6]/15 px-3 py-2">
                        <span className="text-[9px] font-bold text-slate-400">{charName || 'Ta'} 转给你看</span>
                        {url ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#1772f6]">
                                打开知乎
                                <ArrowSquareOut className="h-3 w-3" weight="bold" />
                            </span>
                        ) : (
                            <span className="text-[9px] text-slate-300">热点速读</span>
                        )}
                    </div>
                </div>
            );
        }

        if (platform === 'baidu') {
            return commonLayout(
                <div
                    className={`w-64 overflow-hidden rounded-lg border border-[#2932e1]/35 bg-white shadow-[0_4px_14px_rgba(41,50,225,0.16)] transition-transform active:scale-[0.98] ${url ? 'cursor-pointer' : ''}`}
                    onClick={openNews}
                >
                    <div className="px-3 py-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-7 w-7 items-center justify-center rounded bg-[#2932e1] text-[14px] font-black text-white shadow-sm">
                                    百
                                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#de0f17] ring-2 ring-white" />
                                </span>
                                <span className="text-[10px] font-black tracking-[0.2em] text-[#2932e1]">Csy-OS</span>
                            </div>
                            <span className="text-[9px] font-bold text-slate-400">{dateStr} · 号外</span>
                        </div>
                        <div className="mt-2 h-[2px] bg-gradient-to-r from-[#2932e1] via-[#3385ff] to-[#de0f17]" />
                    </div>
                    <div className="px-3 pt-2">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded bg-[#2932e1] px-2 py-1 text-[10px] font-black text-white shadow-sm">
                                百度热榜
                            </span>
                            <span className="text-[10px] font-black text-[#de0f17]">{rankLabel}</span>
                        </div>
                    </div>
                    <div className="px-3 pb-2 pt-2">
                        <p
                            className="text-[16px] font-black leading-snug text-slate-950"
                            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                            {title}
                        </p>
                        {desc && (
                            <p
                                className="mt-1 text-[11px] leading-snug text-slate-500"
                                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                                {desc}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-between border-t border-[#2932e1]/15 px-3 py-2">
                        <span className="text-[9px] font-bold text-slate-400">{charName || 'Ta'} 转给你看</span>
                        {url ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#2932e1]">
                                打开百度
                                <ArrowSquareOut className="h-3 w-3 text-[#de0f17]" weight="bold" />
                            </span>
                        ) : (
                            <span className="text-[9px] text-slate-300">热点速读</span>
                        )}
                    </div>
                </div>
            );
        }

        if (platform === 'douyin') {
            return commonLayout(
                <div
                    className={`w-64 overflow-hidden rounded-lg border border-black bg-white shadow-[0_5px_16px_rgba(254,44,85,0.18),-2px_2px_0_rgba(37,244,238,0.75)] transition-transform active:scale-[0.98] ${url ? 'cursor-pointer' : ''}`}
                    onClick={openNews}
                >
                    <div className="bg-[#0f0f0f] px-3 py-2 text-white">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black tracking-[0.22em]">Csy-OS</span>
                            <span className="text-[9px] font-bold text-white/70">{dateStr} · 号外</span>
                        </div>
                        <div className="mt-2 h-[2px] bg-gradient-to-r from-[#25f4ee] via-white to-[#fe2c55]" />
                    </div>
                    <div className="px-3 pt-2.5">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded bg-[#0f0f0f] px-2 py-1 text-[10px] font-black text-white shadow-[2px_0_0_#fe2c55,-2px_0_0_#25f4ee]">
                                <PlayCircle className="h-3 w-3 text-[#25f4ee]" weight="fill" />
                                抖音热榜
                            </span>
                            <span className="text-[10px] font-black text-[#fe2c55]">{rankLabel}</span>
                        </div>
                    </div>
                    <div className="px-3 pb-2 pt-2">
                        <p
                            className="text-[16px] font-black leading-snug text-[#0f0f0f]"
                            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                            {title}
                        </p>
                        {desc && (
                            <p
                                className="mt-1 text-[11px] leading-snug text-slate-500"
                                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                                {desc}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-between border-t border-black/10 px-3 py-2">
                        <span className="text-[9px] font-bold text-slate-400">{charName || 'Ta'} 刷到的热点</span>
                        {url ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#fe2c55]">
                                打开抖音
                                <ArrowSquareOut className="h-3 w-3 text-[#25f4ee]" weight="bold" />
                            </span>
                        ) : (
                            <span className="text-[9px] text-slate-300">热点速读</span>
                        )}
                    </div>
                </div>
            );
        }

        return commonLayout(
            <div
                className={`w-64 active:scale-[0.98] transition-transform ${url ? 'cursor-pointer' : ''}`}
                onClick={openNews}
            >
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.10)]">
                    <div className="px-3 py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black tracking-[0.22em] text-slate-950">Csy-OS</span>
                            <span className="text-[9px] font-bold text-slate-400">{dateStr} · MAG</span>
                        </div>
                        <div className="mt-2 h-[2px] bg-gradient-to-r from-slate-950 via-slate-300 to-transparent" />
                    </div>
                    <div className="px-3 pt-1">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-950 px-2 py-1 text-[10px] font-black tracking-wide text-white shadow-sm">
                            {source}
                        </span>
                        <span className="ml-1.5 text-[10px] font-black text-slate-400">{rankLabel}</span>
                    </div>
                    <div className="px-3 pb-2 pt-2">
                        <p
                            className="text-[16px] font-black leading-snug text-slate-950"
                            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                            {title}
                        </p>
                        {desc && (
                            <p
                                className="mt-1 text-[11px] leading-snug text-slate-500"
                                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                                {desc}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
                        <span className="text-[9px] font-bold text-slate-400">{charName || 'Ta'} 转给你看</span>
                        {url
                            ? <span className="inline-flex items-center gap-1 text-[10px] font-black text-slate-950">查看原文<ArrowSquareOut className="h-3 w-3" weight="bold" /></span>
                            : <span className="text-[9px] text-slate-300">热点速读</span>}
                    </div>
                </div>
            </div>
        );
    }

    // --- Song Share Card: detect metadata.type === 'song_card' ---
    if (m.type === 'text' && m.metadata?.type === 'song_card') {
        return commonLayout(
            <SongShareCardBubble metadata={m.metadata as any} />
        );
    }

    // --- Voice Compat: detect <语音>...</语音> in text messages (原版 SillyTavern 导入兼容) ---
    // Original SillyTavern stores voice messages as type:'text' with XML tags in content.
    // We detect this at render time and display them as proper voice bubbles.
    let effectiveVoiceType: 'voice' | null = null;
    let compatVoiceText: string | undefined;
    let compatDuration = 0;

    if (m.type === 'text' && m.content) {
        const xmlVoiceMatch = m.content.match(/^[\s]*<[语語]音>([\s\S]+?)<\/[语語]音>[\s]*$/);
        if (xmlVoiceMatch) {
            compatVoiceText = xmlVoiceMatch[1].trim();
            compatDuration = Math.max(2, Math.ceil(compatVoiceText.length / 4));
            effectiveVoiceType = 'voice';
        }
    }

    // --- Voice Message Rendering (native + compat) ---
    if (m.type === 'voice' || effectiveVoiceType === 'voice') {
        const isCompat = effectiveVoiceType === 'voice';
        const isVoiceLoading = !!loadingMsgIds?.has(m.id);
        const hasAudio = !!m.metadata?.hasAudio;
        const sourceText = isCompat ? (compatVoiceText || '') : (m.metadata?.sourceText || m.content);
        const hasSourceText = !!sourceText && sourceText.trim().length > 0;

        // Parse bilingual content in voice transcript (reuses shared utility)
        const voiceBi = parseBilingual(sourceText, stripJunk);

        // Resolve plugin theme ID (DIY themes inherit from baseThemeId)
        // BUT: custom (DIY) themes should always use generic VoiceBubble with their own styleConfig,
        // only actual preset themes get the plugin's custom voice bubble.
        const isCustomTheme = activeTheme.type === 'custom';
        const pluginThemeId = activeTheme.baseThemeId || activeTheme.id;
        const PluginVoiceBubble = isCustomTheme ? undefined : THEME_PLUGINS[pluginThemeId]?.VoiceBubble;
        const BubbleComponent = PluginVoiceBubble || VoiceBubble;

        return commonLayout(
            <div className="flex flex-col gap-1">
                <div className={`flex items-center gap-1.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    <BubbleComponent
                        duration={isCompat ? compatDuration : (m.metadata?.duration ?? 0)}
                        isPlaying={playingMsgId === m.id}
                        isLoading={isVoiceLoading}
                        hasFailed={!hasAudio && !isVoiceLoading}
                        isUser={isUser}
                        onPlay={() => onPlayVoice?.(m.id)}
                        onStop={() => onStopVoice?.()}
                        onRetry={() => onRetryVoice?.(m.id)}
                        styleConfig={PluginVoiceBubble ? undefined : styleConfig}
                    />
                    {hasSourceText && (
                        <button
                            className="shrink-0 text-[10px] active:scale-95 transition-all px-1.5 py-0.5 rounded-full border backdrop-blur-sm select-none"
                            style={{
                                color: styleConfig?.textColor ? `${styleConfig.textColor}99` : '#9ca3af',
                                borderColor: styleConfig?.textColor ? `${styleConfig.textColor}30` : 'rgba(209,213,219,0.6)',
                                backgroundColor: styleConfig?.textColor ? `${styleConfig.textColor}10` : 'rgba(255,255,255,0.5)',
                            }}
                            onClick={(e) => { e.stopPropagation(); onToggleVoiceText?.(m.id); }}
                        >
                            {isVoiceTextExpanded ? '收起' : '转文字'}
                        </button>
                    )}
                </div>
                {isVoiceTextExpanded && hasSourceText && (
                    <div
                        className="text-[12px] leading-relaxed px-3 py-2 rounded-lg animate-fade-in max-w-[200px] break-words"
                        style={{
                            borderRadius: `${styleConfig?.borderRadius ?? 6}px`,
                            color: styleConfig?.textColor ? `${styleConfig.textColor}cc` : '#4b5563',
                            backgroundColor: styleConfig?.textColor ? `${styleConfig.textColor}08` : 'rgba(0,0,0,0.03)',
                        }}
                    >
                        {voiceBi.langA}
                        {voiceBi.hasBilingual && voiceBi.langB && (
                            <>
                                <div
                                    className="my-1.5"
                                    style={{
                                        borderTop: `1px dashed ${styleConfig?.textColor ? `${styleConfig.textColor}20` : 'rgba(0,0,0,0.08)'}`,
                                    }}
                                />
                                <div style={{ opacity: 0.7 }}>{voiceBi.langB}</div>
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    }


    // --- Bilingual content parsing (uses centralized parseBilingual for backward compat) ---
    const { hasBilingual, langA: langAContent, langB: langBContent } = parseBilingual(m.content, stripJunk);
    const displayContent = (isShowingTarget && langBContent) ? langBContent : langAContent;
    const showTranslateButton = translationEnabled && hasBilingual && !!langBContent;

    // Cross-platform source tag (e.g. WeChat sync)
    const sourceTag = m.metadata?.source === 'weixin' ? 'via 微信' : undefined;

    // Don't render empty bubbles
    if (!displayContent && m.type === 'text') return null;

    return commonLayout(
        <ChatBubble
            isUser={isUser}
            styleConfig={styleConfig}
            displayContent={displayContent}
            allowCssOverride={allowBubbleCssOverride}
            sourceTag={sourceTag}
            replyTo={m.replyTo}
            showTranslateButton={showTranslateButton}
            isShowingTarget={isShowingTarget}
            onTranslateToggle={() => onTranslateToggle?.(m.id)}
            thinking={showThinking && !isUser ? m.metadata?.thinking : undefined}
        />
    );
}, (prev: MessageItemProps, next: MessageItemProps) => {
    return prev.msg.id === next.msg.id &&
        prev.msg.type === next.msg.type &&
        prev.msg.content === next.msg.content &&
        prev.msg.metadata?.status === next.msg.metadata?.status &&
        prev.msg.metadata?.type === next.msg.metadata?.type &&
        prev.msg.metadata?.songId === next.msg.metadata?.songId &&
        prev.msg.metadata?.hasAudio === next.msg.metadata?.hasAudio &&
        prev.msg.metadata?.duration === next.msg.metadata?.duration &&
        prev.msg.metadata?.sourceText === next.msg.metadata?.sourceText &&
        prev.msg.metadata?.thumbnailUrl === next.msg.metadata?.thumbnailUrl &&
        prev.msg.metadata?.originalAssetId === next.msg.metadata?.originalAssetId &&
        prev.msg.metadata?.visualSummary === next.msg.metadata?.visualSummary &&
        prev.msg.metadata?.caption === next.msg.metadata?.caption &&
        prev.msg.metadata?.imageId === next.msg.metadata?.imageId &&
        prev.msg.replyTo?.id === next.msg.replyTo?.id &&
        prev.msg.replyTo?.name === next.msg.replyTo?.name &&
        prev.msg.replyTo?.content === next.msg.replyTo?.content &&
        prev.msg.replyTo?.type === next.msg.replyTo?.type &&
        prev.msg.replyTo?.thumbnailUrl === next.msg.replyTo?.thumbnailUrl &&
        prev.msg.replyTo?.imageUrl === next.msg.replyTo?.imageUrl &&
        prev.msg.replyTo?.visualSummary === next.msg.replyTo?.visualSummary &&
        prev.isFirstInGroup === next.isFirstInGroup &&
        prev.isLastInGroup === next.isLastInGroup &&
        prev.activeTheme === next.activeTheme &&
        prev.selectionMode === next.selectionMode &&
        prev.isSelected === next.isSelected &&
        prev.translationEnabled === next.translationEnabled &&
        prev.isShowingTarget === next.isShowingTarget &&
        prev.showTimestamp === next.showTimestamp &&
        prev.playingMsgId === next.playingMsgId &&
        prev.loadingMsgIds?.size === next.loadingMsgIds?.size &&
        !!prev.loadingMsgIds?.has(prev.msg.id) === !!next.loadingMsgIds?.has(next.msg.id) &&
        prev.isVoiceTextExpanded === next.isVoiceTextExpanded &&
        prev.innerVoice === next.innerVoice &&
        prev.statusCardData === next.statusCardData &&
        prev.onRetryInnerVoice === next.onRetryInnerVoice &&
        prev.afterglowCardData === next.afterglowCardData &&
        prev.isAfterglowLoading === next.isAfterglowLoading &&
        prev.onRequestAfterglow === next.onRequestAfterglow &&
        prev.onOpenStoryPhone === next.onOpenStoryPhone &&
        prev.onUserAvatarAction === next.onUserAvatarAction &&
        prev.isUserAvatarActionLoading === next.isUserAvatarActionLoading &&
        prev.showThinking === next.showThinking &&
        prev.msg.metadata?.thinking === next.msg.metadata?.thinking &&
        prev.msg.metadata?.storyPhoneConsumed === next.msg.metadata?.storyPhoneConsumed &&
        prev.msg.metadata?.source === next.msg.metadata?.source &&
        prev.msg.metadata?.platform === next.msg.metadata?.platform &&
        prev.msg.metadata?.rank === next.msg.metadata?.rank &&
        prev.msg.metadata?.cardId === next.msg.metadata?.cardId &&
        prev.msg.metadata?.url === next.msg.metadata?.url &&
        prev.msg.metadata?.title === next.msg.metadata?.title &&
        prev.msg.metadata?.desc === next.msg.metadata?.desc;
});

export default MessageItem;
