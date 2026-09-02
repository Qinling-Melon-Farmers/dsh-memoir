import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WireEntry, WireProject, WireSearchResult } from '../src/client/api.ts'
import {
  ENTRY_PAGE_SIZE,
  PROJECT_PAGE_SIZE,
  buildProjectGroups,
  canonicalProjectPath,
  countEntryStatuses,
  filterEntries,
  groupRankedResults,
  nextPageSize,
  projectTitleFromPath,
  shouldCollapseEntry,
} from '../src/client/view-model.ts'

function entry(index: number, overrides: Partial<WireEntry> = {}): WireEntry {
  return {
    id: `entry-${index}`,
    section: 'work',
    content: `memory ${index}`,
    time: index,
    ...overrides,
  }
}

function project(index: number, entries: WireEntry[]): WireProject {
  return {
    key: `c:/work/project-${index}`,
    path: `C:\\work\\project-${index}`,
    title: `project-${index}`,
    updatedAt: index,
    entries,
  }
}

test('entry lifecycle totals and filters preserve legacy active semantics', () => {
  const entries = [
    entry(1),
    entry(2, { status: 'active', section: 'lessons' }),
    entry(3, { status: 'archived', section: 'lessons' }),
    entry(4, { status: 'superseded', section: 'actions' }),
  ]
  assert.deepEqual(countEntryStatuses(entries), { total: 4, active: 2, superseded: 1, archived: 1 })
  assert.deepEqual(filterEntries(entries, 'active', 'all').map((item) => item.id), ['entry-1', 'entry-2'])
  assert.deepEqual(filterEntries(entries, 'all', 'lessons').map((item) => item.id), ['entry-2', 'entry-3'])
  assert.deepEqual(filterEntries(entries, 'archived', 'work'), [])
})

test('project identity folds Windows case and separators but preserves POSIX case', () => {
  assert.equal(canonicalProjectPath('C:\\Work\\Demo\\'), 'c:/work/demo')
  assert.equal(canonicalProjectPath('c:/work/demo'), 'c:/work/demo')
  assert.equal(canonicalProjectPath('/Work/Demo/'), '/Work/Demo')
  assert.equal(canonicalProjectPath(''), '__unscoped__')
  assert.equal(projectTitleFromPath('C:\\Work\\Demo'), 'Demo')
  assert.equal(projectTitleFromPath('/srv/demo'), 'demo')
})

test('global project groups hide non-matches while keeping complete lifecycle totals', () => {
  const entries = [
    entry(1),
    entry(2, { status: 'archived' }),
    entry(3, { status: 'superseded', section: 'lessons' }),
  ]
  const groups = buildProjectGroups([project(1, entries), project(2, [entry(4, { status: 'archived' })])], 'active', 'all')
  assert.equal(groups.length, 1)
  assert.equal(groups[0]?.entries.length, 1)
  assert.deepEqual(groups[0]?.stats, { total: 3, active: 1, superseded: 1, archived: 1 })

  const serverStats: WireProject = { ...project(3, [entry(5)]), stats: { total: 40, active: 30, superseded: 6, archived: 4 } }
  assert.deepEqual(buildProjectGroups([serverStats], 'active', 'all')[0]?.stats, serverStats.stats)
})

test('ranked global results retain host order and merge Windows path variants', () => {
  const metadata = project(1, [entry(1), entry(2, { status: 'archived' })])
  const results: WireSearchResult[] = [
    { projectPath: 'C:\\WORK\\PROJECT-1\\', entry: entry(7), score: 9 },
    { projectPath: 'c:/work/project-1', entry: entry(8), score: 8 },
    { projectPath: '', entry: entry(9), score: 7 },
  ]
  const groups = groupRankedResults(results, [metadata])
  assert.equal(groups.length, 2)
  assert.equal(groups[0]?.title, 'project-1')
  assert.deepEqual(groups[0]?.results.map((result) => result.score), [9, 8])
  assert.deepEqual(groups[0]?.stats, { total: 2, active: 1, superseded: 0, archived: 1 })
  assert.equal(groups[1]?.key, '__unscoped__')
  assert.equal(groups[1]?.title, '')
})

test('0/1/20/100/1000-entry and 50-project fixtures remain progressively bounded', () => {
  for (const size of [0, 1, 20, 100, 1_000]) {
    const entries = Array.from({ length: size }, (_, index) => entry(index, {
      section: (['work', 'lessons', 'actions', 'note'] as const)[index % 4],
    }))
    const groups = buildProjectGroups([project(1, entries)], 'all', 'all')
    assert.equal(groups.length, size === 0 ? 0 : 1)
    const initiallyRendered = ['work', 'lessons', 'actions', 'note']
      .reduce((total, section) => total + Math.min(ENTRY_PAGE_SIZE, entries.filter((item) => item.section === section).length), 0)
    assert.ok(initiallyRendered <= ENTRY_PAGE_SIZE * 4)
    if (size === 1_000) assert.ok(initiallyRendered < size / 10)
  }

  const projects = Array.from({ length: 50 }, (_, index) => project(index, [entry(index)]))
  assert.equal(buildProjectGroups(projects, 'active', 'all').slice(0, PROJECT_PAGE_SIZE).length, 20)
  assert.equal(nextPageSize(PROJECT_PAGE_SIZE, projects.length, PROJECT_PAGE_SIZE), 40)
  assert.equal(nextPageSize(40, projects.length, PROJECT_PAGE_SIZE), 50)
})

test('long or multi-line memory content gets a controlled preview', () => {
  assert.equal(shouldCollapseEntry('short memory'), false)
  assert.equal(shouldCollapseEntry('x'.repeat(361)), true)
  assert.equal(shouldCollapseEntry(Array.from({ length: 7 }, () => 'line').join('\n')), true)
})
