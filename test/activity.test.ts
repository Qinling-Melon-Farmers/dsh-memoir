import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { Session, SessionId, SESSION_FORMAT_VERSION, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import { ACTIVITY_KEY, activityProjection, emptyActivity, CALL_LIMIT } from '../lib/activity.js'
import { installAutoDistill, DistillDiagnostics } from '../lib/autodistill.js'
import { memoirRecordTool, memoirUpdateTool, resolveMemorySource } from '../lib/tools.js'
import { MemoirStore } from '../lib/store.js'
import { RetrievalEngine } from '../lib/retrieval.js'
import { makeExec, makeTempWorkspace } from './helpers.ts'
import { join } from 'node:path'

test('activity projection replays late registration, checkpoints and remounts without retaining content', () => {
  const session = Session.create(SessionId('late'), [], { id: SessionId('late'), version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false })
  session.append('tool/call', { turn: 8, step: 1, callId: ToolCallId('root'), name: 'run_code', arguments: 'sensitive arguments' })
  const root = new Context()
  const registry = new SessionProjectionRegistry(root)
  const dispose = registry.register(activityProjection)
  try {
    assert.equal(registry.stateOf(session, ACTIVITY_KEY)?.toolCalls, 1)
    const checkpoint = registry.checkpoint(session)
    assert.ok(!JSON.stringify(checkpoint).includes('sensitive'))
    const receipt = session.append('dsh-memoir/written', { turn: 8, callId: 'nested-call' })
    assert.equal(registry.stateOf(session, ACTIVITY_KEY)?.recorded, true)
    // Full replay and cold checkpoint replay have identical state.
    const restored = registry.restore(checkpoint, [receipt], SessionLogOffset(Number(receipt.seq)), session.header, SessionLogOffset(0))
    assert.equal((restored.checkpoint[ACTIVITY_KEY]?.val as { recorded: boolean }).recorded, true)
    const frozen = registry.checkpoint(session)
    assert.deepEqual(registry.stateOf(session, ACTIVITY_KEY), frozen[ACTIVITY_KEY]?.val)
    dispose()
    assert.equal(registry.stateOf(session, ACTIVITY_KEY), undefined)
    const remount = registry.register(activityProjection)
    assert.equal(registry.stateOf(session, ACTIVITY_KEY)?.recorded, true)
    remount()
  } finally { dispose() }
})

test('projection bounds current-turn IDs, resets on the next turn, and remembers accepted reminders', () => {
  let state = emptyActivity()
  for (let i = 0; i < CALL_LIMIT + 20; i++) state = activityProjection.apply(state, {
    type: 'tool/call', data: { turn: 1, step: 1, callId: ToolCallId(`c-${i}`), name: 'read', arguments: '{}' },
  } as SessionEvent)
  assert.equal(state.calls.length, CALL_LIMIT)
  assert.equal(state.toolCalls, CALL_LIMIT + 20)
  state = activityProjection.apply(state, { type: 'agent/inbox/spliced', seq: SessionSeq(5000), time: 1, data: {
    target: 'next-step', start: 0, inserted: [createUserMessage({ content: [{ type: 'text', text: 'distill' }], source: { kind: 'dsh-memoir' } })],
  } } as SessionEvent)
  assert.equal(state.reminded, true)
  let listener: Parameters<Parameters<typeof installAutoDistill>[0]['on']>[1] | undefined
  const diagnostics = new DistillDiagnostics()
  const dispose = installAutoDistill({ on: (_name, fn) => { listener = fn; return () => {} } }, { enabled: () => true, activity: () => state, diagnostics })
  listener!({ agent: { id: 'restored', session: { header: {} }, steer: () => { assert.fail('restored turn must not steer twice') } }, turn: 1, signal: new AbortController().signal })
  assert.equal(diagnostics.snapshot().counts.duplicate, 1)
  dispose()
  state = activityProjection.apply(state, { type: 'turn/start', data: { turn: 2 } } as SessionEvent)
  assert.deepEqual(state, { ...emptyActivity(), turn: 2 })
})

test('only committed writes confirm activity: unresolved similarity, errors, cancellation, update and nested provenance', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(join(ws.cwd, 'memories.json'))
    let state = { ...emptyActivity(), turn: 7, calls: ['root'], toolCalls: 1 }
    let writes = 0
    const hooks = { activity: () => state, written: () => { writes++; state = { ...state, recorded: true } } }
    const exec = makeExec(ws.cwd, 'source', 7)
    Object.assign(exec, { callId: 'nested', rootCallId: 'root', signal: new AbortController().signal })
    assert.deepEqual(resolveMemorySource(exec, hooks), { sessionId: 'source', turnId: 7 })
    const record = memoirRecordTool(store, new RetrievalEngine(store), 'en', hooks)
    const payload = { section: 'actions' as const, title: 'Release protocol', content: 'Always run tests before publishing a package.' }
    const first = await record.execute(payload, exec) as { id: string }
    assert.equal(writes, 1)
    assert.equal(state.recorded, true)
    state = { ...state, recorded: false }
    const unresolved = await record.execute(payload, exec) as { action: string }
    assert.equal(unresolved.action, 'needs-resolution')
    assert.equal(writes, 1)
    assert.equal(state.recorded, false)
    const update = memoirUpdateTool(store, 'en', hooks)
    await assert.rejects(update.execute({ id: 'missing', importance: 4 }, exec))
    assert.equal(writes, 1)
    await update.execute({ id: first.id, importance: 4 }, exec)
    assert.equal(writes, 2)
    Object.assign(exec, { signal: AbortSignal.abort() })
    await assert.rejects(record.execute({ ...payload, resolution: 'force-record' }, exec))
    await assert.rejects(update.execute({ id: first.id, importance: 5 }, exec))
    assert.equal(writes, 2)
    assert.equal(store.entries(ws.cwd).length, 1)
    assert.equal(store.entries(ws.cwd)[0]?.importance, 4)
  } finally { ws.cleanup() }
})

test('JSON commit is reported even if the subsequent Markdown projection fails', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(join(ws.cwd, 'partial.json'))
    store.writeProjectFile = () => { throw new Error('Markdown path not writable') }
    let persisted = 0
    const hooks = { activity: () => undefined, written: () => { persisted++ } }
    const tool = memoirRecordTool(store, new RetrievalEngine(store), 'en', hooks)
    await assert.rejects(tool.execute({ section: 'lessons', content: 'JSON survives a projection failure' }, makeExec(ws.cwd)), /not writable/)
    assert.equal(persisted, 1)
    assert.equal(new MemoirStore(store.path).entries(ws.cwd).length, 1)
  } finally { ws.cleanup() }
})
