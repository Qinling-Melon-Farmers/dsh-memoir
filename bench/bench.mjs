#!/usr/bin/env node
/**
 * dsh-memoir benchmark (roadmap §7) — generates a report over three fixed
 * fixture sizes and prints it as markdown. NOT part of CI gates: run manually
 * (npm run bench) and commit bench/report.md for trend tracking.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoirStore } from '../lib/store.js'
import { MemorySnapshotManager } from '../lib/snapshot.js'
import { DEFAULT_MEMORY_BUDGET, estimateTokens, selectHotMemory } from '../lib/selector.js'
import { RetrievalEngine } from '../lib/retrieval.js'

const SECTIONS = ['actions', 'lessons', 'work', 'note']

function fixture(n) {
  const entries = []
  for (let i = 0; i < n; i++) {
    entries.push({
      id: 'id-' + String(i).padStart(6, '0'),
      section: SECTIONS[i % 4],
      title: '标题 ' + i,
      content: '内容 ' + i + '：先备份再修改，跑测试，修复乱码与转义 ' + 'x'.repeat(i % 20),
      time: 1_700_000_000_000 + i * 60_000,
      sessionId: 'sess-' + (i % 7),
    })
  }
  return entries
}

function writeStoreFile(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'memoir-bench-'))
  const path = join(dir, 'dsh-memoir.json')
  const projects = {}
  projects['/bench/project'] = {
    path: '/bench/project', title: 'project', updatedAt: entries.at(-1)?.time ?? 0, entries,
  }
  writeFileSync(path, JSON.stringify({ version: 2, projects }))
  return { dir, path }
}

function measure(label, fn, rounds = 50, warmup = true) {
  if (warmup) fn() // warm up (JIT, cache)
  const started = process.hrtime.bigint()
  for (let i = 0; i < rounds; i++) fn()
  const ns = Number(process.hrtime.bigint() - started)
  return { label, ms: ns / rounds / 1e6 }
}

const rows = []
const sizes = [100, 1000, 10000]
for (const n of sizes) {
  const entries = fixture(n)
  const { dir, path } = writeStoreFile(entries)
  const store = new MemoirStore(path, { mtimeCheckIntervalMs: 2000 })
  const cold = measure('cold store load', () => store.load(), 1, false)
  const warm = measure('warm store read (entries)', () => store.entries('/bench/project'))
  const hotBuild = measure('hot memory build', () => selectHotMemory(entries, DEFAULT_MEMORY_BUDGET, 1_700_000_000_000 + n * 60_000))
  const hot = selectHotMemory(entries, DEFAULT_MEMORY_BUDGET, 1_700_000_000_000 + n * 60_000)
  const fullMarkdown = store.renderMarkdown('/bench/project')
  const fullTokens = estimateTokens(fullMarkdown)
  const manager = new MemorySnapshotManager()
  let builds = 0
  for (let i = 0; i < 1000; i++) {
    manager.getOrCreate('sess|/bench/project', () => { builds++; return { storeRevision: 1, text: hot.text } })
  }
  // Retrieval (v0.4.1): index build + cold/warm ranked query.
  const engine = new RetrievalEngine(store)
  const indexBuild = measure('retrieval index build', () => engine.ensureIndex(), 1, false)
  const coldQuery = measure('cold ranked query', () => engine.cachedSearch('乱码 ' + n, { cwd: '/bench/project' }), 20)
  const warmQuery = measure('warm cached query', () => engine.cachedSearch('乱码', { cwd: '/bench/project' }))
  const reduction = ((1 - hot.estimatedTokens / fullTokens) * 100).toFixed(1)
  rows.push([
    String(n),
    cold.ms.toFixed(1) + ' ms',
    (warm.ms * 1000).toFixed(2) + ' µs',
    hotBuild.ms.toFixed(3) + ' ms',
    indexBuild.ms.toFixed(1) + ' ms',
    coldQuery.ms.toFixed(3) + ' ms',
    (warmQuery.ms * 1000).toFixed(3) + ' µs',
    String(fullTokens),
    String(hot.estimatedTokens),
    reduction + '%',
    hot.selected.length + '/' + hot.total,
    String(builds),
  ])
  rmSync(dir, { recursive: true, force: true })
}

console.log('# dsh-memoir benchmark report')
console.log()
console.log('> 生成时间: ' + new Date().toISOString() + ' · node ' + process.version + ' · budget ' + DEFAULT_MEMORY_BUDGET.targetTokens + '/' + DEFAULT_MEMORY_BUDGET.hardMaxTokens + ' tokens')
console.log()
console.log('| 条目数 | 冷加载 | 热读取(平均) | Hot Memory 构建 | 索引构建 | 冷查询 | 热查询(缓存) | 全量 markdown tokens | 注入 tokens | 降幅 | 选中/候选 | 快照复用(1000次构建数) |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const row of rows) console.log('| ' + row.join(' | ') + ' |')

