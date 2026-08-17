/**
 * Session memory snapshot manager (roadmap §2.2) — freezes the project
 * memory injected into a session's system prompt so that the prompt prefix
 * stays stable for the whole session. The current session does NOT re-consume
 * memory it just wrote: later assemblies reuse the first snapshot; a NEW
 * session builds a fresh one and sees the new memory.
 *
 * This is what maximizes prompt-prefix cache hits — the goal is stable model
 * input, not just fast reads (the store snapshot cache already covers those).
 *
 * Pure logic, unit-testable without any runtime dependency.
 */
/** One frozen per-session memory snapshot. */
export interface SessionSnapshot {
    /** Stable identity of the session (id + workspace). */
    sessionKey: string;
    /** Store revision the snapshot was built from. */
    storeRevision: number;
    /** The injected memory text (frozen until the session ends). */
    text: string;
    /** Truncated SHA-256 of text — the prompt-stability hash. */
    hash: string;
    /** When the snapshot was created. */
    createdAt: number;
}
/** Hash a text for prompt-stability comparison (truncated SHA-256). */
export declare function snapshotHash(text: string): string;
/**
 * Freezes one session's injected memory; bounded by a simple LRU (oldest
 * snapshot evicted past the cap), so long-running processes never accumulate
 * dead session entries.
 */
export declare class MemorySnapshotManager {
    /** Live session snapshots in LRU order (most recent last). */
    private readonly snapshots;
    private readonly max;
    /**
     * @param options.max - LRU cap (default 128; config sessionSnapshotMax).
     */
    constructor(options?: {
        max?: number;
    });
    /** Current snapshot count (diagnostics). */
    get size(): number;
    /** The LRU cap this manager was created with. */
    get cap(): number;
    /**
     * Return the session's frozen snapshot, or build one via builder.
     * A later call for the same key ALWAYS returns the first snapshot — even
     * if the store revision moved on (that is the point: stable prompt prefix).
     *
     * @param sessionKey - stable session identity (id + workspace).
     * @param builder - builds { storeRevision, text } when no snapshot exists.
     */
    getOrCreate(sessionKey: string, builder: () => {
        storeRevision: number;
        text: string;
    }): SessionSnapshot;
    /** Peek at a session's snapshot (undefined when not frozen yet). */
    peek(sessionKey: string): SessionSnapshot | undefined;
    /** The most recently created snapshot (diagnostics / inspector). */
    latest(): SessionSnapshot | undefined;
    /** Drop one session's snapshot (disposal hygiene). */
    forget(sessionKey: string): void;
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
export declare function sessionKeyOf(context: {
    agent?: {
        id?: string;
        session?: {
            id?: string;
            header?: {
                cwd?: string;
            };
        };
    };
}): string | undefined;
