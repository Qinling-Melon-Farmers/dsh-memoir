import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { MemoirStore, projectKey, validateEntryPayload, validateEntryUpdate } from '../lib/store.js'
import { memoirRecordTool, memoirUpdateTool } from '../lib/tools.js'
import { RetrievalEngine } from '../lib/retrieval.js'
import { makeRoutes } from '../lib/routes.js'
import { callRoute, makeExec, makeTempWorkspace } from './helpers.ts'

test('write limit errors are localized for all supported languages', () => {
  const cases = [
    ['zh', '不能超过', '每项不能超过'],
    ['en', 'exceeds', 'characters per item'],
    ['de', 'höchstens', 'Zeichen enthalten'],
    ['ru', 'не должен превышать', 'каждый не длиннее'],
  ] as const
  for (const [language, contentText, listText] of cases) {
    for (const validate of [validateEntryPayload, validateEntryUpdate]) {
      const content = { section: 'note', content: 'x'.repeat(256 * 1024 + 1) }
      assert.ok(validate(content, language)?.includes(contentText), language)
      for (const field of ['tags', 'supersedes']) {
        assert.ok(validate({ section: 'note', content: 'ok', [field]: ['x'.repeat(129)] }, language)?.includes(listText), `${language} ${field}`)
      }
    }
  }
})

test('record and update enforce actual content and list boundaries', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(join(ws.dir, 'store.json'))
    const valid = { section: 'note' as const, content: 'x'.repeat(256 * 1024), tags: Array(64).fill('t'.repeat(128)), supersedes: Array(64).fill('s'.repeat(128)) }
    const entry = store.record(ws.cwd, valid)
    assert.equal(entry.content.length, 256 * 1024)
    for (const change of [
      { content: 'x'.repeat(256 * 1024 + 1) },
      { tags: Array(65).fill('tag') }, { tags: ['t'.repeat(129)] },
      { supersedes: Array(65).fill('id') }, { supersedes: ['s'.repeat(129)] },
    ]) {
      assert.ok(validateEntryPayload({ ...valid, ...change }))
      assert.ok(validateEntryUpdate(change))
      assert.throws(() => store.record(ws.cwd, { ...valid, ...change }))
      assert.throws(() => store.update(ws.cwd, entry.id, change))
    }
    assert.equal(store.entries(ws.cwd).length, 1)
    assert.equal(store.entries(ws.cwd)[0].content.length, 256 * 1024)
  } finally { ws.cleanup() }
})

test('agent and HTTP reject the same oversized fields without persisting', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(join(ws.dir, 'store.json'))
    const existing = store.record(ws.cwd, { section: 'note', content: 'Existing item.' })
    const retrieval = new RetrievalEngine(store)
    const record = memoirRecordTool(store, retrieval)
    const update = memoirUpdateTool(store)
    const handler = makeRoutes(store, undefined, retrieval)[0]!.handler
    for (const bad of [{ content: 'x'.repeat(256 * 1024 + 1) }, { tags: Array(65).fill('x') }, { supersedes: ['x'.repeat(129)] }]) {
      const payload = { section: 'note' as const, content: 'New item.', ...bad }
      await assert.rejects(() => record.execute(payload, makeExec(ws.cwd)))
      await assert.rejects(() => update.execute({ id: existing.id, ...bad }, makeExec(ws.cwd)))
      const response = await callRoute(handler, { method: 'POST', url: '/api/dsh-memoir/entries', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: ws.cwd, ...payload }) })
      assert.equal(response.status, 400)
      const patch = await callRoute(handler, { method: 'PATCH', url: '/api/dsh-memoir/entries', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: ws.cwd, id: existing.id, ...bad }) })
      assert.equal(patch.status, 400)
    }
    assert.equal(store.entries(ws.cwd).length, 1)
    assert.equal(store.entries(ws.cwd)[0].content, 'Existing item.')
  } finally { ws.cleanup() }
})

test('legacy oversized content remains readable and an unrelated update preserves it', () => {
  const ws = makeTempWorkspace()
  try {
    const path = join(ws.dir, 'store.json')
    const content = 'z'.repeat(256 * 1024 + 1)
    writeFileSync(path, JSON.stringify({ version: 4, projects: { [projectKey(ws.cwd)]: {
      path: ws.cwd, title: 'legacy', updatedAt: 1, entries: [{ id: 'old', section: 'note', content, time: 1 }],
    } } }))
    const store = new MemoirStore(path)
    assert.equal(store.entries(ws.cwd)[0].content, content)
    store.update(ws.cwd, 'old', { pinned: true })
    assert.equal(new MemoirStore(path).entries(ws.cwd)[0].content, content)
  } finally { ws.cleanup() }
})
