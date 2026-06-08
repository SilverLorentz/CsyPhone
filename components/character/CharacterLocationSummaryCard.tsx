import React, { memo } from 'react';

interface CharacterLocationSummaryCardProps {
    cityOverride?: string;
    cityAdcode?: string;
    isFictionalCity?: boolean;
    cityReferenceReal?: string;
    onEdit: () => void;
}

function getSummaryText(props: Pick<CharacterLocationSummaryCardProps, 'cityOverride' | 'cityAdcode' | 'isFictionalCity' | 'cityReferenceReal'>): { title: string; subtitle: string } {
    const { cityOverride, cityAdcode, isFictionalCity, cityReferenceReal } = props;

    if (!cityOverride && !isFictionalCity) {
        return {
            title: '未设置生活城市',
            subtitle: '外卖、本地生活等内容会缺少稳定的地理参照',
        };
    }

    if (isFictionalCity) {
        const title = cityOverride || '未命名架空城市';
        const subtitle = cityReferenceReal
            ? `架空城市 · 参照 ${cityReferenceReal}`
            : '架空城市 · 未设置现实参照';
        return { title, subtitle };
    }

    // Real city
    const subtitle = cityAdcode
        ? `真实城市 · 已绑定地区编码 ${cityAdcode}`
        : '真实城市';
    return { title: cityOverride!, subtitle };
}

const CharacterLocationSummaryCard: React.FC<CharacterLocationSummaryCardProps> = memo(({
    cityOverride,
    cityAdcode,
    isFictionalCity,
    cityReferenceReal,
    onEdit,
}) => {
    const { title, subtitle } = getSummaryText({ cityOverride, cityAdcode, isFictionalCity, cityReferenceReal });
    const isEmpty = !cityOverride && !isFictionalCity;

    return (
        <div
            onClick={onEdit}
            className="bg-white rounded-3xl p-5 shadow-sm cursor-pointer hover:bg-slate-50/80 transition-colors group"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onEdit(); }}
        >
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block pointer-events-none">
                📍 地理设定
            </label>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium truncate ${isEmpty ? 'text-slate-400' : 'text-slate-700'}`}>
                        {title}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {subtitle}
                    </div>
                </div>
                <span
                    className="shrink-0 text-[11px] font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-full group-hover:bg-primary/10 transition-colors"
                    aria-hidden="true"
                >
                    编辑
                </span>
            </div>
        </div>
    );
});
CharacterLocationSummaryCard.displayName = 'CharacterLocationSummaryCard';

export default CharacterLocationSummaryCard;
