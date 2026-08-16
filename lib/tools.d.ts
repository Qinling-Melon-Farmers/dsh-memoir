/**
 * Agent tools for dsh-memoir: memoir_record (persist one work / lesson /
 * action / note entry) and memoir_read (read project / global memory). Both
 * tools resolve the caller's workspace from the executing agent's session cwd
 * and delegate all persistence to the structured MemoirStore.
 *
 * v0.3.1: section headers no longer duplicate "##"; project/global reads are
 * bounded by internal hard caps; descriptions and renders are trimmed so the
 * tools cost less prompt token.
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { MemoirStore } from './store.js';
/** One text content block (the only render shape these tools emit). */
export declare function text(value: string): ContentBlock[];
/** Resolve the caller session's workspace cwd (absolute), or undefined. */
export declare function resolveWorkspace(exec: ToolRunContext | undefined): string | undefined;
/** Internal hard caps: bound read output regardless of stored volume. */
export declare const READ_PROJECT_MAX_ENTRIES = 100;
export declare const READ_GLOBAL_MAX_ENTRIES_PER_PROJECT = 50;
export declare const READ_OUTPUT_MAX_CHARS = 16000;
/** The record tool: persist one memory entry. */
export declare function memoirRecordTool(store: MemoirStore): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The read tool: project / global / all memory with optional filters. */
export declare function memoirReadTool(store: MemoirStore): import("@deepseek-ai/dsh-tools").ToolDefinition;
