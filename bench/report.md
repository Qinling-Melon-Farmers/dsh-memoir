# dsh-memoir benchmark report

> 生成时间 / Generated: 2026-11-13T14:23:57.633Z · dsh-memoir 0.9.6 · Node v24.19.0 · win32/x64 · budget 900/1200 estimated tokens

| 条目数 | 冷加载 | 热读取(平均) | Hot Memory 构建 | 索引构建 | 未缓存查询 | 缓存查询 | 缓存命中率 | 全量 markdown tokens | 注入 tokens | 降幅 | 选中/候选 | 快照复用(1000次构建数) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 1.3 ms | 0.95 µs | 0.403 ms | 2.7 ms | 0.134 ms | 1.624 µs | 50.0% | 3908 | 902 | 76.9% | 31/75 | 1 |
| 1000 | 2.4 ms | 0.28 µs | 0.429 ms | 8.3 ms | 0.880 ms | 1.126 µs | 50.0% | 38220 | 916 | 97.6% | 31/750 | 1 |
| 10000 | 21.3 ms | 0.26 µs | 1.561 ms | 98.9 ms | 8.143 ms | 1.066 µs | 50.0% | 385845 | 902 | 99.8% | 30/7500 | 1 |
| 100000 | 131.6 ms | 0.28 µs | 14.788 ms | 1587.2 ms | 104.255 ms | 0.990 µs | 50.0% | 3907095 | 917 | 100.0% | 30/75000 | 1 |

## 测量口径 / Method

- 固定合成单项目语料，四类记忆均匀分布；不是用户数据或语义质量评估。 / Fixed synthetic single-project corpus, evenly split across four sections; not user data or a semantic-quality evaluation.
- 延迟为本次运行均值：冷加载/索引构建各 1 次，未缓存查询 20 次，其余默认 50 次；有预热的项目不含预热耗时。未测 P95，也不是独立多次运行的统计比较。 / Per-run averages: one cold load/index build, 20 uncached searches, otherwise 50 iterations; warmup excluded where enabled. No P95 or statistical comparison across independent runs.
- 查询缓存命中率取 20 个不同查询、两轮请求的真实 hits/misses 增量；50% 来自此访问模式，不是生产命中率或模型 KV cache 命中率。 / Cache hit rate uses actual counter deltas for two passes over 20 distinct queries; 50% reflects this access pattern, not production or model KV-cache performance.
- tokens 是插件估算值；对比全量 Markdown 与有界 Hot Memory，不代表实际账单节省。降幅按一位小数取整，100.0% 不表示零注入。 / Tokens are estimates comparing full Markdown with bounded Hot Memory, not measured billing savings. Reduction is rounded; 100.0% does not mean zero injection.
- 冻结复用列为同一会话 1000 次请求实际构建次数，不证明跨模型提供商的缓存命中。 / Snapshot reuse counts actual builds across 1,000 requests for one session, not provider-side cache hits.
