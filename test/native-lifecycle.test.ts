import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { Context } from '@deepseek-ai/cordis'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { Session, SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { apply } from '../lib/index.js'
import { emptyActivity, registerActivity } from '../lib/activity.js'
import type { ActivityHandle, activityProjection } from '../lib/activity.js'
import { makeTempWorkspace } from './helpers.ts'
import { join } from 'node:path'

test('real Cordis lifecycle releases host registrations across three remounts', async () => {
  const ws = makeTempWorkspace()
  const root = new Context()
  new SessionProjectionRegistry(root)
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
      await fork
      assert.equal(tools.size, 3)
      assert.equal(routes.size, 1)
      assert.equal(sections.size, 1)
      assert.equal(root.sessionProjections.restoreFloor({}), 0, 'the plugin owns a live projection')
      await fork.dispose()
      assert.equal(tools.size + routes.size + sections.size, 0)
      assert.equal(root.sessionProjections.restoreFloor({}), undefined, 'unloading releases the projection too')
    }
  } finally { await root.fiber.dispose(); ws.cleanup() }
})

test('activity registration belongs to each calling fiber and releases one reference exactly once', async () => {
  const root = new Context()
  new SessionProjectionRegistry(root)
  const session = Session.create(SessionId('activity-owners'), [], {
    id: SessionId('activity-owners'), version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false,
  })
  let first!: ActivityHandle, second!: ActivityHandle
  try {
    const firstOwner = root.plugin(async ctx => { first = await registerActivity(ctx.sessionProjections) })
    const secondOwner = root.plugin(async ctx => { second = await registerActivity(ctx.sessionProjections) })
    await Promise.all([firstOwner, secondOwner])
    assert.deepEqual(first.stateOf(session), emptyActivity())
    assert.deepEqual(second.stateOf(session), emptyActivity())
    await firstOwner.dispose()
    await first.dispose() // an already-released owner must not release its sibling
    assert.equal(root.sessionProjections.restoreFloor({}), 0)
    assert.deepEqual(second.stateOf(session), emptyActivity())
    await secondOwner.dispose()
    assert.equal(root.sessionProjections.restoreFloor({}), undefined)
    await second.dispose()
    assert.equal(root.sessionProjections.restoreFloor({}), undefined)
  } finally { await root.fiber.dispose() }
})

test('unloading async apply during registration readiness leaves no projection or host surfaces', { timeout: 5_000 }, async () => {
  const ws = makeTempWorkspace()
  const root = new Context()
  const registry = new SessionProjectionRegistry(root)
  let entered!: () => void, release!: () => void
  const registered = new Promise<void>(resolve => { entered = resolve })
  const ready = new Promise<void>(resolve => { release = resolve })
  const registerProjection = registry.register
  // Keep real SDK acquisition and caller ownership; delay only its handoff.
  Object.assign(registry, {
    async register(this: SessionProjectionRegistry, definition: typeof activityProjection) {
      const registration = registerProjection.call(this, definition)
      entered()
      await ready
      return registration
    },
  })
  let published = 0, active = 0
  const registerSurface = () => { published++; active++; return () => { active-- } }
  Object.assign(root, {
    tools: { register: registerSurface },
    webServer: { register: registerSurface },
    systemPrompt: { section: registerSurface },
  })
  try {
    const fork = root.plugin({ apply }, {
      storePath: join(ws.cwd, 'memoir.json'), settingsPath: join(ws.cwd, 'settings.json'),
    })
    const startup = Promise.resolve(fork)
    // Attach a rejection observer before starting the cancellation race.
    const settledStartup = Promise.allSettled([startup])
    await registered
    assert.equal(root.sessionProjections.restoreFloor({}), 0)
    assert.equal(published, 0, 'consumers must wait for the ready activity handle')
    const disposal = fork.dispose()
    release()
    await disposal
    await settledStartup
    assert.equal(active, 0)
    assert.equal(published, 0, 'an unloaded activation must not publish consumers')
    assert.equal(root.sessionProjections.restoreFloor({}), undefined, 'no acquisition survives cancellation')
    // The registry remains usable after the canceled owner has drained.
    const handle = await registerActivity(root.sessionProjections)
    assert.equal(root.sessionProjections.restoreFloor({}), 0)
    await handle.dispose()
    assert.equal(root.sessionProjections.restoreFloor({}), undefined)
  } finally { release(); await root.fiber.dispose(); ws.cleanup() }
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
        inject: () => ({ dispose: async () => {} }), // sidebar service absent
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
      assert.equal(active.size, 3)
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
