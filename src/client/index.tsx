/**
 * Browser-half entry for the dsh-memoir plugin — runs inside the dsh web GUI.
 * Mounts the sidebar entry row (toggles the panel) and the memoir panel in
 * the center column, bound to the active session's workspace. Failure policy:
 * DOM mounting problems are logged, never thrown — the web shell fails the
 * whole boot when a plugin apply throws, and an external plugin must not take
 * the GUI down.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useState } from 'react'
import { PanelController } from './controller.js'
import { MemoirApi } from './api.js'
import { createCwdTracker } from './cwd.js'
import { makeT } from './i18n.js'
import { mountPanelStyles } from './styles.js'
import { mountSidebarEntry } from './sidebar-entry.js'
import { mountPanel } from './mount.jsx'
import { MemoirSettingsPanel } from './panel.jsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Optional dsh-web-ui group slot for external plugin settings cards. */
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin settings card; the group supplies no values. */
export interface SettingsPluginItemOwnerProps {
  children?: never
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['sessions', 'slots']

function SettingsSlotCard({ api, t }: { api: MemoirApi; t: (key: string) => string }) {
  const [, setLanguage] = useState(document.documentElement.lang)
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    const observer = new MutationObserver(() => setLanguage(document.documentElement.lang))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])
  return (
    <li className="memoir-settings-slot" data-dsh-plugin="memoir" data-dsh-part="settings-card">
      <MemoirSettingsPanel
        api={api}
        t={t}
        refreshKey={refreshKey}
        onChanged={() => setRefreshKey((value) => value + 1)}
        defaultOpen
      />
    </li>
  )
}

/**
 * Mount the memoir panel.
 * @param ctx - client root context (sessions service).
 */
export function apply(ctx: ClientContext): void {
  const t = makeT(document)
  const disposers: Array<() => void> = []
  try {
    const controller = new PanelController()
    const api = new MemoirApi()
    const cwdTracker = createCwdTracker(ctx.sessions)
    disposers.push(mountPanelStyles())
    disposers.push(mountSidebarEntry(controller, t))
    disposers.push(mountPanel(controller, api, cwdTracker, t))
    disposers.push(ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
      name: 'web-ui.plugin.item',
      id: 'memoir',
      order: 130,
    }, () => <SettingsSlotCard api={api} t={t} />)))
  } catch (error) {
    // DOM failures degrade the panel, never the GUI.
    console.warn('[dsh-memoir] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-memoir: ui mounts')
}
