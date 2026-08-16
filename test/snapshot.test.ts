/**
 * snapshot.ts tests (roadmap §2.2 acceptance):
 *   - same session always gets its first snapshot (prompt-prefix stable)
 *   - new session rebuilds and sees newly recorded memory
 *   - LRU cap evicts the oldest snapshot
 *   - sessionKeyOf prefers session id, falls back to agent id / cwd
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemorySnapshotManager, sessionKeyOf, snapshotHash } from '../lib/snapshot.js'

test('getOrCreate freezes the first snapshot for a session', () => {
  const manager = new MemorySnapshotManager()
  let builds = 0
  const builder = () => {
    builds++
    return { storeRevision: builds, text: 'hot-' + builds }
  }
  const first = manager.getOrCreate('s1', builder)
  const second = manager.getOrCreate('s1', builder)
  assert.equal(second, first, 'same snapshot object')
  assert.equal(second.text, 'hot-1')
  assert.equal(builds, 1, 'builder ran exactly once')
  assert.equal(first.hash, snapshotHash('hot-1'))
  assert.ok(first.createdAt > 0)
})

test('getOrCreate refreshes LRU recency and evicts past the cap', () => {
  const manager = new MemorySnapshotManager({ max: 2 })
  manager.getOrCreate('a', () => ({ storeRevision: 1, text: 'a' }))
  manager.getOrCreate('b', () => ({ storeRevision: 1, text: 'b' }))
  // Touch a so it becomes most recent.
  manager.getOrCreate('a', () => ({ storeRevision: 1, text: 'a2' }))
  manager.getOrCreate('c', () => ({ storeRevision: 1, text: 'c' }))
  assert.equal(manager.size, 2)
  assert.equal(manager.peek('a')?.text, 'a', 'a kept (most recent)')
  assert.equal(manager.peek('c')?.text, 'c')
  assert.equal(manager.peek('b'), undefined, 'b evicted (oldest)')
  assert.equal(manager.cap, 2)
})

test('forget drops one session snapshot', () => {
  const manager = new MemorySnapshotManager()
  manager.getOrCreate('x', () => ({ storeRevision: 1, text: 'x' }))
  manager.forget('x')
  assert.equal(manager.peek('x'), undefined)
  assert.equal(manager.size, 0)
})

test('snapshotHash is deterministic', () => {
  assert.equal(snapshotHash('同一段文本'), snapshotHash('同一段文本'))
  assert.notEqual(snapshotHash('a'), snapshotHash('b'))
  assert.equal(snapshotHash('').length, 16)
})

test('sessionKeyOf prefers session id, then agent id, then cwd', () => {
  assert.equal(sessionKeyOf({}), undefined)
  assert.equal(sessionKeyOf({ agent: { session: { header: {} } } }), undefined)
  assert.equal(
    sessionKeyOf({ agent: { session: { id: 'sess-1', header: { cwd: '/p' } } } }),
    'sess-1|/p',
  )
  assert.equal(
    sessionKeyOf({ agent: { id: 'agent-2', session: { header: { cwd: '/p' } } } }),
    'agent-2|/p',
  )
  assert.equal(
    sessionKeyOf({ agent: { session: { header: { cwd: '/p' } } } }),
    'cwd:/p',
  )
})

