import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { MemoirStore } from '../lib/store.js'
import { RetrievalEngine } from '../lib/retrieval.js'
import { governedRecord } from '../lib/governance.js'
import { makeTempWorkspace } from './helpers.ts'

test('stale instance cannot append a concurrent duplicate', () => {
  const ws = makeTempWorkspace()
  try {
    const path = join(ws.dir, 'store.json')
    const a = new MemoirStore(path), b = new MemoirStore(path)
    const retrieval = new RetrievalEngine(a)
    const payload = { section: 'lessons' as const, title: 'Cache policy', content: 'Keep cache capacity at 128 entries.' }
    a.load()
    b.record(ws.cwd, payload)
    const result = governedRecord(a, retrieval, ws.cwd, payload)
    assert.equal(result.action, 'needs-resolution')
    assert.equal(b.entries(ws.cwd).length, 1)
  } finally { ws.cleanup() }
})

test('an exact duplicate with no searchable tokens still requires resolution', () => {
  const ws = makeTempWorkspace()
  try {
    const path = join(ws.dir, 'store.json')
    const a = new MemoirStore(path), b = new MemoirStore(path)
    const payload = { section: 'note' as const, content: '!!!' }
    a.load()
    const original = b.record(ws.cwd, payload)
    const result = governedRecord(a, new RetrievalEngine(a), ws.cwd, payload)
    assert.equal(result.action, 'needs-resolution')
    assert.equal(result.candidates[0]?.entry.id, original.id)
    assert.equal(new MemoirStore(path).entries(ws.cwd).length, 1)
  } finally { ws.cleanup() }
})

test('two processes deciding simultaneously cannot silently insert the same memory twice', async () => {
  const ws = makeTempWorkspace()
  try {
    const base = new URL('../lib/', import.meta.url)
    const script = `
      import { MemoirStore } from ${JSON.stringify(new URL('store.js', base).href)};
      import { RetrievalEngine } from ${JSON.stringify(new URL('retrieval.js', base).href)};
      import { governedRecord } from ${JSON.stringify(new URL('governance.js', base).href)};
      const store = new MemoirStore(process.argv[1]);
      const retrieval = new RetrievalEngine(store);
      store.load();
      console.log('ready');
      process.stdin.once('data', () => {
        const result = governedRecord(store, retrieval, process.argv[2], {section:'lessons', title:'Concurrent cache policy', content:'Use a shared cache capacity of 128 entries.'});
        console.log(result.action);
        process.exit(0);
      });
    `
    const children = [0, 1].map(() => spawn(process.execPath, ['--input-type=module', '-e', script, join(ws.dir, 'store.json'), ws.cwd], { stdio: ['pipe', 'pipe', 'pipe'] }))
    const output = ['', '']
    const ready = children.map((child, index) => new Promise<void>((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', (code) => { if (!output[index].includes('ready\n')) reject(new Error(`child exited before ready: ${code}`)) })
      child.stdout.on('data', (chunk: Buffer) => { output[index] += chunk.toString(); if (output[index].includes('ready\n')) resolve() })
    }))
    const exits = children.map((child) => once(child, 'exit'))
    await Promise.all(ready)
    for (const child of children) child.stdin.end('go')
    const codes = await Promise.all(exits)
    assert.deepEqual(codes.map(([code]) => code), [0, 0])
    assert.deepEqual(output.map((value) => value.trim().split(/\s+/).at(-1)).sort(), ['needs-resolution', 'recorded'])
    assert.equal(new MemoirStore(join(ws.dir, 'store.json')).entries(ws.cwd).length, 1)
  } finally { ws.cleanup() }
})

test('stale candidate cannot update or supersede a newer or archived target', () => {
  for (const patch of [{ content: 'Keep cache capacity at 512 entries.' }, { status: 'archived' as const }]) {
    for (const resolution of ['update', 'supersede'] as const) {
      const ws = makeTempWorkspace()
      try {
        const path = join(ws.dir, 'store.json')
        const a = new MemoirStore(path), b = new MemoirStore(path)
        const original = b.record(ws.cwd, { section: 'lessons', title: 'Cache policy', content: 'Keep cache capacity at 64 entries.' })
        const retrieval = new RetrievalEngine(a)
        const proposal = { section: 'lessons' as const, title: 'Cache policy', content: 'Keep cache capacity at 128 entries.' }
        assert.equal(governedRecord(a, retrieval, ws.cwd, proposal).action, 'needs-resolution')
        b.update(ws.cwd, original.id, patch)
        assert.throws(() => governedRecord(a, retrieval, ws.cwd, proposal, { resolution, targetId: original.id }))
        const current = new MemoirStore(path).entries(ws.cwd)[0]
        assert.equal(current.content, patch.content ?? original.content)
        assert.equal(current.status, patch.status ?? 'active')
        assert.equal(new MemoirStore(path).entries(ws.cwd).length, 1)
      } finally { ws.cleanup() }
    }
  }
})

test('changed candidate errors use the requested language', () => {
  const cases = [
    ['zh', '相似候选已发生变化'],
    ['en', 'Similarity candidate changed'],
    ['de', 'Der ähnliche Kandidat wurde geändert'],
    ['ru', 'Похожий кандидат изменился'],
  ] as const
  for (const [language, expected] of cases) {
    const ws = makeTempWorkspace()
    try {
      const path = join(ws.dir, 'store.json')
      const a = new MemoirStore(path), b = new MemoirStore(path)
      const old = b.record(ws.cwd, { section: 'lessons', title: 'Cache policy', content: 'Keep cache capacity at 64 entries.' })
      const retrieval = new RetrievalEngine(a)
      const proposal = { section: 'lessons' as const, title: 'Cache policy', content: 'Keep cache capacity at 128 entries.' }
      assert.equal(governedRecord(a, retrieval, ws.cwd, proposal, { language }).action, 'needs-resolution')
      b.update(ws.cwd, old.id, { content: 'Keep cache capacity at 512 entries.' })
      assert.throws(() => governedRecord(a, retrieval, ws.cwd, proposal, { language, resolution: 'update', targetId: old.id }), (error: Error) => error.message.includes(expected))
      assert.equal(new MemoirStore(path).entries(ws.cwd)[0].content, 'Keep cache capacity at 512 entries.')
    } finally { ws.cleanup() }
  }
})
