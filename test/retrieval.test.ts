/**
 * retrieval.ts tests (roadmap §2.4):
 *   - tokenizer: chinese n-grams, english words, path/code identifiers
 *   - BM25 + title boost + exact-phrase boost + section weight + recency
 *   - index rebuilds when the store epoch changes
 *   - epoch-aware LRU query cache: hit on repeat, invalidated by writes
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoirStore } from '../lib/store.js'
import { LruCache, RetrievalEngine, tokenize, tokenizeDocument, tokenizeQuery } from '../lib/retrieval.js'
import { makeTempStorePath, makeTempWorkspace } from './helpers.ts'

test('tokenize: chinese 2-grams and 3-grams', () => {
  const tokens = tokenize('中文乱码')
  assert.ok(tokens.includes('中文'))
  assert.ok(tokens.includes('文乱'))
  assert.ok(tokens.includes('乱码'))
  assert.ok(tokens.includes('中文乱'))
  assert.ok(tokens.includes('文乱码'))
  assert.deepEqual(tokenize('坑'), ['坑'], 'single char kept')
})

test('tokenize: english words, paths, and camelCase identifiers', () => {
  const tokens = tokenize('src/host/store.ts memoir_record AutoDistillGate')
  for (const expected of ['src', 'host', 'store', 'ts', 'memoir_record', 'memoir', 'record', 'autodistillgate', 'auto', 'distill', 'gate']) {
    assert.ok(tokens.includes(expected), 'missing token: ' + expected)
  }
  assert.ok(!tokens.includes('/'), 'separators are not tokens')
})

test('BM25 ranks the unique match first, title boost above body-only', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    // Three docs share the word "cache"; the expected one has it in title too.
    store.record(ws.cwd, { section: 'work', content: '关于 cache 的一般记录' })
    store.record(ws.cwd, { section: 'work', content: '一条提到 cache 的普通记录' })
    store.record(ws.cwd, { section: 'lessons', title: 'cache 失效策略', content: '按 epoch 失效 query cache' })
    const engine = new RetrievalEngine(store)
    const ranked = engine.search('cache', { cwd: ws.cwd })
    assert.equal(ranked.length, 3)
    assert.equal(ranked[0].entry.title, 'cache 失效策略', 'title boost wins')
    assert.ok(ranked[0].score > ranked[1].score)
  } finally {
    ws.cleanup()
  }
})

test('exact phrase boost lifts the entry containing the full phrase', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'work', content: '控制台编码问题' })
    store.record(ws.cwd, { section: 'work', content: '控制台中文乱码先 chcp 65001' })
    const engine = new RetrievalEngine(store)
    const ranked = engine.search('控制台中文乱码', { cwd: ws.cwd })
    assert.ok(ranked[0].entry.content.includes('chcp'), 'exact phrase wins over loose matches')
  } finally {
    ws.cleanup()
  }
})

test('section weight and recency order same-score docs', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'note', title: '统一关键词', content: '统一关键词' })
    store.record(ws.cwd, { section: 'work', title: '统一关键词', content: '统一关键词' })
    store.record(ws.cwd, { section: 'actions', title: '统一关键词', content: '统一关键词' })
    const engine = new RetrievalEngine(store)
    const ranked = engine.search('统一关键词', { cwd: ws.cwd })
    assert.equal(ranked.length, 3)
    assert.equal(ranked[0].entry.section, 'actions', 'section weight orders ties')
    assert.equal(ranked[2].entry.section, 'note')
  } finally {
    ws.cleanup()
  }
})

test('query LRU cache: repeat query hits, store write invalidates', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'lessons', content: '乱码先 chcp 65001' })
    const engine = new RetrievalEngine(store)
    const first = engine.cachedSearch('乱码', { cwd: ws.cwd })
    const second = engine.cachedSearch('乱码', { cwd: ws.cwd })
    assert.equal(second, first, 'same array object: cache hit')
    assert.equal(engine.queryCache.size, 1)
    // A write bumps the store epoch → new key → recompute.
    store.record(ws.cwd, { section: 'lessons', content: '第二次踩乱码坑' })
    const third = engine.cachedSearch('乱码', { cwd: ws.cwd })
    assert.notEqual(third, first, 'recomputed after write')
    assert.equal(third.length, 2, 'new entry visible')
    assert.equal(engine.queryCache.size, 2)
  } finally {
    ws.cleanup()
  }
})

test('index rebuilds when the store epoch changes externally', () => {
  const ws = makeTempWorkspace()
  try {
    const path = makeTempStorePath()
    const store = new MemoirStore(path, { mtimeCheckIntervalMs: 0 })
    store.record(ws.cwd, { section: 'work', content: '第一条' })
    const engine = new RetrievalEngine(store)
    assert.equal(engine.search('第一条', { cwd: ws.cwd }).length, 1)
    store.invalidate()
    assert.equal(engine.search('第一条', { cwd: ws.cwd }).length, 1, 'rebuilt after invalidate')
    assert.equal(engine.queryCache.size, 0, 'cache keys epoch-scoped')
  } finally {
    ws.cleanup()
  }
})

test('LruCache evicts the oldest entry past the cap', () => {
  const cache = new LruCache<string>(2)
  cache.set('a', 'A')
  cache.set('b', 'B')
  cache.get('a')
  cache.set('c', 'C')
  assert.equal(cache.get('a'), 'A')
  assert.equal(cache.get('b'), undefined, 'b evicted as oldest')
  assert.equal(cache.get('c'), 'C')
})

test('empty query terms return no ranked results', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'work', content: 'x' })
    const engine = new RetrievalEngine(store)
    assert.deepEqual(engine.search('---', { cwd: ws.cwd }), [])
  } finally {
    ws.cleanup()
  }
})

test('retrieval defaults to active entries and can include lifecycle history', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    const active = store.record(ws.cwd, { section: 'work', content: '同一个关键词 active' })
    const archived = store.record(ws.cwd, { section: 'work', content: '同一个关键词 archived' })
    store.update(ws.cwd, archived.id, { status: 'archived' })
    const engine = new RetrievalEngine(store)
    assert.deepEqual(engine.search('关键词', { cwd: ws.cwd }).map((r) => r.entry.id), [active.id])
    assert.equal(engine.search('关键词', { cwd: ws.cwd, status: 'all' }).length, 2)
  } finally {
    ws.cleanup()
  }
})

test('tokenizeDocument keeps repeats (true TF), tokenizeQuery dedupes', () => {
  const doc = tokenizeDocument('cache cache cache cache')
  const query = tokenizeQuery('cache cache cache cache')
  assert.equal(doc.length, 4, 'document keeps term frequency')
  assert.equal(doc.filter((t) => t === 'cache').length, 4)
  assert.equal(query.length, 1, 'query dedupes')
  assert.deepEqual(tokenize('cache cache'), ['cache'], 'tokenize alias stays query-like')
})

test('BM25 term frequency: repeated terms outrank a single occurrence', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'work', content: 'cache' })
    store.record(ws.cwd, { section: 'work', content: 'cache cache cache cache cache' })
    const engine = new RetrievalEngine(store)
    const ranked = engine.search('cache', { cwd: ws.cwd })
    assert.equal(ranked.length, 2)
    assert.ok(
      ranked[0].entry.content.includes('cache cache cache'),
      'the high-TF doc ranks first: ' + ranked.map((r) => r.entry.content).join(' | '),
    )
    assert.ok(ranked[0].score > ranked[1].score, 'score(' + ranked[0].score + ') > score(' + ranked[1].score + ')')
  } finally {
    ws.cleanup()
  }
})

test('LruCache tracks hits, misses, evictions and hit rate', () => {
  const cache = new LruCache<string>(2)
  assert.equal(cache.hitRate, 0)
  cache.get('none')
  cache.set('a', 'A')
  cache.set('b', 'B')
  cache.get('a')
  cache.get('a')
  cache.set('c', 'C') // evicts b
  cache.get('b') // miss (b was evicted)
  assert.equal(cache.hits, 2)
  assert.equal(cache.misses, 2)
  assert.equal(cache.evictions, 1)
  assert.equal(cache.capacity, 2)
  assert.equal(cache.hitRate, 0.5)
})

test('engine diagnostics report index, cache and last query', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'work', content: '诊断数据' })
    const engine = new RetrievalEngine(store)
    const empty = engine.diagnostics()
    assert.equal(empty.index, null)
    assert.equal(empty.lastQuery, null)
    engine.search('诊断', { cwd: ws.cwd })
    const d = engine.diagnostics()
    assert.equal(d.index?.docs, 1)
    assert.ok((d.index?.terms ?? 0) > 0)
    assert.ok((d.lastQuery?.candidates ?? 0) >= 1)
    assert.ok((d.lastQuery?.latencyMs ?? -1) >= 0)
    assert.equal(d.cache.capacity, 128)
    assert.equal(d.cache.hitRate, 0)
  } finally {
    ws.cleanup()
  }
})

test('title score is independent of body length', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    // Same title, wildly different body lengths; neither body contains "cache".
    store.record(ws.cwd, { section: 'work', title: 'SSH cache', content: '短' })
    store.record(ws.cwd, { section: 'work', title: 'SSH cache', content: '无关正文'.repeat(200) })
    const engine = new RetrievalEngine(store)
    const ranked = engine.search('SSH cache', { cwd: ws.cwd })
    assert.equal(ranked.length, 2)
    // Record timestamps may differ by a few ms (recency term), so compare the
    // title/body-driven part with an epsilon rather than strict equality.
    assert.ok(
      Math.abs(ranked[0].score - ranked[1].score) < 1e-6,
      'title contribution identical regardless of body length: ' + ranked[0].score + ' vs ' + ranked[1].score,
    )
  } finally {
    ws.cleanup()
  }
})

test('limit/detail do not change the ranking cache key', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'lessons', content: '乱码先 chcp 65001' })
    const engine = new RetrievalEngine(store)
    engine.cachedSearch('乱码', { cwd: ws.cwd, limit: 3, detail: 'compact' })
    const second = engine.cachedSearch('乱码', { cwd: ws.cwd, limit: 30, detail: 'full' })
    assert.equal(second.length, 1)
    assert.equal(engine.queryCache.size, 1, 'one shared cache entry across limit/detail variants')
    assert.equal(engine.queryCache.misses, 1)
    assert.equal(engine.queryCache.hits, 1)
  } finally {
    ws.cleanup()
  }
})

test('time bucket refreshes recency ranking across hours', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath())
    store.record(ws.cwd, { section: 'work', content: '统一关键词' })
    const engine = new RetrievalEngine(store)
    const t0 = 1_700_000_000_000
    engine.cachedSearch('统一关键词', { cwd: ws.cwd, now: t0 })
    engine.cachedSearch('统一关键词', { cwd: ws.cwd, now: t0 })
    assert.equal(engine.queryCache.size, 1, 'same bucket → same key')
    engine.cachedSearch('统一关键词', { cwd: ws.cwd, now: t0 + 2 * 3_600_000 })
    assert.equal(engine.queryCache.size, 2, 'different hour bucket → fresh key')
  } finally {
    ws.cleanup()
  }
})

