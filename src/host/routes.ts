/**
 * /api/dsh-memoir/* route layer for the web panel: a JSON envelope (ok /
 * error) over the structured store. Reads are GET with query params; writes
 * require an explicit application/json content-type (blocks form-based CSRF,
 * same stance as the sibling aionui-panel routes).
 *
 * v0.4.2 additions: ranked /search (shared RetrievalEngine with memoir_read),
 * /hot-memory preview, extended diagnostics (retrieval index + query cache +
 * last query + session snapshot), and workspace authorization on writes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { MEMOIR_STATUSES, SECTIONS, SECTION_KEYS, projectKey, projectTitle, validateEntryPayload, validateEntryUpdate } from './store.js'
import type { CacheStats, EntryPayload, EntryUpdate, MemoirEntry, MemoirStatus, MemoirStore } from './store.js'
import type { RetrievalDiagnostics, RetrievalEngine } from './retrieval.js'
import { governedRecord, type RecordResolution } from './governance.js'
import { validateMemoirSettingsPatch } from './settings.js'
import type { MemoirSettingsPatch, MemoirSettingsSnapshot } from './settings.js'
import { hostCopy } from './i18n.js'

/** Diagnostics payload shape (v0.4 observability, roadmap §4 / §6.3). */
export interface DiagnosticsValue {
  storeRevision: number
  snapshotEpoch: number
  cache: CacheStats
  snapshotCount: number
  snapshotMax: number
  hotMemory: { selected: number; total: number; estimatedTokens: number } | null
  /** v0.4.2: retrieval index / query cache / last query observability. */
  retrieval: RetrievalDiagnostics
  /** v0.4.2: the most recently frozen session snapshot, if any. */
  snapshot: { hash: string; createdAt: number; storeRevision: number } | null
  config: {
    language: 'zh' | 'en'
    announceToAgent: boolean
    autoDistill: boolean
    autoDistillEvery: number
    autoDistillCooldownMin: number
    autoDistillMinTools: number
    hotMemoryTokens: number
    hotMemoryMaxTokens: number
    readDefaultLimit: number
    readMaxLimit: number
    sessionSnapshotMax: number
    queryCacheSize: number
  }
}

/** Supplies the runtime diagnostics snapshot (closed over plugin state). */
export type DiagnosticsProvider = (path?: string) => DiagnosticsValue

/** Hot-memory preview for one workspace (the inspector endpoint). */
export type HotMemoryProvider = (path: string) => { text: string; selected: MemoirEntry[]; total: number; estimatedTokens: number } | null

/** Runtime settings exposed to the same-origin Web panel. */
export interface MemoirSettingsProvider {
  get(): MemoirSettingsSnapshot
  update(patch: MemoirSettingsPatch): MemoirSettingsSnapshot
  reset(): MemoirSettingsSnapshot
}

export interface Envelope<T = unknown> {
  ok: boolean
  value?: T
  error?: { code: string; message: string }
}

const OK = <T>(value: T): Envelope<T> => ({ ok: true, value })
const FAIL = (error: { code: string; message: string }): Envelope<never> => ({ ok: false, error })

/** Write one JSON envelope response. */
export function json(res: ServerResponse, envelope: Envelope<unknown>, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(envelope))
}

/** Read a bounded JSON request body; null when unparseable or oversized. */
export async function readJsonBody(req: IncomingMessage, limit = 1 << 20): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    chunks.push(buffer)
    total += buffer.length
    if (total > limit) return null
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** Extract a string field; null when missing/empty or not a string. */
function strField(payload: unknown, key: string, allowEmpty = false): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  if (typeof value !== 'string') return null
  if (!allowEmpty && value === '') return null
  return value
}

/** Validate a workspace path field for writes (absolute on win32/posix). */
function validPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]|[\\/]/.test(value)
}

/** Filter one entry by optional section + query. */
function entryFilter(section: string | undefined, query: string, status: MemoirStatus | 'all' = 'active'): (entry: MemoirEntry) => boolean {
  const q = query.toLowerCase()
  return (entry) =>
    (section === undefined || entry.section === section) &&
    (status === 'all' || (entry.status ?? 'active') === status) &&
    (q === '' || `${entry.title ?? ''} ${entry.content}`.toLowerCase().includes(q))
}

/** Project one project record into the wire shape. */
function wireEntry(entry: MemoirEntry) {
  return {
    ...entry,
    // Keep the pre-v4 wire alias during the migration window. The store's
    // canonical provenance is entry.source.
    ...(entry.source?.sessionId !== undefined ? { sessionId: entry.source.sessionId } : {}),
  }
}

function wireProject(
  key: string,
  project: { path: string; title: string; updatedAt: number; entries: MemoirEntry[] },
  filter: (entry: MemoirEntry) => boolean,
) {
  const stats = { total: project.entries.length, active: 0, superseded: 0, archived: 0 }
  for (const entry of project.entries) stats[entry.status ?? 'active'] += 1
  return {
    key,
    path: project.path,
    title: project.title || projectTitle(project.path),
    updatedAt: project.updatedAt,
    entries: project.entries.filter(filter).map(wireEntry),
    stats,
  }
}

/**
 * Build the /api/dsh-memoir prefix route.
 * @param store - the structured MemoirStore.
 * @param diagnostics - optional runtime diagnostics provider.
 * @param retrieval - optional RetrievalEngine (ranked /search endpoint).
 * @param hotMemory - optional hot-memory preview provider (inspector).
 * @param allowedWorkspace - optional write guard: only paths it accepts may
 *   be written via the panel API (v0.4.2 host safety, roadmap §3.5).
 * @param touchWorkspace - deprecated compatibility slot; GET requests never
 *   use it for authorization because browser-supplied paths are untrusted.
 * @param settings - optional persistent live runtime settings.
 * @returns route definitions for ctx.webServer.register.
 */
export function makeRoutes(
  store: MemoirStore,
  diagnostics?: DiagnosticsProvider,
  retrieval?: RetrievalEngine,
  hotMemory?: HotMemoryProvider,
  allowedWorkspace?: (path: string) => boolean,
  touchWorkspace?: (path: string) => void,
  settings?: MemoirSettingsProvider,
): WebRoute[] {
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Without a settings provider, retain the route layer's historical
    // English errors. The real plugin always supplies its live language.
    const language = settings?.get().settings.language ?? 'en'
    const copy = hostCopy(language).routes
    const BAD_REQUEST = { code: 'bad-request', message: copy.malformed }
    const NOT_FOUND = { code: 'not-found', message: copy.notFound }
    const METHOD = { code: 'method', message: copy.method }
    const CONTENT_TYPE = { code: 'content-type', message: copy.contentType }
    const url = new URL(req.url ?? '/', 'http://x')
    const pathname = url.pathname
    const method = (req.method ?? 'GET').toUpperCase()

    // ------------------------------------------------------------ reads
    if (method === 'GET') {
      if (pathname === '/api/dsh-memoir/settings') {
        if (settings === undefined) {
          json(res, FAIL(NOT_FOUND), 404)
          return
        }
        json(res, OK(settings.get()))
        return
      }
      if (pathname === '/api/dsh-memoir/search') {
        // v0.4.2: the GUI and memoir_read share this RetrievalEngine.
        if (retrieval === undefined) {
          json(res, FAIL(NOT_FOUND), 404)
          return
        }
        const scope = url.searchParams.get('scope') ?? 'all'
        const path = url.searchParams.get('path') ?? undefined
        const section = url.searchParams.get('section') ?? undefined
        if (section !== undefined && !SECTION_KEYS.includes(section as never)) {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        const query = url.searchParams.get('query') ?? ''
        const rawStatus = url.searchParams.get('status') ?? 'active'
        if (rawStatus !== 'all' && !MEMOIR_STATUSES.includes(rawStatus as MemoirStatus)) {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        if (query === '') {
          json(res, OK({ results: [] }))
          return
        }
        if (scope === 'project' && (path === undefined || path === '')) {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        const rawLimit = Number(url.searchParams.get('limit') ?? 30)
        const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 30))
        const cwd = scope === 'project' ? path : undefined
        const ranked = retrieval.cachedSearch(query, { section: section as never, cwd, status: rawStatus as MemoirStatus | 'all' }).slice(0, limit)
        json(res, OK({ results: ranked.map((result) => ({ ...result, entry: wireEntry(result.entry) })) }))
        return
      }
      if (pathname === '/api/dsh-memoir/hot-memory') {
        // v0.4.2: inspector preview of what the next session inherits.
        if (hotMemory === undefined) {
          json(res, FAIL(NOT_FOUND), 404)
          return
        }
        const path = url.searchParams.get('path') ?? ''
        if (path === '') {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        const preview = hotMemory(path)
        json(res, OK({ hotMemory: preview === null ? null : { ...preview, selected: preview.selected.map(wireEntry) } }))
        return
      }
      if (pathname === '/api/dsh-memoir/diagnostics') {
        if (diagnostics === undefined) {
          json(res, FAIL(NOT_FOUND), 404)
          return
        }
        const path = url.searchParams.get('path') ?? undefined
        json(res, OK(diagnostics(path)))
        return
      }
      if (pathname === '/api/dsh-memoir/project') {
        const path = url.searchParams.get('path')
        if (path === null || path === '') {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        const section = url.searchParams.get('section') ?? undefined
        if (section !== undefined && !SECTION_KEYS.includes(section as never)) {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        const query = url.searchParams.get('query') ?? ''
        const rawStatus = url.searchParams.get('status') ?? 'active'
        if (rawStatus !== 'all' && !MEMOIR_STATUSES.includes(rawStatus as MemoirStatus)) {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        const key = projectKey(path)
        const project = store.project(path)
        const filter = entryFilter(section, query, rawStatus as MemoirStatus | 'all')
        const value = project === undefined
          ? { project: { key, path, title: projectTitle(path), updatedAt: 0, entries: [] } }
          : { project: wireProject(key, project, filter) }
        json(res, OK(value))
        return
      }
      if (pathname === '/api/dsh-memoir/global') {
        const section = url.searchParams.get('section') ?? undefined
        if (section !== undefined && !SECTION_KEYS.includes(section as never)) {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        const query = url.searchParams.get('query') ?? ''
        const rawStatus = url.searchParams.get('status') ?? 'active'
        if (rawStatus !== 'all' && !MEMOIR_STATUSES.includes(rawStatus as MemoirStatus)) {
          json(res, FAIL(BAD_REQUEST), 400)
          return
        }
        const filter = entryFilter(section, query, rawStatus as MemoirStatus | 'all')
        const storeFile = store.load()
        const projects = Object.entries(storeFile.projects)
          .map(([key, project]) => wireProject(key, project, filter))
          .filter((project) => project.entries.length > 0)
          // Newest first; deterministic tiebreak when times collide (same ms).
          .sort((a, b) => b.updatedAt - a.updatedAt || a.path.localeCompare(b.path))
        json(res, OK({ projects }))
        return
      }
      json(res, FAIL(NOT_FOUND), 404)
      return
    }

    // ----------------------------------------------------------- writes
    if (method !== 'POST' && method !== 'DELETE' && method !== 'PATCH' && method !== 'PUT') {
      json(res, FAIL(METHOD), 405)
      return
    }
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      json(res, FAIL(CONTENT_TYPE), 415)
      return
    }
    const payload = await readJsonBody(req)
    if (payload === null) {
      json(res, FAIL(BAD_REQUEST), 400)
      return
    }
    if (pathname === '/api/dsh-memoir/settings') {
      if (settings === undefined) {
        json(res, FAIL(NOT_FOUND), 404)
        return
      }
      if (method === 'PUT') {
        const validation = validateMemoirSettingsPatch(payload, settings.get().settings)
        if (validation !== undefined) {
          json(res, FAIL({ code: 'bad-request', message: validation }), 400)
          return
        }
        json(res, OK(settings.update(payload as MemoirSettingsPatch)))
        return
      }
      if (method === 'DELETE') {
        json(res, OK(settings.reset()))
        return
      }
      json(res, FAIL(METHOD), 405)
      return
    }
    if (pathname !== '/api/dsh-memoir/entries') {
      json(res, FAIL(NOT_FOUND), 404)
      return
    }
    if (method === 'PUT') {
      json(res, FAIL(METHOD), 405)
      return
    }
    const path = strField(payload, 'path')
    if (path === null || !validPath(path)) {
      json(res, FAIL({ code: 'bad-request', message: copy.absolutePath }), 400)
      return
    }
    // v0.4.2 workspace authorization: a browser-submitted absolute path is
    // not authorization — writes are limited to the active workspace(s) or
    // projects already in the store.
    if (allowedWorkspace !== undefined && !allowedWorkspace(path)) {
      json(res, FAIL({ code: 'forbidden', message: copy.forbiddenPath }), 403)
      return
    }

    if (method === 'POST') {
      const section = strField(payload, 'section')
      const content = strField(payload, 'content')
      if (section === null || content === null) {
        json(res, FAIL(BAD_REQUEST), 400)
        return
      }
      if (!Object.prototype.hasOwnProperty.call(SECTIONS, section)) {
        json(res, FAIL({ code: 'bad-request', message: copy.section(SECTION_KEYS.join('/')) }), 400)
        return
      }
      const title = strField(payload, 'title', true) ?? undefined
      const record = payload as Record<string, unknown>
      const resolution = record.resolution
      if (resolution !== undefined && resolution !== 'update' && resolution !== 'supersede' && resolution !== 'force-record') {
        json(res, FAIL({ code: 'bad-request', message: copy.resolution }), 400)
        return
      }
      const targetId = strField(payload, 'targetId', true) ?? undefined
      const recordPayload = {
        section: section as never,
        title,
        content,
        importance: (payload as Record<string, unknown>).importance,
        pinned: (payload as Record<string, unknown>).pinned,
        supersedes: (payload as Record<string, unknown>).supersedes,
        tags: (payload as Record<string, unknown>).tags,
      }
      const validation = validateEntryPayload(recordPayload, language)
      if (validation !== undefined) {
        json(res, FAIL({ code: 'bad-request', message: validation }), 400)
        return
      }
      let result
      try {
        result = retrieval === undefined
          ? { action: 'recorded' as const, recorded: true, entry: store.record(path, recordPayload as EntryPayload), candidates: [] }
          : governedRecord(store, retrieval, path, recordPayload as EntryPayload, {
              ...(resolution !== undefined ? { resolution: resolution as RecordResolution } : {}),
              ...(targetId !== undefined ? { targetId } : {}),
              language,
            })
      } catch (error) {
        const message = error instanceof Error ? error.message : copy.invalidResolution
        json(res, FAIL({ code: 'bad-request', message }), 400)
        return
      }
      json(res, OK(result))
      return
    }

    // PATCH entry content and lifecycle metadata
    if (method === 'PATCH') {
      const record = payload as Record<string, unknown>
      const id = strField(payload, 'id')
      if (id === null) {
        json(res, FAIL(BAD_REQUEST), 400)
        return
      }
      const patch: Record<string, unknown> = {}
      for (const field of ['section', 'title', 'content', 'importance', 'pinned', 'status', 'supersedes', 'tags']) {
        if (Object.prototype.hasOwnProperty.call(record, field)) patch[field] = record[field]
      }
      const validation = validateEntryUpdate(patch, language)
      if (validation !== undefined) {
        json(res, FAIL({ code: 'bad-request', message: validation }), 400)
        return
      }
      const entry = store.update(path, id, patch as EntryUpdate)
      json(res, OK({ entry: entry ?? null, updated: entry !== undefined }))
      return
    }

    // DELETE
    const id = strField(payload, 'id')
    if (id === null) {
      json(res, FAIL(BAD_REQUEST), 400)
      return
    }
    const removed = store.remove(path, id)
    json(res, OK({ removed }))
  }

  return [{ kind: 'prefix', path: '/api/dsh-memoir', handler }]
}
