/**
 * dsh-memoir — host half.
 *
 * 把「一个会话做了什么 / 踩了什么坑 / 下一步怎么走」沉淀为项目持久化记忆，
 * 并作为未来 AGENTS 的行动指南：
 *   - 项目级记忆：<工作区>/PROJECT_MEMORY.md（随 git 提交，会话开始时自动注入）
 *   - 全局索引：~/.dsh/dsh-memoir.json（跨项目检索，不自动注入，按需读取）
 *
 * 提供的 agent 工具：
 *   - memoir_record(section, title?, content)  记录一条记忆（work/lessons/actions/note）
 *   - memoir_read(scope?, section?, query?)     读取记忆（project/global/all）
 *
 * 全部基于官方 NPM SDK（@deepseek-ai/dsh-tools），不改 DSH 源码；
 * 通过 cordis.patch.yml 的 insert 行挂载到 web profile。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** Stable cordis plugin name. */
export const name = 'memoir'

/** Services required before the memory tools can mount. */
export const inject = ['tools', 'systemPrompt']

/** Project memory file name (kept at the workspace root, git-committable). */
const PROJECT_FILE = 'PROJECT_MEMORY.md'

/** Global index format version. */
const FORMAT_VERSION = 1

/** Section keys and their markdown headers / human labels. */
const SECTIONS = {
  work: { header: '## 工作记录 Work Log', label: '工作记录' },
  lessons: { header: '## 经验教训 Lessons Learned', label: '经验教训' },
  actions: { header: '## 行动指南 Action Guide', label: '行动指南' },
  note: { header: '## 备注 Notes', label: '备注' },
}

/** Cap on how much project memory is auto-injected into the prompt (bytes). */
const INJECT_LIMIT = 16000

/** One text content block (the only render shape these tools emit). */
function text(value) {
  return [{ type: 'text', text: value }]
}

/** Global index file: <home>/.dsh/dsh-memoir.json. */
function globalStorePath() {
  return join(homedir(), '.dsh', 'dsh-memoir.json')
}

/** Project memory file for one workspace. */
function projectMemoryPath(cwd) {
  return join(cwd, PROJECT_FILE)
}

/** `YYYY-MM-DD HH:mm` in local time. */
function formatTime(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Atomic write (tmp + rename), creating the parent dir. */
function writeFileAtomic(path, content, mode = 0o644) {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, content, { encoding: 'utf8', mode })
  renameSync(tmp, path)
}

/** Load the global index; returns a fresh empty store on absence/corruption. */
function loadGlobalStore() {
  const path = globalStorePath()
  if (!existsSync(path)) return { version: FORMAT_VERSION, projects: {} }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.projects !== 'object') {
      throw new Error('bad shape')
    }
    return parsed
  } catch {
    return { version: FORMAT_VERSION, projects: {} }
  }
}

/** Save the global index atomically. */
function saveGlobalStore(store) {
  writeFileAtomic(globalStorePath(), JSON.stringify(store, null, 2) + '\n', 0o600)
}

/** Read the project memory file ('' when absent). */
function loadProjectMemory(cwd) {
  const path = projectMemoryPath(cwd)
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf8')
}

/** Project file skeleton written on first use. */
const PROJECT_HEADER = [
  '# 项目持久记忆 Project Memory',
  '',
  '> 本文件由 dsh-memoir 插件维护：记录本项目历次会话的工作归纳、经验教训与行动指南，',
  '> 作为未来 AGENTS 接手本项目时的行动指南。会话开始时自动注入 system prompt。',
  '',
].join('\n')

/** Build one dated bullet line for a record entry. */
function entryLine(section, title, content, time) {
  const label = SECTIONS[section].label
  const when = formatTime(time)
  const head = title && title.trim() !== '' ? `${title.trim()} — ` : ''
  return `- [${when}] [${label}] ${head}${content}`
}

/** Insert `line` under the markdown section `header`, creating it if missing. */
function appendUnderSection(markdown, header, line) {
  const idx = markdown.indexOf(header)
  if (idx === -1) {
    return `${markdown.trimEnd()}\n\n${header}\n\n${line}\n`
  }
  const next = markdown.indexOf('\n## ', idx + header.length)
  if (next === -1) {
    return `${markdown.trimEnd()}\n${line}\n`
  }
  return `${markdown.slice(0, next)}${line}\n${markdown.slice(next)}`
}

/** Append one entry to the project memory file (creating it if needed). */
function appendProjectEntry(cwd, section, title, content, time) {
  const line = entryLine(section, title, content, time)
  let markdown = loadProjectMemory(cwd)
  if (markdown.trim() === '') markdown = PROJECT_HEADER
  const header = SECTIONS[section].header
  writeFileAtomic(projectMemoryPath(cwd), appendUnderSection(markdown, header, line))
}

/** Append one entry to the global index (keyed by normalized workspace path). */
function appendGlobalEntry(cwd, section, title, content, time, sessionId) {
  const store = loadGlobalStore()
  const key = cwd.replace(/[\\/]+$/, '')
  const project = (store.projects[key] ??= {
    path: cwd,
    title: key.split(/[\\/]/).filter(Boolean).pop() || key,
    updatedAt: time,
    entries: [],
  })
  project.updatedAt = time
  project.entries.push({
    section,
    title: title && title.trim() !== '' ? title.trim() : undefined,
    content,
    time,
    sessionId,
  })
  saveGlobalStore(store)
}

/** Resolve the caller session's workspace cwd (absolute), or undefined. */
function resolveWorkspace(exec) {
  const cwd = exec && exec.agent && exec.agent.session && exec.agent.session.header
    ? exec.agent.session.header.cwd
    : undefined
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

/** Trim a long text to a bounded tail for prompt injection. */
function bounded(value, limit) {
  if (value.length <= limit) return value
  return `…（内容较长，仅显示最近 ${limit} 字节）…\n` + value.slice(-limit)
}

/** Render one global project bucket into readable text. */
function renderGlobalProject(key, project) {
  const lines = [`### ${project.title || key}`, `path: ${project.path}`, `updated: ${formatTime(project.updatedAt)}`]
  for (const entry of project.entries.slice(-50)) {
    const label = SECTIONS[entry.section] ? SECTIONS[entry.section].label : entry.section
    const head = entry.title ? `${entry.title} — ` : ''
    lines.push(`- [${formatTime(entry.time)}] [${label}] ${head}${entry.content}`)
  }
  return lines.join('\n')
}

/** The record tool: persist one work / lesson / action / note entry. */
function memoirRecordTool() {
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
        enum: ['work', 'lessons', 'actions', 'note'],
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
          projectFile: { type: 'string', required: true },
          globalIndex: { type: 'string', required: true },
          recordedAt: { type: 'string', required: true },
        },
      },
      render: (_args, value) =>
        text(
          `已记录 [${value.section}] 记忆\n` +
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
      const time = Date.now()
      const sessionId = exec.agent && exec.agent.id ? String(exec.agent.id) : undefined
      appendProjectEntry(cwd, args.section, args.title, args.content, time)
      appendGlobalEntry(cwd, args.section, args.title, args.content, time, sessionId)
      return {
        section: args.section,
        projectFile: projectMemoryPath(cwd),
        globalIndex: globalStorePath(),
        recordedAt: formatTime(time),
      }
    },
  })
}

/** The read tool: project / global / all memory, with optional filters. */
function memoirReadTool() {
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
        enum: ['work', 'lessons', 'actions', 'note'],
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
      const matches = (s) => {
        if (query === '') return true
        return String(s).toLowerCase().includes(query)
      }

      const parts = []

      if (scope === 'project' || scope === 'all') {
        if (cwd === undefined) {
          parts.push('（无法确定会话工作区，跳过项目记忆）')
        } else {
          const markdown = loadProjectMemory(cwd)
          if (markdown.trim() === '') {
            parts.push(`本项目（${cwd}）暂无持久记忆。可用 memoir_record 沉淀。`)
          } else if (query === '') {
            parts.push(markdown.trimEnd())
          } else {
            const kept = markdown
              .split(/\r?\n/)
              .filter((line) => matches(line))
              .join('\n')
            parts.push(kept.trim() === '' ? '（项目记忆中没有匹配的内容）' : kept)
          }
        }
      }

      if (scope === 'global' || scope === 'all') {
        const store = loadGlobalStore()
        const keys = Object.keys(store.projects)
        if (keys.length === 0) {
          parts.push('（全局索引为空）')
        } else {
          const out = []
          for (const key of keys) {
            const project = store.projects[key]
            const entries = project.entries.filter(
              (e) => (args.section === undefined || e.section === args.section) && matches(`${e.title ?? ''} ${e.content}`),
            )
            if (entries.length === 0) continue
            out.push(renderGlobalProject(key, { ...project, entries }))
          }
          parts.push(out.length > 0 ? out.join('\n\n') : '（全局索引中没有匹配的内容）')
        }
      }

      return { text: parts.filter((p) => p !== '').join('\n\n') }
    },
  })
}

/** Model-facing announcement: plugin presence, capabilities, and usage rules. */
export const MEMOIR_GUIDANCE =
  '本机已安装 dsh-memoir 插件（项目持久化记忆 / 会话经验沉淀）：把每个会话的工作归纳、经验教训与行动指南写入项目记忆，作为未来 AGENTS 的行动指南。' +
  '能力：memoir_record 记录一条记忆（section：work 工作记录 / lessons 经验教训 / actions 行动指南 / note 备注）；memoir_read 读取记忆（scope：project 本项目 / global 全局跨项目 / all 全部）。' +
  '记忆位置：项目级 <工作区>/PROJECT_MEMORY.md（随 git 提交、会话开始时自动注入下方）；全局索引 ~/.dsh/dsh-memoir.json（跨项目检索，按需读取）。' +
  '使用约定：一个阶段性任务收尾时，主动归纳「做了什么 / 踩了什么坑 / 下一步怎么走」，用 memoir_record 沉淀；开始新会话或接手旧项目时，先用 memoir_read 读取项目记忆与行动指南。' +
  '下方「项目持久记忆」为本项目已沉淀内容，请据此协作，并在产生新经验时更新。'

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 150

/**
 * Mount the memory tools and the per-project announcement.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin context.
 * @param {{ enabled?: boolean, announceToAgent?: boolean } | undefined} config - resolved plugin config.
 */
export function apply(ctx, config) {
  const enabled = config?.enabled ?? true
  const announceToAgent = config?.announceToAgent ?? true

  ctx.effect(() => {
    if (!enabled) return
    const tools = [memoirRecordTool(), memoirReadTool()]
    const disposers = tools.map((tool) => ctx.tools.register(tool))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-memoir: tools')

  if (enabled && announceToAgent) {
    ctx.systemPrompt.section({
      name: 'plugin:dsh-memoir',
      order: SECTION_ORDER,
      // text is a provider evaluated per assembly, so each project's memory is
      // injected for its own session and not for unrelated workspaces.
      text: (context) => {
        const cwd = context && context.agent && context.agent.session && context.agent.session.header
          ? context.agent.session.header.cwd
          : undefined
        if (typeof cwd !== 'string' || cwd === '') return MEMOIR_GUIDANCE
        const project = loadProjectMemory(cwd)
        if (project.trim() === '') return MEMOIR_GUIDANCE
        return `${MEMOIR_GUIDANCE}\n\n## 项目持久记忆（自动注入）\n${bounded(project.trimEnd(), INJECT_LIMIT)}`
      },
    })
  }
}
