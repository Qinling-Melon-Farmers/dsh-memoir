/**
 * Panel view mounting (the dsh-ssh / task-board center-column precedent).
 * The panel takes over the center column at the DOM level: a container is
 * appended inside the center-column grid item and a stylesheet rule hides
 * the conversation content while the panel is active. Toggling is a data
 * attribute on <html> — the conversation subtree stays mounted.
 *
 * Center-column selector: the legacy shell exposed
 * [data-pane="conversation"]; current shells render the frame with CSS
 * modules ([hash]_centerCol). Both are matched so the panel mounts on the
 * source-run shell and older builds alike.
 *
 * Cross-plugin coordination: opening this panel evicts the sibling panels'
 * visibility attributes (data-dsh-ssh-active / data-dsh-taskboard-active)
 * and dispatches the shared `dsh-panel-activate` event; it closes itself when
 * a sibling dispatches its own activation.
 */

import { createRoot, type Root } from 'react-dom/client'
import { MemoirPanel } from './panel.jsx'
import type { MemoirApi } from './api.js'
import type { CwdTracker } from './cwd.js'
import type { PanelController } from './controller.js'
import { bindPanelActivation } from './panel-activation.js'

/** The injected panel container (kept in the DOM, hidden when inactive). */
export const PANEL_VIEW_SELECTOR = '[data-dsh-memoir-view]'

const CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]'

/** Find the center column, or undefined while the frame is not mounted. */
function conversationColumn(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(CONVERSATION_COLUMN_SELECTOR) ?? undefined
}

/**
 * Mount the panel React tree into the center column and bind its visibility
 * to the controller's panelOpen state.
 * @param controller - the panel controller driving the view.
 * @param api - the memoir API client the panel operates through.
 * @param cwdTracker - the active-workspace tracker (useSyncExternalStore-compatible).
 * @param t - the bound translator.
 * @returns disposer unmounting the tree and restoring the column.
 */
export function mountPanel(
  controller: PanelController,
  api: MemoirApi,
  cwdTracker: CwdTracker,
  t: (key: string) => string,
): () => void {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  const ensure = (): void => {
    if (container !== undefined) {
      if (container.isConnected) return
      root?.unmount()
      root = undefined
      container.remove()
      container = undefined
    }
    const column = conversationColumn()
    if (column === undefined) return
    container = document.createElement('div')
    container.dataset.dshMemoirView = ''
    container.dataset.dshPlugin = 'memoir'
    container.dataset.dshPart = 'panel-host'
    column.appendChild(container)
    root = createRoot(container)
    root.render(<MemoirPanel controller={controller} api={api} cwdTracker={cwdTracker} t={t} />)
  }

  // The frame mounts after boot settlement; watch for the column's arrival.
  const waitObserver = new MutationObserver(() => {
    ensure()
  })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  // Hand the center column back to the conversation on sidebar context clicks.
  const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
  const onClickSidebarRow = (event: MouseEvent): void => {
    if (!controller.getSnapshot().panelOpen) return
    const target = event.target as HTMLElement | null
    if (target === null || typeof target.closest !== 'function') return
    if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close()
  }

  document.addEventListener('click', onClickSidebarRow, true)
  const disposeActivation = bindPanelActivation(controller)
  ensure()

  return () => {
    document.removeEventListener('click', onClickSidebarRow, true)
    waitObserver.disconnect()
    disposeActivation()
    root?.unmount()
    root = undefined
    container?.remove()
    container = undefined
  }
}
