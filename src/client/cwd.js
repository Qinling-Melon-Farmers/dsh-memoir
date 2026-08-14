/**
 * Workspace tracker: projects the client sessions service's active session
 * cwd into a useSyncExternalStore-compatible subscription. Pure logic — the
 * sessions service is injected, unit-testable with a mock.
 */

/** Read the active session's cwd from a sessions service snapshot ('' when none). */
export function readCwd(sessions) {
  const snapshot = sessions.list.getSnapshot()
  const id = snapshot.current
  const cwd = id === undefined ? undefined : snapshot.byId[id] && snapshot.byId[id].cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : ''
}

/**
 * Build a { getSnapshot, subscribe } tracker over the sessions service.
 * @param sessions - the client sessions service (with `list.getSnapshot` and
 *   `list.subscribe`).
 */
export function createCwdTracker(sessions) {
  let current = readCwd(sessions)
  const listeners = new Set()
  const tracker = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      const dispose = sessions.list.subscribe(() => {
        const next = readCwd(sessions)
        if (next === current) return
        current = next
        for (const l of [...listeners]) l()
      })
      return () => {
        listeners.delete(listener)
        dispose()
      }
    },
  }
  return tracker
}
