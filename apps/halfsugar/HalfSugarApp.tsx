/**
 * HalfSugarApp — 半糖主义 Multi-Tab Entry Point
 * Typographic sidebar + collapsible rail design.
 */
import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { HalfSugarProvider, useHalfSugar, type TabID } from './HalfSugarContext';
import { OnboardingView } from './HalfSugarTrackingUI';
import './halfsugar.css';

// Lazy-load tabs for code-splitting
const DashboardTab = React.lazy(() => import('./tabs/DashboardTab'));
const NutritionTab = React.lazy(() => import('./tabs/NutritionTab'));
const ActivityTab = React.lazy(() => import('./tabs/ActivityTab'));
const SleepTab = React.lazy(() => import('./tabs/SleepTab'));
const TrendsTab = React.lazy(() => import('./tabs/TrendsTab'));
const ProfileTab = React.lazy(() => import('./tabs/ProfileTab'));
const LunarTidesTab = React.lazy(() => import('./tabs/LunarTidesTab'));

// ── Tab Definition (typographic — no icons) ──

interface TabDef {
    id: TabID;
    zh: string;        // Chinese label
    en: string;        // English subtitle
}

const ALWAYS_TABS: TabDef[] = [
    { id: 'dashboard',  zh: '今日',     en: 'Today' },
    { id: 'nutrition',  zh: '饮食记录', en: 'Nutrition' },
    { id: 'activity',   zh: '运动',     en: 'Activity' },
    { id: 'sleep',      zh: '睡眠',     en: 'Sleep' },
];

const LUNAR_TIDES_TAB: TabDef = {
    id: 'lunar_tides', zh: '月相潮汐', en: 'Lunar',
};

const TRAILING_TABS: TabDef[] = [
    { id: 'trends',  zh: '趋势',  en: 'Trends' },
    { id: 'profile', zh: '我的',  en: 'Profile' },
];

// ── Inner shell (must be inside Provider) ──

const HalfSugarInner: React.FC = () => {
    const {
        activeTab, setActiveTab, closeApp,
        isHealthSetup, healthProfile, onboardingGoalState,
        isSettingsSaving, handleOnboardingComplete, userProfile, goals,
        addToast,
    } = useHalfSugar();

    const [sidebarExpanded, setSidebarExpanded] = useState(false);
    const toggleSidebar = useCallback(() => setSidebarExpanded((p) => !p), []);

    const isFemale = healthProfile.gender === 'female';
    const tabs = useMemo(() => {
        const result = [...ALWAYS_TABS];
        if (isFemale) result.push(LUNAR_TIDES_TAB);
        result.push(...TRAILING_TABS);
        return result;
    }, [isFemale]);

    // Onboarding gate
    if (!isHealthSetup) {
        return (
            <div className="hs-app hs-screen" style={{ flexDirection: 'column' }}>
                <div className="hs-header">
                    <button type="button" className="hs-back-btn" onClick={closeApp}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="20" height="20"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="hs-header-title">半糖主义</span>
                    <div className="hs-header-spacer" />
                </div>
                <div className="hs-scroll-area no-scrollbar">
                    <OnboardingView
                        initialProfile={healthProfile}
                        initialGoals={onboardingGoalState}
                        initialShareBodyInfo={(userProfile as any).healthShareBodyInfo === true}
                        hasPersistedGoals={goals.length > 0}
                        isSaving={isSettingsSaving}
                        onComplete={handleOnboardingComplete}
                    />
                </div>
            </div>
        );
    }

    const renderTab = () => {
        switch (activeTab) {
            case 'dashboard': return <DashboardTab />;
            case 'nutrition': return <NutritionTab />;
            case 'activity': return <ActivityTab />;
            case 'sleep': return <SleepTab />;
            case 'lunar_tides': return <LunarTidesTab addToast={addToast} />;
            case 'trends': return <TrendsTab />;
            case 'profile': return <ProfileTab />;
            default: return <DashboardTab />;
        }
    };

    return (
        <div className="hs-app hs-screen">
            {/* Sidebar overlay */}
            {sidebarExpanded && <div className="hs-sidebar-backdrop" onClick={toggleSidebar} />}
            <nav className={`hs-sidebar ${sidebarExpanded ? 'open' : ''}`}>
                <div className="hs-sidebar-header">
                    <span className="hs-sidebar-brand">半糖主义</span>
                    <button type="button" className="hs-sidebar-close" onClick={toggleSidebar} aria-label="关闭">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="hs-sidebar-tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`hs-sidebar-item ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => { setActiveTab(tab.id); setSidebarExpanded(false); }}
                            aria-label={tab.zh}
                        >
                            <span className="hs-sidebar-dot" />
                            <span className="hs-sidebar-text">
                                <span className="hs-sidebar-zh">{tab.zh}</span>
                                <span className="hs-sidebar-en">{tab.en}</span>
                            </span>
                        </button>
                    ))}
                </div>
                <button type="button" className="hs-sidebar-back" onClick={closeApp} aria-label="返回">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    <span>退出</span>
                </button>
            </nav>

            {/* Main Content */}
            <div className="hs-main-content">
                {/* Header: menu button + page title */}
                <div className="hs-page-header">
                    <button type="button" className="hs-menu-btn" onClick={toggleSidebar} aria-label="菜单">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
                    </button>
                    <h1 className="hs-page-title">{tabs.find((t) => t.id === activeTab)?.zh ?? '半糖主义'}</h1>
                    <div style={{ flex: 1 }} />
                    {activeTab === 'dashboard' && (
                        <button type="button" className="hs-weekly-btn" onClick={() => setActiveTab('trends')} aria-label="周报">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
                            <span>周报</span>
                        </button>
                    )}
                </div>

                <Suspense fallback={<div className="hs-tab-content"><div className="hs-loading-card">加载中…</div></div>}>
                    {renderTab()}
                </Suspense>
            </div>
        </div>
    );
};

// ── Root ──

const HalfSugarApp: React.FC = () => (
    <HalfSugarProvider>
        <HalfSugarInner />
    </HalfSugarProvider>
);

export default HalfSugarApp;
