// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import Modal from './Modal';

describe('Modal mobile scroll layout', () => {
    it('keeps the shell height constrained and makes the body the scroll container', () => {
        render(
            <Modal
                isOpen
                title="聊天设置"
                onClose={vi.fn()}
                footer={<button>保存设置</button>}
            >
                <div>long settings content</div>
            </Modal>,
        );

        const shell = screen.getByTestId('modal-shell');
        const body = screen.getByTestId('modal-scroll-body');

        expect(shell.className).toContain('flex-col');
        expect(shell.style.maxHeight).toContain('--visual-viewport-height');
        expect(body.className).toContain('min-h-0');
        expect(body.className).toContain('flex-1');
        expect(body.className).toContain('overflow-y-auto');
        expect(body.className).toContain('overscroll-contain');
        expect(body.style.touchAction).toBe('pan-y');
    });
});
