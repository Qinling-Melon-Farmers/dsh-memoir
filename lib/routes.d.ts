/**
 * /api/dsh-memoir/* route layer for the web panel: a JSON envelope (ok /
 * error) over the structured store. Reads are GET with query params; writes
 * require an explicit application/json content-type (blocks form-based CSRF,
 * same stance as the sibling aionui-panel routes).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { MemoirStore } from './store.js';
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
 * @returns route definitions for ctx.webServer.register.
 */
export declare function makeRoutes(store: MemoirStore): WebRoute[];
