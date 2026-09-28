/** Shared language identifiers only; safe to bundle into the browser. */
export const MEMOIR_LANGUAGES = ['zh', 'en', 'de', 'ru'] as const
export type MemoirLanguage = typeof MEMOIR_LANGUAGES[number]
export const DEFAULT_MEMOIR_LANGUAGE: MemoirLanguage = 'zh'

export function isMemoirLanguage(value: unknown): value is MemoirLanguage {
  return typeof value === 'string' && MEMOIR_LANGUAGES.some(language => language === value)
}

export function resolveMemoirLanguage(value: unknown, fallback: MemoirLanguage = DEFAULT_MEMOIR_LANGUAGE): MemoirLanguage {
  return isMemoirLanguage(value) ? value : fallback
}
