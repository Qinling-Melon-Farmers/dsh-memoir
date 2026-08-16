/**
 * Browser API client for the host /api/dsh-memoir routes. The only data path
 * the panel uses — same-origin fetch, JSON envelope { ok, value | error }.
 * The fetch implementation is injectable for tests.
 */

import type { SectionKey } from './types.ts'

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
  sessionId?: string
}

export interface WireProject {
  key: string
  path: string
  title: string
  updatedAt: number
  entries: WireEntry[]
}

/** The host /diagnostics payload (v0.4 observability). */
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
  config: {
    hotMemoryTokens: number
    hotMemoryMaxTokens: number
    readDefaultLimit: number
    readMaxLimit: number
    sessionSnapshotMax: number
  }
}

export interface RecordPayload {
  path: string
  section: SectionKey
  title?: string
  content: string
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
  async project(path: string, options: { section?: SectionKey; query?: string } = {}): Promise<{ project: WireProject }> {
    const response = await this.fetchImpl('/api/dsh-memoir/project' + query({ path, ...options }))
    return readEnvelope(response) as Promise<{ project: WireProject }>
  }

  /** Read the cross-project global index. */
  async global(options: { section?: SectionKey; query?: string } = {}): Promise<{ projects: WireProject[] }> {
    const response = await this.fetchImpl('/api/dsh-memoir/global' + query({ ...options }))
    return readEnvelope(response) as Promise<{ projects: WireProject[] }>
  }

  /** Read runtime diagnostics (cache hit rates, snapshot/hot-memory stats). */
  async diagnostics(path?: string): Promise<WireDiagnostics> {
    const response = await this.fetchImpl('/api/dsh-memoir/diagnostics' + query({ path }))
    return readEnvelope(response) as Promise<WireDiagnostics>
  }

  /** Record one entry (host regenerates PROJECT_MEMORY.md). */
  async record(payload: RecordPayload): Promise<{ entry: WireEntry }> {
    const response = await this.fetchImpl('/api/dsh-memoir/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return readEnvelope(response) as Promise<{ entry: WireEntry }>
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
}
