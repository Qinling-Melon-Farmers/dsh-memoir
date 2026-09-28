/** Offline release notice state. This key stores no workspace or memory data. */
export const ANNOUNCEMENT_VERSION = '0.9.0'
export const ANNOUNCEMENT_KEY = 'dsh-memoir:announcement:last-acknowledged'
const EVENT = 'dsh-memoir:announcement-acknowledged'
const acknowledged = new WeakMap<Window, string>()

export function hasAcknowledged(target: Window, version = ANNOUNCEMENT_VERSION): boolean {
  if (acknowledged.get(target) === version) return true
  try { return target.localStorage.getItem(ANNOUNCEMENT_KEY) === version } catch { return false }
}

export function acknowledgeAnnouncement(target: Window, version = ANNOUNCEMENT_VERSION): void {
  acknowledged.set(target, version)
  try { target.localStorage.setItem(ANNOUNCEMENT_KEY, version) } catch { /* Page-only fallback. */ }
  const event = target.document.createEvent('Event')
  event.initEvent(EVENT, false, false)
  target.dispatchEvent(event)
}

export function subscribeAnnouncement(target: Window, notify: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key !== ANNOUNCEMENT_KEY && event.key !== null) return
    acknowledged.delete(target)
    notify()
  }
  target.addEventListener(EVENT, notify)
  target.addEventListener('storage', storage)
  return () => {
    target.removeEventListener(EVENT, notify)
    target.removeEventListener('storage', storage)
  }
}
