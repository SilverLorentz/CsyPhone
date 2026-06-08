
import React,{ createContext,useContext,useState,useRef,useCallback,useMemo } from 'react';
import { AppID } from '../types';
import { haptic } from '../utils/haptics';

export interface AppContextType {
    activeApp: AppID;
    appParams: Record<string, any>;
    openApp: (appId: AppID, params?: Record<string, any>) => void;
    closeApp: () => void;
    isLocked: boolean;
    unlock: () => void;
    registerBackHandler: (handler: () => boolean) => () => void;
    handleBack: () => boolean;
    hapticsEnabled: boolean;
    setHapticsEnabled: (v: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const AppNavigationContext = createContext<Pick<AppContextType, 'openApp' | 'closeApp'> | undefined>(undefined);

export const AppProvider: React.FC<{
    children: React.ReactNode;
    hapticsEnabled: boolean;
    setHapticsEnabled: (v: boolean) => void;
}> = ({ children, hapticsEnabled, setHapticsEnabled }) => {
    const [activeApp, setActiveApp] = useState<AppID>(AppID.Launcher);
    const [appParams, setAppParams] = useState<Record<string, any>>({});
    const [isLocked, setIsLocked] = useState(true);
    const backHandlerRef = useRef<(() => boolean) | null>(null);

    const openApp = useCallback((appId: AppID, params?: Record<string, any>) => { haptic.light(); setAppParams(params || {}); setActiveApp(appId); }, []);
    const closeApp = useCallback(() => { setAppParams({}); setActiveApp(AppID.Launcher); }, []);
    const unlock = useCallback(() => setIsLocked(false), []);

    const registerBackHandler = useCallback((handler: () => boolean) => {
        backHandlerRef.current = handler;
        return () => {
            if (backHandlerRef.current === handler) {
                backHandlerRef.current = null;
            }
        };
    }, []);

    const handleBack = useCallback((): boolean => {
        if (backHandlerRef.current) {
            const handled = backHandlerRef.current();
            if (handled) return true;
        }
        if (activeApp !== AppID.Launcher) {
            closeApp();
            return true;
        }
        return false;
    }, [activeApp, closeApp]);

    const value: AppContextType = {
        activeApp, appParams, openApp, closeApp,
        isLocked, unlock,
        registerBackHandler, handleBack,
        hapticsEnabled, setHapticsEnabled
    };
    const navigationValue = useMemo(() => ({ openApp, closeApp }), [openApp, closeApp]);

    return (
        <AppNavigationContext.Provider value={navigationValue}>
            <AppContext.Provider value={value}>
                {children}
            </AppContext.Provider>
        </AppNavigationContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};

export const useAppNavigation = () => {
    const context = useContext(AppNavigationContext);
    if (context === undefined) {
        throw new Error('useAppNavigation must be used within an AppProvider');
    }
    return context;
};
