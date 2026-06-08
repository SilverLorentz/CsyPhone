import { useCallback, useEffect, useMemo, useState } from 'react';

export type SafeImageLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

interface SafeImageLoadState {
    key: string;
    status: SafeImageLoadStatus;
}

export function useSafeImageLoad(src: string | undefined, key?: string) {
    const normalizedSrc = typeof src === 'string' ? src.trim() : '';
    const loadKey = key || normalizedSrc;
    const [state, setState] = useState<SafeImageLoadState>(() => ({
        key: loadKey,
        status: normalizedSrc ? 'loading' : 'idle',
    }));

    useEffect(() => {
        if (!normalizedSrc) {
            setState({ key: loadKey, status: 'idle' });
            return;
        }
        if (typeof Image === 'undefined') {
            setState({ key: loadKey, status: 'failed' });
            return;
        }

        let cancelled = false;
        setState({ key: loadKey, status: 'loading' });

        const image = new Image();
        image.onload = () => {
            if (!cancelled) setState({ key: loadKey, status: 'loaded' });
        };
        image.onerror = () => {
            if (!cancelled) setState({ key: loadKey, status: 'failed' });
        };
        image.src = normalizedSrc;

        return () => {
            cancelled = true;
            image.onload = null;
            image.onerror = null;
        };
    }, [loadKey, normalizedSrc]);

    const markFailed = useCallback(() => {
        setState({ key: loadKey, status: 'failed' });
    }, [loadKey]);

    const status = state.key === loadKey ? state.status : (normalizedSrc ? 'loading' : 'idle');

    return useMemo(() => ({
        src: normalizedSrc,
        status,
        isLoaded: status === 'loaded',
        isFailed: status === 'failed',
        markFailed,
    }), [markFailed, normalizedSrc, status]);
}
