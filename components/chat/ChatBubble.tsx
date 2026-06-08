import React,{ useRef,useEffect,useState } from 'react';
import { renderMarkdown } from '../../utils/markdownLite';
import type { BubbleStyle,Message } from '../../types/chat';
import { useSafeImageLoad } from './useSafeImageLoad';

/**
 * ChatBubble — 可主题化气泡壳组件
 *
 * DOM 结构 (两层分离):
 *   Wrapper (relative) — 不裁切，承载可溢出的绝对定位元素
 *     ├── SVG Tail      (absolute, 伸出气泡外侧)
 *     ├── Decoration     (absolute, 贴纸可超出边界)
 *     └── Inner Shell    (overflow-hidden + borderRadius, 底纹被正确裁切)
 *           ├── Background Image  (absolute inset-0)
 *           ├── Thinking Panel    (collapsible, editorial style)
 *           ├── Reply/Quote Block
 *           ├── Text Content
 *           └── Translate Toggle
 *
 * 气泡工坊兼容:
 *   - background / borderRadius / color 默认通过 setProperty + !important 写入
 *   - 当高级 CSS 明确接管气泡壳时，可降级为普通 inline style，让 CSS !important 胜出
 *   - 圆角精细化: 尾巴侧角 4px，其余角跟随 borderRadius 值
 *   - 底纹图片由 overflow-hidden 按圆角裁切
 */

type ReplyPreview = NonNullable<Message['replyTo']>;

const IMAGE_REPLY_CONTENT_RE = /^(?:data:image\/|blob:|https?:\/\/.+\.(?:png|jpe?g|gif|webp|avif|svg)(?:[?#]|$))/i;

function looksLikeImageReplyContent(value: string | undefined): boolean {
    return !!value && IMAGE_REPLY_CONTENT_RE.test(value.trim());
}

function getImageReplyDisplay(replyTo: ReplyPreview): { src?: string; text: string } {
    const rawContent = (replyTo.content || '').trim();
    const isRawImageContent = looksLikeImageReplyContent(rawContent);
    return {
        src: replyTo.thumbnailUrl || replyTo.imageUrl || (isRawImageContent ? rawContent : undefined),
        text: '[图片]',
    };
}

interface ChatBubbleProps {
    isUser: boolean;
    styleConfig: BubbleStyle;
    displayContent: string;
    sourceTag?: string;
    replyTo?: ReplyPreview | null;
    showTranslateButton?: boolean;
    isShowingTarget?: boolean;
    onTranslateToggle?: () => void;
    thinking?: string;
    allowCssOverride?: boolean;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
    isUser,
    styleConfig,
    displayContent,
    sourceTag,
    replyTo,
    showTranslateButton,
    isShowingTarget,
    onTranslateToggle,
    thinking,
    allowCssOverride = false,
}) => {
    const radius = styleConfig.borderRadius ?? 6;
    const showTail = !styleConfig.hideTail;
    const bubbleRef = useRef<HTMLDivElement>(null);
    const [thinkingExpanded, setThinkingExpanded] = useState(false);
    const isImageReply = !!replyTo && (
        replyTo.type === 'image'
        || !!replyTo.thumbnailUrl
        || !!replyTo.imageUrl
        || looksLikeImageReplyContent(replyTo.content)
    );
    const imageReply = isImageReply && replyTo ? getImageReplyDisplay(replyTo) : null;
    const safeReplyImage = useSafeImageLoad(
        imageReply?.src,
        imageReply?.src ? `reply:${replyTo?.id}:${imageReply.src}` : undefined,
    );

    // Apply Workshop-customizable properties via inline styles.
    // Default mode keeps visual-editor values above preset theme CSS. When an
    // advanced CSS skin explicitly targets bubbles, drop the priority so
    // author CSS with !important can intentionally override the shell.
    useEffect(() => {
        if (!bubbleRef.current) return;
        const el = bubbleRef.current;
        const priority: '' | 'important' = allowCssOverride ? '' : 'important';

        // Background: gradient takes priority over solid color
        if (styleConfig.gradient) {
            const { from, to, direction } = styleConfig.gradient;
            el.style.setProperty('background', `linear-gradient(${direction}deg, ${from}, ${to})`, priority);
        } else if (styleConfig.backgroundColor) {
            el.style.setProperty('background', styleConfig.backgroundColor, priority);
        }

        // Fine-grained border-radius: tail-side bottom corner → 4px only when the tail is visible.
        const mainR = `${radius}px`;
        const tailR = showTail ? '4px' : mainR;
        el.style.setProperty('border-top-left-radius', mainR, priority);
        el.style.setProperty('border-top-right-radius', mainR, priority);
        el.style.setProperty('border-bottom-left-radius', isUser ? mainR : tailR, priority);
        el.style.setProperty('border-bottom-right-radius', isUser ? tailR : mainR, priority);

        // Text color
        if (styleConfig.textColor) {
            el.style.setProperty('color', styleConfig.textColor, priority);
        }

        // Opacity
        if (styleConfig.opacity !== undefined) {
            el.style.setProperty('opacity', String(styleConfig.opacity));
        }

        // Border
        if (styleConfig.borderWidth && styleConfig.borderWidth > 0) {
            el.style.setProperty('border', `${styleConfig.borderWidth}px solid ${styleConfig.borderColor || 'transparent'}`, priority);
        } else {
            el.style.removeProperty('border');
        }

        // Box Shadow
        if (styleConfig.boxShadow) {
            el.style.setProperty('box-shadow', styleConfig.boxShadow, priority);
        } else {
            el.style.removeProperty('box-shadow');
        }

        // Font Size
        if (styleConfig.fontSize) {
            el.style.setProperty('font-size', `${styleConfig.fontSize}px`, priority);
        } else {
            el.style.removeProperty('font-size');
        }
    }, [allowCssOverride, styleConfig.backgroundColor, styleConfig.gradient, styleConfig.textColor, radius, styleConfig.opacity, isUser, showTail, styleConfig.borderWidth, styleConfig.borderColor, styleConfig.boxShadow, styleConfig.fontSize]);

    return (
        /* Outer Wrapper — relative container; SVG tail & decoration sticker live here
           so they are NOT clipped by overflow-hidden on the inner shell */
        <div className="relative animate-fade-in active:scale-[0.98] transition-transform">

            {/* Layer 0: SVG Tail — outside inner shell, won't be clipped */}
            {showTail && (
                <svg
                    className={`sully-bubble-tail absolute top-[12px] w-[6px] h-[10px] pointer-events-none ${isUser ? '-right-[5.5px]' : '-left-[5.5px]'}`}
                    version="1.1" xmlns="http://www.w3.org/2000/svg"
                >
                    {isUser ? (
                        <polygon points="0,0 6,5 0,10" style={{ fill: styleConfig.gradient?.from || styleConfig.backgroundColor || 'var(--bubble-user-bg, #95ec69)' }} />
                    ) : (
                        <polygon points="6,0 0,5 6,10" style={{ fill: styleConfig.gradient?.from || styleConfig.backgroundColor || 'var(--bubble-ai-bg, white)' }} />
                    )}
                </svg>
            )}

            {/* Layer 2: Decoration Sticker — outside inner shell, can overflow bubble edges */}
            {styleConfig.decoration && (
                <img
                    src={styleConfig.decoration}
                    className="absolute z-20 w-8 h-8 object-contain drop-shadow-sm pointer-events-none"
                    style={{
                        left: `${styleConfig.decorationX ?? (isUser ? 90 : 10)}%`,
                        top: `${styleConfig.decorationY ?? -10}%`,
                        transform: `translate(-50%, -50%) scale(${styleConfig.decorationScale ?? 1}) rotate(${styleConfig.decorationRotate ?? 0}deg)`
                    }}
                    alt=""
                />
            )}

            {/* Inner Bubble Shell — overflow-hidden ensures background image clips to border-radius */}
            <div
                ref={bubbleRef}
                className={`relative overflow-hidden px-3 py-2 ${isUser ? 'sully-bubble-user mt-0' : 'sully-bubble-ai mt-0'}`}
            >
                {/* Layer 1: Background Image (底纹) — now properly clipped by overflow-hidden */}
                {styleConfig.backgroundImage && (
                    <div
                        className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
                        style={{
                            backgroundImage: `url(${styleConfig.backgroundImage})`,
                            opacity: styleConfig.backgroundImageOpacity ?? 0.5
                        }}
                    />
                )}

                {/* Layer 2.5: Thinking Chain Panel (editorial collapsible) */}
                {thinking && (
                    <div className="relative z-10 select-none" style={{ marginBottom: thinkingExpanded ? '6px' : '2px' }}>
                        {/* Collapsed toggle */}
                        <div
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setThinkingExpanded(prev => !prev); }}
                            className="flex items-center gap-1.5 cursor-pointer active:opacity-60 transition-opacity"
                            style={{ userSelect: 'none' }}
                        >
                            <span style={{
                                fontFamily: "'Georgia', 'Palatino Linotype', 'Book Antiqua', 'Palatino', serif",
                                fontStyle: 'italic',
                                fontSize: '10px',
                                letterSpacing: '0.5px',
                                color: styleConfig.textColor ? `${styleConfig.textColor}66` : 'rgba(120, 110, 95, 0.55)',
                            }}>
                                ‹ 𝘛𝘩𝘪𝘯𝘬𝘪𝘯𝘨 ›
                            </span>
                            <svg
                                viewBox="0 0 10 6" fill="none" className="transition-transform duration-200"
                                style={{
                                    width: '8px', height: '5px',
                                    transform: thinkingExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                    opacity: 0.35,
                                }}
                            >
                                <path d="M1 1L5 5L9 1" stroke={styleConfig.textColor || '#786e5f'} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>

                        {/* Expanded content */}
                        <div
                            className="transition-all duration-300 ease-in-out"
                            style={{
                                maxHeight: thinkingExpanded ? '240px' : '0',
                                opacity: thinkingExpanded ? 1 : 0,
                                overflow: 'hidden',
                                marginTop: thinkingExpanded ? '4px' : '0',
                            }}
                        >
                            <div
                                className="overflow-y-auto no-scrollbar"
                                style={{
                                    maxHeight: '220px',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    background: styleConfig.textColor
                                        ? `${styleConfig.textColor}08`
                                        : 'rgba(140, 130, 115, 0.06)',
                                    borderTop: `1px solid ${styleConfig.textColor ? `${styleConfig.textColor}12` : 'rgba(140, 130, 115, 0.1)'}`,
                                    borderBottom: `1px solid ${styleConfig.textColor ? `${styleConfig.textColor}12` : 'rgba(140, 130, 115, 0.1)'}`,
                                }}
                            >
                                <div style={{
                                    fontSize: '11px',
                                    lineHeight: '1.65',
                                    color: styleConfig.textColor ? `${styleConfig.textColor}88` : 'rgba(80, 72, 60, 0.55)',
                                    fontFamily: "'Georgia', 'Palatino Linotype', serif",
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}>
                                    {thinking}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Layer 3: Reply/Quote Block */}
                {replyTo && (
                    <div className="relative z-10 mb-1 text-[10px] bg-black/5 p-1.5 rounded-md border-l-2 border-black/20 opacity-60 flex flex-col gap-0.5 max-w-full overflow-hidden">
                        <span className="font-bold opacity-90 truncate">{replyTo.name}</span>
                        {imageReply ? (
                            <span className="flex items-center gap-1.5 min-w-0">
                                {safeReplyImage.isLoaded && (
                                    <img
                                        src={safeReplyImage.src}
                                        data-testid="reply-image-thumbnail"
                                        className="h-9 w-9 shrink-0 rounded object-cover bg-black/10"
                                        alt="引用图片"
                                        loading="lazy"
                                        decoding="async"
                                        onError={safeReplyImage.markFailed}
                                    />
                                )}
                                <span className="truncate italic">{imageReply.text}</span>
                            </span>
                        ) : (
                            <span className="truncate italic">"{replyTo.content}"</span>
                        )}
                    </div>
                )}

                {/* Layer 4: Text Content */}
                <div
                    className="sully-bubble-text relative z-10 block leading-relaxed whitespace-pre-wrap"
                    style={{
                        color: styleConfig.textColor,
                        display: 'block',
                        maxWidth: '100%',
                        minWidth: 0,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'break-word',
                        wordBreak: 'normal',
                        writingMode: 'horizontal-tb',
                        textOrientation: 'mixed',
                        fontSize: styleConfig.fontSize ? `${styleConfig.fontSize}px` : '15px',
                        textShadow: styleConfig.textShadow || undefined,
                    }}
                >
                    {renderMarkdown(displayContent)}
                </div>

                {/* Layer 4.5: Source Tag (跨端来源标记) */}
                {sourceTag && (
                    <div className="relative z-10 mt-1 flex justify-end">
                        <span
                            className="text-[10px] tracking-wide"
                            style={{
                                color: styleConfig.textColor ? `${styleConfig.textColor}55` : 'rgba(0,0,0,0.28)',
                                fontFamily: "'SF Pro Text', 'Segoe UI', sans-serif",
                            }}
                        >
                            {sourceTag}
                        </span>
                    </div>
                )}

                {/* Layer 5: Translate Toggle */}
                {showTranslateButton && (
                    <div className="relative z-10 mt-2 flex justify-end">
                        <button
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onTranslateToggle?.(); }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all active:scale-95 select-none"
                            style={{
                                color: styleConfig.textColor,
                                opacity: 0.45,
                                backgroundColor: isShowingTarget ? 'rgba(0,0,0,0.06)' : 'transparent',
                            }}
                        >
                            {isShowingTarget ? (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clipRule="evenodd" /></svg>
                                    <span>原文</span>
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M7.75 2.75a.75.75 0 0 0-1.5 0v1.258a32.987 32.987 0 0 0-3.599.278.75.75 0 1 0 .198 1.487A31.545 31.545 0 0 1 8.7 5.545 19.381 19.381 0 0 1 7.257 9.04a19.391 19.391 0 0 1-1.727-2.29.75.75 0 1 0-1.29.77 20.9 20.9 0 0 0 2.023 2.684 19.549 19.549 0 0 1-3.158 2.57.75.75 0 1 0 .86 1.229A21.056 21.056 0 0 0 7.5 11.03c1.1.95 2.3 1.79 3.593 2.49a.75.75 0 1 0 .69-1.331A19.545 19.545 0 0 1 8.46 9.89a20.893 20.893 0 0 0 1.91-4.644h2.38a.75.75 0 0 0 0-1.5h-3v-1a.75.75 0 0 0-.75-.75Z" /><path d="M12.75 10a.75.75 0 0 1 .692.462l2.5 6a.75.75 0 1 1-1.384.576l-.532-1.278h-3.052l-.532 1.278a.75.75 0 1 1-1.384-.576l2.5-6A.75.75 0 0 1 12.75 10Zm-1.018 4.26h2.036L12.75 11.6l-1.018 2.66Z" /></svg>
                                    <span>译</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatBubble;
