/**
 * Automatic turn-end distillation: when the plugin is enabled, each turn of a
 * top-level agent that did real work (made tool calls) and did not already
 * persist memory is followed by a separate turn asking the agent to distill
 * the turn into memoir_record entries. Turns without tool activity are left
 * alone (no extra model cost), subagent sessions are excluded, and each work
 * turn queues at most one reminder. Never steer inside the completed work
 * turn: compact chat selects its last step as the answer. The replayable
 * activity projection excludes reminder turns, including failed/no-op ones.
 *
 * Pure decision helpers are exported for unit tests.
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { DEFAULT_MEMOIR_LANGUAGE, hostCopy } from './i18n.js'
import type { MemoirLanguage } from './i18n.js'
import type { MemoirActivity } from './activity.js'
import { hasWriteReceipt } from './activity.js'

// Session V4 requires each producer to own a source kind; the generic
// `plugin` kind was removed. This is the SDK's public extension seam.
declare module '@deepseek-ai/dsh-llm/message' {
  interface MessageSourceMap {
    'dsh-memoir': { kind: 'dsh-memoir'; originTurn?: number }
  }
}

/** The follow-up instruction; the originating work turn is not rewritten. */
export function distillPrompt(language: MemoirLanguage = DEFAULT_MEMOIR_LANGUAGE, originTurn?: number): string {
  const origin = originTurn === undefined ? '' : hostCopy(language).distillOrigin(originTurn)
  return origin + hostCopy(language).distillPrompt
}

/** Backwards-compatible Chinese prompt constant. */
export const DISTILL_PROMPT = distillPrompt()

/** Plugin identity stamped on the follow-up message source. */
export const AUTO_DISTILL_PLUGIN = 'dsh-memoir'

/** A minimal event view for the turn-activity scan (data is narrowed inside). */
export interface TurnEventLike {
  type: string
  data?: unknown
}

export interface TurnActivity {
  worked: boolean
  recorded: boolean
  toolCalls: number
}

/** Pure event-fixture fold. Runtime activity comes from the host projection. */
export function turnActivity(events: readonly TurnEventLike[], turn: number): TurnActivity {
  let recorded = false
  let toolCalls = 0
  const completedWrites = new Set<string>()
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    const data = event.data as { turn?: number; name?: string; callId?: string; meta?: unknown; message?: { isError?: boolean; source?: { callId?: string } } } | undefined
    if (data === undefined || typeof data.turn !== 'number') continue
    if (data.turn < turn) break
    if (data.turn !== turn) continue
    if (event.type === 'tool/call') {
      toolCalls += 1
      if ((data.name === 'memoir_record' || data.name === 'memoir_update') && typeof data.callId === 'string' && completedWrites.has(data.callId)) recorded = true
    }
    if (event.type === 'tool/result' && data.message?.isError !== true && typeof data.message?.source?.callId === 'string' && hasWriteReceipt(data.meta)) completedWrites.add(data.message.source.callId)
    // Read-only support for legacy logs after the explicit recovery tool.
    if (event.type === 'dsh-memoir/written') recorded = true
  }
  return { worked: toolCalls > 0, recorded, toolCalls }
}

/** The agent surface the turn-stopping listener needs. */
export interface AutoDistillAgentLike {
  id: string
  session: {
    header: { origin?: string; delegationDepth?: number }
    readonly events?: readonly TurnEventLike[]
    snapshotEvents?: () => readonly TurnEventLike[]
  }
  followup(message: UserMessage): void
}

/** Subagent sessions (and any nested delegation) never get distilled. */
export function isSubagentSession(agent: AutoDistillAgentLike): boolean {
  return agent.session.header.origin === 'subagent' || (agent.session.header.delegationDepth ?? 0) > 0
}

export interface AutoDistillPolicy {
  every: number
  cooldownMs: number
  minTools: number
}

interface AgentGateState {
  lastTurn: number
  workedSinceReminder: number
  lastRemindedAt?: number
}

/** Per-agent frequency, cooldown, and duplicate-turn state (with pruning). */
export class AutoDistillGate {
  private states = new Map<string, AgentGateState>()
  readonly capacity = 1024
  reason: 'duplicate' | 'interval' | 'tools' | 'cooldown' | 'ready' = 'ready'

  get size(): number { return this.states.size }
  clear(): void { this.states.clear() }

  /**
   * Consume one eligible worked turn and decide whether all policy conditions
   * are ready. Duplicate events never advance the worked-turn counter.
   */
  consume(agentId: string, turn: number, toolCalls: number, policy: AutoDistillPolicy, now: number): boolean {
    let state = this.states.get(agentId)
    if (state === undefined) {
      state = { lastTurn: -Infinity, workedSinceReminder: 0 }
      this.states.set(agentId, state)
      if (this.states.size > this.capacity) this.states.delete(this.states.keys().next().value!)
    }
    if (turn <= state.lastTurn) {
      this.reason = 'duplicate'
      return false
    }
    state.lastTurn = turn
    this.states.delete(agentId)
    this.states.set(agentId, state)
    state.workedSinceReminder += 1

    const intervalReady = state.workedSinceReminder >= policy.every
    const activityReady = toolCalls >= policy.minTools
    const cooldownReady = state.lastRemindedAt === undefined || now - state.lastRemindedAt >= policy.cooldownMs
    this.reason = !intervalReady ? 'interval' : !activityReady ? 'tools' : !cooldownReady ? 'cooldown' : 'ready'
    return this.reason === 'ready'
  }

  /** Record a successful followup; failed followup attempts do not start cooldown. */
  recordReminder(agentId: string, now: number): void {
    const state = this.states.get(agentId)
    if (state === undefined) return
    state.workedSinceReminder = 0
    state.lastRemindedAt = now
  }

  /** Drop all state for one agent (disposal hygiene). */
  forget(agentId: string): void {
    this.states.delete(agentId)
  }
}

export type DistillOutcome = 'disabled' | 'subagent' | 'aborted' | 'idle' | 'recorded' | 'duplicate' | 'interval' | 'tools' | 'cooldown' | 'queued' | 'distillation' | 'failed' | 'unavailable'

/** Process-local counters only; never retains message content or credentials. */
export class DistillDiagnostics {
  private counts: Partial<Record<DistillOutcome, number>> = {}
  private last: { outcome: DistillOutcome; at: number; turn: number; toolCalls: number } | null = null
  private workedTurns = 0
  private agents = 0
  private writes = { persisted: 0, afterReminder: 0, failed: 0, canceled: 0, needsResolution: 0, receiptFailed: 0 }

  write(outcome: keyof DistillDiagnostics['writes']): void { this.writes[outcome] += 1 }

  record(outcome: DistillOutcome, at: number, turn: number, toolCalls: number, agents: number): void {
    this.counts[outcome] = (this.counts[outcome] ?? 0) + 1
    if (['interval', 'tools', 'cooldown', 'queued', 'failed'].includes(outcome)) this.workedTurns += 1
    this.last = { outcome, at, turn, toolCalls }
    this.agents = agents
  }

  snapshot() { return { counts: { ...this.counts }, writes: { ...this.writes }, workedTurns: this.workedTurns, agents: this.agents, last: this.last === null ? null : { ...this.last } } }
  setAgents(agents: number): void { this.agents = agents }
}

export interface TurnStoppingPayload {
  agent: AutoDistillAgentLike
  turn: number
  signal: AbortSignal
}

/** The event-wire surface the installer needs (satisfied by ctx.on). */
export interface AutoDistillWire {
  on(name: 'agent/turn-stopping', listener: (payload: TurnStoppingPayload) => void): () => void
  onDisposed?(listener: (agentId: string) => void): () => void
}

/**
 * Install the turn-end listener. The returned disposer removes the listener.
 * @param wire - the event wire (the cordis context).
 * @param options.enabled - live read of the autoDistill switch.
 */
export function installAutoDistill(wire: AutoDistillWire, options: {
  enabled: () => boolean
  every?: number
  cooldownMin?: number
  minTools?: number
  /** Optional live policy source used by the Web settings panel. */
  policy?: () => { every?: number; cooldownMin?: number; minTools?: number }
  /** Optional live language source for the follow-up instruction. */
  language?: () => MemoirLanguage
  now?: () => number
  diagnostics?: DistillDiagnostics
  /** Public host projection at the exact Session cursor; absent means skip safely. */
  activity?: (agent: AutoDistillAgentLike) => MemoirActivity | undefined
}): () => void {
  const gate = new AutoDistillGate()
  const integerAtLeast = (value: number | undefined, fallback: number, minimum: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback
  const numberAtLeast = (value: number | undefined, fallback: number, minimum: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, value) : fallback
  const dispose = wire.on('agent/turn-stopping', (payload) => {
    const { agent, turn, signal } = payload
    const now = options.now?.() ?? Date.now()
    const report = (outcome: DistillOutcome, tools = 0) => options.diagnostics?.record(outcome, now, turn, tools, gate.size)
    if (!options.enabled()) { report('disabled'); return }
    if (isSubagentSession(agent)) { report('subagent'); return }
    if (signal.aborted) { report('aborted'); return }
    const activity = options.activity?.(agent)
    if (activity === undefined) { report('unavailable'); return }
    if (activity.turn > turn) { report('duplicate'); return }
    if (activity.turn === turn && activity.distilling) { report('distillation', activity.toolCalls); return }
    const { recorded, toolCalls, reminded } = activity.turn === turn ? activity : { recorded: false, toolCalls: 0, reminded: false }
    if (toolCalls === 0 || recorded) { report(recorded ? 'recorded' : 'idle', toolCalls); return }
    if (reminded) { report('duplicate', toolCalls); return }
    const live = options.policy?.()
    const policy: AutoDistillPolicy = {
      every: integerAtLeast(live?.every ?? options.every, 1, 1),
      cooldownMs: numberAtLeast(live?.cooldownMin ?? options.cooldownMin, 0, 0) * 60_000,
      minTools: integerAtLeast(live?.minTools ?? options.minTools, 1, 1),
    }
    if (!gate.consume(agent.id, turn, toolCalls, policy, now)) {
      report(gate.reason === 'ready' ? 'duplicate' : gate.reason, toolCalls)
      return
    }
    try { agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: distillPrompt(options.language?.(), turn) }],
        source: { kind: AUTO_DISTILL_PLUGIN, originTurn: turn },
      }),
    ) } catch (error) {
      report('failed', toolCalls)
      throw error
    }
    gate.recordReminder(agent.id, now)
    report('queued', toolCalls)
  })
  const disposeAgent = wire.onDisposed?.((agentId) => { gate.forget(agentId); options.diagnostics?.setAgents(gate.size) })
  return () => { dispose(); disposeAgent?.(); gate.clear(); options.diagnostics?.setAgents(0) }
}
