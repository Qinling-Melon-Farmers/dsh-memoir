/**
 * Route tests: the /api/dsh-memoir prefix handler — reads, writes, CSRF
 * content-type gate, payload validation, and envelope shapes.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoirStore, PROJECT_FILE } from '../lib/store.js'
import { RetrievalEngine } from '../lib/retrieval.js'
import { makeRoutes, json, readJsonBody } from '../lib/routes.js'
import { callRoute, makeReq, makeRes, makeTempStorePath, makeTempWorkspace } from './helpers.ts'

const JSON_HEADERS = { 'content-type': 'application/json' }

test('route registration returns one prefix route', () => {
  const routes = makeRoutes(new MemoirStore(makeTempStorePath()))
  assert.equal(routes.length, 1)
  assert.equal(routes[0]?.kind, 'prefix')
  assert.equal(routes[0]?.path, '/api/dsh-memoir')
  assert.equal(typeof routes[0]?.handler, 'function')
})

test('readJsonBody parses json, rejects garbage and oversized payloads', async () => {
  assert.deepEqual(await readJsonBody(makeReq({ body: '{"a":1}' })), { a: 1 })
  assert.equal(await readJsonBody(makeReq({ body: 'not json' })), null)
  assert.equal(await readJsonBody(makeReq({})), null)
  assert.equal(await readJsonBody(makeReq({ body: '{"x":"' + 'a'.repeat(1 << 21) + '"}' })), null)
})

test('json writes the envelope', () => {
  const res = makeRes()
  json(res, { ok: true, value: { x: 1 } })
  assert.equal((res as unknown as { statusCode: number }).statusCode, 200)
  assert.match((res as unknown as { headers: Record<string, string> }).headers['content-type'] ?? '', /application\/json/)
  assert.deepEqual(JSON.parse((res as unknown as { body: string }).body), { ok: true, value: { x: 1 } })
})

test('GET project returns an empty project shape for unknown paths', async () => {
  const routes = makeRoutes(new MemoirStore(makeTempStorePath()))
  const handler = routes[0]!.handler
  const { status, envelope } = await callRoute(handler, { url: '/api/dsh-memoir/project?path=' + encodeURIComponent('C:\\nope') })
  assert.equal(status, 200)
  assert.equal(envelope.ok, true)
  const project = (envelope.value as { project: { path: string; entries: unknown[] } }).project
  assert.equal(project.path, 'C:\\nope')
  assert.deepEqual(project.entries, [])
})

test('GET project with missing path is a 400', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0]!.handler
  const { status, envelope } = await callRoute(handler, { url: '/api/dsh-memoir/project' })
  assert.equal(status, 400)
  assert.equal(envelope.ok, false)
  assert.equal(envelope.error?.code, 'bad-request')
})

test('GET project with invalid section is a 400', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0]!.handler
  const { status } = await callRoute(handler, { url: '/api/dsh-memoir/project?path=C%3A%5Cx&section=bogus' })
  assert.equal(status, 400)
})

test('GET project returns entries with section and query filters', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const a = store.record(ws.cwd, { section: 'lessons', title: '踩坑', content: '先备份' })
    store.record(ws.cwd, { section: 'work', content: '开发' })
    const handler = makeRoutes(store)[0]!.handler

    const all = await callRoute(handler, { url: '/api/dsh-memoir/project?path=' + encodeURIComponent(ws.cwd) })
    assert.equal(all.status, 200)
    const allProject = (all.envelope.value as { project: { entries: unknown[]; title: string } }).project
    assert.equal(allProject.entries.length, 2)
    assert.ok(allProject.title.length > 0)

    const lessons = await callRoute(handler, { url: '/api/dsh-memoir/project?path=' + encodeURIComponent(ws.cwd) + '&section=lessons' })
    const lessonsProject = (lessons.envelope.value as { project: { entries: Array<{ id: string }> } }).project
    assert.equal(lessonsProject.entries.length, 1)
    assert.equal(lessonsProject.entries[0]?.id, a.id)

    const hit = await callRoute(handler, { url: '/api/dsh-memoir/project?path=' + encodeURIComponent(ws.cwd) + '&query=' + encodeURIComponent('备份') })
    const hitProject = (hit.envelope.value as { project: { entries: Array<{ content: string }> } }).project
    assert.equal(hitProject.entries.length, 1)
    assert.equal(hitProject.entries[0]?.content, '先备份')
  } finally {
    ws.cleanup()
  }
})

test('GET global aggregates projects newest-first', async () => {
  const a = makeTempWorkspace()
  const b = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(a.cwd, { section: 'work', content: 'A' })
    // Guarantee b's updatedAt is strictly newer (same-ms ties are possible).
    const waitUntil = Date.now() + 5
    while (Date.now() < waitUntil) { /* busy-wait for a fresh millisecond */ }
    store.record(b.cwd, { section: 'work', content: 'B' })
    const handler = makeRoutes(store)[0]!.handler
    const { status, envelope } = await callRoute(handler, { url: '/api/dsh-memoir/global' })
    assert.equal(status, 200)
    const projects = (envelope.value as { projects: Array<{ path: string }> }).projects
    assert.equal(projects.length, 2)
    // b was recorded later → sorts first (newest-first).
    assert.equal(projects[0]?.path, b.cwd)
  } finally {
    a.cleanup()
    b.cleanup()
  }
})

test('POST entries records and regenerates the project file', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const handler = makeRoutes(store)[0]!.handler
    const { status, envelope } = await callRoute(handler, {
      method: 'POST',
      url: '/api/dsh-memoir/entries',
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: ws.cwd, section: 'actions', title: '行动', content: '发布前跑测试', sessionId: 's-3' }),
    })
    assert.equal(status, 200)
    assert.equal(envelope.ok, true)
    const entry = (envelope.value as { entry: { id: string; sessionId: string } }).entry
    assert.ok(entry.id.length > 0)
    assert.equal(entry.sessionId, 's-3')
    assert.ok(existsSync(join(ws.cwd, PROJECT_FILE)))
    assert.ok(readFileSync(join(ws.cwd, PROJECT_FILE), 'utf8').includes('发布前跑测试'))
  } finally {
    ws.cleanup()
  }
})

test('POST without application/json is a 415 (CSRF gate)', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0]!.handler
  const { status, envelope } = await callRoute(handler, {
    method: 'POST',
    url: '/api/dsh-memoir/entries',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ path: 'C:\\x', section: 'work', content: 'x' }),
  })
  assert.equal(status, 415)
  assert.equal(envelope.error?.code, 'content-type')
})

test('POST rejects malformed payloads', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0]!.handler
  for (const payload of [
    { path: 'relative', section: 'work', content: 'x' },
    { path: 'C:\\x', section: 'bogus', content: 'x' },
    { path: 'C:\\x', section: 'work' },
    'garbage',
  ]) {
    const { status } = await callRoute(handler, {
      method: 'POST',
      url: '/api/dsh-memoir/entries',
      headers: JSON_HEADERS,
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    })
    assert.equal(status, 400)
  }
  const bad = await callRoute(handler, { method: 'POST', url: '/api/dsh-memoir/entries', headers: JSON_HEADERS, body: 'not json' })
  assert.equal(bad.status, 400)
})

test('DELETE removes an entry and updates the file', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const entry = store.record(ws.cwd, { section: 'note', content: '待删' })
    const handler = makeRoutes(store)[0]!.handler
    const ok = await callRoute(handler, {
      method: 'DELETE',
      url: '/api/dsh-memoir/entries',
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: ws.cwd, id: entry.id }),
    })
    assert.equal(ok.status, 200)
    assert.equal((ok.envelope.value as { removed: boolean }).removed, true)
    assert.equal(store.entries(ws.cwd).length, 0)
    const again = await callRoute(handler, {
      method: 'DELETE',
      url: '/api/dsh-memoir/entries',
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: ws.cwd, id: entry.id }),
    })
    assert.equal((again.envelope.value as { removed: boolean }).removed, false)
  } finally {
    ws.cleanup()
  }
})

test('unknown routes 404 and wrong methods 405', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0]!.handler
  const notFound = await callRoute(handler, { url: '/api/dsh-memoir/bogus' })
  assert.equal(notFound.status, 404)
  const method = await callRoute(handler, { method: 'PUT', url: '/api/dsh-memoir/entries', headers: JSON_HEADERS, body: '{}' })
  assert.equal(method.status, 405)
})

test('GET search returns RetrievalEngine-ranked results', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'work', content: 'cache 普通记录' })
    store.record(ws.cwd, { section: 'lessons', title: 'cache 失效策略', content: '按 epoch 失效 query cache' })
    const engine = new RetrievalEngine(store)
    const seen: string[] = []
    const handler = makeRoutes(store, undefined, engine, undefined, undefined, (path) => seen.push(path))[0]!.handler
    const { status, envelope } = await callRoute(handler, {
      url: '/api/dsh-memoir/search?scope=project&path=' + encodeURIComponent(ws.cwd) + '&query=' + encodeURIComponent('cache') + '&limit=8',
    })
    assert.equal(status, 200)
    const results = (envelope.value as { results: Array<{ entry: { title?: string }; projectPath: string; score: number }> }).results
    assert.equal(results.length, 2)
    assert.equal(results[0]?.entry.title, 'cache 失效策略', 'title boost ranks first')
    assert.ok((results[0]?.score ?? 0) >= (results[1]?.score ?? 0), 'scores descending')
    assert.equal(results[0]?.projectPath, ws.cwd)
    assert.deepEqual(seen, [ws.cwd], 'touchWorkspace saw the searched path')
    // Without an engine the endpoint is a 404.
    const plain = makeRoutes(store)[0]!.handler
    const missing = await callRoute(plain, { url: '/api/dsh-memoir/search?query=x' })
    assert.equal(missing.status, 404)
  } finally {
    ws.cleanup()
  }
})

test('GET hot-memory returns the inspector preview', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'actions', content: '发布前跑测试' })
    const preview = { text: '[Project memory]\nActions:\n- 发布前跑测试', selected: store.entries(ws.cwd), total: 1, estimatedTokens: 20 }
    const handler = makeRoutes(store, undefined, undefined, (path) => (path === ws.cwd ? preview : null))[0]!.handler
    const { status, envelope } = await callRoute(handler, { url: '/api/dsh-memoir/hot-memory?path=' + encodeURIComponent(ws.cwd) })
    assert.equal(status, 200)
    const value = (envelope.value as { hotMemory: { text: string; total: number } | null }).hotMemory
    assert.equal(value?.total, 1)
    assert.ok((value?.text ?? '').includes('发布前跑测试'))
    const plain = makeRoutes(store)[0]!.handler
    const missing = await callRoute(plain, { url: '/api/dsh-memoir/hot-memory?path=' + encodeURIComponent(ws.cwd) })
    assert.equal(missing.status, 404, 'provider absent → 404')
  } finally {
    ws.cleanup()
  }
})

test('panel writes outside the allowed workspace set are rejected', async () => {
  const store = new MemoirStore(makeTempStorePath())
  const allowed = (path: string) => path === 'C:\\ok'
  const handler = makeRoutes(store, undefined, undefined, undefined, allowed)[0]!.handler
  const rejected = await callRoute(handler, {
    method: 'POST',
    url: '/api/dsh-memoir/entries',
    headers: JSON_HEADERS,
    body: JSON.stringify({ path: 'C:\\evil', section: 'work', content: 'x' }),
  })
  assert.equal(rejected.status, 403)
  assert.equal(rejected.envelope.error?.code, 'forbidden')
  const accepted = await callRoute(handler, {
    method: 'POST',
    url: '/api/dsh-memoir/entries',
    headers: JSON_HEADERS,
    body: JSON.stringify({ path: 'C:\\ok', section: 'work', content: 'x' }),
  })
  assert.equal(accepted.status, 200)
  // DELETE is gated the same way.
  const deleteRejected = await callRoute(handler, {
    method: 'DELETE',
    url: '/api/dsh-memoir/entries',
    headers: JSON_HEADERS,
    body: JSON.stringify({ path: 'C:\\evil', id: 'e1' }),
  })
  assert.equal(deleteRejected.status, 403)
  // Without a guard the legacy behavior is preserved (tests/embedded use).
  const open = makeRoutes(store)[0]!.handler
  const legacy = await callRoute(open, {
    method: 'POST',
    url: '/api/dsh-memoir/entries',
    headers: JSON_HEADERS,
    body: JSON.stringify({ path: 'C:\\evil', section: 'work', content: 'x' }),
  })
  assert.equal(legacy.status, 200)
})

test('GET diagnostics reports cache stats and hot-memory selection', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'lessons', content: '先备份' })
    let seenPath: string | undefined
    const handler = makeRoutes(store, (path) => {
      seenPath = path
      return {
        storeRevision: store.stats().revision,
        snapshotEpoch: store.stats().epoch,
        cache: store.stats(),
        snapshotCount: 3,
        snapshotMax: 128,
        hotMemory: { selected: 1, total: 1, estimatedTokens: 42 },
        retrieval: {
          index: { docs: 1, terms: 2, epoch: store.stats().epoch },
          cache: { hits: 1, misses: 0, evictions: 0, hitRate: 1, size: 1, capacity: 128 },
          lastQuery: { query: 'q', latencyMs: 0.1, candidates: 1, returned: 1, at: 1 },
        },
        snapshot: { hash: 'abc123', createdAt: 1, storeRevision: 1 },
        config: { hotMemoryTokens: 900, hotMemoryMaxTokens: 1200, readDefaultLimit: 8, readMaxLimit: 30, sessionSnapshotMax: 128, queryCacheSize: 128 },
      }
    })[0]!.handler
    const { status, envelope } = await callRoute(handler, { url: '/api/dsh-memoir/diagnostics?path=' + encodeURIComponent(ws.cwd) })
    assert.equal(status, 200)
    const value = (envelope.value as { cache: { hitRate: number }; hotMemory: { selected: number; estimatedTokens: number }; snapshotCount: number })
    assert.equal(value.hotMemory.selected, 1)
    assert.equal(value.hotMemory.estimatedTokens, 42)
    assert.equal(value.snapshotCount, 3)
    assert.ok(value.cache.hitRate >= 0)
    assert.equal(seenPath, ws.cwd)
    // Without a provider the route is a 404.
    const plain = makeRoutes(store)[0]!.handler
    const missing = await callRoute(plain, { url: '/api/dsh-memoir/diagnostics' })
    assert.equal(missing.status, 404)
  } finally {
    ws.cleanup()
  }
})

