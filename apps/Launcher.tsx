import React,{ useMemo,useEffect,useLayoutEffect,useState,useRef,useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { useVirtualTime } from '../context/VirtualTimeContext';
import { INSTALLED_APPS,DOCK_APPS } from '../constants';
import AppIcon from '../components/os/AppIcon';
import { DB } from '../utils/db';
import { CharacterProfile,Anniversary,AppID } from '../types';
import { usePerformanceMode } from '../hooks/usePerformanceMode';

// --- Isolated Components to prevent full re-renders ---

// 1. Clock Component (Consumes virtualTime)
const DesktopClock = React.memo(({ contentColor, isLite }: {
    contentColor: string;
    isLite: boolean;
}) => {
    const virtualTime = useVirtualTime();

    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const now = new Date();
    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const dateNum = now.getDate().toString().padStart(2, '0');

    return (
        <div className="flex flex-col mb-6 mt-6 relative animate-fade-in" style={{ color: contentColor }}>
            <div className="absolute -top-6 left-1 flex items-center gap-2">
                <div className={`${isLite ? 'bg-white/45 shadow-sm' : 'bg-white/20 backdrop-blur-md'} px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase border border-white/10`}>
                    System Ready
                </div>
                <div className="h-[1px] w-20 bg-gradient-to-r from-current to-transparent opacity-40"></div>
            </div>

            <div className="flex items-end gap-4">
                <div className="text-[6.5rem] leading-[0.85] font-bold tracking-tighter drop-shadow-2xl font-sans">
                    {virtualTime.hours.toString().padStart(2, '0')}
                    <span className="opacity-40 font-light mx-1">:</span>
                    {virtualTime.minutes.toString().padStart(2, '0')}
                </div>
                <div className="flex flex-col justify-end pb-3 opacity-90">
                    <div className="text-3xl font-bold tracking-tight">{dayName}</div>
                    <div className="text-sm font-medium opacity-80 tracking-widest">{monthName} . {dateNum}</div>
                </div>
            </div>
        </div>
    );
});

// 2. Character Widget (Consumes Character Data & Messages)
const CharacterWidget = React.memo(({
    char,
    unreadCount,
    lastMessage,
    onClick,
    contentColor,
    isLite
}: {
    char: CharacterProfile | null,
    unreadCount: number,
    lastMessage: string,
    onClick: () => void,
    contentColor: string,
    isLite: boolean
}) => {
    return (
        <div className="mb-4 group animate-fade-in">
            <div
                className={`relative h-28 w-full overflow-hidden rounded-[1.5rem] border border-white/20 transition-all duration-300 active:scale-[0.98] cursor-pointer ${
                    isLite
                        ? 'bg-white/55 shadow-[0_6px_18px_rgba(0,0,0,0.12)]'
                        : 'bg-white/10 backdrop-blur-xl shadow-2xl'
                }`}
                onClick={onClick}
            >
                <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-white/5 to-transparent skew-x-12 pointer-events-none"></div>
                <div className="absolute inset-0 flex items-center p-4 gap-4">
                    <div className="w-20 h-20 shrink-0 rounded-2xl overflow-hidden shadow-lg border-2 border-white/20 relative bg-slate-800">
                        {char ? (
                            <img src={char.avatar} className="w-full h-full object-cover" alt="char" loading="lazy" />
                        ) : <div className="w-full h-full bg-white/10 animate-pulse"></div>}
                        {unreadCount > 0 ? (
                            <div className="absolute bottom-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-white">
                                {unreadCount}
                            </div>
                        ) : (
                            <div className="absolute bottom-1 right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-black/20 shadow-sm"></div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold tracking-wide drop-shadow-md truncate" style={{ color: contentColor }}>
                                {char?.name || 'NO SIGNAL'}
                            </h3>
                            <div className="px-1.5 py-0.5 bg-white/20 rounded text-[9px] font-bold uppercase tracking-wider" style={{ color: contentColor }}>
                                {unreadCount > 0 ? 'NEW MESSAGE' : 'Active'}
                            </div>
                        </div>

                        <div className="relative">
                            <div className="text-xs line-clamp-2 font-medium leading-relaxed opacity-90" style={{ color: contentColor }}>
                                <span className="opacity-40 mr-1 text-[10px]">▶</span>
                                {lastMessage}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

// 3. Grid Page Component
const AppGridPage = React.memo(({
    apps,
    openApp,
    onLongPressApp,
    customIcons,
    contentColor,
    showCustomIconFrame,
    isLite
}: {
    apps: typeof INSTALLED_APPS,
    openApp: (id: AppID) => void,
    onLongPressApp?: (app: typeof INSTALLED_APPS[0]) => void,
    customIcons: Record<string, string>,
    contentColor: string,
    showCustomIconFrame: boolean,
    isLite: boolean
}) => {
    return (
        <div className="grid grid-cols-4 gap-y-6 gap-x-2 place-items-center animate-fade-in relative">
            {apps.map(app => (
                <div
                    key={app.id}
                    className="relative transition-transform duration-200 active:scale-95"
                >
                    <AppIcon
                        app={app}
                        onClick={() => openApp(app.id)}
                        onLongPress={onLongPressApp ? () => onLongPressApp(app) : undefined}
                        customIconUrl={customIcons[app.id]}
                        contentColor={contentColor}
                        showCustomIconFrame={showCustomIconFrame}
                        isLite={isLite}
                    />
                </div>
            ))}
        </div>
    );
});

// 4. Widget Page Component (Calendar)
const WidgetsPage = React.memo(({ contentColor, openApp, anniversaries, characters, isLite }: any) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthName = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][currentMonth];

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const totalDays = getDaysInMonth(currentYear, currentMonth);
    const startOffset = getFirstDayOfMonth(currentYear, currentMonth);

    const calendarDays = Array.from({ length: totalDays }, (_, i) => i + 1);
    const paddingDays = Array.from({ length: startOffset }, () => null);

    return (
        <div className="w-full flex-shrink-0 snap-center snap-always flex flex-col px-6 pt-24 pb-8 space-y-6 h-full overflow-y-auto no-scrollbar">
            <div className={`${isLite ? 'bg-white/55 shadow-[0_6px_18px_rgba(0,0,0,0.12)]' : 'bg-white/10 backdrop-blur-2xl shadow-2xl'} rounded-3xl p-6 border border-white/20`}>
                <div className="flex justify-between items-center mb-4" style={{ color: contentColor }}>
                    <h3 className="text-xl font-bold tracking-widest">{monthName} {currentYear}</h3>
                    <div onClick={() => openApp('schedule')} className="bg-white/20 p-2 rounded-full cursor-pointer hover:bg-white/40 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, index) => <div key={`${d}-${index}`} className="text-[10px] font-bold opacity-40" style={{ color: contentColor }}>{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
                    {paddingDays.map((_, i) => <div key={`pad-${i}`} />)}
                    {calendarDays.map(day => {
                        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isToday = day === now.getDate();
                        const hasEvent = anniversaries.some((a: any) => a.date === dateStr);

                        return (
                            <div key={day} className="flex flex-col items-center justify-center h-8 relative">
                                <div
                                    className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium ${isToday ? 'bg-white text-black font-bold shadow-lg' : 'opacity-80'}`}
                                    style={isToday ? {} : { color: contentColor }}
                                >
                                    {day}
                                </div>
                                {hasEvent && <div className="w-1.5 h-1.5 bg-purple-400 rounded-full absolute bottom-0 shadow-sm border border-black/20"></div>}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className={`${isLite ? 'bg-white/55 shadow-[0_6px_18px_rgba(0,0,0,0.12)]' : 'bg-white/10 backdrop-blur-2xl shadow-2xl'} rounded-3xl p-5 border border-white/20 flex-1 min-h-[200px]`}>
                <h3 className="text-xs font-bold opacity-60 uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: contentColor }}>
                    <span className="w-2 h-2 bg-purple-400 rounded-full"></span> Upcoming Events
                </h3>
                <div className="space-y-3">
                    {anniversaries.length > 0 ? anniversaries.sort((a: any, b: any) => a.date.localeCompare(b.date)).slice(0, 5).map((anni: any) => (
                        <div key={anni.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex flex-col items-center justify-center text-purple-200 border border-purple-500/30">
                                <span className="text-[9px] opacity-70">{anni.date.split('-')[1]}</span>
                                <span className="text-sm font-bold leading-none">{anni.date.split('-')[2]}</span>
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-bold" style={{ color: contentColor }}>{anni.title}</div>
                                <div className="text-[10px] opacity-50" style={{ color: contentColor }}>{characters.find((c: any) => c.id === anni.charId)?.name || 'Unknown'}</div>
                            </div>
                        </div>
                    )) : (
                        <div className="text-center opacity-30 text-xs py-8" style={{ color: contentColor }}>No upcoming events</div>
                    )}
                </div>
            </div>
        </div>
    );
});

// --- Persist scroll page across remounts (e.g. returning from apps) ---
let _lastPageIndex = 0;

// --- Main Launcher ---

const Launcher: React.FC = () => {
    const { openApp, characters, activeCharacterId, theme, lastMsgTimestamp, isDataLoaded, unreadMessages, customIcons } = useOS();
    const { isLite } = usePerformanceMode();

    // Context menu state for long-press
    const [contextMenu, setContextMenu] = useState<{ app: typeof INSTALLED_APPS[0] } | null>(null);
    const handleLongPressApp = useCallback((app: typeof INSTALLED_APPS[0]) => {
        setContextMenu({ app });
    }, []);
    const dismissContextMenu = useCallback(() => setContextMenu(null), []);

    // Local state for widget data to prevent context trashing
    const [widgetChar, setWidgetChar] = useState<CharacterProfile | null>(null);
    const [lastMessage, setLastMessage] = useState<string>('');
    const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);

    const [activePageIndex, setActivePageIndex] = useState(_lastPageIndex);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Mouse Drag Logic refs
    const isDragging = useRef(false);
    const startX = useRef(0);
    const scrollLeftRef = useRef(0);
    const dragMoved = useRef(0);

    // Pagination Logic
    const gridApps = useMemo(() =>
        INSTALLED_APPS.filter(app => !DOCK_APPS.includes(app.id)),
        []
    );

    const dockAppsConfig = useMemo(() =>
        DOCK_APPS.map(id => INSTALLED_APPS.find(app => app.id === id)).filter(Boolean) as typeof INSTALLED_APPS,
        []
    );

    // Split apps into pages of 8 (4 cols x 2 rows fit comfortably below widget)
    const APPS_PER_PAGE = 8;
    const appPages = useMemo(() => {
        const pages = [];
        for (let i = 0; i < gridApps.length; i += APPS_PER_PAGE) {
            pages.push(gridApps.slice(i, i + APPS_PER_PAGE));
        }
        if (pages.length === 0) pages.push([]);
        return pages;
    }, [gridApps]);

    // Total pages = App Pages + 1 Widget Page
    const totalPages = appPages.length + 1;
    const activeCharacterWidgetKey = useMemo(() => {
        const targetChar = characters.find(c => c.id === activeCharacterId) || characters[0];
        return targetChar
            ? [targetChar.id, targetChar.name, targetChar.avatar, targetChar.description || ''].join('\u0001')
            : '';
    }, [activeCharacterId, characters]);

    useEffect(() => {
        const loadData = async () => {
            // SAFEGUARD: If characters array is empty, reset widget char
            if (!characters || characters.length === 0) {
                setWidgetChar(null);
                setLastMessage('No Character Connected');
                setAnniversaries([]);
                return;
            }

            const targetChar = characters.find(c => c.id === activeCharacterId) || characters[0];
            setWidgetChar(targetChar);

            try {
                const [msgs, annis] = await Promise.all([
                    DB.getRecentMessagesByCharId(targetChar.id, 20),
                    DB.getAllAnniversaries()
                ]);

                if (msgs.length > 0) {
                    const visibleMsgs = msgs.filter(m => m.role !== 'system');
                    if (visibleMsgs.length > 0) {
                        const last = visibleMsgs[visibleMsgs.length - 1];
                        const cleanContent = last.content.replace(/\[.*?\]/g, '').trim();
                        setLastMessage(cleanContent || (last.type === 'image' ? '[图片]' : '[消息]'));
                    } else {
                        setLastMessage(targetChar.description || "System Ready.");
                    }
                } else {
                    setLastMessage(targetChar.description || "System Ready.");
                }
                setAnniversaries(annis);
            } catch (e) {
                console.error(e);
            }
        };

        if (isDataLoaded) {
            loadData();
        }
    }, [activeCharacterId, lastMsgTimestamp, isDataLoaded, activeCharacterWidgetKey]);

    // Restore scroll position BEFORE paint to avoid visible flash/slide
    useLayoutEffect(() => {
        const el = scrollContainerRef.current;
        if (el && _lastPageIndex > 0) {
            // Temporarily disable smooth scroll so jump is instant
            el.style.scrollBehavior = 'auto';
            el.scrollLeft = el.clientWidth * _lastPageIndex;
            // Re-enable on next frame
            requestAnimationFrame(() => { el.style.scrollBehavior = 'smooth'; });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleScroll = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;

        const width = el.clientWidth;
        if (width <= 0) return;

        const index = Math.round(el.scrollLeft / width);
        _lastPageIndex = index; // Persist across remounts
        setActivePageIndex(prev => prev === index ? prev : index);
    }, []);

    // --- Mouse Drag Handlers ---
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!scrollContainerRef.current) return;
        isDragging.current = true;
        dragMoved.current = 0;
        startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
        scrollLeftRef.current = scrollContainerRef.current.scrollLeft;

        // Disable snap and smooth scroll for direct control
        scrollContainerRef.current.style.scrollBehavior = 'auto';
        scrollContainerRef.current.style.scrollSnapType = 'none';
        scrollContainerRef.current.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current || !scrollContainerRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollContainerRef.current.offsetLeft;
        const walk = (x - startX.current);
        scrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk;

        dragMoved.current = Math.abs(x - (startX.current + scrollContainerRef.current.offsetLeft));
    };

    const handleMouseUp = () => {
        if (!isDragging.current || !scrollContainerRef.current) return;
        isDragging.current = false;

        // Restore styles
        scrollContainerRef.current.style.scrollBehavior = 'smooth';
        scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
        scrollContainerRef.current.style.cursor = 'grab';
    };

    const handleMouseLeave = () => {
        if (isDragging.current) handleMouseUp();
    };

    const handleClickCapture = (e: React.MouseEvent) => {
        if (dragMoved.current > 5) {
            e.stopPropagation();
            e.preventDefault();
        }
    };

    const contentColor = theme.contentColor || '#ffffff';
    const showCustomIconFrame = theme.customIconFrame !== false;

    const totalUnread = Object.values(unreadMessages).reduce((a, b) => a + b, 0);
    const widgetUnread = widgetChar && unreadMessages[widgetChar.id] ? unreadMessages[widgetChar.id] : 0;

    return (
        <div className="h-full w-full flex flex-col relative z-10 overflow-hidden font-sans select-none">

            {/* Visual Elements (Decorative Background - Static, low-cost gradients instead of blur) */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }}></div>
                <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }}></div>
            </div>

            {/* Scrollable Content Layer */}
            {/* UPDATE: Added snap-always to children to ensure one-page-at-a-time scrolling on mobile swipe */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onClickCapture={handleClickCapture}
                className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar cursor-grab active:cursor-grabbing"
                style={{ scrollBehavior: 'smooth', overscrollBehaviorX: 'contain', contain: 'layout style', transform: 'translateZ(0)' }}
            >
                {/* Render App Pages */}
                {appPages.map((pageApps, idx) => (
                    <div key={idx} className="w-full flex-shrink-0 snap-center snap-always flex flex-col px-6 pt-12 pb-8 h-full" style={{ contain: 'layout style paint' }}>
                        {(!isLite || Math.abs(activePageIndex - idx) <= 1) && (idx === 0 ? (
                            // Page 1: Clock + Widget + Apps
                            <>
                                <DesktopClock contentColor={contentColor} isLite={isLite} />
                                <CharacterWidget
                                    char={widgetChar}
                                    unreadCount={widgetUnread}
                                    lastMessage={lastMessage}
                                    onClick={() => openApp(AppID.Chat)}
                                    contentColor={contentColor}
                                    isLite={isLite}
                                />
                                <div className="flex-1">
                                    <AppGridPage
                                        apps={pageApps}
                                        openApp={openApp}
                                        onLongPressApp={handleLongPressApp}
                                        customIcons={customIcons}
                                        contentColor={contentColor}
                                        showCustomIconFrame={showCustomIconFrame}
                                        isLite={isLite}
                                    />
                                </div>
                            </>
                        ) : (
                            // Page 2+: Widget Grid + Free Decorations + Apps
                            <div className="pt-10 flex-1 flex flex-col relative">
                                {idx === 1 && (() => {
                                    const raw = theme.launcherWidgets || {};
                                    const w = { ...raw };
                                    if (!w['wide'] && theme.launcherWidgetImage) w['wide'] = theme.launcherWidgetImage;
                                    const hasAny = w['tl'] || w['tr'] || w['wide'];
                                    const hasTopRow = w['tl'] || w['tr'];
                                    return (
                                        <>
                                            {hasAny && (
                                                <div className="mb-3 space-y-2 relative z-10">
                                                    {hasTopRow && (
                                                        <div className="flex gap-2">
                                                            {['tl', 'tr'].map(key => w[key] ? (
                                                                <div key={key} className="flex-1 aspect-square rounded-2xl overflow-hidden shadow-md border border-white/20">
                                                                    <img src={w[key]} className="w-full h-full object-cover" alt="" loading="lazy" />
                                                                </div>
                                                            ) : <div key={key} className="flex-1"></div>)}
                                                        </div>
                                                    )}
                                                    {w['wide'] && (
                                                        <div className="w-full h-32 rounded-2xl overflow-hidden shadow-md border border-white/20">
                                                            <img src={w['wide']} className="w-full h-full object-cover" alt="" loading="lazy" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {/* Free-positioned Desktop Decorations (z-20 to float above widgets z-10) */}
                                            {theme.desktopDecorations && theme.desktopDecorations.length > 0 && (
                                                <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
                                                    {theme.desktopDecorations.map(deco => (
                                                        <img
                                                            key={deco.id}
                                                            src={deco.content}
                                                            alt=""
                                                            loading="lazy"
                                                            className="absolute w-16 h-16 object-contain select-none"
                                                            style={{
                                                                left: `${deco.x}%`,
                                                                top: `${deco.y}%`,
                                                                transform: `translate(-50%, -50%) scale(${deco.scale}) rotate(${deco.rotation}deg)${deco.flip ? ' scaleX(-1)' : ''}`,
                                                                opacity: deco.opacity,
                                                                zIndex: deco.zIndex,
                                                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}

                                <AppGridPage
                                    apps={pageApps}
                                    openApp={openApp}
                                    onLongPressApp={handleLongPressApp}
                                    customIcons={customIcons}
                                    contentColor={contentColor}
                                    showCustomIconFrame={showCustomIconFrame}
                                    isLite={isLite}
                                />
                                <div className="flex-1"></div>
                            </div>
                        ))}
                    </div>
                ))}

                {/* Final Page: Widgets */}
                <div className="w-full flex-shrink-0 snap-center snap-always h-full" style={{ contain: 'layout style paint' }}>
                    {(!isLite || Math.abs(activePageIndex - appPages.length) <= 1) && (
                        <WidgetsPage
                            contentColor={contentColor}
                            openApp={openApp}
                            anniversaries={anniversaries}
                            characters={characters}
                            isLite={isLite}
                        />
                    )}
                </div>

            </div>

            {/* Page Indicators */}
            <div className="absolute bottom-24 left-0 w-full flex justify-center gap-2 pointer-events-none z-20">
                {Array.from({ length: totalPages }).map((_, i) => (
                    <div
                        key={i}
                        className={`h-1.5 rounded-full transition-all duration-300 ${activePageIndex === i ? 'w-4 opacity-100' : 'w-1.5 opacity-40'}`}
                        style={{ backgroundColor: contentColor }}
                    ></div>
                ))}
            </div>

            {/* Floating Dock - Updated Margin and Safe Area handling */}
            <div className="mt-auto flex justify-center w-full px-4 mb-2 pb-[env(safe-area-inset-bottom)] relative z-30">
                <div className={`${isLite ? 'bg-white/55 shadow-[0_6px_18px_rgba(0,0,0,0.14)]' : 'bg-white/20 backdrop-blur-2xl shadow-[0_10px_30px_rgba(0,0,0,0.2)]'} rounded-3xl border border-white/20 px-4 py-3 flex gap-3 sm:gap-6 items-center mx-auto max-w-full justify-between overflow-x-auto no-scrollbar transform-gpu`}>
                    {dockAppsConfig.map(app => (
                        <div key={app.id} className="relative">
                            <AppIcon
                                app={app}
                                onClick={() => openApp(app.id)}
                                onLongPress={() => handleLongPressApp(app)}
                                variant="dock"
                                size="md"
                                customIconUrl={customIcons[app.id]}
                                contentColor={contentColor}
                                showCustomIconFrame={showCustomIconFrame}
                                isLite={isLite}
                            />
                            {app.id === 'chat' && totalUnread > 0 && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center border-2 border-white/20 shadow-sm font-bold pointer-events-none animate-pop-in">
                                    {totalUnread > 9 ? '9+' : totalUnread}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Long-Press Context Menu Overlay */}
            {contextMenu && (
                <div
                    className="absolute inset-0 z-[100] flex items-center justify-center animate-fade-in"
                    onClick={dismissContextMenu}
                    style={{ backdropFilter: isLite ? 'none' : 'blur(20px)', backgroundColor: isLite ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.3)' }}
                >
                    <div
                        className={`${isLite ? 'bg-white shadow-xl' : 'bg-white/95 backdrop-blur-2xl shadow-2xl'} rounded-3xl border border-white/30 p-5 min-w-[200px] max-w-[260px] animate-pop-in`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col items-center gap-3 mb-4">
                            <div className="w-16 h-16">
                                <AppIcon
                                    app={contextMenu.app}
                                    onClick={() => { dismissContextMenu(); openApp(contextMenu.app.id); }}
                                    size="lg"
                                    hideLabel
                                    customIconUrl={customIcons[contextMenu.app.id]}
                                    contentColor={contentColor}
                                    showCustomIconFrame={showCustomIconFrame}
                                    isLite={isLite}
                                />
                            </div>
                            <div className="text-center">
                                <h3 className="text-base font-bold text-slate-800">{contextMenu.app.name}</h3>
                                <p className="text-[11px] text-slate-400 mt-0.5">SullyOS App</p>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <button
                                onClick={() => { dismissContextMenu(); openApp(contextMenu.app.id); }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors text-left"
                            >
                                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                <span className="text-sm font-semibold text-slate-700">打开应用</span>
                            </button>
                            <button
                                onClick={dismissContextMenu}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors text-left"
                            >
                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                <span className="text-sm font-semibold text-slate-700">取消</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Launcher;
