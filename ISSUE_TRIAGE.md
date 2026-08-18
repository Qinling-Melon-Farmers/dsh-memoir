# ISSUE_TRIAGE — Issue 分类标准与处理流程

本文件定义 dsh-memoir 仓库的 Issue 标签体系、分类标准与处理流程，供维护者与
贡献者共同使用。目标是让每个 Open Issue 可检索、可认领、可追溯。

## 标签体系

| 标签 | 含义 | 何时打上 |
| --- | --- | --- |
| `bug` | 功能不符合预期、报错、兼容性问题 | 有明确的错误现象或复现步骤 |
| `enhancement` | 新功能请求、现有功能改进建议 | 请求新增能力或改进体验 |
| `documentation` | 文档改进（README / docs / 注释） | 内容缺失、过时或表述不清 |
| `question` | 使用疑问，非缺陷也非功能请求 | 需要解答「怎么用 / 为什么」 |
| `good first issue` | 适合新手贡献者的入门任务 | 范围小、有明确验收标准、不依赖深层上下文 |
| `help wanted` | 需要社区协助 | 维护者确认接受外部 PR 且暂无排期 |
| `duplicate` | 与已有 Issue 重复 | 内容与既有 open/closed Issue 相同或高度重叠 |
| `accessibility` | 无障碍 / 可访问性问题 | 影响键盘、读屏、对比度等可访问性 |
| `invalid` | 非本仓库问题或无法复现 | 环境问题、误报、缺信息且无法跟进 |
| `wontfix` | 明确不做 | 超出仓库范围（如需要修改 DSH 核心）或经讨论否决 |

标签命名与 GitHub 默认一致，仓库内不新建临时标签；新增标签需在
`ISSUE_TEMPLATE` 与本文档同步登记。

## 模块归属

按 Issue 涉及的模块归类，方便检索与认领：`store`（数据存储 / SSOT /
snapshot）、`retrieval`（BM25 检索与排序）、`selector`（Hot Memory 选择）、
`tools`（memoir_record / memoir_read）、`routes`（路由与 API）、`client`
（Web GUI 面板）、`build`（bundle patch / 构建）、`autodistill`（自动收尾
与会话钩子）、`test/bench`、`docs`。

## 分类流程

新 Issue 创建后按以下顺序处理：

1. **查重**：检索 `duplicate` 标签与标题关键词；若与既有 open/closed Issue
   重复，打 `duplicate` 并关闭，评论附上原 Issue 链接。
2. **定类型**：按标题前缀与正文模板判断 `bug` / `enhancement` /
   `documentation` / `question`，打对应标签。
3. **补信息**：Bug 报告正文缺复现步骤、环境信息、证据截图 / 日志、冒烟测试、
   代码引用或补丁时，评论请作者补充，并保留 `bug` 或 `question` 标签等待回复。
4. **新手任务**：范围小、验收明确的任务追加 `good first issue`；涉及深层
   存储 / 检索架构或需要修改 DSH 核心的不标。
5. **开放认领**：确认开放社区协助、暂无维护者排期的任务追加 `help wanted`；
   已被维护者认领或计划排期的任务不标该标签。

## 关闭标准

满足任一条件即可关闭，关闭时必须附说明评论：

- **已实现**：功能已合入 main 并发布，评论注明 commit / merge / 版本号；
- **重复**：评论附原 Issue 链接；
- **已解答**：`question` 类已有结论，评论给出答案；
- **过时**：所依赖的功能或机制已变更、不再适用；
- **超范围**：需要修改 DSH 核心源码或不属于本仓库职责，评论说明原因
  （可用 `wontfix` 标签）。

关闭理由通过 GitHub 的 `completed` / `not_planned` 状态记录，保持可追溯。
作者认为关闭有误时可在评论区说明，维护者重新评估。

## 自动化

自动化工作流在 Issue / PR 创建时自动初筛并可直接关闭，无需人工确认；作者
可通过评论请求重开，由维护者评估：

- `.github/workflows/issue-dedup.yml`：对疑似重复的 Issue 自动打 `duplicate`
  标签，评论附原 Issue 链接并关闭（`not_planned`）；
- `.github/workflows/issue-template-enforcer.yml`：Bug 报告必填段（含证据
  截图 / 日志、冒烟测试、引用代码与补丁）缺失或无效、或未带 `bug` 标签时
  自动评论说明并关闭（`not_planned`），补充完整后可请求重开；
- `.github/workflows/pr-contribution-rules.yml`：PR 描述缺 PR 类型勾选、
  最新 main 确认、本地验证命令 / 结果摘要，或外部贡献者的用户可见功能缺
  证据时评论提示（`synchronize` 事件仅失败不重复评论）；
- `.github/workflows/reject-docs-pr.yml`：非所有者提交的仅文档类 PR（标题
  `docs:` 开头或勾选「仅文档」）自动评论并关闭（`not_planned`）。

自动化只做初筛，人工标签补充与「重开 / 不重开」的最终决定由维护者确认。

## 贡献者指引

- 提 Issue 前先检索标签与关键词，确认没有重复；
- Bug 报告用「Bug 报告」表单提交（自动附加 `bug` 标签），并包含复现步骤、
  环境信息、证据截图 / 日志、冒烟测试、引用代码与建议补丁；功能请求 /
  文档 / 问题用另一个表单；
- 想认领任务，优先挑选 `good first issue` 或 `help wanted`，在评论区留言；
- 已关闭的 Issue 若问题仍然存在，请重开并补充最新信息，不要开新 Issue
  重复描述。
