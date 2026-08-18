# 贡献指南（Contributing）

欢迎为 dsh-memoir（DeepSeek Harness 本地项目记忆层插件）贡献代码。本文件是贡献者
入口；PR / Issue 的模板与自动化规则以本文档、[.github/pull_request_template.md](.github/pull_request_template.md)
与 [ISSUE_TRIAGE.md](ISSUE_TRIAGE.md) 为准。

## PR 范围

本仓库接受以下 PR：

- **修复**：bug 修复、兼容性适配；
- **增强 / 优化**：现有功能的改进、性能 / 体验优化；
- **维护 / 重构**：测试、构建与工程化改进。

暂**不接受**全新特性 / 新功能的 PR；有相关需求请先在
[Issues](https://github.com/Qinling-Melon-Farmers/dsh-memoir/issues) 提 issue 讨论，
确认后按路线图排期（例如 issue #1 的 update / supersede 已纳入 v0.5.0 计划）。

**不接受仅文档类 PR**（标题以 `docs:` 开头或勾选「仅文档」类型），会被自动
关闭；文档改动请先提 issue 讨论，确认后由维护者处理。

## 开发前置

- Node.js 与 pnpm：按 `package.json` 的 engines 要求（Node `^22.19 || >=24`），
  锁文件为 `pnpm-lock.yaml`；
- 插件只基于官方 NPM SDK（`@deepseek-ai/*`），**禁止修改 DSH 源码**、禁止
  tsconfig 指向任何 DSH 源码 checkout；
- 挂载方式固定为 `dsh.bundle.patch` manifest（`cordis.patch.yml` 的 `insert`
  行），不引入对 DSH 私有 API 的依赖。

## 快速开始

```sh
git clone https://github.com/Qinling-Melon-Farmers/dsh-memoir.git
cd dsh-memoir
pnpm install
pnpm run build
pnpm run typecheck && pnpm test   # 提交前必过
```

## 提交规范

提交信息格式 `type(scope): subject`，type 用 `feat` / `fix` / `chore` /
`docs` / `test` / `refactor` / `perf`，scope 用 `store` / `retrieval` /
`selector` / `tools` / `routes` / `snapshot` / `client` / `build` 等，
关联 issue 时 subject 末尾追加 `(#123)`。示例：
`fix(selector): exclude superseded entries from hot-memory quota (#1)`。
提交信息禁止 emoji。

## 提 PR 前检查清单

1. **门禁全绿**：`pnpm run typecheck` 与 `pnpm test` 通过；
2. **client 产物同步**：改动 `src/client/**` 时必须运行 `pnpm run build`，
   把 `tsc + esbuild` 重新生成的 `lib/client.js` 与 `lib/client.js.map`
   一并提交；
3. **文档同步**：改动 README 时同步维护中英文（`README.md` /
   `README.en.md`）；
4. **无 emoji**：代码、注释、文档、提交信息均不得出现 emoji；
5. **按模板填 PR**：摘要、涉及模块、PR 类型、最新代码确认、AI 编码披露、
   仓库规范检查、本地验证结果；
6. **AI 编码披露**：使用 AI 编码时在 PR 模板中如实披露模型与工具；
7. **用户可见证据**：面向用户的功能或行为变更附本地截图 / 视频证据；
8. **基于最新 main**：提交前 rebase / 合并最新 `main`。

## Issue 与讨论

- Bug 用「Bug 报告」表单提交（自动附加 `bug` 标签），需附截图 / 日志证据、
  冒烟测试、引用代码与建议补丁；
- 功能请求 / 文档 / 问题用「功能请求或问题」表单提交；
- 提 Issue 前先搜索关键词与标签（`bug` / `enhancement` / `question` /
  `good first issue` / `duplicate`），确认没有重复再提交；
- 标签体系、分类标准与关闭流程见 [ISSUE_TRIAGE.md](ISSUE_TRIAGE.md)；
- 已解决、重复或已回答的 Issue 会被维护者关闭并附说明，如需继续跟进请在
  评论区说明或重开。

## 发布

发布由维护者推送 `v*` tag 触发（`.github/workflows/publish.yml`），tag 与
`package.json` 版本必须一致；发布流水线执行 typecheck / test 后发布 npm。
贡献者无需关心发布。
