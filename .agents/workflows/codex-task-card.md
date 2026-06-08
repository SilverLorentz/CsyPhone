---
description: 生成可直接喂给 Codex Chat 的任务卡
---

# Codex 任务卡模板

当总指挥需要分配任务给 Codex Chat 时，使用以下格式生成任务卡。

## 模板

```markdown
## 📦 任务：[简明任务名称]

### 📍 背景
[1-2 句说清楚为什么要做这个改动]

### 📁 涉及文件
- `[前端/后端] [文件路径]` — [这个文件要改什么]
- ...

### 📝 详细要求
1. [具体步骤 1]
2. [具体步骤 2]
3. ...

### ⚠️ 不能碰的东西
- [明确列出哪些逻辑/文件不能改]
- [列出会影响的上下游]

### ✅ 验收标准
- [ ] `npx tsc --noEmit` 无错误
- [ ] [具体功能验证点]
- [ ] [边界条件验证]

### 🔗 参考文件
- 架构文档：`.agents/architecture.md`
- 记忆系统指南：`.agents/workflows/memory-system.md`
- 后端指南：`.agents/workflows/backend-workers.md`
```

## 使用方法

1. 告诉总指挥（Antigravity）你想做什么
2. 总指挥会分析架构影响并生成任务卡
3. 将生成的任务卡**原样复制**给 Codex Chat
4. Codex 完成后，让总指挥 review 改动

## 示例

```markdown
## 📦 任务：补齐记忆编辑的云端同步

### 📍 背景
用户在 MemoryCenter 编辑记忆后，改动只存本地 IndexedDB，不会同步到云端。
下次 `refreshVmList()` 从云端拉数据时用户的编辑会被覆盖。

### 📁 涉及文件
- `前端 utils/backendClient.ts` — 新增 `updateCloudMemory(id, updates)` 函数
- `前端 components/character/MemoryCenter.tsx` — 编辑保存时调用新函数

### 📝 详细要求
1. 在 `backendClient.ts` 新增 `updateCloudMemory(id, { title?, content?, importance? })`
   - 调用 `PATCH /api/memories/:id`
   - 返回 `{ ok: boolean, reason?: string }`
2. 在 MemoryCenter 的编辑保存逻辑中：
   - 先调用 `updateCloudMemory()` → 成功后才更新本地
   - 失败时 toast 提示"云端同步失败"

### ⚠️ 不能碰的东西
- 不要改 `refreshVmList()` 的逻辑
- 不要改后端 `routes/memory.ts` 的 `update()` handler（已有）

### ✅ 验收标准
- [ ] `npx tsc --noEmit` 无错误
- [ ] 编辑记忆后刷新页面，改动还在（说明成功同步到云端）
- [ ] 后端不可用时，toast 提示用户，不丢数据
```
