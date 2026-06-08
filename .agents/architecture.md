# 糯米机二改 — 项目架构文档

> 最后更新：2026-04-09 · 本文档供 AI 助手和开发者参考，避免对项目结构产生错误假设。

---

## 1. 仓库总览

工作区根目录：`c:\Users\ASUS\Desktop\糯米机二改\`

```
糯米机二改/
├── SULLYTEST2/           ← 前端主工程 (PWA)
├── csyos-workers/        ← 后端 (Cloudflare Workers)
├── cloudflare-ws-proxy/  ← WebSocket 代理 (用于 MiniMax TTS)
└── Acsus-Paws-Puffs-analyzer/  ← 独立分析工具
```

> [!IMPORTANT]
> **前端和后端是两个独立的仓库/目录**，各有自己的 `package.json`、`.git` 和部署流程。

> [!NOTE]
> 当前生产前端尚未绑定自有域名，正式入口仍是 `https://sully-frontend.pages.dev`。
> 生产后端当前通过 `https://chushiyu.de5.net` 对外，部分辅助 Worker 仍在使用 `workers.dev` 默认域名。

---

## 2. 前端 — SULLYTEST2

### 2.1 技术栈

| 项目 | 技术 |
|---|---|
| 框架 | **React 18** + **TypeScript** |
| 构建 | **Vite 5** (`vite.config.ts`) |
| 样式 | **TailwindCSS v4** + PostCSS |
| 本地存储 | **IndexedDB** (原生 API, 无 ORM) |
| 移动端 | **Capacitor 6** (Android 打包) |
| 部署 | **Cloudflare Pages** (`deploy-prod.ps1`) |
| 测试 | **Vitest** + **Testing Library** |
| 包名 | `aetheros-simulator` |

### 2.2 入口链路

```
index.html → index.tsx → App.tsx → VirtualTimeProvider → OSProvider → PhoneShell
```

- [App.tsx](file:///c:/Users/ASUS/Desktop/糯米机二改/SULLYTEST2/App.tsx) — PWA 全屏逻辑 + Provider 嵌套
- [PhoneShell.tsx](file:///c:/Users/ASUS/Desktop/糯米机二改/SULLYTEST2/components/PhoneShell.tsx) — 手机壳 UI，路由所有 App 页面

### 2.3 目录结构

```
SULLYTEST2/
├── App.tsx                    # 根组件
├── index.tsx                  # ReactDOM.createRoot
├── index.html                 # HTML 入口 (含 importmap)
├── index.css                  # 全局样式
│
├── context/                   # React Context 全局状态
│   ├── OSContext.tsx           # 核心状态 Provider (角色/设置/主题/备份...)
│   ├── AppContext.tsx          # 导航状态 (activeApp/openApp)
│   ├── NotificationContext.tsx # 通知/未读/Toast
│   └── VirtualTimeContext.tsx  # 虚拟时间
│
├── apps/                      # 每个"App"一个文件或子目录
│   ├── Chat.tsx               # 💬 聊天主页面 (核心)
│   ├── Character.tsx          # 🧑 角色管理/编辑
│   ├── Settings.tsx           # ⚙️ 设置入口 → apps/settings/
│   ├── Launcher.tsx           # 🏠 桌面启动器
│   ├── VoiceCallApp.tsx       # 📞 语音通话入口
│   ├── CognitiveNetworkApp.tsx # 🧠 认知网络 (图谱/同步/蒸馏)
│   ├── DateApp.tsx            # 💕 见面/约会模式
│   ├── RoomApp.tsx            # 🏡 房间装饰
│   ├── SocialApp.tsx          # 📱 朋友圈
│   ├── GroupChat.tsx          # 👥 群聊
│   ├── JournalApp.tsx         # 📖 日记
│   ├── Gallery.tsx            # 🖼️ 相册
│   ├── GameApp.tsx            # 🎮 小游戏
│   ├── BankApp.tsx            # 🏦 银行/经济系统
│   ├── StudyApp.tsx           # 📚 学习
│   ├── ScheduleApp.tsx        # 📅 日程
│   ├── NovelApp.tsx           # 📕 小说
│   ├── WorldbookApp.tsx       # 📖 世界书
│   ├── BrowserApp.tsx         # 🌐 浏览器
│   ├── HotSearchApp.tsx       # 🔥 热搜
│   ├── ThemeMaker.tsx         # 🎨 主题制作器
│   ├── Appearance.tsx         # 🎭 外观主题
│   ├── CheckPhone.tsx         # 📱 查手机 (检查角色手机)
│   ├── XhsFreeRoamApp.tsx     # 📕 小红书自由浏览
│   ├── XhsStockApp.tsx        # 📦 小红书素材库
│   ├── CsyManualApp.tsx       # 📘 使用手册
│   ├── FAQApp.tsx             # ❓ FAQ
│   ├── UserApp.tsx            # 👤 用户信息
│   │
│   ├── settings/              # 设置子页面
│   │   ├── SettingsMenu.tsx
│   │   ├── ApiSettings.tsx        # 主 API 配置
│   │   ├── SubApiSettings.tsx     # 副 API 配置
│   │   ├── EmbeddingSettings.tsx  # Embedding 配置
│   │   ├── DataSettings.tsx       # 数据管理
│   │   ├── AgentSettings.tsx      # 自主体 Agent 设置
│   │   ├── CloudBackupPanel.tsx   # 云备份面板
│   │   ├── SttSettings.tsx        # STT 设置
│   │   ├── embedding/             # Embedding 子配置
│   │   ├── realtime/              # 实时数据源 (天气/新闻/小红书MCP)
│   │   └── tts/                   # TTS 设置
│   │
│   ├── voicecall/             # 语音通话子模块
│   │   ├── VoiceCallScreen.tsx    # 通话 UI
│   │   ├── useVoiceCallEngine.ts  # 通话引擎 (VAD+STT+LLM+TTS 管线)
│   │   ├── voiceCallLlm.ts       # 通话 LLM 逻辑
│   │   ├── voiceCallAudioPlayer.ts # 音频播放队列
│   │   └── ...
│   │
│   ├── zhaixinglou/           # 摘星楼 (塔罗/占星 子模块)
│   │   ├── ZhaixinglouApp.tsx     # 主页面
│   │   ├── TarotReading.tsx       # 塔罗牌
│   │   ├── ChartReading.tsx       # 星盘
│   │   ├── StarOrbit.tsx          # 星轨动画
│   │   ├── divinationPrompts.ts   # 占卜 prompts
│   │   └── ...
│   │
│   └── room/                  # 房间子组件
│       └── ...
│
├── components/                # 共享 UI 组件
│   ├── PhoneShell.tsx         # 手机壳 (状态栏+导航+App路由)
│   ├── ValentineEvent.tsx     # 特别时光 / 限时活动入口
│   │
│   ├── chat/                  # 聊天相关组件
│   │   ├── ChatBubble.tsx         # 气泡渲染
│   │   ├── ChatInputArea.tsx      # 输入区 (文字/语音/表情/图片)
│   │   ├── ChatModals.tsx         # 聊天弹窗 (记忆/世界书/概要)
│   │   ├── MessageItem.tsx        # 消息项组件
│   │   ├── StatusCardRenderer.tsx # 状态卡片渲染
│   │   ├── VoiceBubble.tsx        # 语音气泡
│   │   ├── WaveformCanvas.tsx     # 波形绘制
│   │   ├── ThemeRegistry.ts       # 聊天主题注册
│   │   ├── cards/                 # 特殊卡片组件
│   │   │   ├── VoiceCallSummaryCard.tsx
│   │   │   ├── WeChatMomentsCard.tsx
│   │   │   ├── XhsCard.tsx
│   │   │   ├── RoomNoteCard.tsx
│   │   │   └── ...
│   │   ├── plugins/               # 聊天插件
│   │   └── skeletons/             # 骨架屏卡片
│   │
│   ├── os/                    # 系统级组件
│   │   ├── StatusBar.tsx          # 顶部状态栏
│   │   ├── AppIcon.tsx            # 桌面图标
│   │   ├── UpdatePopup.tsx        # 更新弹窗
│   │   ├── ConfirmDialog.tsx      # 确认对话框
│   │   └── ...
│   │
│   ├── character/             # 角色编辑组件
│   ├── bank/                  # 银行组件
│   ├── date/                  # 约会模式组件
│   ├── novel/                 # 小说组件
│   └── room/                  # 房间组件
│
├── hooks/                     # 自定义 Hooks
│   ├── useChatAI.ts           # ★ 核心聊天 AI Hook (Prompt构建/记忆/发送)
│   ├── diaryProcessor.ts      # 日记处理器
│   ├── useVoiceRecorder.ts    # 语音录制
│   ├── useVoiceTts.ts         # TTS Hook
│   ├── usePushNotifications.ts # 推送通知 Hook
│   ├── xhsProcessor.ts       # 小红书指令处理器
│   └── xhsHelpers.ts         # 小红书辅助函数
│
├── utils/                     # 工具函数
│   ├── db/                    # ★ IndexedDB 数据层 (分域拆分)
│   │   ├── core.ts                # DB 定义 + ObjectStore 创建 (v38)
│   │   ├── index.ts               # Barrel 导出 → DB 对象
│   │   ├── characterStore.ts      # 角色/消息/群组 CRUD
│   │   ├── contentStore.ts        # 主题/资产/Emoji/相册
│   │   ├── appDataStore.ts        # 日记/任务/社交/课程/小说
│   │   ├── bankStore.ts           # 银行相关
│   │   ├── backupStore.ts         # 备份/导入导出
│   │   └── vectorMemoryStore.ts   # 向量记忆本地存储
│   │
│   ├── backendClient.ts       # ★ 后端 API 客户端 (getUserId/buildHeaders/检索/提取/同步)
│   ├── cloudBackup.ts         # 云备份 SDK (上传/下载/列表)
│   ├── systemBackup.ts        # 系统备份 (ZIP 导出/导入)
│   │
│   ├── chatPrompts.ts         # ★ 系统 Prompt 构建 (世界书/记忆/人设注入)
│   ├── chatParser.ts          # 聊天回复解析 (表情/动作/语气)
│   ├── context.ts             # 上下文窗口管理
│   │
│   ├── vectorMemoryExtractor.ts  # 向量记忆提取 (LLM 摘要)
│   ├── vectorMemoryRetriever.ts  # 向量记忆检索 (Embedding 相似度)
│   ├── embeddingService.ts       # Embedding 调用 (OpenAI/Cohere/本地ONNX)
│   ├── mindSnapshotExtractor.ts  # 心智快照提取
│   │
│   ├── autonomousAgent.ts     # 自主体 Agent (后端驱动, SSE 轮询)
│   ├── hormoneDynamics.ts     # 激素动力学系统
│   ├── bodySignalRenderer.ts  # 体感信号渲染
│   │
│   ├── minimaxTts.ts          # MiniMax TTS (HTTP)
│   ├── minimaxTtsWs.ts        # MiniMax TTS (WebSocket)
│   ├── cloudStt.ts            # 云端 STT
│   │
│   ├── realtimeContext.ts     # 实时上下文 (天气/新闻/热搜/Notion/飞书)
│   ├── hotSearchContext.ts    # 热搜上下文
│   ├── temporalContext.ts     # 时间上下文
│   │
│   ├── xhsMcpClient.ts       # 小红书 MCP 客户端
│   ├── xhsFreeRoam.ts        # 小红书自由浏览逻辑
│   ├── novelUtils.ts          # 小说工具
│   ├── datePrompts.ts         # 约会模式 Prompts
│   │
│   ├── eventExtractor.ts      # 事件提取器 (约会/日记)
│   ├── thinkingExtractor.ts   # 思考标签提取
│   ├── safeApi.ts             # 安全 API 调用封装
│   ├── pushSubscription.ts    # Web Push 订阅管理
│   ├── preloadResources.ts    # 资源预加载
│   ├── haptics.ts             # 触觉反馈
│   ├── file.ts                # 文件处理
│   ├── markdownLite.tsx       # 轻量 Markdown 渲染
│   └── parseDateExpression.ts # 日期表达式解析
│
├── types/                     # TypeScript 类型定义
│   ├── index.ts               # Barrel 导出
│   ├── core.ts                # 核心类型 (APIConfig/OSTheme/UserProfile/Message...)
│   ├── chat.ts                # 聊天类型
│   ├── character.ts           # 角色类型 (CharacterProfile/Sprites/RoomConfig...)
│   ├── room.ts                # 房间类型
│   ├── social.ts              # 社交类型
│   ├── bank.ts                # 银行类型
│   ├── xhs.ts                 # 小红书类型
│   ├── realtime.ts            # 实时配置类型
│   ├── backup.ts              # 备份类型
│   ├── tts.ts                 # TTS 配置类型
│   ├── stt.ts                 # STT 配置类型
│   └── statusCard.ts          # 状态卡类型
│
├── constants/                 # 常量
│   └── archivePrompts.ts      # 归档 Prompts
├── constants.tsx              # AppID 枚举 + 应用注册表
│
├── styles/themes/             # 主题 CSS 文件
├── assets/                    # 静态资源
├── public/                    # 公共文件
├── icons/                     # 应用图标
│
├── api/                       # 历史 Vercel 代理残留（当前 Cloudflare Pages/Workers 部署不再依赖）
│   ├── tts-proxy.ts
│   └── tts-ws-proxy.ts
│
├── worker/                    # Service Worker
│   └── index.js               # 推送通知 + 离线缓存
│
├── scripts/                   # 脚本
│   └── mcp-proxy.mjs          # MCP 代理服务器
│
└── deploy-prod.ps1            # 生产部署脚本
```

### 2.4 数据存储 — 前后端双轨

#### 本地 (IndexedDB)

- 数据库名: `AetherOS_Data`, 当前版本: **38**
- 定义在 [utils/db/core.ts](file:///c:/Users/ASUS/Desktop/糯米机二改/SULLYTEST2/utils/db/core.ts)
- 通过 [utils/db/index.ts](file:///c:/Users/ASUS/Desktop/糯米机二改/SULLYTEST2/utils/db/index.ts) 统一导出 `DB` 对象

| ObjectStore | 用途 |
|---|---|
| `characters` | 角色元数据 (人设/立绘/房间配置) |
| `messages` | 聊天消息 (索引: charId, groupId) |
| `vector_memories` | 向量记忆本地缓存 (索引: charId) |
| `scheduled_messages` | 定时消息 |
| `gallery` | 相册图片 |
| `diaries` | 日记 |
| `social_posts` | 朋友圈帖子 |
| `worldbooks` | 世界书 |
| `novels` | 小说 |
| `themes` / `assets` | 主题 / 资产 (壁纸/字体/图标) |
| `emojis` / `emoji_categories` | 表情 |
| `bank_transactions` / `bank_data` | 银行 |
| `courses` / `games` | 课程 / 游戏存档 |
| `tasks` / `anniversaries` | 任务 / 纪念日 |
| `room_todos` / `room_notes` | 房间待办 / 笔记 |
| `letters` | 信件 |
| `voice_audio` | 语音音频缓存 |
| `xhs_stock` / `xhs_activities` | 小红书素材/活动记录 |
| `user_profile` | 用户档案 |
| `groups` | 群组 |

#### 云端 (localStorage 配置 + 后端 D1)

- `localStorage` 存放配置项 (API keys, 主题JSON, 等)
- 后端 D1 数据库负责持久化记忆、关系图、Agent 状态等
- 同步通过 [backendClient.ts](file:///c:/Users/ASUS/Desktop/糯米机二改/SULLYTEST2/utils/backendClient.ts) 进行

### 2.5 上下文 Provider 层级

```
VirtualTimeProvider              ← 虚拟时间
  └─ OSProvider                  ← 综合 Provider (组合子Context)
      ├─ AppProvider             ← 导航 (activeApp/openApp/back)
      ├─ NotificationProvider    ← 通知 (toast/未读)
      └─ OSDataProvider          ← 核心数据 (角色/设置/主题/备份)
          └─ PhoneShell          ← 手机壳 (状态栏+渲染 activeApp)
```

### 2.6 核心数据流

```mermaid
graph LR
    U[用户输入] --> ChatAI[useChatAI Hook]
    ChatAI --> Prompts[chatPrompts.ts<br/>构建 system prompt]
    ChatAI --> Retrieval[vectorMemoryRetriever<br/>记忆检索]
    ChatAI --> Context[context.ts<br/>上下文裁剪]
    ChatAI --> LLM[LLM API 调用]
    LLM --> Parser[chatParser<br/>解析回复]
    Parser --> UI[ChatBubble 渲染]
    LLM --> Extractor[vectorMemoryExtractor<br/>记忆提取]
    Extractor --> LocalDB[IndexedDB]
    Extractor --> Backend[backendClient → 云端D1]
```

---

## 3. 后端 — csyos-workers

### 3.1 技术栈

| 项目 | 技术 |
|---|---|
| 运行时 | **Cloudflare Workers** |
| 路由 | **itty-router v5** |
| 数据库 | **Cloudflare D1** (SQLite) |
| 向量数据库 | **Cloudflare Vectorize** (`csyos-memory-index`, BGE-M3) |
| 消息队列 | **Cloudflare Queues** (`csyos-semantic-jobs` + `csyos-index-jobs`) |
| 对象存储 | **Cloudflare R2** (云备份) |
| 推送 | **Web Push** (web-push 库) |
| 定时任务 | **Cron Triggers** (每5分钟) |
| 部署 | `wrangler deploy` |

### 3.2 目录结构

```
csyos-workers/
├── src/
│   ├── index.ts           # 入口 — 路由注册 + 鉴权中间件 + Cron 处理
│   ├── types.ts           # Env 类型 (D1/R2 bindings)
│   │
│   ├── routes/            # API 路由处理器
│   │   ├── health.ts          # GET /health
│   │   ├── memory.ts          # /api/memories — 记忆 CRUD + retired hormone backfill tombstone
│   │   ├── retrieval.ts       # /api/retrieval/search — 向量检索 + Rerank
│   │   ├── extraction.ts      # /api/extraction/extract — LLM 记忆提取
│   │   ├── graph.ts           # /api/graph — 关系图谱 (语义关联/backfill/导入导出)
│   │   ├── sync.ts            # /api/sync — 双向同步 (push/pull)
│   │   ├── agent.ts           # /api/agent — 自主体 (start/stop/status/config/stream)
│   │   ├── distillation.ts    # /api/distillation — 记忆蒸馏 (L0→L1 聚合)
│   │   ├── hormoneJobs.ts     # /api/memories/backfill-hormones/jobs — 激素回填异步任务
│   │   ├── semanticJobs.ts    # /api/semantic/jobs — 语义任务状态 / 取消
│   │   ├── semanticRebuild.ts # /api/semantic/rebuild — 语义重建入口
│   │   ├── jobRouteErrors.ts  # 任务路由错误响应辅助
│   │   ├── push.ts            # /api/push — Web Push (subscribe/unsubscribe/test)
│   │   ├── backup.ts          # /api/backup — 云备份 (R2 上传/下载/列表/删除)
│   │   ├── hotlist.ts         # /api/public/hotlist — 公共热搜 (无鉴权)
│   │   └── weiboSearch.ts     # /api/public/weibo/search — 微博搜索 (无鉴权)
│   │
│   ├── services/          # 业务逻辑
│   │   ├── agentEngine.ts     # Agent 引擎 (Cron tick + LLM 决策 + 消息生成)
│   │   ├── embedding.ts       # Embedding 服务 (代理调用用户API + IDF/keyword/rerank)
│   │   ├── hormoneMemory.ts   # 激素-记忆关联服务
│   │   ├── lifeStreamService.ts # LifeStream 碎片生成
│   │   ├── pushService.ts     # 推送通知服务
│   │   ├── semanticInvalidation.ts # 语义失效检测
│   │   └── vectorIndex.ts     # Vectorize 索引管理 (D1↔Vectorize 同步)
│   │
│   ├── consumers/         # Queue 消费者
│   │   ├── semanticConsumer.ts # 语义任务处理 (semantic-rebuild)
│   │   ├── indexConsumer.ts    # 向量索引任务处理 (index-memory)
│   │   └── hormoneConsumer.ts  # 激素回填任务处理 (hormone-memory-item)
│   │
│   └── db/
│       └── schema.sql         # D1 建表语句 (7 核心表 + 2 语义任务表)
│
├── wrangler.toml          # Workers 配置 (bindings/cron/secrets)
└── package.json
```

### 3.3 数据库 Schema (D1)

| 表 | 主键 | user_id 隔离 | 用途 |
|---|---|---|---|
| `users` | `user_id` | — | 用户注册 |
| `memories` | `id` | ✅ `NOT NULL` | 向量记忆 (含 vector JSON) |
| `memory_relations` | `(source_id, target_id, relation)` | 间接 (通过 memories) | 语义关联边 |
| `memory_chains` | `id` | ✅ | 记忆链 (蒸馏结果) |
| `sync_log` | `id` (auto) | ✅ | 同步日志 |
| `agent_state` | `(user_id, key)` | ✅ 复合主键 | Agent KV 状态 |
| `push_subscriptions` | `id` (auto) | ✅ | Web Push 订阅 |
| `agent_messages` | `id` (auto) | ✅ | Agent 主动消息 |

### 3.4 Bindings (wrangler.toml)

| Binding | 类型 | 名称 |
|---|---|---|
| `DB` | D1 | `csyos-db` |
| `BACKUP_BUCKET` | R2 | `csyos-backups` |
| `LEGACY_VECTOR_INDEX` | Vectorize | `csyos-memory-index` |
| `VECTOR_INDEX` | Vectorize | `csyos-memory-index-v2` |
| `SEMANTIC_QUEUE` | Queue | `csyos-semantic-jobs` |
| `INDEX_QUEUE` | Queue | `csyos-index-jobs` |
| `HORMONE_QUEUE` | Queue | `csyos-hormone-jobs` |
| `API_SECRET` | Secret | `set-via-wrangler-secret` |
| `VAPID_*` | Var | Web Push 密钥对 |

### 3.5 鉴权机制

```
请求 → authMiddleware → 验证 Bearer Token (API_SECRET)
                      → 提取 X-User-Id header → 注入 req.userId
                      → 所有 SQL 查询携带 WHERE user_id = ?
```

- `/health` 和 `/api/public/*` 不需要鉴权
- 所有其他 `/api/*` 路由均需 Bearer Token
- 用户隔离完全依赖 `X-User-Id` header

---

## 4. 前后端通信

### 4.1 通信方式

| 方式 | 用途 |
|---|---|
| **REST API** (fetch) | 记忆 CRUD / 检索 / 提取 / 同步 / 备份 |
| **SSE** (EventSource) | Agent 消息流 (`/api/agent/stream`) |
| **sendBeacon** | Agent 停止信号 (页面关闭时) |
| **Web Push** | Agent 主动消息推送通知 |

### 4.2 请求头结构 (buildHeaders)

```
Authorization: Bearer <set-via-env-or-local-override>
X-User-Id: csy-{uuid}
X-Embedding-Key: ...        ← 用户自有 API Key
X-Embedding-Provider: ...
X-Embedding-Base-URL: ...
X-Embedding-Model: ...
X-LLM-Key: ...              ← 副 API Key
X-LLM-Base-URL: ...
X-LLM-Model: ...
X-Rerank-Key: ...            ← Cohere Rerank
```

> [!NOTE]
> 后端不存储任何 API Key。所有密钥通过请求头由前端传递，后端仅代理调用。

### 4.3 Fallback 策略

前端采用 **"Backend-First, Local-Fallback"** 策略：
1. 检查后端是否在线 (`isBackendAlive`, 缓存5分钟)
2. 在线 → 使用后端 API
3. 离线 → 降级到本地 IndexedDB 处理
4. 适用于：记忆检索、记忆提取

---

## 5. 记忆系统架构

### 5.1 双层记忆

| 层级 | 存储 | 说明 |
|---|---|---|
| **L0 (原始)** | IndexedDB + D1 | 从对话中自动提取的记忆片段 |
| **L1 (蒸馏)** | D1 | 通过 distillation 将相似 L0 记忆聚合 |

### 5.2 记忆流水线

```
对话结束 → vectorMemoryExtractor (LLM 提取摘要)
         → Embedding 向量化 (BGE-M3)
         → 本地 IndexedDB 存储
         → backendClient.pushMemories → D1 云端存储
         → INDEX_QUEUE → Vectorize 索引 (vectorIndex.ts)
         → graph.backfillSemantic → 语义关联图谱
         → distillation.run → L1 蒸馏 (多条 L0 → 1 条 L1)
```

### 5.3 检索流水线 (后端 5 阶段)

```
新消息 → backendClient.tryBackendRetrieval → routes/retrieval.ts

  Stage 1: Keyword Pre-filter
    → IDF 加权关键词匹配 → 筛选词法候选池 (30-50 条)

  Stage 2: Dense Recall
    → Vectorize.query(top-40) + 词法候选合并 (上限 120 条)
    → 加载完整记忆数据 (含 vector/hormoneSnapshot)

  Stage 3: Rerank
    → Cohere cross-encoder 重排序 (top-15 候选)
    → score = rerank×0.5 + weighted×0.5

  Stage 4: DPP 多样性选择
    → 行列式点过程选择 (去重阈值 0.92)
    → 最多 12 条 L0 + 2 条 L1

  Stage 5: Graph Expansion
    → 1-hop 语义邻居 (memory_relations, 排除 temporal_adjacent)
    → 低阈值 0.30 + 重新 DPP
    → Lexical-only 回退补充 (最多 4 条)

  → 格式化输出 → 注入到 system prompt
```

---

## 6. 其他子项目

### 6.1 cloudflare-ws-proxy

MiniMax TTS WebSocket 代理，解决跨域问题。

### 6.2 Acsus-Paws-Puffs-analyzer

独立分析/扩展项目，不在当前主产品运行链里。

---

## 7. 部署架构

```mermaid
graph TB
    User[用户浏览器/PWA]
    Pages[Cloudflare Pages<br/>前端静态托管]
    Workers[Cloudflare Workers<br/>后端 API]
    D1[(D1 数据库)]
    R2[(R2 对象存储)]
    Cron[Cron Trigger<br/>每5分钟]

    User -->|HTTPS| Pages
    User -->|API 请求| Workers
    Workers --> D1
    Workers --> R2
    Cron -->|触发| Workers
    Workers -->|Web Push| User
```

| 组件 | 部署位置 | 域名 |
|---|---|---|
| 前端 | Cloudflare Pages | `https://sully-frontend.pages.dev`（当前无自定义域名） |
| 后端 | Cloudflare Workers | `https://chushiyu.de5.net` |
| TTS 代理 | Cloudflare Workers | `wss://tts-ws-proxy.sully-tts-proxy.workers.dev/ws` |
| 外部平台代理 | Cloudflare Workers | `https://sully-n.qegj567.workers.dev` |
| 数据库 | Cloudflare D1 | `csyos-db` |
| 备份存储 | Cloudflare R2 | `csyos-backups` |

> [!NOTE]
> 上表描述的是当前线上真实入口，不是未来目标状态。
> 等前端和辅助 Worker 绑定新域名后，这里需要和部署环境一起同步更新。

---

## 8. 关键约定

1. **前端所有数据操作通过 `DB` 对象** — 不直接操作 IndexedDB
2. **后端所有 SQL 必须带 `WHERE user_id = ?`** — 保证用户隔离
3. **后端不存储 API Key** — 仅从 header 透传
4. **类型定义在 `types/` 目录** — barrel 导出，`import { X } from '../types'`
5. **前端入口是 `App.tsx`** — 不是 `src/App.tsx`（`src/` 目录当前只剩 assets 残留，不是主源码树）
6. **每个 App 对应 `apps/` 下的一个文件或子目录**
7. **IndexedDB store 定义在 `utils/db/core.ts`** — 修改需要 bump `DB_VERSION`
