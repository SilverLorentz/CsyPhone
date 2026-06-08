// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CharacterLocationSummaryCard from './CharacterLocationSummaryCard';

describe('CharacterLocationSummaryCard', () => {
    it('shows empty state when no city is set', () => {
        const onEdit = vi.fn();
        render(<CharacterLocationSummaryCard onEdit={onEdit} />);

        expect(screen.getByText('未设置生活城市')).toBeInTheDocument();
        expect(screen.getByText('外卖、本地生活等内容会缺少稳定的地理参照')).toBeInTheDocument();
    });

    it('shows real city with adcode', () => {
        const onEdit = vi.fn();
        render(
            <CharacterLocationSummaryCard
                cityOverride="上海"
                cityAdcode="310000"
                onEdit={onEdit}
            />,
        );

        expect(screen.getByText('上海')).toBeInTheDocument();
        expect(screen.getByText('真实城市 · 已绑定地区编码 310000')).toBeInTheDocument();
    });

    it('shows real city without adcode', () => {
        const onEdit = vi.fn();
        render(
            <CharacterLocationSummaryCard
                cityOverride="某个城市"
                onEdit={onEdit}
            />,
        );

        expect(screen.getByText('某个城市')).toBeInTheDocument();
        expect(screen.getByText('真实城市')).toBeInTheDocument();
    });

    it('shows fictional city with reference', () => {
        const onEdit = vi.fn();
        render(
            <CharacterLocationSummaryCard
                cityOverride="新月城"
                isFictionalCity={true}
                cityReferenceReal="成都"
                onEdit={onEdit}
            />,
        );

        expect(screen.getByText('新月城')).toBeInTheDocument();
        expect(screen.getByText('架空城市 · 参照 成都')).toBeInTheDocument();
    });

    it('shows fictional city without reference', () => {
        const onEdit = vi.fn();
        render(
            <CharacterLocationSummaryCard
                isFictionalCity={true}
                onEdit={onEdit}
            />,
        );

        expect(screen.getByText('未命名架空城市')).toBeInTheDocument();
        expect(screen.getByText('架空城市 · 未设置现实参照')).toBeInTheDocument();
    });

    it('calls onEdit when the card is clicked', () => {
        const onEdit = vi.fn();
        render(<CharacterLocationSummaryCard onEdit={onEdit} />);

        fireEvent.click(screen.getByRole('button'));
        expect(onEdit).toHaveBeenCalledTimes(1);
    });

    it('has exactly one interactive element (no nested buttons)', () => {
        const onEdit = vi.fn();
        render(<CharacterLocationSummaryCard onEdit={onEdit} />);

        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(1);
    });
});
