# dsh-memoir

[![npm version](https://img.shields.io/npm/v/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![npm downloads](https://img.shields.io/npm/dm/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![license](https://img.shields.io/npm/l/dsh-memoir.svg)](./LICENSE)

中文 · [English](./README.en.md) · [更新日志](./CHANGELOG.md) · [Releases](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases)

**DeepSeek Harness（DSH）的本地优先、跨会话项目记忆插件。** 它把 Agent 已确认的工作结论、经验教训和后续行动持久化，在新会话中注入有界且缓存友好的 Hot Memory，并通过本地 BM25 排序召回长尾历史。

无需 embedding、向量数据库或云端记忆服务；npm 包零捆绑运行时依赖，DSH 与 Zod 4 peer 由宿主环境提供；Zod 用于验证宿主会话投影，不捆绑进插件。

> [!WARNING]
> **会话恢复问题 #14：0.8.1–0.9.0 写入的旧回执可能导致会话重新打开失败。** `main` 已移除不受宿主支持的事件，但这不是已发布 npm 包的更新。使用修复版前请停止受影响版本的记忆写入；仅关闭自动蒸馏不能阻止手动工具写入。已有会话与记忆原始数据应保留，按[恢复说明](./SESSION_RECOVERY.md)先只读检查、停机备份后再恢复；不要删除日志或直接降级数据格式。
> 修复已覆盖官方 DSH `0.2.0-rc.1` / `0.2.0-rc.2`；仅升级 DSH 不会修复旧插件或已有异常日志。

> [!IMPORTANT]
> **0.9.0 要求 DSH `>=0.2.0-rc.1 <0.3.0-0`**，开发与实测基线为已发布的 `0.2.0-rc.1`（不是无后缀正式 0.2.0）。新增首屏插件导引、原生插件配置、德语/俄语 Agent 文案和离线更新公告；保留独立蒸馏回合、溯源、冻结快照与零捆绑运行时依赖。**DSH 0.1.7 用户请固定 `dsh-memoir@0.8.2`，先升级宿主再安装 0.9.0。**
>
> `dsh-memoir@0.7.1` 修复重启和内存淘汰后旧会话快照丢失（#10），支持 DSH **0.1.5-rc.1 / rc.2**。要求 `>=0.1.5-rc.1 <0.1.6-0`；请先核对宿主版本。旧 DSH 0.1.2 用户固定使用 `0.6.2`，0.1.1-rc.2 用户固定使用 `0.5.6`；这些旧版未包含本次修复。

```bash
npm install --global @deepseek-ai/dsh@0.2.0-rc.1
dsh plugin --profile web add dsh-memoir@0.9.0
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
| 完整 Web GUI | 中英双语项目/全局浏览、排序搜索、编辑、Hot Memory 预览、诊断和实时设置；可独立选择 Agent 侧中文、英文、德语或俄语 |

适合需要“新 Agent 接手时继续理解项目”的个人或本地开发工作流。它不是原始聊天记录备份、多人云同步服务或向量语义知识库。

### 界面预览

**0.9.0 组件界面预览，使用演示数据。** 顶部常驻插件身份、GitHub、文档与记忆设置入口，无需滚过长列表。

![0.9.0 界面预览：首屏插件导引与记忆浏览](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.9.0/picture/v0.9.0-preview-guide-zh.png)

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
- **Session Snapshot** 按会话持久化冻结注入文本，重启恢复与内存淘汰后仍复用原文。新写入立即可被工具和 GUI 读取，但自动注入从下一个新会话开始更新；恢复失败会显式报告降级。

### 快照恢复与清理（0.7.1）

- 默认目录：`$DSH_HOME/dsh-memoir.json.snapshots/`；自定义 storePath 时为 `<storePath>.snapshots/`。记录按数据源/设置文件的哈希、语言和会话哈希分开保存；按需读取，不在启动时加载全部文件。
- `sessionSnapshotMax` 只限制内存 LRU。磁盘记录无自动 TTL，不随缩容、卸载或清理内存删除；备份记忆时请一起备份该目录。需要回收磁盘时先停止相关 DSH 进程并备份，再人工删除确定不再恢复的记录。删除后再次访问会建立新基线。
- 语言切换使用独立快照空间；切回原语言会复用其旧基线。预算修改仅影响新基线；fork/新 session id 不借用父会话快照。
- 升级前已丢失快照的旧会话，首次使用新版只能按当前记忆建立一次新基线；不从历史 system prompt 猜测截取原文。读取损坏、权限或锁失败时保留原文件，回退到进程内冻结；诊断页和日志会提示重启稳定性降级。
- 单条文本上限 256 KiB，记录上限 2 MiB；超限走同样的可诊断降级。POSIX 新目录/记录使用 0700/0600，Windows 权限仍由目录 ACL 管理。记录含记忆文本，应视为用户数据。
- 本修复消除可恢复快照的重复重建，不能保证提供商仍保留 KV cache 或保证命中率。

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

0.8.2 诊断页区分提醒提交、实际保存、失败、取消、相似记忆待确认和回执降级。只有成功保存的 `memoir_record` / `memoir_update` 才抑制本回合提醒；失败或相似候选待确认不算写入。保存后宿主仍可能取消最终工具结果，因此计数可以重叠。提醒与后续保存的关联不证明因果或内容正确。GUI 手工写入不计入 Agent 工具计数。

0.8.2 使用公开 `sessionProjections` 从日志和 checkpoint 重建当前回合，不再读取弃用的 `snapshotEvents()`。每会话只保留当前回合最多 4096 个调用 ID，不保存参数或正文；超出保留范围时来源降级为 session-only。门控最多保留 1024 个 Agent，销毁时清理；旧版写入没有保存回执，不能仅从历史调用推断成功。BM25 是词项召回，不承诺跨语言语义匹配。

自动蒸馏是可观察的 Agent 收尾提醒，不是后台静默抓取聊天内容。默认 `1 / 0 / 1` 表示：每个有效 worked turn、无额外冷却、至少一次工具调用即可提醒。

> **0.8.2 修复了新回合的蒸馏答案折叠问题（[#13](https://github.com/Qinling-Melon-Farmers/dsh-memoir/issues/13)）**：通过公开 `followup` 排入独立记忆收尾回合，不再用同回合 `steer` 抢占原任务回合的最后一步。短回执、空输出或收尾工具失败都不会改变原任务答复的回合边界；记忆来源仍指向原工作回合。收尾回合不计入 worked-turn 频率，也不会递归触发蒸馏。它仍是可见、可取消的模型收尾，不是无成本后台任务，可能增加会话显示的回合数。
>
> 升级不会改写旧会话：0.8.0 / 0.8.1 产生的同回合折叠历史仍需展开“用时 / 过程”或切到标准（`normal`）模式查看。本修复不改变 DSH 对任意其他同回合追加步骤的答案选择，也不靠“禁止输出”的提示词掩盖问题。

`autoDistillEvery`、`autoDistillCooldownMin`、`autoDistillMinTools` 三个条件按 AND 判定并按 Agent 隔离。idle、aborted、subagent 和已成功保存记忆的回合不会触发；冷却只在提醒成功后更新。所有频率参数都可在 GUI 中即时修改。

`language` 独立控制 Agent 可见的工具描述、参数说明、蒸馏提示、工具结果、Hot Memory / `PROJECT_MEMORY.md` 标题以及校验与治理错误。已发布 0.8.2 支持 `zh` / `en`，默认 `zh`；切换后工具描述与后续提示即时更新，不要求重启 DSH。

**0.9.0新增 `de`（Deutsch）和 `ru`（Русский）**，可在记忆设置中明确选择；不是根据 Agent 或用户消息自动猜测语言。工具名、参数名与枚举不变，GUI 仍为中英双语，既有记忆正文不会自动翻译。切换语言本身不重写 JSON 或 Markdown；后续正常写入时投影标题使用当前语言。四种语言各有独立冻结快照空间，切回原语言可继续复用旧基线。降级到 0.8.2 前请先改回 `zh` 或 `en`。

## 本地召回与缓存

- 中文 2/3-gram + 英文单词 + 代码/路径标识符分词；
- BM25 文档侧保留真实词频，标题 2.5× 加权，另有精确短语、分类与时间权重；
- 标题与正文独立长度归一化；
- project / global / all 共用去重后的全局 Top-K；
- epoch 感知、1 小时时间桶的 LRU 查询缓存；`limit` 与输出详略不进入缓存键，因此不同输出形态共享排序结果；
- GUI 和 `memoir_read` 使用同一个 RetrievalEngine，并暴露 hits、misses、evictions、命中率与最近查询耗时。

0.9.0将词项分割扩展为 Unicode 字母/组合标记/数字并做 NFC 归一化，保留德语变音字符与俄语西里尔字母；不修改原始正文，保留中文和代码标识符规则。它仍是词项检索，不提供自动翻译、词形还原或跨语言语义搜索。

固定质量集的 Top-5 命中率为 100%，仓库门禁要求不低于 90%。

## Web GUI

安装到兼容 DSH 的 `web` profile 后，Memoir 通过官方 slot 注册原生「记忆」会话视图和「记忆」Settings 分区；布局、导航与卸载生命周期均由 DSH shell 管理，不再通过 DOM 选择器接管旧侧边栏。

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
<summary>0.9.0 界面预览：原生插件配置入口与多语言设置</summary>

原生插件详情页直接复用记忆设置，不必先打开记忆列表。下图为 DSH 0.2.0-rc.1 的原生插件详情页。

![0.9.0 原生插件详情配置](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.9.0/picture/v0.9.0-host-plugin-zh.png)

英文 GUI 中也可独立选择德语 Agent 文案；设置与记忆浏览分别滚动。

![0.9.0 界面预览：英文界面选择德语 Agent 文案](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.9.0/picture/v0.9.0-preview-settings-en.png)

</details>

<details>
<summary>已发布历史版本 GUI 截图</summary>

![v0.6.1 按项目折叠的全局记忆](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.1/picture/v0.6.1-global-project-groups-zh.png)

![v0.7.1 在 DSH rc.2 中的快照持久化诊断](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.7.1/picture/v0.7.1-snapshot-persistence-zh.png)

![v0.7.0 在 DSH 0.1.5-rc.1 中的原生记忆设置](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.7.0/picture/v0.7.0-dsh015-settings-zh.png)

![v0.6.2 自动蒸馏生命周期诊断](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.2/picture/v0.6.2-distill-diagnostics-zh.png)

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
| npm `latest`（`0.9.0`） | `>=0.2.0-rc.1 <0.3.0-0` | `dsh plugin --profile web add dsh-memoir@0.9.0` | 实测 0.2.0-rc.1 |
| npm 固定版 `0.8.2` | `>=0.1.7-rc.1 <0.1.8-0` | `dsh plugin --profile web add dsh-memoir@0.8.2` | 旧 0.1.7 兼容线 |
| npm 固定版 `0.7.1` | `>=0.1.5-rc.1 <0.1.6-0` | `dsh plugin --profile web add dsh-memoir@0.7.1` | 旧 0.1.5 维护线 |
| npm 固定版 `0.6.2` | `>=0.1.2-alpha.2 <0.1.3` | `dsh plugin --profile web add dsh-memoir@0.6.2` | 旧 0.1.2 兼容线 |
| npm 固定版 `0.5.6` | `0.1.1-rc.2` | `dsh plugin --profile web add dsh-memoir@0.5.6` | rc2 兼容线 |
| 源码 `v0.9.0` | `>=0.2.0-rc.1 <0.3.0-0` | 本地构建 + `link:` | 开发调试，不兼容旧 0.1.x |

需要 Node.js `^22.19.0 || >=24.0.0`。0.7.1 继续使用原生 `conversation.view` / `settings.section` 与 `snapshotEvents()`。DSH 0.1.5 的会话日志升级至 V3；其迁移与 Memoir 的 store v4 / settings v3 是独立格式。升级 DSH 前备份 DSH_HOME，迁移后的 DSH 会话不能承诺被旧宿主读取。Memoir 本次不迁移或清空记忆，也不启用新动态提示词行为；既有会话快照语义保持不变。

<details>
<summary>从源码安装</summary>

0.9.0 源码（DSH 0.2.0-rc.1）：

```bash
git clone --branch v0.9.0 https://github.com/Qinling-Melon-Farmers/dsh-memoir.git
cd dsh-memoir
pnpm install --frozen-lockfile
pnpm run build
npm install --global @deepseek-ai/dsh@0.2.0-rc.1
dsh plugin --profile web add "link:/absolute/path/dsh-memoir"
```

</details>

0.8.2 使用原生 `uiWorkspace`、`conversation.view` / `settings.section` 与 Session V4 专属蒸馏来源。来源链接打开会话，回合编号可复制；不通过全局 DOM 自动滚到回合。设置页继承宿主背景、卡片使用主题层级色，保留皮肤覆盖与独立滚动。store v4 / settings v3 / snapshot v1 不变。升级 DSH 前备份 DSH_HOME，其会话迁移与插件记忆是两回事。

## 原生侧栏与帮助入口

**已发布 0.8.2：**

- 会话“记忆”和设置页入口保持不变；右侧栏引导页新增“记忆”，可边对话边看项目记忆、Hot Memory 和诊断，不会自动打开或抢占其它面板。
- 侧栏读取所属会话的工作区，复用同一数据层；每个实例独立保存当前功能区和滚动状态。缺少侧栏服务时，会话页和设置页仍可用。
- 任一记忆面板的“记忆设置”底部提供默认折叠的“关于与帮助”：显示插件版本、宿主范围、SDK 基线、维护者，以及仓库、双语文档、Release、反馈链接。插件仓库与当前工作区明确区分。
- 关于区不后台联网、不探测工作区 Git remote、不上传路径或记忆内容。更新通过宿主插件管理器操作，先核对目标包要求的 DSH 版本和预发布通道；本面板不自动升级。

**0.9.0：**

- 插件名、版本、GitHub 项目、文档和“打开记忆设置”前移到面板顶部，打开会话、设置或右侧记忆面板即可看到，无须先滚过记忆或设置列表。详细兼容信息保持折叠，不强制跳转或请求 Star。
- 原生“插件”页面中打开 `dsh-memoir` 详情，即可使用同一套记忆设置表单；不另建一份配置，不向官方插件分组冒充注册。宿主没有此页面时，原有记忆入口仍可用。
- 开发 SDK 与兼容性基线升级到官方 npm `0.2.0-rc.1`；安装前核对宿主版本。旧 DSH 0.1.7 请固定安装 Memoir 0.8.2。

## 离线更新公告

首次打开记忆会话页时展示 0.9.0 更新摘要，不阻塞对话；点击“知道了”后，同一浏览器 origin 的本版本不再自动展示。“关于与帮助 → 查看本版更新”可随时重看。设置页和右侧栏不会自动弹出公告。

公告随包内置、中英双语，不联网、不上传信息、不改变记忆或对话。仅在 UI 本地存储记录已确认版本；存储不可用时退化为当前页面去重，Web/桌面端或不同 origin 的确认状态不承诺同步。

![0.9.0 离线公告组件预览（演示数据）](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.9.0/picture/v0.9.0-announcement-zh.png)

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
| `language` | `zh` | Agent 文案语言；0.8.2 为 `zh` / `en`，0.9.0 新增 `de` / `ru`；与 GUI 语言独立 |
| `announceToAgent` | `true` | 向 Agent 公告记忆工具与规则 |
| `autoDistill` | `true` | 启用顶层有效回合收尾提醒 |
| `autoDistillEvery` | `1` | 每 N 个 worked turn 最多提醒一次 |
| `autoDistillCooldownMin` | `0` | 两次成功提醒的最短分钟间隔 |
| `autoDistillMinTools` | `1` | 触发回合所需的最少工具调用数 |
| `hotMemoryTokens` | `900` | Hot Memory 常规目标预算 |
| `hotMemoryMaxTokens` | `1200` | 任何会话都不能超过的硬上限 |
| `readDefaultLimit` | `8` | `memoir_read` 默认结果数 |
| `readMaxLimit` | `30` | 单次召回实时上限 |
| `sessionSnapshotMax` | `128` | 内存快照 LRU 容量，不删除磁盘快照 |
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

自动化回归覆盖会话投影恢复、跨进程快照、写入与取消、生命周期清理、BM25 召回、Hot Memory 预算、缓存、纠错与跨项目隔离。固定词项样本的 Top-5 召回为 41/41；样本结果不代表真实模型的语义正确率，前缀一致性也不等同于实际账单节省保证。

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

提交前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。版本变化见 [CHANGELOG.md](./CHANGELOG.md)，正式包由 tag 工作流通过 npm OIDC 发布。当前版本是 [v0.9.0](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.9.0)，面向 DSH 0.2.0-rc.1；旧 0.1.7 固定 0.8.2，旧 0.1.5 固定 0.7.1。

Apache-2.0
