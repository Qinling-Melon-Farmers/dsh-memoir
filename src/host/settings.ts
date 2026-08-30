/**
 * Persistent Web-panel overrides for live dsh-memoir configuration.
 *
 * cordis.patch.yml remains the source of startup defaults. Once the user
 * saves either GUI settings surface, the normalized override is stored in
 * $DSH_HOME/dsh-memoir.settings.json (defaulting to ~/.dsh) and applied
 * without a profile restart.
 * Resetting removes the override and restores the startup defaults captured
 * when the plugin mounted.
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDshHome } from './dsh-home.js'
import { DEFAULT_MEMOIR_LANGUAGE, hostCopy, resolveMemoirLanguage } from './i18n.js'
import type { MemoirLanguage } from './i18n.js'
import { writeFileAtomic } from './store.js'

export const SETTINGS_VERSION = 3
const LEGACY_SETTINGS_VERSIONS = new Set([1, 2])

/** Every setting that v0.5.4 can change live from the GUI. */
export interface MemoirSettings {
  /** Language used in prompts, tool schemas/results, and agent-facing errors. */
  language: MemoirLanguage
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

export type MemoirSettingsPatch = Partial<MemoirSettings>

export interface MemoirSettingsSnapshot {
  settings: MemoirSettings
  source: 'profile' | 'web'
}

interface MemoirSettingsFile extends MemoirSettings {
  version: number
}

/** Backwards-compatible type names retained for the v0.5.3 internal API. */
export type AutoDistillSettings = MemoirSettings
export type AutoDistillSettingsPatch = MemoirSettingsPatch
export type AutoDistillSettingsSnapshot = MemoirSettingsSnapshot

/** Built-in fallback values; profile values override these at construction. */
export const DEFAULT_MEMOIR_SETTINGS: MemoirSettings = {
  language: DEFAULT_MEMOIR_LANGUAGE,
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

const BOOLEAN_FIELDS = ['announceToAgent', 'autoDistill'] as const
const INTEGER_FIELDS = [
  'autoDistillEvery',
  'autoDistillMinTools',
  'hotMemoryTokens',
  'hotMemoryMaxTokens',
  'readDefaultLimit',
  'readMaxLimit',
  'sessionSnapshotMax',
  'queryCacheSize',
] as const
const ALLOWED_FIELDS = ['language', ...BOOLEAN_FIELDS, ...INTEGER_FIELDS, 'autoDistillCooldownMin'] as const

/** Default settings location: $DSH_HOME/dsh-memoir.settings.json (fallback ~/.dsh). */
export function defaultSettingsPath(): string {
  return join(resolveDshHome(), 'dsh-memoir.settings.json')
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/** Normalize an untrusted partial value against known-good defaults. */
export function resolveMemoirSettings(value: unknown, defaults: MemoirSettings): MemoirSettings {
  const record = objectRecord(value)
  const integer = (key: typeof INTEGER_FIELDS[number]): number =>
    Number.isSafeInteger(record[key]) && (record[key] as number) >= 1
      ? record[key] as number
      : defaults[key]
  const cooldown = typeof record.autoDistillCooldownMin === 'number'
    && Number.isFinite(record.autoDistillCooldownMin)
    && record.autoDistillCooldownMin >= 0
    ? record.autoDistillCooldownMin
    : defaults.autoDistillCooldownMin
  const target = integer('hotMemoryTokens')
  const readDefault = integer('readDefaultLimit')
  return {
    language: resolveMemoirLanguage(record.language, defaults.language),
    announceToAgent: typeof record.announceToAgent === 'boolean' ? record.announceToAgent : defaults.announceToAgent,
    autoDistill: typeof record.autoDistill === 'boolean' ? record.autoDistill : defaults.autoDistill,
    autoDistillEvery: integer('autoDistillEvery'),
    autoDistillCooldownMin: cooldown,
    autoDistillMinTools: integer('autoDistillMinTools'),
    hotMemoryTokens: target,
    hotMemoryMaxTokens: Math.max(target, integer('hotMemoryMaxTokens')),
    readDefaultLimit: readDefault,
    readMaxLimit: Math.max(readDefault, integer('readMaxLimit')),
    sessionSnapshotMax: integer('sessionSnapshotMax'),
    queryCacheSize: integer('queryCacheSize'),
  }
}

/** Strict validation for the panel API. Returns an error message when invalid. */
export function validateMemoirSettingsPatch(payload: unknown, base: MemoirSettings = DEFAULT_MEMOIR_SETTINGS): string | undefined {
  const copy = hostCopy(base.language).validation
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return copy.settingsObject
  const record = payload as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0) return copy.settingRequired
  const unknown = keys.find((key) => !ALLOWED_FIELDS.includes(key as never))
  if (unknown !== undefined) return copy.unknownSetting(unknown)
  if ('language' in record && record.language !== 'zh' && record.language !== 'en') return copy.language
  for (const key of BOOLEAN_FIELDS) {
    if (key in record && typeof record[key] !== 'boolean') return copy.booleanSetting(key)
  }
  for (const key of INTEGER_FIELDS) {
    if (key in record && (!Number.isSafeInteger(record[key]) || (record[key] as number) < 1)) {
      return copy.integerSetting(key)
    }
  }
  if ('autoDistillCooldownMin' in record && (
    typeof record.autoDistillCooldownMin !== 'number'
    || !Number.isFinite(record.autoDistillCooldownMin)
    || record.autoDistillCooldownMin < 0
  )) {
    return copy.cooldown
  }
  const merged = { ...base, ...record } as MemoirSettings
  if (merged.hotMemoryMaxTokens < merged.hotMemoryTokens) {
    return copy.hotMax
  }
  if (merged.readMaxLimit < merged.readDefaultLimit) {
    return copy.readMax
  }
  return undefined
}

/** v0.5.3 compatibility aliases for callers that imported the old names. */
export const resolveAutoDistillSettings = resolveMemoirSettings
export const validateAutoDistillSettingsPatch = validateMemoirSettingsPatch

/** In-process live settings state with an atomic JSON persistence boundary. */
export class MemoirSettingsStore {
  private readonly path: string
  private readonly defaults: MemoirSettings
  private value: MemoirSettings
  private persisted = false
  private readonly listeners = new Set<(snapshot: MemoirSettingsSnapshot) => void>()

  constructor(defaults: MemoirSettings, path = defaultSettingsPath()) {
    this.path = path
    this.defaults = resolveMemoirSettings(defaults, DEFAULT_MEMOIR_SETTINGS)
    this.value = { ...this.defaults }
    this.load()
  }

  get(): MemoirSettingsSnapshot {
    return {
      settings: { ...this.value },
      source: this.persisted ? 'web' : 'profile',
    }
  }

  subscribe(listener: (snapshot: MemoirSettingsSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  update(patch: MemoirSettingsPatch): MemoirSettingsSnapshot {
    const validation = validateMemoirSettingsPatch(patch, this.value)
    if (validation !== undefined) throw new TypeError(validation)
    const next = resolveMemoirSettings({ ...this.value, ...patch }, this.defaults)
    this.save(next)
    this.value = next
    this.persisted = true
    return this.emit()
  }

  reset(): MemoirSettingsSnapshot {
    if (existsSync(this.path)) unlinkSync(this.path)
    this.value = { ...this.defaults }
    this.persisted = false
    return this.emit()
  }

  private emit(): MemoirSettingsSnapshot {
    const snapshot = this.get()
    for (const listener of [...this.listeners]) listener(snapshot)
    return snapshot
  }

  private load(): void {
    if (!existsSync(this.path)) return
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, unknown>
      if (parsed.version !== SETTINGS_VERSION && !LEGACY_SETTINGS_VERSIONS.has(parsed.version as number)) return
      const candidate = parsed.version === 1
        ? {
            autoDistill: parsed.autoDistill,
            autoDistillEvery: parsed.autoDistillEvery,
            autoDistillCooldownMin: parsed.autoDistillCooldownMin,
            autoDistillMinTools: parsed.autoDistillMinTools,
          }
        : Object.fromEntries(ALLOWED_FIELDS
            .filter((key) => Object.prototype.hasOwnProperty.call(parsed, key))
            .map((key) => [key, parsed[key]]))
      if (validateMemoirSettingsPatch(candidate, this.defaults) !== undefined) return
      this.value = resolveMemoirSettings(candidate, this.defaults)
      this.persisted = true
    } catch {
      // A malformed optional settings file must not prevent DSH from booting.
      // It remains untouched until the user explicitly saves or resets it.
    }
  }

  private save(value: MemoirSettings): void {
    const file: MemoirSettingsFile = { version: SETTINGS_VERSION, ...value }
    writeFileAtomic(this.path, JSON.stringify(file, null, 2) + '\n')
  }
}

/** v0.5.3 compatibility export. */
export { MemoirSettingsStore as AutoDistillSettingsStore }
