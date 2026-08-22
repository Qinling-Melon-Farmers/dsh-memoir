/**
 * Persistent Web-panel overrides for automatic distillation.
 *
 * cordis.patch.yml remains the source of startup defaults. Once the user
 * saves this form in the Web panel, the normalized override is stored in
 * ~/.dsh/dsh-memoir.settings.json and can be applied immediately without a
 * profile restart. Resetting removes the override and restores the startup
 * defaults captured when the plugin was mounted.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from './store.js';
export const SETTINGS_VERSION = 1;
/** Default settings location: <home>/.dsh/dsh-memoir.settings.json. */
export function defaultSettingsPath() {
    return join(homedir(), '.dsh', 'dsh-memoir.settings.json');
}
/** Strict validation for the panel API. Returns an error message when invalid. */
export function validateAutoDistillSettingsPatch(payload) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
        return 'settings must be an object';
    const record = payload;
    const allowed = ['autoDistill', 'autoDistillEvery', 'autoDistillCooldownMin', 'autoDistillMinTools'];
    const keys = Object.keys(record);
    if (keys.length === 0)
        return 'at least one setting is required';
    const unknown = keys.find((key) => !allowed.includes(key));
    if (unknown !== undefined)
        return `unknown setting: ${unknown}`;
    if ('autoDistill' in record && typeof record.autoDistill !== 'boolean')
        return 'autoDistill must be a boolean';
    if ('autoDistillEvery' in record && (!Number.isSafeInteger(record.autoDistillEvery) || record.autoDistillEvery < 1)) {
        return 'autoDistillEvery must be an integer greater than or equal to 1';
    }
    if ('autoDistillCooldownMin' in record && (typeof record.autoDistillCooldownMin !== 'number' || !Number.isFinite(record.autoDistillCooldownMin) || record.autoDistillCooldownMin < 0)) {
        return 'autoDistillCooldownMin must be a finite number greater than or equal to 0';
    }
    if ('autoDistillMinTools' in record && (!Number.isSafeInteger(record.autoDistillMinTools) || record.autoDistillMinTools < 1)) {
        return 'autoDistillMinTools must be an integer greater than or equal to 1';
    }
    return undefined;
}
/** Normalize an untrusted partial value against known-good defaults. */
export function resolveAutoDistillSettings(value, defaults) {
    const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
    return {
        autoDistill: typeof record.autoDistill === 'boolean' ? record.autoDistill : defaults.autoDistill,
        autoDistillEvery: Number.isSafeInteger(record.autoDistillEvery) && record.autoDistillEvery >= 1
            ? record.autoDistillEvery
            : defaults.autoDistillEvery,
        autoDistillCooldownMin: typeof record.autoDistillCooldownMin === 'number' && Number.isFinite(record.autoDistillCooldownMin) && record.autoDistillCooldownMin >= 0
            ? record.autoDistillCooldownMin
            : defaults.autoDistillCooldownMin,
        autoDistillMinTools: Number.isSafeInteger(record.autoDistillMinTools) && record.autoDistillMinTools >= 1
            ? record.autoDistillMinTools
            : defaults.autoDistillMinTools,
    };
}
/** In-process settings state with an atomic JSON persistence boundary. */
export class AutoDistillSettingsStore {
    path;
    defaults;
    value;
    persisted = false;
    constructor(defaults, path = defaultSettingsPath()) {
        this.path = path;
        this.defaults = resolveAutoDistillSettings(defaults, defaults);
        this.value = { ...this.defaults };
        this.load();
    }
    get() {
        return {
            settings: { ...this.value },
            source: this.persisted ? 'web' : 'profile',
        };
    }
    update(patch) {
        const validation = validateAutoDistillSettingsPatch(patch);
        if (validation !== undefined)
            throw new TypeError(validation);
        const next = resolveAutoDistillSettings({ ...this.value, ...patch }, this.defaults);
        this.save(next);
        this.value = next;
        this.persisted = true;
        return this.get();
    }
    reset() {
        if (existsSync(this.path))
            unlinkSync(this.path);
        this.value = { ...this.defaults };
        this.persisted = false;
        return this.get();
    }
    load() {
        if (!existsSync(this.path))
            return;
        try {
            const parsed = JSON.parse(readFileSync(this.path, 'utf8'));
            if (parsed.version !== SETTINGS_VERSION)
                return;
            const candidate = {
                autoDistill: parsed.autoDistill,
                autoDistillEvery: parsed.autoDistillEvery,
                autoDistillCooldownMin: parsed.autoDistillCooldownMin,
                autoDistillMinTools: parsed.autoDistillMinTools,
            };
            if (validateAutoDistillSettingsPatch(candidate) !== undefined)
                return;
            this.value = resolveAutoDistillSettings(candidate, this.defaults);
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
