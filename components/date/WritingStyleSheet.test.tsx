// @vitest-environment jsdom

import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WritingStyleSheet from './WritingStyleSheet';

vi.mock('framer-motion', async () => {
    const ReactActual = await vi.importActual<typeof import('react')>('react');
    type MotionProps = React.HTMLAttributes<HTMLElement> & {
        layout?: boolean;
        initial?: unknown;
        animate?: unknown;
        exit?: unknown;
        transition?: unknown;
    };

    const createMotionElement = (tag: 'div' | 'section') => ReactActual.forwardRef<HTMLElement, MotionProps>((props, ref) => {
        const { layout, initial, animate, exit, transition, ...rest } = props;
        void layout;
        void initial;
        void animate;
        void exit;
        void transition;
        return ReactActual.createElement(tag, { ...rest, ref }, props.children);
    });

    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: {
            div: createMotionElement('div'),
            section: createMotionElement('section'),
        },
        useReducedMotion: () => true,
    };
});

const mockMatchMedia = () => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: query.includes('prefers-reduced-motion'),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
};

const renderControlledSheet = (initialStyle?: string) => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const Harness = () => {
        const [style, setStyle] = useState<string | undefined>(initialStyle);

        return (
            <WritingStyleSheet
                isOpen
                currentStyle={style}
                onClose={onClose}
                onSelect={(nextStyle) => {
                    onSelect(nextStyle);
                    setStyle(nextStyle);
                }}
            />
        );
    };

    const result = render(<Harness />);

    return { ...result, onClose, onSelect };
};

describe('WritingStyleSheet', () => {
    beforeEach(() => {
        mockMatchMedia();
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('switches selected styles without closing the sheet', async () => {
        const { onClose, onSelect } = renderControlledSheet('lyrical');

        await waitFor(() => {
            expect(screen.getByText(/晚风是温的/)).toBeInTheDocument();
        });
        expect(screen.getByText('普鲁斯特《追忆似水年华》、曹雪芹《红楼梦》')).toBeInTheDocument();
        expect(screen.queryByText('浓墨重彩，草木皆有情，长句里铺感官')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '选择冷处偏佳' }));

        expect(onSelect).toHaveBeenLastCalledWith('tender');
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: '文风' })).toBeInTheDocument();
        expect(screen.getAllByText('冷处偏佳').length).toBeGreaterThan(0);
    });

    it('keeps only one sample preview open at a time', async () => {
        renderControlledSheet('lyrical');

        await waitFor(() => {
            expect(screen.getByText(/晚风是温的/)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: '选择静水深流' }));

        await waitFor(() => {
            expect(screen.getByText(/这一句“还好”/)).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.queryByText(/晚风是温的/)).not.toBeInTheDocument();
        });
    });

    it('scrolls the current style into view only when the sheet opens', () => {
        vi.useFakeTimers();
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;

        try {
            renderControlledSheet('lyrical');

            act(() => {
                vi.advanceTimersByTime(90);
            });

            expect(scrollIntoView).toHaveBeenCalledTimes(1);
            expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'center', behavior: 'auto' });

            fireEvent.click(screen.getByRole('button', { name: '选择静水深流' }));

            act(() => {
                vi.advanceTimersByTime(90);
            });

            expect(scrollIntoView).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('writes custom text back and preserves the draft after switching away', async () => {
        const { onSelect } = renderControlledSheet();
        const customStyle = '像深夜电台，语速慢，多用第二人称，句子短，留白多。';
        const getCustomButton = () => document.body.querySelector('[aria-label="选择自定义文风"]') as HTMLElement;
        const getCozyButton = () => document.body.querySelector('[aria-label="选择相对忘言"]') as HTMLElement;
        const getTextarea = () => document.body.querySelector('textarea') as HTMLTextAreaElement;

        fireEvent.click(getCustomButton());
        fireEvent.change(getTextarea(), { target: { value: customStyle } });

        expect(onSelect).toHaveBeenLastCalledWith(customStyle);

        fireEvent.click(getCozyButton());
        expect(onSelect).toHaveBeenLastCalledWith('cozy');

        fireEvent.click(getCustomButton());

        expect(getTextarea()).toHaveValue(customStyle);
        expect(onSelect).toHaveBeenLastCalledWith(customStyle);
    });
});
