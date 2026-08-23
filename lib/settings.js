/**
 * Persistent Web-panel overrides for live dsh-memoir configuration.
 *
 * cordis.patch.yml remains the source of startup defaults. Once the user
 * saves either GUI settings surface, the normalized override is stored in
 * ~/.dsh/dsh-memoir.settings.json and applied without a profile restart.
 * Resetting removes the override and restores the startup defaults captured
 * when the plugin mounted.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from './store.js';
export const SETTINGS_VERSION = 2;
const LEGACY_SETTINGS_VERSION = 1;
/** Built-in fallback values; profile values override these at construction. */
export const DEFAULT_MEMOIR_SETTINGS = {
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
};
const BOOLEAN_FIELDS = ['announceToAgent', 'autoDistill'];
const INTEGER_FIELDS = [
    'autoDistillEvery',
    'autoDistillMinTools',
    'hotMemoryTokens',
    'hotMemoryMaxTokens',
    'readDefaultLimit',
    'readMaxLimit',
    'sessionSnapshotMax',
    'queryCacheSize',
];
const ALLOWED_FIELDS = [...BOOLEAN_FIELDS, ...INTEGER_FIELDS, 'autoDistillCooldownMin'];
/** Default settings location: <home>/.dsh/dsh-memoir.settings.json. */
export function defaultSettingsPath() {
    return join(homedir(), '.dsh', 'dsh-memoir.settings.json');
}
function objectRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : {};
}
/** Normalize an untrusted partial value against known-good defaults. */
export function resolveMemoirSettings(value, defaults) {
    const record = objectRecord(value);
    const integer = (key) => Number.isSafeInteger(record[key]) && record[key] >= 1
        ? record[key]
        : defaults[key];
    const cooldown = typeof record.autoDistillCooldownMin === 'number'
        && Number.isFinite(record.autoDistillCooldownMin)
        && record.autoDistillCooldownMin >= 0
        ? record.autoDistillCooldownMin
        : defaults.autoDistillCooldownMin;
    const target = integer('hotMemoryTokens');
    const readDefault = integer('readDefaultLimit');
    return {
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
    };
}
/** Strict validation for the panel API. Returns an error message when invalid. */
export function validateMemoirSettingsPatch(payload, base = DEFAULT_MEMOIR_SETTINGS) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
        return 'settings must be an object';
    const record = payload;
    const keys = Object.keys(record);
    if (keys.length === 0)
        return 'at least one setting is required';
    const unknown = keys.find((key) => !ALLOWED_FIELDS.includes(key));
    if (unknown !== undefined)
        return `unknown setting: ${unknown}`;
    for (const key of BOOLEAN_FIELDS) {
        if (key in record && typeof record[key] !== 'boolean')
            return `${key} must be a boolean`;
    }
    for (const key of INTEGER_FIELDS) {
        if (key in record && (!Number.isSafeInteger(record[key]) || record[key] < 1)) {
            return `${key} must be an integer greater than or equal to 1`;
        }
    }
    if ('autoDistillCooldownMin' in record && (typeof record.autoDistillCooldownMin !== 'number'
        || !Number.isFinite(record.autoDistillCooldownMin)
        || record.autoDistillCooldownMin < 0)) {
        return 'autoDistillCooldownMin must be a finite number greater than or equal to 0';
    }
    const merged = { ...base, ...record };
    if (merged.hotMemoryMaxTokens < merged.hotMemoryTokens) {
        return 'hotMemoryMaxTokens must be greater than or equal to hotMemoryTokens';
    }
    if (merged.readMaxLimit < merged.readDefaultLimit) {
        return 'readMaxLimit must be greater than or equal to readDefaultLimit';
    }
    return undefined;
}
/** v0.5.3 compatibility aliases for callers that imported the old names. */
export const resolveAutoDistillSettings = resolveMemoirSettings;
export const validateAutoDistillSettingsPatch = validateMemoirSettingsPatch;
/** In-process live settings state with an atomic JSON persistence boundary. */
export class MemoirSettingsStore {
    path;
    defaults;
    value;
    persisted = false;
    listeners = new Set();
    constructor(defaults, path = defaultSettingsPath()) {
        this.path = path;
        this.defaults = resolveMemoirSettings(defaults, DEFAULT_MEMOIR_SETTINGS);
        this.value = { ...this.defaults };
        this.load();
    }
    get() {
        return {
            settings: { ...this.value },
            source: this.persisted ? 'web' : 'profile',
        };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    update(patch) {
        const validation = validateMemoirSettingsPatch(patch, this.value);
        if (validation !== undefined)
            throw new TypeError(validation);
        const next = resolveMemoirSettings({ ...this.value, ...patch }, this.defaults);
        this.save(next);
        this.value = next;
        this.persisted = true;
        return this.emit();
    }
    reset() {
        if (existsSync(this.path))
            unlinkSync(this.path);
        this.value = { ...this.defaults };
        this.persisted = false;
        return this.emit();
    }
    emit() {
        const snapshot = this.get();
        for (const listener of [...this.listeners])
            listener(snapshot);
        return snapshot;
    }
    load() {
        if (!existsSync(this.path))
            return;
        try {
            const parsed = JSON.parse(readFileSync(this.path, 'utf8'));
            if (parsed.version !== SETTINGS_VERSION && parsed.version !== LEGACY_SETTINGS_VERSION)
                return;
            const candidate = parsed.version === LEGACY_SETTINGS_VERSION
                ? {
                    autoDistill: parsed.autoDistill,
                    autoDistillEvery: parsed.autoDistillEvery,
                    autoDistillCooldownMin: parsed.autoDistillCooldownMin,
                    autoDistillMinTools: parsed.autoDistillMinTools,
                }
                : Object.fromEntries(ALLOWED_FIELDS.map((key) => [key, parsed[key]]));
            if (validateMemoirSettingsPatch(candidate, this.defaults) !== undefined)
                return;
            this.value = resolveMemoirSettings(candidate, this.defaults);
            this.persisted = true;
        }
        catch {
            // A malformed optional settings file must not prevent DSH from booting.
            // It remains untouched until the user explicitly saves or resets it.
        }
    }
    save(value) {
        const file = { version: SETTINGS_VERSION, ...value };
        writeFileAtomic(this.path, JSON.stringify(file, null, 2) + '\n');
    }
}
/** v0.5.3 compatibility export. */
export { MemoirSettingsStore as AutoDistillSettingsStore };
