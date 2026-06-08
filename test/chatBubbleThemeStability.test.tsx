import { render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import ChatBubble from '../components/chat/ChatBubble';
import { renderMarkdown } from '../utils/markdownLite';
import { ChatParser } from '../utils/chatParser';
import type { BubbleStyle } from '../types';

const styleConfig: BubbleStyle = {
    textColor: '#222222',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    opacity: 1,
};

const imageLoadResults = new Map<string, 'load' | 'error'>();

class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = '';

    get src() {
        return this._src;
    }

    set src(value: string) {
        this._src = value;
        const result = imageLoadResults.get(value) || 'load';
        queueMicrotask(() => {
            if (result === 'error') this.onerror?.();
            else this.onload?.();
        });
    }
}

describe('chat bubble theme stability', () => {
    beforeEach(() => {
        imageLoadResults.clear();
        vi.stubGlobal('Image', MockImage);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('keeps CJK spaces as display spaces instead of synthetic display line breaks', () => {
        const { container } = render(<div>{renderMarkdown('难 得')}</div>);
        expect(container.firstElementChild?.childElementCount).toBe(1);
        expect(container.textContent).toBe('难 得');
    });

    it('still honors real line breaks in display text', () => {
        const { container } = render(<div>{renderMarkdown('难\n得')}</div>);
        expect(container.firstElementChild?.childElementCount).toBe(2);
        expect(container.textContent).toBe('难得');
    });

    it('does not split short CJK phrases that contain spaces into separate bubbles', () => {
        expect(ChatParser.chunkText('难 得')).toEqual(['难 得']);
        expect(ChatParser.chunkText('今天 好像 能 早 一点')).toEqual(['今天 好像 能 早 一点']);
    });

    it('renders a stable text layer inside real chat bubbles', () => {
        const { container } = render(
            <ChatBubble
                isUser={false}
                styleConfig={styleConfig}
                displayContent="六点下课的话，过来正好赶上晚饭。"
            />
        );

        const textLayer = container.querySelector('.sully-bubble-text') as HTMLElement | null;
        expect(textLayer).not.toBeNull();
        expect(textLayer).toHaveStyle({
            whiteSpace: 'pre-wrap',
            wordBreak: 'normal',
            overflowWrap: 'break-word',
            writingMode: 'horizontal-tb',
        });
    });

    it('keeps visual editor shell styles strong unless advanced CSS targets bubbles', () => {
        const { container } = render(
            <ChatBubble
                isUser={false}
                styleConfig={styleConfig}
                displayContent="没惯"
            />
        );

        const bubbleShell = container.querySelector('.sully-bubble-ai') as HTMLElement | null;
        expect(bubbleShell).not.toBeNull();
        expect(bubbleShell?.style.getPropertyPriority('background')).toBe('important');
        expect(bubbleShell?.style.getPropertyPriority('border-top-left-radius')).toBe('important');
    });

    it('lets advanced CSS win over visual shell styles when bubble override is enabled', () => {
        const { container } = render(
            <>
                <style>
                    {`.sully-bubble-user { background: linear-gradient(135deg, #ff7fbd, #9b7cff) !important; border-radius: 22px 22px 6px 22px !important; }`}
                </style>
                <ChatBubble
                    isUser
                    styleConfig={styleConfig}
                    displayContent="今天好像能早一点"
                    allowCssOverride
                />
            </>
        );

        const bubbleShell = container.querySelector('.sully-bubble-user') as HTMLElement | null;
        expect(bubbleShell).not.toBeNull();
        expect(bubbleShell?.style.getPropertyPriority('background')).toBe('');
        expect(bubbleShell?.style.getPropertyPriority('border-top-left-radius')).toBe('');
    });

    it('renders image reply thumbnails only after preload succeeds', async () => {
        const imageUrl = 'https://cdn.example.com/reply.webp';
        render(
            <ChatBubble
                isUser={false}
                styleConfig={styleConfig}
                displayContent="看到了。"
                replyTo={{
                    id: 9,
                    name: 'Sully',
                    content: imageUrl,
                    type: 'image',
                    thumbnailUrl: imageUrl,
                }}
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('reply-image-thumbnail')).toHaveAttribute('src', imageUrl);
        });
        expect(screen.getByText('[图片]')).toBeInTheDocument();
    });

    it('hides broken image reply thumbnails without exposing a broken img node', async () => {
        const imageUrl = 'https://cdn.example.com/broken-reply.webp';
        imageLoadResults.set(imageUrl, 'error');

        render(
            <ChatBubble
                isUser={false}
                styleConfig={styleConfig}
                displayContent="这条引用还在。"
                replyTo={{
                    id: 10,
                    name: 'Sully',
                    content: imageUrl,
                    type: 'image',
                    thumbnailUrl: imageUrl,
                }}
            />
        );

        await waitFor(() => {
            expect(screen.queryByTestId('reply-image-thumbnail')).not.toBeInTheDocument();
        });
        expect(screen.getByText('[图片]')).toBeInTheDocument();
        expect(screen.queryByText(imageUrl)).not.toBeInTheDocument();
    });
});
