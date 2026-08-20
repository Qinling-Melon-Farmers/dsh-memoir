/**
 * Bilingual surface copy (zh-first). Pure — no DOM, unit-testable.
 * The shell owns <html lang>; the panel reads it at render time.
 */

export type Lang = 'zh' | 'en'

export const dictionaries: Record<Lang, Record<string, string>> = {
  zh: {
    'entry.label': '记忆',
    'entry.tooltip': '打开记忆面板（项目记忆 / 全局记忆）',
    'panel.title': '记忆 Memoir',
    'panel.close': '关闭',
    'panel.refresh': '刷新',
    'tab.project': '项目记忆',
    'tab.global': '全局记忆',
    'toolbar.search': '搜索标题与正文…',
    'toolbar.add': '添加记忆',
    'toolbar.cancel': '取消',
    'form.section': '分类',
    'form.title': '标题（可选）',
    'form.content': '内容',
    'form.submit': '记录',
    'form.placeholder.title': '一句话标题，如「修复 pet 悬停闪退」',
    'form.placeholder.content': '具体做了什么、结论、教训或下一步怎么做。建议精炼、可执行。',
    'empty.project': '本项目暂无持久记忆',
    'empty.projectHint': '让 agent 用 memoir_record 沉淀经验，或点「添加记忆」手动记录。',
    'empty.workspace': '未打开项目会话',
    'empty.workspaceHint': '打开一个项目会话后，这里显示该项目的持久记忆。',
    'empty.global': '全局索引为空',
    'empty.globalHint': '在任何项目里用 memoir_record 记录后，会出现在这里供跨项目检索。',
    'empty.search': '没有匹配的条目',
    'load.failed': '加载失败',
    'record.failed': '记录失败',
    'delete.failed': '删除失败',
    'delete.confirm': '删除这条记忆？',
    'updated': '更新于',
    'entries': '条',
    'session': '会话',
    'sections.work': '工作记录',
    'sections.lessons': '经验教训',
    'sections.actions': '行动指南',
    'sections.note': '备注',
    'diag.title': 'Memory Diagnostics',
    'diag.revision': 'Store revision',
    'diag.snapshot': 'Session snapshots',
    'diag.cache': 'Store cache',
    'diag.render': 'Render cache',
    'diag.hot': 'Hot memory',
    'diag.retrieval': 'Retrieval 索引',
    'diag.qcache': 'Query cache',
    'diag.lastQuery': '最近查询',
    'diag.snapshotInfo': '会话快照',
    'inspector.title': 'Hot Memory 预览',
    'inspector.empty': '本工作区暂无 Hot Memory',
    'search.ranked': '按相关性排序',
    'filter.status': '状态',
    'status.active': '活跃',
    'status.superseded': '已被替代',
    'status.archived': '已归档',
    'lifecycle.pin': '置顶',
    'lifecycle.unpin': '取消置顶',
    'lifecycle.archive': '归档',
    'lifecycle.restore': '恢复',
  },
  en: {
    'entry.label': 'Memory',
    'entry.tooltip': 'Open the memory panel (project / global)',
    'panel.title': 'Memory Memoir',
    'panel.close': 'Close',
    'panel.refresh': 'Refresh',
    'tab.project': 'Project',
    'tab.global': 'Global',
    'toolbar.search': 'Search titles and content…',
    'toolbar.add': 'Add entry',
    'toolbar.cancel': 'Cancel',
    'form.section': 'Section',
    'form.title': 'Title (optional)',
    'form.content': 'Content',
    'form.submit': 'Record',
    'form.placeholder.title': 'A one-line title, e.g. "Fix pet hover crash"',
    'form.placeholder.content': 'What was done, the conclusion, the lesson, or the next step. Concise and actionable.',
    'empty.project': 'No persistent memory in this project yet',
    'empty.projectHint': 'Ask the agent to distill via memoir_record, or add an entry manually.',
    'empty.workspace': 'No project session open',
    'empty.workspaceHint': 'Open a project session to see its persistent memory here.',
    'empty.global': 'The global index is empty',
    'empty.globalHint': 'Entries recorded via memoir_record in any project appear here for cross-project search.',
    'empty.search': 'No matching entries',
    'load.failed': 'Failed to load',
    'record.failed': 'Failed to record',
    'delete.failed': 'Failed to delete',
    'delete.confirm': 'Delete this entry?',
    'updated': 'Updated',
    'entries': 'entries',
    'session': 'session',
    'sections.work': 'Work Log',
    'sections.lessons': 'Lessons Learned',
    'sections.actions': 'Action Guide',
    'sections.note': 'Notes',
    'diag.title': 'Memory Diagnostics',
    'diag.revision': 'Store revision',
    'diag.snapshot': 'Session snapshots',
    'diag.cache': 'Store cache',
    'diag.render': 'Render cache',
    'diag.hot': 'Hot memory',
    'diag.retrieval': 'Retrieval index',
    'diag.qcache': 'Query cache',
    'diag.lastQuery': 'Last query',
    'diag.snapshotInfo': 'Session snapshot',
    'inspector.title': 'Hot Memory Inspector',
    'inspector.empty': 'No hot memory in this workspace yet',
    'search.ranked': 'Ranked by relevance',
    'filter.status': 'Status',
    'status.active': 'Active',
    'status.superseded': 'Superseded',
    'status.archived': 'Archived',
    'lifecycle.pin': 'Pin',
    'lifecycle.unpin': 'Unpin',
    'lifecycle.archive': 'Archive',
    'lifecycle.restore': 'Restore',
  },
}

/** Section keys in canonical display order. */
export const SECTION_KEYS: string[] = ['work', 'lessons', 'actions', 'note']

/** Minimal document surface for language detection. */
export interface DocumentLike {
  documentElement?: { lang?: string }
}

/** Current UI language: zh when the shell's <html lang> starts with zh. */
export function detectLanguage(documentLike: DocumentLike | undefined): Lang {
  const lang = documentLike?.documentElement?.lang
  return typeof lang === 'string' && lang.startsWith('zh') ? 'zh' : 'en'
}

/** Pure translation lookup: `translate(lang, key)` with en fallback. */
export function translate(lang: string, key: string): string {
  const dict = dictionaries[lang as Lang] ?? dictionaries.en
  return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : (dictionaries.en[key] ?? key)
}

/** Bound translator reading the live <html lang> at each call. */
export function makeT(documentLike: DocumentLike): (key: string) => string {
  return (key) => translate(detectLanguage(documentLike), key)
}
