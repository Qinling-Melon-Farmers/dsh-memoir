/**
 * selector.ts tests (roadmap §2.3 acceptance):
 *   - token approximation counts CJK ~1 token, latin ~4 chars/token
 *   - ranking: actions > lessons > work, recency decays, notes excluded
 *   - selection: recent-work floor, per-section pinned/importance ranking
 *   - oversized candidates are skipped until the soft target is reached
 *   - hard token budget is never exceeded (10 / 100 / 1000 entries)
 *   - long titles and tiny budgets include localized rendering overhead
 *   - deterministic output for fixed input
 *   - injected tokens vs v0.3 full markdown: ≥ 60% reduction on a 200-entry
 *     fixture
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoirStore } from '../lib/store.js'
import {
  DEFAULT_MEMORY_BUDGET, estimateTokens, rankEntries, renderHotMemory,
  selectHotMemory, compactLine, HOT_MEMORY_HEADER, truncateEntryToBudget,
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

test('selected work count matches visible Recent state after skipping a large action', () => {
  const entries: MemoirEntry[] = Array.from({ length: 4 }, (_, i) => ({
    id: `work-${i}`, section: 'work', content: `visible-work-${i}`, time: 10 - i,
  }))
  entries.push({ id: 'large', section: 'actions', content: 'x'.repeat(1000), time: 1 })
  const result = selectHotMemory(entries, { targetTokens: 100, hardMaxTokens: 100 }, 10)
  assert.deepEqual(result.selected.map(e => e.id), ['work-0', 'work-1', 'work-2'])
  for (const item of result.selected) assert.ok(result.text.includes(item.content))
  assert.ok(!result.text.includes('visible-work-3'))
})

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

test('lifecycle selector excludes archived entries and boosts pinned importance', () => {
  const now = 1_700_000_000_000
  const ranked = rankEntries([
    { id: 'normal', section: 'work', content: 'normal', time: now, importance: 1 },
    { id: 'pinned', section: 'work', content: 'pinned', time: now, importance: 5, pinned: true },
    { id: 'archived', section: 'work', content: 'archived', time: now, status: 'archived' },
  ], now)
  assert.deepEqual(ranked.map((item) => item.entry.id), ['pinned', 'normal'])
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

test('work entries are injected exactly once (Recent state only)', () => {
  const entries: MemoirEntry[] = [
    { id: 'w1', section: 'work', content: '做了插件', time: 300 },
    { id: 'a1', section: 'actions', content: '发布前跑测试', time: 200 },
    { id: 'l1', section: 'lessons', content: '先查契约', time: 100 },
  ]
  const result = selectHotMemory(entries, DEFAULT_MEMORY_BUDGET, 400)
  assert.ok(result.text.includes('做了插件'))
  assert.equal((result.text.match(/做了插件/g) ?? []).length, 1, 'work appears once')
  assert.ok(!result.text.includes('Work:'), 'no legacy Work: group')
  assert.ok(result.text.includes('Recent state:'))
})

test('newest work survives a flood of actions/lessons (Recent-state floor)', () => {
  const now = 1_700_000_000_000 + 10_000_000
  const entries: MemoirEntry[] = [
    { id: 'newest-work', section: 'work', content: '保底的工作状态', time: now - 1 },
  ]
  for (let i = 0; i < 60; i++) {
    entries.push({ id: 'a' + i, section: 'actions', content: '行动' + i, time: now - 60_000 * i })
    entries.push({ id: 'l' + i, section: 'lessons', content: '教训' + i, time: now - 60_000 * i })
  }
  const result = selectHotMemory(entries, DEFAULT_MEMORY_BUDGET, now)
  assert.ok(
    result.selected.some((e) => e.id === 'newest-work'),
    'newest work entry is selected despite 120 ranked actions/lessons',
  )
})

test('custom hardMax 50/100/200 is never exceeded', () => {
  const now = 1_700_000_000_000 + 200 * 60_000
  for (const hardMaxTokens of [50, 100, 200]) {
    const budget = { targetTokens: hardMaxTokens, hardMaxTokens }
    const result = selectHotMemory(fixture(200), budget, now)
    assert.ok(
      result.estimatedTokens <= hardMaxTokens,
      'hardMax ' + hardMaxTokens + ' exceeded: ' + result.estimatedTokens,
    )
    assert.ok(result.selected.length > 0, 'selection is non-empty for hardMax ' + hardMaxTokens)
  }
})

test('truncateEntryToBudget fits an oversized entry into a small ceiling', () => {
  const entry: MemoirEntry = { id: 'big', section: 'lessons', content: '长'.repeat(10000), time: 1 }
  const truncated = truncateEntryToBudget(entry, 50)
  assert.ok(truncated)
  assert.ok(truncated.content.length < entry.content.length, 'content shortened')
  assert.ok(truncated.content.endsWith('…'), 'truncation marker present')
  assert.ok(estimateTokens(renderHotMemory([truncated])) <= 50, 'rendered single-entry block fits 50 tokens')
})

test('#16: a large action does not block a fitting lesson after recent work', () => {
  const work: MemoirEntry = { id: 'work', section: 'work', content: 'recent state', time: 3 }
  const action: MemoirEntry = { id: 'action', section: 'actions', content: '大'.repeat(1000), time: 2 }
  const lesson: MemoirEntry = { id: 'lesson', section: 'lessons', content: 'small lesson', time: 1 }
  for (const language of [undefined, 'zh', 'en', 'de', 'ru'] as const) {
    const expectedText = renderHotMemory([work, lesson], language)
    const hardMaxTokens = estimateTokens(expectedText)
    const budget = { targetTokens: hardMaxTokens, hardMaxTokens }
    assert.ok(estimateTokens(renderHotMemory([work], language)) < budget.targetTokens)
    assert.ok(estimateTokens(renderHotMemory([work, action], language)) > hardMaxTokens)
    for (const entries of [[work, action, lesson], [lesson, action, work], [action, work, lesson]]) {
      const result = selectHotMemory(entries, budget, 4, language)
      assert.deepEqual(result.selected.map((e) => e.id), ['work', 'lesson'])
      assert.equal(result.text, expectedText)
      assert.equal(result.estimatedTokens, hardMaxTokens, 'an exact fit is accepted')
      assert.equal(result.total, 3, 'skipped entries still count as candidates')
    }
  }
})

test('budget skips multiple oversized candidates within work, actions and lessons', () => {
  const entries: MemoirEntry[] = [
    { id: 'w-new', section: 'work', content: 'new work', time: 30 },
    { id: 'w-big', section: 'work', content: '大'.repeat(1000), time: 20 },
    { id: 'w-small', section: 'work', content: 'small work', time: 10 },
    { id: 'a-big', section: 'actions', content: '大'.repeat(1000), time: 30, pinned: true },
    { id: 'a-small', section: 'actions', content: 'small action', time: 20 },
    { id: 'l-big', section: 'lessons', content: '大'.repeat(1000), time: 30, importance: 5 },
    { id: 'l-small', section: 'lessons', content: 'small lesson', time: 20 },
  ]
  const original = structuredClone(entries)
  const budget = { targetTokens: 100, hardMaxTokens: 100 }
  const result = selectHotMemory(entries, budget, 40)
  assert.deepEqual(result.selected.map((e) => e.id), ['w-new', 'w-small', 'a-small', 'l-small'])
  assert.ok(result.estimatedTokens <= budget.hardMaxTokens)
  assert.deepEqual(selectHotMemory([...entries].reverse(), budget, 40), result)
  assert.deepEqual(entries, original, 'selection does not mutate source entries or order')
})

test('a small soft target can stop after the newest work alone', () => {
  const newest: MemoirEntry = { id: 'newest', section: 'work', content: 'newest work', time: 3 }
  const entries: MemoirEntry[] = [
    { id: 'action', section: 'actions', content: 'pinned action', time: 4, pinned: true },
    { id: 'older', section: 'work', content: 'older work', time: 2, pinned: true, importance: 5 },
    newest,
  ]
  const budget = { targetTokens: estimateTokens(renderHotMemory([newest])), hardMaxTokens: 100 }
  assert.ok(estimateTokens(renderHotMemory(entries)) < budget.hardMaxTokens)
  const result = selectHotMemory(entries, budget, 4)
  assert.deepEqual(result.selected, [newest])
  assert.equal(result.estimatedTokens, budget.targetTokens)
})

test('selection stops at the soft target reached after skipping an oversized action', () => {
  const work: MemoirEntry = { id: 'work', section: 'work', content: 'recent state', time: 3 }
  const lesson: MemoirEntry = { id: 'lesson', section: 'lessons', content: 'first lesson', time: 2 }
  const later: MemoirEntry = { id: 'later', section: 'lessons', content: 'later lesson', time: 1 }
  const entries: MemoirEntry[] = [
    work,
    { id: 'big', section: 'actions', content: '大'.repeat(1000), time: 3 },
    lesson, later,
  ]
  const budget = { targetTokens: estimateTokens(renderHotMemory([work, lesson])), hardMaxTokens: 100 }
  assert.ok(estimateTokens(renderHotMemory([work, lesson, later])) < budget.hardMaxTokens)
  const result = selectHotMemory(entries, budget, 4)
  assert.deepEqual(result.selected, [work, lesson])
  assert.equal(result.estimatedTokens, budget.targetTokens)
})

test('selection preserves work time/id order and pinned/importance ranking within each section', () => {
  const now = 1_700_000_000_000
  const entries: MemoirEntry[] = [
    { id: 'w-b', section: 'work', content: 'tied pinned work', time: now, pinned: true, importance: 5 },
    { id: 'w-old', section: 'work', content: 'older pinned work', time: now - 1, pinned: true },
    { id: 'w-a', section: 'work', content: 'tied normal work', time: now, importance: 1 },
    { id: 'a-normal', section: 'actions', content: 'normal action', time: now, importance: 1 },
    { id: 'a-important', section: 'actions', content: 'important action', time: now, importance: 5 },
    { id: 'a-pinned', section: 'actions', content: 'older pinned action', time: now - 86_400_000, pinned: true },
    { id: 'l-normal', section: 'lessons', content: 'normal lesson', time: now },
    { id: 'l-pinned', section: 'lessons', content: 'pinned lesson', time: now, pinned: true, importance: 5 },
  ]
  const result = selectHotMemory(entries, DEFAULT_MEMORY_BUDGET, now)
  assert.deepEqual(result.selected.map((e) => e.id), [
    'w-a', 'w-b', 'w-old', 'a-pinned', 'a-important', 'a-normal', 'l-pinned', 'l-normal',
  ])
  assert.deepEqual(selectHotMemory([...entries].reverse(), DEFAULT_MEMORY_BUDGET, now), result)
})

test('an oversized newest work is truncated before considering pinned actions or lessons', () => {
  const work: MemoirEntry = { id: 'work', section: 'work', title: 'Recent', content: '长'.repeat(1000), time: 1 }
  const entries: MemoirEntry[] = [
    { id: 'action', section: 'actions', content: 'pinned action', time: 2, pinned: true },
    { id: 'lesson', section: 'lessons', content: 'pinned lesson', time: 2, pinned: true },
    work,
  ]
  const result = selectHotMemory(entries, { targetTokens: 40, hardMaxTokens: 50 }, 3)
  assert.deepEqual(result.selected.map((e) => e.id), ['work'])
  assert.equal(result.selected[0].title, work.title, 'a fitting title is preserved')
  assert.ok(result.selected[0].content.endsWith('…'))
  assert.ok(result.estimatedTokens <= 50)
  assert.equal(work.content, '长'.repeat(1000), 'source work is unchanged')
})

test('long titles and bodies fit the hard ceiling in every rendered section and language', () => {
  for (const language of [undefined, 'zh', 'en', 'de', 'ru'] as const) {
    for (const section of ['work', 'actions', 'lessons'] as const) {
      for (const fields of [
        { title: '标题'.repeat(1000), content: 'small body' },
        { title: '标题'.repeat(1000), content: '长'.repeat(1000) },
        { title: 'Short title', content: '长'.repeat(1000) },
        { title: '\u{10400}'.repeat(1000), content: '\u{10400}'.repeat(1000) },
      ]) {
        const entry: MemoirEntry = { id: 'big', section, time: 1, pinned: true, ...fields }
        const original = structuredClone(entry)
        const result = selectHotMemory([entry], { targetTokens: 50, hardMaxTokens: 50 }, 2, language)
        assert.equal(result.selected.length, 1, section + '/' + language)
        assert.ok(result.estimatedTokens <= 50)
        assert.equal(result.estimatedTokens, estimateTokens(result.text))
        assert.equal(result.text, renderHotMemory(result.selected, language))
        const selected = result.selected[0]
        assert.equal(selected.id, entry.id)
        assert.equal(selected.pinned, entry.pinned)
        assert.ok(selected.content.endsWith('…'))
        if (fields.title.length > 1000) assert.ok((selected.title?.length ?? 0) < fields.title.length)
        for (const ch of [...(selected.title ?? ''), ...selected.content]) {
          const cp = ch.codePointAt(0)!
          assert.ok(cp < 0xd800 || cp > 0xdfff, 'truncation preserves complete code points')
        }
        assert.deepEqual(entry, original)
      }
    }
  }
})

test('tiny ceilings return empty output when even the minimal localized block cannot fit', () => {
  for (const language of [undefined, 'zh', 'en', 'de', 'ru'] as const) {
    for (const section of ['work', 'actions', 'lessons'] as const) {
      const entry: MemoirEntry = { id: 'big', section, title: '标题'.repeat(100), content: '长'.repeat(100), time: 1 }
      const minimum = estimateTokens(renderHotMemory([{ ...entry, title: undefined, content: '…' }], language))
      for (const hardMaxTokens of [0, 1, minimum - 1, minimum, minimum + 1, 50]) {
        const budget = { targetTokens: hardMaxTokens, hardMaxTokens }
        const result = selectHotMemory([entry], budget, 2, language)
        const truncated = truncateEntryToBudget(entry, hardMaxTokens, language)
        assert.ok(result.estimatedTokens <= hardMaxTokens, section + '/' + language + '/' + hardMaxTokens)
        assert.equal(result.estimatedTokens, estimateTokens(result.text))
        assert.equal(result.total, 1)
        if (hardMaxTokens < minimum) {
          assert.equal(truncated, undefined)
          assert.deepEqual(result.selected, [])
          assert.equal(result.text, '')
          assert.equal(result.estimatedTokens, 0)
        } else {
          assert.ok(truncated)
          assert.ok(estimateTokens(renderHotMemory([truncated], language)) <= hardMaxTokens)
          assert.deepEqual(result.selected, [truncated])
        }
      }
    }
  }
})

test('an unrenderable first work does not prevent a smaller section from fitting', () => {
  const work: MemoirEntry = { id: 'work', section: 'work', content: '长'.repeat(100), time: 2 }
  const action: MemoirEntry = { id: 'action', section: 'actions', content: 'a', time: 1 }
  const hardMaxTokens = estimateTokens(renderHotMemory([action], 'en'))
  assert.ok(estimateTokens(renderHotMemory([{ ...work, content: '…' }], 'en')) > hardMaxTokens)
  const result = selectHotMemory([work, action], { targetTokens: hardMaxTokens, hardMaxTokens }, 3, 'en')
  assert.deepEqual(result.selected, [action])
  assert.equal(result.estimatedTokens, hardMaxTokens)
  assert.equal(result.total, 2)
})

