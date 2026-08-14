/**
 * dsh-memoir — host half.
 *
 * 把「一个会话做了什么 / 踩了什么坑 / 下一步怎么走」沉淀为项目持久化记忆，
 * 并作为未来 AGENTS 的行动指南：
 *   - 项目级记忆：<工作区>/PROJECT_MEMORY.md（随 git 提交，会话开始时自动注入）
 *   - 全局索引：~/.dsh/dsh-memoir.json（结构化源数据，跨项目检索）
 *   - 面板 API：/api/dsh-memoir/*（浏览器「记忆」面板读写）
 *   - 自动收尾：每轮有实际工作的 turn 结束时，steer 一句归纳提示
 *
 * 提供的 agent 工具：
 *   - memoir_record(section, title?, content)  记录一条记忆
 *   - memoir_read(scope?, section?, query?)     读取记忆
 *
 * 全部基于官方 NPM SDK（@deepseek-ai/dsh-tools 等），不改 DSH 源码；
 * 通过 cordis.patch.yml 的 insert 行挂载到 web profile。
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the Context merges for tools/systemPrompt/webServer and the
// agent Events map (agent/turn-stopping).
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-agent'
import { bounded, INJECT_LIMIT, MemoirStore } from './store.js'
import { memoirReadTool, memoirRecordTool } from './tools.js'
import { makeRoutes } from './routes.js'
import { installAutoDistill } from './autodistill.js'
import type { AutoDistillWire, TurnStoppingPayload } from './autodistill.js'

/** Stable cordis plugin name. */
export const name = 'memoir'

/** Services required before the memory surfaces can mount. */
export const inject = ['tools', 'systemPrompt', 'webServer']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 150

/** Plugin config (validated softly at apply; defaults apply when absent). */
export interface Config {
  /** Master switch for the plugin (tools, routes, prompt section). */
  enabled?: boolean
  /** When true (default), a system-prompt section announces the plugin. */
  announceToAgent?: boolean
  /** When true (default), turns with real work are auto-distilled at turn end. */
  autoDistill?: boolean
}

const DEFAULT_ENABLED = true
const DEFAULT_ANNOUNCE = true
const DEFAULT_AUTO_DISTILL = true

/** Model-facing announcement: plugin presence, capabilities, and usage rules. */
export const MEMOIR_GUIDANCE =
  '本机已安装 dsh-memoir 插件（项目持久化记忆 / 会话经验沉淀）：把每个会话的工作归纳、经验教训与行动指南写入项目记忆，作为未来 AGENTS 的行动指南。' +
  '能力：memoir_record 记录一条记忆（section：work 工作记录 / lessons 经验教训 / actions 行动指南 / note 备注）；memoir_read 读取记忆（scope：project 本项目 / global 全局跨项目 / all 全部）；Web GUI 侧边栏有「记忆」可视化面板。' +
  '插件默认会在每轮有实际工作的回合结束时自动提醒你把该轮工作归纳沉淀进项目记忆（可用 config.autoDistill: false 关闭）。' +
  '记忆位置：项目级 <工作区>/PROJECT_MEMORY.md（随 git 提交、会话开始时自动注入下方）；全局索引 ~/.dsh/dsh-memoir.json（跨项目检索，按需读取）。' +
  '使用约定：一个阶段性任务收尾时，主动归纳「做了什么 / 踩了什么坑 / 下一步怎么走」，用 memoir_record 沉淀；开始新会话或接手旧项目时，先用 memoir_read 读取项目记忆与行动指南。' +
  '下方「项目持久记忆」为本项目已沉淀内容，请据此协作，并在产生新经验时更新。'

/**
 * Per-assembly prompt section text: static guidance plus the calling agent's
 * project memory (bounded). Pure — exported for tests.
 * @param store - the structured memory store.
 * @param context - the system-prompt assemble context (may carry `agent`).
 */
export function memoirSectionText(store: MemoirStore, context: { agent?: { session?: { header?: { cwd?: string } } } }): string {
  const cwd = context?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') return MEMOIR_GUIDANCE
  const entries = store.entries(cwd)
  if (entries.length === 0) return MEMOIR_GUIDANCE
  const markdown = store.renderMarkdown(cwd)
  return `${MEMOIR_GUIDANCE}\n\n## 项目持久记忆（自动注入）\n${bounded(markdown.trimEnd(), INJECT_LIMIT)}`
}

/** Resolved runtime switches (schema defaults applied). */
function resolveConfig(config: Config | undefined): { enabled: boolean; announceToAgent: boolean; autoDistill: boolean } {
  return {
    enabled: config?.enabled ?? DEFAULT_ENABLED,
    announceToAgent: config?.announceToAgent ?? DEFAULT_ANNOUNCE,
    autoDistill: config?.autoDistill ?? DEFAULT_AUTO_DISTILL,
  }
}

/** Bridge the cordis context onto the autodistill wire contract. */
function autoDistillWire(ctx: Context): AutoDistillWire {
  return {
    on: (name, listener: (payload: TurnStoppingPayload) => void) => ctx.on(name, listener),
  }
}

/**
 * Mount the memory tools, the panel routes, the auto-distill listener, and
 * the per-project announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt/webServer.
 * @param config - resolved plugin config (defaults apply when absent).
 */
export function apply(ctx: Context, config?: Config): void {
  const value = resolveConfig(config)
  if (!value.enabled) return

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

  if (value.autoDistill) {
    ctx.effect(
      () => installAutoDistill(autoDistillWire(ctx), { enabled: () => value.autoDistill }),
      'dsh-memoir: auto-distill',
    )
  }

  if (value.announceToAgent) {
    ctx.systemPrompt.section({
      name: 'plugin:dsh-memoir',
      order: SECTION_ORDER,
      // text is a provider evaluated per assembly, so each project's memory is
      // injected for its own session and not for unrelated workspaces.
      text: (context) => memoirSectionText(store, context),
    })
  }
}
