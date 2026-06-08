# 依赖升级路线

更新时间：2026-05-29

本文件记录本轮已经落地的依赖升级，以及仍需后续环境验证的事项。

## 已落地

- `npm audit fix`：修复可在当前主版本内解决的安全问题。
- `framer-motion` / `motion`：升级到 `^12.40.0`。
- `modern-screenshot`：升级到 `^4.7.0`。
- `three`：升级到 `^0.183.2`。
- `@tailwindcss/postcss` / `tailwindcss`：升级到 `^4.3.0`。
- `autoprefixer`：升级到 `^10.5.0`。
- `postcss`：升级到 `^8.5.15`。
- `vitest`：升级到 `^4.1.7`。
- `vite`：升级到 `^8.0.14`。
- `@vitejs/plugin-react`：升级到 `^5.2.0`，该线兼容 Vite 8 且不强制引入 React Compiler 相关 peer 依赖。
- `@capacitor/core`、`@capacitor/android`、`@capacitor/cli` 以及官方插件：统一升级到 `8.x`。
- `react` / `react-dom`：升级到 `^19.2.6`。
- `@types/react` / `@types/react-dom`：升级到 React 19 类型线。
- `public/vad/onnx/ort-wasm-simd-threaded.mjs` / `.wasm`：保留仓库原有可用运行时；不要跟随依赖升级机械替换，语音通话 VAD 对这组文件非常敏感。
- `public/vad/onnx/stable-20260529/`：复制仓库原有可用运行时到带版本路径，绕开 Android PWA 对旧 `/vad/onnx/` 资源的 7 天缓存。
- 语音通话 VAD：新增麦克风简化约束重试、iOS/低内存环境 `ScriptProcessor` 优先、`v5 -> legacy` VAD 模型兜底，以及 UI 侧降级原因提示。

## 审计状态

- 全量依赖：`npm audit --audit-level=moderate` 已无漏洞。

Vite 8 与 Capacitor 8 的开发工具链漏洞已通过显式升级解决，没有使用 `npm audit fix --force` 的自动大范围改写。

## 本轮大版本升级

### 1. Vite 8 / React 插件升级

状态：已完成。

- `vite` 升级到 `8.x`。
- `@vitejs/plugin-react` 升级到兼容 `vite 8` 的版本。

验证重点：

- `vite.config.ts` 的 `loadEnv`、`Plugin` 类型、`rollupOptions.external`、dev proxy 行为。
- `npm run dev` 是否正常启动。
- `npm run build -- --mode staging` 的构建环境变量校验是否仍正常。
- 懒加载 chunk 的资源路径和 `base: './'` 行为。

### 2. Capacitor 8 升级

状态：已完成依赖升级，待 Android 原生工程存在时执行同步验证。

- `@capacitor/core`、`@capacitor/android`、`@capacitor/cli` 和官方插件统一升级到 `8.x`。

验证重点：

- Android 工程同步：`npm run cap:sync`。
- 状态栏、键盘、震动、本地通知、分享、文件系统插件 API。
- PWA 与 Android WebView 的全屏、safe-area、键盘收起表现。

### 3. React 19 评估

状态：已完成依赖升级与基础类型迁移，仍建议继续做重点页面人工回归。

- 单独评估 `react` / `react-dom` / `@types/react` 19 线。

验证重点：

- `StrictMode` 下 effect 行为。
- 懒加载、ErrorBoundary、Context Provider 组合。
- 大页面如 `Chat`、`MusicApp`、`CognitiveNetworkApp`、`DateApp` 的渲染和输入流畅度。
