# 雨窗灰调聊天主题

一套给 `气泡工坊 -> CSS 增强模式` 使用的低饱和度聊天界面主题。

主视觉是黑白雨窗、雾面玻璃、灰白纸片气泡和一点银色钥匙装饰。它不是内置主题，也不需要改项目源码；当前 CSS 已填入图床 URL，可以直接整段复制到气泡工坊。

## 文件

- `rain-window-gray.css`：复制到气泡工坊的完整 CSS。
- `preview.html`：本地预览页，方便不进应用也能快速检查气泡、语音、卡片和图片消息。
- `README.md`：上传清单、替换说明、推荐设置和社区文案。

## 已使用的图床素材

主素材：

| 用途 | 图床 URL | 本地来源 |
| --- | --- | --- |
| 主聊天背景 | `https://i.postimg.cc/mDLCmLgh/Camera-1040g3k831jc2vf7q2ifg5oe99pok0u32319te3g.jpg` | `C:\Users\ASUS\Desktop\音乐播放器背景\微信图片_20260418195053.jpg` |
| 银色钥匙装饰 | `https://i.postimg.cc/Hnj5C6MN/com-xingin-xhs-20260428212816.png` | `C:\Users\ASUS\Desktop\音乐播放器背景\微信图片_20260428212843.png` |
| 雨滴/磨砂纹理 | `https://i.postimg.cc/T1hmXtmM/Camera-1040g34o31eshc8695sa05o29o37gbks9qa9uok8.jpg` | `C:\Users\ASUS\Desktop\音乐播放器背景\微信图片_20260428123312.jpg` |

替代素材：

| 用途 | 图床 URL | 本地来源 |
| --- | --- | --- |
| 替代主背景 | `https://i.postimg.cc/gjrRPghf/Camera-XHS-17765123198081040g008319lbicldnc6g5nq4j1v0bnutciogh8o.jpg` | `C:\Users\ASUS\Desktop\音乐播放器背景\微信图片_20260418194744.jpg` |

## 替换 URL

`rain-window-gray.css` 已经填好了主素材 URL。如果你想换自己的图，只需要改顶部这三行：

```css
--rw-chat-bg: url("https://i.postimg.cc/mDLCmLgh/Camera-1040g3k831jc2vf7q2ifg5oe99pok0u32319te3g.jpg");
--rw-key: url("https://i.postimg.cc/Hnj5C6MN/com-xingin-xhs-20260428212816.png");
--rw-rain-texture: url("https://i.postimg.cc/T1hmXtmM/Camera-1040g34o31eshc8695sa05o29o37gbks9qa9uok8.jpg");
```

如果想用更抽象的水纹背景，把第一行换成替代主背景：

```css
--rw-chat-bg: url("https://i.postimg.cc/gjrRPghf/Camera-XHS-17765123198081040g008319lbicldnc6g5nq4j1v0bnutciogh8o.jpg");
```

如果不想用可选纹理，可以把第三行改成：

```css
--rw-rain-texture: none;
```

## 气泡工坊推荐基础设置

CSS 会覆盖大部分视觉，但为了真实聊天页和工坊预览都更稳定，建议先在气泡工坊里这样调：

- 主题名称：`雨窗灰调`
- 用户气泡背景色：`#cbcdca`
- 角色气泡背景色：`#f5f5f1`
- 用户/角色文字颜色：`#252629`
- 圆角：`18` 到 `22`
- 透明度：`1`
- 气泡紧凑度：`适中`
- 不额外上传气泡底纹，背景由 CSS 接管

## 使用步骤

1. 进入应用里的 `气泡工坊`。
2. 新建主题，切到 `CSS` 标签。
3. 整段复制 `rain-window-gray.css`，粘贴到 `CSS 增强模式`。
4. 保存主题，在 Message 聊天页切换到这个 DIY 主题。

本地开发时也可以打开：

```text
http://localhost:5173/community-bubble-themes/rain-window-gray/preview.html
```

## 覆盖范围

这份 CSS 会覆盖：

- 聊天背景
- 顶部栏
- 底部输入栏
- 文字气泡
- 语音气泡
- 打字中气泡
- 系统提示 pill
- 互动 pill
- 图片消息
- 转账卡片
- 卡片类消息
- 表情/角色/主题选择面板里的常见按钮

## 社区发布文案

```text
雨窗灰调 · 气泡工坊 CSS 主题

低饱和黑白雨窗风格，带磨砂灰玻璃顶部栏/底部栏、半透明纸片气泡、银色钥匙角标。适合想要冷静、电影感、长期聊天不刺眼的界面。

使用方法：
1. 复制整段 CSS 到 气泡工坊 -> CSS 增强模式
2. 保存并在 Message 里切换主题
3. 想换背景的话，改 CSS 顶部的 --rw-chat-bg

建议基础设置：
用户气泡 #cbcdca，角色气泡 #f5f5f1，文字 #252629，圆角 18-22。
```

## 常见问题

**为什么粘贴后背景没有出现？**
检查 `--rw-chat-bg` 的图床链接是否能直接访问，或者图床是否临时禁止外链。

**为什么钥匙没有显示？**
检查 `--rw-key` 是否替换为图片直链。这个装饰透明度很低，是故意做成低饱和轻点缀。

**为什么气泡颜色和预期不完全一样？**
气泡工坊本身会给气泡写入内联样式，所以这套 CSS 用伪元素叠出雾面纸片效果。建议按“推荐基础设置”先调一遍，再粘贴 CSS。

**能不能不用可选纹理？**
可以，把 `--rw-rain-texture` 改成 `none`。主题仍然会保留主背景、灰玻璃栏位和纸片气泡。

**会不会影响其他页面？**
CSS 是粘贴在某个 DIY 主题里的，只有该主题被聊天页启用时才会注入。选择器也主要限制在 `sully-chat-*` 和 `sully-*` 聊天组件类名上。
