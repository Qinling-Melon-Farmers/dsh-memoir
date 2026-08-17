/**
 * MemoirStore tests: persistence round-trip, entry normalization/validation,
 * remove, markdown regeneration, project file writing, and corrupted-file
 * recovery.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MemoirStore, FORMAT_VERSION, SECTIONS, SECTION_KEYS, PROJECT_FILE,
  projectKey, projectTitle, formatTime, bounded, validateEntryPayload,
  withFileLock,
} from '../lib/store.js'
import { makeTempStorePath, makeTempWorkspace } from './helpers.ts'

test('validateEntryPayload rejects bad payloads', () => {
  assert.equal(typeof validateEntryPayload(null), 'string')
  assert.equal(typeof validateEntryPayload({ section: 'bogus', content: 'x' }), 'string')
  assert.equal(typeof validateEntryPayload({ section: 'work' }), 'string')
  assert.equal(typeof validateEntryPayload({ section: 'work', content: '   ' }), 'string')
  assert.equal(typeof validateEntryPayload({ section: 'work', content: 'x', title: 42 }), 'string')
  assert.equal(validateEntryPayload({ section: 'work', content: 'x' }), undefined)
  assert.equal(validateEntryPayload({ section: 'note', content: 'x', title: 't' }), undefined)
})

test('projectKey / projectTitle handle windows and posix paths', () => {
  // Windows variants normalize onto one key (drive letter case + separators).
  assert.equal(projectKey('C:\\work\\proj\\'), 'c:/work/proj')
  assert.equal(projectKey('c:/work/proj'), 'c:/work/proj')
  assert.equal(projectKey('c:\\work/proj/'), 'c:/work/proj')
  assert.equal(projectKey('/home/u/proj/'), '/home/u/proj')
  assert.equal(projectTitle('C:\\work\\proj'), 'proj')
  assert.equal(projectTitle('/home/u/proj'), 'proj')
  assert.equal(projectTitle('C:\\'), 'c:')
  // UNC / posix absolute paths keep their leading slashes.
  assert.equal(projectKey('//server/share'), '//server/share')
})

test('formatTime renders local YYYY-MM-DD HH:mm', () => {
  const out = formatTime(new Date(2026, 0, 15, 9, 5).getTime())
  assert.match(out, /^2026-01-15 09:05$/)
})

test('bounded trims to a tail', () => {
  assert.equal(bounded('short', 100), 'short')
  const out = bounded('a'.repeat(200), 100)
  assert.ok(out.length <= 200)
  assert.ok(out.includes('仅显示最近'))
  assert.ok(out.endsWith('a'.repeat(100)))
})

test('fresh store is empty', () => {
  const store = new MemoirStore(makeTempStorePath())
  assert.deepEqual(store.listProjects(), [])
  assert.equal(store.entries('C:\\x').length, 0)
  assert.equal(store.project('C:\\x'), undefined)
})

test('record appends, returns a full entry, persists, and regenerates the file', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const entry = store.record(ws.cwd, { section: 'lessons', title: '坑', content: '先备份再改' }, 's-1')
    assert.equal(entry.section, 'lessons')
    assert.equal(entry.title, '坑')
    assert.equal(entry.content, '先备份再改')
    assert.equal(entry.sessionId, 's-1')
    assert.ok(typeof entry.id === 'string' && entry.id.length > 0)
    assert.ok(Number.isFinite(entry.time))

    // Persistence: a second instance reads the same data.
    const reread = new MemoirStore(store.path)
    const entries = reread.entries(ws.cwd)
    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.id, entry.id)
    assert.equal(reread.project(ws.cwd)?.path, ws.cwd)
    assert.equal(reread.listProjects()[0]?.count, 1)

    // Project file regenerated with section headers.
    const file = join(ws.cwd, PROJECT_FILE)
    assert.ok(existsSync(file))
    const md = readFileSync(file, 'utf8')
    assert.ok(md.includes(SECTIONS.lessons.header))
    assert.ok(md.includes('坑 — 先备份再改'))
    assert.ok(md.includes('[经验教训]'))
    assert.ok(!md.includes(SECTIONS.work.header), 'empty sections are omitted')
  } finally {
    ws.cleanup()
  }
})

test('sections render in canonical order regardless of record order', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'actions', content: 'a' })
    store.record(ws.cwd, { section: 'work', content: 'w' })
    store.record(ws.cwd, { section: 'note', content: 'n' })
    store.record(ws.cwd, { section: 'lessons', content: 'l' })
    const md = store.renderMarkdown(ws.cwd)
    const positions = SECTION_KEYS.map((k) => md.indexOf(SECTIONS[k].header))
    assert.ok(positions.every((p) => p >= 0), 'all populated sections present')
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'sections in canonical order')
  } finally {
    ws.cleanup()
  }
})

test('remove deletes by id and regenerates', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const a = store.record(ws.cwd, { section: 'work', content: 'a' })
    const b = store.record(ws.cwd, { section: 'work', content: 'b' })
    assert.equal(store.remove(ws.cwd, a.id), true)
    assert.equal(store.remove(ws.cwd, a.id), false, 'second remove is a no-op')
    assert.equal(store.remove(ws.cwd, 'nope'), false)
    const entries = store.entries(ws.cwd)
    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.id, b.id)
    const md = store.renderMarkdown(ws.cwd)
    assert.ok(md.includes('b'))
    assert.ok(!md.includes('> 暂无条目'), 'placeholder gone while entries exist')
  } finally {
    ws.cleanup()
  }
})

test('empty project renders the placeholder', () => {
  const store = new MemoirStore(makeTempStorePath())
  const md = store.renderMarkdown('C:\\empty')
  assert.ok(md.includes('暂无条目'))
})

test('legacy v1 entries (no id) are normalized with minted ids', () => {
  const path = makeTempStorePath()
  writeFileSync(path, JSON.stringify({
    version: 1,
    projects: {
      'C:\\old': { path: 'C:\\old', title: 'old', updatedAt: 1000, entries: [{ section: 'work', content: 'legacy', time: 1000 }] },
    },
  }))
  const store = new MemoirStore(path)
  const entries = store.entries('C:\\old')
  assert.equal(entries.length, 1)
  assert.equal(entries[0]?.content, 'legacy')
  assert.ok((entries[0]?.id ?? '').length > 0)
  assert.equal(store.load().version, FORMAT_VERSION)
})

test('unknown sections in legacy data fall back to note', () => {
  const path = makeTempStorePath()
  writeFileSync(path, JSON.stringify({
    version: 1,
    projects: { 'C:\\x': { path: 'C:\\x', entries: [{ section: 'bogus', content: 'x', time: 1 }] } },
  }))
  const store = new MemoirStore(path)
  assert.equal(store.entries('C:\\x')[0]?.section, 'note')
})

test('corrupted store file recovers to an empty store', () => {
  const path = makeTempStorePath()
  writeFileSync(path, 'not json at all {{{')
  const store = new MemoirStore(path)
  assert.deepEqual(store.listProjects(), [])
  // The next save overwrites the corrupt file.
  const ws = makeTempWorkspace()
  try {
    store.record(ws.cwd, { section: 'work', content: 'recovered' })
    assert.equal(new MemoirStore(path).entries(ws.cwd).length, 1)
  } finally {
    ws.cleanup()
  }
})

test('withFileLock releases the lock when fn throws', () => {
  const ws = makeTempWorkspace()
  try {
    const lockPath = join(ws.dir, 'test.lock')
    assert.throws(() => withFileLock(lockPath, () => { throw new Error('boom') }), /boom/)
    assert.ok(!existsSync(lockPath), 'lock file removed after the exception')
  } finally {
    ws.cleanup()
  }
})

test('withFileLock times out when the lock is held elsewhere', () => {
  const ws = makeTempWorkspace()
  try {
    const lockPath = join(ws.dir, 'test.lock')
    writeFileSync(lockPath, 'held')
    assert.throws(
      () => withFileLock(lockPath, () => 'never', { retryMs: 10, timeoutMs: 120 }),
      /lock timeout/,
    )
  } finally {
    ws.cleanup()
  }
})

test('two store instances mutating one file lose no updates', () => {
  const path = makeTempStorePath()
  const ws = makeTempWorkspace()
  try {
    const a = new MemoirStore(path, { mtimeCheckIntervalMs: 0 })
    const b = new MemoirStore(path, { mtimeCheckIntervalMs: 0 })
    a.record(ws.cwd, { section: 'work', content: 'entry A' })
    b.record(ws.cwd, { section: 'work', content: 'entry B' })
    a.record(ws.cwd, { section: 'lessons', content: 'entry C' })
    const contents = new MemoirStore(path).entries(ws.cwd).map((e) => e.content)
    assert.deepEqual(contents.sort(), ['entry A', 'entry B', 'entry C'])
    assert.ok(!existsSync(path.replace(/\.json$/, '') + '.lock'), 'lock released after mutation')
  } finally {
    ws.cleanup()
  }
})

test('listProjects reports summaries sorted by insertion', () => {
  const store = new MemoirStore(makeTempStorePath())
  const a = makeTempWorkspace()
  const b = makeTempWorkspace()
  try {
    store.record(a.cwd, { section: 'work', content: 'x' })
    store.record(b.cwd, { section: 'note', content: 'y' })
    const projects = store.listProjects()
    assert.equal(projects.length, 2)
    assert.equal(projects[0]?.path, a.cwd)
    assert.equal(projects[0]?.title, projectTitle(a.cwd))
    assert.equal(projects[1]?.count, 1)
  } finally {
    a.cleanup()
    b.cleanup()
  }
})
