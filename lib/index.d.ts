/**
 * dsh-memoir — host half.
 *
 * 把「一个会话做了什么 / 踩了什么坑 / 下一步怎么走」沉淀为项目持久化记忆，
 * 并作为未来 AGENTS 的行动指南：
 *   - 项目级记忆：<工作区>/PROJECT_MEMORY.md（随 git 提交，会话开始时自动注入）
 *   - 全局索引：~/.dsh/dsh-memoir.json（结构化源数据，跨项目检索）
 *   - 面板 API：/api/dsh-memoir/*（浏览器「记忆」面板读写）
 *   - 自动收尾：每轮有实际工作的 turn 结束时，steer 一句归纳提示
 *
 * 提供的 agent 工具：
 *   - memoir_record(section, title?, content)  记录一条记忆
 *   - memoir_read(scope?, section?, query?)     读取记忆
 *
 * 全部基于官方 NPM SDK（@deepseek-ai/dsh-tools 等），不改 DSH 源码；
 * 通过 cordis.patch.yml 的 insert 行挂载到 web profile。
 */
import type { Context } from '@deepseek-ai/cordis';
import { MemoirStore } from './store.js';
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
}
/** Model-facing announcement: plugin presence, capabilities, and usage rules. */
export declare const MEMOIR_GUIDANCE: string;
/**
 * Per-assembly prompt section text: static guidance plus the calling agent's
 * project memory (bounded). Pure — exported for tests.
 * @param store - the structured memory store.
 * @param context - the system-prompt assemble context (may carry `agent`).
 */
export declare function memoirSectionText(store: MemoirStore, context: {
    agent?: {
        session?: {
            header?: {
                cwd?: string;
            };
        };
    };
}): string;
/**
 * Mount the memory tools, the panel routes, the auto-distill listener, and
 * the per-project announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt/webServer.
 * @param config - resolved plugin config (defaults apply when absent).
 */
export declare function apply(ctx: Context, config?: Config): void;
