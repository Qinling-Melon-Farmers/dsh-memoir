/**
 * Hot memory selector (roadmap §2.3) — picks the highest-value memory for
 * system-prompt injection under a token budget, and renders it compactly.
 *
 * Deterministic: fixed entries + budget always produce the same text (a
 * requirement for stable prompt prefixes). No ids / sessionIds / timestamps /
 * repeated section labels in the injected text — those burn tokens without
 * changing behavior.
 */

import type { MemoirEntry, SectionKey } from './store.js'

/** Token budget for hot-memory injection. */
export interface MemoryBudget {
  /** Soft target: stop adding entries once reached. */
  targetTokens: number
  /** Hard ceiling: injected text never exceeds this. */
  hardMaxTokens: number
}

/** Defaults (roadmap §2.3 / config hotMemoryTokens / hotMemoryMaxTokens). */
export const DEFAULT_MEMORY_BUDGET: MemoryBudget = { targetTokens: 900, hardMaxTokens: 1200 }

/** Section weights for the v0.4 scoring (roadmap §2.3). */
export const SECTION_WEIGHTS: Record<SectionKey, number> = {
  actions: 4.0,
  lessons: 3.5,
  work: 2.0,
  note: 0.5,
}

/** Canonical render order inside the injected text. */
export const HOT_SECTION_ORDER: SectionKey[] = ['actions', 'lessons', 'work']

/** Recent-work entries shown in the "Recent state" block. */
export const RECENT_WORK_COUNT = 3

/** CJK-ish codepoint ranges counted as ~1 token each. */
function isCjk(cp: number): boolean {
  return (
    (cp >= 0x3000 && cp <= 0x303f) || // CJK punctuation
    (cp >= 0x3040 && cp <= 0x30ff) || // kana
    (cp >= 0x3400 && cp <= 0x9fff) || // CJK ideographs
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compat
    (cp >= 0xff00 && cp <= 0xffef) || // fullwidth forms
    (cp >= 0xac00 && cp <= 0xd7af)    // hangul
  )
}

/**
 * Conservative token approximation without a tokenizer library (roadmap
 * §2.3): CJK chars ≈ 1 token each, everything else ≈ 4 chars/token.
 */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (isCjk(cp)) cjk++
    else other++
  }
  return Math.ceil(cjk + other / 4)
}

/** Recency decay: 1.0 now → ~0 toward very old entries. */
function recencyBoost(time: number, now: number): number {
  const ageDays = Math.max(0, now - time) / 86_400_000
  return 1.0 / (1 + ageDays / 30)
}

/** One scored candidate. */
interface ScoredEntry {
  entry: MemoirEntry
  score: number
}

/**
 * Score + order candidates deterministically:
 * section weight + recency decay; ties break by newer time, then id.
 * note entries are excluded by default (roadmap §1.2 B: notes never enter
 * hot memory in v0.4).
 */
export function rankEntries(entries: MemoirEntry[], now = Date.now()): ScoredEntry[] {
  return entries
    .filter((e) => e.section !== 'note')
    .map((entry) => ({
      entry,
      score: SECTION_WEIGHTS[entry.section] + recencyBoost(entry.time, now),
    }))
    .sort((a, b) => b.score - a.score || b.entry.time - a.entry.time || a.entry.id.localeCompare(b.entry.id))
}

/** Compact bullet for one entry: title prefix + content (no ids/timestamps). */
export function compactLine(entry: MemoirEntry): string {
  const head = entry.title !== undefined && entry.title !== '' ? entry.title + '：' : ''
  return '- ' + head + entry.content.replace(/\s+/g, ' ').trim()
}

/** The injected header line. */
export const HOT_MEMORY_HEADER = '[Project memory]'

/**
 * Render the selected entries into the compact injected block (roadmap
 * §2.3): Actions / Lessons / Recent state. Deterministic for a fixed input.
 */
export function renderHotMemory(selected: MemoirEntry[]): string {
  const lines: string[] = [HOT_MEMORY_HEADER]
  for (const section of HOT_SECTION_ORDER) {
    const group = selected.filter((e) => e.section === section)
    if (group.length === 0) continue
    const label =
      section === 'actions' ? 'Actions:' : section === 'lessons' ? 'Lessons:' : 'Work:'
    lines.push(label)
    for (const entry of group) lines.push(compactLine(entry))
    lines.push('')
  }
  // Recent state: the newest selected work entries (activity context).
  const recent = [...selected]
    .filter((e) => e.section === 'work')
    .sort((a, b) => b.time - a.time || a.id.localeCompare(b.id))
    .slice(0, RECENT_WORK_COUNT)
  if (recent.length > 0) {
    lines.push('Recent state:')
    for (const entry of recent) lines.push(compactLine(entry))
  }
  return lines.join('\n').replace(/\n\n\n+/g, '\n\n').trim()
}

/** One selection result (diagnostics + injection). */
export interface HotMemoryResult {
  /** The injected block ('' when nothing was selected). */
  text: string
  /** Entries that made it into the block. */
  selected: MemoirEntry[]
  /** Total candidates considered (excluding note). */
  total: number
  /** Estimated tokens of the injected text. */
  estimatedTokens: number
}

/**
 * Select hot memory under the budget: iterate ranked candidates, add while
 * the estimate stays below targetTokens, never exceed hardMaxTokens (a first
 * entry that alone exceeds the hard cap is truncated into place so the
 * injected text always stays bounded).
 *
 * @param entries - one project's entries.
 * @param budget - token budget (defaults to DEFAULT_MEMORY_BUDGET).
 * @param now - clock for recency (injectable for deterministic tests).
 */
export function selectHotMemory(
  entries: MemoirEntry[],
  budget: MemoryBudget = DEFAULT_MEMORY_BUDGET,
  now = Date.now(),
): HotMemoryResult {
  const ranked = rankEntries(entries, now)
  const selected: MemoirEntry[] = []
  const measure = (): string => (selected.length === 0 ? '' : renderHotMemory(selected))
  for (const { entry } of ranked) {
    const probe = selected.length === 0 ? [entry] : [...selected, entry]
    const probeText = renderHotMemory(probe)
    const tokens = estimateTokens(probeText)
    if (tokens > budget.hardMaxTokens) {
      if (selected.length === 0) {
        // A single oversized entry: force it in truncated so output stays
        // bounded and non-empty.
        const truncated = { ...entry, content: entry.content.slice(0, 400) + '…' }
        selected.push(truncated)
      }
      break
    }
    selected.push(entry)
    if (tokens >= budget.targetTokens) break
    void measure
  }
  const text = selected.length === 0 ? '' : renderHotMemory(selected)
  return {
    text,
    selected,
    total: ranked.length,
    estimatedTokens: estimateTokens(text),
  }
}
