# dsh-memoir v0.5.6 完整项目评审

> 评审日期：2026-08-27
> 代码基线：dsh-memoir v0.5.6 正式版、DeepSeek Harness `0.1.1-rc.2`
> 评审范围：host/client 源码、存储格式、工具与路由契约、Web 适配、发布链路、171 项测试和 100–100,000 条本地基准。

## 1. 结论

dsh-memoir 已形成完整可用的 DSH 本地项目记忆闭环：可信写入、本地持久化、生命周期管理、BM25 长尾召回、有界 Hot Memory、会话冻结缓存、自动收尾提醒、双语 Web 管理与诊断。v0.5.6 补齐来源追踪和写入前相似记忆治理后，原 v0.5 阶段目标完成度约 **94%**；按 v1.0 最终目标衡量约 **73%**。

当前没有已知的 v0.5.6 发布阻断项。仍未完成的核心不是基础记忆读写，而是蒸馏生命周期、变更审计与质量评估、超大数据规模治理和通用 adapter 边界。

## 2. 已核实能力清单

| 领域 | 实际能力 | 完整度 |
|---|---|---:|
| 本地存储 | `~/.dsh/dsh-memoir.json` 作为 JSON SSOT，项目内自动生成 `PROJECT_MEMORY.md`；不使用云记忆服务 | 完整 |
| 数据格式 | store v4，包含生命周期、标签、替代关系和可信 `source.sessionId/turnId`；v1/v2/v3 懒兼容 | 完整 |
| 写入可靠性 | 唯一临时文件 + rename 原子写；跨进程 O_EXCL 锁；PID/时间/nonce 失效锁保守回收 | 完整 |
| 损坏处理 | JSON 无效时备份 `.corrupt.<timestamp>` 并以空 store 恢复；不静默覆盖原坏文件 | 完整 |
| 缓存优化 | store snapshot、mtime 低频探测、负缓存、Markdown render cache、session snapshot LRU、query LRU | 完整 |
| 生命周期 | active/superseded/archived、importance、pin、tags、supersedes；默认只召回 active | 完整 |
| Agent 工具 | `memoir_record`、`memoir_update`、`memoir_read`；工作区解析、输出预算和结构化结果均有测试 | 完整 |
| 相似治理 | 现有 BM25 Top-24 → 标题相似度 + Token Jaccard → 最多 5 个 duplicate/conflict 候选 | 完整（词法边界内） |
| 决策协议 | 候选出现时不写入；显式 `update` / `supersede` / `force-record`，目标必须是当前候选 | 完整 |
| 来源追踪 | Agent 工具从可信 tool/call 事件关联 session/turn；Web 手工写入不能伪造；GUI 支持复制/尽力跳转 | 完整（创建来源） |
| 本地检索 | 中文 2/3-gram、英文、代码/路径、camelCase；倒排索引 BM25、标题/短语/分类/时间加权 | 完整 |
| Hot Memory | active 过滤、importance/pin/section/recency 排序、Recent state 配额、目标/硬 token 上限 | 完整 |
| Prompt 缓存 | 同一可靠 session 身份冻结首个快照；无唯一身份时不冻结；配置变化不改写已冻结前缀 | 完整 |
| 自动蒸馏 | 顶级 worked turn 提醒；按 agent 隔离；every/cooldown/minTools AND 门控；跳过 abort/subagent/已记录 | 完整（turn 模式） |
| Web 管理 | 项目/全局、BM25 搜索、增删改、生命周期、来源、相似决策、Hot Memory、诊断、全量实时设置 | 完整 |
| Web 视觉 | dsh-web-ui 设计令牌、同族侧栏、默认折叠 Settings 卡、单一纵向滚动所有者、中心列互斥 | 完整 |
| 国际化 | 自有中英字典，随 `<html lang>` 即时切换；README、Changelog、Release notes 双语 | 完整 |
| 依赖边界 | npm 包无普通 `dependencies`；host 用 Node 标准库 + DSH peer，client 只导入平台模块 | 完整 |
| 发布 | tag/version 校验、typecheck/test、npm OIDC、token 临时回退、registry 验证、GitHub Release/tgz | 完整（v0.5.6 已实证） |

## 3. 设计合理性

### 3.1 合理且应保留

- **JSON SSOT + Markdown 投影**：机器读写与人工审查分离，避免 Markdown 反向解析的不确定性；当前项目级规模下实现简单、可恢复、可提交。
- **BM25 优先于向量检索**：代码、路径、命令和中英文短语是主要查询对象，词法倒排具备零网络、零模型成本、确定性和可解释性。现阶段没有数据证明需要引入 embedding。
- **有界注入 + 长尾按需召回**：解决完整历史不断膨胀的问题；最新基准在 10k 条时仍将约 385k tokens 的完整投影压缩为约 902 tokens。
- **session 内冻结**：牺牲本会话即时重消费，换取稳定 prompt prefix 和更高缓存命中；新会话重建可看见新记忆，边界明确。
- **相似候选不自动合并**：BM25/Jaccard 只能判断词法接近，不能可靠判断新旧结论真伪。把最终决定留给 Agent/用户是必要的安全边界。
- **GUI 和 Agent 共用 RetrievalEngine/Store**：避免两套排序与数据语义逐步漂移；Web 仅作为同一 host 能力的管理面。
- **OIDC 主发布路径**：长期 npm token 不再成为默认单点；token 只在 OIDC 失败且版本未发布时进入一次性配置。

### 3.2 有意接受的限制

- 自动蒸馏目前是 turn-end steer 提醒，不是后台自主总结器；这减少隐藏模型调用，但无法跨多轮形成 checkpoint 摘要。
- 来源跳转依赖目标 session 仍可被 DSH 加载，turn DOM 也必须存在；因此是 best-effort，不承诺永久深链接。
- source 表示创建来源；`memoir_update` 暂不记录每次修改者、修改 turn 或字段差异。
- 单 JSON 文件的每次写入是全量序列化；对常规项目足够简单可靠，对超大 store 不应宣称无限扩展。

## 4. 评审发现与缺口

| 优先级 | 缺口 | 影响 | 计划 |
|---|---|---|---|
| P1 | 缺 `turn / checkpoint / manual` 蒸馏模式和 session-end/显式 checkpoint | 长任务仍按单轮提醒，无法稳定聚合阶段知识 | v0.5.7 |
| P1 | 只有创建来源，没有 append-only 变更历史、操作者和恢复点 | 更新后可追溯性不足 | v0.5.8 |
| P1 | 相似治理固定为词法阈值，无法理解否定、跨语言改写或隐含矛盾 | 可能漏报/误报；当前由显式确认缓解 | v0.5.8 评估集，暂不自动决策 |
| P1 | 缺正式 export/import、备份浏览和一键恢复 | 损坏备份存在，但普通用户恢复路径不完整 | v0.5.8 |
| P2 | 新写入 content、tags、supersedes 数量缺少细粒度上限（HTTP body 仅有 1 MiB 总上限） | 极端输入可放大 store、GUI 和索引成本 | v0.5.8 |
| P2 | GUI 没有分页/虚拟列表；全局项目和条目较多时 DOM 规模增长 | 大型 store 的交互性能下降 | v0.7.0 |
| P2 | 单文件全量写、同步锁和写前检索不是一个跨进程事务 | 极端并发下候选可能在确认前变旧 | v0.6.0 接口边界与并发测试 |
| P2 | Web 设置为整份文档 last-write-wins，没有 revision/ETag | 两个同时打开的设置页可能后保存覆盖前保存 | v0.5.8 |
| P2 | 尚未维护 dsh-web-ui 0.2.9 / 0.3.x 的持续干净 profile 矩阵 | 旧聚合包兼容主要依靠契约测试而非每次实机 | v0.7.0 CI/验收矩阵 |
| P3 | 100k 条索引构建约 1.68 s、未缓存查询约 127 ms | 已超出交互式理想值，但远高于常规项目规模 | 达到 20k/P95>50ms 触发分片方案 |

本次评审已经即时修复三项可在 v0.5.6 内闭环的问题：Settings 卡/滚动冲突、任意 targetId 绕过候选约束、Agent 相似候选携带无界全文。

## 5. 完成度评估

| 轨道 | 当前完成度 | 判断 |
|---|---:|---|
| 存储、迁移、可靠性 | 95% | 核心完整；差正式备份/恢复 UX 与属性测试 |
| 检索、Hot Memory、缓存 | 92% | 当前规模完整；差更大评估集和规模化策略 |
| 生命周期、来源、相似治理 | 88% | 创建来源和显式决策完整；差修改审计与语义质量评估 |
| Web GUI 与 dsh-web-ui 适配 | 92% | 功能、双语、视觉和滚动完整；差大数据 UX/持续矩阵 |
| 自动蒸馏生命周期 | 58% | turn 模式可靠；checkpoint/manual/session-end 未完成 |
| 通用 core / adapter | 20% | 模块边界已有雏形，尚未抽离稳定接口 |
| 生产级策略与文档 | 55% | 发布、安全和测试较成熟；差长期兼容/恢复/模糊测试 |

综合：v0.5 阶段约 **94%**，v1.0 路线约 **73%**。该比例按能力轨道加权，不因纯 UI 修补或文档数量虚增。

## 6. 验证证据

- `pnpm run typecheck`：通过。
- `pnpm test`：171/171 通过；覆盖 host、client、bundle、迁移、并发锁、来源、相似治理、双语和 release notes。
- 当前基准（Node v24.19.0）：10k 条冷加载 26.4 ms、索引 126.9 ms、未缓存查询 11.011 ms、缓存查询 1.454 µs；100k 条分别为 210.7 ms、1679.9 ms、126.933 ms、1.416 µs。
- npm 包保持零普通运行时依赖；client bundle 只请求 DSH 平台模块。
- v0.5.6 tag 流水线全绿：OIDC 首次发布成功并生成 provenance，npm `latest` 指向 `0.5.6`，公开 GitHub Release 已挂载 tgz。
- Windows 与 WSL Ubuntu 20.04 均以 npm registry 正式包冷启动成功；安装前后记忆文件哈希不变。

后续排期见 [ROADMAP.md](./ROADMAP.md)。
