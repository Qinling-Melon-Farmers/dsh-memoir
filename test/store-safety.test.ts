import { test } from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { basename, join } from 'node:path'
import { FORMAT_VERSION, MemoirStore, writeFileAtomic } from '../lib/store.js'
import { makeTempWorkspace } from './helpers.ts'

function fixture(t: TestContext) {
  const ws = makeTempWorkspace()
  t.after(() => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    ws.cleanup()
  })
  return { ...ws, path: join(ws.dir, 'store.json') }
}

function platform(t: TestContext, value: NodeJS.Platform): void {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { ...descriptor, value })
  t.after(() => Object.defineProperty(process, 'platform', descriptor))
  // Exercise the retry policy without making the test suite sleep.
  t.mock.method(Atomics, 'wait', () => 'timed-out' as const)
}

function ioError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`injected ${code}`), { code })
}

const emptyStore = () => ({ version: FORMAT_VERSION, projects: {} })

for (const projects of [{}, 'a future layout']) {
  test(`future store versions fail closed before interpreting projects (${typeof projects})`, (t) => {
    const f = fixture(t)
    const source = JSON.stringify({ version: 999, projects, unknown: { keep: ['all', 'bytes'] } })
    fs.writeFileSync(f.path, source)
    const store = new MemoirStore(f.path)
    const operations = [
      () => store.save(emptyStore()),
      () => store.load(),
      () => store.listProjects(),
      () => store.record(f.cwd, { section: 'work', content: 'must not replace future data' }),
      () => store.remove(f.cwd, 'unknown'),
      () => store.update(f.cwd, 'unknown', { content: 'changed' }),
      () => store.writeProjectFile(f.cwd),
    ]
    for (const operation of operations) {
      assert.throws(operation, (error: Error) => {
        assert.match(error.message, /unsupported store version 999/)
        assert.ok(error.message.includes(f.path))
        assert.ok(error.message.includes(`maximum supported: ${FORMAT_VERSION}`))
        return true
      })
      assert.equal(fs.readFileSync(f.path, 'utf8'), source)
      assert.deepEqual(fs.readdirSync(f.dir), ['store.json'], 'no backups, projections, locks or temp files')
    }
    assert.equal(store.stats().corruptBackups, 0)
    assert.equal(store.stats().revision, 0)
    assert.equal(store.stats().epoch, 0, 'failed loads never publish an empty snapshot')
  })
}

for (const version of ['999', '4', 3.5, 4.5, 0, -1, null, true, {}, []]) {
  test(`explicit unsupported version ${JSON.stringify(version)} is preserved and rejected`, (t) => {
    const f = fixture(t)
    const source = JSON.stringify({ version, projects: {}, unknown: 'keep' })
    fs.writeFileSync(f.path, source)
    const store = new MemoirStore(f.path)
    assert.throws(() => store.load(), /unsupported store version/)
    assert.throws(() => store.record(f.cwd, { section: 'work', content: 'unsafe' }), /unsupported store version/)
    assert.throws(() => store.save(emptyStore()), /unsupported store version/)
    assert.equal(fs.readFileSync(f.path, 'utf8'), source)
    assert.deepEqual(fs.readdirSync(f.dir), ['store.json'])
    assert.equal(store.stats().corruptBackups, 0)
    assert.equal(store.stats().epoch, 0)
    assert.equal(store.currentRevision(), 0)
  })
}

test('legacy stores with no explicit version still migrate on the first mutation', (t) => {
  const f = fixture(t)
  const source = JSON.stringify({ projects: {
    [f.cwd]: { path: f.cwd, title: 'legacy', updatedAt: 1000, entries: [{ section: 'work', content: 'legacy', time: 1000 }] },
  } })
  fs.writeFileSync(f.path, source)
  const store = new MemoirStore(f.path)
  assert.equal(store.entries(f.cwd)[0]?.content, 'legacy')
  assert.equal(fs.readFileSync(f.path, 'utf8'), source, 'reads do not rewrite the legacy format')
  store.record(f.cwd, { section: 'work', content: 'new' })
  assert.equal(JSON.parse(fs.readFileSync(f.path, 'utf8')).version, FORMAT_VERSION)
  assert.deepEqual(new MemoirStore(f.path).entries(f.cwd).map((entry) => entry.content), ['legacy', 'new'])
  assert.equal(store.stats().corruptBackups, 0)
})

test('a failed reload of a future version cannot fall back to a throttled warm snapshot', (t) => {
  const f = fixture(t)
  let now = 1000
  t.mock.method(Date, 'now', () => now)
  fs.writeFileSync(f.path, JSON.stringify(emptyStore()))
  const store = new MemoirStore(f.path, { mtimeCheckIntervalMs: 1000 })
  store.load()
  const source = JSON.stringify({ version: 999, projects: {}, futureField: 'preserve me' })
  fs.writeFileSync(f.path, source)
  now += 1001
  assert.throws(() => store.load(), /unsupported store version 999/)
  assert.throws(() => store.load(), /unsupported store version 999/)
  assert.throws(() => store.save(emptyStore()), /unsupported store version 999/)
  assert.equal(fs.readFileSync(f.path, 'utf8'), source)
  assert.equal(store.stats().hits, 0)
  assert.equal(store.stats().epoch, 1)
  // An operator can restore a supported file and retry the same instance.
  fs.writeFileSync(f.path, JSON.stringify(emptyStore()))
  assert.deepEqual(store.load(), emptyStore())
})

for (const operation of ['save', 'record'] as const) {
  test(`${operation} checks an external future version even with a warm snapshot`, (t) => {
    const f = fixture(t)
    fs.writeFileSync(f.path, JSON.stringify(emptyStore()))
    const store = new MemoirStore(f.path, { mtimeCheckIntervalMs: 60_000 })
    const old = store.load()
    const source = JSON.stringify({ version: 999, projects: {}, futureField: 'preserve me' })
    fs.writeFileSync(f.path, source)
    assert.throws(
      () => operation === 'save' ? store.save(old) : store.record(f.cwd, { section: 'work', content: 'unsafe' }),
      /unsupported store version 999/,
    )
    assert.equal(fs.readFileSync(f.path, 'utf8'), source)
    assert.deepEqual(fs.readdirSync(f.dir), ['store.json'])
    assert.equal(store.currentRevision(), 0)
  })
}

for (const code of ['EACCES', 'EPERM', 'EBUSY']) {
  test(`failed corrupt backup (${code}) blocks reads and mutations until a backup succeeds`, (t) => {
    const f = fixture(t)
    platform(t, 'win32')
    const source = 'not json at all {{{'
    fs.writeFileSync(f.path, source)
    const failure = ioError(code)
    const originalRename = fs.renameSync
    const rename = t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
      if (from === f.path) throw failure
      return originalRename(from, to)
    })
    syncBuiltinESMExports()
    const store = new MemoirStore(f.path)
    for (const operation of [
      () => store.load(),
      () => store.load(),
      () => store.record(f.cwd, { section: 'work', content: 'unsafe replacement' }),
      () => store.update(f.cwd, 'unknown', { content: 'changed' }),
      () => store.remove(f.cwd, 'unknown'),
      () => store.save(emptyStore()),
    ]) {
      const attempts = rename.mock.callCount()
      assert.throws(operation, (error: Error) => {
        assert.match(error.message, /cannot back up corrupt store/)
        assert.ok(error.message.includes(f.path))
        assert.ok(error.message.includes('.corrupt.'))
        assert.ok(error.message.includes(code))
        assert.equal(error.cause, failure, 'the backup error remains available for diagnosis')
        return true
      })
      assert.equal(rename.mock.callCount() - attempts, code === 'EACCES' ? 1 : 5)
      assert.equal(store.stats().corruptBackups, 0, 'failed backups are not counted as saved data')
      assert.equal(store.stats().epoch, 0)
      assert.equal(store.stats().revision, 0)
      assert.equal(fs.readFileSync(f.path, 'utf8'), source)
      assert.deepEqual(fs.readdirSync(f.dir), ['store.json'])
    }

    rename.mock.restore()
    syncBuiltinESMExports()
    assert.deepEqual(store.load(), emptyStore())
    assert.deepEqual(store.load(), emptyStore())
    assert.equal(store.stats().corruptBackups, 1, 'only the successful backup is counted')
    assert.equal(fs.existsSync(f.path), false)
    const backups = fs.readdirSync(f.dir)
    assert.equal(backups.length, 1)
    assert.ok(backups[0].startsWith('store.json.corrupt.'))
    assert.equal(fs.readFileSync(join(f.dir, backups[0]), 'utf8'), source)
    store.record(f.cwd, { section: 'work', content: 'safe after backup' })
    assert.equal(new MemoirStore(f.path).entries(f.cwd)[0]?.content, 'safe after backup')
    assert.equal(fs.readFileSync(join(f.dir, backups[0]), 'utf8'), source)
  })
}

test('corrupt backup survives transient Windows rename failures and counts one success', (t) => {
  const f = fixture(t)
  platform(t, 'win32')
  fs.writeFileSync(f.path, '{broken')
  const originalRename = fs.renameSync
  let attempts = 0
  t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (from === f.path && ++attempts < 3) throw ioError(attempts === 1 ? 'EPERM' : 'EBUSY')
    return originalRename(from, to)
  })
  syncBuiltinESMExports()
  const store = new MemoirStore(f.path)
  assert.deepEqual(store.load(), emptyStore())
  assert.equal(attempts, 3)
  assert.equal(store.stats().corruptBackups, 1)
  assert.equal(fs.existsSync(f.path), false)
  const backups = fs.readdirSync(f.dir)
  assert.equal(backups.length, 1)
  assert.equal(fs.readFileSync(join(f.dir, backups[0]), 'utf8'), '{broken')
})

for (const operation of ['stat', 'read'] as const) {
  const codes = operation === 'stat' ? ['EACCES', 'EPERM', 'EIO', 'ENOTDIR'] : ['EACCES', 'EBUSY', 'EIO', 'ENOENT']
  for (const code of codes) {
    test(`${operation} failure (${code}) is neither absence nor corruption`, (t) => {
      const f = fixture(t)
      const source = JSON.stringify(emptyStore())
      fs.writeFileSync(f.path, source)
      const failure = ioError(code)
      const originalRead = fs.readFileSync
      const originalStat = fs.statSync
      if (operation === 'stat') {
        t.mock.method(fs, 'statSync', ((...args: Parameters<typeof fs.statSync>) => {
          if (args[0] === f.path) throw failure
          return originalStat(...args)
        }) as typeof fs.statSync)
      } else {
        t.mock.method(fs, 'readFileSync', (...args: Parameters<typeof fs.readFileSync>) => {
          if (args[0] === f.path) throw failure
          return originalRead(...args)
        })
      }
      const rename = t.mock.method(fs, 'renameSync')
      syncBuiltinESMExports()
      const store = new MemoirStore(f.path)
      for (const action of [
        () => store.load(),
        () => store.load(),
        () => store.record(f.cwd, { section: 'work', content: 'must not write' }),
        () => store.save(emptyStore()),
      ]) assert.throws(action, (error: Error) => error === failure)
      assert.equal(originalRead(f.path, 'utf8'), source)
      assert.deepEqual(fs.readdirSync(f.dir), ['store.json'])
      assert.equal(rename.mock.callCount(), 0, 'unreadable files are never backed up as corrupt')
      assert.equal(store.stats().corruptBackups, 0)
      assert.equal(store.stats().epoch, 0)
      assert.equal(store.stats().fileReads, 0)
    })
  }
}

test('a failed warm stat probe invalidates the snapshot even within the throttle interval', (t) => {
  const f = fixture(t)
  let now = 1000
  t.mock.method(Date, 'now', () => now)
  fs.writeFileSync(f.path, JSON.stringify(emptyStore()))
  const store = new MemoirStore(f.path, { mtimeCheckIntervalMs: 1000 })
  store.load()
  const failure = ioError('EACCES')
  const originalStat = fs.statSync
  const stat = t.mock.method(fs, 'statSync', ((...args: Parameters<typeof fs.statSync>) => {
    if (args[0] === f.path) throw failure
    return originalStat(...args)
  }) as typeof fs.statSync)
  syncBuiltinESMExports()
  now += 1001
  assert.throws(() => store.load(), (error: Error) => error === failure)
  assert.throws(() => store.load(), (error: Error) => error === failure)
  assert.equal(store.stats().hits, 0)
  assert.equal(store.stats().corruptBackups, 0)
  stat.mock.restore()
  syncBuiltinESMExports()
  assert.deepEqual(store.load(), emptyStore())
})

test('direct save fails before writing when a cached file cannot be statted', (t) => {
  const f = fixture(t)
  const source = JSON.stringify(emptyStore())
  fs.writeFileSync(f.path, source)
  const store = new MemoirStore(f.path)
  store.load()
  const failure = ioError('EACCES')
  const originalStat = fs.statSync
  t.mock.method(fs, 'statSync', ((...args: Parameters<typeof fs.statSync>) => {
    if (args[0] === f.path) throw failure
    return originalStat(...args)
  }) as typeof fs.statSync)
  syncBuiltinESMExports()
  assert.throws(() => store.save(emptyStore()), (error: Error) => error === failure)
  assert.equal(fs.readFileSync(f.path, 'utf8'), source)
  assert.deepEqual(fs.readdirSync(f.dir), ['store.json'])
  assert.equal(store.currentRevision(), 0)
})

test('array-shaped projects are backed up byte for byte before recovery', (t) => {
  const f = fixture(t)
  const source = JSON.stringify({ version: FORMAT_VERSION, projects: [] })
  fs.writeFileSync(f.path, source)
  const store = new MemoirStore(f.path)
  assert.deepEqual(store.load(), emptyStore())
  assert.equal(store.stats().corruptBackups, 1)
  assert.equal(fs.existsSync(f.path), false)
  const backups = fs.readdirSync(f.dir)
  assert.equal(backups.length, 1)
  assert.equal(fs.readFileSync(join(f.dir, backups[0]), 'utf8'), source)
})

test('atomic writes retry transient Windows EPERM/EBUSY without temp leftovers', (t) => {
  const f = fixture(t)
  platform(t, 'win32')
  fs.writeFileSync(f.path, 'original')
  const originalRename = fs.renameSync
  let attempts = 0
  t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (to === f.path && ++attempts < 3) throw ioError(attempts === 1 ? 'EPERM' : 'EBUSY')
    return originalRename(from, to)
  })
  syncBuiltinESMExports()
  writeFileAtomic(f.path, 'replacement')
  assert.equal(attempts, 3)
  assert.equal(fs.readFileSync(f.path, 'utf8'), 'replacement')
  assert.deepEqual(fs.readdirSync(f.dir), ['store.json'])
})

for (const [os, code, expectedAttempts] of [
  ['win32', 'EPERM', 5], ['win32', 'EBUSY', 5],
  ['win32', 'EACCES', 1], ['win32', 'EXDEV', 1], ['win32', 'EIO', 1],
  ['win32', 'ENOENT', 1], ['win32', 'EEXIST', 1],
  ['linux', 'EPERM', 1], ['linux', 'EBUSY', 1],
] as const) {
  test(`atomic rename failure (${os}/${code}) is bounded and preserves the original`, (t) => {
    const f = fixture(t)
    platform(t, os)
    fs.writeFileSync(f.path, 'original')
    const failure = ioError(code)
    const originalRename = fs.renameSync
    let attempts = 0
    t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
      if (to === f.path) {
        attempts++
        throw failure
      }
      return originalRename(from, to)
    })
    syncBuiltinESMExports()
    assert.throws(() => writeFileAtomic(f.path, 'replacement'), (error: Error) => error === failure)
    assert.equal(attempts, expectedAttempts)
    assert.equal(fs.readFileSync(f.path, 'utf8'), 'original')
    const failed = fs.readdirSync(f.dir).filter((name) => name.startsWith(basename(f.path) + '.tmp.'))
    assert.equal(failed.length, 1, 'the failed replacement remains recoverable')
    assert.ok(failed[0].endsWith('.failed'))
    assert.equal(fs.readFileSync(join(f.dir, failed[0]), 'utf8'), 'replacement')
  })
}

test('failed atomic save drops mutated cache state and leaves the persisted entries intact', (t) => {
  const f = fixture(t)
  platform(t, 'win32')
  const store = new MemoirStore(f.path)
  const first = store.record(f.cwd, { section: 'work', content: 'persisted' })
  const source = fs.readFileSync(f.path, 'utf8')
  const revision = store.currentRevision()
  const failure = ioError('EPERM')
  const originalRename = fs.renameSync
  t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (to === f.path) throw failure
    return originalRename(from, to)
  })
  syncBuiltinESMExports()
  assert.throws(() => store.record(f.cwd, { section: 'work', content: 'uncommitted' }), (error: Error) => error === failure)
  assert.equal(fs.readFileSync(f.path, 'utf8'), source)
  assert.equal(store.currentRevision(), revision)
  assert.deepEqual(store.entries(f.cwd), [first])
  assert.equal(store.stats().corruptBackups, 0)
  assert.equal(fs.existsSync(join(f.dir, 'store.lock')), false)
})

for (const code of ['EACCES', 'EIO']) {
  test(`post-commit stat failure (${code}) invalidates the cache without hiding the commit`, (t) => {
    const f = fixture(t)
    const store = new MemoirStore(f.path)
    const first = store.record(f.cwd, { section: 'work', content: 'first' })
    const file = store.load()
    Object.values(file.projects)[0].entries.push({ ...first, id: 'second', content: 'committed second entry' })
    const before = store.stats()
    const failure = ioError(code)
    const originalRename = fs.renameSync
    const originalStat = fs.statSync
    let committed = false
    t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
      originalRename(from, to)
      if (to === f.path) committed = true
    })
    const stat = t.mock.method(fs, 'statSync', ((...args: Parameters<typeof fs.statSync>) => {
      if (args[0] === f.path && committed) throw failure
      return originalStat(...args)
    }) as typeof fs.statSync)
    syncBuiltinESMExports()

    assert.doesNotThrow(() => store.save(file), 'a cache refresh failure is not a persistence failure')
    assert.equal(committed, true)
    assert.equal(store.currentRevision(), before.revision + 1, 'trackWrite must see the committed revision')
    assert.equal(store.stats().epoch, before.epoch + 1)
    assert.deepEqual(JSON.parse(fs.readFileSync(f.path, 'utf8')), file)
    assert.throws(() => store.load(), (error: Error) => error === failure, 'the cache is invalid, not a warm hit')
    assert.equal(store.stats().corruptBackups, 0)

    stat.mock.restore()
    syncBuiltinESMExports()
    assert.deepEqual(store.entries(f.cwd).map((entry) => entry.content), ['first', 'committed second entry'])
    assert.equal(store.currentRevision(), before.revision + 1)
  })
}
