/**
 * Browser API client for the host /api/dsh-memoir routes. The only data path
 * the panel uses — same-origin fetch, JSON envelope { ok, value | error }.
 * The fetch implementation is injectable for tests.
 */

/** Error carrying the route's JSON error message. */
export class MemoirApiError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MemoirApiError'
  }
}

/** Parse the envelope or throw a MemoirApiError (transport or route error). */
export async function readEnvelope(response) {
  let body
  try {
    body = await response.json()
  } catch {
    throw new MemoirApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  if (typeof body !== 'object' || body === null || body.ok !== true) {
    const message = body && typeof body.error === 'object' && body.error !== null && typeof body.error.message === 'string'
      ? body.error.message
      : `HTTP ${response.status}`
    throw new MemoirApiError(message)
  }
  return body.value
}

/** Query-string helper (omits undefined/empty values). */
export function query(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : '?' + text
}

/** The browser half's only data entry point. */
export class MemoirApi {
  /**
   * @param fetchImpl - injectable fetch (defaults to globalThis.fetch).
   */
  constructor(fetchImpl) {
    this.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args))
  }

  /** Read one project's memory (empty project shape when unknown). */
  async project(path, options = {}) {
    const response = await this.fetch('/api/dsh-memoir/project' + query({ path, ...options }))
    return readEnvelope(response)
  }

  /** Read the cross-project global index. */
  async global(options = {}) {
    const response = await this.fetch('/api/dsh-memoir/global' + query({ ...options }))
    return readEnvelope(response)
  }

  /** Record one entry (host regenerates PROJECT_MEMORY.md). */
  async record(payload) {
    const response = await this.fetch('/api/dsh-memoir/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return readEnvelope(response)
  }

  /** Delete one entry by id. */
  async remove(payload) {
    const response = await this.fetch('/api/dsh-memoir/entries', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return readEnvelope(response)
  }
}
