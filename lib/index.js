/**
 * dsh-memoir — host half.
 *
 * 把「一个会话做了什么 / 踩了什么坑 / 下一步怎么走」沉淀为项目持久化记忆，
 * 并作为未来 AGENTS 的行动指南：
 *   - 项目级记忆：<工作区>/PROJECT_MEMORY.md（随 git 提交，会话开始时自动注入）
 *   - 全局索引：~/.dsh/dsh-memoir.json（结构化源数据，跨项目检索）
 *   - 面板 API：/api/dsh-memoir/*（浏览器「记忆」面板读写）
 *
 * 提供的 agent 工具：
 *   - memoir_record(section, title?, content)  记录一条记忆
 *   - memoir_read(scope?, section?, query?)     读取记忆
 *
 * 全部基于官方 NPM SDK（@deepseek-ai/dsh-tools），不改 DSH 源码；
 * 通过 cordis.patch.yml 的 insert 行挂载到 web profile。
 */

import { bounded, INJECT_LIMIT, MemoirStore } from './store.js'
import { memoirReadTool, memoirRecordTool } from './tools.js'
import { makeRoutes } from './routes.js'

/** Stable cordis plugin name. */
export const name = 'memoir'

/** Services required before the memory surfaces can mount. */
export const inject = ['tools', 'systemPrompt', 'webServer']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 150

/** Model-facing announcement: plugin presence, capabilities, and usage rules. */
export const MEMOIR_GUIDANCE =
  '本机已安装 dsh-memoir 插件（项目持久化记忆 / 会话经验沉淀）：把每个会话的工作归纳、经验教训与行动指南写入项目记忆，作为未来 AGENTS 的行动指南。' +
  '能力：memoir_record 记录一条记忆（section：work 工作记录 / lessons 经验教训 / actions 行动指南 / note 备注）；memoir_read 读取记忆（scope：project 本项目 / global 全局跨项目 / all 全部）；Web GUI 侧边栏有「记忆」可视化面板。' +
  '记忆位置：项目级 <工作区>/PROJECT_MEMORY.md（随 git 提交、会话开始时自动注入下方）；全局索引 ~/.dsh/dsh-memoir.json（跨项目检索，按需读取）。' +
  '使用约定：一个阶段性任务收尾时，主动归纳「做了什么 / 踩了什么坑 / 下一步怎么走」，用 memoir_record 沉淀；开始新会话或接手旧项目时，先用 memoir_read 读取项目记忆与行动指南。' +
  '下方「项目持久记忆」为本项目已沉淀内容，请据此协作，并在产生新经验时更新。'

/**
 * Per-assembly prompt section text: static guidance plus the calling agent's
 * project memory (bounded). Pure — exported for tests.
 * @param store - the structured memory store.
 * @param context - the system-prompt assemble context (may carry `agent`).
 */
export function memoirSectionText(store, context) {
  const cwd = context && context.agent && context.agent.session && context.agent.session.header
    ? context.agent.session.header.cwd
    : undefined
  if (typeof cwd !== 'string' || cwd === '') return MEMOIR_GUIDANCE
  const entries = store.entries(cwd)
  if (entries.length === 0) return MEMOIR_GUIDANCE
  const markdown = store.renderMarkdown(cwd)
  return `${MEMOIR_GUIDANCE}\n\n## 项目持久记忆（自动注入）\n${bounded(markdown.trimEnd(), INJECT_LIMIT)}`
}

/**
 * Mount the memory tools, the panel routes, and the per-project announcement.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin context.
 * @param {{ enabled?: boolean, announceToAgent?: boolean } | undefined} config - resolved plugin config.
 */
export function apply(ctx, config) {
  const enabled = config?.enabled ?? true
  const announceToAgent = config?.announceToAgent ?? true
  if (!enabled) return

  const store = new MemoirStore()

  ctx.effect(() => {
    const tools = [memoirRecordTool(store), memoirReadTool(store)]
    const disposers = tools.map((tool) => ctx.tools.register(tool))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-memoir: tools')

  ctx.effect(() => {
    const disposers = makeRoutes(store).map((route) => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-memoir: routes')

  if (announceToAgent) {
    ctx.systemPrompt.section({
      name: 'plugin:dsh-memoir',
      order: SECTION_ORDER,
      // text is a provider evaluated per assembly, so each project's memory is
      // injected for its own session and not for unrelated workspaces.
      text: (context) => memoirSectionText(store, context),
    })
  }
}
