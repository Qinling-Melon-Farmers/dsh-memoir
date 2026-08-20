/**
 * Local ranked retrieval (roadmap §2.4) — lexical search without embeddings:
 *   - tokenizer: Chinese 2-grams (+3-grams), lowercase english words,
 *     path/code identifiers split on / \ . _ - and camelCase
 *   - in-memory inverted index (term → entryId → tf) rebuilt when the store
 *     epoch changes
 *   - ranking: BM25(content) + 2.5×BM25(title) + exact-phrase boost +
 *     section weight + recency decay
 *   - revision/epoch-aware LRU query cache (default 128 entries)
 */

import type { MemoirEntry, MemoirStatus, MemoirStore, SectionKey } from './store.js'

/** BM25 constants (standard defaults). */
export const BM25_K1 = 1.5
export const BM25_B = 0.75
export const TITLE_BOOST = 2.5
export const EXACT_PHRASE_BOOST = 2.0
export const SECTION_BOOST_SCALE = 0.1
export const RECENCY_BOOST_SCALE = 0.5

/** Section weights reused for retrieval (relative, scaled down). */
export const SECTION_WEIGHTS: Record<SectionKey, number> = {
  actions: 4.0,
  lessons: 3.5,
  work: 2.0,
  note: 0.5,
}

/** One side of the inverted index: term → entryId → term frequency. */
export type Postings = Map<string, Map<string, number>>

/** The in-memory inverted index over the store at one epoch. */
export interface RetrievalIndex {
  /** Store epoch this index was built from (cache invalidation key). */
  epoch: number
  docs: number
  /** Body field length normalization (v0.4.2: independent of title). */
  avgBodyLength: number
  bodyLengths: Map<string, number>
  /** Title field length normalization (v0.4.2: independent of body). */
  avgTitleLength: number
  titleLengths: Map<string, number>
  body: Postings
  title: Postings
}

/** One ranked search result. */
export interface RankedEntry {
  entry: MemoirEntry
  /** Workspace path the entry lives in (for global grouping). */
  projectPath: string
  score: number
}

/** Time bucket size for the ranking cache (recency is part of the score). */
export const QUERY_CACHE_TIME_BUCKET_MS = 3_600_000

/** Retrieval observability snapshot (diagnostics endpoint, roadmap §6.3). */
export interface RetrievalDiagnostics {
  /** Inverted-index shape; null before the first build. */
  index: { docs: number; terms: number; epoch: number } | null
  /** Query LRU counters. */
  cache: {
    hits: number
    misses: number
    evictions: number
    hitRate: number
    size: number
    capacity: number
  }
  /** The last executed search (a cache hit does not re-run the search). */
  lastQuery: { query: string; latencyMs: number; candidates: number; returned: number; at: number } | null
}

/** A minimal LRU cache (Map insertion order = recency) with hit stats. */
export class LruCache<V> {
  private readonly values = new Map<string, V>()
  private readonly max: number
  private hitCount = 0
  private missCount = 0
  private evictionCount = 0

  constructor(max: number) {
    this.max = max
  }

  get size(): number {
    return this.values.size
  }

  /** Configured entry cap. */
  get capacity(): number {
    return this.max
  }

  /** Successful lookups since construction. */
  get hits(): number {
    return this.hitCount
  }

  /** Failed lookups since construction. */
  get misses(): number {
    return this.missCount
  }

  /** Entries evicted past the cap since construction. */
  get evictions(): number {
    return this.evictionCount
  }

  /** hits / (hits + misses), in [0, 1]. */
  get hitRate(): number {
    const total = this.hitCount + this.missCount
    return total === 0 ? 0 : this.hitCount / total
  }

  get(key: string): V | undefined {
    const value = this.values.get(key)
    if (value === undefined) {
      this.missCount++
      return undefined
    }
    this.hitCount++
    // Refresh recency.
    this.values.delete(key)
    this.values.set(key, value)
    return value
  }

  set(key: string, value: V): void {
    this.values.delete(key)
    this.values.set(key, value)
    while (this.values.size > this.max) {
      const oldest = this.values.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.values.delete(oldest)
      this.evictionCount++
    }
  }
}

/** CJK codepoint test (same ranges as selector.estimateTokens). */
function isCjk(cp: number): boolean {
  return (
    (cp >= 0x3000 && cp <= 0x303f) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0x3400 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xffef) ||
    (cp >= 0xac00 && cp <= 0xd7af)
  )
}

/** Split one latin token further on camelCase boundaries. */
function splitCamel(token: string): string[] {
  const parts = token.split(/(?<=[a-z0-9])(?=[A-Z])/).map((p) => p.toLowerCase())
  return parts.length > 1 ? [token.toLowerCase(), ...parts] : [token.toLowerCase()]
}

/**
 * Tokenize text for indexing/querying (shared n-gram rules so both sides
 * align), optionally deduplicating the token list.
 */
function tokenizeInternal(text: string, dedupe: boolean): string[] {
  const tokens: string[] = []
  let cjk = ''
  let latin = ''
  const flushLatin = (): void => {
    if (latin === '') return
    for (const raw of latin.split(/[^A-Za-z0-9_]+/)) {
      if (raw === '') continue
      // Full compound token first (memoir_record, __ModuleLoader__), then
      // underscore sub-tokens; camelCase is split on the ORIGINAL case so
      // boundaries survive lowercasing.
      const lower = raw.toLowerCase()
      tokens.push(lower)
      const subs = lower.split('_')
      if (subs.length > 1) tokens.push(...subs.filter((p) => p !== ''))
      const camel = raw.split(/(?<=[a-z0-9])(?=[A-Z])/).map((p) => p.toLowerCase())
      if (camel.length > 1) tokens.push(...camel.filter((p) => p !== '' && p !== '_'))
    }
    latin = ''
  }
  const flushCjk = (): void => {
    if (cjk === '') return
    const chars = [...cjk]
    if (chars.length === 1) {
      tokens.push(chars[0])
    } else {
      for (let i = 0; i + 2 <= chars.length; i++) tokens.push(chars[i] + chars[i + 1])
      for (let i = 0; i + 3 <= chars.length; i++) tokens.push(chars[i] + chars[i + 1] + chars[i + 2])
    }
    cjk = ''
  }
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (isCjk(cp)) {
      flushLatin()
      cjk += ch
    } else {
      flushCjk()
      latin += ch
    }
  }
  flushLatin()
  flushCjk()
  return dedupe ? [...new Set(tokens)] : tokens
}

/**
 * Tokenize one document for indexing: repeats are KEPT so the inverted
 * index preserves true term frequency ("cache cache cache cache" indexes
 * cache ×4, not ×1).
 */
export function tokenizeDocument(text: string): string[] {
  return tokenizeInternal(text, false)
}

/**
 * Tokenize a query: repeats are deduplicated (a query term counts once
 * per document field, standard BM25 query semantics).
 */
export function tokenizeQuery(text: string): string[] {
  return tokenizeInternal(text, true)
}

/** v0.4.1 compat alias — query semantics (deduplicated). */
export function tokenize(text: string): string[] {
  return tokenizeQuery(text)
}

/** BM25 score of one doc field against the query terms. */
function bm25Field(
  field: Postings,
  queryTerms: string[],
  entryId: string,
  docLength: number,
  avgDocLength: number,
  docs: number,
): number {
  let score = 0
  for (const term of queryTerms) {
    const postings = field.get(term)
    if (postings === undefined) continue
    const tf = postings.get(entryId)
    if (tf === undefined) continue
    const df = postings.size
    const idf = Math.log(1 + (docs - df + 0.5) / (df + 0.5))
    const denom = tf + BM25_K1 * (1 - BM25_B + (BM25_B * docLength) / Math.max(1, avgDocLength))
    score += idf * ((tf * (BM25_K1 + 1)) / denom)
  }
  return score
}

/** Normalized text for phrase matching. */
function normalizedText(entry: MemoirEntry): string {
  return ((entry.title ?? '') + ' ' + entry.content).toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Recency decay term (same shape as the selector). */
function recencyDecay(time: number, now: number): number {
  const ageDays = Math.max(0, now - time) / 86_400_000
  return 1 / (1 + ageDays / 30)
}

/**
 * Ranked local retrieval over the store — rebuilt lazily per store epoch.
 * The query LRU cache keys on epoch + scope + project + section + query +
 * limit + detail, so any store write (or external change) invalidates it.
 */
export class RetrievalEngine {
  private index: RetrievalIndex | null = null
  private readonly entriesById = new Map<string, MemoirEntry>()
  private readonly pathById = new Map<string, string>()
  private readonly store: MemoirStore
  readonly queryCache: LruCache<RankedEntry[]>
  private lastQuery: RetrievalDiagnostics['lastQuery'] = null

  /**
   * @param store - the structured store (epoch drives rebuilds).
   * @param options.cacheSize - query LRU cap (config queryCacheSize).
   */
  constructor(store: MemoirStore, options: { cacheSize?: number } = {}) {
    this.store = store
    this.queryCache = new LruCache(options.cacheSize ?? 128)
  }

  /** Build (or reuse) the inverted index for the current store epoch. */
  ensureIndex(): RetrievalIndex {
    const epoch = this.store.stats().epoch
    if (this.index !== null && this.index.epoch === epoch) return this.index
    const body: Postings = new Map()
    const title: Postings = new Map()
    const bodyLengths = new Map<string, number>()
    const titleLengths = new Map<string, number>()
    let totalBodyLength = 0
    let totalTitleLength = 0
    let docs = 0
    const add = (field: Postings, entryId: string, terms: string[]): void => {
      for (const term of terms) {
        let postings = field.get(term)
        if (postings === undefined) {
          postings = new Map()
          field.set(term, postings)
        }
        postings.set(entryId, (postings.get(entryId) ?? 0) + 1)
      }
    }
    this.entriesById.clear()
    this.pathById.clear()
    for (const project of Object.values(this.store.load().projects)) {
      for (const entry of project.entries) {
        this.entriesById.set(entry.id, entry)
        this.pathById.set(entry.id, project.path)
        // v0.4.2: documents keep repeated tokens — true term frequency.
        const bodyTerms = tokenizeDocument(entry.content)
        const titleTerms = entry.title !== undefined ? tokenizeDocument(entry.title) : []
        bodyLengths.set(entry.id, bodyTerms.length)
        titleLengths.set(entry.id, titleTerms.length)
        totalBodyLength += bodyTerms.length
        totalTitleLength += titleTerms.length
        docs++
        add(body, entry.id, bodyTerms)
        add(title, entry.id, titleTerms)
      }
    }
    this.index = {
      epoch,
      docs,
      avgBodyLength: docs === 0 ? 0 : totalBodyLength / docs,
      bodyLengths,
      avgTitleLength: docs === 0 ? 0 : totalTitleLength / docs,
      titleLengths,
      body,
      title,
    }
    return this.index
  }

  /** Rank all entries matching the section filter for a query. */
  search(
    query: string,
    options: { section?: SectionKey; cwd?: string; now?: number; status?: MemoirStatus | 'all' } = {},
  ): RankedEntry[] {
    const startedAt = Date.now()
    const index = this.ensureIndex()
    const now = options.now ?? Date.now()
    const queryTerms = tokenizeQuery(query)
    if (queryTerms.length === 0) return []
    const q = query.toLowerCase().replace(/\s+/g, ' ').trim()
    const candidates: MemoirEntry[] = []
    if (options.cwd !== undefined) {
      candidates.push(...this.store.entries(options.cwd))
    } else {
      for (const project of Object.values(this.store.load().projects)) candidates.push(...project.entries)
    }
    const ranked: RankedEntry[] = []
    for (const entry of candidates) {
      if (options.section !== undefined && entry.section !== options.section) continue
      if (options.status !== 'all' && (entry.status ?? 'active') !== (options.status ?? 'active')) continue
      // v0.4.2: body and title normalize against their own average lengths.
      const bodyLength = index.bodyLengths.get(entry.id) ?? 0
      const titleLength = index.titleLengths.get(entry.id) ?? 0
      const bodyScore = bm25Field(index.body, queryTerms, entry.id, bodyLength, index.avgBodyLength, index.docs)
      const titleScore = bm25Field(index.title, queryTerms, entry.id, titleLength, index.avgTitleLength, index.docs)
      let score = bodyScore + TITLE_BOOST * titleScore
      if (bodyScore === 0 && titleScore === 0) continue
      if (normalizedText(entry).includes(q)) score += EXACT_PHRASE_BOOST
      score += SECTION_WEIGHTS[entry.section] * SECTION_BOOST_SCALE
      score += recencyDecay(entry.time, now) * RECENCY_BOOST_SCALE
      ranked.push({ entry, projectPath: this.pathById.get(entry.id) ?? '', score })
    }
    ranked.sort((a, b) => b.score - a.score || b.entry.time - a.entry.time || a.entry.id.localeCompare(b.entry.id))
    this.lastQuery = {
      query,
      latencyMs: Date.now() - startedAt,
      candidates: candidates.length,
      returned: ranked.length,
      at: Date.now(),
    }
    return ranked
  }

  /**
   * Cached search: the key is epoch + cwd + section + normalized query +
   * 1-hour time bucket. v0.4.2: limit/detail are NOT part of the key — they
   * only shape output, never the ranking — so every limit/detail variant
   * shares the same full ranked result, and the tool layer slices from it.
   * The time bucket stops the recency part of the score from freezing for
   * the whole epoch.
   */
  cachedSearch(
    query: string,
    options: { section?: SectionKey; cwd?: string; now?: number; limit?: number; detail?: string; status?: MemoirStatus | 'all' } = {},
  ): RankedEntry[] {
    const now = options.now ?? Date.now()
    const timeBucket = Math.floor(now / QUERY_CACHE_TIME_BUCKET_MS)
    const epoch = this.ensureIndex().epoch
    const key = [
      String(epoch),
      options.cwd ?? '',
      options.section ?? '',
      options.status ?? 'active',
      query.toLowerCase().replace(/\s+/g, ' ').trim(),
      String(timeBucket),
    ].join('|')
    const hit = this.queryCache.get(key)
    if (hit !== undefined) return hit
    const result = this.search(query, options)
    this.queryCache.set(key, result)
    return result
  }

  /** Retrieval observability snapshot for the diagnostics endpoint. */
  diagnostics(): RetrievalDiagnostics {
    const index = this.index
    return {
      index: index === null
        ? null
        : { docs: index.docs, terms: index.body.size + index.title.size, epoch: index.epoch },
      cache: {
        hits: this.queryCache.hits,
        misses: this.queryCache.misses,
        evictions: this.queryCache.evictions,
        hitRate: this.queryCache.hitRate,
        size: this.queryCache.size,
        capacity: this.queryCache.capacity,
      },
      lastQuery: this.lastQuery,
    }
  }
}

