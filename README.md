# dsh-memoir

把「一个会话做了什么 / 踩了什么坑 / 下一步怎么走」沉淀为**项目持久化记忆**，并作为**未来 AGENTS 的行动指南**自动注入后续会话。

- **归纳总结**：每个阶段性任务收尾时，agent 用 `memoir_record` 归纳工作记录、经验教训与行动指南。
- **持久记忆**：项目级写入 `<工作区>/PROJECT_MEMORY.md`（随 git 提交）；全局写入 `~/.dsh/dsh-memoir.json`（跨项目检索）。
- **自动行动指南**：新会话开始时，插件把本项目的 `PROJECT_MEMORY.md` 自动注入 system prompt，未来 AGENTS 无需手翻文档即可继承既往经验。

## 能力

| 工具 | 作用 |
| --- | --- |
| `memoir_record(section, title?, content)` | 记录一条记忆，`section` 取值 `work` / `lessons` / `actions` / `note` |
| `memoir_read(scope?, section?, query?)` | 读取记忆，`scope` 取值 `project`（默认）/ `global` / `all` |

## 安装

```bash
# 从 GitHub 安装到 web profile
dsh plugin --profile web add github:<owner>/dsh-memoir

# 或本地开发（克隆后）
dsh plugin --profile web add link:/绝对路径/dsh-memoir
```

安装后重启 DSH 生效（`dsh web`）。可运行 `dsh --profile web --dump-config` 确认插件已进入最终组合。

## 使用约定

- **任务收尾**：归纳「做了什么 / 踩了什么坑 / 下一步怎么走」，分三条调用 `memoir_record`（`work`、`lessons`、`actions`）。
- **接手项目**：新会话开始时先用 `memoir_read`（默认 `project`）读取项目记忆与行动指南；跨项目检索用 `memoir_read(scope: 'global', query: ...)`。

## 记忆文件格式

`PROJECT_MEMORY.md`（项目级）：

```markdown
# 项目持久记忆 Project Memory

## 工作记录 Work Log
- [2026-01-15 14:20] [工作记录] 修复 pet 悬停闪退 — 根因是 ...

## 经验教训 Lessons Learned
- [2026-01-15 14:21] [经验教训] ...

## 行动指南 Action Guide
- [2026-01-15 14:22] [行动指南] ...
```

全局索引 `~/.dsh/dsh-memoir.json` 以工作区路径为键，跨项目保存同样结构的条目，供 `memoir_read(scope: 'global')` 检索。

## 实现说明

- **纯 host 插件**，无 client bundle，仅依赖官方 NPM SDK `@deepseek-ai/dsh-tools`。
- 通过 `dsh.bundle.patch` manifest（`cordis.patch.yml` 的 `insert` 行）挂载，不改 DSH 源码。
- 项目记忆注入通过 `systemPrompt.section` 的 provider 形式，按「当前会话工作区」逐次求值，互不串项目。

## 许可

MIT
