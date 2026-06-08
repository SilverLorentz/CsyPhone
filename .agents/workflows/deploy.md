---
description: 部署到正式/测试环境 (Cloudflare Pages + Workers)
---

# 部署链接与环境

| 环境 | 前端 URL | 后端 URL | 部署方式 |
|------|----------|----------|----------|
| 🟢 正式 | `https://sully-frontend.pages.dev` | `https://chushiyu.de5.net` | `deploy-prod.ps1` (手动确认) |
| 🟡 测试 | `https://beta.sully-frontend.pages.dev` | `https://csyos-backend-staging.sully-tts-proxy.workers.dev` | `deploy-beta.ps1` |

> [!IMPORTANT]
> - 前端部署已从 Vercel 迁移到 **Cloudflare Pages**
> - 后端部署通过 **Wrangler** 到 Cloudflare Workers
> - 当前生产前端还没有自定义域名，所以正式入口仍是 `https://sully-frontend.pages.dev`
> - 测试环境 URL 是固定的（`beta.` 前缀），不是随机生成的
> - `beta.sully-frontend.pages.dev` 是唯一的测试链接；随机的 `*.sully-frontend.pages.dev` 仅用于确认最近一次 preview 部署
> - `.vercel/` 和旧的 Vercel workflow 仅作历史残留保留，**不要**再把它们当成现行部署入口
> - `push main` 会触发 Cloudflare Pages 自动构建，但自动构建**不会读取本机** `.env.production.local`
> - 所有 production / preview 需要的 `VITE_*` 变量，必须同步配置到 Cloudflare Pages 的环境变量里
> - 仓库已经在 `vite.config.ts` 中加入 staging / production 构建校验；缺少 `VITE_CSYOS_BACKEND_URL` 或 `VITE_CSYOS_BACKEND_TOKEN` 时，构建会直接失败

# 部署到测试环境

// turbo-all

1. 部署后端 staging Worker
```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\csyos-workers
npm run deploy:staging
```

2. 部署前端 beta Pages
```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2
.\deploy-beta.ps1
```

3. 如需只做诊断预检（不部署）
```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2
.\deploy-beta.ps1 -PrecheckOnly
```

4. 验证：打开 `https://beta.sully-frontend.pages.dev`
   - 部署脚本成功后会同时打印固定 beta URL 和最近一次 preview URL
   - 如果随机 preview URL 已更新而固定 beta URL 还没切换，稍等片刻后刷新即可

# 部署到正式环境

1. 确保 staging 已验证通过
2. 部署后端 production Worker
```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\csyos-workers
npm run deploy:prod
```

3. 部署前端 production Pages（需输入 YES 确认）
```powershell
cd c:\Users\ASUS\Desktop\糯米机二改\SULLYTEST2
.\deploy-prod.ps1
```

4. 验证：打开 `https://sully-frontend.pages.dev`
   - 如果是通过 `push main` 触发的自动部署，也要确认 Cloudflare Pages production 环境变量已经齐全
   - 如果页面诊断里出现 `Backend Token: 缺失`，优先排查 Pages 环境变量，而不是先怀疑后端 Worker 崩了

# 环境变量文件

| 文件 | 对应环境 | 构建命令 |
|------|----------|----------|
| `.env.staging.local` | staging/beta | `npm run build -- --mode staging` |
| `.env.production.local` | production | `npm run build -- --mode production` |
| `.env.local` | 本地 dev | `npm run dev` |

补充说明:

- 本地 `.env.staging.local` / `.env.production.local` 只对你当前机器上的脚本构建生效
- Cloudflare Pages 自动构建只能读取 Pages 控制台里配置的环境变量
- 如果希望 `main` 自动部署可用，就不能只改本地 `.env.production.local` 而不改 Pages 配置

# 注意事项

- 测试和正式环境各自有独立的 D1 / R2 / Queue / Vectorize 资源
- `deploy-prod.ps1` 会在执行前要求手动输入 `YES` 确认
- 后端 secrets (`API_SECRET` / `VAPID_PRIVATE_KEY`) 通过 `wrangler secret put` 管理
- 如果命令显示“build failed”，先确认当前目录是 `SULLYTEST2`，再区分是预检阶段失败还是实际 deploy 阶段失败
