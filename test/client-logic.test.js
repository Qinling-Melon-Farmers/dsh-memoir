/**
 * Pure client-logic tests (no DOM, no React): panel controller state machine,
 * i18n dictionaries, the API client against an injected fetch, and the cwd
 * tracker against a mock sessions service.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PanelController } from '../src/client/controller.js'
import { MemoirApi, MemoirApiError, readEnvelope, query } from '../src/client/api.js'
import { createCwdTracker, readCwd } from '../src/client/cwd.js'
import { dictionaries, detectLanguage, translate, SECTION_KEYS } from '../src/client/i18n.js'

// -------------------------------------------------------------- controller

test('PanelController starts closed and toggles/open/close', () => {
  const controller = new PanelController()
  assert.deepEqual(controller.getSnapshot(), { panelOpen: false })
  let notified = 0
  const dispose = controller.subscribe(() => { notified += 1 })
  controller.toggle()
  assert.equal(controller.getSnapshot().panelOpen, true)
  controller.open()
  assert.equal(notified, 1, 'open while open does not notify')
  controller.close()
  assert.equal(controller.getSnapshot().panelOpen, false)
  assert.equal(notified, 2)
  dispose()
  controller.toggle()
  assert.equal(notified, 2, 'unsubscribed listener no longer notified')
})

// ------------------------------------------------------------------ i18n

test('dictionaries are complete: every zh key exists in en and vice versa', () => {
  const zhKeys = Object.keys(dictionaries.zh)
  const enKeys = Object.keys(dictionaries.en)
  assert.deepEqual([...zhKeys].sort(), [...enKeys].sort(), 'key sets must match')
  for (const key of zhKeys) assert.notEqual(dictionaries.en[key], undefined)
})

test('translate falls back to en for unknown languages', () => {
  assert.equal(translate('zh', 'entry.label'), '记忆')
  assert.equal(translate('en', 'entry.label'), 'Memory')
  assert.equal(translate('fr', 'entry.label'), 'Memory')
  assert.equal(translate('zh', 'nope'), 'nope')
})

test('detectLanguage reads the html lang prefix', () => {
  assert.equal(detectLanguage({ documentElement: { lang: 'zh-CN' } }), 'zh')
  assert.equal(detectLanguage({ documentElement: { lang: 'en' } }), 'en')
  assert.equal(detectLanguage(undefined), 'en')
})

test('section keys cover the canonical four', () => {
  assert.deepEqual(SECTION_KEYS, ['work', 'lessons', 'actions', 'note'])
})

// -------------------------------------------------------------------- api

const envelopeResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => JSON.parse(body),
})

test('query builds a search string, omitting empties', () => {
  assert.equal(query({}), '')
  assert.equal(query({ path: 'C:\\x', section: undefined, query: '' }), '?path=' + encodeURIComponent('C:\\x'))
})

test('readEnvelope unwraps ok values and throws on route errors', async () => {
  assert.deepEqual(await readEnvelope(envelopeResponse(200, JSON.stringify({ ok: true, value: { x: 1 } }))), { x: 1 })
  await assert.rejects(
    () => readEnvelope(envelopeResponse(400, JSON.stringify({ ok: false, error: { code: 'x', message: '坏请求' } }))),
    (e) => e instanceof MemoirApiError && e.message === '坏请求',
  )
  await assert.rejects(
    () => readEnvelope(envelopeResponse(200, 'not json')),
    /invalid JSON/,
  )
  await assert.rejects(
    () => readEnvelope(envelopeResponse(500, 'oops')),
    /HTTP 500/,
  )
})

test('MemoirApi.project calls the right URL and unwraps the envelope', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return envelopeResponse(200, JSON.stringify({ ok: true, value: { project: { path: 'C:\\x', entries: [] } } }))
  }
  const api = new MemoirApi(fetchImpl)
  const value = await api.project('C:\\x', { section: 'lessons' })
  assert.equal(value.project.path, 'C:\\x')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/dsh-memoir/project?path=' + encodeURIComponent('C:\\x') + '&section=lessons')
  assert.equal(calls[0].init, undefined)
})

test('MemoirApi.record posts JSON with the CSRF content-type', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return envelopeResponse(200, JSON.stringify({ ok: true, value: { entry: { id: 'e1' } } }))
  }
  const api = new MemoirApi(fetchImpl)
  const value = await api.record({ path: 'C:\\x', section: 'work', title: 't', content: 'c' })
  assert.equal(value.entry.id, 'e1')
  assert.equal(calls[0].url, '/api/dsh-memoir/entries')
  assert.equal(calls[0].init.method, 'POST')
  assert.match(calls[0].init.headers['content-type'], /application\/json/)
  assert.deepEqual(JSON.parse(calls[0].init.body), { path: 'C:\\x', section: 'work', title: 't', content: 'c' })
})

test('MemoirApi.remove deletes by id', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return envelopeResponse(200, JSON.stringify({ ok: true, value: { removed: true } }))
  }
  const api = new MemoirApi(fetchImpl)
  const value = await api.remove({ path: 'C:\\x', id: 'e9' })
  assert.equal(value.removed, true)
  assert.equal(calls[0].init.method, 'DELETE')
  assert.deepEqual(JSON.parse(calls[0].init.body), { path: 'C:\\x', id: 'e9' })
})

test('MemoirApi.global aggregates via the global route', async () => {
  const fetchImpl = async (url) =>
    envelopeResponse(200, JSON.stringify({ ok: true, value: { projects: [{ key: 'k', entries: [] }] } }))
  const api = new MemoirApi(fetchImpl)
  const value = await api.global()
  assert.equal(value.projects.length, 1)
})

// -------------------------------------------------------------------- cwd

/** Mock client sessions service: snapshot + subscription, like the runtime's. */
function makeSessions(initial) {
  const state = { current: initial.current, byId: initial.byId }
  const listeners = new Set()
  return {
    list: {
      getSnapshot: () => ({ current: state.current, byId: state.byId }),
      subscribe: (fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
    },
    _switch(next) {
      state.current = next.current
      state.byId = next.byId
      for (const fn of [...listeners]) fn()
    },
  }
}

test('readCwd extracts the active session cwd, empty otherwise', () => {
  const sessions = makeSessions({ current: 's1', byId: { s1: { cwd: 'C:\\proj' } } })
  assert.equal(readCwd(sessions), 'C:\\proj')
  assert.equal(readCwd(makeSessions({ current: undefined, byId: {} })), '')
  assert.equal(readCwd(makeSessions({ current: 's9', byId: {} })), '')
})

test('createCwdTracker follows session switches and disposes', () => {
  const sessions = makeSessions({ current: 's1', byId: { s1: { cwd: 'C:\\a' }, s2: { cwd: 'C:\\b' } } })
  const tracker = createCwdTracker(sessions)
  assert.equal(tracker.getSnapshot(), 'C:\\a')
  let notified = 0
  const dispose = tracker.subscribe(() => { notified += 1 })
  sessions._switch({ current: 's2', byId: sessions.list.getSnapshot().byId })
  assert.equal(tracker.getSnapshot(), 'C:\\b')
  assert.equal(notified, 1)
  sessions._switch({ current: 's2', byId: sessions.list.getSnapshot().byId })
  assert.equal(notified, 1, 'same cwd does not notify')
  dispose()
  sessions._switch({ current: 's1', byId: sessions.list.getSnapshot().byId })
  assert.equal(notified, 1, 'disposed subscription does not notify')
})
