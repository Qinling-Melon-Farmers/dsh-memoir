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
   `documentation` / `question`，打对应标签。标签由维护者或机器人补充，
   不要求外部提问者具备打标签权限；缺少任何标签本身都不是关闭理由。
   机器人根据表单「Issue 类型」的确切选项补标：Bug 报告→`bug`、
   功能请求→`enhancement`、文档→`documentation`、问题→`question`；
   「其他」及未知类型留待人工分类，不从正文猜测 `invalid` / `wontfix` /
   `help wanted` 等维护标签，不删除或替换已有标签。
3. **补信息**：Bug 报告正文缺复现步骤、环境信息或证据时，仅评论请作者补充，
   保持 Issue 开放。日志原文、代码块、截图或附件均可；冒烟测试、代码引用和
   补丁为可选协助，不要求提问者具备开发能力。
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

Issue 自动化只提供分类与建议，不执行关闭，不覆盖维护者重开决定。缺信息、
未附图片或标题相近不能作为自动拒绝用户报告的依据：

- `.github/workflows/issue-dedup.yml`：标题相似度只生成相关 Issue 的参考评论，
  不自动打 `duplicate`、不关闭。重复判定由维护者比较复现、版本与实际原因；
- `.github/workflows/issue-template-enforcer.yml`：接受文本证据；缺少基础信息时
  仅留言提示，不关闭。自动补齐四类分类标签，标签 API 失败只告警。
  opened/edited/reopened 复核只维护同一条带标记的机器人建议，避免反复刷屏，
  补充完整后更新原建议；不修改用户正文、不修改人工状态；
- `.github/workflows/pr-contribution-rules.yml`：PR 描述缺 PR 类型勾选、
  最新 main 确认、本地验证命令 / 结果摘要，或外部贡献者的用户可见功能缺
  证据时评论提示（`synchronize` 事件仅失败不重复评论）；
- `.github/workflows/reject-docs-pr.yml`：非所有者提交的仅文档类 PR（标题
  `docs:` 开头或勾选「仅文档」）自动评论并关闭（`not_planned`）。

自动化只做初筛，人工标签补充与「重开 / 不重开」的最终决定由维护者确认。

## 贡献者指引

- 提 Issue 前先检索标签与关键词，确认没有重复；
- Bug 报告用「Bug 报告」表单提交（自动附加 `bug` 标签），并包含复现步骤、
  环境信息及脱敏证据；冒烟测试、引用代码与补丁为可选。功能请求 /
  文档 / 问题用另一个表单；
- 想认领任务，优先挑选 `good first issue` 或 `help wanted`，在评论区留言；
- 已关闭的 Issue 若问题仍然存在，请重开并补充最新信息，不要开新 Issue
  重复描述。
- Issue / PR 均无需贡献者自行打标签；标签操作属于维护者/机器人权限，
  PR 类型勾选、正文和证据仍按贡献规范审核，与 GitHub 标签无关。
