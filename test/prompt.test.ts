/** Real host registration and SDK rendering regressions for Hot Memory (#17). */
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry, assembleContextFor } from '@deepseek-ai/dsh-agent'
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { SystemPrompt, renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { apply, MEMOIR_GUIDANCE, MEMOIR_SECTION_HEADING, memoirSectionText } from '../lib/index.js'
import { MemoirStore, PROJECT_FILE } from '../lib/store.js'
import { MemorySnapshotManager, sessionKeyOf, snapshotHash } from '../lib/snapshot.js'
import { MemorySnapshotStore } from '../lib/snapshot-store.js'
import { DEFAULT_MEMORY_BUDGET, estimateTokens } from '../lib/selector.js'
import { ACTIVITY_KEY } from '../lib/activity.js'
import { callRoute, makeTempWorkspace } from './helpers.ts'

const ENV_CWD = '/host/environment/must-not-enter-memory'
const title = 'Templates {{asr}} / {{{cwd}}} / {{{{cwd}}}}'
const content = [
  '{{cwd}}', '{{unset}}', '{{anchor|X}}', '{{"type","json_object"}}',
  '{{{asr}}}', '{{{{asr}}}}', '{{asr}}{{cwd}}', '\\{{asr}}',
  '{"nested":{"ok":true}}', '{ { spaced } }', 'unfinished {{{{',
].join(' | ')
const sectionText = (body: string) => `${MEMOIR_GUIDANCE}\n\n${MEMOIR_SECTION_HEADING}\n${body}`
const memoirSection = (assembly: PromptAssembly) => {
  const section = assembly.sections.find(section => section.name === 'plugin:dsh-memoir')
  assert.ok(section, 'production apply() must register the memory section')
  return section
}

function fixture(t: TestContext) {
  const ws = makeTempWorkspace()
  t.after(ws.cleanup)
  const options = {
    storePath: join(ws.dir, 'memory.json'),
    settingsPath: join(ws.dir, 'settings.json'),
    language: () => 'zh' as const,
  }
  return { ...ws, options, store: new MemoirStore(options.storePath) }
}

/** Only HTTP registration is mocked. The section and its flag come from apply(). */
function hostFixture(t: TestContext, f: ReturnType<typeof fixture>) {
  const root = new Context()
  t.after(() => root.fiber.dispose())
  new SessionProjectionRegistry(root)
  new SessionStore(root)
  new AgentRegistry(root)
  new LlmRuntime(root)
  new SystemPrompt(root, { includeHarnessIdentity: false })
  new ToolRuntime(root)
  const loop = new AgentLoop(root, AgentLoop.Config({ agents: [] }))
  const routes: WebRoute[] = []
  Object.assign(root, { webServer: { register: (route: WebRoute) => {
    routes.push(route)
    return () => { routes.splice(routes.indexOf(route), 1) }
  } } })
  // Older AgentLoop versions already register cwd. Use a test-only variable
  // so this fixture exercises registered interpolation without overriding it.
  root.systemPrompt.variable('memoir_test_variable', () => ENV_CWD)
  root.systemPrompt.variable('unset', () => undefined)
  apply(root, {
    storePath: f.options.storePath, settingsPath: f.options.settingsPath,
    autoDistill: false, sessionSnapshotMax: 1,
  })
  return {
    root,
    prompt: root.systemPrompt,
    async context(id: string) {
      // No turn is submitted, so creating real agents needs no model/network call.
      const agent = await loop.create(SessionId(id), {}, { cwd: f.cwd })
      assert.ok(root.sessionProjections.stateOf(agent.session, ACTIVITY_KEY))
      return assembleContextFor(agent)
    },
    async restored() {
      const result = await callRoute(routes[0]!.handler, { url: '/api/dsh-memoir/diagnostics' })
      assert.equal(result.status, 200)
      return (result.envelope.value as { snapshotPersistence: { restored: number } }).snapshotPersistence.restored
    },
  }
}

function snapshotRecord(f: ReturnType<typeof fixture>, key: string) {
  const disk = new MemorySnapshotStore(f.options)
  const directory = join(disk.directory, disk.scope())
  const path = readdirSync(directory).map(name => join(directory, name)).find(path =>
    path.endsWith('.json') && JSON.parse(readFileSync(path, 'utf8')).snapshot.sessionKey === key)
  assert.ok(path, 'the production snapshot must be persisted')
  const bytes = readFileSync(path)
  return { path, bytes, snapshot: JSON.parse(bytes.toString()).snapshot }
}

test('SDK without the literal flag rejects memory templates after assembly; registered variables expand', async (t) => {
  const root = new Context()
  t.after(() => root.fiber.dispose())
  new SystemPrompt(root, { includeHarnessIdentity: false })
  root.systemPrompt.variable('cwd', () => ENV_CWD)
  root.systemPrompt.variable('unset', () => undefined)
  let source = ''
  root.systemPrompt.section({ name: 'plugin:dsh-memoir', order: 150, text: () => source })
  root.on('system-prompt/assemble', (assembly, _context, next) => {
    assert.equal(memoirSection(assembly).text, source, 'waterfall sees uninterpolated provider output')
    assert.equal(assembly.variables.cwd, ENV_CWD, 'variable providers have already run')
    return next()
  })
  for (const raw of ['{{asr}}', '{{anchor|X}}', '{{"type","json_object"}}', '{{{cwd}}}', '{{{{cwd}}}}', '{{unset}}']) {
    source = raw
    const assembly = await root.systemPrompt.assemble()
    assert.throws(() => renderPrompt(assembly), /prompt variable/)
  }
  source = '{{cwd}}'
  assert.equal(renderPrompt(await root.systemPrompt.assemble()), ENV_CWD)
  root.systemPrompt.variable('memory', () => content)
  source = '{{memory}}'
  assert.equal(renderPrompt(await root.systemPrompt.assemble()), content, 'substituted values are not scanned again')
})

test('production apply preserves new memory, snapshots and final prompts literally across writes and remounts', async (t) => {
  const f = fixture(t)
  f.store.record(f.cwd, { section: 'lessons', title, content })
  const stored = readFileSync(f.options.storePath)
  const markdown = readFileSync(join(f.cwd, PROJECT_FILE))
  const host = hostFixture(t, f)
  const context = await host.context('new-durable')
  const assembly = await host.prompt.assemble(context)
  assert.equal(memoirSection(assembly).interpolate, false, 'flag must be set by production apply(), not the fixture')
  assert.equal(assembly.tools.length, 3, 'real ToolRuntime contributes the three memoir schemas')
  const output = renderPrompt(assembly)
  assert.equal(output, memoirSection(assembly).text)
  assert.equal(output, memoirSectionText(f.store, context), 'helper and final prompt preserve the same bytes')
  assert.ok(output.includes(title))
  assert.ok(output.includes(content))
  assert.ok(!output.includes(ENV_CWD))
  // Removing only the production flag reproduces the original failure.
  assert.throws(() => renderPrompt({ ...assembly, sections: assembly.sections.map(section =>
    section.name === 'plugin:dsh-memoir' ? { ...section, interpolate: undefined } : section) }), /prompt variable/)
  const record = snapshotRecord(f, sessionKeyOf(context)!)
  assert.equal(record.snapshot.text, output)
  assert.equal(record.snapshot.hash, snapshotHash(output))
  assert.equal(renderPrompt(await host.prompt.assemble(context)), output)
  assert.deepEqual(readFileSync(f.options.storePath), stored)
  assert.deepEqual(readFileSync(join(f.cwd, PROJECT_FILE)), markdown)
  assert.equal(f.store.entries(f.cwd)[0]!.title, title)
  assert.equal(f.store.entries(f.cwd)[0]!.content, content)
  f.store.record(f.cwd, { section: 'actions', content: 'Added after the first assembly' })
  assert.equal(renderPrompt(await host.prompt.assemble(context)), output)
  const cold = hostFixture(t, f)
  assert.equal(renderPrompt(await cold.prompt.assemble(await cold.context('new-durable'))), output)
  assert.equal(await cold.restored(), 1)
  assert.deepEqual(readFileSync(record.path), record.bytes)
  const fresh = renderPrompt(await cold.prompt.assemble(await cold.context('fork')))
  assert.ok(fresh.includes('Added after the first assembly'))
  assert.ok(fresh.includes(title))
})

test('production apply keeps registered variables literal even without any unknown variables', async (t) => {
  const f = fixture(t)
  f.store.record(f.cwd, { section: 'lessons', content: 'Example {{memoir_test_variable}} must stay literal.' })
  const host = hostFixture(t, f)
  const assembly = await host.prompt.assemble(await host.context('registered-only'))
  assert.equal(assembly.variables.memoir_test_variable, ENV_CWD)
  assert.equal(memoirSection(assembly).interpolate, false)
  const output = renderPrompt(assembly)
  assert.ok(output.includes('Example {{memoir_test_variable}} must stay literal.'))
  assert.ok(!output.includes(ENV_CWD))
})

test('helper returns raw memory without a manager or a session identity', (t) => {
  const f = fixture(t)
  f.store.record(f.cwd, { section: 'lessons', title, content })
  for (const id of [undefined, 'unfrozen']) {
    const context = { agent: { session: { id, header: { cwd: f.cwd } } } }
    const manager = id === undefined ? new MemorySnapshotManager() : undefined
    const output = memoirSectionText(f.store, context, manager)
    assert.ok(output.includes(title))
    assert.ok(output.includes(content))
    if (manager) assert.equal(manager.size, 0)
  }
})

test('helper preserves an already-frozen legacy LRU snapshot without mutation or rebuilding', (t) => {
  const f = fixture(t)
  const context = { agent: { session: { id: 'legacy-resident', header: { cwd: f.cwd } } } }
  const key = sessionKeyOf(context)!
  const manager = new MemorySnapshotManager()
  const raw = sectionText(`${title}\n${content}`)
  const frozen = manager.getOrCreate(key, () => ({ storeRevision: 0, text: raw }))
  f.store.record(f.cwd, { section: 'actions', content: 'Newer memory must not replace the frozen baseline' })
  assert.equal(memoirSectionText(f.store, context, manager), raw)
  assert.strictEqual(manager.peek(key), frozen)
  assert.ok(Object.isFrozen(frozen))
  assert.equal(frozen.hash, snapshotHash(raw))
  assert.equal(frozen.storeRevision, 0)
})

for (const legacy of [true, false]) {
  test(`production apply preserves ${legacy ? 'template-bearing' : 'ordinary'} legacy snapshots in LRU, after eviction and on remount`, async (t) => {
    const f = fixture(t)
    const host = hostFixture(t, f)
    const context = await host.context('legacy-disk')
    const key = sessionKeyOf(context)!
    const raw = sectionText(legacy ? `${title}\n${content}` : 'Keep ordinary {JSON} and 中文 memory byte-for-byte.')
    const seed = new MemorySnapshotManager({ persistence: new MemorySnapshotStore(f.options) })
    const frozen = seed.getOrCreate(key, () => ({ storeRevision: 0, text: raw }))
    const record = snapshotRecord(f, key)
    f.store.record(f.cwd, { section: 'actions', content: 'New memory belongs only to a new session' })
    const stored = readFileSync(f.options.storePath)
    const first = await host.prompt.assemble(context)
    assert.equal(memoirSection(first).interpolate, false)
    assert.equal(renderPrompt(first), raw)
    assert.equal(await host.restored(), 1)
    assert.equal(renderPrompt(await host.prompt.assemble(context)), raw)
    assert.equal(await host.restored(), 1, 'second assembly uses the legacy resident LRU, not disk or a rebuild')
    const fresh = renderPrompt(await host.prompt.assemble(await host.context('evict')))
    assert.ok(fresh.includes('New memory belongs only to a new session'))
    assert.equal(renderPrompt(await host.prompt.assemble(context)), raw)
    assert.equal(await host.restored(), 2, 'LRU eviction restores the original durable snapshot')
    const cold = hostFixture(t, f)
    assert.equal(renderPrompt(await cold.prompt.assemble(await cold.context('legacy-disk'))), raw)
    assert.equal(await cold.restored(), 1)
    assert.deepEqual(snapshotRecord(f, key).snapshot, frozen)
    assert.deepEqual(readFileSync(record.path), record.bytes, 'text, hash, timestamp and revision are unchanged')
    assert.deepEqual(readFileSync(f.options.storePath), stored)
  })
}

test('production literal section does not increase the hard budget for very long brace runs', async (t) => {
  const f = fixture(t)
  const longContent = '{{cwd}} ' + '{'.repeat(10_000) + 'asr}}'
  f.store.record(f.cwd, { section: 'lessons', title: 'Long run', content: longContent })
  const host = hostFixture(t, f)
  const context = await host.context('budget')
  const assembly = await host.prompt.assemble(context)
  const output = renderPrompt(assembly)
  const record = snapshotRecord(f, sessionKeyOf(context)!)
  const prefix = `${MEMOIR_GUIDANCE}\n\n${MEMOIR_SECTION_HEADING}\n`
  assert.ok(output.startsWith(prefix))
  assert.equal(output, memoirSection(assembly).text)
  assert.equal(output, record.snapshot.text)
  assert.equal(output, memoirSectionText(f.store, context))
  assert.ok(output.includes('{{cwd}}'))
  assert.ok(output.includes('{{{{'))
  assert.equal(estimateTokens(output), estimateTokens(record.snapshot.text))
  assert.ok(estimateTokens(output.slice(prefix.length)) <= DEFAULT_MEMORY_BUDGET.hardMaxTokens)
  assert.equal(f.store.entries(f.cwd)[0]!.content, longContent)
})
