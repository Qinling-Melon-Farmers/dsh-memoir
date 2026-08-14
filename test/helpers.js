/**
 * Shared test helpers: temp dirs, mock HTTP req/res, and a mock agent exec
 * carrying a session cwd (the shape the tools read via exec.agent).
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Create one fresh temp workspace dir; returns { dir, cwd, cleanup }. */
export function makeTempWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'memoir-test-'))
  return {
    dir,
    cwd: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/** Make one fresh temp store path (non-existent yet). */
export function makeTempStorePath() {
  return join(tmpdir(), `memoir-store-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
}

/** A tool exec object with a session cwd (plus optional session id). */
export function makeExec(cwd, sessionId = 'session-test') {
  return { agent: { id: sessionId, session: { header: { cwd } } } }
}

/** A minimal IncomingMessage-like request (async-iterable body). */
export function makeReq({ method = 'GET', url = '/', headers = {}, body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(body)]
  const req = {
    method,
    url,
    headers,
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        next: () => (index < chunks.length ? { value: chunks[index++], done: false } : { done: true }),
      }
    },
  }
  return req
}

/** A minimal ServerResponse-like collector. */
export function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(status, headers) {
      res.statusCode = status
      Object.assign(res.headers, headers ?? {})
    },
    end(chunk) {
      res.body = typeof chunk === 'string' ? chunk : ''
    },
  }
  return res
}

/** Run one route handler against a mock request; returns { status, envelope }. */
export async function callRoute(handler, options) {
  const req = makeReq(options)
  const res = makeRes()
  await handler(req, res)
  let envelope = { ok: false, error: { code: 'internal', message: 'no body' } }
  try {
    envelope = JSON.parse(res.body)
  } catch {
    // keep the fallback envelope
  }
  return { status: res.statusCode, envelope, headers: res.headers }
}
