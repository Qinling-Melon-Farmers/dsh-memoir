/**
 * Tool tests: defineTool shapes (name/parameters/output schema) and execute
 * behavior against a temp store — record resolves the workspace from the
 * exec's agent session, read renders project/global/all with filters.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { MemoirStore, PROJECT_FILE } from '../lib/store.js'
import { memoirRecordTool, memoirReadTool, resolveWorkspace } from '../lib/tools.js'
import { makeExec, makeTempStorePath, makeTempWorkspace } from './helpers.ts'

test('resolveWorkspace extracts the agent session cwd', () => {
  assert.equal(resolveWorkspace(makeExec('C:\\proj')), 'C:\\proj')
  assert.equal(resolveWorkspace(undefined), undefined)
  assert.equal(resolveWorkspace({ agent: { session: { header: {} } } } as never), undefined)
})

test('tool factories produce well-formed defineTool definitions', () => {
  const store = new MemoirStore(makeTempStorePath())
  const record = memoirRecordTool(store)
  const read = memoirReadTool(store)
  for (const tool of [record, read]) {
    assert.ok(typeof tool.name === 'string' && tool.name.startsWith('memoir_'))
    assert.ok(typeof tool.description === 'string' && tool.description.length > 20)
    assert.ok(typeof tool.parameters === 'object' && tool.parameters !== null)
    assert.ok(tool.output && typeof tool.output.schema === 'object' && typeof tool.output.render === 'function')
    assert.ok(typeof tool.execute === 'function')
  }
  // defineTool normalizes parameters into a JSON-schema object: enum stays on
  // the property, `required: true` is hoisted into the top-level required list.
  const params = record.parameters as { properties: Record<string, { enum?: string[] }>; required: string[] }
  assert.ok(params.properties.section?.enum?.includes('work'))
  assert.ok(params.required.includes('section'))
  assert.ok(params.required.includes('content'))
  const readParams = read.parameters as { properties: Record<string, { enum?: string[] }> }
  assert.ok(readParams.properties.scope?.enum?.includes('all'))
  // Render helpers produce text blocks.
  const blocks = record.output.render({}, { section: 'work', id: 'x', projectFile: 'p', globalIndex: 'g', recordedAt: 't' })
  assert.equal(blocks[0]?.type, 'text')
})

test('memoir_record without a workspace throws a clear error', async () => {
  const store = new MemoirStore(makeTempStorePath())
  await assert.rejects(
    () => memoirRecordTool(store).execute({ section: 'work', content: 'x' }, {} as never),
    /无法确定会话工作区/,
  )
})

test('memoir_record writes to both project file and store', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const value = (await memoirRecordTool(store).execute(
      { section: 'actions', title: '下一步', content: '跑一次全量测试' },
      makeExec(ws.cwd, 's-9'),
    )) as { section: string; id: string }
    assert.equal(value.section, 'actions')
    assert.ok(value.id.length > 0)
    assert.ok(existsSync(join(ws.cwd, PROJECT_FILE)))
    assert.equal(store.entries(ws.cwd).length, 1)
    assert.equal(store.entries(ws.cwd)[0]?.sessionId, 's-9')
  } finally {
    ws.cleanup()
  }
})

test('memoir_read renders project memory grouped by section', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'work', title: '完成', content: '做了插件' })
    store.record(ws.cwd, { section: 'lessons', content: '先查契约再写码' })
    const value = (await memoirReadTool(store).execute({ scope: 'project' }, makeExec(ws.cwd))) as { text: string }
    assert.ok(value.text.includes('做了插件'))
    assert.ok(value.text.includes('先查契约再写码'))
    assert.ok(value.text.includes('工作记录'))
    assert.ok(value.text.includes('经验教训'))
  } finally {
    ws.cleanup()
  }
})

test('memoir_read section and query filters apply', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'work', content: 'alpha' })
    store.record(ws.cwd, { section: 'lessons', content: 'beta' })
    const read = memoirReadTool(store)

    const lessons = (await read.execute({ scope: 'project', section: 'lessons' }, makeExec(ws.cwd))) as { text: string }
    assert.ok(lessons.text.includes('beta'))
    assert.ok(!lessons.text.includes('alpha'))

    const miss = (await read.execute({ scope: 'project', query: 'zzz-no-such' }, makeExec(ws.cwd))) as { text: string }
    assert.ok(miss.text.includes('暂无匹配的'))

    const hit = (await read.execute({ scope: 'project', query: 'ALPHA' }, makeExec(ws.cwd))) as { text: string }
    assert.ok(hit.text.includes('alpha'))
    assert.ok(!hit.text.includes('beta'))
  } finally {
    ws.cleanup()
  }
})

test('memoir_read global aggregates every project, all merges both', async () => {
  const a = makeTempWorkspace()
  const b = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(a.cwd, { section: 'lessons', content: '坑A' })
    store.record(b.cwd, { section: 'lessons', content: '坑B' })
    const read = memoirReadTool(store)

    const global = (await read.execute({ scope: 'global' }, makeExec(a.cwd))) as { text: string }
    assert.ok(global.text.includes('坑A') && global.text.includes('坑B'))

    const all = (await read.execute({ scope: 'all' }, makeExec(a.cwd))) as { text: string }
    assert.ok(all.text.includes('坑A') && all.text.includes('坑B'), 'all includes global')
    assert.ok(all.text.includes('经验教训'), 'all includes the project render')

    const noCwd = (await read.execute({ scope: 'project' }, {} as never)) as { text: string }
    assert.ok(noCwd.text.includes('无法确定会话工作区'))
  } finally {
    a.cleanup()
    b.cleanup()
  }
})

test('memoir_read global with empty store reports empty', async () => {
  const store = new MemoirStore(makeTempStorePath())
  const value = (await memoirReadTool(store).execute({ scope: 'global' }, makeExec('C:\\x'))) as { text: string }
  assert.ok(value.text.includes('没有匹配的内容'))
})
