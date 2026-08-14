/**
 * Shared client-side wire types (kept dependency-free so pure-logic tests can
 * import them through Node's type stripping).
 */

export type SectionKey = 'work' | 'lessons' | 'actions' | 'note'
