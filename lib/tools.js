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
import { defineTool } from '@deepseek-ai/dsh-tools';
import { MEMOIR_STATUSES, SECTIONS, SECTION_KEYS, formatTime, projectTitle, validateEntryUpdate } from './store.js';
import { governedRecord } from './governance.js';
/** One text content block (the only render shape these tools emit). */
export function text(value) {
    return [{ type: 'text', text: value }];
}
/** Resolve the caller session's workspace cwd (absolute), or undefined. */
export function resolveWorkspace(exec) {
    const cwd = exec?.agent?.session?.header?.cwd;
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined;
}
/** Internal hard caps: bound read output regardless of stored volume. */
export const READ_GLOBAL_MAX_ENTRIES_PER_PROJECT = 50;
export const READ_OUTPUT_MAX_CHARS = 16000;
/**
 * Resolve trusted source metadata from the executing agent. The tool runtime
 * does not expose a turn field directly, but it appends the matching
 * tool/call event before dispatch; rootCallId also covers code-mode nested
 * dispatches. Missing turn data degrades to session-only provenance.
 */
export function resolveMemorySource(exec) {
    const sessionId = exec?.agent?.id === undefined ? undefined : String(exec.agent.id);
    let turnId;
    const callIds = new Set();
    if (exec?.callId !== undefined)
        callIds.add(String(exec.callId));
    if (exec?.rootCallId !== undefined)
        callIds.add(String(exec.rootCallId));
    const events = exec?.agent?.session?.events;
    if (Array.isArray(events) && callIds.size > 0) {
        for (let index = events.length - 1; index >= 0; index--) {
            const event = events[index];
            if (event.type !== 'tool/call' || event.data === undefined || !callIds.has(String(event.data.callId ?? '')))
                continue;
            if (Number.isSafeInteger(event.data.turn) && event.data.turn >= 1)
                turnId = event.data.turn;
            break;
        }
    }
    if (sessionId === undefined && turnId === undefined)
        return undefined;
    return {
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(turnId !== undefined ? { turnId } : {}),
    };
}
/** Full-detail entry line (time + label + title + content). */
export function renderEntryFull(entry) {
    const label = SECTIONS[entry.section]?.label ?? entry.section;
    const when = formatTime(entry.time);
    const head = entry.title !== undefined ? entry.title + ' — ' : '';
    return '- [' + when + '] [' + label + '] ' + head + entry.content;
}
/** Compact one-line entry (id + title + collapsed single-line content). */
export function renderEntryCompact(entry, maxContent = 200) {
    const head = entry.title !== undefined && entry.title !== '' ? entry.title + ' — ' : '';
    const oneLine = entry.content.replace(/\s+/g, ' ').trim();
    const body = oneLine.length > maxContent ? oneLine.slice(0, maxContent) + '…' : oneLine;
    return '- [' + entry.id + '] ' + head + body;
}
/** Append a truncation note when the limit clipped the output. */
function clippedNote(total, shown) {
    return '（共 ' + total + ' 条匹配，仅显示 ' + shown + ' 条，可用 limit 参数调整）';
}
/**
 * Incremental output budget (v0.4.2): blocks are appended in RANK order and
 * the budget stops accepting once the char cap is reached. This preserves
 * the highest-ranked head of the result set — the old tail slice kept the
 * bottom of the list and dropped exactly the entries the ranking put first.
 */
class OutputBudget {
    parts = [];
    used = 0;
    overflow = false;
    max;
    constructor(max) {
        this.max = max;
    }
    /** Add one block; returns false once the budget is exhausted. */
    add(text) {
        if (text === '')
            return true;
        if (this.overflow)
            return false;
        const cost = this.used === 0 ? text.length : text.length + 2; // two-char newline separator
        if (this.used + cost > this.max) {
            this.overflow = true;
            return false;
        }
        this.parts.push(text);
        this.used += cost;
        return true;
    }
    get text() {
        return this.parts.join('\n\n');
    }
    get clipped() {
        return this.overflow;
    }
}
/** Append grouped entries ('## section' headers + bullets) into the budget. */
function appendGrouped(budget, entries, renderEntry) {
    let shown = 0;
    let lastSection = '';
    for (const entry of entries) {
        if (entry.section !== lastSection) {
            lastSection = entry.section;
            if (!budget.add('## ' + (SECTIONS[entry.section]?.label ?? entry.section)))
                break;
        }
        if (!budget.add(renderEntry(entry)))
            break;
        shown++;
    }
    return shown;
}
function candidateValue(candidate) {
    const content = candidate.entry.content.length > 600
        ? candidate.entry.content.slice(0, 600) + '…'
        : candidate.entry.content;
    return {
        id: candidate.entry.id,
        kind: candidate.kind,
        ...(candidate.entry.title !== undefined ? { title: candidate.entry.title } : {}),
        content,
        score: candidate.score,
        bm25: candidate.components.bm25,
        titleSimilarity: candidate.components.title,
        tokenJaccard: candidate.components.tokenJaccard,
        reasons: candidate.reasons,
    };
}
/** The record tool: persist one memory entry with pre-write governance. */
export function memoirRecordTool(store, retrieval) {
    return defineTool({
        name: 'memoir_record',
        description: '把一条记忆写入项目持久记忆，供未来会话继承。阶段任务收尾时归纳「做了什么(work)/经验教训(lessons)/下一步行动(actions)」分条记录。' +
            '写入前会返回疑似重复/冲突候选且不自动改动；收到候选后必须明确选择 resolution=update（更新候选）、supersede（新结论替代候选）或 force-record（确认并存）。' +
            'Triggers: 记录经验教训、沉淀记忆、归纳工作、更新行动指南、总结踩坑。',
        parameters: {
            section: {
                type: 'string',
                required: true,
                enum: [...SECTION_KEYS],
                description: '记忆分类：work 工作记录 / lessons 经验教训 / actions 行动指南 / note 备注。',
            },
            title: {
                type: 'string',
                description: '可选，一句话标题（如「修复 pet 悬停闪退」）。',
            },
            content: {
                type: 'string',
                required: true,
                description: '记忆正文：具体做了什么、结论、教训或下一步怎么做。建议精炼、可执行。',
            },
            importance: {
                type: 'number',
                description: 'Optional importance from 1 to 5; defaults to 3.',
            },
            pinned: {
                type: 'boolean',
                description: 'Optional flag keeping this entry prominent.',
            },
            supersedes: {
                type: 'array',
                description: 'Optional ids of entries this record explicitly supersedes.',
            },
            tags: {
                type: 'array',
                description: 'Optional tags for later filtering and explanation.',
            },
            resolution: {
                type: 'string',
                enum: ['update', 'supersede', 'force-record'],
                description: '仅在相似候选出现后使用：update 更新 targetId；supersede 新建并替代 targetId；force-record 明确保留两条。',
            },
            targetId: {
                type: 'string',
                description: 'resolution=update/supersede 时必填的候选记忆 id；force-record 不使用。',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    section: { type: 'string', required: true },
                    action: { type: 'string', required: true, enum: ['recorded', 'needs-resolution', 'updated', 'superseded', 'force-recorded'] },
                    recorded: { type: 'boolean', required: true },
                    id: { type: 'string' },
                    title: { type: 'string' },
                    projectFile: { type: 'string' },
                    globalIndex: { type: 'string' },
                    recordedAt: { type: 'string' },
                    candidates: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                id: { type: 'string', required: true },
                                kind: { type: 'string', required: true, enum: ['duplicate', 'conflict'] },
                                title: { type: 'string' },
                                content: { type: 'string', required: true },
                                score: { type: 'number', required: true },
                                bm25: { type: 'number', required: true },
                                titleSimilarity: { type: 'number', required: true },
                                tokenJaccard: { type: 'number', required: true },
                                reasons: { type: 'array', required: true, items: { type: 'string' } },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => {
                if (value.action === 'needs-resolution') {
                    const candidates = value.candidates.map((candidate) => `- ${candidate.kind} [${candidate.id}] ${candidate.title ?? candidate.content.slice(0, 80)} ` +
                        `(score=${candidate.score.toFixed(3)}, bm25=${candidate.bm25.toFixed(3)}, title=${candidate.titleSimilarity.toFixed(3)}, jaccard=${candidate.tokenJaccard.toFixed(3)})`).join('\n');
                    return text(`检测到 ${value.candidates.length} 条疑似重复/冲突记忆，本次未写入：\n${candidates}\n` +
                        '请再次调用 memoir_record，并明确选择 resolution=update + targetId、resolution=supersede + targetId，或 resolution=force-record。');
                }
                const verb = value.action === 'updated' ? '已更新' : value.action === 'superseded' ? '已记录并替代旧记忆' : '已记录';
                return text(verb + ' [' + value.section + '] ' + (value.title !== undefined && value.title !== '' ? value.title + ' ' : '') + '(id: ' + value.id + ')');
            },
        },
        async execute(args, exec) {
            const cwd = resolveWorkspace(exec);
            if (cwd === undefined) {
                throw new Error('无法确定会话工作区（缺少 agent cwd）；请在项目会话内调用 memoir_record');
            }
            const result = governedRecord(store, retrieval, cwd, {
                section: args.section,
                ...(args.title !== undefined ? { title: args.title } : {}),
                content: args.content,
                ...(args.importance !== undefined ? { importance: args.importance } : {}),
                ...(args.pinned !== undefined ? { pinned: args.pinned } : {}),
                ...(Array.isArray(args.supersedes) ? { supersedes: args.supersedes.filter((id) => typeof id === 'string') } : {}),
                ...(Array.isArray(args.tags) ? { tags: args.tags.filter((tag) => typeof tag === 'string') } : {}),
            }, {
                source: resolveMemorySource(exec),
                ...(args.resolution !== undefined ? { resolution: args.resolution } : {}),
                ...(args.targetId !== undefined ? { targetId: args.targetId } : {}),
            });
            const candidates = result.candidates.map(candidateValue);
            if (result.entry === undefined) {
                return { section: args.section, action: result.action, recorded: result.recorded, candidates };
            }
            const entry = result.entry;
            return {
                section: entry.section,
                action: result.action,
                recorded: result.recorded,
                id: entry.id,
                ...(entry.title !== undefined ? { title: entry.title } : {}),
                // record() already regenerated the project file — never write twice.
                projectFile: store.projectFilePath(cwd),
                globalIndex: store.path,
                recordedAt: formatTime(entry.time),
                candidates,
            };
        },
    });
}
/** Update one existing entry while preserving its id and creation time. */
export function memoirUpdateTool(store) {
    return defineTool({
        name: 'memoir_update',
        description: '更新一条已有记忆的标题、正文、分类或生命周期状态，不删除历史。需要替换旧结论时优先更新或使用 status=superseded；' +
            '更新后会同步 PROJECT_MEMORY.md 与 Hot Memory。Triggers: 修改记忆、纠正结论、归档记忆、标记过时、替代旧记忆。',
        parameters: {
            id: {
                type: 'string',
                required: true,
                description: '要更新的记忆 id（先用 memoir_read 获取）。',
            },
            section: {
                type: 'string',
                enum: [...SECTION_KEYS],
                description: '可选，新的记忆分类。',
            },
            title: {
                type: 'string',
                description: '可选，新的标题；传空字符串清除标题。',
            },
            content: {
                type: 'string',
                description: '可选，新的正文（不能为空）。',
            },
            importance: {
                type: 'number',
                description: '可选，重要性 1 到 5。',
            },
            pinned: {
                type: 'boolean',
                description: '可选，是否置顶。',
            },
            status: {
                type: 'string',
                enum: [...MEMOIR_STATUSES],
                description: '可选，active / superseded / archived。',
            },
            supersedes: {
                type: 'array',
                description: '可选，此条目显式替代的旧记忆 id 列表；目标会标记为 superseded。',
            },
            tags: {
                type: 'array',
                description: '可选，替换标签列表；传空数组清除标签。',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    id: { type: 'string', required: true },
                    section: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    updated: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => text('已更新记忆 [' + value.section + '] (id: ' + value.id + ', status: ' + value.status + ')'),
        },
        async execute(args, exec) {
            const cwd = resolveWorkspace(exec);
            if (cwd === undefined) {
                throw new Error('无法确定会话工作区（缺少 agent cwd）；请在项目会话内调用 memoir_update');
            }
            const patch = {
                ...(args.section !== undefined ? { section: args.section } : {}),
                ...(args.title !== undefined ? { title: args.title } : {}),
                ...(args.content !== undefined ? { content: args.content } : {}),
                ...(args.importance !== undefined ? { importance: args.importance } : {}),
                ...(args.pinned !== undefined ? { pinned: args.pinned } : {}),
                ...(args.status !== undefined ? { status: args.status } : {}),
                ...(Array.isArray(args.supersedes) ? { supersedes: args.supersedes.filter((id) => typeof id === 'string') } : {}),
                ...(Array.isArray(args.tags) ? { tags: args.tags.filter((tag) => typeof tag === 'string') } : {}),
            };
            const validation = validateEntryUpdate(patch);
            if (validation !== undefined)
                throw new Error(validation);
            const entry = store.update(cwd, args.id, patch);
            if (entry === undefined)
                throw new Error('找不到记忆条目：' + args.id);
            return { id: entry.id, section: entry.section, status: entry.status ?? 'active', updated: true };
        },
    });
}
/** The read tool: project / global / all memory with optional filters. */
export function memoirReadTool(store, options, retrieval) {
    const currentOptions = () => {
        const value = typeof options === 'function' ? options() : options;
        const defaultLimit = Math.max(1, Math.floor(value?.defaultLimit ?? 8));
        const maxLimit = Math.max(defaultLimit, Math.floor(value?.maxLimit ?? 30));
        return { defaultLimit, maxLimit };
    };
    const initial = currentOptions();
    return defineTool({
        name: 'memoir_read',
        description: '读取项目持久记忆与经验教训（默认返回最近 ' + initial.defaultLimit + ' 条 compact 摘要）。开始新会话或接手旧项目时先调用。' +
            'Triggers: 读取记忆、回顾项目历史、查询经验教训、接手项目、查看行动指南。',
        parameters: {
            scope: {
                type: 'string',
                enum: ['project', 'global', 'all'],
                description: '读取范围：project 仅本项目（默认）/ global 全局跨项目 / all 全部。',
            },
            section: {
                type: 'string',
                enum: [...SECTION_KEYS],
                description: '可选，只返回某一分类。',
            },
            query: {
                type: 'string',
                description: '可选，本地相关性检索标题与正文：支持中文短语、英文关键词、代码标识符与路径，并按相关性排序。',
            },
            limit: {
                type: 'number',
                description: '可选，最多返回条数（启动默认 ' + initial.defaultLimit + '，启动最大 ' + initial.maxLimit + '；Web 设置可实时覆盖）。',
            },
            detail: {
                type: 'string',
                enum: ['compact', 'full'],
                description: '输出形态：compact 单行摘要（默认）/ full 完整正文。',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    text: { type: 'string', required: true },
                },
            },
            render: (_args, value) => text(value.text),
        },
        async execute(args, exec) {
            const { defaultLimit, maxLimit } = currentOptions();
            const scope = args.scope ?? 'project';
            const cwd = resolveWorkspace(exec);
            const detail = args.detail ?? 'compact';
            const rawLimit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.floor(args.limit) : defaultLimit;
            const limit = Math.min(maxLimit, Math.max(1, rawLimit));
            const renderEntry = detail === 'full' ? renderEntryFull : renderEntryCompact;
            const query = typeof args.query === 'string' ? args.query.toLowerCase() : '';
            const matches = (s) => (query === '' ? true : String(s).toLowerCase().includes(query));
            const filterEntry = (e) => (e.status ?? 'active') === 'active' &&
                (args.section === undefined || e.section === args.section) && matches((e.title ?? '') + ' ' + e.content);
            // v0.4.2: output is assembled through a rank-order budget — the top of
            // the ranked list always survives truncation.
            const budget = new OutputBudget(READ_OUTPUT_MAX_CHARS);
            const renderedIds = new Set();
            if (scope === 'project' || (scope === 'all' && cwd !== undefined)) {
                if (cwd === undefined) {
                    budget.add('（无法确定会话工作区，跳过项目记忆）');
                }
                else {
                    // v0.4.1: query → ranked recall (BM25 + boosts), no query → newest first.
                    const ranked = query !== '' && retrieval !== undefined
                        ? retrieval.cachedSearch(query, { section: args.section, cwd, limit, detail })
                        : [];
                    if (ranked.length > 0) {
                        const entries = ranked.slice(0, limit).map((r) => r.entry);
                        for (const entry of entries)
                            renderedIds.add(entry.id);
                        appendGrouped(budget, entries, renderEntry);
                        if (ranked.length > entries.length)
                            budget.add(clippedNote(ranked.length, entries.length));
                    }
                    else {
                        const matched = store.entries(cwd).filter(filterEntry);
                        if (matched.length === 0) {
                            budget.add('本项目（' + cwd + '）暂无' + (query !== '' || args.section !== undefined ? '匹配的' : '') + '持久记忆。可用 memoir_record 沉淀。');
                        }
                        else {
                            const entries = matched.slice(-limit);
                            for (const entry of entries)
                                renderedIds.add(entry.id);
                            appendGrouped(budget, entries, renderEntry);
                            if (matched.length > entries.length)
                                budget.add(clippedNote(matched.length, entries.length));
                        }
                    }
                }
            }
            if (scope === 'global' || scope === 'all') {
                const ranked = query !== '' && retrieval !== undefined
                    ? retrieval.cachedSearch(query, { section: args.section, limit, detail })
                    : [];
                if (ranked.length > 0) {
                    // v0.4.2: the limit is a true global Top-K — slice first, then
                    // group by project for rendering (never per-project × limit).
                    const top = ranked.filter((result) => !renderedIds.has(result.entry.id)).slice(0, limit);
                    const grouped = new Map();
                    for (const result of top) {
                        const bucket = grouped.get(result.projectPath) ?? [];
                        bucket.push(result.entry);
                        grouped.set(result.projectPath, bucket);
                    }
                    for (const [path, entries] of grouped) {
                        if (!budget.add(['### ' + projectTitle(path), 'path: ' + path].join('\n')))
                            break;
                        for (const entry of entries) {
                            if (!budget.add(renderEntry(entry)))
                                break;
                        }
                    }
                    if (ranked.length > top.length)
                        budget.add(clippedNote(ranked.length, top.length));
                }
                else {
                    const projects = store.listProjects();
                    for (const project of projects) {
                        const matched = store.entries(project.path).filter((entry) => !renderedIds.has(entry.id) && filterEntry(entry));
                        if (matched.length === 0)
                            continue;
                        const entries = matched.slice(-Math.min(limit, READ_GLOBAL_MAX_ENTRIES_PER_PROJECT));
                        if (!budget.add(['### ' + (project.title || projectTitle(project.path)), 'path: ' + project.path + '  updated: ' + formatTime(project.updatedAt)].join('\n')))
                            break;
                        for (const entry of entries) {
                            if (!budget.add(renderEntry(entry)))
                                break;
                        }
                        if (matched.length > entries.length)
                            budget.add(clippedNote(matched.length, entries.length));
                    }
                    if (budget.text === '')
                        budget.add('（全局索引中没有匹配的内容）');
                }
            }
            const text = budget.text;
            if (budget.clipped) {
                return { text: text + '\n\n（输出超过 ' + READ_OUTPUT_MAX_CHARS + ' 字符上限，已保留相关性最高/最新的部分）' };
            }
            return { text };
        },
    });
}
