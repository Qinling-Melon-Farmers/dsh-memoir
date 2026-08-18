# dsh-memoir

[![npm version](https://img.shields.io/npm/v/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)

[English](./README.en.md) · 中文

**dsh-memoir 是 DeepSeek Harness 的本地项目记忆层：把 Agent 的工作结论、经验教训和后续行动持久化，并通过有界 Hot Memory 自动继承、按需排序召回和 Web GUI 管理，实现跨会话项目记忆。**

> Cache-aware local project memory for DeepSeek Harness.

- **Local-only**：全部数据留在本机（`~/.dsh/dsh-memoir.json` + 项目内 `PROJECT_MEMORY.md`）
- **Zero external memory service**：无向量数据库、无 embedding API、无云端记忆服务
- **Bounded hot-memory injection**：token 预算内的 Hot Memory 自动注入 system prompt（默认 900/1200）
- **Ranked local recall**：倒排索引 + BM25 本地排序召回，`memoir_read` 按需检索长尾历史
- **Web GUI**：侧边栏「记忆」面板——项目/全局浏览、相关排序搜索、Hot Memory Inspector、Retrieval Diagnostics

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

## Tools

| 工具 | 作用 |
| --- | --- |
| `memoir_record` | 写入 work（工作记录）/ lessons（经验教训）/ actions（行动指南）/ note（备注） |
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

curated 查询 Top-5 命中率 100%（质量门禁 ≥90%，见 `test/recall-quality.test.ts`）。

## GUI

保留 v0.4 的 Project / Global / Search / Add / Delete / Diagnostics 架构，v0.4.2 起：

- **搜索统一走 RetrievalEngine**：query 非空时面板调用 `GET /api/dsh-memoir/search`，与 agent 的 `memoir_read` 共用同一套 BM25 排序，结果按相关性排列并显示分数
- **Hot Memory Inspector**：展开查看当前工作区实际会被注入的 Hot Memory（Actions / Lessons / Recent state），即「下一会话到底自动继承什么」
- **Retrieval Diagnostics**：Retrieval Index（docs/terms/epoch）、Query Cache（hits/misses/evictions/hit rate/size/capacity）、Last Query（latency/returned）、Session Snapshot（hash/createdAt/storeRevision）

## 界面预览

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
~/.dsh/dsh-memoir.json   ← 结构化 JSON（唯一事实源 / SSOT）
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
        hotMemoryTokens: 900     # Hot Memory 目标 token 数
        hotMemoryMaxTokens: 1200 # Hot Memory 硬上限（永不超过）
        readDefaultLimit: 8      # memoir_read 默认返回条数
        readMaxLimit: 30         # memoir_read 最大返回条数
        sessionSnapshotMax: 128  # 每会话快照的 LRU 上限
        queryCacheSize: 128      # 排序查询的 LRU 缓存大小
```

## Design Trade-offs

- **有界注入 vs 全量注入**：v0.3 把完整历史注入 prompt，越用越膨胀；v0.4+ 只注入预算内的 Hot Memory，长尾历史按需召回。token 基准见下方 Benchmark。
- **冻结 vs 新鲜**：session 内冻结注入文本换取 prompt-prefix cache 命中；没有唯一会话身份时不冻结（v0.4.2），保证新 session 一定看到新记忆。
- **Hot Memory 配额**：Recent state（最新 work，1~3 条）保底、actions/lessons 排名填充，work 只进 Recent state 不重复注入（v0.4.2）。
- **多进程安全**：store 的 record/remove 走 `~/.dsh/dsh-memoir.lock` 跨进程临界区（O_EXCL 独占创建 + 超时），临界区内强制从磁盘重读再改，两个 DSH 进程交错写入不丢更新（v0.4.2）。
- **Windows 路径**：canonical key 全小写（`C:\A` / `c:\a\` / `C:/A` 一个桶），display path 保留原始大小写（v0.4.2）。
- **GUI 与 Agent 同源**：面板搜索与 `memoir_read` 共用 RetrievalEngine，不再各写一套过滤逻辑（v0.4.2）。

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
pnpm test             # 131 项测试：store（含多进程锁） / snapshot / selector / retrieval / tools / routes / 自动收尾 / 集成 / client 纯逻辑 / bundle 协议与纯净性
npm run bench         # benchmark（100/1k/10k/100k 条目），结果写入 bench/report.md
```

质量门禁：**Top-5 recall ≥ 90% · Hot Memory ≤ 配置 hardMax · 同会话 prompt 前缀稳定 · 全局召回 ≤ limit · 多进程写入零丢失**。

v0.4.2 benchmark 摘要（node v22.23.2，budget 900/1200 tokens；完整报告见 `bench/report.md`。方法已修正：uncached 查询直测 `search()`、cached 查询先预热同一 query 再计时）：

| 条目数 | 冷加载 | 热读取 | Hot Memory 构建 | 索引构建 | 未缓存查询 | 缓存查询 | 缓存命中率 | 全量 markdown tokens | 注入 tokens | 降幅 |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 1.3 ms | 2.22 µs | 0.54 ms | 2.9 ms | 0.224 ms | 2.87 µs | 50.0% | 3870 | 902 | 76.7% |
| 1,000 | 1.6 ms | 0.40 µs | 0.70 ms | 15.0 ms | 1.419 ms | 1.45 µs | 50.0% | 38182 | 916 | 97.6% |
| 10,000 | 25.3 ms | 0.42 µs | 2.60 ms | 142.9 ms | 11.889 ms | 1.14 µs | 50.0% | 385807 | 902 | 99.8% |
| 100,000 | 158.2 ms | 0.42 µs | 31.97 ms | 2238.7 ms | 153.551 ms | 1.15 µs | 50.0% | 3907057 | 917 | 100.0% |

## 实现说明

- **TypeScript 全栈**：`src/host/*.ts`（store / tools / retrieval / selector / snapshot / routes / autodistill / index，tsc 构建出 `lib/*.js`）+ `src/client/*.ts(x)`（esbuild 打出 `lib/client.js` 闭包工厂 bundle）。
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

版本发布由 `.github/workflows/publish.yml` 在 `v*` tag 推送后自动执行：安装依赖、校验 tag 与 `package.json` 版本一致、运行 typecheck/test，再发布到 npm。仓库需配置以下任一认证方式：

- npm Trusted Publishing：GitHub 仓库 `Qinling-Melon-Farmers/dsh-memoir`，workflow `publish.yml`
- GitHub Actions secret `NPM_TOKEN`：使用具有发布权限且允许绕过发布 2FA 的 granular token

发布 patch 版本：

```bash
npm version patch
git push
git push origin vX.Y.Z  # 使用 npm version 输出的实际版本号
```

`npm version patch` 会修改 `package.json`、创建版本提交并创建对应 tag；无需再次执行 `git tag` 或在本机执行 `npm publish`。

## 许可

Apache-2.0
