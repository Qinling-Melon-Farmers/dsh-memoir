/**
 * Structured memory store for dsh-memoir — the single source of truth is the
 * global index JSON (~/.dsh/dsh-memoir.json); the per-project PROJECT_MEMORY.md
 * is a regenerated human-readable rendering of the same entries (git-friendly,
 * auto-injected into future sessions). Pure node:fs, no cordis dependency —
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
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
/** Global index format version. */
export const FORMAT_VERSION = 2;
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
/** How often (ms) warm load() calls re-probe the file mtime; 0 = every call. */
export const DEFAULT_MTIME_CHECK_MS = 2000;
/** Default store location: <home>/.dsh/dsh-memoir.json. */
export function defaultStorePath() {
    return join(homedir(), '.dsh', 'dsh-memoir.json');
}
/** `YYYY-MM-DD HH:mm` in local time. */
export function formatTime(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/**
 * Normalize one workspace path into a stable key:
 * strip trailing separators, lowercase the drive letter, unify separators to
 * '/', so `C:\A` / `c:\a\` / `C:/A` map to one bucket. POSIX paths are
 * unchanged apart from trailing separators.
 */
export function projectKey(cwd) {
    const raw = String(cwd).replace(/[\\/]+$/, '');
    const drive = /^([A-Za-z]):/.exec(raw);
    const prefix = drive === null ? '' : drive[1].toLowerCase() + ':';
    const body = drive === null ? raw : raw.slice(2);
    return prefix + body.replace(/\\/g, '/');
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
export function validateEntryPayload(payload) {
    if (typeof payload !== 'object' || payload === null)
        return 'payload must be a JSON object';
    const record = payload;
    if (typeof record.section !== 'string' || !Object.prototype.hasOwnProperty.call(SECTIONS, record.section)) {
        return `section must be one of ${SECTION_KEYS.join('/')}`;
    }
    if (typeof record.content !== 'string' || record.content.trim() === '')
        return 'content is required';
    if (record.title !== undefined && (typeof record.title !== 'string' || record.title.length > 200)) {
        return 'title must be a string of at most 200 chars';
    }
    return undefined;
}
/**
 * The structured memory store.
 */
export class MemoirStore {
    /** The store file path. */
    path;
    /** How often warm load() calls re-probe the file mtime (0 = every call). */
    mtimeCheckIntervalMs;
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
    /**
     * @param path - store file path (defaults to the standard location).
     * @param options.mtimeCheckIntervalMs - mtime probe throttle; 0 probes on
     *   every load (tests), defaults to a low-frequency 2000ms.
     */
    constructor(path, options) {
        this.path = path ?? defaultStorePath();
        this.mtimeCheckIntervalMs = options?.mtimeCheckIntervalMs ?? DEFAULT_MTIME_CHECK_MS;
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
                title: typeof e.title === 'string' && e.title !== '' ? e.title : undefined,
                content: typeof e.content === 'string' ? e.content : '',
                time: typeof e.time === 'number' && Number.isFinite(e.time) ? e.time : Date.now(),
                ...(typeof e.sessionId === 'string' && e.sessionId !== '' ? { sessionId: e.sessionId } : {}),
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
    record(cwd, payload, sessionId) {
        const error = validateEntryPayload(payload);
        if (error !== undefined)
            throw new Error(error);
        const store = this.load();
        const key = projectKey(cwd);
        const project = (store.projects[key] ??= {
            path: key,
            title: projectTitle(key),
            updatedAt: Date.now(),
            entries: [],
        });
        const entry = {
            id: mintId(),
            section: payload.section,
            ...(typeof payload.title === 'string' && payload.title.trim() !== '' ? { title: payload.title.trim() } : {}),
            content: payload.content.trim(),
            time: Date.now(),
            ...(typeof sessionId === 'string' && sessionId !== '' ? { sessionId } : {}),
        };
        project.entries.push(entry);
        project.updatedAt = entry.time;
        this.save(store);
        this.writeProjectFile(cwd);
        return entry;
    }
    /** Remove one entry by id; regenerates the project markdown. */
    remove(cwd, id) {
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
    }
    /** Render one entry as a markdown bullet line. */
    renderEntryLine(entry) {
        const label = SECTIONS[entry.section]?.label ?? entry.section;
        const when = formatTime(entry.time);
        const head = entry.title !== undefined ? `${entry.title} — ` : '';
        return `- [${when}] [${label}] ${head}${entry.content}`;
    }
    /** Cheap O(1) signature of one project's entries (count + tail id/time). */
    renderSignature(project) {
        const entries = project?.entries ?? [];
        const last = entries[entries.length - 1];
        return `${entries.length}|${project?.updatedAt ?? 0}|${last?.id ?? ''}|${last?.time ?? ''}`;
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
        const header = [
            '# 项目持久记忆 Project Memory',
            '',
            '> 本文件由 dsh-memoir 插件维护：记录本项目历次会话的工作归纳、经验教训与行动指南，',
            '> 作为未来 AGENTS 接手本项目时的行动指南。会话开始时自动注入 system prompt。',
            '',
        ];
        const body = [];
        for (const key of SECTION_KEYS) {
            const group = entries.filter((e) => e.section === key);
            if (group.length === 0)
                continue;
            body.push(SECTIONS[key].header, '');
            for (const entry of group)
                body.push(this.renderEntryLine(entry));
            body.push('');
        }
        if (body.length === 0) {
            body.push('> 暂无条目。让 agent 用 memoir_record 沉淀，或在「记忆」面板中手动记录。', '');
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
}
/** SHA-256 hex digest of a string, truncated for prompt-stability hashing. */
export function sha256(text, length = 16) {
    return createHash('sha256').update(text).digest('hex').slice(0, length);
}
