/** Explicit update / supersede / force-record protocol for v0.5.6. */
import { findSimilarMemories } from './similarity.js';
function requireTarget(store, cwd, targetId, candidates) {
    if (targetId === undefined || targetId.trim() === '') {
        throw new Error('targetId is required for update or supersede');
    }
    if (!candidates.some((candidate) => candidate.entry.id === targetId)) {
        throw new Error('targetId must identify one of the current similarity candidates');
    }
    const target = store.entries(cwd).find((entry) => entry.id === targetId);
    if (target === undefined)
        throw new Error('找不到待处理的相似记忆：' + targetId);
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
    const candidates = findSimilarMemories(retrieval, cwd, payload);
    if (options.resolution === undefined && options.targetId !== undefined) {
        throw new Error('targetId requires an explicit resolution');
    }
    if (options.resolution === undefined && candidates.length > 0) {
        return { action: 'needs-resolution', recorded: false, candidates };
    }
    if (options.resolution === 'update') {
        const target = requireTarget(store, cwd, options.targetId, candidates);
        const entry = store.update(cwd, target.id, updatePatch(payload));
        if (entry === undefined)
            throw new Error('找不到待更新的相似记忆：' + target.id);
        return { action: 'updated', recorded: false, entry, candidates };
    }
    if (options.resolution === 'supersede') {
        const target = requireTarget(store, cwd, options.targetId, candidates);
        const supersedes = [...new Set([...(payload.supersedes ?? []), target.id])];
        const entry = store.record(cwd, { ...payload, supersedes }, options.source);
        return { action: 'superseded', recorded: true, entry, candidates };
    }
    if (options.resolution === 'force-record') {
        if (options.targetId !== undefined)
            throw new Error('targetId is not used with force-record');
        const entry = store.record(cwd, payload, options.source);
        return { action: 'force-recorded', recorded: true, entry, candidates };
    }
    const entry = store.record(cwd, payload, options.source);
    return { action: 'recorded', recorded: true, entry, candidates: [] };
}
