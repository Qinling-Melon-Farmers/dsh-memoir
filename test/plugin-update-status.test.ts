import test from 'node:test'
import assert from 'node:assert/strict'
import { PluginUpdateStatus } from '../src/client/plugin-update-status.ts'

test('native version status coalesces requests and uses host compatibility, not a private semver parser', async () => {
  const status = new PluginUpdateStatus('0.9.6')
  let resolve!: (value: any) => void, calls = 0
  status.setManager({ listVersions: async (name: string, options: unknown) => {
    assert.equal(name, 'dsh-memoir'); assert.deepEqual(options, {}); calls++
    return new Promise(r => { resolve = r })
  } } as any)
  const first = status.check(), second = status.check()
  assert.equal(first, second)
  resolve({ ok: true, value: { status: 'listed', installed: '0.9.6', versions: [
    { version: '1.0.0-alpha.1', prerelease: true, bundle: true },
    { version: '0.9.8', bundle: true, incompatible: {} },
    { version: '0.9.7', bundle: true },
  ] } })
  await first
  assert.deepEqual(status.getSnapshot(), { phase: 'available', version: '0.9.7' })
  await status.check(); assert.equal(calls, 1)
  const force = status.check(true)
  resolve({ ok: true, value: { status: 'listed', installed: '0.9.6', versions: [{ version: '0.9.8', bundle: true, incompatible: {} }] } })
  await force
  assert.equal(status.getSnapshot().phase, 'incompatible')
})

test('unload, errors, refusal and changed installations cannot be reported as current', async () => {
  const status = new PluginUpdateStatus('0.9.6')
  let resolve!: (value: any) => void
  status.setManager({ listVersions: () => new Promise(r => { resolve = r }) } as any)
  const stale = status.check()
  status.setManager()
  resolve({ ok: true, value: { status: 'listed', installed: '0.9.6', versions: [] } })
  await stale
  assert.equal(status.getSnapshot().phase, 'unavailable')
  for (const value of [{ ok: false }, { ok: true, value: { status: 'refused' } }, { ok: true, value: { status: 'listed', installed: '0.9.5', versions: [] } }]) {
    status.setManager({ listVersions: async () => value } as any)
    await status.check(); assert.equal(status.getSnapshot().phase, 'unknown')
  }
  status.setManager({ listVersions: async () => { throw Error('offline') } } as any)
  await status.check(); assert.equal(status.getSnapshot().phase, 'unknown')
})

test('older hosts without the public version API leave memory usable and updates unavailable', async () => {
  const status = new PluginUpdateStatus('0.9.6')
  for (const manager of [undefined, {}, { listVersions: undefined }]) {
    status.setManager(manager)
    await status.check(true)
    assert.deepEqual(status.getSnapshot(), { phase: 'unavailable' })
  }
  status.setManager({ listVersions: async () => ({ ok: true, value: { status: 'listed', installed: '0.9.6', versions: [] } }) })
  await status.check()
  assert.equal(status.getSnapshot().phase, 'current')
})
