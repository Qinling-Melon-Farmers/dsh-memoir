# Changelog

本文件记录 dsh-memoir 每个已发布版本的主要变化。历史版本条目依据对应 Git tag、release 注释和版本提交整理。

## [Unreleased]

### 中文

- 暂无。

### English

- None.

## [0.5.4] - 2026-08-23

### 中文

#### Added

- 完成 v0.5.4 GUI 覆盖：新增与编辑表单支持重要度、置顶、标签和显式替代关系；条目卡展示这些元数据，并增加 section 筛选。
- 将「记忆设置」扩展为完整运行时配置，覆盖 agent 注入、自动蒸馏、Hot Memory 预算、召回条数、会话快照和 BM25 查询缓存。
- 同一双语设置卡同时接入记忆面板与 Settings → Web UI 插件；跟随 DSH 页面语言在中文和英文之间即时切换，无需刷新。
- 侧栏、面板容器和关键部件新增 `data-dsh-plugin="memoir"` / `data-dsh-part` 语义属性，适配 dsh-web-ui v0.3 皮肤契约。
- 新增 GUI 挂载、整棵 sidebar shell 重建、设置 v1→v2 兼容、实时容量收缩和客户端语义契约测试；测试总数增至 160 项。
- README 中英文同步加入 v0.5.4 记忆管理、中文设置和英文设置实机截图。

#### Changed

- `~/.dsh/dsh-memoir.settings.json` 升级为设置格式 v2；旧 v1 自动蒸馏覆盖继续只读兼容，首次保存时才写成 v2。
- Hot Memory 预算、`memoir_read` 默认/最大条数、快照 LRU 与查询 LRU 现在实时读取设置；缩小容量会立即淘汰最旧项，已冻结会话快照保持不变。
- `announceToAgent=false` 时系统提示提供器返回空内容，但仍从可信 assembly 记录活动 cwd，避免关闭注入后破坏新工作区的 GUI 写入授权。
- 侧栏挂载改为幂等、自愈且持续观察整棵 shell 重建；面板通过通用 `dsh-panel-activate` 事件关闭，不再硬编码兄弟插件名称。

#### Compatibility

- 保持 DeepSeek Harness `0.1.1-rc.2` 基线、记忆 store format v3、零普通运行时依赖以及既有自动蒸馏默认行为。

### English

#### Added

- Completed v0.5.4 GUI coverage: add/edit forms now support importance, pinning, tags, and explicit replacement relationships; entry cards expose the metadata and a section filter was added.
- Expanded Memory Settings to the complete runtime policy: agent injection, auto-distill, Hot Memory budgets, recall counts, session snapshots, and the BM25 query cache.
- Mounted the same bilingual settings card in the Memory panel and Settings → Web UI Plugins; it follows the DSH page language and switches between Chinese and English without a reload.
- Added `data-dsh-plugin="memoir"` / `data-dsh-part` semantic attributes to the sidebar, panel host, and key surfaces for the dsh-web-ui v0.3 skin contract.
- Added coverage for GUI mounting, whole-sidebar-shell rebuilds, settings v1→v2 compatibility, live capacity shrinking, and client semantic contracts; the suite now contains 160 tests.
- Updated both READMEs with current v0.5.4 memory-management, Chinese-settings, and English-settings screenshots.

#### Changed

- Upgraded `~/.dsh/dsh-memoir.settings.json` to settings format v2. Existing v1 auto-distill overrides remain readable and are rewritten only on the next explicit save.
- Hot Memory budgets, `memoir_read` default/maximum counts, snapshot LRU, and query LRU now read live settings. Shrinking a capacity evicts the oldest entries immediately while frozen session snapshots remain unchanged.
- With `announceToAgent=false`, the prompt provider emits no content but still observes trusted assembly cwd values, preserving GUI write authorization for new workspaces.
- Sidebar mounting is now idempotent, self-healing, and retained across whole-shell rebuilds. The panel closes for any sibling `dsh-panel-activate` event instead of hard-coding plugin names.

#### Compatibility

- Kept the DeepSeek Harness `0.1.1-rc.2` baseline, memory store format v3, zero regular runtime dependencies, and the existing auto-distill defaults.

## [0.5.3] - 2026-08-22

### 中文

#### Added

- Web 记忆面板新增「自动蒸馏设置」，支持启停 auto-distill，并编辑 worked-turn 间隔、冷却分钟数和最低工具调用数。
- 新增同源 `GET` / `PUT` / `DELETE /api/dsh-memoir/settings`：严格校验 JSON 设置，以原子写入方式持久化到 `~/.dsh/dsh-memoir.settings.json`，也可删除覆盖并恢复启动配置。
- 新增设置存储、路由、客户端 API、动态生命周期和中英双语界面的测试；测试总数增至 154 项。

#### Changed

- 自动蒸馏监听器现在逐回合读取实时策略，Web 保存后无需重启即可作用于后续 turn；关闭 auto-distill 时监听器保持惰性，以支持面板即时重新启用。
- `cordis.patch.yml` 的 auto-distill 字段继续作为启动默认值；只有用户从 Web 保存后才建立持久化覆盖，恢复操作会回到本次挂载时解析出的 profile 值。

#### Compatibility

- 保持 DeepSeek Harness `0.1.1-rc.2` peer/dev 基线和既有 `1 / 0 / 1` 默认行为；记忆 store 格式仍为 v3，未迁移或改写用户记忆数据。

### English

#### Added

- Added Auto-distill Settings to the Memory panel, including enable/disable, worked-turn interval, cooldown minutes, and minimum tool-call controls.
- Added same-origin `GET` / `PUT` / `DELETE /api/dsh-memoir/settings` routes with strict JSON validation, atomic persistence to `~/.dsh/dsh-memoir.settings.json`, and reset-to-startup behavior.
- Added coverage for settings persistence, routes, client APIs, live lifecycle updates, and bilingual UI copy; the suite now contains 154 tests.

#### Changed

- The auto-distill listener now reads the live policy on every turn, so Web saves affect subsequent turns without a restart. A disabled listener remains inert and can be re-enabled immediately from the panel.
- The auto-distill fields in `cordis.patch.yml` remain startup defaults. A persistent override is created only after a Web save, and reset returns to the profile values resolved for the current mount.

#### Compatibility

- Kept the DeepSeek Harness `0.1.1-rc.2` peer/development baseline and the existing `1 / 0 / 1` defaults. The memory store remains format v3 with no migration or rewrite of user memory data.

## [0.5.2] - 2026-08-22

### 中文

#### Added

- 完成 Issue #5：新增 `autoDistillEvery`、`autoDistillCooldownMin`、`autoDistillMinTools`，可按 worked-turn 间隔、时间冷却和工具调用阈值共同控制自动收尾提醒。
- auto-distill 状态按 agent 隔离；重复 turn 不重复计数，冷却仅在 steer 成功后启动，并继续排除 idle、aborted、subagent 和已调用 `memoir_record` 的 turn。
- diagnostics、双语配置文档及单元/集成测试覆盖新增频率参数。

#### Compatibility

- peer/dev 依赖升级并验证兼容 DeepSeek Harness `0.1.1-rc.2`；默认值 `1 / 0 / 1` 保持既有每个 worked turn 提醒一次的行为。

### English

#### Added

- Completed Issue #5 with `autoDistillEvery`, `autoDistillCooldownMin`, and `autoDistillMinTools`, combining worked-turn intervals, time cooldowns, and tool-call thresholds for automatic distillation reminders.
- Isolated auto-distill state per agent, prevented duplicate-turn counting, started cooldown only after a successful steer, and retained the idle, aborted, subagent, and prior-`memoir_record` exclusions.
- Added the new frequency settings to diagnostics and bilingual configuration docs, with unit and integration coverage.

#### Compatibility

- Upgraded peer and development dependencies and verified compatibility with DeepSeek Harness `0.1.1-rc.2`; defaults `1 / 0 / 1` preserve the existing reminder-after-every-worked-turn behavior.

## [0.5.1] - 2026-08-20

### 中文

#### Changed

- 完成 Issue #1 生命周期核心能力：新增 `memoir_update`，支持保留原 id/创建时间地编辑条目，并通过 `status`、`supersedes` 管理过时结论。
- Web 面板支持编辑分类、标题、正文，以及置顶、标记 superseded、归档和恢复；所有变更继续同步 `PROJECT_MEMORY.md`。
- 为生命周期更新、替代关系、工具注册和面板 PATCH 路由补充测试。

### English

#### Changed

- Delivered the core lifecycle portion of Issue #1: added `memoir_update` to edit an entry while preserving its id and creation time, and to manage outdated conclusions with `status` and `supersedes`.
- The Web panel now edits section, title, and content, and supports pinning, marking entries superseded, archiving, and restoring; changes continue to regenerate `PROJECT_MEMORY.md`.
- Added coverage for lifecycle updates, superseding relationships, tool registration, and the panel PATCH route.

## [0.5.0] - 2026-08-20

### 中文

#### Added

- 引入兼容 DSH `0.1.0-rc.8` 的 Memory Lifecycle：记忆条目支持 `importance`、`pinned`、`status`、`supersedes` 和 `tags`。
- 支持 `active`、`superseded`、`archived` 生命周期状态；默认读取 active 条目，并提供归档、恢复和 supersede 操作。
- 旧版 v2 store 在读取时兼容迁移到 v3 语义，首次写入时再持久化新字段，不在启动时改写用户文件。
- GUI 增加状态筛选、置顶、归档和恢复操作；排序同时考虑相关性、重要性和置顶状态。

#### Changed

- `memoir_read(scope: 'all')` 对跨项目结果去重，并统一使用 active 默认筛选和全局排序。
- 改进跨进程锁：记录 PID、创建时间和 nonce；仅在锁超时且持有进程已退出时回收，异常锁内容默认安全失败。
- GET 路由不再信任浏览器提交的 workspace 路径；写操作继续使用受授权的活动工作区约束。
- 修复收起侧边栏时仍显示“记忆”文字的问题，并调整记忆入口在窄 rail 中的布局。
- 修复记忆面板在 source-run CSS Modules Web shell 中的挂载位置。

#### Compatibility

- peer/dev 依赖升级到 DSH `0.1.0-rc.8`。
- 保持 v2 store 数据可读，未引入自动删除或隐式 supersede。

### English

#### Added

- Added the Memory Lifecycle compatible with DSH `0.1.0-rc.8`, including `importance`, `pinned`, `status`, `supersedes`, and `tags`.
- Added `active`, `superseded`, and `archived` states with active-only default reads and explicit archive, restore, and supersede operations.
- Added v2-to-v3 compatibility migration that persists new fields on the first write instead of rewriting files at startup.
- Added GUI status filtering, pinning, archiving, and restoring; ranking now considers relevance, importance, and pin state.

#### Changed

- Deduplicated `memoir_read(scope: 'all')` results and unified active filtering with global ranking.
- Hardened the cross-process lock with pid, creation time, and nonce metadata, and conservative stale-lock reclamation.
- Stopped GET routes from trusting browser-supplied workspace paths while keeping writes constrained to authorized workspaces.
- Fixed the collapsed-sidebar “Memory” label and adjusted the narrow-rail layout.
- Fixed the memory panel mount location in the source-run CSS Modules Web shell.

#### Compatibility

- Upgraded peer and development dependencies to DSH `0.1.0-rc.8`.
- Kept v2 store data readable without automatic deletion or implicit superseding.

## [0.4.3] - 2026-08-18

### 中文

#### Added

- 增加基于版本 tag 的 npm 发布工作流，发布前校验 tag 与 `package.json` 版本一致。
- 增加跨平台损坏备份文件名测试，覆盖 Windows 与 Unix 路径差异。

#### Changed

- 完成 npm registry 发布准备和 0.4.3 版本元数据整理。

### English

#### Added

- Added a tag-based npm publishing workflow that verifies the tag matches the `package.json` version before publishing.
- Added cross-platform corrupted-backup filename tests covering Windows and Unix path differences.

#### Changed

- Completed npm registry release preparation and 0.4.3 version metadata cleanup.

## [0.4.2] - 2026-08-17

### 中文

#### Added

- 完成 Cache & Retrieval Consolidation：统一排序召回、Hot Memory、查询缓存和诊断信息。
- 增加检索索引、查询缓存、最近查询、会话快照和 Hot Memory 的可观测指标。
- GUI 搜索与 `memoir_read` 共用 RetrievalEngine，并增加 Hot Memory Inspector 和 retrieval diagnostics。

#### Changed

- Hot Memory 使用配额式选择，保证近期状态有最低保留量，并按重要性和类别填充预算。
- 会话快照按稳定 session identity 冻结；缺少唯一身份时不冻结，避免跨会话复用旧快照。
- store 写入使用跨进程文件锁，并在临界区内重新读取磁盘内容，避免并发 DSH 进程互相覆盖。
- Windows 项目路径使用大小写不敏感的 canonical key，同时保留展示路径原始大小写。
- BM25 检索改进长度归一化、词频、全局 Top-K 和输出预算处理；查询缓存采用 epoch 感知的 LRU。
- GUI 写 API 增加 workspace authorization，浏览器提交的任意绝对路径不再自动获得写权限。

### English

#### Added

- Completed Cache & Retrieval Consolidation: unified ranked recall, Hot Memory, query caching, and diagnostics.
- Added observable metrics for the retrieval index, query cache, recent queries, session snapshots, and Hot Memory.
- Unified GUI search and `memoir_read` on RetrievalEngine, with Hot Memory Inspector and retrieval diagnostics.

#### Changed

- Hot Memory now uses quota-based selection with a recent-state floor, then fills the budget by importance and section.
- Session snapshots freeze on a stable session identity; without one, freezing is skipped to avoid cross-session reuse.
- Store writes use a cross-process file lock and reload disk contents inside the critical section to prevent lost updates.
- Windows project paths use a case-insensitive canonical key while preserving display casing.
- Improved BM25 length normalization, term frequency, global Top-K, and output budgeting; query caching is epoch-aware LRU.
- Added workspace authorization to the GUI write API so arbitrary browser-submitted absolute paths do not gain write access.

## [0.4.1] - 2026-08-17

### 中文

#### Added

- 增加本地 tokenizer 和倒排索引。
- `memoir_read` 支持 BM25 相关性排序和 ranked recall，并提供查询缓存能力。
- 增加 ranked-recall benchmark、配置说明和版本发布文档。

### English

#### Added

- Added a local tokenizer and inverted index.
- Added BM25 relevance ranking and ranked recall to `memoir_read`, with query-cache support.
- Added a ranked-recall benchmark, configuration documentation, and release documentation.

## [0.4.0] - 2026-08-17

### 中文

#### Added

- 增加有预算上限的 Hot Memory selector。
- 增加按 session 冻结的 memory snapshot，并自动注入 system prompt。
- GUI 增加 memory diagnostics、benchmark 和相关文档。

#### Changed

- `memoir_read` 增加 `limit` 和 `detail` 控制，继续保持有界输出。

### English

#### Added

- Added a budget-bounded Hot Memory selector.
- Added session-frozen memory snapshots and automatic system-prompt injection.
- Added memory diagnostics, benchmarks, and related documentation to the GUI.

#### Changed

- Added `limit` and `detail` controls to `memoir_read` while keeping output bounded.

## [0.3.1] - 2026-08-17

### 中文

#### Changed

- 增加 store snapshot cache，减少重复磁盘读取。
- 去除重复的 project-memory 写入。
- 对读取输出、prompt 文本和 tool 文本增加长度边界，避免无界增长。

### English

#### Changed

- Added a store snapshot cache to reduce repeated disk reads.
- Removed duplicate project-memory writes.
- Added length bounds to read output, prompt text, and tool text to prevent unbounded growth.

[Unreleased]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/compare/v0.5.3...HEAD
[0.5.3]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.5.3
[0.5.2]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.5.2
[0.5.1]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.5.1
[0.5.0]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.5.0
[0.4.3]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.4.3
[0.4.2]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.4.2
[0.4.1]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.4.1
[0.4.0]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.4.0
[0.3.1]: https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.3.1
