/** Build-stamped, offline plugin identity. Never inspect workspace Git remotes. */
declare const __MEMOIR_PACKAGE_INFO__: { version: string; hostRange: string; sdkBaseline: string }
const repository = 'https://github.com/Qinling-Melon-Farmers/dsh-memoir'

export function MemoirAbout({ t }: { t: (key: string) => string }) {
  return <details className="memoir-about memoir-surface-card" data-dsh-part="about">
    <summary>{t('about.title')}</summary>
    <div className="memoir-about-body">
      <strong>dsh-memoir <span>v{__MEMOIR_PACKAGE_INFO__.version}</span></strong>
      <p>{t('sidebar.description')}</p>
      <dl>
        <dt>{t('about.host')}</dt><dd>{__MEMOIR_PACKAGE_INFO__.hostRange}</dd>
        <dt>{t('about.baseline')}</dt><dd>{__MEMOIR_PACKAGE_INFO__.sdkBaseline}</dd>
        <dt>{t('about.maintainer')}</dt><dd>Qinling-Melon-Farmers</dd>
      </dl>
      <p>{t('about.repositoryNote')}</p>
      <nav className="memoir-about-links" aria-label={t('about.links')}>
        <a href={repository} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Qinling-Melon-Farmers/dsh-memoir</a>
        <a href={`${repository}/blob/main/${t('about.readmeFile')}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('about.docs')}</a>
        <a href={`${repository}/releases`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('about.releases')}</a>
        <a href={`${repository}/issues`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('about.issues')}</a>
      </nav>
      <p className="memoir-about-note">{t('about.updates')}</p>
    </div>
  </details>
}
