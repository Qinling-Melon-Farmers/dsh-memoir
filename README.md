# dsh-memoir

[![npm version](https://img.shields.io/npm/v/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![npm downloads](https://img.shields.io/npm/dm/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![license](https://img.shields.io/npm/l/dsh-memoir.svg)](./LICENSE)

中文 · [English](./README.en.md) · [更新日志](./CHANGELOG.md) · [Releases](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases)

**DeepSeek Harness（DSH）的本地优先、跨会话项目记忆插件。** 它把 Agent 已确认的工作结论、经验教训和后续行动持久化，在新会话中注入有界且缓存友好的 Hot Memory，并通过本地 BM25 排序召回长尾历史。

无需 embedding、向量数据库或云端记忆服务；npm 包零捆绑运行时依赖，DSH peer 由宿主提供。

```bash
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
| 完整 Web GUI | 中英双语项目/全局浏览、排序搜索、编辑、Hot Memory 预览、诊断和实时设置 |

适合需要“新 Agent 接手时继续理解项目”的个人或本地开发工作流。它不是原始聊天记录备份、多人云同步服务或向量语义知识库。

![dsh-memoir 记忆管理、设置与 Hot Memory](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.6-memory-scroll-zh.png)

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

## 本地召回与缓存

- 中文 2/3-gram + 英文单词 + 代码/路径标识符分词；
- BM25 文档侧保留真实词频，标题 2.5× 加权，另有精确短语、分类与时间权重；
- 标题与正文独立长度归一化；
- project / global / all 共用去重后的全局 Top-K；
- epoch 感知、1 小时时间桶的 LRU 查询缓存；`limit` 与输出详略不进入缓存键，因此不同输出形态共享排序结果；
- GUI 和 `memoir_read` 使用同一个 RetrievalEngine，并暴露 hits、misses、evictions、命中率与最近查询耗时。

固定质量集的 Top-5 命中率为 100%，仓库门禁要求不低于 90%。

## Web GUI

安装到 `web` profile 后，侧边栏会出现“记忆”入口，并在 Settings → Web UI 插件中加入默认折叠的设置卡。

- 项目记忆与所有项目的全局记忆；
- 状态、分类和关键词筛选，BM25 分数展示；
- 新增、编辑、置顶、归档、恢复和替代；
- session/turn 来源复制与尽力跳转；
- Hot Memory Inspector：下一会话将继承什么；
- Retrieval Diagnostics：索引、查询缓存、最近查询和会话快照；
- 单一纵向滚动区，展开设置、Hot Memory 与诊断后仍可连续浏览；
- 跟随 `<html lang>` 在中文和英文间即时切换。

<details>
<summary>查看更多稳定版 GUI 截图</summary>

![记忆生命周期与相似治理](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.4-memory-management-zh.png)

![Settings 设置卡](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.6-settings-card-zh.png)

![侧边栏对齐](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.5-sidebar-parity-zh.png)

</details>

## 安装与兼容性

| 渠道 | DSH 基线 | 安装方式 | 状态 |
| --- | --- | --- | --- |
| npm `latest` | `0.1.1-rc.2` | `dsh plugin --profile web add dsh-memoir@latest` | 推荐稳定版 |
| GitHub `main` | `0.1.1-rc.2` | 源码 clone + `link:` | 稳定版开发 |
| [`alpha/dsh-0.1.2-alpha.1`](https://github.com/Qinling-Melon-Farmers/dsh-memoir/tree/alpha/dsh-0.1.2-alpha.1) | `0.1.2-alpha.1` | 从官方 DSH alpha 源码用 `pnpm dsh ... link:` | 仅源码预览 |

稳定版需要 Node.js `^22.19.0 || >=24.0.0`。dshmarket 与 dsh-web 插件管理器应继续安装 `@latest`；alpha 分支没有 npm 包、tag 或 Release，避免稳定用户误升级宿主。

<details>
<summary>从源码安装</summary>

稳定版源码：

```bash
git clone https://github.com/Qinling-Melon-Farmers/dsh-memoir.git
cd dsh-memoir
pnpm install --frozen-lockfile
pnpm run build
dsh plugin --profile web add "link:/absolute/path/dsh-memoir"
```

DSH `0.1.2-alpha.1` 预览版：

```bash
git clone --branch alpha/dsh-0.1.2-alpha.1 https://github.com/Qinling-Melon-Farmers/dsh-memoir.git
cd dsh-memoir
pnpm install --frozen-lockfile
pnpm run build

# 在官方 DSH dsh-v0.1.2-alpha.1 源码目录执行
pnpm dsh plugin --profile web add "link:/absolute/path/dsh-memoir"
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

稳定版有 171 项自动化测试，覆盖存储迁移与锁、Hot Memory、BM25 质量/缓存、生命周期、来源防伪、相似治理、自动蒸馏、双语 GUI、滚动布局、集成和发布工作流。

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

提交前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。版本变化见 [CHANGELOG.md](./CHANGELOG.md)，稳定包由 tag 工作流通过 npm OIDC 发布。当前稳定版是 [v0.5.6](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.5.6)。

Apache-2.0
