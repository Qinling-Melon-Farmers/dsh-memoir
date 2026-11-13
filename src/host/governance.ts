/** Explicit update / supersede / force-record protocol for v0.5.6. */

import type { EntryPayload, EntryUpdate, MemoirEntry, MemoirSource, MemoirStore } from './store.js'
import { validateEntryPayload } from './store.js'
import type { RetrievalEngine } from './retrieval.js'
import { findSimilarMemories, type SimilarityCandidate } from './similarity.js'
import { hostCopy, reliabilityCopy } from './i18n.js'
import type { MemoirLanguage } from './i18n.js'

export type RecordResolution = 'update' | 'supersede' | 'force-record'

export type RecordAction = 'recorded' | 'needs-resolution' | 'updated' | 'superseded' | 'force-recorded'

export interface GovernedRecordResult {
  action: RecordAction
  recorded: boolean
  entry?: MemoirEntry
  candidates: SimilarityCandidate[]
}

export interface GovernedRecordOptions {
  source?: MemoirSource
  resolution?: RecordResolution
  targetId?: string
  language?: MemoirLanguage
}

function requireTarget(
  store: MemoirStore,
  cwd: string,
  targetId: string | undefined,
  candidates: SimilarityCandidate[],
  language: MemoirLanguage,
): MemoirEntry {
  const copy = hostCopy(language).governance
  if (targetId === undefined || targetId.trim() === '') {
    throw new Error(copy.targetRequired)
  }
  if (!candidates.some((candidate) => candidate.entry.id === targetId)) {
    throw new Error(copy.targetCandidate)
  }
  const target = store.entries(cwd).find((entry) => entry.id === targetId)
  if (target === undefined) throw new Error(copy.targetMissing(targetId))
  return target
}

function updatePatch(payload: EntryPayload): EntryUpdate {
  return {
    section: payload.section,
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    content: payload.content,
    ...(payload.importance !== undefined ? { importance: payload.importance } : {}),
    ...(payload.pinned !== undefined ? { pinned: payload.pinned } : {}),
    ...(payload.supersedes !== undefined ? { supersedes: payload.supersedes } : {}),
    ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
  }
}

/** Exact content must remain detectable even when tokenization has no terms. */
function currentCandidates(store: MemoirStore, retrieval: RetrievalEngine, cwd: string, payload: EntryPayload): SimilarityCandidate[] {
  const ranked = findSimilarMemories(retrieval, cwd, payload)
  const known = new Set(ranked.map((candidate) => candidate.entry.id))
  const normalized = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim()
  const content = normalized(payload.content)
  const exact: SimilarityCandidate[] = store.entries(cwd)
    .filter((entry) => (entry.status ?? 'active') === 'active' && !known.has(entry.id) && normalized(entry.content) === content)
    .map((entry) => ({ kind: 'duplicate', score: 0, components: { bm25: 0, title: 0, tokenJaccard: 0 }, reasons: ['exact-content'], entry, projectPath: cwd }))
  return [...exact, ...ranked].slice(0, 5)
}

/**
 * Resolve one prospective write. Omission is safe-by-default: no candidate
 * means a normal append; candidates mean a no-write response asking the
 * caller to choose update, supersede, or force-record.
 */
export function governedRecord(
  store: MemoirStore,
  retrieval: RetrievalEngine,
  cwd: string,
  payload: EntryPayload,
  options: GovernedRecordOptions = {},
): GovernedRecordResult {
  // Keep the standalone helper's historical English errors; the plugin and
  // Web routes always pass their configured live language explicitly.
  const language = options.language ?? 'en'
  const copy = hostCopy(language).governance
  const validation = validateEntryPayload(payload, language)
  if (validation !== undefined) throw new Error(validation)
  // Capture what this instance was about to confirm before refreshing the
  // store under the lock. A changed target must be presented again.
  const observed = options.resolution === 'update' || options.resolution === 'supersede'
    ? currentCandidates(store, retrieval, cwd, payload).find((candidate) => candidate.entry.id === options.targetId)
    : undefined
  const observedTarget = observed === undefined ? undefined : JSON.stringify(observed.entry)
  return store.withMutationLock(() => {
    const candidates = currentCandidates(store, retrieval, cwd, payload)
    if (options.resolution === undefined && options.targetId !== undefined) {
      throw new Error(copy.resolutionRequired)
    }
    if (options.resolution === undefined && candidates.length > 0) {
      return { action: 'needs-resolution', recorded: false, candidates }
    }

    if (options.resolution === 'update') {
      const target = requireTarget(store, cwd, options.targetId, candidates, language)
      if (observedTarget === undefined || observedTarget !== JSON.stringify(target)) throw new Error(reliabilityCopy(language).candidateChanged)
      const entry = store.update(cwd, target.id, updatePatch(payload))
      if (entry === undefined) throw new Error(copy.updateMissing(target.id))
      return { action: 'updated', recorded: false, entry, candidates }
    }

    if (options.resolution === 'supersede') {
      const target = requireTarget(store, cwd, options.targetId, candidates, language)
      if (observedTarget === undefined || observedTarget !== JSON.stringify(target)) throw new Error(reliabilityCopy(language).candidateChanged)
      const supersedes = [...new Set([...(payload.supersedes ?? []), target.id])]
      const entry = store.record(cwd, { ...payload, supersedes }, options.source)
      return { action: 'superseded', recorded: true, entry, candidates }
    }

    if (options.resolution === 'force-record') {
      if (options.targetId !== undefined) throw new Error(copy.forceTargetUnused)
      const entry = store.record(cwd, payload, options.source)
      return { action: 'force-recorded', recorded: true, entry, candidates }
    }

    const entry = store.record(cwd, payload, options.source)
    return { action: 'recorded', recorded: true, entry, candidates: [] }
  })
}
