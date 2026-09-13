/**
 * Session memory snapshot manager (roadmap §2.2) — freezes the project
 * memory injected into a session's system prompt so that the prompt prefix
 * stays stable while its snapshot is available. The host injects durable
 * persistence so restarts and RAM eviction reuse the original text; storage
 * failures fall back to a diagnosed process-local snapshot. The session does NOT re-consume
 * memory it just wrote: later assemblies reuse the first snapshot; a NEW
 * session builds a fresh one and sees the new memory.
 *
 * This is what maximizes prompt-prefix cache hits — the goal is stable model
 * input, not just fast reads (the store snapshot cache already covers those).
 *
 * Pure logic, unit-testable without any runtime dependency.
 */
import { createHash } from 'node:crypto';
/** Hash a text for prompt-stability comparison (truncated SHA-256). */
export function snapshotHash(text) {
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
/**
 * Bounded resident LRU over optional durable snapshots. RAM eviction never
 * deletes persistent records; callers without persistence retain legacy behavior.
 */
export class MemorySnapshotManager {
    /** Live session snapshots in LRU order (most recent last). */
    snapshots = new Map();
    max;
    persistence;
    scope;
    /**
     * @param options.max - LRU cap (default 128; config sessionSnapshotMax).
     */
    constructor(options = {}) {
        this.max = options.max ?? 128;
        this.persistence = options.persistence;
    }
    /** Current snapshot count (diagnostics). */
    get size() {
        return this.snapshots.size;
    }
    /** The LRU cap this manager was created with. */
    get cap() {
        return this.max;
    }
    /**
     * Change the live LRU cap and evict oldest snapshots immediately when the
     * new cap is smaller. Existing snapshots that remain are never rebuilt, so
     * prompt-prefix stability is preserved.
     */
    resize(max) {
        this.max = Math.max(1, Math.floor(max));
        this.evictPastCap();
    }
    evictPastCap() {
        while (this.snapshots.size > this.max) {
            const oldest = this.snapshots.keys().next().value;
            if (oldest === undefined)
                break;
            this.snapshots.delete(oldest);
        }
    }
    /**
     * Return the session's frozen snapshot, or build one via builder.
     * A retained/recoverable key returns its original snapshot despite store
     * revisions. Missing durable records establish a new baseline once.
     *
     * @param sessionKey - stable session identity (id + workspace).
     * @param builder - builds { storeRevision, text } when no snapshot exists.
     */
    getOrCreate(sessionKey, builder) {
        const scope = this.persistence?.scope();
        if (scope !== this.scope) {
            this.snapshots.clear();
            this.scope = scope;
        }
        const existing = this.snapshots.get(sessionKey);
        if (existing !== undefined) {
            // Refresh LRU recency.
            this.snapshots.delete(sessionKey);
            this.snapshots.set(sessionKey, existing);
            return existing;
        }
        const create = () => {
            const built = builder();
            return Object.freeze({
                sessionKey,
                storeRevision: built.storeRevision,
                text: built.text,
                hash: snapshotHash(built.text),
                createdAt: Date.now(),
            });
        };
        const snapshot = this.persistence?.getOrCreate(sessionKey, create) ?? create();
        this.snapshots.set(sessionKey, snapshot);
        // Evict the oldest entry when past the cap.
        this.evictPastCap();
        return snapshot;
    }
    /** Peek at a session's snapshot (undefined when not frozen yet). */
    peek(sessionKey) {
        return this.snapshots.get(sessionKey);
    }
    /** The most recently created snapshot (diagnostics / inspector). */
    latest() {
        let latest;
        for (const snapshot of this.snapshots.values())
            latest = snapshot;
        return latest;
    }
    /** Drop one resident snapshot; durable storage remains available on next access. */
    forget(sessionKey) {
        this.snapshots.delete(sessionKey);
    }
    /** Clear resident snapshots; the durable language namespace remains intact. */
    clear() {
        this.snapshots.clear();
    }
}
/**
 * Derive a stable session key from the system-prompt assemble context:
 * prefer the session id, then the agent id; always scoped by the workspace
 * cwd. Returns undefined when no unique identity is known — no freezing then,
 * every assembly builds fresh.
 *
 * v0.4.2: the cwd-only fallback was removed. A key of the form "cwd:<path>"
 * is shared by every session of that workspace, so session A's frozen
 * snapshot would be served to session B, hiding memory session A itself
 * wrote. Without a unique session identity, cache miss beats cache
 * corruption: freeze nothing, rebuild every assembly.
 */
export function sessionKeyOf(context) {
    const agent = context.agent;
    const cwd = agent?.session?.header?.cwd;
    const cwdPart = typeof cwd === 'string' && cwd !== '' ? cwd : '';
    const id = agent?.session?.id ?? agent?.id;
    if (typeof id === 'string' && id !== '')
        return id + '|' + cwdPart;
    return undefined;
}
