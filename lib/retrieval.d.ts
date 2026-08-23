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
import type { MemoirEntry, MemoirStatus, MemoirStore, SectionKey } from './store.js';
/** BM25 constants (standard defaults). */
export declare const BM25_K1 = 1.5;
export declare const BM25_B = 0.75;
export declare const TITLE_BOOST = 2.5;
export declare const EXACT_PHRASE_BOOST = 2;
export declare const SECTION_BOOST_SCALE = 0.1;
export declare const RECENCY_BOOST_SCALE = 0.5;
/** Section weights reused for retrieval (relative, scaled down). */
export declare const SECTION_WEIGHTS: Record<SectionKey, number>;
/** One side of the inverted index: term → entryId → term frequency. */
export type Postings = Map<string, Map<string, number>>;
/** The in-memory inverted index over the store at one epoch. */
export interface RetrievalIndex {
    /** Store epoch this index was built from (cache invalidation key). */
    epoch: number;
    docs: number;
    /** Body field length normalization (v0.4.2: independent of title). */
    avgBodyLength: number;
    bodyLengths: Map<string, number>;
    /** Title field length normalization (v0.4.2: independent of body). */
    avgTitleLength: number;
    titleLengths: Map<string, number>;
    body: Postings;
    title: Postings;
}
/** One ranked search result. */
export interface RankedEntry {
    entry: MemoirEntry;
    /** Workspace path the entry lives in (for global grouping). */
    projectPath: string;
    score: number;
}
/** Time bucket size for the ranking cache (recency is part of the score). */
export declare const QUERY_CACHE_TIME_BUCKET_MS = 3600000;
/** Retrieval observability snapshot (diagnostics endpoint, roadmap §6.3). */
export interface RetrievalDiagnostics {
    /** Inverted-index shape; null before the first build. */
    index: {
        docs: number;
        terms: number;
        epoch: number;
    } | null;
    /** Query LRU counters. */
    cache: {
        hits: number;
        misses: number;
        evictions: number;
        hitRate: number;
        size: number;
        capacity: number;
    };
    /** The last executed search (a cache hit does not re-run the search). */
    lastQuery: {
        query: string;
        latencyMs: number;
        candidates: number;
        returned: number;
        at: number;
    } | null;
}
/** A minimal LRU cache (Map insertion order = recency) with hit stats. */
export declare class LruCache<V> {
    private readonly values;
    private max;
    private hitCount;
    private missCount;
    private evictionCount;
    constructor(max: number);
    get size(): number;
    /** Configured entry cap. */
    get capacity(): number;
    /** Resize the live cache and evict oldest entries immediately when needed. */
    resize(max: number): void;
    /** Successful lookups since construction. */
    get hits(): number;
    /** Failed lookups since construction. */
    get misses(): number;
    /** Entries evicted past the cap since construction. */
    get evictions(): number;
    /** hits / (hits + misses), in [0, 1]. */
    get hitRate(): number;
    get(key: string): V | undefined;
    set(key: string, value: V): void;
    private evictPastCapacity;
}
/**
 * Tokenize one document for indexing: repeats are KEPT so the inverted
 * index preserves true term frequency ("cache cache cache cache" indexes
 * cache ×4, not ×1).
 */
export declare function tokenizeDocument(text: string): string[];
/**
 * Tokenize a query: repeats are deduplicated (a query term counts once
 * per document field, standard BM25 query semantics).
 */
export declare function tokenizeQuery(text: string): string[];
/** v0.4.1 compat alias — query semantics (deduplicated). */
export declare function tokenize(text: string): string[];
/**
 * Ranked local retrieval over the store — rebuilt lazily per store epoch.
 * The query LRU cache keys on epoch + scope + project + section + query +
 * limit + detail, so any store write (or external change) invalidates it.
 */
export declare class RetrievalEngine {
    private index;
    private readonly entriesById;
    private readonly pathById;
    private readonly store;
    readonly queryCache: LruCache<RankedEntry[]>;
    private lastQuery;
    /**
     * @param store - the structured store (epoch drives rebuilds).
     * @param options.cacheSize - query LRU cap (config queryCacheSize).
     */
    constructor(store: MemoirStore, options?: {
        cacheSize?: number;
    });
    /** Apply a live query-cache capacity change from the Web settings surface. */
    resizeCache(max: number): void;
    /** Build (or reuse) the inverted index for the current store epoch. */
    ensureIndex(): RetrievalIndex;
    /** Rank all entries matching the section filter for a query. */
    search(query: string, options?: {
        section?: SectionKey;
        cwd?: string;
        now?: number;
        status?: MemoirStatus | 'all';
    }): RankedEntry[];
    /**
     * Cached search: the key is epoch + cwd + section + normalized query +
     * 1-hour time bucket. v0.4.2: limit/detail are NOT part of the key — they
     * only shape output, never the ranking — so every limit/detail variant
     * shares the same full ranked result, and the tool layer slices from it.
     * The time bucket stops the recency part of the score from freezing for
     * the whole epoch.
     */
    cachedSearch(query: string, options?: {
        section?: SectionKey;
        cwd?: string;
        now?: number;
        limit?: number;
        detail?: string;
        status?: MemoirStatus | 'all';
    }): RankedEntry[];
    /** Retrieval observability snapshot for the diagnostics endpoint. */
    diagnostics(): RetrievalDiagnostics;
}
