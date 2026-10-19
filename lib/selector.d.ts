/**
 * Hot memory selector (roadmap §2.3) — picks the highest-value memory for
 * system-prompt injection under a token budget, and renders it compactly.
 *
 * Deterministic: fixed entries + budget + clock + language produce the same text (a
 * requirement for stable prompt prefixes). No ids / sessionIds / timestamps /
 * repeated section labels in the injected text — those burn tokens without
 * changing behavior.
 */
import type { MemoirEntry, SectionKey } from './store.js';
import type { MemoirLanguage } from './i18n.js';
/** Token budget for hot-memory injection. */
export interface MemoryBudget {
    /** Soft target: stop adding entries once reached. */
    targetTokens: number;
    /** Hard ceiling: injected text never exceeds this. */
    hardMaxTokens: number;
}
/** Defaults (roadmap §2.3 / config hotMemoryTokens / hotMemoryMaxTokens). */
export declare const DEFAULT_MEMORY_BUDGET: MemoryBudget;
/** Section weights for the v0.4 scoring (roadmap §2.3). */
export declare const SECTION_WEIGHTS: Record<SectionKey, number>;
/**
 * Canonical group render order inside the injected text. v0.4.2: work is
 * intentionally NOT a rendered group — work entries appear only in the
 * "Recent state" block, so the same work line is never injected twice.
 */
export declare const HOT_SECTION_ORDER: SectionKey[];
/** Recent-work entries shown in the "Recent state" block. */
export declare const RECENT_WORK_COUNT = 3;
/**
 * Conservative token approximation without a tokenizer library (roadmap
 * §2.3): CJK chars ≈ 1 token each, everything else ≈ 4 chars/token.
 */
export declare function estimateTokens(text: string): number;
/** One scored candidate. */
interface ScoredEntry {
    entry: MemoirEntry;
    score: number;
}
/**
 * Score + order candidates deterministically:
 * section weight + recency decay + importance + pinned bonus;
 * ties break by newer time, then id. The selector applies these scores
 * within actions/lessons; its work quota stays ordered by time, then id.
 * note entries are excluded by default (roadmap §1.2 B: notes never enter
 * hot memory in v0.4).
 */
export declare function rankEntries(entries: MemoirEntry[], now?: number): ScoredEntry[];
/** Compact bullet for one entry: title prefix + content (no ids/timestamps). */
export declare function compactLine(entry: MemoirEntry, language?: MemoirLanguage): string;
/** The injected header line. */
export declare const HOT_MEMORY_HEADER = "[Project memory]";
/**
 * Render the selected entries into the compact injected block (roadmap
 * §2.3): Actions / Lessons / Recent state. Deterministic for a fixed input.
 */
export declare function renderHotMemory(selected: MemoirEntry[], language?: MemoirLanguage): string;
/** One selection result (diagnostics + injection). */
export interface HotMemoryResult {
    /** The injected block ('' when nothing was selected). */
    text: string;
    /** Entries that made it into the block. */
    selected: MemoirEntry[];
    /** Total candidates considered (excluding note). */
    total: number;
    /** Estimated tokens of the injected text. */
    estimatedTokens: number;
}
/**
 * Fit the first selected entry to the hard ceiling without mutating it.
 * Shorten content first, and shorten the title only if it still prevents
 * the block from fitting. Prefixes end on code-point boundaries and carry
 * an ellipsis. Return undefined if even the localized header, section and
 * a title-free ellipsis cannot fit; the caller must skip that candidate.
 */
export declare function truncateEntryToBudget(entry: MemoirEntry, hardMaxTokens: number, language?: MemoirLanguage): MemoirEntry | undefined;
/**
 * Select hot memory under the budget. v0.4.2 quota-based order:
 *   1. newest work entries (Recent-state floor, 1~RECENT_WORK_COUNT)
 *   2. ranked actions
 *   3. ranked lessons
 *   4. remaining work entries, newest first
 * Pinned/importance scores apply within actions/lessons, not across these
 * groups or ahead of the recent-work floor. Skip candidates that exceed
 * the remaining hard budget and keep scanning for smaller entries. Stop
 * once an accepted entry reaches the soft target. An oversized first
 * selection is truncated if its minimal block fits; otherwise skip it.
 *
 * @param entries - one project's entries.
 * @param budget - token budget (defaults to DEFAULT_MEMORY_BUDGET).
 * @param now - clock for recency (injectable for deterministic tests).
 */
export declare function selectHotMemory(entries: MemoirEntry[], budget?: MemoryBudget, now?: number, language?: MemoirLanguage): HotMemoryResult;
export {};
