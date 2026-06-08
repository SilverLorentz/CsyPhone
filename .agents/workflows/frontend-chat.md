---
description: 修改前端聊天/Agent/UI 相关功能
---

# 前端修改指南

## 核心数据流

```
用户输入 → useChatAI.ts
  → chatPrompts.ts (构建 system prompt + 记忆检索 + 世界书注入)
  → context.ts (上下文窗口裁剪)
  → LLM API 调用 (safeApi.ts)
  → chatParser.ts (解析回复 → 表情/动作/语气)
  → ChatBubble 渲染
  → vectorMemoryExtractor (异步: 记忆提取)
  → mindSnapshotExtractor (异步: 心智快照)
```

## 常见修改场景

### 修改聊天 Prompt

| 文件 | 控制什么 |
|------|----------|
| `utils/chatPrompts.ts` | System prompt 构建（人设/世界书/记忆/语气/指令） |
| `hooks/useChatAI.ts` | 消息列表组装、API 调用、回复处理 |
| `utils/context.ts` | 上下文窗口大小 / 消息裁剪策略 |
| `utils/realtimeContext.ts` | 实时信息注入（天气/新闻/热搜） |
| `utils/temporalContext.ts` | 时间/日期上下文 |

### 修改聊天 UI

| 文件 | 控制什么 |
|------|----------|
| `apps/Chat.tsx` | 聊天页面主逻辑 |
| `components/chat/ChatBubble.tsx` | 气泡渲染 |
| `components/chat/ChatInputArea.tsx` | 输入区（文字/语音/表情/图片） |
| `components/chat/MessageItem.tsx` | 消息项 |
| `components/chat/StatusCardRenderer.tsx` | 状态卡（心声/激素/天气等） |
| `components/chat/ThemeRegistry.ts` | 聊天主题注册 |

### 修改 Agent

| 文件 | 控制什么 |
|------|----------|
| `utils/autonomousAgent.ts` | 前端 Agent 管理器（薄壳：启停/SSE/context push） |
| `utils/agentBackendClient.ts` | Agent 后端 API 封装 |
| `apps/settings/AgentSettings.tsx` | Agent 设置 UI |
| 后端 `routes/agent.ts` | Agent API 路由 |
| 后端 `services/agentEngine.ts` | Agent 决策引擎 (Cron tick) |

### 修改语音通话

| 文件 | 控制什么 |
|------|----------|
| `apps/voicecall/VoiceCallScreen.tsx` | 通话 UI |
| `apps/voicecall/useVoiceCallEngine.ts` | 通话引擎 (VAD+STT+LLM+TTS) |
| `apps/voicecall/voiceCallLlm.ts` | 通话 LLM 逻辑 |
| `utils/minimaxTts.ts` / `minimaxTtsWs.ts` | MiniMax TTS |
| `utils/cloudStt.ts` | STT 服务 |

## Provider 层级

```
VirtualTimeProvider → OSProvider → AppProvider → NotificationProvider → PhoneShell
```

- 角色/设置/主题：`context/OSContext.tsx`
- 导航/App 路由：`context/AppContext.tsx`
- 通知/Toast：`context/NotificationContext.tsx`

## ⚠️ 关键约束

1. **样式**：TailwindCSS v4 + PostCSS，不用 `@apply`
2. **IndexedDB**：通过 `DB` 对象操作，不直接用原生 API
3. **类型**：所有类型从 `types/` barrel 导入
4. **API Key**：从 `localStorage` 读取，不硬编码
5. **App 注册**：新 App 在 `constants.tsx` 注册 AppID + 在 `PhoneShell.tsx` 添加路由
6. **测试**：`npm run test` (Vitest)
