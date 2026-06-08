import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StatusCardRenderer from '../components/chat/StatusCardRenderer';
import { STATUS_CARD_IFRAME_SHELL } from '../components/chat/statusCardIframe';
import type { StatusCardData } from '../types/statusCard';

const originalViewport = {
    width: window.innerWidth,
    height: window.innerHeight,
};

function setViewportSize(width: number, height: number) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
    window.dispatchEvent(new Event('resize'));
}

function reportFrameSize(frame: HTMLIFrameElement, channel: string | null, width: number, height: number) {
    act(() => {
        const messageEvent = new MessageEvent('message', {
            data: { type: 'preview-height', channel, width, height },
        });
        Object.defineProperty(messageEvent, 'source', { value: frame.contentWindow });
        window.dispatchEvent(messageEvent);
    });
}

function loadFrame(frame: HTMLIFrameElement) {
    act(() => {
        fireEvent.load(frame);
    });
}

afterEach(() => {
    act(() => {
        setViewportSize(originalViewport.width, originalViewport.height);
    });
});

describe('StatusCardRenderer', () => {
    it('keeps the freeform iframe shell isolated from origin and network access', () => {
        expect(STATUS_CARD_IFRAME_SHELL).toContain("connect-src 'none'");
        expect(STATUS_CARD_IFRAME_SHELL).toContain("base-uri 'none'");
        expect(STATUS_CARD_IFRAME_SHELL).toContain("form-action 'none'");
        expect(STATUS_CARD_IFRAME_SHELL).toContain("media-src data: blob:");
        expect(STATUS_CARD_IFRAME_SHELL).toContain("defineBlockedValue(window, 'fetch'");
        expect(STATUS_CARD_IFRAME_SHELL).toContain("defineBlockedValue(window, 'XMLHttpRequest'");
        expect(STATUS_CARD_IFRAME_SHELL).toContain("collectAndRemoveScripts");
        expect(STATUS_CARD_IFRAME_SHELL).toContain("node.hasAttribute('src')");
        expect(STATUS_CARD_IFRAME_SHELL).toContain("type === 'text/javascript'");
    });

    it('sizes freeform cards from the reported html width and height', async () => {
        const data: StatusCardData = {
            cardType: 'freeform',
            body: 'Custom card',
            meta: {
                html: '<html><body><div style="height:360px">Marcus</div></body></html>',
            },
            style: {},
        };

        render(<StatusCardRenderer data={data} />);

        const frame = screen.getByTitle('Freeform creative card') as HTMLIFrameElement;
        const fitShell = screen.getByTestId('freeform-status-card-fit');
        expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
        expect(frame).toHaveStyle({ height: '1px' });

        loadFrame(frame);

        const channel = frame.getAttribute('data-preview-channel');
        expect(channel).toBeTruthy();

        reportFrameSize(frame, channel, 286, 360);

        await waitFor(() => {
            expect(fitShell).toHaveStyle({ width: '294px' });
            expect(fitShell).toHaveStyle({ height: '368px' });
            expect(frame).toHaveStyle({ width: '294px' });
            expect(frame).toHaveStyle({ height: '368px' });
            expect(frame.style.transform).toBe('translate(-50%, -50%) scale(1)');
        });
    });

    it('scales freeform cards down when their width exceeds the mobile viewport', async () => {
        setViewportSize(220, 1000);

        const data: StatusCardData = {
            cardType: 'freeform',
            body: 'Wide card',
            meta: {
                html: '<html><body><div style="width:392px;height:200px">wide</div></body></html>',
            },
            style: {},
        };

        render(<StatusCardRenderer data={data} />);

        const frame = screen.getByTitle('Freeform creative card') as HTMLIFrameElement;
        const fitShell = screen.getByTestId('freeform-status-card-fit');
        loadFrame(frame);
        const channel = frame.getAttribute('data-preview-channel');

        reportFrameSize(frame, channel, 392, 200);

        await waitFor(() => {
            expect(fitShell).toHaveStyle({ width: '200px' });
            expect(fitShell).toHaveStyle({ height: '104px' });
            expect(frame).toHaveStyle({ width: '400px' });
            expect(frame).toHaveStyle({ height: '208px' });
            expect(frame.style.transform).toBe('translate(-50%, -50%) scale(0.5)');
        });
    });

    it('scales freeform cards down when their height exceeds the viewport', async () => {
        setViewportSize(1000, 496);

        const data: StatusCardData = {
            cardType: 'freeform',
            body: 'Tall card',
            meta: {
                html: '<html><body><div style="width:192px;height:792px">tall</div></body></html>',
            },
            style: {},
        };

        render(<StatusCardRenderer data={data} />);

        const frame = screen.getByTitle('Freeform creative card') as HTMLIFrameElement;
        const fitShell = screen.getByTestId('freeform-status-card-fit');
        loadFrame(frame);
        const channel = frame.getAttribute('data-preview-channel');

        reportFrameSize(frame, channel, 192, 792);

        await waitFor(() => {
            expect(fitShell).toHaveStyle({ width: '100px' });
            expect(fitShell).toHaveStyle({ height: '400px' });
            expect(frame).toHaveStyle({ width: '200px' });
            expect(frame).toHaveStyle({ height: '800px' });
            expect(frame.style.transform).toBe('translate(-50%, -50%) scale(0.5)');
        });
    });

    it('uses the smaller scale when both freeform card axes overflow', async () => {
        setViewportSize(420, 496);

        const data: StatusCardData = {
            cardType: 'freeform',
            body: 'Large card',
            meta: {
                html: '<html><body><div style="width:1192px;height:792px">large</div></body></html>',
            },
            style: {},
        };

        render(<StatusCardRenderer data={data} />);

        const frame = screen.getByTitle('Freeform creative card') as HTMLIFrameElement;
        const fitShell = screen.getByTestId('freeform-status-card-fit');
        loadFrame(frame);
        const channel = frame.getAttribute('data-preview-channel');

        reportFrameSize(frame, channel, 1192, 792);

        await waitFor(() => {
            expect(fitShell).toHaveStyle({ width: '400px' });
            expect(fitShell).toHaveStyle({ height: '267px' });
            expect(frame).toHaveStyle({ width: '1200px' });
            expect(frame).toHaveStyle({ height: '800px' });
            expect(frame.style.transform).toContain('scale(0.3333333333333333)');
        });
    });

    it('passes the allowScripts flag only for opted-in freeform cards', async () => {
        const data: StatusCardData = {
            cardType: 'freeform',
            body: 'Custom card',
            meta: {
                html: '<html><body><button id="toggle">Toggle</button><script>document.body.dataset.ready = "yes";</script></body></html>',
                allowScripts: true,
            },
            style: {},
        };

        render(<StatusCardRenderer data={data} />);

        const frame = screen.getByTitle('Freeform creative card') as HTMLIFrameElement;
        const postMessageSpy = vi.spyOn(frame.contentWindow!, 'postMessage');

        loadFrame(frame);

        await waitFor(() => {
            expect(postMessageSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'preview-update',
                    html: data.meta?.html,
                    allowScripts: true,
                }),
                '*',
            );
        });
    });

    it('renders custom text cards with the dedicated non-fallback shell', () => {
        const data: StatusCardData = {
            cardType: 'custom_text',
            title: 'Location',
            body: '中环泰臣大厦顶层，执行总裁办公室',
            footer: 'Marcus',
            style: {},
        };

        render(<StatusCardRenderer data={data} />);

        expect(screen.getByTestId('custom-text-status-card')).toHaveTextContent('Location');
        expect(screen.getByTestId('custom-text-status-card')).toHaveTextContent('中环泰臣大厦顶层');
        expect(screen.queryByText('Inner Voice')).not.toBeInTheDocument();
    });
});
