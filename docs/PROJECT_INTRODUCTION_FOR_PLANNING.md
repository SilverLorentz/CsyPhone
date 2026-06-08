# 项目介绍文档：手抓糯米机 / SullyOS

更新时间：2026-05-31  
适用对象：策划、产品、内容方案设计人员  
范围：仅基于当前前端仓库 `SULLYTEST2` 内能读到的文件、源码和文档整理。

## 0. 文档口径

这份文档不是按“常见 AI 聊天应用”经验推测出来的，而是按当前仓库内容取证整理。

主要取证文件：

- `README.md`
- `package.json`
- `index.tsx`
- `App.tsx`
- `components/PhoneShell.tsx`
- `constants.tsx`
- `types/core.ts`
- `types/character.ts`
- `utils/db/core.ts`
- `utils/backendConfig.ts`
- `utils/runtimeConfig.ts`
- `hooks/useChatAI.ts`
- `utils/chatPrompts.ts`
- `utils/vectorMemoryRetriever.ts`
- `utils/vectorMemoryExtractor.ts`
- `apps/settings/SettingsMenu.tsx`
- `docs/API_USAGE_BY_FEATURE.md`
- `docs/IMAGE_GENERATION_USER_MANUAL_DRAFT.md`
- `docs/LOVESHOW_CURRENT_STAGE_REPORT.md`
- `docs/DEPENDENCY_UPGRADE_PLAN.md`
- `vite.config.ts`
- `wrangler.toml`
- `manifest.json`
- `capacitor.config.json`

有几处仓库资料存在版本不一致，本文件以当前源码和配置为准：

- `README.md` 里仍写着 `React 18 + Vite 5 + Capacitor 6`，但 `package.json` 和 `docs/DEPENDENCY_UPGRADE_PLAN.md` 显示当前依赖已升级到 `React 19`、`Vite 8`、`Capacitor 8`。
- 预览页里出现过 `IndexedDB v38` 的展示文案，但 `utils/db/core.ts` 当前 `DB_VERSION = 46`。
- 因此，给策划同步时建议使用本文口径，不直接复制旧 README 里的版本号。

## 1. 一句话定位

`手抓糯米机 / SullyOS` 是一个以“手机 OS / PWA 模拟器”为外壳的 AI 角色陪伴与生活系统前端。

用户不是只打开一个聊天窗口，而是在一台虚拟手机里使用多个“应用”：私聊、群聊、语音通话、见面、约会剧场、恋综、社交动态、房间、日程、日记、音乐、相册、记忆网络、角色档案、世界书、健康记录、占卜等功能都围绕同一批角色和用户关系展开。

目前前端负责：

- 手机外壳、锁屏、桌面、状态栏、动态岛、悬浮歌词、弹窗通知。
- 各个 App 页面、组件、样式和浏览器侧交互。
- 主 API / 副 API / TTS / STT / 生图 / 小红书 / Notion / 飞书等前端调用入口。
- IndexedDB 和 localStorage 本地数据存储。
- 与 `csyos-workers` 后端通信，包括记忆、检索、云备份、自律代理、推送等链路。
- Cloudflare Pages Functions 代理部分第三方接口。

## 2. 项目基本信息

| 项目项 | 当前确认内容 |
| --- | --- |
| 仓库名 | `SULLYTEST2` |
| package 名 | `aetheros-simulator` |
| PWA manifest 名称 | `Csy-OS` |
| Capacitor appName | `手抓糯米机` |
| Capacitor appId | `com.aetheros.simulator` |
| 许可证 | `PolyForm-Noncommercial-1.0.0`，非商业用途 |
| 部署目标 | Cloudflare Pages |
| Pages 项目名 | `sully-frontend` |
| 构建输出目录 | `dist` |
| 前端源码布局 | 根层入口 + 一级领域目录，不是 `src/` 布局 |

重要边界：

- 这是前端仓库，不包含完整后端源码。
- 当前仓库里有少量 `functions/`，属于 Cloudflare Pages Functions 代理，不等于主后端。
- `README.md` 明确写到主后端依赖是 `csyos-workers`。
- 生产发布有红线：`origin/main` 会触发正式 Cloudflare Pages 部署，不能把 main 当测试通道。

## 3. 技术栈

按 `package.json` 当前依赖确认：

| 分类 | 当前使用 |
| --- | --- |
| 前端框架 | React `^19.2.6` |
| 构建工具 | Vite `^8.0.14` |
| 语言 | TypeScript `^5.3.3` |
| 样式 | TailwindCSS `^4.3.0`、全局 CSS、模块级 CSS |
| 移动封装 | Capacitor `8.x` |
| 测试 | Vitest `^4.1.7`、Testing Library、jsdom、fake-indexeddb |
| 本地数据库 | IndexedDB，封装在 `utils/db/` |
| 动画/可视化 | framer-motion、motion、three、d3、recharts |
| 音频/语音 | VAD WASM、MiniMax、ElevenLabs、STT 配置 |
| 生图/媒体 | NovelAI、OpenAI 兼容生图、html2canvas、modern-screenshot、lamejs |
| 文档/渲染 | pdfjs-dist、katex |

运行形态：

- Web / PWA 是主要形态。
- `manifest.json` 设置 `display: standalone`，支持安装成独立 PWA。
- `capacitor.config.json` 指向 `dist`，说明也考虑 Android / 原生容器同步。
- `vite.config.ts` 配了本地 dev proxy，用于 MiniMax、ElevenLabs、小红书 bridge 等接口。

## 4. 入口与整体架构

当前入口链路：

```text
index.html
  -> index.tsx
  -> App.tsx
  -> VirtualTimeProvider
  -> OSProvider
  -> PhoneShell
  -> Launcher 或具体 App
```

`index.tsx` 做了这些全局初始化：

- 生产环境隐藏 `console.log / warn / debug / info`，保留 `console.error`。
- 初始化系统拦截器。
- 初始化应用生命周期恢复逻辑。
- 安装 iOS standalone workaround。
- 预加载关键本地资源和空闲期外部资源。

`App.tsx` 有两个主要分支：

- 普通入口：进入 `SullyOSApp`，渲染手机系统。
- 预览入口：当 URL hash 或 query 命中 `preview` 时，进入 `FeaturePreviewPage`。

`PhoneShell.tsx` 是手机壳核心：

- 显示锁屏、桌面、App 容器。
- 懒加载各个 App chunk。
- 管理返回键、浏览器返回手势、Android 原生 back button。
- 显示首次免责声明、导入中断恢复弹窗、特别事件弹窗、更新弹窗。
- 显示状态栏、动态岛、悬浮歌词、系统 toast。
- 包含 chunk 加载失败时的自动恢复和手动刷新入口。

## 5. 数据和状态模型

### 5.1 全局 Provider

`OSProvider` 把多个上下文组合在一起：

- `NotificationProvider`：通知和 toast。
- `AppProvider`：打开/关闭 App、返回栈等。
- `CharacterProvider`：角色、群组、世界书、小说数据。
- `ConfigProvider`：主 API、副 API、实时感知、TTS、STT、生图、向量配置。
- `AgentProvider`：自律代理、后端 SSE / polling、推送订阅。
- `OSDataProvider`：主题、用户档案、外观预设、备份恢复、系统日志等。

### 5.2 用户与角色

`types/character.ts` 里的 `CharacterProfile` 显示，角色不是简单姓名头像，而是一组长期关系资产：

- 基础资料：`id`、`name`、`avatar`、`description`、`systemPrompt`。
- 世界观：`worldview`、城市/地点字段。
- 记忆：旧版 `memories`、精炼记忆、活跃月份、向量记忆开关。
- 角色外观：聊天气泡、聊天背景、见面立绘、皮肤组。
- 生图：角色锁脸、负面 tags、OpenAI 兼容外貌 prompt、默认风格、默认 Vibe。
- 语音：MiniMax voice id、ElevenLabs voice id。
- 见面和约会总结配置。
- 房间配置、查手机状态、社交档案。
- 内部状态层 `moodState` 和创意状态栏 `lastStatusCard`。

默认内置角色在 `context/OSContext.tsx` 中定义为 `Sully`，包含系统 prompt、世界观、立绘、房间家具等预设。

### 5.3 本地存储

IndexedDB：

- 数据库名：`AetherOS_Data`
- 当前版本：`46`
- 入口：`utils/db/core.ts`

当前 store 覆盖：

- 角色、群组、用户档案、主题、素材。
- 消息、语音音频、定时消息。
- 日记、任务、纪念日。
- 房间待办、房间便签。
- 相册、社交动态。
- 自习课程、TRPG、世界书、小说。
- 存钱罐交易和数据。
- 小红书图库、小红书活动。
- 向量记忆、回忆唱片、回忆唱片音频。
- 热搜快照、聊天上下文镜像、昨日小报、Vibe 参考图。

localStorage：

- 主题、最后活跃角色、免责声明确认。
- 主 API、副 API 池、模型列表、预设。
- 实时感知、TTS、STT、生图配置。
- 后端 URL / token / user id / client id。
- 自律代理配置、性能模式、全屏、震动等偏好。

## 6. 后端和外部服务关系

前端通过 `utils/backendConfig.ts` 解析后端：

```text
1. localStorage 调试覆盖
2. Vite 构建环境变量
3. 代码默认值
```

当前源码默认后端 URL 是 staging：

```text
https://csyos-backend-staging.sully-tts-proxy.workers.dev
```

后端相关用途在前端代码中能确认包括：

- 云端记忆推送 / 拉取 / 删除 / 更新。
- 后端检索：聊天时可优先尝试后端记忆检索，再回落本地检索。
- 后端记忆抽取：自动或批量抽取时可优先走后端。
- 云端备份：上传、列表、下载、删除备份。
- 自律代理：启动、停止、推送上下文、SSE 接收消息、轮询兜底、今日生活、日程修订。
- Web Push：获取 VAPID 公钥、订阅、退订、测试推送。
- 向量记忆引擎：标准版 / 增强版切换和重建任务。

Pages Functions 代理：

- `functions/minimax-api`
- `functions/minimax-global-api`
- `functions/minimax-music-api`
- `functions/elevenlabs-token`
- `functions/elevenlabs-tts-stream`
- `functions/elevenlabs-voice-create`
- `functions/elevenlabs-voice-design`
- `functions/github-api`
- `functions/github-upload`
- `functions/netease-api/song-detail`

外部服务入口按当前设置菜单和代码确认包括：

- 主 AI：OpenAI 兼容 `/chat/completions` 接口。
- 副 AI：心声、记忆摘要、事件提取、幕后结构化任务。
- Embedding / Rerank：OpenAI 兼容或 Cohere 相关配置。
- MiniMax：TTS 和音乐生成。
- ElevenLabs：TTS / 语音设计 / 语音创建。
- Groq / 硅基流动：STT 配置入口。
- NovelAI / OpenAI 兼容：生图。
- Notion / 飞书：日记、笔记、资料读取。
- 小红书 Bridge / MCP：搜索、浏览、发帖、评论、点赞、收藏等。
- 天气、资讯、微博热搜等实时感知。

## 7. App 清单与功能地图

下面按 `constants.tsx` 的启动器配置和 `PhoneShell.tsx` 的路由确认整理。

### 7.1 启动器可见应用

| 启动器名称 | AppID | 当前定位 |
| --- | --- | --- |
| 神经链接 | `character` | 角色档案、人格底座、长期记忆、状态、角色设置。 |
| Message | `chat` | 私聊主入口，支持文本、表情、引用、语音、图片、生图、工具动作、记忆注入等。 |
| 群聊 | `group_chat` | 多角色群聊，一次主模型决定多个角色的发言。 |
| 小小窝 | `room` | 角色房间、家具、互动、房间计划。 |
| 查手机 | `check_phone` | 生成/查看角色手机记录、证据卡等内容。 |
| 实时热搜 | `hot_search` | 热搜/资讯快照类入口。 |
| Spark | `social` | 社交动态、评论、角色社交表达。 |
| 档案 | `user` | 用户档案与部分用户侧设定。 |
| 存钱罐 | `bank` | 记账、存钱罐、商店互动、数据看板。 |
| 时光契约 | `schedule` | 任务、纪念日、约定、日程感。 |
| 交换日记 | `journal` | 日记生成、润色、读取及外部日记联动。 |
| 见面 | `date` | 角色线下见面/立绘互动/见面聊天与总结。 |
| 约会剧场 | `theater` | 地点式约会剧情、时间线、总结、散场片段。 |
| 轨迹 | `trajectory` | 人生轨迹、记忆节点、角色时间线。 |
| 心动放送 | `love_show` | AI 恋综玩法雏形，用户作为唯一恋爱主轴推进节目。 |
| 自习室 | `study` | 导入资料、生成课程、章节讲解。 |
| TRPG | `game` | 开局和剧情推进类游戏。 |
| 笔友会 | `novel` | 小说/书信/章节协作创作。 |
| 世界书 | `worldbook` | 设定资料管理，可挂载到角色。 |
| 使用帮助 | `faq` | 帮助入口。 |
| 二改手册 | `csy_manual` | 二改版使用手册入口。 |
| 相册 | `gallery` | 角色照片、AI 图片、照片点评、图片上下文。 |
| 自由活动 | `xhs_free_roam` | 角色自主使用小红书的自由活动。 |
| 小红书图库 | `xhs_stock` | 小红书发布素材图库。 |
| 气泡工坊 | `thememaker` | 聊天气泡样式制作。 |
| 外观 | `appearance` | 壁纸、图标、桌面组件、外观预设等。 |
| 设置 | `settings` | 数据、API、副 API、实时、语音、生图、代理、请求账本等。 |
| 特别时光 | `special_moments` | 节日/特殊日期活动，目前有情人节相关逻辑。 |
| 摘星楼 | `zhaixinglou` | 占星、塔罗、星盘、解读、分享卡。 |
| 语音通话 | `voice_call` | 与角色进行实时语音通话，支持 TTS/STT、通话模式、通话记忆。 |
| 认知网络 | `cognitive_network` | 记忆浏览、回忆网络、长期关系资产整理。 |
| 状态栏工坊 | `status_workshop` | 生成/编辑角色状态栏模板和创意状态卡。 |
| 回声唱片 | `echo_record` | 歌词草稿、歌词可唱性检查、优化、音乐风格提示词、歌曲生成入口。 |
| Emo Cloud | `music` | 音乐搜索、播放、歌词、歌单、分享歌曲、回忆唱片播放。 |
| 半糖主义 | `half_sugar` | 健康/饮食/体重/运动/睡眠/月相等记录与分析。 |

### 7.2 非常规入口或隐藏入口

| 名称 | 当前情况 |
| --- | --- |
| 跨时空对话 | `crosstime` 在 `constants.tsx` 注册，但被 `HIDDEN_LAUNCHER_APPS` 隐藏；`PhoneShell` 仍有懒加载路由。 |
| 浏览器 | `browser` 在 `PhoneShell` 有路由，`constants.tsx` 中启动器配置被注释为隐藏。 |
| StoryPhone | `story_phone` 在 `PhoneShell` 有路由，启动器配置中没有可见入口。 |
| 功能预览页 | `#/preview` 或 query `preview` 进入 `FeaturePreviewPage`，用于功能展示，不是主 App 桌面。 |

### 7.3 Dock 应用

`constants.tsx` 当前 Dock 固定：

- Message
- 群聊
- Spark
- 设置

## 8. 核心体验链路

### 8.1 私聊 / Message

私聊是项目核心入口。`hooks/useChatAI.ts` 和 `utils/chatPrompts.ts` 显示，聊天不只是一次 LLM 请求，还会拼接角色设定、世界书、记忆、实时感知、音乐播放、日记、小红书、搜索、工具动作等上下文。

聊天中可触发的动作包括：

- 发送表情包。
- 引用回复。
- 发送语音消息。
- 主动来电。
- 分享歌曲。
- 请求发送图片。
- 回戳、转账、收取/退还转账。
- 回忆细节。
- 添加纪念日。
- 定时发送消息。
- 写/读 Notion 日记。
- 写/读飞书日记。
- 读取用户笔记。
- 搜索、微博搜索。
- 小红书搜索、浏览、发帖、分享、评论、回复、点赞、收藏、查看详情、查看主页。

策划理解重点：

- 角色可以像“真的在用手机”一样做动作。
- 每个动作都可能变成聊天里的特殊卡片、提示、外部数据或后台任务。
- 玩法方案可以围绕“聊天触发应用生态”设计，而不是只设计聊天话术。

### 8.2 长期记忆 / 认知网络

当前记忆系统包含两条链路：

- 读取链路：`VectorMemoryRetriever` 优先尝试后端检索，失败后本地 fallback，使用关键词预筛、embedding、相似度、重要性、时间新鲜度和多样性选择。
- 写入链路：`VectorMemoryExtractor` 自动或手动从聊天窗口抽取记忆，生成向量，写入 IndexedDB，并尝试同步到云端。

记忆并不是简单全文搜索。代码里已经有：

- 时间意图识别，如第一次、上次、经常、具体日期。
- 关键词救援。
- 向量相似度。
- 重要性、提及次数、新鲜度。
- 情绪/激素快照和 salience score。
- 后端优先、离线回退。
- 批量提取 checkpoint 相关逻辑。

策划理解重点：

- 项目长期目标更像“关系资产沉淀”，不是只保存聊天记录。
- 记忆可以服务聊天、约会、恋综、歌曲、相册、轨迹等多个应用。

### 8.3 自律代理 / 主动陪伴

`AgentProvider` 和 `utils/autonomousAgent.ts` 显示，自律代理由后端主导，前端负责：

- 启动/停止后端 Agent。
- 推送角色上下文快照。
- 通过 SSE 接收后端生成的消息。
- SSE 失败后回退到 polling。
- 保存后端消息到本地消息库。
- 前台 tick、短时间后台 tick。
- 通知后端用户已回复。
- 配合 Web Push 做离线通知。

默认配置里能看到：

- 默认启用。
- 最小间隔 15 分钟、最大间隔 40 分钟。
- 冷却 2 小时。
- 每日最多 5 次。
- 通知默认启用。

策划理解重点：

- 角色可以不等用户发消息，主动出现。
- 但主动频率受到配置约束，不是无限打扰。
- 如果要做“日常陪伴”“主动关心”“节目组通知”“角色生活流”，Agent 是重要底座。

### 8.4 语音通话

语音通话相关代码分布在：

- `apps/VoiceCallApp.tsx`
- `apps/voicecall/`
- `utils/voiceCallTtsClient.ts`
- `utils/minimaxTtsWs.ts`
- `utils/elevenLabsTtsWs.ts`
- `utils/elevenLabsTtsHttpStream.ts`
- `public/vad/`

按 `docs/API_USAGE_BY_FEATURE.md`，语音通话中用户说一轮，角色回一轮通常主模型 1 次；STT 和 TTS 是额外服务调用，不算主/副模型。

当前确认能力：

- 支持语音识别配置。
- 支持 MiniMax / ElevenLabs 语音合成。
- 有 VAD 模型和 WASM 资源。
- 有通话模式和外语字幕/翻译相关设置。
- 通话结束可整理通话记忆。

### 8.5 生图与相册

`docs/IMAGE_GENERATION_USER_MANUAL_DRAFT.md` 显示，生图支持：

- 手动生图。
- 角色主动发照片。
- NovelAI。
- OpenAI 兼容 `/images/generations`。
- 角色锁脸和用户锁脸。
- 风格预设。
- NovelAI Vibe 参考图，最多 3 张。
- 生成结果进入聊天和角色相册。
- 相册中可以查看、删除、保存、让角色点评图片、查看附近聊天上下文。

策划理解重点：

- 图片不是孤立素材，而是聊天、角色、相册、风格预设、Vibe、锁脸共同构成的视觉表达系统。
- 角色主动发照片可以作为“关系升温”“日常随手拍”“恋综片段票根”等玩法的一部分。

### 8.6 音乐与回忆唱片

当前相关应用：

- `回声唱片 / EchoRecord`
- `Emo Cloud / Music`

`docs/API_USAGE_BY_FEATURE.md` 显示：

- 回声唱片会调用主模型生成歌词草稿、检查可唱性、优化歌词、生成音乐风格提示词。
- 真正生成歌曲调用 MiniMax Music，不算主/副模型调用。
- Emo Cloud 负责搜歌、播放、歌词、歌单，不调用主/副模型。
- 分享歌曲卡片属于聊天回复的一部分，会按私聊计算。

策划理解重点：

- 音乐可以作为“情绪资产”和“回忆资产”的承载。
- 适合做回忆唱片、角色歌单、关系主题曲、恋综片尾曲等方案。

## 9. 重点垂直玩法：心动放送

仓库已有一份专门报告：`docs/LOVESHOW_CURRENT_STAGE_REPORT.md`。这里只提炼给策划的关键点。

当前 `心动放送` 已经不是单一约会聊天，而是 AI 恋综玩法雏形：

- 应用名：`心动放送`
- 节目名：`唯一心动线`
- 用户定位：本季主角，唯一恋爱主轴
- 嘉宾：当前角色 + 用户锁定角色 + 节目组 NPC 补位
- 阵容上限：当前报告写明正式嘉宾上限为 4 位

已实现或已有骨架的栏目：

- 开播前选角。
- Day 1 初见片段。
- 正片场景对话。
- 悬浮小手机。
- 镜头之外私聊。
- 放送通知。
- 隐藏心令。
- 心动档案。
- 心动热榜。
- 心动风向。
- 心动片段 / 心动回声。
- 收束结算。
- 嘉宾状态卡和印象卡。

当前产品规则倾向：

- 用户是唯一恋爱主轴。
- 嘉宾之间可以竞争、观察、误解、助攻。
- 不鼓励嘉宾之间发展主 CP。
- 不替用户做选择。
- 风向、热榜、心令和片段都应围绕用户与嘉宾关系。

当前主要缺口：

- 还没有完整一季节目的闭环。
- Day 1-5 / finale / completed 的类型有入口，但流程更接近“持续生成下一张选择点”。
- 还缺固定节目日程表、Day 结束推进、终选、赛季总结页。
- 心动片段目前偏结果沉淀，还不是完整可交互短剧场。
- 观察室 / 单采概念存在，但还不是强 UI 栏目。

策划优先要定：

- 是 5 天季播恋综，还是无限片段恋综。
- 是否有最终选择。
- 是否淘汰。
- 是否坚持无嘉宾 CP。
- NPC 是否能转正为角色库角色。
- 小手机是否作为长期中枢保留。

## 10. 设置系统

`apps/settings/SettingsMenu.tsx` 当前设置面板包括：

| 设置项 | 描述 |
| --- | --- |
| 备份与恢复 | 导出/导入数据、格式化系统。 |
| API 配置 | 主 AI 连接、深度沉浸模式。 |
| 副 API 配置 | 心声、记忆摘要、事件提取。 |
| 实时感知 | 天气、资讯、微博热搜、笔记与日程。 |
| 语音合成 | MiniMax / ElevenLabs、通话声线。 |
| 语音识别 | Groq / 硅基流动 STT。 |
| 生图服务 | NAI / OpenAI、分离风格。 |
| 向量记忆引擎 | 标准版 / 增强版。 |
| 自律代理 | 主动消息频率、推送通知。 |
| API 请求账本 | 本地调试日志、脱敏导出。 |

策划理解重点：

- 这个项目高度依赖用户自配 API 和服务。
- 很多玩法不是“打开即用”，需要配置主 API、副 API、后端 token、TTS、STT、生图、Embedding 等。
- 做新方案时要考虑新手引导和“未配置时的兜底体验”。

## 11. 成本与调用认知

`docs/API_USAGE_BY_FEATURE.md` 是面向用户的模型调用说明，里面把主模型、副模型和非模型接口分开了。

策划需要特别注意：

- 普通私聊发 1 条消息：主模型通常 1 次；开启心声、状态栏、事件提取、记忆抽取后，副模型可能 0-4 次。
- 见面、约会、TRPG、自习室、小说、存钱罐等生成类功能：通常每次生成/继续/重写约主模型 1 次。
- 摘星楼主要走自己的副模型配置。
- 语音输入、语音朗读、音乐播放、云备份、Notion/飞书同步、小红书真实操作本身不算主/副模型调用。
- 但如果需要 AI 写回复、总结、文案、识图，就会额外调用模型。

策划方案如果大量增加：

- 自动总结。
- 多角色同时判断。
- 热榜/风向/观察室。
- 每轮后台状态变化。
- 自动记忆抽取。
- 自动生图。

就需要同步考虑调用次数、接口费用和失败兜底。

## 12. 产品气质与内容方向

从当前应用命名、预览页、LoveShow 报告和功能设计看，项目气质不是“效率工具”，而是：

- 沉浸式角色陪伴。
- 手机拟态生活系统。
- 长期关系与记忆沉淀。
- 角色像在真实生活里使用社交、音乐、日记、房间、通话等应用。
- 视觉上偏手机 OS、iOS/PWA、卡片、毛玻璃、动态岛、弹窗通知、桌面组件。
- 内容上偏梦女、恋爱向、陪伴向、仪式感、关系资产、角色生活感。

已经存在的强主题：

- 长期记忆：认知网络、轨迹、回忆唱片。
- 关系现场：见面、约会剧场、语音通话。
- 社交传播：Spark、小红书、热搜、心动热榜。
- 创作资产：世界书、笔友会、TRPG、自习室、状态栏工坊、气泡工坊。
- 生活身体：半糖主义、时光契约、小小窝、交换日记。
- 神秘感/占卜：摘星楼。
- 恋综包装：心动放送。

## 13. 策划可用的方案切入点

### 13.1 不建议只做“新增聊天功能”

因为当前项目已经有大量聊天动作和卡片能力。新方案更适合从“系统玩法”切入：

- 如何让角色主动生活。
- 如何让用户在多个 App 间形成循环。
- 如何让记忆、相册、音乐、社交、约会互相影响。
- 如何让事件有开始、推进、结算和沉淀。

### 13.2 推荐的方案骨架

策划新方案可以按这套结构写：

```text
1. 入口：从哪个 App 进入，是否在桌面/通知/聊天中触发
2. 参与对象：用户、当前角色、多角色、NPC、节目组/系统
3. 每日/单次流程：开场 -> 互动 -> 选择 -> 反馈 -> 结算
4. AI 调用点：哪些是主模型，哪些是副模型，哪些不调用模型
5. 数据沉淀：写入聊天、记忆、相册、日记、音乐、轨迹、LoveShow season
6. 视觉表达：卡片、弹窗、小手机、桌面组件、分享长图、票根
7. 失败兜底：API 未配置、后端不可用、生成失败、图片加载失败时怎么展示
8. 成本控制：是否批量调用、是否自动后台跑、是否需要开关
```

### 13.3 可优先扩展的方向

| 方向 | 与现有系统匹配度 | 说明 |
| --- | --- | --- |
| 恋综季播闭环 | 高 | LoveShow 已有入口、选角、小手机、风向、心令、状态卡，只缺强节奏和结局。 |
| 角色日常主动陪伴 | 高 | Agent、推送、今日生活、聊天动作、日程都已有底座。 |
| 回忆资产系统 | 高 | 记忆、轨迹、回忆唱片、相册、昨日小报可以打通。 |
| 约会/见面章节化 | 高 | Date 和 Theater 已经存在总结、地点、时间线、散场片段。 |
| 社交传播链路 | 中高 | Spark、小红书、热搜、图库、浏览器已有，但真实平台依赖配置。 |
| 健康陪伴 | 中 | 半糖主义已有独立结构，和角色陪伴的融合点需要策划补。 |
| 占卜/命运包装 | 中 | 摘星楼完整度较高，可做运营活动或关系解读入口。 |

## 14. 当前风险和策划注意事项

### 14.1 功能很多，入口多，需避免方案继续堆散点

启动器已经有 30+ 应用入口。新方案最好明确主循环，不要只新增孤立 App。

### 14.2 配置成本高

很多能力依赖用户配置：

- 主 API。
- 副 API。
- 后端 URL / token。
- TTS / STT。
- 生图服务。
- Embedding / Rerank。
- 小红书、Notion、飞书等外部服务。

策划要考虑“未配置时用户看到什么”。

### 14.3 资料有旧口径

前面提到的 React/Vite/DB 版本不一致说明，仓库文档并非全部同步。写对外方案时建议以当前源码和本文件为准。

### 14.4 LoveShow 仍是骨架期

LoveShow 很适合策划发挥，但当前报告明确写到还缺完整赛季闭环。策划不要假设它已经是成熟恋综游戏。

### 14.5 本地数据很重

IndexedDB store 很多，包含图片、音频、记忆、消息、Vibe、相册等。涉及导入、导出、云备份、迁移时要谨慎设计流程和提示。

### 14.6 生产发布敏感

本仓库 `origin/main` 自动触发 Cloudflare Pages 正式部署。测试、方案验证、预览发布应走 beta 或测试路径。

## 15. 给策划的快速阅读版

可以把本项目理解成：

```text
一台围绕 AI 角色关系打造的虚拟手机。

聊天是入口，但不是全部。
角色有档案、记忆、房间、社交、日程、语音、照片、音乐、约会、恋综和长期轨迹。
用户每一次互动都可能进入记忆、相册、日记、音乐、状态、通知或后端代理，形成长期陪伴感。
```

策划最应该先定的问题：

1. 新方案是独立 App，还是嵌入 Message / Agent / LoveShow / Theater 等现有主链路。
2. 是否服务“长期关系资产”，如果是，沉淀到哪里。
3. 是否需要多角色、NPC、节目组或观察室。
4. 是否自动触发，自动触发频率和开关是什么。
5. 需要主模型、副模型、生图、TTS、STT、后端、外部平台中的哪些服务。
6. 未配置或失败时是否有本地 fallback。
7. 最终给用户留下什么：消息、卡片、图片、歌曲、记忆、票根、档案变化、桌面组件，还是完整章节。

## 16. 文件导览

如果策划或产品想继续深入，可以按下面顺序看：

| 文件 | 看什么 |
| --- | --- |
| `components/FeaturePreviewPage.tsx` | 当前对外展示口径和功能卖点。注意里面个别版本数字可能旧。 |
| `constants.tsx` | 启动器里有哪些 App、名字叫什么、Dock 有哪些。 |
| `components/PhoneShell.tsx` | 手机壳、路由、锁屏、弹窗、动态岛、悬浮歌词。 |
| `docs/API_USAGE_BY_FEATURE.md` | 各功能大概调用几次模型。 |
| `docs/LOVESHOW_CURRENT_STAGE_REPORT.md` | 心动放送现阶段完整策划分析。 |
| `docs/IMAGE_GENERATION_USER_MANUAL_DRAFT.md` | 生图功能现状和用户使用方式。 |
| `hooks/useChatAI.ts` | 私聊核心编排。 |
| `utils/chatPrompts.ts` | 聊天 prompt 和工具动作体系。 |
| `utils/vectorMemoryRetriever.ts` | 记忆检索如何工作。 |
| `utils/vectorMemoryExtractor.ts` | 记忆抽取如何写入。 |
| `utils/runtimeConfig.ts` | 主 API、副 API、实时感知、TTS、STT、生图、Embedding 配置。 |
| `utils/backendConfig.ts` | 后端 URL/token/userId/clientId 解析。 |
| `utils/db/core.ts` | IndexedDB 数据库和 store。 |
| `apps/settings/SettingsMenu.tsx` | 用户能配置哪些系统能力。 |
