/**
 * Persistent Web-panel overrides for automatic distillation.
 *
 * cordis.patch.yml remains the source of startup defaults. Once the user
 * saves this form in the Web panel, the normalized override is stored in
 * ~/.dsh/dsh-memoir.settings.json and can be applied immediately without a
 * profile restart. Resetting removes the override and restores the startup
 * defaults captured when the plugin was mounted.
 */
export declare const SETTINGS_VERSION = 1;
export interface AutoDistillSettings {
    autoDistill: boolean;
    autoDistillEvery: number;
    autoDistillCooldownMin: number;
    autoDistillMinTools: number;
}
export type AutoDistillSettingsPatch = Partial<AutoDistillSettings>;
export interface AutoDistillSettingsSnapshot {
    settings: AutoDistillSettings;
    source: 'profile' | 'web';
}
/** Default settings location: <home>/.dsh/dsh-memoir.settings.json. */
export declare function defaultSettingsPath(): string;
/** Strict validation for the panel API. Returns an error message when invalid. */
export declare function validateAutoDistillSettingsPatch(payload: unknown): string | undefined;
/** Normalize an untrusted partial value against known-good defaults. */
export declare function resolveAutoDistillSettings(value: unknown, defaults: AutoDistillSettings): AutoDistillSettings;
/** In-process settings state with an atomic JSON persistence boundary. */
export declare class AutoDistillSettingsStore {
    private readonly path;
    private readonly defaults;
    private value;
    private persisted;
    constructor(defaults: AutoDistillSettings, path?: string);
    get(): AutoDistillSettingsSnapshot;
    update(patch: AutoDistillSettingsPatch): AutoDistillSettingsSnapshot;
    reset(): AutoDistillSettingsSnapshot;
    private load;
    private save;
}
