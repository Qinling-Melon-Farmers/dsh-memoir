/**
 * Structured memory store for dsh-memoir — the single source of truth is the
 * global index JSON ($DSH_HOME/dsh-memoir.json, defaulting to ~/.dsh); the
 * per-project PROJECT_MEMORY.md is a regenerated human-readable rendering of
 * the same entries (git-friendly, auto-injected into future sessions). Pure
 * node:fs, no cordis dependency —
 * unit-testable with an injected path.
 *
 * v0.3.1: revision-based in-memory snapshot cache — cold start reads the file
 * once, warm reads return the snapshot without touching disk, writes bump the
 * revision and refresh the snapshot; external file changes are picked up by a
 * low-frequency mtime probe. Corrupt JSON is backed up (never silently
 * overwritten), atomic writes use unique temp names, and project keys are
 * normalized (drive-letter case + separators) so C:\A / c:\a\ / C:/A share
 * one bucket.
 */
/** Global index format version. */
export declare const FORMAT_VERSION = 4;
/** Project memory file name (workspace root, git-committable). */
export declare const PROJECT_FILE = "PROJECT_MEMORY.md";
/** Section keys, human labels, and markdown headers (fixed order for rendering). */
export declare const SECTIONS: Record<SectionKey, {
    label: string;
    header: string;
}>;
/** Section keys in canonical render order. */
export declare const SECTION_KEYS: SectionKey[];
/**
 * Legacy cap on how much project memory was auto-injected into the prompt,
 * in JS string length (not bytes, not tokens). Kept for compatibility with
 * existing imports; v0.4+ replaces this with the selector's token budget
 * (targetTokens / hardMaxTokens).
 */
export declare const INJECT_LIMIT = 16000;
export type SectionKey = 'work' | 'lessons' | 'actions' | 'note';
/** Lifecycle state for one memory entry (v0.5.0). */
export type MemoirStatus = 'active' | 'superseded' | 'archived';
export declare const MEMOIR_STATUSES: MemoirStatus[];
/** Trusted origin of one memory entry (v0.5.6 / store format v4). */
export interface MemoirSource {
    /** DSH session / agent id that produced the memory. */
    sessionId?: string;
    /** DSH turn number containing the memoir_record call. */
    turnId?: number;
}
/** One structured memory entry. */
export interface MemoirEntry {
    id: string;
    section: SectionKey;
    title?: string;
    content: string;
    time: number;
    source?: MemoirSource;
    importance?: number;
    pinned?: boolean;
    status?: MemoirStatus;
    supersedes?: string[];
    tags?: string[];
}
/** One project's bucket in the global index. */
export interface MemoirProject {
    path: string;
    title: string;
    updatedAt: number;
    entries: MemoirEntry[];
}
/** The persisted store file shape. */
export interface MemoirStoreFile {
    version: number;
    projects: Record<string, MemoirProject>;
}
/** A record payload accepted from tools and the panel API. */
export interface EntryPayload {
    section: SectionKey;
    title?: string;
    content: string;
    importance?: number;
    pinned?: boolean;
    supersedes?: string[];
    tags?: string[];
}
/** Mutable fields for an existing memory entry (v0.5 lifecycle). */
export interface EntryUpdate {
    section?: SectionKey;
    /** Empty string or null removes the title. */
    title?: string | null;
    content?: string;
    importance?: number;
    pinned?: boolean;
    status?: MemoirStatus;
    supersedes?: string[];
    tags?: string[];
}
/** An in-memory snapshot of the store at one revision. */
export interface StoreSnapshot {
    /** Write revision this snapshot reflects (bumped only by save()). */
    revision: number;
    /** Snapshot epoch: bumped on every snapshot (re)build — external changes
     *  and first loads included — so consumers can key caches on it. */
    epoch: number;
    /** The parsed (normalized) store file. */
    file: MemoirStoreFile;
    /** Disk signature backing the snapshot; null when the file was absent. */
    stat: {
        mtimeMs: number;
        size: number;
    } | null;
}
/** Cache/IO counters exposed for diagnostics and cache-hit-rate tests. */
export interface CacheStats {
    /** Current write revision (bumped by record/remove). */
    revision: number;
    /** Current snapshot epoch (bumped on every snapshot (re)build). */
    epoch: number;
    /** Total load() calls. */
    loads: number;
    /** Warm reads served straight from the snapshot (no file read). */
    hits: number;
    /** Cold reads / rebuilds that consulted the file. */
    misses: number;
    /** hits / loads, in [0, 1]. */
    hitRate: number;
    /** Full file reads (parse) since construction. */
    fileReads: number;
    /** mtime stat probes issued against the store file. */
    statProbes: number;
    /** Corrupt store files that were backed up instead of overwritten. */
    corruptBackups: number;
    /** renderMarkdown() calls. */
    renders: number;
    /** Actual markdown recomputations. */
    renderComputes: number;
    /** (renders - renderComputes) / renders, in [0, 1]. */
    renderHitRate: number;
    /** Duration of the last cold load in milliseconds. */
    lastLoadMs?: number;
}
/** How often (ms) warm load() calls re-probe the file mtime; 0 = every call. */
export declare const DEFAULT_MTIME_CHECK_MS = 2000;
/** Default store location: $DSH_HOME/dsh-memoir.json (fallback ~/.dsh). */
export declare function defaultStorePath(): string;
/** Cross-process mutation lock defaults (roadmap §2.2). */
export declare const DEFAULT_LOCK_RETRY_MS = 25;
export declare const DEFAULT_LOCK_TIMEOUT_MS = 5000;
export declare const DEFAULT_LOCK_STALE_AFTER_MS = 60000;
/**
 * Run fn while holding an exclusive lock file created with openSync('wx')
 * (atomic O_EXCL create, no race window). Retries every retryMs until
 * timeoutMs, then throws. The lock is always released in finally — even
 * when fn throws. Used to serialize read-modify-write store mutations
 * across processes sharing one ~/.dsh/dsh-memoir.json.
 */
export declare function withFileLock<T>(lockPath: string, fn: () => T, options?: {
    retryMs?: number;
    timeoutMs?: number;
    staleAfterMs?: number;
}): T;
/** `YYYY-MM-DD HH:mm` in local time. */
export declare function formatTime(ms: number): string;
/**
 * Normalize one workspace path into a stable key:
 * strip trailing separators, unify separators to '/'. Windows drive paths
 * are FULLY lowercased (v0.4.2) — the canonical bucket key of C:\A /
 * c:\a\ / C:/A is 'c:/a', so all case variants share one bucket. The
 * display path stored on the project keeps its original case. POSIX paths
 * are unchanged apart from trailing separators.
 */
export declare function projectKey(cwd: string): string;
/** Project display title: the last path segment. */
export declare function projectTitle(cwd: string): string;
/** Atomic write (unique tmp name + rename), creating the parent dir. */
export declare function writeFileAtomic(path: string, content: string, mode?: number): void;
/** Trim a long text to a bounded tail for prompt injection. */
export declare function bounded(value: string, limit: number): string;
/** Validate one record payload; returns an error message or undefined. */
export declare function validateEntryPayload(payload: unknown): string | undefined;
/** Validate a partial update without requiring the immutable record fields. */
export declare function validateEntryUpdate(payload: unknown): string | undefined;
/**
 * The structured memory store.
 */
export declare class MemoirStore {
    /** The store file path. */
    readonly path: string;
    /** How often warm load() calls re-probe the file mtime (0 = every call). */
    readonly mtimeCheckIntervalMs: number;
    /** Cross-process mutation lock retry interval (withFileLock). */
    readonly lockRetryMs: number;
    /** Cross-process mutation lock acquisition timeout (withFileLock). */
    readonly lockTimeoutMs: number;
    /** Cross-process stale lock reclaim threshold. */
    readonly lockStaleAfterMs: number;
    /** The in-memory snapshot backing warm reads. */
    private snapshot;
    /** Write counter; bumped on every save() (record/remove). */
    private revision;
    /** Snapshot-rebuild counter; bumped on every snapshot (re)build. */
    private epoch;
    /** Timestamp of the last mtime probe (throttles external-change checks). */
    private lastMtimeCheck;
    private loadCount;
    private hitCount;
    private fileReadCount;
    private statProbeCount;
    private corruptBackupCount;
    private lastLoadMs;
    /** renderMarkdown cache: project key → { signature, markdown }. */
    private renderCache;
    private renderCount;
    private renderComputeCount;
    /**
     * @param path - store file path (defaults to the standard location).
     * @param options.mtimeCheckIntervalMs - mtime probe throttle; 0 probes on
     *   every load (tests), defaults to a low-frequency 2000ms.
     * @param options.lockRetryMs / lockTimeoutMs - cross-process mutation lock
     *   tuning (tests shrink these; defaults 25ms / 5000ms).
     */
    constructor(path?: string, options?: {
        mtimeCheckIntervalMs?: number;
        lockRetryMs?: number;
        lockTimeoutMs?: number;
        lockStaleAfterMs?: number;
    });
    /** The cross-process lock file guarding mutations of this store. */
    private lockFilePath;
    /**
     * Run one read-modify-write mutation inside the cross-process lock.
     * Inside the critical section the in-memory snapshot is dropped and the
     * store is re-read from disk, so a process whose snapshot went stale
     * mutates the latest on-disk state (no lost update between processes).
     */
    private mutateLocked;
    /** Current store revision (0 before the first load/save). */
    currentRevision(): number;
    /** Stat the store file into the snapshot signature (null when absent). */
    private statNow;
    /**
     * Load and normalize the store.
     *
     * Revision-based snapshot cache: the first call of a process reads and
     * parses the file; every later call returns the in-memory snapshot without
     * touching disk. External file changes (another dsh process) are picked up
     * by a low-frequency mtime probe (mtimeCheckIntervalMs). Absence is
     * negatively cached the same way. Corrupt JSON is renamed to a
     * `.corrupt.<timestamp>` backup before the store starts fresh.
     */
    load(): MemoirStoreFile;
    /** Normalize a parsed store file: mint ids, coerce shapes, merge duplicate
     *  buckets that normalize to the same project key (legacy Windows variants). */
    private normalize;
    /** Persist the store atomically (0600 — may contain user's notes). */
    save(file: MemoirStoreFile): void;
    /** Drop the snapshot so the next load() re-reads and re-parses the file. */
    invalidate(): void;
    /** Cache/IO counters (diagnostics + tests). */
    stats(): CacheStats;
    /** One project record, or undefined. */
    project(cwd: string): MemoirProject | undefined;
    /** Entries of one project in insertion order. */
    entries(cwd: string): MemoirEntry[];
    /** Compact per-project summaries (path, title, entry count, updatedAt). */
    listProjects(): Array<{
        key: string;
        path: string;
        title: string;
        count: number;
        updatedAt: number;
    }>;
    /** Append one entry and regenerate the project markdown. Returns the entry. */
    record(cwd: string, payload: EntryPayload, source?: MemoirSource | string): MemoirEntry;
    /** Remove one entry by id; regenerates the project markdown. */
    remove(cwd: string, id: string): boolean;
    /** Update an existing entry without deleting its id or creation time. */
    update(cwd: string, id: string, patch: EntryUpdate): MemoirEntry | undefined;
    /** Render one entry as a markdown bullet line. */
    renderEntryLine(entry: MemoirEntry): string;
    /** Cheap O(1) signature of one project's entries (count + tail id/time). */
    private renderSignature;
    /** Regenerate the full PROJECT_MEMORY.md content for one project. */
    renderMarkdown(cwd: string): string;
    /** Pure markdown assembly for one project's entries (no cache access). */
    private renderMarkdownNow;
    /** Absolute path of one project's memory file (no write). */
    projectFilePath(cwd: string): string;
    /** Regenerate and write the project memory file; returns its path. */
    writeProjectFile(cwd: string): string;
}
/** SHA-256 hex digest of a string, truncated for prompt-stability hashing. */
export declare function sha256(text: string, length?: number): string;
