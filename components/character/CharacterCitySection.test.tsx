// @vitest-environment jsdom

import { createRef } from 'react';
import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterCitySection from './CharacterCitySection';
import type { CharacterCitySectionHandle } from './CharacterCitySection';
import { getCityInputTips, type CityTip } from '../../utils/mapService';

vi.mock('../../utils/mapService', () => ({
    getCityInputTips: vi.fn(),
}));

const mockedGetCityInputTips = vi.mocked(getCityInputTips);

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, reject, resolve };
}

async function advanceDebounce(ms = 260) {
    await act(async () => {
        vi.advanceTimersByTime(ms);
        await Promise.resolve();
    });
}

async function flushPromises() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

function makeTip(name: string, district: string, adcode: string): CityTip {
    return { adcode, district, name };
}

function renderSection(overrides: Partial<ComponentProps<typeof CharacterCitySection>> = {}) {
    const onFieldChange = vi.fn();
    const sectionRef = createRef<CharacterCitySectionHandle>();

    render(
        <CharacterCitySection
            ref={sectionRef}
            characterId="char-1"
            cityOverride={undefined}
            cityAdcode={undefined}
            isFictionalCity={undefined}
            cityReferenceReal={undefined}
            onFieldChange={onFieldChange}
            {...overrides}
        />,
    );

    return { onFieldChange, sectionRef };
}

describe('CharacterCitySection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('keeps a real city selection local until the save button is pressed', async () => {
        mockedGetCityInputTips.mockResolvedValue([
            makeTip('上海', '上海市', '310000'),
        ]);

        const { onFieldChange } = renderSection();
        const input = screen.getByPlaceholderText('输入城市名搜索...');

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '上海' } });

        await advanceDebounce();
        await flushPromises();

        expect(mockedGetCityInputTips).toHaveBeenCalledWith(
            '上海',
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        const suggestion = screen.getByText('上海');
        fireEvent.mouseDown(suggestion.closest('button')!);

        expect(onFieldChange).not.toHaveBeenCalled();
        expect(screen.getByText('已绑定地区编码：310000')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '保存城市' }));

        expect(onFieldChange).toHaveBeenCalledWith('cityOverride', '上海');
        expect(onFieldChange).toHaveBeenCalledWith('cityAdcode', '310000');
    });

    it('waits for at least two characters before starting a city search', async () => {
        mockedGetCityInputTips.mockResolvedValue([
            makeTip('上海', '上海市', '310000'),
        ]);

        renderSection();
        const input = screen.getByPlaceholderText('输入城市名搜索...');

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '上' } });

        await advanceDebounce();
        await flushPromises();

        expect(mockedGetCityInputTips).not.toHaveBeenCalled();
        expect(screen.getByText('至少输入 2 个字再搜索。')).toBeInTheDocument();

        fireEvent.change(input, { target: { value: '上海' } });

        await advanceDebounce();
        await flushPromises();

        expect(mockedGetCityInputTips).toHaveBeenCalledTimes(1);
    });

    it('keeps only the latest autocomplete result when requests resolve out of order', async () => {
        const firstSearch = createDeferred<CityTip[]>();
        const secondSearch = createDeferred<CityTip[]>();

        mockedGetCityInputTips.mockImplementation((keyword) => {
            if (keyword === '上海') return firstSearch.promise;
            if (keyword === '上海市') return secondSearch.promise;
            return Promise.resolve([]);
        });

        renderSection();
        const input = screen.getByPlaceholderText('输入城市名搜索...');

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '上海' } });
        await advanceDebounce();
        await flushPromises();

        fireEvent.change(input, { target: { value: '上海市' } });
        await advanceDebounce();
        await flushPromises();

        await act(async () => {
            firstSearch.resolve([makeTip('上饶', '江西省', '361100')]);
            await Promise.resolve();
        });
        await flushPromises();

        expect(screen.queryByText('上饶')).not.toBeInTheDocument();

        await act(async () => {
            secondSearch.resolve([makeTip('上海', '上海市', '310000')]);
            await Promise.resolve();
        });
        await flushPromises();

        expect(screen.getByText('上海')).toBeInTheDocument();
        expect(screen.queryByText('上饶')).not.toBeInTheDocument();
    });

    it('shows an explicit empty state when no city matches the keyword', async () => {
        mockedGetCityInputTips.mockResolvedValue([]);

        renderSection();
        const input = screen.getByPlaceholderText('输入城市名搜索...');

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '不存在的城市' } });

        await advanceDebounce();
        await flushPromises();

        expect(screen.getByText('未找到匹配城市，请换个关键词试试。')).toBeInTheDocument();
    });

    it('shows an error message when city search fails', async () => {
        mockedGetCityInputTips.mockRejectedValue(new Error('城市搜索失败 (500)'));

        renderSection();
        const input = screen.getByPlaceholderText('输入城市名搜索...');

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '上海' } });

        await advanceDebounce();
        await flushPromises();

        expect(screen.getByText('城市搜索失败 (500)')).toBeInTheDocument();
    });

    it('keeps fictional city typing local-first until the save button is pressed', async () => {
        const { onFieldChange } = renderSection({
            isFictionalCity: true,
        });

        const input = screen.getByPlaceholderText('输入架空城市名...');
        fireEvent.change(input, { target: { value: '新月城' } });

        await act(async () => {
            vi.advanceTimersByTime(190);
            await Promise.resolve();
        });

        expect(mockedGetCityInputTips).not.toHaveBeenCalled();
        expect(onFieldChange).not.toHaveBeenCalledWith('cityOverride', '新月城');

        fireEvent.click(screen.getByRole('button', { name: '保存城市' }));

        expect(onFieldChange).toHaveBeenCalledWith('cityOverride', '新月城');
    });

    it('flushes a pending fictional city draft immediately through the imperative handle', async () => {
        const { onFieldChange, sectionRef } = renderSection({
            isFictionalCity: true,
        });

        const input = screen.getByPlaceholderText('输入架空城市名...');
        fireEvent.change(input, { target: { value: '新月城' } });

        act(() => {
            sectionRef.current?.flushPendingDraft();
        });

        expect(onFieldChange).toHaveBeenCalledWith('cityOverride', '新月城');

        await act(async () => {
            vi.advanceTimersByTime(220);
            await Promise.resolve();
        });

        const cityOverrideCalls = onFieldChange.mock.calls.filter(([field]) => field === 'cityOverride');
        expect(cityOverrideCalls).toHaveLength(1);
    });
});
