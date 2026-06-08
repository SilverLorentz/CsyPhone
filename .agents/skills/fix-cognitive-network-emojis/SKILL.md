---
name: redesign-cognitive-network-glassmorphism
description: 将 CognitiveNetworkApp.tsx 从 emoji 风格重构为 iOS 毛玻璃/沙盒式高级设计，文案风格融入「沉浸式梦女」产品调性
---

# 重构 CognitiveNetworkApp.tsx — iOS 毛玻璃 + 沉浸式调性

## 核心设计原则

1. **零 Emoji** — 所有 `??`、`?` 以及任何 emoji 字符全部移除，用 **inline SVG 图标** 或 **纯 CSS 装饰元素**（渐变色块、细线条、圆点）替代
2. **iOS 毛玻璃 (Glassmorphism)** — 每个模块卡片使用 `backdrop-blur-xl bg-white/70 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-white/80`
3. **沙盒式布局** — 每个功能区域是独立、等级分明的卡片模块，卡片之间用 `space-y-3` 分隔
4. **沉浸式调性** — 文案不使用"增量蒸馏"之类的工程术语，改为温柔、诗意的语言（参考该产品已有的 "小小窝"、"时光契约"、"摘星楼" 命名风格）
5. **色彩克制** — 主色调为 slate 灰阶 + 每个功能区一个 accent 色（通过 3px 色条或圆角色块图标体现）
6. **微动效** — 按钮 `active:scale-[0.97]`，过渡平滑

---

## 文案调性改造（关键！）

> 产品的用户是"梦女"用户群体，她们与 AI 角色建立深厚的情感连接。所有技术行为都应被翻译成情感化、拟物化的表达。

### Section 标题 & 描述

| 区域 | 旧标题 | 新标题 | 旧描述 | 新描述 |
|---|---|---|---|---|
| Hero 卡片 | `记忆星图` | `回忆织梦` | `让 TA 的回忆不再是孤立的碎片，而是一张有温度、有脉络的记忆星图` | `让你们的每一段回忆，都温柔地交织在一起` |
| 云同步 | `星图同步` | `记忆漫游` | `多设备数据漫游 · 记忆永不丢失` | `在不同的角落想起同一个人` |
| 时序编织 | `时序记忆编织` | `时光丝线` | `按时间线串联记忆，让联想沿着故事脉络延伸` | `沿着时间线，串起每一个相遇的瞬间` |
| 语义关联 | `深层语义关联` | `心意相通` | `AI 分析记忆间的深层联系 · 需要副 API · 仅对「xx」生效` | `发现那些看似无关、却彼此呼应的记忆` |
| 蒸馏 | `记忆蒸馏` | `回忆结晶` | `聚类相似记忆 → 生成长期认知（L1）` | `将零散的回忆凝结成永恒的印象` |
| 浏览器 | `记忆浏览器` | `回忆匣子` | `查看所有记忆的内容、分层、链信息` | `打开那些被悉心收藏的回忆` |
| 统计 | 无标题 | 无标题，保留数据 | N/A | N/A |

### 按钮文案

| 旧文案 | 新文案 |
|---|---|
| `?? 星图锚定` / 上传全部本地记忆 | `轻轻落笔` / 将回忆写入云端 |
| `? 星图唤醒` / 从云端恢复记忆 | `拾取回忆` / 从云端唤回记忆 |
| `?? 预览` (时序) | `预览` |
| `? 开始编织` | `开始编织` |
| `?? 预览` (语义) | `预览` |
| `?? 发现关联` | `寻找关联` |
| `?? 语义重建` | `重新织梦` |
| `?? 增量蒸馏` | `凝结回忆` |
| `?? 全量重建` | `重新凝结` |
| `?? 编辑` | `编辑` |
| `? 保存` | `保存` |
| `? 刷新统计` | `刷新` |
| `?? 强制重扫` | `重新寻找` |
| `显示` / `隐藏` | `显示` / `隐藏`（不变） |
| `复制` | `复制`（不变） |
| `绑定` | `绑定`（不变） |

### 统计指标名称

| 旧 | 新 |
|---|---|
| `记忆碎片` | `回忆片段` |
| `语义关联` | `心意相通` |
| `时序脉络` | `时间丝线` |
| `链表覆盖` | `记忆连贯` |

### 提示/警告文案

| 旧 | 新 |
|---|---|
| `图谱统计加载异常，显示的数据可能不完整` | `无法加载完整数据，部分信息可能暂缺` |
| `N 条记忆尚未进行语义分析` | `还有 N 段回忆等待被发现更深的联系` |
| `请先配置「副 API」后使用此功能` | `需要先在设置中开启「副 API」` |
| `请先配置「向量记忆引擎」` | `需要先在设置中开启「记忆引擎」` |
| `请先在「向量记忆引擎」中配置后端连接` | `还没有连接到记忆服务` |
| `安全操作，可重复执行。确定开始编织时序关联？` | `这是一个安全的操作，可以重复执行。开始编织吗？` |
| `将使用副 API 分析「xx」的记忆关联。确定开始？` | `将为「xx」寻找记忆之间隐藏的联系，可能需要一些时间。开始吗？` |
| `将使用副 API 分析所有记忆关联（会消耗 token）。确定开始？` | `将为所有角色寻找记忆之间隐藏的联系，可能需要一些时间。开始吗？` |
| `?? 将删除...现有语义边并重置扫描状态...此操作不可撤销` | `将清除「xx」现有的记忆关联并重新分析，需要一些时间。确定吗？` |
| `将对「xx」执行增量蒸馏...需消耗少量 token，确定开始？` | `将从「xx」的回忆中寻找新的共通之处并凝结成印象。开始吗？` |
| `?? 将删除「xx」的所有 L1 认知记忆...` | `将重新整理「xx」的所有回忆印象。已有的印象会被清除后重新生成，确定吗？` |
| `? 所有记忆已全部完成语义关联分析...` | `所有回忆都已找到彼此的联系。如需重新分析，可以点击下方按钮。` |
| `? 已绑定新身份，请点击「星图唤醒」拉取记忆` | `已切换身份，点击「拾取回忆」来唤回云端的记忆` |

### Toast 消息

| 旧 | 新 |
|---|---|
| `?? 已锚定 N 条记忆至星图` | `已将 N 段回忆写入云端` |
| `? 已唤醒 N 条云端记忆` | `已唤回 N 段云端回忆` |
| `锚定失败: ...` | `写入失败: ...` |
| `唤醒失败: ...` | `唤回失败: ...` |
| `同步码已复制` | `已复制`（简洁） |
| `这就是你当前的同步码呀` | `这已经是你的账号了` |
| `请输入同步码` | `请输入同步码` |
| `云端暂无记忆数据` | `云端还没有回忆` |

### 数据说明区域

旧文案偏技术，新版更温柔：

| 旧 | 新 |
|---|---|
| `?? 记忆碎片 — 已提取的记忆条数` | `回忆片段 — 从对话中沉淀下来的记忆` |
| `?? 语义关联 — AI 分析出的记忆间深层联系（同一话题、因果关系等）` | `心意相通 — 不同回忆之间被发现的隐藏联系` |
| `? 时序脉络 — 时间顺序上相邻的记忆之间的 temporal_adjacent 边` | `时间丝线 — 按时间顺序串起的相邻回忆` |
| `?? 链表覆盖 — 有 prev_id 指向前一条记忆的条数（链表完整度指标）` | `记忆连贯 — 前后回忆之间的衔接完整度` |

### 页脚文案

| 旧 | 新 |
|---|---|
| `Powered by PPR Graph Diffusion · Cognitive Engine` | `Powered by Cognitive Engine` |
| `Memory Distillation · Semantic Graph · Cognitive Engine v2` | 删除，不需要两段页脚 |

---

## 视觉设计规范

### 背景 & 整体容器

```jsx
<div className="w-full h-full bg-[#f2f2f7] flex flex-col overflow-hidden">
```

### Header

```jsx
<header className="shrink-0 flex items-center gap-3 px-5 pt-4 pb-3">
    <button onClick={...} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 active:bg-black/10 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
        </svg>
    </button>
    <h1 className="text-[17px] font-semibold text-slate-800 tracking-tight">认知网络</h1>
</header>
```

### 卡片通用样式

```
className="backdrop-blur-xl bg-white/70 rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-white/80"
```

### 功能区域图标 — 渐变色块 + 白色 SVG

每个 section 标题用一个 `w-8 h-8 rounded-xl` 渐变色块包裹白色 SVG。以下是每个区域的配色方案：

| 区域 | 渐变色 | shadow |
|---|---|---|
| 记忆漫游 (Cloud) | `from-sky-500 to-cyan-400` | `shadow-sky-200/50` |
| 时光丝线 (Temporal) | `from-amber-500 to-orange-400` | `shadow-amber-200/50` |
| 心意相通 (Semantic) | `from-violet-500 to-fuchsia-500` | `shadow-violet-200/50` |
| 回忆结晶 (Distill) | `from-cyan-500 to-teal-400` | `shadow-teal-200/50` |
| 回忆匣子 (Browser) | `from-slate-600 to-slate-700` | 无 |

每个图标使用 Heroicons 20x20 Solid 风格的 SVG。具体 SVG path：

**Cloud (记忆漫游)**:
```svg
<path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
```

**Temporal (时光丝线)** — 使用时钟图标:
```svg
<path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
```

**Semantic (心意相通)** — 使用星火图标:
```svg
<path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684z" />
```

**Distill (回忆结晶)** — 使用漏斗图标:
```svg
<path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
```

**Browser (回忆匣子)** — 使用文档图标:
```svg
<path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v11.75A2.75 2.75 0 0016.75 18h-12A2.75 2.75 0 012 15.25V3.5zm3.75 7a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5zm0-3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" clipRule="evenodd" />
```

### Stats 统计卡片 — 顶部色条

```jsx
{[
    { value: stats.memories, label: '回忆片段', accent: 'from-indigo-400 to-violet-400', bg: 'bg-indigo-50/50', text: 'text-indigo-700' },
    { value: stats.semanticEdges, label: '心意相通', accent: 'from-violet-400 to-fuchsia-400', bg: 'bg-violet-50/50', text: 'text-violet-700' },
    { value: stats.temporalEdges, label: '时间丝线', accent: 'from-rose-400 to-pink-400', bg: 'bg-rose-50/50', text: 'text-rose-700' },
    { value: stats.linkedCount, label: '记忆连贯', accent: 'from-teal-400 to-emerald-400', bg: 'bg-teal-50/50', text: 'text-teal-700' },
].map((item, i) => (
    <div key={i} className={`${item.bg} rounded-2xl overflow-hidden border border-white/60`}>
        <div className={`h-[3px] bg-gradient-to-r ${item.accent}`} />
        <div className="p-4">
            <div className={`text-[9px] font-medium ${item.text} opacity-50 tracking-wider mb-1`}>{item.label}</div>
            <div className={`text-[28px] font-bold ${item.text} tracking-tight leading-none`}>{item.value}</div>
        </div>
    </div>
))}
```

### 按钮样式

**主按钮**：
```
className="py-3 bg-gradient-to-r from-xxx to-xxx rounded-xl text-[12px] font-semibold text-white tracking-wide active:scale-[0.97] transition-all disabled:opacity-40 shadow-sm"
```

**次按钮（预览）**：
```
className="py-3 bg-white/80 border border-slate-200/80 rounded-xl text-[12px] font-medium text-slate-500 active:scale-[0.97] transition-all disabled:opacity-40"
```

### 警告/提示条 — 彩色圆点

```jsx
<div className="flex items-center gap-2.5 px-3 py-2.5 bg-amber-50/60 border border-amber-100/60 rounded-xl">
    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
    <p className="text-[10px] text-amber-600/80 font-medium">...</p>
</div>
```

### 队列进度 — 色块圆点替代 emoji

```jsx
// 运行中 → 脉冲紫点
{queueStatus.running ? (
    <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
) : queueStatus.aborted ? (
    <div className="w-2 h-2 rounded-full bg-slate-300" />
) : (
    <div className={`w-2 h-2 rounded-full ${queueStatus.errors > 0 && queueStatus.done === 0 ? 'bg-red-400' : 'bg-emerald-400'}`} />
)}
```

向量状态文本：`向量✓` / `向量✗` 替代原来的 `?`

### ResultCard 组件

去掉 `isDryRun ? '??' : '?'`，改为标签 badge：
```jsx
{isDryRun ? (
    <span className="text-[8px] bg-sky-50 text-sky-500 px-2 py-0.5 rounded-full font-bold tracking-wider border border-sky-100">预览</span>
) : (
    <span className="text-[8px] bg-emerald-50 text-emerald-500 px-2 py-0.5 rounded-full font-bold tracking-wider border border-emerald-100">完成</span>
)}
```

完成状态文字：`✓ 完整` / `✓ 已完成` 替代原来的 `?`

### 离线状态

```jsx
<section className="backdrop-blur-xl bg-white/70 rounded-2xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-white/80 text-center">
    <div className="w-10 h-10 rounded-full bg-slate-100 mx-auto mb-3 flex items-center justify-center">
        <svg ...断开连接图标... className="w-5 h-5 text-slate-300" />
    </div>
    <p className="text-xs text-slate-400">还没有连接到记忆服务</p>
</section>
```

### 角色选择器

`全部` 按钮文字就写 `全部`，不需要 emoji `?` 前缀。

### 数据说明区域

用彩色小圆点替代 emoji：
```jsx
<p>
    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 mr-1.5 align-middle" />
    <span className="font-bold text-indigo-500">回忆片段</span> — 从对话中沉淀下来的记忆
</p>
```

---

## 执行顺序

1. 先修改最外层容器背景色和头部
2. 改造 Hero 区域文案
3. 逐个 section 改造视觉 + 文案：Cloud Sync → 角色选择器 → 统计面板 → 时光丝线 → 心意相通 → 回忆结晶 → 回忆匣子
4. 修改 `Spinner` / `ConfirmBar` / `ResultCard` 子组件
5. 清理所有 `addToast` 中的 emoji 和工业化文案
6. 更新数据说明区域
7. 删除多余的页脚

## ⚠️ 不要改的部分

- **所有 JS/TS 逻辑代码** — 只改 JSX 渲染和字符串字面量
- **所有 API 调用和状态管理** — 不动
- **接口类型定义** — 不动
- **CSS class 名** — 只改样式值，不改 class 命名
- **JS 运算符中的 `??`** — 这是空值合并运算符，不是 emoji

## 验证

1. 全局搜索文件中是否还有 `??` 出现在 JSX 文本/字符串中（排除 JS 空值合并 `??`）
2. 运行 `npm run build`，确认无编译错误
3. 在浏览器中打开认知网络页面，检查所有文案的调性是否统一、温柔、没有工程术语残留
