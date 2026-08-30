import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { distillPrompt } from '../lib/autodistill.js'
import { memoirGuidance, memoirSectionText } from '../lib/index.js'
import { hostCopy } from '../lib/i18n.js'
import { RetrievalEngine } from '../lib/retrieval.js'
import { selectHotMemory } from '../lib/selector.js'
import { MemoirStore, PROJECT_FILE } from '../lib/store.js'
import { memoirReadTool, memoirRecordTool, memoirUpdateTool } from '../lib/tools.js'
import { makeTempStorePath, makeTempWorkspace } from './helpers.ts'

const CJK = /[\u3400-\u9fff]/u

test('English agent copy contains no hardcoded Chinese in prompt surfaces', () => {
  const copy = hostCopy('en')
  for (const value of [
    memoirGuidance('en'),
    distillPrompt('en'),
    copy.sectionHeading,
    copy.hotMemory.header,
    copy.hotMemory.actions,
    copy.hotMemory.lessons,
    copy.hotMemory.recent,
  ]) {
    assert.doesNotMatch(value, CJK)
  }
  assert.match(distillPrompt('en'), /memoir_record/)
  assert.match(memoirGuidance('zh'), /项目持久记忆/)
})

test('English tools localize schemas, results, empty reads, and errors', async () => {
  const store = new MemoirStore(makeTempStorePath(), { language: 'en' })
  const retrieval = new RetrievalEngine(store)
  const record = memoirRecordTool(store, retrieval, 'en')
  const update = memoirUpdateTool(store, 'en')
  const read = memoirReadTool(store, undefined, retrieval, 'en')
  const recordParams = record.parameters as { properties: Record<string, { description?: string }> }

  assert.match(record.description, /Persist one project-memory entry/)
  assert.doesNotMatch(record.description, CJK)
  assert.doesNotMatch(recordParams.properties.section!.description!, CJK)
  assert.match(String((record.output.render({}, {
    section: 'work', action: 'recorded', recorded: true, id: 'm1', candidates: [],
  })[0] as { text?: string } | undefined)?.text), /^Recorded/)

  await assert.rejects(
    () => record.execute({ section: 'work', content: 'x' }, {} as never),
    /Cannot determine the session workspace/,
  )
  await assert.rejects(
    () => update.execute({ id: 'm1', content: 'x' }, {} as never),
    /Cannot determine the session workspace/,
  )
  const empty = await read.execute({ scope: 'project' }, {} as never) as { text: string }
  assert.match(empty.text, /workspace is unavailable/i)
  assert.doesNotMatch(empty.text, CJK)
})

test('English Hot Memory and PROJECT_MEMORY projection stay English', () => {
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(makeTempStorePath(), { language: 'en' })
    const entry = store.record(ws.cwd, {
      section: 'lessons',
      title: 'Release authentication',
      content: 'Use trusted publishing for npm releases.',
    })
    const hot = selectHotMemory([entry], { targetTokens: 900, hardMaxTokens: 1200 }, Date.now(), 'en')
    assert.match(hot.text, /^\[Project memory\]/)
    assert.match(hot.text, /Lessons:/)
    assert.doesNotMatch(hot.text, CJK)

    const markdown = readFileSync(join(ws.cwd, PROJECT_FILE), 'utf8')
    assert.match(markdown, /^# Persistent Project Memory/m)
    assert.match(markdown, /^## Lessons Learned/m)
    assert.doesNotMatch(markdown, CJK)

    const prompt = memoirSectionText(
      store,
      { agent: { id: 'english', session: { id: 'english', header: { cwd: ws.cwd } } } },
      undefined,
      { targetTokens: 900, hardMaxTokens: 1200 },
      'en',
    )
    assert.match(prompt, /Persistent project memory/)
    assert.match(prompt, /\[Project memory\]/)
    assert.doesNotMatch(prompt, CJK)
  } finally {
    ws.cleanup()
  }
})
