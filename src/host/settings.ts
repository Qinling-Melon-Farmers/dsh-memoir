/**
 * Persistent Web-panel overrides for automatic distillation.
 *
 * cordis.patch.yml remains the source of startup defaults. Once the user
 * saves this form in the Web panel, the normalized override is stored in
 * ~/.dsh/dsh-memoir.settings.json and can be applied immediately without a
 * profile restart. Resetting removes the override and restores the startup
 * defaults captured when the plugin was mounted.
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic } from './store.js'

export const SETTINGS_VERSION = 1

export interface AutoDistillSettings {
  autoDistill: boolean
  autoDistillEvery: number
  autoDistillCooldownMin: number
  autoDistillMinTools: number
}

export type AutoDistillSettingsPatch = Partial<AutoDistillSettings>

export interface AutoDistillSettingsSnapshot {
  settings: AutoDistillSettings
  source: 'profile' | 'web'
}

interface AutoDistillSettingsFile extends AutoDistillSettings {
  version: number
}

/** Default settings location: <home>/.dsh/dsh-memoir.settings.json. */
export function defaultSettingsPath(): string {
  return join(homedir(), '.dsh', 'dsh-memoir.settings.json')
}

/** Strict validation for the panel API. Returns an error message when invalid. */
export function validateAutoDistillSettingsPatch(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return 'settings must be an object'
  const record = payload as Record<string, unknown>
  const allowed = ['autoDistill', 'autoDistillEvery', 'autoDistillCooldownMin', 'autoDistillMinTools']
  const keys = Object.keys(record)
  if (keys.length === 0) return 'at least one setting is required'
  const unknown = keys.find((key) => !allowed.includes(key))
  if (unknown !== undefined) return `unknown setting: ${unknown}`
  if ('autoDistill' in record && typeof record.autoDistill !== 'boolean') return 'autoDistill must be a boolean'
  if ('autoDistillEvery' in record && (!Number.isSafeInteger(record.autoDistillEvery) || (record.autoDistillEvery as number) < 1)) {
    return 'autoDistillEvery must be an integer greater than or equal to 1'
  }
  if ('autoDistillCooldownMin' in record && (typeof record.autoDistillCooldownMin !== 'number' || !Number.isFinite(record.autoDistillCooldownMin) || record.autoDistillCooldownMin < 0)) {
    return 'autoDistillCooldownMin must be a finite number greater than or equal to 0'
  }
  if ('autoDistillMinTools' in record && (!Number.isSafeInteger(record.autoDistillMinTools) || (record.autoDistillMinTools as number) < 1)) {
    return 'autoDistillMinTools must be an integer greater than or equal to 1'
  }
  return undefined
}

/** Normalize an untrusted partial value against known-good defaults. */
export function resolveAutoDistillSettings(value: unknown, defaults: AutoDistillSettings): AutoDistillSettings {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return {
    autoDistill: typeof record.autoDistill === 'boolean' ? record.autoDistill : defaults.autoDistill,
    autoDistillEvery: Number.isSafeInteger(record.autoDistillEvery) && (record.autoDistillEvery as number) >= 1
      ? record.autoDistillEvery as number
      : defaults.autoDistillEvery,
    autoDistillCooldownMin: typeof record.autoDistillCooldownMin === 'number' && Number.isFinite(record.autoDistillCooldownMin) && record.autoDistillCooldownMin >= 0
      ? record.autoDistillCooldownMin
      : defaults.autoDistillCooldownMin,
    autoDistillMinTools: Number.isSafeInteger(record.autoDistillMinTools) && (record.autoDistillMinTools as number) >= 1
      ? record.autoDistillMinTools as number
      : defaults.autoDistillMinTools,
  }
}

/** In-process settings state with an atomic JSON persistence boundary. */
export class AutoDistillSettingsStore {
  private readonly path: string
  private readonly defaults: AutoDistillSettings
  private value: AutoDistillSettings
  private persisted = false

  constructor(defaults: AutoDistillSettings, path = defaultSettingsPath()) {
    this.path = path
    this.defaults = resolveAutoDistillSettings(defaults, defaults)
    this.value = { ...this.defaults }
    this.load()
  }

  get(): AutoDistillSettingsSnapshot {
    return {
      settings: { ...this.value },
      source: this.persisted ? 'web' : 'profile',
    }
  }

  update(patch: AutoDistillSettingsPatch): AutoDistillSettingsSnapshot {
    const validation = validateAutoDistillSettingsPatch(patch)
    if (validation !== undefined) throw new TypeError(validation)
    const next = resolveAutoDistillSettings({ ...this.value, ...patch }, this.defaults)
    this.save(next)
    this.value = next
    this.persisted = true
    return this.get()
  }

  reset(): AutoDistillSettingsSnapshot {
    if (existsSync(this.path)) unlinkSync(this.path)
    this.value = { ...this.defaults }
    this.persisted = false
    return this.get()
  }

  private load(): void {
    if (!existsSync(this.path)) return
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, unknown>
      if (parsed.version !== SETTINGS_VERSION) return
      const candidate = {
        autoDistill: parsed.autoDistill,
        autoDistillEvery: parsed.autoDistillEvery,
        autoDistillCooldownMin: parsed.autoDistillCooldownMin,
        autoDistillMinTools: parsed.autoDistillMinTools,
      }
      if (validateAutoDistillSettingsPatch(candidate) !== undefined) return
      this.value = resolveAutoDistillSettings(candidate, this.defaults)
      this.persisted = true
    } catch {
      // A malformed optional settings file must not prevent DSH from booting.
      // It remains untouched until the user explicitly saves or resets it.
    }
  }

  private save(value: AutoDistillSettings): void {
    const file: AutoDistillSettingsFile = { version: SETTINGS_VERSION, ...value }
    writeFileAtomic(this.path, JSON.stringify(file, null, 2) + '\n')
  }
}
