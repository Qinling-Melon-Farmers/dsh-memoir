# dsh-memoir

把「一个会话做了什么 / 踩了什么坑 / 下一步怎么走」沉淀为**项目持久化记忆**，并作为**未来 AGENTS 的行动指南**自动注入后续会话；插件开启后**每轮有实际工作的回合结束时自动提醒 agent 归纳沉淀**，另有 Web GUI 可视化面板浏览、检索与维护记忆。

- **自动收尾（auto-distill）**：监听 `agent/turn-stopping`，一轮有工具调用、且尚未记录过记忆的回合结束时，自动 steer 一句归纳提示，让 agent 用 `memoir_record` 把该轮工作沉淀为项目记忆（无实质工作的回合不打扰、子代理会话不打扰、每回合最多一次）。
- **归纳总结**：`memoir_record` 归纳工作记录、经验教训与行动指南。
- **持久记忆**：项目级写入 `<工作区>/PROJECT_MEMORY.md`（随 git 提交）；结构化源数据存全局索引 `~/.dsh/dsh-memoir.json`（跨项目检索）。
- **自动行动指南**：新会话开始时，插件把本项目的 `PROJECT_MEMORY.md` 自动注入 system prompt，未来 AGENTS 无需手翻文档即可继承既往经验。
- **可视化面板**：侧边栏「记忆」入口，中心面板提供项目 / 全局两个视图、全文检索、手动记录与删除。

## 设计背景

DSH 的 agent 会话本身是「失忆」的：新会话不记得上一个会话踩过的坑。现实中的典型代价是**反复排查同类问题**——控制台中文乱码要查一次、某个终端的转义错误要查一次、某个工具的环境配置又要查一次；`AGENTS.md` 这类人工维护的说明文件要么没人更新、要么被塞得臃肿。社区已有的记忆类插件各有侧重：`dsh-memory` 侧重无损引用式检索、`dsh-mnemon` 依赖外部 Mnemon 服务、`distill` 自动蒸馏但落成 skill 文件、缺少可视化面板。

dsh-memoir 想补的是一个**开箱即用、纯本地、零外部依赖**的记忆层，把「记录 → 存储 → 自动注入 → 可视化维护」串成闭环：

1. **记录**：agent 在任务收尾调用 `memoir_record`（或插件每轮工作结束自动提醒）；
2. **存储**：结构化 JSON 全局索引为源，`PROJECT_MEMORY.md` 为可读渲染（随 git 提交、人也能看）；
3. **注入**：新会话开始时按项目自动注入记忆，未来 AGENTS 无需手翻文档即继承经验；
4. **维护**：Web 面板可检索、补录、删除，与 agent 写的是同一份数据。

## 能力

| 工具 | 作用 |
| --- | --- |
| `memoir_record(section, title?, content)` | 记录一条记忆，`section` 取值 `work` / `lessons` / `actions` / `note` |
| `memoir_read(scope?, section?, query?)` | 读取记忆，`scope` 取值 `project`（默认）/ `global` / `all` |

面板（`/api/dsh-memoir/*`）：

| 界面 | 说明 |
| --- | --- |
| 项目记忆 tab | 当前项目会话的记忆，按 工作记录 / 经验教训 / 行动指南 / 备注 分组，显示时间、标题、正文与会话来源 |
| 全局记忆 tab | 所有项目的记忆桶（项目名、路径、更新时间、条数），支持跨项目检索 |
| 搜索框 | 标题与正文的实时模糊过滤 |
| 添加记忆 | 手动记录一条（分类 + 标题 + 正文），与 agent 的 `memoir_record` 写入同一份数据 |
| 删除 | 每条记忆可单独删除，删除后自动重新生成项目记忆文件 |

## 界面预览

**1. 插件生效与整体 UI**：侧边栏出现「记忆」入口（与 SSH / 任务看板同列、互斥展开），点击后在中心列打开记忆面板。

![插件生效与整体 UI](picture/插件生效和UI效果1.png)

**2. 项目记忆**：当前项目会话的持久记忆按 工作记录 / 经验教训 / 行动指南 / 备注 四个分类分组展示，每条带时间、分类标签、标题、正文与会话来源，支持全文检索、刷新与逐条删除。

![项目记忆](picture/项目记忆2.png)

**3. 手动添加记忆**：表单选择分类、填写一句话标题与正文，与 agent 的 `memoir_record` 写入同一份数据，提交后 `PROJECT_MEMORY.md` 自动重新生成。

![手动添加记忆](picture/手动添加记忆3.png)

**4. 全局记忆管理**：所有项目的记忆桶（项目名、路径、更新时间、条数），跨项目检索与逐条维护。

![全局记忆管理](picture/全局记忆管理4.png)

## 配置

在 `cordis.patch.yml` 的行上可加 `config`（三者默认均为 `true`）：

```yaml
- insert:
    - id: memoir
      name: dsh-memoir
      config:
        enabled: true          # 总开关（工具、路由、注入段）
        announceToAgent: true  # system prompt 公告段
        autoDistill: true      # 每轮有实际工作的回合结束自动提醒归纳
```

## 安装

```bash
# 从 GitHub 安装到 web profile
dsh plugin --profile web add github:Qinling-Melon-Farmers/dsh-memoir

# 或本地开发（克隆后）
dsh plugin --profile web add file:/绝对路径/dsh-memoir
```

安装后重启 DSH 生效（`dsh web`）。可运行 `dsh --profile web --dump-config` 确认插件已进入最终组合；刷新页面后侧边栏出现「记忆」入口。

## 使用约定

- **自动模式（默认）**：插件在每轮有实际工作的回合结束自动提醒归纳；agent 按提示调用 `memoir_record` 即可。
- **手动模式（`autoDistill: false`）**：任务收尾时，归纳「做了什么 / 踩了什么坑 / 下一步怎么走」，分三条调用 `memoir_record`（`work`、`lessons`、`actions`）。
- **接手项目**：新会话开始时先用 `memoir_read`（默认 `project`）读取项目记忆与行动指南；跨项目检索用 `memoir_read(scope: 'global', query: ...)` 或面板的全局 tab。
- **人工维护**：面板里可随时手动补录、检索、删除。

## 使用情况：它能解决什么，不能解决什么

以「反复遇到控制台中文乱码、某种终端反复报转义错误」为例：

**能解决「反复踩同一个坑」**。第一次解决后，把诊断结论与修复步骤记成一条 lessons（例如：`先 chcp 65001，脚本里设 $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8；写文件一律 UTF-8 无 BOM`）。此后**本项目的每一个新会话都会自动注入这条经验**，agent 直接照做，不再重新踩、重新查；跨项目也能用 `memoir_read(scope: 'global', query: '乱码')` 检索到。这正是本项目实际发生过的例子（见本仓库开发时沉淀的 `PROJECT_MEMORY.md`：PowerShell 管道中文乱码、终端 ANSI 转义错误、Get-Content 读无 BOM UTF-8 文件乱码三条 lessons 都来自真实踩坑）。

**不能「根治」终端或控制台本身的编码缺陷**。乱码的根因是终端代码页（GBK）与输出编码（UTF-8）不匹配、或终端不支持 ANSI 转义——这些由终端、shell、控制台宿主的配置决定，记忆插件不会去改它们。插件做的是把「根因 + 修复命令」沉淀为项目知识，让 agent 每次都能直接套用正确解法；若某台机器/某个终端的配置本身就坏了，仍需要按经验里的命令修一次。

其它典型使用场景：

| 场景 | 怎么用 |
| --- | --- |
| 反复出现的环境坑（乱码 / 转义 / 路径 / 权限） | 解决后记一条 `lessons`，附可复制的修复命令 |
| 项目红线与约定（禁 emoji、发布前跑测试、分支规范） | 记入 `actions`，自动注入给接手者 |
| 难查 bug 的根因与结论 | 记入 `lessons` / `work`，避免重复排查 |
| 部署 / 上线的固定步骤清单 | 记入 `actions`，新会话照单执行 |
| 跨项目复用经验 | 面板全局 tab 或 `memoir_read(scope: 'global', query: ...)` 检索 |

## 记忆文件格式

`PROJECT_MEMORY.md`（项目级，由结构化条目自动重新生成）：

```markdown
# 项目持久记忆 Project Memory

## 工作记录 Work Log
- [2026-01-15 14:20] [工作记录] 修复 pet 悬停闪退 — 根因是 ...

## 经验教训 Lessons Learned
- [2026-01-15 14:21] [经验教训] ...

## 行动指南 Action Guide
- [2026-01-15 14:22] [行动指南] ...
```

全局索引 `~/.dsh/dsh-memoir.json` 以工作区路径为键，保存结构化条目（含 id、分类、标题、正文、时间、会话 id），是面板与工具共同读写的数据源；项目 markdown 文件是同一数据的可读渲染（git 友好）。

## 设计参考

面板形态与协议参照本机 dsh-web-ui 家族插件的既有约定（侧边栏 DOM 注入、中心列面板、`dsh-panel-activate` 互斥协调、`/api` JSON envelope + CSRF content-type 门禁、`__ModuleLoader__` 闭包工厂 client bundle），并吸收了社区同类高星插件的思路：

- [dsh-memory](https://github.com/Jesse-njx/dsh-memory)（引用式记忆）—— 每条记忆携带会话来源，本插件的条目同样记录 `sessionId`；
- [dsh-mnemon](https://github.com/omdsh-dev/dsh-mnemon)（三层记忆）—— 本插件对应「自动注入的项目记忆 + 可检索的全局记忆」两层；
- [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) / [dsh-side-panel](https://github.com/ccq1/dsh-side-panel)（侧边栏工作台）—— 面板的多 tab + 检索式布局；
- [distill](https://github.com/LoserFox/distill)（自动对话蒸馏）—— 「任务收尾时归纳沉淀」的实现（本插件用 `agent/turn-stopping` + `agent.steer` 的官方事件机制在进程内完成同样的事）；
- [dsh-plugins: bounded cross-session memory](https://github.com/deepseek-ai/deepseek-harness/discussions/525) —— `MEMORY.md` 式有界跨会话记忆文件。

## 设计思路

- **单一数据源**：结构化 JSON（`~/.dsh/dsh-memoir.json`）是唯一事实源，`PROJECT_MEMORY.md` 由它重新生成——文件、面板、工具三者永远一致，人工编辑文件不会被意外覆盖（下次写入按源重新生成，但源里没有的内容会丢失，因此约定人工维护走面板/工具）。
- **两层记忆，各司其职**：项目级（自动注入，成为行动指南）+ 全局级（按需检索，绝不注入，防止 prompt 膨胀与串项目）。
- **官方事件机制做自动沉淀**：`agent/turn-stopping` + `agent.steer`（与 goal-round-driver 同款），不造轮子；配安全边界——只蒸馏有工具调用的回合、已记录过就跳过、子代理/嵌套委托/已取消回合不打扰、每回合至多一次。
- **agent 与用户写同一份数据**：面板手动录入、`memoir_record` 工具、自动收尾，三条路径全部落到同一个 store。
- **与家族插件协议对齐**：侧边栏入口与 SSH/任务看板同序自愈、中心列面板互斥（`dsh-panel-activate`）、`/api` JSON envelope + `application/json` CSRF 门禁、client 走 `__ModuleLoader__` 闭包工厂协议且外部依赖仅限平台模块表（构建期纯净性测试把关）。
- **可测试性优先**：store / 决策函数 / 路由 handler / 面板纯逻辑全部依赖注入、脱离运行时单测；bundle 本身有协议与纯净性回归测试。

## 实现说明

- **TypeScript 全栈**：`src/host/*.ts`（store / tools / routes / autodistill / index，tsc 构建出 `lib/*.js` + 类型声明）+ `src/client/*.ts(x)`（esbuild 打出 `lib/client.js` 闭包工厂 bundle）。
- **双面插件**：host 半注册 agent 工具、`/api/dsh-memoir` 路由、`agent/turn-stopping` 自动收尾监听与按项目求值的 system prompt 注入段；client 半提供面板。运行时仅依赖官方 NPM SDK（`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-client-runtime`）。
- 通过 `dsh.bundle.patch` manifest（`cordis.patch.yml` 的 `insert` 行）挂载，不改 DSH 源码。
- 自动收尾的安全边界：仅顶级会话（跳过 subagent / 嵌套委托）、仅「有工具调用且未记录过」的回合、已中止的回合不打扰、每回合至多触发一次（`AutoDistillGate`）。

## 开发与测试

```bash
pnpm install          # 安装 devDeps（typescript、esbuild、@deepseek-ai/* 类型包）
pnpm run build        # tsc 构建 host + esbuild 构建 client bundle
pnpm run typecheck    # 全量类型检查（src + test）
pnpm test             # 66 项测试：store / tools / routes / 自动收尾 / 集成 / client 纯逻辑 / bundle 协议与纯净性
```

## 许可

MIT
