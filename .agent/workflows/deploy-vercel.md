---
description: 已弃用的 Vercel 部署历史说明
---

# 已弃用：不要再用 Vercel 发布当前前端

本文件只作为历史说明保留，避免把旧的 Vercel 配置误认为现行部署入口。

## 当前事实

- 当前前端测试/正式环境都部署到 **Cloudflare Pages**
- 当前后端部署到 **Cloudflare Workers**
- 当前测试链接是固定别名 `https://beta.sully-frontend.pages.dev`
- 当前生产链接是 `https://sully-frontend.pages.dev`

## 不要再做的事

- 不要使用 `npx vercel`
- 不要使用 `.vercel/project.json` 判断当前测试链接
- 不要把旧的 Vercel Beta/Production workflow 当成发布标准流程

## 现行入口

- 测试环境：`.\deploy-beta.ps1`
- 测试环境只做预检：`.\deploy-beta.ps1 -PrecheckOnly`
- 正式环境：`.\deploy-prod.ps1`
- 详细说明：查看 `.agents/workflows/deploy.md`

## 为什么还保留本文件

- 仓库里仍可能存在 `.vercel/` 本地残留
- 旧对话、旧截图或旧工作记录可能仍会提到 Vercel
- 保留一个明确的“已弃用”说明，比继续保留旧发布命令更不容易误导后续排查
