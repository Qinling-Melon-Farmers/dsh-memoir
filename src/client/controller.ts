/**
 * Panel open/close state machine — pure, no DOM, unit-testable. Mirrors the
 * sibling panel controllers: a snapshot + subscribe contract drives the
 * sidebar entry highlight and the panel visibility attributes.
 */

export interface PanelSnapshot {
  panelOpen: boolean
}

export class PanelController {
  private state: PanelSnapshot = { panelOpen: false }
  private listeners = new Set<() => void>()

  /** The current immutable snapshot. */
  getSnapshot(): PanelSnapshot {
    return this.state
  }

  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  open(): void {
    this.patch({ panelOpen: true })
  }

  close(): void {
    this.patch({ panelOpen: false })
  }

  toggle(): void {
    this.patch({ panelOpen: !this.state.panelOpen })
  }

  /** Replace the snapshot; notifies only when the observable state changed. */
  private patch(next: Partial<PanelSnapshot>): void {
    const prev = this.state
    this.state = { ...prev, ...next }
    if (this.state.panelOpen === prev.panelOpen) return
    for (const listener of [...this.listeners]) listener()
  }
}
