import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { AutoDistillSettingsStore, SETTINGS_VERSION, resolveAutoDistillSettings, validateAutoDistillSettingsPatch } from '../lib/settings.js'
import { makeTempStorePath } from './helpers.ts'

const defaults = {
  autoDistill: true,
  autoDistillEvery: 1,
  autoDistillCooldownMin: 0,
  autoDistillMinTools: 1,
}

test('AutoDistillSettingsStore persists Web overrides and resets to startup defaults', () => {
  const path = makeTempStorePath()
  try {
    const store = new AutoDistillSettingsStore(defaults, path)
    assert.deepEqual(store.get(), { settings: defaults, source: 'profile' })

    const saved = store.update({ autoDistill: false, autoDistillEvery: 3, autoDistillCooldownMin: 2.5, autoDistillMinTools: 4 })
    assert.equal(saved.source, 'web')
    assert.deepEqual(saved.settings, { autoDistill: false, autoDistillEvery: 3, autoDistillCooldownMin: 2.5, autoDistillMinTools: 4 })
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).version, SETTINGS_VERSION)

    const resaved = store.update({ autoDistillCooldownMin: 7 })
    assert.equal(resaved.settings.autoDistillCooldownMin, 7, 'an existing settings file is replaced atomically')

    const reloaded = new AutoDistillSettingsStore(defaults, path)
    assert.deepEqual(reloaded.get(), resaved)
    assert.deepEqual(reloaded.reset(), { settings: defaults, source: 'profile' })
    assert.equal(existsSync(path), false)
  } finally {
    rmSync(path, { force: true })
  }
})

test('settings validation rejects invalid numbers and unknown fields', () => {
  assert.equal(validateAutoDistillSettingsPatch({ autoDistillEvery: 0 }), 'autoDistillEvery must be an integer greater than or equal to 1')
  assert.equal(validateAutoDistillSettingsPatch({ autoDistillCooldownMin: -1 }), 'autoDistillCooldownMin must be a finite number greater than or equal to 0')
  assert.equal(validateAutoDistillSettingsPatch({ autoDistillMinTools: 1.5 }), 'autoDistillMinTools must be an integer greater than or equal to 1')
  assert.equal(validateAutoDistillSettingsPatch({ extra: true }), 'unknown setting: extra')
  assert.equal(validateAutoDistillSettingsPatch({ autoDistill: false }), undefined)
  assert.throws(() => new AutoDistillSettingsStore(defaults, makeTempStorePath()).update({ autoDistillEvery: 0 }), TypeError)
})

test('settings resolution and startup tolerate malformed optional files', () => {
  assert.deepEqual(resolveAutoDistillSettings({ autoDistill: false, autoDistillEvery: 2, autoDistillCooldownMin: Number.NaN }, defaults), {
    autoDistill: false,
    autoDistillEvery: 2,
    autoDistillCooldownMin: 0,
    autoDistillMinTools: 1,
  })
  const path = makeTempStorePath()
  try {
    writeFileSync(path, '{broken', 'utf8')
    const store = new AutoDistillSettingsStore(defaults, path)
    assert.deepEqual(store.get(), { settings: defaults, source: 'profile' })
    assert.equal(readFileSync(path, 'utf8'), '{broken', 'malformed optional settings remain untouched')
  } finally {
    rmSync(path, { force: true })
  }
})
