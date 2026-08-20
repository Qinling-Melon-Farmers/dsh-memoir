# Changelog

本文件记录 dsh-memoir 每个已发布版本的主要变化。历史版本条目依据对应 Git tag、release 注释和版本提交整理。

## [0.5.0] - 2026-08-20

### Added

- 引入兼容 DSH `0.1.0-rc.8` 的 Memory Lifecycle：记忆条目支持 `importance`、`pinned`、`status`、`supersedes` 和 `tags`。
- 支持 `active`、`superseded`、`archived` 生命周期状态；默认读取 active 条目，并提供显式更新、归档、恢复和 supersede 操作。
- 旧版 v2 store 在读取时兼容迁移到 v3 语义，首次写入时再持久化新字段，不在启动时改写用户文件。
- GUI 增加状态筛选、置顶、归档和恢复操作；排序同时考虑相关性、重要性和置顶状态。

### Changed

- `memoir_read(scope: 'all')` 对跨项目结果去重，并统一使用 active 默认筛选和全局排序。
- 改进跨进程锁：记录 PID、创建时间和 nonce；仅在锁超时且持有进程已退出时回收，异常锁内容默认安全失败。
- GET 路由不再信任浏览器提交的 workspace 路径；写操作继续使用受授权的活动工作区约束。
- 修复收起侧边栏时仍显示“记忆”文字的问题，并调整记忆入口在窄 rail 中的布局。
- 修复记忆面板在 source-run CSS Modules Web shell 中的挂载位置。

### Compatibility

- peer/dev 依赖升级到 DSH `0.1.0-rc.8`。
- 保持 v2 store 数据可读，未引入自动删除或隐式 supersede。

## [0.4.3] - 2026-08-18

### Added

- 增加基于版本 tag 的 npm 发布工作流，发布前校验 tag 与 `package.json` 版本一致。
- 增加跨平台损坏备份文件名测试，覆盖 Windows 与 Unix 路径差异。

### Changed

- 完成 npm registry 发布准备和 0.4.3 版本元数据整理。

## [0.4.2] - 2026-08-17

### Added

- 完成 Cache & Retrieval Consolidation：统一排序召回、Hot Memory、查询缓存和诊断信息。
- 增加检索索引、查询缓存、最近查询、会话快照和 Hot Memory 的可观测指标。
- GUI 搜索与 `memoir_read` 共用 RetrievalEngine，并增加 Hot Memory Inspector 和 retrieval diagnostics。

### Changed

- Hot Memory 使用配额式选择，保证近期状态有最低保留量，并按重要性和类别填充预算。
- 会话快照按稳定 session identity 冻结；缺少唯一身份时不冻结，避免跨会话复用旧快照。
- store 写入使用跨进程文件锁，并在临界区内重新读取磁盘内容，避免并发 DSH 进程互相覆盖。
- Windows 项目路径使用大小写不敏感的 canonical key，同时保留展示路径原始大小写。
- BM25 检索改进长度归一化、词频、全局 Top-K 和输出预算处理；查询缓存采用 epoch 感知的 LRU。
- GUI 写 API 增加 workspace authorization，浏览器提交的任意绝对路径不再自动获得写权限。

## [0.4.1] - 2026-08-17

### Added

- 增加本地 tokenizer 和倒排索引。
- `memoir_read` 支持 BM25 相关性排序和 ranked recall，并提供查询缓存能力。
- 增加 ranked-recall benchmark、配置说明和版本发布文档。

## [0.4.0] - 2026-08-17

### Added

- 增加有预算上限的 Hot Memory selector。
- 增加按 session 冻结的 memory snapshot，并自动注入 system prompt。
- GUI 增加 memory diagnostics、benchmark 和相关文档。

### Changed

- `memoir_read` 增加 `limit` 和 `detail` 控制，继续保持有界输出。

## [0.3.1] - 2026-08-17

### Changed

- 增加 store snapshot cache，减少重复磁盘读取。
- 去除重复的 project-memory 写入。
- 对读取输出、prompt 文本和 tool 文本增加长度边界，避免无界增长。

[0.5.0]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.5.0
[0.4.3]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.4.3
[0.4.2]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.4.2
[0.4.1]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.4.1
[0.4.0]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.4.0
[0.3.1]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.3.1
