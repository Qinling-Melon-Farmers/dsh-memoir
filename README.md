# dsh-memoir

[![npm version](https://img.shields.io/npm/v/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)

[English](./README.en.md) · 中文 · [更新日志](./CHANGELOG.md) · [GitHub Releases](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases)

**dsh-memoir 是 DeepSeek Harness 的本地项目记忆层：把 Agent 的工作结论、经验教训和后续行动持久化，并通过有界 Hot Memory 自动继承、按需排序召回和 Web GUI 管理，实现跨会话项目记忆。**

> Cache-aware local project memory for DeepSeek Harness.

- **Local-only**：全部数据留在本机（`~/.dsh/dsh-memoir.json` + 项目内 `PROJECT_MEMORY.md`）
- **零普通运行时依赖**：npm 包没有 `dependencies`，核心逻辑只依赖 DSH 平台契约与 Node.js 标准库
- **Zero external memory service**：无向量数据库、无 embedding API、无云端记忆服务
- **Bounded hot-memory injection**：token 预算内的 Hot Memory 自动注入 system prompt（默认 900/1200）
- **Ranked local recall**：倒排索引 + BM25 本地排序召回，`memoir_read` 按需检索长尾历史
- **可追溯且防重复**：记录可信 session/turn 来源；写入前解释疑似重复或冲突，由用户/Agent 显式选择更新、替代或并存
- **Web GUI**：中英双语侧边栏面板——完整生命周期编辑、项目/全局浏览、BM25 搜索、Hot Memory、诊断和实时设置

## Quick Start

```bash
# 从 npm 安装到 web profile（推荐）
dsh plugin --profile web add dsh-memoir

# 或从 GitHub 安装最新源码
dsh plugin --profile web add github:Qinling-Melon-Farmers/dsh-memoir

# 或本地开发（克隆后）
dsh plugin --profile web add link:/绝对路径/dsh-memoir
```

安装后重启 DSH 生效（`dsh web`）。正常使用即可：

```text
正常使用 Agent
      ↓
有实际工作的回合结束自动提醒归纳
      ↓
memoir_record 沉淀工作 / 教训 / 下一步
      ↓
未来 session 自动继承 Hot Memory（有界、排序、会话内冻结）
      ↓
需要长尾历史时 memoir_read（本地相关性排序召回）
```

## Architecture

```text
                   ~/.dsh/dsh-memoir.json
                            │
                            │ SSOT（单一事实源）
                            ▼
                      MemoirStore
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
        PROJECT_MEMORY.md          Retrieval Index
         human-readable             ranked recall
         （git 可提交）                   │
              │                           ▼
              │                       memoir_read
              │                       GUI /search
              │
              ▼
       Hot Memory Selector
         （token 预算）
              │
              ▼
       Session Snapshot
         （每会话冻结）
              │
              ▼
         System Prompt
```

## Memory Model：Full Memory vs Hot Memory

**Full Memory（完整历史）**——结构化 JSON SSOT + 自动重新生成的 `PROJECT_MEMORY.md` 投影。用途：完整历史、GUI 浏览、git 提交、人工检查、排序召回的数据源。

**Hot Memory（有界注入）**——selector 在 token 预算内选出的高价值记忆，注入 system prompt。特点：**bounded / ranked / compact / session-frozen**。

> v0.4+ 不再把完整 PROJECT_MEMORY.md 注入模型：Hot Memory 进 prompt，长尾历史走排序召回。

**Session Snapshot 冻结语义**：同一 session 的注入文本只构建一次并冻结（prompt 前缀稳定，最大化 prompt-prefix cache 命中）；当前 session 不重新消费自己刚写的记忆，新 session 重建并看到最新记忆。v0.4.2 起，没有唯一会话身份（session.id / agent.id）时**不做冻结**——宁可 cache miss，不可跨 session 错复用旧快照。

## v0.5.6 来源追踪、相似记忆治理与 Web 体验

- 存储格式 v4 为 Agent 写入保存可信 `source.sessionId` / `source.turnId`；旧顶层 `sessionId` 懒兼容，只有下一次真实写入才持久化新格式。
- Web 条目卡可复制来源，并尽力打开原会话、定位对应 turn；浏览器手工新增不能伪造可信来源。
- `memoir_record` 与 Web 手工新增在落盘前复用 BM25 找候选，再融合标题相似度和 Token Jaccard，只提示疑似重复/冲突，不自动更改数据。
- 候选出现时必须显式选择 `update`、`supersede` 或 `force-record`；界面同时展示 BM25、标题、Jaccard 分量与命中理由，目标 ID 必须属于当前候选。
- Settings → Web UI 插件中的设置项已对齐 dsh-web-ui 家族卡片并默认折叠；记忆面板统一为一个纵向滚动区，展开设置、Hot Memory 和诊断后仍可连续向下滚动。
- 发布工作流固定优先使用 npm OIDC，`NPM_TOKEN` 只作临时回退；旧 token 过期不会再抢占正常 trusted publishing。

## v0.5.5 侧栏视觉一致性修复

- 修复样式标记冲突：其他同名 `data-plugin` 样式不再导致 Memoir 跳过自身 CSS 注入，插件样式改由唯一 `data-dsh-memoir-style` 标识并随插件卸载清理。
- 与 dsh-web-ui-all 0.3.x 的任务看板和技能中心使用同一侧栏几何：36px 行高、10px 水平内边距、24px 图标盒、18px SVG、8px 图文间距。
- 收起态统一为 36px 圆形入口和 12px 行间距，隐藏文字但保留本地化 `aria-label` / tooltip；开放书图标继续与技能中心图标区分。
- Playwright 实机断言同时比较宽屏与收起态的 row/icon/svg/label 坐标、盒尺寸、字体和颜色，不再仅凭截图判断。

## v0.5.4 完整 GUI、双语设置与 Web UI 适配

- 当前开发基线为 `@deepseek-ai/dsh-* 0.1.1-rc.2`；peer dependency 与开发依赖已统一到 rc2。
- 新增/编辑表单现已完整覆盖 `importance`、`pinned`、`tags` 与 `supersedes`；列表显示重要度、标签和替代关系，并新增 section 筛选。
- 「记忆设置」同时出现在记忆面板和 Settings → Web UI 插件，覆盖 agent 注入、自动蒸馏、Hot Memory、召回、会话快照与 BM25 查询缓存。
- 保存后的所有设置实时生效并持久化到 `~/.dsh/dsh-memoir.settings.json`；v1 设置文件兼容读取，首次保存再升级到 v2。
- GUI 根据 DSH 的 `<html lang>` 在中文/英文之间即时切换，无需刷新；侧栏入口、面板和 Settings 卡保持同一语言。
- 面板与侧栏输出 `data-dsh-plugin="memoir"` / `data-dsh-part` 语义属性，支持 dsh-web-ui v0.3 皮肤契约；侧栏挂载具备幂等和整棵 shell 重建自愈。
- 中心面板通过通用 `dsh-panel-activate` 协议响应任意兄弟面板，不再只识别 SSH / Task Board。
- 自动蒸馏继续支持按 agent 配置 worked-turn 间隔、时间冷却和工具调用阈值；默认值 `1 / 0 / 1` 与旧版行为一致。
- 存储格式从 v2 迁移到 v3：旧条目保持原有 `id`、内容和时间，首次变更时补齐 `importance`、`pinned`、`status`、`supersedes` 与 `tags`；启动读取不会重写旧文件。
- 默认只召回 `active` 条目；归档和被替代条目保留在历史中，可在 Web 面板切换状态查看。显式 `supersedes` 会把目标条目标记为 `superseded`，不会自动删除历史。
- Agent 可用 `memoir_update` 原地编辑条目的分类、标题、正文和生命周期；Web 面板也支持编辑、置顶、标记过时、归档与恢复。
- `PROJECT_MEMORY.md` 是人类可读投影；system prompt 只注入有界 Hot Memory，完整文件不会整体注入。
- GET 路由不再把浏览器传入的路径登记为活动工作区；只有可信 system-prompt cwd 才能获得面板写权限。锁文件现在带 pid、创建时间和 nonce，只在超过 60 秒且 pid 已死亡时保守回收。
- `memoir_read(scope: 'all')` 使用去重后的全局排序结果，避免当前项目与全局结果重复。

## Tools

| 工具 | 作用 |
| --- | --- |
| `memoir_record` | 写入 work / lessons / actions / note；写前检查相似记忆，并用 `update` / `supersede` / `force-record` 显式治理 |
| `memoir_update` | 保留 id 和创建时间，更新既有条目的内容、分类、标签与生命周期；可用 `supersedes` 标记被替代历史 |
| `memoir_read` | project（默认）/ global / all 的本地相关性检索，limit + compact/full 输出形态 |

`memoir_read` 的 query 描述与真实行为一致：**本地相关性检索标题与正文，支持中文短语、英文关键词、代码标识符与路径，并按相关性排序**。

## Retrieval

- 无 embedding、无向量库、无外部记忆服务
- 中文 2/3-gram + 英文单词 + 代码/路径标识符分词
- BM25（文档侧保留真实 term frequency；query 侧去重）
- 标题 2.5× 加权、精确短语加权、分类权重、时间衰减
- 标题与正文各自独立的长度归一化（v0.4.2）
- epoch 感知 + 1 小时 time-bucket 的 LRU 查询缓存：limit/detail 不参与缓存键，所有输出形态共享同一份排序结果（v0.4.2）
- Query cache 指标（hits/misses/evictions/hit rate）与 Last Query（latency/candidates/returned）可观测（v0.4.2）
- 全局 recall 的 limit 是真正全局 Top-K，输出截断保留高分头部（v0.4.2）
- 写入治理先取当前项目 active 记忆的 BM25 Top-24 候选，再融合查询内归一化 BM25、标题相似度和 Token Jaccard；最多返回 5 条可解释候选（v0.5.6）

curated 查询 Top-5 命中率 100%（质量门禁 ≥90%，见 `test/recall-quality.test.ts`）。

## GUI

Project / Global / Search / Add / Delete / Diagnostics 架构已经扩展为完整管理面：

- **搜索统一走 RetrievalEngine**：query 非空时面板调用 `GET /api/dsh-memoir/search`，与 agent 的 `memoir_read` 共用同一套 BM25 排序，结果按相关性排列并显示分数
- **Hot Memory Inspector**：展开查看当前工作区实际会被注入的 Hot Memory（Actions / Lessons / Recent state），即「下一会话到底自动继承什么」
- **Retrieval Diagnostics**：Retrieval Index（docs/terms/epoch）、Query Cache（hits/misses/evictions/hit rate/size/capacity）、Last Query（latency/returned）、Session Snapshot（hash/createdAt/storeRevision）
- **完整生命周期表单（v0.5.4）**：新建与编辑均支持分类、标题、正文、重要度、置顶、标签和显式替代关系；支持状态与分类双重筛选
- **完整实时设置（v0.5.4）**：agent 注入、auto-distill、Hot Memory 目标/硬上限、读取默认/最大条数、会话快照和查询缓存均可即时调整
- **Settings 集成（v0.5.4）**：同一双语设置卡同时挂载到记忆面板和 Settings → Web UI 插件；页面切换语言时即时重绘
- **视觉与 dsh-web-ui 家族一致（v0.5.5）**：面板、侧栏入口与表单/卡片/标签页共用 `--dsw-alias-*` / `--dsw-specific-*` / `--dsw-font-family` 设计令牌（保留独立安装回退），与 dsh-web-ui-all 的 task-board / ssh / skill-explorer 同族；中心列面板互斥协议已对齐。
- **来源与相似记忆治理（v0.5.6）**：显示/copy/jump session 与 turn 来源；新增时展示重复/冲突候选、三项相似度分量、理由和三种显式处理动作
- **设置页与滚动修复（v0.5.6）**：Settings 卡默认折叠并使用家族卡片结构；面板只保留一个滚动所有者，列表、设置、Hot Memory 与诊断不会再互相遮挡

## 界面预览

**v0.5.6 Settings 卡**：Settings → Web UI 插件中的 Memoir 卡默认折叠，标题、描述、间距、圆角和箭头与同组插件一致。

![v0.5.6 Settings 卡](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.6-settings-card-zh.png)

**v0.5.6 连续滚动**：记忆设置、Hot Memory 预览与诊断共用面板唯一滚动区；截图中的 Hot Memory 为脱敏演示文本。

![v0.5.6 记忆面板连续滚动](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.6-memory-scroll-zh.png)

**v0.5.5 侧栏一致性**：记忆入口与任务看板、SSH、技能中心在行高、水平位置、图标盒和 SVG 尺寸上保持一致。

![v0.5.5 侧栏一致性](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.5/picture/v0.5.5-sidebar-parity-zh.png)

**v0.5.4 记忆管理**：重要度、标签、替代关系、状态/分类筛选与完整生命周期操作集中在同一面板。

![v0.5.4 记忆管理](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.4/picture/v0.5.4-memory-management-zh.png)

**v0.5.4 完整实时设置**：Settings → Web UI 插件中的中文设置卡；README English 展示同一卡片的英文实时切换效果。

![v0.5.4 完整实时设置](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.4/picture/v0.5.4-settings-zh.png)

以下图片保留早期版本的功能演进记录：

**1. 插件生效与整体 UI**：侧边栏出现「记忆」入口（与 SSH / 任务看板同列、互斥展开），点击后在中心列打开记忆面板。

![插件生效与整体 UI](picture/插件生效和UI效果1.png)

**2. 项目记忆**：当前项目会话的持久记忆按 工作记录 / 经验教训 / 行动指南 / 备注 分组展示，每条带时间、分类标签、标题、正文与会话来源，支持检索、刷新与逐条删除。

![项目记忆](picture/项目记忆2.png)

**3. 手动添加记忆**：表单选择分类、填写一句话标题与正文，与 agent 的 `memoir_record` 写入同一份数据，提交后 `PROJECT_MEMORY.md` 自动重新生成。

![手动添加记忆](picture/手动添加记忆3.png)

**4. 全局记忆管理**：所有项目的记忆桶（项目名、路径、更新时间、条数），跨项目检索与逐条维护。

![全局记忆管理](picture/全局记忆管理4.png)

**5. 排序搜索 + Hot Memory 预览 + 记忆诊断（v0.4.2）**：搜索框输入 query 后走 RetrievalEngine 排序召回，每条结果带相关性分数；底部可展开「Hot Memory 预览」（查看当前工作区下一会话将自动继承的内容）与扩展后的 Memory Diagnostics（Retrieval 索引 / Query cache / 最近查询 / 会话快照）。

![排序搜索与 Hot Memory 预览 / 记忆诊断](picture/hot%20memory预览与记忆诊断5.png)

## Storage & Privacy

```text
~/.dsh/dsh-memoir.json   ← 结构化 JSON v4（唯一事实源 / SSOT，含可信 session/turn 来源）
~/.dsh/dsh-memoir.settings.json ← 两个 GUI 设置面保存的完整运行时覆盖
<工作区>/PROJECT_MEMORY.md ← 由 JSON 重新生成的人类可读投影（git 友好）

No cloud memory DB · No embedding API · No vector DB
```

JSON 是 source of truth，Markdown 是 generated projection：面板、工具、agent 三条路径写同一份数据。v0.4.2 起，面板写 API 还受工作区授权保护——浏览器提交的绝对路径不等于授权，仅当前活动 cwd 或已有 store 项目可写。

## Configuration

在 `cordis.patch.yml` 的行上可加 `config`（全部可省略，默认值如下）：

```yaml
- insert:
    - id: memoir
      name: dsh-memoir
      config:
        enabled: true            # 总开关（工具、路由、注入段）
        announceToAgent: true    # system prompt 公告段
        autoDistill: true        # 每轮有实际工作的回合结束自动提醒归纳
        autoDistillEvery: 1      # 每 N 个 worked turn 最多提醒一次
        autoDistillCooldownMin: 0 # 两次成功提醒之间至少间隔 M 分钟
        autoDistillMinTools: 1   # 触发提醒的 turn 至少包含 K 次工具调用
        hotMemoryTokens: 900     # Hot Memory 目标 token 数
        hotMemoryMaxTokens: 1200 # Hot Memory 硬上限（永不超过）
        readDefaultLimit: 8      # memoir_read 默认返回条数
        readMaxLimit: 30         # memoir_read 最大返回条数
        sessionSnapshotMax: 128  # 每会话快照的 LRU 上限
        queryCacheSize: 128      # 排序查询的 LRU 缓存大小
```

三个 auto-distill 频率条件按 AND 关系判定并按 agent 隔离。idle、aborted、subagent、已调用 `memoir_record` 的 turn 不推进间隔计数；低于 `autoDistillMinTools` 的 worked turn 会推进间隔，但自身不能触发提醒。冷却只在 steer 成功后更新。

`cordis.patch.yml` 中的字段是启动默认值。v0.5.4 起，可从记忆面板或 Settings → Web UI 插件修改除总开关 `enabled` 外的全部运行时字段：保存会原子写入 `~/.dsh/dsh-memoir.settings.json`，后续请求或 turn 立即读取；缩小快照/查询缓存容量会立即淘汰最旧项。已冻结的 session snapshot 不会因预算变化而重写，以继续保证 prompt-prefix cache 稳定。「恢复启动配置」会删除 Web 覆盖并回到本次挂载时解析出的 profile 值。

## Design Trade-offs

- **有界注入 vs 全量注入**：v0.3 把完整历史注入 prompt，越用越膨胀；v0.4+ 只注入预算内的 Hot Memory，长尾历史按需召回。token 基准见下方 Benchmark。
- **冻结 vs 新鲜**：session 内冻结注入文本换取 prompt-prefix cache 命中；没有唯一会话身份时不冻结（v0.4.2），保证新 session 一定看到新记忆。
- **Hot Memory 配额**：Recent state（最新 work，1~3 条）保底、actions/lessons 排名填充，work 只进 Recent state 不重复注入（v0.4.2）。
- **多进程安全**：store 的 record/remove 走 `~/.dsh/dsh-memoir.lock` 跨进程临界区（O_EXCL 独占创建 + 超时），临界区内强制从磁盘重读再改，两个 DSH 进程交错写入不丢更新（v0.4.2）。
- **Windows 路径**：canonical key 全小写（`C:\A` / `c:\a\` / `C:/A` 一个桶），display path 保留原始大小写（v0.4.2）。
- **GUI 与 Agent 同源**：面板搜索与 `memoir_read` 共用 RetrievalEngine，不再各写一套过滤逻辑（v0.4.2）。
- **自动收尾节奏**：默认仍逐 worked turn 提醒；研究型会话可组合轮次间隔、冷却与活动阈值降低打扰，并从两个 GUI 设置面即时调节（v0.5.4）。
- **相似治理而非自动合并**：词法相似度只能发现候选，不能可靠判断语义真伪；因此 v0.5.6 固定由调用者在更新、替代和并存之间显式选择。

## Use Cases

| 场景 | 怎么用 |
| --- | --- |
| 反复出现的环境坑（乱码 / 转义 / 路径 / 权限） | 解决后记一条 `lessons`，附可复制的修复命令 |
| 项目红线与约定（禁 emoji、发布前跑测试、分支规范） | 记入 `actions`，自动注入给接手者 |
| 难查 bug 的根因与结论 | 记入 `lessons` / `work`，避免重复排查 |
| 部署 / 上线的固定步骤清单 | 记入 `actions`，新会话照单执行 |
| 跨项目复用经验 | 面板全局 tab 或 `memoir_read(scope: 'global', query: ...)` |

典型例子：第一次解决「控制台中文乱码」后把诊断结论与修复步骤记成一条 lessons（如 `先 chcp 65001 …写文件一律 UTF-8 无 BOM`），此后本项目每个新会话都自动继承这条经验，不再重复排查；跨项目用全局检索也能命中。记忆插件做的是把「根因 + 修复命令」沉淀为项目知识，不负责根治终端本身的编码缺陷。

## Comparison

| 项目 | 主要定位 |
| --- | --- |
| dsh-memory | citation / 来源可追溯的引用式记忆 |
| dsh-mnemon | 更重的长期记忆体系 |
| distill | 会话蒸馏成 skill |
| **dsh-memoir** | **轻量的项目工作流记忆：本地、有界注入、排序召回** |

各插件定位不同，按需选择，不做谁强谁弱的比较。

## Development / Benchmark / Tests

```bash
pnpm install          # 安装 devDeps（typescript、esbuild、@deepseek-ai/* 类型包）
pnpm run build        # tsc 构建 host + esbuild 构建 client bundle
pnpm run typecheck    # 全量类型检查（src + test）
pnpm test             # 171 项测试：store/迁移/锁、settings、snapshot、selector、BM25/相似治理、tools/routes、自动收尾、GUI/滚动/双语、集成、bundle 与发布说明
npm run bench         # benchmark（100/1k/10k/100k 条目），结果写入 bench/report.md
```

质量门禁：**Top-5 recall ≥ 90% · Hot Memory ≤ 配置 hardMax · 同会话 prompt 前缀稳定 · 全局召回 ≤ limit · 多进程写入零丢失**。

v0.5.6 benchmark 摘要（2026-08-27，node v24.19.0，budget 900/1200 tokens；完整报告见 `bench/report.md`。uncached 查询直测 `search()`、cached 查询先预热同一 query 再计时）：

| 条目数 | 冷加载 | 热读取 | Hot Memory 构建 | 索引构建 | 未缓存查询 | 缓存查询 | 缓存命中率 | 全量 markdown tokens | 注入 tokens | 降幅 |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 0.9 ms | 0.95 µs | 0.46 ms | 2.1 ms | 0.169 ms | 2.21 µs | 50.0% | 3908 | 902 | 76.9% |
| 1,000 | 3.0 ms | 0.35 µs | 0.58 ms | 10.5 ms | 1.190 ms | 4.07 µs | 50.0% | 38220 | 916 | 97.6% |
| 10,000 | 26.4 ms | 0.35 µs | 2.05 ms | 126.9 ms | 11.011 ms | 1.45 µs | 50.0% | 385845 | 902 | 99.8% |
| 100,000 | 210.7 ms | 0.51 µs | 20.11 ms | 1679.9 ms | 126.933 ms | 1.42 µs | 50.0% | 3907095 | 917 | 100.0% |

## 实现说明

- **TypeScript 全栈**：`src/host/*.ts`（store / settings / tools / retrieval / similarity / governance / selector / snapshot / routes / autodistill / index，tsc 构建出 `lib/*.js`）+ `src/client/*.ts(x)`（esbuild 打出 `lib/client.js` 闭包工厂 bundle）。
- **双面插件**：host 半注册 agent 工具、`/api/dsh-memoir` 路由、`agent/turn-stopping` 自动收尾监听与按项目求值的 system prompt 注入段；client 半提供面板。运行时仅依赖官方 NPM SDK。
- 通过 `dsh.bundle.patch` manifest（`cordis.patch.yml` 的 `insert` 行）挂载，不改 DSH 源码。
- 自动收尾安全边界：仅顶级会话（跳过 subagent / 嵌套委托）、仅「有工具调用且未记录过」的回合、已中止回合不打扰、每回合至多一次。

## 贡献

PR 与 Issue 采用模板化 + 自动化管理：

- [CONTRIBUTING.md](CONTRIBUTING.md) — PR 范围、提交规范与检查清单；
- [ISSUE_TRIAGE.md](ISSUE_TRIAGE.md) — Issue 标签体系、分类与关闭标准；
- `.github/ISSUE_TEMPLATE` — Bug / 功能请求模板；`.github/pull_request_template.md` — PR 模板。

Bug 报告需附截图 / 日志证据、冒烟测试、引用代码与补丁；全新功能与仅文档类
PR 请先提 Issue 讨论。

## Release

当前稳定版：**v0.5.6**（2026-08-27） · [GitHub Release](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.5.6) · [npm](https://www.npmjs.com/package/dsh-memoir/v/0.5.6)。完整历史见 [CHANGELOG.md](./CHANGELOG.md)。

每个版本的更新日志均同步维护中英文；GitHub Release 默认展开中文，英文说明收纳在可折叠的 `English` 区域。

版本发布由 `.github/workflows/publish.yml` 在 `v*` tag 推送后自动执行：安装依赖、校验 tag 与 `package.json` 版本一致、运行 typecheck/test、发布 npm，并创建同 tag 的 GitHub Release 和 tarball 资产。认证固定为 OIDC 优先、token 回退：

- npm Trusted Publishing：GitHub 仓库 `Qinling-Melon-Farmers/dsh-memoir`，workflow `publish.yml`
- GitHub Actions secret `NPM_TOKEN`：可选回退，使用具有发布权限且允许绕过发布 2FA 的 granular token；只在 OIDC 失败且该版本尚未发布时读取

发布 patch 版本：

```bash
npm version patch
git push
git push origin vX.Y.Z  # 使用 npm version 输出的实际版本号
```

`npm version patch` 会修改 `package.json`、创建版本提交并创建对应 tag；无需再次执行 `git tag` 或在本机执行 `npm publish`。

## 许可

Apache-2.0
