#!/usr/bin/env node
/**
 * Offline repair for #14. No host startup, migration, home discovery or tail recovery.
 * Physical format and lease protocol checked against the official npm
 * dsh-session-persistence-jsonl@0.2.0-rc.1 / rc.2 (format, zstd, lease and win32).
 * Use that installation's public format catalog, not a guessed JSONL schema.
 * Only the two canonical v4 filenames on a trusted local filesystem are supported.
 * Keep every host stopped throughout apply; kernel leases exclude cooperating DSH
 * writers, while identity/content checks detect other observed changes. Node has
 * no portable compare-and-swap rename against a hostile filesystem writer.
 * POSIX apply requires the source uid/gid to match the effective process uid/gid.
 * Windows backup/staging files inherit directory ACLs; atomic rename does not
 * retain a source file's custom ACL. Apply only in a directory whose inherited
 * ACL already protects all session data. File-specific ACLs need separate review.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { basename, dirname, join, parse, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import * as zlib from 'node:zlib'

const LIMIT = 128 * 1024 * 1024
const RECEIPT = 'dsh-memoir/written'
const INSERTION = Buffer.from(',"ignorable":true')
const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
const runtimeCache = new Map()
const REVIEWED_BACKENDS = new Set(['0.2.0-rc.1', '0.2.0-rc.2'])

function refuse(code, message) {
  throw Object.assign(new Error(message), { code })
}
function requireZstd() {
  if (typeof zlib.zstdCompressSync !== 'function' || typeof zlib.zstdDecompressSync !== 'function') {
    refuse('ZSTD_UNAVAILABLE', 'Native Zstandard is unavailable; use Node 24 (unsupported Node 22 builds cannot read .zstd).')
  }
}

/** Load public SDK validators/native dependencies locally or from an explicit DSH directory. */
async function runtimeFor(dshPackage) {
  if (dshPackage !== undefined && (typeof dshPackage !== 'string' || !dshPackage)) refuse('DSH_REQUIRED', 'Invalid --dsh-package directory.')
  const manifest = dshPackage === undefined ? fileURLToPath(import.meta.url) : resolve(dshPackage, 'package.json')
  if (!runtimeCache.has(manifest)) {
    runtimeCache.set(manifest, (async () => {
      try {
        if (dshPackage !== undefined) {
          const pkg = JSON.parse(await fs.readFile(manifest, 'utf8'))
          if (pkg.name !== '@deepseek-ai/dsh') throw new Error()
        }
        const rootRequire = createRequire(manifest)
        const backendManifest = rootRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl/package.json')
        const backend = JSON.parse(await fs.readFile(backendManifest, 'utf8'))
        // Other releases must be reviewed for format AND lease compatibility first.
        if (!REVIEWED_BACKENDS.has(backend.version)) throw new Error()
        const require = createRequire(backendManifest)
        const load = name => import(pathToFileURL(require.resolve(name)).href)
        const [catalog, session, llm] = await Promise.all([
          load('@deepseek-ai/dsh-session-format-catalog'), load('@deepseek-ai/dsh-session'), load('@deepseek-ai/dsh-llm'),
        ])
        if (session.SESSION_FORMAT_VERSION !== 4 || catalog.sessionFormatCatalog.currentVersion !== 4) throw new Error()
        return { catalog: catalog.sessionFormatCatalog, known: session.KNOWN_SESSION_EVENT_TYPES, llm, load }
      } catch {
        refuse('DSH_UNSUPPORTED', 'Cannot load the reviewed official v4 validators (JSONL backend 0.2.0-rc.1 or 0.2.0-rc.2); no files changed.')
      }
    })())
  }
  return runtimeCache.get(manifest)
}

// Scan actual frame/block boundaries; never search for magic inside compressed data.
// Require checksums and no dictionaries/skippable frames, as emitted by DSH.
function frameRanges(bytes) {
  const frames = []
  let offset = 0
  const need = count => {
    if (offset + count > bytes.length) refuse('ZSTD_TORN', 'Incomplete Zstandard frame; tail recovery is not supported.')
  }
  while (offset < bytes.length) {
    const start = offset
    need(5)
    if (bytes.readUInt32LE(offset) !== 0xfd2fb528) refuse('ZSTD_FORMAT', 'Invalid or unsupported Zstandard frame.')
    offset += 4
    const descriptor = bytes[offset++]
    if ((descriptor & 0x18) || (descriptor & 3) || !(descriptor & 4)) {
      refuse('ZSTD_FORMAT', 'Expected a checksummed, dictionary-free DSH Zstandard frame.')
    }
    const sizeFlag = descriptor >>> 6
    const single = Boolean(descriptor & 32)
    const headerBytes = (single ? 0 : 1) + (sizeFlag ? 1 << sizeFlag : single ? 1 : 0)
    need(headerBytes)
    offset += headerBytes
    for (;;) {
      need(3)
      const block = bytes.readUIntLE(offset, 3)
      offset += 3
      const type = (block >>> 1) & 3
      const size = block >>> 3
      if (type === 3 || size > 128 * 1024) refuse('ZSTD_FORMAT', 'Invalid Zstandard block.')
      const payload = type === 1 ? 1 : size
      need(payload)
      offset += payload
      if (block & 1) break
    }
    need(4)
    offset += 4
    frames.push({ start, end: offset })
  }
  if (!frames.length) refuse('EMPTY', 'Empty session file.')
  return frames
}

function parseRecord(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    // JSON.parse silently collapses duplicate keys; refusing them avoids ambiguous
    // event identities, including escaped duplicate keys in nested payloads.
    const scopes = []
    const tokens = /"(?:[^"\\]|\\[\s\S])*"|[{}\[\]]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g
    for (const token of text.matchAll(tokens)) {
      const word = token[0]
      if (word === '{') scopes.push(new Set())
      else if (word === '[') scopes.push(null)
      else if (word === '}' || word === ']') scopes.pop()
      else if (word[0] === '"') {
        let next = token.index + word.length
        while (' \t\r\n'.includes(text[next]) && next < text.length) next++
        if (text[next] === ':') {
          const key = JSON.parse(word)
          const scope = scopes.at(-1)
          if (!scope || scope.has(key)) throw new Error()
          scope.add(key)
        }
      } else if (word[0] !== '"' && !Number.isFinite(Number(word))) throw new Error()
    }
    return value
  } catch {
    refuse('JSON_INVALID', 'Invalid UTF-8/JSON record, duplicate key or non-finite number.')
  }
}

function exactReceipt(row) {
  const keys = Object.keys(row)
  const data = row.data
  return keys.every(k => ['type', 'seq', 'time', 'data', 'ignorable'].includes(k))
    && ['type', 'seq', 'time', 'data'].every(k => Object.hasOwn(row, k))
    && (!Object.hasOwn(row, 'ignorable') || row.ignorable === true)
    && data !== null && typeof data === 'object' && !Array.isArray(data)
    && Object.keys(data).length === 2 && Object.hasOwn(data, 'turn') && Object.hasOwn(data, 'callId')
    && Number.isSafeInteger(data.turn) && data.turn > 0
    && typeof data.callId === 'string' && data.callId.length > 0
}

function validateStreams(artifact, llm) {
  for (const event of artifact.events) {
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue
    const assembler = new llm.BlockAssembler()
    const timed = llm.expandAssistantStream(event.data.stream)
    for (const member of timed) assembler.push(member.chunk)
    if (event.type === 'assistant/attempt' || !timed.length) continue
    const content = event.data.interrupted === true ? assembler.interruptedBlocks() : assembler.blocks()
    if (!isDeepStrictEqual(event.data.message.content, content)
      || !isDeepStrictEqual(event.data.usage, assembler.usage)
      || !isDeepStrictEqual(event.data.message.source.replayState, assembler.replayState)) throw new Error()
  }
}

function inspectBytes(bytes, compressed, runtime) {
  if (!bytes.length || bytes.length > LIMIT) refuse('SIZE_LIMIT', 'Session must be nonempty and at most 128 MiB.')
  const ranges = compressed ? frameRanges(bytes) : [{ start: 0, end: bytes.length }]
  const chunks = []
  let size = 0
  for (const range of ranges) {
    let chunk = bytes.subarray(range.start, range.end)
    if (compressed) {
      requireZstd()
      try { chunk = zlib.zstdDecompressSync(chunk, { maxOutputLength: LIMIT - size }) }
      catch { refuse('ZSTD_INVALID', 'Zstandard checksum/decompression failed or expanded size exceeds 128 MiB.') }
    }
    size += chunk.length
    if (size > LIMIT) refuse('SIZE_LIMIT', 'Expanded session exceeds 128 MiB.')
    chunks.push(chunk)
  }
  if (compressed && (chunks[0].length === 0 || chunks[0].indexOf(10) !== chunks[0].length - 1)) {
    refuse('HEADER_FRAME', 'First Zstandard frame must contain exactly one newline-terminated session header.')
  }
  const plain = Buffer.concat(chunks)
  if (plain.at(-1) !== 10) refuse('JSON_TORN', 'Session has an unterminated record; tail recovery is not supported.')
  const edits = []
  let start = 0, events = 0, receipts = 0, alreadyIgnorable = 0, restore
  for (let end = plain.indexOf(10); end !== -1; end = plain.indexOf(10, start)) {
    const line = plain.subarray(start, end)
    const row = parseRecord(line)
    if (start === 0) {
      if (row.type !== 'session' || row.version !== 4) refuse('HEADER_VERSION', 'Expected a native format-v4 session header.')
      try { restore = runtime.catalog.createRestore(row, { recovery: 'strict', validation: 'current' }) }
      catch { refuse('HEADER_INVALID', 'Official v4 header validation failed.') }
    } else {
      if (row.seq !== events || !Number.isSafeInteger(row.seq) || Object.is(row.seq, -0)) {
        refuse('SEQUENCE_INVALID', 'Expected dense event sequence numbers starting at zero.')
      }
      if (row.type === RECEIPT) {
        if (!exactReceipt(row)) refuse('RECEIPT_UNKNOWN', 'Memoir receipt does not match the exact legacy {turn,callId} shape.')
        receipts++
        if (row.ignorable === true) alreadyIgnorable++
        else {
          edits.push(start + line.lastIndexOf(125))
          row.ignorable = true
        }
      } else if (!runtime.known.has(row.type) && row.ignorable !== true) {
        refuse('EVENT_UNKNOWN', 'Another unknown required event is present; refusing the entire session.')
      }
      try { restore.decodeRow(row) }
      catch { refuse('EVENT_INVALID', 'Official v4 event validation failed.') }
      events++
    }
    start = end + 1
  }
  try { validateStreams(restore.finish(), runtime.llm) }
  catch { refuse('SESSION_INVALID', 'Official v4 session relationships, envelope or embedded stream validation failed.') }
  return { chunks, ranges, edits, events, receipts, alreadyIgnorable }
}

function repairedBytes(original, plan, compressed) {
  let base = 0
  return Buffer.concat(plan.chunks.map((chunk, index) => {
    const points = plan.edits.filter(offset => offset >= base && offset < base + chunk.length).map(offset => offset - base)
    base += chunk.length
    if (!points.length) return original.subarray(plan.ranges[index].start, plan.ranges[index].end)
    const parts = []
    let previous = 0
    for (const point of points) {
      parts.push(chunk.subarray(previous, point), INSERTION)
      previous = point
    }
    parts.push(chunk.subarray(previous))
    const changed = Buffer.concat(parts)
    return compressed ? zlib.zstdCompressSync(changed, { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } }) : changed
  }))
}

function identity(a, b) { return a.dev === b.dev && a.ino === b.ino }
function sameStat(a, b) {
  return identity(a, b) && ['size', 'mtimeNs', 'ctimeNs', 'mode', 'nlink', 'uid', 'gid'].every(k => a[k] === b[k])
}
async function pathChain(path) {
  const root = parse(path).root
  const chain = []
  let current = root
  for (const segment of path.slice(root.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, segment)
    const stat = await fs.lstat(current, { bigint: true })
    if (stat.isSymbolicLink()) refuse('SYMLINK', 'Symlinks and junctions are not supported, including parent directories.')
    if (current !== path && !stat.isDirectory()) refuse('PATH_INVALID', 'Non-directory path component.')
    chain.push({ path: current, stat })
  }
  return chain
}
async function checkChain(chain) {
  for (const item of chain) {
    const current = await fs.lstat(item.path, { bigint: true })
    if (current.isSymbolicLink() || !identity(current, item.stat)) refuse('CONCURRENT_CHANGE', 'File or directory identity changed.')
  }
}
function targetPath(input) {
  if (typeof input !== 'string' || !input || input.includes('\0')) refuse('PATH_REQUIRED', 'Specify one session file explicitly.')
  if (input.split(/[\\/]/).includes('..')) refuse('PATH_INVALID', 'Parent traversal is not supported.')
  const path = resolve(input)
  if (process.platform === 'win32' && path.startsWith('\\\\')) refuse('PATH_INVALID', 'Use a local drive path; UNC/device paths are not supported.')
  if (!['session.v4.jsonl', 'session.v4.jsonl.zstd'].includes(basename(path))) {
    refuse('FILENAME', 'Only session.v4.jsonl and session.v4.jsonl.zstd are supported.')
  }
  return path
}
async function snapshot(path) {
  const chain = await pathChain(path)
  const stat = chain.at(-1).stat
  if (!stat.isFile() || stat.nlink !== 1n) refuse('FILE_TYPE', 'Expected a regular file with exactly one hard link.')
  if (stat.size > BigInt(LIMIT)) refuse('SIZE_LIMIT', 'Session exceeds 128 MiB.')
  const handle = await fs.open(path, fsConstants.O_RDONLY | NOFOLLOW)
  try {
    if (!sameStat(stat, await handle.stat({ bigint: true }))) refuse('CONCURRENT_CHANGE', 'File changed while opening.')
    // Bound allocation even if a foreign process continuously appends during read.
    const buffer = Buffer.alloc(Number(stat.size) + 1)
    let used = 0
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, used)
      if (!bytesRead) break
      used += bytesRead
    }
    const bytes = buffer.subarray(0, used)
    if (used !== Number(stat.size) || !sameStat(stat, await handle.stat({ bigint: true }))) refuse('CONCURRENT_CHANGE', 'File changed while reading.')
    await checkChain(chain)
    return { bytes, stat, chain }
  } finally { await handle.close() }
}
async function unchanged(path, original) {
  await checkChain(original.chain)
  const current = await snapshot(path)
  if (!sameStat(current.stat, original.stat) || !current.bytes.equals(original.bytes)) {
    refuse('CONCURRENT_CHANGE', 'Session changed since audit; no replacement performed.')
  }
}

async function lockSession(path, runtime) {
  const lockPath = join(dirname(path), 'session.lock')
  try {
    const existing = await fs.lstat(lockPath, { bigint: true }).catch(e => { if (e.code !== 'ENOENT') throw e })
    if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1n)) refuse('LEASE_INVALID', 'Unsafe session.lock path.')
    if (process.platform === 'win32') {
      const kernel = (await runtime.load('koffi')).default.load('kernel32.dll')
      const create = kernel.func('__stdcall', 'CreateSemaphoreW', 'intptr', ['void*', 'int', 'int', 'str16'])
      const wait = kernel.func('__stdcall', 'WaitForSingleObject', 'uint', ['intptr', 'uint'])
      const release = kernel.func('__stdcall', 'ReleaseSemaphore', 'int', ['intptr', 'int', 'void*'])
      const close = kernel.func('__stdcall', 'CloseHandle', 'int', ['intptr'])
      const name = `Local\\dsh-session-lock-${createHash('sha256').update(resolve(lockPath).toLowerCase()).digest('hex')}`
      const handle = create(null, 1, 1, name)
      if (!handle) refuse('LEASE_UNAVAILABLE', 'Cannot acquire the Windows session semaphore.')
      const result = wait(handle, 0)
      if (result !== 0) {
        close(handle)
        refuse(result === 258 ? 'LEASE_ACTIVE' : 'LEASE_UNAVAILABLE', 'Session lease is active or unavailable; stop every host before retrying.')
      }
      return { check: async () => {}, release: async () => {
        const released = release(handle, 1, null)
        const closed = close(handle)
        if (!released || !closed) refuse('LEASE_RELEASE', 'Windows lease release failed.')
      } }
    }
    // Never unlink the stable flock inode, even when a failed apply created it.
    const handle = await fs.open(lockPath, fsConstants.O_RDWR | fsConstants.O_CREAT | NOFOLLOW, 0o600)
    try {
      const { tryLockExclusive } = await runtime.load('@deepseek-ai/node-addon-system/flock')
      await tryLockExclusive(handle.fd)
      const stat = await handle.stat({ bigint: true })
      const check = async () => {
        const current = await fs.lstat(lockPath, { bigint: true })
        if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n || !identity(stat, current)) {
          refuse('CONCURRENT_CHANGE', 'Session lock inode changed.')
        }
      }
      await check()
      return { check, release: () => handle.close() }
    } catch (error) { await handle.close(); throw error }
  } catch (error) {
    if (['LEASE_INVALID', 'LEASE_ACTIVE', 'LEASE_UNAVAILABLE', 'CONCURRENT_CHANGE'].includes(error.code)) throw error
    refuse(['EAGAIN', 'EWOULDBLOCK'].includes(error.code) ? 'LEASE_ACTIVE' : 'LEASE_UNAVAILABLE', 'Session lease is active or native lock support is unavailable.')
  }
}

async function writeExclusive(path, bytes, finalMode) {
  const handle = await fs.open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | NOFOLLOW, 0o600)
  try {
    await handle.writeFile(bytes)
    if (finalMode !== undefined) await handle.chmod(finalMode)
    await handle.sync()
  }
  finally { await handle.close() }
}
async function syncDirectory(path) {
  if (process.platform === 'win32') return // Node cannot fsync Windows directories.
  const handle = await fs.open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}

/**
 * Audit by default. Applying requires BOTH apply:true and hostStopped:true.
 * Returns only paths/counts, never session text. A failed apply retains any backup.
 * @param {string} input exact canonical session filename (no directory scanning)
 * @param {{dshPackage?:string, apply?:boolean, hostStopped?:boolean}} options
 */
export async function repairSessionReceipts(input, options = {}) {
  const path = targetPath(input)
  const apply = options.apply === true
  if (apply && options.hostStopped !== true) refuse('HOST_CONFIRMATION', 'Apply requires --host-stopped: stop every DSH host using this session first.')
  const compressed = path.endsWith('.zstd')
  if (compressed) requireZstd()
  const runtime = await runtimeFor(options.dshPackage)
  const original = await snapshot(path)
  if (apply && process.platform !== 'win32'
    && (original.stat.uid !== BigInt(process.geteuid()) || original.stat.gid !== BigInt(process.getegid()))) {
    refuse('OWNER_MISMATCH', 'Source uid/gid must match the effective process uid/gid; atomic replacement would change ownership.')
  }
  const plan = inspectBytes(original.bytes, compressed, runtime)
  await unchanged(path, original)
  const result = {
    path, mode: apply ? 'apply' : 'audit', encoding: compressed ? 'zstd' : 'jsonl',
    frames: compressed ? plan.ranges.length : 0, events: plan.events, receipts: plan.receipts,
    candidates: plan.edits.length, alreadyIgnorable: plan.alreadyIgnorable, changed: 0, backupPath: null,
  }
  if (!apply) return result
  const lease = await lockSession(path, runtime)
  let stagingPath
  let backupPath
  let committed = false
  try {
    await lease.check()
    await unchanged(path, original)
    if (!plan.edits.length) return result
    const output = repairedBytes(original.bytes, plan, compressed)
    const verified = inspectBytes(output, compressed, runtime)
    if (verified.edits.length || verified.events !== plan.events || verified.receipts !== plan.receipts) refuse('VERIFY_FAILED', 'Repaired session verification failed.')
    const suffix = randomUUID()
    backupPath = `${path}.memoir-repair-${suffix}.bak`
    await writeExclusive(backupPath, original.bytes)
    const backup = await snapshot(backupPath)
    if (!backup.bytes.equals(original.bytes)) refuse('BACKUP_INVALID', 'Backup verification failed.')
    await syncDirectory(dirname(path))
    stagingPath = `${path}.memoir-repair-${suffix}.tmp`
    await writeExclusive(stagingPath, output, Number(original.stat.mode & 0o777n))
    const staged = await snapshot(stagingPath)
    if (process.platform !== 'win32' && (staged.stat.uid !== original.stat.uid || staged.stat.gid !== original.stat.gid)) {
      refuse('OWNER_MISMATCH', 'Staging ownership differs from the source (for example a setgid parent directory).')
    }
    if (!staged.bytes.equals(output)) refuse('VERIFY_FAILED', 'Staged bytes differ from the verified repair.')
    inspectBytes(staged.bytes, compressed, runtime)
    await unchanged(backupPath, backup)
    await unchanged(stagingPath, staged)
    await lease.check()
    await unchanged(path, original)
    // Same-directory atomic rename; no unlink/copy fallback on any platform.
    await fs.rename(stagingPath, path)
    committed = true
    stagingPath = undefined
    await syncDirectory(dirname(path))
    const installed = await snapshot(path)
    if (!installed.bytes.equals(output)) refuse('VERIFY_FAILED', 'Installed bytes changed after replacement; backup retained.')
    return { ...result, changed: plan.edits.length, backupPath }
  } catch (error) {
    // Fixed diagnostics only: upstream errors can contain messages or credentials.
    throw Object.assign(new Error('Repair stopped; inspect the error code and retained backup path.'), {
      code: safeCode(error), path, backupPath: backupPath ?? null, stagingPath: stagingPath ?? null, committed,
    })
  } finally {
    // Do not remove anything on an error path: a concurrent writer may have
    // replaced the staging name. Report its path for deliberate inspection.
    await lease.release()
  }
}

/** Always read-only, regardless of extra options supplied by a caller. */
export function auditSessionReceipts(input, options) {
  return repairSessionReceipts(input, { ...options, apply: false })
}

const ERROR_CODES = new Set([
  'ZSTD_UNAVAILABLE', 'DSH_REQUIRED', 'DSH_UNSUPPORTED', 'ZSTD_TORN', 'ZSTD_FORMAT', 'EMPTY', 'SIZE_LIMIT',
  'ZSTD_INVALID', 'HEADER_FRAME', 'JSON_INVALID', 'JSON_TORN', 'HEADER_VERSION', 'HEADER_INVALID',
  'SEQUENCE_INVALID', 'RECEIPT_UNKNOWN', 'EVENT_UNKNOWN', 'EVENT_INVALID', 'SESSION_INVALID',
  'SYMLINK', 'PATH_INVALID', 'CONCURRENT_CHANGE', 'PATH_REQUIRED', 'FILENAME', 'FILE_TYPE',
  'LEASE_INVALID', 'LEASE_ACTIVE', 'LEASE_UNAVAILABLE', 'LEASE_RELEASE', 'HOST_CONFIRMATION',
  'VERIFY_FAILED', 'BACKUP_INVALID', 'OWNER_MISMATCH', 'ARGS', 'ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EIO', 'EEXIST', 'EBUSY',
])
function safeCode(error) { return ERROR_CODES.has(error?.code) ? error.code : 'REPAIR_FAILED' }

export async function main(argv = process.argv.slice(2)) {
  try {
    if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
      process.stdout.write([
        'Usage: node scripts/repair-session-receipts.mjs [--dsh-package <official-dsh-directory>] [--apply --host-stopped] <session.v4.jsonl[.zstd]>',
        'Default: read-only audit of exactly one file; no home scan. Uses local official SDK dependencies, or an explicitly supplied DSH installation. Native zstd requires a supported Node build (use Node 24).',
        'Apply: keep every host stopped; use a trusted local filesystem. Reviewed JSONL backends: 0.2.0-rc.1 / 0.2.0-rc.2. Linux requires its native flock addon and matching effective uid/gid; Windows uses its Koffi dependency for the host semaphore (same login session). No network/UNC filesystem support. Limit: 128 MiB stored/expanded. Backups and failed staging files remain beside the source.',
        'Windows ACL boundary: backup/staging/replacement files inherit directory ACLs; a source file custom ACL is not preserved. Only apply where inherited directory permissions already protect all log data.',
        '',
      ].join('\n'))
      return 0
    }
    const options = {}
    let input
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i]
      if (arg === '--apply' && !options.apply) options.apply = true
      else if (arg === '--host-stopped' && !options.hostStopped) options.hostStopped = true
      else if (arg === '--dsh-package' && !options.dshPackage && argv[i + 1] && !argv[i + 1].startsWith('--')) options.dshPackage = argv[++i]
      else if (!arg.startsWith('-') && !input) input = arg
      else refuse('ARGS', 'Invalid arguments; use --help.')
    }
    if (!input || (options.hostStopped && !options.apply)) refuse('ARGS', 'Specify exactly one file; --host-stopped requires --apply.')
    process.stdout.write(`${JSON.stringify(await repairSessionReceipts(input, options))}\n`)
    return 0
  } catch (error) {
    const code = safeCode(error)
    const message = code === 'ZSTD_UNAVAILABLE'
      ? 'Native Zstandard is unavailable. Use Node 24; this Node 22/build cannot process .zstd.'
      : code === 'DSH_UNSUPPORTED' ? 'Expected official JSONL backend 0.2.0-rc.1 or 0.2.0-rc.2 and its v4 validators; check --dsh-package.'
        : code === 'HOST_CONFIRMATION' ? 'Stop every DSH host, then explicitly pass --apply --host-stopped.'
          : 'Refused or stopped; no log content is included. Use --help for prerequisites.'
    process.stderr.write(`${JSON.stringify({ error: code, message, ...(error.path ? { path: error.path } : {}), ...(error.backupPath ? { backupPath: error.backupPath } : {}), ...(error.stagingPath ? { stagingPath: error.stagingPath } : {}), ...(error.committed ? { committed: true } : {}) })}\n`)
    return 1
  }
}

// npm's POSIX bin is a symlink; compare real paths without running on import.
const entryPath = process.argv[1] ? await fs.realpath(resolve(process.argv[1])).catch(() => undefined) : undefined
if (entryPath === fileURLToPath(import.meta.url)) process.exitCode = await main()
