import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { ANNOUNCEMENT_KEY, ANNOUNCEMENT_VERSION, acknowledgeAnnouncement, hasAcknowledged, subscribeAnnouncement } from '../src/client/announcement.ts'

test('release notices require explicit acknowledgment, persist, and distinguish new versions', () => {
  const dom = new JSDOM('', { url: 'http://localhost' })
  const target = dom.window as unknown as Window
  try {
    assert.equal(hasAcknowledged(target), false)
    assert.equal(target.localStorage.length, 0, 'reading does not mark as seen')
    acknowledgeAnnouncement(target)
    assert.equal(hasAcknowledged(target), true)
    assert.equal(target.localStorage.getItem(ANNOUNCEMENT_KEY), ANNOUNCEMENT_VERSION)
    assert.equal(hasAcknowledged(target, '0.9.2'), false)
    const restarted = new JSDOM('', { url: 'http://localhost' })
    try {
      restarted.window.localStorage.setItem(ANNOUNCEMENT_KEY, '0.9.0')
      assert.equal(hasAcknowledged(restarted.window as unknown as Window), false, 'acknowledging 0.9.0 does not hide the recovery warning')
      restarted.window.localStorage.setItem(ANNOUNCEMENT_KEY, ANNOUNCEMENT_VERSION)
      assert.equal(hasAcknowledged(restarted.window as unknown as Window), true)
    } finally { restarted.window.close() }
  } finally { dom.window.close() }
})

test('notice acknowledgment coordinates instances and cleans up listeners', () => {
  const dom = new JSDOM('', { url: 'http://localhost' })
  const target = dom.window as unknown as Window
  let first = 0, second = 0
  try {
    const offFirst = subscribeAnnouncement(target, () => first++)
    const offSecond = subscribeAnnouncement(target, () => second++)
    acknowledgeAnnouncement(target)
    assert.deepEqual([first, second], [1, 1])
    offFirst()
    target.localStorage.removeItem(ANNOUNCEMENT_KEY)
    dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: ANNOUNCEMENT_KEY }))
    assert.equal(hasAcknowledged(target), false)
    assert.deepEqual([first, second], [1, 2])
    offSecond()
    acknowledgeAnnouncement(target)
    assert.deepEqual([first, second], [1, 2])
  } finally { dom.window.close() }
})

test('blocked local storage falls back to page-only acknowledgment without throwing', () => {
  const dom = new JSDOM('') // Opaque origin: storage throws SecurityError.
  const target = dom.window as unknown as Window
  try {
    assert.equal(hasAcknowledged(target), false)
    assert.doesNotThrow(() => acknowledgeAnnouncement(target))
    assert.equal(hasAcknowledged(target), true)
  } finally { dom.window.close() }
})
