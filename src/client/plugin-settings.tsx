import type { Context } from '@deepseek-ai/cordis'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { useEffect, useState } from 'react'
import type { MemoirApi } from './api.js'
import { MemoirAbout } from './about.js'
import { MemoirSettingsPanel } from './panel.js'

/** Native bundle page, not an official-plugin impostor or a second settings store. */
function PluginSettings({ api, t }: { api: MemoirApi; t: (key: string) => string }) {
  const [revision, refresh] = useState(0)
  const [, languageChanged] = useState(0)
  useEffect(() => {
    const observer = new MutationObserver(() => languageChanged(value => value + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])
  return <div className="memoir-plugin-settings" data-dsh-plugin="memoir" data-dsh-part="plugin-settings">
    <MemoirAbout t={t} />
    <MemoirSettingsPanel api={api} t={t} refreshKey={revision} onChanged={() => refresh(value => value + 1)} alwaysOpen />
  </div>
}

/** Wait for the public slot owner; missing/reloaded plugin manager cannot block Memoir. */
export function watchPluginSettings(ctx: Context, api: MemoirApi, t: (key: string) => string): () => void {
  return ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: 'dsh-memoir',
  }, ({ view }: PluginConfigViewProps) => view === 'summary'
    ? <>{t('sidebar.description')}</>
    : <PluginSettings api={api} t={t} />))
}
