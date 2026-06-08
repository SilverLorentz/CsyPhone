// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import ApiSettings from './ApiSettings';

const {
    addApiPreset,
    addToast,
    mockApiConfig,
    removeApiPreset,
    setAvailableModels,
    updateApiConfig,
} = vi.hoisted(() => ({
    addApiPreset: vi.fn(),
    addToast: vi.fn(),
    mockApiConfig: {
        apiKey: 'seed-key',
        baseUrl: 'https://api.example.com',
        model: 'gpt-4o-mini',
        temperature: 0.85,
        disablePrefill: false,
        streamChat: false,
    },
    removeApiPreset: vi.fn(),
    setAvailableModels: vi.fn(),
    updateApiConfig: vi.fn(),
}));

vi.mock('../../context/OSContext', () => ({
    useOS: () => ({
        apiConfig: mockApiConfig,
        updateApiConfig,
        availableModels: [],
        setAvailableModels,
        apiPresets: [],
        addApiPreset,
        removeApiPreset,
        addToast,
    }),
}));

describe('ApiSettings', () => {
    beforeEach(() => {
        addApiPreset.mockReset();
        addToast.mockReset();
        removeApiPreset.mockReset();
        setAvailableModels.mockReset();
        updateApiConfig.mockReset();
    });

    it('applies guarded props to primary api url and key inputs', () => {
        render(<ApiSettings />);

        const urlInput = screen.getByPlaceholderText('https://...');
        const keyInput = screen.getByPlaceholderText('sk-...');

        expect(urlInput).toHaveAttribute('autocomplete', 'new-password');
        expect(urlInput).toHaveAttribute('inputmode', 'url');
        expect(urlInput.getAttribute('name')).toMatch(/^sully-field-[a-z0-9]+-[a-z0-9]+$/);
        expect(urlInput).toHaveAttribute('data-lpignore', 'true');
        expect(urlInput).toHaveAttribute('data-1p-ignore', 'true');

        expect(keyInput).toHaveAttribute('type', 'text');
        expect(keyInput).toHaveAttribute('autocomplete', 'new-password');
        expect(keyInput).toHaveAttribute('inputmode', 'text');
        expect(keyInput.getAttribute('name')).toMatch(/^sully-field-[a-z0-9]+-[a-z0-9]+$/);
        expect(keyInput).toHaveAttribute('data-lpignore', 'true');
        expect(keyInput).toHaveAttribute('data-1p-ignore', 'true');
    });

    it('saves the exposed main chat temperature', () => {
        render(<ApiSettings />);

        fireEvent.change(screen.getByLabelText('主聊天自由度数值'), { target: { value: '1.25' } });
        fireEvent.click(screen.getByText('保存配置'));

        expect(updateApiConfig).toHaveBeenCalledWith(expect.objectContaining({
            temperature: 1.25,
        }));
    });

    it('saves the experimental streaming chat toggle', () => {
        render(<ApiSettings />);

        fireEvent.click(screen.getByLabelText('流式收消息（实验）', { exact: false }));
        fireEvent.click(screen.getByText('保存配置'));

        expect(updateApiConfig).toHaveBeenCalledWith(expect.objectContaining({
            streamChat: true,
        }));
    });
});
