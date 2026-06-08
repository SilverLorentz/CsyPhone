
import React,{ useCallback,useEffect,useState } from 'react';
import { VirtualTimeProvider } from './context/VirtualTimeContext';
import { OSProvider } from './context/OSContext';
import PhoneShell from './components/PhoneShell';
import FeaturePreviewPage from './components/FeaturePreviewPage';
import { startKeepAlive,startBackendHeartbeat } from './utils/keepAlive';
import { installGlobalAutofillSuppression } from './utils/autofillSuppression';
import { isFullscreenEnabled,requestSystemFullscreenForMobileRestore } from './utils/systemFullscreen';
import { isIOSStandaloneWebApp } from './utils/iosStandalone';

const EDITABLE_SELECTION_SELECTOR = 'input:not([readonly]), textarea:not([readonly]), select, [contenteditable="true"], [data-allow-text-selection="true"]';

function getSelectionTargetElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function canSelectText(target: EventTarget | null): boolean {
  const element = getSelectionTargetElement(target);
  return Boolean(element?.closest(EDITABLE_SELECTION_SELECTOR));
}

/**
 * 检测是否运行在 PWA (已安装到桌面) 模式
 */
function isPwaMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as any).standalone === true
  );
}

function isFeaturePreviewRoute(): boolean {
  const hash = window.location.hash.toLowerCase();
  return hash === '#/preview' || hash === '#preview' || new URLSearchParams(window.location.search).has('preview');
}

const SullyOSApp: React.FC = () => {
  const useAbsoluteShell = typeof window !== 'undefined' && isIOSStandaloneWebApp();

  useEffect(() => {
    startKeepAlive();
    startBackendHeartbeat();
    const uninstallAutofillSuppression = installGlobalAutofillSuppression();

    const preventNonEditableSelection = (event: Event) => {
      if (!canSelectText(event.target)) {
        event.preventDefault();
      }
    };

    document.addEventListener('selectstart', preventNonEditableSelection);

    if (isPwaMode() && isFullscreenEnabled()) {
      // 积极维护全屏状态，但避免在移动端每次 touch/click 都打 fullscreen API。
      // Android 侧滑返回、键盘收起后仍会恢复，只是 2.5 秒内最多尝试一次。
      const ensureFullscreen = () => {
        requestSystemFullscreenForMobileRestore();
      };

      document.addEventListener('click', ensureFullscreen, { capture: true, passive: true });
      document.addEventListener('touchstart', ensureFullscreen, { capture: true, passive: true });

      return () => {
        uninstallAutofillSuppression();
        document.removeEventListener('selectstart', preventNonEditableSelection);
        document.removeEventListener('click', ensureFullscreen, { capture: true } as any);
        document.removeEventListener('touchstart', ensureFullscreen, { capture: true } as any);
      };
    }

    return () => {
      uninstallAutofillSuppression();
      document.removeEventListener('selectstart', preventNonEditableSelection);
    };
  }, []);

  return (
    <div
      className={`${useAbsoluteShell ? 'fixed inset-0 h-full' : 'relative'} w-full bg-black overflow-hidden`}
      style={{ height: 'var(--app-height, 100lvh)', minHeight: 'var(--app-height, 100lvh)' }}
    >
      <div
        className={`${useAbsoluteShell ? 'absolute' : 'fixed'} inset-0 w-full h-full z-0 bg-black`}
        style={{ transform: 'translateZ(0)' }}
      >
        <VirtualTimeProvider>
          <OSProvider>
            <PhoneShell />
          </OSProvider>
        </VirtualTimeProvider>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isPreviewRoute, setIsPreviewRoute] = useState(isFeaturePreviewRoute);

  useEffect(() => {
    const syncPreviewRoute = () => setIsPreviewRoute(isFeaturePreviewRoute());

    window.addEventListener('hashchange', syncPreviewRoute);
    window.addEventListener('popstate', syncPreviewRoute);

    return () => {
      window.removeEventListener('hashchange', syncPreviewRoute);
      window.removeEventListener('popstate', syncPreviewRoute);
    };
  }, []);

  const enterMainApp = useCallback(() => {
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = '';
    nextUrl.searchParams.delete('preview');
    window.history.pushState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
    setIsPreviewRoute(false);
  }, []);

  if (isPreviewRoute) {
    return <FeaturePreviewPage onEnterApp={enterMainApp} />;
  }

  return <SullyOSApp />;
};

export default App;
