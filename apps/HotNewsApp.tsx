import React,{ useCallback,useEffect,useMemo,useState } from 'react';
import { ArrowSquareOut,ArrowsClockwise,CaretLeft,Fire,Newspaper,PlayCircle,WarningCircle } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { RealtimeContextManager,normalizeHotNewsPlatform } from '../utils/realtimeContext';
import type { HotNewsItem,HotNewsSnapshot } from '../types';

const SLOT_WINDOW = ['00:00-04:00', '04:00-08:00', '08:00-12:00', '12:00-16:00', '16:00-20:00', '20:00-24:00'];

const PLATFORM_TABS = [
    { key: 'all', label: '全部', short: '全', accent: '#1f2937', soft: '#f8fafc' },
    { key: 'weibo', label: '微博', short: '微', accent: '#f04438', soft: '#fff1f0' },
    { key: 'bilibili', label: 'B站', short: 'B', accent: '#00aeec', soft: '#eefaff' },
    { key: 'zhihu', label: '知乎', short: '知', accent: '#1772f6', soft: '#eef5ff' },
    { key: 'baidu', label: '百度', short: '百', accent: '#4e6ef2', soft: '#f1f4ff' },
    { key: 'douyin', label: '抖音', short: '抖', accent: '#111827', soft: '#f3f4f6' },
] as const;

type PlatformTabKey = typeof PLATFORM_TABS[number]['key'];

const PLATFORM_META: Map<string, typeof PLATFORM_TABS[number]> = new Map(PLATFORM_TABS.map(tab => [tab.key, tab]));
const PLATFORM_ORDER: Map<string, number> = new Map(PLATFORM_TABS.map((tab, index) => [tab.key, index]));

function getItemPlatform(item: HotNewsItem): string {
    return normalizeHotNewsPlatform(item.platform || item.source || 'hot') || 'hot';
}

function getPlatformMeta(platform: string) {
    return PLATFORM_META.get(platform as PlatformTabKey) || {
        key: platform,
        label: RealtimeContextManager.HOTNEWS_PLATFORM_LABELS[platform] || platform || '热点',
        short: (RealtimeContextManager.HOTNEWS_PLATFORM_LABELS[platform] || platform || '热').slice(0, 1),
        accent: '#b91c1c',
        soft: '#fff7ed',
    };
}

function groupByPlatform(items: HotNewsItem[]): { platform: string; items: HotNewsItem[] }[] {
    const map = new Map<string, HotNewsItem[]>();
    for (const item of items) {
        const key = getItemPlatform(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
    }
    return Array.from(map, ([platform, platformItems]) => ({ platform, items: platformItems }))
        .sort((a, b) => (PLATFORM_ORDER.get(a.platform) ?? 99) - (PLATFORM_ORDER.get(b.platform) ?? 99));
}

const SnapshotHeader: React.FC<{
    snapshot: HotNewsSnapshot | null;
    totalCount: number;
}> = ({ snapshot,totalCount }) => {
    const fetchedTime = snapshot
        ? new Date(snapshot.fetchedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
    const slotLabel = snapshot ? `${snapshot.date} ${snapshot.slotLabel}版` : '等待快照';

    return (
        <section className="border-b-2 border-stone-900 py-4">
            <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-stone-500">SullyOS Daily</p>
                    <h2 className="mt-1 text-[32px] font-black leading-none tracking-tight text-stone-950">热点日报</h2>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-2xl font-black leading-none text-stone-950">{String(totalCount).padStart(2, '0')}</div>
                    <p className="mt-0.5 text-[10px] font-bold tracking-wide text-stone-500">条快照</p>
                </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
                {slotLabel}
                {snapshot ? ` (${SLOT_WINDOW[snapshot.slot] || ''}) · ${fetchedTime}` : ''}
            </p>
        </section>
    );
};

const PlatformTabs: React.FC<{
    selected: PlatformTabKey;
    counts: Record<string, number>;
    onSelect: (key: PlatformTabKey) => void;
}> = ({ selected,counts,onSelect }) => (
    <div className="-mx-4 overflow-x-auto px-4 py-3">
        <div className="flex min-w-max gap-2">
            {PLATFORM_TABS.map(tab => {
                const active = selected === tab.key;
                const count = tab.key === 'all'
                    ? Object.values(counts).reduce((sum, value) => sum + value, 0)
                    : counts[tab.key] || 0;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => onSelect(tab.key)}
                        className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-black transition-transform active:scale-95 ${active ? 'border-stone-900 bg-white text-stone-950 shadow-[3px_3px_0_rgba(28,25,23,0.95)]' : 'border-stone-300 bg-white/55 text-stone-500'}`}
                        style={active ? { borderColor: tab.accent } : undefined}
                    >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tab.accent }} />
                        {tab.label}
                        <span className="text-[10px] font-bold text-stone-400">{count}</span>
                    </button>
                );
            })}
        </div>
    </div>
);

const HotNewsRow: React.FC<{
    item: HotNewsItem;
    index: number;
}> = ({ item,index }) => {
    const platform = getItemPlatform(item);
    const meta = getPlatformMeta(platform);
    const rank = item.rank || index + 1;
    const title = item.title || '未命名热点';
    const desc = item.desc && item.desc !== title ? item.desc : '';
    const isBilibili = platform === 'bilibili';
    const isWeibo = platform === 'weibo';

    return (
        <li
            className="overflow-hidden rounded-lg border bg-white/80 shadow-[0_1px_0_rgba(28,25,23,0.08)]"
            style={{ borderColor: `${meta.accent}33`, background: isBilibili ? 'linear-gradient(135deg,#ffffff 0%,#effbff 100%)' : '#fffdf8' }}
        >
            <div className="flex gap-3 px-3 py-3">
                <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-black ${isBilibili ? 'text-white' : 'text-stone-950'}`}
                    style={{ backgroundColor: isBilibili ? meta.accent : meta.soft, border: `1px solid ${meta.accent}44` }}
                >
                    {isBilibili ? <PlayCircle className="h-6 w-6" weight="fill" /> : rank}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black"
                            style={{ backgroundColor: meta.soft, color: meta.accent }}
                        >
                            {isWeibo ? <Fire className="h-3 w-3" weight="fill" /> : null}
                            {meta.label}
                        </span>
                        <span className="text-[10px] font-bold text-stone-400">#{rank}</span>
                        {item.cardId ? <span className="hidden text-[9px] text-stone-300 sm:inline">{item.cardId}</span> : null}
                    </div>
                    <h3 className="text-[14px] font-black leading-snug text-stone-950">
                        {title}
                    </h3>
                    {desc ? (
                        <p
                            className="mt-1 text-[11px] leading-snug text-stone-500"
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                            {desc}
                        </p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-stone-400">
                            {isBilibili ? '视频热榜快照' : isWeibo ? '热搜号外' : '外部世界快照'}
                        </span>
                        {item.url ? (
                            <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-black text-stone-700 active:scale-95"
                            >
                                跳转
                                <ArrowSquareOut className="h-3 w-3" weight="bold" />
                            </a>
                        ) : (
                            <span className="rounded border border-stone-200 px-2 py-1 text-[10px] font-bold text-stone-300">暂无链接</span>
                        )}
                    </div>
                </div>
            </div>
        </li>
    );
};

const PlatformGroup: React.FC<{
    platform: string;
    items: HotNewsItem[];
}> = ({ platform,items }) => {
    const meta = getPlatformMeta(platform);
    return (
        <section className="py-2">
            <div className="mb-2 flex items-center justify-between border-b border-stone-300 pb-1.5">
                <h3 className="flex items-center gap-2 text-sm font-black text-stone-900">
                    <span className="h-4 w-1 rounded" style={{ backgroundColor: meta.accent }} />
                    {meta.label}
                </h3>
                <span className="text-[10px] font-bold text-stone-400">{items.length} 条</span>
            </div>
            <ol className="space-y-2">
                {items.map((item, index) => (
                    <HotNewsRow key={item.cardId || item.id || `${platform}-${index}-${item.title}`} item={item} index={index} />
                ))}
            </ol>
        </section>
    );
};

const EmptyState: React.FC<{
    error: string | null;
    loading: boolean;
}> = ({ error,loading }) => (
    <div className="px-6 py-14 text-center text-sm leading-relaxed text-stone-500">
        <WarningCircle className="mx-auto mb-3 h-8 w-8 text-stone-400" weight="thin" />
        {loading ? '正在召回外部热点...' : (error || '这个平台暂时没有可用热点。')}
    </div>
);

const HotNewsApp: React.FC = () => {
    const { closeApp,realtimeConfig,addToast } = useOS();
    const [snapshot, setSnapshot] = useState<HotNewsSnapshot | null>(null);
    const [selectedPlatform, setSelectedPlatform] = useState<PlatformTabKey>('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            await RealtimeContextManager.getSlottedHotNews(realtimeConfig);
            const { id } = RealtimeContextManager.getHotNewsSlot();
            const current = await DB.getHotNewsSnapshot(id);
            const latest = current || await DB.getLatestHotNewsSnapshot();
            setSnapshot(latest);
            if (!latest) {
                setError('暂时拉不到外部热点。请稍后重试，或检查当前网络是否能访问热榜源。');
            }
        } catch (err: any) {
            setError(err?.message || '加载失败');
        } finally {
            setLoading(false);
        }
    }, [realtimeConfig]);

    const forceRefresh = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const { id,date,slot,label } = RealtimeContextManager.getHotNewsSlot();
            const platforms = realtimeConfig.newsPlatforms?.length
                ? realtimeConfig.newsPlatforms
                : RealtimeContextManager.DEFAULT_HOTNEWS_PLATFORMS;
            const items = await RealtimeContextManager.fetchHotNews(platforms);

            if (items.length > 0) {
                const fresh: HotNewsSnapshot = {
                    id,
                    date,
                    slot,
                    slotLabel: label,
                    items,
                    platforms,
                    fetchedAt: Date.now(),
                };
                await DB.saveHotNewsSnapshot(fresh);
                setSnapshot(fresh);
                addToast(`已刷新 ${items.length} 条外部热点`, 'success');
            } else {
                const latest = await DB.getLatestHotNewsSnapshot();
                setSnapshot(latest);
                setError(latest ? null : '刷新失败，且本地暂无可用快照。');
                addToast('刷新失败，已尝试沿用上次结果', 'error');
            }
        } catch (err: any) {
            setError(err?.message || '刷新失败');
        } finally {
            setLoading(false);
        }
    }, [addToast,realtimeConfig.newsPlatforms]);

    useEffect(() => {
        load();
    }, [load]);

    const items = snapshot?.items || [];
    const counts = useMemo(() => {
        return items.reduce<Record<string, number>>((acc, item) => {
            const platform = getItemPlatform(item);
            acc[platform] = (acc[platform] || 0) + 1;
            return acc;
        }, {});
    }, [items]);

    const visibleGroups = useMemo(() => {
        if (selectedPlatform === 'all') return groupByPlatform(items);
        const filtered = items.filter(item => getItemPlatform(item) === selectedPlatform);
        return filtered.length > 0 ? [{ platform: selectedPlatform, items: filtered }] : [];
    }, [items,selectedPlatform]);

    return (
        <div className="absolute inset-0 flex h-full w-full flex-col overflow-hidden bg-[#f6f1e8] text-stone-900">
            <header className="shrink-0 border-b border-stone-300 bg-[#f6f1e8]/95 px-4 pb-3 pt-12 backdrop-blur">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={closeApp}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-700 active:scale-95 active:bg-black/5"
                        aria-label="返回桌面"
                        title="返回桌面"
                    >
                        <CaretLeft className="h-6 w-6" weight="bold" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-stone-500">External Pulse</p>
                        <h1 className="mt-0.5 flex items-center gap-2 text-xl font-black tracking-wide text-stone-900">
                            <Newspaper className="h-5 w-5" weight="fill" />
                            外部热点
                        </h1>
                    </div>
                    <button
                        type="button"
                        onClick={forceRefresh}
                        disabled={loading}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-700 active:scale-95 active:bg-black/5 disabled:opacity-40"
                        aria-label="刷新热点"
                        title="刷新热点"
                    >
                        <ArrowsClockwise className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} weight="bold" />
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-4 pb-24">
                <SnapshotHeader snapshot={snapshot} totalCount={items.length} />

                <section className="my-3 flex gap-2 rounded-lg border border-stone-900 bg-stone-900 px-3 py-2.5 text-[11px] leading-relaxed text-stone-100 shadow-[3px_3px_0_rgba(214,189,149,0.9)]">
                    <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" weight="fill" />
                    <p>
                        微博、B站、知乎、百度、抖音会作为外部世界快照进入 char 的背景感知；当话题合拍时，它可以用稳定卡片分享给你并跳转原文。
                    </p>
                </section>

                <PlatformTabs selected={selectedPlatform} counts={counts} onSelect={key => setSelectedPlatform(key)} />

                {loading && !snapshot ? (
                    <EmptyState error={null} loading />
                ) : null}

                {error && !snapshot ? (
                    <EmptyState error={error} loading={false} />
                ) : null}

                {snapshot && visibleGroups.length > 0 ? (
                    <div className="space-y-2">
                        {visibleGroups.map(group => (
                            <PlatformGroup key={group.platform} platform={group.platform} items={group.items} />
                        ))}
                    </div>
                ) : null}

                {snapshot && visibleGroups.length === 0 ? (
                    <EmptyState error={null} loading={false} />
                ) : null}

                {snapshot ? (
                    <p className="mt-6 text-center text-[10px] tracking-wide text-stone-400">
                        数据来自 hot_news 多平台热榜。每 4 小时缓存一次；点右上角可手动刷新。
                    </p>
                ) : null}
            </main>
        </div>
    );
};

export default HotNewsApp;
