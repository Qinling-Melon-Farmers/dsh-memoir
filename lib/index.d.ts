/**
 * dsh-memoir — host half.
 *
 * 把「一个会话做了什么 / 踩了什么坑 / 下一步怎么走」沉淀为项目持久化记忆，
 * 并作为未来 AGENTS 的行动指南：
 *   - 项目级记忆：<工作区>/PROJECT_MEMORY.md（随 git 提交，会话开始时自动注入）
 *   - 全局索引：~/.dsh/dsh-memoir.json（结构化源数据，跨项目检索）
 *   - 面板 API：/api/dsh-memoir/*（浏览器「记忆」面板读写 + diagnostics）
 *   - 自动收尾：每轮有实际工作的 turn 结束时，steer 一句归纳提示
 *
 * v0.4.0 cache-aware injection:
 *   - system prompt 只注入 selector 选出的 Hot Memory（token 预算），
 *     不再注入完整 markdown；
 *   - 每个 session 的注入文本由 MemorySnapshotManager 冻结一次，
 *     同一 session 后续 assembly 复用同一 snapshot（prompt 前缀稳定，
 *     最大化 prompt-prefix cache 命中）；新 session 才重建。
 *
 * 提供的 agent 工具：
 *   - memoir_record(section, title?, content)  记录一条记忆
 *   - memoir_update(id, patch)  编辑条目并更新生命周期
 *   - memoir_read(scope?, section?, query?, limit?, detail?)  读取记忆
 */
import type { Context } from '@deepseek-ai/cordis';
import { MemoirStore } from './store.js';
import { MemorySnapshotManager } from './snapshot.js';
import type { MemoryBudget } from './selector.js';
/** Stable cordis plugin name. */
export declare const name = "memoir";
/** Services required before the memory surfaces can mount. */
export declare const inject: string[];
/** Plugin config (validated softly at apply; defaults apply when absent). */
export interface Config {
    /** Master switch for the plugin (tools, routes, prompt section). */
    enabled?: boolean;
    /** When true (default), a system-prompt section announces the plugin. */
    announceToAgent?: boolean;
    /** When true (default), turns with real work are auto-distilled at turn end. */
    autoDistill?: boolean;
    /** Remind after every N eligible worked turns per agent (default 1, minimum 1). */
    autoDistillEvery?: number;
    /** Minimum minutes between successful reminders per agent (default 0). */
    autoDistillCooldownMin?: number;
    /** Minimum tool calls required on the triggering turn (default 1, minimum 1). */
    autoDistillMinTools?: number;
    /** Hot-memory soft target tokens (default 900). */
    hotMemoryTokens?: number;
    /** Hot-memory hard ceiling tokens (default 1200). */
    hotMemoryMaxTokens?: number;
    /** memoir_read default result count (default 8). */
    readDefaultLimit?: number;
    /** memoir_read maximum result count (default 30). */
    readMaxLimit?: number;
    /** Per-session snapshot LRU cap (default 128). */
    sessionSnapshotMax?: number;
    /** memoir_read ranked-query LRU cache size (default 128). */
    queryCacheSize?: number;
}
/** Model-facing announcement: minimal by design (roadmap §2.6) — parameter
 *  details live in the tool schemas, not in every prompt. */
export declare const MEMOIR_GUIDANCE: string;
/** The injected-memory heading (kept stable across versions). */
export declare const MEMOIR_SECTION_HEADING = "## \u9879\u76EE\u6301\u4E45\u8BB0\u5FC6\uFF08\u81EA\u52A8\u6CE8\u5165\uFF09";
/** Resolved runtime switches (schema defaults applied). */
export interface ResolvedConfig {
    enabled: boolean;
    announceToAgent: boolean;
    autoDistill: boolean;
    autoDistillEvery: number;
    autoDistillCooldownMin: number;
    autoDistillMinTools: number;
    budget: MemoryBudget;
    readDefaultLimit: number;
    readMaxLimit: number;
    sessionSnapshotMax: number;
    queryCacheSize: number;
}
/**
 * Per-assembly prompt section text: minimal guidance plus the session's
 * frozen hot-memory snapshot. Pure — exported for tests.
 *
 * Freezing rules (roadmap §1.2 A / §2.2): the FIRST assembly of a session
 * builds the hot memory under the token budget and the manager freezes it;
 * later assemblies — even after memoir_record changed the store — return the
 * same text, keeping the prompt prefix stable. New sessions rebuild.
 *
 * @param store - the structured memory store.
 * @param context - the system-prompt assemble context (may carry `agent`).
 * @param manager - optional snapshot manager (no freezing when absent).
 * @param budget - token budget (defaults to DEFAULT_MEMORY_BUDGET).
 */
export declare function memoirSectionText(store: MemoirStore, context: {
    agent?: {
        id?: string;
        session?: {
            id?: string;
            header?: {
                cwd?: string;
            };
        };
    };
}, manager?: MemorySnapshotManager, budget?: MemoryBudget): string;
/**
 * Mount the memory tools, the panel routes, the auto-distill listener, and
 * the per-project announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt/webServer.
 * @param config - resolved plugin config (defaults apply when absent).
 */
export declare function apply(ctx: Context, config?: Config): void;
