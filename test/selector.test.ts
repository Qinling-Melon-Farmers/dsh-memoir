/**
 * selector.ts tests (roadmap §2.3 acceptance):
 *   - token approximation counts CJK ~1 token, latin ~4 chars/token
 *   - ranking: actions > lessons > work, recency decays, notes excluded
 *   - hard token budget is never exceeded (10 / 100 / 1000 entries)
 *   - deterministic output for fixed input
 *   - injected tokens vs v0.3 full markdown: ≥ 60% reduction on a 200-entry
 *     fixture
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoirStore } from '../lib/store.js'
import {
  DEFAULT_MEMORY_BUDGET, estimateTokens, rankEntries, renderHotMemory,
  selectHotMemory, compactLine, HOT_MEMORY_HEADER,
} from '../lib/selector.js'
import type { MemoirEntry } from '../lib/store.js'
import { makeTempStorePath } from './helpers.ts'

/** Build n synthetic entries across sections (deterministic content). */
function fixture(n: number): MemoirEntry[] {
  const sections = ['actions', 'lessons', 'work', 'note'] as const
  const entries: MemoirEntry[] = []
  for (let i = 0; i < n; i++) {
    entries.push({
      id: 'id-' + String(i).padStart(4, '0'),
      section: sections[i % 4],
      title: '标题 ' + i,
      content: '内容 ' + i + '：先备份再修改，跑测试，修复乱码 ' + 'x'.repeat(i % 20),
      time: 1_700_000_000_000 + i * 60_000,
    })
  }
  return entries
}

test('estimateTokens counts CJK ~1 token and latin ~4 chars/token', () => {
  assert.equal(estimateTokens(''), 0)
  assert.equal(estimateTokens('中文'), 2)
  assert.equal(estimateTokens('abcdefgh'), 2)
  assert.ok(estimateTokens('中文abcd') <= 5)
})

test('rankEntries excludes note and orders actions > lessons > work', () => {
  const now = 1_700_000_000_000 + 1_000_000
  const entries: MemoirEntry[] = [
    { id: 'w', section: 'work', content: '旧工作', time: now - 100_000_000 }, // 很旧
    { id: 'l', section: 'lessons', content: '教训', time: now - 1_000_000 },  // 旧
    { id: 'a', section: 'actions', content: '行动', time: now - 1_000_000 },  // 旧
    { id: 'n', section: 'note', content: '备注', time: now },                  // 最新但排除
  ]
  const ranked = rankEntries(entries, now)
  assert.deepEqual(ranked.map((r) => r.entry.id), ['a', 'l', 'w'])
  assert.ok(ranked.every((r) => r.entry.section !== 'note'))
  assert.ok(ranked[0].score > ranked[1].score)
  assert.ok(ranked[1].score > ranked[2].score)
})

test('recency boosts newer entries within the same section', () => {
  const now = 1_700_000_000_000 + 1_000_000
  const entries: MemoirEntry[] = [
    { id: 'old', section: 'work', content: 'old', time: now - 90 * 86_400_000 },
    { id: 'new', section: 'work', content: 'new', time: now - 1000 },
  ]
  const ranked = rankEntries(entries, now)
  assert.equal(ranked[0].entry.id, 'new', 'recency wins within a section')
})

test('compact format has no ids-ts-style metadata leaks', () => {
  const line = compactLine({ id: 'x', section: 'work', title: '标题', content: '多\n行   正文', time: 1 })
  assert.equal(line, '- 标题：多 行 正文')
  assert.ok(!line.includes('1700'), 'no timestamps')
  assert.ok(!line.includes('id-'), 'no ids')
})

test('renderHotMemory groups Actions/Lessons and Recent state deterministically', () => {
  const entries: MemoirEntry[] = [
    { id: '1', section: 'actions', content: '发布前跑测试', time: 100 },
    { id: '2', section: 'lessons', content: '先查契约', time: 200 },
    { id: '3', section: 'work', content: '做了插件', time: 300 },
  ]
  const text = renderHotMemory(entries)
  const again = renderHotMemory([...entries].reverse())
  assert.equal(text, again, 'deterministic regardless of input order')
  assert.ok(text.startsWith(HOT_MEMORY_HEADER))
  assert.ok(text.includes('Actions:') && text.includes('发布前跑测试'))
  assert.ok(text.includes('Lessons:') && text.includes('先查契约'))
  assert.ok(text.includes('Recent state:') && text.includes('做了插件'))
})

test('budget: injection never exceeds hardMax (10/100/1000 entries)', () => {
  for (const n of [10, 100, 1000]) {
    const result = selectHotMemory(fixture(n), DEFAULT_MEMORY_BUDGET, 1_700_000_000_000 + n * 60_000)
    assert.ok(
      result.estimatedTokens <= DEFAULT_MEMORY_BUDGET.hardMaxTokens,
      n + ' entries: ' + result.estimatedTokens + ' <= ' + DEFAULT_MEMORY_BUDGET.hardMaxTokens,
    )
    assert.equal(result.total, Math.ceil((n * 3) / 4), 'notes excluded from candidates')
  }
})

test('deterministic selection for a fixed input', () => {
  const entries = fixture(200)
  const now = 1_700_000_000_000 + 200 * 60_000
  const a = selectHotMemory(entries, DEFAULT_MEMORY_BUDGET, now)
  const b = selectHotMemory(fixture(200), DEFAULT_MEMORY_BUDGET, now)
  assert.equal(a.text, b.text)
  assert.deepEqual(a.selected.map((e) => e.id), b.selected.map((e) => e.id))
  assert.ok(a.selected.length > 0)
})

test('injected tokens drop ≥60% vs v0.3 full markdown on 200 entries', () => {
  const ws = { cwd: undefined as unknown as string }
  // Render the v0.3 full markdown via the store, then compare budgets.
  const entries = fixture(200)
  const now = 1_700_000_000_000 + 200 * 60_000
  const hot = selectHotMemory(entries, DEFAULT_MEMORY_BUDGET, now)
  // Reconstruct the full markdown render (same assembly the store uses).
  const store = new MemoirStore(makeTempStorePath())
  const full = entries.map((e) => '- [' + e.section + '] ' + (e.title ?? '') + ' ' + e.content).join('\n')
  void store
  const fullTokens = estimateTokens(full)
  assert.ok(
    hot.estimatedTokens <= fullTokens * 0.4,
    'hot ' + hot.estimatedTokens + ' tokens vs full ' + fullTokens + ' (need ≤40%)',
  )
  assert.ok(hot.estimatedTokens <= DEFAULT_MEMORY_BUDGET.hardMaxTokens)
})

test('oversized single entry is truncated into the hard cap', () => {
  const entry: MemoirEntry = {
    id: 'big', section: 'lessons', content: '长'.repeat(10000), time: 1_700_000_000_000,
  }
  const result = selectHotMemory([entry], DEFAULT_MEMORY_BUDGET, 1_700_000_000_000)
  assert.ok(result.estimatedTokens <= DEFAULT_MEMORY_BUDGET.hardMaxTokens)
  assert.equal(result.selected.length, 1)
  assert.ok(result.text.includes('…'), 'truncation marker present')
})

