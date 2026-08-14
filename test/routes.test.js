/**
 * Route tests: the /api/dsh-memoir prefix handler — reads, writes, CSRF
 * content-type gate, payload validation, and envelope shapes.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoirStore, PROJECT_FILE } from '../lib/store.js'
import { makeRoutes, json, readJsonBody } from '../lib/routes.js'
import { callRoute, makeReq, makeTempStorePath, makeTempWorkspace } from './helpers.js'

const JSON_HEADERS = { 'content-type': 'application/json' }

test('route registration returns one prefix route', () => {
  const routes = makeRoutes(new MemoirStore(makeTempStorePath()))
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, '/api/dsh-memoir')
  assert.equal(typeof routes[0].handler, 'function')
})

test('readJsonBody parses json, rejects garbage and oversized payloads', async () => {
  assert.deepEqual(await readJsonBody(makeReq({ body: '{"a":1}' })), { a: 1 })
  assert.equal(await readJsonBody(makeReq({ body: 'not json' })), null)
  assert.equal(await readJsonBody(makeReq({})), null)
  assert.equal(await readJsonBody(makeReq({ body: '{"x":"' + 'a'.repeat(1 << 21) + '"}' })), null)
})

test('json writes the envelope', () => {
  const res = { writeHead: (s, h) => { res.statusCode = s; res.headers = h }, end: (c) => { res.body = c } }
  json(res, { ok: true, value: { x: 1 } })
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['content-type'], /application\/json/)
  assert.deepEqual(JSON.parse(res.body), { ok: true, value: { x: 1 } })
})

test('GET project returns an empty project shape for unknown paths', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0].handler
  const { status, envelope } = await callRoute(handler, { url: '/api/dsh-memoir/project?path=' + encodeURIComponent('C:\\nope') })
  assert.equal(status, 200)
  assert.equal(envelope.ok, true)
  assert.equal(envelope.value.project.path, 'C:\\nope')
  assert.deepEqual(envelope.value.project.entries, [])
})

test('GET project with missing path is a 400', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0].handler
  const { status, envelope } = await callRoute(handler, { url: '/api/dsh-memoir/project' })
  assert.equal(status, 400)
  assert.equal(envelope.ok, false)
  assert.equal(envelope.error.code, 'bad-request')
})

test('GET project with invalid section is a 400', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0].handler
  const { status } = await callRoute(handler, { url: '/api/dsh-memoir/project?path=C%3A%5Cx&section=bogus' })
  assert.equal(status, 400)
})

test('GET project returns entries with section and query filters', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const a = store.record(ws.cwd, { section: 'lessons', title: '踩坑', content: '先备份' })
    store.record(ws.cwd, { section: 'work', content: '开发' })
    const handler = makeRoutes(store)[0].handler

    const all = await callRoute(handler, { url: '/api/dsh-memoir/project?path=' + encodeURIComponent(ws.cwd) })
    assert.equal(all.status, 200)
    assert.equal(all.envelope.value.project.entries.length, 2)
    assert.equal(all.envelope.value.project.title.length > 0, true)

    const lessons = await callRoute(handler, { url: '/api/dsh-memoir/project?path=' + encodeURIComponent(ws.cwd) + '&section=lessons' })
    assert.equal(lessons.envelope.value.project.entries.length, 1)
    assert.equal(lessons.envelope.value.project.entries[0].id, a.id)

    const hit = await callRoute(handler, { url: '/api/dsh-memoir/project?path=' + encodeURIComponent(ws.cwd) + '&query=' + encodeURIComponent('备份') })
    assert.equal(hit.envelope.value.project.entries.length, 1)
    assert.equal(hit.envelope.value.project.entries[0].content, '先备份')
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
    store.record(b.cwd, { section: 'work', content: 'B' })
    const handler = makeRoutes(store)[0].handler
    const { status, envelope } = await callRoute(handler, { url: '/api/dsh-memoir/global' })
    assert.equal(status, 200)
    assert.equal(envelope.value.projects.length, 2)
    // b was recorded later → sorts first (newest-first).
    assert.equal(envelope.value.projects[0].path, b.cwd)
  } finally {
    a.cleanup()
    b.cleanup()
  }
})

test('POST entries records and regenerates the project file', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const handler = makeRoutes(store)[0].handler
    const { status, envelope } = await callRoute(handler, {
      method: 'POST',
      url: '/api/dsh-memoir/entries',
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: ws.cwd, section: 'actions', title: '行动', content: '发布前跑测试', sessionId: 's-3' }),
    })
    assert.equal(status, 200)
    assert.equal(envelope.ok, true)
    assert.ok(envelope.value.entry.id.length > 0)
    assert.equal(envelope.value.entry.sessionId, 's-3')
    assert.ok(existsSync(join(ws.cwd, PROJECT_FILE)))
    assert.ok(readFileSync(join(ws.cwd, PROJECT_FILE), 'utf8').includes('发布前跑测试'))
  } finally {
    ws.cleanup()
  }
})

test('POST without application/json is a 415 (CSRF gate)', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0].handler
  const { status, envelope } = await callRoute(handler, {
    method: 'POST',
    url: '/api/dsh-memoir/entries',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ path: 'C:\\x', section: 'work', content: 'x' }),
  })
  assert.equal(status, 415)
  assert.equal(envelope.error.code, 'content-type')
})

test('POST rejects malformed payloads', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0].handler
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
    const handler = makeRoutes(store)[0].handler
    const ok = await callRoute(handler, {
      method: 'DELETE',
      url: '/api/dsh-memoir/entries',
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: ws.cwd, id: entry.id }),
    })
    assert.equal(ok.status, 200)
    assert.equal(ok.envelope.value.removed, true)
    assert.equal(store.entries(ws.cwd).length, 0)
    const again = await callRoute(handler, {
      method: 'DELETE',
      url: '/api/dsh-memoir/entries',
      headers: JSON_HEADERS,
      body: JSON.stringify({ path: ws.cwd, id: entry.id }),
    })
    assert.equal(again.envelope.value.removed, false)
  } finally {
    ws.cleanup()
  }
})

test('unknown routes 404 and wrong methods 405', async () => {
  const handler = makeRoutes(new MemoirStore(makeTempStorePath()))[0].handler
  const notFound = await callRoute(handler, { url: '/api/dsh-memoir/bogus' })
  assert.equal(notFound.status, 404)
  const method = await callRoute(handler, { method: 'PUT', url: '/api/dsh-memoir/entries', headers: JSON_HEADERS, body: '{}' })
  assert.equal(method.status, 405)
})
