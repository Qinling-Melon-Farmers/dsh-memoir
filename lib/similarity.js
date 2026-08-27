/**
 * Similar-memory governance for v0.5.6.
 *
 * Retrieval remains lexical and local: the existing BM25 index supplies a
 * small candidate set, then query-relative BM25, title similarity, and Token
 * Jaccard are fused into an explainable score. The classifier is deliberately
 * conservative: it only surfaces duplicate/conflict candidates and never
 * mutates the store by itself.
 */
import { tokenizeQuery } from './retrieval.js';
/** Public calibration constants: fixed-set tests guard changes to these gates. */
export const SIMILARITY_POLICY = {
    retrievalCandidates: 24,
    outputCandidates: 5,
    duplicateTokenJaccard: 0.78,
    duplicateExactTitleTokenJaccard: 0.45,
    conflictTitleSimilarity: 0.62,
    conflictTokenJaccard: 0.24,
    conflictUntitledTokenJaccard: 0.5,
};
function normalizeText(value) {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
}
function tokenSet(value) {
    return new Set(tokenizeQuery(value));
}
/** Jaccard overlap of the same multilingual/code/path tokens used by BM25. */
export function tokenJaccard(left, right) {
    const a = tokenSet(left);
    const b = tokenSet(right);
    if (a.size === 0 || b.size === 0)
        return 0;
    let intersection = 0;
    for (const token of a)
        if (b.has(token))
            intersection++;
    return intersection / (a.size + b.size - intersection);
}
/** Exact-normalized title match, otherwise title Token Jaccard. */
export function titleSimilarity(left, right) {
    if (left === undefined || right === undefined)
        return 0;
    const a = normalizeText(left);
    const b = normalizeText(right);
    if (a === '' || b === '')
        return 0;
    return a === b ? 1 : tokenJaccard(a, b);
}
function roundScore(value) {
    return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}
function combinedText(value) {
    return `${value.title ?? ''}\n${value.content}`.trim();
}
function classify(payload, ranked, bm25) {
    const entry = ranked.entry;
    const incomingContent = normalizeText(payload.content);
    const existingContent = normalizeText(entry.content);
    const exactContent = incomingContent !== '' && incomingContent === existingContent;
    const incomingTitle = payload.title === undefined ? '' : normalizeText(payload.title);
    const existingTitle = entry.title === undefined ? '' : normalizeText(entry.title);
    const exactTitle = incomingTitle !== '' && incomingTitle === existingTitle;
    const title = titleSimilarity(payload.title, entry.title);
    const tokens = tokenJaccard(combinedText(payload), combinedText(entry));
    const score = roundScore(0.3 * bm25 + 0.35 * title + 0.35 * tokens);
    const duplicate = exactContent
        || tokens >= SIMILARITY_POLICY.duplicateTokenJaccard
        || (exactTitle && tokens >= SIMILARITY_POLICY.duplicateExactTitleTokenJaccard);
    const conflict = !duplicate && (exactTitle
        || (title >= SIMILARITY_POLICY.conflictTitleSimilarity && tokens >= SIMILARITY_POLICY.conflictTokenJaccard)
        || (incomingTitle === '' && existingTitle === '' && tokens >= SIMILARITY_POLICY.conflictUntitledTokenJaccard && bm25 >= 0.5));
    if (!duplicate && !conflict)
        return undefined;
    const reasons = [];
    if (exactContent)
        reasons.push('exact-content');
    if (exactTitle)
        reasons.push('exact-title');
    else if (title >= SIMILARITY_POLICY.conflictTitleSimilarity)
        reasons.push('high-title-overlap');
    if (tokens >= SIMILARITY_POLICY.conflictTokenJaccard)
        reasons.push('high-token-overlap');
    if (bm25 >= 0.5)
        reasons.push('bm25-candidate');
    if (conflict)
        reasons.push('same-topic-different-content');
    return {
        kind: duplicate ? 'duplicate' : 'conflict',
        score,
        components: { bm25: roundScore(bm25), title: roundScore(title), tokenJaccard: roundScore(tokens) },
        reasons,
    };
}
/**
 * Return only actionable duplicate/conflict candidates for a prospective
 * record. Raw BM25 is normalized against this query's strongest hit because
 * BM25 magnitudes are not comparable across different queries.
 */
export function findSimilarMemories(retrieval, cwd, payload, limit = SIMILARITY_POLICY.outputCandidates) {
    const query = combinedText(payload).slice(0, 4_000);
    if (tokenizeQuery(query).length === 0)
        return [];
    const ranked = retrieval.cachedSearch(query, { cwd, status: 'active' }).slice(0, SIMILARITY_POLICY.retrievalCandidates);
    const maxBm25 = ranked.reduce((max, candidate) => Math.max(max, candidate.score), 0);
    if (maxBm25 <= 0)
        return [];
    return ranked
        .flatMap((candidate) => {
        const classification = classify(payload, candidate, candidate.score / maxBm25);
        return classification === undefined
            ? []
            : [{ ...classification, entry: candidate.entry, projectPath: candidate.projectPath }];
    })
        .sort((a, b) => {
        if (a.kind !== b.kind)
            return a.kind === 'duplicate' ? -1 : 1;
        return b.score - a.score || b.entry.time - a.entry.time || a.entry.id.localeCompare(b.entry.id);
    })
        .slice(0, Math.max(1, Math.floor(limit)));
}
