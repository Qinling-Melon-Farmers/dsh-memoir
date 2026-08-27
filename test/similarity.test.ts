import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoirStore } from '../lib/store.js'
import { RetrievalEngine } from '../lib/retrieval.js'
import { governedRecord } from '../lib/governance.js'
import { findSimilarMemories, titleSimilarity, tokenJaccard } from '../lib/similarity.js'
import { makeTempStorePath, makeTempWorkspace } from './helpers.ts'

test('similarity primitives cover Chinese, code identifiers, and paths', () => {
  assert.equal(tokenJaccard('缓存命中优化', '缓存命中优化'), 1)
  assert.ok(tokenJaccard('memoir_record uses src/host/store.ts', 'memoir_record in src\\host\\store.ts') > 0.45)
  assert.equal(titleSimilarity('Windows 路径规范', 'windows   路径规范'), 1)
  assert.equal(titleSimilarity(undefined, 'title'), 0)
})

test('candidate governance surfaces duplicates and conflicts but omits unrelated memories', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const exact = store.record(ws.cwd, {
      section: 'lessons',
      title: 'Windows 路径规范',
      content: '使用 projectKey 统一盘符大小写与路径分隔符。',
    })
    const changed = store.record(ws.cwd, {
      section: 'actions',
      title: '发布命令',
      content: '运行 npm publish --access public，并检查 tag。',
    })
    store.record(ws.cwd, { section: 'note', title: '无关主题', content: '明天整理桌面文件。' })
    const retrieval = new RetrievalEngine(store)

    const duplicates = findSimilarMemories(retrieval, ws.cwd, {
      section: 'lessons',
      title: 'Windows 路径规范',
      content: '使用 projectKey 统一盘符大小写与路径分隔符。',
    })
    assert.equal(duplicates[0]?.entry.id, exact.id)
    assert.equal(duplicates[0]?.kind, 'duplicate')
    assert.ok((duplicates[0]?.reasons ?? []).includes('exact-content'))

    const conflicts = findSimilarMemories(retrieval, ws.cwd, {
      section: 'actions',
      title: '发布命令',
      content: '改用 pnpm publish --provenance，并让 OIDC 作为主认证。',
    })
    assert.equal(conflicts[0]?.entry.id, changed.id)
    assert.equal(conflicts[0]?.kind, 'conflict')
    assert.ok((conflicts[0]?.reasons ?? []).includes('same-topic-different-content'))

    const unrelated = findSimilarMemories(retrieval, ws.cwd, {
      section: 'work',
      title: 'SSH 面板布局',
      content: '侧栏图标宽度改为 18px。',
    })
    assert.deepEqual(unrelated, [])
  } finally {
    ws.cleanup()
  }
})

test('governedRecord implements update, supersede, and force-record without automatic mutation', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const old = store.record(ws.cwd, { section: 'lessons', title: '缓存策略', content: '查询缓存容量固定为 64。' })
    const retrieval = new RetrievalEngine(store)
    const proposal = { section: 'lessons' as const, title: '缓存策略', content: '查询缓存容量固定为 128。', tags: ['cache'] }

    const pending = governedRecord(store, retrieval, ws.cwd, proposal)
    assert.equal(pending.action, 'needs-resolution')
    assert.equal(pending.recorded, false)
    assert.equal(store.entries(ws.cwd).length, 1, 'preflight never mutates')
    assert.throws(
      () => governedRecord(store, retrieval, ws.cwd, proposal, { resolution: 'update', targetId: 'not-a-candidate' }),
      /current similarity candidates/,
    )
    assert.throws(
      () => governedRecord(store, retrieval, ws.cwd, proposal, { targetId: old.id }),
      /requires an explicit resolution/,
    )

    const updated = governedRecord(store, retrieval, ws.cwd, proposal, { resolution: 'update', targetId: old.id })
    assert.equal(updated.action, 'updated')
    assert.equal(updated.entry?.id, old.id)
    assert.equal(updated.entry?.content, proposal.content)
    assert.equal(store.entries(ws.cwd).length, 1)

    const superseded = governedRecord(store, retrieval, ws.cwd, { ...proposal, content: '查询缓存改为动态 LRU 容量。' }, {
      resolution: 'supersede',
      targetId: old.id,
      source: { sessionId: 's-v056', turnId: 9 },
    })
    assert.equal(superseded.action, 'superseded')
    assert.equal(superseded.recorded, true)
    assert.deepEqual(superseded.entry?.source, { sessionId: 's-v056', turnId: 9 })
    assert.equal(store.entries(ws.cwd).find((entry) => entry.id === old.id)?.status, 'superseded')

    const forced = governedRecord(store, retrieval, ws.cwd, { ...proposal, content: '查询缓存改为动态 LRU 容量。' }, { resolution: 'force-record' })
    assert.equal(forced.action, 'force-recorded')
    assert.equal(store.entries(ws.cwd).length, 3)
  } finally {
    ws.cleanup()
  }
})
