/**
 * /api/dsh-memoir/* route layer for the web panel: a JSON envelope (ok /
 * error) over the structured store. Reads are GET with query params; writes
 * require an explicit application/json content-type (blocks form-based CSRF,
 * same stance as the sibling aionui-panel routes).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { CacheStats, MemoirStore } from './store.js';
/** Diagnostics payload shape (v0.4 observability, roadmap §4). */
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
    config: {
        hotMemoryTokens: number;
        hotMemoryMaxTokens: number;
        readDefaultLimit: number;
        readMaxLimit: number;
        sessionSnapshotMax: number;
    };
}
/** Supplies the runtime diagnostics snapshot (closed over plugin state). */
export type DiagnosticsProvider = (path?: string) => DiagnosticsValue;
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
 * @returns route definitions for ctx.webServer.register.
 */
export declare function makeRoutes(store: MemoirStore, diagnostics?: DiagnosticsProvider): WebRoute[];
