import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSystemInterceptor } from './utils/systemInterceptor';
import { initAppLifecycle } from './utils/appLifecycle';
import { preloadLocalAssets,scheduleIdlePreload } from './utils/preloadResources';
import { installIOSStandaloneWorkaround } from './utils/iosStandalone';

// ── Production Log Suppression ──────────────────────────────────
// 生产环境下隐藏 console.log / console.warn，只保留 console.error
// 开发时 (vite dev) 不受影响，所有日志正常输出
if (!import.meta.env.DEV) {
  const noop = () => {};
  console.log = noop;
  console.warn = noop;
  console.debug = noop;
  console.info = noop;
  // console.error 保留 → 用户能看到真正的报错
}

// Initialize global interceptors BEFORE React mounts
initSystemInterceptor();

// Initialize app lifecycle manager (handles background → foreground recovery)
initAppLifecycle();

installIOSStandaloneWorkaround();

// 预加载本地关键图片（心声水墨画 + 邮戳装饰）
preloadLocalAssets();
// 空闲期后台预加载外部资源（朋友圈封面、通知音效等）
scheduleIdlePreload();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
