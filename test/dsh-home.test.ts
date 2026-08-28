import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAbsolute, join, resolve } from 'node:path'
import { resolveDshHome } from '../lib/dsh-home.js'

test('resolveDshHome preserves the historical fallback when DSH_HOME is absent or blank', () => {
  const fallback = join(process.cwd(), 'synthetic-home')
  assert.equal(resolveDshHome({}, fallback), join(fallback, '.dsh'))
  assert.equal(resolveDshHome({ DSH_HOME: '   ' }, fallback), join(fallback, '.dsh'))
})

test('resolveDshHome honors absolute and relative isolated homes', () => {
  const absolute = resolve(process.cwd(), 'isolated-dsh-home')
  assert.ok(isAbsolute(absolute))
  assert.equal(resolveDshHome({ DSH_HOME: absolute }), absolute)
  assert.equal(resolveDshHome({ DSH_HOME: 'relative-dsh-home' }), resolve('relative-dsh-home'))
})
