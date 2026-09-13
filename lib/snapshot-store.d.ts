import type { SessionSnapshot, SnapshotPersistence } from './snapshot.js';
export declare const SNAPSHOT_FORMAT_VERSION = 1;
export declare const MAX_SNAPSHOT_BYTES: number;
export declare const MAX_SNAPSHOT_RECORD_BYTES: number;
type Failure = 'invalid-record' | 'record-too-large' | 'unavailable';
type Status = 'idle' | 'restored' | 'created' | 'volatile';
export interface SnapshotPersistenceDiagnostics {
    restored: number;
    created: number;
    failures: number;
    lastStatus: Status;
    lastError: Failure | null;
}
/** Store/config identities are hashed; session keys never become raw filenames. */
export declare class MemorySnapshotStore implements SnapshotPersistence {
    readonly directory: string;
    private readonly namespace;
    private readonly language;
    private readonly lockTimeoutMs;
    private readonly warning?;
    private warned;
    private stats;
    constructor(options: {
        storePath: string;
        settingsPath: string;
        language: () => 'zh' | 'en';
        directory?: string;
        lockTimeoutMs?: number;
        warning?: (code: Failure) => void;
    });
    scope(): string;
    diagnostics(): SnapshotPersistenceDiagnostics;
    private valid;
    private read;
    getOrCreate(key: string, builder: () => SessionSnapshot): SessionSnapshot;
}
export {};
