/**
 * Similar-memory governance for v0.5.6.
 *
 * Retrieval remains lexical and local: the existing BM25 index supplies a
 * small candidate set, then query-relative BM25, title similarity, and Token
 * Jaccard are fused into an explainable score. The classifier is deliberately
 * conservative: it only surfaces duplicate/conflict candidates and never
 * mutates the store by itself.
 */
import type { EntryPayload, MemoirEntry } from './store.js';
import { type RetrievalEngine } from './retrieval.js';
export type SimilarityKind = 'duplicate' | 'conflict';
export type SimilarityReason = 'exact-content' | 'exact-title' | 'high-title-overlap' | 'high-token-overlap' | 'bm25-candidate' | 'same-topic-different-content';
export interface SimilarityComponents {
    /** Query-relative BM25 score in [0, 1]; never presented as a global percentage. */
    bm25: number;
    /** Title token similarity in [0, 1]. */
    title: number;
    /** Combined title/body Token Jaccard in [0, 1]. */
    tokenJaccard: number;
}
export interface SimilarityCandidate {
    kind: SimilarityKind;
    score: number;
    components: SimilarityComponents;
    reasons: SimilarityReason[];
    entry: MemoirEntry;
    projectPath: string;
}
/** Public calibration constants: fixed-set tests guard changes to these gates. */
export declare const SIMILARITY_POLICY: {
    readonly retrievalCandidates: 24;
    readonly outputCandidates: 5;
    readonly duplicateTokenJaccard: 0.78;
    readonly duplicateExactTitleTokenJaccard: 0.45;
    readonly conflictTitleSimilarity: 0.62;
    readonly conflictTokenJaccard: 0.24;
    readonly conflictUntitledTokenJaccard: 0.5;
};
/** Jaccard overlap of the same multilingual/code/path tokens used by BM25. */
export declare function tokenJaccard(left: string, right: string): number;
/** Exact-normalized title match, otherwise title Token Jaccard. */
export declare function titleSimilarity(left?: string, right?: string): number;
/**
 * Return only actionable duplicate/conflict candidates for a prospective
 * record. Raw BM25 is normalized against this query's strongest hit because
 * BM25 magnitudes are not comparable across different queries.
 */
export declare function findSimilarMemories(retrieval: RetrievalEngine, cwd: string, payload: EntryPayload, limit?: 5): SimilarityCandidate[];
