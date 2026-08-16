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
import { bounded, INJECT_LIMIT, MemoirStore } from './store.js';
import { memoirReadTool, memoirRecordTool } from './tools.js';
import { makeRoutes } from './routes.js';
import { installAutoDistill } from './autodistill.js';
/** Stable cordis plugin name. */
export const name = 'memoir';
/** Services required before the memory surfaces can mount. */
export const inject = ['tools', 'systemPrompt', 'webServer'];
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 150;
const DEFAULT_ENABLED = true;
const DEFAULT_ANNOUNCE = true;
const DEFAULT_AUTO_DISTILL = true;
/** Model-facing announcement: trimmed to the essentials (details live in
 *  the tool schemas and README, not in every prompt). */
export const MEMOIR_GUIDANCE = '本机已安装 dsh-memoir 插件（项目持久记忆）：把会话的工作归纳、经验教训与行动指南沉淀进项目记忆，供未来 AGENTS 继承。' +
    '用 memoir_record 记录（work 工作 / lessons 教训 / actions 行动 / note 备注），用 memoir_read 读取；' +
    '新会话开始时下方会自动注入本项目记忆，请据此协作，并在产生新经验时更新。';
/**
 * Per-assembly prompt section text: static guidance plus the calling agent's
 * project memory (bounded). Pure — exported for tests.
 * @param store - the structured memory store.
 * @param context - the system-prompt assemble context (may carry `agent`).
 */
export function memoirSectionText(store, context) {
    const cwd = context?.agent?.session?.header?.cwd;
    if (typeof cwd !== 'string' || cwd === '')
        return MEMOIR_GUIDANCE;
    const entries = store.entries(cwd);
    if (entries.length === 0)
        return MEMOIR_GUIDANCE;
    const markdown = store.renderMarkdown(cwd);
    return `${MEMOIR_GUIDANCE}\n\n## 项目持久记忆（自动注入）\n${bounded(markdown.trimEnd(), INJECT_LIMIT)}`;
}
/** Resolved runtime switches (schema defaults applied). */
function resolveConfig(config) {
    return {
        enabled: config?.enabled ?? DEFAULT_ENABLED,
        announceToAgent: config?.announceToAgent ?? DEFAULT_ANNOUNCE,
        autoDistill: config?.autoDistill ?? DEFAULT_AUTO_DISTILL,
    };
}
/** Bridge the cordis context onto the autodistill wire contract. */
function autoDistillWire(ctx) {
    return {
        on: (name, listener) => ctx.on(name, listener),
    };
}
/**
 * Mount the memory tools, the panel routes, the auto-distill listener, and
 * the per-project announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt/webServer.
 * @param config - resolved plugin config (defaults apply when absent).
 */
export function apply(ctx, config) {
    const value = resolveConfig(config);
    if (!value.enabled)
        return;
    const store = new MemoirStore();
    ctx.effect(() => {
        const tools = [memoirRecordTool(store), memoirReadTool(store)];
        const disposers = tools.map((tool) => ctx.tools.register(tool));
        return () => {
            for (const dispose of disposers)
                dispose();
        };
    }, 'dsh-memoir: tools');
    ctx.effect(() => {
        const disposers = makeRoutes(store).map((route) => ctx.webServer.register(route));
        return () => {
            for (const dispose of disposers)
                dispose();
        };
    }, 'dsh-memoir: routes');
    if (value.autoDistill) {
        ctx.effect(() => installAutoDistill(autoDistillWire(ctx), { enabled: () => value.autoDistill }), 'dsh-memoir: auto-distill');
    }
    if (value.announceToAgent) {
        ctx.systemPrompt.section({
            name: 'plugin:dsh-memoir',
            order: SECTION_ORDER,
            // text is a provider evaluated per assembly, so each project's memory is
            // injected for its own session and not for unrelated workspaces.
            text: (context) => memoirSectionText(store, context),
        });
    }
}
