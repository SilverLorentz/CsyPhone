// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import MessageItem from '../components/chat/MessageItem';

const storageMocks = vi.hoisted(() => ({
    resolveOriginalImageUrl: vi.fn(),
}));

vi.mock('../utils/generatedImageStorage', () => ({
    getImageMessageDisplayUrl: (message: any) => String(message.metadata?.thumbnailUrl || message.content || ''),
    resolveOriginalImageUrl: storageMocks.resolveOriginalImageUrl,
}));

vi.mock('../utils/haptics', () => ({
    haptic: {
        heavy: vi.fn(),
    },
}));

vi.mock('../components/chat/ThemeRegistry', () => ({
    THEME_PLUGINS: {},
}));

vi.mock('../components/chat/StatusCardRenderer', () => ({
    default: () => <div data-testid="mock-status-card-renderer" />,
}));

const baseTheme = {
    id: 'default',
    type: 'preset',
    user: {},
    ai: {},
} as any;

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

function renderImageMessage(overrides: Record<string, any> = {}) {
    const thumb = 'data:image/webp;base64,thumb';
    const baseMessage = {
        id: 91,
        charId: 'char-1',
        role: 'assistant',
        type: 'image',
        content: thumb,
        timestamp: 1,
        metadata: {
            thumbnailUrl: thumb,
            originalAssetId: 'asset-original-1',
            visualSummary: '窗边自拍',
        },
    };
    const message = {
        ...baseMessage,
        ...overrides,
        metadata: Object.prototype.hasOwnProperty.call(overrides, 'metadata')
            ? overrides.metadata
            : baseMessage.metadata,
    };

    return render(
        <MessageItem
            msg={message as any}
            isFirstInGroup
            isLastInGroup
            activeTheme={baseTheme}
            charAvatar="/char.png"
            charName="Sully"
            userAvatar="/user.png"
            onLongPress={vi.fn()}
            selectionMode={false}
            isSelected={false}
            onToggleSelect={vi.fn()}
        />,
    );
}

function renderEmojiMessage(overrides: Record<string, any> = {}) {
    const baseMessage = {
        id: 92,
        charId: 'char-1',
        role: 'assistant',
        type: 'emoji',
        content: 'https://cdn.example.com/sticker.webp',
        timestamp: 1,
        metadata: {},
    };
    const message = { ...baseMessage, ...overrides };

    return render(
        <MessageItem
            msg={message as any}
            isFirstInGroup
            isLastInGroup
            activeTheme={baseTheme}
            charAvatar="/char.png"
            charName="Sully"
            userAvatar="/user.png"
            onLongPress={vi.fn()}
            selectionMode={false}
            isSelected={false}
            onToggleSelect={vi.fn()}
        />,
    );
}

describe('MessageItem image storage', () => {
    beforeEach(() => {
        imageLoadResults.clear();
        vi.stubGlobal('Image', MockImage);
        storageMocks.resolveOriginalImageUrl.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('renders the thumbnail in chat and lazy-loads the original for preview', async () => {
        storageMocks.resolveOriginalImageUrl.mockResolvedValueOnce('data:image/png;base64,original');

        renderImageMessage();

        await waitFor(() => {
            expect(screen.getByTestId('chat-image-thumbnail')).toHaveAttribute(
                'src',
                'data:image/webp;base64,thumb',
            );
        });

        fireEvent.click(screen.getByRole('button', { name: '打开原图预览' }));
        await waitFor(() => {
            expect(screen.getByTestId('chat-image-preview-img')).toHaveAttribute(
                'src',
                'data:image/png;base64,original',
            );
        });
        expect(storageMocks.resolveOriginalImageUrl).toHaveBeenCalledWith(
            'asset-original-1',
            'data:image/webp;base64,thumb',
        );
    });

    it('hides stale image messages without any displayable source', () => {
        renderImageMessage({
            content: '',
            metadata: {},
        });

        expect(screen.queryByTestId('chat-image-thumbnail')).not.toBeInTheDocument();
        expect(screen.queryByTestId('chat-image-placeholder')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '打开原图预览' })).not.toBeInTheDocument();
    });

    it('hides stale image messages when their stored source fails to load', async () => {
        imageLoadResults.set('https://example.invalid/broken-image.jpg', 'error');
        renderImageMessage({
            content: 'https://example.invalid/broken-image.jpg',
            metadata: {},
        });

        await waitFor(() => {
            expect(screen.queryByTestId('chat-image-thumbnail')).not.toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: '打开原图预览' })).not.toBeInTheDocument();
    });

    it('keeps the generating placeholder when an image has no source yet', () => {
        renderImageMessage({
            content: '',
            metadata: { status: 'generating' },
        });

        expect(screen.getByTestId('chat-image-placeholder')).toHaveTextContent('发送图片中...');
        expect(screen.queryByTestId('chat-image-thumbnail')).not.toBeInTheDocument();
    });

    it('keeps the failed placeholder when an image has no source', () => {
        renderImageMessage({
            content: '',
            metadata: { status: 'failed' },
        });

        expect(screen.getByTestId('chat-image-placeholder')).toHaveTextContent('图片发送失败');
        expect(screen.queryByTestId('chat-image-thumbnail')).not.toBeInTheDocument();
    });

    it('renders emoji image messages only after preload succeeds', async () => {
        renderEmojiMessage();

        await waitFor(() => {
            expect(screen.getByTestId('chat-emoji-image')).toHaveAttribute('src', 'https://cdn.example.com/sticker.webp');
        });
    });

    it('hides broken emoji image messages without exposing a broken img node', async () => {
        imageLoadResults.set('https://cdn.example.com/broken-sticker.webp', 'error');

        renderEmojiMessage({
            content: 'https://cdn.example.com/broken-sticker.webp',
        });

        await waitFor(() => {
            expect(screen.queryByTestId('chat-emoji-image')).not.toBeInTheDocument();
        });
    });
});
