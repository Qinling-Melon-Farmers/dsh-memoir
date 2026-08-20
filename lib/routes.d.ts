/**
 * /api/dsh-memoir/* route layer for the web panel: a JSON envelope (ok /
 * error) over the structured store. Reads are GET with query params; writes
 * require an explicit application/json content-type (blocks form-based CSRF,
 * same stance as the sibling aionui-panel routes).
 *
 * v0.4.2 additions: ranked /search (shared RetrievalEngine with memoir_read),
 * /hot-memory preview, extended diagnostics (retrieval index + query cache +
 * last query + session snapshot), and workspace authorization on writes.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { CacheStats, MemoirEntry, MemoirStore } from './store.js';
import type { RetrievalDiagnostics, RetrievalEngine } from './retrieval.js';
/** Diagnostics payload shape (v0.4 observability, roadmap §4 / §6.3). */
export interface DiagnosticsValue {
    storeRevision: number;
    snapshotEpoch: number;
    cache: CacheStats;
    snapshotCount: number;
    snapshotMax: number;
    hotMemory: {
        selected: number;
        total: number;
        estimatedTokens: number;
    } | null;
    /** v0.4.2: retrieval index / query cache / last query observability. */
    retrieval: RetrievalDiagnostics;
    /** v0.4.2: the most recently frozen session snapshot, if any. */
    snapshot: {
        hash: string;
        createdAt: number;
        storeRevision: number;
    } | null;
    config: {
        hotMemoryTokens: number;
        hotMemoryMaxTokens: number;
        readDefaultLimit: number;
        readMaxLimit: number;
        sessionSnapshotMax: number;
        queryCacheSize: number;
    };
}
/** Supplies the runtime diagnostics snapshot (closed over plugin state). */
export type DiagnosticsProvider = (path?: string) => DiagnosticsValue;
/** Hot-memory preview for one workspace (the inspector endpoint). */
export type HotMemoryProvider = (path: string) => {
    text: string;
    selected: MemoirEntry[];
    total: number;
    estimatedTokens: number;
} | null;
export interface Envelope<T = unknown> {
    ok: boolean;
    value?: T;
    error?: {
        code: string;
        message: string;
    };
}
/** Write one JSON envelope response. */
export declare function json(res: ServerResponse, envelope: Envelope<unknown>, status?: number): void;
/** Read a bounded JSON request body; null when unparseable or oversized. */
export declare function readJsonBody(req: IncomingMessage, limit?: number): Promise<unknown>;
/**
 * Build the /api/dsh-memoir prefix route.
 * @param store - the structured MemoirStore.
 * @param diagnostics - optional runtime diagnostics provider.
 * @param retrieval - optional RetrievalEngine (ranked /search endpoint).
 * @param hotMemory - optional hot-memory preview provider (inspector).
 * @param allowedWorkspace - optional write guard: only paths it accepts may
 *   be written via the panel API (v0.4.2 host safety, roadmap §3.5).
 * @param touchWorkspace - deprecated compatibility slot; GET requests never
 *   use it for authorization because browser-supplied paths are untrusted.
 * @returns route definitions for ctx.webServer.register.
 */
export declare function makeRoutes(store: MemoirStore, diagnostics?: DiagnosticsProvider, retrieval?: RetrievalEngine, hotMemory?: HotMemoryProvider, allowedWorkspace?: (path: string) => boolean, touchWorkspace?: (path: string) => void): WebRoute[];
