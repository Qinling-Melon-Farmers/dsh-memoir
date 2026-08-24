/**
 * Sidebar entry injection (the dsh-ssh / task-board DOM-level precedent: the
 * shipped sidebar shell exposes no registration slot for these family
 * plugins). The row is plain DOM — React never manages it — and self-heals
 * through a MutationObserver when the shell re-renders. It is placed after
 * the family block ([data-dsh-taskboard-entry], [data-dsh-ssh-entry]) so the
 * three sibling entries keep a stable order.
 */

import type { PanelController } from './controller.js'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-memoir-entry]'

/** Inline icon: the memoir open-book glyph, distinct from the dsh-skill-explorer book. */
const ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.5c-1.6-1-3.6-1-5.2-.2-.5.3-.8.9-.8 1.4v8.6c0 .5.5.9 1 .7C4.6 13.4 6.4 13.5 8 14.5c1.6-1 3.4-1.1 5-.5.5.2 1-.2 1-.7V4.7c0-.5-.3-1.1-.8-1.4-1.6-.8-3.6-.8-5.2.2z"/><path d="M8 3.5v11"/></svg>'

const FAMILY_SELECTOR = '[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-memoir-entry]'

/** Find the sidebar shell root element, or undefined while not yet mounted. */
function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  return logoOwner ?? (column.firstElementChild as HTMLElement | undefined)
}

/** The New Session button: nested in the logo row on current shells. */
function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const nested = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child as HTMLButtonElement
  }
  return undefined
}

/** Build the entry row (a detached button; inserted once the shell is up). */
function createEntry(controller: PanelController, t: (key: string) => string): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshMemoirEntry = ''
  entry.dataset.dshPlugin = 'memoir'
  entry.dataset.dshPart = 'sidebar-entry'
  entry.className = 'memoir-entry-row'
  entry.innerHTML = '<span class="memoir-entry-icon">' + ICON + '</span><span class="memoir-entry-label"></span>'
  const syncCopy = (): void => {
    const label = t('entry.label')
    entry.setAttribute('aria-label', label)
    entry.setAttribute('title', t('entry.tooltip'))
    const text = entry.querySelector<HTMLElement>('.memoir-entry-label')
    if (text !== null) text.textContent = label
  }
  syncCopy()
  const languageObserver = new MutationObserver(syncCopy)
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
  entry.addEventListener('click', () => {
    controller.toggle()
  })
  Object.defineProperty(entry, '__memoirDisposeLanguage', { value: () => languageObserver.disconnect() })
  return entry
}

/**
 * Re-insert the entry after the sibling family block (stable relative order).
 * @returns true when the entry is placed.
 */
function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  const button = newSessionButton(root)
  if (button === undefined) return false
  if (entry.parentElement !== root) {
    const row = button.closest('[class*="logoRow"]')
    const base = row !== null && row.parentElement === root ? row : button
    const family = Array.from(root.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.matches(FAMILY_SELECTOR),
    )
    // memoir sits after the whole family block.
    const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling
    root.insertBefore(entry, anchor)
  }
  return true
}

/**
 * Mount the sidebar entry, waiting for the shell and self-healing on re-renders.
 * @param controller - the panel controller the entry toggles.
 * @param t - the bound translator.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(controller: PanelController, t: (key: string) => string): () => void {
  if (document.querySelector(ENTRY_SELECTOR) !== null) return () => {}
  const entry = createEntry(controller, t)
  let root: HTMLElement | undefined
  let placed = false

  const tryPlace = (): void => {
    if (root !== undefined && !root.isConnected) {
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    if (placed) {
      if (document.body.contains(entry)) return
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeEntry(root, entry)
    if (placed) {
      rootObserver.observe(root, { childList: true, subtree: true })
    }
  }

  const waitObserver = new MutationObserver(() => {
    tryPlace()
  })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    if (!root.contains(entry)) {
      placed = placeEntry(root, entry)
    }
  })

  const unsubscribe = controller.subscribe(() => {
    if (controller.getSnapshot().panelOpen) entry.dataset.active = 'true'
    else delete entry.dataset.active
  })
  if (controller.getSnapshot().panelOpen) entry.dataset.active = 'true'

  tryPlace()

  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    unsubscribe()
    ;(entry as HTMLButtonElement & { __memoirDisposeLanguage?: () => void }).__memoirDisposeLanguage?.()
    entry.remove()
  }
}
