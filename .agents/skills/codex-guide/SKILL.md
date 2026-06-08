---
name: codex-guide
description: 给 OpenAI Codex 下发任务时的完整项目上下文与规范
---

# Codex 任务指挥手册

> 本文件是给 Codex Chat 的完整项目"地图"，让它在没读过全部源码的情况下也能安全地改代码。

---

## 1. 项目全貌

```
糯米机二改/
├── SULLYTEST2/          ← 前端 PWA (React 18 + Vite 5 + TailwindCSS v4)
├── csyos-workers/       ← 后端 (Cloudflare Workers + D1 + Vectorize + R2 + Queues)
├── cloudflare-ws-proxy/ ← TTS WebSocket 代理
└── Acsus-Paws-Puffs-analyzer/ ← 独立分析/扩展项目
```

> 前端和后端是**两个独立仓库**，各有自己的 `package.json` / `.git` / 部署流程。

---

## 2. 三套环境

| 环境 | 前端 | 后端 Worker | D1 | R2 | Queues | Vectorize |
|------|------|-------------|----|----|--------|-----------|
| **本地开发** | `npm run dev -- --host` | `wrangler dev` (可选) | local | — | — | — |
| **Staging (Beta)** | Cloudflare Pages `beta` 分支 | `csyos-backend-staging` | `csyos-db-staging` | `csyos-backups-staging` | `*-staging` | `csyos-memory-index-staging` |
| **Production** | Cloudflare Pages `main` | `csyos-backend` | `csyos-db` | `csyos-backups` | 生产 queues | `csyos-memory-index` |

### 环境 URL（固定，不是随机的）

| 环境 | 前端 URL | 后端 URL |
|------|----------|----------|
| Staging | `https://beta.sully-frontend.pages.dev` | `https://csyos-backend-staging.sully-tts-proxy.workers.dev` |
| Production | `https://sully-frontend.pages.dev` (或自定义域名) | `https://chushiyu.de5.net` |

### 环境变量文件

| 文件 | 用途 |
|------|------|
| `.env.staging.local` | `npm run build -- --mode staging` 读取 |
| `.env.production.local` | `npm run build -- --mode production` 读取 |
| `.env.local` | `npm run dev` 默认读取（建议指向 staging） |

### 后端配置解析优先级 (`backendConfig.ts`)

```
1. localStorage('csyos_backend_url')    ← 调试覆盖
2. import.meta.env.VITE_CSYOS_BACKEND_URL  ← 构建时注入
3. DEFAULT_BACKEND_URL ('https://chushiyu.de5.net')  ← 硬编码回退
```

---

## 3. 前端核心结构 (SULLYTEST2)

### 入口链路

```
index.html → index.tsx → App.tsx → VirtualTimeProvider → OSProvider → PhoneShell
```

### 关键目录

| 目录 | 说明 |
|------|------|
| `apps/` | 每个"App"一个文件或子目录 (Chat/Settings/VoiceCall/Zhaixinglou...) |
| `components/` | 共享 UI (PhoneShell/ChatBubble/StatusBar/AppIcon...) |
| `hooks/` | 自定义 Hooks (useChatAI 是核心) |
| `utils/` | 工具函数 + IndexedDB 数据层 |
| `utils/db/` | IndexedDB 分域拆分 (core/characterStore/contentStore...) |
| `types/` | TypeScript 类型定义 (barrel 导出 `import { X } from '../types'`) |
| `context/` | React Context Provider (OSContext/AppContext/NotificationContext) |
| `constants.tsx` | AppID 枚举 + 应用注册表 |

### 数据存储

- **IndexedDB** (`AetherOS_Data`, 当前版本 **v38**)
  - 修改 store 需要在 `utils/db/core.ts` bump `DB_VERSION`
  - 通过 `DB` 对象操作，不直接用原生 API
- **localStorage** — 配置项 (API keys/主题/后端URL)
- **云端 D1** — 记忆/关系图/Agent 状态/备份

### 聊天核心数据流

```
用户输入 → useChatAI.ts
  → chatPrompts.ts (system prompt + 记忆 + 世界书)
  → context.ts (上下文裁剪)
  → LLM API (safeApi.ts)
  → chatParser.ts (解析回复)
  → ChatBubble 渲染
  → vectorMemoryExtractor (异步记忆提取)
```

---

## 4. 后端核心结构 (csyos-workers)

### 路由注册

所有路由在 `src/index.ts` 注册，带 `authMiddleware`。  
`/health` 和 `/api/public/*` 不需要鉴权。

### 关键路由

| 路由 | 文件 | 功能 |
|------|------|------|
| `/health` | `routes/health.ts` | 健康检查 |
| `/api/memories/*` | `routes/memory.ts` | 记忆 CRUD |
| `/api/retrieval/search` | `routes/retrieval.ts` | 5 阶段向量检索 |
| `/api/extraction/extract` | `routes/extraction.ts` | LLM 记忆提取 |
| `/api/sync/*` | `routes/sync.ts` | 双向同步 |
| `/api/graph/*` | `routes/graph.ts` | 关系图谱 |
| `/api/agent/*` | `routes/agent.ts` | 自主体 Agent |
| `/api/backup/*` | `routes/backup.ts` | R2 云备份 |
| `/api/push/*` | `routes/push.ts` | Web Push |

### 鉴权

```
请求 → Bearer Token (API_SECRET) → X-User-Id header → 注入 req.userId
所有 SQL: WHERE user_id = ?
```

### Bindings (wrangler.toml)

| Binding | 类型 | 说明 |
|---------|------|------|
| `DB` | D1 | 主数据库 |
| `BACKUP_BUCKET` | R2 | 云备份 |
| `VECTOR_INDEX` | Vectorize | 向量索引 |
| `SEMANTIC_QUEUE` | Queue | 语义任务 |
| `INDEX_QUEUE` | Queue | 索引任务 |
| `API_SECRET` | Secret | Bearer Token |
| `VAPID_*` | Var/Secret | Web Push 密钥 |

---

## 5. 部署命令

### 部署 Staging

```powershell
# 后端
cd c:\Users\ASUS\Desktop\糯米机二改\csyos-workers
npm run deploy:staging

# 前端
cd c:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2
.\deploy-beta.ps1
```

### 部署 Production

```powershell
# 后端
cd c:\Users\ASUS\Desktop\糯米机二改\csyos-workers
npm run deploy:prod

# 前端 (需手动输入 YES 确认)
cd c:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2
.\deploy-prod.ps1
```

### 验证命令

```powershell
# 前端 TypeScript 检查
cd SULLYTEST2 && npx tsc --noEmit

# 后端 TypeScript 检查
cd csyos-workers && npx tsc --noEmit

# 前端测试
cd SULLYTEST2 && npm run test:run

# 后端 dry-run
cd csyos-workers && npm run dry-run:staging
```

---

## 6. 修改规范

### 新增 API 路由

1. 在 `csyos-workers/src/routes/` 新建文件
2. 在 `src/index.ts` 导入并注册 (带 `authMiddleware`)
3. handler 从 `(req as any).userId` 获取用户 ID
4. 所有 SQL 必须 `WHERE user_id = ?`

### 新增前端 App

1. 在 `constants.tsx` 注册 AppID
2. 在 `apps/` 创建组件
3. 在 `components/PhoneShell.tsx` 添加路由

### 修改 IndexedDB

1. 在 `utils/db/core.ts` 添加 store / 索引
2. bump `DB_VERSION` 数字
3. 在对应的 `*Store.ts` 添加 CRUD 函数

### 修改 D1 Schema

1. 编辑 `src/db/schema.sql`
2. 在 `migrations/` 新建迁移文件
3. 运行 migration 命令

---

## 7. 不可违反的约束

1. **前端所有数据操作通过 `DB` 对象** — 不直接操作 IndexedDB
2. **后端所有 SQL 必须带 `WHERE user_id = ?`** — 用户隔离
3. **后端不存储 API Key** — 只从 header 透传
4. **类型从 `types/` barrel 导入** — `import { X } from '../types'`
5. **前端入口是 `App.tsx`** — 不是 `src/App.tsx`
6. **样式用 TailwindCSS v4** — 不用 `@apply`
7. **Workers CPU 限制** — 长任务用 `ctx.waitUntil()` 或 Queue
8. **D1 限制** — 单次 batch 最多 100 条 statement
9. **Vectorize filter** — 只支持精确匹配，不支持范围查询
10. **记忆写入后必须入 INDEX_QUEUE** — 确保同步到 Vectorize

---

## 8. 任务卡模板

向 Codex 下发任务时，使用以下格式：

```markdown
## 📦 任务：[简明名称]

### 📍 背景
[1-2 句说清楚为什么做]

### 📁 涉及文件
- `[前端/后端] [路径]` — [改什么]

### 📝 详细要求
1. [具体步骤]

### ⚠️ 不能碰的东西
- [明确列出]

### ✅ 验收标准
- [ ] 按 `SULLYTEST2/docs/verification-policy.md` 完成最小必要验证
- [ ] [功能验证点]
```

---

## 9. 验证策略（每次任务完成后）

默认遵守 `SULLYTEST2/docs/verification-policy.md` 的低负载验证策略，不机械执行全量测试、全量构建或长时间任务。

### 默认优先

- [ ] 阅读本次修改直接相关的调用链
- [ ] 运行最小相关测试或最小相关检查
- [ ] 页面改动做浏览器冒烟和控制台检查
- [ ] 最终回复说明已验证内容与未运行内容

### 按风险升级

- [ ] 修改核心入口、共享 hook、运行时配置、数据库或部署脚本时，扩大到相邻功能验证
- [ ] 需要全量 `tsc`、`test:run`、build、E2E、dry-run 时，先说明原因和机器负载风险
- [ ] 用户明确要求发布或重型验证时，再执行对应命令
