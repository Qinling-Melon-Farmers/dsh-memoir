/**
 * Browser API client for the host /api/dsh-memoir routes. The only data path
 * the panel uses — same-origin fetch, JSON envelope { ok, value | error }.
 * The fetch implementation is injectable for tests.
 */

import type { MemoirStatus, SectionKey } from './types.ts'

/** Error carrying the route's JSON error message. */
export class MemoirApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MemoirApiError'
  }
}

interface EnvelopeResponse {
  status: number
  ok: boolean
  json(): Promise<unknown>
}

/** Parse the envelope or throw a MemoirApiError (transport or route error). */
export async function readEnvelope(response: EnvelopeResponse): Promise<unknown> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new MemoirApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  if (typeof body !== 'object' || body === null || (body as { ok?: boolean }).ok !== true) {
    const record = body as { error?: { message?: string } } | null
    const message = record && typeof record.error === 'object' && record.error !== null && typeof record.error.message === 'string'
      ? record.error.message
      : `HTTP ${response.status}`
    throw new MemoirApiError(message)
  }
  return (body as { value: unknown }).value
}

/** Query-string helper (omits undefined/empty values). */
export function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : '?' + text
}

/** One memory entry as the panel sees it over the wire. */
export interface WireEntry {
  id: string
  section: SectionKey
  title?: string
  content: string
  time: number
  source?: { sessionId?: string; turnId?: number }
  /** Legacy v3 wire alias; prefer source.sessionId. */
  sessionId?: string
  importance?: number
  pinned?: boolean
  status?: MemoirStatus
  supersedes?: string[]
  tags?: string[]
}

export interface WireProject {
  key: string
  path: string
  title: string
  updatedAt: number
  entries: WireEntry[]
  /** Lifecycle totals before any route-level status/section filter. */
  stats?: { total: number; active: number; superseded: number; archived: number }
}

/** The host /diagnostics payload (v0.4 observability, v0.4.2 extended). */
export interface WireDiagnostics {
  storeRevision: number
  snapshotEpoch: number
  cache: {
    revision: number
    epoch: number
    loads: number
    hits: number
    misses: number
    hitRate: number
    fileReads: number
    statProbes: number
    corruptBackups: number
    renders: number
    renderComputes: number
    renderHitRate: number
    lastLoadMs?: number
  }
  snapshotCount: number
  snapshotMax: number
  hotMemory: { selected: number; total: number; estimatedTokens: number } | null
  /** v0.4.2: retrieval index / query cache / last query. */
  retrieval: {
    index: { docs: number; terms: number; epoch: number } | null
    cache: { hits: number; misses: number; evictions: number; hitRate: number; size: number; capacity: number }
    lastQuery: { query: string; latencyMs: number; candidates: number; returned: number; at: number } | null
  }
  /** v0.4.2: the most recently frozen session snapshot. */
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

/** Full live runtime settings managed by both GUI settings surfaces. */
export interface WireMemoirSettings {
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

export interface WireMemoirSettingsSnapshot {
  settings: WireMemoirSettings
  source: 'profile' | 'web'
}

/** v0.5.3 source compatibility aliases. */
export type WireAutoDistillSettings = WireMemoirSettings
export type WireAutoDistillSettingsSnapshot = WireMemoirSettingsSnapshot

/** One ranked /search hit (v0.4.2: shared RetrievalEngine order). */
export interface WireSearchResult {
  projectPath: string
  entry: WireEntry
  score: number
}

export type WireRecordResolution = 'update' | 'supersede' | 'force-record'
export type WireRecordAction = 'recorded' | 'needs-resolution' | 'updated' | 'superseded' | 'force-recorded'

export interface WireSimilarityCandidate {
  kind: 'duplicate' | 'conflict'
  score: number
  components: { bm25: number; title: number; tokenJaccard: number }
  reasons: string[]
  entry: WireEntry
  projectPath: string
}

export interface WireRecordResult {
  action: WireRecordAction
  recorded: boolean
  entry?: WireEntry
  candidates: WireSimilarityCandidate[]
}

/** The /hot-memory inspector payload (v0.4.2). */
export interface WireHotMemory {
  text: string
  selected: WireEntry[]
  total: number
  estimatedTokens: number
}

export interface RecordPayload {
  path: string
  section: SectionKey
  title?: string
  content: string
  importance?: number
  pinned?: boolean
  supersedes?: string[]
  tags?: string[]
  resolution?: WireRecordResolution
  targetId?: string
}

type FetchLike = (input: string, init?: RequestInit) => Promise<EnvelopeResponse>

/** The browser half's only data entry point. */
export class MemoirApi {
  private readonly fetchImpl: FetchLike

  /**
   * @param fetchImpl - injectable fetch (defaults to globalThis.fetch).
   */
  constructor(fetchImpl?: FetchLike) {
    this.fetchImpl = fetchImpl ?? ((...args) => globalThis.fetch(...args) as Promise<EnvelopeResponse>)
  }

  /** Read one project's memory (empty project shape when unknown). */
  async project(path: string, options: { section?: SectionKey; query?: string; status?: MemoirStatus | 'all' } = {}): Promise<{ project: WireProject }> {
    const response = await this.fetchImpl('/api/dsh-memoir/project' + query({ path, ...options }))
    return readEnvelope(response) as Promise<{ project: WireProject }>
  }

  /** Read the cross-project global index. */
  async global(options: { section?: SectionKey; query?: string; status?: MemoirStatus | 'all' } = {}): Promise<{ projects: WireProject[] }> {
    const response = await this.fetchImpl('/api/dsh-memoir/global' + query({ ...options }))
    return readEnvelope(response) as Promise<{ projects: WireProject[] }>
  }

  /** Read runtime diagnostics (cache hit rates, snapshot/hot-memory stats). */
  async diagnostics(path?: string): Promise<WireDiagnostics> {
    const response = await this.fetchImpl('/api/dsh-memoir/diagnostics' + query({ path }))
    return readEnvelope(response) as Promise<WireDiagnostics>
  }

  /** Read all live settings and whether they come from Web overrides. */
  async settings(): Promise<WireMemoirSettingsSnapshot> {
    const response = await this.fetchImpl('/api/dsh-memoir/settings')
    return readEnvelope(response) as Promise<WireMemoirSettingsSnapshot>
  }

  /** Persist and immediately apply the complete runtime policy. */
  async updateSettings(settings: WireMemoirSettings): Promise<WireMemoirSettingsSnapshot> {
    const response = await this.fetchImpl('/api/dsh-memoir/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settings),
    })
    return readEnvelope(response) as Promise<WireMemoirSettingsSnapshot>
  }

  /** Remove the Web override and restore the profile defaults captured at boot. */
  async resetSettings(): Promise<WireMemoirSettingsSnapshot> {
    const response = await this.fetchImpl('/api/dsh-memoir/settings', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    return readEnvelope(response) as Promise<WireMemoirSettingsSnapshot>
  }

  /**
   * Ranked search over the host RetrievalEngine (v0.4.2) — the same ranking
   * memoir_read uses, so the GUI search and the agent recall never diverge.
   */
  async search(options: { scope: 'project' | 'global' | 'all'; path?: string; section?: SectionKey; query: string; limit?: number; status?: MemoirStatus | 'all' }): Promise<{ results: WireSearchResult[] }> {
    const response = await this.fetchImpl('/api/dsh-memoir/search' + query({
      scope: options.scope,
      path: options.path,
      section: options.section,
      query: options.query,
      limit: options.limit === undefined ? undefined : String(options.limit),
      status: options.status,
    }))
    return readEnvelope(response) as Promise<{ results: WireSearchResult[] }>
  }

  /** Hot-memory preview for one workspace (the inspector). */
  async hotMemory(path: string): Promise<{ hotMemory: WireHotMemory | null }> {
    const response = await this.fetchImpl('/api/dsh-memoir/hot-memory' + query({ path }))
    return readEnvelope(response) as Promise<{ hotMemory: WireHotMemory | null }>
  }

  /** Record one entry (host regenerates PROJECT_MEMORY.md). */
  async record(payload: RecordPayload): Promise<WireRecordResult> {
    const response = await this.fetchImpl('/api/dsh-memoir/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return readEnvelope(response) as Promise<WireRecordResult>
  }

  /** Delete one entry by id. */
  async remove(payload: { path: string; id: string }): Promise<{ removed: boolean }> {
    const response = await this.fetchImpl('/api/dsh-memoir/entries', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return readEnvelope(response) as Promise<{ removed: boolean }>
  }

  /** Update entry content or lifecycle metadata without deleting. */
  async update(payload: { path: string; id: string; section?: SectionKey; title?: string | null; content?: string; importance?: number; pinned?: boolean; status?: MemoirStatus; supersedes?: string[]; tags?: string[] }): Promise<{ entry: WireEntry | null; updated: boolean }> {
    const response = await this.fetchImpl('/api/dsh-memoir/entries', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return readEnvelope(response) as Promise<{ entry: WireEntry | null; updated: boolean }>
  }
}
