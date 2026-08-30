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
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveDshHome } from './dsh-home.js';
import { DEFAULT_MEMOIR_LANGUAGE, hostCopy, languageFrom, sectionCopy } from './i18n.js';
/** Global index format version. */
export const FORMAT_VERSION = 4;
/** Project memory file name (workspace root, git-committable). */
export const PROJECT_FILE = 'PROJECT_MEMORY.md';
/** Section keys, human labels, and markdown headers (fixed order for rendering). */
export const SECTIONS = {
    work: { label: '工作记录', header: '## 工作记录 Work Log' },
    lessons: { label: '经验教训', header: '## 经验教训 Lessons Learned' },
    actions: { label: '行动指南', header: '## 行动指南 Action Guide' },
    note: { label: '备注', header: '## 备注 Notes' },
};
/** Section keys in canonical render order. */
export const SECTION_KEYS = Object.keys(SECTIONS);
/**
 * Legacy cap on how much project memory was auto-injected into the prompt,
 * in JS string length (not bytes, not tokens). Kept for compatibility with
 * existing imports; v0.4+ replaces this with the selector's token budget
 * (targetTokens / hardMaxTokens).
 */
export const INJECT_LIMIT = 16000;
export const MEMOIR_STATUSES = ['active', 'superseded', 'archived'];
/** How often (ms) warm load() calls re-probe the file mtime; 0 = every call. */
export const DEFAULT_MTIME_CHECK_MS = 2000;
/** Default store location: $DSH_HOME/dsh-memoir.json (fallback ~/.dsh). */
export function defaultStorePath() {
    return join(resolveDshHome(), 'dsh-memoir.json');
}
/** Cross-process mutation lock defaults (roadmap §2.2). */
export const DEFAULT_LOCK_RETRY_MS = 25;
export const DEFAULT_LOCK_TIMEOUT_MS = 5000;
export const DEFAULT_LOCK_STALE_AFTER_MS = 60_000;
/** Blocking sleep for short lock retries. */
function sleepSync(ms) {
    const buffer = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(buffer, 0, 0, ms);
}
/**
 * Run fn while holding an exclusive lock file created with openSync('wx')
 * (atomic O_EXCL create, no race window). Retries every retryMs until
 * timeoutMs, then throws. The lock is always released in finally — even
 * when fn throws. Used to serialize read-modify-write store mutations
 * across processes sharing one ~/.dsh/dsh-memoir.json.
 */
export function withFileLock(lockPath, fn, options = {}) {
    const retryMs = options.retryMs ?? DEFAULT_LOCK_RETRY_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    const staleAfterMs = options.staleAfterMs ?? DEFAULT_LOCK_STALE_AFTER_MS;
    const started = Date.now();
    let fd = null;
    for (;;) {
        try {
            const candidate = openSync(lockPath, 'wx');
            try {
                writeFileSync(candidate, JSON.stringify({ pid: process.pid, createdAt: Date.now(), nonce: randomBytes(8).toString('hex') }));
            }
            catch (error) {
                try {
                    closeSync(candidate);
                }
                catch { /* best effort */ }
                try {
                    unlinkSync(lockPath);
                }
                catch { /* best effort */ }
                throw error;
            }
            fd = candidate;
            break;
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
            if (reclaimableStaleLock(lockPath, staleAfterMs))
                continue;
            if (Date.now() - started >= timeoutMs) {
                throw new Error('dsh-memoir: store lock timeout after ' + timeoutMs + 'ms (' + lockPath + ') — another process may hold a stale lock');
            }
            sleepSync(retryMs);
        }
    }
    try {
        return fn();
    }
    finally {
        try {
            closeSync(fd);
        }
        catch {
            // already closed
        }
        try {
            unlinkSync(lockPath);
        }
        catch {
            // already released
        }
    }
}
/** Return true only for a well-formed, old lock owned by a dead process. */
function reclaimableStaleLock(lockPath, staleAfterMs) {
    try {
        const raw = JSON.parse(readFileSync(lockPath, 'utf8'));
        if (typeof raw !== 'object' || raw === null)
            return false;
        const metadata = raw;
        if (!Number.isInteger(metadata.pid) || metadata.pid <= 0 || typeof metadata.createdAt !== 'number' || !Number.isFinite(metadata.createdAt) || typeof metadata.nonce !== 'string' || metadata.nonce === '')
            return false;
        if (Date.now() - metadata.createdAt <= staleAfterMs)
            return false;
        try {
            process.kill(metadata.pid, 0);
            return false;
        }
        catch (error) {
            if (error.code === 'EPERM')
                return false;
            if (error.code !== 'ESRCH')
                return false;
        }
        const confirm = JSON.parse(readFileSync(lockPath, 'utf8'));
        if (confirm.nonce !== metadata.nonce || confirm.createdAt !== metadata.createdAt)
            return false;
        unlinkSync(lockPath);
        return true;
    }
    catch {
        // Malformed/unreadable locks are fail-safe and will expire by timeout.
        return false;
    }
}
/** `YYYY-MM-DD HH:mm` in local time. */
export function formatTime(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/**
 * Normalize one workspace path into a stable key:
 * strip trailing separators, unify separators to '/'. Windows drive paths
 * are FULLY lowercased (v0.4.2) — the canonical bucket key of C:\A /
 * c:\a\ / C:/A is 'c:/a', so all case variants share one bucket. The
 * display path stored on the project keeps its original case. POSIX paths
 * are unchanged apart from trailing separators.
 */
export function projectKey(cwd) {
    const raw = String(cwd).replace(/[\\/]+$/, '');
    const drive = /^([A-Za-z]):/.exec(raw);
    if (drive === null)
        return raw;
    return (drive[1] + ':' + raw.slice(2)).toLowerCase().replace(/\\/g, '/');
}
/** Project display title: the last path segment. */
export function projectTitle(cwd) {
    return projectKey(cwd).split('/').filter(Boolean).pop() || projectKey(cwd);
}
/** Mint one entry id (opaque, locally unique). */
function mintId() {
    return randomBytes(6).toString('hex');
}
/** Mint a unique temp-file suffix (avoids concurrent-write collisions). */
function tmpSuffix() {
    return `${process.pid}.${randomBytes(4).toString('hex')}`;
}
/** Atomic write (unique tmp name + rename), creating the parent dir. */
export function writeFileAtomic(path, content, mode = 0o644) {
    const dir = dirname(path);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${path}.tmp.${tmpSuffix()}`;
    try {
        writeFileSync(tmp, content, { encoding: 'utf8', mode });
        renameSync(tmp, path);
    }
    catch (error) {
        try {
            if (existsSync(tmp))
                renameSync(tmp, tmp + '.failed');
        }
        catch {
            // best effort: never mask the original write error
        }
        throw error;
    }
}
/** Trim a long text to a bounded tail for prompt injection. */
export function bounded(value, limit) {
    if (value.length <= limit)
        return value;
    return `…（内容较长，仅显示最近 ${limit} 字节）…\n` + value.slice(-limit);
}
/** Validate one record payload; returns an error message or undefined. */
export function validateEntryPayload(payload, language = 'en') {
    const copy = hostCopy(language).validation;
    if (typeof payload !== 'object' || payload === null)
        return copy.payloadObject;
    const record = payload;
    if (typeof record.section !== 'string' || !Object.prototype.hasOwnProperty.call(SECTIONS, record.section)) {
        return copy.section(SECTION_KEYS.join('/'));
    }
    if (typeof record.content !== 'string' || record.content.trim() === '')
        return copy.contentRequired;
    if (record.title !== undefined && (typeof record.title !== 'string' || record.title.length > 200)) {
        return copy.title;
    }
    if (record.importance !== undefined && (!Number.isInteger(record.importance) || record.importance < 1 || record.importance > 5)) {
        return copy.importance;
    }
    if (record.pinned !== undefined && typeof record.pinned !== 'boolean')
        return copy.pinned;
    if (record.supersedes !== undefined && (!Array.isArray(record.supersedes) || record.supersedes.some((id) => typeof id !== 'string' || id.trim() === ''))) {
        return copy.supersedes;
    }
    if (record.tags !== undefined && (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== 'string' || tag.trim() === ''))) {
        return copy.tags;
    }
    return undefined;
}
/** Validate a partial update without requiring the immutable record fields. */
export function validateEntryUpdate(payload, language = 'en') {
    const copy = hostCopy(language).validation;
    if (typeof payload !== 'object' || payload === null)
        return copy.patchObject;
    const patch = payload;
    const fields = ['section', 'title', 'content', 'importance', 'pinned', 'status', 'supersedes', 'tags'];
    if (!fields.some((field) => Object.prototype.hasOwnProperty.call(patch, field)))
        return copy.updateRequired;
    if (patch.section !== undefined && (typeof patch.section !== 'string' || !Object.prototype.hasOwnProperty.call(SECTIONS, patch.section))) {
        return copy.section(SECTION_KEYS.join('/'));
    }
    if (patch.title !== undefined && patch.title !== null && (typeof patch.title !== 'string' || patch.title.length > 200)) {
        return copy.titleOrNull;
    }
    if (patch.content !== undefined && (typeof patch.content !== 'string' || patch.content.trim() === ''))
        return copy.contentNotEmpty;
    if (patch.importance !== undefined && (!Number.isInteger(patch.importance) || patch.importance < 1 || patch.importance > 5)) {
        return copy.importance;
    }
    if (patch.pinned !== undefined && typeof patch.pinned !== 'boolean')
        return copy.pinned;
    if (patch.status !== undefined && (typeof patch.status !== 'string' || !MEMOIR_STATUSES.includes(patch.status))) {
        return copy.status(MEMOIR_STATUSES.join('/'));
    }
    if (patch.supersedes !== undefined && (!Array.isArray(patch.supersedes) || patch.supersedes.some((id) => typeof id !== 'string' || id.trim() === ''))) {
        return copy.supersedes;
    }
    if (patch.tags !== undefined && (!Array.isArray(patch.tags) || patch.tags.some((tag) => typeof tag !== 'string' || tag.trim() === ''))) {
        return copy.tags;
    }
    return undefined;
}
function normalizedImportance(value) {
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 3;
}
function normalizedStrings(value) {
    if (!Array.isArray(value))
        return undefined;
    const values = [...new Set(value.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()))];
    return values.length > 0 ? values : undefined;
}
/** Normalize v4 source metadata, lazily lifting the legacy top-level sessionId. */
function normalizedSource(value, legacySessionId) {
    const source = typeof value === 'object' && value !== null ? value : {};
    const sessionId = typeof source.sessionId === 'string' && source.sessionId.trim() !== ''
        ? source.sessionId.trim()
        : typeof legacySessionId === 'string' && legacySessionId.trim() !== ''
            ? legacySessionId.trim()
            : undefined;
    const turnId = Number.isSafeInteger(source.turnId) && source.turnId >= 1
        ? source.turnId
        : undefined;
    if (sessionId === undefined && turnId === undefined)
        return undefined;
    return {
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(turnId !== undefined ? { turnId } : {}),
    };
}
/**
 * The structured memory store.
 */
export class MemoirStore {
    /** The store file path. */
    path;
    /** How often warm load() calls re-probe the file mtime (0 = every call). */
    mtimeCheckIntervalMs;
    /** Cross-process mutation lock retry interval (withFileLock). */
    lockRetryMs;
    /** Cross-process mutation lock acquisition timeout (withFileLock). */
    lockTimeoutMs;
    /** Cross-process stale lock reclaim threshold. */
    lockStaleAfterMs;
    /** The in-memory snapshot backing warm reads. */
    snapshot = null;
    /** Write counter; bumped on every save() (record/remove). */
    revision = 0;
    /** Snapshot-rebuild counter; bumped on every snapshot (re)build. */
    epoch = 0;
    /** Timestamp of the last mtime probe (throttles external-change checks). */
    lastMtimeCheck = 0;
    // IO / cache counters (diagnostics + tests).
    loadCount = 0;
    hitCount = 0;
    fileReadCount = 0;
    statProbeCount = 0;
    corruptBackupCount = 0;
    lastLoadMs;
    /** renderMarkdown cache: project key → { signature, markdown }. */
    renderCache = new Map();
    renderCount = 0;
    renderComputeCount = 0;
    languageSource;
    /**
     * @param path - store file path (defaults to the standard location).
     * @param options.mtimeCheckIntervalMs - mtime probe throttle; 0 probes on
     *   every load (tests), defaults to a low-frequency 2000ms.
     * @param options.lockRetryMs / lockTimeoutMs - cross-process mutation lock
     *   tuning (tests shrink these; defaults 25ms / 5000ms).
     */
    constructor(path, options) {
        this.path = path ?? defaultStorePath();
        this.mtimeCheckIntervalMs = options?.mtimeCheckIntervalMs ?? DEFAULT_MTIME_CHECK_MS;
        this.lockRetryMs = options?.lockRetryMs ?? DEFAULT_LOCK_RETRY_MS;
        this.lockTimeoutMs = options?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
        this.lockStaleAfterMs = options?.lockStaleAfterMs ?? DEFAULT_LOCK_STALE_AFTER_MS;
        this.languageSource = options?.language ?? DEFAULT_MEMOIR_LANGUAGE;
    }
    /** Current model-facing language (live when backed by Web settings). */
    language() {
        return languageFrom(this.languageSource);
    }
    /** The cross-process lock file guarding mutations of this store. */
    lockFilePath() {
        return this.path.replace(/\.json$/, '') + '.lock';
    }
    /**
     * Run one read-modify-write mutation inside the cross-process lock.
     * Inside the critical section the in-memory snapshot is dropped and the
     * store is re-read from disk, so a process whose snapshot went stale
     * mutates the latest on-disk state (no lost update between processes).
     */
    mutateLocked(mutate) {
        const lockPath = this.lockFilePath();
        const dir = dirname(lockPath);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true, mode: 0o700 });
        return withFileLock(lockPath, () => {
            this.invalidate();
            return mutate();
        }, { retryMs: this.lockRetryMs, timeoutMs: this.lockTimeoutMs, staleAfterMs: this.lockStaleAfterMs });
    }
    /** Current store revision (0 before the first load/save). */
    currentRevision() {
        return this.revision;
    }
    /** Stat the store file into the snapshot signature (null when absent). */
    statNow() {
        try {
            const s = statSync(this.path);
            return { mtimeMs: s.mtimeMs, size: s.size };
        }
        catch {
            return null;
        }
    }
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
    load() {
        this.loadCount++;
        const started = Date.now();
        // Warm path: serve the snapshot directly; probe mtime only at the
        // configured frequency (or every call when the interval is 0).
        if (this.snapshot !== null) {
            const now = Date.now();
            if (this.mtimeCheckIntervalMs === 0 || now - this.lastMtimeCheck >= this.mtimeCheckIntervalMs) {
                this.lastMtimeCheck = now;
                this.statProbeCount++;
                const stat = this.statNow();
                const same = this.snapshot.stat === null
                    ? stat === null
                    : stat !== null && stat.mtimeMs === this.snapshot.stat.mtimeMs && stat.size === this.snapshot.stat.size;
                if (same) {
                    this.hitCount++;
                    return this.snapshot.file;
                }
                // File changed underneath us: fall through to a rebuild.
            }
            else {
                this.hitCount++;
                return this.snapshot.file;
            }
        }
        // Cold path: stat + read + parse (+ corrupt backup) + normalize.
        let stat = this.statNow();
        let parsed = { version: FORMAT_VERSION, projects: {} };
        if (stat !== null) {
            try {
                const raw = JSON.parse(readFileSync(this.path, 'utf8'));
                if (typeof raw === 'object' && raw !== null && typeof raw.projects === 'object' && raw.projects !== null) {
                    parsed = raw;
                }
                else {
                    throw new Error('store shape invalid');
                }
            }
            catch {
                // Corrupt store: preserve it as a backup, then start fresh (the
                // project markdown files remain as human-readable history).
                this.corruptBackupCount++;
                try {
                    renameSync(this.path, `${this.path}.corrupt.${Date.now()}`);
                    stat = null;
                }
                catch {
                    // Backup failed (permissions?): keep serving fresh in-memory; the
                    // next save will still overwrite the corrupt file.
                }
            }
            this.fileReadCount++;
        }
        const file = this.normalize(parsed);
        this.epoch++;
        this.snapshot = { revision: this.revision, epoch: this.epoch, file, stat };
        this.lastMtimeCheck = Date.now();
        this.lastLoadMs = Date.now() - started;
        // Entry shapes may have changed underneath us: drop the render cache.
        this.renderCache.clear();
        return file;
    }
    /** Normalize a parsed store file: mint ids, coerce shapes, merge duplicate
     *  buckets that normalize to the same project key (legacy Windows variants). */
    normalize(parsed) {
        const projects = {};
        for (const [rawKey, project] of Object.entries(parsed.projects ?? {})) {
            if (typeof project !== 'object' || project === null)
                continue;
            const key = projectKey(rawKey);
            const rawEntries = Array.isArray(project.entries) ? project.entries : [];
            const entries = rawEntries
                .filter((e) => typeof e === 'object' && e !== null)
                .map((e) => ({
                id: typeof e.id === 'string' && e.id !== '' ? e.id : mintId(),
                section: typeof e.section === 'string' && Object.prototype.hasOwnProperty.call(SECTIONS, e.section) ? e.section : 'note',
                // Conditional spread (not "title: undefined"): the in-memory
                // shape must round-trip the serialized JSON exactly, so
                // snapshot.file stays deep-equal to the on-disk file.
                ...(typeof e.title === 'string' && e.title !== '' ? { title: e.title } : {}),
                content: typeof e.content === 'string' ? e.content : '',
                time: typeof e.time === 'number' && Number.isFinite(e.time) ? e.time : Date.now(),
                ...(normalizedSource(e.source, e.sessionId) !== undefined ? { source: normalizedSource(e.source, e.sessionId) } : {}),
                importance: normalizedImportance(e.importance),
                pinned: e.pinned === true,
                status: e.status === 'active' || e.status === 'superseded' || e.status === 'archived' ? e.status : 'active',
                ...(normalizedStrings(e.supersedes) !== undefined ? { supersedes: normalizedStrings(e.supersedes) } : {}),
                ...(normalizedStrings(e.tags) !== undefined ? { tags: normalizedStrings(e.tags) } : {}),
            }));
            const normalized = {
                path: typeof project.path === 'string' && project.path !== '' ? project.path : rawKey,
                title: typeof project.title === 'string' && project.title !== '' ? project.title : projectTitle(rawKey),
                updatedAt: typeof project.updatedAt === 'number' ? project.updatedAt : (entries[entries.length - 1]?.time ?? Date.now()),
                entries,
            };
            const existing = projects[key];
            if (existing === undefined) {
                projects[key] = normalized;
            }
            else {
                // Same workspace stored under legacy key variants: merge by id.
                const seen = new Set(existing.entries.map((e) => e.id));
                for (const entry of normalized.entries) {
                    if (!seen.has(entry.id))
                        existing.entries.push(entry);
                }
                existing.updatedAt = Math.max(existing.updatedAt, normalized.updatedAt);
            }
        }
        return { version: FORMAT_VERSION, projects };
    }
    /** Persist the store atomically (0600 — may contain user's notes). */
    save(file) {
        try {
            writeFileAtomic(this.path, JSON.stringify(file, null, 2) + '\n', 0o600);
        }
        catch (error) {
            // The in-memory snapshot may already carry the mutation; drop it so the
            // next load() re-reads the on-disk truth instead of serving a stale hit.
            this.snapshot = null;
            throw error;
        }
        // Bump the revision and refresh the snapshot signature from the file we
        // just wrote: subsequent reads hit the cache without re-parsing.
        this.revision++;
        this.epoch++;
        this.snapshot = { revision: this.revision, epoch: this.epoch, file, stat: this.statNow() };
        this.lastMtimeCheck = Date.now();
        // Entry shapes changed under a mutation: drop all render-cache entries.
        this.renderCache.clear();
    }
    /** Drop the snapshot so the next load() re-reads and re-parses the file. */
    invalidate() {
        this.snapshot = null;
        this.renderCache.clear();
    }
    /** Cache/IO counters (diagnostics + tests). */
    stats() {
        return {
            revision: this.revision,
            epoch: this.epoch,
            loads: this.loadCount,
            hits: this.hitCount,
            misses: this.loadCount - this.hitCount,
            hitRate: this.loadCount === 0 ? 0 : this.hitCount / this.loadCount,
            fileReads: this.fileReadCount,
            statProbes: this.statProbeCount,
            corruptBackups: this.corruptBackupCount,
            renders: this.renderCount,
            renderComputes: this.renderComputeCount,
            renderHitRate: this.renderCount === 0 ? 0 : (this.renderCount - this.renderComputeCount) / this.renderCount,
            lastLoadMs: this.lastLoadMs,
        };
    }
    /** One project record, or undefined. */
    project(cwd) {
        return this.load().projects[projectKey(cwd)];
    }
    /** Entries of one project in insertion order. */
    entries(cwd) {
        return this.project(cwd)?.entries ?? [];
    }
    /** Compact per-project summaries (path, title, entry count, updatedAt). */
    listProjects() {
        const store = this.load();
        return Object.entries(store.projects).map(([key, project]) => ({
            key,
            path: project.path,
            title: project.title,
            count: project.entries.length,
            updatedAt: project.updatedAt,
        }));
    }
    /** Append one entry and regenerate the project markdown. Returns the entry. */
    record(cwd, payload, source) {
        const error = validateEntryPayload(payload, this.language());
        if (error !== undefined)
            throw new Error(error);
        return this.mutateLocked(() => {
            const store = this.load();
            const key = projectKey(cwd);
            const project = (store.projects[key] ??= {
                // Display path keeps the caller's original case; the bucket key is
                // the canonical (lowercased for Windows) projectKey(cwd).
                path: cwd,
                title: projectTitle(key),
                updatedAt: Date.now(),
                entries: [],
            });
            const normalizedOrigin = normalizedSource(typeof source === 'object' && source !== null ? source : undefined, typeof source === 'string' ? source : undefined);
            const entry = {
                id: mintId(),
                section: payload.section,
                ...(typeof payload.title === 'string' && payload.title.trim() !== '' ? { title: payload.title.trim() } : {}),
                content: payload.content.trim(),
                time: Date.now(),
                ...(normalizedOrigin !== undefined ? { source: normalizedOrigin } : {}),
                importance: normalizedImportance(payload.importance),
                pinned: payload.pinned === true,
                status: 'active',
                ...(normalizedStrings(payload.supersedes) !== undefined ? { supersedes: normalizedStrings(payload.supersedes) } : {}),
                ...(normalizedStrings(payload.tags) !== undefined ? { tags: normalizedStrings(payload.tags) } : {}),
            };
            const superseded = new Set(entry.supersedes ?? []);
            if (superseded.size > 0) {
                for (const existing of project.entries) {
                    if (superseded.has(existing.id))
                        existing.status = 'superseded';
                }
            }
            project.entries.push(entry);
            project.updatedAt = entry.time;
            this.save(store);
            this.writeProjectFile(cwd);
            return entry;
        });
    }
    /** Remove one entry by id; regenerates the project markdown. */
    remove(cwd, id) {
        return this.mutateLocked(() => {
            const store = this.load();
            const key = projectKey(cwd);
            const project = store.projects[key];
            if (project === undefined)
                return false;
            const index = project.entries.findIndex((e) => e.id === id);
            if (index < 0)
                return false;
            project.entries.splice(index, 1);
            project.updatedAt = Date.now();
            this.save(store);
            this.writeProjectFile(cwd);
            return true;
        });
    }
    /** Update an existing entry without deleting its id or creation time. */
    update(cwd, id, patch) {
        return this.mutateLocked(() => {
            const store = this.load();
            const project = store.projects[projectKey(cwd)];
            const entry = project?.entries.find((candidate) => candidate.id === id);
            if (entry === undefined)
                return undefined;
            if (patch.section !== undefined)
                entry.section = patch.section;
            if (patch.title !== undefined) {
                const title = patch.title?.trim() ?? '';
                if (title === '')
                    delete entry.title;
                else
                    entry.title = title;
            }
            if (patch.content !== undefined)
                entry.content = patch.content.trim();
            if (patch.importance !== undefined)
                entry.importance = normalizedImportance(patch.importance);
            if (patch.pinned !== undefined)
                entry.pinned = patch.pinned;
            if (patch.status !== undefined)
                entry.status = patch.status;
            if (patch.supersedes !== undefined) {
                const supersedes = normalizedStrings(patch.supersedes)?.filter((target) => target !== entry.id);
                if (supersedes === undefined || supersedes.length === 0)
                    delete entry.supersedes;
                else {
                    entry.supersedes = supersedes;
                    const targets = new Set(supersedes);
                    for (const candidate of project.entries) {
                        if (candidate.id !== entry.id && targets.has(candidate.id))
                            candidate.status = 'superseded';
                    }
                }
            }
            if (patch.tags !== undefined) {
                const tags = normalizedStrings(patch.tags);
                if (tags === undefined)
                    delete entry.tags;
                else
                    entry.tags = tags;
            }
            project.updatedAt = Date.now();
            this.save(store);
            this.writeProjectFile(cwd);
            return entry;
        });
    }
    /** Render one entry as a markdown bullet line. */
    renderEntryLine(entry) {
        const label = sectionCopy(entry.section, this.language()).label;
        const when = formatTime(entry.time);
        const head = entry.title !== undefined ? `${entry.title} — ` : '';
        return `- [${when}] [${label}] ${head}${entry.content}`;
    }
    /** Cheap O(1) signature of one project's entries (count + tail id/time). */
    renderSignature(project) {
        const entries = project?.entries ?? [];
        const last = entries[entries.length - 1];
        return `${this.language()}|${entries.length}|${project?.updatedAt ?? 0}|${last?.id ?? ''}|${last?.time ?? ''}`;
    }
    /** Regenerate the full PROJECT_MEMORY.md content for one project. */
    renderMarkdown(cwd) {
        this.renderCount++;
        const key = projectKey(cwd);
        const project = this.load().projects[key];
        const signature = this.renderSignature(project);
        const cached = this.renderCache.get(key);
        if (cached !== undefined && cached.signature === signature)
            return cached.markdown;
        const markdown = this.renderMarkdownNow(project?.entries ?? []);
        this.renderComputeCount++;
        this.renderCache.set(key, { signature, markdown });
        return markdown;
    }
    /** Pure markdown assembly for one project's entries (no cache access). */
    renderMarkdownNow(entries) {
        const language = this.language();
        const copy = hostCopy(language).markdown;
        const header = [copy.title, '', ...copy.intro, ''];
        const body = [];
        for (const key of SECTION_KEYS) {
            const group = entries.filter((e) => e.section === key);
            if (group.length === 0)
                continue;
            body.push(sectionCopy(key, language).header, '');
            for (const entry of group)
                body.push(this.renderEntryLine(entry));
            body.push('');
        }
        if (body.length === 0) {
            body.push(copy.empty, '');
        }
        return [...header, ...body].join('\n');
    }
    /** Absolute path of one project's memory file (no write). */
    projectFilePath(cwd) {
        return join(cwd, PROJECT_FILE);
    }
    /** Regenerate and write the project memory file; returns its path. */
    writeProjectFile(cwd) {
        const path = this.projectFilePath(cwd);
        const markdown = this.renderMarkdown(cwd);
        // Skip the write when the file already holds this exact content — keeps
        // mtimes stable (no git churn) and avoids pointless disk writes.
        try {
            if (existsSync(path) && readFileSync(path, 'utf8') === markdown)
                return path;
        }
        catch {
            // Unreadable file: fall through to a fresh atomic write.
        }
        writeFileAtomic(path, markdown);
        return path;
    }
    /** Re-render all known project projections after a language change. */
    refreshProjectFiles() {
        for (const project of this.listProjects()) {
            try {
                this.writeProjectFile(project.path);
            }
            catch {
                // A stale or read-only workspace must not make a settings save fail.
            }
        }
    }
}
/** SHA-256 hex digest of a string, truncated for prompt-stability hashing. */
export function sha256(text, length = 16) {
    return createHash('sha256').update(text).digest('hex').slice(0, length);
}
