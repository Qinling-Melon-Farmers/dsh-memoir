import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Session, SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { turnActivity, sessionEventSnapshot, installAutoDistill } from '../lib/autodistill.js'
import { resolveMemorySource, memoirRecordTool } from '../lib/tools.js'
import { MemoirStore } from '../lib/store.js'
import { RetrievalEngine } from '../lib/retrieval.js'
import { memoirSectionText } from '../lib/index.js'
import { MemorySnapshotManager } from '../lib/snapshot.js'
import { makeExec, makeTempWorkspace } from './helpers.ts'
import { join } from 'node:path'

test('DSH 0.1.7 Session V4 retains tool provenance, distillation and frozen memory injection', async () => {
  const ws = makeTempWorkspace()
  try {
    const session = Session.create(SessionId('memoir-017'), [], {
      id: SessionId('memoir-017'), version: SESSION_FORMAT_VERSION,
      createdAt: 1, isSeeded: false, cwd: ws.cwd,
    })
    assert.equal(session.header.version, 4)
    session.append('tool/call', { turn: 1, step: 1, callId: ToolCallId('call-test-1'), name: 'read', arguments: '{}' })
    assert.deepEqual(turnActivity(sessionEventSnapshot(session), 1), { worked: true, recorded: false, toolCalls: 1 })
    const exec = makeExec(ws.cwd, session.id, 1)
    Object.assign(exec.agent!, { session })
    assert.deepEqual(resolveMemorySource(exec), { sessionId: session.id, turnId: 1 })
    let steered = 0
    const dispose = installAutoDistill({ on: (_name, listener) => {
      listener({ agent: { id: session.id, session, steer: () => { steered++ } }, turn: 1, signal: new AbortController().signal })
      return () => {}
    } }, { enabled: () => true })
    assert.equal(steered, 1)
    dispose()
    const store = new MemoirStore(join(ws.cwd, 'memory.json'))
    const snapshots = new MemorySnapshotManager()
    const before = memoirSectionText(store, exec, snapshots)
    session.append('tool/call', { turn: 2, step: 1, callId: ToolCallId('call-test-2'), name: 'memoir_record', arguments: '{}' })
    const recordExec = makeExec(ws.cwd, session.id, 2)
    Object.assign(recordExec.agent!, { session })
    await memoirRecordTool(store, new RetrievalEngine(store)).execute({ section: 'lessons', content: 'V4 compatibility verified' }, recordExec)
    assert.equal(store.entries(ws.cwd)[0]?.source?.turnId, 2)
    assert.equal(turnActivity(sessionEventSnapshot(session), 2).recorded, true)
    assert.equal(memoirSectionText(store, exec, snapshots), before)
    assert.match(memoirSectionText(store, { agent: { id: 'next-session', session: { header: { cwd: ws.cwd } } } }, snapshots), /V4 compatibility verified/)
  } finally { ws.cleanup() }
})
