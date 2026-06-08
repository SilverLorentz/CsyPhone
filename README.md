# SULLYTEST2

`SULLYTEST2` 是当前主前端仓库。

它不是传统的 `src/` 单入口项目，而是“根层入口文件 + 一级领域目录”布局。当前真实源码主要分布在仓库根层和这些目录里:

- `App.tsx`
- `index.tsx`
- `constants.tsx`
- `types.ts`
- `apps/`
- `components/`
- `context/`
- `hooks/`
- `utils/`
- `constants/`
- `types/`

如果你是第一次接手这个仓库，不要再去找一个并不存在的 `src/` 主源码树。

## 当前定位

- 技术栈: React 18 + Vite 5 + TypeScript + Capacitor 6 + IndexedDB + Vitest
- 部署目标: Cloudflare Pages
- 主后端依赖: `csyos-workers`
- 配套语音代理: `cloudflare-ws-proxy`

## 协议与非商业化

本仓库协议已与上游 `qegj567-cloud/SullyOS` 对齐，采用 `PolyForm Noncommercial License 1.0.0`。

- 仅允许非商业目的使用、研究、实验、学习、私人娱乐和业余项目。
- 禁止商业化使用，包括但不限于转售、付费分发、商业 SaaS 托管、广告变现或作为商业产品/服务的一部分使用。
- 分发本仓库或其修改版本时，必须一并保留根目录 `LICENSE` 及其中的 `Required Notice`。

## 先看哪些文件

最小入口认知建议先看:

1. `index.tsx`
2. `App.tsx`
3. `context/OSContext.tsx`
4. `context/CharacterContext.tsx`
5. `context/ConfigContext.tsx`
6. `utils/backendConfig.ts`
7. `utils/backendClient.ts`
8. `utils/autonomousAgent.ts`

## 目录说明

### 活目录

| 路径 | 作用 |
| --- | --- |
| `apps/` | 页面和功能入口 |
| `components/` | 公共组件 |
| `context/` | 全局状态与编排 |
| `hooks/` | 自定义 hooks |
| `utils/` | 业务逻辑、service、client |
| `constants/` | 常量拆分目录 |
| `types/` | 领域类型目录 |
| `utils/db/` | IndexedDB 本地数据层 |
| `functions/` | Cloudflare Pages Functions |
| `worker/` | worker 逻辑 |
| `test/` | 测试入口 |
| `assets/` | 静态素材 |
| `public/` | 公开静态资源 |
| `styles/` | 样式资源 |

### 需要特别注意的目录

| 路径 | 说明 |
| --- | --- |
| `dist/` | 构建产物，不要直接修改 |
| `node_modules/` | 依赖目录，不要直接修改 |
| `.wrangler/` | Cloudflare 本地工具状态，不是业务源码 |

## 当前结构怎么理解

当前前端更准确的说法是:

- 这是根层源码布局，不是“源码还没整理完”的临时状态
- `App.tsx`、`index.tsx`、`constants.tsx`、`types.ts` 仍然是活文件
- `apps/`、`components/`、`context/`、`hooks/`、`utils/` 是一级领域目录
- `constants.tsx` 和 `constants/`、`types.ts` 和 `types/` 同时存在时，要按 import 关系判断修改落点
- 截至 2026-04-08，仓库里已经没有 `src/`、`api/`、`.vercel/` 这些旧目录，也没有 `*.recovered.tsx` / `*.backup-*` 这类恢复快照命名文件

所以现在排查问题时，可以把 `apps/` 直接当成活页面目录来理解，不需要再先怀疑里面是不是恢复快照。

## 常用命令

本地开发:

```powershell
npm run dev
```

测试:

```powershell
npm run test:run
```

构建:

```powershell
npm run build
```

Beta 预发:

```powershell
.\deploy-beta.ps1
```

生产发布:

```powershell
.\deploy-prod.ps1
```

Git 自动构建审计:

```powershell
npm run audit:pages-git
```

- 这个脚本会直接检查 Cloudflare Pages 上 `sully-frontend` 项目的 Git 构建配置
- 它会核对生产分支、构建命令、输出目录、Production / Preview 环境变量是否齐全
- 它会顺带抓最近一次失败的 Git production build 日志摘要，快速判断是不是“站点已被手动救活，但 `push main` 仍会继续失败”
- 它不会打印 Cloudflare token，也不会打印环境变量值

同步 Pages 远端环境变量:

```powershell
npm run sync:pages-env
```

- 这个脚本会把 `.env.production.local` 的必填构建变量同步到 Cloudflare Pages `Production`
- 它会把 `.env.staging.local` 的必填构建变量同步到 Cloudflare Pages `Preview`
- 它只同步当前构建强制要求的键，不会打印任何 secret 明文

## 当前已验证基线

最近一次本地验证时间: 2026-04-07

- `npm run test:run` 通过
- 结果: 11 个测试文件、72 个测试通过
- `npm run build` 通过

构建仍会出现一些已知警告:

- `pdfjs-dist` 的 `eval` 警告
- 动态导入和静态导入混用警告
- 大 chunk 警告

## 环境变量

优先参考:

- `.env.example`
- `.env.staging.local`
- `.env.production.local`

目前最关键的是:

- `VITE_CSYOS_BACKEND_URL`
- `VITE_CSYOS_BACKEND_TOKEN`
- `VITE_CSYOS_TTS_WS_PROXY_URL`
- `VITE_CSYOS_FRONTEND_ORIGIN`

构建防呆规则:

- `staging` 和 `production` 构建现在会强制校验 `VITE_CSYOS_BACKEND_URL` 与 `VITE_CSYOS_BACKEND_TOKEN`
- 只要这两个变量缺失、为空或还是占位值，`vite build` 会直接失败，不再允许“先上线再发现后端连不上”
- `push main` 触发的 Cloudflare Pages 自动构建不会读取你本机的 `.env.production.local`
- 所以正式环境需要的 `VITE_*` 变量，除了保存在本地文件里，也必须同步配置到 Cloudflare Pages 的对应环境变量中

## 部署真相源

当前前端部署以以下文件为准:

- `wrangler.toml`
- `deploy-beta.ps1`
- `deploy-prod.ps1`

当前仓库里也已经没有 `.vercel/` 目录；部署判断仍以 Cloudflare 配置为准。

## 配套文档

如果要理解整个工作区，不要只看这个 README，还要看工作区根目录和 `docs/` 目录中的:

- `docs/ARCHITECTURE_INVENTORY.md`
- `docs/WORKSPACE_ROLE_MAP.md`
- `docs/DIRECTORY_FEATURE_MAP.md`
- `docs/DOMAIN_OWNERSHIP.md`
- `docs/TESTING_AND_DEPLOY.md`
