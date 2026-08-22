/**
 * Auto-distill tests: the turn-end steering decision logic — turn activity
 * scanning, subagent exclusion, the per-turn gate, and the listener wiring
 * against a mock event wire (steer assertions on a spy agent).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import {
  turnActivity, isSubagentSession, AutoDistillGate,
  installAutoDistill, DISTILL_PROMPT,
} from '../lib/autodistill.js'
import type { AutoDistillAgentLike, TurnEventLike, TurnStoppingPayload } from '../lib/autodistill.js'

function toolCallEvent(turn: number, name = 'read'): TurnEventLike {
  return { type: 'tool/call', data: { turn, name } }
}

test('turnActivity detects work and prior memoir_record calls in the turn', () => {
  const events: TurnEventLike[] = [
    { type: 'turn/start', data: { turn: 1 } },
    toolCallEvent(1, 'read'),
    { type: 'turn/start', data: { turn: 2 } },
    toolCallEvent(2, 'read'),
    toolCallEvent(2, 'memoir_record'),
    { type: 'todo/write' }, // no turn — skipped
  ]
  assert.deepEqual(turnActivity([], 2), { worked: false, recorded: false, toolCalls: 0 })
  assert.deepEqual(turnActivity(events, 1), { worked: true, recorded: false, toolCalls: 1 })
  assert.deepEqual(turnActivity(events, 2), { worked: true, recorded: true, toolCalls: 2 })
  assert.deepEqual(turnActivity(events, 3), { worked: false, recorded: false, toolCalls: 0 })
})

test('turnActivity stops scanning at lower turns (monotonic log)', () => {
  const events: TurnEventLike[] = [
    toolCallEvent(4, 'read'),
    toolCallEvent(5, 'read'),
  ]
  assert.deepEqual(turnActivity(events, 5), { worked: true, recorded: false, toolCalls: 1 })
  assert.deepEqual(turnActivity(events, 3), { worked: false, recorded: false, toolCalls: 0 })
})

test('isSubagentSession excludes subagents and nested delegations', () => {
  const base = { id: 's', session: { header: {}, events: [] }, steer: () => {} } as unknown as AutoDistillAgentLike
  assert.equal(isSubagentSession(base), false)
  assert.equal(isSubagentSession({ ...base, session: { ...base.session, header: { origin: 'subagent' } } }), true)
  assert.equal(isSubagentSession({ ...base, session: { ...base.session, header: { delegationDepth: 1 } } }), true)
  assert.equal(isSubagentSession({ ...base, session: { ...base.session, header: { delegationDepth: 0 } } }), false)
})

test('AutoDistillGate claims each turn once per agent and prunes', () => {
  const gate = new AutoDistillGate()
  const policy = { every: 1, cooldownMs: 0, minTools: 1 }
  assert.equal(gate.consume('a', 1, 1, policy, 0), true)
  gate.recordSteer('a', 0)
  assert.equal(gate.consume('a', 1, 1, policy, 0), false, 'same agent+turn only once')
  assert.equal(gate.consume('a', 2, 1, policy, 0), true)
  assert.equal(gate.consume('b', 1, 1, policy, 0), true, 'independent per agent')
  // Pruning: turns far behind the current one are forgotten.
  const pruned = new AutoDistillGate()
  pruned.consume('a', 1, 1, policy, 0)
  pruned.consume('a', 200, 1, policy, 0)
  assert.equal(pruned.consume('a', 1, 1, policy, 0), true, 'pruned-out turn may be claimed again')
  const forgotten = new AutoDistillGate()
  forgotten.consume('a', 7, 1, policy, 0)
  forgotten.forget('a')
  assert.equal(forgotten.consume('a', 7, 1, policy, 0), true)
})

test('AutoDistillGate combines worked-turn interval, tool threshold, and cooldown', () => {
  const gate = new AutoDistillGate()
  const policy = { every: 3, cooldownMs: 60_000, minTools: 2 }

  assert.equal(gate.consume('a', 1, 1, policy, 0), false, 'below tool threshold still counts as a worked turn')
  assert.equal(gate.consume('a', 1, 3, policy, 0), false, 'duplicate event does not advance the interval')
  assert.equal(gate.consume('a', 2, 2, policy, 0), false, 'only two worked turns')
  assert.equal(gate.consume('a', 3, 1, policy, 0), false, 'interval ready but tool threshold is not')
  assert.equal(gate.consume('a', 4, 2, policy, 0), true, 'all three conditions are ready')
  gate.recordSteer('a', 0)

  assert.equal(gate.consume('a', 5, 2, policy, 59_999), false)
  assert.equal(gate.consume('a', 6, 2, policy, 59_999), false)
  assert.equal(gate.consume('a', 7, 2, policy, 59_999), false, 'cooldown blocks after interval is ready')
  assert.equal(gate.consume('a', 8, 2, policy, 60_000), true, 'cooldown expiry releases the accumulated interval')
  assert.equal(gate.consume('b', 1, 2, policy, 0), false, 'agent state is isolated')
})

interface WireHarness {
  wire: Parameters<typeof installAutoDistill>[0]
  dispatch(payload: TurnStoppingPayload): void
  dispose(): void
}

function makeWire(): WireHarness {
  let listener: ((payload: TurnStoppingPayload) => void) | undefined
  return {
    wire: {
      on: (name, l) => {
        assert.equal(name, 'agent/turn-stopping')
        listener = l
        return () => { listener = undefined }
      },
    },
    dispatch: (payload) => listener?.(payload),
    dispose: () => { listener = undefined },
  }
}

function makeAgent(options: { events: TurnEventLike[]; origin?: string; delegationDepth?: number }): { agent: AutoDistillAgentLike; steered: UserMessage[] } {
  const steered: UserMessage[] = []
  const agent: AutoDistillAgentLike = {
    id: 'session-1',
    session: {
      header: { origin: options.origin, delegationDepth: options.delegationDepth },
      events: options.events,
    },
    steer: (message) => { steered.push(message) },
  }
  return { agent, steered }
}

const liveSignal = new AbortController().signal
const aborted = new AbortController()
aborted.abort()

test('installAutoDistill steers once per worked turn with the plugin source', () => {
  const harness = makeWire()
  const dispose = installAutoDistill(harness.wire, { enabled: () => true })
  const { agent, steered } = makeAgent({ events: [toolCallEvent(3, 'read')] })

  harness.dispatch({ agent, turn: 3, signal: liveSignal })
  assert.equal(steered.length, 1)
  const message = steered[0]!
  assert.ok(String((message.content[0] as { text?: string }).text).includes('memoir_record'))
  assert.equal((message.source as { kind: string; plugin?: string }).kind, 'plugin')
  assert.equal((message.source as { plugin?: string }).plugin, 'dsh-memoir')
  assert.ok(DISTILL_PROMPT.includes('memoir_record'))

  harness.dispatch({ agent, turn: 3, signal: liveSignal })
  assert.equal(steered.length, 1, 'same turn is never steered twice')

  dispose()
  harness.dispatch({ agent, turn: 4, signal: liveSignal })
  assert.equal(steered.length, 1, 'disposed listener stops steering')
})

test('installAutoDistill respects the enabled switch', () => {
  const harness = makeWire()
  let enabled = false
  installAutoDistill(harness.wire, { enabled: () => enabled })
  const { agent, steered } = makeAgent({ events: [toolCallEvent(1), toolCallEvent(2)] })
  harness.dispatch({ agent, turn: 1, signal: liveSignal })
  assert.equal(steered.length, 0, 'disabled: no steering')
  enabled = true
  harness.dispatch({ agent, turn: 2, signal: liveSignal })
  assert.equal(steered.length, 1, 'enabled: worked turns are steered')
})

test('installAutoDistill skips aborted turns, subagents, idle turns, and already-recorded turns', () => {
  const harness = makeWire()
  installAutoDistill(harness.wire, { enabled: () => true })

  const abortedAgent = makeAgent({ events: [toolCallEvent(1)] })
  harness.dispatch({ agent: abortedAgent.agent, turn: 1, signal: aborted.signal })
  assert.equal(abortedAgent.steered.length, 0, 'aborted turns are left alone')

  const subagent = makeAgent({ events: [toolCallEvent(1)], origin: 'subagent' })
  harness.dispatch({ agent: subagent.agent, turn: 1, signal: liveSignal })
  assert.equal(subagent.steered.length, 0, 'subagent sessions never steer')

  const idle = makeAgent({ events: [] })
  harness.dispatch({ agent: idle.agent, turn: 5, signal: liveSignal })
  assert.equal(idle.steered.length, 0, 'turns without tool calls are left alone')

  const recorded = makeAgent({ events: [toolCallEvent(9, 'memoir_record')] })
  harness.dispatch({ agent: recorded.agent, turn: 9, signal: liveSignal })
  assert.equal(recorded.steered.length, 0, 'turns that already recorded are left alone')
})

test('installAutoDistill applies configurable frequency with an injected clock', () => {
  const harness = makeWire()
  let now = 0
  installAutoDistill(harness.wire, {
    enabled: () => true,
    every: 2,
    cooldownMin: 1,
    minTools: 2,
    now: () => now,
  })
  const { agent, steered } = makeAgent({ events: [
    toolCallEvent(1),
    toolCallEvent(2), toolCallEvent(2, 'write'),
    toolCallEvent(3), toolCallEvent(3, 'write'),
    toolCallEvent(4), toolCallEvent(4, 'write'),
    toolCallEvent(5), toolCallEvent(5, 'write'),
  ] })

  harness.dispatch({ agent, turn: 1, signal: liveSignal })
  assert.equal(steered.length, 0, 'first worked turn is below both interval and tool threshold')
  harness.dispatch({ agent, turn: 2, signal: liveSignal })
  assert.equal(steered.length, 1, 'second worked turn satisfies interval and tool threshold')

  now = 59_999
  harness.dispatch({ agent, turn: 3, signal: liveSignal })
  harness.dispatch({ agent, turn: 4, signal: liveSignal })
  assert.equal(steered.length, 1, 'cooldown blocks even after the next interval')

  now = 60_000
  harness.dispatch({ agent, turn: 5, signal: liveSignal })
  assert.equal(steered.length, 2, 'cooldown updates only from the successful prior steer')
})

test('installAutoDistill reads the live policy for each subsequent turn', () => {
  const harness = makeWire()
  let policy = { every: 3, cooldownMin: 0, minTools: 2 }
  installAutoDistill(harness.wire, {
    enabled: () => true,
    policy: () => policy,
  })
  const { agent, steered } = makeAgent({ events: [
    toolCallEvent(1),
    toolCallEvent(2),
    toolCallEvent(3), toolCallEvent(3, 'write'),
  ] })

  harness.dispatch({ agent, turn: 1, signal: liveSignal })
  assert.equal(steered.length, 0)
  policy = { every: 1, cooldownMin: 0, minTools: 1 }
  harness.dispatch({ agent, turn: 2, signal: liveSignal })
  assert.equal(steered.length, 1, 'updated interval and threshold apply without reinstalling the listener')
  policy = { every: 1, cooldownMin: 0, minTools: 2 }
  harness.dispatch({ agent, turn: 3, signal: liveSignal })
  assert.equal(steered.length, 2, 'later policy updates are read again')
})

test('installAutoDistill does not start cooldown when steer throws', () => {
  const harness = makeWire()
  installAutoDistill(harness.wire, {
    enabled: () => true,
    every: 1,
    cooldownMin: 60,
    minTools: 1,
    now: () => 0,
  })
  let attempts = 0
  let shouldFail = true
  const events = [toolCallEvent(1), toolCallEvent(2), toolCallEvent(3)]
  const agent: AutoDistillAgentLike = {
    id: 'retry-after-failure',
    session: { header: {}, events },
    steer: () => {
      attempts += 1
      if (shouldFail) throw new Error('steer failed')
    },
  }

  assert.throws(() => harness.dispatch({ agent, turn: 1, signal: liveSignal }), /steer failed/)
  shouldFail = false
  harness.dispatch({ agent, turn: 2, signal: liveSignal })
  assert.equal(attempts, 2, 'the next worked turn retries without a false cooldown')
  harness.dispatch({ agent, turn: 3, signal: liveSignal })
  assert.equal(attempts, 2, 'the successful retry starts cooldown')
})
