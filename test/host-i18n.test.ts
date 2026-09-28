import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { distillPrompt } from '../lib/autodistill.js'
import { memoirGuidance, memoirSectionText } from '../lib/index.js'
import { hostCopy, MEMOIR_LANGUAGES, resolveMemoirLanguage } from '../lib/i18n.js'
import { DEFAULT_MEMOIR_SETTINGS, MemoirSettingsStore, validateMemoirSettingsPatch } from '../lib/settings.js'
import type { MemoirLanguage } from '../lib/i18n.js'
import { RetrievalEngine, tokenizeQuery, tokenizeDocument } from '../lib/retrieval.js'
import { selectHotMemory } from '../lib/selector.js'
import { MemoirStore, PROJECT_FILE } from '../lib/store.js'
import { memoirReadTool, memoirRecordTool, memoirUpdateTool } from '../lib/tools.js'
import { makeTempStorePath, makeTempWorkspace, makeExec } from './helpers.ts'

const CJK = /[\u3400-\u9fff]/u

function copyLeaves(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value }
  if (typeof value === 'function') return { [prefix]: value(8, 30) }
  return Object.assign({}, ...Object.entries(value as object).map(([key, item]) => copyLeaves(item, `${prefix}.${key}`)))
}

function schemaShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaShape)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description').map(([key, item]) => [key, schemaShape(item)]))
  return value
}

for (const language of ['de', 'ru'] as const) {
  test(`${language}: complete agent dictionary, safe distillation instructions and stable tool schemas`, () => {
    const copy = hostCopy(language)
    const leaves = copyLeaves(copy)
    assert.deepEqual(Object.keys(leaves).sort(), Object.keys(copyLeaves(hostCopy('en'))).sort(), 'no untranslated fallback or missing fields')
    for (const [key, value] of Object.entries(leaves)) {
      assert.ok(value.length > 0, key)
      assert.doesNotMatch(value, CJK, key)
    }
    assert.match(distillPrompt(language, 42), /42/)
    assert.match(distillPrompt(language, 42), /memoir_record/)
    assert.match(distillPrompt(language, 42), /memoir_update/)
    assert.doesNotMatch(distillPrompt(language, 42), CJK, 'origin-turn line is localized too')
    const ws = makeTempWorkspace()
    try {
      const store = new MemoirStore(join(ws.cwd, 'memory.json'))
      const retrieval = new RetrievalEngine(store)
      const makeTools = (locale: MemoirLanguage) => [memoirRecordTool(store, retrieval, locale), memoirReadTool(store, undefined, retrieval, locale), memoirUpdateTool(store, locale)]
      const english = makeTools('en')
      makeTools(language).forEach((tool, index) => {
        assert.equal(tool.name, english[index].name)
        assert.deepEqual(schemaShape(tool.parameters), schemaShape(english[index].parameters))
        assert.doesNotMatch(JSON.stringify(tool.parameters), CJK)
        assert.notEqual(tool.description, english[index].description)
      })
    } finally { ws.cleanup() }
  })

  test(`${language}: record/read/projection keep mixed-language user content verbatim`, async () => {
    const ws = makeTempWorkspace()
    try {
      const body = 'Nicht löschen / Не удалять / 不要删除 / do not delete: planned, not completed.'
      let locale: MemoirLanguage = language
      const path = join(ws.cwd, 'memory.json')
      const store = new MemoirStore(path, { language: () => locale })
      const retrieval = new RetrievalEngine(store)
      const record = memoirRecordTool(store, retrieval, () => locale)
      const result = await record.execute({ section: 'lessons', content: body }, makeExec(ws.cwd))
      assert.equal(store.entries(ws.cwd)[0].content, body)
      assert.match(JSON.stringify(record.output.render({}, JSON.parse(JSON.stringify(result)))), new RegExp(hostCopy(language).record.recorded))
      const markdown = readFileSync(join(ws.cwd, PROJECT_FILE), 'utf8')
      assert.ok(markdown.includes(hostCopy(language).markdown.title))
      assert.ok(markdown.includes(body))
      const before = readFileSync(path)
      const read = await memoirReadTool(store, undefined, retrieval, language).execute({ detail: 'full' }, makeExec(ws.cwd)) as { text: string }
      assert.ok(read.text.includes(body))
      assert.ok(read.text.includes(hostCopy(language).sections.lessons.label))
      const hot = selectHotMemory(store.entries(ws.cwd), { targetTokens: 900, hardMaxTokens: 1200 }, Date.now(), language)
      assert.ok(hot.text.startsWith(hostCopy(language).hotMemory.header))
      locale = 'en'
      assert.deepEqual(readFileSync(path), before, 'changing language does not rewrite SSOT')
      assert.equal(readFileSync(join(ws.cwd, PROJECT_FILE), 'utf8'), markdown, 'no implicit projection rewrite')
    } finally { ws.cleanup() }
  })

  test(`${language}: settings survive restart and validation errors use selected language`, () => {
    const ws = makeTempWorkspace()
    try {
      const path = join(ws.cwd, 'settings.json')
      const settings = new MemoirSettingsStore(DEFAULT_MEMOIR_SETTINGS, path)
      settings.update({ language })
      const before = readFileSync(path)
      assert.equal(new MemoirSettingsStore(DEFAULT_MEMOIR_SETTINGS, path).get().settings.language, language)
      assert.deepEqual(readFileSync(path), before, 'loading supported language needs no migration rewrite')
      assert.equal(validateMemoirSettingsPatch({ language: 'xx' }, settings.get().settings), hostCopy(language).validation.language)
    } finally { ws.cleanup() }
  })
}

test('language identifiers remain explicit, independent of UI and untrusted memory', () => {
  assert.deepEqual(MEMOIR_LANGUAGES, ['zh', 'en', 'de', 'ru'])
  for (const language of MEMOIR_LANGUAGES) assert.equal(resolveMemoirLanguage(language), language)
  for (const unknown of ['auto', 'de-DE', 'fr', '../ru', '__proto__', undefined, null]) {
    assert.equal(resolveMemoirLanguage(unknown), 'zh')
    assert.equal(resolveMemoirLanguage(unknown, 'en'), 'en')
  }
})

test('German and Russian Unicode terms survive BM25 tokenization without translating memory', () => {
  assert.deepEqual(tokenizeQuery('Überprüfung Größe'), ['überprüfung', 'größe'])
  assert.deepEqual(tokenizeQuery('ПРОВЕРКА памяти'), ['проверка', 'памяти'])
  assert.deepEqual(tokenizeQuery('U\u0308berprüfung'), tokenizeQuery('Überprüfung'))
  assert.deepEqual(tokenizeDocument('память память'), ['память', 'память'])
  const ws = makeTempWorkspace()
  try {
    const store = new MemoirStore(join(ws.cwd, 'memory.json'))
    const german = store.record(ws.cwd, { section: 'lessons', content: 'Überprüfung der Größe vor der Veröffentlichung.' })
    const russian = store.record(ws.cwd, { section: 'lessons', content: 'Проверка памяти перед выпуском.' })
    const engine = new RetrievalEngine(store)
    for (const [query, id] of [['Überprüfung Größe', german.id], ['проверка памяти', russian.id]]) {
      const first = engine.cachedSearch(query, { cwd: ws.cwd })
      assert.equal(first[0]?.entry.id, id)
      assert.equal(engine.cachedSearch(query, { cwd: ws.cwd }), first, 'same-language queries retain cache hits')
    }
    assert.equal(engine.search('U\u0308berprüfung', { cwd: ws.cwd })[0]?.entry.id, german.id)
  } finally { ws.cleanup() }
})

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
