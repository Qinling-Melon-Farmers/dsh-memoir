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
  assert.deepEqual(turnActivity([], 2), { worked: false, recorded: false })
  assert.deepEqual(turnActivity(events, 1), { worked: true, recorded: false })
  assert.deepEqual(turnActivity(events, 2), { worked: true, recorded: true })
  assert.deepEqual(turnActivity(events, 3), { worked: false, recorded: false })
})

test('turnActivity stops scanning at lower turns (monotonic log)', () => {
  const events: TurnEventLike[] = [
    toolCallEvent(4, 'read'),
    toolCallEvent(5, 'read'),
  ]
  assert.deepEqual(turnActivity(events, 5), { worked: true, recorded: false })
  assert.deepEqual(turnActivity(events, 3), { worked: false, recorded: false })
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
  assert.equal(gate.consume('a', 1), true)
  assert.equal(gate.consume('a', 1), false, 'same agent+turn only once')
  assert.equal(gate.consume('a', 2), true)
  assert.equal(gate.consume('b', 1), true, 'independent per agent')
  // Pruning: turns far behind the current one are forgotten.
  const pruned = new AutoDistillGate()
  pruned.consume('a', 1)
  pruned.consume('a', 200)
  assert.equal(pruned.consume('a', 1), true, 'pruned-out turn may be claimed again')
  const forgotten = new AutoDistillGate()
  forgotten.consume('a', 7)
  forgotten.forget('a')
  assert.equal(forgotten.consume('a', 7), true)
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
