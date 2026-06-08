---
description: 验证前后端代码正确性（编译检查/测试/部署验证）
---

# 验证流程

## 1. 前端编译检查

// turbo-all

```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2
npx tsc --noEmit
```

## 2. 后端编译检查

// turbo-all

```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\csyos-workers
npx tsc --noEmit
```

## 3. 前端本地构建

// turbo-all

```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2
npx vite build
```

## 4. 后端 dry-run 部署

// turbo-all

```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\csyos-workers
npx wrangler deploy --dry-run
```

## 5. 前端测试

// turbo-all

```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2
npm test
```

## 6. 前端本地开发服务器

```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2
npm run dev -- --host
```

## 常见问题

| 错误类型 | 排查方向 |
|----------|----------|
| TS 类型错误 | 检查 `types/` 是否有缺失字段，检查 `tsconfig.json` |
| D1 schema 不匹配 | 检查 `db/schema.sql` 和 `migrations/` |
| Vectorize 查询无结果 | 检查 `vector_status` 是否为 `ready`，检查 `indexed_at` |
| 前后端数据不一致 | 检查 `cloudSynced` 标记，检查 `pushMemories` / `pullMemories` |
| IndexedDB 版本冲突 | 检查 `utils/db/core.ts` 的 `DB_VERSION` |
