/**
 * Agent tools for dsh-memoir: memoir_record (persist one work / lesson /
 * action / note entry), memoir_update (edit lifecycle state), and memoir_read
 * (read project / global memory). All tools resolve the caller's workspace
 * from the executing agent's session cwd and delegate persistence to the
 * structured MemoirStore.
 *
 * v0.3.1: section headers no longer duplicate "##"; project/global reads are
 * bounded by internal hard caps; descriptions and renders are trimmed.
 * v0.4.0: memoir_read gains limit (default 8, max 30) and detail
 * (compact default / full) so reads are cheap by default.
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { MemoirEntry, MemoirStore } from './store.js';
import type { RetrievalEngine } from './retrieval.js';
/** One text content block (the only render shape these tools emit). */
export declare function text(value: string): ContentBlock[];
/** Resolve the caller session's workspace cwd (absolute), or undefined. */
export declare function resolveWorkspace(exec: ToolRunContext | undefined): string | undefined;
/** Internal hard caps: bound read output regardless of stored volume. */
export declare const READ_GLOBAL_MAX_ENTRIES_PER_PROJECT = 50;
export declare const READ_OUTPUT_MAX_CHARS = 16000;
/** memoir_read output-shaping options (from config readDefaultLimit/readMaxLimit). */
export interface ReadToolOptions {
    defaultLimit: number;
    maxLimit: number;
}
/** Static startup values or a live provider backed by GUI settings. */
export type ReadToolOptionsSource = ReadToolOptions | (() => ReadToolOptions);
/** Full-detail entry line (time + label + title + content). */
export declare function renderEntryFull(entry: MemoirEntry): string;
/** Compact one-line entry (id + title + collapsed single-line content). */
export declare function renderEntryCompact(entry: MemoirEntry, maxContent?: number): string;
/** The record tool: persist one memory entry. */
export declare function memoirRecordTool(store: MemoirStore): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** Update one existing entry while preserving its id and creation time. */
export declare function memoirUpdateTool(store: MemoirStore): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The read tool: project / global / all memory with optional filters. */
export declare function memoirReadTool(store: MemoirStore, options?: ReadToolOptionsSource, retrieval?: RetrievalEngine): import("@deepseek-ai/dsh-tools").ToolDefinition;
