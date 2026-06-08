// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import SubApiSettings from './SubApiSettings';
import {
    LEGACY_SUB_API_BASE_URL_KEY,
    LEGACY_SUB_API_KEY,
    LEGACY_SUB_API_MODEL_KEY,
    SECONDARY_API_CONFIG_KEY,
    SECONDARY_API_POOL_KEY,
} from '../../utils/runtimeConfig';

const { addToast } = vi.hoisted(() => ({
    addToast: vi.fn(),
}));

vi.mock('../../context/OSContext', () => ({
    useOS: () => ({ addToast }),
}));

describe('SubApiSettings', () => {
    beforeEach(() => {
        localStorage.clear();
        addToast.mockReset();
    });

    it('prefers structured secondary config on load and rewrites legacy keys on save', () => {
        localStorage.setItem(SECONDARY_API_CONFIG_KEY, JSON.stringify({
            apiKey: 'structured-key',
            baseUrl: 'https://structured.example.com/',
            model: 'gpt-structured',
        }));
        localStorage.setItem(LEGACY_SUB_API_KEY, 'legacy-key');
        localStorage.setItem(LEGACY_SUB_API_BASE_URL_KEY, 'https://legacy.example.com');
        localStorage.setItem(LEGACY_SUB_API_MODEL_KEY, 'gpt-legacy');
        const listener = vi.fn();
        window.addEventListener('agent-config-changed', listener);

        try {
            render(<SubApiSettings />);

            const urlInput = screen.getByPlaceholderText('https://...');
            const keyInput = screen.getByPlaceholderText('sk-...');

            expect(urlInput).toHaveValue('https://structured.example.com');
            expect(keyInput).toHaveValue('structured-key');
            expect(screen.getByPlaceholderText('模型名称...')).toHaveValue('gpt-structured');
            expect(urlInput).toHaveAttribute('autocomplete', 'new-password');
            expect(urlInput).toHaveAttribute('inputmode', 'url');
            expect(urlInput.getAttribute('name')).toMatch(/^sully-field-[a-z0-9]+-[a-z0-9]+$/);
            expect(urlInput).toHaveAttribute('data-lpignore', 'true');
            expect(keyInput).toHaveAttribute('type', 'text');
            expect(keyInput).toHaveAttribute('autocomplete', 'new-password');
            expect(keyInput).toHaveAttribute('inputmode', 'text');
            expect(keyInput.getAttribute('name')).toMatch(/^sully-field-[a-z0-9]+-[a-z0-9]+$/);
            expect(keyInput).toHaveAttribute('data-lpignore', 'true');

            fireEvent.click(screen.getByRole('button', { name: /保存到池/i }));

            expect(JSON.parse(localStorage.getItem(SECONDARY_API_CONFIG_KEY) || '{}')).toMatchObject({
                apiKey: 'structured-key',
                baseUrl: 'https://structured.example.com',
                model: 'gpt-structured',
            });
            expect(localStorage.getItem(LEGACY_SUB_API_KEY)).toBe('structured-key');
            expect(localStorage.getItem(LEGACY_SUB_API_BASE_URL_KEY)).toBe('https://structured.example.com');
            expect(localStorage.getItem(LEGACY_SUB_API_MODEL_KEY)).toBe('gpt-structured');
            expect(localStorage.getItem(SECONDARY_API_POOL_KEY)).toContain('gpt-structured');
            expect(listener).toHaveBeenCalledTimes(1);
        } finally {
            window.removeEventListener('agent-config-changed', listener);
        }
    });
});
