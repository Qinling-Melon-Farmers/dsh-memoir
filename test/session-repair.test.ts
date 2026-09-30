import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as zlib from 'node:zlib'

// The standalone script deliberately has no package/runtime dependency on the
// plugin. Integration tests default to the official JSONL devDependency (SDK
// fixture, no full host or mounted plugin). An installed host can also be tested:
// DSH_TEST_PACKAGE=/path/to/node_modules/@deepseek-ai/dsh node --test test/session-repair.test.ts
const script = fileURLToPath(new URL('../scripts/repair-session-receipts.mjs', import.meta.url))
const { auditSessionReceipts, repairSessionReceipts } = await import(pathToFileURL(script).href)
const run = promisify(execFile)
const localRequire = createRequire(import.meta.url)
const dshPackage = process.env.DSH_TEST_PACKAGE ?? (() => {
  try { return dirname(localRequire.resolve('@deepseek-ai/dsh/package.json')) } catch { return undefined }
})()
// Fail CI when its declared SDK devDependency is missing; never skip repair tests.
localRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl')
const sdkArgs = dshPackage ? ['--dsh-package', dshPackage] : []
const options = { dshPackage }
const applying = { ...options, apply: true, hostStopped: true }
const secret = 'SENSITIVE-CONTENT-AND-API-KEY-DO-NOT-PRINT'
const header = { type: 'session', version: 4, id: 'session-test', createdAt: 1790662700000, isSeeded: false, delegationDepth: 0 }
const title = (seq: number) => ({ type: 'session/title', seq, time: 1790662733587, data: { title: secret, source: { kind: 'user' }, messageSeqs: [] } })
const receipt = (seq: number) => ({ type: 'dsh-memoir/written', seq, time: 1790662733587, data: { turn: 1, callId: 'call-秘密-01' } })
const line = (value: unknown) => JSON.stringify(value) + '\n'
const headerLine = line(header)
// Preserve spellings, field order, exponent notation, CRLF and whitespace.
const legacyLine = ' { "time":1.790662733587e12, "data":{"callId":"call-秘密-01","turn":1}, "seq":1, "type":"dsh-memoir/written" }\r\n'
const opaque = { type: 'other-plugin/opaque', seq: 2, time: 1790662733587, data: { credential: secret, nested: [{ value: 'x }, " data' }] }, ignorable: true, sourceEventSeqs: [[0, 1]] }
const originalText = headerLine + line(title(0)) + legacyLine + line(opaque) + line({ ...receipt(3), ignorable: true }) + line(title(4))
const patchedText = originalText.replace('"type":"dsh-memoir/written" }', '"type":"dsh-memoir/written" ,"ignorable":true}')
const compress = (value: string | Buffer, checksum = true) => zlib.zstdCompressSync(value, { params: { [zlib.constants.ZSTD_c_checksumFlag]: checksum ? 1 : 0 } })

async function fixture(t: TestContext, content: Buffer | string = originalText, compressed = false) {
  const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'memoir-session-repair-'))
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }) })
  const path = join(root, compressed ? 'session.v4.jsonl.zstd' : 'session.v4.jsonl')
  await fs.writeFile(path, content)
  return { root, path }
}

function compressedFixture() {
  const row = Buffer.from(legacyLine)
  // Split a Unicode character across independently checksummed frames: the
  // real reader joins raw bytes before decoding complete JSONL records.
  const split = row.indexOf(Buffer.from('秘')) + 1
  const frames = [compress(headerLine), compress(line(title(0))), compress(row.subarray(0, split)),
    compress(Buffer.concat([row.subarray(split), Buffer.from(line(opaque))])),
    compress(line({ ...receipt(3), ignorable: true }) + line(title(4)))]
  return { frames, bytes: Buffer.concat(frames) }
}

function independentlyDecodeFrames(bytes: Buffer) {
  const frames: Buffer[] = []
  const decoded: Buffer[] = []
  let offset = 0
  while (offset < bytes.length) {
    const result = zlib.zstdDecompressSync(bytes.subarray(offset), { info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } }
    const consumed = result.engine.bytesWritten
    assert.ok(consumed > 0 && consumed <= bytes.length - offset)
    frames.push(bytes.subarray(offset, offset + consumed))
    decoded.push(result.buffer)
    offset += consumed
  }
  return { frames, plain: Buffer.concat(decoded) }
}

test('CLI requires an explicit file, never scans HOME, and exposes help without DSH', async t => {
  const f = await fixture(t)
  for (const args of [[], ['--apply'], ['--host-stopped', f.path], [f.path, f.path], ['--wat', f.path]]) {
    await assert.rejects(run(process.execPath, [script, ...args], { env: { ...process.env, DSH_HOME: f.root, HOME: f.root, USERPROFILE: f.root } }), (error: any) => {
      assert.match(error.stderr, /"error":"ARGS"/)
      assert.equal(error.stdout, '')
      assert.ok(!error.stderr.includes(secret))
      return true
    })
  }
  const { stdout } = await run(process.execPath, [script, '--help'])
  assert.match(stdout, /read-only audit/)
  assert.match(stdout, /--apply --host-stopped/)
  assert.deepEqual(await fs.readdir(f.root), ['session.v4.jsonl'])
})

test('apply requires a literal hostStopped:true before loading dependencies or touching a file', async t => {
  const f = await fixture(t)
  for (const hostStopped of [undefined, false, 'yes', 1]) {
    await assert.rejects(repairSessionReceipts(f.path, { apply: true, hostStopped }), { code: 'HOST_CONFIRMATION' })
  }
  assert.equal(await fs.readFile(f.path, 'utf8'), originalText)
  assert.deepEqual(await fs.readdir(f.root), ['session.v4.jsonl'])
})

test('npm bin entry works through a symlink or junction without silently skipping main', async t => {
  const f = await fixture(t)
  const alias = join(f.root, 'bin')
  await fs.symlink(dirname(script), alias, process.platform === 'win32' ? 'junction' : 'dir')
  const { stdout } = await run(process.execPath, [join(alias, 'repair-session-receipts.mjs'), '--help'])
  assert.match(stdout, /read-only audit/)
  assert.match(stdout, /--apply --host-stopped/)
  assert.equal(await fs.readFile(f.path, 'utf8'), originalText)
})

test('missing native zstd gives an explicit Node 24 diagnostic without reading any file', async () => {
  const code = `const z = require('node:zlib'); z.zstdDecompressSync = undefined; require('node:module').syncBuiltinESMExports(); import(${JSON.stringify(pathToFileURL(script).href)}).then(m => m.main(['missing/session.v4.jsonl.zstd'])).then(c => process.exitCode = c)`
  await assert.rejects(run(process.execPath, ['-e', code]), (error: any) => {
    assert.match(error.stderr, /ZSTD_UNAVAILABLE/)
    assert.match(error.stderr, /Node 24/)
    return true
  })
})

test('default CLI and API audit are byte-preserving and report only counts/paths', async t => {
  const f = await fixture(t)
  const stat = await fs.stat(f.path, { bigint: true })
  const result = await auditSessionReceipts(f.path, { ...applying })
  assert.equal(result.mode, 'audit')
  assert.equal(result.events, 5)
  assert.equal(result.receipts, 2)
  assert.equal(result.candidates, 1)
  assert.equal(result.alreadyIgnorable, 1)
  assert.equal(result.changed, 0)
  assert.equal(result.backupPath, null)
  const { stdout, stderr } = await run(process.execPath, [script, ...sdkArgs, f.path])
  assert.deepEqual(JSON.parse(stdout), result)
  assert.ok(!(stdout + stderr).includes(secret))
  assert.ok(!(stdout + stderr).includes('call-秘密'))
  assert.equal((await fs.stat(f.path, { bigint: true })).mtimeNs, stat.mtimeNs)
  assert.equal(await fs.readFile(f.path, 'utf8'), originalText)
  assert.deepEqual(await fs.readdir(f.root), ['session.v4.jsonl'])
})

test('plaintext apply makes an exact verified backup and changes only the one inserted flag; second apply is a no-op', async t => {
  const f = await fixture(t)
  const result = await repairSessionReceipts(f.path, applying)
  assert.equal(result.changed, 1)
  assert.equal(await fs.readFile(result.backupPath, 'utf8'), originalText)
  assert.equal(await fs.readFile(f.path, 'utf8'), patchedText)
  const before = await fs.stat(f.path, { bigint: true })
  const names = await fs.readdir(f.root)
  const again = await repairSessionReceipts(f.path, applying)
  assert.equal(again.changed, 0)
  assert.equal(again.candidates, 0)
  assert.equal(again.alreadyIgnorable, 2)
  assert.equal(again.backupPath, null)
  assert.equal((await fs.stat(f.path, { bigint: true })).mtimeNs, before.mtimeNs)
  assert.deepEqual(await fs.readdir(f.root), names)
})

test('real multi-frame zstd checksums, split UTF-8 rows, untouched frames, CLI backup and idempotence', async t => {
  const { bytes, frames } = compressedFixture()
  const f = await fixture(t, bytes, true)
  const { stdout, stderr } = await run(process.execPath, [script, '--apply', '--host-stopped', ...sdkArgs, f.path])
  assert.ok(!(stdout + stderr).includes(secret))
  const result = JSON.parse(stdout)
  assert.equal(result.frames, 5)
  assert.equal(result.changed, 1)
  assert.deepEqual(await fs.readFile(result.backupPath), bytes)
  const fixed = await fs.readFile(f.path)
  const prefix = Buffer.concat(frames.slice(0, 3))
  assert.deepEqual(fixed.subarray(0, prefix.length), prefix, 'untouched header/title/partial-record frames are byte-identical')
  assert.deepEqual(fixed.subarray(-frames[4]!.length), frames[4], 'untouched final batch is byte-identical')
  // An independent native bytesWritten walk verifies every frame, without using
  // the script's structural parser or assuming the changed frame's boundaries.
  const decoded = independentlyDecodeFrames(fixed)
  assert.equal(decoded.frames.length, 5)
  assert.equal(decoded.plain.toString(), patchedText)
  for (const frame of decoded.frames) {
    assert.ok(frame[4]! & 4, 'every output frame retains its checksum')
    const damaged = Buffer.from(frame)
    damaged[damaged.length - 1] = damaged[damaged.length - 1]! ^ 1
    assert.throws(() => zlib.zstdDecompressSync(damaged), 'checksum must actually be verified')
  }
  assert.equal((await repairSessionReceipts(f.path, applying)).changed, 0)
  assert.deepEqual(await fs.readFile(f.path), fixed)
})

test('the official writer creates the fixture, its real lease blocks apply, and its reader accepts the repaired file', async t => {
  const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'memoir-official-session-'))
  const require = dshPackage ? createRequire(join(dshPackage, 'package.json')) : localRequire
  const load = (name: string) => import(pathToFileURL(require.resolve(name)).href)
  const [{ default: Backend }, { Context }] = await Promise.all([load('@deepseek-ai/dsh-session-persistence-jsonl'), load('@deepseek-ai/cordis')])
  const context = new Context()
  const backend = new Backend(context, { root, compression: 'zstd' })
  const { type: _type, ...logicalHeader } = header
  const writer = await backend.create(logicalHeader)
  t.after(async () => {
    try { await writer.close() }
    finally {
      try { await context.fiber.dispose() }
      finally { await fs.rm(root, { recursive: true, force: true }) }
    }
  })
  await writer.append([title(0)])
  await writer.append([receipt(1)])
  await writer.append([title(2)])
  const path = await backend.resolveCurrentLog(header.id)
  assert.equal(typeof path, 'string')
  const before = await fs.readFile(path)
  assert.equal((await auditSessionReceipts(path, options)).frames, 4)
  await assert.rejects(repairSessionReceipts(path, applying), { code: 'LEASE_ACTIVE' })
  assert.deepEqual(await fs.readFile(path), before)
  assert.equal((await fs.readdir(dirname(path))).filter(name => name.includes('memoir-repair')).length, 0)
  await writer.close()
  await assert.rejects(backend.readStoredLog(path, header.id), /unknown.*(?:event type|harness)/)
  const result = await repairSessionReceipts(path, applying)
  assert.deepEqual(await fs.readFile(result.backupPath), before)
  const coldContext = new Context()
  const coldBackend = new Backend(coldContext, { root, compression: 'zstd' })
  t.after(() => coldContext.fiber.dispose())
  const reader = await coldBackend.open(header.id, 'read')
  const restored = await reader.read()
  await reader.close()
  assert.equal(restored.events.length, 3)
  assert.deepEqual(restored.events[1], { ...receipt(1), ignorable: true })
})

test('rejects torn/corrupt/unchecked/foreign zstd, including a bad checksum in an untouched frame', async t => {
  const { bytes, frames } = compressedFixture()
  const checksumBroken = Buffer.from(bytes)
  checksumBroken[frames[0]!.length - 1] = checksumBroken[frames[0]!.length - 1]! ^ 1
  const reserved = Buffer.from(bytes)
  reserved[4] = reserved[4]! | 8
  const variants = [
    bytes.subarray(0, -1), Buffer.concat([bytes, Buffer.from([0x28, 0xb5])]), checksumBroken, reserved,
    Buffer.concat([compress(headerLine, false), ...frames.slice(1)]),
    compress(originalText), // one frame containing header AND events is not the DSH container
    Buffer.concat([bytes, Buffer.from('unrecognized trailing data')]),
    Buffer.from(originalText), Buffer.alloc(0),
  ]
  for (const value of variants) {
    const f = await fixture(t, value, true)
    await assert.rejects(repairSessionReceipts(f.path, applying))
    assert.deepEqual(await fs.readFile(f.path), value)
    assert.deepEqual(await fs.readdir(f.root), ['session.v4.jsonl.zstd'])
  }
})

test('rejects unknown/malformed JSON, headers, sequences, receipt shapes and official event relationships as a whole', async t => {
  const variants = [
    originalText.slice(0, -1), originalText + '\n', originalText + '{broken}\n',
    originalText.replace('"version":4', '"version":5'), originalText.replace('"version":4', '"version":3'),
    originalText.replace('"delegationDepth":0', '"delegationDepth":0,"sandboxMode":"unsafe"'),
    originalText.replace('"seq":1', '"seq":8'), originalText.replace('"seq":1', '"seq":0'),
    originalText.replace('"seq":1', '"seq":-0'), originalText.replace('"seq":1', '"seq":1,"seq":1'),
    originalText.replace('"turn":1', '"turn":1,"tu\\u0072n":1'),
    originalText.replace('"turn":1', '"turn":0'), originalText.replace('"turn":1', '"turn":"1"'),
    originalText.replace('"turn":1', '"turn":1,"content":"extra"'),
    originalText.replace('"callId":"call-秘密-01"', '"callId":""'),
    originalText.replace('"seq":1', '"seq":1,"surfaceOp":"append"'),
    originalText.replace('"seq":1', '"seq":1,"ignorable":false'),
    originalText.replace('"seq":1', '"seq":1,"ignorable":null'),
    originalText.replace('1.790662733587e12', '1e999'),
    originalText.replace('"other-plugin/opaque"', '"other-plugin/REQUIRED"').replace('"ignorable":true,"sourceEventSeqs"', '"sourceEventSeqs"'),
    originalText.replace('[[0,1]]', '[[0,200]]'),
    headerLine + line(title(0)) + line(receipt(1)) + line({ type: 'turn/end', seq: 2, time: 1, data: { turn: 1, reason: 'done' } }),
    originalText.replace('"isSeeded":false', '"isSeeded":true'),
    headerLine + line(receipt(0)) + line({ type: 'assistant/message', seq: 1, time: 1, data: { stream: ['bad'] } }),
  ]
  for (const [index, value] of variants.entries()) {
    const f = await fixture(t, value)
    await assert.rejects(repairSessionReceipts(f.path, applying), `invalid variant ${index}`)
    assert.equal(await fs.readFile(f.path, 'utf8'), value)
    assert.deepEqual(await fs.readdir(f.root), ['session.v4.jsonl'])
  }
  const badUtf8 = Buffer.concat([Buffer.from(headerLine), Buffer.from([0xff]), Buffer.from('\n')])
  const f = await fixture(t, badUtf8)
  await assert.rejects(auditSessionReceipts(f.path, options), { code: 'JSON_INVALID' })
})

test('rejects symlink/junction ancestors, linked targets, hardlinks and noncanonical filenames', async t => {
  const f = await fixture(t)
  const alias = join(f.root, 'alias')
  await fs.symlink(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(repairSessionReceipts(join(alias, 'session.v4.jsonl'), applying), { code: 'SYMLINK' })
  const other = join(f.root, 'original')
  await fs.rename(f.path, other)
  try {
    await fs.symlink(other, f.path, 'file')
    await assert.rejects(auditSessionReceipts(f.path, options), { code: 'SYMLINK' })
    await fs.unlink(f.path)
  } catch (error: any) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error // Windows can require Developer Mode for file symlinks.
  }
  await fs.link(other, f.path)
  await assert.rejects(repairSessionReceipts(f.path, applying), { code: 'FILE_TYPE' })
  await assert.rejects(auditSessionReceipts(other, options), { code: 'FILENAME' })
  assert.equal(await fs.readFile(other, 'utf8'), originalText)
})

test('source append during backup is refused; exact original backup remains and new source bytes survive', async t => {
  const f = await fixture(t)
  const open = fs.open.bind(fs)
  let triggered = false
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args)
    if (String(args[0]).endsWith('.bak') && !triggered) {
      triggered = true
      await fs.appendFile(f.path, line(title(5)))
    }
    return handle
  })
  await assert.rejects(repairSessionReceipts(f.path, applying), asyncError('CONCURRENT_CHANGE', f.path))
  assert.equal(triggered, true)
  assert.equal(await fs.readFile(f.path, 'utf8'), originalText + line(title(5)))
  const backups = (await fs.readdir(f.root)).filter(name => name.endsWith('.bak'))
  assert.equal(backups.length, 1)
  assert.equal(await fs.readFile(join(f.root, backups[0]!), 'utf8'), originalText)
})

function asyncError(code: string, path: string) {
  return (error: any) => {
    assert.equal(error.code, code)
    assert.equal(error.path, path)
    assert.equal(error.committed, false)
    assert.ok(!String(error).includes(secret))
    return true
  }
}

test('same-size rewrite with restored mtime is caught before replace', async t => {
  const f = await fixture(t)
  const originalStat = await fs.stat(f.path)
  const open = fs.open.bind(fs)
  let triggered = false
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args)
    if (String(args[0]).endsWith('.bak') && !triggered) {
      triggered = true
      await fs.writeFile(f.path, originalText.replace('API-KEY', 'NEW-KEY'))
      await fs.utimes(f.path, originalStat.atime, originalStat.mtime)
    }
    return handle
  })
  await assert.rejects(repairSessionReceipts(f.path, applying), { code: 'CONCURRENT_CHANGE' })
  assert.equal(await fs.readFile(f.path, 'utf8'), originalText.replace('API-KEY', 'NEW-KEY'))
})

test('POSIX uid and gid mismatches refuse before backup or lease creation, including under Windows simulation', async t => {
  const f = await fixture(t)
  const stat = await fs.stat(f.path)
  for (const field of ['uid', 'gid'] as const) {
    const code = `import(${JSON.stringify(pathToFileURL(script).href)}).then(async m => {
      Object.defineProperty(process, 'platform', {value:'linux'});
      Object.defineProperty(process, 'geteuid', {value:()=>${stat.uid + (field === 'uid' ? 1 : 0)}});
      Object.defineProperty(process, 'getegid', {value:()=>${stat.gid + (field === 'gid' ? 1 : 0)}});
      process.exitCode=await m.main(${JSON.stringify([...sdkArgs, '--apply', '--host-stopped', f.path])});
    })`
    await assert.rejects(run(process.execPath, ['-e', code]), (error: any) => {
      assert.match(error.stderr, /OWNER_MISMATCH/)
      return true
    })
  }
  assert.deepEqual(await fs.readdir(f.root), ['session.v4.jsonl'])
  assert.equal(await fs.readFile(f.path, 'utf8'), originalText)
})

test('staged corruption and rename failure preserve the source and verified backup', async t => {
  for (const fault of ['corrupt', 'rename']) {
    const f = await fixture(t)
    if (fault === 'corrupt') {
      const open = fs.open.bind(fs)
      let triggered = false
      t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
        if (String(args[0]).endsWith('.tmp') && typeof args[1] === 'number' && !(args[1] & fsConstants.O_CREAT) && !triggered) {
          triggered = true
          await fs.appendFile(String(args[0]), 'corrupted')
        }
        return open(...args)
      })
    } else {
      t.mock.method(fs, 'rename', async () => {
        const backup = (await fs.readdir(f.root)).find(name => name.endsWith('.bak'))!
        assert.equal(await fs.readFile(join(f.root, backup), 'utf8'), originalText)
        assert.equal(await fs.readFile(f.path, 'utf8'), originalText)
        throw Object.assign(new Error(secret), { code: 'EACCES' })
      })
    }
    await assert.rejects(repairSessionReceipts(f.path, applying), (error: any) => {
      assert.equal(error.committed, false)
      assert.equal(error.path, f.path)
      assert.ok(fault === 'corrupt' ? ['CONCURRENT_CHANGE', 'VERIFY_FAILED'].includes(error.code) : error.code === 'EACCES')
      assert.ok(error.backupPath && error.stagingPath)
      assert.ok(!String(error).includes(secret))
      return true
    })
    t.mock.restoreAll()
    assert.equal(await fs.readFile(f.path, 'utf8'), originalText)
    const backup = (await fs.readdir(f.root)).find(name => name.endsWith('.bak'))!
    assert.equal(await fs.readFile(join(f.root, backup), 'utf8'), originalText)
  }
})

test('missing/wrong official installation and error diagnostics never expose session content', async t => {
  const f = await fixture(t, originalText + secret)
  await assert.rejects(auditSessionReceipts(f.path, { dshPackage: '' }), { code: 'DSH_REQUIRED' })
  await assert.rejects(auditSessionReceipts(f.path, { dshPackage: f.root }), { code: 'DSH_UNSUPPORTED' })
  await assert.rejects(run(process.execPath, [script, '--dsh-package', f.root, f.path]), (error: any) => {
    assert.equal(error.stdout, '')
    assert.ok(!error.stderr.includes(secret))
    assert.match(error.stderr, /DSH_UNSUPPORTED/)
    return true
  })
})
