import vadBundleUrl from '@ricky0123/vad-web/dist/bundle.min.js?url';
import type * as VadWeb from '@ricky0123/vad-web';

type VadWebModule = typeof VadWeb;

declare global {
    interface Window {
        vad?: VadWebModule;
        __sullyVadBundlePromise?: Promise<VadWebModule>;
    }
}

const VAD_BUNDLE_SCRIPT_ATTR = 'data-sully-vad-bundle';
const VAD_MODEL_LOAD_ERROR_PREFIX = 'Encountered an error while loading model file ';

export async function loadVadWeb(): Promise<VadWebModule> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('VAD can only be loaded in a browser environment');
    }

    if (window.vad?.MicVAD) {
        return window.vad;
    }

    if (!window.__sullyVadBundlePromise) {
        window.__sullyVadBundlePromise = new Promise<VadWebModule>((resolve, reject) => {
            const existingScript = document.querySelector<HTMLScriptElement>(`script[${VAD_BUNDLE_SCRIPT_ATTR}="true"]`);

            const resolveLoadedBundle = () => {
                if (window.vad?.MicVAD) {
                    resolve(window.vad);
                    return;
                }
                reject(new Error('VAD bundle loaded but window.vad.MicVAD is missing'));
            };

            const script = existingScript ?? document.createElement('script');
            script.async = true;
            script.type = 'module';
            script.src = vadBundleUrl;
            script.setAttribute(VAD_BUNDLE_SCRIPT_ATTR, 'true');
            script.addEventListener('load', resolveLoadedBundle, { once: true });
            script.addEventListener('error', () => {
                script.remove();
                reject(new Error('Failed to load VAD browser bundle'));
            }, { once: true });

            if (!existingScript) {
                document.head.appendChild(script);
                return;
            }

            if (window.vad?.MicVAD) {
                resolveLoadedBundle();
            }
        }).catch((error) => {
            window.__sullyVadBundlePromise = undefined;
            throw error;
        });
    }

    return window.__sullyVadBundlePromise;
}

export async function withMutedVadModelLoadErrors<T>(task: () => Promise<T>): Promise<T> {
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].startsWith(VAD_MODEL_LOAD_ERROR_PREFIX)) {
            console.warn('[VAD]', ...args);
            return;
        }
        originalConsoleError(...args);
    };

    try {
        return await task();
    } finally {
        console.error = originalConsoleError;
    }
}
