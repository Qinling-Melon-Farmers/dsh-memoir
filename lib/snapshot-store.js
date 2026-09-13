/** Immutable per-session snapshots. No directory scan, TTL, or LRU disk deletion. */
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { snapshotHash } from './snapshot.js';
import { withFileLock, writeFileAtomic } from './store.js';
export const SNAPSHOT_FORMAT_VERSION = 1;
export const MAX_SNAPSHOT_BYTES = 256 * 1024;
export const MAX_SNAPSHOT_RECORD_BYTES = 2 * 1024 * 1024;
class InvalidSnapshot extends Error {
    code;
    constructor(code) { super(code); this.code = code; }
}
function digest(value) {
    return createHash('sha256').update(value).digest('hex');
}
function canonicalPath(path) {
    const absolute = resolve(path);
    return process.platform === 'win32' ? absolute.replace(/\\/g, '/').toLowerCase() : absolute;
}
/** Store/config identities are hashed; session keys never become raw filenames. */
export class MemorySnapshotStore {
    directory;
    namespace;
    language;
    lockTimeoutMs;
    warning;
    warned = new Set();
    stats = { restored: 0, created: 0, failures: 0, lastStatus: 'idle', lastError: null };
    constructor(options) {
        this.namespace = digest(JSON.stringify([canonicalPath(options.storePath), canonicalPath(options.settingsPath)]));
        this.directory = resolve(options.directory ?? `${resolve(options.storePath)}.snapshots`);
        this.language = options.language;
        this.lockTimeoutMs = options.lockTimeoutMs ?? 1000;
        this.warning = options.warning;
    }
    scope() {
        return `${this.namespace}/${this.language() === 'en' ? 'en' : 'zh'}`;
    }
    diagnostics() { return { ...this.stats }; }
    valid(snapshot, key) {
        return snapshot !== null && typeof snapshot === 'object'
            && snapshot.sessionKey === key && typeof snapshot.text === 'string'
            && Buffer.byteLength(snapshot.text, 'utf8') <= MAX_SNAPSHOT_BYTES
            && Number.isSafeInteger(snapshot.createdAt) && snapshot.createdAt >= 0
            && Number.isSafeInteger(snapshot.storeRevision) && snapshot.storeRevision >= 0
            && snapshot.hash === snapshotHash(snapshot.text);
    }
    read(path, key, scope) {
        try {
            const info = lstatSync(path);
            if (!info.isFile() || info.isSymbolicLink())
                throw new InvalidSnapshot('invalid-record');
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return undefined;
            throw error;
        }
        const fd = openSync(path, 'r');
        let raw;
        try {
            if (fstatSync(fd).size > MAX_SNAPSHOT_RECORD_BYTES)
                throw new InvalidSnapshot('record-too-large');
            const buffer = Buffer.alloc(MAX_SNAPSHOT_RECORD_BYTES + 1);
            let size = 0;
            while (size < buffer.length) {
                const read = readSync(fd, buffer, size, buffer.length - size, null);
                if (read === 0)
                    break;
                size += read;
            }
            if (size > MAX_SNAPSHOT_RECORD_BYTES)
                throw new InvalidSnapshot('record-too-large');
            raw = buffer.subarray(0, size).toString('utf8');
        }
        finally {
            closeSync(fd);
        }
        let record;
        try {
            record = JSON.parse(raw);
        }
        catch {
            throw new InvalidSnapshot('invalid-record');
        }
        if (record === null || typeof record !== 'object' || record.version !== SNAPSHOT_FORMAT_VERSION
            || record.scope !== scope || record.snapshot === undefined || !this.valid(record.snapshot, key)) {
            throw new InvalidSnapshot('invalid-record');
        }
        const { sessionKey, storeRevision, text, hash, createdAt } = record.snapshot;
        return Object.freeze({ sessionKey, storeRevision, text, hash, createdAt });
    }
    getOrCreate(key, builder) {
        // Keep a single candidate even if writing it fails; never run a builder twice.
        let built;
        let builderFailed = false;
        const create = () => {
            if (built !== undefined)
                return built;
            try {
                built = builder();
                return built;
            }
            catch (error) {
                builderFailed = true;
                throw error;
            }
        };
        try {
            if (Buffer.byteLength(key, 'utf8') > 8192)
                throw new InvalidSnapshot('record-too-large');
            const scope = this.scope();
            const dir = join(this.directory, scope);
            const path = join(dir, `${digest(key)}.json`);
            // Immutable records can be restored from read-only storage without a lock.
            const restored = this.read(path, key, scope);
            if (restored !== undefined) {
                this.stats.restored++;
                this.stats.lastStatus = 'restored';
                this.stats.lastError = null;
                return restored;
            }
            mkdirSync(dir, { recursive: true, mode: 0o700 });
            // Per-key lock makes first creation win, including simultaneous same-key writers.
            return withFileLock(path + '.lock', () => {
                const existing = this.read(path, key, scope);
                if (existing !== undefined) {
                    this.stats.restored++;
                    this.stats.lastStatus = 'restored';
                    this.stats.lastError = null;
                    return existing;
                }
                const snapshot = create();
                if (!this.valid(snapshot, key))
                    throw new InvalidSnapshot('record-too-large');
                const raw = JSON.stringify({ version: SNAPSHOT_FORMAT_VERSION, scope, snapshot }) + '\n';
                if (Buffer.byteLength(raw, 'utf8') > MAX_SNAPSHOT_RECORD_BYTES)
                    throw new InvalidSnapshot('record-too-large');
                writeFileAtomic(path, raw, 0o600);
                this.stats.created++;
                this.stats.lastStatus = 'created';
                this.stats.lastError = null;
                return snapshot;
            }, { timeoutMs: this.lockTimeoutMs });
        }
        catch (error) {
            if (builderFailed)
                throw error;
            const code = error instanceof InvalidSnapshot ? error.code : 'unavailable';
            this.stats.failures++;
            this.stats.lastStatus = 'volatile';
            this.stats.lastError = code;
            if (!this.warned.has(code)) {
                this.warned.add(code);
                // Diagnostic observers cannot prevent prompt assembly.
                try {
                    this.warning?.(code);
                }
                catch { /* observer only */ }
            }
            // Preserve unreadable/corrupt files unchanged; expose the degraded guarantee.
            return create();
        }
    }
}
