/**
 * The memoir panel: project / global memory tabs, client-side search,
 * manual record form, per-entry delete. Rendered into the center-column
 * container by mount.tsx; visibility is CSS-driven (html data attribute).
 */

import { Fragment, useEffect, useId, useMemo, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { SECTION_KEYS } from './i18n.js'
import type { MemoirApi, WireDiagnostics, WireEntry, WireHotMemory, WireMemoirSettings, WireProject, WireRecordResolution, WireRecordResult, WireSearchResult, WireSimilarityCandidate } from './api.js'
import type { CwdTracker } from './cwd.js'
import type { PanelController } from './controller.js'
import type { MemoirStatus, SectionKey } from './types.ts'
import {
  ENTRY_PAGE_SIZE,
  PROJECT_PAGE_SIZE,
  buildProjectGroups,
  filterEntries,
  groupRankedResults,
  nextPageSize,
  shouldCollapseEntry,
  type EntryStats,
} from './view-model.js'

interface PanelProps {
  controller?: PanelController
  api: MemoirApi
  cwdTracker?: CwdTracker
  /** Native alpha slots provide a session-bound cwd directly. */
  cwd?: string
  t: (key: string) => string
  openSource?: (sessionId: string, turnId?: number) => void
  /** Native settings may close their owning shell without a legacy controller. */
  onClose?: () => void
}

const EMPTY_CWD_TRACKER: CwdTracker = {
  getSnapshot: () => '',
  subscribe: () => () => {},
}

type EntryPatch = {
  section?: SectionKey
  title?: string | null
  content?: string
  importance?: number
  pinned?: boolean
  status?: MemoirStatus
  supersedes?: string[]
  tags?: string[]
}

const parseList = (value: string): string[] =>
  [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter((item) => item !== ''))]

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(value)
      return true
    }
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  } catch {
    return false
  }
}

/** One entry's meta line: lifecycle, importance, tags and provenance. */
function EntryMeta({ entry, t, openSource }: {
  entry: WireEntry
  t: (key: string) => string
  openSource?: (sessionId: string, turnId?: number) => void
}) {
  const [copied, setCopied] = useState(false)
  const when = new Date(entry.time)
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeText = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`
  const source = entry.source ?? (entry.sessionId === undefined ? undefined : { sessionId: entry.sessionId })
  const sourceText = source === undefined
    ? ''
    : [
        source.sessionId === undefined ? undefined : `sessionId=${source.sessionId}`,
        source.turnId === undefined ? undefined : `turnId=${source.turnId}`,
      ].filter(Boolean).join('\n')
  const copySource = () => {
    void copyText(sourceText).then((ok) => {
      if (!ok) return
      setCopied(true)
      setTimeout(() => setCopied(false), 1_500)
    })
  }
  return (
    <div className="memoir-entry-meta">
      <span>{timeText}</span>
      <span className="memoir-chip">{t('sections.' + entry.section)}</span>
      {entry.status !== undefined && entry.status !== 'active'
        ? <span className="memoir-chip">{t('status.' + entry.status)}</span>
        : null}
      {entry.pinned === true ? <span className="memoir-chip">{t('lifecycle.pin')}</span> : null}
      <span className="memoir-chip" title={t('form.importanceHint')}>{t('form.importance')}: {entry.importance ?? 3}</span>
      {(entry.tags ?? []).map((tag) => <span className="memoir-chip memoir-tag" key={tag}>#{tag}</span>)}
      {(entry.supersedes?.length ?? 0) > 0
        ? <span className="memoir-chip" title={entry.supersedes?.join('\n')}>{t('form.supersedes')}: {entry.supersedes?.length}</span>
        : null}
      {source !== undefined
        ? <span className="memoir-source">
            {source.sessionId !== undefined
              ? <button type="button" className="memoir-source-link" title={t('source.open')} onClick={() => openSource?.(source.sessionId!, source.turnId)}>
                  {t('source.label')}: {source.sessionId.slice(0, 10)}{source.turnId === undefined ? '' : ` · ${t('source.turn')} ${source.turnId}`}
                </button>
              : <span>{t('source.turn')} {source.turnId}</span>}
            <button type="button" className="memoir-source-copy" title={t('source.copy')} onClick={copySource}>{copied ? t('source.copied') : '⧉'}</button>
          </span>
        : null}
    </div>
  )
}

function EntryCard({ entry, t, onDelete, onUpdate, openSource, score }: { entry: WireEntry; t: (key: string) => string; onDelete: (entry: WireEntry) => void; onUpdate?: (entry: WireEntry, patch: EntryPatch) => void; openSource?: (sessionId: string, turnId?: number) => void; score?: number }) {
  const [editing, setEditing] = useState(false)
  const [contentExpanded, setContentExpanded] = useState(false)
  const [section, setSection] = useState<SectionKey>(entry.section)
  const [title, setTitle] = useState(entry.title ?? '')
  const [content, setContent] = useState(entry.content)
  const [importance, setImportance] = useState(String(entry.importance ?? 3))
  const [tags, setTags] = useState((entry.tags ?? []).join(', '))
  const [supersedes, setSupersedes] = useState((entry.supersedes ?? []).join(', '))
  const save = () => {
    if (content.trim() === '' || onUpdate === undefined) return
    onUpdate(entry, {
      section,
      title: title.trim() === '' ? null : title.trim(),
      content: content.trim(),
      importance: Number(importance),
      tags: parseList(tags),
      supersedes: parseList(supersedes),
    })
    setEditing(false)
  }
  return (
    <div className="memoir-entry" data-dsh-part="entry">
      <button type="button" className="memoir-delete" title={t('delete.confirm')} onClick={() => onDelete(entry)}>×</button>
      {onUpdate !== undefined
        ? <div className="memoir-entry-actions">
            <button type="button" className="memoir-iconbtn" onClick={() => setEditing((value) => !value)}>{editing ? t('toolbar.cancel') : t('lifecycle.edit')}</button>
            <button type="button" className="memoir-iconbtn" onClick={() => onUpdate(entry, { pinned: entry.pinned !== true })}>{entry.pinned === true ? t('lifecycle.unpin') : t('lifecycle.pin')}</button>
            {(entry.status ?? 'active') === 'active'
              ? <button type="button" className="memoir-iconbtn" onClick={() => onUpdate(entry, { status: 'superseded' })}>{t('lifecycle.supersede')}</button>
              : <button type="button" className="memoir-iconbtn" onClick={() => onUpdate(entry, { status: 'active' })}>{t('lifecycle.unsupersede')}</button>}
            <button type="button" className="memoir-iconbtn" onClick={() => onUpdate(entry, { status: entry.status === 'archived' ? 'active' : 'archived' })}>{entry.status === 'archived' ? t('lifecycle.restore') : t('lifecycle.archive')}</button>
          </div>
        : null}
      <EntryMeta entry={entry} t={t} openSource={openSource} />
      {score !== undefined
        ? <span className="memoir-score" title={t('search.ranked')}>{score.toFixed(3)}</span>
        : null}
      {editing
        ? <div className="memoir-form memoir-entry-editor">
            <div className="memoir-field">
              <label>{t('form.section')}</label>
              <select value={section} onChange={(e) => setSection(e.target.value as SectionKey)}>
                {SECTION_KEYS.map((key) => <option key={key} value={key}>{t('sections.' + key)}</option>)}
              </select>
            </div>
            <div className="memoir-field">
              <label>{t('form.title')}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="memoir-field">
              <label>{t('form.content')}</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} />
            </div>
            <div className="memoir-form-row">
              <div className="memoir-field">
                <label>{t('form.importance')}</label>
                <select value={importance} onChange={(e) => setImportance(e.target.value)}>
                  {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="memoir-field">
                <label>{t('form.tags')}</label>
                <input value={tags} placeholder={t('form.placeholder.tags')} onChange={(e) => setTags(e.target.value)} />
              </div>
            </div>
            <div className="memoir-field">
              <label>{t('form.supersedes')}</label>
              <input value={supersedes} placeholder={t('form.placeholder.supersedes')} onChange={(e) => setSupersedes(e.target.value)} />
            </div>
            <div className="memoir-form-actions">
              <button type="button" className="memoir-iconbtn" onClick={() => setEditing(false)}>{t('toolbar.cancel')}</button>
              <button type="button" className="memoir-primary" onClick={save}>{t('lifecycle.save')}</button>
            </div>
          </div>
        : <>
            {entry.title !== undefined ? <div className="memoir-entry-title">{entry.title}</div> : null}
            <div className="memoir-entry-content" data-expanded={contentExpanded ? 'true' : undefined} data-collapsible={shouldCollapseEntry(entry.content) ? 'true' : undefined}>{entry.content}</div>
            {shouldCollapseEntry(entry.content)
              ? <button
                  type="button"
                  className="memoir-content-toggle"
                  aria-expanded={contentExpanded}
                  onClick={() => setContentExpanded((value) => !value)}
                >{contentExpanded ? t('entry.collapse') : t('entry.expand')}</button>
              : null}
          </>}
    </div>
  )
}

/** Sectioned list with a per-section progressive rendering cap. */
function SectionedEntries({ entries, t, onDelete, onUpdate, openSource, resetKey }: { entries: WireEntry[]; t: (key: string) => string; onDelete: (entry: WireEntry) => void; onUpdate?: (entry: WireEntry, patch: EntryPatch) => void; openSource?: (sessionId: string, turnId?: number) => void; resetKey: string }) {
  const [limit, setLimit] = useState(ENTRY_PAGE_SIZE)
  useEffect(() => setLimit(ENTRY_PAGE_SIZE), [resetKey])
  const groups = useMemo(
    () => SECTION_KEYS.map((key) => ({ key, entries: entries.filter((e) => e.section === key) })).filter((g) => g.entries.length > 0),
    [entries],
  )
  if (groups.length === 0) {
    return (
      <div className="memoir-empty">
        <div className="memoir-empty-title">{t('empty.search')}</div>
      </div>
    )
  }
  const visibleCount = groups.reduce((count, group) => count + Math.min(group.entries.length, limit), 0)
  const maxGroupSize = Math.max(...groups.map((group) => group.entries.length))
  const hasMore = visibleCount < entries.length
  return (
    <Fragment>
      {groups.map((group) => (
        <Fragment key={group.key}>
          <div className="memoir-section-title">
            {t('sections.' + group.key)}
            <span className="memoir-count">({group.entries.length})</span>
          </div>
          {group.entries.slice(0, limit).map((entry) => (
            <EntryCard key={entry.id} entry={entry} t={t} onDelete={onDelete} onUpdate={onUpdate} openSource={openSource} />
          ))}
        </Fragment>
      ))}
      {hasMore
        ? <div className="memoir-load-more">
            <span>{t('pagination.showing')} {visibleCount}/{entries.length}</span>
            <button type="button" className="memoir-iconbtn" onClick={() => setLimit((value) => nextPageSize(value, maxGroupSize, ENTRY_PAGE_SIZE))}>{t('pagination.more')}</button>
          </div>
        : null}
    </Fragment>
  )
}

/**
 * Ranked project search results (v0.4.2): the host RetrievalEngine order.
 * Global ranked results use the same collapsible project shell as browsing.
 */
function RankedResults({ results, pending, t, onDelete, onUpdate, openSource }: {
  results: WireSearchResult[]
  pending: boolean
  t: (key: string) => string
  onDelete: (entry: WireEntry, path: string) => void
  onUpdate?: (entry: WireEntry, path: string, patch: EntryPatch) => void
  openSource?: (sessionId: string, turnId?: number) => void
}) {
  if (pending) return <div className="memoir-empty">…</div>
  if (results.length === 0) {
    return (
      <div className="memoir-empty">
        <div className="memoir-empty-title">{t('empty.search')}</div>
        <div className="memoir-empty-hint">{t('search.ranked')}</div>
      </div>
    )
  }
  return (
    <Fragment>
      <div className="memoir-ranked-note">{t('search.ranked')}</div>
      {results.map((r) => (
        <EntryCard key={r.entry.id} entry={r.entry} score={r.score} t={t} onDelete={(entry) => onDelete(entry, r.projectPath)} onUpdate={(entry, patch) => onUpdate?.(entry, r.projectPath, patch)} openSource={openSource} />
      ))}
    </Fragment>
  )
}

function ProjectDisclosure({ project, open, t, onToggle, children }: {
  project: { path: string; title: string; updatedAt: number; stats: EntryStats }
  open: boolean
  t: (key: string) => string
  onToggle: () => void
  children: ReactNode
}) {
  const when = new Date(project.updatedAt)
  const title = project.title || t('project.unscoped')
  const path = project.path || t('project.unscopedHint')
  return (
    <section className="memoir-project-card" data-expanded={open ? 'true' : undefined}>
      <button type="button" className="memoir-project-toggle" aria-expanded={open} onClick={onToggle}>
        <span className="memoir-project-chevron" aria-hidden="true">›</span>
        <span className="memoir-project-heading">
          <span className="memoir-project-head">
            <span className="memoir-project-title">{title}</span>
            <span className="memoir-project-path" title={project.path}>{path}</span>
          </span>
          <span className="memoir-project-meta">
            <span>{t('status.active')}: {project.stats.active}</span>
            <span>{t('status.archived')}: {project.stats.archived}</span>
            <span>{t('status.superseded')}: {project.stats.superseded}</span>
            <span>{t('updated')} {when.toISOString().slice(0, 16).replace('T', ' ')}</span>
          </span>
        </span>
      </button>
      {open ? <div className="memoir-project-body">{children}</div> : null}
    </section>
  )
}

type AddPayload = {
  section: SectionKey
  title?: string
  content: string
  importance: number
  pinned: boolean
  tags: string[]
  supersedes: string[]
}

function AddForm({ t, onSubmit, onCancel }: { t: (key: string) => string; onSubmit: (payload: AddPayload) => void; onCancel: () => void }) {
  const [section, setSection] = useState<SectionKey>('lessons')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [importance, setImportance] = useState('3')
  const [pinned, setPinned] = useState(false)
  const [tags, setTags] = useState('')
  const [supersedes, setSupersedes] = useState('')
  const submit = () => {
    if (content.trim() === '') return
    onSubmit({
      section,
      title: title.trim() === '' ? undefined : title.trim(),
      content: content.trim(),
      importance: Number(importance),
      pinned,
      tags: parseList(tags),
      supersedes: parseList(supersedes),
    })
  }
  return (
    <div className="memoir-form" data-dsh-part="entry-form">
      <div className="memoir-form-row">
        <div className="memoir-field">
          <label>{t('form.section')}</label>
          <select value={section} onChange={(e) => setSection(e.target.value as SectionKey)}>
            {SECTION_KEYS.map((key) => (
              <option key={key} value={key}>{t('sections.' + key)}</option>
            ))}
          </select>
        </div>
        <div className="memoir-field">
          <label>{t('form.title')}</label>
          <input value={title} placeholder={t('form.placeholder.title')} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <div className="memoir-field">
        <label>{t('form.content')}</label>
        <textarea value={content} placeholder={t('form.placeholder.content')} onChange={(e) => setContent(e.target.value)} />
      </div>
      <div className="memoir-form-row">
        <div className="memoir-field">
          <label>{t('form.importance')}</label>
          <select value={importance} onChange={(e) => setImportance(e.target.value)}>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <small>{t('form.importanceHint')}</small>
        </div>
        <div className="memoir-field">
          <label>{t('form.tags')}</label>
          <input value={tags} placeholder={t('form.placeholder.tags')} onChange={(e) => setTags(e.target.value)} />
        </div>
      </div>
      <div className="memoir-field">
        <label>{t('form.supersedes')}</label>
        <input value={supersedes} placeholder={t('form.placeholder.supersedes')} onChange={(e) => setSupersedes(e.target.value)} />
      </div>
      <label className="memoir-settings-switch">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        <span><strong>{t('form.pinned')}</strong><small>{t('form.pinnedHint')}</small></span>
      </label>
      <div className="memoir-form-actions">
        <button type="button" className="memoir-iconbtn" onClick={onCancel}>{t('toolbar.cancel')}</button>
        <button type="button" className="memoir-primary" onClick={submit}>{t('form.submit')}</button>
      </div>
    </div>
  )
}

function SimilarityCandidateCard({ candidate, t, busy, onResolve }: {
  candidate: WireSimilarityCandidate
  t: (key: string) => string
  busy: boolean
  onResolve: (resolution: WireRecordResolution, targetId: string) => void
}) {
  return (
    <div className="memoir-similarity-candidate">
      <div className="memoir-similarity-head">
        <span className={`memoir-chip memoir-similarity-${candidate.kind}`}>{t(`similarity.kind.${candidate.kind}`)}</span>
        <strong>{candidate.entry.title ?? candidate.entry.content.slice(0, 100)}</strong>
        <span className="memoir-score-static">{Math.round(candidate.score * 100)}%</span>
      </div>
      {candidate.entry.title !== undefined ? <div className="memoir-similarity-content">{candidate.entry.content}</div> : null}
      <div className="memoir-similarity-components">
        BM25 {Math.round(candidate.components.bm25 * 100)}% · {t('similarity.titleScore')} {Math.round(candidate.components.title * 100)}% · Jaccard {Math.round(candidate.components.tokenJaccard * 100)}%
      </div>
      <div className="memoir-similarity-reasons">
        {candidate.reasons.map((reason) => <span className="memoir-chip" key={reason}>{t(`similarity.reason.${reason}`)}</span>)}
      </div>
      <div className="memoir-form-actions">
        <button type="button" className="memoir-iconbtn" disabled={busy} onClick={() => onResolve('update', candidate.entry.id)}>{t('similarity.update')}</button>
        <button type="button" className="memoir-primary" disabled={busy} onClick={() => onResolve('supersede', candidate.entry.id)}>{t('similarity.supersede')}</button>
      </div>
    </div>
  )
}

function SimilarityResolution({ result, t, busy, onResolve, onBack }: {
  result: WireRecordResult
  t: (key: string) => string
  busy: boolean
  onResolve: (resolution: WireRecordResolution, targetId?: string) => void
  onBack: () => void
}) {
  return (
    <div className="memoir-similarity" data-dsh-part="similarity-resolution">
      <div className="memoir-similarity-title">{t('similarity.title')}</div>
      <div className="memoir-settings-description">{t('similarity.description')}</div>
      {result.candidates.map((candidate) => (
        <SimilarityCandidateCard key={candidate.entry.id} candidate={candidate} t={t} busy={busy} onResolve={onResolve} />
      ))}
      <div className="memoir-similarity-footer">
        <button type="button" className="memoir-iconbtn" disabled={busy} onClick={onBack}>{t('similarity.back')}</button>
        <button type="button" className="memoir-iconbtn" disabled={busy} onClick={() => onResolve('force-record')}>{t('similarity.force')}</button>
      </div>
    </div>
  )
}

type NumericSettingsKey =
  | 'autoDistillEvery'
  | 'autoDistillCooldownMin'
  | 'autoDistillMinTools'
  | 'hotMemoryTokens'
  | 'hotMemoryMaxTokens'
  | 'readDefaultLimit'
  | 'readMaxLimit'
  | 'sessionSnapshotMax'
  | 'queryCacheSize'

const NUMERIC_SETTINGS: NumericSettingsKey[] = [
  'autoDistillEvery',
  'autoDistillCooldownMin',
  'autoDistillMinTools',
  'hotMemoryTokens',
  'hotMemoryMaxTokens',
  'readDefaultLimit',
  'readMaxLimit',
  'sessionSnapshotMax',
  'queryCacheSize',
]

/** Persistent, live complete settings shared by the panel and Settings page. */
export function MemoirSettingsPanel({ api, t, refreshKey, onChanged, defaultOpen = false, alwaysOpen = false, showDescription = true }: {
  api: MemoirApi
  t: (key: string) => string
  refreshKey: number
  onChanged: () => void
  defaultOpen?: boolean
  alwaysOpen?: boolean
  showDescription?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [settings, setSettings] = useState<WireMemoirSettings | null>(null)
  const [source, setSource] = useState<'profile' | 'web'>('profile')
  const [draft, setDraft] = useState<Record<NumericSettingsKey, string>>({
    autoDistillEvery: '1',
    autoDistillCooldownMin: '0',
    autoDistillMinTools: '1',
    hotMemoryTokens: '900',
    hotMemoryMaxTokens: '1200',
    readDefaultLimit: '8',
    readMaxLimit: '30',
    sessionSnapshotMax: '128',
    queryCacheSize: '128',
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applySnapshot = (snapshot: { settings: WireMemoirSettings; source: 'profile' | 'web' }) => {
    setError(null)
    setSettings(snapshot.settings)
    setSource(snapshot.source)
    setDraft(Object.fromEntries(NUMERIC_SETTINGS.map((key) => [key, String(snapshot.settings[key])])) as Record<NumericSettingsKey, string>)
  }

  useEffect(() => {
    let cancelled = false
    api.settings()
      .then((value) => { if (!cancelled) applySnapshot(value) })
      .catch((e: Error) => { if (!cancelled) setError(`${t('settings.loadFailed')}: ${e.message}`) })
    return () => { cancelled = true }
  }, [api, refreshKey])

  const save = () => {
    if (settings === null) return
    const parsed = Object.fromEntries(NUMERIC_SETTINGS.map((key) => [key, Number(draft[key])])) as Record<NumericSettingsKey, number>
    const integerKeys = NUMERIC_SETTINGS.filter((key) => key !== 'autoDistillCooldownMin')
    const invalidInteger = integerKeys.some((key) => !Number.isSafeInteger(parsed[key]) || parsed[key] < 1)
    if (
      invalidInteger
      || !Number.isFinite(parsed.autoDistillCooldownMin)
      || parsed.autoDistillCooldownMin < 0
      || parsed.hotMemoryMaxTokens < parsed.hotMemoryTokens
      || parsed.readMaxLimit < parsed.readDefaultLimit
    ) {
      setMessage(null)
      setError(t('settings.invalid'))
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    api.updateSettings({
      language: settings.language,
      announceToAgent: settings.announceToAgent,
      autoDistill: settings.autoDistill,
      ...parsed,
    })
      .then((value) => {
        applySnapshot(value)
        setMessage(t('settings.saved'))
        onChanged()
      })
      .catch((e: Error) => setError(`${t('settings.saveFailed')}: ${e.message}`))
      .finally(() => setBusy(false))
  }

  const reset = () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    api.resetSettings()
      .then((value) => {
        applySnapshot(value)
        setMessage(t('settings.resetDone'))
        onChanged()
      })
      .catch((e: Error) => setError(`${t('settings.saveFailed')}: ${e.message}`))
      .finally(() => setBusy(false))
  }

  return (
    <div className="memoir-settings" data-dsh-part="settings">
      {!alwaysOpen
        ? <button type="button" className="memoir-diagnostics-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {t('settings.title')} {open ? '▾' : '▸'}
          </button>
        : null}
      {alwaysOpen || open
        ? settings === null
          ? <div className="memoir-settings-body">{error ?? '…'}</div>
          : (
              <div className="memoir-settings-body">
                {showDescription ? <div className="memoir-settings-description">{t('settings.description')}</div> : null}
                <div className="memoir-settings-grid">
                  <label className="memoir-field">
                    <span>{t('settings.language')}</span>
                    <select
                      value={settings.language}
                      onChange={(event) => setSettings({ ...settings, language: event.target.value === 'en' ? 'en' : 'zh' })}
                    >
                      <option value="zh">{t('settings.language.zh')}</option>
                      <option value="en">{t('settings.language.en')}</option>
                    </select>
                    <small>{t('settings.languageHint')}</small>
                  </label>
                </div>
                <label className="memoir-settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.announceToAgent}
                    onChange={(event) => setSettings({ ...settings, announceToAgent: event.target.checked })}
                  />
                  <span><strong>{t('settings.announce')}</strong><small>{t('settings.announceHint')}</small></span>
                </label>
                <div className="memoir-settings-group-title">{t('settings.group.distill')}</div>
                <label className="memoir-settings-switch">
                  <input
                    type="checkbox"
                    checked={settings.autoDistill}
                    onChange={(event) => setSettings({ ...settings, autoDistill: event.target.checked })}
                  />
                  <span><strong>{t('settings.enabled')}</strong><small>{t('settings.enabledHint')}</small></span>
                </label>
                <div className="memoir-settings-grid">
                  {(['autoDistillEvery', 'autoDistillCooldownMin', 'autoDistillMinTools'] as NumericSettingsKey[]).map((key) => (
                    <label className="memoir-field" key={key}>
                      <span>{t(`settings.${key}`)}</span>
                      <input
                        type="number"
                        min={key === 'autoDistillCooldownMin' ? '0' : '1'}
                        step={key === 'autoDistillCooldownMin' ? '0.1' : '1'}
                        value={draft[key]}
                        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                      />
                      <small>{t(`settings.${key}Hint`)}</small>
                    </label>
                  ))}
                </div>
                <div className="memoir-settings-note">{t('settings.andHint')}</div>
                <div className="memoir-settings-group-title">{t('settings.group.memory')}</div>
                <div className="memoir-settings-grid">
                  {(['hotMemoryTokens', 'hotMemoryMaxTokens', 'readDefaultLimit', 'readMaxLimit', 'sessionSnapshotMax', 'queryCacheSize'] as NumericSettingsKey[]).map((key) => (
                    <label className="memoir-field" key={key}>
                      <span>{t(`settings.${key}`)}</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={draft[key]}
                        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                      />
                      <small>{t(`settings.${key}Hint`)}</small>
                    </label>
                  ))}
                </div>
                <div className="memoir-settings-note">{t('settings.liveHint')}</div>
                <div className="memoir-settings-source">{t('settings.source')}: {t(`settings.source.${source}`)}</div>
                {error !== null ? <div className="memoir-error memoir-settings-feedback">{error}</div> : null}
                {message !== null ? <div className="memoir-settings-success">{message}</div> : null}
                <div className="memoir-form-actions">
                  <button type="button" className="memoir-iconbtn" disabled={busy || source === 'profile'} onClick={reset}>{t('settings.reset')}</button>
                  <button type="button" className="memoir-primary" disabled={busy} onClick={save}>{t('settings.save')}</button>
                </div>
              </div>
            )
        : null}
    </div>
  )
}

type PanelSurface = 'browse' | 'settings' | 'hot-memory' | 'diagnostics'

const PANEL_SURFACES: Array<{ id: PanelSurface; label: string }> = [
  { id: 'browse', label: 'surface.browse' },
  { id: 'settings', label: 'surface.settings' },
  { id: 'hot-memory', label: 'surface.hotMemory' },
  { id: 'diagnostics', label: 'surface.diagnostics' },
]

export function MemoirPanel({ controller, api, cwdTracker = EMPTY_CWD_TRACKER, cwd: fixedCwd, t, openSource, onClose }: PanelProps) {
  const [, setLanguage] = useState(document.documentElement.lang)
  useEffect(() => {
    const observer = new MutationObserver(() => setLanguage(document.documentElement.lang))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])
  const trackedCwd = useSyncExternalStore(cwdTracker.subscribe, cwdTracker.getSnapshot)
  const cwd = fixedCwd ?? trackedCwd
  const close = onClose ?? (controller === undefined ? undefined : () => controller.close())
  const panelId = useId().replace(/:/g, '')
  const [surface, setSurface] = useState<PanelSurface>('browse')
  const [tab, setTab] = useState<'project' | 'global'>('project')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<MemoirStatus | 'all'>('active')
  const [sectionFilter, setSectionFilter] = useState<SectionKey | 'all'>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [pendingRecord, setPendingRecord] = useState<{ payload: AddPayload; result: WireRecordResult } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [project, setProject] = useState<WireProject | null>(null)
  const [projects, setProjects] = useState<WireProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [diag, setDiag] = useState<WireDiagnostics | null>(null)
  const [searchResults, setSearchResults] = useState<WireSearchResult[] | null>(null)
  const [hotMemory, setHotMemory] = useState<WireHotMemory | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [projectLimit, setProjectLimit] = useState(PROJECT_PAGE_SIZE)

  const q = query.trim().toLowerCase()

  useEffect(() => {
    let cancelled = false
    setError(null)
    if (tab === 'project') {
      if (cwd === '') {
        setProject(null)
        return undefined
      }
      setLoading(true)
      api.project(cwd, { status: 'all' })
        .then((value) => { if (!cancelled) setProject(value.project) })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      setLoading(true)
      api.global({ status: 'all' })
        .then((value) => { if (!cancelled) setProjects(value.projects) })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    return () => { cancelled = true }
  }, [tab, cwd, refreshKey])

  useEffect(() => {
    let cancelled = false
    // Diagnostics and Hot Memory follow the active workspace independently
    // from browse filters so surface switches never trigger redundant reads.
    api.diagnostics(cwd === '' ? undefined : cwd)
      .then((value) => { if (!cancelled) setDiag(value) })
      .catch(() => { if (!cancelled) setDiag(null) })
    // Hot-memory inspector preview (what the next session inherits).
    if (cwd === '') {
      setHotMemory(null)
    } else {
      api.hotMemory(cwd)
        .then((value) => { if (!cancelled) setHotMemory(value.hotMemory) })
        .catch(() => { if (!cancelled) setHotMemory(null) })
    }
    return () => { cancelled = true }
  }, [cwd, refreshKey])

  // v0.4.2: a non-empty query searches through the host RetrievalEngine —
  // the same BM25 ranking memoir_read uses. Debounced; empty query resets.
  useEffect(() => {
    if (q === '') {
      setSearchResults(null)
      return undefined
    }
    if (tab === 'project' && cwd === '') {
      setSearchResults([])
      return undefined
    }
    let cancelled = false
    setSearchResults(null)
    const timer = setTimeout(() => {
      const scope = tab === 'project' ? 'project' : 'global'
      api.search({
        scope,
        path: tab === 'project' && cwd !== '' ? cwd : undefined,
        query: q,
        status: statusFilter,
        section: sectionFilter === 'all' ? undefined : sectionFilter,
      })
        .then((value) => { if (!cancelled) setSearchResults(value.results) })
        .catch((e: Error) => {
          if (!cancelled) {
            setSearchResults([])
            setError(e.message)
          }
        })
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [q, tab, cwd, statusFilter, sectionFilter, refreshKey])

  const reload = () => setRefreshKey((k) => k + 1)

  const onDelete = (entry: WireEntry, entryPath: string) => {
    if (!window.confirm(t('delete.confirm'))) return
    setBusy(true)
    api.remove({ path: entryPath, id: entry.id })
      .then(() => reload())
      .catch((e: Error) => setError(`${t('delete.failed')}: ${e.message}`))
      .finally(() => setBusy(false))
  }

  const onRecord = (payload: AddPayload, resolution?: WireRecordResolution, targetId?: string) => {
    setBusy(true)
    api.record({ path: cwd, ...payload, ...(resolution !== undefined ? { resolution } : {}), ...(targetId !== undefined ? { targetId } : {}) })
      .then((result) => {
        if (result.action === 'needs-resolution') {
          setPendingRecord({ payload, result })
          return
        }
        setPendingRecord(null)
        setFormOpen(false)
        reload()
      })
      .catch((e: Error) => setError(`${t('record.failed')}: ${e.message}`))
      .finally(() => setBusy(false))
  }

  const onUpdate = (entry: WireEntry, entryPath: string, patch: EntryPatch) => {
    setBusy(true)
    api.update({ path: entryPath, id: entry.id, ...patch })
      .then(() => reload())
      .catch((e: Error) => setError(`${t('update.failed')}: ${e.message}`))
      .finally(() => setBusy(false))
  }

  const projectEntries = useMemo(
    () => project === null ? [] : filterEntries(project.entries, statusFilter, sectionFilter),
    [project, statusFilter, sectionFilter],
  )
  const globalGroups = useMemo(
    () => buildProjectGroups(projects, statusFilter, sectionFilter),
    [projects, statusFilter, sectionFilter],
  )
  const rankedGlobalGroups = useMemo(
    () => groupRankedResults(searchResults ?? [], projects),
    [searchResults, projects],
  )
  const displayedGlobalGroups = q === '' ? globalGroups : rankedGlobalGroups
  const projectSignature = displayedGlobalGroups.map((group) => group.key).join('\n')
  const narrowingSignature = q === '' && statusFilter === 'active' && sectionFilter === 'all'
    ? ''
    : `${q}\n${statusFilter}\n${sectionFilter}\n${projectSignature}`

  useEffect(() => {
    setProjectLimit(PROJECT_PAGE_SIZE)
  }, [tab, q, statusFilter, sectionFilter, refreshKey])

  useEffect(() => {
    if (tab !== 'global' || narrowingSignature === '') return
    setExpandedProjects((current) => {
      const next = { ...current }
      for (const group of displayedGlobalGroups) next[group.key] = true
      return next
    })
  }, [tab, narrowingSignature])

  const setAllProjects = (open: boolean) => {
    setExpandedProjects((current) => {
      const next = { ...current }
      for (const group of displayedGlobalGroups) next[group.key] = open
      return next
    })
  }

  const onSurfaceKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % PANEL_SURFACES.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + PANEL_SURFACES.length) % PANEL_SURFACES.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = PANEL_SURFACES.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    const next = PANEL_SURFACES[nextIndex]
    setSurface(next.id)
    document.getElementById(`${panelId}-${next.id}-tab`)?.focus()
  }

  const headerSubtitle = surface === 'browse'
    ? (tab === 'project' ? (cwd === '' ? t('empty.workspace') : cwd) : t('tab.global'))
    : t(PANEL_SURFACES.find((item) => item.id === surface)?.label ?? 'surface.browse')
  const visibleGlobalGroups = displayedGlobalGroups.slice(0, projectLimit)
  const listResetKey = `${tab}:${q}:${statusFilter}:${sectionFilter}:${refreshKey}`

  return (
    <div className="memoir-panel" data-dsh-plugin="memoir" data-dsh-part="panel">
      <div className="memoir-header" data-dsh-part="header">
        <div className="memoir-title">
          {t('panel.title')}
          <div className="memoir-subtitle">{headerSubtitle}</div>
        </div>
        <button type="button" className="memoir-iconbtn" title={t('panel.refresh')} onClick={reload}>⟳</button>
        {close === undefined
          ? null
          : <button type="button" className="memoir-iconbtn" title={t('panel.close')} onClick={close}>×</button>}
      </div>
      <nav className="memoir-surface-tabs" data-dsh-part="surface-tabs" role="tablist" aria-label={t('surface.navigation')}>
        {PANEL_SURFACES.map((item, index) => (
          <button
            type="button"
            id={`${panelId}-${item.id}-tab`}
            className="memoir-surface-tab"
            role="tab"
            aria-selected={surface === item.id}
            aria-controls={`${panelId}-${item.id}-panel`}
            tabIndex={surface === item.id ? 0 : -1}
            data-active={surface === item.id ? 'true' : undefined}
            onClick={() => setSurface(item.id)}
            onKeyDown={(event) => onSurfaceKeyDown(event, index)}
            key={item.id}
          >{t(item.label)}</button>
        ))}
      </nav>
      <div className="memoir-surface-stack">
        <section
          id={`${panelId}-browse-panel`}
          className="memoir-surface memoir-browse-surface"
          role="tabpanel"
          aria-labelledby={`${panelId}-browse-tab`}
          hidden={surface !== 'browse'}
        >
          <div className="memoir-browse-head">
            <div className="memoir-tabs" data-dsh-part="tabs" role="tablist" aria-label={t('browse.scope')}>
              <button type="button" className="memoir-tab" role="tab" aria-selected={tab === 'project'} data-active={tab === 'project' ? 'true' : undefined} onClick={() => setTab('project')}>{t('tab.project')}</button>
              <button type="button" className="memoir-tab" role="tab" aria-selected={tab === 'global'} data-active={tab === 'global' ? 'true' : undefined} onClick={() => setTab('global')}>{t('tab.global')}</button>
            </div>
            <div className="memoir-toolbar" data-dsh-part="toolbar">
              <input className="memoir-search" aria-label={t('toolbar.search')} placeholder={t('toolbar.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
              <label className="memoir-status-filter">
                <span>{t('filter.status')}</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as MemoirStatus | 'all')}>
                  <option value="active">{t('status.active')}</option>
                  <option value="all">{t('filter.all')}</option>
                  <option value="superseded">{t('status.superseded')}</option>
                  <option value="archived">{t('status.archived')}</option>
                </select>
              </label>
              <label className="memoir-status-filter">
                <span>{t('filter.section')}</span>
                <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value as SectionKey | 'all')}>
                  <option value="all">{t('filter.all')}</option>
                  {SECTION_KEYS.map((key) => <option key={key} value={key}>{t('sections.' + key)}</option>)}
                </select>
              </label>
              {tab === 'project' && cwd !== ''
                ? <button type="button" className="memoir-primary" onClick={() => {
                    setFormOpen((value) => !value)
                    setPendingRecord(null)
                  }}>{formOpen ? t('toolbar.cancel') : t('toolbar.add')}</button>
                : null}
              {tab === 'global' && displayedGlobalGroups.length > 0
                ? <div className="memoir-project-actions">
                    <button type="button" className="memoir-iconbtn" onClick={() => setAllProjects(true)}>{t('project.expandAll')}</button>
                    <button type="button" className="memoir-iconbtn" onClick={() => setAllProjects(false)}>{t('project.collapseAll')}</button>
                  </div>
                : null}
            </div>
            {error !== null ? <div className="memoir-error" role="alert">{error}</div> : null}
          </div>
          <div className="memoir-surface-scroll memoir-scroll-region" data-dsh-part="browse-scroll" tabIndex={0} aria-label={t('surface.browse')}>
            {formOpen && tab === 'project' && cwd !== ''
              ? pendingRecord === null
                ? <AddForm t={t} onSubmit={onRecord} onCancel={() => setFormOpen(false)} />
                : <SimilarityResolution
                    result={pendingRecord.result}
                    t={t}
                    busy={busy}
                    onResolve={(resolution, targetId) => onRecord(pendingRecord.payload, resolution, targetId)}
                    onBack={() => setPendingRecord(null)}
                  />
              : null}
            <div className="memoir-body" aria-busy={loading || busy}>
              {loading
                ? <div className="memoir-empty">…</div>
                : tab === 'project'
                  ? q !== ''
                    ? <RankedResults results={searchResults ?? []} pending={searchResults === null} t={t} openSource={openSource} onDelete={onDelete} onUpdate={onUpdate} />
                    : cwd === ''
                      ? <div className="memoir-empty"><div className="memoir-empty-title">{t('empty.workspace')}</div><div className="memoir-empty-hint">{t('empty.workspaceHint')}</div></div>
                      : projectEntries.length === 0
                        ? <div className="memoir-empty"><div className="memoir-empty-title">{t('empty.project')}</div><div className="memoir-empty-hint">{t('empty.projectHint')}</div></div>
                        : <SectionedEntries resetKey={listResetKey} entries={projectEntries} t={t} openSource={openSource} onDelete={(entry) => onDelete(entry, project?.path ?? cwd)} onUpdate={(entry, patch) => onUpdate(entry, project?.path ?? cwd, patch)} />
                  : q !== '' && searchResults === null
                    ? <div className="memoir-empty">…</div>
                    : displayedGlobalGroups.length === 0
                      ? <div className="memoir-empty"><div className="memoir-empty-title">{projects.length === 0 && q === '' ? t('empty.global') : t('empty.search')}</div><div className="memoir-empty-hint">{projects.length === 0 && q === '' ? t('empty.globalHint') : t('search.ranked')}</div></div>
                      : <>
                          {visibleGlobalGroups.map((group) => {
                            const open = expandedProjects[group.key] === true
                            return (
                              <ProjectDisclosure
                                project={group}
                                open={open}
                                t={t}
                                onToggle={() => setExpandedProjects((current) => ({ ...current, [group.key]: !open }))}
                                key={group.key}
                              >
                                {'results' in group
                                  ? <>
                                      <div className="memoir-ranked-note">{t('search.ranked')}</div>
                                      {group.results.map((result) => <EntryCard key={result.entry.id} entry={result.entry} score={result.score} t={t} openSource={openSource} onDelete={(entry) => onDelete(entry, group.path)} onUpdate={(entry, patch) => onUpdate(entry, group.path, patch)} />)}
                                    </>
                                  : <SectionedEntries resetKey={`${listResetKey}:${group.key}`} entries={group.entries} t={t} openSource={openSource} onDelete={(entry) => onDelete(entry, group.path)} onUpdate={(entry, patch) => onUpdate(entry, group.path, patch)} />}
                              </ProjectDisclosure>
                            )
                          })}
                          {projectLimit < displayedGlobalGroups.length
                            ? <div className="memoir-load-more"><span>{t('pagination.projects')} {visibleGlobalGroups.length}/{displayedGlobalGroups.length}</span><button type="button" className="memoir-iconbtn" onClick={() => setProjectLimit((value) => nextPageSize(value, displayedGlobalGroups.length, PROJECT_PAGE_SIZE))}>{t('pagination.more')}</button></div>
                            : null}
                        </>}
            </div>
            {busy ? <div className="memoir-empty memoir-busy" aria-live="polite">…</div> : null}
          </div>
        </section>

        <section id={`${panelId}-settings-panel`} className="memoir-surface" role="tabpanel" aria-labelledby={`${panelId}-settings-tab`} hidden={surface !== 'settings'}>
          <div className="memoir-surface-scroll" data-dsh-part="settings-scroll" tabIndex={0} aria-label={t('surface.settings')}>
            <MemoirSettingsPanel api={api} t={t} refreshKey={refreshKey} onChanged={reload} alwaysOpen />
          </div>
        </section>

        <section id={`${panelId}-hot-memory-panel`} className="memoir-surface" role="tabpanel" aria-labelledby={`${panelId}-hot-memory-tab`} hidden={surface !== 'hot-memory'}>
          <div className="memoir-surface-scroll" data-dsh-part="hot-memory-scroll" tabIndex={0} aria-label={t('surface.hotMemory')}>
            <div className="memoir-surface-card" data-dsh-part="hot-memory">
              <h3>{t('inspector.title')}</h3>
              {hotMemory === null || hotMemory.text === ''
                ? <div className="memoir-empty"><div className="memoir-empty-title">{t('inspector.empty')}</div></div>
                : <>
                    <div className="memoir-surface-summary">{t('inspector.selected')}: {hotMemory.selected.length}/{hotMemory.total} · ~{hotMemory.estimatedTokens} tokens</div>
                    <pre className="memoir-inspector-body">{hotMemory.text}</pre>
                  </>}
            </div>
          </div>
        </section>

        <section id={`${panelId}-diagnostics-panel`} className="memoir-surface" role="tabpanel" aria-labelledby={`${panelId}-diagnostics-tab`} hidden={surface !== 'diagnostics'}>
          <div className="memoir-surface-scroll" data-dsh-part="diagnostics-scroll" tabIndex={0} aria-label={t('surface.diagnostics')}>
            <div className="memoir-surface-card" data-dsh-part="diagnostics">
              <h3>{t('diag.title')}</h3>
              {diag === null
                ? <div className="memoir-empty">{t('diag.unavailable')}</div>
                : <div className="memoir-diagnostics-body">
                    <div>{t('diag.revision')}: {diag.storeRevision} · {t('diag.snapshot')}: {diag.snapshotCount}/{diag.snapshotMax}</div>
                    <div>{t('diag.cache')}: {diag.cache.hits}/{diag.cache.loads} {t('diag.hits')} ({Math.round(diag.cache.hitRate * 100)}%) · {t('diag.render')}: {Math.round(diag.cache.renderHitRate * 100)}%</div>
                    {diag.hotMemory !== null ? <div>{t('diag.hot')}: {diag.hotMemory.selected}/{diag.hotMemory.total} {t('diag.items')} · ~{diag.hotMemory.estimatedTokens} tokens · {t('diag.budget')} {diag.config.hotMemoryTokens}/{diag.config.hotMemoryMaxTokens}</div> : null}
                    <div>{t('diag.retrieval')}: {diag.retrieval.index === null ? '—' : `${diag.retrieval.index.docs} ${t('diag.documents')} · ${diag.retrieval.index.terms} ${t('diag.terms')} · ${t('diag.epoch')} ${diag.retrieval.index.epoch}`}</div>
                    <div>{t('diag.qcache')}: {diag.retrieval.cache.hits} {t('diag.hits')} / {diag.retrieval.cache.misses} {t('diag.misses')} ({Math.round(diag.retrieval.cache.hitRate * 100)}%) · {diag.retrieval.cache.size}/{diag.retrieval.cache.capacity} · {diag.retrieval.cache.evictions} {t('diag.evicted')}</div>
                    {diag.retrieval.lastQuery !== null ? <div>{t('diag.lastQuery')}: {diag.retrieval.lastQuery.latencyMs.toFixed(1)} ms · {diag.retrieval.lastQuery.returned}/{diag.retrieval.lastQuery.candidates} {t('diag.returned')}</div> : null}
                    {diag.snapshot !== null ? <div>{t('diag.snapshotInfo')}: {diag.snapshot.hash} · {t('diag.revision')} {diag.snapshot.storeRevision}</div> : null}
                  </div>}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
