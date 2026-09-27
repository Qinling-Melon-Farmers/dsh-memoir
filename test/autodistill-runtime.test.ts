/** Real npm AgentLoop, deterministic adapter, no network or user data. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop'
import { SessionStore, SessionId, Session } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { LlmAdapter, LlmRuntime, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, StreamChunk, GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime, defineTool } from '@deepseek-ai/dsh-tools'
import { ACTIVITY_KEY, activityProjection } from '../lib/activity.js'
import { DistillDiagnostics, installAutoDistill } from '../lib/autodistill.js'

const answer = 'Original task answer: verified findings, caveats and next steps.\n'.repeat(30)
const text = (value: string): ContentBlock[] => value ? [{ type: 'text', text: value }] : []
const call = (id: string): ContentBlock[] => [{ type: 'tool-call', id: ToolCallId(id), name: 'probe', arguments: '{}' }]

for (const ending of ['receipt', 'empty', 'failed-tool', 'canceled'] as const) {
  test(`real AgentLoop keeps original answer in its own turn: ${ending}`, { timeout: 10_000 }, async () => {
    const ctx = new Context()
    let calls = 0
    const replies = [call('work'), text(answer), ...(ending === 'failed-tool' ? [call('failed-write'), []] : [text(ending === 'receipt' ? 'Memory saved.' : '')])]
    class Adapter extends LlmAdapter {
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        assert.ok(calls < replies.length, 'distillation must not trigger another distillation')
        const blocks = replies[calls++]!
        options.signal?.throwIfAborted()
        for (const [index, block] of blocks.entries()) {
          yield { type: 'block-start', index, blockType: block.type }
          yield { type: 'block-end', index, block }
        }
        yield { type: 'finish', reason: { kind: blocks.some(block => block.type === 'tool-call') ? 'tool-calls' : 'stop' } }
      }
    }
    new SessionProjectionRegistry(ctx)
    new SessionStore(ctx)
    new AgentRegistry(ctx)
    new LlmRuntime(ctx)
    new SystemPrompt(ctx, {})
    new ToolRuntime(ctx)
    ctx.llm.registerAdapter(['fixture'], new Adapter())
    ctx.tools.register(defineTool({
      name: 'probe', description: 'Deterministic test work', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => text(value) },
      async execute(_args, exec) {
        if (String(exec.callId) === 'failed-write') throw new Error('Synthetic write failure')
        return 'done'
      },
    }))
    const loop = new AgentLoop(ctx, AgentLoop.Config({ agents: [], maxParallelToolCalls: 1 }))
    ctx.sessionProjections.register(activityProjection)
    const diagnostics = new DistillDiagnostics()
    const dispose = installAutoDistill({ on: (_name, fn) => ctx.on('agent/turn-stopping', payload => fn(payload)) }, {
      enabled: () => true, diagnostics,
      activity: agent => ctx.sessionProjections.stateOf(agent.session as Session, ACTIVITY_KEY),
    })
    try {
      const agent = await loop.create(SessionId(`compact-${ending}`), { provider: 'fixture', model: 'fixture' })
      if (ending === 'canceled') ctx.on('agent/turn-stopping', ({ agent: current, turn }) => {
        if (current.id === agent.id && turn === 1) current.inbox.clear()
      })
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: text('Complete the task') as [{ type: 'text'; text: string }] }))
      await agent.whenIdle()
      const events = agent.session.snapshotEvents()
      const ends = events.filter(event => event.type === 'turn/end')
      assert.deepEqual(ends.map(event => event.data.reason?.kind), ending === 'canceled' ? ['completed'] : ['completed', 'completed'], JSON.stringify(ends))
      const assistants = events.filter(event => event.type === 'assistant/message')
      // The task answer remains the last assistant step of turn 1, regardless
      // of the shape (or existence) of the separate wrap-up turn's last step.
      const original = assistants.filter(event => event.data.turn === 1).at(-1)!
      assert.ok(JSON.stringify(original).includes('Original task answer'))
      assert.equal(original.data.step, 2)
      const reminder = events.find(event => event.type === 'agent/inbox/spliced' && event.data.inserted.some(message => message.source.kind === 'dsh-memoir'))!
      assert.equal((reminder.data as { target: string }).target, 'next-turn')
      assert.equal(diagnostics.snapshot().counts.queued, 1)
      assert.equal(diagnostics.snapshot().workedTurns, 1)
      if (ending !== 'canceled') {
        assert.equal(diagnostics.snapshot().counts.distillation, 1)
        assert.equal(ctx.sessionProjections.stateOf(agent.session, ACTIVITY_KEY)?.distilling, true)
        // Cold restore/remount uses durable source identity, not in-memory gates.
        const cold = Session.create(agent.session.id, events, agent.session.header)
        assert.equal(ctx.sessionProjections.stateOf(cold, ACTIVITY_KEY)?.distilling, true)
      }
      assert.equal(calls, ending === 'canceled' ? 2 : replies.length)
    } finally { dispose(); await ctx.fiber.dispose() }
  })
}
