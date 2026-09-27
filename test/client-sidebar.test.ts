/** Shipped client + real React DOM in JSDOM: interaction, not pixel/host-layout QA. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { Context } from '@deepseek-ai/cordis'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
type Entry = { name: string; key?: string; id?: string; label?: () => string }
type Renderer = (props: any) => any

function load(dom: JSDOM) {
  let plugin: { apply(ctx: Context): void }
  Object.assign(dom.window, { __ModuleLoader__: { load: ({ factory }: { factory: (require: NodeJS.Require) => typeof plugin }) => { plugin = factory(require) } } })
  dom.window.eval(source)
  return plugin!
}

function slotFixture() {
  const entries = new Map<string, Renderer>()
  return { entries, slots: {
    inject: (_name: string, callback: () => () => void) => callback(),
    register: (entry: Entry, render: Renderer) => {
      const key = `${entry.name}:${entry.key ?? entry.id}`
      assert.equal(entries.has(key), false, `duplicate slot ${key}`)
      entries.set(key, render)
      return () => { entries.delete(key) }
    },
  } }
}

test('optional sidebar service can arrive, disappear and remount without disturbing other plugins', async () => {
  const dom = new JSDOM('<html lang="zh"><head></head><body></body></html>', { runScripts: 'outside-only' })
  const root = new Context()
  const { slots, entries } = slotFixture()
  root.provide('slots', slots)
  root.provide('uiWorkspace', { openSession: () => {} })
  const types = new Map<string, any>([['dsh-context', { title: 'foreign' }]])
  try {
    const plugin = load(dom)
    const fork = root.plugin({ apply: plugin.apply })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(entries.size, 2, 'absent sidebar does not block Conversation or Settings')
    for (let cycle = 0; cycle < 3; cycle++) {
      const owner = root.plugin(ctx => {
        ctx.provide('sidebarRightTabs', { register: (entry: any) => {
          assert.equal(types.has(entry.id), false)
          types.set(entry.id, entry)
          return () => { types.delete(entry.id) }
        } })
      })
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(entries.size, 4)
      assert.equal(types.get('dsh-memoir').kind, 'dsh-memoir')
      assert.equal(types.get('dsh-memoir').keepMounted, true)
      assert.equal(types.get('dsh-memoir').guide[0].id, 'dsh-memoir')
      dom.window.document.documentElement.lang = 'en'
      await new Promise(resolve => setImmediate(resolve))
      assert.match(types.get('dsh-memoir').guide[0].description(), /alongside/)
      await owner.dispose()
      assert.equal(entries.size, 2)
      assert.deepEqual([...types.keys()], ['dsh-context'])
    }
    await fork.dispose()
    assert.equal(entries.size, 0)
    assert.equal(dom.window.document.querySelectorAll('style').length, 0)
  } finally { await root.fiber.dispose(); dom.window.close() }
})

test('main and sidebar render isolated projects, tabs, scroll state and safe bilingual help', async () => {
  const dom = new JSDOM('<html lang="zh"><head></head><body><div id="main"></div><div id="side"></div></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' })
  const old = Object.fromEntries(['window', 'document', 'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })
  const requests: string[] = []
  Object.assign(dom.window, { fetch: async (input: string) => {
    requests.push(input)
    const url = new URL(input, 'http://localhost')
    const path = url.searchParams.get('path') ?? ''
    const value = url.pathname.endsWith('/project') ? { project: { path, title: path, entries: [{ id: path, time: 1, section: 'work', title: `Memory ${path}`, content: `Evidence ${path}`, source: { sessionId: `source-${path}`, turnId: 1 } }] } }
      : url.pathname.endsWith('/hot-memory') ? { hotMemory: { text: `Hot ${path}`, selected: [], total: 0, estimatedTokens: 2 } }
      : url.pathname.endsWith('/settings') ? { source: 'profile', settings: { autoDistill: true, agentLanguage: 'zh', autoDistillEvery: 1, autoDistillCooldownMin: 0, autoDistillMinTools: 1, hotMemoryTokens: 900, hotMemoryMaxTokens: 1200, readDefaultLimit: 8, readMaxLimit: 30, snapshotMax: 128, queryCacheSize: 128 } }
      : null
    return { ok: true, status: 200, json: async () => ({ ok: true, value }) }
  } })
  const ctx = new Context()
  const { slots, entries } = slotFixture()
  ctx.provide('slots', slots)
  const opened: string[] = []
  ctx.provide('uiWorkspace', { openSession: (id: string) => opened.push(id) })
  ctx.provide('sidebarRightTabs', { register: () => () => {} })
  const roots = [createRoot(dom.window.document.getElementById('main')!), createRoot(dom.window.document.getElementById('side')!)]
  let closes = 0
  try {
    load(dom).apply(ctx)
    await new Promise(resolve => setImmediate(resolve))
    const state = { byId: { A: { cwd: '/private-project-A', retainedBy: { mainView: 1 } }, B: { cwd: '/private-project-B', retainedBy: {} } } }
    const useSessions = (selector: (state: unknown) => unknown) => selector(state)
    await act(async () => {
      roots[0]!.render(createElement(entries.get('conversation.view:memoir')!, { sessionId: 'A', useSessions, openView: () => {}, completeViewRequest: () => {} }))
      roots[1]!.render(createElement(entries.get('sidebar.right.pane.tab:dsh-memoir')!, { sessionId: 'B', useSessions, useTabInfo: () => ({ tab: { actions: { close: () => closes++ } } }) }))
    })
    const main = dom.window.document.getElementById('main')!, side = dom.window.document.getElementById('side')!
    assert.match(main.textContent!, /Memory \/private-project-A/)
    assert.ok(!main.textContent!.includes('private-project-B'))
    assert.match(side.textContent!, /Memory \/private-project-B/)
    assert.ok(!side.textContent!.includes('private-project-A'))
    assert.equal(opened.length, 0, 'mount does not navigate to sources')
    await act(async () => side.querySelector<HTMLButtonElement>('.memoir-source-link')!.click())
    assert.deepEqual(opened, ['source-/private-project-B'])
    const scroller = side.querySelector<HTMLElement>('.memoir-scroll-region')!
    scroller.scrollTop = 120
    const tabs = side.querySelectorAll<HTMLButtonElement>('.memoir-surface-tab')
    await act(async () => tabs[0]!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    assert.equal(tabs[1]!.getAttribute('aria-selected'), 'true')
    assert.equal(dom.window.document.activeElement, tabs[1])
    assert.equal(main.querySelectorAll('.memoir-surface-tab')[0]!.getAttribute('aria-selected'), 'true')
    const about = side.querySelector<HTMLDetailsElement>('[data-dsh-part="about"]')!
    assert.equal(about.open, false, 'help is collapsed by default')
    assert.match(about.textContent!, new RegExp(`v${manifest.version.replaceAll('.', '\\.')}`))
    assert.ok(about.textContent!.includes(manifest.dsh.engines.dsh))
    assert.ok(about.textContent!.includes('不是当前会话工作区'))
    for (const link of about.querySelectorAll<HTMLAnchorElement>('a')) {
      assert.equal(link.target, '_blank')
      assert.equal(link.rel, 'noopener noreferrer')
      assert.equal(link.getAttribute('referrerpolicy'), 'no-referrer')
      assert.ok(link.href.startsWith('https://github.com/Qinling-Melon-Farmers/dsh-memoir'))
      assert.ok(!link.href.includes('private-project'))
    }
    assert.ok([...about.querySelectorAll('a')].some(link => link.href.endsWith('/README.md')))
    await act(async () => { dom.window.document.documentElement.lang = 'en'; await new Promise(resolve => setImmediate(resolve)) })
    assert.match(about.textContent!, /About & help/)
    assert.ok([...about.querySelectorAll('a')].some(link => link.href.endsWith('/README.en.md')))
    await act(async () => tabs[0]!.click())
    assert.equal(scroller.scrollTop, 120)
    await act(async () => side.querySelector<HTMLButtonElement>('button[title="Close"]')!.click())
    assert.equal(closes, 1)
    assert.ok(requests.every(url => url.startsWith('/api/dsh-memoir/')), 'no background GitHub or npm request')
    assert.equal(opened.length, 1, 'no extra source navigation during tab/language changes')
  } finally {
    await act(async () => roots.forEach(root => root.unmount()))
    await ctx.fiber.dispose()
    dom.window.close()
    for (const [key, descriptor] of Object.entries(old)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
