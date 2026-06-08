# 番外篇作家锚点与随机模板工作报告

## 本窗口完成范围

1. 给番外篇提示词系统新增「作家锚点抽选池」。
2. 将随机抽取番外篇的系统提示词替换为本窗口提供的新版本。
3. 保持随机模板与用户指定梗 / 用户梗池模板分离。
4. 按本窗口后续要求，新增用户自填梗专用的「角色本人视角作答」模板。
5. 按后续要求移除随机分支里的三则小番外，并将随机分支正文长度调整为 `3280~3654` 中文字。

## 代码改动

- `utils/mindSnapshotExtractor.ts`
  - 新增 `AFTERGLOW_AUTHOR_ANCHORS`，按 `name / sketch / fit / flag` 存储作家池。
  - 新增 `${AFTERGLOW_AUTHOR_SLOT}` 注入位，最终只注入一条 `作家名—笔法速写`，flag 非空时追加 `〔译〕` 或 `〔文言〕`。
  - 新增 `resolveAfterglowAuthorSlot()`：
    - 用户侧文本点名作家时优先命中该作家。
    - 未点名时从可用池随机抽 1 条。
    - 非古风/古典设定随机时排除 `flag="文言"`。
    - 古风 paro 或题材古典时允许文言条目入池。
    - 可用池为空时回退全池。
  - 新增 `collectAfterglowUserAuthorInputs()`，点名检测只收集手填命题、抽中的用户梗与最近用户消息，避免角色回复误触发。
  - 新增随机分支模板 `AFTERGLOW_SYSTEM_PROMPT_TEMPLATE`，内容替换为本窗口提供的新提示词。
  - 新增用户梗分支模板 `AFTERGLOW_USER_MOTIF_SYSTEM_PROMPT_TEMPLATE`，用于用户指定梗 / 用户梗池分支。
  - 用户梗分支只替换 `charName / userName`，实际用户梗仍由现有 `## 用户梗要求` 块注入。
  - 将模板变量替换调整为全量替换，避免同一模板内多次出现 `${AFTERGLOW_CHAR_NAME_SLOT}` 或 `${AFTERGLOW_USER_NAME_SLOT}` 时只替换第一处。
  - 继续保留原有 seed slot 行为：`if 前提` 与 `本轮梗` 只按正篇类型注入其中一个，不会同时解析进最终 prompt。
  - 随机分支已移除 `S/G` 小料池，不再抽取「番外小料 ×3」。
  - 随机分支标准本输出改为一篇长正文：`[3280~3654 中文字]`。

- `test/mindSnapshotExtractor.innerVoice.test.ts`
  - 覆盖作家点名优先。
  - 覆盖现代随机池排除文言条目。
  - 覆盖古风/古典随机池允许文言条目。
  - 覆盖生成请求中只注入被选中的作家锚点，不泄漏未选中条目或原始表头。
  - 覆盖最近用户消息点名作家可命中。
  - 覆盖随机分支使用 `3280~3654` 中文字正文模板。
  - 覆盖随机分支不再出现 `番外小料` / `三则小料`。
  - 覆盖用户指定梗分支未误用新随机模板。
  - 覆盖用户指定梗分支使用「角色本人视角作答」模板。

## 验收要点

- 随机生成番外篇时，最终 secondary task prompt 应出现：
  - `## ✒ 作家笔触`
  - `本期笔触：作家名—笔法速写`
  - 新模板中的 `正文 3280~3654 中文字`
  - tag 区的 `运笔·〈本期作家〉风`
  - 不应再出现 `番外小料` 或 `三则小料`

- 用户指定梗 / 用户梗池生成时，不会使用新随机模板；会使用角色本人视角作答模板，并追加 `## 用户梗要求`。

- 用户梗分支最终 secondary task prompt 应出现：
  - `请以「角色名 对 用户名 的回应」为核心`
  - `你就是角色名本人，不能像任何通用角色`
  - `[不设固定字数。优先遵守"用户梗要求"里对长短、形式、节奏的明示要求`

- 最终 prompt 不应出现：
  - `${AFTERGLOW_AUTHOR_SLOT}`
  - 未选中的 `作家名—笔法速写`
  - `作家 | 笔法速写` 原始表头
  - `{{roll:`

## 已验证

- `npm run test:run -- test/mindSnapshotExtractor.innerVoice.test.ts`
  - 结果：1 个测试文件通过，21 条测试通过。
- `git diff --check -- utils/mindSnapshotExtractor.ts test/mindSnapshotExtractor.innerVoice.test.ts docs/afterglow-author-slot-work-report.md`
  - 结果：无空白错误；仅有 Git 对 LF/CRLF 的行尾提示。
- 已用 UTF-8 重新读取关键中文段落，未见乱码。
- `./deploy-beta.ps1`
  - 结果：staging build 成功，Cloudflare Pages beta preview 部署成功。
  - Beta URL: `https://beta.sully-frontend.pages.dev`
  - 本次 preview URL: `https://e6aba3fe.sully-frontend.pages.dev`
  - 最新 beta 已包含「移除三则小番外 / 调整正文 3280~3654」改动。

## 未运行

- 未运行全量 `npm run test:run`。
- 未运行全量 `npm run build`。
- 原因：按仓库 `docs/verification-policy.md` 的低负载策略，本次只跑与提示词抽选链路直接相关的轻量验证。

## 注意事项

- 当前工作树在本窗口开始前已有大量其它未提交改动；本次只围绕 `utils/mindSnapshotExtractor.ts` 与相关测试、报告文件工作，没有回滚或处理其它文件。
- 本次没有执行部署、推送、合并或 Cloudflare Pages production 操作。
