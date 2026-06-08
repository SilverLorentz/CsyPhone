// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import ChatMessageBubble from './ChatMessageBubble';

describe('ChatMessageBubble', () => {
    it('keeps explicit share actions available without selectable text classes', () => {
        const onShare = vi.fn();
        const onEnterSelectMode = vi.fn();

        const { container } = render(
            <ChatMessageBubble
                index={3}
                role="assistant"
                content={'第一段内容\n\n第二段内容'}
                actions={{
                    onDelete: vi.fn(),
                    onEnterSelectMode,
                    onRegenerate: vi.fn(),
                    onShare,
                }}
            />,
        );

        expect(container.querySelector('.select-text, .select-all')).toBeNull();

        fireEvent.contextMenu(screen.getByText('第一段内容'));

        fireEvent.click(screen.getByRole('button', { name: '分享' }));
        expect(onShare).toHaveBeenCalledWith(3, '第一段内容');

        fireEvent.contextMenu(screen.getByText('第一段内容'));
        fireEvent.click(screen.getByRole('button', { name: '多选' }));
        expect(onEnterSelectMode).toHaveBeenCalledWith('3-0', '第一段内容');
    });
});
