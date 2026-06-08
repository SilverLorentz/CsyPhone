---
description: 修改后端 csyos-workers (Cloudflare Workers + D1 + Vectorize)
---

# 后端修改指南

## 项目位置

后端代码在 `c:\Users\ASUS\Desktop\糯米机二改\csyos-workers\`，与前端是独立仓库。

## 技术栈

- **运行时**：Cloudflare Workers
- **路由**：itty-router v5 (AutoRouter)
- **数据库**：D1 (SQLite)，Schema 在 `src/db/schema.sql`
- **向量**：Vectorize (`csyos-memory-index`, BGE-M3)
- **队列**：Queues (`csyos-semantic-jobs` + `csyos-index-jobs`)
- **存储**：R2 (`csyos-backups`)
- **定时**：Cron 每 5 分钟

## 文件结构

```
src/
├── index.ts           # 入口 + 路由注册 + 鉴权 + Cron + Queue 消费者入口
├── types.ts           # Env 类型定义 (D1/R2/Vectorize/Queue bindings)
├── routes/            # 14 个路由模块
├── services/          # 7 个服务模块
├── consumers/         # 2 个 Queue 消费者
└── db/schema.sql      # D1 建表
```

## 修改指南

### 新增 API 路由

1. 在 `src/routes/` 新建文件，导出 route handler
2. 在 `src/index.ts` 导入并注册路由（带 `authMiddleware`）
3. handler 从 `(req as any).userId` 获取用户 ID
4. 所有 SQL 查询必须 `WHERE user_id = ?`

```typescript
// 示例 route handler
export const myRoutes = {
    async myAction(req: IRequest, env: Env): Promise<Response> {
        const userId = (req as any).userId;
        // ... 业务逻辑
        return Response.json({ success: true });
    },
};
```

### 修改 D1 Schema

1. 编辑 `src/db/schema.sql`（主 schema）
2. 在 `migrations/` 新建迁移文件 `YYYY-MM-DD-description.sql`
3. 运行 `npx wrangler d1 migrations apply csyos-db --remote`

### 使用 Vectorize

```typescript
// 查询
const result = await env.VECTOR_INDEX.query(queryVector, {
    topK: 40,
    returnMetadata: 'indexed',
    filter: { userId, charId, level: 0, deprecated: false },
});

// 写入 (通过 vectorIndex.ts 服务)
import { syncMemoryToVectorIndex } from '../services/vectorIndex';
await syncMemoryToVectorIndex(env, { userId, memoryId });

// 通过队列异步写入
import { enqueueIndexMemoryMessages } from '../services/vectorIndex';
await enqueueIndexMemoryMessages(env.INDEX_QUEUE, { userId, memoryId });
```

### 使用 Queues

```typescript
// 发送消息到语义队列
await env.SEMANTIC_QUEUE.sendBatch([{
    body: { type: 'semantic-rebuild', userId, charId, jobId, requestedAt: Date.now() }
}]);

// 发送消息到索引队列
await env.INDEX_QUEUE.sendBatch([{
    body: { type: 'index-memory', userId, memoryId, requestedAt: Date.now() }
}]);
```

### 部署

```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\csyos-workers
npx wrangler deploy
```

## ⚠️ 关键约束

1. **Workers CPU 限制**：免费版 10ms CPU，付费版 30s 实际执行。长任务用 `ctx.waitUntil()` 或 Queue
2. **D1 限制**：单次 batch 最多 100 条 statement
3. **Vectorize filter**：只支持精确匹配，不支持范围查询
4. **所有 API 需鉴权**：`Authorization: Bearer <set-via-env-or-local-override>` + `X-User-Id` header
5. **后端不存储 API Key**：Embedding/LLM key 从请求头透传
6. **Cron handler 在 `index.ts`**：`scheduled()` 函数，用 `ctx.waitUntil()` 包裹长任务
