import React,{ useState,useEffect,useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { CaretLeft,ArrowsClockwise,ArrowLineUp } from '@phosphor-icons/react';
import { buildBackendUrl,getBackendUrl } from '../utils/backendClient';

interface HotItem {
    index: number;
    title: string;
    hot: number;
    url: string;
    desc: string;
}

interface HotlistResponse {
    success: boolean;
    title?: string;
    subtitle?: string;
    update_time?: string;
    type?: string;
    data?: HotItem[];
    error?: string;
    _cached?: boolean;
}

const HotSearchApp: React.FC = () => {
    const { closeApp } = useOS();
    
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState<HotlistResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchHotlist = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        
        try {
            if (!getBackendUrl()) {
                throw new Error('当前环境未配置热搜后端。');
            }
            const url = buildBackendUrl('/api/public/hotlist', {
                type: 'wbHot',
                t: isRefresh ? Date.now() : undefined,
            });
            const res = await fetch(url);
            
            if (!res.ok) {
                throw new Error(`请求失败 (HTTP ${res.status})`);
            }
            
            const json = await res.json() as HotlistResponse;
            if (!json.success) {
                throw new Error(json.error || '获取数据失败');
            }
            if (json.data) {
                json.data.sort((a, b) => a.index - b.index);
            }
            setData(json);
        } catch (err: any) {
            setError(err.message || '网络连接错误');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchHotlist();
    }, [fetchHotlist]);

    const getRankStyle = (index: number) => {
        // Handle Top Item (置顶) - index usually 1 but has no hot value, or we assume first item if hot is 0
        if (index === 1) return 'text-[#ff3b30] font-bold italic text-lg';
        if (index === 2) return 'text-[#ff5500] font-bold italic text-lg';
        if (index === 3) return 'text-[#ff9500] font-bold italic text-lg';
        return 'text-[#ff9500] font-bold italic text-base';
    };

    const getTagStyle = (tag: string) => {
        if (!tag) return null;
        if (tag === '热') return 'bg-[#ff9500] text-white';
        if (tag === '新') return 'bg-[#ff3b30] text-white';
        if (tag === '沸') return 'bg-[#e14c3c] text-white';
        if (tag === '爆') return 'bg-[#8b0000] text-white';
        if (tag === '荐') return 'bg-[#ffcc00] text-white';
        return 'bg-gray-400 text-white';
    };

    const handleOpenLink = (url: string) => {
        window.open(url, '_blank');
    };

    return (
        <div className="h-full w-full flex flex-col font-sans animate-fade-in relative overflow-hidden bg-white absolute inset-0 text-black pb-[env(safe-area-inset-bottom)]">
            {/* Header - Weibo Orange Gradient */}
            <div className="flex-none bg-gradient-to-tr from-[#fe8c00] via-[#f83600] to-[#fe8c00] pt-12 shadow-sm z-20 sticky top-0">
                <div className="flex items-center justify-between pb-4 px-3">
                    <button
                        onClick={closeApp}
                        className="p-1.5 rounded-full hover:bg-white/20 active:bg-white/30 transition-all text-white shrink-0"
                    >
                        <CaretLeft className="w-7 h-7" />
                    </button>
                    
                    <div className="flex flex-col items-center justify-center flex-1">
                        <h2 className="text-2xl font-black italic tracking-wider text-white drop-shadow-md">
                            微博热搜
                        </h2>
                        <div className="text-[9px] font-medium tracking-widest text-[#f83600] bg-white px-2 py-0.5 mt-1 rounded-sm shadow-sm opacity-90">
                            新鲜 · 热门 · 有料
                        </div>
                    </div>
                    
                    <div className="w-10 shrink-0 flex justify-end">
                        {/* Right Top Action Placeholder */}
                    </div>
                </div>

                {/* Tab Bar Container */}
                <div className="flex text-white font-medium text-[15px] overflow-x-auto no-scrollbar gap-5 px-4">
                    <div className="whitespace-nowrap pb-2 opacity-80 cursor-pointer">我的</div>
                    <div className="whitespace-nowrap pb-2 font-bold border-b-[3px] border-white cursor-pointer px-1">热搜</div>
                    <div className="whitespace-nowrap pb-2 opacity-80 cursor-pointer" onClick={() => fetchHotlist(true)}>文娱</div>
                    <div className="whitespace-nowrap pb-2 opacity-80 cursor-pointer">生活</div>
                    <div className="whitespace-nowrap pb-2 opacity-80 cursor-pointer">社会</div>
                    <div className="whitespace-nowrap pb-2 opacity-80 cursor-pointer">同城</div>
                    <div className="whitespace-nowrap pb-2 opacity-80 cursor-pointer pr-4">体育</div>
                </div>
            </div>

            {/* Sub-header (Status Bar) */}
            <div className="bg-[#f0f0f0] text-[#888888] text-[12px] py-1.5 px-4 flex items-center justify-between border-b border-gray-200 shrink-0">
                <span>实时热点，每分钟更新一次</span>
                <button 
                    onClick={() => fetchHotlist(true)}
                    disabled={loading || refreshing}
                    className="flex items-center gap-1 opacity-80 active:opacity-40 transition-opacity disabled:opacity-40"
                >
                    <ArrowsClockwise className={`w-3.5 h-3.5 ${(loading || refreshing) ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden pb-32 z-10 overscroll-y-auto">
                {loading && !data ? (
                    <div className="flex flex-col items-center justify-center h-[50vh] text-center opacity-50 text-gray-400">
                        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#fe8c00] rounded-full animate-spin mb-3"></div>
                        <p className="text-xs">正在加载热搜数据...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center p-8 h-[50vh] text-center">
                        <p className="text-gray-500 text-sm mb-4">{error}</p>
                        <button 
                            onClick={() => fetchHotlist(true)}
                            className="px-6 py-2 bg-[#f0f0f0] rounded-full text-sm font-medium text-gray-700 active:scale-95"
                        >
                            点击重试
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {data?.data?.map((item, idx) => {
                            // Identify top item (often lacks hot value or is just the very first entry with a specific icon)
                            const isTop = idx === 0 && item.hot === 0;
                            const displayIndex = isTop ? 0 : (item.hot === 0 ? item.index : idx + (data.data![0].hot === 0 ? 0 : 1));

                            return (
                                <div 
                                    key={`${item.index}-${idx}`}
                                    onClick={() => handleOpenLink(item.url)}
                                    className="flex items-start py-3.5 px-4 border-b border-[#f5f5f5] active:bg-[#f9f9f9] cursor-pointer transition-colors"
                                >
                                    {/* Rank Column */}
                                    <div className={`w-8 shrink-0 text-center mr-1 flex items-center justify-center pt-0.5`}>
                                        {isTop ? (
                                            <ArrowLineUp className="w-5 h-5 text-[#ff3b30]" weight="bold" />
                                        ) : (
                                            <span className={getRankStyle(displayIndex)}>{displayIndex}</span>
                                        )}
                                    </div>
                                    
                                    {/* Title & Hot Value Container */}
                                    <div className="flex-1 min-w-0 pr-2">
                                        <span className="text-[16px] text-[#222222] font-normal leading-snug mr-2">
                                            {item.title}
                                        </span>
                                        {item.hot > 0 && (
                                            <span className="text-[12px] text-[#aaaaaa] font-sans relative -top-[1px]">
                                                {item.hot}
                                            </span>
                                        )}
                                    </div>

                                    {/* Right Tag */}
                                    {item.desc && (
                                        <div className="shrink-0 flex pt-1">
                                            <span className={`text-[10px] px-[3px] py-[0.5px] rounded-[3px] font-medium leading-tight ${getTagStyle(item.desc)}`}>
                                                {item.desc}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HotSearchApp;
