/** Shared language identifiers only; safe to bundle into the browser. */
export const MEMOIR_LANGUAGES = ['zh', 'en', 'de', 'ru'];
export const DEFAULT_MEMOIR_LANGUAGE = 'zh';
export function isMemoirLanguage(value) {
    return typeof value === 'string' && MEMOIR_LANGUAGES.some(language => language === value);
}
export function resolveMemoirLanguage(value, fallback = DEFAULT_MEMOIR_LANGUAGE) {
    return isMemoirLanguage(value) ? value : fallback;
}
