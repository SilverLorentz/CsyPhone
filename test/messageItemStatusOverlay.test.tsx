import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageItem from '../components/chat/MessageItem';
import type { StatusCardData } from '../types/statusCard';
import { AFTERGLOW_CUSTOM_MOTIFS_STORAGE_KEY } from '../utils/afterglowMotifs';

vi.mock('../utils/haptics', () => ({
    haptic: {
        heavy: vi.fn(),
    },
}));

vi.mock('../components/chat/ThemeRegistry', () => ({
    THEME_PLUGINS: {},
}));

vi.mock('../components/chat/StatusCardRenderer', () => ({
    default: ({ data }: { data: StatusCardData }) => (
        <div data-testid="mock-status-card-renderer">{data.body}</div>
    ),
}));

const baseTheme = {
    id: 'default',
    type: 'preset',
    user: {},
    ai: {},
} as any;

const baseMessage = {
    id: 42,
    role: 'assistant',
    type: 'text',
    content: '今晚见。',
    timestamp: new Date('2026-04-13T20:00:00+08:00').getTime(),
    metadata: {},
} as any;

class AutoLoadImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = '';

    get src() {
        return this._src;
    }

    set src(value: string) {
        this._src = value;
        queueMicrotask(() => this.onload?.());
    }
}

function messageItemProps(extraProps: Record<string, unknown> = {}) {
    return {
        msg: baseMessage,
        isFirstInGroup: true,
        isLastInGroup: true,
        activeTheme: baseTheme,
        charAvatar: '/char.png',
        charName: 'Marcus',
        userAvatar: '/user.png',
        onLongPress: vi.fn(),
        selectionMode: false,
        isSelected: false,
        onToggleSelect: vi.fn(),
        onTransferAction: vi.fn(),
        onPlayVoice: vi.fn(),
        onStopVoice: vi.fn(),
        onRetryVoice: vi.fn(),
        onToggleVoiceText: vi.fn(),
        ...extraProps,
    };
}

function renderMessageItem(extraProps: Record<string, unknown> = {}) {
    return render(<MessageItem {...messageItemProps(extraProps)} />);
}

beforeEach(() => {
    vi.stubGlobal('Image', AutoLoadImage);
    localStorage.clear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('MessageItem status overlay', () => {
    it('keeps status card overlays open past 8 seconds and closes only when the backdrop is clicked', async () => {
        vi.useFakeTimers();

        renderMessageItem({
            statusCardData: {
                cardType: 'custom_text',
                body: 'Location: Executive Office',
                style: {},
            } satisfies StatusCardData,
        });

        fireEvent.click(screen.getByAltText('avatar').parentElement!);
        expect(screen.getByTestId('status-card-overlay-shell')).toBeInTheDocument();
        expect(screen.getByTestId('inner-voice-backdrop')).toHaveAttribute(
            'style',
            'background-color: transparent;',
        );

        vi.advanceTimersByTime(9000);
        expect(screen.getByTestId('status-card-overlay-shell')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('inner-voice-backdrop'));
        expect(screen.queryByTestId('status-card-overlay-shell')).not.toBeInTheDocument();
    });

    it('keeps classic inner voice overlays open past 8 seconds and closes only when the backdrop is clicked', () => {
        vi.useFakeTimers();

        renderMessageItem({
            innerVoice: '今天想把这些话慢慢说完，再晚一点也没关系。',
        });

        fireEvent.click(screen.getByAltText('avatar').parentElement!);
        expect(screen.getByTestId('inner-voice-overlay-shell')).toBeInTheDocument();

        vi.advanceTimersByTime(9000);
        expect(screen.getByTestId('inner-voice-overlay-shell')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('inner-voice-backdrop'));
        expect(screen.queryByTestId('inner-voice-overlay-shell')).not.toBeInTheDocument();
    });

    it('closes custom status card overlays from the fixed close button', async () => {
        renderMessageItem({
            statusCardData: {
                cardType: 'custom_text',
                body: 'Custom voice note',
                style: {},
            } satisfies StatusCardData,
        });

        fireEvent.click(screen.getByAltText('avatar').parentElement!);
        expect(await screen.findByTestId('status-card-overlay-shell')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('inner-voice-close-button'));
        expect(screen.queryByTestId('status-card-overlay-shell')).not.toBeInTheDocument();
        expect(screen.queryByTestId('inner-voice-backdrop')).not.toBeInTheDocument();
    });

    it('uses separate animation shells for status cards and classic inner voice cards', async () => {
        const firstRender = renderMessageItem({
            statusCardData: {
                cardType: 'custom_text',
                body: 'Action: Reviewing files',
                style: {},
            } satisfies StatusCardData,
        });

        fireEvent.click(screen.getByAltText('avatar').parentElement!);
        const statusShell = await screen.findByTestId('status-card-overlay-shell');
        expect(statusShell).toHaveClass('animate-status-card-in');
        expect(statusShell).toHaveClass('my-auto');
        expect(statusShell).toHaveClass('flex-col');
        expect(statusShell).toHaveClass('items-center');
        expect(statusShell).toHaveClass('justify-center');
        expect(statusShell).not.toContainElement(screen.getByTestId('inner-voice-close-hint'));

        firstRender.unmount();

        renderMessageItem({
            innerVoice: '今天想把这些话慢慢说完。',
        });

        fireEvent.click(screen.getByAltText('avatar').parentElement!);
        const innerVoiceShell = screen.getByTestId('inner-voice-overlay-shell');
        expect(innerVoiceShell).toHaveClass('animate-inner-voice-in');
        expect(innerVoiceShell).toHaveClass('my-auto');
        expect(innerVoiceShell).toHaveClass('flex-col');
        expect(innerVoiceShell).toHaveClass('items-center');
        expect(innerVoiceShell).toHaveClass('justify-center');
        expect(innerVoiceShell).not.toContainElement(screen.getByTestId('inner-voice-close-hint'));
    });

    it('keeps freeform status card overlays centered in an explicit viewport-height shell', async () => {
        renderMessageItem({
            statusCardData: {
                cardType: 'freeform',
                body: 'Out of focus',
                meta: { html: '<html><body><div>Out of focus</div></body></html>' },
                style: {},
            } satisfies StatusCardData,
        });

        fireEvent.click(screen.getByAltText('avatar').parentElement!);

        const statusShell = await screen.findByTestId('status-card-overlay-shell');
        expect(statusShell).toHaveClass('animate-status-card-in');
        expect(statusShell).toHaveClass('my-auto');
        expect(statusShell).toHaveClass('flex-col');
        expect(statusShell).toHaveClass('items-center');
        expect(statusShell).toHaveClass('justify-center');
        expect(statusShell).toHaveStyle({ height: 'calc(100vh - 48px)' });
    });

    it('triggers afterglow generation from the composer and opens the returned card', async () => {
        const longText = [
            '━━━━━━━━━━━━━━',
            '🎭 番外篇 ·【视角重播】',
            '',
            '《灯雨》',
            '山有木兮木有枝 —— 越人歌',
            '',
            '第一页的灯慢慢暗下去。',
            '',
            '第二页的雨停在玻璃外。',
            '',
            '—— 番外小料 ——',
            '◆〈内心OS他没说出口却真实的想法〉',
            '他没有把那句话说完。',
            '━━━━━━━━━━━━━━',
        ].join('\n\n');
        const afterglowCard = {
            cardType: 'freeform',
            body: longText,
            meta: {
                html: '<html><body><div>窗边的灯慢慢暗下去。</div></body></html>',
                afterglowTags: ['#视角重播', '#番外', '#甜', '#吃醋'],
                afterglowCover: {
                    themeSource: '本轮梗',
                    theme: '吃醋 · 嘴上不认动作出卖了他',
                    type: '视角重播',
                    tone: '甜',
                    snacks: ['内心OS'],
                    tags: ['#视角重播', '#番外', '#甜', '#吃醋'],
                },
            },
            style: {},
        } satisfies StatusCardData;
        const onRequestAfterglow = vi.fn().mockResolvedValue(afterglowCard);

        renderMessageItem({ onRequestAfterglow });

        fireEvent.click(screen.getByRole('button', { name: '生成番外篇' }));
        expect(screen.getByTestId('afterglow-composer-dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '随机生成' }));

        await waitFor(() => expect(onRequestAfterglow).toHaveBeenCalledTimes(1));
        expect(onRequestAfterglow).toHaveBeenCalledWith(baseMessage, {});
        expect(await screen.findByTestId('afterglow-reader-shell')).toBeInTheDocument();
        expect(screen.getByTestId('afterglow-reader-core-seed')).toHaveTextContent('本轮梗');
        expect(screen.getByTestId('afterglow-reader-core-seed')).toHaveTextContent('吃醋');
        expect(screen.getByTestId('afterglow-reader-page')).toHaveTextContent('灯雨');
        expect(screen.getByTestId('afterglow-reader-counter')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('afterglow-reader-next'));
        expect(screen.getByTestId('afterglow-reader-page')).toHaveTextContent('第一页的灯慢慢暗下去');
        const nextButton = screen.getByTestId('afterglow-reader-next') as HTMLButtonElement;
        if (!screen.getByTestId('afterglow-reader-page').textContent?.includes('第二页的雨停在玻璃外') && !nextButton.disabled) {
            fireEvent.click(nextButton);
        }
        expect(screen.getByTestId('afterglow-reader-page')).toHaveTextContent('第二页的雨停在玻璃外');
        expect(screen.getByTestId('afterglow-reader-next')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('关闭番外篇'));
        fireEvent.click(screen.getByRole('button', { name: '生成番外篇' }));

        expect(onRequestAfterglow).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('afterglow-composer-dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '打开已有' }));
        expect(await screen.findByTestId('afterglow-reader-shell')).toBeInTheDocument();
    });

    it('passes a specified afterglow motif and can save it into the random pool', async () => {
        const afterglowCard = {
            cardType: 'freeform',
            body: '━━━━━━━━━━━━━━\n🎭 番外篇 ·【if线〔番外〕】\n\n《雨误》\n\n雨声停在门外。\n━━━━━━━━━━━━━━',
            meta: { html: '<html><body><div>雨声停在门外。</div></body></html>' },
            style: {},
        } satisfies StatusCardData;
        const onRequestAfterglow = vi.fn().mockResolvedValue(afterglowCard);

        renderMessageItem({ onRequestAfterglow });

        fireEvent.click(screen.getByRole('button', { name: '生成番外篇' }));
        fireEvent.change(screen.getByTestId('afterglow-motif-input'), { target: { value: '雨夜误会' } });
        fireEvent.click(screen.getByLabelText('同时存入随机池'));
        fireEvent.click(screen.getByRole('button', { name: '按这个梗生成' }));

        await waitFor(() => expect(onRequestAfterglow).toHaveBeenCalledTimes(1));
        expect(onRequestAfterglow).toHaveBeenCalledWith(baseMessage, {
            userMotif: '雨夜误会',
            customMotifs: ['雨夜误会'],
        });

        const saved = JSON.parse(localStorage.getItem(AFTERGLOW_CUSTOM_MOTIFS_STORAGE_KEY) || '[]');
        expect(saved).toHaveLength(1);
        expect(saved[0].text).toBe('雨夜误会');
    });

    it('shows expand control only for long classic inner voice text', () => {
        renderMessageItem({
            innerVoice: '今天风有点大，不过刚好适合把脑子里的杂音都吹散。',
        });

        fireEvent.click(screen.getByAltText('avatar').parentElement!);
        expect(screen.queryByTestId('classic-inner-voice-toggle')).not.toBeInTheDocument();
    });

    it('expands long classic inner voice text inside the existing overlay', () => {
        renderMessageItem({
            innerVoice: '今天风很大，但我还是想把这件事慢慢想完。等会儿回去要先把桌上的纸整理掉，再看看明天那场见面到底要不要提前准备一点，不然晚上又会想起它。'
        });

        fireEvent.click(screen.getByAltText('avatar').parentElement!);

        const toggle = screen.getByTestId('classic-inner-voice-toggle');
        const scrollArea = screen.getByTestId('classic-inner-voice-scroll-area');
        expect(toggle).toHaveTextContent('展开全文');
        expect(scrollArea.style.maxHeight).toBe('');

        fireEvent.click(toggle);
        expect(screen.getByTestId('classic-inner-voice-toggle')).toHaveTextContent('收起全文');
        expect(screen.getByTestId('classic-inner-voice-scroll-area').style.maxHeight).toBe('calc(100vh - 120px)');
        expect(screen.getByTestId('classic-inner-voice-text')).toHaveTextContent('今天风很大');
    });

    it('rerenders the quote block when reply target data changes for the same message', () => {
        const view = renderMessageItem({
            msg: { ...baseMessage, replyTo: undefined },
        });

        expect(screen.queryByText('"第一次引用"')).not.toBeInTheDocument();

        view.rerender(
            <MessageItem
                {...messageItemProps({
                    msg: {
                        ...baseMessage,
                        replyTo: { id: 7, name: 'Sully', content: '第一次引用' },
                    },
                })}
            />,
        );

        expect(screen.getByText('Sully')).toBeInTheDocument();
        expect(screen.getByText('"第一次引用"')).toBeInTheDocument();

        view.rerender(
            <MessageItem
                {...messageItemProps({
                    msg: {
                        ...baseMessage,
                        replyTo: { id: 8, name: 'Sully', content: '第二次引用' },
                    },
                })}
            />,
        );

        expect(screen.queryByText('"第一次引用"')).not.toBeInTheDocument();
        expect(screen.getByText('"第二次引用"')).toBeInTheDocument();
    });

    it('renders image replies as thumbnails instead of raw URLs', async () => {
        const imageUrl = 'https://cdn.example.com/photos/window-selfie.webp';
        renderMessageItem({
            msg: {
                ...baseMessage,
                replyTo: {
                    id: 9,
                    name: 'Sully',
                    content: imageUrl,
                    type: 'image',
                    thumbnailUrl: imageUrl,
                    visualSummary: '窗边自拍',
                },
            },
        });

        await waitFor(() => {
            expect(screen.getByTestId('reply-image-thumbnail')).toHaveAttribute('src', imageUrl);
        });
        expect(screen.getByText('[图片]')).toBeInTheDocument();
        expect(screen.queryByText('窗边自拍')).not.toBeInTheDocument();
        expect(screen.queryByText(imageUrl)).not.toBeInTheDocument();
    });
});
