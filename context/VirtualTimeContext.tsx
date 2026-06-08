
import React,{ createContext,useContext,useEffect,useState } from 'react';
import { VirtualTime } from '../types';

const getRealTime = (): VirtualTime => {
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
        hours: now.getHours(),
        minutes: now.getMinutes(),
        day: days[now.getDay()]
    };
};

const getDelayUntilNextMinute = () => {
    const now = new Date();
    const elapsedInMinute = now.getSeconds() * 1000 + now.getMilliseconds();
    return Math.max(1000, 60000 - elapsedInMinute);
};

const isSameMinute = (a: VirtualTime, b: VirtualTime) =>
    a.hours === b.hours && a.minutes === b.minutes && a.day === b.day;

const VirtualTimeContext = createContext<VirtualTime>(getRealTime());

export const VirtualTimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [virtualTime, setVirtualTime] = useState<VirtualTime>(getRealTime());

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;

        const scheduleNextMinute = () => {
            timer = setTimeout(() => {
                setVirtualTime(prev => {
                    const next = getRealTime();
                    return isSameMinute(prev, next) ? prev : next;
                });
                scheduleNextMinute();
            }, getDelayUntilNextMinute());
        };

        scheduleNextMinute();
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, []);

    return (
        <VirtualTimeContext.Provider value={virtualTime}>
            {children}
        </VirtualTimeContext.Provider>
    );
};

export const useVirtualTime = (): VirtualTime => useContext(VirtualTimeContext);
