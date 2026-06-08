import React from 'react';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import Appearance from './Appearance';
import { useOS } from '../context/OSContext';
import type { AppearancePreset,OSTheme } from '../types';

vi.mock('../context/OSContext', () => ({
    useOS: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor/filesystem', () => ({
    Directory: { Cache: 'CACHE' },
    Filesystem: {
        writeFile: vi.fn(),
        getUri: vi.fn(),
    },
}));

vi.mock('@capacitor/share', () => ({
    Share: { share: vi.fn() },
}));

const mockedUseOS = vi.mocked(useOS);

const theme: OSTheme = {
    hue: 245,
    saturation: 25,
    lightness: 65,
    wallpaper: 'linear-gradient(135deg, #fff, #eee)',
    darkMode: false,
    contentColor: '#ffffff',
    launcherWidgets: {},
    desktopDecorations: [],
};

const preset: AppearancePreset = {
    id: 'preset-a',
    name: '夜色预设',
    createdAt: new Date('2026-05-06T12:00:00+08:00').getTime(),
    theme,
};

const buildContext = (overrides: Record<string, unknown> = {}) => ({
    theme,
    updateTheme: vi.fn(),
    closeApp: vi.fn(),
    setCustomIcon: vi.fn(),
    customIcons: {},
    addToast: vi.fn(),
    appearancePresets: [preset],
    saveAppearancePreset: vi.fn(async () => undefined),
    applyAppearancePreset: vi.fn(async () => undefined),
    deleteAppearancePreset: vi.fn(async () => undefined),
    renameAppearancePreset: vi.fn(async () => undefined),
    exportAppearancePreset: vi.fn(async () => new Blob(['zip'], { type: 'application/zip' })),
    importAppearancePreset: vi.fn(async () => undefined),
    ...overrides,
});

describe('Appearance presets UI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:appearance'), configurable: true });
        Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    it('renders the presets tab and calls preset actions', async () => {
        const context = buildContext();
        mockedUseOS.mockReturnValue(context as any);

        render(<Appearance />);
        fireEvent.click(screen.getByText('外观预设'));

        expect(screen.getByText('保存当前外观')).toBeInTheDocument();
        expect(screen.getByText('夜色预设')).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('预设名称（可选）'), { target: { value: '新外观' } });
        fireEvent.click(screen.getByText('保存'));
        await waitFor(() => expect(context.saveAppearancePreset).toHaveBeenCalledWith('新外观'));

        fireEvent.click(screen.getByText('应用'));
        await waitFor(() => expect(context.applyAppearancePreset).toHaveBeenCalledWith('preset-a'));

        fireEvent.click(screen.getByText('导出'));
        await waitFor(() => expect(context.exportAppearancePreset).toHaveBeenCalledWith('preset-a'));

        fireEvent.click(screen.getByText('重命名'));
        fireEvent.change(screen.getByDisplayValue('夜色预设'), { target: { value: '改名后' } });
        fireEvent.click(screen.getByText('确定'));
        await waitFor(() => expect(context.renameAppearancePreset).toHaveBeenCalledWith('preset-a', '改名后'));

        fireEvent.click(screen.getByText('删除'));
        fireEvent.click(screen.getByText('确认删除'));
        await waitFor(() => expect(context.deleteAppearancePreset).toHaveBeenCalledWith('preset-a'));
    });

    it('calls import handler when a preset file is selected', async () => {
        const context = buildContext();
        mockedUseOS.mockReturnValue(context as any);

        const { container } = render(<Appearance />);
        fireEvent.click(screen.getByText('外观预设'));
        const input = container.querySelector('input[accept=".zip,.json,application/zip,application/json"]') as HTMLInputElement;
        const file = new File(['{}'], 'preset.json', { type: 'application/json' });

        fireEvent.change(input, { target: { files: [file] } });
        await waitFor(() => expect(context.importAppearancePreset).toHaveBeenCalledWith(file));
    });

    it('updates the custom icon frame setting', () => {
        const updateTheme = vi.fn();
        const context = buildContext({ updateTheme, theme: { ...theme, customIconFrame: true } });
        mockedUseOS.mockReturnValue(context as any);

        render(<Appearance />);
        fireEvent.click(screen.getByText('应用图标'));

        fireEvent.click(screen.getByText('无外框'));
        expect(updateTheme).toHaveBeenCalledWith({ customIconFrame: false });

        fireEvent.click(screen.getByText('玻璃底'));
        expect(updateTheme).toHaveBeenCalledWith({ customIconFrame: true });
    });
});
