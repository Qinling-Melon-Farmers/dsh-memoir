import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'

declare const __MEMOIR_PACKAGE_INFO__: { version: string }
import { PluginUpdateStatus } from './plugin-update-status.js'
import type { State } from './plugin-update-status.js'
export { PluginUpdateStatus } from './plugin-update-status.js'

export const UpdateContext = createContext<PluginUpdateStatus | null>(null)
const empty: State = { phase: 'unavailable' }
const noopSubscribe = (): (() => void) => () => {}
const emptySnapshot = (): State => empty
export function UpdateNotice({ t }: { t: (key: string) => string }) {
  const status = useContext(UpdateContext)
  const update = useSyncExternalStore(status?.subscribe ?? noopSubscribe, status?.getSnapshot ?? emptySnapshot)
  useEffect(() => { if (update.phase === 'idle') void status?.check() }, [status, update.phase])
  return <div className="memoir-plugin-guide-row" data-dsh-part="update-status">
    <span role="status">{t(`update.${update.phase}`)}{update.version ? ` · ${update.version}` : ''}</span>
    {update.phase !== 'unavailable' && <button className="memoir-guide-settings" disabled={update.phase === 'checking'} onClick={() => { void status?.check(true) }}>{t('update.check')}</button>}
  </div>
}

export function createPluginUpdates(ctx: Context): PluginUpdateStatus {
  const status = new PluginUpdateStatus(__MEMOIR_PACKAGE_INFO__.version)
  ctx.effect(() => {
    const watcher = ctx.inject(['remote', 'remote.pluginManager'], optional => {
      optional.effect(() => { status.setManager(optional.remote.pluginManager); return () => status.setManager() })
    })
    return () => watcher.dispose()
  }, 'dsh-memoir: optional host update checks')
  return status
}
