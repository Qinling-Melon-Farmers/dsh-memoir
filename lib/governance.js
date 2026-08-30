/** Explicit update / supersede / force-record protocol for v0.5.6. */
import { findSimilarMemories } from './similarity.js';
import { hostCopy } from './i18n.js';
function requireTarget(store, cwd, targetId, candidates, language) {
    const copy = hostCopy(language).governance;
    if (targetId === undefined || targetId.trim() === '') {
        throw new Error(copy.targetRequired);
    }
    if (!candidates.some((candidate) => candidate.entry.id === targetId)) {
        throw new Error(copy.targetCandidate);
    }
    const target = store.entries(cwd).find((entry) => entry.id === targetId);
    if (target === undefined)
        throw new Error(copy.targetMissing(targetId));
    return target;
}
function updatePatch(payload) {
    return {
        section: payload.section,
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        content: payload.content,
        ...(payload.importance !== undefined ? { importance: payload.importance } : {}),
        ...(payload.pinned !== undefined ? { pinned: payload.pinned } : {}),
        ...(payload.supersedes !== undefined ? { supersedes: payload.supersedes } : {}),
        ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
    };
}
/**
 * Resolve one prospective write. Omission is safe-by-default: no candidate
 * means a normal append; candidates mean a no-write response asking the
 * caller to choose update, supersede, or force-record.
 */
export function governedRecord(store, retrieval, cwd, payload, options = {}) {
    // Keep the standalone helper's historical English errors; the plugin and
    // Web routes always pass their configured live language explicitly.
    const language = options.language ?? 'en';
    const copy = hostCopy(language).governance;
    const candidates = findSimilarMemories(retrieval, cwd, payload);
    if (options.resolution === undefined && options.targetId !== undefined) {
        throw new Error(copy.resolutionRequired);
    }
    if (options.resolution === undefined && candidates.length > 0) {
        return { action: 'needs-resolution', recorded: false, candidates };
    }
    if (options.resolution === 'update') {
        const target = requireTarget(store, cwd, options.targetId, candidates, language);
        const entry = store.update(cwd, target.id, updatePatch(payload));
        if (entry === undefined)
            throw new Error(copy.updateMissing(target.id));
        return { action: 'updated', recorded: false, entry, candidates };
    }
    if (options.resolution === 'supersede') {
        const target = requireTarget(store, cwd, options.targetId, candidates, language);
        const supersedes = [...new Set([...(payload.supersedes ?? []), target.id])];
        const entry = store.record(cwd, { ...payload, supersedes }, options.source);
        return { action: 'superseded', recorded: true, entry, candidates };
    }
    if (options.resolution === 'force-record') {
        if (options.targetId !== undefined)
            throw new Error(copy.forceTargetUnused);
        const entry = store.record(cwd, payload, options.source);
        return { action: 'force-recorded', recorded: true, entry, candidates };
    }
    const entry = store.record(cwd, payload, options.source);
    return { action: 'recorded', recorded: true, entry, candidates: [] };
}
