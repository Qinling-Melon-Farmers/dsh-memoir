import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, mkdirSync, statSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { MemorySnapshotManager } from '../lib/snapshot.js'
import { MemorySnapshotStore, MAX_SNAPSHOT_RECORD_BYTES, MAX_SNAPSHOT_BYTES } from '../lib/snapshot-store.js'
import { MemoirStore } from '../lib/store.js'

const run = promisify(execFile)
const worker = fileURLToPath(new URL('./fixtures/snapshot-process.mjs', import.meta.url))

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'memoir-persistence-'))
  const storePath = join(dir, 'memory.json')
  const settingsPath = join(dir, 'settings.json')
  const options = { storePath, settingsPath, language: () => 'zh' as const }
  const disk = new MemorySnapshotStore(options)
  return { dir, storePath, settingsPath, options, disk,
    manager: new MemorySnapshotManager({ max: 1, persistence: disk }),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}
const build = (text: string) => () => ({ storeRevision: 0, text })
async function child(f: ReturnType<typeof fixture>, key: string, text = '', mode = '') {
  const { stdout } = await run(process.execPath, [worker, f.storePath, f.settingsPath, key, text, mode])
  return JSON.parse(stdout)
}
function recordPath(f: ReturnType<typeof fixture>) {
  const dir = join(f.disk.directory, f.disk.scope())
  return join(dir, readdirSync(dir).find((name) => name.endsWith('.json'))!)
}

test('real process restart restores identical full injection while new sessions see new memory', async () => {
  const f = fixture()
  try {
    const store = new MemoirStore(f.storePath)
    store.record(f.dir, { section: 'lessons', content: 'original decision' })
    const before = await child(f, 'session-a', '', 'prompt')
    store.record(f.dir, { section: 'actions', content: 'new decision after initial capture' })
    const storedBytes = readFileSync(f.storePath)
    const resumed = await child(f, 'session-a', '', 'prompt')
    const fresh = await child(f, 'session-b', '', 'prompt')
    assert.equal(resumed.text, before.text)
    assert.equal(resumed.hash, before.hash)
    assert.equal(resumed.diagnostics.restored, 1)
    assert.ok(!resumed.text.includes('new decision'))
    assert.ok(fresh.text.includes('new decision'))
    assert.deepEqual(readFileSync(f.storePath), storedBytes, 'restoring injection does not mutate SSOT')
  } finally { f.cleanup() }
})

test('LRU, resize, clear and forget release RAM without deleting durable snapshots', () => {
  const f = fixture()
  try {
    const first = f.manager.getOrCreate('a', build('original'))
    f.manager.getOrCreate('b', build('b'))
    assert.equal(f.manager.peek('a'), undefined)
    assert.deepEqual(f.manager.getOrCreate('a', build('changed')), first)
    f.manager.resize(1)
    f.manager.forget('a')
    f.manager.clear()
    assert.deepEqual(f.manager.getOrCreate('a', build('changed again')), first)
    assert.equal(readdirSync(join(f.disk.directory, f.disk.scope())).filter(x => x.endsWith('.json')).length, 2)
    assert.equal(f.manager.size, 1)
  } finally { f.cleanup() }
})

test('an initially empty project stays guidance-only after restart while a fork gets fresh memory', async () => {
  const f = fixture()
  try {
    const empty = await child(f, 'original-session', '', 'prompt')
    new MemoirStore(f.storePath).record(f.dir, { section: 'actions', content: 'new memory after empty baseline' })
    assert.equal((await child(f, 'original-session', '', 'prompt')).text, empty.text)
    assert.match((await child(f, 'fork-session', '', 'prompt')).text, /new memory after empty baseline/)
  } finally { f.cleanup() }
})

test('permission-denied records remain untouched with an explicit fallback', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => {
  const f = fixture()
  let path: string | undefined
  try {
    f.manager.getOrCreate('private', build('original'))
    path = recordPath(f)
    const original = readFileSync(path)
    chmodSync(path, 0)
    const disk = new MemorySnapshotStore(f.options)
    const manager = new MemorySnapshotManager({ persistence: disk })
    assert.equal(manager.getOrCreate('private', build('fallback')).text, 'fallback')
    assert.equal(disk.diagnostics().lastError, 'unavailable')
    chmodSync(path, 0o600)
    assert.deepEqual(readFileSync(path), original)
  } finally {
    if (path !== undefined) chmodSync(path, 0o600)
    f.cleanup()
  }
})

test('concurrent processes preserve different sessions and use first creation for the same session', async () => {
  const f = fixture()
  try {
    const [a, b] = await Promise.all([child(f, 'a', 'alpha'), child(f, 'b', 'beta')])
    assert.equal((await child(f, 'a', 'wrong')).text, a.text)
    assert.equal((await child(f, 'b', 'wrong')).text, b.text)
    const same = await Promise.all([child(f, 'same', 'one'), child(f, 'same', 'two')])
    assert.deepEqual(same[0], same[1])
  } finally { f.cleanup() }
})

test('data source, settings and language partition snapshots; switching language back restores its baseline', () => {
  const f = fixture()
  try {
    let language: 'zh' | 'en' = 'zh'
    const disk = new MemorySnapshotStore({ ...f.options, language: () => language })
    const manager = new MemorySnapshotManager({ persistence: disk })
    manager.getOrCreate('shared', build('zh original'))
    language = 'en'
    assert.equal(manager.getOrCreate('shared', build('en original')).text, 'en original')
    language = 'zh'
    assert.equal(manager.getOrCreate('shared', build('zh modified')).text, 'zh original')
    for (const override of [{ settingsPath: join(f.dir, 'other-settings') }, { storePath: join(f.dir, 'other-store') }]) {
      const other = new MemorySnapshotManager({ persistence: new MemorySnapshotStore({ ...f.options, ...override, directory: disk.directory }) })
      assert.equal(other.getOrCreate('shared', build('separate')).text, 'separate')
    }
  } finally { f.cleanup() }
})

test('corrupt, future-version, hash-mismatched and oversized records are retained and diagnosed', () => {
  const f = fixture()
  try {
    f.manager.getOrCreate('a', build('baseline'))
    const path = recordPath(f)
    const original = JSON.parse(readFileSync(path, 'utf8'))
    const invalid = ['null', '{', JSON.stringify({ ...original, version: 900 }), JSON.stringify({ ...original, snapshot: { ...original.snapshot, hash: 'bad' } }), ' '.repeat(MAX_SNAPSHOT_RECORD_BYTES + 1)]
    for (const text of invalid) {
      writeFileSync(path, text)
      let warnings = 0
      const disk = new MemorySnapshotStore({ ...f.options, warning: () => { warnings++ } })
      const manager = new MemorySnapshotManager({ persistence: disk })
      assert.equal(manager.getOrCreate('a', build('fallback')).text, 'fallback')
      assert.equal(manager.getOrCreate('a', build('second')).text, 'fallback')
      assert.equal(disk.diagnostics().lastStatus, 'volatile')
      assert.equal(warnings, 1)
      assert.equal(readFileSync(path, 'utf8'), text, 'do not replace a corrupt or unknown record with an empty store')
    }
  } finally { f.cleanup() }
})

test('unavailable storage and lock contention degrade explicitly; builder failures still propagate', () => {
  const f = fixture()
  try {
    const blocker = join(f.dir, 'not-a-directory')
    writeFileSync(blocker, 'preserve')
    const disk = new MemorySnapshotStore({ ...f.options, directory: blocker })
    const manager = new MemorySnapshotManager({ persistence: disk })
    assert.equal(manager.getOrCreate('a', build('local')).text, 'local')
    assert.equal(disk.diagnostics().lastError, 'unavailable')
    f.manager.getOrCreate('locked', build('durable'))
    const path = recordPath(f)
    mkdirSync(path + '.lock')
    const locked = new MemorySnapshotStore({ ...f.options, lockTimeoutMs: 5 })
    assert.equal(new MemorySnapshotManager({ persistence: locked }).getOrCreate('locked', build('wrong')).text, 'durable', 'immutable reads do not require a write lock')
    rmSync(path)
    assert.equal(new MemorySnapshotManager({ persistence: locked }).getOrCreate('locked', build('fallback')).text, 'fallback')
    assert.equal(locked.diagnostics().failures, 1)
    assert.equal(readdirSync(join(f.disk.directory, f.disk.scope())).filter(x => x.endsWith('.json')).length, 0, 'lock timeout must not write an uncoordinated record')
    assert.throws(() => new MemorySnapshotManager({ persistence: f.disk }).getOrCreate('throws', () => { throw new Error('builder failure') }), /builder failure/)
  } finally { f.cleanup() }
})

test('keys cannot traverse directories, payloads are bounded and fresh files have restricted POSIX modes', () => {
  const f = fixture()
  try {
    f.manager.getOrCreate('../../outside|C:\\project', build('safe'))
    const path = recordPath(f)
    assert.match(path, /[a-f0-9]{64}\.json$/)
    if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600)
    let builds = 0
    f.manager.getOrCreate('large', () => { builds++; return { text: 'x'.repeat(MAX_SNAPSHOT_BYTES + 1), storeRevision: 0 } })
    assert.equal(builds, 1)
    assert.equal(f.disk.diagnostics().lastError, 'record-too-large')
  } finally { f.cleanup() }
})
