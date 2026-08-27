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
import { memoirRecordTool, memoirReadTool, memoirUpdateTool, resolveMemorySource, resolveWorkspace } from '../lib/tools.js'
import { RetrievalEngine } from '../lib/retrieval.js'
import { makeExec, makeTempStorePath, makeTempWorkspace } from './helpers.ts'

test('resolveWorkspace extracts the agent session cwd', () => {
  assert.equal(resolveWorkspace(makeExec('C:\\proj')), 'C:\\proj')
  assert.equal(resolveWorkspace(undefined), undefined)
  assert.equal(resolveWorkspace({ agent: { session: { header: {} } } } as never), undefined)
})

test('tool factories produce well-formed defineTool definitions', () => {
  const store = new MemoirStore(makeTempStorePath())
  const record = memoirRecordTool(store, new RetrievalEngine(store))
  const read = memoirReadTool(store)
  const update = memoirUpdateTool(store)
  for (const tool of [record, read, update]) {
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
  const updateParams = update.parameters as { properties: Record<string, { type?: string }>; required: string[] }
  assert.equal(updateParams.properties.id?.type, 'string')
  assert.ok(updateParams.required.includes('id'))
  // Render helpers produce text blocks.
  const blocks = record.output.render({}, { section: 'work', action: 'recorded', recorded: true, id: 'x', projectFile: 'p', globalIndex: 'g', recordedAt: 't', candidates: [] })
  assert.equal(blocks[0]?.type, 'text')
})

test('memoir_update edits an existing entry from the agent workspace', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const entry = store.record(ws.cwd, { section: 'work', title: '旧标题', content: '旧内容' })
    const value = (await memoirUpdateTool(store).execute(
      { id: entry.id, section: 'actions', title: '新标题', content: '新内容', status: 'archived' },
      makeExec(ws.cwd),
    )) as { id: string; section: string; status: string; updated: boolean }
    assert.deepEqual(value, { id: entry.id, section: 'actions', status: 'archived', updated: true })
    const updated = store.entries(ws.cwd).find((item) => item.id === entry.id)
    assert.equal(updated?.title, '新标题')
    assert.equal(updated?.content, '新内容')
    assert.equal(updated?.status, 'archived')
  } finally {
    ws.cleanup()
  }
})

test('memoir_record without a workspace throws a clear error', async () => {
  const store = new MemoirStore(makeTempStorePath())
  await assert.rejects(
    () => memoirRecordTool(store, new RetrievalEngine(store)).execute({ section: 'work', content: 'x' }, {} as never),
    /无法确定会话工作区/,
  )
})

test('memoir_record writes to both project file and store', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const value = (await memoirRecordTool(store, new RetrievalEngine(store)).execute(
      { section: 'actions', title: '下一步', content: '跑一次全量测试' },
      makeExec(ws.cwd, 's-9', 12),
    )) as { section: string; id: string; action: string }
    assert.equal(value.section, 'actions')
    assert.equal(value.action, 'recorded')
    assert.ok(value.id.length > 0)
    assert.ok(existsSync(join(ws.cwd, PROJECT_FILE)))
    assert.equal(store.entries(ws.cwd).length, 1)
    assert.deepEqual(store.entries(ws.cwd)[0]?.source, { sessionId: 's-9', turnId: 12 })
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

test('memoir_read default limit 8 with compact one-line entries', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    for (let i = 0; i < 10; i++) store.record(ws.cwd, { section: 'work', content: '工作' + i })
    const read = memoirReadTool(store)
    const value = (await read.execute({ scope: 'project' }, makeExec(ws.cwd))) as { text: string }
    const bullets = (value.text.match(/^- \[/gm) ?? []).length
    assert.equal(bullets, 8, 'default limit 8')
    assert.ok(value.text.includes('共 10 条'), 'truncation note present')
    assert.ok(value.text.includes('工作9'), 'newest entries kept')
    assert.ok(!value.text.includes('工作0'), 'oldest dropped')
    // compact shape: id prefix + content, no timestamps
    assert.match(value.text, /- \[[0-9a-f]+\] /)
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(value.text), 'no timestamps in compact')
  } finally {
    ws.cleanup()
  }
})

test('memoir_read global ranked limit is a true global Top-K (not per project)', async () => {
  const workspaces = Array.from({ length: 20 }, () => makeTempWorkspace())
  try {
    const store = new MemoirStore(makeTempStorePath())
    for (const ws of workspaces) {
      store.record(ws.cwd, { section: 'lessons', content: '共享关键词' })
    }
    const retrieval = new RetrievalEngine(store)
    const read = memoirReadTool(store, { defaultLimit: 8, maxLimit: 30 }, retrieval)
    const value = (await read.execute({ scope: 'global', query: '共享关键词', limit: 8 }, makeExec(workspaces[0].cwd))) as { text: string }
    const bullets = (value.text.match(/^- \[/gm) ?? []).length
    assert.ok(bullets > 0, 'some ranked results present')
    assert.ok(bullets <= 8, 'total entries ≤ limit across all projects, got ' + bullets)
  } finally {
    for (const ws of workspaces) ws.cleanup()
  }
})

test('memoir_read output budget preserves the top-ranked head', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    // 30 entries, ~650 chars each → full output ≈ 20k chars > 16k budget.
    for (let i = 0; i < 30; i++) {
      store.record(ws.cwd, { section: 'lessons', content: 'key-' + i + ' ' + 'x'.repeat(600) })
    }
    const retrieval = new RetrievalEngine(store)
    const read = memoirReadTool(store, { defaultLimit: 8, maxLimit: 30 }, retrieval)
    const value = (await read.execute({ scope: 'project', query: 'key', limit: 30, detail: 'full' }, makeExec(ws.cwd))) as { text: string }
    assert.ok(value.text.includes('已保留相关性最高'), 'budget clip note present')
    assert.ok(value.text.includes('key-29'), 'newest (top-ranked) entry survives truncation')
    assert.ok(!value.text.includes('key-0 '), 'oldest (lowest-ranked) entry dropped by the budget')
  } finally {
    ws.cleanup()
  }
})

test('memoir_read limit/detail: full restores timestamps, limit clamps to max', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    for (let i = 0; i < 10; i++) store.record(ws.cwd, { section: 'lessons', content: '教训' + i })
    const read = memoirReadTool(store, { defaultLimit: 3, maxLimit: 5 })
    const value = (await read.execute({ scope: 'project' }, makeExec(ws.cwd))) as { text: string }
    assert.equal((value.text.match(/^- \[/gm) ?? []).length, 3, 'defaultLimit from options')
    const full = (await read.execute({ scope: 'project', limit: 99, detail: 'full' }, makeExec(ws.cwd))) as { text: string }
    assert.equal((full.text.match(/^- \[/gm) ?? []).length, 5, 'limit clamped to maxLimit')
    assert.match(full.text, /\d{4}-\d{2}-\d{2}/, 'full detail has timestamps')
    assert.ok(full.text.includes('经验教训'))
  } finally {
    ws.cleanup()
  }
})

test('resolveMemorySource correlates the tool call with its DSH turn', () => {
  assert.deepEqual(resolveMemorySource(makeExec('C:\\proj', 'session-source', 7)), { sessionId: 'session-source', turnId: 7 })
  assert.equal(resolveMemorySource(undefined), undefined)
})

test('memoir_read reads live default and maximum limits for each call', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    for (let i = 0; i < 8; i++) store.record(ws.cwd, { section: 'work', content: 'live-' + i })
    let options = { defaultLimit: 2, maxLimit: 3 }
    const read = memoirReadTool(store, () => options)
    const first = (await read.execute({ scope: 'project' }, makeExec(ws.cwd))) as { text: string }
    assert.equal((first.text.match(/^- \[/gm) ?? []).length, 2)
    options = { defaultLimit: 4, maxLimit: 5 }
    const second = (await read.execute({ scope: 'project', limit: 99 }, makeExec(ws.cwd))) as { text: string }
    assert.equal((second.text.match(/^- \[/gm) ?? []).length, 5)
  } finally {
    ws.cleanup()
  }
})

test('memoir_record returns candidates before applying an explicit resolution', async () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const old = store.record(ws.cwd, { section: 'lessons', title: '发布认证', content: '使用 npm token 发布。' + '旧发布细节'.repeat(200) })
    const record = memoirRecordTool(store, new RetrievalEngine(store))
    const args = { section: 'lessons' as const, title: '发布认证', content: '使用 npm OIDC trusted publishing 发布。' }

    const pending = (await record.execute(args, makeExec(ws.cwd))) as { action: string; recorded: boolean; candidates: Array<{ id: string; content: string }> }
    assert.equal(pending.action, 'needs-resolution')
    assert.equal(pending.recorded, false)
    assert.equal(pending.candidates[0]?.id, old.id)
    assert.ok((pending.candidates[0]?.content.length ?? 0) <= 601, 'model-facing candidates stay bounded')
    assert.equal(store.entries(ws.cwd).length, 1)

    const superseded = (await record.execute({ ...args, resolution: 'supersede', targetId: old.id }, makeExec(ws.cwd, 's-resolution', 8))) as { action: string; id: string }
    assert.equal(superseded.action, 'superseded')
    assert.notEqual(superseded.id, old.id)
    assert.equal(store.entries(ws.cwd).find((entry) => entry.id === old.id)?.status, 'superseded')
  } finally {
    ws.cleanup()
  }
})

