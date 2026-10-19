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
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '../lib/activity.js' // legacy receipt's SessionEventMap augmentation
import { mountJsonlPersistence, onlySessionLog, sessionSdk } from './session-sdk-helper.ts'

// The standalone script deliberately has no package/runtime dependency on the
// plugin. Integration tests default to the official JSONL devDependency (SDK
// fixture, no full host or mounted plugin). An installed host can also be tested:
// DSH_TEST_PACKAGE=/path/to/node_modules/@deepseek-ai/dsh node --test test/session-repair.test.ts
const script = fileURLToPath(new URL('../scripts/repair-session-receipts.mjs', import.meta.url))
const { auditSessionReceipts, repairSessionReceipts } = await import(pathToFileURL(script).href)
const run = promisify(execFile)
const localRequire = createRequire(import.meta.url)
// Never auto-discover a globally installed host: it can silently replace the
// SDK version under test (Node's Windows global module search does find it).
const dshPackage = process.env.DSH_TEST_PACKAGE
// Fail CI when its declared SDK devDependency is missing; never skip repair tests.
localRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl')
const sdk = sessionSdk(dshPackage)
const { KNOWN_SESSION_EVENT_TYPES, SessionId, SessionSeq } = await sdk.load('@deepseek-ai/dsh-session') as typeof import('@deepseek-ai/dsh-session')
const { createUserMessage } = await sdk.load('@deepseek-ai/dsh-llm') as typeof import('@deepseek-ai/dsh-llm')
const sdkArgs = dshPackage ? ['--dsh-package', dshPackage] : []
const options = { dshPackage }
const applying = { ...options, apply: true, hostStopped: true }
const secret = 'SENSITIVE-CONTENT-AND-API-KEY-DO-NOT-PRINT'
const header = { type: 'session', version: 4, id: SessionId('session-test'), createdAt: 1790662700000, isSeeded: false, delegationDepth: 0 } satisfies SessionHeader & { type: 'session' }
// Raw on-disk title fixture: its schema is checked by the selected SDK catalog,
// without depending on the optional session-title package's TS augmentation.
const title = (seq: number) => ({ type: 'session/title', seq: SessionSeq(seq), time: 1790662733587, data: { title: secret, source: { kind: 'user' }, messageSeqs: [] } })
const receipt = (seq: number): SessionEvent<'dsh-memoir/written'> => ({ type: 'dsh-memoir/written', seq: SessionSeq(seq), time: 1790662733587, data: { turn: 1, callId: 'call-秘密-01' } })
const userMessage = (seq: number): SessionEvent<'user/message'> => ({
  type: 'user/message', seq: SessionSeq(seq), time: 1790662733587, surfaceOp: 'append',
  data: createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: secret }] }),
})
const line = (value: unknown) => JSON.stringify(value) + '\n'
const headerLine = line(header)
// Preserve spellings, field order, exponent notation, CRLF and whitespace.
const legacyLine = ' { "time":1.790662733587e12, "data":{"callId":"call-秘密-01","turn":1}, "seq":1, "type":"dsh-memoir/written" }\r\n'
const opaque = { type: 'other-plugin/opaque', seq: 2, time: 1790662733587, data: { credential: secret, nested: [{ value: 'x }, " data' }] }, ignorable: true, sourceEventSeqs: [[0, 1]] }
const originalText = headerLine + line(title(0)) + legacyLine + line(opaque) + line({ ...receipt(3), ignorable: true }) + line(title(4))
const patchedText = originalText.replace('"type":"dsh-memoir/written" }', '"type":"dsh-memoir/written" ,"ignorable":true}')
const compress = (value: string | Buffer, checksum = true) => zlib.zstdCompressSync(value, { params: { [zlib.constants.ZSTD_c_checksumFlag]: checksum ? 1 : 0 } })

async function fixture(t: TestContext, content: Buffer | string = originalText, compressed = false) {
  const scratch = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'memoir-session-repair-'))
  t.after(async () => { await fs.rm(scratch, { recursive: true, force: true }) })
  const root = join(scratch, '_no-cwd', header.id)
  await fs.mkdir(root, { recursive: true })
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

test('repair help lists every reviewed backend, including alpha builds and rc2', async () => {
  const { stdout } = await run(process.execPath, [script, '--help'])
  for (const version of ['0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.1', '0.2.1-alpha.2', '0.2.1-rc.2']) assert.ok(stdout.includes(version))
})

test('alpha.2 repair preserves working-directory transitions and ignorable plugin records', async t => {
  if (!KNOWN_SESSION_EVENT_TYPES.has('working-directory/change' as never)) {
    t.skip('requires the official alpha.2 working-directory event contract')
    return
  }
  const tail = line({ type: 'working-directory/change', seq: 5, time: 1790662733587, data: { cwd: 'D:/example/work' } })
    + line({ type: 'plugin:example/receipt', seq: 6, time: 1790662733588, data: { message: 'preserve exactly' }, ignorable: true })
  const f = await fixture(t, originalText + tail)
  const result = await repairSessionReceipts(f.path, applying)
  assert.equal(result.changed, 1)
  assert.equal(await fs.readFile(f.path, 'utf8'), patchedText + tail)
  assert.equal(await fs.readFile(result.backupPath, 'utf8'), originalText + tail)
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

test('active v4 repair leaves historical generations and migration staging bytes untouched', async t => {
  const f = await fixture(t)
  const siblings = ['session.jsonl', 'session.v3.jsonl', 'session.v5.jsonl.migration.tmp']
  for (const name of siblings) await fs.writeFile(join(f.root, name), `opaque historical/staging bytes: ${name}`)
  const before = await Promise.all(siblings.map(name => fs.readFile(join(f.root, name))))
  const result = await repairSessionReceipts(f.path, applying)
  assert.equal(result.changed, 1)
  assert.equal(await fs.readFile(result.backupPath, 'utf8'), originalText)
  assert.deepEqual(await Promise.all(siblings.map(name => fs.readFile(join(f.root, name)))), before)
})

test('inactive, mixed-encoding, noncanonical and unsafe generations fail closed before backup or lock', async t => {
  const cases = [
    ['session.v5.jsonl', 'GENERATION_INACTIVE'], ['session.v10.jsonl', 'GENERATION_INACTIVE'],
    ['session.v4.jsonl.zstd', 'ENCODING_CONFLICT'], ['session.v3.jsonl.zstd', 'ENCODING_CONFLICT'],
    ['session.jsonl.zstd', 'ENCODING_CONFLICT'], ['session.v04.jsonl', 'LAYOUT_INVALID'],
    ['session.v0.jsonl', 'LAYOUT_INVALID'], ['SESSION.V5.JSONL', 'LAYOUT_INVALID'],
    ['session.v9007199254740992.jsonl', 'LAYOUT_INVALID'],
  ]
  for (const [name, code] of cases) {
    const f = await fixture(t)
    const sibling = join(f.root, name!)
    await fs.writeFile(sibling, 'do not inspect or change this generation')
    const names = await fs.readdir(f.root)
    await assert.rejects(auditSessionReceipts(f.path, options), { code })
    await assert.rejects(repairSessionReceipts(f.path, applying), { code })
    assert.deepEqual(await fs.readdir(f.root), names)
    assert.equal(await fs.readFile(f.path, 'utf8'), originalText)
    assert.equal(await fs.readFile(sibling, 'utf8'), 'do not inspect or change this generation')
  }
  for (const kind of ['directory', 'hardlink', 'junction']) {
    const f = await fixture(t)
    const sibling = join(f.root, 'session.v3.jsonl')
    if (kind === 'directory') await fs.mkdir(sibling)
    else if (kind === 'hardlink') {
      const separate = join(f.root, 'history')
      await fs.writeFile(separate, 'history')
      await fs.link(separate, sibling)
    } else await fs.symlink(f.root, sibling, process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(repairSessionReceipts(f.path, applying), { code: 'LAYOUT_INVALID' })
    assert.equal(await fs.readFile(f.path, 'utf8'), originalText)
  }
})

test('header identity and project directory must match the selected file', async t => {
  for (const changes of [{ id: 'another-session' }, { cwd: process.cwd() }]) {
    const content = originalText.replace(headerLine, line({ ...header, ...changes }))
    const f = await fixture(t, content)
    await assert.rejects(repairSessionReceipts(f.path, applying), { code: 'LAYOUT_INVALID' })
    assert.equal(await fs.readFile(f.path, 'utf8'), content)
    assert.deepEqual(await fs.readdir(f.root), ['session.v4.jsonl'])
  }
})

test('generation published during backup prevents replacement and retains the exact backup', async t => {
  for (const name of ['session.v5.jsonl', 'session.v3.jsonl.zstd', 'session.v3.jsonl']) {
    const f = await fixture(t)
    const open = fs.open.bind(fs)
    let triggered = false
    t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args)
      if (String(args[0]).endsWith('.bak') && !triggered) {
        triggered = true
        await fs.writeFile(join(f.root, name), 'concurrent generation')
      }
      return handle
    })
    await assert.rejects(repairSessionReceipts(f.path, applying), (error: any) => {
      assert.ok(['GENERATION_INACTIVE', 'ENCODING_CONFLICT', 'CONCURRENT_CHANGE'].includes(error.code))
      assert.equal(error.committed, false)
      assert.ok(error.backupPath)
      return true
    })
    t.mock.restoreAll()
    assert.ok(triggered)
    assert.equal(await fs.readFile(f.path, 'utf8'), originalText)
    assert.equal(await fs.readFile(join(f.root, name), 'utf8'), 'concurrent generation')
    const backups = (await fs.readdir(f.root)).filter(name => name.endsWith('.bak'))
    assert.equal(backups.length, 1)
    assert.equal(await fs.readFile(join(f.root, backups[0]!), 'utf8'), originalText)
  }
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

for (const compression of ['none', 'zstd'] as const) test(`official ${compression} writer, cross-process lease, repair and cold reader`, async t => {
  const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'memoir-official-session-'))
  const { Context } = await sdk.load('@deepseek-ai/cordis')
  const context = new Context()
  const backend = await mountJsonlPersistence(context, { root, compression }, sdk.load)
  const { type: _type, ...logicalHeader } = header
  const id = header.id
  const writer = await backend.create(logicalHeader)
  const coldContext = new Context()
  t.after(async () => {
    try { await writer.close() }
    finally {
      try { await coldContext.fiber.dispose(); await context.fiber.dispose() }
      finally { await fs.rm(root, { recursive: true, force: true }) }
    }
  })
  assert.deepEqual(await fs.readdir(root), [], 'create remains pending with no disk footprint')
  const first = userMessage(0), second = userMessage(2), last = userMessage(3)
  await writer.append([first])
  await writer.append([receipt(1)])
  await writer.append([second])
  await writer.flush()
  const path = await onlySessionLog(root, compression)
  const before = await fs.readFile(path)
  assert.equal((await auditSessionReceipts(path, options)).frames, compression === 'zstd' ? 4 : 0)
  await assert.rejects(repairSessionReceipts(path, applying), { code: 'LEASE_ACTIVE' })
  // A separate Node process must contend with the host's real native lease.
  // Windows case aliases must derive the same named semaphore as the writer.
  const cliPath = process.platform === 'win32' ? path.toUpperCase().replace(/SESSION\.V4\.JSONL(\.ZSTD)?$/, match => match.toLowerCase()) : path
  await assert.rejects(run(process.execPath, [script, ...sdkArgs, '--apply', '--host-stopped', cliPath]), (error: any) => {
    assert.match(error.stderr, /LEASE_ACTIVE/)
    assert.equal(error.stdout, '')
    return true
  })
  assert.deepEqual(await fs.readFile(path), before)
  assert.equal((await fs.readdir(dirname(path))).filter(name => name.includes('memoir-repair')).length, 0)
  await writer.close()
  await assert.rejects(backend.open(id, 'read'), /unknown.*(?:event type|harness)/)
  const result = await repairSessionReceipts(path, applying)
  assert.deepEqual(await fs.readFile(result.backupPath), before)
  const coldBackend = await mountJsonlPersistence(coldContext, { root, compression }, sdk.load)
  const reader = await coldBackend.open(id, 'read')
  const restored = await reader.read()
  await reader.close()
  assert.equal(restored.events.length, 3)
  assert.deepEqual(restored.events[1], { ...receipt(1), ignorable: true })
  const reopened = await coldBackend.open(id, 'write')
  try {
    // Even an idempotent apply must respect a write-open lease.
    await assert.rejects(repairSessionReceipts(path, applying), { code: 'LEASE_ACTIVE' })
    const liveReader = await backend.open(id, 'read')
    try { assert.deepEqual((await liveReader.read()).events, restored.events) }
    finally { await liveReader.close() }
    await reopened.append([last])
    await reopened.flush()
  } finally { await reopened.close() }
  assert.equal((await repairSessionReceipts(path, applying)).changed, 0)
  const finalReader = await backend.open(id, 'read')
  try { assert.deepEqual((await finalReader.read()).events, [...restored.events, last]) }
  finally { await finalReader.close() }
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

test('unknown backend versions refuse without importing backend code or modifying the session', async t => {
  const f = await fixture(t)
  const installation = join(f.root, 'unsupported-installation')
  const backend = join(installation, 'node_modules', '@deepseek-ai', 'dsh-session-persistence-jsonl')
  await fs.mkdir(backend, { recursive: true })
  await fs.writeFile(join(installation, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.1-rc.99' }))
  await fs.writeFile(join(backend, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-session-persistence-jsonl', version: '0.2.1-rc.99' }))
  await assert.rejects(repairSessionReceipts(f.path, { ...applying, dshPackage: installation }), { code: 'DSH_UNSUPPORTED' })
  assert.equal(await fs.readFile(f.path, 'utf8'), originalText)
  assert.deepEqual(await fs.readdir(f.root), ['session.v4.jsonl', 'unsupported-installation'])
})
