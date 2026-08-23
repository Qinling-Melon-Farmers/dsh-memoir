/**
 * The memoir panel: project / global memory tabs, client-side search,
 * manual record form, per-entry delete. Rendered into the center-column
 * container by mount.tsx; visibility is CSS-driven (html data attribute).
 */

import { Fragment, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { SECTION_KEYS } from './i18n.js'
import type { MemoirApi, WireDiagnostics, WireEntry, WireHotMemory, WireMemoirSettings, WireProject, WireSearchResult } from './api.js'
import type { CwdTracker } from './cwd.js'
import type { PanelController } from './controller.js'
import type { MemoirStatus, SectionKey } from './types.ts'

interface PanelProps {
  controller: PanelController
  api: MemoirApi
  cwdTracker: CwdTracker
  t: (key: string) => string
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

/** One entry's meta line: lifecycle, importance, tags and provenance. */
function EntryMeta({ entry, t }: { entry: WireEntry; t: (key: string) => string }) {
  const when = new Date(entry.time)
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeText = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`
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
      {entry.sessionId !== undefined
        ? <span title={`${t('session')}: ${entry.sessionId}`}>{entry.sessionId.slice(0, 12)}</span>
        : null}
    </div>
  )
}

function EntryCard({ entry, t, onDelete, onUpdate, score }: { entry: WireEntry; t: (key: string) => string; onDelete: (entry: WireEntry) => void; onUpdate?: (entry: WireEntry, patch: EntryPatch) => void; score?: number }) {
  const [editing, setEditing] = useState(false)
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
      <EntryMeta entry={entry} t={t} />
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
            <div className="memoir-entry-content">{entry.content}</div>
          </>}
    </div>
  )
}

/** Sectioned entry list in canonical order. */
function SectionedEntries({ entries, t, onDelete, onUpdate }: { entries: WireEntry[]; t: (key: string) => string; onDelete: (entry: WireEntry) => void; onUpdate?: (entry: WireEntry, patch: EntryPatch) => void }) {
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
  return (
    <Fragment>
      {groups.map((group) => (
        <Fragment key={group.key}>
          <div className="memoir-section-title">
            {t('sections.' + group.key)}
            <span className="memoir-count">({group.entries.length})</span>
          </div>
          {group.entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} t={t} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </Fragment>
      ))}
    </Fragment>
  )
}

/**
 * Ranked search results (v0.4.2): the host RetrievalEngine order, flat for
 * the project tab or grouped by project for the global tab. Scores are
 * shown as chips so the ranking is inspectable.
 */
function RankedResults({ results, pending, grouped, t, onDelete, onUpdate }: {
  results: WireSearchResult[]
  pending: boolean
  grouped: boolean
  t: (key: string) => string
  onDelete: (entry: WireEntry, path: string) => void
  onUpdate?: (entry: WireEntry, path: string, patch: EntryPatch) => void
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
  if (!grouped) {
    return (
      <Fragment>
        <div className="memoir-ranked-note">{t('search.ranked')}</div>
        {results.map((r) => (
          <EntryCard key={r.entry.id} entry={r.entry} score={r.score} t={t} onDelete={(entry) => onDelete(entry, r.projectPath)} onUpdate={(entry, patch) => onUpdate?.(entry, r.projectPath, patch)} />
        ))}
      </Fragment>
    )
  }
  const groups = new Map<string, WireSearchResult[]>()
  for (const result of results) {
    const bucket = groups.get(result.projectPath) ?? []
    bucket.push(result)
    groups.set(result.projectPath, bucket)
  }
  return (
    <Fragment>
      {[...groups.entries()].map(([path, bucket]) => (
        <div className="memoir-project-card" key={path}>
          <div className="memoir-project-head">
            <span className="memoir-project-title">{path.split('/').filter(Boolean).pop() || path}</span>
            <span className="memoir-project-path">{path}</span>
          </div>
          {bucket.map((r) => (
            <EntryCard key={r.entry.id} entry={r.entry} score={r.score} t={t} onDelete={(entry) => onDelete(entry, path)} onUpdate={(entry, patch) => onUpdate?.(entry, path, patch)} />
          ))}
        </div>
      ))}
    </Fragment>
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
export function MemoirSettingsPanel({ api, t, refreshKey, onChanged, defaultOpen = false }: {
  api: MemoirApi
  t: (key: string) => string
  refreshKey: number
  onChanged: () => void
  defaultOpen?: boolean
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
      <button type="button" className="memoir-diagnostics-toggle" onClick={() => setOpen((value) => !value)}>
        {t('settings.title')} {open ? '▾' : '▸'}
      </button>
      {open
        ? settings === null
          ? <div className="memoir-settings-body">{error ?? '…'}</div>
          : (
              <div className="memoir-settings-body">
                <div className="memoir-settings-description">{t('settings.description')}</div>
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

export function MemoirPanel({ controller, api, cwdTracker, t }: PanelProps) {
  const [, setLanguage] = useState(document.documentElement.lang)
  useEffect(() => {
    const observer = new MutationObserver(() => setLanguage(document.documentElement.lang))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])
  const cwd = useSyncExternalStore(cwdTracker.subscribe, cwdTracker.getSnapshot)
  const [tab, setTab] = useState<'project' | 'global'>('project')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<MemoirStatus | 'all'>('active')
  const [sectionFilter, setSectionFilter] = useState<SectionKey | 'all'>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [project, setProject] = useState<WireProject | null>(null)
  const [projects, setProjects] = useState<WireProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [diag, setDiag] = useState<WireDiagnostics | null>(null)
  const [diagOpen, setDiagOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<WireSearchResult[] | null>(null)
  const [hotMemory, setHotMemory] = useState<WireHotMemory | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)

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
      api.project(cwd, { status: statusFilter, section: sectionFilter === 'all' ? undefined : sectionFilter })
        .then((value) => { if (!cancelled) setProject(value.project) })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      setLoading(true)
      api.global({ status: statusFilter, section: sectionFilter === 'all' ? undefined : sectionFilter })
        .then((value) => { if (!cancelled) setProjects(value.projects) })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    // Diagnostics follow the active workspace (observability, roadmap §4).
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
  }, [tab, cwd, statusFilter, sectionFilter, refreshKey])

  // v0.4.2: a non-empty query searches through the host RetrievalEngine —
  // the same BM25 ranking memoir_read uses. Debounced; empty query resets.
  useEffect(() => {
    if (q === '') {
      setSearchResults(null)
      return undefined
    }
    let cancelled = false
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

  const filterEntries = (entries: WireEntry[]) =>
    q === '' ? entries : entries.filter((e) => `${e.title ?? ''} ${e.content}`.toLowerCase().includes(q))

  const reload = () => setRefreshKey((k) => k + 1)

  const onDelete = (entry: WireEntry, entryPath: string) => {
    if (!window.confirm(t('delete.confirm'))) return
    setBusy(true)
    api.remove({ path: entryPath, id: entry.id })
      .then(() => reload())
      .catch((e: Error) => setError(`${t('delete.failed')}: ${e.message}`))
      .finally(() => setBusy(false))
  }

  const onRecord = (payload: AddPayload) => {
    setBusy(true)
    api.record({ path: cwd, ...payload })
      .then(() => {
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

  const projectEntries = project === null ? [] : filterEntries(project.entries)

  return (
    <div className="memoir-panel" data-dsh-plugin="memoir" data-dsh-part="panel">
      <div className="memoir-header" data-dsh-part="header">
        <div className="memoir-title">
          {t('panel.title')}
          <div className="memoir-subtitle">{tab === 'project' ? (cwd === '' ? t('empty.workspace') : cwd) : t('tab.global')}</div>
        </div>
        <button type="button" className="memoir-iconbtn" title={t('panel.refresh')} onClick={reload}>⟳</button>
        <button type="button" className="memoir-iconbtn" title={t('panel.close')} onClick={() => controller.close()}>×</button>
      </div>
      <div className="memoir-tabs" data-dsh-part="tabs">
        <button type="button" className="memoir-tab" data-active={tab === 'project' ? 'true' : undefined} onClick={() => setTab('project')}>{t('tab.project')}</button>
        <button type="button" className="memoir-tab" data-active={tab === 'global' ? 'true' : undefined} onClick={() => setTab('global')}>{t('tab.global')}</button>
      </div>
      <div className="memoir-toolbar" data-dsh-part="toolbar">
        <input className="memoir-search" placeholder={t('toolbar.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
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
          ? <button type="button" className="memoir-primary" onClick={() => setFormOpen((v) => !v)}>{formOpen ? t('toolbar.cancel') : t('toolbar.add')}</button>
          : null}
      </div>
      {formOpen && tab === 'project' && cwd !== ''
        ? <AddForm t={t} onSubmit={onRecord} onCancel={() => setFormOpen(false)} />
        : null}
      {error !== null ? <div className="memoir-error">{error}</div> : null}
      <div className="memoir-body">
        {loading
          ? <div className="memoir-empty">…</div>
          : q !== ''
            ? (
                <RankedResults
                  results={searchResults ?? []}
                  pending={searchResults === null}
                  grouped={tab === 'global'}
                  t={t}
                  onDelete={(entry, path) => onDelete(entry, path)}
                  onUpdate={onUpdate}
                />
              )
            : tab === 'project'
              ? cwd === ''
                ? (
                    <div className="memoir-empty">
                      <div className="memoir-empty-title">{t('empty.workspace')}</div>
                      <div className="memoir-empty-hint">{t('empty.workspaceHint')}</div>
                    </div>
                  )
                : projectEntries.length === 0
                  ? (
                      <div className="memoir-empty">
                        <div className="memoir-empty-title">{t('empty.project')}</div>
                        <div className="memoir-empty-hint">{t('empty.projectHint')}</div>
                      </div>
                    )
                  : <SectionedEntries entries={projectEntries} t={t} onDelete={(entry) => onDelete(entry, project?.path ?? cwd)} onUpdate={(entry, patch) => onUpdate(entry, project?.path ?? cwd, patch)} />
              : projects.length === 0
                ? (
                    <div className="memoir-empty">
                      <div className="memoir-empty-title">{t('empty.global')}</div>
                      <div className="memoir-empty-hint">{t('empty.globalHint')}</div>
                    </div>
                  )
                : projects.map((p) => {
                    const entries = filterEntries(p.entries)
                    if (entries.length === 0) return null
                    const when = new Date(p.updatedAt)
                    return (
                      <div className="memoir-project-card" key={p.key}>
                        <div className="memoir-project-head">
                          <span className="memoir-project-title">{p.title}</span>
                          <span className="memoir-project-path">{p.path}</span>
                        </div>
                        <div className="memoir-project-meta">
                          {`${t('updated')} ${when.toISOString().slice(0, 16).replace('T', ' ')} · ${entries.length} ${t('entries')}`}
                        </div>
                        <SectionedEntries entries={entries} t={t} onDelete={(entry) => onDelete(entry, p.path)} onUpdate={(entry, patch) => onUpdate(entry, p.path, patch)} />
                      </div>
                    )
                  })}
      </div>
      {busy ? <div className="memoir-empty">…</div> : null}
      <MemoirSettingsPanel api={api} t={t} refreshKey={refreshKey} onChanged={reload} />
      <div className="memoir-inspector" data-dsh-part="hot-memory">
        <button type="button" className="memoir-diagnostics-toggle" onClick={() => setInspectorOpen((v) => !v)}>
          {t('inspector.title')} {inspectorOpen ? '▾' : '▸'}
        </button>
        {inspectorOpen
          ? hotMemory === null || hotMemory.text === ''
            ? <div className="memoir-inspector-body">{t('inspector.empty')}</div>
            : <pre className="memoir-inspector-body">{hotMemory.text}</pre>
          : null}
      </div>
      <div className="memoir-diagnostics" data-dsh-part="diagnostics">
        <button type="button" className="memoir-diagnostics-toggle" onClick={() => setDiagOpen((v) => !v)}>
          {t('diag.title')} {diagOpen ? '▾' : '▸'}
        </button>
        {diagOpen && diag !== null
          ? (
              <div className="memoir-diagnostics-body">
                <div>{t('diag.revision')}: {diag.storeRevision} · {t('diag.snapshot')}: {diag.snapshotCount}/{diag.snapshotMax}</div>
                <div>{t('diag.cache')}: {diag.cache.hits}/{diag.cache.loads} 命中 ({Math.round(diag.cache.hitRate * 100)}%) · {t('diag.render')}: {Math.round(diag.cache.renderHitRate * 100)}%</div>
                {diag.hotMemory !== null
                  ? <div>{t('diag.hot')}: {diag.hotMemory.selected}/{diag.hotMemory.total} 条 · ~{diag.hotMemory.estimatedTokens} tokens（预算 {diag.config.hotMemoryTokens}/{diag.config.hotMemoryMaxTokens}）</div>
                  : null}
                <div>{t('diag.retrieval')}: {diag.retrieval.index === null ? '—' : `${diag.retrieval.index.docs} docs · ${diag.retrieval.index.terms} terms · epoch ${diag.retrieval.index.epoch}`}</div>
                <div>{t('diag.qcache')}: {diag.retrieval.cache.hits} hits / {diag.retrieval.cache.misses} misses ({Math.round(diag.retrieval.cache.hitRate * 100)}%) · {diag.retrieval.cache.size}/{diag.retrieval.cache.capacity} · {diag.retrieval.cache.evictions} evicted</div>
                {diag.retrieval.lastQuery !== null
                  ? <div>{t('diag.lastQuery')}: {diag.retrieval.lastQuery.latencyMs.toFixed(1)} ms · {diag.retrieval.lastQuery.returned}/{diag.retrieval.lastQuery.candidates} returned</div>
                  : null}
                {diag.snapshot !== null
                  ? <div>{t('diag.snapshotInfo')}: {diag.snapshot.hash} · rev {diag.snapshot.storeRevision}</div>
                  : null}
              </div>
            )
          : null}
      </div>
    </div>
  )
}
