# 摘星楼字体自定义排查

排查日期：2026-05-24

## 结论

摘星楼内部主要字体确实是本地自带字体，但并不是所有显示字体都只走摘星楼自己的字体表。

- 摘星楼自身在 `apps/zhaixinglou/zhaixinglou.css` 注册了 5 个 `@font-face`。
- 摘星楼还引用了全局 `index.css` 里的 `NoteFont`，所以摘星楼实际需要考虑 6 个可配置字体槽。
- 个别星盘 SVG 标签使用 `sans-serif`、`serif`、`monospace` 或 Tailwind `font-mono`，这些是系统字体栈，不是自带字体文件。
- `StarOracleCards.tsx` 有一处直接写了 `"Noto Serif SC", "Source Han Serif SC", serif`，这不是仓库自带字体。
- 当前「外观定制」已经支持全局字体的本地文件上传和网络 URL，但摘星楼大量位置硬编码了 `ZhaixinglouTitle` / `ZhaixinglouFont` / `ZhaixinglouCN`，所以全局字体不会完整覆盖摘星楼。

## 当前自带字体资源

`public/fonts` 里与摘星楼直接相关的字体文件：

| 字体槽 | 当前字体名 | 当前资源 | 说明 |
| --- | --- | --- | --- |
| 标题 | `ZhaixinglouTitle` | `/fonts/zhaixinglou-title.woff2` | 英文标题、功能标题、星座名等 |
| 装饰正文 | `ZhaixinglouFont` | `/fonts/zhaixinglou-body.woff2` | 英文标签、小标题、按钮、仪式感装饰文案 |
| 中文正文 | `ZhaixinglouCN` | `/fonts/zhaixinglou-cn.woff2` | 摘星楼根容器、中文正文、分享卡正文 |
| 塔罗牌面 | `TarotFont` | `/fonts/tarot.woff2` | 塔罗牌面符号和牌名字体 |
| 手写英文 | `Dancing Script` | `/fonts/dancing-script.woff2` | 阿卡西暗影里的手写英文装饰 |
| 便签/诗句 | `NoteFont` | `/fonts/note.woff2` | 星象仪表盘提示、手写感说明文字 |

额外发现已修复：`AssetPreloader.ts` 预加载 `/fonts/zhaixinglou-cn.woff2`，`zhaixinglou.css` 也已让 `ZhaixinglouCN` 使用同一个 `.woff2` 文件，避免额外携带未使用的 `.ttf` 回退文件。

## 每个字体槽的使用位置

### `ZhaixinglouTitle`

用途：主标题、功能标题、星座结果、分享卡标题、装饰标题。

出现位置：

- `apps/zhaixinglou/ZhaixinglouApp.tsx:231`：首页 `Tower of Stars`。
- `apps/zhaixinglou/TarotReading.tsx:327`：塔罗解读标题。
- `apps/zhaixinglou/ChartReading.tsx:298`：星盘解读标题。
- `apps/zhaixinglou/StarOrbit.tsx:508`、`513`、`519`：太阳/月亮/上升星座结果。
- `apps/zhaixinglou/SynastryChart.tsx:178`：合盘 SVG 中心标题。
- `apps/zhaixinglou/ShareCardModal.tsx:321`、`464`：分享卡标题。
- `apps/zhaixinglou/AkashicShadows.tsx:431`：阿卡西页面标题。
- `apps/zhaixinglou/components/GothicDecorations.tsx:52`：哥特装饰标题。
- `apps/zhaixinglou/components/SpreadSelector.tsx:77`：牌阵名称。
- `apps/zhaixinglou/components/TarotSpreadBoard.tsx:210`：牌阵面板标题。
- `apps/zhaixinglou/components/MoonPhaseHero.tsx:17`：月相 Hero 标题样式常量。
- `apps/zhaixinglou/components/CelestialDashboard.tsx:30`、`239`：星象仪表盘标题样式与标签。

### `ZhaixinglouFont`

用途：英文副标题、按钮文字、标签、装饰符号、分享卡页脚，是摘星楼最常用的装饰字体。

出现位置：

- `apps/zhaixinglou/ZhaixinglouApp.tsx:319`、`362`、`363`、`397`：选择页提示、身份标签、菜单标题。
- `apps/zhaixinglou/TarotReading.tsx:355`、`358`、`380`：塔罗解读占位和装饰。
- `apps/zhaixinglou/ChartReading.tsx:301`、`327`、`331`、`353`：星盘解读副标题和装饰。
- `apps/zhaixinglou/StarOrbit.tsx:277`、`304`、`330`、`359`、`393`、`425`、`440`、`478`、`507`、`512`、`518`、`539`：星轨页 tab、输入标签、按钮、结果说明。
- `apps/zhaixinglou/MemoryDestinyModal.tsx:230`：命运记忆弹窗装饰符。
- `apps/zhaixinglou/ShareCardModal.tsx:206`、`225`、`244`、`265`、`287`、`314`、`318`、`331`、`351`、`367`、`371`、`372`、`457`、`461`、`473`、`491`、`503`、`507`、`508`：分享卡装饰、页脚、日期、品牌字样。
- `apps/zhaixinglou/AkashicShadows.tsx:337`、`463`、`517`、`518`、`543`、`683`：阿卡西页面装饰与提示。
- `apps/zhaixinglou/components/SpreadSelector.tsx:30`、`63`、`127`：牌阵描述、卡位、按钮。
- `apps/zhaixinglou/components/HistoryDrawer.tsx:51`、`114`：历史记录抽屉英文名和隐藏提示。
- `apps/zhaixinglou/components/TarotSpreadBoard.tsx:43`：牌阵面板副标题样式常量。
- `apps/zhaixinglou/components/MoonPhaseHero.tsx:18`：月相 Hero 副标题样式常量。
- `apps/zhaixinglou/components/CelestialDashboard.tsx:31`：星象仪表盘副标题样式常量。

### `ZhaixinglouCN`

用途：摘星楼中文正文、页面默认字体、分享卡正文。

出现位置：

- `apps/zhaixinglou/ZhaixinglouApp.tsx:436`：摘星楼根容器默认字体。
- `apps/zhaixinglou/AkashicShadows.tsx:475`、`490`、`505`、`677`：阿卡西页面中文段落。
- `apps/zhaixinglou/ShareCardModal.tsx:322`、`341`、`465`、`482`：分享卡副标题和正文段落。
- `apps/zhaixinglou/components/MoonPhaseHero.tsx:19`：月相 Hero 中文样式常量。
- `apps/zhaixinglou/components/CelestialDashboard.tsx:32`：星象仪表盘中文样式常量。
- `apps/zhaixinglou/components/CelestialDashboard.tsx:182`、`320`、`347`、`355`：与 `NoteFont` 组合使用，作为回退中文字体。

### `TarotFont`

用途：塔罗牌牌面和符号。

出现位置：

- `apps/zhaixinglou/components/TarotCard.tsx:223`：塔罗牌面名称/符号。
- `apps/zhaixinglou/components/TarotCard.tsx:247`：塔罗牌面文本。
- `apps/zhaixinglou/AssetPreloader.ts:25`：通过 `document.fonts.load('1em TarotFont')` 主动预热。

### `Dancing Script`

用途：阿卡西暗影里的手写英文装饰。

出现位置：

- `apps/zhaixinglou/AkashicShadows.tsx:298`
- `apps/zhaixinglou/AkashicShadows.tsx:570`
- `apps/zhaixinglou/AkashicShadows.tsx:599`
- `apps/zhaixinglou/AkashicShadows.tsx:629`

### `NoteFont`

用途：星象仪表盘的便签/诗句感说明文字。这个字体定义在全局 `index.css`，不是摘星楼自己的 `zhaixinglou.css`。

出现位置：

- `apps/zhaixinglou/components/CelestialDashboard.tsx:182`
- `apps/zhaixinglou/components/CelestialDashboard.tsx:320`
- `apps/zhaixinglou/components/CelestialDashboard.tsx:347`
- `apps/zhaixinglou/components/CelestialDashboard.tsx:355`

## 系统字体和非自带字体位置

这些位置如果要求“完全自定义字体”，也要纳入替换或改成 CSS 变量：

- `apps/zhaixinglou/StarOracleCards.tsx:159`：Tailwind `font-mono`，显示星体度数。
- `apps/zhaixinglou/StarOracleCards.tsx:200`：`"Noto Serif SC", "Source Han Serif SC", serif`，不是仓库自带。
- `apps/zhaixinglou/StarOrbit.tsx:408`：Tailwind `font-mono`，显示相位角度。
- `apps/zhaixinglou/SynastryChart.tsx:261`、`264`、`271`、`273`：SVG `sans-serif` 标签。
- `apps/zhaixinglou/SynastryChart.tsx:326`：SVG `serif`。
- `apps/zhaixinglou/SynastryChart.tsx:340`：SVG `monospace`。

## 现有全局字体自定义能力

当前已经有全局自定义字体入口：

- `apps/Appearance.tsx:358`：本地文件上传，支持 `.ttf`、`.otf`、`.woff`、`.woff2`，读成 data URL。
- `apps/Appearance.tsx:389`：网络字体 URL 输入。
- `context/OSContext.tsx:331`：注入 `@font-face CustomUserFont`，并把 `--app-font` 改成 `CustomUserFont`。
- `context/OSContext.tsx:713`：本地文件体写入 IndexedDB asset，key 是 `custom_font_data`。
- `context/OSContext.tsx:716`：网络 URL 只保存到主题配置，不保存文件体。
- `types/core.ts:83`：主题字段是 `customFont?: string`。

限制：摘星楼内部没有使用 `--app-font`，而是直接写 `ZhaixinglouTitle`、`ZhaixinglouFont`、`ZhaixinglouCN` 等，所以全局字体只能影响通用系统 UI，不能完整替换摘星楼字体。

## 建议开放的字体配置槽

建议先开 6 个槽，不按每个组件单独开接口：

| 配置 key | 覆盖字体 | 默认值 | 是否高优先级 |
| --- | --- | --- | --- |
| `title` | `ZhaixinglouTitle` | `/fonts/zhaixinglou-title.woff2` | 是 |
| `accent` | `ZhaixinglouFont` | `/fonts/zhaixinglou-body.woff2` | 是 |
| `bodyCn` | `ZhaixinglouCN` | `/fonts/zhaixinglou-cn.woff2` | 是 |
| `tarot` | `TarotFont` | `/fonts/tarot.woff2` | 中 |
| `script` | `Dancing Script` | `/fonts/dancing-script.woff2` | 中 |
| `note` | `NoteFont` | `/fonts/note.woff2` | 中 |

同时建议把系统字体位置收口为 2 个内部变量：

- `technical`：覆盖 `font-mono` / `monospace` 数字角度。
- `chartLabel`：覆盖 SVG `sans-serif` / `serif` 标签。

这样完整方案是 6 个用户可见槽 + 2 个内部回退槽。

## 接口结论

当前选择本机个性化方案：不新增后端接口。

不需要新增后端接口。摘星楼字体入口在摘星楼右上角齿轮的「摘星楼设置」里，放在副 API 设置上方。

- 字体文件体：`FileReader.readAsDataURL(file)`，写入 IndexedDB `assets`。
- 字体链接：保存 URL 字符串。
- 槽位来源配置保存在 `localStorage` 的 `zhaixinglou_font_settings`。
- 字体覆盖通过动态注入同名 `@font-face` 实现，不需要改后端。

## 前端实现

1. `apps/zhaixinglou/zhaixinglouFonts.ts`
   - 定义 6 个字体槽。
   - 生成动态同名 `@font-face`，覆盖摘星楼现有字体名。
   - 校验 URL 和字体文件扩展名。
   - 本地文件体写入 IndexedDB `assets`，设置写入 `localStorage`。
2. `apps/zhaixinglou/SecondaryApiSettingsModal.tsx`
   - 在摘星楼齿轮设置顶部新增「摘星楼字体」分区。
   - 每个字体槽支持上传 `.ttf / .otf / .woff / .woff2`。
   - 每个字体槽支持填写 `http/https` 字体直链。
   - 每个字体槽可单独恢复默认字体。
3. `apps/zhaixinglou/ZhaixinglouApp.tsx`
   - 进入摘星楼时加载并注入本机字体设置。
4. `apps/zhaixinglou/zhaixinglou.css`
   - `ZhaixinglouCN` 使用 `.woff2`，不再携带额外 `.ttf` 回退。

## 风险点

- 用户上传中文字体通常很大，`ttf/otf` 可能超过 10MB，建议限制大小并优先提示使用 `woff2`。
- 外链字体会受 CORS 影响，直接 `@font-face src: url(...)` 可能被浏览器拒绝。
- data URL 放进 localStorage 会爆容量，所以文件体必须继续放 IndexedDB/R2，不要直接塞主题 JSON。
- 分享卡渲染会等待 `document.fonts.ready`，自定义字体如果外链慢或失败，会影响生成分享图。
