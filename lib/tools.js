/**
 * Agent tools for dsh-memoir: memoir_record (persist one work / lesson /
 * action / note entry) and memoir_read (read project / global memory). Both
 * tools resolve the caller's workspace from the executing agent's session cwd
 * and delegate all persistence to the structured MemoirStore.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { SECTIONS, SECTION_KEYS, formatTime, projectKey, projectTitle } from './store.js'

/** One text content block (the only render shape these tools emit). */
export function text(value) {
  return [{ type: 'text', text: value }]
}

/** Resolve the caller session's workspace cwd (absolute), or undefined. */
export function resolveWorkspace(exec) {
  const cwd = exec && exec.agent && exec.agent.session && exec.agent.session.header
    ? exec.agent.session.header.cwd
    : undefined
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

/** Render one entry as a read-tool text line. */
function renderEntry(entry) {
  const label = SECTIONS[entry.section]?.label ?? entry.section
  const when = formatTime(entry.time)
  const head = entry.title !== undefined ? `${entry.title} — ` : ''
  return `- [${when}] [${label}] ${head}${entry.content}`
}

/** The record tool: persist one memory entry. */
export function memoirRecordTool(store) {
  return defineTool({
    name: 'memoir_record',
    description:
      '把一条「项目持久记忆」写入本项目的 PROJECT_MEMORY.md 与全局索引 ~/.dsh/dsh-memoir.json。' +
      '用途：一个阶段性任务收尾时，归纳「做了什么（work）/ 踩了什么坑与经验教训（lessons）/ 下一步行动指南（actions）」，供未来 AGENTS 接手时读取。' +
      'Triggers: 记录经验教训、沉淀记忆、归纳本会话工作、更新项目行动指南、总结踩坑。',
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
          projectFile: { type: 'string', required: true },
          globalIndex: { type: 'string', required: true },
          recordedAt: { type: 'string', required: true },
        },
      },
      render: (_args, value) =>
        text(
          `已记录 [${value.section}] 记忆 (id: ${value.id})\n` +
            `- 项目记忆：${value.projectFile}\n` +
            `- 全局索引：${value.globalIndex}\n` +
            `- 时间：${value.recordedAt}`,
        ),
    },
    async execute(args, exec) {
      const cwd = resolveWorkspace(exec)
      if (cwd === undefined) {
        throw new Error('无法确定会话工作区（缺少 agent cwd）；请在项目会话内调用 memoir_record')
      }
      const sessionId = exec.agent && exec.agent.id ? String(exec.agent.id) : undefined
      const entry = store.record(cwd, args, sessionId)
      return {
        section: entry.section,
        id: entry.id,
        projectFile: store.writeProjectFile(cwd),
        globalIndex: store.path,
        recordedAt: formatTime(entry.time),
      }
    },
  })
}

/** The read tool: project / global / all memory with optional filters. */
export function memoirReadTool(store) {
  return defineTool({
    name: 'memoir_read',
    description:
      '读取项目持久记忆与经验教训。开始新会话或接手旧项目时先调用，了解既有工作归纳、经验教训与行动指南。' +
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
      const query = typeof args.query === 'string' ? args.query.toLowerCase() : ''
      const matches = (s) => (query === '' ? true : String(s).toLowerCase().includes(query))
      const filterEntry = (e) => (args.section === undefined || e.section === args.section) && matches(`${e.title ?? ''} ${e.content}`)

      const parts = []

      if (scope === 'project' || scope === 'all') {
        if (cwd === undefined) {
          parts.push('（无法确定会话工作区，跳过项目记忆）')
        } else {
          const entries = store.entries(cwd).filter(filterEntry)
          if (entries.length === 0) {
            parts.push(`本项目（${cwd}）暂无${query !== '' || args.section !== undefined ? '匹配的' : ''}持久记忆。可用 memoir_record 沉淀。`)
          } else {
            const lines = []
            let lastSection = ''
            for (const entry of entries) {
              if (entry.section !== lastSection) {
                lines.push(`## ${SECTIONS[entry.section]?.header ?? entry.section}`)
                lastSection = entry.section
              }
              lines.push(renderEntry(entry))
            }
            parts.push(lines.join('\n'))
          }
        }
      }

      if (scope === 'global' || scope === 'all') {
        const projects = store.listProjects()
        const out = []
        for (const project of projects) {
          const entries = store.entries(project.path).filter(filterEntry)
          if (entries.length === 0) continue
          out.push(
            [
              `### ${project.title || projectTitle(project.path)}`,
              `path: ${project.path}  updated: ${formatTime(project.updatedAt)}`,
              ...entries.slice(-50).map(renderEntry),
            ].join('\n'),
          )
        }
        parts.push(out.length > 0 ? out.join('\n\n') : '（全局索引中没有匹配的内容）')
      }

      return { text: parts.filter((p) => p !== '').join('\n\n') }
    },
  })
}
