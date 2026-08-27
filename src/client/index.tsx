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
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const observer = new MutationObserver(() => setLanguage(document.documentElement.lang))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])
  return (
    <li className={`memoir-settings-slot${open ? ' memoir-settings-slot-open' : ''}`} data-dsh-plugin="memoir" data-dsh-part="settings-card">
      <button
        type="button"
        className="memoir-settings-slot-header"
        aria-expanded={open}
        aria-label={`${t(open ? 'settings.collapse' : 'settings.expand')}: ${t('settings.title')}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="memoir-settings-slot-headtext">
          <span className="memoir-settings-slot-name" title={t('settings.title')}>{t('settings.title')}</span>
          <span className="memoir-settings-slot-description" title={t('settings.description')}>{t('settings.description')}</span>
        </span>
        <svg className={`memoir-settings-slot-chevron${open ? ' memoir-settings-slot-chevron-open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" fill="currentColor" />
        </svg>
      </button>
      {open
        ? <div className="memoir-settings-slot-body">
            <MemoirSettingsPanel
              api={api}
              t={t}
              refreshKey={refreshKey}
              onChanged={() => setRefreshKey((value) => value + 1)}
              alwaysOpen
              showDescription={false}
            />
          </div>
        : null}
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
    disposers.push(mountPanel(controller, api, cwdTracker, t, (sessionId, turnId) => {
      try {
        ctx.sessions.open(sessionId as Parameters<typeof ctx.sessions.open>[0])
      } catch (error) {
        console.warn('[dsh-memoir] source session is unavailable:', error)
        return
      }
      controller.close()
      if (turnId === undefined) return
      const reveal = () => document.querySelector<HTMLElement>(`[data-turn-tail="${turnId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setTimeout(reveal, 0)
      setTimeout(reveal, 250)
    }))
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
