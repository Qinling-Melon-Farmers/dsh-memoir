// Quick recall/latency probe (not part of the test suite).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoirStore } from '../lib/store.js'
import { RetrievalEngine } from '../lib/retrieval.js'
const FIXTURE = [
  ['lessons','中文乱码','控制台中文乱码：先 chcp 65001，PowerShell 设 [Console]::OutputEncoding = UTF8'],
  ['lessons','ANSI 转义','终端 ANSI 转义错误：设置 TERM=dumb 或升级终端模拟器'],
  ['lessons','无 BOM UTF-8','Get-Content 读无 BOM UTF-8 文件乱码，加 -Encoding UTF8'],
  ['actions','发布检查','发布前跑全量测试 npm test，禁止跳过'],
  ['actions','Windows 权限','Windows 下路径用正斜杠，避免 C:/Users/xhj/AppData 权限问题'],
  ['work','门控修复','实现 AutoDistillGate：agent/turn-stopping 里每回合最多 steer 一次'],
  ['work','加载器协议','dsh-memoir 面板接入 __ModuleLoader__ 闭包工厂协议'],
  ['lessons','重复写文件','memoir_record 不要重复写 PROJECT_MEMORY.md，store.record 已经生成'],
  ['work','PR 悬停','修 PR #123 悬停闪退，根因是事件委托重复绑定'],
  ['lessons','幽灵依赖','pnpm 幽灵依赖：public-hoist-pattern 要显式声明'],
  ['actions','分支规范','分支规范：feat/ 前缀 + 发布前跑 pnpm test'],
  ['work','面板互斥','集成 dsh-web-ui 侧边栏：dsh-panel-activate 事件互斥'],
  ['lessons','打包外置','esbuild 打包 external 要列全，否则 react 出现重复实例'],
  ['work','类型迁移','迁移到 erasableSyntaxOnly：禁止 parameter properties 和 enum'],
  ['actions','提交粒度','提交粒度：每个 commit 都能单独 review / revert'],
  ['lessons','原子写','renameSync 在 Windows 上可覆盖已存在目标，原子写用唯一 tmp 名'],
  ['work','性能基准','benchmark fixture 覆盖 100/1000/10000 条目三档'],
  ['lessons','损坏备份','JSON 损坏先备份 .corrupt.<timestamp> 再重建，别静默覆盖'],
  ['actions','依赖体检','每周跑 npm audit 和 pnpm outdated 检查依赖'],
  ['work','快照冻结','session snapshot 冻结同一 session 的 prompt 前缀'],
  ['lessons','跳板机','proxyJump 跳板机配置在 ~/.ssh/config，Host 通配符优先'],
  ['work','子代理蒸馏','autodistill 只在顶层会话生效，subagent 会话不蒸馏'],
  ['actions','上线清单','上线清单：先备份数据库再 migrate'],
  ['lessons','测试框架','vitest 与 jest 混用导致重复测试报告'],
  ['work','Node 22','迁移到 Node 22 类型剥离，避免 enum 和 namespace'],
  ['lessons','编码页','中文 Windows 默认 GBK 代码页，写文件一律 UTF-8 无 BOM'],
  ['actions','工具检索','新增工具要写 triggers 一行，方便 agent 检索'],
  ['work','倒排索引','倒排索引按 store epoch 重建，写后查询自动失效'],
  ['lessons','主目录','homedir 缓存路径记得 mkdir -p ~/.dsh'],
  ['work','诊断面板','面板 diagnostics 显示缓存命中率'],
  ['lessons','符号链接','symlink 工作区路径要 realpath 再 projectKey'],
  ['work','挂载方式','cordis patch insert 行挂载插件，不改 DSH 源码'],
  ['lessons','JSON 注释','JSON5 与标准 JSON 互转会丢注释'],
  ['work','目标兼容','es2022 target 下 Array.at(-1) 可用'],
  ['actions','快照清理','每周清理旧会话快照，LRU 上限 128'],
  ['lessons','端口冲突','端口冲突：先 lsof -i :3080 再换端口'],
]
const QUERIES = ['乱码','ANSI 转义','BOM','发布前','AppData','AutoDistillGate','ModuleLoader','PROJECT_MEMORY','PR #123','幽灵依赖','分支规范','dsh-panel-activate','esbuild','erasableSyntaxOnly','revert','原子写','benchmark','corrupt','npm audit','snapshot','跳板机','subagent','migrate','vitest','类型剥离','GBK','triggers','倒排索引','homedir','命中率','realpath','cordis','JSON5','Array.at','LRU','lsof']
const cwd = mkdtempSync(join(tmpdir(), 'recall-'))
const store = new MemoirStore(join(tmpdir(), 'recall-' + Date.now() + '.json'))
for (const [s, t, c] of FIXTURE) store.record(cwd, { section: s, title: t, content: c })
const engine = new RetrievalEngine(store)
let hits = 0
for (const q of QUERIES) {
  const ranked = engine.search(q, { cwd })
  if (ranked.slice(0, 5).some((r) => r.entry.title === FIXTURE[QUERIES.indexOf(q)][1])) hits++
}
console.log('Top-5 命中率:', hits + '/' + QUERIES.length)
const t0 = process.hrtime.bigint()
for (let i = 0; i < 1000; i++) engine.cachedSearch('乱码', { cwd })
const ns = Number(process.hrtime.bigint() - t0)
console.log('warm cached query (乱码):', (ns / 1000 / 1e6).toFixed(2), 'µs/op')
const t1 = process.hrtime.bigint()
engine.cachedSearch('一个从未问过的查询词条', { cwd })
console.log('cold query:', (Number(process.hrtime.bigint() - t1) / 1e6).toFixed(2), 'ms')

