# 查手机 UI 层改版交接稿

更新时间：2026-06-03

## 结论

当前可改版的正式模块在：

- `C:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2\apps\CheckPhone.tsx`
- `C:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2\components\chat\cards\PhoneEvidenceCard.tsx`
- `C:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2\components\chat\cards\phone\*.tsx`

桌面上另有一个静态原型：

- `C:\Users\ASUS\Desktop\miya phone\index.html`

但它更像旧版/独立手机壳视觉原型，只包含 `index.html + css`，页面中引用的 `js/` 组件目录当前不存在；不建议把它当正式功能代码。正式“查手机”功能在 `SULLYTEST2` 主仓库内。

## 技术栈

- 前端框架：React 19
- 构建工具：Vite 8
- 语言：TypeScript
- 样式：Tailwind CSS 4 + 少量全局 CSS + 组件内 inline style
- 图标：`@phosphor-icons/react`
- 动效：部分页面可用 `framer-motion` / `motion`，当前查手机主文件主要是 Tailwind transition/animation
- 数据：浏览器本地 IndexedDB / app 内 DB 工具，角色数据存在 `CharacterProfile.phoneState`
- AI 调用：前端直接请求用户配置的 OpenAI-compatible `/chat/completions` 接口
- 测试：Vitest + Testing Library
- 部署：Cloudflare Pages；正式环境与 `origin/main` 绑定，改 UI 后走 beta 测试发布，不直接推 main

## 功能定位

“查手机”是虚拟手机系统里的一个 App。用户先选择一个角色，然后进入该角色手机桌面，查看或生成该角色手机里的痕迹。

它包含两层 UI：

1. 手机内 UI：用户在“查手机”App 内看到的目标选择页、手机桌面、各 App 列表页、聊天详情页、自定义 App 弹窗。
2. 主聊天证据卡 UI：生成的手机痕迹会同步成主聊天里的系统消息，并以卡片形式展示。

## 入口关系

- 启动器注册：`constants.tsx` 中 `APP_CONFIGS` 有 `查手机`，图标是 `DeviceMobileCamera`。
- 懒加载入口：`components/PhoneShell.tsx` 中 `React.lazy(() => import('../apps/CheckPhone'))`。
- 路由渲染：`components/PhoneShell.tsx` 中 `case AppID.CheckPhone: return <CheckPhone />`。
- 主实现：`apps/CheckPhone.tsx`。

## 主要页面

### 1. 目标角色选择页

位置：`apps/CheckPhone.tsx` 的 `view === 'select'` 分支。

现状：

- 深色背景
- 标题为 `Target Devices`
- 两列角色卡片
- 头像、角色名、`ID: xxx`

可改方向：

- 做成“设备扫描/目标终端列表/私密档案夹”风格
- 强化角色头像、最近活跃、设备状态、解锁感
- 保留点击角色进入手机的交互

### 2. 手机桌面页

位置：`renderDesktop()`。

现状：

- 壁纸背景 + 黑色遮罩
- 顶部状态栏
- 4 列 App 图标网格
- 底部 Dock
- 默认 App：Message、淘宝、美团外卖、朋友圈、通话、Add App、断开连接、Debug

可改方向：

- 统一成更完整的手机 OS 视觉：状态栏、Dock、App 图标、壁纸、锁屏/解锁感
- 每个 App 图标需要一套统一图标语言，不要混用 emoji 与文字
- Add App / 断开连接 / Debug 可改成系统工具图标或放入设置页

### 3. Message 列表页

位置：`renderChatList()`。

现状：

- 白卡列表
- 联系人头像占位
- 标题、时间、最后一行摘要
- 底部“生成聊天记录”按钮

可改方向：

- 可按真实 IM 列表重做：头像、未读点、时间、摘要、置顶/已读状态
- 生成按钮可设计成底部浮动操作按钮，避免像后台工具

### 4. Message 聊天详情页

位置：`renderChatDetail()`。

现状：

- 类微信聊天气泡
- 角色头像在右侧，联系人头像在左侧
- 底部“继续窥探对话”按钮

可改方向：

- 重点做沉浸式：顶部联系人栏、聊天背景、输入区伪装、消息气泡细节
- “继续窥探对话”可改成更轻的系统操作按钮或隐藏在底部工具栏

### 5. 淘宝订单页

位置：`renderTaobaoList()`。

现状：

- 橙色淘宝风格头图
- 订单卡片：店铺、商品名、规格/状态、金额
- 底部“刷新订单”按钮

可改方向：

- 如果要规避真实品牌，可改成“购物订单/商城订单”的原创视觉
- 如果保留拟真，则要统一店铺、订单状态、商品缩略图占位规范

### 6. 美团外卖页

位置：`renderMeituanList()`。

现状：

- 黄色外卖风格头部
- 卡片渲染复用 `MeituanTakeoutCard`
- 底部“刷新外卖”按钮

可改方向：

- 可重做为“外卖/配送记录”的拟真 App
- 需要设计状态标签：已完成、配送中、退款、待评价等

### 7. 朋友圈页

位置：`renderMomentsList()`。

现状：

- 顶部标题“朋友圈”
- 随机封面图池
- 角色头像与角色名
- 动态列表
- 底部“刷新动态”“重Roll”按钮

可改方向：

- 这是最适合美工出视觉稿的页面：封面、头像、动态排版、点赞评论区域
- 如果做高级感，可以把底部按钮收成更多菜单或悬浮图标

### 8. 通话记录/自定义 App 列表页

位置：`renderGenericList(appId, appName, customPrompt)`。

现状：

- 通用白卡列表
- 标题、详情、可选 value
- 底部生成按钮

可改方向：

- 通话记录建议单独设计，不要使用通用卡
- 自定义 App 可以设计成“模板化列表页”：图标色、标题栏、空状态、记录卡片统一可换皮

### 9. 安装自定义 App 弹窗

位置：`Modal isOpen={showCreateModal}`。

现状：

- App 名称、图标、颜色、功能指令
- AI 根据指令生成该 App 内部数据

可改方向：

- 改成“安装 App / 新建监控源”的流程
- 设计字段：App 名称、图标、主题色、生成规则、预览卡片

## 主聊天证据卡

生成手机记录后，会写入聊天系统消息，并通过以下文件渲染成卡片：

- `components\chat\cards\PhoneEvidenceCard.tsx`：根据 `phoneType` 分发卡片
- `components\chat\cards\phone\WeChatSpyCard.tsx`：聊天记录卡
- `components\chat\cards\phone\TaobaoOrderCard.tsx`：购物订单卡
- `components\chat\cards\phone\MeituanTakeoutCard.tsx`：外卖订单卡
- `components\chat\cards\phone\CallLogCard.tsx`：通话记录卡
- `components\chat\cards\phone\SocialPostSpyCard.tsx`：朋友圈/社交动态卡
- `components\chat\cards\phone\DefaultAppCard.tsx`：自定义 App 默认卡

美工需要单独给这套“聊天流证据卡”出样式，因为它不是手机内页，而是主聊天中的小卡片。

## 数据结构边界

不要轻易改字段名，否则会影响生成、存储、聊天证据卡。

`PhoneEvidence` 关键字段：

- `id`：记录 ID
- `type`：记录类型，如 `chat`、`order`、`social`、`delivery`、`call` 或自定义 App id
- `title`：标题/联系人/商家/商品
- `detail`：详情正文
- `timestamp`：时间戳
- `systemMessageId`：对应主聊天系统消息 ID
- `value`：金额/状态/通话方向等
- `shop`：店铺名或状态，部分卡片复用该字段

`PhoneCustomApp` 关键字段：

- `id`
- `name`
- `icon`
- `color`
- `prompt`

## UI 改版优先级建议

1. 先定整体风格：手机 OS 是拟真 iOS、未来感终端、私密档案、还是梦女沉浸式。
2. 先画 6 张核心稿：角色选择、手机桌面、Message 列表、聊天详情、朋友圈、外卖/订单。
3. 再画 6 张证据卡：聊天、购物、外卖、通话、社交、自定义。
4. 最后补空状态、加载态、删除态、生成中状态、错误提示。

## 给美工的交付范围

需要出图：

- 角色选择页
- 手机桌面页
- App 图标规范
- 顶部状态栏和底部 Dock
- Message 列表页
- Message 聊天详情页
- 订单页
- 外卖页
- 朋友圈页
- 通话记录页
- 自定义 App 安装弹窗
- 主聊天里的手机证据卡

需要标注：

- 色板
- 字体层级
- 圆角/阴影/毛玻璃规则
- 图标风格
- 按钮状态
- 空状态
- 生成中状态
- 移动端安全区

## 开发注意

- UI 主改 `apps/CheckPhone.tsx` 和 `components/chat/cards/phone/*`。
- 尽量不要改 `handleGenerate`、`handleContinueChat`、`buildPhoneSystemMessageDraft` 这些生成与同步逻辑。
- 如果要做大改版，建议先把 `CheckPhone.tsx` 拆成多个 UI 子组件，避免一个文件继续膨胀。
- 中文文件读写保持 UTF-8；PowerShell 中看到乱码时先检查终端编码，不要直接覆盖文件。
- 测试发布使用 `.\deploy-beta.ps1`，不要直接推 `origin/main`。

