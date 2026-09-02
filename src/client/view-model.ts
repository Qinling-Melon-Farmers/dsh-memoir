import type { WireEntry, WireProject, WireSearchResult } from './api.js'
import type { MemoirStatus, SectionKey } from './types.js'

export const ENTRY_PAGE_SIZE = 20
export const PROJECT_PAGE_SIZE = 20
export const ENTRY_PREVIEW_CHAR_LIMIT = 360
export const ENTRY_PREVIEW_LINE_LIMIT = 6

export interface EntryStats {
  total: number
  active: number
  superseded: number
  archived: number
}

export interface ProjectGroup {
  key: string
  path: string
  title: string
  updatedAt: number
  entries: WireEntry[]
  stats: EntryStats
}

export interface RankedProjectGroup extends Omit<ProjectGroup, 'entries'> {
  results: WireSearchResult[]
}

export function entryStatus(entry: WireEntry): MemoirStatus {
  return entry.status ?? 'active'
}

export function countEntryStatuses(entries: WireEntry[]): EntryStats {
  const stats: EntryStats = { total: entries.length, active: 0, superseded: 0, archived: 0 }
  for (const entry of entries) stats[entryStatus(entry)] += 1
  return stats
}

export function filterEntries(
  entries: WireEntry[],
  status: MemoirStatus | 'all',
  section: SectionKey | 'all',
): WireEntry[] {
  return entries.filter((entry) =>
    (status === 'all' || entryStatus(entry) === status)
    && (section === 'all' || entry.section === section))
}

/** Match the host's Windows case-insensitive identity without folding POSIX paths. */
export function canonicalProjectPath(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '')
  if (normalized === '') return '__unscoped__'
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized
}

export function projectTitleFromPath(path: string): string {
  if (path.trim() === '') return ''
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.at(-1) ?? path
}

function projectStats(project: WireProject): EntryStats {
  return project.stats ?? countEntryStatuses(project.entries)
}

export function buildProjectGroups(
  projects: WireProject[],
  status: MemoirStatus | 'all',
  section: SectionKey | 'all',
): ProjectGroup[] {
  return projects
    .map((project) => ({
      key: project.key || canonicalProjectPath(project.path),
      path: project.path,
      title: project.title || projectTitleFromPath(project.path),
      updatedAt: project.updatedAt,
      entries: filterEntries(project.entries, status, section),
      stats: projectStats(project),
    }))
    .filter((project) => project.entries.length > 0)
}

export function groupRankedResults(
  results: WireSearchResult[],
  projects: WireProject[],
): RankedProjectGroup[] {
  const metadata = new Map(projects.map((project) => [canonicalProjectPath(project.path), project]))
  const groups = new Map<string, RankedProjectGroup>()
  for (const result of results) {
    const canonicalPath = canonicalProjectPath(result.projectPath)
    const project = metadata.get(canonicalPath)
    const existing = groups.get(canonicalPath)
    if (existing !== undefined) {
      existing.results.push(result)
      continue
    }
    groups.set(canonicalPath, {
      key: project?.key || canonicalPath,
      path: project?.path ?? result.projectPath,
      title: project?.title || projectTitleFromPath(result.projectPath),
      updatedAt: project?.updatedAt ?? result.entry.time,
      stats: project === undefined ? countEntryStatuses([result.entry]) : projectStats(project),
      results: [result],
    })
  }
  return [...groups.values()]
}

export function shouldCollapseEntry(content: string): boolean {
  return content.length > ENTRY_PREVIEW_CHAR_LIMIT
    || content.split(/\r?\n/).length > ENTRY_PREVIEW_LINE_LIMIT
}

export function nextPageSize(current: number, total: number, pageSize: number): number {
  return Math.min(total, current + pageSize)
}
