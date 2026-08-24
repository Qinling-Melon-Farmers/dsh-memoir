import type { PanelController } from './controller.js'

export const MEMOIR_ACTIVE_ATTR = 'data-dsh-memoir-active'
export const PANEL_ACTIVATE_EVENT = 'dsh-panel-activate'
export const MEMOIR_PANEL_NAME = 'memoir'

const SIBLING_ATTRS = ['data-dsh-ssh-active', 'data-dsh-taskboard-active']

/**
 * Bind Memoir's controller to the shared dsh-web-ui panel activation protocol.
 * Opening emits only Memoir's own identity; broadcasting sibling identities
 * here would re-enter this listener and close the controller that just opened.
 */
export function bindPanelActivation(controller: PanelController, target: Document = document): () => void {
  const applyActive = (): void => {
    if (controller.getSnapshot().panelOpen) {
      for (const attr of SIBLING_ATTRS) target.documentElement.removeAttribute(attr)
      target.documentElement.setAttribute(MEMOIR_ACTIVE_ATTR, '')
      const EventCtor = target.defaultView?.CustomEvent ?? CustomEvent
      target.dispatchEvent(new EventCtor(PANEL_ACTIVATE_EVENT, { detail: MEMOIR_PANEL_NAME }))
    } else {
      target.documentElement.removeAttribute(MEMOIR_ACTIVE_ATTR)
    }
  }

  const onOtherActivate = (event: Event): void => {
    const detail = (event as CustomEvent).detail as string | undefined
    if (typeof detail === 'string' && detail !== MEMOIR_PANEL_NAME && controller.getSnapshot().panelOpen) {
      controller.close()
    }
  }

  target.addEventListener(PANEL_ACTIVATE_EVENT, onOtherActivate)
  const unsubscribe = controller.subscribe(applyActive)
  applyActive()

  return () => {
    target.removeEventListener(PANEL_ACTIVATE_EVENT, onOtherActivate)
    unsubscribe()
    target.documentElement.removeAttribute(MEMOIR_ACTIVE_ATTR)
  }
}
