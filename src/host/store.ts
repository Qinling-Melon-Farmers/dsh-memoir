/**
 * Structured memory store for dsh-memoir — the single source of truth is the
 * global index JSON (~/.dsh/dsh-memoir.json); the per-project PROJECT_MEMORY.md
 * is a regenerated human-readable rendering of the same entries (git-friendly,
 * auto-injected into future sessions). Pure node:fs, no cordis dependency —
 * unit-testable with an injected path.
 */

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** Global index format version. */
export const FORMAT_VERSION = 2

/** Project memory file name (workspace root, git-committable). */
export const PROJECT_FILE = 'PROJECT_MEMORY.md'

/** Section keys, human labels, and markdown headers (fixed order for rendering). */
export const SECTIONS: Record<SectionKey, { label: string; header: string }> = {
  work: { label: '工作记录', header: '## 工作记录 Work Log' },
  lessons: { label: '经验教训', header: '## 经验教训 Lessons Learned' },
  actions: { label: '行动指南', header: '## 行动指南 Action Guide' },
  note: { label: '备注', header: '## 备注 Notes' },
}

/** Section keys in canonical render order. */
export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[]

/** Cap on how much project memory is auto-injected into the prompt (bytes). */
export const INJECT_LIMIT = 16000

export type SectionKey = 'work' | 'lessons' | 'actions' | 'note'

/** One structured memory entry. */
export interface MemoirEntry {
  id: string
  section: SectionKey
  title?: string
  content: string
  time: number
  sessionId?: string
}

/** One project's bucket in the global index. */
export interface MemoirProject {
  path: string
  title: string
  updatedAt: number
  entries: MemoirEntry[]
}

/** The persisted store file shape. */
export interface MemoirStoreFile {
  version: number
  projects: Record<string, MemoirProject>
}

/** A record payload accepted from tools and the panel API. */
export interface EntryPayload {
  section: SectionKey
  title?: string
  content: string
}

/** Default store location: <home>/.dsh/dsh-memoir.json. */
export function defaultStorePath(): string {
  return join(homedir(), '.dsh', 'dsh-memoir.json')
}

/** `YYYY-MM-DD HH:mm` in local time. */
export function formatTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Normalize one workspace path into a stable key (strip trailing separators). */
export function projectKey(cwd: string): string {
  return String(cwd).replace(/[\\/]+$/, '')
}

/** Project display title: the last path segment. */
export function projectTitle(cwd: string): string {
  return projectKey(cwd).split(/[\\/]/).filter(Boolean).pop() || projectKey(cwd)
}

/** Mint one entry id (opaque, locally unique). */
function mintId(): string {
  return randomBytes(6).toString('hex')
}

/** Atomic write (tmp + rename), creating the parent dir. */
export function writeFileAtomic(path: string, content: string, mode = 0o644): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, content, { encoding: 'utf8', mode })
  renameSync(tmp, path)
}

/** Trim a long text to a bounded tail for prompt injection. */
export function bounded(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `…（内容较长，仅显示最近 ${limit} 字节）…\n` + value.slice(-limit)
}

/** Validate one record payload; returns an error message or undefined. */
export function validateEntryPayload(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return 'payload must be a JSON object'
  const record = payload as Record<string, unknown>
  if (typeof record.section !== 'string' || !Object.prototype.hasOwnProperty.call(SECTIONS, record.section)) {
    return `section must be one of ${SECTION_KEYS.join('/')}`
  }
  if (typeof record.content !== 'string' || record.content.trim() === '') return 'content is required'
  if (record.title !== undefined && (typeof record.title !== 'string' || record.title.length > 200)) {
    return 'title must be a string of at most 200 chars'
  }
  return undefined
}

/**
 * The structured memory store.
 */
export class MemoirStore {
  /** The store file path. */
  readonly path: string

  /**
   * @param path - store file path (defaults to the standard location).
   */
  constructor(path?: string) {
    this.path = path ?? defaultStorePath()
  }

  /** Load and normalize the store (fresh empty store on absence/corruption). */
  load(): MemoirStoreFile {
    let parsed: Partial<MemoirStoreFile> = { version: FORMAT_VERSION, projects: {} }
    if (existsSync(this.path)) {
      try {
        const raw: unknown = JSON.parse(readFileSync(this.path, 'utf8'))
        if (typeof raw === 'object' && raw !== null && typeof (raw as MemoirStoreFile).projects === 'object' && (raw as MemoirStoreFile).projects !== null) {
          parsed = raw as Partial<MemoirStoreFile>
        }
      } catch {
        // Corrupt store: start fresh (the project markdown files remain as
        // human-readable history and are not destroyed).
      }
    }
    // Normalize: mint missing entry ids, coerce shapes defensively.
    const projects: Record<string, MemoirProject> = {}
    for (const [key, project] of Object.entries(parsed.projects ?? {})) {
      if (typeof project !== 'object' || project === null) continue
      const rawEntries: unknown[] = Array.isArray(project.entries) ? project.entries : []
      const entries: MemoirEntry[] = rawEntries
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .map((e) => ({
              id: typeof e.id === 'string' && e.id !== '' ? e.id : mintId(),
              section: typeof e.section === 'string' && Object.prototype.hasOwnProperty.call(SECTIONS, e.section) ? (e.section as SectionKey) : 'note',
              title: typeof e.title === 'string' && e.title !== '' ? e.title : undefined,
              content: typeof e.content === 'string' ? e.content : '',
              time: typeof e.time === 'number' && Number.isFinite(e.time) ? e.time : Date.now(),
              ...(typeof e.sessionId === 'string' && e.sessionId !== '' ? { sessionId: e.sessionId } : {}),
            }))
      projects[key] = {
        path: typeof project.path === 'string' && project.path !== '' ? project.path : key,
        title: typeof project.title === 'string' && project.title !== '' ? project.title : projectTitle(key),
        updatedAt: typeof project.updatedAt === 'number' ? project.updatedAt : (entries[entries.length - 1]?.time ?? Date.now()),
        entries,
      }
    }
    return { version: FORMAT_VERSION, projects }
  }

  /** Persist the store atomically (0600 — may contain user's notes). */
  save(file: MemoirStoreFile): void {
    writeFileAtomic(this.path, JSON.stringify(file, null, 2) + '\n', 0o600)
  }

  /** One project record, or undefined. */
  project(cwd: string): MemoirProject | undefined {
    return this.load().projects[projectKey(cwd)]
  }

  /** Entries of one project in insertion order. */
  entries(cwd: string): MemoirEntry[] {
    return this.project(cwd)?.entries ?? []
  }

  /** Compact per-project summaries (path, title, entry count, updatedAt). */
  listProjects(): Array<{ key: string; path: string; title: string; count: number; updatedAt: number }> {
    const store = this.load()
    return Object.entries(store.projects).map(([key, project]) => ({
      key,
      path: project.path,
      title: project.title,
      count: project.entries.length,
      updatedAt: project.updatedAt,
    }))
  }

  /** Append one entry and regenerate the project markdown. Returns the entry. */
  record(cwd: string, payload: EntryPayload, sessionId?: string): MemoirEntry {
    const error = validateEntryPayload(payload)
    if (error !== undefined) throw new Error(error)
    const store = this.load()
    const key = projectKey(cwd)
    const project = (store.projects[key] ??= {
      path: key,
      title: projectTitle(key),
      updatedAt: Date.now(),
      entries: [],
    })
    const entry: MemoirEntry = {
      id: mintId(),
      section: payload.section,
      ...(typeof payload.title === 'string' && payload.title.trim() !== '' ? { title: payload.title.trim() } : {}),
      content: payload.content.trim(),
      time: Date.now(),
      ...(typeof sessionId === 'string' && sessionId !== '' ? { sessionId } : {}),
    }
    project.entries.push(entry)
    project.updatedAt = entry.time
    this.save(store)
    this.writeProjectFile(cwd)
    return entry
  }

  /** Remove one entry by id; regenerates the project markdown. */
  remove(cwd: string, id: string): boolean {
    const store = this.load()
    const key = projectKey(cwd)
    const project = store.projects[key]
    if (project === undefined) return false
    const index = project.entries.findIndex((e) => e.id === id)
    if (index < 0) return false
    project.entries.splice(index, 1)
    project.updatedAt = Date.now()
    this.save(store)
    this.writeProjectFile(cwd)
    return true
  }

  /** Render one entry as a markdown bullet line. */
  renderEntryLine(entry: MemoirEntry): string {
    const label = SECTIONS[entry.section]?.label ?? entry.section
    const when = formatTime(entry.time)
    const head = entry.title !== undefined ? `${entry.title} — ` : ''
    return `- [${when}] [${label}] ${head}${entry.content}`
  }

  /** Regenerate the full PROJECT_MEMORY.md content for one project. */
  renderMarkdown(cwd: string): string {
    const entries = this.entries(cwd)
    const header = [
      '# 项目持久记忆 Project Memory',
      '',
      '> 本文件由 dsh-memoir 插件维护：记录本项目历次会话的工作归纳、经验教训与行动指南，',
      '> 作为未来 AGENTS 接手本项目时的行动指南。会话开始时自动注入 system prompt。',
      '',
    ]
    const body: string[] = []
    for (const key of SECTION_KEYS) {
      const group = entries.filter((e) => e.section === key)
      if (group.length === 0) continue
      body.push(SECTIONS[key].header, '')
      for (const entry of group) body.push(this.renderEntryLine(entry))
      body.push('')
    }
    if (body.length === 0) {
      body.push('> 暂无条目。让 agent 用 memoir_record 沉淀，或在「记忆」面板中手动记录。', '')
    }
    return [...header, ...body].join('\n')
  }

  /** Regenerate and write the project memory file; returns its path. */
  writeProjectFile(cwd: string): string {
    const path = join(cwd, PROJECT_FILE)
    writeFileAtomic(path, this.renderMarkdown(cwd))
    return path
  }
}
