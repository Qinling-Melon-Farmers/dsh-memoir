import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../lib/index.js'
import { makeTempWorkspace } from './helpers.ts'
import { join } from 'node:path'

test('real Cordis lifecycle releases host registrations across three remounts', async () => {
  const ws = makeTempWorkspace()
  const root = new Context()
  const tools = new Set(), routes = new Set(), sections = new Set()
  const register = (set: Set<unknown>) => (value: unknown) => {
    set.add(value)
    return () => { set.delete(value) }
  }
  Object.assign(root, {
    tools: { register: register(tools) },
    webServer: { register: register(routes) },
    systemPrompt: { section: register(sections) },
  })
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      const fork = root.plugin({ apply }, {
        storePath: join(ws.cwd, 'memoir.json'), settingsPath: join(ws.cwd, 'settings.json'),
      })
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(tools.size, 3)
      assert.equal(routes.size, 1)
      assert.equal(sections.size, 1)
      await fork.dispose()
      assert.equal(tools.size + routes.size + sections.size, 0)
    }
  } finally { ws.cleanup() }
})

test('shipped client mounts, relocalizes and disposes native slots/styles three times', async () => {
  const dom = new JSDOM('<!doctype html><html lang="zh"><head></head><body></body></html>', { runScripts: 'outside-only' })
  // React render is covered separately; this test exercises registration and
  // cleanup only, so the platform module stubs must never be rendered.
  const require = (_id: string) => ({})
  let plugin: { apply: (ctx: unknown) => void } | undefined
  Object.assign(dom.window, { __ModuleLoader__: { load: ({ factory }: { factory: (require: (id: string) => object) => typeof plugin }) => { plugin = factory(require) } } })
  dom.window.eval(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))
  const active = new Map<string, { label: () => string }>()
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      const disposers: (() => void)[] = []
      plugin!.apply({
        effect: (effect: () => () => void) => { disposers.push(effect()) },
        slots: {
          inject: (_name: string, callback: () => () => void) => callback(),
          register: (entry: { name: string; label: () => string }) => {
            assert.equal(active.has(entry.name), false)
            active.set(entry.name, entry)
            return () => { active.delete(entry.name) }
          },
        },
      })
      assert.equal(active.size, 2)
      assert.ok(dom.window.document.querySelectorAll('style').length > 0)
      dom.window.document.documentElement.lang = 'en'
      await new Promise(resolve => setImmediate(resolve))
      assert.match(active.get('settings.section')!.label(), /Mem/)
      disposers.reverse().forEach(dispose => dispose())
      assert.equal(active.size, 0)
      assert.equal(dom.window.document.querySelectorAll('style').length, 0)
      dom.window.document.documentElement.lang = 'zh'
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(active.size, 0, 'disposed observer cannot remount slots')
    }
  } finally { dom.window.close() }
})
