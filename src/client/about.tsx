import { useState, useSyncExternalStore } from 'react'
import { ANNOUNCEMENT_VERSION, acknowledgeAnnouncement, hasAcknowledged, subscribeAnnouncement } from './announcement.js'

/** Build-stamped, offline plugin identity. Never inspect workspace Git remotes. */
declare const __MEMOIR_PACKAGE_INFO__: { version: string; hostRange: string; sdkBaseline: string }
const repository = 'https://github.com/Qinling-Melon-Farmers/dsh-memoir'

export function MemoirAbout({ t, onSettings, settingsTarget, announceOnOpen = false }: {
  t: (key: string) => string
  onSettings?: () => void
  settingsTarget?: string
  announceOnOpen?: boolean
}) {
  const [manualNotice, setManualNotice] = useState(false)
  const seen = useSyncExternalStore(
    notify => subscribeAnnouncement(window, notify),
    () => hasAcknowledged(window),
    () => true,
  )
  const showNotice = manualNotice || (announceOnOpen && !seen)
  return <aside className="memoir-plugin-guide" data-dsh-part="plugin-guide" aria-label={t('guide.label')}>
    <div className="memoir-plugin-guide-row">
      <strong className="memoir-plugin-identity">dsh-memoir <span>v{__MEMOIR_PACKAGE_INFO__.version}</span></strong>
      <nav className="memoir-about-links" aria-label={t('about.links')}>
        <a href={repository} title={t('about.repositoryNote')} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('guide.repository')}</a>
        <a href={`${repository}/blob/main/${t('about.readmeFile')}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('about.docs')}</a>
        {onSettings === undefined ? null : <button type="button" className="memoir-guide-settings" aria-controls={settingsTarget} onClick={onSettings}>{t('guide.settings')}</button>}
      </nav>
    </div>
    <details className="memoir-about" data-dsh-part="about">
    <summary>{t('about.title')}</summary>
    <div className="memoir-about-body">
      <p>{t('sidebar.description')}</p>
      <dl>
        <dt>{t('about.host')}</dt><dd>{__MEMOIR_PACKAGE_INFO__.hostRange}</dd>
        <dt>{t('about.baseline')}</dt><dd>{__MEMOIR_PACKAGE_INFO__.sdkBaseline}</dd>
        <dt>{t('about.maintainer')}</dt><dd>Qinling-Melon-Farmers</dd>
      </dl>
      <p>{t('about.repositoryNote')}</p>
      <nav className="memoir-about-links" aria-label={t('about.links')}>
        <a href={repository} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Qinling-Melon-Farmers/dsh-memoir</a>
        <a href={`${repository}/releases`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('about.releases')}</a>
        <a href={`${repository}/issues`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('about.issues')}</a>
      </nav>
      <p className="memoir-about-note">{t('about.updates')}</p>
      <button type="button" className="memoir-guide-settings" onClick={() => setManualNotice(true)}>{t('notice.reopen')}</button>
    </div>
    </details>
    {showNotice ? <section className="memoir-announcement" data-dsh-part="announcement" aria-label={t('notice.title')}>
      <div className="memoir-plugin-guide-row">
        <strong>{t('notice.title')} · {ANNOUNCEMENT_VERSION}</strong>
        <button type="button" className="memoir-guide-settings" onClick={() => { acknowledgeAnnouncement(window); setManualNotice(false) }}>{t('notice.dismiss')}</button>
      </div>
      <p>{t('notice.compat')}</p>
      <p>{t('notice.features')}</p>
      <small>{t('notice.privacy')}</small>
    </section> : null}
  </aside>
}
