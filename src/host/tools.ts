/**
 * Agent tools for dsh-memoir: memoir_record (persist one work / lesson /
 * action / note entry) and memoir_read (read project / global memory). Both
 * tools resolve the caller's workspace from the executing agent's session cwd
 * and delegate all persistence to the structured MemoirStore.
 *
 * v0.3.1: section headers no longer duplicate "##"; project/global reads are
 * bounded by internal hard caps; descriptions and renders are trimmed.
 * v0.4.0: memoir_read gains limit (default 8, max 30) and detail
 * (compact default / full) so reads are cheap by default.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { SECTIONS, SECTION_KEYS, formatTime, projectTitle } from './store.js'
import type { MemoirEntry, MemoirStore } from './store.js'

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

/** Full-detail entry line (time + label + title + content). */
export function renderEntryFull(entry: MemoirEntry): string {
  const label = SECTIONS[entry.section]?.label ?? entry.section
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
function clippedNote(total: number, shown: number): string {
  return '（共 ' + total + ' 条匹配，仅显示 ' + shown + ' 条，可用 limit 参数调整）'
}

/** Clamp the assembled text to the global output budget (tail-preserving). */
function clampOutput(parts: string[]): string {
  const text = parts.filter((p) => p !== '').join('\n\n')
  if (text.length <= READ_OUTPUT_MAX_CHARS) return text
  return '（输出超过 ' + READ_OUTPUT_MAX_CHARS + ' 字符，已截断至末尾部分）\n' + text.slice(-READ_OUTPUT_MAX_CHARS)
}

/** The record tool: persist one memory entry. */
export function memoirRecordTool(store: MemoirStore) {
  return defineTool({
    name: 'memoir_record',
    description:
      '把一条记忆写入项目持久记忆，供未来会话继承。阶段任务收尾时归纳「做了什么(work)/经验教训(lessons)/下一步行动(actions)」分条记录。' +
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
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          section: { type: 'string', required: true },
          id: { type: 'string', required: true },
          title: { type: 'string' },
          projectFile: { type: 'string', required: true },
          globalIndex: { type: 'string', required: true },
          recordedAt: { type: 'string', required: true },
        },
      },
      // Minimal text: the structured fields stay available for debugging, but
      // the agent-facing render is one line (paths/timestamps add no value).
      render: (_args, value) =>
        text('已记录 [' + value.section + '] ' + (value.title !== undefined && value.title !== '' ? value.title + ' ' : '') + '(id: ' + value.id + ')'),
    },
    async execute(args, exec) {
      const cwd = resolveWorkspace(exec)
      if (cwd === undefined) {
        throw new Error('无法确定会话工作区（缺少 agent cwd）；请在项目会话内调用 memoir_record')
      }
      const sessionId = exec?.agent?.id ? String(exec.agent.id) : undefined
      const entry = store.record(cwd, args, sessionId)
      return {
        section: entry.section,
        id: entry.id,
        ...(entry.title !== undefined ? { title: entry.title } : {}),
        // record() already regenerated the project file — never write twice.
        projectFile: store.projectFilePath(cwd),
        globalIndex: store.path,
        recordedAt: formatTime(entry.time),
      }
    },
  })
}

/** The read tool: project / global / all memory with optional filters. */
export function memoirReadTool(store: MemoirStore, options?: ReadToolOptions) {
  const defaultLimit = options?.defaultLimit ?? 8
  const maxLimit = options?.maxLimit ?? 30
  return defineTool({
    name: 'memoir_read',
    description:
      '读取项目持久记忆与经验教训（默认返回最近 ' + defaultLimit + ' 条 compact 摘要）。开始新会话或接手旧项目时先调用。' +
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
        description: '可选，模糊过滤（匹配标题与正文子串，不区分大小写）。',
      },
      limit: {
        type: 'number',
        description: '可选，最多返回条数（默认 ' + defaultLimit + '，最大 ' + maxLimit + '）。',
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
      const scope = args.scope ?? 'project'
      const cwd = resolveWorkspace(exec)
      const detail = args.detail ?? 'compact'
      const rawLimit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.floor(args.limit) : defaultLimit
      const limit = Math.min(maxLimit, Math.max(1, rawLimit))
      const renderEntry = detail === 'full' ? renderEntryFull : renderEntryCompact
      const query = typeof args.query === 'string' ? args.query.toLowerCase() : ''
      const matches = (s: string): boolean => (query === '' ? true : String(s).toLowerCase().includes(query))
      const filterEntry = (e: MemoirEntry): boolean =>
        (args.section === undefined || e.section === args.section) && matches((e.title ?? '') + ' ' + e.content)

      const parts: string[] = []

      if (scope === 'project' || scope === 'all') {
        if (cwd === undefined) {
          parts.push('（无法确定会话工作区，跳过项目记忆）')
        } else {
          const matched = store.entries(cwd).filter(filterEntry)
          if (matched.length === 0) {
            parts.push('本项目（' + cwd + '）暂无' + (query !== '' || args.section !== undefined ? '匹配的' : '') + '持久记忆。可用 memoir_record 沉淀。')
          } else {
            const entries = matched.slice(-limit)
            const lines: string[] = []
            let lastSection = ''
            for (const entry of entries) {
              if (entry.section !== lastSection) {
                lines.push('## ' + (SECTIONS[entry.section]?.label ?? entry.section))
                lastSection = entry.section
              }
              lines.push(renderEntry(entry))
            }
            parts.push(lines.join('\n'))
            if (matched.length > entries.length) parts.push(clippedNote(matched.length, entries.length))
          }
        }
      }

      if (scope === 'global' || scope === 'all') {
        const projects = store.listProjects()
        const out: string[] = []
        for (const project of projects) {
          const matched = store.entries(project.path).filter(filterEntry)
          if (matched.length === 0) continue
          const entries = matched.slice(-Math.min(limit, READ_GLOBAL_MAX_ENTRIES_PER_PROJECT))
          out.push(
            [
              '### ' + (project.title || projectTitle(project.path)),
              'path: ' + project.path + '  updated: ' + formatTime(project.updatedAt),
              ...entries.map((entry) => renderEntry(entry)),
            ].join('\n'),
          )
        }
        parts.push(out.length > 0 ? out.join('\n\n') : '（全局索引中没有匹配的内容）')
      }

      return { text: clampOutput(parts) }
    },
  })
}

