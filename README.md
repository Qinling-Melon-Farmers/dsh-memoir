# dsh-memoir

[![npm version](https://img.shields.io/npm/v/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![npm downloads](https://img.shields.io/npm/dm/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![license](https://img.shields.io/npm/l/dsh-memoir.svg)](./LICENSE)

中文 · [English](./README.en.md) · [更新日志](./CHANGELOG.md) · [Releases](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases)

**DeepSeek Harness（DSH）的本地优先、跨会话项目记忆插件。** 它把 Agent 已确认的工作结论、经验教训和后续行动持久化，在新会话中注入有界且缓存友好的 Hot Memory，并通过本地 BM25 排序召回长尾历史。

无需 embedding、向量数据库或云端记忆服务；npm 包零捆绑运行时依赖，DSH peer 由宿主提供。

> [!IMPORTANT]
> npm `latest` 为 `dsh-memoir@0.6.1`，适用于 `@deepseek-ai/dsh >=0.1.2-alpha.2 <0.1.3`，已验证 DSH alpha.4、alpha.5 与 0.1.2-rc.1。仍使用 `0.1.1-rc.2` 的用户应固定安装 `dsh-memoir@0.5.6`。

```bash
npm install --global @deepseek-ai/dsh@alpha
dsh plugin --profile web add dsh-memoir@latest
```

重启 `dsh web` 即可。记忆保存在本机，不会随插件升级或卸载自动删除。

## 为什么选择 dsh-memoir

| 能力 | 用户得到什么 |
| --- | --- |
| 本地优先 | JSON 单一事实源与项目内 `PROJECT_MEMORY.md`；不上传记忆，不依赖外部服务 |
| 自动蒸馏提醒 | 顶层 Agent 完成有效工作回合时提醒归纳，由 `memoir_record` 透明落盘；跳过 idle、aborted、subagent 和已记录回合 |
| 有界 Hot Memory | 只把高价值记忆放进 system prompt，受 token 预算硬限制；同一会话冻结前缀以提高 prompt-prefix cache 命中 |
| BM25 排序召回 | 中文短语、英文关键词、代码标识符和路径都可检索；跨项目 Top-K 与查询 LRU 缓存共用同一引擎 |
| 可治理的记忆 | 重要度、置顶、标签、归档、恢复和 supersede 生命周期；相似写入必须显式更新、替代或并存 |
| 可追溯 | Agent 写入记录可信 session/turn 来源，Web 面板可复制并尽力跳回原会话 |
| 完整 Web GUI | 中英双语项目/全局浏览、排序搜索、编辑、Hot Memory 预览、诊断和实时设置；可独立选择 Agent 侧中文或英文 |

适合需要“新 Agent 接手时继续理解项目”的个人或本地开发工作流。它不是原始聊天记录备份、多人云同步服务或向量语义知识库。

![dsh-memoir v0.6.1 按项目折叠的全局记忆](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.1/picture/v0.6.1-global-project-groups-zh.png)

## 工作原理

```text
有效工作回合
    │  自动蒸馏提醒
    ▼
memoir_record / memoir_update
    │
    ├── ~/.dsh/dsh-memoir.json       完整结构化历史（SSOT）
    ├── <项目>/PROJECT_MEMORY.md      可读、可提交的投影
    └── Retrieval Index              倒排索引 + BM25 + 查询缓存
              │
              ├── Hot Memory Selector ──> 有界 system-prompt 注入
              └── memoir_read / Web ────> 按需召回长尾历史
```

完整历史与 Hot Memory 是两层数据：

- **Full Memory** 保留全部记录，用于 GUI、人工审阅、Markdown 投影和排序检索。
- **Hot Memory** 只选择预算内的 actions、lessons 与 recent state；不会把整个 `PROJECT_MEMORY.md` 塞进 prompt。
- **Session Snapshot** 在会话内冻结注入文本。新写入立即可被工具和 GUI 读取，但自动注入从下一个新会话开始更新。

## Agent 工具与记忆生命周期

| 工具 | 用途 |
| --- | --- |
| `memoir_record` | 写入 work / lessons / actions / note；写前返回可解释的相似或冲突候选 |
| `memoir_update` | 保留 id 和创建时间，更新正文、分类、重要度、标签与生命周期 |
| `memoir_read` | 在 project（默认）/ global / all 范围内进行 compact 或 full 的本地排序召回 |

每条记忆可设 1–5 重要度，默认 **3** 代表中性优先级；置顶会获得额外 Hot Memory 权重。默认只召回 `active`，被归档或替代的历史仍可检查和恢复，不会被自动删除。

相似记忆治理复用 BM25 候选，再融合标题相似度与 Token Jaccard。插件只提示疑似重复或冲突，不自行判断真伪；调用者必须选择：

- `update`：原地更新现有记录；
- `supersede`：保留旧历史并标记已被新记录替代；
- `force-record`：确认两条都应存在。

## 自动蒸馏

自动蒸馏是可观察的 Agent 收尾提醒，不是后台静默抓取聊天内容。默认 `1 / 0 / 1` 表示：每个有效 worked turn、无额外冷却、至少一次工具调用即可提醒。

`autoDistillEvery`、`autoDistillCooldownMin`、`autoDistillMinTools` 三个条件按 AND 判定并按 Agent 隔离。idle、aborted、subagent 和已调用 `memoir_record` 的回合不会触发；冷却只在提醒成功后更新。所有频率参数都可在 GUI 中即时修改。

`language` 独立控制 Agent 可见的工具描述、参数说明、蒸馏提示、工具结果、Hot Memory / `PROJECT_MEMORY.md` 标题以及校验与治理错误。默认 `zh` 保持向后兼容，也可在 GUI 中切换为 `en`；切换后工具 schema 与后续提示即时更新，不要求重启 DSH。

## 本地召回与缓存

- 中文 2/3-gram + 英文单词 + 代码/路径标识符分词；
- BM25 文档侧保留真实词频，标题 2.5× 加权，另有精确短语、分类与时间权重；
- 标题与正文独立长度归一化；
- project / global / all 共用去重后的全局 Top-K；
- epoch 感知、1 小时时间桶的 LRU 查询缓存；`limit` 与输出详略不进入缓存键，因此不同输出形态共享排序结果；
- GUI 和 `memoir_read` 使用同一个 RetrievalEngine，并暴露 hits、misses、evictions、命中率与最近查询耗时。

固定质量集的 Top-5 命中率为 100%，仓库门禁要求不低于 90%。

## Web GUI

安装到 DSH alpha 的 `web` profile 后，Memoir 通过官方 slot 注册原生「记忆」会话视图和「记忆」Settings 分区；布局、导航与卸载生命周期均由 DSH shell 管理，不再通过 DOM 选择器接管旧侧边栏。

- 项目记忆与所有项目的全局记忆；全局视图按项目默认折叠并显示完整生命周期计数；
- 状态、分类和关键词筛选，BM25 分数展示；
- 新增、编辑、置顶、归档、恢复和替代；
- session/turn 来源复制与尽力跳转；
- Hot Memory Inspector：下一会话将继承什么；
- Retrieval Diagnostics：索引、查询缓存、最近查询和会话快照；
- 常驻 `记忆浏览 / 记忆设置 / Hot Memory / 诊断` 二级导航，各功能区拥有独立有界滚动位置；
- 每批渐进展示 20 条记忆或 20 个项目，长正文默认折叠为六行并可显式展开；
- 使用 DSH 原生 composer-overlay 契约，长列表可完整滚动且最后一项不会被对话输入框遮挡；
- 页签支持方向键、Home、End，项目折叠具备 `aria-expanded` 与清晰焦点状态；
- GUI 跟随 `<html lang>` 在中文和英文间即时切换；Agent 侧语言由独立的 `language` 设置控制。

<details>
<summary>查看更多 GUI 截图</summary>

![v0.6.1 常驻功能导航与实时设置](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.1/picture/v0.6.1-settings-navigation-zh.png)

![v0.6.1 对话视图滚动到底且避让输入框](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.1/picture/v0.6.1-conversation-scroll-zh.png)

![DSH alpha.2 原生记忆会话视图](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.0/picture/v0.6.0-alpha2-native-zh.png)

![记忆生命周期与相似治理](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.4-memory-management-zh.png)

![Settings 设置卡](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.6-settings-card-zh.png)

![侧边栏对齐](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.5-sidebar-parity-zh.png)

</details>

## 安装与兼容性

| 渠道 | DSH 基线 | 安装方式 | 状态 |
| --- | --- | --- | --- |
| npm `latest`（`0.6.1`） | `>=0.1.2-alpha.2 <0.1.3` | `dsh plugin --profile web add dsh-memoir@latest` | 当前正式版；已验证 alpha.4 编译、alpha.5 + dsh-web-all 实机 UI 与 0.1.2-rc.1 回归 |
| npm 固定版 `0.5.6` | `0.1.1-rc.2` | `dsh plugin --profile web add dsh-memoir@0.5.6` | rc2 兼容线 |
| GitHub `main`（`0.6.1`） | `>=0.1.2-alpha.2 <0.1.3` | 源码 clone + `link:` | 与 npm `0.6.1` 同步；供开发和调试使用 |

需要 Node.js `^22.19.0 || >=24.0.0`。`0.6.x` 使用 DSH alpha 的原生 `conversation.view` / `settings.section` 与 Remote 时代客户端模块；`0.6.1` 同时兼容 alpha.2/alpha.3 的公开 `session.events` 与 alpha.4+ 的 `session.snapshotEvents()`。manifest 的 `dsh.engines.dsh` 会拒绝不兼容宿主。

<details>
<summary>从源码安装</summary>

0.6.x 源码：

```bash
git clone https://github.com/Qinling-Melon-Farmers/dsh-memoir.git
cd dsh-memoir
pnpm install --frozen-lockfile
pnpm run build
npm install --global @deepseek-ai/dsh@alpha
dsh plugin --profile web add "link:/absolute/path/dsh-memoir"
```

</details>

## 存储、隐私与安全边界

```text
~/.dsh/dsh-memoir.json          结构化 JSON v4（单一事实源）
~/.dsh/dsh-memoir.settings.json GUI 运行时设置覆盖
<项目>/PROJECT_MEMORY.md        从 JSON 生成的人类可读投影
```

- 无云端记忆库、embedding API 或向量数据库；
- 浏览器提交任意绝对路径不能获得写权限，面板写入只接受可信活动工作区或已存在的项目桶；
- 浏览器手工记录不能伪造可信 session/turn 来源；
- 跨进程写入使用独占锁并在临界区重新读盘，保守回收死亡进程遗留锁；
- Windows 路径键大小写归一化，展示路径保留原样；
- `PROJECT_MEMORY.md` 可能被你提交到 Git，敏感内容是否进入仓库由使用者决定。

建议在升级前按自己的备份策略保存上述 JSON 与项目 Markdown。卸载插件不会主动删除它们。

## 配置

以下字段都可写在 `cordis.patch.yml` 的 memoir `config` 中；除 `enabled` 外，也可从记忆面板或 Settings 设置卡即时修改并持久化。

| 字段 | 默认值 | 作用 |
| --- | ---: | --- |
| `enabled` | `true` | 工具、路由和 prompt 注入总开关 |
| `language` | `zh` | Agent 可见的 prompt、工具 schema/结果、投影标题与错误语言；可选 `zh` / `en` |
| `announceToAgent` | `true` | 向 Agent 公告记忆工具与规则 |
| `autoDistill` | `true` | 启用顶层有效回合收尾提醒 |
| `autoDistillEvery` | `1` | 每 N 个 worked turn 最多提醒一次 |
| `autoDistillCooldownMin` | `0` | 两次成功提醒的最短分钟间隔 |
| `autoDistillMinTools` | `1` | 触发回合所需的最少工具调用数 |
| `hotMemoryTokens` | `900` | Hot Memory 常规目标预算 |
| `hotMemoryMaxTokens` | `1200` | 任何会话都不能超过的硬上限 |
| `readDefaultLimit` | `8` | `memoir_read` 默认结果数 |
| `readMaxLimit` | `30` | 单次召回实时上限 |
| `sessionSnapshotMax` | `128` | 会话冻结快照 LRU 容量 |
| `queryCacheSize` | `128` | BM25 查询 LRU 容量 |

缩小缓存容量会立即淘汰最旧项；已冻结会话不会因预算修改而重写，以维持 prompt 前缀稳定。“恢复启动配置”会删除 Web 覆盖并回到 profile 的启动值。

## 性能与验证

v0.5.6 基准（Node 24.19，900/1200 token；完整数据见 [`bench/report.md`](./bench/report.md)）：

| 记录数 | 索引构建 | 未缓存查询 | 缓存查询 | 相对完整 Markdown 的注入降幅 |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 10.5 ms | 1.190 ms | 4.07 µs | 97.6% |
| 10,000 | 126.9 ms | 11.011 ms | 1.45 µs | 99.8% |
| 100,000 | 1.68 s | 126.933 ms | 1.42 µs | 约 100% |

基准值取决于机器和语料；它证明的重点是注入预算保持有界、缓存命中路径与记忆总量解耦。

v0.6.1 有 189 项自动化测试，覆盖存储/设置迁移与锁、Hot Memory、BM25 质量/缓存、生命周期、来源防伪、相似治理、自动蒸馏、Agent 侧与 GUI 双语、项目折叠/渐进加载、滚动布局及 DSH alpha 兼容。另在隔离 profile 中以 DSH alpha.5 + `@linxin666/dsh-web-all@0.3.12` 完成 Settings 与真实会话页浏览器回归；alpha.4 类型编译与 DSH 0.1.2-rc.1 回归（189 项测试、API/工具/GUI/自动蒸馏实机验证）也已通过。

## 常见问题

**会自动总结所有聊天吗？**<br>
不会静默抓取所有对话。插件在符合条件的回合结束时提醒当前 Agent 归纳，Agent 通过公开工具写入，因此过程可观察、可审查。

**为什么新记忆的重要度总是 3？**<br>
3 是 1–5 标度的中性默认值，避免未显式评分的内容被当成低价值或最高优先级。可在工具参数或 GUI 中调整，置顶另有独立权重。

**为什么当前会话没有立刻重新注入刚写的记忆？**<br>
会话内 Hot Memory 快照刻意冻结以保护 prompt-prefix cache。刚写内容可立即被 `memoir_read` 和 GUI 看见，新会话会自动重建并注入。

**它会把完整记忆都塞进上下文吗？**<br>
不会。只有受 `hotMemoryMaxTokens` 约束的 Hot Memory 自动注入；完整历史按需检索。

**安装后为什么看不到界面？**<br>
确认命令包含 `--profile web`，然后彻底重启 `dsh web`，仅刷新浏览器页面不够。

## 开发与贡献

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm test
npm run bench
```

提交前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。版本变化见 [CHANGELOG.md](./CHANGELOG.md)，正式包由 tag 工作流通过 npm OIDC 发布。当前 npm 正式版是 [v0.6.1](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.6.1)，`main` 与该版本同步。

Apache-2.0
