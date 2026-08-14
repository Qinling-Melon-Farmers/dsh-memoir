/**
 * Browser-half entry for the dsh-memoir plugin — runs inside the dsh web GUI.
 * Mounts the sidebar entry row (toggles the panel) and the memoir panel in
 * the center column, bound to the active session's workspace. Failure policy:
 * DOM mounting problems are logged, never thrown — the web shell fails the
 * whole boot when a plugin apply throws, and an external plugin must not take
 * the GUI down.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { PanelController } from './controller.js'
import { MemoirApi } from './api.js'
import { createCwdTracker } from './cwd.js'
import { makeT } from './i18n.js'
import { PANEL_CSS } from './styles.js'
import { mountSidebarEntry } from './sidebar-entry.js'
import { mountPanel } from './mount.jsx'

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['sessions']

/** Inject the panel stylesheet once (the loader removes plugin-owned tags on unload). */
function injectStyles(): void {
  if (document.querySelector('style[data-plugin="dsh-memoir"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-memoir'
  tag.textContent = PANEL_CSS
  document.head.appendChild(tag)
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
    injectStyles()
    disposers.push(mountSidebarEntry(controller, t))
    disposers.push(mountPanel(controller, api, cwdTracker, t))
  } catch (error) {
    // DOM failures degrade the panel, never the GUI.
    console.warn('[dsh-memoir] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-memoir: ui mounts')
}
