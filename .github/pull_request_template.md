> 提 PR 前请阅读 [CONTRIBUTING.md](../CONTRIBUTING.md)。
> 提交信息用 Conventional Commits（`type(scope): subject`），禁止 emoji。
> 本仓库接受修复、增强与优化类 PR（bug 修复、现有功能的增强、性能 / 体验优化、维护）；全新特性 / 新功能的 PR 请先提 Issue 讨论确认。
> 仅文档类 PR（标题以 `docs:` 开头或勾选「仅文档」）会被自动关闭；文档改动请先提 Issue 讨论。

## 摘要（Summary）

<!-- 用一两句话说明改了什么、为什么改。 -->

## 涉及模块（Affected Modules）

<!-- 勾选本次改动涉及的模块。 -->

- [ ] host：数据存储（store / SSOT / snapshot）
- [ ] host：检索与排序（retrieval / BM25）
- [ ] host：Hot Memory 选择（selector / token 预算）
- [ ] host：工具接口（memoir_record / memoir_read）
- [ ] host：路由与 API（routes）
- [ ] host：自动收尾与会话钩子（autodistill）
- [ ] client：Web GUI 面板
- [ ] 构建 / 挂载（bundle patch / build）
- [ ] 测试 / bench
- [ ] 文档（README.md / README.en.md / docs）

## PR 类型（PR Type）

<!-- 勾选所有适用的类别。 -->

- [ ] 面向用户的功能或行为变更
- [ ] Bug 修复
- [ ] 增强 / 优化（现有功能的改进、性能 / 体验优化）
- [ ] 维护 / 重构
- [ ] 仅文档（外部贡献者勿选，会自动关闭）

## 最新代码确认（Latest Codebase Confirmation）

- [ ] 我已基于最新 `main` 分支开发，或在提交前已 rebase / 合并最新 `main`。

同步命令：

<!-- 示例：git fetch origin && git rebase origin/main -->

## AI 编码披露（AI Coding Disclosure）

<!-- 必填。勾选一项，且模型 / 工具字段不得留空。 -->

- [ ] 完全 AI 编码：全部编程改动由 AI 产出，并由贡献者接受 / 审查。
- [ ] 部分 AI 辅助：AI 帮助编写或修改了部分编程改动。
- [ ] 未使用 AI 编码辅助。

使用的 AI 模型：

<!-- 使用 AI 时必填；未使用 AI 时填 N/A。示例：DeepSeek、GPT-5、Claude Sonnet 4。 -->

使用的编码 Agent 工具：

<!-- 使用 AI 时必填；未使用 AI 时填 N/A。示例：DeepSeek Harness、Codex、Claude Code、Cursor。 -->

## 仓库规范检查（Repo Rules）

<!-- 本仓库硬性规范，请逐项确认。 -->

- [ ] 未修改 DSH 官方源码，仅基于官方 NPM SDK（`@deepseek-ai/*`）开发。
- [ ] 未新增指向 DSH 源码 checkout 的 tsconfig `extends` / `paths` / `references`。
- [ ] 改动 `src/client/**` 时已运行 `pnpm run build`，并提交同步生成的 `lib/client.js` 与 `lib/client.js.map`。
- [ ] 所有新增 / 修改文件不含任何 emoji 字符。
- [ ] 改动 README 时同步维护中英文（`README.md` / `README.en.md`）。

## 本地验证（Local Validation）

执行的命令：

```bash
# 示例
pnpm run typecheck
pnpm test
```

结果摘要：

<!-- 失败也要写明。不要留空。 -->

## 用户可见变更证据（Local Feature Evidence）

<!--
面向用户的功能或行为变更必填。
附截图或短视频，展示：
- 本地加载的插件来自本 PR / 最新代码
- 功能已启用 / 配置（如适用）
- 成功使用并展示可见结果
- 涉及 agent 循环的功能展示后续 / 结果反馈
-->

证据：

<!-- 粘贴 GitHub 图片 / 视频附件、Markdown 图片或直接图片 / 视频链接。纯内部改动（无用户可见变更）可填 N/A。 -->
