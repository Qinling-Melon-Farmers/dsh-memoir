import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { MemoirStore } from '../lib/store.js'
import { RetrievalEngine } from '../lib/retrieval.js'
import { memoirReadTool } from '../lib/tools.js'
import { makeExec, makeTempWorkspace } from './helpers.ts'

test('whole-call limit applies in every scope with and without a query', async () => {
  const a = makeTempWorkspace(), b = makeTempWorkspace(), root = makeTempWorkspace()
  try {
    const store = new MemoirStore(join(root.dir, 'store.json'))
    store.record(a.cwd, { section: 'work', content: 'needle local alpha' })
    store.record(b.cwd, { section: 'work', content: 'needle remote bravo' })
    store.record(b.cwd, { section: 'work', content: 'needle remote charlie' })
    const read = memoirReadTool(store, undefined, new RetrievalEngine(store))
    for (const scope of ['project', 'global', 'all'] as const) {
      for (const query of ['', 'needle']) {
        const result = await read.execute({ scope, query, limit: 1 }, makeExec(a.cwd)) as { text: string }
        assert.equal((result.text.match(/^- \[/gm) ?? []).length, 1, `${scope} query=${query}`)
        if (scope === 'all') assert.match(result.text, /needle local alpha/)
      }
    }
    for (const query of ['', 'needle']) {
      const result = await read.execute({ scope: 'all', query, limit: 2 }, makeExec(a.cwd)) as { text: string }
      const bullets = result.text.match(/^- \[.*$/gm) ?? []
      assert.equal(bullets.length, 2)
      assert.match(bullets[0], /needle local alpha/)
      assert.match(bullets[1], /needle remote/)
      assert.equal((result.text.match(/needle local alpha/g) ?? []).length, 1)
    }
  } finally { a.cleanup(); b.cleanup(); root.cleanup() }
})
