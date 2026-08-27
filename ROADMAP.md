# dsh-memoir v0.5.6–v1.0 路线图

> 更新日期：2026-08-27
> 当前基线：v0.5.6 已发布、DSH `0.1.1-rc.2`、store format v4
> 完成度：v0.5 阶段约 94%，v1.0 总路线约 73%。详细依据见 [v0.5.6 项目评审](./PROJECT_REVIEW_v0.5.6.md)。

## v0.5.6 — 来源追踪、相似记忆治理与 Web 体验

状态：已于 2026-08-27 发布。

- store v4：`source.sessionId/turnId`，旧 `sessionId` 懒兼容。
- Web 来源展示、复制和 best-effort session/turn 跳转。
- BM25 候选 + 标题相似度 + Token Jaccard；duplicate/conflict 可解释理由。
- `update` / `supersede` / `force-record` 显式处理，不自动删除或合并。
- Settings 卡与 dsh-web-ui 家族一致并默认折叠；面板统一单滚动区。
- npm OIDC 优先、token 临时回退；README/Changelog/Release 中英双语。

发布实证：171 项测试、当前 benchmark、Windows/WSL rc.2 正式 npm 包冷启动、真实 GUI 截图、npm `latest`、OIDC provenance 与公开 GitHub Release 全部通过。

## v0.5.7 — 蒸馏生命周期

目标窗口：2026-08-28 至 2026-09-06。

- 新增 `turn / checkpoint / manual` 三种模式，并在双语 GUI 配置。
- checkpoint 聚合多个 worked turns，展示累计进度、最近触发和跳过原因。
- 优先使用 rc.2 公共 session-end 契约；若无稳定契约，提供显式 checkpoint 工具/API，不依赖私有事件。
- 保证 abort、subagent、重复 turn、主动记录后的幂等性。
- 建立可测试质量信号：稳定决策、可复用经验、后续行动、环境约束；不把普通聊天强行写入。

## v0.5.8 — 审计、恢复与质量解释

目标窗口：2026-09-07 至 2026-09-16。

- 为 update/supersede 增加 append-only 变更历史、来源和字段差异，保留创建 source。
- 增加 export/import、备份清单、校验和与一键恢复；不覆盖当前 store 前先留恢复点。
- 为 content、tags、supersedes 和候选摘要定义可兼容上限。
- 设置写入加入 revision/冲突提示，避免多个页面静默 last-write-wins。
- 扩大中英、代码、路径、否定和跨语言改写评估集；展示召回/候选解释，但仍不自动语义合并。

## v0.6.0 — 通用 Memoir Core

目标窗口：2026-09-17 至 2026-10-01。

- 把 store、retrieval、selector、lifecycle/governance 抽成内部 workspace core；DSH 事件、工具、路由和 Web 留在 adapter。
- 定义稳定的存储、检索、选择、事务与迁移接口；v1–v4 数据无损读取。
- 首阶段仍随 `dsh-memoir` 打包并保持零普通运行时依赖；是否单独发布 core 另行评审。
- 增加并发确认过期、锁竞争、异常注入和属性/模糊测试。

## v0.6.1 — Adapter 与质量评估

目标窗口：2026-10-02 至 2026-10-15。

- 提供至少一个非 DSH 参考 adapter，优先 OpenAI Agents SDK 或 LangGraph；保持可选依赖。
- 建立记忆质量、来源完整性、重复候选准确率、错误记忆率和蒸馏噪声指标。
- 把 token 节省、缓存命中和检索延迟纳入同一可重复 benchmark。

## v0.7.0 — 规模化存储与 Web UX

目标窗口：2026-10-16 至 2026-10-29。

- 基于真实门禁评估按项目分片/增量索引；触发条件为 active store 超过 20,000 条且 P95 查询超过 50 ms。
- GUI 增加分页或虚拟列表、批量筛选和大 store 渐进加载。
- 建立 Windows、WSL/Linux、dsh-web-ui 0.2.9/0.3.x 的干净 profile 持续矩阵。

## v0.9.0 — Production Candidate

目标窗口：2026-10-30 至 2026-11-15。

- 冻结公共 API、store 升级/回滚与弃用政策。
- 完成隐私、恢复、备份、诊断、规模门禁和故障注入文档。
- 发布候选至少经历一个完整真实使用周期，不因日期强行进入 v1.0。

## v1.0.0 — 稳定版

目标窗口：2026-11-16 至 2026-11-30。

- 稳定 store、工具参数、core/adapter 契约和兼容政策。
- 每条注入或候选记忆可解释“为何入选、为何排名、来自哪里、如何变更”。
- npm OIDC、GitHub tag/release、双语 README/Changelog、Windows/WSL 支持矩阵全部形成长期门禁。

## 统一发布门禁

- typecheck、完整测试、构建和 bundle 纯度通过；新增能力必须有回归测试。
- Windows 与 WSL Ubuntu 20.04 使用正式 npm 包在 DSH rc.2 下冷启动，无 plugin/locale 错误。
- GUI 用户可见变化附当前真实截图，中英界面和 dsh-web-ui 设计契约均验证。
- Changelog 与 Release notes 中英双语；Release 默认中文，English 可折叠。
- package version、npm、tag、GitHub Release、README 和 roadmap 一致。
- 未达到门禁就顺延，不为排期牺牲数据安全或兼容性。

## 非目标

在真实数据证明必要前，不引入向量数据库、云端记忆服务、知识图谱、自动删除/自动语义合并，也不为抽象而增加强制运行时依赖。
