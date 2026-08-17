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
import type { MemoirEntry, MemoirStore, SectionKey } from './store.js';
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
/** A minimal LRU cache (Map insertion order = recency). */
export declare class LruCache<V> {
    private readonly values;
    private readonly max;
    constructor(max: number);
    get size(): number;
    get(key: string): V | undefined;
    set(key: string, value: V): void;
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
    /**
     * @param store - the structured store (epoch drives rebuilds).
     * @param options.cacheSize - query LRU cap (config queryCacheSize).
     */
    constructor(store: MemoirStore, options?: {
        cacheSize?: number;
    });
    /** Build (or reuse) the inverted index for the current store epoch. */
    ensureIndex(): RetrievalIndex;
    /** Rank all entries matching the section filter for a query. */
    search(query: string, options?: {
        section?: SectionKey;
        cwd?: string;
        now?: number;
    }): RankedEntry[];
    /**
     * Cached search: the key includes the store epoch, so any write (or
     * external file change) invalidates the cache automatically.
     */
    cachedSearch(query: string, options?: {
        section?: SectionKey;
        cwd?: string;
        now?: number;
        limit?: number;
        detail?: string;
    }): RankedEntry[];
}
