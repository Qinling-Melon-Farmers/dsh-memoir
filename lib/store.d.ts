/**
 * Structured memory store for dsh-memoir — the single source of truth is the
 * global index JSON (~/.dsh/dsh-memoir.json); the per-project PROJECT_MEMORY.md
 * is a regenerated human-readable rendering of the same entries (git-friendly,
 * auto-injected into future sessions). Pure node:fs, no cordis dependency —
 * unit-testable with an injected path.
 */
/** Global index format version. */
export declare const FORMAT_VERSION = 2;
/** Project memory file name (workspace root, git-committable). */
export declare const PROJECT_FILE = "PROJECT_MEMORY.md";
/** Section keys, human labels, and markdown headers (fixed order for rendering). */
export declare const SECTIONS: Record<SectionKey, {
    label: string;
    header: string;
}>;
/** Section keys in canonical render order. */
export declare const SECTION_KEYS: SectionKey[];
/** Cap on how much project memory is auto-injected into the prompt (bytes). */
export declare const INJECT_LIMIT = 16000;
export type SectionKey = 'work' | 'lessons' | 'actions' | 'note';
/** One structured memory entry. */
export interface MemoirEntry {
    id: string;
    section: SectionKey;
    title?: string;
    content: string;
    time: number;
    sessionId?: string;
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
}
/** Default store location: <home>/.dsh/dsh-memoir.json. */
export declare function defaultStorePath(): string;
/** `YYYY-MM-DD HH:mm` in local time. */
export declare function formatTime(ms: number): string;
/** Normalize one workspace path into a stable key (strip trailing separators). */
export declare function projectKey(cwd: string): string;
/** Project display title: the last path segment. */
export declare function projectTitle(cwd: string): string;
/** Atomic write (tmp + rename), creating the parent dir. */
export declare function writeFileAtomic(path: string, content: string, mode?: number): void;
/** Trim a long text to a bounded tail for prompt injection. */
export declare function bounded(value: string, limit: number): string;
/** Validate one record payload; returns an error message or undefined. */
export declare function validateEntryPayload(payload: unknown): string | undefined;
/**
 * The structured memory store.
 */
export declare class MemoirStore {
    /** The store file path. */
    readonly path: string;
    /**
     * @param path - store file path (defaults to the standard location).
     */
    constructor(path?: string);
    /** Load and normalize the store (fresh empty store on absence/corruption). */
    load(): MemoirStoreFile;
    /** Persist the store atomically (0600 — may contain user's notes). */
    save(file: MemoirStoreFile): void;
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
    record(cwd: string, payload: EntryPayload, sessionId?: string): MemoirEntry;
    /** Remove one entry by id; regenerates the project markdown. */
    remove(cwd: string, id: string): boolean;
    /** Render one entry as a markdown bullet line. */
    renderEntryLine(entry: MemoirEntry): string;
    /** Regenerate the full PROJECT_MEMORY.md content for one project. */
    renderMarkdown(cwd: string): string;
    /** Regenerate and write the project memory file; returns its path. */
    writeProjectFile(cwd: string): string;
}
