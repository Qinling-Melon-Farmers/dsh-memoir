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
import { MemoirStore, projectKey } from './store.js';
import { memoirReadTool, memoirRecordTool, memoirUpdateTool } from './tools.js';
import { makeRoutes } from './routes.js';
import { installAutoDistill } from './autodistill.js';
import { MemorySnapshotManager, sessionKeyOf } from './snapshot.js';
import { DEFAULT_MEMORY_BUDGET, selectHotMemory } from './selector.js';
import { RetrievalEngine } from './retrieval.js';
import { MemoirSettingsStore } from './settings.js';
/** Stable cordis plugin name. */
export const name = 'memoir';
/** Services required before the memory surfaces can mount. */
export const inject = ['tools', 'systemPrompt', 'webServer'];
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 150;
const DEFAULT_ENABLED = true;
const DEFAULT_ANNOUNCE = true;
const DEFAULT_AUTO_DISTILL = true;
const DEFAULT_AUTO_DISTILL_EVERY = 1;
const DEFAULT_AUTO_DISTILL_COOLDOWN_MIN = 0;
const DEFAULT_AUTO_DISTILL_MIN_TOOLS = 1;
/** Model-facing announcement: minimal by design (roadmap §2.6) — parameter
 *  details live in the tool schemas, not in every prompt. */
export const MEMOIR_GUIDANCE = 'dsh-memoir 提供项目持久记忆。下方仅注入本项目高优先级记忆；' +
    '需要历史细节时调用 memoir_read；产生可复用的工作结论、经验或后续行动时调用 memoir_record。';
/** The injected-memory heading (kept stable across versions). */
export const MEMOIR_SECTION_HEADING = '## 项目持久记忆（自动注入）';
function resolveConfig(config) {
    const target = Math.max(1, Math.floor(config?.hotMemoryTokens ?? DEFAULT_MEMORY_BUDGET.targetTokens));
    const hardMax = Math.max(target, Math.floor(config?.hotMemoryMaxTokens ?? DEFAULT_MEMORY_BUDGET.hardMaxTokens));
    const readDefaultLimit = Math.max(1, Math.floor(config?.readDefaultLimit ?? 8));
    const readMaxLimit = Math.max(readDefaultLimit, Math.floor(config?.readMaxLimit ?? 30));
    const integerAtLeast = (value, fallback, minimum) => typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback;
    const numberAtLeast = (value, fallback, minimum) => typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, value) : fallback;
    return {
        enabled: config?.enabled ?? DEFAULT_ENABLED,
        announceToAgent: config?.announceToAgent ?? DEFAULT_ANNOUNCE,
        autoDistill: config?.autoDistill ?? DEFAULT_AUTO_DISTILL,
        autoDistillEvery: integerAtLeast(config?.autoDistillEvery, DEFAULT_AUTO_DISTILL_EVERY, 1),
        autoDistillCooldownMin: numberAtLeast(config?.autoDistillCooldownMin, DEFAULT_AUTO_DISTILL_COOLDOWN_MIN, 0),
        autoDistillMinTools: integerAtLeast(config?.autoDistillMinTools, DEFAULT_AUTO_DISTILL_MIN_TOOLS, 1),
        budget: { targetTokens: target, hardMaxTokens: hardMax },
        readDefaultLimit,
        readMaxLimit,
        sessionSnapshotMax: Math.max(1, Math.floor(config?.sessionSnapshotMax ?? 128)),
        queryCacheSize: Math.max(1, Math.floor(config?.queryCacheSize ?? 128)),
    };
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
export function memoirSectionText(store, context, manager, budget = DEFAULT_MEMORY_BUDGET) {
    const cwd = context?.agent?.session?.header?.cwd;
    if (typeof cwd !== 'string' || cwd === '')
        return MEMOIR_GUIDANCE;
    const build = () => {
        const entries = store.entries(cwd);
        const hot = selectHotMemory(entries, budget);
        if (hot.selected.length === 0) {
            return { storeRevision: store.currentRevision(), text: MEMOIR_GUIDANCE };
        }
        return {
            storeRevision: store.currentRevision(),
            text: MEMOIR_GUIDANCE + '\n\n' + MEMOIR_SECTION_HEADING + '\n' + hot.text,
        };
    };
    const key = sessionKeyOf(context);
    if (key === undefined || manager === undefined)
        return build().text;
    return manager.getOrCreate(key, build).text;
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
    const store = new MemoirStore(config?.storePath);
    const liveSettings = new MemoirSettingsStore({
        announceToAgent: value.announceToAgent,
        autoDistill: value.autoDistill,
        autoDistillEvery: value.autoDistillEvery,
        autoDistillCooldownMin: value.autoDistillCooldownMin,
        autoDistillMinTools: value.autoDistillMinTools,
        hotMemoryTokens: value.budget.targetTokens,
        hotMemoryMaxTokens: value.budget.hardMaxTokens,
        readDefaultLimit: value.readDefaultLimit,
        readMaxLimit: value.readMaxLimit,
        sessionSnapshotMax: value.sessionSnapshotMax,
        queryCacheSize: value.queryCacheSize,
    }, config?.settingsPath);
    const initialLive = liveSettings.get().settings;
    const snapshotManager = new MemorySnapshotManager({ max: initialLive.sessionSnapshotMax });
    const retrieval = new RetrievalEngine(store, { cacheSize: initialLive.queryCacheSize });
    // Workspaces seen through system-prompt assemblies / panel requests: the
    // write-authorization guard allows only these (plus existing store
    // projects) — a browser-supplied absolute path is not authorization.
    const recentWorkspaces = new Set();
    const touchWorkspace = (path) => {
        if (typeof path === 'string' && path !== '')
            recentWorkspaces.add(projectKey(path));
    };
    ctx.effect(() => {
        const tools = [
            memoirRecordTool(store),
            memoirUpdateTool(store),
            memoirReadTool(store, () => {
                const current = liveSettings.get().settings;
                return { defaultLimit: current.readDefaultLimit, maxLimit: current.readMaxLimit };
            }, retrieval),
        ];
        const disposers = tools.map((tool) => ctx.tools.register(tool));
        return () => {
            for (const dispose of disposers)
                dispose();
        };
    }, 'dsh-memoir: tools');
    ctx.effect(() => {
        const diagnostics = (path) => {
            const current = liveSettings.get().settings;
            const budget = { targetTokens: current.hotMemoryTokens, hardMaxTokens: current.hotMemoryMaxTokens };
            const entries = typeof path === 'string' && path !== '' ? store.entries(path) : [];
            const hot = entries.length === 0 ? null : selectHotMemory(entries, budget);
            const stats = store.stats();
            const latest = snapshotManager.latest();
            return {
                storeRevision: stats.revision,
                snapshotEpoch: stats.epoch,
                cache: stats,
                snapshotCount: snapshotManager.size,
                snapshotMax: snapshotManager.cap,
                hotMemory: hot === null ? null : {
                    selected: hot.selected.length,
                    total: hot.total,
                    estimatedTokens: hot.estimatedTokens,
                },
                retrieval: retrieval.diagnostics(),
                snapshot: latest === undefined ? null : {
                    hash: latest.hash,
                    createdAt: latest.createdAt,
                    storeRevision: latest.storeRevision,
                },
                config: {
                    announceToAgent: current.announceToAgent,
                    autoDistill: current.autoDistill,
                    autoDistillEvery: current.autoDistillEvery,
                    autoDistillCooldownMin: current.autoDistillCooldownMin,
                    autoDistillMinTools: current.autoDistillMinTools,
                    hotMemoryTokens: current.hotMemoryTokens,
                    hotMemoryMaxTokens: current.hotMemoryMaxTokens,
                    readDefaultLimit: current.readDefaultLimit,
                    readMaxLimit: current.readMaxLimit,
                    sessionSnapshotMax: current.sessionSnapshotMax,
                    queryCacheSize: current.queryCacheSize,
                },
            };
        };
        const hotMemoryPreview = (path) => {
            if (typeof path !== 'string' || path === '')
                return null;
            const entries = store.entries(path);
            if (entries.length === 0)
                return null;
            const current = liveSettings.get().settings;
            const hot = selectHotMemory(entries, {
                targetTokens: current.hotMemoryTokens,
                hardMaxTokens: current.hotMemoryMaxTokens,
            });
            return {
                text: hot.text,
                selected: hot.selected,
                total: hot.total,
                estimatedTokens: hot.estimatedTokens,
            };
        };
        const allowedWorkspace = (path) => recentWorkspaces.has(projectKey(path)) || store.project(path) !== undefined;
        const disposers = makeRoutes(store, diagnostics, retrieval, hotMemoryPreview, allowedWorkspace, undefined, liveSettings).map((route) => ctx.webServer.register(route));
        return () => {
            for (const dispose of disposers)
                dispose();
        };
    }, 'dsh-memoir: routes');
    ctx.effect(() => installAutoDistill(autoDistillWire(ctx), {
        enabled: () => liveSettings.get().settings.autoDistill,
        policy: () => {
            const current = liveSettings.get().settings;
            return {
                every: current.autoDistillEvery,
                cooldownMin: current.autoDistillCooldownMin,
                minTools: current.autoDistillMinTools,
            };
        },
    }), 'dsh-memoir: auto-distill');
    ctx.effect(() => liveSettings.subscribe(({ settings }) => {
        snapshotManager.resize(settings.sessionSnapshotMax);
        retrieval.resizeCache(settings.queryCacheSize);
    }), 'dsh-memoir: live cache capacities');
    ctx.effect(() => ctx.systemPrompt.section({
        name: 'plugin:dsh-memoir',
        order: SECTION_ORDER,
        // Always observe the trusted assembly cwd for Web write authorization.
        // When announcement is disabled, the provider returns no prompt content.
        // Hot-memory budgets are read live for each new session snapshot.
        text: (context) => {
            const cwd = context?.agent?.session?.header?.cwd;
            if (typeof cwd === 'string' && cwd !== '')
                touchWorkspace(cwd);
            const current = liveSettings.get().settings;
            if (!current.announceToAgent)
                return '';
            return memoirSectionText(store, context, snapshotManager, {
                targetTokens: current.hotMemoryTokens,
                hardMaxTokens: current.hotMemoryMaxTokens,
            });
        },
    }), 'dsh-memoir: live prompt section');
}
