/**
 * Shared test helpers: temp dirs, mock HTTP req/res, and a mock agent exec
 * carrying a session cwd (the shape the tools read via exec.agent).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface TempWorkspace {
  dir: string
  cwd: string
  cleanup: () => void
}

/** Create one fresh temp workspace dir; returns { dir, cwd, cleanup }. */
export function makeTempWorkspace(): TempWorkspace {
  const dir = mkdtempSync(join(tmpdir(), 'memoir-test-'))
  return {
    dir,
    cwd: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/** Make one fresh temp store path (non-existent yet). */
export function makeTempStorePath(): string {
  return join(tmpdir(), `memoir-store-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
}

/** A tool exec object with a session cwd, source session, and matching turn. */
export function makeExec(cwd: string, sessionId = 'session-test', turnId = 1): ToolRunContext {
  const callId = 'call-test-' + turnId
  return {
    callId,
    rootCallId: callId,
    agent: {
      id: sessionId,
      session: {
        header: { cwd },
        events: [{ type: 'tool/call', data: { turn: turnId, callId, name: 'memoir_record' } }],
      },
    },
  } as unknown as ToolRunContext
}

export interface ReqOptions {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
}

/** A minimal IncomingMessage-like request (async-iterable body). */
export function makeReq(options: ReqOptions = {}): IncomingMessage {
  const chunks: Buffer[] = options.body === undefined ? [] : [Buffer.from(options.body)]
  const req = {
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    headers: options.headers ?? {},
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        next: () => (index < chunks.length ? { value: chunks[index++], done: false } : { done: true }),
      }
    },
  }
  return req as unknown as IncomingMessage
}

/** A minimal ServerResponse-like collector. */
export function makeRes(): ServerResponse {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(status: number, headers?: Record<string, string>) {
      res.statusCode = status
      Object.assign(res.headers, headers ?? {})
    },
    end(chunk?: string) {
      res.body = typeof chunk === 'string' ? chunk : ''
    },
  }
  return res as unknown as ServerResponse
}

export interface RouteResult {
  status: number
  envelope: { ok: boolean; value?: unknown; error?: { code?: string; message?: string } }
  headers: Record<string, string>
}

/** Run one route handler against a mock request; returns { status, envelope }. */
export async function callRoute(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void, options: ReqOptions = {}): Promise<RouteResult> {
  const req = makeReq(options)
  const res = makeRes()
  await handler(req, res)
  let envelope: RouteResult['envelope'] = { ok: false, error: { code: 'internal', message: 'no body' } }
  try {
    envelope = JSON.parse((res as unknown as { body: string }).body) as RouteResult['envelope']
  } catch {
    // keep the fallback envelope
  }
  return { status: (res as unknown as { statusCode: number }).statusCode, envelope, headers: (res as unknown as { headers: Record<string, string> }).headers }
}
