/** Explicit update / supersede / force-record protocol for v0.5.6. */
import type { EntryPayload, MemoirEntry, MemoirSource, MemoirStore } from './store.js';
import type { RetrievalEngine } from './retrieval.js';
import { type SimilarityCandidate } from './similarity.js';
import type { MemoirLanguage } from './i18n.js';
export type RecordResolution = 'update' | 'supersede' | 'force-record';
export type RecordAction = 'recorded' | 'needs-resolution' | 'updated' | 'superseded' | 'force-recorded';
export interface GovernedRecordResult {
    action: RecordAction;
    recorded: boolean;
    entry?: MemoirEntry;
    candidates: SimilarityCandidate[];
}
export interface GovernedRecordOptions {
    source?: MemoirSource;
    resolution?: RecordResolution;
    targetId?: string;
    language?: MemoirLanguage;
}
/**
 * Resolve one prospective write. Omission is safe-by-default: no candidate
 * means a normal append; candidates mean a no-write response asking the
 * caller to choose update, supersede, or force-record.
 */
export declare function governedRecord(store: MemoirStore, retrieval: RetrievalEngine, cwd: string, payload: EntryPayload, options?: GovernedRecordOptions): GovernedRecordResult;
