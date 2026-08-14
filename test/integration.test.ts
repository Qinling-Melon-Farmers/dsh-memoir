/**
 * Integration tests: the full host apply() against a mock cordis context —
 * tools register, routes register, the auto-distill listener mounts, the
 * prompt section provider injects the project memory, and the
 * enabled/announceToAgent/autoDistill switches behave.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { apply, MEMOIR_GUIDANCE, memoirSectionText } from '../lib/index.js'
import { MemoirStore } from '../lib/store.js'
import { callRoute, makeExec, makeTempStorePath, makeTempWorkspace } from './helpers.ts'

interface ListenerRecord {
  name: string
  listener: (payload: unknown) => void
}

/** Build a recording mock cordis context. */
function makeCtx() {
  const ctx = {
    registeredTools: [] as Array<{ name: string; execute: (args: any, exec: any) => Promise<any> }>,
    registeredRoutes: [] as Array<{ kind: string; path: string; handler: (req: any, res: any) => Promise<void> | void }>,
    listeners: [] as ListenerRecord[],
    sections: [] as Array<{ name: string; order: number; text: ((context: unknown) => string) | string }>,
    tools: {
      register: (def: { name: string }) => {
        ctx.registeredTools.push(def as never)
        return () => {}
      },
    },
    webServer: {
      register: (route: { kind: string; path: string; handler: (req: any, res: any) => Promise<void> | void }) => {
        ctx.registeredRoutes.push(route)
        return () => {}
      },
    },
    systemPrompt: {
      section: (section: { name: string; order: number; text: ((context: unknown) => string) | string }) => {
        ctx.sections.push(section)
        return () => {}
      },
    },
    on: (name: string, listener: (payload: unknown) => void) => {
      ctx.listeners.push({ name, listener })
      return () => {}
    },
    effect(fn: () => (() => void) | void): () => void {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  return ctx
}

test('apply mounts two tools, one prefix route, one prompt section, and the auto-distill listener', () => {
  const ctx = makeCtx()
  apply(ctx as unknown as Context, { enabled: true, announceToAgent: true, autoDistill: true })
  assert.deepEqual(ctx.registeredTools.map((t) => t.name), ['memoir_record', 'memoir_read'])
  assert.equal(ctx.registeredRoutes.length, 1)
  assert.equal(ctx.registeredRoutes[0]?.path, '/api/dsh-memoir')
  assert.equal(ctx.sections.length, 1)
  assert.equal(ctx.sections[0]?.name, 'plugin:dsh-memoir')
  assert.equal(ctx.sections[0]?.order, 150)
  assert.equal(typeof ctx.sections[0]?.text, 'function')
  assert.deepEqual(ctx.listeners.map((l) => l.name), ['agent/turn-stopping'])
})

test('apply with enabled=false mounts nothing', () => {
  const ctx = makeCtx()
  apply(ctx as unknown as Context, { enabled: false })
  assert.equal(ctx.registeredTools.length, 0)
  assert.equal(ctx.registeredRoutes.length, 0)
  assert.equal(ctx.sections.length, 0)
  assert.equal(ctx.listeners.length, 0)
})

test('apply with announceToAgent=false skips only the prompt section', () => {
  const ctx = makeCtx()
  apply(ctx as unknown as Context, { enabled: true, announceToAgent: false, autoDistill: true })
  assert.equal(ctx.registeredTools.length, 2)
  assert.equal(ctx.registeredRoutes.length, 1)
  assert.equal(ctx.sections.length, 0)
  assert.equal(ctx.listeners.length, 1)
})

test('apply with autoDistill=false skips only the turn-end listener', () => {
  const ctx = makeCtx()
  apply(ctx as unknown as Context, { enabled: true, announceToAgent: true, autoDistill: false })
  assert.equal(ctx.registeredTools.length, 2)
  assert.equal(ctx.registeredRoutes.length, 1)
  assert.equal(ctx.sections.length, 1)
  assert.equal(ctx.listeners.length, 0)
})

test('defaults: enabled and autoDistill are on when config is absent', () => {
  const ctx = makeCtx()
  apply(ctx as unknown as Context, undefined)
  assert.equal(ctx.registeredTools.length, 2)
  assert.equal(ctx.sections.length, 1)
  assert.equal(ctx.listeners.length, 1)
})

test('prompt section provider: guidance only without agent cwd', () => {
  const store = new MemoirStore(makeTempStorePath())
  assert.equal(memoirSectionText(store, {}), MEMOIR_GUIDANCE)
  assert.equal(memoirSectionText(store, { agent: { session: { header: {} } } }), MEMOIR_GUIDANCE)
})

test('prompt section provider injects bounded project memory', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'lessons', title: '要点', content: '契约先行' })
    const rendered = memoirSectionText(store, { agent: { session: { header: { cwd: ws.cwd } } } })
    assert.ok(rendered.startsWith(MEMOIR_GUIDANCE))
    assert.ok(rendered.includes('项目持久记忆（自动注入）'))
    assert.ok(rendered.includes('契约先行'))
  } finally {
    ws.cleanup()
  }
})

test('prompt section provider stays guidance-only for empty projects', () => {
  const store = new MemoirStore(makeTempStorePath())
  const rendered = memoirSectionText(store, { agent: { session: { header: { cwd: 'C:\\fresh' } } } })
  assert.equal(rendered, MEMOIR_GUIDANCE)
})

test('record through a tool and read through the panel route agree', async () => {
  const ws = makeTempWorkspace()
  try {
    const ctx = makeCtx()
    apply(ctx as unknown as Context, { enabled: true, announceToAgent: true })
    const record = ctx.registeredTools.find((t) => t.name === 'memoir_record')
    assert.ok(record)
    const value = await record.execute({ section: 'lessons', content: '端到端一致' } as never, makeExec(ws.cwd))
    assert.ok((value as { id: string }).id.length > 0)

    const route = ctx.registeredRoutes[0]
    assert.ok(route)
    const { status, envelope } = await callRoute(route.handler, {
      url: '/api/dsh-memoir/project?path=' + encodeURIComponent(ws.cwd),
    })
    assert.equal(status, 200)
    const project = (envelope.value as { project: { entries: Array<{ content: string }> } }).project
    assert.equal(project.entries.length, 1)
    assert.equal(project.entries[0]?.content, '端到端一致')
  } finally {
    ws.cleanup()
  }
})
