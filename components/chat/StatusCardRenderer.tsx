/**
 * StatusCardRenderer — 创意状态栏通用渲染器
 * 
 * 根据 StatusCardData.cardType 路由到对应的骨架组件。
 * 负责：CSS变量注入、白名单验证、fallback降级。
 */

import React,{ Suspense,useEffect,useId,useMemo,useRef,useState } from 'react';
import { StatusCardData } from '../../types/statusCard';
import {
    STATUS_CARD_IFRAME_SHELL,
    STATUS_CARD_MEASURE_BUFFER_PX,
    STATUS_CARD_MIN_HEIGHT_PX,
    STATUS_CARD_WIDTH_PX,
} from './statusCardIframe';

// ─── Lazy-loaded skeletons ──────────────────────────────────────
// Each skeleton is lazy-imported to avoid bloating the main bundle.
// When new skeletons are added, register them here.

const skeletonLoaders: Record<string, React.LazyExoticComponent<React.FC<{ data: StatusCardData }>>> = {
    postcard:      React.lazy(() => import('./skeletons/PostcardSkeleton')),
    phone_screen:  React.lazy(() => import('./skeletons/PhoneScreenSkeleton')),
    sticky_note:   React.lazy(() => import('./skeletons/StickyNoteSkeleton')),
    receipt:       React.lazy(() => import('./skeletons/ReceiptSkeleton')),
    diary:         React.lazy(() => import('./skeletons/DiarySkeleton')),
    music_player:  React.lazy(() => import('./skeletons/MusicPlayerSkeleton')),
    polaroid:      React.lazy(() => import('./skeletons/PolaroidSkeleton')),
    social_post:   React.lazy(() => import('./skeletons/SocialPostSkeleton')),
};

// ─── CSS value whitelist ────────────────────────────────────────
const SAFE_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]{3,20})$/;
const SAFE_FONT_STYLES = new Set(['serif', 'sans', 'handwrite', 'mono']);
const FREEFORM_VIEWPORT_PADDING_X_PX = 20;
const FREEFORM_VIEWPORT_PADDING_Y_PX = 96;

function getFreeformViewportLimits() {
    if (typeof window === 'undefined') {
        return {
            width: STATUS_CARD_WIDTH_PX,
            height: STATUS_CARD_MIN_HEIGHT_PX,
        };
    }

    return {
        width: Math.max(160, window.innerWidth - FREEFORM_VIEWPORT_PADDING_X_PX),
        height: Math.max(180, window.innerHeight - FREEFORM_VIEWPORT_PADDING_Y_PX),
    };
}

function sanitizeColor(value: string | undefined, fallback: string): string;
function sanitizeColor(value: string | undefined, fallback: undefined): string | undefined;
function sanitizeColor(value: string | undefined, fallback: string | undefined): string | undefined {
    if (!value) return fallback;
    return SAFE_COLOR_RE.test(value.trim()) ? value.trim() : fallback;
}

function getFontFamily(fontStyle: StatusCardData['style']['fontStyle']): string {
    switch (fontStyle) {
        case 'sans':
            return "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif";
        case 'mono':
            return "'SF Mono', 'Fira Code', monospace";
        case 'handwrite':
            return "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif";
        case 'serif':
        default:
            return "'Noto Serif SC', 'Songti SC', STSong, serif";
    }
}

const FreeformStatusCard: React.FC<{ html: string; allowScripts?: boolean }> = ({ html, allowScripts = false }) => {
    const previewRef = useRef<HTMLIFrameElement>(null);
    const frameChannel = useId().replace(/:/g, '_');
    const [previewReady, setPreviewReady] = useState(false);
    const [previewSize, setPreviewSize] = useState({
        width: STATUS_CARD_WIDTH_PX,
        height: STATUS_CARD_MIN_HEIGHT_PX,
    });
    const [hasMeasuredSize, setHasMeasuredSize] = useState(false);
    const [viewportLimits, setViewportLimits] = useState(getFreeformViewportLimits);
    const previousHtmlRef = useRef(html);

    useEffect(() => {
        if (previousHtmlRef.current === html) return;
        previousHtmlRef.current = html;
        setPreviewSize({
            width: STATUS_CARD_WIDTH_PX,
            height: STATUS_CARD_MIN_HEIGHT_PX,
        });
        setHasMeasuredSize(false);
    }, [html]);

    useEffect(() => {
        const updateViewportLimits = () => setViewportLimits(getFreeformViewportLimits());
        window.addEventListener('resize', updateViewportLimits);
        return () => window.removeEventListener('resize', updateViewportLimits);
    }, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent<{ type?: string; channel?: string; width?: number; height?: number }>) => {
            if (event.source !== previewRef.current?.contentWindow) return;
            if (event.data?.type !== 'preview-height') return;
            if (event.data.channel !== frameChannel) return;

            const nextWidth = typeof event.data.width === 'number'
                ? Math.max(event.data.width + STATUS_CARD_MEASURE_BUFFER_PX, 1)
                : STATUS_CARD_WIDTH_PX;

            const nextHeight = typeof event.data.height === 'number'
                ? Math.max(event.data.height + STATUS_CARD_MEASURE_BUFFER_PX, 1)
                : STATUS_CARD_MIN_HEIGHT_PX;

            setPreviewSize({
                width: nextWidth,
                height: nextHeight,
            });
            setHasMeasuredSize(true);
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [frameChannel]);

    useEffect(() => {
        if (!previewReady) return;

        previewRef.current?.contentWindow?.postMessage(
            { type: 'preview-update', channel: frameChannel, html, allowScripts },
            '*',
        );
    }, [allowScripts, frameChannel, html, previewReady]);

    const measuredWidth = hasMeasuredSize ? previewSize.width : viewportLimits.width;
    const measuredHeight = hasMeasuredSize ? previewSize.height : 1;
    const fitScale = hasMeasuredSize
        ? Math.min(1, viewportLimits.width / measuredWidth, viewportLimits.height / measuredHeight)
        : 1;
    const fittedWidth = Math.ceil(measuredWidth * fitScale);
    const fittedHeight = Math.ceil(measuredHeight * fitScale);

    return (
        <div
            data-testid="freeform-status-card-fit"
            style={{
                position: 'relative',
                width: `${fittedWidth}px`,
                height: `${fittedHeight}px`,
                maxWidth: `calc(100vw - ${FREEFORM_VIEWPORT_PADDING_X_PX}px)`,
                maxHeight: `calc(100vh - ${FREEFORM_VIEWPORT_PADDING_Y_PX}px)`,
                display: 'block',
                opacity: hasMeasuredSize ? 1 : 0,
                transition: 'opacity 120ms ease',
            }}
        >
            <iframe
                ref={previewRef}
                srcDoc={STATUS_CARD_IFRAME_SHELL}
                sandbox="allow-scripts"
                title="Freeform creative card"
                data-preview-channel={frameChannel}
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: `${measuredWidth}px`,
                    height: `${measuredHeight}px`,
                    border: 'none',
                    borderRadius: '24px',
                    background: 'transparent',
                    colorScheme: 'light dark',
                    overflow: 'hidden',
                    display: 'block',
                    transform: `translate(-50%, -50%) scale(${fitScale})`,
                    transformOrigin: 'center center',
                }}
                onLoad={() => setPreviewReady(true)}
            />
        </div>
    );
};

const CustomTextCard: React.FC<{ data: StatusCardData }> = ({ data }) => (
    <div
        data-testid="custom-text-status-card"
        style={{
            width: `${STATUS_CARD_WIDTH_PX}px`,
            maxWidth: 'calc(100vw - 48px)',
            borderRadius: '24px',
            padding: '22px 20px',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 24px 40px rgba(0,0,0,0.28)',
            color: data.style.textColor || '#f8fafc',
            fontFamily: getFontFamily(data.style.fontStyle),
            whiteSpace: 'pre-wrap',
        }}
    >
        {data.title && (
            <div style={{
                fontSize: '11px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                opacity: 0.48,
                marginBottom: '12px',
            }}>
                {data.title}
            </div>
        )}
        <div style={{
            fontSize: '14px',
            lineHeight: 1.8,
            minHeight: '40px',
        }}>
            {data.body}
        </div>
        {data.footer && (
            <div style={{
                marginTop: '14px',
                paddingTop: '12px',
                borderTop: '1px solid rgba(255,255,255,0.12)',
                fontSize: '11px',
                opacity: 0.6,
            }}>
                {data.footer}
            </div>
        )}
    </div>
);

// ─── Fallback Card (classic innerVoice text) ────────────────────
const FallbackCard: React.FC<{ data: StatusCardData }> = ({ data }) => (
    <div
        style={{
            width: '330px',
            maxWidth: 'calc(100vw - 48px)',
            background: '#F9F8F4',
            borderRadius: '3px',
            padding: '24px 18px',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)',
            transform: 'rotate(-1.5deg)',
            color: '#2A2520',
            fontFamily: "'Noto Serif SC', 'Kaiti SC', STKaiti, serif",
            textAlign: 'center',
            lineHeight: '2.0',
            fontSize: '16px',
        }}
    >
        <div style={{
            fontSize: '10px',
            letterSpacing: '0.4em',
            color: '#8C8273',
            textTransform: 'uppercase',
            marginBottom: '12px',
        }}>
            Inner Voice
        </div>
        <div style={{ minHeight: '40px' }}>{data.body}</div>
        {data.footer && (
            <div style={{
                fontSize: '9px',
                color: '#A69D8F',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid rgba(140,130,115,0.2)',
            }}>
                {data.footer}
            </div>
        )}
    </div>
);

// ─── Loading spinner ────────────────────────────────────────────
const CardLoadingFallback: React.FC = () => (
    <div style={{
        width: '330px',
        maxWidth: 'calc(100vw - 48px)',
        height: '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '6px',
        backdropFilter: 'blur(4px)',
    }}>
        <div style={{
            width: '24px',
            height: '24px',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: 'rgba(255,255,255,0.8)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
        }} />
    </div>
);

// ─── Main Renderer ──────────────────────────────────────────────
interface StatusCardRendererProps {
    data: StatusCardData;
}

const StatusCardRenderer: React.FC<StatusCardRendererProps> = ({ data }) => {
    // Sanitize style values
    const sanitizedData = useMemo<StatusCardData>(() => ({
        ...data,
        body: (data.body || '').slice(0, 200),
        title: data.title?.slice(0, 50),
        footer: data.footer?.slice(0, 50),
        style: {
            ...data.style,
            bgGradient: data.style.bgGradient ? [
                sanitizeColor(data.style.bgGradient[0], '#1a1a2e'),
                sanitizeColor(data.style.bgGradient[1], '#16213e'),
            ] as [string, string] : undefined,
            textColor: sanitizeColor(data.style.textColor, undefined),
            accent: sanitizeColor(data.style.accent, undefined),
            fontStyle: SAFE_FONT_STYLES.has(data.style.fontStyle || '') ? data.style.fontStyle : 'serif',
        },
    }), [data]);

    // ── Freeform HTML card: render in sandboxed iframe ──
    if (sanitizedData.cardType === 'freeform' && sanitizedData.meta?.html) {
        return (
            <FreeformStatusCard
                html={sanitizedData.meta.html}
                allowScripts={sanitizedData.meta.allowScripts === true}
            />
        );
    }

    if (sanitizedData.cardType === 'custom_text') {
        return <CustomTextCard data={sanitizedData} />;
    }

    // Resolve skeleton component
    const SkeletonComponent = skeletonLoaders[sanitizedData.cardType];

    if (!SkeletonComponent) {
        // Unknown cardType → fallback to simple text card
        return <FallbackCard data={sanitizedData} />;
    }

    return (
        <Suspense fallback={<CardLoadingFallback />}>
            <SkeletonComponent data={sanitizedData} />
        </Suspense>
    );
};

export default StatusCardRenderer;
