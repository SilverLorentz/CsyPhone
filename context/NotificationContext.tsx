
import React,{ createContext,useContext,useState,useCallback } from 'react';
import { Toast } from '../types';
import { haptic } from '../utils/haptics';

export interface NotificationContextType {
    toasts: Toast[];
    addToast: (message: string, type?: Toast['type']) => void;
    lastMsgTimestamp: number;
    setLastMsgTimestamp: React.Dispatch<React.SetStateAction<number>>;
    unreadMessages: Record<string, number>;
    setUnreadMessages: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    clearUnread: (charId: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);
const AddToastContext = createContext<NotificationContextType['addToast'] | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [lastMsgTimestamp, setLastMsgTimestamp] = useState<number>(0);
    const [unreadMessages, setUnreadMessages] = useState<Record<string, number>>({});

    const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 3000);
        if (type === 'success') haptic.success();
        else if (type === 'error') haptic.error();
        else haptic.light();
    }, []);

    const clearUnread = useCallback((charId: string) => {
        setUnreadMessages(prev => {
            const next = { ...prev };
            delete next[charId];
            return next;
        });
    }, []);

    const value: NotificationContextType = {
        toasts, addToast,
        lastMsgTimestamp, setLastMsgTimestamp,
        unreadMessages, setUnreadMessages,
        clearUnread
    };

    return (
        <AddToastContext.Provider value={addToast}>
            <NotificationContext.Provider value={value}>
                {children}
            </NotificationContext.Provider>
        </AddToastContext.Provider>
    );
};

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};

export const useAddToast = () => {
    const context = useContext(AddToastContext);
    if (context === undefined) {
        throw new Error('useAddToast must be used within a NotificationProvider');
    }
    return context;
};
