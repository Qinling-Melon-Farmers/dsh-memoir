import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { MemoirSettingsStore, SETTINGS_VERSION, resolveMemoirSettings, validateMemoirSettingsPatch } from '../lib/settings.js'
import { makeTempStorePath } from './helpers.ts'

const defaults = {
  announceToAgent: true,
  autoDistill: true,
  autoDistillEvery: 1,
  autoDistillCooldownMin: 0,
  autoDistillMinTools: 1,
  hotMemoryTokens: 900,
  hotMemoryMaxTokens: 1200,
  readDefaultLimit: 8,
  readMaxLimit: 30,
  sessionSnapshotMax: 128,
  queryCacheSize: 128,
}

test('MemoirSettingsStore persists complete Web overrides and resets to startup defaults', () => {
  const path = makeTempStorePath()
  try {
    const store = new MemoirSettingsStore(defaults, path)
    assert.deepEqual(store.get(), { settings: defaults, source: 'profile' })

    let notifications = 0
    const unsubscribe = store.subscribe(() => { notifications += 1 })
    const saved = store.update({
      announceToAgent: false,
      autoDistill: false,
      autoDistillEvery: 3,
      autoDistillCooldownMin: 2.5,
      autoDistillMinTools: 4,
      hotMemoryTokens: 600,
      hotMemoryMaxTokens: 800,
      readDefaultLimit: 5,
      readMaxLimit: 20,
      sessionSnapshotMax: 64,
      queryCacheSize: 32,
    })
    assert.equal(saved.source, 'web')
    assert.equal(saved.settings.announceToAgent, false)
    assert.equal(saved.settings.hotMemoryMaxTokens, 800)
    assert.equal(saved.settings.queryCacheSize, 32)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).version, SETTINGS_VERSION)
    assert.equal(notifications, 1)

    const resaved = store.update({ autoDistillCooldownMin: 7 })
    assert.equal(resaved.settings.autoDistillCooldownMin, 7, 'an existing settings file is replaced atomically')

    const reloaded = new MemoirSettingsStore(defaults, path)
    assert.deepEqual(reloaded.get(), resaved)
    assert.deepEqual(reloaded.reset(), { settings: defaults, source: 'profile' })
    assert.equal(existsSync(path), false)
    unsubscribe()
  } finally {
    rmSync(path, { force: true })
  }
})

test('settings validation rejects invalid numbers and unknown fields', () => {
  assert.equal(validateMemoirSettingsPatch({ autoDistillEvery: 0 }), 'autoDistillEvery must be an integer greater than or equal to 1')
  assert.equal(validateMemoirSettingsPatch({ autoDistillCooldownMin: -1 }), 'autoDistillCooldownMin must be a finite number greater than or equal to 0')
  assert.equal(validateMemoirSettingsPatch({ autoDistillMinTools: 1.5 }), 'autoDistillMinTools must be an integer greater than or equal to 1')
  assert.equal(validateMemoirSettingsPatch({ extra: true }), 'unknown setting: extra')
  assert.equal(validateMemoirSettingsPatch({ announceToAgent: false }), undefined)
  assert.equal(validateMemoirSettingsPatch({ hotMemoryTokens: 1300 }, defaults), 'hotMemoryMaxTokens must be greater than or equal to hotMemoryTokens')
  assert.equal(validateMemoirSettingsPatch({ readDefaultLimit: 31 }, defaults), 'readMaxLimit must be greater than or equal to readDefaultLimit')
  assert.throws(() => new MemoirSettingsStore(defaults, makeTempStorePath()).update({ autoDistillEvery: 0 }), TypeError)
})

test('settings resolution and startup tolerate malformed optional files', () => {
  assert.deepEqual(resolveMemoirSettings({ autoDistill: false, autoDistillEvery: 2, autoDistillCooldownMin: Number.NaN }, defaults), {
    ...defaults,
    autoDistill: false,
    autoDistillEvery: 2,
  })
  const path = makeTempStorePath()
  try {
    writeFileSync(path, '{broken', 'utf8')
    const store = new MemoirSettingsStore(defaults, path)
    assert.deepEqual(store.get(), { settings: defaults, source: 'profile' })
    assert.equal(readFileSync(path, 'utf8'), '{broken', 'malformed optional settings remain untouched')
  } finally {
    rmSync(path, { force: true })
  }
})

test('v0.5.3 settings version 1 loads lazily and gains v0.5.4 defaults', () => {
  const path = makeTempStorePath()
  try {
    writeFileSync(path, JSON.stringify({
      version: 1,
      autoDistill: false,
      autoDistillEvery: 4,
      autoDistillCooldownMin: 2,
      autoDistillMinTools: 3,
    }), 'utf8')
    const store = new MemoirSettingsStore(defaults, path)
    assert.equal(store.get().source, 'web')
    assert.equal(store.get().settings.autoDistillEvery, 4)
    assert.equal(store.get().settings.hotMemoryTokens, defaults.hotMemoryTokens)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).version, 1, 'startup does not rewrite legacy settings')
    store.update({ queryCacheSize: 16 })
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).version, SETTINGS_VERSION)
  } finally {
    rmSync(path, { force: true })
  }
})
