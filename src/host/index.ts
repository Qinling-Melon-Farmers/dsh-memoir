/**
 * dsh-memoir — host half.
 *
 * 把「一个会话做了什么 / 踩了什么坑 / 下一步怎么走」沉淀为项目持久化记忆，
 * 并作为未来 AGENTS 的行动指南：
 *   - 项目级记忆：<工作区>/PROJECT_MEMORY.md（随 git 提交，会话开始时自动注入）
 *   - 全局索引：~/.dsh/dsh-memoir.json（结构化源数据，跨项目检索）
 *   - 面板 API：/api/dsh-memoir/*（浏览器「记忆」面板读写 + diagnostics）
 *   - 自动收尾：每轮有实际工作的 turn 结束时，steer 一句归纳提示
 *
 * v0.4.0 cache-aware injection:
 *   - system prompt 只注入 selector 选出的 Hot Memory（token 预算），
 *     不再注入完整 markdown；
 *   - 每个 session 的注入文本由 MemorySnapshotManager 冻结一次，
 *     同一 session 后续 assembly 复用同一 snapshot（prompt 前缀稳定，
 *     最大化 prompt-prefix cache 命中）；新 session 才重建。
 *
 * 提供的 agent 工具：
 *   - memoir_record(section, title?, content)  记录一条记忆
 *   - memoir_read(scope?, section?, query?, limit?, detail?)  读取记忆
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the Context merges for tools/systemPrompt/webServer and the
// agent Events map (agent/turn-stopping).
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-agent'
import { MemoirStore, projectKey } from './store.js'
import { memoirReadTool, memoirRecordTool } from './tools.js'
import { makeRoutes } from './routes.js'
import { installAutoDistill } from './autodistill.js'
import type { AutoDistillWire, TurnStoppingPayload } from './autodistill.js'
import { MemorySnapshotManager, sessionKeyOf } from './snapshot.js'
import { DEFAULT_MEMORY_BUDGET, selectHotMemory } from './selector.js'
import type { MemoryBudget } from './selector.js'
import { RetrievalEngine } from './retrieval.js'

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
  // v0.4 — cache-aware injection
  /** Hot-memory soft target tokens (default 900). */
  hotMemoryTokens?: number
  /** Hot-memory hard ceiling tokens (default 1200). */
  hotMemoryMaxTokens?: number
  /** memoir_read default result count (default 8). */
  readDefaultLimit?: number
  /** memoir_read maximum result count (default 30). */
  readMaxLimit?: number
  /** Per-session snapshot LRU cap (default 128). */
  sessionSnapshotMax?: number
  // v0.4.1 — ranked recall
  /** memoir_read ranked-query LRU cache size (default 128). */
  queryCacheSize?: number
}

const DEFAULT_ENABLED = true
const DEFAULT_ANNOUNCE = true
const DEFAULT_AUTO_DISTILL = true

/** Model-facing announcement: minimal by design (roadmap §2.6) — parameter
 *  details live in the tool schemas, not in every prompt. */
export const MEMOIR_GUIDANCE =
  'dsh-memoir 提供项目持久记忆。下方仅注入本项目高优先级记忆；' +
  '需要历史细节时调用 memoir_read；产生可复用的工作结论、经验或后续行动时调用 memoir_record。'

/** The injected-memory heading (kept stable across versions). */
export const MEMOIR_SECTION_HEADING = '## 项目持久记忆（自动注入）'

/** Resolved runtime switches (schema defaults applied). */
export interface ResolvedConfig {
  enabled: boolean
  announceToAgent: boolean
  autoDistill: boolean
  budget: MemoryBudget
  readDefaultLimit: number
  readMaxLimit: number
  sessionSnapshotMax: number
  queryCacheSize: number
}

function resolveConfig(config: Config | undefined): ResolvedConfig {
  const target = Math.max(1, Math.floor(config?.hotMemoryTokens ?? DEFAULT_MEMORY_BUDGET.targetTokens))
  const hardMax = Math.max(target, Math.floor(config?.hotMemoryMaxTokens ?? DEFAULT_MEMORY_BUDGET.hardMaxTokens))
  const readDefaultLimit = Math.max(1, Math.floor(config?.readDefaultLimit ?? 8))
  const readMaxLimit = Math.max(readDefaultLimit, Math.floor(config?.readMaxLimit ?? 30))
  return {
    enabled: config?.enabled ?? DEFAULT_ENABLED,
    announceToAgent: config?.announceToAgent ?? DEFAULT_ANNOUNCE,
    autoDistill: config?.autoDistill ?? DEFAULT_AUTO_DISTILL,
    budget: { targetTokens: target, hardMaxTokens: hardMax },
    readDefaultLimit,
    readMaxLimit,
    sessionSnapshotMax: Math.max(1, Math.floor(config?.sessionSnapshotMax ?? 128)),
    queryCacheSize: Math.max(1, Math.floor(config?.queryCacheSize ?? 128)),
  }
}

/**
 * Per-assembly prompt section text: minimal guidance plus the session's
 * frozen hot-memory snapshot. Pure — exported for tests.
 *
 * Freezing rules (roadmap §1.2 A / §2.2): the FIRST assembly of a session
 * builds the hot memory under the token budget and the manager freezes it;
 * later assemblies — even after memoir_record changed the store — return the
 * same text, keeping the prompt prefix stable. New sessions rebuild.
 *
 * @param store - the structured memory store.
 * @param context - the system-prompt assemble context (may carry `agent`).
 * @param manager - optional snapshot manager (no freezing when absent).
 * @param budget - token budget (defaults to DEFAULT_MEMORY_BUDGET).
 */
export function memoirSectionText(
  store: MemoirStore,
  context: {
    agent?: {
      id?: string
      session?: { id?: string; header?: { cwd?: string } }
    }
  },
  manager?: MemorySnapshotManager,
  budget: MemoryBudget = DEFAULT_MEMORY_BUDGET,
): string {
  const cwd = context?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') return MEMOIR_GUIDANCE
  const build = (): { storeRevision: number; text: string } => {
    const entries = store.entries(cwd)
    const hot = selectHotMemory(entries, budget)
    if (hot.selected.length === 0) {
      return { storeRevision: store.currentRevision(), text: MEMOIR_GUIDANCE }
    }
    return {
      storeRevision: store.currentRevision(),
      text: MEMOIR_GUIDANCE + '\n\n' + MEMOIR_SECTION_HEADING + '\n' + hot.text,
    }
  }
  const key = sessionKeyOf(context)
  if (key === undefined || manager === undefined) return build().text
  return manager.getOrCreate(key, build).text
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
  const snapshotManager = new MemorySnapshotManager({ max: value.sessionSnapshotMax })
  const retrieval = new RetrievalEngine(store, { cacheSize: value.queryCacheSize })

  // Workspaces seen through system-prompt assemblies / panel requests: the
  // write-authorization guard allows only these (plus existing store
  // projects) — a browser-supplied absolute path is not authorization.
  const recentWorkspaces = new Set<string>()
  const touchWorkspace = (path: string): void => {
    if (typeof path === 'string' && path !== '') recentWorkspaces.add(projectKey(path))
  }

  ctx.effect(() => {
    const tools = [
      memoirRecordTool(store),
      memoirReadTool(store, { defaultLimit: value.readDefaultLimit, maxLimit: value.readMaxLimit }, retrieval),
    ]
    const disposers = tools.map((tool) => ctx.tools.register(tool))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-memoir: tools')

  ctx.effect(() => {
    const diagnostics = (path?: string) => {
      const entries = typeof path === 'string' && path !== '' ? store.entries(path) : []
      const hot = entries.length === 0 ? null : selectHotMemory(entries, value.budget)
      const stats = store.stats()
      const latest = snapshotManager.latest()
      return {
        storeRevision: stats.revision,
        snapshotEpoch: stats.epoch,
        cache: stats,
        snapshotCount: snapshotManager.size,
        snapshotMax: snapshotManager.cap,
        hotMemory: hot === null ? null : {
          selected: hot.selected.length,
          total: hot.total,
          estimatedTokens: hot.estimatedTokens,
        },
        retrieval: retrieval.diagnostics(),
        snapshot: latest === undefined ? null : {
          hash: latest.hash,
          createdAt: latest.createdAt,
          storeRevision: latest.storeRevision,
        },
        config: {
          hotMemoryTokens: value.budget.targetTokens,
          hotMemoryMaxTokens: value.budget.hardMaxTokens,
          readDefaultLimit: value.readDefaultLimit,
          readMaxLimit: value.readMaxLimit,
          sessionSnapshotMax: value.sessionSnapshotMax,
          queryCacheSize: value.queryCacheSize,
        },
      }
    }
    const hotMemoryPreview = (path: string) => {
      if (typeof path !== 'string' || path === '') return null
      const entries = store.entries(path)
      if (entries.length === 0) return null
      const hot = selectHotMemory(entries, value.budget)
      return {
        text: hot.text,
        selected: hot.selected,
        total: hot.total,
        estimatedTokens: hot.estimatedTokens,
      }
    }
    const allowedWorkspace = (path: string): boolean =>
      recentWorkspaces.has(projectKey(path)) || store.project(path) !== undefined
    const disposers = makeRoutes(store, diagnostics, retrieval, hotMemoryPreview, allowedWorkspace, touchWorkspace).map((route) => ctx.webServer.register(route))
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
      // injected for its own session and not for unrelated workspaces. The
      // assembly also registers the workspace for panel write authorization.
      text: (context) => {
        const cwd = context?.agent?.session?.header?.cwd
        if (typeof cwd === 'string' && cwd !== '') touchWorkspace(cwd)
        return memoirSectionText(store, context, snapshotManager, value.budget)
      },
    })
  }
}

