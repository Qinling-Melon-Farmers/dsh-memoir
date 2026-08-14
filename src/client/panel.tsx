/**
 * The memoir panel: project / global memory tabs, client-side search,
 * manual record form, per-entry delete. Rendered into the center-column
 * container by mount.tsx; visibility is CSS-driven (html data attribute).
 */

import { Fragment, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { SECTION_KEYS } from './i18n.js'
import type { MemoirApi, WireEntry, WireProject } from './api.js'
import type { CwdTracker } from './cwd.js'
import type { PanelController } from './controller.js'
import type { SectionKey } from './types.ts'

interface PanelProps {
  controller: PanelController
  api: MemoirApi
  cwdTracker: CwdTracker
  t: (key: string) => string
}

/** One entry's meta line: time, section chip, session id tooltip. */
function EntryMeta({ entry, t }: { entry: WireEntry; t: (key: string) => string }) {
  const when = new Date(entry.time)
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeText = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`
  return (
    <div className="memoir-entry-meta">
      <span>{timeText}</span>
      <span className="memoir-chip">{t('sections.' + entry.section)}</span>
      {entry.sessionId !== undefined
        ? <span title={`${t('session')}: ${entry.sessionId}`}>{entry.sessionId.slice(0, 12)}</span>
        : null}
    </div>
  )
}

function EntryCard({ entry, t, onDelete }: { entry: WireEntry; t: (key: string) => string; onDelete: (entry: WireEntry) => void }) {
  return (
    <div className="memoir-entry">
      <button type="button" className="memoir-delete" title={t('delete.confirm')} onClick={() => onDelete(entry)}>×</button>
      <EntryMeta entry={entry} t={t} />
      {entry.title !== undefined ? <div className="memoir-entry-title">{entry.title}</div> : null}
      <div className="memoir-entry-content">{entry.content}</div>
    </div>
  )
}

/** Sectioned entry list in canonical order. */
function SectionedEntries({ entries, t, onDelete }: { entries: WireEntry[]; t: (key: string) => string; onDelete: (entry: WireEntry) => void }) {
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
            <EntryCard key={entry.id} entry={entry} t={t} onDelete={onDelete} />
          ))}
        </Fragment>
      ))}
    </Fragment>
  )
}

function AddForm({ t, onSubmit, onCancel }: { t: (key: string) => string; onSubmit: (payload: { section: SectionKey; title?: string; content: string }) => void; onCancel: () => void }) {
  const [section, setSection] = useState<SectionKey>('lessons')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const submit = () => {
    if (content.trim() === '') return
    onSubmit({ section, title: title.trim() === '' ? undefined : title.trim(), content: content.trim() })
  }
  return (
    <div className="memoir-form">
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
      <div className="memoir-form-actions">
        <button type="button" className="memoir-iconbtn" onClick={onCancel}>{t('toolbar.cancel')}</button>
        <button type="button" className="memoir-primary" onClick={submit}>{t('form.submit')}</button>
      </div>
    </div>
  )
}

export function MemoirPanel({ controller, api, cwdTracker, t }: PanelProps) {
  const cwd = useSyncExternalStore(cwdTracker.subscribe, cwdTracker.getSnapshot)
  const [tab, setTab] = useState<'project' | 'global'>('project')
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [project, setProject] = useState<WireProject | null>(null)
  const [projects, setProjects] = useState<WireProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    if (tab === 'project') {
      if (cwd === '') {
        setProject(null)
        return undefined
      }
      setLoading(true)
      api.project(cwd)
        .then((value) => { if (!cancelled) setProject(value.project) })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      setLoading(true)
      api.global()
        .then((value) => { if (!cancelled) setProjects(value.projects) })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    return () => { cancelled = true }
  }, [tab, cwd, refreshKey])

  const q = query.trim().toLowerCase()
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

  const onRecord = (payload: { section: SectionKey; title?: string; content: string }) => {
    setBusy(true)
    api.record({ path: cwd, ...payload })
      .then(() => {
        setFormOpen(false)
        reload()
      })
      .catch((e: Error) => setError(`${t('record.failed')}: ${e.message}`))
      .finally(() => setBusy(false))
  }

  const projectEntries = project === null ? [] : filterEntries(project.entries)

  return (
    <div className="memoir-panel">
      <div className="memoir-header">
        <div className="memoir-title">
          {t('panel.title')}
          <div className="memoir-subtitle">{tab === 'project' ? (cwd === '' ? t('empty.workspace') : cwd) : t('tab.global')}</div>
        </div>
        <button type="button" className="memoir-iconbtn" title={t('panel.refresh')} onClick={reload}>⟳</button>
        <button type="button" className="memoir-iconbtn" title={t('panel.close')} onClick={() => controller.close()}>×</button>
      </div>
      <div className="memoir-tabs">
        <button type="button" className="memoir-tab" data-active={tab === 'project' ? 'true' : undefined} onClick={() => setTab('project')}>{t('tab.project')}</button>
        <button type="button" className="memoir-tab" data-active={tab === 'global' ? 'true' : undefined} onClick={() => setTab('global')}>{t('tab.global')}</button>
      </div>
      <div className="memoir-toolbar">
        <input className="memoir-search" placeholder={t('toolbar.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
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
                : <SectionedEntries entries={projectEntries} t={t} onDelete={(entry) => onDelete(entry, project?.path ?? cwd)} />
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
                      <SectionedEntries entries={entries} t={t} onDelete={(entry) => onDelete(entry, p.path)} />
                    </div>
                  )
                })}
      </div>
      {busy ? <div className="memoir-empty">…</div> : null}
    </div>
  )
}
