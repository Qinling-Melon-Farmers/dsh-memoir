/**
 * Structured memory store for dsh-memoir — the single source of truth is the
 * global index JSON ($DSH_HOME/dsh-memoir.json, defaulting to ~/.dsh); the
 * per-project PROJECT_MEMORY.md is a regenerated human-readable rendering of
 * the same entries (git-friendly, auto-injected into future sessions). Pure
 * node:fs, no cordis dependency —
 * unit-testable with an injected path.
 *
 * v0.3.1: revision-based in-memory snapshot cache — cold start reads the file
 * once, warm reads return the snapshot without touching disk, writes bump the
 * revision and refresh the snapshot; external file changes are picked up by a
 * low-frequency mtime probe. Corrupt JSON is backed up (never silently
 * overwritten), atomic writes use unique temp names, and project keys are
 * normalized (drive-letter case + separators) so C:\A / c:\a\ / C:/A share
 * one bucket.
 */

import { createHash, randomBytes } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveDshHome } from './dsh-home.js'

/** Global index format version. */
export const FORMAT_VERSION = 4

/** Project memory file name (workspace root, git-committable). */
export const PROJECT_FILE = 'PROJECT_MEMORY.md'

/** Section keys, human labels, and markdown headers (fixed order for rendering). */
export const SECTIONS: Record<SectionKey, { label: string; header: string }> = {
  work: { label: '工作记录', header: '## 工作记录 Work Log' },
  lessons: { label: '经验教训', header: '## 经验教训 Lessons Learned' },
  actions: { label: '行动指南', header: '## 行动指南 Action Guide' },
  note: { label: '备注', header: '## 备注 Notes' },
}

/** Section keys in canonical render order. */
export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[]

/**
 * Legacy cap on how much project memory was auto-injected into the prompt,
 * in JS string length (not bytes, not tokens). Kept for compatibility with
 * existing imports; v0.4+ replaces this with the selector's token budget
 * (targetTokens / hardMaxTokens).
 */
export const INJECT_LIMIT = 16000

export type SectionKey = 'work' | 'lessons' | 'actions' | 'note'

/** Lifecycle state for one memory entry (v0.5.0). */
export type MemoirStatus = 'active' | 'superseded' | 'archived'
export const MEMOIR_STATUSES: MemoirStatus[] = ['active', 'superseded', 'archived']

/** Trusted origin of one memory entry (v0.5.6 / store format v4). */
export interface MemoirSource {
  /** DSH session / agent id that produced the memory. */
  sessionId?: string
  /** DSH turn number containing the memoir_record call. */
  turnId?: number
}

/** One structured memory entry. */
export interface MemoirEntry {
  id: string
  section: SectionKey
  title?: string
  content: string
  time: number
  source?: MemoirSource
  // Optional in the TypeScript shape for source compatibility with legacy
  // callers; normalize() materializes these fields before persistence.
  importance?: number
  pinned?: boolean
  status?: MemoirStatus
  supersedes?: string[]
  tags?: string[]
}

/** One project's bucket in the global index. */
export interface MemoirProject {
  path: string
  title: string
  updatedAt: number
  entries: MemoirEntry[]
}

/** The persisted store file shape. */
export interface MemoirStoreFile {
  version: number
  projects: Record<string, MemoirProject>
}

/** A record payload accepted from tools and the panel API. */
export interface EntryPayload {
  section: SectionKey
  title?: string
  content: string
  importance?: number
  pinned?: boolean
  supersedes?: string[]
  tags?: string[]
}

/** Mutable fields for an existing memory entry (v0.5 lifecycle). */
export interface EntryUpdate {
  section?: SectionKey
  /** Empty string or null removes the title. */
  title?: string | null
  content?: string
  importance?: number
  pinned?: boolean
  status?: MemoirStatus
  supersedes?: string[]
  tags?: string[]
}

/** An in-memory snapshot of the store at one revision. */
export interface StoreSnapshot {
  /** Write revision this snapshot reflects (bumped only by save()). */
  revision: number
  /** Snapshot epoch: bumped on every snapshot (re)build — external changes
   *  and first loads included — so consumers can key caches on it. */
  epoch: number
  /** The parsed (normalized) store file. */
  file: MemoirStoreFile
  /** Disk signature backing the snapshot; null when the file was absent. */
  stat: { mtimeMs: number; size: number } | null
}

/** Cache/IO counters exposed for diagnostics and cache-hit-rate tests. */
export interface CacheStats {
  /** Current write revision (bumped by record/remove). */
  revision: number
  /** Current snapshot epoch (bumped on every snapshot (re)build). */
  epoch: number
  /** Total load() calls. */
  loads: number
  /** Warm reads served straight from the snapshot (no file read). */
  hits: number
  /** Cold reads / rebuilds that consulted the file. */
  misses: number
  /** hits / loads, in [0, 1]. */
  hitRate: number
  /** Full file reads (parse) since construction. */
  fileReads: number
  /** mtime stat probes issued against the store file. */
  statProbes: number
  /** Corrupt store files that were backed up instead of overwritten. */
  corruptBackups: number
  /** renderMarkdown() calls. */
  renders: number
  /** Actual markdown recomputations. */
  renderComputes: number
  /** (renders - renderComputes) / renders, in [0, 1]. */
  renderHitRate: number
  /** Duration of the last cold load in milliseconds. */
  lastLoadMs?: number
}

/** How often (ms) warm load() calls re-probe the file mtime; 0 = every call. */
export const DEFAULT_MTIME_CHECK_MS = 2000

/** Default store location: $DSH_HOME/dsh-memoir.json (fallback ~/.dsh). */
export function defaultStorePath(): string {
  return join(resolveDshHome(), 'dsh-memoir.json')
}

/** Cross-process mutation lock defaults (roadmap §2.2). */
export const DEFAULT_LOCK_RETRY_MS = 25
export const DEFAULT_LOCK_TIMEOUT_MS = 5000
export const DEFAULT_LOCK_STALE_AFTER_MS = 60_000

/** Blocking sleep for short lock retries. */
function sleepSync(ms: number): void {
  const buffer = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(buffer, 0, 0, ms)
}

/**
 * Run fn while holding an exclusive lock file created with openSync('wx')
 * (atomic O_EXCL create, no race window). Retries every retryMs until
 * timeoutMs, then throws. The lock is always released in finally — even
 * when fn throws. Used to serialize read-modify-write store mutations
 * across processes sharing one ~/.dsh/dsh-memoir.json.
 */
export function withFileLock<T>(
  lockPath: string,
  fn: () => T,
  options: { retryMs?: number; timeoutMs?: number; staleAfterMs?: number } = {},
): T {
  const retryMs = options.retryMs ?? DEFAULT_LOCK_RETRY_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_LOCK_STALE_AFTER_MS
  const started = Date.now()
  let fd: number | null = null
  for (;;) {
    try {
      const candidate = openSync(lockPath, 'wx')
      try {
        writeFileSync(candidate, JSON.stringify({ pid: process.pid, createdAt: Date.now(), nonce: randomBytes(8).toString('hex') }))
      } catch (error) {
        try { closeSync(candidate) } catch { /* best effort */ }
        try { unlinkSync(lockPath) } catch { /* best effort */ }
        throw error
      }
      fd = candidate
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (reclaimableStaleLock(lockPath, staleAfterMs)) continue
      if (Date.now() - started >= timeoutMs) {
        throw new Error('dsh-memoir: store lock timeout after ' + timeoutMs + 'ms (' + lockPath + ') — another process may hold a stale lock')
      }
      sleepSync(retryMs)
    }
  }
  try {
    return fn()
  } finally {
    try {
      closeSync(fd)
    } catch {
      // already closed
    }
    try {
      unlinkSync(lockPath)
    } catch {
      // already released
    }
  }
}

/** Return true only for a well-formed, old lock owned by a dead process. */
function reclaimableStaleLock(lockPath: string, staleAfterMs: number): boolean {
  try {
    const raw = JSON.parse(readFileSync(lockPath, 'utf8')) as unknown
    if (typeof raw !== 'object' || raw === null) return false
    const metadata = raw as { pid?: unknown; createdAt?: unknown; nonce?: unknown }
    if (!Number.isInteger(metadata.pid) || (metadata.pid as number) <= 0 || typeof metadata.createdAt !== 'number' || !Number.isFinite(metadata.createdAt) || typeof metadata.nonce !== 'string' || metadata.nonce === '') return false
    if (Date.now() - metadata.createdAt <= staleAfterMs) return false
    try {
      process.kill(metadata.pid as number, 0)
      return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return false
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return false
    }
    const confirm = JSON.parse(readFileSync(lockPath, 'utf8')) as { nonce?: unknown; createdAt?: unknown }
    if (confirm.nonce !== metadata.nonce || confirm.createdAt !== metadata.createdAt) return false
    unlinkSync(lockPath)
    return true
  } catch {
    // Malformed/unreadable locks are fail-safe and will expire by timeout.
    return false
  }
}

/** `YYYY-MM-DD HH:mm` in local time. */
export function formatTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Normalize one workspace path into a stable key:
 * strip trailing separators, unify separators to '/'. Windows drive paths
 * are FULLY lowercased (v0.4.2) — the canonical bucket key of C:\A /
 * c:\a\ / C:/A is 'c:/a', so all case variants share one bucket. The
 * display path stored on the project keeps its original case. POSIX paths
 * are unchanged apart from trailing separators.
 */
export function projectKey(cwd: string): string {
  const raw = String(cwd).replace(/[\\/]+$/, '')
  const drive = /^([A-Za-z]):/.exec(raw)
  if (drive === null) return raw
  return (drive[1] + ':' + raw.slice(2)).toLowerCase().replace(/\\/g, '/')
}

/** Project display title: the last path segment. */
export function projectTitle(cwd: string): string {
  return projectKey(cwd).split('/').filter(Boolean).pop() || projectKey(cwd)
}

/** Mint one entry id (opaque, locally unique). */
function mintId(): string {
  return randomBytes(6).toString('hex')
}

/** Mint a unique temp-file suffix (avoids concurrent-write collisions). */
function tmpSuffix(): string {
  return `${process.pid}.${randomBytes(4).toString('hex')}`
}

/** Atomic write (unique tmp name + rename), creating the parent dir. */
export function writeFileAtomic(path: string, content: string, mode = 0o644): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = `${path}.tmp.${tmpSuffix()}`
  try {
    writeFileSync(tmp, content, { encoding: 'utf8', mode })
    renameSync(tmp, path)
  } catch (error) {
    try {
      if (existsSync(tmp)) renameSync(tmp, tmp + '.failed')
    } catch {
      // best effort: never mask the original write error
    }
    throw error
  }
}

/** Trim a long text to a bounded tail for prompt injection. */
export function bounded(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `…（内容较长，仅显示最近 ${limit} 字节）…\n` + value.slice(-limit)
}

/** Validate one record payload; returns an error message or undefined. */
export function validateEntryPayload(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return 'payload must be a JSON object'
  const record = payload as Record<string, unknown>
  if (typeof record.section !== 'string' || !Object.prototype.hasOwnProperty.call(SECTIONS, record.section)) {
    return `section must be one of ${SECTION_KEYS.join('/')}`
  }
  if (typeof record.content !== 'string' || record.content.trim() === '') return 'content is required'
  if (record.title !== undefined && (typeof record.title !== 'string' || record.title.length > 200)) {
    return 'title must be a string of at most 200 chars'
  }
  if (record.importance !== undefined && (!Number.isInteger(record.importance) || (record.importance as number) < 1 || (record.importance as number) > 5)) {
    return 'importance must be an integer from 1 to 5'
  }
  if (record.pinned !== undefined && typeof record.pinned !== 'boolean') return 'pinned must be a boolean'
  if (record.supersedes !== undefined && (!Array.isArray(record.supersedes) || record.supersedes.some((id) => typeof id !== 'string' || id.trim() === ''))) {
    return 'supersedes must be an array of entry ids'
  }
  if (record.tags !== undefined && (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== 'string' || tag.trim() === ''))) {
    return 'tags must be an array of non-empty strings'
  }
  return undefined
}

/** Validate a partial update without requiring the immutable record fields. */
export function validateEntryUpdate(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return 'patch must be a JSON object'
  const patch = payload as Record<string, unknown>
  const fields = ['section', 'title', 'content', 'importance', 'pinned', 'status', 'supersedes', 'tags']
  if (!fields.some((field) => Object.prototype.hasOwnProperty.call(patch, field))) return 'at least one update field is required'
  if (patch.section !== undefined && (typeof patch.section !== 'string' || !Object.prototype.hasOwnProperty.call(SECTIONS, patch.section))) {
    return `section must be one of ${SECTION_KEYS.join('/')}`
  }
  if (patch.title !== undefined && patch.title !== null && (typeof patch.title !== 'string' || patch.title.length > 200)) {
    return 'title must be a string of at most 200 chars, or null to clear it'
  }
  if (patch.content !== undefined && (typeof patch.content !== 'string' || patch.content.trim() === '')) return 'content cannot be empty'
  if (patch.importance !== undefined && (!Number.isInteger(patch.importance) || (patch.importance as number) < 1 || (patch.importance as number) > 5)) {
    return 'importance must be an integer from 1 to 5'
  }
  if (patch.pinned !== undefined && typeof patch.pinned !== 'boolean') return 'pinned must be a boolean'
  if (patch.status !== undefined && (typeof patch.status !== 'string' || !MEMOIR_STATUSES.includes(patch.status as MemoirStatus))) {
    return `status must be one of ${MEMOIR_STATUSES.join('/')}`
  }
  if (patch.supersedes !== undefined && (!Array.isArray(patch.supersedes) || patch.supersedes.some((id) => typeof id !== 'string' || id.trim() === ''))) {
    return 'supersedes must be an array of entry ids'
  }
  if (patch.tags !== undefined && (!Array.isArray(patch.tags) || patch.tags.some((tag) => typeof tag !== 'string' || tag.trim() === ''))) {
    return 'tags must be an array of non-empty strings'
  }
  return undefined
}

function normalizedImportance(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5 ? value as number : 3
}

function normalizedStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const values = [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()))]
  return values.length > 0 ? values : undefined
}

/** Normalize v4 source metadata, lazily lifting the legacy top-level sessionId. */
function normalizedSource(value: unknown, legacySessionId?: unknown): MemoirSource | undefined {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const sessionId = typeof source.sessionId === 'string' && source.sessionId.trim() !== ''
    ? source.sessionId.trim()
    : typeof legacySessionId === 'string' && legacySessionId.trim() !== ''
      ? legacySessionId.trim()
      : undefined
  const turnId = Number.isSafeInteger(source.turnId) && (source.turnId as number) >= 1
    ? source.turnId as number
    : undefined
  if (sessionId === undefined && turnId === undefined) return undefined
  return {
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(turnId !== undefined ? { turnId } : {}),
  }
}

/**
 * The structured memory store.
 */
export class MemoirStore {
  /** The store file path. */
  readonly path: string

  /** How often warm load() calls re-probe the file mtime (0 = every call). */
  readonly mtimeCheckIntervalMs: number

  /** Cross-process mutation lock retry interval (withFileLock). */
  readonly lockRetryMs: number

  /** Cross-process mutation lock acquisition timeout (withFileLock). */
  readonly lockTimeoutMs: number
  /** Cross-process stale lock reclaim threshold. */
  readonly lockStaleAfterMs: number

  /** The in-memory snapshot backing warm reads. */
  private snapshot: StoreSnapshot | null = null
  /** Write counter; bumped on every save() (record/remove). */
  private revision = 0
  /** Snapshot-rebuild counter; bumped on every snapshot (re)build. */
  private epoch = 0
  /** Timestamp of the last mtime probe (throttles external-change checks). */
  private lastMtimeCheck = 0

  // IO / cache counters (diagnostics + tests).
  private loadCount = 0
  private hitCount = 0
  private fileReadCount = 0
  private statProbeCount = 0
  private corruptBackupCount = 0
  private lastLoadMs: number | undefined

  /** renderMarkdown cache: project key → { signature, markdown }. */
  private renderCache = new Map<string, { signature: string; markdown: string }>()
  private renderCount = 0
  private renderComputeCount = 0

  /**
   * @param path - store file path (defaults to the standard location).
   * @param options.mtimeCheckIntervalMs - mtime probe throttle; 0 probes on
   *   every load (tests), defaults to a low-frequency 2000ms.
   * @param options.lockRetryMs / lockTimeoutMs - cross-process mutation lock
   *   tuning (tests shrink these; defaults 25ms / 5000ms).
   */
  constructor(path?: string, options?: { mtimeCheckIntervalMs?: number; lockRetryMs?: number; lockTimeoutMs?: number; lockStaleAfterMs?: number }) {
    this.path = path ?? defaultStorePath()
    this.mtimeCheckIntervalMs = options?.mtimeCheckIntervalMs ?? DEFAULT_MTIME_CHECK_MS
    this.lockRetryMs = options?.lockRetryMs ?? DEFAULT_LOCK_RETRY_MS
    this.lockTimeoutMs = options?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS
    this.lockStaleAfterMs = options?.lockStaleAfterMs ?? DEFAULT_LOCK_STALE_AFTER_MS
  }

  /** The cross-process lock file guarding mutations of this store. */
  private lockFilePath(): string {
    return this.path.replace(/\.json$/, '') + '.lock'
  }

  /**
   * Run one read-modify-write mutation inside the cross-process lock.
   * Inside the critical section the in-memory snapshot is dropped and the
   * store is re-read from disk, so a process whose snapshot went stale
   * mutates the latest on-disk state (no lost update between processes).
   */
  private mutateLocked<T>(mutate: () => T): T {
    const lockPath = this.lockFilePath()
    const dir = dirname(lockPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
    return withFileLock(
      lockPath,
      () => {
        this.invalidate()
        return mutate()
      },
      { retryMs: this.lockRetryMs, timeoutMs: this.lockTimeoutMs, staleAfterMs: this.lockStaleAfterMs },
    )
  }

  /** Current store revision (0 before the first load/save). */
  currentRevision(): number {
    return this.revision
  }

  /** Stat the store file into the snapshot signature (null when absent). */
  private statNow(): { mtimeMs: number; size: number } | null {
    try {
      const s = statSync(this.path)
      return { mtimeMs: s.mtimeMs, size: s.size }
    } catch {
      return null
    }
  }

  /**
   * Load and normalize the store.
   *
   * Revision-based snapshot cache: the first call of a process reads and
   * parses the file; every later call returns the in-memory snapshot without
   * touching disk. External file changes (another dsh process) are picked up
   * by a low-frequency mtime probe (mtimeCheckIntervalMs). Absence is
   * negatively cached the same way. Corrupt JSON is renamed to a
   * `.corrupt.<timestamp>` backup before the store starts fresh.
   */
  load(): MemoirStoreFile {
    this.loadCount++
    const started = Date.now()

    // Warm path: serve the snapshot directly; probe mtime only at the
    // configured frequency (or every call when the interval is 0).
    if (this.snapshot !== null) {
      const now = Date.now()
      if (this.mtimeCheckIntervalMs === 0 || now - this.lastMtimeCheck >= this.mtimeCheckIntervalMs) {
        this.lastMtimeCheck = now
        this.statProbeCount++
        const stat = this.statNow()
        const same =
          this.snapshot.stat === null
            ? stat === null
            : stat !== null && stat.mtimeMs === this.snapshot.stat.mtimeMs && stat.size === this.snapshot.stat.size
        if (same) {
          this.hitCount++
          return this.snapshot.file
        }
        // File changed underneath us: fall through to a rebuild.
      } else {
        this.hitCount++
        return this.snapshot.file
      }
    }

    // Cold path: stat + read + parse (+ corrupt backup) + normalize.
    let stat = this.statNow()
    let parsed: Partial<MemoirStoreFile> = { version: FORMAT_VERSION, projects: {} }
    if (stat !== null) {
      try {
        const raw: unknown = JSON.parse(readFileSync(this.path, 'utf8'))
        if (typeof raw === 'object' && raw !== null && typeof (raw as MemoirStoreFile).projects === 'object' && (raw as MemoirStoreFile).projects !== null) {
          parsed = raw as Partial<MemoirStoreFile>
        } else {
          throw new Error('store shape invalid')
        }
      } catch {
        // Corrupt store: preserve it as a backup, then start fresh (the
        // project markdown files remain as human-readable history).
        this.corruptBackupCount++
        try {
          renameSync(this.path, `${this.path}.corrupt.${Date.now()}`)
          stat = null
        } catch {
          // Backup failed (permissions?): keep serving fresh in-memory; the
          // next save will still overwrite the corrupt file.
        }
      }
      this.fileReadCount++
    }
    const file = this.normalize(parsed)
    this.epoch++
    this.snapshot = { revision: this.revision, epoch: this.epoch, file, stat }
    this.lastMtimeCheck = Date.now()
    this.lastLoadMs = Date.now() - started
    // Entry shapes may have changed underneath us: drop the render cache.
    this.renderCache.clear()
    return file
  }

  /** Normalize a parsed store file: mint ids, coerce shapes, merge duplicate
   *  buckets that normalize to the same project key (legacy Windows variants). */
  private normalize(parsed: Partial<MemoirStoreFile>): MemoirStoreFile {
    const projects: Record<string, MemoirProject> = {}
    for (const [rawKey, project] of Object.entries(parsed.projects ?? {})) {
      if (typeof project !== 'object' || project === null) continue
      const key = projectKey(rawKey)
      const rawEntries: unknown[] = Array.isArray(project.entries) ? project.entries : []
      const entries: MemoirEntry[] = rawEntries
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .map((e) => ({
              id: typeof e.id === 'string' && e.id !== '' ? e.id : mintId(),
              section: typeof e.section === 'string' && Object.prototype.hasOwnProperty.call(SECTIONS, e.section) ? (e.section as SectionKey) : 'note',
              // Conditional spread (not "title: undefined"): the in-memory
              // shape must round-trip the serialized JSON exactly, so
              // snapshot.file stays deep-equal to the on-disk file.
              ...(typeof e.title === 'string' && e.title !== '' ? { title: e.title } : {}),
              content: typeof e.content === 'string' ? e.content : '',
              time: typeof e.time === 'number' && Number.isFinite(e.time) ? e.time : Date.now(),
              ...(normalizedSource(e.source, e.sessionId) !== undefined ? { source: normalizedSource(e.source, e.sessionId) } : {}),
              importance: normalizedImportance(e.importance),
              pinned: e.pinned === true,
              status: e.status === 'active' || e.status === 'superseded' || e.status === 'archived' ? e.status : 'active',
              ...(normalizedStrings(e.supersedes) !== undefined ? { supersedes: normalizedStrings(e.supersedes) } : {}),
              ...(normalizedStrings(e.tags) !== undefined ? { tags: normalizedStrings(e.tags) } : {}),
            }))
      const normalized: MemoirProject = {
        path: typeof project.path === 'string' && project.path !== '' ? project.path : rawKey,
        title: typeof project.title === 'string' && project.title !== '' ? project.title : projectTitle(rawKey),
        updatedAt: typeof project.updatedAt === 'number' ? project.updatedAt : (entries[entries.length - 1]?.time ?? Date.now()),
        entries,
      }
      const existing = projects[key]
      if (existing === undefined) {
        projects[key] = normalized
      } else {
        // Same workspace stored under legacy key variants: merge by id.
        const seen = new Set(existing.entries.map((e) => e.id))
        for (const entry of normalized.entries) {
          if (!seen.has(entry.id)) existing.entries.push(entry)
        }
        existing.updatedAt = Math.max(existing.updatedAt, normalized.updatedAt)
      }
    }
    return { version: FORMAT_VERSION, projects }
  }

  /** Persist the store atomically (0600 — may contain user's notes). */
  save(file: MemoirStoreFile): void {
    try {
      writeFileAtomic(this.path, JSON.stringify(file, null, 2) + '\n', 0o600)
    } catch (error) {
      // The in-memory snapshot may already carry the mutation; drop it so the
      // next load() re-reads the on-disk truth instead of serving a stale hit.
      this.snapshot = null
      throw error
    }
    // Bump the revision and refresh the snapshot signature from the file we
    // just wrote: subsequent reads hit the cache without re-parsing.
    this.revision++
    this.epoch++
    this.snapshot = { revision: this.revision, epoch: this.epoch, file, stat: this.statNow() }
    this.lastMtimeCheck = Date.now()
    // Entry shapes changed under a mutation: drop all render-cache entries.
    this.renderCache.clear()
  }

  /** Drop the snapshot so the next load() re-reads and re-parses the file. */
  invalidate(): void {
    this.snapshot = null
    this.renderCache.clear()
  }

  /** Cache/IO counters (diagnostics + tests). */
  stats(): CacheStats {
    return {
      revision: this.revision,
      epoch: this.epoch,
      loads: this.loadCount,
      hits: this.hitCount,
      misses: this.loadCount - this.hitCount,
      hitRate: this.loadCount === 0 ? 0 : this.hitCount / this.loadCount,
      fileReads: this.fileReadCount,
      statProbes: this.statProbeCount,
      corruptBackups: this.corruptBackupCount,
      renders: this.renderCount,
      renderComputes: this.renderComputeCount,
      renderHitRate: this.renderCount === 0 ? 0 : (this.renderCount - this.renderComputeCount) / this.renderCount,
      lastLoadMs: this.lastLoadMs,
    }
  }

  /** One project record, or undefined. */
  project(cwd: string): MemoirProject | undefined {
    return this.load().projects[projectKey(cwd)]
  }

  /** Entries of one project in insertion order. */
  entries(cwd: string): MemoirEntry[] {
    return this.project(cwd)?.entries ?? []
  }

  /** Compact per-project summaries (path, title, entry count, updatedAt). */
  listProjects(): Array<{ key: string; path: string; title: string; count: number; updatedAt: number }> {
    const store = this.load()
    return Object.entries(store.projects).map(([key, project]) => ({
      key,
      path: project.path,
      title: project.title,
      count: project.entries.length,
      updatedAt: project.updatedAt,
    }))
  }

  /** Append one entry and regenerate the project markdown. Returns the entry. */
  record(cwd: string, payload: EntryPayload, source?: MemoirSource | string): MemoirEntry {
    const error = validateEntryPayload(payload)
    if (error !== undefined) throw new Error(error)
    return this.mutateLocked(() => {
      const store = this.load()
      const key = projectKey(cwd)
      const project = (store.projects[key] ??= {
        // Display path keeps the caller's original case; the bucket key is
        // the canonical (lowercased for Windows) projectKey(cwd).
        path: cwd,
        title: projectTitle(key),
        updatedAt: Date.now(),
        entries: [],
      })
      const normalizedOrigin = normalizedSource(
        typeof source === 'object' && source !== null ? source : undefined,
        typeof source === 'string' ? source : undefined,
      )
      const entry: MemoirEntry = {
        id: mintId(),
        section: payload.section,
        ...(typeof payload.title === 'string' && payload.title.trim() !== '' ? { title: payload.title.trim() } : {}),
        content: payload.content.trim(),
        time: Date.now(),
        ...(normalizedOrigin !== undefined ? { source: normalizedOrigin } : {}),
        importance: normalizedImportance(payload.importance),
        pinned: payload.pinned === true,
        status: 'active',
        ...(normalizedStrings(payload.supersedes) !== undefined ? { supersedes: normalizedStrings(payload.supersedes) } : {}),
        ...(normalizedStrings(payload.tags) !== undefined ? { tags: normalizedStrings(payload.tags) } : {}),
      }
      const superseded = new Set(entry.supersedes ?? [])
      if (superseded.size > 0) {
        for (const existing of project.entries) {
          if (superseded.has(existing.id)) existing.status = 'superseded'
        }
      }
      project.entries.push(entry)
      project.updatedAt = entry.time
      this.save(store)
      this.writeProjectFile(cwd)
      return entry
    })
  }

  /** Remove one entry by id; regenerates the project markdown. */
  remove(cwd: string, id: string): boolean {
    return this.mutateLocked(() => {
      const store = this.load()
      const key = projectKey(cwd)
      const project = store.projects[key]
      if (project === undefined) return false
      const index = project.entries.findIndex((e) => e.id === id)
      if (index < 0) return false
      project.entries.splice(index, 1)
      project.updatedAt = Date.now()
      this.save(store)
      this.writeProjectFile(cwd)
      return true
    })
  }

  /** Update an existing entry without deleting its id or creation time. */
  update(cwd: string, id: string, patch: EntryUpdate): MemoirEntry | undefined {
    return this.mutateLocked(() => {
      const store = this.load()
      const project = store.projects[projectKey(cwd)]
      const entry = project?.entries.find((candidate) => candidate.id === id)
      if (entry === undefined) return undefined
      if (patch.section !== undefined) entry.section = patch.section
      if (patch.title !== undefined) {
        const title = patch.title?.trim() ?? ''
        if (title === '') delete entry.title
        else entry.title = title
      }
      if (patch.content !== undefined) entry.content = patch.content.trim()
      if (patch.importance !== undefined) entry.importance = normalizedImportance(patch.importance)
      if (patch.pinned !== undefined) entry.pinned = patch.pinned
      if (patch.status !== undefined) entry.status = patch.status
      if (patch.supersedes !== undefined) {
        const supersedes = normalizedStrings(patch.supersedes)?.filter((target) => target !== entry.id)
        if (supersedes === undefined || supersedes.length === 0) delete entry.supersedes
        else {
          entry.supersedes = supersedes
          const targets = new Set(supersedes)
          for (const candidate of project.entries) {
            if (candidate.id !== entry.id && targets.has(candidate.id)) candidate.status = 'superseded'
          }
        }
      }
      if (patch.tags !== undefined) {
        const tags = normalizedStrings(patch.tags)
        if (tags === undefined) delete entry.tags
        else entry.tags = tags
      }
      project.updatedAt = Date.now()
      this.save(store)
      this.writeProjectFile(cwd)
      return entry
    })
  }

  /** Render one entry as a markdown bullet line. */
  renderEntryLine(entry: MemoirEntry): string {
    const label = SECTIONS[entry.section]?.label ?? entry.section
    const when = formatTime(entry.time)
    const head = entry.title !== undefined ? `${entry.title} — ` : ''
    return `- [${when}] [${label}] ${head}${entry.content}`
  }

  /** Cheap O(1) signature of one project's entries (count + tail id/time). */
  private renderSignature(project: MemoirProject | undefined): string {
    const entries = project?.entries ?? []
    const last = entries[entries.length - 1]
    return `${entries.length}|${project?.updatedAt ?? 0}|${last?.id ?? ''}|${last?.time ?? ''}`
  }

  /** Regenerate the full PROJECT_MEMORY.md content for one project. */
  renderMarkdown(cwd: string): string {
    this.renderCount++
    const key = projectKey(cwd)
    const project = this.load().projects[key]
    const signature = this.renderSignature(project)
    const cached = this.renderCache.get(key)
    if (cached !== undefined && cached.signature === signature) return cached.markdown
    const markdown = this.renderMarkdownNow(project?.entries ?? [])
    this.renderComputeCount++
    this.renderCache.set(key, { signature, markdown })
    return markdown
  }

  /** Pure markdown assembly for one project's entries (no cache access). */
  private renderMarkdownNow(entries: MemoirEntry[]): string {
    const header = [
      '# 项目持久记忆 Project Memory',
      '',
      '> 本文件由 dsh-memoir 插件维护：记录本项目历次会话的工作归纳、经验教训与行动指南，',
      '> 作为未来 AGENTS 接手本项目时的行动指南；它是人类可读的投影，不是 system prompt 的完整注入内容。',
      '> 新会话只注入有界的 Hot Memory，完整历史通过 memoir_read 按需检索。',
      '',
    ]
    const body: string[] = []
    for (const key of SECTION_KEYS) {
      const group = entries.filter((e) => e.section === key)
      if (group.length === 0) continue
      body.push(SECTIONS[key].header, '')
      for (const entry of group) body.push(this.renderEntryLine(entry))
      body.push('')
    }
    if (body.length === 0) {
      body.push('> 暂无条目。让 agent 用 memoir_record 沉淀，或在「记忆」面板中手动记录。', '')
    }
    return [...header, ...body].join('\n')
  }

  /** Absolute path of one project's memory file (no write). */
  projectFilePath(cwd: string): string {
    return join(cwd, PROJECT_FILE)
  }

  /** Regenerate and write the project memory file; returns its path. */
  writeProjectFile(cwd: string): string {
    const path = this.projectFilePath(cwd)
    const markdown = this.renderMarkdown(cwd)
    // Skip the write when the file already holds this exact content — keeps
    // mtimes stable (no git churn) and avoids pointless disk writes.
    try {
      if (existsSync(path) && readFileSync(path, 'utf8') === markdown) return path
    } catch {
      // Unreadable file: fall through to a fresh atomic write.
    }
    writeFileAtomic(path, markdown)
    return path
  }
}

/** SHA-256 hex digest of a string, truncated for prompt-stability hashing. */
export function sha256(text: string, length = 16): string {
  return createHash('sha256').update(text).digest('hex').slice(0, length)
}
