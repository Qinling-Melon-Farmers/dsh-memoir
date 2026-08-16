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
import { LruCache, RetrievalEngine, tokenize } from '../lib/retrieval.js'
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

