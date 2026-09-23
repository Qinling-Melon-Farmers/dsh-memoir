/**
 * Automatic turn-end distillation: when the plugin is enabled, each turn of a
 * top-level agent that did real work (made tool calls) and did not already
 * record memory is followed by one steering step asking the agent to distill
 * the turn into memoir_record entries. Turns without tool activity are left
 * alone (no extra model cost), subagent sessions are never steered, and each
 * turn is steered at most once — the steering step runs inside the same turn,
 * so the per-turn gate is what lets the turn close afterwards.
 *
 * Pure decision helpers are exported for unit tests.
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { DEFAULT_MEMOIR_LANGUAGE, hostCopy } from './i18n.js'
import type { MemoirLanguage } from './i18n.js'

// Session V4 requires each producer to own a source kind; the generic
// `plugin` kind was removed. This is the SDK's public extension seam.
declare module '@deepseek-ai/dsh-llm/message' {
  interface MessageSourceMap {
    'dsh-memoir': { kind: 'dsh-memoir' }
  }
}

/** The steering prompt injected at the end of an active turn. */
export function distillPrompt(language: MemoirLanguage = DEFAULT_MEMOIR_LANGUAGE): string {
  return hostCopy(language).distillPrompt
}

/** Backwards-compatible Chinese prompt constant. */
export const DISTILL_PROMPT = distillPrompt()

/** Plugin identity stamped on the steering message source. */
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

/**
 * Session-log compatibility surface. DSH <= alpha.3 exposed `events` while
 * alpha.4+ keeps the log private and exposes an immutable snapshot method.
 */
export interface SessionEventSource {
  readonly events?: readonly TurnEventLike[]
  snapshotEvents?: () => readonly TurnEventLike[]
}

/** Read a stable session event snapshot across the old and new DSH APIs. */
export function sessionEventSnapshot(session: SessionEventSource | undefined): readonly TurnEventLike[] {
  if (typeof session?.snapshotEvents === 'function') return session.snapshotEvents()
  return session?.events ?? []
}

/** Scan the tail of a session log for one turn's tool activity. */
export function turnActivity(events: readonly TurnEventLike[], turn: number): TurnActivity {
  let recorded = false
  let toolCalls = 0
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    const data = event.data as { turn?: number; name?: string } | undefined
    if (data === undefined || typeof data.turn !== 'number') continue
    if (data.turn < turn) break
    if (data.turn !== turn) continue
    if (event.type === 'tool/call') {
      toolCalls += 1
      if (data.name === 'memoir_record' || data.name === 'memoir_update') recorded = true
    }
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
  steer(message: UserMessage): void
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
  workedSinceSteer: number
  lastSteeredAt?: number
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
      state = { lastTurn: -Infinity, workedSinceSteer: 0 }
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
    state.workedSinceSteer += 1

    const intervalReady = state.workedSinceSteer >= policy.every
    const activityReady = toolCalls >= policy.minTools
    const cooldownReady = state.lastSteeredAt === undefined || now - state.lastSteeredAt >= policy.cooldownMs
    this.reason = !intervalReady ? 'interval' : !activityReady ? 'tools' : !cooldownReady ? 'cooldown' : 'ready'
    return this.reason === 'ready'
  }

  /** Record a successful steer; failed steer attempts do not start cooldown. */
  recordSteer(agentId: string, now: number): void {
    const state = this.states.get(agentId)
    if (state === undefined) return
    state.workedSinceSteer = 0
    state.lastSteeredAt = now
  }

  /** Drop all state for one agent (disposal hygiene). */
  forget(agentId: string): void {
    this.states.delete(agentId)
  }
}

export type DistillOutcome = 'disabled' | 'subagent' | 'aborted' | 'idle' | 'recorded' | 'duplicate' | 'interval' | 'tools' | 'cooldown' | 'steered' | 'failed'

/** Process-local counters only; never retains message content or credentials. */
export class DistillDiagnostics {
  private counts: Partial<Record<DistillOutcome, number>> = {}
  private last: { outcome: DistillOutcome; at: number; turn: number; toolCalls: number } | null = null
  private workedTurns = 0
  private agents = 0

  record(outcome: DistillOutcome, at: number, turn: number, toolCalls: number, agents: number): void {
    this.counts[outcome] = (this.counts[outcome] ?? 0) + 1
    if (['interval', 'tools', 'cooldown', 'steered', 'failed'].includes(outcome)) this.workedTurns += 1
    this.last = { outcome, at, turn, toolCalls }
    this.agents = agents
  }

  snapshot() { return { counts: { ...this.counts }, workedTurns: this.workedTurns, agents: this.agents, last: this.last === null ? null : { ...this.last } } }
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
  /** Optional live language source for the steering instruction. */
  language?: () => MemoirLanguage
  now?: () => number
  diagnostics?: DistillDiagnostics
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
    const { worked, recorded, toolCalls } = turnActivity(sessionEventSnapshot(agent.session), turn)
    if (!worked || recorded) { report(recorded ? 'recorded' : 'idle', toolCalls); return }
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
    try { agent.steer(
      createUserMessage({
        content: [{ type: 'text', text: distillPrompt(options.language?.()) }],
        source: { kind: AUTO_DISTILL_PLUGIN },
      }),
    ) } catch (error) {
      report('failed', toolCalls)
      throw error
    }
    gate.recordSteer(agent.id, now)
    report('steered', toolCalls)
  })
  const disposeAgent = wire.onDisposed?.((agentId) => { gate.forget(agentId); options.diagnostics?.setAgents(gate.size) })
  return () => { dispose(); disposeAgent?.(); gate.clear(); options.diagnostics?.setAgents(0) }
}
