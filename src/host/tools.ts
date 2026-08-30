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

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { MEMOIR_STATUSES, SECTION_KEYS, formatTime, projectTitle, validateEntryUpdate } from './store.js'
import type { EntryUpdate, MemoirEntry, MemoirSource, MemoirStore } from './store.js'
import type { RetrievalEngine } from './retrieval.js'
import { governedRecord, type RecordResolution } from './governance.js'
import type { SimilarityCandidate } from './similarity.js'
import { DEFAULT_MEMOIR_LANGUAGE, hostCopy, languageFrom, sectionCopy } from './i18n.js'
import type { MemoirLanguage, MemoirLanguageSource } from './i18n.js'

/** One text content block (the only render shape these tools emit). */
export function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

/** Resolve the caller session's workspace cwd (absolute), or undefined. */
export function resolveWorkspace(exec: ToolRunContext | undefined): string | undefined {
  const cwd = exec?.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

/** Internal hard caps: bound read output regardless of stored volume. */
export const READ_GLOBAL_MAX_ENTRIES_PER_PROJECT = 50
export const READ_OUTPUT_MAX_CHARS = 16000

/** memoir_read output-shaping options (from config readDefaultLimit/readMaxLimit). */
export interface ReadToolOptions {
  defaultLimit: number
  maxLimit: number
}

/**
 * Resolve trusted source metadata from the executing agent. The tool runtime
 * does not expose a turn field directly, but it appends the matching
 * tool/call event before dispatch; rootCallId also covers code-mode nested
 * dispatches. Missing turn data degrades to session-only provenance.
 */
export function resolveMemorySource(exec: ToolRunContext | undefined): MemoirSource | undefined {
  const sessionId = exec?.agent?.id === undefined ? undefined : String(exec.agent.id)
  let turnId: number | undefined
  const callIds = new Set<string>()
  if (exec?.callId !== undefined) callIds.add(String(exec.callId))
  if (exec?.rootCallId !== undefined) callIds.add(String(exec.rootCallId))
  const events = exec?.agent?.session?.events
  if (Array.isArray(events) && callIds.size > 0) {
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index] as { type?: unknown; data?: Record<string, unknown> }
      if (event.type !== 'tool/call' || event.data === undefined || !callIds.has(String(event.data.callId ?? ''))) continue
      if (Number.isSafeInteger(event.data.turn) && (event.data.turn as number) >= 1) turnId = event.data.turn as number
      break
    }
  }
  if (sessionId === undefined && turnId === undefined) return undefined
  return {
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(turnId !== undefined ? { turnId } : {}),
  }
}

/** Static startup values or a live provider backed by GUI settings. */
export type ReadToolOptionsSource = ReadToolOptions | (() => ReadToolOptions)

/** Full-detail entry line (time + label + title + content). */
export function renderEntryFull(entry: MemoirEntry, language: MemoirLanguage = DEFAULT_MEMOIR_LANGUAGE): string {
  const label = sectionCopy(entry.section, language).label
  const when = formatTime(entry.time)
  const head = entry.title !== undefined ? entry.title + ' — ' : ''
  return '- [' + when + '] [' + label + '] ' + head + entry.content
}

/** Compact one-line entry (id + title + collapsed single-line content). */
export function renderEntryCompact(entry: MemoirEntry, maxContent = 200): string {
  const head = entry.title !== undefined && entry.title !== '' ? entry.title + ' — ' : ''
  const oneLine = entry.content.replace(/\s+/g, ' ').trim()
  const body = oneLine.length > maxContent ? oneLine.slice(0, maxContent) + '…' : oneLine
  return '- [' + entry.id + '] ' + head + body
}

/** Append a truncation note when the limit clipped the output. */
function clippedNote(total: number, shown: number, language: MemoirLanguage): string {
  return hostCopy(language).read.clipped(total, shown)
}

/**
 * Incremental output budget (v0.4.2): blocks are appended in RANK order and
 * the budget stops accepting once the char cap is reached. This preserves
 * the highest-ranked head of the result set — the old tail slice kept the
 * bottom of the list and dropped exactly the entries the ranking put first.
 */
class OutputBudget {
  private readonly parts: string[] = []
  private used = 0
  private overflow = false
  private readonly max: number

  constructor(max: number) {
    this.max = max
  }

  /** Add one block; returns false once the budget is exhausted. */
  add(text: string): boolean {
    if (text === '') return true
    if (this.overflow) return false
    const cost = this.used === 0 ? text.length : text.length + 2 // two-char newline separator
    if (this.used + cost > this.max) {
      this.overflow = true
      return false
    }
    this.parts.push(text)
    this.used += cost
    return true
  }

  get text(): string {
    return this.parts.join('\n\n')
  }

  get clipped(): boolean {
    return this.overflow
  }
}

/** Append grouped entries ('## section' headers + bullets) into the budget. */
function appendGrouped(
  budget: OutputBudget,
  entries: MemoirEntry[],
  renderEntry: (entry: MemoirEntry) => string,
  language: MemoirLanguage,
): number {
  let shown = 0
  let lastSection = ''
  for (const entry of entries) {
    if (entry.section !== lastSection) {
      lastSection = entry.section
      if (!budget.add('## ' + sectionCopy(entry.section, language).label)) break
    }
    if (!budget.add(renderEntry(entry))) break
    shown++
  }
  return shown
}

function candidateValue(candidate: SimilarityCandidate) {
  const content = candidate.entry.content.length > 600
    ? candidate.entry.content.slice(0, 600) + '…'
    : candidate.entry.content
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
  }
}

/** The record tool: persist one memory entry with pre-write governance. */
export function memoirRecordTool(store: MemoirStore, retrieval: RetrievalEngine, languageSource: MemoirLanguageSource = DEFAULT_MEMOIR_LANGUAGE) {
  const currentLanguage = (): MemoirLanguage => languageFrom(languageSource)
  const initial = hostCopy(currentLanguage()).record
  return defineTool({
    name: 'memoir_record',
    description: initial.description,
    parameters: {
      section: {
        type: 'string',
        required: true,
        enum: [...SECTION_KEYS],
        description: initial.section,
      },
      title: {
        type: 'string',
        description: initial.title,
      },
      content: {
        type: 'string',
        required: true,
        description: initial.content,
      },
      importance: {
        type: 'number',
        description: initial.importance,
      },
      pinned: {
        type: 'boolean',
        description: initial.pinned,
      },
      supersedes: {
        type: 'array',
        description: initial.supersedes,
      },
      tags: {
        type: 'array',
        description: initial.tags,
      },
      resolution: {
        type: 'string',
        enum: ['update', 'supersede', 'force-record'],
        description: initial.resolution,
      },
      targetId: {
        type: 'string',
        description: initial.targetId,
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
        const copy = hostCopy(currentLanguage()).record
        if (value.action === 'needs-resolution') {
          const candidates = value.candidates.map((candidate) =>
            `- ${candidate.kind} [${candidate.id}] ${candidate.title ?? candidate.content.slice(0, 80)} ` +
            `(score=${candidate.score.toFixed(3)}, bm25=${candidate.bm25.toFixed(3)}, title=${candidate.titleSimilarity.toFixed(3)}, jaccard=${candidate.tokenJaccard.toFixed(3)})`,
          ).join('\n')
          return text(
            `${copy.needsResolution(value.candidates.length)}\n${candidates}\n${copy.resolutionInstruction}`,
          )
        }
        const verb = value.action === 'updated' ? copy.updated : value.action === 'superseded' ? copy.superseded : copy.recorded
        return text(verb + ' [' + value.section + '] ' + (value.title !== undefined && value.title !== '' ? value.title + ' ' : '') + '(id: ' + value.id + ')')
      },
    },
    async execute(args, exec) {
      const language = currentLanguage()
      const cwd = resolveWorkspace(exec)
      if (cwd === undefined) {
        throw new Error(hostCopy(language).record.noWorkspace)
      }
      const result = governedRecord(store, retrieval, cwd, {
        section: args.section,
        ...(args.title !== undefined ? { title: args.title } : {}),
        content: args.content,
        ...(args.importance !== undefined ? { importance: args.importance } : {}),
        ...(args.pinned !== undefined ? { pinned: args.pinned } : {}),
        ...(Array.isArray(args.supersedes) ? { supersedes: args.supersedes.filter((id): id is string => typeof id === 'string') } : {}),
        ...(Array.isArray(args.tags) ? { tags: args.tags.filter((tag): tag is string => typeof tag === 'string') } : {}),
      }, {
        source: resolveMemorySource(exec),
        language,
        ...(args.resolution !== undefined ? { resolution: args.resolution as RecordResolution } : {}),
        ...(args.targetId !== undefined ? { targetId: args.targetId } : {}),
      })
      const candidates = result.candidates.map(candidateValue)
      if (result.entry === undefined) {
        return { section: args.section, action: result.action, recorded: result.recorded, candidates }
      }
      const entry = result.entry
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
      }
    },
  })
}

/** Update one existing entry while preserving its id and creation time. */
export function memoirUpdateTool(store: MemoirStore, languageSource: MemoirLanguageSource = DEFAULT_MEMOIR_LANGUAGE) {
  const currentLanguage = (): MemoirLanguage => languageFrom(languageSource)
  const initial = hostCopy(currentLanguage()).update
  return defineTool({
    name: 'memoir_update',
    description: initial.description,
    parameters: {
      id: {
        type: 'string',
        required: true,
        description: initial.id,
      },
      section: {
        type: 'string',
        enum: [...SECTION_KEYS],
        description: initial.section,
      },
      title: {
        type: 'string',
        description: initial.title,
      },
      content: {
        type: 'string',
        description: initial.content,
      },
      importance: {
        type: 'number',
        description: initial.importance,
      },
      pinned: {
        type: 'boolean',
        description: initial.pinned,
      },
      status: {
        type: 'string',
        enum: [...MEMOIR_STATUSES],
        description: initial.status,
      },
      supersedes: {
        type: 'array',
        description: initial.supersedes,
      },
      tags: {
        type: 'array',
        description: initial.tags,
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
      render: (_args, value) => text(hostCopy(currentLanguage()).update.rendered + ' [' + value.section + '] (id: ' + value.id + ', status: ' + value.status + ')'),
    },
    async execute(args, exec) {
      const language = currentLanguage()
      const copy = hostCopy(language).update
      const cwd = resolveWorkspace(exec)
      if (cwd === undefined) {
        throw new Error(copy.noWorkspace)
      }
      const patch: EntryUpdate = {
        ...(args.section !== undefined ? { section: args.section } : {}),
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.content !== undefined ? { content: args.content } : {}),
        ...(args.importance !== undefined ? { importance: args.importance } : {}),
        ...(args.pinned !== undefined ? { pinned: args.pinned } : {}),
        ...(args.status !== undefined ? { status: args.status } : {}),
        ...(Array.isArray(args.supersedes) ? { supersedes: args.supersedes.filter((id): id is string => typeof id === 'string') } : {}),
        ...(Array.isArray(args.tags) ? { tags: args.tags.filter((tag): tag is string => typeof tag === 'string') } : {}),
      }
      const validation = validateEntryUpdate(patch, language)
      if (validation !== undefined) throw new Error(validation)
      const entry = store.update(cwd, args.id, patch)
      if (entry === undefined) throw new Error(copy.notFound(args.id))
      return { id: entry.id, section: entry.section, status: entry.status ?? 'active', updated: true }
    },
  })
}

/** The read tool: project / global / all memory with optional filters. */
export function memoirReadTool(
  store: MemoirStore,
  options?: ReadToolOptionsSource,
  retrieval?: RetrievalEngine,
  languageSource: MemoirLanguageSource = DEFAULT_MEMOIR_LANGUAGE,
) {
  const currentLanguage = (): MemoirLanguage => languageFrom(languageSource)
  const currentOptions = (): ReadToolOptions => {
    const value = typeof options === 'function' ? options() : options
    const defaultLimit = Math.max(1, Math.floor(value?.defaultLimit ?? 8))
    const maxLimit = Math.max(defaultLimit, Math.floor(value?.maxLimit ?? 30))
    return { defaultLimit, maxLimit }
  }
  const initial = currentOptions()
  const initialCopy = hostCopy(currentLanguage()).read
  return defineTool({
    name: 'memoir_read',
    description: initialCopy.description(initial.defaultLimit),
    parameters: {
      scope: {
        type: 'string',
        enum: ['project', 'global', 'all'],
        description: initialCopy.scope,
      },
      section: {
        type: 'string',
        enum: [...SECTION_KEYS],
        description: initialCopy.section,
      },
      query: {
        type: 'string',
        description: initialCopy.query,
      },
      limit: {
        type: 'number',
        description: initialCopy.limit(initial.defaultLimit, initial.maxLimit),
      },
      detail: {
        type: 'string',
        enum: ['compact', 'full'],
        description: initialCopy.detail,
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
      const language = currentLanguage()
      const copy = hostCopy(language).read
      const { defaultLimit, maxLimit } = currentOptions()
      const scope = args.scope ?? 'project'
      const cwd = resolveWorkspace(exec)
      const detail = args.detail ?? 'compact'
      const rawLimit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.floor(args.limit) : defaultLimit
      const limit = Math.min(maxLimit, Math.max(1, rawLimit))
      const renderEntry = detail === 'full'
        ? (entry: MemoirEntry) => renderEntryFull(entry, language)
        : renderEntryCompact
      const query = typeof args.query === 'string' ? args.query.toLowerCase() : ''
      const matches = (s: string): boolean => (query === '' ? true : String(s).toLowerCase().includes(query))
      const filterEntry = (e: MemoirEntry): boolean =>
        (e.status ?? 'active') === 'active' &&
        (args.section === undefined || e.section === args.section) && matches((e.title ?? '') + ' ' + e.content)

      // v0.4.2: output is assembled through a rank-order budget — the top of
      // the ranked list always survives truncation.
      const budget = new OutputBudget(READ_OUTPUT_MAX_CHARS)
      const renderedIds = new Set<string>()

      if (scope === 'project' || (scope === 'all' && cwd !== undefined)) {
        if (cwd === undefined) {
          budget.add(copy.noWorkspace)
        } else {
          // v0.4.1: query → ranked recall (BM25 + boosts), no query → newest first.
          const ranked = query !== '' && retrieval !== undefined
            ? retrieval.cachedSearch(query, { section: args.section, cwd, limit, detail })
            : []
          if (ranked.length > 0) {
            const entries = ranked.slice(0, limit).map((r) => r.entry)
            for (const entry of entries) renderedIds.add(entry.id)
            appendGrouped(budget, entries, renderEntry, language)
            if (ranked.length > entries.length) budget.add(clippedNote(ranked.length, entries.length, language))
          } else {
            const matched = store.entries(cwd).filter(filterEntry)
            if (matched.length === 0) {
              budget.add(copy.projectEmpty(cwd, query !== '' || args.section !== undefined))
            } else {
              const entries = matched.slice(-limit)
              for (const entry of entries) renderedIds.add(entry.id)
              appendGrouped(budget, entries, renderEntry, language)
              if (matched.length > entries.length) budget.add(clippedNote(matched.length, entries.length, language))
            }
          }
        }
      }

      if (scope === 'global' || scope === 'all') {
        const ranked = query !== '' && retrieval !== undefined
          ? retrieval.cachedSearch(query, { section: args.section, limit, detail })
          : []
        if (ranked.length > 0) {
          // v0.4.2: the limit is a true global Top-K — slice first, then
          // group by project for rendering (never per-project × limit).
          const top = ranked.filter((result) => !renderedIds.has(result.entry.id)).slice(0, limit)
          const grouped = new Map<string, MemoirEntry[]>()
          for (const result of top) {
            const bucket = grouped.get(result.projectPath) ?? []
            bucket.push(result.entry)
            grouped.set(result.projectPath, bucket)
          }
          for (const [path, entries] of grouped) {
            if (!budget.add(['### ' + projectTitle(path), copy.path + ': ' + path].join('\n'))) break
            for (const entry of entries) {
              if (!budget.add(renderEntry(entry))) break
            }
          }
          if (ranked.length > top.length) budget.add(clippedNote(ranked.length, top.length, language))
        } else {
          const projects = store.listProjects()
          for (const project of projects) {
            const matched = store.entries(project.path).filter((entry) => !renderedIds.has(entry.id) && filterEntry(entry))
            if (matched.length === 0) continue
            const entries = matched.slice(-Math.min(limit, READ_GLOBAL_MAX_ENTRIES_PER_PROJECT))
            if (!budget.add(['### ' + (project.title || projectTitle(project.path)), copy.path + ': ' + project.path + '  ' + copy.updated + ': ' + formatTime(project.updatedAt)].join('\n'))) break
            for (const entry of entries) {
              if (!budget.add(renderEntry(entry))) break
            }
            if (matched.length > entries.length) budget.add(clippedNote(matched.length, entries.length, language))
          }
          if (budget.text === '') budget.add(copy.globalEmpty)
        }
      }

      const text = budget.text
      if (budget.clipped) {
        return { text: text + '\n\n' + copy.outputClipped(READ_OUTPUT_MAX_CHARS) }
      }
      return { text }
    },
  })
}

