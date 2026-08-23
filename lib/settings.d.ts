/**
 * Persistent Web-panel overrides for live dsh-memoir configuration.
 *
 * cordis.patch.yml remains the source of startup defaults. Once the user
 * saves either GUI settings surface, the normalized override is stored in
 * ~/.dsh/dsh-memoir.settings.json and applied without a profile restart.
 * Resetting removes the override and restores the startup defaults captured
 * when the plugin mounted.
 */
export declare const SETTINGS_VERSION = 2;
/** Every setting that v0.5.4 can change live from the GUI. */
export interface MemoirSettings {
    announceToAgent: boolean;
    autoDistill: boolean;
    autoDistillEvery: number;
    autoDistillCooldownMin: number;
    autoDistillMinTools: number;
    hotMemoryTokens: number;
    hotMemoryMaxTokens: number;
    readDefaultLimit: number;
    readMaxLimit: number;
    sessionSnapshotMax: number;
    queryCacheSize: number;
}
export type MemoirSettingsPatch = Partial<MemoirSettings>;
export interface MemoirSettingsSnapshot {
    settings: MemoirSettings;
    source: 'profile' | 'web';
}
/** Backwards-compatible type names retained for the v0.5.3 internal API. */
export type AutoDistillSettings = MemoirSettings;
export type AutoDistillSettingsPatch = MemoirSettingsPatch;
export type AutoDistillSettingsSnapshot = MemoirSettingsSnapshot;
/** Built-in fallback values; profile values override these at construction. */
export declare const DEFAULT_MEMOIR_SETTINGS: MemoirSettings;
/** Default settings location: <home>/.dsh/dsh-memoir.settings.json. */
export declare function defaultSettingsPath(): string;
/** Normalize an untrusted partial value against known-good defaults. */
export declare function resolveMemoirSettings(value: unknown, defaults: MemoirSettings): MemoirSettings;
/** Strict validation for the panel API. Returns an error message when invalid. */
export declare function validateMemoirSettingsPatch(payload: unknown, base?: MemoirSettings): string | undefined;
/** v0.5.3 compatibility aliases for callers that imported the old names. */
export declare const resolveAutoDistillSettings: typeof resolveMemoirSettings;
export declare const validateAutoDistillSettingsPatch: typeof validateMemoirSettingsPatch;
/** In-process live settings state with an atomic JSON persistence boundary. */
export declare class MemoirSettingsStore {
    private readonly path;
    private readonly defaults;
    private value;
    private persisted;
    private readonly listeners;
    constructor(defaults: MemoirSettings, path?: string);
    get(): MemoirSettingsSnapshot;
    subscribe(listener: (snapshot: MemoirSettingsSnapshot) => void): () => void;
    update(patch: MemoirSettingsPatch): MemoirSettingsSnapshot;
    reset(): MemoirSettingsSnapshot;
    private emit;
    private load;
    private save;
}
/** v0.5.3 compatibility export. */
export { MemoirSettingsStore as AutoDistillSettingsStore };
