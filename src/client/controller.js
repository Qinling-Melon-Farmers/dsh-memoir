/**
 * Panel open/close state machine — pure, no DOM, unit-testable. Mirrors the
 * sibling panel controllers: a snapshot + subscribe contract drives the
 * sidebar entry highlight and the panel visibility attributes.
 */

export class PanelController {
  constructor() {
    this.state = { panelOpen: false }
    this.listeners = new Set()
  }

  /** The current immutable snapshot. */
  getSnapshot() {
    return this.state
  }

  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  open() {
    this.patch({ panelOpen: true })
  }

  close() {
    this.patch({ panelOpen: false })
  }

  toggle() {
    this.patch({ panelOpen: !this.state.panelOpen })
  }

  /** Replace the snapshot; notifies only when the observable state changed. */
  patch(next) {
    const prev = this.state
    this.state = { ...prev, ...next }
    if (this.state.panelOpen === prev.panelOpen) return
    for (const listener of [...this.listeners]) listener()
  }
}
