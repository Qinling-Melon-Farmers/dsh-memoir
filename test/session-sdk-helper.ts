/** Public npm entrypoints only: pre-rc2 constructor and rc2 apply plugin. */
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'

export function sessionSdk(dshPackage?: string) {
  const require = createRequire(dshPackage ? join(dshPackage, 'package.json') : import.meta.url)
  const load = (name: string): Promise<Record<string, any>> => import(pathToFileURL(require.resolve(name)).href)
  return { require, load }
}

export async function mountJsonlPersistence(
  ctx: Context,
  config: { root: string; compression: 'none' | 'zstd' },
  load = sessionSdk().load,
): Promise<SessionPersistence> {
  const module = await load('@deepseek-ai/dsh-session-persistence-jsonl')
  if (typeof module.apply === 'function') {
    await module.apply(ctx, config)
    assert.ok(ctx.sessionPersistence, 'the public apply plugin must publish the persistence service')
    return ctx.sessionPersistence
  }
  assert.equal(typeof module.default, 'function', 'older SDKs must export the documented constructor')
  return new module.default(ctx, config)
}

/** Locate the single real writer artifact in a test-owned root, without private methods. */
export async function onlySessionLog(root: string, compression: 'none' | 'zstd') {
  const filename = `session.v4.jsonl${compression === 'zstd' ? '.zstd' : ''}`
  const matches = (await fs.readdir(root, { recursive: true })).filter(name => basename(name) === filename)
  assert.equal(matches.length, 1, 'fixture must contain exactly one current-generation log')
  return join(root, matches[0]!)
}
