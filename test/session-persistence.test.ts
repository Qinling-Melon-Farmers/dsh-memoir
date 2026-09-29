/** Real npm AgentLoop + ToolRuntime + JSONL storage; no network or user data. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop'
import { Session, SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { LlmAdapter, LlmRuntime, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { apply } from '../lib/index.js'
import { ACTIVITY_KEY } from '../lib/activity.js'
import { MemoirStore } from '../lib/store.js'
import { makeTempWorkspace } from './helpers.ts'

for (const outcome of ['record', 'update', 'unresolved', 'failed'] as const) {
  test(`official tool results survive JSONL cold reopen: ${outcome}`, { timeout: 15_000 }, async () => {
    const ws = makeTempWorkspace()
    const ctx = new Context(), coldCtx = new Context()
    try {
      new SessionProjectionRegistry(ctx)
      new SessionStore(ctx)
      new AgentRegistry(ctx)
      new LlmRuntime(ctx)
      new SystemPrompt(ctx, {})
      new ToolRuntime(ctx)
      const storePath = join(ws.cwd, 'memory.json')
      const payload = { section: 'actions', title: 'Release protocol', content: 'Always run tests before publishing a package.' }
      const seed = outcome === 'unresolved' || outcome === 'update'
        ? new MemoirStore(storePath).record(ws.cwd, payload as Parameters<MemoirStore['record']>[1]) : undefined
      const toolName = outcome === 'failed' || outcome === 'update' ? 'memoir_update' : 'memoir_record'
      const args = toolName === 'memoir_update' ? { id: seed?.id ?? 'missing', importance: 5 } : payload
      let requests = 0
      class Adapter extends LlmAdapter {
        async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
          options.signal?.throwIfAborted()
          assert.ok(requests < 2)
          const blocks: ContentBlock[] = requests++ === 0
            ? [{ type: 'tool-call', id: ToolCallId('write'), name: toolName, arguments: JSON.stringify(args) }]
            : [{ type: 'text', text: 'Original task answer remains readable.' }]
          for (const [index, block] of blocks.entries()) {
            yield { type: 'block-start', index, blockType: block.type }
            yield { type: 'block-end', index, block }
          }
          yield { type: 'finish', reason: { kind: requests === 1 ? 'tool-calls' : 'stop' } }
        }
      }
      ctx.llm.registerAdapter(['fixture'], new Adapter())
      const loop = new AgentLoop(ctx, AgentLoop.Config({ agents: [], maxParallelToolCalls: 1 }))
      // Only the HTTP server is replaced: the plugin, event subscriptions,
      // tools, session, projection and agent execution use the real SDK.
      const pluginCtx = {
        sessionProjections: ctx.sessionProjections, tools: ctx.tools, systemPrompt: ctx.systemPrompt,
        on: ctx.on.bind(ctx), effect: ctx.effect.bind(ctx),
        webServer: { register: () => () => {} },
      } as unknown as Context
      apply(pluginCtx, { storePath, settingsPath: join(ws.cwd, 'settings.json'), autoDistill: false })
      const agent = await loop.create(SessionId(`persistence-${outcome}`), { provider: 'fixture', model: 'fixture' }, { cwd: ws.cwd })
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Save the verified memory.' }] }))
      await agent.whenIdle()
      assert.equal(requests, 2)
      const events = agent.session.snapshotEvents()
      assert.equal(events.some(event => event.type === 'dsh-memoir/written'), false)
      const result = events.find(event => event.type === 'tool/result')!
      assert.ok(result)
      const committed = outcome === 'record' || outcome === 'update'
      assert.equal(result.data.message.isError, outcome === 'failed')
      if (outcome !== 'failed') assert.deepEqual(result.data.meta, { memoir: { version: 1, persisted: committed } })
      assert.equal(ctx.sessionProjections.stateOf(agent.session, ACTIVITY_KEY)?.recorded, committed)

      const root = join(ws.cwd, 'sessions')
      const backend = new JsonlSessionPersistence(ctx, { root, compression: 'none' })
      const writer = await backend.create(agent.session.header)
      try { await writer.append(events); await writer.flush() } finally { await writer.close() }
      const coldBackend = new JsonlSessionPersistence(coldCtx, { root, compression: 'none' })
      const reader = await coldBackend.open(agent.session.id, 'read')
      try {
        const read = await reader.read()
        assert.deepEqual(read.events, events, 'cold reader accepts the entire history unchanged')
        const cold = Session.create(reader.id, read.events, reader.header)
        assert.equal(ctx.sessionProjections.stateOf(cold, ACTIVITY_KEY)?.recorded, committed)
        assert.ok(JSON.stringify(read.events).includes('Original task answer remains readable.'))
      } finally { await reader.close() }
    } finally { await ctx.fiber.dispose(); await coldCtx.fiber.dispose(); ws.cleanup() }
  })
}
