/** Shared language identifiers only; safe to bundle into the browser. */
export declare const MEMOIR_LANGUAGES: readonly ["zh", "en", "de", "ru"];
export type MemoirLanguage = typeof MEMOIR_LANGUAGES[number];
export declare const DEFAULT_MEMOIR_LANGUAGE: MemoirLanguage;
export declare function isMemoirLanguage(value: unknown): value is MemoirLanguage;
export declare function resolveMemoirLanguage(value: unknown, fallback?: MemoirLanguage): MemoirLanguage;
