export type State = { phase: 'unavailable' | 'idle' | 'checking' | 'unknown' | 'current' | 'available' | 'incompatible'; version?: string }
// Structural subset of the public remote contract: older supported SDKs do
// not declare listVersions. Feature-detect it without requiring newer types.
type Version = { version: string; prerelease?: boolean; deprecated?: unknown; bundle?: unknown; incompatible?: unknown }
type Response = { ok: boolean; value?: { status: string; installed?: string; versions: Version[] } }
type Manager = { listVersions(name: string, options: Record<string, never>): Promise<Response> }

/** Browser-only status: the native host owns version ordering and compatibility. */
export class PluginUpdateStatus {
  private manager?: Manager
  private generation = 0
  private pending?: Promise<void>
  private checkedAt = 0
  private value: State = { phase: 'unavailable' }
  private listeners = new Set<() => void>()
  private installedVersion: string
  constructor(installedVersion: string) { this.installedVersion = installedVersion }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = (): State => this.value
  private emit(value: State): void { this.value = value; for (const listener of this.listeners) listener() }
  setManager(candidate?: unknown): void {
    const manager = candidate && typeof (candidate as Partial<Manager>).listVersions === 'function' ? candidate as Manager : undefined
    this.generation++; this.manager = manager; this.pending = undefined; this.checkedAt = 0
    this.emit({ phase: manager ? 'idle' : 'unavailable' })
  }
  check = (force = false): Promise<void> => {
    if (!this.manager) return Promise.resolve()
    if (this.pending) return this.pending
    if (!force && this.checkedAt && Date.now() - this.checkedAt < 15 * 60_000) return Promise.resolve()
    const manager = this.manager, generation = this.generation
    this.emit({ phase: 'checking' })
    this.pending = (async () => {
      try {
        const response = await manager.listVersions('dsh-memoir', {})
        if (generation !== this.generation) return
        const list = response.ok ? response.value : undefined
        if (list?.status !== 'listed' || list.installed !== this.installedVersion) { this.emit({ phase: 'unknown' }); return }
        const stable = list.versions.filter(v => !v.prerelease && !v.deprecated && v.bundle)
        const compatible = stable.find(v => !v.incompatible)
        this.emit({ phase: compatible ? 'available' : stable.length ? 'incompatible' : 'current', version: (compatible ?? stable[0])?.version })
        this.checkedAt = Date.now()
      } catch { if (generation === this.generation) this.emit({ phase: 'unknown' }) }
      finally { if (generation === this.generation) this.pending = undefined }
    })()
    return this.pending
  }
}
