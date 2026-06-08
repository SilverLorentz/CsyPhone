---
description: 修改向量记忆系统（提取/检索/同步/图谱/蒸馏）
---

# 向量记忆系统修改指南

## 架构概览

记忆系统采用 **Backend-First, Local-Fallback** 策略：
- **唯一真相源**：后端 D1 数据库
- **本地缓存**：IndexedDB (离线回退)
- **向量索引**：Cloudflare Vectorize (`csyos-memory-index`, BGE-M3 模型)
- **关系图谱**：`memory_relations` 表 (LLM 语义分析)

## 文件地图

### 前端 (SULLYTEST2)
| 文件 | 职责 |
|------|------|
| `utils/vectorMemoryExtractor.ts` | 记忆提取 (LLM 摘要 + embedding + 去重) |
| `utils/vectorMemoryRetriever.ts` | 记忆检索 (backend-first + 本地回退) |
| `utils/db/vectorMemoryStore.ts` | IndexedDB CRUD (`replaceVectorMemories` / `getUnsyncedVectorMemories`) |
| `utils/backendClient.ts` | 后端 API 客户端 (`pushMemories` / `pullMemories` / `deleteCloudMemory`) |
| `utils/embeddingService.ts` | Embedding 调用 (OpenAI / Cohere + Rerank) |
| `components/character/MemoryCenter.tsx` | 记忆管理 UI (批量提取/删除/导入/情感基因) |
| `hooks/useChatAI.ts` | 聊天时自动触发检索和提取 |

### 后端 (csyos-workers/src)
| 文件 | 职责 |
|------|------|
| `routes/retrieval.ts` | 5 阶段检索 (keyword → Vectorize → rerank → DPP → graph) |
| `routes/extraction.ts` | 后端记忆提取 |
| `routes/memory.ts` | 记忆 CRUD API |
| `routes/sync.ts` | push/pull 同步协议 |
| `routes/graph.ts` | 语义关系分析 + backfill |
| `routes/distillation.ts` | L0→L1 蒸馏 |
| `routes/chains.ts` | 时序链构建 |
| `services/vectorIndex.ts` | D1 ↔ Vectorize 同步 |
| `services/embedding.ts` | 后端 embedding/rerank/IDF 服务 |
| `consumers/indexConsumer.ts` | INDEX_QUEUE 消费者 |
| `consumers/semanticConsumer.ts` | SEMANTIC_QUEUE 消费者 |

## 修改指南

### 修改提取逻辑时
1. 分辨是修改**前端本地提取**还是**后端提取**
2. 前端提取入口：`VectorMemoryExtractor.maybeExtract()` → 先尝试 `tryBackendExtraction()`
3. 后端提取入口：`routes/extraction.ts` 的 `extract()` handler
4. 新记忆写入后必须确保进入 `INDEX_QUEUE` 以同步到 Vectorize

### 修改检索逻辑时
1. 前端检索入口：`VectorMemoryRetriever.retrieve()` → 先尝试 `tryBackendRetrieval()`
2. 后端检索管线在 `routes/retrieval.ts` → 5 阶段
3. 修改评分权重/阈值：找 `MIN_RAW_SIMILARITY` / `MIN_KEYWORD_SCORE` 等常量
4. 修改 DPP 选择：找 `dppSelect()` 函数
5. 修改图谱扩展：找 `Channel B` 注释区域

### 修改同步逻辑时
1. 写操作必须 **先云端成功 → 再改本地**（强一致性）
2. 删除操作入口：`deleteCloudMemory()` → 成功后 `refreshVmList()`
3. 批量同步入口：`pushMemories()` / `pullMemories()`
4. 未同步记忆重试：`getUnsyncedVectorMemories()` + `maybeExtract()` 入口

### 修改图谱/蒸馏时
1. 语义关系分析：`graph.ts` 的 `semanticProcessOne()` (LLM 逐条处理)
2. 关系类型固定：`同一话题|前因后果|同一人物|情感相似|对比反差`
3. 蒸馏入口：`distillation.ts` 的 `run()` → L0 聚合为 L1

## ⚠️ 关键约束

1. **memories 表有 47+ 字段** — 修改 schema 需要同步更新 `parseVector()` / `mapRetrievalMemoryRow()` / `normalizeCloudMemory()`
2. **所有后端 SQL 必须带 `WHERE user_id = ?`**
3. **Vectorize 只索引 `level=0` 且 `deprecated=false` 的记忆**
4. **前端 IndexedDB 版本在 `utils/db/core.ts`** — 修改 store 需要 bump `DB_VERSION`
5. **并发锁**：`extractingChars` Set 防止重复提取同一角色
